<template>
    <NuxtLink v-if="to" :to="to" class="sel-item">{{ text }}</NuxtLink>
    <span v-else class="sel-item">{{ text }}</span>
</template>

<script setup lang="ts">
import { computed, watchEffect } from 'vue';
import type { SelectionItem, SelectionKind } from '~/scripts/omniscience/contracts';
import { OMNI_NAMING, omniPersonLink, omniPlaceLink, useOmniNames } from '~/composables/useOmniscienceV3';
import { useOmniPickLabels } from '~/composables/useOmniFilters';

/**
 * One member of a set (a run's output, a cohort): a person, server or chat by name as a link to its page; anything
 * else by its label, or by what it is ("A message"). Its id is never shown: nobody can recognise one.
 */
const props = defineProps<{ kind: SelectionKind | string; item: SelectionItem }>();

const { name, want } = useOmniNames();
const { labels, want: wantPlace } = useOmniPickLabels();

watchEffect(() => {
    if (props.item.label) return;
    if (props.kind === 'Person') want([props.item.id]);
    else if (props.kind === 'Guild') wantPlace('guild', [props.item.id]);
    else if (props.kind === 'Conversation') wantPlace('conversation', [props.item.id]);
});

const to = computed(() => {
    switch (props.kind) {
        case 'Person': return omniPersonLink(props.item.id);
        case 'Guild': return omniPlaceLink('guild', props.item.id);
        case 'Conversation': return omniPlaceLink('conversation', props.item.id);
        default: return null;
    }
});

const text = computed(() => {
    const label = props.item.label?.trim();
    if (label) return label;
    switch (props.kind) {
        case 'Person': return name(props.item.id);
        case 'Guild': return labels.value[`guild:${props.item.id}`] ?? OMNI_NAMING;
        case 'Conversation': return labels.value[`conversation:${props.item.id}`] ?? OMNI_NAMING;
        case 'Message': return 'A message';
        case 'Attachment': return 'A picture or file';
        case 'Assertion': return 'A fact';
        case 'Face': return 'A face';
        case 'FaceCluster': return 'A group of faces';
        case 'TimeRange': return 'A period of time';
        case 'ExploreDrill': return 'Records from Explore';
        case 'Dataset': return 'A dataset';
        case 'Question': return 'A question';
        default: return 'An item';
    }
});
</script>

<style scoped>
a.sel-item { text-decoration: underline dotted; text-decoration-color: var(--omni-line-strong); text-underline-offset: 3px; }
a.sel-item:hover { color: var(--omni-accent); text-decoration-color: currentColor; }
</style>
