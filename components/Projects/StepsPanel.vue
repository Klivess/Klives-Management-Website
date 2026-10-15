<template>
  <div class="stp-panel">
    <div class="stp-head">
      <div>
        <h3 class="stp-title">Linear path</h3>
        <p class="stp-intro">
          The commander's plan of record: one step in flight at a time, worked to a close before the next
          starts. Attempt counts are measured from real tool calls, not from what the agent reports.
        </p>
      </div>
      <button class="stp-refresh" :disabled="loading" @click="load">{{ loading ? '…' : 'Refresh' }}</button>
    </div>

    <div v-if="error" class="stp-error">{{ error }}</div>

    <!-- Active step: the one thing in flight. -->
    <div v-if="active" class="stp-active">
      <div class="stp-active-top">
        <span class="stp-id">{{ active.stepID }}</span>
        <span class="stp-badge active">ACTIVE</span>
        <span v-if="active.milestoneID" class="stp-badge milestone">{{ active.milestoneID }}</span>
        <span class="stp-attempts" :class="{ hot: active.attempts >= 6 }">{{ active.attempts }} attempt{{ active.attempts === 1 ? '' : 's' }}</span>
        <span v-if="active.startedAt" class="stp-since">active {{ ago(active.startedAt) }}</span>
      </div>
      <div class="stp-active-title">{{ active.title }}</div>
      <div v-if="active.lastAttemptOutcome" class="stp-row">
        <span class="stp-row-label">last attempt</span>
        <span class="stp-row-value">{{ active.lastAttemptOutcome }}</span>
      </div>
      <div class="stp-row">
        <span class="stp-row-label">next action</span>
        <span class="stp-row-value" :class="{ missing: !active.nextConcreteAction }">
          {{ active.nextConcreteAction || 'not set — a renewed context has nothing to resume from' }}
        </span>
      </div>
      <div class="stp-active-actions">
        <button class="stp-btn" :disabled="busy" @click="close(active!, 'done')">Mark done</button>
        <button class="stp-btn" :disabled="busy" @click="close(active!, 'abandoned')">Abandon</button>
      </div>
    </div>
    <div v-else-if="loaded && queued.length" class="stp-none">
      Nothing is active. The commander will activate the first queued step on its next wake — or start it now.
    </div>

    <!-- Queue, in execution order. -->
    <div v-if="queued.length" class="stp-section">
      <div class="stp-section-head">Queue <span class="stp-count">{{ queued.length }}</span></div>
      <div
        v-for="(s, i) in queued"
        :key="s.stepID"
        class="stp-item"
        :class="{ blocked: s.status === 'Blocked' }"
      >
        <span class="stp-id">{{ s.stepID }}</span>
        <span class="stp-item-title">{{ s.title }}</span>
        <span v-if="s.milestoneID" class="stp-badge milestone">{{ s.milestoneID }}</span>
        <span v-if="s.status === 'Blocked'" class="stp-badge blocked" :title="s.closureReason || ''">BLOCKED</span>
        <span class="stp-item-actions">
          <button class="stp-mini" :disabled="busy || i === 0" title="Move up" @click="move(i, -1)">↑</button>
          <button class="stp-mini" :disabled="busy || i === queued.length - 1" title="Move down" @click="move(i, 1)">↓</button>
          <button class="stp-mini" :disabled="busy" title="Make this the active step" @click="activate(s)">▶</button>
          <button class="stp-mini danger" :disabled="busy" title="Drop this step" @click="close(s, 'abandoned')">✕</button>
        </span>
      </div>
    </div>

    <!-- Add a step of your own: the path is steerable, not just observable. -->
    <div class="stp-add">
      <input
        v-model="draft"
        class="stp-add-input"
        :disabled="busy"
        placeholder="Add a step to the end of the queue…"
        @keyup.enter="add"
      />
      <button class="stp-btn" :disabled="busy || !draft.trim()" @click="add">Add</button>
    </div>

    <div v-if="closed.length" class="stp-section">
      <div class="stp-section-head">Closed <span class="stp-count">{{ closed.length }}</span></div>
      <div v-for="s in closed" :key="s.stepID" class="stp-item done">
        <span class="stp-id">{{ s.stepID }}</span>
        <span class="stp-mark" :class="s.status === 'Done' ? 'ok' : 'no'">{{ s.status === 'Done' ? '✓' : '✗' }}</span>
        <span class="stp-item-title">{{ s.title }}</span>
        <span class="stp-closed-meta">
          {{ s.attempts }} attempt{{ s.attempts === 1 ? '' : 's' }} ·
          {{ ago(s.closedAt || s.updatedAt) }}<template v-if="s.closureReason"> · {{ s.closureReason }}</template>
        </span>
      </div>
    </div>

    <div v-if="loaded && !steps.length" class="stp-empty">
      No steps yet. The commander queues them with <code>checkpoint op:queue_steps</code> — or add the first one above.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

