<template>
  <div class="live-desktop" :class="{ clickable }" @click="clickable && $emit('maximize')">
    <div class="ld-head">
      <span class="ld-label">{{ label || 'Live desktop' }}</span>
      <span class="ld-status" :class="{ on: connected }">{{ connected ? 'live' : 'offline' }}</span>
    </div>
    <div class="ld-frame">
      <img v-if="frameSrc" :src="frameSrc" alt="agent desktop" />
      <div v-else class="ld-empty">{{ connected ? 'Waiting for first frame…' : (containerId ? 'Connecting…' : 'No desktop') }}</div>
      <div v-if="clickable && frameSrc" class="ld-maximise" title="Maximise">⛶</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import { KliveAPIUrl } from '~/scripts/APIInterface';

const props = defineProps<{ containerId: string; fps?: number; label?: string; clickable?: boolean }>();
defineEmits<{ (e: 'maximize'): void }>();

const frameSrc = ref('');
const connected = ref(false);
let ws: WebSocket | null = null;
let lastUrl = '';
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

function getPassword() {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|; )password=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : '';
}
function wsBase() { return KliveAPIUrl.replace('https', 'wss').replace('http', 'ws'); }

function connect() {
  disconnect();
  stopped = false;
  if (!props.containerId || typeof window === 'undefined') return;
  const fps = props.fps ?? 4;
  const url = `${wsBase()}/projects/containers/screen/stream?containerID=${encodeURIComponent(props.containerId)}&fps=${fps}&authorization=${encodeURIComponent(getPassword())}`;
  try {
    ws = new WebSocket(url);
    ws.binaryType = 'blob';
    ws.onopen = () => { connected.value = true; };
    ws.onclose = () => { connected.value = false; scheduleReconnect(); };
    ws.onerror = () => { connected.value = false; try { ws && ws.close(); } catch { /* ignore */ } };
    ws.onmessage = (e) => {
      if (!(e.data instanceof Blob)) return;
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(e.data);
      frameSrc.value = lastUrl;
    };
  } catch { scheduleReconnect(); }
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; if (!stopped) connect(); }, 2000);
}

function disconnect() {
  stopped = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { try { ws.close(); } catch { /* ignore */ } ws = null; }
  connected.value = false;
}

watch(() => [props.containerId, props.fps], connect, { immediate: true });
onBeforeUnmount(() => { disconnect(); if (lastUrl) URL.revokeObjectURL(lastUrl); });
</script>

<style scoped>
.live-desktop { background: #161519; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; }
.live-desktop.clickable { cursor: pointer; border: 1px solid transparent; transition: border-color 0.1s; }
.live-desktop.clickable:hover { border-color: #4d9e39; }
.ld-head { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; font-size: 12px; color: #ccc; border-bottom: 1px solid #2a2a2e; }
.ld-label { font-weight: 600; text-transform: capitalize; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ld-status { font-size: 10px; color: #888; display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; }
.ld-status.on { color: #7fd97f; }
.ld-status.on::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #7fd97f; animation: ld-blink 1.6s ease-in-out infinite; }
@keyframes ld-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.ld-frame { position: relative; flex: 1; min-height: 120px; display: flex; align-items: center; justify-content: center; background: #0e0e11; }
.ld-frame img { max-width: 100%; max-height: 100%; display: block; }
.ld-empty { color: #666; font-size: 12px; padding: 20px; text-align: center; }
.ld-maximise { position: absolute; top: 6px; right: 8px; color: #fff; opacity: 0; background: rgba(0,0,0,0.45); border-radius: 5px; padding: 2px 6px; font-size: 13px; transition: opacity 0.1s; }
.live-desktop.clickable:hover .ld-maximise { opacity: 1; }
</style>
