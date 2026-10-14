<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <h1><span class="code">ALPHA</span>Alpha Lab</h1>
            <div class="ot-actions">
                <span class="ot-chip" :class="overview?.AgentBusy ? 'info' : ''"><span class="ot-dot" :class="overview?.AgentBusy ? 'live' : ''"></span>{{ overview?.AgentBusy ? 'agent analysing' : 'agent idle' }}</span>
                <span class="mono muted small">ingest {{ fmtAge(overview?.LastIngestUtc) }} · dispatch {{ fmtAge(overview?.LastDispatchUtc) }}</span>
                <button class="ot-btn sm" :disabled="busy" @click="ingest">Ingest now</button>
                <button class="ot-btn sm primary" :disabled="busy || overview?.AgentBusy" @click="dispatch()">Analyse next batch</button>
                <button class="ot-btn sm ghost" @click="addOpen = true">+ Paper</button>
            </div>
        </div>

        <div class="ot-statbar">
            <div v-for="s in PAPER_STATES" :key="s" class="ot-stat clickable" @click="state.tab = 'papers'; state.status = s"><span class="k">{{ s }}</span><span class="v">{{ overview?.Papers?.[s] ?? 0 }}</span><span class="s">papers</span></div>
            <div v-for="s in CAND_STATES" :key="s" class="ot-stat clickable" @click="state.tab = 'candidates'; state.cstatus = s"><span class="k">{{ s }}</span><span class="v" :class="!overview?.Candidates?.[s] ? '' : s === 'Promising' ? 'pos' : s === 'Rejected' || s === 'Failed' ? 'neg' : ''">{{ overview?.Candidates?.[s] ?? 0 }}</span><span class="s">candidates</span></div>
        </div>

        <nav class="ot-tabs">
            <button v-for="t in TABS" :key="t" type="button" :aria-selected="state.tab === t" @click="state.tab = t">{{ t }}</button>
        </nav>

        <!-- papers -->
        <template v-if="state.tab === 'papers'">
            <div class="ot-toolbar">
                <select v-model="state.status" class="ot-select sm auto"><option value="">any status</option><option v-for="s in PAPER_STATES" :key="s" :value="s">{{ s }}</option></select>
                <input v-model="paperQ" class="ot-input sm" placeholder="search titles & abstracts" @keydown.enter="state.q = paperQ" />
                <label class="inline">min relevance <input v-model.number="state.minRel" class="ot-input sm num rel" type="number" min="0" max="100" /></label>
                <div class="ot-segment sm"><button v-for="o in [['n1', 'relevance'], ['t1', 'published'], ['updated', 'updated']]" :key="o[0]" type="button" :aria-pressed="state.order === o[0]" @click="state.order = o[0]">{{ o[1] }}</button></div>
                <span class="grow"></span>
                <span class="summary">{{ papers.length }} / {{ papersTotal }}</span>
            </div>
            <OtPanel title="Papers" flush :loading="loadingPapers && !papers.length" :error="papersError" :empty="!papers.length" :collapsible="false">
                <OtGrid :rows="papers" :columns="paperCols" grid-key="alpha.papers" selectable :selected-key="state.paper" :row-key="(r: any) => r.Id" max-height="calc(100vh - 290px)" @select="(r: any) => (state.paper = r.Id)">
                    <template #cell-Title="{ row }">
                        <span class="cellstack"><span class="ttl">{{ row.Starred ? '★ ' : '' }}{{ row.Title }}</span><span class="sub">{{ (row.Authors ?? []).join(', ') }}</span></span>
                    </template>
                    <template #cell-Families="{ row }"><span class="chips"><span v-for="f in row.Families" :key="f" class="ot-chip">{{ f }}</span></span></template>
                    <template #cell-Status="{ row }"><span class="ot-chip" :class="paperTone(row.Status)">{{ row.Status }}</span></template>
                </OtGrid>
                <div v-if="papers.length < papersTotal" class="more"><button class="ot-btn sm ghost" type="button" @click="paperLimit += 200; loadPapers()">Load more</button></div>
            </OtPanel>
        </template>

        <!-- candidates -->
        <template v-else-if="state.tab === 'candidates'">
            <div class="ot-toolbar">
                <select v-model="state.cstatus" class="ot-select sm auto"><option value="">any status</option><option v-for="s in CAND_STATES" :key="s" :value="s">{{ s }}</option></select>
                <span class="grow"></span>
                <button class="ot-btn ghost sm" @click="loadCandidates">↻</button>
            </div>
            <OtPanel title="Candidates" flush :loading="loadingCands && !candidates.length" :empty="!candidates.length" :collapsible="false">
                <OtGrid :rows="candidates" :columns="candCols" grid-key="alpha.cands" selectable :selected-key="state.candidate" :row-key="(r: any) => r.Id" default-sort="Score"
                        max-height="calc(100vh - 290px)" @select="(r: any) => (state.candidate = r.Id)">
                    <template #cell-Status="{ row }"><span class="ot-chip" :class="candTone(row.Status)">{{ row.Status }}</span></template>
                </OtGrid>
            </OtPanel>
        </template>

        <!-- runs -->
        <OtPanel v-else-if="state.tab === 'runs'" title="Runs" flush :empty="!runs.length" :collapsible="false">
            <OtGrid :rows="runs" :columns="runCols" grid-key="alpha.runs" :row-key="(r: any) => r.Id" default-sort="StartedUtc" />
        </OtPanel>

        <!-- settings -->
        <OtPanel v-else-if="state.tab === 'settings'" title="Settings" :collapsible="false">
            <div v-if="settings" class="settings">
                <div class="toggles">
                    <label v-for="t in TOGGLES" :key="t.key" class="ot-check"><input v-model="settings[t.key]" type="checkbox" /> {{ t.label }}</label>
                </div>
                <div class="ot-formgrid">
                    <label v-for="n in NUMBERS" :key="n.key" class="ot-field"><span class="lbl">{{ n.label }}</span><input v-model.number="settings[n.key]" class="ot-input sm num" type="number" :step="n.step ?? 1" /></label>
                </div>
                <div class="ot-grid two">
                    <label v-for="l in LISTS" :key="l.key" class="ot-field"><span class="lbl">{{ l.label }}</span>
                        <textarea class="ot-input mono" rows="6" :value="(settings[l.key] ?? []).join('\n')" @change="settings[l.key] = ($event.target as HTMLTextAreaElement).value.split('\n').map(s => s.trim()).filter(Boolean)"></textarea>
                    </label>
                </div>
                <div class="acts">
                    <button class="ot-btn primary" :disabled="busy" @click="saveSettings">Save</button>
                    <button class="ot-btn ghost" @click="loadOverview">Revert</button>
                </div>
            </div>
        </OtPanel>

        <!-- paper drawer -->
        <OmniTraderDrawer :open="!!state.paper" wide :title="paper?.Paper?.Title ?? 'Paper'" :subtitle="paper ? `${paper.Paper.Id} · ${fmtDay10(paper.Paper.PublishedUtc)} · ${paper.Paper.Venue ?? ''}` : ''" @close="state.paper = ''">
            <template v-if="paper">
                <div class="ot-statbar">
                    <div class="ot-stat"><span class="k">Relevance</span><span class="v">{{ fmtN(paper.Paper.Relevance, 0) }}</span></div>
                    <div class="ot-stat"><span class="k">Feasibility</span><span class="v">{{ fmtN(paper.Paper.Feasibility, 0) }}</span></div>
                    <div class="ot-stat"><span class="k">Status</span><span class="v">{{ paper.Paper.Status }}</span></div>
                    <div class="ot-stat"><span class="k">Attempts</span><span class="v">{{ paper.Paper.Attempts }}</span></div>
                    <div class="ot-stat"><span class="k">Citations</span><span class="v">{{ paper.Paper.Citations ?? '—' }}</span></div>
                </div>
                <div class="links">
                    <a :href="paper.Paper.Url" target="_blank" rel="noopener" class="ot-btn sm">Abstract page</a>
                    <a v-if="paper.Paper.PdfUrl" :href="paper.Paper.PdfUrl" target="_blank" rel="noopener" class="ot-btn sm">PDF</a>
                    <span class="chips"><span v-for="f in paper.Paper.Families" :key="f" class="ot-chip accent">{{ f }}</span><span v-for="a in paper.Paper.AssetClasses" :key="a" class="ot-chip info">{{ a }}</span><span v-for="d in paper.Paper.DataNeeds" :key="d" class="ot-chip">{{ d }}</span></span>
                </div>
                <p class="authors muted">{{ (paper.Paper.Authors ?? []).join(', ') }}</p>
                <p class="abstract">{{ paper.Paper.Abstract }}</p>
                <div v-if="paper.Paper.Verdict || paper.Paper.Notes" class="verdict">
                    <h4 class="ot-sectionhead">Verdict · {{ paper.Paper.AnalysedBy ?? '' }} {{ fmtAge(paper.Paper.AnalysedUtc) }}</h4>
                    <div class="mono">{{ paper.Paper.Verdict }}</div>
                    <p v-if="paper.Paper.Notes" class="notes">{{ paper.Paper.Notes }}</p>
                </div>
                <h4 v-if="paper.Candidates?.length" class="ot-sectionhead">Candidates</h4>
                <OtGrid v-if="paper.Candidates?.length" :rows="paper.Candidates" :columns="candCols" bare selectable :row-key="(r: any) => r.Id" @select="(r: any) => { state.paper = ''; state.tab = 'candidates'; state.candidate = r.Id; }" />
                <div class="matched muted small mono">matched: {{ (paper.Paper.Matched ?? []).join(' · ') }}</div>
            </template>
            <template #footer>
                <button class="ot-btn" type="button" :disabled="!paper" @click="star">{{ paper?.Paper?.Starred ? 'Unstar' : 'Star' }}</button>
                <button class="ot-btn" type="button" :disabled="!paper" @click="verdict('rejected')">Reject…</button>
                <button class="ot-btn" type="button" :disabled="!paper" @click="verdict('queued')">Requeue</button>
                <button class="ot-btn primary" type="button" :disabled="!paper || overview?.AgentBusy" @click="dispatch([paper.Paper.Id])">Analyse now</button>
            </template>
        </OmniTraderDrawer>

        <!-- candidate drawer -->
        <OmniTraderDrawer :open="!!state.candidate" wide :title="cand?.StrategyName ?? 'Candidate'" :subtitle="cand ? `${cand.Id} · ${cand.Status} · score ${fmtN(cand.Score, 0)}` : ''" @close="state.candidate = ''">
            <template v-if="cand">
                <p class="hyp">{{ cand.Hypothesis }}</p>
                <div class="links">
                    <NuxtLink class="ot-btn sm" :to="`/omnitrader/studio?id=${cand.StrategyId}`">Strategy v{{ cand.StrategyVersion }}</NuxtLink>
                    <NuxtLink v-if="primaryJob" class="ot-btn sm" :to="`/omnitrader/lab?job=${primaryJob}`">Primary backtest</NuxtLink>
                    <button v-if="cand.PaperId" class="ot-btn sm ghost" type="button" @click="state.candidate = ''; state.tab = 'papers'; state.paper = cand.PaperId">Paper</button>
                </div>
                <template v-if="cand.Evaluation">
                    <div v-if="cand.Evaluation.Error" class="ot-banner"><span class="glyph">⚠</span><span class="mono small">{{ cand.Evaluation.Error }}</span></div>
                    <div class="ot-statbar">
                        <div class="ot-stat"><span class="k">Score</span><span class="v" :class="(cand.Score ?? 0) >= 60 ? 'pos' : (cand.Score ?? 0) < 35 ? 'neg' : ''">{{ fmtN(cand.Score, 0) }}</span></div>
                        <div class="ot-stat"><span class="k">Sharpe</span><span class="v">{{ fmtN(cand.Evaluation.Primary?.Sharpe, 2) }}</span></div>
                        <div class="ot-stat"><span class="k">2× costs</span><span class="v" :class="tone(cand.Evaluation.PrimaryStressed?.ReturnPct)">{{ fmtChg(cand.Evaluation.PrimaryStressed?.ReturnPct, 1) }}</span></div>
                        <div class="ot-stat"><span class="k">OOS Sharpe</span><span class="v" :class="tone(cand.Evaluation.OutOfSample?.Sharpe)">{{ fmtN(cand.Evaluation.OutOfSample?.Sharpe, 2) }}</span></div>
                        <div class="ot-stat"><span class="k">WF eff.</span><span class="v">{{ fmtN(cand.Evaluation.WalkForwardEfficiency, 2) }}</span></div>
                        <div class="ot-stat"><span class="k">Deflated SR</span><span class="v">{{ fmtN(cand.Evaluation.DeflatedSharpe, 3) }}</span><span class="s">{{ cand.Evaluation.TrialsAccounted }} trials</span></div>
                        <div class="ot-stat"><span class="k">Breadth</span><span class="v">{{ cand.Evaluation.Batch?.Profitable ?? '—' }}/{{ cand.Evaluation.Batch?.Symbols ?? '—' }}</span></div>
                    </div>
                    <div class="ot-grid two">
                        <div>
                            <h4 class="ot-sectionhead">Score</h4>
                            <div class="ot-bars">
                                <div v-for="(v, k) in cand.Evaluation.ScoreParts" :key="k" class="ot-bar">
                                    <span class="lbl">{{ k }}</span>
                                    <span class="track"><span class="zero" style="left: 30%"></span><span class="fill" :class="Number(v) >= 0 ? 'pos' : 'neg'" :style="barStyle(Number(v))"></span></span>
                                    <span class="val">{{ fmtSignedN(Number(v), 1) }}</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <h4 class="ot-sectionhead">Findings</h4>
                            <ul class="findings"><li v-for="f in cand.Evaluation.Findings" :key="f" class="mono">{{ f }}</li></ul>
                        </div>
                    </div>
                    <h4 class="ot-sectionhead">Per symbol</h4>
                    <OtGrid :rows="perSymbol" :columns="perSymbolCols" bare :row-key="(r: any) => r.Symbol" />
                </template>
                <div v-else class="ot-state compact"><span class="muted">{{ cand.Status === 'Evaluating' ? 'Evaluating…' : 'Not evaluated yet' }}</span></div>
            </template>
            <template #footer>
                <button class="ot-btn" type="button" @click="reevaluate">Re-evaluate</button>
                <button class="ot-btn danger" type="button" @click="setCandStatus('Rejected')">Reject</button>
                <button class="ot-btn ok" type="button" @click="setCandStatus('Promoted')">Promote</button>
            </template>
        </OmniTraderDrawer>

        <!-- add paper -->
        <OmniTraderDrawer :open="addOpen" title="Add paper" @close="addOpen = false">
            <div class="form">
                <label class="ot-field"><span class="lbl">Title</span><input v-model="addForm.Title" class="ot-input sm" /></label>
                <label class="ot-field"><span class="lbl">URL</span><input v-model="addForm.Url" class="ot-input sm mono" /></label>
                <label class="ot-field"><span class="lbl">Abstract</span><textarea v-model="addForm.Abstract" class="ot-input" rows="10"></textarea></label>
            </div>
            <template #footer><button class="ot-btn primary" type="button" :disabled="!addForm.Title" @click="addPaper">Add &amp; queue</button></template>
        </OmniTraderDrawer>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import { useUrlState } from '~/composables/useOmniTrader';
