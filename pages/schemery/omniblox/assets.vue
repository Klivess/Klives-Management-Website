<template>
  <ObxShell crumb="Asset library" :commands="commands" @refresh="load(true)">
    <section class="obx-card" aria-label="Asset library" data-testid="obx-assets-page">
      <header class="obx-card__head">
        <h1 class="obx-card__title" style="font-size: 15px"><ObxIcon name="cube" />Asset library</h1>
        <span class="obx-card__meta">{{ subtitle }}</span>
        <div class="obx-card__tools">
          <div class="obx-seg" role="group" aria-label="Density">
            <button class="obx-seg__opt" :aria-pressed="!dense" aria-label="Large tiles" @click="setDense(false)"><ObxIcon name="grid" /></button>
            <button class="obx-seg__opt" :aria-pressed="dense" aria-label="Small tiles" @click="setDense(true)"><ObxIcon name="rows" /></button>
          </div>
        </div>
      </header>
      <div class="obx-card__body obx-stack" style="gap: 10px">
        <div class="obx-toolbar">
          <label class="obx-field"><ObxIcon name="search" /><input ref="searchBox" v-model="query" type="search" placeholder="Search models: pine tree, lava rock, street lamp…" aria-label="Search models" data-testid="obx-assets-search" /><span class="obx-kbd">/</span></label>
          <div v-if="!searching" class="obx-seg" role="group" aria-label="Status">
            <button v-for="s in STATUSES" :key="s.id" class="obx-seg__opt" :aria-pressed="status === s.id" :data-testid="`status-${s.id || 'all'}`" @click="setStatus(s.id)">
              {{ s.label }}<span v-if="count(s.id) !== null" class="obx-seg__count">{{ obxCount(count(s.id)) }}</span>
            </button>
          </div>
          <label v-else class="obx-check"><input v-model="placeableOnly" type="checkbox" /> Placeable only</label>
        </div>

        <p v-if="slow" class="obx-banner" data-tone="info" role="status" style="margin: 0">
          <ObxIcon class="obx-banner__glyph" name="clock" />
          <span class="obx-banner__text"><span>Still reading the library ({{ Math.round(elapsed / 1000) }} s). A server from before 13 Nov 2026 sorts every model for this list; it answers quickly once updated.</span></span>
        </p>
        <div v-if="error && !assets.length" class="obx-banner" data-tone="crit"><ObxIcon class="obx-banner__glyph" name="octagon" /><span class="obx-banner__text"><strong>Could not load the library</strong><span>{{ error }}</span></span></div>
        <div v-else-if="loaded && !assets.length" class="obx-empty" style="min-height: 160px">
          <ObxIcon name="cube" />
          <span v-if="searching"><b>Nothing matches “{{ query }}”.</b></span>
          <span v-else><b>No models here yet.</b> Switch the asset harvester on to start collecting free models.</span>
        </div>
        <div v-else class="obx-assets" :data-dense="dense || undefined" data-testid="obx-assets">
          <template v-if="!loaded"><div v-for="n in 18" :key="n" class="obx-skel" style="aspect-ratio: 1 / 1.25"></div></template>
          <button v-for="a in assets" :key="a.AssetId" class="obx-asset" :aria-pressed="openId === a.AssetId" :data-dim="a.Status === 'rejected' || a.Status === 'failed' || undefined" :data-testid="`asset-${a.AssetId}`" @click="openAsset(a.AssetId)">
            <ObxImg :path="a.HasThumbnail ? bloxAssetImagePath(a.AssetId) : null" ratio="1 / 1" :alt="a.Name" fallback="No thumbnail" />
            <span class="obx-asset__name" :title="a.Name">{{ a.Name }}</span>
            <span class="obx-asset__what">{{ a.Label?.What || a.StatusReason || statusText(a.Status) }}</span>
            <span class="obx-asset__chips">
              <span v-if="a.Label" class="obx-quality" :data-tone="a.Label.Quality >= 7 ? 'ok' : a.Label.Quality >= 4 ? 'warn' : 'crit'" :title="`Quality ${a.Label.Quality}/10`">{{ a.Label.Quality }}</span>
              <span v-if="a.Label?.Category" class="obx-chip">{{ a.Label.Category }}</span>
              <span v-if="a.Status !== 'labeled'" class="obx-chip" :data-tone="statusTone(a.Status)">{{ statusText(a.Status) }}</span>
              <span v-if="a.TimesUsed" style="color: var(--obx-accent)">used {{ a.TimesUsed }}×</span>
              <span v-if="a.ScriptFlags.length" style="color: var(--obx-warn)" :title="a.ScriptFlags.join('; ')">⚠ {{ a.ScriptsRemoved }} stripped</span>
            </span>
          </button>
        </div>
        <div v-if="canLoadMore" style="display: flex; justify-content: center">
          <button class="obx-btn obx-btn--ghost" :disabled="loading" @click="load(false)">{{ loading ? 'Loading…' : 'Load more' }}</button>
        </div>
      </div>
    </section>

    <ObxAssetSheet :asset-id="openId" @close="openAsset(null)" />
  </ObxShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { bloxAssetImagePath, bloxGet, type BloxAsset, type BloxLibraryStats } from '~/composables/useOmniBlox';
