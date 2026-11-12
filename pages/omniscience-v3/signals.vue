<template>
    <OmniscienceV3Shell>
        <div class="ot-pagehead">
            <div>
                <h1>Signals</h1>
                <p class="subtitle">What needs your attention: messages about you, watch-rule matches, replies you owe, and what the monitors noticed. Nothing here is ever about someone under 18.</p>
            </div>
            <div class="ot-actions">
                <button class="ot-btn ghost" type="button" @click="refreshTab()">Refresh</button>
            </div>
        </div>

        <div class="ot-segment tabs" role="tablist" aria-label="Signals">
            <button v-for="t in TABS" :key="t.value" type="button" role="tab" :aria-selected="filters.tab === t.value" :aria-pressed="filters.tab === t.value"
                    :data-testid="`signals-tab-${t.value}`" @click="filters.tab = t.value">
                {{ t.label }}<span v-if="badge(t.value)" class="ot-badge">{{ badge(t.value) }}</span>
            </button>
        </div>

        <!-- ── alerts ─────────────────────────────────────────────────────── -->
        <template v-if="filters.tab === 'alerts'">
            <div class="ot-filterbar">
                <div class="ot-segment" role="group" aria-label="Alert state">
                    <button v-for="s in ALERT_STATES" :key="s.value" type="button" :aria-pressed="filters.state === s.value" @click="filters.state = s.value">{{ s.label }}</button>
                </div>
                <select v-model="filters.kind" class="ot-select auto" aria-label="Alert kind">
                    <option value="">All kinds</option>
                    <option value="radar">About you (radar)</option>
                    <option value="watch">Watch rules</option>
                </select>
                <span class="summary"><b>{{ alerts.items.value.length }}</b> shown · {{ omniCount(unseenAlerts) }} new</span>
                <div class="grow"></div>
                <button v-if="canManage && unseenAlerts" class="ot-btn sm" type="button" :disabled="busy !== null" data-testid="alerts-all-seen" @click="allAlertsSeen()">Mark all as seen</button>
            </div>
            <OmniscienceV3Panel title="Alerts" flush :loading="alerts.loading.value" :error="alerts.error.value" :has-data="alerts.items.value.length > 0"
                                :empty="!alerts.items.value.length" :empty-kind="filters.state === 'New' ? 'ok' : 'empty'"
                                :empty-title="filters.state === 'New' ? 'Nothing new' : 'No alerts here'" @retry="alerts.reload()">
                <table class="ot-table" data-testid="alerts-table">
                    <thead><tr><th>When</th><th>What</th><th>Who</th><th>Where</th><th class="num">Hits</th><th>State</th><th v-if="canManage"></th></tr></thead>
                    <tbody>
                        <tr v-for="a in alerts.items.value" :key="a.alertId" class="clickable" :class="{ selected: filters.alert === a.alertId }" @click="filters.alert = a.alertId">
                            <td class="num"><OmniscienceV3Time :ms="a.lastHitMs" mode="age" /></td>
                            <td><span class="cellstack"><span>{{ a.kind === 'radar' ? omniHumanise(a.reason) : `Watch “${a.ruleName ?? a.ruleId}”` }}</span>
                                <span class="sub">{{ a.hits[0]?.excerpt ?? '' }}</span></span></td>
                            <td><NuxtLink v-if="a.personId" :to="personLink(a.personId)" @click.stop>{{ a.personName ?? a.personId }}</NuxtLink><span v-else class="omni-muted">—</span></td>
                            <td>{{ a.conversationTitle ?? a.platform }}</td>
                            <td class="num">{{ a.hitCount }}</td>
                            <td><span class="ot-chip" :class="a.state === 'new' ? 'info' : ''">{{ a.state }}</span>
                                <span v-if="a.verdict" class="ot-chip" :class="a.verdict === 'Correct' ? 'ok' : 'warn'">{{ a.verdict === 'Correct' ? 'right' : 'wrong' }}</span></td>
                            <td v-if="canManage" class="actions" @click.stop>
                                <button v-if="!a.verdict" class="ot-btn ghost sm" type="button" :disabled="busy !== null" title="This was right" @click="verdict(a, 'Correct')">✓</button>
                                <button v-if="!a.verdict" class="ot-btn ghost sm" type="button" :disabled="busy !== null" title="This was wrong" @click="verdict(a, 'Wrong')">✕</button>
                                <button v-if="a.state !== 'dismissed'" class="ot-btn ghost sm" type="button" :disabled="busy !== null" @click="setAlertState([a.alertId], 'Dismissed')">Dismiss</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <template v-if="alerts.hasMore.value" #footer>
                    <button class="ot-btn sm" type="button" :disabled="alerts.loadingMore.value" @click="alerts.loadMore()">{{ alerts.loadingMore.value ? 'Loading…' : 'Load older alerts' }}</button>
                </template>
            </OmniscienceV3Panel>

            <OmniTraderDrawer :open="!!selectedAlert" :title="selectedAlert ? (selectedAlert.kind === 'radar' ? omniHumanise(selectedAlert.reason) : `Watch “${selectedAlert.ruleName}”`) : ''"
                              :subtitle="selectedAlert?.conversationTitle ?? undefined" @close="filters.alert = ''">
                <template v-if="selectedAlert">
                    <dl class="ot-kv">
                        <dt>Who</dt><dd>{{ selectedAlert.personName ?? '—' }}</dd>
                        <dt>First</dt><dd><OmniscienceV3Time :ms="selectedAlert.occurredAtMs" /></dd>
                        <dt>Latest</dt><dd><OmniscienceV3Time :ms="selectedAlert.lastHitMs" /></dd>
                        <dt>Confidence</dt><dd>{{ omniPercent(selectedAlert.probability) }}</dd>
                        <dt>Delivery</dt><dd>{{ selectedAlert.delivery }}</dd>
                    </dl>
                    <section class="omni-section">
                        <h4>Messages ({{ selectedAlert.hitCount }})</h4>
                        <ul class="hits">
                            <li v-for="h in selectedAlert.hits" :key="h.messageId" :class="{ gone: h.deleted }">
                                <span class="omni-muted"><OmniscienceV3Time :ms="h.atMs" mode="age" /> · {{ omniHumanise(h.reason) }}</span>
                                <span>{{ h.deleted ? '(deleted at the source)' : h.excerpt ?? '…' }}</span>
                            </li>
                        </ul>
                    </section>
                </template>
            </OmniTraderDrawer>
        </template>

        <!-- ── reply inbox ───────────────────────────────────────────────── -->
        <template v-else-if="filters.tab === 'inbox'">
            <div class="ot-filterbar">
                <div class="ot-segment" role="group" aria-label="Inbox state">
                    <button v-for="s in INBOX_STATES" :key="s" type="button" :aria-pressed="filters.inbox === s" @click="filters.inbox = s">{{ omniHumanise(s) }}</button>
                </div>
                <span class="summary"><b>{{ omniCount(inbox.data.value?.open) }}</b> waiting for a reply</span>
            </div>
            <OmniscienceV3Panel title="Replies you owe" flush :loading="inbox.loading.value" :error="inbox.error.value" :has-data="!!inbox.data.value"
                                :empty="!!inbox.data.value && !inbox.data.value.items.length" :empty-kind="filters.inbox === 'open' ? 'ok' : 'empty'"
                                :empty-title="filters.inbox === 'open' ? 'Nobody is waiting on you' : 'Nothing here'" @retry="inbox.refresh()">
                <table v-if="inbox.data.value" class="ot-table" data-testid="inbox-table">
                    <thead><tr><th>Who</th><th>Message</th><th>Where</th><th class="num">Waiting</th><th v-if="canManage"></th></tr></thead>
                    <tbody>
                        <tr v-for="i in inbox.data.value.items" :key="i.itemId">
                            <td><NuxtLink :to="personLink(i.personId)">{{ i.personName ?? i.personId }}</NuxtLink>
                                <span v-if="i.live" class="ot-chip sm info">live</span></td>
                            <td><span class="cellstack"><span>{{ i.excerpt ?? '…' }}</span><span class="sub">{{ omniHumanise(i.kind) }} · {{ omniHumanise(i.reason) }}</span></span></td>
                            <td>{{ i.conversationTitle ?? i.platform }}</td>
                            <td class="num">{{ i.state === 'snoozed' && i.snoozedUntilMs ? `until ${at(i.snoozedUntilMs)}` : waitText(i.waitingMs) }}</td>
                            <td v-if="canManage" class="actions">
                                <template v-if="i.state === 'open'">
                                    <button class="ot-btn ghost sm" type="button" :disabled="busy !== null" @click="resolve([i.itemId], 'Snooze', DAY)">Snooze a day</button>
                                    <button class="ot-btn ghost sm" type="button" :disabled="busy !== null" @click="resolve([i.itemId], 'Dismiss')">Dismiss</button>
                                </template>
                                <button v-else class="ot-btn ghost sm" type="button" :disabled="busy !== null" @click="resolve([i.itemId], 'Reopen')">Reopen</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </OmniscienceV3Panel>
        </template>

        <!-- ── notices ──────────────────────────────────────────────────── -->
        <template v-else-if="filters.tab === 'notices'">
            <div class="ot-filterbar">
                <div class="ot-segment" role="group" aria-label="Notice state">
                    <button v-for="s in ALERT_STATES" :key="s.value" type="button" :aria-pressed="filters.nstate === s.value" @click="filters.nstate = s.value">{{ s.label }}</button>
                </div>
                <select v-model="filters.nkind" class="ot-select auto" aria-label="Notice kind">
                    <option value="">All kinds</option>
                    <option v-for="k in NOTICE_KINDS" :key="k" :value="k">{{ omniHumanise(k) }}</option>
                </select>
                <span class="summary"><b>{{ omniCount(unseenNotices) }}</b> new</span>
                <div class="grow"></div>
                <button v-if="canManage && unseenNotices" class="ot-btn sm" type="button" :disabled="busy !== null" @click="allNoticesSeen()">Mark all as seen</button>
            </div>
            <OmniscienceV3Panel title="Notices" flush :loading="notices.loading.value" :error="notices.error.value" :has-data="notices.items.value.length > 0"
                                :empty="!notices.items.value.length" empty-title="Nothing noticed" @retry="notices.reload()">
                <ul class="notices" data-testid="notices-list">
                    <li v-for="n in notices.items.value" :key="n.noticeId" :class="n.severity.toLowerCase()">
                        <span class="ot-chip sm" :class="severityTone(n.severity)">{{ omniHumanise(n.kind) }}</span>
                        <span class="text">{{ findingText(n.kind, n.data, n.personName, n.otherPersonName) }}</span>
                        <NuxtLink v-if="n.personId" class="omni-muted" :to="personLink(n.personId)">person</NuxtLink>
                        <span class="omni-muted"><OmniscienceV3Time :ms="n.occurredAtMs" mode="age" /></span>
                        <button v-if="canManage && n.state === 'new'" class="ot-btn ghost sm" type="button" :disabled="busy !== null" @click="setNoticeState([n.noticeId], 'Seen')">Seen</button>
                        <button v-if="canManage && n.state !== 'dismissed'" class="ot-btn ghost sm" type="button" :disabled="busy !== null" @click="setNoticeState([n.noticeId], 'Dismissed')">Dismiss</button>
                    </li>
                </ul>
                <template v-if="notices.hasMore.value" #footer>
                    <button class="ot-btn sm" type="button" :disabled="notices.loadingMore.value" @click="notices.loadMore()">{{ notices.loadingMore.value ? 'Loading…' : 'Load older notices' }}</button>
                </template>
            </OmniscienceV3Panel>
        </template>

        <!-- ── watch rules ──────────────────────────────────────────────── -->
        <template v-else-if="filters.tab === 'watches'">
            <div class="ot-grid sidebar">
                <OmniscienceV3Panel title="Watch rules" flush :loading="watches.loading.value" :error="watches.error.value" :has-data="!!watches.data.value"
                                    :empty="!!watches.data.value && !watches.data.value.rules.length" empty-title="No watch rules"
                                    empty-text="A watch rule describes, in your words, messages you want to hear about; the model reads new messages against it." @retry="watches.refresh()">
                    <table v-if="watches.data.value" class="ot-table" data-testid="watch-table">
                        <thead><tr><th>Rule</th><th>State</th><th class="num">Matched</th><th class="num">Last match</th><th v-if="canManage"></th></tr></thead>
                        <tbody>
                            <tr v-for="w in watches.data.value.rules" :key="w.watchId">
                                <td><span class="cellstack"><strong>{{ w.name }}</strong><span class="sub">{{ w.definition.text }}</span></span></td>
                                <td><span class="ot-chip" :class="w.enabled ? omniStateTone(w.state) : ''">{{ w.enabled ? w.state : 'off' }}</span>
                                    <span v-if="w.reason" class="sub">{{ w.reason }}</span></td>
                                <td class="num">{{ omniCount(w.matched) }} / {{ omniCount(w.checked) }}</td>
                                <td class="num"><OmniscienceV3Time :ms="w.lastMatchMs" mode="age" /></td>
                                <td v-if="canManage" class="actions">
                                    <button class="ot-btn ghost sm" type="button" @click="editWatch(w)">Edit</button>
                                    <button class="ot-btn ghost sm" type="button" :disabled="busy !== null" @click="toggleWatch(w)">{{ w.enabled ? 'Turn off' : 'Turn on' }}</button>
                                    <button class="ot-btn ghost sm" type="button" :disabled="busy !== null" @click="deleteWatch(w)">Delete</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </OmniscienceV3Panel>
                <OmniTraderCard v-if="canManage" :title="draft.watchId ? 'Edit watch rule' : 'New watch rule'">
                    <form class="omni-form" data-testid="watch-form" @submit.prevent="saveWatch()">
                        <div class="ot-field"><label for="w-name">Name</label><input id="w-name" v-model="draft.name" class="ot-input" maxlength="80" required /></div>
                        <div class="ot-field"><label for="w-text">What to watch for</label>
                            <textarea id="w-text" v-model="draft.text" class="ot-input" rows="4" maxlength="2000" required placeholder="e.g. someone asking where I am going to be this weekend"></textarea>
                            <span class="help">In plain words. It is never about people under 18, and never about a person's private traits.</span></div>
                        <div class="ot-field"><label for="w-guilds">Only in these servers (ids, optional)</label><input id="w-guilds" v-model="draft.guilds" class="ot-input mono" placeholder="comma separated" /></div>
                        <div class="ot-field"><label for="w-conv">Only in these conversations (ids, optional)</label><input id="w-conv" v-model="draft.conversations" class="ot-input mono" placeholder="comma separated" /></div>
                        <label class="ot-check"><input v-model="draft.enabled" type="checkbox" /> On</label>
                        <div class="omni-row">
                            <button class="ot-btn primary" type="submit" :disabled="busy !== null || !draft.name.trim() || !draft.text.trim()">{{ draft.watchId ? 'Save changes' : 'Create rule' }}</button>
                            <button v-if="draft.watchId" class="ot-btn ghost" type="button" @click="resetDraft()">Cancel</button>
                        </div>
                    </form>
                </OmniTraderCard>
            </div>
        </template>

        <!-- ── check-ins ────────────────────────────────────────────────── -->
        <template v-else>
            <OmniscienceV3Panel title="Check-in suggestions" flush :loading="wellbeing.loading.value" :error="wellbeing.error.value" :has-data="!!wellbeing.data.value"
                                :empty="!!wellbeing.data.value && !wellbeing.data.value.suggestions.length"
                                :empty-title="wellbeing.data.value && !wellbeing.data.value.enabled ? 'Check-in suggestions are switched off' : 'No suggestions'"
                                empty-text="A suggestion appears when someone close to you has gone unusually quiet or low for a while. It is a prompt to reach out, not a judgement." @retry="wellbeing.refresh()">
                <ul v-if="wellbeing.data.value" class="notices" data-testid="checkins-list">
                    <li v-for="s in wellbeing.data.value.suggestions" :key="s.suggestionId">
                        <span class="ot-chip sm info">{{ omniHumanise(s.kind) }}</span>
                        <span class="text"><NuxtLink :to="personLink(s.personId)">{{ s.personName ?? s.personId }}</NuxtLink> · week {{ s.week }}
                            <span v-if="s.resourceText" class="sub">{{ s.resourceText }}</span></span>
                        <span class="ot-chip sm">{{ s.state }}</span>
                        <template v-if="canManage && s.state === 'new'">
                            <button class="ot-btn ghost sm" type="button" :disabled="busy !== null" @click="setCheckin(s.suggestionId, 'done')">I reached out</button>
                            <button class="ot-btn ghost sm" type="button" :disabled="busy !== null" @click="setCheckin(s.suggestionId, 'dismissed')">Dismiss</button>
                        </template>
                    </li>
                </ul>
            </OmniscienceV3Panel>
        </template>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { OMNI_BASE, omniGet, omniPost } from '~/scripts/omniscience/api';
