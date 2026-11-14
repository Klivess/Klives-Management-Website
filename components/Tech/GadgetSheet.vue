<template>
  <Teleport to="body">
    <div v-if="item" class="ktx-layer">
      <div class="ktx-sheet-scrim" @pointerdown.self="emit('close')"></div>
      <aside class="ktx-sheet" role="dialog" aria-modal="false" :aria-label="item.name" data-testid="ktx-sheet" :data-state="item.state" @keydown="onKey">
        <header class="ktx-sheet__head">
          <span class="ktx-led ktx-led--lg" :data-tone="STATE_TONE[item.state]" :data-pulse="online || undefined"></span>
          <div class="ktx-sheet__id">
            <h2 class="ktx-sheet__title ktx-truncate" data-testid="ktx-sheet-title">{{ item.name }}</h2>
            <div class="ktx-sheet__sub">
              <span class="ktx-chip" :data-tone="STATE_TONE[item.state]">{{ STATE_LABEL[item.state] }}</span>
              <span class="ktx-tx" :data-transport="item.transport"><TechIcon :name="txIcon" />{{ item.transport === 'relayed' && item.hubName ? `via ${item.hubName}` : TRANSPORT_LABEL[item.transport] }}</span>
              <button class="ktx-chip ktx-chip--mono" :title="'Copy the address'" @click="copy(item.address)">{{ item.address }}</button>
            </div>
          </div>
          <div class="ktx-sheet__nav">
            <button class="ktx-iconbtn" title="Previous gadget (K)" aria-label="Previous gadget" @click="emit('step', -1)"><TechIcon name="chevron-up" /></button>
            <button class="ktx-iconbtn" title="Next gadget (J)" aria-label="Next gadget" @click="emit('step', 1)"><TechIcon name="chevron-down" /></button>
            <button ref="closer" class="ktx-iconbtn" title="Close (Esc)" aria-label="Close" data-testid="ktx-sheet-close" @click="emit('close')"><TechIcon name="x" /></button>
          </div>
        </header>

        <div class="ktx-sheet__facts">
          <template v-if="online">
            <div><span>Up</span><b>{{ uptime }}</b></div>
            <div><span>Heard</span><b>{{ fmtAgo(item.gadget?.lastMessageReceived, now) }}</b></div>
            <div><span>Actions</span><b>{{ item.actions.length }}</b></div>
            <div><span>Streams</span><b>{{ enabledCount }}/{{ item.streams.length }}</b></div>
          </template>
          <template v-else>
            <div><span>Last up</span><b>{{ fmtClock(rec?.lastConnectedUtc, now) }}</b></div>
            <div><span>Last tried</span><b>{{ fmtClock(rec?.lastAttemptUtc, now) }}</b></div>
            <div><span>Attempts</span><b>{{ rec?.totalAttempts ?? 0 }}</b></div>
            <div><span>Failed in a row</span><b :data-tone="rec?.failedAttempts ? 'warn' : undefined">{{ rec?.failedAttempts ?? 0 }}</b></div>
          </template>
        </div>

        <div class="ktx-sheet__body">
          <!-- why it is not here -->
          <section v-if="!online" class="ktx-sheet__sec">
            <div class="ktx-callout" :data-tone="item.state === 'unreachable' ? 'warn' : 'neutral'">
              <TechIcon :name="item.state === 'unreachable' ? 'alert' : 'info'" />
              <div>
                <b>{{ whyTitle }}</b>
                <p>{{ whyText }}</p>
              </div>
            </div>
            <div class="ktx-row" style="margin-top: 10px">
              <button v-if="canAct && rec?.canRetry" class="ktx-btn" :disabled="!!pending || item.state === 'connecting'" data-testid="sheet-retry" @click="emit('retry')">
                <TechIcon name="refresh" :class="{ 'ktx-spin': pending === 'retry' || item.state === 'connecting' }" />{{ item.state === 'connecting' ? 'Connecting…' : 'Try again now' }}
              </button>
              <button v-if="canManage && rec" class="ktx-btn ktx-btn--ghost" :disabled="!!pending" data-testid="sheet-forget" @click="emit('forget')"><TechIcon name="trash" />Forget this gadget</button>
            </div>
          </section>

          <!-- controls -->
          <section v-if="online" class="ktx-sheet__sec" aria-label="Controls">
            <h3 class="ktx-sec-title"><TechIcon name="bolt" />Controls<span class="ktx-sec-title__meta">{{ item.actions.length || 'none' }}</span></h3>
            <div v-if="item.actions.length" class="ktx-sheet__actions">
              <TechActionControl
                v-for="action in item.actions"
                :key="action.name"
                :action="action"
                :run="lastRun(item.gadgetID, action.name)"
                :disabled="!canAct"
                :now="now"
                @run="value => emit('run', action, value)"
              />
            </div>
            <p v-else class="ktx-dim">This gadget publishes no actions{{ item.gadget?.isHub ? `; it relays ${item.gadget.connectedGadgetCount} gadget${item.gadget.connectedGadgetCount === 1 ? '' : 's'}` : '' }}.</p>
            <p v-if="!canAct && item.actions.length" class="ktx-note">Your profile can read gadgets but not operate them.</p>
          </section>

          <!-- streams -->
          <section v-if="item.streams.length" class="ktx-sheet__sec" aria-label="Telemetry">
            <h3 class="ktx-sec-title">
              <TechIcon name="wave" />Telemetry
              <span class="ktx-sec-title__meta">
                <span class="ktx-live-dot" :data-state="liveStatus"></span>{{ liveWord }}
              </span>
            </h3>
            <p v-if="liveDetail" class="ktx-note">{{ liveDetail }}</p>
            <div class="ktx-streams">
              <article v-for="s in sortedStreams" :key="s.streamID" class="ktx-stream" :data-off="!s.enabled || undefined" :data-testid="`stream-${s.streamID}`">
                <header class="ktx-stream__head">
                  <span class="ktx-stream__id ktx-mono ktx-truncate">{{ s.streamID }}</span>
                  <span class="ktx-chip">{{ s.valueType }}</span>
                  <span class="ktx-faint ktx-stream__mode">{{ streamInterval(s) }}</span>
                  <span class="ktx-grow"></span>
                  <label v-if="canControl" class="ktx-switch" :title="s.enabled ? 'Stop this stream' : 'Start this stream'">
                    <input type="checkbox" :checked="s.enabled" :disabled="pendingStream(s.streamID)" :data-testid="`stream-toggle-${s.streamID}`" @change="emit('stream', s.streamID, { enabled: ($event.target as HTMLInputElement).checked })" />
                    <span class="ktx-switch__track"></span>
                  </label>
                </header>

                <div class="ktx-stream__value">
                  <b class="ktx-mono" :data-tone="s.valueType === 'boolean' ? (s.latestValue === true ? 'ok' : 'neutral') : undefined">{{ fmtStreamValue(s.latestValue, s.valueType) }}</b>
                  <span class="ktx-faint">{{ s.latestReceivedUtc ? fmtAgo(s.latestReceivedUtc, now) : 'no sample yet' }}<template v-if="s.latestSequence != null"> · #{{ s.latestSequence }}</template></span>
                  <span v-if="gaps(s.streamID)" class="ktx-chip" data-tone="warn" :title="'Samples the live queue dropped before they reached this page'">{{ gaps(s.streamID) }} missed</span>
                  <span v-if="s.droppedEvents" class="ktx-chip" data-tone="warn" :title="'Samples the hub dropped'">{{ s.droppedEvents }} dropped</span>
                </div>

                <template v-if="isChartable(s.valueType) && isLiveHere">
                  <TechTrace v-if="points(s.streamID).length > 1" :points="points(s.streamID)" :step="s.valueType === 'boolean'" :label="`${s.streamID} over time`" />
                  <p v-else class="ktx-faint" style="font-size: 11.5px">{{ s.mode === 'onChange' ? 'Draws once the value changes.' : 'Waiting for samples to draw…' }}</p>
                </template>

                <div v-else-if="s.valueType === 'binary'" class="ktx-frame">
                  <img v-if="frame(s.streamID)?.url" :src="frame(s.streamID)!.url!" :alt="`${s.streamID} frame`" />
                  <div v-else class="ktx-frame__empty">
                    <TechIcon name="image" />
                    <span>{{ frame(s.streamID)?.expired ? 'That frame has expired; the hub keeps two.' : s.latestBinaryBytes ? `${fmtBytes(s.latestBinaryBytes)} frame waiting` : 'No frame yet' }}</span>
                  </div>
                  <button v-if="isLiveHere" class="ktx-btn ktx-btn--xs" @click="emit('fetchFrame', s.streamID)"><TechIcon name="refresh" />Latest frame</button>
                </div>

                <ol v-else-if="isLiveHere && texts(s.streamID).length" class="ktx-stream__log ktx-mono">
                  <li v-for="row in texts(s.streamID).slice(0, 6)" :key="row.seq"><span class="ktx-faint">#{{ row.seq }}</span> {{ fmtStreamValue(row.value, s.valueType) }}</li>
                </ol>

                <form v-if="canControl && s.mode !== 'manual'" class="ktx-stream__interval" @submit.prevent="applyInterval(s)">
                  <label :for="`int-${s.streamID}`" class="ktx-faint">Interval</label>
                  <input :id="`int-${s.streamID}`" v-model="intervals[s.streamID]" class="ktx-input ktx-input--sm ktx-mono" inputmode="numeric" :placeholder="String(s.intervalMs)" @keydown.stop />
                  <span class="ktx-faint">ms</span>
                  <button class="ktx-btn ktx-btn--xs" type="submit" :disabled="!intervalValid(s) || pendingStream(s.streamID)">Set</button>
                  <span v-if="streamErrors[`${item.gadgetID}/${s.streamID}`]" class="ktx-err">{{ streamErrors[`${item.gadgetID}/${s.streamID}`] }}</span>
                </form>
              </article>
            </div>
          </section>

          <!-- firmware for this gadget -->
          <section v-if="canFirmware" class="ktx-sheet__sec" aria-label="Firmware">
            <h3 class="ktx-sec-title"><TechIcon name="firmware" />Firmware<span class="ktx-sec-title__meta">{{ jobs.length ? `${jobs.length} recent` : 'never flashed from here' }}</span></h3>
            <ul v-if="jobs.length" class="ktx-joblist">
              <li v-for="job in jobs" :key="job.jobID">
                <span class="ktx-chip" :data-tone="jobTone(job.state)">{{ job.state }}</span>
                <span class="ktx-truncate">{{ job.project }}</span>
                <span class="ktx-faint">{{ fmtClock(job.createdUtc, now) }}</span>
              </li>
            </ul>
            <button v-if="canDeploy && online" class="ktx-btn ktx-btn--sm" style="margin-top: 8px" data-testid="sheet-flash" @click="emit('flash')"><TechIcon name="upload" />Flash new firmware</button>
          </section>

          <!-- history -->
          <section class="ktx-sheet__sec" aria-label="History">
            <h3 class="ktx-sec-title"><TechIcon name="history" />History</h3>
            <ol v-if="history.length" class="ktx-feed__list ktx-feed__list--flat">
              <li v-for="event in history" :key="event.seq" class="ktx-ev" :data-tone="event.tone">
                <span class="ktx-ev__mark"><TechIcon :name="eventIcon(event.kind)" /></span>
                <span class="ktx-ev__body">
                  <span class="ktx-ev__text">{{ event.text }}</span>
                  <span class="ktx-ev__meta">{{ fmtClock(event.atUtc, now) }}<template v-if="event.by"> · {{ event.by }}</template></span>
                </span>
              </li>
            </ol>
            <p v-else class="ktx-dim">{{ historySupported ? 'Nothing recorded for this gadget since the hub started.' : "This server doesn't keep a hub history yet." }}</p>
          </section>

          <!-- identity -->
          <section class="ktx-sheet__sec" aria-label="Details">
            <h3 class="ktx-sec-title"><TechIcon name="chip" />Details</h3>
            <dl class="ktx-kv">
              <dt>Gadget ID</dt><dd><button class="ktx-copy ktx-mono" @click="copy(item.gadgetID)">{{ item.gadgetID || '—' }}</button></dd>
              <dt>Address</dt><dd class="ktx-mono">{{ item.address }}</dd>
              <dt>Link</dt><dd>{{ item.gadget?.connectionType ?? rec?.connectionType ?? '—' }}</dd>
              <template v-if="item.gadget?.isHub"><dt>Hub ID</dt><dd class="ktx-mono">{{ item.gadget.hubID }}</dd></template>
              <template v-if="item.gadget?.connectedViaHubID || rec?.connectedViaHubID"><dt>Via hub</dt><dd class="ktx-mono">{{ item.gadget?.connectedViaHubID || rec?.connectedViaHubID }}</dd></template>
              <template v-if="session"><dt>Session</dt><dd class="ktx-mono" :title="'A new session means the gadget restarted'">{{ session.id.slice(0, 16) }}… · rev {{ session.rev }}</dd></template>
              <template v-if="rec?.lastDisconnectReason"><dt>Last drop</dt><dd>{{ rec.lastDisconnectReason }} · {{ fmtClock(rec.lastDisconnectedUtc, now) }}</dd></template>
            </dl>
          </section>
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import {
  KT_LIMITS, NO_VALUE, STATE_LABEL, STATE_TONE, TRANSPORT_LABEL, eventIcon, fmtAgo, fmtBytes, fmtClock, fmtDuration, fmtStreamValue,
  isChartable, isLive, jobTone, ktCopy, parseUtc, streamInterval,
  type FirmwareJob, type FleetItem, type GadgetAction, type HubEvent, type StreamableEntry,
} from '~/scripts/kliveTech';
import type { FrameState, LiveStatus, StreamBuffer } from '~/scripts/kliveTechLive';
import type { ActionRun } from '~/composables/useKliveTech';

