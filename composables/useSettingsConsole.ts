import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import {
  computeAttention, isOn, loadFailure, readBoard, sameValue, saveFailure, serializeList, parseList, shortValue,
  toSetting, validateValue, TYPE, type BoardMeta, type RawSetting, type Setting, type ViewId,
} from '~/scripts/settingsConsole';

/**
 * State for the OmniSettings page: the store as the server reports it, what is being typed, and the
 * saves in flight. One instance per page visit.
 *
 * Reads: one `/OmniGlobalSettings/Board` on arrival (`/List` on a server without it), again when the tab
 * comes back after a while, and on request. Nothing polls: settings change when someone changes them.
 *
 * Writes go one at a time, in order. A switch or a choice saves the moment it changes; typed values save
 * on Enter. The row shows the new value straight away and goes back if the server refuses it.
 *
 * Secrets: the server sends a mask, this file drops even that, and a replacement lives only in memory
 * until it is sent, then is cleared whatever the outcome. No server error body is ever shown or logged.
 */

const REQUEST_TIMEOUT_MS = 15_000;
/** A tab that comes back after this long reads the store again. */
const STALE_AFTER_MS = 30_000;
const PREFS_KEY = 'ost:prefs';

export interface SettingsToast {
  id: number;
  tone: 'ok' | 'warn' | 'crit' | 'info';
  text: string;
  action?: { label: string; run: () => void };
}

export interface RowState {
  saving?: boolean;
  error?: string | null;
  /** When it last saved here, for a brief tick on the row. */
  savedAt?: number | null;
  /** The value changed on the server while a draft of it was open. */
  conflict?: string | null;
}

interface Draft { text: string; base: string }
interface Prefs { view: ViewId; collapsed: string[] }

function readPrefs(): Prefs {
  const fallback: Prefs = { view: 'all', collapsed: [] };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      view: typeof parsed.view === 'string' ? parsed.view : 'all',
      collapsed: Array.isArray(parsed.collapsed) ? parsed.collapsed.filter((x: unknown) => typeof x === 'string') : [],
    };
  } catch { return fallback; }
}

