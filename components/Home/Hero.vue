<template>
  <section class="hom-hero" :data-tone="verdict.tone" aria-label="How everything is" data-testid="home-hero">
    <div class="hom-hero__head">
      <div class="hom-hero__hello">
        <p class="hom-hero__date">{{ dateLabel }}</p>
        <h1 class="hom-hero__greeting" data-testid="home-greeting">{{ greeting }}</h1>
      </div>
      <div class="hom-verdict" role="status" aria-live="polite" data-testid="home-verdict">
        <span class="hom-verdict__ring"><HomeIcon :name="glyph" /></span>
        <div class="hom-verdict__text">
          <div class="hom-verdict__title">{{ verdict.title }}</div>
          <div v-if="verdict.detail" class="hom-verdict__detail">{{ verdict.detail }}</div>
        </div>
      </div>
    </div>

    <ul v-if="shown.length" class="hom-findings" aria-label="What needs you">
      <li v-for="finding in shown" :key="finding.id" class="hom-finding" :data-tone="finding.tone" :data-testid="`finding-${finding.id}`">
        <HomeIcon class="hom-finding__mark" :name="finding.tone === 'crit' ? 'octagon-x' : finding.tone === 'warn' ? 'alert' : 'info'" />
        <span class="hom-finding__system">{{ finding.system }}</span>
        <span class="hom-finding__title">{{ finding.title }}</span>
        <span v-if="finding.detail" class="hom-finding__detail">{{ finding.detail }}</span>
        <span v-if="finding.since" class="hom-finding__since hom-num" :title="new Date(finding.since).toLocaleString()">{{ age(finding.since) }}</span>
        <span class="hom-finding__acts">
          <button
            v-if="finding.action === 'restart-service' && canRestart && finding.service"
            class="hom-btn hom-btn--xs"
            :disabled="!!pendingRestart"
            :data-testid="`finding-restart-${finding.service}`"
            @click="emit('restart', finding.service!)"
          ><HomeIcon name="restart" :class="{ 'hom-spin': pendingRestart === finding.service }" />{{ pendingRestart === finding.service ? 'Restarting' : 'Restart' }}</button>
          <NuxtLink v-if="finding.href" class="hom-btn hom-btn--xs hom-btn--ghost" :to="finding.href">Open<HomeIcon name="arrow-right" /></NuxtLink>
          <button
            class="hom-iconbtn"
            title="Known: stop counting this for a day"
            :aria-label="`Mute ${finding.title} for a day`"
            :data-testid="`finding-mute-${finding.id}`"
            @click="emit('mute', finding.id, true)"
          ><HomeIcon name="mute" /></button>
        </span>
      </li>
      <li v-if="hiddenCount" class="hom-findings__more">
        <button class="hom-link" data-testid="findings-more" @click="expanded = !expanded">{{ expanded ? 'Show fewer' : `${hiddenCount} more` }}</button>
      </li>
    </ul>

    <div v-if="quiet.length" class="hom-quiet" data-testid="home-quiet">
      <span class="hom-quiet__label">Known</span>
      <span v-for="finding in quiet.slice(0, 5)" :key="finding.id" class="hom-quiet__item" :data-tone="finding.tone" :data-muted="muted.has(finding.id) || undefined">
        <NuxtLink v-if="finding.href" :to="finding.href">{{ finding.title }}<template v-if="finding.detail"> · {{ finding.detail }}</template></NuxtLink>
        <template v-else>{{ finding.title }}</template>
        <button v-if="finding.action === 'resume-fleet' && canFleet" class="hom-btn hom-btn--xs" :disabled="pendingFleet" data-testid="quiet-resume-fleet" @click="emit('resume')"><HomeIcon name="play" />Resume</button>
        <button v-if="muted.has(finding.id)" class="hom-iconbtn hom-iconbtn--sm" :aria-label="`Count ${finding.title} again`" title="Count this again" @click="emit('mute', finding.id, false)"><HomeIcon name="bell" /></button>
      </span>
      <span v-if="quiet.length > 5" class="hom-quiet__item hom-dim">+{{ quiet.length - 5 }}</span>
    </div>

    <div v-if="server" class="hom-vitals" data-testid="home-vitals">
      <component :is="adminLink ? NuxtLinkComp : 'div'" v-bind="adminLink ? { to: '/admin' } : {}" class="hom-vital" :data-tone="cpuTone" data-testid="vital-cpu">
        <span class="hom-vital__label"><HomeIcon name="cpu" />CPU</span>
        <span class="hom-vital__value hom-num">{{ pct(vitals.cpuNow) }}</span>
        <HomeSpark class="hom-vital__spark" :points="vitals.cpu" :min="0" :max="100" :tone="cpuTone === 'ok' ? 'data' : cpuTone" label="CPU over the hour" />
      </component>
      <component :is="adminLink ? NuxtLinkComp : 'div'" v-bind="adminLink ? { to: '/admin' } : {}" class="hom-vital" :data-tone="ramTone" data-testid="vital-ram">
        <span class="hom-vital__label"><HomeIcon name="memory" />Memory</span>
        <span class="hom-vital__value hom-num">{{ pct(vitals.ramNow) }}</span>
        <HomeSpark class="hom-vital__spark" :points="vitals.ram" :min="0" :max="100" :tone="ramTone === 'ok' ? 'data' : ramTone" label="Memory over the hour" />
      </component>
      <component :is="adminLink ? NuxtLinkComp : 'div'" v-bind="adminLink ? { to: '/admin' } : {}" class="hom-vital" :data-tone="diskInfo.tone" data-testid="vital-disk">
        <span class="hom-vital__label"><HomeIcon name="drive" />{{ diskInfo.name || 'Disk' }}</span>
        <span class="hom-vital__value hom-num">{{ diskInfo.free }}</span>
        <span class="hom-vital__meter" role="meter" :aria-valuenow="diskInfo.used" aria-valuemin="0" aria-valuemax="100" :aria-label="`${diskInfo.name} used`"><span :style="{ width: `${diskInfo.used}%` }"></span></span>
      </component>
      <component :is="apiLink ? NuxtLinkComp : 'div'" v-bind="apiLink ? { to: '/administration/api-telemetry' } : {}" class="hom-vital" :data-tone="apiTone" data-testid="vital-api">
        <span class="hom-vital__label"><HomeIcon name="activity" />API</span>
        <span class="hom-vital__value hom-num">{{ vitals.requestsPerMin != null ? fmtInt(vitals.requestsPerMin) : '—' }}<small>/min</small></span>
        <span class="hom-vital__sub">{{ apiSub }}</span>
      </component>
      <component :is="logsLink ? NuxtLinkComp : 'div'" v-bind="logsLink ? { to: '/administration/botlogs?type=error' } : {}" class="hom-vital" :data-tone="errorTone" data-testid="vital-errors">
        <span class="hom-vital__label"><HomeIcon name="logs" />Errors</span>
        <span class="hom-vital__value hom-num">{{ fmtInt(server.ErrorsLastHour ?? null) }}<small>/h</small></span>
        <span class="hom-vital__sub">{{ errorSub }}</span>
      </component>
      <component :is="adminLink ? NuxtLinkComp : 'div'" v-bind="adminLink ? { to: '/admin' } : {}" class="hom-vital" data-tone="ok" data-testid="vital-uptime">
        <span class="hom-vital__label"><HomeIcon name="clock" />Up</span>
        <span class="hom-vital__value hom-num">{{ uptime }}</span>
        <span class="hom-vital__sub"><template v-if="server.Build?.CommitShort"><span class="hom-mono">{{ server.Build.CommitShort }}</span> · </template>{{ servicesLine }}</span>
      </component>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, resolveComponent } from 'vue';
