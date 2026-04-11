<template>
    <NuxtLayout :name="layoutName">
        <div style="padding: 2rem; min-height: 100vh; background: #161516;">
            <h1 style="color: white; margin-bottom: 20px;">Room: {{ roomName }}</h1>
            <KMInfoBox title="Share Link" :description="currentUrl" style="margin-bottom: 20px; width: 100%; max-width: 600px;" />

            <div style="display: flex; gap: 15px; margin-bottom: 30px;">
                <KMButton 
                    @click="toggleMute" 
                    :style="{ padding: '0 20px', minWidth: '120px', height: '40px', background: isMuted ? '#cc3333' : '#33cc33' }" 
                    :message="isMuted ? 'Unmute' : 'Mute'"
                />
                <KMButton 
                    @click="toggleVideo" 
                    :style="{ padding: '0 20px', minWidth: '120px', height: '40px', background: isVideo ? '#cc3333' : '#33cc33' }" 
                    :message="isVideo ? 'Video Off' : 'Video On'"
                />
                <KMButton 
                    @click="leaveRoom" 
                    style="padding: 0 20px; min-width: 120px; height: 40px; background: #666;" 
                    message="Leave Room"
                />
            </div>

            <h3 style="color: white; margin-bottom: 15px;">Participants ({{ peersState.length + 1 }})</h3>
            <div style="display: grid; gap: 15px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));">
                <div style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 8px; border: 1px solid #4d9e39;">
                    <div style="font-weight: bold; color: white; display: flex; justify-content: space-between;">
                        You ({{ myName }})
                        <canvas ref="localVisualizer" width="60" height="20" style="border-radius: 3px; background: rgba(0,0,0,0.5);"></canvas>
                    </div>
                    <div style="font-size: 0.8em; color: #aaa; margin-bottom: 10px;">{{ isMuted ? 'Muted' : 'Speaking' }}</div>
                    <video ref="localVideo" autoplay playsinline muted style="width: 100%; border-radius: 4px; background: transparent; max-height: 200px; object-fit: cover;"></video>
                </div>
                
                <div v-for="peer in peersState" :key="peer.id" style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);">
                    <div style="font-weight: bold; color: white; display: flex; justify-content: space-between;">
                        {{ peer.name || 'Anonymous' }}
                        <canvas :ref="(el) => setPeerVisualizerRef(el, peer.id)" width="60" height="20" style="border-radius: 3px; background: rgba(0,0,0,0.5);"></canvas>
                    </div>
                    <div style="font-size: 0.8em; color: #aaa; margin-bottom: 10px;">Connected</div>
                    <video :ref="(el) => setAudioRef(el, peer.id)" autoplay playsinline style="width: 100%; border-radius: 4px; background: transparent; max-height: 200px; object-fit: cover;"></video>
                </div>
            </div>
        </div>
    </NuxtLayout>
</template>

<script setup>
definePageMeta({ layout: false });
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Swal from 'sweetalert2';
import { KliveAPIUrl, RequestGETFromKliveAPI } from '../../../scripts/APIInterface';

const layoutName = ref('empty');

const route = useRoute();
const router = useRouter();
const roomId = route.params.id;

let wsUrl = KliveAPIUrl.replace('https', 'wss').replace('http', 'ws') + `/klivechat/ws?roomId=${roomId}`;
let ws = null;
let localStream = null;
const peerConnections = {}; 

const myName = ref('');
const roomName = ref('Loading...');
const currentUrl = ref('');
const isMuted = ref(false);
const isVideo = ref(false); // Initially off to save bandwidth unless wanted
const peersState = ref([]); 
const audioRefs = {};

// Visualizer state
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
    
    // Load current profile name if logged in, else generate a random Guest name
    let lsName = '';
    try {
        const response = await RequestGETFromKliveAPI('/klivechat/me', false, false);
        if (response && response.ok) {
            const data = await response.json();
            lsName = data.name || '';
        }
    } catch (e) {
        console.error('Failed to parse my profile name:', e);
    }
    
    if(!lsName || lsName.trim() === '') {
        lsName = await getGuestName();
        layoutName.value = 'empty';
    } else {
        layoutName.value = 'navbar';
    }
    
    myName.value = lsName;
    wsUrl += "&name=" + encodeURIComponent(lsName);
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo.value });
        if (localVideo.value) {
            localVideo.value.srcObject = localStream;
        }
        setupLocalVisualizer();
        connectWebSocket();
    } catch (e) {
        console.error("Mic access denied", e);
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
            if (!value) return 'You need to write something!'
        }
    });
    return name || 'Guest_' + Math.floor(Math.random()*1000);
}

