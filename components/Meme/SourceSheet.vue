<template>
  <Teleport to="body">
    <div v-if="user" class="msx-layer">
      <div class="msx-scrim" @click="c.closeSource()"></div>
      <aside class="msx-sheet" role="dialog" aria-modal="true" :aria-label="`@${user}`" data-testid="msx-sheet" @keydown.esc.stop="c.closeSource()">
        <header class="msx-sheet__head">
          <span class="msx-avatar msx-avatar--lg" :style="{ '--hue': msAvatarHue(user) }">{{ user.replace(/[^a-z0-9]/gi, '').slice(0, 1) || '?' }}</span>
          <div style="min-width: 0">
            <h2 class="msx-sheet__title">@{{ user }}</h2>
            <p class="msx-sheet__sub">
              <template v-if="s">{{ [s.FullName, s.Followers ? `${msCompact(s.Followers)} followers` : '', s.Niches.join(', ')].filter(Boolean).join(' · ') || '—' }}</template>
              <template v-else>Not in this window's data</template>
            </p>
          </div>
          <button ref="closeBtn" class="msx-iconbtn msx-sheet__close" type="button" aria-label="Close" title="Close (Esc)" @click="c.closeSource()"><MemeIcon name="x" /></button>
        </header>

        <div class="msx-sheet__body">
          <template v-if="s">
            <div class="msx-reason" :data-tone="msStateOf(s.State).tone" data-testid="sheet-state">
              <span class="msx-state" :data-tone="msStateOf(s.State).tone" style="font-weight: 650; color: var(--msx-ink)">{{ msStateOf(s.State).label }}</span>
              <div style="margin-top: 3px">{{ s.StateReason }}</div>
            </div>

            <div class="msx-sheet__actions">
              <button v-if="c.allowed.value.run && s.Registered" class="msx-btn msx-btn--sm msx-btn--primary" type="button" :disabled="scraping" data-testid="sheet-scrape" @click="c.scrapeNow(s)">
                <MemeIcon name="refresh" :class="{ 'msx-spin': scraping }" />{{ scraping ? 'Scraping…' : 'Scrape now' }}
              </button>
              <button v-if="c.allowed.value.manage && s.Registered" class="msx-btn msx-btn--sm" type="button" :disabled="!!c.pending[`edit:${s.Username}`]" data-testid="sheet-pause"
                      @click="togglePause">
                <MemeIcon :name="s.DownloadReels ? 'pause' : 'play'" />{{ s.DownloadReels ? 'Pause' : 'Resume' }}
              </button>
              <button v-if="c.allowed.value.manage && s.Registered" class="msx-btn msx-btn--sm msx-btn--ghost" type="button" :disabled="!!c.pending[`profile:${s.Username}`] || refreshing" title="Re-read followers, name, picture and bio" @click="c.refreshProfile(s)">
                <MemeIcon name="user" />{{ refreshing ? 'Refreshing…' : 'Refresh profile' }}
              </button>
              <button class="msx-btn msx-btn--sm msx-btn--ghost" type="button" :title="`Filter every chart and list to @${s.Username}`" @click="onlyThis"><MemeIcon name="filter" />Only this</button>
              <a class="msx-btn msx-btn--sm msx-btn--ghost" :href="`https://www.instagram.com/${s.Username}/`" target="_blank" rel="noopener noreferrer"><MemeIcon name="external" />Instagram</a>
              <button v-if="c.allowed.value.manage && s.Registered" class="msx-btn msx-btn--sm msx-btn--danger" type="button" style="margin-left: auto" @click="$emit('remove', s)"><MemeIcon name="trash" />Remove</button>
            </div>

            <dl class="msx-facts msx-facts--3">
              <div><dt>Reels</dt><dd class="msx-num">{{ msInt(s.Downloaded) }}<small>{{ windowWords }}</small></dd></div>
              <div><dt>Ever</dt><dd class="msx-num">{{ msInt(s.TotalReels) }}<small>since {{ s.FirstDownloadUtc ? msStamp(s.FirstDownloadUtc).split(',')[0] : '—' }}</small></dd></div>
              <div><dt>Median views</dt><dd class="msx-num">{{ msCompact(s.MedianViews) }}<small>top {{ msCompact(s.TopViews) }}</small></dd></div>
              <div><dt>Last new reel</dt><dd>{{ msAgo(s.LastDownloadUtc, c.now.value) }}<small>{{ msStamp(s.LastDownloadUtc) }}</small></dd></div>
              <div><dt>Last post</dt><dd>{{ s.LastPostedUtc ? msAgo(s.LastPostedUtc, c.now.value) : '—' }}<small>{{ s.LastPostedUtc ? msStamp(s.LastPostedUtc) : 'unknown' }}</small></dd></div>
              <div><dt>Next scrape</dt><dd>{{ s.DownloadReels ? msDue(s.NextScrapeDueUtc, c.now.value) : 'paused' }}<small>last {{ msAgo(s.LastScrapeAttemptUtc, c.now.value) }}</small></dd></div>
              <div><dt>Scrapes</dt><dd class="msx-num">{{ s.Scrapes }}<small>{{ s.ScrapeFailures }} failed in the window</small></dd></div>
              <div><dt>New per scrape</dt><dd class="msx-num">{{ s.AvgNewPerScrape != null ? s.AvgNewPerScrape.toFixed(1) : '—' }}<small>last found {{ s.LastScrapeReelsFound }}</small></dd></div>
              <div><dt>Engagement</dt><dd class="msx-num">{{ msPct(s.MedianEngagementPct, 2) }}<small>median</small></dd></div>
            </dl>

            <div v-if="s.Spark.length" style="height: 40px"><MemeSpark :points="s.Spark" bars :label="`@${s.Username} per bucket`" /></div>

            <section class="msx-sheet__section">
              <h3>Niches <span class="msx-dim">group sources and filter the charts</span></h3>
              <div class="msx-niches">
                <span v-for="n in draft" :key="n" class="msx-niche">{{ n }}<button v-if="c.allowed.value.manage" type="button" :aria-label="`Remove ${n}`" @click="draft = draft.filter(x => x !== n)"><MemeIcon name="x" /></button></span>
                <template v-if="c.allowed.value.manage && s.Registered">
                  <input v-model="nicheText" class="msx-input" list="msx-niche-options" placeholder="Add a niche" data-testid="sheet-niche" @keydown.enter.prevent="addNiche" />
                  <datalist id="msx-niche-options"><option v-for="n in nicheOptions" :key="n" :value="n" /></datalist>
                  <button v-if="dirty" class="msx-btn msx-btn--xs msx-btn--light" type="button" :disabled="!!c.pending[`edit:${s.Username}`]" data-testid="sheet-niche-save" @click="saveNiches">Save</button>
                </template>
                <span v-if="!draft.length && !c.allowed.value.manage" class="msx-dim">None</span>
              </div>
            </section>

            <section class="msx-sheet__section">
              <h3>Most viewed <span class="msx-dim">all time</span></h3>
              <div v-if="c.sheet.reels.length" class="msx-reels6">
                <MemeReelCard v-for="(r, i) in c.sheet.reels" :key="r.PostID" :reel="r" :rank="i + 1" compact @open="id => c.openReel(id, c.sheet.reels.map(x => x.PostID))" />
              </div>
              <p v-else class="msx-note">{{ c.sheet.loading ? 'Loading…' : 'No reels from this account yet.' }}</p>
            </section>

            <section class="msx-sheet__section">
              <h3>Recent scrapes</h3>
              <ul v-if="c.sheet.scrapes.length" class="msx-minilog">
                <li v-for="r in c.sheet.scrapes" :key="r.StartedUtc" :data-tone="r.Status === 'failed' ? 'crit' : r.Status === 'partial' ? 'warn' : r.Downloaded ? 'ok' : r.ReelsFound ? 'neutral' : 'violet'" :title="r.ProviderSummary ?? ''">
                  <span class="msx-feed__dot"></span>
                  <span class="msx-truncate">
                    <template v-if="r.Error">Failed · {{ r.Error }}</template>
                    <template v-else>{{ r.Downloaded ? `+${r.Downloaded} new` : r.ReelsFound ? 'nothing new' : 'no reels found' }} · {{ r.ReelsFound }} seen · via {{ msProviderLabel(r.SucceededVia) }}</template>
                  </span>
                  <span class="msx-faint" style="font-size: 11.5px">{{ msAgo(r.StartedUtc, c.now.value) }}</span>
                </li>
              </ul>
              <p v-else class="msx-note">{{ c.sheet.loading ? 'Loading…' : 'No scrapes recorded.' }}</p>
              <p v-if="s.LastScrapeSummary" class="msx-note msx-mono" style="margin-top: 8px; font-size: 11px">{{ s.LastScrapeSummary }}</p>
            </section>

            <section v-if="s.Bio || s.TopHashtags.length" class="msx-sheet__section">
              <h3>Profile <span class="msx-dim">{{ s.ProfileUpdatedUtc ? `read ${msAgo(s.ProfileUpdatedUtc, c.now.value)}` : '' }}</span></h3>
              <p v-if="s.Bio" class="msx-note" style="white-space: pre-wrap">{{ s.Bio }}</p>
              <div v-if="s.TopHashtags.length" class="msx-niches" style="margin-top: 8px"><span v-for="t in s.TopHashtags" :key="t.Hashtag" class="msx-chip">#{{ t.Hashtag }} <span class="msx-faint">{{ t.Count }}</span></span></div>
            </section>
          </template>
          <div v-else class="msx-empty"><MemeIcon name="search" /><b>@{{ user }}</b>Not a source in this window.</div>
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useMemeConsole } from '~/composables/useMemeConsole';
import { msAgo, msAvatarHue, msCompact, msCurrentSubject, msDayRange, msDue, msInt, msPct, msProviderLabel, msStamp, msStateOf, type MsSource } from '~/scripts/memeConsole';

