<template>
  <GamesDialog :open="open" title="Deploy a server" icon="plus" wide :confirm-label="deploying ? 'Deploying…' : 'Deploy'" :busy="deploying" :disabled="!ready" @close="emit('close')" @confirm="deploy">
    <div class="kgx-deploy">
      <div class="kgx-deploy__pick">
        <div class="kgx-deploy__games" role="radiogroup" aria-label="Game">
          <button v-for="g in games" :key="g.gameType" class="kgx-gamecard" role="radio" :aria-checked="game === g.gameType" :disabled="!g.implemented" :style="{ '--g': kgGame(g.gameType).accent }" :data-testid="`deploy-game-${g.gameType}`" @click="pickGame(g)">
            <GamesGlyph :game="g.gameType" size="lg" />
            <span class="kgx-gamecard__name">{{ kgGame(g.gameType).label }}</span>
            <span class="kgx-gamecard__sub">{{ g.implemented ? `${g.protocol} ${g.defaultPort}` : 'coming later' }}</span>
          </button>
          <p v-if="!games.length" class="kgx-hint">{{ gamesError ?? 'Loading games…' }}</p>
        </div>

        <div v-if="info && info.flavors.length > 1" class="kgx-field">
          <span>Server type</span>
          <div class="kgx-seg kgx-seg--fill" role="group" aria-label="Server type">
            <button v-for="f in info.flavors" :key="f" class="kgx-seg__opt" :aria-pressed="flavor === f" :data-testid="`deploy-flavor-${f}`" @click="pickFlavor(f)">{{ f === 'TModLoader' ? 'tModLoader' : f }}</button>
          </div>
          <small>{{ flavorHint }}</small>
        </div>

        <label class="kgx-field">
          <span>Version</span>
          <select v-model="version" :disabled="loadingVersions || !versions.length" data-testid="deploy-version">
            <option v-if="loadingVersions" value="">Loading versions…</option>
            <option v-for="(v, i) in versions" :key="v.Version" :value="v.Version">{{ v.Version }}{{ i === 0 ? '  (latest)' : '' }}{{ v.LatestLoaderVersion ? `  · loader ${v.LatestLoaderVersion}` : '' }}</option>
          </select>
          <small v-if="versionsError" data-tone="crit">{{ versionsError }}</small>
        </label>

        <div v-if="info?.deployOptions?.length" class="kgx-deploy__opts">
          <label v-for="f in info.deployOptions" :key="f.Key" class="kgx-field">
            <span>{{ f.Label }}</span>
            <select v-if="f.Type === 'Dropdown'" v-model="options[f.Key]"><option v-for="o in f.Options" :key="o" :value="o">{{ o }}</option></select>
            <input v-else :value="options[f.Key]" @input="options[f.Key] = ($event.target as HTMLInputElement).value" :type="f.Type === 'Number' ? 'number' : (f.Key === 'password' ? 'password' : 'text')" :placeholder="f.Key === 'worldName' ? (name || 'World') : ''" />
            <small v-if="f.Description">{{ f.Description }}</small>
          </label>
        </div>
      </div>

      <div class="kgx-deploy__setup">
        <label class="kgx-field">
          <span>Name</span>
          <input v-model="name" maxlength="60" placeholder="My server" data-testid="deploy-name" />
          <small v-if="nameTaken" data-tone="warn">Another server already has this name.</small>
        </label>

        <label v-if="info?.usesMemoryLimit" class="kgx-field">
          <span>Memory <b class="kgx-num">{{ kgMb(ramMb) }}</b></span>
          <input v-model.number="ramMb" type="range" min="1024" max="16384" step="512" data-testid="deploy-ram" />
          <small :data-tone="headroom.tone">{{ headroom.text ? `${headroom.text} when it runs` : 'Most servers need 2–4 GB; modpacks 6 GB or more.' }}</small>
        </label>

        <label class="kgx-field">
          <span>Port</span>
          <input v-model="port" inputmode="numeric" :placeholder="`auto (${suggestedPort})`" data-testid="deploy-port" />
          <small :data-tone="portClash ? 'crit' : undefined">{{ portClash ? `${portClash} already uses this port.` : info?.gameType === 'Rust' ? `UDP, plus ${(Number(port) || suggestedPort) + 1} for the server browser.` : `Players join on klive.dev:${port || suggestedPort}.` }}</small>
        </label>

        <div class="kgx-deploy__checks">
          <label class="kgx-check"><input v-model="makePublic" type="checkbox" /><span>Public <span class="kgx-dim">(forward the port on the router)</span></span></label>
          <label class="kgx-check"><input v-model="startAfter" type="checkbox" /><span>Start once installed</span></label>
          <label class="kgx-check"><input v-model="dailyBackups" type="checkbox" data-testid="deploy-backups" /><span>Back up daily <span class="kgx-dim">(keeps the newest 7)</span></span></label>
          <label v-if="info?.usesMemoryLimit && flavor !== 'Vanilla'" class="kgx-check"><input v-model="useAikar" type="checkbox" /><span>Aikar's GC flags</span></label>
          <label v-if="info?.requiresEula" class="kgx-check" :data-tone="!eula ? 'warn' : undefined"><input v-model="eula" type="checkbox" data-testid="deploy-eula" /><span>I accept the <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noopener">Minecraft EULA</a></span></label>
        </div>

        <p class="kgx-deploy__summary">{{ summary }}</p>
        <p v-if="error" class="kgx-note" data-tone="crit"><GamesIcon name="alert" />{{ error }}</p>
      </div>
    </div>
  </GamesDialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { KliveGamesApi } from '~/composables/useKliveGames';
