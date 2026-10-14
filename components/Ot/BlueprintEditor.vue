<template>
    <div class="otbp">
        <section class="sec">
            <header><h4>Universe</h4></header>
            <div class="row">
                <div class="ot-segment sm" role="group" aria-label="Universe mode">
                    <button v-for="m in ['single', 'basket', 'universe']" :key="m" type="button" :aria-pressed="bp.Universe.Mode === m" @click="bp.Universe.Mode = m">{{ m }}</button>
                </div>
                <template v-if="bp.Universe.Mode === 'single'">
                    <label class="f"><span>Symbol</span><input v-model="symbolUpper" class="ot-input sm mono" /></label>
                </template>
                <template v-else-if="bp.Universe.Mode === 'basket'">
                    <label class="f wide"><span>Symbols</span><input v-model="basketText" class="ot-input sm mono" placeholder="BTCUSDT, ETHUSDT, SOLUSDT" /></label>
                </template>
                <template v-else>
                    <label class="f"><span>Top N by volume</span><input v-model.number="bp.Universe.TopN" class="ot-input sm num" type="number" min="2" max="200" /></label>
                    <label class="f"><span>Quote</span><input v-model="bp.Universe.QuoteAsset" class="ot-input sm mono" /></label>
                </template>
                <label v-if="bp.Universe.Mode !== 'single'" class="f"><span>Regime / benchmark</span><input v-model="bp.Universe.RegimeSymbol" class="ot-input sm mono" /></label>
                <span class="grow"></span>
                <div class="ot-segment sm" role="group" aria-label="Direction">
                    <button v-for="d in ['long', 'short', 'both']" :key="d" type="button" :aria-pressed="bp.Direction === d" @click="bp.Direction = d">{{ d }}</button>
                </div>
            </div>
        </section>

        <section class="sec">
            <header>
                <h4>Inputs</h4>
                <button class="ot-btn ghost xs" type="button" @click="addInput">+ input</button>
            </header>
            <table v-if="bp.Inputs.length" class="ot-table inputs">
                <thead><tr><th>Name</th><th>Label</th><th>Type</th><th class="num">Default</th><th class="num">Min</th><th class="num">Max</th><th class="num">Step</th><th></th></tr></thead>
                <tbody>
                    <tr v-for="(inp, i) in bp.Inputs" :key="i">
                        <td><input v-model="inp.Name" class="ot-input sm mono" /></td>
                        <td><input v-model="inp.Label" class="ot-input sm" /></td>
                        <td>
                            <select v-model="inp.Type" class="ot-select sm">
                                <option value="int">int</option><option value="double">double</option><option value="bool">bool</option>
                            </select>
                        </td>
                        <td><input v-model.number="inp.Default" class="ot-input sm num" type="number" :step="inp.Type === 'int' ? 1 : 'any'" /></td>
                        <td><input v-model.number="inp.Min" class="ot-input sm num" type="number" step="any" /></td>
                        <td><input v-model.number="inp.Max" class="ot-input sm num" type="number" step="any" /></td>
                        <td><input v-model.number="inp.Step" class="ot-input sm num" type="number" step="any" /></td>
                        <td><button class="ot-btn ghost xs" type="button" @click="bp.Inputs.splice(i, 1)">✕</button></td>
                    </tr>
                </tbody>
            </table>
        </section>

        <section v-for="rule in visibleRules" :key="rule.key" class="sec">
            <header>
                <h4>{{ rule.label }}</h4>
                <span v-if="compiled?.[rule.compiledKey]" class="compiled mono" :title="compiled[rule.compiledKey]">{{ compiled[rule.compiledKey] }}</span>
            </header>
            <OtCondGroup :group="(bp.Rules as any)[rule.key]" :depth="0" />
        </section>

        <section class="sec">
            <header>
                <h4>Ranking</h4>
                <label class="ot-check"><input type="checkbox" :checked="!!bp.Ranking" @change="toggleRanking" /> rotate the universe by score</label>
            </header>
            <div v-if="bp.Ranking" class="row">
                <label class="f wide"><span>Score (higher ranks first)</span><OtFormulaInput v-model="bp.Ranking.Score" :inputs="inputNames" :symbol="previewSymbol" /></label>
                <label class="f"><span>Top</span><input v-model.number="bp.Ranking.Top" class="ot-input sm num" type="number" min="1" /></label>
                <label class="f"><span>Bottom (short)</span><input v-model.number="bp.Ranking.Bottom" class="ot-input sm num" type="number" min="0" /></label>
                <label class="f"><span>Rebalance bars</span><input v-model.number="bp.Ranking.RebalanceBars" class="ot-input sm num" type="number" min="1" /></label>
                <label class="f">
                    <span>Weighting</span>
                    <select v-model="bp.Ranking.Weighting" class="ot-select sm"><option value="equal">equal</option><option value="inverse-vol">inverse-vol</option><option value="score">score</option></select>
                </label>
                <label class="f"><span>Gross exposure</span><input v-model.number="bp.Ranking.GrossExposure" class="ot-input sm num" type="number" step="0.05" min="0" max="3" /></label>
                <label class="f"><span>Min $ volume</span><input v-model.number="bp.Ranking.MinDollarVolume" class="ot-input sm num" type="number" min="0" /></label>
            </div>
        </section>

        <section class="sec">
            <header><h4>Sizing</h4></header>
            <div class="row">
                <label class="f">
                    <span>Mode</span>
                    <select v-model="bp.Sizing.Mode" class="ot-select sm">
                        <option value="percent">% of equity</option><option value="quote">fixed quote</option>
                        <option value="risk">% risked at stop</option><option value="voltarget">vol target %</option>
                    </select>
                </label>
                <label class="f"><span>{{ sizingLabel }}</span><input v-model.number="bp.Sizing.Value" class="ot-input sm num" type="number" step="any" /></label>
                <label class="f"><span>Max positions</span><input v-model.number="bp.Sizing.MaxPositions" class="ot-input sm num" type="number" min="1" /></label>
                <label class="f"><span>Max position %</span><input v-model.number="bp.Sizing.MaxPositionPct" class="ot-input sm num" type="number" min="1" max="1000" /></label>
            </div>
        </section>

        <section class="sec">
            <header><h4>Risk</h4></header>
            <div class="row">
                <template v-for="lvl in exitLevels" :key="lvl.key">
                    <label class="f">
                        <span>{{ lvl.label }}</span>
                        <select v-model="(bp.Risk as any)[lvl.key].Mode" class="ot-select sm">
                            <option value="none">off</option><option value="percent">%</option><option value="atr">ATR ×</option>
                            <option v-if="lvl.key === 'TakeProfit'" value="r">R ×</option>
                        </select>
                    </label>
                    <label v-if="(bp.Risk as any)[lvl.key].Mode !== 'none'" class="f narrow">
                        <span>value</span><input v-model.number="(bp.Risk as any)[lvl.key].Value" class="ot-input sm num" type="number" step="any" />
                    </label>
                    <label v-if="(bp.Risk as any)[lvl.key].Mode === 'atr'" class="f narrow">
                        <span>ATR len</span><input v-model.number="(bp.Risk as any)[lvl.key].AtrLength" class="ot-input sm num" type="number" min="1" />
                    </label>
                </template>
                <label class="f narrow"><span>Max bars</span><input v-model.number="bp.Risk.MaxBarsInTrade" class="ot-input sm num" type="number" min="0" /></label>
                <label class="f narrow"><span>Cooldown</span><input v-model.number="bp.Risk.CooldownBars" class="ot-input sm num" type="number" min="0" /></label>
                <label class="ot-check"><input v-model="bp.Risk.ExitOnFilterOff" type="checkbox" /> exit when filter off</label>
            </div>
        </section>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, provide, ref } from 'vue';
