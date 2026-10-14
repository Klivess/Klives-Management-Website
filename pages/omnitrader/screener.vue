<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <h1><span class="code">SCRN</span>Screener</h1>
            <div class="ot-actions">
                <div class="ot-segment sm"><button type="button" :aria-pressed="mode === 'screen'" @click="mode = 'screen'">Screens</button><button type="button" :aria-pressed="mode === 'movers'" @click="mode = 'movers'; loadMovers()">Movers</button></div>
            </div>
        </div>

        <div v-if="mode === 'screen'" class="ot-grid sidebar-left">
            <div class="ot-stack">
                <OtPanel title="Definition" code="EQS" persist="scrn.def">
                    <div class="def">
                        <label class="ot-field">
                            <span class="lbl">Load</span>
                            <select class="ot-select sm" :value="def.Id" @change="loadDefinition(($event.target as HTMLSelectElement).value)">
                                <option value="">—</option>
                                <optgroup label="Presets"><option v-for="p in presets" :key="p.Id" :value="p.Id">{{ p.Name }}</option></optgroup>
                                <optgroup v-if="saved.length" label="Saved"><option v-for="s in saved" :key="s.Id" :value="s.Id">{{ s.Name }}</option></optgroup>
                            </select>
                        </label>
                        <label class="ot-field"><span class="lbl">Name</span><input v-model="def.Name" class="ot-input sm" /></label>
                        <label class="ot-field">
                            <span class="lbl">Universe</span>
                            <select v-model="def.Universe" class="ot-select sm">
                                <optgroup v-for="g in universeGroups" :key="g.name" :label="g.name">
                                    <option v-for="u in g.items" :key="u.Id" :value="u.Id">{{ u.Name }}{{ u.Size ? ` (${u.Size})` : '' }}</option>
                                </optgroup>
                                <option value="">Custom symbols</option>
                            </select>
                        </label>
                        <label v-if="!def.Universe" class="ot-field"><span class="lbl">Symbols</span><textarea v-model="symbolsText" class="ot-input mono" rows="3" placeholder="AAPL MSFT NVDA BTCUSDT"></textarea></label>
                        <div class="ot-field">
                            <span class="lbl">Interval</span>
                            <div class="ot-segment sm mono"><button v-for="i in ['OneHour', 'FourHour', 'OneDay', 'OneWeek']" :key="i" type="button" :aria-pressed="def.Interval === i" @click="def.Interval = i">{{ intervalShort(i) }}</button></div>
                        </div>

                        <div class="ot-field">
                            <span class="lbl">Filters (all must hold)</span>
                            <div v-for="(f, i) in def.Filters" :key="i" class="frow">
                                <OtFormulaInput v-model="def.Filters[i]" :prefix="String(i + 1)" require-boolean :inline-errors="false" @submit="run" />
                                <button class="ot-btn ghost xs" type="button" @click="def.Filters.splice(i, 1)">✕</button>
                            </div>
                            <button class="ot-btn ghost sm" type="button" @click="def.Filters.push('')">+ filter</button>
                        </div>

                        <details class="fields">
                            <summary class="lbl">Fields usable in filters</summary>
                            <div class="chips">
                                <button v-for="f in fields" :key="f.Key" class="ot-chip" type="button" :title="f.Label" @click="insertField(f.Key)">{{ f.Key }}</button>
                            </div>
                        </details>

                        <div class="ot-field">
                            <span class="lbl">Columns</span>
                            <div class="chips">
                                <button v-for="f in fields" :key="f.Key" class="ot-chip" type="button" :aria-pressed="hasColumn(f.Key)" @click="toggleColumn(f)">{{ f.Label }}</button>
                            </div>
                            <div v-for="(c, i) in customColumns" :key="c.Key" class="frow">
                                <input v-model="c.Label" class="ot-input sm lblin" placeholder="Label" />
                                <OtFormulaInput v-model="c.Expr" :inline-errors="false" />
                                <select v-model="c.Format" class="ot-select sm auto"><option value="number">num</option><option value="pct">%</option><option value="price">price</option><option value="compact">big</option><option value="bool">bool</option></select>
                                <button class="ot-btn ghost xs" type="button" @click="removeCustom(i)">✕</button>
                            </div>
                            <button class="ot-btn ghost sm" type="button" @click="addCustom">+ formula column</button>
                        </div>

                        <div class="ot-formgrid">
                            <label class="ot-field">
                                <span class="lbl">Sort</span>
                                <select v-model="def.SortBy" class="ot-select sm"><option :value="null">—</option><option v-for="c in def.Columns" :key="c.Key" :value="c.Key">{{ c.Label ?? c.Key }}</option></select>
                            </label>
                            <label class="ot-field"><span class="lbl">Order</span><select v-model="def.Descending" class="ot-select sm"><option :value="true">desc</option><option :value="false">asc</option></select></label>
                            <label class="ot-field"><span class="lbl">Limit</span><input v-model.number="def.Limit" class="ot-input sm num" type="number" min="1" max="1000" /></label>
                        </div>
                        <label class="ot-check"><input v-model="def.IncludeForming" type="checkbox" /> include forming bar</label>
                        <div v-if="validation.length" class="errs mono"><div v-for="e in validation" :key="e">{{ e }}</div></div>
                        <div class="acts">
                            <button class="ot-btn primary" type="button" :disabled="running" @click="run">{{ running ? 'Running…' : 'Run ⌃↵' }}</button>
                            <button class="ot-btn" type="button" :disabled="running" @click="save(false)">Save</button>
                            <button class="ot-btn ghost" type="button" @click="save(true)">Save as</button>
                            <button v-if="isSaved" class="ot-btn ghost" type="button" @click="remove">Delete</button>
                            <button class="ot-btn ghost" type="button" @click="reset">New</button>
                        </div>
                    </div>
                </OtPanel>
            </div>

            <OtPanel title="Results" code="SCRN" flush :loading="running && !result" :error="runError" :empty="!result" empty-text="Run a screen">
                <template #controls>
                    <span v-if="result" class="mono muted small">{{ result.Passed }} / {{ result.Evaluated }} passed · universe {{ result.Universe }} · {{ (result.ElapsedMs / 1000).toFixed(1) }}s · {{ fmtAge(result.AsOfUtc) }} ago</span>
                    <label class="ot-check small"><input v-model="showFailed" type="checkbox" /> failed rows</label>
                </template>
                <div v-if="result?.Errors?.length" class="ot-banner warn"><span class="glyph">⚠</span><span class="mono small">{{ result.Errors.slice(0, 3).join(' · ') }}{{ result.Errors.length > 3 ? ` (+${result.Errors.length - 3})` : '' }}</span></div>
                <OtGrid v-if="result" :rows="resultRows" :columns="resultColumns" grid-key="screener" selectable :row-key="(r: any) => r.Symbol"
                        export-name="screen" max-height="calc(100vh - 230px)" @select="openRow" />
            </OtPanel>
        </div>

        <div v-else class="ot-stack">
            <div class="ot-toolbar">
                <div class="ot-segment sm"><button v-for="m in MOVERS" :key="m.id" type="button" :aria-pressed="moverScreen === m.id" @click="moverScreen = m.id; loadMovers()">{{ m.label }}</button></div>
                <span class="summary">{{ movers?.Title ?? '' }}</span>
            </div>
            <OtPanel :title="movers?.Title ?? 'Movers'" code="MOST" flush :loading="loadingMovers" :error="moversError" :empty="!movers?.Rows?.length">
                <OtGrid :rows="movers?.Rows ?? []" :columns="moverCols" grid-key="movers" selectable :row-key="(r: any) => r.Symbol" export-name="movers" @select="openRow" />
            </OtPanel>
        </div>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Swal from 'sweetalert2';
