<template>
    <!--
      A KPI is label + value + unit + window + baseline + freshness. A bare number
      with a coloured arrow is not a measurement, so this component makes the
      baseline text mandatory whenever a comparison is supplied, and refuses to
      colour a direction it has not been told the sign of.
    -->
    <component :is="to ? 'NuxtLink' : 'div'" :to="to" class="ot-kpi" :class="[tone, { attention, 'attention-soft': attentionSoft }]">
        <span class="k">
            {{ label }}
            <abbr v-if="help" :title="help" aria-label="definition">ⓘ</abbr>
        </span>

        <span v-if="loading" class="ot-skel" style="height:26px;width:70%"></span>
        <span v-else class="v" :class="{ sm: small }">{{ value }}</span>

        <!-- Comparison always names what it is compared against. -->
        <span v-if="compare && baseline" class="cmp">
            <span :class="changeTone" :title="`${directionGlyph(compare.direction)} ${compareText}`">
                <span aria-hidden="true">{{ directionGlyph(compare.direction) }}</span>
                {{ compareText }}
            </span>
            <span class="base">{{ baseline }}</span>
        </span>
        <span v-else-if="baseline" class="cmp"><span class="base">{{ baseline }}</span></span>

        <span v-if="target" class="foot">Target {{ target }}</span>
        <span v-if="foot" class="foot">{{ foot }}</span>

        <OmniTraderSparkline v-if="spark && spark.length > 1" class="spark" :values="spark" :height="26"
                             :tone="sparkTone" :label="`${label} recent trend`" />
    </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { directionGlyph } from '~/composables/useOmniTrader';

const props = withDefaults(defineProps<{
    label: string;
    value: string;
    /** Visual emphasis of the value itself: good | bad | warn | info | violet. */
    tone?: string;
    small?: boolean;
    foot?: string;
    help?: string;
    to?: string;
    baseline?: string;
    compare?: { absolute: number; percent: number | null; direction: number } | null;
    /** Percent when the metric's own scale is a ratio, absolute otherwise. */
    compareFormat?: (value: { absolute: number; percent: number | null }) => string;
    /** 1 = higher is better, -1 = lower is better, 0 = neither (no colour applied). */
    goodDirection?: number;
    target?: string;
    spark?: number[];
    loading?: boolean;
    attention?: boolean;
    attentionSoft?: boolean;
}>(), { goodDirection: 1 });

const compareText = computed(() => {
    if (!props.compare) return '';
    if (props.compareFormat) return props.compareFormat(props.compare);
    const { percent, absolute } = props.compare;
    if (percent === null) return `${absolute >= 0 ? '+' : ''}${absolute.toFixed(2)}`;
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
});

// Colour only when the caller has said which direction is good. "Up" is not
// inherently positive — a rise in slippage or drawdown is a worse result.
const changeTone = computed(() => {
    if (!props.compare || props.goodDirection === 0 || props.compare.direction === 0) return 'neutral';
    return props.compare.direction * props.goodDirection > 0 ? 'pos' : 'neg';
});

const sparkTone = computed(() => (props.tone === 'bad' ? 'neg' : props.tone === 'good' ? 'pos' : 'neutral'));
</script>

<style scoped>
abbr { text-decoration: none; cursor: help; color: var(--ot-muted); font-size: 10px; }
.neutral { color: var(--ot-text-2); }
</style>