import type {
    AlertDto, AlertFeedbackResultDto, AlertPageDto, AlertState, AlertStateResultDto, AlertVerdict, InboxAction, InboxPageDto, InboxResolveResultDto,
    NoticeDto, NoticePageDto, NoticeStateResultDto, WatchDeletedDto, WatchListDto, WatchRuleDto, WellbeingListDto, WellbeingStateDto,
} from '~/scripts/omniscience/contracts';
import { omniCount, omniPercent, omniStateTone } from '~/scripts/omniscience/format';
import { findingText, omniHumanise, waitText } from '~/scripts/omniscience/findings';
import { useOmniAction, useOmniDebounced, useOmniPaged, useOmniResource, useOmniTime } from '~/composables/useOmniscienceV3';
import { useUrlState } from '~/composables/useOmniTrader';
import { useAccess } from '~/composables/useAccess';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Signals' });

type Tab = 'alerts' | 'inbox' | 'notices' | 'watches' | 'checkins';
const TABS: { value: Tab; label: string }[] = [
    { value: 'alerts', label: 'Alerts' }, { value: 'inbox', label: 'Reply inbox' }, { value: 'notices', label: 'Notices' },
    { value: 'watches', label: 'Watch rules' }, { value: 'checkins', label: 'Check-ins' },
];
const ALERT_STATES: { value: AlertState | ''; label: string }[] = [
    { value: 'New', label: 'New' }, { value: 'Seen', label: 'Seen' }, { value: 'Dismissed', label: 'Dismissed' }, { value: '', label: 'All' },
];
const INBOX_STATES = ['open', 'snoozed', 'answered', 'dismissed', 'stale'];
const NOTICE_KINDS = ['person_activity', 'new_person', 'topic_surge', 'klives_tone', 'data_health', 'relationship', 'wellbeing'];
const DAY = 86_400_000;

