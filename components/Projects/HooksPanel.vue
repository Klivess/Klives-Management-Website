<template>
  <div class="hooks-panel">
    <div class="hp-head">
      <p class="hp-note">Stimulus hooks decide what wakes the fleet — timers, webhooks, file changes, screen diffs, or Commander scripts.</p>
      <button class="hp-add" @click="showForm = !showForm">{{ showForm ? 'Cancel' : '+ New hook' }}</button>
    </div>

    <form v-if="showForm" class="hp-form" @submit.prevent="create">
      <div class="hp-field">
        <label>Source</label>
        <select v-model="draft.sourceKind" class="hp-input">
          <option value="timer">timer</option>
          <option value="webhook">webhook</option>
          <option value="file-watch">file-watch</option>
          <option value="screen-diff">screen-diff</option>
          <option value="script">script</option>
          <option value="email">email</option>
          <option value="discord">discord</option>
          <option value="process-exit">process-exit</option>
        </select>
      </div>
      <div class="hp-field">
        <label>Recognition criterion <span class="hp-hint">(when does it count? empty = always)</span></label>
        <textarea v-model="draft.criterion" class="hp-input" rows="2" placeholder="e.g. a supplier replied with a price quote"></textarea>
      </div>
      <div class="hp-field">
        <label>Source spec <span class="hp-hint">(JSON — e.g. {{ specHint }})</span></label>
        <input v-model="draft.sourceSpec" class="hp-input hp-mono" :placeholder="specHint" />
      </div>
      <button type="submit" class="hp-create" :disabled="creating">{{ creating ? 'Creating…' : 'Create hook' }}</button>
    </form>

    <div v-if="loading" class="hp-info">Loading hooks…</div>
    <div v-else-if="!hooks.length" class="hp-empty">No hooks yet. The keepalive still wakes the Commander periodically.</div>
    <ul v-else class="hp-list">
      <li v-for="h in hooks" :key="h.hookID" class="hp-item">
        <div class="hp-item-main">
          <span class="hp-kind" :class="'k-' + h.sourceKind">{{ h.sourceKind }}</span>
          <span class="hp-dest">→ {{ h.destinationAgentID }}</span>
          <span v-if="!h.enabled" class="hp-disabled">disabled</span>
          <span v-else class="hp-arm" :class="armClass(h.armState)" :title="h.armDetail">{{ armLabel(h.armState) }}</span>
        </div>
        <div class="hp-crit">{{ h.recognitionCriterion || '(no criterion — always delivers)' }}</div>
        <div v-if="h.enabled && h.armState === 'Error'" class="hp-armdetail">{{ h.armDetail }}</div>
        <button class="hp-del" @click="remove(h.hookID)" title="Delete hook">✕</button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

const props = defineProps<{ projectId: string }>();

const hooks = ref<any[]>([]);
const loading = ref(true);
const showForm = ref(false);
const creating = ref(false);
const draft = reactive({ sourceKind: 'timer', criterion: '', sourceSpec: '' });

const specHint = computed(() => {
  switch (draft.sourceKind) {
    case 'timer': return '{"intervalSeconds": 3600}';
    case 'file-watch': return '{"path": "/project/inbox"}';
    case 'screen-diff': return '{"intervalSeconds": 5, "threshold": 0.05}';
    case 'script': return '{"script": "await Emit(...);", "pollSeconds": 30}';
    case 'email': return '{"to": "orders@klive.dev", "from": "", "subjectContains": ""}';
    case 'discord': return '{"channelId": "", "authorId": "", "contains": ""}';
    case 'process-exit': return '{"processName": "chrome", "pollSeconds": 10}';
    default: return '{}';
  }
});

function armLabel(state: string) {
  switch (state) {
    case 'Armed': return '● live';
    case 'Passive': return '○ push';
    case 'Error': return '⚠ inert';
    default: return '';
  }
}
function armClass(state: string) {
  return {
    'a-armed': state === 'Armed',
    'a-passive': state === 'Passive',
    'a-error': state === 'Error',
  };
}

