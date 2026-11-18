/*
 * OmniBlox console: the rules behind the pages, kept apart from Vue so they can be read and tested on
 * their own. What the studio is doing in one sentence, what waits for the owner (in order of what
 * blocks most), where each game is on the line, and the words and tones used for all of it.
 *
 * Nothing here fetches. Every field from the server is treated as optional where it was added later,
 * because the site and the server deploy separately.
 */
import type {
    BloxAttention, BloxGameSummary, BloxOverview, BloxRobloxView, BloxStage, BloxTask, BloxTaskKind,
} from '~/composables/useOmniBlox';

export type ObxTone = 'ok' | 'warn' | 'crit' | 'info' | 'violet' | 'neutral' | 'brick';

/** The production line in order; Sunset and Abandoned are exits, not steps. */
export const OBX_LINE: BloxStage[] = ['Research', 'Build', 'Test', 'Launch', 'Live'];
export const OBX_RETIRED: BloxStage[] = ['Sunset', 'Abandoned'];

const DAY = 86_400_000;
const HOUR = 3_600_000;

export const obxPlural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function obxInitials(title: string): string {
    const words = title.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?';
}

/** "3 min", "5 h", "12 d" from a duration in ms. */
export function obxSpan(ms: number): string {
    const abs = Math.abs(ms);
    if (abs < 60_000) return `${Math.max(1, Math.round(abs / 1000))} s`;
    if (abs < HOUR) return `${Math.round(abs / 60_000)} min`;
    if (abs < 48 * HOUR) return `${Math.round(abs / HOUR)} h`;
    return `${Math.round(abs / DAY)} d`;
}

export function obxAgo(iso: string | null | undefined, now: number): string {
    if (!iso) return '—';
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '—';
    const diff = t - now;
    if (Math.abs(diff) < 45_000) return diff > 0 ? 'in a moment' : 'just now';
    return diff > 0 ? `in ${obxSpan(diff)}` : `${obxSpan(diff)} ago`;
}

/** How long something has waited for the owner: worth a colour after two days, red after a week. */
export function obxWaitTone(iso: string | null | undefined, now: number): ObxTone | undefined {
    if (!iso) return undefined;
    const age = now - Date.parse(iso);
    return age > 7 * DAY ? 'crit' : age > 2 * DAY ? 'warn' : undefined;
}

export function obxDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export function obxDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function obxClock(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** 1234 → "1,234"; 12_345 → "12.3k". */
export function obxCount(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '—';
    if (Math.abs(value) < 10_000) return Math.round(value).toLocaleString();
    return new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 }).format(value).replace('K', 'k');
}

export function obxRobux(value: number | null | undefined): string {
    return value == null || !Number.isFinite(value) ? '—' : `R$ ${obxCount(value)}`;
}

export function obxPct(value: number | null | undefined, digits = 0): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return `${((value <= 1 ? value * 100 : value)).toFixed(digits)}%`;
}

export function obxStageWord(stage: BloxStage): string {
    return stage === 'Abandoned' ? 'Abandoned' : stage === 'Sunset' ? 'Retired' : stage;
}

// ───────────────────────────── a game ─────────────────────────────

export const obxActive = (g: Pick<BloxGameSummary, 'Stage'>) => !['Live', 'Sunset', 'Abandoned'].includes(g.Stage);
export const obxRetired = (g: Pick<BloxGameSummary, 'Stage'>) => g.Stage === 'Sunset' || g.Stage === 'Abandoned';

/** Public, but Roblox lets nobody in (an unrated experience, a private one…). */
export const obxUnplayable = (g: Pick<BloxGameSummary, 'IsPublic' | 'Reach'>) => g.IsPublic && g.Reach?.Playable === false;

/** The furthest stage a game worked on (where an abandoned one stopped). */
export function obxReached(cycles: Partial<Record<BloxStage, number>> | null | undefined): BloxStage | null {
    const c = cycles ?? {};
    return [...OBX_LINE].reverse().find(s => (c[s] ?? 0) > 0) ?? null;
}

/** A game's state in one tone: what to look at first, not which stage it is in. */
export function obxGameTone(g: BloxGameSummary): ObxTone {
    if (g.Stage === 'Abandoned') return 'neutral';
    if (g.Stage === 'Sunset') return 'neutral';
    if (obxUnplayable(g) || g.UrgentMaintenance) return 'crit';
    if ((g.Watchdog?.Level ?? 0) >= 3) return 'crit';
    if (g.Live?.Running) return 'info';
    if (g.WaitingReason || (g.Watchdog?.Level ?? 0) >= 1) return 'warn';
    if (g.Paused) return 'neutral';
    if (g.Stage === 'Build' && g.BuildRevision > 0 && !g.LastBuildOk) return 'warn';
    return 'ok';
}

