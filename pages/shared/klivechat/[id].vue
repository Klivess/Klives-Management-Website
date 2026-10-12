<template>
    <div class="ot-os kc-call" :class="{ 'panel-open': !!panel && live }">
        <header class="kc-top">
            <NuxtLink v-if="signedIn" to="/klivechat" class="kc-iconbtn" title="All rooms" aria-label="All rooms">
                <KliveChatIcon name="arrow-left" :size="18" />
            </NuxtLink>
            <div class="kc-title">
                <span class="kc-title-name">{{ roomName }}</span>
                <KliveChatIcon v-if="room?.locked" name="lock" :size="14" class="kc-dim" />
            </div>
            <span v-if="live" class="kc-top-meta">
                <span class="ot-dot" :class="phase === 'live' ? 'ok' : 'warn'" aria-hidden="true"></span>
                <span>{{ peopleCount }}</span>
                <span class="kc-sep" aria-hidden="true">·</span>
                <span class="mono">{{ elapsed }}</span>
            </span>
            <span v-if="phase === 'reconnecting'" class="ot-chip warn">Reconnecting…</span>
            <div class="kc-spacer"></div>
            <button type="button" class="ot-btn ghost sm" @click="copyLink">
                <KliveChatIcon :name="copied ? 'check' : 'link'" :size="15" />
                <span class="kc-wide">{{ copied ? 'Copied' : 'Copy link' }}</span>
            </button>
        </header>

        <div class="kc-body">
            <main class="kc-main">
                <div v-if="booting" class="kc-center"><span class="kc-loader" aria-label="Loading"></span></div>

                <section v-else-if="ended" class="kc-center kc-ended">
                    <h1>{{ ended.title }}</h1>
                    <p v-if="ended.detail">{{ ended.detail }}</p>
                    <div class="kc-ended-actions">
                        <button v-if="ended.retry" type="button" class="ot-btn primary" @click="rejoin">{{ ended.retry }}</button>
                        <NuxtLink v-if="signedIn" to="/klivechat" class="ot-btn">All rooms</NuxtLink>
                    </div>
                </section>

                <KliveChatPreJoin v-else-if="phase === 'prejoin' && s" :room-name="roomName" :here="here" :signed-in="signedIn" :initial-name="initialName"
                                  :mic-on="s.local.micOn" :mic-error="s.local.micError" :mic-level="s.local.micLevel"
                                  :cam-on="s.local.camOn" :cam-track="s.local.camTrack" :cam-error="s.local.camError"
                                  :mirror="s.prefs.mirrorSelf && s.local.facing === 'user'" :locked="!!preview?.locked" :joining="false"
                                  :devices="s.devices" :prefs="s.prefs"
                                  @join="join" @toggle-mic="call?.toggleMic()" @toggle-cam="call?.toggleCam()" @select="(kind, id) => call?.selectDevice(kind, id)" />

                <div v-else-if="phase === 'connecting'" class="kc-center kc-connecting">
                    <span class="kc-loader" aria-hidden="true"></span>
                    <span>{{ (s?.reconnectAttempt ?? 0) > 2 ? "Can't reach KliveChat. Retrying…" : `Joining ${roomName}…` }}</span>
                </div>

                <KliveChatStage v-else :tiles="tiles" :focus-key="focusKey" :show-stats="!!s?.prefs.showStats" @pin="pin" />

                <div v-if="live && s && !s.peers.length" class="kc-alone">
                    <span>Nobody else is here</span>
                    <button type="button" class="ot-btn sm" @click="copyLink"><KliveChatIcon :name="copied ? 'check' : 'link'" :size="14" /> {{ copied ? 'Copied' : 'Copy link' }}</button>
                </div>

                <TransitionGroup name="kc-pop" tag="div" class="kc-notices" aria-live="polite">
                    <div v-for="notice in s?.notices ?? []" :key="notice.id" class="kc-notice" :class="notice.tone" @click="call?.dismissNotice(notice.id)">{{ notice.text }}</div>
                </TransitionGroup>

                <button v-if="s?.audioBlocked" type="button" class="kc-audio-blocked" @click="call?.resumeAudio()">
                    <KliveChatIcon name="volume-off" :size="16" /> The browser paused call audio. Click to play.
                </button>

                <Transition name="kc-pop">
                    <button v-if="chatPreview" type="button" class="kc-chat-preview" @click="openPanel('chat')">
                        <b>{{ chatPreview.senderName }}</b> <span>{{ chatPreview.text }}</span>
                    </button>
                </Transition>
            </main>

            <aside v-if="panel && live && s" class="kc-panel" :aria-label="panel === 'chat' ? 'Chat' : 'People'">
                <div class="kc-panel-tabs" role="tablist">
                    <button type="button" role="tab" :aria-selected="panel === 'chat'" @click="openPanel('chat')">Chat</button>
                    <button type="button" role="tab" :aria-selected="panel === 'people'" @click="openPanel('people')">People <span class="kc-count">{{ peopleCount }}</span></button>
                    <button type="button" class="kc-iconbtn kc-panel-close" aria-label="Close panel" @click="panel = null"><KliveChatIcon name="close" :size="16" /></button>
                </div>
                <KliveChatMessages v-if="panel === 'chat'" :entries="s.chat" :self-id="s.selfId" :disabled="phase !== 'live'"
                                    @send="sendChat" @retry="retryChat" />
                <KliveChatPeoplePanel v-else :peers="s.peers" :self="selfSummary" :my-rank="me?.rank ?? 0" :can-moderate="s.canModerate"
                                      :can-rename="s.isHost || !!me?.canDeleteAnyRoom" :locked="!!room?.locked" :room-name="roomName"
                                      @moderate="(id, action) => call?.moderate(id, action)" @lock="locked => call?.setLocked(locked)"
                                      @rename="name => call?.renameRoom(name)" @volume="(id, v) => call?.setPeerVolume(id, v)"
                                      @local-mute="id => call?.togglePeerMute(id)" />
            </aside>
        </div>

        <footer v-if="live && s" class="kc-controls">
            <div class="kc-controls-side kc-wide">
                <span class="mono">{{ clock }}</span>
                <span v-if="s.prefs.pushToTalk && !s.local.micOn" class="kc-ptt" :class="{ on: s.local.pttHeld }">{{ s.local.pttHeld ? 'Talking' : 'Hold Space to talk' }}</span>
            </div>

            <div class="kc-controls-center">
                <div class="kc-pair">
                    <button type="button" class="kc-ctl" :class="{ off: !micLive, blocked: !!s.local.micError }" :aria-pressed="micLive"
                            :title="s.local.micError || `${micLive ? 'Mute' : 'Unmute'} (M)`" @click="call?.toggleMic()">
                        <KliveChatIcon :name="micLive ? 'mic' : 'mic-off'" />
                        <span v-if="s.local.mutedTalking" class="kc-hint">You're muted</span>
                    </button>
                    <button type="button" class="kc-caret" aria-label="Audio settings" :aria-expanded="menu === 'audio'" @click="toggleMenu('audio')">
                        <KliveChatIcon name="chevron-up" :size="14" />
                    </button>
                    <KliveChatDeviceMenu v-if="menu === 'audio'" class="kc-popover" kind="audio" :devices="s.devices" :prefs="s.prefs" :level="s.local.micLevel"
                                         :mic-on="micLive" :can-pick-speaker="s.canPickSpeaker" :can-share-screen="s.canShareScreen"
                                         @select="selectDevice" @pref="setPref" @close="menu = null" />
                </div>

                <div class="kc-pair">
                    <button type="button" class="kc-ctl" :class="{ off: !s.local.camOn }" :aria-pressed="s.local.camOn"
                            :title="`${s.local.camOn ? 'Turn camera off' : 'Turn camera on'} (V)`" @click="call?.toggleCam()">
                        <KliveChatIcon :name="s.local.camOn ? 'video' : 'video-off'" />
                    </button>
                    <button type="button" class="kc-caret" aria-label="Camera settings" :aria-expanded="menu === 'video'" @click="toggleMenu('video')">
                        <KliveChatIcon name="chevron-up" :size="14" />
                    </button>
                    <KliveChatDeviceMenu v-if="menu === 'video'" class="kc-popover" kind="video" :devices="s.devices" :prefs="s.prefs" :level="0"
                                         :mic-on="micLive" :can-pick-speaker="s.canPickSpeaker" :can-share-screen="s.canShareScreen"
                                         @select="selectDevice" @pref="setPref" @close="menu = null" />
                </div>

                <button v-if="s.local.camOn && s.devices.cams.length > 1" type="button" class="kc-ctl kc-narrow-only" title="Switch camera" @click="call?.switchCamera()">
                    <KliveChatIcon name="switch-camera" />
                </button>

                <button v-if="s.canShareScreen" type="button" class="kc-ctl" :class="{ active: s.local.screenOn }" :aria-pressed="s.local.screenOn"
                        :title="`${s.local.screenOn ? 'Stop sharing' : 'Share screen'} (S)`" @click="call?.toggleScreen()">
                    <KliveChatIcon :name="s.local.screenOn ? 'screen-off' : 'screen'" />
                </button>

                <div class="kc-pair">
                    <button type="button" class="kc-ctl" title="Settings" :aria-expanded="menu === 'settings'" @click="toggleMenu('settings')">
                        <KliveChatIcon name="settings" />
                    </button>
                    <KliveChatDeviceMenu v-if="menu === 'settings'" class="kc-popover" kind="settings" :devices="s.devices" :prefs="s.prefs" :level="0"
                                         :mic-on="micLive" :can-pick-speaker="s.canPickSpeaker" :can-share-screen="s.canShareScreen"
                                         @select="selectDevice" @pref="setPref" @close="menu = null" />
                </div>

                <button type="button" class="kc-ctl leave" title="Leave" aria-label="Leave" @click="leave">
                    <KliveChatIcon name="phone-off" />
                </button>
            </div>

            <div class="kc-controls-side right">
                <button type="button" class="kc-ctl subtle" :class="{ active: panel === 'people' }" title="People (P)" @click="togglePanel('people')">
                    <KliveChatIcon name="users" />
                    <span class="kc-badge quiet">{{ peopleCount }}</span>
                </button>
                <button type="button" class="kc-ctl subtle" :class="{ active: panel === 'chat' }" title="Chat (C)" @click="togglePanel('chat')">
                    <KliveChatIcon name="chat" />
                    <span v-if="s.unread" class="kc-badge">{{ s.unread > 99 ? '99+' : s.unread }}</span>
                </button>
            </div>
        </footer>

        <div v-if="menu" class="kc-menu-backdrop" @click="menu = null"></div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { TileModel } from '~/components/KliveChat/Tile.vue';
