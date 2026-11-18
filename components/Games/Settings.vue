<template>
  <div class="kgx-set" :data-dirty="changes.length || undefined">
    <p v-if="!canManage" class="kgx-note"><GamesIcon name="lock" />{{ needs.manage }} to change settings. You can still read them.</p>
    <p v-if="loadError" class="kgx-note" data-tone="crit"><GamesIcon name="alert" />{{ loadError }}</p>

    <section v-if="schema.length" class="kgx-card" aria-label="Game settings">
      <header class="kgx-card__head">
        <h2 class="kgx-card__title"><GamesIcon name="gamepad" />Game settings</h2>
        <span class="kgx-card__meta">{{ fileName }}</span>
        <div class="kgx-card__tools">
          <label class="kgx-set__find"><GamesIcon name="search" /><input v-model="find" type="search" placeholder="Find a setting" aria-label="Find a setting" data-testid="settings-find" /></label>
        </div>
      </header>
      <div v-for="cat in categories" :key="cat" class="kgx-set__group">
        <h3 class="kgx-set__cat">{{ cat }}</h3>
        <div class="kgx-set__grid">
          <label v-for="f in fieldsOf(cat)" :key="f.Key" class="kgx-field" :data-changed="isChanged(f.Key) || undefined" :data-testid="`cfg-${f.Key}`">
            <span :title="f.Key">{{ f.Label }}<i v-if="isChanged(f.Key)" class="kgx-changed" title="Changed"></i></span>
            <span v-if="f.Type === 'Boolean'" class="kgx-switch">
              <input type="checkbox" :checked="values[f.Key] === 'true'" :disabled="!canManage" @change="values[f.Key] = ($event.target as HTMLInputElement).checked ? 'true' : 'false'" />
              <i></i><span>{{ values[f.Key] === 'true' ? 'On' : 'Off' }}</span>
            </span>
            <select v-else-if="f.Type === 'Dropdown'" v-model="values[f.Key]" :disabled="!canManage">
              <option v-if="values[f.Key] && !(f.Options ?? []).includes(values[f.Key])" :value="values[f.Key]">{{ values[f.Key] }}</option>
              <option v-for="o in f.Options" :key="o" :value="o">{{ o }}</option>
            </select>
            <!-- Not v-model: on a number input it yields a number, and these values are strings on both ends. -->
            <input v-else :value="values[f.Key]" :type="f.Type === 'Number' ? 'number' : (/password/i.test(f.Key) ? 'password' : 'text')" :disabled="!canManage" spellcheck="false" @input="values[f.Key] = ($event.target as HTMLInputElement).value" />
            <small v-if="f.Description">{{ f.Description }}</small>
          </label>
        </div>
      </div>
      <p v-if="!categories.length" class="kgx-empty">No setting matches “{{ find }}”.</p>
    </section>

    <div class="kgx-set__cols">
      <section class="kgx-card" aria-label="Runtime">
        <header class="kgx-card__head"><h2 class="kgx-card__title"><GamesIcon name="cpu" />Runtime</h2></header>
        <div class="kgx-set__stack">
          <template v-if="usesMemory">
            <label class="kgx-field" :data-changed="ram !== base.ram || undefined">
              <span>Memory <b class="kgx-num">{{ kgMb(ram) }}</b><i v-if="ram !== base.ram" class="kgx-changed"></i></span>
              <input v-model.number="ram" type="range" min="1024" max="16384" step="512" :disabled="!canManage" data-testid="cfg-ram" />
              <small :data-tone="headroom.tone">{{ headroom.text ? `${kgMb(ram)} ${headroom.text}${live ? ' (once restarted)' : ' when it runs'}` : '' }}</small>
            </label>
            <label class="kgx-field" :data-changed="jvmArgs !== base.jvmArgs || undefined">
              <span>Extra JVM arguments</span>
              <input v-model="jvmArgs" placeholder="none" spellcheck="false" class="kgx-mono" :disabled="!canManage" />
            </label>
            <label class="kgx-check"><input v-model="useAikarFlags" type="checkbox" :disabled="!canManage" /><span>Aikar's GC flags <span class="kgx-dim">(steadier pauses on big servers)</span></span></label>
          </template>
          <label class="kgx-check"><input v-model="autoRestart" type="checkbox" :disabled="!canManage" /><span>Restart after a crash <span class="kgx-dim">(up to 3 times in 5 minutes)</span></span></label>
          <label class="kgx-check"><input v-model="autoStart" type="checkbox" :disabled="!canManage" /><span>Start when Omnipotent starts</span></label>
        </div>
      </section>

      <section class="kgx-card" aria-label="Network">
        <header class="kgx-card__head"><h2 class="kgx-card__title"><GamesIcon name="globe" />Network</h2></header>
        <div class="kgx-set__stack">
          <label class="kgx-check">
            <input type="checkbox" :checked="server.isPublic" :disabled="!canManage || netBusy" data-testid="cfg-public" @change="togglePublic(($event.target as HTMLInputElement).checked)" />
            <span>Public: reachable at <b class="kgx-mono">klive.dev:{{ server.port }}</b> <span class="kgx-dim">(KliveGames asks the router to forward the ports)</span></span>
          </label>
          <ul class="kgx-ports">
            <li v-for="p in server.network.ports" :key="`${p.protocol}${p.port}`" class="kgx-fwd" :data-state="p.state === 'missing' && !live ? 'pending' : p.state"><i></i><span class="kgx-mono">{{ p.protocol }} {{ p.port }}</span><span class="kgx-dim">{{ p.purpose }}</span><span>{{ portWord(p.state) }}</span></li>
          </ul>
          <p class="kgx-hint">Change the port under Game settings{{ server.gameType === 'Rust' ? ' (the browser port follows it, +1)' : '' }}.</p>
        </div>
      </section>

      <section class="kgx-card" aria-label="Name">
        <header class="kgx-card__head"><h2 class="kgx-card__title"><GamesIcon name="pen" />Name</h2></header>
        <form class="kgx-set__rename" @submit.prevent="doRename">
          <input v-model="newName" :disabled="!canManage" maxlength="60" aria-label="Server name" data-testid="cfg-name" />
          <button class="kgx-btn kgx-btn--sm" :disabled="!canManage || !newName.trim() || newName.trim() === server.name">Rename</button>
        </form>
      </section>

      <section class="kgx-card kgx-set__danger" aria-label="Delete">
        <header class="kgx-card__head"><h2 class="kgx-card__title"><GamesIcon name="trash" />Delete this server</h2></header>
        <p class="kgx-hint">Stops it, removes its world, files and every backup ({{ server.storage ? kgBytes(server.storage.serverBytes + server.storage.backupBytes) : 'all of it' }}), and closes its router forwards.</p>
        <button class="kgx-btn kgx-btn--danger kgx-btn--sm" :disabled="!canManage" :title="canManage ? '' : needs.manage" data-testid="cfg-delete" @click="deleting = true"><GamesIcon name="trash" />Delete…</button>
      </section>
    </div>

    <div v-if="changes.length" class="kgx-savebar" data-testid="settings-savebar">
      <span><b class="kgx-num">{{ changes.length }}</b> unsaved change{{ changes.length === 1 ? '' : 's' }}<span class="kgx-dim"> · {{ changes.slice(0, 4).join(', ') }}{{ changes.length > 4 ? '…' : '' }}</span></span>
      <span v-if="live" class="kgx-dim">applies on the next restart</span>
      <span class="kgx-savebar__spacer"></span>
      <button class="kgx-btn kgx-btn--ghost kgx-btn--sm" @click="reset">Discard</button>
      <button v-if="live && canOperate" class="kgx-btn kgx-btn--sm" :disabled="saving" data-testid="settings-save-restart" @click="save(true)">Save &amp; restart</button>
      <button class="kgx-btn kgx-btn--go kgx-btn--sm" :disabled="saving || !canManage" data-testid="settings-save" @click="save(false)">{{ saving ? 'Saving…' : 'Save' }}</button>
    </div>

    <GamesDialog :open="deleting" :title="`Delete ${server.name}?`" icon="trash" tone="crit" confirm-label="Delete for good" :type-to-confirm="server.name" @close="deleting = false" @confirm="doDelete">
      <p>This removes the server, its world and <b>all {{ server.backups.count ?? '' }} backups</b>. It cannot be undone.</p>
    </GamesDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import type { KliveGamesApi } from '~/composables/useKliveGames';
