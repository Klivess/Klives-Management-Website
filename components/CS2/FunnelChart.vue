<template>
  <div class="cs2x-chart" data-testid="cs2x-funnel-chart" @mouseleave="hover = null">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="summary" :style="{ height: `${H}px` }" preserveAspectRatio="none">
      <line v-for="g in grid" :key="g" class="cs2x-chart__grid" x1="0" :x2="W" :y1="g" :y2="g" />
      <g v-for="(d, i) in rows" :key="d.day" @mouseenter="hover = i">
        <rect :x="x(i)" y="0" :width="slot" :height="PLOT" fill="transparent" />
        <!-- listings valued (faint, own scale) -->
        <rect :x="x(i) + pad" :y="PLOT - hValued(d)" :width="bar" :height="hValued(d)" rx="1.5" fill="rgba(222,208,186,0.09)" />
        <!-- screen passes (amber) -->
        <rect :x="x(i) + pad + bar * 0.22" :y="PLOT - hScreen(d)" :width="bar * 0.56" :height="hScreen(d)" rx="1.5" fill="var(--x-accent)" opacity="0.85" />
        <!-- exit model confirmed / bought -->
        <circle v-if="(d.confirmed ?? 0) > 0" :cx="x(i) + slot / 2" :cy="PLOT + 9" r="3" fill="var(--x-info)" />
        <circle v-if="d.bought > 0" :cx="x(i) + slot / 2" :cy="PLOT + 9" r="4.2" fill="none" stroke="var(--x-ok)" stroke-width="2" />
        <text v-if="i % labelEvery === 0 || i === rows.length - 1" class="cs2x-chart__axis" :x="x(i) + slot / 2" :y="H - 2" text-anchor="middle">{{ d.label }}</text>
      </g>
      <rect v-if="hover != null" :x="x(hover)" y="0" :width="slot" :height="PLOT" fill="rgba(242,163,65,0.06)" pointer-events="none" />
    </svg>
    <div v-if="hover != null && rows[hover]" class="cs2x-chart__tip" :style="{ left: `${((x(hover) + slot / 2) / W) * 100}%`, top: '4px' }">
      <b>{{ rows[hover].day }}</b>
      <div><span>Listings valued</span><span>{{ fmt(rows[hover].valued) }}</span></div>
      <div><span>Passed the screen</span><span>{{ fmt(rows[hover].screen) }}</span></div>
      <div><span>Exit model checked</span><span>{{ rows[hover].modelChecked == null ? 'not counted' : fmt(rows[hover].modelChecked) }}</span></div>
      <div><span>Model confirmed</span><span>{{ rows[hover].confirmed == null ? '—' : fmt(rows[hover].confirmed) }}</span></div>
      <div><span>Bought</span><span>{{ fmt(rows[hover].bought) }}</span></div>
      <div v-if="rows[hover].bestScreenRoi != null"><span>Best screen value</span><span>{{ pct(rows[hover].bestScreenRoi) }}</span></div>
      <div v-if="rows[hover].bestModelRoi != null"><span>Best model value</span><span>{{ pct(rows[hover].bestModelRoi) }}</span></div>
    </div>
    <div class="cs2x-legend" style="margin-top: 6px">
      <span><i style="--c: rgba(222,208,186,0.25)"></i>listings valued (own scale)</span>
      <span><i style="--c: var(--x-accent)"></i>passed the quick screen</span>
      <span><i style="--c: var(--x-info); border-radius: 50%"></i>exit model confirmed</span>
      <span><i class="is-hollow" style="--c: var(--x-ok); border-radius: 50%; border-style: solid"></i>bought</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Cs2FunnelDay } from '~/scripts/cs2Arbitrage';

const props = defineProps<{ rows: Cs2FunnelDay[] }>();
const W = 600;
const H = 150;
const PLOT = 118;
const hover = ref<number | null>(null);

const slot = computed(() => W / Math.max(1, props.rows.length));
const pad = computed(() => Math.min(3, slot.value * 0.12));
const bar = computed(() => Math.max(2, slot.value - pad.value * 2));
const x = (i: number) => i * slot.value;
const maxValued = computed(() => Math.max(1, ...props.rows.map((r) => r.valued)));
const maxScreen = computed(() => Math.max(1, ...props.rows.map((r) => r.screen)));
const hValued = (d: Cs2FunnelDay) => (d.valued ? Math.max(2, (d.valued / maxValued.value) * (PLOT - 4)) : 0);
const hScreen = (d: Cs2FunnelDay) => (d.screen ? Math.max(2, (d.screen / maxScreen.value) * (PLOT * 0.8)) : 0);
const grid = [PLOT * 0.25, PLOT * 0.5, PLOT * 0.75, PLOT];
const labelEvery = computed(() => Math.ceil(props.rows.length / 10));
const fmt = (n: number | null) => (n == null ? '—' : n.toLocaleString());
const pct = (r: number | null) => (r == null ? '—' : `${r >= 0 ? '+' : ''}${(r * 100).toFixed(1)}%`);
const summary = computed(() => {
  const valued = props.rows.reduce((s, r) => s + r.valued, 0);
  const screen = props.rows.reduce((s, r) => s + r.screen, 0);
  const bought = props.rows.reduce((s, r) => s + r.bought, 0);
  return `${props.rows.length} days: ${valued} listings valued, ${screen} passed the quick screen, ${bought} bought`;
});
</script>
