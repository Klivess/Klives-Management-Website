<template>
    <OmniTraderDrawer :open="open && !!postId" :title="detail ? `Reel by @${detail.Reel.Owner}` : 'Reel'" @close="close">
        <template #subtitle>
            <span v-if="detail">
                posted {{ fmtStamp(detail.Reel.PostedUtc) }} · downloaded {{ fmtStamp(detail.Reel.DownloadedUtc) }}
            </span>
        </template>

        <div v-if="error" class="ot-banner"><span class="glyph" aria-hidden="true">⚠</span><div>{{ error }}</div></div>
        <div v-else-if="!detail" class="ot-skelrows"><div class="ot-skel" style="height:320px"></div><div class="ot-skel"></div><div class="ot-skel" style="width:70%"></div></div>

        <template v-else>
            <div class="player">
                <video v-if="videoUrl" :src="videoUrl" controls autoplay playsinline loop class="video"></video>
                <button v-else type="button" class="poster" :disabled="detail.Reel.VideoExists === false || videoLoading" @click="playVideo">
                    <OmniTumblrThumb :path="detail.Reel.VideoExists === false ? null : reelThumbPath(detail.Reel.PostID)" kind="Video" size="lg" alt="" />
                    <span class="play" aria-hidden="true">{{ videoLoading ? '…' : '▶' }}</span>
                    <span class="playlabel">{{ detail.Reel.VideoExists === false ? 'The video file is missing on the server' : videoLoading ? 'Loading video…' : `Play${detail.Reel.Bytes ? ` (${fmtBytes(detail.Reel.Bytes)})` : ''}` }}</span>
                </button>
            </div>

            <div class="stats">
                <div class="stat"><span class="k">Views</span><span class="v">{{ fmtCount(detail.Reel.Views) }}</span></div>
                <div class="stat"><span class="k">Likes</span><span class="v">{{ detail.Reel.Likes ? fmtCount(detail.Reel.Likes) : '—' }}</span></div>
                <div class="stat"><span class="k">Comments</span><span class="v">{{ fmtCount(detail.Reel.Comments) }}</span></div>
                <div class="stat"><span class="k">Engagement</span><span class="v">{{ detail.Reel.EngagementPct != null ? `${detail.Reel.EngagementPct.toFixed(2)}%` : '—' }}</span></div>
            </div>

            <dl class="ot-kv">
                <dt>Account</dt>
                <dd>
                    <button type="button" class="ms-linkbtn" @click="$emit('source', detail.Reel.Owner)">@{{ detail.Reel.Owner }}</button>
                    <span v-if="!detail.Reel.Registered" class="ot-chip">no longer a source</span>
                </dd>
                <dt>Rank</dt>
                <dd>#{{ detail.OwnerRank.toLocaleString() }} of {{ detail.OwnerReels.toLocaleString() }} reels from @{{ detail.Reel.Owner }} by views<template v-if="detail.OwnerMedianViews != null"> · their median is {{ fmtCount(detail.OwnerMedianViews) }}</template></dd>
                <dt>Age when saved</dt>
                <dd>{{ fmtHours(detail.Reel.AgeHours) }}</dd>
                <dt>Found via</dt>
                <dd>{{ providerLabel(detail.Reel.Via ?? 'unknown') }}</dd>
                <template v-if="detail.Reel.Niches.length">
                    <dt>Niches</dt>
                    <dd class="plain">{{ detail.Reel.Niches.join(', ') }}</dd>
                </template>
                <dt>Post ID</dt>
                <dd>{{ detail.Reel.PostID }}<template v-if="detail.Reel.ShortCode"> · {{ detail.Reel.ShortCode }}</template></dd>
                <template v-if="detail.Reel.Bytes">
                    <dt>File</dt>
                    <dd>{{ fmtBytes(detail.Reel.Bytes) }}</dd>
                </template>
            </dl>

            <h4 class="ot-sectionhead">Caption</h4>
            <p v-if="detail.Reel.Description" class="caption">{{ detail.Reel.Description }}</p>
            <p v-else class="muted">No caption.</p>
        </template>

        <template #footer>
            <template v-if="detail">
                <a v-if="detail.Reel.Url" class="ot-btn sm ghost" :href="detail.Reel.Url" target="_blank" rel="noopener noreferrer">Open on Instagram ↗</a>
                <button v-if="detail.Reel.Url" class="ot-btn sm ghost" @click="copyLink">{{ copied ? 'Copied' : 'Copy link' }}</button>
                <button class="ot-btn sm" :disabled="detail.Reel.VideoExists === false || downloading" @click="download">{{ downloading ? 'Downloading…' : 'Download video' }}</button>
            </template>
        </template>
    </OmniTraderDrawer>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import {
    downloadFile, fetchBlobUrl, fmtHours, fmtStamp, msGet, providerLabel, reelThumbPath, reelVideoPath, toast, type ReelDetail,
} from '~/composables/useMemeScraper';
import { fmtBytes, fmtCount, q } from '~/composables/useOmniTumblr';

