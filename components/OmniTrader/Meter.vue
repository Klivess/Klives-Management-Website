<template>
    <!--
      A bullet meter, not a gauge: value against its limit on a straight common
      scale, with the warning threshold marked. The percentage is stated in text
      as well as drawn, because the bar is the summary and the number is the fact.
    -->
    <div class="ot-meter" :class="tone" role="group" :aria-label="`${label}: ${percentText} of limit`">
        <div class="row">
            <span class="lbl">{{ label }}</span>
            <span class="val" :class="valueTone">{{ value }}</span>
        </div>
        <div class="track">
            <div class="fill" :style="{ width: barWidth }"></div>
            <div v-if="warnAt < 100" class="marker" :style="{ left: `${warnAt}%` }"
                 :title="`Escalates at ${warnAt}%`"></div>
        </div>
        <div class="foot">
            <span>{{ percentText }} of limit</span>
            <span>{{ limit }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { utilisationTone } from '~/composables/useOmniTrader';

const props = withDefaults(defineProps<{
    label: string;
    /** Formatted current value, e.g. "£1,240.00". */
    value: string;
    /** Formatted limit, e.g. "limit £5,000". */
    limit: string;
    percent: number | null | undefined;
    warnAt?: number;
    valueTone?: string;
}>(), { warnAt: 70 });

const pct = computed(() => Math.max(0, props.percent ?? 0));
const tone = computed(() => utilisationTone(pct.value));
const barWidth = computed(() => `${Math.min(100, Math.max(1.5, pct.value))}%`);
const percentText = computed(() =>
    props.percent === null || props.percent === undefined ? 'unknown' : `${pct.value.toFixed(0)}%`);
</script>
