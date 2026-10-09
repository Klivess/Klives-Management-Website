import { BuildKliveWsUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import type { MeProfile } from '~/composables/useCurrentProfile';

/*
 * Typed client for /KMProfiles/* — the profile console, /account and the access components.
 * Every payload is camelCase (see KMProfileManager.Routes.cs).
 */

export type PermissionTierName = 'Glance' | 'Read' | 'Act' | 'Manage' | 'Critical';
export type ProfileRankName = 'Guest' | 'Manager' | 'Associate' | 'Admin' | 'Klives';

export interface CatalogRoute { path: string; method: string | null; kind: string }

export interface CatalogPermission {
    key: string;
    area: string;
    tier: PermissionTierName;
    tierValue: number;
    title: string;
    description: string;
    sensitive: boolean;
    implies: string[];
    ownerGrantOnly: boolean;
    legacyRank: string;
    /** Only present for someone who may view permissions. */
    routes: CatalogRoute[] | null;
}

export interface CatalogService { key: string; name: string; permissions: CatalogPermission[] }

export interface PermissionCatalogPayload {
    version: number;
    tiers: { value: number; name: PermissionTierName; description: string }[];
    services: CatalogService[];
    publicRoutes: CatalogRoute[] | null;
    signedInRoutes: CatalogRoute[] | null;
}

export interface PresenceTab {
    connectionId: string;
    sessionId: string | null;
    path: string | null;
    title: string | null;
    visible: boolean;
    ip: string | null;
    device: string | null;
    connectedUtc: string;
    lastHeartbeatUtc: string;
}

export interface PresenceSummary {
    state: 'online' | 'idle' | 'offline';
    connections: number;
    currentPath: string | null;
    currentTitle: string | null;
    onPageSinceUtc: string | null;
    lastHeartbeatUtc: string | null;
    tabs?: PresenceTab[];
}

export interface ProfileGrant {
    key: string;
    title: string;
    service: string | null;
    tier: PermissionTierName | null;
    known: boolean;
    active: boolean;
    grantedUtc: string;
    grantedById: string | null;
    grantedByName: string | null;
    expiresUtc: string | null;
    note: string | null;
}

export interface ProfileRow {
    userId: string;
    name: string;
    rank: ProfileRankName;
    rankValue: number;
    isOwner: boolean;
    canLogin: boolean;
    readOnly: boolean;
    suspended: boolean;
    suspendedUntilUtc: string | null;
    suspensionReason: string | null;
    discordId: string | null;
    createdUtc: string | null;
    createdById: string | null;
    lastLoginUtc: string | null;
    lastSeenUtc: string | null;
    allowPasswordApiAccess: boolean;
    accessVersion: number;
    grantCount: number;
    temporaryGrantCount: number;
    sessions: number;
    requests24h: number;
    denied24h: number;
    presence: PresenceSummary;
    manageable: boolean;
    isYou: boolean;
    /** Detailed rows only (someone who may view permissions, or yourself). */
    grants?: ProfileGrant[];
    effective?: string[];
}

export interface ProfileListPayload {
    profiles: ProfileRow[];
    assignableRanks: ProfileRankName[];
    acceptPasswordAsBearer: boolean;
}

export interface SessionRow {
    sessionId: string;
    kind: 'Browser' | 'Internal' | string;
    label: string | null;
    userAgent: string | null;
    ip: string | null;
    createdUtc: string;
    lastSeenUtc: string;
    expiresUtc: string;
    active: boolean;
    revokedUtc: string | null;
    revokeReason: string | null;
    current: boolean;
    online: boolean;
    tabs: { path: string | null; title: string | null; visible: boolean; lastHeartbeatUtc: string }[];
}

export interface TimelineItem {
    type: 'request' | 'page' | 'event';
    tsMs: number;
    kind?: string | null;
    method?: string | null;
    route?: string | null;
    permKey?: string | null;
    service?: string | null;
    status?: number | null;
    durationMs?: number | null;
    ip?: string | null;
    page?: string | null;
    title?: string | null;
    dwellMs?: number | null;
    denyReason?: string | null;
    viaBatch?: boolean;
    actorId?: string | null;
    actorName?: string | null;
    detailJson?: string | null;
    sessionId?: string | null;
}

export interface KeyCount { key: string; count: number; denied: number; lastMs: number }
export interface IpUse { ip: string; count: number; firstMs: number; lastMs: number }

export interface ActivitySummary {
    fromMs: number;
    toMs: number;
    bucketMs: number;
    services: string[];
    buckets: { t: number; byService: Record<string, number>; denied: number }[];
    requests: number;
    denied: number;
    errors: number;
    distinctRoutes: number;
    pageViews: number;
    activeDays: number;
    topPermissions: KeyCount[];
    topPages: KeyCount[];
    ips: IpUse[];
    recentDenials: TimelineItem[];
    logins: TimelineItem[];
}

export interface PermissionUsageRow {
    key: string;
    title: string;
    service: string;
    tier: PermissionTierName;
    held: boolean;
    count: number;
    denied: number;
    lastUsedMs: number | null;
}

export interface PermissionUsagePayload { permissions: PermissionUsageRow[]; unusedFor30Days: string[] }

export interface GrantInput { key: string; expiresUtc?: string | null; note?: string | null }

/** A grant being edited in the console (what `permissions/set` receives). */
export interface GrantDraft { key: string; expiresUtc: string | null; note: string | null }

/** A failed profile API call, carrying the server's own explanation. */
export class ProfilesApiError extends Error {
    constructor(message: string, readonly status: number, readonly body: any) {
        super(message);
    }
    /** Signed in but not allowed (the access contract's 403). */
    get denied() { return this.status === 403 && this.body?.error === 'AccessDenied'; }
}

async function unwrap<T>(response: Response): Promise<T> {
    let body: any = null;
    const text = await response.text().catch(() => '');
    if (text) {
        try { body = JSON.parse(text); } catch { body = text; }
    }
    if (!response.ok) {
        const message = (body && typeof body === 'object' && (body.message || body.error))
            || (typeof body === 'string' && body)
            || (response.status === 504 ? "Couldn't reach Klives Management." : `Request failed (${response.status}).`);
        throw new ProfilesApiError(String(message), response.status, body);
    }
    return body as T;
}

const get = <T>(path: string, signal?: AbortSignal) => RequestGETFromKliveAPI(path, false, false, {}, signal).then(r => unwrap<T>(r));
const post = <T>(path: string, body: unknown) => RequestPOSTFromKliveAPI(path, JSON.stringify(body ?? {}), false, true).then(r => unwrap<T>(r));
const q = encodeURIComponent;

export const profilesApi = {
    me: () => get<MeProfile>('/KMProfiles/me'),
    catalog: () => get<PermissionCatalogPayload>('/KMProfiles/permissions/catalog'),

    list: (signal?: AbortSignal) => get<ProfileListPayload>('/KMProfiles/list', signal),
    get: (id: string, signal?: AbortSignal) => get<ProfileRow>(`/KMProfiles/get?id=${q(id)}`, signal),

    create: (body: { name: string; rank: string; password?: string | null; generatePassword?: boolean; discordId?: string | null; allowPasswordApiAccess?: boolean; grants?: GrantInput[] }) =>
        post<{ profile: ProfileRow; password: string | null }>('/KMProfiles/create', body),
    update: (body: { id: string; name?: string; discordId?: string; rank?: string }) => post<ProfileRow>('/KMProfiles/update', body),
    remove: (id: string, confirmName: string) => post<{ deleted: boolean }>('/KMProfiles/delete', { id, confirmName }),

    setPermissions: (id: string, grants: GrantInput[], accessVersion?: number) =>
        post<{ added?: string[]; removed?: string[]; changed?: string[]; unchanged?: boolean; profile: ProfileRow }>('/KMProfiles/permissions/set', { id, grants, accessVersion }),

    suspend: (id: string, options: { minutes?: number; untilUtc?: string }, reason: string) =>
        post<ProfileRow>('/KMProfiles/access/suspend', { id, ...options, reason }),
    unsuspend: (id: string) => post<ProfileRow>('/KMProfiles/access/unsuspend', { id }),
    setReadOnly: (id: string, enabled: boolean) => post<ProfileRow>('/KMProfiles/access/read-only', { id, enabled }),
    setLogin: (id: string, enabled: boolean) => post<ProfileRow>('/KMProfiles/access/login', { id, enabled }),
    setPasswordApi: (id: string, enabled: boolean) => post<ProfileRow>('/KMProfiles/access/password-api', { id, enabled }),

    sessions: (id: string, includeEnded = false) => get<SessionRow[]>(`/KMProfiles/sessions?id=${q(id)}${includeEnded ? '&ended=1' : ''}`),
    revokeSessions: (id: string, sessionId?: string) => post<{ revoked: number }>('/KMProfiles/sessions/revoke', { id, sessionId }),
    resetPassword: (id: string, password?: string) =>
        post<{ reset: boolean; password: string | null; signedOutSessions: number }>('/KMProfiles/credentials/reset', { id, password: password || undefined }),

    activity: (id: string, options: { before?: number | null; since?: number | null; limit?: number; types?: string[]; service?: string | null; denied?: boolean } = {}) => {
        const params = new URLSearchParams({ id });
        if (options.before) params.set('before', String(options.before));
        if (options.since) params.set('since', String(options.since));
        if (options.limit) params.set('limit', String(options.limit));
        if (options.types?.length) params.set('types', options.types.join(','));
        if (options.service) params.set('service', options.service);
        if (options.denied) params.set('denied', '1');
        return get<{ items: TimelineItem[]; next: number | null }>(`/KMProfiles/activity?${params}`);
    },
    summary: (id: string, range: '24h' | '7d' | '30d') => get<ActivitySummary>(`/KMProfiles/activity/summary?id=${q(id)}&range=${range}`),
    usage: (id: string) => get<PermissionUsagePayload>(`/KMProfiles/activity/usage?id=${q(id)}`),

    mySessions: () => get<SessionRow[]>('/KMProfiles/sessions/mine'),
    revokeMySessions: (sessionId?: string) => post<{ revoked: number }>('/KMProfiles/sessions/mine/revoke', { sessionId }),
    changePassword: (currentPassword: string, newPassword: string) =>
        post<{ changed: boolean; signedOutSessions: number }>('/KMProfiles/password/change', { currentPassword, newPassword }),

    liveUrl: (profileId: string) => BuildKliveWsUrl('/KMProfiles/admin/live', { profileId }),
};
