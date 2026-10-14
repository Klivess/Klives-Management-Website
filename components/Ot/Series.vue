<template>
    <div class="ots" :style="{ height: typeof height === 'number' ? `${height}px` : height }">
        <div ref="host" class="host"></div>
        <div v-if="legend && series.length" class="lg mono">
            <span v-for="(s, i) in series" :key="s.name" class="it">
                <span class="sw" :style="{ background: s.color ?? colourAt(i) }"></span>{{ s.name }}
                <b :style="{ color: s.color ?? colourAt(i) }">{{ valueText(s, i) }}</b>
            </span>
            <span v-if="hoverTime" class="muted">{{ fmtDateTime(hoverTime) }}</span>
        </div>
        <div v-if="!hasData" class="msg muted mono">{{ emptyText }}</div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { colourAt, fmtBig, fmtDateTime } from '~/composables/useTerminal';

export interface SeriesPoint { t: number | string; v: number | null | undefined }
export interface SeriesDef {
    name: string;
    data: SeriesPoint[];
    color?: string;
    type?: 'line' | 'area' | 'histogram' | 'baseline' | 'step';
    pane?: number;
    scale?: 'left' | 'right';
    width?: number;
    dashed?: boolean;
}

const props = withDefaults(defineProps<{
    series: SeriesDef[];
    height?: number | string;
    mode?: 'normal' | 'log' | 'percent' | 'indexed';
    format?: 'num' | 'pct' | 'price' | 'big';
    decimals?: number;
    legend?: boolean;
    baseline?: number;
    emptyText?: string;
    timeVisible?: boolean;
    fit?: boolean;
}>(), { height: 260, mode: 'normal', format: 'num', decimals: 2, legend: true, emptyText: 'No data', timeVisible: false, fit: true });

const host = ref<HTMLElement | null>(null);
const hoverTime = ref<number | null>(null);
const hoverValues = ref<Map<string, number | null>>(new Map());
let LW: any = null;
let chart: any = null;
let handles: { name: string; api: any; data: any[] }[] = [];

const hasData = computed(() => props.series.some(s => s.data.some(p => p.v !== null && p.v !== undefined)));

function toTime(t: number | string): number {
    return typeof t === 'number' ? (t > 1e11 ? Math.floor(t / 1000) : t) : Math.floor(new Date(t).getTime() / 1000);
}

function fmt(v: number | null | undefined) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '—';
    if (props.format === 'pct') return `${v.toFixed(props.decimals)}%`;
    if (props.format === 'big') return fmtBig(v);
    return v.toLocaleString('en-US', { minimumFractionDigits: props.decimals, maximumFractionDigits: props.decimals });
}

function valueText(s: SeriesDef, _i: number) {
    if (hoverTime.value !== null) return fmt(hoverValues.value.get(s.name));
    const last = [...s.data].reverse().find(p => p.v !== null && p.v !== undefined);
    return fmt(last?.v ?? null);
}