defineEmits<{ remove: [source: MsSource] }>();
const c = useMemeConsole();
const user = computed(() => c.sheetUser.value);
const s = computed(() => c.sheetSource.value);
const closeBtn = ref<HTMLButtonElement | null>(null);

const scraping = computed(() => {
  const h = c.health.value;
  if (!s.value || !h) return false;
  return !!c.pending[`scrape:${s.value.Username}`] || (msCurrentSubject(h.CurrentScrape)?.toLowerCase() === `@${s.value.Username.toLowerCase()}` && !h.CurrentScrape?.startsWith('provider'));
});
const refreshing = computed(() => c.profileRefreshRunning.value && c.health.value?.ProfileRefresh?.Username?.toLowerCase() === s.value?.Username.toLowerCase());

const windowWords = computed(() => {
  const r = c.dashboard.value?.Range;
  return r ? (r.AllTime ? 'all time' : msDayRange(r.From, r.To)) : '';
});

const draft = ref<string[]>([]);
const nicheText = ref('');
const nicheOptions = computed(() => (c.dashboard.value?.Options.Niches ?? []).filter(n => !draft.value.includes(n)));
const dirty = computed(() => JSON.stringify([...draft.value].sort()) !== JSON.stringify([...(s.value?.Niches ?? [])].sort()));
watch(() => s.value?.Username + '|' + (s.value?.Niches ?? []).join(','), () => { draft.value = [...(s.value?.Niches ?? [])]; }, { immediate: true });

function addNiche() {
  const n = nicheText.value.trim();
  if (n && !draft.value.some(x => x.toLowerCase() === n.toLowerCase())) draft.value = [...draft.value, n];
  nicheText.value = '';
}

async function saveNiches() {
  if (!s.value) return;
  if (nicheText.value.trim()) addNiche();
  if (await c.updateSource(s.value, { niches: draft.value })) void c.loadMain();
}

async function togglePause() {
  if (!s.value) return;
  if (await c.updateSource(s.value, { downloadReels: !s.value.DownloadReels })) await c.loadMain();
}

function onlyThis() {
  if (!s.value) return;
  c.setSources([s.value.Username]);
  c.closeSource();
}

watch(user, async u => { if (u) { await nextTick(); closeBtn.value?.focus(); } });
</script>
