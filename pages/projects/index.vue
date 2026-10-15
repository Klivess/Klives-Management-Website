<template>
  <ProjectsShell :status="shellStatus" :status-tone="shellTone" :working="(data?.workingProjects ?? 0) > 0">
    <div class="ot-pagehead">
      <div>
        <h1>Operations</h1>
        <p class="subtitle">{{ subtitle }}</p>
      </div>
      <div class="ot-actions">
        <button class="ot-btn ghost" :disabled="!live.length" @click="openOverlay('broadcast')">Broadcast</button>
        <button class="ot-btn" :class="haltedCount ? 'primary' : 'warn'" :disabled="busy || !live.length" @click="fleetAction">
          {{ haltedCount ? `▶ Unhalt all (${haltedCount})` : 'Ⅱ Halt all' }}
        </button>
        <button class="ot-btn ghost" @click="openOverlay('settings')">Defaults</button>
      </div>
    </div>

    <div class="ot-filterbar">
      <span class="summary"><span class="ot-dot" :class="connected ? 'ok' : 'warn'" aria-hidden="true"></span>{{ connected ? 'Live' : 'Polling' }} · <b>{{ live.length }}</b> unshelved project{{ live.length === 1 ? '' : 's' }}</span>
      <span class="grow"></span>
      <div class="ot-segment sm" role="group" aria-label="Historical time range">
        <button v-for="r in ['1h', '24h', '7d']" :key="r" type="button" :aria-pressed="range === r" @click="range = r">{{ r.toUpperCase() }}</button>
      </div>
      <button class="ot-btn ghost sm" aria-label="Refresh overview" :disabled="refreshing" @click="refresh">↻</button>
    </div>

    <div v-if="loading" class="ot-banner info ov-loading" role="status">
      <span class="glyph" aria-hidden="true">↻</span>
      <div><strong>{{ loadingMessage }}</strong>The page opens automatically as soon as this step finishes.</div>
    </div>

    <template v-else>
      <div v-if="error || actionMessage" class="ot-banner ov-notice" :class="error ? 'warn' : 'ok'" role="status">
        <span class="glyph" aria-hidden="true">{{ error ? '⚠' : '✓' }}</span>
        <div>{{ error || actionMessage }}<span v-if="error && data"> Showing last successful snapshot from {{ pjTime(data.liveAt) }}.</span></div>
      </div>

      <template v-if="data">
        <div v-if="data.degraded && data.warnings?.length" class="ot-banner warn" role="status">
          <span class="glyph" aria-hidden="true">⚠</span>
          <div><strong>Live operations loaded with partial project data.</strong>{{ data.warnings.join(' · ') }}</div>
        </div>

        <section v-if="cacheHalt?.engaged" class="ot-banner cache-halt" role="alert" aria-label="Prompt-cache fleet halt">
          <span class="glyph" aria-hidden="true">⏸</span>
          <div class="cache-halt-copy">
            <strong>Fleet halted on prompt-cache health</strong>
            <p>{{ cacheHalt.reason }}</p>
            <small>Engaged {{ pjAgo(cacheHalt.engagedAt, now) }} · {{ cacheHalt.haltedProjectIDs?.length ?? 0 }} project(s) stopped · no agent sends another model request until this is cleared.<span v-if="cacheWindow?.measuredRequests"> Since the trip: {{ cacheWindow.weightedHitRatePct.toFixed(1) }}% weighted over {{ cacheWindow.measuredRequests }} request(s).</span></small>
          </div>
          <div class="actions">
            <button class="ot-btn primary sm" :disabled="busy" @click="clearCacheHalt(true)">{{ busy ? 'Clearing…' : 'Clear halt & resume' }}</button>
            <button class="ot-btn ghost sm" :disabled="busy" title="Open the latch but leave every project halted, so nothing restarts while you check the cause." @click="clearCacheHalt(false)">Clear latch only</button>
          </div>
        </section>

        <div v-if="data.historicalLoading" class="ot-banner info ov-historical" role="status">
          <span class="glyph" aria-hidden="true">↻</span>
          <div><strong>{{ data.historicalLoadingMessage || 'Building historical activity' }}…</strong> Live project state is already available; charts, spend and wake outcomes fill in automatically.</div>
        </div>

        <section class="ot-kpis" aria-label="Fleet summary">
          <OmniTraderKpi label="Working now" :value="`${data.workingProjects} / ${live.length}`" foot="projects with an agent mid-turn" :tone="data.workingProjects ? 'good' : ''" />
          <OmniTraderKpi :label="`Steps delivered · ${displayRange}`" :value="data.historicalLoading ? '…' : String(data.completedSteps)" foot="closed with evidence" />
          <OmniTraderKpi :label="`Productive wakes · ${displayRange}`" :value="data.historicalLoading || data.execution.productiveRate == null ? '—' : data.execution.productiveRate.toFixed(0) + '%'"
            :foot="data.historicalLoading ? 'building history' : `${data.execution.coveragePct}% coverage · ${data.execution.observedWakes} measured`" />
          <OmniTraderKpi :label="`Model spend · ${displayRange}`" :value="data.historicalLoading ? '…' : pjMoney(data.modelSpendUsd)" />
          <OmniTraderKpi :label="`External spend · ${displayRange}`" :value="data.historicalLoading ? '…' : pjMoney(data.externalSpendUsd)" />
          <button class="ot-kpi attention-summary" :class="{ 'attention-soft': data.attention.length }" type="button" @click="openAttention()">
            <span class="k">Needs attention</span>
            <span class="v">{{ data.attention.length }}</span>
            <span class="foot">{{ data.attention.length ? 'approvals, blocks and budget pauses' : 'nothing waiting on you' }}</span>
          </button>
        </section>

        <OmniTraderCard v-if="data.attention.length" title="Needs attention" :subtitle="`${data.attention.length} item${data.attention.length === 1 ? '' : 's'} waiting on you`" attention class="pj-section">
          <ul class="ov-attention" aria-label="Attention queue">
            <li v-for="item in data.attention.slice(0, 6)" :key="item.projectID + item.kind">
              <span class="ot-chip" :class="item.kind === 'blocked' ? 'bad' : 'warn'">{{ item.kind }}</span>
              <NuxtLink :to="`/projects/${item.projectID}`">{{ item.name }}</NuxtLink>
              <span class="pj-muted">{{ item.label }}</span>
            </li>
          </ul>
          <template v-if="data.attention.length > 6" #footer><button class="ot-btn ghost sm" @click="openAttention()">All {{ data.attention.length }} →</button></template>
        </OmniTraderCard>

        <OmniTraderCard v-if="live.length" class="pj-section">
          <ProjectsOverviewCharts :series="data.series" :projects="live" :range="data.range.key" @select="openInspector" />
        </OmniTraderCard>

        <OmniTraderCard title="Projects" class="pj-section" flush>
          <template #controls>
            <div class="ot-segment sm" role="group" aria-label="Project list">
              <button type="button" :aria-pressed="!shelved" @click="shelved = false">Operations {{ live.length }}</button>
              <button type="button" :aria-pressed="shelved" @click="shelved = true">Shelved {{ archived.length }}</button>
            </div>
            <div class="ot-search ov-search"><span class="glyph" aria-hidden="true">⌕</span><input v-model="search" class="ot-input" type="search" aria-label="Search projects" placeholder="Find project…" /></div>
            <select v-model="sort" class="ot-select auto" aria-label="Sort projects">
              <option value="attention">Attention first</option><option value="name">Name</option><option value="spend">Highest spend</option><option value="steps">Steps delivered</option>
            </select>
          </template>
          <OmniTraderStateBlock v-if="!filtered.length" :kind="search ? 'filtered' : 'empty'"
            :title="search ? 'No matching projects' : shelved ? 'No shelved projects' : 'No unshelved projects'"
            :detail="search ? '' : shelved ? '' : 'Create a project or restore one from Shelved.'">
            <NuxtLink v-if="!search && !shelved" to="/projects/new" class="ot-btn primary sm">+ New project</NuxtLink>
          </OmniTraderStateBlock>
          <div v-else class="ot-tablewrap">
            <table class="ot-table ov-table" data-testid="project-lanes">
              <thead>
                <tr>
                  <th>Project</th><th>Working on now</th><th v-if="!shelved">Main result</th><th>Wake outcomes · {{ displayRange }}</th><th class="num">Spend · {{ displayRange }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in filtered" :key="p.projectID" class="project-lane" :class="{ attention: needsAttention(p) }" :data-project-id="p.projectID">
                  <td class="ov-project">
                    <NuxtLink :to="`/projects/${p.projectID}`" :title="p.name">{{ p.name || '(untitled)' }}</NuxtLink>
                    <span class="ov-state">
                      <span class="ot-chip" :class="p.halted ? 'warn' : pjStatusTone(p.status)">{{ p.halted ? 'Halted' : pjStatusLabel(p.status) }}</span>
                      <button v-if="needsAttention(p)" class="ot-chip warn ov-inline-attention" :aria-label="`Attention for ${p.name}`" @click="openAttention(p.projectID)">! {{ p.pendingApprovals || 'Blocked' }}</button>
                    </span>
                  </td>
                  <td class="ov-work">
                    <span class="work-title" :title="p.currentWork">{{ shelved ? 'Shelved' : p.currentWork }}</span>
                    <span class="sub" :title="`${p.currentWorkSource} · ${pjTime(p.currentWorkAt)}`">
                      <span v-if="p.workingAgents" class="working">● {{ p.workingAgents }} working · {{ p.activityPhase }}</span>
                      <span v-else>{{ p.halted ? 'Fleet halted' : p.executionDisposition || 'Not executing' }}</span>
                      <span v-if="p.nextRetryAt"> · retry {{ pjAgo(p.nextRetryAt, now) }}</span>
                    </span>
                  </td>
                  <td v-if="!shelved">
                    <button class="result-cell" type="button" :aria-label="`Inspect result for ${p.name}`" @click="openInspector([p.projectID])">
                      <span class="result-copy">
                        <span class="sub" :title="p.result.name">{{ p.result.name }}<span v-if="p.result.selection === 'pinned'"> · pinned</span></span>
                        <span class="result-value">
                          <strong>{{ p.historicalReady === false && p.result.selection === 'fallback' ? '…' : resultValue(p.result) }}</strong>
                          <span v-if="p.result.delta != null" class="delta" :class="deltaClass(p.result)">{{ p.result.delta > 0 ? '+' : '' }}{{ pjNumber(p.result.delta) }}</span>
                        </span>
                        <span class="result-meta sub" :class="{ warning: p.result.stale || p.result.validity !== 'Valid' }">{{ p.historicalReady === false && p.result.selection === 'fallback' ? 'Building step history…' : resultMeta(p.result) }}</span>
                      </span>
                      <ProjectsResultSparkline :name="p.result.name" :history="p.result.history" :class="deltaClass(p.result)" />
                    </button>
                  </td>
                  <td class="ov-activity">
                    <template v-if="p.historicalReady !== false">
                      <div class="activity-strip" role="img" :aria-label="activitySummary(p)">
                        <div v-for="s in p.series" :key="s.date" class="activity-bin" :title="`${pjTime(s.date)}: ${s.completed} completed, ${s.failed} failed, ${s.deferred} deferred, ${s.cancelled} cancelled`">
                          <i v-if="s.completed" class="completed" :style="{ flex: s.completed }"></i><i v-if="s.failed" class="failed" :style="{ flex: s.failed }"></i><i v-if="s.deferred" class="deferred" :style="{ flex: s.deferred }"></i><i v-if="s.cancelled" class="cancelled" :style="{ flex: s.cancelled }"></i>
                        </div>
                      </div>
                      <span class="sub">{{ p.series.reduce((n, s) => n + s.completed + s.failed + s.deferred + s.cancelled, 0) }} recorded wakes</span>
                    </template>
                    <span v-else class="sub cell-loading">Building activity…</span>
                    <button v-if="shelved" class="ot-btn sm ov-unshelve" :disabled="busy" @click="unarchive(p.projectID)">Unshelve</button>
                  </td>
                  <td class="num ov-cost">
                    <strong>{{ p.historicalReady !== false ? pjMoney(p.rangeSpendUsd + p.rangeMoneySpendUsd) : '…' }}</strong>
                    <span class="budget-track" :title="`Lifetime model spend ${pjMoney(p.tokenSpendUsd)} / ${pjMoney(p.tokenBudgetUsd)} budget`"><i :style="{ width: budgetPct(p) + '%' }" :class="{ warning: budgetPct(p) >= 80 }"></i></span>
                    <span class="sub">{{ pjMoney(p.tokenSpendUsd) }} / {{ pjMoney(p.tokenBudgetUsd) }} lifetime</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <template #footer>
            <div class="ov-footer">
              <span class="outcome-legend"><span class="completed-t">● Completed</span><span class="failed-t">× Failed</span><span class="deferred-t">Ⅱ Deferred</span><span class="cancelled-t">◇ Cancelled</span></span>
              <span>Live state {{ pjAgo(data.liveAt, now) }} · charts as of {{ pjTime(data.historicalAt) }}<span v-if="refreshing"> · refreshing…</span></span>
            </div>
          </template>
        </OmniTraderCard>
      </template>
      <OmniTraderStateBlock v-else kind="error" title="Operations are unavailable">
        <button class="ot-btn sm" @click="refresh">Retry</button>
      </OmniTraderStateBlock>
    </template>

    <!-- Result inspector and attention queue: side drawers, so the table keeps its place. -->
    <OmniTraderDrawer :open="overlay === 'inspector' && !!selected" title="Project result" :subtitle="selected?.name" @close="closeOverlay">
      <div v-if="selected" class="inspector">
        <div v-if="inspectorIDs.length > 1" class="ot-field">
          <label for="ov-inspect-select">Projects at this point</label>
          <select id="ov-inspect-select" v-model="selectedID" class="ot-select"><option v-for="p in inspectorProjects" :key="p.projectID" :value="p.projectID">{{ p.name }}</option></select>
        </div>
        <div class="inspector-result">
          <div><span class="sub">{{ selected.result.name }}</span><strong>{{ resultValue(selected.result) }}</strong><small>{{ resultMeta(selected.result) }}</small></div>
          <ProjectsResultSparkline :name="selected.result.name" :history="selected.result.history" />
        </div>
        <p class="pj-prose">{{ selected.result.rationale }}</p>
        <dl class="ot-kv">
          <dt>Measurement source</dt><dd>{{ selected.result.source }} · {{ selected.result.validity }}</dd>
          <dt>Observed</dt><dd>{{ pjTime(selected.result.observedAt) }}</dd>
          <dt>Change · {{ displayRange }}</dt><dd>{{ selected.result.delta == null ? 'Unavailable — needs valid, fresh measurements and a period baseline' : pjNumber(selected.result.delta) }}</dd>
          <dt>Evidence</dt><dd>{{ selected.result.evidenceEventSequence ? `Event #${selected.result.evidenceEventSequence}` : 'No event reference' }}<span v-for="id in selected.result.evidenceArtifactIDs" :key="id"> · Artifact {{ id }}</span></dd>
          <dt>Current work</dt><dd>{{ selected.currentWork }} <span class="pj-muted">({{ selected.currentWorkSource }} · {{ pjTime(selected.currentWorkAt) }})</span></dd>
          <dt>Execution</dt><dd>{{ selected.executionDisposition }} · {{ selected.executionHealth }}<span v-if="selected.blocker"> · {{ selected.blocker }}</span></dd>
          <dt>Spend · {{ displayRange }}</dt><dd>{{ pjMoney(selected.rangeSpendUsd) }} model + {{ pjMoney(selected.rangeMoneySpendUsd) }} external</dd>
          <dt>Lifetime budgets</dt><dd>{{ pjMoney(selected.tokenSpendUsd) }} / {{ pjMoney(selected.tokenBudgetUsd) }} model; {{ pjMoney(selected.moneySpendUsd) }} / {{ pjMoney(selected.moneyBudgetUsd) }} external</dd>
        </dl>
        <div class="ot-formgrid pin-controls">
          <div class="ot-field"><label for="ov-pin">Primary result</label>
            <select id="ov-pin" v-model="pinID" class="ot-select" aria-label="Primary result"><option value="">Use Commander selection</option><option v-for="o in selected.resultOptions" :key="o.observableID" :value="o.observableID">{{ o.name }}</option></select></div>
          <div v-if="pinID" class="ot-field"><label for="ov-dir">Favourable direction</label>
            <select id="ov-dir" v-model="pinDirection" class="ot-select" aria-label="Favourable direction"><option value="higher">Higher</option><option value="lower">Lower</option><option value="neutral">Neutral</option></select></div>
        </div>
        <p v-if="dialogError" class="ov-error" role="alert">{{ dialogError }}</p>
      </div>
      <template #footer>
        <button class="ot-btn" :disabled="busy" @click="savePin">{{ busy ? 'Saving…' : 'Save selection' }}</button>
        <NuxtLink v-if="selected" :to="`/projects/${selected.projectID}`" class="ot-btn primary">Open workspace ↗</NuxtLink>
      </template>
    </OmniTraderDrawer>

    <OmniTraderDrawer :open="overlay === 'attention'" title="Needs attention" :subtitle="`${attentionItems.length} item${attentionItems.length === 1 ? '' : 's'}`" @close="closeOverlay">
      <p v-if="!attentionItems.length" class="pj-muted">No intervention needed.</p>
      <ul class="ov-attention attention-list">
        <li v-for="item in attentionItems" :key="item.projectID + item.kind">
          <span class="ot-chip" :class="item.kind === 'blocked' ? 'bad' : 'warn'">{{ item.kind }}</span>
          <NuxtLink :to="`/projects/${item.projectID}`">{{ item.name }}</NuxtLink>
          <span class="pj-muted">{{ item.label }}</span>
        </li>
      </ul>
    </OmniTraderDrawer>

    <OmniTraderDrawer :open="overlay === 'settings'" title="System defaults" subtitle="What every NEW project inherits — existing projects are unaffected" wide @close="closeOverlay">
      <ProjectsSettingsPanel system />
    </OmniTraderDrawer>

    <div v-if="overlay === 'broadcast'" class="ot-modal-backdrop" @click.self="closeOverlay">
      <section class="ot-modal ov-broadcast" role="dialog" aria-modal="true" aria-label="Broadcast to every project">
        <header><h3>Broadcast to every project</h3><button class="ot-btn ghost sm" aria-label="Close dialog" @click="closeOverlay">Close ✕</button></header>
        <form class="body" @submit.prevent="sendBroadcast">
          <p class="pj-muted">Sent to every live project's Commander. Shelved and completed projects are skipped; paused Commanders receive it on their next wake.</p>
          <div class="ot-field"><label for="ov-broadcast-text">Message</label><textarea id="ov-broadcast-text" v-model="broadcast" class="ot-input" rows="5" required :disabled="busy"></textarea></div>
          <p v-if="dialogError" class="ov-error" role="alert">{{ dialogError }}</p>
        </form>
        <footer>
          <button class="ot-btn ghost" type="button" @click="closeOverlay">Cancel</button>
          <button class="ot-btn primary" :disabled="busy || !broadcast.trim()" @click="sendBroadcast">{{ busy ? 'Sending…' : 'Send to all' }}</button>
        </footer>
      </section>
    </div>
  </ProjectsShell>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useProjectsOverview, type OverviewProject, type OverviewResult } from '~/composables/useProjectsOverview';
