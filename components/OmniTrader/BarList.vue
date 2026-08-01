<template>
    <!--
      Sorted horizontal bars: length on a common scale is the encoding people read
      most accurately, and a sorted list answers "which is biggest?" without any
      decoding at all. Values are always printed beside the bar, so the chart never
      becomes the only way to read a number.
    -->
    <div>
        <div v-if="!items.length" class="ot-state compact">
            <span class="glyph" aria-hidden="true">○</span>
            <strong>{{ emptyTitle }}</strong>
        </div>

        <div v-else class="ot-bars" role="list">
            <div v-for="item in shown" :key="item.key" class="ot-bar" role="listitem"
                 :class="{ clickable: !!onSelect }" :title="item.secondary ?? undefined"
                 @click="onSelect?.(item.key)">
                <span class="lbl" :title="item.label">{{ item.label }}</span>
                <span class="track">
                    <span v-if="diverging" class="zero" :style="{ left: `${zeroAt}%` }"></span>
                    <span class="fill" :class="item.value >= 0 ? 'pos' : 'neg'" :style="barStyle(item.value)"></span>
                </span>
                <span class="val" :class="signClass(item.value)">{{ format(item.value) }}</span>
            </div>

            <!-- Beyond the cut, the tail is folded rather than dropped: a total that
                 silently omits rows is a wrong total. -->
            <div v-if="folded" class="ot-bar other" role="listitem">
                <span class="lbl">Other ({{ folded.count }})</span>
                <span class="track">
                    <span v-if="diverging" class="zero" :style="{ left: `${zeroAt}%` }"></span>
                    <span class="fill" :class="folded.value >= 0 ? 'pos' : 'neg'" :style="barStyle(folded.value)"></span>
                </span>
                <span class="val" :class="signClass(folded.value)">{{ format(folded.value) }}</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface BarItem { key: string; label: string; value: number; secondary?: string }

const props = withDefaults(defineProps<{
    items: BarItem[];
    format?: (value: number) => string;
    /** Rows past this are folded into "Other" rather than scrolling forever. */
    limit?: number;
    emptyTitle?: string;
    onSelect?: (key: string) => void;
    /** Colour by sign. Off for pure magnitude, where sign carries no meaning. */
    signed?: boolean;
}>(), { limit: 8, emptyTitle: 'Nothing in this window', signed: true });

const format = computed(() => props.format ?? ((v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 })));

const sorted = computed(() => [...props.items].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)));
const shown = computed(() => sorted.value.slice(0, props.limit));
const folded = computed(() => {
    const rest = sorted.value.slice(props.limit);
    if (!rest.length) return null;
    return { count: rest.length, value: rest.reduce((sum, r) => sum + r.value, 0) };
});

const diverging = computed(() => props.items.some(i => i.value < 0));
const scale = computed(() => Math.max(1e-9, ...props.items.map(i => Math.abs(i.value))));
// With negatives on screen the axis has a real midpoint, so zero sits in the middle.
const zeroAt = computed(() => (diverging.value ? 50 : 0));

function barStyle(value: number) {
    const magnitude = (Math.abs(value) / scale.value) * (diverging.value ? 50 : 100);
    return diverging.value
        ? value >= 0
            ? { left: '50%', width: `${magnitude}%` }
            : { right: '50%', width: `${magnitude}%` }
        : { left: '0%', width: `${Math.max(1, magnitude)}%` };
}

function signClass(value: number) {
    if (!props.signed) return '';
    return value > 0 ? 'pos' : value < 0 ? 'neg' : '';
}
</script>

<style scoped>
.ot-bar.clickable { cursor: pointer; }
.ot-bar.clickable:hover .lbl { color: var(--ot-text); }
.ot-bar.other .lbl { color: var(--ot-muted); font-style: italic; }
</style>
