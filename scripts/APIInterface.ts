
import { useCookie } from '#imports';
import { accessState, parseDenialBody, recordDenial, noteAccessChanged, resetAccessState, type AccessDenial } from '~/scripts/accessState';

export {
    KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, RequestPUTFromKliveAPI, RequestBatchFromKliveAPI,
    PostTelemetryBeacon, VerifyLogin, StartAuthSessionWatch, StopAuthSessionWatch, SendPresence,
    GetAuthToken, HasAuth, IsSessionToken, AuthorizationHeaderValue, BuildKliveHeaders, KliveWsBase, BuildKliveWsUrl,
    LoginWithPassword, ExchangeLegacyCredential, SignOut, ConsumeSignOutNotice, IsProtectedRoute, IsLegacyServer,
    ReportXhrAccess,
};
export type { KliveBatchItem, LoginResult, SignOutNotice };

const KliveAPIUrl = "https://klive.dev";

/*
 * Signing in
 * ----------
 * Signing in exchanges the password for a revocable session token (`kms_…`), kept in the
 * `km_session` cookie and sent as `Authorization: Bearer <token>` (or `?authorization=<token>`
 * on WebSockets, which can't carry headers). The password itself is never stored.
 *
 * Browsers signed in by the previous site still hold the password in the `password` cookie.
 * That keeps working as a credential, and is traded for a session token the first time the
 * new site runs (ExchangeLegacyCredential). Against a server from before sessions, the old
 * password flow is used unchanged, so the deploy order of site and server doesn't matter.
 *
 * Access contract (KliveAPI gate)
 * -------------------------------
 *   401 + RequestDeniedCode 0/1/4/5/6  → not signed in any more: sign out, say why
 *   403 (or old server: 401 + code 2)   → signed in but not allowed: recorded + one toast,
 *                                          the caller gets the response and renders it
 *   503 {error:"Starting"}              → the server is restarting: GETs retry quietly
 */

const SESSION_COOKIE = 'km_session';
const LEGACY_PASSWORD_COOKIE = 'password';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SIGN_OUT_NOTICE_KEY = 'km:signout';
const SESSION_TOKEN_PREFIX = 'kms_';

/** RequestDeniedCode values that mean "this credential no longer signs anyone in". */
const SIGN_OUT_CODES = new Set([0, 1, 4, 5, 6]);
const SIGN_OUT_STATE_BY_CODE: Record<number, string> = {
    0: 'SignedOut', 1: 'InvalidCredential', 4: 'ProfileDisabled', 5: 'SessionRevoked', 6: 'SessionExpired',
};

let legacyServer = false;

// ───────────────────────────── credentials ─────────────────────────────

function readCookie(name: string): string {
    if (import.meta.client) {
        const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
        if (!match) return '';
        let value = match[1];
        try { value = decodeURIComponent(value); } catch { /* keep the raw value */ }
        return value === 'undefined' || value === 'null' ? '' : value;
    }
    try {
        const value = useCookie<string | null>(name).value;
        return value && value !== 'undefined' && value !== 'null' ? String(value) : '';
    } catch {
        return '';
    }
}

