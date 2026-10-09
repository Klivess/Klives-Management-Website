import { computed, readonly } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

/** `/KMProfiles/me`: who is signed in and what they may do right now. */
export interface MeProfile {
  userId: string;
  name: string;
  /** Hierarchy label only ("who is above whom") — never what someone may do. */
  rank: string;
  rankValue: number;
  isOwner: boolean;
  canLogin: boolean;
  discordId?: string | null;
  createdUtc?: string | null;
  /** Keys the gate would allow right now (suspension and read-only already applied). */
  permissions: string[];
  /** Every key held, whether or not it is usable right now. */
  grantedPermissions?: string[];
  accessVersion: number;
  suspended: boolean;
  suspendedUntilUtc: string | null;
  suspensionReason: string | null;
  readOnly: boolean;
  sessionId?: string | null;
  authMethod?: string | null;
  assignableRanks: string[];
}

export interface CurrentProfile extends Partial<MeProfile> {
  /** Compatibility fields read by older pages. */
  KlivesManagementRank?: number | string;
  Username?: string;
  Name?: string;
  Nickname?: string;
  /** Loaded from a server that predates permissions (it alone decides access). */
  legacy?: boolean;
  [key: string]: unknown;
}

let profileRequest: Promise<CurrentProfile | null> | null = null;
let profileGeneration = 0;

function isMePayload(value: unknown): value is MeProfile {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && typeof (value as MeProfile).userId === 'string' && Array.isArray((value as MeProfile).permissions);
}

/** Shapes `me` so pages written against the old profile object keep working. */
export function normalizeMe(me: MeProfile): CurrentProfile {
  return {
    ...me,
    KlivesManagementRank: me.rankValue,
    Name: me.name,
    Username: me.name,
    legacy: false,
  };
}

async function fetchJson(path: string, signal: AbortSignal): Promise<{ status: number; body: unknown }> {
  const response = await RequestGETFromKliveAPI(path, false, false, {}, signal);
  let body: unknown = null;
  try { body = await response.json(); } catch { /* not JSON */ }
  return { status: response.status, body };
}

/**
 * Shared, single-flight state for the signed-in profile and its permissions. Every
 * permission check on the site goes through `can()` here (or `useAccess()`), which mirrors the
 * server's gate: the server stays the authority, the site just doesn't offer what would be refused.
 */
export function useCurrentProfile() {
  const profile = useState<CurrentProfile | null>('current-profile:data', () => null);
  const loading = useState<boolean>('current-profile:loading', () => false);
  const ready = useState<boolean>('current-profile:ready', () => false);
  const error = useState<string | null>('current-profile:error', () => null);

  const rank = computed<number | null>(() => {
    const value = Number(profile.value?.rankValue ?? profile.value?.KlivesManagementRank);
    return Number.isFinite(value) ? value : null;
  });

  const username = computed(() => String(
    profile.value?.name
      ?? profile.value?.Username
      ?? profile.value?.Name
      ?? profile.value?.Nickname
      ?? '',
  ));

  const legacy = computed(() => profile.value?.legacy === true);
  const isOwner = computed(() => profile.value?.isOwner === true || (legacy.value && rank.value === 5));
  const permissions = computed(() => new Set(profile.value?.permissions ?? []));
  const grantedPermissions = computed(() => new Set(profile.value?.grantedPermissions ?? profile.value?.permissions ?? []));
  const suspended = computed(() => profile.value?.suspended === true);
  const readOnly = computed(() => profile.value?.readOnly === true);
  const accessVersion = computed(() => Number(profile.value?.accessVersion ?? 0));

  /** @deprecated Rank no longer grants anything: use `can()` with a permission key. */
  const isKlives = isOwner;
  /** @deprecated Rank no longer grants anything: use `can()` with a permission key. */
  const isAdmin = computed(() => isOwner.value || (rank.value ?? -1) >= 4);

  /** One key, or a service prefix ending in '.' (any key of that service). */
  function holds(key: string): boolean {
    if (key.endsWith('.')) {
      for (const k of permissions.value) if (k.startsWith(key)) return true;
      return false;
    }
    return permissions.value.has(key);
  }

  /**
   * Would the server allow this right now? Accepts a key, a service prefix ('omnitrader.'),
   * or a list (all of them, unless `mode` is 'any').
   */
  function can(key: string | readonly string[], mode: 'all' | 'any' = 'all'): boolean {
    if (!profile.value) return false;
    if (isOwner.value || legacy.value) return true; // an old server decides everything itself
    const keys = typeof key === 'string' ? [key] : key;
    if (keys.length === 0) return true;
    return mode === 'any' ? keys.some(holds) : keys.every(holds);
  }

  const canAny = (keys: string | readonly string[]) => can(keys, 'any');

  const refresh = async (): Promise<CurrentProfile | null> => {
    if (!import.meta.client) return profile.value;
    if (profileRequest) return profileRequest;

    loading.value = true;
    error.value = null;

    const requestGeneration = profileGeneration;
    const request = (async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      try {
        const me = await fetchJson('/KMProfiles/me', controller.signal);
        let value: CurrentProfile | null = null;
        if (me.status === 200 && isMePayload(me.body)) {
          value = normalizeMe(me.body);
        } else if (me.status === 200 || me.status === 404) {
          // A server from before permissions: read the old profile shape.
          const old = await fetchJson('/KMProfiles/GetCurrentProfile', controller.signal);
          if (old.status !== 200 || !old.body || typeof old.body !== 'object' || Array.isArray(old.body)) {
            throw new Error(`Profile request failed (${old.status})`);
          }
          value = { ...(old.body as CurrentProfile), legacy: true };
        } else {
          throw new Error(`Profile request failed (${me.status})`);
        }

        if (requestGeneration !== profileGeneration) return null;
        profile.value = value;
        return profile.value;
      } catch (reason) {
        if (requestGeneration !== profileGeneration) return null;
        // Keep showing the last known profile through a blip; the server still decides.
        error.value = reason instanceof Error ? reason.message : 'Unable to load profile';
        return profile.value;
      } finally {
        window.clearTimeout(timeout);
        if (requestGeneration === profileGeneration) {
          loading.value = false;
          ready.value = true;
          profileRequest = null;
        }
      }
    })();

    profileRequest = request;
    return profileRequest;
  };

  const ensureLoaded = async (): Promise<CurrentProfile | null> => {
    if (ready.value && profile.value) return profile.value;
    return refresh();
  };

  /** Seeds the state from a payload already in hand (the login response). */
  const applyMe = (me: unknown) => {
    if (!isMePayload(me)) return;
    profileGeneration += 1;
    profileRequest = null;
    profile.value = normalizeMe(me);
    loading.value = false;
    ready.value = true;
    error.value = null;
  };

  const reset = () => {
    profileGeneration += 1;
    profile.value = null;
    loading.value = false;
    ready.value = false;
    error.value = null;
    profileRequest = null;
  };

  /** @deprecated Rank no longer grants anything: use `can()` with a permission key. */
  const hasRank = (minimum: number) => (rank.value ?? -1) >= minimum;

  return {
    profile: readonly(profile),
    rank,
    username,
    ready: readonly(ready),
    loading: readonly(loading),
    error: readonly(error),
    isOwner,
    isKlives,
    isAdmin,
    legacy,
    permissions,
    grantedPermissions,
    suspended,
    readOnly,
    accessVersion,
    can,
    canAny,
    ensureLoaded,
    refresh,
    applyMe,
    reset,
    hasRank,
  };
}
