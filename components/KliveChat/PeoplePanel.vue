<template>
    <div class="kc-people">
        <section v-if="canModerate || canRename" class="kc-room-settings">
            <form v-if="canRename" class="kc-rename" @submit.prevent="rename">
                <input v-model="nameDraft" class="ot-input" maxlength="48" aria-label="Room name" @keydown.esc="nameDraft = roomName" />
                <button v-if="nameDraft.trim() && nameDraft.trim() !== roomName" type="submit" class="ot-btn sm">Rename</button>
            </form>
            <label v-if="canModerate" class="kc-switch">
                <input type="checkbox" :checked="locked" @change="$emit('lock', ($event.target as HTMLInputElement).checked)" />
                <span>Lock room</span>
                <small>{{ locked ? 'Only moderators can join' : 'Anyone with the link can join' }}</small>
            </label>
        </section>

        <ul class="kc-people-list">
            <li class="kc-person kc-self">
                <KliveChatAvatar :name="self.name" :size="32" :speaking="self.speaking" :guest="self.isGuest" />
                <div class="kc-person-main">
                    <div class="kc-person-name">{{ self.name }} <span class="kc-you">you</span><span v-if="self.isHost" class="kc-tag">host</span></div>
                </div>
                <div class="kc-person-state">
                    <KliveChatIcon v-if="self.screenOn" name="screen" :size="15" title="Sharing screen" />
                    <KliveChatIcon v-if="self.camOn" name="video" :size="15" />
                    <KliveChatIcon :name="self.micOn ? 'mic' : 'mic-off'" :size="15" :class="{ off: !self.micOn }" />
                </div>
            </li>

            <li v-for="peer in peers" :key="peer.id" class="kc-person" :class="{ open: openId === peer.id }">
                <button type="button" class="kc-person-row" :aria-expanded="openId === peer.id" @click="openId = openId === peer.id ? null : peer.id">
                    <KliveChatAvatar :name="peer.name" :size="32" :speaking="peer.speaking" :guest="peer.isGuest" />
                    <div class="kc-person-main">
                        <div class="kc-person-name">
                            {{ peer.name }}
                            <span v-if="peer.isGuest" class="kc-tag">guest</span>
                            <span v-if="peer.isHost" class="kc-tag">host</span>
                            <span v-else-if="peer.canModerate" class="kc-tag">mod</span>
                        </div>
                        <div class="kc-person-sub" :class="{ warn: !peer.connected || peer.media === 'failed' }">{{ subline(peer) }}</div>
                    </div>
                    <div class="kc-person-state">
                        <KliveChatIcon v-if="peer.localMute" name="volume-off" :size="15" class="off" />
                        <KliveChatIcon v-if="peer.isScreenSharing" name="screen" :size="15" />
                        <KliveChatIcon v-if="peer.hasVideo" name="video" :size="15" />
                        <KliveChatIcon :name="peer.isMuted ? 'mic-off' : 'mic'" :size="15" :class="{ off: peer.isMuted }" />
                    </div>
                </button>

                <div v-if="openId === peer.id" class="kc-person-tools">
                    <div class="kc-volume">
                        <button type="button" class="kc-mini" :title="peer.localMute ? 'Unmute for you' : 'Mute for you'" @click="$emit('local-mute', peer.id)">
                            <KliveChatIcon :name="peer.localMute ? 'volume-off' : 'volume'" :size="16" />
                        </button>
                        <input type="range" min="0" max="100" step="5" :value="Math.round(peer.volume * 100)" :aria-label="`${peer.name} volume`"
                               @input="$emit('volume', peer.id, Number(($event.target as HTMLInputElement).value) / 100)" />
                        <span class="kc-volume-value">{{ Math.round(peer.volume * 100) }}%</span>
                    </div>
                    <div v-if="canModerate && outranks(peer)" class="kc-mod">
                        <button type="button" class="ot-btn sm" :disabled="peer.isMuted" @click="$emit('moderate', peer.id, 'mute')">Mute</button>
                        <button type="button" class="ot-btn sm warn" @click="confirm(peer.id, 'kick')">{{ pending === `${peer.id}:kick` ? 'Confirm remove' : 'Remove' }}</button>
                        <button type="button" class="ot-btn sm danger" @click="confirm(peer.id, 'ban')">{{ pending === `${peer.id}:ban` ? 'Confirm ban' : 'Ban' }}</button>
                    </div>
                </div>
            </li>
        </ul>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { PeerView } from '~/scripts/klivechat/call';
