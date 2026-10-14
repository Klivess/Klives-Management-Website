<template>
    <OmniTraderShell>
        <div class="studio">
            <!-- library -->
            <aside class="lib">
                <div class="libhead">
                    <input v-model="q" class="ot-input sm" placeholder="Filter strategies…" />
                    <details ref="newMenu" class="ot-menu">
                        <summary class="ot-btn sm primary">New</summary>
                        <div class="pop left">
                            <span class="grp">Blank</span>
                            <button class="item" type="button" @click="createBlank('Blueprint')">Blueprint</button>
                            <button class="item" type="button" @click="createBlank('Script')">C# script</button>
                            <span class="grp">Templates</span>
                            <button v-for="t in templates" :key="t.Id" class="item" type="button" :title="t.Description" @click="createFromTemplate(t.Id)">
                                <span class="ot-chip">{{ t.Kind === 'Script' ? 'C#' : 'BP' }}</span>{{ t.Name }}
                            </button>
                        </div>
                    </details>
                </div>
                <div class="filters">
                    <div class="ot-segment sm">
                        <button v-for="a in ['all', 'klives', 'kliveagent', 'alpha-lab']" :key="a" type="button" :aria-pressed="author === a" @click="author = a">{{ a === 'kliveagent' ? 'agent' : a }}</button>
                    </div>
                    <label class="ot-check small"><input v-model="showArchived" type="checkbox" /> archived</label>
                </div>
                <div class="list">
                    <button v-for="s in filteredList" :key="s.Id" type="button" class="li" :class="{ active: s.Id === current?.Id, archived: s.Status === 'Archived' }" @click="open(s.Id)">
                        <span class="dot" :class="s.Status === 'Valid' ? 'ok' : s.Status === 'Invalid' ? 'bad' : ''"></span>
                        <span class="nm">{{ s.Name }}</span>
                        <span class="kind mono">{{ s.Kind === 'Script' ? 'C#' : 'BP' }}{{ s.Universe && s.Universe !== 'single' ? '·U' : '' }}</span>
                        <span class="meta mono">v{{ s.Version }} · {{ s.Author === 'kliveagent' ? 'agent' : s.Author }}<template v-if="s.LastMetrics?.Sharpe !== undefined"> · S {{ fmtN(s.LastMetrics.Sharpe, 2) }}</template></span>
                    </button>
                    <div v-if="!filteredList.length" class="muted small pad">{{ loadingList ? 'Loading…' : 'None' }}</div>
                </div>
            </aside>

            <!-- editor -->
            <section class="editor">
                <div v-if="!current" class="ot-state"><strong>Open or create a strategy</strong><span class="muted">Templates cover trend, mean reversion, breakouts and rotation.</span></div>
                <template v-else>
                    <div class="edhead">
                        <input v-model="draft.Name" class="ot-input name" aria-label="Name" />
                        <span class="ot-chip" :class="current.Status === 'Valid' ? 'ok' : current.Status === 'Invalid' ? 'bad' : ''">{{ current.Status }}</span>
                        <span class="mono muted small">{{ current.Kind === 'Script' ? 'C# script' : 'Blueprint' }} · v{{ current.Version }} · {{ current.Id }}</span>
                        <span v-if="dirty" class="ot-chip warn">unsaved</span>
                        <span class="grow"></span>
                        <button class="ot-btn sm primary" :disabled="saving || !dirty" @click="save">{{ saving ? 'Saving…' : 'Save ⌃S' }}</button>
                        <details class="ot-menu">
                            <summary class="ot-btn sm">⋯</summary>
                            <div class="pop">
                                <button class="item" type="button" @click="clone">Clone</button>
                                <button class="item" type="button" @click="archive">{{ current.Status === 'Archived' ? 'Unarchive' : 'Archive' }}</button>
                                <button class="item" type="button" @click="exportJson">Export JSON</button>
                                <button class="item" type="button" @click="remove">Delete…</button>
                            </div>
                        </details>
                    </div>
                    <div class="meta-row">
                        <input v-model="draft.Description" class="ot-input sm desc" placeholder="Description" />
                        <input v-model="symbolUpper" class="ot-input sm mono sym" title="Default symbol" />
                        <select v-model="draft.DefaultInterval" class="ot-select sm auto" title="Default interval"><option v-for="i in INTERVALS" :key="i.value" :value="i.value">{{ i.short }}</option></select>
                        <input v-model="tagsText" class="ot-input sm tags" placeholder="tags" />
                    </div>
                    <nav class="ot-tabs flush">
                        <button type="button" :aria-selected="edTab === 'edit'" @click="edTab = 'edit'">Edit</button>
                        <button v-if="current.Kind === 'Blueprint'" type="button" :aria-selected="edTab === 'json'" @click="edTab = 'json'">JSON</button>
                        <button v-if="current.Kind === 'Blueprint'" type="button" :aria-selected="edTab === 'compiled'" @click="edTab = 'compiled'">Compiled</button>
                        <button type="button" :aria-selected="edTab === 'versions'" @click="edTab = 'versions'">Versions <span class="mono muted">{{ versions.length }}</span></button>
                        <button type="button" :aria-selected="edTab === 'reference'" @click="edTab = 'reference'">Reference</button>
                        <span class="grow"></span>
                        <span class="checkstate mono">
                            <span v-if="checking" class="ot-spin"></span>
                            <template v-else-if="check">
                                <span :class="errors.length ? 'neg' : 'pos'">{{ errors.length ? `${errors.length} error${errors.length > 1 ? 's' : ''}` : 'compiles' }}</span>
                                <span v-if="warnings.length" class="warn-text"> · {{ warnings.length }} warn</span>
                                <span class="muted"> · {{ fmtN(check.ElapsedMs, 0) }}ms</span>
                            </template>
                        </span>
                    </nav>
                    <div class="edbody">
                        <template v-if="edTab === 'edit'">
                            <OtBlueprintEditor v-if="current.Kind === 'Blueprint' && draft.Blueprint" :model-value="draft.Blueprint" :compiled="check?.Compiled ?? current.Compiled" :symbol="draft.DefaultSymbol" />
                            <OtCodeEditor v-else-if="current.Kind === 'Script'" ref="code" v-model="draft.Source" :diagnostics="diagnostics" :completions="reference?.Script ?? []" :height="editorHeight" @save="save" @run="quickTest" />
                        </template>
                        <OtCodeEditor v-else-if="edTab === 'json'" v-model="blueprintJson" :height="editorHeight" />
                        <div v-else-if="edTab === 'compiled'" class="compiled">
                            <div v-for="(text, key) in (check?.Compiled ?? current.Compiled)" :key="key" class="crow"><span class="k mono">{{ key }}</span><pre class="ot-code">{{ text }}</pre></div>
                            <div v-if="!Object.keys(check?.Compiled ?? current.Compiled ?? {}).length" class="muted">Nothing compiled</div>
                        </div>
                        <OtGrid v-else-if="edTab === 'versions'" :rows="versions" :columns="versionCols" bare :row-key="(r: any) => String(r.Version)">
                            <template #cell-actions="{ row }">
                                <button class="ot-btn xs" type="button" @click="viewVersion(row.Version)">View</button>
                                <button class="ot-btn xs" type="button" :disabled="row.Version === current.Version" @click="restore(row.Version)">Restore</button>
                            </template>
                        </OtGrid>
                        <div v-else-if="edTab === 'reference'" class="ref">
                            <pre class="ot-code">{{ reference?.Text ?? 'Loading…' }}</pre>
                        </div>
                    </div>
                    <div v-if="diagnostics.length" class="diags">
                        <div v-for="(d, i) in diagnostics" :key="i" class="ot-diag" :class="d.Severity">
                            <span class="loc" @click="gotoDiag(d)">{{ d.Line ? `L${d.Line}:${d.Column ?? 1}` : d.Path ?? '' }}</span>
                            <span>{{ d.Message }}</span>
                            <span v-if="d.Code" class="muted">{{ d.Code }}</span>
                        </div>
                    </div>
                </template>
            </section>

            <!-- test bench -->
            <aside class="bench">
                <OtPanel title="Test" code="BT" :collapsible="false">
                    <div class="ot-formgrid">
                        <label class="ot-field"><span class="lbl">Symbol</span><input v-model="run.Symbol" class="ot-input sm mono up" :placeholder="draft.DefaultSymbol" /></label>
                        <label class="ot-field"><span class="lbl">Interval</span><select v-model="run.Interval" class="ot-select sm"><option value="">default</option><option v-for="i in INTERVALS" :key="i.value" :value="i.value">{{ i.short }}</option></select></label>
                        <label class="ot-field"><span class="lbl">Bars</span><input v-model.number="run.Bars" class="ot-input sm num" type="number" min="100" max="50000" /></label>
                        <label class="ot-field"><span class="lbl">Costs</span><select v-model="run.CostPreset" class="ot-select sm"><option v-for="c in costPresets" :key="c.Id" :value="c.Id">{{ c.Name }}</option></select></label>
                        <label class="ot-field"><span class="lbl">Leverage</span><input v-model.number="run.Leverage" class="ot-input sm num" type="number" min="1" max="10" step="0.5" /></label>
                        <label class="ot-field"><span class="lbl">Fills</span><select v-model="run.Execution" class="ot-select sm"><option value="NextOpen">next open</option><option value="SignalClose">signal close</option></select></label>
                    </div>
                    <div v-if="params.length" class="params">
                        <span class="ot-sectionhead">Parameters</span>
                        <label v-for="p in params" :key="p.Name" class="prow">
                            <span>{{ p.Label || p.Name }}</span>
                            <input v-model.number="run.Parameters[p.Name]" class="ot-input sm num" type="number" :min="p.Min ?? undefined" :max="p.Max ?? undefined" :step="p.Step ?? 'any'" :placeholder="String(p.Default ?? '')" />
                        </label>
                    </div>
                    <div class="acts">
                        <button class="ot-btn primary" type="button" :disabled="!current || testing" @click="quickTest">{{ testing ? 'Running…' : 'Quick test ⌃↵' }}</button>
                        <button class="ot-btn" type="button" :disabled="!current || dirty || queueing" :title="dirty ? 'Save first' : ''" @click="queueFull">Full backtest</button>
                    </div>
                    <div class="acts">
                        <NuxtLink v-if="current" class="ot-btn sm ghost" :to="`/omnitrader/lab?tab=studies&new=sweep&strategy=${current.Id}&symbol=${run.Symbol || draft.DefaultSymbol}`">Sweep →</NuxtLink>
                        <NuxtLink v-if="current" class="ot-btn sm ghost" :to="`/omnitrader/lab?strategy=${encodeURIComponent(`studio:${current.Id}*`)}`">Runs →</NuxtLink>
                        <button v-if="current" class="ot-btn sm ghost" type="button" :disabled="dirty" @click="submitAlpha">Submit to Alpha →</button>
                    </div>
                    <div v-if="queuedJob" class="muted small mono">queued <NuxtLink :to="`/omnitrader/lab?job=${queuedJob}`" class="info-text">{{ queuedJob }}</NuxtLink></div>
                    <div v-if="testError" class="ot-banner"><span class="glyph">⚠</span><span class="mono small">{{ testError }}</span></div>
                </OtPanel>
                <OtBacktestReport v-if="testResult" :result="testResult" :interval="run.Interval || draft.DefaultInterval" :height="220" grid-key="studio" />
            </aside>
        </div>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Swal from 'sweetalert2';
