<template>
    <OmniBloxShell @refresh="load(true)">
        <div class="ot-pagehead">
            <div>
                <h1>Asset Library</h1>
                <p class="subtitle">{{ subtitle }}</p>
            </div>
        </div>

        <div class="ot-filterbar bx-filters">
            <div class="ot-search">
                <input v-model="query" class="ot-input" type="search" placeholder="Search models: pine tree, lava rock, street lamp…" aria-label="Search models" />
            </div>
            <div v-if="!searching" class="ot-segment sm" role="group" aria-label="Status">
                <button v-for="s in STATUSES" :key="s.id" type="button" :aria-pressed="status === s.id" @click="setStatus(s.id)">
                    {{ s.label }}<span v-if="count(s.id) !== null" class="count">{{ count(s.id) }}</span>
                </button>
            </div>
            <label v-else class="ot-check">
                <input v-model="placeableOnly" type="checkbox" />
                Placeable only
            </label>
        </div>

        <OmniTraderStateBlock v-if="error && !assets.length" kind="error" title="Could not load the library" :detail="error" />
        <div v-else-if="loaded && !assets.length" class="ot-card">
            <div class="body">
                <OmniTraderStateBlock :kind="searching || status ? 'filtered' : 'empty'"
                                      :title="searching ? `Nothing matches “${query}”` : 'No models here yet'"
                                      :detail="searching || status ? undefined : 'Switch the asset harvester on from the Studio page to start collecting free models.'" />
            </div>
        </div>
        <div v-else class="bx-assets">
            <template v-if="!loaded">
                <div v-for="n in 12" :key="n" class="ot-skel" style="height:220px"></div>
            </template>
            <OmniBloxAssetCard v-for="a in assets" :key="a.AssetId" :asset="a" :active="openId === a.AssetId" @open="openAsset" />
        </div>
        <div v-if="canLoadMore" class="more">
            <button class="ot-btn ghost" :disabled="loading" @click="load(false)">Load more</button>
        </div>

        <OmniBloxAssetDrawer :asset-id="openId" @close="openAsset(null)" />
    </OmniBloxShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fmtCount } from '~/composables/useOmniTumblr';
import { bloxGet, type BloxAsset, type BloxLibraryStats } from '~/composables/useOmniBlox';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Asset Library · OmniBlox' });

const route = useRoute();
const router = useRouter();

const STATUSES = [
    { id: '', label: 'All' },
    { id: 'labeled', label: 'Labelled' },
    { id: 'analyzed', label: 'Awaiting label' },
    { id: 'previewed', label: 'Previewed' },
    { id: 'discovered', label: 'Found' },
    { id: 'rejected', label: 'Rejected' },
] as const;
const PAGE = 60;

const query = ref(String(route.query.q ?? ''));
const status = ref(String(route.query.status ?? ''));
const placeableOnly = ref(route.query.placeable !== 'all');
const assets = ref<BloxAsset[]>([]);
const stats = ref<BloxLibraryStats | null>(null);
const loaded = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const canLoadMore = ref(false);
const openId = ref<number | null>(route.query.asset ? Number(route.query.asset) : null);

const searching = computed(() => query.value.trim().length > 0);
const subtitle = computed(() => {
    const s = stats.value;
    if (!s) return 'Loading…';
    return `${fmtCount(s.Total)} free models found · ${fmtCount(s.ByStatus.labeled ?? 0)} labelled · ${fmtCount(s.Placeable)} placeable`;
});

function count(id: string): number | null {
    const s = stats.value;
    if (!s) return null;
    return id === '' ? s.Total : (s.ByStatus[id] ?? 0);
}

let request = 0;
async function load(reset: boolean) {
    const mine = ++request;
    loading.value = true;
    const offset = reset ? 0 : assets.value.length;
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (searching.value) {
        params.set('q', query.value.trim());
        if (!placeableOnly.value) params.set('placeable', 'all');
    } else if (status.value) {
        params.set('status', status.value);
    }
    try {
        const result = await bloxGet<{ Assets: BloxAsset[]; Stats: BloxLibraryStats }>(`/omniblox/assets?${params}`);
        if (mine !== request) return;
        if (result.ok && result.data) {
            assets.value = reset ? result.data.Assets : [...assets.value, ...result.data.Assets];
            stats.value = result.data.Stats;
            canLoadMore.value = !searching.value && result.data.Assets.length === PAGE;
            error.value = null;
        } else {
            error.value = result.error;
        }
    } finally {
        if (mine === request) {
            loading.value = false;
            loaded.value = true;
        }
    }
}

function syncUrl() {
    void router.replace({
        query: {
            ...route.query,
            q: searching.value ? query.value.trim() : undefined,
            status: !searching.value && status.value ? status.value : undefined,
            placeable: searching.value && !placeableOnly.value ? 'all' : undefined,
            asset: openId.value !== null ? String(openId.value) : undefined,
        },
    });
}

function setStatus(id: string) {
    status.value = id;
    syncUrl();
    void load(true);
}

let debounce: ReturnType<typeof setTimeout> | null = null;
watch(query, () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => { syncUrl(); void load(true); }, 300);
});
watch(placeableOnly, () => { syncUrl(); void load(true); });

function openAsset(id: number | null) {
    openId.value = id;
    syncUrl();
}

onMounted(() => load(true));
</script>

<style scoped>
.bx-filters { display: flex; flex-wrap: wrap; gap: var(--ot-space-2); align-items: center; margin-bottom: var(--ot-gutter); }
.bx-filters .ot-search { flex: 1 1 280px; }
.bx-filters .ot-search .ot-input { width: 100%; }
.count { margin-left: 6px; padding: 0 6px; border-radius: 999px; background: var(--ot-surface-3); font-size: 11px; }
.bx-assets { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(168px, 46%), 1fr)); gap: var(--ot-space-3); }
.more { display: flex; justify-content: center; margin-top: var(--ot-gutter); }
</style>
