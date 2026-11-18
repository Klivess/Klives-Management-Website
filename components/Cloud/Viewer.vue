<template>
    <Teleport to="body">
        <div v-if="item" class="kcl-layer">
            <div class="kcl-viewer" role="dialog" aria-modal="true" :aria-label="item.name" data-testid="kcl-viewer" @keydown="onKey">
                <header class="kcl-viewer__bar">
                    <div class="kcl-viewer__title">
                        <CloudGlyph :kind="item.kind" :size="26" />
                        <div style="min-width: 0; display: flex; flex-direction: column">
                            <span class="kcl-viewer__name" data-testid="viewer-name">{{ item.name }}</span>
                            <span class="kcl-viewer__meta">{{ describeItem(item) }} · {{ formatBytes(item.bytes) }} · {{ formatWhen(item.modified, now) }}</span>
                        </div>
                    </div>
                    <span v-if="list.length > 1" class="kcl-viewer__count">{{ position + 1 }} / {{ list.length }}</span>
                    <button v-if="canDownload" class="kcl-btn kcl-btn--sm" data-testid="viewer-download" @click="$emit('download', item)"><KliveCloudIcon name="download" :size="14" />Download</button>
                    <button v-if="canShare" class="kcl-btn kcl-btn--sm" @click="$emit('link', item)"><KliveCloudIcon name="link" :size="14" />Share</button>
                    <button ref="closer" class="kcl-iconbtn" title="Close (Esc)" aria-label="Close" data-testid="viewer-close" @click="$emit('close')"><KliveCloudIcon name="close" :size="17" /></button>
                </header>
                <div class="kcl-viewer__stage">
                    <button class="kcl-viewer__nav" :disabled="position <= 0" aria-label="Previous (←)" @click="step(-1)"><KliveCloudIcon name="chevron-left" :size="26" /></button>
                    <div class="kcl-viewer__frame">
                        <div v-if="!ready" class="kcl-empty" style="flex: 1"><KliveCloudIcon name="refresh" :size="18" class="kcl-spin" />Opening…</div>
                        <div v-else-if="failed" class="kcl-empty" style="flex: 1">
                            <span class="kcl-empty__icon"><KliveCloudIcon name="alert" :size="18" /></span>
                            <strong>This file can't be opened here</strong>
                            <span>{{ failed }}</span>
                            <button v-if="canDownload" class="kcl-btn kcl-btn--primary" @click="$emit('download', item)"><KliveCloudIcon name="download" :size="14" />Download it</button>
                        </div>
                        <KliveCloudPreview v-else :key="item.key" :item="item" :source="source" variant="page" autoplay download-class="kcl-btn kcl-btn--primary" style="flex: 1" />
                    </div>
                    <button class="kcl-viewer__nav" :disabled="position >= list.length - 1" aria-label="Next (→)" @click="step(1)"><KliveCloudIcon name="chevron-right" :size="26" /></button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { describeItem, formatBytes, type DriveItem } from '~/scripts/klivecloud/drive';
import { formatWhen, type PreviewSource } from '~/scripts/klivecloud/shared';

/* A file shown in place: the share page's preview (image, video, audio, PDF, text, code, CSV),
   fed by this item's ticket. ← → step through the files of the list it was opened from. */
const props = defineProps<{
    item: DriveItem | null;
    list: DriveItem[];
    now: number;
    canDownload: boolean;
    canShare: boolean;
    /** Gets the item's ticket (and its neighbours'); false when there is none to be had. */
    prepare: (items: DriveItem[]) => Promise<boolean>;
    sourceFor: (item: DriveItem) => PreviewSource;
}>();
const emit = defineEmits<{ close: []; go: [item: DriveItem]; download: [item: DriveItem]; link: [item: DriveItem] }>();

const ready = ref(false);
const failed = ref('');
const closer = ref<HTMLElement | null>(null);
const position = computed(() => (props.item ? props.list.findIndex(entry => entry.key === props.item!.key) : -1));
const source = computed(() => (props.item ? props.sourceFor(props.item) : null));

watch(() => props.item?.key, async key => {
    if (!key || !props.item) return;
    ready.value = false;
    failed.value = '';
    const near = [props.item, props.list[position.value - 1], props.list[position.value + 1]].filter(Boolean) as DriveItem[];
    const ok = await props.prepare(near);
    if (props.item?.key !== key) return;
    if (!ok && !(await props.prepare([props.item]))) failed.value = 'The server could not give a link to it (the newer server may not be running yet).';
    ready.value = true;
    await nextTick();
    closer.value?.focus();
}, { immediate: true });

function step(delta: number) {
    const next = props.list[position.value + delta];
    if (next) emit('go', next);
}

function onKey(event: KeyboardEvent) {
    const typing = (event.target as HTMLElement | null)?.closest('input, textarea, select, video, audio');
    if (event.key === 'Escape') { event.preventDefault(); emit('close'); return; }
    if (typing) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
}
</script>
