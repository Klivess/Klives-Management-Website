<template>
    <span class="kcl-glyph" :data-kind="kind" :style="{ '--s': `${size}px` }" aria-hidden="true">
        <KliveCloudIcon :name="ICON[kind] ?? 'file'" :size="Math.round(size * 0.54)" :stroke="size >= 48 ? 1.6 : 2" :tint="kind === 'folder' ? 0.22 : 0" />
    </span>
</template>

<script setup lang="ts">
import type { FileKind } from '~/scripts/klivecloud/shared';

/* What a file is, at a glance: the kind's icon on a tile of its colour (colours in klivecloud.scss). */
const ICON: Record<FileKind, string> = {
    folder: 'folder', image: 'image', video: 'video', audio: 'music', pdf: 'file-text', text: 'file-text', code: 'code',
    archive: 'archive', document: 'file-text', spreadsheet: 'sheet', presentation: 'slides', app: 'app', font: 'font', other: 'file',
};

withDefaults(defineProps<{ kind: FileKind; size?: number }>(), { size: 28 });
</script>
