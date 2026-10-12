<template>
    <div class="ot-os kc-lobby">
        <header class="ot-top">
            <span class="ot-brand"><b>KliveChat</b></span>
            <span v-if="me && loaded" class="ot-scope">
                {{ rooms.length }} room{{ rooms.length === 1 ? '' : 's' }}
                <template v-if="inCalls"><span class="sep" aria-hidden="true">·</span> {{ inCalls }} in call{{ inCalls === 1 ? '' : 's' }}</template>
            </span>
            <div class="ot-top-spacer"></div>
            <span v-if="me" class="ot-fresh" :class="{ stale: status === 'polling', failed: status === 'error' }" :title="statusDetail || undefined">
                <span class="ot-dot" :class="status === 'live' ? 'ok' : status === 'error' ? 'bad' : 'warn'" aria-hidden="true"></span>
                <span class="kc-wide">{{ status === 'live' ? 'Live' : status === 'error' ? 'Offline' : 'Updating every 15s' }}</span>
            </span>
        </header>

        <main class="ot-page kc-page">
            <div v-if="checking" class="ot-card"><div class="ot-skelrows"><div v-for="n in 3" :key="n" class="ot-skel"></div></div></div>

            <template v-else-if="me">
                <form v-if="me.canCreate" class="kc-create" @submit.prevent="create">
                    <input v-model="newName" class="ot-input" maxlength="48" placeholder="New room" aria-label="New room name" :disabled="creating" />
                    <label class="ot-check" title="Kept rooms never expire. Others are removed after a day empty.">
                        <input v-model="keep" type="checkbox" /> Keep
                    </label>
                    <button type="submit" class="ot-btn primary" :disabled="creating">
                        <KliveChatIcon name="plus" :size="16" /> {{ creating ? 'Creating…' : 'Create' }}
                    </button>
                </form>
                <p v-if="error" class="kc-error" role="alert">{{ error }}</p>

                <section class="ot-card">
                    <div v-if="!loaded" class="ot-skelrows"><div v-for="n in 3" :key="n" class="ot-skel"></div></div>
                    <OmniTraderStateBlock v-else-if="!rooms.length" compact title="No rooms" />
                    <ul v-else class="kc-rooms">
                        <li v-for="room in rooms" :key="room.roomId" class="kc-room" :class="{ live: room.userCount > 0, editing: editing === room.roomId }">
                            <span class="kc-room-dot" :class="{ on: room.userCount > 0 }" aria-hidden="true"></span>

                            <div class="kc-room-main">
                                <form v-if="editing === room.roomId" class="kc-rename" @submit.prevent="saveName(room)">
                                    <input ref="renameInput" v-model="nameDraft" class="ot-input" maxlength="48" aria-label="Room name" @keydown.esc="editing = null" @blur="saveName(room)" />
                                </form>
                                <button v-else type="button" class="kc-room-name" :title="`Join ${room.name}`" @click="join(room)">
                                    <span>{{ room.name }}</span>
                                    <KliveChatIcon v-if="room.locked" name="lock" :size="13" class="kc-dim" />
                                    <KliveChatIcon v-if="room.persistent" name="pin" :size="13" class="kc-dim" />
                                </button>
                                <span class="kc-room-meta">{{ room.createdBy }} · {{ room.userCount ? 'live now' : `active ${relTime(room.lastActiveUtc, now)}` }}</span>
                            </div>

                            <div class="kc-room-people">
                                <template v-if="room.participants.length">
                                    <span class="kc-stack">
                                        <span v-for="p in room.participants.slice(0, 5)" :key="p.id" class="kc-stack-item" :title="personTitle(p)">
                                            <KliveChatAvatar :name="p.name" :size="26" :guest="p.isGuest" />
                                            <KliveChatIcon v-if="p.isScreenSharing" name="screen" :size="10" class="kc-stack-badge" />
                                        </span>
                                    </span>
                                    <span class="kc-people-names">{{ names(room) }}</span>
                                </template>
                            </div>

                            <div class="kc-room-actions">
                                <button type="button" class="ot-btn sm" :class="{ primary: room.userCount > 0 }" @click="join(room)">Join</button>
                                <button type="button" class="kc-icon-btn" :title="copiedId === room.roomId ? 'Copied' : 'Copy link'" @click="copy(room)">
                                    <KliveChatIcon :name="copiedId === room.roomId ? 'check' : 'link'" :size="16" />
                                </button>
                                <div v-if="room.canManage" class="kc-more">
                                    <button type="button" class="kc-icon-btn" title="More" :aria-expanded="menuFor === room.roomId" @click="toggleMenu(room.roomId)">
                                        <KliveChatIcon name="more" :size="16" />
                                    </button>
                                    <div v-if="menuFor === room.roomId" class="kc-menu" role="menu">
                                        <button type="button" role="menuitem" @click="startRename(room)"><KliveChatIcon name="edit" :size="15" /> Rename</button>
                                        <button type="button" role="menuitem" @click="setKeep(room, !room.persistent)">
                                            <KliveChatIcon name="pin" :size="15" /> {{ room.persistent ? "Don't keep" : 'Keep' }}
                                        </button>
                                        <button type="button" role="menuitem" @click="setLocked(room, !room.locked)">
                                            <KliveChatIcon :name="room.locked ? 'unlock' : 'lock'" :size="15" /> {{ room.locked ? 'Unlock' : 'Lock' }}
                                        </button>
                                        <button type="button" role="menuitem" class="danger" @click="remove(room)">
                                            <KliveChatIcon name="trash" :size="15" /> {{ confirmDelete === room.roomId ? (room.userCount ? `End call for ${room.userCount} and delete` : 'Confirm delete') : 'Delete' }}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </li>
                    </ul>
                </section>
            </template>

            <section v-else class="kc-guest">
                <form class="kc-joinbox" @submit.prevent="joinByLink">
                    <input v-model="linkInput" class="ot-input" placeholder="Room link or ID" aria-label="Room link or ID" />
                    <button type="submit" class="ot-btn primary" :disabled="!parsedLink">Join</button>
                </form>
                <NuxtLink to="/" class="kc-signin">Sign in to see rooms</NuxtLink>
            </section>
        </main>
        <div v-if="menuFor" class="kc-backdrop" @click="closeMenu"></div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { createRoom, deleteRoom, fetchMe, parseRoomInput, roomLink, updateRoom, watchRooms } from '~/scripts/klivechat/api';
