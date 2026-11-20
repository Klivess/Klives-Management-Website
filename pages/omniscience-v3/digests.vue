<template>
    <OmniscienceV3Shell>
        <div class="omni-pagehead">
            <div>
                <h1>Digests</h1>
                <p class="subtitle">What happened while you were away, summarised per server and chat with every point cited. A digest reads the messages; it never sends anything.</p>
            </div>
            <div class="omni-actions">
                <button class="omni-btn ghost" type="button" :disabled="digests.loading.value" @click="digests.reload()">Refresh</button>
            </div>
        </div>

        <div class="omni-grid sidebar-left">
            <div class="stack">
                <OmniscienceV3Card v-if="canAnalyse" title="Write a digest now">
                    <form class="omni-form" data-testid="digest-run" @submit.prevent="runDigest()">
                        <div class="omni-field"><label for="d-scope">Of</label>
                            <select id="d-scope" v-model="runForm.scopeKind" class="omni-select">
                                <option v-for="s in SCOPES" :key="s.value" :value="s.value">{{ s.label }}</option>
                            </select></div>
                        <div v-if="runForm.scopeKind !== 'all'" class="omni-field"><label for="d-id">{{ scopeLabel(runForm.scopeKind) }}</label>
                            <OmniscienceV3Pick :key="runForm.scopeKind" :kind="pickKind(runForm.scopeKind)" :label="scopeLabel(runForm.scopeKind)" any="Choose…" :multiple="false" variant="field" input-id="d-id"
                                               testid="digest-scope" :model-value="runForm.scopeId ? [runForm.scopeId] : []" @update:model-value="ids => (runForm.scopeId = ids[0] ?? '')" /></div>
                        <div class="omni-field"><label for="d-range">Covering</label>
                            <select id="d-range" v-model="runForm.range" class="omni-select">
                                <option value="seen">Since I last read one</option>
                                <option value="24">The last 24 hours</option>
                                <option value="72">The last 3 days</option>
                                <option value="168">The last week</option>
                            </select></div>
                        <button class="omni-btn primary" type="submit" :disabled="busy !== null || (runForm.scopeKind !== 'all' && !runForm.scopeId.trim())">Write it</button>
                    </form>
                </OmniscienceV3Card>

                <OmniscienceV3Panel title="Digests" flush :loading="digests.loading.value" :error="digests.error.value" :has-data="digests.items.value.length > 0"
                                    :empty="!digests.items.value.length" empty-title="No digests yet" empty-text="The daily digest is written each morning; you can also write one now." @retry="digests.reload()">
                    <template #controls>
                        <select v-model="filters.scopeKind" class="omni-select auto sm" aria-label="Scope">
                            <option value="">Every scope</option>
                            <option v-for="s in SCOPES" :key="s.value" :value="s.value">{{ s.label }}</option>
                        </select>
                    </template>
                    <ul class="digests" data-testid="digest-list">
                        <li v-for="dg in digests.items.value" :key="dg.digestId" :class="{ active: filters.digest === dg.digestId }">
                            <button type="button" @click="filters.digest = dg.digestId">
                                <span class="title">{{ dg.scopeTitle ?? scopeLabel(dg.scopeKind) }}</span>
                                <span class="omni-muted">{{ at(dg.fromMs) }} → {{ at(dg.toMs) }}</span>
                                <span class="omni-row">
                                    <span class="omni-chip sm" :class="omniStateTone(dg.state)">{{ dg.state }}</span>
                                    <span class="omni-muted">{{ dg.nothingNew ? 'nothing new' : `${omniCount(dg.messages)} messages · ${omniCount(dg.people)} people` }}</span>
                                </span>
                            </button>
                        </li>
                    </ul>
                    <template v-if="digests.hasMore.value" #footer>
                        <button class="omni-btn sm" type="button" :disabled="digests.loadingMore.value" @click="digests.loadMore()">{{ digests.loadingMore.value ? 'Loading…' : 'Older digests' }}</button>
                    </template>
                </OmniscienceV3Panel>
            </div>

            <div class="stack">
                <OmniscienceV3Panel :title="digest ? (digest.scopeTitle ?? scopeLabel(digest.scopeKind)) : 'Digest'" :subtitle="digest ? `${at(digest.fromMs)} → ${at(digest.toMs)}` : undefined"
                                    :loading="item.loading.value && !digest" :error="item.error.value" :has-data="!!digest" :empty="!digest"
                                    empty-title="Pick a digest" empty-text="Open one from the list to read it." @retry="item.refresh()">
                    <template v-if="digest" #controls>
                        <button class="omni-btn sm" type="button" :disabled="busy !== null" data-testid="digest-seen" @click="markSeen(digest)">Mark as read</button>
                    </template>
                    <template v-if="digest">
                        <div v-if="digest.state === 'queued' || digest.state === 'running'" class="omni-banner info" role="status">
                            <span class="glyph" aria-hidden="true">⏳</span><div><strong>Being written</strong><span class="muted">This page updates when it is done.</span></div>
                        </div>
                        <p v-if="digest.error" class="neg">{{ digest.error }}</p>
                        <p class="omni-muted">Read {{ omniCount(digest.messagesRead) }} of {{ omniCount(digest.messages) }} messages in {{ omniCount(digest.conversations) }} conversations · {{ digest.llmCalls }} model calls</p>
                        <p v-if="digest.nothingNew" class="omni-muted">Nothing new happened in this window.</p>
                        <section v-if="digest.overall.length" class="omni-section">
                            <h4>Overall</h4>
                            <ul><li v-for="(p, i) in digest.overall" :key="i">{{ p.text }} <span class="refs">[{{ p.refs.length }}]</span></li></ul>
                        </section>
                        <section v-for="s in digest.sections" :key="s.kind + s.id" class="omni-section" data-testid="digest-section">
                            <h4>{{ s.title }} <span class="omni-muted">· {{ omniCount(s.messages) }} messages, {{ omniCount(s.people) }} people</span></h4>
                            <ul><li v-for="(p, i) in s.points" :key="i">{{ p.text }} <span class="refs">[{{ p.refs.length }}]</span></li></ul>
                            <div v-for="c in s.children" :key="c.kind + c.id" class="child">
                                <strong>{{ c.title }}</strong> <span class="omni-muted">{{ omniCount(c.messages) }} messages</span>
                                <ul><li v-for="(p, i) in c.points" :key="i">{{ p.text }} <span class="refs">[{{ p.refs.length }}]</span></li></ul>
                            </div>
                        </section>
                        <section v-if="digest.notable.length" class="omni-section">
                            <h4>Notable</h4>
                            <ul><li v-for="(n, i) in digest.notable" :key="i">{{ n }}</li></ul>
                        </section>
                        <section v-if="digest.newFacts.length" class="omni-section">
                            <h4>New facts</h4>
                            <ul><li v-for="f in digest.newFacts" :key="f.assertionId">
                                <NuxtLink :to="`${OMNI_BASE}/people/${encodeURIComponent(f.personId)}`">{{ f.personName ?? f.personId }}</NuxtLink>: {{ f.attribute }} = {{ f.value ?? '—' }}</li></ul>
                        </section>
                    </template>
                </OmniscienceV3Panel>

                <OmniscienceV3Panel title="Subscriptions" flush :loading="subs.loading.value" :error="subs.error.value" :has-data="!!subs.data.value"
                                    :empty="!!subs.data.value && !subs.data.value.subscriptions.length" empty-title="No subscriptions"
                                    empty-text="The daily digest of everything is always written; subscribe to a server, chat or person for its own." @retry="subs.refresh()">
                    <table v-if="subs.data.value" class="omni-table" data-testid="subs-table">
                        <thead><tr><th>Name</th><th>Of</th><th>When</th><th class="num">Last</th><th v-if="canManage"></th></tr></thead>
                        <tbody>
                            <tr v-for="s in subs.data.value.subscriptions" :key="s.subscriptionId">
                                <td>{{ s.name }} <span v-if="!s.enabled" class="omni-chip sm">off</span></td>
                                <td>{{ scopeLabel(s.scopeKind) }}<span v-if="s.scopeId" class="sub" :title="s.scopeId">{{ labelOf(pickKind(s.scopeKind), s.scopeId) }}</span></td>
                                <td>{{ s.cadence === 'weekly' ? `${WEEKDAYS[s.weekday ?? 0]} ` : 'daily ' }}{{ s.at }}</td>
                                <td class="num"><OmniscienceV3Time :ms="s.lastRunMs" mode="age" /></td>
                                <td v-if="canManage" class="actions">
                                    <button class="omni-btn ghost sm" type="button" @click="editSub(s)">Edit</button>
                                    <button class="omni-btn ghost sm" type="button" :disabled="busy !== null" @click="deleteSub(s)">Delete</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <template v-if="canManage" #footer>
                        <form class="subform" data-testid="sub-form" @submit.prevent="saveSub()">
                            <input v-model="sub.name" class="omni-input" placeholder="Name" maxlength="80" aria-label="Subscription name" required />
                            <select v-model="sub.scopeKind" class="omni-select auto" aria-label="Of" @change="sub.scopeId = ''">
                                <option v-for="s in SCOPES" :key="s.value" :value="s.value">{{ s.label }}</option>
                            </select>
                            <OmniscienceV3Pick v-if="sub.scopeKind !== 'all'" :key="sub.scopeKind" :kind="pickKind(sub.scopeKind)" :label="scopeLabel(sub.scopeKind)" any="choose…" :multiple="false"
                                               testid="sub-scope" :model-value="sub.scopeId ? [sub.scopeId] : []" @update:model-value="ids => (sub.scopeId = ids[0] ?? '')" />
                            <select v-model="sub.cadence" class="omni-select auto" aria-label="Cadence"><option value="daily">Daily</option><option value="weekly">Weekly</option></select>
                            <select v-if="sub.cadence === 'weekly'" v-model.number="sub.weekday" class="omni-select auto" aria-label="Weekday">
                                <option v-for="(w, i) in WEEKDAYS" :key="w" :value="i">{{ w }}</option>
                            </select>
                            <input v-model="sub.at" class="omni-input auto" type="time" aria-label="Time of day" required />
                            <label class="omni-check"><input v-model="sub.enabled" type="checkbox" /> On</label>
                            <button class="omni-btn primary sm" type="submit" :disabled="busy !== null || !sub.name.trim()">{{ sub.subscriptionId ? 'Save' : 'Subscribe' }}</button>
                            <button v-if="sub.subscriptionId" class="omni-btn ghost sm" type="button" @click="resetSub()">Cancel</button>
                        </form>
                    </template>
                </OmniscienceV3Panel>
            </div>
        </div>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, watch, watchEffect } from 'vue';
