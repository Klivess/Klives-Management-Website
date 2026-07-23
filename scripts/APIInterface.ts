
import { useCookie } from '#imports';
import Swal from 'sweetalert2';

export { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, RequestPUTFromKliveAPI, RequestBatchFromKliveAPI, VerifyLogin, StartAuthSessionWatch, StopAuthSessionWatch, KMPermissions };
export type { KliveBatchItem };

const KliveAPIUrl = "https://klive.dev";
let authSessionSocket: WebSocket | null = null;
let authSessionReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let authSessionInvalidated = false;
let handlingAuthFailure = false;

enum DeniedRequestReason {
    NoProfile = 0,
    InvalidPassword = 1,
    TooLowClearance = 2,
    IncorrectHTTPMethod = 3,
    ProfileDisabled = 4
}

enum KMPermissions {
    Anybody = 0,
    Guest = 1,
    Manager = 2,
    Associate = 3,
    Admin = 4,
    Klives = 5
}

// When the server rejects our credentials outright (stale/invalid/disabled),
// clear the bad cookie and go to the login page immediately. Returns true when
// the failure was handled (callers should skip alerts/redirect logic to avoid
// a stampede when many parallel requests fail at once).
function HandleAuthFailure(res: Response): boolean {
    if (!process.client || handlingAuthFailure) return handlingAuthFailure;
    const code = res.headers.get('RequestDeniedCode');
    // 0 = NoProfile, 1 = InvalidPassword, 4 = ProfileDisabled.
    // 2 (TooLowClearance) means the login is valid — never clear the cookie for it.
    if (code === '0' || code === '1' || code === '4') {
        handlingAuthFailure = true;
        SetLocalPassword(null);
        StopAuthSessionWatch();
        window.location.replace('/');
        return true;
    }
    return false;
}

async function RequestGETFromKliveAPI(
    query: string,
    redirectToDashboardIfUnauthorized = true,
    alertUserIfUnauthorized = true,
    extraHeaders: Record<string, string> = {},
) {
    let res: Response;
    try {
        res = await fetch(`${KliveAPIUrl}${query}`, {
            method: 'GET',
            mode: 'cors',
            headers: { ...BuildKliveHeaders(), ...extraHeaders },
        });
    } catch (error) {
        console.warn('Klive API GET failed:', query, error);
        return new Response('Klive API request failed or timed out', { status: 504 });
    }

    if (res.status === 401 || res.status === 403) {
        // Unauthorized access, handle accordingly
        console.log("Unauthorized access to API");
        if (HandleAuthFailure(res)) {
            return res;
        }
        if(alertUserIfUnauthorized==true && process.client){
            Swal.fire({
                icon: 'error',
                title: 'Access Denied',
                text: 'You are not authorized to access this resource.',
                confirmButtonColor: '#4d9e39',
                background: '#161516',
                color: '#ffffff',
                customClass: {
                    popup: 'swal-dark-theme'
                }
            });
        }
        if(redirectToDashboardIfUnauthorized==true && process.client){
            window.location.replace('/');
        }
    }
    return res;
}

async function RequestPOSTFromKliveAPI(query: string, content: BodyInit | null = "", redirectToDashboardIfUnauthorized = true, isJson = false) {
    let response;
    const headers = BuildKliveHeaders(isJson);

    try {
        response = await fetch(KliveAPIUrl + query, {
            method: "POST",
            mode: 'cors',
            body: content,
            headers: headers,
        });
    } catch (error) {
        console.warn('Klive API POST failed:', query, error);
        return new Response('Klive API request failed or timed out', { status: 504 });
    }
    if (response.status === 401 || response.status === 403) {
        // Unauthorized access, handle accordingly
        console.log("Unauthorized access to API");
        console.log(response.headers.get('RequestDeniedCode'));

        if (HandleAuthFailure(response)) {
            return response;
        }
        if (response.headers.get('RequestDeniedCode') == "2") {
            if (process.client) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Insufficient Clearance',
                    text: 'Your profile doesnt have enough clearance to do this.',
                    confirmButtonColor: '#4d9e39',
                    background: '#161516',
                    color: '#ffffff',
                    customClass: {
                        popup: 'swal-dark-theme'
                    }
                });
                if (redirectToDashboardIfUnauthorized) {
                    window.location.replace('/dashboard');
                }
            }
        }
    }

    return response;
}

