import { ref, onUnmounted } from 'vue';
import { KliveAPIUrl } from '~/scripts/APIInterface';

/**
 * Shared live screen-video client. Connects to the backend's /kliveagent/screen/stream WebSocket and
 * exposes the latest JPEG frame as an object URL. The auth + fps/quality are supplied by the caller as a
 * query string (`authorization=<pw>` for the Admin remote desktop, or `token=<token>&fps=…&quality=…` for a
 * captcha-solve session). Reused by both LiveScreen (view-only) and RemoteDesktop (interactive).
 */
export function useScreenStream() {
  const streamSrc = ref<string | null>(null);
  const connected = ref(false);

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let lastObjectUrl: string | null = null;
  let stopped = false;
  let currentQuery = '';

  function wsBase() {
    return KliveAPIUrl.replace('https', 'wss').replace('http', 'ws');
  }

  function open() {
    if (stopped || typeof window === 'undefined' || !currentQuery) return;
    try {
      ws = new WebSocket(`${wsBase()}/kliveagent/screen/stream?${currentQuery}`);
      ws.binaryType = 'blob';
      ws.onopen = () => { connected.value = true; };
      ws.onmessage = (ev) => {
        const blob = ev.data instanceof Blob ? ev.data : new Blob([ev.data], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        const prev = lastObjectUrl;
        lastObjectUrl = url;
        streamSrc.value = url;
        if (prev) URL.revokeObjectURL(prev); // free the previous frame so memory stays bounded
      };
      ws.onclose = () => { connected.value = false; if (!stopped) scheduleReconnect(); };
      ws.onerror = () => { try { ws && ws.close(); } catch {} };
    } catch {
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; open(); }, 1500);
  }

  /** Start (or restart) streaming with the given query string, e.g. `authorization=<pw>&fps=18`. */
  function connect(query: string) {
    disconnect();
    currentQuery = query;
    stopped = false;
    open();
  }

  function disconnect() {
    stopped = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    try { ws && ws.close(); } catch {}
    ws = null;
    if (lastObjectUrl) { URL.revokeObjectURL(lastObjectUrl); lastObjectUrl = null; }
    streamSrc.value = null;
    connected.value = false;
  }

  onUnmounted(disconnect);

  return { streamSrc, connected, connect, disconnect };
}
