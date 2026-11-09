<template>
    <form class="omni-runform" @submit.prevent="start">
        <p>{{ tactic.description }}</p>
        <div class="omni-row">
            <span class="ot-chip">{{ tactic.category }}</span>
            <span class="ot-chip">{{ tactic.lane }}</span>
            <span class="omni-muted">usually {{ omniDuration(tactic.typicalDurationMs) }}<template v-if="tactic.typicalLlmCalls"> · about {{ tactic.typicalLlmCalls }} LLM call{{ tactic.typicalLlmCalls === 1 ? '' : 's' }}</template></span>
            <span v-if="tactic.minorRestriction" class="ot-chip violet" title="Refused for anyone the minor-safety guard covers">minor-restricted</span>
        </div>

        <div v-if="!permitted" class="ot-banner warn" role="note">
            <span class="glyph" aria-hidden="true">🔒</span>
            <div><strong>You cannot run this tactic.</strong><span class="muted">It needs {{ tactic.requiredPermission }} and omniscience.tactics.run.</span></div>
        </div>
        <div v-else-if="tactic.outbound" class="ot-banner warn" role="note">
            <span class="glyph" aria-hidden="true">✋</span>
            <div><strong>This tactic acts on the outside world.</strong>
                <span class="muted">It runs only after a preview and an explicit confirmation. That confirmation step is not part of this build yet, so it cannot be started from here.</span></div>
        </div>

        <section class="omni-section">
            <h4>Input</h4>
            <OmniscienceV3SelectionEditor v-model="selections" :accepts="tactic.accepts" :min="tactic.minSelections" :max="tactic.maxSelections" />
        </section>

        <section class="omni-section">
            <h4>Parameters</h4>
            <OmniscienceV3SchemaForm v-model="parameters" :schema-json="tactic.parameterSchemaJson" @valid="parametersValid = $event" />
        </section>

        <section class="omni-section">
            <h4>As of</h4>
            <div class="ot-field">
                <label :for="`${uid}-asof`">Answer as the world was known at ({{ zone }})</label>
                <input :id="`${uid}-asof`" v-model="asOfLocal" class="ot-input" type="datetime-local" />
                <span class="help">Leave empty for now. A past time ignores everything learned after it.</span>
            </div>
        </section>

        <div v-if="estimate" class="ot-banner info" role="status" data-testid="omni-estimate">
            <span class="glyph" aria-hidden="true">ℹ</span>
            <div>
                <strong>Estimate: {{ omniDuration(estimate.durationMs) }}, {{ estimate.llmCalls }} LLM call{{ estimate.llmCalls === 1 ? '' : 's' }}, {{ omniCount(estimate.items) }} item{{ estimate.items === 1 ? '' : 's' }}</strong>
                <span v-if="estimate.willSample" class="muted">The input is too large to use whole: a stratified sample will be taken, and the result will say so.</span>
                <span v-if="estimate.note" class="muted">{{ estimate.note }}</span>
            </div>
        </div>
        <div v-if="problem" class="ot-banner" role="alert" data-testid="omni-run-problem">
            <span class="glyph" aria-hidden="true">⚠</span>
            <div><strong>{{ problem.title }}</strong><span class="muted omni-wrap">{{ problem.detail }}</span></div>
        </div>

        <div class="omni-row omni-section">
            <button class="ot-btn primary" type="submit" :disabled="!runnable || working !== null">{{ working === 'run' ? 'Starting…' : 'Run' }}</button>
            <button class="ot-btn" type="button" :disabled="!ready || working !== null" @click="doEstimate">{{ working === 'estimate' ? 'Estimating…' : 'Estimate first' }}</button>
            <span v-if="shortfall" class="omni-muted">{{ shortfall }}</span>
        </div>
    </form>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { omniPost, toOmniError } from '~/scripts/omniscience/api';
