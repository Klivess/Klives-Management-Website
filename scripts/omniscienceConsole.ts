/**
 * Pure rules of the Omniscience console: how things are worded and counted, what "needs you",
 * markdown that is safe to put on the page, and how a command is matched. No state, no requests,
 * so every rule here can be read (and tested) on its own.
 *
 * Names carry an omx/OMX prefix on purpose: Nuxt auto-imports every composable's exports into
 * pages and components, and a short local name there has collided with one before.
 */

export type OmxView = 'brief' | 'people' | 'person' | 'ask' | 'review' | 'talk' | 'engine';
export type OmxTone = 'ok' | 'warn' | 'crit' | 'info' | '';

export const OMX_VIEWS: { id: OmxView; label: string; icon: string; hint: string }[] = [
    { id: 'brief', label: 'Brief', icon: 'brief', hint: 'What matters now' },
    { id: 'people', label: 'People', icon: 'people', hint: 'Everyone, fast' },
    { id: 'ask', label: 'Ask', icon: 'ask', hint: 'Search and question the messages' },
    { id: 'review', label: 'Review', icon: 'review', hint: 'Decisions waiting for you' },
    { id: 'talk', label: 'Conversations', icon: 'talk', hint: 'Read the messages themselves' },
    { id: 'engine', label: 'Engine', icon: 'engine', hint: 'Pipeline, sources and health' },
];

export const OMX_TIERS = ['tracked', 'watch', 'archive'] as const;
export const OMX_FACT_CATEGORIES = ['misc', 'location', 'education', 'employment', 'relationships', 'family', 'pets', 'health', 'preferences', 'beliefs', 'skills', 'plans', 'age', 'name'];
export const OMX_DOSSIER_TABS = ['summary', 'knowledge', 'circle', 'activity', 'messages', 'profile', 'notes', 'replica'] as const;
export type OmxDossierTab = typeof OMX_DOSSIER_TABS[number];
export const OMX_DOSSIER_TAB_LABELS: Record<OmxDossierTab, string> = {
    summary: 'Summary', knowledge: 'Knowledge', circle: 'Circle', activity: 'Activity', messages: 'Messages', profile: 'Profile', notes: 'Notes', replica: 'Replica',
};

export const OMX_DASH = '—';

// ── numbers and dates ────────────────────────────────────────────────────────

/** A count in full ("45,969"), or a dash when it is not known. Unknown is never shown as zero. */
export function omxNum(value: unknown): string {
    if (value === null || value === undefined || value === '') return OMX_DASH;
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat('en-GB').format(n) : OMX_DASH;
}

/** A count that fits a tile ("5.7M", "45.9K", "812"). */
export function omxCompact(value: unknown): string {
    if (value === null || value === undefined || value === '') return OMX_DASH;
    const n = Number(value);
    if (!Number.isFinite(n)) return OMX_DASH;
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
    if (abs >= 10_000) return `${(n / 1_000).toFixed(abs >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`;
    return new Intl.NumberFormat('en-GB').format(n);
}

export function omxPct(ratio: unknown, digits = 0): string {
    if (ratio === null || ratio === undefined || ratio === '') return OMX_DASH;
    const n = Number(ratio);
    return Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : OMX_DASH;
}

/** The server sends unix milliseconds in most places and ISO text in a few; both are accepted. */
export function omxMs(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
}

const OMX_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const OMX_DAYTIME = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function omxDate(value: unknown): string {
    const ms = omxMs(value);
    return ms === null ? OMX_DASH : OMX_DAY.format(ms);
}

export function omxDateTime(value: unknown): string {
    const ms = omxMs(value);
    return ms === null ? OMX_DASH : OMX_DAYTIME.format(ms);
}

/** "3 h ago" for the recent past, the date beyond a month. */
export function omxAgo(value: unknown, now: number): string {
    const ms = omxMs(value);
    if (ms === null) return OMX_DASH;
    const s = Math.round((now - ms) / 1000);
    if (s < 0) return omxDateTime(ms);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 30 * 86_400) return `${Math.floor(s / 86_400)} d ago`;
    return omxDate(ms);
}

/** A date typed into a date input, as the first or last millisecond of that UTC day. */
export function omxDayToMs(day: string, end = false): number | null {
    if (!day) return null;
    const ms = Date.parse(`${day}${end ? 'T23:59:59.999Z' : 'T00:00:00.000Z'}`);
    return Number.isFinite(ms) ? ms : null;
}

