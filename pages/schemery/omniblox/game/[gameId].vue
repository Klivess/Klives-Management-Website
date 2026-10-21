<template>
    <OmniBloxShell @refresh="load">
        <div v-if="loadError && !detail" class="ot-card">
            <div class="body">
                <OmniTraderStateBlock kind="error" :title="notFound ? 'No such game' : 'Could not load the game'" :detail="loadError">
                    <NuxtLink class="ot-btn sm" to="/schemery/omniblox">Back to the studio</NuxtLink>
                </OmniTraderStateBlock>
            </div>
        </div>

        <template v-else>
            <div class="ot-pagehead bx-head">
                <div class="who">
                    <OmniBloxImg v-if="summary?.HasIcon" class="icon" :path="bloxMediaPath(gameId, 'icon.png', game?.UpdatedUtc)" ratio="1 / 1" :alt="`${title} icon`" />
                    <div>
                        <h1>{{ title }}</h1>
                        <p class="subtitle">
                            <span v-if="game" class="ot-chip" :class="bloxStageTone(game.Stage)">{{ game.Stage }}</span>
                            <span v-if="game?.Paused" class="ot-chip">Paused</span>
                            <span v-if="game?.UrgentMaintenance" class="ot-chip bad">Urgent maintenance</span>
                            {{ headline }}
                        </p>
                    </div>
                </div>
                <div v-if="game" class="ot-actions">
                    <button v-if="detail?.Playtest.Playable" class="ot-btn sm" :class="awaitingApproval ? '' : 'primary'" :aria-expanded="playOpen" @click="setPlay(!playOpen)">
                        ▶ Play
                    </button>
                    <a v-if="game.Slot && game.Publish.IsPublic" class="ot-btn ghost sm" :href="bloxRobloxGameUrl(game.Slot.PlaceId)" target="_blank" rel="noopener">Open on Roblox ↗</a>
                    <template v-if="can('omniblox.studio.act') && active">
                        <button class="ot-btn ghost sm" :aria-expanded="steerOpen" @click="steerOpen = !steerOpen">Steer</button>
                        <button class="ot-btn sm" :disabled="busy" @click="setPaused(!game.Paused)">{{ game.Paused ? 'Resume' : 'Pause' }}</button>
                    </template>
                    <button v-if="can('omniblox.studio.act') && game.Stage === 'Live'" class="ot-btn sm" :disabled="busy || game.UrgentMaintenance" @click="maintain">Maintain now</button>
                    <button v-if="awaitingApproval && can('omniblox.studio.manage')" class="ot-btn primary sm" :disabled="busy" @click="approve">Approve launch</button>
                    <button v-if="can('omniblox.studio.manage') && game.Stage === 'Abandoned'" class="ot-btn primary sm" :disabled="busy" @click="revive">Revive</button>
                    <button v-if="can('omniblox.studio.manage') && abandonable" class="ot-btn danger sm" :disabled="busy" @click="abandon">Abandon</button>
                </div>
            </div>

            <div v-if="playOpen && game && detail" ref="playPanel" class="bx-section">
                <OmniBloxPlayPanel :game="game" :view="detail.Playtest" :revisions="detail.Revisions" :title="title" @close="setPlay(false)" @changed="load" />
            </div>

            <div v-if="detail && detail.Watchdog.Level > 0 && active" class="ot-banner" :class="detail.Watchdog.Level >= 3 ? 'bad' : 'warn'" role="status">
                <span class="glyph" aria-hidden="true">{{ detail.Watchdog.Level >= 3 ? '⏸' : '!' }}</span>
                <div class="watchdog">
                    <strong>Watchdog: {{ detail.Watchdog.Name }}</strong>
                    <span>{{ watchdogText }}</span>
                    <details>
                        <summary>How the watchdog works</summary>
                        <ul class="bx-list small"><li v-for="l in detail.Watchdog.Ladder" :key="l">{{ l }}</li></ul>
                        <ul v-if="detail.Watchdog.History.length" class="bx-list small history"><li v-for="(h, i) in detail.Watchdog.History.slice().reverse()" :key="i">{{ h }}</li></ul>
                    </details>
                </div>
                <button v-if="detail.Watchdog.Level >= 3 && can('omniblox.studio.act')" class="ot-btn primary sm" :disabled="busy" @click="resume">Resume</button>
            </div>
            <div v-else-if="game?.WaitingReason" class="ot-banner warn" role="status">
                <span class="glyph" aria-hidden="true">!</span>
                <div><strong>Waiting</strong> {{ game.WaitingReason }}</div>
            </div>
            <div v-if="game?.Publish.LastLaunchError && game.Stage === 'Launch'" class="ot-banner" role="status">
                <span class="glyph" aria-hidden="true">⚠</span>
                <div><strong>Last launch step failed ({{ game.Publish.LastLaunchStep }})</strong> {{ game.Publish.LastLaunchError }}</div>
            </div>

            <OmniTraderCard v-if="detail?.OwnerTasks.some(t => t.Status === 'Open')" class="bx-section" attention title="Needs you">
                <OmniBloxTaskList :tasks="detail.OwnerTasks.filter(t => t.Status === 'Open')" :show-game="false" :games="overview?.Games ?? []" @changed="load" />
            </OmniTraderCard>

            <section class="ot-card bx-stage bx-section" :aria-busy="!detail">
                <OmniBloxStageTrack v-if="game" :stage="game.Stage" :reached="reached" />
                <div v-if="detail" class="stage-body">
                    <p v-if="detail.Goal" class="goal">{{ detail.Goal }}</p>
                    <ul v-if="detail.Checklist.length" class="checklist" aria-label="Exit criteria">
                        <li v-for="c in detail.Checklist" :key="c.Text" :class="{ met: c.Met }">
                            <span class="box" aria-hidden="true">{{ c.Met ? '✓' : '' }}</span>{{ c.Text }}
                        </li>
                    </ul>
                    <p class="meta bx-muted">
                        {{ stageMeta }}
                    </p>
                </div>
                <div v-else class="ot-skel" style="height:64px"></div>
            </section>

            <div v-if="detail && game && (detail.Live || active || game.Directives.length)" class="ot-grid two bx-section bx-now">
                <OmniBloxLivePanel :game-id="gameId" :initial="detail.Live" @finished="load" />
                <div v-if="steerOpen || game.Directives.length" ref="directionsCard">
                    <OmniBloxDirections :game="game" :can-act="can('omniblox.studio.act')" @changed="load" />
                </div>
            </div>

            <div class="ot-segment tabs" role="tablist" aria-label="Game sections">
                <button v-for="t in tabs" :key="t.id" type="button" role="tab" :aria-pressed="tab === t.id" :aria-selected="tab === t.id" @click="setTab(t.id)">
                    {{ t.label }}<span v-if="t.count" class="count">{{ t.count }}</span>
                </button>
            </div>

            <div v-if="!detail" class="ot-skelrows"><div v-for="n in 4" :key="n" class="ot-skel" style="height:120px"></div></div>

            <template v-else-if="game">
                <div v-if="tab === 'overview'" class="ot-grid two">
                    <div class="col">
                        <OmniTraderCard title="Brief" :empty="!game.Brief" empty-title="No brief yet" empty-text="Research writes the brief once a concept is chosen.">
                            <template v-if="game.Brief">
                                <p class="pitch">{{ game.Brief.Pitch }}</p>
                                <dl class="ot-kv">
                                    <dt>Template</dt><dd>{{ game.Brief.Template }}</dd>
                                    <dt>Core loop</dt><dd class="prose">{{ game.Brief.CoreLoop }}</dd>
                                    <dt>For</dt><dd class="prose">{{ game.Brief.TargetPlayers || '—' }}</dd>
                                    <template v-if="game.Brief.Marketing.Hook"><dt>Hook</dt><dd class="prose">{{ game.Brief.Marketing.Hook }}</dd></template>
                                </dl>
                                <h3 class="ot-sectionhead bx-sub">Must have</h3>
                                <ul class="bx-list"><li v-for="m in game.Brief.MustHave" :key="m">{{ m }}</li></ul>
                                <h3 class="ot-sectionhead bx-sub">Done when</h3>
                                <ul class="bx-list"><li v-for="m in game.Brief.DoneWhen" :key="m">{{ m }}</li></ul>
                                <template v-if="game.Brief.NiceToHave.length">
                                    <h3 class="ot-sectionhead bx-sub">Nice to have</h3>
                                    <ul class="bx-list"><li v-for="m in game.Brief.NiceToHave" :key="m">{{ m }}</li></ul>
                                </template>
                            </template>
                        </OmniTraderCard>

                        <OmniTraderCard title="Milestones" :empty="!game.Milestones.length" empty-title="No milestones yet">
                            <ul class="checklist">
                                <li v-for="m in game.Milestones" :key="m.MilestoneId" :class="{ met: m.Done }">
                                    <span class="box" aria-hidden="true">{{ m.Done ? '✓' : '' }}</span>
                                    <span>{{ m.Title }}<span v-if="m.Notes" class="note"> — {{ m.Notes }}</span></span>
                                </li>
                            </ul>
                        </OmniTraderCard>

                        <OmniTraderCard title="Last test" :empty="!game.LastTest" empty-title="Not tested yet">
                            <template #controls><button type="button" class="ot-btn ghost sm" @click="setTab('tests')">All checks</button></template>
                            <template v-if="game.LastTest">
                                <p class="testline">
                                    <span class="ot-chip" :class="game.LastTest.Passed ? 'ok' : 'bad'">{{ game.LastTest.Passed ? 'Passed' : 'Failed' }}</span>
                                    r{{ game.LastTest.BuildRevision }} · {{ fmtRelative(game.LastTest.Utc, now) }}
                                </p>
                                <p class="prose">{{ game.LastTest.Summary }}</p>
                                <div class="bx-tags">
                                    <span class="ot-chip" :class="game.LastTest.StaticOk ? 'ok' : 'bad'">Luau, types + scene</span>
                                    <span class="ot-chip" :class="game.LastTest.GeometryOk ? 'ok' : 'bad'">Geometry</span>
                                    <span v-if="game.LastTest.MapScore != null" class="ot-chip" :class="game.LastTest.MapScore >= 60 ? 'ok' : 'bad'">Map {{ game.LastTest.MapScore }}/100</span>
                                    <span class="ot-chip" :class="!game.LastTest.EngineRan ? '' : game.LastTest.EngineOk ? 'ok' : 'bad'">{{ game.LastTest.EngineRan ? 'Roblox engine' : 'Engine not run' }}</span>
                                </div>
                                <ul v-if="lastTestIssues.length" class="issues">
                                    <li v-for="(issue, i) in lastTestIssues" :key="i" :class="issue.Severity">
                                        <span class="sev">{{ issue.Severity }}</span>
                                        <span class="area">{{ issue.Area }}</span>
                                        {{ issue.Message }}
                                    </li>
                                </ul>
                            </template>
                        </OmniTraderCard>
                    </div>

                    <div class="col">
                        <OmniTraderCard title="Key facts" subtitle="Kept word for word in every briefing; a fact with the same key replaces the old one" :empty="!game.KeyFacts.length" empty-title="None yet">
                            <ul class="facts">
                                <li v-for="(f, i) in game.KeyFacts" :key="`${f.Key}-${i}`">
                                    <span v-if="f.Source !== 'agent'" class="ot-chip" :class="f.Source === 'owner' ? 'info' : 'violet'">{{ f.Source === 'owner' ? 'you' : f.Source }}</span>
                                    <strong v-if="f.Key" class="key">{{ f.Key }}</strong>
                                    <span class="text">{{ f.Text }}</span>
                                </li>
                            </ul>
                        </OmniTraderCard>

                        <OmniTraderCard title="Decisions" :empty="!game.Decisions.length" empty-title="None yet" flush>
                            <ol class="decisions">
                                <li v-for="(d, i) in decisions" :key="i">
                                    <span class="what">{{ d.What }}</span>
                                    <span class="why">{{ d.Why }}</span>
                                    <span class="sub">{{ d.Stage }} · {{ fmtRelative(d.Utc, now) }}</span>
                                </li>
                            </ol>
                        </OmniTraderCard>

                        <OmniTraderCard title="Concepts" subtitle="Scored 0–10; feasibility weighs most" :empty="!game.Concepts.length" empty-title="No concepts yet" flush>
                            <div class="ot-tablewrap">
                                <table class="bx-table">
                                    <thead><tr><th>Concept</th><th title="Demand">D</th><th title="Competition">C</th><th title="Monetisation">M</th><th title="Feasibility">F</th><th title="Lessons">L</th><th>Total</th></tr></thead>
                                    <tbody>
                                        <tr v-for="c in game.Concepts" :key="c.ConceptId" :class="{ chosen: c.Chosen }">
                                            <td><span v-if="c.Chosen" class="ot-chip ok">chosen</span> {{ c.Pitch }} <span class="bx-muted">· {{ c.Template }}</span></td>
                                            <td>{{ c.Scores.Demand }}</td><td>{{ c.Scores.Competition }}</td><td>{{ c.Scores.Monetization }}</td><td>{{ c.Scores.Feasibility }}</td><td>{{ c.Scores.Lessons }}</td>
                                            <td class="total">{{ c.Scores.Total.toFixed(2) }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </OmniTraderCard>

                        <OmniTraderCard v-if="game.Research.Findings.length" title="Research findings">
                            <ul class="bx-list"><li v-for="(f, i) in game.Research.Findings" :key="i">{{ f }}</li></ul>
                        </OmniTraderCard>
                    </div>
                </div>

                <OmniBloxGameWorld v-else-if="tab === 'world'" :game="game" :playable="detail.Playtest.Playable" @play="setPlay(true)" />
                <OmniBloxGameTests v-else-if="tab === 'tests'" :game="game" :engine-available="detail.EngineAvailable" :can-act="can('omniblox.studio.act')" @changed="load" />
                <OmniBloxGameStore v-else-if="tab === 'store'" :game="game" :media="detail.Media" />
                <OmniBloxGameNumbers v-else-if="tab === 'numbers'" :game="game" />
                <OmniBloxGameBrain v-else-if="tab === 'brain'" :game="game" :cycle-logs="detail.CycleLogs" />
                <OmniBloxGameFiles v-else-if="tab === 'files'" :game-id="gameId" :revision="game.Build.Revision" />
                <OmniTraderCard v-else-if="tab === 'activity'" title="Activity" :loading="events === null">
                    <OmniBloxEventList :events="events ?? []" :show-game="false" :limit="40" empty-text="Nothing recorded for this game yet." />
                </OmniTraderCard>
            </template>
        </template>
    </OmniBloxShell>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAccess } from '~/composables/useAccess';
