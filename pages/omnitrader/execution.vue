<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <div class="ot-actions">
                <button class="ot-btn ghost" :disabled="busy" @click="reconcile">Reconcile outstanding</button>
                <button class="ot-btn" :disabled="loading" @click="load">Refresh</button>
            </div>
        </div>

        <!-- Unknown outcomes get their own banner. They are the one state that must never be
             quietly retried, and the copy says so explicitly. -->
        <div v-if="unknownCount" class="ot-banner" role="alert">
            <span class="glyph" aria-hidden="true">⛔</span>
            <div>
                <strong>{{ unknownCount }} submission(s) with an unproven outcome</strong>
                These are <em>not</em> retried automatically. Reconcile against the broker; until every one
                resolves, new automated exposure stays blocked.
            </div>
            <div class="actions">
                <button class="ot-btn sm" :disabled="busy" @click="reconcile">Reconcile now</button>
            </div>
        </div>

        <div class="ot-filterbar">
            <div class="ot-segment" role="group" aria-label="Order state">
                <button v-for="f in FILTERS" :key="f.value" type="button"
                        :aria-pressed="filters.state === f.value"
                        @click="filters.state = f.value; load()">
                    {{ f.label }}
                    <span v-if="facetCount(f) !== null" class="facet">{{ facetCount(f) }}</span>
                </button>
            </div>

            <label class="ot-search">
                <span class="glyph" aria-hidden="true">⌕</span>
                <span class="visually-hidden">Search orders</span>
                <input class="ot-input" type="search" v-model="filters.q" @input="debouncedLoad"
                       placeholder="instrument, reference, broker id…" />
            </label>

            <select class="ot-select auto" v-model="filters.venue" @change="load" aria-label="Venue">
                <option value="">All venues</option>
                <option v-for="v in facets.Venues ?? []" :key="v" :value="v">{{ v }}</option>
            </select>

            <span class="summary">
                <b>{{ result.Filtered }}</b> of {{ result.Total }} recent orders
                <span class="sep" aria-hidden="true">·</span>
                {{ scopeLabel }}
            </span>

            <button v-if="activeCount" class="ot-filterchip" @click="clearFilters">
                Clear {{ activeCount }} filter(s) <span class="x" aria-hidden="true">✕</span>
            </button>
            <div class="grow"></div>
        </div>

        <div class="ot-grid sidebar">
            <div class="ot-stack">
                <!-- The approval queue is a decision list, not a table: it is ordered by how long
                     someone has been waiting on a human. -->
                <OmniTraderCard v-if="awaiting.length" title="Awaiting approval" attention
                                :subtitle="`${awaiting.length} order(s) held for a human decision`" flush>
                    <table class="ot-table">
                        <thead>
                            <tr>
                                <th>Order</th><th>Venue</th><th class="num">Size</th>
                                <th class="num">Waiting</th><th class="num">Decision</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="order in awaiting" :key="order.Id" class="attention">
                                <td>
                                    <span class="cellstack">
                                        <span><strong>{{ order.Side }}</strong> {{ order.InstrumentId }}</span>
                                        <span class="sub">{{ order.Type }} · {{ order.StrategyId ?? 'manual ticket' }}</span>
                                    </span>
                                </td>
                                <td>
                                    <span class="cellstack">
                                        <span class="ot-chip" :class="envClass(order.Environment)">{{ order.Environment }}</span>
                                        <span class="sub">{{ order.Venue }}</span>
                                    </span>
                                </td>
                                <td class="num">{{ fmtNum(order.Quantity) }}</td>
                                <td class="num">{{ fmtAgo(order.CreatedUtc) }}</td>
                                <td class="num nowrap">
                                    <button class="ot-btn sm ghost" @click="openOrder(order.Id)">Why held</button>
                                    <button class="ot-btn sm" :disabled="busy" @click="approve(order)">Approve</button>
                                    <button class="ot-btn sm danger" :disabled="busy" @click="reject(order)">Reject</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </OmniTraderCard>

                <OmniTraderCard title="Order blotter" subtitle="Click a row for the full lifecycle and its risk decision"
                                flush :loading="loading" :empty="!orders.length" :error="error" @retry="load"
                                :empty-kind="activeCount ? 'filtered' : 'empty'"
                                empty-title="No orders match"
                                empty-text="Nothing in the recent set matches these filters.">
                    <OmniTraderDataTable :rows="orders" :columns="columns" label="orders" pinned selectable
                                         :row-key="o => o.Id" :selected-key="detail?.Order?.Id ?? null"
                                         :server-filtered="result.Filtered" :server-total="result.Total"
                                         :row-class="o => o.BlocksAutomation ? 'attention' : ''"
                                         default-sort="CreatedUtc" max-height="640px"
                                         search-placeholder="Filter loaded rows…"
                                         @select="openOrder($event.Id)">
                        <template #cell-State="{ row }">
                            <span class="cellstack">
                                <span class="ot-chip" :class="orderStateTone(row.State)">{{ row.State }}</span>
                                <span v-if="row.Error" class="sub" style="color:var(--ot-negative)">{{ row.Error }}</span>
                            </span>
                        </template>
                        <template #cell-InstrumentId="{ row }">
                            <span class="cellstack">
                                <span><strong :class="row.Side === 'Buy' ? 'pos' : 'neg'">{{ row.Side }}</strong> {{ row.InstrumentId }}</span>
                                <span class="sub mono">{{ row.ClientReference }}</span>
                            </span>
                        </template>
                        <template #cell-Venue="{ row }">
                            <span class="cellstack">
                                <span class="ot-chip" :class="envClass(row.Environment)">{{ row.Environment }}</span>
                                <span class="sub">{{ row.Venue }} · {{ row.VenueSymbol }}</span>
                            </span>
                        </template>
                        <template #cell-Quantity="{ row }">
                            <span class="cellstack">
                                <span>{{ fmtNum(row.Quantity) }}</span>
                                <span class="sub">{{ fmtNum(row.FilledQuantity) }} filled</span>
                            </span>
                        </template>
                        <template #cell-AverageFillPrice="{ row }">
                            <span class="cellstack">
                                <span>{{ row.AverageFillPrice ? fmtNum(row.AverageFillPrice, 6) : '—' }}</span>
                                <span class="sub">decided {{ fmtNum(row.DecisionPrice, 6) }}</span>
                            </span>
                        </template>
                        <template #cell-SlippageBps="{ row }">
                            <span :class="(row.SlippageBps ?? 0) > 0 ? 'neg' : 'pos'">{{ fmtBps(row.SlippageBps) }}</span>
                        </template>
                        <template #cell-LatencyMs="{ row }">{{ fmtMs(row.LatencyMs) }}</template>
                        <template #cell-StrategyId="{ row }">{{ row.StrategyId ?? 'manual' }}</template>
                        <template #cell-CreatedUtc="{ row }">
                            <span :title="fmtTime(row.CreatedUtc)">{{ fmtAgo(row.CreatedUtc) }}</span>
                        </template>
                    </OmniTraderDataTable>
                </OmniTraderCard>
            </div>

            <!-- capability-driven order ticket -->
            <OmniTraderCard title="Order ticket" subtitle="Venue-aware: it renders what this venue can do"
                            class="ticket">
                <div class="ot-field" style="margin-bottom:12px">
                    <label for="tk-instrument">Instrument</label>
                    <input id="tk-instrument" class="ot-input" v-model="ticketForm.instrument"
                           list="instrument-options" placeholder="crypto:BTC/USD" @change="loadTicket" />
                    <datalist id="instrument-options">
                        <option v-for="i in instrumentOptions" :key="i.Id" :value="i.Id">{{ i.DisplayName }}</option>
                    </datalist>
                </div>

                <div class="ot-formgrid" style="margin-bottom:12px">
                    <div class="ot-field">
                        <label for="tk-venue">Venue</label>
                        <select id="tk-venue" class="ot-select" v-model="ticketForm.venue" @change="loadTicket">
                            <option v-for="v in venueOptions" :key="v" :value="v">{{ v }}</option>
                        </select>
                    </div>
                    <div class="ot-field">
                        <label for="tk-account">Account</label>
                        <select id="tk-account" class="ot-select" v-model="ticketForm.accountId">
                            <option v-for="a in accountOptions" :key="a.Id" :value="a.Id">
                                {{ a.DisplayName }} ({{ a.Environment }})
                            </option>
                        </select>
                        <span v-if="selectedAccount" class="help">
                            Authority: {{ selectedAccount.Authority }}
                        </span>
                    </div>
                </div>

                <!-- Size against what this account can actually spend. The venue's own figure, so a
                     percentage means the same thing here as it will at the broker. -->
                <div v-if="ticketForm.side === 'Buy'" class="sizer">
                    <header>
                        <span class="label">Spending power</span>
                        <b v-if="spendingPower !== null" class="mono">
                            {{ accountCurrency }} {{ fmtNum(spendingPower, 2) }}
                        </b>
                        <span v-else class="muted">{{ selectedAccount?.Issue ?? 'not reported by this venue' }}</span>
                    </header>

                    <template v-if="spendingPower !== null && spendingPower > 0">
                        <div class="shortcuts">
                            <button v-for="p in SPEND_STEPS" :key="p" type="button" class="ot-btn sm"
                                    :class="spendPercent === p ? 'primary' : 'ghost'"
                                    @click="applyPercent(p)">{{ p }}%</button>
                        </div>

                        <input class="slider" type="range" min="0" max="100" step="1"
                               :value="spendPercent" aria-label="Percentage of spending power"
                               @input="applyPercent(Number(($event.target as HTMLInputElement).value))" />

                        <div class="amounts">
                            <label class="ot-field">
                                <span>Percent</span>
                                <input class="ot-input mono" type="number" min="0" max="100" step="0.1"
                                       :value="spendPercent"
                                       @input="applyPercent(Number(($event.target as HTMLInputElement).value))" />
                            </label>
                            <label class="ot-field">
                                <span>Amount ({{ accountCurrency }})</span>
                                <input class="ot-input mono" type="number" min="0" step="any"
                                       :value="spendAmount"
                                       @input="applyAmount(Number(($event.target as HTMLInputElement).value))" />
                            </label>
                        </div>

                        <p v-if="spendOverpower" class="warnline">
                            That is more than this account can spend.
                        </p>
                        <p v-else-if="!ticket?.Mark" class="warnline">
                            No mark price yet, so an amount cannot be turned into a quantity.
                        </p>
                    </template>
                </div>

                <div v-if="ticket" class="ticketinfo">
                    <dl class="ot-kv">
                        <dt>Mark</dt>
                        <dd :class="{ 'ot-stale': ticket.Freshness?.Stale }" :title="ticket.Freshness?.Issue ?? ''">
                            {{ fmtNum(ticket.Mark, 6) }}
                            <span v-if="ticket.Freshness?.Stale" class="ot-chip warn">stale</span>
                        </dd>
                        <dt>Exposure</dt>
                        <dd>{{ ticket.Instrument?.Exposure === 'Derivative' ? 'CFD notional' : 'owned inventory' }}</dd>
                        <dt v-if="dealing">Min / step</dt>
                        <dd v-if="dealing">{{ fmtNum(dealing.MinQuantity, 8) }} / {{ fmtNum(dealing.QuantityStep, 8) }}</dd>
                        <dt>Free inventory</dt><dd>{{ fmtNum(ticket.FreeInventory, 8) }}</dd>
                    </dl>
                </div>
                <OmniTraderStateBlock v-else compact title="No ticket loaded"
                                      detail="Choose an instrument the instrument master knows about." />

                <div class="ot-formgrid" style="margin:12px 0">
                    <div class="ot-field">
                        <label for="tk-side">Side</label>
                        <select id="tk-side" class="ot-select" v-model="ticketForm.side">
                            <option value="Buy">Buy</option>
                            <option value="Sell">Sell</option>
                        </select>
                    </div>
                    <div class="ot-field" :class="{ blocked: !supports(ticketForm.type) }">
                        <label for="tk-type">Type</label>
                        <select id="tk-type" class="ot-select" v-model="ticketForm.type">
                            <option v-for="t in ORDER_TYPES" :key="t" :value="t" :disabled="!supports(t)">
                                {{ t }}{{ supports(t) ? '' : ' — unsupported here' }}
                            </option>
                        </select>
                        <span v-if="!supports(ticketForm.type)" class="help">
                            {{ ticket?.Capabilities?.Limitations?.OrderTypes ?? `${ticketForm.venue} does not support this order type.` }}
                        </span>
                    </div>
                    <div class="ot-field" :class="{ invalid: !!quantityIssue }">
                        <label for="tk-qty">Quantity</label>
                        <input id="tk-qty" class="ot-input mono" type="number" step="any" min="0"
                               v-model.number="ticketForm.quantity" />
                        <span v-if="quantityIssue" class="help">{{ quantityIssue }}</span>
                    </div>
                    <div class="ot-field" v-if="ticketForm.type === 'Limit'">
                        <label for="tk-limit">Limit price</label>
                        <input id="tk-limit" class="ot-input mono" type="number" step="any"
                               v-model.number="ticketForm.limitPrice" />
                    </div>
                    <div class="ot-field" :class="{ blocked: !protectionSupported }">
                        <label for="tk-sl">Stop loss</label>
                        <input id="tk-sl" class="ot-input mono" type="number" step="any"
                               v-model.number="ticketForm.stopLoss" :disabled="!protectionSupported" />
                        <span v-if="!protectionSupported" class="help">
                            {{ ticket?.Capabilities?.Limitations?.SupportsAttachedProtection ?? 'Attached protection is not supported here.' }}
                        </span>
                    </div>
                    <div class="ot-field" :class="{ blocked: !protectionSupported }">
                        <label for="tk-tp">Take profit</label>
                        <input id="tk-tp" class="ot-input mono" type="number" step="any"
                               v-model.number="ticketForm.takeProfit" :disabled="!protectionSupported" />
                    </div>
                    <div class="ot-field">
                        <label for="tk-auth">Authority</label>
                        <select id="tk-auth" class="ot-select" v-model="ticketForm.authority">
                            <option value="ApprovalRequired">Approval required</option>
                            <option value="Automated">Automated</option>
                            <option value="Paper">Paper</option>
                        </select>
                    </div>
                </div>

                <div class="estimate">
                    <span>Estimated notional</span>
                    <strong class="mono">{{ fmtNum(estimatedNotional, 2) }}</strong>
                </div>

                <div v-if="shortBlocked" class="ot-banner warn" style="margin:12px 0 0">
                    <span class="glyph" aria-hidden="true">⚠</span>
                    <div>{{ ticket?.Capabilities?.Limitations?.SupportsShort ?? 'This venue cannot take short exposure, and you do not hold enough to sell.' }}</div>
                </div>

                <button class="ot-btn primary block" style="margin-top:12px"
                        :disabled="busy || !!quantityIssue || !ticketForm.quantity" @click="propose">
                    {{ busy ? 'Evaluating…' : 'Run risk check & submit' }}
                </button>
                <p class="fineprint">
                    Every ticket passes the risk engine first. Nothing reaches a broker without a recorded
                    decision, and a proposal cannot skip straight to submission.
                </p>
            </OmniTraderCard>
        </div>

        <!-- The risk verdict blocks: it is the answer to the action you just took. -->
        <div v-if="decisionResult" class="ot-modal-backdrop" @click.self="decisionResult = null">
            <div class="ot-modal" role="dialog" aria-modal="true" aria-label="Risk decision">
                <header>
                    <h3>
                        Risk decision
                        <span class="ot-chip" :class="verdictTone(decisionResult.Decision.Verdict)">
                            {{ decisionResult.Decision.Verdict }}
                        </span>
                    </h3>
                    <button class="ot-btn ghost sm" @click="decisionResult = null">Close ✕</button>
                </header>
                <div class="body">
                    <p class="lead">{{ decisionResult.Message || decisionResult.Decision.Summary }}</p>
                    <div class="ot-kpis tight">
                        <OmniTraderKpi label="Projected gross" small
                                       :value="fmtNum(decisionResult.Decision.ProjectedGrossExposure, 2)"
                                       foot="after this trade" />
                        <OmniTraderKpi label="Projected net" small
                                       :value="fmtNum(decisionResult.Decision.ProjectedNetExposure, 2)"
                                       foot="after this trade" />
                        <OmniTraderKpi label="Outcome" small
                                       :value="decisionResult.Submitted ? 'Submitted' : decisionResult.AwaitingApproval ? 'Held' : 'Blocked'"
                                       :tone="decisionResult.Submitted ? 'good' : decisionResult.AwaitingApproval ? 'warn' : 'bad'" />
                    </div>
                    <h4 class="ot-sectionhead" style="margin-top:16px">All seven layers</h4>
                    <OmniTraderRuleList :rules="decisionResult.Decision.Rules" />
                </div>
                <footer>
                    <button class="ot-btn ghost" @click="decisionResult = null">Done</button>
                </footer>
            </div>
        </div>

        <!-- Order detail -->
        <OmniTraderDrawer :open="!!detail" @close="detail = null"
                          :title="detail ? `${detail.Order.Side} ${detail.Order.InstrumentId}` : ''">
            <template #subtitle v-if="detail">
                <span class="ot-chip" :class="orderStateTone(detail.Order.State)">{{ detail.Order.State }}</span>
                <span class="ot-chip" :class="envClass(detail.Order.Environment)">{{ detail.Order.Environment }}</span>
                {{ detail.Order.Venue }}
            </template>

            <template v-if="detail">
                <div v-if="detail.Order.State === 'Unknown'" class="ot-banner">
                    <span class="glyph" aria-hidden="true">⛔</span>
                    <div>
                        <strong>Outcome unproven</strong>
                        Do not resubmit. Query the broker by client reference — reconciliation is the only
                        thing that can resolve this state.
                    </div>
                </div>

                <h4 class="ot-sectionhead">Order</h4>
                <dl class="ot-kv">
                    <dt>Idempotency key</dt><dd>{{ detail.Order.ClientReference }}</dd>
                    <dt>Broker order</dt><dd>{{ detail.Order.VenueOrderId ?? 'none recorded' }}</dd>
                    <dt>Account</dt><dd>{{ detail.Order.AccountId }}</dd>
                    <dt>Quantity</dt>
                    <dd>{{ fmtNum(detail.Order.Quantity) }} ({{ fmtNum(detail.Order.FilledQuantity) }} filled)</dd>
                    <dt>Average fill</dt><dd>{{ detail.Order.AverageFillPrice ? fmtNum(detail.Order.AverageFillPrice, 6) : '—' }}</dd>
                    <dt>Decision price</dt><dd>{{ fmtNum(detail.Order.DecisionPrice, 6) }}</dd>
                    <dt>Slippage</dt><dd>{{ fmtBps(detail.Order.SlippageBps) }}</dd>
                    <dt>Latency</dt><dd>{{ fmtMs(detail.Order.LatencyMs) }}</dd>
                    <dt>Fees</dt><dd>{{ fmtNum(detail.Order.Fees, 6) }} {{ detail.Order.FeeCurrency }}</dd>
                    <dt>Approved by</dt><dd>{{ detail.Order.ApprovedBy ?? '—' }}</dd>
                    <dt v-if="detail.Order.Error">Error</dt>
                    <dd v-if="detail.Order.Error" class="neg">{{ detail.Order.Error }}</dd>
                </dl>

                <h4 class="ot-sectionhead" style="margin-top:20px">Lifecycle</h4>
                <ol class="ot-timeline">
                    <li v-for="(t, index) in detail.History" :key="index">
                        <span class="mono">{{ t.From }} → <strong>{{ t.To }}</strong></span>
                        <span class="sub">{{ fmtTime(t.AtUtc) }} · {{ t.Actor }}{{ t.Reason ? ` — ${t.Reason}` : '' }}</span>
                    </li>
                    <li v-if="!detail.History?.length" class="muted">No transitions recorded.</li>
                </ol>

                <h4 class="ot-sectionhead" style="margin-top:20px">Risk decision</h4>
                <OmniTraderRuleList v-if="detail.Decision" :rules="detail.Decision.Rules" />
                <OmniTraderStateBlock v-else compact title="No decision record"
                                      detail="Every order should have one — this is worth investigating." />
            </template>

            <template #footer>
                <button class="ot-btn ghost" @click="detail = null">Close</button>
                <button v-if="detail && !detail.Order.IsTerminal" class="ot-btn danger"
                        :disabled="busy" @click="cancel(detail.Order.Id)">Cancel order</button>
                <template v-if="detail?.Order.State === 'AwaitingApproval'">
                    <button class="ot-btn danger" :disabled="busy" @click="reject(detail.Order)">Reject</button>
                    <button class="ot-btn primary" :disabled="busy" @click="approve(detail.Order)">Approve</button>
                </template>
            </template>
        </OmniTraderDrawer>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Swal from 'sweetalert2';