const { can } = useAccess();
const canManage = computed(() => can('omniscience.alerts.manage'));
const { busy, run } = useOmniAction();
const { at } = useOmniTime();
const { state: filters } = useUrlState({ tab: 'alerts' as Tab, state: 'New' as AlertState | '', kind: '', alert: '', inbox: 'open', nstate: 'New' as AlertState | '', nkind: '' });

function personLink(id: string): string { return `${OMNI_BASE}/people/${encodeURIComponent(id)}`; }
function severityTone(severity: string): string {
    const s = severity.toLowerCase();
    return s === 'urgent' ? 'bad' : s === 'attention' ? 'warn' : 'info';
}

// ── alerts ─────────────────────────────────────────────────────────────────
const unseenAlerts = ref<number | null>(null);
const alerts = useOmniPaged<AlertDto, string>(async (cursor, signal) => {
    const page = await omniGet<AlertPageDto>('signals/alerts', { state: filters.state, kind: filters.kind, cursor, limit: 50 }, signal);
    unseenAlerts.value = page.unseen;
    return page;
});
useOmniDebounced(() => `${filters.state}|${filters.kind}`, () => { void alerts.reload(); }, 50);
const selectedAlert = computed(() => alerts.items.value.find(a => a.alertId === filters.alert) ?? null);