import { confirmAction, fmtDate, fmtRelative, notify, useNow, usePoll } from '~/composables/useOmniTumblr';
import {
    BLOX_STAGES, bloxGet, bloxMediaPath, bloxPost, bloxRobloxGameUrl, bloxStageTone, useBloxOverview,
    type BloxEvent, type BloxGameDetail, type BloxStage,
} from '~/composables/useOmniBlox';

definePageMeta({ layout: 'navbar' });

const route = useRoute();
const router = useRouter();
const { can } = useAccess();
const now = useNow();
const { overview, refresh: refreshOverview } = useBloxOverview();

const gameId = computed(() => String(route.params.gameId));
const detail = ref<BloxGameDetail | null>(null);
const loadError = ref<string | null>(null);
const notFound = ref(false);
const game = computed(() => detail.value?.Game ?? null);
const summary = computed(() => detail.value?.Summary ?? overview.value?.Games.find(g => g.GameId === gameId.value) ?? null);
const title = computed(() => summary.value?.Title ?? 'Game');

useHead(() => ({ title: `${title.value} · OmniBlox` }));

async function load() {
    const id = gameId.value;
    const result = await bloxGet<BloxGameDetail>(`/omniblox/game?id=${encodeURIComponent(id)}`);
    if (id !== gameId.value) return;
    if (result.ok && result.data) {
        detail.value = result.data;
        loadError.value = null;
        notFound.value = false;
    } else {
        loadError.value = result.error;
        notFound.value = result.status === 404;
    }
    if (tab.value === 'activity') void loadEvents();
}

