<template>
  <section id="adm-host" class="adm-panel" aria-label="Host and build" :data-flash="flash">
    <header class="adm-panel__head">
      <h2 class="adm-panel__title"><AdminIcon name="server" />Host &amp; build</h2>
      <span class="adm-panel__meta adm-mono adm-truncate">{{ stats?.MachineName }}</span>
    </header>

    <div v-if="stats" class="adm-panel__body">
      <dl class="adm-kv">
        <dt>Build</dt>
        <dd>
          <template v-if="stats.Build?.CommitShort">
            <a class="adm-mono adm-panel__link" :href="`https://github.com/Klivess/Omnipotent/commit/${stats.Build.Commit}`" target="_blank" rel="noopener" :title="`Commit ${stats.Build.Commit}`" style="color: var(--adm-ink)">{{ stats.Build.CommitShort }}</a>
            <span class="adm-dim"> · built {{ fmtRelative(stats.Build.BuiltUtc, now) }}</span>
          </template>
          <template v-else>{{ stats.lastOmnipotentUpdate ? `built ${fmtRelative(stats.lastOmnipotentUpdate, now)}` : (stats.lastOmnipotentUpdateHumanized || '—') }}</template>
        </dd>

        <template v-if="stats.Updater">
          <dt>GitHub {{ stats.Updater.Branch || 'master' }}</dt>
          <dd :title="updaterTitle">
            <span class="adm-mono">{{ stats.Updater.LastSeenSha ? stats.Updater.LastSeenSha.slice(0, 7) : '—' }}</span>
            <span class="adm-state" :data-tone="updaterTone" style="margin-left: 8px"><AdminIcon :name="updaterTone === 'ok' ? 'check' : 'alert'" />{{ updaterWord }}</span>
          </dd>
        </template>

        <dt>Started</dt>
        <dd>{{ startedLabel }}</dd>

        <dt>Machine</dt>
        <dd :title="`${stats.ProcessorName} · ${stats.OSVersion}`">{{ shortCpuName(stats.ProcessorName) || '—' }} · {{ stats.ProcessorCount }} cores</dd>

        <dt>System</dt>
        <dd :title="stats.OSVersion">{{ shortOsName(stats.OSVersion) || '—' }}<span v-if="stats.Build?.Runtime" class="adm-dim"> · {{ stats.Build.Runtime }}</span></dd>

        <dt>Threads</dt>
        <dd class="adm-num">{{ fmtInt(stats.ProcessThreadCount) }}</dd>

        <dt>Garbage collections</dt>
        <dd class="adm-num" :title="`Gen 0: ${fmtInt(stats.GCGen0Collections)} · Gen 1: ${fmtInt(stats.GCGen1Collections)} · Gen 2: ${fmtInt(stats.GCGen2Collections)}`">
          {{ fmtCompact(stats.GCGen2Collections) }} full<span v-if="gen2PerMin != null" class="adm-dim"> · {{ gen2PerMin.toFixed(gen2PerMin >= 10 ? 0 : 1) }} a minute</span>
        </dd>

        <dt>Log buffer</dt>
        <dd class="adm-num">{{ fmtInt(stats.TotalLogs) }} entries<span class="adm-dim"> · {{ fmtInt(stats.TotalErrorLogs) }} errors</span></dd>
      </dl>

      <template v-if="browsers">
        <div class="adm-subhead">Automated browsers</div>
        <ul v-if="browsers.length" class="adm-rows">
          <li v-for="browser in browsers" :key="String(browser.objectID)" class="adm-row" style="padding-left: 0; padding-right: 0">
            <span class="adm-dot" data-tone="ok"></span>
            <span class="adm-row__main"><span class="adm-row__title">{{ browser.name }}</span></span>
            <span class="adm-row__end adm-dim" :title="`Session ${browser.objectID}`">open {{ fmtRelative(browser.createdAt, now).replace(' ago', '') }}</span>
          </li>
        </ul>
        <p v-else class="adm-dim" style="font-size: 12.5px">None open.</p>
      </template>
    </div>
    <div v-else class="adm-panel__body"><div class="adm-empty">Reading the host…</div></div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { fmtCompact, fmtDateTime, fmtInt, fmtRelative, sameCommit, shortCpuName, shortOsName, toMs, type AdminBrowser, type AdminStats } from '~/scripts/adminConsole';

const props = withDefaults(defineProps<{
  stats: AdminStats | null;
  browsers: AdminBrowser[] | null;
  gen2PerMin: number | null;
  now: number;
  flash?: boolean;
}>(), { flash: false });

const startedLabel = computed(() => {
  const started = toMs(props.stats?.Build?.ProcessStartedUtc);
  if (started != null) return `${fmtDateTime(started)} · ${fmtRelative(started, props.now)}`;
  return props.stats?.BotUptimeHumanized ? `${props.stats.BotUptimeHumanized} ago` : '—';
});

/** Whether the running build is the commit the updater last saw on GitHub. */
const updaterTone = computed(() => {
  const updater = props.stats?.Updater;
  const build = props.stats?.Build;
  if (!updater) return 'neutral';
  if (!updater.LastCheckOk) return 'warn';
  if (build?.Commit && updater.LastSeenSha && !sameCommit(updater.LastSeenSha, build.Commit)) return 'warn';
  return 'ok';
});
const updaterWord = computed(() => {
  const updater = props.stats?.Updater;
  const build = props.stats?.Build;
  if (!updater) return '';
  if (!updater.LastCheckOk) return 'check failed';
  if (build?.Commit && updater.LastSeenSha && !sameCommit(updater.LastSeenSha, build.Commit)) return 'ahead of this build';
  return 'up to date';
});
const updaterTitle = computed(() => {
  const updater = props.stats?.Updater;
  if (!updater) return '';
  const checked = updater.LastCheckUtc ? `Checked ${fmtRelative(updater.LastCheckUtc, props.now)}, every ${updater.PollIntervalSeconds}s.` : 'Not checked yet.';
  const deploys = updater.AutoDeploy ? 'A new commit is deployed automatically.' : 'Not the server: new commits are announced but not deployed.';
  return `${checked} ${deploys}${updater.LastError ? ` Last error: ${updater.LastError}` : ''}`;
});
</script>
