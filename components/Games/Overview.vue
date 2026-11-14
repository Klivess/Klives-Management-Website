<template>
  <div class="kgx-ov">
    <ul v-if="issues.length" class="kgx-issues kgx-issues--inline" data-testid="server-issues">
      <li v-for="issue in issues" :key="issue.id" class="kgx-issue" :data-tone="issue.tone">
        <span class="kgx-issue__mark"></span>
        <span class="kgx-issue__body">
          <span class="kgx-issue__title">{{ issue.title }}</span>
          <span class="kgx-issue__detail">{{ issue.detail }}</span>
        </span>
        <button v-if="issue.fix && issue.fix.action !== 'open'" class="kgx-btn kgx-btn--sm" @click="emit('fix', issue)">{{ issue.fix.label }}<GamesIcon name="chevron-right" /></button>
      </li>
    </ul>

    <div class="kgx-ov__grid">
      <section class="kgx-card" aria-label="Resource use">
        <header class="kgx-card__head">
          <h2 class="kgx-card__title"><GamesIcon name="activity" />Resource use</h2>
          <div class="kgx-card__tools">
            <div class="kgx-seg" role="group" aria-label="Window">
              <button class="kgx-seg__opt" :aria-pressed="range === '1h'" @click="range = '1h'">1 h</button>
              <button class="kgx-seg__opt" :aria-pressed="range === '24h'" @click="range = '24h'">24 h</button>
            </div>
          </div>
        </header>
        <GamesChart v-if="vitals" :rows="chartRows" :t0="vitals.t0" :step-seconds="vitals.stepSeconds"
          :empty-text="live ? 'Collecting the first samples…' : `Nothing ran in the last ${range === '1h' ? 'hour' : 'day'}${historyNote}.`" />
        <p v-else-if="vitalsMissing" class="kgx-empty">This server does not keep resource history yet.</p>
        <p v-else class="kgx-empty">Loading…</p>
      </section>

      <section class="kgx-card" aria-label="Details">
        <header class="kgx-card__head"><h2 class="kgx-card__title"><GamesIcon name="info" />Details</h2></header>
        <dl class="kgx-facts">
          <div><dt>Deployed</dt><dd :title="kgWhen(server.createdUtc)">{{ kgAgo(server.createdUtc, now) }}</dd></div>
          <div><dt>Last start</dt><dd :title="kgWhen(server.lastStartedUtc)">{{ server.lastStartedUtc ? kgWhen(server.lastStartedUtc) : 'never' }}</dd></div>
          <div v-if="server.lastStartupSeconds"><dt>Start-up</dt><dd>{{ kgDuration(server.lastStartupSeconds) }} to ready</dd></div>
          <div v-if="server.lastStoppedUtc"><dt>Last stop</dt><dd>{{ kgWhen(server.lastStoppedUtc) }}<template v-if="server.lastExitCode != null"> · exit {{ server.lastExitCode }}</template></dd></div>
          <div><dt>Ports</dt><dd class="kgx-mono">{{ server.network.ports.map(p => `${p.protocol} ${p.port}`).join(' · ') }}</dd></div>
          <div><dt>On crash</dt><dd>{{ server.autoRestart ? 'restarts (3 in 5 min max)' : 'stays down' }}</dd></div>
          <div><dt>On boot</dt><dd>{{ server.autoStart ? 'starts with Omnipotent' : 'waits to be started' }}</dd></div>
          <div v-if="server.crashes7d != null"><dt>Crashes, 7 days</dt><dd :data-tone="server.crashes7d ? 'crit' : undefined">{{ server.crashes7d }}</dd></div>
          <div v-if="live"><dt>Console</dt><dd>{{ server.consoleAttached === false ? 'not attached (re-adopted)' : 'attached' }}</dd></div>
          <div v-if="server.players.known != null"><dt>Players seen</dt><dd>{{ server.players.known }}<template v-if="server.players.lastSeenUtc"> · last {{ kgAgo(server.players.lastSeenUtc, now) }}</template></dd></div>
        </dl>
      </section>
    </div>

    <section class="kgx-card" aria-label="Activity">
      <header class="kgx-card__head">
        <h2 class="kgx-card__title"><GamesIcon name="history" />Activity</h2>
        <div class="kgx-card__tools">
          <div class="kgx-seg" role="group" aria-label="Show">
            <button v-for="g in GROUPS" :key="g.id" class="kgx-seg__opt" :aria-pressed="group === g.id" @click="group = g.id">{{ g.label }}</button>
          </div>
        </div>
      </header>
      <GamesTimeline :entries="shownEntries" :now="now" :empty-text="activityMissing ? 'This server does not keep a history yet.' : 'Nothing of this kind has happened yet.'" />
      <button v-if="hasMore && group === 'all'" class="kgx-btn kgx-btn--ghost kgx-more" :disabled="loadingMore" @click="more">{{ loadingMore ? 'Loading…' : 'Older' }}</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { KliveGamesApi } from '~/composables/useKliveGames';
