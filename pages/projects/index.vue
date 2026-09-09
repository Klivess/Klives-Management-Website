<template>
  <div class="projects-overview" :class="`mobile-${mobileTab}`">
    <header class="page-header">
      <div class="identity"><h1>Projects</h1><span>Autonomous operations</span></div>
      <div class="header-actions">
        <button :disabled="!live.length" @click="openOverlay('broadcast')">Broadcast</button>
        <button :disabled="busy || !live.length" class="halt" @click="fleetAction">{{ haltedCount ? `▶ Unhalt all (${haltedCount})` : 'Ⅱ Halt all' }}</button>
        <NuxtLink to="/projects/analytics">Analytics ↗</NuxtLink><NuxtLink to="/projects/accounts">Accounts</NuxtLink>
        <button @click="openOverlay('settings')">Settings</button><NuxtLink to="/projects/new" class="primary">+ New project</NuxtLink>
      </div>
    </header>
    <div class="view-controls">
      <div class="scope"><span class="live-indicator" :class="{ connected }"></span>{{ connected ? 'Connected' : 'Polling' }}<span class="scope-label">· All {{ live.length }} unshelved projects</span></div>
      <div class="periods" aria-label="Historical time range"><button v-for="r in ['1h', '24h', '7d']" :key="r" :aria-pressed="range === r" @click="range = r">{{ r.toUpperCase() }}</button><button aria-label="Refresh overview" :disabled="refreshing" @click="refresh">↻</button></div>
    </div>
    <div class="mobile-tabs" role="tablist" aria-label="Dashboard sections"><button v-for="tab in ['overview', 'projects', 'attention']" :key="tab" role="tab" :aria-selected="mobileTab === tab" @click="mobileTab = tab">{{ tab }}<span v-if="tab === 'attention'"> ({{ data?.attention.length ?? 0 }})</span></button></div>
    <div v-if="loading" class="empty-state loading-state" role="status"><span class="loading-spinner" aria-hidden="true"></span><strong>{{ loadingMessage }}</strong><small>The page will open automatically as soon as this step finishes.</small></div>
    <template v-else>
      <div v-if="error || actionMessage" class="notice" :class="{ error: !!error }" role="status">{{ error || actionMessage }}<span v-if="error && data"> Showing last successful snapshot from {{ time(data.liveAt) }}.</span></div>
      <template v-if="data">
        <div v-if="data.historicalLoading" class="notice loading-notice" role="status"><span class="loading-spinner" aria-hidden="true"></span><span><strong>{{ data.historicalLoadingMessage || 'Building historical activity' }}…</strong> Live project state is already available; charts, spend and wake outcomes will fill in automatically.</span></div>
        <section class="summary-ribbon" aria-label="Fleet summary">
          <div><span>Working <em>Now</em></span><strong>{{ data.workingProjects }}<small> / {{ live.length }}</small></strong></div>
          <div><span>Steps delivered <em>{{ displayRange }}</em></span><strong>{{ data.historicalLoading ? '…' : data.completedSteps }}</strong></div>
          <div :title="`${data.execution.observedWakes} / ${data.execution.outcomes} wakes measured`"><span>Productive wakes <em>{{ displayRange }}</em></span><strong>{{ data.historicalLoading || data.execution.productiveRate == null ? '—' : data.execution.productiveRate.toFixed(0) + '%' }}</strong><small class="coverage">{{ data.historicalLoading ? 'building history' : data.execution.coveragePct + '% coverage' }}</small></div>
          <div><span>Model spend <em>{{ displayRange }}</em></span><strong>{{ data.historicalLoading ? '…' : money(data.modelSpendUsd) }}</strong></div>
          <div><span>External spend <em>{{ displayRange }}</em></span><strong>{{ data.historicalLoading ? '…' : money(data.externalSpendUsd) }}</strong></div>
          <button class="attention-summary" :class="{ warning: data.attention.length }" @click="openAttention()"><span>Needs attention <em>Now</em></span><strong>{{ data.attention.length }} <small>↗</small></strong></button>
        </section>
        <ProjectsOverviewCharts :series="data.series" :projects="live" :range="data.range.key" @select="openInspector" />
        <section class="project-section" aria-label="Project operations">
          <div class="list-toolbar">
            <div class="list-tabs"><button :aria-pressed="!shelved" @click="shelved = false">Operations <span>{{ live.length }}</span></button><button :aria-pressed="shelved" @click="shelved = true">Shelved <span>{{ archived.length }}</span></button></div>
            <div class="list-controls"><input v-model="search" type="search" aria-label="Search projects" placeholder="Find project…" /><select v-model="sort" aria-label="Sort projects"><option value="attention">Attention first</option><option value="name">Name</option><option value="spend">Highest spend</option><option value="steps">Steps delivered</option></select></div>
          </div>
          <div class="lane-head" aria-hidden="true"><span>Project / state</span><span>Working on now</span><span>Main result <b>Now</b></span><span>Wake outcomes <b>{{ displayRange }}</b></span><span>Spend <b>{{ displayRange }}</b></span></div>
          <div ref="lanesElement" class="lanes" data-testid="project-lanes">
            <div v-if="!filtered.length" class="empty-state">{{ search ? 'No matching projects.' : shelved ? 'No shelved projects.' : 'No unshelved projects. Create a project or restore one from Shelved.' }}</div>
            <article v-for="p in visibleRows" :key="p.projectID" class="project-lane" :class="{ 'has-attention': needsAttention(p) }" :data-project-id="p.projectID">
              <div class="project-cell"><NuxtLink :to="`/projects/${p.projectID}`" :title="p.name">{{ p.name || '(untitled)' }}</NuxtLink><div class="state-line"><span class="state-dot" :class="stateClass(p)"></span><span>{{ p.halted ? 'Halted' : p.status }}</span><button v-if="needsAttention(p)" class="inline-attention" :aria-label="`Attention for ${p.name}`" @click="openAttention(p.projectID)">! {{ p.pendingApprovals || 'Blocked' }}</button></div></div>
              <div class="work-cell"><span class="work-title" :title="p.currentWork">{{ shelved ? 'Shelved' : p.currentWork }}</span><small :title="`${p.currentWorkSource} · ${time(p.currentWorkAt)}`"><span v-if="p.workingAgents" class="working">● {{ p.workingAgents }} working · {{ p.activityPhase }}</span><span v-else>{{ p.halted ? 'Fleet halted' : p.executionDisposition || 'Not executing' }}</span><span v-if="p.nextRetryAt"> · retry {{ age(p.nextRetryAt) }}</span></small></div>
              <button v-if="!shelved" class="result-cell" :aria-label="`Inspect result for ${p.name}`" @click="openInspector([p.projectID])"><div class="result-copy"><small :title="p.result.name">{{ p.result.name }}<span v-if="p.result.selection === 'pinned'"> · pinned</span></small><div><strong>{{ p.historicalReady === false && p.result.selection === 'fallback' ? '…' : resultValue(p.result) }}</strong><span v-if="p.result.delta != null" class="delta" :class="deltaClass(p.result)">{{ p.result.delta > 0 ? '+' : '' }}{{ number(p.result.delta) }}</span></div><span class="result-meta" :class="{ warning: p.result.stale || p.result.validity !== 'Valid' }">{{ p.historicalReady === false && p.result.selection === 'fallback' ? 'Building step history…' : resultMeta(p.result) }}</span></div><ProjectsResultSparkline :name="p.result.name" :history="p.result.history" :class="deltaClass(p.result)" /></button>
              <div v-else class="result-cell"><button :disabled="busy" @click="unarchive(p.projectID)">Unshelve</button></div>
              <div class="activity-cell"><template v-if="p.historicalReady !== false"><div class="activity-strip" role="img" :aria-label="activitySummary(p)"><div v-for="s in p.series" :key="s.date" class="activity-bin" :title="`${time(s.date)}: ${s.completed} completed, ${s.failed} failed, ${s.deferred} deferred, ${s.cancelled} cancelled`"><i v-if="s.completed" class="completed" :style="{ flex: s.completed }"></i><i v-if="s.failed" class="failed" :style="{ flex: s.failed }"></i><i v-if="s.deferred" class="deferred" :style="{ flex: s.deferred }"></i><i v-if="s.cancelled" class="cancelled" :style="{ flex: s.cancelled }"></i></div></div><small>{{ p.series.reduce((n, s) => n + s.completed + s.failed + s.deferred + s.cancelled, 0) }} recorded wakes</small></template><small v-else class="cell-loading">Building activity…</small></div>
              <div class="cost-cell"><strong>{{ p.historicalReady !== false ? money(p.rangeSpendUsd + p.rangeMoneySpendUsd) : '…' }}</strong><div class="budget-track" :title="`Lifetime model spend ${money(p.tokenSpendUsd)} / ${money(p.tokenBudgetUsd)} budget`"><i :style="{ width: budgetPct(p) + '%' }" :class="{ warning: budgetPct(p) >= 80 }"></i></div><small>{{ money(p.tokenSpendUsd) }} / {{ money(p.tokenBudgetUsd) }} model lifetime</small></div>
            </article>
          </div>
          <footer class="list-footer"><div class="outcome-legend"><span>● Completed</span><span>× Failed</span><span>Ⅱ Deferred</span><span>◇ Cancelled</span></div><div class="pagination"><span>{{ filtered.length ? (page - 1) * capacity + 1 : 0 }}–{{ Math.min(page * capacity, filtered.length) }} of {{ filtered.length }}</span><button aria-label="Previous project page" :disabled="page <= 1" @click="page--">‹</button><span>{{ page }} / {{ pages }}</span><button aria-label="Next project page" :disabled="page >= pages" @click="page++">›</button></div></footer>
        </section>
        <section class="mobile-attention-panel" aria-label="Mobile attention queue"><h2>Needs attention</h2><p v-if="!data.attention.length">No intervention needed.</p><NuxtLink v-for="item in attentionPageItems" :key="item.projectID + item.kind" :to="`/projects/${item.projectID}`"><strong>{{ item.name }}</strong><span>{{ item.label }}</span></NuxtLink><div class="pagination"><button :disabled="attentionPage <= 1" @click="attentionPage--">Previous</button><span>{{ attentionPage }} / {{ attentionPages }}</span><button :disabled="attentionPage >= attentionPages" @click="attentionPage++">Next</button></div></section>
        <footer class="freshness"><span>Now updated {{ age(data.liveAt) }}<span v-if="refreshing"> · refreshing…</span></span><span :title="time(data.historicalAt)">Charts as of {{ time(data.historicalAt) }} · up to 5m cache</span></footer>
      </template>
      <div v-else class="empty-state"><p>Operations are unavailable.</p><button @click="refresh">Retry</button></div>
    </template>
    <dialog ref="dialogElement" class="overview-dialog" :class="`dialog-${overlay}`" @close="onDialogClosed" @cancel.prevent="closeOverlay" @click="onDialogClick">
      <header class="dialog-heading"><h2>{{ overlayTitle }}</h2><button aria-label="Close dialog" @click="closeOverlay">✕</button></header>
      <p v-if="dialogError" class="notice error" role="alert">{{ dialogError }}</p>
      <form v-if="overlay === 'broadcast'" @submit.prevent="sendBroadcast"><p>Send to every live project's Commander. Shelved and completed projects are skipped; paused Commanders receive it on their next wake.</p><label>Message<textarea v-model="broadcast" rows="5" required :disabled="busy" /></label><div class="dialog-actions"><button type="button" @click="closeOverlay">Cancel</button><button class="primary" :disabled="busy || !broadcast.trim()">{{ busy ? 'Sending…' : 'Send to all' }}</button></div></form>
      <ProjectsSettingsPanel v-if="overlay === 'settings'" system />
      <div v-if="overlay === 'attention'" class="attention-list"><p v-if="!attentionItems.length">No intervention needed.</p><NuxtLink v-for="item in attentionPageItems" :key="item.projectID + item.kind" :to="`/projects/${item.projectID}`"><strong>{{ item.name }}</strong><span>{{ item.label }}</span></NuxtLink><div class="pagination"><button :disabled="attentionPage <= 1" @click="attentionPage--">Previous</button><span>{{ attentionPage }} / {{ attentionPages }}</span><button :disabled="attentionPage >= attentionPages" @click="attentionPage++">Next</button></div></div>
      <div v-if="overlay === 'inspector' && selected" class="inspector">
        <label v-if="inspectorIDs.length > 1">Projects at this point<select v-model="selectedID"><option v-for="p in inspectorProjects" :key="p.projectID" :value="p.projectID">{{ p.name }}</option></select></label>
        <h3>{{ selected.name }}</h3><div class="inspector-result"><div><span>{{ selected.result.name }}</span><strong>{{ resultValue(selected.result) }}</strong><small>{{ resultMeta(selected.result) }}</small></div><ProjectsResultSparkline :name="selected.result.name" :history="selected.result.history" /></div>
        <p>{{ selected.result.rationale }}</p>
        <dl><dt>Measurement source</dt><dd>{{ selected.result.source }} · {{ selected.result.validity }}</dd><dt>Observed</dt><dd>{{ time(selected.result.observedAt) }}</dd><dt>Change · {{ displayRange }}</dt><dd>{{ selected.result.delta == null ? 'Unavailable — needs valid, fresh measurements and a period baseline' : number(selected.result.delta) }}</dd><dt>Evidence</dt><dd>{{ selected.result.evidenceEventSequence ? `Event #${selected.result.evidenceEventSequence}` : 'No event reference' }}<span v-for="id in selected.result.evidenceArtifactIDs" :key="id"> · Artifact {{ id }}</span></dd><dt>Current work</dt><dd>{{ selected.currentWork }}<small>{{ selected.currentWorkSource }} · {{ time(selected.currentWorkAt) }}</small></dd><dt>Execution</dt><dd>{{ selected.executionDisposition }} · {{ selected.executionHealth }}<span v-if="selected.blocker"> · {{ selected.blocker }}</span></dd><dt>Spend · {{ displayRange }}</dt><dd>{{ money(selected.rangeSpendUsd) }} model + {{ money(selected.rangeMoneySpendUsd) }} external</dd><dt>Lifetime budgets</dt><dd>{{ money(selected.tokenSpendUsd) }} / {{ money(selected.tokenBudgetUsd) }} model; {{ money(selected.moneySpendUsd) }} / {{ money(selected.moneyBudgetUsd) }} external</dd></dl>
        <div class="pin-controls"><label>Primary result<select v-model="pinID" aria-label="Primary result"><option value="">Use Commander selection</option><option v-for="o in selected.resultOptions" :key="o.observableID" :value="o.observableID">{{ o.name }}</option></select></label><label v-if="pinID">Favourable direction<select v-model="pinDirection" aria-label="Favourable direction"><option value="higher">Higher</option><option value="lower">Lower</option><option value="neutral">Neutral</option></select></label></div>
        <div class="dialog-actions"><button :disabled="busy" @click="savePin">{{ busy ? 'Saving…' : 'Save selection' }}</button><NuxtLink :to="`/projects/${selected.projectID}`" class="primary">Open workspace ↗</NuxtLink></div>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useProjectsOverview, type OverviewProject, type OverviewResult } from '~/composables/useProjectsOverview';
