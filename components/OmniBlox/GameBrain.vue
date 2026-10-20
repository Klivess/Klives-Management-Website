<template>
    <div>
        <div class="ot-kpis bx-kpis4">
            <OmniTraderKpi label="Work cycles" :value="String(game.Cycles.length)" :foot="cyclesFoot" />
            <OmniTraderKpi label="Model calls" :value="fmtCount(game.Usage.Calls)" :foot="`${bloxTokens(game.Usage.CompletionTokens)} tokens written`" />
            <OmniTraderKpi label="Prompt tokens" :value="bloxTokens(game.Usage.PromptTokens)" foot="all cycles, all stages" />
            <OmniTraderKpi label="Cache hits" :value="bloxPct(bloxCacheRate(game.Usage))" :tone="cacheTone" foot="share of prompt tokens served from AIRouter's cache" />
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
                    <div v-if="c.Decisions.length || c.Problems.length || c.NextSteps.length" class="lists">
                        <div v-if="c.Decisions.length"><h4>Decided</h4><ul><li v-for="(d, j) in c.Decisions" :key="j">{{ d }}</li></ul></div>
                        <div v-if="c.Problems.length"><h4>Problems</h4><ul class="problems"><li v-for="(p, j) in c.Problems" :key="j">{{ p }}</li></ul></div>
                        <div v-if="c.NextSteps.length"><h4>Next</h4><ul><li v-for="(n, j) in c.NextSteps" :key="j">{{ n }}</li></ul></div>
                    </div>
                </li>
            </ol>
            <button v-if="filtered.length > limit" class="ot-btn ghost sm more" @click="limit += 20">Show {{ Math.min(20, filtered.length - limit) }} more</button>
        </OmniTraderCard>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { fmtCount, fmtRelative, useNow } from '~/composables/useOmniTumblr';
import { BLOX_STAGES, bloxCacheRate, bloxPct, bloxStageTone, bloxTokens, type BloxDossier, type BloxStage } from '~/composables/useOmniBlox';

const props = defineProps<{ game: BloxDossier }>();
const now = useNow();
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
.more { margin: var(--ot-space-2) var(--ot-card-pad) var(--ot-card-pad); }
</style>
