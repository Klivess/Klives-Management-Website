<template>
  <Teleport to="body">
    <div v-if="ip" class="odx-layer">
      <aside class="odx-sheet" role="dialog" aria-modal="false" :aria-label="`Address ${ip}`" :style="{ '--cls': classInfo.color }" data-testid="odx-sheet" @keydown.esc.stop="emit('close')">
        <header class="odx-sheet__head">
          <div class="odx-sheet__toprow">
            <span class="odx-sheet__ip" data-testid="odx-sheet-ip">{{ ip }}</span>
            <button class="odx-iconbtn odx-iconbtn--sm" title="Copy the address" aria-label="Copy the address" @click="copy(ip)"><DefenceIcon name="copy" /></button>
            <span style="flex: 1"></span>
            <button v-if="allowed.traffic" class="odx-btn odx-btn--xs odx-btn--ghost" title="Show only this address's requests" @click="emit('traffic', ip)"><DefenceIcon name="activity" />Traffic</button>
            <button class="odx-iconbtn" title="Close (Esc)" aria-label="Close" data-testid="odx-sheet-close" @click="emit('close')"><DefenceIcon name="x" /></button>
          </div>
          <div class="odx-sheet__where">
            <span>{{ fmtGeo(record) }}</span>
            <span class="odx-faint">·</span>
            <span class="odx-truncate odx-dim">{{ fmtNetwork(record) }}</span>
          </div>
          <div class="odx-sheet__tags">
            <DefenceClassPill :id="classId" :classes="classes" :confidence="confidence" />
            <span v-if="fp?.ManualClass" class="odx-chip" data-tone="info" title="Labelled by hand, not by the classifier">manual</span>
            <DefenceStatusChip :status="status" />
            <span v-if="record?.profileName" class="odx-chip" :data-tone="record.isKlives ? 'info' : 'neutral'"><DefenceIcon name="user-check" />{{ record.profileName }}</span>
            <span v-if="record?.isKlives" class="odx-chip" data-tone="ok" title="Linked to a Klives-rank profile: the server refuses to block or trap it"><DefenceIcon name="lock" />Protected</span>
            <span v-for="tag in tags" :key="tag" class="odx-chip" :data-tone="tagTone(tag)">{{ tag }}</span>
          </div>
          <div class="odx-verdictline">
            <span class="odx-dim" style="font-size: 11.5px; white-space: nowrap">{{ confidence != null ? `${Math.round(confidence * 100)}% sure` : 'Not classified yet' }}</span>
            <span class="odx-confbar"><span :style="{ width: `${Math.round((confidence ?? 0) * 100)}%` }"></span></span>
            <span v-if="loading" class="odx-dim" style="font-size: 11.5px"><DefenceIcon name="refresh" class="odx-spin" /></span>
          </div>
        </header>

        <div class="odx-sheet__body">
          <!-- what to do about it -->
          <section v-if="allowed.block" class="odx-sheet__section" aria-label="Status">
            <h4>Treat it as
              <span v-if="record?.lastBlockReason && status === 'Blocked'" class="odx-card__tools odx-dim" :title="record.lastBlockReason" style="max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ record.lastBlockReason }}</span>
            </h4>
            <div class="odx-acts">
              <button
                v-for="option in STATUS_OPTIONS"
                :key="option"
                class="odx-statusbtn"
                :data-tone="statusTone(option) === 'neutral' ? 'ok' : statusTone(option)"
                :aria-pressed="status === option"
                :disabled="(record?.isKlives && option !== 'Normal' && option !== 'Watch') || !!pending || status === option"
                :title="statusAbout(option)"
                :data-testid="`sheet-status-${option}`"
                @click="choose(option)"
              >
                <span class="odx-statusbtn__name"><DefenceIcon :name="statusIcon(option)" />{{ statusVerb(option) }}</span>
                <span class="odx-statusbtn__about">{{ statusAbout(option) }}</span>
              </button>
            </div>
            <p v-if="pending" class="odx-note" style="margin-top: 8px"><DefenceIcon name="refresh" class="odx-spin" /> {{ pending }}…</p>
            <p v-else-if="record?.isKlives" class="odx-note" style="margin-top: 8px">This address belongs to a Klives-rank profile. The server will not block, tarpit or trap it.</p>
          </section>

          <!-- the figures -->
          <section class="odx-sheet__section" aria-label="Figures">
            <div class="odx-facts">
              <div>
                <div class="odx-fact__label">Threat score</div>
                <div class="odx-fact__value" :data-tone="scoreTone(record?.score ?? 0, watchAt, blockAt) === 'neutral' ? undefined : scoreTone(record?.score ?? 0, watchAt, blockAt)">{{ Math.round(record?.score ?? 0) }} <small>/ {{ blockAt }}</small></div>
              </div>
              <div><div class="odx-fact__label">Requests</div><div class="odx-fact__value">{{ fmtInt(record?.total) }}</div></div>
              <div><div class="odx-fact__label">Denied</div><div class="odx-fact__value" :data-tone="(record?.deny ?? 0) > 0 ? 'warn' : undefined">{{ fmtInt(record?.deny) }}</div></div>
              <div><div class="odx-fact__label">Not signed in</div><div class="odx-fact__value">{{ fmtInt(record?.unauth) }}</div></div>
              <div><div class="odx-fact__label">First seen</div><div class="odx-fact__value" :title="fmtFull(record?.firstSeen)">{{ fmtAgo(record?.firstSeen, now) }}</div></div>
              <div><div class="odx-fact__label">Last seen</div><div class="odx-fact__value" :title="fmtFull(record?.lastSeen)">{{ fmtAgo(record?.lastSeen, now) }}</div></div>
            </div>
          </section>

          <!-- note -->
          <section v-if="allowed.act" class="odx-sheet__section" aria-label="Note">
            <h4>Note
              <span class="odx-card__tools"><button v-if="noteDirty" class="odx-btn odx-btn--xs" data-testid="sheet-note-save" @click="saveNote"><DefenceIcon name="check" />Save</button></span>
            </h4>
            <textarea v-model="note" class="odx-textarea" placeholder="What you know about this address (Ctrl+Enter saves)" rows="2" data-testid="sheet-note" @keydown.ctrl.enter.prevent="saveNote" @keydown.meta.enter.prevent="saveNote"></textarea>
          </section>

          <!-- why -->
          <section v-if="fp" class="odx-sheet__section" aria-label="Why this class">
            <h4>Why {{ classInfo.label.toLowerCase() }}</h4>
            <ol class="odx-evidence">
              <li v-for="(e, i) in (fp.Evidence || []).slice(0, 8)" :key="i" :style="{ '--cls': colorOf(e.Class) }">
                <span class="odx-evidence__w">{{ weightLabel(e) }}</span>
                <span>{{ e.Reason }}</span>
              </li>
            </ol>
            <div v-if="runnersUp.length" class="odx-note" style="margin-top: 6px">
              Also scored: <span v-for="(s, i) in runnersUp" :key="s.id">{{ i ? ' · ' : '' }}<span :style="{ color: colorOf(s.id) }">{{ labelOf(s.id) }} {{ s.score }}</span></span>
            </div>
          </section>

          <!-- behaviour -->
          <section v-if="fp" class="odx-sheet__section" aria-label="Behaviour">
            <h4>Behaviour</h4>
            <dl class="odx-kv">
              <div><dt>Requests</dt><dd>{{ fmtInt(fp.Requests) }} in {{ fmtInt(fp.Sessions) }} session{{ fp.Sessions === 1 ? '' : 's' }}</dd></div>
              <div><dt>Busiest minute</dt><dd>{{ fmtInt(fp.PeakPerMinute) }} requests</dd></div>
              <div><dt>Pacing</dt><dd>{{ pacing }}</dd></div>
              <div><dt>Not found</dt><dd>{{ fmtPct(fp.Requests ? fp.NotFound / fp.Requests : 0) }}</dd></div>
              <div><dt>Routes tried</dt><dd>{{ (fp.Routes || []).length }}{{ fp.RoutesCapped ? '+' : '' }}</dd></div>
              <div><dt>Through the site</dt><dd>{{ fmtPct(fp.Requests ? fp.WebsiteRequests / fp.Requests : 0) }}</dd></div>
              <div v-if="fp.AuthFailures"><dt>Auth failures</dt><dd>{{ fmtInt(fp.AuthFailures) }}</dd></div>
              <div v-if="fp.LoginAttempts"><dt>Sign-ins</dt><dd>{{ fmtInt(fp.LoginFailures) }} of {{ fmtInt(fp.LoginAttempts) }} failed</dd></div>
              <div v-if="fp.HoneypotHits"><dt>Honeypots</dt><dd>{{ fmtInt(fp.HoneypotHits) }} hit{{ fp.HoneypotHits === 1 ? '' : 's' }}</dd></div>
              <div v-if="fp.RobotsFetches || fp.RobotsTrapHits"><dt>robots.txt</dt><dd>{{ fp.RobotsFetches }} read · {{ fp.RobotsTrapHits }} trap</dd></div>
            </dl>
            <div v-if="fp.SampleProbes?.length" class="odx-sheet__tags">
              <span v-for="probe in fp.SampleProbes.slice(0, 8)" :key="probe" class="odx-chip odx-chip--mono" data-tone="crit">{{ probe }}</span>
            </div>
            <div class="odx-hours" title="Requests by hour of the day (UTC)">
              <span v-for="(h, i) in hours" :key="i" :style="{ height: h.height }" :title="`${String(i).padStart(2, '0')}:00 UTC: ${h.count}`"></span>
            </div>
            <div class="odx-hours-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>UTC</span></div>
          </section>

          <!-- network -->
          <section class="odx-sheet__section" aria-label="Network">
            <h4>Network</h4>
            <dl class="odx-kv">
              <div><dt>Owner</dt><dd :title="fmtNetwork(record)">{{ intel?.AsName || record?.asName || record?.asn || '—' }}</dd></div>
              <div><dt>ISP</dt><dd>{{ record?.isp || record?.org || '—' }}</dd></div>
              <div class="wide"><dt>Reverse DNS</dt><dd class="mono">{{ rdns }}</dd></div>
              <div><dt>Kind</dt><dd>{{ networkKind }}</dd></div>
              <div><dt>Time zone</dt><dd>{{ intel?.Timezone || record?.timezone || '—' }}</dd></div>
              <div v-if="intel?.DatacenterProvider"><dt>Cloud</dt><dd>{{ intel.DatacenterProvider }}</dd></div>
              <div v-if="intel?.VerifiedCrawler"><dt>Verified as</dt><dd>{{ intel.VerifiedCrawler }}</dd></div>
              <div v-if="intel?.ResearchScanner"><dt>Survey</dt><dd>{{ intel.ResearchScanner }}</dd></div>
              <div v-if="abuse"><dt>AbuseIPDB</dt><dd>{{ abuse.Score ?? abuse.score }}% · {{ abuse.Reports ?? abuse.reports ?? 0 }} reports</dd></div>
              <div v-if="greyNoise"><dt>GreyNoise</dt><dd>{{ greyNoiseLabel }}</dd></div>
            </dl>
          </section>

          <!-- client -->
          <section v-if="fp && (userAgents.length || fp.BrowserClaims)" class="odx-sheet__section" aria-label="HTTP client">
            <h4>Client</h4>
            <div v-for="ua in userAgents" :key="ua.value" class="odx-mini-row">
              <span class="odx-mono odx-truncate" :title="ua.value">{{ ua.value || '(no user agent)' }}</span><b class="odx-num">{{ fmtInt(ua.count) }}</b>
            </div>
            <dl class="odx-kv" style="margin-top: 6px">
              <div><dt>Claims to be</dt><dd>{{ topKey(fp.UaFamilies) || '—' }}</dd></div>
              <div><dt>Kind</dt><dd>{{ topKey(fp.UaKinds) || '—' }}</dd></div>
              <div v-if="fp.BrowserClaims" class="wide"><dt>Header check</dt><dd>{{ headerCheck }}</dd></div>
              <div class="wide"><dt>JA4H-lite</dt><dd class="mono">{{ topKey(fp.Ja4h) || '—' }}</dd></div>
            </dl>
          </section>

          <!-- beacon -->
          <section v-if="fp?.Beacon" class="odx-sheet__section" aria-label="Browser beacon">
            <h4>Browser beacon</h4>
            <dl class="odx-kv">
              <div><dt>Beacons</dt><dd>{{ fmtInt(fp.Beacon.Count) }}</dd></div>
              <div><dt>Real input</dt><dd>{{ inputLabel }}</dd></div>
              <div><dt>Screen</dt><dd>{{ fp.Beacon.Screen || '—' }}</dd></div>
              <div><dt>Platform</dt><dd>{{ fp.Beacon.Platform || '—' }}</dd></div>
              <div><dt>Time zone</dt><dd>{{ fp.Beacon.Timezone || '—' }}<span v-if="fp.Beacon.TimezoneMatchesGeo === false" style="color: var(--odx-warn)"> ≠ address</span></dd></div>
              <div><dt>Hardware</dt><dd>{{ fp.Beacon.Cores ?? '?' }} cores · {{ fp.Beacon.MemoryGb ?? '?' }} GB</dd></div>
              <div class="wide"><dt>GPU</dt><dd>{{ fp.Beacon.WebglRenderer || '—' }}</dd></div>
            </dl>
            <div v-if="fp.Beacon.Webdriver || fp.Beacon.Anomalies?.length" class="odx-sheet__tags">
              <span v-if="fp.Beacon.Webdriver" class="odx-chip" data-tone="crit">navigator.webdriver</span>
              <span v-for="a in fp.Beacon.Anomalies" :key="a" class="odx-chip" data-tone="warn">{{ a }}</span>
            </div>
          </section>

          <!-- devices -->
          <section v-if="devices.length || linkedIps.length" class="odx-sheet__section" aria-label="Devices">
            <h4>Devices</h4>
            <div v-for="d in devices" :key="d.device_id" class="odx-mini-row"><span class="odx-mono odx-truncate">{{ d.device_id }}</span><b class="odx-num">{{ d.beacons }} beacons</b></div>
            <div v-if="linkedIps.length" class="odx-note" style="margin-top: 6px">
              The same device was seen on
              <button v-for="(l, i) in linkedIps" :key="l.device_id + l.ip" class="odx-ip-link" @click="emit('select', l.ip)">{{ i ? ', ' : '' }}{{ l.ip }}</button>
            </div>
          </section>

          <!-- activity -->
          <section v-if="detail?.recent?.length" class="odx-sheet__section" aria-label="Latest requests">
            <h4>Latest requests</h4>
            <div v-for="r in detail.recent.slice(0, 12)" :key="r.id" class="odx-mini-row" style="cursor: pointer" @click="emit('request', r.id)">
              <span class="odx-mono odx-truncate" :title="r.route"><span class="odx-faint">{{ r.method }}</span> {{ r.route }}</span>
              <span class="odx-http odx-mono" :data-tone="httpTone(r.status)" style="color: var(--tone); font-weight: 600">{{ r.status }}</span>
              <span class="odx-dim odx-num" style="font-size: 11px; width: 56px; text-align: right">{{ fmtAgo(r.ts, now) }}</span>
            </div>
          </section>

          <section v-if="history.length" class="odx-sheet__section" aria-label="History">
            <h4>What happened to it</h4>
            <div v-for="event in history" :key="event.id" class="odx-mini-row" :data-tone="describeEvent(event).tone">
              <span class="odx-truncate"><DefenceIcon :name="describeEvent(event).icon" style="color: var(--tone)" /> {{ describeEvent(event).label }}<span v-if="event.detail" class="odx-dim"> · {{ event.detail }}</span></span>
              <span class="odx-dim odx-num" style="font-size: 11px" :title="fmtFull(event.ts)">{{ fmtAgo(event.ts, now) }}</span>
            </div>
          </section>

          <section v-if="detail?.auth?.length" class="odx-sheet__section" aria-label="Sign-in events">
            <h4>Sign-in events</h4>
            <div v-for="a in detail.auth.slice(0, 8)" :key="a.id" class="odx-mini-row">
              <span class="odx-truncate"><span class="odx-chip" :data-tone="authTone(a.type)">{{ a.type }}</span> <span class="odx-mono odx-dim">{{ a.route }}</span></span>
              <span class="odx-dim odx-num" style="font-size: 11px">{{ fmtAgo(a.ts, now) }}</span>
            </div>
          </section>

          <!-- tools -->
          <section v-if="allowed.act" class="odx-sheet__section" aria-label="Tools">
            <h4>Tools</h4>
            <div class="odx-acts">
              <button class="odx-btn odx-btn--sm" :disabled="!!pending" title="Probe common ports on this address (once an hour)" data-testid="sheet-scan" @click="emit('scan', ip)"><DefenceIcon name="radar" />Port scan</button>
              <button class="odx-btn odx-btn--sm" :disabled="!!pending" title="Run the classifier again now" @click="emit('reclassify', ip)"><DefenceIcon name="refresh" />Reclassify</button>
              <label class="odx-field" style="height: 26px; flex: 1; min-width: 170px">
                <DefenceIcon name="tag" />
                <select v-model="override" class="odx-select" style="border: 0; height: 24px; padding-left: 0; background-color: transparent; flex: 1" aria-label="Label by hand" @change="applyOverride">
                  <option value="auto">Class: automatic</option>
                  <option v-for="c in classes" :key="c.id" :value="c.id">Label as {{ c.label }}</option>
                </select>
              </label>
            </div>
            <div v-if="scan" class="odx-note" style="margin-top: 10px" data-testid="sheet-scan-result">
              <template v-if="scan.error">Scan failed: {{ scan.error }}</template>
              <template v-else-if="scan.open.length">
                <b>{{ scan.open.length }} open</b> of {{ scan.probed.length }} probed:
                <span class="odx-ports" style="display: inline-flex; margin-left: 4px"><span v-for="port in scan.open" :key="port" class="odx-chip odx-chip--mono" data-tone="warn">{{ port }}</span></span>
              </template>
              <template v-else>No open ports among {{ scan.probed.length }} probed{{ scan.ms ? ` (${fmtMs(scan.ms)})` : '' }}.</template>
            </div>
          </section>
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { IpDetail } from '~/composables/useOmniDefence';
import {
  DEFAULT_CLASSES, authTone, describeEvent, fmtAgo, fmtFull, fmtGeo, fmtInt, fmtMs, fmtNetwork, fmtPct, httpTone,
  scoreTone, statusAbout, statusIcon, statusTone, statusVerb, type ClassInfo, normalizeScan,
} from '~/scripts/omniDefence';

