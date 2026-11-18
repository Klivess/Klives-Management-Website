<template>
    <OmniscienceV3Shell>
        <div class="omni-pagehead">
            <div>
                <span class="omni-eyebrow">Brief</span>
                <h1>{{ headline }}</h1>
                <p class="subtitle">One page for what is waiting on you, what is coming up and what the engine noticed. Each line leads to the place where it is dealt with.</p>
            </div>
            <div class="omni-actions">
                <span v-if="loadedAt" class="omni-muted">updated <OmniscienceV3Time :ms="loadedAt" mode="age" /></span>
                <button class="omni-btn ghost" type="button" @click="refresh()">Refresh</button>
                <NuxtLink v-if="canPeople" class="omni-btn primary" :to="`${OMNI_BASE}/ask`">Ask a question</NuxtLink>
            </div>
        </div>

        <div class="omni-kpis tight" data-testid="brief-kpis">
            <OmniscienceV3Kpi v-if="canPeople" label="Waiting on you" :value="count(inbox.data.value?.open)" :loading="inbox.loading.value" foot="messages you have not answered"
                              :tone="inbox.data.value?.open ? 'warn' : ''" :to="`${OMNI_BASE}/signals?tab=inbox`" />
            <OmniscienceV3Kpi v-if="canPeople" label="New alerts" :value="count(alerts.data.value?.unseen)" :loading="alerts.loading.value" foot="watch rules that fired" :to="`${OMNI_BASE}/signals`" />
            <OmniscienceV3Kpi v-if="canPeople" label="To review" :value="reviewText" :loading="review.loading.value" foot="facts and links to decide" :to="`${OMNI_BASE}/review`" />
            <OmniscienceV3Kpi v-if="canPeople" label="Coming up" :value="count(agenda.data.value?.upcoming.length)" :loading="agenda.loading.value"
                              :foot="agenda.data.value?.overdue.length ? `${agenda.data.value.overdue.length} overdue` : 'plans and dates'" :to="`${OMNI_BASE}/agenda`" />
            <OmniscienceV3Kpi v-if="canEngine" label="Health" :value="healthText_" :loading="health.loading.value" :tone="health.data.value?.open.length ? 'warn' : 'good'" foot="data-health checks"
                              :to="`${OMNI_BASE}/health`" />
            <OmniscienceV3Kpi label="Engine" :value="status?.phase ?? '…'" :tone="status?.phase === 'Ready' ? 'good' : status ? 'warn' : ''" :foot="engineFoot" :to="`${OMNI_BASE}/engine`" />
        </div>

        <div class="omni-grid sidebar">
            <div class="omni-stack">
                <OmniscienceV3Card title="Needs you" :subtitle="needs.length ? 'Worst first' : undefined" flush :empty="!needs.length" empty-kind="ok" empty-title="Nothing is waiting on you"
                                   empty-text="No unanswered messages, nothing to review, and the engine has nothing to report." data-testid="brief-needs">
                    <button v-for="need in needs" :key="need.id" class="omni-need" type="button" :data-need="need.id" @click="go(need.to)">
                        <span class="omni-dot" :class="need.tone"></span>
                        <span class="main"><strong>{{ need.title }}</strong><small>{{ need.detail }}</small></span>
                        <span class="go" aria-hidden="true">→</span>
                    </button>
                </OmniscienceV3Card>

                <OmniscienceV3Panel v-if="canPeople" title="Waiting on a reply" subtitle="The messages that have waited longest and matter most" flush :loading="inbox.loading.value" :error="inbox.error.value"
                                    :has-data="!!inbox.data.value" :empty="!!inbox.data.value && !inbox.data.value.items.length" empty-kind="ok" empty-title="You are caught up"
                                    what="The reply inbox" @retry="inbox.refresh()">
                    <ul v-if="inbox.data.value" class="omni-list" data-testid="brief-inbox">
                        <li v-for="item in inbox.data.value.items.slice(0, 6)" :key="item.itemId">
                            <span class="omni-avatar" aria-hidden="true">{{ initials(item.personName) }}</span>
                            <span class="main">
                                <strong><NuxtLink :to="personTo(item.personId)">{{ item.personName ?? item.personId }}</NuxtLink>
                                    <span class="omni-muted"> · {{ item.conversationTitle ?? item.conversationKind ?? item.platform }}</span></strong>
                                <small>{{ item.excerpt ?? item.reason }}</small>
                            </span>
                            <span class="omni-chip sm" :class="item.waitingMs > 3 * 86_400_000 ? 'warn' : ''">{{ waitText(item.waitingMs) }}</span>
                        </li>
                    </ul>
                    <template v-if="(inbox.data.value?.open ?? 0) > 6" #footer><NuxtLink :to="`${OMNI_BASE}/signals?tab=inbox`">All {{ inbox.data.value?.open }} →</NuxtLink></template>
                </OmniscienceV3Panel>

                <OmniscienceV3Panel v-if="canMessages" title="Latest digest" :subtitle="digest ? digestSpan : undefined" :loading="digests.loading.value" :error="digests.error.value"
                                    :has-data="!!digests.data.value" :empty="!!digests.data.value && !digest" empty-title="No digest yet"
                                    empty-text="A digest sums up what was said since the last one. Write one from the Digests page." what="Digests" @retry="digests.refresh()">
                    <template v-if="digest">
                        <p v-if="digest.nothingNew" class="omni-muted">Nothing new was said in this period.</p>
                        <ul v-else class="points" data-testid="brief-digest">
                            <li v-for="(point, i) in digest.overall.slice(0, 5)" :key="i">{{ point.text }}</li>
                        </ul>
                        <p class="omni-muted foot">{{ omniCount(digest.messages) }} messages · {{ omniCount(digest.people) }} people ·
                            <NuxtLink :to="`${OMNI_BASE}/digests?digest=${encodeURIComponent(digest.digestId)}`">Read it →</NuxtLink></p>
                    </template>
                </OmniscienceV3Panel>
            </div>

            <div class="omni-stack">
                <OmniscienceV3Panel v-if="canPeople" title="Coming up" flush :loading="agenda.loading.value" :error="agenda.error.value" :has-data="!!agenda.data.value"
                                    :empty="!!agenda.data.value && !comingUp.length" empty-title="Nothing on the calendar" empty-text="Plans, promises and birthdays people mention appear here."
                                    what="The agenda" @retry="agenda.refresh()">
                    <ul class="omni-list" data-testid="brief-agenda">
                        <li v-for="plan in comingUp" :key="plan.planId">
                            <span class="main">
                                <strong>{{ plan.title }}</strong>
                                <small><OmniscienceV3Time :ms="plan.nextOccurrenceMs ?? plan.scheduledEarliestMs" mode="absolute" />
                                    <template v-if="plan.klivesPromised"> · you promised</template><template v-else-if="plan.involvesKlives"> · involves you</template></small>
                            </span>
                            <span class="omni-chip sm" :class="planTone(plan.status)">{{ plan.status }}</span>
                        </li>
                    </ul>
                    <template #footer><NuxtLink :to="`${OMNI_BASE}/agenda`">The whole agenda →</NuxtLink></template>
                </OmniscienceV3Panel>

                <OmniscienceV3Card v-if="canPeople" title="People" subtitle="Opened recently here, then the tracked people who spoke last">
                    <div v-if="recent.length" class="omni-tiles" data-testid="brief-recent">
                        <NuxtLink v-for="r in recent" :key="r.id" class="omni-tile" :to="personTo(r.id)">
                            <span class="omni-avatar" aria-hidden="true">{{ initials(r.name) }}</span>
                            <span class="main"><strong>{{ r.name }}</strong><small>opened <OmniscienceV3Time :ms="r.at" mode="age" /></small></span>
                        </NuxtLink>
                    </div>
                    <h4 v-if="recent.length && tracked.data.value?.items.length" class="omni-h4 gap">Tracked</h4>
                    <div v-if="tracked.data.value?.items.length" class="omni-tiles" data-testid="brief-tracked">
                        <NuxtLink v-for="p in tracked.data.value.items" :key="p.personId" class="omni-tile" :to="personTo(p.personId)">
                            <span class="omni-avatar" aria-hidden="true">{{ initials(p.displayName) }}</span>
                            <span class="main"><strong>{{ p.displayName }}</strong><small>{{ omniCount(p.msgs30) }} in 30 days · <OmniscienceV3Time :ms="p.lastSeenMs" mode="age" /></small></span>
                        </NuxtLink>
                    </div>
                    <p v-if="!recent.length && !tracked.data.value?.items.length" class="omni-muted">{{ tracked.loading.value ? 'Loading…' : 'Nobody is tracked yet. Open a person from the directory to see them here.' }}</p>
                    <template #footer><NuxtLink :to="`${OMNI_BASE}/people`">Everyone →</NuxtLink><span class="omni-muted">or press <kbd>Ctrl K</kbd> and type a name</span></template>
                </OmniscienceV3Card>
            </div>
        </div>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { OMNI_BASE, omniGet } from '~/scripts/omniscience/api';
