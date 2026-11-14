<template>
  <div class="pfx-empty" role="note" style="min-height: 64px">
    <PeopleIcon name="lock" />
    <span>Needs “{{ need.title }}”<span v-if="need.tier" class="pfx-tier" :data-tier="need.tierValue ?? undefined" style="margin-left: 6px">{{ need.tier }}</span></span>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { usePermissionCatalog } from '~/composables/useAccess';

/** A part of the page this profile may not see: says which permission it would take. */
const props = defineProps<{ perm: string }>();
const catalog = usePermissionCatalog();
const need = computed(() => catalog.describe(props.perm));
onMounted(() => { void catalog.load(); });
</script>