import { markAutoJoin } from '~/scripts/klivechat/prefs';
import type { ChatMe, LobbyParticipant, RoomSummary } from '~/scripts/klivechat/types';
import { relTime } from '~/scripts/profileFormat';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'KliveChat · Klives Management' });

const router = useRouter();
const me = ref<ChatMe | null>(null);
const checking = ref(true);
const rooms = ref<RoomSummary[]>([]);
const loaded = ref(false);
const status = ref<'live' | 'polling' | 'error'>('polling');
const statusDetail = ref('');
const newName = ref('');
const keep = ref(false);
const creating = ref(false);
const error = ref('');
const copiedId = ref<string | null>(null);
const menuFor = ref<string | null>(null);
const confirmDelete = ref<string | null>(null);
const editing = ref<string | null>(null);
const nameDraft = ref('');
const renameInput = ref<HTMLInputElement[] | HTMLInputElement | null>(null);
const linkInput = ref('');
const now = ref(Date.now());

const inCalls = computed(() => rooms.value.reduce((sum, room) => sum + room.userCount, 0));
const parsedLink = computed(() => parseRoomInput(linkInput.value));

let stopWatching: (() => void) | null = null;
let clock: ReturnType<typeof setInterval> | null = null;
let errorTimer: ReturnType<typeof setTimeout> | null = null;

function showError(message: string) {
    error.value = message;
    if (errorTimer) clearTimeout(errorTimer);
    errorTimer = setTimeout(() => { error.value = ''; }, 6000);
}

function names(room: RoomSummary): string {
    const list = room.participants.map(p => p.name);
    return list.length <= 3 ? list.join(', ') : `${list.slice(0, 2).join(', ')} +${list.length - 2}`;
}