import {
    useOmniTrader, useUrlState, fmtNum, fmtAgo, fmtTime, fmtBps, fmtMs, envClass,
    orderStateTone, verdictTone, SWAL_THEME, type FirmOrderRow,
} from '~/composables/useOmniTrader';
import type { TableColumn } from '~/components/OmniTrader/DataTable.vue';

definePageMeta({ layout: 'navbar' });

const route = useRoute();
const { get, post, environment, refreshOverview } = useOmniTrader();

const ORDER_TYPES = ['Market', 'Limit', 'StopLoss', 'TakeProfit'];
const FILTERS = [
    { value: '', label: 'All', states: [] as string[] },
    { value: 'AwaitingApproval', label: 'Approvals', states: ['AwaitingApproval'] },
    { value: 'Submitting,Acknowledged,Working,PartiallyFilled', label: 'Working', states: ['Submitting', 'Acknowledged', 'Working', 'PartiallyFilled'] },
    { value: 'Unknown', label: 'Unknown', states: ['Unknown'] },
    { value: 'Filled', label: 'Filled', states: ['Filled'] },
    { value: 'Rejected,RiskRejected,Cancelled', label: 'Rejected', states: ['Rejected', 'RiskRejected', 'Cancelled'] },
];

const { state: filters, reset, activeCount } = useUrlState({ state: '', q: '', venue: '' });

