import { ExchangeLegacyCredential, IsProtectedRoute, VerifyLogin } from '~/scripts/APIInterface';
import { useCurrentProfile } from '~/composables/useCurrentProfile';

/**
 * Before a protected page: with no credential at all, go to the login page (and come back
 * afterwards); a password left by the previous site is traded for a session token; the
 * profile — and so what this person may open — starts loading alongside the page.
 *
 * Whether the page may be shown is decided by <AccessPageGuard> (it re-decides live when
 * access changes); a credential that has stopped working is caught by the first 401.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (!import.meta.client || !IsProtectedRoute(to.path)) return;

  if (!(await VerifyLogin(to.path))) {
    return navigateTo({ path: '/', query: { next: to.fullPath } }, { replace: true });
  }

  await ExchangeLegacyCredential();

  const profile = useCurrentProfile();
  const loading = profile.ensureLoaded();
  // During hydration the server-rendered state must be kept as-is; the guard picks the
  // profile up once mounted. Otherwise wait briefly, so the page rarely flashes a loader.
  if (useNuxtApp().isHydrating) return;
  await Promise.race([loading, new Promise(resolve => setTimeout(resolve, 2_500))]);
});