/**
 * One gadget in full: every control, its Streamables live (the page's one WebSocket follows this
 * sheet), its firmware and its history. J/K move to the next or previous gadget without closing.
 */
const props = defineProps<{
  item: FleetItem | null;
  now: number;
  canAct: boolean;
  canManage: boolean;
  canControl: boolean;
  canFirmware: boolean;
  canDeploy: boolean;
  pending?: string;
  lastRun: (gadgetID: string, action: string) => ActionRun | null;
  liveStatus: LiveStatus;
  liveDetail: string;
  liveGadget: string;
  buffers: Map<string, StreamBuffer>;
  frames: Map<string, FrameState>;
  events: HubEvent[];
  historySupported: boolean;
  jobs: FirmwareJob[];
  pendingStreams: Record<string, string>;
  streamErrors: Record<string, string>;
}>();
const emit = defineEmits<{
  close: [];
  step: [delta: number];
  run: [action: GadgetAction, value: string];
  stream: [streamID: string, change: { enabled?: boolean; intervalMs?: number }];
  retry: [];
  forget: [];
  flash: [];
  fetchFrame: [streamID: string];
  copied: [];
}>();

const closer = ref<HTMLButtonElement | null>(null);
const intervals = reactive<Record<string, string>>({});

const online = computed(() => !!props.item && isLive(props.item.state));
const rec = computed(() => props.item?.remembered ?? null);
const txIcon = computed(() => ({ bluetooth: 'bluetooth', hub: 'hub', relayed: 'relay' })[props.item?.transport ?? 'bluetooth']);
const enabledCount = computed(() => props.item?.streams.filter(s => s.enabled).length ?? 0);
const sortedStreams = computed(() => [...(props.item?.streams ?? [])].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.streamID.localeCompare(b.streamID)));
const isLiveHere = computed(() => props.liveStatus === 'live' && props.liveGadget === props.item?.gadgetID);
const uptime = computed(() => {
  const at = parseUtc(props.item?.gadget?.timeConnected);
  return at === null ? NO_VALUE : fmtDuration(props.now - at);
});
const session = computed(() => {
  const s = props.item?.streams.find(e => e.sessionID);
  return s ? { id: s.sessionID, rev: s.manifestRevision } : null;
});
const history = computed(() => (props.item ? props.events.filter(e => e.gadgetID && e.gadgetID === props.item!.gadgetID).slice(0, 20) : []));

