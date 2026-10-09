import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { profilesApi, type PresenceSummary, type SessionRow, type TimelineItem } from '~/scripts/profilesApi';

const MAX_FEED = 200;

/**
 * Follows one profile live over /KMProfiles/admin/live: where they are (presence), their
 * sessions, and every request and access event the moment it happens. Reconnects on its own;
 * stops when `enabled` turns false (or access to watch is lost — the server closes the socket).
 */
export function useProfileLiveFeed(profileId: Ref<string>, enabled: Ref<boolean>) {
  const presence = ref<PresenceSummary | null>(null);
  const sessions = ref<SessionRow[] | null>(null);
  const feed = ref<TimelineItem[]>([]);
  const fresh = ref(new Set<string>());
  const connected = ref(false);

  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let backoff = 2_000;
  let stopped = false;

  function keyOf(item: TimelineItem) {
    return `${item.type}:${item.tsMs}:${item.route ?? item.kind ?? item.page ?? ''}:${item.status ?? ''}`;
  }

  function push(item: TimelineItem) {
    feed.value = [item, ...feed.value].slice(0, MAX_FEED);
    const key = keyOf(item);
    const next = new Set(fresh.value);
    next.add(key);
    fresh.value = next;
    setTimeout(() => {
      const after = new Set(fresh.value);
      after.delete(key);
      fresh.value = after;
    }, 2_500);
  }

  function close() {
    if (retry) clearTimeout(retry);
    retry = null;
    if (socket) {
      const s = socket;
      socket = null;
      try { s.close(1000, 'done'); } catch { /* closing */ }
    }
    connected.value = false;
  }

  function open() {
    close();
    if (stopped || !enabled.value || !profileId.value || typeof window === 'undefined') return;
    const s = new WebSocket(profilesApi.liveUrl(profileId.value));
    socket = s;
    s.onopen = () => { connected.value = true; backoff = 2_000; };
    s.onmessage = (event) => {
      let msg: any;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg?.type === 'snapshot') {
        presence.value = msg.presence ?? null;
        sessions.value = Array.isArray(msg.sessions) ? msg.sessions : null;
      } else if (msg?.type === 'presence') {
        presence.value = msg.presence ?? presence.value;
      } else if (msg?.type === 'request' && msg.item) {
        const r = msg.item;
        push({
          type: 'request', tsMs: r.tsMs, method: r.method, route: r.route, permKey: r.permKey, service: r.service,
          status: r.status, durationMs: r.durationMs, ip: r.ip, page: r.page, denyReason: r.denyReason,
          viaBatch: r.viaBatch, sessionId: r.sessionId,
        });
      } else if (msg?.type === 'event' && msg.item) {
        const e = msg.item;
        push({ type: 'event', tsMs: e.tsMs, kind: e.kind, actorId: e.actorId, actorName: e.actorName, ip: e.ip, detailJson: e.detailJson });
      }
    };
    s.onclose = () => {
      if (socket === s) socket = null;
      connected.value = false;
      if (stopped || !enabled.value) return;
      retry = setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, 30_000);
    };
  }

  watch([profileId, enabled], () => {
    feed.value = [];
    presence.value = null;
    sessions.value = null;
    open();
  }, { immediate: typeof window !== 'undefined' });

  onBeforeUnmount(() => {
    stopped = true;
    close();
  });

  return { presence, sessions, feed, fresh, connected, keyOf };
}
