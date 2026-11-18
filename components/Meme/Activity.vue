<template>
  <div class="msx-act" data-testid="msx-activity">
    <div class="msx-act__side">
      <!-- ── schedule ── -->
      <section class="msx-card" aria-label="Schedule" data-testid="act-schedule">
        <header class="msx-card__head">
          <h2 class="msx-card__title"><MemeIcon name="clock" />Schedule</h2>
          <span class="msx-card__meta">{{ h?.SchedulerState ?? '' }}</span>
        </header>
        <div class="msx-card__body">
          <dl class="msx-facts">
            <div><dt>Next scrape</dt><dd>{{ h ? (h.Settings?.Paused ? 'paused' : msDue(h.NextScrapeDueUtc, c.now.value)) : '—' }}<small>{{ h?.NextScrapeDueUtc ? msStamp(h.NextScrapeDueUtc) : '' }}</small></dd></div>
            <div><dt>Scheduler checked</dt><dd>{{ msAgo(h?.LastSchedulerTickUtc, c.now.value) }}<small>every 5 min</small></dd></div>
            <div><dt>Running now</dt><dd>{{ h?.CurrentScrape ? msCurrentSubject(h.CurrentScrape) : 'nothing' }}<small>{{ (h?.ScrapeQueued ?? 0) > 0 ? `${h!.ScrapeQueued} queued` : 'one at a time' }}</small></dd></div>
            <div><dt>On this machine</dt><dd>{{ h ? (h.OnServer ? 'the server' : 'not the server') : '—' }}<small>{{ h && !h.OnServer ? 'scheduled scrapes only run on the server' : '' }}</small></dd></div>
          </dl>

          <div v-if="settings" class="msx-form" style="margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--msx-line)">
            <div class="msx-form__row">
              <label for="msx-paused">Scheduled scrapes</label>
              <button id="msx-paused" class="msx-switch" type="button" role="switch" :aria-checked="!draft.paused" :disabled="!c.allowed.value.run" data-testid="act-paused" :title="draft.paused ? 'Paused: click to resume' : 'On: click to pause'" @click="draft.paused = !draft.paused"></button>
            </div>
            <div class="msx-form__row">
              <label>Scrape each source every</label>
              <div class="msx-seg" role="group" aria-label="Interval">
                <button v-for="hrs in [6, 12, 24, 48]" :key="hrs" class="msx-seg__opt" type="button" :aria-pressed="draft.interval === hrs" :disabled="!c.allowed.value.run" @click="draft.interval = hrs">{{ hrs }} h</button>
              </div>
            </div>
            <div class="msx-form__row">
              <label for="msx-pages">Pages per scrape (12 reels each)</label>
              <input id="msx-pages" v-model.number="draft.pages" class="msx-input" type="number" min="1" max="500" style="width: 80px" :disabled="!c.allowed.value.run" />
            </div>
            <div v-if="dirty && c.allowed.value.run" style="display: flex; gap: 8px; justify-content: flex-end">
              <button class="msx-btn msx-btn--sm msx-btn--ghost" type="button" @click="reset">Cancel</button>
              <button class="msx-btn msx-btn--sm msx-btn--light" type="button" :disabled="!!c.pending.settings || !validPages" data-testid="act-save" @click="save">Save</button>
            </div>
          </div>
        </div>
      </section>

      <!-- ── providers ── -->
      <section class="msx-card" aria-label="Providers" data-testid="act-providers">
        <header class="msx-card__head">
          <h2 class="msx-card__title"><MemeIcon name="radar" />Providers</h2>
          <div v-if="c.allowed.value.run" class="msx-card__tools">
            <button class="msx-btn msx-btn--xs" type="button" :disabled="c.providerCheckRunning.value || !!c.pending.check" data-testid="act-check" @click="$emit('check')">
              <MemeIcon name="radar" :class="{ 'msx-spin': c.providerCheckRunning.value }" />{{ c.providerCheckRunning.value ? 'Checking…' : 'Check both' }}
            </button>
          </div>
        </header>
        <div class="msx-card__body">
          <div v-for="p in providers" :key="p.Name" class="msx-prov" :data-tone="provTone(p)">
            <div class="msx-prov__head">
              <span class="msx-state" :data-tone="provTone(p)"><span class="msx-prov__name" style="color: var(--msx-ink)">{{ msProviderLabel(p.Name) }}</span></span>
              <span class="msx-dim" style="margin-left: auto; font-size: 11.5px">{{ msInt(p.TotalSuccesses) }} ok · {{ msInt(p.TotalFailures) }} failed since start</span>
            </div>
            <span class="msx-prov__role">{{ MS_PROVIDERS[p.Name]?.role ?? '' }}</span>
            <span class="msx-prov__line">Last success {{ msAgo(p.LastSuccess, c.now.value) }}<template v-if="p.LastFailure"> · last failure {{ msAgo(p.LastFailure, c.now.value) }}</template></span>
            <span v-if="p.BenchedUntil && benched(p)" class="msx-prov__err">Benched until {{ msStamp(p.BenchedUntil) }} after {{ p.ConsecutiveFailures }} failures</span>
            <span v-if="p.LastError && p.ConsecutiveFailures" class="msx-prov__err">{{ p.LastError }}</span>
          </div>
          <div v-if="check" style="margin-top: 12px" data-testid="act-check-result">
            <p class="msx-note"><b style="color: var(--msx-ink-2)">Check on @{{ check.Username }}</b> · {{ check.State === 'complete' ? `finished ${msAgo(check.FinishedUtc, c.now.value)}` : check.State }} · by {{ check.RequestedBy }}</p>
            <ul class="msx-minilog" style="margin-top: 4px">
              <li v-for="res in check.Results" :key="res.Provider" :data-tone="res.Ok ? 'ok' : 'crit'">
                <span class="msx-feed__dot"></span>
                <span class="msx-truncate" :title="res.Error ?? res.Note ?? ''">{{ msProviderLabel(res.Provider) }}: {{ res.Ok ? `${res.Reels} reels, test download ${msBytes(res.DownloadBytes)}` : res.Error }}</span>
                <span class="msx-faint" style="font-size: 11.5px">{{ msDuration(res.DurationMs) }}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- ── start-up ── -->
      <section v-if="startup" class="msx-card" aria-label="Start-up" data-testid="act-startup">
        <header class="msx-card__head">
          <h2 class="msx-card__title"><MemeIcon name="rocket" />Start-up</h2>
          <span class="msx-card__meta">{{ startup.DataLoadMs != null ? `ready in ${msDuration(startup.DataLoadMs)}` : 'loading' }}</span>
        </header>
        <div class="msx-card__body">
          <p class="msx-note">
            Started {{ msAgo(startup.StartedUtc, c.now.value) }}.
            <template v-if="startup.Reels?.Via === 'index'">Reels came from the reel index ({{ msBytes(startup.Reels.IndexBytes) }}, {{ msDuration(startup.Reels.IndexMs) }}), so no reel file was opened.</template>
            <template v-else-if="startup.Reels">Every reel file was read ({{ msInt(startup.Reels.FilesRead) }}<template v-if="startup.Reels.IndexProblem">: {{ startup.Reels.IndexProblem }}</template>); the next start uses the index.</template>
          </p>
          <div v-if="startup.Progress" class="msx-progress" style="margin-top: 8px"><span :style="{ width: `${Math.round((startup.Progress.Done / Math.max(1, startup.Progress.Total)) * 100)}%` }"></span></div>
          <div class="msx-steps">
            <div v-for="step in steps" :key="step.name" class="msx-step">
              <span class="msx-dim">{{ step.name }}</span>
              <span class="msx-step__bar"><span :style="{ width: `${step.share}%` }"></span></span>
              <span class="msx-step__ms">{{ msDuration(step.ms) }}</span>
            </div>
          </div>
          <p v-if="startup.Reconcile" class="msx-note" style="margin-top: 8px">
            Checked against {{ msInt(startup.Reconcile.Listed) }} reel files in {{ msDuration(startup.Reconcile.Ms) }}: {{ startup.Reconcile.Added }} new, {{ startup.Reconcile.Changed }} changed, {{ startup.Reconcile.Removed }} gone, {{ startup.Reconcile.FilesRead }} read.
          </p>
          <p v-if="startup.IndexWrite" class="msx-note">Index saved {{ msAgo(startup.IndexWrite.WrittenUtc, c.now.value) }} ({{ msInt(startup.IndexWrite.Reels) }} reels, {{ msBytes(startup.IndexWrite.Bytes) }}).</p>
          <p v-if="startup.IndexWriteError" class="msx-prov__err" style="margin-top: 6px">The index could not be saved: {{ startup.IndexWriteError }}</p>
        </div>
      </section>

      <!-- ── disk ── -->
      <section v-if="disk" class="msx-card" aria-label="Disk" data-testid="act-disk">
        <header class="msx-card__head">
          <h2 class="msx-card__title"><MemeIcon name="hard-drive" />Disk</h2>
          <span class="msx-card__meta">measured {{ msAgo(disk.MeasuredUtc, c.now.value) }}</span>
        </header>
        <div class="msx-card__body">
          <dl class="msx-facts msx-facts--3">
            <div><dt>Videos</dt><dd>{{ msBytes(disk.Bytes) }}<small>{{ msInt(disk.Files) }} files</small></dd></div>
            <div><dt>Thumbnails</dt><dd>{{ msBytes(disk.ThumbnailBytes) }}<small>{{ backfillText }}</small></dd></div>
            <div><dt>Problems</dt><dd :style="{ color: disk.MissingVideos ? 'var(--msx-warn)' : undefined }">{{ disk.MissingVideos }} missing<small>{{ disk.OrphanFiles }} orphan file{{ disk.OrphanFiles === 1 ? '' : 's' }}</small></dd></div>
          </dl>
        </div>
      </section>
    </div>

    <!-- ── scrape log ── -->
    <section class="msx-card msx-card--flush" aria-label="Scrape log" data-testid="act-log">
      <header class="msx-card__head">
        <h2 class="msx-card__title"><MemeIcon name="list" />Scrape log</h2>
        <span class="msx-card__meta">{{ statsText }}</span>
        <div class="msx-card__tools">
          <div class="msx-seg" role="group" aria-label="Outcome">
            <button v-for="o in OUTCOMES" :key="o.id" class="msx-seg__opt" type="button" :aria-pressed="c.log.status === o.id" :data-tone="o.tone" @click="c.setLog({ status: o.id })">
              <span v-if="o.tone" class="msx-seg__dot"></span>{{ o.label }}
            </button>
          </div>
          <div class="msx-seg" role="group" aria-label="Trigger">
            <button v-for="t in TRIGGERS" :key="t.id" class="msx-seg__opt" type="button" :aria-pressed="c.log.trigger === t.id" @click="c.setLog({ trigger: t.id })">{{ t.label }}</button>
          </div>
        </div>
      </header>
      <div class="msx-table-wrap">
        <table class="msx-table msx-log" data-testid="act-log-table">
          <thead><tr><th></th><th>Source</th><th>When</th><th class="msx-r">New</th><th class="msx-r msx-hide-sm">Seen</th><th class="msx-r msx-hide-sm">Took</th><th class="msx-hide-md">Via</th><th class="msx-hide-md">Trigger</th><th class="msx-hide-sm">Providers</th></tr></thead>
          <tbody>
            <template v-for="row in rows" :key="row.StartedUtc + row.Username">
              <tr :data-expanded="open === key(row) || undefined" @click="open = open === key(row) ? null : key(row)">
                <td style="width: 18px"><span class="msx-feed__dot" :data-tone="row.Status === 'failed' ? 'crit' : row.Status === 'partial' ? 'warn' : row.Downloaded ? 'ok' : row.ReelsFound ? 'neutral' : 'violet'" style="display: block"></span></td>
                <td><button class="msx-who__name" type="button" @click.stop="c.openSource(row.Username)">@{{ row.Username }}</button></td>
                <td :title="msStamp(row.StartedUtc)">{{ msAgo(row.StartedUtc, c.now.value) }}</td>
                <td class="msx-r"><b v-if="row.Downloaded" style="color: var(--msx-ok)">+{{ row.Downloaded }}</b><span v-else class="msx-faint">0</span><span v-if="row.DownloadFailures" style="color: var(--msx-warn)"> ({{ row.DownloadFailures }} failed)</span></td>
                <td class="msx-r msx-hide-sm msx-dim">{{ row.ReelsFound }}</td>
                <td class="msx-r msx-hide-sm msx-dim">{{ msDuration(row.DurationMs) }}</td>
                <td class="msx-hide-md msx-dim">{{ row.Error ? '—' : msProviderLabel(row.SucceededVia) }}</td>
                <td class="msx-hide-md msx-dim">{{ msTriggerLabel(row.Trigger) }}</td>
                <td class="msx-hide-sm msx-log__sum" :style="{ color: row.Error ? '#ffc2c8' : undefined }">{{ row.Error ?? row.ProviderSummary ?? '' }}</td>
              </tr>
              <tr v-if="open === key(row)" class="msx-log__detail">
                <td colspan="9"><pre>{{ [row.ProviderSummary, row.Error ? `Error: ${row.Error}` : '', ...row.Notes].filter(Boolean).join('\n') }}</pre></td>
              </tr>
            </template>
          </tbody>
        </table>
        <div v-if="!rows.length" class="msx-empty">{{ c.log.loading ? 'Loading…' : c.log.error ?? 'No scrapes match.' }}</div>
      </div>
      <div class="msx-pager">
        <span v-if="page">{{ msInt(page.Offset + 1) }}–{{ msInt(Math.min(page.Offset + page.Limit, page.Filtered)) }} of {{ msInt(page.Filtered) }}</span>
        <div class="msx-pager__end">
          <button class="msx-btn msx-btn--xs" type="button" :disabled="!page || page.Offset === 0" @click="c.setLog({ status: c.log.status, trigger: c.log.trigger, offset: Math.max(0, (page?.Offset ?? 0) - (page?.Limit ?? 25)) })"><MemeIcon name="chevron-left" />Newer</button>
          <button class="msx-btn msx-btn--xs" type="button" :disabled="!page || page.Offset + page.Limit >= page.Filtered" @click="c.setLog({ status: c.log.status, trigger: c.log.trigger, offset: (page?.Offset ?? 0) + (page?.Limit ?? 25) })">Older<MemeIcon name="chevron-right" /></button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useMemeConsole } from '~/composables/useMemeConsole';