// ── people ───────────────────────────────────────────────────────────────────

export function omxInitials(name: unknown): string {
    const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    const letters = words.length === 1 ? words[0]!.slice(0, 2) : words[0]![0]! + words[words.length - 1]![0]!;
    return letters.toUpperCase();
}

/** The handle shown under a name: the first linked account, as "platform:name". */
export function omxHandle(person: any): string {
    const identity = person?.identities?.[0];
    if (identity) return `${identity.platform}:${identity.username || identity.platform_username || identity.display_name || '?'}`;
    const first = String(person?.handles ?? '').split('|').find(Boolean);
    return first || 'no linked account';
}

export function omxTier(value: unknown): 'tracked' | 'watch' | 'archive' {
    return value === 'tracked' || value === 'watch' ? value : 'archive';
}

export const OMX_TIER_HELP: Record<string, string> = {
    tracked: 'Tracked: read continuously, profiled, and kept in the briefing.',
    watch: 'Watch: kept an eye on, not profiled.',
    archive: 'Archive: stored and searchable, nothing more.',
};

export function omxPersonUrl(id: string, tab?: string): string {
    return `/omniscience?view=person&id=${encodeURIComponent(id)}${tab ? `&tab=${encodeURIComponent(tab)}` : ''}`;
}

// ── facts ────────────────────────────────────────────────────────────────────

export function omxFactOff(status: unknown): boolean {
    return status !== 'active' && status !== undefined && status !== null && status !== '';
}

/** A derivation is stored as JSON with the reasoning inside; older rows hold plain text. */
export function omxDerivation(raw: unknown): string {
    if (!raw) return '';
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return String(parsed?.reasoning ?? (typeof raw === 'string' ? raw : ''));
    } catch { return String(raw); }
}

export function omxEntityIcon(kind: unknown): string {
    switch (kind) {
        case 'person': return 'person';
        case 'place': return 'place';
        case 'org': case 'school': return 'org';
        default: return 'dot';
    }
}

// ── notifications ────────────────────────────────────────────────────────────

export function omxNotifTitle(item: any): string {
    const kind = String(item?.kind ?? '');
    if (kind === 'replica_failed') return 'Replica training failed';
    if (kind === 'replica_ready') return 'Replica is ready';
    const words = kind.replace(/_/g, ' ').trim();
    return words ? words[0]!.toUpperCase() + words.slice(1) : 'Notification';
}

export function omxNotifDetail(item: any): string {
    return item?.payload?.display_name || item?.payload?.error || (item?.person_id ? `Person ${item.person_id}` : 'From the engine');
}

export function omxNotifBad(item: any): boolean {
    return String(item?.kind ?? '').includes('failed');
}

// ── what needs you ───────────────────────────────────────────────────────────

export interface OmxNeed {
    id: string;
    tone: 'crit' | 'warn' | 'info';
    title: string;
    detail: string;
    view: OmxView;
    count?: number;
}

