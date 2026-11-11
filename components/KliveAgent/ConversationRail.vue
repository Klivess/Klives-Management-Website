<template>
  <aside class="kax-rail" aria-label="Conversations" data-testid="kax-rail">
    <div class="kax-rail__head">
      <div class="kax-rail__title">
        <KliveAgentIcon name="chat" />Conversations
        <button class="kax-btn kax-btn--xs kax-btn--ghost" type="button" title="New chat (N)" aria-keyshortcuts="N" data-testid="rail-new" @click="emit('new')"><KliveAgentIcon name="plus" />New</button>
      </div>
      <label class="kax-searchbox">
        <KliveAgentIcon name="search" />
        <input ref="searchEl" v-model="text" class="kax-input" type="search" placeholder="Filter conversations  ( / )" aria-label="Filter conversations" data-testid="rail-search" @keydown.esc="text = ''" />
      </label>
      <div class="kax-seg" role="group" aria-label="Show">
        <button v-for="f in FILTERS" :key="f.id" class="kax-seg__opt" type="button" :aria-pressed="filter === f.id" :data-testid="`rail-filter-${f.id}`" @click="emit('update:filter', f.id)">
          {{ f.label }}<span class="kax-seg__count">{{ counts[f.id] }}</span>
        </button>
      </div>
    </div>

    <div class="kax-rail__list">
      <template v-for="group in groups" :key="group.id">
        <div class="kax-rail__group">{{ group.label }}</div>
        <button
          v-for="c in group.items"
          :key="c.conversationId"
          class="kax-conv"
          type="button"
          :aria-current="c.conversationId === selected || undefined"
          :data-origin="conversationOrigin(c)"
          :title="c.lastMessage ? plainText(c.lastMessage, 400) : c.conversationId"
          data-testid="rail-conv"
          @click="emit('open', c.conversationId)"
        >
          <span class="kax-conv__icon"><KliveAgentIcon :name="originIcon(c)" /></span>
          <span class="kax-conv__title">{{ conversationTitle(c) }}</span>
          <span class="kax-conv__when">{{ shortWhen(c.lastUpdated, now) }}</span>
          <span class="kax-conv__meta">
            <span v-if="working.has(c.conversationId)" class="kax-conv__working">working</span>
            <span>{{ c.messageCount ?? 0 }} msg</span>
            <span v-if="automatedLabel(c.conversationId)" class="kax-truncate">· {{ plainText(c.lastMessage, 60) }}</span>
          </span>
        </button>
      </template>
      <div v-if="!loaded" class="kax-rail__empty">Loading conversations…</div>
      <div v-else-if="!groups.length" class="kax-rail__empty">
        {{ text ? `Nothing matches “${text}”.` : filter === 'mine' ? 'No conversations of yours yet.' : 'No conversations here.' }}
      </div>
    </div>

    <div v-if="loaded" class="kax-rail__foot">
      <span>{{ fmtInt(counts.all) }} conversations</span>
      <span v-if="hiddenEmpty">· {{ hiddenEmpty }} empty hidden</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  automatedLabel, conversationOrigin, conversationTitle, countByFilter, filterConversations, fmtInt, groupByDay, plainText, shortWhen,
  type ConversationFilter, type ConversationSummary,
} from '~/scripts/agentConsole';
import KliveAgentIcon from '~/components/KliveAgent/Icon.vue';

const props = defineProps<{
  conversations: ConversationSummary[];
  loaded: boolean;
  selected: string | null;
  filter: ConversationFilter;
  /** Conversations with a run in progress, from the server's run list. */
  working: Set<string>;
  now: number;
}>();
const emit = defineEmits<{ open: [id: string]; new: []; 'update:filter': [filter: ConversationFilter] }>();

const FILTERS: { id: ConversationFilter; label: string }[] = [
  { id: 'mine', label: 'Yours' }, { id: 'auto', label: 'Automated' }, { id: 'all', label: 'All' },
];
const text = ref('');
const searchEl = ref<HTMLInputElement | null>(null);

const counts = computed(() => countByFilter(props.conversations));
const hiddenEmpty = computed(() => props.conversations.filter(c => !c.messageCount && !c.activeRun).length);
const groups = computed(() => groupByDay(filterConversations(props.conversations, props.filter, text.value), props.now));

function originIcon(c: ConversationSummary) {
  const origin = conversationOrigin(c);
  return origin === 'automated' ? 'robot' : origin === 'discord' ? 'discord' : origin === 'scheduled' ? 'clock' : 'chat';
}

defineExpose({ focus: () => searchEl.value?.focus() });
</script>