import { statsLine } from '~/scripts/klivechat/format';

const props = defineProps<{
    peers: PeerView[];
    self: { name: string; isGuest: boolean; isHost: boolean; micOn: boolean; camOn: boolean; screenOn: boolean; speaking: boolean };
    myRank: number;
    canModerate: boolean;
    canRename: boolean;
    locked: boolean;
    roomName: string;
}>();
const emit = defineEmits<{
    moderate: [peerId: string, action: 'mute' | 'kick' | 'ban'];
    lock: [locked: boolean];
    rename: [name: string];
    volume: [peerId: string, volume: number];
    'local-mute': [peerId: string];
}>();

const openId = ref<string | null>(null);
const pending = ref<string | null>(null);
const nameDraft = ref(props.roomName);
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

watch(() => props.roomName, name => { nameDraft.value = name; });

/** Mirrors the server's rule (it has the final say): guests always, profiles only when ranked below you. */
function outranks(peer: PeerView) {
    return peer.isGuest || props.myRank > peer.rank;
}

function subline(peer: PeerView): string {
    if (!peer.connected) return 'Reconnecting…';
    if (peer.media === 'failed') return 'No connection';
    if (peer.media === 'connecting') return 'Connecting…';
    return statsLine(peer.stats) ?? 'Connected';
}

function confirm(peerId: string, action: 'kick' | 'ban') {
    const key = `${peerId}:${action}`;
    if (pending.value === key) {
        pending.value = null;
        emit('moderate', peerId, action);
        return;
    }
    pending.value = key;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => { pending.value = null; }, 3500);
}

function rename() {
    const name = nameDraft.value.trim();
    if (name && name !== props.roomName) emit('rename', name);
}
</script>

<style scoped>
.kc-people { display: flex; flex-direction: column; min-height: 0; height: 100%; overflow-y: auto; scrollbar-width: thin; }
.kc-room-settings { display: flex; flex-direction: column; gap: var(--ot-space-3); padding: var(--ot-space-3) var(--ot-space-4); border-bottom: 1px solid var(--ot-line); }
.kc-rename { display: flex; gap: var(--ot-space-2); }
.kc-switch { display: grid; grid-template-columns: auto 1fr; column-gap: var(--ot-space-2); align-items: center; font-size: 13px; cursor: pointer; }
.kc-switch small { grid-column: 2; color: var(--ot-muted); font-size: 11.5px; }
.kc-people-list { list-style: none; margin: 0; padding: var(--ot-space-2); display: flex; flex-direction: column; gap: 2px; }
.kc-person { border-radius: var(--ot-radius); }
.kc-person.open { background: var(--ot-surface-2); }
.kc-self { display: flex; align-items: center; gap: var(--ot-space-3); padding: 8px; }
.kc-person-row {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: flex-start;
    gap: var(--ot-space-3);
    padding: 8px;
    border: 0;
    border-radius: var(--ot-radius);
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
}
.kc-person-row:hover { background: var(--ot-surface-2); }
.kc-person-main { flex: 1 1 auto; min-width: 0; }
.kc-person-name { display: flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 550; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.kc-you { color: var(--ot-muted); font-weight: 400; font-size: 12px; }
.kc-person-sub { font-size: 11.5px; color: var(--ot-muted); font-family: var(--ot-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kc-person-sub.warn { color: var(--ot-warning); font-family: inherit; }
.kc-person-state { display: flex; align-items: center; gap: 6px; color: var(--ot-text-2); }
.kc-person-state .off { color: var(--ot-negative); }
.kc-tag { font-size: 10px; line-height: 14px; padding: 0 5px; border-radius: 4px; color: var(--ot-muted); border: 1px solid var(--ot-line-strong); font-weight: 500; }
.kc-person-tools { display: flex; flex-direction: column; gap: var(--ot-space-2); padding: 0 8px 10px 52px; }
.kc-volume { display: flex; align-items: center; gap: var(--ot-space-2); }
.kc-volume input { flex: 1 1 auto; accent-color: var(--ot-accent); }
.kc-volume-value { width: 38px; text-align: right; font-size: 11.5px; font-family: var(--ot-mono); color: var(--ot-muted); }
.kc-mini { display: inline-flex; padding: 4px; border: 0; border-radius: var(--ot-radius-sm); background: none; color: var(--ot-text-2); cursor: pointer; }
.kc-mini:hover { color: var(--ot-text); background: var(--ot-surface-3); }
.kc-mod { display: flex; gap: var(--ot-space-2); flex-wrap: wrap; }
</style>
