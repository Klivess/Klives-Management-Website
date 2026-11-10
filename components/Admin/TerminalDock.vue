<template>
  <div class="adm-dock" :data-open="open" data-testid="adm-dock">
    <div v-if="open" class="adm-dock__grip" title="Drag to resize" @pointerdown="startResize"></div>
    <div class="adm-dock__bar">
      <button class="adm-dock__toggle" :aria-expanded="open" aria-controls="adm-dock-body" data-testid="adm-dock-toggle" @click="toggle">
        <AdminIcon name="terminal" />
        <span>Terminal</span>
        <span class="adm-dock__hint">{{ open ? 'PowerShell on the server, as the Omnipotent process' : 'PowerShell on the server' }}</span>
      </button>
      <span class="adm-kbd" aria-hidden="true">Ctrl</span><span class="adm-kbd" aria-hidden="true">`</span>
      <button class="adm-iconbtn" :aria-label="open ? 'Close the terminal' : 'Open the terminal'" @click="toggle">
        <AdminIcon :name="open ? 'chevron-down' : 'chevron-up'" />
      </button>
    </div>
    <!-- Mounted on first open and kept after: a session (a PowerShell runspace on the server) is
         only created for someone who actually wants a shell, and it survives closing the dock. -->
    <div v-if="everOpened" v-show="open" id="adm-dock-body" class="adm-dock__body" :style="{ '--dock-h': `${height}px` }">
      <AdminTerminalUI ref="terminal" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const STORE_KEY = 'adm:terminal-dock';
const MIN_HEIGHT = 180;

const open = ref(false);
const everOpened = ref(false);
const height = ref(320);
const terminal = ref<{ focus?: () => void } | null>(null);

function persist() {
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify({ height: height.value })); } catch { /* storage blocked */ }
}

async function setOpen(next: boolean) {
  open.value = next;
  if (next) {
    everOpened.value = true;
    await nextTick();
    terminal.value?.focus?.();
  }
}
const toggle = () => setOpen(!open.value);

let resizeFrom: { y: number; height: number } | null = null;

function startResize(event: PointerEvent) {
  resizeFrom = { y: event.clientY, height: height.value };
  window.addEventListener('pointermove', onResize);
  window.addEventListener('pointerup', endResize, { once: true });
  event.preventDefault();
}
function onResize(event: PointerEvent) {
  if (!resizeFrom) return;
  const ceiling = Math.max(MIN_HEIGHT, window.innerHeight - 140);
  height.value = Math.min(ceiling, Math.max(MIN_HEIGHT, resizeFrom.height + (resizeFrom.y - event.clientY)));
}
function endResize() {
  resizeFrom = null;
  window.removeEventListener('pointermove', onResize);
  persist();
}

onMounted(() => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '{}');
    if (Number.isFinite(stored.height)) height.value = Math.min(Math.max(MIN_HEIGHT, stored.height), Math.max(MIN_HEIGHT, window.innerHeight - 140));
  } catch { /* keep the default */ }
});

onBeforeUnmount(() => window.removeEventListener('pointermove', onResize));

defineExpose({ toggle, setOpen, isOpen: () => open.value });
</script>
