<template>
  <section class="kax-card" aria-label="Scheduled" data-testid="kax-schedule">
    <header class="kax-card__head">
      <h2 class="kax-card__title"><KliveAgentIcon name="calendar" />Scheduled</h2>
      <span v-if="schedule?.active.length" class="kax-chip" data-tone="neutral">{{ schedule.active.length }} active</span>
      <span class="kax-card__meta">
        <button v-if="schedule?.recent.length" class="kax-btn kax-btn--xs kax-btn--ghost" type="button" :aria-pressed="showRecent" @click="showRecent = !showRecent">History</button>
      </span>
    </header>
    <div v-if="!supported" class="kax-card__empty">This server does not list scheduled tasks yet (it arrives with the next deploy).</div>
    <div v-else-if="!schedule" class="kax-card__empty">Loading…</div>
    <template v-else>
      <div v-if="!schedule.active.length && !showRecent" class="kax-card__empty">Nothing scheduled. Ask KliveAgent to “check this every morning” and it schedules itself.</div>
      <div v-else class="kax-card__body kax-rows">
        <div v-for="task in (showRecent ? schedule.recent : schedule.active)" :key="task.id" class="kax-row" data-testid="schedule-row" :title="task.instruction">
          <span class="kax-row__icon" :data-tone="showRecent ? 'neutral' : dueLabel(task, now).tone"><KliveAgentIcon :name="task.repeatEverySeconds ? 'repeat' : 'clock'" /></span>
          <span class="kax-row__title">{{ plainText(task.instruction, 120) }}</span>
          <span class="kax-row__aside">
            <template v-if="showRecent">{{ task.lastFiredAt ? shortWhen(task.lastFiredAt, now) : 'never fired' }}</template>
            <span v-else class="kax-chip" :data-tone="dueLabel(task, now).tone">{{ dueLabel(task, now).text }}</span>
          </span>
          <span class="kax-row__sub">
            {{ fmtEvery(task.repeatEverySeconds) }}<template v-if="task.firedCount"> · fired {{ task.firedCount }}×</template><template v-if="task.lastOutcome"> · {{ plainText(task.lastOutcome, 90) }}</template>
          </span>
          <span v-if="!showRecent && (canCancel || task.conversationId)" class="kax-row__actions">
            <button v-if="task.conversationId" class="kax-btn kax-btn--xs" type="button" @click="emit('open', task.conversationId)"><KliveAgentIcon name="chat" />Open</button>
            <button v-if="canCancel" class="kax-btn kax-btn--xs kax-btn--danger" type="button" data-testid="schedule-cancel" @click="emit('cancel', task)"><KliveAgentIcon name="x" />Cancel</button>
          </span>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { dueLabel, fmtEvery, plainText, shortWhen, type ScheduleState, type ScheduledTask } from '~/scripts/agentConsole';
import KliveAgentIcon from '~/components/KliveAgent/Icon.vue';

/** What KliveAgent set itself to do later. Before this card only its own tools could see these (7 live on 11 Nov). */
defineProps<{ schedule: ScheduleState | null; supported: boolean; canCancel: boolean; now: number }>();
const emit = defineEmits<{ cancel: [task: ScheduledTask]; open: [conversationId: string] }>();
const showRecent = ref(false);
</script>
