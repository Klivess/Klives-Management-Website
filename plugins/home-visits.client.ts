import { recordVisit, VISITS_KEY, type VisitRecord } from '~/scripts/home';

// Remembers which pages this browser opens and how recently, so Home can offer them first
// ("Jump back in"). Only the page's path and a count are kept, in this browser's own storage.
export default defineNuxtPlugin(() => {
    const router = useRouter();
    router.afterEach((to, from) => {
        if (to.fullPath === from.fullPath && from.matched.length) return;
        try {
            const records = JSON.parse(localStorage.getItem(VISITS_KEY) || '[]') as VisitRecord[];
            localStorage.setItem(VISITS_KEY, JSON.stringify(recordVisit(Array.isArray(records) ? records : [], to.path, Date.now())));
        } catch {
            // Storage blocked or full: Home falls back to its fixed order.
        }
    });
});
