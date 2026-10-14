<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <h1><span class="code">ALPHA</span>Alpha Lab</h1>
            <div class="ot-actions">
                <span class="ot-chip" :class="overview?.AgentBusy ? 'info' : ''"><span class="ot-dot" :class="overview?.AgentBusy ? 'live' : ''"></span>{{ overview?.AgentBusy ? 'agent analysing' : 'agent idle' }}</span>
                <span class="mono muted small">ingest {{ fmtAge(overview?.LastIngestUtc) }} · dispatch {{ fmtAge(overview?.LastDispatchUtc) }} · synthesis {{ fmtAge(overview?.LastSynthesisUtc) }}</span>
                <button class="ot-btn sm" :disabled="busy" @click="ingest">Ingest now</button>
                <button class="ot-btn sm primary" :disabled="busy || overview?.AgentBusy" @click="dispatch()">Analyse next batch</button>
                <button class="ot-btn sm" :disabled="busy || overview?.AgentBusy" title="Ask KliveAgent to combine ideas from different papers into new strategies" @click="synthesise()">Synthesise</button>
                <button class="ot-btn sm ghost" @click="addOpen = true">+ Paper</button>
            </div>
        </div>

        <div class="ot-statbar">
            <div v-for="s in PAPER_STATES" :key="s" class="ot-stat clickable" @click="state.tab = 'papers'; state.status = s"><span class="k">{{ s }}</span><span class="v">{{ overview?.Papers?.[s] ?? 0 }}</span><span class="s">papers</span></div>
            <div class="ot-stat clickable" @click="state.tab = 'ideas'"><span class="k">Ideas</span><span class="v">{{ ideaCount }}</span><span class="s">in the library</span></div>
            <div v-for="s in CAND_STATES" :key="s" class="ot-stat clickable" @click="state.tab = 'candidates'; state.cstatus = s"><span class="k">{{ s }}</span><span class="v" :class="!overview?.Candidates?.[s] ? '' : s === 'Promising' ? 'pos' : s === 'Rejected' || s === 'Failed' ? 'neg' : ''">{{ overview?.Candidates?.[s] ?? 0 }}</span><span class="s">candidates</span></div>
            <div class="ot-stat"><span class="k">Syntheses</span><span class="v">{{ overview?.Syntheses ?? 0 }}</span><span class="s">multi-paper</span></div>
        </div>

        <!-- what Klives has picked to combine -->
        <div v-if="tray.length" class="tray" role="region" aria-label="Ideas to combine">
            <span class="lbl">Combine</span>
            <span v-for="t in tray" :key="`${t.kind}:${t.id}`" class="ot-chip" :class="t.kind === 'paper' ? 'info' : roleTone(t.role ?? '')" :title="t.label">
                <span class="clip">{{ t.kind === 'idea' ? `${t.role}: ` : '' }}{{ t.label }}</span>
                <button type="button" class="x" :aria-label="`Remove ${t.label}`" @click="untray(t)">✕</button>
            </span>
            <span class="grow"></span>
            <span class="muted small">{{ trayPapers }} paper{{ trayPapers === 1 ? '' : 's' }}{{ trayPapers < 2 ? ' · pick ideas from at least two' : '' }}</span>
            <button class="ot-btn sm primary" :disabled="busy || overview?.AgentBusy || trayPapers < 2" @click="synthesise()">Synthesise</button>
            <button class="ot-btn sm ghost" type="button" @click="tray = []">Clear</button>
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

        <!-- ideas -->
        <template v-else-if="state.tab === 'ideas'">
            <div class="ot-toolbar">
                <div class="ot-segment sm" role="group" aria-label="Role">
                    <button type="button" :aria-pressed="!state.role" @click="state.role = ''">all</button>
                    <button v-for="r in ROLES" :key="r" type="button" :aria-pressed="state.role === r" @click="state.role = r">{{ r }}<span class="muted cnt">{{ overview?.Ideas?.[r] ?? 0 }}</span></button>
                </div>
                <input v-model="ideaQ" class="ot-input sm isearch" placeholder="search ideas" @keydown.enter="state.iq = ideaQ" />
                <span class="grow"></span>
                <span class="summary">{{ ideas.length }} / {{ ideasTotal }}</span>
            </div>
            <OtPanel title="Idea library" flush :loading="loadingIdeas && !ideas.length" :error="ideasError" :empty="!ideas.length" :collapsible="false"
                     empty-text="No ideas yet. KliveAgent records the components of each paper it reads.">
                <OtGrid :rows="ideas" :columns="ideaCols" grid-key="alpha.ideas" selectable :row-key="(r: any) => r.Id" default-sort="BestScore"
                        max-height="calc(100vh - 290px)" @select="(r: any) => (state.paper = r.PaperId)">
                    <template #cell-Tray="{ row }">
                        <button class="ot-btn xs" :class="inTray('idea', row.Id) ? 'primary' : 'ghost'" type="button"
                                :title="inTray('idea', row.Id) ? 'Remove from the combination' : 'Add to a combination'" :aria-label="inTray('idea', row.Id) ? `Remove ${row.Name}` : `Combine ${row.Name}`"
                                @click.stop="toggleTray(ideaItem(row))">{{ inTray('idea', row.Id) ? '✓' : '+' }}</button>
                    </template>
                    <template #cell-Role="{ row }"><span class="ot-chip" :class="roleTone(row.Role)">{{ row.Role }}</span></template>
                    <template #cell-Name="{ row }"><span class="cellstack"><span class="ttl">{{ row.Name }}</span><span class="sub">{{ row.Summary }}</span></span></template>
                    <template #cell-Formula="{ row }"><code v-if="row.Formula" class="formula mono">{{ row.Formula }}</code><span v-else class="muted">—</span></template>
                </OtGrid>
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
                    <template #cell-Research="{ row }">
                        <span v-if="row.Synthesis" class="ot-chip accent" :title="(row.Sources ?? []).map((s: any) => s.Title).join(' + ')">⊕ {{ row.PaperIds.length }} papers</span>
                        <span v-else>{{ row.PaperTitle ?? '—' }}</span>
                    </template>
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
                <h4 class="ot-sectionhead">Ideas recorded</h4>
                <ul v-if="paper.Ideas?.length" class="ideas">
                    <li v-for="i in paper.Ideas" :key="i.Id">
                        <span class="ot-chip" :class="roleTone(i.Role)">{{ i.Role }}</span>
                        <span class="body">
                            <span class="nm">{{ i.Name }}</span>
                            <span class="sum">{{ i.Summary }}</span>
                            <span v-if="i.Formula || i.Parameters" class="meta mono">{{ [i.Formula, i.Parameters].filter(Boolean).join(' · ') }}</span>
                        </span>
                        <span class="used muted small">{{ i.Used ? `used in ${i.Used}${i.BestScore != null ? ` · best ${fmtN(i.BestScore, 0)}` : ''}` : 'unused' }}</span>
                        <button class="ot-btn xs" :class="inTray('idea', i.Id) ? 'primary' : 'ghost'" type="button" :aria-label="inTray('idea', i.Id) ? `Remove ${i.Name}` : `Combine ${i.Name}`" @click="toggleTray(ideaItem(i))">{{ inTray('idea', i.Id) ? '✓' : '+' }}</button>
                    </li>
                </ul>
                <p v-else class="muted small">None yet. They are recorded when KliveAgent analyses the paper.</p>
                <h4 v-if="paper.Candidates?.length" class="ot-sectionhead">Candidates</h4>
                <OtGrid v-if="paper.Candidates?.length" :rows="paper.Candidates" :columns="candCols" bare selectable :row-key="(r: any) => r.Id" @select="(r: any) => { state.paper = ''; state.tab = 'candidates'; state.candidate = r.Id; }" />
                <div class="matched muted small mono">matched: {{ (paper.Paper.Matched ?? []).join(' · ') }}</div>
            </template>
            <template #footer>
                <button class="ot-btn" type="button" :disabled="!paper" @click="star">{{ paper?.Paper?.Starred ? 'Unstar' : 'Star' }}</button>
                <button class="ot-btn" type="button" :disabled="!paper" title="Add this paper to a combination with others" @click="toggleTray({ kind: 'paper', id: paper.Paper.Id, label: paper.Paper.Title })">{{ inTray('paper', paper?.Paper?.Id) ? '✓ Combining' : '+ Combine' }}</button>
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
                    <NuxtLink class="ot-btn sm" :to="`/omnitrader/studio?id=${cand.StrategyId}`">{{ kindLabel(cand.StrategyKind) }} strategy v{{ cand.StrategyVersion }}</NuxtLink>
                    <NuxtLink v-if="primaryJob" class="ot-btn sm" :to="`/omnitrader/lab?job=${primaryJob}`">Primary backtest</NuxtLink>
                </div>
                <div v-if="candSources.length" class="sources">
                    <h4 class="ot-sectionhead">{{ candSources.length > 1 ? `Synthesis of ${candSources.length} papers` : 'Paper' }}</h4>
                    <ul>
                        <li v-for="s in candSources" :key="s.PaperId">
                            <button class="linkish" type="button" @click="state.candidate = ''; state.tab = 'papers'; state.paper = s.PaperId">{{ s.Title ?? s.PaperId }}</button>
                            <span v-if="s.Contribution" class="muted"> — {{ s.Contribution }}</span>
                        </li>
                    </ul>
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
                    <template v-if="cand.Evaluation.Constituents?.length">
                        <h4 class="ot-sectionhead">Against its single-paper parts</h4>
                        <OtGrid :rows="cand.Evaluation.Constituents" :columns="partCols" bare selectable :row-key="(r: any) => r.CandidateId" @select="(r: any) => (state.candidate = r.CandidateId)" />
                    </template>
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

