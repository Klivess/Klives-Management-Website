<template>
    <div v-if="items.length" class="ot-tape" role="marquee" aria-label="Ticker tape">
        <div class="track">
            <span v-for="(q, i) in [...items, ...items]" :key="`${q.Symbol}-${i}`" class="item" @click="open(q.Symbol)">
                <span class="s">{{ label(q) }}</span>
                <span class="p">{{ fmtPrice(q.Price) }}</span>
                <span :class="tone(q.ChangePct)">{{ fmtChg(q.ChangePct) }}</span>
            </span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { fmtChg, fmtPrice, shortSymbol, tGet, tone, useTicker, type QuoteRow } from '~/composables/useTerminal';

const props = withDefaults(defineProps<{ symbols: string[] }>(), {});
const router = useRouter();
const items = ref<QuoteRow[]>([]);

const label = (q: QuoteRow) => shortSymbol(q.Symbol).replace(/USDT$/, '');

useTicker(async () => {
    if (!props.symbols.length) return;
    try { items.value = (await tGet<QuoteRow[]>('/terminal/quotes', { symbols: props.symbols.join(',') })).filter(q => q.Price); }
    catch { /* the tape is decoration; keep the last good set */ }
}, 20000);

function open(symbol: string) { void router.push(`/omnitrader/instrument?symbol=${encodeURIComponent(symbol)}`); }
</script>
