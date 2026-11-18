<template>
    <!-- omxMarkdown escapes the text before it adds any tag, so this is safe to set as HTML. -->
    <div class="omx-md" v-html="html"></div>
</template>

<script setup lang="ts">
import { omxMarkdown } from '~/scripts/omniscienceConsole';

/** Model-written markdown (the briefing, dossiers, answers) as readable text. */
const props = defineProps<{ source: string | null | undefined }>();
const html = computed(() => omxMarkdown(props.source));
</script>
