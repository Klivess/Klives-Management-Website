import { computed } from 'vue';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import { profilesApi, type CatalogPermission, type CatalogService, type PermissionCatalogPayload } from '~/scripts/profilesApi';

/**
 * Permission checks for components: `can('omnitrader.orders.place')`,
 * `can('omnitrader.')` (any key of a service), `canAny([...])`, `canAll([...])`.
 * Mirrors the server's gate, including suspension and read-only, and updates live when the
 * server pushes an access change.
 */
export function useAccess() {
  const current = useCurrentProfile();
  return {
    can: current.can,
    canAny: current.canAny,
    canAll: (keys: string | readonly string[]) => current.can(keys, 'all'),
    isOwner: current.isOwner,
    rank: current.rank,
    rankName: computed(() => String(current.profile.value?.rank ?? '')),
    permissions: current.permissions,
    grantedPermissions: current.grantedPermissions,
    suspended: current.suspended,
    readOnly: current.readOnly,
    legacy: current.legacy,
    profile: current.profile,
    ready: current.ready,
    loading: current.loading,
    ensureLoaded: current.ensureLoaded,
    refresh: current.refresh,
  };
}

export interface CatalogEntry extends CatalogPermission {
  service: string;
  serviceKey: string;
}

let catalogRequest: Promise<PermissionCatalogPayload | null> | null = null;

/**
 * The permission catalog: titles, descriptions, tiers and (for someone who may view
 * permissions) the routes each key unlocks. Loaded once per page load and shared.
 */
export function usePermissionCatalog() {
  const catalog = useState<PermissionCatalogPayload | null>('permission-catalog:data', () => null);
  const error = useState<string | null>('permission-catalog:error', () => null);
  const loading = useState<boolean>('permission-catalog:loading', () => false);

  const byKey = computed(() => {
    const map = new Map<string, CatalogEntry>();
    for (const service of catalog.value?.services ?? []) {
      for (const permission of service.permissions) {
        map.set(permission.key, { ...permission, service: service.name, serviceKey: service.key });
      }
    }
    return map;
  });

  const services = computed<CatalogService[]>(() => catalog.value?.services ?? []);
  const withRoutes = computed(() => (catalog.value?.services ?? []).some(s => s.permissions.some(p => p.routes !== null)));

  async function load(force = false): Promise<PermissionCatalogPayload | null> {
    if (!import.meta.client) return catalog.value;
    if (catalog.value && !force) return catalog.value;
    if (catalogRequest) return catalogRequest;
    loading.value = true;
    error.value = null;
    catalogRequest = profilesApi.catalog()
      .then(value => {
        catalog.value = value;
        return value;
      })
      .catch(reason => {
        error.value = reason instanceof Error ? reason.message : 'Could not load the permission catalog.';
        return catalog.value;
      })
      .finally(() => {
        loading.value = false;
        catalogRequest = null;
      });
    return catalogRequest;
  }

  /** Display data for a key, or for a service prefix ('omnitrader.'). */
  function describe(key: string): { title: string; service: string; tier: string | null; tierValue: number | null; description: string } {
    const entry = byKey.value.get(key);
    if (entry) {
      return { title: entry.title, service: entry.service, tier: entry.tier, tierValue: entry.tierValue, description: entry.description };
    }
    if (key.endsWith('.')) {
      const service = (catalog.value?.services ?? []).find(s => `${s.key}.` === key);
      return {
        title: service ? `Any ${service.name} permission` : `Any ${key.slice(0, -1)} permission`,
        service: service?.name ?? key.slice(0, -1),
        tier: null,
        tierValue: null,
        description: service ? `At least one of the ${service.permissions.length} ${service.name} permissions.` : '',
      };
    }
    return { title: key, service: key.split('.')[0] ?? '', tier: null, tierValue: null, description: '' };
  }

  return { catalog, services, byKey, withRoutes, loading, error, load, describe };
}
