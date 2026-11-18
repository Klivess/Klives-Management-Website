import { fmtCompact, fmtDuration, fmtInt, fmtRelative, toMs } from '~/scripts/adminConsole';

/*
 * The OmniSettings page's rules, kept apart from Vue so they read as rules: what a row from the server
 * becomes, how a name is said in words, which number is in which unit, what counts as a valid value,
 * what search matches, and what needs Klives. A secret's value never enters anything here.
 */

// ───────────────────────────── shapes ─────────────────────────────

export const TYPE = { String: 0, Bool: 1, Int: 2, Dropdown: 3, List: 4 } as const;
export type SettingType = (typeof TYPE)[keyof typeof TYPE];
export const TYPE_LABEL: Record<SettingType, string> = { 0: 'text', 1: 'switch', 2: 'number', 3: 'choice', 4: 'list' };

/**
 * A row from `/OmniGlobalSettings/Board`, or from `/OmniGlobalSettings/List` on a server from before the
 * board (only the first nine fields). Every board field is optional: site and server deploy separately.
 */
export interface RawSetting {
  Name: string;
  Type: number;
  Sensitive: boolean;
  HasValue?: boolean;
  ParentServiceId?: string | null;
  ParentServiceName?: string | null;
  Value?: string | null;
  DropdownOptions?: string[] | null;
  WasUsedThisSession?: boolean;
  ReadThisSession?: boolean;
  LastReadUtc?: string | null;
  UpdatedUtc?: string | null;
  UpdatedBy?: string | null;
  DefaultValue?: string | null;
  MatchesDefault?: boolean | null;
  Awaiting?: boolean | null;
  AwaitingSinceUtc?: string | null;
}

export interface BoardPayload {
  Version?: number;
  GeneratedUtc?: string | null;
  SessionStartedUtc?: string | null;
  ReadTrackingSinceUtc?: string | null;
  Settings: RawSetting[];
}

export type Unit = 'ms' | 's' | 'min' | 'h' | 'd' | 'KB' | 'MB' | 'GB' | '%' | 'tokens' | 'fps' | 'px' | 'calls' | 'frames';

/** One setting as the page holds it. For a secret, `value` is always '' and `options` always []. */
export interface Setting {
  /** Owner id and name: what the server keys a setting by. */
  key: string;
  name: string;
  label: string;
  type: SettingType;
  sensitive: boolean;
  hasValue: boolean;
  ownerId: string;
  /** Exactly as the server sent it, for writing back. */
  ownerName: string;
  /** For display. */
  owner: string;
  value: string;
  options: string[];
  readThisSession: boolean;
  lastReadAt: number | null;
  updatedAt: number | null;
  updatedBy: string | null;
  /** The code's default at its last read this session. Null when unknown, and always for a secret. */
  defaultValue: string | null;
  matchesDefault: boolean | null;
  awaiting: boolean;
  awaitingSince: number | null;
  unit: Unit | null;
}

/** What the page knows about the store as a whole. */
export interface BoardMeta {
  /** 'board' when the server has the board route; 'list' on an older server (no defaults, stamps or waits). */
  source: 'board' | 'list';
  generatedAt: number | null;
  sessionStartedAt: number | null;
  readTrackingSince: number | null;
}

export const settingKey = (ownerId: string | null | undefined, name: string) => `${ownerId || '0'}␟${name}`;

/** Owners that are not services: settings filed under them were created outside any service. */
const NON_SERVICE_OWNERS = new Set(['omni global settings manager', 'unknownservice', 'unknown service', 'api/global']);
export const isNonServiceOwner = (owner: string) => NON_SERVICE_OWNERS.has(owner.trim().toLowerCase());

