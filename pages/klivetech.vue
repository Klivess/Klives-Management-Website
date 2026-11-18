<template>
  <div class="ktx" data-testid="ktx-root">
    <!-- ── bar ── -->
    <header class="ktx-bar">
      <div class="ktx-bar__id">
        <span class="ktx-bar__mark" :data-tone="verdict.tone"><TechIcon name="chip" /></span>
        <h1 class="ktx-bar__title">KliveTech</h1>
        <span class="ktx-bar__sub" data-testid="ktx-subline">{{ subline }}</span>
      </div>

      <button class="ktx-search" aria-label="Search gadgets and actions" aria-keyshortcuts="Control+K" data-testid="ktx-search" @click="paletteOpen = true">
        <TechIcon name="search" />
        <span class="ktx-search__text">Find a gadget, run an action…</span>
        <span class="ktx-kbd">Ctrl</span><span class="ktx-kbd">K</span>
      </button>

      <span class="ktx-bar__spacer"></span>

      <div class="ktx-bar__actions">
        <button class="ktx-live" :data-state="linkState" :data-tone="linkTone" :title="linkTitle" :aria-label="linkTitle" data-testid="ktx-live" @click="kt.setLive(!prefs.live)">
          <span class="ktx-live__dot"></span>
          <span class="ktx-live__word">{{ linkWord }}</span>
          <span v-if="linkState === 'live'" :key="lastOkAt ?? 0" class="ktx-live__sweep"></span>
        </button>
        <button class="ktx-btn ktx-btn--ghost" title="Refresh now (R)" aria-label="Refresh now" aria-keyshortcuts="R" data-testid="ktx-refresh" @click="kt.refresh(true)">
          <TechIcon name="refresh" :class="{ 'ktx-spin': busy }" />
        </button>
      </div>
    </header>

    <!-- The layout already provides the page's <main>. -->
    <div class="ktx-main">
      <div v-if="profileReady && !allowed.gadgets" class="ktx-card">
        <div class="ktx-empty"><TechIcon name="lock" />KliveTech is not part of your access.</div>
      </div>

      <template v-else>
        <div v-if="error && loaded" class="ktx-banner" data-tone="crit" role="alert">
          <TechIcon name="octagon-x" /><span>{{ error }}. Showing what was last read {{ lastOkAt ? fmtAgo(new Date(lastOkAt).toISOString(), now) : '' }}.</span>
          <button class="ktx-btn ktx-btn--xs" @click="kt.refresh()">Try again</button>
        </div>

        <!-- ── verdict + figures ── -->
        <div class="ktx-top">
          <TechVerdict :verdict="verdict" :status="status" :now="now" :last-ok-at="lastOkAt" :pending="pending" @act="actOnIssue" />

          <div class="ktx-top__right">
          <div class="ktx-kpis">
            <TechKpi label="Gadgets" icon="chip" :value="loaded ? `${counts.online}/${counts.total}` : null" unit="online" :tone="counts.total && !counts.online ? 'crit' : counts.offline ? 'warn' : 'ok'" clickable testid="kpi-gadgets" @open="setFilter(counts.offline ? 'offline' : 'all')">
              <template #sub>
                <template v-if="loaded">
                  <template v-if="unreachable">{{ unreachable }} unreachable</template><template v-else>{{ counts.offline ? `${counts.offline} offline` : counts.total ? 'all up' : 'none known' }}</template><template v-if="counts.nearby"> · {{ counts.nearby }} nearby</template>
                </template>
              </template>
              <div v-if="fleet.length" class="ktx-leds" :aria-label="`${counts.online} of ${counts.total} online`">
                <button v-for="item in fleet.slice(0, 24)" :key="item.key" class="ktx-led ktx-led--sm" :data-tone="STATE_TONE[item.state]" :title="`${item.name}: ${STATE_LABEL[item.state]}`" @click.stop="kt.open(item.key)"></button>
              </div>
            </TechKpi>

            <TechKpi label="Relay" icon="hub" :value="status ? String(openHubs) : statusSupported ? null : '—'" :unit="status ? (openHubs === 1 ? 'hub up' : 'hubs up') : ''" :tone="refusedToday ? 'crit' : 'ok'" :state="refusedToday ? `${refusedToday} turned away` : ''" clickable testid="kpi-relay" @open="goTab('radio')">
              <template #sub>
                <template v-if="status">{{ relayedOnline }} gadget{{ relayedOnline === 1 ? '' : 's' }} through it · {{ status.relay.tokenConfigured ? 'token set' : 'no token' }}</template>
                <template v-else-if="!statusSupported">not reported by this server</template>
              </template>
            </TechKpi>

            <TechKpi label="Radio" icon="bluetooth" :value="radioValue" :unit="radioUnit" :tone="(status?.bluetooth.consecutiveFailures ?? 0) >= 3 ? 'warn' : 'ok'" :state="(status?.bluetooth.consecutiveFailures ?? 0) >= 3 ? 'failing' : ''" clickable testid="kpi-radio" @open="goTab('radio')">
              <template #sub>
                <template v-if="status?.bluetooth.available">{{ status.bluetooth.lastScanUtc ? `${status.bluetooth.lastDevicesSeen} devices seen` : 'first scan pending' }} · {{ status.enrolment.allowNewDevices ? 'enrolment on' : 'remembered only' }}</template>
                <template v-else-if="status">this server has no adapter</template>
              </template>
            </TechKpi>

            <TechKpi label="Telemetry" icon="wave" :value="loaded && allowed.streams ? `${enabledStreams}/${streamables.length}` : null" unit="streams live" :tone="dropped ? 'warn' : 'ok'" :state="dropped ? `${fmtCompact(dropped)} dropped` : ''" clickable testid="kpi-streams" @open="goTab('streams')">
              <template #sub>
                <template v-if="status">{{ fmtCompact(status.streamables.retainedSamples) }} samples kept · {{ status.streamables.liveViewers }} watching</template>
                <template v-else-if="streamables.length">{{ streamGadgets }} gadget{{ streamGadgets === 1 ? '' : 's' }} streaming</template>
              </template>
            </TechKpi>

            <TechKpi label="Firmware" icon="firmware" :value="firmwareValue" :unit="firmwareUnit" :tone="firmwareTone" :state="activeJobs.length ? activeJobs[0].state.toLowerCase() : ''" clickable testid="kpi-firmware" @open="goTab('firmware')">
              <template #sub>
                <template v-if="lastJob">{{ lastJob.state === 'Completed' ? (lastJob.kind === 'Update' ? 'flashed' : 'compiled') : lastJob.state.toLowerCase() }} {{ lastJob.project }} {{ fmtAgo(lastJob.completedUtc ?? lastJob.createdUtc, now) }}</template>
                <template v-else-if="status">{{ status.firmware.inboxProjects >= 0 ? `${status.firmware.inboxProjects} project${status.firmware.inboxProjects === 1 ? '' : 's'} in the inbox` : 'inbox unreadable' }}</template>
              </template>
            </TechKpi>
          </div>

            <TechLinkMap :fleet="fleet" :status="status" @open="key => kt.open(key)" />
          </div>
        </div>

        <!-- ── fleet + history ── -->
        <div class="ktx-mid">
          <section class="ktx-card ktx-fleet" aria-label="Fleet">
            <header class="ktx-card__head">
              <h2 class="ktx-card__title"><TechIcon name="grid" />Fleet</h2>
              <span class="ktx-card__meta ktx-num" data-testid="fleet-count">{{ fleetMeta }}</span>
              <div class="ktx-card__tools">
                <div class="ktx-seg" role="group" aria-label="Show">
                  <button v-for="f in FLEET_FILTERS" :key="f.id" class="ktx-seg__opt" :aria-pressed="prefs.filter === f.id" :data-testid="`filter-${f.id}`" @click="setFilter(f.id)">
                    {{ f.label }}<span class="ktx-seg__count">{{ f.id === 'all' ? counts.total : f.id === 'online' ? counts.online : counts.offline }}</span>
                  </button>
                </div>
                <label class="ktx-field ktx-fleet__search">
                  <TechIcon name="search" />
                  <input ref="fleetSearch" v-model="fleetQuery" type="search" placeholder="Filter" aria-label="Filter gadgets" data-testid="fleet-search" @keydown.esc="fleetQuery = ''" />
                  <span class="ktx-kbd">/</span>
                </label>
              </div>
            </header>

            <div v-if="!loaded" class="ktx-fleet__grid">
              <div v-for="n in 3" :key="n" class="ktx-gadget ktx-gadget--ghost"></div>
            </div>
            <div v-else-if="shownFleet.length || shownNearby.length" class="ktx-fleet__grid" data-testid="fleet-grid">
              <TechGadgetCard
                v-for="item in shownFleet"
                :key="item.key"
                :item="item"
                :now="now"
                :selected="selectedKey === item.key"
                :can-act="allowed.act"
                :can-manage="allowed.manage"
                :pending="pending[item.gadgetID]"
                :last-run="kt.lastRun"
                :sparks="item.gadgetID === live.gadgetID.value ? sparks : null"
                :carries="item.transport === 'hub' ? childrenOf(item) : undefined"
                @open="kt.open(item.key)"
                @open-child="key => kt.open(key)"
                @run="(action, value) => kt.runAction(item, action, value)"
                @retry="kt.retry(item.gadgetID)"
                @forget="forgetTarget = item"
              />
              <TechNearbyCard
                v-for="device in shownNearby"
                :key="device.address"
                :device="device"
                :now="now"
                :can-manage="allowed.manage"
                :allow-new="!!status?.enrolment.allowNewDevices"
                :pending="!!pending[device.address]"
                @enrol="kt.enrol(device.address)"
              />
            </div>
            <div v-else-if="fleet.length" class="ktx-empty">
              <TechIcon name="search" /><span>No gadget matches{{ fleetQuery ? ` “${fleetQuery}”` : '' }}.</span>
              <button class="ktx-btn ktx-btn--xs" @click="fleetQuery = ''; setFilter('all')">Show all</button>
            </div>

            <!-- nothing known at all: how to get the first gadget in, with what is already true ticked -->
            <div v-else class="ktx-setup" data-testid="ktx-setup">
              <div class="ktx-setup__step" :data-done="status?.bluetooth.available || undefined">
                <span class="ktx-setup__n"><TechIcon :name="status?.bluetooth.available ? 'check' : 'bluetooth'" /></span>
                <div>
                  <b>Over Bluetooth</b>
                  <p>Flash a sketch that calls <span class="ktx-mono">CreateKliveTechGadget("KliveTech …")</span> and power it near the server.
                    {{ status ? (status.bluetooth.available ? (status.enrolment.allowNewDevices ? 'Enrolment is on, so it connects on the next scan.' : 'Enrolment is off: it will appear here to let in with one click.') : 'This server has no Bluetooth adapter.') : '' }}</p>
                </div>
              </div>
              <div class="ktx-setup__step" :data-done="openHubs > 0 || undefined">
                <span class="ktx-setup__n"><TechIcon :name="openHubs ? 'check' : 'hub'" /></span>
                <div>
                  <b>Through a relay hub</b>
                  <p>Give the hub sketch the <span class="ktx-mono">KliveTechHubAccessToken</span> setting{{ status?.relay.tokenConfigured ? ' (set)' : '' }} and point it at
                    <button class="ktx-copy ktx-mono" @click="copy(relayEndpoint)">{{ relayEndpoint }}</button>.
                    {{ status?.relay.attempts.length ? `Last attempt ${fmtAgo(status.relay.attempts[0].atUtc, now)}: ${RELAY_OUTCOME[status.relay.attempts[0].outcome]?.label ?? status.relay.attempts[0].outcome}.` : 'No hub has tried yet.' }}</p>
                </div>
              </div>
              <div class="ktx-setup__step" :data-done="status?.firmware.toolchain?.found || undefined">
                <span class="ktx-setup__n"><TechIcon :name="status?.firmware.toolchain?.found ? 'check' : 'firmware'" /></span>
                <div>
                  <b>Flash from here (optional)</b>
                  <p>{{ status?.firmware.toolchain ? (status.firmware.toolchain.found ? `arduino-cli is ready (${status.firmware.toolchain.version}).` : status.firmware.toolchain.error) : 'Builds use arduino-cli on the server.' }}</p>
                </div>
              </div>
            </div>
          </section>

          <div class="ktx-side">
            <TechEventFeed :events="events" :now="now" :supported="statusSupported" :limit="10" @open="openById" @more="goTab('activity')" />
          </div>
        </div>

        <!-- ── workbench ── -->
        <section id="ktx-work" ref="work" class="ktx-card ktx-work" aria-label="Workbench">
          <nav class="ktx-tabs" role="tablist" aria-label="Workbench">
            <button v-for="(tab, i) in WORK_TABS" :key="tab.id" class="ktx-tab" role="tab" :aria-selected="prefs.tab === tab.id" :data-testid="`tab-${tab.id}`" :title="`${tab.label} (${i + 1})`" @click="kt.setTab(tab.id)">
              <TechIcon :name="tab.icon" />{{ tab.label }}
              <span v-if="tabCount(tab.id)" class="ktx-tab__count" :data-tone="tabTone(tab.id)">{{ tabCount(tab.id) }}</span>
            </button>
            <div class="ktx-tabs__tools"><span class="ktx-dim"><span class="ktx-kbd">1</span>–<span class="ktx-kbd">4</span> switch</span></div>
          </nav>

          <TechStreamTable v-if="prefs.tab === 'streams'" :entries="streamables" :now="now" :can-control="allowed.control" :pending="pending" @open="openById" @toggle="toggleStream" />
          <TechFirmwarePanel
            v-else-if="prefs.tab === 'firmware'"
            :status="status"
            :status-supported="statusSupported"
            :config="config"
            :projects="projects"
            :jobs="jobs"
            :targets="onlineFleet"
            :error="firmwareError"
            :busy="firmwareBusy"
            :can-deploy="allowed.deploy"
            :now="now"
            :preset="flashPreset"
            @start="startFirmware"
            @cancel="askCancel"
            @rescan="kt.rescanFirmware()"
            @copied="kt.notify('ok', 'Copied')"
          />
          <TechEventFeed v-else-if="prefs.tab === 'activity'" full :events="events" :now="now" :supported="statusSupported" title="Everything the hub recorded" style="border: 0; background: none; box-shadow: none" @open="openById" />
          <TechRadioPanel v-else-if="prefs.tab === 'radio'" :status="status" :supported="statusSupported" :now="now" :can-manage="allowed.manage" @enrol="address => kt.enrol(address)" @open="openById" @copied="kt.notify('ok', 'Copied')" />
        </section>
      </template>
    </div>

    <!-- ── one gadget ── -->
    <TechGadgetSheet
      :item="selected"
      :now="now"
      :can-act="allowed.act"
      :can-manage="allowed.manage"
      :can-control="allowed.control"
      :can-firmware="allowed.firmware"
      :can-deploy="allowed.deploy"
      :pending="selected ? pending[selected.gadgetID] : undefined"
      :last-run="kt.lastRun"
      :live-status="live.status.value"
      :live-detail="live.statusDetail.value"
      :live-gadget="live.gadgetID.value"
      :buffers="liveBuffers"
      :frames="liveFrames"
      :events="events"
      :history-supported="statusSupported"
      :jobs="selectedJobs"
      :pending-streams="pending"
      :stream-errors="streamErrors"
      @close="closeSheet"
      @step="d => kt.step(d)"
      @run="(action, value) => selected && kt.runAction(selected, action, value)"
      @stream="(streamID, change) => selected && kt.setStream(selected, streamID, change)"
      @retry="selected && kt.retry(selected.gadgetID)"
      @forget="forgetTarget = selected"
      @flash="flashFromSheet"
      @fetch-frame="streamID => live.fetchFrame(streamID)"
      @copied="kt.notify('ok', 'Copied')"
    />

    <TechDialog :open="!!flashForm" :title="`Flash ${flashTargetName}?`" :sub="`with ${flashForm?.project ?? ''}`" icon="upload" tone="warn" testid="ktx-flash-dialog" @close="flashForm = null">
      <p class="ktx-note">It compiles first, then uploads over {{ flashTransport }}. The gadget reboots when the upload finishes and its Streamables start a new session. Cancelling mid-upload leaves a partial image that needs reflashing.</p>
      <template #actions>
        <button class="ktx-btn ktx-btn--ghost" @click="flashForm = null">Not now</button>
        <button class="ktx-btn ktx-btn--warn" data-testid="ktx-flash-confirm" @click="confirmFlash"><TechIcon name="upload" />Compile &amp; flash</button>
      </template>
    </TechDialog>

    <TechDialog :open="!!forgetTarget" :title="`Forget ${forgetTarget?.name ?? ''}?`" sub="Start-up and Bluetooth discovery stop trying it." icon="trash" tone="crit" testid="ktx-forget-dialog" @close="forgetTarget = null">
      <p class="ktx-note">Its remembered file is deleted. It can be enrolled again later; it would get a new gadget ID.</p>
      <template #actions>
        <button class="ktx-btn ktx-btn--ghost" @click="forgetTarget = null">Keep it</button>
        <button class="ktx-btn ktx-btn--danger" data-testid="ktx-forget-confirm" @click="confirmForget"><TechIcon name="trash" />Forget</button>
      </template>
    </TechDialog>

    <TechDialog :open="!!cancelTarget" title="Cancel this upload?" :sub="cancelTarget ? `${cancelTarget.project} → ${cancelTarget.gadgetName}` : ''" icon="alert" tone="crit" testid="ktx-cancel-dialog" @close="cancelTarget = null">
      <p class="ktx-note">The gadget is mid-upload. Stopping now leaves it with a partial image, and it will need reflashing.</p>
      <template #actions>
        <button class="ktx-btn ktx-btn--ghost" @click="cancelTarget = null">Let it finish</button>
        <button class="ktx-btn ktx-btn--danger" @click="confirmCancel"><TechIcon name="x" />Cancel upload</button>
      </template>
    </TechDialog>

    <TechPalette :open="paletteOpen" :commands="commands" @close="paletteOpen = false" />

    <Teleport to="body">
      <div v-if="toasts.length" class="ktx-layer">
        <div class="ktx-toasts" role="status" aria-live="polite">
          <div v-for="toast in toasts" :key="toast.id" class="ktx-toast" :data-tone="toast.tone" data-testid="ktx-toast">
            <TechIcon :name="toast.tone === 'crit' ? 'octagon-x' : toast.tone === 'warn' ? 'alert' : toast.tone === 'info' ? 'info' : 'check-circle'" />
            <span class="ktx-toast__text">{{ toast.text }}</span>
            <button v-if="toast.action" class="ktx-btn ktx-btn--xs" @click="runToast(toast)">{{ toast.action.label }}</button>
            <button class="ktx-iconbtn ktx-iconbtn--sm" aria-label="Dismiss" @click="kt.dismissToast(toast.id)"><TechIcon name="x" /></button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useKliveTech, type KliveTechFilter, type KliveTechTab, type KliveTechToast } from '~/composables/useKliveTech';