const result = ref<{ Rows: FirmOrderRow[]; Filtered: number; Total: number }>({ Rows: [], Filtered: 0, Total: 0 });
const facets = ref<{ StateCounts?: Record<string, number>; Venues?: string[] }>({});
const orders = computed(() => result.value.Rows);
const loading = ref(false);
const error = ref('');
const busy = ref(false);
const detail = ref<any>(null);
const decisionResult = ref<any>(null);
const ticket = ref<any>(null);
const instrumentOptions = ref<Array<{ Id: string; DisplayName: string }>>([]);
const instrumentVenues = ref<string[] | null>(null);

const columns: TableColumn[] = [
    { key: 'State', label: 'State', width: '130px', sortValue: o => o.State },
    { key: 'InstrumentId', label: 'Order', width: '230px', searchValue: o => `${o.Side} ${o.InstrumentId} ${o.ClientReference}` },
    { key: 'Venue', label: 'Venue', width: '130px' },
    { key: 'Quantity', label: 'Qty / filled', num: true },
    { key: 'AverageFillPrice', label: 'Fill / decided', num: true },
    { key: 'SlippageBps', label: 'Slippage', num: true },
    { key: 'LatencyMs', label: 'Latency', num: true, optional: true },
    { key: 'StrategyId', label: 'Strategy', optional: true },
    { key: 'CreatedUtc', label: 'Created', num: true, width: '110px' },
];

