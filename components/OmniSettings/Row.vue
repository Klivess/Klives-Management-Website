<template>
  <div
    class="ost-row"
    :data-key="setting.key"
    :data-testid="`setting-${setting.name}`"
    :data-dirty="dirty || undefined"
    :data-saving="state?.saving || undefined"
    :data-error="!!state?.error || undefined"
    :data-awaiting="setting.awaiting || undefined"
    :data-flash="flash || undefined"
    @click="onRowClick"
  >
    <!-- what it is -->
    <div class="ost-row__id">
      <div class="ost-row__label" :title="setting.label">
        <span v-for="(part, index) in labelParts" :key="index" :class="{ 'ost-hit': part.hit }">{{ part.text }}</span>
      </div>
      <div class="ost-row__sub">
        <button class="ost-row__key" type="button" tabindex="-1" :title="`${setting.name}: click to copy`" @click.stop="emit('copy')">
          <span v-for="(part, index) in nameParts" :key="index" :class="{ 'ost-hit': part.hit }">{{ part.text }}</span>
        </button>
        <span v-if="showOwner" class="ost-row__owner">{{ setting.owner }}<template v-if="setting.ownerId !== '0'"> · id {{ setting.ownerId }}</template></span>
      </div>
    </div>

    <!-- its value -->
    <div class="ost-row__edit">
      <template v-if="setting.sensitive">
        <span class="ost-secret" :data-tone="setting.hasValue ? 'ok' : setting.awaiting ? 'crit' : 'warn'">
          <AdminIcon name="lock" />{{ setting.hasValue ? 'Saved' : 'Not set' }}
        </span>
        <input
          ref="field"
          data-editor
          class="ost-input ost-input--secret"
          type="password"
          autocomplete="new-password"
          autocapitalize="none"
          :spellcheck="false"
          :aria-label="`Replacement value for ${setting.name}`"
          :placeholder="secretPlaceholder(setting)"
          :value="secret ?? ''"
          :disabled="!canWrite"
          :readonly="state?.saving"
          @input="emit('secret', ($event.target as HTMLInputElement).value)"
          @keydown="onFieldKey"
        />
      </template>

      <button
        v-else-if="setting.type === TYPE.Bool"
        ref="field"
        data-editor
        class="ost-switch"
        type="button"
        role="switch"
        :aria-checked="on"
        :aria-label="setting.name"
        :disabled="!canWrite"
        @click.stop="emit('toggle')"
        @keydown="onNavKey"
      >
        <span class="ost-switch__track"><span class="ost-switch__thumb"></span></span>
        <span class="ost-switch__word">{{ on ? 'On' : 'Off' }}</span>
      </button>

      <div v-else-if="setting.type === TYPE.Dropdown && segmented" class="adm-seg ost-seg" role="radiogroup" :aria-label="setting.name">
        <button
          v-for="(option, index) in setting.options"
          :key="option"
          :ref="index === 0 ? 'field' : undefined"
          :data-editor="index === 0 || undefined"
          class="adm-seg__opt"
          type="button"
          role="radio"
          :aria-checked="isChosen(option)"
          :aria-pressed="isChosen(option)"
          :disabled="!canWrite"
          @click.stop="emit('choose', option)"
          @keydown="onNavKey"
        >{{ option }}</button>
      </div>

      <select
        v-else-if="setting.type === TYPE.Dropdown"
        ref="field"
        data-editor
        class="adm-input ost-select"
        :aria-label="setting.name"
        :value="chosen"
        :disabled="!canWrite"
        @change="emit('choose', ($event.target as HTMLSelectElement).value)"
        @keydown="onSelectKey"
      >
        <option v-for="option in setting.options" :key="option" :value="option">{{ option }}</option>
      </select>

      <div v-else-if="setting.type === TYPE.List" class="ost-chips" :data-invalid="!!state?.error || undefined">
        <span v-for="(entry, index) in entries" :key="`${index}:${entry}`" class="ost-chip">
          <span class="ost-chip__text">{{ entry }}</span>
          <button v-if="canWrite" class="ost-chip__x" type="button" tabindex="-1" :aria-label="`Remove ${entry}`" @click.stop="removeEntry(index)"><AdminIcon name="x" /></button>
        </span>
        <input
          v-if="canWrite"
          ref="field"
          v-model="newEntry"
          data-editor
          class="ost-chips__add"
          type="text"
          :spellcheck="false"
          :placeholder="dirty ? 'Enter to save' : entries.length ? 'Add…' : 'Add an entry…'"
          :aria-label="`Add an entry to ${setting.name}`"
          :readonly="state?.saving"
          @keydown="onChipKey"
        />
        <span v-else-if="!entries.length" class="ost-dim">empty</span>
      </div>

      <button
        v-else-if="longText"
        ref="field"
        data-editor
        class="ost-longtext"
        type="button"
        :title="canWrite ? 'Open to edit' : 'Open to read'"
        @click.stop="emit('long-text')"
        @keydown="onNavKey"
      >
        <span class="ost-longtext__preview">{{ preview }}</span>
        <span class="ost-longtext__meta">{{ fmtInt(text.length) }} chars</span>
      </button>

      <div v-else class="ost-field" :data-invalid="!!state?.error || undefined">
        <input
          ref="field"
          data-editor
          class="ost-input"
          :class="{ 'ost-input--num': isInt, 'ost-input--mono': technical, 'ost-input--unit': !!setting.unit }"
          type="text"
          :inputmode="isInt ? 'numeric' : 'text'"
          :aria-label="setting.name"
          :value="text"
          :placeholder="isInt ? '' : 'empty'"
          :readonly="!canWrite || state?.saving"
          :spellcheck="false"
          autocomplete="off"
          @input="emit('draft', ($event.target as HTMLInputElement).value)"
          @keydown="onFieldKey"
        />
        <span v-if="setting.unit" class="ost-field__unit">{{ setting.unit }}</span>
      </div>

      <span v-if="hint" class="ost-hint">{{ hint }}</span>

      <span v-if="dirty || secretReady" class="ost-row__commit">
        <button class="adm-iconbtn ost-iconbtn--save" type="button" title="Save (Enter)" aria-label="Save" data-testid="row-save" @click.stop="emit('commit')"><AdminIcon name="check" /></button>
        <button class="adm-iconbtn" type="button" title="Discard (Esc)" aria-label="Discard change" @click.stop="emit('revert')"><AdminIcon name="x" /></button>
      </span>
    </div>

    <!-- what is known about it -->
    <div class="ost-row__meta" :title="metaTitle">
      <span v-if="state?.saving" class="ost-meta" data-tone="info"><span class="ost-spinner"></span>Saving</span>
      <span v-else-if="state?.error" class="ost-meta ost-meta--error" data-tone="crit" role="alert">{{ state.error }}</span>
      <span v-else-if="state?.conflict" class="ost-meta" data-tone="warn">Changed elsewhere: now {{ state.conflict }}</span>
      <template v-else>
        <span v-if="ticked" class="ost-meta ost-meta--tick" data-tone="ok"><AdminIcon name="check" />Saved</span>
        <button
          v-if="custom"
          class="ost-custom"
          type="button"
          tabindex="-1"
          :disabled="!canWrite"
          :title="canWrite ? `The code's default is ${defaultShort}. Click to go back to it.` : `The code's default is ${defaultShort}.`"
          :data-testid="`reset-${setting.name}`"
          @click.stop="emit('reset')"
        ><AdminIcon name="undo" />default {{ defaultShort }}</button>
        <!-- No chip means the stored value is the code's default (or the default is not known yet: see the tooltip). -->
        <span class="ost-meta" :data-tone="metaTone">{{ metaText }}</span>
      </template>
    </div>

    <div class="ost-row__acts">
      <button class="adm-iconbtn" type="button" tabindex="-1" :title="`Copy ${setting.name}`" aria-label="Copy name" @click.stop="emit('copy')"><AdminIcon name="copy" /></button>
      <button v-if="canWrite" class="adm-iconbtn adm-iconbtn--danger" type="button" tabindex="-1" title="Delete…" aria-label="Delete setting" :data-testid="`delete-${setting.name}`" @click.stop="emit('remove')"><AdminIcon name="trash" /></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { fmtInt } from '~/scripts/adminConsole';
