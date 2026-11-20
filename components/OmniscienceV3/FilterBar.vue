<template>
    <div class="omni-filterbar omni-filterset" role="group" :aria-label="label" :data-testid="testid">
        <slot name="before" />
        <template v-for="def in shown" :key="def.key">
            <OmniscienceV3Pick v-if="isPick(def)" :model-value="pickOf(def).ids" :not="pickOf(def).not" :kind="def.kind as OmniPickKind" :label="def.label" :any="def.any"
                               :options="def.options" :load="def.load" :multiple="!def.single" :negatable="def.negatable" :scope="scopeOf(def)" :help="def.help"
                               :testid="`${testid}-${def.key}`" @update:model-value="ids => setPick(def, { ids })" @update:not="not => setPick(def, { not })" />

            <OmniscienceV3Popover v-else :open="opened === def.key" :label="def.label" :width="def.kind === 'dates' ? '300px' : '260px'" :data-testid="`${testid}-${def.key}`"
                                  @update:open="on => (opened = on ? def.key : '')">
                <template #trigger="{ toggle }">
                    <span class="omni-pill" :class="{ set: !!filters.values[def.key] }">
                        <button class="main" type="button" aria-haspopup="dialog" :aria-expanded="opened === def.key" @click="toggle">
                            <span class="k">{{ def.label }}</span>
                            <span class="v" :class="{ none: !filters.values[def.key] }">{{ summaryOf(def) }}</span>
                            <span class="caret" aria-hidden="true">▾</span>
                        </button>
                        <button v-if="filters.values[def.key]" class="x" type="button" :aria-label="`Clear ${def.label.toLowerCase()}`" :title="`Clear ${def.label.toLowerCase()}`"
                                @click="filters.set(def.key, '')">✕</button>
                    </span>
                </template>

                <div v-if="def.kind === 'dates'" class="omni-picker">
                    <ul class="options presets" role="listbox" :aria-label="`${def.label}: ranges`">
                        <li v-for="p in OMNI_DATE_PRESETS" :key="p.value" role="option" tabindex="0" :aria-selected="filters.values[def.key] === p.value"
                            :class="{ on: filters.values[def.key] === p.value }" @click="setDates(def, p.value)" @keydown.enter.prevent="setDates(def, p.value)" @keydown.space.prevent="setDates(def, p.value)">
                            <span class="tick" aria-hidden="true">{{ filters.values[def.key] === p.value ? '✓' : '' }}</span>
                            <span class="what"><span class="name">{{ p.label }}</span></span>
                        </li>
                    </ul>
                    <div class="span">
                        <label>From <input class="omni-input" type="date" :value="daysOf(def).from" :max="daysOf(def).to || undefined" @change="setDay(def, 'from', ($event.target as HTMLInputElement).value)" /></label>
                        <label>To <input class="omni-input" type="date" :value="daysOf(def).to" :min="daysOf(def).from || undefined" @change="setDay(def, 'to', ($event.target as HTMLInputElement).value)" /></label>
                    </div>
                    <p class="help">Days on {{ zone }} time. The last day is kept whole.</p>
                    <div class="foot">
                        <span class="grow"></span>
                        <button v-if="filters.values[def.key]" class="omni-btn ghost sm" type="button" @click="filters.set(def.key, '')">Clear</button>
                        <button class="omni-btn sm" type="button" @click="opened = ''">Done</button>
                    </div>
                </div>

                <div v-else-if="def.kind === 'number'" class="omni-picker">
                    <div class="span">
                        <label>At least <input class="omni-input" type="number" inputmode="numeric" min="0" :value="rangeOf(def).min ?? ''" @change="setRange(def, 'min', ($event.target as HTMLInputElement).value)" /></label>
                        <label>At most <input class="omni-input" type="number" inputmode="numeric" min="0" :value="rangeOf(def).max ?? ''" @change="setRange(def, 'max', ($event.target as HTMLInputElement).value)" /></label>
                    </div>
                    <p v-if="def.help" class="help">{{ def.help }}</p>
                    <div class="foot">
                        <span class="grow"></span>
                        <button v-if="filters.values[def.key]" class="omni-btn ghost sm" type="button" @click="filters.set(def.key, '')">Clear</button>
                        <button class="omni-btn sm" type="button" @click="opened = ''">Done</button>
                    </div>
                </div>

                <div v-else class="omni-picker">
                    <ul class="options" role="listbox" :aria-label="def.label">
                        <li v-for="c in flagChoices(def)" :key="c.value" role="option" tabindex="0" :aria-selected="(filters.values[def.key] ?? '') === c.value" :class="{ on: (filters.values[def.key] ?? '') === c.value }"
                            @click="setFlag(def, c.value)" @keydown.enter.prevent="setFlag(def, c.value)" @keydown.space.prevent="setFlag(def, c.value)">
                            <span class="tick" aria-hidden="true">{{ (filters.values[def.key] ?? '') === c.value ? '✓' : '' }}</span>
                            <span class="what"><span class="name">{{ c.label }}</span></span>
                        </li>
                    </ul>
                    <p v-if="def.help" class="help">{{ def.help }}</p>
                </div>
            </OmniscienceV3Popover>
        </template>

        <OmniscienceV3Popover v-if="more.length" :open="opened === '+'" label="More filters" width="240px" :data-testid="`${testid}-more`" @update:open="on => (opened = on ? '+' : '')">
            <template #trigger="{ toggle }">
                <button class="omni-btn ghost sm add" type="button" aria-haspopup="menu" :aria-expanded="opened === '+'" @click="toggle">+ {{ shown.length ? 'More filters' : 'Add a filter' }}</button>
            </template>
            <div class="omni-picker">
                <ul class="options" role="menu" aria-label="More filters">
                    <li v-for="def in more" :key="def.key" role="menuitem" tabindex="0" @click="add(def)" @keydown.enter.prevent="add(def)" @keydown.space.prevent="add(def)">
                        <span class="what"><span class="name">{{ def.label }}</span></span>
                    </li>
                </ul>
            </div>
        </OmniscienceV3Popover>

        <slot />
        <slot name="after" />
        <button v-if="filters.activeCount.value" class="omni-btn ghost sm clear" type="button" :data-testid="`${testid}-clear`" @click="clearAll()">
            Clear {{ filters.activeCount.value === 1 ? 'filter' : `${filters.activeCount.value} filters` }}
        </button>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import {
    OMNI_DATE_PRESETS, omniDatesLabel, omniFormatPick, omniFormatRange, omniParseDays, omniParsePick, omniParseRange,
    type OmniFilterDef, type OmniPickKind, type OmniPickScope, type OmniPickValue,
} from '~/scripts/omniscience/filters';
import type { OmniFilters } from '~/composables/useOmniFilters';
import { useOmniTime } from '~/composables/useOmniscienceV3';