import { fetchMe, fetchRoom, roomLink } from '~/scripts/klivechat/api';
import { KliveChatCall, type ChatEntry } from '~/scripts/klivechat/call';
import { callDuration, statsLine } from '~/scripts/klivechat/format';
import { consumeAutoJoin, loadPrefs, type ChatPrefs } from '~/scripts/klivechat/prefs';
import type { ChatMe, RoomSummary } from '~/scripts/klivechat/types';

// A standalone window for guests and members alike: no navbar shell, nothing that needs a profile.
definePageMeta({ layout: 'empty' });

const route = useRoute();
const roomId = String(route.params.id);

const call = shallowRef<KliveChatCall | null>(null);
const s = computed(() => call.value?.state ?? null);
const me = ref<ChatMe | null>(null);
const preview = ref<RoomSummary | null>(null);
const booting = ref(true);
const notFound = ref(false);
const initialName = ref('');
const panel = ref<'chat' | 'people' | null>(null);
const menu = ref<'audio' | 'video' | 'settings' | null>(null);
const pinnedKey = ref<string | null>(null);
const copied = ref(false);
const now = ref(Date.now());
const endedAt = ref(0);
const chatPreview = ref<ChatEntry | null>(null);

const signedIn = computed(() => !!me.value);
const phase = computed(() => s.value?.phase ?? 'prejoin');
const live = computed(() => phase.value === 'live' || phase.value === 'reconnecting');
const room = computed(() => s.value?.room ?? null);
const roomName = computed(() => room.value?.name ?? preview.value?.name ?? 'KliveChat');
const peopleCount = computed(() => (s.value?.peers.length ?? 0) + 1);
const micLive = computed(() => !!s.value && !s.value.local.micError && s.value.local.micReady && (s.value.local.micOn || s.value.local.pttHeld));
const here = computed(() => (preview.value?.participants ?? []).map(p => p.name));
const elapsed = computed(() => (s.value?.joinedAt ? callDuration(now.value - s.value.joinedAt) : '0:00'));
const clock = computed(() => new Date(now.value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));

