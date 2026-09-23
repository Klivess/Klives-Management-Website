// Real-user timing for KliveAPI calls.
//
// Every fetch to the API already carries a multi-stage `Server-Timing` header (queue,
// auth, handler, compress, …, app, trace) plus `Timing-Allow-Origin: *`, so the
// browser's Resource Timing entries expose the full client-side picture: DNS, TCP,
// TLS, network wait, download. A PerformanceObserver turns each entry into a compact
// sample and a batched beacon reports them, so the server can show where time goes
// on the wire — not just inside the process — and join a slow request's client
// phases to its server trace.

import { KliveAPIUrl, PostTelemetryBeacon } from './APIInterface';

interface RumEntry {
    r: string;      // path
    t?: string;     // server trace id (hex)
    ts: number;     // epoch ms of the request start
    b: number;      // browser queue + CORS preflight + stalls
    dns: number;
    tcp: number;
    tls: number;
    net: number;    // TTFB minus server time: round trip + kernel queue
    srv: number;    // server's own time (Server-Timing app)
    dl: number;     // download
    tot: number;
    reuse: 0 | 1;
    xfer: number;
}

const FLUSH_MS = 15_000;
const MAX_BUFFER = 120; // keeps a beacon well under the server's 32 KB body limit
const DISABLE_KEY = 'km.telemetry.rum.disabled';

let started = false;
let buffer: RumEntry[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

const r1 = (v: number) => Math.max(0, Math.round(v * 10) / 10);

function toEntry(e: PerformanceResourceTiming): RumEntry | null {
    if (!e.name.startsWith(KliveAPIUrl)) return null;
    let path: string;
    try { path = new URL(e.name).pathname; } catch { return null; }
    // Never measure the beacon itself (feedback loop) or long-lived sockets.
    if (path.startsWith('/KliveAPI/telemetry/rum')) return null;

    const timings = (e as any).serverTiming as Array<{ name: string; duration: number; description: string }> | undefined;
    const srv = timings?.find(t => t.name === 'app')?.duration ?? 0;
    const trace = timings?.find(t => t.name === 'trace')?.description || undefined;

    const dns = e.domainLookupEnd - e.domainLookupStart;
    const tcpEnd = e.secureConnectionStart > 0 ? e.secureConnectionStart : e.connectEnd;
    const tcp = tcpEnd - e.connectStart;
    const tls = e.secureConnectionStart > 0 ? e.connectEnd - e.secureConnectionStart : 0;
    const wait = e.responseStart - e.requestStart;
    const dl = e.responseEnd - e.responseStart;
    const tot = e.responseEnd - e.startTime;
    if (!(tot > 0) || e.responseStart <= 0) return null; // opaque or aborted entry: nothing to learn

    return {
        r: path,
        t: trace,
        ts: Math.round(performance.timeOrigin + e.startTime),
        b: r1(tot - dns - tcp - tls - wait - dl),
        dns: r1(dns),
        tcp: r1(tcp),
        tls: r1(tls),
        net: r1(wait - srv),
        srv: r1(srv),
        dl: r1(dl),
        tot: r1(tot),
        reuse: dns <= 0 && tcp <= 0 ? 1 : 0,
        xfer: e.transferSize || 0,
    };
}

function flush() {
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    void PostTelemetryBeacon(JSON.stringify({ e: batch }));
}

export function rumEnabled(): boolean {
    try { return localStorage.getItem(DISABLE_KEY) !== '1'; } catch { return true; }
}

export function setRumEnabled(enabled: boolean) {
    try {
        if (enabled) localStorage.removeItem(DISABLE_KEY);
        else localStorage.setItem(DISABLE_KEY, '1');
    } catch { /* storage unavailable: stays enabled for this session */ }
}

export function startApiTelemetryRum() {
    if (started || typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;
    if (!rumEnabled()) return;
    started = true;

    // Dashboards can issue hundreds of calls; keep the browser from silently dropping entries.
    try { performance.setResourceTimingBufferSize(1000); } catch { }

    const observer = new PerformanceObserver(list => {
        for (const raw of list.getEntries()) {
            const entry = toEntry(raw as PerformanceResourceTiming);
            if (!entry) continue;
            buffer.push(entry);
            if (buffer.length >= MAX_BUFFER) flush();
        }
    });
    try {
        observer.observe({ type: 'resource', buffered: true });
    } catch {
        started = false;
        return;
    }

    timer = setInterval(flush, FLUSH_MS);
    // Beacon on the way out so short visits still report (fetch keepalive survives unload).
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    window.addEventListener('pagehide', flush);
}

export function stopApiTelemetryRum() {
    if (timer) clearInterval(timer);
    timer = null;
    flush();
}