import { kgBytes, kgHeadroom, kgMb, kgStatus, type KgConfigField, type KgHost, type KgPortState, type KgServer } from '~/scripts/kliveGames';

const props = defineProps<{
  server: KgServer;
  api: KliveGamesApi;
  host: KgHost | null;
  canManage: boolean;
  canOperate: boolean;
  needs: { manage: string };
}>();
const emit = defineEmits<{ deleted: [] }>();

const live = computed(() => kgStatus(props.server.status).live);
const schema = ref<KgConfigField[]>([]);
const values = reactive<Record<string, string>>({});
const loaded = reactive<Record<string, string>>({});
const loadError = ref<string | null>(null);
const usesMemory = ref(props.server.usesMemoryLimit);
const base = reactive({ ram: props.server.ramMb, jvmArgs: '', useAikarFlags: true, autoRestart: true, autoStart: false });
const ram = ref(props.server.ramMb);
const jvmArgs = ref('');
const useAikarFlags = ref(true);
const autoRestart = ref(true);
const autoStart = ref(false);
const saving = ref(false);
const find = ref('');
const newName = ref(props.server.name);
const netBusy = ref(false);
const deleting = ref(false);

const fileName = computed(() => (props.server.gameType === 'Minecraft' ? 'server.properties' : props.server.gameType === 'Terraria' ? 'serverconfig.txt' : 'server.cfg'));
const filtered = computed(() => {
  const words = find.value.toLowerCase();
  return schema.value.filter(f => !words || `${f.Label} ${f.Key} ${f.Description ?? ''}`.toLowerCase().includes(words));
});
const categories = computed(() => [...new Set(filtered.value.map(f => f.Category ?? 'General'))]);
const fieldsOf = (cat: string) => filtered.value.filter(f => (f.Category ?? 'General') === cat);
const isChanged = (key: string) => (values[key] ?? '') !== (loaded[key] ?? '');