import { fmtDuration, fmtGB, fmtInt, fmtRelative, isNum, parseTimeSpan, toMs } from '~/scripts/adminConsole';
import { downServices, type HomeFinding, type HomeServer, type HomeVerdict } from '~/scripts/home';
import type { SeriesPoint } from '~/scripts/adminConsole';

/*
 * The first thing on the page: hello, the verdict, what needs you (each with the way to fix it), what is
 * known and quietly true, and the server's vitals in one line. A three-second look should be enough.
 */
const props = defineProps<{
  greeting: string;
  dateLabel: string;
  verdict: HomeVerdict;
  loud: HomeFinding[];
  quiet: HomeFinding[];
  muted: Set<string>;
  server: HomeServer | null;
  vitals: { cpu: SeriesPoint[]; ram: SeriesPoint[]; requests: SeriesPoint[]; requestsPerMin: number | null; serverErrorsPerMin: number | null; cpuNow: number | null; ramNow: number | null };
  now: number;
  canRestart: boolean;
  canFleet: boolean;
  pendingRestart: string;
  pendingFleet: boolean;
  adminLink: boolean;
  apiLink: boolean;
  logsLink: boolean;
}>();
const emit = defineEmits<{ mute: [id: string, on: boolean]; restart: [service: string]; resume: [] }>();