const props = defineProps<{ projectId: string }>();

const steps = ref<any[]>([]);
const loading = ref(false);
const loaded = ref(false);
const busy = ref(false);
const error = ref('');
const draft = ref('');

const active = computed(() => steps.value.find(s => s.status === 'Active') ?? null);
// Blocked steps stay in the queue: they are still work, just not workable yet.
const queued = computed(() => steps.value
  .filter(s => s.status === 'Queued' || s.status === 'Blocked')
  .sort((a, b) => a.order - b.order));
const closed = computed(() => steps.value
  .filter(s => s.status === 'Done' || s.status === 'Abandoned')
  .sort((a, b) => new Date(b.closedAt || b.updatedAt).getTime() - new Date(a.closedAt || a.updatedAt).getTime()));

async function load() {
  if (loading.value) return;
  loading.value = true;
  try {
    const res = await RequestGETFromKliveAPI(
      `/projects/steps?projectID=${encodeURIComponent(props.projectId)}`, false, false);
    if (!res.ok) { error.value = `Could not load the step ledger (HTTP ${res.status}).`; return; }
    steps.value = (await res.json())?.steps ?? [];
    error.value = '';
  } catch (e: any) {
    error.value = e?.message ? `Could not load the step ledger: ${e.message}` : 'Could not load the step ledger.';
  } finally {
    loading.value = false;
    loaded.value = true;
  }
}

