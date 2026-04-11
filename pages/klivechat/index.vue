<template>
    <div class="klivechat-lobby">
        <div class="klivechat-aurora"></div>
        <div class="klivechat-grid"></div>

        <main class="lobby-frame">
            <section class="panel hero-panel">
                <div class="eyebrow">KLIVECHAT / NETWORK CONSOLE</div>
                <div class="hero-header">
                    <div>
                        <h1>Voice rooms with a command-deck surface.</h1>
                        <p>Open a room, join the mesh, and hand off screens or camera feeds from a single terminal-style hub.</p>
                    </div>

                    <div class="hero-metrics">
                        <div class="metric-card">
                            <span>OPERATOR</span>
                            <strong>{{ currentName || 'Guest' }}</strong>
                        </div>
                        <div class="metric-card">
                            <span>ACCESS</span>
                            <strong>{{ isHighRank ? 'ADMIN' : 'STANDARD' }}</strong>
                        </div>
                        <div class="metric-card">
                            <span>ACTIVE</span>
                            <strong>{{ activeRooms.length }}</strong>
                        </div>
                    </div>
                </div>
            </section>

            <section class="panel create-panel">
                <div class="panel-top">
                    <div>
                        <div class="eyebrow">CREATE ROOM</div>
                        <h2>Open a new signal channel</h2>
                    </div>
                    <div class="panel-note">Guest+ to create</div>
                </div>

                <div class="create-row">
                    <input
                        v-model="newRoomName"
                        class="room-input"
                        placeholder="Name your new voice room..."
                        @keyup.enter="createRoom"
                    />
                    <button class="primary-button" type="button" @click="createRoom">CREATE ROOM</button>
                </div>

                <div class="helper-row">
                    <span class="status-pill">SHAREABLE LINKS</span>
                    <span class="status-pill">SCREEN SHARE READY</span>
                    <span class="status-pill">AUTO REFRESH ON</span>
                </div>
            </section>

            <section class="panel rooms-panel">
                <div class="panel-top">
                    <div>
                        <div class="eyebrow">ACTIVE ROOMS</div>
                        <h2>{{ activeRooms.length }} live channels</h2>
                    </div>
                    <div class="panel-note">SYNCING EVERY 10 SECONDS</div>
                </div>

                <div class="rooms-grid">
                    <article v-for="room in activeRooms" :key="room.roomId" class="room-card">
                        <div class="room-card-top">
                            <div>
                                <div class="room-name">{{ room.name }}</div>
                                <div class="room-host">HOST {{ room.createdBy }}</div>
                            </div>
                            <div class="room-meter">{{ room.userCount }} ONLINE</div>
                        </div>

                        <div class="room-actions">
                            <button class="primary-button" type="button" @click="joinRoom(room.roomId)">JOIN ROOM</button>
                            <button
                                v-if="room.createdBy === currentName || isHighRank"
                                class="danger-button"
                                type="button"
                                @click="deleteRoom(room.roomId)"
                            >
                                DELETE
                            </button>
                        </div>
                    </article>

                    <div v-if="activeRooms.length === 0" class="empty-state">
                        No active rooms yet. Create the first one above.
                    </div>
                </div>
            </section>
        </main>
    </div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });

import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Swal from 'sweetalert2';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '../../scripts/APIInterface';

const router = useRouter();
const newRoomName = ref('');
const activeRooms = ref([]);
const currentName = ref('');
const isHighRank = ref(false);

let refreshTimer = null;

async function loadRooms() {
    try {
        const response = await RequestGETFromKliveAPI('/klivechat/rooms', false, false);
        if (response && response.ok) {
            const data = await response.json();
            activeRooms.value = Array.isArray(data) ? data : [];
        }
    } catch (error) {
        console.error('Failed to fetch rooms:', error);
    }
}

async function createRoom() {
    const roomName = newRoomName.value.trim();
    if (!roomName) {
        Swal.fire({
            icon: 'warning',
            title: 'Wait',
            text: 'Please enter a name for your room.',
            background: '#161516',
            color: '#fff'
        });
        return;
    }

    try {
        const response = await RequestPOSTFromKliveAPI(`/klivechat/create?name=${encodeURIComponent(roomName)}`);
        if (response.ok) {
            const data = await response.json();
            newRoomName.value = '';
            router.push(`/shared/klivechat/${data.roomId}`);
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Failed to create room. Check your permissions (Guest+)',
                background: '#161516',
                color: '#fff'
            });
        }
    } catch (error) {
        console.error('Failed to create room:', error);
    }
}

function joinRoom(id) {
    router.push(`/shared/klivechat/${id}`);
}

async function deleteRoom(id) {
    const result = await Swal.fire({
        title: 'Delete Room?',
        text: 'Are you sure you want to delete this room? All active connections will be severed.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#cc3333',
        cancelButtonColor: '#555',
        confirmButtonText: 'Yes, delete it',
        background: '#161516',
        color: '#fff'
    });

    if (result.isConfirmed) {
        try {
            const response = await RequestPOSTFromKliveAPI(`/klivechat/delete?id=${id}`);
            if (response.ok) {
                Swal.fire({ title: 'Deleted!', icon: 'success', background: '#161516', color: '#fff' });
                await loadRooms();
            } else {
                Swal.fire({ title: 'Error', text: 'Failed to delete room.', icon: 'error', background: '#161516', color: '#fff' });
            }
        } catch (error) {
            console.error(error);
        }
    }
}

