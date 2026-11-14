<template>
  <PeopleDialog :open="open" :title="`Suspend ${name}`" sub="They stay signed in but can't use anything until the time is up. Every tab shows why, and unlocks by itself." icon="pause" tone="warn" testid="pfx-suspend" @close="emit('close')">
    <div class="pfx-label">For how long</div>
    <div class="pfx-seg" role="group" aria-label="Suspension length" style="margin-bottom: 8px">
      <button v-for="d in DURATIONS" :key="d.minutes" type="button" class="pfx-seg__opt" :aria-pressed="choice === d.minutes" @click="choice = d.minutes">{{ d.label }}</button>
      <button type="button" class="pfx-seg__opt" :aria-pressed="choice === 'custom'" @click="choice = 'custom'">Until…</button>
    </div>
    <input v-if="choice === 'custom'" v-model="untilLocal" type="datetime-local" class="pfx-input" :min="minLocal" aria-label="Suspend until" />
    <p class="pfx-help">Lifts {{ liftsText }}.</p>

    <label class="pfx-label" for="pfx-suspend-reason" style="margin-top: 12px">Reason <span class="pfx-dim" style="font-weight: 400">(shown to them)</span></label>
    <textarea id="pfx-suspend-reason" v-model="reason" class="pfx-textarea" rows="3" maxlength="300" placeholder="e.g. Taking a break while we review the OmniTrader settings"></textarea>
    <p v-if="error" class="pfx-error" role="alert">{{ error }}</p>

    <template #actions>
      <button type="button" class="pfx-btn pfx-btn--ghost" @click="emit('close')">Cancel</button>
      <button type="button" class="pfx-btn pfx-btn--warn" :disabled="busy || !valid" data-testid="pfx-suspend-confirm" @click="confirm">
        <PeopleIcon name="pause" />{{ busy ? 'Suspending…' : 'Suspend' }}
      </button>
    </template>
  </PeopleDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fmtDateTime, untilTime } from '~/scripts/profileFormat';

const props = defineProps<{ open: boolean; name: string; busy?: boolean; error?: string | null }>();
const emit = defineEmits<{ close: []; confirm: [options: { minutes?: number; untilUtc?: string }, reason: string] }>();

const DURATIONS = [
  { minutes: 15, label: '15 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 60 * 24, label: '1 day' },
  { minutes: 60 * 24 * 7, label: '1 week' },
];

const choice = ref<number | 'custom'>(60);
const untilLocal = ref('');
const reason = ref('');

watch(() => props.open, open => {
  if (!open) return;
  choice.value = 60;
  untilLocal.value = '';
  reason.value = '';
});

function toLocalInput(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const minLocal = computed(() => toLocalInput(Date.now() + 60_000));
const untilMs = computed(() => (choice.value === 'custom' ? (untilLocal.value ? new Date(untilLocal.value).getTime() : NaN) : Date.now() + choice.value * 60_000));
const valid = computed(() => Number.isFinite(untilMs.value) && untilMs.value > Date.now());
const liftsText = computed(() => (valid.value ? `${untilTime(untilMs.value)} (${fmtDateTime(untilMs.value)})` : 'when you pick a time'));

function confirm() {
  if (!valid.value) return;
  if (choice.value === 'custom') emit('confirm', { untilUtc: new Date(untilMs.value).toISOString() }, reason.value.trim());
  else emit('confirm', { minutes: choice.value }, reason.value.trim());
}
</script>
