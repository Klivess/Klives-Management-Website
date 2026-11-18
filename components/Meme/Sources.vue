<template>
  <section class="msx-card msx-card--flush" aria-label="Sources" data-testid="msx-sources">
    <div class="msx-toolbar">
      <label class="msx-field">
        <MemeIcon name="search" />
        <input ref="searchInput" v-model="text" placeholder="Find a source or niche" aria-label="Find a source" data-testid="sources-search" @keydown.esc="text = ''" />
        <span v-if="!text" class="msx-kbd">/</span>
      </label>
      <div class="msx-seg" role="group" aria-label="State" data-testid="sources-states">
        <button class="msx-seg__opt" type="button" :aria-pressed="state === 'all'" @click="c.setSourceState('all')">All <span class="msx-seg__count">{{ registered.length }}</span></button>
        <button v-for="s in stateCounts" :key="s.id" class="msx-seg__opt" type="button" :aria-pressed="state === s.id" :data-tone="s.tone" :title="s.hint" @click="c.setSourceState(s.id)">
          <span class="msx-seg__dot"></span>{{ s.label }} <span class="msx-seg__count">{{ s.count }}</span>
        </button>
      </div>
      <div class="msx-toolbar__end">
        <label class="msx-check" title="Also list accounts that are no longer sources but still have reels in the library"><input v-model="showRemoved" type="checkbox" />Removed ({{ removedCount }})</label>
        <button v-if="c.allowed.value.manage" class="msx-btn msx-btn--sm" type="button" @click="$emit('add')"><MemeIcon name="user-plus" />Add source</button>
      </div>
    </div>

    <div v-if="selected.size" class="msx-bulk" data-testid="sources-bulk">
      <b>{{ selected.size }} selected</b>
      <button v-if="c.allowed.value.manage" class="msx-btn msx-btn--xs" type="button" :disabled="!!c.pending.bulk" @click="bulk(true)"><MemeIcon name="pause" />Pause</button>
      <button v-if="c.allowed.value.manage" class="msx-btn msx-btn--xs" type="button" :disabled="!!c.pending.bulk" @click="bulk(false)"><MemeIcon name="play" />Resume</button>
      <button v-if="c.allowed.value.run" class="msx-btn msx-btn--xs" type="button" @click="scrapeSelected"><MemeIcon name="refresh" />Scrape now</button>
      <button class="msx-btn msx-btn--xs msx-btn--ghost" type="button" @click="filterSelected"><MemeIcon name="filter" />Show only these</button>
      <button class="msx-btn msx-btn--xs msx-btn--ghost" type="button" style="margin-left: auto" @click="selected = new Set()">Clear</button>
    </div>

    <div class="msx-table-wrap">
      <table class="msx-table">
        <thead>
          <tr>
            <th class="msx-table__check"><input type="checkbox" class="msx-check" :checked="allChecked" :indeterminate="someChecked" aria-label="Select every listed source" style="accent-color: #ff7a9e" @change="toggleAll" /></th>
            <th><button type="button" :data-active="sort === 'name'" @click="sortBy('name')">Source<SortMark k="name" /></button></th>
            <th><button type="button" :data-active="sort === 'state'" @click="sortBy('state')">State<SortMark k="state" /></button></th>
            <th class="msx-r"><button type="button" :data-active="sort === 'reels'" :title="windowTitle" @click="sortBy('reels')">Reels<SortMark k="reels" /></button></th>
            <th class="msx-hide-sm">Trend</th>
            <th class="msx-r msx-hide-sm"><button type="button" :data-active="sort === 'total'" @click="sortBy('total')">Ever<SortMark k="total" /></button></th>
            <th class="msx-r msx-hide-md"><button type="button" :data-active="sort === 'views'" @click="sortBy('views')">Median views<SortMark k="views" /></button></th>
            <th class="msx-hide-sm"><button type="button" :data-active="sort === 'last'" title="When a reel from this account was last saved" @click="sortBy('last')">Last new reel<SortMark k="last" /></button></th>
            <th class="msx-hide-md"><button type="button" :data-active="sort === 'posted'" title="When the account last posted a reel MemeScraper has" @click="sortBy('posted')">Last post<SortMark k="posted" /></button></th>
            <th class="msx-hide-sm"><button type="button" :data-active="sort === 'next'" @click="sortBy('next')">Next scrape<SortMark k="next" /></button></th>
            <th class="msx-r msx-hide-md"><button type="button" :data-active="sort === 'followers'" @click="sortBy('followers')">Followers<SortMark k="followers" /></button></th>
            <th class="msx-hide-md">Niches</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in rows" :key="s.Username" :data-selected="selected.has(s.Username) || undefined" :data-open="c.sheetUser.value?.toLowerCase() === s.Username.toLowerCase() || undefined"
              :data-testid="`source-${s.Username}`" tabindex="0" @click="c.openSource(s.Username)" @keydown.enter="c.openSource(s.Username)">
            <td class="msx-table__check" @click.stop><input type="checkbox" :checked="selected.has(s.Username)" :disabled="!s.Registered" :aria-label="`Select @${s.Username}`" style="accent-color: #ff7a9e" @change="toggle(s.Username)" /></td>
            <td>
              <span class="msx-who">
                <span class="msx-avatar" :style="{ '--hue': msAvatarHue(s.Username) }">{{ s.Username.replace(/[^a-z0-9]/gi, '').slice(0, 1) || '?' }}</span>
                <span style="min-width: 0">
                  <span class="msx-who__name">@{{ s.Username }}</span>
                  <span class="msx-who__sub" style="display: block">{{ s.FullName || (s.Registered ? '' : 'no longer a source') }}</span>
                </span>
              </span>
            </td>
            <td class="msx-wrap" style="min-width: 120px" :title="s.StateReason"><span class="msx-state" :data-tone="msStateOf(s.State).tone">{{ msStateOf(s.State).label }}</span></td>
            <td class="msx-r"><b>{{ msInt(s.Downloaded) }}</b></td>
            <td class="msx-hide-sm"><span class="msx-sparkcell"><MemeSpark :points="s.Spark" bars :colour="s.Downloaded ? '#ff6b9a' : '#4b4959'" :label="`@${s.Username} per bucket`" /></span></td>
            <td class="msx-r msx-hide-sm msx-dim">{{ msInt(s.TotalReels) }}</td>
            <td class="msx-r msx-hide-md">{{ msCompact(s.MedianViews) }}</td>
            <td class="msx-hide-sm" :title="msStamp(s.LastDownloadUtc)">{{ msAgo(s.LastDownloadUtc, c.now.value, 'never') }}</td>
            <td class="msx-hide-md" :class="{ 'msx-dim': !s.LastPostedUtc }" :title="msStamp(s.LastPostedUtc)">
              {{ s.LastPostedUtc ? msAgo(s.LastPostedUtc, c.now.value) : '—' }}
              <MemeIcon v-if="dormant(s)" name="moon" style="color: var(--msx-info); margin-left: 3px" title="Has not posted for a month or more" />
            </td>
            <td class="msx-hide-sm" :class="{ 'msx-dim': !s.DownloadReels }">{{ s.DownloadReels ? msDue(s.NextScrapeDueUtc, c.now.value) : s.Registered ? 'paused' : '—' }}</td>
            <td class="msx-r msx-hide-md msx-dim">{{ s.Followers ? msCompact(s.Followers) : '—' }}</td>
            <td class="msx-hide-md"><span v-for="n in s.Niches.slice(0, 2)" :key="n" class="msx-chip" style="margin-right: 4px">{{ n }}</span><span v-if="s.Niches.length > 2" class="msx-faint">+{{ s.Niches.length - 2 }}</span></td>
          </tr>
        </tbody>
      </table>
      <div v-if="!rows.length" class="msx-empty">
        <MemeIcon name="search" />
        <b>{{ c.dashboard.value ? 'No source matches' : 'Loading sources…' }}</b>
        <button v-if="text || state !== 'all'" class="msx-btn msx-btn--sm" type="button" @click="text = ''; c.setSourceState('all')">Show every source</button>
      </div>
    </div>
    <div class="msx-pager">
      <span>{{ rows.length }} of {{ registered.length }} sources<template v-if="c.dashboard.value"> · reels counted {{ windowTitle }}</template></span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, watch } from 'vue';