import { pjAgo, pjMoney, pjNumber, pjStatusLabel, pjStatusTone, pjTime } from '~/composables/useProjectsUi';
import ProjectsShell from '~/components/Projects/Shell.vue';
import ProjectsSettingsPanel from '~/components/Projects/SettingsPanel.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Projects · Operations' });

const { range, data, loading, loadingMessage, refreshing, error, now, connected, refresh } = useProjectsOverview();
const live = computed(() => data.value?.projects.filter(p => p.status !== 'Archived') ?? []);
const archived = computed(() => data.value?.projects.filter(p => p.status === 'Archived') ?? []);
const displayRange = computed(() => data.value?.range.key.toUpperCase() ?? range.value.toUpperCase());
const haltedCount = computed(() => live.value.filter(p => p.halted).length);
const shelved = ref(false), search = ref(''), sort = ref('attention');
const needsAttention = (p: OverviewProject) => p.pendingApprovals > 0 || !!p.blocker || ['Blocked', 'BudgetPaused'].includes(p.status);

const subtitle = computed(() => !data.value ? 'Every project the task forces are running, live.'
  : `${data.value.workingProjects} of ${live.value.length} projects have agents working right now${data.value.attention.length ? ` · ${data.value.attention.length} need your attention` : ''}.`);
const shellStatus = computed(() => !data.value ? '' : `${data.value.workingProjects} working · ${live.value.length} live${data.value.attention.length ? ` · ${data.value.attention.length} need attention` : ''}`);
const shellTone = computed(() => cacheHalt.value?.engaged ? 'bad' : (data.value?.attention.length ?? 0) > 0 ? 'warn' : 'ok');

