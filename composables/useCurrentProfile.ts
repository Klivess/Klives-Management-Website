import { computed, readonly } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

export interface CurrentProfile {
  KlivesManagementRank?: number | string;
  Username?: string;
  Name?: string;
  Nickname?: string;
  [key: string]: unknown;
}

let profileRequest: Promise<CurrentProfile | null> | null = null;
let profileGeneration = 0;

/**
 * Shared, single-flight profile state for authenticated application chrome.
 * Consumers can wait for `ensureLoaded()` or watch `ready` before selecting
 * rank-specific API manifests.
 */
export function useCurrentProfile() {
  const profile = useState<CurrentProfile | null>('current-profile:data', () => null);
  const loading = useState<boolean>('current-profile:loading', () => false);
  const ready = useState<boolean>('current-profile:ready', () => false);
  const error = useState<string | null>('current-profile:error', () => null);

  const rank = computed<number | null>(() => {
    const value = Number(profile.value?.KlivesManagementRank);
    return Number.isFinite(value) ? value : null;
  });

  const username = computed(() => String(
    profile.value?.Username
      ?? profile.value?.Name
      ?? profile.value?.Nickname
      ?? '',
  ));

  const isKlives = computed(() => rank.value === 5);
  const isAdmin = computed(() => (rank.value ?? -1) >= 4);

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
        const response = await RequestGETFromKliveAPI(
          '/KMProfiles/GetCurrentProfile',
          false,
          false,
          {},
          controller.signal,
        );

        if (!response.ok) {
          throw new Error(`Profile request failed (${response.status})`);
        }

        const value = await response.json();
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error('Profile response was not an object');
        }

        if (requestGeneration !== profileGeneration) return null;
        profile.value = value as CurrentProfile;
        return profile.value;
      } catch (reason) {
        if (requestGeneration !== profileGeneration) return null;
        profile.value = null;
        error.value = reason instanceof Error ? reason.message : 'Unable to load profile';
        return null;
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

  const reset = () => {
    profileGeneration += 1;
    profile.value = null;
    loading.value = false;
    ready.value = false;
    error.value = null;
    profileRequest = null;
  };

  const hasRank = (minimum: number) => (rank.value ?? -1) >= minimum;

  return {
    profile: readonly(profile),
    rank,
    username,
    ready: readonly(ready),
    loading: readonly(loading),
    error: readonly(error),
    isKlives,
    isAdmin,
    ensureLoaded,
    refresh,
    reset,
    hasRank,
  };
}
