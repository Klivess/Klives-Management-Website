<template>
    <div>
        <div class="ot-kpis bx-kpis4">
            <OmniTraderKpi label="Work cycles" :value="String(game.Cycles.length)" :foot="cyclesFoot" />
            <OmniTraderKpi label="Model calls" :value="fmtCount(game.Usage.Calls)" :foot="`${bloxTokens(game.Usage.CompletionTokens)} tokens written`" />
            <OmniTraderKpi label="Prompt tokens" :value="bloxTokens(game.Usage.PromptTokens)" foot="all cycles, all stages" />
            <OmniTraderKpi label="Cache hits" :value="bloxPct(bloxCacheRate(game.Usage))" :tone="cacheTone" :foot="cacheFoot" />
        </div>

        <OmniTraderCard title="Hand-overs" subtitle="Each cycle ends with a report the next one starts from" :empty="!game.Cycles.length" empty-title="No cycles yet" flush>
            <template #controls>
                <div class="ot-segment sm" role="group" aria-label="Stage">
                    <button type="button" :aria-pressed="stage === null" @click="stage = null">All</button>
                    <button v-for="s in stages" :key="s" type="button" :aria-pressed="stage === s" @click="stage = s">{{ s }}</button>
                </div>
            </template>
            <ol class="cycles">
                <li v-for="(c, i) in shown" :key="`${c.Utc}-${i}`" :class="{ failed: c.Outcome !== 'finished' }">
                    <div class="top">
                        <span class="ot-chip" :class="bloxStageTone(c.Stage)">{{ c.Stage }}</span>
                        <strong>{{ c.Role }}</strong>
                        <span class="outcome">{{ c.Outcome }}</span>
                        <span class="meta">
                            {{ c.Turns }} turns · {{ bloxTokens(c.PromptTokens) }} prompt · cache {{ bloxPct(c.PromptTokens ? c.CachedTokens / c.PromptTokens : null) }}
                            · <time :datetime="c.Utc" :title="new Date(c.Utc).toString()">{{ fmtRelative(c.Utc, now) }}</time>
                        </span>
                    </div>
                    <p class="done">{{ c.Done }}</p>
                    <p v-if="c.ToolCalls || c.Error" class="work bx-muted">
                        <template v-if="c.ToolCalls">{{ c.ToolCalls }} tool calls<template v-if="c.ToolErrors"> · {{ c.ToolErrors }} failed</template><template v-if="c.Truncations"> · {{ c.Truncations }} cut off by the output limit (not run)</template></template>
                        <span v-if="c.Error" class="err"> · {{ c.Error }}</span>
                    </p>
                    <div v-if="c.Decisions.length || c.Problems.length || c.NextSteps.length" class="lists">
                        <div v-if="c.Decisions.length"><h4>Decided</h4><ul><li v-for="(d, j) in c.Decisions" :key="j">{{ d }}</li></ul></div>
                        <div v-if="c.Problems.length"><h4>Problems</h4><ul class="problems"><li v-for="(p, j) in c.Problems" :key="j">{{ p }}</li></ul></div>
                        <div v-if="c.NextSteps.length"><h4>Next</h4><ul><li v-for="(n, j) in c.NextSteps" :key="j">{{ n }}</li></ul></div>
                    </div>
                    <template v-if="c.CycleId && logs.has(c.CycleId)">
                        <button type="button" class="ot-btn ghost sm logbtn" :aria-expanded="openLog === c.CycleId" @click="toggleLog(c.CycleId)">
                            {{ openLog === c.CycleId ? 'Hide the full log' : 'Show every step' }}
                        </button>
                        <div v-if="openLog === c.CycleId" class="log">
                            <OmniTraderStateBlock v-if="logError" kind="error" title="Could not load the log" :detail="logError" />
                            <div v-else-if="!log" class="ot-skel" style="height:80px"></div>
                            <OmniBloxCycleEntries v-else :game-id="game.GameId" :cycle-id="c.CycleId" :entries="log.Entries" :limit="60" label="Every step of this cycle" />
                        </div>
                    </template>
                </li>
            </ol>
            <button v-if="filtered.length > limit" class="ot-btn ghost sm more" @click="limit += 20">Show {{ Math.min(20, filtered.length - limit) }} more</button>
        </OmniTraderCard>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { fmtCount, fmtRelative, useNow } from '~/composables/useOmniTumblr';
