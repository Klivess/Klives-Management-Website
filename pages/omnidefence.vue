<template>
  <div class="odx" data-testid="odx-root">
    <!-- ── bar ── -->
    <header class="odx-bar">
      <div class="odx-bar__id">
        <span class="odx-bar__mark" :data-tone="verdict.tone"><DefenceIcon name="shield" /></span>
        <h1 class="odx-bar__title">OmniDefence</h1>
        <span class="odx-bar__sub">{{ subline }}</span>
      </div>

      <button class="odx-search" aria-label="Search addresses and actions" aria-keyshortcuts="Control+K" data-testid="odx-search" @click="paletteOpen = true">
        <DefenceIcon name="search" />
        <span class="odx-search__text">Find an address, block, release, export…</span>
        <span class="odx-kbd">Ctrl</span><span class="odx-kbd">K</span>
      </button>

      <span class="odx-bar__spacer"></span>

      <div class="odx-bar__actions">
        <button class="odx-live" :data-state="linkState" :data-tone="linkTone" :title="linkTitle" :aria-label="linkTitle" data-testid="odx-live" @click="defence.setLive(!prefs.live)">
          <span class="odx-live__dot"></span>
          <span class="odx-live__word">{{ linkWord }}</span>
          <span v-if="linkState === 'live'" :key="sweepKey" class="odx-live__sweep"></span>
        </button>
        <button class="odx-btn odx-btn--ghost" title="Refresh now (R)" aria-label="Refresh now" aria-keyshortcuts="R" data-testid="odx-refresh" @click="defence.refreshAll()">
          <DefenceIcon name="refresh" :class="{ 'odx-spin': busy.fast || busy.map }" />
        </button>
      </div>
    </header>

    <!-- The layout already provides the page's <main>. -->
    <div class="odx-main" :class="{ 'odx-enter': firstPaint }">
      <div v-if="!allowed.overview" class="odx-card">
        <div class="odx-empty"><DefenceIcon name="lock" />OmniDefence is not part of your access.</div>
      </div>

      <template v-else>
        <!-- ── verdict + figures ── -->
        <div class="odx-top" :class="{ 'odx-stale': waiting }">
          <DefenceVerdict :verdict="verdict" :overview="overview" :now="minuteNow" @jump="jump" />

          <div class="odx-kpis">
            <DefenceKpi label="Requests" icon="activity" :value="overview ? fmtCompact(overview.requests24h ?? 0) : null" unit="24 h" testid="kpi-requests">
              <template #sub>
                <template v-if="overview">7 days <b>{{ fmtCompact(overview.requests7d ?? 0) }}</b><template v-if="topOrigin"> · mostly {{ topOrigin }}</template></template>
              </template>
              <DefenceSpark v-if="requestSeries.length" :points="requestSeries" bars tone="info" label="Requests an hour" :format="v => `${fmtInt(v)} requests`" />
              <div v-else-if="originMix.length" style="padding-top: 18px">
                <div class="odx-mix" :title="originMix.map(o => `${o.label}: ${fmtInt(o.hits)}`).join('\n')">
                  <span v-for="o in originMix" :key="o.origin" :style="{ flex: o.hits, background: o.color }"></span>
                </div>
              </div>
            </DefenceKpi>

            <DefenceKpi label="Denied" icon="block" :value="overview ? fmtCompact(overview.denied24h ?? 0) : null" unit="24 h" :tone="deniedTone" :state="deniedTone === 'crit' ? 'Surge' : ''" clickable testid="kpi-denied" @open="showDenied">
              <template #sub>
                <template v-if="overview"><b>{{ deniedShare }}</b> of requests · {{ fmtInt(overview.authFailures24h ?? overview.unauth24h ?? 0) }} sign-in failures</template>
              </template>
              <DefenceSpark v-if="deniedSeries.length" :points="deniedSeries" bars :tone="deniedTone === 'ok' ? 'neutral' : deniedTone" label="Denied an hour" :format="v => `${fmtInt(v)} denied`" />
            </DefenceKpi>

            <DefenceKpi label="Visitors" icon="globe" :value="ips.length ? fmtInt(day.seen) : null" unit="24 h" clickable testid="kpi-visitors" @open="openAddresses({ seenWithinHours: 24 })">
              <template #sub>
                <template v-if="ips.length"><b>{{ fmtInt(day.fresh) }}</b> new · {{ fmtInt(ips.length) }} known</template>
              </template>
              <div v-if="dayMix.length" style="padding-top: 12px">
                <div class="odx-mix"><span v-for="g in dayMix" :key="g.id" :style="{ flex: g.count, background: g.color }"></span></div>
                <div class="odx-mix__legend"><span v-for="g in dayMix" :key="g.id"><i :style="{ background: g.color }"></i>{{ g.label }} {{ fmtInt(g.count) }}</span></div>
              </div>
            </DefenceKpi>

            <DefenceKpi label="Hostile" icon="shield-alert" :value="ips.length ? fmtInt(day.hostile) : null" unit="24 h" :tone="hostileTone" :state="review?.hostileAnsweredCount ? `${review.hostileAnsweredCount} answered` : ''" clickable testid="kpi-hostile" @open="openAddresses({ groups: ['hostile'], seenWithinHours: 24 })">
              <template #sub>
                <template v-if="ips.length"><b>{{ fmtInt(day.hostileFresh) }}</b> new today · {{ fmtInt(hostileKnown) }} known</template>
              </template>
              <div v-if="hostileMix.length" style="padding-top: 12px">
                <div class="odx-mix"><span v-for="c in hostileMix" :key="c.id" :style="{ flex: c.count, background: c.color }"></span></div>
                <div class="odx-mix__legend"><span v-for="c in hostileMix" :key="c.id"><i :style="{ background: c.color }"></i>{{ c.label }} {{ fmtInt(c.count) }}</span></div>
              </div>
            </DefenceKpi>

            <DefenceKpi label="Blocked" icon="lock" :value="overview ? fmtInt(overview.blockedIps ?? 0) : null" unit="addresses" clickable testid="kpi-blocked" @open="openAddresses({ statuses: ['Blocked'] })">
              <template #sub>
                <template v-if="overview">{{ fmtInt(overview.watchedIps ?? 0) }} watched · {{ fmtInt((overview.tarpitIps ?? 0) + (overview.honeypotIps ?? 0)) }} trapped<template v-if="regions.length"> · {{ regions.length }} region{{ regions.length === 1 ? '' : 's' }}</template></template>
              </template>
              <div v-if="statusMix.length" style="padding-top: 12px">
                <div class="odx-mix"><span v-for="m in statusMix" :key="m.id" :style="{ flex: m.count, background: m.color }"></span></div>
                <div class="odx-mix__legend"><span v-for="m in statusMix" :key="m.id"><i :style="{ background: m.color }"></i>{{ m.label }} {{ fmtInt(m.count) }}</span></div>
              </div>
            </DefenceKpi>
          </div>
        </div>

        <!-- ── map + review ── -->
        <div class="odx-mid">
          <section id="odx-map" class="odx-card odx-map" aria-label="Threat map" :data-flash="flashing === 'map' || undefined">
            <header class="odx-card__head">
              <h2 class="odx-card__title"><DefenceIcon name="map" />Who is out there</h2>
              <span class="odx-card__meta odx-num" data-testid="map-count">{{ fmtInt(mapPoints.length) }} shown</span>
              <div class="odx-card__tools">
                <div class="odx-seg" role="group" aria-label="Show">
                  <button v-for="g in MAP_GROUPS" :key="g.id" class="odx-seg__opt" :aria-pressed="mapGroup === g.id" @click="mapGroup = g.id">{{ g.label }}</button>
                </div>
                <div class="odx-seg" role="group" aria-label="Seen within">
                  <button v-for="w in MAP_WINDOWS" :key="w.hours" class="odx-seg__opt" :aria-pressed="mapHours === w.hours" @click="setWindow(w.hours)">{{ w.label }}</button>
                </div>
                <div class="odx-seg" role="group" aria-label="Colour by">
                  <button class="odx-seg__opt" :aria-pressed="prefs.colour === 'class'" @click="prefs.colour = 'class'">Class</button>
                  <button class="odx-seg__opt" :aria-pressed="prefs.colour === 'status'" @click="prefs.colour = 'status'">Status</button>
                </div>
                <button class="odx-btn odx-btn--sm" :aria-pressed="replaying" :disabled="!mapHours" :title="mapHours ? 'Replay arrivals across the window' : 'Pick a window to replay'" @click="toggleReplay">
                  <DefenceIcon :name="replaying ? 'pause' : 'history'" />Replay
                </button>
                <button v-if="allowed.regions" class="odx-btn odx-btn--sm" :aria-pressed="boxMode" title="Drag a box on the map to block a region" data-testid="map-box" @click="boxMode = !boxMode">
                  <DefenceIcon name="box" />Block a region
                </button>
                <button class="odx-iconbtn" :title="prefs.mapOpen ? 'Hide the map' : 'Show the map'" :aria-label="prefs.mapOpen ? 'Hide the map' : 'Show the map'" @click="prefs.mapOpen = !prefs.mapOpen">
                  <DefenceIcon :name="prefs.mapOpen ? 'chevron-up' : 'chevron-down'" />
                </button>
              </div>
            </header>

            <template v-if="prefs.mapOpen">
              <ClientOnly>
                <DefenceThreatMap
                  ref="threatMap"
                  :points="mapPoints"
                  :classes="classes"
                  :colour="prefs.colour"
                  :selected="selectedIp"
                  :regions="regions"
                  :box-mode="boxMode"
                  :busy="regionBusy"
                  :now="minuteNow"
                  :empty-text="ips.length ? 'No address matches these filters' : 'Reading every known address…'"
                  @select="ip => defence.openIp(ip)"
                  @traffic="showTrafficFor"
                  @block-region="blockRegion"
                  @remove-region="region => (regionToRemove = region)"
                >
                  <template #overlay>
                    <div v-if="replaying || replayAt" class="odx-map__replay">
                      <DefenceIcon name="history" />
                      <span class="odx-num" style="white-space: nowrap">{{ replayLabel }}</span>
                      <span class="odx-map__replay-track"><span class="odx-map__replay-fill" :style="{ width: `${replayProgress * 100}%` }"></span></span>
                      <button class="odx-btn odx-btn--xs odx-btn--ghost" @click="stopReplay">Done</button>
                    </div>
                  </template>
                </DefenceThreatMap>
              </ClientOnly>
              <div class="odx-legend" role="group" aria-label="Classes on the map">
                <button
                  v-for="c in legend"
                  :key="c.id"
                  class="odx-legend__chip"
                  :aria-pressed="!prefs.hiddenClasses.includes(c.id)"
                  :data-empty="!c.count || undefined"
                  :title="`${c.description} (click to hide or show)`"
                  @click="toggleClass(c.id)"
                >
                  <DefenceClassPill :id="c.id" :classes="classes" dot-only /><span>{{ c.label }}</span><b>{{ fmtInt(c.count) }}</b>
                </button>
                <span class="odx-legend__sep"></span>
                <span class="odx-dim" style="font-size: 11.5px; align-self: center">× blocked · ⌀ trapped · — tarpit · ring = seen today</span>
              </div>
            </template>
          </section>

          <div class="odx-side">
            <DefenceReviewCard
              :review="review"
              :classes="classes"
              :pending="pending"
              :can-block="allowed.block"
              :flash="flashing === 'review'"
              @open="ip => defence.openIp(ip)"
              @block="askBlock"
              @release="ip => defence.release(ip)"
              @more="goTab('review')"
            />
            <DefenceEventFeed :events="recentEvents" :counts24h="eventCounts ?? overview?.events24h ?? null" :now="minuteNow" @open="ip => defence.openIp(ip)" @more="goTab('events')" />
          </div>
        </div>

        <!-- ── workbench ── -->
        <section id="odx-work" class="odx-card odx-work" aria-label="Records" :data-flash="flashing === 'work' || undefined">
          <nav class="odx-tabs" role="tablist" aria-label="Records">
            <button v-for="tab in tabs" :key="tab.id" class="odx-tab" role="tab" :aria-selected="prefs.tab === tab.id" :data-testid="`tab-${tab.id}`" @click="goTab(tab.id)">
              <DefenceIcon :name="tab.icon" />{{ tab.label }}
              <span v-if="tabCount(tab.id)" class="odx-tab__count" :data-tone="tab.id === 'review' && tabCount(tab.id) ? 'warn' : undefined">{{ tabCount(tab.id) }}</span>
            </button>
            <div class="odx-tabs__tools">
              <span class="odx-dim" style="font-size: 11.5px"><span class="odx-kbd">/</span> to search</span>
            </div>
          </nav>

          <DefenceTrafficPanel
            v-if="prefs.tab === 'traffic'"
            ref="trafficPanel"
            :rows="traffic"
            :filter="trafficFilter"
            :busy="!!busy.traffic"
            :error="errors.traffic"
            :classes="classes"
            :ip-index="ipIndex"
            :now="now"
            :can-export="allowed.export"
            @apply="f => applyFilter('traffic', f)"
            @page="d => pageList('traffic', d)"
            @open="ip => defence.openIp(ip)"
            @request="openRequest"
            @export="defence.exportTable('requests')"
          />
          <DefenceAddressPanel
            v-else-if="prefs.tab === 'addresses'"
            ref="addressPanel"
            :ips="ips"
            :classes="classes"
            :selected="selectedIp"
            :pending="pending"
            :can-block="allowed.block"
            :can-export="allowed.export"
            :watch-at="watchAt"
            :block-at="blockAt"
            :now="minuteNow"
            :preset="addressPreset"
            @open="ip => defence.openIp(ip)"
            @block="askBlock"
            @release="ip => defence.release(ip)"
            @export="defence.exportTable('ip_records')"
          />
          <DefenceReviewCard
            v-else-if="prefs.tab === 'review'"
            full
            :review="review"
            :classes="classes"
            :pending="pending"
            :can-block="allowed.block"
            style="border: 0; background: none; box-shadow: none"
            @open="ip => defence.openIp(ip)"
            @block="askBlock"
            @release="ip => defence.release(ip)"
          />
          <DefenceAuthPanel
            v-else-if="prefs.tab === 'auth'"
            :rows="authEvents"
            :filter="authFilter"
            :busy="!!busy.auth"
            :error="errors.auth"
            :now="now"
            :can-export="allowed.export"
            @apply="f => applyFilter('auth', f)"
            @page="d => pageList('auth', d)"
            @open="ip => defence.openIp(ip)"
            @export="defence.exportTable('auth_events')"
          />
          <DefenceProfilePanel
            v-else-if="prefs.tab === 'profiles'"
            :rows="profileActions"
            :filter="profileFilter"
            :busy="!!busy.profiles"
            :error="errors.profiles"
            :now="now"
            :can-export="allowed.export"
            @apply="f => applyFilter('profiles', f)"
            @page="d => pageList('profiles', d)"
            @open="ip => defence.openIp(ip)"
            @export="defence.exportTable('profile_actions')"
          />
          <DefenceEventFeed
            v-else-if="prefs.tab === 'events'"
            full
            :events="eventsSupported ? recentEvents : null"
            :counts24h="eventCounts ?? overview?.events24h ?? null"
            :now="minuteNow"
            style="border: 0; background: none; box-shadow: none"
            @open="ip => defence.openIp(ip)"
          />
          <DefenceTrapsPanel
            v-else-if="prefs.tab === 'traps'"
            :honeypots="honeypots"
            :regions="regions"
            :ips="ips"
            :can-manage="allowed.honeypots"
            :can-regions="allowed.regions"
            :busy="!!busy.traps"
            :now="minuteNow"
            @arm="(route, note) => defence.addHoneypot(route, note)"
            @remove-trap="route => defence.removeHoneypot(route)"
            @remove-region="region => (regionToRemove = region)"
            @draw="drawRegion"
            @reload="defence.loadHoneypots()"
          />
          <DefenceFingerprintPanel
            v-else-if="prefs.tab === 'fingerprint'"
            :status="fpStatus"
            :thresholds="thresholds"
            :classes="classes"
            :can-edit="allowed.settings"
            :can-act="allowed.act"
            :save="defence.saveSettings"
            @reclassify="defence.reclassify(null)"
          />
        </section>
      </template>
    </div>

    <!-- ── one address ── -->
    <DefenceIpSheet
      :ip="selectedIp"
      :detail="detail"
      :loading="detailLoading"
      :classes="classes"
      :pending="selectedIp ? pending[selectedIp] : undefined"
      :allowed="allowed"
      :watch-at="watchAt"
      :block-at="blockAt"
      :scan="lastScan"
      :now="now"
      @close="defence.closeIp()"
      @block="askBlock"
      @release="ip => defence.release(ip)"
      @status="(ip, status) => defence.setStatus(ip, status)"
      @note="(ip, note) => defence.saveNote(ip, note)"
      @scan="ip => defence.scan(ip)"
      @reclassify="ip => defence.reclassify(ip)"
      @set-class="(ip, cls) => defence.setClass(ip, cls)"
      @traffic="showTrafficFor"
      @select="ip => defence.openIp(ip)"
      @request="openRequest"
      @copy="() => defence.notify('ok', 'Copied')"
    />

    <DefenceRequestDialog :open="requestOpen" :loading="requestLoading" :request="requestBody" @close="requestOpen = false" @open="ip => { requestOpen = false; defence.openIp(ip); }" @copy="copyText" />

    <!-- ── block: a reason first ── -->
    <DefenceDialog :open="!!blockFor" :title="`Block ${blockFor ?? ''}`" sub="Every request from it is refused from now on. You can release it again." icon="block" tone="crit" testid="odx-block-dialog" @close="blockFor = null">
      <div class="odx-reasons" role="group" aria-label="Reason">
        <button v-for="reason in reasonChoices" :key="reason" class="odx-reason" :aria-pressed="blockReason === reason" @click="blockReason = reason">{{ reason }}</button>
      </div>
      <input v-model="blockReason" class="odx-input" placeholder="Why (kept with the block)" data-autofocus data-testid="odx-block-reason" @keydown.enter.prevent="confirmBlock" />
      <p v-if="blockRecord" class="odx-note" style="margin-top: 10px">
        <DefenceClassPill :id="blockRecord.classification" :classes="classes" :confidence="blockRecord.classConfidence" /> · {{ fmtInt(blockRecord.total) }} requests · {{ fmtGeo(blockRecord) }}
      </p>
      <template #actions>
        <button class="odx-btn odx-btn--ghost" @click="blockFor = null">Cancel</button>
        <button class="odx-btn odx-btn--solid-danger" data-testid="odx-block-confirm" @click="confirmBlock"><DefenceIcon name="block" />Block</button>
      </template>
    </DefenceDialog>

    <DefenceDialog :open="!!regionToRemove" :title="`Remove region block #${regionToRemove?.id ?? ''}`" :sub="regionToRemove?.reason" icon="globe" tone="warn" @close="regionToRemove = null">
      <p class="odx-note">New visitors from inside the box will be let through again.</p>
      <label class="odx-check" style="margin-top: 10px"><input v-model="releaseRegionIps" type="checkbox" />Also release the addresses this rule blocked</label>
      <template #actions>
        <button class="odx-btn odx-btn--ghost" @click="regionToRemove = null">Cancel</button>
        <button class="odx-btn odx-btn--danger" @click="confirmRemoveRegion"><DefenceIcon name="trash" />Remove the rule</button>
      </template>
    </DefenceDialog>

    <DefenceCommandPalette :open="paletteOpen" :commands="commandsFor" @close="paletteOpen = false" />

    <Teleport to="body">
      <div v-if="toasts.length" class="odx-layer">
        <div class="odx-toasts" role="status" aria-live="polite">
          <div v-for="toast in toasts" :key="toast.id" class="odx-toast" :data-tone="toast.tone" data-testid="odx-toast">
            <DefenceIcon :name="toast.tone === 'crit' ? 'octagon-x' : toast.tone === 'warn' ? 'alert' : toast.tone === 'info' ? 'info' : 'check-circle'" />
            <span class="odx-toast__text">{{ toast.text }}</span>
            <button v-if="toast.action" class="odx-btn odx-btn--xs" data-testid="odx-toast-action" @click="runToast(toast)">{{ toast.action.label }}</button>
            <button class="odx-iconbtn odx-iconbtn--sm" aria-label="Dismiss" @click="defence.dismissToast(toast.id)"><DefenceIcon name="x" /></button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { AUTH_LIMIT, PROFILE_LIMIT, TABS, TRAFFIC_LIMIT, useOmniDefence, type DefenceTab, type DefenceToast } from '~/composables/useOmniDefence';
