<template>
  <article
    class="ktx-gadget"
    :data-state="item.state"
    :data-transport="item.transport"
    :aria-current="selected || undefined"
    :data-testid="`gadget-${item.key}`"
  >
    <button class="ktx-gadget__head" :aria-label="`Open ${item.name}`" @click="emit('open')">
      <span class="ktx-led" :data-tone="tone" :data-pulse="item.state === 'online' || item.state === 'connecting' || undefined"></span>
      <span class="ktx-gadget__id">
        <span class="ktx-gadget__name ktx-truncate">{{ item.name }}</span>
        <span class="ktx-gadget__sub">
          <span class="ktx-tx" :data-transport="item.transport"><TechIcon :name="transportIcon" />{{ transportText }}</span>
          <span class="ktx-mono ktx-faint ktx-truncate">{{ item.address }}</span>
        </span>
      </span>
      <span class="ktx-gadget__state" :data-tone="tone" data-testid="gadget-state">{{ stateText }}</span>
    </button>

    <!-- online: the controls first, because that is what the card is for -->
    <template v-if="online">
      <div v-if="item.actions.length" class="ktx-gadget__actions">
        <TechActionControl
          v-for="action in quick"
          :key="action.name"
          :action="action"
          :run="lastRun(item.gadgetID, action.name)"
          :disabled="!canAct"
          :now="now"
          compact
          @run="value => emit('run', action, value)"
        />
        <button v-if="item.actions.length > quick.length" class="ktx-gadget__more" @click="emit('open')">
          +{{ item.actions.length - quick.length }} more
        </button>
      </div>
      <div v-else-if="!carries?.length" class="ktx-gadget__note ktx-dim">{{ item.gadget?.isHub ? `Relays ${hosted}` : 'No actions published' }}</div>

      <!-- a hub: what it carries, so a dead child is visible on its parent too -->
      <div v-if="carries?.length" class="ktx-gadget__carries" data-testid="gadget-carries">
        <span class="ktx-gadget__carries-label">Carries {{ carries.length }}</span>
        <button v-for="child in carries" :key="child.key" class="ktx-gadget__child" @click="emit('openChild', child.key)">
          <span class="ktx-led ktx-led--sm" :data-tone="STATE_TONE[child.state]"></span>
          <span class="ktx-truncate">{{ child.name }}</span>
          <span class="ktx-faint">{{ STATE_LABEL[child.state] }}</span>
        </button>
      </div>

      <div v-if="readouts.length" class="ktx-gadget__reads">
        <div v-for="s in readouts" :key="s.streamID" class="ktx-read" :data-off="!s.enabled || undefined" :title="`${s.streamID} · ${s.valueType} · ${s.enabled ? 'live' : 'paused'}`">
          <span class="ktx-read__id ktx-truncate">{{ s.streamID }}</span>
          <span class="ktx-read__value ktx-mono ktx-truncate">{{ value(s) }}</span>
          <TechSpark v-if="sparkFor(s.streamID).length > 1" class="ktx-read__spark" :points="sparkFor(s.streamID)" :step="s.valueType === 'boolean'" :height="18" :width="80" />
        </div>
      </div>
    </template>

    <!-- not online: why, and what can be done about it -->
    <div v-else class="ktx-gadget__why">
      <p class="ktx-gadget__reason" data-testid="gadget-reason">{{ reason }}</p>
      <div class="ktx-gadget__fix">
        <button v-if="canRetry" class="ktx-btn ktx-btn--sm" :disabled="!!pending || item.state === 'connecting'" :data-testid="`retry-${item.key}`" @click="emit('retry')">
          <TechIcon name="refresh" :class="{ 'ktx-spin': pending === 'retry' || item.state === 'connecting' }" />{{ item.state === 'connecting' ? 'Connecting…' : 'Try again' }}
        </button>
        <button v-if="canForget" class="ktx-btn ktx-btn--sm ktx-btn--ghost" :disabled="!!pending" :data-testid="`forget-${item.key}`" @click="emit('forget')">
          <TechIcon name="trash" />Forget
        </button>
      </div>
    </div>

    <footer class="ktx-gadget__foot">
      <template v-if="online">
        <span title="Connected for">up <b>{{ uptime }}</b></span>
        <span title="Last message">heard <b>{{ heard }}</b></span>
        <span v-if="item.streams.length">{{ liveStreams }}/{{ item.streams.length }} streams</span>
        <span v-if="item.hubName" class="ktx-truncate">via <b>{{ item.hubName }}</b></span>
      </template>
      <template v-else>
        <span v-if="rec?.lastConnectedUtc">last up <b>{{ fmtClock(rec.lastConnectedUtc, now) }}</b></span>
        <span v-if="rec?.lastAttemptUtc">tried <b>{{ fmtAgo(rec.lastAttemptUtc, now) }}</b></span>
        <span v-if="rec?.totalAttempts">{{ rec.totalAttempts }} attempts</span>
        <span v-if="item.hubName" class="ktx-truncate">via <b>{{ item.hubName }}</b></span>
      </template>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  NO_VALUE, STATE_LABEL, STATE_TONE, TRANSPORT_LABEL, fmtAgo, fmtClock, fmtDuration, fmtStreamValue, isLive, parseUtc, plural, quickActions,
  type FleetItem, type GadgetAction, type StreamableEntry,
} from '~/scripts/kliveTech';
import type { ActionRun } from '~/composables/useKliveTech';

