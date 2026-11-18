<template>
    <OmniscienceV3Shell>
        <div class="omni-pagehead">
            <div>
                <h1>Playbooks</h1>
                <p class="subtitle">Saved chains of tactics that run on a schedule in Klives's zone, when something happens, or on demand.</p>
            </div>
            <div class="omni-actions">
                <button class="omni-btn ghost" type="button" :disabled="list.refreshing.value" @click="list.refresh()">Refresh</button>
                <button v-if="canRun" class="omni-btn primary" type="button" @click="startNew">New playbook</button>
            </div>
        </div>

        <OmniscienceV3Panel title="Playbooks" flush :loading="list.loading.value" :error="list.error.value" :has-data="!!list.data.value"
                            :empty="!playbooks.length" empty-title="No playbooks yet"
                            empty-text="A playbook chains tactics: each step can take the previous step's result as its input." @retry="list.refresh()">
            <OmniscienceV3DataTable :rows="playbooks" :columns="columns" :row-key="r => r.id" label="playbooks" pinned selectable max-height="none"
                                 :selected-key="filters.playbook || null" default-sort="name" default-direction="asc" @select="edit($event)">
                <template #cell-name="{ row }"><strong>{{ row.name }}</strong></template>
                <template #cell-enabled="{ row }"><span class="omni-chip" :class="row.enabled ? 'ok' : ''">{{ row.enabled ? 'on' : 'off' }}</span></template>
                <template #cell-trigger="{ row }">{{ triggerText(row.trigger) }}</template>
                <template #cell-steps="{ row }">{{ row.definition.steps.map((s: PlaybookStep) => titleOf(s.tactic)).join(' → ') }}</template>
                <template #cell-lastRunMs="{ row }"><OmniscienceV3Time :ms="row.lastRunMs" mode="age" /></template>
            </OmniscienceV3DataTable>
        </OmniscienceV3Panel>

        <OmniscienceV3Drawer :open="!!draft" :title="draft?.id ? draft.name || 'Playbook' : 'New playbook'" :subtitle="draft?.id ?? ''" wide @close="closeEditor">
            <form v-if="draft" class="omni-pb" @submit.prevent="save">
                <div class="omni-formgrid">
                    <div class="omni-field" style="grid-column: span 2">
                        <label for="pb-name">Name</label>
                        <input id="pb-name" v-model="draft.name" class="omni-input" type="text" maxlength="120" required :disabled="!canRun" />
                    </div>
                    <div class="omni-field">
                        <label>State</label>
                        <label class="omni-check"><input v-model="draft.enabled" type="checkbox" :disabled="!canRun" /> enabled</label>
                    </div>
                </div>

                <section class="omni-section">
                    <h4>When it runs</h4>
                    <div class="omni-formgrid">
                        <div class="omni-field">
                            <label for="pb-kind">Trigger</label>
                            <select id="pb-kind" v-model="draft.trigger.kind" class="omni-select" :disabled="!canRun">
                                <option value="Manual">Only when started by hand</option>
                                <option value="Daily">Every day</option>
                                <option value="Weekly">On chosen weekdays</option>
                                <option value="Every">At a fixed interval</option>
                                <option value="Event">When something happens</option>
                            </select>
                        </div>
                        <div v-if="draft.trigger.kind === 'Daily' || draft.trigger.kind === 'Weekly'" class="omni-field">
                            <label for="pb-at">At ({{ klivesZone }})</label>
                            <input id="pb-at" v-model="draft.trigger.at" class="omni-input" type="time" :disabled="!canRun" />
                            <span class="help">Wall-clock time; fires once on days the clocks change.</span>
                        </div>
                        <div v-if="draft.trigger.kind === 'Every'" class="omni-field">
                            <label for="pb-every">Every (minutes)</label>
                            <input id="pb-every" v-model.number="everyMinutes" class="omni-input" type="number" min="1" step="1" :disabled="!canRun" />
                        </div>
                        <div v-if="draft.trigger.kind === 'Event'" class="omni-field">
                            <label for="pb-topic">Live-stream topic starts with</label>
                            <input id="pb-topic" v-model="draft.trigger.topic" class="omni-input mono" type="text" placeholder="alert" :disabled="!canRun" />
                        </div>
                        <div v-if="draft.trigger.kind === 'Event'" class="omni-field">
                            <label for="pb-min">At most once every (minutes)</label>
                            <input id="pb-min" v-model.number="minIntervalMinutes" class="omni-input" type="number" min="0" step="1" :disabled="!canRun" />
                        </div>
                    </div>
                    <div v-if="draft.trigger.kind === 'Weekly'" class="omni-row" style="margin-top:8px" role="group" aria-label="Weekdays">
                        <label v-for="d in DAYS" :key="d" class="omni-check">
                            <input type="checkbox" :checked="(draft.trigger.days ?? []).includes(d)" :disabled="!canRun" @change="toggleDay(d)" /> {{ d.slice(0, 3) }}
                        </label>
                    </div>
                    <div v-if="draft.trigger.kind === 'Event'" class="omni-field" style="margin-top:8px">
                        <label for="pb-match">Only when these payload fields match (JSON object of text values, optional)</label>
                        <input id="pb-match" v-model="matchText" class="omni-input mono" type="text" placeholder='{"severity":"high"}' :disabled="!canRun" />
                    </div>
                </section>

                <section class="omni-section">
                    <h4>Steps</h4>
                    <div v-for="(step, i) in draft.definition.steps" :key="stepKeys[i]" class="step">
                        <div class="omni-row">
                            <strong>{{ i + 1 }}.</strong>
                            <select v-model="step.tactic" class="omni-select auto" :aria-label="`Step ${i + 1} tactic`" :disabled="!canRun" @change="step.parameters = null">
                                <option value="" disabled>Choose a tactic…</option>
                                <option v-for="t in tactics" :key="t.key" :value="t.key">{{ t.code }} {{ t.title }}</option>
                            </select>
                            <select class="omni-select auto" :value="inputSource(step)" :aria-label="`Step ${i + 1} input`" :disabled="!canRun"
                                    @change="setInputSource(step, i, ($event.target as HTMLSelectElement).value)">
                                <option value="none">No input</option>
                                <option value="trigger">What triggered the playbook</option>
                                <option v-for="n in i" :key="n" :value="`step:${n - 1}`">Result of step {{ n }}</option>
                                <option value="literal">A fixed set…</option>
                            </select>
                            <span style="flex:1"></span>
                            <button v-if="canRun" class="omni-btn ghost sm" type="button" @click="removeStep(i)">Remove</button>
                        </div>
                        <template v-if="descriptorOf(step.tactic)">
                            <OmniscienceV3SelectionEditor v-if="step.input?.from === 'literal'" :model-value="step.input.selections ?? []"
                                                          :accepts="descriptorOf(step.tactic)!.accepts" :max="descriptorOf(step.tactic)!.maxSelections"
                                                          @update:model-value="step.input!.selections = $event" />
                            <OmniscienceV3SchemaForm :key="step.tactic" :schema-json="descriptorOf(step.tactic)!.parameterSchemaJson"
                                                     :model-value="(step.parameters as Record<string, unknown>) ?? {}"
                                                     @update:model-value="step.parameters = Object.keys($event).length ? $event : null" />
                        </template>
                    </div>
                    <button v-if="canRun" class="omni-btn sm" type="button" @click="addStep">Add a step</button>
                </section>

                <div v-if="validation && validation.problems.length" class="omni-banner warn" role="alert" data-testid="omni-pb-problems">
                    <span class="glyph" aria-hidden="true">⚠</span>
                    <div><strong>Not ready to save</strong><ul><li v-for="p in validation.problems" :key="p">{{ p }}</li></ul></div>
                </div>
                <p v-else-if="validation?.nextDueMs" class="omni-muted" data-testid="omni-pb-next">Next run: <OmniscienceV3Time :ms="validation.nextDueMs" /></p>
                <p v-if="localProblem" class="neg" role="alert">{{ localProblem }}</p>

                <div v-if="canRun" class="omni-row omni-section">
                    <button class="omni-btn primary" type="submit" :disabled="busy !== null || !!localProblem || !!validation?.problems.length">Save</button>
                    <button v-if="draft.id" class="omni-btn" type="button" :disabled="busy !== null || dirty" :title="dirty ? 'Save your changes first' : ''" @click="runNow">Run now</button>
                </div>

                <section v-if="draft.id" class="omni-section">
                    <h4>Recent runs</h4>
                    <OmniscienceV3ErrorBlock v-if="history.error.value && !history.data.value" :error="history.error.value" what="Run history" compact @retry="history.refresh()" />
                    <p v-else-if="!(history.data.value ?? []).length" class="omni-muted">This playbook has not run yet.</p>
                    <ul v-else class="omni-timeline">
                        <li v-for="r in history.data.value ?? []" :key="r.playbookRunId">
                            <span class="omni-chip" :class="omniStateTone(r.state)">{{ r.state }}</span>
                            <span v-if="r.error" class="neg omni-wrap"> {{ r.error }}</span>
                            <span class="sub"><OmniscienceV3Time :ms="r.createdAtMs" /><template v-if="r.finishedAtMs && r.startedAtMs"> · took {{ omniDuration(r.finishedAtMs - r.startedAtMs) }}</template></span>
                        </li>
                    </ul>
                </section>
            </form>
        </OmniscienceV3Drawer>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { omniGet, omniPost, toOmniError } from '~/scripts/omniscience/api';
