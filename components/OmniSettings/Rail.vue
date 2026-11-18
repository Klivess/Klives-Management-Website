<template>
  <nav class="ost-rail" aria-label="Services">
    <div class="ost-rail__head"><span>Services</span><span>{{ groups.length }}</span></div>
    <button class="ost-rail__item" type="button" :aria-current="active == null" data-testid="rail-all" @click="emit('select', null)">
      <span class="ost-rail__name">All services</span>
      <span class="ost-rail__count">{{ fmtInt(total) }}</span>
    </button>
    <div class="ost-rail__sep"></div>
    <button
      v-for="group in groups"
      :key="group.owner"
      class="ost-rail__item"
      :class="{ 'ost-rail__item--other': isNonServiceOwner(group.owner) }"
      type="button"
      :aria-current="active === group.owner"
      :title="`${group.owner}: ${group.settings.length} settings, ${group.read} read since the restart`"
      :data-testid="`rail-${group.owner}`"
      @click="emit('select', group.owner)"
    >
      <span class="ost-rail__name">{{ group.owner }}</span>
      <span v-if="group.attention" class="ost-rail__dot" :data-tone="tones[group.owner] ?? 'warn'" :aria-label="`${group.attention} need attention`"></span>
      <span class="ost-rail__count">{{ group.settings.length }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { fmtInt } from '~/scripts/adminConsole';
import { isNonServiceOwner, type ServiceGroup } from '~/scripts/settingsConsole';

/* Every owner of a setting, with how many it has. Picking one narrows the page to it. */
defineProps<{ groups: ServiceGroup[]; active: string | null; total: number; tones: Record<string, 'crit' | 'warn' | 'info'> }>();
const emit = defineEmits<{ select: [owner: string | null] }>();
</script>