import { kgGame, kgHeadroom, kgMb, type KgGameInfo, type KgHost, type KgServer, type KgVersion } from '~/scripts/kliveGames';

const props = defineProps<{ open: boolean; api: KliveGamesApi; host: KgHost | null; servers: KgServer[] }>();
const emit = defineEmits<{ close: []; deployed: [id: string] }>();

const games = ref<KgGameInfo[]>([]);
const gamesError = ref<string | null>(null);
const game = ref('Minecraft');
const flavor = ref('Paper');
const versions = ref<KgVersion[]>([]);
const version = ref('');
const loadingVersions = ref(false);
const versionsError = ref<string | null>(null);
const name = ref('');
const ramMb = ref(4096);
const port = ref('');
const makePublic = ref(true);
const startAfter = ref(true);
const dailyBackups = ref(true);
const useAikar = ref(true);
const eula = ref(false);
const options = reactive<Record<string, string>>({});
const deploying = ref(false);
const error = ref<string | null>(null);

const info = computed(() => games.value.find(g => g.gameType === game.value) ?? null);

const flavorHint = computed(() => {
  if (game.value === 'Terraria') return flavor.value === 'TModLoader' ? 'Modded Terraria. Put .tmod files in Mods/ after it installs.' : 'The official dedicated server, no mods.';
  return ({
    Vanilla: 'The official Mojang server. No plugins or mods.',
    Paper: 'Fast, with Bukkit/Spigot plugins. The usual choice.',
    Fabric: 'A light mod loader. Put mods in mods/.',
    Forge: 'The classic modpack loader. Takes a few minutes to install.',
  } as Record<string, string>)[flavor.value] ?? '';
});

const used = computed(() => new Map(props.servers.flatMap(s => s.network.ports.map(p => [p.port, s.name] as [number, string]))));
const suggestedPort = computed(() => {
  let p = info.value?.defaultPort ?? 25565;
  const span = game.value === 'Rust' ? 2 : 1;
  while ([...Array(span).keys()].some(k => used.value.has(p + k))) p += span;
  return p;
});
const portClash = computed(() => {
  const n = Number(port.value);
  if (!n) return null;
  const span = game.value === 'Rust' ? 2 : 1;
  for (let k = 0; k < span; k++) if (used.value.has(n + k)) return used.value.get(n + k)!;
  return null;
});
const nameTaken = computed(() => props.servers.some(s => s.name.toLowerCase() === name.value.trim().toLowerCase() && s.gameType === game.value));
const headroom = computed(() => kgHeadroom(props.host, ramMb.value));

const ready = computed(() => !!info.value?.implemented && !!version.value && !!name.value.trim() && !loadingVersions.value && (!info.value?.requiresEula || eula.value) && !portClash.value && !deploying.value);

const summary = computed(() => {
  if (!info.value) return '';
  const bits = [kgGame(game.value).label, game.value === 'Rust' ? 'latest build' : `${flavor.value} ${version.value}`];
  if (info.value.usesMemoryLimit) bits.push(kgMb(ramMb.value));
  bits.push(`port ${port.value || suggestedPort.value}`);
  bits.push(makePublic.value ? 'public' : 'local only');
  if (dailyBackups.value) bits.push('daily backups');
  return bits.join(' · ');
});

async function loadGames() {
  if (games.value.length) return;
  const r = await props.api.getGames();
  if (!r.ok) { gamesError.value = r.error; return; }
  games.value = r.data.games ?? [];
  const first = games.value.find(g => g.gameType === game.value && g.implemented) ?? games.value.find(g => g.implemented);
  if (first) pickGame(first, true);
}

function pickGame(g: KgGameInfo, keepFlavor = false) {
  if (!g.implemented) return;
  game.value = g.gameType;
  if (!keepFlavor || !g.flavors.includes(flavor.value)) flavor.value = g.flavors.includes('Paper') ? 'Paper' : (g.flavors[0] ?? 'Vanilla');
  Object.keys(options).forEach(k => delete options[k]);
  (g.deployOptions ?? []).forEach(f => { options[f.Key] = f.Value ?? ''; });
  loadVersions();
}
function pickFlavor(f: string) { flavor.value = f; loadVersions(); }

let versionSeq = 0;
async function loadVersions() {
  const seq = ++versionSeq;
  loadingVersions.value = true;
  versionsError.value = null;
  versions.value = [];
  version.value = '';
  const r = await props.api.getVersions(game.value, flavor.value);
  if (seq !== versionSeq) return;
  loadingVersions.value = false;
  if (!r.ok) { versionsError.value = r.error; return; }
  versions.value = r.data.versions ?? [];
  version.value = versions.value[0]?.Version ?? '';
}

async function deploy() {
  if (!ready.value) return;
  deploying.value = true;
  error.value = null;
  const r = await props.api.create({
    name: name.value.trim(),
    gameType: game.value,
    flavor: flavor.value,
    version: version.value,
    port: Number(port.value) || 0,
    ramMb: ramMb.value,
    useAikarFlags: useAikar.value,
    public: makePublic.value,
    autoStart: false,
    startAfterCreate: startAfter.value,
    eulaAccepted: info.value?.requiresEula ? eula.value : true,
    options: { ...options },
    backupEveryHours: dailyBackups.value ? 24 : 0,
    backupKeep: 7,
  });
  deploying.value = false;
  if (!r.ok) { error.value = r.error; return; }
  const id = r.data?.server?.Id ?? r.data?.server?.id;
  if (id) emit('deployed', String(id));
  name.value = '';
  eula.value = false;
}

watch(() => props.open, open => { if (open) { error.value = null; loadGames(); } }, { immediate: true });
</script>