import { SWAL_TERMINAL, clone, fmtAge, intervalShort, tGet, tPost, usePersisted } from '~/composables/useTerminal';
import type { GridColumn, GridFormat } from '~/components/Ot/Grid.vue';

definePageMeta({ layout: 'navbar' });

const route = useRoute();
const router = useRouter();
const mode = ref<'screen' | 'movers'>(route.query.movers ? 'movers' : 'screen');

interface ScreenColumn { Key: string; Label?: string | null; Expr: string; Format: string }
interface ScreenDef {
    Id: string; Name: string; Description?: string | null; Universe: string; Symbols: string[]; Interval: string; Filters: string[];
    Columns: ScreenColumn[]; SortBy?: string | null; Descending: boolean; Limit: number; IncludeForming: boolean; Inputs: Record<string, number>; Preset?: boolean;
}

const blank = (): ScreenDef => ({
    Id: '', Name: 'Untitled screen', Universe: 'megacaps', Symbols: [], Interval: 'OneDay', Filters: ['close > sma(close, 200)'],
    Columns: [], SortBy: 'chg1d', Descending: true, Limit: 100, IncludeForming: true, Inputs: {},
});

const def = usePersisted<ScreenDef>('screener.draft', blank());
const fields = ref<{ Key: string; Label: string; Format: string }[]>([]);
const defaults = ref<ScreenColumn[]>([]);
const presets = ref<ScreenDef[]>([]);
const saved = ref<ScreenDef[]>([]);
const universes = ref<any>(null);
const result = ref<any>(null);
const running = ref(false);
const runError = ref<string | null>(null);
const validation = ref<string[]>([]);
const showFailed = ref(false);

