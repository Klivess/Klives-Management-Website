<template>
  <ObxShell v-slot="{ size }" :commands="commands" @refresh="onRefresh">
    <div class="obx-stack" :class="{ 'obx-enter': firstPaint }" style="gap: var(--obx-gap)">
      <!-- ── the studio in a sentence + its figures ── -->
      <div class="obx-top">
        <section class="obx-card obx-hero" :data-tone="verdict.tone" aria-label="Studio status" data-testid="obx-verdict">
          <div class="obx-hero__row">
            <span class="obx-hero__glyph"><ObxIcon :name="verdict.icon" /></span>
            <div style="min-width: 0">
              <h1 class="obx-hero__head">{{ verdict.head }}</h1>
              <p class="obx-hero__line">{{ verdict.line }}</p>
            </div>
          </div>
          <ul v-if="verdict.points.length" class="obx-hero__points">
            <li v-for="p in verdict.points" :key="p.text"><span class="obx-dot" :data-tone="p.tone"></span><span>{{ p.text }}</span></li>
          </ul>
          <div class="obx-hero__actions">
            <NuxtLink v-if="production?.Playable" class="obx-btn obx-btn--brand" :to="bloxPlayPath(production.GameId)" data-testid="obx-play-production"><ObxIcon name="play" /><span class="obx-truncate" style="max-width: 220px">Play {{ production.Title }}</span></NuxtLink>
            <button v-if="canAct" class="obx-btn" data-testid="obx-new-game" @click="newOpen = true"><ObxIcon name="plus" />New game</button>
            <button v-if="overview && canManage && !overview.Enabled" class="obx-btn obx-btn--ghost" @click="switchStudio"><ObxIcon name="power" />Switch on</button>
          </div>
        </section>

        <div class="obx-kpis" :class="{ 'obx-stale': !overview }">
          <div class="obx-kpi" data-testid="kpi-live">
            <span class="obx-kpi__label"><ObxIcon name="globe" />Live games</span>
            <span class="obx-kpi__value">{{ overview ? overview.StageCounts?.Live ?? 0 : '—' }}</span>
            <span class="obx-kpi__sub">{{ overview ? `${overview.GamesLaunched ?? 0} launched in all` : '' }}</span>
          </div>
          <NuxtLink class="obx-kpi" :to="production ? `/schemery/omniblox/game/${production.GameId}` : '/schemery/omniblox'" data-testid="kpi-production">
            <span class="obx-kpi__label"><ObxIcon name="wrench" />In production</span>
            <span class="obx-kpi__value">{{ overview ? productionCount : '—' }}<small v-if="overview">/ {{ overview.MaxGamesInProduction }}</small></span>
            <span class="obx-kpi__sub" :title="production?.Title">{{ production ? `${production.Stage}: ${production.Title}` : 'none in production' }}</span>
          </NuxtLink>
          <div class="obx-kpi" data-testid="kpi-revenue">
            <span class="obx-kpi__label"><ObxIcon name="coins" />Revenue, 30 days</span>
            <span class="obx-kpi__value">{{ overview ? obxRobux(overview.Money?.Revenue30dRobux) : '—' }}</span>
            <span class="obx-kpi__sub">{{ overview ? `≈ $${(overview.Money?.Cash30dEstimateUsd ?? 0).toFixed(2)} at DevEx · spent $0` : '' }}</span>
          </div>
          <div class="obx-kpi" data-testid="kpi-players">
            <span class="obx-kpi__label"><ObxIcon name="users" />Players, last day</span>
            <span class="obx-kpi__value">{{ lastDay ? obxCount(lastDay.Players) : '—' }}</span>
            <span class="obx-kpi__sub">{{ lastDay ? `${lastDay.Day} · every live game` : 'no live game yet' }}</span>
            <div v-if="playersSpark.length > 1" class="obx-kpi__spark"><ObxSpark :values="playersSpark" :height="22" colour="var(--obx-st-live)" label="Players a day" /></div>
          </div>
          <div class="obx-kpi" data-testid="kpi-model">
            <span class="obx-kpi__label"><ObxIcon name="chip" />Model calls, 7 days</span>
            <span class="obx-kpi__value" :data-tone="cacheTone">{{ usage ? obxCount(usage.Week?.Calls) : '—' }}</span>
            <span class="obx-kpi__sub">{{ usage ? (usage.Week?.Calls ? `cache ${obxPct(bloxCacheRate(usage.Week))}${cacheSplit ? ` · ${cacheSplit}` : ''}` : lastCallLine) : '' }}</span>
            <div v-if="callSpark.some(v => v > 0)" class="obx-kpi__spark"><ObxSpark :values="callSpark" :height="22" bars colour="var(--obx-accent)" label="Model calls a day" /></div>
          </div>
        </div>
      </div>

      <!-- ── what needs the owner ── -->
      <div class="obx-split">
        <section class="obx-card" aria-label="Needs you">
          <header class="obx-card__head">
            <h2 class="obx-card__title"><ObxIcon name="inbox" />Needs you</h2>
            <span class="obx-card__meta">{{ inbox.length ? `${obxPlural(inbox.length, 'thing')}, what blocks most first` : 'all clear' }}</span>
          </header>
          <div class="obx-card__body obx-card__body--flush">
            <div v-if="!overview" class="obx-skel" style="height: 120px; margin: 0 14px 12px"></div>
            <ObxInbox v-else :items="inbox" :games="overview.Games" :now="now" @changed="onRefresh" @account="openAccount" />
          </div>
        </section>
        <ObxAccount v-if="canManage" ref="accountCard" :now="now" @changed="onRefresh" />
        <section v-else class="obx-card" aria-label="Activity">
          <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="activity" />Activity</h2></header>
          <div class="obx-card__body obx-card__body--flush"><ObxFeed :events="overview?.Events ?? []" :games="overview?.Games ?? []" :now="now" :limit="10" /></div>
        </section>
      </div>

      <!-- ── the production line ── -->
      <section class="obx-card" aria-label="Games" data-testid="obx-line">
        <header class="obx-card__head">
          <h2 class="obx-card__title"><ObxIcon name="blocks" />Production line</h2>
          <span class="obx-card__meta">{{ overview ? lineMeta : '' }}</span>
        </header>
        <div v-if="!overview" class="obx-line"><div v-for="n in 5" :key="n" class="obx-skel" style="height: 150px"></div></div>
        <div v-else-if="!overview.Games.length" class="obx-empty">
          <ObxIcon name="sparkle" />
          <span><b>No games yet.</b> {{ overview.Enabled ? 'The studio starts researching its first game on its next step.' : 'Switch the studio on and it starts researching its first game.' }}</span>
        </div>
        <template v-else>
          <div class="obx-line">
            <div v-for="lane in lanes.lanes" :key="lane.stage" class="obx-lane" :data-stage="lane.stage" :data-testid="`lane-${lane.stage}`">
              <div class="obx-lane__head">{{ lane.stage }}<span>{{ lane.games.length }}</span></div>
              <ObxGameTile v-for="(g, i) in lane.games" :key="g.GameId" :game="g" :now="now" :show-stage="size === 'md' || size === 'sm'" :primary-play="production?.GameId === g.GameId && i === 0" />
              <div v-if="!lane.games.length" class="obx-lane__empty">{{ EMPTY_LANE[lane.stage] }}</div>
            </div>
          </div>
          <div v-if="lanes.retired.length" class="obx-retired" data-testid="obx-retired">
            <span class="obx-dim" style="font-size: 11.5px; align-self: center">Retired</span>
            <NuxtLink v-for="g in lanes.retired" :key="g.GameId" class="obx-retired__item" :to="`/schemery/omniblox/game/${g.GameId}`" :data-stage="g.Stage" :title="obxGameLine(g).text">
              <span class="obx-stage" :data-stage="g.Stage">{{ obxStageWord(g.Stage) }}</span><span class="obx-truncate">{{ g.Title }}</span>
            </NuxtLink>
          </div>
        </template>
      </section>

      <!-- ── what happened, what it costs, what it has to build with ── -->
      <div class="obx-split">
        <section class="obx-card" aria-label="Activity">
          <header class="obx-card__head">
            <h2 class="obx-card__title"><ObxIcon name="activity" />Activity</h2>
            <span class="obx-card__meta">what the studio did, newest first</span>
          </header>
          <div class="obx-card__body obx-card__body--flush">
            <div v-if="!overview" class="obx-skel" style="height: 160px; margin: 0 14px 12px"></div>
            <ObxFeed v-else :events="overview.Events ?? []" :games="overview.Games" :now="now" :limit="14" filterable />
          </div>
        </section>

        <div class="obx-stack">
          <section v-if="dailyPoints.length >= 2" class="obx-card" aria-label="Players and revenue">
            <header class="obx-card__head">
              <h2 class="obx-card__title"><ObxIcon name="chart" />Players and revenue</h2>
              <div class="obx-card__tools">
                <div class="obx-seg" role="group" aria-label="Measure">
                  <button class="obx-seg__opt" :aria-pressed="measure === 'players'" @click="measure = 'players'">Players</button>
                  <button class="obx-seg__opt" :aria-pressed="measure === 'robux'" @click="measure = 'robux'">Robux</button>
                </div>
              </div>
            </header>
            <div class="obx-card__body">
              <ObxChart :data="dailyPoints" :height="110" :colour="measure === 'robux' ? 'var(--obx-brick-2)' : 'var(--obx-st-live)'" :format="v => measure === 'robux' ? obxRobux(v) : obxCount(v)" label="Players or Robux a day" />
            </div>
          </section>

          <section class="obx-card" aria-label="Asset harvester" data-testid="obx-harvester">
            <header class="obx-card__head">
              <h2 class="obx-card__title"><ObxIcon name="harvest" />Asset harvester</h2>
              <span class="obx-chip" :data-tone="harvestTone">{{ harvestWord }}</span>
              <div class="obx-card__tools"><NuxtLink class="obx-btn obx-btn--xs obx-btn--ghost" to="/schemery/omniblox/assets">Library<ObxIcon name="chevron-right" /></NuxtLink></div>
            </header>
            <div class="obx-card__body">
              <div v-if="!overview" class="obx-skel" style="height: 90px"></div>
              <template v-else>
                <div class="obx-funnel">
                  <div class="obx-funnel__step"><small>Found</small><b>{{ obxCount(overview.Library?.Total ?? overview.Harvester?.Discovered) }}</b></div>
                  <div class="obx-funnel__step"><small>Placeable</small><b>{{ obxCount(overview.Library?.Placeable) }}</b></div>
                  <div class="obx-funnel__step"><small>Labelled</small><b>{{ obxCount(overview.Library?.ByStatus?.labeled ?? 0) }}</b></div>
                </div>
                <p v-if="harvestIdle" class="obx-banner" data-tone="warn" style="margin-top: 10px" data-testid="obx-harvester-idle">
                  <ObxIcon class="obx-banner__glyph" name="clock" />
                  <span class="obx-banner__text"><strong>Nothing added for {{ harvestIdle.span }}</strong><span>{{ harvestIdle.why }}</span></span>
                </p>
                <dl class="obx-kv" style="margin-top: 10px">
                  <dt>Last step</dt><dd>{{ overview.Harvester?.LastHarvestUtc ? obxAgo(overview.Harvester.LastHarvestUtc, now) : 'never' }}<span v-if="overview.Harvester?.Last" class="obx-dim obx-mono" style="font-size: 11px"> · {{ overview.Harvester.Last }}</span></dd>
                  <template v-if="overview.Harvester?.Downloadable != null"><dt>Queued</dt><dd>{{ obxCount(overview.Harvester.Downloadable) }} to download</dd></template>
                  <template v-if="overview.Harvester?.Relabeled"><dt>Re-rated</dt><dd>{{ obxCount(overview.Harvester.Relabeled) }} on the calibrated scale</dd></template>
                  <template v-if="overview.Harvester?.LastError"><dt>Last error</dt><dd style="color: #ffc6cc">{{ overview.Harvester.LastError }}</dd></template>
                  <template v-if="overview.Library?.Counting"><dt>Counts</dt><dd>being worked out…</dd></template>
                </dl>
                <template v-if="overview.Harvester?.PriorityQueries?.length">
                  <h3 class="obx-sub">Looking for next</h3>
                  <div class="obx-tile__chips"><span v-for="query in overview.Harvester.PriorityQueries" :key="query" class="obx-chip">{{ query }}</span></div>
                </template>
                <template v-if="categories.length">
                  <h3 class="obx-sub">Labelled by category</h3>
                  <div class="obx-bars">
                    <div v-for="c in categories" :key="c.Category" class="obx-bars__row">
                      <span class="obx-bars__label">{{ c.Category }}</span>
                      <span class="obx-meter"><span class="obx-meter__fill" :style="{ width: `${Math.round(100 * c.Count / categoryMax)}%`, background: 'var(--obx-brick)' }"></span></span>
                      <span class="obx-bars__value">{{ obxCount(c.Count) }}</span>
                    </div>
                  </div>
                </template>
              </template>
            </div>
          </section>

          <section class="obx-card" aria-label="Model usage" data-testid="obx-usage">
            <header class="obx-card__head">
              <h2 class="obx-card__title"><ObxIcon name="chip" />Model usage</h2>
              <span class="obx-card__meta">AIRouter, flat fee</span>
            </header>
            <div class="obx-card__body">
              <ObxChart v-if="usagePoints.length >= 2" :data="usagePoints" :height="80" bars colour="var(--obx-accent)" :format="v => `${obxCount(v)} calls`" label="Model calls a day" />
              <dl class="obx-kv" style="margin-top: 10px">
                <dt>Today</dt><dd>{{ obxCount(usage?.Today?.Calls ?? 0) }} calls · {{ obxCount(usage?.Today?.PromptTokens ?? 0) }} prompt tokens</dd>
                <dt>Cache, 7 days</dt><dd>{{ obxPct(bloxCacheRate(usage?.Week)) }}<template v-if="cacheSplit"> · {{ cacheSplit }}</template></dd>
                <dt title="Each agent turn sends its earlier turns again: how much of that came from AIRouter's cache">Re-sent</dt><dd>{{ reuseText }}</dd>
                <dt>Labelling</dt><dd>{{ obxCount(usage?.Labeler?.Calls ?? 0) }} calls in all<template v-if="anchorsText"> · {{ anchorsText }}</template></dd>
              </dl>
            </div>
          </section>
        </div>
      </div>
    </div>

    <ObxDialog :open="newOpen" title="Start a new game" sub="The researcher scans what does well on Roblox and the studio's own lessons, then writes three concepts." icon="sparkle" tone="brick" testid="obx-new-dialog" @close="newOpen = false">
      <form id="obx-new-form" class="obx-stack" style="gap: 8px" @submit.prevent="startGame">
        <label class="obx-dim" for="obx-theme">A theme to explore (optional)</label>
        <input id="obx-theme" v-model="theme" class="obx-input" maxlength="80" placeholder="e.g. pirates, a bakery, deep sea" data-autofocus />
        <p v-if="startError" class="obx-banner" data-tone="crit" role="alert"><ObxIcon class="obx-banner__glyph" name="alert" /><span class="obx-banner__text"><span>{{ startError }}</span></span></p>
      </form>
      <template #actions>
        <button class="obx-btn obx-btn--ghost" @click="newOpen = false">Cancel</button>
        <button class="obx-btn obx-btn--primary" type="submit" form="obx-new-form" :disabled="starting" data-testid="obx-new-start">{{ starting ? 'Starting…' : 'Start researching' }}</button>
      </template>
    </ObxDialog>
  </ObxShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAccess } from '~/composables/useAccess';
