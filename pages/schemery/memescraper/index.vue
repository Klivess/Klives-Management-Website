<template>
  <div ref="root" class="msx" :data-size="size" data-testid="msx-root">
    <!-- ── bar ── -->
    <header class="msx-bar">
      <div class="msx-bar__id">
        <span class="msx-bar__mark" :data-tone="verdict.tone" :title="verdict.title"><MemeIcon name="film" /></span>
        <h1 class="msx-bar__title">MemeScraper</h1>
        <span class="msx-bar__sub" data-testid="msx-subline">{{ subline }}</span>
      </div>

      <button class="msx-search" type="button" aria-label="Find a source, a reel or an action" aria-keyshortcuts="Control+K" data-testid="msx-search" @click="paletteOpen = true">
        <MemeIcon name="search" />
        <span class="msx-search__text">Find a source, a reel, an action…</span>
        <span class="msx-kbd">Ctrl</span><span class="msx-kbd">K</span>
      </button>

      <span class="msx-bar__spacer"></span>

      <div class="msx-bar__actions">
        <button class="msx-live" type="button" :data-state="c.linkState.value" :data-tone="liveTone" :data-busy="c.busy.value || undefined" :title="liveTitle" :aria-label="liveTitle"
                :style="{ '--sweep': c.busy.value || c.starting.value ? '4s' : '30s' }" data-testid="msx-live" @click="c.setLive(!c.prefs.value.live)">
          <span class="msx-live__dot"></span>
          <span class="msx-live__word">{{ liveWord }}</span>
          <span v-if="c.linkState.value === 'live'" :key="c.healthAt.value" class="msx-live__sweep"></span>
        </button>
        <button class="msx-iconbtn" type="button" title="Refresh now (R)" aria-label="Refresh now" aria-keyshortcuts="R" data-testid="msx-refresh" @click="c.refreshAll()">
          <MemeIcon name="refresh" :class="{ 'msx-spin': c.dashboardLoading.value }" />
        </button>
        <button v-if="c.allowed.value.run" class="msx-btn msx-btn--sm" type="button" :disabled="!!c.pending['scrape:all'] || c.starting.value" data-testid="msx-scrape-all" @click="confirmScrapeAll = true">
          <MemeIcon name="play" /><span class="msx-bar__label">{{ (c.health.value?.ScrapeQueued ?? 0) > 0 ? `${c.health.value!.ScrapeQueued} queued` : 'Scrape all' }}</span>
        </button>
        <button v-if="c.allowed.value.manage" class="msx-btn msx-btn--sm msx-btn--primary" type="button" aria-label="Add source" data-testid="msx-add" @click="openAdd()"><MemeIcon name="plus" /><span class="msx-bar__label">Add source</span></button>
      </div>
    </header>

    <!-- The layout already provides the page's <main>. -->
    <div class="msx-main" :class="{ 'msx-enter': firstPaint }">
      <div v-if="!c.allowed.value.health" class="msx-card"><div class="msx-empty"><MemeIcon name="lock" /><b>MemeScraper is not part of your access</b>Ask Klives for MemeScraper permissions.</div></div>

      <template v-else>
        <nav class="msx-nav" aria-label="MemeScraper">
          <div class="msx-tabs" role="tablist" aria-label="Views">
            <button v-for="t in tabs" :key="t.id" class="msx-tab" type="button" role="tab" :aria-selected="c.view.value === t.id" :title="`${t.label} (${t.key})`" :data-testid="`tab-${t.id}`" @click="c.setView(t.id)">
              <MemeIcon :name="t.icon" /><span class="msx-tab__label">{{ t.label }}</span>
              <span v-if="t.count" class="msx-tab__count" :data-tone="t.tone || undefined">{{ t.count }}</span>
            </button>
          </div>

          <div class="msx-window">
            <span v-for="s in c.filterSources.value" :key="s" class="msx-chip msx-chip--filter">@{{ s }}<button class="msx-iconbtn msx-iconbtn--sm" type="button" :aria-label="`Stop filtering to @${s}`" @click="c.toggleSource(s)"><MemeIcon name="x" /></button></span>
            <span v-if="c.filterNiche.value" class="msx-chip msx-chip--filter">#{{ c.filterNiche.value }}<button class="msx-iconbtn msx-iconbtn--sm" type="button" aria-label="Stop filtering to this niche" @click="c.setNiche(null)"><MemeIcon name="x" /></button></span>
            <button v-if="c.hasFilters.value" class="msx-btn msx-btn--xs msx-btn--ghost" type="button" @click="c.clearFilters()">Clear filters</button>

            <span class="msx-window__summary" data-testid="msx-window">{{ windowText }}</span>
            <div class="msx-seg" role="group" aria-label="Window">
              <button v-for="p in MS_RANGES" :key="p.key" class="msx-seg__opt" type="button" :title="p.title" :aria-pressed="c.shownPreset.value === p.key" @click="pickPreset(p.key)">{{ p.label }}</button>
              <button class="msx-seg__opt" type="button" title="Pick dates" aria-label="Pick dates" :aria-pressed="c.custom.value || showDates" data-testid="msx-dates" @click="showDates = !showDates"><MemeIcon name="calendar" /></button>
            </div>
            <span v-if="showDates || c.custom.value" class="msx-window__dates">
              <input id="msx-from" class="msx-input" type="date" :value="fromValue" :max="today" aria-label="From" @change="pickDates(($event.target as HTMLInputElement).value, toValue)" />
              –
              <input id="msx-to" class="msx-input" type="date" :value="toValue" :max="today" aria-label="To" @change="pickDates(fromValue, ($event.target as HTMLInputElement).value)" />
            </span>
          </div>
        </nav>

        <div v-if="c.linkState.value === 'offline'" class="msx-banner" data-tone="crit" role="alert">
          <MemeIcon name="alert" />
          <span><b>MemeScraper is not answering.</b> {{ c.healthError.value }}</span>
          <div class="msx-banner__actions"><button class="msx-btn msx-btn--sm" type="button" @click="c.refreshAll()">Retry</button></div>
        </div>
        <div v-else-if="c.starting.value" class="msx-banner" data-tone="info" role="status" data-testid="msx-starting">
          <MemeIcon name="refresh" class="msx-spin" />
          <span><b>MemeScraper is starting.</b> {{ startingText }}</span>
        </div>
        <div v-else-if="c.dashboardError.value && !c.dashboard.value" class="msx-banner" data-tone="warn" role="alert">
          <MemeIcon name="alert" />
          <span><b>The figures could not load.</b> {{ c.dashboardError.value }}</span>
          <div class="msx-banner__actions"><button class="msx-btn msx-btn--sm" type="button" @click="c.refreshAll()">Retry</button></div>
        </div>
        <div v-if="c.healthMissing.value" class="msx-banner" data-tone="info"><MemeIcon name="info" /><span>This server runs an older MemeScraper without health reporting; scraper status is unavailable.</span></div>

        <MemeOverview v-if="c.view.value === 'overview'" @act="act" @library="openLibrary" />
        <MemeSources v-else-if="c.view.value === 'sources'" ref="sourcesView" @add="openAdd()" />
        <template v-else-if="c.view.value === 'library'">
          <MemeLibrary v-if="c.allowed.value.read" ref="libraryView" />
          <div v-else class="msx-card"><div class="msx-empty"><MemeIcon name="lock" /><b>The library needs memescraper.sources.read</b></div></div>
        </template>
        <MemeActivity v-else @check="openCheck" />
      </template>
    </div>

    <MemeSourceSheet @remove="s => (removeFor = s)" />
    <MemeReelViewer />
    <MemePalette :open="paletteOpen" :commands="commandsFor" @close="paletteOpen = false" />

    <!-- ── add a source ── -->
    <MemeDialog :open="addOpen" title="Add an Instagram source" sub="MemeScraper looks the account up (a minute or two), then scrapes its reels every day." icon="user-plus" tone="ok" testid="msx-add-dialog" @close="addOpen = false">
      <label class="msx-field" :style="{ borderColor: addProblem && addName ? 'var(--msx-crit)' : undefined }">
        <span class="msx-faint">@</span>
        <input v-model="addName" placeholder="username or profile link" data-autofocus data-testid="add-username" @keydown.enter.prevent="submitAdd" />
      </label>
      <p v-if="addProblem && addName" class="msx-note" style="color: #ffb6bd">{{ addProblem }}</p>
      <div class="msx-niches">
        <span v-for="n in addNiches" :key="n" class="msx-niche">{{ n }}<button type="button" :aria-label="`Remove ${n}`" @click="addNiches = addNiches.filter(x => x !== n)"><MemeIcon name="x" /></button></span>
        <input v-model="addNiche" class="msx-input" list="msx-add-niches" placeholder="Niche (Enter to add)" @keydown.enter.prevent="pushNiche" />
        <datalist id="msx-add-niches"><option v-for="n in (c.dashboard.value?.Options.Niches ?? []).filter(x => !addNiches.includes(x))" :key="n" :value="n" /></datalist>
      </div>
      <label class="msx-check"><input v-model="addReels" type="checkbox" />Download its reels</label>
      <template #actions>
        <button class="msx-btn msx-btn--ghost" type="button" @click="addOpen = false">Cancel</button>
        <button class="msx-btn msx-btn--primary" type="button" :disabled="!!addProblem || !!c.pending.add" data-testid="add-submit" @click="submitAdd"><MemeIcon name="plus" />Add @{{ cleanName || '…' }}</button>
      </template>
    </MemeDialog>

    <!-- ── remove a source ── -->
    <MemeDialog :open="!!removeFor" :title="`Remove @${removeFor?.Username ?? ''}?`" sub="It stops being scraped. Its reels stay in the library unless you delete them too." icon="trash" tone="crit" testid="msx-remove-dialog" @close="removeFor = null">
      <label class="msx-check"><input v-model="removeReels" type="checkbox" data-testid="remove-reels" />Also delete its {{ msInt(removeFor?.TotalReels ?? 0) }} downloaded reel{{ removeFor?.TotalReels === 1 ? '' : 's' }} (cannot be undone)</label>
      <template #actions>
        <button class="msx-btn msx-btn--ghost" type="button" @click="removeFor = null">Keep it</button>
        <button class="msx-btn msx-btn--solid-danger" type="button" data-testid="remove-confirm" @click="confirmRemove"><MemeIcon name="trash" />Remove</button>
      </template>
    </MemeDialog>

    <!-- ── pause several ── -->
    <MemeDialog :open="!!pauseList" :title="`Pause ${pauseList?.length ?? 0} source${pauseList?.length === 1 ? '' : 's'}?`" sub="They stop being scraped. Nothing is deleted, and you can resume each one from its sheet." icon="pause" tone="violet" testid="msx-pause-dialog" @close="pauseList = null">
      <div class="msx-niches"><span v-for="n in pauseList ?? []" :key="n" class="msx-chip">@{{ n }}</span></div>
      <template #actions>
        <button class="msx-btn msx-btn--ghost" type="button" @click="pauseList = null">Cancel</button>
        <button class="msx-btn msx-btn--violet" type="button" :disabled="!!c.pending.bulk" data-testid="pause-confirm" @click="confirmPause"><MemeIcon name="pause" />Pause {{ pauseList?.length ?? 0 }}</button>
      </template>
    </MemeDialog>

    <!-- ── scrape everything ── -->
    <MemeDialog :open="confirmScrapeAll" title="Scrape every source now?" :sub="`Queues ${reelSources} source${reelSources === 1 ? '' : 's'}. They run one at a time (about ${scrapeAllMinutes} min), and progress shows in the bar.`" icon="play" tone="ok" testid="msx-scrape-dialog" @close="confirmScrapeAll = false">
      <template #actions>
        <button class="msx-btn msx-btn--ghost" type="button" @click="confirmScrapeAll = false">Cancel</button>
        <button class="msx-btn msx-btn--primary" type="button" data-testid="scrape-confirm" @click="confirmScrapeAll = false; c.scrapeNow()"><MemeIcon name="play" />Scrape all</button>
      </template>
    </MemeDialog>

    <!-- ── provider check ── -->
    <MemeDialog :open="checkOpen" title="Check both providers" sub="Runs inflact and Instagram separately against one account and test-downloads a reel from each, so a breakage names the provider. Takes about a minute." icon="radar" tone="info" testid="msx-check-dialog" @close="checkOpen = false">
      <label class="msx-field"><span class="msx-faint">@</span><input v-model="checkName" placeholder="an account with reels" data-autofocus @keydown.enter.prevent="submitCheck" /></label>
      <template #actions>
        <button class="msx-btn msx-btn--ghost" type="button" @click="checkOpen = false">Cancel</button>
        <button class="msx-btn msx-btn--light" type="button" :disabled="!checkName.trim()" data-testid="check-confirm" @click="submitCheck"><MemeIcon name="radar" />Run the check</button>
      </template>
    </MemeDialog>

    <Teleport to="body">
      <div v-if="c.toasts.value.length" class="msx-layer">
        <div class="msx-toasts" role="status" aria-live="polite">
          <div v-for="t in c.toasts.value" :key="t.id" class="msx-toast" :data-tone="t.tone" data-testid="msx-toast">
            <MemeIcon :name="t.tone === 'crit' ? 'octagon-x' : t.tone === 'warn' ? 'alert' : t.tone === 'info' ? 'info' : 'check-circle'" />
            <span class="msx-toast__text">{{ t.text }}</span>
            <button v-if="t.action" class="msx-btn msx-btn--xs" type="button" @click="c.dismissToast(t.id); t.action.run()">{{ t.action.label }}</button>
            <button class="msx-iconbtn msx-iconbtn--sm" type="button" aria-label="Dismiss" @click="c.dismissToast(t.id)"><MemeIcon name="x" /></button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { MEME_VIEWS, provideMemeConsole } from '~/composables/useMemeConsole';