export function toSetting(raw: RawSetting): Setting {
  const sensitive = raw.Sensitive === true;
  const type = ([0, 1, 2, 3, 4].includes(raw.Type) ? raw.Type : 0) as SettingType;
  const ownerName = raw.ParentServiceName ?? '';
  const owner = ownerName.trim() || 'Unknown service';
  return {
    key: settingKey(raw.ParentServiceId, raw.Name),
    name: raw.Name,
    label: humanizeName(raw.Name, owner),
    type,
    sensitive,
    hasValue: raw.HasValue ?? (!sensitive && !!raw.Value),
    ownerId: raw.ParentServiceId || '0',
    ownerName,
    owner,
    // Masked before it is stored anywhere, whatever the server sent.
    value: sensitive ? '' : String(raw.Value ?? ''),
    options: sensitive ? [] : (raw.DropdownOptions ?? []).map(String),
    readThisSession: raw.ReadThisSession ?? raw.WasUsedThisSession ?? false,
    lastReadAt: toMs(raw.LastReadUtc),
    updatedAt: toMs(raw.UpdatedUtc),
    updatedBy: raw.UpdatedBy || null,
    defaultValue: sensitive || raw.DefaultValue == null ? null : String(raw.DefaultValue),
    matchesDefault: sensitive || typeof raw.MatchesDefault !== 'boolean' ? null : raw.MatchesDefault,
    awaiting: raw.Awaiting === true,
    awaitingSince: toMs(raw.AwaitingSinceUtc),
    unit: type === TYPE.Int ? unitFor(raw.Name) : null,
  };
}

export function readBoard(body: unknown): { settings: Setting[]; meta: BoardMeta } | null {
  if (Array.isArray(body)) {
    return { settings: body.filter(isRaw).map(toSetting), meta: { source: 'list', generatedAt: Date.now(), sessionStartedAt: null, readTrackingSince: null } };
  }
  if (!body || typeof body !== 'object' || !Array.isArray((body as BoardPayload).Settings)) return null;
  const board = body as BoardPayload;
  return {
    settings: board.Settings.filter(isRaw).map(toSetting),
    meta: {
      source: 'board',
      generatedAt: toMs(board.GeneratedUtc) ?? Date.now(),
      sessionStartedAt: toMs(board.SessionStartedUtc),
      readTrackingSince: toMs(board.ReadTrackingSinceUtc),
    },
  };
}

function isRaw(value: unknown): value is RawSetting {
  return !!value && typeof value === 'object' && typeof (value as RawSetting).Name === 'string' && typeof (value as RawSetting).Type === 'number';
}

// ───────────────────────────── names ─────────────────────────────

/** Spellings to keep whole when a name is split into words. Keyed by the letters run together. */
const BRANDS = new Map(
  ['AIRouter', 'CoinGecko', 'OpenRouter', 'HuggingFace', 'Trading212', 'KliveAgent', 'KliveLLM', 'KliveChat', 'KliveAPI',
    'KliveBot', 'KliveMail', 'KliveTech', 'KliveGames', 'KliveRAG', 'OmniBlox', 'OmniGram', 'OmniTumblr', 'OmniTrader',
    'OmniDefence', 'Omniscience', 'CapSolver', 'GitHub', 'YouTube', 'TikTok', 'OAuth', 'CSFloat', 'AbuseIPDB', 'GreyNoise',
    'LLama', 'OpenAI', 'DeepSeek', 'MemeScraper', 'Lichess', 'Discord', 'Instagram', 'Tumblr', 'Roblox', 'Steam', 'Mouser', 'CS2',
    'DevEx', 'Arduino', 'Kraken', 'Hevy',
  ].map(brand => [brand.toLowerCase(), brand]),
);
BRANDS.set('chesscom', 'Chess.com');
const BRAND_SPELLINGS = new Set(BRANDS.values());

/** Initialisms said letter by letter, as they appear in capitals ("LLMModel"). */
const ACRONYMS = new Set(['API', 'URL', 'URLS', 'ID', 'IDS', 'LLM', 'GGUF', 'OCR', 'TTS', 'STT', 'FPS', 'SMTP', 'IMAP', 'IP', 'UI', 'CPU',
  'GPU', 'JSON', 'HTTP', 'HTTPS', 'TURN', 'IG', 'FRED', 'VNC', 'RAG', 'AI', 'KM', 'DPI', 'RAM', 'SSH', 'DNS', 'TLS', 'HTML', 'CSS', 'PNG', 'JPEG',
  'ROI', 'OS', 'DM', 'CLI', 'FQBN', 'RUM', 'GB', 'MB', 'KB']);
/** The same initialisms written as words ("ApiKey", "TurnUrls"); ordinary words like "turn" are left alone. */
const CAMEL_ACRONYMS = new Set(['api', 'url', 'urls', 'llm', 'gguf', 'ocr', 'tts', 'stt', 'fps', 'smtp', 'imap', 'json', 'http', 'https',
  'vnc', 'rag', 'cpu', 'gpu', 'ram', 'dpi', 'ssh', 'dns', 'tls', 'id', 'ids', 'ip', 'ui', 'ai', 'roi', 'os', 'dm', 'cli', 'fqbn', 'rum',
  'gb', 'mb', 'kb']);
