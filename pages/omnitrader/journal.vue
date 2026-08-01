<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <div>
                <h1>Journal</h1>
                <p class="question">
                    What did we decide, why, and what happened? The automatic decision record for every
                    trade — what was seen, what risk said, who approved it, and how much heat it took.
                </p>
            </div>
            <div class="ot-actions">
                <button class="ot-btn ghost" :disabled="loading" @click="load">Refresh</button>
            </div>
        </div>

        <div class="ot-filterbar">
            <div class="ot-segment" role="group" aria-label="Review state">
                <button v-for="f in REVIEW_FILTERS" :key="f.value" type="button"
                        :aria-pressed="filters.review === f.value"
                        @click="filters.review = f.value; load()">
                    {{ f.label }}
                    <span v-if="reviewCount(f.value) !== null" class="facet">{{ reviewCount(f.value) }}</span>
                </button>
            </div>

            <select class="ot-select auto" v-model="filters.outcome" @change="load" aria-label="Outcome">
                <option value="">Any outcome</option>
                <option value="wins">Winners</option>
                <option value="losses">Losers</option>
                <option value="open">Still open</option>
                <option value="intervened">Intervened on</option>
            </select>

            <select class="ot-select auto" v-model="filters.strategy" @change="load" aria-label="Strategy">
                <option value="">All strategies</option>
                <option v-for="s in facets.Strategies ?? []" :key="s" :value="s">{{ s }}</option>
            </select>

            <select v-if="(facets.Tags ?? []).length" class="ot-select auto" v-model="filters.tag"
                    @change="load" aria-label="Tag">
                <option value="">Any tag</option>
                <option v-for="t in facets.Tags" :key="t" :value="t">{{ t }}</option>
            </select>

            <label class="ot-search">
                <span class="glyph" aria-hidden="true">⌕</span>
                <span class="visually-hidden">Search the journal</span>
                <input class="ot-input" type="search" v-model="filters.q" @input="debouncedLoad"
                       placeholder="instrument, note, tag…" />
            </label>

            <span class="summary">
                <b>{{ result.Filtered }}</b> of {{ result.Total }} records
                <span class="sep" aria-hidden="true">·</span>
                {{ scopeLabel }}
            </span>

            <button v-if="activeCount" class="ot-filterchip" @click="clearFilters">
                Clear {{ activeCount }} filter(s) <span class="x" aria-hidden="true">✕</span>
            </button>
            <div class="grow"></div>
        </div>

        <div class="ot-kpis">
            <OmniTraderKpi label="Records" :value="String(result.Filtered)" :loading="loading && !records.length"
                           :foot="`${result.Total} in the recent set`" />
            <OmniTraderKpi label="Unreviewed" :tone="unreviewed ? 'warn' : 'good'" :value="String(unreviewed)"
                           :loading="loading && !records.length" foot="awaiting your read" />
            <OmniTraderKpi label="Interventions" tone="info" :value="String(interventions)"
                           :loading="loading && !records.length" foot="trades you touched" />
            <OmniTraderKpi label="Recorded P&L" :tone="netPnL >= 0 ? 'good' : 'bad'"
                           :value="fmtSigned(netPnL, currency)" :loading="loading && !records.length"
                           foot="closed trades in this view only"
                           help="This is the sum over the filtered view, not the firm's P&L. Performance is the page for that." />
            <OmniTraderKpi label="Win rate" :value="fmtPct(winRate, 0)" :loading="loading && !records.length"
                           :foot="`${closedCount} closed in this view`" />
        </div>

        <OmniTraderCard title="Trade records" question="Click a row for the full decision trail" flush
                        :loading="loading" :empty="!records.length" :error="error" @retry="load"
                        :empty-kind="activeCount ? 'filtered' : 'empty'"
                        empty-title="No journal records"
                        empty-text="Records are written automatically once orders reach a terminal state.">
            <OmniTraderDataTable :rows="records" :columns="columns" label="records" pinned selectable
                                 :row-key="r => r.Id" :selected-key="detail?.Id ?? null"
                                 :server-filtered="result.Filtered" :server-total="result.Total"
                                 default-sort="Ts" search-placeholder="Filter loaded rows…"
                                 :row-class="r => r.ReviewState === 'Flagged' ? 'attention' : ''"
                                 @select="open($event)">
                <template #cell-Ts="{ row }">
                    <span class="cellstack">
                        <span :title="fmtTime(row.Ts)">{{ fmtAgo(row.Ts) }}</span>
                        <span class="sub">{{ row.StrategyId ?? 'manual' }}</span>
                    </span>
                </template>
                <template #cell-InstrumentId="{ row }">
                    <span class="cellstack">
                        <span><strong :class="row.Side === 'Buy' ? 'pos' : 'neg'">{{ row.Side }}</strong> {{ row.InstrumentId }}</span>
                        <span class="sub">
                            {{ row.FinalState }}{{ row.Interventions?.length ? ` · ${row.Interventions.length} intervention(s)` : '' }}
                        </span>
                    </span>
                </template>
                <template #cell-Venue="{ row }">
                    <span class="cellstack">
                        <span class="ot-chip" :class="envClass(row.Environment)">{{ row.Environment }}</span>
                        <span class="sub">{{ row.Venue }}</span>
                    </span>
                </template>
                <template #cell-RiskVerdict="{ row }">
                    <span class="cellstack">
                        <span class="ot-chip" :class="verdictTone(row.RiskVerdict)">{{ row.RiskVerdict }}</span>
                        <span v-if="row.ApprovedBy" class="sub">by {{ row.ApprovedBy }}</span>
                    </span>
                </template>
                <template #cell-IntendedQuantity="{ row }">
                    <span class="cellstack">
                        <span>{{ fmtNum(row.IntendedQuantity) }} @ {{ fmtNum(row.IntendedPrice, 6) }}</span>
                        <span class="sub">{{ fmtNum(row.FilledQuantity) }} @ {{ row.ActualPrice ? fmtNum(row.ActualPrice, 6) : '—' }}</span>
                    </span>
                </template>
                <template #cell-SlippageBps="{ row }">
                    <span :class="(row.SlippageBps ?? 0) > 0 ? 'neg' : 'pos'">{{ fmtBps(row.SlippageBps) }}</span>
                </template>
                <template #cell-RealizedPnL="{ row }">
                    <span v-if="row.RealizedPnL === null || row.RealizedPnL === undefined" class="muted">open</span>
                    <span v-else :class="row.RealizedPnL >= 0 ? 'pos' : 'neg'">{{ fmtSigned(row.RealizedPnL, currency) }}</span>
                </template>
                <template #cell-ReviewState="{ row }">
                    <span class="cellstack">
                        <span class="ot-chip" :class="reviewTone(row.ReviewState)">{{ row.ReviewState }}</span>
                        <span v-if="row.Tags?.length" class="sub">{{ row.Tags.join(', ') }}</span>
                    </span>
                </template>
            </OmniTraderDataTable>
        </OmniTraderCard>

        <OmniTraderDrawer :open="!!detail" @close="detail = null"
                          :title="detail ? `${detail.Side} ${detail.InstrumentId}` : ''">
            <template #subtitle v-if="detail">
                <span class="ot-chip" :class="envClass(detail.Environment)">{{ detail.Environment }}</span>
                {{ detail.Venue }} · {{ fmtTime(detail.Ts) }}
            </template>

            <template v-if="detail">
                <h4 class="ot-sectionhead">Decision</h4>
                <dl class="ot-kv">
                    <dt>Signal time</dt><dd>{{ fmtTime(detail.SignalTimeUtc) }}</dd>
                    <dt>Decision price</dt><dd>{{ fmtNum(detail.DecisionPrice, 6) }}</dd>
                    <dt>Strategy</dt>
                    <dd>{{ detail.StrategyId ?? 'manual ticket' }}{{ detail.StrategyVersion ? ` v${detail.StrategyVersion}` : '' }}</dd>
                    <dt>Authority</dt><dd>{{ detail.Authority }}</dd>
                    <dt>Rationale</dt><dd>{{ detail.Rationale ?? '—' }}</dd>
                    <dt>Risk verdict</dt><dd>{{ detail.RiskVerdict }}</dd>
                    <dt>Risk summary</dt><dd>{{ detail.RiskSummary ?? 'all layers passed' }}</dd>
                    <dt>Approved by</dt><dd>{{ detail.ApprovedBy ?? '—' }}</dd>
                    <dt>Approval delay</dt><dd>{{ detail.ApprovalDelay ?? '—' }}</dd>
                </dl>

                <h4 class="ot-sectionhead" style="margin-top:20px">Outcome</h4>
                <dl class="ot-kv">
                    <dt>Intended</dt><dd>{{ fmtNum(detail.IntendedQuantity) }} @ {{ fmtNum(detail.IntendedPrice, 6) }}</dd>
                    <dt>Actual</dt>
                    <dd>{{ fmtNum(detail.FilledQuantity) }} @ {{ detail.ActualPrice ? fmtNum(detail.ActualPrice, 6) : '—' }}</dd>
                    <dt>Slippage</dt><dd>{{ fmtBps(detail.SlippageBps) }}</dd>
                    <dt>Protection</dt>
                    <dd>
                        {{ detail.StopLossPrice ? `stop ${fmtNum(detail.StopLossPrice, 6)}` : 'no stop' }}
                        {{ detail.TakeProfitPrice ? ` · target ${fmtNum(detail.TakeProfitPrice, 6)}` : '' }}
                    </dd>
                    <dt>Fees</dt><dd>{{ fmtNum(detail.Fees, 6) }}</dd>
                    <dt>Realized</dt>
                    <dd :class="signTone(detail.RealizedPnL)">
                        {{ detail.RealizedPnL !== null && detail.RealizedPnL !== undefined
                            ? fmtSigned(detail.RealizedPnL, currency) : 'still open' }}
                    </dd>
                    <dt>Best excursion</dt><dd>{{ fmtSigned(detail.MaxFavourableExcursion, currency) }}</dd>
                    <dt>Worst excursion</dt><dd>{{ fmtSigned(detail.MaxAdverseExcursion, currency) }}</dd>
                    <dt>Exit reason</dt><dd>{{ detail.ExitReason ?? '—' }}</dd>
                </dl>

                <div v-if="Object.keys(detail.DataSnapshot ?? {}).length" style="margin-top:20px">
                    <h4 class="ot-sectionhead">What the strategy saw</h4>
                    <dl class="ot-kv">
                        <template v-for="(value, key) in detail.DataSnapshot" :key="key">
                            <dt>{{ key }}</dt><dd>{{ value }}</dd>
                        </template>
                    </dl>
                </div>

                <div v-if="detail.Interventions?.length" style="margin-top:20px">
                    <h4 class="ot-sectionhead">Interventions</h4>
                    <ol class="ot-timeline">
                        <li v-for="(i, index) in detail.Interventions" :key="index">
                            <span class="mono">{{ i.Action }}</span>
                            <span class="sub">{{ fmtTime(i.AtUtc) }} · {{ i.Actor }}{{ i.Reason ? ` — ${i.Reason}` : '' }}</span>
                            <span v-if="i.StateBefore || i.StateAfter" class="sub">{{ i.StateBefore }} → {{ i.StateAfter }}</span>
                        </li>
                    </ol>
                </div>

                <div style="margin-top:20px">
                    <h4 class="ot-sectionhead">Your review</h4>
                    <div class="ot-formgrid" style="margin-bottom:12px">
                        <div class="ot-field">
                            <label for="jr-state">State</label>
                            <select id="jr-state" class="ot-select" v-model="annotation.reviewState">
                                <option value="Unreviewed">Unreviewed</option>
                                <option value="Reviewed">Reviewed</option>
                                <option value="Flagged">Flagged</option>
                            </select>
                        </div>
                        <div class="ot-field">
                            <label for="jr-tags">Tags (comma separated)</label>
                            <input id="jr-tags" class="ot-input" v-model="annotation.tags"
                                   placeholder="breakout, news, revenge" />
                        </div>
                    </div>
                    <div class="ot-field">
                        <label for="jr-notes">Notes</label>
                        <textarea id="jr-notes" class="ot-input" rows="3" v-model="annotation.notes"
                                  placeholder="What would you do differently?"></textarea>
                    </div>
                </div>
            </template>

            <template #footer>
                <button class="ot-btn ghost" @click="detail = null">Close</button>
                <button class="ot-btn ghost" :disabled="busy" @click="recordIntervention">Log intervention</button>
                <button class="ot-btn primary" :disabled="busy" @click="saveAnnotation">Save review</button>
            </template>
        </OmniTraderDrawer>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import {
    useOmniTrader, useUrlState, fmtSigned, fmtNum, fmtPct, fmtAgo, fmtTime, fmtBps,
    envClass, verdictTone, signTone, SWAL_THEME,
} from '~/composables/useOmniTrader';
import type { TableColumn } from '~/components/OmniTrader/DataTable.vue';

