<template>
    <div ref="root" class="otc" :class="{ full: fullscreen }">
        <div v-if="toolbar" class="otc-bar">
            <input v-if="symbolEditable" v-model="symbolText" class="ot-input sm mono sym" spellcheck="false" aria-label="Symbol"
                   @keydown.enter="commitSymbol" @blur="commitSymbol" />
            <span v-else class="symlabel mono">{{ symbol }}</span>
            <div class="ot-segment sm mono" role="group" aria-label="Interval">
                <button v-for="i in intervals" :key="i.value" type="button" :aria-pressed="cfg.interval === i.value" @click="chooseInterval(i.value)">{{ i.short }}</button>
            </div>
            <select v-model="cfg.type" class="ot-select sm auto" aria-label="Chart type">
                <option value="candles">Candles</option>
                <option value="heikin">Heikin-Ashi</option>
                <option value="bars">OHLC bars</option>
                <option value="line">Line</option>
                <option value="area">Area</option>
            </select>
            <button class="ot-btn sm" type="button" @click="pickerOpen = true">ƒx Indicators</button>
            <button class="ot-btn sm" type="button" @click="addFormula()">+ Formula</button>
            <span class="cmpwrap">
                <input v-model="compareInput" class="ot-input sm mono cmp" placeholder="+ Compare" spellcheck="false" @keydown.enter="addCompare" />
                <button v-for="(c, i) in cfg.compare" :key="c" class="ot-chip" type="button" :style="{ borderColor: colourAt(i + 2), color: colourAt(i + 2) }" @click="removeCompare(c)">{{ c }} ✕</button>
            </span>
            <span class="grow"></span>
            <div class="ot-segment sm" role="group" aria-label="Scale">
                <button type="button" :aria-pressed="cfg.volume" title="Volume" @click="cfg.volume = !cfg.volume">Vol</button>
                <button type="button" :aria-pressed="cfg.log" title="Log scale" @click="cfg.log = !cfg.log; cfg.pct = false">Log</button>
                <button type="button" :aria-pressed="cfg.pct" title="Percent scale" @click="cfg.pct = !cfg.pct; cfg.log = false">%</button>
            </div>
            <select v-model.number="cfg.bars" class="ot-select sm auto mono" title="Bars" @change="loadedBars = cfg.bars; load(true)">
                <option v-for="n in [200, 500, 1000, 2000, 5000]" :key="n" :value="n">{{ n }}</option>
            </select>
            <details class="ot-menu" @toggle="onTemplatesToggle">
                <summary class="ot-btn ghost sm" title="Templates">Tmpl</summary>
                <div class="pop">
                    <span class="grp">Templates</span>
                    <button v-for="t in templates" :key="t.Id" class="item" type="button" @click="applyTemplate(t)">{{ t.Name }}</button>
                    <span v-if="!templates.length" class="item muted">None saved</span>
                    <button class="item" type="button" @click="saveTemplate">Save current…</button>
                    <button class="item" type="button" @click="resetStudies">Reset to default</button>
                </div>
            </details>
            <button class="ot-btn ghost sm" type="button" title="Screenshot" @click="screenshot">⎙</button>
            <button class="ot-btn ghost sm" type="button" :title="fullscreen ? 'Exit full screen' : 'Full screen'" @click="fullscreen = !fullscreen">{{ fullscreen ? '⤡' : '⤢' }}</button>
            <span class="live" :title="payload?.Source ? `source: ${payload.Source}` : ''">
                <span class="ot-dot" :class="liveDot"></span>{{ payload?.Source ?? '' }}
            </span>
        </div>

        <div v-if="cfg.formulas.length" class="otc-formulas">
            <div v-for="(f, i) in cfg.formulas" :key="f.key" class="frow">
                <span class="swatch" :style="{ background: f.color ?? colourAt(i + 4) }"></span>
                <OtFormulaInput v-model="f.formula" :prefix="`F${i + 1}`" :symbol="symbol" :interval="cfg.interval" :inline-errors="false" @submit="load(true)" />
                <select v-model="f.pane" class="ot-select sm auto" aria-label="Placement">
                    <option value="auto">auto</option>
                    <option value="overlay">overlay</option>
                    <option value="pane">pane</option>
                </select>
                <button class="ot-btn ghost xs" type="button" :title="f.hidden ? 'Show' : 'Hide'" @click="f.hidden = !f.hidden">{{ f.hidden ? '◌' : '●' }}</button>
                <button class="ot-btn ghost xs" type="button" title="Remove" @click="cfg.formulas.splice(i, 1)">✕</button>
            </div>
            <button class="ot-btn sm" type="button" @click="load(true)">Apply</button>
        </div>

        <div class="otc-stage" :style="{ height: fullscreen ? undefined : heightCss }">
            <div ref="host" class="otc-host"></div>

            <div class="otc-legend main">
                <div class="l1 mono">
                    <b>{{ payload?.Symbol ?? symbol }}</b>
                    <span class="muted">{{ intervalShort(cfg.interval) }}</span>
                    <template v-if="bar">
                        <span>O <b :class="barTone">{{ fmtPrice(bar.o) }}</b></span>
                        <span>H <b :class="barTone">{{ fmtPrice(bar.h) }}</b></span>
                        <span>L <b :class="barTone">{{ fmtPrice(bar.l) }}</b></span>
                        <span>C <b :class="barTone">{{ fmtPrice(bar.c) }}</b></span>
                        <span :class="barTone">{{ fmtChg(bar.chg) }}</span>
                        <span class="muted">V {{ fmtBig(bar.v) }}</span>
                        <span class="muted">{{ fmtDateTime(bar.t) }}{{ bar.forming ? ' ·forming' : '' }}</span>
                    </template>
                </div>
                <div v-for="row in overlayLegend" :key="row.key" class="lrow mono" :class="{ off: row.hidden }">
                    <span class="nm" :style="{ color: row.colour }">{{ row.name }}</span>
                    <span v-for="v in row.values" :key="v.label" class="val" :style="{ color: v.colour }">{{ v.text }}</span>
                    <span v-if="row.error" class="neg">{{ row.error }}</span>
                    <span class="acts">
                        <button type="button" :title="row.hidden ? 'Show' : 'Hide'" @click="toggleHidden(row)">{{ row.hidden ? '◌' : '●' }}</button>
                        <button v-if="row.kind === 'study'" type="button" title="Settings" @click="editStudy(row.key)">⚙</button>
                        <button type="button" title="Remove" @click="removeRow(row)">✕</button>
                    </span>
                </div>
            </div>

            <div v-for="pl in paneLegend" :key="pl.key" class="otc-legend pane mono" :style="{ top: `${pl.top}px` }" :class="{ off: pl.hidden }">
                <span class="nm" :style="{ color: pl.colour }">{{ pl.name }}</span>
                <span v-for="v in pl.values" :key="v.label" class="val" :style="{ color: v.colour }">{{ v.text }}</span>
                <span v-if="pl.error" class="neg">{{ pl.error }}</span>
                <span class="acts">
                    <button type="button" :title="pl.hidden ? 'Show' : 'Hide'" @click="toggleHidden(pl)">{{ pl.hidden ? '◌' : '●' }}</button>
                    <button v-if="pl.kind === 'study'" type="button" title="Settings" @click="editStudy(pl.key)">⚙</button>
                    <button type="button" title="Remove" @click="removeRow(pl)">✕</button>
                </span>
            </div>

            <div v-if="error" class="otc-msg neg mono">{{ error }}</div>
            <div v-else-if="loading && !payload" class="otc-msg muted mono">Loading {{ symbol }}…</div>
            <div v-else-if="payload && !payload.Time.length" class="otc-msg muted mono">No bars for {{ symbol }}</div>

            <div v-if="editing" class="ot-pop editor" @click.stop>
                <span class="grp">{{ editingSpec?.Name ?? editing.id }}</span>
                <template v-for="inp in editingSpec?.Inputs ?? []" :key="inp.Name">
                    <label class="erow">
                        <span>{{ inp.Label }}</span>
                        <select v-if="inp.Kind === 'Source' || inp.Kind === 'Choice'" v-model="editing.inputs[inp.Name]" class="ot-select sm">
                            <option v-for="o in inp.Options ?? []" :key="o" :value="o">{{ o }}</option>
                        </select>
                        <input v-else-if="inp.Kind === 'Bool'" v-model="editing.inputs[inp.Name]" type="checkbox" />
                        <input v-else v-model.number="editing.inputs[inp.Name]" class="ot-input sm num" type="number"
                               :min="inp.Min ?? undefined" :max="inp.Max ?? undefined" :step="inp.Step ?? (inp.Kind === 'Int' ? 1 : 0.1)" />
                    </label>
                </template>
                <div class="eacts">
                    <button class="ot-btn sm" type="button" @click="resetInputs">Defaults</button>
                    <button class="ot-btn sm primary" type="button" @click="applyEdit">Apply</button>
                    <button class="ot-btn ghost sm" type="button" @click="editing = null">Close</button>
                </div>
            </div>
        </div>

        <OtIndicatorPicker v-if="pickerOpen" @add="addStudy" @close="pickerOpen = false" />
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import {
    INTERVALS, clone, colourAt, fmtBig, fmtChg, fmtDateTime, fmtPrice, intervalShort, isAbort, isCrypto, loadIndicatorCatalog,
    tGet, tPost, useLatest, usePersisted, SWAL_TERMINAL, type ChartPayload, type IndicatorSpec,
} from '~/composables/useTerminal';

