<template>
    <OmniscienceV3Shell>
        <div class="omni-pagehead">
            <div>
                <h1>Cohorts</h1>
                <p class="subtitle">Named sets of people, saved from any selection or tactic result and usable as the input of any tactic.</p>
            </div>
            <div class="omni-actions">
                <button class="omni-btn ghost" type="button" :disabled="list.refreshing.value" @click="list.refresh()">Refresh</button>
            </div>
        </div>

        <OmniscienceV3Panel title="Cohorts" flush :loading="list.loading.value" :error="list.error.value" :has-data="!!list.data.value"
                            :empty="!cohorts.length" empty-title="No cohorts yet"
                            empty-text="Run “Save as cohort” (X26) on any set of people to create one." @retry="list.refresh()">
            <OmniscienceV3DataTable :rows="cohorts" :columns="columns" :row-key="r => r.cohortId" label="cohorts" pinned selectable max-height="none"
                                 :selected-key="filters.cohort || null" default-sort="updatedAtMs" search-placeholder="Search cohorts…" @select="filters.cohort = $event.cohortId">
                <template #cell-name="{ row }"><strong>{{ row.name }}</strong></template>
                <template #cell-members="{ row }">{{ omniCount(row.members) }}</template>
                <template #cell-createdAtMs="{ row }"><OmniscienceV3Time :ms="row.createdAtMs" mode="absolute" /></template>
                <template #cell-updatedAtMs="{ row }"><OmniscienceV3Time :ms="row.updatedAtMs" mode="age" /></template>
            </OmniscienceV3DataTable>
        </OmniscienceV3Panel>

        <OmniscienceV3Drawer :open="!!filters.cohort" :title="detail.data.value?.cohort.name ?? 'Cohort'" :subtitle="filters.cohort" @close="filters.cohort = ''">
            <OmniscienceV3ErrorBlock v-if="detail.error.value && !detail.data.value" :error="detail.error.value" what="This cohort" @retry="detail.refresh()" />
            <div v-else-if="!detail.data.value" class="omni-skelrows" aria-busy="true"><div v-for="n in 5" :key="n" class="omni-skel"></div></div>
            <template v-else>
                <div class="omni-row">
                    <span>{{ omniCount(members.length) }} member{{ members.length === 1 ? '' : 's' }}</span>
                    <span class="omni-muted">updated <OmniscienceV3Time :ms="detail.data.value.cohort.updatedAtMs" mode="age" /></span>
                    <span style="flex:1"></span>
                    <button class="omni-btn primary sm" type="button" :disabled="!members.length" @click="useInTactic">Run a tactic on this cohort</button>
                </div>
                <p v-if="!members.length" class="omni-muted omni-section">This cohort is empty.</p>
                <ol v-else class="members omni-section">
                    <li v-for="m in members" :key="m.id"><span>{{ m.label ?? m.id }}</span><span v-if="m.label" class="omni-muted omni-mono id">{{ m.id }}</span></li>
                </ol>
            </template>
        </OmniscienceV3Drawer>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { OMNI_BASE, omniGet } from '~/scripts/omniscience/api';
import type { CohortDto, CohortSelectionDto } from '~/scripts/omniscience/contracts';
import { omniCount } from '~/scripts/omniscience/format';
import { useOmniCarry, useOmniResource } from '~/composables/useOmniscienceV3';
import { useOmniUrlState } from '~/composables/useOmniscienceV3';
import type { TableColumn } from '~/components/OmniscienceV3/DataTable.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Cohorts' });

const router = useRouter();
const carry = useOmniCarry();
const { state: filters } = useOmniUrlState({ cohort: '' });

const list = useOmniResource(signal => omniGet<CohortDto[]>('cohorts', {}, signal));
const cohorts = computed(() => list.data.value ?? []);

const detail = useOmniResource<CohortSelectionDto | null>(
    signal => (filters.cohort ? omniGet<CohortSelectionDto>('cohorts/get', { id: filters.cohort }, signal) : Promise.resolve(null)),
    { immediate: false });
const members = computed(() => detail.data.value?.selection.items ?? []);
watch(() => filters.cohort, id => {
    detail.data.value = null;
    detail.error.value = null;
    if (id) void detail.refresh();
}, { immediate: true });

function useInTactic() {
    const loaded = detail.data.value;
    if (!loaded) return;
    carry.value = { ...loaded.selection, origin: `cohort ${loaded.cohort.name}` };
    void router.push(`${OMNI_BASE}/tactics`);
}

const columns: TableColumn[] = [
    { key: 'name', label: 'Cohort' },
    { key: 'members', label: 'Members', num: true },
    { key: 'createdAtMs', label: 'Created', num: true, optional: true },
    { key: 'updatedAtMs', label: 'Updated', num: true },
];
</script>

<style scoped>
.members { margin: 0; padding-left: 28px; font-size: 13px; }
.members li { padding: 2px 0; }
.members .id { margin-left: 8px; }
</style>