import { SWAL_TERMINAL, clone, fmtAge, fmtChg, fmtDay10, fmtN, fmtSignedN, tGet, tPost, tone, useTicker } from '~/composables/useTerminal';
import type { GridColumn } from '~/components/Ot/Grid.vue';

definePageMeta({ layout: 'navbar' });

const TABS = ['papers', 'candidates', 'runs', 'settings'];
const PAPER_STATES = ['New', 'Queued', 'Analysing', 'Analysed', 'Implemented', 'Rejected'];
const CAND_STATES = ['Evaluating', 'Promising', 'Weak', 'Rejected', 'Promoted'];
const { state } = useUrlState({ tab: 'papers', status: '', q: '', minRel: '', order: 'n1', paper: '', candidate: '', cstatus: '' });
const paperQ = ref(state.q);
const busy = ref(false);

const overview = ref<any>(null);
const settings = ref<any>(null);
async function loadOverview() {
    try { overview.value = await tGet<any>('/alpha/overview'); settings.value = clone(overview.value.Settings); } catch { /* the tabs still load */ }
}
useTicker(loadOverview, 30_000);

// papers
const papers = ref<any[]>([]);
const papersTotal = ref(0);
const paperLimit = ref(200);
const loadingPapers = ref(false);
const papersError = ref<string | null>(null);
async function loadPapers() {
    loadingPapers.value = true;
    try {
        const r = await tGet<any>('/alpha/papers', { status: state.status || undefined, q: state.q || undefined, minRelevance: state.minRel || undefined, orderBy: state.order, limit: paperLimit.value });
        papers.value = r.Rows ?? [];
        papersTotal.value = r.Total ?? papers.value.length;
        papersError.value = null;
    } catch (e: any) { papersError.value = e?.message ?? 'failed'; }
    finally { loadingPapers.value = false; }
}
watch(() => [state.status, state.q, state.minRel, state.order], () => void loadPapers());
const paperCols: GridColumn[] = [
    { key: 'PublishedUtc', label: 'Published', format: 'date' }, { key: 'Title', label: 'Paper', format: 'text' },
    { key: 'Relevance', label: 'Rel', format: 'int', heat: 'seq', heatValue: r => (r.Relevance == null ? null : r.Relevance / 100) },
    { key: 'Feasibility', label: 'Feas', format: 'int' }, { key: 'Families', label: 'Families', format: 'text', sortable: false, clip: 200 },
    { key: 'AssetClasses', label: 'Assets', format: 'text', value: r => (r.AssetClasses ?? []).join(' '), hidden: true },
    { key: 'DataNeeds', label: 'Data', format: 'text', value: r => (r.DataNeeds ?? []).join(' '), hidden: true },
    { key: 'Source', label: 'Src', format: 'text', hidden: true }, { key: 'Venue', label: 'Venue', format: 'text', hidden: true },
    { key: 'Status', label: 'Status', format: 'text' }, { key: 'Candidates', label: 'Cand.', format: 'int' }, { key: 'DiscoveredUtc', label: 'Found', format: 'age', hidden: true },
];
function paperTone(s: string) { return ({ Implemented: 'ok', Rejected: 'bad', Analysing: 'info', Queued: 'warn' } as Record<string, string>)[s] ?? ''; }