const TABS = ['papers', 'ideas', 'candidates', 'runs', 'settings'];
const PAPER_STATES = ['New', 'Queued', 'Analysing', 'Analysed', 'Implemented', 'Rejected'];
const CAND_STATES = ['Evaluating', 'Promising', 'Weak', 'Rejected', 'Promoted'];
const ROLES = ['signal', 'filter', 'sizing', 'exit', 'universe', 'risk', 'timing'];
const { state } = useUrlState({ tab: 'papers', status: '', q: '', minRel: '', order: 'n1', paper: '', candidate: '', cstatus: '', role: '', iq: '' });
const paperQ = ref(state.q);
const busy = ref(false);

const overview = ref<any>(null);
const settings = ref<any>(null);
async function loadOverview() {
    try { overview.value = await tGet<any>('/alpha/overview'); settings.value = clone(overview.value.Settings); } catch { /* the tabs still load */ }
}
useTicker(loadOverview, 30_000);
const ideaCount = computed(() => Object.values<number>(overview.value?.Ideas ?? {}).reduce((a, b) => a + b, 0));
function roleTone(r: string) { return ({ signal: 'accent', filter: 'info', sizing: 'ok', exit: 'warn', risk: 'bad' } as Record<string, string>)[r] ?? ''; }
function kindLabel(k?: string | null) { return k === 'Script' ? 'C#' : k === 'Blueprint' ? 'Blueprint' : '—'; }

