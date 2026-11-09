<template>
    <OmniscienceV3Shell>
        <div class="ot-pagehead">
            <div>
                <h1>Modules</h1>
                <p class="subtitle">Every capability is a module with its own jobs, data and settings. Each one reports whether it is caught up.</p>
            </div>
            <div class="ot-actions">
                <button class="ot-btn ghost" type="button" :disabled="modules.refreshing.value" @click="modules.refresh()">Refresh</button>
            </div>
        </div>

        <div class="ot-filterbar">
            <label class="ot-search">
                <span class="glyph" aria-hidden="true">⌕</span>
                <span class="visually-hidden">Search modules</span>
                <input v-model="filters.q" class="ot-input" type="search" placeholder="name, id or description…" />
            </label>
            <select v-model="filters.category" class="ot-select auto" aria-label="Category">
                <option value="">All categories</option>
                <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
            </select>
            <div class="ot-segment" role="group" aria-label="Module state">
                <button v-for="f in STATES" :key="f.value" type="button" :aria-pressed="filters.state === f.value" @click="filters.state = f.value">
                    {{ f.label }} <span class="facet">{{ stateCount(f.value) }}</span>
                </button>
            </div>
            <span class="summary"><b>{{ rows.length }}</b> of {{ all.length }} modules</span>
            <button v-if="filterCount" class="ot-filterchip" type="button" @click="clearFilters">Clear {{ filterCount }} filter(s) <span class="x" aria-hidden="true">✕</span></button>
            <div class="grow"></div>
        </div>

        <OmniscienceV3Panel title="Modules" flush :loading="modules.loading.value" :error="modules.error.value" :has-data="!!modules.data.value"
                            :empty="!rows.length" :empty-kind="filterCount ? 'filtered' : 'empty'"
                            :empty-title="filterCount ? 'No modules match these filters' : 'No modules loaded'" @retry="modules.refresh()">
            <OmniTraderDataTable :rows="rows" :columns="columns" :row-key="r => r.id" label="modules" :searchable="false" pinned selectable
                                 :selected-key="selected?.id ?? null" default-sort="title" default-direction="asc" max-height="none"
                                 :row-class="r => (needsAttention(r) ? 'attention' : '')" @select="open($event)">
                <template #cell-title="{ row }">
                    <span class="cellstack">
                        <span><strong>{{ row.title }}</strong> <span v-if="row.minorRestricted" class="ot-chip violet" title="Excludes people the minor-safety guard covers">minor-safe</span></span>
                        <span class="sub omni-mono">{{ row.id }} · v{{ row.version }}</span>
                    </span>
                </template>
                <template #cell-enabled="{ row }">
                    <span class="ot-chip" :class="row.health?.enabled ? 'ok' : ''">{{ row.health?.enabled ? 'on' : 'off' }}</span>
                </template>
                <template #cell-backlog="{ row }">{{ omniCount(row.health?.backlog) }}</template>
                <template #cell-queued="{ row }">{{ omniCount(row.health ? row.health.queued + row.health.leased : null) }}</template>
                <template #cell-dead="{ row }"><span :class="row.health?.dead ? 'neg' : 'omni-muted'">{{ omniCount(row.health?.dead) }}</span></template>
                <template #cell-lastSucceededMs="{ row }"><OmniscienceV3Time :ms="row.health?.lastSucceededMs" mode="age" /></template>
                <template #cell-lastFailedMs="{ row }">
                    <span v-if="row.health?.lastFailedMs" :class="failing(row) ? 'neg' : ''" :title="row.health.lastError ?? ''">
                        <OmniscienceV3Time :ms="row.health.lastFailedMs" mode="age" />
                    </span>
                    <span v-else class="omni-muted">—</span>
                </template>
            </OmniTraderDataTable>
        </OmniscienceV3Panel>

        <OmniTraderDrawer :open="!!selected" :title="selected?.title" :subtitle="selected ? `${selected.id} · version ${selected.version} · ${selected.category}` : ''" wide @close="close">
            <template v-if="selected">
                <p>{{ selected.description }}</p>

                <div class="omni-row">
                    <span class="ot-chip" :class="selected.health?.enabled ? 'ok' : ''">{{ selected.health?.enabled ? 'Enabled' : 'Disabled' }}</span>
                    <button v-if="canManage && selected.health" class="ot-btn sm" :class="selected.health.enabled ? 'warn' : 'primary'" type="button"
                            :disabled="busy !== null" @click="setEnabled(selected, !selected.health.enabled)">
                        {{ selected.health.enabled ? 'Disable' : 'Enable' }}
                    </button>
                    <NuxtLink class="ot-btn ghost sm" :to="`${OMNI_BASE}/jobs?module=${encodeURIComponent(selected.id)}`">Its jobs</NuxtLink>
                    <NuxtLink class="ot-btn ghost sm" :to="`${OMNI_BASE}/llm?module=${encodeURIComponent(selected.id)}`">Its LLM calls</NuxtLink>
                </div>
                <p v-if="selected.health?.enabled && canManage" class="omni-muted">Disabling cancels this module's queued jobs. Its existing output keeps being served.</p>

                <div v-if="selected.health?.lastError && failing(selected)" class="ot-banner" role="alert">
                    <span class="glyph" aria-hidden="true">⚠</span>
                    <div><strong>Last run failed <OmniscienceV3Time :ms="selected.health.lastFailedMs" mode="age" /></strong>
                        <span class="muted omni-wrap">{{ selected.health.lastError }}</span></div>
                </div>

                <section class="omni-section">
                    <h4>Health</h4>
                    <dl v-if="selected.health" class="ot-kv">
                        <dt>Watermark</dt><dd>{{ omniCount(selected.health.watermark) }} <span class="omni-muted">(ingest sequence it has processed up to)</span></dd>
                        <dt>Backlog</dt><dd>{{ omniCount(selected.health.backlog) }} changes behind</dd>
                        <dt>Dirty subjects</dt><dd>{{ omniCount(selected.health.dirtySubjects) }}</dd>
                        <dt>Jobs</dt><dd>{{ selected.health.queued }} queued · {{ selected.health.leased }} running · {{ selected.health.dead }} dead</dd>
                        <dt>Last success</dt><dd><OmniscienceV3Time :ms="selected.health.lastSucceededMs" /></dd>
                        <dt>Last failure</dt><dd><OmniscienceV3Time :ms="selected.health.lastFailedMs" /></dd>
                    </dl>
                    <p v-else class="omni-muted">This module has not reported health yet.</p>
                </section>

                <section class="omni-section">
                    <h4>How it runs</h4>
                    <dl class="ot-kv">
                        <dt>Lane</dt><dd>{{ selected.defaultLane }}</dd>
                        <dt>Depends on</dt><dd>{{ selected.dependsOn.length ? selected.dependsOn.join(', ') : 'nothing' }}</dd>
                        <dt>Reacts to</dt><dd>{{ selected.subscribedChangeKinds.length ? selected.subscribedChangeKinds.join(', ') : 'no corpus changes' }}</dd>
                        <dt>Schedules</dt>
                        <dd>
                            <template v-if="selected.schedules.length">
                                <div v-for="s in selected.schedules" :key="s.name">
                                    {{ s.name }}: {{ s.dailyAtLocal ? `daily at ${s.dailyAtLocal} (${klivesZone})` : s.everyMs ? `every ${omniDuration(s.everyMs)}` : 'on demand' }}
                                </div>
                            </template>
                            <template v-else>none</template>
                        </dd>
                    </dl>
                </section>

                <section class="omni-section">
                    <h4>Datasets ({{ selected.datasets.length }})</h4>
                    <p v-if="!selected.datasets.length" class="omni-muted">This module declares no datasets.</p>
                    <ul v-else class="ot-timeline">
                        <li v-for="d in selected.datasets" :key="d.id">
                            <NuxtLink :to="`${OMNI_BASE}/explore?dataset=${encodeURIComponent(d.id)}`">{{ d.title }}</NuxtLink>
                            <span class="sub">{{ d.dimensions.length }} dimensions · {{ d.measures.length }} measures · needs {{ d.requiredPermission }}</span>
                        </li>
                    </ul>
                </section>

                <section class="omni-section">
                    <h4>Settings ({{ selectedSettings.length }})</h4>
                    <OmniscienceV3ErrorBlock v-if="settings.error.value && !settings.data.value" :error="settings.error.value" what="Settings" compact @retry="settings.refresh()" />
                    <p v-else-if="!selectedSettings.length" class="omni-muted">This module has no settings.</p>
                    <OmniscienceV3SettingRows v-else :settings="selectedSettings" :editable="canManage" stacked @saved="onSettingSaved" />
                </section>
            </template>
        </OmniTraderDrawer>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { OMNI_BASE, omniGet, omniPost } from '~/scripts/omniscience/api';