function personTitle(p: LobbyParticipant): string {
    const state = [p.isGuest ? 'guest' : '', p.isMuted ? 'muted' : '', p.hasVideo ? 'camera on' : '', p.isScreenSharing ? 'sharing screen' : '', p.connected ? '' : 'reconnecting']
        .filter(Boolean).join(', ');
    return state ? `${p.name} (${state})` : p.name;
}

function open(roomId: string) {
    markAutoJoin(roomId);
    void router.push(`/shared/klivechat/${roomId}`);
}

function join(room: RoomSummary) {
    open(room.roomId);
}

function joinByLink() {
    if (parsedLink.value) void router.push(`/shared/klivechat/${parsedLink.value}`);
}

async function create() {
    if (creating.value) return;
    creating.value = true;
    try {
        const room = await createRoom(newName.value.trim(), keep.value);
        newName.value = '';
        open(room.roomId);
    } catch (e) {
        showError(e instanceof Error ? e.message : String(e));
    } finally {
        creating.value = false;
    }
}

async function copy(room: RoomSummary) {
    try {
        await navigator.clipboard.writeText(roomLink(room.roomId));
        copiedId.value = room.roomId;
        setTimeout(() => { if (copiedId.value === room.roomId) copiedId.value = null; }, 1600);
    } catch {
        showError("Couldn't copy the link.");
    }
}

function toggleMenu(roomId: string) {
    confirmDelete.value = null;
    menuFor.value = menuFor.value === roomId ? null : roomId;
}

function closeMenu() {
    menuFor.value = null;
    confirmDelete.value = null;
}

function replaceRoom(updated: RoomSummary) {
    const index = rooms.value.findIndex(r => r.roomId === updated.roomId);
    if (index >= 0) rooms.value[index] = updated;
}

async function setKeep(room: RoomSummary, persistent: boolean) {
    closeMenu();
    try {
        replaceRoom(await updateRoom(room.roomId, { persistent }));
    } catch (e) {
        showError(e instanceof Error ? e.message : String(e));
    }
}

async function setLocked(room: RoomSummary, locked: boolean) {
    closeMenu();
    try {
        replaceRoom(await updateRoom(room.roomId, { locked }));
    } catch (e) {
        showError(e instanceof Error ? e.message : String(e));
    }
}

function startRename(room: RoomSummary) {
    closeMenu();
    editing.value = room.roomId;
    nameDraft.value = room.name;
    void nextTick(() => {
        const input = Array.isArray(renameInput.value) ? renameInput.value[0] : renameInput.value;
        input?.focus();
        input?.select();
    });
}

async function saveName(room: RoomSummary) {
    if (editing.value !== room.roomId) return;
    editing.value = null;
    const name = nameDraft.value.trim();
    if (!name || name === room.name) return;
    try {
        replaceRoom(await updateRoom(room.roomId, { name }));
    } catch (e) {
        showError(e instanceof Error ? e.message : String(e));
    }
}

async function remove(room: RoomSummary) {
    if (confirmDelete.value !== room.roomId) {
        confirmDelete.value = room.roomId;
        return;
    }
    closeMenu();
    try {
        await deleteRoom(room.roomId);
        rooms.value = rooms.value.filter(r => r.roomId !== room.roomId);
    } catch (e) {
        showError(e instanceof Error ? e.message : String(e));
    }
}

onMounted(async () => {
    clock = setInterval(() => { now.value = Date.now(); }, 30_000);
    me.value = await fetchMe();
    checking.value = false;
    if (!me.value) return;
    stopWatching = watchRooms({
        onRooms: list => {
            rooms.value = list;
            loaded.value = true;
        },
        onStatus: (value, detail) => {
            status.value = value;
            statusDetail.value = detail ?? '';
        },
    });
});

onBeforeUnmount(() => {
    stopWatching?.();
    if (clock) clearInterval(clock);
    if (errorTimer) clearTimeout(errorTimer);
});
</script>

<style scoped>
.kc-lobby { min-height: 100vh; }
.kc-page { max-width: 1100px; display: flex; flex-direction: column; gap: var(--ot-space-3); }
.kc-dim { color: var(--ot-muted); }