const ticketForm = reactive({
    instrument: (route.query.instrument as string) ?? 'crypto:BTC/USD',
    venue: 'Internal',
    accountId: '',
    side: 'Buy',
    type: 'Market',
    quantity: 0,
    limitPrice: undefined as number | undefined,
    stopLoss: undefined as number | undefined,
    takeProfit: undefined as number | undefined,
    authority: 'ApprovalRequired',
});

interface TicketAccount {
    Id: string; DisplayName: string; Environment: string; Authority: string;
    Currency: string;
    /** What the venue says can be spent right now. Null when it could not be asked — which
     *  is a different fact from zero, and must not be sized against. */
    SpendingPower: number | null;
    Balance: number | null;
    Issue: string | null;
}

const accountOptions = computed<TicketAccount[]>(() => ticket.value?.Accounts ?? []);
const selectedAccount = computed(() => accountOptions.value.find(a => a.Id === ticketForm.accountId));
// Falls back to every venue the firm can reach, not the two it started with. The ticket
// still refuses anything the instrument has no mapping for.
const venueOptions = computed(() =>
    instrumentVenues.value?.length ? instrumentVenues.value : ['Internal', 'Kraken', 'IG', 'Trading212']);
const dealing = computed(() => ticket.value?.DealingRules);

const scopeLabel = computed(() =>
    environment.value === 'All' ? 'all environments' : `${environment.value.toLowerCase()} only`);