// what Klives picks to combine: whole papers and/or single ideas
interface TrayItem { kind: 'paper' | 'idea'; id: string; label: string; role?: string; paperId?: string }
const tray = ref<TrayItem[]>([]);
function inTray(kind: TrayItem['kind'], id?: string | null) { return !!id && tray.value.some(t => t.kind === kind && t.id === id); }
function untray(item: TrayItem) { tray.value = tray.value.filter(t => !(t.kind === item.kind && t.id === item.id)); }
function toggleTray(item: TrayItem) { if (inTray(item.kind, item.id)) untray(item); else tray.value = [...tray.value, item]; }
function ideaItem(i: any): TrayItem { return { kind: 'idea', id: i.Id, label: i.Name, role: i.Role, paperId: i.PaperId ?? paper.value?.Paper?.Id }; }
const trayPapers = computed(() => new Set(tray.value.map(t => (t.kind === 'paper' ? t.id : t.paperId))).size);
async function synthesise() {
    const focused = tray.value.length > 0;
    const ask = await Swal.fire({
        title: 'Synthesise', input: 'text', inputPlaceholder: 'Optional note for KliveAgent', showCancelButton: true, confirmButtonText: 'Send',
        text: focused ? `KliveAgent will combine ideas from ${trayPapers.value} papers into new C# strategies.` : 'KliveAgent will look for ideas in the library that work together and build them into new C# strategies.',
        ...SWAL_TERMINAL,
    });
    if (!ask.isConfirmed) return;
    busy.value = true;
    try {
        const r = await tPost<any>('/alpha/synthesise', {
            PaperIds: tray.value.filter(t => t.kind === 'paper').map(t => t.id),
            IdeaIds: tray.value.filter(t => t.kind === 'idea').map(t => t.id),
            Note: ask.value || null,
        });
        void Swal.fire({ title: r.Started ? 'Sent to KliveAgent' : 'Not started', text: r.Started ? 'New candidates appear as they are submitted.' : r.Reason, icon: r.Started ? 'success' : 'info', ...SWAL_TERMINAL, timer: r.Started ? 2200 : undefined });
        if (r.Started) tray.value = [];
        await loadOverview();
    } catch (e: any) { void Swal.fire({ title: 'Failed', text: e?.message, icon: 'error', ...SWAL_TERMINAL }); }
    finally { busy.value = false; }
}