useHead({
    title: () => `${s.value?.unread ? `(${s.value.unread}) ` : ''}${roomName.value} · KliveChat`,
});

const selfSummary = computed(() => ({
    name: s.value?.selfName || 'You',
    isGuest: !signedIn.value,
    isHost: !!s.value?.isHost,
    micOn: micLive.value,
    camOn: !!s.value?.local.camOn,
    screenOn: !!s.value?.local.screenOn,
    speaking: !!s.value?.local.speaking,
}));

const ended = computed(() => {
    const reason = notFound.value ? 'not-found' : s.value?.phase === 'ended' ? s.value.endReason : null;
    if (!reason) return null;
    const lasted = s.value?.joinedAt && endedAt.value ? callDuration(endedAt.value - s.value.joinedAt) : '';
    switch (reason) {
        case 'left': return { title: 'You left the call', detail: lasted ? `In the call for ${lasted}` : '', retry: 'Rejoin' };
        case 'kicked': return { title: `${s.value?.endDetail || 'A moderator'} removed you from the call`, detail: '', retry: 'Rejoin' };
        case 'banned': return { title: "You're banned from this room", detail: '', retry: '' };
        case 'deleted': return { title: 'This room was closed', detail: '', retry: '' };
        case 'locked': return { title: 'This room is locked', detail: 'Only moderators can join right now.', retry: 'Try again' };
        case 'full': return { title: 'This room is full', detail: '', retry: 'Try again' };
        case 'replaced': return { title: 'You joined from another tab', detail: '', retry: 'Use this tab' };
        default: return { title: 'Room not found', detail: 'Check the link.', retry: '' };
    }
});

