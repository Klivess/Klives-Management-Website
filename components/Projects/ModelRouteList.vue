<template>
  <div class="route-list">
    <div class="route-heading">
      <div>
        <span class="route-label">{{ label }}</span>
        <span class="route-hint">Preferred first; failures advance downward.</span>
      </div>
      <button type="button" class="route-add" @click="add">+ Add route</button>
    </div>
    <div v-for="(route, index) in modelValue" :key="index" class="route-row">
      <span class="route-rank">{{ index === 0 ? 'Primary' : `Fallback ${index}` }}</span>
      <input
        :value="route"
        class="route-input"
        :class="{ invalid: !route.trim() }"
        :placeholder="index === 0 ? placeholder : 'provider/model'"
        :aria-label="`${label} ${index === 0 ? 'primary' : `fallback ${index}`}`"
        @input="onInput(index, $event)"
      />
      <div class="route-buttons">
        <button type="button" title="Move up" :disabled="index === 0" @click="move(index, -1)">↑</button>
        <button type="button" title="Move down" :disabled="index === modelValue.length - 1" @click="move(index, 1)">↓</button>
        <button type="button" title="Remove route" :disabled="modelValue.length === 1" @click="remove(index)">×</button>
      </div>
    </div>

    <p v-if="parametersNote" class="param-note">{{ parametersNote }}</p>

    <!-- Parameters this route's models advertise as settable, fetched live per model set. -->
    <div v-if="showParameters" class="param-block">
      <div class="param-heading">
        <span class="param-title">
          Parameters
          <span v-if="configured.length" class="param-count">{{ configured.length }} set</span>
        </span>
        <div class="param-picker">
          <span v-if="loading" class="param-status">checking model…</span>
          <span v-else-if="!fromCatalog" class="param-status" :title="catalogNote">unverified</span>
          <select
            class="param-select"
            :disabled="loading || !addable.length"
            :aria-label="`Add a parameter to the ${label} route`"
            @change="onAdd"
          >
            <option value="">{{ addable.length ? '+ Add parameter' : 'All parameters set' }}</option>
            <optgroup v-if="fullySupported.length" label="Supported by every route model">
              <option v-for="p in fullySupported" :key="p.name" :value="p.name">{{ p.label }}</option>
            </optgroup>
            <optgroup v-if="partiallySupported.length" label="Supported by some route models">
              <option v-for="p in partiallySupported" :key="p.name" :value="p.name">{{ p.label }}</option>
            </optgroup>
          </select>
        </div>
      </div>

      <p v-if="!configured.length" class="param-empty">
        Using each model's own defaults. Add one to pin it for this route only.
      </p>

      <div v-for="p in configured" :key="p.name" class="param-row">
        <div class="param-label">
          <span class="param-name" :title="p.description">{{ p.label }}</span>
          <span class="param-hint">
            default: {{ p.defaultHint }}<template v-if="p.unsupported"> · <span class="param-warn">not offered by {{ p.unsupportedBy }}</span></template>
          </span>
        </div>
        <div class="param-control">
          <details v-if="p.kind === 'multi-enum'" class="param-multi">
            <summary :aria-label="`${label} ${p.label}`">{{ multiEnumSummary(p.name) }}</summary>
            <div class="param-multi-menu">
              <label v-for="o in p.options || []" :key="optionValue(o)" class="param-multi-option">
                <input
                  type="checkbox"
                  :checked="selectedValues(p.name).includes(optionValue(o))"
                  @change="toggleMultiParam(p.name, optionValue(o), ($event.target as HTMLInputElement).checked)"
                />
                <span>{{ optionLabel(o) }}</span>
                <code v-if="optionLabel(o) !== optionValue(o)">{{ optionValue(o) }}</code>
              </label>
              <span v-if="!p.options?.length" class="param-multi-empty">No providers found for this model.</span>
            </div>
          </details>
          <select
            v-else-if="p.kind === 'enum'"
            class="param-value param-enum"
            :value="String(parameters[p.name])"
            :aria-label="`${label} ${p.label}`"
            @change="setParam(p.name, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="o in p.options || []" :key="optionValue(o)" :value="optionValue(o)">{{ optionLabel(o) }}</option>
          </select>
          <template v-else>
            <input
              type="range"
              class="param-slider"
              :min="p.min ?? 0"
              :max="p.max ?? 1"
              :step="p.step ?? 0.01"
              :value="Number(parameters[p.name])"
              :aria-label="`${label} ${p.label}`"
              @input="setParam(p.name, Number(($event.target as HTMLInputElement).value))"
            />
            <input
              type="number"
              class="param-value"
              :min="p.min ?? undefined"
              :max="p.max ?? undefined"
              :step="p.step ?? 'any'"
              :value="Number(parameters[p.name])"
              :aria-label="`${label} ${p.label} value`"
              @change="setParam(p.name, Number(($event.target as HTMLInputElement).value))"
            />
          </template>
          <button type="button" class="param-remove" :title="`Remove ${p.label} (use the model default)`" @click="removeParam(p.name)">×</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

