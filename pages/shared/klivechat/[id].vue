<template>
    <div class="klivechat-shell">
        <div class="klivechat-grid"></div>
        <div class="klivechat-aurora"></div>

        <main class="klivechat-frame">
            <section class="panel hero-panel">
                <div class="hero-header">
                    <div>
                        <div class="eyebrow">KLIVECHAT / ROOM {{ roomId }}</div>
                        <h1>{{ roomName }}</h1>
                        <p>Share the room link, manage your microphone and camera, and keep the call aligned from a single dashboard-style surface.</p>
                    </div>

                    <div class="room-id-badge">
                        ID {{ roomId }}
                    </div>
                </div>

                <div class="status-row">
                    <span class="status-pill status-pill--active">YOU {{ myName || 'Loading...' }}</span>
                    <span class="status-pill">{{ isMuted ? 'MIC MUTED' : 'MIC LIVE' }}</span>
                    <span class="status-pill">{{ isVideo ? 'VIDEO ON' : 'VIDEO OFF' }}</span>
                    <span class="status-pill">{{ isScreenSharing ? 'SCREEN SHARING' : 'NO SCREEN SHARE' }}</span>
                </div>
            </section>

            <section class="panel link-panel">
                <div class="panel-top">
                    <div>
                        <div class="eyebrow">SHARE LINK</div>
                        <h2>Invite other people to this room</h2>
                    </div>
                    <div class="panel-note">COPY FROM THE BROWSER URL</div>
                </div>

                <div class="link-stack">
                    <input class="link-input" :value="currentUrl" readonly />
                    <div class="link-meta">
                        <span>{{ currentUrl || 'Waiting for browser URL...' }}</span>
                        <button class="ghost-button compact" type="button" @click="copyShareLink">COPY LINK</button>
                    </div>
                    <div v-if="copyStatus" class="status-pill status-pill--active">
                        {{ copyStatus }}
                    </div>
                </div>
            </section>

            <section class="panel controls-panel">
                <div class="panel-top">
                    <div>
                        <div class="eyebrow">SESSION CONTROLS</div>
                        <h2>Manage audio and media</h2>
                    </div>
                    <div class="panel-note">WEBCAM AND SCREEN SHARE READY</div>
                </div>

                <div class="control-strip">
                    <button class="control-tile" type="button" :class="{ active: !isMuted }" @click="toggleMute">
                        <span class="control-title">{{ isMuted ? 'Unmute mic' : 'Mute mic' }}</span>
                        <span class="control-copy">Toggle your microphone without leaving the room.</span>
                        <span class="control-chip">{{ isMuted ? 'OFF' : 'ON' }}</span>
                    </button>

                    <button class="control-tile" type="button" :class="{ active: isVideo }" @click="toggleVideo">
                        <span class="control-title">{{ isVideo ? 'Disable camera' : 'Enable camera' }}</span>
                        <span class="control-copy">Send your camera feed to the room when you need it.</span>
                        <span class="control-chip">{{ isVideo ? 'LIVE' : 'OFF' }}</span>
                    </button>

                    <button class="control-tile" type="button" :class="{ active: isScreenSharing }" @click="toggleScreenShare">
                        <span class="control-title">{{ isScreenSharing ? 'Stop screen share' : 'Share screen' }}</span>
                        <span class="control-copy">Present a browser tab or desktop capture.</span>
                        <span class="control-chip">{{ isScreenSharing ? 'LIVE' : 'OFF' }}</span>
                    </button>

                    <button class="control-tile danger" type="button" @click="leaveRoom">
                        <span class="control-title">Leave room</span>
                        <span class="control-copy">Cleanly disconnect and return to the main dashboard.</span>
                        <span class="control-chip">EXIT</span>
                    </button>
                </div>
            </section>

            <section class="panel roster-panel">
                <div class="panel-top">
                    <div>
                        <div class="eyebrow">PARTICIPANTS</div>
                        <h2>{{ peersState.length + 1 }} connected</h2>
                    </div>
                    <div class="panel-note">{{ focusedPeerId ? 'FOCUS MODE' : 'GRID MODE' }}</div>
                </div>

                <div :class="['participant-grid', { 'has-focus': focusedPeerId !== null }]">
                    <div
                        :class="['participant-card', { focused: focusedPeerId === 'local' }]"
                        @click="toggleFocus('local')"
                    >
                        <div class="participant-head">
                            <div>
                                <div class="participant-name">You · {{ myName }}</div>
                                <div class="participant-state">{{ isMuted ? 'Muted' : 'Speaking' }}</div>
                            </div>
                            <canvas ref="localVisualizer" width="60" height="20" class="signal-meter"></canvas>
                        </div>

                        <div class="media-frame">
                            <video ref="localVideo" class="participant-video" autoplay playsinline muted></video>
                        </div>
                    </div>

                    <div
                        v-for="peer in peersState"
                        :key="peer.id"
                        :class="['participant-card', { focused: focusedPeerId === peer.id }]"
                        @click="toggleFocus(peer.id)"
                    >
                        <div class="participant-head">
                            <div>
                                <div class="participant-name">{{ peer.name || 'Anonymous' }}</div>
                                <div class="participant-state">Connected</div>
                            </div>
                            <canvas :ref="(el) => setPeerVisualizerRef(el, peer.id)" width="60" height="20" class="signal-meter"></canvas>
                        </div>

                        <div class="media-frame">
                            <video :ref="(el) => setAudioRef(el, peer.id)" class="participant-video" autoplay playsinline></video>
                        </div>
                    </div>

                    <div v-if="peersState.length === 0" class="empty-room">
                        No participants yet. Share the room link to bring someone in.
                    </div>
                </div>
            </section>
        </main>
    </div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });

import { onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Swal from 'sweetalert2';
import { KliveAPIUrl, RequestGETFromKliveAPI } from '../../../scripts/APIInterface';

const route = useRoute();
const router = useRouter();
const roomId = String(route.params.id);

const layoutName = ref('navbar');
const focusedPeerId = ref(null);
const copyStatus = ref('');
let copyStatusTimer = null;

function toggleFocus(id) {
    focusedPeerId.value = focusedPeerId.value === id ? null : id;
}

let wsUrl = KliveAPIUrl.replace('https', 'wss').replace('http', 'ws') + `/klivechat/ws?roomId=${roomId}`;
let ws = null;
let localStream = null;
const peerConnections = {};

const myName = ref('');
const roomName = ref('Loading...');
const currentUrl = ref('');
const isMuted = ref(false);
const isVideo = ref(false);
const isScreenSharing = ref(false);
const peersState = ref([]);
const audioRefs = {};

const localVisualizer = ref(null);
const peerVisualizers = {};
let audioContext = null;
let drawVisualizerLoop = null;
let localAnalyser = null;
const peerAnalysers = {};

const localVideo = ref(null);

const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

function setAudioRef(el, id) {
    if (el) {
        audioRefs[id] = el;
        if (peerConnections[id] && peerConnections[id]._remoteStream) {
            if (el.srcObject !== peerConnections[id]._remoteStream) {
                el.srcObject = peerConnections[id]._remoteStream;
                setupPeerVisualizer(peerConnections[id]._remoteStream, id);
            }
        }
    }
}

function setPeerVisualizerRef(el, id) {
    if (el) {
        peerVisualizers[id] = el;
    }
}

async function init() {
    currentUrl.value = window.location.href;

    let lsName = '';
    try {
        const response = await RequestGETFromKliveAPI('/klivechat/me', false, false);
        if (response && response.ok) {
            const data = await response.json();
            lsName = data.name || '';
        }
    } catch (error) {
        console.error('Failed to parse my profile name:', error);
    }

    if (!lsName || lsName.trim() === '') {
        lsName = await getGuestName();
        layoutName.value = 'empty';
    } else {
        layoutName.value = 'navbar';
    }

    myName.value = lsName;
    wsUrl += '&name=' + encodeURIComponent(lsName);

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo.value });
        if (localVideo.value) {
            localVideo.value.srcObject = localStream;
        }
        setupLocalVisualizer();
        connectWebSocket();
    } catch (error) {
        console.error('Mic access denied', error);
        Swal.fire({
            title: 'Error',
            text: 'Microphone access is required to use KliveChat.',
            icon: 'error',
            background: '#161516',
            color: '#fff'
        });
    }
}