import {
  MS_PROVIDERS, msAgo, msBytes, msCurrentSubject, msDue, msDuration, msInt, msParse, msPct, msProviderLabel, msStamp, msTriggerLabel,
  type MsProvider, type MsScrape,
} from '~/scripts/memeConsole';

defineEmits<{ check: [] }>();
const c = useMemeConsole();
const h = computed(() => c.health.value);
const providers = computed(() => h.value?.Providers ?? []);
const check = computed(() => h.value?.ProviderCheck ?? null);
const startup = computed(() => h.value?.Startup ?? null);
const disk = computed(() => h.value?.Disk ?? null);
const page = computed(() => c.log.page);

/** The background thumbnail backfill, in a few words (older servers do not report it). */
const backfillText = computed(() => {
  const b = h.value?.ThumbnailBackfill;
  if (!b) return 'made on first view';
  if (b.State === 'off') return 'backfill switched off';
  if (b.State === 'done') return 'every reel has one';
  const made = b.Made ? `${msInt(b.Made)} made · ` : '';
  const when = b.State === 'paused' ? ' (paused while scraping)' : b.State === 'waiting' ? ' (starting soon)' : '';
  return `${made}${msInt(b.Remaining)} to go${when}`;
});
const rows = computed<MsScrape[]>(() => page.value?.Rows ?? []);
const open = ref<string | null>(null);
const key = (row: MsScrape) => `${row.Username}@${row.StartedUtc}`;