.kc-create { display: flex; align-items: center; gap: var(--ot-space-3); }
.kc-create .ot-input { flex: 1 1 auto; height: 36px; font-size: 14px; }
.kc-create .ot-btn { height: 36px; }
.kc-error { margin: 0; color: var(--ot-negative); font-size: 12.5px; }

.kc-rooms { list-style: none; margin: 0; padding: 0; }
.kc-room {
    display: grid;
    grid-template-columns: 10px minmax(0, 1.2fr) minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--ot-space-4);
    min-height: 60px;
    padding: 8px var(--ot-card-pad);
    border-bottom: 1px solid rgba(146, 196, 130, 0.07);
}
.kc-room:last-child { border-bottom: 0; }
.kc-room:hover { background: rgba(255, 255, 255, 0.015); }
.kc-room-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ot-disabled); }
.kc-room-dot.on { background: var(--ot-positive); box-shadow: 0 0 0 3px var(--ot-positive-soft); }
.kc-room-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.kc-room-name {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    align-self: flex-start;
    gap: 6px;
    max-width: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ot-text);
    font: inherit;
    font-size: 14.5px;
    font-weight: 620;
    text-align: left;
    cursor: pointer;
}
.kc-room-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kc-room-name:hover span { color: var(--ot-accent); }
.kc-room-meta { font-size: 12px; color: var(--ot-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kc-rename .ot-input { height: 30px; font-size: 14px; }

.kc-room-people { display: flex; align-items: center; gap: var(--ot-space-2); min-width: 0; }
.kc-stack { display: inline-flex; flex: 0 0 auto; }
.kc-stack-item { position: relative; display: inline-flex; border-radius: 50%; box-shadow: 0 0 0 2px var(--ot-surface); }
.kc-stack-item + .kc-stack-item { margin-left: -7px; }
.kc-stack-badge { position: absolute; right: -3px; bottom: -3px; padding: 1px; border-radius: 3px; background: var(--ot-accent); color: var(--ot-on-accent); }
.kc-people-names { font-size: 12.5px; color: var(--ot-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.kc-room-actions { display: flex; align-items: center; gap: 4px; }
.kc-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: var(--ot-radius-sm);
    background: none;
    color: var(--ot-text-2);
    cursor: pointer;
}
.kc-icon-btn:hover { background: var(--ot-surface-3); color: var(--ot-text); }
.kc-more { position: relative; }
.kc-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 50;
    min-width: 200px;
    padding: 4px;
    border-radius: var(--ot-radius);
    border: 1px solid var(--ot-line-strong);
    background: var(--ot-surface-2);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
}
.kc-menu button {
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
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
}
.kc-menu button:hover { background: var(--ot-surface-3); }
.kc-menu button.danger { color: var(--ot-negative); }
.kc-backdrop { position: fixed; inset: 0; z-index: 40; }

.kc-guest { display: flex; flex-direction: column; align-items: center; gap: var(--ot-space-3); padding-top: 12vh; }
.kc-joinbox { display: flex; gap: var(--ot-space-2); width: min(460px, 100%); }
.kc-joinbox .ot-input { height: 38px; font-size: 14px; }
.kc-joinbox .ot-btn { height: 38px; }
.kc-signin { font-size: 12.5px; color: var(--ot-text-2); }
.kc-signin:hover { color: var(--ot-accent); }

@media (max-width: 760px) {
    /* Name on its own line; who's there and the actions share the second. */
    .kc-room { grid-template-columns: 10px minmax(0, 1fr) auto; row-gap: 6px; column-gap: var(--ot-space-3); padding: 10px var(--ot-space-3); }
    .kc-room-dot { grid-row: 1; align-self: start; margin-top: 6px; }
    .kc-room-main { grid-column: 2 / 4; grid-row: 1; }
    .kc-room-people { grid-column: 2; grid-row: 2; }
    .kc-room-actions { grid-column: 3; grid-row: 2; }
    .kc-wide { display: none; }
    .kc-create { flex-wrap: wrap; }
    .kc-create .ot-input { flex-basis: 100%; }
}
</style>