const awaiting = computed(() => orders.value.filter(o => o.State === 'AwaitingApproval'));
const unknownCount = computed(() => facets.value.StateCounts?.Unknown ?? 0);

const protectionSupported = computed(() => ticket.value?.Capabilities?.SupportsAttachedProtection ?? true);
const shortBlocked = computed(() =>
    ticketForm.side === 'Sell'
    && ticket.value?.Capabilities?.SupportsShort === false
    && (ticket.value?.FreeInventory ?? 0) < (ticketForm.quantity || 0));

const estimatedNotional = computed(() => (ticketForm.quantity || 0) * (ticketForm.limitPrice || ticket.value?.Mark || 0));

// ── sizing against spending power ────────────────────────────────────────────
// A percentage of buying power is how the decision is actually made ("put a fifth in"),
// but the venue takes a quantity. Quantity stays the single source of truth — the
// percentage and the amount are derived from it — so the two can never disagree, and
// typing a quantity directly still works.

const SPEND_STEPS = [5, 10, 20, 25, 50, 100];

const spendingPower = computed(() => selectedAccount.value?.SpendingPower ?? null);
const accountCurrency = computed(() => selectedAccount.value?.Currency ?? ticket.value?.Instrument?.QuoteCurrency ?? '');
/** The price an order would actually be sized at: a limit if one is set, else the mark. */
const sizingPrice = computed(() => ticketForm.limitPrice || ticket.value?.Mark || 0);