const OUTCOMES = [{ id: 'all', label: 'All', tone: '' }, { id: 'ok', label: 'OK', tone: 'ok' }, { id: 'partial', label: 'Partial', tone: 'warn' }, { id: 'failed', label: 'Failed', tone: 'crit' }];
const TRIGGERS = [{ id: 'all', label: 'Any' }, { id: 'schedule', label: 'Scheduled' }, { id: 'manual', label: 'Manual' }];

const statsText = computed(() => {
  const s = page.value?.Stats;
  if (!s) return '';
  return `${msInt(s.Scrapes)} in the window · ${msPct(s.SuccessRate, s.SuccessRate != null && s.SuccessRate > 99 && s.SuccessRate < 100 ? 1 : 0)} ok · ${msInt(s.Downloaded)} reels`;
});

const benched = (p: MsProvider) => (msParse(p.BenchedUntil)?.getTime() ?? 0) > c.now.value;
const provTone = (p: MsProvider) => (benched(p) ? 'crit' : p.ConsecutiveFailures ? 'warn' : p.LastSuccess ? 'ok' : 'neutral');

const steps = computed(() => {
  const s = startup.value?.Steps ?? {};
  const max = Math.max(1, ...Object.values(s));
  return Object.entries(s).sort((a, b) => b[1] - a[1]).map(([name, ms]) => ({ name, ms, share: Math.max(2, (ms / max) * 100) }));
});

// ── settings ──
const settings = computed(() => h.value?.Settings ?? null);
const draft = reactive({ paused: false, interval: 24, pages: 40 });
function reset() {
  draft.paused = settings.value?.Paused ?? false;
  draft.interval = settings.value?.IntervalHours ?? 24;
  draft.pages = settings.value?.MaxPagesPerScrape ?? 40;
}
watch(() => JSON.stringify(settings.value), reset, { immediate: true });
const dirty = computed(() => !!settings.value && (draft.paused !== settings.value.Paused || draft.interval !== settings.value.IntervalHours || draft.pages !== settings.value.MaxPagesPerScrape));
const validPages = computed(() => Number.isInteger(draft.pages) && draft.pages >= 1 && draft.pages <= 500);
async function save() {
  const s = settings.value;
  if (!s) return;
  const patch: { paused?: boolean; intervalHours?: number; maxPagesPerScrape?: number } = {};
  if (draft.paused !== s.Paused) patch.paused = draft.paused;
  if (draft.interval !== s.IntervalHours) patch.intervalHours = draft.interval;
  if (draft.pages !== s.MaxPagesPerScrape) patch.maxPagesPerScrape = draft.pages;
  await c.saveSettings(patch);
}
</script>
