<template>
    <!-- Buckets keep their natural order (they are a scale, not a ranking); count and share are printed. -->
    <div class="ms-dist">
        <div v-if="!total" class="ot-state compact">
            <span class="glyph" aria-hidden="true">○</span>
            <strong>{{ emptyTitle }}</strong>
        </div>
        <div v-else class="rows" role="list">
            <div v-for="b in visible" :key="b.Label" class="row" role="listitem" :title="b.AvgViews != null ? `${b.Count.toLocaleString()} reels · ${fmtCount(b.AvgViews)} views on average` : undefined">
                <span class="lbl">{{ b.Label }}</span>
                <span class="track"><span class="fill" :style="{ width: `${Math.max(b.Count ? 1.5 : 0, (b.Count / max) * 100)}%`, background: colour }"></span></span>
                <span class="val">{{ b.Count.toLocaleString() }}</span>
                <span class="pct">{{ b.Share.toFixed(b.Share > 0 && b.Share < 1 ? 1 : 0) }}%</span>
            </div>
        </div>
        <p v-if="note && total" class="note">{{ note }}</p>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { type DistributionBucket } from '~/composables/useMemeScraper';
import { fmtCount } from '~/composables/useOmniTumblr';

const props = withDefaults(defineProps<{
    buckets: DistributionBucket[];
    colour?: string;
    emptyTitle?: string;
    note?: string;
    /** Hide empty buckets at either end of the scale. */
    trim?: boolean;
}>(), { colour: 'var(--ot-cat-1)', emptyTitle: 'No reels in this window', trim: true });

const total = computed(() => props.buckets.reduce((a, b) => a + b.Count, 0));
const max = computed(() => Math.max(1, ...props.buckets.map(b => b.Count)));
const visible = computed(() => {
    if (!props.trim) return props.buckets;
    let start = 0;
    let end = props.buckets.length - 1;
    while (start < end && props.buckets[start].Count === 0) start++;
    while (end > start && props.buckets[end].Count === 0) end--;
    return props.buckets.slice(start, end + 1);
});
</script>

<style scoped>
.rows { display: flex; flex-direction: column; gap: 6px; }
.row { display: grid; grid-template-columns: minmax(70px, 96px) minmax(0, 1fr) 54px 40px; gap: var(--ot-space-2); align-items: center; font-size: 12.5px; }
.lbl { color: var(--ot-text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.track { position: relative; height: 12px; border-radius: 3px; background: rgba(255, 255, 255, 0.04); overflow: hidden; }
.fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; }
.val { text-align: right; font-family: var(--ot-mono); }
.pct { text-align: right; font-family: var(--ot-mono); color: var(--ot-muted); font-size: 11.5px; }
.note { margin: var(--ot-space-2) 0 0; font-size: 11.5px; color: var(--ot-muted); }
</style>
