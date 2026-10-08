<template>
    <!-- Notes earned per publishing day. Bars rather than lines: a post count (0–3) and a
         note count (0–thousands) never share an axis, and days without posts stay empty. -->
    <div class="ot-chart" ref="host">
        <div v-if="!hasPosts" class="ot-state compact">
            <span class="glyph" aria-hidden="true">○</span>
            <strong>No posts in this range</strong>
        </div>

        <template v-else>
            <div class="head">
                <div class="ot-legend">
                    <span class="item"><span class="swatch" :style="{ background: OURS }"></span>Posted by OmniTumblr</span>
                    <span class="item"><span class="swatch" :style="{ background: OTHERS }"></span>Posted elsewhere</span>
                </div>
                <div class="spacer"></div>
                <button class="ot-btn ghost sm" :aria-pressed="showTable" @click="showTable = !showTable">
                    {{ showTable ? 'Show chart' : 'Show data' }}
                </button>
            </div>

            <svg v-show="!showTable" :width="width" :height="height" tabindex="0" role="img" :aria-label="summary"
                 @mousemove="onMove" @mouseleave="focusIndex = null"
                 @keydown.left.prevent="step(-1)" @keydown.right.prevent="step(1)"
                 @focus="focusIndex = focusIndex ?? lastPostedIndex" @blur="focusIndex = null">
                <g>
                    <line v-for="t in yTicks" :key="`g${t}`" class="grid"
                          :x1="margin.left" :x2="width - margin.right" :y1="yAt(t)" :y2="yAt(t)" />
                    <text v-for="t in yTicks" :key="`yt${t}`" class="tick"
                          :x="margin.left - 6" :y="yAt(t) + 3" text-anchor="end">{{ fmtCount(t) }}</text>
                    <text v-for="t in xTicks" :key="`xt${t.index}`" class="tick"
                          :x="t.x" :y="height - 6" :text-anchor="t.anchor">{{ t.label }}</text>
                </g>
                <rect v-if="focusIndex !== null" class="band" :x="margin.left + focusIndex * slot" :y="margin.top"
                      :width="slot" :height="plotHeight" />
                <g>
                    <template v-for="bar in bars" :key="bar.key">
                        <rect v-for="(seg, j) in bar.segments" :key="j" :x="bar.x" :y="seg.y" :width="barWidth"
                              :height="seg.height" :fill="seg.fill" rx="1" />
                    </template>
                </g>
            </svg>

            <div v-if="focusBucket && !showTable" class="ot-tooltip" :style="tooltipStyle">
                <div class="t">{{ focusBucket.label }}</div>
                <template v-if="focusBucket.ours + focusBucket.others > 0">
                    <div v-if="focusBucket.ours" class="r"><span><span class="swatch" :style="{ background: OURS }"></span> by OmniTumblr</span><span class="v">{{ focusBucket.ours }}</span></div>
                    <div v-if="focusBucket.others" class="r"><span><span class="swatch" :style="{ background: OTHERS }"></span> elsewhere</span><span class="v">{{ focusBucket.others }}</span></div>
                    <div class="r"><span>notes</span><span class="v">{{ fmtCount(focusBucket.notes) }}</span></div>
                </template>
                <div v-else class="r"><span>no posts</span></div>
            </div>

            <div v-if="showTable" class="ot-tablewrap" style="max-height:300px">
                <table class="ot-table">
                    <thead>
                        <tr><th>{{ weekly ? 'Week of' : 'Day' }}</th><th class="num">By OmniTumblr</th><th class="num">Elsewhere</th><th class="num">Notes</th></tr>
                    </thead>
                    <tbody>
                        <tr v-for="b in postedBuckets" :key="b.key">
                            <td>{{ b.label }}</td><td class="num">{{ b.ours }}</td><td class="num">{{ b.others }}</td><td class="num">{{ fmtCount(b.notes) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { fmtCount } from '~/composables/useOmniTumblr';

interface PostingDay { Day: string; Ours: number; Others: number; Notes: number }
interface Bucket { key: string; label: string; ours: number; others: number; notes: number }

const props = withDefaults(defineProps<{ days: PostingDay[]; height?: number }>(), { height: 230 });

const OURS = 'var(--ot-cat-1)';
const OTHERS = 'var(--ot-cat-4)';
const margin = { top: 12, right: 10, bottom: 26, left: 46 };

const host = ref<HTMLElement | null>(null);
const width = ref(560);
const showTable = ref(false);
const focusIndex = ref<number | null>(null);

let observer: ResizeObserver | null = null;
onMounted(() => {
    if (!host.value) return;
    observer = new ResizeObserver(entries => { width.value = Math.max(280, Math.floor(entries[0].contentRect.width)); });
    observer.observe(host.value);
    width.value = Math.max(280, Math.floor(host.value.clientWidth));
});
onBeforeUnmount(() => observer?.disconnect());

const dayLabel = (day: string, opts: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, opts);

/** Over four months, daily bars get thinner than a pixel; weeks keep them readable. */
const weekly = computed(() => props.days.length > 120);
const buckets = computed<Bucket[]>(() => {
    if (!weekly.value) {
        return props.days.map(d => ({
            key: d.Day, label: dayLabel(d.Day, { weekday: 'short', day: 'numeric', month: 'short' }),
            ours: d.Ours, others: d.Others, notes: d.Notes,
        }));
    }
    const out: Bucket[] = [];
    for (let i = 0; i < props.days.length; i += 7) {
        const week = props.days.slice(i, i + 7);
        out.push({
            key: week[0].Day, label: dayLabel(week[0].Day, { day: 'numeric', month: 'short', year: 'numeric' }),
            ours: week.reduce((a, d) => a + d.Ours, 0),
            others: week.reduce((a, d) => a + d.Others, 0),
            notes: week.reduce((a, d) => a + d.Notes, 0),
        });
    }
    return out;
});
const postedBuckets = computed(() => buckets.value.filter(b => b.ours + b.others > 0));
const hasPosts = computed(() => postedBuckets.value.length > 0);
const lastPostedIndex = computed(() => {
    for (let i = buckets.value.length - 1; i >= 0; i--) if (buckets.value[i].ours + buckets.value[i].others > 0) return i;
    return 0;
});

/** 1, 2, 2.5 or 5 × 10^k: gridlines on round numbers. */
function niceStep(raw: number): number {
    const power = 10 ** Math.floor(Math.log10(raw));
    const f = raw / power;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * power;
}
const yScale = computed(() => {
    const max = Math.max(...buckets.value.map(b => b.notes), 0);
    const step = max <= 4 ? 1 : niceStep(max / 4);
    const top = Math.max(step, Math.ceil(max / step) * step);
    return { step, top };
});
const yTicks = computed(() => {
    const { step, top } = yScale.value;
    const ticks: number[] = [];
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
    return ticks;
});

const plotWidth = computed(() => width.value - margin.left - margin.right);
const plotHeight = computed(() => props.height - margin.top - margin.bottom);
const slot = computed(() => plotWidth.value / Math.max(1, buckets.value.length));
const barWidth = computed(() => (slot.value < 4 ? Math.max(1, slot.value - 0.5) : Math.min(28, slot.value * 0.7)));
const yAt = (v: number) => margin.top + plotHeight.value - (v / yScale.value.top) * plotHeight.value;

const bars = computed(() => buckets.value.flatMap((b, i) => {
    const posts = b.ours + b.others;
    if (!posts) return [];
    // A post that earned nothing still shows, as a sliver on the baseline.
    const total = Math.max(2, (b.notes / yScale.value.top) * plotHeight.value);
    const base = margin.top + plotHeight.value;
    const oursHeight = total * (b.ours / posts);
    const segments = [
        { y: base - oursHeight, height: oursHeight, fill: OURS },
        { y: base - total, height: total - oursHeight, fill: OTHERS },
    ].filter(s => s.height > 0);
    return [{ key: b.key, x: margin.left + i * slot.value + (slot.value - barWidth.value) / 2, segments }];
}));

const xTicks = computed(() => {
    const n = buckets.value.length;
    if (!n) return [];
    const count = Math.min(n, width.value < 520 ? 3 : 5);
    const indices = count === 1 ? [0] : Array.from({ length: count }, (_, k) => Math.round((k * (n - 1)) / (count - 1)));
    return [...new Set(indices)].map((index, k, all) => ({
        index,
        x: margin.left + index * slot.value + slot.value / 2,
        anchor: k === 0 ? 'start' : k === all.length - 1 ? 'end' : 'middle',
        label: dayLabel(buckets.value[index].key, { day: '2-digit', month: 'short' }),
    }));
});

const focusBucket = computed(() => (focusIndex.value === null ? null : buckets.value[focusIndex.value] ?? null));

function onMove(event: MouseEvent) {
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    const index = Math.floor((event.clientX - rect.left - margin.left) / slot.value);
    focusIndex.value = index >= 0 && index < buckets.value.length ? index : null;
}
function step(delta: number) {
    const n = buckets.value.length;
    if (!n) return;
    focusIndex.value = Math.max(0, Math.min(n - 1, (focusIndex.value ?? lastPostedIndex.value) + delta));
}

const tooltipStyle = computed(() => {
    if (focusIndex.value === null) return {};
    const x = margin.left + (focusIndex.value + 0.5) * slot.value;
    const flip = x > width.value - 180;
    return { left: `${flip ? x - 160 : x + 12}px`, top: `${margin.top + 8}px` };
});

const summary = computed(() => {
    const posted = postedBuckets.value;
    if (!posted.length) return 'No posts in this range';
    const posts = posted.reduce((a, b) => a + b.ours + b.others, 0);
    const notes = posted.reduce((a, b) => a + b.notes, 0);
    const best = posted.reduce((a, b) => (b.notes > a.notes ? b : a));
    return `${posts} posts on ${posted.length} ${weekly.value ? 'weeks' : 'days'} earned ${fmtCount(notes)} notes; `
        + `best was ${best.label} with ${fmtCount(best.notes)}. Use arrow keys to read individual ${weekly.value ? 'weeks' : 'days'}.`;
});
</script>

<style scoped>
.head { display: flex; align-items: center; gap: var(--ot-space-3); margin-bottom: var(--ot-space-2); }
.head .spacer { flex: 1 1 auto; }
.band { fill: var(--ot-text-2); opacity: 0.08; }
svg:focus-visible { outline: var(--ot-focus) solid var(--ot-accent); outline-offset: 2px; }
.swatch { display: inline-block; width: 8px; height: 8px; border-radius: 2px; }
.ot-legend .swatch { width: 10px; height: 10px; }
</style>
