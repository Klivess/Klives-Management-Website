<template>
    <div class="omni-selections">
        <p v-if="!accepts.length" class="omni-muted">This tactic takes no selection.</p>
        <div v-for="(sel, i) in modelValue" :key="i" class="sel">
            <div class="omni-row">
                <select class="omni-select auto" :value="sel.kind" :aria-label="`Selection ${i + 1} kind`" @change="setKind(i, ($event.target as HTMLSelectElement).value as SelectionKind)">
                    <option v-for="k in accepts" :key="k" :value="k">{{ KIND_LABEL[k] }}</option>
                </select>
                <span class="omni-muted">{{ describe(sel) }}</span>
                <span v-if="sel.origin" class="omni-chip info" :title="sel.origin">from {{ sel.origin }}</span>
                <span v-if="sel.sampled" class="omni-chip warn" :title="`Sampled down from ${sel.totalBeforeSampling ?? 'more'} items`">sampled</span>
                <span style="flex:1"></span>
                <button class="omni-btn ghost sm" type="button" :aria-label="`Remove selection ${i + 1}`" @click="remove(i)">Remove</button>
            </div>

            <div v-if="sel.kind === 'TimeRange'" class="omni-formgrid">
                <div class="omni-field">
                    <label :for="`${uid}-${i}-from`">From ({{ zoneLabel }})</label>
                    <input :id="`${uid}-${i}-from`" class="omni-input" type="datetime-local" :value="rangeInput(i, 0)" @change="setRange(i, 0, ($event.target as HTMLInputElement).value)" />
                </div>
                <div class="omni-field">
                    <label :for="`${uid}-${i}-to`">Until, exclusive ({{ zoneLabel }})</label>
                    <input :id="`${uid}-${i}-to`" class="omni-input" type="datetime-local" :value="rangeInput(i, 1)" @change="setRange(i, 1, ($event.target as HTMLInputElement).value)" />
                </div>
            </div>
            <div v-else-if="sel.kind === 'Question'" class="omni-field">
                <label :for="`${uid}-${i}-q`">Question</label>
                <textarea :id="`${uid}-${i}-q`" class="omni-input" rows="2" :value="sel.items[0]?.label ?? ''"
                          @input="setQuestion(i, ($event.target as HTMLTextAreaElement).value)"></textarea>
            </div>
            <div v-else class="omni-field">
                <label :for="`${uid}-${i}-ids`">{{ KIND_LABEL[sel.kind] }} ids, one per line</label>
                <textarea :id="`${uid}-${i}-ids`" class="omni-input mono" rows="3" spellcheck="false" :placeholder="PLACEHOLDER[sel.kind] ?? ''"
                          :value="idText(sel)" @change="setIds(i, ($event.target as HTMLTextAreaElement).value)"></textarea>
                <span class="help">Ids are the corpus's own keys. Labels shown elsewhere are kept when an id is unchanged.</span>
            </div>
        </div>

        <div v-if="accepts.length && modelValue.length < max" class="omni-row">
            <button class="omni-btn sm" type="button" @click="add">Add a selection</button>
            <template v-if="accepts.includes('Person') && cohorts.length">
                <select v-model="cohortPick" class="omni-select auto" aria-label="Add a saved cohort">
                    <option value="">Add a saved cohort…</option>
                    <option v-for="c in cohorts" :key="c.cohortId" :value="c.cohortId">{{ c.name }} ({{ c.members }})</option>
                </select>
            </template>
            <span class="omni-muted">{{ needText }}</span>
        </div>
        <p v-if="problem" class="neg" role="alert">{{ problem }}</p>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from 'vue';
import { omniGet, toOmniError } from '~/scripts/omniscience/api';
import type { CohortDto, CohortSelectionDto, Selection, SelectionKind } from '~/scripts/omniscience/contracts';
import { omniMsToZonedInput, omniZonedToMs } from '~/scripts/omniscience/format';
import { useOmniTime } from '~/composables/useOmniscienceV3';

/**
 * The input of a tactic: one or more typed sets. Sets arrive from elsewhere (another run's
 * output, a saved cohort, an Explore drill) or are typed in by id.
 */
const props = withDefaults(defineProps<{
    modelValue: Selection[];
    accepts: SelectionKind[];
    min?: number;
    max?: number;
}>(), { min: 0, max: 8 });
const emit = defineEmits<{ 'update:modelValue': [value: Selection[]] }>();

const uid = useId();
const { zone, lens } = useOmniTime();
const zoneLabel = computed(() => (lens.value === 'Utc' ? 'UTC' : zone.value));