async function build() {
    if (!host.value) return;
    LW ??= await import('lightweight-charts');
    chart?.remove();
    handles = [];
    chart = LW.createChart(host.value, {
        autoSize: true,
        layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#7d8893', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10, attributionLogo: false,
            panes: { separatorColor: '#1d2228', separatorHoverColor: 'rgba(245,165,36,0.3)', enableResize: true } },
        grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.03)' } },
        rightPriceScale: { borderColor: '#1d2228', mode: modeValue() },
        leftPriceScale: { borderColor: '#1d2228', visible: props.series.some(s => s.scale === 'left') },
        timeScale: { borderColor: '#1d2228', timeVisible: props.timeVisible, secondsVisible: false },
        crosshair: { mode: LW.CrosshairMode.Normal, vertLine: { color: 'rgba(226,230,235,0.3)', style: 3, labelBackgroundColor: '#2d343d' }, horzLine: { color: 'rgba(226,230,235,0.3)', style: 3, labelBackgroundColor: '#2d343d' } },
        localization: { priceFormatter: (v: number) => fmt(v) },
        handleScroll: true,
        handleScale: true,
    });
    props.series.forEach((s, i) => {
        const colour = s.color ?? colourAt(i);
        const opts: any = { priceLineVisible: false, lastValueVisible: true, priceScaleId: s.scale ?? 'right' };
        let api: any;
        const pane = s.pane ?? 0;
        switch (s.type) {
            case 'area':
                api = chart.addSeries(LW.AreaSeries, { ...opts, lineColor: colour, topColor: colour + '40', bottomColor: colour + '05', lineWidth: s.width ?? 1.5 }, pane);
                break;
            case 'histogram':
                api = chart.addSeries(LW.HistogramSeries, { ...opts, color: colour }, pane);
                break;
            case 'baseline':
                api = chart.addSeries(LW.BaselineSeries, {
                    ...opts, baseValue: { type: 'price', price: props.baseline ?? 0 }, lineWidth: s.width ?? 1.5,
                    topLineColor: '#26c281', topFillColor1: 'rgba(38,194,129,0.25)', topFillColor2: 'rgba(38,194,129,0.02)',
                    bottomLineColor: '#f2545b', bottomFillColor1: 'rgba(242,84,91,0.02)', bottomFillColor2: 'rgba(242,84,91,0.25)',
                }, pane);
                break;
            default:
                api = chart.addSeries(LW.LineSeries, { ...opts, color: colour, lineWidth: s.width ?? 1.5, lineStyle: s.dashed ? 2 : 0, lineType: s.type === 'step' ? LW.LineType.WithSteps : LW.LineType.Simple }, pane);
        }
        const seen = new Set<number>();
        const data = s.data
            .map(p => ({ time: toTime(p.t), v: p.v }))
            .filter(p => Number.isFinite(p.time))
            .sort((a, b) => a.time - b.time)
            .filter(p => (seen.has(p.time) ? false : (seen.add(p.time), true)))
            .map(p => (p.v === null || p.v === undefined || !Number.isFinite(p.v) ? { time: p.time } : s.type === 'histogram'
                ? { time: p.time, value: p.v, color: p.v >= 0 ? 'rgba(38,194,129,0.7)' : 'rgba(242,84,91,0.7)' } : { time: p.time, value: p.v }));
        api.setData(data);
        handles.push({ name: s.name, api, data });
    });
    chart.subscribeCrosshairMove((param: any) => {
        if (!param?.time) { hoverTime.value = null; return; }
        hoverTime.value = param.time as number;
        const m = new Map<string, number | null>();
        for (const h of handles) {
            const d = param.seriesData?.get(h.api);
            m.set(h.name, d && 'value' in d ? d.value : null);
        }
        hoverValues.value = m;
    });
    if (props.fit) chart.timeScale().fitContent();
}

function modeValue() {
    if (!LW) return 0;
    const M = LW.PriceScaleMode;
    return props.mode === 'log' ? M.Logarithmic : props.mode === 'percent' ? M.Percentage : props.mode === 'indexed' ? M.IndexedTo100 : M.Normal;
}

watch(() => [props.series, props.mode], async () => { await nextTick(); await build(); }, { deep: true });
onMounted(build);
onBeforeUnmount(() => { chart?.remove(); chart = null; });
</script>

<style scoped>
.ots { position: relative; width: 100%; }
.host { position: absolute; inset: 0; }
.lg { position: absolute; top: 2px; left: 6px; z-index: 3; display: flex; gap: 10px; flex-wrap: wrap; font-size: 10.5px; pointer-events: none; color: var(--ot-text-2); }
.lg .it { display: inline-flex; gap: 4px; align-items: center; }
.lg .sw { width: 8px; height: 3px; border-radius: 1px; }
.msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 11.5px; }
</style>