const paper = ref<any>(null);
watch(() => state.paper, async id => {
    paper.value = null;
    if (id) try { paper.value = await tGet<any>('/alpha/paper', { id }); } catch { paper.value = null; }
}, { immediate: true });

async function star() {
    await tPost('/alpha/paper/star', undefined, { id: paper.value.Paper.Id, starred: !paper.value.Paper.Starred });
    paper.value = await tGet<any>('/alpha/paper', { id: state.paper });
    void loadPapers();
}
async function verdict(v: string) {
    let notes: string | undefined;
    if (v === 'rejected') {
        const r = await Swal.fire({ title: 'Reject — reason', input: 'text', showCancelButton: true, ...SWAL_TERMINAL });
        if (!r.isConfirmed) return;
        notes = r.value;
    }
    await tPost('/alpha/paper/verdict', { Id: paper.value.Paper.Id, Verdict: v, Notes: notes });
    paper.value = await tGet<any>('/alpha/paper', { id: state.paper });
    void loadPapers();
    void loadOverview();
}
async function dispatch(ids?: string[]) {
    busy.value = true;
    try {
        const r = await tPost<any>('/alpha/analyse', { Ids: ids ?? null });
        void Swal.fire({ title: r.Started ? 'Sent to KliveAgent' : 'Not started', text: r.Started ? `${r.Run?.PaperIds?.length ?? 0} paper(s)` : r.Reason, icon: r.Started ? 'success' : 'info', ...SWAL_TERMINAL, timer: 2200 });
        await loadOverview();
    } catch (e: any) { void Swal.fire({ title: 'Failed', text: e?.message, icon: 'error', ...SWAL_TERMINAL }); }
    finally { busy.value = false; }
}
async function ingest() {
    busy.value = true;
    try {
        const r = await tPost<any>('/alpha/ingest');
        void Swal.fire({ title: 'Ingest', text: r.Summary ?? r.Error ?? r.Status, icon: r.Status === 'done' ? 'success' : 'warning', ...SWAL_TERMINAL });
        await Promise.all([loadOverview(), loadPapers()]);
    } catch (e: any) { void Swal.fire({ title: 'Failed', text: e?.message, icon: 'error', ...SWAL_TERMINAL }); }
    finally { busy.value = false; }
}