const tiles = computed<TileModel[]>(() => {
    const state = s.value;
    if (!state) return [];
    const local = state.local;
    const list: TileModel[] = [{
        key: 'self:camera',
        kind: 'camera',
        peerId: state.selfId || 'self',
        isSelf: true,
        name: state.selfName || 'You',
        isGuest: !state.signedIn,
        track: local.camTrack,
        videoOn: local.camOn && !!local.camTrack,
        mirror: state.prefs.mirrorSelf && local.facing === 'user',
        muted: !micLive.value,
        speaking: local.speaking,
        screenAudio: false,
        status: 'ok',
        quality: null,
        statsText: null,
        joinedAt: 0,
    }];
    for (const peer of state.peers) {
        list.push({
            key: `${peer.id}:camera`,
            kind: 'camera',
            peerId: peer.id,
            isSelf: false,
            name: peer.name,
            isGuest: peer.isGuest,
            track: peer.camTrack,
            videoOn: peer.hasVideo && peer.camLive,
            mirror: false,
            muted: peer.isMuted,
            speaking: peer.speaking,
            screenAudio: false,
            status: !peer.connected ? 'offline' : peer.media === 'connected' ? 'ok' : 'connecting',
            quality: peer.stats.quality,
            statsText: statsLine(peer.stats),
            joinedAt: peer.joinedAt,
        });
    }
    if (local.screenOn) {
        list.push({
            key: 'self:screen', kind: 'screen', peerId: state.selfId || 'self', isSelf: true, name: state.selfName || 'You', isGuest: !state.signedIn,
            track: local.screenTrack, videoOn: !!local.screenTrack, mirror: false, muted: false, speaking: false, screenAudio: local.screenAudio,
            status: 'ok', quality: null, statsText: null, joinedAt: Number.MAX_SAFE_INTEGER,
        });
    }
    for (const peer of state.peers) {
        if (!peer.isScreenSharing) continue;
        list.push({
            key: `${peer.id}:screen`, kind: 'screen', peerId: peer.id, isSelf: false, name: peer.name, isGuest: peer.isGuest,
            track: peer.screenTrack, videoOn: peer.screenLive, mirror: false, muted: false, speaking: false, screenAudio: peer.hasScreenAudio,
            status: !peer.connected ? 'offline' : peer.media === 'connected' ? 'ok' : 'connecting', quality: null, statsText: null, joinedAt: peer.joinedAt,
        });
    }
    return list;
});

