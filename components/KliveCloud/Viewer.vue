<template>
    <div ref="root" class="kcv" role="dialog" aria-modal="true" :aria-label="item.name" tabindex="-1">
        <header class="kcv-bar">
            <KliveCloudFileGlyph :kind="item.kind" :size="28" />
            <div class="kcv-title">
                <strong>{{ item.name }}</strong>
                <span>{{ describeItem(item) }}<template v-if="item.bytes"> · {{ formatBytes(item.bytes) }}</template> · {{ formatFull(item.modified, now) }}</span>
            </div>
            <span v-if="items.length > 1" class="kcv-count">{{ index + 1 }} / {{ items.length }}</span>
            <a class="ot-btn sm kcv-download" :href="api.download(item)">
                <KliveCloudIcon name="download" :size="15" /><span class="kcv-wide">Download</span>
            </a>
            <button type="button" class="kcv-btn" :title="copied ? 'Copied' : 'Copy link'" :aria-label="copied ? 'Link copied' : 'Copy link'" @click="copy">
                <KliveCloudIcon :name="copied ? 'check' : 'link'" :size="17" />
            </button>
            <button type="button" class="kcv-btn" title="Close" aria-label="Close" @click="emit('close')">
                <KliveCloudIcon name="close" :size="19" />
            </button>
        </header>

        <div class="kcv-stage" @touchstart.passive="onTouchStart" @touchend="onTouchEnd">
            <KliveCloudPreview :key="item.key" :item="item" :code="code" variant="viewer" autoplay @zoom="zoomed = $event" />
            <button v-if="index > 0" type="button" class="kcv-nav prev" aria-label="Previous" @click="go(-1)">
                <KliveCloudIcon name="chevron-left" :size="26" />
            </button>
            <button v-if="index < items.length - 1" type="button" class="kcv-nav next" aria-label="Next" @click="go(1)">
                <KliveCloudIcon name="chevron-right" :size="26" />
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { BROWSER_IMAGES, copyText, describeItem, formatBytes, formatFull, shareApi, type ShareItem } from '~/scripts/klivecloud/shared';

/* One file at a time over the page, with the folder's other files a key press (or a swipe) away. */
const props = defineProps<{
    items: ShareItem[];
    index: number;
    code: string;
    /** The address that opens this file. */
    link: string;
    now: number | null;
}>();

const emit = defineEmits<{ close: []; go: [index: number] }>();

const root = ref<HTMLElement | null>(null);
const copied = ref(false);
const zoomed = ref(false);
const api = computed(() => shareApi(props.code, false));
const item = computed(() => props.items[props.index]);

function go(step: number) {
    const next = props.index + step;
    if (next >= 0 && next < props.items.length) emit('go', next);
}

let copiedTimer: ReturnType<typeof setTimeout> | undefined;
async function copy() {
    if (!(await copyText(props.link))) return;
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { copied.value = false; }, 1600);
}

function isTyping(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function onKey(event: KeyboardEvent) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
    // A focused player uses the arrow keys to seek.
    const onMedia = (event.target as HTMLElement | null)?.closest?.('video, audio');
    if (event.key === 'Escape') {
        event.preventDefault();
        emit('close');
    } else if (event.key === 'ArrowLeft' && !onMedia) {
        event.preventDefault();
        go(-1);
    } else if (event.key === 'ArrowRight' && !onMedia) {
        event.preventDefault();
        go(1);
    }
}

let touchX = 0;
let touchY = 0;
let touchAt = 0;
function onTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1) return;
    touchX = event.touches[0].clientX;
    touchY = event.touches[0].clientY;
    touchAt = Date.now();
}
function onTouchEnd(event: TouchEvent) {
    if (zoomed.value || !touchAt || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - touchX;
    const dy = event.changedTouches[0].clientY - touchY;
    const quick = Date.now() - touchAt < 600;
    touchAt = 0;
    if (quick && Math.abs(dx) > 56 && Math.abs(dy) < 60) go(dx < 0 ? 1 : -1);
}

// The photos either side, fetched ahead so stepping through a folder doesn't wait.
watch(() => props.index, index => {
    zoomed.value = false;
    if (!import.meta.client) return;
    for (const step of [1, -1]) {
        const near = props.items[index + step];
        if (near?.preview === 'image' && BROWSER_IMAGES.has(near.ext)) new Image().src = api.value.download(near);
    }
}, { immediate: true });

let previousOverflow = '';
onMounted(() => {
    previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    root.value?.focus({ preventScroll: true });
});

onBeforeUnmount(() => {
    document.documentElement.style.overflow = previousOverflow;
    window.removeEventListener('keydown', onKey);
    clearTimeout(copiedTimer);
});
</script>

<style scoped>
.kcv {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    flex-direction: column;
    background: rgba(5, 7, 4, 0.985);
    backdrop-filter: blur(8px);
    outline: none;
    animation: kcv-in var(--ot-normal) ease-out;
}
@keyframes kcv-in { from { opacity: 0; } }

.kcv-bar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 8px 12px 8px 16px;
    border-bottom: 1px solid var(--ot-line);
}
.kcv-title { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.kcv-title strong { font-size: 14px; font-weight: 620; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kcv-title span { font-size: 12px; color: var(--ot-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kcv-count { font-family: var(--ot-mono); font-size: 12px; color: var(--ot-text-2); white-space: nowrap; padding: 0 4px; }
.kcv-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: var(--ot-radius-sm);
    color: var(--ot-text-2);
    cursor: pointer;
}
.kcv-btn:hover { color: var(--ot-text); background: var(--ot-surface-3); }

.kcv-stage {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    padding: 20px 76px;
}
.kcv-nav {
    position: absolute;
    top: 50%;
    width: 46px;
    height: 46px;
    margin-top: -23px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--ot-text);
    background: rgba(25, 29, 22, 0.78);
    border: 1px solid var(--ot-line);
    cursor: pointer;
    z-index: 2;
    transition: background var(--ot-fast), border-color var(--ot-fast);
}
.kcv-nav:hover { background: var(--ot-surface-3); border-color: var(--ot-line-strong); }
.kcv-nav.prev { left: 16px; }
.kcv-nav.next { right: 16px; }

@media (max-width: 720px) {
    .kcv-bar { gap: 8px; padding: 6px 6px 6px 12px; }
    .kcv-wide, .kcv-count { display: none; }
    .kcv-download { width: 34px; padding: 0; }
    .kcv-stage { padding: 8px; }
    .kcv-nav { width: 38px; height: 38px; margin-top: -19px; background: rgba(8, 10, 7, 0.6); }
    .kcv-nav.prev { left: 8px; }
    .kcv-nav.next { right: 8px; }
}
@media (hover: none) and (max-width: 720px) {
    /* Swiping does this on a phone; the buttons only cover the picture. */
    .kcv-nav { display: none; }
}
</style>