import {
  MS_RANGES, msAgo, msCompact, msDay, msDayRange, msDue, msInt, msStateOf,
  type MsCommand, type MsIssueAction, type MsSource, type MsView,
} from '~/scripts/memeConsole';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'MemeScraper · Klives Management' });

const route = useRoute();
const c = provideMemeConsole();
const root = ref<HTMLElement | null>(null);
const size = ref<'xl' | 'lg' | 'md' | 'sm'>('xl');
const firstPaint = ref(true);
const paletteOpen = ref(false);
const showDates = ref(false);
const sourcesView = ref<{ focus: () => void } | null>(null);
const libraryView = ref<{ focus: () => void } | null>(null);

const verdict = computed(() => c.verdict.value);
const d = computed(() => c.dashboard.value);
const h = computed(() => c.health.value);

// ── bar ──
const subline = computed(() => {
  const lib = d.value?.Library;
  if (!lib && !h.value) return '';
  const parts = [`${msInt(lib?.TotalReels ?? h.value?.ReelsOnDisk ?? 0)} reels`, `${lib?.Sources ?? h.value?.Sources.length ?? 0} sources`];
  if (lib?.LastDownloadUtc) parts.push(`last reel ${msAgo(lib.LastDownloadUtc, c.now.value)}`);
  return parts.join(' · ');
});

