<template>
    <div class="kc-menu" role="menu" :aria-label="title" @keydown.esc.stop="$emit('close')">
        <template v-if="kind === 'audio'">
            <div class="kc-menu-head">Microphone</div>
            <button v-for="option in withDefault(devices.mics)" :key="option.id ?? 'default'" type="button" role="menuitemradio"
                    :aria-checked="prefs.micId === option.id" @click="$emit('select', 'mic', option.id)">
                <KliveChatIcon name="check" :size="14" :class="{ hidden: prefs.micId !== option.id }" />
                <span>{{ option.label }}</span>
            </button>
            <div class="kc-level" :class="{ quiet: !micOn }" aria-hidden="true"><span :style="{ transform: `scaleX(${Math.min(1, level)})` }"></span></div>

            <template v-if="canPickSpeaker && devices.speakers.length">
                <div class="kc-menu-head">Speaker</div>
                <button v-for="option in withDefault(devices.speakers)" :key="option.id ?? 'default'" type="button" role="menuitemradio"
                        :aria-checked="prefs.speakerId === option.id" @click="$emit('select', 'speaker', option.id)">
                    <KliveChatIcon name="check" :size="14" :class="{ hidden: prefs.speakerId !== option.id }" />
                    <span>{{ option.label }}</span>
                </button>
            </template>

            <div class="kc-menu-sep"></div>
            <label class="kc-menu-check">
                <input type="checkbox" :checked="prefs.noiseSuppression" @change="pref('noiseSuppression', $event)" />
                <span>Noise suppression</span>
            </label>
            <label class="kc-menu-check">
                <input type="checkbox" :checked="prefs.pushToTalk" @change="pref('pushToTalk', $event)" />
                <span>Push to talk</span><kbd>Space</kbd>
            </label>
        </template>

        <template v-else-if="kind === 'video'">
            <div class="kc-menu-head">Camera</div>
            <button v-for="option in withDefault(devices.cams)" :key="option.id ?? 'default'" type="button" role="menuitemradio"
                    :aria-checked="prefs.camId === option.id" @click="$emit('select', 'cam', option.id)">
                <KliveChatIcon name="check" :size="14" :class="{ hidden: prefs.camId !== option.id }" />
                <span>{{ option.label }}</span>
            </button>
            <div class="kc-menu-sep"></div>
            <label class="kc-menu-check">
                <input type="checkbox" :checked="prefs.mirrorSelf" @change="pref('mirrorSelf', $event)" />
                <span>Mirror my video</span>
            </label>
        </template>

        <template v-else>
            <div class="kc-menu-head">Call</div>
            <label class="kc-menu-check">
                <input type="checkbox" :checked="prefs.smoothScreenShare" @change="pref('smoothScreenShare', $event)" />
                <span>Smooth screen share</span><small>motion over sharpness</small>
            </label>
            <label class="kc-menu-check">
                <input type="checkbox" :checked="prefs.showStats" @change="pref('showStats', $event)" />
                <span>Connection stats on tiles</span>
            </label>
            <div class="kc-menu-head">When joining</div>
            <label class="kc-menu-check">
                <input type="checkbox" :checked="prefs.joinMuted" @change="pref('joinMuted', $event)" />
                <span>Start muted</span>
            </label>
            <label class="kc-menu-check">
                <input type="checkbox" :checked="prefs.joinWithCamera" @change="pref('joinWithCamera', $event)" />
                <span>Start with camera on</span>
            </label>
            <div class="kc-menu-sep"></div>
            <div class="kc-keys">
                <span><kbd>M</kbd> mic</span><span><kbd>V</kbd> camera</span><span v-if="canShareScreen"><kbd>S</kbd> screen</span>
                <span><kbd>C</kbd> chat</span><span><kbd>P</kbd> people</span>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DeviceOption } from '~/scripts/klivechat/call';
import type { ChatPrefs } from '~/scripts/klivechat/prefs';

const props = defineProps<{
    kind: 'audio' | 'video' | 'settings';
    devices: { mics: DeviceOption[]; cams: DeviceOption[]; speakers: DeviceOption[] };
    prefs: ChatPrefs;
    level: number;
    micOn: boolean;
    canPickSpeaker: boolean;
    canShareScreen: boolean;
}>();
const emit = defineEmits<{
    select: [kind: 'mic' | 'cam' | 'speaker', id: string | null];
    pref: [key: keyof ChatPrefs, value: boolean];
    close: [];
}>();

const title = computed(() => ({ audio: 'Audio settings', video: 'Camera settings', settings: 'Call settings' })[props.kind]);

function withDefault(options: DeviceOption[]): { id: string | null; label: string }[] {
    return [{ id: null, label: 'System default' }, ...options];
}

function pref(key: keyof ChatPrefs, event: Event) {
    emit('pref', key, (event.target as HTMLInputElement).checked);
}
</script>

<style scoped>
.kc-menu {
    width: min(320px, calc(100vw - 24px));
    max-height: min(70vh, 520px);
    overflow-y: auto;
    padding: 6px;
    border-radius: var(--ot-radius-lg);
    border: 1px solid var(--ot-line-strong);
    background: var(--ot-surface-2);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
    font-size: 13px;
    scrollbar-width: thin;
}
.kc-menu-head { padding: 8px 10px 4px; font-size: 10.5px; letter-spacing: 0.8px; text-transform: uppercase; color: var(--ot-muted); font-weight: 650; }
.kc-menu > button {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    padding: 7px 10px;
    border: 0;
    border-radius: var(--ot-radius-sm);
    background: none;
    color: var(--ot-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
}
.kc-menu > button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kc-menu > button:hover { background: var(--ot-surface-3); }
.kc-menu > button[aria-checked='true'] { color: var(--ot-accent); }
.hidden { visibility: hidden; }
.kc-level { height: 4px; margin: 6px 10px 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.07); overflow: hidden; }
.kc-level span { display: block; height: 100%; background: var(--ot-accent); transform-origin: left; transition: transform 80ms linear; }
.kc-level.quiet span { background: var(--ot-muted); }
.kc-menu-sep { height: 1px; margin: 6px 4px; background: var(--ot-line); }
.kc-menu-check { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: var(--ot-radius-sm); cursor: pointer; }
.kc-menu-check:hover { background: var(--ot-surface-3); }
.kc-menu-check input { accent-color: var(--ot-accent); }
.kc-menu-check small { margin-left: auto; color: var(--ot-muted); font-size: 11px; }
kbd {
    margin-left: auto;
    padding: 0 5px;
    border-radius: 4px;
    border: 1px solid var(--ot-line-strong);
    font-family: var(--ot-mono);
    font-size: 10.5px;
    color: var(--ot-text-2);
}
.kc-keys { display: flex; flex-wrap: wrap; gap: 6px 12px; padding: 6px 10px 8px; color: var(--ot-muted); font-size: 11.5px; }
.kc-keys kbd { margin: 0 4px 0 0; }
</style>