// candidates
const candidates = ref<any[]>([]);
const loadingCands = ref(false);
async function loadCandidates() {
    loadingCands.value = true;
    try { candidates.value = await tGet<any[]>('/alpha/candidates', { status: state.cstatus || undefined, limit: 500 }) ?? []; }
    finally { loadingCands.value = false; }
}
watch(() => state.cstatus, () => void loadCandidates());
const candCols: GridColumn[] = [
    { key: 'Score', label: 'Score', format: 'int', heat: 'seq', heatValue: r => (r.Score == null ? null : r.Score / 100) },
    { key: 'Status', label: 'Status', format: 'text' }, { key: 'StrategyName', label: 'Strategy', format: 'text' }, { key: 'PaperTitle', label: 'Paper', format: 'text', clip: 300 },
    { key: 'Sharpe', label: 'Sharpe', format: 'num' }, { key: 'OosSharpe', label: 'OOS', format: 'num' }, { key: 'DeflatedSharpe', label: 'DSR', format: 'num', decimals: 3 },
    { key: 'ReturnPct', label: 'Return', format: 'chg', decimals: 1, heat: 50 }, { key: 'MaxDrawdownPct', label: 'Max DD', format: 'pct', decimals: 1 },
    { key: 'StressedSharpe', label: '2× cost SR', format: 'num', hidden: true }, { key: 'Trades', label: 'Trades', format: 'int' },
    { key: 'Profitable', label: 'Breadth', format: 'text', value: r => (r.Symbols ? `${r.Profitable}/${r.Symbols}` : null) },
    { key: 'SubmittedBy', label: 'By', format: 'text', hidden: true }, { key: 'UpdatedUtc', label: 'Updated', format: 'age' },
];
function candTone(s: string) { return ({ Promising: 'ok', Promoted: 'accent', Weak: 'warn', Rejected: 'bad', Failed: 'bad', Evaluating: 'info' } as Record<string, string>)[s] ?? ''; }

