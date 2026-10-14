<template>
    <div class="otq-wrap">
    <table class="ot-table otq">
        <thead>
            <tr>
                <th>{{ nameHeader }}</th>
                <th class="num">Last</th>
                <th class="num">Net</th>
                <th class="num">%</th>
                <th v-if="range" class="num rng">Day range</th>
                <th v-if="yearly" class="num">52w</th>
            </tr>
        </thead>
        <tbody>
            <tr v-for="q in rows" :key="q.Symbol" class="clickable" @click="open(q.Symbol)">
                <td class="nm">
                    <span class="sym mono">{{ shortSymbol(q.Symbol) }}</span>
                    <span v-if="showName && q.Name && q.Name !== q.Symbol" class="sub">{{ q.Name }}</span>
                </td>
                <td class="num">
                    {{ fmtPrice(q.Price, decimals) }}
                    <span v-if="q.MarketState && q.MarketState !== 'REGULAR' && !isCrypto(q.Symbol)" class="state" :title="q.MarketState">{{ stateGlyph(q.MarketState) }}</span>
                </td>
                <td class="num" :class="tone(q.Change)">{{ fmtSignedN(q.Change, decimalsFor(q)) }}</td>
                <td class="num" :class="tone(q.ChangePct)" :style="{ background: heat(q.ChangePct, heatScale) }">{{ fmtChg(q.ChangePct) }}</td>
                <td v-if="range" class="num rng">
                    <span class="bar" :title="`${fmtPrice(q.DayLow)} – ${fmtPrice(q.DayHigh)}`">
                        <span class="dot" :style="{ left: `${rangePos(q)}%` }"></span>
                    </span>
                </td>
                <td v-if="yearly" class="num" :class="tone(q.Change52wPct)">{{ fmtChg(q.Change52wPct, 1) }}</td>
            </tr>
            <tr v-if="!rows.length"><td :colspan="4 + (range ? 1 : 0) + (yearly ? 1 : 0)" class="muted empty">—</td></tr>
        </tbody>
    </table>
    </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { fmtChg, fmtPrice, fmtSignedN, heat, isCrypto, shortSymbol, tone, type QuoteRow } from '~/composables/useTerminal';

withDefaults(defineProps<{
    rows: QuoteRow[];
    nameHeader?: string;
    showName?: boolean;
    range?: boolean;
    yearly?: boolean;
    decimals?: number;
    heatScale?: number;
}>(), { nameHeader: 'Security', showName: true, range: true, yearly: false, heatScale: 3 });

const router = useRouter();
function decimalsFor(q: QuoteRow) { const p = Math.abs(q.Price ?? 0); return p >= 1000 ? 1 : p >= 10 ? 2 : 4; }
function rangePos(q: QuoteRow) {
    const lo = q.DayLow, hi = q.DayHigh, p = q.Price;
    if (!lo || !hi || !p || hi <= lo) return 50;
    return Math.max(0, Math.min(100, ((p - lo) / (hi - lo)) * 100));
}
function stateGlyph(s: string) { return s.startsWith('PRE') ? 'ᴾ' : s.startsWith('POST') ? 'ᴬ' : '●'; }
function open(symbol: string) { void router.push(`/omnitrader/instrument?symbol=${encodeURIComponent(symbol)}`); }
</script>

<style scoped>
.otq-wrap { overflow-x: auto; container-type: inline-size; }
.otq .sym { font-weight: 600; }
.otq td.nm .sub { display: inline-block; max-width: 120px; margin-left: 6px; font-size: 10.5px; color: var(--ot-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: bottom; }
.otq td.nm { white-space: nowrap; }
/* Narrow boards keep every number column: shorter descriptions, no range bar. */
@container (max-width: 440px) {
    .otq-wrap .otq td.nm .sub { max-width: 64px; }
    .otq-wrap .otq .rng { display: none; }
}
.state { font-size: 9px; color: var(--ot-muted); margin-left: 2px; }
.rng { width: 70px; }
.bar { position: relative; display: inline-block; width: 56px; height: 4px; background: rgba(255, 255, 255, 0.08); border-radius: 2px; vertical-align: middle; }
.dot { position: absolute; top: -2px; width: 3px; height: 8px; margin-left: -1px; background: var(--ot-accent); border-radius: 1px; }
.empty { text-align: center; }
</style>