definePageMeta({ layout: 'navbar' });
const { range, data, loading, loadingMessage, refreshing, error, now, connected, refresh } = useProjectsOverview();
const live = computed(() => data.value?.projects.filter(p => p.status !== 'Archived') ?? []);
const archived = computed(() => data.value?.projects.filter(p => p.status === 'Archived') ?? []);
const displayRange = computed(() => data.value?.range.key.toUpperCase() ?? range.value.toUpperCase());
const haltedCount = computed(() => live.value.filter(p => p.halted).length);
const shelved = ref(false), search = ref(''), sort = ref('attention'), page = ref(1), capacity = ref(8), mobileTab = ref('overview');
const lanesElement = ref<HTMLElement | null>(null), order = ref<string[]>([]);
const needsAttention = (p: OverviewProject) => p.pendingApprovals > 0 || !!p.blocker || ['Blocked', 'BudgetPaused'].includes(p.status);
function resetOrder() {
  order.value = [...(data.value?.projects ?? [])].sort((a, b) => {
    if (sort.value === 'attention' && needsAttention(a) !== needsAttention(b)) return Number(needsAttention(b)) - Number(needsAttention(a));
    if (sort.value === 'spend') return (b.rangeSpendUsd + b.rangeMoneySpendUsd) - (a.rangeSpendUsd + a.rangeMoneySpendUsd) || a.name.localeCompare(b.name);
    if (sort.value === 'steps') return b.completedSteps - a.completedSteps || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name) || a.projectID.localeCompare(b.projectID);
  }).map(p => p.projectID);
}
watch(data, value => {
  if (!value) return;
  if (!order.value.length) resetOrder();
  else { const ids = new Set(value.projects.map(p => p.projectID)); order.value = order.value.filter(id => ids.has(id)); for (const p of value.projects) if (!order.value.includes(p.projectID)) order.value.push(p.projectID); }
});
watch(sort, () => { resetOrder(); page.value = 1; });
watch([shelved, search], () => { page.value = 1; });
const filtered = computed(() => {
  const positions = new Map(order.value.map((id, i) => [id, i]));
  return (shelved.value ? archived.value : live.value).filter(p => p.name.toLowerCase().includes(search.value.toLowerCase()))
    .sort((a, b) => (positions.get(a.projectID) ?? Infinity) - (positions.get(b.projectID) ?? Infinity));
});
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / capacity.value)));
watch(pages, n => { page.value = Math.min(page.value, n); });
const visibleRows = computed(() => filtered.value.slice((page.value - 1) * capacity.value, page.value * capacity.value));
let resize: ResizeObserver | null = null;
function measure() { const height = lanesElement.value?.getBoundingClientRect().height; if (height) capacity.value = Math.max(1, Math.min(12, Math.floor(height / (window.innerWidth <= 800 ? 112 : 56)))); }
watch(lanesElement, element => { resize?.disconnect(); if (element) resize?.observe(element); nextTick(measure); });
watch(mobileTab, () => nextTick(measure));
onMounted(() => { resize = new ResizeObserver(measure); if (lanesElement.value) resize.observe(lanesElement.value); });
onBeforeUnmount(() => resize?.disconnect());
const number = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const money = (n: number) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const time = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not recorded';
function age(iso: string | null) { if (!iso) return 'unknown'; const minutes = Math.floor((now.value - new Date(iso).getTime()) / 60000); return minutes < 0 ? `in ${-minutes}m` : minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`; }
const budgetPct = (p: OverviewProject) => p.tokenBudgetUsd > 0 ? Math.min(100, Math.max(0, 100 * p.tokenSpendUsd / p.tokenBudgetUsd)) : 0;
const stateClass = (p: OverviewProject) => p.halted ? 'paused' : p.status.toLowerCase();
const resultValue = (r: OverviewResult) => r.value == null ? '—' : (r.format === 'Currency' ? money(r.value) : number(r.value)) + (r.format === 'Percent' ? '%' : r.unit ? ` ${r.unit}` : '');
const resultMeta = (r: OverviewResult) => r.value == null ? 'Measurement unavailable' : r.selection === 'fallback' ? `${displayRange.value} · fallback` : r.stale ? 'Stale measurement' : r.validity !== 'Valid' ? (r.validity === 'Invalid' ? 'Invalid measurement' : 'Unverified measurement') : `${r.selection === 'pinned' ? 'Your selection' : 'Commander selection'} · ${age(r.observedAt)}`;
const deltaClass = (r: OverviewResult) => r.stale || r.validity !== 'Valid' || r.delta == null || r.delta === 0 || r.direction === 'neutral' ? 'neutral' : (r.delta > 0) === (r.direction === 'higher') ? 'favourable' : 'unfavourable';
const activitySummary = (p: OverviewProject) => `${p.name}, ${displayRange.value}: ${p.series.reduce((n,s) => n+s.completed,0)} completed, ${p.series.reduce((n,s) => n+s.failed,0)} failed, ${p.series.reduce((n,s) => n+s.deferred,0)} deferred, ${p.series.reduce((n,s) => n+s.cancelled,0)} cancelled wakes; empty intervals have no recorded outcomes.`;
const overlay = ref(''), dialogElement = ref<HTMLDialogElement | null>(null), busy = ref(false), dialogError = ref(''), actionMessage = ref(''), broadcast = ref('');
const selectedID = ref(''), inspectorIDs = ref<string[]>([]), pinID = ref(''), pinDirection = ref('neutral');
const selected = computed(() => data.value?.projects.find(p => p.projectID === selectedID.value));
const inspectorProjects = computed(() => live.value.filter(p => inspectorIDs.value.includes(p.projectID)));
function syncPin() { pinID.value = selected.value?.result.selection === 'pinned' ? selected.value.result.observableID ?? '' : ''; pinDirection.value = selected.value?.result.direction ?? 'neutral'; }
watch(selectedID, syncPin);
const overlayTitle = computed(() => ({ broadcast: 'Broadcast to every project', settings: 'System defaults', attention: 'Needs attention', inspector: 'Project result' } as Record<string,string>)[overlay.value] ?? '');
async function openOverlay(kind: string) { overlay.value = kind; dialogError.value = ''; await nextTick(); if (!dialogElement.value?.open) dialogElement.value?.showModal(); }
function onDialogClosed() { if (!dialogElement.value?.open) overlay.value = ''; }
function closeOverlay() { dialogElement.value?.close(); overlay.value = ''; }
function onDialogClick(event: MouseEvent) { const dialog = dialogElement.value; if (!dialog || event.target !== dialog) return; const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeOverlay(); }
function openInspector(ids: string[]) { inspectorIDs.value = ids; selectedID.value = ids[0] ?? ''; syncPin(); openOverlay('inspector'); }
const attentionProject = ref(''), attentionPage = ref(1);
const attentionItems = computed(() => (data.value?.attention ?? []).filter(a => !attentionProject.value || a.projectID === attentionProject.value));
const attentionPages = computed(() => Math.max(1, Math.ceil(attentionItems.value.length / 4)));
const attentionPageItems = computed(() => attentionItems.value.slice((attentionPage.value - 1) * 4, attentionPage.value * 4));
watch(attentionPages, n => { attentionPage.value = Math.min(attentionPage.value, n); });
watch(overlay, kind => { if (kind !== 'attention') { attentionProject.value = ''; attentionPage.value = 1; } });
function openAttention(id = '') { attentionProject.value = id; attentionPage.value = 1; openOverlay('attention'); }
async function post(path: string, body: unknown = {}) { const res = await RequestPOSTFromKliveAPI(path, JSON.stringify(body), false, true); if (!res.ok) throw new Error(`Action failed (HTTP ${res.status}).`); return res.json().catch(() => ({})); }
async function fleetAction() { if (busy.value) return; busy.value = true; actionMessage.value = ''; try { const restoring = haltedCount.value > 0; const response = await post(restoring ? '/projects/unhalt-all' : '/projects/halt-all'); actionMessage.value = restoring ? `Restored ${response.restored ?? ''} project(s).` : `Halted ${response.halted ?? ''} project(s).`; await refresh(); } catch(e: any) { actionMessage.value = e.message; } finally { busy.value = false; } }
async function unarchive(projectID: string) { busy.value = true; try { await post('/projects/unarchive', { projectID }); await refresh(); actionMessage.value = 'Project unshelved.'; } catch(e: any) { actionMessage.value = e.message; } finally { busy.value = false; } }
async function sendBroadcast() { if (busy.value || !broadcast.value.trim()) return; busy.value = true; try { const response = await post('/projects/broadcast', { text: broadcast.value.trim() }); closeOverlay(); broadcast.value = ''; actionMessage.value = `Broadcast delivered to ${response.delivered ?? '?'} project(s).`; } catch(e: any) { dialogError.value = e.message; } finally { busy.value = false; } }
async function savePin() { if (!selected.value || busy.value) return; busy.value = true; dialogError.value = ''; try { await post('/projects/result-pin', { projectID: selected.value.projectID, observableID: pinID.value || null, direction: pinDirection.value }); await refresh(); } catch(e: any) { dialogError.value = e.message; } finally { busy.value = false; } }
</script>

<style scoped src="~/assets/css/projects-overview.css"></style>