// Someone starting a screen share takes the stage (unless you're already watching another one).
const knownScreens = new Set<string>();
watch(() => tiles.value.filter(t => t.kind === 'screen' && !t.isSelf).map(t => t.key), keys => {
    for (const key of keys) {
        if (knownScreens.has(key)) continue;
        knownScreens.add(key);
        const current = tiles.value.find(t => t.key === pinnedKey.value);
        if (!current || current.kind !== 'screen') pinnedKey.value = key;
    }
    for (const key of [...knownScreens]) if (!keys.includes(key)) knownScreens.delete(key);
});

const focusKey = computed(() => (pinnedKey.value && tiles.value.some(t => t.key === pinnedKey.value) ? pinnedKey.value : null));

function pin(key: string | null) {
    pinnedKey.value = key === null || pinnedKey.value === key ? null : key;
}

function openPanel(which: 'chat' | 'people') {
    panel.value = which;
    chatPreview.value = null;
}

function togglePanel(which: 'chat' | 'people') {
    if (panel.value === which) panel.value = null;
    else openPanel(which);
}

function toggleMenu(which: 'audio' | 'video' | 'settings') {
    menu.value = menu.value === which ? null : which;
}

function sendChat(text: string) {
    call.value?.sendChat(text);
}

function retryChat(key: string) {
    call.value?.retryChat(key);
}

function selectDevice(kind: 'mic' | 'cam' | 'speaker', id: string | null) {
    void call.value?.selectDevice(kind, id);
}

function setPref(key: keyof ChatPrefs, value: boolean) {
    const c = call.value;
    if (!c) return;
    if (key === 'noiseSuppression') void c.setNoiseSuppression(value);
    else c.setPref(key, value as never);
}

async function copyLink() {
    try {
        await navigator.clipboard.writeText(roomLink(roomId));
        copied.value = true;
        setTimeout(() => { copied.value = false; }, 1600);
    } catch {
        call.value?.notify("Couldn't copy the link.", 'warn');
    }
}

async function join(name: string) {
    await call.value?.join(name);
}

function leave() {
    menu.value = null;
    call.value?.leave();
}

async function rejoin() {
    if (notFound.value) return;
    pinnedKey.value = null;
    await call.value?.rejoin();
}

watch(panel, value => call.value?.setChatOpen(value === 'chat'));
watch(phase, (value, previous) => {
    if (value === 'ended' && previous !== 'ended') {
        endedAt.value = Date.now();
        panel.value = null;
        menu.value = null;
    }
});

// New messages while chat is closed: a short preview above the controls.
let previewTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => s.value?.lastIncoming, entry => {
    if (!entry || panel.value === 'chat') return;
    chatPreview.value = entry;
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => { chatPreview.value = null; }, 5000);
});