const cand = ref<any>(null);
watch(() => state.candidate, async id => {
    cand.value = null;
    if (id) try { cand.value = await tGet<any>('/alpha/candidate', { id }); } catch { cand.value = null; }
}, { immediate: true });
const primaryJob = computed(() => cand.value?.Evaluation?.Findings?.find((f: string) => f.startsWith('primary job '))?.slice('primary job '.length) ?? null);
const perSymbol = computed(() => (cand.value?.Evaluation?.PerSymbol ?? []).map((r: any) => ({ Symbol: r.Symbol, Error: r.Error, ...(r.Metrics ?? {}) })));
const perSymbolCols: GridColumn[] = [
    { key: 'Symbol', label: 'Symbol', format: 'sym' }, { key: 'ReturnPct', label: 'Return', format: 'chg', heat: 50, decimals: 1 }, { key: 'BenchmarkReturnPct', label: 'B&H', format: 'chg', decimals: 1 },
    { key: 'Sharpe', label: 'Sharpe', format: 'num' }, { key: 'MaxDrawdownPct', label: 'Max DD', format: 'pct', decimals: 1 }, { key: 'Trades', label: 'Trades', format: 'int' },
    { key: 'WinRatePct', label: 'Win', format: 'pct', decimals: 0 }, { key: 'Error', label: 'Error', format: 'text', class: r => (r.Error ? 'neg' : undefined), clip: 260 },
];
function barStyle(v: number) {
    const scale = 28;
    const w = Math.min(70, (Math.abs(v) / scale) * 70);
    return v >= 0 ? { left: '30%', width: `${w}%` } : { left: `${30 - Math.min(30, (Math.abs(v) / 12) * 30)}%`, width: `${Math.min(30, (Math.abs(v) / 12) * 30)}%` };
}
async function reevaluate() { await tPost('/alpha/candidate/reevaluate', undefined, { id: cand.value.Id }); cand.value = await tGet<any>('/alpha/candidate', { id: state.candidate }); void loadCandidates(); }
async function setCandStatus(status: string) {
    const r = await Swal.fire({ title: `${status} — note`, input: 'text', showCancelButton: true, ...SWAL_TERMINAL });
    if (!r.isConfirmed) return;
    await tPost('/alpha/candidate/status', { Id: cand.value.Id, Status: status, Notes: r.value || null });
    cand.value = await tGet<any>('/alpha/candidate', { id: state.candidate });
    void loadCandidates();
    void loadOverview();
}

