<template>
    <OmniscienceV3Shell>
        <div class="ot-pagehead">
            <div>
                <h1>Settings</h1>
                <p class="subtitle">Engine and module settings. Changes apply at once and are recorded in the audit log.</p>
            </div>
            <div class="ot-actions">
                <button class="ot-btn ghost" type="button" :disabled="settings.refreshing.value" @click="settings.refresh()">Refresh</button>
            </div>
        </div>

        <div class="ot-filterbar">
            <label class="ot-search">
                <span class="glyph" aria-hidden="true">⌕</span>
                <span class="visually-hidden">Search settings</span>
                <input v-model="filters.q" class="ot-input" type="search" placeholder="key or description…" />
            </label>
            <div class="ot-segment" role="group" aria-label="Which settings">
                <button type="button" :aria-pressed="filters.show === 'all'" @click="filters.show = 'all'">All</button>
                <button type="button" :aria-pressed="filters.show === 'changed'" @click="filters.show = 'changed'">
                    Changed <span class="facet">{{ changedCount }}</span>
                </button>
            </div>
            <span class="summary"><b>{{ visibleCount }}</b> of {{ all.length }} settings</span>
            <button v-if="activeCount" class="ot-filterchip" type="button" @click="reset">Clear filters <span class="x" aria-hidden="true">✕</span></button>
            <div class="grow"></div>
        </div>

        <div v-if="!canManage && all.length" class="ot-banner info" role="note">
            <span class="glyph" aria-hidden="true">🔒</span>
            <div><strong>Read only</strong><span class="muted">Changing settings needs the “Manage the intelligence engine” permission.</span></div>
        </div>

        <OmniscienceV3Panel v-if="!groups.length" title="Settings" :loading="settings.loading.value" :error="settings.error.value"
                            :has-data="!!settings.data.value" :empty="!visibleCount" :empty-kind="activeCount ? 'filtered' : 'empty'"
                            :empty-title="activeCount ? 'No settings match these filters' : 'No settings declared'" @retry="settings.refresh()" />

        <div class="ot-stack">
            <OmniscienceV3Panel v-for="group in groups" :key="group.scope" :title="group.title" :subtitle="group.subtitle" flush
                                :error="settings.error.value" has-data @retry="settings.refresh()">
                <OmniscienceV3SettingRows :settings="group.items" :editable="canManage" @saved="onSaved" />
            </OmniscienceV3Panel>
        </div>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { omniGet } from '~/scripts/omniscience/api';
import type { SettingDto } from '~/scripts/omniscience/contracts';
import { useOmniEngine, useOmniResource, useOmniToasts } from '~/composables/useOmniscienceV3';
import { useUrlState } from '~/composables/useOmniTrader';
import { useAccess } from '~/composables/useAccess';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Settings' });

const { can } = useAccess();
const canManage = computed(() => can('omniscience.engine.manage'));
const { refreshStatus } = useOmniEngine();
const { push } = useOmniToasts();
const { state: filters, reset, activeCount } = useUrlState({ q: '', show: 'all' });

const settings = useOmniResource(signal => omniGet<SettingDto[]>('settings', {}, signal));
const all = computed(() => settings.data.value ?? []);
const changedCount = computed(() => all.value.filter(s => s.valueJson != null).length);

const visible = computed(() => {
    const needle = filters.q.trim().toLowerCase();
    return all.value.filter(s =>
        (filters.show !== 'changed' || s.valueJson != null)
        && (!needle || `${s.key} ${s.description} ${s.scope}`.toLowerCase().includes(needle)));
});
const visibleCount = computed(() => visible.value.length);

const groups = computed(() => {
    const byScope = new Map<string, SettingDto[]>();
    for (const s of visible.value) {
        const list = byScope.get(s.scope);
        if (list) list.push(s); else byScope.set(s.scope, [s]);
    }
    const rank = (scope: string) => (scope === 'kernel' ? 0 : scope === 'orphaned' ? 2 : 1);
    return [...byScope.entries()]
        .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
        .map(([scope, items]) => ({
            scope,
            items,
            title: scope === 'kernel' ? 'Engine' : scope === 'orphaned' ? 'Orphaned values' : scope,
            subtitle: scope === 'kernel' ? 'Settings of the engine itself.'
                : scope === 'orphaned' ? 'Stored values no module declares any more. They have no effect.'
                    : `Settings of the ${scope} module.`,
        }));
});

function onSaved(saved: SettingDto) {
    settings.data.value = all.value.map(s => (s.key === saved.key ? saved : s));
    push('ok', `${saved.key} saved.`);
    // Some settings (Klives's zone) change what the shell shows.
    void refreshStatus();
}
</script>