const spendAmount = computed(() => round((ticketForm.quantity || 0) * sizingPrice.value, 2));
const spendPercent = computed(() => {
    const power = spendingPower.value;
    if (!power || power <= 0) return 0;
    return round((spendAmount.value / power) * 100, 1);
});
const spendOverpower = computed(() =>
    spendingPower.value !== null && spendAmount.value > spendingPower.value + 0.005);

function round(n: number, dp: number): number {
    const f = 10 ** dp;
    return Number.isFinite(n) ? Math.round(n * f) / f : 0;
}

function applyPercent(percent: number) {
    const power = spendingPower.value;
    if (!power || power <= 0) return;
    applyAmount((power * Math.max(0, Math.min(100, percent))) / 100);
}

function applyAmount(amount: number) {
    const price = sizingPrice.value;
    if (!price || price <= 0 || !Number.isFinite(amount)) return;
    let quantity = amount / price;

    // Land on a size the venue will accept rather than one it will round or refuse:
    // step down so the order never costs more than the amount asked for.
    const step = dealing.value?.QuantityStep;
    if (step && step > 0) quantity = Math.floor(quantity / step) * step;
    ticketForm.quantity = round(quantity, 8);
}

// Say why a size is unacceptable before the broker does — the dealing rules are
// already on screen, so failing at the venue would be a self-inflicted round trip.
const quantityIssue = computed(() => {
    const q = ticketForm.quantity;
    if (!q) return '';
    if (q <= 0) return 'Quantity must be greater than zero.';
    const rules = dealing.value;
    if (!rules) return '';
    if (rules.MinQuantity && q < rules.MinQuantity) return `Below the venue minimum of ${fmtNum(rules.MinQuantity, 8)}.`;
    if (rules.MaxQuantity && q > rules.MaxQuantity) return `Above the venue maximum of ${fmtNum(rules.MaxQuantity, 8)}.`;
    if (rules.QuantityStep) {
        const steps = q / rules.QuantityStep;
        if (Math.abs(steps - Math.round(steps)) > 1e-8) {
            return `Must be a multiple of ${fmtNum(rules.QuantityStep, 8)}.`;
        }
    }
    return '';
});

