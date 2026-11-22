<template>
    <OmniscienceV3Shell>
        <div class="omni-pagehead">
            <div>
                <h1>Tactics</h1>
                <p class="subtitle">Operations that turn sets of data into answers and new sets. Every result is a typed set that can feed another tactic.</p>
            </div>
            <div class="omni-actions">
                <button class="omni-btn ghost" type="button" @click="reloadAll">Refresh</button>
            </div>
        </div>

        <div v-if="carry" class="omni-banner info" role="status" data-testid="omni-carry">
            <span class="glyph" aria-hidden="true">⇢</span>
            <div><strong>Choose a tactic for {{ carry.items.length }} {{ carry.kind }} item{{ carry.items.length === 1 ? '' : 's' }}<template v-if="carry.origin"> from {{ carry.origin }}</template></strong>
                <span class="muted">Only tactics that accept this kind of set are listed.</span></div>
            <div class="actions"><button class="omni-btn sm ghost" type="button" @click="carry = null">Drop it</button></div>
        </div>

        <div class="omni-filterbar">
            <label class="omni-search">
                <span class="glyph" aria-hidden="true">⌕</span>
                <span class="visually-hidden">Search tactics</span>
                <input v-model="filters.q" class="omni-input" type="search" placeholder="name, code or description…" />
            </label>
            <div class="omni-segment" role="group" aria-label="Category">
                <button type="button" :aria-pressed="filters.category === ''" @click="filters.category = ''">All</button>
                <button v-for="c in categories" :key="c" type="button" :aria-pressed="filters.category === c" @click="filters.category = c">{{ c }}</button>
            </div>
            <span class="summary"><b>{{ shownTactics.length }}</b> of {{ allTactics.length }} tactics</span>
            <div class="grow"></div>
        </div>

        <div class="omni-grid sidebar">
            <OmniscienceV3Panel title="Catalogue" flush :loading="catalog.loading.value" :error="catalog.error.value" :has-data="!!catalog.data.value"
                                :empty="!shownTactics.length" :empty-kind="allTactics.length ? 'filtered' : 'empty'"
                                :empty-title="allTactics.length ? 'No tactics match' : 'No tactics installed'"
                                :empty-text="carry && allTactics.length ? `Nothing installed accepts a ${carry.kind} set.` : undefined" @retry="catalog.refresh()">
                <OmniscienceV3DataTable :rows="shownTactics" :columns="tacticColumns" :row-key="r => r.key" label="tactics" :searchable="false" pinned selectable
                                     :selected-key="filters.tactic || null" default-sort="code" default-direction="asc" max-height="none" @select="filters.tactic = $event.key">
                    <template #cell-code="{ row }"><span class="omni-mono">{{ row.code }}</span></template>
                    <template #cell-title="{ row }">
                        <span class="cellstack">
                            <span><strong>{{ row.title }}</strong> <span v-if="row.outbound" class="omni-chip warn">outbound</span></span>
                            <span class="sub">{{ row.description }}</span>
                        </span>
                    </template>
                    <template #cell-accepts="{ row }">{{ row.accepts.length ? row.accepts.join(', ') : 'nothing' }}</template>
                    <template #cell-outputs="{ row }">{{ row.outputs.join(', ') }}</template>
                </OmniscienceV3DataTable>
            </OmniscienceV3Panel>

            <OmniscienceV3Panel title="Runs" subtitle="Newest first." flush :loading="runs.loading.value" :error="runs.error.value" :has-data="runs.items.value.length > 0"
                                :empty="!runs.items.value.length" :empty-kind="filters.runState ? 'filtered' : 'empty'" empty-title="No runs yet"
                                empty-text="Pick a tactic from the catalogue to start one." what="Runs" @retry="runs.reload()">
                <template #controls>
                    <select v-model="filters.runState" class="omni-select auto" aria-label="Run state">
                        <option value="">Any state</option>
                        <option v-for="s in RUN_STATES" :key="s" :value="s">{{ s }}</option>
                    </select>
                </template>
                <ul class="runs">
                    <li v-for="r in runs.items.value" :key="r.runId">
                        <button type="button" :class="{ selected: filters.run === r.runId }" @click="filters.run = r.runId">
                            <span class="omni-chip" :class="omniStateTone(r.state)">{{ r.state }}</span>
                            <span class="name">{{ titleOf(r.tactic) }}</span>
                            <span class="when"><OmniscienceV3Time :ms="r.createdAtMs" mode="age" /></span>
                        </button>
                    </li>
                </ul>
                <template v-if="runs.hasMore.value" #footer>
                    <button class="omni-btn sm" type="button" :disabled="runs.loadingMore.value" @click="runs.loadMore()">Load older runs</button>
                </template>
            </OmniscienceV3Panel>
        </div>

        <OmniscienceV3Drawer :open="!!selectedTactic" :title="selectedTactic ? `${selectedTactic.code} · ${selectedTactic.title}` : ''" :subtitle="selectedTactic?.key" wide @close="filters.tactic = ''">
            <OmniscienceV3TacticRunForm v-if="selectedTactic" :key="selectedTactic.key" :tactic="selectedTactic" :initial-selections="carry ? [carry] : []" @started="onStarted" />
        </OmniscienceV3Drawer>

        <OmniscienceV3Drawer :open="!!filters.run && !selectedTactic" :title="runTitle" :subtitle="runSubtitle" wide @close="filters.run = ''">
            <OmniscienceV3TacticRunView v-if="filters.run" :run-id="filters.run" :tactics="allTactics" @use="onUse" @open="filters.run = $event" @changed="runs.reload(true)" />
        </OmniscienceV3Drawer>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { omniGet } from '~/scripts/omniscience/api';