// Stable order: re-sorting on every live refresh made rows jump under the cursor. The order is set
// when the sort changes, and new projects are appended.
const order = ref<string[]>([]);
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
watch(sort, resetOrder);
const filtered = computed(() => {
  const positions = new Map(order.value.map((id, i) => [id, i]));
  return (shelved.value ? archived.value : live.value).filter(p => p.name.toLowerCase().includes(search.value.toLowerCase()))
    .sort((a, b) => (positions.get(a.projectID) ?? Infinity) - (positions.get(b.projectID) ?? Infinity));
});

const budgetPct = (p: OverviewProject) => p.tokenBudgetUsd > 0 ? Math.min(100, Math.max(0, 100 * p.tokenSpendUsd / p.tokenBudgetUsd)) : 0;
const resultValue = (r: OverviewResult) => r.value == null ? '—' : (r.format === 'Currency' ? pjMoney(r.value) : pjNumber(r.value)) + (r.format === 'Percent' ? '%' : r.unit ? ` ${r.unit}` : '');
const resultMeta = (r: OverviewResult) => r.value == null ? 'Measurement unavailable' : r.selection === 'fallback' ? `${displayRange.value} · fallback` : r.stale ? 'Stale measurement' : r.validity !== 'Valid' ? (r.validity === 'Invalid' ? 'Invalid measurement' : 'Unverified measurement') : `${r.selection === 'pinned' ? 'Your selection' : 'Commander selection'} · ${pjAgo(r.observedAt, now.value)}`;
const deltaClass = (r: OverviewResult) => r.stale || r.validity !== 'Valid' || r.delta == null || r.delta === 0 || r.direction === 'neutral' ? 'neutral' : (r.delta > 0) === (r.direction === 'higher') ? 'favourable' : 'unfavourable';
const activitySummary = (p: OverviewProject) => `${p.name}, ${displayRange.value}: ${p.series.reduce((n,s) => n+s.completed,0)} completed, ${p.series.reduce((n,s) => n+s.failed,0)} failed, ${p.series.reduce((n,s) => n+s.deferred,0)} deferred, ${p.series.reduce((n,s) => n+s.cancelled,0)} cancelled wakes; empty intervals have no recorded outcomes.`;