async function fetchMe() {
    try {
        const response = await RequestGETFromKliveAPI('/klivechat/me', false, false);
        if (response && response.ok) {
            const data = await response.json();
            currentName.value = data?.name || '';
            isHighRank.value = Number(data?.rank ?? 0) >= 4;
            return;
        }
    } catch (error) {
        console.error('Failed to get my profile data:', error);
    }

    currentName.value = '';
    isHighRank.value = false;
}

onMounted(() => {
    if (process.client) {
        void fetchMe();
    }

    void loadRooms();
    refreshTimer = window.setInterval(() => {
        void loadRooms();
    }, 10000);
});

onUnmounted(() => {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
});
</script>

<style scoped>
.klivechat-lobby {
    min-height: calc(100vh - 70px);
    position: relative;
    overflow: hidden;
    padding: 18px 0 40px;
    background: linear-gradient(180deg, #201f20 0%, #161616 100%);
}

.klivechat-lobby::before,
.klivechat-lobby::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
}

.klivechat-lobby::before {
    background-image: linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
    background-size: 56px 56px;
    opacity: 0.04;
}

.klivechat-lobby::after {
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.12));
}

.klivechat-grid,
.klivechat-aurora {
    display: none;
}

.lobby-frame {
    position: relative;
    z-index: 1;
    width: min(1500px, calc(100% - 32px));
    margin: 0 auto;
    display: grid;
    gap: 18px;
}

.panel {
    background: rgba(22, 22, 22, 0.94);
    border: 1px solid #2e2e2e;
    border-radius: 20px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.hero-panel,
.create-panel,
.rooms-panel {
    padding: 20px;
}

.eyebrow {
    color: #4d9e39;
    font-size: 0.74rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    margin-bottom: 10px;
}

.hero-header {
    display: grid;
    gap: 18px;
    grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
    align-items: start;
}

.hero-header h1,
.panel-top h2 {
    margin: 0;
    color: #f6fff3;
    font-size: clamp(2rem, 4vw, 3.2rem);
    line-height: 1.05;
}

.hero-header p,
.panel-top p,
.room-host,
.empty-state {
    color: #969696;
}

.hero-header p {
    margin-top: 10px;
    max-width: 58rem;
    font-size: 1rem;
}

.hero-metrics {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

.metric-card {
    padding: 14px;
    border-radius: 18px;
    background: rgba(0, 0, 0, 0.18);
    border: 1px solid #2e2e2e;
}

.metric-card span,
.panel-note,
.room-meter,
.status-pill {
    display: block;
    color: #4d9e39;
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
}

.metric-card strong {
    display: block;
    margin-top: 8px;
    color: #f6fff3;
    font-size: 1.05rem;
}

.panel-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}

.panel-note {
    padding-top: 6px;
}

.create-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    margin-top: 18px;
}

.room-input {
    width: 100%;
    box-sizing: border-box;
    border: none;
    background: #1d1d1d;
    color: #4d9e39;
    border-radius: 25px;
    padding: 7px 12px;
    font-family: 'Roboto';
    font-size: 20px;
    outline: none;
    transition: 0.4s;
}

.room-input:hover,
.room-input:focus {
    border-bottom: 4px solid #4d9e39;
    outline: none;
}

.primary-button,
.danger-button {
    border: 2px solid #2e2e2e;
    border-radius: 16px;
    min-height: 44px;
    padding: 0 18px;
    font: inherit;
    cursor: pointer;
    letter-spacing: 0.2125rem;
    line-height: 1;
    text-transform: uppercase;
    background: transparent;
    color: #4d9e39;
    transition: background-color 0.2s cubic-bezier(0.19, 1, 0.22, 1), border 1s cubic-bezier(0.19, 1, 0.22, 1), color 0.6s cubic-bezier(0.19, 1, 0.22, 1), transform 0.2s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.primary-button:hover,
.danger-button:hover {
    background-color: rgba(255, 255, 255, 0.05);
    border-color: #fff;
    box-shadow: 0 0 5px rgba(255, 245, 245, 0.8);
    color: #fff;
    transform: translateY(-1px);
}

.danger-button {
    color: #cc3333;
}

.helper-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 16px;
}

.status-pill {
    padding: 9px 12px;
    border-radius: 999px;
    border: 2px solid #2e2e2e;
    background: transparent;
    color: #4d9e39;
}

.rooms-grid {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    margin-top: 18px;
}

.room-card {
    padding: 18px;
    border-radius: 20px;
    border: 1px solid #2e2e2e;
    background: rgba(22, 22, 22, 0.96);
    display: grid;
    gap: 16px;
}

.room-card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}

.room-name {
    color: #fff;
    font-size: 1.05rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.room-host {
    margin-top: 6px;
    font-size: 0.82rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.room-meter {
    align-self: center;
    padding: 9px 12px;
    border-radius: 999px;
    background: transparent;
    border: 2px solid #2e2e2e;
    color: #4d9e39;
    white-space: nowrap;
}

.room-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.empty-state {
    padding: 14px 16px;
    border-radius: 18px;
    border: 1px dashed #2e2e2e;
    background: rgba(0, 0, 0, 0.16);
}

@media (max-width: 980px) {
    .hero-header {
        grid-template-columns: 1fr;
    }

    .hero-metrics {
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    }
}

@media (max-width: 720px) {
    .klivechat-lobby {
        padding-top: 12px;
    }

    .lobby-frame {
        width: calc(100% - 24px);
    }

    .hero-panel,
    .create-panel,
    .rooms-panel {
        padding: 18px;
    }

    .create-row {
        grid-template-columns: 1fr;
    }

    .rooms-grid {
        grid-template-columns: 1fr;
    }
}
</style>