const spellAcronym = (word: string) => {
  const upper = word.toUpperCase();
  return upper === 'URLS' ? 'URLs' : upper === 'IDS' ? 'IDs' : upper;
};

function splitWords(segment: string): string[] {
  return segment.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+[a-z]*/g) ?? [];
}

/** "LLMGGUF" → LLM, GGUF, when it is a run of known initialisms. */
function splitAcronymRun(word: string): string[] {
  if (word.length < 4 || ACRONYMS.has(word)) return [word];
  for (let cut = 2; cut <= word.length - 2; cut++) {
    const head = word.slice(0, cut);
    if (!ACRONYMS.has(head)) continue;
    const rest = splitAcronymRun(word.slice(cut));
    if (rest.every(part => ACRONYMS.has(part))) return [head, ...rest];
  }
  return [word];
}

/** Rejoins words that spell a brand: "Coin" "Gecko" → "CoinGecko". */
function joinBrands(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    let joined = false;
    for (let span = 3; span >= 2 && !joined; span--) {
      if (i + span > words.length) continue;
      const brand = BRANDS.get(words.slice(i, i + span).join('').toLowerCase());
      if (brand) { out.push(brand); i += span - 1; joined = true; }
    }
    if (!joined) out.push(words[i]);
  }
  return out;
}

const compact = (text: string) => text.replace(/[^a-z0-9]/gi, '').toLowerCase();

/**
 * "KliveAgent_MaxRunBillableTokens" under KliveAgent → "Max run billable tokens". The owner's (or another
 * module's) prefix is dropped when it is only a namespace; brands and initialisms keep their spelling.
 * The exact name is always shown beside it, so this only has to help the eye.
 */
export function humanizeName(name: string, owner = ''): string {
  let segments = name.split(/[_.\s-]+/).filter(Boolean);
  const ownerKey = compact(owner);
  if (segments.length > 1) {
    const head = compact(segments[0]);
    const rest = segments.slice(1).flatMap(splitWords);
    const isOwner = !!ownerKey && (head === ownerKey || head.startsWith(ownerKey) || ownerKey.startsWith(head));
    // A namespace prefix: PascalCase, followed by at least two words, or naming the owner.
    if ((isOwner && rest.length > 0) || (/^[A-Z]/.test(segments[0]) && rest.length >= 2)) segments = segments.slice(1);
  } else if (ownerKey && segments.length === 1) {
    // Leading words that spell (the start of) the owner are its namespace:
    // "OmniscienceEventRetentionDays" under Omniscience → "Event retention days",
    // "CS2ArbitrageMinimumProfitPence" under CS2ArbitrageBot → "Minimum profit pence".
    const words = joinBrands(splitWords(segments[0]));
    let take = 0;
    for (let i = 1; i < words.length; i++) {
      const head = compact(words.slice(0, i).join(''));
      if (head.length >= 4 && ownerKey.startsWith(head)) take = i;
    }
    if (take > 0) segments = [words.slice(take).join('')];
  }

  const words = joinBrands(segments.flatMap(splitWords).flatMap(splitAcronymRun));
  if (!words.length) return name;
  return words.map((word, index) => {
    const lower = word.toLowerCase();
    if (BRAND_SPELLINGS.has(word)) return word;
    if (ACRONYMS.has(word) || CAMEL_ACRONYMS.has(lower)) return spellAcronym(word);
    if (/\d/.test(word)) return word;
    return index === 0 ? word[0].toUpperCase() + word.slice(1).toLowerCase() : lower;
  }).join(' ');
}

// ───────────────────────────── units ─────────────────────────────

const UNIT_RULES: [RegExp, Unit][] = [
  [/(Ms|Millis|Milliseconds)$/, 'ms'],
  [/(Seconds|Secs|Sec)$/i, 's'],
  [/(Minutes|Mins)$/i, 'min'],
  [/(Hours|Hrs)$/i, 'h'],
  [/Days$/i, 'd'],
  [/(Kb|KB)$/, 'KB'],
  [/(Mb|MB|Megabytes)$/, 'MB'],
  [/(Gb|GB|Gigabytes)$/, 'GB'],
  [/(Percent|Pct)$/i, '%'],
  [/Tokens$/i, 'tokens'],
  [/Fps$/i, 'fps'],
  [/(Width|Height|Px)$/, 'px'],
  [/Calls$/i, 'calls'],
  [/Frames$/i, 'frames'],
];