// ideas
const ideas = ref<any[]>([]);
const ideasTotal = ref(0);
const loadingIdeas = ref(false);
const ideasError = ref<string | null>(null);
const ideaQ = ref(state.iq);
async function loadIdeas() {
    loadingIdeas.value = true;
    try {
        const r = await tGet<any>('/alpha/ideas', { role: state.role || undefined, q: state.iq || undefined, limit: 500 });
        ideas.value = r.Rows ?? [];
        ideasTotal.value = r.Total ?? ideas.value.length;
        ideasError.value = null;
    } catch (e: any) { ideasError.value = e?.message ?? 'failed'; }
    finally { loadingIdeas.value = false; }
}
watch(() => [state.role, state.iq], () => { if (state.tab === 'ideas') void loadIdeas(); });
const ideaCols: GridColumn[] = [
    { key: 'Tray', label: '', format: 'text', sortable: false, value: () => '', width: '34px' },
    { key: 'Role', label: 'Role', format: 'text' },
    { key: 'Name', label: 'Idea', format: 'text', wrap: true, value: r => `${r.Name} — ${r.Summary}` },
    { key: 'Formula', label: 'Formula', format: 'text', clip: 240 },
    { key: 'PaperTitle', label: 'Paper', format: 'text', clip: 260 },
    { key: 'Used', label: 'Used', format: 'int', hint: 'Candidates built on this idea' },
    { key: 'BestScore', label: 'Best', format: 'int', heat: 'seq', heatValue: r => (r.BestScore == null ? null : r.BestScore / 100), hint: 'Best score among those candidates' },
    { key: 'Parameters', label: 'Parameters', format: 'text', clip: 220, hidden: true },
    { key: 'Evidence', label: 'Evidence', format: 'text', clip: 260, hidden: true },
    { key: 'CreatedUtc', label: 'Added', format: 'age' },
];

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
    { key: 'Status', label: 'Status', format: 'text' }, { key: 'StrategyName', label: 'Strategy', format: 'text' },
    { key: 'StrategyKind', label: 'Kind', format: 'text', value: r => kindLabel(r.StrategyKind), hint: 'C# script or blueprint' },
    { key: 'Research', label: 'Research', format: 'text', clip: 300, value: r => (r.Synthesis ? `⊕ ${r.PaperIds?.length ?? 0} papers` : r.PaperTitle), title: r => (r.Sources ?? []).map((s: any) => s.Title).join(' + ') || r.PaperTitle },
    { key: 'Sharpe', label: 'Sharpe', format: 'num' }, { key: 'OosSharpe', label: 'OOS', format: 'num' }, { key: 'DeflatedSharpe', label: 'DSR', format: 'num', decimals: 3 },
    { key: 'VsParts', label: 'vs parts', format: 'signed', decimals: 2, signed: true, hint: 'A synthesis: its Sharpe minus its strongest single-paper part on the same symbols' },
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
/** Every paper the candidate draws on; candidates from before syntheses carry only PaperId. */
const candSources = computed<any[]>(() => {
    const c = cand.value;
    if (!c) return [];
    if (c.Sources?.length) return c.Sources;
    return c.PaperId ? [{ PaperId: c.PaperId, Title: c.PaperTitle }] : [];
});
const partCols: GridColumn[] = [
    { key: 'StrategyName', label: 'Part', format: 'text' }, { key: 'Score', label: 'Score', format: 'int' },
    { key: 'Sharpe', label: 'Part SR', format: 'num' }, { key: 'SynthesisSharpe', label: 'Synthesis SR', format: 'num' },
    { key: 'Delta', label: 'Δ Sharpe', format: 'signed', decimals: 2, signed: true },
    { key: 'SharedSymbols', label: 'Shared', format: 'int', hint: 'Symbols both were tested on (0 = primary runs compared)' },
];
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
    { key: 'Papers', label: 'Papers', format: 'int', value: r => r.PaperIds?.length ?? 0 }, { key: 'Ideas', label: 'Ideas', format: 'int', value: r => r.IdeaIds?.length ?? 0, hidden: true },
    { key: 'Summary', label: 'Summary', format: 'text', value: r => r.Error ?? r.Summary, clip: 380 },
    { key: 'ConversationId', label: 'Conversation', format: 'text', hidden: true },
];