export interface ChartStudy { key: string; id: string; inputs: Record<string, any>; hidden?: boolean }
export interface ChartFormula { key: string; formula: string; pane: 'auto' | 'overlay' | 'pane'; color?: string; hidden?: boolean }
export interface ChartConfig {
    interval: string; type: 'candles' | 'heikin' | 'bars' | 'line' | 'area'; log: boolean; pct: boolean; volume: boolean; bars: number;
    studies: ChartStudy[]; formulas: ChartFormula[]; compare: string[];
}
export interface ChartMarker { time: number | string; position?: 'aboveBar' | 'belowBar' | 'inBar'; color?: string; shape?: 'arrowUp' | 'arrowDown' | 'circle' | 'square'; text?: string }
export interface ChartPriceLine { price: number; color?: string; title?: string; dashed?: boolean }

const props = withDefaults(defineProps<{
    symbol: string;
    interval?: string;
    persist?: string;
    height?: number | string;
    toolbar?: boolean;
    symbolEditable?: boolean;
    markers?: ChartMarker[];
    priceLines?: ChartPriceLine[];
    live?: boolean;
    defaultStudies?: ChartStudy[];
}>(), { persist: 'main', height: 560, toolbar: true, symbolEditable: false, live: true });

const emit = defineEmits<{ 'update:symbol': [value: string]; 'update:interval': [value: string]; loaded: [payload: ChartPayload] }>();

const intervals = INTERVALS;
const DEFAULT_STUDIES: ChartStudy[] = [
    { key: 's_ema20', id: 'ema', inputs: { length: 20 } },
    { key: 's_ema50', id: 'ema', inputs: { length: 50 } },
    { key: 's_rsi', id: 'rsi', inputs: { length: 14 } },
];

