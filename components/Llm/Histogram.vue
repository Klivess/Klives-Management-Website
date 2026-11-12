<template>
  <figure class="llx-hist" :aria-label="aria">
    <figcaption class="llx-hist__head">
      <span>{{ label }}</span>
      <span v-if="stats.count" class="llx-dim llx-num">{{ llmInt(stats.count) }} · p50 <b>{{ fmt(stats.p50) }}</b> · p95 <b>{{ fmt(stats.p95) }}</b> · p99 <b>{{ fmt(stats.p99) }}</b></span>
    </figcaption>
    <div v-if="bars.length" class="llx-hist__plot">
      <svg :viewBox="`0 0 ${bars.length * 10} 60`" preserveAspectRatio="none" role="img" :aria-label="aria">
        <rect v-for="(b, i) in bars" :key="i" :x="i * 10 + 1" :y="60 - b.h" width="8" :height="b.h" rx="1" :data-hot="hover === i || undefined"
              @mouseenter="hover = i" @mouseleave="hover = null" />
        <line v-for="m in markers" :key="m.label" :x1="m.x" :x2="m.x" y1="0" y2="60" class="llx-hist__marker" :data-p="m.label" />
      </svg>
      <div class="llx-hist__axis llx-num"><span>{{ fmt(bars[0].lo) }}</span><span>{{ fmt(bars[Math.floor(bars.length / 2)].lo) }}</span><span>{{ fmt(bars[bars.length - 1].hi) }}</span></div>
      <div v-if="hover != null" class="llx-hist__tip llx-num">{{ fmt(bars[hover].lo) }}–{{ fmt(bars[hover].hi) }}: <b>{{ llmInt(bars[hover].count) }}</b> ({{ llmPct(bars[hover].count / Math.max(1, stats.count) * 100) }})</div>
    </div>
    <div v-else class="llx-empty llx-empty--sm">No calls in this window.</div>
  </figure>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { llmCompact, llmInt, llmMs, llmPct } from '~/scripts/kliveLlm';

/** A log-bucketed distribution (as the ledger keeps it), with its percentiles marked. */
const props = withDefaults(defineProps<{ data: any | null; label: string; unit?: 'ms' | 'tokens' }>(), { unit: 'ms' });
const hover = ref<number | null>(null);
const fmt = (v: unknown) => (props.unit === 'ms' ? llmMs(v) : llmCompact(v));
const stats = computed(() => ({ count: Number(props.data?.count ?? 0), p50: props.data?.p50, p95: props.data?.p95, p99: props.data?.p99 }));
const bars = computed(() => {
  const list: { lo: number; hi: number; count: number }[] = props.data?.buckets ?? [];
  const max = Math.max(1, ...list.map(b => b.count));
  return list.map(b => ({ ...b, h: b.count > 0 ? Math.max(1.5, (b.count / max) * 58) : 0 }));
});
const markers = computed(() => {
  const out: { label: string; x: number }[] = [];
  for (const [label, value] of [['p50', stats.value.p50], ['p95', stats.value.p95], ['p99', stats.value.p99]] as const) {
    if (typeof value !== 'number') continue;
    const i = bars.value.findIndex(b => value >= b.lo && value <= b.hi);
    if (i >= 0) out.push({ label, x: i * 10 + 5 });
  }
  return out;
});
const aria = computed(() => stats.value.count
  ? `${props.label}: ${stats.value.count} calls; p50 ${fmt(stats.value.p50)}, p95 ${fmt(stats.value.p95)}, p99 ${fmt(stats.value.p99)}`
  : `${props.label}: no data`);
</script>
