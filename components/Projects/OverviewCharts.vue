<template>
  <section class="overview-charts" aria-label="Fleet results and spending">
    <div class="trend">
      <div class="chart-heading"><h2>Spend & delivery</h2><span>All unshelved projects · {{ range.toUpperCase() }}</span></div>
      <div class="trend-plots" role="group" aria-label="Model and external spend, and completed steps over time">
        <div class="plot spend-plot"><canvas ref="spendCanvas" role="img" aria-label="Model and external spend over time, in USD" @pointerdown="beginDrag($event, 0)" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="cancelDrag"></canvas></div>
        <div class="plot steps-plot"><canvas ref="stepsCanvas" role="img" aria-label="Completed steps over time" @pointerdown="beginDrag($event, 1)" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="cancelDrag"></canvas></div>
        <span v-if="!series.length" class="no-data">No recorded history in this range</span>
      </div>
      <div class="chart-controls">
        <div class="legend" aria-label="Visible chart series"><button :aria-pressed="showModel" @click="toggleSeries('model')"><i class="model-key"></i>Model USD</button><button :aria-pressed="showExternal" @click="toggleSeries('external')"><i class="external-key"></i>External USD</button><button :aria-pressed="showSteps" @click="toggleSeries('steps')"><i class="steps-key"></i>Steps</button></div>
        <div class="zoom-controls"><span class="drag-hint">Drag to zoom</span><button aria-label="Zoom in on timeline" :disabled="series.length < 3" @click="zoomIn">+</button><button :disabled="!zoom" aria-label="Reset timeline zoom" @click="resetZoom">Reset</button></div>
      </div>
      <div class="range-caption" :data-zoomed="!!zoom">{{ windowLabel }} · local time</div>
    </div>
    <div class="comparison" role="group" aria-label="Project comparison: spend versus completed steps">
      <div class="chart-heading"><h2>Cost → delivery</h2><span>Click a point to inspect</span></div>
      <div class="scatter-plot"><canvas ref="scatterCanvas" role="img" tabindex="0" aria-label="Project cost and delivery chart. Left and right arrows select a point; Enter opens its result." @keydown.left.prevent="focusPoint(-1)" @keydown.right.prevent="focusPoint(1)" @keydown.enter.prevent="openFocused" @keydown.space.prevent="openFocused" @focus="showFocused"></canvas><span v-if="!projects.length" class="no-data">No unshelved projects</span></div>
      <div class="chart-controls"><span class="comparison-note">Steps vary in size</span><div class="point-controls"><button :disabled="!groups.length" aria-label="Previous project point" @click="focusPoint(-1)">‹</button><button :disabled="!groups.length" aria-label="Inspect selected project point" @click="openFocused">Inspect {{ focused + 1 }} / {{ groups.length }}</button><button :disabled="!groups.length" aria-label="Next project point" @click="focusPoint(1)">›</button></div></div>
      <div class="range-caption">Model + external spend · USD</div>
    </div>
    <p class="sr-only" role="status" aria-live="polite">{{ accessibleStatus }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import Chart from 'chart.js/auto';
import type { OverviewPoint, OverviewProject } from '~/composables/useProjectsOverview';
import { pjToken } from '~/composables/useProjectsUi';
const props = defineProps<{ series: OverviewPoint[]; projects: OverviewProject[]; range: string }>();
const emit = defineEmits<{ select: [ids: string[]] }>();
const spendCanvas = ref<HTMLCanvasElement | null>(null), stepsCanvas = ref<HTMLCanvasElement | null>(null), scatterCanvas = ref<HTMLCanvasElement | null>(null);
const showModel = ref(true), showExternal = ref(true), showSteps = ref(true);
const zoom = ref<{ from: number; to: number } | null>(null);
const drag = ref<{ index: number; start: number; end: number } | null>(null);
const focused = ref(0), accessibleStatus = ref('');
let charts: Chart[] = [], mounted = false;
const money = (n: number) => '$' + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const time = (date?: string) => date ? new Date(date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const groups = computed(() => {
  const map = new Map<string, { cost: number; steps: number; ids: string[]; names: string[] }>();
  for (const p of props.projects) {
    const cost = p.rangeSpendUsd + p.rangeMoneySpendUsd;
    const key = `${cost}/${p.completedSteps}`;
    const group = map.get(key) ?? { cost, steps: p.completedSteps, ids: [], names: [] };
    group.ids.push(p.projectID); group.names.push(p.name); map.set(key, group);
  }
  return [...map.values()];
});
const windowLabel = computed(() => {
  const start = zoom.value?.from ?? 0, end = zoom.value?.to ?? props.series.length - 1;
  return `${time(props.series[start]?.date)} – ${time(props.series[end]?.date)}`;
});

// Canvas cannot paint var(--…); charts resolve the ot-os tokens at build time (fixed categorical
// order: model spend, external spend, steps).
const token = pjToken;
function palette() {
  return {
    text: token('--ot-text', '#e9f1e5'), text2: token('--ot-text-2', '#b3c2ad'), muted: token('--ot-muted', '#93a48d'),
    grid: token('--ot-grid', 'rgba(146, 196, 130, 0.10)'), axis: token('--ot-axis', '#6f7d6a'),
    surface: token('--ot-surface', '#12150f'), raised: token('--ot-surface-2', '#191d16'),
    lineStrong: token('--ot-line-strong', 'rgba(146, 196, 130, 0.30)'), accent: token('--ot-accent', '#6ddc4f'),
    model: token('--ot-cat-1', '#3987e5'), external: token('--ot-cat-2', '#d95926'), steps: token('--ot-cat-3', '#199e70'),
  };
}
function destroy() { charts.forEach(chart => chart.destroy()); charts = []; }
function build() {
  if (!mounted || !spendCanvas.value || !stepsCanvas.value || !scatterCanvas.value) return;
  destroy();
  if (zoom.value && zoom.value.to >= props.series.length) zoom.value = null;
  focused.value = Math.min(focused.value, Math.max(0, groups.value.length - 1));
  const labels = props.series.map(p => p.date);
  const c = palette();
  const tooltip = {
    backgroundColor: c.raised, borderColor: c.lineStrong, borderWidth: 1,
    titleColor: c.text, bodyColor: c.text2, padding: 10, displayColors: true,
    titleFont: { size: 11 }, bodyFont: { size: 11 },
  };
  const axis = { ticks: { color: c.muted, font: { size: 10 }, maxTicksLimit: 3 }, grid: { color: c.grid }, border: { color: c.axis } };
  const trendOptions = (isSteps: boolean): any => ({
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: { ...tooltip, callbacks: {
      title: (items: any[]) => time(items[0]?.label),
      label: (item: any) => `${item.dataset.label}: ${isSteps ? `${item.parsed.y} completed` : money(item.parsed.y)}`,
    } } },
    layout: { padding: { right: 5, top: 3 } },
    scales: {
      x: { ...axis, type: 'category', offset: true, min: zoom.value?.from, max: zoom.value?.to,
        display: isSteps, grid: { display: false }, ticks: { color: c.muted, font: { size: 10 }, maxTicksLimit: 5, maxRotation: 0,
          callback: (value: number) => { const date = new Date(labels[value]); return props.range === '7d' ? date.toLocaleDateString(undefined, { month:'short', day:'numeric' }) : date.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' }); } } },
      y: { ...axis, beginAtZero: true, suggestedMax: isSteps ? 1 : 0.01,
        afterFit: (scale: any) => { scale.width = 58; },
        ticks: { ...axis.ticks, precision: isSteps ? 0 : undefined, callback: (n: number) => isSteps ? n : money(n) },
        title: { display: true, text: isSteps ? 'Steps' : 'USD', color: c.text2, font: { size: 10 } } },
    },
  });
  const selection = { id: 'overview-selection', afterDraw(chart: Chart) {
    if (!drag.value || charts[drag.value.index] !== chart) return;
    const { ctx, chartArea } = chart;
    const left = Math.max(chartArea.left, Math.min(drag.value.start, drag.value.end));
    const right = Math.min(chartArea.right, Math.max(drag.value.start, drag.value.end));
    ctx.save(); ctx.fillStyle = c.accent; ctx.strokeStyle = c.accent;
    ctx.globalAlpha = 0.16; ctx.fillRect(left, chartArea.top, Math.max(0, right - left), chartArea.height);
    ctx.globalAlpha = 1; ctx.strokeRect(left, chartArea.top, Math.max(0, right - left), chartArea.height); ctx.restore();
  } };
  charts.push(new Chart(spendCanvas.value, { type: 'line', options: trendOptions(false), plugins: [selection], data: { labels, datasets: [
    { label:'Model spend', data:props.series.map(p=>p.spendUsd), borderColor:c.model, backgroundColor:c.model, borderWidth:2, pointRadius:1, pointHoverRadius:4, hidden:!showModel.value },
    { label:'External spend', data:props.series.map(p=>p.moneySpendUsd), borderColor:c.external, backgroundColor:c.external, borderDash:[4,3], borderWidth:1.5, pointRadius:1, pointHoverRadius:4, hidden:!showExternal.value },
  ] } }));
  charts.push(new Chart(stepsCanvas.value, { type: 'bar', options: trendOptions(true), plugins: [selection], data: { labels, datasets: [
    { label:'Completed steps', data:props.series.map(p=>p.completedSteps), backgroundColor:c.steps, hoverBackgroundColor:c.accent, maxBarThickness:18, hidden:!showSteps.value },
  ] } }));
  charts.push(new Chart(scatterCanvas.value, { type: 'scatter', data: { datasets: [{ label:'Projects',
    data:groups.value.map(g=>({x:g.cost,y:g.steps})), backgroundColor:c.model, borderColor:c.surface, borderWidth:1,
    pointRadius:groups.value.map(g=>g.ids.length > 1 ? 8 : 5), pointHoverRadius:9, pointHitRadius:8,
  }] }, options: {
    responsive:true, maintainAspectRatio:false, animation:false,
    layout: { padding:{ top:5, right:12 } },
    plugins:{ legend:{display:false}, tooltip:{...tooltip, callbacks:{
      title:(items:any[])=>groups.value[items[0]?.dataIndex]?.names ?? [],
      label:(item:any)=>`${money(item.parsed.x)} spend · ${item.parsed.y} completed steps`,
      footer:()=> 'Click to inspect result',
    } } },
    scales:{ x:{...axis,beginAtZero:true,suggestedMax:0.01,ticks:{...axis.ticks,callback:(n:any)=>money(Number(n))}},
      y:{...axis,beginAtZero:true,suggestedMax:1,ticks:{...axis.ticks,precision:0},title:{display:true,text:'Steps completed',color:c.text2,font:{size:10}}} },
    onHover:(_event, items, chart)=>{chart.canvas.style.cursor = items.length ? 'pointer' : 'default';},
    onClick:(_event,items)=>{ if (items.length) { focused.value=items[0].index; openFocused(); } },
  } }));
}
function toggleSeries(which: string) {
  if (which === 'model') { showModel.value = !showModel.value; charts[0]?.setDatasetVisibility(0,showModel.value); }
  if (which === 'external') { showExternal.value = !showExternal.value; charts[0]?.setDatasetVisibility(1,showExternal.value); }
  if (which === 'steps') { showSteps.value = !showSteps.value; charts[1]?.setDatasetVisibility(0,showSteps.value); }
  charts.slice(0,2).forEach(chart=>chart.update('none'));
}
function applyZoom() {
  for (const chart of charts.slice(0,2)) { const scale = chart.options.scales!.x!; scale.min=zoom.value?.from; scale.max=zoom.value?.to; chart.update('none'); }
  accessibleStatus.value = `Timeline ${zoom.value ? 'zoomed' : 'reset'}: ${windowLabel.value}`;
}
function resetZoom() { zoom.value=null; applyZoom(); }
function zoomIn() { const from=zoom.value?.from ?? 0, to=zoom.value?.to ?? props.series.length-1; const trim=Math.max(1,Math.floor((to-from)/4)); if (to-from > 2) { zoom.value={from:from+trim,to:to-trim}; applyZoom(); } }
function pixel(event: PointerEvent) { const canvas=event.currentTarget as HTMLCanvasElement; return event.clientX-canvas.getBoundingClientRect().left; }
function beginDrag(event: PointerEvent, index: number) {
  if (event.button !== 0 || props.series.length < 3) return;
  drag.value={index,start:pixel(event),end:pixel(event)};
  (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
}
function moveDrag(event: PointerEvent) { if (!drag.value) return; drag.value.end=pixel(event); charts[drag.value.index]?.draw(); }
function cancelDrag() { const index=drag.value?.index; drag.value=null; if(index!=null) charts[index]?.draw(); }
function endDrag(event: PointerEvent) {
  const selection=drag.value; if(!selection) return;
  const end=pixel(event), scale=charts[selection.index]?.scales.x;
  cancelDrag();
  if (!scale || Math.abs(end-selection.start)<10) return;
  const a=scale.getValueForPixel(Math.min(selection.start,end)), b=scale.getValueForPixel(Math.max(selection.start,end));
  if (a==null || b==null) return;
  const from=Math.max(0,Math.floor(a)), to=Math.min(props.series.length-1,Math.ceil(b));
  if(to>from) { zoom.value={from,to}; applyZoom(); }
}
function showFocused() {
  const chart=charts[2], group=groups.value[focused.value]; if(!chart || !group) return;
  const element=chart.getDatasetMeta(0).data[focused.value]; if(!element) return;
  chart.setActiveElements([{datasetIndex:0,index:focused.value}]);
  chart.tooltip?.setActiveElements([{datasetIndex:0,index:focused.value}],{x:element.x,y:element.y}); chart.update('none');
  accessibleStatus.value=`${group.names.join(', ')}: ${money(group.cost)}, ${group.steps} completed steps. Enter to inspect.`;
}
function focusPoint(delta: number) { if(!groups.value.length)return; focused.value=(focused.value+delta+groups.value.length)%groups.value.length; showFocused(); }
function openFocused() { const group=groups.value[focused.value]; if(group)emit('select',group.ids); }
watch(()=>props.range,()=>{zoom.value=null;});
watch([()=>props.series,()=>props.projects],build,{flush:'post'});
onMounted(()=>{mounted=true;build();});
onBeforeUnmount(()=>{mounted=false;destroy();});
</script>

<style scoped>
.overview-charts { display: grid; grid-template-columns: minmax(0, 1.9fr) minmax(0, 1fr); gap: var(--ot-space-6); min-width: 0; }
.trend, .comparison { min-width: 0; display: flex; flex-direction: column; gap: var(--ot-space-1); }
.comparison { padding-left: var(--ot-space-6); border-left: 1px solid var(--ot-line); }
.chart-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ot-space-2); }
.chart-heading h2 { margin: 0; font-size: 14px; line-height: 20px; font-weight: 600; color: var(--ot-text); }
.chart-heading span { font-size: 11.5px; color: var(--ot-muted); }
.trend-plots { height: 190px; display: grid; grid-template-rows: 1fr 1.15fr; position: relative; }
.plot { position: relative; min-width: 0; min-height: 0; }
.plot canvas { touch-action: none; cursor: crosshair; }
.scatter-plot { height: 190px; position: relative; min-width: 0; }
canvas { max-width: 100%; }
canvas:focus-visible { outline: var(--ot-focus) solid var(--ot-accent); outline-offset: var(--ot-focus-offset); }
.chart-controls { display: flex; justify-content: space-between; align-items: center; gap: var(--ot-space-2); min-height: 26px; }
.legend, .zoom-controls, .point-controls { display: flex; align-items: center; gap: var(--ot-space-1); }
.legend { flex-wrap: wrap; }
.overview-charts button { display: inline-flex; align-items: center; gap: 6px; height: var(--ot-control-sm); padding: 0 var(--ot-space-2); font-size: 11.5px; font-weight: 600; border: 1px solid transparent; border-radius: var(--ot-radius-sm); color: var(--ot-text-2); background: transparent; cursor: pointer; }
.overview-charts button:hover:not(:disabled) { border-color: var(--ot-line-strong); color: var(--ot-text); }
.overview-charts button[aria-pressed='false'] { opacity: 0.5; text-decoration: line-through; }
.overview-charts button:disabled { opacity: 0.4; cursor: default; }
.legend i { width: 12px; height: 2px; display: block; }
.model-key { background: var(--ot-cat-1); }
.legend i.external-key { height: 0; border-top: 2px dashed var(--ot-cat-2); }
.legend .steps-key { height: 8px; background: var(--ot-cat-3); }
.drag-hint, .comparison-note, .range-caption { color: var(--ot-muted); font-size: 11px; }
.range-caption { min-height: 14px; }
.no-data { position: absolute; top: 40%; left: 15%; right: 5%; text-align: center; color: var(--ot-muted); font-size: 12.5px; pointer-events: none; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
@media (max-width: 1100px) { .drag-hint, .comparison-note { display: none; } .comparison { padding-left: var(--ot-space-3); } }
@media (max-width: 800px) {
  .overview-charts { grid-template-columns: minmax(0, 1fr); gap: var(--ot-space-3); }
  .comparison { border-left: 0; border-top: 1px solid var(--ot-line); padding: var(--ot-space-3) 0 0; }
  .trend-plots, .scatter-plot { height: 160px; }
  .chart-controls { flex-wrap: wrap; }
  .point-controls { margin-left: auto; }
}
</style>
