<template>
    <OmniscienceV3Shell>
        <div class="omni-pagehead">
            <div>
                <h1>Communities</h1>
                <p class="subtitle">Servers and group chats as places (who carries them, who is rising, their tone and what they say about you), the circles people form, and a map of who resembles whom.</p>
            </div>
            <div class="omni-actions">
                <button v-if="canManage && filters.tab === 'circles'" class="omni-btn ghost" type="button" :disabled="busy !== null" @click="refreshCircles()">Recompute circles</button>
            </div>
        </div>

        <div class="omni-segment tabs" role="tablist" aria-label="Communities">
            <button v-for="t in TABS" :key="t.value" type="button" role="tab" :aria-selected="filters.tab === t.value" :aria-pressed="filters.tab === t.value"
                    :data-testid="`communities-tab-${t.value}`" @click="filters.tab = t.value">{{ t.label }}</button>
        </div>

        <!-- ── places ───────────────────────────────────────────────────── -->
        <div v-if="filters.tab === 'places'" class="omni-grid sidebar-left">
            <OmniscienceV3Panel title="Places" :subtitle="spaces.data.value ? `last ${spaces.data.value.windowDays} days` : undefined" flush
                                :loading="spaces.loading.value" :error="spaces.error.value" :has-data="!!spaces.data.value"
                                :empty="!!spaces.data.value && !spaces.data.value.spaces.length" empty-title="No community pages yet"
                                empty-text="Pages are built each night for the busiest servers and group chats." @retry="spaces.refresh()">
                <ul v-if="spaces.data.value" class="places" data-testid="spaces-list">
                    <li v-for="s in spaces.data.value.spaces" :key="s.scopeKind + s.scopeId" :class="{ active: isOpen(s.scopeKind, s.scopeId) }">
                        <button type="button" @click="open(s.scopeKind, s.scopeId)">
                            <span class="title">{{ s.title ?? s.scopeId }}</span>
                            <span class="omni-muted">{{ s.scopeKind === 'guild' ? 'server' : 'group chat' }}{{ s.platform ? ` · ${s.platform}` : '' }}</span>
                            <span class="omni-muted">{{ omniCount(s.messages) }} messages <span :class="trend(s.messages, s.previousMessages)">{{ change(s.messages, s.previousMessages) }}</span>
                                · {{ omniCount(s.people) }} people<template v-if="s.aboutKlives"> · {{ omniCount(s.aboutKlives) }} about you</template></span>
                        </button>
                    </li>
                </ul>
            </OmniscienceV3Panel>

            <div class="stack">
                <OmniscienceV3Panel :title="page.data.value?.title ?? (filters.scopeId ? filters.scopeId : 'A place')"
                                    :subtitle="page.data.value ? `${page.data.value.fromDay} → ${page.data.value.toDay}` : undefined"
                                    :loading="page.loading.value && !!filters.scopeId" :error="page.error.value" :has-data="!!page.data.value"
                                    :empty="!filters.scopeId" empty-title="Pick a place" empty-text="Open a server or group chat from the list." @retry="page.refresh()">
                    <template v-if="canManage && filters.scopeId" #controls>
                        <button class="omni-btn sm" type="button" :disabled="busy !== null" data-testid="space-refresh" @click="rebuild()">Rebuild this page</button>
                    </template>
                    <template v-if="p">
                        <div class="omni-kpis tight">
                            <OmniscienceV3Kpi label="Messages" :value="omniCount(p.messages)" small :foot="`before: ${omniCount(p.previousMessages)}`" />
                            <OmniscienceV3Kpi label="People" :value="omniCount(p.people)" small :foot="`before: ${omniCount(p.previousPeople)}`" />
                            <OmniscienceV3Kpi label="About you" :value="omniCount(p.aboutKlives.messages)" small :foot="`before: ${omniCount(p.aboutKlives.previousMessages)}`" />
                            <OmniscienceV3Kpi label="Conflict" :value="omniPercent(p.tone.conflictRecent)" small :foot="`usual ${omniPercent(p.tone.conflictBaseline)}`" />
                        </div>
                        <svg class="series" :viewBox="`0 0 ${Math.max(1, p.days.length)} 40`" preserveAspectRatio="none" role="img" aria-label="Messages per day">
                            <rect v-for="(day, i) in p.days" :key="day.day" :x="i + 0.1" width="0.8" :y="40 - bar(day.messages, maxDay)" :height="bar(day.messages, maxDay)"><title>{{ day.day }}: {{ day.messages }} messages, {{ day.people }} people</title></rect>
                        </svg>
                        <p class="omni-muted">{{ p.coverage.note }}<template v-if="p.peopleLeftOut"> · {{ omniCount(p.peopleLeftOut) }} people are left out of the names below.</template></p>
                        <p v-if="p.latestDigestId"><NuxtLink :to="`${OMNI_BASE}/digests?digest=${encodeURIComponent(p.latestDigestId)}`">Latest digest of this place →</NuxtLink></p>
                    </template>
                </OmniscienceV3Panel>

                <div v-if="p" class="omni-grid two">
                    <OmniscienceV3Card title="Who carries it" flush>
                        <table class="omni-table" data-testid="space-core">
                            <thead><tr><th>Person</th><th class="num">Messages</th><th class="num">Share</th><th class="num">Days</th></tr></thead>
                            <tbody><tr v-for="m in p.core" :key="m.personId">
                                <td><NuxtLink :to="personLink(m.personId)">{{ m.name ?? m.personId }}</NuxtLink></td>
                                <td class="num">{{ omniCount(m.messages) }}</td><td class="num">{{ omniPercent(m.share) }}</td><td class="num">{{ m.activeDays }}</td>
                            </tr></tbody>
                        </table>
                    </OmniscienceV3Card>
                    <OmniscienceV3Card title="Rising" flush :empty="!p.rising.length" empty-title="Nobody rising">
                        <table class="omni-table">
                            <thead><tr><th>Person</th><th class="num">Recent</th><th class="num">Earlier</th><th></th></tr></thead>
                            <tbody><tr v-for="r in p.rising" :key="r.personId">
                                <td><NuxtLink :to="personLink(r.personId)">{{ r.name ?? r.personId }}</NuxtLink></td>
                                <td class="num">{{ omniCount(r.recent) }}</td><td class="num">{{ omniCount(r.earlier) }}</td>
                                <td><span v-if="r.isNew" class="omni-chip sm info">new</span><span v-if="r.everywhere" class="omni-chip sm" title="As busy everywhere, not just here">everywhere</span></td>
                            </tr></tbody>
                        </table>
                    </OmniscienceV3Card>
                    <OmniscienceV3Card title="Tone">
                        <div v-for="label in TONE" :key="label" class="tone">
                            <span class="lbl">{{ label }}</span>
                            <span class="bars"><span class="now" :style="{ width: share(p.tone.recent, label) }"></span></span>
                            <span class="omni-muted">{{ share(p.tone.recent, label) }} <span class="base">(usual {{ share(p.tone.baseline, label) }})</span></span>
                        </div>
                    </OmniscienceV3Card>
                    <OmniscienceV3Card title="What it says about you" :empty="!p.aboutKlives.messages" empty-title="Nothing about you here">
                        <p class="omni-muted">{{ Object.entries(p.aboutKlives.kinds).map(([k, n]) => `${omniHumanise(k).toLowerCase()} ${n}`).join(' · ') }}</p>
                        <div v-for="label in TONE" :key="label" class="tone">
                            <span class="lbl">{{ label }}</span>
                            <span class="bars"><span class="now" :style="{ width: share(p.aboutKlives.sentiment, label) }"></span></span>
                            <span class="omni-muted">{{ share(p.aboutKlives.sentiment, label) }}</span>
                        </div>
                        <p class="omni-muted">Mostly from: <template v-for="(t, i) in p.aboutKlives.people" :key="t.personId"><template v-if="i">, </template>
                            <NuxtLink :to="personLink(t.personId)">{{ t.name ?? t.personId }}</NuxtLink> ({{ t.messages }})</template></p>
                    </OmniscienceV3Card>
                </div>

                <OmniscienceV3Card v-if="p && p.events.length" title="What changed">
                    <ul class="events"><li v-for="e in p.events" :key="e.day + e.kind"><span class="omni-muted">{{ e.day }}</span> {{ e.text }}</li></ul>
                </OmniscienceV3Card>
                <div v-if="p && (p.factions.length || p.channels.length)" class="omni-grid two">
                    <OmniscienceV3Card title="Factions" :subtitle="p.factionModularity != null ? `modularity ${p.factionModularity.toFixed(2)}` : undefined" :empty="!p.factions.length" empty-title="One group">
                        <div v-for="f in p.factions" :key="f.factionId" class="faction">
                            <strong>{{ f.size }} people</strong>
                            <span class="omni-muted"><template v-for="(m, i) in f.members" :key="m.personId"><template v-if="i">, </template>
                                <NuxtLink :to="personLink(m.personId)">{{ m.name ?? m.personId }}</NuxtLink></template></span>
                        </div>
                    </OmniscienceV3Card>
                    <OmniscienceV3Card title="Channels" flush :empty="!p.channels.length">
                        <table class="omni-table"><tbody>
                            <tr v-for="c in p.channels" :key="c.conversationId"><td>{{ c.title ?? c.conversationId }}</td><td class="num">{{ omniCount(c.messages) }}</td><td class="num">{{ c.people }} people</td></tr>
                        </tbody></table>
                    </OmniscienceV3Card>
                </div>
            </div>
        </div>

        <!-- ── circles (N12) ─────────────────────────────────────────────── -->
        <template v-else-if="filters.tab === 'circles'">
            <OmniscienceV3Panel title="Circles" :subtitle="circles.data.value ? `${omniCount(circles.data.value.people)} people · modularity ${circles.data.value.modularity.toFixed(2)}` : undefined"
                                :loading="circles.loading.value" :error="circles.error.value" :has-data="!!circles.data.value"
                                :empty="!!circles.data.value && !circles.data.value.communities.length" empty-title="No circles yet"
                                :empty-text="circles.data.value?.note" @retry="circles.refresh()">
                <template v-if="circles.data.value">
                    <p class="omni-muted">{{ circles.data.value.note }}</p>
                    <div class="circles" data-testid="circles">
                        <div v-for="c in circles.data.value.communities" :key="c.communityId" class="circle">
                            <strong>{{ c.size }} people</strong>
                            <span class="omni-muted"><template v-for="(m, i) in c.top" :key="m.personId"><template v-if="i">, </template>
                                <NuxtLink :to="personLink(m.personId)">{{ m.name ?? m.personId }}</NuxtLink></template></span>
                        </div>
                    </div>
                    <section v-if="circles.data.value.bridges.length" class="omni-section">
                        <h4>Bridges between circles</h4>
                        <ul><li v-for="b in circles.data.value.bridges" :key="b.personId">
                            <NuxtLink :to="personLink(b.personId)">{{ b.name ?? b.personId }}</NuxtLink> · {{ omniPercent(b.outsideShare) }} of their ties reach another circle</li></ul>
                    </section>
                </template>
            </OmniscienceV3Panel>
        </template>

        <!-- ── map (N16) ────────────────────────────────────────────────── -->
        <template v-else>
            <OmniscienceV3Panel title="People map" :subtitle="map.data.value ? `${omniCount(map.data.value.points.length)} of ${omniCount(map.data.value.people)} people` : undefined"
                                :loading="map.loading.value" :error="map.error.value" :has-data="!!map.data.value"
                                :empty="!!map.data.value && !map.data.value.points.length" empty-title="No map yet"
                                empty-text="People are placed by what they talk about, their tone, style and rhythm; similar people sit close together." @retry="map.refresh()">
                <template v-if="map.data.value && map.data.value.points.length">
                    <svg class="map" :viewBox="`${box.x0} ${box.y0} ${box.w} ${box.h}`" role="img" aria-label="People placed by similarity" data-testid="people-map">
                        <a v-for="pt in map.data.value.points" :key="pt.personId" :href="personLink(pt.personId)" @click.prevent="router.push(personLink(pt.personId))">
                            <circle :cx="pt.x" :cy="pt.y" :r="radius(pt.messages)" :fill="colour(pt.communityId)"><title>{{ pt.name ?? pt.personId }} · {{ omniCount(pt.messages) }} messages</title></circle>
                        </a>
                    </svg>
                    <p class="omni-muted">Colour is the circle a person belongs to; size is how much they write. Positions carry over between rebuilds, so a person who moves really changed.</p>
                </template>
            </OmniscienceV3Panel>
        </template>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { OMNI_BASE, omniGet, omniPost } from '~/scripts/omniscience/api';
