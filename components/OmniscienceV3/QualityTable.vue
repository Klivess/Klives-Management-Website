<template>
    <table class="omni-table compact" :data-testid="testid">
        <thead><tr><th>Measured over</th><th>What</th><th class="num">Value</th><th class="num">Cases</th><th>Prompt</th></tr></thead>
        <tbody>
            <tr v-for="(m, i) in metrics" :key="i">
                <td>{{ omniHumanise(m.scope) }}</td>
                <td>{{ omniHumanise(m.metric) }}</td>
                <td class="num">{{ value(m) }}<span v-if="m.ciLow != null && m.ciHigh != null" class="omni-muted"> [{{ pct(m.ciLow) }}–{{ pct(m.ciHigh) }}]</span></td>
                <td class="num">{{ omniCount(m.n) }}</td>
                <td class="omni-muted">{{ m.promptVersion ?? '—' }}</td>
            </tr>
        </tbody>
    </table>
</template>

<script setup lang="ts">
import type { QualityMetric } from '~/scripts/omniscience/contracts';
import { omniCount } from '~/scripts/omniscience/format';
import { omniHumanise } from '~/scripts/omniscience/findings';

/** Measurements with their intervals. A share (0 to 1) reads as a percentage; anything else as the number it is. */
withDefaults(defineProps<{ metrics: QualityMetric[]; testid?: string }>(), { testid: 'quality-table' });

function pct(v: number): string { return `${Math.round(v * 1000) / 10}%`; }
function value(m: QualityMetric): string {
    if (m.value === null || m.value === undefined) return '—';
    return m.value >= 0 && m.value <= 1 ? pct(m.value) : String(Math.round(m.value * 100) / 100);
}
</script>
