<template>
    <div class="kc-prejoin">
        <div class="kc-prejoin-card">
            <div class="kc-preview">
                <video v-show="camOn && camTrack" ref="videoEl" :class="{ mirror }" autoplay playsinline muted></video>
                <div v-if="!camOn || !camTrack" class="kc-preview-empty">
                    <KliveChatAvatar :name="displayName || 'Guest'" :size="88" :guest="!signedIn" />
                </div>
                <div class="kc-preview-bar">
                    <button type="button" class="kc-round" :class="{ off: !micOn || !!micError }" :title="micError || (micOn ? 'Mute' : 'Unmute')" @click="$emit('toggle-mic')">
                        <KliveChatIcon :name="micOn && !micError ? 'mic' : 'mic-off'" :size="20" />
                    </button>
                    <button type="button" class="kc-round" :class="{ off: !camOn }" :title="camOn ? 'Turn camera off' : 'Turn camera on'" @click="$emit('toggle-cam')">
                        <KliveChatIcon :name="camOn ? 'video' : 'video-off'" :size="20" />
                    </button>
                </div>
                <div class="kc-preview-level" aria-hidden="true"><span :style="{ transform: `scaleX(${micOn && !micError ? Math.min(1, micLevel) : 0})` }"></span></div>
            </div>

            <form class="kc-prejoin-side" @submit.prevent="submit">
                <h1>{{ roomName || 'Room' }}</h1>
                <p class="kc-here">
                    <template v-if="here.length">
                        <span class="kc-avatars"><KliveChatAvatar v-for="name in here.slice(0, 4)" :key="name" :name="name" :size="22" /></span>
                        {{ hereText }}
                    </template>
                    <template v-else>Nobody's in the call</template>
                </p>

                <label v-if="!signedIn" class="ot-field">
                    <span class="kc-label">Name</span>
                    <input ref="nameInput" v-model="name" class="ot-input kc-name" maxlength="32" autocomplete="nickname" required />
                </label>

                <p v-if="micError" class="kc-warning"><KliveChatIcon name="alert" :size="14" /> {{ micError }} You'll join listening only.</p>
                <p v-else-if="camError" class="kc-warning"><KliveChatIcon name="alert" :size="14" /> {{ camError }}</p>
                <p v-if="locked" class="kc-warning"><KliveChatIcon name="lock" :size="14" /> Locked: only moderators can join.</p>

                <button type="submit" class="ot-btn primary kc-join" :disabled="joining || (!signedIn && !name.trim())">
                    {{ joining ? 'Joining…' : 'Join' }}
                </button>

                <div v-if="devices.mics.length > 1 || devices.cams.length > 1" class="kc-devices">
                    <select v-if="devices.mics.length > 1" class="ot-select" aria-label="Microphone" :value="prefs.micId ?? ''"
                            @change="$emit('select', 'mic', ($event.target as HTMLSelectElement).value || null)">
                        <option value="">Default microphone</option>
                        <option v-for="d in devices.mics" :key="d.id" :value="d.id">{{ d.label }}</option>
                    </select>
                    <select v-if="devices.cams.length > 1" class="ot-select" aria-label="Camera" :value="prefs.camId ?? ''"
                            @change="$emit('select', 'cam', ($event.target as HTMLSelectElement).value || null)">
                        <option value="">Default camera</option>
                        <option v-for="d in devices.cams" :key="d.id" :value="d.id">{{ d.label }}</option>
                    </select>
                </div>
            </form>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { DeviceOption } from '~/scripts/klivechat/call';
import type { ChatPrefs } from '~/scripts/klivechat/prefs';

const props = defineProps<{
    roomName: string;
    here: string[];
    signedIn: boolean;
    initialName: string;
    micOn: boolean;
    micError: string;
    micLevel: number;
    camOn: boolean;
    camTrack: MediaStreamTrack | null;
    camError: string;
    mirror: boolean;
    locked: boolean;
    joining: boolean;
    devices: { mics: DeviceOption[]; cams: DeviceOption[]; speakers: DeviceOption[] };
    prefs: ChatPrefs;
}>();
const emit = defineEmits<{
    join: [name: string];
    'toggle-mic': [];
    'toggle-cam': [];
    select: [kind: 'mic' | 'cam', id: string | null];
}>();

