/**
 * Pure rules for the KliveMail page: the shapes the server sends, how they are read (every field
 * optional, because site and server deploy separately), and the small decisions the page makes —
 * which day a message belongs under, what the rail shows first, how an email is sandboxed.
 *
 * Nothing here touches the network or Vue state; composables/useKliveMail.ts does that.
 */
import { fmtDuration, fmtInt, toMs } from '~/scripts/adminConsole';

// ───────────────────────────── shapes ─────────────────────────────

export interface MailRow {
  id: string;
  to: string;
  from: string;
  fromName: string | null;
  subject: string;
  snippet: string;
  receivedAt: number;
  threadId: string;
  hasAttachments: boolean;
  isRead: boolean;
  /** The sign-in code the server found in it, null when none; undefined from a server that never looks. */
  code: string | null | undefined;
}

export interface MailAttachment { id: string; fileName: string; contentType: string | null; sizeBytes: number; isInline: boolean; contentId: string | null }
export interface MailLink { url: string; host: string | null }

export interface MailDetail extends MailRow {
  dateAt: number | null;
  bodyText: string | null;
  bodyHtml: string | null;
  rawSize: number | null;
  isDeleted: boolean;
  /** True on servers that know ?peek=1 (they send WasRead): a message can be read ahead without marking it. */
  peekSupported: boolean;
  attachments: MailAttachment[];
  links: MailLink[];
  thread: MailRow[];
}

export interface MailboxRow {
  address: string;
  displayName: string | null;
  total: number;
  unread: number;
  pinned: boolean;
  lastAt: number | null;
}

export interface MailHealth {
  smtpState: string | null;
  smtpSince: number | null;
  tls: boolean | null;
  restarts: number;
  lastError: string | null;
  sessions: number | null;
  sessionFaults: number | null;
  lastSessionAt: number | null;
  stored: number | null;
  lastStoredAt: number | null;
  storeErrors: number;
  lastStoreError: string | null;
  startedAt: number | null;
}

export interface MailSummary {
  total: number;
  unread: number;
  trash: number;
  mailboxes: MailboxRow[];
  others: MailboxRow[];
  daily: { day: string; n: number }[];
  lastReceivedAt: number | null;
  received24h: number | null;
  received7d: number | null;
  health: MailHealth | null;
  generatedAt: number | null;
}

/** An account in the shared registry that signed up with an @klive.dev address. */
export interface MailAccount { service: string; username: string | null; status: string | null }

export type FolderId = 'inbox' | 'unread' | 'codes' | 'files' | 'trash';
export interface View { folder: FolderId; mailbox: string | null }

export const FOLDERS: { id: FolderId; label: string; icon: string; hint: string; key: string }[] = [
  { id: 'inbox', label: 'All mail', icon: 'inbox', hint: 'Everything that arrived, newest first', key: 'i' },
  { id: 'unread', label: 'Unread', icon: 'dot', hint: 'Not opened yet', key: 'u' },
  { id: 'codes', label: 'Codes', icon: 'key', hint: 'Sign-in and verification codes', key: 'c' },
  { id: 'files', label: 'Attachments', icon: 'clip', hint: 'Mail with files', key: 'a' },
  { id: 'trash', label: 'Trash', icon: 'trash', hint: 'Deleted mail, restorable', key: 't' },
];

export const PAGE_SIZE = 50;
export const MAIL_DOMAIN = 'klive.dev';

/** The list behind a view, one page of it. */
export function listPath(view: View, page: number, pageSize = PAGE_SIZE): string {
  const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (view.mailbox) q.set('mailbox', view.mailbox);
  if (view.folder === 'unread') q.set('unread', '1');
  else if (view.folder === 'codes') q.set('codes', '1');
  else if (view.folder === 'files') q.set('hasAttachment', '1');
  else if (view.folder === 'trash') q.set('trash', '1');
  return `/klivemail/messages?${q.toString()}`;
}

export function searchPath(query: string, mailbox: string | null, page: number): string {
  const q = new URLSearchParams({ q: query, page: String(page), pageSize: String(PAGE_SIZE) });
  if (mailbox) q.set('mailbox', mailbox);
  return `/klivemail/search?${q.toString()}`;
}

export const CODES_PATH = '/klivemail/messages?page=1&pageSize=8&codes=1';

// ───────────────────────────── reading the server ─────────────────────────────

const str = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0);
const optNum = (value: unknown): number | null => (value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null);
const pick = (o: any, ...keys: string[]): unknown => {
  for (const key of keys) if (o && o[key] !== undefined) return o[key];
  return undefined;
};