import {
  BLOCK_REASONS, GROUPS, HOSTILE_STATUSES, STATUS_COLORS, classGroup, dayActivity, fmtCompact, fmtGeo, fmtInt, hourlySeries,
  looksLikeIp, matchesText, originLabel, type AddressFilter, type ClassGroup, type DefenceCommand, type DefenceRegion,
} from '~/scripts/omniDefence';

definePageMeta({ layout: 'navbar' });

const route = useRoute();
const router = useRouter();
const defence = useOmniDefence();
const {
  allowed, tabs, overview, classes, ips, ipIndex, regions, honeypots, fpStatus, thresholds, traffic, authEvents, profileActions,
  recentEvents, eventCounts, eventsSupported, review, hourly, lastScan, now, busy, errors, linkState, verdict, prefs, selectedIp, detail,
  detailLoading, trafficFilter, authFilter, profileFilter, pending, toasts, routesMissing, startup,
} = defence;

const paletteOpen = ref(false);
const firstPaint = ref(true);
const flashing = ref<string | null>(null);
const boxMode = ref(false);
const regionBusy = ref(false);
const regionToRemove = ref<DefenceRegion | null>(null);
const releaseRegionIps = ref(false);
const blockFor = ref<string | null>(null);
const blockReason = ref('');
const requestOpen = ref(false);
const requestLoading = ref(false);
const requestBody = ref<any | null>(null);
const addressPreset = ref<Partial<AddressFilter> | null>(null);
const threatMap = ref<{ focus: (ip: any) => void } | null>(null);
const trafficPanel = ref<{ focus: () => void } | null>(null);
const addressPanel = ref<{ focus: () => void } | null>(null);