async function setAlertState(ids: string[], state: AlertState) {
    const result = await run('alert-state', () => omniPost<AlertStateResultDto>('signals/alerts/state', { state, alertIds: ids, all: false }));
    if (result) { unseenAlerts.value = result.unseen; void alerts.reload(true); }
}
async function allAlertsSeen() {
    const result = await run('alert-state', () => omniPost<AlertStateResultDto>('signals/alerts/state', { state: 'Seen', all: true, kind: filters.kind || null }),
        r => `${r.changed} alert${r.changed === 1 ? '' : 's'} marked as seen.`);
    if (result) { unseenAlerts.value = result.unseen; void alerts.reload(true); }
}
async function verdict(alert: AlertDto, value: AlertVerdict) {
    const result = await run('verdict', () => omniPost<AlertFeedbackResultDto>('signals/alerts/feedback', { alertId: alert.alertId, verdict: value, messageId: alert.messageId }),
        r => (r.classifierCorrected ? 'Thanks: the classifier learns from this.' : 'Thanks: noted.'));
    if (result) void alerts.reload(true);
}

// ── inbox ──────────────────────────────────────────────────────────────────
const inbox = useOmniResource(signal => omniGet<InboxPageDto>('signals/inbox', { state: filters.inbox, limit: 100 }, signal));
useOmniDebounced(() => filters.inbox, () => { void inbox.refresh(); }, 50);
async function resolve(ids: string[], action: InboxAction, forMs?: number) {
    const untilMs = forMs ? Date.now() + forMs : null;
    const result = await run('inbox', () => omniPost<InboxResolveResultDto>('signals/inbox/resolve', { itemIds: ids, action, untilMs }));
    if (result) void inbox.refresh();
}