async function getGuestName() {
    const { value: name } = await Swal.fire({
        title: 'Join Room',
        text: 'Please enter a display name to join:',
        input: 'text',
        allowOutsideClick: false,
        allowEscapeKey: false,
        background: '#161516',
        color: '#fff',
        inputValidator: (value) => {
            if (!value) return 'You need to write something!';
            return undefined;
        }
    });

    return name || 'Guest_' + Math.floor(Math.random() * 1000);
}

function setupLocalVisualizer() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const source = audioContext.createMediaStreamSource(localStream);
    localAnalyser = audioContext.createAnalyser();
    localAnalyser.fftSize = 64;
    source.connect(localAnalyser);
}

function setupPeerVisualizer(stream, id) {
    if (!audioContext) return;

    try {
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        peerAnalysers[id] = analyser;
    } catch (error) {
        console.error('Failed to setup peer visualizer, perhaps no audio track.', error);
    }
}

function renderVisualizers() {
    drawVisualizerLoop = requestAnimationFrame(renderVisualizers);

    if (localVisualizer.value && localAnalyser) {
        drawCanvas(localVisualizer.value, localAnalyser, '#4d9e39');
    }

    for (const id in peerVisualizers) {
        const canvas = peerVisualizers[id];
        const analyser = peerAnalysers[id];
        if (canvas && analyser) {
            drawCanvas(canvas, analyser, '#33cc33');
        }
    }
}

function drawCanvas(canvas, analyser, color) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
    }

    const average = sum / dataArray.length;

    ctx.clearRect(0, 0, width, height);

    const fillWidth = (average / 255) * width;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, fillWidth, height);
}

function connectWebSocket() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('Connected to signaling server');
        if (!drawVisualizerLoop) {
            renderVisualizers();
        }
    };

    ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
            case 'room-info':
                roomName.value = msg.payload.roomName;
                msg.payload.users.forEach((user) => addPeer(user.id, user.name));
                break;
            case 'user-joined':
                addPeer(msg.payload.id, msg.payload.name);
                await createOffer(msg.payload.id);
                break;
            case 'user-left':
                removePeer(msg.payload.id);
                break;
            case 'offer':
                await handleOffer(msg.senderId, msg.payload);
                break;
            case 'answer':
                await handleAnswer(msg.senderId, msg.payload);
                break;
            case 'ice-candidate':
                await handleIceCandidate(msg.senderId, msg.payload);
                break;
            case 'renegotiate':
                await handleRenegotiate(msg.senderId);
                break;
        }
    };

    ws.onclose = () => {
        console.log('Disconnected from signaling server');
    };
}

function addPeer(id, name) {
    if (!peersState.value.find((peer) => peer.id === id)) {
        peersState.value.push({ id, name });
    }
}

function removePeer(id) {
    peersState.value = peersState.value.filter((peer) => peer.id !== id);
    if (peerConnections[id]) {
        peerConnections[id].close();
        delete peerConnections[id];
    }
    delete audioRefs[id];
    delete peerVisualizers[id];
    delete peerAnalysers[id];
}

function createPeerConnection(targetId) {
    const pc = new RTCPeerConnection(iceServers);

    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            sendWSMessage('ice-candidate', targetId, event.candidate);
        }
    };

    pc.ontrack = (event) => {
        pc._remoteStream = event.streams[0];
        if (audioRefs[targetId]) {
            audioRefs[targetId].srcObject = pc._remoteStream;
            setupPeerVisualizer(pc._remoteStream, targetId);
        }
    };

    pc.onnegotiationneeded = async () => {
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendWSMessage('offer', targetId, pc.localDescription);
        } catch (error) {
            console.error('Negotiation failed', error);
        }
    };

    peerConnections[targetId] = pc;
    return pc;
}