import type { ModuleDto, SettingDto } from '~/scripts/omniscience/contracts';
import { omniCount, omniDuration } from '~/scripts/omniscience/format';
import { useOmniAction, useOmniEngine, useOmniResource, useOmniToasts } from '~/composables/useOmniscienceV3';
import { useUrlState } from '~/composables/useOmniTrader';
import { useAccess } from '~/composables/useAccess';
import type { TableColumn } from '~/components/OmniTrader/DataTable.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Modules' });

const { can } = useAccess();
const canManage = computed(() => can('omniscience.engine.manage'));
const { klivesZone, refreshStatus } = useOmniEngine();
const { push } = useOmniToasts();
const { busy, run } = useOmniAction();
const { state: filters } = useUrlState({ q: '', category: '', state: 'all', module: '' });

const STATES = [
    { value: 'all', label: 'All' },
    { value: 'attention', label: 'Needs attention' },
    { value: 'off', label: 'Disabled' },
];

const modules = useOmniResource(signal => omniGet<ModuleDto[]>('modules', {}, signal), { pollMs: 15_000 });
const settings = useOmniResource(signal => omniGet<SettingDto[]>('settings', {}, signal));

const all = computed(() => modules.data.value ?? []);
const categories = computed(() => [...new Set(all.value.map(m => m.category))].sort());