import {
  isNum, kgActivityMeta, type KgChartRow as ChartRow, kgAgo, kgDuration, kgPct, kgStatus, kgWhen, type KgActivity, type KgActivityGroup, type KgIssue, type KgServer,
} from '~/scripts/kliveGames';

const props = defineProps<{ server: KgServer; api: KliveGamesApi; issues: KgIssue[]; now: number }>();
const emit = defineEmits<{ fix: [issue: KgIssue] }>();

const live = computed(() => kgStatus(props.server.status).live);
const range = ref<'1h' | '24h'>('1h');
const vitals = ref<{ t0: number; stepSeconds: number; cpu: (number | null)[]; ramMb: (number | null)[]; players: (number | null)[]; ramLimitMb: number | null } | null>(null);
const vitalsMissing = ref(false);
const historyNote = computed(() => ' (history is kept in memory, so it starts over when Omnipotent restarts)');

const chartRows = computed<ChartRow[]>(() => {
  const v = vitals.value;
  if (!v) return [];
  const mem = (x: number | null | undefined) => (isNum(x) ? (x >= 1024 ? `${(x / 1024).toFixed(1)} GB` : `${Math.round(x)} MB`) : '—');
  return [
    { label: 'CPU', values: v.cpu, tone: 'info', max: 100, format: x => kgPct(x) },
    { label: 'Memory', values: v.ramMb, tone: 'ok', limit: v.ramLimitMb, format: mem },
    { label: 'Players', values: v.players, tone: 'warn', format: x => (isNum(x) ? String(x) : '—') },
  ];
});

async function loadVitals() {
  const r = await props.api.getVitals(props.server.id, range.value);
  if (r.ok) { vitals.value = r.data as any; vitalsMissing.value = false; }
  else if (r.missing) vitalsMissing.value = true;
}

// ── activity ──
const GROUPS: { id: 'all' | KgActivityGroup; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'lifecycle', label: 'Runs' },
  { id: 'players', label: 'Players' },
  { id: 'backups', label: 'Backups' },
  { id: 'changes', label: 'Changes' },
];
const group = ref<'all' | KgActivityGroup>('all');
const entries = ref<KgActivity[]>([]);
const hasMore = ref(false);
const loadingMore = ref(false);
const activityMissing = ref(false);
const shownEntries = computed(() => (group.value === 'all' ? entries.value : entries.value.filter(e => kgActivityMeta(e.kind).group === group.value)));

async function loadActivity() {
  const r = await props.api.getActivity(props.server.id, 100);
  if (r.ok) { entries.value = r.data.entries ?? []; hasMore.value = !!r.data.hasMore; activityMissing.value = false; }
  else if (r.missing) activityMissing.value = true;
}

async function more() {
  const last = entries.value[entries.value.length - 1];
  if (!last) return;
  loadingMore.value = true;
  const r = await props.api.getActivity(props.server.id, 100, last.atUtc);
  loadingMore.value = false;
  if (r.ok) { entries.value = [...entries.value, ...(r.data.entries ?? [])]; hasMore.value = !!r.data.hasMore; }
}

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  loadVitals();
  loadActivity();
  timer = setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    if (live.value) loadVitals();
  }, 15_000);
});
onBeforeUnmount(() => { if (timer) clearInterval(timer); });

watch(range, loadVitals);
watch(() => props.server.id, () => { vitals.value = null; entries.value = []; loadVitals(); loadActivity(); });
// The overview poll carries the newest event; fetch the history again only when that changes.
watch(() => `${props.server.lastActivity?.atUtc}|${props.server.lastActivity?.kind}`, (next, prev) => { if (prev !== undefined && next !== prev) loadActivity(); });
watch(live, (now, before) => { if (now !== before) loadVitals(); });
</script>