import type {
    DayOfWeek, Playbook, PlaybookListDto, PlaybookRunRecord, PlaybookSaveRequest, PlaybookStep, PlaybookTrigger, PlaybookValidationDto,
    TacticCatalogDto, TacticDescriptor, TacticRunStartedDto,
} from '~/scripts/omniscience/contracts';
import { omniDuration, omniStateTone } from '~/scripts/omniscience/format';
import { useOmniAction, useOmniEngine, useOmniResource } from '~/composables/useOmniscienceV3';
import { useOmniUrlState } from '~/composables/useOmniscienceV3';
import { useAccess } from '~/composables/useAccess';
import type { TableColumn } from '~/components/OmniscienceV3/DataTable.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Playbooks' });

const DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const { can } = useAccess();
const canRun = computed(() => can('omniscience.tactics.run'));
const { klivesZone } = useOmniEngine();
const { busy, run } = useOmniAction();
const { state: filters } = useOmniUrlState({ playbook: '' });

const list = useOmniResource(signal => omniGet<PlaybookListDto>('playbooks', {}, signal));
const catalog = useOmniResource(signal => omniGet<TacticCatalogDto>('tactics', {}, signal));
const playbooks = computed<Playbook[]>(() => list.data.value?.playbooks ?? []);
const tactics = computed<TacticDescriptor[]>(() => catalog.data.value?.tactics ?? []);
const descriptorOf = (key: string) => tactics.value.find(t => t.key === key) ?? null;
const titleOf = (key: string) => descriptorOf(key)?.title ?? key;