import { INTERVALS, SWAL_TERMINAL, fmtN, tGet, tPost, usePersisted } from '~/composables/useTerminal';
import type { GridColumn } from '~/components/Ot/Grid.vue';

definePageMeta({ layout: 'navbar' });

const route = useRoute();
const router = useRouter();

const list = ref<any[]>([]);
const templates = ref<any[]>([]);
const reference = ref<any>(null);
const costPresets = ref<any[]>([]);
const loadingList = ref(false);
const q = ref('');
const author = usePersisted('studio.author', 'all');
const showArchived = ref(false);
const newMenu = ref<HTMLDetailsElement | null>(null);

const current = ref<any>(null);
const versions = ref<any[]>([]);
const params = ref<any[]>([]);
const draft = ref<any>({});
const loadedSnapshot = ref('');
const edTab = ref<'edit' | 'json' | 'compiled' | 'versions' | 'reference'>('edit');
const saving = ref(false);
const check = ref<any>(null);
const checking = ref(false);
const code = ref<any>(null);

const run = usePersisted<any>('studio.run', { Symbol: '', Interval: '', Bars: 1500, CostPreset: 'binance', Leverage: 1, Execution: 'NextOpen', Parameters: {} });
run.value.Parameters ??= {};
/** The run's symbol drives TradeSymbol; it is not a tunable. */
const tunable = (list: any[] | null | undefined) => (list ?? []).filter((p: any) => p.Name !== 'TradeSymbol');
const testing = ref(false);
const testResult = ref<any>(null);
const testError = ref('');
const queueing = ref(false);
const queuedJob = ref('');

