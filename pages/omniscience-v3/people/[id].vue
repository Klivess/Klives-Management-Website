<template>
    <OmniscienceV3Shell>
        <div class="ot-pagehead">
            <div>
                <p class="omni-muted crumbs"><NuxtLink :to="`${OMNI_BASE}/people`">People</NuxtLink> ›</p>
                <h1 data-testid="person-name">{{ d?.displayName ?? personId }}</h1>
                <p class="subtitle omni-mono">{{ personId }}</p>
            </div>
            <div class="ot-actions">
                <button class="ot-btn ghost" type="button" :disabled="dossier.refreshing.value" @click="refreshAll()">Refresh</button>
                <button class="ot-btn" type="button" @click="useInTactic()">Run a tactic on this person</button>
                <NuxtLink v-if="canManage" class="ot-btn ghost" :to="`${OMNI_BASE}/data?person=${encodeURIComponent(personId)}`">Data controls…</NuxtLink>
            </div>
        </div>

        <div v-if="d" class="omni-row chips" data-testid="person-chips">
            <span v-if="d.isSelf" class="ot-chip ok">This is you</span>
            <span class="ot-chip" :class="d.tier === 'tracked' ? 'ok' : d.tier === 'watch' ? 'warn' : ''">{{ d.tier }}</span>
            <span v-if="d.pinned" class="ot-chip">★ pinned</span>
            <span v-if="d.restricted" class="ot-chip warn" title="Under 18, or may be: routine patterns, zones and identity facts are not shown, and no alert is ever about them">under 18 or may be</span>
            <span v-if="d.analysisOff" class="ot-chip bad" data-testid="analysis-off">analysis switched off</span>
            <span class="omni-muted">{{ d.coverage.platforms.join(', ') }} · {{ omniCount(d.coverage.conversations) }} conversations · {{ omniCount(d.coverage.guilds) }} servers</span>
        </div>
        <div v-if="d?.analysisOff" class="ot-banner warn" role="status">
            <span class="glyph" aria-hidden="true">⏸</span>
            <div><strong>Analysis is switched off for this person.</strong>
                <span class="muted">Their messages stay in the archive, but nothing is worked out from them. Switch it back on under Data controls.</span></div>
        </div>
        <div v-else-if="d?.staleEvidence" class="ot-banner info" role="status">
            <span class="glyph" aria-hidden="true">ℹ</span>
            <div><strong>The newest evidence is old.</strong><span class="muted">Their last message was <OmniscienceV3Time :ms="d.newestEvidenceMs" mode="age" />.</span></div>
        </div>

        <OmniscienceV3Panel title="Activity" :loading="dossier.loading.value" :error="dossier.error.value" :has-data="!!d" what="This person's page" @retry="dossier.refresh()">
            <template v-if="d">
                <div class="ot-kpis tight" data-testid="person-kpis">
                    <OmniTraderKpi label="Messages" :value="omniCount(d.activity.msgs)" small :foot="`${omniCount(d.activity.activeDays)} active days`" />
                    <OmniTraderKpi label="Last 30 days" :value="omniCount(d.activity.msgs30)" small :foot="`${omniCount(d.activity.activeDays30)} active days`" />
                    <OmniTraderKpi label="Last 90 days" :value="omniCount(d.activity.msgs90)" small />
                    <OmniTraderKpi label="In direct chats" :value="omniPercent(d.activity.dmShare)" small />
                    <OmniTraderKpi label="First seen" :value="d.activity.firstMs ? age(d.activity.firstMs) : '—'" small />
                    <OmniTraderKpi label="Last seen" :value="d.activity.lastMs ? age(d.activity.lastMs) : '—'" small />
                </div>
                <svg class="series" :viewBox="`0 0 ${d.series.length} 40`" preserveAspectRatio="none" role="img" :aria-label="`Messages per day over ${d.series.length} days`">
                    <rect v-for="(day, i) in d.series" :key="day.day" :x="i + 0.1" :width="0.8" :y="40 - bar(day.msgs)" :height="bar(day.msgs)"><title>{{ day.day }}: {{ day.msgs }}</title></rect>
                </svg>
                <div v-if="d.hours" class="hours" aria-label="Messages by hour of the day (their zone)">
                    <span v-for="(n, h) in d.hours" :key="h" class="h" :style="{ opacity: hourOpacity(n) }" :title="`${h}:00 — ${n}`">{{ h }}</span>
                </div>
                <p v-else class="omni-muted">Hours and weekdays are not shown for this person.</p>
                <p v-if="d.zone" class="omni-muted">Zone: {{ d.zone.zone ?? 'unknown' }} ({{ d.zone.method }}, confidence {{ omniPercent(d.zone.confidence) }})</p>
            </template>
        </OmniscienceV3Panel>

        <div class="ot-grid two">
            <OmniscienceV3Panel title="Talks most with" flush :loading="dossier.loading.value" :error="dossier.error.value" :has-data="!!d" :empty="!!d && !d.partners.length" empty-title="Nobody yet">
                <table v-if="d" class="ot-table compact">
                    <thead><tr><th>Person</th><th class="num">Replies out/in</th><th class="num">Direct out/in</th><th class="num">Reciprocity</th></tr></thead>
                    <tbody>
                        <tr v-for="p in d.partners" :key="p.personId">
                            <td><NuxtLink :to="`${OMNI_BASE}/people/${encodeURIComponent(p.personId)}`">{{ p.name }}</NuxtLink></td>
                            <td class="num">{{ p.repliesOut }} / {{ p.repliesIn }}</td>
                            <td class="num">{{ p.dmOut }} / {{ p.dmIn }}</td>
                            <td class="num">{{ omniPercent(p.reciprocity) }}</td>
                        </tr>
                    </tbody>
                </table>
            </OmniscienceV3Panel>
            <OmniscienceV3Panel title="Where" :loading="dossier.loading.value" :error="dossier.error.value" :has-data="!!d" :empty="!!d && !d.conversations.length && !d.guilds.length">
                <template v-if="d">
                    <h4 class="omni-h4">Servers</h4>
                    <ol class="ranked"><li v-for="g in d.guilds" :key="g.id">{{ g.name }} <span class="omni-muted">{{ omniCount(g.count) }}</span></li></ol>
                    <h4 class="omni-h4">Conversations</h4>
                    <ol class="ranked"><li v-for="c in d.conversations" :key="c.id">{{ c.name }} <span class="omni-muted">{{ omniCount(c.count) }}</span></li></ol>
                </template>
            </OmniscienceV3Panel>
        </div>

        <OmniscienceV3Panel title="Facts" flush :loading="dossier.loading.value" :error="dossier.error.value" :has-data="!!d" :empty="!!d && !d.facts.length" empty-title="No facts recorded"
                            empty-text="Facts come from the knowledge workstream's extraction, with their evidence.">
            <table v-if="d" class="ot-table compact">
                <thead><tr><th>Attribute</th><th>Value</th><th>Status</th><th class="num">Recorded</th></tr></thead>
                <tbody>
                    <tr v-for="f in d.facts" :key="f.assertionId"><td>{{ f.attribute }}</td><td>{{ f.value ?? '—' }}</td><td><span class="ot-chip">{{ f.status }}</span></td>
                        <td class="num"><OmniscienceV3Time :ms="f.recordedAtMs" mode="age" /></td></tr>
                </tbody>
            </table>
        </OmniscienceV3Panel>

        <OmniscienceV3Panel title="Brief" :loading="brief.loading.value" :error="briefError" :has-data="!!brief.data.value" :empty="!brief.data.value && !briefError"
                            empty-title="No brief yet" empty-text="A brief summarises what this person has been saying lately, with every point cited." @retry="brief.refresh()">
            <template #controls>
                <button v-if="canAnalyse" class="ot-btn sm" type="button" :disabled="busy !== null" data-testid="brief-request" @click="requestBrief()">
                    {{ brief.data.value ? 'Write a fresh brief' : 'Write a brief' }}</button>
            </template>
            <template v-if="brief.data.value">
                <p class="omni-muted">{{ brief.data.value.state }} · <OmniscienceV3Time :ms="brief.data.value.finishedAtMs ?? brief.data.value.requestedAtMs" mode="age" />
                    · read {{ omniCount(brief.data.value.messagesRead) }} of {{ omniCount(brief.data.value.messagesInWindow) }} messages</p>
                <div v-for="s in brief.data.value.sections" :key="s.key" class="omni-section">
                    <h4 class="omni-h4">{{ s.title }}</h4>
                    <ul><li v-for="(p, i) in s.points" :key="i">{{ p.text }} <span class="omni-muted refs">[{{ p.refs.length }}]</span></li></ul>
                </div>
                <p v-if="brief.data.value.error" class="neg">{{ brief.data.value.error }}</p>
            </template>
        </OmniscienceV3Panel>

        <div class="ot-grid two">
            <OmniscienceV3Panel title="Relationships" flush :loading="relationships.loading.value" :error="relationships.error.value" :has-data="!!relationships.data.value"
                                :empty="!!relationships.data.value && !relationships.data.value.relationships.length" empty-title="No tracked relationships"
                                empty-text="A pair is tracked once they have interacted enough." @retry="relationships.refresh()">
                <table v-if="relationships.data.value" class="ot-table compact">
                    <thead><tr><th>With</th><th>Trend</th><th class="num">Closeness</th><th class="num">Tension</th></tr></thead>
                    <tbody>
                        <tr v-for="r in relationships.data.value.relationships" :key="r.a + r.b">
                            <td><NuxtLink :to="`${OMNI_BASE}/people/${encodeURIComponent(other(r.a, r.b))}`">{{ otherName(r) }}</NuxtLink></td>
                            <td><span class="ot-chip" :class="trendTone(r.trend)">{{ r.trend }}</span></td>
                            <td class="num">{{ omniPercent(r.closeness, 1) }}</td>
                            <td class="num">{{ omniPercent(r.tension) }}</td>
                        </tr>
                    </tbody>
                </table>
            </OmniscienceV3Panel>
            <OmniscienceV3Panel title="Similar people" flush :loading="similar.loading.value" :error="similar.error.value" :has-data="!!similar.data.value"
                                :empty="!!similar.data.value && !similar.data.value.people.length" empty-title="Nobody to compare yet"
                                :empty-text="similar.data.value?.note ?? undefined" @retry="similar.refresh()">
                <ul v-if="similar.data.value" class="similar">
                    <li v-for="p in similar.data.value.people" :key="p.personId">
                        <NuxtLink :to="`${OMNI_BASE}/people/${encodeURIComponent(p.personId)}`">{{ p.name ?? p.personId }}</NuxtLink>
                        <span class="omni-muted">{{ omniPercent(p.similarity) }}</span>
                        <span class="why omni-muted">{{ p.shared.map(s => s.text).join(', ') || 'similar overall' }}</span>
                    </li>
                </ul>
            </OmniscienceV3Panel>
        </div>

        <OmniscienceV3Panel title="What they share (90 days)" flush :loading="links.loading.value" :error="links.error.value" :has-data="!!links.data.value"
                            :empty="!!links.data.value && !links.data.value.shares" empty-title="No links shared" @retry="links.refresh()">
            <template v-if="links.data.value">
                <p class="omni-row omni-muted pad">
                    {{ omniCount(links.data.value.shares) }} shares of {{ omniCount(links.data.value.links) }} links ·
                    <span v-for="k in links.data.value.kinds" :key="k.key" class="ot-chip sm">{{ k.key }} {{ k.shares }}</span>
                </p>
                <table class="ot-table compact">
                    <thead><tr><th>Link</th><th>Topic</th><th class="num">Shared</th></tr></thead>
                    <tbody>
                        <tr v-for="s in links.data.value.recent" :key="s.messageId + s.link.urlId">
                            <td><span class="cellstack"><span>{{ s.link.title ?? s.link.url }}</span><span class="sub">{{ s.link.site }}{{ s.link.sensitive ? ' · private link (never looked up)' : '' }}</span></span></td>
                            <td>{{ s.link.topic ?? '—' }}</td>
                            <td class="num"><OmniscienceV3Time :ms="s.atMs" mode="age" /></td>
                        </tr>
                    </tbody>
                </table>
            </template>
        </OmniscienceV3Panel>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { OMNI_BASE, omniGet, omniPost } from '~/scripts/omniscience/api';
