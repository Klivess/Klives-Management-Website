<template>
  <section class="execution-trends" aria-label="Wake execution performance">
    <div class="heading">
      <div>
        <h3>Wake execution</h3>
        <p>Target: 99% Active execution. A wake is Active when it receives a model response or dispatches a tool.</p>
        <p>Productive wakes record novel successful actions. Terminal outcomes stay visible, including interruptions after progress.</p>
      </div>
      <span class="coverage">{{ execution?.observedWakes ?? 0 }} / {{ execution?.outcomes ?? 0 }} wakes measured</span>
    </div>
    <div class="metrics">
      <article><span>Active execution</span><strong :class="{ good: execution?.meetsActiveTarget }">{{ percent(execution?.activeRate) }}</strong><small>99% target · {{ execution?.activeWakes ?? 0 }} active wakes</small></article>
      <article><span>Productive wakes</span><strong>{{ percent(execution?.productiveRate) }}</strong><small>{{ execution?.productiveWakes ?? 0 }} wakes with verified progress</small></article>
      <article><span>Deferred or cancelled</span><strong class="warning">{{ percent(execution?.interruptionRate) }}</strong><small>{{ execution?.interruptedWakes ?? 0 }} of all recorded outcomes</small></article>
      <article><span>In-wake retries</span><strong>{{ execution?.providerRetries ?? 0 }}</strong><small>{{ Math.round((execution?.providerWaitMs ?? 0) / 1000) }}s provider wait · {{ execution?.loopTrips ?? 0 }} loop trips</small></article>
    </div>
    <div v-if="!execution" class="empty">Execution diagnostics are unavailable from this server. Recorded outcomes are shown below.</div>
    <div v-else-if="!execution.outcomes" class="empty">No recorded wake outcomes in this range.</div>
    <div v-else class="charts">
      <article>
        <div class="heading"><h4>Wake outcomes over time</h4>
          <label>Show <select v-model="outcomeMode" aria-label="Wake outcome chart units"><option value="count">Count</option><option value="share">Share (%)</option></select></label>
        </div>
        <p>Terminal outcomes by finish time · UTC</p>
        <div class="chart"><canvas ref="outcomesCanvas" role="img" aria-label="Wake outcomes over time"></canvas></div>
      </article>
      <article>
        <h4>Active execution and progress</h4>
        <p>Measured wakes in each interval · UTC · gaps mean no measurements</p>
        <div class="chart"><canvas ref="ratesCanvas" role="img" aria-label="Active execution and productive wake rates over time"></canvas></div>
      </article>
    </div>
    <div v-if="reasons.length" class="reasons" aria-label="Deferral and cancellation reasons">
      <h4>Interruption reasons</h4>
      <span v-for="[reason, count] in reasons" :key="reason">{{ humanize(reason) }} <b>{{ count }}</b></span>
    </div>
    <p v-if="execution && execution.coveragePct < 100" class="coverage-note">Execution coverage: {{ execution.coveragePct }}%. Older wakes without execution diagnostics are excluded from Active and productive rates.</p>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Chart from 'chart.js/auto';