const editorHeight = computed(() => (typeof window !== 'undefined' ? Math.max(380, window.innerHeight - 300) : 560));

const filteredList = computed(() => {
    const t = q.value.trim().toLowerCase();
    return list.value.filter(s => (author.value === 'all' || s.Author === author.value)
        && (showArchived.value || s.Status !== 'Archived')
        && (!t || s.Name.toLowerCase().includes(t) || (s.Tags ?? []).some((x: string) => x.toLowerCase().includes(t)) || s.Id.includes(t)));
});

const symbolUpper = computed({ get: () => draft.value.DefaultSymbol ?? '', set: (v: string) => { draft.value.DefaultSymbol = v.toUpperCase().trim(); } });
const tagsText = computed({ get: () => (draft.value.Tags ?? []).join(', '), set: (v: string) => { draft.value.Tags = v.split(',').map(s => s.trim()).filter(Boolean); } });
const blueprintJson = computed({
    get: () => JSON.stringify(draft.value.Blueprint ?? {}, null, 2),
    set: (v: string) => { try { draft.value.Blueprint = JSON.parse(v); } catch { /* keep editing */ } },
});

const snapshot = () => JSON.stringify({ n: draft.value.Name, d: draft.value.Description, b: draft.value.Blueprint, s: draft.value.Source, sym: draft.value.DefaultSymbol, iv: draft.value.DefaultInterval, t: draft.value.Tags });
const dirty = computed(() => !!current.value && snapshot() !== loadedSnapshot.value);