import type { Selection, TacticDescriptor, TacticEstimate, TacticRunRequest, TacticRunStartedDto } from '~/scripts/omniscience/contracts';
import { omniCount, omniDuration, omniZonedToMs } from '~/scripts/omniscience/format';
import { useOmniTime } from '~/composables/useOmniscienceV3';
import { useAccess } from '~/composables/useAccess';

/** Everything needed to start one tactic: its input sets, its parameters and an optional as-of. */
const props = defineProps<{ tactic: TacticDescriptor; initialSelections?: Selection[] }>();
const emit = defineEmits<{ started: [runId: string] }>();

const uid = useId();
const { can } = useAccess();
const { zone } = useOmniTime();

const selections = ref<Selection[]>([]);
const parameters = ref<Record<string, unknown>>({});
const parametersValid = ref(true);
const asOfLocal = ref('');
const estimate = ref<TacticEstimate | null>(null);
const problem = ref<{ title: string; detail: string } | null>(null);
const working = ref<'run' | 'estimate' | null>(null);

watch(() => [props.tactic.key, props.initialSelections] as const, () => {
    const usable = (props.initialSelections ?? []).filter(s => props.tactic.accepts.includes(s.kind)).slice(0, props.tactic.maxSelections);
    selections.value = usable.map(s => ({ ...s, items: s.items.slice() }));
    parameters.value = {};
    asOfLocal.value = '';
    estimate.value = null;
    problem.value = null;
}, { immediate: true });

// A changed input makes an earlier estimate or refusal about something else.
watch([selections, parameters, asOfLocal], () => { estimate.value = null; problem.value = null; }, { deep: true });

const permitted = computed(() => can('omniscience.tactics.run') && can(props.tactic.requiredPermission));
const filled = computed(() => selections.value.filter(s => s.items.length > 0));
const shortfall = computed(() => {
    const t = props.tactic;
    if (selections.value.some(s => !s.items.length)) return 'An input set is empty.';
    if (filled.value.length < t.minSelections) return `Needs ${t.minSelections === t.maxSelections ? 'exactly' : 'at least'} ${t.minSelections} input set${t.minSelections === 1 ? '' : 's'}.`;
    if (!parametersValid.value) return 'A required parameter is missing or invalid.';
    if (asOfLocal.value && omniZonedToMs(asOfLocal.value, zone.value) === null) return 'The as-of time is not a valid date and time.';
    return '';
});
const ready = computed(() => permitted.value && !shortfall.value);
const runnable = computed(() => ready.value && !props.tactic.outbound);

function body(): TacticRunRequest {
    return {
        tactic: props.tactic.key,
        selections: filled.value,
        parameters: Object.keys(parameters.value).length ? parameters.value : null,
        asOfMs: asOfLocal.value ? omniZonedToMs(asOfLocal.value, zone.value) : null,
    };
}

function explain(caught: unknown) {
    const e = toOmniError(caught);
    const title = e.kind === 'refused' ? 'Refused by policy'
        : e.kind === 'confirmation_required' ? 'Confirmation required'
            : e.kind === 'forbidden' ? 'Not permitted'
                : e.kind === 'bad_request' ? 'The input was not accepted'
                    : 'Could not start';
    problem.value = { title, detail: e.message };
}

async function doEstimate() {
    working.value = 'estimate';
    problem.value = null;
    try {
        estimate.value = await omniPost<TacticEstimate>('tactics/estimate', body());
    } catch (caught) {
        explain(caught);
    } finally {
        working.value = null;
    }
}

async function start() {
    if (!runnable.value) return;
    working.value = 'run';
    problem.value = null;
    try {
        const started = await omniPost<TacticRunStartedDto>('tactics/run', body());
        emit('started', started.runId);
    } catch (caught) {
        explain(caught);
    } finally {
        working.value = null;
    }
}
</script>

<style scoped>
.omni-runform p { margin: 0 0 8px; }
.ot-banner .muted { display: block; color: var(--ot-text-2); }
</style>