import {
  RELAY_OUTCOME, STATE_LABEL, STATE_TONE, actionKind, ageMs, fmtAgo, fmtCompact, fmtDuration, isLive, ktCopy, matchesFleet, wsBase,
  type FirmwareJob, type FleetItem, type Issue, type StreamableEntry, type TechCommand,
} from '~/scripts/kliveTech';

definePageMeta({ layout: 'navbar' });

const kt = useKliveTech();
const {
  allowed, live, streamables, status, statusSupported, jobs, activeJobs, config, projects, firmwareError, firmwareBusy,
  loaded, error, lastOkAt, busy, now, prefs, fleet, selected, selectedKey, counts, verdict, linkState, pending, streamErrors, toasts,
} = kt;

const route = useRoute();
const router = useRouter();

const WORK_TABS: { id: KliveTechTab; label: string; icon: string }[] = [
  { id: 'streams', label: 'Streams', icon: 'wave' },
  { id: 'firmware', label: 'Firmware', icon: 'firmware' },
  { id: 'activity', label: 'History', icon: 'history' },
  { id: 'radio', label: 'Radio & relay', icon: 'radar' },
];
const FLEET_FILTERS: { id: KliveTechFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'online', label: 'Online' },
  { id: 'offline', label: 'Offline' },
];