const diagnostics = computed<any[]>(() => check.value?.Diagnostics ?? current.value?.Diagnostics ?? []);
const errors = computed(() => diagnostics.value.filter(d => d.Severity === 'error'));
const warnings = computed(() => diagnostics.value.filter(d => d.Severity === 'warning'));

async function loadList() {
    loadingList.value = true;
    try { list.value = await tGet<any[]>('/studio/list', { archived: true }) ?? []; }
    finally { loadingList.value = false; }
}

async function open(id: string) {
    if (dirty.value) {
        const r = await Swal.fire({ title: 'Discard unsaved changes?', showCancelButton: true, icon: 'warning', ...SWAL_TERMINAL });
        if (!r.isConfirmed) return;
    }
    const r = await tGet<any>('/studio/get', { id });
    current.value = r.Strategy;
    versions.value = r.Versions ?? [];
    params.value = tunable(r.Parameters);
    draft.value = {
        Name: r.Strategy.Name, Description: r.Strategy.Description, Kind: r.Strategy.Kind, Blueprint: r.Strategy.Blueprint ? structuredClone(r.Strategy.Blueprint) : null,
        Source: r.Strategy.Source ?? '', DefaultSymbol: r.Strategy.DefaultSymbol, DefaultInterval: r.Strategy.DefaultInterval, Tags: [...(r.Strategy.Tags ?? [])],
    };
    loadedSnapshot.value = snapshot();
    check.value = null;
    testResult.value = null;
    testError.value = '';
    queuedJob.value = '';
    if (edTab.value === 'compiled' && r.Strategy.Kind !== 'Blueprint') edTab.value = 'edit';
    void router.replace({ query: { ...route.query, id } });
}

