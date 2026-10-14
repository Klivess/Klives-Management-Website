<template>
    <span class="otop">
        <select v-model="operand.Kind" class="ot-select sm auto kind" @change="onKind">
            <option value="indicator">ind</option>
            <option value="price">price</option>
            <option value="value">value</option>
            <option v-if="inputs.length" value="input">input</option>
            <option value="formula">ƒ</option>
        </select>

        <template v-if="operand.Kind === 'indicator'">
            <select v-model="operand.Indicator" class="ot-select sm auto mono ind" @change="onIndicator">
                <optgroup v-for="g in groups" :key="g.name" :label="g.name">
                    <option v-for="s in g.items" :key="s.Id" :value="s.Id">{{ s.Short }}</option>
                </optgroup>
            </select>
            <span class="params mono">(<template v-for="(inp, i) in numericInputs" :key="inp.Name">
                <span v-if="i" class="muted">,</span>
                <span class="param" :title="inp.Label">
                    <select v-if="inp.Kind === 'Source' || inp.Kind === 'Choice'" :value="operand.Params?.[inp.Name] ?? inp.Default" class="ot-select xs auto"
                            @change="setParam(inp.Name, ($event.target as HTMLSelectElement).value)">
                        <option v-for="o in inp.Options ?? []" :key="o" :value="o">{{ o }}</option>
                    </select>
                    <input v-else :value="operand.Params?.[inp.Name] ?? inp.Default" class="ot-input xs num pv" :list="`inputs-${uid}`"
                           @change="setParam(inp.Name, ($event.target as HTMLInputElement).value)" />
                </span>
            </template>)</span>
            <select v-if="spec && spec.Outputs.length > 1" :value="operand.Output ?? spec.Outputs[0].Name" class="ot-select sm auto"
                    @change="operand.Output = ($event.target as HTMLSelectElement).value">
                <option v-for="o in spec.Outputs" :key="o.Name" :value="o.Name">.{{ o.Name }}</option>
            </select>
            <datalist :id="`inputs-${uid}`"><option v-for="n in inputs" :key="n" :value="n" /></datalist>
        </template>

        <select v-else-if="operand.Kind === 'price'" v-model="operand.Field" class="ot-select sm auto mono">
            <option v-for="f in FIELDS" :key="f" :value="f">{{ f }}</option>
        </select>

        <input v-else-if="operand.Kind === 'value'" v-model.number="operand.Value" class="ot-input sm num val" type="number" step="any" />

        <select v-else-if="operand.Kind === 'input'" v-model="operand.Input" class="ot-select sm auto mono">
            <option v-for="n in inputs" :key="n" :value="n">{{ n }}</option>
        </select>

        <OtFormulaInput v-else-if="operand.Kind === 'formula'" v-model="operand.Formula" :inputs="inputs" :symbol="ctx?.symbol.value" class="fx" />

        <template v-if="operand.Kind !== 'value'">
            <label class="mini" title="Bars ago"><span class="muted">[</span><input v-model.number="operand.Offset" class="ot-input xs num" type="number" min="0" max="500" placeholder="0" /><span class="muted">]</span></label>
            <label class="mini" title="Multiplier"><span class="muted">×</span><input v-model.number="operand.Scale" class="ot-input xs num" type="number" step="any" placeholder="1" /></label>
        </template>
    </span>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, inject, type ComputedRef, type Ref } from 'vue';
import type { IndicatorSpec } from '~/composables/useTerminal';

const props = defineProps<{ operand: any }>();
const ctx = inject<{ inputs: ComputedRef<string[]>; symbol: ComputedRef<string>; catalog: Ref<IndicatorSpec[]> } | null>('blueprint', null);
const uid = getCurrentInstance()?.uid ?? Math.floor(Math.random() * 1e6);

const FIELDS = ['close', 'open', 'high', 'low', 'volume', 'hl2', 'hlc3', 'ohlc4', 'hlcc4'];
const inputs = computed(() => ctx?.inputs.value ?? []);
const catalog = computed(() => ctx?.catalog.value ?? []);
const spec = computed(() => catalog.value.find(s => s.Id === props.operand.Indicator) ?? null);
const numericInputs = computed(() => spec.value?.Inputs ?? []);
const groups = computed(() => {
    const out: { name: string; items: IndicatorSpec[] }[] = [];
    for (const s of catalog.value) {
        let g = out.find(x => x.name === s.Category);
        if (!g) { g = { name: s.Category, items: [] }; out.push(g); }
        g.items.push(s);
    }
    if (!catalog.value.some(s => s.Id === props.operand.Indicator) && props.operand.Indicator)
        out.unshift({ name: 'current', items: [{ Id: props.operand.Indicator, Short: props.operand.Indicator } as IndicatorSpec] });
    return out;
});

function onKind() {
    const o = props.operand;
    if (o.Kind === 'indicator' && !o.Indicator) { o.Indicator = 'ema'; o.Params = { length: 20 }; }
    if (o.Kind === 'price' && !o.Field) o.Field = 'close';
    if (o.Kind === 'value' && (o.Value === null || o.Value === undefined)) o.Value = 0;
    if (o.Kind === 'input' && !o.Input) o.Input = inputs.value[0];
    if (o.Kind === 'formula' && !o.Formula) o.Formula = 'close';
}

function onIndicator() {
    const s = spec.value;
    if (!s) return;
    const params: Record<string, any> = {};
    for (const i of s.Inputs) if (i.Kind !== 'Source') params[i.Name] = i.Default;
    props.operand.Params = params;
    props.operand.Output = s.Outputs.length > 1 ? s.Outputs[0].Name : null;
}

function setParam(name: string, raw: string) {
    const t = raw.trim();
    const n = Number(t);
    (props.operand.Params ??= {})[name] = t !== '' && Number.isFinite(n) ? n : t;
}
</script>

<style scoped>
.otop { display: inline-flex; align-items: center; gap: 3px; flex-wrap: wrap; padding: 1px 3px; border: 1px solid var(--ot-line); border-radius: 3px; background: #08090b; }
.kind { color: var(--ot-muted); }
.ind { color: var(--ot-info); font-weight: 600; }
.params { display: inline-flex; align-items: center; gap: 2px; font-size: 11px; }
.pv { width: 54px; }
.val { width: 84px; }
.mini { display: inline-flex; align-items: center; gap: 1px; font-size: 11px; }
.mini input { width: 42px; }
.fx { min-width: 220px; }
.ot-input.xs, .ot-select.xs { height: 20px; font-size: 11px; padding: 0 4px; }
</style>