definePageMeta({ layout: 'navbar' });

const { get, post, currency, environment } = useOmniTrader();

const REVIEW_FILTERS = [
    { value: '', label: 'All' },
    { value: 'Unreviewed', label: 'Unreviewed' },
    { value: 'Flagged', label: 'Flagged' },
    { value: 'Reviewed', label: 'Reviewed' },
];

const { state: filters, reset, activeCount } = useUrlState({
    review: '', outcome: '', strategy: '', tag: '', q: '',
});

const result = ref<{ Rows: any[]; Filtered: number; Total: number }>({ Rows: [], Filtered: 0, Total: 0 });
const facets = ref<{ Strategies?: string[]; Tags?: string[]; ReviewCounts?: Record<string, number> }>({});
const records = computed(() => result.value.Rows);
const loading = ref(false);
const error = ref('');
const busy = ref(false);
const detail = ref<any>(null);
const annotation = reactive({ reviewState: 'Unreviewed', tags: '', notes: '' });

const columns: TableColumn[] = [
    { key: 'Ts', label: 'When', width: '130px' },
    { key: 'InstrumentId', label: 'Trade', width: '220px', searchValue: r => `${r.Side} ${r.InstrumentId} ${r.StrategyId ?? ''}` },
    { key: 'Venue', label: 'Venue', width: '120px' },
    { key: 'RiskVerdict', label: 'Risk', width: '140px' },
    { key: 'IntendedQuantity', label: 'Intended / actual', num: true },
    { key: 'SlippageBps', label: 'Slippage', num: true },
    { key: 'RealizedPnL', label: 'P&L', num: true },
    { key: 'ReviewState', label: 'Review', width: '130px' },
];