async function createBlank(kind: 'Blueprint' | 'Script') {
    if (newMenu.value) newMenu.value.open = false;
    const s = await tPost<any>('/studio/create', { Name: kind === 'Script' ? 'New script' : 'New blueprint', Kind: kind });
    await loadList();
    await open(s.Id);
}

async function createFromTemplate(id: string) {
    if (newMenu.value) newMenu.value.open = false;
    const s = await tPost<any>('/studio/create', undefined, { template: id });
    await loadList();
    await open(s.Id);
}

async function save() {
    if (!current.value || !dirty.value) return;
    saving.value = true;
    try {
        const body: any = { Name: draft.value.Name, Description: draft.value.Description, DefaultSymbol: draft.value.DefaultSymbol, DefaultInterval: draft.value.DefaultInterval, Tags: draft.value.Tags };
        if (current.value.Kind === 'Blueprint') body.Blueprint = draft.value.Blueprint; else body.Source = draft.value.Source;
        const logicChanged = JSON.stringify(current.value.Blueprint) !== JSON.stringify(draft.value.Blueprint) || (current.value.Source ?? '') !== (draft.value.Source ?? '');
        if (logicChanged) {
            const note = await Swal.fire({ title: `Save v${current.value.Version + 1}`, input: 'text', inputPlaceholder: 'What changed (optional)', showCancelButton: true, ...SWAL_TERMINAL });
            if (!note.isConfirmed) return;
            body.Note = note.value || null;
        }
        const s = await tPost<any>('/studio/update', body, { id: current.value.Id });
        await loadList();
        await openFresh(s.Id);
    } catch (e: any) { void Swal.fire({ title: 'Save failed', text: e?.message, icon: 'error', ...SWAL_TERMINAL }); }
    finally { saving.value = false; }
}

async function openFresh(id: string) { loadedSnapshot.value = snapshot(); await open(id); }

let checkTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => [draft.value.Blueprint, draft.value.Source], () => {
    if (!current.value) return;
    if (checkTimer) clearTimeout(checkTimer);
    checkTimer = setTimeout(runCheck, 700);
}, { deep: true });

async function runCheck() {
    if (!current.value) return;
    checking.value = true;
    try {
        check.value = await tPost<any>('/studio/check', current.value.Kind === 'Blueprint'
            ? { Kind: 'Blueprint', Blueprint: draft.value.Blueprint } : { Kind: 'Script', Source: draft.value.Source });
        if (check.value?.Parameters) params.value = tunable(check.value.Parameters);
    } catch { /* keep the last result */ }
    finally { checking.value = false; }
}

function costs() {
    const p = costPresets.value.find(c => c.Id === run.value.CostPreset);
    return { FeeFraction: p?.Fee ?? 0.001, SlippageFraction: p?.Slippage ?? 0.0005 };
}
function runRequest() {
    const parameters = Object.fromEntries(Object.entries(run.value.Parameters ?? {}).filter(([k, v]) => v !== '' && v !== null && v !== undefined && params.value.some(p => p.Name === k)));
    return {
        Symbol: run.value.Symbol || undefined, Interval: run.value.Interval || undefined, Bars: run.value.Bars, Leverage: run.value.Leverage,
        Execution: run.value.Execution, Parameters: parameters, ...costs(),
    };
}

async function quickTest() {
    if (!current.value) return;
    testing.value = true;
    testError.value = '';
    try {
        const r = await tPost<any>('/studio/quick-test', {
            Draft: { Kind: current.value.Kind, Blueprint: draft.value.Blueprint, Source: draft.value.Source, DefaultSymbol: draft.value.DefaultSymbol, DefaultInterval: draft.value.DefaultInterval, Name: draft.value.Name },
            Run: runRequest(),
        });
        if (r.Check) check.value = r.Check;
        if (r.Result) testResult.value = r.Result;
        else testError.value = r.Error ?? 'No result';
    } catch (e: any) { testError.value = e?.message ?? 'failed'; }
    finally { testing.value = false; }
}