function triggerText(t: PlaybookTrigger): string {
    switch (t.kind) {
        case 'Daily': return `daily at ${t.at ?? '?'} (${klivesZone.value})`;
        case 'Weekly': return `${(t.days ?? []).map(d => d.slice(0, 3)).join(', ') || 'no days'} at ${t.at ?? '?'} (${klivesZone.value})`;
        case 'Every': return `every ${omniDuration(t.everyMs)}`;
        case 'Event': return `on ${t.topic ?? '?'}`;
        default: return 'by hand';
    }
}

// ── editor ───────────────────────────────────────────────────────────────────

const draft = ref<PlaybookSaveRequest | null>(null);
const saved = ref('');
const stepKeys = ref<number[]>([]);
let stepSeq = 0;
const matchText = ref('');
const validation = ref<PlaybookValidationDto | null>(null);
const localProblem = ref<string | null>(null);

const everyMinutes = computed({
    get: () => (draft.value?.trigger.everyMs ? Math.round(draft.value.trigger.everyMs / 60_000) : null),
    set: v => { if (draft.value) draft.value.trigger.everyMs = v && v > 0 ? v * 60_000 : null; },
});
const minIntervalMinutes = computed({
    get: () => (draft.value?.trigger.minIntervalMs ? Math.round(draft.value.trigger.minIntervalMs / 60_000) : null),
    set: v => { if (draft.value) draft.value.trigger.minIntervalMs = v && v > 0 ? v * 60_000 : null; },
});

/** What would be sent: the trigger carries only the fields its kind uses. */
function request(): PlaybookSaveRequest | null {
    const d = draft.value;
    if (!d) return null;
    const t = d.trigger;
    const trigger: PlaybookTrigger = { kind: t.kind };
    if (t.kind === 'Daily' || t.kind === 'Weekly') trigger.at = t.at || null;
    if (t.kind === 'Weekly') trigger.days = t.days ?? [];
    if (t.kind === 'Every') trigger.everyMs = t.everyMs ?? null;
    if (t.kind === 'Event') {
        trigger.topic = t.topic || null;
        trigger.minIntervalMs = t.minIntervalMs ?? null;
        trigger.match = matchText.value.trim() ? JSON.parse(matchText.value) : null;
    }
    return { id: d.id ?? null, name: d.name.trim(), enabled: d.enabled, trigger, definition: { steps: d.definition.steps.filter(s => s.tactic) } };
}

function snapshot(): string {
    try { return JSON.stringify(request()); } catch { return '!'; }
}
const dirty = computed(() => snapshot() !== saved.value);

function load(source: PlaybookSaveRequest) {
    draft.value = JSON.parse(JSON.stringify(source));
    matchText.value = source.trigger.match ? JSON.stringify(source.trigger.match) : '';
    stepKeys.value = source.definition.steps.map(() => ++stepSeq);
    validation.value = null;
    localProblem.value = null;
    saved.value = snapshot();
}

