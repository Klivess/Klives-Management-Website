<template>
  <div class="dmx-hk">
    <div class="dmx-hk__bar">
      <span class="dmx-dim">{{ summary }}</span>
      <button class="dmx-btn dmx-btn--sm" :class="showForm ? 'dmx-btn--ghost' : ''" :aria-expanded="showForm" @click="showForm = !showForm; formError = ''">
        <DemiurgeIcon :name="showForm ? 'x' : 'plus'" />{{ showForm ? 'Cancel' : 'New trigger' }}
      </button>
    </div>

    <form v-if="showForm" class="dmx-hk__form" @submit.prevent="create">
      <div class="dmx-hk__form-row">
        <div class="dmx-field">
          <label class="dmx-field__label" for="dmx-hk-kind">Source</label>
          <select id="dmx-hk-kind" v-model="draft.sourceKind" class="dmx-select">
            <option v-for="k in KINDS" :key="k.id" :value="k.id">{{ k.label }}</option>
          </select>
        </div>
        <div class="dmx-field" style="flex: 1">
          <label class="dmx-field__label" for="dmx-hk-spec">Source spec <span class="dmx-faint">· JSON</span></label>
          <input id="dmx-hk-spec" v-model="draft.sourceSpec" class="dmx-input dmx-mono" :placeholder="specHint" :aria-invalid="!!specError || undefined" />
        </div>
      </div>
      <div class="dmx-field">
        <label class="dmx-field__label" for="dmx-hk-crit">When does it count? <span class="dmx-faint">· empty means every event wakes the agent</span></label>
        <textarea id="dmx-hk-crit" v-model="draft.criterion" class="dmx-textarea" rows="2" placeholder="e.g. a supplier replied with a price quote"></textarea>
      </div>
      <p v-if="specError" class="dmx-note" data-tone="fault">{{ specError }}</p>
      <p v-if="formError" class="dmx-note" data-tone="fault" role="alert">{{ formError }}</p>
      <div class="dmx-hk__form-foot">
        <span class="dmx-faint">{{ kindHelp }}</span>
        <button type="submit" class="dmx-btn dmx-btn--primary dmx-btn--sm" :disabled="creating || !!specError">{{ creating ? 'Creating…' : 'Create trigger' }}</button>
      </div>
    </form>

    <div v-if="loading" class="dmx-dim" style="font-size: 12px"><DemiurgeIcon name="refresh" class="dmx-spin" /> Loading triggers…</div>
    <div v-else-if="loadError" class="dmx-banner" data-tone="fault" role="alert">
      <DemiurgeIcon name="alert" /><div class="dmx-banner__body">{{ loadError }}</div>
      <div class="dmx-banner__actions"><button class="dmx-btn dmx-btn--sm" @click="load">Retry</button></div>
    </div>
    <p v-else-if="!hooks.length" class="dmx-dim" style="font-size: 12.5px">No triggers yet. The keepalive still wakes the Commander periodically.</p>
    <ul v-else class="dmx-hk__list">
      <li v-for="h in hooks" :key="h.hookID" :data-off="!h.enabled || undefined">
        <span class="dmx-chip" :data-tone="kindTone(h.sourceKind)"><DemiurgeIcon :name="kindIcon(h.sourceKind)" />{{ h.sourceKind }}</span>
        <div class="dmx-hk__body">
          <p class="dmx-hk__crit" :data-none="!h.recognitionCriterion || undefined">{{ h.recognitionCriterion || 'No criterion: every event wakes the agent.' }}</p>
          <p v-if="h.enabled && h.armState === 'Error'" class="dmx-hk__err">{{ h.armDetail }}</p>
        </div>
        <span class="dmx-dim dmx-hk__dest" title="Who it wakes">→ {{ h.destinationAgentID }}</span>
        <span v-if="!h.enabled" class="dmx-chip dmx-chip--quiet">disabled</span>
        <span v-else class="dmx-chip" :data-tone="armTone(h.armState)" :title="h.armDetail || ''">{{ armLabel(h.armState) }}</span>
        <span class="dmx-hk__tools">
          <template v-if="confirmID === h.hookID">
            <button class="dmx-btn dmx-btn--danger dmx-btn--xs" :disabled="removing" @click="remove(h.hookID)">{{ removing ? 'Deleting…' : 'Delete' }}</button>
            <button class="dmx-btn dmx-btn--ghost dmx-btn--xs" @click="confirmID = null">Keep</button>
          </template>
          <button v-else class="dmx-iconbtn dmx-iconbtn--sm" data-tone="fault" title="Delete this trigger" aria-label="Delete this trigger" @click="confirmID = h.hookID"><DemiurgeIcon name="trash" /></button>
        </span>
      </li>
    </ul>
    <p v-if="listError" class="dmx-note" data-tone="fault" role="alert">{{ listError }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import DemiurgeIcon from '~/components/Demiurge/Icon.vue';
import { dmxGet, dmxPost } from '~/composables/useDemiurgeConsole';
import type { DmTone } from '~/scripts/demiurgeConsole';

const props = defineProps<{ stewardId: string }>();

const KINDS = [
  { id: 'timer', label: 'Timer', hint: '{"intervalSeconds": 3600}', help: 'Wakes the agent on a fixed interval.', icon: 'clock', tone: 'info' },
  { id: 'webhook', label: 'Webhook', hint: '{}', help: 'A URL anything can POST to; the payload reaches the agent.', icon: 'broadcast', tone: 'plan' },
  { id: 'file-watch', label: 'File watch', hint: '{"path": "/project/inbox"}', help: 'Fires when files under the path change.', icon: 'folder', tone: 'info' },
  { id: 'screen-diff', label: 'Screen change', hint: '{"intervalSeconds": 5, "threshold": 0.05}', help: 'Fires when the desktop changes by more than the threshold.', icon: 'monitor', tone: 'need' },
  { id: 'script', label: 'Script', hint: '{"script": "await Emit(...);", "pollSeconds": 30}', help: 'A Commander script that decides when to emit.', icon: 'sparkles', tone: 'plan' },
  { id: 'email', label: 'Email', hint: '{"to": "orders@klive.dev", "from": "", "subjectContains": ""}', help: 'Mail to a KliveMail address that matches the filter.', icon: 'mail', tone: 'info' },
  { id: 'discord', label: 'Discord', hint: '{"channelId": "", "authorId": "", "contains": ""}', help: 'Discord messages that match the filter.', icon: 'message', tone: 'info' },
  { id: 'process-exit', label: 'Process exit', hint: '{"processName": "chrome", "pollSeconds": 10}', help: 'Fires when the named process stops.', icon: 'stop', tone: 'fault' },
] as const;

const hooks = ref<any[]>([]);
const loading = ref(true);
const loadError = ref('');
const listError = ref('');
const showForm = ref(false);
const creating = ref(false);
const formError = ref('');
const confirmID = ref<string | null>(null);
const removing = ref(false);
const draft = reactive({ sourceKind: 'timer', criterion: '', sourceSpec: '' });

const kind = computed(() => KINDS.find(k => k.id === draft.sourceKind) ?? KINDS[0]);
const specHint = computed(() => kind.value.hint);
const kindHelp = computed(() => kind.value.help);
// A spec that does not parse used to be replaced with {} without a word: a timer with no interval.
const specError = computed(() => {
  const raw = draft.sourceSpec.trim();
  if (!raw) return '';
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? '' : 'The source spec must be a JSON object, like the placeholder.';
  } catch { return 'The source spec is not valid JSON. Check the quotes and braces against the placeholder.'; }
});
const summary = computed(() => {
  if (loading.value) return 'Reading triggers…';
  if (!hooks.value.length) return 'Timers, webhooks, email and screen watches that wake the agents';
  const live = hooks.value.filter(h => h.enabled && h.armState === 'Armed').length;
  const broken = hooks.value.filter(h => h.enabled && h.armState === 'Error').length;
  return [`${hooks.value.length} ${hooks.value.length === 1 ? 'trigger' : 'triggers'}`, live ? `${live} live` : '', broken ? `${broken} inert` : ''].filter(Boolean).join(' · ');
});