/** One line on what a game is doing or waiting for. */
export function obxGameLine(g: BloxGameSummary): { text: string; tone?: ObxTone } {
    if (g.Stage === 'Abandoned') return { text: g.AbandonReason ?? 'Abandoned' };
    if (g.Stage === 'Sunset') return { text: g.SunsetReason ?? 'Retired' };
    if (obxUnplayable(g)) return { text: `Public, but nobody can play it: ${g.Reach?.Why ?? g.Reach?.Status ?? 'closed'}`, tone: 'crit' };
    if (g.Live?.Running) return { text: `${g.Live.Role} at work · ${g.Live.Status} · turn ${g.Live.Turns + 1}`, tone: 'info' };
    if ((g.Watchdog?.Level ?? 0) >= 3) return { text: `Paused by the watchdog: ${g.WaitingReason ?? 'the same problem kept coming back'}`, tone: 'crit' };
    if (g.WaitingReason) return { text: `Waiting: ${g.WaitingReason}`, tone: 'warn' };
    if (g.Paused) return { text: 'Paused' };
    if (g.Stage === 'Live') return { text: g.WentPublicUtc ? `Live since ${obxDate(g.WentPublicUtc)}` : 'Live' };
    return { text: g.LastActivity ?? g.Pitch ?? 'Starting…' };
}

/** Engine run in a few characters: "✓ r12", "✗ r12 local", "kit ✗ r12 (old)". */
export function obxEngineShort(e: BloxGameSummary['Engine']): string {
    if (!e) return '';
    const mark = e.Ok ? '✓' : e.KitFailed && e.Failed > 0 ? 'kit ✗' : '✗';
    return `${mark} r${e.Revision}${e.Local ? ' local' : ''}${e.Current ? '' : ' (old)'}`;
}

export const OBX_MAP_BAR = 75;
export const obxMapTone = (score: number | null | undefined, bar = OBX_MAP_BAR): ObxTone | undefined =>
    score == null ? undefined : score < bar ? 'crit' : score >= 85 ? 'ok' : 'warn';

// ───────────────────────────── the line ─────────────────────────────

export interface ObxLane { stage: BloxStage; games: BloxGameSummary[] }

/** Games per stage, the ones that need looking at first; retired games listed apart, newest first. */
export function obxLanes(games: BloxGameSummary[]): { lanes: ObxLane[]; retired: BloxGameSummary[] } {
    const rank: Record<ObxTone, number> = { crit: 0, warn: 1, info: 2, ok: 3, brick: 4, violet: 4, neutral: 5 };
    const lanes = OBX_LINE.map(stage => ({
        stage,
        games: games.filter(g => g.Stage === stage)
            .sort((a, b) => rank[obxGameTone(a)] - rank[obxGameTone(b)] || a.CreatedUtc.localeCompare(b.CreatedUtc)),
    }));
    const retired = games.filter(obxRetired).sort((a, b) => b.UpdatedUtc.localeCompare(a.UpdatedUtc));
    return { lanes, retired };
}

/** The game the studio works on first: the oldest in production. */
export function obxProduction(games: BloxGameSummary[]): BloxGameSummary | null {
    return games.filter(obxActive).sort((a, b) => a.CreatedUtc.localeCompare(b.CreatedUtc))[0] ?? null;
}

// ───────────────────────────── the Roblox account ─────────────────────────────

export interface ObxAccountSplit {
    /** Whose the studio's games and experiences are (OmniBlox_CreatorUserId). */
    creator: number;
    /** Whose the connected session is. */
    session: { id: number; name: string } | null;
    /** Whose the API key is. */
    key: { id: number; name: string } | null;
}

/**
 * The studio acts on Roblox with three things that must be one account: the creator its games belong to,
 * the API key and the signed-in session. When they differ every upload is refused (2 Nov 2026: 54 refused
 * engine tests, a launch failing 17 times). Null when they agree or it cannot be told.
 */
export function obxAccountSplit(view: BloxRobloxView | null | undefined): ObxAccountSplit | null {
    if (!view || view.CreatorGroupId != null || view.CreatorUserId == null) return null;
    const session = view.Account ? { id: view.Account.UserId, name: view.Account.Name } : null;
    const info = view.ApiKey?.Info;
    const key = info ? { id: info.OwnerUserId, name: info.Name } : null;
    const split = (session && session.id !== view.CreatorUserId) || (key && key.id !== view.CreatorUserId);
    return split ? { creator: view.CreatorUserId, session, key } : null;
}

// ───────────────────────────── needs you ─────────────────────────────

export type ObxInboxAction =
    | 'approve-build' | 'approve-launch' | 'play' | 'review-store' | 'delegate' | 'done' | 'dismiss'
    | 'download' | 'switch-studio' | 'switch-harvester' | 'connect-roblox' | 'open-account' | 'open-game';