const overlay = ref(''), busy = ref(false), dialogError = ref(''), actionMessage = ref(''), broadcast = ref('');
const selectedID = ref(''), inspectorIDs = ref<string[]>([]), pinID = ref(''), pinDirection = ref('neutral');
const selected = computed(() => data.value?.projects.find(p => p.projectID === selectedID.value));
const inspectorProjects = computed(() => live.value.filter(p => inspectorIDs.value.includes(p.projectID)));
function syncPin() { pinID.value = selected.value?.result.selection === 'pinned' ? selected.value.result.observableID ?? '' : ''; pinDirection.value = selected.value?.result.direction ?? 'neutral'; }
watch(selectedID, syncPin);
function openOverlay(kind: string) { overlay.value = kind; dialogError.value = ''; }
function closeOverlay() { overlay.value = ''; }
function openInspector(ids: string[]) { inspectorIDs.value = ids; selectedID.value = ids[0] ?? ''; syncPin(); openOverlay('inspector'); }
const attentionProject = ref('');
const attentionItems = computed(() => (data.value?.attention ?? []).filter(a => !attentionProject.value || a.projectID === attentionProject.value));
function openAttention(id = '') { attentionProject.value = id; openOverlay('attention'); }
function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && overlay.value === 'broadcast') closeOverlay(); }
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

