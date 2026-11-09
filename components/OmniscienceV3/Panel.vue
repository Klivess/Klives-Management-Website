<template>
    <OmniTraderCard :title="title" :subtitle="subtitle" :flush="flush && !blocking" :loading="loading && !blocking"
                    :empty="!blocking && empty" :empty-kind="emptyKind" :empty-title="emptyTitle" :empty-text="emptyText"
                    :stale="stale" :stale-reason="staleReason" :footnote="footnote" :attention="attention">
        <template v-if="$slots.controls" #controls><slot name="controls" /></template>
        <OmniscienceV3ErrorBlock v-if="blocking && error" :error="error" :what="what ?? title" @retry="$emit('retry')" />
        <slot v-else />
        <template v-if="$slots.footer" #footer><slot name="footer" /></template>
    </OmniTraderCard>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { OmniApiError } from '~/scripts/omniscience/api';

/**
 * A card bound to one request. It always says which of four things is true: loading, nothing
 * to show (and why), failed (and why), or showing data — possibly stale, in which case the
 * last good data stays up with a notice.
 */
const props = withDefaults(defineProps<{
    title?: string;
    subtitle?: string;
    footnote?: string;
    /** Names the content in error text ("Jobs could not load"); defaults to the title. */
    what?: string;
    loading?: boolean;
    error?: OmniApiError | null;
    /** Data from an earlier request is on screen, so an error is a notice rather than a wall. */
    hasData?: boolean;
    empty?: boolean;
    emptyKind?: 'empty' | 'filtered' | 'nopermission' | 'ok';
    emptyTitle?: string;
    emptyText?: string;
    flush?: boolean;
    attention?: boolean;
}>(), { emptyKind: 'empty', emptyTitle: 'Nothing to show' });

defineEmits<{ retry: [] }>();

const blocking = computed(() => !!props.error && !props.hasData);
const stale = computed(() => !!props.error && !!props.hasData);
const staleReason = computed(() => (props.error ? `Showing the last answer; refreshing failed: ${props.error.message}` : undefined));
</script>
