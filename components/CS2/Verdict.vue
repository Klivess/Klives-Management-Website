<template>
  <section class="cs2x-card cs2x-verdict" :data-tone="verdict.tone" aria-live="polite" data-testid="cs2x-verdict">
    <span class="cs2x-verdict__word"><i></i>{{ verdict.word }}</span>
    <h2 class="cs2x-verdict__headline">{{ verdict.headline }}</h2>
    <p v-if="verdict.detail" class="cs2x-verdict__detail">{{ verdict.detail }}</p>
    <div v-if="chips.length" class="cs2x-verdict__chips">
      <span v-for="chip in chips" :key="chip.label" class="cs2x-pill" :data-tone="chip.tone" :title="chip.title">{{ chip.label }}</span>
    </div>

    <div v-if="items.length" class="cs2x-needs" data-testid="cs2x-needs">
      <div v-for="item in items" :key="item.key" class="cs2x-need" :data-tone="item.tone" :data-testid="`need-${item.key}`">
        <span class="cs2x-need__bar"></span>
        <span class="cs2x-need__text">
          <span class="cs2x-need__title">{{ item.title }}</span>
          <span class="cs2x-need__detail" :title="item.detail">{{ item.detail }}</span>
        </span>
        <template v-if="item.action">
          <a v-if="item.action.kind === 'link'" class="cs2x-btn cs2x-btn--sm" :href="item.action.href" target="_blank" rel="noopener">
            {{ item.action.label }}<CS2Icon name="external" />
          </a>
          <button
            v-else-if="canRun(item)"
            class="cs2x-btn cs2x-btn--sm"
            :class="{ 'cs2x-btn--primary': item.action.kind === 'steam-login' }"
            :disabled="isPending(item)"
            :data-testid="`need-action-${item.key}`"
            @click="emit('action', item)"
          >
            <CS2Icon v-if="isPending(item)" name="refresh" class="cs2x-spin" />{{ item.action.label }}
          </button>
        </template>
      </div>
    </div>
    <p v-else-if="ready" class="cs2x-clear"><CS2Icon name="check-circle" />Nothing needs you right now.</p>
  </section>
</template>

<script setup lang="ts">
import CS2Icon from '~/components/CS2/Icon.vue';
import type { Cs2Attention } from '~/scripts/cs2Arbitrage';

const props = defineProps<{
  verdict: { tone: string; word: string; headline: string; detail: string };
  chips: { label: string; tone: string; title?: string }[];
  items: Cs2Attention[];
  pending: Record<string, boolean>;
  canManage: boolean;
  ready: boolean;
}>();
const emit = defineEmits<{ action: [item: Cs2Attention] }>();

/** Klives-only actions are hidden from everyone else; opening a position is anyone's. */
const canRun = (item: Cs2Attention) => item.action?.kind === 'open-position' || props.canManage;
const isPending = (item: Cs2Attention) =>
  item.action?.kind === 'steam-login' ? Boolean(props.pending['steam-login']) : item.action?.kind === 'recheck' ? Boolean(props.pending[`recheck:${item.action.id}`]) : false;
</script>
