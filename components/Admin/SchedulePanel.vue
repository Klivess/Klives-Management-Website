<template>
  <section id="adm-schedule" class="adm-panel" aria-label="Schedule" :data-flash="flash">
    <header class="adm-panel__head">
      <h2 class="adm-panel__title"><AdminIcon name="calendar" />Schedule</h2>
      <span class="adm-panel__meta adm-num">{{ total != null ? `${total} task${total === 1 ? '' : 's'}` : '' }}</span>
      <div class="adm-panel__tools">
        <NuxtLink v-if="canOpen" class="adm-panel__link" to="/botSchedule">All <AdminIcon name="arrow-right" /></NuxtLink>
      </div>
    </header>

    <div class="adm-panel__body adm-panel__body--flush">
      <ul v-if="upcoming.length" class="adm-rows">
        <li v-for="task in upcoming" :key="task.taskName" class="adm-row adm-row--hover" :title="task.reason || task.topic || task.taskName">
          <span class="adm-dot" :data-tone="task.overdue ? 'warn' : task.soon ? 'ok' : 'neutral'" :class="{ 'adm-dot--ring': !task.soon && !task.overdue }"></span>
          <span class="adm-row__main">
            <span class="adm-row__title">{{ task.taskName }}</span>
            <span class="adm-row__sub">{{ task.agentName || 'Unowned' }} · {{ fmtClock(task.dateTimeDue) }}</span>
          </span>
          <span class="adm-row__end">
            <span v-if="task.overdue" class="adm-state" data-tone="warn"><AdminIcon name="alert" />overdue {{ fmtDuration(task.overdueSeconds) }}</span>
            <template v-else>in {{ fmtDuration(task.inSeconds) }}</template>
          </span>
        </li>
      </ul>
      <div v-else-if="tasks" class="adm-empty">Nothing is scheduled.</div>
      <div v-else-if="fallback" class="adm-empty">{{ fallback }}</div>
      <div v-else class="adm-empty">{{ loading ? 'Reading the schedule…' : 'The schedule is unavailable.' }}</div>
      <p v-if="hiddenCount > 0" class="adm-dim" style="padding: 4px 10px 0; font-size: 11.5px">and {{ hiddenCount }} later</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { fmtClock, fmtDuration, toMs, type AdminTask } from '~/scripts/adminConsole';

const props = withDefaults(defineProps<{
  tasks: AdminTask[] | null;
  /** From the status snapshot, for profiles that cannot read the task list itself. */
  total: number | null;
  fallback?: string;
  now: number;
  canOpen: boolean;
  limit?: number;
  loading?: boolean;
  flash?: boolean;
}>(), { fallback: '', limit: 6, loading: false, flash: false });

const ordered = computed(() => (props.tasks ?? [])
  .map(task => {
    const due = toMs(task.dateTimeDue) ?? 0;
    const delta = (due - props.now) / 1000;
    return {
      ...task,
      due,
      inSeconds: Math.max(0, delta),
      // A task still listed two minutes past its time has not fired.
      overdue: delta < -120,
      overdueSeconds: Math.max(0, -delta),
      soon: delta >= -120 && delta < 3600,
    };
  })
  .sort((a, b) => a.due - b.due));

const upcoming = computed(() => ordered.value.slice(0, props.limit));
const hiddenCount = computed(() => Math.max(0, ordered.value.length - props.limit));
</script>