/**
 * The filters of a search, as a row of dropdowns. Each one says what it is set to; opening it offers what there is to
 * choose from, by name, with a search box. The ones a page marks as primary are always there; the rest are added from
 * "More filters" and stay while they are set. Everything chosen lives in the page's link.
 */
const props = withDefaults(defineProps<{
    /** From `useOmniFilters`. */
    filters: OmniFilters;
    label?: string;
    /** Prefix of the test ids: each filter is `<testid>-<key>`. */
    testid?: string;
}>(), { label: 'Filters', testid: 'omni-filter' });

const { zone } = useOmniTime();

/** Which of the bar's own panels is open (a date range, a number range, a yes/no, or '+' for the menu). Pickers keep their own. */
const opened = ref('');
/** Filters added from the menu that are not set yet: they stay on the bar until the page is left. */
const added = ref<string[]>([]);

const defs = computed(() => props.filters.defs.value);
const shown = computed(() => defs.value.filter(def => def.primary || !!props.filters.values[def.key] || added.value.includes(def.key)));
const more = computed(() => defs.value.filter(def => !shown.value.includes(def)));

const PICKS: readonly string[] = ['person', 'guild', 'conversation', 'platform', 'site', 'options', 'custom'];
const isPick = (def: OmniFilterDef) => PICKS.includes(def.kind);