/**
 * One address, everything known about it, and everything that can be done about it, in a sheet
 * that stays beside the page instead of replacing it.
 */
const props = defineProps<{
  ip: string | null;
  detail: IpDetail | null;
  loading: boolean;
  classes: readonly ClassInfo[];
  pending: string | undefined;
  allowed: { traffic: boolean; act: boolean; block: boolean };
  watchAt: number;
  blockAt: number;
  scan: ReturnType<typeof normalizeScan> | null;
  now: number;
}>();
const emit = defineEmits<{
  close: [];
  block: [ip: string];
  release: [ip: string];
  status: [ip: string, status: string];
  note: [ip: string, note: string];
  scan: [ip: string];
  reclassify: [ip: string];
  'set-class': [ip: string, cls: string | null];
  traffic: [ip: string];
  select: [ip: string];
  request: [id: number | string];
  copy: [text: string];
}>();

const STATUS_OPTIONS = ['Normal', 'Watch', 'Tarpit', 'Honeypot', 'Blocked'];

const record = computed(() => props.detail?.record ?? null);
const fp = computed(() => props.detail?.fingerprint ?? null);
const intel = computed(() => props.detail?.intel ?? null);
const abuse = computed(() => props.detail?.abuse ?? null);
const greyNoise = computed(() => props.detail?.greyNoise ?? null);
const devices = computed(() => props.detail?.devices ?? []);
const linkedIps = computed(() => props.detail?.linkedIps ?? []);
const status = computed(() => record.value?.status ?? 'Normal');
const classId = computed(() => fp.value?.Class || record.value?.classification || 'Unknown');
const confidence = computed<number | null>(() => (fp.value?.Confidence != null ? Number(fp.value.Confidence) : record.value?.classConfidence ?? null));
const classInfo = computed<ClassInfo>(() => (props.classes.length ? props.classes : DEFAULT_CLASSES).find(c => c.id === classId.value) ?? DEFAULT_CLASSES[DEFAULT_CLASSES.length - 1]);
const tags = computed<string[]>(() => (fp.value?.Tags?.length ? fp.value.Tags : record.value?.classTags ?? []).slice(0, 10));
const history = computed(() => (props.detail?.events ?? []).filter(e => e.kind !== 'GeoIP').slice(0, 12));

