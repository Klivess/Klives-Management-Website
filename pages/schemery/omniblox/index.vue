<template>
    <OmniBloxShell>
        <div class="ot-pagehead">
            <div>
                <h1>Game studio</h1>
                <p class="subtitle">{{ subtitle }}</p>
            </div>
            <div class="ot-actions">
                <!-- Jump into the game being built, at whatever stage it is. -->
                <NuxtLink v-if="production?.Playable" class="ot-btn sm bx-playnow" :class="{ primary: overview?.Enabled }" :to="bloxPlayPath(production.GameId)"
                          :title="`Play ${production.Title} as it is now`">
                    ▶ Play {{ production.Title }}
                </NuxtLink>
                <template v-if="overview && can('omniblox.studio.manage')">
                    <button class="ot-btn sm" :class="{ active: overview.HarvesterEnabled }" :aria-pressed="overview.HarvesterEnabled" :disabled="switching"
                            @click="toggle('harvester', !overview.HarvesterEnabled)">
                        Harvester {{ overview.HarvesterEnabled ? 'on' : 'off' }}
                    </button>
                    <button class="ot-btn sm" :class="overview.Enabled ? 'active' : 'primary'" :aria-pressed="overview.Enabled" :disabled="switching"
                            @click="toggle('enabled', !overview.Enabled)">
                        {{ overview.Enabled ? 'Studio on' : 'Switch studio on' }}
                    </button>
                </template>
                <button v-if="can('omniblox.studio.act')" class="ot-btn ghost sm" :aria-expanded="newOpen" @click="newOpen = !newOpen">New game</button>
            </div>
        </div>

        <form v-if="newOpen" class="ot-card bx-new bx-section" @submit.prevent="startGame">
            <input v-model="theme" class="ot-input" maxlength="80" placeholder="Theme to explore (optional), e.g. pirates" aria-label="Theme to explore" />
            <button class="ot-btn primary" :disabled="starting">Start researching</button>
            <button type="button" class="ot-btn ghost" @click="newOpen = false">Cancel</button>
            <p v-if="startError" class="err" role="alert">{{ startError }}</p>
        </form>

        <!-- What needs a decision comes first. -->
        <div v-for="(item, i) in overview?.Attention ?? []" :key="i" class="ot-banner" :class="bannerTone(item.Level)" role="status">
            <span class="glyph" aria-hidden="true">{{ item.Level === 'error' ? '⚠' : item.Level === 'warning' ? '!' : 'ℹ' }}</span>
            <div>
                <strong>{{ item.Title }}</strong>
                {{ item.Detail }}
            </div>
            <div v-if="item.Action && can('omniblox.studio.manage')" class="actions">
                <button class="ot-btn sm" :disabled="switching" @click="toggle(item.Action === 'studio' ? 'enabled' : 'harvester', true)">Switch on</button>
            </div>
        </div>

        <OmniTraderCard v-if="overview?.OwnerTasks.length" class="bx-section" attention title="Needs you"
                        :subtitle="`${overview.OwnerTasks.length} thing${overview.OwnerTasks.length === 1 ? '' : 's'} only you can do`">
            <OmniBloxTaskList :tasks="overview.OwnerTasks" :games="overview.Games" @changed="refresh" />
        </OmniTraderCard>

        <div class="ot-kpis bx-kpis6">
            <OmniTraderKpi label="Live games" :value="overview ? String(overview.StageCounts.Live ?? 0) : '—'" :loading="!overview"
                           :foot="`${overview?.GamesLaunched ?? 0} launched in total`" />
            <OmniTraderKpi label="In production" :value="production ? production.Title : 'none'" small :loading="!overview"
                           :to="production ? `/schemery/omniblox/game/${production.GameId}` : undefined"
                           :foot="production ? productionFoot(production) : 'the next game starts on the studio\'s next step'" />
            <OmniTraderKpi label="Revenue, 30 days" :value="bloxRobux(money?.Revenue30dRobux)" :loading="!overview"
                           :foot="money ? `≈ $${money.Cash30dEstimateUsd.toFixed(2)} at DevEx · spent $0` : ''" />
            <OmniTraderKpi label="Players, last day" :value="lastDay ? fmtCount(lastDay.Players) : '—'" :loading="!overview" :spark="playersSpark"
                           :foot="lastDay ? `${lastDay.Day} · all live games` : 'no live game yet'" />
            <OmniTraderKpi label="Model calls, 7 days" :value="usage ? fmtCount(usage.Week.Calls) : '—'" :loading="!overview" :tone="cacheTone"
                           :foot="usage ? `cache hits ${bloxPct(bloxCacheRate(usage.Week))} · ${bloxTokens(usage.Week.PromptTokens)} prompt tokens` : ''" />
            <OmniTraderKpi label="Labelled models" :value="overview ? fmtCount(labeled) : '—'" :loading="!overview" to="/schemery/omniblox/assets"
                           :foot="overview ? `${fmtCount(overview.Library.Placeable)} placeable of ${fmtCount(overview.Library.Total)} found` : ''" />
        </div>

        <h2 class="ot-sectionhead">Games</h2>
        <div v-if="overview && !overview.Games.length" class="ot-card bx-section">
            <div class="body">
                <OmniTraderStateBlock title="No games yet" :detail="overview.Enabled ? 'The studio starts researching its first game on its next step.' : 'Switch the studio on and it starts researching its first game.'" />
            </div>
        </div>
        <div v-else class="bx-games bx-section">
            <template v-if="!overview">
                <div v-for="n in 3" :key="n" class="ot-skel" style="height:150px"></div>
            </template>
            <OmniBloxGameCard v-for="game in sortedGames" :key="game.GameId" :game="game" />
        </div>

        <div class="ot-grid two bx-section bx-top">
            <OmniTraderCard title="Players and revenue" subtitle="Every live game, from Roblox analytics" :loading="!overview"
                            :empty="!!overview && dailyPoints.players.length < 2" empty-title="No live numbers yet"
                            empty-text="Roblox reports a day's numbers the following day; the line appears after two.">
                <template #controls>
                    <div class="ot-segment sm" role="group" aria-label="Measure">
                        <button type="button" :aria-pressed="measure === 'players'" @click="measure = 'players'">Players</button>
                        <button type="button" :aria-pressed="measure === 'robux'" @click="measure = 'robux'">Robux</button>
                    </div>
                </template>
                <OmniTraderLineChart :series="dailySeries" :height="220" zero-based x-label="Day"
                                     :format="(v: number) => measure === 'robux' ? bloxRobux(v) : fmtCount(v)" />
            </OmniTraderCard>
            <OmniTraderCard title="Activity" subtitle="What the studio did, newest first" :loading="!overview">
                <OmniBloxEventList :events="overview?.Events ?? []" :games="overview?.Games ?? []" :limit="12" />
            </OmniTraderCard>
        </div>

        <div class="ot-grid two bx-section bx-top">
            <OmniTraderCard title="Model usage" subtitle="AIRouter calls per day (flat fee)" :loading="!overview"
                            :empty="!!overview && usagePoints.length < 2" empty-title="Not enough history yet">
                <OmniTraderLineChart :series="[{ name: 'Calls', colour: 'var(--ot-cat-7)', points: usagePoints }]" :height="180" zero-based x-label="Day"
                                     :format="(v: number) => fmtCount(v)" />
                <dl class="ot-kv bx-usage">
                    <dt>Today</dt><dd>{{ fmtCount(usage?.Today.Calls) }} calls · {{ bloxTokens(usage?.Today.PromptTokens) }} prompt tokens</dd>
                    <dt>Cache hits, 7 days</dt><dd>{{ bloxPct(bloxCacheRate(usage?.Week)) }}<template v-if="cacheSplit"> · {{ cacheSplit }}</template></dd>
                    <dt>Re-sent prompt</dt>
                    <dd title="Each agent turn sends its earlier turns again. This is how much of that AIRouter served from its cache: 100% means nothing was prefilled twice, and the hit rate's shortfall is new content no cache can serve.">
                        {{ reuseText }}
                    </dd>
                    <dt>Asset labelling</dt>
                    <dd>
                        {{ fmtCount(usage?.Labeler.Calls) }} call{{ usage?.Labeler.Calls === 1 ? '' : 's' }} in total<template v-if="anchorsText"> · {{ anchorsText }}</template>
                    </dd>
                </dl>
            </OmniTraderCard>
            <OmniTraderCard title="Asset harvester" :subtitle="overview?.HarvesterEnabled ? 'Collecting and labelling free models' : 'Switched off'" :loading="!overview">
                <dl class="ot-kv">
                    <dt>Found</dt><dd>{{ fmtCount(overview?.Harvester.Discovered) }}</dd>
                    <dt>Downloaded</dt><dd>{{ fmtCount(overview?.Harvester.Downloaded) }}</dd>
                    <dt>Labelled</dt><dd>{{ fmtCount(overview?.Harvester.Labeled) }}</dd>
                    <template v-if="overview?.Harvester.Relabeled">
                        <dt>Re-rated</dt>
                        <dd title="Labels scored before the calibrated scale existed, scored again against its reference examples.">{{ fmtCount(overview.Harvester.Relabeled) }}</dd>
                    </template>
                    <dt>Last run</dt><dd>{{ overview?.Harvester.LastHarvestUtc ? fmtRelative(overview.Harvester.LastHarvestUtc, now) : 'never' }}<template v-if="overview?.Harvester.Last"> · {{ overview.Harvester.Last }}</template></dd>
                    <template v-if="overview?.Harvester.LastError"><dt>Last error</dt><dd class="bad">{{ overview.Harvester.LastError }}</dd></template>
                </dl>
                <template v-if="overview?.Harvester.PriorityQueries.length">
                    <h3 class="ot-sectionhead bx-sub">Looking for next</h3>
                    <div class="bx-tags">
                        <span v-for="query in overview.Harvester.PriorityQueries" :key="query" class="ot-chip">{{ query }}</span>
                    </div>
                </template>
                <template v-if="categoryBars.length">
                    <h3 class="ot-sectionhead bx-sub">Labelled by category</h3>
                    <OmniTraderBarList :items="categoryBars" :signed="false" :limit="6" :format="(v: number) => fmtCount(v)" />
                </template>
            </OmniTraderCard>
        </div>
    </OmniBloxShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAccess } from '~/composables/useAccess';
