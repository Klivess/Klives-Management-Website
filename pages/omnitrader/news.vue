<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <h1><span class="code">N</span>News</h1>
            <div class="ot-actions">
                <div class="ot-segment sm"><button v-for="c in CATS" :key="c" type="button" :aria-pressed="state.category === c" @click="state.category = c">{{ c }}</button></div>
                <input v-model="query" class="ot-input sm" placeholder="Search…" @keydown.enter="state.q = query" />
                <input v-model="symbolInput" class="ot-input sm mono sym" placeholder="Symbol" @keydown.enter="state.symbol = symbolInput.toUpperCase()" />
                <button class="ot-btn sm" :disabled="loading" @click="load">Refresh</button>
            </div>
        </div>
        <div class="ot-toolbar">
            <span class="summary"><b>{{ filtered.length }}</b> headlines · {{ sources.length }} sources</span>
            <span class="grow"></span>
            <button v-for="s in sources" :key="s" class="ot-chip" type="button" :aria-pressed="!hidden.includes(s)" @click="toggleSource(s)">{{ s }}</button>
        </div>
        <OtPanel title="Headlines" flush :loading="loading && !items.length" :error="error" :empty="!filtered.length">
            <ul class="news">
                <li v-for="n in filtered" :key="n.Url">
                    <span class="t mono" :title="fmtDateTime(n.PublishedUtc)">{{ fmtAge(n.PublishedUtc) }}</span>
                    <span class="body">
                        <a :href="n.Url" target="_blank" rel="noopener">{{ n.Title }}</a>
                        <span v-if="n.Summary" class="sum">{{ n.Summary }}</span>
                    </span>
                    <span class="meta">
                        <button v-for="s in n.Symbols ?? []" :key="s" class="ot-chip" type="button" @click="openSymbol(s)">{{ s }}</button>
                        <span class="src">{{ n.Source }}</span>
                    </span>
                </li>
            </ul>
        </OtPanel>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useUrlState } from '~/composables/useOmniTrader';
import { fmtAge, fmtDateTime, tGet, usePersisted, useTicker } from '~/composables/useTerminal';

definePageMeta({ layout: 'navbar' });

const CATS = ['all', 'markets', 'crypto', 'macro', 'regulatory'];
const router = useRouter();
const { state } = useUrlState({ category: 'all', q: '', symbol: '' });
const query = ref(state.q);
const symbolInput = ref(state.symbol);
const items = ref<any[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const hidden = usePersisted<string[]>('news.hiddenSources', []);

async function load() {
    loading.value = true;
    try {
        items.value = await tGet<any[]>('/terminal/news', {
            category: state.category === 'all' ? undefined : state.category, q: state.q || undefined, symbol: state.symbol || undefined, limit: 200,
        }) ?? [];
        error.value = null;
    } catch (e: any) { error.value = e?.message ?? 'failed'; }
    finally { loading.value = false; }
}
useTicker(load, 120_000);
watch(() => [state.category, state.q, state.symbol], () => void load());

const sources = computed(() => [...new Set(items.value.map(i => i.Source))].sort());
const filtered = computed(() => items.value.filter(i => !hidden.value.includes(i.Source)));
function toggleSource(s: string) { hidden.value = hidden.value.includes(s) ? hidden.value.filter(x => x !== s) : [...hidden.value, s]; }
function openSymbol(s: string) { void router.push(`/omnitrader/instrument?symbol=${encodeURIComponent(s)}&tab=CN`); }
</script>

<style scoped>
.sym { width: 100px; text-transform: uppercase; }
.news { list-style: none; margin: 0; padding: 0; }
.news li { display: grid; grid-template-columns: 40px 1fr auto; gap: 10px; padding: 5px 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.035); font-size: 12.5px; align-items: baseline; }
.news li:hover { background: var(--ot-surface-3); }
.news .t { color: var(--ot-muted); font-size: 10.5px; }
.news .body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.news a { color: var(--ot-text); }
.news a:hover { color: var(--ot-accent); }
.news .sum { color: var(--ot-muted); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.news .meta { display: flex; gap: 4px; align-items: center; }
.news .src { color: var(--ot-muted); font-size: 10.5px; white-space: nowrap; }
</style>