async function load() {
  loading.value = true;
  try {
    const res = await RequestGETFromKliveAPI(`/projects/hooks?projectID=${props.projectId}`, false, false);
    if (res.ok) hooks.value = await res.json();
  } catch { /* transient */ }
  finally { loading.value = false; }
}

async function create() {
  creating.value = true;
  try {
    let spec: any = {};
    if (draft.sourceSpec.trim()) { try { spec = JSON.parse(draft.sourceSpec); } catch { /* leave empty */ } }
    const body = {
      projectID: props.projectId,
      sourceKind: draft.sourceKind,
      recognitionCriterion: draft.criterion,
      sourceSpecJson: JSON.stringify(spec),
    };
    const res = await RequestPOSTFromKliveAPI('/projects/hooks/create', JSON.stringify(body), false, true);
    if (res.ok) {
      showForm.value = false;
      draft.criterion = ''; draft.sourceSpec = '';
      await load();
    }
  } finally { creating.value = false; }
}

async function remove(hookID: string) {
  const res = await RequestPOSTFromKliveAPI(
    `/projects/hooks/delete?projectID=${props.projectId}&hookID=${hookID}`, null, false, true);
  if (res.ok) await load();
}

onMounted(load);
</script>

<style scoped>
.hooks-panel { padding: 4px 2px; }
.hp-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
.hp-note { font-size: 12px; color: var(--ot-muted); margin: 0; flex: 1; }
.hp-add { background: var(--ot-surface-2); color: var(--ot-text-2); border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; white-space: nowrap; }
.hp-form { background: var(--ot-surface); border: 1px solid var(--ot-line); border-radius: 8px; padding: 14px; margin-bottom: 14px; }
.hp-field { margin-bottom: 10px; }
.hp-field label { display: block; font-size: 12px; color: var(--ot-text-2); margin-bottom: 4px; }
.hp-hint { color: var(--ot-muted); }
.hp-input { width: 100%; box-sizing: border-box; background: var(--ot-surface-2); color: var(--ot-text); border: 1px solid var(--ot-line-strong); border-radius: 6px; padding: 8px 10px; font-size: 13px; }
.hp-mono { font-family: var(--ot-mono); }
.hp-create { background: var(--ot-accent); color: var(--ot-on-accent); border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.hp-create:disabled { opacity: 0.5; }
.hp-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.hp-item { position: relative; background: var(--ot-surface-2); border-radius: 8px; padding: 10px 12px; }
.hp-item-main { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.hp-kind { font-size: 11px; padding: 2px 8px; border-radius: 8px; background: var(--ot-surface-3); color: var(--ot-text-2); }
.k-timer { background: var(--ot-info-soft); color: var(--ot-info); }
.k-screen-diff { background: var(--ot-warning-soft); color: var(--ot-warning); }
.k-script { background: var(--ot-violet-soft); color: var(--ot-violet); }
.k-email { background: var(--ot-info-soft); color: var(--ot-info); }
.k-discord { background: var(--ot-info-soft); color: var(--ot-info); }
.k-process-exit { background: var(--ot-negative-soft); color: var(--ot-warning); }
.hp-dest { font-size: 12px; color: var(--ot-muted); }
.hp-disabled { font-size: 11px; color: var(--ot-negative); }
.hp-arm { font-size: 11px; padding: 2px 7px; border-radius: 8px; white-space: nowrap; }
.a-armed { background: var(--ot-positive-soft); color: var(--ot-positive); }
.a-passive { background: var(--ot-surface-2); color: var(--ot-muted); }
.a-error { background: var(--ot-negative-soft); color: var(--ot-negative); }
.hp-crit { font-size: 12px; color: var(--ot-text-2); }
.hp-armdetail { font-size: 11px; color: var(--ot-negative); margin-top: 3px; }
.hp-del { position: absolute; top: 8px; right: 8px; background: none; border: none; color: var(--ot-muted); cursor: pointer; font-size: 13px; }
.hp-del:hover { color: var(--ot-negative); }
.hp-info, .hp-empty { color: var(--ot-muted); font-size: 13px; padding: 16px; text-align: center; }
</style>
