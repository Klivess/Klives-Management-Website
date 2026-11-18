<template>
  <div class="dmx-ledger">
    <div class="dmx-ledger__bar">
      <span class="dmx-dim">{{ summary }}</span>
      <button class="dmx-iconbtn dmx-iconbtn--sm" :disabled="loading" title="Refresh the step ledger" aria-label="Refresh the step ledger" @click="load">
        <DemiurgeIcon name="refresh" :class="{ 'dmx-spin': loading }" />
      </button>
    </div>

    <div v-if="error" class="dmx-banner" data-tone="fault" role="alert"><DemiurgeIcon name="alert" /><div class="dmx-banner__body">{{ error }}</div></div>

    <!-- The one step in flight. Attempts are counted from real tool calls, not from what the agent reports. -->
    <article v-if="active" class="dmx-ledger__active" aria-label="Active step">
      <div class="dmx-ledger__active-top">
        <span class="dmx-chip" data-tone="work" data-live><span class="dmx-chip__dot"></span>Active</span>
        <span v-if="active.milestoneID" class="dmx-chip dmx-chip--quiet">{{ active.milestoneID }}</span>
        <span class="dmx-chip" :data-tone="active.attempts >= 6 ? 'fault' : 'rest'" title="Counted from real tool calls, not from what the agent reports">
          {{ active.attempts }} {{ active.attempts === 1 ? 'attempt' : 'attempts' }}
        </span>
        <span class="dmx-mono dmx-faint">{{ active.stepID }}</span>
        <span v-if="active.startedAt" class="dmx-dim dmx-ledger__since">active for {{ ageWords(active.startedAt, now) }}</span>
      </div>
      <h3 class="dmx-ledger__title">{{ active.title }}</h3>
      <dl class="dmx-ledger__kv">
        <template v-if="active.lastAttemptOutcome"><dt>Last attempt</dt><dd>{{ active.lastAttemptOutcome }}</dd></template>
        <dt>Next action</dt>
        <dd :data-missing="!active.nextConcreteAction || undefined">{{ active.nextConcreteAction || 'Not set: a renewed context has nothing to resume from.' }}</dd>
      </dl>
      <div class="dmx-ledger__actions">
        <button class="dmx-btn dmx-btn--go dmx-btn--sm" :disabled="busy" @click="close(active!, 'done')"><DemiurgeIcon name="check" />Mark done</button>
        <button class="dmx-btn dmx-btn--ghost dmx-btn--sm" :disabled="busy" @click="close(active!, 'abandoned')"><DemiurgeIcon name="x" />Abandon</button>
      </div>
    </article>
    <div v-else-if="loaded && queued.length" class="dmx-banner" data-tone="need">
      <DemiurgeIcon name="hourglass" />
      <div class="dmx-banner__body">Nothing is active. The Commander activates the first queued step on its next wake, or start one now with <DemiurgeIcon name="play" />.</div>
    </div>

    <section v-if="queued.length" class="dmx-ledger__group" aria-label="Queued steps">
      <h4 class="dmx-ledger__label">Queue <span class="dmx-num">{{ queued.length }}</span></h4>
      <ol class="dmx-ledger__list">
        <li v-for="(s, i) in queued" :key="s.stepID" :data-blocked="s.status === 'Blocked' || undefined">
          <span class="dmx-ledger__n dmx-num">{{ i + 1 }}</span>
          <span class="dmx-ledger__item dmx-truncate" :title="s.title">{{ s.title }}</span>
          <span v-if="s.milestoneID" class="dmx-chip dmx-chip--quiet">{{ s.milestoneID }}</span>
          <span v-if="s.status === 'Blocked'" class="dmx-chip" data-tone="need" :title="s.closureReason || 'Blocked'">Blocked</span>
          <span class="dmx-ledger__tools">
            <button class="dmx-iconbtn dmx-iconbtn--sm" :disabled="busy || i === 0" title="Move up" aria-label="Move up" @click="move(i, -1)"><DemiurgeIcon name="arrow-up" /></button>
            <button class="dmx-iconbtn dmx-iconbtn--sm" :disabled="busy || i === queued.length - 1" title="Move down" aria-label="Move down" @click="move(i, 1)"><DemiurgeIcon name="arrow-down" /></button>
            <button class="dmx-iconbtn dmx-iconbtn--sm" :disabled="busy" title="Make this the active step" aria-label="Make this the active step" @click="activate(s)"><DemiurgeIcon name="play" /></button>
            <button class="dmx-iconbtn dmx-iconbtn--sm" data-tone="fault" :disabled="busy" title="Drop this step" aria-label="Drop this step" @click="close(s, 'abandoned')"><DemiurgeIcon name="x" /></button>
          </span>
        </li>
      </ol>
    </section>

    <!-- The path is steerable, not just observable. -->
    <form class="dmx-ledger__add" @submit.prevent="add">
      <input v-model="draft" class="dmx-input" :disabled="busy" placeholder="Add a step to the end of the queue…" aria-label="New step" />
      <button class="dmx-btn dmx-btn--sm" type="submit" :disabled="busy || !draft.trim()"><DemiurgeIcon name="plus" />Add</button>
    </form>

    <section v-if="closed.length" class="dmx-ledger__group" aria-label="Closed steps">
      <h4 class="dmx-ledger__label">
        Closed <span class="dmx-num">{{ closed.length }}</span>
        <button v-if="closed.length > CLOSED_SHOWN" class="dmx-btn dmx-btn--ghost dmx-btn--xs" @click="showAllClosed = !showAllClosed">
          {{ showAllClosed ? 'Show fewer' : `Show all ${closed.length}` }}
        </button>
      </h4>
      <ul class="dmx-ledger__list" data-closed>
        <li v-for="s in closedShown" :key="s.stepID">
          <span class="dmx-ledger__mark" :data-tone="s.status === 'Done' ? 'work' : 'rest'" :title="s.status"><DemiurgeIcon :name="s.status === 'Done' ? 'check' : 'x'" /></span>
          <span class="dmx-ledger__item dmx-truncate" :title="s.title">{{ s.title }}</span>
          <span class="dmx-ledger__meta dmx-truncate" :title="s.closureReason || ''">
            <template v-if="s.attempts != null">{{ s.attempts }} {{ s.attempts === 1 ? 'attempt' : 'attempts' }} · </template>{{ ageShort(s.closedAt || s.updatedAt, now) }}<template v-if="s.closureReason"> · {{ s.closureReason }}</template>
          </span>
        </li>
      </ul>
    </section>

    <div v-if="loaded && !steps.length" class="dmx-empty">
      <DemiurgeIcon name="plan" />
      <b>No steps yet</b>
      <span>The Commander queues them as it plans (<code class="dmx-mono">checkpoint op:queue_steps</code>), or add the first one above.</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import DemiurgeIcon from '~/components/Demiurge/Icon.vue';