import type { Selection, TacticCatalogDto, TacticDescriptor, TacticRunDto, TacticRunPageDto } from '~/scripts/omniscience/contracts';
import { omniStateTone } from '~/scripts/omniscience/format';
import { useOmniCarry, useOmniDebounced, useOmniPaged, useOmniResource, useOmniStream, useOmniTime } from '~/composables/useOmniscienceV3';
import { useOmniUrlState } from '~/composables/useOmniscienceV3';
import type { TableColumn } from '~/components/OmniscienceV3/DataTable.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Tactics' });

const RUN_STATES = ['queued', 'running', 'paused', 'succeeded', 'failed', 'cancelled'];

const { state: filters } = useOmniUrlState({ q: '', category: '', tactic: '', run: '', runState: '' });
/** A set handed over from a run's output, waiting for the tactic it will feed. */
const carry = useOmniCarry();

const catalog = useOmniResource(signal => omniGet<TacticCatalogDto>('tactics', {}, signal));
const allTactics = computed<TacticDescriptor[]>(() => catalog.data.value?.tactics ?? []);
const categories = computed(() => [...new Set(allTactics.value.map(t => t.category))]);
const shownTactics = computed(() => {
    const needle = filters.q.trim().toLowerCase();
    return allTactics.value.filter(t =>
        (!filters.category || t.category === filters.category)
        && (!carry.value || t.accepts.includes(carry.value.kind))
        && (!needle || `${t.code} ${t.title} ${t.description} ${t.key}`.toLowerCase().includes(needle)));
});
const selectedTactic = computed(() => (filters.tactic ? allTactics.value.find(t => t.key === filters.tactic) ?? null : null));
const titleOf = (key: string) => allTactics.value.find(t => t.key === key)?.title ?? key;

const runs = useOmniPaged<TacticRunDto, string>((cursor, signal) => omniGet<TacticRunPageDto>('tactics/runs', {
    state: filters.runState, cursor, limit: 50,
}, signal));
useOmniDebounced(() => filters.runState, () => { void runs.reload(); }, 0);

const runTitle = computed(() => {
    const run = runs.items.value.find(r => r.runId === filters.run);
    return run ? titleOf(run.tactic) : 'Tactic run';
});
/** When the run started and who started it: what tells one run from another (its id would not). */
const { at: atTime } = useOmniTime();
const runSubtitle = computed(() => {
    const run = runs.items.value.find(r => r.runId === filters.run);
    return run ? `Started ${atTime(run.createdAtMs)}${run.actor ? ` by ${run.actor}` : ''}` : undefined;
});

// The list follows the engine instead of polling it: any run starting or finishing refreshes it.
useOmniStream({
    topics: ['tactic.'],
    onEvent: event => {
        const state = (event.payload as any)?.detail?.state;
        if (event.topic === 'tactic.finished' || state === 'queued' || state === 'running' || state === 'paused') void runs.reload(true);
    },
    onReset: () => { void runs.reload(true); },
});

function reloadAll() { void catalog.refresh(); void runs.reload(); }

function onStarted(runId: string) {
    carry.value = null;
    filters.tactic = '';
    filters.run = runId;
    void runs.reload(true);
}

function onUse(selection: Selection) {
    carry.value = selection;
    filters.run = '';
    filters.category = '';
    filters.q = '';
}

const tacticColumns: TableColumn[] = [
    { key: 'code', label: 'Code', width: '64px' },
    { key: 'title', label: 'Tactic' },
    { key: 'category', label: 'Category' },
    { key: 'accepts', label: 'Takes', sortable: false },
    { key: 'outputs', label: 'Gives', sortable: false, optional: true },
];
</script>

<style scoped>
.runs { list-style: none; margin: 0; padding: 0; max-height: 70vh; overflow-y: auto; }
.runs button {
    display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: center; width: 100%;
    padding: 8px 12px; border: 0; border-bottom: 1px solid var(--omni-line); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.runs button:hover { background: rgba(255, 255, 255, 0.04); }
.runs button.selected { background: var(--omni-accent-soft); }
.runs .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.runs .when { font-size: 11.5px; color: var(--omni-muted); }
.omni-banner .muted { display: block; color: var(--omni-text-2); }
</style>