const symbolsText = computed({
    get: () => def.value.Symbols.join(' '),
    set: (v: string) => { def.value.Symbols = v.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean); },
});
const isSaved = computed(() => saved.value.some(s => s.Id === def.value.Id));
const universeGroups = computed(() => {
    const cat = (universes.value?.Catalog ?? []) as any[];
    const groups: { name: string; items: any[] }[] = [];
    for (const u of [...cat, ...(universes.value?.Watchlists ?? [])]) {
        let g = groups.find(x => x.name === u.Group);
        if (!g) { g = { name: u.Group, items: [] }; groups.push(g); }
        g.items.push(u);
    }
    return groups;
});

const builtin = computed(() => new Set(fields.value.map(f => f.Key.toLowerCase())));
const customColumns = computed(() => def.value.Columns.filter(c => !builtin.value.has(c.Expr.toLowerCase())));
function hasColumn(key: string) { return def.value.Columns.some(c => c.Expr.toLowerCase() === key.toLowerCase()); }
function toggleColumn(f: { Key: string; Label: string; Format: string }) {
    if (hasColumn(f.Key)) def.value.Columns = def.value.Columns.filter(c => c.Expr.toLowerCase() !== f.Key.toLowerCase());
    else def.value.Columns.push({ Key: f.Key, Label: f.Label, Expr: f.Key, Format: f.Format });
}
function addCustom() {
    const n = customColumns.value.length + 1;
    def.value.Columns.push({ Key: `f${n}`, Label: `F${n}`, Expr: 'roc(close, 20)', Format: 'pct' });
}
function removeCustom(i: number) {
    const c = customColumns.value[i];
    def.value.Columns = def.value.Columns.filter(x => x !== c);
}
function insertField(key: string) {
    const last = def.value.Filters.length - 1;
    if (last < 0 || def.value.Filters[last].trim()) def.value.Filters.push(`${key} > 0`);
    else def.value.Filters[last] = `${key} > 0`;
}

async function loadMeta() {
    const [f, p, s, u] = await Promise.allSettled([
        tGet<any>('/terminal/screener/fields'), tGet<ScreenDef[]>('/terminal/screener/presets'),
        tGet<ScreenDef[]>('/terminal/screener/saved'), tGet<any>('/terminal/universes'),
    ]);
    if (f.status === 'fulfilled') { fields.value = f.value.Fields ?? []; defaults.value = f.value.DefaultColumns ?? []; }
    if (p.status === 'fulfilled') presets.value = p.value ?? [];
    if (s.status === 'fulfilled') saved.value = s.value ?? [];
    if (u.status === 'fulfilled') universes.value = u.value;
    if (!def.value.Columns.length) def.value.Columns = clone(defaults.value);
}

function loadDefinition(id: string) {
    const d = presets.value.find(p => p.Id === id) ?? saved.value.find(s => s.Id === id);
    if (!d) return;
    def.value = clone({ ...blank(), ...d, Columns: d.Columns?.length ? d.Columns : defaults.value });
    void run();
}

function reset() { def.value = { ...blank(), Columns: clone(defaults.value) }; result.value = null; }

async function run() {
    running.value = true;
    runError.value = null;
    validation.value = [];
    try {
        const body = { ...def.value, Filters: def.value.Filters.filter(f => f.trim()) };
        const r = await tPost<any>('/terminal/screener/run', body);
        if (r?.Ok === false) { validation.value = r.Errors ?? ['invalid']; return; }
        result.value = r;
    } catch (e: any) { runError.value = e?.message ?? 'failed'; }
    finally { running.value = false; }
}

async function save(asNew: boolean) {
    let name = def.value.Name;
    if (asNew || !isSaved.value) {
        const r = await Swal.fire({ title: 'Screen name', input: 'text', inputValue: name, showCancelButton: true, ...SWAL_TERMINAL });
        if (!r.isConfirmed || !r.value) return;
        name = r.value;
    }
    try {
        const body = { ...def.value, Name: name, Id: asNew || !isSaved.value ? '' : def.value.Id, Filters: def.value.Filters.filter(f => f.trim()) };
        if (!body.Id) delete (body as any).Id;
        const r = await tPost<any>('/terminal/screener/save', body);
        if (r?.Ok === false) { validation.value = r.Errors ?? []; return; }
        def.value = r.Screen;
        saved.value = await tGet<ScreenDef[]>('/terminal/screener/saved');
    } catch (e: any) { void Swal.fire({ title: 'Save failed', text: e?.message, icon: 'error', ...SWAL_TERMINAL }); }
}

async function remove() {
    const ok = await Swal.fire({ title: `Delete “${def.value.Name}”?`, showCancelButton: true, icon: 'warning', ...SWAL_TERMINAL });
    if (!ok.isConfirmed) return;
    await tPost('/terminal/screener/delete', undefined, { id: def.value.Id });
    saved.value = await tGet<ScreenDef[]>('/terminal/screener/saved');
    reset();
}