import { bloxCacheRate, bloxPlayPath, bloxPost, bloxReuseRate, useBloxOverview, type BloxStage } from '~/composables/useOmniBlox';
import { obxConfirm, obxToast, useObxRoblox } from '~/composables/useObxConsole';
import {
  obxActive, obxAgo, obxCount, obxGameLine, obxInbox, obxLanes, obxPct, obxPlural, obxProduction, obxRobux, obxSpan, obxStageWord, obxVerdict, type ObxCommand, type ObxTone,
} from '~/scripts/omniblox/console';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'OmniBlox · Klives Management' });

const { can } = useAccess();
const canManage = computed(() => can('omniblox.studio.manage'));
const canAct = computed(() => can('omniblox.studio.act'));
const { overview, refresh } = useBloxOverview();
const { view: roblox } = useObxRoblox();

const now = ref(Date.now());
const firstPaint = ref(true);
let clock: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  clock = setInterval(() => { now.value = Date.now(); }, 15_000);
  setTimeout(() => { firstPaint.value = false; }, 600);
});
onBeforeUnmount(() => { if (clock) clearInterval(clock); });

function onRefresh() { void refresh(); }

const games = computed(() => overview.value?.Games ?? []);
const production = computed(() => obxProduction(games.value));
const productionCount = computed(() => games.value.filter(obxActive).length);
const lanes = computed(() => obxLanes(games.value));
const inbox = computed(() => obxInbox({ overview: overview.value, roblox: roblox.value, canManage: canManage.value, canAct: canAct.value, now: now.value }));
const verdict = computed(() => obxVerdict(overview.value, inbox.value, roblox.value, now.value));

