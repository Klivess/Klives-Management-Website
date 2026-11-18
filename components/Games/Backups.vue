<template>
  <div class="kgx-bk">
    <div class="kgx-bk__top">
      <section class="kgx-card kgx-bk__sched" aria-label="Schedule">
        <header class="kgx-card__head">
          <h2 class="kgx-card__title"><GamesIcon name="clock" />Schedule</h2>
          <span class="kgx-card__meta">{{ nextText }}</span>
        </header>
        <template v-if="!server.legacy">
          <div class="kgx-bk__form">
            <label class="kgx-field">
              <span>Back up</span>
              <select v-model.number="every" :disabled="!canManage" data-testid="backup-every">
                <option v-for="h in KG_BACKUP_EVERY" :key="h" :value="h">{{ kgEvery(h) }}</option>
              </select>
            </label>
            <label class="kgx-field">
              <span>Keep the newest</span>
              <input v-model.number="keep" type="number" min="0" max="100" :disabled="!canManage || !every" data-testid="backup-keep" />
            </label>
            <button class="kgx-btn kgx-btn--sm" :disabled="!canManage || !scheduleDirty" :title="canManage ? '' : needs.manage" data-testid="backup-save" @click="saveSchedule">Save</button>
          </div>
          <p class="kgx-hint">{{ every ? `Scheduled backups older than the newest ${keep || 'all'} are deleted; backups you take yourself and safety copies are kept until you delete them. A stopped server that hasn't run since its last backup is skipped.` : 'Nothing is backed up automatically.' }}</p>
        </template>
        <p v-else class="kgx-hint">Scheduled backups need the November server build.</p>
      </section>

      <section class="kgx-card kgx-bk__now" aria-label="Back up now">
        <header class="kgx-card__head">
          <h2 class="kgx-card__title"><GamesIcon name="archive" />{{ job && !job.finishedUtc ? (job.operation === 'restore' ? 'Restoring' : 'Backing up') : 'Backups' }}</h2>
          <span class="kgx-card__meta kgx-num">{{ list.length }} · {{ kgBytes(totalBytes) }}</span>
        </header>
        <div v-if="job && !job.finishedUtc" class="kgx-job" data-testid="backup-job">
          <div class="kgx-job__line"><span>{{ stageText(job) }}</span><b class="kgx-num">{{ pctText(job) }}</b></div>
          <div class="kgx-bar"><i :style="{ width: `${pct(job)}%` }"></i></div>
          <div class="kgx-job__meta kgx-num">{{ kgInt(job.filesDone) }} of {{ kgInt(job.filesTotal) }} files · {{ kgBytes(job.bytesDone) }} of {{ kgBytes(job.bytesTotal) }}</div>
        </div>
        <div v-else-if="job && job.finishedUtc" class="kgx-job" :data-tone="job.stage === 'done' ? 'ok' : 'crit'">
          <div class="kgx-job__line"><span>{{ job.stage === 'done' ? (job.operation === 'restore' ? `Restored ${job.restoreFrom}` : `Backed up: ${job.backupId}`) : `${job.operation === 'restore' ? 'Restore' : 'Backup'} ${job.stage}` }}</span><b class="kgx-num">{{ job.sizeBytes ? kgBytes(job.sizeBytes) : '' }}</b></div>
          <div v-if="job.error || job.note || job.safetyId" class="kgx-job__meta">{{ job.error ?? job.note ?? `The replaced files are kept as ${job.safetyId}.` }}</div>
        </div>
        <p v-else class="kgx-hint">{{ live ? 'The server keeps running. It is asked to save its world first, so the copy is consistent.' : 'A copy of the whole server folder: world, settings, mods and plugins.' }}</p>
        <button class="kgx-btn kgx-btn--go" :disabled="!canManage || jobRunning || server.status === 'Provisioning'" :title="canManage ? '' : needs.manage" data-testid="backup-now" @click="backupNow">
          <GamesIcon name="archive" />Back up now
        </button>
      </section>
    </div>

    <section class="kgx-card" aria-label="All backups">
      <div v-if="list.length" class="kgx-scroll-x">
        <table class="kgx-table">
          <thead><tr><th>Backup</th><th>Taken</th><th class="kgx-r">Size</th><th class="kgx-r"><span class="kgx-sr">Actions</span></th></tr></thead>
          <tbody>
            <tr v-for="b in list" :key="b.Id" :data-testid="`backup-${b.Id}`">
              <td><span class="kgx-bk__name"><span class="kgx-tag" :data-tone="kindTone(b)">{{ kindLabel(b) }}</span><span class="kgx-mono kgx-truncate">{{ b.Id }}</span></span></td>
              <td><span :title="kgAgo(b.CreatedUtc, now)">{{ kgWhen(b.CreatedUtc) }}</span> <span class="kgx-faint">· {{ kgAgo(b.CreatedUtc, now) }}</span></td>
              <td class="kgx-r kgx-num">{{ kgBytes(b.SizeBytes) }}</td>
              <td class="kgx-r kgx-bk__ops">
                <button class="kgx-iconbtn" :disabled="!canDownload" :title="canDownload ? 'Download' : needs.filesRead" :aria-label="`Download ${b.Id}`" @click="api.download(`/klivegames/backups/download?id=${encodeURIComponent(server.id)}&backupId=${encodeURIComponent(b.Id)}`, b.Id, b.SizeBytes)"><GamesIcon name="download" /></button>
                <button class="kgx-btn kgx-btn--sm" :disabled="!canManage || jobRunning" :title="!canManage ? needs.manage : ''" :data-testid="`restore-${b.Id}`" @click="toRestore = b"><GamesIcon name="history" />Restore</button>
                <button class="kgx-iconbtn" data-tone="crit" :disabled="!canManage || jobRunning || server.legacy" :title="!canManage ? needs.manage : server.legacy ? 'Needs the November server build' : 'Delete'" :aria-label="`Delete ${b.Id}`" @click="toDelete = b"><GamesIcon name="trash" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="kgx-empty">{{ loaded ? 'No backups yet.' : 'Loading…' }}</p>
    </section>

    <GamesDialog :open="!!toRestore" :title="`Restore ${toRestore?.Id}?`" icon="history" tone="warn" :confirm-label="live ? 'Stop the server first' : 'Restore'" :disabled="live" @close="toRestore = null" @confirm="restore">
      <p>Every file of <b>{{ server.name }}</b> is replaced with the copy taken {{ toRestore ? kgWhen(toRestore.CreatedUtc) : '' }} ({{ toRestore ? kgAgo(toRestore.CreatedUtc, now) : '' }}).</p>
      <p v-if="live" class="kgx-note" data-tone="warn"><GamesIcon name="alert" />{{ server.name }} is running. Stop it, then restore.</p>
      <label v-if="!server.legacy" class="kgx-check">
        <input v-model="safety" type="checkbox" data-testid="restore-safety" />
        <span>Keep a copy of the current files first <span class="kgx-dim">(so the restore can be undone)</span></span>
      </label>
      <p v-else class="kgx-note" data-tone="warn"><GamesIcon name="alert" />This server build overwrites the current files without keeping a copy.</p>
    </GamesDialog>

    <GamesDialog :open="!!toDelete" :title="`Delete ${toDelete?.Id}?`" icon="trash" tone="crit" confirm-label="Delete backup" @close="toDelete = null" @confirm="remove">
      <p>{{ toDelete ? kgBytes(toDelete.SizeBytes) : '' }} from {{ toDelete ? kgWhen(toDelete.CreatedUtc) : '' }}. This cannot be undone.</p>
      <p v-if="list.length === 1" class="kgx-note" data-tone="warn"><GamesIcon name="alert" />It is this server's only backup.</p>
    </GamesDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { KliveGamesApi } from '~/composables/useKliveGames';
