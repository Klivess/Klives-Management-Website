<template>
    <div class="row" :class="{ open: expanded }">
        <KliveTechReadout :entry="entry" :spark="spark" :now="now" clickable
                          :pulse="live" :trace-stroke="stroke" @open="expanded = !expanded" />

        <div class="controls">
            <label class="kt-switch" :title="entry.gadgetOnline ? '' : 'The gadget is offline'">
                <input type="checkbox" :checked="entry.enabled" :disabled="busy || !entry.gadgetOnline"
                       @change="onToggle(($event.target as HTMLInputElement).checked)" />
                <span class="track"></span>
                <span>{{ entry.enabled ? 'Streaming' : 'Disabled' }}</span>
            </label>

            <div v-if="entry.mode !== 'manual'" class="interval">
                <input v-model.number="draftInterval" class="kt-input mono" type="number"
                       :min="KT_LIMITS.minIntervalMs" step="25"
                       :disabled="busy || !entry.gadgetOnline"
                       :aria-label="`Interval for ${entry.streamID} in milliseconds`"
                       :class="{ invalid: intervalError }"
                       style="width:86px" @keydown.enter="commitInterval" />
                <span class="muted" style="font-size:10px">ms</span>
                <button v-if="intervalDirty" class="kt-btn sm" :disabled="busy" @click="commitInterval">Set</button>
            </div>
            <span v-else class="kt-chip idle">manual · gadget decides</span>

            <button class="kt-btn ghost sm" @click="expanded = !expanded">
                {{ expanded ? 'Collapse' : 'Expand' }}
            </button>
        </div>

        <p v-if="error" class="err">{{ error }}</p>

        <div v-if="expanded" class="detail">
            <KliveTechFrameViewer v-if="entry.valueType === 'binary'"
                :frame="frame" :stream-i-d="entry.streamID" :mime-type="entry.mimeType"
                :paused="!live" :now="now"
                @toggle="$emit('togglePause')" @fetch="$emit('fetchFrame', entry.streamID)" />

            <KliveTechTraceChart v-else-if="chartable && points.length > 1"
                :points="points" :stroke="stroke" :label="entry.streamID"
                :step="entry.valueType === 'boolean'"
                :format="entry.valueType === 'boolean' ? boolFormat : undefined" />

            <div v-else-if="chartable" class="kt-state compact">
                <span class="glyph" aria-hidden="true">○</span>
                <span class="title">Not enough readings yet</span>
                <span class="detail">Two samples are needed before a trace can be drawn.</span>
            </div>

            <!-- A string or a json stream has no position on an axis, so it gets a log. -->
            <div v-else-if="textEntries.length" class="kt-tablewrap" style="max-height:260px">
                <table class="kt-table">
                    <thead><tr><th class="num">Seq</th><th>Time</th><th>Value</th></tr></thead>
                    <tbody>
                        <tr v-for="item in textEntries" :key="item.seq">
                            <td class="num">{{ item.seq }}</td>
                            <td class="mono">{{ new Date(item.at).toLocaleTimeString() }}</td>
                            <td class="mono">{{ fmtStreamValue(item.value, entry.valueType) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <KliveTechStateBlock v-else kind="empty" compact title="No samples received yet"
                detail="Values appear here as the gadget publishes them." />

            <dl class="kt-kv" style="margin-top:var(--kt-space-3)">
                <dt>Type</dt><dd>{{ entry.valueType }}<template v-if="entry.mimeType"> · {{ entry.mimeType }}</template></dd>
                <dt>Session</dt><dd>{{ entry.sessionID ? entry.sessionID.slice(0, 16) + '…' : NO_VALUE }}</dd>
                <dt>Manifest rev</dt><dd>{{ entry.manifestRevision }}</dd>
                <dt>Dropped</dt>
                <dd :style="entry.droppedEvents ? 'color:var(--kt-lamp-fault)' : ''">
                    {{ entry.droppedEvents }}<template v-if="gaps"> server · {{ gaps }} in transit</template>
                </dd>
            </dl>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
    fmtStreamValue, isChartable, KT_LIMITS, NO_VALUE,
    type StreamableEntry,
} from '~/scripts/kliveTech';
import type { FrameState, TracePoint } from '~/scripts/kliveTechLive';

const props = withDefaults(defineProps<{
    entry: StreamableEntry;
    points?: TracePoint[];
    textEntries?: { seq: number; at: number; value: unknown }[];
    frame?: FrameState;
    gaps?: number;
    stroke?: string;
    live?: boolean;
    now?: number;
    busy?: boolean;
    error?: string;
}>(), {
    points: () => [],
    textEntries: () => [],
    gaps: 0,
    stroke: 'var(--kt-accent)',
    now: () => Date.now(),
});

const emit = defineEmits<{
    setEnabled: [streamID: string, enabled: boolean];
    setInterval: [streamID: string, intervalMs: number];
    fetchFrame: [streamID: string];
    togglePause: [];
}>();

const expanded = ref(false);
const draftInterval = ref(props.entry.intervalMs);

// The server owns this value; a poll landing mid-edit must not fight the operator, but
// once they are done editing it should track the truth again.
watch(() => props.entry.intervalMs, (value) => {
    if (!intervalDirty.value) draftInterval.value = value;
});

const intervalDirty = computed(() => draftInterval.value !== props.entry.intervalMs);
const intervalError = computed(() =>
    !Number.isFinite(draftInterval.value) || draftInterval.value < KT_LIMITS.minIntervalMs);

const chartable = computed(() => isChartable(props.entry.valueType));
const spark = computed(() => props.points.slice(-40).map(p => p.y));

function boolFormat(value: number): string { return value >= 0.5 ? 'TRUE' : 'FALSE'; }

function onToggle(enabled: boolean) {
    emit('setEnabled', props.entry.streamID, enabled);
}

function commitInterval() {
    if (intervalError.value) return;
    // intervalMs is a uint with a 25ms floor; a fraction or a negative is a 400.
    const value = Math.max(KT_LIMITS.minIntervalMs, Math.round(draftInterval.value));
    draftInterval.value = value;
    emit('setInterval', props.entry.streamID, value);
}
</script>

<style scoped>
.row {
    display: flex;
    flex-direction: column;
    gap: var(--kt-space-2);
    padding: var(--kt-space-3);
    border: 1px solid var(--kt-line);
    border-radius: var(--kt-radius-sm);
    background: var(--kt-surface-2);
}
.row.open { border-color: var(--kt-line-strong); }
.controls { display: flex; align-items: center; gap: var(--kt-space-3); flex-wrap: wrap; }
.interval { display: flex; align-items: center; gap: var(--kt-space-1); }
.err { font-size: 11px; color: var(--kt-lamp-fault); }
.detail { padding-top: var(--kt-space-2); border-top: 1px solid var(--kt-line); }
</style>