export function useSettingsConsole() {
  const profile = useCurrentProfile();
  const canRead = computed(() => profile.can('system.settings.read'));
  const canWrite = computed(() => profile.can('system.settings.write'));

  // ── what the server said ──
  const settings = shallowRef<Setting[]>([]);
  const meta = shallowRef<BoardMeta>({ source: 'board', generatedAt: null, sessionStartedAt: null, readTrackingSince: null });
  const loading = ref(true);
  const refreshing = ref(false);
  const loadError = ref<string | null>(null);
  const loadedAt = ref<number | null>(null);
  const now = ref(Date.now());

  // ── what is being typed ──
  const drafts = ref<Record<string, Draft>>({});
  /** Replacement secrets, by key. Never persisted, never logged, cleared after every send. */
  const secrets = ref<Record<string, string>>({});
  const rows = ref<Record<string, RowState>>({});
  const savesInFlight = ref(0);
  const deleting = ref<{ done: number; total: number } | null>(null);

  // ── around the page ──
  const toasts = ref<SettingsToast[]>([]);
  const prefs = ref<Prefs>({ view: 'all', collapsed: [] });
  let toastId = 0;
  let queue: Promise<unknown> = Promise.resolve();

  const byKey = computed(() => new Map(settings.value.map(setting => [setting.key, setting])));
  const attention = computed(() => computeAttention(settings.value, meta.value, now.value));
  const attentionKeys = computed(() => new Set(attention.value.flatMap(item => item.keys)));
  const draftCount = computed(() => Object.keys(drafts.value).length + Object.values(secrets.value).filter(Boolean).length);

  function notify(tone: SettingsToast['tone'], text: string, action?: SettingsToast['action'], ms = 6_000) {
    const id = ++toastId;
    toasts.value = [...toasts.value.slice(-3), { id, tone, text, action }];
    window.setTimeout(() => dismissToast(id), action ? ms + 3_000 : ms);
  }
  function dismissToast(id: number) {
    toasts.value = toasts.value.filter(toast => toast.id !== id);
  }

  function patchRow(key: string, patch: Partial<RowState>) {
    rows.value = { ...rows.value, [key]: { ...rows.value[key], ...patch } };
  }

  function replaceSetting(next: Setting) {
    settings.value = settings.value.map(setting => (setting.key === next.key ? next : setting));
  }

  async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try { return await run(controller.signal); } finally { window.clearTimeout(timer); }
  }

  // ───────────────────────────── reading ─────────────────────────────

  async function load(options: { quiet?: boolean } = {}) {
    if (!options.quiet) loading.value = settings.value.length === 0;
    refreshing.value = true;
    try {
      const { status, body } = await withTimeout(async signal => {
        let response = await RequestGETFromKliveAPI('/OmniGlobalSettings/Board', false, false, {}, signal);
        // A server from before the board: the plain list, without defaults, stamps or waits.
        if (response.status === 404 || response.status === 405) {
          response = await RequestGETFromKliveAPI('/OmniGlobalSettings/List', false, false, {}, signal);
        }
        let parsed: unknown = null;
        if (response.ok) { try { parsed = await response.json(); } catch { /* not JSON */ } }
        return { status: response.status, body: parsed };
      });
      const board = status === 200 ? readBoard(body) : null;
      if (!board) {
        loadError.value = status === 200 ? 'The server sent something this page cannot read.' : loadFailure(status);
        return;
      }
      settings.value = board.settings;
      meta.value = board.meta;
      loadError.value = null;
      loadedAt.value = Date.now();
      now.value = Date.now();
      // A fresh read clears any unsent replacement secret (OmniSettings-Security.md); ordinary drafts stay.
      secrets.value = {};
      reconcileDrafts();
    } catch {
      loadError.value = loadFailure(0);
    } finally {
      loading.value = false;
      refreshing.value = false;
    }
  }

  /** After a reload: drop drafts of settings that went away; flag ones whose value moved underneath. */
  function reconcileDrafts() {
    const next: Record<string, Draft> = {};
    for (const [key, draft] of Object.entries(drafts.value)) {
      const setting = byKey.value.get(key);
      if (!setting) continue;
      next[key] = draft;
      const moved = !sameValue(setting.type, setting.value, draft.base);
      if (moved !== !!rows.value[key]?.conflict) patchRow(key, { conflict: moved ? shortValue(setting.type, setting.value, setting.unit) : null });
    }
    drafts.value = next;
    for (const key of Object.keys(secrets.value)) if (!byKey.value.has(key)) delete secrets.value[key];
  }

  // ───────────────────────────── typing ─────────────────────────────

  function setDraft(setting: Setting, text: string) {
    const next = { ...drafts.value };
    if (sameValue(setting.type, text, setting.value) && text === setting.value) delete next[setting.key];
    else next[setting.key] = { text, base: drafts.value[setting.key]?.base ?? setting.value };
    drafts.value = next;
    if (rows.value[setting.key]?.error) patchRow(setting.key, { error: null });
  }

  function setSecret(setting: Setting, text: string) {
    secrets.value = { ...secrets.value, [setting.key]: text };
    if (rows.value[setting.key]?.error) patchRow(setting.key, { error: null });
  }

  function revert(setting: Setting) {
    const nextDrafts = { ...drafts.value };
    delete nextDrafts[setting.key];
    drafts.value = nextDrafts;
    const nextSecrets = { ...secrets.value };
    delete nextSecrets[setting.key];
    secrets.value = nextSecrets;
    patchRow(setting.key, { error: null, conflict: null });
  }

  /** "  007 " → "7"; anything that is not a whole number is left for validation to refuse. */
  const normalizeInt = (text: string) => (/^\s*[+-]?\d+\s*$/.test(text) ? String(Number.parseInt(text.trim(), 10)) : text);

  /** The value a draft would save, or why it cannot. */
  function draftCheck(setting: Setting): { value: string; error: string | null } | null {
    if (setting.sensitive) {
      const text = secrets.value[setting.key] ?? '';
      // The mask is what an empty field used to show: typing it back is not a new secret.
      if (!text || text === '********') return null;
      const value = setting.type === TYPE.Bool ? text.trim().toLowerCase() : setting.type === TYPE.Int ? normalizeInt(text) : text;
      return { value, error: validateValue(setting, value) };
    }
    const draft = drafts.value[setting.key];
    if (!draft) return null;
    const value = setting.type === TYPE.Int ? normalizeInt(draft.text)
      : setting.type === TYPE.List ? serializeList(parseList(draft.text))
        : draft.text;
    return { value, error: validateValue(setting, value) };
  }

  // ───────────────────────────── saving ─────────────────────────────

  async function send(setting: Setting, value: string): Promise<{ ok: boolean; status: number; row: RawSetting | null }> {
    const payload: Record<string, unknown> = {
      name: setting.name,
      value,
      parentServiceId: setting.ownerId,
      parentServiceName: setting.ownerName,
      returnView: true,
      ...(setting.sensitive ? { sensitive: true } : {}),
    };
    const response = await RequestPOSTFromKliveAPI('/OmniGlobalSettings/Set', JSON.stringify(payload), false, true);
    let row: RawSetting | null = null;
    if (response.ok) {
      // A server that predates the board answers "OK", which is not a row.
      try {
        const body = await response.json();
        if (body && typeof body === 'object' && typeof body.Name === 'string') row = body as RawSetting;
      } catch { /* plain OK */ }
    }
    return { ok: response.ok, status: response.status, row };
  }

  type SaveMode = 'edit' | 'undo' | 'reset';

  /** Queues one save. Resolves true when the server took it. */
  function save(setting: Setting, value: string, mode: SaveMode = 'edit'): Promise<boolean> {
    const run = async (): Promise<boolean> => {
      const current = byKey.value.get(setting.key) ?? setting;
      const previous = current.value;
      savesInFlight.value++;
      patchRow(current.key, { saving: true, error: null });
      if (!current.sensitive) {
        // Shown at once: the server's answer only confirms or undoes it.
        replaceSetting({
          ...current, value, hasValue: value.length > 0,
          matchesDefault: current.defaultValue == null ? current.matchesDefault : sameValue(current.type, value, current.defaultValue),
        });
      }
      const putBack = () => {
        const shown = byKey.value.get(current.key);
        if (!current.sensitive && shown) replaceSetting({ ...shown, value: previous, hasValue: current.hasValue, matchesDefault: current.matchesDefault });
      };
      try {
        const result = await send(current, value);
        if (!result.ok) {
          putBack();
          const message = saveFailure(result.status, current.type);
          patchRow(current.key, { saving: false, error: message });
          notify('crit', `${current.name}: ${message}`);
          return false;
        }
        const latest = byKey.value.get(current.key) ?? current;
        const confirmed = result.row ? toSetting(result.row) : {
          ...latest,
          value: current.sensitive ? '' : value,
          hasValue: value.length > 0,
          updatedAt: Date.now(),
          updatedBy: profile.username.value || latest.updatedBy,
          awaiting: value.length > 0 ? false : latest.awaiting,
        };
        // The board row is the server's word; keep this session's read state if it sent none.
        replaceSetting({ ...confirmed, readThisSession: confirmed.readThisSession || latest.readThisSession, lastReadAt: confirmed.lastReadAt ?? latest.lastReadAt });
        const nextDrafts = { ...drafts.value };
        delete nextDrafts[current.key];
        drafts.value = nextDrafts;
        patchRow(current.key, { saving: false, error: null, conflict: null, savedAt: Date.now() });

        if (current.sensitive) notify('ok', `${current.name}: secret ${current.hasValue ? 'replaced' : 'saved'}.`);
        else if (mode === 'undo') notify('info', `${current.name} is back to ${shortValue(current.type, value, current.unit)}.`);
        else if (!sameValue(current.type, previous, value)) {
          const verb = mode === 'reset' ? 'reset to its default' : `set to ${shortValue(current.type, value, current.unit)}`;
          notify('ok', `${current.name} ${verb}.`, { label: 'Undo', run: () => { void save(latestOf(current), previous, 'undo'); } });
        }
        return true;
      } catch {
        putBack();
        patchRow(current.key, { saving: false, error: saveFailure(0, current.type) });
        notify('crit', `${current.name}: ${saveFailure(0, current.type)}`);
        return false;
      } finally {
        savesInFlight.value--;
        if (current.sensitive) {
          // Whatever happened, the replacement is gone from memory.
          const nextSecrets = { ...secrets.value };
          delete nextSecrets[current.key];
          secrets.value = nextSecrets;
        }
      }
    };
    const result = queue.then(run, run);
    queue = result.catch(() => false);
    return result;
  }

  const latestOf = (setting: Setting) => byKey.value.get(setting.key) ?? setting;

  /** Enter, the tick, or Save all: sends a typed value if it is valid. */
  async function commit(setting: Setting): Promise<boolean> {
    if (!canWrite.value) return false;
    const check = draftCheck(setting);
    if (!check) return false;
    if (check.error) {
      patchRow(setting.key, { error: check.error });
      if (setting.sensitive) {
        // A refused secret is not kept around for another try.
        const nextSecrets = { ...secrets.value };
        delete nextSecrets[setting.key];
        secrets.value = nextSecrets;
      }
      return false;
    }
    // "045" for 45, or a list that only lost blank entries: nothing to send.
    if (!setting.sensitive && sameValue(setting.type, check.value, setting.value)) {
      revert(setting);
      return true;
    }
    return save(setting, check.value, 'edit');
  }

  function toggle(setting: Setting) {
    if (!canWrite.value || setting.sensitive || setting.type !== TYPE.Bool) return;
    void save(setting, isOn(setting.value) ? 'false' : 'true');
  }

  function choose(setting: Setting, option: string) {
    if (!canWrite.value || setting.sensitive || sameValue(setting.type, option, setting.value)) return;
    void save(setting, option);
  }

  function resetToDefault(setting: Setting) {
    if (!canWrite.value || setting.sensitive || setting.defaultValue == null || setting.matchesDefault !== false) return;
    void save(setting, setting.defaultValue, 'reset');
  }

  async function saveAll() {
    const keys = [...Object.keys(drafts.value), ...Object.keys(secrets.value).filter(key => secrets.value[key])];
    let saved = 0;
    let refused = 0;
    for (const key of [...new Set(keys)]) {
      const setting = byKey.value.get(key);
      if (!setting) continue;
      if (await commit(setting)) saved++;
      else refused++;
    }
    if (saved + refused > 1) notify(refused ? 'warn' : 'ok', refused ? `${saved} saved, ${refused} need another look.` : `${saved} settings saved.`);
  }

  function discardAll() {
    drafts.value = {};
    secrets.value = {};
    const next: Record<string, RowState> = {};
    for (const [key, state] of Object.entries(rows.value)) next[key] = { ...state, error: null, conflict: null };
    rows.value = next;
  }

  // ───────────────────────────── deleting ─────────────────────────────

  async function removeOne(setting: Setting): Promise<boolean> {
    const response = await RequestPOSTFromKliveAPI('/OmniGlobalSettings/Delete',
      JSON.stringify({ name: setting.name, parentServiceId: setting.ownerId }), false, true);
    if (!response.ok && response.status !== 404) return false;
    settings.value = settings.value.filter(candidate => candidate.key !== setting.key);
    revert(setting);
    return true;
  }

  /** Deletes settings one after another (each rewrites the store). Says how many went. */
  async function remove(targets: Setting[]): Promise<number> {
    if (!canWrite.value || !targets.length) return 0;
    let done = 0;
    let removed = 0;
    deleting.value = { done, total: targets.length };
    try {
      for (const setting of targets) {
        if (await removeOne(setting)) removed++;
        deleting.value = { done: ++done, total: targets.length };
      }
    } catch { /* counted below */ }
    finally { deleting.value = null; }
    if (removed === targets.length) notify('ok', removed === 1 ? `${targets[0].name} deleted.` : `${removed} settings deleted.`);
    else notify('crit', `${targets.length - removed} of ${targets.length} could not be deleted.`);
    return removed;
  }

  // ───────────────────────────── small things ─────────────────────────────

  async function copyName(setting: Setting) {
    try {
      await navigator.clipboard.writeText(setting.name);
      notify('info', `Copied ${setting.name}.`, undefined, 2_500);
    } catch {
      notify('warn', 'The browser would not copy to the clipboard.', undefined, 3_000);
    }
  }

  function savePrefs() {
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs.value)); } catch { /* private window: preferences last this visit */ }
  }

  function setView(view: ViewId) {
    prefs.value = { ...prefs.value, view };
    savePrefs();
  }

  function toggleCollapsed(owner: string) {
    const collapsed = new Set(prefs.value.collapsed);
    if (collapsed.has(owner)) collapsed.delete(owner);
    else collapsed.add(owner);
    prefs.value = { ...prefs.value, collapsed: [...collapsed] };
    savePrefs();
  }

  function setAllCollapsed(owners: string[], collapse: boolean) {
    prefs.value = { ...prefs.value, collapsed: collapse ? owners : [] };
    savePrefs();
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  let ticker: number | undefined;
  function onVisible() {
    if (document.visibilityState !== 'visible') return;
    now.value = Date.now();
    const stale = loadedAt.value == null || Date.now() - loadedAt.value > STALE_AFTER_MS;
    // Coming back from a password manager mid-secret must not wipe the field: no automatic read then.
    const typingSecret = Object.values(secrets.value).some(Boolean);
    if (stale && savesInFlight.value === 0 && !refreshing.value && !typingSecret) void load({ quiet: true });
  }

  onMounted(() => {
    prefs.value = readPrefs();
    void profile.ensureLoaded();
    void load();
    ticker = window.setInterval(() => { now.value = Date.now(); }, 15_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
  });

  onBeforeUnmount(() => {
    window.clearInterval(ticker);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    secrets.value = {};
  });

  return {
    profile, canRead, canWrite,
    settings, meta, loading, refreshing, loadError, loadedAt, now,
    drafts, secrets, rows, savesInFlight, deleting, draftCount,
    attention, attentionKeys, byKey,
    toasts, prefs,
    load, setDraft, setSecret, revert, draftCheck, commit, toggle, choose, resetToDefault, saveAll, discardAll,
    remove, copyName, notify, dismissToast, setView, toggleCollapsed, setAllCollapsed,
  };
}