const paletteOpen = ref(false);
const fleetQuery = ref('');
const fleetSearch = ref<HTMLInputElement | null>(null);
const work = ref<HTMLElement | null>(null);
const flashForm = ref<{ project: string; fqbn: string; partitionScheme: string; gadgetID: string } | null>(null);
const flashPreset = ref('');
const forgetTarget = ref<FleetItem | null>(null);
const cancelTarget = ref<FirmwareJob | null>(null);

const profileReady = computed(() => kt.profile.ready.value);
const events = computed(() => status.value?.events ?? []);

// ───────────────────────────── bar ─────────────────────────────

const linkTone = computed(() => ({ live: 'ok', paused: 'neutral', stale: 'warn', offline: 'crit', connecting: 'neutral' } as Record<string, string>)[linkState.value]);
const linkWord = computed(() => ({ live: 'Live', paused: 'Paused', stale: 'Stale', offline: 'Offline', connecting: 'Connecting' } as Record<string, string>)[linkState.value]);
const linkTitle = computed(() => {
  switch (linkState.value) {
    case 'live': return 'Live: the fleet every 5 seconds, the open gadget streamed. Click to pause.';
    case 'paused': return 'Paused. Click to resume.';
    case 'offline': return 'No answer from the server. Still trying.';
    case 'stale': return 'The last reads are late. Still trying.';
    default: return 'Connecting to the server';
  }
});
const openHubs = computed(() => (status.value?.relay.hubs ?? []).filter(h => h.open).length);
const subline = computed(() => {
  if (!loaded.value) return '';
  const parts = [counts.value.total ? `${counts.value.online} of ${counts.value.total} online` : 'no gadgets'];
  if (openHubs.value) parts.push(`${openHubs.value} relay hub${openHubs.value === 1 ? '' : 's'}`);
  return parts.join(' · ');
});