/** The unit a whole-number setting's name ends in, if any: "…TimeoutSeconds" is seconds. */
export function unitFor(name: string): Unit | null {
  const last = name.split(/[_.]/).pop() ?? name;
  for (const [pattern, unit] of UNIT_RULES) if (pattern.test(last)) return unit;
  return null;
}

/** What a number in that unit amounts to, when that says more than the number: 86400 s → "1d". */
export function unitHint(value: string, unit: Unit | null): string {
  const number = Number(value);
  if (!unit || !/^[+-]?\d+$/.test(value.trim()) || !Number.isFinite(number)) return '';
  const abs = Math.abs(number);
  switch (unit) {
    case 'ms': return abs >= 1000 ? fmtDuration(abs / 1000) : '';
    case 's': return abs >= 90 ? fmtDuration(abs) : '';
    case 'min': return abs >= 90 ? fmtDuration(abs * 60) : '';
    case 'h': return abs >= 48 ? fmtDuration(abs * 3600) : '';
    case 'd': return abs >= 60 ? (abs >= 730 ? `${(abs / 365).toFixed(1)} years` : `${(abs / 30.4).toFixed(1)} months`) : '';
    case 'KB': return abs >= 1024 ? `${(abs / 1024).toFixed(1)} MB` : '';
    case 'MB': return abs >= 1024 ? `${(abs / 1024).toFixed(1)} GB` : '';
    case 'tokens': return abs >= 10_000 ? fmtCompact(abs) : '';
    default: return '';
  }
}

// ───────────────────────────── values ─────────────────────────────

const INT_MIN = -2_147_483_648;
const INT_MAX = 2_147_483_647;
export const MAX_VALUE_LENGTH = 65_536;

export function parseList(value: string): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(entry => String(entry));
  } catch { /* an old plain value: one entry */ }
  return value.split('\n').map(line => line.trim()).filter(Boolean);
}

/** Trims entries and drops blank ones, as the server does. */
export const serializeList = (entries: string[]) => JSON.stringify(entries.map(entry => entry.trim()).filter(Boolean));

export const isOn = (value: string) => value.trim().toLowerCase() === 'true';

/** Equal as the setting's type reads them. Mirrors OmniGlobalSettingsManager.SameSettingValue. */
export function sameValue(type: SettingType, a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a ?? '';
  const right = b ?? '';
  switch (type) {
    case TYPE.Bool: return left.trim().toLowerCase() === right.trim().toLowerCase();
    case TYPE.Int:
      return /^\s*[+-]?\d+\s*$/.test(left) && /^\s*[+-]?\d+\s*$/.test(right) ? Number(left) === Number(right) : left.trim() === right.trim();
    case TYPE.Dropdown: return left.trim().toLowerCase() === right.trim().toLowerCase();
    case TYPE.List: return serializeList(parseList(left)) === serializeList(parseList(right));
    default: return left === right;
  }
}

/** Why a value would be refused for this setting, or null if it is fine. Same rules as the server. */
export function validateValue(setting: Pick<Setting, 'type' | 'options' | 'sensitive'>, value: string): string | null {
  if (value.length > MAX_VALUE_LENGTH) return `At most ${fmtInt(MAX_VALUE_LENGTH)} characters.`;
  switch (setting.type) {
    case TYPE.Bool:
      return /^(true|false)$/i.test(value.trim()) ? null : 'true or false.';
    case TYPE.Int: {
      if (!/^\s*[+-]?\d+\s*$/.test(value)) return 'A whole number.';
      const number = Number(value);
      return number < INT_MIN || number > INT_MAX ? `Between ${fmtInt(INT_MIN)} and ${fmtInt(INT_MAX)}.` : null;
    }
    case TYPE.Dropdown:
      if (setting.sensitive) return value.trim() ? null : 'One of the choices.';
      return setting.options.some(option => option.toLowerCase() === value.trim().toLowerCase()) ? null : `One of: ${setting.options.join(', ')}.`;
    case TYPE.List: {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) && parsed.every(entry => typeof entry === 'string') ? null : 'A JSON list of text entries.';
      } catch { return 'A JSON list of text entries.'; }
    }
    default:
      return null;
  }
}