/** The clock the filters use: once a minute, so the map is not redrawn every second. */
const minuteNow = computed(() => Math.floor(now.value / 60_000) * 60_000);
const waiting = computed(() => routesMissing.value || startup.value?.ready === false);

const watchAt = computed(() => thresholds.value?.autoWatchScore ?? 50);
const blockAt = computed(() => thresholds.value?.autoBlockScore ?? 200);

// ───────────────────────────── bar ─────────────────────────────

const linkTone = computed(() => ({ live: 'ok', paused: 'neutral', stale: 'warn', offline: 'crit', connecting: 'neutral', starting: 'info' } as Record<string, string>)[linkState.value]);
const linkWord = computed(() => ({ live: 'Live', paused: 'Paused', stale: 'Stale', offline: 'Offline', connecting: 'Connecting', starting: 'Starting' } as Record<string, string>)[linkState.value]);
const linkTitle = computed(() => {
  if (linkState.value === 'live') return 'Live: figures every 15 seconds, addresses every minute. Click to pause.';
  if (linkState.value === 'paused') return 'Paused. Click to resume.';
  if (linkState.value === 'starting') return 'OmniDefence is starting on the server. This page keeps checking.';
  if (linkState.value === 'offline') return 'No answer from the server. Still trying.';
  return 'Connecting to the server';
});
const sweepKey = computed(() => overview.value?.asOfUtc ?? 'none');

