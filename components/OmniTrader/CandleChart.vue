<template>
    <div class="candle-root">
        <div v-if="!candles.length" class="ot-state">
            <span class="glyph" aria-hidden="true">○</span>
            <strong>{{ emptyTitle }}</strong>
            <p v-if="emptyText">{{ emptyText }}</p>
        </div>

        <template v-else>
            <!-- The readout is the chart's text equivalent and its hover output at once: the
                 values under the crosshair, in words, instead of only inside the canvas. -->
            <div class="readout" role="status" aria-live="off">
                <span class="when">{{ readout.when }}</span>
                <span class="ohlc">
                    <span>O <b>{{ readout.open }}</b></span>
                    <span>H <b>{{ readout.high }}</b></span>
                    <span>L <b>{{ readout.low }}</b></span>
                    <span>C <b :class="readout.tone">{{ readout.close }}</b></span>
                    <span v-if="readout.change" :class="readout.tone">{{ readout.change }}</span>
                </span>
                <span class="vol" v-if="readout.volume">Vol {{ readout.volume }}</span>
            </div>

            <div ref="host" class="canvas" :style="{ height: `${height}px` }"></div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { fmtCompact, fmtNum } from '~/composables/useOmniTrader';

export interface Candle { Ts: string; Open: number; High: number; Low: number; Close: number; Volume: number }

const props = withDefaults(defineProps<{
    candles: Candle[];
    height?: number;
    /** Decimal places for prices; equities want 2, crypto pairs often want more. */
    precision?: number;
    emptyTitle?: string;
    emptyText?: string;
}>(), { height: 420, precision: 2, emptyTitle: 'No price history' });

const host = ref<HTMLElement | null>(null);
const hovered = ref<Candle | null>(null);

let chart: any = null;
let candleSeries: any = null;
let volumeSeries: any = null;
let resizeObserver: ResizeObserver | null = null;

// The default readout is the most recent bar, so the panel is never blank before
// the pointer has been anywhere near the chart.
const active = computed(() => hovered.value ?? props.candles[props.candles.length - 1] ?? null);

const readout = computed(() => {
    const c = active.value;
    if (!c) return { when: '', open: '—', high: '—', low: '—', close: '—', change: '', volume: '', tone: '' };
    const change = c.Open > 0 ? ((c.Close - c.Open) / c.Open) * 100 : 0;
    return {
        // Bars are stamped in UTC and read back in UTC. A chart that silently renders
        // local time makes two operators disagree about when something happened.
        when: `${new Date(c.Ts).toLocaleString(undefined, {
            dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
        })} UTC`,
        open: fmtNum(c.Open, props.precision),
        high: fmtNum(c.High, props.precision),
        low: fmtNum(c.Low, props.precision),
        close: fmtNum(c.Close, props.precision),
        change: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
        volume: c.Volume ? fmtCompact(c.Volume) : '',
        tone: change > 0 ? 'pos' : change < 0 ? 'neg' : '',
    };
});

function toSeries() {
    // lightweight-charts wants seconds, and refuses duplicate or unordered stamps.
    const seen = new Set<number>();
    const bars: any[] = [];
    const volumes: any[] = [];
    for (const c of [...props.candles].sort((a, b) => +new Date(a.Ts) - +new Date(b.Ts))) {
        const time = Math.floor(new Date(c.Ts).getTime() / 1000);
        if (!Number.isFinite(time) || seen.has(time)) continue;
        seen.add(time);
        bars.push({ time, open: c.Open, high: c.High, low: c.Low, close: c.Close });
        volumes.push({
            time,
            value: c.Volume,
            color: c.Close >= c.Open ? 'rgba(78, 201, 138, 0.32)' : 'rgba(255, 123, 123, 0.32)',
        });
    }
    return { bars, volumes };
}