// runs
const runs = ref<any[]>([]);
async function loadRuns() { runs.value = await tGet<any[]>('/alpha/runs', { limit: 200 }).catch(() => []) ?? []; }
const runCols: GridColumn[] = [
    { key: 'StartedUtc', label: 'Started', format: 'datetime' }, { key: 'Kind', label: 'Kind', format: 'text' }, { key: 'Trigger', label: 'Trigger', format: 'text' },
    { key: 'Status', label: 'Status', format: 'text', class: r => (r.Status === 'failed' ? 'neg' : r.Status === 'running' ? 'info-text' : '') },
    { key: 'DurationSec', label: 'Sec', format: 'int' }, { key: 'Found', label: 'Found', format: 'int' }, { key: 'Added', label: 'Added', format: 'int' },
    { key: 'Papers', label: 'Papers', format: 'int', value: r => r.PaperIds?.length ?? 0 }, { key: 'Summary', label: 'Summary', format: 'text', value: r => r.Error ?? r.Summary, clip: 380 },
    { key: 'ConversationId', label: 'Conversation', format: 'text', hidden: true },
];

// settings
const TOGGLES = [
    { key: 'Enabled', label: 'Alpha Lab on' }, { key: 'IngestEnabled', label: 'Fetch papers' }, { key: 'UseArxiv', label: 'arXiv' }, { key: 'UseOpenAlex', label: 'OpenAlex' },
    { key: 'AgentEnabled', label: 'KliveAgent analysis' }, { key: 'AutoEvaluate', label: 'Auto-evaluate candidates' }, { key: 'NotifyPromising', label: 'Discord on promising' },
];
const NUMBERS = [
    { key: 'IngestEveryHours', label: 'Ingest every h', step: 0.5 }, { key: 'AnalyseEveryHours', label: 'Analyse every h', step: 0.5 }, { key: 'PapersPerRun', label: 'Papers per run' },
    { key: 'MaxAgentRunsPerDay', label: 'Agent runs / day' }, { key: 'MinRelevance', label: 'Min relevance' }, { key: 'MinFeasibility', label: 'Min feasibility' },
    { key: 'LookbackDays', label: 'Lookback days' }, { key: 'EvaluationBars', label: 'Evaluation bars' }, { key: 'PromisingScore', label: 'Promising ≥' }, { key: 'RejectScore', label: 'Reject <' },
];
const LISTS = [
    { key: 'Queries', label: 'Search queries' }, { key: 'ArxivCategories', label: 'arXiv categories' },
    { key: 'CryptoTestSymbols', label: 'Crypto test basket' }, { key: 'EquityTestSymbols', label: 'Equity test basket' },
];
async function saveSettings() {
    busy.value = true;
    try { await tPost('/alpha/settings', settings.value); await loadOverview(); }
    catch (e: any) { void Swal.fire({ title: 'Not saved', text: e?.message, icon: 'error', ...SWAL_TERMINAL }); }
    finally { busy.value = false; }
}

