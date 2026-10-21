<template>
    <article class="ot-card bx-game" :class="{ dim: retired }">
        <div class="art">
            <OmniBloxImg v-if="game.HasIcon" :path="bloxMediaPath(game.GameId, 'icon.png', game.UpdatedUtc)" ratio="1 / 1" :alt="`${game.Title} icon`" />
            <div v-else class="noart" aria-hidden="true">{{ initials }}</div>
        </div>
        <div class="main">
            <div class="head">
                <!-- The title's link covers the whole card; Play sits above it. -->
                <NuxtLink class="title" :to="`/schemery/omniblox/game/${game.GameId}`">{{ game.Title }}</NuxtLink>
                <span class="ot-chip" :class="bloxStageTone(game.Stage)">{{ game.Stage }}</span>
                <span v-if="game.Paused" class="ot-chip">Paused</span>
                <span v-if="game.UrgentMaintenance" class="ot-chip bad">Urgent</span>
                <span v-if="game.Watchdog && game.Watchdog.Level > 0 && !retired" class="ot-chip" :class="bloxWatchdogTone(game.Watchdog.Level)" :title="`Watchdog: ${game.Watchdog.StalledCycles} cycle(s) without progress`">{{ game.Watchdog.Name }}</span>
                <NuxtLink v-if="game.Playable" class="ot-btn sm play" :to="bloxPlayPath(game.GameId)" :aria-label="`Play ${game.Title}`">▶ Play</NuxtLink>
            </div>
            <OmniBloxStageTrack :stage="game.Stage" :reached="reached" compact />
            <p v-if="liveLine" class="live" role="status"><span class="pulse" aria-hidden="true"></span>{{ liveLine }}</p>
            <p class="state" :class="{ warn: !!game.WaitingReason, bad: game.Stage === 'Abandoned' }">{{ stateLine }}</p>
            <dl class="facts">
                <template v-if="game.Stage === 'Live' || game.Stage === 'Sunset'">
                    <div><dt>Players/day</dt><dd>{{ fmtCount(Math.round(game.Dau7d)) }}</dd></div>
                    <div><dt>Revenue 14d</dt><dd>{{ bloxRobux(game.Revenue14d) }}</dd></div>
                    <div v-if="game.NextMaintenanceUtc && game.Stage === 'Live'"><dt>Maintenance</dt><dd>{{ fmtRelative(game.NextMaintenanceUtc, now) }}</dd></div>
                    <div v-if="game.DauSpark.length > 1" class="spark"><OmniTraderSparkline :values="game.DauSpark" :height="24" tone="neutral" label="Players per day" /></div>
                </template>
                <template v-else-if="game.Stage !== 'Abandoned'">
                    <div><dt>Exit criteria</dt><dd>{{ game.ChecklistMet }}/{{ game.ChecklistTotal }}</dd></div>
                    <div v-if="game.MilestonesTotal"><dt>Milestones</dt><dd>{{ game.MilestonesDone }}/{{ game.MilestonesTotal }}</dd></div>
                    <div v-if="game.BuildRevision"><dt>Build</dt><dd :class="{ bad: !game.LastBuildOk }">r{{ game.BuildRevision }}{{ game.LastBuildOk ? '' : ' ✗' }}</dd></div>
                    <div v-if="game.MapScore != null"><dt>Map</dt><dd :class="{ bad: game.MapScore < 60, good: game.MapScore >= 80 }">{{ game.MapScore }}/100</dd></div>
                    <div v-if="game.Engine"><dt>Engine</dt><dd :class="{ bad: !game.Engine.Ok && !game.Engine.KitFailed, good: game.Engine.Ok && game.Engine.Current }" :title="game.Engine.Summary">{{ engineLine }}</dd></div>
                    <div v-if="game.OpenDirectives"><dt>Directions</dt><dd>{{ game.OpenDirectives }} open</dd></div>
                    <div><dt>Cycles</dt><dd>{{ game.StageCycles }}</dd></div>
                </template>
                <template v-else>
                    <div><dt>Cycles</dt><dd>{{ totalCycles }}</dd></div>
                    <div><dt>Model calls</dt><dd>{{ fmtCount(game.Usage.Calls) }}</dd></div>
                </template>
            </dl>
        </div>
    </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { fmtCount, fmtDate, fmtRelative, useNow } from '~/composables/useOmniTumblr';