const KIND_LABEL: Record<SelectionKind, string> = {
    Person: 'People', Message: 'Messages', Conversation: 'Conversations', Guild: 'Servers', Attachment: 'Attachments', Face: 'Faces',
    FaceCluster: 'Face clusters', Assertion: 'Facts', TimeRange: 'Time range', ExploreDrill: 'Explore drill', Dataset: 'Dataset', Question: 'Question',
};
const PLACEHOLDER: Partial<Record<SelectionKind, string>> = {
    Message: 'discord:1234567890', Conversation: 'discord:1234567890', Guild: 'discord:1234567890', ExploreDrill: 'drill token', Dataset: 'dataset id',
};

const cohorts = ref<CohortDto[]>([]);
const cohortPick = ref('');
const problem = ref<string | null>(null);

const needText = computed(() => {
    if (props.min === props.max) return `Needs exactly ${props.min}.`;
    return props.min > 0 ? `Needs ${props.min} to ${props.max}.` : `Up to ${props.max}.`;
});

function describe(sel: Selection): string {
    if (sel.kind === 'TimeRange' || sel.kind === 'Question') return '';
    return `${sel.items.length} item${sel.items.length === 1 ? '' : 's'}`;
}

function update(i: number, next: Selection) {
    const copy = props.modelValue.slice();
    copy[i] = next;
    emit('update:modelValue', copy);
}

function add() {
    const kind = props.accepts[0];
    if (kind) emit('update:modelValue', [...props.modelValue, { kind, items: [], sampled: false }]);
}
function remove(i: number) { draftRange.value = {}; emit('update:modelValue', props.modelValue.filter((_, n) => n !== i)); }
function setKind(i: number, kind: SelectionKind) { update(i, { kind, items: [], sampled: false }); }

const idText = (sel: Selection) => sel.items.map(item => item.id).join('\n');
function setIds(i: number, text: string) {
    const current = props.modelValue[i]!;
    const known = new Map(current.items.map(item => [item.id, item]));
    const ids = [...new Set(text.split(/\r?\n/).map(line => line.trim()).filter(Boolean))];
    // Editing the ids by hand makes this a new set: it is no longer "the output of run X", nor a sample.
    update(i, { kind: current.kind, items: ids.map(id => known.get(id) ?? { id }), sampled: false });
}

function setQuestion(i: number, text: string) {
    update(i, { kind: 'Question', items: text.trim() ? [{ id: 'question', label: text }] : [], sampled: false });
}

/** Half-entered ranges, by row, until both ends are set (the wire format needs both). */
const draftRange = ref<Record<number, [number | null, number | null]>>({});

function rangeParts(i: number): [number | null, number | null] {
    const m = /^(-?\d+)\.\.(-?\d+)$/.exec(props.modelValue[i]?.items[0]?.id ?? '');
    if (m) return [Number(m[1]), Number(m[2])];
    const draft = draftRange.value[i];
    return draft ? [draft[0], draft[1]] : [null, null];
}
const rangeInput = (i: number, end: 0 | 1) => omniMsToZonedInput(rangeParts(i)[end], zone.value);

function setRange(i: number, end: 0 | 1, local: string) {
    const parts = rangeParts(i);
    parts[end] = local ? omniZonedToMs(local, zone.value) : null;
    const [from, to] = parts;
    problem.value = from !== null && to !== null && from >= to ? 'A time range must end after it starts.' : null;
    draftRange.value = { ...draftRange.value, [i]: parts };
    update(i, { kind: 'TimeRange', items: from !== null && to !== null && from < to ? [{ id: `${from}..${to}` }] : [], sampled: false });
}

watch(cohortPick, async id => {
    if (!id) return;
    cohortPick.value = '';
    try {
        const loaded = await omniGet<CohortSelectionDto>('cohorts/get', { id });
        emit('update:modelValue', [...props.modelValue, { ...loaded.selection, origin: loaded.selection.origin ?? `cohort ${loaded.cohort.name}` }]);
        problem.value = null;
    } catch (caught) {
        problem.value = toOmniError(caught).message;
    }
});

onMounted(async () => {
    if (!props.accepts.includes('Person')) return;
    try {
        cohorts.value = await omniGet<CohortDto[]>('cohorts');
    } catch {
        // Without the people permission there are no cohorts to offer; ids can still be typed.
        cohorts.value = [];
    }
});
</script>

<style scoped>
.omni-selections { display: flex; flex-direction: column; gap: 12px; }
.sel { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--omni-line); border-radius: var(--omni-radius-sm); }
textarea.omni-input { height: auto; padding: 8px 10px; line-height: 18px; resize: vertical; width: 100%; }
p { margin: 0; font-size: 12.5px; }
</style>