const note = ref('');
const override = ref('auto');
watch(() => [props.ip, record.value?.notes], () => { note.value = record.value?.notes ?? ''; }, { immediate: true });
watch(() => [props.ip, fp.value?.ManualClass], () => { override.value = fp.value?.ManualClass || 'auto'; }, { immediate: true });
const noteDirty = computed(() => (note.value ?? '').trim() !== (record.value?.notes ?? '').trim());

function saveNote() {
  if (!props.ip || !noteDirty.value) return;
  emit('note', props.ip, note.value);
}

function choose(option: string) {
  if (!props.ip) return;
  if (option === 'Blocked') emit('block', props.ip);
  else if (option === 'Normal') emit('release', props.ip);
  else emit('status', props.ip, option);
}

function applyOverride() {
  if (!props.ip) return;
  emit('set-class', props.ip, override.value === 'auto' ? null : override.value);
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); emit('copy', text); } catch { /* clipboard blocked */ }
}

const colorOf = (id: string) => props.classes.find(c => c.id === id)?.color ?? '#56636b';
const labelOf = (id: string) => props.classes.find(c => c.id === id)?.label ?? id;
const weightLabel = (e: any) => (Number(e.Weight) >= 99 ? 'RULE' : `${Number(e.Weight) > 0 ? '+' : ''}${Number(e.Weight).toFixed(1)}`);
const topKey = (map: Record<string, number> | null | undefined) => {
  if (!map) return null;
  let best: string | null = null, n = -1;
  for (const [key, value] of Object.entries(map)) if (value > n) { best = key; n = value; }
  return best;
};