const scopeLabel = computed(() =>
    environment.value === 'All' ? 'all environments' : `${environment.value.toLowerCase()} only`);

const unreviewed = computed(() => records.value.filter(r => r.ReviewState === 'Unreviewed').length);
const interventions = computed(() => records.value.reduce((sum, r) => sum + (r.Interventions?.length ?? 0), 0));
const closed = computed(() => records.value.filter(r => r.RealizedPnL !== null && r.RealizedPnL !== undefined));
const closedCount = computed(() => closed.value.length);
const netPnL = computed(() => closed.value.reduce((sum, r) => sum + (r.RealizedPnL ?? 0), 0));
const winRate = computed(() =>
    closedCount.value ? (closed.value.filter(r => (r.RealizedPnL ?? 0) > 0).length / closedCount.value) * 100 : 0);

function reviewCount(value: string): number | null {
    const counts = facets.value.ReviewCounts;
    if (!counts) return null;
    if (!value) return Object.values(counts).reduce((a, b) => a + b, 0);
    return counts[value] ?? 0;
}

function reviewTone(state: string) {
    return ({ Reviewed: 'ok', Flagged: 'bad', Unreviewed: 'warn' } as Record<string, string>)[state] ?? '';
}

async function load() {
    loading.value = true;
    try {
        const data = await get<any>('/journal', {
            review: filters.review,
            outcome: filters.outcome,
            strategy: filters.strategy,
            tag: filters.tag,
            q: filters.q,
            environment: environment.value === 'All' ? '' : environment.value,
            limit: 300,
        });
        result.value = { Rows: data.Rows ?? [], Filtered: data.Filtered ?? 0, Total: data.Total ?? 0 };
        facets.value = { Strategies: data.Strategies, Tags: data.Tags, ReviewCounts: data.ReviewCounts };
        error.value = '';
    } catch (e: any) {
        error.value = e?.message ?? 'The journal could not be loaded';
    } finally { loading.value = false; }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedLoad() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 300);
}

