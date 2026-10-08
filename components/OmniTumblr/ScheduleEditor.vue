<template>
    <div class="tb-schedule">
        <div class="toprow">
            <div class="ot-field tz">
                <label for="tb-tz">Time zone</label>
                <select id="tb-tz" class="ot-select" :value="timeZone" :disabled="disabled" @change="emit('update:timeZone', ($event.target as HTMLSelectElement).value)">
                    <option v-if="!zones.includes(timeZone)" :value="timeZone">{{ timeZone }}</option>
                    <option v-for="zone in zones" :key="zone" :value="zone">{{ zone }}</option>
                </select>
                <div class="help">
                    Times below are in {{ timeZone }}<template v-if="timeZone !== mine"> ·
                        <button type="button" class="linkish" :disabled="disabled" @click="emit('update:timeZone', mine)">use mine ({{ mine }})</button></template>
                </div>
            </div>
            <div class="presets">
                <span class="label">Quick start</span>
                <div class="ot-segment sm" role="group" aria-label="Schedule presets">
                    <button v-for="preset in PRESETS" :key="preset.label" type="button" :disabled="disabled" @click="applyPreset(preset.slots)">{{ preset.label }}</button>
                </div>
            </div>
        </div>

        <div class="week" role="table" aria-label="Weekly posting times">
            <div v-for="day in WEEK_ORDER" :key="day" class="day" role="row">
                <span class="dayname" role="rowheader">{{ DAY_SHORT[day] }}</span>
                <div class="times" role="cell">
                    <span v-for="slot in slotsFor(day)" :key="slot.Minute" class="time">
                        {{ minuteToHHMM(slot.Minute) }}
                        <button v-if="!disabled" type="button" class="x" :aria-label="`Remove ${DAY_LONG[day]} ${minuteToHHMM(slot.Minute)}`" @click="remove(day, slot.Minute)">×</button>
                    </span>
                    <span v-if="!slotsFor(day).length" class="none">—</span>
                </div>
                <div v-if="!disabled" class="add" role="cell">
                    <input v-model="drafts[day]" type="time" class="ot-input auto" :aria-label="`Add a time on ${DAY_LONG[day]}`" @keydown.enter.prevent="add(day)" />
                    <button type="button" class="ot-btn sm ghost" :disabled="!drafts[day]" @click="add(day)">Add</button>
                    <button v-if="slotsFor(day).length" type="button" class="ot-btn sm ghost" title="Use these times on every day" @click="copyToAll(day)">→ all days</button>
                </div>
            </div>
        </div>
        <p class="summary">
            <strong>{{ slots.length }}</strong> post{{ slots.length === 1 ? '' : 's' }} a week.
            <template v-if="!slots.length"> Autopilot needs at least one time.</template>
        </p>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { DAY_LONG, DAY_SHORT, WEEK_ORDER, browserTimeZone, hhmmToMinute, minuteToHHMM, timeZoneOptions, type WeeklySlot } from '~/composables/useOmniTumblr';

const props = defineProps<{ slots: WeeklySlot[]; timeZone: string; disabled?: boolean }>();
const emit = defineEmits<{ 'update:slots': [value: WeeklySlot[]]; 'update:timeZone': [value: string] }>();

const zones = timeZoneOptions();
const mine = browserTimeZone();
const drafts = reactive<Record<number, string>>({});

const PRESETS: { label: string; slots: WeeklySlot[] }[] = [
    { label: 'Weekly · Fri 18:00', slots: [{ Day: 5, Minute: 18 * 60 }] },
    { label: 'Twice a week', slots: [{ Day: 2, Minute: 18 * 60 }, { Day: 5, Minute: 18 * 60 }] },
    { label: 'Weekdays 12:00', slots: [1, 2, 3, 4, 5].map(d => ({ Day: d, Minute: 12 * 60 })) },
    { label: 'Daily 18:00', slots: [0, 1, 2, 3, 4, 5, 6].map(d => ({ Day: d, Minute: 18 * 60 })) },
    { label: 'Daily ×3', slots: [0, 1, 2, 3, 4, 5, 6].flatMap(d => [9, 14, 20].map(h => ({ Day: d, Minute: h * 60 }))) },
    { label: 'Clear', slots: [] },
];

const sorted = computed(() => [...props.slots].sort((a, b) => a.Day - b.Day || a.Minute - b.Minute));

function slotsFor(day: number) {
    return sorted.value.filter(s => s.Day === day);
}

function set(next: WeeklySlot[]) {
    const unique = new Map<string, WeeklySlot>();
    for (const s of next) unique.set(`${s.Day}:${s.Minute}`, { Day: s.Day, Minute: s.Minute });
    emit('update:slots', [...unique.values()]);
}

function add(day: number) {
    const minute = hhmmToMinute(drafts[day] ?? '');
    if (minute === null) return;
    set([...props.slots, { Day: day, Minute: minute }]);
    drafts[day] = '';
}

function remove(day: number, minute: number) {
    set(props.slots.filter(s => !(s.Day === day && s.Minute === minute)));
}

function copyToAll(day: number) {
    const minutes = slotsFor(day).map(s => s.Minute);
    set([0, 1, 2, 3, 4, 5, 6].flatMap(d => minutes.map(m => ({ Day: d, Minute: m }))));
}

function applyPreset(slots: WeeklySlot[]) {
    set(slots.map(s => ({ ...s })));
}
</script>

<style scoped>
.tb-schedule { display: flex; flex-direction: column; gap: var(--ot-space-3); }
.toprow { display: flex; flex-wrap: wrap; gap: var(--ot-space-4); align-items: flex-end; }
.tz { min-width: 240px; flex: 0 1 320px; }
.presets { display: flex; flex-direction: column; gap: var(--ot-space-1); }
.presets .label { font-size: 11.5px; color: var(--ot-muted); }
.presets .ot-segment { flex-wrap: wrap; }
.week { display: flex; flex-direction: column; border: 1px solid var(--ot-line); border-radius: var(--ot-radius-sm); }
.day { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; gap: var(--ot-space-3); align-items: center; padding: 6px var(--ot-space-3); }
.day + .day { border-top: 1px solid var(--ot-line); }
.dayname { font-weight: 600; color: var(--ot-text-2); font-size: 12.5px; }
.times { display: flex; flex-wrap: wrap; gap: 6px; min-height: 24px; align-items: center; }
.time { display: inline-flex; align-items: center; gap: 4px; padding: 0 8px; border-radius: 999px; background: var(--ot-accent-soft); color: var(--ot-accent); font-family: var(--ot-mono); font-size: 12px; line-height: 24px; }
.time .x { border: 0; background: none; color: inherit; cursor: pointer; padding: 0; font-size: 13px; opacity: 0.75; }
.time .x:hover { opacity: 1; }
.none { color: var(--ot-disabled); }
.add { display: flex; gap: 6px; align-items: center; }
.add input { height: var(--ot-control-sm); }
.summary { margin: 0; font-size: 12.5px; color: var(--ot-text-2); }
.linkish { border: 0; background: none; padding: 0; color: var(--ot-info); cursor: pointer; font-size: inherit; }
@media (max-width: 720px) {
    .day { grid-template-columns: 40px minmax(0, 1fr); }
    .add { grid-column: 1 / -1; }
}
</style>
