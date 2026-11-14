<template>
  <ObxSheet :open="open" :title="`Play ${title}`" sub="Any build, at any stage. Buying is free and saves are kept apart from the real game." testid="obx-play" @close="emit('close')">
    <template #tools>
      <span v-if="view.Playing" class="obx-chip" data-tone="ok"><span class="obx-dot" data-tone="ok" data-pulse="true"></span>In a playtest now</span>
    </template>

    <div v-if="!view.Playable" class="obx-empty"><ObxIcon name="map" /><span><b>Nothing to play yet.</b> The builder starts the world once research has written the brief.</span></div>

    <template v-else>
      <div class="obx-stack" style="gap: 6px">
        <label class="obx-sub" style="margin: 0" for="obx-play-build">Build</label>
        <select id="obx-play-build" v-model="build" class="obx-select" :disabled="busy !== null" style="width: 100%">
          <option value="latest">{{ newestLabel }}</option>
          <option v-for="r in revisions" :key="r" :value="`r${r}`">r{{ r }}{{ r === newestRevision ? ' · newest clean build' : '' }}</option>
        </select>
        <p class="obx-dim" style="font-size: 11.5px">{{ buildHelp }}</p>
      </div>

      <div class="obx-account__row">
        <button v-if="canAct" class="obx-btn obx-btn--brand" :disabled="!view.Roblox.Available || busy !== null" data-testid="obx-play-roblox" @click="playInRoblox">
          <ObxIcon :name="busy === 'roblox' ? 'refresh' : 'play'" :class="{ 'obx-spin': busy === 'roblox' }" />{{ busy === 'roblox' ? 'Sending to Roblox…' : 'Play in Roblox' }}
        </button>
        <button class="obx-btn" :disabled="busy !== null" data-testid="obx-play-studio" @click="openInStudio">
          <ObxIcon :name="busy === 'studio' ? 'refresh' : 'download'" :class="{ 'obx-spin': busy === 'studio' }" />{{ busy === 'studio' ? 'Building…' : 'Open in Roblox Studio' }}
        </button>
        <label v-if="canAct && view.Roblox.Available" class="obx-check"><input v-model="fresh" type="checkbox" :disabled="busy !== null" /> Fresh saves</label>
      </div>

      <p class="obx-banner" :data-tone="view.Roblox.Available ? 'info' : 'warn'" style="margin: 0">
        <ObxIcon class="obx-banner__glyph" :name="view.Roblox.Available ? 'globe' : 'alert'" />
        <span class="obx-banner__text"><span>{{ whereText }}</span></span>
      </p>
      <p v-if="message" class="obx-banner" :data-tone="message.tone" role="status" data-testid="obx-play-message" style="margin: 0">
        <ObxIcon class="obx-banner__glyph" :name="message.tone === 'ok' ? 'check-circle' : message.tone === 'warn' ? 'alert' : 'octagon'" />
        <span class="obx-banner__text"><span>{{ message.text }}</span></span>
      </p>

      <div v-if="last || canAct" class="obx-stack" style="gap: 8px; padding-top: 4px; border-top: 1px solid var(--obx-line)">
        <p v-if="last" class="obx-account__row" style="gap: 6px; font-size: 12.5px">
          <span class="obx-dim">{{ view.InExperience ? 'In Roblox now' : 'Last sent to Roblox' }}:</span>
          <b class="obx-mono">{{ last.Build }}</b> · version {{ last.Version }} · {{ obxAgo(last.Utc, now) }}{{ last.Followed ? ' · followed the build' : '' }}
          <a v-if="view.JoinUrl" class="obx-link" :href="view.JoinUrl" target="_blank" rel="noopener">Join ↗</a>
        </p>
        <label v-if="canAct" class="obx-check" style="align-items: flex-start">
          <input type="checkbox" :checked="game.Playtest.Follow" :disabled="busy !== null || !view.Roblox.Available" style="margin-top: 3px" @change="setFollow(($event.target as HTMLInputElement).checked)" />
          <span><b>Follow the build.</b> While you're in the playtest, each new clean build is published to it and your server moves onto it.</span>
        </label>
      </div>
    </template>

    <div>
      <h3 class="obx-sub">Your playtests</h3>
      <ul v-if="sessions.length" class="obx-stack" style="gap: 0">
        <li v-for="s in sessions" :key="s.Server" class="obx-lesson" style="padding: 8px 0">
          <div class="obx-lesson__top">
            <span class="obx-chip" :data-tone="s.Where === 'studio' ? 'violet' : 'info'">{{ s.Where === 'studio' ? 'Studio' : 'Roblox' }}</span>
            <b class="obx-mono" style="color: var(--obx-ink)">{{ s.Build || '—' }}</b>
            <span>{{ obxAgo(s.LastEventUtc, now) }}<template v-if="played(s)"> · {{ bloxSeconds(played(s)) }}</template></span>
            <span v-if="liveNow(s)" class="obx-chip" data-tone="ok">playing now</span>
          </div>
          <p v-if="facts(s)" class="obx-ink2" style="font-size: 12px">{{ facts(s) }}</p>
          <ul v-if="s.Errors.length" class="obx-issues" :aria-label="`Script errors in ${s.Build}`">
            <li v-for="(e, i) in s.Errors.slice(0, 4)" :key="i"><span class="obx-mono" style="color: var(--obx-crit)">×{{ e.Count }}</span><span class="obx-mono" style="color: #ffc6cc; overflow-wrap: anywhere">{{ e.Message }}</span></li>
            <li v-if="s.Errors.length > 4" class="obx-dim">and {{ s.Errors.length - 4 }} more</li>
          </ul>
        </li>
      </ul>
      <p v-else class="obx-dim">None yet. How far you get, what you test-buy, the feedback you give and any script errors show here, and the builder reads them.</p>
    </div>
  </ObxSheet>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAccess } from '~/composables/useAccess';