import type { CommunitiesDto, InsightsRefreshDto, PeopleMapDto, SpaceListDto, SpacePageDto } from '~/scripts/omniscience/contracts';
import { omniCount, omniPercent } from '~/scripts/omniscience/format';
import { omniHumanise } from '~/scripts/omniscience/findings';
import { useOmniAction, useOmniResource } from '~/composables/useOmniscienceV3';
import { useOmniUrlState } from '~/composables/useOmniscienceV3';
import { useAccess } from '~/composables/useAccess';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Communities' });

type Tab = 'places' | 'circles' | 'map';
const TABS: { value: Tab; label: string }[] = [{ value: 'places', label: 'Places' }, { value: 'circles', label: 'Circles' }, { value: 'map', label: 'People map' }];
const TONE = ['positive', 'neutral', 'negative'];
const PALETTE = ['#58a6ff', '#3fb950', '#d29922', '#bc8cff', '#f778ba', '#39c5cf', '#ff7b72', '#a5d6ff', '#7ee787', '#e3b341'];

const router = useRouter();
const { can } = useAccess();
const canManage = computed(() => can('omniscience.engine.manage'));
const { busy, run } = useOmniAction();
const { state: filters } = useOmniUrlState({ tab: 'places' as Tab, scopeKind: '', scopeId: '' });