import { fmtCount, fmtRelative, notify, useNow } from '~/composables/useOmniTumblr';
import { bloxCacheRate, bloxPct, bloxPlayPath, bloxPost, bloxReuseRate, bloxRobux, bloxTokens, useBloxOverview, type BloxGameSummary } from '~/composables/useOmniBlox';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'OmniBlox · Klives Management' });

const { can } = useAccess();
const { overview, refresh } = useBloxOverview();
const now = useNow();

const money = computed(() => overview.value?.Money);
const usage = computed(() => overview.value?.Usage);
const labeled = computed(() => overview.value?.Library.ByStatus.labeled ?? 0);
const production = computed(() => (overview.value?.Games ?? [])
    .filter(g => ['Research', 'Build', 'Test', 'Launch'].includes(g.Stage))
    .sort((a, b) => a.CreatedUtc.localeCompare(b.CreatedUtc))[0] ?? null);
const lastDay = computed(() => overview.value?.Daily.at(-1) ?? null);
const playersSpark = computed(() => (overview.value?.Daily ?? []).slice(-14).map(d => d.Players));

const subtitle = computed(() => {
    const o = overview.value;
    if (!o) return 'Loading…';
    const parts = [`${o.Games.length} game${o.Games.length === 1 ? '' : 's'}`, `${o.StageCounts.Live ?? 0} live`];
    if (production.value) parts.push(`${production.value.Stage.toLowerCase()}: ${production.value.Title}`);
    parts.push(`${o.PlaybookLessons} lesson${o.PlaybookLessons === 1 ? '' : 's'} learned`);
    return parts.join(' · ');
});

