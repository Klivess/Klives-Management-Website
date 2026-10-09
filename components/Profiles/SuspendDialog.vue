<template>
    <ProfilesModal :open="open" :title="`Suspend ${name}`" tone="warn" @close="$emit('close')">
        <p class="pc-lede">
            A suspended profile stays signed in but can't use anything until the time is up — every tab shows why and
            for how long, and unlocks by itself when it ends.
        </p>

        <fieldset class="pc-durations">
            <legend>For how long</legend>
            <div class="ot-segment" role="group" aria-label="Suspension length">
                <button v-for="d in DURATIONS" :key="d.minutes" type="button" :aria-pressed="choice === d.minutes" @click="choice = d.minutes">{{ d.label }}</button>
                <button type="button" :aria-pressed="choice === 'custom'" @click="choice = 'custom'">Until…</button>
            </div>
            <input v-if="choice === 'custom'" v-model="untilLocal" type="datetime-local" class="ot-input auto pc-until" :min="minLocal" aria-label="Suspend until" />
            <p class="pc-help">Lifts {{ liftsText }}.</p>
        </fieldset>

        <div class="ot-field">
            <label for="pc-suspend-reason">Reason <span class="pc-optional">(shown to them)</span></label>
            <textarea id="pc-suspend-reason" v-model="reason" class="ot-input" rows="3" maxlength="300" placeholder="e.g. Taking a break while we review the OmniTrader settings"></textarea>
        </div>

        <p v-if="error" class="pc-error" role="alert">{{ error }}</p>

        <template #footer>
            <button type="button" class="ot-btn ghost" @click="$emit('close')">Cancel</button>
            <button type="button" class="ot-btn warn" :disabled="busy || !valid" @click="confirm">
                <AccessIcon name="pause" :size="15" /> {{ busy ? 'Suspending…' : 'Suspend' }}
            </button>
        </template>
    </ProfilesModal>
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

function toLocalInput(ms: number) {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const minLocal = computed(() => toLocalInput(Date.now() + 60_000));
const untilMs = computed(() => {
    if (choice.value === 'custom') {
        const ms = Date.parse(untilLocal.value);
        return Number.isFinite(ms) ? ms : null;
    }
    return Date.now() + choice.value * 60_000;
});
const valid = computed(() => untilMs.value !== null && untilMs.value > Date.now());
const liftsText = computed(() => (untilMs.value ? `${untilTime(untilMs.value)} (${fmtDateTime(untilMs.value)})` : 'when you pick a time'));

watch(() => props.open, open => {
    if (!open) return;
    choice.value = 60;
    untilLocal.value = toLocalInput(Date.now() + 24 * 3_600_000);
    reason.value = '';
});

function confirm() {
    if (!valid.value) return;
    const options = choice.value === 'custom'
        ? { untilUtc: new Date(untilMs.value!).toISOString() }
        : { minutes: choice.value };
    emit('confirm', options, reason.value.trim());
}
</script>

<style scoped>
.pc-lede { color: var(--ot-text-2); font-size: 13px; margin-bottom: 14px; }
.pc-durations { border: 0; padding: 0; margin: 0 0 14px; display: flex; flex-direction: column; gap: 8px; }
.pc-durations legend { font-size: 12px; font-weight: 600; color: var(--ot-text-2); margin-bottom: 6px; padding: 0; }
.pc-durations .ot-segment { flex-wrap: wrap; width: fit-content; max-width: 100%; }
.pc-until { color-scheme: dark; width: fit-content; }
.pc-help { font-size: 12px; color: var(--ot-muted); }
.pc-optional { color: var(--ot-muted); font-weight: 400; }
.pc-error { margin-top: 10px; color: var(--ot-negative); font-size: 12.5px; }
.ot-field label { font-size: 12px; font-weight: 600; color: var(--ot-text-2); }
</style>
