<template>
    <!-- When the sources' reels were posted on Instagram, in the viewer's time zone. -->
    <div class="ms-heat">
        <div v-if="!cells.length" class="ot-state compact">
            <span class="glyph" aria-hidden="true">○</span>
            <strong>No posting times in this window</strong>
            <p>Reels without an Instagram posting time (some fallback scrapes) are left out.</p>
        </div>
        <template v-else>
            <div class="bar">
                <div class="ot-segment sm" role="group" aria-label="Colour by">
                    <button type="button" :aria-pressed="metric === 'reels'" @click="metric = 'reels'">Reels posted</button>
                    <button type="button" :aria-pressed="metric === 'views'" @click="metric = 'views'">Average views</button>
                </div>
                <span class="best" v-if="bestLabel">{{ metric === 'reels' ? 'Busiest' : 'Best' }}: <b>{{ bestLabel }}</b></span>
            </div>
            <div class="grid" role="table" :aria-label="`${metric === 'reels' ? 'Reels posted' : 'Average views'} by weekday and hour, ${timeZone}`">
                <div class="row head" role="row">
                    <span role="columnheader"></span>
                    <span v-for="h in 24" :key="h" class="hour" role="columnheader">{{ (h - 1) % 3 === 0 ? String(h - 1).padStart(2, '0') : '' }}</span>
                </div>
                <div v-for="day in WEEK_ORDER" :key="day" class="row" role="row">
                    <span class="dayname" role="rowheader">{{ DAY_SHORT[day] }}</span>
                    <span v-for="h in 24" :key="h" class="cell" role="cell" :style="cellStyle(day, h - 1)" :title="cellTitle(day, h - 1)"
                          :class="{ best: best && best.Dow === day && best.Hour === h - 1 }"></span>
                </div>
            </div>
            <div class="legend">
                <span>{{ metric === 'reels' ? 'fewer' : 'lower' }}</span>
                <span class="ramp" aria-hidden="true"></span>
                <span>{{ metric === 'reels' ? 'more' : 'higher' }}</span>
                <span class="tz">{{ timeZone }} · {{ sample.toLocaleString() }} reels</span>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { type HeatCell } from '~/composables/useMemeScraper';
import { DAY_LONG, DAY_SHORT, WEEK_ORDER, fmtCount } from '~/composables/useOmniTumblr';

const props = withDefaults(defineProps<{ cells: HeatCell[]; timeZone?: string }>(), { timeZone: 'UTC' });

const metric = ref<'reels' | 'views'>('reels');
const map = computed(() => new Map(props.cells.map(c => [`${c.Dow}:${c.Hour}`, c])));
const sample = computed(() => props.cells.reduce((a, c) => a + c.Reels, 0));
// An average over one or two reels is noise; those cells are drawn faintly in views mode.
const minReels = computed(() => Math.max(2, Math.ceil(sample.value * 0.005)));
const value = (c: HeatCell) => (metric.value === 'reels' ? c.Reels : c.AvgViews);
const max = computed(() => Math.max(1, ...props.cells.filter(c => metric.value === 'reels' || c.Reels >= minReels.value).map(value)));
const best = computed(() => [...props.cells]
    .filter(c => metric.value === 'reels' || c.Reels >= minReels.value)
    .sort((a, b) => value(b) - value(a))[0] ?? null);
const bestLabel = computed(() => (best.value ? `${DAY_LONG[best.value.Dow]} ${String(best.value.Hour).padStart(2, '0')}:00` : null));

function cellStyle(day: number, hour: number) {
    const cell = map.value.get(`${day}:${hour}`);
    if (!cell) return {};
    const thin = metric.value === 'views' && cell.Reels < minReels.value;
    // Square-root scale: one viral hour should not wash every other cell out.
    const t = Math.sqrt(Math.min(1, value(cell) / max.value));
    const alpha = thin ? 0.08 : 0.12 + 0.88 * t;
    return { background: `rgba(57, 135, 229, ${alpha.toFixed(3)})`, borderColor: 'transparent' };
}

function cellTitle(day: number, hour: number) {
    const cell = map.value.get(`${day}:${hour}`);
    const span = `${DAY_LONG[day]} ${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`;
    return cell ? `${span}: ${cell.Reels} reel${cell.Reels === 1 ? '' : 's'}, ${fmtCount(cell.AvgViews)} views on average` : `${span}: no reels`;
}
</script>

<style scoped>
.ms-heat { display: flex; flex-direction: column; gap: var(--ot-space-2); overflow-x: auto; }
.bar { display: flex; align-items: center; gap: var(--ot-space-3); flex-wrap: wrap; }
.best { font-size: 12px; color: var(--ot-text-2); }
.grid { display: flex; flex-direction: column; gap: 3px; min-width: 420px; }
.row { display: grid; grid-template-columns: 36px repeat(24, minmax(0, 1fr)); gap: 3px; align-items: center; }
.hour { font-size: 10px; color: var(--ot-axis); font-family: var(--ot-mono); }
.dayname { font-size: 11px; color: var(--ot-text-2); }
.cell { height: 16px; border-radius: 3px; border: 1px solid var(--ot-line); }
.cell.best { outline: 2px solid var(--ot-accent); outline-offset: 0; }
.legend { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ot-space-1) var(--ot-space-2); font-size: 11px; color: var(--ot-muted); }
.legend > span { white-space: nowrap; }
.ramp { width: 120px; height: 8px; border-radius: 4px; background: linear-gradient(90deg, rgba(57, 135, 229, 0.12), rgba(57, 135, 229, 1)); }
.tz { margin-left: auto; }
</style>
