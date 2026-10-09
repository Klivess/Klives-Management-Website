import { reactive } from 'vue';

/**
 * Client-wide access state that lives outside any component, so the plain API helpers in
 * APIInterface.ts can report into it from anywhere (including code that runs outside a Nuxt
 * context). Components read it reactively: the toast host shows denials, the profile
 * composable refreshes when the server says access changed.
 *
 * Contract with the server (KliveAPI gate):
 *   401 = not signed in any more   → the site signs out
 *   403 = signed in, not allowed   → body names the missing permission; nothing redirects
 */

export type DenyReason = 'MissingPermission' | 'Suspended' | 'ReadOnly' | 'ProfileDisabled' | string;

export interface DeniedPermission {
    key: string;
    title: string;
    description?: string;
    service?: string;
    area?: string;
    tier?: string;
    tierValue?: number;
}

export interface AccessDenial {
    id: number;
    at: number;
    route: string;
    method: string;
    reason: DenyReason;
    message: string;
    permission: DeniedPermission | null;
    suspendedUntil: string | null;
    suspensionReason: string | null;
}

export interface AccessToast {
    id: number;
    at: number;
    tone: 'denied' | 'locked' | 'info' | 'error';
    title: string;
    detail: string;
    /** Every denial folded into this toast (same reason, shown together). */
    count: number;
    permissions: DeniedPermission[];
    reason: DenyReason;
}

const MAX_DENIALS = 60;
const TOAST_LIFETIME_MS = 7_000;
/** The same permission is announced at most once per page visit (and at most this often). */
const REPEAT_WINDOW_MS = 10 * 60_000;

let nextId = 1;
const lastAnnounced = new Map<string, number>();
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();

export const accessState = reactive({
    denials: [] as AccessDenial[],
    toasts: [] as AccessToast[],
    /** Bumped whenever the server pushes `access-changed` (or a denial implies stale access). */
    liveVersion: 0,
    /** Last server-reported access version for this profile (from the live channel). */
    serverAccessVersion: null as number | null,
    /** Set while the site is signing out, so parallel failures don't stampede. */
    signingOut: false,
});

/** Parses a gate denial body. Returns null for anything that isn't the gate's JSON contract. */
export function parseDenialBody(body: unknown, fallbackRoute = '', method = 'GET'): AccessDenial | null {
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, any>;
    if (b.error !== 'AccessDenied' && b.error !== 'Unauthorized') return null;
    const p = b.permission && typeof b.permission === 'object' ? b.permission : null;
    return {
        id: 0,
        at: Date.now(),
        route: String(b.route ?? fallbackRoute ?? ''),
        method,
        reason: String(b.reason ?? 'MissingPermission'),
        message: String(b.message ?? ''),
        permission: p ? {
            key: String(p.key ?? ''),
            title: String(p.title ?? p.key ?? ''),
            description: p.description ?? undefined,
            service: p.service ?? undefined,
            area: p.area ?? undefined,
            tier: p.tier ?? undefined,
            tierValue: typeof p.tierValue === 'number' ? p.tierValue : undefined,
        } : null,
        suspendedUntil: b.suspendedUntil ?? null,
        suspensionReason: b.suspensionReason ?? null,
    };
}

/**
 * Records a denial. `announce` shows (or folds into) a toast; callers that render their own
 * inline locked state pass false.
 */
