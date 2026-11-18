<template>
    <component :is="to ? NuxtLink : 'div'" :to="to" class="omni-kpi" :class="[tone, { attention, link: !!to }]">
        <span class="k">{{ label }}<abbr v-if="help" :title="help" aria-label="definition">ⓘ</abbr></span>
        <span v-if="loading" class="omni-skel" style="height:24px;width:66%"></span>
        <span v-else class="v" :class="{ sm: small }">{{ value }}</span>
        <span v-if="foot" class="foot">{{ foot }}</span>
    </component>
</template>

<script setup lang="ts">
import { NuxtLink } from '#components';

/** One measurement: what it is, its value, and a line that says what the value is out of or since when. */
defineProps<{
    label: string;
    value: string;
    /** good | bad | warn: colours the value. Left empty when the number is not good or bad in itself. */
    tone?: string;
    small?: boolean;
    foot?: string;
    help?: string;
    to?: string;
    loading?: boolean;
    attention?: boolean;
}>();
</script>
