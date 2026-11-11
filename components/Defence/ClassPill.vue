<template>
  <span class="odx-class" :style="{ '--cls': info.color }" :data-faint="faint || undefined" :title="title">
    <span class="odx-class__dot"></span>
    <span v-if="!dotOnly" class="odx-class__label">{{ info.label }}</span>
    <span v-if="confidence != null && !dotOnly" class="odx-class__conf">{{ Math.round(confidence * 100) }}%</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { DEFAULT_CLASSES, type ClassInfo } from '~/scripts/omniDefence';

/** What a visitor is: a dot in its class colour and the class's name, with the classifier's confidence. */
const props = defineProps<{
  id: string | null | undefined;
  classes?: readonly ClassInfo[];
  confidence?: number | null;
  dotOnly?: boolean;
}>();

const info = computed<ClassInfo>(() => {
  const id = props.id || 'Unknown';
  const list = props.classes?.length ? props.classes : DEFAULT_CLASSES;
  return list.find(c => c.id === id) ?? { id, label: id, color: '#56636b', malicious: false, group: 'unknown', description: '' };
});
/** A tentative verdict reads as a fainter dot. */
const faint = computed(() => props.confidence != null && props.confidence < 0.6);
const title = computed(() => `${info.value.label}${props.confidence != null ? ` (${Math.round(props.confidence * 100)}% sure)` : ''}: ${info.value.description}`);
</script>