function personLink(id: string): string { return `${OMNI_BASE}/people/${encodeURIComponent(id)}`; }
function isOpen(kind: string, id: string): boolean { return filters.scopeKind === kind && filters.scopeId === id; }
function open(kind: string, id: string) { filters.scopeKind = kind; filters.scopeId = id; }

const spaces = useOmniResource(signal => omniGet<SpaceListDto>('insights/spaces', {}, signal));
const page = useOmniResource(signal => (filters.scopeId
    ? omniGet<SpacePageDto>('insights/space', { scopeKind: filters.scopeKind, scopeId: filters.scopeId }, signal)
    : Promise.resolve(null as SpacePageDto | null)));
watch(() => `${filters.scopeKind}|${filters.scopeId}`, () => { page.data.value = null; void page.refresh(); });
const p = computed(() => page.data.value);
const maxDay = computed(() => Math.max(1, ...(p.value?.days ?? []).map(d => d.messages)));

const circles = useOmniResource(signal => omniGet<CommunitiesDto>('insights/communities', {}, signal));
const map = useOmniResource(signal => omniGet<PeopleMapDto>('insights/map', { limit: 5000 }, signal));

async function rebuild() {
    await run('space-refresh', () => omniPost<InsightsRefreshDto>('insights/space/refresh', { scopeKind: filters.scopeKind, scopeId: filters.scopeId }),
        r => `Rebuilding this page (job #${r.jobId}); refresh in a minute.`);
}
async function refreshCircles() {
    await run('insights-refresh', () => omniPost<InsightsRefreshDto>('insights/refresh', {}), r => `Recomputing circles and relationships (job #${r.jobId}).`);
}