// ───────────────────────────── figures ─────────────────────────────

const unreachable = computed(() => fleet.value.filter(i => i.state === 'unreachable').length);
const refusedToday = computed(() => (status.value?.relay.attempts ?? []).filter(a => ['refused', 'bad-hello', 'handshake-timeout'].includes(a.outcome) && (ageMs(a.atUtc, now.value) ?? Infinity) < 86_400_000).length);
const relayedOnline = computed(() => fleet.value.filter(i => i.transport === 'relayed' && isLive(i.state)).length);
const enabledStreams = computed(() => streamables.value.filter(s => s.enabled).length);
const dropped = computed(() => status.value?.streamables.droppedEvents ?? streamables.value.reduce((n, s) => n + (s.droppedEvents || 0), 0));
const streamGadgets = computed(() => new Set(streamables.value.map(s => s.gadgetID)).size);

const radioValue = computed(() => {
  const bt = status.value?.bluetooth;
  if (!status.value) return statusSupported.value ? null : '—';
  if (!bt?.available) return 'Off';
  if (!bt.lastScanUtc) return '…';
  const age = ageMs(bt.lastScanUtc, now.value) ?? 0;
  return fmtDuration(age).split(' ')[0];
});
const radioUnit = computed(() => (status.value?.bluetooth.available && status.value.bluetooth.lastScanUtc ? 'since scan' : ''));