import { fmtInt as kgInt, KG_BACKUP_EVERY, kgAgo, kgBytes, kgEvery, kgStatus, kgWhen, type KgBackup, type KgJob, type KgServer } from '~/scripts/kliveGames';

const props = defineProps<{
  server: KgServer;
  api: KliveGamesApi;
  now: number;
  canManage: boolean;
  canDownload: boolean;
  needs: { manage: string; filesRead: string };
}>();

const list = ref<KgBackup[]>([]);
const loaded = ref(false);
const listJob = ref<KgJob | null>(null);
const live = computed(() => kgStatus(props.server.status).live);
// The overview poll is fresher than this tab's last list read.
const job = computed(() => props.server.backups.job ?? listJob.value);
const jobRunning = computed(() => !!job.value && !job.value.finishedUtc);
const totalBytes = computed(() => list.value.reduce((n, b) => n + b.SizeBytes, 0));

const every = ref(props.server.backups.everyHours ?? 0);
const keep = ref(props.server.backups.keep ?? 7);
const scheduleDirty = computed(() => every.value !== (props.server.backups.everyHours ?? 0) || (every.value > 0 && keep.value !== (props.server.backups.keep ?? 7)));
const nextText = computed(() => {
  const b = props.server.backups;
  if (!b.everyHours) return 'off';
  if (jobRunning.value) return 'running now';
  if (!b.nextDueUtc) return 'next after it runs again';
  return `next ${kgAgo(b.nextDueUtc, props.now).replace(/^just now$/, 'within a minute')}`;
});

