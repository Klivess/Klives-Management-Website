<template>
  <article class="obx-tile" :data-stage="game.Stage" :data-dim="retired || undefined" :data-testid="`tile-${game.GameId}`">
    <div class="obx-tile__top">
      <div class="obx-tile__art">
        <ObxImg v-if="game.HasIcon" :path="bloxMediaPath(game.GameId, 'icon.png', game.UpdatedUtc)" :alt="`${game.Title} icon`" fallback="" />
        <template v-else>{{ obxInitials(game.Title) }}</template>
      </div>
      <div class="obx-tile__head">
        <!-- The title's link covers the whole tile; Play sits above it. -->
        <NuxtLink class="obx-tile__title" :to="`/schemery/omniblox/game/${game.GameId}`" :title="game.Title">{{ game.Title }}</NuxtLink>
        <div class="obx-tile__chips">
          <span v-if="showStage" class="obx-stage" :data-stage="game.Stage">{{ obxStageWord(game.Stage) }}</span>
          <span v-if="unplayable" class="obx-chip" data-tone="crit" :title="`Roblox: ${game.Reach?.Status}`">Nobody can play</span>
          <span v-if="game.UrgentMaintenance" class="obx-chip" data-tone="crit">Urgent</span>
          <span v-if="(game.Watchdog?.Level ?? 0) > 0 && !retired" class="obx-chip" :data-tone="game.Watchdog.Level >= 3 ? 'crit' : 'warn'" :title="`Watchdog: ${game.Watchdog.StalledCycles} cycle(s) without progress`">{{ game.Watchdog.Level >= 3 ? 'Waiting for you' : game.Watchdog.Name }}</span>
          <span v-else-if="game.Paused && !retired" class="obx-chip" data-tone="neutral">Paused</span>
        </div>
      </div>
    </div>

    <p v-if="game.Live?.Running" class="obx-tile__live" role="status"><span class="obx-dot" data-tone="info" data-pulse="true"></span><span class="obx-truncate">{{ game.Live.Role }} · {{ game.Live.Status }} · turn {{ game.Live.Turns + 1 }}</span></p>
    <p v-else class="obx-tile__state obx-clamp2" :data-tone="state.tone" :title="state.text">{{ state.text }}</p>

    <div v-if="!retired && game.Stage !== 'Live' && game.ChecklistTotal" class="obx-tile__progress" :title="`${game.ChecklistMet} of ${game.ChecklistTotal} exit criteria met`">
      <span class="obx-meter"><span class="obx-meter__fill" :style="{ width: `${Math.round(100 * game.ChecklistMet / Math.max(1, game.ChecklistTotal))}%` }"></span></span>
      <span class="obx-num">{{ game.ChecklistMet }}/{{ game.ChecklistTotal }}</span>
    </div>

    <div class="obx-tile__facts">
      <template v-if="game.Stage === 'Live' || game.Stage === 'Sunset'">
        <span><b>{{ obxCount(Math.round(game.Dau7d)) }}</b> players/day</span>
        <span><b>{{ obxRobux(game.Revenue14d) }}</b> 14 d</span>
        <span v-if="game.NextMaintenanceUtc && game.Stage === 'Live'">care {{ obxAgo(game.NextMaintenanceUtc, now) }}</span>
      </template>
      <template v-else-if="!retired">
        <span v-if="game.BuildRevision">build <b :data-tone="game.LastBuildOk ? undefined : 'crit'">r{{ game.BuildRevision }}{{ game.LastBuildOk ? '' : ' ✗' }}</b></span>
        <span v-if="game.MapScore != null">map <b :data-tone="obxMapTone(game.MapScore)">{{ game.MapScore }}</b></span>
        <span v-if="game.Engine" :title="game.Engine.Summary">engine <b :data-tone="game.Engine.Ok ? 'ok' : game.Engine.KitFailed ? 'warn' : 'crit'">{{ obxEngineShort(game.Engine) }}</b></span>
        <span><b>{{ game.StageCycles }}</b> cycles</span>
      </template>
      <template v-else>
        <span><b>{{ totalCycles }}</b> cycles</span>
        <span><b>{{ obxCount(game.Usage?.Calls ?? 0) }}</b> calls</span>
      </template>
    </div>
    <ObxSpark v-if="game.Stage === 'Live' && game.DauSpark?.length > 1" :values="game.DauSpark" :height="22" colour="var(--obx-st-live)" label="Players a day" />

    <div v-if="game.Playable && !retired" class="obx-tile__play">
      <NuxtLink class="obx-btn obx-btn--sm" :class="primaryPlay ? 'obx-btn--brand' : ''" :to="bloxPlayPath(game.GameId)" :aria-label="`Play ${game.Title}`"><ObxIcon name="play" />Play</NuxtLink>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { bloxMediaPath, bloxPlayPath, type BloxGameSummary } from '~/composables/useOmniBlox';
import {
  obxAgo, obxCount, obxEngineShort, obxGameLine, obxInitials, obxMapTone, obxRetired, obxRobux, obxStageWord, obxUnplayable,
} from '~/scripts/omniblox/console';

/** A game on the production line: what it is doing in a line, its few numbers that matter at its stage, Play. */
const props = withDefaults(defineProps<{ game: BloxGameSummary; now: number; showStage?: boolean; primaryPlay?: boolean }>(), { showStage: false, primaryPlay: false });

const retired = computed(() => obxRetired(props.game));
const unplayable = computed(() => obxUnplayable(props.game));
const state = computed(() => obxGameLine(props.game));
const totalCycles = computed(() => Object.values(props.game.Cycles ?? {}).reduce((sum, n) => sum + (n ?? 0), 0));
</script>