import type { DossierDto, PairSummaryDto, PersonBriefDto, PersonLinksDto, PersonRelationshipsDto, ReadModelDto, SimilarPeopleDto } from '~/scripts/omniscience/contracts';
import { omniCount, omniPercent } from '~/scripts/omniscience/format';
import { useOmniAction, useOmniCarry, useOmniResource, useOmniTime } from '~/composables/useOmniscienceV3';
import { useAccess } from '~/composables/useAccess';

definePageMeta({ layout: 'navbar' });

const route = useRoute();
const router = useRouter();
const carry = useOmniCarry();
const { can } = useAccess();
const { busy, run } = useOmniAction();
const { age } = useOmniTime();
const canManage = computed(() => can('omniscience.engine.manage'));
const canAnalyse = computed(() => can('omniscience.analysis.run'));
const personId = computed(() => String(route.params.id ?? ''));

const dossier = useOmniResource(async signal => {
    const rm = await omniGet<ReadModelDto>('rm', { model: 'person.dossier', key: personId.value }, signal);
    return rm.body as DossierDto;
});
const d = computed(() => dossier.data.value);
useHead({ title: computed(() => `Omniscience v3 · ${d.value?.displayName ?? 'Person'}`) });

const brief = useOmniResource(signal => omniGet<PersonBriefDto>('briefs/person', { personId: personId.value }, signal));
// "No brief yet" is an empty panel, not a failure.
const briefError = computed(() => (brief.error.value?.status === 404 ? null : brief.error.value));
const relationships = useOmniResource(signal => omniGet<PersonRelationshipsDto>('insights/person', { personId: personId.value, limit: 25 }, signal));
const similar = useOmniResource(signal => omniGet<SimilarPeopleDto>('insights/similar', { personId: personId.value, limit: 10 }, signal));
const links = useOmniResource(signal => omniGet<PersonLinksDto>('links/person', { personId: personId.value, days: 90, limit: 15 }, signal));

