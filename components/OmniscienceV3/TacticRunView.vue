<template>
    <OmniscienceV3ErrorBlock v-if="error && !run" :error="error" what="This run" @retry="follow" />
    <div v-else-if="!run" class="omni-skelrows" aria-busy="true"><div v-for="n in 6" :key="n" class="omni-skel"></div></div>
    <div v-else class="omni-run" data-testid="omni-run">
        <div class="omni-row">
            <span class="omni-chip" :class="omniStateTone(run.state)" data-testid="omni-run-state">{{ run.state }}</span>
            <span v-if="live" class="omni-chip info"><span class="omni-dot ok"></span>following live</span>
            <span v-if="run.stale" class="omni-chip warn" title="The data this run read has changed since it finished">stale — re-run</span>
            <span v-if="run.currentStage && !terminal" class="omni-muted">stage: {{ run.currentStage }}</span>
            <span style="flex:1"></span>
            <template v-if="canRun">
                <button v-if="run.state === 'running' || run.state === 'queued'" class="omni-btn sm" type="button" :disabled="busy !== null" @click="act('pause')">Pause</button>
                <button v-if="run.state === 'paused'" class="omni-btn primary sm" type="button" :disabled="busy !== null" @click="act('resume')">Resume</button>
                <button v-if="!terminal" class="omni-btn warn sm" type="button" :disabled="busy !== null" @click="act('cancel')">Cancel</button>
                <button v-if="terminal" class="omni-btn sm" type="button" :disabled="busy !== null" @click="rerun">Run again</button>
            </template>
        </div>

        <div v-if="run.error" class="omni-banner" role="alert">
            <span class="glyph" aria-hidden="true">⚠</span><div><strong>The run failed</strong><span class="muted omni-wrap">{{ run.error }}</span></div>
        </div>
        <div v-if="error" class="omni-banner warn" role="status">
            <span class="glyph" aria-hidden="true">⚠</span>
            <div><strong>Live updates stopped</strong><span class="muted">{{ error.message }}</span></div>
            <div class="actions"><button class="omni-btn sm" type="button" @click="follow">Reconnect</button></div>
        </div>

        <dl class="omni-kv omni-section">
            <dt>Tactic</dt><dd>{{ run.tactic }} · v{{ run.tacticVersion }}</dd>
            <dt>Started by</dt><dd>{{ run.actor }}</dd>
            <dt>Created</dt><dd><OmniscienceV3Time :ms="run.createdAtMs" seconds /></dd>
            <dt>Finished</dt><dd><OmniscienceV3Time :ms="run.finishedAtMs" seconds /></dd>
            <dt>Took</dt><dd>{{ run.startedAtMs ? omniDuration((run.finishedAtMs ?? now) - run.startedAtMs) : '—' }}</dd>
            <dt>As of</dt><dd><OmniscienceV3Time v-if="run.asOfMs" :ms="run.asOfMs" mode="absolute" /><template v-else>now (when it ran)</template></dd>
            <dt v-if="run.parentRunId">Re-run of</dt>
            <dd v-if="run.parentRunId"><a href="#" @click.prevent="$emit('open', run.parentRunId!)">{{ run.parentRunId }}</a></dd>
            <dt v-if="run.playbookRunId">Playbook run</dt><dd v-if="run.playbookRunId">{{ run.playbookRunId }}</dd>
        </dl>

        <section class="omni-section">
            <h4>Results ({{ outputs.length }})</h4>
            <p v-if="!outputs.length" class="omni-muted">{{ terminal ? 'This run produced no output.' : 'Results appear here as the run produces them.' }}</p>
            <div v-for="(out, i) in outputs" :key="i" class="output" data-testid="omni-output">
                <div class="omni-row">
                    <span class="omni-chip info">{{ out.kind }}</span>
                    <strong v-if="out.summary">{{ out.summary }}</strong>
                </div>
                <template v-if="out.selection">
                    <div class="omni-row">
                        <span>{{ omniCount(out.selection.items.length) }} {{ out.selection.kind }} item{{ out.selection.items.length === 1 ? '' : 's' }}</span>
                        <span v-if="out.selection.sampled" class="omni-chip warn">sampled from {{ omniCount(out.selection.totalBeforeSampling) }}</span>
                        <button class="omni-btn sm" type="button" @click="$emit('use', { ...out.selection, origin: `run ${run.runId}` })">Use as input for another tactic</button>
                    </div>
                    <ol class="items">
                        <li v-for="item in out.selection.items.slice(0, shown[i] ?? 20)" :key="item.id">
                            <span class="omni-mono">{{ item.label ?? item.id }}</span>
                            <span v-if="item.label" class="omni-muted omni-mono id">{{ item.id }}</span>
                            <span v-if="item.score != null" class="omni-muted"> · {{ item.score.toFixed(3) }}</span>
                        </li>
                    </ol>
                    <button v-if="out.selection.items.length > (shown[i] ?? 20)" class="omni-btn ghost sm" type="button" @click="shown[i] = (shown[i] ?? 20) + 200">
                        Show more ({{ omniCount(out.selection.items.length - (shown[i] ?? 20)) }} hidden)
                    </button>
                </template>
                <OmniscienceV3Json v-if="out.data != null" :value="out.data" />
            </div>
        </section>

        <section v-if="events.length || run.progress != null" class="omni-section">
            <h4>Progress</h4>
            <OmniscienceV3Json v-if="run.progress != null && !events.length" :value="run.progress" />
            <ul class="omni-timeline">
                <li v-for="ev in events" :key="ev.id">
                    <span class="omni-wrap">{{ ev.text }}</span>
                    <span class="sub"><OmniscienceV3Time :ms="ev.at" mode="absolute" seconds /></span>
                </li>
            </ul>
        </section>

        <section class="omni-section"><h4>Input</h4><OmniscienceV3Json :value="run.input" max-height="220px" /></section>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue';
