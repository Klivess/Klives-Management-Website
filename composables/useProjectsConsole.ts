import { onBeforeUnmount, onMounted } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import type { PjTone } from '~/scripts/projectsConsole';

/*
 * Shared plumbing for the Projects console pages: toasts, actions that may answer "still settling",
 * and polling that stops while the tab is hidden. Exports carry a `pjx` prefix because Nuxt
 * auto-imports every export from composables/.
 */

export interface PjxToast { id: number; text: string; tone: PjTone; icon: string }

let toastSeq = 0;

export function usePjxToasts() {
  const toasts = useState<PjxToast[]>('pjx:toasts', () => []);
  function toast(text: string, tone: PjTone = 'accent', ms = 4200) {
    const icon = tone === 'fault' ? 'alert' : tone === 'need' ? 'hourglass' : tone === 'work' ? 'check' : 'info';
    const entry = { id: ++toastSeq, text, tone, icon };
    toasts.value = [...toasts.value.slice(-3), entry];
    if (import.meta.client) setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== entry.id); }, ms);
  }
  return { toasts, toast };
}

export interface PjxActionResult<T = any> {
  ok: boolean;
  status: number;
  /** The action outlived the server's wait and is finishing on its own (HTTP 202). */
  pending: boolean;
  body: T | null;
  /** Why it failed, in words: the permission it needed, the server's message, or the status. */
  error: string;
}

/** POST a Projects action. Never throws; the result says what happened. */
export async function pjxPost<T = any>(path: string, body: unknown = {}): Promise<PjxActionResult<T>> {
  try {
    const res = await RequestPOSTFromKliveAPI(path, JSON.stringify(body ?? {}), false, true);
    const text = await res.text().catch(() => '');
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
    if (res.ok) return { ok: true, status: res.status, pending: res.status === 202 || parsed?.pending === true, body: parsed, error: '' };
    let error = `That didn't go through (HTTP ${res.status}).`;
    if (res.status === 403 && parsed?.permission?.title) error = `Your profile can't do that: it needs “${parsed.permission.title}”.`;
    else if (typeof parsed?.error === 'string' && parsed.error !== 'AccessDenied') error = parsed.error;
    else if (typeof parsed?.message === 'string') error = parsed.message;
    else if (text && text.length < 240 && !/^\s*</.test(text)) error = text;
    return { ok: false, status: res.status, pending: false, body: parsed, error };
  } catch (e: any) {
    return { ok: false, status: 0, pending: false, body: null, error: e?.message ? `Network error: ${e.message}` : 'Network error.' };
  }
}

export async function pjxGet<T = any>(path: string, signal?: AbortSignal): Promise<{ ok: boolean; status: number; body: T | null }> {
  try {
    const res = await RequestGETFromKliveAPI(path, false, false, {}, signal);
    if (!res.ok) return { ok: false, status: res.status, body: null };
    return { ok: true, status: res.status, body: await res.json() as T };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

/** Calls <paramref name="fn"/> every <paramref name="ms"/> while the tab is visible, and once on return to it. */
export function usePjxPoll(fn: () => unknown, ms: number, options: { immediate?: boolean } = {}) {
  let timer: ReturnType<typeof setInterval> | undefined;
  const tick = () => { if (!document.hidden) fn(); };
  const onVisible = () => { if (!document.hidden) fn(); };
  onMounted(() => {
    if (options.immediate !== false) fn();
    timer = setInterval(tick, ms);
    document.addEventListener('visibilitychange', onVisible);
  });
  onBeforeUnmount(() => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  });
}
