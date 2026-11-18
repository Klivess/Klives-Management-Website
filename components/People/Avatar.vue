<template>
  <span class="pfx-avatar" :data-owner="owner || undefined" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.38)}px`, '--hue': hue }" :title="title">
    {{ letters }}
    <span v-if="presence" class="pfx-avatar__presence" :data-presence="presence"></span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { avatarHue, initials } from '~/scripts/profileFormat';

/** Initials on the profile's own hue (stable everywhere), the owner in violet, presence as a dot. */
const props = withDefaults(defineProps<{ name: string; id: string; owner?: boolean; presence?: 'online' | 'idle' | 'offline' | ''; size?: number; title?: string }>(), {
  owner: false, presence: '', size: 32, title: undefined,
});
const letters = computed(() => initials(props.name));
const hue = computed(() => avatarHue(props.id));
</script>
