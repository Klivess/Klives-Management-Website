<template>
  <section class="odx-card odx-verdict" :data-tone="verdict.tone" aria-label="Defence status" data-testid="odx-verdict">
    <div class="odx-verdict__top">
      <div class="odx-verdict__glyph"><DefenceIcon :name="glyph" /></div>
      <div style="min-width: 0">
        <h2 class="odx-verdict__title" data-testid="odx-verdict-title">{{ verdict.headline }}</h2>
        <p class="odx-verdict__detail">{{ verdict.detail }}</p>
      </div>
    </div>

    <ul v-if="verdict.issues.length" class="odx-verdict__issues">
      <li v-for="issue in verdict.issues.slice(0, 4)" :key="issue.id" class="odx-issue" :data-tone="issue.tone" :data-testid="`issue-${issue.id}`">
        <DefenceIcon class="odx-issue__mark" :name="issue.tone === 'crit' ? 'octagon-x' : issue.tone === 'warn' ? 'alert' : 'info'" />
        <div class="odx-issue__text">
          <div class="odx-issue__title">{{ issue.title }}</div>
          <div class="odx-issue__detail">{{ issue.detail }}</div>
        </div>
        <button v-if="issue.action" class="odx-btn odx-btn--xs" @click="emit('jump', issue.action.target)">
          {{ issue.action.label }}<DefenceIcon name="chevron-right" />
        </button>
      </li>
    </ul>

    <footer class="odx-verdict__foot" data-testid="odx-health">
      <span v-if="overviewAge != null" :title="asOfTitle">
        Figures <b :data-tone="overviewAge >= 600 ? 'warn' : undefined">{{ overviewAge < 30 ? 'live' : `${fmtDuration(overviewAge)} old` }}</b>
      </span>
      <span v-if="health?.overviewBuildMs != null" :title="stepsTitle">built in <b>{{ fmtMs(health.overviewBuildMs) }}</b></span>
      <span v-if="health?.auditQueue != null">audit queue <b :data-tone="(health.auditQueue ?? 0) > 5000 ? 'warn' : undefined">{{ fmtInt(health.auditQueue) }}</b></span>
      <span v-if="health?.readPoolTimeouts">busy reads <b data-tone="warn">{{ fmtInt(health.readPoolTimeouts) }}</b></span>
      <span v-if="health?.auditRowsDropped">dropped <b data-tone="crit">{{ fmtInt(health.auditRowsDropped) }}</b></span>
      <span v-if="health?.fingerprintBacklog">to classify <b>{{ fmtInt(health.fingerprintBacklog) }}</b></span>
      <span v-if="totals">all time <b>{{ fmtCompact(totals.requests) }}</b> requests · <b>{{ fmtCompact(totals.denied) }}</b> denied</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { fmtCompact, fmtDuration, fmtInt, fmtMs, type DefenceOverview, type Verdict } from '~/scripts/omniDefence';

/**
 * The page's answer to "is anything wrong": one sentence, the few things behind it with a way to
 * act on each, and how fresh the figures are underneath.
 */
const props = defineProps<{ verdict: Verdict; overview: DefenceOverview | null; now: number }>();
const emit = defineEmits<{ jump: [target: string] }>();

const glyph = computed(() => ({ ok: 'shield-check', warn: 'shield-alert', crit: 'octagon-x', info: 'shield', neutral: 'shield' } as Record<string, string>)[props.verdict.tone] ?? 'shield');
const health = computed(() => props.overview?.health ?? null);

/** Seconds since the server built the figures on screen. */
const overviewAge = computed<number | null>(() => {
  const ov = props.overview;
  if (!ov) return null;
  if (ov.stale && typeof ov.ageSeconds === 'number') return ov.ageSeconds;
  const at = ov.asOfUtc ? new Date(ov.asOfUtc).getTime() : NaN;
  return Number.isFinite(at) ? Math.max(0, (props.now - at) / 1000) : null;
});
const asOfTitle = computed(() => (props.overview?.asOfUtc ? `Built ${new Date(props.overview.asOfUtc).toLocaleString()}` : ''));
const stepsTitle = computed(() => {
  const steps = health.value?.buildSteps;
  if (!steps) return 'Time the server took to build these figures';
  return Object.entries(steps).sort((a, b) => b[1] - a[1]).map(([name, ms]) => `${name}: ${fmtMs(ms)}`).join('\n');
});
const totals = computed(() => {
  const ov = props.overview;
  return ov && typeof ov.totalRequests === 'number' ? { requests: ov.totalRequests, denied: ov.totalDenied ?? 0 } : null;
});
</script>