async function load() {
  const r = await props.api.getBackups(props.server.id);
  loaded.value = true;
  if (!r.ok) return;
  list.value = r.data.backups ?? [];
  listJob.value = r.data.job ?? null;
}

function kindLabel(b: KgBackup) { return ({ scheduled: 'Scheduled', safety: 'Before restore', manual: 'Manual' } as Record<string, string>)[b.Kind ?? 'manual'] ?? 'Manual'; }
function kindTone(b: KgBackup) { return b.Kind === 'safety' ? 'warn' : b.Kind === 'scheduled' ? 'info' : 'neutral'; }
function pct(j: KgJob) { return j.bytesTotal ? Math.min(100, (j.bytesDone / j.bytesTotal) * 100) : (j.stage === 'restoring' ? 60 : 3); }
function pctText(j: KgJob) { return j.bytesTotal && j.stage !== 'restoring' ? `${Math.floor(pct(j))}%` : ''; }
function stageText(j: KgJob) {
  switch (j.stage) {
    case 'saving': return 'Asking the server to save its world…';
    case 'zipping': return `Copying ${props.server.name}${j.reason === 'scheduled' ? ' (scheduled)' : ''}`;
    case 'safety': return 'Keeping a copy of the current files…';
    case 'restoring': return `Restoring ${j.restoreFrom}…`;
    default: return 'Starting…';
  }
}

async function backupNow() { await props.api.backupNow(props.server.id); load(); }
async function saveSchedule() { await props.api.setSchedule(props.server.id, every.value, keep.value); }

const toRestore = ref<KgBackup | null>(null);
const safety = ref(true);
async function restore() {
  const b = toRestore.value;
  toRestore.value = null;
  if (!b) return;
  await props.api.restoreBackup(props.server.id, b.Id, safety.value);
  load();
}

const toDelete = ref<KgBackup | null>(null);
async function remove() {
  const b = toDelete.value;
  toDelete.value = null;
  if (!b) return;
  const r = await props.api.deleteBackup(props.server.id, b.Id);
  if (r.ok) list.value = list.value.filter(x => x.Id !== b.Id);
}

onMounted(load);
watch(() => props.server.id, () => { list.value = []; loaded.value = false; load(); });
watch(() => [props.server.backups.everyHours, props.server.backups.keep], () => {
  every.value = props.server.backups.everyHours ?? 0;
  keep.value = props.server.backups.keep ?? 7;
});
// Reload the list when a job ends or the count moves (a scheduled backup ran).
watch(() => `${job.value?.finishedUtc ?? ''}|${props.server.backups.count ?? ''}`, (next, prev) => { if (prev !== undefined && next !== prev) load(); });
</script>
