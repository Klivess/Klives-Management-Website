<template>
  <div class="pjx-ob">
    <div v-if="!observables.length" class="pjx-empty">
      <ProjectsIcon name="gauge" />
      <b>No live values yet</b>
      <span>Agents publish them as the project runs (<code class="pjx-mono">update_observable</code>): balances, followers, items shipped.</span>
    </div>

    <template v-else>
      <div class="pjx-ob__grid">
        <button v-for="o in observables" :key="o.observableID" type="button" class="pjx-ob__tile" :aria-pressed="selectedId === o.observableID"
          :data-stale="isStale(o) || undefined" @click="select(o.observableID)">
          <span class="pjx-ob__name" :title="o.description || o.name">{{ o.name }}</span>
          <template v-if="o.type === 'Numeric'">
            <span class="pjx-ob__value pjx-num">{{ o.displayValue }}</span>
            <span class="pjx-ob__trend">
              <span v-if="deltaOf(o) !== null" class="pjx-ob__delta pjx-num" :data-tone="deltaOf(o)! >= 0 ? 'work' : 'fault'">
                <ProjectsIcon :name="deltaOf(o)! >= 0 ? 'arrow-up' : 'arrow-down'" />{{ formatDelta(o) }}
              </span>
              <ProjectsSpark v-if="observableSeries(o).length > 1" :values="observableSeries(o)" :label="`${o.name} history`" />
            </span>
          </template>
          <span v-else class="pjx-ob__text">{{ o.textValue || '—' }}</span>
          <span class="pjx-ob__meta">
            <span v-if="o.validity === 'Invalid'" class="pjx-chip" data-tone="fault">invalid</span>
            <span v-else-if="isStale(o)" class="pjx-chip" data-tone="need" :title="`Expected an update at least every ${staleWords(o)}`">stale</span>
            <span class="pjx-faint">{{ ageShort(o.updatedAt, now) }} ago</span>
          </span>
        </button>
      </div>

      <section v-if="selected" class="pjx-ob__detail" :aria-label="`${selected.name} in detail`">
        <header class="pjx-ob__detail-head">
          <div class="pjx-ob__detail-titles">
            <h3>{{ selected.name }}</h3>
            <p v-if="selected.description" class="pjx-dim">{{ selected.description }}</p>
            <p class="pjx-faint">
              {{ selected.type }}<template v-if="selected.unit"> · {{ selected.unit }}</template>
              · updated {{ ageWords(selected.updatedAt, now) }} ago by {{ selected.updatedBy || '—' }}
              <template v-if="selected.sourceKind && selected.sourceKind !== 'Agent'"> · {{ String(selected.sourceKind).toLowerCase() }} source</template>
            </p>
          </div>
          <div class="pjx-ob__detail-tools">
            <b class="pjx-ob__now pjx-num">{{ selected.displayValue }}</b>
            <template v-if="!confirmDelete">
              <button class="pjx-btn pjx-btn--ghost pjx-btn--sm" @click="confirmDelete = true"><ProjectsIcon name="trash" />Delete</button>
            </template>
            <template v-else>
              <span class="pjx-dim" style="font-size: 12px">Delete it and its history?</span>
              <button class="pjx-btn pjx-btn--danger pjx-btn--sm" :disabled="deleting" @click="del(selected)">{{ deleting ? 'Deleting…' : 'Delete' }}</button>
              <button class="pjx-btn pjx-btn--ghost pjx-btn--sm" @click="confirmDelete = false">Keep</button>
            </template>
            <button class="pjx-iconbtn pjx-iconbtn--sm" title="Close" aria-label="Close the detail" @click="selectedId = null"><ProjectsIcon name="x" /></button>
          </div>
        </header>
        <div v-if="deleteError" class="pjx-banner" data-tone="fault" role="alert"><ProjectsIcon name="alert" /><div class="pjx-banner__body">{{ deleteError }}</div></div>

        <div v-if="observableSeries(selected).length > 1" class="pjx-ob__chart"><canvas ref="chartCanvas"></canvas></div>
        <p v-else-if="selected.type === 'Numeric'" class="pjx-dim" style="font-size: 12px">Not enough history to chart yet.</p>

        <div v-if="recentSamples.length" class="pjx-ob__samples">
          <table>
            <thead><tr><th>When</th><th>Value</th><th>By</th></tr></thead>
            <tbody>
              <tr v-for="(s, i) in recentSamples" :key="i">
                <td class="pjx-dim">{{ fmtTime(s.timestamp) }}</td>
                <td class="pjx-num">{{ selected.type === 'Numeric' ? s.numericValue : s.textValue }}</td>
                <td class="pjx-dim">{{ s.updatedBy }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p class="pjx-faint pjx-gp__foot">Agents create and update these with <code class="pjx-mono">update_observable</code>; delete anything that no longer means anything.</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Chart from 'chart.js/auto';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import ProjectsSpark from '~/components/Projects/Spark.vue';
import { pjxPost } from '~/composables/useProjectsConsole';
import { ageShort, ageWords, observableSeries } from '~/scripts/projectsConsole';

const props = defineProps<{ projectId: string; observables: any[] }>();
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
  const r = await pjxPost('/projects/observables/delete', { projectID: props.projectId, name: o.name });
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