const liveWord = computed(() => {
  if (!online.value) return 'gadget offline';
  switch (props.liveStatus) {
    case 'live': return props.liveGadget === props.item?.gadgetID ? 'live' : 'polled';
    case 'connecting': return 'connecting…';
    case 'reconnecting': return 'reconnecting…';
    case 'refused': return 'live refused';
    case 'unavailable': return 'polled';
    default: return 'polled every 5 s';
  }
});
const liveDetail = computed(() => (props.liveStatus === 'refused' || props.liveStatus === 'unavailable' ? props.liveDetail : ''));

const whyTitle = computed(() => (props.item ? STATE_LABEL[props.item.state] : ''));
const whyText = computed(() => {
  const item = props.item;
  const r = rec.value;
  if (!item) return '';
  switch (item.state) {
    case 'unreachable':
      return `It didn't answer ${r?.failedAttempts ?? 0} connection attempt${r?.failedAttempts === 1 ? '' : 's'}${r?.lastError ? `: ${r.lastError}` : ''}. Check it is powered and within Bluetooth range; the hub also connects it on its own when a scan sees it.`;
    case 'waiting-for-hub':
      return item.transport === 'hub'
        ? 'This relay hub has no connection to Omnipotent. Its own serial log says why (Wi-Fi, TLS certificate, or access token).'
        : `It reaches Omnipotent through ${item.hubName || 'a relay hub'}, and comes back as soon as that hub lists it.`;
    case 'connecting': return 'The hub is trying it now. Five attempts take up to a minute.';
    case 'offline': return r?.lastDisconnectReason ? `It went offline: ${r.lastDisconnectReason}.` : 'It is offline.';
    default: return 'It is remembered but has not been tried since the server started.';
  }
});

