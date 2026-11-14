<template>
    <div class="ev">
        <span class="omni-muted meta">
            <NuxtLink v-if="evidence.authorPersonId" :to="`${OMNI_BASE}/people/${encodeURIComponent(evidence.authorPersonId)}`">{{ name(evidence.authorPersonId) }}</NuxtLink>
            <template v-else>{{ evidence.kind === 'fact' ? 'a recorded fact' : 'someone' }}</template>
            · <OmniscienceV3Time :ms="evidence.atMs" mode="absolute" />
            <template v-if="evidence.where"> · {{ evidence.where }}</template>
            <span class="ot-chip sm" :title="'How much weight this kind of evidence carries'">{{ sourceKindLabel(evidence.reliability) }}</span>
            <span v-if="evidence.facet" class="ot-chip sm">{{ evidence.facet }}</span>
        </span>
        <q>{{ evidence.quote }}</q>
    </div>
</template>

<script setup lang="ts">
import { OMNI_BASE } from '~/scripts/omniscience/api';
import type { InquiryEvidenceDto } from '~/scripts/omniscience/contracts';
import { watchEffect } from 'vue';
import { sourceKindLabel } from '~/scripts/omniscience/knowledge';
import { useOmniNames } from '~/composables/useOmniscienceV3';

/** One piece of evidence in an answer: who said it, when and where, how reliable that kind of statement is, and their words. */
const props = defineProps<{ evidence: InquiryEvidenceDto }>();
const { want, name } = useOmniNames();
watchEffect(() => want([props.evidence.authorPersonId]));
</script>

<style scoped>
.ev { display: flex; flex-direction: column; gap: 3px; font-size: 13px; }
.meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 12px; }
q { font-style: italic; overflow-wrap: anywhere; }
</style>