type ParameterValue = number | string | string[];
type ParameterOption = string | { value: string; label: string };
type ParameterDefinition = {
  name: string;
  label: string;
  kind: 'number' | 'integer' | 'enum' | 'multi-enum';
  min: number | null;
  max: number | null;
  step: number | null;
  description: string;
  defaultHint: string;
  openRouterOnly: boolean;
  options: ParameterOption[] | null;
  supportedBy: string[];
  supportedByAll: boolean;
};

const props = withDefaults(defineProps<{
  modelValue: string[];
  label: string;
  placeholder: string;
  parameters?: Record<string, ParameterValue>;
  // A route whose models are folded into another route's single request has no parameters of its
  // own; it shows `parametersNote` instead of a panel that could never take effect.
  showParameters?: boolean;
  parametersNote?: string;
}>(), { parameters: () => ({}), showParameters: true, parametersNote: '' });

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
  'update:parameters': [value: Record<string, ParameterValue>];
}>();

// ── route models ──
function set(index: number, value: string) {
  const next = [...props.modelValue];
  next[index] = value;
  emit('update:modelValue', next);
}
function onInput(index: number, event: Event) { set(index, (event.target as HTMLInputElement).value); }
function add() { emit('update:modelValue', [...props.modelValue, '']); }
function remove(index: number) {
  if (props.modelValue.length <= 1) return;
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index));
}
function move(index: number, direction: number) {
  const target = index + direction;
  if (target < 0 || target >= props.modelValue.length) return;
  const next = [...props.modelValue];
  [next[index], next[target]] = [next[target], next[index]];
  emit('update:modelValue', next);
}

// ── parameter discovery ──
// One in-flight request per distinct model set, shared across every route list on the page: the
// settings page renders nine of them and their models overlap heavily.
const catalogCache = new Map<string, Promise<{ parameters: ParameterDefinition[]; fromCatalog: boolean }>>();

const definitions = ref<ParameterDefinition[]>([]);
const fromCatalog = ref(true);
const loading = ref(false);
let debounce: ReturnType<typeof setTimeout> | null = null;

const modelKey = computed(() => props.modelValue
  .map(m => (m ?? '').trim()).filter(Boolean).join(','));

const catalogNote = computed(() => fromCatalog.value
  ? ''
  : 'These models are not in the live OpenRouter catalog, so every parameter is offered. '
    + 'A parameter a model does not implement is ignored rather than rejected.');

async function fetchDefinitions(models: string) {
  if (!models) { definitions.value = []; fromCatalog.value = true; return; }
  loading.value = true;
  try {
    let pending = catalogCache.get(models);
    if (!pending) {
      pending = RequestGETFromKliveAPI(`/projects/models/parameters?models=${encodeURIComponent(models)}`, false, false)
        .then(async res => {
          if (!res.ok) throw new Error(String(res.status));
          const body = await res.json();
          return { parameters: (body.parameters ?? []) as ParameterDefinition[], fromCatalog: !!body.fromCatalog };
        });
      catalogCache.set(models, pending);
      // A failed lookup must not be cached, or a transient blip empties the dropdown until reload.
      pending.catch(() => catalogCache.delete(models));
    }
    const result = await pending;
    if (modelKey.value !== models) return; // the route changed while this was in flight
    definitions.value = result.parameters;
    fromCatalog.value = result.fromCatalog;
  } catch {
    if (modelKey.value === models) fromCatalog.value = false;
  } finally {
    if (modelKey.value === models) loading.value = false;
  }
}

watch(modelKey, key => {
  if (!props.showParameters) return;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => fetchDefinitions(key), 400);
});
onMounted(() => { if (props.showParameters) fetchDefinitions(modelKey.value); });
onBeforeUnmount(() => { if (debounce) clearTimeout(debounce); });