const pickOf = (def: OmniFilterDef): OmniPickValue => omniParsePick(props.filters.values[def.key]);
function setPick(def: OmniFilterDef, change: Partial<OmniPickValue>) {
    props.filters.set(def.key, omniFormatPick({ ...pickOf(def), ...change }));
}

/** A conversation is offered within the servers, platforms and kinds of place already chosen (when those are kept, not left out). */
function scopeOf(def: OmniFilterDef): OmniPickScope | undefined {
    if (def.kind !== 'conversation' && def.kind !== 'guild') return undefined;
    const kept = (kind: string, key?: string) => {
        const other = defs.value.find(d => d !== def && (key ? d.key === key : d.kind === kind));
        const value = other ? omniParsePick(props.filters.values[other.key]) : null;
        return value && !value.not ? value.ids : [];
    };
    return def.kind === 'guild' ? { platforms: kept('platform') } : { guilds: kept('guild'), platforms: kept('platform'), places: kept('options', 'place') };
}

function summaryOf(def: OmniFilterDef): string {
    const text = props.filters.values[def.key] ?? '';
    if (!text) return def.any ?? 'any';
    if (def.kind === 'dates') return omniDatesLabel(text) || text;
    if (def.kind === 'number') {
        const { min, max } = omniParseRange(text);
        const unit = def.unit ? ` ${def.unit}` : '';
        if (min !== null && max !== null) return `${min.toLocaleString('en-GB')} to ${max.toLocaleString('en-GB')}${unit}`;
        return min !== null ? `at least ${min.toLocaleString('en-GB')}${unit}` : `at most ${(max ?? 0).toLocaleString('en-GB')}${unit}`;
    }
    return text === 'yes' ? def.yes ?? 'yes' : def.no ?? 'no';
}

// ── dates ────────────────────────────────────────────────────────────────────
const daysOf = (def: OmniFilterDef) => omniParseDays(props.filters.values[def.key]) ?? { from: '', to: '' };
function setDates(def: OmniFilterDef, value: string) {
    props.filters.set(def.key, props.filters.values[def.key] === value ? '' : value);
    opened.value = '';
}
function setDay(def: OmniFilterDef, end: 'from' | 'to', day: string) {
    const next = { ...daysOf(def), [end]: day };
    props.filters.set(def.key, next.from || next.to ? `${next.from}..${next.to}` : '');
}

// ── numbers ──────────────────────────────────────────────────────────────────
const rangeOf = (def: OmniFilterDef) => omniParseRange(props.filters.values[def.key]);
function setRange(def: OmniFilterDef, end: 'min' | 'max', typed: string) {
    const n = typed.trim() === '' ? null : Math.max(0, Math.round(Number(typed)));
    const next = { ...rangeOf(def), [end]: n !== null && Number.isFinite(n) ? n : null };
    props.filters.set(def.key, omniFormatRange(next.min, next.max));
}

// ── yes / no ─────────────────────────────────────────────────────────────────
const flagChoices = (def: OmniFilterDef) => [{ value: '', label: def.any ?? 'Either' }, { value: 'yes', label: def.yes ?? 'Yes' }, { value: 'no', label: def.no ?? 'No' }];
function setFlag(def: OmniFilterDef, value: string) {
    props.filters.set(def.key, value);
    opened.value = '';
}

// ── the menu ─────────────────────────────────────────────────────────────────
async function add(def: OmniFilterDef) {
    added.value = [...added.value, def.key];
    opened.value = isPick(def) ? '' : def.key;
    if (!isPick(def)) return;
    // A picker keeps its own open state: open it the way a person would, by its button.
    await nextTick();
    document.querySelector<HTMLElement>(`[data-testid="${props.testid}-${def.key}"] .omni-pill > .main`)?.click();
}

function clearAll() {
    props.filters.clear();
    added.value = [];
    opened.value = '';
}
</script>