export interface OmxNeedsInput {
    suggestions: any[];
    links: any[];
    merges: any[];
    notifications: any[];
    sources: any[] | null;
    activity: any;
    deduction: any;
    schedule: any;
    healthWarnings: string[];
    briefing: 'ok' | 'warming' | 'error' | 'idle';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Everything that is waiting on Klives or wrong with the engine, worst first. The Brief shows this
 * list instead of leaving him to visit each page to find out.
 */
export function omxNeeds(input: OmxNeedsInput): OmxNeed[] {
    const needs: OmxNeed[] = [];
    const down = (input.sources ?? []).filter(s => s && s.status !== 'active');
    if (down.length) {
        needs.push({
            id: 'sources', tone: 'crit', view: 'engine', count: down.length,
            title: `${plural(down.length, 'source')} not collecting`,
            detail: down.slice(0, 3).map(s => `${s.self_username || s.label || s.platform}: ${s.last_status_message || s.status}`).join(' · '),
        });
    }
    if (input.activity?.last_error) {
        needs.push({ id: 'activity-error', tone: 'warn', view: 'engine', title: 'Activity counts reported an error', detail: 'People are listed, but message counts may be incomplete.' });
    } else if (input.activity && input.activity.ready === false && !input.activity.running) {
        needs.push({ id: 'activity-stale', tone: 'warn', view: 'engine', title: 'Activity counts are not ready', detail: 'Message counts in the directory may be incomplete.' });
    }
    const failedRun = String(input.schedule?.last_run_status ?? '').toLowerCase();
    if (failedRun.includes('fail') || failedRun.includes('error')) {
        needs.push({ id: 'profiler', tone: 'warn', view: 'engine', title: 'The last profiler run did not finish cleanly', detail: String(input.schedule.last_run_status) });
    }
    const failed = input.notifications.filter(omxNotifBad);
    if (failed.length) {
        needs.push({ id: 'failed', tone: 'warn', view: 'engine', count: failed.length, title: `${plural(failed.length, 'job')} failed`, detail: failed.slice(0, 3).map(n => `${omxNotifTitle(n)}: ${omxNotifDetail(n)}`).join(' · ') });
    }
    for (const [i, warning] of input.healthWarnings.slice(0, 3).entries()) {
        needs.push({ id: `health-${i}`, tone: 'warn', view: 'engine', title: 'Data health', detail: warning });
    }
    if (input.briefing === 'error') {
        needs.push({ id: 'briefing', tone: 'warn', view: 'engine', title: 'The briefing could not be read', detail: 'The preview route answered with an error.' });
    }
    if (input.links.length) {
        needs.push({ id: 'links', tone: 'info', view: 'review', count: input.links.length, title: `${plural(input.links.length, 'possible same-person link')}`, detail: 'Two accounts that may be one person. A yes merges what is known about them.' });
    }
    if (input.suggestions.length) {
        needs.push({ id: 'suggestions', tone: 'info', view: 'review', count: input.suggestions.length, title: `${plural(input.suggestions.length, 'person', 'people')} suggested to track`, detail: input.suggestions.slice(0, 3).map(s => s.display_name || s.person_id).join(', ') });
    }
    if (input.merges.length) {
        needs.push({ id: 'merges', tone: 'info', view: 'review', count: input.merges.length, title: `${plural(input.merges.length, 'entity merge')} to decide`, detail: 'Two names in someone\'s world that may be the same thing.' });
    }
    const pending = Number(input.deduction?.windows_pending_graph ?? 0);
    if (pending >= 200) {
        needs.push({ id: 'graph', tone: 'info', view: 'engine', count: pending, title: `${omxNum(pending)} message windows wait for the graph pass`, detail: 'Facts were extracted from them; relationships and entities follow on the next deduction run.' });
    }
    if (input.activity?.running) {
        needs.push({ id: 'activity-running', tone: 'info', view: 'engine', title: 'Activity counts are being rebuilt', detail: 'The directory stays usable; counts catch up in the background.' });
    }
    const order = { crit: 0, warn: 1, info: 2 } as const;
    return needs.sort((a, b) => order[a.tone] - order[b.tone]);
}

// ── markdown ─────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inlineMarkdown(escaped: string): string {
    return escaped
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

/**
 * The briefing and the dossiers are written by a model as markdown. This turns the small part of
 * markdown they use into HTML. Everything is escaped first and only fixed tags are added after,
 * so text from messages can never become markup.
 */
export function omxMarkdown(source: unknown): string {
    const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
    const out: string[] = [];
    let list: 'ul' | 'ol' | null = null;
    let para: string[] = [];
    let fence: string[] | null = null;
    const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
    const closePara = () => { if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; } };

