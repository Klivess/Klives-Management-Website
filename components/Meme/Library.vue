<template>
  <section class="msx-card msx-card--flush" aria-label="Library" data-testid="msx-library">
    <div class="msx-toolbar">
      <label class="msx-field" style="max-width: 380px">
        <MemeIcon name="search" />
        <input ref="searchInput" v-model="text" placeholder="Search captions, sources, codes" aria-label="Search the library" data-testid="library-search" @keydown.esc="text = ''" />
        <span v-if="!text" class="msx-kbd">/</span>
        <button v-else class="msx-iconbtn msx-iconbtn--sm" type="button" aria-label="Clear the search" @click="text = ''"><MemeIcon name="x" /></button>
      </label>
      <select class="msx-select" aria-label="Sort by" data-testid="library-sort" :value="c.prefs.value.libSort" @change="setSort(($event.target as HTMLSelectElement).value)">
        <option v-for="o in MEME_LIBRARY_SORTS" :key="o.id" :value="o.id">{{ o.label }}</option>
      </select>
      <button class="msx-iconbtn" type="button" :title="c.prefs.value.libAsc ? 'Ascending (click for descending)' : 'Descending (click for ascending)'" :aria-label="c.prefs.value.libAsc ? 'Sort descending' : 'Sort ascending'"
              @click="c.prefs.value = { ...c.prefs.value, libAsc: !c.prefs.value.libAsc }">
        <MemeIcon :name="c.prefs.value.libAsc ? 'arrow-up' : 'arrow-down'" />
      </button>
      <div class="msx-seg" role="group" aria-label="Minimum views">
        <button v-for="m in MIN_VIEWS" :key="m.label" class="msx-seg__opt" type="button" :aria-pressed="c.library.minViews === m.value" @click="c.library.minViews = m.value">{{ m.label }}</button>
      </div>
      <select class="msx-select" aria-label="Found via" :value="c.library.via ?? ''" @change="c.library.via = ($event.target as HTMLSelectElement).value || null">
        <option value="">Any provider</option>
        <option value="inflact">inflact</option>
        <option value="instagram">Instagram</option>
      </select>
      <div class="msx-toolbar__end">
        <div class="msx-seg" role="group" aria-label="Layout">
          <button class="msx-seg__opt" type="button" title="Grid" aria-label="Grid" :aria-pressed="c.prefs.value.libMode === 'grid'" @click="c.prefs.value.libMode = 'grid'"><MemeIcon name="grid" /></button>
          <button class="msx-seg__opt" type="button" title="List" aria-label="List" :aria-pressed="c.prefs.value.libMode === 'list'" @click="c.prefs.value.libMode = 'list'"><MemeIcon name="list" /></button>
        </div>
        <button class="msx-btn msx-btn--sm msx-btn--ghost" type="button" title="Every matching reel as a spreadsheet" data-testid="library-csv" @click="c.exportCsv()"><MemeIcon name="download" />CSV</button>
      </div>
    </div>

    <div class="msx-pager" style="padding-top: 0">
      <span data-testid="library-count">
        <template v-if="c.library.key">{{ msInt(c.library.filtered) }} reel{{ c.library.filtered === 1 ? '' : 's' }}<template v-if="c.library.filtered !== c.library.total"> of {{ msInt(c.library.total) }}</template></template>
        <template v-else>Loading…</template>
        <template v-if="scopeText"> · {{ scopeText }}</template>
      </span>
    </div>

    <div class="msx-card__body" style="padding-top: 0">
      <div v-if="c.library.error" class="msx-banner" data-tone="crit"><MemeIcon name="alert" /><span>{{ c.library.error }}</span><div class="msx-banner__actions"><button class="msx-btn msx-btn--sm" type="button" @click="c.loadLibrary(true)">Retry</button></div></div>

      <div v-if="c.prefs.value.libMode === 'grid'" class="msx-libgrid" data-testid="library-grid">
        <MemeReelCard v-for="r in c.library.rows" :key="r.PostID" :reel="r" @open="open" />
        <template v-if="c.library.loading && !c.library.rows.length">
          <div v-for="i in 12" :key="`s${i}`"><div class="msx-skel" style="aspect-ratio: 9 / 14"></div></div>
        </template>
      </div>

      <div v-else class="msx-table-wrap">
        <table class="msx-table" data-testid="library-list">
          <thead><tr><th></th><th>Source</th><th>Caption</th><th class="msx-r">Views</th><th class="msx-r">Likes</th><th class="msx-r msx-hide-sm">Eng.</th><th class="msx-hide-sm">Posted</th><th class="msx-hide-md">Saved</th><th class="msx-hide-md">Via</th></tr></thead>
          <tbody>
            <tr v-for="r in c.library.rows" :key="r.PostID" tabindex="0" @click="open(r.PostID)" @keydown.enter="open(r.PostID)">
              <td style="width: 44px"><span style="position: relative; display: block; width: 30px; height: 44px; border-radius: 6px; overflow: hidden"><MemeThumb :post-id="r.PostID" /></span></td>
              <td><b>@{{ r.Owner }}</b></td>
              <td class="msx-dim" style="max-width: 360px; overflow: hidden; text-overflow: ellipsis">{{ r.Description || '—' }}</td>
              <td class="msx-r"><b>{{ msCompact(r.Views) }}</b></td>
              <td class="msx-r">{{ msCompact(r.Likes) }}</td>
              <td class="msx-r msx-hide-sm">{{ msPct(r.EngagementPct, 1) }}</td>
              <td class="msx-hide-sm" :title="msStamp(r.PostedUtc)">{{ msAgo(r.PostedUtc, c.now.value, '—') }}</td>
              <td class="msx-hide-md" :title="msStamp(r.DownloadedUtc)">{{ msAgo(r.DownloadedUtc, c.now.value, '—') }}</td>
              <td class="msx-hide-md msx-dim">{{ msProviderLabel(r.Via) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="c.library.key && !c.library.loading && !c.library.rows.length && !c.library.error" class="msx-empty">
        <MemeIcon name="film" /><b>No reel matches</b>
        <button v-if="text || c.library.minViews || c.library.via || c.hasFilters.value" class="msx-btn msx-btn--sm" type="button" @click="clearAll">Clear the filters</button>
      </div>

      <div ref="sentinel" style="height: 1px"></div>
      <div v-if="c.library.rows.length && !c.library.done" style="display: flex; justify-content: center; padding-top: 14px">
        <button class="msx-btn msx-btn--sm" type="button" :disabled="c.library.loading" data-testid="library-more" @click="c.loadLibrary(false)">
          <MemeIcon v-if="c.library.loading" name="refresh" class="msx-spin" />{{ c.library.loading ? 'Loading…' : `Load more (${msInt(c.library.filtered - c.library.rows.length)} left)` }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { MEME_LIBRARY_SORTS, useMemeConsole } from '~/composables/useMemeConsole';
import { msAgo, msCompact, msDayRange, msInt, msPct, msProviderLabel, msStamp } from '~/scripts/memeConsole';

const c = useMemeConsole();
const route = useRoute();
const MIN_VIEWS = [{ label: 'Any', value: null }, { label: '10k+', value: 10_000 }, { label: '100k+', value: 100_000 }, { label: '1M+', value: 1_000_000 }] as const;

const searchInput = ref<HTMLInputElement | null>(null);
const sentinel = ref<HTMLElement | null>(null);
const text = ref(c.search.value);
let debounce: number | null = null;
watch(text, value => {
  if (debounce) window.clearTimeout(debounce);
  debounce = window.setTimeout(() => c.setSearch(value), 280);
});
watch(c.search, value => { if (value !== text.value.trim()) text.value = value; });

function setSort(id: string) {
  // Most sorts read best biggest/newest first; "Source" reads A→Z.
  c.prefs.value = { ...c.prefs.value, libSort: id, libAsc: id === 'owner' };
}

const scopeText = computed(() => {
  const parts: string[] = [];
  const r = c.dashboard.value?.Range;
  // The library covers everything ever saved unless a window was picked in the address bar.
  if (c.custom.value && r) parts.push(`saved ${msDayRange(r.From, r.To)}`);
  else if (route.query.range && c.preset.value !== 'all') parts.push(`saved in the last ${c.preset.value.toUpperCase()}`);
  else parts.push('everything ever saved');
  if (c.filterSources.value.length) parts.push(c.filterSources.value.map(s => `@${s}`).join(', '));
  if (c.filterNiche.value) parts.push(c.filterNiche.value);
  return parts.join(' · ');
});

function open(id: string) {
  void c.openReel(id, c.library.rows.map(r => r.PostID));
}

function clearAll() {
  text.value = '';
  c.setSearch('');
  c.library.minViews = null;
  c.library.via = null;
  c.clearFilters();
}

// Load the next page as the end of the list comes near.
let observer: IntersectionObserver | null = null;
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined' || !sentinel.value) return;
  observer = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting) && c.library.rows.length && !c.library.done && !c.library.loading) void c.loadLibrary(false);
  }, { rootMargin: '600px 0px' });
  observer.observe(sentinel.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  if (debounce) window.clearTimeout(debounce);
});

defineExpose({ focus: () => searchInput.value?.focus() });
</script>