import {
  TYPE, changedLabel, highlightParts, isLongText, isOn, parseList, readLabel, sameValue, secretPlaceholder, serializeList,
  shortValue, unitHint, type BoardMeta, type Setting, type ViewId,
} from '~/scripts/settingsConsole';
import type { RowState } from '~/composables/useSettingsConsole';

/*
 * One setting on one line: its name in words and as written, an editor that fits its type, and what is
 * known about it (the code's default, the last read, the last change). Arrow keys move between rows from
 * any editor, Enter saves what was typed and Esc puts it back.
 */
const props = withDefaults(defineProps<{
  setting: Setting;
  draft?: string;
  secret?: string;
  state?: RowState;
  canWrite: boolean;
  meta: BoardMeta;
  now: number;
  words?: string[];
  showOwner?: boolean;
  view?: ViewId;
  flash?: boolean;
}>(), { draft: undefined, secret: undefined, state: undefined, words: () => [], showOwner: false, view: 'all', flash: false });

const emit = defineEmits<{
  draft: [text: string];
  secret: [text: string];
  commit: [];
  revert: [];
  toggle: [];
  choose: [option: string];
  reset: [];
  remove: [];
  copy: [];
  'long-text': [];
  nav: [direction: 1 | -1];
}>();

const field = ref<HTMLElement | HTMLElement[] | null>(null);
const newEntry = ref('');

