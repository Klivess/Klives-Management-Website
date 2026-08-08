<template>
    <div class="kt-stack">
        <!-- (a) Identity and link. Everything the hub reports about a gadget lands here,
             including the six fields the old page received and never displayed. -->
        <KliveTechPanel title="Identity & link" subtitle="As the hub currently sees it">
            <dl class="kt-kv">
                <dt>Gadget ID</dt>
                <dd>
                    {{ gadget.gadgetID }}
                    <button class="kt-btn ghost sm" style="margin-left:var(--kt-space-2)"
                            @click="copy(gadget.gadgetID)">{{ copied ? 'Copied' : 'Copy' }}</button>
                </dd>
                <dt>State</dt>
                <dd>
                    <KliveTechLamp :tone="gadgetTone(gadget, now)" :word="gadgetStateWord(gadget, now)" />
                </dd>
                <dt>Transport</dt>
                <dd>
                    <span class="kt-chip" :class="transportClass(gadget.connectionType)">
                        {{ gadget.connectionType }}
                    </span>
                    <span v-if="gadget.isHub" class="kt-chip accent" style="margin-left:4px">relay hub</span>
                </dd>
                <dt>Address</dt><dd>{{ gadget.IPAddress || NO_VALUE }}</dd>
                <dt>Address (MAC)</dt><dd>{{ fmtMac(gadget.IPAddressLong) }}</dd>
                <dt>Address (int64)</dt><dd>{{ gadget.IPAddressLong || NO_VALUE }}</dd>

                <template v-if="gadget.isHub">
                    <dt>Hub ID</dt><dd>{{ gadget.hubID || NO_VALUE }}</dd>
                    <dt>Hosting</dt>
                    <dd>
                        {{ gadget.connectedGadgetCount }} gadget{{ gadget.connectedGadgetCount === 1 ? '' : 's' }}
                        <span v-if="childCount !== gadget.connectedGadgetCount" class="kt-chip warn"
                              style="margin-left:4px">{{ childCount }} visible</span>
                    </dd>
                </template>
                <template v-if="gadget.connectedViaHubID">
                    <dt>Connected via</dt>
                    <dd>
                        <button v-if="hub" class="kt-btn ghost sm" @click="$emit('open', hub)">
                            {{ hub.name }}
                        </button>
                        <span v-else>
                            {{ gadget.connectedViaHubID }}
                            <span class="kt-chip warn" style="margin-left:4px">hub not connected</span>
                        </span>
                    </dd>
                </template>

                <dt>Streamables</dt>
                <dd>
                    {{ gadget.streamableCount }} of {{ KT_LIMITS.streamablesPerGadget }}
                    <span v-if="enabledStreams" class="muted"> · {{ enabledStreams }} enabled</span>
                </dd>
                <dt>Actions</dt><dd>{{ gadget.actions.length }}</dd>
                <dt>Connected</dt>
                <dd>{{ fmtTime(gadget.timeConnected) }} <span class="muted">· up {{ uptime }}</span></dd>
                <dt>Last heard</dt>
                <dd :class="{ 'kt-stale': isQuiet }">
                    {{ fmtAgo(gadget.lastMessageReceived, now) }}
                    <span class="muted">· {{ fmtTime(gadget.lastMessageReceived) }}</span>
                </dd>
            </dl>
        </KliveTechPanel>

        <!-- (b) Actions -->
        <KliveTechPanel title="Actions" :subtitle="`${gadget.actions.length} exposed by the gadget`"
                        :empty="!gadget.actions.length || !gadget.isOnline"
                        :empty-kind="gadget.isOnline ? 'empty' : 'offline'"
                        :empty-title="gadget.isOnline ? 'No actions advertised' : undefined"
                        :empty-text="gadget.isOnline
                            ? 'The gadget reported an empty action list when it connected.'
                            : 'Actions can only be run against a gadget that is online.'">
            <div class="kt-stack">
                <KliveTechActionControl v-for="(action, index) in gadget.actions"
                    :key="`${action.name}-${index}`" :action="action" :now="now"
                    :disabled="!gadget.isOnline" @run="onRunAction" />
            </div>
        </KliveTechPanel>

        <!-- (c) Streamables -->
        <KliveTechPanel title="Streamables" :subtitle="liveSubtitle"
                        :empty="!streamables.length"
                        :empty-kind="gadget.isOnline ? 'empty' : 'offline'"
                        :empty-title="gadget.isOnline ? 'No Streamables published' : undefined"
                        :empty-text="gadget.isOnline
                            ? 'Streamables are declared by the gadget firmware. This one has declared none.'
                            : 'Telemetry resumes when the gadget reconnects.'">
            <template #controls>
                <KliveTechLamp :tone="liveTone" :word="liveWord" :pulse="liveStatus === 'live'" />
            </template>
            <div class="kt-stack">
                <KliveTechStreamRow v-for="(entry, index) in streamables" :key="entry.streamID"
                    :entry="entry"
                    :points="pointsFor(entry.streamID)"
                    :text-entries="textFor(entry.streamID)"
                    :frame="frames.get(entry.streamID)"
                    :gaps="gapsFor(entry.streamID)"
                    :stroke="traceColour(index)"
                    :live="liveStatus === 'live'"
                    :now="now"
                    :busy="busyStreams.has(entry.streamID)"
                    :error="streamErrors[entry.streamID] || ''"
                    @set-enabled="(id, enabled) => $emit('setEnabled', id, enabled)"
                    @set-interval="(id, ms) => $emit('setInterval', id, ms)"
                    @fetch-frame="(id) => $emit('fetchFrame', id)"
                    @toggle-pause="$emit('togglePause')" />
            </div>
        </KliveTechPanel>

        <!-- (d) Firmware for this gadget -->
        <KliveTechPanel title="Firmware" subtitle="Recent jobs for this gadget"
                        :empty="!jobs.length"
                        empty-title="No firmware job has targeted this gadget"
                        empty-text="Flashing compiles a project from the inbox and pushes it over the air.">
            <template #controls>
                <button class="kt-btn sm" :disabled="!gadget.isOnline" @click="$emit('flash', gadget)">
                    Flash…
                </button>
            </template>
            <div class="kt-stack">
                <div v-for="job in jobs" :key="job.jobID" class="job">
                    <div class="jobhead">
                        <span class="kt-chip" :class="jobTone(job.state)">{{ job.state }}</span>
                        <span class="mono">{{ job.project }}</span>
                        <span class="grow"></span>
                        <span class="muted" style="font-size:10px">{{ fmtAgo(job.createdUtc, now) }}</span>
                    </div>
                    <KliveTechMeter v-if="!isTerminalJob(job.state)"
                        :percent="job.progressPercent"
                        :indeterminate="job.state === 'Compiling'"
                        :value="job.totalBytes ? `${fmtBytes(job.bytesTransferred)} / ${fmtBytes(job.totalBytes)}` : ''" />
                    <p v-if="job.error" class="joberr">{{ job.error }}</p>
                </div>
            </div>
        </KliveTechPanel>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
    fmtAgo, fmtBytes, fmtDuration, fmtMac, fmtTime, gadgetTone, gadgetStateWord,
    isTerminalJob, jobTone, ktCopy, parseUtc, traceColour, transportClass,
    ageMs, KT_LIMITS, NO_VALUE, STALE_AFTER_MS,
    type FirmwareJob, type Gadget, type GadgetAction, type StreamableEntry,
} from '~/scripts/kliveTech';
import type { FrameState, LiveStatus, StreamBuffer } from '~/scripts/kliveTechLive';