import { BLOX_STAGES, bloxMediaPath, bloxPlayPath, bloxRobux, bloxStageTone, bloxWatchdogTone, type BloxGameSummary, type BloxStage } from '~/composables/useOmniBlox';

const props = defineProps<{ game: BloxGameSummary }>();
const now = useNow();

/** What the agent is doing this minute ("builder · running build · turn 14"), while a cycle runs. */
const liveLine = computed(() => {
    const live = props.game.Live;
    if (!live?.Running) return null;
    return `${live.Role} · ${live.Status} · turn ${live.Turns + 1}`;
});

const engineLine = computed(() => {
    const e = props.game.Engine;
    if (!e) return '';
    const mark = e.Ok ? '✓' : e.KitFailed && e.Failed > 0 ? 'kit ✗' : '✗';
    return `${mark} r${e.Revision}${e.Current ? '' : ' (old)'}`;
});

const retired = computed(() => props.game.Stage === 'Abandoned' || props.game.Stage === 'Sunset');
const initials = computed(() => props.game.Title.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join(''));
const totalCycles = computed(() => Object.values(props.game.Cycles).reduce((sum, n) => sum + (n ?? 0), 0));
const reached = computed<BloxStage | null>(() => [...BLOX_STAGES].reverse().find(s => (props.game.Cycles[s] ?? 0) > 0) ?? null);

const stateLine = computed(() => {
    const g = props.game;
    if (g.Stage === 'Abandoned') return g.AbandonReason ?? 'Abandoned.';
    if (g.Stage === 'Sunset') return g.SunsetReason ?? 'Retired.';
    if (g.Paused) return 'Paused.';
    if (g.WaitingReason) return `Waiting: ${g.WaitingReason}`;
    if (g.Stage === 'Live') return g.WentPublicUtc ? `Live since ${fmtDate(g.WentPublicUtc)}` : 'Live';
    return g.LastActivity ?? g.Pitch ?? 'Starting…';
});
</script>

<style scoped>
.bx-game { position: relative; display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: var(--ot-space-3); padding: var(--ot-card-pad); transition: border-color var(--ot-fast); }
.bx-game:hover { border-color: var(--ot-line-strong); }
.bx-game:has(.title:focus-visible) { outline: var(--ot-focus) solid var(--ot-accent); outline-offset: 2px; }
.bx-game.dim { opacity: 0.72; }
.art { width: 76px; }
.noart {
    aspect-ratio: 1 / 1;
    border-radius: var(--ot-radius-sm);
    background: linear-gradient(135deg, var(--ot-surface-3), var(--ot-surface-2));
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; font-weight: 700; color: var(--ot-text-2);
}
.main { display: flex; flex-direction: column; gap: var(--ot-space-2); min-width: 0; }
.head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
.title { font-size: 14px; font-weight: 700; color: inherit; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.title::after { content: ''; position: absolute; inset: 0; border-radius: inherit; }
.title:focus-visible { outline: none; }
.play { position: relative; z-index: 1; margin-left: auto; text-decoration: none; }
.state { margin: 0; font-size: 12px; line-height: 17px; color: var(--ot-text-2); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.state.warn { color: var(--ot-warning); }
.state.bad { color: #ffc9c9; }
.facts { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0; font-size: 11.5px; align-items: flex-end; }
.facts dt { color: var(--ot-muted); font-size: 10.5px; }
.facts dd { margin: 0; font-family: var(--ot-mono); }
.facts dd.bad { color: var(--ot-negative); }
.facts dd.good { color: var(--ot-positive); }
.live { margin: 0; display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--ot-accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pulse { flex: 0 0 8px; height: 8px; border-radius: 50%; background: var(--ot-accent); animation: bx-pulse 1.4s ease-in-out infinite; }
@keyframes bx-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.75); } }
@media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
.facts .spark { flex: 1 1 80px; min-width: 60px; max-width: 140px; }
</style>
