<template>
    <!--
      A figure with no unit and no qualifier is not a measurement. Every tile carries
      what it counted and out of what, so "3" never has to be guessed at.
    -->
    <div class="kt-stat" :class="tone">
        <span class="k">
            {{ label }}
            <abbr v-if="help" :title="help" aria-label="what this counts">ⓘ</abbr>
        </span>
        <span v-if="loading" class="kt-skel" style="height:26px;width:64%"></span>
        <span v-else class="v">
            {{ value }}<span v-if="unit" class="unit">{{ unit }}</span>
        </span>
        <span v-if="foot" class="foot">{{ foot }}</span>
    </div>
</template>

<script setup lang="ts">
import type { Tone } from '~/scripts/kliveTech';

withDefaults(defineProps<{
    label: string;
    value: string;
    unit?: string;
    foot?: string;
    help?: string;
    tone?: Tone;
    loading?: boolean;
}>(), { tone: '' });
</script>
