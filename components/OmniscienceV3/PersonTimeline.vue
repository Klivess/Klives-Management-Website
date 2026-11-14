<template>
    <div data-testid="person-timeline">
        <OmniscienceV3Panel title="Life timeline" flush :loading="timeline.loading.value" :error="timeline.error.value" :has-data="!!timeline.data.value"
                            :empty="!!timeline.data.value && !timeline.data.value.events.length" empty-title="No dated events yet"
                            empty-text="Events come from dated facts: a move, a new job, a birthday. Each one keeps the range it could have happened in." what="The timeline" @retry="timeline.refresh()">
            <ol v-if="timeline.data.value" class="events">
                <li v-for="e in timeline.data.value.events" :key="e.eventId">
                    <span class="when">{{ range(e) }}<span class="omni-muted"> · to the {{ e.precision }}</span></span>
                    <span class="what"><strong>{{ e.title }}</strong>
                        <span class="sub">{{ omniHumanise(e.category) }} · confidence {{ omniPercent(e.probability) }} · {{ e.evidenceCount }} message{{ e.evidenceCount === 1 ? '' : 's' }}</span></span>
                    <button class="ot-btn ghost sm" type="button" @click="openFact = e.assertionId">The fact behind it</button>
                </li>
            </ol>
            <template v-if="timeline.data.value && timeline.data.value.totalEvents > timeline.data.value.events.length" #footer>
                <span class="omni-muted">Showing {{ timeline.data.value.events.length }} of {{ omniCount(timeline.data.value.totalEvents) }} events.</span>
            </template>
        </OmniscienceV3Panel>

        <OmniscienceV3Panel title="Plans, promises and dates" flush :loading="plans.loading.value" :error="plans.error.value" :has-data="plans.items.value.length > 0"
                            :empty="!plans.items.value.length" empty-title="No plans recorded" @retry="plans.reload()">
            <OmniscienceV3PlanList :plans="plans.items.value" testid="person-plans" />
            <template v-if="plans.hasMore.value" #footer>
                <button class="ot-btn sm" type="button" :disabled="plans.loadingMore.value" @click="plans.loadMore()">{{ plans.loadingMore.value ? 'Loading…' : 'Load more' }}</button>
            </template>
        </OmniscienceV3Panel>

        <OmniscienceV3FactDrawer :assertion-id="openFact" :can-review="canReview" @close="openFact = null" @changed="refresh()" />
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { omniGet } from '~/scripts/omniscience/api';
import type { LifeEventDto, LifeTimelineDto, PlanItemDto, PlanPageDto, ReadModelDto } from '~/scripts/omniscience/contracts';
import { omniCount, omniPercent } from '~/scripts/omniscience/format';
import { omniHumanise } from '~/scripts/omniscience/findings';
import { useOmniPaged, useOmniResource, useOmniTime } from '~/composables/useOmniscienceV3';

/** A person's dated life events (with the range each could have happened in) and their plans. */
const props = defineProps<{ personId: string; canReview: boolean }>();

const { at } = useOmniTime();
const openFact = ref<string | null>(null);

const timeline = useOmniResource(async signal => {
    const rm = await omniGet<ReadModelDto>('knowledge/timeline', { person: props.personId }, signal);
    return rm.body as LifeTimelineDto;
});
const plans = useOmniPaged<PlanItemDto, string>((cursor, signal) => omniGet<PlanPageDto>('knowledge/plans', { person: props.personId, cursor, limit: 50 }, signal));

function refresh() { void timeline.refresh(); void plans.reload(); }
defineExpose({ refresh });

/** An event is only as exact as its evidence: the range is shown at the precision the evidence gives. */
function range(e: LifeEventDto): string {
    const cut = e.precision === 'year' ? 4 : e.precision === 'month' ? 7 : 10;
    const from = e.earliestMs ?? e.midpointMs ?? e.latestMs;
    const to = e.latestMs ?? e.midpointMs ?? e.earliestMs;
    if (from === null || from === undefined || to === null || to === undefined) return 'undated';
    const a = at(from).slice(0, cut), b = at(to).slice(0, cut);
    return a === b ? a : `${a} – ${b}`;
}
</script>

<style scoped>
.events { list-style: none; margin: 0; padding: 0; }
.events li { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 12px; border-bottom: 1px solid var(--ot-line); font-size: 13px; }
.when { flex: 0 0 250px; font-variant-numeric: tabular-nums; }
.what { flex: 1 1 260px; min-width: 0; display: flex; flex-direction: column; }
.sub { font-size: 11.5px; color: var(--ot-muted); }
</style>