const liveTone = computed(() => {
  const s = c.linkState.value;
  if (s === 'live') return verdict.value.tone === 'crit' ? 'crit' : verdict.value.tone === 'warn' ? 'warn' : 'ok';
  return ({ paused: 'neutral', stale: 'warn', offline: 'crit', connecting: 'neutral', starting: 'info' } as Record<string, string>)[s];
});
const liveWord = computed(() => {
  const s = c.linkState.value;
  if (s === 'live' && h.value?.CurrentScrape) return verdict.value.title;
  if (s === 'live') {
    if (h.value?.Settings?.Paused) return 'Live · schedule paused';
    const due = h.value?.NextScrapeDueUtc ? msDue(h.value.NextScrapeDueUtc, c.now.value) : '';
    return !due ? 'Live' : due.startsWith('in ') ? `Live · next ${due}` : `Live · scrape ${due}`;
  }
  return ({ paused: 'Paused', stale: 'Stale', offline: 'Offline', connecting: 'Connecting', starting: 'Starting' } as Record<string, string>)[s];
});
const liveTitle = computed(() => {
  const s = c.linkState.value;
  if (s === 'paused') return 'Live updates are paused. Click to resume.';
  if (s === 'starting') return 'MemeScraper is starting on the server; this page keeps checking.';
  if (s === 'offline') return 'No answer from the server. Still trying.';
  return 'Live: status every 30 s (every 4 s while something runs). Click to pause.';
});