import type {
    AgendaDto, AlertPageDto, DigestPageDto, DirectoryPageDto, HealthListDto, IdentityLinkPageDto, InboxPageDto, KnowledgeReviewPageDto, NoticePageDto, ReadModelDto,
} from '~/scripts/omniscience/contracts';
import { omniCount, omniInstantParts } from '~/scripts/omniscience/format';
import { healthText, waitText } from '~/scripts/omniscience/findings';
import { planTone } from '~/scripts/omniscience/knowledge';
import { useOmniEngine, useOmniRecent, useOmniResource, useOmniTime } from '~/composables/useOmniscienceV3';
import { useAccess } from '~/composables/useAccess';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Brief' });

/**
 * The first page: everything that waits on Klives, read from the pages that own it. Nothing is computed
 * here beyond counting what the server returned, and a part he may not see is left out rather than shown empty.
 */

const POLL_MS = 120_000;
const router = useRouter();
const { can } = useAccess();
const { status } = useOmniEngine();
const { zone, now } = useOmniTime();
const short = (ms: number) => { const p = omniInstantParts(ms, zone.value); return `${p.date} ${p.time}`; };
const { recent } = useOmniRecent();

const canPeople = computed(() => can('omniscience.persons.read'));
const canMessages = computed(() => can('omniscience.messages.read'));
const canEngine = computed(() => can('omniscience.overview.view'));