const subline = computed(() => {
  if (routesMissing.value) return 'waiting for the server';
  if (!overview.value) return '';
  return `${fmtInt(ips.value.length || overview.value.knownIps || 0)} addresses known`;
});

// ───────────────────────────── figures ─────────────────────────────

const day = computed(() => dayActivity(ips.value, classes.value, minuteNow.value));
const hostileKnown = computed(() => ips.value.reduce((n, ip) => n + (classGroup(ip.classification, classes.value) === 'hostile' ? 1 : 0), 0));
const hostileTone = computed(() => ((review.value?.hostileAnsweredCount ?? 0) > 0 ? 'warn' : day.value.hostile ? 'neutral' : 'ok'));

const GROUP_COLORS: Record<ClassGroup, string> = { hostile: '#ff5d6c', human: '#52ffb9', bot: '#7aa7ff', unknown: '#56636b' };
const dayMix = computed(() => {
  const since = minuteNow.value / 1000 - 86_400;
  const counts: Record<ClassGroup, number> = { hostile: 0, human: 0, bot: 0, unknown: 0 };
  for (const ip of ips.value) if (ip.lastSeen >= since) counts[classGroup(ip.classification, classes.value)]++;
  return GROUPS.map(g => ({ id: g.id, label: g.label, count: counts[g.id], color: GROUP_COLORS[g.id] })).filter(g => g.count > 0);
});

