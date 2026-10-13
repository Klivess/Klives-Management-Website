<template>
    <span class="kcg" :class="`kcg-${kind}`" :style="{ '--s': `${size}px` }" aria-hidden="true">
        <KliveCloudIcon :name="ICON[kind]" :size="Math.round(size * 0.56)" :stroke="size >= 48 ? 1.6 : 2" :tint="kind === 'folder' ? 0.22 : 0" />
    </span>
</template>

<script setup lang="ts">
import type { FileKind } from '~/scripts/klivecloud/shared';

/* A file's type at a glance: the kind's icon on a tile of its colour. */
const ICON: Record<FileKind, string> = {
    folder: 'folder',
    image: 'image',
    video: 'video',
    audio: 'music',
    pdf: 'file-text',
    text: 'file-text',
    code: 'code',
    archive: 'archive',
    document: 'file-text',
    spreadsheet: 'sheet',
    presentation: 'slides',
    app: 'app',
    font: 'font',
    other: 'file',
};

withDefaults(defineProps<{ kind: FileKind; size?: number }>(), { size: 28 });
</script>

<style scoped>
.kcg {
    --c: var(--ot-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: var(--s);
    height: var(--s);
    border-radius: calc(var(--s) * 0.24);
    color: var(--c);
    background: color-mix(in srgb, var(--c) 14%, transparent);
}
.kcg-folder { --c: #e0a93a; }
.kcg-image { --c: var(--ot-cat-5); }
.kcg-video { --c: var(--ot-cat-7); }
.kcg-audio { --c: #2bb987; }
.kcg-pdf { --c: var(--ot-cat-8); }
.kcg-document { --c: #5b9ff0; }
.kcg-spreadsheet { --c: var(--ot-positive); }
.kcg-presentation { --c: var(--ot-cat-2); }
.kcg-code { --c: var(--ot-info); }
.kcg-text { --c: var(--ot-text-2); }
</style>