    for (const raw of lines) {
        if (fence) {
            if (raw.trim().startsWith('```')) { out.push(`<pre><code>${fence.join('\n')}</code></pre>`); fence = null; }
            else fence.push(escapeHtml(raw));
            continue;
        }
        const line = raw.trimEnd();
        if (line.trim().startsWith('```')) { closePara(); closeList(); fence = []; continue; }
        if (!line.trim()) { closePara(); closeList(); continue; }
        const heading = /^(#{1,4})\s+(.*)$/.exec(line);
        if (heading) { closePara(); closeList(); const level = heading[1]!.length; out.push(`<h${level}>${inlineMarkdown(escapeHtml(heading[2]!))}</h${level}>`); continue; }
        if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { closePara(); closeList(); out.push('<hr>'); continue; }
        const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
        const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
        if (bullet || numbered) {
            closePara();
            const kind = bullet ? 'ul' : 'ol';
            if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
            out.push(`<li>${inlineMarkdown(escapeHtml((bullet ?? numbered)![1]!))}</li>`);
            continue;
        }
        const quote = /^\s*>\s?(.*)$/.exec(line);
        if (quote) { closePara(); closeList(); out.push(`<blockquote>${inlineMarkdown(escapeHtml(quote[1]!))}</blockquote>`); continue; }
        closeList();
        para.push(inlineMarkdown(escapeHtml(line.trim())));
    }
    if (fence) out.push(`<pre><code>${fence.join('\n')}</code></pre>`);
    closePara();
    closeList();
    return out.join('');
}

// ── commands ─────────────────────────────────────────────────────────────────

/** How well `text` answers `query`: a prefix beats a word start, which beats letters in order. 0 = no match. */
export function omxScore(query: string, text: string): number {
    const q = query.trim().toLowerCase();
    const t = text.toLowerCase();
    if (!q) return 1;
    if (t.startsWith(q)) return 100 - Math.min(40, t.length - q.length);
    const at = t.indexOf(q);
    if (at >= 0) return (t[at - 1] === ' ' ? 70 : 50) - Math.min(30, at);
    let i = 0;
    for (const ch of t) { if (ch === q[i]) i++; if (i === q.length) return 10; }
    return 0;
}

// ── graph layout ─────────────────────────────────────────────────────────────

export interface OmxPlacedNode { id: string; label: string; x: number; y: number; root: boolean; sub: string }

/**
 * Places a person's graph on a 100 × 100 field: the subject in the middle, direct links on an inner
 * ring, everyone else on an outer one. Positions depend only on the order the server sends, so the
 * picture does not jump between loads.
 */
export function omxPlaceGraph(nodes: any[], edges: any[], rootId: string): { nodes: OmxPlacedNode[]; edges: { x1: number; y1: number; x2: number; y2: number; weight: number; key: string }[] } {
    const direct = new Set<string>();
    for (const edge of edges) {
        if (edge.source === rootId) direct.add(String(edge.target));
        if (edge.target === rootId) direct.add(String(edge.source));
    }
    const inner = nodes.filter(n => n.id !== rootId && direct.has(String(n.id)));
    const outer = nodes.filter(n => n.id !== rootId && !direct.has(String(n.id)));
    const placed = new Map<string, OmxPlacedNode>();
    const ring = (items: any[], rx: number, ry: number, phase: number) => items.forEach((node, i) => {
        const angle = (i / Math.max(1, items.length)) * Math.PI * 2 - Math.PI / 2 + phase;
        placed.set(String(node.id), { id: String(node.id), label: String(node.label ?? node.id), x: 50 + Math.cos(angle) * rx, y: 50 + Math.sin(angle) * ry, root: false, sub: omxCompact(node.message_count) });
    });
    ring(inner, outer.length ? 24 : 36, outer.length ? 26 : 38, 0);
    ring(outer, 42, 43, Math.PI / Math.max(3, outer.length));
    const root = nodes.find(n => n.id === rootId);
    placed.set(rootId, { id: rootId, label: String(root?.label ?? 'Subject'), x: 50, y: 50, root: true, sub: 'subject' });
    const lines = edges.flatMap((edge, i) => {
        const a = placed.get(String(edge.source)), b = placed.get(String(edge.target));
        return a && b ? [{ x1: a.x, y1: a.y, x2: b.x, y2: b.y, weight: Number(edge.confidence ?? 0.3), key: `${edge.source}-${edge.target}-${i}` }] : [];
    });
    return { nodes: [...placed.values()], edges: lines };
}

// ── small helpers ────────────────────────────────────────────────────────────

/** Where a message was said, in a few words. */
export function omxWhere(message: any): string {
    if (message?.conversation_kind === 'dm' || message?.context_kind === 'dm' || message?.kind === 'dm') return message?.conversation_title || message?.title || 'Direct message';
    const guild = message?.guild_name;
    const channel = message?.channel_title || message?.conversation_title || message?.title;
    if (guild && channel) return `${guild} · #${channel}`;
    return guild || channel || message?.conversation_id || 'unknown place';
}

export function omxErrorText(error: unknown, fallback = 'Something went wrong.'): string {
    return error instanceof Error && error.message ? error.message : fallback;
}
