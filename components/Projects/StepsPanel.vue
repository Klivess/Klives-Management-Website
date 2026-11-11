<template>
  <div class="pjx-ledger">
    <div class="pjx-ledger__bar">
      <span class="pjx-dim">{{ summary }}</span>
      <button class="pjx-iconbtn pjx-iconbtn--sm" :disabled="loading" title="Refresh the step ledger" aria-label="Refresh the step ledger" @click="load">
        <ProjectsIcon name="refresh" :class="{ 'pjx-spin': loading }" />
      </button>
    </div>

    <div v-if="error" class="pjx-banner" data-tone="fault" role="alert"><ProjectsIcon name="alert" /><div class="pjx-banner__body">{{ error }}</div></div>

    <!-- The one step in flight. Attempts are counted from real tool calls, not from what the agent reports. -->
    <article v-if="active" class="pjx-ledger__active" aria-label="Active step">
      <div class="pjx-ledger__active-top">
        <span class="pjx-chip" data-tone="work" data-live><span class="pjx-chip__dot"></span>Active</span>
        <span v-if="active.milestoneID" class="pjx-chip pjx-chip--quiet">{{ active.milestoneID }}</span>
        <span class="pjx-chip" :data-tone="active.attempts >= 6 ? 'fault' : 'rest'" title="Counted from real tool calls, not from what the agent reports">
          {{ active.attempts }} {{ active.attempts === 1 ? 'attempt' : 'attempts' }}
        </span>
        <span class="pjx-mono pjx-faint">{{ active.stepID }}</span>
        <span v-if="active.startedAt" class="pjx-dim pjx-ledger__since">active for {{ ageWords(active.startedAt, now) }}</span>
      </div>
      <h3 class="pjx-ledger__title">{{ active.title }}</h3>
      <dl class="pjx-ledger__kv">
        <template v-if="active.lastAttemptOutcome"><dt>Last attempt</dt><dd>{{ active.lastAttemptOutcome }}</dd></template>
        <dt>Next action</dt>
        <dd :data-missing="!active.nextConcreteAction || undefined">{{ active.nextConcreteAction || 'Not set: a renewed context has nothing to resume from.' }}</dd>
      </dl>
      <div class="pjx-ledger__actions">
        <button class="pjx-btn pjx-btn--go pjx-btn--sm" :disabled="busy" @click="close(active!, 'done')"><ProjectsIcon name="check" />Mark done</button>
        <button class="pjx-btn pjx-btn--ghost pjx-btn--sm" :disabled="busy" @click="close(active!, 'abandoned')"><ProjectsIcon name="x" />Abandon</button>
      </div>
    </article>
    <div v-else-if="loaded && queued.length" class="pjx-banner" data-tone="need">
      <ProjectsIcon name="hourglass" />
      <div class="pjx-banner__body">Nothing is active. The Commander activates the first queued step on its next wake, or start one now with <ProjectsIcon name="play" />.</div>
    </div>

    <section v-if="queued.length" class="pjx-ledger__group" aria-label="Queued steps">
      <h4 class="pjx-ledger__label">Queue <span class="pjx-num">{{ queued.length }}</span></h4>
      <ol class="pjx-ledger__list">
        <li v-for="(s, i) in queued" :key="s.stepID" :data-blocked="s.status === 'Blocked' || undefined">
          <span class="pjx-ledger__n pjx-num">{{ i + 1 }}</span>
          <span class="pjx-ledger__item pjx-truncate" :title="s.title">{{ s.title }}</span>
          <span v-if="s.milestoneID" class="pjx-chip pjx-chip--quiet">{{ s.milestoneID }}</span>
          <span v-if="s.status === 'Blocked'" class="pjx-chip" data-tone="need" :title="s.closureReason || 'Blocked'">Blocked</span>
          <span class="pjx-ledger__tools">
            <button class="pjx-iconbtn pjx-iconbtn--sm" :disabled="busy || i === 0" title="Move up" aria-label="Move up" @click="move(i, -1)"><ProjectsIcon name="arrow-up" /></button>
            <button class="pjx-iconbtn pjx-iconbtn--sm" :disabled="busy || i === queued.length - 1" title="Move down" aria-label="Move down" @click="move(i, 1)"><ProjectsIcon name="arrow-down" /></button>
            <button class="pjx-iconbtn pjx-iconbtn--sm" :disabled="busy" title="Make this the active step" aria-label="Make this the active step" @click="activate(s)"><ProjectsIcon name="play" /></button>
            <button class="pjx-iconbtn pjx-iconbtn--sm" data-tone="fault" :disabled="busy" title="Drop this step" aria-label="Drop this step" @click="close(s, 'abandoned')"><ProjectsIcon name="x" /></button>
          </span>
        </li>
      </ol>
    </section>

    <!-- The path is steerable, not just observable. -->
    <form class="pjx-ledger__add" @submit.prevent="add">
      <input v-model="draft" class="pjx-input" :disabled="busy" placeholder="Add a step to the end of the queue…" aria-label="New step" />
      <button class="pjx-btn pjx-btn--sm" type="submit" :disabled="busy || !draft.trim()"><ProjectsIcon name="plus" />Add</button>
    </form>

    <section v-if="closed.length" class="pjx-ledger__group" aria-label="Closed steps">
      <h4 class="pjx-ledger__label">
        Closed <span class="pjx-num">{{ closed.length }}</span>
        <button v-if="closed.length > CLOSED_SHOWN" class="pjx-btn pjx-btn--ghost pjx-btn--xs" @click="showAllClosed = !showAllClosed">
          {{ showAllClosed ? 'Show fewer' : `Show all ${closed.length}` }}
        </button>
      </h4>
      <ul class="pjx-ledger__list" data-closed>
        <li v-for="s in closedShown" :key="s.stepID">
          <span class="pjx-ledger__mark" :data-tone="s.status === 'Done' ? 'work' : 'rest'" :title="s.status"><ProjectsIcon :name="s.status === 'Done' ? 'check' : 'x'" /></span>
          <span class="pjx-ledger__item pjx-truncate" :title="s.title">{{ s.title }}</span>
          <span class="pjx-ledger__meta pjx-truncate" :title="s.closureReason || ''">
            <template v-if="s.attempts != null">{{ s.attempts }} {{ s.attempts === 1 ? 'attempt' : 'attempts' }} · </template>{{ ageShort(s.closedAt || s.updatedAt, now) }}<template v-if="s.closureReason"> · {{ s.closureReason }}</template>
          </span>
        </li>
      </ul>
    </section>

    <div v-if="loaded && !steps.length" class="pjx-empty">
      <ProjectsIcon name="plan" />
      <b>No steps yet</b>
      <span>The Commander queues them as it plans (<code class="pjx-mono">checkpoint op:queue_steps</code>), or add the first one above.</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import { pjxGet, pjxPost } from '~/composables/useProjectsConsole';