usePoll(load, 20_000);
watch(gameId, () => {
    detail.value = null;
    events.value = null;
    void load();
});

const active = computed(() => !!game.value && !['Live', 'Sunset', 'Abandoned'].includes(game.value.Stage));
const abandonable = computed(() => !!game.value && !['Live', 'Sunset', 'Abandoned'].includes(game.value.Stage));
const awaitingApproval = computed(() => game.value?.Stage === 'Launch'
    && !!detail.value?.OwnerTasks.some(t => t.Kind === 'LaunchApproval' && t.Status === 'Open'));
const reached = computed<BloxStage | null>(() => {
    const cycles = game.value?.StageCycles ?? {};
    return [...BLOX_STAGES].reverse().find(s => (cycles[s] ?? 0) > 0) ?? null;
});

const headline = computed(() => {
    const g = game.value;
    if (!g) return 'Loading…';
    if (g.Stage === 'Abandoned') return g.AbandonReason ?? 'Abandoned';
    if (g.Stage === 'Live' && g.Publish.WentPublicUtc) return `Live since ${fmtDate(g.Publish.WentPublicUtc)} · ${g.Brief?.Genre ?? ''}`;
    return [g.Brief?.Genre, g.Brief?.Template && g.Brief.Template !== g.Brief.Genre ? `${g.Brief.Template} template` : null, `started ${fmtRelative(g.CreatedUtc, now.value)}`]
        .filter(Boolean).join(' · ');
});