function bar(n: number, max: number): number { return n <= 0 ? 0 : Math.max(1.5, (n / max) * 38); }
function total(mix: Record<string, number>): number { return Object.values(mix).reduce((a, b) => a + b, 0); }
function share(mix: Record<string, number>, label: string): string {
    const t = total(mix);
    return t ? `${Math.round(((mix[label] ?? 0) / t) * 100)}%` : '0%';
}
function change(now: number, before: number): string {
    if (!before) return now ? '(new)' : '';
    const pct = Math.round(((now - before) / before) * 100);
    return pct === 0 ? '(same)' : `(${pct > 0 ? '+' : ''}${pct}%)`;
}
function trend(now: number, before: number): string { return now > before * 1.2 ? 'pos' : now < before * 0.8 ? 'neg' : ''; }

const box = computed(() => {
    const pts = map.data.value?.points ?? [];
    if (!pts.length) return { x0: 0, y0: 0, w: 1, h: 1 };
    const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = Math.max(x1 - x0, y1 - y0, 1e-6) * 0.06;
    return { x0: x0 - pad, y0: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
});
const maxMessages = computed(() => Math.max(1, ...(map.data.value?.points ?? []).map(q => q.messages)));
function radius(messages: number): number { return Math.max(box.value.w, box.value.h) * (0.004 + 0.012 * Math.sqrt(messages / maxMessages.value)); }
const communityIndex = computed(() => {
    const index = new Map<string, number>();
    for (const c of circles.data.value?.communities ?? []) index.set(c.communityId, index.size);
    return index;
});
function colour(communityId?: string | null): string {
    if (!communityId) return 'var(--omni-muted, #8b949e)';
    let i = communityIndex.value.get(communityId);
    if (i === undefined) i = [...communityId].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
    return PALETTE[i % PALETTE.length]!;
}
</script>

<style scoped>
.tabs { margin-bottom: var(--omni-gutter); }
.stack { display: flex; flex-direction: column; gap: var(--omni-gutter); min-width: 0; }
.places { list-style: none; margin: 0; padding: 0; }
.places li button { all: unset; box-sizing: border-box; width: 100%; display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-bottom: 1px solid var(--omni-line); cursor: pointer; font-size: 13px; }
.places li button:hover { background: var(--omni-surface-3); }
.places li.active button { background: var(--omni-accent-soft); box-shadow: inset 2px 0 0 var(--omni-accent); }
.places .title { font-weight: 600; }
.series { width: 100%; height: 70px; margin-top: 12px; }
.series rect { fill: var(--omni-accent, #58a6ff); }
.tone { display: grid; grid-template-columns: 70px 1fr auto; gap: 8px; align-items: center; font-size: 12.5px; margin: 4px 0; }
.tone .bars { height: 8px; background: var(--omni-line); border-radius: 4px; overflow: hidden; }
.tone .bars .now { display: block; height: 100%; background: var(--omni-accent, #58a6ff); }
.tone .base { font-size: 11px; }
.events { margin: 0; padding-left: 18px; font-size: 13px; }
.faction, .circle { display: flex; flex-direction: column; gap: 2px; padding: 6px 0; border-bottom: 1px solid var(--omni-line); font-size: 13px; }
.circles { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0 16px; }
.map { width: 100%; height: min(70vh, 640px); background: var(--omni-surface-2); border-radius: 6px; }
.map circle { opacity: 0.85; cursor: pointer; }
.map circle:hover { opacity: 1; stroke: var(--omni-text); stroke-width: 0.002; }
</style>
