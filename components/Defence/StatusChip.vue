<template>
  <span class="odx-status" :data-tone="tone" :title="statusAbout(status || 'Normal')">
    <DefenceIcon :name="statusIcon(status)" />{{ status === 'Honeypot' ? 'Trapped' : status || 'Normal' }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { statusAbout, statusIcon, statusTone } from '~/scripts/omniDefence';

/** What has been done about an address: a glyph and the word. Normal stays quiet. */
const props = defineProps<{ status: string | null | undefined }>();
const tone = computed(() => statusTone(props.status));
</script>