function pendingStream(streamID: string) {
  return !!props.item && !!props.pendingStreams[`${props.item.gadgetID}/${streamID}`];
}
// The live client mutates its buffers in place, so each render hands the chart a fresh array:
// passing the same array again would leave it drawn as it was.
function points(streamID: string) {
  return props.buffers.get(streamID)?.points.slice() ?? [];
}
function texts(streamID: string) {
  return props.buffers.get(streamID)?.text.slice() ?? [];
}
function gaps(streamID: string) {
  return isLiveHere.value ? props.buffers.get(streamID)?.gaps ?? 0 : 0;
}
function frame(streamID: string) {
  return props.frames.get(streamID) ?? null;
}
function intervalValid(s: StreamableEntry) {
  const raw = intervals[s.streamID];
  if (!raw || !/^\d+$/.test(raw.trim())) return false;
  const n = Number(raw);
  return n >= KT_LIMITS.minIntervalMs && n <= 86_400_000 && n !== s.intervalMs;
}
function applyInterval(s: StreamableEntry) {
  if (!intervalValid(s)) return;
  emit('stream', s.streamID, { intervalMs: Number(intervals[s.streamID]) });
  intervals[s.streamID] = '';
}
async function copy(text: string) {
  if (text && await ktCopy(text)) emit('copied');
}

function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement;
  if (target.closest('input, textarea, select')) return;
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); }
  else if (event.key === 'j' || event.key === 'J') { event.preventDefault(); emit('step', 1); }
  else if (event.key === 'k' || event.key === 'K') { event.preventDefault(); emit('step', -1); }
}

watch(() => props.item?.key, async (key, previous) => {
  if (!key || key === previous) return;
  await nextTick();
  closer.value?.focus({ preventScroll: true });
});
</script>