async function queueFull() {
    if (!current.value) return;
    queueing.value = true;
    try {
        const r = await tPost<any>('/studio/backtest', { ...runRequest(), Validate: true }, { id: current.value.Id });
        queuedJob.value = r.JobId;
    } catch (e: any) { testError.value = e?.message ?? 'failed'; }
    finally { queueing.value = false; }
}

async function submitAlpha() {
    if (!current.value) return;
    const r = await Swal.fire({ title: 'Submit as alpha candidate', input: 'text', inputPlaceholder: 'Hypothesis in one sentence', showCancelButton: true, ...SWAL_TERMINAL });
    if (!r.isConfirmed) return;
    try {
        const c = await tPost<any>('/alpha/submit', { StrategyId: current.value.Id, Hypothesis: r.value ?? '', TestSymbols: run.value.Symbol ? [run.value.Symbol] : null, Interval: run.value.Interval || null });
        void router.push(`/omnitrader/research?tab=candidates&candidate=${c.Id}`);
    } catch (e: any) { void Swal.fire({ title: 'Not submitted', text: e?.message, icon: 'error', ...SWAL_TERMINAL }); }
}

async function clone() {
    const s = await tPost<any>('/studio/clone', undefined, { id: current.value.Id });
    await loadList();
    await open(s.Id);
}
async function archive() {
    await tPost('/studio/archive', undefined, { id: current.value.Id, archived: current.value.Status !== 'Archived' });
    await loadList();
    await openFresh(current.value.Id);
}
async function remove() {
    const r = await Swal.fire({ title: `Delete “${current.value.Name}” and all versions?`, showCancelButton: true, icon: 'warning', ...SWAL_TERMINAL });
    if (!r.isConfirmed) return;
    const res = await tPost<any>('/studio/delete', undefined, { id: current.value.Id });
    if (!res.Deleted) { void Swal.fire({ title: 'Not deleted', text: res.Reason, icon: 'info', ...SWAL_TERMINAL }); return; }
    current.value = null;
    loadedSnapshot.value = '';
    await loadList();
}
async function viewVersion(v: number) {
    const ver = await tGet<any>('/studio/version', { id: current.value.Id, v });
    await Swal.fire({ title: `v${v}${ver.Note ? ` — ${ver.Note}` : ''}`, html: `<pre style="text-align:left;max-height:60vh;overflow:auto;font-size:11px">${escapeHtml(ver.Source ?? JSON.stringify(ver.Blueprint, null, 2))}</pre>`, width: 900, ...SWAL_TERMINAL });
}
async function restore(v: number) {
    const r = await Swal.fire({ title: `Restore v${v} as a new version?`, showCancelButton: true, ...SWAL_TERMINAL });
    if (!r.isConfirmed) return;
    await tPost('/studio/restore', undefined, { id: current.value.Id, v });
    await loadList();
    await openFresh(current.value.Id);
}
function exportJson() {
    const blob = new Blob([JSON.stringify({ ...current.value, Blueprint: draft.value.Blueprint, Source: draft.value.Source }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${current.value.Name.replace(/[^\w-]+/g, '_')}.json`;
    a.click();
}
function escapeHtml(s: string) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as Record<string, string>)[c]); }
function gotoDiag(d: any) { if (d.Line && code.value) code.value.gotoLine(d.Line, d.Column ?? 1); }

const versionCols: GridColumn[] = [
    { key: 'Version', label: 'v', format: 'int' }, { key: 'CreatedUtc', label: 'Saved', format: 'datetime' }, { key: 'Author', label: 'By', format: 'text' },
    { key: 'Note', label: 'Note', format: 'text', clip: 300 }, { key: 'actions', label: '', format: 'text', sortable: false },
];

function onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void quickTest(); }
}
function onBeforeUnload(e: BeforeUnloadEvent) { if (dirty.value) { e.preventDefault(); e.returnValue = ''; } }

onMounted(async () => {
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onBeforeUnload);
    await Promise.all([
        loadList(),
        tGet<any[]>('/studio/templates').then(t => { templates.value = t ?? []; }).catch(() => {}),
        tGet<any>('/studio/reference').then(r => { reference.value = r; }).catch(() => {}),
        tGet<any[]>('/terminal/cost-presets').then(c => { costPresets.value = c ?? []; }).catch(() => {}),
    ]);
    const id = route.query.id as string | undefined;
    if (id) await open(id);
    else if (list.value.length) await open(list.value[0].Id);
});
onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('beforeunload', onBeforeUnload);
});
</script>

<style scoped>
.studio { display: grid; grid-template-columns: 250px minmax(0, 1fr) minmax(320px, 420px); gap: var(--ot-gutter); align-items: start; }
@media (max-width: 1400px) { .studio { grid-template-columns: 220px minmax(0, 1fr); } .studio .bench { grid-column: 1 / -1; } }
@media (max-width: 900px) { .studio { grid-template-columns: minmax(0, 1fr); } }
.lib { border: 1px solid var(--ot-line); border-radius: var(--ot-radius); background: var(--ot-surface); display: flex; flex-direction: column; max-height: calc(100vh - 140px); position: sticky; top: 76px; }
.libhead { display: flex; gap: 4px; padding: 6px; border-bottom: 1px solid var(--ot-line); }
.filters { display: flex; flex-direction: column; gap: 4px; padding: 6px; border-bottom: 1px solid var(--ot-line); }
.list { overflow-y: auto; }
.li { display: grid; grid-template-columns: 8px 1fr auto; grid-template-rows: auto auto; gap: 0 6px; width: 100%; padding: 5px 8px; border: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.03); background: transparent; text-align: left; cursor: pointer; align-items: center; }
.li:hover { background: var(--ot-surface-3); }
.li.active { background: var(--ot-accent-soft); box-shadow: inset 2px 0 0 var(--ot-accent); }
.li.archived { opacity: 0.55; }
.li .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ot-disabled); grid-row: span 2; }
.li .dot.ok { background: var(--ot-positive); }
.li .dot.bad { background: var(--ot-negative); }
.li .nm { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.li .kind { font-size: 9.5px; color: var(--ot-info); }
.li .meta { grid-column: 2 / -1; font-size: 10px; color: var(--ot-muted); }
.editor { border: 1px solid var(--ot-line); border-radius: var(--ot-radius); background: var(--ot-surface); min-width: 0; display: flex; flex-direction: column; }
.edhead { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid var(--ot-line); flex-wrap: wrap; }
.edhead .name { max-width: 320px; font-weight: 650; font-size: 13px; }
.edhead .grow, .ot-tabs .grow { flex: 1 1 auto; }
.meta-row { display: flex; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--ot-line); flex-wrap: wrap; }
.meta-row .desc { flex: 1 1 260px; }
.meta-row .sym { width: 110px; text-transform: uppercase; }
.meta-row .tags { width: 160px; }
.checkstate { font-size: 10.5px; padding: 0 8px; display: inline-flex; align-items: center; gap: 4px; }
.edbody { padding: 8px; min-height: 300px; }
.compiled .crow { display: grid; grid-template-columns: 90px 1fr; gap: 8px; margin-bottom: 6px; align-items: start; }
.compiled .k { color: var(--ot-accent); font-size: 11px; padding-top: 6px; }
.ref pre { max-height: calc(100vh - 300px); overflow: auto; }
.diags { border-top: 1px solid var(--ot-line); padding: 4px 8px; max-height: 160px; overflow-y: auto; background: #08090b; }
.bench { display: flex; flex-direction: column; gap: var(--ot-gutter); min-width: 0; }
.params { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; }
.prow { display: grid; grid-template-columns: 1fr 90px; gap: 6px; align-items: center; font-size: 11.5px; color: var(--ot-text-2); }
.acts { display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap; }
.up { text-transform: uppercase; }
.small { font-size: 10.5px; }
.pad { padding: 8px; }
</style>