// ── configured values ──
// A saved parameter is always rendered, even if the catalog no longer offers it, so Klives can see
// and clear it instead of it silently persisting out of sight.
const configured = computed(() => Object.keys(props.parameters ?? {}).map(name => {
  const definition = definitions.value.find(d => d.name === name);
  const unsupportedBy = definition && !definition.supportedByAll
    ? props.modelValue.map(m => m.trim()).filter(m => m && !definition.supportedBy.includes(m))
    : [];
  const options = [...(definition?.options ?? [])];
  const optionValues = new Set(options.map(optionValue));
  // Keep a saved provider visible even if the endpoint catalog changed, so it can be unchecked
  // instead of silently persisting outside the dropdown.
  for (const selected of selectedValues(name)) {
    if (!optionValues.has(selected)) options.push(selected);
  }
  return {
    name,
    label: definition?.label ?? name,
    kind: definition?.kind ?? 'number',
    min: definition?.min ?? null,
    max: definition?.max ?? null,
    step: definition?.step ?? null,
    description: definition?.description ?? '',
    defaultHint: definition?.defaultHint ?? 'the model default',
    options,
    unsupported: unsupportedBy.length > 0,
    unsupportedBy: unsupportedBy.join(', '),
  };
}).sort((a, b) =>
  definitions.value.findIndex(d => d.name === a.name) - definitions.value.findIndex(d => d.name === b.name)));

const addable = computed(() => definitions.value.filter(d =>
  !(d.name in (props.parameters ?? {}))
  && (d.kind !== 'multi-enum' || !!d.options?.length)));
const fullySupported = computed(() => addable.value.filter(d => d.supportedByAll));
const partiallySupported = computed(() => addable.value.filter(d => !d.supportedByAll));

function emitParameters(next: Record<string, ParameterValue>) { emit('update:parameters', next); }

function onAdd(event: Event) {
  const select = event.target as HTMLSelectElement;
  const name = select.value;
  select.value = '';
  const definition = definitions.value.find(d => d.name === name);
  if (!definition) return;
  emitParameters({ ...(props.parameters ?? {}), [name]: startingValue(definition) });
}

// A new parameter starts at its neutral/no-op value where one exists, so adding it never silently
// changes behaviour before Klives has moved the control.
function startingValue(d: ParameterDefinition): ParameterValue {
  // 'medium' matches the global ThinkingType default, so pinning reasoning starts where the route
  // already was rather than jumping the effort up or down on the first click.
  if (d.kind === 'multi-enum') return [];
  if (d.kind === 'enum') {
    const options = d.options ?? [];
    return optionValue(options.find(o => optionValue(o) === 'medium') ?? options[0] ?? '');
  }
  const neutral: Record<string, number> = {
    temperature: 1, top_p: 1, top_k: 0, frequency_penalty: 0, presence_penalty: 0,
    repetition_penalty: 1, min_p: 0, top_a: 0, seed: 0,
  };
  const value = neutral[d.name] ?? d.min ?? 0;
  return Math.min(d.max ?? value, Math.max(d.min ?? value, value));
}

function setParam(name: string, value: ParameterValue) {
  if (typeof value === 'number' && !Number.isFinite(value)) return;
  emitParameters({ ...(props.parameters ?? {}), [name]: value });
}

function optionValue(option: ParameterOption): string {
  return typeof option === 'string' ? option : option.value;
}

function optionLabel(option: ParameterOption): string {
  return typeof option === 'string' ? option : option.label;
}

function selectedValues(name: string): string[] {
  const value = props.parameters?.[name];
  return Array.isArray(value) ? value.map(String) : [];
}

function multiEnumSummary(name: string): string {
  const count = selectedValues(name).length;
  return count === 0 ? 'Select providers…' : `${count} provider${count === 1 ? '' : 's'} selected`;
}

function toggleMultiParam(name: string, option: string, checked: boolean) {
  const selected = new Set(selectedValues(name));
  if (checked) selected.add(option); else selected.delete(option);
  setParam(name, [...selected]);
}

function removeParam(name: string) {
  const next = { ...(props.parameters ?? {}) };
  delete next[name];
  emitParameters(next);
}
</script>