function tagTone(tag: string): string {
  const t = tag.split(':')[0];
  if (['SpoofedUA', 'FakeCrawler', 'HoneypotHit', 'RobotsViolator', 'Tor', 'Abuse', 'Probe'].includes(t)) return 'crit';
  if (['Datacenter', 'VPN/Proxy', 'HostIsIP', 'NoSNI', 'TzMismatch', 'IpRotation', 'MultiDevice', 'PlainHTTP'].includes(t)) return 'warn';
  if (['RealInput', 'Verified', 'Authenticated', 'Residential', 'Mobile', 'Website'].includes(t)) return 'ok';
  return 'neutral';
}

const runnersUp = computed(() => Object.entries(fp.value?.Scores ?? {})
  .filter(([id, s]) => Number(s) > 0 && Number(s) < 99 && id !== classId.value)
  .sort((a, b) => Number(b[1]) - Number(a[1]))
  .slice(0, 3)
  .map(([id, score]) => ({ id, score: Number(score).toFixed(1) })));

const userAgents = computed(() => Object.entries(fp.value?.UserAgents ?? {})
  .sort((a, b) => Number(b[1]) - Number(a[1]))
  .slice(0, 3)
  .map(([value, count]) => ({ value, count: Number(count) })));

const hours = computed(() => {
  const h: number[] = fp.value?.HourHistogram ?? [];
  const max = Math.max(1, ...h);
  return Array.from({ length: 24 }, (_, i) => ({ count: h[i] || 0, height: `${Math.max(3, Math.round(((h[i] || 0) / max) * 100))}%` }));
});

