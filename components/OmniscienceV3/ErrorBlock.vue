<template>
    <OmniTraderStateBlock :kind="view.kind" :title="view.title" :detail="view.detail" :compact="compact">
        <button v-if="view.retry" class="ot-btn sm" type="button" @click="$emit('retry')">Try again</button>
    </OmniTraderStateBlock>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { OmniApiError } from '~/scripts/omniscience/api';

/**
 * Says why a panel has nothing to show, in terms of what happened: the engine is off, you may
 * not see this, it has not been computed yet, or it failed. Never a blank panel.
 */
const props = defineProps<{ error: OmniApiError; what?: string; compact?: boolean }>();
defineEmits<{ retry: [] }>();

const view = computed(() => {
    const what = props.what ?? 'This section';
    const e = props.error;
    switch (e.kind) {
        case 'disabled': return { kind: 'empty' as const, title: 'Omniscience v3 is switched off', detail: e.message, retry: true };
        case 'starting': return { kind: 'empty' as const, title: 'Omniscience v3 is starting', detail: e.message, retry: true };
        case 'failed': return { kind: 'error' as const, title: 'Omniscience v3 failed to start', detail: e.message, retry: true };
        case 'unavailable': return { kind: 'error' as const, title: `${what} is not available`, detail: e.message, retry: true };
        case 'forbidden': return { kind: 'nopermission' as const, title: `You do not have access to ${what.toLowerCase()}`, detail: e.message, retry: false };
        case 'not_built': return { kind: 'empty' as const, title: 'Not computed yet', detail: e.message, retry: true };
        case 'not_found': return { kind: 'empty' as const, title: 'Not found', detail: e.message, retry: false };
        case 'bad_request': return { kind: 'error' as const, title: 'The request was not accepted', detail: e.message, retry: false };
        case 'network': return { kind: 'error' as const, title: 'The server could not be reached', detail: e.message, retry: true };
        default: return { kind: 'error' as const, title: `${what} could not load`, detail: e.message, retry: true };
    }
});
</script>