function facetCount(filter: { states: string[] }): number | null {
    const counts = facets.value.StateCounts;
    if (!counts) return null;
    if (!filter.states.length) return Object.values(counts).reduce((a, b) => a + b, 0);
    return filter.states.reduce((sum, state) => sum + (counts[state] ?? 0), 0);
}

function supports(type: string): boolean {
    const types: string[] | undefined = ticket.value?.Capabilities?.OrderTypes;
    return !types || types.includes(type);
}

async function load() {
    loading.value = true;
    try {
        const data = await get<any>('/orders', {
            state: filters.state,
            q: filters.q,
            venue: filters.venue,
            environment: environment.value === 'All' ? '' : environment.value,
            limit: 300,
        });
        result.value = { Rows: data.Rows ?? [], Filtered: data.Filtered ?? 0, Total: data.Total ?? 0 };
        facets.value = { StateCounts: data.StateCounts, Venues: data.Venues };
        error.value = '';
    } catch (e: any) {
        error.value = e?.message ?? 'The blotter could not be loaded';
    } finally { loading.value = false; }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedLoad() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 300);
}

function clearFilters() { reset(); void load(); }

async function loadTicket() {
    if (!ticketForm.instrument) return;
    try {
        ticket.value = await get('/ticket', { instrument: ticketForm.instrument, venue: ticketForm.venue });
        const accounts = accountOptions.value;
        if (accounts.length && !accounts.some(a => a.Id === ticketForm.accountId)) {
            ticketForm.accountId = accounts[0].Id;
        }
    } catch { ticket.value = null; }
}

async function loadInstruments() {
    try {
        const all = await get<any[]>('/instruments', { q: '' });
        instrumentOptions.value = all.map(i => ({ Id: i.Id, DisplayName: i.DisplayName }));
        const current = all.find(i => i.Id === ticketForm.instrument);
        instrumentVenues.value = current ? current.Venues.map((v: any) => v.Venue) : null;
        if (instrumentVenues.value?.length && !instrumentVenues.value.includes(ticketForm.venue)) {
            ticketForm.venue = instrumentVenues.value[0];
        }
    } catch { /* the ticket still works with the default venue list */ }
}