// settings
const TOGGLES = [
    { key: 'Enabled', label: 'Alpha Lab on' }, { key: 'IngestEnabled', label: 'Fetch papers' }, { key: 'UseArxiv', label: 'arXiv' }, { key: 'UseOpenAlex', label: 'OpenAlex' },
    { key: 'AgentEnabled', label: 'KliveAgent analysis' }, { key: 'SynthesisEnabled', label: 'Synthesis runs' }, { key: 'AutoEvaluate', label: 'Auto-evaluate candidates' },
    { key: 'NotifyPromising', label: 'Discord on promising' },
];
const NUMBERS = [
    { key: 'IngestEveryHours', label: 'Ingest every h', step: 0.5 }, { key: 'AnalyseEveryHours', label: 'Analyse every h', step: 0.5 }, { key: 'PapersPerRun', label: 'Papers per run' },
    { key: 'SynthesiseEveryHours', label: 'Synthesise every h', step: 1 }, { key: 'SynthesesPerRun', label: 'Syntheses per run' },
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
    else if (t === 'ideas') void loadIdeas();
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
.tray { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px 8px; margin: 6px 0; border: 1px solid var(--ot-accent); border-radius: var(--ot-radius); background: rgba(245, 165, 36, 0.05); }
.tray .lbl { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ot-accent); font-weight: 700; }
.tray .ot-chip { display: inline-flex; align-items: center; gap: 4px; max-width: 320px; }
.tray .clip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tray .x { border: 0; background: none; color: inherit; cursor: pointer; padding: 0 2px; font-size: 10px; opacity: 0.7; }
.tray .x:hover { opacity: 1; }
.tray .grow { flex: 1 1 auto; }
.formula { font-size: 11px; color: var(--ot-info); white-space: nowrap; }
.cnt { margin-left: 5px; }
.isearch { width: 280px; max-width: 100%; flex: 0 1 auto; }
.ideas { list-style: none; margin: 0 0 8px; padding: 0; }
.ideas li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: 8px; align-items: start; padding: 5px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.035); }
.ideas .body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.ideas .nm { font-weight: 600; font-size: 12px; }
.ideas .sum { font-size: 12px; color: var(--ot-text-2); }
.ideas .meta { font-size: 11px; color: var(--ot-info); overflow-wrap: anywhere; }
.ideas .used { white-space: nowrap; padding-top: 2px; }
.sources ul { margin: 0 0 8px; padding-left: 14px; font-size: 12px; }
.sources li { margin: 2px 0; }
.linkish { border: 0; background: none; padding: 0; color: var(--ot-info); cursor: pointer; font: inherit; text-align: left; }
.linkish:hover { color: var(--ot-accent); text-decoration: underline; }
.settings { display: flex; flex-direction: column; gap: 12px; }
.toggles { display: flex; flex-wrap: wrap; gap: 6px 18px; }
.acts { display: flex; gap: 6px; }
.form { display: flex; flex-direction: column; gap: 8px; }
</style>