/** A replacement secret in a typed setting still has to be a value of that type. */
export function secretPlaceholder(setting: Pick<Setting, 'type' | 'hasValue'>): string {
  const verb = setting.hasValue ? 'Replace' : 'Set';
  switch (setting.type) {
    case TYPE.Bool: return `${verb}: true or false`;
    case TYPE.Int: return `${verb}: whole number`;
    case TYPE.Dropdown: return `${verb}: one of the choices`;
    case TYPE.List: return `${verb}: JSON list of text`;
    default: return setting.hasValue ? 'Replace secret…' : 'Set secret…';
  }
}

/** A value said briefly, for a default, a history line or a search result. Never used for a secret. */
export function shortValue(type: SettingType, value: string | null, unit: Unit | null = null, max = 28): string {
  if (value == null) return '—';
  if (type === TYPE.Bool) return isOn(value) ? 'on' : 'off';
  if (type === TYPE.List) {
    const entries = parseList(value);
    return entries.length === 0 ? 'empty list' : entries.length === 1 ? `“${clip(entries[0], max)}”` : `${entries.length} entries`;
  }
  if (type === TYPE.Int) {
    const number = Number(value);
    const shown = /^\s*[+-]?\d+\s*$/.test(value) && Number.isFinite(number) ? fmtInt(number) : value;
    return unit ? `${shown} ${unit}` : shown;
  }
  if (!value) return 'empty';
  return type === TYPE.Dropdown ? value : `“${clip(value, max)}”`;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Long or multi-line text is edited in its own dialog instead of a one-line field. */
export const isLongText = (setting: Pick<Setting, 'type' | 'value' | 'sensitive'>) =>
  setting.type === TYPE.String && !setting.sensitive && (setting.value.length > 90 || setting.value.includes('\n'));

// ───────────────────────────── search ─────────────────────────────

export const queryWords = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

/** One typed word against one field: 0 if absent, more at the start of a word and for the more telling fields. */
function fieldScore(word: string, text: string, weight: number): number {
  const at = text.indexOf(word);
  if (at < 0) return 0;
  const wordStart = at === 0 || /[\s/·:._-]/.test(text[at - 1]);
  return weight + (wordStart ? 30 : 0) + (at === 0 ? 15 : 0) + word.length;
}

/**
 * How well a setting matches what was typed. Every word has to appear somewhere: the name, its words,
 * the service, the value (never a secret's), the unit or the kind ("switch", "secret"). No letters-in-order
 * guessing: the count of what was found has to mean what it says. 0 = no match.
 */
export function searchScore(setting: Setting, query: string): number {
  const words = queryWords(query);
  if (!words.length) return 1;
  const name = setting.name.toLowerCase();
  const label = setting.label.toLowerCase();
  const owner = setting.owner.toLowerCase();
  const value = setting.sensitive ? '' : setting.value.toLowerCase();
  const kind = `${setting.unit ?? ''} ${TYPE_LABEL[setting.type]}${setting.sensitive ? ' secret' : ''}`.toLowerCase();
  let score = 0;
  for (const word of words) {
    const best = Math.max(fieldScore(word, name, 100), fieldScore(word, label, 90), fieldScore(word, owner, 50), fieldScore(word, value, 40), fieldScore(word, kind, 20));
    if (best <= 0) return 0;
    score += best;
  }
  return score - name.length * 0.05;
}

/** Splits text into pieces that match one of the words (for highlighting) and pieces that do not. */
export function highlightParts(text: string, words: string[]): { text: string; hit: boolean }[] {
  if (!words.length || !text) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const marks = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    let from = 0;
    while (word && from < lower.length) {
      const at = lower.indexOf(word, from);
      if (at < 0) break;
      for (let i = at; i < at + word.length; i++) marks[i] = true;
      from = at + word.length;
    }
  }
  const parts: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.hit === marks[i]) last.text += text[i];
    else parts.push({ text: text[i], hit: marks[i] });
  }
  return parts;
}

// ───────────────────────────── reading the store ─────────────────────────────

/** Unread for this long, once read times have been kept for as long, means nothing uses it. */
export const STALE_DAYS = 14;
const DAY_MS = 86_400_000;

/** Read times have been kept long enough for "not read" to mean something. */
export const trackingMature = (meta: BoardMeta, now: number) =>
  meta.readTrackingSince != null && now - meta.readTrackingSince >= STALE_DAYS * DAY_MS;

