<template>
    <div class="tb-heat">
        <div v-if="!cells.length" class="ot-state compact">
            <span class="glyph" aria-hidden="true">○</span>
            <strong>Not enough posts yet</strong>
            <p>Each cell averages the notes of posts published in that hour. It fills in as the blog posts.</p>
        </div>
        <template v-else>
            <div class="grid" role="table" :aria-label="`Average notes by weekday and hour, ${timeZone}`">
                <div class="row head" role="row">
                    <span role="columnheader"></span>
                    <span v-for="h in 24" :key="h" class="hour" role="columnheader">{{ (h - 1) % 3 === 0 ? String(h - 1).padStart(2, '0') : '' }}</span>
                </div>
                <div v-for="day in WEEK_ORDER" :key="day" class="row" role="row">
                    <span class="dayname" role="rowheader">{{ DAY_SHORT[day] }}</span>
                    <span v-for="h in 24" :key="h" class="cell" role="cell"
                          :style="cellStyle(day, h - 1)" :title="cellTitle(day, h - 1)"
                          :class="{ best: best && best.Dow === day && best.Hour === h - 1 }"></span>
                </div>
            </div>
            <div class="legend">
                <span>fewer notes</span>
                <span class="ramp" aria-hidden="true"></span>
                <span>more notes</span>
                <span class="tz">hours in {{ timeZone }} · {{ sampleSize }} posts</span>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { DAY_LONG, DAY_SHORT, WEEK_ORDER } from '~/composables/useOmniTumblr';

const props = withDefaults(defineProps<{
    cells: { Dow: number; Hour: number; Posts: number; AvgNotes: number }[];
    timeZone?: string;
    sampleSize?: number;
}>(), { timeZone: 'UTC', sampleSize: 0 });

const map = computed(() => new Map(props.cells.map(c => [`${c.Dow}:${c.Hour}`, c])));
const max = computed(() => Math.max(1, ...props.cells.map(c => c.AvgNotes)));
const best = computed(() => [...props.cells].filter(c => c.Posts >= 2).sort((a, b) => b.AvgNotes - a.AvgNotes)[0] ?? null);

function cellStyle(day: number, hour: number) {
    const cell = map.value.get(`${day}:${hour}`);
    if (!cell) return {};
    // Square-root scale: one viral post should not wash every other cell out.
    const t = Math.sqrt(cell.AvgNotes / max.value);
    const alpha = 0.12 + 0.88 * t;
    return { background: `rgba(57, 135, 229, ${alpha.toFixed(3)})`, borderColor: 'transparent' };
}

function cellTitle(day: number, hour: number) {
    const cell = map.value.get(`${day}:${hour}`);
    const span = `${DAY_LONG[day]} ${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`;
    return cell ? `${span}: ${cell.AvgNotes} notes on average over ${cell.Posts} post(s)` : `${span}: no posts`;
}
</script>

<style scoped>
.tb-heat { display: flex; flex-direction: column; gap: var(--ot-space-2); overflow-x: auto; }
.grid { display: flex; flex-direction: column; gap: 3px; min-width: 420px; }
.row { display: grid; grid-template-columns: 36px repeat(24, minmax(0, 1fr)); gap: 3px; align-items: center; }
.hour { font-size: 10px; color: var(--ot-axis); font-family: var(--ot-mono); }
.dayname { font-size: 11px; color: var(--ot-text-2); }
.cell { height: 18px; border-radius: 3px; border: 1px solid var(--ot-line); }
.cell.best { outline: 2px solid var(--ot-accent); outline-offset: 0; }
.legend { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ot-space-1) var(--ot-space-2); font-size: 11px; color: var(--ot-muted); }
.legend > span { white-space: nowrap; }
.ramp { width: 120px; height: 8px; border-radius: 4px; background: linear-gradient(90deg, rgba(57, 135, 229, 0.12), rgba(57, 135, 229, 1)); }
.tz { margin-left: auto; }
</style>