import {
  BLOX_RATING_LABEL, BLOX_REASON_LABEL, bloxDownloadPlace, bloxPost, bloxSeconds,
  type BloxDossier, type BloxPlaytestResult, type BloxPlaytestSession, type BloxPlaytestView,
} from '~/composables/useOmniBlox';
import { obxAgo, obxCount } from '~/scripts/omniblox/console';

/** Playing a game at any stage: in Roblox (its private experience or the playtest one) or in Studio. */
const props = defineProps<{ open: boolean; game: BloxDossier; view: BloxPlaytestView; revisions: number[]; title: string; now: number }>();
const emit = defineEmits<{ close: []; changed: [] }>();

const { can } = useAccess();
const canAct = computed(() => can('omniblox.studio.act'));

const build = ref('latest');
const fresh = ref(false);
const busy = ref<'roblox' | 'studio' | 'follow' | null>(null);
const message = ref<{ text: string; tone: 'ok' | 'warn' | 'crit' } | null>(null);

const revisions = computed(() => props.revisions.slice().sort((a, b) => b - a));
const newestRevision = computed(() => revisions.value[0] ?? null);
const newestLabel = computed(() => (newestRevision.value ? `Newest: r${newestRevision.value} and any edits since` : 'Newest: the files as they are'));
const buildHelp = computed(() => (build.value === 'latest'
  ? (newestRevision.value
    ? `The files as they are right now, mid-build included. If they don't compile at this moment, r${newestRevision.value} (the last clean build) plays instead.`
    : 'The files as they are right now. Nothing has built cleanly yet, so they have to compile.')
  : `${build.value} exactly as it was built.`));
const last = computed(() => props.game.Playtest.LastPublish);
const whereText = computed(() => {
  const r = props.view.Roblox;
  if (!r.Available) return r.Reason ?? 'Playing in Roblox is not set up.';
  if (r.OwnExperience) {
    return r.UniverseId
      ? `Plays in this game's own experience (${r.UniverseId}), which stays private until launch.`
      : 'Plays in this game\'s own experience (a free experience slot is set aside on the first play), which stays private until launch.';
  }
  const other = props.view.OtherGame;
  return `Plays in your private playtest experience (${r.UniverseId}).` + (other ? ` It runs "${other.Title}" (${other.Build}) now; playing this game replaces it.` : '');
});
const sessions = computed(() => props.game.Playtest.Sessions.slice().reverse().slice(0, 6));
const played = (s: BloxPlaytestSession) => Math.max(s.PlayedSeconds, Math.round((Date.parse(s.LastEventUtc) - Date.parse(s.StartedUtc)) / 1000));
const liveNow = (s: BloxPlaytestSession) => s.Where === 'roblox' && s.Players > 0 && props.now - Date.parse(s.LastEventUtc) <= 3 * 60_000;