const pacing = computed(() => {
  const f = fp.value;
  if (!f || f.GapCount < 2) return '—';
  const sd = Math.sqrt(f.GapM2 / (f.GapCount - 1));
  const cv = f.GapMean > 0 ? sd / f.GapMean : 0;
  return `${Number(f.GapMean).toFixed(1)} s apart ± ${sd.toFixed(1)}${cv < 0.3 ? ' (machine-regular)' : ''}`;
});

const rdns = computed(() => {
  const host = props.detail?.rdns?.Host || intel.value?.ReverseDns || record.value?.reverseDns;
  if (!host) return props.detail?.rdns ? 'No PTR record' : 'Not looked up yet';
  const confirmed = props.detail?.rdns?.ForwardConfirmed ?? intel.value?.ReverseDnsForwardConfirmed;
  return `${host}${confirmed ? ' ✓ confirmed' : ''}`;
});

const networkKind = computed(() => {
  const i = intel.value ?? {};
  const r = record.value;
  const parts: string[] = [];
  if (i.IsHosting || i.DatacenterProvider || r?.isHosting) parts.push('Datacenter');
  if (i.IsProxy || r?.isProxy) parts.push('VPN or proxy');
  if (i.IsTor) parts.push('Tor');
  if (i.IsMobile || r?.isMobile) parts.push('Mobile');
  if (!parts.length && (i.IsHosting === false || r?.isHosting === false)) parts.push('Home or office');
  return parts.join(' + ') || 'Unknown';
});