const startingText = computed(() => {
  const p = h.value?.Startup?.Progress;
  if (p?.Total) return `Reading reel files: ${msInt(p.Done)} of ${msInt(p.Total)}. The page fills in when it is ready.`;
  return 'Loading sources and reels. The page fills in when it is ready.';
});

// ── tabs ──
const tabs = computed(() => MEME_VIEWS.map(v => {
  let count = '';
  let tone = '';
  if (v.id === 'sources' && d.value) {
    const reg = d.value.Sources.filter(s => s.Registered);
    count = String(reg.length);
    if (reg.some(s => s.State === 'bad')) tone = 'crit';
    else if (reg.some(s => s.State === 'warn')) tone = 'warn';
    else if (reg.some(s => s.State === 'empty' && s.DownloadReels)) tone = 'violet';
  }
  if (v.id === 'library' && d.value) count = msCompact(d.value.Library.TotalReels);
  if (v.id === 'activity' && h.value) {
    const failing = h.value.Providers.filter(p => p.ConsecutiveFailures > 0).length;
    if (failing) { count = String(failing); tone = 'warn'; }
  }
  return { ...v, count, tone };
}));

// ── window ──
const today = new Date().toISOString().slice(0, 10);
const fromValue = computed(() => c.from.value ?? d.value?.Range.From ?? '');
const toValue = computed(() => c.to.value ?? d.value?.Range.To ?? today);
const windowText = computed(() => {
  const r = d.value?.Range;
  if (!r) return '';
  if (c.view.value === 'library' && !c.custom.value && !route.query.range) return 'library: everything ever saved';
  return r.AllTime ? `all time · since ${msDay(r.From, true)}` : msDayRange(r.From, r.To);
});
function pickPreset(key: string) {
  showDates.value = false;
  c.setPreset(key);
}
function pickDates(f: string, t: string) {
  if (f && t) c.setCustom(f, t);
}