async function post(path: string, body: unknown = {}) { const res = await RequestPOSTFromKliveAPI(path, JSON.stringify(body), false, true); if (!res.ok) throw new Error(`Action failed (HTTP ${res.status}).`); return res.json().catch(() => ({})); }
async function fleetAction() { if (busy.value) return; busy.value = true; actionMessage.value = ''; try { const restoring = haltedCount.value > 0; const response = await post(restoring ? '/projects/unhalt-all' : '/projects/halt-all'); actionMessage.value = restoring ? `Restored ${response.restored ?? ''} project(s).` : `Halted ${response.halted ?? ''} project(s).`; await refresh(); } catch(e: any) { actionMessage.value = e.message; } finally { busy.value = false; } }
async function unarchive(projectID: string) { busy.value = true; try { await post('/projects/unarchive', { projectID }); await refresh(); actionMessage.value = 'Project unshelved.'; } catch(e: any) { actionMessage.value = e.message; } finally { busy.value = false; } }

// The prompt-cache kill switch is a separate latch from the manual fleet halt, so it has its own control.
type CacheHaltState = { engaged: boolean; engagedAt: string | null; reason: string; haltedProjectIDs: string[] | null };
type CacheWindow = { weightedHitRatePct: number; measuredRequests: number };
const cacheHalt = ref<CacheHaltState | null>(null), cacheWindow = ref<CacheWindow | null>(null);
async function loadCacheHealth() {
  try {
    const res = await RequestGETFromKliveAPI('/projects/cache-health', false, false);
    if (!res.ok) return;
    const body = await res.json();
    cacheHalt.value = body?.halt ?? null;
    cacheWindow.value = body?.window ?? null;
  } catch { /* leave the last known state in place */ }
}
async function clearCacheHalt(unhalt: boolean) {
  if (busy.value) return; busy.value = true; actionMessage.value = '';
  try {
    const response = await post('/projects/cache-health/clear', { unhalt });
    cacheHalt.value = response?.halt ?? null;
    actionMessage.value = unhalt
      ? `Prompt-cache halt cleared; ${response?.restored ?? 0} project(s) restored to their pre-halt status.`
      : 'Prompt-cache halt cleared. Projects stay halted until you unhalt them.';
    await Promise.all([refresh(), loadCacheHealth()]);
  } catch(e: any) { actionMessage.value = e.message; } finally { busy.value = false; }
}
onMounted(loadCacheHealth);
watch(data, () => { void loadCacheHealth(); });
async function sendBroadcast() { if (busy.value || !broadcast.value.trim()) return; busy.value = true; try { const response = await post('/projects/broadcast', { text: broadcast.value.trim() }); closeOverlay(); broadcast.value = ''; actionMessage.value = `Broadcast delivered to ${response.delivered ?? '?'} project(s).`; } catch(e: any) { dialogError.value = e.message; } finally { busy.value = false; } }
async function savePin() { if (!selected.value || busy.value) return; busy.value = true; dialogError.value = ''; try { await post('/projects/result-pin', { projectID: selected.value.projectID, observableID: pinID.value || null, direction: pinDirection.value }); await refresh(); } catch(e: any) { dialogError.value = e.message; } finally { busy.value = false; } }
</script>