// ── notices ────────────────────────────────────────────────────────────────
const unseenNotices = ref<number | null>(null);
const notices = useOmniPaged<NoticeDto, string>(async (cursor, signal) => {
    const page = await omniGet<NoticePageDto>('signals/notices', { state: filters.nstate, kind: filters.nkind, cursor, limit: 50 }, signal);
    unseenNotices.value = page.unseen;
    return page;
});
useOmniDebounced(() => `${filters.nstate}|${filters.nkind}`, () => { void notices.reload(); }, 50);
async function setNoticeState(ids: string[], state: AlertState) {
    const result = await run('notice-state', () => omniPost<NoticeStateResultDto>('signals/notices/state', { state, noticeIds: ids, all: false }));
    if (result) { unseenNotices.value = result.unseen; void notices.reload(true); }
}
async function allNoticesSeen() {
    const result = await run('notice-state', () => omniPost<NoticeStateResultDto>('signals/notices/state', { state: 'Seen', all: true, kind: filters.nkind || null }),
        r => `${r.changed} notice${r.changed === 1 ? '' : 's'} marked as seen.`);
    if (result) { unseenNotices.value = result.unseen; void notices.reload(true); }
}

// ── watch rules ────────────────────────────────────────────────────────────
const watches = useOmniResource(signal => omniGet<WatchListDto>('signals/watchlists', {}, signal));
const draft = reactive({ watchId: '', name: '', text: '', guilds: '', conversations: '', persons: [] as string[], enabled: true });
function resetDraft() { Object.assign(draft, { watchId: '', name: '', text: '', guilds: '', conversations: '', persons: [], enabled: true }); }
function editWatch(w: WatchRuleDto) {
    Object.assign(draft, {
        watchId: w.watchId, name: w.name, text: w.definition.text, guilds: (w.definition.guilds ?? []).join(', '),
        conversations: (w.definition.conversations ?? []).join(', '), persons: w.definition.persons ?? [], enabled: w.enabled,
    });
}
function ids(text: string): string[] | null {
    const list = text.split(',').map(s => s.trim()).filter(Boolean);
    return list.length ? list : null;
}
async function saveWatch() {
    const body = {
        watchId: draft.watchId || null, name: draft.name.trim(), text: draft.text.trim(), enabled: draft.enabled,
        guilds: ids(draft.guilds), conversations: ids(draft.conversations), persons: draft.persons.length ? draft.persons : null,
    };
    const result = await run('watch-save', () => omniPost<WatchRuleDto>('signals/watchlists/save', body), r => `Watch rule “${r.name}” saved.`);
    if (result) { resetDraft(); void watches.refresh(); }
}
async function toggleWatch(w: WatchRuleDto) {
    const result = await run('watch-enabled', () => omniPost<WatchRuleDto>('signals/watchlists/enabled', { watchId: w.watchId, enabled: !w.enabled }));
    if (result) void watches.refresh();
}
async function deleteWatch(w: WatchRuleDto) {
    if (!window.confirm(`Delete the watch rule “${w.name}”? Its past alerts stay.`)) return;
    const result = await run('watch-delete', () => omniPost<WatchDeletedDto>('signals/watchlists/delete', { watchId: w.watchId }), () => 'Watch rule deleted.');
    if (result) void watches.refresh();
}