// ── actions from the overview ──
const pauseList = ref<string[] | null>(null);
function act(action: MsIssueAction) {
  switch (action.kind) {
    case 'pause-sources': pauseList.value = action.sources; break;
    case 'show-state': c.setSourceState(action.state); c.setView('sources'); break;
    case 'open-source': c.openSource(action.source); break;
    case 'check-providers': openCheck(); break;
    case 'resume-schedule': void c.saveSettings({ paused: false }); break;
    case 'view': c.setView(action.view); break;
  }
}
async function confirmPause() {
  const list = pauseList.value ?? [];
  pauseList.value = null;
  await c.setPaused(list, true);
}

function openLibrary(sort: string) {
  c.prefs.value = { ...c.prefs.value, libSort: sort, libAsc: false };
  c.setView('library');
}

// ── add ──
const addOpen = ref(false);
const addName = ref('');
const addNiche = ref('');
const addNiches = ref<string[]>([]);
const addReels = ref(true);
const cleanName = computed(() => {
  let v = addName.value.trim();
  const url = /instagram\.com\/([^/?#]+)/i.exec(v);
  if (url) v = url[1];
  return v.replace(/^@/, '').toLowerCase();
});
const addProblem = computed(() => {
  const v = cleanName.value;
  if (!v) return 'Type a username';
  if (!/^[a-z0-9._]{1,30}$/.test(v)) return 'Instagram usernames use letters, numbers, dots and underscores (30 at most)';
  if ((d.value?.Options.Sources ?? []).some(s => s.toLowerCase() === v)) return `@${v} is already a source`;
  return '';
});
function openAdd(name = '') {
  addName.value = name;
  addNiches.value = [];
  addNiche.value = '';
  addReels.value = true;
  addOpen.value = true;
}
function pushNiche() {
  const n = addNiche.value.trim();
  if (n && !addNiches.value.includes(n)) addNiches.value = [...addNiches.value, n];
  addNiche.value = '';
}
async function submitAdd() {
  if (addNiche.value.trim()) pushNiche();
  if (addProblem.value) return;
  if (await c.addSource({ username: cleanName.value, niches: addNiches.value, downloadReels: addReels.value })) addOpen.value = false;
}

// ── remove ──
const removeFor = ref<MsSource | null>(null);
const removeReels = ref(false);
async function confirmRemove() {
  const s = removeFor.value;
  if (!s) return;
  removeFor.value = null;
  await c.removeSource(s, removeReels.value);
  removeReels.value = false;
}

// ── scrape all / check ──
const confirmScrapeAll = ref(false);
const reelSources = computed(() => (d.value?.Sources ?? h.value?.Sources ?? []).filter((s: any) => s.DownloadReels && s.Registered !== false).length);
const scrapeAllMinutes = computed(() => Math.max(1, Math.round((reelSources.value * (d.value?.Kpis.MedianScrapeSeconds ?? 60)) / 60)));
const checkOpen = ref(false);
const checkName = ref('');
function openCheck() {
  const best = (d.value?.Sources ?? []).filter(s => s.Registered && s.DownloadReels && s.State === 'ok').sort((a, b) => b.Downloaded - a.Downloaded)[0];
  checkName.value = best?.Username ?? '';
  checkOpen.value = true;
}
async function submitCheck() {
  if (!checkName.value.trim()) return;
  if (await c.checkProviders(checkName.value)) checkOpen.value = false;
}

// ── palette ──
function goView(v: MsView) {
  c.setView(v);
}
function commandsFor(query: string): MsCommand[] {
  const list: MsCommand[] = [];
  const text = query.trim().replace(/^@/, '');
  for (const s of d.value?.Sources ?? []) {
    if (!s.Registered && !text) continue;
    const st = msStateOf(s.State);
    list.push({ id: `src-${s.Username}`, group: 'Sources', title: `@${s.Username}${s.FullName ? `  ·  ${s.FullName}` : ''}`, hint: st.label, icon: 'user', keywords: `${s.Niches.join(' ')} ${st.label}`, run: () => c.openSource(s.Username) });
  }
  if (text.length >= 2 && c.allowed.value.read) {
    list.push({ id: 'search-library', group: 'Library', title: `Search the library for “${query.trim()}”`, icon: 'search', keywords: query, run: () => { c.setSearch(query.trim()); c.setView('library'); } });
  }
  if (text.length >= 2 && c.allowed.value.manage && /^[a-z0-9._]{1,30}$/i.test(text) && !(d.value?.Options.Sources ?? []).some(s => s.toLowerCase() === text.toLowerCase())) {
    list.push({ id: 'add-typed', group: 'Actions', title: `Add @${text.toLowerCase()} as a source…`, icon: 'user-plus', keywords: `add new source ${text}`, run: () => openAdd(text) });
  }
  for (const v of MEME_VIEWS) list.push({ id: `go-${v.id}`, group: 'Go to', title: v.label, hint: v.key, icon: v.icon, run: () => goView(v.id) });
  for (const p of MS_RANGES) list.push({ id: `range-${p.key}`, group: 'Window', title: p.title, hint: p.label, icon: 'calendar', keywords: `range window ${p.label}`, run: () => pickPreset(p.key) });
  list.push({ id: 'refresh', group: 'Actions', title: 'Refresh now', hint: 'R', icon: 'refresh', run: () => c.refreshAll() });
  list.push({ id: 'live', group: 'Actions', title: c.prefs.value.live ? 'Pause live updates' : 'Resume live updates', icon: c.prefs.value.live ? 'pause' : 'play', run: () => c.setLive(!c.prefs.value.live) });
  if (c.allowed.value.run) {
    list.push({ id: 'scrape-all', group: 'Actions', title: 'Scrape every source now…', icon: 'play', keywords: 'run all', run: () => { confirmScrapeAll.value = true; } });
    list.push({ id: 'check', group: 'Actions', title: 'Check both providers…', icon: 'radar', keywords: 'diagnose inflact instagram test', run: openCheck });
    const paused = !!h.value?.Settings?.Paused;
    list.push({ id: 'schedule', group: 'Actions', title: paused ? 'Resume scheduled scrapes' : 'Pause scheduled scrapes', icon: paused ? 'play' : 'pause', danger: !paused, keywords: 'schedule scheduler stop start', run: () => void c.saveSettings({ paused: !paused }) });
  }
  if (c.allowed.value.manage) {
    list.push({ id: 'add', group: 'Actions', title: 'Add a source…', icon: 'user-plus', keywords: 'new instagram account', run: () => openAdd() });
    const empty = (d.value?.Sources ?? []).filter(s => s.Registered && s.DownloadReels && s.State === 'empty').map(s => s.Username);
    if (empty.length) list.push({ id: 'pause-empty', group: 'Actions', title: `Pause the ${empty.length} source${empty.length === 1 ? '' : 's'} that never had a reel…`, icon: 'ghost', keywords: 'empty dead', run: () => { pauseList.value = empty; } });
  }
  for (const s of (['bad', 'warn', 'empty', 'quiet', 'paused'] as const)) {
    list.push({ id: `state-${s}`, group: 'Show', title: `Sources: ${msStateOf(s).label}`, icon: 'filter', keywords: msStateOf(s).hint, run: () => { c.setSourceState(s); c.setView('sources'); } });
  }
  if (c.allowed.value.read) list.push({ id: 'csv', group: 'Actions', title: 'Export the library (CSV)', icon: 'download', keywords: 'download spreadsheet', run: () => c.exportCsv() });
  if (c.hasFilters.value) list.push({ id: 'clear', group: 'Actions', title: 'Clear the source and niche filters', icon: 'x', run: () => c.clearFilters() });
  return list;
}

// ── keyboard ──
function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el?.tagName && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}
const anyDialog = computed(() => addOpen.value || !!removeFor.value || !!pauseList.value || confirmScrapeAll.value || checkOpen.value);

function onKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) return;
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === 'k') { event.preventDefault(); paletteOpen.value = !paletteOpen.value; return; }
  if (paletteOpen.value || anyDialog.value) return;
  if (c.viewer.id) {
    if (event.key === 'Escape') c.closeReel();
    else if (event.key === 'ArrowLeft' && !isTyping(event.target)) c.stepReel(-1);
    else if (event.key === 'ArrowRight' && !isTyping(event.target)) c.stepReel(1);
    return;
  }
  if (event.key === 'Escape' && c.sheetUser.value) { c.closeSource(); return; }
  if (mod || event.altKey || isTyping(event.target)) return;
  const view = MEME_VIEWS.find(v => v.key === event.key);
  if (view) { c.setView(view.id); return; }
  if (event.key.toLowerCase() === 'r') { void c.refreshAll(); return; }
  if (event.key === '/') {
    event.preventDefault();
    if (c.view.value === 'sources') sourcesView.value?.focus();
    else if (c.view.value === 'library') libraryView.value?.focus();
    else paletteOpen.value = true;
  }
}

// The layout follows the page's own width, not the window's: the site's side nav takes ~240 px.
let resize: ResizeObserver | null = null;
function measure() {
  const w = root.value?.clientWidth ?? 1400;
  size.value = w >= 1400 ? 'xl' : w >= 1100 ? 'lg' : w >= 760 ? 'md' : 'sm';
}

onMounted(() => {
  measure();
  resize = new ResizeObserver(measure);
  if (root.value) resize.observe(root.value);
  window.addEventListener('keydown', onKeydown);
  window.setTimeout(() => { firstPaint.value = false; }, 900);
  const reel = route.query.reel;
  if (typeof reel === 'string' && reel) void c.openReel(reel);
});
onBeforeUnmount(() => {
  resize?.disconnect();
  window.removeEventListener('keydown', onKeydown);
});

</script>

<style lang="scss" src="~/assets/scss/meme-console.scss"></style>
