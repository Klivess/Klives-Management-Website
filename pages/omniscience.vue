<template>
    <div class="omx" data-testid="omx">
        <OmniscienceTopBar />
        <div class="omx-body">
            <OmniscienceBrief v-if="omx.view.value === 'brief'" />
            <OmnisciencePeople v-else-if="omx.view.value === 'people'" :key="`people-${omx.navSeq.value}`" />
            <OmniscienceDossier v-else-if="omx.view.value === 'person'" :key="`person-${omx.personId.value}`" />
            <OmniscienceAsk v-else-if="omx.view.value === 'ask'" :key="`ask-${omx.navSeq.value}`" />
            <OmniscienceReview v-else-if="omx.view.value === 'review'" />
            <OmniscienceTalk v-else-if="omx.view.value === 'talk'" />
            <OmniscienceEngine v-else />
        </div>
        <OmniscienceLayer />
    </div>
</template>

<script setup lang="ts">
import { OMX_VIEWS } from '~/scripts/omniscienceConsole';

/**
 * The Omniscience console: one page, its views chosen by `?view=`. The old separate pages
 * (person, review, search, explore) redirect here, so every link that was ever shared still lands.
 * State and polling live in useOmniscienceConsole; this file only puts the pieces on the screen.
 */
definePageMeta({ layout: 'navbar' });

const omx = useOmniscienceConsole();
useHead({
    title: computed(() => {
        const view = omx.view.value === 'person' ? 'Dossier' : OMX_VIEWS.find(v => v.id === omx.view.value)?.label ?? 'Brief';
        return `Omniscience · ${view}`;
    }),
});
</script>

<style lang="scss" src="~/assets/scss/omniscience-console.scss"></style>