const name = ref(props.initialName);
const nameInput = ref<HTMLInputElement | null>(null);
const videoEl = ref<HTMLVideoElement | null>(null);
const displayName = computed(() => (props.signedIn ? props.initialName : name.value.trim()));

const hereText = computed(() => {
    const names = props.here;
    if (names.length === 1) return `${names[0]} is in the call`;
    if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are in the call`;
    return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others are in the call`;
});

watch([() => props.camTrack, videoEl], ([track, el]) => {
    if (!el) return;
    if (!track) {
        el.srcObject = null;
        return;
    }
    if ((el.srcObject as MediaStream | null)?.getVideoTracks()[0] === track) return;
    el.srcObject = new MediaStream([track]);
    el.play().catch(() => undefined);
}, { immediate: true, flush: 'post' });

function submit() {
    if (props.joining) return;
    if (!props.signedIn && !name.value.trim()) {
        nameInput.value?.focus();
        return;
    }
    emit('join', name.value.trim());
}

onMounted(() => {
    if (!props.signedIn) nameInput.value?.focus();
});
</script>

<style scoped>
.kc-prejoin { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: var(--ot-space-4); overflow-y: auto; }
.kc-prejoin-card {
    width: min(900px, 100%);
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(260px, 1fr);
    gap: var(--ot-space-6);
    align-items: center;
}
.kc-preview {
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: var(--ot-radius-lg);
    overflow: hidden;
    background: #10130e;
    border: 1px solid var(--ot-line);
}
.kc-preview video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.kc-preview video.mirror { transform: scaleX(-1); }
.kc-preview-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.kc-preview-bar { position: absolute; left: 0; right: 0; bottom: 14px; display: flex; justify-content: center; gap: var(--ot-space-3); }
.kc-round {
    width: 46px;
    height: 46px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(18, 21, 15, 0.82);
    color: var(--ot-text);
    cursor: pointer;
    backdrop-filter: blur(6px);
}
.kc-round:hover { background: rgba(32, 38, 29, 0.92); border-color: rgba(255, 255, 255, 0.28); }
.kc-round.off, .kc-round.off:hover { background: #b3322c; border-color: #b3322c; color: #fff; }
.kc-preview-level { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255, 255, 255, 0.05); }
.kc-preview-level span { display: block; height: 100%; background: var(--ot-accent); transform-origin: left; transition: transform 80ms linear; }
.kc-prejoin-side { display: flex; flex-direction: column; gap: var(--ot-space-3); min-width: 0; }
.kc-prejoin-side h1 { margin: 0; font-size: 24px; line-height: 30px; font-weight: 650; overflow-wrap: anywhere; }
.kc-here { margin: 0; display: flex; align-items: center; gap: var(--ot-space-2); color: var(--ot-text-2); font-size: 13px; }
.kc-avatars { display: inline-flex; }
.kc-avatars > * + * { margin-left: -6px; box-shadow: 0 0 0 2px var(--ot-bg); }
.kc-label { font-size: 11px; letter-spacing: 0.7px; text-transform: uppercase; color: var(--ot-muted); font-weight: 650; }
.kc-name { height: 38px; font-size: 14px; }
.kc-warning { margin: 0; display: flex; align-items: center; gap: 6px; color: var(--ot-warning); font-size: 12.5px; }
.kc-join { height: 40px; font-size: 14px; }
.kc-devices { display: flex; flex-direction: column; gap: var(--ot-space-2); }
.kc-devices .ot-select { height: 30px; font-size: 12px; color: var(--ot-text-2); }
@media (max-width: 760px) {
    .kc-prejoin { align-items: flex-start; }
    .kc-prejoin-card { grid-template-columns: minmax(0, 1fr); gap: var(--ot-space-4); }
}
</style>