function isTyping(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function onKeyDown(event: KeyboardEvent) {
    const c = call.value;
    if (!c || !live.value || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape') {
        if (menu.value) menu.value = null;
        else if (panel.value) panel.value = null;
        else if (pinnedKey.value) pinnedKey.value = null;
        return;
    }
    if (isTyping(event.target)) return;
    if (event.key === ' ' && c.state.prefs.pushToTalk && !c.state.local.micOn) {
        event.preventDefault();
        if (!event.repeat) c.pushToTalk(true);
        return;
    }
    if (event.repeat) return;
    switch (event.key.toLowerCase()) {
        case 'm': c.toggleMic(); break;
        case 'v': c.toggleCam(); break;
        case 's': if (c.state.canShareScreen) void c.toggleScreen(); break;
        case 'c': togglePanel('chat'); break;
        case 'p': togglePanel('people'); break;
        default: return;
    }
    event.preventDefault();
}

function onKeyUp(event: KeyboardEvent) {
    if (event.key === ' ' && call.value?.state.local.pttHeld) {
        event.preventDefault();
        call.value.pushToTalk(false);
    }
}

function onBlur() {
    call.value?.pushToTalk(false);
}

let clockTimer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
    clockTimer = setInterval(() => { now.value = Date.now(); }, 500);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    const autoJoin = consumeAutoJoin(roomId);
    const [profile, summary] = await Promise.all([
        fetchMe(),
        fetchRoom(roomId).catch(() => undefined), // unreachable: let the socket decide
    ]);
    me.value = profile;
    if (summary === null) {
        notFound.value = true;
        booting.value = false;
        return;
    }
    preview.value = summary ?? null;
    initialName.value = profile?.name ?? loadPrefs().guestName ?? '';

    const instance = new KliveChatCall(roomId, { signedIn: !!profile, name: initialName.value });
    call.value = instance;
    if (import.meta.dev) (window as unknown as { __klivechat?: KliveChatCall }).__klivechat = instance;
    booting.value = false;
    await instance.prepare();
    // From the lobby the click to get here was the gesture audio needs: go straight in.
    if (autoJoin && profile) await instance.join();
});

onBeforeUnmount(() => {
    if (clockTimer) clearInterval(clockTimer);
    if (previewTimer) clearTimeout(previewTimer);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    call.value?.destroy();
});
</script>

<style scoped>
.kc-call {
    --kc-top: 52px;
    --kc-controls: 76px;
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: #080a07;
    overflow: hidden;
}
.mono { font-family: var(--ot-mono); }

/* ── top bar ── */
.kc-top {
    flex: 0 0 var(--kc-top);
    display: flex;
    align-items: center;
    gap: var(--ot-space-3);
    padding: 0 var(--ot-space-4);
    border-bottom: 1px solid var(--ot-line);
    background: rgba(11, 13, 10, 0.94);
    min-width: 0;
}
.kc-title { display: flex; align-items: center; gap: 6px; min-width: 0; font-weight: 620; font-size: 15px; }
.kc-title-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.kc-dim { color: var(--ot-muted); }
.kc-top-meta { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ot-text-2); white-space: nowrap; }
.kc-sep { color: var(--ot-disabled); }
.kc-spacer { flex: 1 1 auto; }
.kc-iconbtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--ot-radius-sm);
    border: 0;
    background: none;
    color: var(--ot-text-2);
    cursor: pointer;
}
.kc-iconbtn:hover { color: var(--ot-text); background: var(--ot-surface-3); }

/* ── body ── */
.kc-body { flex: 1 1 auto; display: flex; min-height: 0; }
.kc-main { position: relative; flex: 1 1 auto; min-width: 0; padding: 12px; display: flex; }
.kc-main > :deep(.kc-stage) { flex: 1 1 auto; }
.kc-center { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--ot-space-3); text-align: center; }
.kc-connecting { color: var(--ot-text-2); font-size: 13.5px; }
.kc-loader {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 3px solid var(--ot-line-strong);
    border-top-color: var(--ot-accent);
    animation: kc-spin 0.8s linear infinite;
}
@keyframes kc-spin { to { transform: rotate(360deg); } }
.kc-ended h1 { margin: 0; font-size: 22px; font-weight: 640; }
.kc-ended p { margin: 0; color: var(--ot-text-2); font-size: 13.5px; }
.kc-ended-actions { display: flex; gap: var(--ot-space-2); margin-top: var(--ot-space-2); }