async function post(route: string, body: Record<string, unknown>) {
  if (busy.value) return false;
  busy.value = true;
  error.value = '';
  try {
    const res = await RequestPOSTFromKliveAPI(route,
      JSON.stringify({ projectID: props.projectId, ...body }), false, true);
    if (!res.ok) { error.value = `Request failed (HTTP ${res.status}).`; return false; }
    await load();
    return true;
  } catch (e: any) {
    error.value = e?.message ? `Request failed: ${e.message}` : 'Request failed.';
    return false;
  } finally {
    busy.value = false;
  }
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

function ago(iso: string): string {
  if (!iso) return '—';
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

onMounted(load);
watch(() => props.projectId, load);
</script>

<style scoped>
.stp-panel { color: var(--ot-text); }
.stp-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
.stp-title { margin: 0; font-size: 15px; }
.stp-intro { font-size: 12px; color: var(--ot-muted); margin: 4px 0 0; line-height: 1.5; max-width: 62ch; }
.stp-refresh, .stp-btn { background: var(--ot-surface-2); color: var(--ot-text); border: 1px solid var(--ot-line); border-radius: 6px; padding: 5px 11px; font-size: 12px; cursor: pointer; flex-shrink: 0; }
.stp-refresh:hover:not(:disabled), .stp-btn:hover:not(:disabled) { background: var(--ot-surface-3); }
.stp-refresh:disabled, .stp-btn:disabled { opacity: 0.5; cursor: default; }
.stp-error { background: var(--ot-negative-soft); border: 1px solid var(--ot-negative); color: var(--ot-negative); border-radius: 6px; padding: 8px 10px; font-size: 12px; margin-bottom: 12px; }

.stp-active { background: var(--ot-surface); border: 1px solid var(--ot-accent); border-radius: 10px; padding: 14px; margin-bottom: 16px; }
.stp-active-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.stp-active-title { font-size: 16px; font-weight: 600; margin-top: 8px; line-height: 1.35; }
.stp-active-actions { display: flex; gap: 8px; margin-top: 12px; }
.stp-row { display: flex; gap: 10px; margin-top: 8px; font-size: 12px; line-height: 1.5; }
.stp-row-label { color: var(--ot-muted); text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px; padding-top: 2px; flex: 0 0 82px; }
.stp-row-value { color: var(--ot-text); min-width: 0; }
.stp-row-value.missing { color: var(--ot-warning); font-style: italic; }

.stp-id { font-family: var(--ot-mono); font-size: 11px; color: var(--ot-muted); flex-shrink: 0; }
.stp-badge { font-size: 9px; font-weight: 700; letter-spacing: 0.6px; padding: 2px 6px; border-radius: 4px; flex-shrink: 0; }
.stp-badge.active { background: rgba(109, 220, 79, 0.18); color: var(--ot-positive); }
.stp-badge.milestone { background: var(--ot-surface-2); color: var(--ot-muted); }
.stp-badge.blocked { background: rgba(240, 180, 41, 0.16); color: var(--ot-warning); }
.stp-attempts { font-size: 11px; color: var(--ot-muted); font-variant-numeric: tabular-nums; }
.stp-attempts.hot { color: var(--ot-negative); font-weight: 600; }
.stp-since { font-size: 11px; color: var(--ot-muted); margin-left: auto; }

.stp-section { margin-top: 16px; }
.stp-section-head { font-size: 10px; text-transform: uppercase; letter-spacing: 0.7px; color: var(--ot-muted); margin-bottom: 6px; }
.stp-count { color: var(--ot-muted); }
.stp-item { display: flex; align-items: center; gap: 9px; background: var(--ot-surface-2); border: 1px solid var(--ot-line); border-radius: 7px; padding: 9px 11px; margin-bottom: 5px; font-size: 13px; }
.stp-item.blocked { border-color: rgba(240, 180, 41, 0.3); }
.stp-item.done { opacity: 0.62; font-size: 12px; }
.stp-item-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stp-item-actions { display: flex; gap: 3px; margin-left: auto; flex-shrink: 0; }
.stp-mini { background: transparent; border: 1px solid var(--ot-line); color: var(--ot-muted); border-radius: 4px; width: 22px; height: 22px; font-size: 11px; cursor: pointer; line-height: 1; }
.stp-mini:hover:not(:disabled) { background: var(--ot-surface-2); color: var(--ot-text); }
.stp-mini:disabled { opacity: 0.3; cursor: default; }
.stp-mini.danger:hover:not(:disabled) { background: var(--ot-negative-soft); color: var(--ot-negative); }
.stp-mark { flex-shrink: 0; font-size: 12px; }
.stp-mark.ok { color: var(--ot-positive); }
.stp-mark.no { color: var(--ot-muted); }
.stp-closed-meta { margin-left: auto; font-size: 11px; color: var(--ot-muted); flex-shrink: 0; max-width: 46%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.stp-add { display: flex; gap: 8px; margin-top: 12px; }
.stp-add-input { flex: 1; min-width: 0; background: var(--ot-surface-2); border: 1px solid var(--ot-line); border-radius: 6px; color: var(--ot-text); padding: 7px 10px; font-size: 13px; }
.stp-add-input:focus { outline: none; border-color: var(--ot-accent); }

.stp-none { background: var(--ot-warning-soft); border: 1px solid rgba(240, 180, 41, 0.28); color: var(--ot-warning); border-radius: 8px; padding: 11px 13px; font-size: 12px; margin-bottom: 14px; }
.stp-empty { padding: 28px; text-align: center; color: var(--ot-muted); background: var(--ot-surface); border-radius: 8px; font-size: 13px; }
.stp-empty code { background: var(--ot-surface-2); color: var(--ot-text-2); padding: 1px 5px; border-radius: 4px; font-size: 11px; }
</style>