import { useMemeConsole } from '~/composables/useMemeConsole';
import MemeIcon from '~/components/Meme/Icon.vue';
import {
  MS_STATES, msAgo, msAvatarHue, msCompact, msDayRange, msDaysSince, msDue, msInt, msMatchesSource, msSortSources, msStamp, msStateOf,
  type MsSource, type MsSourceSort, type MsSourceState,
} from '~/scripts/memeConsole';

defineEmits<{ add: [] }>();
const c = useMemeConsole();
const text = ref('');
const showRemoved = ref(false);
const selected = ref(new Set<string>());
const searchInput = ref<HTMLInputElement | null>(null);

const state = computed(() => c.sourceState.value ?? 'all');
const sort = computed(() => c.prefs.value.sourceSort);
const all = computed(() => c.dashboard.value?.Sources ?? []);
const registered = computed(() => all.value.filter(s => s.Registered));
const removedCount = computed(() => all.value.length - registered.value.length);

const stateCounts = computed(() => {
  const counts = new Map<MsSourceState, number>();
  for (const s of (showRemoved.value ? all.value : registered.value)) counts.set(s.State, (counts.get(s.State) ?? 0) + 1);
  return (Object.keys(MS_STATES) as MsSourceState[])
    .filter(id => counts.get(id) || state.value === id)
    .map(id => ({ id, ...MS_STATES[id], count: counts.get(id) ?? 0 }));
});

