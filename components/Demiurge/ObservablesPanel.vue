<template>
  <div class="dmx-ob">
    <div v-if="!observables.length" class="dmx-empty">
      <DemiurgeIcon name="gauge" />
      <b>No live values yet</b>
      <span>Agents publish them as the Steward runs (<code class="dmx-mono">update_observable</code>): balances, followers, items shipped.</span>
    </div>

    <template v-else>
      <div class="dmx-ob__grid">
        <button v-for="o in observables" :key="o.observableID" type="button" class="dmx-ob__tile" :aria-pressed="selectedId === o.observableID"
          :data-stale="isStale(o) || undefined" @click="select(o.observableID)">
          <span class="dmx-ob__name" :title="o.description || o.name">{{ o.name }}</span>
          <template v-if="o.type === 'Numeric'">
            <span class="dmx-ob__value dmx-num">{{ o.displayValue }}</span>
            <span class="dmx-ob__trend">
              <span v-if="deltaOf(o) !== null" class="dmx-ob__delta dmx-num" :data-tone="deltaOf(o)! >= 0 ? 'work' : 'fault'">
                <DemiurgeIcon :name="deltaOf(o)! >= 0 ? 'arrow-up' : 'arrow-down'" />{{ formatDelta(o) }}
              </span>
              <DemiurgeSpark v-if="observableSeries(o).length > 1" :values="observableSeries(o)" :label="`${o.name} history`" />
            </span>
          </template>
          <span v-else class="dmx-ob__text">{{ o.textValue || '—' }}</span>
          <span class="dmx-ob__meta">
            <span v-if="o.validity === 'Invalid'" class="dmx-chip" data-tone="fault">invalid</span>
            <span v-else-if="isStale(o)" class="dmx-chip" data-tone="need" :title="`Expected an update at least every ${staleWords(o)}`">stale</span>
            <span class="dmx-faint">{{ ageShort(o.updatedAt, now) }} ago</span>
          </span>
        </button>
      </div>

      <section v-if="selected" class="dmx-ob__detail" :aria-label="`${selected.name} in detail`">
        <header class="dmx-ob__detail-head">
          <div class="dmx-ob__detail-titles">
            <h3>{{ selected.name }}</h3>
            <p v-if="selected.description" class="dmx-dim">{{ selected.description }}</p>
            <p class="dmx-faint">
              {{ selected.type }}<template v-if="selected.unit"> · {{ selected.unit }}</template>
              · updated {{ ageWords(selected.updatedAt, now) }} ago by {{ selected.updatedBy || '—' }}
              <template v-if="selected.sourceKind && selected.sourceKind !== 'Agent'"> · {{ String(selected.sourceKind).toLowerCase() }} source</template>
            </p>
          </div>
          <div class="dmx-ob__detail-tools">
            <b class="dmx-ob__now dmx-num">{{ selected.displayValue }}</b>
            <template v-if="!confirmDelete">
              <button class="dmx-btn dmx-btn--ghost dmx-btn--sm" @click="confirmDelete = true"><DemiurgeIcon name="trash" />Delete</button>
            </template>
            <template v-else>
              <span class="dmx-dim" style="font-size: 12px">Delete it and its history?</span>
              <button class="dmx-btn dmx-btn--danger dmx-btn--sm" :disabled="deleting" @click="del(selected)">{{ deleting ? 'Deleting…' : 'Delete' }}</button>
              <button class="dmx-btn dmx-btn--ghost dmx-btn--sm" @click="confirmDelete = false">Keep</button>
            </template>
            <button class="dmx-iconbtn dmx-iconbtn--sm" title="Close" aria-label="Close the detail" @click="selectedId = null"><DemiurgeIcon name="x" /></button>
          </div>
        </header>
        <div v-if="deleteError" class="dmx-banner" data-tone="fault" role="alert"><DemiurgeIcon name="alert" /><div class="dmx-banner__body">{{ deleteError }}</div></div>

        <div v-if="observableSeries(selected).length > 1" class="dmx-ob__chart"><canvas ref="chartCanvas"></canvas></div>
        <p v-else-if="selected.type === 'Numeric'" class="dmx-dim" style="font-size: 12px">Not enough history to chart yet.</p>

        <div v-if="recentSamples.length" class="dmx-ob__samples">
          <table>
            <thead><tr><th>When</th><th>Value</th><th>By</th></tr></thead>
            <tbody>
              <tr v-for="(s, i) in recentSamples" :key="i">
                <td class="dmx-dim">{{ fmtTime(s.timestamp) }}</td>
                <td class="dmx-num">{{ selected.type === 'Numeric' ? s.numericValue : s.textValue }}</td>
                <td class="dmx-dim">{{ s.updatedBy }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p class="dmx-faint dmx-gp__foot">Agents create and update these with <code class="dmx-mono">update_observable</code>; delete anything that no longer means anything.</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Chart from 'chart.js/auto';
import DemiurgeIcon from '~/components/Demiurge/Icon.vue';
import DemiurgeSpark from '~/components/Demiurge/Spark.vue';
import { dmxPost } from '~/composables/useDemiurgeConsole';
import { ageShort, ageWords, observableSeries } from '~/scripts/demiurgeConsole';

const props = defineProps<{ stewardId: string; observables: any[] }>();
const emit = defineEmits<{ (e: 'changed'): void }>();

const selectedId = ref<string | null>(null);
const selected = computed(() => props.observables.find(o => o.observableID === selectedId.value) ?? null);
const recentSamples = computed(() => [...(selected.value?.history ?? [])].reverse().slice(0, 40)); // newest first
const confirmDelete = ref(false);
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;

function select(id: string) {
  selectedId.value = selectedId.value === id ? null : id;
  confirmDelete.value = false;
  deleteError.value = '';
}

// Delta = the current value against the previous sample: the size of the last change.
function deltaOf(o: any): number | null {
  const series = observableSeries(o);
  return series.length < 2 ? null : series[series.length - 1] - series[series.length - 2];
}
function formatDelta(o: any): string {
  const d = deltaOf(o);
  if (d === null) return '';
  const abs = Math.abs(d);
  const s = abs.toLocaleString(undefined, { maximumFractionDigits: abs >= 1000 ? 0 : 2 });
  return o.format === 'Currency' ? `$${s}` : o.format === 'Percent' ? `${s}%` : s;
}

// StaleAfter arrives as a .NET TimeSpan ("d.hh:mm:ss"); a value older than that is no longer being kept.
function staleMs(o: any): number | null {
  const m = /^(?:(\d+)\.)?(\d+):(\d+):(\d+)/.exec(String(o?.staleAfter ?? ''));
  if (!m) return null;
  return (((Number(m[1] || 0) * 24 + Number(m[2])) * 60 + Number(m[3])) * 60 + Number(m[4])) * 1000;
}
function isStale(o: any): boolean {
  const ms = staleMs(o);
  const at = Date.parse(o?.observedAt || o?.updatedAt || '');
  return ms != null && ms > 0 && !Number.isNaN(at) && now.value - at > ms;
}
function staleWords(o: any): string {
  const ms = staleMs(o) ?? 0;
  return ageWords(new Date(now.value - ms).toISOString(), now.value);
}

function fmtTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── delete ──
const deleting = ref(false);
const deleteError = ref('');
async function del(o: any) {
  if (deleting.value) return;
  deleting.value = true;
  deleteError.value = '';
  const r = await dmxPost('/demiurge/observables/delete', { stewardID: props.stewardId, name: o.name });
  deleting.value = false;
  if (!r.ok) { deleteError.value = r.error; return; }
  selectedId.value = null;
  confirmDelete.value = false;
  emit('changed');
}

// ── chart (chart.js, one series) ──
const chartCanvas = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;
function destroyChart() { if (chart) { chart.destroy(); chart = null; } }
function renderChart() {
  destroyChart();
  const o = selected.value;
  if (!o || !chartCanvas.value) return;
  const hist = (o.history ?? []).filter((s: any) => typeof s.numericValue === 'number');
  if (hist.length < 2) return;
  chart = new Chart(chartCanvas.value, {
    type: 'line',
    data: {
      labels: hist.map((s: any) => fmtTime(s.timestamp)),
      datasets: [{
        label: o.name,
        data: hist.map((s: any) => s.numericValue),
        borderColor: '#8f80ff',
        backgroundColor: 'rgba(143, 128, 255, 0.10)',
        borderWidth: 2,
        fill: true,
        tension: 0.15,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#8f80ff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false }, // one series: the detail's title names it
        tooltip: { backgroundColor: '#14161d', borderColor: 'rgba(168, 176, 214, 0.30)', borderWidth: 1, titleColor: '#a9aec4', bodyColor: '#e8eaf3' },
      },
      scales: {
        x: { ticks: { color: '#7d8299', maxTicksLimit: 6, font: { size: 10 } }, grid: { color: 'rgba(168, 176, 214, 0.08)' } },
        y: { ticks: { color: '#7d8299', font: { size: 10 } }, grid: { color: 'rgba(168, 176, 214, 0.08)' } },
      },
    },
  });
}

// Re-render on a new selection, and when the selected value's data updates (live push).
watch([selectedId, () => selected.value?.updatedAt], () => nextTick(renderChart));
onMounted(() => { clock = setInterval(() => { now.value = Date.now(); }, 30000); });
onBeforeUnmount(() => { destroyChart(); if (clock) clearInterval(clock); });
</script>
