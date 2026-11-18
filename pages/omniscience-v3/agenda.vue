<template>
    <OmniscienceV3Shell>
        <div class="omni-pagehead">
            <div>
                <h1>Agenda</h1>
                <p class="subtitle">Plans, promises and dates found in the conversations: what is coming up, what has slipped, and what you said you would do. Each one links back to the messages it came from.</p>
            </div>
            <div class="omni-actions"><button class="omni-btn ghost" type="button" @click="refresh()">Refresh</button></div>
        </div>

        <OmniscienceV3ErrorBlock v-if="agenda.error.value && !a" :error="agenda.error.value" what="The agenda" @retry="agenda.refresh()" />
        <template v-else>
            <div class="omni-kpis tight" data-testid="agenda-kpis">
                <OmniscienceV3Kpi label="Coming up" :value="omniCount(a?.upcoming.length)" small />
                <OmniscienceV3Kpi label="Overdue" :value="omniCount(a?.overdue.length)" small :tone="a?.overdue.length ? 'bad' : undefined" />
                <OmniscienceV3Kpi label="Your promises" :value="omniCount(a?.klivesPromises.length)" small />
                <OmniscienceV3Kpi label="As of" :value="a ? age(a.asOfMs) : '…'" small :foot="a ? `times in ${a.zone}` : undefined" />
            </div>

            <div class="omni-grid two">
                <OmniscienceV3Panel title="Overdue" flush :loading="agenda.loading.value" :error="agenda.error.value" :has-data="!!a" :empty="!!a && !a.overdue.length" empty-kind="ok" empty-title="Nothing has slipped">
                    <OmniscienceV3PlanList v-if="a" :plans="a.overdue" testid="agenda-overdue" />
                </OmniscienceV3Panel>
                <OmniscienceV3Panel title="What you promised" flush :loading="agenda.loading.value" :error="agenda.error.value" :has-data="!!a" :empty="!!a && !a.klivesPromises.length" empty-kind="ok"
                                    empty-title="No open promises" empty-text="When you tell someone you will do something, it is kept here until it is done or its day has passed.">
                    <OmniscienceV3PlanList v-if="a" :plans="a.klivesPromises" testid="agenda-promises" />
                </OmniscienceV3Panel>
            </div>
            <OmniscienceV3Panel title="Coming up" flush :loading="agenda.loading.value" :error="agenda.error.value" :has-data="!!a" :empty="!!a && !a.upcoming.length" empty-title="Nothing coming up">
                <OmniscienceV3PlanList v-if="a" :plans="a.upcoming" testid="agenda-upcoming" />
            </OmniscienceV3Panel>
        </template>

        <div class="omni-filterbar">
            <select v-model="filters.status" class="omni-select auto" aria-label="Status">
                <option value="">Any status</option>
                <option v-for="s in STATUSES" :key="s" :value="s">{{ omniHumanise(s) }}</option>
            </select>
            <select v-model="filters.kind" class="omni-select auto" aria-label="Kind">
                <option value="">Any kind</option>
                <option v-for="k in KINDS" :key="k" :value="k">{{ omniHumanise(k) }}</option>
            </select>
            <label class="omni-check"><input v-model="mine" type="checkbox" /> Only those that involve you</label>
            <span class="summary"><b>{{ all.items.value.length }}</b> shown</span>
            <div class="grow"></div>
            <button v-if="activeCount" class="omni-btn ghost sm" type="button" @click="reset()">Clear filters</button>
        </div>
        <OmniscienceV3Panel title="Everything recorded" flush :loading="all.loading.value" :error="all.error.value" :has-data="all.items.value.length > 0" :empty="!all.items.value.length"
                            :empty-kind="activeCount ? 'filtered' : 'empty'" empty-title="No plans recorded" @retry="all.reload()">
            <OmniscienceV3PlanList :plans="all.items.value" testid="agenda-all" />
            <template v-if="all.hasMore.value" #footer>
                <button class="omni-btn sm" type="button" :disabled="all.loadingMore.value" @click="all.loadMore()">{{ all.loadingMore.value ? 'Loading…' : 'Load more' }}</button>
            </template>
        </OmniscienceV3Panel>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { omniGet } from '~/scripts/omniscience/api';
import type { AgendaDto, PlanItemDto, PlanPageDto, ReadModelDto } from '~/scripts/omniscience/contracts';
import { omniCount } from '~/scripts/omniscience/format';
import { omniHumanise } from '~/scripts/omniscience/findings';
import { useOmniDebounced, useOmniPaged, useOmniResource, useOmniTime } from '~/composables/useOmniscienceV3';
import { useOmniUrlState } from '~/composables/useOmniscienceV3';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Agenda' });

const STATUSES = ['upcoming', 'due', 'overdue', 'recurring', 'undated', 'kept', 'past', 'cancelled'];
const KINDS = ['plan', 'promise', 'date', 'birthday'];

const { age } = useOmniTime();
const { state: filters, reset, activeCount } = useOmniUrlState({ status: '', kind: '', mine: '' });
const mine = computed({ get: () => filters.mine === '1', set: (on: boolean) => { filters.mine = on ? '1' : ''; } });

const agenda = useOmniResource(async signal => {
    const rm = await omniGet<ReadModelDto>('knowledge/agenda', {}, signal);
    return rm.body as AgendaDto;
}, { pollMs: 120_000 });
const a = computed(() => agenda.data.value);

const all = useOmniPaged<PlanItemDto, string>((cursor, signal) =>
    omniGet<PlanPageDto>('knowledge/plans', { status: filters.status, kind: filters.kind, klivesOnly: filters.mine === '1' ? true : null, cursor, limit: 100 }, signal));
useOmniDebounced(() => `${filters.status}|${filters.kind}|${filters.mine}`, () => { void all.reload(); }, 50);

function refresh() { void agenda.refresh(); void all.reload(); }
</script>

<style scoped>
.omni-grid.two { margin: var(--omni-gutter) 0; }
.omni-filterbar { margin-top: var(--omni-gutter); }
</style>