const rows = computed(() => {
  const base = (showRemoved.value || state.value === 'removed' ? all.value : registered.value)
    .filter(s => (state.value === 'all' || s.State === state.value) && msMatchesSource(s, text.value));
  return msSortSources(base, sort.value, c.prefs.value.sourceDesc);
});

const windowTitle = computed(() => {
  const r = c.dashboard.value?.Range;
  return r ? (r.AllTime ? 'all time' : `in ${msDayRange(r.From, r.To)}`) : '';
});

function sortBy(key: MsSourceSort) {
  if (c.prefs.value.sourceSort === key) c.prefs.value = { ...c.prefs.value, sourceDesc: !c.prefs.value.sourceDesc };
  else c.prefs.value = { ...c.prefs.value, sourceSort: key, sourceDesc: false };
}

const SortMark = defineComponent({
  props: { k: { type: String, required: true } },
  setup(props) {
    return () => (sort.value === props.k ? h(MemeIcon, { name: c.prefs.value.sourceDesc ? 'arrow-up' : 'arrow-down', style: 'font-size: 10px' }) : null);
  },
});

const dormant = (s: MsSource) => s.State === 'quiet' && (msDaysSince(s.LastPostedUtc, c.now.value) ?? 0) >= 30;

function toggle(name: string) {
  const next = new Set(selected.value);
  if (next.has(name)) next.delete(name); else next.add(name);
  selected.value = next;
}
const selectable = computed(() => rows.value.filter(r => r.Registered));
const allChecked = computed(() => selectable.value.length > 0 && selectable.value.every(r => selected.value.has(r.Username)));
const someChecked = computed(() => !allChecked.value && selectable.value.some(r => selected.value.has(r.Username)));
function toggleAll() {
  selected.value = allChecked.value ? new Set() : new Set(selectable.value.map(r => r.Username));
}

async function bulk(pause: boolean) {
  const names = [...selected.value];
  await c.setPaused(names, pause);
  selected.value = new Set();
}

async function scrapeSelected() {
  const list = registered.value.filter(s => selected.value.has(s.Username));
  for (const s of list) await c.scrapeNow(s);
  selected.value = new Set();
}

function filterSelected() {
  c.setSources([...selected.value]);
  selected.value = new Set();
  c.setView('overview');
}

// Selections that are no longer listed (filtered away, removed) are dropped.
watch(rows, list => {
  const names = new Set(list.map(r => r.Username));
  const kept = [...selected.value].filter(n => names.has(n));
  if (kept.length !== selected.value.size) selected.value = new Set(kept);
});

defineExpose({ focus: () => searchInput.value?.focus() });
</script>