/** Today's hostile visitors by what they are. */
const hostileMix = computed(() => {
  const since = minuteNow.value / 1000 - 86_400;
  const counts = new Map<string, number>();
  for (const ip of ips.value) {
    if (ip.lastSeen < since || classGroup(ip.classification, classes.value) !== 'hostile') continue;
    counts.set(ip.classification, (counts.get(ip.classification) ?? 0) + 1);
  }
  return classes.value.filter(c => counts.has(c.id)).map(c => ({ id: c.id, label: c.label, color: c.color, count: counts.get(c.id)! }))
    .sort((a, b) => b.count - a.count);
});

/** Everyone held back, by how: blocked, trapped, slowed, watched. */
const statusMix = computed(() => {
  const ov = overview.value;
  if (!ov) return [];
  return [
    { id: 'Blocked', label: 'Blocked', count: ov.blockedIps ?? 0, color: STATUS_COLORS.Blocked },
    { id: 'Honeypot', label: 'Trapped', count: ov.honeypotIps ?? 0, color: STATUS_COLORS.Honeypot },
    { id: 'Tarpit', label: 'Tarpit', count: ov.tarpitIps ?? 0, color: STATUS_COLORS.Tarpit },
    { id: 'Watch', label: 'Watch', count: ov.watchedIps ?? 0, color: STATUS_COLORS.Watch },
  ].filter(m => m.count > 0);
});

const requestSeries = computed(() => hourlySeries(hourly.value, b => b.requests, 24, minuteNow.value));
const deniedSeries = computed(() => hourlySeries(hourly.value, b => b.denied, 24, minuteNow.value));
const deniedShare = computed(() => {
  const ov = overview.value;
  if (!ov?.requests24h) return '0%';
  return `${Math.round(((ov.denied24h ?? 0) / ov.requests24h) * 100)}%`;
});
const deniedTone = computed(() => {
  const surge = verdict.value.issues.find(issue => issue.id === 'denied-surge');
  return surge ? surge.tone : 'ok';
});

const ORIGIN_COLORS: Record<string, string> = { ok: '#4fd18b', info: '#6aa8f7', warn: '#f5b942', crit: '#ff5d6c', neutral: '#586272' };
const originMix = computed(() => (overview.value?.originBreakdown ?? [])
  .filter(o => Number(o.hits) > 0)
  .map(o => ({ origin: o.origin, hits: Number(o.hits), label: originLabel(o.origin).label, color: ORIGIN_COLORS[originLabel(o.origin).tone] })));