const isInt = computed(() => props.setting.type === TYPE.Int);
const text = computed(() => props.draft ?? props.setting.value);
const on = computed(() => isOn(props.setting.value));
const dirty = computed(() => props.draft !== undefined && !sameValue(props.setting.type, props.draft, props.setting.value));
const secretReady = computed(() => !!props.secret && props.secret !== '********');
const longText = computed(() => isLongText(props.setting));
const entries = computed(() => parseList(text.value));
const hint = computed(() => (isInt.value ? unitHint(text.value, props.setting.unit) : ''));
const chosen = computed(() => props.setting.options.find(option => sameValue(TYPE.Dropdown, option, props.setting.value)) ?? props.setting.value);
const isChosen = (option: string) => sameValue(TYPE.Dropdown, option, props.setting.value);
/** Up to four short choices fit as a segmented control; anything more is a menu. */
const segmented = computed(() => props.setting.options.length <= 4 && props.setting.options.join('').length <= 34);
/** Addresses, paths and model ids read better in a fixed-width face. */
const technical = computed(() => !isInt.value && (/(Url|URL|Uri|Path|Link|ModelID|ModelId|Model|Endpoint|Host|Id|ID)$/.test(props.setting.name)
  || /^(https?:\/\/|[A-Za-z]:\\|\/|[\w.-]+\/[\w.:-]+$)/.test(props.setting.value)));
const preview = computed(() => text.value.replace(/\s+/g, ' ').trim() || 'empty');

const labelParts = computed(() => highlightParts(props.setting.label, props.words));
const nameParts = computed(() => highlightParts(props.setting.name, props.words));

const custom = computed(() => props.setting.matchesDefault === false && props.setting.defaultValue != null);
const defaultShort = computed(() => shortValue(props.setting.type, props.setting.defaultValue, props.setting.unit, 18));
const read = computed(() => readLabel(props.setting, props.meta, props.now));
const changed = computed(() => changedLabel(props.setting, props.now));
const metaText = computed(() => (props.view === 'recent' && changed.value ? `changed ${changed.value}` : read.value.text));
const metaTone = computed(() => (props.view !== 'recent' && read.value.tone === 'warn' ? 'warn' : undefined));
const metaTitle = computed(() => [
  read.value.text[0].toUpperCase() + read.value.text.slice(1),
  changed.value ? `Changed ${changed.value}` : '',
  props.setting.defaultValue != null && !props.setting.sensitive ? `Code default: ${shortValue(props.setting.type, props.setting.defaultValue, props.setting.unit, 60)}` : '',
  `${props.setting.owner}${props.setting.ownerId !== '0' ? ` · id ${props.setting.ownerId}` : ''}`,
].filter(Boolean).join('\n'));

// A short tick after a save, then the usual line again.
const ticked = ref(false);
let tickTimer: number | undefined;
watch(() => props.state?.savedAt, at => {
  if (!at) return;
  ticked.value = true;
  window.clearTimeout(tickTimer);
  tickTimer = window.setTimeout(() => { ticked.value = false; }, 2_200);
});
onBeforeUnmount(() => window.clearTimeout(tickTimer));

// ── lists ──

function addEntry() {
  const entry = newEntry.value.trim();
  if (!entry) return;
  emit('draft', serializeList([...entries.value, entry]));
  newEntry.value = '';
}

function removeEntry(index: number) {
  emit('draft', serializeList(entries.value.filter((_, at) => at !== index)));
}

function onChipKey(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    if (newEntry.value.trim()) addEntry();
    else if (dirty.value) emit('commit');
  } else if (event.key === 'Escape') {
    event.preventDefault();
    newEntry.value = '';
    emit('revert');
  } else if (event.key === 'Backspace' && !newEntry.value && entries.value.length) {
    removeEntry(entries.value.length - 1);
  } else onNavKey(event);
}

// ── keys ──

function onNavKey(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'ArrowDown') { event.preventDefault(); emit('nav', 1); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); emit('nav', -1); }
}

function onFieldKey(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    emit('commit');
  } else if (event.key === 'Escape') {
    if (dirty.value || secretReady.value || props.state?.error) {
      event.preventDefault();
      event.stopPropagation();
      emit('revert');
    }
  } else onNavKey(event);
}

/** A closed menu changes its value on arrow keys, which here would save: arrows move between rows instead. */
function onSelectKey(event: KeyboardEvent) {
  if (event.altKey) return;
  onNavKey(event);
}

function onRowClick(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (target.closest('button, input, select, a, textarea')) return;
  focus();
}

function focus() {
  const element = Array.isArray(field.value) ? field.value[0] : field.value;
  element?.focus();
  if (element instanceof HTMLInputElement && element.type !== 'password') element.select();
}

defineExpose({ focus });
</script>