import { loadIndicatorCatalog, type IndicatorSpec } from '~/composables/useTerminal';

const props = defineProps<{ modelValue: any; compiled?: Record<string, string> | null; symbol?: string }>();

const bp = computed(() => props.modelValue);
const catalog = ref<IndicatorSpec[]>([]);
onMounted(async () => { try { catalog.value = await loadIndicatorCatalog(); } catch { /* editor still works with formulas */ } });

const inputNames = computed<string[]>(() => (bp.value?.Inputs ?? []).map((i: any) => i.Name).filter(Boolean));
const previewSymbol = computed(() => props.symbol ?? bp.value?.Universe?.Symbol ?? 'BTCUSDT');
provide('blueprint', { catalog, inputs: inputNames, symbol: previewSymbol });

const symbolUpper = computed({
    get: () => bp.value.Universe.Symbol,
    set: (v: string) => { bp.value.Universe.Symbol = v.toUpperCase().trim(); },
});
const basketText = computed({
    get: () => (bp.value.Universe.Symbols ?? []).join(', '),
    set: (v: string) => { bp.value.Universe.Symbols = v.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean); },
});

const visibleRules = computed(() => {
    const dir = bp.value.Direction;
    const rules = [
        { key: 'EntryLong', label: 'Enter long', compiledKey: 'entryLong', show: dir !== 'short' },
        { key: 'ExitLong', label: 'Exit long', compiledKey: 'exitLong', show: dir !== 'short' },
        { key: 'EntryShort', label: 'Enter short', compiledKey: 'entryShort', show: dir !== 'long' },
        { key: 'ExitShort', label: 'Exit short', compiledKey: 'exitShort', show: dir !== 'long' },
        { key: 'Filter', label: bp.value.Universe.Mode === 'single' ? 'Filter (entries only while true)' : 'Regime filter (on the regime symbol)', compiledKey: 'filter', show: true },
    ];
    return rules.filter(r => r.show);
});

