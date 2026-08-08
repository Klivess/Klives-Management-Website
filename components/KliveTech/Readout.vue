<template>
    <!--
      The signature surface. A live value belongs in a recessed display with its unit,
      its sequence and its age attached — a bare figure gives no way to tell a current
      reading from one frozen ten minutes ago.
    -->
    <component :is="clickable ? 'button' : 'div'" class="kt-readout" :class="{ clickable }"
               :type="clickable ? 'button' : undefined" @click="clickable && $emit('open')">
        <span class="rlabel">
            <span class="id">{{ entry.streamID }}</span>
            <KliveTechLamp :tone="lampTone" :word="entry.enabled ? '' : 'off'"
                           :pulse="pulse && entry.enabled"
                           :title="entry.enabled ? 'Streaming' : 'Disabled on the gadget'" />
        </span>

        <span class="rvalue" :class="{ none: displayValue === NO_VALUE }">
            {{ displayValue }}<span v-if="unit" class="unit">{{ unit }}</span>
        </span>

        <span class="rmeta">
            <span>{{ entry.mode }}</span>
            <span v-if="entry.mode !== 'manual'">{{ fmtMs(entry.intervalMs) }}</span>
            <span v-if="entry.latestSequence !== null">#{{ entry.latestSequence }}</span>
            <span :class="{ 'kt-stale': isStale }">{{ fmtAgo(entry.latestReceivedUtc, now) }}</span>
            <span v-if="entry.droppedEvents > 0" class="kt-chip fault">
                {{ entry.droppedEvents }} dropped
            </span>
        </span>

        <KliveTechSparkline v-if="spark.length > 1" :values="spark" :width="140" :height="26"
                            :stroke="traceStroke" :label="`${entry.streamID} trend`" />
        <slot />
    </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
    fmtAgo, fmtMs, fmtStreamValue, ageMs, NO_VALUE, STALE_AFTER_MS,
    type StreamableEntry, type Tone,
} from '~/scripts/kliveTech';

const props = withDefaults(defineProps<{
    entry: StreamableEntry;
    spark?: number[];
    now?: number;
    clickable?: boolean;
    pulse?: boolean;
    unit?: string;
    traceStroke?: string;
}>(), {
    spark: () => [],
    now: () => Date.now(),
    traceStroke: 'var(--kt-accent)',
});

defineEmits<{ open: [] }>();

const displayValue = computed(() =>
    props.entry.valueType === 'binary'
        ? (props.entry.latestBinaryBytes ? `${props.entry.latestBinaryBytes} B` : NO_VALUE)
        : fmtStreamValue(props.entry.latestValue, props.entry.valueType));

// A stream is only late if it promised a cadence. A manual stream is quiet by design,
// and an onChange stream is quiet because nothing changed.
const isStale = computed(() => {
    if (props.entry.mode !== 'periodic' || !props.entry.enabled) return false;
    const age = ageMs(props.entry.latestReceivedUtc, props.now);
    return age !== null && age > Math.max(STALE_AFTER_MS, props.entry.intervalMs * 4);
});

const lampTone = computed<Tone>(() => {
    if (!props.entry.gadgetOnline) return 'idle';
    if (!props.entry.enabled) return 'idle';
    if (props.entry.droppedEvents > 0) return 'warn';
    return isStale.value ? 'warn' : 'ok';
});
</script>