const ORDER: Record<string, number> = { Launch: 0, Test: 1, Build: 2, Research: 3, Live: 4, Sunset: 5, Abandoned: 6 };
const sortedGames = computed(() => (overview.value?.Games ?? []).slice()
    .sort((a, b) => (ORDER[a.Stage] ?? 9) - (ORDER[b.Stage] ?? 9) || b.CreatedUtc.localeCompare(a.CreatedUtc)));

function productionFoot(g: BloxGameSummary) {
    if (g.WaitingReason) return `${g.Stage} · waiting: ${g.WaitingReason}`;
    return `${g.Stage} · ${g.ChecklistMet}/${g.ChecklistTotal} exit criteria met`;
}

// AIRouter suspends keys whose prompts miss the cache; flag a low hit rate.
const cacheTone = computed(() => {
    const rate = bloxCacheRate(usage.value?.Week);
    if (rate == null) return '';
    return rate < 0.5 ? 'bad' : rate < 0.7 ? 'warn' : '';
});

// The two kinds of traffic hit the cache very differently: agent turns re-send their transcript, labelling
// sends new pictures every call. Shown once either has been recorded on its own.
const cacheSplit = computed(() => {
    const parts: string[] = [];
    const agents = bloxCacheRate(usage.value?.WeekAgents);
    const labelling = bloxCacheRate(usage.value?.WeekLabeler);
    if (agents != null) parts.push(`agents ${bloxPct(agents)}`);
    if (labelling != null) parts.push(`labelling ${bloxPct(labelling)}`);
    return parts.join(' · ');
});