const changes = computed(() => {
  const list = schema.value.filter(f => isChanged(f.Key)).map(f => f.Label);
  if (usesMemory.value && ram.value !== base.ram) list.push('memory');
  if (usesMemory.value && jvmArgs.value !== base.jvmArgs) list.push('JVM args');
  if (usesMemory.value && useAikarFlags.value !== base.useAikarFlags) list.push('Aikar flags');
  if (autoRestart.value !== base.autoRestart) list.push('restart after a crash');
  if (autoStart.value !== base.autoStart) list.push('start with Omnipotent');
  return list;
});

const headroom = computed(() => kgHeadroom(props.host, ram.value - (live.value ? props.server.ramMb : 0)));

async function load() {
  const r = await props.api.getConfig(props.server.id);
  if (!r.ok) { loadError.value = r.error; return; }
  loadError.value = null;
  schema.value = r.data.schema ?? [];
  Object.keys(values).forEach(k => delete values[k]);
  Object.keys(loaded).forEach(k => delete loaded[k]);
  schema.value.forEach(f => { values[f.Key] = f.Value ?? ''; loaded[f.Key] = f.Value ?? ''; });
  usesMemory.value = r.data.usesMemoryLimit !== false;
  Object.assign(base, { ram: r.data.ram, jvmArgs: r.data.jvmArgs ?? '', useAikarFlags: !!r.data.useAikarFlags, autoRestart: !!r.data.autoRestart, autoStart: !!r.data.autoStart });
  reset();
}

function reset() {
  schema.value.forEach(f => { values[f.Key] = loaded[f.Key] ?? ''; });
  ram.value = base.ram;
  jvmArgs.value = base.jvmArgs;
  useAikarFlags.value = base.useAikarFlags;
  autoRestart.value = base.autoRestart;
  autoStart.value = base.autoStart;
}

async function save(restart: boolean) {
  if (!props.canManage) return;
  saving.value = true;
  const changed: Record<string, string> = {};
  schema.value.forEach(f => { if (isChanged(f.Key)) changed[f.Key] = values[f.Key] ?? ''; });
  const body: Record<string, unknown> = { values: changed, autoRestart: autoRestart.value, autoStart: autoStart.value };
  if (usesMemory.value) Object.assign(body, { ram: ram.value, jvmArgs: jvmArgs.value, useAikarFlags: useAikarFlags.value });
  const r = await props.api.saveConfig(props.server.id, body);
  saving.value = false;
  if (!r.ok) return;
  await load();
  if (restart) props.api.lifecycle(props.server.id, 'restart');
}

async function togglePublic(value: boolean) {
  netBusy.value = true;
  await props.api.setPublic(props.server.id, value);
  netBusy.value = false;
}

async function doRename() {
  const name = newName.value.trim();
  if (!name || name === props.server.name) return;
  await props.api.rename(props.server.id, name);
}

async function doDelete() {
  deleting.value = false;
  const r = await props.api.lifecycle(props.server.id, 'delete');
  if (r.ok) emit('deleted');
}

function portWord(state: KgPortState) {
  return ({ forwarded: 'forwarded', missing: live.value ? 'not forwarded' : 'forwarded when it starts', elsewhere: 'forwarded to another machine', 'no-upnp': 'no UPnP router', unknown: 'checking…', local: 'not forwarded (local only)' } as Record<string, string>)[state] ?? state;
}

onMounted(load);
watch(() => props.server.id, () => { newName.value = props.server.name; load(); });
watch(() => props.server.name, n => { newName.value = n; });
</script>