/** A read that is skipped (answering null) when the profile may not make it. */
function guarded<T>(allowed: () => boolean, load: (signal: AbortSignal) => Promise<T>) {
    return useOmniResource<T | null>(signal => (allowed() ? load(signal) : Promise.resolve(null)), { pollMs: POLL_MS });
}

const inbox = guarded(() => canPeople.value, signal => omniGet<InboxPageDto>('signals/inbox', { state: 'open', limit: 20 }, signal));
const alerts = guarded(() => canPeople.value, signal => omniGet<AlertPageDto>('signals/alerts', { state: 'New', limit: 1 }, signal));
const notices = guarded(() => canPeople.value, signal => omniGet<NoticePageDto>('signals/notices', { state: 'New', limit: 1 }, signal));
const review = guarded(() => canPeople.value, signal => omniGet<KnowledgeReviewPageDto>('knowledge/review', { state: 'open', sort: 'priority', limit: 50 }, signal));
const links = guarded(() => canPeople.value, signal => omniGet<IdentityLinkPageDto>('knowledge/identity-links', { verdict: 'suggested', limit: 50 }, signal));
const agenda = guarded(() => canPeople.value, async signal => (await omniGet<ReadModelDto>('knowledge/agenda', {}, signal)).body as AgendaDto);
const tracked = guarded(() => canPeople.value, signal => omniGet<DirectoryPageDto>('people', { tier: 'tracked', sort: 'LastSeen', limit: 6 }, signal));
const health = guarded(() => canEngine.value, signal => omniGet<HealthListDto>('monitors/health', {}, signal));
const digests = guarded(() => canMessages.value, signal => omniGet<DigestPageDto>('digests', { limit: 1 }, signal));

const all = [inbox, alerts, notices, review, links, agenda, tracked, health, digests];
function refresh() { for (const resource of all) void resource.refresh(); }
const loadedAt = computed(() => all.reduce<number | null>((latest, r) => (r.loadedAt.value !== null && (latest === null || r.loadedAt.value > latest) ? r.loadedAt.value : latest), null));

const digest = computed(() => digests.data.value?.items[0] ?? null);
const digestSpan = computed(() => (digest.value ? `${digest.value.scopeTitle ?? 'Everything'} · ${short(digest.value.fromMs)} to ${short(digest.value.toMs)}` : ''));
const comingUp = computed(() => [...(agenda.data.value?.overdue ?? []), ...(agenda.data.value?.upcoming ?? [])].slice(0, 7));

const count = (n: number | null | undefined) => (n === null || n === undefined ? '—' : omniCount(n));
const more = (page: { nextCursor?: string | null } | null) => (page?.nextCursor ? '+' : '');
const reviewCount = computed(() => (review.data.value?.items.length ?? 0) + (links.data.value?.items.length ?? 0));
const reviewText = computed(() => (review.data.value || links.data.value ? `${omniCount(reviewCount.value)}${more(review.data.value) || more(links.data.value)}` : '—'));
const healthText_ = computed(() => (health.data.value ? (health.data.value.open.length ? `${health.data.value.open.length} open` : 'Clear') : '—'));
const deadJobs = computed(() => (status.value?.lanes ?? []).reduce((sum, lane) => sum + lane.dead, 0));
const engineFoot = computed(() => (deadJobs.value ? `${deadJobs.value} dead job${deadJobs.value === 1 ? '' : 's'}` : status.value ? `${status.value.modules.length} modules` : 'not answering'));