const topOrigin = computed(() => {
  const top = [...originMix.value].sort((a, b) => b.hits - a.hits)[0];
  return top ? top.label.toLowerCase() : '';
});

// ───────────────────────────── map ─────────────────────────────

const MAP_GROUPS: { id: 'all' | ClassGroup; label: string }[] = [{ id: 'all', label: 'Everyone' }, { id: 'hostile', label: 'Hostile' }, { id: 'human', label: 'People' }, { id: 'bot', label: 'Bots' }];
const MAP_WINDOWS = [{ hours: 24, label: '24h' }, { hours: 168, label: '7d' }, { hours: 720, label: '30d' }, { hours: 0, label: 'All' }];
const mapGroup = ref<'all' | ClassGroup>('all');
const mapHours = ref(168);
const replayAt = ref<number | null>(null);
const replaying = ref(false);
let replayTimer: number | null = null;

const windowStart = computed(() => (mapHours.value ? minuteNow.value / 1000 - mapHours.value * 3600 : 0));

/** Everyone seen in the window, of the chosen kind, before the hidden classes are taken out. */
const inWindow = computed(() => {
  const since = windowStart.value;
  const group = mapGroup.value;
  const until = replayAt.value;
  return ips.value.filter(ip => ip.lastSeen >= since
    && (until == null || ip.firstSeen <= until)
    && (group === 'all' || classGroup(ip.classification, classes.value) === group));
});
const mapPoints = computed(() => {
  const hidden = new Set(prefs.value.hiddenClasses);
  return hidden.size ? inWindow.value.filter(ip => !hidden.has(ip.classification || 'Unknown')) : inWindow.value;
});
const legend = computed(() => {
  const counts = new Map<string, number>();
  for (const ip of inWindow.value) counts.set(ip.classification || 'Unknown', (counts.get(ip.classification || 'Unknown') ?? 0) + 1);
  return classes.value.map(c => ({ ...c, count: counts.get(c.id) ?? 0 }));
});

function toggleClass(id: string) {
  const hidden = prefs.value.hiddenClasses;
  prefs.value = { ...prefs.value, hiddenClasses: hidden.includes(id) ? hidden.filter(x => x !== id) : [...hidden, id] };
}

function setWindow(hours: number) {
  stopReplay();
  mapHours.value = hours;
}

const replayProgress = computed(() => {
  if (replayAt.value == null || !mapHours.value) return 0;
  const start = windowStart.value;
  const end = minuteNow.value / 1000;
  return Math.min(1, Math.max(0, (replayAt.value - start) / Math.max(1, end - start)));
});
const replayLabel = computed(() => {
  if (replayAt.value == null) return '';
  const at = new Date(replayAt.value * 1000);
  return at.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
});

/** Replays the window from its start: addresses appear as they first arrived, in about 12 seconds. */
function toggleReplay() {
  if (replaying.value) { replaying.value = false; if (replayTimer != null) window.clearInterval(replayTimer); replayTimer = null; return; }
  if (!mapHours.value) return;
  const start = windowStart.value;
  const end = minuteNow.value / 1000;
  if (replayAt.value == null || replayAt.value >= end) replayAt.value = start;
  replaying.value = true;
  const step = (end - start) / 120;
  replayTimer = window.setInterval(() => {
    const next = (replayAt.value ?? start) + step;
    if (next >= end) { replayAt.value = end; replaying.value = false; if (replayTimer != null) window.clearInterval(replayTimer); replayTimer = null; return; }
    replayAt.value = next;
  }, 100);
}

function stopReplay() {
  replaying.value = false;
  if (replayTimer != null) window.clearInterval(replayTimer);
  replayTimer = null;
  replayAt.value = null;
}

async function blockRegion(box: { latMin: number; latMax: number; lonMin: number; lonMax: number }, reason: string) {
  regionBusy.value = true;
  try {
    await defence.addRegion(box, reason);
    boxMode.value = false;
  } finally { regionBusy.value = false; }
}

async function confirmRemoveRegion() {
  const region = regionToRemove.value;
  if (!region) return;
  regionToRemove.value = null;
  await defence.removeRegion(region.id, releaseRegionIps.value);
  releaseRegionIps.value = false;
}

function drawRegion() {
  prefs.value = { ...prefs.value, mapOpen: true };
  boxMode.value = true;
  void jump('map');
}

// Keep the open address in view on the map.
watch(selectedIp, ip => {
  if (!ip) return;
  const record = ipIndex.value.get(ip);
  if (record) threatMap.value?.focus(record);
});

// ───────────────────────────── records ─────────────────────────────

function tabCount(id: DefenceTab): string {
  if (id === 'addresses') return ips.value.length ? fmtCompact(ips.value.length) : '';
  if (id === 'review') {
    const total = (review.value?.hostileAnsweredCount ?? 0) + (review.value?.benignPenalisedCount ?? 0);
    return total ? fmtInt(total) : '';
  }
  if (id === 'traps') {
    const n = (honeypots.value?.length ?? 0) + regions.value.length;
    return n ? fmtInt(n) : '';
  }
  return '';
}

function goTab(tab: DefenceTab) {
  defence.setTab(tab);
  void jump('work');
}

function applyFilter(list: 'traffic' | 'auth' | 'profiles', filter: any) {
  if (list === 'traffic') trafficFilter.value = { ...filter, offset: 0 };
  else if (list === 'auth') authFilter.value = { ...filter, offset: 0 };
  else profileFilter.value = { ...filter, offset: 0 };
  void defence.refreshList();
}

