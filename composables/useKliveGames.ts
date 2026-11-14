import { computed, reactive, ref, shallowRef } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useAccess } from '~/composables/useAccess';
import {
  fromLegacy, fromOverview, kgBytes, kgErrorText, kgIssues, kgSortServers, kgStatus,
  type KgActivity, type KgBackup, type KgConfigField, type KgFileEntry, type KgGameInfo, type KgHost, type KgJob,
  type KgKnownPlayer, type KgServer, type KgTone, type KgUpnp, type KgVersion,
} from '~/scripts/kliveGames';

/*
 * State and actions behind /klivegames.
 *
 * Reads: one GET /klivegames/overview (servers, backups, storage, network, players, sparklines, the fleet's
 * recent activity) every 4 s while anything is running or busy and every 10 s otherwise; nothing while the tab
 * is hidden. The open server adds its own activity and vitals. A server older than this page has no overview
 * route ("Route not found"): the page then reads /klivegames/servers and hides what that cannot tell it.
 *
 * Writes: every action says how it went. The old page threw away the answer, so a profile without
 * permission to start a server (live, 24 Oct) clicked Start and saw nothing happen.
 */

export interface KgToast { id: number; tone: KgTone; text: string; detail?: string; action?: { label: string; run: () => void } }

type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string; missing: boolean };

const NO_ROUTE = 'Route not found';
const FAST_MS = 4_000;
const SLOW_MS = 10_000;

async function kgGet<T = any>(path: string): Promise<Result<T>> {
  try {
    const res = await RequestGETFromKliveAPI(path, false, false);
    const text = await res.text().catch(() => '');
    if (!res.ok) return { ok: false, status: res.status, error: kgErrorText(res.status, text), missing: res.status === 404 && text.trim() === NO_ROUTE };
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (data && data.success === false) return { ok: false, status: res.status, error: data.error ?? 'The server refused.', missing: false };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.name === 'AbortError' ? 'Cancelled.' : 'Could not reach the server.', missing: false };
  }
}

async function kgPost<T = any>(path: string, body?: unknown, raw?: BodyInit): Promise<Result<T>> {
  try {
    const res = raw !== undefined
      ? await RequestPOSTFromKliveAPI(path, raw, false, false)
      : await RequestPOSTFromKliveAPI(path, body === undefined ? '' : JSON.stringify(body), false, body !== undefined);
    const text = await res.text().catch(() => '');
    if (!res.ok) return { ok: false, status: res.status, error: kgErrorText(res.status, text), missing: res.status === 404 && text.trim() === NO_ROUTE };
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (data && data.success === false) return { ok: false, status: res.status, error: data.error ?? 'The server refused.', missing: false };
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, error: 'Could not reach the server.', missing: false };
  }
}

function enc(value: string) { return encodeURIComponent(value); }