const headline = computed(() => {
    const hour = Number(omniInstantParts(now.value || Date.now(), zone.value).time.slice(0, 2));
    const part = Number.isFinite(hour) ? (hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') : 'Hello';
    return needs.value.length ? `${part}. ${needs.value.length} thing${needs.value.length === 1 ? '' : 's'} for you.` : `${part}. Nothing is waiting.`;
});

interface Need { id: string; tone: 'bad' | 'warn' | 'info'; title: string; detail: string; to: string }
const plural = (n: number, one: string, many = `${one}s`) => `${omniCount(n)} ${n === 1 ? one : many}`;

/** Everything waiting on Klives or wrong with the engine, worst first. */
const needs = computed<Need[]>(() => {
    const out: Need[] = [];
    if (status.value?.llm?.circuitOpen)
        out.push({ id: 'llm', tone: 'bad', title: 'LLM calls are failing', detail: 'Background work is paused until they recover.', to: `${OMNI_BASE}/llm` });
    if (deadJobs.value)
        out.push({ id: 'dead-jobs', tone: 'bad', title: `${plural(deadJobs.value, 'job')} failed every attempt`, detail: 'Each waits for a decision: retry it or cancel it.', to: `${OMNI_BASE}/jobs?state=dead` });
    for (const issue of (health.data.value?.open ?? []).slice(0, 3))
        out.push({ id: `health-${issue.issueId}`, tone: issue.severity === 'Critical' ? 'bad' : 'warn', title: 'Data health', detail: healthText(issue.kind, issue.detail, issue.subject), to: `${OMNI_BASE}/health` });
    const overdue = agenda.data.value?.overdue ?? [];
    if (overdue.length)
        out.push({ id: 'overdue', tone: 'warn', title: `${plural(overdue.length, 'plan')} overdue`, detail: overdue.slice(0, 3).map(p => p.title).join(' · '), to: `${OMNI_BASE}/agenda` });
    const open = inbox.data.value?.open ?? 0;
    if (open)
        out.push({ id: 'inbox', tone: 'info', title: `${plural(open, 'message')} waiting on your reply`, detail: (inbox.data.value?.items ?? []).slice(0, 3).map(i => i.personName ?? i.personId).join(', '), to: `${OMNI_BASE}/signals?tab=inbox` });
    const unseenAlerts = alerts.data.value?.unseen ?? 0;
    if (unseenAlerts)
        out.push({ id: 'alerts', tone: 'info', title: `${plural(unseenAlerts, 'new alert')}`, detail: 'A watch rule matched, or someone mentioned you.', to: `${OMNI_BASE}/signals` });
    const linkCount = links.data.value?.items.length ?? 0;
    if (linkCount)
        out.push({ id: 'links', tone: 'info', title: `${plural(linkCount, 'possible same-person link')}${more(links.data.value)}`, detail: 'Two accounts that may be one person. A yes merges what is known about them.', to: `${OMNI_BASE}/review?tab=links` });
    const reviewItems = review.data.value?.items.length ?? 0;
    if (reviewItems)
        out.push({ id: 'review', tone: 'info', title: `${plural(reviewItems, 'item')}${more(review.data.value)} to review`, detail: (review.data.value?.items ?? []).slice(0, 2).map(i => i.title).join(' · '), to: `${OMNI_BASE}/review` });
    const unseenNotices = notices.data.value?.unseen ?? 0;
    if (unseenNotices)
        out.push({ id: 'notices', tone: 'info', title: `${plural(unseenNotices, 'new notice')}`, detail: 'Things the engine noticed about people and places.', to: `${OMNI_BASE}/signals?tab=notices` });
    const order = { bad: 0, warn: 1, info: 2 } as const;
    return out.sort((a, b) => order[a.tone] - order[b.tone]);
});

function go(to: string) { void router.push(to); }
const personTo = (id: string) => `${OMNI_BASE}/people/${encodeURIComponent(id)}`;
function initials(name: string | null | undefined): string {
    const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return (words.length === 1 ? words[0]!.slice(0, 2) : words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}
</script>

<style scoped>
.points { margin: 0 0 8px; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
.foot { margin: 0; font-size: 12px; }
.gap { margin-top: 12px; }
.omni-list a, .foot a { color: var(--omni-accent-2); }
</style>