const props = withDefaults(defineProps<{
    gadget: Gadget;
    allGadgets: Gadget[];
    streamables: StreamableEntry[];
    buffers: Map<string, StreamBuffer>;
    frames: Map<string, FrameState>;
    jobs: FirmwareJob[];
    liveStatus: LiveStatus;
    liveDetail?: string;
    busyStreams?: Set<string>;
    streamErrors?: Record<string, string>;
    now?: number;
}>(), {
    busyStreams: () => new Set<string>(),
    streamErrors: () => ({}),
    now: () => Date.now(),
});

const emit = defineEmits<{
    runAction: [action: GadgetAction, param: string, done: (error?: string) => void];
    setEnabled: [streamID: string, enabled: boolean];
    setInterval: [streamID: string, intervalMs: number];
    fetchFrame: [streamID: string];
    togglePause: [];
    flash: [gadget: Gadget];
    open: [gadget: Gadget];
}>();

const copied = ref(false);
async function copy(text: string) {
    copied.value = await ktCopy(text);
    if (copied.value) setTimeout(() => { copied.value = false; }, 1500);
}

const hub = computed(() =>
    props.allGadgets.find(g => g.isHub && g.hubID === props.gadget.connectedViaHubID) ?? null);

const childCount = computed(() =>
    props.allGadgets.filter(g => g.connectedViaHubID && g.connectedViaHubID === props.gadget.hubID).length);

const enabledStreams = computed(() => props.streamables.filter(s => s.enabled).length);

const uptime = computed(() => {
    const at = parseUtc(props.gadget.timeConnected);
    return at === null ? NO_VALUE : fmtDuration(props.now - at);
});

const isQuiet = computed(() => {
    if (!props.gadget.isOnline) return false;
    const age = ageMs(props.gadget.lastMessageReceived, props.now);
    return age !== null && age > STALE_AFTER_MS;
});

const LIVE_WORDS: Record<LiveStatus, string> = {
    idle: 'Paused',
    connecting: 'Connecting',
    live: 'Live',
    reconnecting: 'Reconnecting',
    refused: 'Refused',
    unavailable: 'Polling',
};
const liveWord = computed(() => LIVE_WORDS[props.liveStatus]);
const liveTone = computed(() => {
    switch (props.liveStatus) {
        case 'live': return 'ok' as const;
        case 'connecting': case 'reconnecting': return 'warn' as const;
        case 'refused': return 'fault' as const;
        default: return 'idle' as const;
    }
});
const liveSubtitle = computed(() =>
    props.liveDetail || `${props.streamables.length} declared · ${enabledStreams.value} enabled`);

function pointsFor(streamID: string) { return props.buffers.get(streamID)?.points ?? []; }
function textFor(streamID: string) { return props.buffers.get(streamID)?.text ?? []; }
function gapsFor(streamID: string) { return props.buffers.get(streamID)?.gaps ?? 0; }

function onRunAction(action: GadgetAction, param: string, done: (error?: string) => void) {
    emit('runAction', action, param, done);
}
</script>

<style scoped>
.job {
    display: flex;
    flex-direction: column;
    gap: var(--kt-space-2);
    padding: var(--kt-space-2) var(--kt-space-3);
    border: 1px solid var(--kt-line);
    border-radius: var(--kt-radius-sm);
    background: var(--kt-surface-2);
}
.jobhead { display: flex; align-items: center; gap: var(--kt-space-2); font-size: 12px; }
.joberr { font-size: 11px; color: var(--kt-lamp-fault); }
</style>