import { dmxGet, dmxPost } from '~/composables/useDemiurgeConsole';
import { ageShort, ageWords } from '~/scripts/demiurgeConsole';

const props = defineProps<{ stewardId: string }>();

const CLOSED_SHOWN = 6;
const steps = ref<any[]>([]);
const loading = ref(false);
const loaded = ref(false);
const busy = ref(false);
const error = ref('');
const draft = ref('');
const showAllClosed = ref(false);
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;

const active = computed(() => steps.value.find(s => s.status === 'Active') ?? null);
// Blocked steps stay in the queue: they are still work, just not workable yet.
const queued = computed(() => steps.value
  .filter(s => s.status === 'Queued' || s.status === 'Blocked')
  .sort((a, b) => a.order - b.order));
const closed = computed(() => steps.value
  .filter(s => s.status === 'Done' || s.status === 'Abandoned')
  .sort((a, b) => new Date(b.closedAt || b.updatedAt).getTime() - new Date(a.closedAt || a.updatedAt).getTime()));
const closedShown = computed(() => showAllClosed.value ? closed.value : closed.value.slice(0, CLOSED_SHOWN));
const summary = computed(() => {
  if (!loaded.value) return 'Reading the ledger…';
  const done = closed.value.filter(s => s.status === 'Done').length;
  const blocked = queued.value.filter(s => s.status === 'Blocked').length;
  return [
    active.value ? '1 active' : 'nothing active',
    `${queued.value.length} queued${blocked ? ` (${blocked} blocked)` : ''}`,
    `${done} done`,
    closed.value.length - done ? `${closed.value.length - done} dropped` : '',
  ].filter(Boolean).join(' · ');
});

async function load() {
  if (loading.value) return;
  loading.value = true;
  const r = await dmxGet<any>(`/demiurge/steps?stewardID=${encodeURIComponent(props.stewardId)}`);
  loading.value = false;
  loaded.value = true;
  if (!r.ok) { error.value = `Could not load the step ledger (HTTP ${r.status || 'network error'}).`; return; }
  steps.value = r.body?.steps ?? [];
  error.value = '';
}

async function post(route: string, body: Record<string, unknown>) {
  if (busy.value) return false;
  busy.value = true;
  error.value = '';
  const r = await dmxPost(route, { stewardID: props.stewardId, ...body });
  busy.value = false;
  if (!r.ok) { error.value = r.error; return false; }
  await load();
  return true;
}

async function add() {
  const title = draft.value.trim();
  if (!title) return;
  if (await post('/demiurge/steps/add', { title })) draft.value = '';
}

const activate = (s: any) => post('/demiurge/steps/activate', { stepID: s.stepID });

function close(s: any, result: 'done' | 'abandoned') {
  const reason = result === 'done' ? 'Confirmed complete by Klives.' : 'Dropped by Klives.';
  return post('/demiurge/steps/close', { stepID: s.stepID, result, reason });
}

// Reorder locally, then send the whole queue order so the server stays the single authority.
function move(index: number, delta: number) {
  const order = queued.value.map(s => s.stepID);
  const target = index + delta;
  if (target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target], order[index]];
  return post('/demiurge/steps/reorder', { stepIDs: order });
}

onMounted(() => { load(); clock = setInterval(() => { now.value = Date.now(); }, 30000); });
onBeforeUnmount(() => { if (clock) clearInterval(clock); });
watch(() => props.stewardId, load);
</script>