const lastJob = computed(() => jobs.value.find(j => isTerminalJobState(j.state)) ?? null);
function isTerminalJobState(state: string) { return ['Completed', 'Failed', 'Cancelled'].includes(state); }
const firmwareValue = computed(() => {
  if (!allowed.value.firmware) return null;
  if (activeJobs.value.length) return `${activeJobs.value[0].progressPercent}%`;
  const tc = status.value?.firmware.toolchain;
  if (tc) return tc.found ? 'Ready' : 'No CLI';
  return loaded.value ? '—' : null;
});
const firmwareUnit = computed(() => (activeJobs.value.length ? (activeJobs.value[0].kind === 'Update' ? 'flashing' : 'compiling') : ''));
const firmwareTone = computed(() => {
  if (jobs.value.some(j => j.state === 'Failed' && (ageMs(j.completedUtc ?? j.createdUtc, now.value) ?? Infinity) < 86_400_000)) return 'crit';
  return status.value?.firmware.toolchain && !status.value.firmware.toolchain.found ? 'neutral' : 'ok';
});

// ───────────────────────────── fleet ─────────────────────────────

const shownFleet = computed(() => fleet.value
  .filter(item => prefs.value.filter === 'all' || (prefs.value.filter === 'online') === isLive(item.state))
  .filter(item => matchesFleet(item, fleetQuery.value)));
