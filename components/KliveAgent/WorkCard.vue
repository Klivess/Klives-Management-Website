<template>
  <section class="kax-card" aria-label="Background work" data-testid="kax-work">
    <header class="kax-card__head">
      <h2 class="kax-card__title"><KliveAgentIcon name="layers" />Background</h2>
      <span v-if="activeJobs" class="kax-chip kax-chip--dot" data-tone="accent" data-pulse="true">{{ activeJobs }} running</span>
      <span class="kax-card__meta">
        <button v-if="canManage" class="kax-btn kax-btn--xs kax-btn--ghost" type="button" title="Start a long-term job in parallel" data-testid="work-new-job" @click="emit('newJob')"><KliveAgentIcon name="plus" />Job</button>
      </span>
    </header>
    <div v-if="!jobs.length && !liveTasks.length" class="kax-card__empty">
      {{ tasks.length ? `No background jobs. ${tasks.length} finished task${tasks.length === 1 ? '' : 's'}, the last ${shortWhen(lastTaskAt, now)}.` : 'No background jobs.' }}
    </div>
    <div v-else class="kax-card__body kax-rows">
      <div v-for="job in jobs" :key="job.jobId" class="kax-row" data-testid="work-job">
        <span class="kax-row__icon" :data-tone="jobTone(job.status)"><KliveAgentIcon name="layers" /></span>
        <span class="kax-row__title">{{ job.name || plainText(job.goal, 80) || 'Long-term job' }}</span>
        <span class="kax-row__aside"><span class="kax-chip" :data-tone="jobTone(job.status)">{{ job.status }}</span></span>
        <span class="kax-row__sub">
          <template v-if="job.attentionRequired"><b style="color: var(--kax-warn)">Needs you:</b> {{ job.attentionMessage }}</template>
          <template v-else>{{ plainText(job.result || job.goal, 140) }} · {{ shortWhen(job.lastUpdated, now) }}</template>
        </span>
        <span class="kax-row__actions">
          <NuxtLink v-if="job.projectId" class="kax-btn kax-btn--xs" :to="`/projects/${job.projectId}`"><KliveAgentIcon name="external" />Project</NuxtLink>
          <button v-if="canManage && canSteerJob(job)" class="kax-btn kax-btn--xs" type="button" @click="steering = steering === job.jobId ? null : job.jobId">Steer</button>
          <button v-if="canManage && canStopJob(job)" class="kax-btn kax-btn--xs kax-btn--danger" type="button" @click="emit('stop', job)">Stop</button>
          <button v-if="canManage && canResumeJob(job)" class="kax-btn kax-btn--xs kax-btn--ok" type="button" @click="emit('resume', job)">Resume</button>
        </span>
        <form v-if="steering === job.jobId" class="kax-row__actions" style="width: 100%" @submit.prevent="sendSteer(job)">
          <input v-model="draft" class="kax-input" style="height: 26px; flex: 1" placeholder="Guidance for the job…" />
          <button class="kax-btn kax-btn--xs kax-btn--primary" type="submit" :disabled="!draft.trim()">Send</button>
        </form>
      </div>
      <div v-for="task in liveTasks" :key="task.taskId" class="kax-row" data-testid="work-task">
        <span class="kax-row__icon" data-tone="accent"><KliveAgentIcon name="terminal" /></span>
        <span class="kax-row__title">{{ task.description || 'Background script' }}</span>
        <span class="kax-row__aside"><span class="kax-chip kax-chip--dot" data-tone="accent" data-pulse="true">{{ task.status }}</span></span>
        <span class="kax-row__sub">started {{ shortWhen(task.createdAt, now) }}</span>
        <span v-if="canManage" class="kax-row__actions"><button class="kax-btn kax-btn--xs kax-btn--danger" type="button" @click="emit('cancelTask', task)">Cancel</button></span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { canResumeJob, canSteerJob, canStopJob, jobTone, plainText, shortWhen, toMs, type AgentJob, type BackgroundTask } from '~/scripts/agentConsole';
import KliveAgentIcon from '~/components/KliveAgent/Icon.vue';

/**
 * Long-term jobs and the agent's background scripts. Live on 11 Nov: no jobs and three background
 * tasks, the newest from May; the old drawer gave both a full block each. Finished tasks are a line.
 */
const props = defineProps<{ jobs: AgentJob[]; tasks: BackgroundTask[]; canManage: boolean; now: number }>();
const emit = defineEmits<{ newJob: []; stop: [job: AgentJob]; resume: [job: AgentJob]; steer: [job: AgentJob, message: string]; cancelTask: [task: BackgroundTask] }>();

const steering = ref<string | null>(null);
const draft = ref('');
const activeJobs = computed(() => props.jobs.filter(job => canStopJob(job)).length);
const liveTasks = computed(() => props.tasks.filter(task => task.status === 'Running'));
const lastTaskAt = computed(() => props.tasks.reduce((latest, task) => Math.max(latest, toMs(task.completedAt ?? task.createdAt) ?? 0), 0));

function sendSteer(job: AgentJob) {
  if (!draft.value.trim()) return;
  emit('steer', job, draft.value.trim());
  draft.value = '';
  steering.value = null;
}
</script>