function pageList(list: 'traffic' | 'auth' | 'profiles', direction: number) {
  if (list === 'traffic') trafficFilter.value = { ...trafficFilter.value, offset: Math.max(0, trafficFilter.value.offset + direction * TRAFFIC_LIMIT) };
  else if (list === 'auth') authFilter.value = { ...authFilter.value, offset: Math.max(0, authFilter.value.offset + direction * AUTH_LIMIT) };
  else profileFilter.value = { ...profileFilter.value, offset: Math.max(0, profileFilter.value.offset + direction * PROFILE_LIMIT) };
  void defence.refreshList();
}

function openAddresses(preset: Partial<AddressFilter>) {
  addressPreset.value = { ...preset };
  defence.setTab('addresses');
  void jump('work');
}

function showDenied() {
  trafficFilter.value = { ...trafficFilter.value, ip: '', denyOnly: true, offset: 0 };
  if (prefs.value.tab === 'traffic') void defence.refreshList(); else defence.setTab('traffic');
  void jump('work');
}

function showTrafficFor(ip: string) {
  trafficFilter.value = { ip: ip, profile: '', route: '', status: '', method: '', origin: '', denyOnly: false, offset: 0 };
  if (prefs.value.tab === 'traffic') void defence.refreshList(); else defence.setTab('traffic');
  defence.closeIp();
  void jump('work');
}

async function openRequest(id: number | string) {
  requestOpen.value = true;
  requestLoading.value = true;
  requestBody.value = null;
  try { requestBody.value = await defence.loadRequest(id); } finally { requestLoading.value = false; }
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); defence.notify('ok', 'Copied'); } catch { defence.notify('warn', 'The browser would not copy that'); }
}

// ───────────────────────────── block ─────────────────────────────

const blockRecord = computed(() => (blockFor.value ? ipIndex.value.get(blockFor.value) ?? (detail.value?.ip === blockFor.value ? detail.value.record : null) : null));
const reasonChoices = computed(() => {
  const last = prefs.value.lastReason;
  return last && !BLOCK_REASONS.includes(last) ? [last, ...BLOCK_REASONS] : BLOCK_REASONS;
});

function askBlock(ip: string) {
  if (!allowed.value.block) return;
  const record = ipIndex.value.get(ip);
  if (record?.isKlives) { defence.notify('warn', `${ip} belongs to a Klives-rank profile and cannot be blocked`); return; }
  blockReason.value = suggestReason(ip);
  blockFor.value = ip;
}

/** A reason that fits what the classifier saw, so Enter is usually enough. */
function suggestReason(ip: string): string {
  const cls = ipIndex.value.get(ip)?.classification
    ?? review.value?.hostileAnswered.find(item => item.ip === ip)?.classification
    ?? (detail.value?.ip === ip ? detail.value.record?.classification : null);
  if (cls === 'VulnScanner') return 'Exploit probes';
  if (cls === 'CredentialAttacker') return 'Credential stuffing';
  if (cls === 'Scraper') return 'Scraping';
  if (cls === 'HeadlessAutomation') return 'Headless automation';
  return prefs.value.lastReason || 'Abuse';
}

async function confirmBlock() {
  const ip = blockFor.value;
  if (!ip) return;
  blockFor.value = null;
  await defence.block(ip, blockReason.value);
}

function runToast(toast: DefenceToast) {
  defence.dismissToast(toast.id);
  void toast.action?.run();
}

// ───────────────────────────── moving around ─────────────────────────────

