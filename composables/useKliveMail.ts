import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { RequestBatchFromKliveAPI, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useAccess } from '~/composables/useAccess';
import {
  CODES_PATH, INLINE_IMAGE_MAX_BYTES, PAGE_SIZE, accountsByAddress, inlineImagesToLoad, listPath, resolveInlineImages, searchPath,
  codeForClipboard, normalizeDetail, normalizeRow, normalizeSummary, plural,
  type FolderId, type MailAccount, type MailDetail, type MailRow, type MailSummary, type View,
} from '~/scripts/kliveMail';

/**
 * State for the KliveMail page. One instance per visit.
 *
 * Request tiers. One /batch every 15 s while the page is looked at: the mail summary (the server
 * keeps it built, so it costs a pointer read), the first page of the open list, and the latest
 * codes while no message is open. A message is read when opened; the next one is read ahead
 * without marking it, on servers that allow that. Nothing at all while the tab is hidden: the old
 * page polled the summary and the full list every 10 s from background tabs.
 *
 * Every field the server sends is optional here, because the site and the server deploy
 * separately: an older server simply shows less (no codes, no health line, no restore).
 */

const POLL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 20_000;
const DETAIL_CACHE = 40;
const PREFS_KEY = 'kml:prefs';

export interface MailToast {
  id: number;
  tone: 'ok' | 'warn' | 'crit' | 'info';
  text: string;
  action?: { label: string; run: () => unknown };
}

interface Prefs { paper: 'light' | 'dark'; quietOpen: boolean; unpinnedOpen: boolean; searchEverywhere: boolean }
const DEFAULT_PREFS: Prefs = { paper: 'light', quietOpen: false, unpinnedOpen: true, searchEverywhere: false };

function parse<T>(text: string): T | null {
  const trimmed = text.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return null;
  try { return JSON.parse(trimmed) as T; } catch { return null; }
}

function bodyOf<T>(value: unknown): T | null {
  if (value == null) return null;
  return typeof value === 'string' ? parse<T>(value) : (value as T);
}

const isMissing = (status: number) => status === 404 || status === 405;

