<template>
    <div v-if="fields.length" class="ot-formgrid omni-schema">
        <div v-for="f in fields" :key="f.name" class="ot-field" :class="{ wide: f.kind === 'json' || f.kind === 'text' }">
            <label :for="`${uid}-${f.name}`">{{ f.name }}<span v-if="f.required" aria-label="required"> *</span></label>
            <select v-if="f.kind === 'enum'" :id="`${uid}-${f.name}`" class="ot-select" :value="modelValue[f.name] ?? ''" @change="set(f, ($event.target as HTMLSelectElement).value)">
                <option value="">{{ f.required ? 'Choose…' : '(not set)' }}</option>
                <option v-for="o in f.options" :key="String(o)" :value="String(o)">{{ o }}</option>
            </select>
            <label v-else-if="f.kind === 'boolean'" class="ot-check">
                <input :id="`${uid}-${f.name}`" type="checkbox" :checked="modelValue[f.name] === true" @change="set(f, ($event.target as HTMLInputElement).checked)" /> yes
            </label>
            <input v-else-if="f.kind === 'number'" :id="`${uid}-${f.name}`" class="ot-input mono" type="number" :step="f.integer ? 1 : 'any'" :min="f.min" :max="f.max"
                   :value="modelValue[f.name] ?? ''" @input="set(f, ($event.target as HTMLInputElement).value)" />
            <textarea v-else-if="f.kind === 'json'" :id="`${uid}-${f.name}`" class="ot-input mono" rows="3" spellcheck="false" placeholder="JSON"
                      :value="jsonText[f.name] ?? stringify(modelValue[f.name])" @input="set(f, ($event.target as HTMLTextAreaElement).value)"></textarea>
            <input v-else :id="`${uid}-${f.name}`" class="ot-input" type="text" :maxlength="f.maxLength" :value="modelValue[f.name] ?? ''"
                   @input="set(f, ($event.target as HTMLInputElement).value)" />
            <span v-if="f.description || jsonProblem[f.name]" class="help" :class="{ neg: !!jsonProblem[f.name] }">{{ jsonProblem[f.name] ?? f.description }}</span>
        </div>
    </div>
    <div v-else-if="freeform" class="ot-field">
        <label :for="`${uid}-raw`">Parameters (JSON)</label>
        <textarea :id="`${uid}-raw`" class="ot-input mono" rows="5" spellcheck="false" :value="rawText" @input="setRaw(($event.target as HTMLTextAreaElement).value)"></textarea>
        <span v-if="rawProblem" class="help neg">{{ rawProblem }}</span>
    </div>
    <p v-else class="omni-muted">This tactic takes no parameters.</p>
</template>

<script setup lang="ts">
import { computed, reactive, ref, useId } from 'vue';
import { omniParse } from '~/scripts/omniscience/api';

/**
 * A form generated from a tactic's JSON Schema, so a new tactic is runnable from the UI the day
 * it ships. Flat object schemas get one control per property; anything richer falls back to a
 * JSON box. Emits only values that were actually set — an untouched optional field is absent,
 * not an empty string.
 */
const props = defineProps<{ schemaJson: string; modelValue: Record<string, unknown> }>();
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, unknown>]; valid: [ok: boolean] }>();

const uid = useId();

interface Field {
    name: string; kind: 'enum' | 'boolean' | 'number' | 'string' | 'text' | 'json';
    required: boolean; description?: string; options?: unknown[]; integer?: boolean; min?: number; max?: number; maxLength?: number;
}

const schema = computed(() => omniParse<any>(props.schemaJson));
const fields = computed<Field[]>(() => {
    const s = schema.value;
    if (!s || s.type !== 'object' || !s.properties || typeof s.properties !== 'object') return [];
    const required = new Set<string>(Array.isArray(s.required) ? s.required : []);
    return Object.entries<any>(s.properties).map(([name, p]) => {
        const base = { name, required: required.has(name), description: typeof p?.description === 'string' ? p.description : undefined };
        if (Array.isArray(p?.enum)) return { ...base, kind: 'enum' as const, options: p.enum };
        if (p?.type === 'boolean') return { ...base, kind: 'boolean' as const };
        if (p?.type === 'integer' || p?.type === 'number')
            return { ...base, kind: 'number' as const, integer: p.type === 'integer', min: p.minimum, max: p.maximum };
        if (p?.type === 'string') return { ...base, kind: 'string' as const, maxLength: p.maxLength };
        return { ...base, kind: 'json' as const };
    });
});
/** A schema exists but is not a flat object: edit the parameters as JSON. */
const freeform = computed(() => !!schema.value && !fields.value.length && schema.value.type !== 'null'
    && !(schema.value.type === 'object' && schema.value.properties && !Object.keys(schema.value.properties).length));

const jsonText = reactive<Record<string, string | undefined>>({});
const jsonProblem = reactive<Record<string, string | undefined>>({});
const rawText = ref(Object.keys(props.modelValue).length ? JSON.stringify(props.modelValue, null, 2) : '');
const rawProblem = ref<string | null>(null);

const stringify = (value: unknown) => (value === undefined ? '' : JSON.stringify(value, null, 2));

function publish(next: Record<string, unknown>) {
    emit('update:modelValue', next);
    const missing = fields.value.some(f => f.required && (next[f.name] === undefined || next[f.name] === ''));
    emit('valid', !missing && !Object.values(jsonProblem).some(Boolean) && !rawProblem.value);
}

function set(f: Field, raw: string | boolean) {
    const next = { ...props.modelValue };
    if (f.kind === 'boolean') {
        next[f.name] = raw === true;
    } else if (raw === '') {
        delete next[f.name];
        jsonText[f.name] = undefined;
        jsonProblem[f.name] = undefined;
    } else if (f.kind === 'number') {
        const n = Number(raw);
        if (Number.isFinite(n)) next[f.name] = n; else delete next[f.name];
    } else if (f.kind === 'json') {
        jsonText[f.name] = String(raw);
        try {
            next[f.name] = JSON.parse(String(raw));
            jsonProblem[f.name] = undefined;
        } catch {
            jsonProblem[f.name] = 'Not valid JSON yet.';
        }
    } else {
        next[f.name] = raw;
    }
    publish(next);
}

function setRaw(text: string) {
    rawText.value = text;
    if (!text.trim()) { rawProblem.value = null; publish({}); return; }
    try {
        const value = JSON.parse(text);
        if (!value || typeof value !== 'object' || Array.isArray(value)) { rawProblem.value = 'Parameters must be a JSON object.'; emit('valid', false); return; }
        rawProblem.value = null;
        publish(value);
    } catch {
        rawProblem.value = 'Not valid JSON yet.';
        emit('valid', false);
    }
}

// Tell the parent whether the starting values already satisfy the schema.
publish(props.modelValue);
</script>

<style scoped>
.omni-schema .wide { grid-column: 1 / -1; }
textarea.ot-input { height: auto; padding: 8px 10px; line-height: 18px; resize: vertical; }
.help.neg { color: var(--ot-negative); }
</style>