function setupLocalVisualizer() {
    if(!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(localStream);
    localAnalyser = audioContext.createAnalyser();
    localAnalyser.fftSize = 64;
    source.connect(localAnalyser);
}

function setupPeerVisualizer(stream, id) {
    if(!audioContext) return;
    try {
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        peerAnalysers[id] = analyser;
    } catch(e) {
        console.error("Failed to setup peer visualizer, perhaps no audio track.", e);
    }
}

function renderVisualizers() {
    drawVisualizerLoop = requestAnimationFrame(renderVisualizers);

    // Draw local
    if(localVisualizer.value && localAnalyser) {
        drawCanvas(localVisualizer.value, localAnalyser, '#4d9e39');
    }

    // Draw peers
    for(let id in peerVisualizers) {
        let canvas = peerVisualizers[id];
        let analyser = peerAnalysers[id];
        if(canvas && analyser) {
            drawCanvas(canvas, analyser, '#33cc33');
        }
    }
}

function drawCanvas(canvas, analyser, color) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    let dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for(let i=0; i<dataArray.length; i++) { sum += dataArray[i]; }
    let average = sum / dataArray.length; // 0 to 255

    ctx.clearRect(0, 0, width, height);

    // Draw simple amplitude bar
    let fillWidth = (average / 255) * width;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, fillWidth, height);
}

function connectWebSocket() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log("Connected to signaling server");
        if(!drawVisualizerLoop) renderVisualizers();
    };

    ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
            case 'room-info':
                roomName.value = msg.payload.roomName;
                msg.payload.users.forEach(u => addPeer(u.id, u.name));
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
    delete peerVisualizers[id];
    delete peerAnalysers[id];
}

function createPeerConnection(targetId) {
    const pc = new RTCPeerConnection(iceServers);

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
            setupPeerVisualizer(pc._remoteStream, targetId);
        }
    };

    pc.onnegotiationneeded = async () => {
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendWSMessage('offer', targetId, pc.localDescription);
        } catch (e) {
            console.error("Negotiation failed", e);
        }
    };

    peerConnections[targetId] = pc;
    return pc;
}

async function createOffer(targetId) {
    const pc = createPeerConnection(targetId);
    // Negotiation needed event will handle the actual offer creation safely
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

async function handleRenegotiate(senderId) {
     // A peer has asked us to process a newly attached stream track by triggering generic renegotiation
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

async function toggleVideo() {
    isVideo.value = !isVideo.value;
    
    if (isVideo.value) {
        // Turn on video
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            const videoTrack = newStream.getVideoTracks()[0];
            localStream.addTrack(videoTrack);
            
            // Add track to all connections
            Object.values(peerConnections).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if(sender) {
                   sender.replaceTrack(videoTrack);
                } else {
                   pc.addTrack(videoTrack, localStream);
                }
            });
            
            if (localVideo.value) {
                localVideo.value.srcObject = localStream;
            }
        } catch(e) {
            console.error("Camera access failed", e);
            isVideo.value = false; // Revert
        }
    } else {
        // Turn off video
        const videoTracks = localStream.getVideoTracks();
        videoTracks.forEach(t => {
            t.enabled = false;
            t.stop();
            localStream.removeTrack(t);
        });
        
        Object.values(peerConnections).forEach(pc => {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                pc.removeTrack(sender);
            }
        });
    }
}

function leaveRoom() {
    router.push('/dashboard');
}

onMounted(() => {
    if(process.client) {
        init();
    }
});

onUnmounted(() => {
    if (drawVisualizerLoop) cancelAnimationFrame(drawVisualizerLoop);
    if (audioContext) audioContext.close();
    
    if (ws) ws.close();
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
    }
    Object.values(peerConnections).forEach(pc => pc.close());
});
</script>

<style scoped>
video::-webkit-media-controls {
    display: none !important;
}
</style>
