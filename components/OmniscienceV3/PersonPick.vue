<template>
    <div class="pick" :data-testid="testid">
        <div v-if="modelValue.length" class="omni-row chosen">
            <span v-for="p in modelValue" :key="p.id" class="ot-chip">
                {{ p.label ?? name(p.id) }}
                <button class="x" type="button" :aria-label="`Remove ${p.label ?? name(p.id)}`" @click="remove(p.id)">✕</button>
            </span>
        </div>
        <div v-if="modelValue.length < max" class="search">
            <input :id="inputId" v-model="text" class="ot-input" type="search" autocomplete="off" :placeholder="placeholder" :aria-label="inputId ? undefined : placeholder"
                   @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="choose(matches[index])" @keydown.esc="text = ''" />
            <ul v-if="text.trim() && (matches.length || searched)" class="results" role="listbox">
                <li v-for="(m, i) in matches" :key="m.personId" role="option" :aria-selected="i === index" :class="{ active: i === index }"
                    @mouseenter="index = i" @mousedown.prevent="choose(m)">
                    <span>{{ m.displayName }}</span>
                    <span class="omni-muted">{{ m.platforms.join(', ') }} · {{ omniCount(m.msgs) }} messages</span>
                </li>
                <li v-if="!matches.length && searched" class="omni-muted">Nobody matches “{{ text.trim() }}”.</li>
            </ul>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import { isOmniAbort, omniGet } from '~/scripts/omniscience/api';
import type { DirectoryPageDto, PersonCardDto } from '~/scripts/omniscience/contracts';
import { omniCount } from '~/scripts/omniscience/format';
import { useOmniDebounced, useOmniNames } from '~/composables/useOmniscienceV3';

/** Picks people by name from the directory (the same search the People page uses), up to `max`. */
export interface PickedPerson { id: string; label: string | null }

const props = withDefaults(defineProps<{
    modelValue: PickedPerson[];
    max?: number;
    placeholder?: string;
    inputId?: string;
    testid?: string;
}>(), { max: 8, placeholder: 'Find a person by name…', testid: 'person-pick' });
const emit = defineEmits<{ 'update:modelValue': [value: PickedPerson[]] }>();

// Someone handed in by id alone (a link from their page) is shown by name once it is known.
const { want, name } = useOmniNames();
watchEffect(() => want(props.modelValue.filter(p => !p.label).map(p => p.id)));

const text = ref('');
const matches = ref<PersonCardDto[]>([]);
const searched = ref(false);
const index = ref(0);
let controller: AbortController | null = null;

async function search() {
    controller?.abort();
    const q = text.value.trim();
    searched.value = false;
    if (!q) { matches.value = []; return; }
    const mine = new AbortController();
    controller = mine;
    try {
        const page = await omniGet<DirectoryPageDto>('people', { q, limit: 8 }, mine.signal);
        if (mine.signal.aborted) return;
        const taken = new Set(props.modelValue.map(p => p.id));
        matches.value = page.items.filter(p => !taken.has(p.personId));
        index.value = 0;
        searched.value = true;
    } catch (caught) {
        if (isOmniAbort(caught) || mine.signal.aborted) return;
        // The picker is a convenience: without the directory an id can still be given elsewhere.
        matches.value = [];
        searched.value = true;
    }
}
useOmniDebounced(() => text.value, () => { void search(); }, 200);

function move(step: number) {
    if (matches.value.length) index.value = (index.value + step + matches.value.length) % matches.value.length;
}

function choose(person: PersonCardDto | undefined) {
    if (!person) return;
    emit('update:modelValue', [...props.modelValue, { id: person.personId, label: person.displayName }]);
    text.value = '';
    matches.value = [];
    searched.value = false;
}

function remove(id: string) {
    emit('update:modelValue', props.modelValue.filter(p => p.id !== id));
}
</script>

<style scoped>
.pick { display: flex; flex-direction: column; gap: 6px; }
.chosen { gap: 6px; }
.ot-chip .x { background: none; border: 0; color: inherit; cursor: pointer; padding: 0 0 0 4px; }
.search { position: relative; }
.results { position: absolute; z-index: 30; left: 0; right: 0; top: 100%; margin: 2px 0 0; padding: 4px; list-style: none; max-height: 260px; overflow: auto;
    background: var(--ot-surface-2); border: 1px solid var(--ot-line-strong); border-radius: var(--ot-radius-sm); box-shadow: 0 12px 34px rgba(0, 0, 0, 0.45); }
.results li { display: flex; justify-content: space-between; gap: 10px; padding: 6px 8px; border-radius: 3px; font-size: 13px; cursor: pointer; }
.results li.active { background: var(--ot-surface-3, rgba(255, 255, 255, 0.08)); }
.results li.omni-muted { cursor: default; }
</style>
