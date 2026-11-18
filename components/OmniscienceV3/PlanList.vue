<template>
    <ul class="plans" :data-testid="testid">
        <li v-for="p in plans" :key="p.planId" :class="planTone(p.status)">
            <span class="when">
                <template v-if="when(p) !== null">
                    <OmniscienceV3Time :ms="when(p)" mode="absolute" /><span v-if="p.allDay" class="omni-muted"> · all day</span>
                    <span class="omni-muted rel"> · {{ age(when(p)) }}</span>
                </template>
                <span v-else class="omni-muted">no date</span>
            </span>
            <span class="what">
                <strong>{{ p.title }}</strong>
                <span class="sub">
                    <NuxtLink :to="personLink(p.ownerPersonId)">{{ name(p.ownerPersonId) }}</NuxtLink>
                    <template v-if="p.counterpartyPersonId"> with <NuxtLink :to="personLink(p.counterpartyPersonId)">{{ name(p.counterpartyPersonId) }}</NuxtLink></template>
                    · {{ p.evidenceCount }} message{{ p.evidenceCount === 1 ? '' : 's' }}{{ p.recurrence ? ` · repeats ${p.recurrence}` : '' }}
                </span>
            </span>
            <span class="omni-chip sm">{{ planKindLabel(p) }}</span>
            <span v-if="p.firmness !== 'firm'" class="omni-chip sm warn" title="How definite the plan sounded">{{ p.firmness }}</span>
            <span class="omni-chip sm" :class="planTone(p.status)">{{ p.status }}</span>
        </li>
    </ul>
</template>

<script setup lang="ts">
import { OMNI_BASE } from '~/scripts/omniscience/api';
import type { PlanItemDto } from '~/scripts/omniscience/contracts';
import { planKindLabel, planTone } from '~/scripts/omniscience/knowledge';
import { watchEffect } from 'vue';
import { useOmniNames, useOmniTime } from '~/composables/useOmniscienceV3';

/** Plans, promises and dates as one list: when, what, between whom, and how definite it sounded. */
const props = withDefaults(defineProps<{ plans: PlanItemDto[]; testid?: string }>(), { testid: 'plan-list' });

const { age } = useOmniTime();
const { want, name } = useOmniNames();
watchEffect(() => want(props.plans.flatMap(p => [p.ownerPersonId, p.counterpartyPersonId])));

function when(p: PlanItemDto): number | null { return p.nextOccurrenceMs ?? p.scheduledEarliestMs ?? null; }
function personLink(id: string): string { return `${OMNI_BASE}/people/${encodeURIComponent(id)}`; }
</script>

<style scoped>
.plans { list-style: none; margin: 0; padding: 0; }
.plans li { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 12px; border-bottom: 1px solid var(--omni-line); font-size: 13px; }
.plans li.bad { box-shadow: inset 2px 0 0 var(--omni-negative); }
.plans li.warn { box-shadow: inset 2px 0 0 var(--omni-warning); }
.when { flex: 0 0 230px; font-variant-numeric: tabular-nums; }
.what { flex: 1 1 280px; min-width: 0; display: flex; flex-direction: column; }
.sub { font-size: 11.5px; color: var(--omni-muted); }
@media (max-width: 768px) { .when { flex-basis: 100%; } }
</style>