function writeCookie(name: string, value: string | null) {
    if (import.meta.client) {
        const secure = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = value
            ? `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax${secure}`
            : `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
        return;
    }
    try {
        useCookie<string | null>(name, { path: '/', sameSite: 'lax', maxAge: value ? SESSION_MAX_AGE_SECONDS : 0 }).value = value;
    } catch {
        // Outside a Nuxt context on the server: nothing to write to.
    }
}

function IsSessionToken(value: string | null | undefined): boolean {
    return !!value && value.startsWith(SESSION_TOKEN_PREFIX);
}

/** The credential this browser signs requests with: its session token, or (old sign-ins) the password. */
function GetAuthToken(): string {
    return readCookie(SESSION_COOKIE) || readCookie(LEGACY_PASSWORD_COOKIE);
}

function HasAuth(): boolean {
    return GetAuthToken() !== '';
}

function AuthorizationHeaderValue(): string {
    const credential = GetAuthToken();
    if (!credential) return '';
    return IsSessionToken(credential) ? `Bearer ${credential}` : credential;
}

function SetSessionToken(token: string) {
    writeCookie(SESSION_COOKIE, token);
    // The password never needs to sit in a cookie again.
    writeCookie(LEGACY_PASSWORD_COOKIE, null);
}

function ClearAuth() {
    writeCookie(SESSION_COOKIE, null);
    writeCookie(LEGACY_PASSWORD_COOKIE, null);
}

/** True once the server has shown it predates sessions (no /KMProfiles/Login). */
function IsLegacyServer() {
    return legacyServer;
}

function BuildKliveHeaders(isJson = false): Record<string, string> {
    const headers: Record<string, string> = { "X-Klive-Client": "website" };
    const authorization = AuthorizationHeaderValue();
    if (authorization) headers["Authorization"] = authorization;
    if (import.meta.client) headers["X-Klive-Page"] = window.location.pathname;
    if (isJson) headers["Content-Type"] = "application/json";
    return headers;
}

function KliveWsBase(): string {
    return KliveAPIUrl.replace(/^http/i, 'ws');
}

/**
 * A WebSocket URL on the Klive API carrying this browser's credential. Browsers can't set
 * headers on a WebSocket, so the session token rides in `?authorization=` (it is revocable,
 * unlike the password it replaced).
 */
function BuildKliveWsUrl(path: string, params: Record<string, string | number | boolean | null | undefined> = {}): string {
    const url = new URL(path, KliveWsBase());
    for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
    const credential = GetAuthToken();
    if (credential) url.searchParams.set('authorization', credential);
    return url.toString();
}

// ───────────────────────────── signing in and out ─────────────────────────────

interface LoginResult {
    kind: 'ok' | 'legacy-ok' | 'rejected' | 'disabled' | 'throttled' | 'starting' | 'legacy-server' | 'error';
    message?: string;
    retryAfterSeconds?: number;
    me?: any;
}

async function readJsonSafely(res: Response): Promise<any> {
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('json')) return null;
    try { return await res.clone().json(); } catch { return null; }
}

/**
 * Signs in with a password. On success the session token is stored and `me` (the profile) is
 * returned. `allowLegacy` falls back to the previous server's password-cookie login when the
 * server has no /KMProfiles/Login yet.
 */
async function LoginWithPassword(password: string, options: { allowLegacy?: boolean } = {}): Promise<LoginResult> {
    let res: Response;
    try {
        res = await fetch(`${KliveAPIUrl}/KMProfiles/Login`, {
            method: 'POST',
            mode: 'cors',
            headers: { 'X-Klive-Client': 'website', 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
        });
    } catch {
        return { kind: 'error', message: "Couldn't reach Klives Management." };
    }

    const body = await readJsonSafely(res);
    if (res.ok && body && IsSessionToken(body.token)) {
        legacyServer = false;
        SetSessionToken(body.token);
        return { kind: 'ok', me: body.me };
    }
    if (res.status === 429) {
        const header = Number(res.headers.get('Retry-After'));
        return { kind: 'throttled', message: body?.error, retryAfterSeconds: body?.retryAfterSeconds ?? (header > 0 ? header : 30) };
    }
    if (res.status === 503) return { kind: 'starting', message: body?.error ?? 'Klives Management is starting up.' };
    if (res.status === 401) return { kind: body?.reason === 'ProfileDisabled' ? 'disabled' : 'rejected', message: body?.error };
    if (res.status === 400) return { kind: 'rejected', message: body?.error };
    if (res.status >= 500) return { kind: 'error', message: body?.error ?? `The server answered ${res.status}.` };

    // A 404, or a 200 without a token: a server from before sessions.
    legacyServer = true;
    if (!options.allowLegacy) return { kind: 'legacy-server' };
    return LegacyLogin(password);
}

async function LegacyLogin(password: string): Promise<LoginResult> {
    let res: Response;
    try {
        res = await fetch(`${KliveAPIUrl}/KMProfiles/AttemptLogin`, {
            method: 'POST',
            mode: 'cors',
            headers: { 'X-Klive-Client': 'website' },
            body: JSON.stringify(password),
        });
    } catch {
        return { kind: 'error', message: "Couldn't reach Klives Management." };
    }
    let text = '';
    try { text = (await res.text()).trim().replace(/^"|"$/g, ''); } catch { /* treated as a refusal */ }
    if (res.ok && text === 'true') {
        writeCookie(LEGACY_PASSWORD_COOKIE, password);
        return { kind: 'legacy-ok' };
    }
    if (text === 'LoginDisabled') return { kind: 'disabled' };
    if (res.status === 429) return { kind: 'throttled', retryAfterSeconds: 30 };
    return { kind: 'rejected' };
}

let exchangeInFlight: Promise<'exchanged' | 'kept' | 'rejected' | 'none'> | null = null;

/**
 * A browser signed in by the previous site holds the password in a cookie. Trade it for a
 * session token once (then delete it). Against an old server the password simply stays.
 */
function ExchangeLegacyCredential(): Promise<'exchanged' | 'kept' | 'rejected' | 'none'> {
    if (!import.meta.client || readCookie(SESSION_COOKIE)) return Promise.resolve('none');
    const password = readCookie(LEGACY_PASSWORD_COOKIE);
    if (!password) return Promise.resolve('none');
    if (legacyServer) return Promise.resolve('kept');

    exchangeInFlight ??= (async () => {
        const result = await LoginWithPassword(password);
        if (result.kind === 'ok') return 'exchanged' as const;
        if (result.kind === 'rejected' || result.kind === 'disabled') {
            // The stored password no longer signs anyone in: same as a 401 on any request.
            SignOut({ state: result.kind === 'disabled' ? 'ProfileDisabled' : 'InvalidCredential' });
            return 'rejected' as const;
        }
        return 'kept' as const; // old server, throttled, restarting or offline: keep using it
    })().finally(() => { exchangeInFlight = null; });
    return exchangeInFlight;
}

interface SignOutNotice {
    state: string;
    message?: string | null;
    at: number;
}

/**
 * Ends this browser's sign-in and goes to the login page. `notice` explains why on the login
 * page ("Klives signed you out", "Your session expired"). `serverLogout` also ends the
 * session server-side (a voluntary sign-out).
 */
function SignOut(notice: { state: string; message?: string | null } | null = null, options: { redirect?: boolean; serverLogout?: boolean } = {}) {
    if (!import.meta.client) {
        ClearAuth();
        return;
    }
    if (accessState.signingOut) return;
    accessState.signingOut = true;

    if (options.serverLogout && IsSessionToken(GetAuthToken())) {
        // Built before the cookie is cleared; keepalive lets it land while the page navigates.
        fetch(`${KliveAPIUrl}/KMProfiles/Logout`, {
            method: 'POST', mode: 'cors', keepalive: true, headers: BuildKliveHeaders(true), body: '{}',
        }).catch(() => { /* the session expires on its own */ });
    }

    StopAuthSessionWatch();
    ClearAuth();
    resetAccessState();
    if (notice) {
        try { sessionStorage.setItem(SIGN_OUT_NOTICE_KEY, JSON.stringify({ ...notice, at: Date.now() })); } catch { /* storage blocked */ }
    }

    // On a public page (the sign-in page, a shared link, a chat room) there is nowhere to send
    // the visitor: forgetting the credential is the whole sign-out.
    if (options.redirect === false || (!IsProtectedRoute(window.location.pathname) && !options.serverLogout)) {
        accessState.signingOut = false;
        return;
    }
    const params = new URLSearchParams();
    if (notice?.state) params.set('signedOut', notice.state);
    const path = window.location.pathname;
    if (IsProtectedRoute(path)) params.set('next', path + window.location.search);
    const query = params.toString();
    // A full load: every bit of the previous profile's state goes with it.
    window.location.replace(query ? `/?${query}` : '/');
}

/** The reason the last sign-out happened, once (the login page shows it). */
function ConsumeSignOutNotice(): SignOutNotice | null {
    if (!import.meta.client) return null;
    try {
        const raw = sessionStorage.getItem(SIGN_OUT_NOTICE_KEY);
        if (!raw) return null;
        sessionStorage.removeItem(SIGN_OUT_NOTICE_KEY);
        const parsed = JSON.parse(raw) as SignOutNotice;
        return Date.now() - parsed.at < 5 * 60_000 ? parsed : null;
    } catch {
        return null;
    }
}

function IsProtectedRoute(path: string | null | undefined) {
    if (!path || path === '/') return false;
    if (path.startsWith('/shared/')) return false;
    if (path === '/klivechat' || path.startsWith('/klivechat/')) return false;
    return true;
}

// ───────────────────────────── requests ─────────────────────────────

/** Applies the access contract to a response. Never throws, never redirects for a 403. */
async function HandleAccessResponse(res: Response, route: string, method: string, credentialUsed: string): Promise<void> {
    if (!import.meta.client || (res.status !== 401 && res.status !== 403)) return;
    const header = res.headers.get('RequestDeniedCode');
    const body = await readJsonSafely(res);
    const fromGate = body && (body.error === 'AccessDenied' || body.error === 'Unauthorized') && typeof body.reason === 'string';
    const code = header !== null && header !== '' ? Number(header) : typeof body?.code === 'number' ? body.code : NaN;
    // A handler's own 401/403 ("your current password is wrong"): the caller explains it.
    if (Number.isNaN(code) && !fromGate) return;

    if (res.status === 401 && SIGN_OUT_CODES.has(code)) {
        // Sent without a credential: there is nothing to sign out of (a protected page sends
        // such a visitor to the login page through the route middleware instead).
        if (!credentialUsed) return;
        // A request sent with an older credential (signed in again since) proves nothing.
        if (credentialUsed !== GetAuthToken()) return;
        SignOut({ state: body?.reason ?? SIGN_OUT_STATE_BY_CODE[code], message: body?.message });
        return;
    }

    // 403 — or the previous server's 401 "TooLowClearance" (code 2): signed in, not allowed.
    recordDenial(parseDenialBody(body, route, method) ?? LegacyDenial(route, method, code), true);
}

/**
 * XHR uploads (fetch has no upload progress) answer through the same contract: a 401 signs
 * out, a 403 is explained once. Call it from the XHR's onload.
 */
function ReportXhrAccess(xhr: XMLHttpRequest, route: string, method = 'POST') {
    if (xhr.status !== 401 && xhr.status !== 403) return;
    const headers = new Headers();
    const type = xhr.getResponseHeader('content-type');
    const code = xhr.getResponseHeader('RequestDeniedCode');
    if (type) headers.set('content-type', type);
    if (code) headers.set('RequestDeniedCode', code);
    void HandleAccessResponse(new Response(xhr.responseText, { status: xhr.status, headers }), route, method, GetAuthToken());
}

function LegacyDenial(route: string, method: string, code: number): AccessDenial {
    return {
        id: 0,
        at: Date.now(),
        route,
        method,
        reason: code === 7 ? 'Suspended' : code === 8 ? 'ReadOnly' : 'MissingPermission',
        message: '',
        permission: null,
        suspendedUntil: null,
        suspensionReason: null,
    };
}

function Sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
    return new Promise(resolve => {
        if (signal?.aborted) return resolve(false);
        const timer = setTimeout(() => resolve(true), ms);
        signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(false); }, { once: true });
    });
}

async function IsStartingUp(res: Response): Promise<boolean> {
    if (res.status !== 503) return false;
    const body = await readJsonSafely(res);
    return body?.error === 'Starting';
}

async function SendToKliveAPI(
    method: 'GET' | 'POST' | 'PUT',
    query: string,
    init: { body?: BodyInit | null; headers?: Record<string, string>; signal?: AbortSignal; isJson?: boolean },
): Promise<Response> {
    const credentialUsed = GetAuthToken();
    const headers = { ...BuildKliveHeaders(init.isJson ?? false), ...(init.headers ?? {}) };
    // Only idempotent reads are retried while the server restarts.
    let retriesLeft = method === 'GET' ? 3 : 0;
    while (true) {
        let res: Response;
        try {
            res = await fetch(`${KliveAPIUrl}${query}`, {
                method,
                mode: 'cors',
                body: method === 'GET' ? undefined : init.body,
                headers,
                signal: init.signal,
            });
        } catch (error) {
            console.warn(`Klive API ${method} failed:`, query, error);
            return new Response('Klive API request failed or timed out', { status: 504 });
        }

        if (retriesLeft > 0 && await IsStartingUp(res)) {
            retriesLeft--;
            const after = Number(res.headers.get('Retry-After'));
            if (await Sleep((after > 0 && after <= 10 ? after : 2) * 1000, init.signal)) continue;
            return res;
        }

        await HandleAccessResponse(res, query, method, credentialUsed);
        return res;
    }
}

/**
 * GET from the Klive API. The two flag parameters are kept for existing callers but no longer
 * redirect or pop dialogs: a denial is recorded, explained once in a toast, and returned.
 */
async function RequestGETFromKliveAPI(
    query: string,
    _redirectToDashboardIfUnauthorized = true,
    _alertUserIfUnauthorized = true,
    extraHeaders: Record<string, string> = {},
    signal?: AbortSignal,
) {
    return SendToKliveAPI('GET', query, { headers: extraHeaders, signal });
}

async function RequestPOSTFromKliveAPI(query: string, content: BodyInit | null = "", _redirectToDashboardIfUnauthorized = true, isJson = false, signal?: AbortSignal) {
    return SendToKliveAPI('POST', query, { body: content, isJson, signal });
}

// Streaming uploads use PUT so chunks never pass through the API's buffered JSON
// request path. Authentication and denial handling are identical to POST.
async function RequestPUTFromKliveAPI(query: string, content: BodyInit, _redirectToDashboardIfUnauthorized = true) {
    return SendToKliveAPI('PUT', query, { body: content });
}

interface KliveBatchItem {
    path: string;
    status: number;
    ok: boolean;
    contentType: string;
    body: any;
}

// Fetches many GET routes in one request. Returns a Map keyed by the exact path
// string that was requested, so callers can look up each result by path. On a
// transport failure the Map is empty and callers treat missing keys as a
// per-zone error. Each item is held to the same access contract as a direct GET.
async function RequestBatchFromKliveAPI(paths: string[], signal?: AbortSignal): Promise<Map<string, KliveBatchItem>> {
    const map = new Map<string, KliveBatchItem>();
    if (!paths || paths.length === 0) return map;

    const body = JSON.stringify(paths.map(p => ({ path: p })));
    const response = await RequestPOSTFromKliveAPI('/batch', body, false, true, signal);
    if (!response.ok) return map;

    try {
        const items = await response.json();
        if (Array.isArray(items)) {
            for (const item of items as KliveBatchItem[]) {
                if (!item || typeof item.path !== 'string') continue;
                map.set(item.path, item);
                if (item.status === 403) {
                    const denial = parseDenialBody(item.body, item.path, 'GET');
                    if (denial) recordDenial(denial, true);
                }
            }
        }
    } catch (error) {
        console.warn('Klive API batch parse failed:', error);
    }
    return map;
}

// Fire-and-forget telemetry report. Deliberately bypasses the access handling
// above: a beacon must never sign anyone out or raise a toast. keepalive lets it
// complete while the page unloads (sendBeacon can't carry the Authorization header).
async function PostTelemetryBeacon(body: string) {
    if (!import.meta.client || !HasAuth()) return;
    try {
        await fetch(`${KliveAPIUrl}/KliveAPI/telemetry/rum`, {
            method: 'POST',
            mode: 'cors',
            keepalive: true,
            body,
            headers: BuildKliveHeaders(true),
        });
    } catch {
        // Telemetry is best-effort.
    }
}

// ───────────────────────────── live session channel ─────────────────────────────
//
// Every tab keeps /KMProfiles/SessionWatch open. The server pushes sign-outs (revoked,
// expired, disabled, password changed, profile deleted) and access changes the moment they
// happen; the tab reports which page it is on (presence), which Klives sees live.

let authSessionSocket: WebSocket | null = null;
let authSessionReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let authSessionBackoffMs = 1_500;
let authSessionEnded = false;

function ReportWebsiteNoProfileAccess(path: string) {
    // Recorded by OmniDefence as a website visit without a profile.
    fetch(`${KliveAPIUrl}/KMProfiles/me?defenceProbe=WebsiteNoProfile&path=${encodeURIComponent(path)}`, {
        method: 'GET',
        mode: 'cors',
        keepalive: true,
        headers: BuildKliveHeaders(),
    }).catch(() => { /* best-effort */ });
}

function ClearAuthSessionReconnectTimer() {
    if (authSessionReconnectTimer) {
        clearTimeout(authSessionReconnectTimer);
        authSessionReconnectTimer = null;
    }
}

function StopAuthSessionWatch() {
    ClearAuthSessionReconnectTimer();
    if (authSessionSocket) {
        const socket = authSessionSocket;
        authSessionSocket = null;
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close(1000, 'client-stop');
        }
    }
}

/** Tells the server which page this tab shows (Klives' live view of who is where). */
function SendPresence(path?: string, title?: string) {
    if (!import.meta.client || !authSessionSocket || authSessionSocket.readyState !== WebSocket.OPEN) return;
    try {
        authSessionSocket.send(JSON.stringify({
            type: 'presence',
            path: path ?? window.location.pathname,
            title: title ?? document.title,
            visible: document.visibilityState === 'visible',
        }));
    } catch {
        // The socket is closing; the reconnect sends a fresh frame.
    }
}

function ScheduleAuthSessionReconnect() {
    if (!import.meta.client || authSessionEnded || authSessionReconnectTimer) return;
    if (!IsProtectedRoute(window.location.pathname) || !HasAuth()) return;
    const delay = authSessionBackoffMs;
    authSessionBackoffMs = Math.min(authSessionBackoffMs * 2, 30_000);
    authSessionReconnectTimer = setTimeout(() => {
        authSessionReconnectTimer = null;
        StartAuthSessionWatch(window.location.pathname);
    }, delay);
}

function StartAuthSessionWatch(path?: string) {
    if (!import.meta.client) return;

    const routePath = path || window.location.pathname;
    if (!IsProtectedRoute(routePath) || !HasAuth()) {
        StopAuthSessionWatch();
        return;
    }
    if (authSessionSocket && (authSessionSocket.readyState === WebSocket.OPEN || authSessionSocket.readyState === WebSocket.CONNECTING)) {
        return;
    }

    authSessionEnded = false;
    ClearAuthSessionReconnectTimer();

    const socket = new WebSocket(BuildKliveWsUrl('/KMProfiles/SessionWatch'));
    authSessionSocket = socket;

    socket.onopen = () => {
        authSessionBackoffMs = 1_500;
        SendPresence();
    };

    socket.onmessage = (event) => {
        let payload: any;
        try { payload = JSON.parse(event.data); } catch { return; }
        if (!payload || typeof payload !== 'object') return;

        if (payload.type === 'session-state' && payload.state && payload.state !== 'SessionActive') {
            authSessionEnded = true;
            SignOut({ state: String(payload.state), message: payload.reason ?? null });
            return;
        }
        if (payload.type === 'hello' && typeof payload.accessVersion === 'number') {
            // AuthenticationManager compares it with the loaded profile: a change made while this
            // tab was disconnected is picked up here.
            accessState.serverAccessVersion = payload.accessVersion;
            return;
        }
        if (payload.type === 'access-changed') {
            noteAccessChanged(typeof payload.version === 'number' ? payload.version : null);
        }
    };

    socket.onclose = () => {
        if (authSessionSocket === socket) authSessionSocket = null;
        if (!authSessionEnded) ScheduleAuthSessionReconnect();
    };
}

/**
 * On a protected page without any credential: record the visit and go to the login page.
 * A credential that exists but no longer works is caught by the first 401 instead.
 */
async function VerifyLogin(path?: string): Promise<boolean> {
    if (!import.meta.client) return true;
    const currentPath = path ?? window.location.pathname;
    if (!IsProtectedRoute(currentPath) || HasAuth()) return true;
    ReportWebsiteNoProfileAccess(currentPath);
    return false;
}