export interface ObxInboxItem {
    id: string;
    tone: ObxTone;
    icon: string;
    kind: string;
    title: string;
    detail: string;
    gameId: string | null;
    since: string | null;
    task: BloxTask | null;
    actions: ObxInboxAction[];
    /** The primary action, drawn as the strong button. */
    primary: ObxInboxAction | null;
    files: string[];
}

export const OBX_TASK_LABEL: Record<BloxTaskKind, string> = {
    ApiKey: 'API key',
    Creator: 'Creator',
    ExperienceSlot: 'Experience',
    LaunchApproval: 'Launch approval',
    UploadIcon: 'Upload',
    Questionnaire: 'Questionnaire',
    Escalation: 'Escalation',
    Other: 'Task',
    BuildSignoff: 'Build sign-off',
    RobloxSession: 'Roblox sign-in',
};

const DELEGATABLE = new Set<BloxTaskKind>(['UploadIcon', 'Questionnaire', 'ExperienceSlot', 'Escalation', 'Other']);
const TASK_ICON: Partial<Record<BloxTaskKind, string>> = {
    ApiKey: 'key', Creator: 'user', ExperienceSlot: 'box', LaunchApproval: 'rocket', UploadIcon: 'upload',
    Questionnaire: 'note', Escalation: 'alert', BuildSignoff: 'play', RobloxSession: 'user',
};

/** What ranks first: what stops games reaching players, then gates, then chores. */
function taskRank(kind: BloxTaskKind): number {
    switch (kind) {
        case 'ApiKey': case 'Creator': case 'RobloxSession': return 0;
        case 'LaunchApproval': case 'BuildSignoff': return 1;
        case 'Escalation': return 2;
        case 'ExperienceSlot': return 3;
        default: return 4;
    }
}

export interface ObxInboxInput {
    overview: BloxOverview | null;
    roblox?: BloxRobloxView | null;
    /** The viewer may manage (approve, switch, connect) / act (resolve, delegate). */
    canManage: boolean;
    canAct: boolean;
    now: number;
}

/**
 * Everything waiting for the owner, as one list: the studio's open tasks, plus what the studio says needs
 * attention (its Attention list) that is not already a task. The account split and a game nobody can play
 * lead, because nothing else reaches players while they last.
 */
export function obxInbox(input: ObxInboxInput): ObxInboxItem[] {
    const o = input.overview;
    if (!o) return [];
    const items: (ObxInboxItem & { rank: number })[] = [];
    const tasks = (o.OwnerTasks ?? []).filter(t => t.Status === 'Open');

    for (const t of tasks) {
        const gate = t.Kind === 'BuildSignoff' || t.Kind === 'LaunchApproval';
        const actions: ObxInboxAction[] = [];
        let primary: ObxInboxAction | null = null;
        if (t.Kind === 'BuildSignoff') {
            if (t.GameId) { actions.push('play'); primary = 'play'; }
            if (input.canManage) actions.push('approve-build');
        } else if (t.Kind === 'LaunchApproval') {
            if (input.canManage) { actions.push('approve-launch'); primary = 'approve-launch'; }
            if (t.GameId) actions.push('review-store');
        } else {
            if (['ApiKey', 'Creator', 'RobloxSession'].includes(t.Kind) && input.canManage) { actions.push('open-account'); primary = 'open-account'; }
            if (input.canAct && DELEGATABLE.has(t.Kind)) { actions.push('delegate'); primary ??= 'delegate'; }
            if (input.canAct) actions.push('done', 'dismiss');
        }
        if (t.Files?.length && t.GameId) actions.push('download');
        items.push({
            id: `task:${t.TaskId}`,
            rank: taskRank(t.Kind),
            tone: taskRank(t.Kind) === 0 ? 'crit' : gate ? 'brick' : t.Kind === 'Escalation' ? 'warn' : 'info',
            icon: TASK_ICON[t.Kind] ?? 'inbox',
            kind: OBX_TASK_LABEL[t.Kind] ?? 'Task',
            title: t.Title,
            detail: t.Detail,
            gameId: t.GameId,
            since: t.CreatedUtc,
            task: t,
            actions,
            primary,
            files: t.Files ?? [],
        });
    }

    for (const a of o.Attention ?? []) {
        // The studio being off is the bar's switch; only say it here when there is nothing else to do.
        if (a.Action === 'studio') continue;
        items.push(attentionItem(a, input));
    }

    return items
        .sort((a, b) => a.rank - b.rank || (a.since ?? '').localeCompare(b.since ?? ''))
        .map(({ rank: _rank, ...item }) => item);
}