export function recordDenial(denial: AccessDenial, announce = true) {
    if (!import.meta.client) return;
    denial.id = nextId++;
    denial.at = Date.now();
    accessState.denials.unshift(denial);
    if (accessState.denials.length > MAX_DENIALS) accessState.denials.length = MAX_DENIALS;

    // Suspension and read-only are profile-wide facts: the overlay/banner explain them, and the
    // profile must be re-read so they appear (they may have changed since the page loaded).
    if (denial.reason === 'Suspended' || denial.reason === 'ReadOnly') {
        accessState.liveVersion++;
    }
    if (!announce) return;

    const dedupeKey = `${denial.reason}:${denial.permission?.key ?? denial.route}`;
    const now = Date.now();
    const last = lastAnnounced.get(dedupeKey);
    if (last != null && now - last < REPEAT_WINDOW_MS) return;
    lastAnnounced.set(dedupeKey, now);

    if (denial.reason === 'Suspended') return; // the suspension overlay says it all

    if (denial.reason === 'ReadOnly') {
        pushToast({
            tone: 'locked',
            title: 'Your profile is read-only',
            detail: denial.permission ? `“${denial.permission.title}” changes things, so it is blocked for now.` : 'You can look around, but changes are blocked.',
            reason: denial.reason,
            permissions: denial.permission ? [denial.permission] : [],
        });
        return;
    }

    // Fold missing-permission denials that land together (a page firing several requests)
    // into one toast instead of a stack.
    const open = accessState.toasts.find(t => t.reason === 'MissingPermission' && now - t.at < 2_500);
    if (open && denial.permission) {
        if (!open.permissions.some(p => p.key === denial.permission!.key)) open.permissions.push(denial.permission);
        open.count++;
        open.title = `${open.permissions.length} permissions missing`;
        open.detail = open.permissions.map(p => p.title).join(' · ');
        restartToastTimer(open.id);
        return;
    }

    pushToast({
        tone: 'denied',
        title: denial.permission ? `Missing permission: ${denial.permission.title}` : 'Not allowed',
        detail: denial.permission
            ? [denial.permission.service, denial.permission.tier].filter(Boolean).join(' · ') || denial.permission.key
            : denial.message || 'Your profile cannot do this.',
        reason: denial.reason,
        permissions: denial.permission ? [denial.permission] : [],
    });
}

export function pushToast(toast: Omit<AccessToast, 'id' | 'at' | 'count'> & { count?: number }, lifetimeMs = TOAST_LIFETIME_MS) {
    if (!import.meta.client) return;
    const entry: AccessToast = { id: nextId++, at: Date.now(), count: toast.count ?? 1, ...toast };
    accessState.toasts.push(entry);
    if (accessState.toasts.length > 4) dismissToast(accessState.toasts[0].id);
    restartToastTimer(entry.id, lifetimeMs);
    return entry.id;
}

function restartToastTimer(id: number, lifetimeMs = TOAST_LIFETIME_MS) {
    const existing = toastTimers.get(id);
    if (existing) clearTimeout(existing);
    toastTimers.set(id, setTimeout(() => dismissToast(id), lifetimeMs));
}

export function dismissToast(id: number) {
    const timer = toastTimers.get(id);
    if (timer) clearTimeout(timer);
    toastTimers.delete(id);
    const index = accessState.toasts.findIndex(t => t.id === id);
    if (index >= 0) accessState.toasts.splice(index, 1);
}

/** Pause auto-dismiss while the pointer is over a toast. */
export function holdToast(id: number) {
    const timer = toastTimers.get(id);
    if (timer) clearTimeout(timer);
    toastTimers.delete(id);
}

export function releaseToast(id: number) {
    if (accessState.toasts.some(t => t.id === id)) restartToastTimer(id, 3_000);
}

/** A new page: denials already explained on the last page may be explained again here. */
export function noteNavigation() {
    lastAnnounced.clear();
}

/** The server said this profile's access changed: everything access-derived must re-read. */
export function noteAccessChanged(version?: number | null) {
    if (typeof version === 'number') accessState.serverAccessVersion = version;
    accessState.liveVersion++;
}

/** Most recent denial for a route (exact path match, ignoring the query). */
export function lastDenialFor(path: string): AccessDenial | undefined {
    const bare = path.split('?')[0];
    return accessState.denials.find(d => d.route.split('?')[0].toLowerCase() === bare.toLowerCase());
}

export function resetAccessState() {
    accessState.denials.splice(0);
    for (const t of [...accessState.toasts]) dismissToast(t.id);
    accessState.serverAccessVersion = null;
    lastAnnounced.clear();
}
