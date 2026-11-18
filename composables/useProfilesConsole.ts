import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { RequestBatchFromKliveAPI, type KliveBatchItem } from '~/scripts/APIInterface';
import { useAccess } from '~/composables/useAccess';
import { profilesApi, ProfilesApiError, type ProfileListPayload, type ProfileRow, type SessionRow, type TimelineItem } from '~/scripts/profilesApi';
import { buildRows, IDLE_DAYS, type InsightsPayload, type PersonRow } from '~/scripts/profilesConsole';

/*
 * State for the profile console's directory: the list and the review in one /batch every 15 s
 * (nothing while the tab is hidden), the quick-look sheet for one profile, and every quick action
 * with its toast. The full profile page reuses the actions and toasts (useProfileActions).
 *
 * The review route (/KMProfiles/insights) is newer than the list: on a server without it the
 * directory still works, just without the review's figures.
 */

export interface PeopleToast { id: number; tone: 'ok' | 'warn' | 'crit' | 'info'; text: string; detail?: string; action?: { label: string; run: () => unknown } }

const POLL_MS = 15_000;
const SHEET_POLL_MS = 20_000;

function body<T>(item: KliveBatchItem | undefined): T | null {
  if (!item || item.status < 200 || item.status >= 300) return null;
  const value = item.body;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return null; }
}

