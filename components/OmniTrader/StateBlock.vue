<template>
    <!--
      Every non-success state is its own state. A dataset that is genuinely empty,
      one that filters emptied, one that failed, and one you may not see are four
      different facts, and telling them apart is the difference between "there are
      no breaks" and "we could not find out whether there are breaks".
    -->
    <div class="ot-state" :class="[kind, { compact }]" role="status">
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

const glyph = computed(() => ({
    empty: '○', filtered: '⌕', error: '⚠', nopermission: '🔒', ok: '✓',
}[props.kind]));

const fallbackTitle = computed(() => ({
    empty: 'Nothing here yet',
    filtered: 'No results for these filters',
    error: 'Could not load',
    nopermission: 'You cannot see this',
    ok: 'All clear',
}[props.kind]));
</script>

<style scoped>
.actions { margin-top: var(--ot-space-2); display: flex; gap: var(--ot-space-2); }
</style>
