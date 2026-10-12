<template>
    <div ref="root" class="kc-tile" :class="[`kind-${tile.kind}`, { speaking: tile.speaking && tile.kind === 'camera', pinned, offline: tile.status === 'offline' }]"
         @dblclick="toggleFullscreen">
        <video v-show="showVideo" ref="videoEl" class="kc-video" :class="{ mirror: tile.mirror, contain: tile.kind === 'screen' }"
               autoplay playsinline muted></video>

        <div v-if="!showVideo" class="kc-placeholder">
            <template v-if="tile.kind === 'screen'">
                <KliveChatIcon name="screen" :size="28" />
                <span>Waiting for {{ tile.isSelf ? 'your' : `${tile.name}'s` }} screen</span>
            </template>
            <KliveChatAvatar v-else :name="tile.name" :size="avatarSize" :speaking="tile.speaking" :guest="tile.isGuest" />
        </div>

        <div v-if="tile.status === 'offline' || tile.status === 'connecting'" class="kc-tile-status">
            <span class="kc-spinner" aria-hidden="true"></span>
            {{ tile.status === 'offline' ? 'Reconnecting' : 'Connecting' }}
        </div>

        <div class="kc-tile-label">
            <KliveChatIcon v-if="tile.kind === 'screen'" name="screen" :size="14" />
            <KliveChatIcon v-else-if="tile.muted" name="mic-off" :size="14" class="kc-muted-icon" />
            <span class="kc-tile-name">{{ label }}</span>
            <span v-if="tile.isGuest && tile.kind === 'camera'" class="kc-tag">guest</span>
            <KliveChatIcon v-if="tile.kind === 'screen' && tile.screenAudio" name="volume" :size="14" />
        </div>

        <span v-if="tile.quality && tile.kind === 'camera'" class="kc-quality" :class="tile.quality" :title="tile.statsText ?? undefined">
            <i></i><i></i><i></i>
            <span v-if="showStats && tile.statsText" class="kc-quality-text">{{ tile.statsText }}</span>
        </span>

        <div class="kc-tile-actions" @dblclick.stop>
            <button type="button" :title="pinned ? 'Unpin' : 'Pin'" :aria-pressed="pinned" @click.stop="$emit('pin')">
                <KliveChatIcon name="pin" :size="16" />
            </button>
            <button v-if="pipSupported && showVideo" type="button" title="Picture in picture" @click.stop="togglePip">
                <KliveChatIcon name="pip" :size="16" />
            </button>
            <button type="button" title="Full screen (double-click)" @click.stop="toggleFullscreen">
                <KliveChatIcon name="maximize" :size="16" />
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

export interface TileModel {
    key: string;
    kind: 'camera' | 'screen';
    peerId: string;
    isSelf: boolean;
    name: string;
    isGuest: boolean;
    track: MediaStreamTrack | null;
    /** The participant says this video is on and frames are arriving. */
    videoOn: boolean;
    mirror: boolean;
    muted: boolean;
    speaking: boolean;
    screenAudio: boolean;
    status: 'ok' | 'connecting' | 'offline';
    quality: 'good' | 'fair' | 'poor' | null;
    statsText: string | null;
    joinedAt: number;
}

const props = withDefaults(defineProps<{ tile: TileModel; pinned?: boolean; compact?: boolean; showStats?: boolean }>(), {
    pinned: false,
    compact: false,
    showStats: false,
});
defineEmits<{ pin: [] }>();

const root = ref<HTMLElement | null>(null);
const videoEl = ref<HTMLVideoElement | null>(null);
const pipSupported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled;

const showVideo = computed(() => !!props.tile.track && props.tile.videoOn);
const avatarSize = computed(() => (props.compact ? 44 : props.pinned ? 112 : 76));
const label = computed(() => {
    const who = props.tile.isSelf ? 'You' : props.tile.name;
    return props.tile.kind === 'screen' ? `${who}${props.tile.isSelf ? 'r' : "'s"} screen` : who;
});

watch([() => props.tile.track, videoEl], ([track, el]) => {
    if (!el) return;
    const current = el.srcObject as MediaStream | null;
    if (!track) {
        if (current) el.srcObject = null;
        return;
    }
    if (current?.getVideoTracks()[0] === track) return;
    el.srcObject = new MediaStream([track]);
    el.play().catch(() => undefined);
}, { immediate: true, flush: 'post' });