export function useKliveGames() {
  const access = useAccess();
  const allowed = computed(() => ({
    read: access.can('klivegames.servers.read'),
    operate: access.can('klivegames.servers.operate'),
    console: access.can('klivegames.console.use'),
    manage: access.can('klivegames.servers.manage'),
    filesRead: access.can('klivegames.files.read'),
    filesWrite: access.can('klivegames.files.write'),
  }));
  /** Why a control is unavailable, for its tooltip. */
  const needs = {
    operate: 'Needs “Operate game servers”',
    console: 'Needs “Use server consoles”',
    manage: 'Needs “Manage game servers”',
    filesRead: 'Needs “Download server files”',
    filesWrite: 'Needs “Edit server files”',
  };

  // ── overview ──
  const servers = shallowRef<KgServer[]>([]);
  const host = shallowRef<KgHost | null>(null);
  const upnp = shallowRef<KgUpnp | null>(null);
  const activity = shallowRef<KgActivity[]>([]);
  const legacy = ref(false);
  const loaded = ref(false);
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  const lastLoadedAt = ref<number | null>(null);
  const now = ref(Date.now());
  const pending = reactive<Record<string, string>>({}); // serverId → action in flight

  const sorted = computed(() => kgSortServers(servers.value));
  const byId = computed(() => new Map(servers.value.map(s => [s.id, s])));
  const issues = computed(() => kgIssues(servers.value, host.value, upnp.value, now.value));
  const running = computed(() => servers.value.filter(s => kgStatus(s.status).live));
  const playersOnline = computed(() => servers.value.reduce((n, s) => n + s.onlinePlayers.length, 0));
  const anyBusy = computed(() => servers.value.some(s => kgStatus(s.status).busy || kgStatus(s.status).live || (s.backups.job && !s.backups.job.finishedUtc)) || Object.keys(pending).length > 0);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let clock: ReturnType<typeof setInterval> | null = null;
  let started = false;
  let inFlight: Promise<void> | null = null;

  async function load(): Promise<void> {
    if (inFlight) return inFlight;
    loading.value = true;
    inFlight = (async () => {
      try {
        if (!legacy.value) {
          const r = await kgGet<any>('/klivegames/overview');
          if (r.ok) {
            servers.value = (r.data?.servers ?? []).map(fromOverview);
            host.value = r.data?.host ?? null;
            upnp.value = r.data?.upnp ?? null;
            activity.value = r.data?.activity ?? [];
            loadError.value = null;
            loaded.value = true;
            lastLoadedAt.value = Date.now();
            return;
          }
          if (!r.missing) { loadError.value = r.error; loaded.value = true; return; }
          legacy.value = true;
        }
        const r = await kgGet<any>('/klivegames/servers');
        if (r.ok) {
          servers.value = (r.data?.servers ?? []).map(fromLegacy);
          host.value = null;
          upnp.value = null;
          activity.value = [];
          loadError.value = null;
          lastLoadedAt.value = Date.now();
        } else loadError.value = r.error;
        loaded.value = true;
      } finally {
        loading.value = false;
        inFlight = null;
      }
    })();
    return inFlight;
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    if (!started) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    timer = setTimeout(async () => { await load(); schedule(); }, anyBusy.value ? FAST_MS : SLOW_MS);
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') { load().then(schedule); }
    else if (timer) { clearTimeout(timer); timer = null; }
  }

  async function start() {
    if (started) return;
    started = true;
    clock = setInterval(() => { now.value = Date.now(); }, 15_000);
    document.addEventListener('visibilitychange', onVisibility);
    await access.ensureLoaded?.();
    await load();
    schedule();
  }

  function stop() {
    started = false;
    if (timer) clearTimeout(timer);
    if (clock) clearInterval(clock);
    timer = null;
    clock = null;
    document.removeEventListener('visibilitychange', onVisibility);
  }

  async function refresh() { await load(); schedule(); }

  // ── toasts ──
  const toasts = ref<KgToast[]>([]);
  let toastSeq = 0;
  function say(tone: KgTone, text: string, detail?: string, action?: KgToast['action'], ms = tone === 'crit' ? 9000 : 5000) {
    const id = ++toastSeq;
    toasts.value = [...toasts.value.slice(-3), { id, tone, text, detail, action }];
    setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, ms);
  }
  function dismiss(id: number) { toasts.value = toasts.value.filter(t => t.id !== id); }

  function label(id: string) { return byId.value.get(id)?.name ?? 'the server'; }

  async function act<T>(id: string | null, what: string, run: () => Promise<Result<T>>, okText?: string | ((data: T) => string)): Promise<Result<T>> {
    if (id) pending[id] = what;
    try {
      const r = await run();
      if (r.ok) {
        const text = typeof okText === 'function' ? okText(r.data) : okText;
        if (text) say('ok', text);
      } else {
        say('crit', `Couldn't ${what}`, r.error);
      }
      return r;
    } finally {
      if (id) delete pending[id];
      refresh();
    }
  }

  // ── lifecycle ──
  function lifecycle(id: string, op: 'start' | 'stop' | 'restart' | 'kill' | 'delete') {
    const name = label(id);
    const words: Record<typeof op, [string, string]> = {
      start: [`start ${name}`, `${name} is starting.`],
      stop: [`stop ${name}`, `${name} stopped.`],
      restart: [`restart ${name}`, `${name} is restarting.`],
      kill: [`kill ${name}`, `${name} was force-killed.`],
      delete: [`delete ${name}`, `${name} was deleted.`],
    };
    return act(id, words[op][0], () => kgPost(`/klivegames/servers/${op}`, { id }), words[op][1]);
  }

  async function stopAll() {
    const live = running.value.filter(s => s.status === 'Running' || s.status === 'Starting' || s.status === 'Stalled');
    await Promise.all(live.map(s => lifecycle(s.id, 'stop')));
  }

  function sendCommand(id: string, command: string) {
    return kgPost('/klivegames/servers/command', { id, command });
  }

  // ── per-server reads ──
  async function getActivity(id: string | null, limit = 80, before?: string, kinds?: string[]) {
    const params = new URLSearchParams();
    if (id) params.set('id', id);
    params.set('limit', String(limit));
    if (before) params.set('before', before);
    if (kinds?.length) params.set('kinds', kinds.join(','));
    return kgGet<{ entries: KgActivity[]; hasMore: boolean }>(`/klivegames/activity?${params}`);
  }

  function getVitals(id: string, window: '1h' | '24h') {
    return kgGet<{ t0: number; stepSeconds: number; cpu: (number | null)[]; ramMb: (number | null)[]; players: (number | null)[]; ramLimitMb: number | null }>(`/klivegames/vitals?id=${enc(id)}&window=${window}`);
  }

  function getPlayers(id: string) {
    return kgGet<{ players: string[]; max: number; supportedActions: string[]; known?: KgKnownPlayer[] }>(`/klivegames/players/list?id=${enc(id)}`);
  }

  /** `quiet`: the caller says how it went itself (the players panel adds an Undo). */
  function playerAction(id: string, action: string, player: string, quiet = false) {
    return act(id, `${action} ${player}`, () => kgPost<{ command?: string }>('/klivegames/players/action', { id, action, player }),
      quiet ? undefined : d => `Sent: ${d?.command ?? `${action} ${player}`}`);
  }

  // ── backups ──
  function getBackups(id: string) {
    return kgGet<{ backups: KgBackup[]; job?: KgJob | null; schedule?: { everyHours: number; keep: number } | null }>(`/klivegames/backups/list?id=${enc(id)}`);
  }

  async function backupNow(id: string) {
    const name = label(id);
    const r = await act(id, `back up ${name}`, () => kgPost<{ started?: boolean; backup?: KgBackup }>('/klivegames/backups/create', { id, background: true }),
      d => (d?.started ? `Backing up ${name}…` : `Backed up ${name}${d?.backup ? ` (${kgBytes(d.backup.SizeBytes)})` : ''}.`));
    return r;
  }

  function restoreBackup(id: string, backupId: string, safety: boolean) {
    const name = label(id);
    return act(id, `restore ${name}`, () => kgPost<{ started?: boolean }>('/klivegames/backups/restore', { id, backupId, background: true, safety }),
      d => (d?.started ? `Restoring ${backupId} into ${name}…` : `Restored ${backupId}.`));
  }

  function deleteBackup(id: string, backupId: string) {
    return act(id, `delete ${backupId}`, () => kgPost('/klivegames/backups/delete', { id, backupId }), `Deleted ${backupId}.`);
  }

  async function setSchedule(id: string, everyHours: number, keep: number, quiet = false) {
    const r = await kgPost('/klivegames/config/set', { id, backupEveryHours: everyHours, backupKeep: keep });
    if (!r.ok) say('crit', `Couldn't change the backup schedule of ${label(id)}`, r.error);
    else if (!quiet) say('ok', everyHours ? `${label(id)} will be backed up ${everyHours === 24 ? 'daily' : `every ${everyHours} h`}, keeping ${keep || 'all'}.` : `Scheduled backups for ${label(id)} are off.`);
    refresh();
    return r;
  }

  async function scheduleAll(ids: string[]) {
    const results = await Promise.all(ids.map(id => setSchedule(id, 24, 7, true)));
    const ok = results.filter(r => r.ok).length;
    if (ok) say('ok', `Daily backups on for ${ok} server${ok === 1 ? '' : 's'}`, 'Each keeps its newest 7. The first runs within a minute.');
  }

  // ── config ──
  function getConfig(id: string) {
    return kgGet<{ schema: KgConfigField[]; usesMemoryLimit: boolean; ram: number; jvmArgs: string; useAikarFlags: boolean; autoRestart: boolean; autoStart: boolean; backupEveryHours?: number; backupKeep?: number }>(`/klivegames/config/get?id=${enc(id)}`);
  }

  function saveConfig(id: string, body: Record<string, unknown>) {
    return act(id, `save the settings of ${label(id)}`, () => kgPost<{ changed?: string[] }>('/klivegames/config/set', { id, ...body }),
      d => (d?.changed?.length ? `Saved ${d.changed.length} change${d.changed.length === 1 ? '' : 's'}.` : 'Saved.'));
  }

  function rename(id: string, name: string) {
    return act(id, 'rename the server', () => kgPost('/klivegames/config/set', { id, name }), `Renamed to ${name}.`);
  }

  function setPublic(id: string, value: boolean) {
    return act(id, value ? 'make it public' : 'make it local-only', () => kgPost<{ message?: string }>('/klivegames/network/setpublic', { id, public: value }), d => d?.message ?? (value ? 'Public.' : 'Local only.'));
  }

  // ── files ──
  function listFiles(id: string, path: string) {
    return kgGet<{ path: string; entries: KgFileEntry[] }>(`/klivegames/files/list?id=${enc(id)}&path=${enc(path)}`);
  }

  async function readText(id: string, path: string): Promise<Result<string>> {
    try {
      const res = await RequestGETFromKliveAPI(`/klivegames/files/download?id=${enc(id)}&path=${enc(path)}`, false, false);
      const text = await res.text();
      if (!res.ok) return { ok: false, status: res.status, error: kgErrorText(res.status, text), missing: false };
      return { ok: true, data: text };
    } catch { return { ok: false, status: 0, error: 'Could not reach the server.', missing: false }; }
  }

  function writeText(id: string, path: string, content: string) {
    return act(id, `save ${path}`, () => kgPost('/klivegames/files/edit', { id, path, content }), `Saved ${path.split('/').pop()}.`);
  }

  function deleteFile(id: string, path: string) {
    return act(id, `delete ${path}`, () => kgPost('/klivegames/files/delete', { id, path }), `Deleted ${path.split('/').pop()}.`);
  }

  function upload(id: string, dir: string, file: File) {
    return act(id, `upload ${file.name}`, () => kgPost(`/klivegames/files/upload?id=${enc(id)}&path=${enc(dir)}&name=${enc(file.name)}`, undefined, file), `Uploaded ${file.name}.`);
  }

  /**
   * Downloads through the API (it needs the Authorization header, so a plain link can't). Large files stream
   * straight to disk where the browser can (a 2 GB backup would otherwise be held in memory whole), with progress.
   */
  const downloads = ref<{ id: number; name: string; done: number; total: number }[]>([]);
  let downloadSeq = 0;
  async function download(path: string, name: string, sizeHint?: number) {
    const id = ++downloadSeq;
    const entry = reactive({ id, name, done: 0, total: sizeHint ?? 0 });
    downloads.value = [...downloads.value, entry];
    try {
      const big = (sizeHint ?? 0) > 64 * 1048576;
      const picker = (globalThis as any).showSaveFilePicker as undefined | ((o: any) => Promise<any>);
      let handle: any = null;
      if (big && picker) {
        try { handle = await picker({ suggestedName: name }); }
        catch { return; } // the save dialog was cancelled
      }
      const res = await RequestGETFromKliveAPI(path, false, false);
      if (!res.ok || !res.body) { say('crit', `Couldn't download ${name}`, kgErrorText(res.status, await res.text().catch(() => ''))); return; }
      entry.total = Number(res.headers.get('content-length') ?? sizeHint ?? 0);
      const reader = res.body.getReader();
      if (handle) {
        const writable = await handle.createWritable();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          await writable.write(value);
          entry.done += value.byteLength;
        }
        await writable.close();
      } else {
        const parts: Uint8Array[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
          entry.done += value.byteLength;
        }
        const url = URL.createObjectURL(new Blob(parts));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
      say('ok', `Downloaded ${name}`, kgBytes(entry.done));
    } catch (e: any) {
      say('crit', `Download of ${name} failed`, e?.message);
    } finally {
      downloads.value = downloads.value.filter(d => d.id !== id);
    }
  }

  // ── deploy ──
  function getGames() { return kgGet<{ games: KgGameInfo[] }>('/klivegames/games'); }
  function getVersions(game: string, flavor: string) { return kgGet<{ versions: KgVersion[] }>(`/klivegames/versions?game=${enc(game)}&flavor=${enc(flavor)}`); }
  function create(body: Record<string, unknown>) {
    return act(null, 'deploy the server', () => kgPost<{ server: any }>('/klivegames/servers/create', body), d => `Deploying ${d?.server?.Name ?? 'the server'}. It installs in the background.`);
  }

  return {
    allowed, needs,
    servers, sorted, byId, host, upnp, activity, issues, running, playersOnline,
    legacy, loaded, loading, loadError, lastLoadedAt, now, pending,
    start, stop, refresh,
    toasts, say, dismiss,
    lifecycle, stopAll, sendCommand,
    getActivity, getVitals, getPlayers, playerAction,
    getBackups, backupNow, restoreBackup, deleteBackup, setSchedule, scheduleAll,
    getConfig, saveConfig, rename, setPublic,
    listFiles, readText, writeText, deleteFile, upload, download, downloads,
    getGames, getVersions, create,
  };
}

export type KliveGamesApi = ReturnType<typeof useKliveGames>;