export function isStale(setting: Setting, meta: BoardMeta, now: number): boolean {
  if (setting.readThisSession) return false;
  if (!trackingMature(meta, now)) return false;
  return setting.lastReadAt == null || now - setting.lastReadAt >= STALE_DAYS * DAY_MS;
}

/** "read 2m ago" · "not read since the restart" · "unread 21d" · "never read". */
export function readLabel(setting: Setting, meta: BoardMeta, now: number): { text: string; tone: 'neutral' | 'warn' } {
  if (setting.readThisSession && setting.lastReadAt != null) return { text: `read ${fmtRelative(setting.lastReadAt, now)}`, tone: 'neutral' };
  if (setting.readThisSession) return { text: 'read since restart', tone: 'neutral' };
  if (setting.lastReadAt != null) {
    const age = now - setting.lastReadAt;
    return { text: `last read ${fmtRelative(setting.lastReadAt, now)}`, tone: trackingMature(meta, now) && age >= STALE_DAYS * DAY_MS ? 'warn' : 'neutral' };
  }
  if (trackingMature(meta, now)) return { text: `not read in ${STALE_DAYS}+ days`, tone: 'warn' };
  return { text: 'not read since restart', tone: 'neutral' };
}

export interface ServiceGroup {
  owner: string;
  settings: Setting[];
  read: number;
  custom: number;
  secrets: number;
  attention: number;
}

/** Settings grouped by owner, alphabetically, with anything that is not a service last. */
export function groupByOwner(settings: Setting[], attentionKeys: Set<string>): ServiceGroup[] {
  const groups = new Map<string, Setting[]>();
  for (const setting of settings) {
    const list = groups.get(setting.owner) ?? [];
    list.push(setting);
    groups.set(setting.owner, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => Number(isNonServiceOwner(a)) - Number(isNonServiceOwner(b)) || a.localeCompare(b, 'en', { sensitivity: 'base' }))
    .map(([owner, list]) => ({
      owner,
      settings: [...list].sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' })),
      read: list.filter(s => s.readThisSession).length,
      custom: list.filter(s => s.matchesDefault === false).length,
      secrets: list.filter(s => s.sensitive).length,
      attention: list.filter(s => attentionKeys.has(s.key)).length,
    }));
}

// ───────────────────────────── what needs Klives ─────────────────────────────

export type AttentionKind = 'awaiting' | 'empty-secret' | 'duplicate' | 'unowned' | 'stale';

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  tone: 'crit' | 'warn' | 'info';
  title: string;
  detail: string;
  /** The settings it is about. */
  keys: string[];
  /** For a duplicate: the copies nothing reads, which can go. */
  removable?: string[];
}

/**
 * The things on the page worth Klives's attention, worst first:
 * - a service blocked until a value is supplied (it waits up to a week);
 * - a secret a service read this session and found empty;
 * - one name stored twice, where only one copy is read (editing the other does nothing);
 * - settings created outside any service that nothing reads (an agent asking for a name that did not exist);
 * - once read times have been kept long enough, settings nothing has read for two weeks.
 */