// Streaming uploads use PUT so chunks never pass through the API's buffered JSON
// request path. Keep authentication and denial handling identical to POST.
async function RequestPUTFromKliveAPI(query: string, content: BodyInit, redirectToDashboardIfUnauthorized = true) {
    let response: Response;
    try {
        response = await fetch(KliveAPIUrl + query, {
            method: "PUT",
            mode: 'cors',
            body: content,
            headers: BuildKliveHeaders(false),
        });
    } catch (error) {
        console.warn('Klive API PUT failed:', query, error);
        return new Response('Klive API request failed or timed out', { status: 504 });
    }

    if (response.status === 401 || response.status === 403) {
        if (HandleAuthFailure(response)) return response;
        if (response.headers.get('RequestDeniedCode') === '2' && process.client) {
            await Swal.fire({
                icon: 'warning',
                title: 'Insufficient Clearance',
                text: 'Your profile does not have enough clearance to upload project files.',
                confirmButtonColor: '#4d9e39',
                background: '#161516',
                color: '#ffffff',
            });
            if (redirectToDashboardIfUnauthorized) window.location.replace('/dashboard');
        }
    }
    return response;
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
// per-zone error. Built on RequestPOSTFromKliveAPI so the auth-failure handling
// (stale-cookie logout) applies here too.
async function RequestBatchFromKliveAPI(paths: string[]): Promise<Map<string, KliveBatchItem>> {
    const map = new Map<string, KliveBatchItem>();
    if (!paths || paths.length === 0) return map;

    const body = JSON.stringify(paths.map(p => ({ path: p })));
    const response = await RequestPOSTFromKliveAPI('/batch', body, false, true);
    if (!response.ok) return map;

    try {
        const items = await response.json();
        if (Array.isArray(items)) {
            for (const item of items as KliveBatchItem[]) {
                if (item && typeof item.path === 'string') map.set(item.path, item);
            }
        }
    } catch (error) {
        console.warn('Klive API batch parse failed:', error);
    }
    return map;
}

function GetLocalPassword() {
    try {
        const cook = useCookie('password').value;
        return cook || "";
    } catch (e) {
        if (process.client) {
            const match = document.cookie.match(/(?:^|; )password=([^;]*)/);
            if (match) return decodeURIComponent(match[1]);
        }
        return "";
    }
}

function BuildKliveHeaders(isJson = false) {
    const headers: Record<string, string> = {
        "Authorization": GetLocalPassword(),
        "X-Klive-Client": "website",
    };

    if (process.client) {
        headers["X-Klive-Page"] = window.location.pathname;
    }

    if (isJson) {
        headers["Content-Type"] = "application/json";
    }

    return headers;
}

function SetLocalPassword(password: string | null) {
    try {
        const cookie = useCookie<string | null>('password');
        cookie.value = password;
    } catch (e) {
    }

    if (process.client) {
        if (password) {
            document.cookie = `password=${encodeURIComponent(password)}; path=/`;
        } else {
            document.cookie = 'password=; Max-Age=0; path=/';
        }
    }
}

function IsProtectedRoute(path: string | null | undefined) {
    if (!path || path === '/') return false;
    if (path.startsWith('/shared/')) return false;
    if (path === '/klivechat' || path.startsWith('/klivechat/')) return false;
    return true;
}

async function ReportWebsiteNoProfileAccess(path: string) {
    try {
        await fetch(`${KliveAPIUrl}/KMProfiles/GetAllProfiles?defenceProbe=WebsiteNoProfile&path=${encodeURIComponent(path)}`, {
            method: 'GET',
            mode: 'cors',
            keepalive: true,
            headers: BuildKliveHeaders(),
        });
    } catch {
    }
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

function BuildAuthSessionWatchUrl() {
    const password = GetLocalPassword();
    if (!password) {
        return '';
    }

    const wsBaseUrl = KliveAPIUrl.replace('https', 'wss').replace('http', 'ws');
    return `${wsBaseUrl}/KMProfiles/SessionWatch?authorization=${encodeURIComponent(password)}`;
}

async function HandleSessionInvalidation(state: string) {
    if (!process.client || authSessionInvalidated) {
        return;
    }

    authSessionInvalidated = true;
    StopAuthSessionWatch();
    SetLocalPassword(null);

    let title = 'Session Ended';
    let text = 'Your session is no longer valid.';
    if (state === 'ProfileDisabled') {
        title = 'Profile Disabled';
        text = 'Your profile can no longer log in.';
    } else if (state === 'PasswordChanged') {
        title = 'Password Changed';
        text = 'Your profile password changed, so this session was signed out.';
    } else if (state === 'ProfileNotFound') {
        title = 'Profile Removed';
        text = 'Your profile no longer exists, so this session was signed out.';
    }

    await Swal.fire({
        icon: 'warning',
        title,
        text,
        timer: 1600,
        showConfirmButton: false,
        allowOutsideClick: false,
        background: '#161516',
        color: '#ffffff',
        customClass: {
            popup: 'swal-dark-theme'
        }
    });

    window.location.replace('/');
}

function ScheduleAuthSessionReconnect() {
    if (!process.client || authSessionInvalidated || authSessionReconnectTimer || !IsProtectedRoute(window.location.pathname) || !GetLocalPassword()) {
        return;
    }

    authSessionReconnectTimer = setTimeout(() => {
        authSessionReconnectTimer = null;
        StartAuthSessionWatch(window.location.pathname);
    }, 1500);
}

function StartAuthSessionWatch(path?: string) {
    if (!process.client) {
        return;
    }

    const routePath = path || window.location.pathname;
    if (!IsProtectedRoute(routePath) || !GetLocalPassword()) {
        StopAuthSessionWatch();
        authSessionInvalidated = false;
        return;
    }

    if (authSessionSocket && (authSessionSocket.readyState === WebSocket.OPEN || authSessionSocket.readyState === WebSocket.CONNECTING)) {
        return;
    }

    const socketUrl = BuildAuthSessionWatchUrl();
    if (!socketUrl) {
        return;
    }

    authSessionInvalidated = false;
    ClearAuthSessionReconnectTimer();

    const socket = new WebSocket(socketUrl);
    authSessionSocket = socket;

    socket.onmessage = async (event) => {
        try {
            const payload = JSON.parse(event.data);
            if (payload?.type === 'session-state' && payload.state && payload.state !== 'SessionActive') {
                await HandleSessionInvalidation(payload.state);
            }
        } catch (error) {
            console.error('Failed to parse auth session event:', error);
        }
    };

    socket.onclose = () => {
        if (authSessionSocket === socket) {
            authSessionSocket = null;
        }

        if (!authSessionInvalidated) {
            ScheduleAuthSessionReconnect();
        }
    };
}

async function VerifyLogin() {
    //Only run this if the user is not already on the login page and we're in the browser
    if (!process.client || window.location.pathname == "/") {
        return;
    }
    const currentPath = window.location.pathname;
    if (IsProtectedRoute(currentPath) && !GetLocalPassword()) {
        await ReportWebsiteNoProfileAccess(currentPath);
        window.location.replace('/');
        return;
    }
    const response = await RequestGETFromKliveAPI("/KMProfiles/LoginStatus", false, false);
    const text = await response.text();

    if (text == "ProfileDisabled") {
        await HandleSessionInvalidation('ProfileDisabled');
    }
    else if (text == "ProfileNotFound") {
        await HandleSessionInvalidation('ProfileNotFound');
    }
}