function attentionItem(a: BloxAttention, input: ObxInboxInput): ObxInboxItem & { rank: number } {
    const tone: ObxTone = a.Level === 'error' ? 'crit' : a.Level === 'warning' ? 'warn' : 'info';
    const actions: ObxInboxAction[] = [];
    if (a.Action === 'harvester' && input.canManage) actions.push('switch-harvester');
    if (a.Action === 'roblox' && input.canManage) actions.push('connect-roblox');
    return {
        id: `attention:${a.Title}`,
        rank: a.Level === 'error' ? 0 : a.Level === 'warning' ? 2 : 5,
        tone,
        icon: a.Level === 'error' ? 'octagon' : a.Level === 'warning' ? 'alert' : 'info',
        kind: a.Level === 'error' ? 'Problem' : a.Level === 'warning' ? 'Warning' : 'Note',
        title: a.Title,
        detail: a.Detail,
        gameId: null,
        since: null,
        task: null,
        actions,
        primary: actions[0] ?? null,
        files: [],
    };
}

// ───────────────────────────── the studio in one sentence ─────────────────────────────

export interface ObxVerdict {
    tone: ObxTone;
    icon: string;
    head: string;
    line: string;
    points: { tone: ObxTone; text: string }[];
}

export function obxVerdict(o: BloxOverview | null, inbox: ObxInboxItem[], roblox: BloxRobloxView | null | undefined, now: number): ObxVerdict {
    if (!o) return { tone: 'neutral', icon: 'blocks', head: 'Connecting to the studio…', line: '', points: [] };
    const games = o.Games ?? [];
    const production = games.filter(obxActive);
    const running = games.filter(g => g.Live?.Running);
    const live = games.filter(g => g.Stage === 'Live');
    const closed = games.filter(obxUnplayable);
    const split = obxAccountSplit(roblox);
    const gates = inbox.filter(i => i.task && (i.task.Kind === 'BuildSignoff' || i.task.Kind === 'LaunchApproval'));
    const points: ObxVerdict['points'] = [];

    if (split) points.push({ tone: 'crit', text: `Roblox account split: games on user ${split.creator}, ${split.session ? `signed in as ${split.session.name}` : 'no session'}${split.key && split.key.id !== split.creator ? `, key from user ${split.key.id}` : ''}` });
    for (const g of closed) points.push({ tone: 'crit', text: `Nobody can play ${g.Title}` });
    if (gates.length) {
        const oldest = gates.reduce((a, b) => ((a.since ?? '') < (b.since ?? '') ? a : b));
        points.push({ tone: obxWaitTone(oldest.since, now) ?? 'brick', text: `${obxPlural(gates.length, 'build')} waiting for your sign-off, the oldest for ${obxSpan(now - Date.parse(oldest.since!))}` });
    }
    const stuck = production.filter(g => (g.Watchdog?.Level ?? 0) >= 3);
    if (stuck.length) points.push({ tone: 'warn', text: `${obxPlural(stuck.length, 'game')} paused by the watchdog` });
    if (o.HarvesterEnabled && o.Harvester?.Idle && o.Harvester.LastProgressUtc && now - Date.parse(o.Harvester.LastProgressUtc) > DAY)
        points.push({ tone: 'warn', text: `Harvester idle for ${obxSpan(now - Date.parse(o.Harvester.LastProgressUtc))}` });
    if (!o.Model?.Available) points.push({ tone: o.Enabled ? 'crit' : 'warn', text: o.Model?.Reason ?? 'No model available' });

    const blocking = points.some(p => p.tone === 'crit');
    if (!o.Enabled) {
        return {
            tone: blocking ? 'crit' : 'neutral',
            icon: 'power',
            head: 'Studio off',
            line: production.length ? `${obxPlural(production.length, 'game')} in production, none being worked on` : 'Nothing is researched, built or maintained',
            points,
        };
    }
    if (running.length) {
        const g = running[0]!;
        return { tone: blocking ? 'crit' : 'info', icon: 'activity', head: `Working on ${g.Title}`, line: `${g.Live!.Role} · ${g.Live!.Status}`, points };
    }
    return {
        tone: blocking ? 'crit' : points.length ? 'warn' : 'ok',
        icon: blocking ? 'alert' : 'blocks',
        head: o.Status ? o.Status.charAt(0).toUpperCase() + o.Status.slice(1) : 'Idle',
        line: [live.length ? `${obxPlural(live.length, 'game')} live` : null, production.length ? `${production.length} in production` : null].filter(Boolean).join(' · ') || 'No games yet',
        points,
    };
}

// ───────────────────────────── commands ─────────────────────────────

export interface ObxCommand {
    id: string;
    group: string;
    title: string;
    icon: string;
    hint?: string;
    keywords?: string;
    danger?: boolean;
    run: () => unknown;
}