const EMPTY_LANE: Record<BloxStage, string> = {
  Research: 'Nothing being researched', Build: 'Nothing being built', Test: 'Nothing in test',
  Launch: 'Nothing waiting to launch', Live: 'No live game yet', Sunset: '', Abandoned: '',
};
const lineMeta = computed(() => {
  const o = overview.value!;
  const parts = [`${obxPlural(games.value.length, 'game')}`, `${o.StageCounts?.Live ?? 0} live`, `${obxPlural(o.PlaybookLessons ?? 0, 'lesson')} learned`];
  return parts.join(' · ');
});

// ── figures ──
const usage = computed(() => overview.value?.Usage ?? null);
const lastDay = computed(() => overview.value?.Daily?.at(-1) ?? null);
const playersSpark = computed(() => (overview.value?.Daily ?? []).slice(-14).map(d => d.Players));
const callSpark = computed(() => (usage.value?.Daily ?? []).slice(-14).map(d => d.Calls));
const lastCallLine = computed(() => {
  const last = [...(usage.value?.Daily ?? [])].reverse().find(d => d.Calls > 0);
  return last ? `none since ${last.Day}` : 'no calls yet';
});
// AIRouter suspends keys whose prompts miss the cache; flag a low hit rate.
const cacheTone = computed<ObxTone | undefined>(() => {
  const rate = bloxCacheRate(usage.value?.Week);
  return rate == null ? undefined : rate < 0.5 ? 'crit' : rate < 0.7 ? 'warn' : undefined;
});
const cacheSplit = computed(() => {
  const parts: string[] = [];
  const agents = bloxCacheRate(usage.value?.WeekAgents);
  const labelling = bloxCacheRate(usage.value?.WeekLabeler);
  if (agents != null) parts.push(`agents ${obxPct(agents)}`);
  if (labelling != null) parts.push(`labelling ${obxPct(labelling)}`);
  return parts.join(' · ');
});
const anchorsText = computed(() => {
  const reference = usage.value?.LabelerReference;
  if (!reference) return '';
  const anchors = reference.Anchors ?? [];
  return anchors.length ? `anchors at ${anchors.map(a => a.toFixed(a % 1 ? 1 : 0)).join(' · ')}` : `${reference.Examples} reference examples`;
});
const reuseText = computed(() => {
  const rate = bloxReuseRate(usage.value?.Week);
  if (rate == null) return 'nothing re-sent this week';
  const missed = (usage.value!.Week.ResentTokens ?? 0) - (usage.value!.Week.ResentCachedTokens ?? 0);
  return `${obxPct(rate, rate < 0.995 ? 1 : 0)} from cache` + (missed > 0 ? ` · ${obxCount(missed)} tokens prefilled twice` : '');
});
const usagePoints = computed(() => (usage.value?.Daily ?? []).slice(-30).map(d => ({ label: d.Day.slice(5), value: d.Calls })));