const cfg = usePersisted<ChartConfig>(`chart.${props.persist}`, {
    interval: props.interval ?? 'OneDay', type: 'candles', log: false, pct: false, volume: true, bars: 500,
    studies: clone(props.defaultStudies ?? DEFAULT_STUDIES), formulas: [], compare: [],
});
if (props.interval) cfg.value.interval = props.interval;
cfg.value.formulas ??= []; cfg.value.compare ??= []; cfg.value.studies ??= [];

const root = ref<HTMLElement | null>(null);
const host = ref<HTMLElement | null>(null);
const payload = ref<ChartPayload | null>(null);
const loading = ref(false);
const error = ref('');
const pickerOpen = ref(false);
const fullscreen = ref(false);
const symbolText = ref(props.symbol);
const compareInput = ref('');
const loadedBars = ref(cfg.value.bars);
const hoverIdx = ref<number | null>(null);
const catalog = ref<Record<string, IndicatorSpec>>({});
const templates = ref<any[]>([]);
const editing = ref<{ key: string; id: string; inputs: Record<string, any> } | null>(null);
const paneTops = ref<number[]>([]);
const legendVersion = ref(0);

const heightCss = computed(() => typeof props.height === 'number' ? `${props.height}px` : props.height);
const liveDot = computed(() => error.value ? 'bad' : !payload.value ? '' : payload.value.Streaming ? 'live' : 'ok');

let LW: any = null;
let chart: any = null;
let priceSeries: any = null;
let markerApi: any = null;
let structure = '';
let binders: ((p: ChartPayload) => void)[] = [];
let legendSources: LegendSource[] = [];
let paneIndexByKey = new Map<string, number>();
const latest = useLatest();
let liveTimer: ReturnType<typeof setInterval> | null = null;
let loadingMore = false;
let resizeObserver: ResizeObserver | null = null;

interface LegendSource {
    key: string; kind: 'study' | 'formula' | 'compare'; name: string; colour: string; pane: number; hidden: boolean; error?: string | null;
    outputs: { label: string; values: (number | null)[]; offset: number; colour: string; fmt: (v: number) => string }[];
}

// ── data ─────────────────────────────────────────────────────────────────────

async function load(reset = false) {
    if (!props.symbol) return;
    const signal = latest.next();
    loading.value = true;
    const body = {
        Symbol: props.symbol,
        Interval: cfg.value.interval,
        Count: loadedBars.value,
        Indicators: cfg.value.studies.filter(s => !s.hidden).map(s => ({ Id: s.id, Key: s.key, Inputs: s.inputs })),
        Formulas: cfg.value.formulas.filter(f => !f.hidden && f.formula.trim()).map(f => ({ Key: f.key, Formula: f.formula })),
        Compare: cfg.value.compare,
    };
    try {
        const p = await tPost<ChartPayload>('/terminal/chart', body, undefined, signal);
        error.value = '';
        const prevLen = payload.value?.Time.length ?? 0;
        const prevFirst = payload.value?.Time[0];
        payload.value = p;
        await nextTick();
        await render(p, reset, prevLen, prevFirst);
        emit('loaded', p);
    } catch (e) {
        if (!isAbort(e)) error.value = (e as Error)?.message ?? 'Chart failed';
    } finally {
        loading.value = false;
    }
}

function scheduleLive() {
    if (liveTimer) clearInterval(liveTimer);
    liveTimer = null;
    if (!props.live) return;
    const fast = ['OneMinute', 'FiveMinute', 'FifteenMinute', 'ThirtyMinute', 'OneHour'].includes(cfg.value.interval);
    const ms = isCrypto(props.symbol) ? (fast ? 5000 : 15000) : (fast ? 20000 : 60000);
    liveTimer = setInterval(() => { if (!document.hidden && !loading.value && !editing.value) void load(false); }, ms);
}

// ── rendering ────────────────────────────────────────────────────────────────

function precisionFor(p: ChartPayload) {
    const last = p.Close[p.Close.length - 1] ?? 1;
    const a = Math.abs(last);
    const d = a >= 1000 ? 2 : a >= 10 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : 8;
    return { type: 'price', precision: d, minMove: 1 / 10 ** d };
}

async function ensureChart() {
    if (chart || !host.value) return;
    LW = await import('lightweight-charts');
    chart = LW.createChart(host.value, {
        autoSize: true,
        layout: {
            background: { type: 'solid', color: '#07080a' },
            textColor: '#7d8893',
            attributionLogo: false, // attribution lives in the shell footer
            fontFamily: "'JetBrains Mono', ui-monospace, Consolas, monospace",
            fontSize: 10.5,
            panes: { separatorColor: '#1d2228', separatorHoverColor: 'rgba(245, 165, 36, 0.3)', enableResize: true },
        },
        grid: { vertLines: { color: 'rgba(255,255,255,0.035)' }, horzLines: { color: 'rgba(255,255,255,0.035)' } },
        rightPriceScale: { borderColor: '#1d2228', scaleMargins: { top: 0.08, bottom: 0.08 } },
        timeScale: { borderColor: '#1d2228', timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 7 },
        crosshair: {
            mode: LW.CrosshairMode.Normal,
            vertLine: { color: 'rgba(226,230,235,0.35)', width: 1, style: 3, labelBackgroundColor: '#2d343d' },
            horzLine: { color: 'rgba(226,230,235,0.35)', width: 1, style: 3, labelBackgroundColor: '#2d343d' },
        },
        localization: {
            timeFormatter: (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' '),
        },
    });
    chart.subscribeCrosshairMove(onCrosshair);
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    resizeObserver = new ResizeObserver(() => layoutLegends());
    resizeObserver.observe(host.value);
}

