<template>
  <div class="obx-stack">
    <div class="obx-kpis obx-kpis--4">
      <div class="obx-kpi"><span class="obx-kpi__label"><ObxIcon name="history" />Work cycles</span><span class="obx-kpi__value">{{ game.Cycles.length }}</span><span class="obx-kpi__sub">{{ cyclesFoot }}</span></div>
      <div class="obx-kpi"><span class="obx-kpi__label"><ObxIcon name="chip" />Model calls</span><span class="obx-kpi__value">{{ obxCount(game.Usage.Calls) }}</span><span class="obx-kpi__sub">{{ obxCount(game.Usage.CompletionTokens) }} tokens written</span></div>
      <div class="obx-kpi"><span class="obx-kpi__label"><ObxIcon name="note" />Prompt tokens</span><span class="obx-kpi__value">{{ obxCount(game.Usage.PromptTokens) }}</span><span class="obx-kpi__sub">every cycle, every stage</span></div>
      <div class="obx-kpi"><span class="obx-kpi__label"><ObxIcon name="bolt" />Cache</span><span class="obx-kpi__value" :data-tone="cacheTone">{{ obxPct(bloxCacheRate(game.Usage)) }}</span><span class="obx-kpi__sub">{{ cacheFoot }}</span></div>
    </div>

    <section class="obx-card" aria-label="Hand-overs" data-testid="obx-brain">
      <header class="obx-card__head">
        <h2 class="obx-card__title"><ObxIcon name="brain" />Hand-overs</h2>
        <span class="obx-card__meta">each cycle ends with a report the next one starts from</span>
        <div class="obx-card__tools">
          <div class="obx-seg" role="group" aria-label="Stage">
            <button class="obx-seg__opt" :aria-pressed="stage === null" @click="stage = null">All</button>
            <button v-for="s in stages" :key="s" class="obx-seg__opt" :aria-pressed="stage === s" @click="stage = s">{{ s }}</button>
          </div>
        </div>
      </header>
      <div class="obx-card__body obx-card__body--flush">
        <div v-if="!game.Cycles.length" class="obx-empty">No cycles yet.</div>
        <ol>
          <li v-for="(c, i) in shown" :key="`${c.Utc}-${i}`" class="obx-lesson">
            <div class="obx-lesson__top">
              <span class="obx-stage" :data-stage="c.Stage">{{ c.Stage }}</span>
              <b style="color: var(--obx-ink)">{{ c.Role }}</b>
              <span :style="{ color: c.Outcome === 'finished' ? undefined : 'var(--obx-warn)' }">{{ c.Outcome }}</span>
              <span style="margin-left: auto">{{ c.Turns }} turns · {{ obxCount(c.PromptTokens) }} prompt · cache {{ obxPct(c.PromptTokens ? c.CachedTokens / c.PromptTokens : null) }} · {{ obxAgo(c.Utc, now) }}</span>
            </div>
            <p class="obx-prose" style="font-size: 12.5px">{{ c.Done }}</p>
            <p v-if="c.ToolCalls || c.Error" class="obx-dim" style="font-size: 11.5px">
              <template v-if="c.ToolCalls">{{ c.ToolCalls }} tool calls<template v-if="c.ToolErrors"> · {{ c.ToolErrors }} failed</template><template v-if="c.Truncations"> · {{ c.Truncations }} cut off by the output limit</template></template>
              <span v-if="c.Error" style="color: var(--obx-warn)"> · {{ c.Error }}</span>
            </p>
            <div v-if="c.Decisions.length || c.Problems.length || c.NextSteps.length" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px">
              <div v-if="c.Decisions.length"><h4 class="obx-sub" style="margin: 4px 0">Decided</h4><ul class="obx-list"><li v-for="(d, j) in c.Decisions" :key="j">{{ d }}</li></ul></div>
              <div v-if="c.Problems.length"><h4 class="obx-sub" style="margin: 4px 0">Problems</h4><ul class="obx-list" style="color: #ffd9a8"><li v-for="(p, j) in c.Problems" :key="j">{{ p }}</li></ul></div>
              <div v-if="c.NextSteps.length"><h4 class="obx-sub" style="margin: 4px 0">Next</h4><ul class="obx-list"><li v-for="(n, j) in c.NextSteps" :key="j">{{ n }}</li></ul></div>
            </div>
            <template v-if="c.CycleId && logs.has(c.CycleId)">
              <button class="obx-btn obx-btn--xs obx-btn--ghost" style="align-self: flex-start" :aria-expanded="openLog === c.CycleId" @click="toggleLog(c.CycleId)">
                <ObxIcon :name="openLog === c.CycleId ? 'chevron-up' : 'chevron-down'" />{{ openLog === c.CycleId ? 'Hide the steps' : 'Show every step' }}
              </button>
              <div v-if="openLog === c.CycleId" style="border-left: 2px solid var(--obx-line-strong); padding-left: 12px">
                <div v-if="logError" class="obx-banner" data-tone="crit"><span class="obx-banner__text"><strong>Could not load the log</strong><span>{{ logError }}</span></span></div>
                <div v-else-if="!log" class="obx-skel" style="height: 80px"></div>
                <ObxSteps v-else :game-id="game.GameId" :cycle-id="c.CycleId" :entries="log.Entries" :limit="60" label="Every step of this cycle" />
              </div>
            </template>
          </li>
        </ol>
        <button v-if="filtered.length > limit" class="obx-btn obx-btn--ghost obx-btn--sm" style="margin: 4px 14px 10px" @click="limit += 20">Show {{ Math.min(20, filtered.length - limit) }} more</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { bloxCacheRate, bloxGet, bloxReuseRate, type BloxCycleLog, type BloxDossier, type BloxStage } from '~/composables/useOmniBlox';
import { OBX_LINE, obxAgo, obxCount, obxPct, type ObxTone } from '~/scripts/omniblox/console';

const props = withDefaults(defineProps<{ game: BloxDossier; cycleLogs?: string[]; now: number }>(), { cycleLogs: () => [] });

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
const stages = computed(() => OBX_LINE.filter(s => props.game.Cycles.some(c => c.Stage === s)));
const filtered = computed(() => props.game.Cycles.filter(c => stage.value === null || c.Stage === stage.value).slice().reverse());
const shown = computed(() => filtered.value.slice(0, limit.value));
const cyclesFoot = computed(() => Object.keys(props.game.StageCycles).filter(s => (props.game.StageCycles[s as BloxStage] ?? 0) > 0).map(s => `${s} ${props.game.StageCycles[s as BloxStage]}`).join(' · ') || 'none yet');
const cacheTone = computed<ObxTone | undefined>(() => { const r = bloxCacheRate(props.game.Usage); return r == null ? undefined : r < 0.5 ? 'crit' : r < 0.7 ? 'warn' : undefined; });
const cacheFoot = computed(() => { const reuse = bloxReuseRate(props.game.Usage); return reuse == null ? "share of prompt served from AIRouter's cache" : `${obxPct(reuse)} of re-sent prompt from cache`; });
</script>