import { obxCount, type ObxCommand, type ObxTone } from '~/scripts/omniblox/console';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Asset library · OmniBlox' });

const route = useRoute();
const router = useRouter();

const STATUSES = [
  { id: '', label: 'All' },
  { id: 'labeled', label: 'Labelled' },
  { id: 'analyzed', label: 'Awaiting label' },
  { id: 'previewed', label: 'Previewed' },
  { id: 'discovered', label: 'Found' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'failed', label: 'Failed' },
] as const;
const STATUS: Record<string, [string, ObxTone]> = {
  discovered: ['found', 'neutral'], previewed: ['previewed', 'neutral'], analyzed: ['awaiting label', 'info'],
  labeled: ['labelled', 'ok'], rejected: ['rejected', 'crit'], failed: ['failed', 'crit'],
};
const statusText = (s: string) => STATUS[s]?.[0] ?? s;
const statusTone = (s: string) => STATUS[s]?.[1] ?? 'neutral';
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
const searchBox = ref<HTMLInputElement | null>(null);

const dense = ref(false);
function setDense(on: boolean) {
  dense.value = on;
  try { localStorage.setItem('obx:assets-dense', on ? '1' : '0'); } catch { /* per-browser nicety only */ }
}

const searching = computed(() => query.value.trim().length > 0);
const subtitle = computed(() => {
  const s = stats.value;
  if (!s) return '';
  if (s.Counting) return 'counting…';
  return `${obxCount(s.Total)} found · ${obxCount(s.ByStatus.labeled ?? 0)} labelled · ${obxCount(s.Placeable)} placeable`;
});
function count(id: string): number | null {
  const s = stats.value;
  if (!s || s.Counting) return null;
  return id === '' ? s.Total : (s.ByStatus[id] ?? 0);
}

// A slow list says so after a few seconds instead of showing skeletons for minutes (the old server sorted every model).
const elapsed = ref(0);
const slow = computed(() => loading.value && elapsed.value > 4000);
let ticker: ReturnType<typeof setInterval> | null = null;

let request = 0;
async function load(reset: boolean) {
  const mine = ++request;
  loading.value = true;
  elapsed.value = 0;
  const started = Date.now();
  if (ticker) clearInterval(ticker);
  ticker = setInterval(() => { elapsed.value = Date.now() - started; }, 1000);
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
      if (ticker) { clearInterval(ticker); ticker = null; }
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

const commands = computed<ObxCommand[]>(() => STATUSES.map(s => ({ id: `status-${s.id || 'all'}`, group: 'Actions', title: `Show ${s.label.toLowerCase()} models`, icon: 'cube', run: () => { query.value = ''; setStatus(s.id); } })));

function onKey(event: KeyboardEvent) {
  const el = event.target as HTMLElement | null;
  if (event.key === '/' && !(el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) && !document.querySelector('.obx-layer [role="dialog"]')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    searchBox.value?.focus();
  }
}
onMounted(() => {
  try { dense.value = localStorage.getItem('obx:assets-dense') === '1'; } catch { /* default */ }
  window.addEventListener('keydown', onKey, { capture: true });
  void load(true);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, { capture: true });
  if (ticker) clearInterval(ticker);
});
</script>
