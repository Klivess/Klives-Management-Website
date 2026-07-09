import { ref, onUnmounted, type Ref } from 'vue';
import { KliveAPIUrl } from '~/scripts/APIInterface';

/**
 * Phase 3 server-push client for the Projects event log. Connects to /projects/events/stream over a
 * WebSocket and delivers events without polling. Two modes:
 *   - per-project: pass `projectID`; receives every ProjectEvent (the server first replays events
 *     after `sinceRef`, then streams live). `sinceRef` is advanced as events arrive so a reconnect
 *     resumes without a gap.
 *   - fleet firehose: omit `projectID`; `onFleet(projectID, type)` fires on any project's event so a
 *     dashboard can refresh live.
 * Mirrors useScreenStream's auth (the `password` cookie as `authorization=`) and auto-reconnect.
 */
export function useEventStream(opts: {
  projectId?: string | null;
  sinceRef?: Ref<number>;
  onEvent?: (e: any) => void;
  onFleet?: (projectID: string, type: string) => void;
}) {
  const connected = ref(false);
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function wsBase() {
    return KliveAPIUrl.replace('https', 'wss').replace('http', 'ws');
  }
  function getPassword() {
    if (typeof document === 'undefined') return '';
    const m = document.cookie.match(/(?:^|; )password=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function open() {
    if (stopped || typeof window === 'undefined') return;
    const parts = [`authorization=${encodeURIComponent(getPassword())}`];
    if (opts.projectId) parts.push(`projectID=${encodeURIComponent(opts.projectId)}`);
    if (opts.projectId && opts.sinceRef) parts.push(`since=${opts.sinceRef.value ?? 0}`);
    try {
      ws = new WebSocket(`${wsBase()}/projects/events/stream?${parts.join('&')}`);
      ws.onopen = () => { connected.value = true; };
      ws.onmessage = (ev) => {
        let msg: any;
        try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch { return; }
        if (!msg || msg.kind === 'ping') return;
        if (msg.kind === 'event' && msg.event) {
          if (opts.sinceRef && typeof msg.event.sequence === 'number' && msg.event.sequence > opts.sinceRef.value)
            opts.sinceRef.value = msg.event.sequence;
          opts.onEvent?.(msg.event);
        } else if (msg.kind === 'project-event') {
          opts.onFleet?.(msg.projectID, msg.type);
        }
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

  function connect() { stopped = false; if (!ws) open(); }
  function disconnect() {
    stopped = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    try { ws && ws.close(); } catch {}
    ws = null;
    connected.value = false;
  }

  onUnmounted(disconnect);
  return { connected, connect, disconnect };
}