/** One gadget: how it is reached, its one-click controls and first readings, or why it is not here. */
const props = defineProps<{
  item: FleetItem;
  now: number;
  selected?: boolean;
  canAct: boolean;
  canManage: boolean;
  pending?: string;
  lastRun: (gadgetID: string, action: string) => ActionRun | null;
  sparks?: Map<string, number[]> | null;
  carries?: FleetItem[];
}>();
const emit = defineEmits<{ open: []; openChild: [key: string]; run: [action: GadgetAction, value: string]; retry: []; forget: [] }>();

const online = computed(() => isLive(props.item.state));
const tone = computed(() => STATE_TONE[props.item.state]);
const rec = computed(() => props.item.remembered);
const quick = computed(() => quickActions(props.item.actions, 3));
const readouts = computed(() => [...props.item.streams].sort((a, b) => Number(b.enabled) - Number(a.enabled)).filter(s => s.valueType !== 'binary').slice(0, 3));
const liveStreams = computed(() => props.item.streams.filter(s => s.enabled).length);
const hosted = computed(() => plural(props.item.gadget?.connectedGadgetCount ?? 0, 'gadget'));

const transportIcon = computed(() => ({ bluetooth: 'bluetooth', hub: 'hub', relayed: 'relay' })[props.item.transport]);
const transportText = computed(() => (props.item.transport === 'relayed' && props.item.hubName ? props.item.hubName : TRANSPORT_LABEL[props.item.transport]));

const heard = computed(() => fmtAgo(props.item.gadget?.lastMessageReceived, props.now));
const uptime = computed(() => {
  const at = parseUtc(props.item.gadget?.timeConnected);
  return at === null ? NO_VALUE : fmtDuration(props.now - at);
});
const stateText = computed(() => {
  if (props.item.state === 'online') return heard.value === NO_VALUE ? 'Online' : `Online · ${heard.value.replace(' ago', '')}`;
  return STATE_LABEL[props.item.state];
});

const reason = computed(() => {
  const r = rec.value;
  switch (props.item.state) {
    case 'connecting': return 'Trying to connect now…';
    case 'unreachable': return r?.lastError ? `Didn't answer: ${r.lastError}.` : "Didn't answer.";
    case 'waiting-for-hub': return props.item.transport === 'hub'
      ? 'This relay hub is not connected to Omnipotent.'
      : `Comes back when ${props.item.hubName || 'its relay hub'} reports it.`;
    case 'offline': return r?.lastDisconnectReason ? `Went offline: ${r.lastDisconnectReason}` : 'Offline.';
    default: return 'Remembered, not tried since the server started.';
  }
});

const canRetry = computed(() => props.canAct && !!rec.value?.canRetry);
const canForget = computed(() => props.canManage && !!rec.value);

function value(s: StreamableEntry): string {
  return fmtStreamValue(s.latestValue, s.valueType);
}
function sparkFor(streamID: string): number[] {
  return props.sparks?.get(streamID) ?? [];
}
</script>