const stageMeta = computed(() => {
    const s = summary.value;
    const g = game.value;
    if (!s || !g) return '';
    const parts: string[] = [];
    if (g.Stage === 'Live') {
        if (g.NextMaintenanceUtc) parts.push(`next maintenance ${fmtRelative(g.NextMaintenanceUtc, now.value)}`);
        parts.push(`${g.Maintenance.length} maintenance cycle${g.Maintenance.length === 1 ? '' : 's'}`);
    } else if (g.Stage !== 'Abandoned' && g.Stage !== 'Sunset') {
        parts.push(`in ${g.Stage.toLowerCase()} since ${fmtRelative(g.StageEnteredUtc, now.value)}`);
        parts.push(`${s.StageCycles} cycle${s.StageCycles === 1 ? '' : 's'} (no limit: it works until the criteria are met)`);
        if (g.NextAttemptUtc && new Date(g.NextAttemptUtc).getTime() > now.value) parts.push(`next attempt ${fmtRelative(g.NextAttemptUtc, now.value)}`);
        if (g.ProviderFailures) parts.push(`the model was unreachable ${g.ProviderFailures} time${g.ProviderFailures === 1 ? '' : 's'} in a row (backing off; not counted against the game)`);
    }
    if (g.Escalations) parts.push(`${g.Escalations} watchdog escalation${g.Escalations === 1 ? '' : 's'}`);
    return parts.join(' · ');
});