function signature(p: ChartPayload) {
    return JSON.stringify({
        t: cfg.value.type, v: cfg.value.volume, s: cfg.value.studies.map(s => [s.key, s.id, s.inputs, !!s.hidden]),
        f: cfg.value.formulas.map(f => [f.key, f.formula, f.pane, !!f.hidden, f.color]), c: cfg.value.compare,
        r: p.Indicators.map(i => [i.Key, i.Error ? 1 : 0, Object.keys(i.Values)]), fe: p.Formulas.map(f => [f.Key, f.Errors?.length ?? 0, f.IsBoolean]),
        lines: props.priceLines, sym: p.Symbol, iv: p.Interval,
    });
}

async function render(p: ChartPayload, reset: boolean, prevLen: number, prevFirst?: number) {
    await ensureChart();
    if (!chart) return;
    const sig = signature(p);
    const range = chart.timeScale().getVisibleLogicalRange();
    if (sig !== structure) { rebuild(p); structure = sig; }
    for (const b of binders) b(p);
    applyMarkers(p);
    applyScale();
    const n = p.Time.length;
    if (reset || !range) {
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 180), to: n + 4 });
    } else if (prevFirst !== undefined && p.Time[0] !== prevFirst && n > prevLen) {
        const shift = n - prevLen;
        chart.timeScale().setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift });
    } else if (n > prevLen && range.to >= prevLen - 2) {
        const shift = n - prevLen;
        chart.timeScale().setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift });
    } else {
        chart.timeScale().setVisibleLogicalRange(range);
    }
    legendVersion.value++;
    await nextTick();
    layoutLegends();
}

function heikin(p: ChartPayload) {
    const o: number[] = [], h: number[] = [], l: number[] = [], c: number[] = [];
    for (let i = 0; i < p.Time.length; i++) {
        const hc = (p.Open[i] + p.High[i] + p.Low[i] + p.Close[i]) / 4;
        const ho = i === 0 ? (p.Open[i] + p.Close[i]) / 2 : (o[i - 1] + c[i - 1]) / 2;
        o.push(ho); c.push(hc);
        h.push(Math.max(p.High[i], ho, hc)); l.push(Math.min(p.Low[i], ho, hc));
    }
    return { o, h, l, c };
}

function barSeconds(p: ChartPayload) {
    const t = p.Time;
    if (t.length < 2) return 86400;
    const diffs: number[] = [];
    for (let i = Math.max(1, t.length - 50); i < t.length; i++) diffs.push(t[i] - t[i - 1]);
    diffs.sort((a, b) => a - b);
    return diffs[Math.floor(diffs.length / 2)] || 86400;
}

function timeAt(p: ChartPayload, idx: number, step: number): number | null {
    const n = p.Time.length;
    if (idx < 0) return null;
    if (idx < n) return p.Time[idx];
    return p.Time[n - 1] + (idx - (n - 1)) * step;
}

function lineData(p: ChartPayload, values: (number | null | undefined)[], offset = 0, colourFn?: (i: number, v: number) => string | undefined) {
    const step = barSeconds(p);
    const out: any[] = [];
    for (let i = 0; i < values.length; i++) {
        const t = timeAt(p, i + offset, step);
        if (t === null) continue;
        const v = values[i];
        if (v === null || v === undefined || !Number.isFinite(v)) out.push({ time: t });
        else {
            const colour = colourFn?.(i, v);
            out.push(colour ? { time: t, value: v, color: colour } : { time: t, value: v });
        }
    }
    // A shift can produce repeated stamps only if the source had duplicates; guard anyway.
    return out.filter((d, i) => i === 0 || d.time > out[i - 1].time);
}

const UP = '#26c281', DOWN = '#f2545b';
/** Catalog colour slot, rotated per repeat instance so EMA 20 and EMA 50 never share a colour. */
function slotColour(slot: number | null | undefined, fallbackIndex: number, shift = 0) {
    if (!slot || slot < 1) return colourAt(fallbackIndex);
    return colourAt(slot - 1 + shift);
}