async function jump(target: string) {
  if (target === 'review' || target === 'traffic' || target === 'fingerprint' || target === 'traps') {
    if (target === 'traffic') { showDenied(); return; }
    defence.setTab(target as DefenceTab);
    target = 'work';
  }
  if (target === 'status') target = 'work';
  await nextTick();
  const el = document.getElementById(`odx-${target}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  flashing.value = target;
  window.setTimeout(() => { if (flashing.value === target) flashing.value = null; }, 1_400);
}

function commandsFor(query: string): DefenceCommand[] {
  const list: DefenceCommand[] = [];
  const text = query.trim();

  // Addresses first when something address-like is typed.
  if (text.length >= 2) {
    const found = ips.value
      .filter(ip => matchesText(ip, text))
      .sort((a, b) => (a.ip.startsWith(text) ? 0 : 1) - (b.ip.startsWith(text) ? 0 : 1) || b.lastSeen - a.lastSeen)
      .slice(0, 8);
    for (const ip of found) {
      const cls = classes.value.find(c => c.id === ip.classification)?.label ?? ip.classification;
      list.push({ id: `ip-${ip.ip}`, group: 'Addresses', title: [ip.ip, cls, [ip.city, ip.country].filter(Boolean).join(', ')].filter(Boolean).join('  ·  '), icon: 'globe', hint: ip.status !== 'Normal' ? ip.status : '', run: () => defence.openIp(ip.ip) });
    }
    if (looksLikeIp(text) && !found.some(ip => ip.ip === text)) {
      list.push({ id: `ip-open-${text}`, group: 'Addresses', title: `Open ${text}`, icon: 'globe', hint: 'not seen yet', run: () => defence.openIp(text) });
    }
    if (looksLikeIp(text) && allowed.value.block) {
      list.push({ id: `ip-block-${text}`, group: 'Actions', title: `Block ${text}`, icon: 'block', danger: true, keywords: 'block ban refuse', run: () => askBlock(text) });
    }
  }

  for (const tab of tabs.value) list.push({ id: `go-${tab.id}`, group: 'Go to', title: tab.label, icon: tab.icon, run: () => goTab(tab.id) });
  list.push({ id: 'go-map', group: 'Go to', title: 'Map', icon: 'map', keywords: 'world where', run: () => { prefs.value = { ...prefs.value, mapOpen: true }; void jump('map'); } });

  list.push({ id: 'refresh', group: 'Actions', title: 'Refresh now', icon: 'refresh', hint: 'R', run: () => defence.refreshAll() });
  list.push({ id: 'live', group: 'Actions', title: prefs.value.live ? 'Pause live updates' : 'Resume live updates', icon: prefs.value.live ? 'pause' : 'play', run: () => defence.setLive(!prefs.value.live) });
  if (allowed.value.traffic) list.push({ id: 'denied', group: 'Actions', title: 'Show denied traffic', icon: 'block', keywords: 'refused 403 blocked requests', run: showDenied });
  list.push({ id: 'hostile', group: 'Actions', title: 'Show hostile addresses seen today', icon: 'shield-alert', keywords: 'attackers scanners', run: () => openAddresses({ groups: ['hostile'], seenWithinHours: 24 }) });
  list.push({ id: 'blocked', group: 'Actions', title: 'Show blocked addresses', icon: 'lock', run: () => openAddresses({ statuses: ['Blocked'] }) });
  list.push({ id: 'colour', group: 'Actions', title: prefs.value.colour === 'class' ? 'Colour the map by status' : 'Colour the map by class', icon: 'layers', run: () => { prefs.value = { ...prefs.value, colour: prefs.value.colour === 'class' ? 'status' : 'class' }; } });
  if (allowed.value.regions) list.push({ id: 'region', group: 'Actions', title: 'Block a region on the map…', icon: 'box', keywords: 'country area geo', run: drawRegion });
  if (allowed.value.honeypots) list.push({ id: 'trap', group: 'Actions', title: 'Arm a honeypot route…', icon: 'trap', keywords: 'trap path', run: () => goTab('traps') });
  if (allowed.value.act) list.push({ id: 'reclassify-all', group: 'Actions', title: 'Reclassify every address', icon: 'fingerprint', danger: true, run: () => defence.reclassify(null) });
  if (allowed.value.export) {
    for (const [table, label] of [['requests', 'requests'], ['ip_records', 'IP records'], ['auth_events', 'sign-in events'], ['ip_events', 'IP history'], ['profile_actions', 'profile actions']] as const) {
      list.push({ id: `export-${table}`, group: 'Actions', title: `Export ${label} (CSV)`, icon: 'download', keywords: 'download csv', run: () => defence.exportTable(table) });
    }
  }

  const ip = selectedIp.value;
  if (ip) {
    if (allowed.value.block) {
      const status = ipIndex.value.get(ip)?.status ?? detail.value?.record?.status ?? 'Normal';
      if (HOSTILE_STATUSES.includes(status as any)) list.push({ id: 'sel-release', group: 'This address', title: `Release ${ip}`, icon: 'release', hint: 'U', run: () => defence.release(ip) });
      if (status !== 'Blocked') list.push({ id: 'sel-block', group: 'This address', title: `Block ${ip}`, icon: 'block', hint: 'B', danger: true, run: () => askBlock(ip) });
    }
    if (allowed.value.act) list.push({ id: 'sel-scan', group: 'This address', title: `Port scan ${ip}`, icon: 'radar', run: () => defence.scan(ip) });
    if (allowed.value.traffic) list.push({ id: 'sel-traffic', group: 'This address', title: `Traffic from ${ip}`, icon: 'activity', run: () => showTrafficFor(ip) });
  }
  return list;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

function onKeydown(event: KeyboardEvent) {
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    paletteOpen.value = !paletteOpen.value;
    return;
  }
  if (event.key === 'Escape' && !paletteOpen.value && !blockFor.value && !requestOpen.value && !regionToRemove.value) {
    if (boxMode.value) { boxMode.value = false; return; }
    if (selectedIp.value) { defence.closeIp(); return; }
  }
  if (mod || event.altKey || paletteOpen.value || blockFor.value || requestOpen.value || isTyping(event.target)) return;
  const key = event.key.toLowerCase();
  if (event.key === '/') {
    event.preventDefault();
    if (prefs.value.tab === 'traffic') trafficPanel.value?.focus();
    else { if (prefs.value.tab !== 'addresses') defence.setTab('addresses'); void nextTick(() => addressPanel.value?.focus()); }
  } else if (key === 'r') {
    void defence.refreshAll();
  } else if (key === 'b' && selectedIp.value) {
    askBlock(selectedIp.value);
  } else if (key === 'u' && selectedIp.value) {
    void defence.release(selectedIp.value);
  }
}

// ───────────────────────────── the address bar ─────────────────────────────

// ?ip= opens an address and ?tab= a tab, so a link to either can be shared or bookmarked.
watch([selectedIp, () => prefs.value.tab], ([ip, tab]) => {
  const query: Record<string, string> = { ...(route.query as Record<string, string>) };
  if (ip) query.ip = ip; else delete query.ip;
  query.tab = tab;
  if (query.ip === route.query.ip && query.tab === route.query.tab) return;
  void router.replace({ query });
});

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.setTimeout(() => { firstPaint.value = false; }, 900);
  const tab = String(route.query.tab ?? '');
  if (TABS.some(t => t.id === tab)) defence.setTab(tab as DefenceTab);
  const ip = String(route.query.ip ?? '').trim();
  if (ip) defence.openIp(ip);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  if (replayTimer != null) window.clearInterval(replayTimer);
});
</script>

<style lang="scss" src="~/assets/scss/omnidefence.scss"></style>
