// OmniDefence browser beacon.
//
// Server-side signals (headers, timing, routes, ASN) can't tell a real browser from a
// good fake. This probe runs in the page and reports what only a real browser session
// has: automation flags (navigator.webdriver), the GPU/canvas/audio stack, environment
// consistency (client hints vs User-Agent, timezone vs IP geolocation) and whether any
// *trusted* input events happened. Only hashes and coarse values leave the browser.
//
// The server binds each beacon to the fetching IP with a short-lived nonce and treats
// it as evidence, not proof.

import { KliveAPIUrl } from './APIInterface';

const FIRST_SEND_MS = 3_000;
const RESEND_MS = 60_000;
const DISABLE_KEY = 'km.omnidefence.fp.disabled';
const HEADING_BINS = 16;

interface InputCounters { pointer: number; keys: number; scroll: number; touch: number; untrusted: number; }

let started = false;
let nonce: string | null = null;
let env: Record<string, unknown> | null = null;
let counters: InputCounters = { pointer: 0, keys: 0, scroll: 0, touch: 0, untrusted: 0 };
let headings = new Array<number>(HEADING_BINS).fill(0);
let lastPointer: { x: number; y: number } | null = null;
let dirty = false;

export function fingerprintEnabled(): boolean {
    try { return localStorage.getItem(DISABLE_KEY) !== '1'; } catch { return true; }
}

async function sha(text: string): Promise<string> {
    try {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(digest).slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
        // Insecure context: a cheap stable hash is still enough to tell devices apart.
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
        return (h >>> 0).toString(16);
    }
}

async function canvasHash(): Promise<string | null> {
    try {
        const c = document.createElement('canvas');
        c.width = 240; c.height = 60;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.textBaseline = 'top';
        ctx.font = '16px "Arial"';
        ctx.fillStyle = '#f60';
        ctx.fillRect(100, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('OmniDefence 🛡 ∑ ç', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.beginPath(); ctx.arc(50, 30, 20, 0, Math.PI * 2); ctx.fill();
        return await sha(c.toDataURL());
    } catch { return null; }
}

function webgl(): { vendor: string | null; renderer: string | null } | null {
    try {
        const c = document.createElement('canvas');
        const gl = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
        if (!gl) return null;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return {
            vendor: String(gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR)),
            renderer: String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
        };
    } catch { return null; }
}

async function audioHash(): Promise<string | null> {
    try {
        const Ctx = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
        if (!Ctx) return null;
        const ctx = new Ctx(1, 4410, 44100);
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 10000;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -50; comp.knee.value = 40; comp.ratio.value = 12; comp.attack.value = 0; comp.release.value = 0.25;
        osc.connect(comp); comp.connect(ctx.destination); osc.start(0);
        const buffer: AudioBuffer = await Promise.race([
            ctx.startRendering(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000)),
        ]);
        const data = buffer.getChannelData(0);
        let sum = 0;
        for (let i = 4000; i < 4410; i++) sum += Math.abs(data[i]);
        return await sha(sum.toFixed(10));
    } catch { return null; }
}

async function fontHash(): Promise<string | null> {
    try {
        const probe = ['Arial', 'Calibri', 'Cambria', 'Consolas', 'Courier New', 'Georgia', 'Helvetica', 'Menlo', 'Monaco', 'Segoe UI',
            'SF Pro Text', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Ubuntu', 'Verdana', 'Roboto', 'Noto Sans', 'DejaVu Sans', 'Liberation Sans'];
        const c = document.createElement('canvas');
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        const text = 'mmmmmmmmmmlli10WQ';
        ctx.font = '72px monospace';
        const base = ctx.measureText(text).width;
        const present = probe.filter(f => { ctx.font = `72px "${f}", monospace`; return ctx.measureText(text).width !== base; });
        return await sha(present.join(','));
    } catch { return null; }
}

function devtoolsProtocolActive(): boolean {
    // Automation drivers (CDP Runtime.enable) serialise console arguments eagerly, which
    // touches this getter. Open DevTools does too, so the server weighs it lightly.
    let touched = false;
    try {
        const e = new Error();
        Object.defineProperty(e, 'stack', { get() { touched = true; return ''; } });
        console.debug(e);
    } catch { }
    return touched;
}

async function collectEnv(): Promise<Record<string, unknown>> {
    const nav: any = navigator;
    let permNotif: string | null = null;
    try { permNotif = (await nav.permissions?.query({ name: 'notifications' }))?.state ?? null; } catch { }
    let uaData: unknown = null;
    try {
        if (nav.userAgentData) {
            uaData = { brands: nav.userAgentData.brands, mobile: nav.userAgentData.mobile, platform: nav.userAgentData.platform };
        }
    } catch { }
    const [canvas, audio, fonts] = await Promise.all([canvasHash(), audioHash(), fontHash()]);
    return {
        webdriver: nav.webdriver === true,
        ua: navigator.userAgent,
        uaData,
        platform: nav.platform ?? null,
        languages: Array.from(navigator.languages || []),
        tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; } })(),
        tzOffset: new Date().getTimezoneOffset(),
        screen: { w: screen.width, h: screen.height, aw: screen.availWidth, ah: screen.availHeight, dpr: window.devicePixelRatio, cd: screen.colorDepth },
        cores: nav.hardwareConcurrency ?? null,
        mem: nav.deviceMemory ?? null,
        touch: nav.maxTouchPoints ?? 0,
        plugins: nav.plugins ? nav.plugins.length : null,
        chrome: typeof (window as any).chrome !== 'undefined',
        notifPerm: typeof Notification !== 'undefined' ? Notification.permission : null,
        permNotif,
        webgl: webgl(),
        canvas,
        audio,
        fonts,
        cdp: devtoolsProtocolActive(),
    };
}