function refreshAll() {
    void dossier.refresh(); void brief.refresh(); void relationships.refresh(); void similar.refresh(); void links.refresh();
}

async function requestBrief() {
    const result = await run('brief', () => omniPost<PersonBriefDto>('briefs/person', { personId: personId.value }), () => 'A fresh brief is being written; it appears here when it is done.');
    if (result) brief.data.value = result;
}

function useInTactic() {
    carry.value = { kind: 'Person', items: [{ id: personId.value, label: d.value?.displayName ?? null }], origin: `person ${d.value?.displayName ?? personId.value}`, sampled: false };
    void router.push(`${OMNI_BASE}/tactics`);
}

const maxDay = computed(() => Math.max(1, ...(d.value?.series ?? []).map(s => s.msgs)));
function bar(n: number): number { return n <= 0 ? 0 : Math.max(1.5, (n / maxDay.value) * 38); }
const maxHour = computed(() => Math.max(1, ...(d.value?.hours ?? [0])));
function hourOpacity(n: number): number { return 0.12 + 0.88 * (n / maxHour.value); }

function other(a: string, b: string): string { return a === personId.value ? b : a; }
function otherName(r: PairSummaryDto): string { return (r.a === personId.value ? r.bName : r.aName) ?? other(r.a, r.b); }
function trendTone(trend: string): string { return trend === 'closer' || trend === 'new' ? 'ok' : trend === 'drifting' ? 'warn' : ''; }
</script>

<style scoped>
.crumbs { margin: 0 0 2px; font-size: 12px; }
.chips { gap: 6px; flex-wrap: wrap; margin: 0 0 10px; }
.series { width: 100%; height: 60px; margin-top: 12px; }
.series rect { fill: var(--ot-accent, #58a6ff); }
.hours { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; margin-top: 10px; font-size: 10px; }
.hours .h { text-align: center; background: var(--ot-accent, #58a6ff); color: #fff; border-radius: 3px; padding: 2px 0; }
.omni-h4 { margin: 10px 0 6px; font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--ot-muted); }
.ot-grid.two { margin-top: var(--ot-gutter); }
.ranked { margin: 0 0 8px; padding-left: 22px; font-size: 13px; }
.similar { list-style: none; margin: 0; padding: 6px 12px; }
.similar li { display: flex; gap: 8px; align-items: baseline; padding: 4px 0; border-bottom: 1px solid var(--ot-line); }
.similar .why { font-size: 12px; }
.refs { font-size: 11px; }
.pad { padding: 8px 12px; gap: 6px; flex-wrap: wrap; }
</style>