function rebuild(p: ChartPayload) {
    for (const pane of [...chart.panes()].reverse()) for (const s of pane.getSeries()) chart.removeSeries(s);
    binders = [];
    legendSources = [];
    paneIndexByKey = new Map();
    markerApi = null;
    const fmt = precisionFor(p);
    const fmtV = (v: number) => fmtPrice(v);

    // price
    const type = cfg.value.type;
    if (type === 'line') priceSeries = chart.addSeries(LW.LineSeries, { color: '#e2e6eb', lineWidth: 1.5, priceFormat: fmt }, 0);
    else if (type === 'area') priceSeries = chart.addSeries(LW.AreaSeries, { lineColor: '#4aa8ff', topColor: 'rgba(74,168,255,0.28)', bottomColor: 'rgba(74,168,255,0.02)', lineWidth: 1.5, priceFormat: fmt }, 0);
    else if (type === 'bars') priceSeries = chart.addSeries(LW.BarSeries, { upColor: UP, downColor: DOWN, thinBars: false, priceFormat: fmt }, 0);
    else priceSeries = chart.addSeries(LW.CandlestickSeries, {
        upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: 'rgba(38,194,129,0.75)', wickDownColor: 'rgba(242,84,91,0.75)', priceFormat: fmt,
    }, 0);
    binders.push(pp => {
        if (type === 'line' || type === 'area') {
            priceSeries.setData(pp.Time.map((t, i) => ({ time: t, value: pp.Close[i] })));
        } else {
            const src = type === 'heikin' ? heikin(pp) : { o: pp.Open, h: pp.High, l: pp.Low, c: pp.Close };
            priceSeries.setData(pp.Time.map((t, i) => ({ time: t, open: src.o[i], high: src.h[i], low: src.l[i], close: src.c[i] })));
        }
    });
    for (const line of props.priceLines ?? [])
        priceSeries.createPriceLine({ price: line.price, color: line.color ?? '#f5a524', lineWidth: 1, lineStyle: line.dashed === false ? 0 : 2, axisLabelVisible: true, title: line.title ?? '' });

    // volume
    if (cfg.value.volume) {
        const vol = chart.addSeries(LW.HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false }, 0);
        chart.priceScale('vol', 0).applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });
        binders.push(pp => vol.setData(pp.Time.map((t, i) => ({ time: t, value: pp.Volume[i], color: pp.Close[i] >= pp.Open[i] ? 'rgba(38,194,129,0.28)' : 'rgba(242,84,91,0.28)' }))));
    }

    let nextPane = 1;
    let colourIndex = 0;
    const instances = new Map<string, number>();

    // studies
    cfg.value.studies.forEach(study => {
        const spec = catalog.value[study.id];
        const result = p.Indicators.find(r => r.Key === study.key);
        const name = result?.Name ?? spec?.Short ?? study.id.toUpperCase();
        if (study.hidden || !result || result.Error || !spec) {
            legendSources.push({ key: study.key, kind: 'study', name, colour: '#7d8893', pane: spec && !spec.Overlay ? -1 : 0, hidden: !!study.hidden, error: result?.Error ?? (spec ? null : 'unknown'), outputs: [] });
            return;
        }
        const pane = spec.Overlay ? 0 : nextPane++;
        paneIndexByKey.set(study.key, pane);
        const repeat = instances.get(study.id) ?? 0;
        instances.set(study.id, repeat + 1);
        const shift = repeat * Math.max(1, spec.Outputs.length);
        const source: LegendSource = { key: study.key, kind: 'study', name, colour: slotColour(spec.Outputs[0]?.Color, colourIndex, shift), pane, hidden: false, outputs: [] };
        let firstSeries: any = null;
        spec.Outputs.forEach((out, oi) => {
            const values = result.Values[out.Name] ?? [];
            const colour = slotColour(out.Color, colourIndex + oi, shift);
            const offset = out.DisplayOffset ?? 0;
            const style = out.Style;
            if (style === 'markers') {
                source.outputs.push({ label: out.Label, values, offset, colour, fmt: v => v.toFixed(0) });
                return;
            }
            const common = { priceLineVisible: false, lastValueVisible: !spec.Overlay || oi === 0, priceFormat: spec.Overlay ? fmt : { type: 'price', precision: 2, minMove: 0.01 } };
            let series: any;
            if (style === 'histogram') {
                series = chart.addSeries(LW.HistogramSeries, { ...common, color: colour }, pane);
                binders.push(pp => {
                    const r = pp.Indicators.find(x => x.Key === study.key);
                    series.setData(lineData(pp, r?.Values[out.Name] ?? [], offset, (_i, v) => out.Color === 0 ? (v >= 0 ? 'rgba(38,194,129,0.7)' : 'rgba(242,84,91,0.7)') : undefined));
                });
            } else if (style === 'area') {
                series = chart.addSeries(LW.AreaSeries, { ...common, lineColor: colour, topColor: hexA(colour, 0.22), bottomColor: hexA(colour, 0.02), lineWidth: 1 }, pane);
                binders.push(pp => series.setData(lineData(pp, pp.Indicators.find(x => x.Key === study.key)?.Values[out.Name] ?? [], offset)));
            } else {
                const opts: any = { ...common, color: colour, lineWidth: 1.4 };
                if (style === 'dots') Object.assign(opts, { lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 1.6 });
                if (style === 'step') opts.lineType = LW.LineType.WithSteps;
                series = chart.addSeries(LW.LineSeries, opts, pane);
                binders.push(pp => {
                    const r = pp.Indicators.find(x => x.Key === study.key);
                    const dir = r?.Values['dir'];
                    series.setData(lineData(pp, r?.Values[out.Name] ?? [], offset, out.Color === 0
                        ? (i, v) => ((dir?.[i] ?? (v <= pp.Close[i] ? 1 : -1)) >= 0 ? UP : DOWN) : undefined));
                });
            }
            firstSeries ??= series;
            source.outputs.push({ label: out.Label, values, offset, colour, fmt: spec.Overlay ? fmtV : (v: number) => fmtNum(v) });
        });
        if (firstSeries && !spec.Overlay) {
            for (const level of spec.Levels ?? [])
                firstSeries.createPriceLine({ price: level, color: 'rgba(125,136,147,0.55)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
            if (spec.RangeMin !== null && spec.RangeMin !== undefined && spec.RangeMax !== null && spec.RangeMax !== undefined) {
                const min = spec.RangeMin, max = spec.RangeMax;
                firstSeries.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: min, maxValue: max } }) });
            }
        }
        legendSources.push(source);
        colourIndex += Math.max(1, spec.Outputs.length);
    });

    // formulas
    cfg.value.formulas.forEach((f, fi) => {
        const r = p.Formulas.find(x => x.Key === f.key);
        const colour = f.color ?? colourAt(fi + 4);
        const name = `F${fi + 1}`;
        if (f.hidden || !r || r.Errors?.length || !r.Values) {
            legendSources.push({ key: f.key, kind: 'formula', name, colour, pane: 0, hidden: !!f.hidden, error: r?.Errors?.[0]?.Message ?? null, outputs: [] });
            return;
        }
        if (r.IsBoolean) {
            legendSources.push({ key: f.key, kind: 'formula', name: `${name} signal`, colour, pane: 0, hidden: false, outputs: [{ label: 'on', values: r.Values, offset: 0, colour, fmt: v => (v ? 'true' : 'false') }] });
            return;
        }
        const overlay = f.pane === 'overlay' || (f.pane === 'auto' && looksLikePrice(r.Values, p.Close));
        const pane = overlay ? 0 : nextPane++;
        paneIndexByKey.set(f.key, pane);
        const series = chart.addSeries(LW.LineSeries, { color: colour, lineWidth: 1.4, priceLineVisible: false, priceFormat: overlay ? fmt : { type: 'price', precision: 4, minMove: 0.0001 } }, pane);
        binders.push(pp => series.setData(lineData(pp, pp.Formulas.find(x => x.Key === f.key)?.Values ?? [])));
        legendSources.push({ key: f.key, kind: 'formula', name, colour, pane, hidden: false, outputs: [{ label: '', values: r.Values, offset: 0, colour, fmt: overlay ? fmtV : (v: number) => fmtNum(v) }] });
    });

    // comparison symbols share the price scale in percent mode
    cfg.value.compare.forEach((sym, ci) => {
        const colour = colourAt(ci + 2);
        const r = p.Compare.find(x => x.Symbol === sym);
        if (!r || r.Error || !r.Close) {
            legendSources.push({ key: `cmp:${sym}`, kind: 'compare', name: sym, colour, pane: 0, hidden: false, error: r?.Error ?? 'no data', outputs: [] });
            return;
        }
        const series = chart.addSeries(LW.LineSeries, { color: colour, lineWidth: 1.3, priceLineVisible: false, priceFormat: fmt }, 0);
        binders.push(pp => series.setData(lineData(pp, pp.Compare.find(x => x.Symbol === sym)?.Close ?? [])));
        legendSources.push({ key: `cmp:${sym}`, kind: 'compare', name: sym, colour, pane: 0, hidden: false, outputs: [{ label: '', values: r.Close, offset: 0, colour, fmt: fmtV }] });
    });

    const panes = chart.panes();
    panes.forEach((pane: any, i: number) => pane.setStretchFactor(i === 0 ? Math.max(2, panes.length) : 1));
    markerApi = LW.createSeriesMarkers(priceSeries, []);
}

