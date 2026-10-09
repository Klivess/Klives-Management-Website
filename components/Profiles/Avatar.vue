<template>
    <span class="km-avatar" :class="{ owner }" :style="{ '--hue': avatarHue(id || name), '--size': `${size}px` }"
          :title="title" role="img" :aria-label="title">
        {{ initials(name) }}
        <span v-if="presence" class="km-dot" :class="presence" aria-hidden="true"></span>
    </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { avatarHue, initials } from '~/scripts/profileFormat';

const props = withDefaults(defineProps<{
    name: string;
    id?: string | null;
    owner?: boolean;
    /** online | idle | offline — omit to show no dot. */
    presence?: 'online' | 'idle' | 'offline' | null;
    size?: number;
}>(), { owner: false, size: 32, presence: null, id: null });

const title = computed(() => `${props.name}${props.owner ? ' (owner)' : ''}${props.presence ? ` · ${props.presence}` : ''}`);
</script>