<style scoped>
.route-list { padding: 10px 0 12px; border-bottom: 1px solid #28282d; }
.route-list:last-child { border-bottom: none; }
.route-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 7px; }
.route-heading > div { display: flex; flex-direction: column; }
.route-label { font-size: 13px; color: #ccc; }
.route-hint { font-size: 10px; color: #666; }
.route-add { border: 1px solid #3b6334; background: #1b281a; color: #82c777; border-radius: 5px; padding: 5px 9px; cursor: pointer; font-size: 11px; }
.route-row { display: grid; grid-template-columns: 72px minmax(180px, 1fr) auto; align-items: center; gap: 8px; margin-top: 6px; }
.route-rank { color: #777; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
.route-input { width: 100%; box-sizing: border-box; background: #14141a; color: #eee; border: 1px solid #333; border-radius: 6px; padding: 8px 10px; font-size: 12px; font-family: ui-monospace, monospace; }
.route-input:focus { outline: none; border-color: #4d9e39; }
.route-input.invalid { border-color: #9a4d42; }
.route-buttons { display: flex; gap: 3px; }
.route-buttons button { width: 27px; height: 28px; border: 1px solid #35353b; border-radius: 4px; background: #222228; color: #aaa; cursor: pointer; }
.route-buttons button:disabled { opacity: .28; cursor: default; }

.param-note { margin: 8px 0 2px; font-size: 11px; color: #63636c; }
.param-block { margin: 9px 0 2px 0; padding: 8px 10px; background: #17171c; border: 1px solid #26262c; border-radius: 6px; }
.param-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.param-title { font-size: 11px; color: #9aa0a6; text-transform: uppercase; letter-spacing: .04em; }
.param-count { margin-left: 6px; color: #82c777; text-transform: none; letter-spacing: 0; }
.param-picker { display: flex; align-items: center; gap: 7px; }
.param-status { font-size: 10px; color: #6f6f78; cursor: help; }
.param-select { background: #1e1e24; color: #ccc; border: 1px solid #35353b; border-radius: 5px; padding: 4px 7px; font-size: 11px; cursor: pointer; max-width: 190px; }
.param-select:disabled { opacity: .45; cursor: default; }
.param-empty { margin: 7px 0 0; font-size: 11px; color: #63636c; }
.param-row { display: grid; grid-template-columns: minmax(120px, 1fr) minmax(200px, 1.3fr); align-items: center; gap: 10px; margin-top: 8px; }
.param-label { display: flex; flex-direction: column; min-width: 0; }
.param-name { font-size: 12px; color: #ccc; }
.param-hint { font-size: 10px; color: #63636c; }
.param-warn { color: #d8a657; }
.param-control { display: flex; align-items: center; gap: 7px; }
.param-slider { flex: 1; min-width: 60px; accent-color: #4d9e39; }
.param-value { width: 74px; box-sizing: border-box; background: #14141a; color: #eee; border: 1px solid #333; border-radius: 5px; padding: 5px 7px; font-size: 12px; font-family: ui-monospace, monospace; }
.param-value:focus { outline: none; border-color: #4d9e39; }
.param-enum { width: auto; flex: 1; font-family: inherit; cursor: pointer; }
.param-multi { position: relative; flex: 1; min-width: 180px; }
.param-multi summary { list-style: none; cursor: pointer; background: #14141a; color: #eee; border: 1px solid #333; border-radius: 5px; padding: 5px 8px; font-size: 12px; }
.param-multi summary::-webkit-details-marker { display: none; }
.param-multi summary::after { content: '▾'; float: right; color: #777; margin-left: 10px; }
.param-multi[open] summary { border-color: #4d9e39; }
.param-multi-menu { position: absolute; z-index: 20; top: calc(100% + 4px); right: 0; min-width: 250px; max-height: 240px; overflow-y: auto; padding: 6px; background: #1b1b21; border: 1px solid #3a3a42; border-radius: 6px; box-shadow: 0 8px 24px rgba(0, 0, 0, .4); }
.param-multi-option { display: grid; grid-template-columns: auto 1fr; gap: 2px 7px; align-items: center; padding: 5px 6px; border-radius: 4px; cursor: pointer; }
.param-multi-option:hover { background: #25252c; }
.param-multi-option input { grid-row: 1 / 3; accent-color: #4d9e39; }
.param-multi-option span { color: #ddd; font-size: 12px; }
.param-multi-option code { color: #71717b; font-size: 9px; }
.param-multi-empty { display: block; padding: 6px; color: #777; font-size: 11px; }
.param-remove { width: 25px; height: 26px; border: 1px solid #35353b; border-radius: 4px; background: #222228; color: #aaa; cursor: pointer; flex: none; }

@media (max-width: 620px) {
  .route-row { grid-template-columns: 1fr auto; }
  .route-rank { grid-column: 1 / -1; }
  .param-row { grid-template-columns: 1fr; gap: 4px; }
}
</style>