<style scoped>
.grow { flex: 1 1 auto; }
/* The site's global button centres its content; a KPI tile reads left-aligned like its siblings. */
.attention-summary { text-align: left; cursor: pointer; font: inherit; align-items: stretch; justify-content: flex-start; }
.cache-halt-copy p { margin: 2px 0; font-size: 12.5px; }
.cache-halt-copy small { font-size: 11.5px; color: var(--ot-text-2); }
.ov-attention { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ot-space-2); font-size: 13px; }
.ov-attention li { display: grid; grid-template-columns: auto minmax(120px, auto) minmax(0, 1fr); gap: var(--ot-space-2); align-items: center; }
.ov-attention a { color: var(--ot-text); font-weight: 600; text-decoration: none; }
.ov-attention a:hover { color: var(--ot-accent); }
.ov-search { min-width: 200px; }
.ov-table td { padding-top: var(--ot-space-2); padding-bottom: var(--ot-space-2); height: auto; }
.ov-table th:nth-child(1) { width: 22%; } .ov-table th:nth-child(2) { width: 26%; } .ov-table th:nth-child(3) { width: 24%; }
.ov-project a { color: var(--ot-text); font-weight: 600; text-decoration: none; display: block; max-width: 34ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-project a:hover { color: var(--ot-accent); }
.ov-state { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
.ov-inline-attention { cursor: pointer; }
.ov-work .work-title { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 48ch; font-size: 12.5px; }
.ov-work .sub { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.working { color: var(--ot-positive); }
.result-cell { display: flex; align-items: center; justify-content: space-between; gap: var(--ot-space-2); width: 100%; text-align: left; cursor: pointer; color: inherit; }
.result-cell:hover strong { color: var(--ot-accent); }
.result-copy { min-width: 0; display: flex; flex-direction: column; }
.result-copy .sub { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.result-value strong { font-size: 18px; font-weight: 600; font-family: var(--ot-mono); }
.delta { font-size: 11px; margin-left: 6px; font-family: var(--ot-mono); }
.result-meta.warning { color: var(--ot-warning); }
.favourable { color: var(--ot-positive); } .unfavourable { color: var(--ot-negative); } .neutral { color: var(--ot-text-2); }
.result-cell :deep(.result-spark) { width: 84px; height: 28px; flex-shrink: 0; }
.activity-strip { display: flex; height: 18px; align-items: stretch; gap: 2px; min-width: 120px; }
.activity-bin { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 1px; background: rgba(255, 255, 255, 0.05); }
.activity-bin i { min-height: 2px; }
.completed { background: var(--ot-positive); } .failed { background: var(--ot-negative); } .deferred { background: var(--ot-warning); } .cancelled { background: var(--ot-violet); }
.cell-loading { color: var(--ot-warning) !important; }
.ov-unshelve { margin-top: 4px; }
.ov-cost strong { font-family: var(--ot-mono); font-size: 13.5px; }
.budget-track { display: block; height: 3px; width: 100%; min-width: 80px; background: rgba(255,255,255,0.07); margin: 5px 0 3px auto; border-radius: 2px; overflow: hidden; }
.budget-track i { display: block; height: 3px; background: var(--ot-positive); }
.budget-track i.warning { background: var(--ot-warning); }
.ov-footer { display: flex; justify-content: space-between; gap: var(--ot-space-3); flex-wrap: wrap; }
.outcome-legend { display: flex; gap: var(--ot-space-3); }
.completed-t { color: var(--ot-positive); } .failed-t { color: var(--ot-negative); } .deferred-t { color: var(--ot-warning); } .cancelled-t { color: var(--ot-violet); }
.inspector { display: flex; flex-direction: column; gap: var(--ot-space-4); }
.inspector-result { display: flex; justify-content: space-between; align-items: center; border-block: 1px solid var(--ot-line); padding: var(--ot-space-3) 0; }
.inspector-result > div { display: flex; flex-direction: column; }
.inspector-result strong { font-size: 30px; line-height: 36px; font-family: var(--ot-mono); color: var(--ot-accent); }
.inspector-result small { font-size: 12px; color: var(--ot-muted); }
.inspector-result :deep(svg) { width: 180px; height: 60px; color: var(--ot-positive); }
.ov-error { color: var(--ot-negative); font-size: 12.5px; margin: 0; }
.ov-broadcast { width: min(620px, 100%); }
.ov-broadcast .body { display: flex; flex-direction: column; gap: var(--ot-space-3); }
@media (max-width: 860px) {
  .ov-table thead { display: none; }
  .ov-table, .ov-table tbody, .ov-table tr, .ov-table td { display: block; width: 100%; }
  .ov-table tr { padding: var(--ot-space-2) var(--ot-space-3); border-bottom: 1px solid var(--ot-line); }
  .ov-table td { border: 0; padding: 4px 0 !important; text-align: left; }
  .ov-table td.num { text-align: left; }
  .budget-track { margin-left: 0; max-width: 180px; }
  .ov-attention li { grid-template-columns: auto minmax(0, 1fr); }
  .ov-attention li .pj-muted { grid-column: 1 / -1; }
}
</style>