const NuxtLinkComp = resolveComponent('NuxtLink');
const expanded = ref(false);
const LIMIT = 4;
const shown = computed(() => (expanded.value ? props.loud : props.loud.slice(0, LIMIT)));
const hiddenCount = computed(() => Math.max(0, props.loud.length - LIMIT));

const glyph = computed(() => ({ ok: 'check-circle', warn: 'alert', crit: 'octagon-x', neutral: 'clock' } as Record<string, string>)[props.verdict.tone] ?? 'info');

const pct = (value: number | null) => (value == null ? '—' : `${value.toFixed(0)}%`);
const toneFor = (value: number | null, warn: number, crit: number) => (value == null ? 'neutral' : value >= crit ? 'crit' : value >= warn ? 'warn' : 'ok');
const cpuTone = computed(() => toneFor(props.vitals.cpuNow, 85, 97));
const ramTone = computed(() => toneFor(props.vitals.ramNow, 88, 95));

const diskInfo = computed(() => {
  const disks = props.server?.DiskStatistics ?? [];
  // The fullest volume is the one to watch.
  const disk = [...disks].sort((a, b) => b.UsagePercentage - a.UsagePercentage)[0];
  if (!disk) return { name: '', free: '—', used: 0, tone: 'neutral' };
  const tone = disk.UsagePercentage >= 97 || disk.FreeSpaceGB < 5 ? 'crit' : disk.UsagePercentage >= 90 || disk.FreeSpaceGB < 20 ? 'warn' : 'ok';
  return { name: disk.DriveName.replace(/\\$/, ''), free: `${fmtGB(disk.FreeSpaceGB, 0)} free`, used: Math.min(100, Math.round(disk.UsagePercentage)), tone };
});

const apiTone = computed(() => {
  const perMin = props.vitals.requestsPerMin;
  const failing = props.vitals.serverErrorsPerMin;
  if (perMin == null || failing == null || perMin <= 0) return 'data';
  const share = (failing / perMin) * 100;
  return share >= 25 ? 'crit' : share >= 5 ? 'warn' : 'data';
});
const apiSub = computed(() => {
  const failing = props.vitals.serverErrorsPerMin;
  if (props.vitals.requestsPerMin == null) return 'reading the last hour…';
  return failing != null && failing >= 0.05 ? `${failing.toFixed(failing >= 10 ? 0 : 1)} failing a minute` : 'none failing';
});

const errorTone = computed(() => {
  const count = props.server?.ErrorsLastHour;
  return !isNum(count) ? 'neutral' : count >= 200 ? 'crit' : count >= 30 ? 'warn' : 'ok';
});
const errorSub = computed(() => {
  const services = props.server?.Services ?? [];
  const loudest = [...services].sort((a, b) => (b.ErrorsLastHour ?? 0) - (a.ErrorsLastHour ?? 0))[0];
  return loudest && (loudest.ErrorsLastHour ?? 0) > 0 ? `mostly ${loudest.Name}` : 'nothing logged';
});

const uptime = computed(() => {
  const started = toMs(props.server?.Build?.ProcessStartedUtc);
  if (started != null) return fmtDuration((props.now - started) / 1000);
  const seconds = parseTimeSpan(props.server?.BotUptime);
  return seconds != null ? fmtDuration(seconds) : props.server?.BotUptimeHumanized || '—';
});
const servicesLine = computed(() => {
  const down = downServices(props.server).length;
  const total = props.server?.TotalServicesRegistered;
  return down ? `${down} stopped` : isNum(total) ? `${total} services` : '';
});

function age(since: number): string {
  return fmtRelative(since, props.now).replace(' ago', '');
}
</script>
