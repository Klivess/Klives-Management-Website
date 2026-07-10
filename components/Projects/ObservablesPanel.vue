<template>
  <div class="obs-panel">
    <p class="obs-intro">
      Live values the agents maintain for you — this project's dashboard. They create and update them
      with <code>update_observable</code>; delete anything stale.
    </p>

    <div v-if="!observables.length" class="obs-empty">
      No observables yet — agents create them with <code>update_observable</code> as the project runs.
    </div>

    <div v-else class="obs-grid">
      <button
        v-for="o in observables"
        :key="o.observableID"
        class="obs-tile"
        :class="{ selected: selectedId === o.observableID }"
        @click="select(o.observableID)"
      >
        <div class="obs-tile-label" :title="o.description || o.name">{{ o.name }}</div>

        <template v-if="o.type === 'Numeric'">
          <div class="obs-tile-value">{{ o.displayValue }}</div>
          <div class="obs-tile-foot">
            <span v-if="deltaOf(o) !== null" class="obs-delta" :class="deltaOf(o)! >= 0 ? 'up' : 'down'">
              {{ deltaOf(o)! >= 0 ? '▲' : '▼' }} {{ formatDelta(o) }}
            </span>
            <ProjectsObservableSparkline
              v-if="o.history && o.history.length > 1"
              :samples="o.history" :width="90" :height="24" />
          </div>
        </template>

        <template v-else>
          <div class="obs-tile-text">{{ o.textValue || '—' }}</div>
          <div class="obs-tile-foot"><span class="obs-updated">updated {{ ago(o.updatedAt) }}</span></div>
        </template>
      </button>
    </div>

    <!-- Expanded drawer for the selected observable: full history chart + samples + delete. -->
    <div v-if="selected" class="obs-drawer">
      <div class="obs-drawer-head">
        <div>
          <h3 class="obs-drawer-title">{{ selected.name }}</h3>
          <p v-if="selected.description" class="obs-drawer-desc">{{ selected.description }}</p>
          <p class="obs-drawer-meta">
            {{ selected.type }}<template v-if="selected.unit"> · {{ selected.unit }}</template>
            · updated {{ ago(selected.updatedAt) }} by {{ selected.updatedBy || '—' }}
          </p>
        </div>
        <div class="obs-drawer-actions">
          <span class="obs-drawer-now">{{ selected.displayValue }}</span>
          <button class="obs-del" :disabled="deleting" @click="del(selected)">{{ deleting ? '…' : 'Delete' }}</button>
          <button class="obs-close" @click="selectedId = null">✕</button>
        </div>
      </div>
      <div v-if="deleteError" class="obs-del-error">{{ deleteError }}</div>

      <div v-if="selected.type === 'Numeric' && selected.history && selected.history.length > 1" class="obs-chart-wrap">
        <canvas ref="chartCanvas"></canvas>
      </div>
      <p v-else-if="selected.type === 'Numeric'" class="obs-thin">Not enough history to chart yet.</p>

      <div class="obs-samples">
        <div v-for="(s, i) in recentSamples" :key="i" class="obs-sample-row">
          <span class="obs-sample-time">{{ fmtTime(s.timestamp) }}</span>
          <span class="obs-sample-val">{{ selected.type === 'Numeric' ? s.numericValue : s.textValue }}</span>
          <span class="obs-sample-by">{{ s.updatedBy }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import Chart from 'chart.js/auto';
import { RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import ProjectsObservableSparkline from '~/components/Projects/ObservableSparkline.vue';

const props = defineProps<{ projectId: string; observables: any[] }>();
const emit = defineEmits<{ (e: 'changed'): void }>();

const selectedId = ref<string | null>(null);
const selected = computed(() => props.observables.find(o => o.observableID === selectedId.value) ?? null);
const recentSamples = computed(() => {
  const h = selected.value?.history ?? [];
  return [...h].reverse().slice(0, 40); // newest first
});

function select(id: string) { selectedId.value = selectedId.value === id ? null : id; }

// Delta = current value vs the previous history sample (the last change's magnitude).
function deltaOf(o: any): number | null {
  const h = o.history;
  if (o.type !== 'Numeric' || !h || h.length < 2) return null;
  const cur = h[h.length - 1]?.numericValue;
  const prev = h[h.length - 2]?.numericValue;
  if (typeof cur !== 'number' || typeof prev !== 'number') return null;
  return cur - prev;
}
function formatDelta(o: any): string {
  const d = deltaOf(o);
  if (d === null) return '';
  const abs = Math.abs(d);
  const s = abs >= 1000 ? abs.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : abs.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (o.format === 'Currency') return '$' + s;
  if (o.format === 'Percent') return s + '%';
  return s;
}

function ago(iso: string): string {
  if (!iso) return '—';
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
function fmtTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── delete ──
const deleting = ref(false);
const deleteError = ref('');
async function del(o: any) {
  if (deleting.value) return;
  deleting.value = true;
  deleteError.value = '';
  try {
    const res = await RequestPOSTFromKliveAPI('/projects/observables/delete',
      JSON.stringify({ projectID: props.projectId, name: o.name }), false, true);
    if (!res.ok) { deleteError.value = `Delete failed (HTTP ${res.status}).`; return; }
    selectedId.value = null;
    emit('changed');
  } catch (e: any) {
    deleteError.value = e?.message ? `Delete failed: ${e.message}` : 'Delete failed.';
  } finally {
    deleting.value = false;
  }
}

// ── expanded chart (chart.js, single series) ──
const chartCanvas = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

function destroyChart() { if (chart) { chart.destroy(); chart = null; } }

function renderChart() {
  destroyChart();
  const o = selected.value;
  if (!o || o.type !== 'Numeric' || !chartCanvas.value) return;
  const hist = (o.history ?? []).filter((s: any) => typeof s.numericValue === 'number');
  if (hist.length < 2) return;
  chart = new Chart(chartCanvas.value, {
    type: 'line',
    data: {
      labels: hist.map((s: any) => fmtTime(s.timestamp)),
      datasets: [{
        label: o.name,
        data: hist.map((s: any) => s.numericValue),
        borderColor: '#4d9e39',
        backgroundColor: 'rgba(77, 158, 57, 0.10)',
        borderWidth: 2,
        fill: true,
        tension: 0.15,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#4d9e39',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false }, // single series — the drawer title names it
        tooltip: {
          backgroundColor: '#0f0f13',
          borderColor: '#2a2a2e',
          borderWidth: 1,
          titleColor: '#bbb',
          bodyColor: '#e6e6e6',
        },
      },
      scales: {
        x: { ticks: { color: '#666', maxTicksLimit: 6, font: { size: 10 } }, grid: { color: '#26262b' } },
        y: { ticks: { color: '#666', font: { size: 10 } }, grid: { color: '#26262b' } },
      },
    },
  });
}

// Re-render on selection change or when the selected observable's data updates (live push).
watch([selectedId, () => selected.value?.updatedAt], () => nextTick(renderChart));
onBeforeUnmount(destroyChart);
</script>

<style scoped>
.obs-panel { color: #e6e6e6; }
.obs-intro { font-size: 12px; color: #888; margin: 0 0 14px; line-height: 1.5; }
.obs-intro code, .obs-empty code { background: #26262b; color: #cdd; padding: 1px 5px; border-radius: 4px; font-size: 11px; }
.obs-empty { padding: 28px; text-align: center; color: #888; background: #161519; border-radius: 8px; font-size: 13px; }

.obs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.obs-tile { text-align: left; background: #1a1a1e; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 10px; padding: 14px; cursor: pointer; transition: border-color 0.12s, background 0.12s; min-width: 0; }
.obs-tile:hover { background: #1f1f24; border-color: rgba(255, 255, 255, 0.12); }
.obs-tile.selected { border-color: #4d9e39; }
.obs-tile-label { font-size: 11px; color: #8a8a8a; text-transform: uppercase; letter-spacing: 0.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.obs-tile-value { font-size: 26px; font-weight: 600; color: #e6e6e6; margin-top: 6px; overflow: hidden; text-overflow: ellipsis; }
.obs-tile-text { font-size: 15px; color: #dcdce0; margin-top: 6px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.obs-tile-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; min-height: 24px; }
.obs-delta { font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
.obs-delta.up { color: #4d9e39; }
.obs-delta.down { color: #d95b5b; }
.obs-updated { font-size: 11px; color: #666; }

.obs-drawer { margin-top: 16px; background: #161519; border: 1px solid #2a2a2e; border-radius: 10px; padding: 16px; }
.obs-drawer-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.obs-drawer-title { margin: 0; font-size: 16px; }
.obs-drawer-desc { margin: 4px 0 0; font-size: 12px; color: #aaa; }
.obs-drawer-meta { margin: 4px 0 0; font-size: 11px; color: #666; }
.obs-drawer-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.obs-drawer-now { font-size: 20px; font-weight: 600; color: #e6e6e6; font-variant-numeric: tabular-nums; }
.obs-del { background: #3a1717; color: #e08a8a; border: 1px solid #5a2424; border-radius: 6px; padding: 5px 12px; cursor: pointer; font-size: 12px; }
.obs-del:disabled { opacity: 0.5; }
.obs-close { background: #26262b; color: #ccc; border: none; border-radius: 6px; padding: 5px 10px; cursor: pointer; }
.obs-del-error { color: #e08a8a; font-size: 12px; margin-top: 8px; }
.obs-chart-wrap { height: 220px; margin-top: 14px; }
.obs-thin { font-size: 12px; color: #777; margin-top: 12px; }

.obs-samples { margin-top: 14px; max-height: 200px; overflow-y: auto; border-top: 1px solid #2a2a2e; }
.obs-sample-row { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; padding: 5px 2px; font-size: 12px; border-bottom: 1px solid #201f24; }
.obs-sample-time { color: #888; }
.obs-sample-val { color: #e6e6e6; font-variant-numeric: tabular-nums; text-align: right; }
.obs-sample-by { color: #666; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.obs-samples::-webkit-scrollbar { width: 6px; }
.obs-samples::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 3px; }
</style>
