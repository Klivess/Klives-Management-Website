<template>
    <!--
      Why a panel has nothing in it is not one condition but several, and they call for
      different responses: "no gadget has ever connected" needs an explanation of what
      to plug in, "your filters excluded everything" needs a filter reset, and "nothing
      is wrong" needs to look like good news rather than a failure.
    -->
    <div class="kt-state" :class="[kind, { compact }]" role="status">
        <span class="glyph" aria-hidden="true">{{ glyph }}</span>
        <span class="title">{{ title || fallbackTitle }}</span>
        <span v-if="detail" class="detail">{{ detail }}</span>
        <slot />
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export type StateKind =
    | 'empty' | 'filtered' | 'error' | 'nopermission' | 'ok' | 'offline' | 'nohardware';

const props = withDefaults(defineProps<{
    kind?: StateKind;
    title?: string;
    detail?: string;
    compact?: boolean;
}>(), { kind: 'empty' });

const GLYPHS: Record<StateKind, string> = {
    empty: '○',
    filtered: '⌕',
    error: '⚠',
    nopermission: '🔒',
    ok: '✓',
    offline: '⏻',
    nohardware: '⚙',
};

const TITLES: Record<StateKind, string> = {
    empty: 'Nothing here yet',
    filtered: 'No results for these filters',
    error: 'Could not load',
    nopermission: 'You cannot see this',
    ok: 'All clear',
    offline: 'This gadget is offline',
    nohardware: 'No gadget is connected',
};

const glyph = computed(() => GLYPHS[props.kind]);
const fallbackTitle = computed(() => TITLES[props.kind]);
</script>
