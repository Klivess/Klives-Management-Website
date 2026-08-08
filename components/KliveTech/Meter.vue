<template>
    <div class="kt-meter" :class="[tone, { indeterminate }]">
        <div v-if="label || value" class="mhead">
            <span class="label">{{ label }}</span>
            <span v-if="value" class="value">{{ value }}</span>
        </div>
        <div class="track" role="progressbar" :aria-label="label"
             :aria-valuenow="indeterminate ? undefined : clamped"
             aria-valuemin="0" aria-valuemax="100">
            <div class="fill" :style="{ width: indeterminate ? undefined : `${clamped}%` }"></div>
            <div v-if="limitPercent !== undefined" class="limit"
                 :style="{ left: `${Math.min(100, Math.max(0, limitPercent))}%` }"></div>
        </div>
        <div v-if="foot" class="foot">{{ foot }}</div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Tone } from '~/scripts/kliveTech';

const props = withDefaults(defineProps<{
    percent?: number;
    label?: string;
    value?: string;
    foot?: string;
    tone?: Tone;
    limitPercent?: number;
    /**
     * A compile reports no total size, so its progress is unknowable. Showing "0 %"
     * for a job that is working hard is worse than showing that it is working.
     */
    indeterminate?: boolean;
}>(), { percent: 0, tone: '' });

const clamped = computed(() => Math.min(100, Math.max(0, Math.round(props.percent))));
</script>
