<template>
    <div></div>
</template>

<script setup lang="ts">
// The dossier is a view of the Omniscience console now; links to the old page keep working.
const route = useRoute();
const OLD_DOSSIER_TABS: Record<string, string> = {
    Activity: 'activity', Timeline: 'activity', Knowledge: 'knowledge', Relationships: 'circle', Contexts: 'profile', Profile: 'profile', Notes: 'notes', Replica: 'replica',
};
const id = String(route.query.personId ?? '');
const tab = OLD_DOSSIER_TABS[String(route.query.tab ?? '')];
await navigateTo({ path: '/omniscience', query: id ? { view: 'person', id, ...(tab ? { tab } : {}) } : { view: 'people' } }, { replace: true });
</script>