const shownNearby = computed(() => (prefs.value.filter === 'online' ? [] : status.value?.nearby ?? [])
  .filter(device => !fleetQuery.value || `${device.name} ${device.address}`.toLowerCase().includes(fleetQuery.value.toLowerCase())));
const onlineFleet = computed(() => fleet.value.filter(item => isLive(item.state) && item.gadget));
const fleetMeta = computed(() => {
  if (!loaded.value) return 'reading…';
  const shown = shownFleet.value.length;
  return shown === fleet.value.length ? `${shown} known` : `${shown} of ${fleet.value.length}`;
});

/**
 * The live client keeps its buffers in one Map it mutates and re-publishes at most once a frame
 * (triggerRef). Handing the sheet that same Map would never change its props, so the charts would
 * stay as first drawn: a fresh Map per publish is what makes the sheet redraw.
 */
const liveBuffers = computed(() => new Map(live.buffers.value));
const liveFrames = computed(() => new Map(live.frames.value));

/** The open gadget's last 40 readings per stream, for its card's sparklines. */
const sparks = computed(() => {
  const map = new Map<string, number[]>();
  live.buffers.value.forEach((buffer, streamID) => map.set(streamID, buffer.points.slice(-40).map(p => p.y)));
  return map;
});

const selectedJobs = computed(() => (selected.value ? jobs.value.filter(j => j.gadgetID === selected.value!.gadgetID).slice(0, 5) : []));

/** The gadgets a relay hub carries, matched on the hub's device ID. */
function childrenOf(hub: FleetItem): FleetItem[] {
  const id = (hub.gadget?.hubID || hub.address).replace(/:/g, '').toUpperCase();
  return fleet.value.filter(item => item.transport === 'relayed'
    && (item.gadget?.connectedViaHubID || item.remembered?.connectedViaHubID || '').replace(/:/g, '').toUpperCase() === id);
}

