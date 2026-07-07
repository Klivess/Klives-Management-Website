<template>
  <div class="live-desktop">
    <div class="ld-head">
      <span>Live desktop</span>
      <span class="ld-status" :class="{ on: connected }">{{ connected ? 'live' : 'offline' }}</span>
    </div>
    <div class="ld-frame">
      <img v-if="frameSrc" :src="frameSrc" alt="container desktop" />
      <div v-else class="ld-empty">No desktop stream. Provide a containerID to watch an agent work.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import { KliveAPIUrl } from '~/scripts/APIInterface';

const props = defineProps<{ containerId: string; fps?: number }>();

const frameSrc = ref('');
const connected = ref(false);
let ws: WebSocket | null = null;
let lastUrl = '';

function getPassword() {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|; )password=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : '';
}
function wsBase() { return KliveAPIUrl.replace('https', 'wss').replace('http', 'ws'); }

function connect() {
  disconnect();
  if (!props.containerId || typeof window === 'undefined') return;
  const fps = props.fps ?? 6;
  const url = `${wsBase()}/projects/containers/screen/stream?containerID=${encodeURIComponent(props.containerId)}&fps=${fps}&authorization=${encodeURIComponent(getPassword())}`;
  ws = new WebSocket(url);
  ws.binaryType = 'blob';
  ws.onopen = () => { connected.value = true; };
  ws.onclose = () => { connected.value = false; };
  ws.onerror = () => { connected.value = false; };
  ws.onmessage = (e) => {
    if (!(e.data instanceof Blob)) return;
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(e.data);
    frameSrc.value = lastUrl;
  };
}

function disconnect() {
  if (ws) { try { ws.close(); } catch { /* ignore */ } ws = null; }
  connected.value = false;
}

watch(() => props.containerId, connect, { immediate: true });
onBeforeUnmount(() => { disconnect(); if (lastUrl) URL.revokeObjectURL(lastUrl); });
</script>

<style scoped>
.live-desktop { background: #161519; border-radius: 8px; overflow: hidden; }
.ld-head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; font-size: 13px; color: #ccc; border-bottom: 1px solid #2a2a2e; }
.ld-status { font-size: 11px; color: #888; }
.ld-status.on { color: #7fd97f; }
.ld-frame { min-height: 200px; display: flex; align-items: center; justify-content: center; background: #0e0e11; }
.ld-frame img { max-width: 100%; display: block; }
.ld-empty { color: #666; font-size: 13px; padding: 24px; text-align: center; }
</style>