const kindIcon = (k: string) => KINDS.find(x => x.id === k)?.icon ?? 'zap';
const kindTone = (k: string): DmTone => (KINDS.find(x => x.id === k)?.tone ?? 'rest') as DmTone;
function armLabel(state: string) {
  return ({ Armed: 'live', Passive: 'waits for a push', Error: 'inert' } as Record<string, string>)[state] ?? (state || 'unknown');
}
function armTone(state: string): DmTone {
  return state === 'Armed' ? 'work' : state === 'Error' ? 'fault' : 'rest';
}

async function load() {
  loading.value = true;
  loadError.value = '';
  const r = await dmxGet<any[]>(`/demiurge/hooks?stewardID=${encodeURIComponent(props.stewardId)}`);
  loading.value = false;
  if (r.ok && Array.isArray(r.body)) hooks.value = r.body;
  else loadError.value = `Could not load the triggers (${r.status ? `HTTP ${r.status}` : 'network error'}).`;
}

async function create() {
  if (creating.value || specError.value) return;
  creating.value = true;
  formError.value = '';
  const spec = draft.sourceSpec.trim() ? JSON.parse(draft.sourceSpec) : {};
  const r = await dmxPost('/demiurge/hooks/create', {
    stewardID: props.stewardId,
    sourceKind: draft.sourceKind,
    recognitionCriterion: draft.criterion,
    sourceSpecJson: JSON.stringify(spec),
  });
  creating.value = false;
  if (!r.ok) { formError.value = r.error; return; }
  showForm.value = false;
  draft.criterion = ''; draft.sourceSpec = '';
  await load();
}

async function remove(hookID: string) {
  if (removing.value) return;
  removing.value = true;
  listError.value = '';
  const r = await dmxPost(`/demiurge/hooks/delete?stewardID=${encodeURIComponent(props.stewardId)}&hookID=${encodeURIComponent(hookID)}`, null);
  removing.value = false;
  confirmID.value = null;
  if (!r.ok) { listError.value = r.error; return; }
  await load();
}

onMounted(load);
</script>