function startNew() {
    filters.playbook = '';
    load({ id: null, name: '', enabled: true, trigger: { kind: 'Manual' }, definition: { steps: [{ tactic: '', parameters: null, input: null }] } });
    saved.value = '';
}
function edit(p: Playbook) { filters.playbook = p.id; }
function closeEditor() { draft.value = null; filters.playbook = ''; }

watch(() => [filters.playbook, playbooks.value] as const, ([id]) => {
    if (!id) return;
    const found = playbooks.value.find(p => p.id === id);
    if (found && draft.value?.id !== id) load({ id: found.id, name: found.name, enabled: found.enabled, trigger: found.trigger, definition: found.definition });
}, { immediate: true });

function addStep() {
    draft.value?.definition.steps.push({ tactic: '', parameters: null, input: null });
    stepKeys.value.push(++stepSeq);
}
function removeStep(i: number) {
    draft.value?.definition.steps.splice(i, 1);
    stepKeys.value.splice(i, 1);
}
function toggleDay(day: DayOfWeek) {
    if (!draft.value) return;
    const days = new Set(draft.value.trigger.days ?? []);
    if (days.has(day)) days.delete(day); else days.add(day);
    draft.value.trigger.days = DAYS.filter(d => days.has(d));
}
function inputSource(step: PlaybookStep): string {
    if (!step.input) return 'none';
    return step.input.from === 'step' ? `step:${step.input.step ?? 0}` : step.input.from;
}
function setInputSource(step: PlaybookStep, _index: number, value: string) {
    if (value === 'none') step.input = null;
    else if (value === 'trigger') step.input = { from: 'trigger' };
    else if (value === 'literal') step.input = { from: 'literal', selections: [] };
    else step.input = { from: 'step', step: Number(value.split(':')[1]), output: 0 };
}

// The server is the judge of a playbook; ask it as the draft changes and show what it says.
let validateTimer: ReturnType<typeof setTimeout> | null = null;
let validateSeq = 0;
watch([draft, matchText], () => {
    if (validateTimer) clearTimeout(validateTimer);
    if (!draft.value) return;
    validateTimer = setTimeout(async () => {
        const seq = ++validateSeq;
        let body: PlaybookSaveRequest | null;
        try {
            body = request();
            localProblem.value = null;
        } catch {
            localProblem.value = 'The payload match is not valid JSON.';
            return;
        }
        if (!body || !canRun.value) return;
        if (!body.definition.steps.length) { validation.value = { problems: ['A playbook needs at least one step.'] }; return; }
        try {
            const result = await omniPost<PlaybookValidationDto>('playbooks/validate', body);
            if (seq === validateSeq) validation.value = result;
        } catch (caught) {
            if (seq === validateSeq) validation.value = { problems: [toOmniError(caught).message] };
        }
    }, 350);
}, { deep: true });

const history = useOmniResource<PlaybookRunRecord[]>(
    signal => (draft.value?.id ? omniGet<PlaybookRunRecord[]>('playbooks/runs', { id: draft.value.id, limit: 20 }, signal) : Promise.resolve([])),
    { immediate: false });
watch(() => draft.value?.id, id => { history.data.value = null; if (id) void history.refresh(); });

async function save() {
    let body: PlaybookSaveRequest | null;
    try { body = request(); } catch { return; }
    if (!body) return;
    const result = await run('save', () => omniPost<Playbook>('playbooks/save', body), p => `“${p.name}” saved.`);
    if (!result) return;
    await list.refresh();
    load({ id: result.id, name: result.name, enabled: result.enabled, trigger: result.trigger, definition: result.definition });
    filters.playbook = result.id;
}

async function runNow() {
    const id = draft.value?.id;
    if (!id) return;
    const started = await run('run', () => omniPost<TacticRunStartedDto>('playbooks/run', { playbookId: id }), () => 'Playbook started.');
    if (started) { void history.refresh(); void list.refresh(); }
}

const columns: TableColumn[] = [
    { key: 'name', label: 'Playbook' },
    { key: 'enabled', label: 'State', sortValue: r => (r.enabled ? 1 : 0) },
    { key: 'trigger', label: 'Runs', sortable: false },
    { key: 'steps', label: 'Steps', sortable: false },
    { key: 'lastRunMs', label: 'Last run', num: true },
];
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; margin-bottom: 8px; border: 1px solid var(--omni-line); border-radius: var(--omni-radius-sm); }
.omni-pb p { margin: 8px 0 0; font-size: 12.5px; }
.omni-banner ul { margin: 4px 0 0; padding-left: 18px; }
</style>