function looksLikePrice(values: (number | null)[], close: number[]) {
    const ratios: number[] = [];
    for (let i = 0; i < values.length; i += Math.max(1, Math.floor(values.length / 60))) {
        const v = values[i];
        if (v !== null && v !== undefined && close[i]) ratios.push(Math.abs(v / close[i]));
    }
    if (!ratios.length) return false;
    ratios.sort((a, b) => a - b);
    const m = ratios[Math.floor(ratios.length / 2)];
    return m > 0.33 && m < 3;
}

function applyMarkers(p: ChartPayload) {
    if (!markerApi) return;
    const list: any[] = [];
    // boolean formulas: mark the bar where the condition turns true
    cfg.value.formulas.forEach((f, fi) => {
        if (f.hidden) return;
        const r = p.Formulas.find(x => x.Key === f.key);
        if (!r?.IsBoolean || !r.Values) return;
        const colour = f.color ?? colourAt(fi + 4);
        for (let i = 1; i < r.Values.length; i++)
            if (r.Values[i] === 1 && r.Values[i - 1] !== 1) list.push({ time: p.Time[i], position: 'belowBar', shape: 'arrowUp', color: colour, text: `F${fi + 1}` });
    });
    // marker-style study outputs (patterns, direction flips)
    for (const study of cfg.value.studies) {
        if (study.hidden) continue;
        const spec = catalog.value[study.id];
        const r = p.Indicators.find(x => x.Key === study.key);
        if (!spec || !r) continue;
        for (const out of spec.Outputs.filter(o => o.Style === 'markers')) {
            const v = r.Values[out.Name] ?? [];
            for (let i = 1; i < v.length; i++) {
                const x = v[i];
                if (x === null || x === undefined || x === 0 || x === v[i - 1]) continue;
                list.push(x > 0
                    ? { time: p.Time[i], position: 'belowBar', shape: 'arrowUp', color: UP, text: spec.Short }
                    : { time: p.Time[i], position: 'aboveBar', shape: 'arrowDown', color: DOWN, text: spec.Short });
            }
        }
    }
    for (const m of props.markers ?? []) {
        const t = typeof m.time === 'number' ? m.time : Math.floor(new Date(m.time).getTime() / 1000);
        list.push({ time: snapTime(p, t), position: m.position ?? 'aboveBar', shape: m.shape ?? 'circle', color: m.color ?? '#f5a524', text: m.text ?? '' });
    }
    list.sort((a, b) => a.time - b.time);
    markerApi.setMarkers(list.filter(m => m.time !== null));
}

/** Markers must sit on an existing bar time. */
function snapTime(p: ChartPayload, t: number): number | null {
    const times = p.Time;
    if (!times.length) return null;
    let lo = 0, hi = times.length - 1;
    if (t <= times[0]) return times[0];
    if (t >= times[hi]) return times[hi];
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (times[mid] <= t) lo = mid; else hi = mid - 1;
    }
    return times[lo];
}

function applyScale() {
    if (!chart) return;
    const M = LW.PriceScaleMode;
    const mode = cfg.value.compare.length || cfg.value.pct ? M.Percentage : cfg.value.log ? M.Logarithmic : M.Normal;
    chart.priceScale('right', 0).applyOptions({ mode });
}

// ── interaction ──────────────────────────────────────────────────────────────

function onCrosshair(param: any) {
    if (param?.logical === undefined || param.logical === null) hoverIdx.value = null;
    else hoverIdx.value = Math.round(param.logical);
}