/** The server writes UTC stamps with a Z; one without is still UTC (KliveMail never writes local time). */
export function utcMs(value: unknown): number | null {
  if (value == null || value === '') return null;
  const text = str(value);
  return toMs(/[zZ]|[+-]\d{2}:\d{2}$/.test(text) ? text : `${text}Z`);
}

export function normalizeRow(raw: any): MailRow {
  const code = pick(raw, 'Code', 'code');
  return {
    id: str(pick(raw, 'Id', 'id')),
    to: str(pick(raw, 'ToAddress', 'toAddress')).toLowerCase(),
    from: str(pick(raw, 'FromAddress', 'fromAddress')),
    fromName: (pick(raw, 'FromName', 'fromName') as string | null) || null,
    subject: str(pick(raw, 'Subject', 'subject')),
    snippet: cleanSnippet(str(pick(raw, 'Snippet', 'snippet'))),
    receivedAt: utcMs(pick(raw, 'ReceivedUtc', 'receivedUtc')) ?? 0,
    threadId: str(pick(raw, 'ThreadId', 'threadId')),
    hasAttachments: pick(raw, 'HasAttachments', 'hasAttachments') === true,
    isRead: pick(raw, 'IsRead', 'isRead') === true,
    code: code === undefined ? undefined : (code as string | null) || null,
  };
}

export function normalizeDetail(raw: any): MailDetail {
  const row = normalizeRow(raw);
  const links = (pick(raw, 'Links', 'links') as any[] | undefined) ?? [];
  const attachments = (pick(raw, 'Attachments', 'attachments') as any[] | undefined) ?? [];
  const thread = (pick(raw, 'Thread', 'thread') as any[] | undefined) ?? [];
  return {
    ...row,
    code: row.code ?? null,
    dateAt: utcMs(pick(raw, 'DateUtc', 'dateUtc')),
    bodyText: (pick(raw, 'BodyText', 'bodyText') as string | null) ?? null,
    bodyHtml: (pick(raw, 'BodyHtml', 'bodyHtml') as string | null) ?? null,
    rawSize: optNum(pick(raw, 'RawSize', 'rawSize')),
    isDeleted: pick(raw, 'IsDeleted', 'isDeleted') === true,
    peekSupported: pick(raw, 'WasRead', 'wasRead') !== undefined,
    attachments: attachments.map(a => ({
      id: str(pick(a, 'Id', 'id')),
      fileName: str(pick(a, 'FileName', 'fileName')) || 'attachment',
      contentType: (pick(a, 'ContentType', 'contentType') as string | null) ?? null,
      sizeBytes: num(pick(a, 'SizeBytes', 'sizeBytes')),
      isInline: pick(a, 'IsInline', 'isInline') === true,
      contentId: (str(pick(a, 'ContentId', 'contentId')).replace(/^<|>$/g, '') || null),
    })),
    links: links.map(l => ({ url: str(pick(l, 'url', 'Url')), host: (pick(l, 'host', 'Host') as string | null) ?? hostOf(str(pick(l, 'url', 'Url'))) }))
      .filter(l => /^https?:\/\//i.test(l.url)),
    thread: thread.map(normalizeRow),
  };
}

function normalizeMailbox(raw: any, pinned: boolean): MailboxRow {
  return {
    address: str(pick(raw, 'Address', 'address')).toLowerCase(),
    displayName: (pick(raw, 'DisplayName', 'displayName') as string | null) || null,
    total: num(pick(raw, 'Total', 'total')),
    unread: num(pick(raw, 'Unread', 'unread')),
    pinned: (pick(raw, 'Pinned', 'pinned') as boolean | undefined) ?? pinned,
    lastAt: utcMs(pick(raw, 'LastReceivedUtc', 'lastReceivedUtc')),
  };
}

function normalizeHealth(raw: any): MailHealth | null {
  if (!raw || typeof raw !== 'object') return null;
  const smtp = raw.smtp ?? {};
  const store = raw.store ?? {};
  return {
    smtpState: smtp.state ?? null,
    smtpSince: utcMs(smtp.sinceUtc),
    tls: typeof smtp.tls === 'boolean' ? smtp.tls : null,
    restarts: num(smtp.restarts),
    lastError: smtp.lastError ?? null,
    sessions: optNum(smtp.sessions),
    sessionFaults: optNum(smtp.sessionFaults),
    lastSessionAt: utcMs(smtp.lastSessionUtc),
    stored: optNum(store.stored),
    lastStoredAt: utcMs(store.lastStoredUtc),
    storeErrors: num(store.errors),
    lastStoreError: store.lastError ?? null,
    startedAt: utcMs(raw.startedUtc),
  };
}

/** /klivemail/mailboxes. Old servers send only all / trash / mailboxes. */
export function normalizeSummary(raw: any): MailSummary {
  const daily = Array.isArray(raw?.daily) ? raw.daily : [];
  return {
    total: num(raw?.all?.total),
    unread: num(raw?.all?.unread),
    trash: num(raw?.trash),
    mailboxes: (Array.isArray(raw?.mailboxes) ? raw.mailboxes : []).map((m: any) => normalizeMailbox(m, true)),
    others: (Array.isArray(raw?.others) ? raw.others : []).map((m: any) => normalizeMailbox(m, false)),
    daily: daily.map((d: any) => ({ day: str(pick(d, 'D', 'd', 'day')), n: num(pick(d, 'N', 'n')) })),
    lastReceivedAt: utcMs(raw?.lastReceivedUtc),
    received24h: optNum(raw?.received24h),
    received7d: optNum(raw?.received7d),
    health: normalizeHealth(raw?.health),
    generatedAt: utcMs(raw?.generatedAtUtc),
  };
}

/** Accounts from /accounts/list, by the @klive.dev address they signed up with. */
export function accountsByAddress(raw: unknown): Map<string, MailAccount[]> {
  const map = new Map<string, MailAccount[]>();
  if (!Array.isArray(raw)) return map;
  for (const a of raw) {
    const email = str(a?.email).toLowerCase().trim();
    if (!email.endsWith(`@${MAIL_DOMAIN}`)) continue;
    const list = map.get(email) ?? [];
    list.push({ service: str(a?.serviceDisplay || a?.serviceKey) || 'account', username: a?.username ?? null, status: a?.status ?? null });
    map.set(email, list);
  }
  return map;
}

// ───────────────────────────── text ─────────────────────────────

const INVISIBLE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u2028-\u202F\u2060-\u206F\u3164\uFEFF\uFFA0]/g;