interface ExecutionMetrics {
  outcomes: number; observedWakes: number; activeWakes: number; productiveWakes: number;
  interruptedWakes: number; providerRetries: number; providerWaitMs: number; loopTrips: number;
  activeRate: number | null; productiveRate: number | null; interruptionRate: number | null;
  meetsActiveTarget?: boolean;
  coveragePct: number; interruptionReasons: Record<string, number>;
}
interface Point {
  date: string; successfulWakes: number; failedWakes: number; deferredWakes?: number; cancelledWakes?: number;
  execution?: ExecutionMetrics;
}
const props = defineProps<{ execution?: ExecutionMetrics | null; series: Point[] }>();
const outcomesCanvas = ref<HTMLCanvasElement | null>(null);
const ratesCanvas = ref<HTMLCanvasElement | null>(null);
const outcomeMode = ref('count');
const reasons = computed(() => Object.entries(props.execution?.interruptionReasons ?? {}).sort((a, b) => b[1] - a[1]));
let charts: Chart[] = [];
let mounted = false;
const percent = (value: number | null | undefined) => value == null ? '—' : `${value.toFixed(1)}%`;
const humanize = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
const colors = { completed: '#69bd83', failed: '#e7646d', deferred: '#f2ad3f', cancelled: '#ae83ef' };
function destroy() { charts.forEach(chart => chart.destroy()); charts = []; }
function render() {
  if (!mounted) return;
  destroy();
  const labels = props.series.map(point => new Date(point.date).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }));
  const options: any = {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: '#bfc6d1', usePointStyle: true, boxWidth: 9 } } },
    scales: { x: { ticks: { color: '#8e98a7', maxTicksLimit: 7, maxRotation: 0 }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { color: '#8e98a7' }, grid: { color: '#ffffff0a' } } },
  };
  if (outcomesCanvas.value) {
    const fields = ['successfulWakes', 'failedWakes', 'deferredWakes', 'cancelledWakes'] as const;
    const names = ['Completed', 'Failed', 'Deferred', 'Cancelled'];
    const outcomeOptions = structuredClone(options);
    outcomeOptions.scales.x.stacked = true;
    outcomeOptions.scales.y.stacked = true;
    if (outcomeMode.value === 'share') outcomeOptions.scales.y.max = 100;
    else outcomeOptions.scales.y.ticks.precision = 0;
    charts.push(new Chart(outcomesCanvas.value, { type: 'bar', options: outcomeOptions,
      data: { labels, datasets: fields.map((field, index) => ({
        label: names[index], backgroundColor: Object.values(colors)[index],
        data: props.series.map(point => {
          const total = fields.reduce((sum, key) => sum + (point[key] ?? 0), 0);
          return outcomeMode.value === 'share' ? (total ? 100 * (point[field] ?? 0) / total : null) : point[field] ?? 0;
        }),
      })) },
    }));
  }
  if (ratesCanvas.value) {
    const rateOptions = structuredClone(options);
    rateOptions.scales.y.max = 100;
    charts.push(new Chart(ratesCanvas.value, { type: 'line', options: rateOptions,
      data: { labels, datasets: [
        { label: 'Active execution %', data: props.series.map(p => p.execution?.activeRate ?? null), borderColor: colors.completed, pointRadius: 2, spanGaps: false },
        { label: 'Productive wakes %', data: props.series.map(p => p.execution?.productiveRate ?? null), borderColor: '#74b9ef', pointRadius: 2, spanGaps: false },
        { label: '99% target', data: props.series.map(() => 99), borderColor: '#b0b9c8', borderDash: [5, 5], pointRadius: 0, borderWidth: 1 },
      ] },
    }));
  }
}
onMounted(() => { mounted = true; render(); });
watch([() => props.series, () => props.execution, outcomeMode], async () => { await nextTick(); render(); });
onBeforeUnmount(() => { mounted = false; destroy(); });
</script>

<style scoped>
.execution-trends { padding: 22px; margin: 22px 0; background: #15191f; border: 1px solid #303843; border-radius: 14px; }
.heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
h3, h4 { color: #edf1f6; margin: 0 0 8px; }
p, small, .coverage, label, .empty { color: #a2acba; font-size: 12px; line-height: 1.6; }
p { margin: 4px 0; }
.metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 20px 0; }
.metrics article { display: flex; flex-direction: column; gap: 8px; padding: 16px; background: #1b2028; border-radius: 10px; }
.metrics span { color: #bac3d0; font-size: 12px; }
strong { font-size: 27px; color: #edf1f6; }
.good { color: #69bd83; } .warning { color: #f2ad3f; }
.charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
.charts > article, .metrics > article { min-width: 0; }
.chart { position: relative; height: 270px; margin-top: 15px; min-width: 0; max-width: 100%; }
.chart canvas { max-width: 100%; }
select { color: #dae2ee; background: #202731; border: 1px solid #3a4656; border-radius: 6px; padding: 5px 8px; }
.reasons { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 22px; font-size: 12px; }
.reasons h4 { margin: 0 10px 0 0; }
.reasons span { background: #242b35; color: #c7d0dc; padding: 7px 10px; border-radius: 7px; }
.reasons b { color: #f2ad3f; margin-left: 7px; }
.coverage-note { margin-top: 16px; }
@media(max-width: 1100px) { .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .charts { grid-template-columns: 1fr; } }
@media(max-width: 540px) { .execution-trends { padding: 14px; } .metrics { grid-template-columns: 1fr; } }
</style>