export function useKliveMail() {
  const access = useAccess();
  const can = (key: string) => access.can(key);
  const allowed = computed(() => ({
    summary: can('klivemail.mailboxes.read'),
    read: can('klivemail.messages.read'),
    act: can('klivemail.messages.act'),
    del: can('klivemail.messages.delete'),
    manage: can('klivemail.mailboxes.manage'),
    accounts: can('accounts.registry.read'),
  }));

  // ── what the server said ──
  const summary = shallowRef<MailSummary | null>(null);
  const rows = shallowRef<MailRow[]>([]);
  const hasMore = ref(false);
  const recentCodes = shallowRef<MailRow[] | null>(null);
  const accounts = shallowRef<Map<string, MailAccount[]>>(new Map());
  /** What this server can do, learnt from its answers. null = not known yet. */
  const features = ref({ codes: null as boolean | null, bulk: true, restore: true, peek: false });

  // ── what Klives is looking at ──
  const view = ref<View>({ folder: 'inbox', mailbox: null });
  const query = ref('');          // the search that is running ('' = none)
  const page = ref(1);
  const selectedId = ref<string | null>(null);
  const detail = shallowRef<MailDetail | null>(null);
  const detailLoading = ref(false);
  const detailError = ref<string | null>(null);
  const checked = ref<string[]>([]);
  const pending = ref<Record<string, string>>({});
  const prefs = ref<Prefs>({ ...DEFAULT_PREFS });
  const freshIds = ref<Set<string>>(new Set());

  // ── freshness ──
  const now = ref(Date.now());
  const ready = ref(false);
  const hidden = ref(false);
  const listLoading = ref(false);
  const listError = ref<string | null>(null);
  const lastOkAt = ref<number | null>(null);
  const failures = ref(0);
  const reachable = computed(() => failures.value < 3);

  const toasts = ref<MailToast[]>([]);
  let toastId = 0;
  function notify(tone: MailToast['tone'], text: string, action?: MailToast['action'], ms = 6_000) {
    const id = ++toastId;
    toasts.value = [...toasts.value, { id, tone, text, action }];
    window.setTimeout(() => dismissToast(id), ms);
  }
  function dismissToast(id: number) { toasts.value = toasts.value.filter(t => t.id !== id); }

  const cache = new Map<string, { at: number; detail: MailDetail }>();
  function remember(d: MailDetail) {
    cache.delete(d.id);
    cache.set(d.id, { at: Date.now(), detail: d });
    while (cache.size > DETAIL_CACHE) cache.delete(cache.keys().next().value as string);
  }

  // ───────────────────────────── requests ─────────────────────────────

  async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try { return await run(controller.signal); } finally { window.clearTimeout(timer); }
  }

  async function getJson<T>(path: string): Promise<{ status: number; body: T | null }> {
    const response = await withTimeout(signal => RequestGETFromKliveAPI(path, false, false, {}, signal));
    const text = await response.text();
    return { status: response.status, body: parse<T>(text) };
  }

  async function postJson<T>(path: string, body?: unknown): Promise<{ status: number; body: T | null; text: string }> {
    const response = await withTimeout(signal => RequestPOSTFromKliveAPI(path, body === undefined ? '' : JSON.stringify(body), false, body !== undefined, signal));
    const text = await response.text();
    return { status: response.status, body: parse<T>(text), text };
  }

  const currentListPath = (p = 1) => (query.value
    ? searchPath(query.value, prefs.value.searchEverywhere ? null : view.value.mailbox, p)
    : listPath(view.value, p));

  function applySummary(raw: unknown) {
    const body = bodyOf<any>(raw);
    if (!body || body.pending) return;
    summary.value = normalizeSummary(body);
  }

  function learnFeatures(list: MailRow[]) {
    if (list.length && features.value.codes === null) features.value = { ...features.value, codes: list.some(r => r.code !== undefined) };
  }

  /** Puts a fresh first page in front of what is already loaded, keeping older pages Klives scrolled to. */
  function mergeFirstPage(fresh: MailRow[]) {
    learnFeatures(fresh);
    const old = rows.value;
    if (!old.length) { rows.value = fresh; return; }
    const seen = new Set(old.map(r => r.id));
    const arrivals = fresh.filter(r => !seen.has(r.id) && !r.isRead).map(r => r.id);
    const ids = new Set(fresh.map(r => r.id));
    const oldest = fresh.length ? fresh[fresh.length - 1].receivedAt : Infinity;
    const local = new Map(old.map(r => [r.id, r]));
    // A row the page is changing right now keeps the state the page gave it.
    const merged = fresh.map(r => (pending.value[r.id] && local.has(r.id) ? local.get(r.id)! : r));
    const tail = fresh.length < PAGE_SIZE ? [] : old.filter(r => !ids.has(r.id) && r.receivedAt < oldest);
    rows.value = [...merged, ...tail];
    if (arrivals.length) {
      freshIds.value = new Set([...freshIds.value, ...arrivals]);
      window.setTimeout(() => { freshIds.value = new Set([...freshIds.value].filter(id => !arrivals.includes(id))); }, 4_000);
    }
  }

  let fastInFlight = false;
  let listGeneration = 0;

  /** The 15 s tier: summary, the open list's first page and the latest codes, in one request. */
  async function refresh(): Promise<void> {
    if (fastInFlight || (!allowed.value.summary && !allowed.value.read)) return;
    fastInFlight = true;
    const generation = listGeneration;
    try {
      const paths: string[] = [];
      if (allowed.value.summary) paths.push('/klivemail/mailboxes');
      // The first page only while Klives has not paged further, so his place in a long list holds.
      const listNow = allowed.value.read && page.value === 1 ? currentListPath(1) : null;
      if (listNow) paths.push(listNow);
      const wantCodes = allowed.value.read && features.value.codes !== false && !selectedId.value;
      if (wantCodes && listNow !== CODES_PATH) paths.push(CODES_PATH);

      const results = await withTimeout(signal => RequestBatchFromKliveAPI(paths, signal));
      if (!results.size) throw new Error('batch failed');
      failures.value = 0;
      lastOkAt.value = Date.now();

      const s = results.get('/klivemail/mailboxes');
      if (s?.status === 200) applySummary(s.body);

      if (listNow && generation === listGeneration) {
        const item = results.get(listNow);
        if (item?.status === 200) {
          const list = bodyOf<any[]>(item.body);
          if (Array.isArray(list)) {
            mergeFirstPage(list.map(normalizeRow));
            if (rows.value.length <= PAGE_SIZE) hasMore.value = list.length >= PAGE_SIZE;
            listError.value = null;
          }
        } else if (item && item.status !== 403) {
          listError.value = `The server answered ${item.status}`;
        }
      }
      const codes = results.get(CODES_PATH);
      if (codes?.status === 200) {
        const list = (bodyOf<any[]>(codes.body) ?? []).map(normalizeRow);
        // A server from before codes ignores ?codes=1 and sends ordinary mail without the field.
        if (list.length && list.every(r => r.code === undefined)) { features.value = { ...features.value, codes: false }; recentCodes.value = null; }
        else recentCodes.value = list.filter(r => r.code);
      }
    } catch {
      failures.value += 1;
    } finally {
      fastInFlight = false;
      ready.value = true;
    }
  }

  /** A new view or search: its first page, replacing the list. */
  async function loadList(): Promise<void> {
    if (!allowed.value.read) { rows.value = []; return; }
    const generation = ++listGeneration;
    listLoading.value = true;
    page.value = 1;
    const path = currentListPath(1);
    try {
      const result = await getJson<any[]>(path);
      if (generation !== listGeneration) return;
      if (result.status === 200 && Array.isArray(result.body)) {
        const list = result.body.map(normalizeRow);
        learnFeatures(list);
        rows.value = list;
        hasMore.value = list.length >= PAGE_SIZE;
        listError.value = null;
        failures.value = 0;
        lastOkAt.value = Date.now();
      } else if (result.status !== 403) {
        listError.value = `The server answered ${result.status}`;
      }
    } catch {
      if (generation === listGeneration) listError.value = 'No answer from the server';
    } finally {
      if (generation === listGeneration) listLoading.value = false;
    }
  }

  /** The next 50: a real next page (the old "Load more" re-asked for one ever-larger page and stopped at 200). */
  async function loadMore(): Promise<void> {
    if (listLoading.value || !hasMore.value) return;
    const generation = listGeneration;
    listLoading.value = true;
    const next = page.value + 1;
    try {
      const result = await getJson<any[]>(currentListPath(next));
      if (generation !== listGeneration) return;
      if (result.status === 200 && Array.isArray(result.body)) {
        const known = new Set(rows.value.map(r => r.id));
        const list = result.body.map(normalizeRow);
        rows.value = [...rows.value, ...list.filter(r => !known.has(r.id))];
        page.value = next;
        hasMore.value = list.length >= PAGE_SIZE;
      }
    } catch {
      notify('warn', 'Could not load more mail; try again in a moment.');
    } finally {
      if (generation === listGeneration) listLoading.value = false;
    }
  }

  async function loadAccounts(): Promise<void> {
    if (!allowed.value.accounts) return;
    try {
      const result = await getJson<unknown[]>('/accounts/list');
      if (result.status === 200) accounts.value = accountsByAddress(result.body);
    } catch { /* optional: the rail just shows no account tags */ }
  }

  // ───────────────────────────── navigation ─────────────────────────────

  function setView(next: Partial<View>) {
    view.value = { folder: next.folder ?? view.value.folder, mailbox: next.mailbox !== undefined ? next.mailbox : view.value.mailbox };
    query.value = '';
    checked.value = [];
    void loadList();
  }

  function goFolder(folder: FolderId) { setView({ folder, mailbox: null }); }
  function goMailbox(address: string) { setView({ folder: 'inbox', mailbox: address.toLowerCase() }); }

  function runSearch(text: string) {
    const q = text.trim();
    if (q === query.value) return;
    query.value = q;
    checked.value = [];
    void loadList();
  }

  // ───────────────────────────── reading ─────────────────────────────

  function patchRow(id: string, patch: Partial<MailRow>) {
    rows.value = rows.value.map(r => (r.id === id ? { ...r, ...patch } : r));
    if (detail.value?.id === id) detail.value = { ...detail.value, ...patch };
    const cached = cache.get(id);
    if (cached) cached.detail = { ...cached.detail, ...patch };
    if (recentCodes.value) recentCodes.value = recentCodes.value.map(r => (r.id === id ? { ...r, ...patch } : r));
  }

  /** Moves the unread counts by `delta` for these rows' mailboxes, until the next summary says. */
  function shiftUnread(changed: MailRow[], delta: number) {
    const s = summary.value;
    if (!s || !changed.length) return;
    const byBox = new Map<string, number>();
    for (const r of changed) byBox.set(r.to, (byBox.get(r.to) ?? 0) + delta);
    const fix = (list: MailSummary['mailboxes']) => list.map(m => (byBox.has(m.address) ? { ...m, unread: Math.max(0, m.unread + byBox.get(m.address)!) } : m));
    summary.value = { ...s, unread: Math.max(0, s.unread + delta * changed.length), mailboxes: fix(s.mailboxes), others: fix(s.others) };
  }

  let openGeneration = 0;

  async function open(id: string | null): Promise<void> {
    selectedId.value = id;
    detailError.value = null;
    if (!id) { detail.value = null; return; }
    const generation = ++openGeneration;
    const row = rows.value.find(r => r.id === id) ?? recentCodes.value?.find(r => r.id === id) ?? null;
    const cached = cache.get(id);
    if (cached) detail.value = cached.detail;
    else if (row) detail.value = { ...row, code: row.code ?? null, dateAt: null, bodyText: null, bodyHtml: null, rawSize: null, isDeleted: view.value.folder === 'trash', peekSupported: false, attachments: [], links: [], thread: [] };
    const wasUnread = row ? !row.isRead : cached ? !cached.detail.isRead : false;

    // A message read ahead (peek) is still unread on the server: this open marks it.
    const fresh = cached && Date.now() - cached.at < 60_000 && !wasUnread;
    if (wasUnread && row) { patchRow(id, { isRead: true }); shiftUnread([row], -1); }
    if (!fresh) {
      detailLoading.value = !cached;
      try {
        const result = await getJson<any>(`/klivemail/messages/detail?id=${encodeURIComponent(id)}`);
        if (generation !== openGeneration) return;
        if (result.status === 200 && result.body) {
          const d = normalizeDetail(result.body);
          d.isRead = true;
          if (view.value.folder === 'trash') d.isDeleted = true;
          remember(d);
          detail.value = d;
          if (d.peekSupported) features.value = { ...features.value, peek: true };
        } else if (result.status === 404) {
          detailError.value = 'This message is no longer there.';
        } else if (result.status !== 403) {
          detailError.value = `The server answered ${result.status}`;
        }
      } catch {
        if (generation === openGeneration) detailError.value = 'No answer from the server';
      } finally {
        if (generation === openGeneration) detailLoading.value = false;
      }
    }
    if (detail.value?.id === id) void showInlineImages(detail.value);
    void readAhead(id);
  }

  // ── images the mail carries itself ("cid:"), which a sandboxed frame cannot fetch with a key ──
  const inlineDone = new Set<string>();

  function blobToDataUrl(blob: Blob, type: string | null): Promise<string> {
    const typed = blob.type || !type ? blob : new Blob([blob], { type });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(typed);
    });
  }

  /** Fetches the images the HTML draws by Content-ID and swaps them in as data: URLs, once per message. */
  async function showInlineImages(d: MailDetail): Promise<void> {
    if (inlineDone.has(d.id) || !d.bodyHtml) return;
    const wanted = inlineImagesToLoad(d);
    inlineDone.add(d.id);
    if (!wanted.length) return;
    const images = new Map<string, string>();
    await Promise.all(wanted.map(async a => {
      try {
        const response = await withTimeout(signal => RequestGETFromKliveAPI(`/klivemail/attachments/download?id=${encodeURIComponent(a.id)}`, false, false, {}, signal));
        if (!response.ok) return;
        const blob = await response.blob();
        if (blob.size > INLINE_IMAGE_MAX_BYTES) return;
        images.set(a.contentId!.toLowerCase(), await blobToDataUrl(blob, a.contentType));
      } catch { /* that picture stays a broken image, as before */ }
    }));
    if (!images.size) return;
    const resolved: MailDetail = { ...d, bodyHtml: resolveInlineImages(d.bodyHtml, images) };
    remember(resolved);
    if (detail.value?.id === d.id) detail.value = resolved;
  }

  /** Reads the next message without marking it, so j feels instant. Only where the server allows a peek. */
  async function readAhead(id: string) {
    if (!features.value.peek) return;
    const index = rows.value.findIndex(r => r.id === id);
    const next = index >= 0 ? rows.value[index + 1] : null;
    if (!next || cache.has(next.id)) return;
    try {
      const result = await getJson<any>(`/klivemail/messages/detail?id=${encodeURIComponent(next.id)}&peek=1`);
      if (result.status === 200 && result.body) {
        const d = normalizeDetail(result.body);
        d.isRead = next.isRead;
        remember(d);
      }
    } catch { /* it will simply load when opened */ }
  }

  function step(delta: 1 | -1): string | null {
    const list = rows.value;
    if (!list.length) return null;
    const index = selectedId.value ? list.findIndex(r => r.id === selectedId.value) : -1;
    const next = list[Math.min(list.length - 1, Math.max(0, index < 0 ? 0 : index + delta))];
    if (next && next.id !== selectedId.value) void open(next.id);
    if (index + delta >= list.length - 5) void loadMore();
    return next?.id ?? null;
  }

  // ───────────────────────────── acting ─────────────────────────────

  function rowsFor(ids: string[]): MailRow[] {
    const set = new Set(ids);
    const fromList = rows.value.filter(r => set.has(r.id));
    if (detail.value && set.has(detail.value.id) && !fromList.some(r => r.id === detail.value!.id)) fromList.push(detail.value);
    return fromList;
  }

  function markPending(ids: string[], what: string | null) {
    const next = { ...pending.value };
    for (const id of ids) { if (what) next[id] = what; else delete next[id]; }
    pending.value = next;
  }

  async function setRead(ids: string[], read: boolean): Promise<void> {
    if (!allowed.value.act || !ids.length) return;
    const changed = rowsFor(ids).filter(r => r.isRead !== read);
    for (const r of changed) patchRow(r.id, { isRead: read });
    shiftUnread(changed, read ? -1 : 1);
    markPending(ids, read ? 'read' : 'unread');
    try {
      let ok = false;
      if (features.value.bulk) {
        const result = await postJson(`/klivemail/messages/bulk-read?read=${read ? 1 : 0}`, { ids });
        if (isMissing(result.status)) features.value = { ...features.value, bulk: false };
        else ok = result.status === 200;
      }
      if (!features.value.bulk) {
        const results = await Promise.all(ids.map(id => postJson(`/klivemail/messages/${read ? 'mark-read' : 'mark-unread'}?id=${encodeURIComponent(id)}`)));
        ok = results.every(r => r.status === 200);
      }
      if (!ok) throw new Error('refused');
    } catch {
      for (const r of changed) patchRow(r.id, { isRead: !read });
      shiftUnread(changed, read ? 1 : -1);
      notify('crit', `Could not mark ${plural(ids.length, 'message')} ${read ? 'read' : 'unread'}.`);
    } finally {
      markPending(ids, null);
    }
  }

  /** Marks every unread message read, in the open mailbox or everywhere. Returns how many the server changed. */
  async function markAllRead(): Promise<void> {
    if (!allowed.value.act) return;
    const mailbox = view.value.mailbox;
    const visible = rows.value.filter(r => !r.isRead);
    for (const r of visible) patchRow(r.id, { isRead: true });
    try {
      const result = await postJson<{ changed?: number }>(`/klivemail/messages/bulk-read?all=1${mailbox ? `&mailbox=${encodeURIComponent(mailbox)}` : ''}`);
      if (isMissing(result.status)) {
        // An older server: mark what is loaded, one by one.
        features.value = { ...features.value, bulk: false };
        await Promise.all(visible.map(r => postJson(`/klivemail/messages/mark-read?id=${encodeURIComponent(r.id)}`)));
        notify('ok', `Marked ${plural(visible.length, 'loaded message')} read.`);
      } else if (result.status === 200) {
        notify('ok', `Marked ${plural(result.body?.changed ?? visible.length, 'message')} read${mailbox ? ` in ${mailbox}` : ''}.`);
      } else throw new Error('refused');
    } catch {
      for (const r of visible) patchRow(r.id, { isRead: false });
      notify('crit', 'Could not mark the mail read.');
    }
    void refresh();
    if (view.value.folder === 'unread') void loadList();
  }

  async function trash(ids: string[]): Promise<void> {
    if (!allowed.value.del || !ids.length) return;
    const gone = rowsFor(ids);
    const before = rows.value;
    const index = selectedId.value ? before.findIndex(r => r.id === selectedId.value) : -1;
    rows.value = before.filter(r => !ids.includes(r.id));
    checked.value = checked.value.filter(id => !ids.includes(id));
    if (selectedId.value && ids.includes(selectedId.value)) {
      const next = rows.value[Math.min(index, rows.value.length - 1)];
      void open(next?.id ?? null);
    }
    markPending(ids, 'delete');
    try {
      let ok = false;
      if (features.value.bulk) {
        const result = await postJson('/klivemail/messages/bulk-delete', { ids });
        if (isMissing(result.status)) features.value = { ...features.value, bulk: false, restore: false };
        else ok = result.status === 200;
      }
      if (!features.value.bulk) {
        const results = await Promise.all(ids.map(id => postJson(`/klivemail/messages/delete?id=${encodeURIComponent(id)}`)));
        ok = results.every(r => r.status === 200);
      }
      if (!ok) throw new Error('refused');
      for (const id of ids) cache.delete(id);
      const label = ids.length === 1 ? `“${gone[0]?.subject || 'Message'}” moved to Trash` : `${plural(ids.length, 'message')} moved to Trash`;
      notify('ok', label, features.value.restore ? { label: 'Undo', run: () => restore(ids, gone) } : undefined, 8_000);
    } catch {
      rows.value = before;
      notify('crit', `Could not delete ${plural(ids.length, 'message')}.`);
    } finally {
      markPending(ids, null);
      void refresh();
    }
  }

  async function restore(ids: string[], known: MailRow[] = rowsFor(ids)): Promise<void> {
    if (!allowed.value.del || !ids.length) return;
    markPending(ids, 'restore');
    try {
      const result = await postJson('/klivemail/messages/bulk-delete?restore=1', { ids });
      if (isMissing(result.status)) {
        features.value = { ...features.value, restore: false };
        notify('warn', 'This server cannot restore mail yet; it arrives with the next deploy.');
        return;
      }
      if (result.status !== 200) throw new Error('refused');
      if (view.value.folder === 'trash') rows.value = rows.value.filter(r => !ids.includes(r.id));
      else if (known.length) rows.value = [...rows.value, ...known.filter(k => !rows.value.some(r => r.id === k.id))].sort((a, b) => b.receivedAt - a.receivedAt);
      if (detail.value && ids.includes(detail.value.id)) detail.value = { ...detail.value, isDeleted: false };
      notify('ok', ids.length === 1 ? 'Restored.' : `Restored ${plural(ids.length, 'message')}.`);
    } catch {
      notify('crit', 'Could not restore.');
    } finally {
      markPending(ids, null);
      void refresh();
    }
  }

  async function createMailbox(address: string, displayName: string): Promise<boolean> {
    if (!allowed.value.manage) return false;
    const q = new URLSearchParams({ address });
    if (displayName.trim()) q.set('displayName', displayName.trim());
    try {
      const result = await postJson<{ success?: boolean; address?: string }>(`/klivemail/mailboxes/create?${q.toString()}`);
      if (result.status !== 200) throw new Error(String(result.status));
      if (result.body?.success === false) { notify('warn', `${result.body?.address ?? address} is already pinned.`); return false; }
      notify('ok', `${result.body?.address ?? address} pinned. Mail to it shows under its own name.`);
      await refresh();
      return true;
    } catch {
      notify('crit', `Could not pin ${address}.`);
      return false;
    }
  }

  async function unpinMailbox(address: string): Promise<void> {
    if (!allowed.value.manage) return;
    try {
      const result = await postJson(`/klivemail/mailboxes/delete?address=${encodeURIComponent(address)}`);
      if (result.status !== 200) throw new Error(String(result.status));
      notify('ok', `${address} unpinned. Its mail stays, under All mail.`, { label: 'Undo', run: () => createMailbox(address, '') });
      if (view.value.mailbox === address) goFolder('inbox');
      await refresh();
    } catch {
      notify('crit', `Could not unpin ${address}.`);
    }
  }

  async function copy(text: string, what = 'Copied'): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      notify('ok', what, undefined, 2_500);
    } catch {
      notify('warn', 'The browser would not let the page use the clipboard.');
    }
  }

  const copyCode = (code: string) => copy(codeForClipboard(code), `Code ${codeForClipboard(code)} copied`);

  async function downloadAttachment(id: string, fileName: string): Promise<void> {
    try {
      const response = await RequestGETFromKliveAPI(`/klivemail/attachments/download?id=${encodeURIComponent(id)}`, false, false);
      if (!response.ok) throw new Error(String(response.status));
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'attachment';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      notify('crit', `Could not download ${fileName}.`);
    }
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  let pollTimer: number | null = null;
  let clockTimer: number | null = null;

  function schedule() {
    if (pollTimer != null) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(() => { if (!hidden.value) void refresh(); }, POLL_MS);
  }

  function onVisibility() {
    const wasHidden = hidden.value;
    hidden.value = document.visibilityState === 'hidden';
    if (wasHidden && !hidden.value) { now.value = Date.now(); void refresh(); schedule(); }
  }

  watch(prefs, value => {
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(value)); } catch { /* storage blocked */ }
  }, { deep: true });

  /** Starts the page. `initial` comes from the address bar (?mailbox=, ?folder=, ?m=). */
  async function start(initial: { view?: Partial<View>; open?: string | null } = {}): Promise<void> {
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (raw) prefs.value = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    } catch { /* defaults */ }
    hidden.value = document.visibilityState === 'hidden';
    document.addEventListener('visibilitychange', onVisibility);
    clockTimer = window.setInterval(() => { now.value = Date.now(); }, 30_000);
    await access.ensureLoaded(); // permissions decide what is asked for
    if (initial.view) view.value = { ...view.value, ...initial.view };
    await Promise.all([loadList(), refresh()]);
    if (initial.open) void open(initial.open);
    void loadAccounts();
    schedule();
  }

  onBeforeUnmount(() => {
    if (pollTimer != null) window.clearInterval(pollTimer);
    if (clockTimer != null) window.clearInterval(clockTimer);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  return {
    allowed, summary, rows, hasMore, recentCodes, accounts, features, view, query, page, selectedId, detail, detailLoading, detailError,
    checked, pending, prefs, freshIds, now, ready, hidden, listLoading, listError, lastOkAt, failures, reachable, toasts,
    start, refresh, loadList, loadMore, setView, goFolder, goMailbox, runSearch, open, step,
    setRead, markAllRead, trash, restore, createMailbox, unpinMailbox, copy, copyCode, downloadAttachment, notify, dismissToast,
  };
}
