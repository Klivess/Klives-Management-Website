<template>
    <div style="padding: 2rem;">
        <h1 style="color: white; margin-bottom: 20px;">Room: {{ roomName }}</h1>
        <KMInfoBox title="Share Link" :description="currentUrl" style="margin-bottom: 20px; width: 100%; max-width: 600px;" />

        <div style="display: flex; gap: 15px; margin-bottom: 30px;">
            <KMButton 
                @click="toggleMute" 
                :style="{ width: '120px', height: '40px', background: isMuted ? '#cc3333' : '#33cc33' }" 
                :message="isMuted ? 'Unmute' : 'Mute'"
            />
            <KMButton 
                @click="leaveRoom" 
                style="width: 120px; height: 40px; background: #666;" 
                message="Leave Room"
            />
        </div>

        <h3 style="color: white; margin-bottom: 15px;">Participants ({{ peersState.length + 1 }})</h3>
        <div style="display: grid; gap: 15px; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));">
            <div style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 8px; border: 1px solid #4d9e39;">
                <div style="font-weight: bold; color: white;">You ({{ myName }})</div>
                <div style="font-size: 0.8em; color: #aaa;">{{ isMuted ? 'Muted' : 'Speaking' }}</div>
            </div>
            
            <div v-for="peer in peersState" :key="peer.id" style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);">
                <div style="font-weight: bold; color: white;">{{ peer.name || 'Anonymous' }}</div>
                <audio :ref="(el) => setAudioRef(el, peer.id)" autoplay playsinline></audio>
            </div>
        </div>
    </div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Swal from 'sweetalert2';
import { KliveAPIUrl } from '../../scripts/APIInterface';

const route = useRoute();
const router = useRouter();
const roomId = route.params.id;

const wsUrl = KliveAPIUrl.replace('https', 'wss').replace('http', 'ws') + `/klivechat/ws?roomId=${roomId}`;
let ws = null;
let localStream = null;
const peerConnections = {}; // Map<string, RTCPeerConnection>

const myName = ref(localStorage.getItem('KMProfileName') || 'Guest');
const roomName = ref('Loading...');
const currentUrl = ref('');
const isMuted = ref(false);
const peersState = ref([]); // {id, name}
const audioRefs = {};

const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

function setAudioRef(el, id) {
    if (el) {
        audioRefs[id] = el;
        // If we already have the stream ready for this peer, attach it
        if (peerConnections[id] && peerConnections[id]._remoteStream) {
            el.srcObject = peerConnections[id]._remoteStream;
        }
    }
}

async function init() {
    currentUrl.value = window.location.href;
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) {
        console.error("Mic access denied", e);
        Swal.fire('Error', 'Microphone access is required for KliveChat.', 'error');
        return;
    }

    connectWebSocket();
}

function connectWebSocket() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log("Connected to signaling server");
    };

    ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        console.log("WS Message:", msg.type, msg);

        switch (msg.type) {
            case 'room-info':
                roomName.value = msg.payload.roomName;
                msg.payload.users.forEach(u => addPeer(u.id, u.name));
                break;
            case 'user-joined':
                addPeer(msg.payload.id, msg.payload.name);
                // The new user joined, so WE generate the offer to connect to them
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
        }
    };

    ws.onclose = () => {
        console.log("Disconnected from signaling server");
    };
}

function addPeer(id, name) {
    if (!peersState.value.find(p => p.id === id)) {
        peersState.value.push({ id, name });
    }
}

function removePeer(id) {
    peersState.value = peersState.value.filter(p => p.id !== id);
    if (peerConnections[id]) {
        peerConnections[id].close();
        delete peerConnections[id];
    }
    delete audioRefs[id];
}

function createPeerConnection(targetId) {
    const pc = new RTCPeerConnection(iceServers);

    // Provide local stream
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            sendWSMessage('ice-candidate', targetId, event.candidate);
        }
    };

    pc.ontrack = (event) => {
        pc._remoteStream = event.streams[0];
        if (audioRefs[targetId]) {
            audioRefs[targetId].srcObject = pc._remoteStream;
        }
    };

    peerConnections[targetId] = pc;
    return pc;
}

async function createOffer(targetId) {
    const pc = createPeerConnection(targetId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendWSMessage('offer', targetId, offer);
}

async function handleOffer(senderId, offer) {
    let pc = peerConnections[senderId];
    if (!pc) {
        pc = createPeerConnection(senderId);
    }
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendWSMessage('answer', senderId, answer);
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

function sendWSMessage(type, targetId, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, targetId, payload }));
    }
}

function toggleMute() {
    if (localStream) {
        isMuted.value = !isMuted.value;
        localStream.getAudioTracks().forEach(t => t.enabled = !isMuted.value);
    }
}

function leaveRoom() {
    router.push('/klivechat');
}

onMounted(() => {
    init();
});

onUnmounted(() => {
    if (ws) ws.close();
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
    }
    Object.values(peerConnections).forEach(pc => pc.close());
});
</script>