const props = defineProps<{ open: boolean; postId: string | null }>();
const emit = defineEmits<{ close: []; source: [username: string] }>();

const detail = ref<ReelDetail | null>(null);
const error = ref<string | null>(null);
const videoUrl = ref<string | null>(null);
const videoLoading = ref(false);
const downloading = ref(false);
const copied = ref(false);
let videoController: AbortController | null = null;

function releaseVideo() {
    videoController?.abort();
    videoController = null;
    if (videoUrl.value) URL.revokeObjectURL(videoUrl.value);
    videoUrl.value = null;
    videoLoading.value = false;
}

watch(() => [props.open, props.postId] as const, async ([open, postId]) => {
    releaseVideo();
    copied.value = false;
    if (!open || !postId) return;
    detail.value = null;
    error.value = null;
    const result = await msGet<ReelDetail>(`/memescraper/reel${q({ postId })}`);
    if (props.postId !== postId) return;
    if (result.ok && result.data) detail.value = result.data;
    else error.value = result.error ?? 'The reel could not be loaded.';
}, { immediate: true });

async function playVideo() {
    if (!detail.value || videoLoading.value) return;
    videoLoading.value = true;
    const controller = new AbortController();
    videoController = controller;
    const url = await fetchBlobUrl(reelVideoPath(detail.value.Reel.PostID), controller.signal);
    if (controller.signal.aborted) {
        if (url) URL.revokeObjectURL(url);
        return;
    }
    videoLoading.value = false;
    if (url) videoUrl.value = url;
    else toast('The video could not be loaded', 'error');
}

async function download() {
    if (!detail.value) return;
    downloading.value = true;
    const ok = await downloadFile(reelVideoPath(detail.value.Reel.PostID), `reel-${detail.value.Reel.Owner}-${detail.value.Reel.ShortCode ?? detail.value.Reel.PostID}.mp4`);
    downloading.value = false;
    if (!ok) toast('The video could not be downloaded', 'error');
}

async function copyLink() {
    if (!detail.value?.Reel.Url) return;
    try {
        await navigator.clipboard.writeText(detail.value.Reel.Url);
        copied.value = true;
        setTimeout(() => { copied.value = false; }, 1800);
    } catch {
        toast('Copying was blocked by the browser', 'warning');
    }
}

function close() {
    releaseVideo();
    emit('close');
}

onBeforeUnmount(releaseVideo);
</script>

<style scoped>
.player { margin-bottom: var(--ot-space-3); display: flex; justify-content: center; background: #000; border-radius: var(--ot-radius); overflow: hidden; }
.video { width: 100%; max-height: 62vh; background: #000; display: block; }
.poster { position: relative; width: min(340px, 100%); aspect-ratio: 9 / 16; max-height: 62vh; padding: 0; border: 0; background: #000; cursor: pointer; display: block; }
.poster:disabled { cursor: not-allowed; }
.poster :deep(.tb-thumb.lg) { position: absolute; inset: 0; width: 100%; height: 100%; max-height: none; aspect-ratio: auto; border: 0; border-radius: 0; }
.poster :deep(.tb-thumb.lg img) { object-fit: cover; }
.play {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: 58px; height: 58px; border-radius: 50%; display: grid; place-items: center;
    background: rgba(0, 0, 0, 0.6); border: 2px solid rgba(255, 255, 255, 0.85); color: #fff; font-size: 22px;
}
.poster:hover:not(:disabled) .play { background: var(--ot-accent); color: var(--ot-on-accent); border-color: var(--ot-accent); }
.playlabel { position: absolute; left: 0; right: 0; bottom: 10px; text-align: center; color: #fff; font-size: 12px; text-shadow: 0 1px 3px #000; }
.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--ot-space-2); margin-bottom: var(--ot-space-3); }
.stat { display: flex; flex-direction: column; padding: var(--ot-space-2); border: 1px solid var(--ot-line); border-radius: var(--ot-radius-sm); }
.stat .k { font-size: 10.5px; letter-spacing: 0.7px; text-transform: uppercase; color: var(--ot-muted); font-weight: 650; }
.stat .v { font-family: var(--ot-mono); font-size: 17px; font-weight: 650; }
.ot-kv dd.plain { font-family: inherit; }
.ot-sectionhead { margin-top: var(--ot-space-4); }
.caption { margin: 0; font-size: 13px; line-height: 19px; color: var(--ot-text-2); white-space: pre-line; overflow-wrap: anywhere; }
@media (max-width: 520px) {
    .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