const failing = (m: ModuleDto) => !!m.health?.lastFailedMs && (!m.health.lastSucceededMs || m.health.lastFailedMs > m.health.lastSucceededMs);
const needsAttention = (m: ModuleDto) => failing(m) || (m.health?.dead ?? 0) > 0;

function inState(m: ModuleDto, state: string): boolean {
    if (state === 'attention') return needsAttention(m);
    if (state === 'off') return m.health?.enabled === false;
    return true;
}
const stateCount = (state: string) => all.value.filter(m => inState(m, state)).length;

const rows = computed(() => {
    const needle = filters.q.trim().toLowerCase();
    return all.value.filter(m =>
        inState(m, filters.state)
        && (!filters.category || m.category === filters.category)
        && (!needle || `${m.title} ${m.id} ${m.description}`.toLowerCase().includes(needle)));
});
const filterCount = computed(() => Number(!!filters.q) + Number(!!filters.category) + Number(filters.state !== 'all'));
function clearFilters() { filters.q = ''; filters.category = ''; filters.state = 'all'; }

const selected = computed(() => (filters.module ? all.value.find(m => m.id === filters.module) ?? null : null));
const selectedSettings = computed(() => (selected.value ? (settings.data.value ?? []).filter(s => s.scope === selected.value!.id) : []));
function open(m: ModuleDto) { filters.module = m.id; }
function close() { filters.module = ''; }

async function setEnabled(m: ModuleDto, enabled: boolean) {
    const updated = await run(`enable:${m.id}`, () => omniPost<ModuleDto>('modules/enabled', { moduleId: m.id, enabled }),
        result => `${result.title} ${enabled ? 'enabled' : 'disabled'}.`);
    if (!updated) return;
    modules.data.value = all.value.map(x => (x.id === updated.id ? updated : x));
    void refreshStatus();
}

function onSettingSaved(saved: SettingDto) {
    settings.data.value = (settings.data.value ?? []).map(s => (s.key === saved.key ? saved : s));
    push('ok', `${saved.key} saved.`);
}

const columns: TableColumn[] = [
    { key: 'title', label: 'Module' },
    { key: 'category', label: 'Category' },
    { key: 'defaultLane', label: 'Lane' },
    { key: 'enabled', label: 'State', sortValue: r => (r.health?.enabled ? 1 : 0) },
    { key: 'backlog', label: 'Backlog', num: true, sortValue: r => r.health?.backlog ?? -1 },
    { key: 'queued', label: 'Jobs', num: true, sortValue: r => (r.health ? r.health.queued + r.health.leased : -1) },
    { key: 'dead', label: 'Dead', num: true, sortValue: r => r.health?.dead ?? -1 },
    { key: 'lastSucceededMs', label: 'Last success', num: true, sortValue: r => r.health?.lastSucceededMs ?? 0 },
    { key: 'lastFailedMs', label: 'Last failure', num: true, sortValue: r => r.health?.lastFailedMs ?? 0 },
];
</script>