// ── check-ins ──────────────────────────────────────────────────────────────
const wellbeing = useOmniResource(signal => omniGet<WellbeingListDto>('insights/wellbeing', { limit: 50 }, signal));
async function setCheckin(id: string, state: string) {
    const result = await run('checkin', () => omniPost<WellbeingStateDto>('insights/wellbeing/state', { suggestionId: id, state }));
    if (result) void wellbeing.refresh();
}

function badge(tab: Tab): string {
    const n = tab === 'alerts' ? unseenAlerts.value : tab === 'inbox' ? inbox.data.value?.open : tab === 'notices' ? unseenNotices.value
        : tab === 'checkins' ? wellbeing.data.value?.suggestions.filter(s => s.state === 'new').length : 0;
    return n ? (n > 99 ? '99+' : String(n)) : '';
}

function refreshTab() {
    switch (filters.tab) {
        case 'alerts': void alerts.reload(); break;
        case 'inbox': void inbox.refresh(); break;
        case 'notices': void notices.reload(); break;
        case 'watches': void watches.refresh(); break;
        default: void wellbeing.refresh();
    }
}
</script>

<style scoped>
.tabs { margin-bottom: var(--ot-gutter); }
.tabs .ot-badge { margin-left: 6px; }
td.actions { white-space: nowrap; text-align: right; }
.hits { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.hits li { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
.hits li.gone { opacity: 0.6; }
.notices { list-style: none; margin: 0; padding: 0; }
.notices li { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--ot-line); font-size: 13px; flex-wrap: wrap; }
.notices li .text { flex: 1 1 320px; min-width: 0; }
.notices li .sub { display: block; font-size: 11.5px; color: var(--ot-muted); }
.notices li.urgent { box-shadow: inset 2px 0 0 var(--ot-negative); }
.notices li.attention { box-shadow: inset 2px 0 0 var(--ot-warning); }
.omni-form { display: flex; flex-direction: column; gap: 12px; }
</style>