async function propose() {
    busy.value = true;
    try {
        decisionResult.value = await post('/order/propose', undefined, {
            InstrumentId: ticketForm.instrument,
            Venue: ticketForm.venue,
            Environment: selectedAccount.value?.Environment ?? 'Paper',
            AccountId: ticketForm.accountId || `${ticketForm.venue}`.toLowerCase(),
            Side: ticketForm.side,
            Type: ticketForm.type,
            Quantity: ticketForm.quantity,
            LimitPrice: ticketForm.limitPrice,
            StopLossPrice: ticketForm.stopLoss,
            TakeProfitPrice: ticketForm.takeProfit,
            DecisionPrice: ticket.value?.Mark ?? 0,
            Authority: ticketForm.authority,
            Rationale: 'Manual ticket',
        });
        await load();
        await refreshOverview();
    } catch (e: any) {
        Swal.fire({ title: 'Ticket refused', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

async function openOrder(id: string) {
    try { detail.value = await get('/order', { id }); }
    catch (e: any) { Swal.fire({ title: 'Could not open order', text: e?.message, icon: 'error', ...SWAL_THEME }); }
}

async function approve(order: FirmOrderRow) {
    const live = order.Environment === 'Live';
    const confirmed = await Swal.fire({
        title: live ? 'Approve a LIVE order?' : 'Approve order?',
        html: `<code>${order.Side} ${order.Quantity} ${order.InstrumentId}</code><br>on <b>${order.Venue}</b> (${order.Environment})`,
        icon: live ? 'warning' : 'question', showCancelButton: true, ...SWAL_THEME,
        confirmButtonColor: live ? '#ff6b6b' : '#6ddc4f',
    });
    if (!confirmed.isConfirmed) return;

    busy.value = true;
    try {
        await post('/order/approve', { id: order.Id });
        detail.value = null;
        await load();
        await refreshOverview();
    } catch (e: any) {
        Swal.fire({ title: 'Approve failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

async function reject(order: FirmOrderRow) {
    const result = await Swal.fire({
        title: 'Reject order?', input: 'text', inputLabel: 'Reason (recorded in the audit trail)',
        showCancelButton: true, ...SWAL_THEME,
    });
    if (!result.isConfirmed) return;

    busy.value = true;
    try {
        await post('/order/reject', { id: order.Id, reason: result.value || 'rejected by operator' });
        detail.value = null;
        await load();
        await refreshOverview();
    } finally { busy.value = false; }
}

async function cancel(id: string) {
    busy.value = true;
    try {
        await post('/order/cancel', { id });
        detail.value = null;
        await load();
    } catch (e: any) {
        Swal.fire({ title: 'Cancel failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

async function reconcile() {
    busy.value = true;
    try {
        const outcome = await post<any>('/orders/reconcile');
        await load();
        await refreshOverview();
        Swal.fire({
            title: 'Reconciled against the broker',
            text: `${outcome.Reconciled} order(s) checked. ${outcome.StillUnknown} still unresolved.`,
            icon: outcome.StillUnknown ? 'warning' : 'success', ...SWAL_THEME,
        });
    } catch (e: any) {
        Swal.fire({ title: 'Reconcile failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

watch(() => ticketForm.instrument, () => { void loadInstruments(); void loadTicket(); });
watch(environment, load);

onMounted(async () => {
    await loadInstruments();
    await loadTicket();
    await load();
});
</script>

<style scoped>
.ticket { align-self: flex-start; }
.ticketinfo { padding: var(--ot-space-3); border-radius: var(--ot-radius-sm); background: rgba(255, 255, 255, 0.03); }
.estimate {
    display: flex;
    justify-content: space-between;
    padding: var(--ot-space-2) var(--ot-space-3);
    border-radius: var(--ot-radius-sm);
    background: var(--ot-accent-soft);
    font-size: 12.5px;
}
/* Sizing against spending power. Sits directly above the quantity field it drives, so
   the cause and the effect are visible at once. */
.sizer {
    display: flex;
    flex-direction: column;
    gap: var(--ot-space-2);
    padding: var(--ot-space-3);
    margin-bottom: var(--ot-space-3);
    border: 1px solid var(--ot-line);
    border-radius: var(--ot-radius-sm);
}
.sizer > header { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ot-space-2); }
.sizer .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ot-muted); }
.sizer > header b { font-size: 15px; font-weight: 620; }
.sizer .muted { font-size: 11.5px; color: var(--ot-muted); text-align: right; }

.sizer .shortcuts { display: flex; gap: var(--ot-space-1); flex-wrap: wrap; }
.sizer .shortcuts .ot-btn { flex: 1 1 auto; min-width: 52px; }

.sizer .slider { width: 100%; accent-color: var(--ot-accent); cursor: pointer; }

.sizer .amounts { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ot-space-2); }
.sizer .amounts .ot-field > span { font-size: 11px; color: var(--ot-muted); }

.sizer .warnline { margin: 0; font-size: 11.5px; color: var(--ot-warning); }

.fineprint { margin: var(--ot-space-2) 0 0; font-size: 11.5px; color: var(--ot-muted); line-height: 1.5; }
.lead { margin: 0 0 var(--ot-space-4); color: var(--ot-text-2); }
.facet { font-size: 10px; color: var(--ot-muted); margin-left: 4px; }
.visually-hidden {
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}
</style>