const measure = ref<'players' | 'robux'>('players');
const dailyPoints = computed(() => (overview.value?.Daily ?? []).map(d => ({ label: d.Day.slice(5), value: measure.value === 'robux' ? d.Robux : d.Players })));

// ── harvester ──
const categories = computed(() => (overview.value?.Library?.TopCategories ?? []).slice(0, 6));
const categoryMax = computed(() => Math.max(1, ...categories.value.map(c => c.Count)));
const harvestIdle = computed(() => {
  const h = overview.value?.Harvester;
  if (!overview.value?.HarvesterEnabled || !h?.LastProgressUtc) return null;
  const idleFor = now.value - Date.parse(h.LastProgressUtc);
  if (idleFor < 6 * 3_600_000) return null;
  return { span: obxSpan(idleFor), why: h.Idle ? `Last step: ${h.Idle}.` : 'It runs every minute and finds nothing to do.' };
});
const harvestTone = computed<ObxTone>(() => (!overview.value?.HarvesterEnabled ? 'neutral' : harvestIdle.value ? 'warn' : overview.value?.Harvester?.LastError ? 'crit' : 'ok'));
const harvestWord = computed(() => (!overview.value?.HarvesterEnabled ? 'off' : harvestIdle.value ? 'on · idle' : 'on'));

