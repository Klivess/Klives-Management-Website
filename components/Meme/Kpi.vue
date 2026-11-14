<template>
  <component :is="clickable ? 'button' : 'div'" class="msx-kpi" :data-clickable="clickable || undefined" :data-testid="testid" :type="clickable ? 'button' : undefined" @click="clickable && $emit('open')">
    <span class="msx-kpi__label">
      <MemeIcon v-if="icon" :name="icon" />{{ label }}
      <span v-if="deltaText" class="msx-delta" :data-dir="deltaDir" :title="baseline">{{ deltaText }}</span>
    </span>
    <span class="msx-kpi__value" :data-tone="tone || undefined">
      <template v-if="value !== null">{{ value }}<span v-if="unit" class="msx-kpi__unit">{{ unit }}</span></template>
      <span v-else class="msx-skel" style="display: inline-block; width: 70px; height: 24px"></span>
    </span>
    <span class="msx-kpi__foot"><slot name="foot" /></span>
    <span v-if="$slots.default" class="msx-kpi__viz"><slot /></span>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { msChangeText, type MsChange } from '~/scripts/memeConsole';

const props = withDefaults(defineProps<{
  label: string; value: string | null; unit?: string; icon?: string; tone?: string; clickable?: boolean; testid?: string;
  change?: MsChange | null; changeMode?: 'pct' | 'points' | 'count'; goodDirection?: 1 | -1; baseline?: string;
}>(), { unit: '', icon: '', tone: '', clickable: false, testid: undefined, change: null, changeMode: 'pct', goodDirection: 1, baseline: '' });
defineEmits<{ open: [] }>();

const deltaText = computed(() => msChangeText(props.change ?? null, props.changeMode));
const deltaDir = computed(() => {
  const d = props.change?.dir ?? 0;
  if (!d) return 'flat';
  return d * props.goodDirection > 0 ? 'up' : 'down';
});
</script>