/** Old servers send the first 200 characters of the text part, newlines and preheader padding and all. */
export function cleanSnippet(text: string): string {
  return text.replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim();
}

export function localPart(address: string): string {
  const at = address.indexOf('@');
  return at > 0 ? address.slice(0, at) : address;
}

export function fullAddress(input: string): string {
  const value = input.trim().toLowerCase();
  if (!value) return '';
  return value.includes('@') ? value : `${value}@${MAIL_DOMAIN}`;
}

/** A local part the server will accept: letters, digits and . _ + - (the domain is always klive.dev). */
export function addressProblem(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (!value) return 'Type a name for the address';
  const [local, domain] = value.split('@');
  if (domain !== undefined && domain !== MAIL_DOMAIN) return `Addresses end in @${MAIL_DOMAIN}`;
  if (!/^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/.test(local)) return 'Letters, digits, and . _ + - inside';
  return null;
}

export function senderName(row: Pick<MailRow, 'fromName' | 'from'>): string {
  const name = (row.fromName ?? '').replace(/^["']|["']$/g, '').trim();
  return name || localPart(row.from) || row.from || 'Unknown sender';
}

export function hostOf(url: string): string | null {
  try { return new URL(url).host || null; } catch { return null; }
}

/** "483920" → "483 920", "83920145" → "8392 0145": easier to read off a screen into another. */
export function spacedCode(code: string): string {
  const digits = code.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits) || digits.length < 6) return digits;
  const half = Math.ceil(digits.length / 2);
  return `${digits.slice(0, half)} ${digits.slice(half)}`;
}

/** What goes on the clipboard: the digits alone, as every sign-in box wants them. */
export function codeForClipboard(code: string): string {
  return code.replace(/[\s-]/g, '');
}

// ───────────────────────────── time ─────────────────────────────