import { OMNI_BASE, omniGet, omniPost } from '~/scripts/omniscience/api';
import type { DigestDto, DigestPageDto, DigestSeenDto, DigestSubscriptionDeletedDto, DigestSubscriptionDto, DigestSubscriptionListDto } from '~/scripts/omniscience/contracts';
import { omniCount, omniStateTone } from '~/scripts/omniscience/format';
import type { OmniPickKind } from '~/scripts/omniscience/filters';
import { useOmniAction, useOmniDebounced, useOmniPaged, useOmniResource, useOmniTime } from '~/composables/useOmniscienceV3';
import { useOmniUrlState } from '~/composables/useOmniscienceV3';
import { useOmniPickLabels } from '~/composables/useOmniFilters';
import { useAccess } from '~/composables/useAccess';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Digests' });

const SCOPES = [
    { value: 'all', label: 'Everything' }, { value: 'guild', label: 'A server' }, { value: 'conversation', label: 'A chat' }, { value: 'person', label: 'A person' },
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOUR = 3_600_000;

const { can } = useAccess();
const canAnalyse = computed(() => can('omniscience.analysis.run'));
const canManage = computed(() => can('omniscience.alerts.manage'));
const { busy, run } = useOmniAction();
const { at } = useOmniTime();
const { state: filters } = useOmniUrlState({ scopeKind: '', digest: '' });

/** What a server, chat or person is picked from. */
function pickKind(scopeKind: string): OmniPickKind {
    return scopeKind === 'guild' || scopeKind === 'person' ? scopeKind : 'conversation';
}
const { want, labelOf } = useOmniPickLabels();

function scopeLabel(kind: string): string {
    return kind === 'all' ? 'Everything' : kind === 'guild' ? 'Server' : kind === 'conversation' ? 'Chat' : kind === 'person' ? 'Person' : kind;
}

const digests = useOmniPaged<DigestDto, string>((cursor, signal) => omniGet<DigestPageDto>('digests', { scopeKind: filters.scopeKind, cursor, limit: 20 }, signal));
useOmniDebounced(() => filters.scopeKind, () => { void digests.reload(); }, 50);

// The open digest is read again while it is being written, then left alone.
const item = useOmniResource(signal => (filters.digest ? omniGet<DigestDto>('digests/item', { id: filters.digest }, signal) : Promise.resolve(null as DigestDto | null)));
const digest = computed<DigestDto | null>(() => item.data.value ?? digests.items.value.find(d => d.digestId === filters.digest) ?? null);
let poll: ReturnType<typeof setInterval> | null = null;
function stopPoll() { if (poll) { clearInterval(poll); poll = null; } }
watch(() => filters.digest, () => { item.data.value = null; void item.refresh(); });
const writing = (state?: string) => state === 'queued' || state === 'running';
watch(() => digest.value?.state, (state, previous) => {
    stopPoll();
    if (writing(state)) poll = setInterval(() => { void item.refresh(); }, 3000);
    else if (writing(previous)) void digests.reload(true); // it just finished: the list shows its counts too
});
onBeforeUnmount(stopPoll);

const runForm = reactive({ scopeKind: 'all', scopeId: '', range: 'seen' });
// A server's id is not a chat's: choosing another kind of thing starts the choice again.
watch(() => runForm.scopeKind, () => { runForm.scopeId = ''; });
async function runDigest() {
    const now = Date.now();
    const fromMs = runForm.range === 'seen' ? null : now - Number(runForm.range) * HOUR;
    const body = { scopeKind: runForm.scopeKind, scopeId: runForm.scopeKind === 'all' ? null : runForm.scopeId.trim(), fromMs, toMs: fromMs === null ? null : now };
    const result = await run('digest-run', () => omniPost<DigestDto>('digests/run', body), () => 'The digest is being written.');
    if (result) { filters.digest = result.digestId; void digests.reload(true); }
}
async function markSeen(d: DigestDto) {
    await run('digest-seen', () => omniPost<DigestSeenDto>('digests/seen', { scopeKind: d.scopeKind, scopeId: d.scopeId ?? null, atMs: d.toMs }), () => 'Marked as read: the next digest starts here.');
}

// ── subscriptions ──────────────────────────────────────────────────────────
const subs = useOmniResource(signal => omniGet<DigestSubscriptionListDto>('digests/subscriptions', {}, signal));
// A subscription holds an id: it is shown by the name the id has now.
watchEffect(() => {
    for (const s of subs.data.value?.subscriptions ?? []) if (s.scopeId) want(pickKind(s.scopeKind), [s.scopeId]);
});
const sub = reactive({ subscriptionId: '', name: '', scopeKind: 'all', scopeId: '', cadence: 'daily', at: '08:00', weekday: 1, enabled: true });
function resetSub() { Object.assign(sub, { subscriptionId: '', name: '', scopeKind: 'all', scopeId: '', cadence: 'daily', at: '08:00', weekday: 1, enabled: true }); }
function editSub(s: DigestSubscriptionDto) {
    Object.assign(sub, { subscriptionId: s.subscriptionId, name: s.name, scopeKind: s.scopeKind, scopeId: s.scopeId ?? '', cadence: s.cadence, at: s.at, weekday: s.weekday ?? 1, enabled: s.enabled });
}
async function saveSub() {
    const body = {
        subscriptionId: sub.subscriptionId || null, name: sub.name.trim(), scopeKind: sub.scopeKind, scopeId: sub.scopeKind === 'all' ? null : sub.scopeId.trim(),
        cadence: sub.cadence, at: sub.at, weekday: sub.cadence === 'weekly' ? sub.weekday : null, enabled: sub.enabled,
    };
    const result = await run('sub-save', () => omniPost<DigestSubscriptionDto>('digests/subscriptions/save', body), r => `Subscription “${r.name}” saved.`);
    if (result) { resetSub(); void subs.refresh(); }
}
async function deleteSub(s: DigestSubscriptionDto) {
    if (!window.confirm(`Delete the subscription “${s.name}”? Digests already written stay.`)) return;
    const result = await run('sub-delete', () => omniPost<DigestSubscriptionDeletedDto>('digests/subscriptions/delete', { subscriptionId: s.subscriptionId }), () => 'Subscription deleted.');
    if (result) void subs.refresh();
}
</script>

<style scoped>
.stack { display: flex; flex-direction: column; gap: var(--omni-gutter); min-width: 0; }
.omni-form { display: flex; flex-direction: column; gap: 10px; }
.digests { list-style: none; margin: 0; padding: 0; }
.digests li button { all: unset; box-sizing: border-box; width: 100%; display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border-bottom: 1px solid var(--omni-line); cursor: pointer; font-size: 13px; }
.digests li button:hover { background: var(--omni-surface-3); }
.digests li.active button { background: var(--omni-accent-soft); box-shadow: inset 2px 0 0 var(--omni-accent); }
.digests .title { font-weight: 600; }
.refs { font-size: 11px; color: var(--omni-muted); }
.child { margin: 6px 0 0 14px; font-size: 13px; }
td.actions { white-space: nowrap; text-align: right; }
.subform { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.subform .omni-input:not(.auto) { width: 160px; }
</style>