async function createOffer(targetId) {
    createPeerConnection(targetId);
}

async function handleOffer(senderId, offer) {
    let pc = peerConnections[senderId];
    if (!pc) {
        pc = createPeerConnection(senderId);
    }
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendWSMessage('answer', senderId, pc.localDescription);
}

async function handleAnswer(senderId, answer) {
    const pc = peerConnections[senderId];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
}

async function handleIceCandidate(senderId, candidate) {
    const pc = peerConnections[senderId];
    if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
}

async function handleRenegotiate() {
    // Negotiation is handled by the peer connection event.
}

function sendWSMessage(type, targetId, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, targetId, payload }));
    }
}

function toggleMute() {
    if (localStream) {
        isMuted.value = !isMuted.value;
        localStream.getAudioTracks().forEach((track) => {
            track.enabled = !isMuted.value;
        });
    }
}

async function toggleVideo() {
    isVideo.value = !isVideo.value;

    if (isVideo.value) {
        try {
            if (isScreenSharing.value) {
                isScreenSharing.value = false;
                const videoTracks = localStream.getVideoTracks();
                videoTracks.forEach((track) => {
                    track.stop();
                    localStream.removeTrack(track);
                });
            }

            const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            const videoTrack = newStream.getVideoTracks()[0];
            localStream.addTrack(videoTrack);

            Object.values(peerConnections).forEach((pc) => {
                const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(videoTrack);
                } else {
                    pc.addTrack(videoTrack, localStream);
                }
            });

            if (localVideo.value) {
                localVideo.value.srcObject = localStream;
            }
        } catch (error) {
            console.error('Camera access failed', error);
            isVideo.value = false;
        }
    } else {
        const videoTracks = localStream.getVideoTracks();
        videoTracks.forEach((track) => {
            track.enabled = false;
            track.stop();
            localStream.removeTrack(track);
        });

        Object.values(peerConnections).forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
            if (sender) {
                pc.removeTrack(sender);
            }
        });
    }
}

async function toggleScreenShare() {
    if (isScreenSharing.value) {
        isScreenSharing.value = false;

        const videoTracks = localStream.getVideoTracks();
        videoTracks.forEach((track) => {
            track.enabled = false;
            track.stop();
            localStream.removeTrack(track);
        });

        if (isVideo.value) {
            try {
                const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                const videoTrack = newStream.getVideoTracks()[0];
                localStream.addTrack(videoTrack);

                Object.values(peerConnections).forEach((pc) => {
                    const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
                    if (sender) {
                        sender.replaceTrack(videoTrack);
                    }
                });
            } catch (error) {
                console.error('Reverting to camera failed', error);
                isVideo.value = false;
            }
        } else {
            Object.values(peerConnections).forEach((pc) => {
                const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
                if (sender) {
                    pc.removeTrack(sender);
                }
            });
        }
    } else {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            const screenTrack = screenStream.getVideoTracks()[0];

            screenTrack.onended = () => {
                if (isScreenSharing.value) {
                    toggleScreenShare();
                }
            };

            if (isVideo.value) {
                isVideo.value = false;
            }

            isScreenSharing.value = true;

            const videoTracks = localStream.getVideoTracks();
            videoTracks.forEach((track) => {
                track.stop();
                localStream.removeTrack(track);
            });

            localStream.addTrack(screenTrack);

            Object.values(peerConnections).forEach((pc) => {
                const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(screenTrack);
                } else {
                    pc.addTrack(screenTrack, localStream);
                }
            });

            if (localVideo.value) {
                localVideo.value.srcObject = localStream;
            }
        } catch (error) {
            console.error('Screen share access failed', error);
            isScreenSharing.value = false;
        }
    }
}