function facts(s: BloxPlaytestSession): string {
  const parts: string[] = [];
  if (s.FurthestStep != null) parts.push(`reached ${s.FurthestStepName ?? `step ${s.FurthestStep}`}${s.Completed ? ', finished' : ''}`);
  else if (s.Completed) parts.push('finished');
  if (s.Deaths) parts.push(`${s.Deaths} death${s.Deaths === 1 ? '' : 's'}`);
  if (s.Earned) parts.push(`earned ${obxCount(s.Earned)}`);
  const bought = new Map<string, number>();
  s.TestPurchases.forEach(key => bought.set(key, (bought.get(key) ?? 0) + 1));
  if (bought.size) {
    const name = (key: string) => props.game.Products.find(p => p.Key === key)?.Name ?? key;
    parts.push('test-bought ' + [...bought.keys()].map(key => (bought.get(key)! > 1 ? `${name(key)} ×${bought.get(key)}` : name(key))).join(', '));
  }
  const actions = Object.keys(s.Actions).sort((a, b) => s.Actions[b]! - s.Actions[a]!).slice(0, 3);
  if (actions.length) parts.push(actions.map(name => `${name.replace(/_/g, ' ')} ×${s.Actions[name]}`).join(', '));
  s.Feedback.forEach(f => parts.push(`rated it ${BLOX_RATING_LABEL[f.Rating] ?? f.Rating}: ${(BLOX_REASON_LABEL[f.Reason] ?? f.Reason).toLowerCase()}`));
  if (!parts.length && !s.Errors.length) parts.push(s.Joins ? 'joined; nothing recorded yet' : 'server started; nobody joined');
  return parts.join(' · ');
}

/** Publishes the build to the game's private experience and opens Roblox on it. */
async function playInRoblox() {
  if (busy.value) return;
  message.value = null;
  // Browsers block a tab opened after an await, so it opens in the click and is pointed at the game later.
  const tab = window.open('', '_blank');
  if (tab) {
    try {
      tab.opener = null;
      tab.document.title = 'Starting your playtest…';
      tab.document.body.style.cssText = 'margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0d14;color:#eceffa;font:15px system-ui,sans-serif';
      tab.document.body.textContent = `Sending ${build.value === 'latest' ? 'the newest build' : build.value} of ${props.title} to Roblox…`;
    } catch { /* the tab still works without the message */ }
  }
  busy.value = 'roblox';
  try {
    const result = await bloxPost<BloxPlaytestResult>('/omniblox/games/playtest', { gameId: props.game.GameId, build: build.value, fresh: fresh.value });
    if (!result.ok || !result.data) {
      tab?.close();
      message.value = { text: result.error ?? 'The playtest could not start.', tone: 'crit' };
      return;
    }
    const r = result.data;
    if (tab && !tab.closed) tab.location.href = r.joinUrl;
    fresh.value = false;
    const head = r.reused ? `${r.build} is already in Roblox: joining it.` : `${r.build} is in Roblox (version ${r.version}).`;
    message.value = { text: [head, ...r.warnings].join(' ') + (tab ? '' : ' Your browser blocked the new tab: use Join.'), tone: r.warnings.length || !tab ? 'warn' : 'ok' };
    emit('changed');
  } finally {
    busy.value = null;
  }
}

async function openInStudio() {
  if (busy.value) return;
  message.value = null;
  busy.value = 'studio';
  try {
    const result = await bloxDownloadPlace(props.game.GameId, build.value);
    if (!result.ok) { message.value = { text: result.error, tone: 'crit' }; return; }
    message.value = { text: `Saved ${result.fileName}. Open it in Roblox Studio and press Play (F5).` + (result.note ? ` ${result.note}` : ''), tone: result.note ? 'warn' : 'ok' };
    emit('changed');
  } finally {
    busy.value = null;
  }
}

async function setFollow(on: boolean) {
  busy.value = 'follow';
  try {
    const result = await bloxPost('/omniblox/games/playtest/follow', { gameId: props.game.GameId, follow: on });
    if (!result.ok) message.value = { text: result.error ?? 'Could not change Follow.', tone: 'crit' };
    emit('changed');
  } finally {
    busy.value = null;
  }
}
</script>
