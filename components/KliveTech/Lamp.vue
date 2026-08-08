<template>
    <!--
      A status LED. The word beside it is not optional decoration: colour alone fails
      for anyone who cannot separate the greens from the reds, and this page uses the
      lamp triad for every piece of state it reports.
    -->
    <span class="kt-lamp" :class="[tone, { pulse }]" :title="title || word">
        <span class="bulb" aria-hidden="true"></span>
        <span v-if="word" class="word">{{ word }}</span>
        <span v-else class="kt-sr">{{ tone }}</span>
    </span>
</template>

<script setup lang="ts">
import type { Tone } from '~/scripts/kliveTech';

withDefaults(defineProps<{
    tone?: Tone;
    word?: string;
    title?: string;
    /** Only while data is genuinely arriving — motion on this page means movement. */
    pulse?: boolean;
}>(), { tone: 'idle' });
</script>
