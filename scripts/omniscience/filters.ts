import { omniInstantParts, omniZonedToMs } from '~/scripts/omniscience/format';

/**
 * The filters every Omniscience search shares, as data: what a page can be narrowed by, how each
 * choice is written into the link, and how it is asked of the server. The filter bar draws
 * itself from these definitions, so every search is filtered the same way.
 *
 * In the link a filter is one short text under its key:
 *   a pick ("who", "which server")   `id,id`        or `!id,id` for "none of these"
 *   dates                            `7d`, `year`…  or `2026-01-05..2026-02-01` (either end may be empty)
 *   a number range                   `100..`        (either end may be empty)
 *   a yes/no                         `yes` or `no`
 * A plain id is therefore a valid pick, so an older link (`?person=…`) still opens filtered.
 */

/** What a pick offers: people, servers and conversations come from the server; `options` are listed by the page; `custom` loads its own. */
export type OmniPickKind = 'person' | 'guild' | 'conversation' | 'platform' | 'site' | 'options' | 'custom';
export type OmniFilterKind = OmniPickKind | 'dates' | 'number' | 'flag';

export interface OmniOption {
    id: string;
    label: string;
    /** A second line: where it is, how busy it is. */
    detail?: string | null;
    count?: number | null;
}

/** What narrows a pick's own options: a conversation picker lists the channels of the servers already chosen. */
export interface OmniPickScope {
    guilds?: readonly string[];
    platforms?: readonly string[];
    places?: readonly string[];
}

export interface OmniFilterDef {
    /** The key in the page's link state. */
    key: string;
    kind: OmniFilterKind;
    /** What the filter is called: "Posted by", "Server". */
    label: string;
    /** What it says when nothing is chosen: "anyone", "any server". */
    any?: string;
    /** `options`: what can be chosen. */
    options?: readonly OmniOption[];
    /** `custom`: where the options come from. */
    load?: (query: string, signal: AbortSignal) => Promise<OmniOption[]>;
    /** One value only (the server takes a single one). */
    single?: boolean;
    /** Offers "is not": leave these out instead of keeping them. */
    negatable?: boolean;
    /** Always on the bar. The rest wait under "More filters" until they are set. */
    primary?: boolean;
    /** The request parameter for what is kept (and the one for what is left out). Defaults follow the kind. */
    param?: string;
    notParam?: string;
    /** `dates` and `number`: the two request parameters (defaults `from`/`to` and `min`/`max`). */
    fromParam?: string;
    toParam?: string;
    /** `number`: what is counted ("messages"). */
    unit?: string;
    /** `flag`: what "yes" and "no" mean in words ("Only deleted", "Hide deleted"). */
    yes?: string;
    no?: string;
    /** One line under the picker saying what the filter does, when that is not obvious. */
    help?: string;
}

// ── picks ────────────────────────────────────────────────────────────────────

export interface OmniPickValue { not: boolean; ids: string[] }

export function omniParsePick(text: string | null | undefined): OmniPickValue {
    const raw = (text ?? '').trim();
    const not = raw.startsWith('!');
    const ids = [...new Set((not ? raw.slice(1) : raw).split(',').map(s => s.trim()).filter(Boolean))];
    return { not: not && ids.length > 0, ids };
}

export function omniFormatPick(value: OmniPickValue): string {
    return value.ids.length ? `${value.not ? '!' : ''}${value.ids.join(',')}` : '';
}

// ── dates ────────────────────────────────────────────────────────────────────

export interface OmniDatePreset { value: string; label: string }

/** Ranges that move with today. They stay in the link as their name, so a saved link keeps meaning "the last week". */
export const OMNI_DATE_PRESETS: readonly OmniDatePreset[] = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
    { value: '365d', label: 'Last 12 months' },
    { value: 'year', label: 'This year' },
    { value: 'lastyear', label: 'Last year' },
];

const DAY_MS = 86_400_000;

/** The two days of a typed range (`from..to`, either may be empty); null when the text is a preset or nothing. */
export function omniParseDays(text: string | null | undefined): { from: string; to: string } | null {
    const m = /^(\d{4}-\d{2}-\d{2})?\.\.(\d{4}-\d{2}-\d{2})?$/.exec((text ?? '').trim());
    return m && (m[1] || m[2]) ? { from: m[1] ?? '', to: m[2] ?? '' } : null;
}

/**
 * The window a dates filter asks for, as instants: `from` inclusive, `to` exclusive. Days are days on
 * the reader's clock (`zone`), so "today" starts at their midnight. Null when nothing is chosen.
 */
export function omniDateWindow(text: string | null | undefined, zone: string, now = Date.now()): { from: number | null; to: number | null } | null {
    const value = (text ?? '').trim();
    if (!value) return null;
    const startOf = (day: string) => omniZonedToMs(`${day}T00:00`, zone);
    const today = omniInstantParts(now, zone).date;
    const todayStart = startOf(today) ?? now;
    const days = /^(\d{1,4})d$/.exec(value);
    if (value === 'today') return { from: todayStart, to: null };
    if (days) {
        // "Last 7 days" is today and the six days before it. Noon of the first day names that day whatever the clocks did in between.
        const first = omniInstantParts(todayStart + DAY_MS / 2 - (Number(days[1]) - 1) * DAY_MS, zone).date;
        return { from: startOf(first), to: null };
    }
    const year = Number(today.slice(0, 4));
    if (value === 'year') return { from: startOf(`${year}-01-01`), to: null };
    if (value === 'lastyear') return { from: startOf(`${year - 1}-01-01`), to: startOf(`${year}-01-01`) };
    const typed = omniParseDays(value);
    if (!typed) return null;
    const from = typed.from ? startOf(typed.from) : null;
    // The last day is kept whole: the window closes when the day after it starts.
    const end = typed.to ? startOf(typed.to) : null;
    const to = end === null ? null : startOf(omniInstantParts(end + DAY_MS * 1.5, zone).date);
    return from === null && to === null ? null : { from, to };
}

