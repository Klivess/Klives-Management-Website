<template>
  <span class="he-wrap">
    <button class="pjx-btn pjx-btn--ghost" title="Download the full lossless conversation history as CSV" @click="openDialog">
      <ProjectsIcon name="download" />Export
    </button>

    <ProjectsDialog :open="open" title="Export history" subtitle="The full lossless event log as CSV: every message, tool call, tool result, artifact reference, author and timestamp." @close="open = false">
      <div class="he-body">
        <div class="pjx-seg he-presets" role="group" aria-label="Timeframe">
          <button v-for="p in presets" :key="p.id" type="button" class="pjx-seg__opt" :aria-pressed="activePreset === p.id" @click="applyPreset(p.id)">{{ p.label }}</button>
        </div>
        <div class="he-range" :data-off="mode === 'all' || undefined">
          <div class="pjx-field">
            <label class="pjx-field__label" for="he-from">From</label>
            <input id="he-from" v-model="fromValue" type="datetime-local" class="pjx-input" :disabled="mode === 'all'" @input="activePreset = 'custom'" />
          </div>
          <div class="pjx-field">
            <label class="pjx-field__label" for="he-to">To</label>
            <input id="he-to" v-model="toValue" type="datetime-local" class="pjx-input" :disabled="mode === 'all'" @input="activePreset = 'custom'" />
          </div>
        </div>
        <p v-if="mode === 'all'" class="pjx-note">Exports the project's entire history, from the very first event.</p>
        <p v-else-if="rangeInvalid" class="pjx-note" data-tone="fault">“From” must be before “To”.</p>
        <p v-if="error" class="pjx-note" data-tone="fault" role="alert">{{ error }}</p>
      </div>
      <template #foot>
        <button class="pjx-btn" @click="open = false">Cancel</button>
        <button class="pjx-btn pjx-btn--primary" :disabled="busy || rangeInvalid" @click="downloadCsv"><ProjectsIcon name="download" />{{ busy ? 'Preparing…' : 'Download CSV' }}</button>
      </template>
    </ProjectsDialog>
  </span>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';
import ProjectsDialog from '~/components/Projects/Dialog.vue';
import ProjectsIcon from '~/components/Projects/Icon.vue';

const props = defineProps<{ projectId: string }>();

const open = ref(false);
const busy = ref(false);
const error = ref('');

// 'all' = whole log (no bounds sent); 'range' = the from/to inputs are honoured.
const mode = ref<'all' | 'range'>('range');
const activePreset = ref<string>('7d');
const fromValue = ref('');
const toValue = ref('');

const presets = [
  { id: '24h', label: 'Last 24 hours', hours: 24 },
  { id: '7d', label: 'Last 7 days', hours: 24 * 7 },
  { id: '30d', label: 'Last 30 days', hours: 24 * 30 },
  { id: 'all', label: 'All time', hours: 0 },
];

// datetime-local wants a local "YYYY-MM-DDTHH:mm" with no timezone suffix.
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function applyPreset(id: string) {
  activePreset.value = id;
  if (id === 'all') { mode.value = 'all'; return; }
  mode.value = 'range';
  if (id === 'custom') return;
  const preset = presets.find(p => p.id === id);
  if (!preset) return;
  const now = new Date();
  const from = new Date(now.getTime() - preset.hours * 3600 * 1000);
  fromValue.value = toLocalInput(from);
  toValue.value = toLocalInput(now);
}

const rangeInvalid = computed(() => {
  if (mode.value === 'all') return false;
  if (!fromValue.value || !toValue.value) return false; // open-ended bound is allowed
  return new Date(fromValue.value).getTime() >= new Date(toValue.value).getTime();
});

function openDialog() {
  error.value = '';
  applyPreset('7d'); // sensible default whenever the dialog opens
  open.value = true;
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function downloadCsv() {
  if (busy.value || rangeInvalid.value) return;
  error.value = '';
  busy.value = true;
  try {
    const params = new URLSearchParams({ projectID: props.projectId });
    if (mode.value === 'range') {
      // datetime-local values are local time; toISOString normalises them to the UTC the API expects.
      if (fromValue.value) params.set('from', new Date(fromValue.value).toISOString());
      if (toValue.value) params.set('to', new Date(toValue.value).toISOString());
    }
    const res = await RequestGETFromKliveAPI(`/projects/events/export?${params.toString()}`, false, false);
    if (!res.ok) { error.value = `Export failed (HTTP ${res.status}). Try again.`; return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `project-history-${stamp()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    open.value = false;
  } catch (e: any) {
    error.value = e?.message ? `Export failed: ${e.message}` : 'Export failed.';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.he-wrap { display: inline-flex; }
.he-body { display: flex; flex-direction: column; gap: 12px; }
.he-presets { align-self: flex-start; }
.he-range { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.he-range[data-off] { opacity: 0.45; }
.he-range input { color-scheme: dark; }
</style>