const DAY = 86_400_000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** List time: "14:05" today, "Mon" this week, "4 Nov" this year, "4 Nov 2025" before. */
export function listTime(ms: number, now: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  if (ms >= startOfDay(now)) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (ms >= startOfDay(now) - 6 * DAY) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fullTime(ms: number | null): string {
  if (!ms) return '';
  return new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** "4 minutes ago", "2 days ago" — compact for the rail and the health line. */
export function ago(ms: number | null, now: number): string {
  if (!ms) return 'never';
  const seconds = (now - ms) / 1000;
  if (seconds < 45) return 'just now';
  return `${fmtDuration(seconds)} ago`;
}

/** The heading a message sits under in the list. */
export function dayGroup(ms: number, now: number): string {
  const today = startOfDay(now);
  if (ms >= today) return 'Today';
  if (ms >= today - DAY) return 'Yesterday';
  if (ms >= today - 6 * DAY) return 'This week';
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('en-GB', sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' });
}

export interface ListItem { kind: 'group'; label: string; key: string }
export interface ListRowItem { kind: 'row'; row: MailRow; key: string; index: number }

/** Rows with a day heading in front of each new day group. Search results are not grouped. */
export function withGroups(rows: MailRow[], now: number, grouped = true): (ListItem | ListRowItem)[] {
  const out: (ListItem | ListRowItem)[] = [];
  let last = '';
  rows.forEach((row, index) => {
    if (grouped) {
      const label = dayGroup(row.receivedAt, now);
      if (label !== last) { out.push({ kind: 'group', label, key: `g:${label}:${index}` }); last = label; }
    }
    out.push({ kind: 'row', row, key: row.id, index });
  });
  return out;
}

// ───────────────────────────── the rail ─────────────────────────────

/** Pinned addresses with mail, most recent first; then unpinned ones with mail; then the quiet ones. */
export function railGroups(summary: MailSummary | null, filter: string): { active: MailboxRow[]; unpinned: MailboxRow[]; quiet: MailboxRow[] } {
  const q = filter.trim().toLowerCase();
  const match = (m: MailboxRow) => !q || m.address.includes(q) || (m.displayName ?? '').toLowerCase().includes(q);
  const byRecent = (a: MailboxRow, b: MailboxRow) => (b.lastAt ?? 0) - (a.lastAt ?? 0) || b.unread - a.unread || a.address.localeCompare(b.address);
  const pinned = (summary?.mailboxes ?? []).filter(match);
  return {
    active: pinned.filter(m => m.total > 0).sort(byRecent),
    unpinned: (summary?.others ?? []).filter(match).sort(byRecent),
    quiet: pinned.filter(m => m.total === 0).sort((a, b) => a.address.localeCompare(b.address)),
  };
}

/** Stable, muted colour for a sender's initial. */
const AVATAR_HUES = [208, 262, 152, 28, 340, 190, 98, 0, 232, 48, 300, 170];
export function avatarHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_HUES[Math.abs(h) % AVATAR_HUES.length];
}

export function initialOf(name: string): string {
  const letter = name.replace(/[^\p{L}\p{N}]/gu, '').charAt(0);
  return (letter || '?').toUpperCase();
}

// ───────────────────────────── health ─────────────────────────────

export type Tone = 'ok' | 'warn' | 'crit' | 'neutral';

export interface HealthVerdict { tone: Tone; word: string; detail: string }

/** One line for the rail: is mail arriving, and if it isn't, why. */
export function healthVerdict(summary: MailSummary | null, now: number, reachable: boolean): HealthVerdict {
  if (!reachable) return { tone: 'crit', word: 'No answer', detail: 'The server did not answer the last few reads.' };
  if (!summary) return { tone: 'neutral', word: 'Connecting', detail: 'Reading the mail summary…' };
  const last = summary.lastReceivedAt;
  const lastText = last ? `last mail ${ago(last, now)}` : 'no mail yet';
  const h = summary.health;
  if (!h) return { tone: 'neutral', word: 'Receiving', detail: `${lastText} · this server does not report SMTP health` };
  if (h.smtpState === 'failed' || h.smtpState === 'stopped')
    return { tone: 'crit', word: 'Not receiving', detail: `SMTP listener ${h.smtpState}${h.lastError ? `: ${h.lastError}` : ''} · retrying on its own` };
  if (h.smtpState === 'restarting')
    return { tone: 'warn', word: 'Restarting', detail: `SMTP listener restarting (${fmtInt(h.restarts)} so far)${h.lastError ? ` after: ${h.lastError}` : ''}` };
  if (h.smtpState === 'starting') return { tone: 'neutral', word: 'Starting', detail: `SMTP listener starting · ${lastText}` };
  if (h.storeErrors > 0 && h.lastStoreError)
    return { tone: 'warn', word: 'Store errors', detail: `${fmtInt(h.storeErrors)} message(s) could not be stored since the start: ${h.lastStoreError}` };
  return { tone: 'ok', word: 'Receiving', detail: `${lastText}${h.tls ? ' · STARTTLS on' : h.tls === false ? ' · no TLS certificate' : ''}` };
}

// ───────────────────────────── the reader ─────────────────────────────

export type PaperMode = 'light' | 'dark';

/** How many remote images a message would load (they can tell the sender it was opened). */
/** Max inline images fetched for one message, and the largest one fetched. */
export const INLINE_IMAGE_LIMIT = 20;
export const INLINE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

/** Images the HTML draws by Content-ID ("cid:…") that the server kept, within the limits above. */
export function inlineImagesToLoad(detail: Pick<MailDetail, 'bodyHtml' | 'attachments'>): MailAttachment[] {
  const html = detail.bodyHtml ?? '';
  if (!/cid:/i.test(html)) return [];
  const referenced = new Set([...html.matchAll(/cid:([^"'\s)>]+)/gi)].map(m => safeDecode(m[1]).toLowerCase()));
  return detail.attachments
    .filter(a => a.contentId && referenced.has(a.contentId.toLowerCase()) && a.sizeBytes <= INLINE_IMAGE_MAX_BYTES
      && (!a.contentType || a.contentType.toLowerCase().startsWith('image/')))
    .slice(0, INLINE_IMAGE_LIMIT);
}

/** Points every "cid:" reference that has a loaded image at its data: URL; the rest stay as they were. */
export function resolveInlineImages(html: string, images: Map<string, string>): string {
  if (!images.size) return html;
  return html.replace(/cid:([^"'\s)>]+)/gi, (whole, id: string) => images.get(safeDecode(id).toLowerCase()) ?? whole);
}

function safeDecode(text: string): string {
  try { return decodeURIComponent(text); } catch { return text; }
}

export function remoteImageCount(html: string | null): number {
  if (!html) return 0;
  const matches = html.match(/<img\b[^>]*\bsrc\s*=\s*["']?\s*(?:https?:)?\/\//gi);
  const backgrounds = html.match(/url\(\s*["']?\s*(?:https?:)?\/\//gi);
  return (matches?.length ?? 0) + (backgrounds?.length ?? 0);
}

/**
 * The document an email renders in. It goes into a sandboxed iframe (no scripts, no same-origin,
 * links open in a new tab without the page as opener), and its CSP blocks every remote load unless
 * Klives asks for images: remote images are how senders learn a mail was opened.
 */
export function emailDocument(html: string, opts: { images: boolean; mode: PaperMode }): string {
  const img = opts.images ? 'data: cid: https: http:' : 'data: cid:';
  const csp = `default-src 'none'; img-src ${img}; style-src 'unsafe-inline'; font-src data:${opts.images ? ' https:' : ''}; media-src 'none'; form-action 'none'`;
  const dark = opts.mode === 'dark';
  const base = dark
    ? 'html{background:#12161c;color:#dfe6ee;color-scheme:dark}a{color:#8ec5ff}'
    : 'html{background:#ffffff;color:#1d232b;color-scheme:light}a{color:#0b62d6}';
  return '<!doctype html><html><head><meta charset="utf-8">'
    + `<meta http-equiv="Content-Security-Policy" content="${csp}">`
    + '<base target="_blank"><meta name="referrer" content="no-referrer">'
    + `<style>${base}body{margin:0;padding:18px 20px;font:14px/1.5 'Segoe UI',system-ui,-apple-system,Roboto,Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}</style>`
    + `</head><body>${html}</body></html>`;
}

/** Text mail, linkified safely: escaped first, then only http(s) URLs become anchors. */
export function textToHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const linked = escaped.replace(/\bhttps?:\/\/[^\s<>"']+/g, url => {
    const clean = url.replace(/[.,;:!?)]+$/, '');
    const rest = url.slice(clean.length);
    return `<a href="${clean}" rel="noopener noreferrer">${clean}</a>${rest}`;
  });
  return `<pre style="font:inherit;margin:0">${linked}</pre>`;
}

// ───────────────────────────── the palette ─────────────────────────────

export interface MailCommand {
  id: string;
  title: string;
  hint?: string;
  group: 'Search' | 'Go to' | 'Addresses' | 'Actions';
  keywords?: string;
  icon: string;
  shortcut?: string;
  run: () => unknown;
}

/** Word-prefix scoring: "insta" finds "instagram@klive.dev", "ur" finds "Unread". */
export function scoreCommand(query: string, command: Pick<MailCommand, 'title' | 'keywords' | 'group'>): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return command.group === 'Addresses' ? 0.5 : 1;
  const title = command.title.toLowerCase();
  const keywords = (command.keywords ?? '').toLowerCase();
  let score = 0;
  for (const word of words) {
    const at = title.indexOf(word);
    const inTitle = at < 0 ? 0 : at === 0 ? 30 : /[\s@._+-]/.test(title[at - 1]) ? 20 : 10;
    const inKeywords = keywords.includes(word) ? 6 : 0;
    if (!inTitle && !inKeywords) return 0;
    score += Math.max(inTitle, inKeywords);
  }
  return score - title.length * 0.05;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${fmtInt(n)} ${n === 1 ? one : many}`;
}
