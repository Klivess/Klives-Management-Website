<template>
    <!--
      Empty, emptied by a filter, failed and not allowed are four different facts. Telling them apart is the
      difference between "there is nothing" and "we could not find out whether there is anything".
    -->
    <div class="omni-state" :class="[kind, { compact }]" role="status">
        <span class="glyph" aria-hidden="true">{{ glyph }}</span>
        <strong>{{ title || fallbackTitle }}</strong>
        <p v-if="detail">{{ detail }}</p>
        <div v-if="$slots.default" class="actions"><slot /></div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
    kind?: 'empty' | 'filtered' | 'error' | 'nopermission' | 'ok';
    title?: string;
    detail?: string;
    compact?: boolean;
}>(), { kind: 'empty' });

const glyph = computed(() => ({ empty: '○', filtered: '⌕', error: '⚠', nopermission: '🔒', ok: '✓' })[props.kind]);
const fallbackTitle = computed(() => ({
    empty: 'Nothing here yet', filtered: 'Nothing matches', error: 'This could not load', nopermission: 'You cannot see this', ok: 'All clear',
})[props.kind]);
</script>
