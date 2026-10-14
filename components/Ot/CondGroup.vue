<template>
    <div class="otcg" :class="{ nested: depth > 0 }">
        <div class="head">
            <div class="ot-segment sm" role="group" aria-label="Logic">
                <button type="button" :aria-pressed="group.Logic !== 'any'" @click="group.Logic = 'all'">ALL</button>
                <button type="button" :aria-pressed="group.Logic === 'any'" @click="group.Logic = 'any'">ANY</button>
            </div>
            <label class="ot-check"><input v-model="group.Negate" type="checkbox" /> NOT</label>
            <span class="muted mono cnt">{{ group.Conditions.filter((c: any) => c.Enabled !== false).length }} active</span>
            <span class="grow"></span>
            <button class="ot-btn ghost xs" type="button" @click="add('compare')">+ compare</button>
            <button class="ot-btn ghost xs" type="button" @click="add('formula')">+ formula</button>
            <button v-if="depth < 3" class="ot-btn ghost xs" type="button" @click="add('group')">+ group</button>
            <slot name="actions" />
        </div>
        <div v-if="!group.Conditions.length" class="empty muted">Empty — {{ depth === 0 ? 'never true' : 'ignored' }}</div>
        <OtCondNode v-for="(node, i) in group.Conditions" :key="i" :node="node" :depth="depth"
                    @remove="group.Conditions.splice(i, 1)" @up="move(i, -1)" @down="move(i, 1)" />
    </div>
</template>

<script setup lang="ts">
const props = defineProps<{ group: any; depth: number }>();

function add(kind: 'compare' | 'formula' | 'group') {
    const node: any = { Kind: kind, Enabled: true, Op: '>', Bars: 1 };
    if (kind === 'compare') {
        node.Left = { Kind: 'indicator', Indicator: 'rsi', Params: { length: 14 }, Field: 'close', Offset: 0 };
        node.Right = { Kind: 'value', Value: 50, Offset: 0, Field: 'close', Params: {} };
    } else if (kind === 'formula') node.Formula = '';
    else node.Group = { Logic: 'any', Negate: false, Conditions: [] };
    props.group.Conditions.push(node);
}

function move(i: number, d: number) {
    const list = props.group.Conditions;
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const [x] = list.splice(i, 1);
    list.splice(j, 0, x);
}
</script>

<style scoped>
.otcg { display: flex; flex-direction: column; gap: 3px; padding: 6px 8px; }
.otcg.nested { border-left: 2px solid var(--ot-line-strong); margin-left: 6px; padding: 4px 6px; background: rgba(255, 255, 255, 0.012); }
.head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.head .grow { flex: 1 1 auto; }
.cnt { font-size: 10.5px; }
.empty { font-size: 11px; padding: 2px 0; font-family: var(--ot-mono); }
</style>
