/**
 * Formatting for Omniscience v3 pages. Instants arrive as UTC epoch milliseconds and are only
 * turned into wall-clock text here, in the zone the reader chose (the "time lens"): Klives's
 * zone, or UTC. Nothing parses or formats a date by hand anywhere else.
 */

export const OMNI_NONE = '—';

export type OmniLens = 'Klives' | 'Utc';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string, withSeconds: boolean): Intl.DateTimeFormat {
    const key = `${zone}|${withSeconds}`;
    let found = formatters.get(key);
    if (!found) {
        const options: Intl.DateTimeFormatOptions = {
            timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', weekday: 'short', timeZoneName: 'short',
        };
        if (withSeconds) options.second = '2-digit';
        try {
            found = new Intl.DateTimeFormat('en-GB', options);
        } catch {
            // An IANA name this browser does not know: say UTC rather than guess.
            found = new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' });
        }
        formatters.set(key, found);
    }
    return found;
}

export interface OmniInstantParts { date: string; time: string; weekday: string; zone: string }

export function omniInstantParts(ms: number, zone: string, withSeconds = false): OmniInstantParts {
    const parts: Record<string, string> = {};
    for (const part of formatter(zone, withSeconds).formatToParts(new Date(ms))) parts[part.type] = part.value;
    const time = `${parts.hour}:${parts.minute}${withSeconds ? `:${parts.second}` : ''}`;
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time, weekday: parts.weekday ?? '', zone: parts.timeZoneName ?? zone };
}

/** `2026-11-09 Mon 22:41 GMT` in the given zone. */
export function omniInstant(ms: number | null | undefined, zone: string, withSeconds = false): string {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) return OMNI_NONE;
    const p = omniInstantParts(ms, zone, withSeconds);
    return `${p.date} ${p.weekday} ${p.time} ${p.zone}`;
}

/** The zone's UTC offset in ms at an instant (positive east of Greenwich). */
function zoneOffsetMs(ms: number, zone: string): number {
    const p = omniInstantParts(ms, zone, true);
    const [y, mo, d] = p.date.split('-').map(Number);
    const [h, mi, s] = p.time.split(':').map(Number);
    return Date.UTC(y!, mo! - 1, d!, h!, mi!, s ?? 0) - Math.floor(ms / 1000) * 1000;
}

/**
 * A wall-clock time typed in a zone (`2026-03-29T01:30`, as a datetime-local input gives it) as
 * a UTC instant. An hour that occurs twice (autumn) resolves to its first occurrence; an hour
 * that does not exist (spring) moves forward past the gap. Returns null for unparseable text.
 */
export function omniZonedToMs(local: string, zone: string): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
    if (!m) return null;
    const wall = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
    if (!Number.isFinite(wall)) return null;
    // Two candidates: the offset just before and just after any transition near this wall time.
    const early = wall - zoneOffsetMs(wall - 86_400_000, zone);
    const late = wall - zoneOffsetMs(wall + 86_400_000, zone);
    const matches = [early, late].filter(ms => ms + zoneOffsetMs(ms, zone) === wall).sort((a, b) => a - b);
    if (matches.length) return matches[0]!;
    // In a gap: neither candidate round-trips. Take the later instant, which lands after the jump.
    return Math.max(early, late);
}

/** The value a datetime-local input shows for an instant in a zone. */
export function omniMsToZonedInput(ms: number | null | undefined, zone: string): string {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) return '';
    const p = omniInstantParts(ms, zone, false);
    return `${p.date}T${p.time}`;
}

export function omniUtcIso(ms: number | null | undefined): string {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) return '';
    return new Date(ms).toISOString().replace('.000Z', 'Z');
}

/** A span of time: `850 ms`, `12 s`, `4 m 05 s`, `3 h 12 m`, `2 d 4 h`. */
export function omniDuration(ms: number | null | undefined): string {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) return OMNI_NONE;
    const abs = Math.abs(ms);
    if (abs < 1000) return `${Math.round(abs)} ms`;
    const s = Math.floor(abs / 1000);
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} m ${String(s % 60).padStart(2, '0')} s`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h} h ${String(m % 60).padStart(2, '0')} m`;
    return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** Age relative to `now`: `just now`, `4 m ago`, `in 2 h`. */
export function omniAge(ms: number | null | undefined, now: number): string {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) return OMNI_NONE;
    const delta = now - ms;
    const abs = Math.abs(delta);
    if (abs < 5000) return 'just now';
    const s = Math.floor(abs / 1000);
    const text = s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} m` : s < 172800 ? `${Math.floor(s / 3600)} h` : `${Math.floor(s / 86400)} d`;
    return delta >= 0 ? `${text} ago` : `in ${text}`;
}

export function omniCount(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return OMNI_NONE;
    return value.toLocaleString('en-GB');
}

/** Compact magnitude for token counts and the like: `1.2K`, `3.4M`. */
export function omniCompact(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return OMNI_NONE;
    const abs = Math.abs(value);
    if (abs < 1000) return String(Math.round(value));
    if (abs < 1e6) return `${(value / 1e3).toFixed(abs < 1e4 ? 1 : 0)}K`;
    if (abs < 1e9) return `${(value / 1e6).toFixed(abs < 1e7 ? 1 : 0)}M`;
    return `${(value / 1e9).toFixed(1)}B`;
}

export function omniBytes(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return OMNI_NONE;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let v = value, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** A 0..1 ratio as a percentage. */
export function omniPercent(ratio: number | null | undefined, digits = 0): string {
    if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return OMNI_NONE;
    return `${(ratio * 100).toFixed(digits)}%`;
}

/** Tone class (ok / warn / bad / info / '') for a job or run state. */
export function omniStateTone(state: string | null | undefined): string {
    switch ((state ?? '').toLowerCase()) {
        case 'succeeded': case 'ok': case 'ready': case 'done': case 'active': return 'ok';
        case 'running': case 'leased': case 'starting': return 'info';
        case 'queued': case 'paused': case 'stopping': return 'warn';
        case 'dead': case 'failed': return 'bad';
        default: return '';
    }
}

/** RFC 4180 CSV of a table, for client-side export of what is on screen. */
export function omniCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
    const cell = (value: unknown) => {
        const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return [headers.map(cell).join(','), ...rows.map(row => row.map(cell).join(','))].join('\r\n');
}

export function omniDownload(filename: string, text: string, type = 'text/csv;charset=utf-8'): void {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
