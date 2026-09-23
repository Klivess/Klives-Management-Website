// Shared constants, types and formatters for the API telemetry page. Lives in
// scripts/ (not composables/) so these names never collide with other auto-imports
// (useOmniTrader exports fmtMs/fmtPct/fmtTime/fmtAgo too).

import { ref } from 'vue';

export const TEL_PRESETS = ['15m', '1h', '6h', '24h', '7d', '30d', '90d', '1y', 'all'] as const;
export const TEL_BUCKETS = ['auto', '10s', '30s', '1m', '5m', '15m', '1h', '6h', '1d'] as const;
export const TEL_TABS = ['overview', 'routes', 'stages', 'client', 'runtime', 'traces'] as const;
export type TelTab = typeof TEL_TABS[number];

export const STAGE_KEYS = ['queue', 'prologue', 'auth', 'gate', 'delay', 'body', 'cache', 'handler', 'encode', 'etag', 'compress', 'write', 'teardown'] as const;
export const STAGE_LABELS: Record<string, string> = {
    queue: 'Dispatch queue', prologue: 'Prologue', auth: 'Auth', gate: 'Defence gate', delay: 'Defence delay',
    body: 'Request body', cache: 'Cache lookup', handler: 'Handler', encode: 'Encode', etag: 'ETag',
    compress: 'Compress', write: 'Response write', teardown: 'Teardown',
};
export const STAGE_HELP: Record<string, string> = {
    queue: 'Accepted by http.sys → a thread-pool thread starts the request. Rises under pool starvation.',
    prologue: 'Route + query parsing, header capture, method and permission checks.',
    auth: 'Resolving the caller profile from the Authorization header.',
    gate: 'OmniDefence pre-dispatch IP gate.',
    delay: 'Deliberate OmniDefence tarpit / repeat-auth-failure sleeps. Excluded from latency.',
    body: 'Reading the request body off the socket (client upload).',
    cache: 'Response-cache key build + lookup.',
    handler: 'The route handler’s own work, until it starts emitting a response.',
    encode: 'JSON check / serialisation / UTF-8 encoding of the response.',
    etag: 'Hashing the body for the weak ETag.',
    compress: 'Brotli / gzip compression.',
    write: 'Handing bytes to http.sys (server upload). Only tracks the network for bodies larger than the socket buffer — see Client for true download time.',
    teardown: 'Bookkeeping after the response closed. Not seen by the client.',
};

/**
 * Stages are folded into seven groups for stacked charts: a stack of 13 hues is
 * unreadable and would exceed the validated 8-slot categorical palette.
 */
export const STAGE_GROUPS: { key: string; label: string; stages: string[]; color: string }[] = [
    { key: 'queue', label: 'Queue', stages: ['queue'], color: '--tel-s1' },
    { key: 'pre', label: 'Auth + gate + prologue', stages: ['prologue', 'auth', 'gate'], color: '--tel-s2' },
    { key: 'body', label: 'Request body', stages: ['body'], color: '--tel-s3' },
    { key: 'cache', label: 'Cache lookup', stages: ['cache'], color: '--tel-s4' },
    { key: 'handler', label: 'Handler', stages: ['handler'], color: '--tel-s5' },
    { key: 'serialize', label: 'Encode + ETag + compress', stages: ['encode', 'etag', 'compress'], color: '--tel-s6' },
    { key: 'write', label: 'Response write', stages: ['write'], color: '--tel-s7' },
];
export const stageGroupOf = (stage: string) => STAGE_GROUPS.find(g => g.stages.includes(stage));

export interface TelSeries {
    key: string;
    label: string;
    values: (number | null)[];
    /** CSS custom property holding the colour, e.g. '--tel-s1'. */
    color: string;
    kind?: 'line' | 'area' | 'bar';
    dash?: boolean;
    /** Start hidden (still toggleable from the legend). */
    hidden?: boolean;
}

export interface BarItem { key: string; label: string; value: number; valueText: string; detail?: string }

export interface WaterfallRow {
    key: string;
    label: string;
    ms: number;
    color: string;
    help?: string;
    /** Explicit start offset (single-trace mode). */
    start?: number;
    /** false for stages that don't count toward client latency (delay, teardown). */
    latency?: boolean;
    share?: number | null;
    side?: 'client' | 'server';
}

// ── shared crosshair: every time chart on the page follows the same instant ──
export const telHoverT = ref<number | null>(null);

// ── formatting (a value always means the same thing on every chart) ──
export const NONE = '—';
export function fmtMs(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return NONE;
    if (v >= 1000) return `${(v / 1000).toFixed(v >= 10_000 ? 1 : 2)} s`;
    if (v >= 100) return `${v.toFixed(0)} ms`;
    if (v >= 10) return `${v.toFixed(1)} ms`;
    if (v >= 1) return `${v.toFixed(2)} ms`;
    return `${(v * 1000).toFixed(0)} µs`;
}
export function fmtCount(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return NONE;
    const a = Math.abs(v);
    if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (a >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
    return a < 10 && v % 1 !== 0 ? v.toFixed(2) : Math.round(v).toLocaleString();
}
export function fmtRps(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return NONE;
    if (v >= 100) return `${v.toFixed(0)}/s`;
    if (v >= 1) return `${v.toFixed(1)}/s`;
    if (v * 60 >= 1) return `${(v * 60).toFixed(1)}/min`;
    return `${(v * 3600).toFixed(1)}/h`;
}
export function fmtPct(v: number | null | undefined, digits = 1): string {
    if (v == null || !Number.isFinite(v)) return NONE;
    return `${v.toFixed(v > 0 && v < 0.1 ? 2 : digits)}%`;
}
export function fmtBytes(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return NONE;
    const a = Math.abs(v);
    if (a >= 1024 ** 3) return `${(v / 1024 ** 3).toFixed(2)} GB`;
    if (a >= 1024 ** 2) return `${(v / 1024 ** 2).toFixed(1)} MB`;
    if (a >= 1024) return `${(v / 1024).toFixed(1)} KB`;
    return `${Math.round(v)} B`;
}
export function fmtRatio(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return NONE;
    return `${v.toFixed(v >= 10 ? 0 : 1)}×`;
}
export type TelUnit = 'ms' | 'count' | 'rps' | 'pct' | 'bytes' | 'ratio' | 'num' | 'mb';
export function fmtUnit(v: number | null | undefined, unit: TelUnit): string {
    switch (unit) {
        case 'ms': return fmtMs(v);
        case 'rps': return fmtRps(v);
        case 'pct': return fmtPct(v);
        case 'bytes': return fmtBytes(v);
        case 'ratio': return fmtRatio(v);
        case 'mb': return v == null || !Number.isFinite(v) ? NONE : `${v.toFixed(v >= 100 ? 0 : 1)} MB`;
        case 'num': return v == null || !Number.isFinite(v) ? NONE : v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2);
        default: return fmtCount(v);
    }
}
export function fmtTime(t: number, stepMs: number): string {
    const d = new Date(t);
    if (stepMs >= 86_400_000) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (stepMs >= 3_600_000) return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' });
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: stepMs < 60_000 ? '2-digit' : undefined });
}
export function fmtAgo(t: number | null | undefined, now = Date.now()): string {
    if (!t) return NONE;
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    return `${Math.round(s / 3600)}h ago`;
}