import { ageShort, ageWords } from '~/scripts/projectsConsole';

const props = defineProps<{ projectId: string }>();

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
  const r = await pjxGet<any>(`/projects/steps?projectID=${encodeURIComponent(props.projectId)}`);
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
  const r = await pjxPost(route, { projectID: props.projectId, ...body });
  busy.value = false;
  if (!r.ok) { error.value = r.error; return false; }
  await load();
  return true;
}

async function add() {
  const title = draft.value.trim();
  if (!title) return;
  if (await post('/projects/steps/add', { title })) draft.value = '';
}

const activate = (s: any) => post('/projects/steps/activate', { stepID: s.stepID });

function close(s: any, result: 'done' | 'abandoned') {
  const reason = result === 'done' ? 'Confirmed complete by Klives.' : 'Dropped by Klives.';
  return post('/projects/steps/close', { stepID: s.stepID, result, reason });
}

// Reorder locally, then send the whole queue order so the server stays the single authority.
function move(index: number, delta: number) {
  const order = queued.value.map(s => s.stepID);
  const target = index + delta;
  if (target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target], order[index]];
  return post('/projects/steps/reorder', { stepIDs: order });
}

onMounted(() => { load(); clock = setInterval(() => { now.value = Date.now(); }, 30000); });
onBeforeUnmount(() => { if (clock) clearInterval(clock); });
watch(() => props.projectId, load);
</script>
