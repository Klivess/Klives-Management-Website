<template>
    <ol class="bx-track" :class="{ compact, stopped: stage === 'Abandoned', retired: stage === 'Sunset' }" :aria-label="`Stage: ${stage}`">
        <li v-for="(s, i) in BLOX_STAGES" :key="s" :class="state(i)" :aria-current="i === current ? 'step' : undefined">
            <span class="pip" aria-hidden="true"></span>
            <span class="name">{{ s }}</span>
        </li>
    </ol>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { BLOX_STAGES, type BloxStage } from '~/composables/useOmniBlox';

const props = withDefaults(defineProps<{
    stage: BloxStage;
    /** Where an abandoned game stopped (the furthest stage it worked on). */
    reached?: BloxStage | null;
    compact?: boolean;
}>(), { reached: null, compact: false });

const current = computed(() => {
    if (props.stage === 'Sunset') return BLOX_STAGES.length; // went through everything
    if (props.stage === 'Abandoned') return Math.max(0, BLOX_STAGES.indexOf(props.reached ?? 'Research'));
    return BLOX_STAGES.indexOf(props.stage);
});

function state(i: number) {
    if (i < current.value) return 'done';
    if (i === current.value) return props.stage === 'Abandoned' ? 'halt' : 'now';
    return '';
}
</script>

<style scoped>
.bx-track { list-style: none; margin: 0; padding: 0; display: flex; gap: 2px; font-size: 11px; }
.bx-track li { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 4px; color: var(--ot-muted); }
.pip { height: 4px; border-radius: 2px; background: var(--ot-surface-3); }
.done .pip { background: var(--ot-positive); opacity: 0.55; }
.now .pip { background: var(--ot-accent); box-shadow: 0 0 8px rgba(109, 220, 79, 0.45); }
.now { color: var(--ot-text); font-weight: 600; }
.halt .pip { background: var(--ot-negative); }
.halt { color: var(--ot-negative); }
.retired .done .pip { background: var(--ot-muted); }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.compact .name { font-size: 10.5px; }
</style>
