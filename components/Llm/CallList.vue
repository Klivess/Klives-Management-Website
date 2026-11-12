<template>
  <ul class="llx-recent">
    <li v-for="r in calls" :key="r.id">
      <button class="llx-recent__row" :data-testid="`call-${r.id}`" @click="ui.openCall(r.id)">
        <span class="llx-chip llx-chip--dot" :data-tone="outcomeInfo(r.outcome).tone">{{ outcomeInfo(r.outcome).label }}</span>
        <span class="llx-truncate"><template v-if="showLane"><b>{{ r.service }}</b> › {{ r.laneLabel }} · </template>{{ llmTime(r.endedMs, true) }}<span v-if="r.subject" class="llx-dim"> · {{ r.subject }}</span></span>
        <span class="llx-dim llx-truncate llx-mono">{{ r.model }}</span>
        <span class="llx-num llx-dim">{{ llmCompact((r.promptTokens ?? 0) + (r.completionTokens ?? 0)) }} tok</span>
        <span class="llx-num">{{ llmMs(r.totalMs) }}</span>
      </button>
    </li>
    <li v-if="!calls.length" class="llx-empty">{{ loading ? 'Reading…' : emptyText }}</li>
  </ul>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import type { LlmUi } from '~/composables/useKliveLlm';
import { llmCompact, llmMs, llmTime, outcomeInfo } from '~/scripts/kliveLlm';

withDefaults(defineProps<{ calls: any[]; loading?: boolean; emptyText?: string; showLane?: boolean }>(), { emptyText: 'No calls.' });
const ui = inject<LlmUi>('llxUi')!;
</script>
