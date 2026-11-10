<template>
  <section class="adm-panel adm-hero" :data-tone="verdict.tone" aria-label="System status" data-testid="adm-hero">
    <div class="adm-hero__top">
      <span class="adm-hero__glyph"><AdminIcon :name="glyph" /></span>
      <div style="min-width: 0">
        <h2 class="adm-hero__title" role="status" aria-live="polite" data-testid="adm-verdict">{{ verdict.title }}</h2>
        <p class="adm-hero__detail">{{ verdict.detail }}</p>
      </div>
    </div>

    <div class="adm-hero__body">
      <ul v-if="shown.length">
        <li v-for="issue in shown" :key="issue.id" class="adm-issue" :class="{ 'adm-issue--muted': isMuted(issue) }" :data-tone="issue.severity" :data-testid="`issue-${issue.id}`">
          <AdminIcon class="adm-issue__mark" :name="issue.severity === 'crit' ? 'octagon-x' : issue.severity === 'warn' ? 'alert' : 'info'" />
          <div class="adm-issue__text">
            <div class="adm-issue__title">{{ issue.title }}</div>
            <div v-if="issue.detail" class="adm-issue__detail">{{ issue.detail }}</div>
          </div>
          <div class="adm-issue__acts">
            <button
              v-if="issue.action?.kind === 'restart-service'"
              class="adm-btn adm-btn--sm"
              :disabled="busy || !!pending[issue.action.service]"
              :data-testid="`issue-restart-${issue.action.service}`"
              @click="emit('restart', issue.action.service)"
            ><AdminIcon name="restart" :class="{ 'adm-spin': !!pending[issue.action.service] }" />{{ pending[issue.action.service] ? 'Restarting' : 'Restart' }}</button>
            <NuxtLink v-else-if="issue.action?.kind === 'open'" class="adm-btn adm-btn--sm" :to="issue.action.to">{{ issue.action.label }}</NuxtLink>
            <button v-else-if="issue.action?.kind === 'deploy'" class="adm-btn adm-btn--sm" :disabled="busy" @click="emit('deploy')"><AdminIcon name="deploy" />Update</button>
            <button v-if="issue.section" class="adm-iconbtn" title="Show on this page" :aria-label="`Show ${issue.title} on this page`" @click="emit('jump', issue.section)"><AdminIcon name="chevron-down" /></button>
            <button
              v-if="issue.severity !== 'info' || isMuted(issue)"
              class="adm-iconbtn"
              :title="isMuted(issue) ? 'Count this again' : 'Known: stop counting this towards the status'"
              :aria-label="isMuted(issue) ? `Unmute ${issue.title}` : `Mute ${issue.title}`"
              :aria-pressed="isMuted(issue)"
              :data-testid="`issue-mute-${issue.id}`"
              @click="emit('mute', issue.id, !isMuted(issue))"
            ><AdminIcon :name="isMuted(issue) ? 'bell' : 'mute'" /></button>
          </div>
        </li>
      </ul>

      <div v-else class="adm-hero__quiet">
        <div class="adm-hero__fact">
          <div class="adm-hero__fact-label">Up for</div>
          <div class="adm-hero__fact-value">{{ processUptime != null ? fmtDuration(processUptime) : '—' }}</div>
        </div>
        <div v-if="nextTask" class="adm-hero__fact" :title="nextTask.name">
          <div class="adm-hero__fact-label">Next task</div>
          <div class="adm-hero__fact-value">{{ nextTask.inLabel }}</div>
        </div>
        <div v-else class="adm-hero__fact">
          <div class="adm-hero__fact-label">7-day uptime</div>
          <div class="adm-hero__fact-value">{{ availability }}</div>
        </div>
        <div class="adm-hero__fact">
          <div class="adm-hero__fact-label">Errors, last hour</div>
          <div class="adm-hero__fact-value">{{ errorsLastHour != null ? fmtInt(errorsLastHour) : '—' }}</div>
        </div>
      </div>
    </div>

    <footer class="adm-hero__foot">
      <span v-if="machine"><b>{{ machine }}</b></span>
      <span v-if="commit">build <b class="adm-mono">{{ commit }}</b></span>
      <span v-if="builtLabel">{{ builtLabel }}</span>
      <button v-if="muted.length" class="adm-hero__more" style="margin-left: auto" data-testid="muted-toggle" @click="showMuted = !showMuted">
        {{ showMuted ? 'Hide' : 'Show' }} {{ muted.length }} muted
      </button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { fmtDuration, fmtInt, type Issue, type Tone } from '~/scripts/adminConsole';

/*
 * The one question the page exists to answer, answered first: is everything all right? The headline
 * is the worst open issue (or "nominal"), and each issue carries the action that would clear it.
 * An issue you already know about can be muted: it stays listed but stops colouring the status,
 * so a standing condition does not teach you to ignore the headline.
 */
const props = defineProps<{
  verdict: { tone: Tone; title: string; detail: string };
  issues: Issue[];
  muted: Issue[];
  pending: Record<string, 'restart' | 'quit'>;
  busy: boolean;
  processUptime: number | null;
  weekAvailability: number | null;
  errorsLastHour: number | null;
  /** The next scheduled task, when the schedule is readable. */
  nextTask: { name: string; inLabel: string } | null;
  machine: string;
  commit: string;
  builtLabel: string;
}>();

const emit = defineEmits<{
  restart: [service: string];
  deploy: [];
  jump: [section: string];
  mute: [id: string, on: boolean];
}>();

const showMuted = ref(false);
const shown = computed(() => (showMuted.value ? [...props.issues, ...props.muted] : props.issues));
const mutedIds = computed(() => new Set(props.muted.map(issue => issue.id)));
const isMuted = (issue: Issue) => mutedIds.value.has(issue.id);

const glyph = computed(() => ({ ok: 'check-circle', warn: 'alert', crit: 'octagon-x', info: 'refresh', neutral: 'clock' } as Record<Tone, string>)[props.verdict.tone]);
const availability = computed(() => {
  const value = props.weekAvailability;
  if (value == null) return '—';
  return value >= 99.995 ? '100%' : `${value.toFixed(2)}%`;
});
</script>