.kc-alone {
    position: absolute;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: var(--ot-space-3);
    padding: 6px 6px 6px 14px;
    border-radius: 999px;
    border: 1px solid var(--ot-line-strong);
    background: rgba(18, 21, 15, 0.9);
    font-size: 12.5px;
    color: var(--ot-text-2);
    backdrop-filter: blur(6px);
    z-index: 5;
    white-space: nowrap;
}

.kc-notices {
    position: absolute;
    top: 16px;
    right: 16px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    z-index: 20;
    pointer-events: none;
}
.kc-notice {
    pointer-events: auto;
    max-width: 340px;
    padding: 8px 12px;
    border-radius: var(--ot-radius);
    border: 1px solid var(--ot-line-strong);
    background: rgba(25, 29, 22, 0.97);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
    font-size: 13px;
    cursor: pointer;
}
.kc-notice.warn { border-color: rgba(240, 180, 41, 0.5); }
.kc-notice.error { border-color: rgba(255, 123, 123, 0.55); }

.kc-audio-blocked, .kc-chat-preview {
    position: absolute;
    left: 50%;
    bottom: 20px;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: var(--ot-space-2);
    max-width: min(520px, calc(100% - 32px));
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid var(--ot-line-strong);
    background: rgba(25, 29, 22, 0.97);
    color: var(--ot-text);
    font-size: 13px;
    cursor: pointer;
    z-index: 15;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
}
.kc-chat-preview:hover { border-color: var(--ot-accent); }
.kc-audio-blocked, .kc-audio-blocked:hover { border-color: rgba(240, 180, 41, 0.6); color: var(--ot-warning); }
.kc-chat-preview span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ot-text-2); }
.kc-chat-preview b { flex: 0 0 auto; font-weight: 650; }

/* ── side panel ── */
.kc-panel {
    flex: 0 0 360px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    margin: 12px 12px 12px 0;
    border-radius: var(--ot-radius-lg);
    border: 1px solid var(--ot-line);
    background: var(--ot-surface);
    overflow: hidden;
}
.kc-panel-tabs { display: flex; align-items: center; gap: 4px; padding: 6px; border-bottom: 1px solid var(--ot-line); }
.kc-panel-tabs [role='tab'] {
    height: 32px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--ot-radius-sm);
    background: none;
    color: var(--ot-text-2);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
}
.kc-panel-tabs [role='tab'][aria-selected='true'] { background: var(--ot-surface-3); color: var(--ot-text); }
.kc-count { margin-left: 4px; color: var(--ot-muted); font-family: var(--ot-mono); font-size: 11.5px; }
.kc-panel-close { margin-left: auto; }