async function copyShareLink() {
    if (!currentUrl.value) {
        currentUrl.value = window.location.href;
    }

    try {
        await navigator.clipboard.writeText(currentUrl.value);
        copyStatus.value = 'Link copied.';

        if (copyStatusTimer) {
            clearTimeout(copyStatusTimer);
        }

        copyStatusTimer = window.setTimeout(() => {
            copyStatus.value = '';
        }, 1800);
    } catch (error) {
        console.error('Copy failed', error);
        copyStatus.value = 'Clipboard copy failed.';
    }
}

function leaveRoom() {
    if (layoutName.value === 'empty') {
        router.push('/');
    } else {
        router.push('/dashboard');
    }
}

onMounted(() => {
    if (process.client) {
        init();
    }
});

onUnmounted(() => {
    if (copyStatusTimer) {
        clearTimeout(copyStatusTimer);
    }

    if (drawVisualizerLoop) {
        cancelAnimationFrame(drawVisualizerLoop);
    }

    if (audioContext) {
        audioContext.close();
    }

    if (ws) {
        ws.close();
    }

    if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
    }

    Object.values(peerConnections).forEach((pc) => pc.close());
});
</script>

<style scoped>
.klivechat-shell {
    min-height: 100vh;
    position: relative;
    overflow: hidden;
    padding: 28px clamp(16px, 3vw, 32px) 40px;
    background: linear-gradient(180deg, #201f20 0%, #161616 100%);
}

.klivechat-shell::before,
.klivechat-shell::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
}

.klivechat-shell::before {
    background-image: linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
    background-size: 56px 56px;
    opacity: 0.06;
}

.klivechat-shell::after {
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.16), rgba(0, 0, 0, 0.28));
}

.klivechat-grid {
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgba(0, 0, 0, 0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.16) 1px, transparent 1px);
    background-size: 22px 22px;
    opacity: 0.05;
    pointer-events: none;
}

.klivechat-aurora {
    position: absolute;
    inset: -18% auto auto -10%;
    width: 40vw;
    height: 40vw;
    min-width: 320px;
    min-height: 320px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(77, 158, 57, 0.12) 0%, rgba(77, 158, 57, 0.04) 30%, transparent 70%);
    filter: blur(22px);
    pointer-events: none;
}

.klivechat-frame {
    position: relative;
    z-index: 1;
    width: min(1500px, 100%);
    margin: 0 auto;
    display: grid;
    gap: 18px;
}

.panel {
    background: rgba(22, 22, 22, 0.94);
    border: 1px solid #2e2e2e;
    border-radius: 22px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.hero-panel,
.link-panel,
.controls-panel,
.roster-panel {
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
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
}

.hero-header h1,
.panel-top h2 {
    margin: 0;
    color: #f6fff3;
    font-size: clamp(2rem, 4vw, 3.2rem);
    line-height: 1.05;
}

.hero-header p,
.panel-note,
.link-meta,
.participant-state {
    color: #969696;
}

.hero-header p {
    margin-top: 10px;
    max-width: 58rem;
    font-size: 1rem;
}

.room-id-badge {
    align-self: center;
    padding: 10px 12px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.18);
    border: 1px solid #2e2e2e;
    color: #4d9e39;
    font-size: 0.78rem;
    letter-spacing: 0.18em;
    white-space: nowrap;
}

.status-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 18px;
}

.status-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    border-radius: 999px;
    border: 1px solid #2e2e2e;
    background: rgba(0, 0, 0, 0.18);
    color: #4d9e39;
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.status-pill--active {
    color: #ffffff;
    border-color: #ffffff;
    box-shadow: 0 0 5px rgba(255, 245, 245, 0.5);
}

.panel-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}

.panel-note {
    padding-top: 6px;
    font-size: 0.78rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
}

.link-stack {
    display: grid;
    gap: 12px;
    margin-top: 16px;
}