export function computeAttention(settings: Setting[], meta: BoardMeta, now: number): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const s of settings.filter(x => x.awaiting).sort((a, b) => (a.awaitingSince ?? now) - (b.awaitingSince ?? now))) {
    items.push({
      id: `awaiting:${s.key}`, kind: 'awaiting', tone: 'crit', keys: [s.key],
      title: `${s.owner} is waiting for ${s.name}`,
      detail: `${s.awaitingSince != null ? `Waiting since ${fmtRelative(s.awaitingSince, now)}. ` : ''}It carries on as soon as a value is saved here.`,
    });
  }

  for (const s of settings.filter(x => x.sensitive && !x.hasValue && x.readThisSession && !x.awaiting)) {
    items.push({
      id: `empty:${s.key}`, kind: 'empty-secret', tone: 'warn', keys: [s.key],
      title: `${s.name} has no value`,
      detail: `${s.owner} read it this session and got nothing back.`,
    });
  }

  const byName = new Map<string, Setting[]>();
  for (const s of settings) {
    const list = byName.get(s.name.toLowerCase()) ?? [];
    list.push(s);
    byName.set(s.name.toLowerCase(), list);
  }
  for (const copies of byName.values()) {
    if (copies.length < 2) continue;
    const read = copies.filter(s => s.readThisSession);
    const unread = copies.filter(s => !s.readThisSession);
    const differ = copies.some(s => s.sensitive) || new Set(copies.map(s => s.value)).size > 1;
    const where = (s: Setting) => `${s.owner}${s.ownerId !== '0' ? ` (id ${s.ownerId})` : ''}`;
    items.push({
      id: `duplicate:${copies[0].name.toLowerCase()}`, kind: 'duplicate', tone: differ && read.length && unread.length ? 'warn' : 'info',
      keys: copies.map(s => s.key),
      title: `${copies[0].name} is stored ${copies.length} times`,
      detail: read.length === 1 && unread.length
        ? `Services read the copy under ${where(read[0])}.${differ ? ' The other copy holds a different value, and editing it changes nothing.' : ''}`
        : read.length > 1 ? `${read.length} copies are read this session, by different services.` : 'No copy has been read since the restart.',
      removable: read.length >= 1 ? unread.map(s => s.key) : undefined,
    });
  }

  const unowned = settings.filter(s => isNonServiceOwner(s.owner) && !s.readThisSession && s.lastReadAt == null && !s.awaiting);
  if (unowned.length) {
    items.push({
      id: 'unowned', kind: 'unowned', tone: 'info', keys: unowned.map(s => s.key),
      title: `${unowned.length} setting${unowned.length === 1 ? '' : 's'} no service owns or reads`,
      detail: `Filed under ${[...new Set(unowned.map(s => s.owner))].join(', ')}: made outside any service, most likely by an agent asking for a name that did not exist.`,
      removable: unowned.map(s => s.key),
    });
  }

  if (trackingMature(meta, now)) {
    const unownedKeys = new Set(unowned.map(s => s.key));
    const stale = settings.filter(s => !unownedKeys.has(s.key) && isStale(s, meta, now));
    if (stale.length) {
      items.push({
        id: 'stale', kind: 'stale', tone: 'info', keys: stale.map(s => s.key),
        title: `${stale.length} setting${stale.length === 1 ? '' : 's'} not read in ${STALE_DAYS} days`,
        detail: 'Nothing has asked for them in that time. Code that stopped using a setting leaves it here.',
      });
    }
  }

  const rank = { crit: 0, warn: 1, info: 2 };
  return items.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

// ───────────────────────────── views ─────────────────────────────

export type ViewId = 'all' | 'attention' | 'custom' | 'recent' | 'secrets' | 'unread';

export const RECENT_DAYS = 7;

export function inView(view: ViewId, setting: Setting, ctx: { attentionKeys: Set<string>; meta: BoardMeta; now: number }): boolean {
  switch (view) {
    case 'attention': return ctx.attentionKeys.has(setting.key);
    case 'custom': return setting.matchesDefault === false;
    case 'recent': return setting.updatedAt != null && ctx.now - setting.updatedAt <= RECENT_DAYS * DAY_MS;
    case 'secrets': return setting.sensitive;
    case 'unread': return trackingMature(ctx.meta, ctx.now) ? isStale(setting, ctx.meta, ctx.now) : !setting.readThisSession;
    default: return true;
  }
}

/** "4h ago by Klives" for a change stamp. */
export function changedLabel(setting: Setting, now: number): string {
  if (setting.updatedAt == null) return '';
  return `${fmtRelative(setting.updatedAt, now)}${setting.updatedBy ? ` by ${setting.updatedBy}` : ''}`;
}

/** A save the page can say something useful about from the status alone. Server bodies are never shown. */
export function saveFailure(status: number, type: SettingType): string {
  if (status === 400) return `The server refused this value for a ${TYPE_LABEL[type]} setting.`;
  if (status === 401) return 'Signed out: sign in again to save.';
  if (status === 403) return 'Your profile may not change settings.';
  if (status === 404) return 'This setting no longer exists. It may have been deleted elsewhere.';
  if (status === 504 || status === 0) return 'No answer from the server.';
  return `The server could not save it (HTTP ${status}).`;
}

export function loadFailure(status: number): string {
  if (status === 401) return 'Signed out. Sign in again to see settings.';
  if (status === 403) return 'Your profile may not read settings.';
  if (status === 504 || status === 0) return 'No answer from the server.';
  return `The server could not list its settings (HTTP ${status}).`;
}