import { OmniApiError, omniPost, omniStream, toOmniError } from '~/scripts/omniscience/api';
import type { RunActionResultDto, Selection, TacticOutput, TacticRunDto, TacticRunStartedDto } from '~/scripts/omniscience/contracts';
import { omniCount, omniDuration, omniStateTone } from '~/scripts/omniscience/format';
import { useOmniAction, useOmniTime } from '~/composables/useOmniscienceV3';
import { useAccess } from '~/composables/useAccess';

/**
 * One tactic run, followed live: the server streams the run as it stands, each progress event,
 * then the finished run. Results are typed sets, so any of them can be handed to another tactic.
 */
const props = defineProps<{ runId: string }>();
const emit = defineEmits<{ use: [selection: Selection]; open: [runId: string]; changed: [] }>();

const { can } = useAccess();
const canRun = computed(() => can('omniscience.tactics.run'));
const { now } = useOmniTime();
const { busy, run: perform } = useOmniAction();

const run = shallowRef<TacticRunDto | null>(null);
const error = ref<OmniApiError | null>(null);
const live = ref(false);
const events = ref<{ id: number; at: number; text: string }[]>([]);
const shown = reactive<Record<number, number>>({});
let controller: AbortController | null = null;

const terminal = computed(() => ['succeeded', 'failed', 'cancelled'].includes(run.value?.state ?? ''));
const outputs = computed<TacticOutput[]>(() => (Array.isArray(run.value?.outputs) ? run.value!.outputs as TacticOutput[] : []));

function describe(detail: any): string {
    const inner = detail?.detail ?? detail;
    if (inner && typeof inner === 'object') {
        if (typeof inner.message === 'string') return inner.message;
        if (typeof inner.stage === 'string') return `Stage: ${inner.stage}${inner.note ? ` — ${inner.note}` : ''}`;
        if (typeof inner.state === 'string') return `State: ${inner.state}${inner.error ? ` — ${inner.error}` : ''}`;
    }
    return JSON.stringify(inner);
}

async function follow() {
    controller?.abort();
    const mine = new AbortController();
    controller = mine;
    error.value = null;
    live.value = true;
    try {
        await omniStream('tactics/runs/stream', { id: props.runId }, line => {
            if (mine.signal.aborted) return;
            if (line?.type === 'run' && line.run) {
                const was = run.value?.state;
                run.value = line.run as TacticRunDto;
                if (was && was !== run.value.state) emit('changed');
            } else if (typeof line?.id === 'number') {
                events.value = [...events.value.slice(-199), { id: line.id, at: line.at, text: describe(line.detail) }];
                const state = line.detail?.detail?.state;
                if (run.value && typeof state === 'string' && state !== run.value.state) run.value = { ...run.value, state };
            }
        }, mine.signal);
    } catch (caught) {
        const e = toOmniError(caught);
        if (e.kind !== 'aborted' && !mine.signal.aborted) error.value = e;
    } finally {
        if (controller === mine) { controller = null; live.value = false; }
    }
}

async function act(what: 'cancel' | 'pause' | 'resume') {
    const result = await perform(what, () => omniPost<RunActionResultDto>(`tactics/runs/${what}`, { runId: props.runId }),
        r => (r.changed ? `The run is now ${r.state}.` : `The run was already ${r.state}.`));
    if (!result) return;
    emit('changed');
    // A resumed run produces new events, and a stream that ended at "paused" will not see them.
    if (!live.value) void follow();
}

async function rerun() {
    const started = await perform('rerun', () => omniPost<TacticRunStartedDto>('tactics/runs/rerun', { runId: props.runId, clearAsOf: false }),
        () => 'Started a new run with the same input.');
    if (started) { emit('changed'); emit('open', started.runId); }
}

watch(() => props.runId, () => {
    run.value = null;
    events.value = [];
    for (const key of Object.keys(shown)) delete shown[Number(key)];
    void follow();
}, { immediate: true });

onBeforeUnmount(() => controller?.abort());
</script>

<style scoped>
.output { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; margin-bottom: 8px; border: 1px solid var(--omni-line); border-radius: var(--omni-radius-sm); }
.items .id { margin-left: 8px; }
.items { margin: 0; padding-left: 28px; max-height: 300px; overflow: auto; font-size: 12.5px; }
.omni-banner .muted { display: block; color: var(--omni-text-2); }
p { margin: 0; }
</style>