function onRange(range: any) {
    const p = payload.value;
    if (!range || !p || loadingMore || loading.value) return;
    if (range.from < 8 && p.Time.length >= loadedBars.value - 5 && loadedBars.value < 20000) {
        loadingMore = true;
        loadedBars.value = Math.min(20000, loadedBars.value * 2);
        void load(false).finally(() => { loadingMore = false; });
    }
}

const idx = computed(() => {
    const p = payload.value;
    if (!p || !p.Time.length) return null;
    const i = hoverIdx.value;
    if (i === null || i < 0 || i >= p.Time.length) return p.Time.length - 1;
    return i;
});

const bar = computed(() => {
    const p = payload.value;
    const i = idx.value;
    if (!p || i === null) return null;
    const prev = i > 0 ? p.Close[i - 1] : p.Open[i];
    return {
        t: p.Time[i], o: p.Open[i], h: p.High[i], l: p.Low[i], c: p.Close[i], v: p.Volume[i],
        chg: prev ? (p.Close[i] / prev - 1) * 100 : null, forming: p.Forming && i === p.Time.length - 1,
    };
});
const barTone = computed(() => !bar.value ? '' : bar.value.c >= bar.value.o ? 'pos' : 'neg');

function legendRow(src: LegendSource) {
    const i = idx.value ?? 0;
    return {
        key: src.key, kind: src.kind, name: src.name, colour: src.colour, hidden: src.hidden, error: src.error,
        values: src.outputs.map(o => {
            const v = o.values[i - o.offset];
            return { label: o.label, colour: o.colour, text: v === null || v === undefined || !Number.isFinite(v) ? '—' : o.fmt(v) };
        }),
    };
}

const overlayLegend = computed(() => { void idx.value; void legendVersion.value; return legendSources.filter(s => s.pane <= 0).map(legendRow); });
const paneLegend = computed(() => {
    void idx.value; void legendVersion.value;
    return legendSources.filter(s => s.pane > 0).map(s => ({ ...legendRow(s), top: (paneTops.value[s.pane] ?? -999) + 3 }));
});

function layoutLegends() {
    if (!chart || !host.value) return;
    const base = host.value.getBoundingClientRect().top;
    paneTops.value = chart.panes().map((pane: any) => {
        const el = pane.getHTMLElement?.();
        return el ? el.getBoundingClientRect().top - base : 0;
    });
}

function fmtNum(v: number) {
    const a = Math.abs(v);
    return a >= 1e6 ? fmtBig(v) : a >= 100 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(4);
}

function hexA(hex: string, alpha: number) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ── config edits ─────────────────────────────────────────────────────────────

function chooseInterval(v: string) {
    if (cfg.value.interval === v) return;
    cfg.value.interval = v;
    emit('update:interval', v);
}

function commitSymbol() {
    const s = symbolText.value.trim().toUpperCase();
    if (s && s !== props.symbol) emit('update:symbol', s);
    else symbolText.value = props.symbol;
}

function addCompare() {
    const s = compareInput.value.trim().toUpperCase();
    compareInput.value = '';
    if (!s || s === props.symbol || cfg.value.compare.includes(s)) return;
    cfg.value.compare.push(s);
}
function removeCompare(s: string) { cfg.value.compare = cfg.value.compare.filter(x => x !== s); }

function newKey(prefix: string) { return `${prefix}${Math.random().toString(36).slice(2, 8)}`; }

function addStudy(spec: IndicatorSpec) {
    pickerOpen.value = false;
    const inputs: Record<string, any> = {};
    for (const i of spec.Inputs) inputs[i.Name] = i.Default;
    cfg.value.studies.push({ key: newKey('s_'), id: spec.Id, inputs });
}

function addFormula(formula = '') {
    cfg.value.formulas.push({ key: newKey('f_'), formula, pane: 'auto' });
}

function toggleHidden(row: { key: string; kind: string }) {
    if (row.kind === 'study') { const s = cfg.value.studies.find(x => x.key === row.key); if (s) s.hidden = !s.hidden; }
    else if (row.kind === 'formula') { const f = cfg.value.formulas.find(x => x.key === row.key); if (f) { f.hidden = !f.hidden; void load(false); } }
}

function removeRow(row: { key: string; kind: string }) {
    if (row.kind === 'study') cfg.value.studies = cfg.value.studies.filter(x => x.key !== row.key);
    else if (row.kind === 'formula') cfg.value.formulas = cfg.value.formulas.filter(x => x.key !== row.key);
    else if (row.kind === 'compare') removeCompare(row.key.slice(4));
}

const editingSpec = computed(() => editing.value ? catalog.value[editing.value.id] : null);
function editStudy(key: string) {
    const s = cfg.value.studies.find(x => x.key === key);
    if (!s) return;
    editing.value = { key, id: s.id, inputs: { ...s.inputs } };
}
function resetInputs() {
    if (!editing.value || !editingSpec.value) return;
    for (const i of editingSpec.value.Inputs) editing.value.inputs[i.Name] = i.Default;
}
function applyEdit() {
    if (!editing.value) return;
    const s = cfg.value.studies.find(x => x.key === editing.value!.key);
    if (s) s.inputs = { ...editing.value.inputs };
    editing.value = null;
}

function resetStudies() { cfg.value.studies = clone(props.defaultStudies ?? DEFAULT_STUDIES); cfg.value.formulas = []; }

async function onTemplatesToggle(e: Event) {
    if (!(e.target as HTMLDetailsElement).open) return;
    try { templates.value = await tGet<any[]>('/terminal/layouts', { kind: 'chart' }); } catch { templates.value = []; }
}

function applyTemplate(t: any) {
    const d = t.Data ?? {};
    if (Array.isArray(d.studies)) cfg.value.studies = d.studies;
    if (Array.isArray(d.formulas)) cfg.value.formulas = d.formulas;
    if (d.type) cfg.value.type = d.type;
    if (typeof d.volume === 'boolean') cfg.value.volume = d.volume;
}

