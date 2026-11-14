<template>
  <component :is="clickable ? 'button' : 'div'" class="pfx-kpi" :class="{ 'pfx-kpi--button': clickable }" :data-testid="testid" v-bind="clickable ? { type: 'button' } : {}" @click="clickable && emit('open')">
    <span class="pfx-kpi__label"><PeopleIcon :name="icon" />{{ label }}<span v-if="state" :data-tone="tone">{{ state }}</span></span>
    <span v-if="value == null" class="pfx-skel" style="height: 26px; width: 60%; margin-top: 6px; display: block"></span>
    <span v-else class="pfx-kpi__value" :data-tone="tone && tone !== 'ok' ? tone : undefined">{{ value }}<span v-if="unit" class="pfx-kpi__unit">{{ unit }}</span></span>
    <span class="pfx-kpi__sub"><slot name="sub" /></span>
    <span v-if="$slots.default" class="pfx-kpi__viz"><slot /></span>
  </component>
</template>

<script setup lang="ts">
/** One figure: a label, a big number, a line of context, and room for a spark or a mix bar. */
withDefaults(defineProps<{ label: string; icon: string; value: string | null; unit?: string; tone?: string; state?: string; clickable?: boolean; testid?: string }>(), {
  unit: '', tone: '', state: '', clickable: false, testid: undefined,
});
const emit = defineEmits<{ open: [] }>();
</script>