import { BLOX_STAGES, bloxCacheRate, bloxGet, bloxPct, bloxReuseRate, bloxStageTone, bloxTokens, type BloxCycleLog, type BloxDossier, type BloxStage } from '~/composables/useOmniBlox';

const props = withDefaults(defineProps<{ game: BloxDossier; cycleLogs?: string[] }>(), { cycleLogs: () => [] });
const now = useNow();

// A cycle's full log (every message, tool call, result and picture), for the newest cycles the server keeps.
const logs = computed(() => new Set(props.cycleLogs));
const openLog = ref<string | null>(null);
const log = ref<BloxCycleLog | null>(null);
const logError = ref<string | null>(null);
async function toggleLog(cycleId: string) {
    if (openLog.value === cycleId) { openLog.value = null; return; }
    openLog.value = cycleId;
    log.value = null;
    logError.value = null;
    const result = await bloxGet<BloxCycleLog>(`/omniblox/game/cycle?id=${encodeURIComponent(props.game.GameId)}&cycle=${encodeURIComponent(cycleId)}`);
    if (openLog.value !== cycleId) return;
    if (result.ok && result.data) log.value = result.data;
    else logError.value = result.error;
}
const stage = ref<BloxStage | null>(null);
const limit = ref(20);

const stages = computed(() => BLOX_STAGES.filter(s => props.game.Cycles.some(c => c.Stage === s)));
const filtered = computed(() => props.game.Cycles.filter(c => stage.value === null || c.Stage === stage.value).slice().reverse());
const shown = computed(() => filtered.value.slice(0, limit.value));

const cyclesFoot = computed(() => Object.entries(props.game.StageCycles)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([s, n]) => `${s} ${n}`)
    .join(' · ') || 'none yet');

const cacheTone = computed(() => {
    const rate = bloxCacheRate(props.game.Usage);
    return rate == null ? '' : rate < 0.5 ? 'bad' : rate < 0.7 ? 'warn' : '';
});

const cacheFoot = computed(() => {
    const reuse = bloxReuseRate(props.game.Usage);
    return reuse == null ? "share of prompt tokens served from AIRouter's cache" : `${bloxPct(reuse)} of re-sent prompt came from cache`;
});
</script>

<style scoped>
.bx-kpis4 { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-bottom: var(--ot-space-6); }
@media (min-width: 1100px) { .bx-kpis4 { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.cycles { list-style: none; margin: 0; padding: 0; }
.cycles > li { padding: var(--ot-space-3) var(--ot-card-pad); display: flex; flex-direction: column; gap: 6px; }
.cycles > li + li { border-top: 1px solid var(--ot-line); }
.top { display: flex; align-items: center; gap: var(--ot-space-2); flex-wrap: wrap; font-size: 12.5px; }
.outcome { font-size: 11px; color: var(--ot-muted); }
.failed .outcome { color: var(--ot-warning); }
.meta { margin-left: auto; font-size: 11px; color: var(--ot-muted); }
.done { margin: 0; font-size: 12.5px; line-height: 18px; white-space: pre-wrap; overflow-wrap: anywhere; }
.lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--ot-space-3); }
.lists h4 { margin: 0 0 4px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--ot-muted); }
.lists ul { margin: 0; padding-left: 16px; font-size: 12px; line-height: 17px; color: var(--ot-text-2); }
.lists .problems { color: #ffd9a8; }
.work { margin: 0; font-size: 11.5px; }
.work .err { color: var(--ot-warning); }
.logbtn { align-self: flex-start; }
.log { border-left: 2px solid var(--ot-line); padding-left: var(--ot-space-3); }
.more { margin: var(--ot-space-2) var(--ot-card-pad) var(--ot-card-pad); }
</style>