const exitLevels = [
    { key: 'StopLoss', label: 'Stop loss' },
    { key: 'TakeProfit', label: 'Take profit' },
    { key: 'Trailing', label: 'Trailing stop' },
];

const sizingLabel = computed(() => ({ percent: '% equity', quote: 'quote amount', risk: '% risked', voltarget: 'annual vol %' } as Record<string, string>)[bp.value.Sizing.Mode] ?? 'value');

function addInput() {
    const n = bp.value.Inputs.length + 1;
    bp.value.Inputs.push({ Name: `p${n}`, Label: `Param ${n}`, Type: 'int', Default: 20, Min: 2, Max: 200, Step: 1 });
}

function toggleRanking(e: Event) {
    bp.value.Ranking = (e.target as HTMLInputElement).checked
        ? { Score: 'roc(close, 90)', Top: 5, Bottom: 0, RebalanceBars: 7, Weighting: 'equal', GrossExposure: 0.95, MinDollarVolume: 0 }
        : null;
}
</script>

<style scoped>
.otbp { display: flex; flex-direction: column; gap: 6px; }
.sec { border: 1px solid var(--ot-line); border-radius: var(--ot-radius); background: var(--ot-surface); }
.sec > header { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-bottom: 1px solid var(--ot-line); background: var(--ot-surface-2); min-height: 26px; }
.sec > header h4 { margin: 0; font-size: 10.5px; letter-spacing: 0.9px; text-transform: uppercase; color: var(--ot-text-2); font-weight: 700; }
.sec > header .compiled { font-size: 10.5px; color: var(--ot-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%; margin-left: auto; }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; padding: 6px 8px; }
.row .grow { flex: 1 1 auto; }
.f { display: flex; flex-direction: column; gap: 2px; min-width: 110px; }
.f.wide { flex: 1 1 320px; }
.f.narrow { min-width: 70px; width: 80px; }
.f > span { font-size: 9.5px; letter-spacing: 0.7px; text-transform: uppercase; color: var(--ot-muted); font-weight: 650; }
table.inputs td { padding: 2px 4px; height: auto; }
table.inputs input, table.inputs select { min-width: 60px; }
</style>