const greyNoiseLabel = computed(() => {
  const g = greyNoise.value;
  if (!g) return '—';
  if (g.Riot) return `Known service ${g.Name || ''}`.trim();
  if (!g.Noise) return 'Not seen scanning';
  return `${g.Classification || 'unknown'} ${g.Name || ''}`.trim();
});

const headerCheck = computed(() => {
  const f = fp.value;
  if (!f?.BrowserClaims) return '—';
  const issues: string[] = [];
  if (f.MissingClientHints) issues.push(`${f.MissingClientHints} without client hints`);
  if (f.MissingSecFetch) issues.push(`${f.MissingSecFetch} without Sec-Fetch`);
  if (f.MissingAcceptLanguage) issues.push(`${f.MissingAcceptLanguage} without Accept-Language`);
  if (f.SecChUaMismatch) issues.push(`${f.SecChUaMismatch} hint mismatch`);
  return issues.length ? issues.join(', ') : 'Consistent with a real browser';
});

const inputLabel = computed(() => {
  const b = fp.value?.Beacon;
  if (!b) return '—';
  const trusted = (b.TrustedPointer ?? 0) + (b.TrustedKeys ?? 0) + (b.TrustedScroll ?? 0) + (b.TrustedTouch ?? 0);
  if (!trusted) return b.UntrustedEvents ? `none (${b.UntrustedEvents} synthetic)` : 'none';
  return `${trusted} events${b.UntrustedEvents ? `, ${b.UntrustedEvents} synthetic` : ''}`;
});
</script>