export function omniDatesLabel(text: string | null | undefined): string {
    const value = (text ?? '').trim();
    const preset = OMNI_DATE_PRESETS.find(p => p.value === value);
    if (preset) return preset.label;
    const days = /^(\d{1,4})d$/.exec(value);
    if (days) return `Last ${days[1]} days`;
    const typed = omniParseDays(value);
    if (!typed) return '';
    if (typed.from && typed.to) return typed.from === typed.to ? typed.from : `${typed.from} to ${typed.to}`;
    return typed.from ? `since ${typed.from}` : `until ${typed.to}`;
}

// ── numbers ──────────────────────────────────────────────────────────────────

export function omniParseRange(text: string | null | undefined): { min: number | null; max: number | null } {
    const m = /^(-?\d+)?\.\.(-?\d+)?$/.exec((text ?? '').trim());
    return { min: m?.[1] ? Number(m[1]) : null, max: m?.[2] ? Number(m[2]) : null };
}

export function omniFormatRange(min: number | null, max: number | null): string {
    return min === null && max === null ? '' : `${min ?? ''}..${max ?? ''}`;
}

// ── asking the server ────────────────────────────────────────────────────────

const PARAMS: Partial<Record<OmniFilterKind, [string, string]>> = {
    person: ['persons', 'notPersons'], guild: ['guilds', 'notGuilds'], conversation: ['conversations', 'notConversations'], platform: ['platforms', 'notPlatforms'],
    site: ['sites', 'notSites'],
};

export type OmniFilterParams = Record<string, string | number | boolean | string[] | null>;

/** The request parameters of the filters as they stand. Called when a request is made, so a range like "last 7 days" is measured from then. */
export function omniFilterParams(defs: readonly OmniFilterDef[], values: Record<string, string>, zone: string, now = Date.now()): OmniFilterParams {
    const params: OmniFilterParams = {};
    for (const def of defs) {
        const text = values[def.key] ?? '';
        if (!text) continue;
        switch (def.kind) {
            case 'dates': {
                const window = omniDateWindow(text, zone, now);
                if (window?.from != null) params[def.fromParam ?? 'from'] = window.from;
                if (window?.to != null) params[def.toParam ?? 'to'] = window.to;
                break;
            }
            case 'number': {
                const { min, max } = omniParseRange(text);
                if (min !== null) params[def.fromParam ?? 'min'] = min;
                if (max !== null) params[def.toParam ?? 'max'] = max;
                break;
            }
            case 'flag':
                if (text === 'yes' || text === 'no') params[def.param ?? def.key] = text === 'yes';
                break;
            default: {
                const pick = omniParsePick(text);
                if (!pick.ids.length) break;
                const [keep, leave] = PARAMS[def.kind] ?? [def.key, `not${def.key[0]!.toUpperCase()}${def.key.slice(1)}`];
                const name = pick.not ? def.notParam ?? leave : def.param ?? keep;
                params[name] = def.single ? pick.ids[0]! : pick.ids;
            }
        }
    }
    return params;
}

/** An empty link-state entry for each filter: spread into `useOmniUrlState` beside the page's own keys. */
export function omniFilterDefaults(defs: readonly OmniFilterDef[]): Record<string, string> {
    return Object.fromEntries(defs.map(def => [def.key, '']));
}

/** How many of the filters are set. */
export function omniFilterCount(defs: readonly OmniFilterDef[], values: Record<string, string>): number {
    return defs.filter(def => !!values[def.key]).length;
}

/** Everything the filters are set to, as one text: the thing to watch to search again when any of them changes. */
export function omniFilterSignature(defs: readonly OmniFilterDef[], values: Record<string, string>): string {
    return defs.map(def => values[def.key] ?? '').join('\u0001');
}

// ── the filters most searches share ──────────────────────────────────────────

/** Where a conversation is: a server's channel, a group chat or a direct chat. */
export const OMNI_PLACES: readonly OmniOption[] = [
    { id: 'server', label: 'Servers', detail: 'Channels and threads of a server' },
    { id: 'group', label: 'Group chats' },
    { id: 'dm', label: 'Direct chats' },
];

/**
 * Who, on which platform, in which server and conversation, in what kind of place, and when: the filters a search over
 * messages (or over anything posted in one) takes. `who` words the person filter for the page ("Posted by", "Shared by").
 */
export function omniScopeFilters(who = 'Person', options: { places?: boolean; negatable?: boolean; dates?: boolean } = {}): OmniFilterDef[] {
    const negatable = options.negatable !== false;
    const defs: OmniFilterDef[] = [
        { key: 'person', kind: 'person', label: who, any: 'anyone', negatable, primary: true },
        { key: 'guild', kind: 'guild', label: 'Server', any: 'any', negatable, primary: true },
        { key: 'conversation', kind: 'conversation', label: 'Conversation', any: 'any', negatable, primary: true,
            help: 'Channels, threads, group chats and direct chats. With a server chosen, only its channels are listed.' },
    ];
    if (options.dates !== false) defs.push({ key: 'when', kind: 'dates', label: 'When', any: 'any time', primary: true });
    defs.push({ key: 'platform', kind: 'platform', label: 'Platform', any: 'any', negatable });
    if (options.places !== false) defs.push({ key: 'place', kind: 'options', label: 'Kind of place', any: 'anywhere', options: OMNI_PLACES, param: 'places' });
    return defs;
}
