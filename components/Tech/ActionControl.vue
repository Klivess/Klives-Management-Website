<template>
  <div class="ktx-action" :data-kind="kind" :data-compact="compact || undefined" :data-state="run?.state" :data-testid="`action-${action.name}`">
    <div class="ktx-action__label" :title="action.paramDescription || action.name">
      <span class="ktx-truncate">{{ action.name }}</span>
      <span v-if="!compact && action.paramDescription" class="ktx-action__desc">{{ action.paramDescription }}</span>
    </div>

    <div class="ktx-action__control">
      <button
        v-if="kind === 'button'"
        class="ktx-btn ktx-btn--sm"
        :disabled="disabled || running"
        :data-testid="`run-${action.name}`"
        @click="send('')"
      >
        <TechIcon :name="running ? 'refresh' : 'bolt'" :class="{ 'ktx-spin': running }" />Run
      </button>

      <div v-else-if="kind === 'toggle'" class="ktx-seg" role="group" :aria-label="action.name">
        <button
          v-for="choice in ['false', 'true']"
          :key="choice"
          class="ktx-seg__opt"
          :aria-pressed="sent === choice"
          :disabled="disabled || running"
          :data-testid="`run-${action.name}-${choice}`"
          @click="send(choice)"
        >
          {{ choice === 'true' ? 'On' : 'Off' }}
        </button>
      </div>

      <form v-else class="ktx-action__form" @submit.prevent="send(draft)">
        <input
          v-model="draft"
          class="ktx-input ktx-input--sm"
          type="text"
          :inputmode="kind === 'number' ? 'numeric' : 'text'"
          :placeholder="action.paramDescription || (kind === 'number' ? '0' : 'value')"
          :aria-label="action.name"
          :aria-invalid="!!problem || undefined"
          :disabled="disabled"
          :data-testid="`input-${action.name}`"
          @keydown.stop
        />
        <button class="ktx-iconbtn ktx-iconbtn--sm" type="submit" :disabled="disabled || running || !!problem || (kind === 'number' && !draft)" :aria-label="`Send ${action.name}`" :data-testid="`run-${action.name}`">
          <TechIcon :name="running ? 'refresh' : 'send'" :class="{ 'ktx-spin': running }" />
        </button>
      </form>
    </div>

    <div v-if="!compact || run?.state === 'error' || problem" class="ktx-action__status" :data-tone="run?.state === 'error' ? 'crit' : run?.state === 'ok' ? 'ok' : undefined">
      <template v-if="problem">{{ problem }}</template>
      <template v-else-if="run?.state === 'running'">Sending…</template>
      <template v-else-if="run?.state === 'error'">{{ run.message }}</template>
      <template v-else-if="run?.state === 'ok'">
        <TechIcon name="check" />{{ sentLabel }} · {{ ago }}<template v-if="run.ms != null"> · {{ run.ms }} ms</template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { actionKind, fmtAgo, validateActionParam, type GadgetAction } from '~/scripts/kliveTech';
import type { ActionRun } from '~/composables/useKliveTech';

/**
 * One gadget action, as the control its parameter type calls for: a button, an on/off pair, or a
 * field with send. The hub cannot read a toggle back, so the pair shows what was last sent.
 */
const props = defineProps<{ action: GadgetAction; run: ActionRun | null; disabled?: boolean; compact?: boolean; now: number }>();
const emit = defineEmits<{ run: [value: string] }>();

const kind = computed(() => actionKind(props.action));
const draft = ref('');
const running = computed(() => props.run?.state === 'running');
const sent = computed(() => (props.run && props.run.state !== 'error' ? props.run.value : null));
const problem = computed(() => (kind.value === 'number' && draft.value ? validateActionParam(props.action, draft.value) : ''));
const sentLabel = computed(() => {
  const value = props.run?.value ?? '';
  if (kind.value === 'button') return 'Ran';
  if (kind.value === 'toggle') return value === 'true' ? 'Sent On' : 'Sent Off';
  return `Sent ${value.length > 24 ? `${value.slice(0, 23)}…` : value || '""'}`;
});
const ago = computed(() => (props.run ? fmtAgo(new Date(props.run.at).toISOString(), props.now) : ''));

function send(value: string) {
  if (props.disabled || running.value) return;
  if (kind.value === 'number' && validateActionParam(props.action, value)) return;
  // Text goes as typed (spaces may matter to the gadget); a number is trimmed.
  emit('run', kind.value === 'text' ? value : value.trim());
}
</script>
