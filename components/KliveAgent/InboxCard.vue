<template>
  <section class="kax-card" aria-label="Results" data-testid="kax-inbox">
    <header class="kax-card__head">
      <h2 class="kax-card__title"><KliveAgentIcon name="inbox" />Results</h2>
      <span v-if="unread.length" class="kax-chip" data-tone="accent" data-testid="inbox-unread">{{ unread.length }} unread</span>
      <span class="kax-card__meta">
        <button v-if="unread.length" class="kax-btn kax-btn--xs kax-btn--ghost" type="button" title="Mark every result read" data-testid="inbox-read-all" @click="emit('readAll')"><KliveAgentIcon name="check" />All read</button>
      </span>
    </header>
    <div v-if="!shown.length" class="kax-card__empty">Finished work you were not watching lands here.</div>
    <div v-else class="kax-card__body kax-rows">
      <button
        v-for="note in shown"
        :key="note.notificationId"
        class="kax-row"
        type="button"
        :data-unread="!note.readAt || undefined"
        :data-tone="noteTone(note.kind)"
        :title="plainText(note.body, 600)"
        data-testid="inbox-row"
        @click="emit('open', note)"
      >
        <span class="kax-row__icon"><KliveAgentIcon :name="noteIcon(note.kind)" /></span>
        <span class="kax-row__title">{{ note.title || 'Result' }}</span>
        <span class="kax-row__aside"><span v-if="!note.readAt" class="kax-unread-dot"></span>{{ shortWhen(note.createdAt, now) }}</span>
        <span class="kax-row__sub">{{ plainText(note.body, 160) }}</span>
      </button>
      <button v-if="notes.length > limit && !expanded" class="kax-btn kax-btn--xs kax-btn--ghost" type="button" style="margin-top: 6px" @click="expanded = true">Show {{ notes.length - limit }} more</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { noteIcon, noteTone, plainText, shortWhen, type AgentNote } from '~/scripts/agentConsole';
import KliveAgentIcon from '~/components/KliveAgent/Icon.vue';

/** Unread first, then the most recent: the old panel listed all 147 results, newest first, read or not. */
const props = defineProps<{ notes: AgentNote[]; unread: AgentNote[]; now: number }>();
const emit = defineEmits<{ open: [note: AgentNote]; readAll: [] }>();

const limit = 6;
const expanded = ref(false);
const merged = computed(() => {
  const unreadIds = new Set(props.unread.map(n => n.notificationId));
  const rest = props.notes.filter(n => !unreadIds.has(n.notificationId));
  return [...props.unread.map(n => ({ ...n, readAt: null })), ...rest];
});
const shown = computed(() => (expanded.value ? merged.value : merged.value.slice(0, Math.max(limit, props.unread.length))));
</script>