const FORMAT: Record<string, GridFormat> = { number: 'num', pct: 'chg', price: 'price', compact: 'big', bool: 'bool' };
/** Volatility and yield are levels, not moves: unsigned, no diverging heat. */
const LEVEL_PCT = new Set(['atrpct', 'vol20', 'divyield']);
const resultColumns = computed<GridColumn[]>(() => {
    const cols: GridColumn[] = [
        { key: 'Symbol', label: 'Symbol', format: 'sym' },
        { key: 'Name', label: 'Name', format: 'text', clip: 200 },
        { key: 'Sector', label: 'Sector', format: 'text', hidden: true },
    ];
    for (const c of result.value?.Columns ?? []) {
        const fmt: GridFormat = c.Format === 'pct' && LEVEL_PCT.has(c.Key) ? 'pct' : FORMAT[c.Format] ?? 'num';
        cols.push({
            key: `v:${c.Key}`, label: c.Label ?? c.Key, format: fmt, value: r => r.Values?.[c.Key] ?? null, hint: c.Expr,
            heat: fmt === 'chg' ? (/1d|gap/.test(c.Key) ? 4 : 20) : undefined, decimals: fmt === 'num' ? 2 : undefined,
        });
    }
    cols.push({ key: 'Spark', label: 'Trend', format: 'spark', sortable: false });
    return cols;
});
const resultRows = computed(() => (result.value?.Rows ?? []).filter((r: any) => showFailed.value || r.Passed));

function openRow(r: any) { void router.push(`/omnitrader/instrument?symbol=${encodeURIComponent(r.Symbol)}`); }

// movers
const MOVERS = [
    { id: 'day_gainers', label: 'Gainers' }, { id: 'day_losers', label: 'Losers' }, { id: 'most_actives', label: 'Most active' },
    { id: 'small_cap_gainers', label: 'Small-cap gainers' }, { id: 'undervalued_growth_stocks', label: 'Undervalued growth' },
    { id: 'growth_technology_stocks', label: 'Growth tech' }, { id: 'most_shorted_stocks', label: 'Most shorted' }, { id: 'aggressive_small_caps', label: 'Aggressive small caps' },
];
const moverScreen = usePersisted('screener.movers', 'day_gainers');
const movers = ref<any>(null);
const loadingMovers = ref(false);
const moversError = ref<string | null>(null);
async function loadMovers() {
    loadingMovers.value = true;
    try { movers.value = await tGet<any>('/terminal/movers', { screen: moverScreen.value, count: 100 }); moversError.value = null; }
    catch (e: any) { moversError.value = e?.message ?? 'failed'; }
    finally { loadingMovers.value = false; }
}
const moverCols: GridColumn[] = [
    { key: 'Symbol', label: 'Symbol', format: 'sym' }, { key: 'Name', label: 'Name', format: 'text', clip: 220 },
    { key: 'Price', label: 'Last', format: 'price' }, { key: 'ChangePct', label: '%', format: 'chg', heat: 10 },
    { key: 'Volume', label: 'Volume', format: 'big' }, { key: 'AvgVolume3M', label: 'Avg vol 3M', format: 'big' },
    { key: 'RelVol', label: 'Rel vol', format: 'num', value: r => (r.Volume && r.AvgVolume3M ? r.Volume / r.AvgVolume3M : null) },
    { key: 'MarketCap', label: 'Mkt cap', format: 'big' }, { key: 'TrailingPE', label: 'P/E', format: 'num' }, { key: 'Change52wPct', label: '52w', format: 'chg', heat: 60 },
];

function onKey(e: KeyboardEvent) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && mode.value === 'screen') { e.preventDefault(); void run(); } }
onMounted(async () => {
    window.addEventListener('keydown', onKey);
    await loadMeta();
    if (mode.value === 'movers') void loadMovers();
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
watch(() => route.query.movers, v => { if (v) { mode.value = 'movers'; void loadMovers(); } });
</script>

<style scoped>
.def { display: flex; flex-direction: column; gap: 8px; }
.frow { display: flex; gap: 4px; align-items: center; margin-bottom: 3px; }
.frow .lblin { width: 80px; flex: 0 0 auto; }
.chips { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 4px; }
.fields summary { cursor: pointer; font-size: 10px; letter-spacing: 0.7px; text-transform: uppercase; color: var(--ot-muted); font-weight: 650; }
.fields .chips { margin-top: 4px; }
.errs { color: var(--ot-negative); font-size: 11px; }
.acts { display: flex; gap: 4px; flex-wrap: wrap; }
.small { font-size: 10.5px; }
</style>