async function saveTemplate() {
    const r = await Swal.fire({ title: 'Template name', input: 'text', showCancelButton: true, ...SWAL_TERMINAL });
    if (!r.isConfirmed || !r.value) return;
    try {
        await tPost('/terminal/layout/save', {
            Name: r.value, Kind: 'chart',
            Data: { studies: cfg.value.studies, formulas: cfg.value.formulas, type: cfg.value.type, volume: cfg.value.volume },
        });
    } catch (e: any) { void Swal.fire({ title: 'Save failed', text: e?.message, icon: 'error', ...SWAL_TERMINAL }); }
}

function screenshot() {
    if (!chart) return;
    const canvas = chart.takeScreenshot();
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${props.symbol}-${intervalShort(cfg.value.interval)}-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
}

// ── lifecycle ────────────────────────────────────────────────────────────────

watch(() => props.symbol, s => { symbolText.value = s; loadedBars.value = cfg.value.bars; structure = ''; void load(true); scheduleLive(); });
watch(() => props.interval, v => { if (v && v !== cfg.value.interval) cfg.value.interval = v; });
watch(() => cfg.value.interval, () => { loadedBars.value = cfg.value.bars; void load(true); scheduleLive(); });
watch(() => [cfg.value.studies, cfg.value.compare, cfg.value.type, cfg.value.volume], () => void load(false), { deep: true });
watch(() => [cfg.value.log, cfg.value.pct], () => applyScale());
watch(() => [props.markers, props.priceLines], () => { structure = ''; if (payload.value) void render(payload.value, false, payload.value.Time.length); }, { deep: true });
watch(fullscreen, async () => { await nextTick(); layoutLegends(); });

function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { if (editing.value) editing.value = null; else if (fullscreen.value) fullscreen.value = false; }
}

onMounted(async () => {
    window.addEventListener('keydown', onKey);
    try {
        const list = await loadIndicatorCatalog();
        catalog.value = Object.fromEntries(list.map(s => [s.Id, s]));
    } catch { /* indicators render without legends' metadata */ }
    await load(true);
    scheduleLive();
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey);
    latest.abort();
    if (liveTimer) clearInterval(liveTimer);
    resizeObserver?.disconnect();
    chart?.remove();
    chart = null;
});

defineExpose({ reload: () => load(false), addFormula, config: cfg });
</script>

<style scoped>
.otc { display: flex; flex-direction: column; min-width: 0; background: #07080a; }
.otc.full { position: fixed; inset: 0; z-index: var(--ot-z-modal); }
.otc.full .otc-stage { flex: 1 1 auto; }
.otc-bar { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; padding: 4px 6px; border-bottom: 1px solid var(--ot-line); background: var(--ot-surface); }
.otc-bar .sym { width: 120px; font-weight: 700; color: var(--ot-accent-2); text-transform: uppercase; }
.otc-bar .symlabel { font-weight: 700; color: var(--ot-accent-2); padding: 0 4px; }
.otc-bar .grow { flex: 1 1 auto; }
.otc-bar .cmpwrap { display: inline-flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.otc-bar .cmp { width: 96px; text-transform: uppercase; }
.otc-bar .live { display: inline-flex; gap: 5px; align-items: center; font-size: 10.5px; color: var(--ot-muted); font-family: var(--ot-mono); }
.otc-formulas { display: flex; flex-direction: column; gap: 3px; padding: 4px 6px; border-bottom: 1px solid var(--ot-line); background: var(--ot-surface); }
.otc-formulas .frow { display: flex; gap: 4px; align-items: center; }
.otc-formulas .swatch { width: 8px; height: 8px; border-radius: 2px; flex: 0 0 auto; }
.otc-formulas > .ot-btn { align-self: flex-start; }
.otc-stage { position: relative; min-height: 200px; }
.otc-host { position: absolute; inset: 0; }
.otc-legend { position: absolute; left: 6px; z-index: 5; pointer-events: none; font-size: 11px; line-height: 16px; max-width: calc(100% - 90px); }
.otc-legend.main { top: 4px; }
.otc-legend .l1 { display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; color: var(--ot-text-2); }
.otc-legend .l1 b { color: var(--ot-text); font-weight: 600; }
.otc-legend .lrow, .otc-legend.pane { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.otc-legend .nm { font-weight: 600; }
.otc-legend .off { opacity: 0.45; }
.otc-legend.pane.off { opacity: 0.45; }
.otc-legend .acts { display: none; gap: 2px; pointer-events: auto; }
.otc-legend .lrow:hover .acts, .otc-legend.pane:hover .acts { display: inline-flex; }
.otc-legend .lrow, .otc-legend.pane { pointer-events: auto; }
.otc-legend .acts button { border: 1px solid var(--ot-line-strong); background: var(--ot-surface-2); color: var(--ot-text-2); border-radius: 3px; height: 16px; min-width: 16px; font-size: 10px; cursor: pointer; padding: 0 3px; align-items: center; justify-content: center; }
.otc-legend .acts button:hover { color: var(--ot-accent); border-color: var(--ot-accent); }
.otc-msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; pointer-events: none; z-index: 4; }
.editor { top: 30px; left: 10px; right: auto; z-index: 30; min-width: 240px; }
.editor .erow { display: grid; grid-template-columns: 1fr 110px; gap: 6px; align-items: center; font-size: 11.5px; color: var(--ot-text-2); padding: 1px 2px; }
.editor .eacts { display: flex; gap: 4px; margin-top: 6px; justify-content: flex-end; }
</style>