function toggleFullscreen() {
    const el = root.value;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void el.requestFullscreen?.().catch(() => undefined);
}

async function togglePip() {
    const el = videoEl.value;
    if (!el) return;
    try {
        if (document.pictureInPictureElement === el) await document.exitPictureInPicture();
        else await el.requestPictureInPicture();
    } catch { /* not allowed right now */ }
}

onBeforeUnmount(() => {
    if (videoEl.value && document.pictureInPictureElement === videoEl.value) void document.exitPictureInPicture().catch(() => undefined);
});
</script>

<style scoped>
.kc-tile {
    position: relative;
    overflow: hidden;
    border-radius: var(--ot-radius-lg);
    background: #10130e;
    border: 1px solid var(--ot-line);
    min-width: 0;
    min-height: 0;
    isolation: isolate;
    transition: border-color var(--ot-fast), box-shadow var(--ot-fast);
}
.kc-tile.speaking { border-color: var(--ot-accent); box-shadow: inset 0 0 0 1px var(--ot-accent); }
.kc-tile.offline .kc-video, .kc-tile.offline .kc-placeholder { opacity: 0.45; }
.kc-tile:fullscreen { border-radius: 0; border: 0; background: #000; }

.kc-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: #000; }
.kc-video.contain { object-fit: contain; }
.kc-video.mirror { transform: scaleX(-1); }

.kc-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ot-space-2);
    color: var(--ot-muted);
    font-size: 12.5px;
}

.kc-tile-status {
    position: absolute;
    top: var(--ot-space-2);
    left: var(--ot-space-2);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11.5px;
    color: var(--ot-warning);
    background: rgba(8, 10, 7, 0.78);
}
.kc-spinner {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid currentColor;
    border-right-color: transparent;
    animation: kc-spin 0.9s linear infinite;
}
@keyframes kc-spin { to { transform: rotate(360deg); } }

.kc-tile-label {
    position: absolute;
    left: var(--ot-space-2);
    bottom: var(--ot-space-2);
    max-width: calc(100% - 16px);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-radius: var(--ot-radius-sm);
    background: rgba(8, 10, 7, 0.72);
    color: var(--ot-text);
    font-size: 12.5px;
    line-height: 18px;
    backdrop-filter: blur(4px);
}
.kc-tile-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kc-muted-icon { color: var(--ot-negative); }
.kc-tag {
    font-size: 10px;
    line-height: 14px;
    padding: 0 5px;
    border-radius: 4px;
    color: var(--ot-muted);
    border: 1px solid var(--ot-line-strong);
}

.kc-quality {
    position: absolute;
    right: var(--ot-space-2);
    bottom: var(--ot-space-2);
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: 22px;
    padding: 4px 6px;
    border-radius: var(--ot-radius-sm);
    background: rgba(8, 10, 7, 0.72);
}
.kc-quality i { display: block; width: 3px; border-radius: 1px; background: var(--ot-disabled); }
.kc-quality i:nth-child(1) { height: 5px; }
.kc-quality i:nth-child(2) { height: 9px; }
.kc-quality i:nth-child(3) { height: 13px; }
.kc-quality.good i { background: var(--ot-positive); }
.kc-quality.fair i:nth-child(-n + 2) { background: var(--ot-warning); }
.kc-quality.poor i:nth-child(1) { background: var(--ot-negative); }
.kc-quality-text { margin-left: 6px; font-size: 11px; font-family: var(--ot-mono); color: var(--ot-text-2); align-self: center; }

.kc-tile-actions {
    position: absolute;
    top: var(--ot-space-2);
    right: var(--ot-space-2);
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity var(--ot-fast);
}
.kc-tile:hover .kc-tile-actions, .kc-tile:focus-within .kc-tile-actions, .kc-tile.pinned .kc-tile-actions { opacity: 1; }
.kc-tile-actions button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: var(--ot-radius-sm);
    background: rgba(8, 10, 7, 0.72);
    color: var(--ot-text);
    cursor: pointer;
}
.kc-tile-actions button:hover { background: rgba(30, 36, 27, 0.92); color: var(--ot-accent); }
.kc-tile-actions button[aria-pressed='true'] { color: var(--ot-accent); }
@media (hover: none) { .kc-tile-actions { opacity: 1; } }
</style>
