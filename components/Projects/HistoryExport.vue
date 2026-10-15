<template>
  <span class="he-wrap">
    <button class="ot-btn ghost" title="Download the full lossless conversation history as CSV" @click="openDialog">
      ⤓ Export history
    </button>

    <transition name="he-fade">
      <div v-if="open" class="he-backdrop" @click.self="open = false">
        <div class="he-modal">
          <div class="he-head">
            <h3>Export history</h3>
            <button class="he-close" @click="open = false">✕</button>
          </div>

          <p class="he-sub">
            Downloads the full lossless event log — every message, tool call, tool result, artifact
            reference, author and timestamp — as a CSV over the timeframe you pick.
          </p>

          <div class="he-presets">
            <button
              v-for="p in presets"
              :key="p.id"
              class="he-chip"
              :class="{ active: activePreset === p.id }"
              @click="applyPreset(p.id)"
            >{{ p.label }}</button>
          </div>

          <div class="he-range" :class="{ disabled: mode === 'all' }">
            <label class="he-field">
              <span>From</span>
              <input v-model="fromValue" type="datetime-local" :disabled="mode === 'all'" @input="activePreset = 'custom'" />
            </label>
            <label class="he-field">
              <span>To</span>
              <input v-model="toValue" type="datetime-local" :disabled="mode === 'all'" @input="activePreset = 'custom'" />
            </label>
          </div>
          <p v-if="mode === 'all'" class="he-hint">Exporting the project's entire history from the very first event.</p>
          <p v-else-if="rangeInvalid" class="he-error">“From” must be before “To”.</p>

          <div v-if="error" class="he-error">{{ error }}</div>

          <div class="he-actions">
            <button class="he-cancel" @click="open = false">Cancel</button>
            <button class="he-go" :disabled="busy || rangeInvalid" @click="downloadCsv">
              {{ busy ? 'Preparing…' : 'Download CSV' }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </span>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

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
.ctrl { background: var(--ot-surface-2); color: var(--ot-text-2); border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 14px; }
.ctrl:hover { background: var(--ot-surface-3); color: var(--ot-text); }

.he-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 50; display: flex; align-items: center; justify-content: center; padding: 20px; }
.he-modal { width: min(460px, 94vw); background: var(--ot-surface); border: 1px solid var(--ot-line); border-radius: 10px; padding: 20px; color: var(--ot-text); box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
.he-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.he-head h3 { margin: 0; font-size: 17px; }
.he-close { background: none; border: none; color: var(--ot-muted); font-size: 16px; cursor: pointer; }
.he-close:hover { color: var(--ot-text); }
.he-sub { font-size: 12px; color: var(--ot-muted); line-height: 1.5; margin: 0 0 14px; }

.he-presets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.he-chip { background: var(--ot-surface-2); border: 1px solid var(--ot-line); color: var(--ot-text-2); padding: 6px 12px; border-radius: 16px; cursor: pointer; font-size: 12px; }
.he-chip:hover { border-color: var(--ot-line-strong); color: var(--ot-text); }
.he-chip.active { background: var(--ot-positive-soft); border-color: var(--ot-accent); color: var(--ot-positive); }

.he-range { display: flex; gap: 12px; }
.he-range.disabled { opacity: 0.4; }
.he-field { flex: 1; display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--ot-muted); text-transform: uppercase; letter-spacing: 0.03em; }
.he-field input { background: var(--ot-surface-2); color: var(--ot-text); border: 1px solid var(--ot-line-strong); border-radius: 6px; padding: 7px 8px; font-size: 13px; color-scheme: dark; }
.he-field input:disabled { cursor: not-allowed; }

.he-hint { font-size: 12px; color: var(--ot-muted); margin: 10px 0 0; }
.he-error { font-size: 12px; color: var(--ot-negative); margin: 10px 0 0; }

.he-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.he-cancel { background: var(--ot-surface-2); color: var(--ot-text-2); border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
.he-go { background: var(--ot-accent); color: var(--ot-on-accent); border: none; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.he-go:disabled { opacity: 0.5; cursor: default; }

.he-fade-enter-active, .he-fade-leave-active { transition: opacity 0.15s; }
.he-fade-enter-from, .he-fade-leave-to { opacity: 0; }
</style>