// ── actions ──
const accountCard = ref<{ start: () => Promise<void> } | null>(null);
function openAccount() { void accountCard.value?.start(); }

async function switchStudio() {
  if (!await obxConfirm('Switch the studio on?', 'It starts working through its games again: research, building, tests and maintenance, with AIRouter as its model. Nothing is published to Roblox without your approval.', 'Switch it on')) return;
  const result = await bloxPost('/omniblox/studio/toggle', { enabled: true });
  if (!result.ok) obxToast('Could not switch', result.error ?? '', 'crit');
  else obxToast('Studio on');
  await refresh();
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
    if (!result.ok || !result.data) { startError.value = result.error; return; }
    newOpen.value = false;
    theme.value = '';
    await refresh();
    await navigateTo(`/schemery/omniblox/game/${result.data.gameId}`);
  } finally {
    starting.value = false;
  }
}

const commands = computed<ObxCommand[]>(() => {
  const list: ObxCommand[] = [];
  if (canAct.value) list.push({ id: 'new-game', group: 'Actions', title: 'Start a new game', icon: 'plus', keywords: 'research concept', run: () => { newOpen.value = true; } });
  if (canManage.value) list.push({ id: 'account', group: 'Actions', title: 'Roblox account', icon: 'user', keywords: 'connect key session switch', run: openAccount });
  return list;
});
</script>