async function build() {
    if (!props.candles.length) return;
    // The host element lives inside `v-else`, so it does not exist until the DOM has been
    // patched for the first non-empty candle set. Waiting for that patch is what makes the
    // chart appear at all: without it `build` bailed on a null host and was never retried,
    // leaving the readout row above an empty canvas.
    await nextTick();
    if (!host.value || chart) return;

    const { createChart, CrosshairMode } = await import('lightweight-charts');

    chart = createChart(host.value, {
        height: props.height,
        layout: {
            background: { color: 'transparent' },
            textColor: '#93a48d',
            fontFamily: "'Inter', 'Roboto', sans-serif",
            fontSize: 11,
        },
        grid: {
            vertLines: { color: 'rgba(146, 196, 130, 0.07)' },
            horzLines: { color: 'rgba(146, 196, 130, 0.07)' },
        },
        rightPriceScale: { borderColor: 'rgba(146, 196, 130, 0.16)', scaleMargins: { top: 0.08, bottom: 0.26 } },
        timeScale: {
            borderColor: 'rgba(146, 196, 130, 0.16)',
            timeVisible: true,
            secondsVisible: false,
        },
        crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { color: 'rgba(233, 241, 229, 0.4)', width: 1, style: 2, labelBackgroundColor: '#191d16' },
            horzLine: { color: 'rgba(233, 241, 229, 0.4)', width: 1, style: 2, labelBackgroundColor: '#191d16' },
        },
        localization: {
            // The axis and the crosshair label must agree with the readout above: UTC.
            timeFormatter: (time: number) =>
                new Date(time * 1000).toLocaleString(undefined, {
                    dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
                }),
        },
        handleScale: { axisPressedMouseMove: { price: false } },
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#4ec98a', downColor: '#ff7b7b',
        borderUpColor: '#4ec98a', borderDownColor: '#ff7b7b',
        wickUpColor: 'rgba(78, 201, 138, 0.7)', wickDownColor: 'rgba(255, 123, 123, 0.7)',
        priceFormat: { type: 'price', precision: props.precision, minMove: 1 / 10 ** props.precision },
    });

    // Volume shares the pane but has its own hidden scale, so it never competes with
    // price for vertical space or implies a second y-axis on the same measure.
    volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        lastValueVisible: false,
        priceLineVisible: false,
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chart.subscribeCrosshairMove((param: any) => {
        if (!param?.time) { hovered.value = null; return; }
        const stamp = (param.time as number) * 1000;
        hovered.value = props.candles.find(c => new Date(c.Ts).getTime() === stamp) ?? null;
    });

    apply();

    resizeObserver = new ResizeObserver(entries => {
        chart?.applyOptions({ width: Math.floor(entries[0].contentRect.width) });
    });
    resizeObserver.observe(host.value);
    chart.applyOptions({ width: host.value.clientWidth });
    chart.timeScale().fitContent();
}

function apply() {
    if (!candleSeries) return;
    const { bars, volumes } = toSeries();
    candleSeries.setData(bars);
    volumeSeries?.setData(volumes);
}

function destroy() {
    resizeObserver?.disconnect();
    resizeObserver = null;
    chart?.remove();
    chart = null;
    candleSeries = volumeSeries = null;
}

// `flush: 'post'` so the watcher runs after the DOM has caught up with the new candles —
// the host element only exists once there is something to draw.
watch(() => props.candles, async () => {
    if (!props.candles.length) { destroy(); return; }
    if (!chart) { await build(); return; }
    apply();
    chart.timeScale().fitContent();
}, { deep: false, flush: 'post' });

onMounted(build);
onBeforeUnmount(destroy);
</script>

<style scoped>
.candle-root { width: 100%; }
.canvas { width: 100%; }
.readout {
    display: flex;
    align-items: baseline;
    gap: var(--ot-space-4);
    flex-wrap: wrap;
    padding-bottom: var(--ot-space-2);
    font-size: 12px;
    color: var(--ot-muted);
}
.readout .when { min-width: 190px; }
.readout .ohlc { display: flex; gap: var(--ot-space-3); flex-wrap: wrap; font-family: var(--ot-mono); }
.readout .ohlc b { color: var(--ot-text); font-weight: 600; }
.readout .vol { font-family: var(--ot-mono); margin-left: auto; }
</style>