const decisions = computed(() => (game.value?.Decisions ?? []).slice().reverse().slice(0, 12));
const lastTestIssues = computed(() => (game.value?.LastTest?.Issues ?? []).filter(i => i.Severity !== 'info').slice(0, 12));

const watchdogText = computed(() => {
    const w = detail.value?.Watchdog;
    if (!w) return '';
    if (w.Level >= 3) return 'The same problem kept coming back, so the game is paused and waiting for you: resume it, steer it with a direction (that resumes it too), or abandon it. Nothing is lost while it waits.';
    return w.Directive ?? `${w.StalledCycles} cycle(s) without progress.`;
});

// ── tabs ──
type TabId = 'overview' | 'world' | 'tests' | 'store' | 'numbers' | 'brain' | 'files' | 'activity';
const tabs = computed(() => {
    const g = game.value;
    const failing = g?.Build.LastEngineRun && !g.Build.LastEngineRun.Ok ? g.Build.LastEngineRun.Failed + g.Build.LastEngineRun.Errors.length : 0;
    const list: { id: TabId; label: string; count?: number }[] = [
        { id: 'overview', label: 'Overview' },
        { id: 'world', label: 'World' },
        { id: 'tests', label: 'Tests', count: failing || undefined },
        { id: 'store', label: 'Store' },
    ];
    if (g && (g.Stage === 'Live' || g.Stage === 'Sunset' || g.Stats.Daily.length)) list.push({ id: 'numbers', label: 'Numbers' });
    list.push({ id: 'brain', label: 'Brain', count: g?.Cycles.length || undefined });
    list.push({ id: 'files', label: 'Files' });
    list.push({ id: 'activity', label: 'Activity' });
    return list;
});
const tab = computed<TabId>(() => {
    const wanted = String(route.query.tab ?? 'overview') as TabId;
    return tabs.value.some(t => t.id === wanted) ? wanted : 'overview';
});
function setTab(id: TabId) {
    void router.replace({ query: { ...route.query, tab: id === 'overview' ? undefined : id } });
}

