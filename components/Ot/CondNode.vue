<template>
    <div class="otcn" :class="{ off: node.Enabled === false }">
        <input v-model="node.Enabled" type="checkbox" class="en" title="Enabled" />
        <template v-if="node.Kind === 'compare'">
            <OtOperand :operand="node.Left" />
            <select v-model="node.Op" class="ot-select sm auto op mono">
                <option v-for="o in OPS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
            <OtOperand v-if="!unary" :operand="ensureRight()" />
            <template v-if="node.Op === 'between' || node.Op === 'outside'">
                <span class="muted">and</span>
                <OtOperand :operand="ensureRight2()" />
            </template>
            <label class="bars" :title="unary ? 'Bars' : 'Held for N bars'">
                <span class="muted">{{ unary ? 'over' : 'for' }}</span>
                <input v-model.number="node.Bars" class="ot-input sm num" type="number" min="1" max="500" />
                <span class="muted">bars</span>
            </label>
        </template>
        <template v-else-if="node.Kind === 'formula'">
            <OtFormulaInput v-model="node.Formula" :inputs="ctx?.inputs.value" :symbol="ctx?.symbol.value" require-boolean :inline-errors="true" />
        </template>
        <template v-else-if="node.Kind === 'group'">
            <OtCondGroup :group="node.Group" :depth="depth + 1" />
        </template>
        <span class="acts">
            <button class="ot-btn ghost xs" type="button" title="Up" @click="$emit('up')">↑</button>
            <button class="ot-btn ghost xs" type="button" title="Down" @click="$emit('down')">↓</button>
            <button class="ot-btn ghost xs" type="button" title="Remove" @click="$emit('remove')">✕</button>
        </span>
    </div>
</template>

<script setup lang="ts">
import { computed, inject, type ComputedRef, type Ref } from 'vue';

const props = defineProps<{ node: any; depth: number }>();
defineEmits<{ remove: []; up: []; down: [] }>();

const ctx = inject<{ inputs: ComputedRef<string[]>; symbol: ComputedRef<string>; catalog: Ref<any[]> } | null>('blueprint', null);

const OPS = [
    { value: '>', label: '>' }, { value: '>=', label: '≥' }, { value: '<', label: '<' }, { value: '<=', label: '≤' },
    { value: '==', label: '=' }, { value: '!=', label: '≠' }, { value: 'crosses_above', label: 'crosses above' },
    { value: 'crosses_below', label: 'crosses below' }, { value: 'rising', label: 'rising' }, { value: 'falling', label: 'falling' },
    { value: 'between', label: 'between' }, { value: 'outside', label: 'outside' },
];

const unary = computed(() => props.node.Op === 'rising' || props.node.Op === 'falling');

function ensureRight() {
    props.node.Right ??= { Kind: 'value', Value: 0, Offset: 0, Field: 'close', Params: {} };
    return props.node.Right;
}
function ensureRight2() {
    props.node.Right2 ??= { Kind: 'value', Value: 0, Offset: 0, Field: 'close', Params: {} };
    return props.node.Right2;
}
props.node.Left ??= props.node.Kind === 'compare' ? { Kind: 'price', Field: 'close', Offset: 0, Params: {} } : props.node.Left;
</script>

<style scoped>
.otcn { display: flex; align-items: flex-start; gap: 5px; flex-wrap: wrap; padding: 3px 4px; border-radius: 3px; }
.otcn:hover { background: rgba(255, 255, 255, 0.02); }
.otcn.off { opacity: 0.5; }
.en { margin-top: 5px; accent-color: var(--ot-accent); }
.op { color: var(--ot-accent); font-weight: 600; }
.bars { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; }
.bars input { width: 56px; }
.acts { margin-left: auto; display: inline-flex; gap: 1px; opacity: 0; }
.otcn:hover .acts { opacity: 1; }
</style>