// add paper
const addOpen = ref(false);
const addForm = reactive({ Title: '', Abstract: '', Url: '' });
async function addPaper() {
    const p = await tPost<any>('/alpha/paper/add', { ...addForm });
    addOpen.value = false;
    addForm.Title = addForm.Abstract = addForm.Url = '';
    state.tab = 'papers';
    state.paper = p.Id;
    void loadPapers();
}

watch(() => state.tab, t => {
    if (t === 'papers') void loadPapers();
    else if (t === 'candidates') void loadCandidates();
    else if (t === 'runs') void loadRuns();
}, { immediate: true });
</script>

<style scoped>
.small { font-size: 10.5px; }
.ot-stat.clickable { cursor: pointer; }
.ot-stat.clickable:hover { background: var(--ot-surface-2); }
.rel { width: 60px; }
.ttl { font-weight: 600; white-space: normal; }
.chips { display: inline-flex; flex-wrap: wrap; gap: 2px; }
.more { padding: 6px; text-align: center; border-top: 1px solid var(--ot-line); }
.links { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
.authors { font-size: 11.5px; margin: 0 0 6px; }
.abstract { font-size: 12.5px; line-height: 19px; color: var(--ot-text); max-width: 110ch; margin: 0 0 10px; }
.verdict { border-left: 2px solid var(--ot-accent); padding-left: 8px; margin: 8px 0; }
.notes { font-size: 12px; color: var(--ot-text-2); white-space: pre-wrap; }
.matched { margin-top: 10px; }
.hyp { font-size: 13px; margin: 0 0 8px; }
.findings { margin: 0; padding-left: 14px; font-size: 11.5px; color: var(--ot-text-2); }
.settings { display: flex; flex-direction: column; gap: 12px; }
.toggles { display: flex; flex-wrap: wrap; gap: 6px 18px; }
.acts { display: flex; gap: 6px; }
.form { display: flex; flex-direction: column; gap: 8px; }
</style>