// ── play (kept in the URL, so a game card can link straight to it) ──
const playOpen = computed(() => route.query.play === '1');
const playPanel = ref<HTMLElement | null>(null);
function setPlay(open: boolean) {
    void router.replace({ query: { ...route.query, play: open ? '1' : undefined } });
}
watch(() => playOpen.value && !!detail.value, async visible => {
    if (!visible) return;
    await nextTick();
    playPanel.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

const events = ref<BloxEvent[] | null>(null);
async function loadEvents() {
    const result = await bloxGet<{ Events: BloxEvent[] }>(`/omniblox/events?gameId=${encodeURIComponent(gameId.value)}&limit=200`);
    if (result.ok && result.data) events.value = result.data.Events;
}
watch(tab, t => { if (t === 'activity') void loadEvents(); }, { immediate: true });

// ── actions ──
const busy = ref(false);
async function act(path: string, body: Record<string, unknown>, success?: string) {
    busy.value = true;
    try {
        const result = await bloxPost(path, { gameId: gameId.value, ...body });
        if (!result.ok) notify('That did not work', result.error ?? '', 'error');
        else if (success) notify(success);
        await Promise.all([load(), refreshOverview()]);
        return result.ok;
    } finally {
        busy.value = false;
    }
}

const setPaused = (paused: boolean) => act('/omniblox/games/pause', { paused });
const resume = () => act('/omniblox/games/resume', {}, 'Resumed; the watchdog starts over');
const maintain = () => act('/omniblox/games/maintain', {}, 'Maintenance queued');
const approve = () => act('/omniblox/games/approve', {}, 'Launch approved');

async function abandon() {
    if (!await confirmAction(`Abandon "${title.value}"?`, 'The studio stops working on it and frees its experience slot. Everything is kept, and you can revive it later where it stopped.', 'Abandon', true)) return;
    await act('/omniblox/games/abandon', { reason: 'abandoned by the owner' });
}

async function revive() {
    const where = game.value?.AbandonedFromStage;
    const back = where === 'Test' || where === 'Launch' ? 'Build' : where ?? 'where it stopped';
    if (!await confirmAction(`Revive "${title.value}"?`, `It goes back to ${back} with all its files and history; the watchdog starts over.`, 'Revive')) return;
    await act('/omniblox/games/revive', {}, 'Revived');
}

// Steer opens the directions card (and brings it into view).
const steerOpen = ref(false);
const directionsCard = ref<HTMLElement | null>(null);
watch(steerOpen, async open => {
    if (!open) return;
    await nextTick();
    directionsCard.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    directionsCard.value?.querySelector('textarea')?.focus();
});
</script>

<style scoped>
.bx-head .who { display: flex; gap: var(--ot-space-3); align-items: center; min-width: 0; }
.bx-head .icon { width: 56px; flex: 0 0 56px; }
.bx-head h1 { overflow-wrap: anywhere; }
.subtitle { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.bx-now { align-items: start; }
.ot-banner.bad { border-color: var(--ot-negative); background: var(--ot-negative-soft); }
.watchdog { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
.watchdog details { font-size: 12px; }
.watchdog summary { cursor: pointer; color: var(--ot-text-2); }
.watchdog .history { margin-top: 6px; color: var(--ot-muted); }
.small { font-size: 12px; }
.facts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; line-height: 18px; }
.facts li { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.facts .key { font-family: var(--ot-mono); font-size: 11.5px; color: var(--ot-accent); }
.facts .key::after { content: ':'; }
.facts .text { overflow-wrap: anywhere; }
.bx-stage { padding: var(--ot-card-pad); display: flex; flex-direction: column; gap: var(--ot-space-3); }
.stage-body { display: flex; flex-direction: column; gap: var(--ot-space-2); }
.goal { margin: 0; font-size: 13px; line-height: 19px; color: var(--ot-text-2); }
.meta { margin: 0; font-size: 11.5px; }
.checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; }
.checklist li { display: flex; gap: var(--ot-space-2); align-items: flex-start; color: var(--ot-text-2); }
.checklist li.met { color: var(--ot-text); }
.box {
    flex: 0 0 16px; height: 16px; border-radius: 4px; border: 1px solid var(--ot-line-strong);
    display: inline-flex; align-items: center; justify-content: center; font-size: 11px; margin-top: 1px;
}
.met .box { background: var(--ot-positive-soft); border-color: var(--ot-positive); color: var(--ot-positive); }
.note { color: var(--ot-muted); }
.tabs { margin: var(--ot-space-2) 0 var(--ot-space-4); flex-wrap: wrap; }
.tabs .count { margin-left: 6px; padding: 0 6px; border-radius: 999px; background: var(--ot-surface-3); font-size: 11px; }
.col { display: flex; flex-direction: column; gap: var(--ot-gutter); min-width: 0; }
.pitch { margin: 0 0 var(--ot-space-3); font-size: 13.5px; line-height: 19px; }
.prose { font-family: inherit; white-space: pre-wrap; }
.bx-sub { margin-top: var(--ot-space-4); }
.testline { margin: 0 0 6px; display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--ot-muted); }
.issues { list-style: none; margin: var(--ot-space-3) 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.issues .sev { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 6px; color: var(--ot-muted); }
.issues .error .sev { color: var(--ot-negative); }
.issues .warning .sev { color: var(--ot-warning); }
.issues .area { font-family: var(--ot-mono); color: var(--ot-text-2); margin-right: 6px; }
.decisions { list-style: none; margin: 0; padding: 0; }
.decisions li { display: flex; flex-direction: column; gap: 2px; padding: var(--ot-space-2) var(--ot-card-pad); font-size: 12.5px; }
.decisions li + li { border-top: 1px solid var(--ot-line); }
.decisions .what { font-weight: 600; }
.decisions .why { color: var(--ot-text-2); }
.decisions .sub { font-size: 11px; color: var(--ot-muted); }
.bx-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.bx-table th { text-align: left; font-weight: 600; color: var(--ot-muted); padding: 6px var(--ot-space-2); border-bottom: 1px solid var(--ot-line); font-size: 11px; }
.bx-table td { padding: 6px var(--ot-space-2); border-bottom: 1px solid var(--ot-line); font-family: var(--ot-mono); }
.bx-table td:first-child { font-family: inherit; }
.bx-table tr.chosen td { background: var(--ot-accent-soft); }
.bx-table .total { font-weight: 700; }
</style>