// Every label is scored against the same reference examples, kept at these calibrated scores.
const anchorsText = computed(() => {
    const reference = usage.value?.LabelerReference;
    if (!reference) return '';
    const anchors = reference.Anchors ?? [];
    return anchors.length ? `scored against anchors at ${anchors.map(a => a.toFixed(a % 1 ? 1 : 0)).join(' · ')}` : `${reference.Examples} reference examples`;
});

const reuseText = computed(() => {
    const rate = bloxReuseRate(usage.value?.Week);
    if (rate == null) return 'nothing re-sent yet';
    const missed = (usage.value!.Week.ResentTokens ?? 0) - (usage.value!.Week.ResentCachedTokens ?? 0);
    return `${bloxPct(rate, rate < 0.995 ? 1 : 0)} served from cache` + (missed > 0 ? ` · ${bloxTokens(missed)} tokens prefilled twice` : '');
});

const measure = ref<'players' | 'robux'>('players');
const dailyPoints = computed(() => {
    const days = overview.value?.Daily ?? [];
    const x = (day: string) => new Date(`${day}T00:00:00Z`).getTime();
    return {
        players: days.map(d => ({ x: x(d.Day), y: d.Players })),
        robux: days.map(d => ({ x: x(d.Day), y: d.Robux })),
    };
});
const dailySeries = computed(() => measure.value === 'robux'
    ? [{ name: 'Robux', colour: 'var(--ot-cat-4)', points: dailyPoints.value.robux }]
    : [{ name: 'Players', colour: 'var(--ot-cat-1)', points: dailyPoints.value.players }]);

const usagePoints = computed(() => (usage.value?.Daily ?? []).map(d => ({ x: new Date(`${d.Day}T00:00:00Z`).getTime(), y: d.Calls })));
const categoryBars = computed(() => (overview.value?.Library.TopCategories ?? []).map(c => ({ key: c.Category, label: c.Category, value: c.Count })));

function bannerTone(level: string) {
    return level === 'error' ? '' : level === 'warning' ? 'warn' : 'info';
}

const switching = ref(false);
async function toggle(which: 'enabled' | 'harvester', on: boolean) {
    switching.value = true;
    try {
        const result = await bloxPost('/omniblox/studio/toggle', { [which]: on });
        if (!result.ok) notify('Could not switch', result.error ?? '', 'error');
        await refresh();
    } finally {
        switching.value = false;
    }
}

const newOpen = ref(false);
const theme = ref('');
const starting = ref(false);
const startError = ref<string | null>(null);
async function startGame() {
    starting.value = true;
    startError.value = null;
    try {
        const result = await bloxPost<{ ok: boolean; gameId: string }>('/omniblox/games/new', { theme: theme.value.trim() || null });
        if (!result.ok || !result.data) {
            startError.value = result.error;
            return;
        }
        newOpen.value = false;
        theme.value = '';
        await refresh();
        await navigateTo(`/schemery/omniblox/game/${result.data.gameId}`);
    } finally {
        starting.value = false;
    }
}
</script>

<style scoped>
.bx-games { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(330px, 100%), 1fr)); gap: var(--ot-gutter); }
.bx-playnow { display: inline-block; max-width: 280px; overflow: hidden; text-overflow: ellipsis; line-height: var(--ot-control-sm); text-decoration: none; }
.ot-kpis { margin-bottom: var(--ot-space-6); }
.bx-new { display: flex; gap: var(--ot-space-2); align-items: center; flex-wrap: wrap; padding: var(--ot-card-pad); }
.bx-new .ot-input { flex: 1 1 260px; }
.err { flex-basis: 100%; margin: 0; font-size: 12px; color: var(--ot-negative); }
.bx-sub { margin-top: var(--ot-space-4); }
.bx-usage { margin-top: var(--ot-space-3); }
.bx-top { align-items: start; }
.bad { color: var(--ot-negative); }
</style>
