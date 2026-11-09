<template>
    <span v-if="ms === null || ms === undefined" class="omni-muted">—</span>
    <time v-else class="omni-time" :datetime="utc(ms)" :title="`${at(ms, true)} · ${utc(ms)}`">
        <template v-if="mode === 'age'">{{ age(ms) }}</template>
        <template v-else-if="mode === 'absolute'">{{ at(ms, seconds) }}</template>
        <template v-else>{{ at(ms, seconds) }} <span class="rel">· {{ age(ms) }}</span></template>
    </time>
</template>

<script setup lang="ts">
import { useOmniTime } from '~/composables/useOmniscienceV3';

/**
 * One instant, shown in the reader's time lens with a relative age that keeps counting. The
 * hover text always carries the exact UTC instant.
 */
withDefaults(defineProps<{
    ms: number | null | undefined;
    mode?: 'both' | 'age' | 'absolute';
    seconds?: boolean;
}>(), { mode: 'both', seconds: false });

const { at, age, utc } = useOmniTime();
</script>

<style scoped>
.omni-time { white-space: nowrap; }
.rel { color: var(--ot-muted); }
</style>