function setFilter(filter: KliveTechFilter) {
  prefs.value = { ...prefs.value, filter };
}

function openById(id: string) {
  const item = fleet.value.find(i => i.gadgetID === id || i.key === id);
  if (item) kt.open(item.key);
  else kt.notify('info', "That gadget isn't known any more");
}

function closeSheet() {
  kt.close();
}

// The open gadget is in the address, so a link from Discord or a bookmark lands on it.
watch(selectedKey, key => {
  const current = typeof route.query.gadget === 'string' ? route.query.gadget : undefined;
  if ((key ?? undefined) === current) return;
  void router.replace({ query: { ...route.query, gadget: key ?? undefined } });
});
const stopDeepLink = watch(loaded, ready => {
  if (!ready) return;
  const wanted = typeof route.query.gadget === 'string' ? route.query.gadget : '';
  if (wanted && fleet.value.some(i => i.key === wanted)) kt.open(wanted);
  stopDeepLink();
});

// ───────────────────────────── tabs ─────────────────────────────

async function goTab(tab: KliveTechTab) {
  kt.setTab(tab);
  await nextTick();
  work.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function tabCount(tab: KliveTechTab): number | string {
  switch (tab) {
    case 'streams': return streamables.value.length;
    case 'firmware': return activeJobs.value.length || '';
    case 'activity': return events.value.filter(e => e.tone === 'crit' || e.tone === 'warn').length || '';
    case 'radio': return refusedToday.value || (status.value?.nearby.length ?? 0) || '';
  }
}
function tabTone(tab: KliveTechTab): string | undefined {
  if (tab === 'firmware' && activeJobs.value.length) return 'info';
  if (tab === 'activity') return 'warn';
  if (tab === 'radio') return refusedToday.value ? 'crit' : 'info';
  return undefined;
}

// ───────────────────────────── actions ─────────────────────────────

function actOnIssue(issue: Issue) {
  const action = issue.action;
  if (!action) return;
  if (action.kind === 'retry') void kt.retry(action.target);
  else if (action.kind === 'enrol') void kt.enrol(action.target);
  else if (action.kind === 'open') openById(action.target);
  else void goTab(action.target as KliveTechTab);
}

function toggleStream(entry: StreamableEntry, enabled: boolean) {
  const item = fleet.value.find(i => i.gadgetID === entry.gadgetID);
  if (item) void kt.setStream(item, entry.streamID, { enabled });
}

function flashFromSheet() {
  if (!selected.value) return;
  flashPreset.value = '';
  const id = selected.value.gadgetID;
  kt.close();
  void nextTick(() => { flashPreset.value = id; });
  void goTab('firmware');
}

const flashTargetName = computed(() => fleet.value.find(i => i.gadgetID === flashForm.value?.gadgetID)?.name ?? 'the gadget');
const flashTransport = computed(() => {
  const item = fleet.value.find(i => i.gadgetID === flashForm.value?.gadgetID);
  return item?.transport === 'bluetooth' ? 'Bluetooth' : 'its relay hub';
});

async function startFirmware(form: { project: string; fqbn: string; partitionScheme: string; gadgetID: string }) {
  if (form.gadgetID) { flashForm.value = { ...form }; return; }
  await kt.startFirmware(form);
}
async function confirmFlash() {
  const form = flashForm.value;
  flashForm.value = null;
  if (form) await kt.startFirmware(form);
}
function askCancel(job: FirmwareJob) {
  if (job.state === 'Uploading') cancelTarget.value = job;
  else void kt.cancelJob(job);
}
function confirmCancel() {
  const job = cancelTarget.value;
  cancelTarget.value = null;
  if (job) void kt.cancelJob(job);
}
function confirmForget() {
  const item = forgetTarget.value;
  forgetTarget.value = null;
  if (item) void kt.forget(item.gadgetID);
}
function runToast(toast: KliveTechToast) {
  kt.dismissToast(toast.id);
  void toast.action?.run();
}

const relayEndpoint = computed(() => `${wsBase()}${status.value?.relay.endpoint ?? '/klivetech/hub/connect'}`);
async function copy(text: string) {
  if (await ktCopy(text)) kt.notify('ok', 'Copied');
}

// ───────────────────────────── palette ─────────────────────────────

const commands = computed<TechCommand[]>(() => {
  const list: TechCommand[] = [];
  for (const item of fleet.value) {
    list.push({ id: `open-${item.key}`, group: 'Gadgets', title: item.name, hint: STATE_LABEL[item.state], icon: 'chip', keywords: `${item.address} ${item.hubName}`, run: () => kt.open(item.key) });
  }
  if (allowed.value.act) {
    for (const item of fleet.value.filter(i => isLive(i.state))) {
      for (const action of item.actions) {
        const kind = actionKind(action);
        if (kind === 'button') list.push({ id: `run-${item.key}-${action.name}`, group: 'Actions', title: `${action.name}`, hint: item.name, icon: 'bolt', keywords: item.name, run: () => kt.runAction(item, action, '') });
        else if (kind === 'toggle') {
          list.push({ id: `on-${item.key}-${action.name}`, group: 'Actions', title: `${action.name} → On`, hint: item.name, icon: 'toggle', keywords: `${item.name} on true`, run: () => kt.runAction(item, action, 'true') });
          list.push({ id: `off-${item.key}-${action.name}`, group: 'Actions', title: `${action.name} → Off`, hint: item.name, icon: 'toggle', keywords: `${item.name} off false`, run: () => kt.runAction(item, action, 'false') });
        } else list.push({ id: `set-${item.key}-${action.name}`, group: 'Actions', title: `${action.name}…`, hint: `${item.name} · opens it`, icon: 'sliders', keywords: item.name, run: () => kt.open(item.key) });
      }
    }
    for (const item of fleet.value.filter(i => i.remembered?.canRetry && i.state !== 'connecting')) {
      list.push({ id: `retry-${item.key}`, group: 'Fix', title: `Try ${item.name} again`, hint: STATE_LABEL[item.state], icon: 'refresh', run: () => kt.retry(item.gadgetID) });
    }
  }
  if (allowed.value.manage) {
    for (const device of status.value?.nearby ?? []) {
      if (!device.enrolling) list.push({ id: `enrol-${device.address}`, group: 'Fix', title: `Enrol ${device.name || device.address}`, hint: 'nearby', icon: 'plus', run: () => kt.enrol(device.address) });
    }
    for (const item of fleet.value.filter(i => i.remembered && !isLive(i.state))) {
      list.push({ id: `forget-${item.key}`, group: 'Fix', title: `Forget ${item.name}`, hint: 'deletes its remembered file', icon: 'trash', danger: true, run: () => kt.forget(item.gadgetID) });
    }
  }
  if (allowed.value.deploy) {
    for (const project of projects.value.filter(p => p.valid)) {
      list.push({ id: `compile-${project.name}`, group: 'Firmware', title: `Compile ${project.name}`, hint: 'no gadget', icon: 'chip', run: () => kt.startFirmware({ project: project.name, fqbn: '', partitionScheme: '', gadgetID: '' }) });
    }
  }
  WORK_TABS.forEach((tab, index) => list.push({ id: `tab-${tab.id}`, group: 'Go to', title: tab.label, hint: String(index + 1), icon: tab.icon, run: () => goTab(tab.id) }));
  list.push({ id: 'refresh', group: 'Go to', title: 'Refresh now', hint: 'R', icon: 'refresh', run: () => kt.refresh(true) });
  list.push({ id: 'live', group: 'Go to', title: prefs.value.live ? 'Pause live updates' : 'Resume live updates', icon: prefs.value.live ? 'pause' : 'play', run: () => kt.setLive(!prefs.value.live) });
  return list;
});

// ───────────────────────────── keys ─────────────────────────────

function onKey(event: KeyboardEvent) {
  if (event.defaultPrevented) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    paletteOpen.value = !paletteOpen.value;
    return;
  }
  if (paletteOpen.value || flashForm.value || forgetTarget.value || cancelTarget.value) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  if (selected.value) {
    if (event.key === 'Escape') { event.preventDefault(); kt.close(); return; }
    if (event.key === 'j' || event.key === 'J') { event.preventDefault(); kt.step(1); return; }
    if (event.key === 'k' || event.key === 'K') { event.preventDefault(); kt.step(-1); return; }
  }
  if (event.key === '/') { event.preventDefault(); fleetSearch.value?.focus(); }
  else if (event.key === 'r' || event.key === 'R') { event.preventDefault(); void kt.refresh(true); }
  else if (['1', '2', '3', '4'].includes(event.key)) { event.preventDefault(); void goTab(WORK_TABS[Number(event.key) - 1].id); }
}

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

useHead({ title: 'KliveTech' });
</script>

<style lang="scss" src="~/assets/scss/klivetech.scss"></style>
