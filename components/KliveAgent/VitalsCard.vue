<template>
  <section class="kax-card" aria-label="KliveAgent today" data-testid="kax-vitals">
    <header class="kax-card__head">
      <h2 class="kax-card__title"><KliveAgentIcon name="gauge" />Today</h2>
      <span class="kax-card__meta">
        <button class="kax-btn kax-btn--xs kax-btn--ghost" type="button" @click="emit('insights')">Insights<KliveAgentIcon name="chevron-right" /></button>
      </span>
    </header>
    <div class="kax-card__body">
      <div v-if="!ready && status" class="kax-verdict-line" :data-tone="status.state === 'failed' ? 'crit' : 'info'" style="margin-bottom: 8px">
        <KliveAgentIcon :name="status.state === 'failed' ? 'octagon-x' : 'clock'" />
        <div style="flex: 1; min-width: 0">
          <div><b>{{ status.state === 'failed' ? 'KliveAgent failed to start' : 'KliveAgent is starting' }}</b> · {{ Math.round(status.progress ?? 0) }}%</div>
          <div class="kax-dim">{{ status.message }}</div>
          <div style="height: 4px; border-radius: 2px; background: var(--kax-line); margin-top: 6px; overflow: hidden">
            <div :style="{ width: `${Math.min(100, status.progress ?? 0)}%`, height: '100%', background: 'var(--kax-accent)', transition: 'width 300ms' }"></div>
          </div>
        </div>
      </div>
      <!-- The server's two rolling checks: nothing here while both are quiet. -->
      <div v-for="line in healthLines" :key="line.id" class="kax-verdict-line" :data-tone="line.tone" style="margin-bottom: 8px" :data-testid="`vitals-${line.id}`">
        <KliveAgentIcon name="alert" />
        <div style="flex: 1; min-width: 0">
          <div><b>{{ line.title }}</b></div>
          <div class="kax-dim">{{ line.detail }}</div>
        </div>
      </div>
      <div class="kax-vitals">
        <div class="kax-vital" :title="`${fmtInt(summary?.TodayIterations)} model steps today`">
          <span class="kax-vital__v">{{ fmtInt(summary?.TodayMessages) }}</span>
          <span class="kax-vital__l">messages</span>
        </div>
        <div class="kax-vital">
          <span class="kax-vital__v">{{ fmtTokens(summary?.TodayTotalTokens) }}</span>
          <span class="kax-vital__l">tokens</span>
        </div>
        <div class="kax-vital" :data-tone="scriptTone(weekScriptPct)" :title="`Scripts that ran without error over the last 7 days (${fmtInt(week.scripts)} run, ${fmtInt(week.scriptFailures)} failed)`">
          <span class="kax-vital__v">{{ weekScriptPct == null ? '—' : `${Math.round(weekScriptPct)}%` }}</span>
          <span class="kax-vital__l">scripts ok · 7d</span>
        </div>
        <div class="kax-vital" :title="`Median run over the last ${perf?.recent?.length ?? 0} runs; p95 ${fmtMs(perf?.recentP95DurationMs)}`">
          <span class="kax-vital__v">{{ fmtMs(perf?.recentP50DurationMs) }}</span>
          <span class="kax-vital__l">median run</span>
        </div>
        <div class="kax-vital" :title="`${fmtInt(week.messages)} messages in the last 7 days`">
          <span class="kax-vital__v">{{ fmtInt(week.messages) }}</span>
          <span class="kax-vital__l">messages · 7d</span>
        </div>
        <div class="kax-vital" :title="cost.note">
          <span class="kax-vital__v">{{ cost.value }}</span>
          <span class="kax-vital__l">cost · 7d</span>
        </div>
      </div>
      <template v-if="days.length">
        <KliveAgentSpark :points="days" bars label="Messages a day for the last 14 days, failed scripts in red" :format="v => `${v} messages`" />
        <div class="kax-spark__caption"><span>14 days</span><span>{{ fmtTokens(fortnightTokens) }} tokens</span></div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { bucketsFor, costLabel, fmtInt, fmtMs, fmtTokens, readHealthWatch, scriptTone, summarise, watchLines, type FlatSummary, type UsageStats } from '~/scripts/agentConsole';
import KliveAgentIcon from '~/components/KliveAgent/Icon.vue';
import KliveAgentSpark from '~/components/KliveAgent/Spark.vue';

const props = defineProps<{ summary: FlatSummary | null; stats: UsageStats | null; status: any; ready: boolean; now: number }>();
const emit = defineEmits<{ insights: [] }>();

const weekBuckets = computed(() => bucketsFor(props.stats, '7D', props.now));
const week = computed(() => summarise(weekBuckets.value));
const weekScriptPct = computed(() => week.value.scriptSuccessPct);
const perf = computed(() => props.stats?.performance ?? null);
const cost = computed(() => costLabel(week.value.costUsd, week.value.totalTokens));
const fortnight = computed(() => bucketsFor(props.stats, '30D', props.now).slice(-14));
const fortnightTokens = computed(() => fortnight.value.reduce((t, b) => t + b.totalTokens, 0));
const days = computed(() => (props.stats ? fortnight.value.map(b => ({ v: b.messages, label: b.label })) : []));
// Rides on the status the page already polls, so a slow provider is said here within 15 seconds.
const healthLines = computed(() => watchLines(readHealthWatch(props.status?.health)));
</script>
