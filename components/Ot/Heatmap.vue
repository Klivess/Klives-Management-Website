<template>
    <div class="othm">
        <table>
            <thead v-if="cols.length">
                <tr>
                    <th class="corner">{{ corner }}</th>
                    <th v-for="c in cols" :key="String(c)" class="mono">{{ c }}</th>
                    <th v-if="rowTotals" class="mono tot">{{ totalLabel }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(r, ri) in rows" :key="String(r)">
                    <th class="mono rl">{{ r }}</th>
                    <td v-for="(c, ci) in cols" :key="String(c)" class="mono" :style="{ background: bg(values[ri]?.[ci]) }"
                        :class="{ click: clickable, best: best && best[0] === ri && best[1] === ci }" :title="`${r} · ${c}: ${text(values[ri]?.[ci])}`"
                        @click="clickable && $emit('cell', ri, ci)">
                        {{ text(values[ri]?.[ci]) }}
                    </td>
                    <td v-if="rowTotals" class="mono tot" :style="{ background: bg(rowTotals[ri]) }">{{ text(rowTotals[ri]) }}</td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { heat, heatSeq } from '~/composables/useTerminal';

const props = withDefaults(defineProps<{
    rows: (string | number)[];
    cols: (string | number)[];
    values: (number | null | undefined)[][];
    /** Diverging magnitude that saturates; omit to auto-scale. 'seq' for 0..1 sequential (pass fractions). */
    scale?: number | 'seq';
    decimals?: number;
    suffix?: string;
    corner?: string;
    rowTotals?: (number | null)[];
    totalLabel?: string;
    clickable?: boolean;
    highlightMax?: boolean;
}>(), { decimals: 1, suffix: '', corner: '', totalLabel: 'Σ' });

defineEmits<{ cell: [row: number, col: number] }>();

const auto = computed(() => {
    const flat = props.values.flat().filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).map(Math.abs).sort((a, b) => a - b);
    return flat.length ? flat[Math.floor(flat.length * 0.9)] || flat[flat.length - 1] || 1 : 1;
});

const best = computed<[number, number] | null>(() => {
    if (!props.highlightMax) return null;
    let b: [number, number] | null = null;
    let bv = -Infinity;
    props.values.forEach((row, ri) => row.forEach((v, ci) => { if (typeof v === 'number' && v > bv) { bv = v; b = [ri, ci]; } }));
    return b;
});

function bg(v: number | null | undefined) {
    if (v === null || v === undefined || !Number.isFinite(v)) return undefined;
    if (props.scale === 'seq') return heatSeq(v);
    return heat(v, typeof props.scale === 'number' ? props.scale : auto.value);
}

function text(v: number | null | undefined) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '';
    return `${v.toFixed(props.decimals)}${props.suffix}`;
}
</script>

<style scoped>
.othm { overflow: auto; }
table { border-collapse: separate; border-spacing: 1px; font-size: 11px; }
th { font-weight: 600; color: var(--ot-muted); padding: 2px 6px; white-space: nowrap; font-size: 10.5px; }
th.rl { text-align: right; }
th.corner { text-align: left; }
td { min-width: 46px; height: 22px; text-align: right; padding: 0 6px; color: var(--ot-text); background: rgba(255, 255, 255, 0.02); white-space: nowrap; }
td.tot, th.tot { border-left: 1px solid var(--ot-line-strong); font-weight: 600; }
td.click { cursor: pointer; }
td.click:hover { outline: 1px solid var(--ot-accent); }
td.best { outline: 1px solid var(--ot-accent); }
</style>
