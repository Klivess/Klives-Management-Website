import type { PermissionTierName, PresenceSummary, TimelineItem } from '~/scripts/profilesApi';

/* Display helpers shared by the profile console, /account, the login page and the access
   components. Kept out of composables/ so none of these names become global auto-imports. */

export function toMs(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
}

/** "just now", "4m ago", "3h ago", "2d ago", then a date. */
export function relTime(value: string | number | null | undefined, now = Date.now()): string {
    const ms = toMs(value);
    if (ms === null) return 'never';
    const diff = now - ms;
    // A moment "in the future" is just two clocks a little apart.
    if (diff < -60_000) return untilTime(ms, now);
    const s = Math.floor(diff / 1000);
    if (s < 45) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${Math.max(1, m)}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 14) return `${d}d ago`;
    return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d > 300 ? 'numeric' : undefined });
}

/** "in 2h 5m", "in 3d", "now". */
export function untilTime(value: string | number | null | undefined, now = Date.now()): string {
    const ms = toMs(value);
    if (ms === null) return '';
    const diff = ms - now;
    if (diff <= 0) return 'now';
    return `in ${durationShort(diff)}`;
}

/** 42s · 4m 12s · 2h 3m · 3d 4h */
export function durationShort(ms: number | null | undefined): string {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return s % 60 && m < 10 ? `${m}m ${s % 60}s` : `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
    const d = Math.floor(h / 24);
    return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

export function fmtDateTime(value: string | number | null | undefined): string {
    const ms = toMs(value);
    if (ms === null) return '—';
    return new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtCount(n: number | null | undefined): string {
    if (n === null || n === undefined || !Number.isFinite(n)) return '—';
    if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
    return n.toLocaleString();
}

export function initials(name: string | null | undefined): string {
    const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A stable hue per profile, so an avatar keeps its colour everywhere. */
export function avatarHue(id: string | null | undefined): number {
    let h = 0;
    for (const ch of String(id ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % 360;
}

export interface RankMeta { name: string; value: number; label: string; blurb: string }

/** Rank is a hierarchy label only: it orders people and bounds who may manage whom. */
export const RANKS: RankMeta[] = [
    { name: 'Klives', value: 5, label: 'Owner', blurb: 'Holds every permission. Only Klives.' },
    { name: 'Admin', value: 4, label: 'Admin', blurb: 'Can manage Associates, Managers and Guests.' },
    { name: 'Associate', value: 3, label: 'Associate', blurb: 'Can manage Managers and Guests.' },
    { name: 'Manager', value: 2, label: 'Manager', blurb: 'Can manage Guests.' },
    { name: 'Guest', value: 1, label: 'Guest', blurb: 'Manages nobody.' },
];

export function rankMeta(rank: string | number | null | undefined): RankMeta {
    return RANKS.find(r => r.name === rank || r.value === Number(rank)) ?? RANKS[RANKS.length - 1];
}

export interface TierMeta { name: PermissionTierName; value: number; short: string; tone: string; blurb: string }

export const TIERS: TierMeta[] = [
    { name: 'Glance', value: 1, short: 'T1', tone: 'glance', blurb: 'Status, counts and summaries.' },
    { name: 'Read', value: 2, short: 'T2', tone: 'read', blurb: 'Full records, history and content.' },
    { name: 'Act', value: 3, short: 'T3', tone: 'act', blurb: 'Routine, mostly reversible operations.' },
    { name: 'Manage', value: 4, short: 'T4', tone: 'manage', blurb: 'Creating, deleting and configuring.' },
    { name: 'Critical', value: 5, short: 'T5', tone: 'critical', blurb: 'Live money, host control, secrets and other profiles.' },
];

export function tierMeta(tier: string | number | null | undefined): TierMeta {
    return TIERS.find(t => t.name === tier || t.value === Number(tier)) ?? TIERS[0];
}

export function presenceText(p: PresenceSummary | null | undefined, now = Date.now()): string {
    if (!p || p.state === 'offline') return 'Offline';
    const where = p.currentTitle || p.currentPath || 'the site';
    const since = p.onPageSinceUtc ? ` · ${durationShort(now - (toMs(p.onPageSinceUtc) ?? now))}` : '';
    return `${p.state === 'idle' ? 'Idle on' : 'On'} ${where}${since}`;
}

/** Why the site signed someone out, in their words. */
export function signOutText(state: string | null | undefined, message?: string | null): { title: string; detail: string } | null {
    switch (state) {
        case 'SessionRevoked':
            return { title: 'You were signed out', detail: message || 'This session was ended from another device or by Klives.' };
        case 'SessionExpired':
            return { title: 'Your session expired', detail: 'Sign in again to carry on.' };
        case 'ProfileDisabled':
            return { title: 'Sign-in is turned off', detail: 'Your profile can no longer sign in. Ask Klives if that is unexpected.' };
        case 'PasswordChanged':
            return { title: 'Your password changed', detail: 'Every session was signed out. Sign in with the new password.' };
        case 'ProfileNotFound':
            return { title: 'Profile removed', detail: 'This profile no longer exists.' };
        case 'InvalidCredential':
            return { title: 'Sign in again', detail: 'Your saved sign-in is no longer valid.' };
        case 'SignedOut':
            return { title: 'Signed out', detail: 'Sign in to continue.' };
        default:
            return null;
    }
}

export interface EventMeta { label: string; glyph: string; tone: '' | 'ok' | 'warn' | 'bad' | 'info' | 'violet' }

const EVENT_META: Record<string, EventMeta> = {
    'login': { label: 'Signed in', glyph: '→', tone: 'ok' },
    'login.refused': { label: 'Sign-in refused', glyph: '⊘', tone: 'bad' },
    'logout': { label: 'Signed out', glyph: '←', tone: '' },
    'session.revoked': { label: 'Sessions ended', glyph: '⏏', tone: 'warn' },
    'password.changed': { label: 'Changed their password', glyph: '⚿', tone: 'info' },
    'password.reset': { label: 'Password reset', glyph: '⚿', tone: 'warn' },
    'profile.created': { label: 'Profile created', glyph: '✦', tone: 'ok' },
    'profile.updated': { label: 'Profile edited', glyph: '✎', tone: 'info' },
    'profile.deleted': { label: 'Profile deleted', glyph: '✕', tone: 'bad' },
    'access.permissions': { label: 'Permissions changed', glyph: '⚑', tone: 'violet' },
    'access.suspended': { label: 'Suspended', glyph: '⏸', tone: 'bad' },
    'access.unsuspended': { label: 'Suspension lifted', glyph: '▶', tone: 'ok' },
    'access.read-only.on': { label: 'Made read-only', glyph: '◐', tone: 'warn' },
    'access.read-only.off': { label: 'Read-only lifted', glyph: '◑', tone: 'ok' },
    'access.login.on': { label: 'Sign-in turned on', glyph: '⏻', tone: 'ok' },
    'access.login.off': { label: 'Sign-in turned off', glyph: '⏻', tone: 'bad' },
    'access.password-api.on': { label: 'Password API access on', glyph: '⌁', tone: 'warn' },
    'access.password-api.off': { label: 'Password API access off', glyph: '⌁', tone: '' },
};

export function eventMeta(kind: string | null | undefined): EventMeta {
    return EVENT_META[kind ?? ''] ?? { label: kind ?? 'Event', glyph: '•', tone: '' };
}

function parseDetail(json: string | null | undefined): Record<string, any> {
    if (!json) return {};
    try {
        const value = JSON.parse(json);
        return value && typeof value === 'object' ? value : {};
    } catch {
        return {};
    }
}

/** One readable line for an event's detail ("+3 −1 permissions", "until 14:00 · spam"). */
export function eventDetail(item: TimelineItem): string {
    const d = parseDetail(item.detailJson);
    switch (item.kind) {
        case 'login': return [d.device, d.legacy ? 'old site' : null].filter(Boolean).join(' · ');
        case 'login.refused': return d.reason === 'ProfileDisabled' ? 'sign-in is off' : String(d.reason ?? '');
        case 'access.permissions': {
            const parts = [];
            if (d.added?.length) parts.push(`+${d.added.length}`);
            if (d.removed?.length) parts.push(`−${d.removed.length}`);
            if (d.changed?.length) parts.push(`~${d.changed.length}`);
            return parts.length ? `${parts.join(' ')} permissions` : '';
        }
        case 'access.suspended': return [d.untilUtc ? `until ${fmtDateTime(d.untilUtc)}` : null, d.reason].filter(Boolean).join(' · ');
        case 'access.unsuspended': return d.automatic ? 'time ran out' : '';
        case 'session.revoked': return d.revoked != null ? `${d.revoked} session${d.revoked === 1 ? '' : 's'}` : '';
        case 'password.changed':
        case 'password.reset': return d.signedOutSessions ? `${d.signedOutSessions} other session${d.signedOutSessions === 1 ? '' : 's'} signed out` : '';
        case 'profile.created': return [d.rank, d.permissions != null ? `${d.permissions} permissions` : null].filter(Boolean).join(' · ');
        case 'profile.updated': {
            const parts = [];
            if (d.name) parts.push(`renamed ${d.name.from} → ${d.name.to}`);
            if (d.rank) parts.push(`rank ${d.rank.from} → ${d.rank.to}`);
            if (d.discord) parts.push('Discord ID changed');
            return parts.join(' · ');
        }
        default: return '';
    }
}

/** Access-denied reasons as a person would say them. */
export function denyReasonText(reason: string | null | undefined): string {
    switch (reason) {
        case 'MissingPermission': return 'missing permission';
        case 'Suspended': return 'suspended';
        case 'ReadOnly': return 'read-only';
        case 'ProfileDisabled': return 'sign-in off';
        case 'SessionRevoked': return 'session ended';
        case 'SessionExpired': return 'session expired';
        case 'InvalidCredential': return 'bad credential';
        case 'NoCredential': return 'not signed in';
        default: return reason ? reason : '';
    }
}
