<template>
    <!-- Sorted bars with the value, its share and the change against the previous window printed beside each. -->
    <div class="ms-ranked">
        <div v-if="!items.length" class="ot-state compact">
            <span class="glyph" aria-hidden="true">○</span>
            <strong>{{ emptyTitle }}</strong>
        </div>
        <div v-else class="rows" role="list">
            <component :is="selectable ? 'button' : 'div'" v-for="item in shown" :key="item.key" class="row" role="listitem"
                       :type="selectable ? 'button' : undefined" :title="item.title" @click="selectable && $emit('select', item.key)">
                <span class="lbl">
                    <span v-if="item.colour" class="dot" :style="{ background: item.colour }"></span>
                    <span class="name">{{ item.label }}</span>
                </span>
                <span class="track"><span class="fill" :style="{ width: `${Math.max(item.value ? 1.5 : 0, (item.value / max) * 100)}%`, background: item.colour ?? colour }"></span></span>
                <span class="val">{{ format(item.value) }}</span>
                <span v-if="showShare" class="pct">{{ item.share != null ? `${item.share.toFixed(item.share > 0 && item.share < 1 ? 1 : 0)}%` : '' }}</span>
                <span v-if="showDelta" class="ms-delta" :class="deltaTone(item)">{{ deltaText(item) }}</span>
            </component>
            <div v-if="folded" class="row other">
                <span class="lbl"><span class="name">{{ folded.count }} more</span></span>
                <span class="track"><span class="fill" :style="{ width: `${Math.max(1.5, (folded.value / max) * 100)}%`, background: 'var(--ms-other)' }"></span></span>
                <span class="val">{{ format(folded.value) }}</span>
                <span v-if="showShare" class="pct">{{ folded.share.toFixed(0) }}%</span>
                <span v-if="showDelta" class="ms-delta flat"></span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { fmtCount } from '~/composables/useOmniTumblr';

export interface RankedItem {
    key: string;
    label: string;
    value: number;
    previous?: number | null;
    share?: number | null;
    colour?: string;
    title?: string;
}

const props = withDefaults(defineProps<{
    items: RankedItem[];
    limit?: number;
    colour?: string;
    format?: (value: number) => string;
    selectable?: boolean;
    showShare?: boolean;
    showDelta?: boolean;
    emptyTitle?: string;
}>(), { limit: 8, colour: 'var(--ot-cat-1)', format: (v: number) => fmtCount(v), showShare: true, showDelta: true, emptyTitle: 'Nothing in this window' });

defineEmits<{ select: [key: string] }>();

const sorted = computed(() => [...props.items].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)));
const shown = computed(() => sorted.value.slice(0, props.limit));
const folded = computed(() => {
    const rest = sorted.value.slice(props.limit).filter(i => i.value > 0);
    if (!rest.length) return null;
    return { count: rest.length, value: rest.reduce((a, i) => a + i.value, 0), share: rest.reduce((a, i) => a + (i.share ?? 0), 0) };
});
const max = computed(() => Math.max(1, ...props.items.map(i => i.value)));

function deltaText(item: RankedItem): string {
    if (item.previous == null) return '';
    const diff = item.value - item.previous;
    if (diff === 0) return '±0';
    return `${diff > 0 ? '+' : '−'}${fmtCount(Math.abs(diff))}`;
}

function deltaTone(item: RankedItem): string {
    if (item.previous == null) return 'flat';
    return item.value > item.previous ? 'up' : item.value < item.previous ? 'down' : 'flat';
}
</script>

<style scoped>
.rows { display: flex; flex-direction: column; gap: 4px; }
.row {
    display: grid;
    grid-template-columns: minmax(84px, 150px) minmax(0, 1fr) 52px auto auto;
    gap: var(--ot-space-2);
    align-items: center;
    font-size: 12.5px;
    padding: 3px var(--ot-space-1);
    border-radius: 4px;
    background: none;
    border: 0;
    color: inherit;
    font-family: inherit;
    text-align: left;
    width: 100%;
}
button.row { cursor: pointer; }
button.row:hover { background: var(--ot-surface-3); }
button.row:hover .name { color: var(--ot-text); }
.lbl { display: flex; align-items: center; gap: 6px; min-width: 0; }
.name { color: var(--ot-text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dot { width: 8px; height: 8px; border-radius: 2px; flex: 0 0 auto; }
.track { position: relative; height: 12px; border-radius: 3px; background: rgba(255, 255, 255, 0.04); overflow: hidden; }
.fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; }
.val { text-align: right; font-family: var(--ot-mono); }
.pct { text-align: right; font-family: var(--ot-mono); color: var(--ot-muted); font-size: 11.5px; min-width: 32px; }
.ms-delta { min-width: 38px; text-align: right; }
.other .name { font-style: italic; color: var(--ot-muted); }
</style>