.link-input {
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

.link-input:hover,
.link-input:focus {
    border-bottom: 4px solid #4d9e39;
}

.link-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.88rem;
}

.ghost-button,
.control-tile {
    border: 2px solid #2e2e2e;
    border-radius: 16px;
    font: inherit;
    cursor: pointer;
    transition: background-color 0.2s cubic-bezier(0.19, 1, 0.22, 1), border 1s cubic-bezier(0.19, 1, 0.22, 1), color 0.6s cubic-bezier(0.19, 1, 0.22, 1), transform 0.2s ease;
    user-select: none;
}

.ghost-button {
    min-height: 38px;
    padding: 0 14px;
    letter-spacing: 0.2125rem;
    line-height: 1;
    text-transform: uppercase;
    background: transparent;
    color: #4d9e39;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.ghost-button:hover,
.control-tile:hover {
    background-color: rgba(255, 255, 255, 0.05);
    border-color: #fff;
    box-shadow: 0 0 5px rgba(255, 245, 245, 0.8);
    color: #fff;
    transform: translateY(-1px);
}

.control-strip {
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    margin-top: 16px;
}

.control-tile {
    min-height: 128px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-start;
    padding: 18px;
    background: rgba(0, 0, 0, 0.12);
    color: #4d9e39;
}

.control-tile.active {
    background: rgba(255, 255, 255, 0.04);
    border-color: #fff;
    color: #fff;
}

.control-tile.danger {
    color: #cc3333;
}

.control-title {
    color: inherit;
    font-size: 1rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
}

.control-copy {
    font-size: 0.86rem;
    line-height: 1.45;
    text-align: left;
}

.control-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 68px;
    padding: 7px 10px;
    border-radius: 999px;
    background: transparent;
    border: 1px solid #2e2e2e;
    color: #4d9e39;
    font-size: 0.74rem;
    letter-spacing: 0.12em;
}

.participant-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
    align-items: start;
    margin-top: 16px;
}

.participant-grid.has-focus .participant-card:not(.focused) {
    opacity: 0.8;
}

.participant-card {
    padding: 16px;
    border-radius: 22px;
    border: 1px solid #2e2e2e;
    background: rgba(22, 22, 22, 0.96);
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.participant-card:hover {
    transform: translateY(-2px);
    border-color: #fff;
}

.participant-card.focused {
    grid-column: 1 / -1;
    border-color: #fff;
    box-shadow: 0 0 5px rgba(255, 245, 245, 0.8);
}

.participant-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
}

.participant-name {
    color: #fff;
    font-size: 0.98rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.participant-state {
    margin-top: 4px;
    font-size: 0.76rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
}

.signal-meter {
    flex: 0 0 auto;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid #2e2e2e;
}

.media-frame {
    overflow: hidden;
    border-radius: 18px;
    background: radial-gradient(circle at top, rgba(77, 158, 57, 0.08), rgba(0, 0, 0, 0.85));
    border: 1px solid #2e2e2e;
}

.participant-video {
    display: block;
    width: 100%;
    min-height: 240px;
    max-height: 72vh;
    object-fit: cover;
    background: transparent;
}

.participant-card.focused .participant-video {
    min-height: 50vh;
    object-fit: contain;
}

.empty-room {
    margin-top: 16px;
    padding: 14px 16px;
    border-radius: 18px;
    border: 1px dashed #2e2e2e;
    background: rgba(0, 0, 0, 0.16);
    color: #969696;
}

@media (max-width: 920px) {
    .hero-header,
    .panel-top,
    .link-meta {
        flex-direction: column;
        align-items: flex-start;
    }

    .room-id-badge {
        align-self: flex-start;
    }

    .participant-grid {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 620px) {
    .klivechat-shell {
        padding-inline: 12px;
    }

    .hero-panel,
    .link-panel,
    .controls-panel,
    .roster-panel {
        padding: 18px;
    }

    .control-tile {
        min-height: 112px;
    }

    .participant-video {
        min-height: 180px;
    }
}
</style>