/* ── controls ── */
.kc-controls {
    flex: 0 0 var(--kc-controls);
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--ot-space-3);
    padding: 0 var(--ot-space-4);
}
.kc-controls-side { display: flex; align-items: center; gap: var(--ot-space-3); font-size: 13px; color: var(--ot-text-2); min-width: 0; }
.kc-controls-side.right { justify-content: flex-end; gap: var(--ot-space-2); }
.kc-controls-center { display: flex; align-items: center; gap: 10px; }
.kc-pair { position: relative; display: inline-flex; align-items: center; border-radius: 999px; background: var(--ot-surface-2); }
.kc-ctl {
    position: relative;
    width: 48px;
    height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 0;
    background: var(--ot-surface-2);
    color: var(--ot-text);
    cursor: pointer;
    transition: background var(--ot-fast), color var(--ot-fast);
}
.kc-ctl:hover { background: var(--ot-surface-3); }
.kc-ctl.off { background: #b3322c; color: #fff; }
.kc-ctl.off:hover { background: #c53a33; }
.kc-ctl.blocked { background: rgba(240, 180, 41, 0.18); color: var(--ot-warning); }
.kc-ctl.active { background: var(--ot-accent); color: var(--ot-on-accent); }
.kc-ctl.leave { width: 64px; border-radius: 24px; background: #c0362f; color: #fff; }
.kc-ctl.leave:hover { background: #d63d35; }
.kc-ctl.subtle { width: 44px; height: 44px; background: none; }
.kc-ctl.subtle:hover, .kc-ctl.subtle.active { background: var(--ot-surface-2); color: var(--ot-accent); }
.kc-pair .kc-ctl { background: transparent; }
.kc-pair .kc-ctl.off { background: #b3322c; }
.kc-pair .kc-ctl.blocked { background: rgba(240, 180, 41, 0.18); }
.kc-caret {
    width: 26px;
    height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: -2px;
    padding-right: 4px;
    border: 0;
    border-radius: 0 999px 999px 0;
    background: none;
    color: var(--ot-text-2);
    cursor: pointer;
}
.kc-caret:hover { color: var(--ot-text); }
.kc-popover { position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%); z-index: 40; }
.kc-menu-backdrop { position: fixed; inset: 0; z-index: 30; }
.kc-controls { position: relative; z-index: 35; }
.kc-badge {
    position: absolute;
    top: 4px;
    right: 2px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--ot-accent);
    color: var(--ot-on-accent);
    font-size: 10.5px;
    font-weight: 700;
    line-height: 17px;
    text-align: center;
}
.kc-badge.quiet { background: var(--ot-surface-3); color: var(--ot-text-2); }
.kc-hint {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    transform: translateX(-50%);
    padding: 4px 10px;
    border-radius: var(--ot-radius-sm);
    background: var(--ot-warning);
    color: #241a04;
    font-size: 12px;
    font-weight: 650;
    white-space: nowrap;
    pointer-events: none;
}
.kc-ptt { padding: 2px 8px; border-radius: 999px; border: 1px solid var(--ot-line-strong); font-size: 11.5px; color: var(--ot-muted); }
.kc-ptt.on { color: var(--ot-on-accent); background: var(--ot-accent); border-color: var(--ot-accent); }
.kc-narrow-only { display: none; }

.kc-pop-enter-active, .kc-pop-leave-active { transition: opacity var(--ot-normal), transform var(--ot-normal); }
.kc-pop-enter-from, .kc-pop-leave-to { opacity: 0; transform: translateY(6px); }
.kc-chat-preview.kc-pop-enter-from, .kc-chat-preview.kc-pop-leave-to { transform: translate(-50%, 6px); }

@media (max-width: 900px) {
    .kc-panel {
        position: absolute;
        top: var(--kc-top);
        right: 0;
        bottom: var(--kc-controls);
        left: 0;
        margin: 0;
        border-radius: 0;
        border-width: 1px 0;
        z-index: 25;
        flex-basis: auto;
    }
}
@media (max-width: 720px) {
    .kc-call { --kc-controls: 68px; }
    .kc-top { padding: 0 var(--ot-space-2); gap: var(--ot-space-2); }
    .kc-wide { display: none; }
    .kc-main { padding: 8px; }
    .kc-controls { display: flex; justify-content: space-between; padding: 0 var(--ot-space-2); gap: 4px; }
    .kc-controls-center { gap: 6px; }
    .kc-controls-side.right { gap: 0; }
    .kc-ctl { width: 44px; height: 44px; }
    .kc-ctl.subtle { width: 40px; }
    .kc-ctl.leave { width: 52px; }
    .kc-caret { display: none; }
    .kc-narrow-only { display: inline-flex; }
    .kc-popover.kc-menu { position: fixed; left: 12px; right: 12px; bottom: calc(var(--kc-controls) + 8px); width: auto; transform: none; }
}
@media (max-width: 400px) {
    .kc-controls-center { gap: 4px; }
    .kc-ctl { width: 40px; height: 40px; }
    .kc-ctl.leave { width: 46px; }
}
</style>