function headingEntropy(): number | null {
    const total = headings.reduce((a, b) => a + b, 0);
    if (total < 20) return null;
    let h = 0;
    for (const n of headings) { if (n > 0) { const p = n / total; h -= p * Math.log2(p); } }
    return Math.round(h * 100) / 100;
}

function trackInput() {
    const opts: AddEventListenerOptions = { passive: true, capture: true };
    window.addEventListener('pointermove', (e: PointerEvent) => {
        if (!e.isTrusted) { counters.untrusted++; return; }
        counters.pointer++;
        if (lastPointer) {
            const dx = e.clientX - lastPointer.x, dy = e.clientY - lastPointer.y;
            if (dx !== 0 || dy !== 0) {
                const bin = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * HEADING_BINS) % HEADING_BINS;
                headings[bin]++;
            }
        }
        lastPointer = { x: e.clientX, y: e.clientY };
        dirty = true;
    }, opts);
    window.addEventListener('keydown', e => { if (e.isTrusted) counters.keys++; else counters.untrusted++; dirty = true; }, opts);
    window.addEventListener('wheel', e => { if (e.isTrusted) counters.scroll++; else counters.untrusted++; dirty = true; }, opts);
    window.addEventListener('touchstart', e => { if (e.isTrusted) counters.touch++; else counters.untrusted++; dirty = true; }, opts);
    window.addEventListener('click', e => { if (!e.isTrusted) { counters.untrusted++; dirty = true; } }, opts);
}

async function fetchNonce(): Promise<boolean> {
    try {
        const r = await fetch(`${KliveAPIUrl}/omnidefence/fp/nonce`, { cache: 'no-store', headers: { 'X-Klive-Client': 'website', 'X-Klive-Page': location.pathname } });
        if (!r.ok) return false;
        const body = await r.json();
        if (!body?.enabled || !body?.nonce) return false;
        nonce = body.nonce;
        return true;
    } catch { return false; }
}

async function send(final = false, retried = false) {
    if (!env) return;
    if (!nonce && !(await fetchNonce())) return;
    const input = { ...counters, entropy: headingEntropy() };
    counters = { pointer: 0, keys: 0, scroll: 0, touch: 0, untrusted: 0 };
    headings = new Array<number>(HEADING_BINS).fill(0);
    dirty = false;
    try {
        const r = await fetch(`${KliveAPIUrl}/omnidefence/fp`, {
            method: 'POST',
            mode: 'cors',
            keepalive: final,
            headers: { 'Content-Type': 'application/json', 'X-Klive-Client': 'website', 'X-Klive-Page': location.pathname },
            body: JSON.stringify({ v: 1, nonce, page: location.pathname, env, input }),
        });
        if (r.status === 403 && !retried && !final) {
            nonce = null; // expired or IP changed: one fresh nonce, then give up quietly
            await send(false, true);
        }
    } catch {
        // Best-effort: a failed beacon must never affect the page.
    }
}

export function startOmniDefenceFingerprint() {
    if (started || typeof window === 'undefined' || !fingerprintEnabled()) return;
    started = true;
    trackInput();
    setTimeout(async () => {
        try { env = await collectEnv(); } catch { return; }
        await send();
        setInterval(() => { if (dirty) void send(); }, RESEND_MS);
    }, FIRST_SEND_MS);
    const flush = () => { if (dirty) void send(true); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    window.addEventListener('pagehide', flush);
}