function clearFilters() { reset(); void load(); }

function open(record: any) {
    detail.value = record;
    annotation.reviewState = record.ReviewState;
    annotation.tags = (record.Tags ?? []).join(', ');
    annotation.notes = record.Notes ?? '';
}

async function saveAnnotation() {
    busy.value = true;
    try {
        await post('/journal/annotate', undefined, {
            Id: detail.value.Id,
            Notes: annotation.notes,
            Tags: annotation.tags.split(',').map(t => t.trim()).filter(Boolean),
            ReviewState: annotation.reviewState,
        });
        detail.value = null;
        await load();
    } catch (e: any) {
        Swal.fire({ title: 'Save failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

async function recordIntervention() {
    const outcome = await Swal.fire({
        title: 'Log a manual intervention',
        input: 'text', inputLabel: 'What did you do?',
        showCancelButton: true, ...SWAL_THEME,
    });
    if (!outcome.isConfirmed || !outcome.value) return;

    const id = detail.value.Id;
    busy.value = true;
    try {
        await post('/journal/intervention', undefined, { Id: id, Action: outcome.value });
        await load();
        detail.value = records.value.find(r => r.Id === id) ?? null;
    } finally { busy.value = false; }
}

watch(environment, load);
onMounted(load);
</script>

<style scoped>
.facet { font-size: 10px; color: var(--ot-muted); margin-left: 4px; }
.visually-hidden {
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}
</style>
