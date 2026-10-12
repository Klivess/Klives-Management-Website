<template>
    <span class="kc-avatar" :class="{ speaking, guest }" :style="{ '--hue': hue, '--size': `${size}px` }" :title="name">{{ letters }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { avatarHue, initials } from '~/scripts/profileFormat';

const props = withDefaults(defineProps<{ name: string; size?: number; speaking?: boolean; guest?: boolean }>(), { size: 32 });
const hue = computed(() => avatarHue(props.name.toLowerCase()));
const letters = computed(() => initials(props.name));
</script>

<style scoped>
.kc-avatar {
    width: var(--size);
    height: var(--size);
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: hsl(var(--hue) 34% 26%);
    color: hsl(var(--hue) 60% 86%);
    font-size: calc(var(--size) * 0.38);
    font-weight: 650;
    letter-spacing: 0.02em;
    line-height: 1;
    user-select: none;
    box-shadow: 0 0 0 0 transparent;
    transition: box-shadow 120ms ease;
}
.kc-avatar.guest { background: hsl(var(--hue) 10% 24%); color: hsl(var(--hue) 12% 82%); }
.kc-avatar.speaking { box-shadow: 0 0 0 2px var(--ot-bg), 0 0 0 4px var(--ot-accent); }
</style>
