/**
 * Projects became Demiurge (November 2026): /projects/<id> links in Discord, bookmarks and old
 * notifications still land on the same page under /demiurge. The server answers these with a
 * 301 from routeRules; this covers navigation that never reaches the server.
 */
export default defineNuxtRouteMiddleware((to) => {
  if (to.path !== '/projects' && !to.path.startsWith('/projects/')) return;
  return navigateTo({ path: '/demiurge' + to.path.slice('/projects'.length), query: to.query, hash: to.hash },
    { replace: true, redirectCode: 301 });
});