function messageOf(error: unknown, fallback = 'That didn’t work.') {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Toasts and the access-changing actions, shared by the directory and a profile's page. */
export function useProfileActions(onChanged: (row?: ProfileRow) => void = () => {}) {
  const toasts = ref<PeopleToast[]>([]);
  const busy = ref<string | null>(null);
  let toastId = 0;

  function notify(tone: PeopleToast['tone'], text: string, detail?: string, ms = 4_500, action?: PeopleToast['action']) {
    const id = ++toastId;
    toasts.value = [...toasts.value, { id, tone, text, detail, action }].slice(-4);
    window.setTimeout(() => dismiss(id), ms);
  }
  function dismiss(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }

  /** Runs one action: one at a time, a toast either way, the caller told about the new row. */
  async function act<T>(key: string, work: () => Promise<T>, success: (result: T) => { text: string; detail?: string } | null): Promise<T | null> {
    if (busy.value) return null;
    busy.value = key;
    try {
      const result = await work();
      const message = success(result);
      if (message) notify('ok', message.text, message.detail);
      onChanged((result && typeof result === 'object' && 'userId' in (result as object)) ? (result as unknown as ProfileRow) : undefined);
      return result;
    } catch (error) {
      // A denial already raised the site's own access toast.
      if (!(error instanceof ProfilesApiError && error.denied)) notify('crit', 'That didn’t work', messageOf(error), 7_000);
      return null;
    } finally {
      busy.value = null;
    }
  }

  const actions = {
    suspend: (p: ProfileRow, options: { minutes?: number; untilUtc?: string }, reason: string) =>
      act('suspend', () => profilesApi.suspend(p.userId, options, reason), () => ({ text: `${p.name} is suspended`, detail: 'Their open tabs locked straight away.' })),
    unsuspend: (p: ProfileRow) =>
      act('unsuspend', () => profilesApi.unsuspend(p.userId), () => ({ text: `${p.name} can use the site again` })),
    setReadOnly: (p: ProfileRow, on: boolean) =>
      act('read-only', () => profilesApi.setReadOnly(p.userId, on), () => (on ? { text: `${p.name} is read-only`, detail: 'They can look; every change is refused.' } : { text: `Read-only lifted for ${p.name}` })),
    setLogin: (p: ProfileRow, on: boolean) =>
      act('login', () => profilesApi.setLogin(p.userId, on), () => (on ? { text: `${p.name} can sign in again` } : { text: `Sign-in turned off for ${p.name}`, detail: 'Every session ended.' })),
    setPasswordApi: (p: ProfileRow, on: boolean) =>
      act('password-api', () => profilesApi.setPasswordApi(p.userId, on), () => ({ text: on ? `${p.name}'s password works as an API key` : `${p.name}'s password no longer works as an API key` })),
    signOutEverywhere: (p: ProfileRow) =>
      act('signout', () => profilesApi.revokeSessions(p.userId), r => ({ text: `${p.name} was signed out`, detail: `${r.revoked} device${r.revoked === 1 ? '' : 's'} signed out.` })),
    signOutDevice: (p: ProfileRow, sessionId: string) =>
      act('signout-one', () => (p.isYou ? profilesApi.revokeMySessions(sessionId) : profilesApi.revokeSessions(p.userId, sessionId)), () => ({ text: 'Device signed out' })),
    /**
     * Signs out a profile's idle devices; your own go through "mine" (nobody manages themselves
     * through the admin routes). With the device list in hand (a profile page, the sheet) each
     * device goes by its own id, which every server understands. Without it (the directory, whose
     * idle counts only exist when /KMProfiles/insights answers, so the server knows idleDays) one
     * request with idleDays: a server from before idleDays would read it as "sign out everything".
     */
    signOutIdle: (p: ProfileRow, idleSessionIds?: string[], days = IDLE_DAYS) =>
      act('signout-idle', async () => {
        if (!idleSessionIds) return p.isYou ? profilesApi.revokeMyIdleSessions(days) : profilesApi.revokeIdleSessions(p.userId, days);
        let revoked = 0;
        for (const sessionId of idleSessionIds) {
          revoked += (p.isYou ? await profilesApi.revokeMySessions(sessionId) : await profilesApi.revokeSessions(p.userId, sessionId)).revoked;
        }
        return { revoked };
      },
        r => ({ text: r.revoked ? `Signed out ${r.revoked} idle device${r.revoked === 1 ? '' : 's'} of ${p.isYou ? 'yours' : p.name}` : 'No idle devices to sign out', detail: r.revoked ? `Unused for ${days}+ days.` : undefined })),
  };

  return { toasts, busy, notify, dismiss, actions };
}

export function useProfilesConsole() {
  const { can } = useAccess();
  const list = shallowRef<ProfileListPayload | null>(null);
  const insights = shallowRef<InsightsPayload | null>(null);
  const insightsSupported = ref(true);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const loadedAt = ref(0);
  const failures = ref(0);
  const now = ref(Date.now());
  const paused = ref(false);

  const rows = computed<PersonRow[]>(() => buildRows(list.value?.profiles ?? [], insights.value, now.value));

  const linkState = computed<'live' | 'paused' | 'stale' | 'offline' | 'connecting'>(() => {
    if (paused.value) return 'paused';
    if (!loadedAt.value) return failures.value ? 'offline' : 'connecting';
    if (failures.value >= 2) return 'offline';
    return now.value - loadedAt.value > POLL_MS * 3 ? 'stale' : 'live';
  });

  async function refresh() {
    if (loading.value) return;
    loading.value = true;
    try {
      const paths = ['/KMProfiles/list'];
      if (insightsSupported.value) paths.push('/KMProfiles/insights');
      const results = await RequestBatchFromKliveAPI(paths);
      const listItem = results.get('/KMProfiles/list');
      const payload = body<ProfileListPayload>(listItem);
      if (!payload) throw new Error(listItem ? `The directory answered ${listItem.status}.` : 'Couldn’t reach Klives Management.');
      list.value = payload;
      const insightItem = results.get('/KMProfiles/insights');
      if (insightItem?.status === 404) insightsSupported.value = false;
      const review = body<InsightsPayload>(insightItem);
      if (review) insights.value = review;
      loadedAt.value = Date.now();
      failures.value = 0;
      error.value = null;
    } catch (e) {
      failures.value++;
      error.value = messageOf(e, 'Could not load profiles.');
    } finally {
      loading.value = false;
      now.value = Date.now();
    }
  }

  function replaceRow(updated?: ProfileRow) {
    if (!updated || !list.value) { void refresh(); return; }
    const profiles = list.value.profiles.map(p => (p.userId === updated.userId
      // Action responses carry no 24 h counters or last-seen: keep the ones already shown.
      ? { ...p, ...updated, requests24h: p.requests24h, denied24h: p.denied24h, lastSeenUtc: p.lastSeenUtc, presence: p.presence }
      : p));
    list.value = { ...list.value, profiles };
    if (sheet.value?.userId === updated.userId) void loadSheet(updated.userId, true);
    // The review changes with any access change: read it again shortly.
    window.setTimeout(() => void refresh(), 600);
  }

  const { toasts, busy, notify, dismiss, actions } = useProfileActions(replaceRow);

  // ───────────────────────────── the sheet ─────────────────────────────

  const sheetId = ref<string | null>(null);
  const sheet = shallowRef<ProfileRow | null>(null);
  const sheetSessions = shallowRef<SessionRow[]>([]);
  const sheetActivity = shallowRef<TimelineItem[]>([]);
  const sheetLoading = ref(false);
  let sheetTimer: number | undefined;

  async function loadSheet(userId: string, quiet = false) {
    if (!quiet) sheetLoading.value = true;
    try {
      const paths = [`/KMProfiles/get?id=${encodeURIComponent(userId)}`];
      // Your own devices come from "mine", the only list that marks the device you are on.
      const isYou = list.value?.profiles.find(p => p.userId === userId)?.isYou === true;
      const sessionsPath = isYou ? '/KMProfiles/sessions/mine'
        : can('profiles.access.control') ? `/KMProfiles/sessions?id=${encodeURIComponent(userId)}` : null;
      if (sessionsPath) paths.push(sessionsPath);
      if (can('profiles.activity.read')) paths.push(`/KMProfiles/activity?id=${encodeURIComponent(userId)}&limit=14`);
      const results = await RequestBatchFromKliveAPI(paths);
      if (sheetId.value !== userId) return;
      const row = body<ProfileRow>(results.get(paths[0]));
      if (row) sheet.value = row;
      if (sessionsPath) sheetSessions.value = body<SessionRow[]>(results.get(sessionsPath)) ?? [];
      const activityPath = paths.find(p => p.startsWith('/KMProfiles/activity?'));
      if (activityPath) sheetActivity.value = body<{ items: TimelineItem[] }>(results.get(activityPath))?.items ?? [];
    } finally {
      if (sheetId.value === userId) sheetLoading.value = false;
    }
  }

  function openSheet(userId: string) {
    if (sheetId.value === userId) return;
    sheetId.value = userId;
    sheet.value = list.value?.profiles.find(p => p.userId === userId) ?? null;
    sheetSessions.value = [];
    sheetActivity.value = [];
    void loadSheet(userId);
  }
  function closeSheet() {
    sheetId.value = null;
    sheet.value = null;
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  let poll: number | undefined;
  let clock: number | undefined;
  function onVisibility() {
    if (document.visibilityState === 'visible' && !paused.value) void refresh();
  }
  function setPaused(on: boolean) {
    paused.value = on;
    if (!on) void refresh();
  }

  onMounted(() => {
    void refresh();
    poll = window.setInterval(() => { if (document.visibilityState === 'visible' && !paused.value) void refresh(); }, POLL_MS);
    sheetTimer = window.setInterval(() => {
      if (sheetId.value && document.visibilityState === 'visible' && !paused.value) void loadSheet(sheetId.value, true);
    }, SHEET_POLL_MS);
    clock = window.setInterval(() => { now.value = Date.now(); }, 15_000);
    document.addEventListener('visibilitychange', onVisibility);
  });
  onBeforeUnmount(() => {
    window.clearInterval(poll);
    window.clearInterval(sheetTimer);
    window.clearInterval(clock);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  return {
    list, insights, insightsSupported, rows, loading, error, loadedAt, now, linkState, paused, setPaused, refresh,
    toasts, busy, notify, dismiss, actions, replaceRow,
    sheetId, sheet, sheetSessions, sheetActivity, sheetLoading, openSheet, closeSheet, loadSheet,
  };
}
