import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { RequestBatchFromKliveAPI } from '~/scripts/APIInterface';
import { useAccess } from '~/composables/useAccess';
import {
    q, tumblrGet, tumblrPost,
    type Analytics, type BlogDetail, type CatalogOptions, type OmniEvent, type PostDetail, type ReachReport,
} from '~/composables/useOmniTumblr';
import {
    TMB_PENDING, tmbDueUtc, tmbIsTab, tumblrVerdict,
    type TmbOverview, type TmbPost, type TmbTab, type TmbTone,
} from '~/scripts/tumblrConsole';

/**
 * State and polling for the OmniTumblr console. One /batch every 30 s while the tab is visible: the overview,
 * the whole queue (it feeds the schedule and the Queue tab), and whatever the open tab shows. The post history
 * rides along every third tick, or every tick while Published is open. Nothing is fetched while the tab is
 * hidden, and nothing the profile's permissions would refuse.
 */

const TICK_MS = 30_000;
const PENDING_PATH = '/omnitumblr/posts?status=pending&limit=200';
const HISTORY_PATH = '/omnitumblr/posts?status=Published,Failed,Skipped,Cancelled,Removed&limit=200';
const OVERVIEW_PATH = '/omnitumblr/overview';
const PREFS_KEY = 'tmb:prefs:v1';

export interface TumblrConsoleToast { id: number; tone: TmbTone; text: string; action?: { label: string; run: () => unknown } }
export interface TumblrConsoleConfirm { title: string; text: string; confirm: string; danger: boolean; resolve: (ok: boolean) => void }
interface Prefs { tab: TmbTab; blogId: string | null; live: boolean; days: number; historyFilter: string }

interface PostsPage { Total: number; Filtered: number; Offset: number; Rows: TmbPost[] }
export interface TumblrSettingsView {
    App: TmbOverview['App'];
    Connections: TmbOverview['Connections'];
    Engine: TmbOverview['Engine'];
    Presets?: string[];
}

function readPrefs(): Prefs {
    const fallback: Prefs = { tab: 'queue', blogId: null, live: true, days: 30, historyFilter: 'All' };
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw) as Partial<Prefs>;
        return {
            tab: tmbIsTab(parsed.tab) ? parsed.tab : fallback.tab,
            blogId: typeof parsed.blogId === 'string' ? parsed.blogId : null,
            live: parsed.live !== false,
            days: [7, 30, 90, 365].includes(Number(parsed.days)) ? Number(parsed.days) : 30,
            historyFilter: typeof parsed.historyFilter === 'string' ? parsed.historyFilter : 'All',
        };
    } catch {
        return fallback;
    }
}

function parse<T>(body: unknown): T | null {
    if (body == null) return null;
    if (typeof body === 'string') {
        try { return JSON.parse(body) as T; } catch { return null; }
    }
    return body as T;
}

function errorOf(body: unknown, status: number): string {
    const parsed = parse<{ error?: string }>(body);
    return parsed && typeof parsed === 'object' && typeof parsed.error === 'string' ? parsed.error : `The server answered ${status}`;
}

export function useTumblrConsole() {
    const { can, ready: accessReady } = useAccess();
    const allowed = computed(() => ({
        overview: can('omnitumblr.overview.view'),
        read: can('omnitumblr.blogs.read'),
        manage: can('omnitumblr.blogs.manage'),
        act: can('omnitumblr.posts.act'),
        publish: can('omnitumblr.posts.publish'),
        library: can('omnitumblr.library.manage'),
        settingsView: can('omnitumblr.settings.view'),
        settingsManage: can('omnitumblr.settings.manage'),
    }));

    const prefs = ref<Prefs>({ tab: 'queue', blogId: null, live: true, days: 30, historyFilter: 'All' });
    const overview = shallowRef<TmbOverview | null>(null);
    const pending = shallowRef<TmbPost[]>([]);
    const history = shallowRef<TmbPost[] | null>(null);
    const details = shallowRef<Record<string, BlogDetail>>({});
    const analytics = shallowRef<Record<string, Analytics>>({});
    const reach = shallowRef<Record<string, ReachReport>>({});
    const settings = shallowRef<TumblrSettingsView | null>(null);
    const events = shallowRef<OmniEvent[] | null>(null);
    const catalog = shallowRef<CatalogOptions | null>(null);
    const errors = ref<Record<string, string>>({});
    const loadedAt = ref<number | null>(null);
    const failures = ref(0);
    const busy = ref(false);
    const hidden = ref(false);
    const now = ref(Date.now());
    const toasts = ref<TumblrConsoleToast[]>([]);
    const confirming = ref<TumblrConsoleConfirm | null>(null);
    let tick = 0;
    let timer: number | null = null;
    let clock: number | null = null;
    let toastId = 0;
    let inFlight = false;

    const blogs = computed(() => overview.value?.Blogs ?? []);
    const blog = computed(() => blogs.value.find(b => b.BlogId === prefs.value.blogId) ?? null);
    const verdict = computed(() => tumblrVerdict(overview.value, Math.floor(now.value / 60_000) * 60_000));
    const pendingSorted = computed(() => [...pending.value].sort((a, b) => tmbDueUtc(a).localeCompare(tmbDueUtc(b))));
    const linkState = computed<'live' | 'paused' | 'stale' | 'offline' | 'connecting'>(() => {
        if (!loadedAt.value) return failures.value > 0 ? 'offline' : 'connecting';
        if (!prefs.value.live) return 'paused';
        if (failures.value >= 2) return 'offline';
        return now.value - loadedAt.value > TICK_MS * 2.5 ? 'stale' : 'live';
    });

    function savePrefs() {
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs.value)); } catch { /* private window */ }
    }

    // ───────────────────────────── reading ─────────────────────────────

    const detailPath = (blogId: string) => `/omnitumblr/blog${q({ blogId })}`;
    const analyticsPath = (blogId: string | null, days: number) => `/omnitumblr/analytics${q({ blogId, days })}`;
    const reachPath = (blogId: string) => `/omnitumblr/reach${q({ blogId })}`;
    const EVENTS_PATH = '/omnitumblr/events?limit=300';
    const SETTINGS_PATH = '/omnitumblr/settings';

    /** What the open tab needs, as batch paths. */
    function tabPaths(): string[] {
        const p = prefs.value;
        const id = p.blogId;
        const paths: string[] = [];
        if (!allowed.value.read) return paths;
        if (p.tab === 'analytics') paths.push(analyticsPath(id, p.days));
        if (p.tab === 'reach' && id) paths.push(reachPath(id));
        if ((p.tab === 'strategy' || p.tab === 'activity') && id) paths.push(detailPath(id));
        if (p.tab === 'activity' && !id) paths.push(EVENTS_PATH);
        if (p.tab === 'settings' && allowed.value.settingsView) paths.push(SETTINGS_PATH);
        return paths;
    }

    function apply(path: string, status: number, body: unknown) {
        const key = path.split('?')[0] + (path === HISTORY_PATH ? '#history' : '');
        if (status !== 200) {
            if (status !== 403) errors.value = { ...errors.value, [key]: errorOf(body, status) };
            return;
        }
        const { [key]: _gone, ...rest } = errors.value;
        errors.value = rest;
        if (path === OVERVIEW_PATH) {
            const value = parse<TmbOverview>(body);
            if (value?.Blogs) overview.value = value;
        } else if (path === PENDING_PATH) {
            const page = parse<PostsPage>(body);
            if (page?.Rows) pending.value = page.Rows;
        } else if (path === HISTORY_PATH) {
            const page = parse<PostsPage>(body);
            if (page?.Rows) history.value = page.Rows;
        } else if (path.startsWith('/omnitumblr/blog?')) {
            const value = parse<BlogDetail>(body);
            if (value?.Blog) details.value = { ...details.value, [value.Blog.BlogId]: value };
        } else if (path.startsWith('/omnitumblr/analytics')) {
            const value = parse<Analytics>(body);
            if (value) analytics.value = { ...analytics.value, [`${value.BlogId ?? 'all'}:${value.Days}`]: value };
        } else if (path.startsWith('/omnitumblr/reach')) {
            const value = parse<ReachReport>(body);
            if (value?.BlogId) reach.value = { ...reach.value, [value.BlogId]: value };
        } else if (path === SETTINGS_PATH) {
            settings.value = parse<TumblrSettingsView>(body);
        } else if (path === EVENTS_PATH) {
            const value = parse<OmniEvent[]>(body);
            if (Array.isArray(value)) events.value = value;
        }
    }

    async function refresh(options: { history?: boolean; extra?: string[] } = {}) {
        if (!allowed.value.overview || inFlight) return;
        inFlight = true;
        busy.value = true;
        try {
            const paths = [OVERVIEW_PATH];
            if (allowed.value.read) {
                paths.push(PENDING_PATH);
                const wantHistory = options.history || prefs.value.tab === 'published' || history.value === null || tick % 3 === 0;
                if (wantHistory) paths.push(HISTORY_PATH);
                paths.push(...tabPaths());
            }
            for (const extra of options.extra ?? []) if (!paths.includes(extra)) paths.push(extra);
            const results = await RequestBatchFromKliveAPI(paths);
            if (!results.size) throw new Error('no answer');
            for (const path of paths) {
                const item = results.get(path);
                if (item) apply(path, item.status, item.body);
            }
            if (results.get(OVERVIEW_PATH)?.status === 200) {
                loadedAt.value = Date.now();
                failures.value = 0;
            } else {
                failures.value++;
            }
            tick++;
        } catch {
            failures.value++;
        } finally {
            inFlight = false;
            busy.value = false;
        }
    }

    /** Loads the open tab now (switching tabs or blogs should not wait for the next tick). */
    async function loadTab() {
        const paths = tabPaths();
        if (prefs.value.tab === 'published' && history.value === null) paths.push(HISTORY_PATH);
        if (prefs.value.tab === 'strategy' && !catalog.value) paths.push('/omnitumblr/memescraper/options');
        if (!paths.length) return;
        const results = await RequestBatchFromKliveAPI(paths);
        for (const path of paths) {
            const item = results.get(path);
            if (!item) continue;
            if (path === '/omnitumblr/memescraper/options') { if (item.status === 200) catalog.value = parse<CatalogOptions>(item.body); continue; }
            apply(path, item.status, item.body);
        }
    }

    async function loadPost(postId: string): Promise<PostDetail | null> {
        const result = await tumblrGet<PostDetail>(`/omnitumblr/post${q({ postId })}`);
        if (!result.ok) { notify('crit', result.error ?? 'Could not load the post'); return null; }
        return result.data;
    }

    async function loadCatalog() {
        if (catalog.value) return;
        const result = await tumblrGet<CatalogOptions>('/omnitumblr/memescraper/options');
        if (result.ok) catalog.value = result.data;
    }

    // ───────────────────────────── acting ─────────────────────────────

    function notify(tone: TmbTone, text: string, action?: TumblrConsoleToast['action']) {
        const id = ++toastId;
        toasts.value = [...toasts.value.slice(-3), { id, tone, text, action }];
        window.setTimeout(() => dismissToast(id), tone === 'crit' ? 9_000 : action ? 7_000 : 4_000);
    }

    function dismissToast(id: number) {
        toasts.value = toasts.value.filter(t => t.id !== id);
    }

    /** Asks before something that can't be taken back. The page renders the question. */
    function confirm(title: string, text: string, confirmLabel = 'Confirm', danger = false): Promise<boolean> {
        confirming.value?.resolve(false);
        return new Promise(resolve => {
            confirming.value = { title, text, confirm: confirmLabel, danger, resolve: ok => { confirming.value = null; resolve(ok); } };
        });
    }

    /** Runs a POST, says how it went, and reads the state again. */
    async function act<T = any>(path: string, body: Record<string, unknown>, done: string | ((data: T) => string) | null, options: { quiet?: boolean; history?: boolean } = {}): Promise<T | null> {
        const result = await tumblrPost<T>(path, body);
        if (!result.ok) {
            notify('crit', result.error ?? 'That did not work');
            return null;
        }
        const message = typeof done === 'function' ? done(result.data as T) : done;
        if (message && !options.quiet) notify('ok', message);
        void refresh({ history: options.history ?? true });
        return (result.data ?? ({} as T));
    }

    async function updateBlog(blogId: string, body: Record<string, unknown>, done: string) {
        const data = await act<{ Notes?: string[] }>('/omnitumblr/blogs/update', { blogId, ...body }, null);
        if (data) notify('ok', [done, ...(data.Notes ?? [])].join(' '));
        if (data && (prefs.value.tab === 'strategy' || prefs.value.tab === 'activity')) void loadTab();
        return data;
    }

    async function setAutopilot(blogId: string, on: boolean) {
        const b = blogs.value.find(x => x.BlogId === blogId);
        if (!on && (b?.Pending ?? 0) > 0
            && !(await confirm(`Switch autopilot off for @${b?.Name}?`, 'Posts autopilot has planned for this blog are cancelled. Posts you composed stay scheduled.', 'Switch off', true)))
            return;
        await updateBlog(blogId, { autopilot: on }, on ? `Autopilot on for @${b?.Name}` : `Autopilot off for @${b?.Name}`);
    }

    async function setPaused(blogId: string, paused: boolean) {
        const b = blogs.value.find(x => x.BlogId === blogId);
        await updateBlog(blogId, { paused }, paused ? `@${b?.Name} paused` : `@${b?.Name} resumed`);
    }

    async function planNow(blogId: string) {
        await act<{ Planned: number; Warning: string | null }>('/omnitumblr/blogs/plan-now', { blogId },
            d => d.Warning ? `Planned ${d.Planned}. ${d.Warning}` : d.Planned ? `Planned ${d.Planned} post${d.Planned === 1 ? '' : 's'}` : 'Every slot ahead is already filled');
    }

    async function syncBlog(blogId: string) {
        await act<{ Errors: string[] }>('/omnitumblr/blogs/refresh', { blogId }, d => d.Errors?.length ? `Refreshed with problems: ${d.Errors.join(' · ')}` : 'Refreshed from Tumblr');
    }

    async function removeBlog(blogId: string) {
        const b = blogs.value.find(x => x.BlogId === blogId);
        if (!(await confirm(`Stop managing @${b?.Name}?`, 'Its pending posts are cancelled and its history is archived on the server. Nothing is deleted on Tumblr.', 'Stop managing', true))) return false;
        const done = await act('/omnitumblr/blogs/remove', { blogId }, `@${b?.Name} is no longer managed`);
        if (done && prefs.value.blogId === blogId) setBlog(null);
        return !!done;
    }

    async function approve(postId: string) {
        return act('/omnitumblr/posts/approve', { postId }, 'Approved');
    }

    async function approveAll(blogId: string | null) {
        const targets = blogId ? [blogId] : [...new Set(pending.value.filter(p => p.Status === 'AwaitingApproval').map(p => p.BlogId))];
        let total = 0;
        for (const id of targets) {
            const result = await tumblrPost<{ approved: number }>('/omnitumblr/posts/approve', { blogId: id });
            if (result.ok) total += result.data?.approved ?? 0;
            else notify('crit', result.error ?? 'Could not approve');
        }
        notify('ok', `Approved ${total} post${total === 1 ? '' : 's'}`);
        void refresh();
    }

    const POST_ACTIONS: Record<string, { confirm?: [string, string, string, boolean]; done: string; route?: string }> = {
        'approve': { done: 'Approved' },
        'publish-now': { confirm: ['Publish now?', 'It goes out within seconds, ignoring the schedule, the daily cap and the spacing between blogs.', 'Publish now', false], done: 'Publishing…' },
        'retry': { done: 'Queued for another attempt' },
        'swap-content': { confirm: ['Swap the content?', 'Autopilot takes the next video in line for this slot and writes a new caption. This one is not used again.', 'Swap', false], done: 'Swapped' },
        'pick-another': { done: 'Picked a different post', route: 'swap-content' },
        'skip': { confirm: ['Skip this slot?', 'Nothing is posted in this slot, and its content is not reused.', 'Skip slot', true], done: 'Skipped' },
        'cancel': { confirm: ['Cancel this post?', 'Autopilot fills its slot with different content.', 'Cancel post', true], done: 'Cancelled' },
        'delete-remote': { confirm: ['Delete it from Tumblr?', 'The post is deleted from the blog on Tumblr for good, and its notes with it.', 'Delete from Tumblr', true], done: 'Deleted from Tumblr' },
    };

    async function postAction(action: string, postId: string): Promise<boolean> {
        const spec = POST_ACTIONS[action];
        if (!spec) return false;
        if (spec.confirm && !(await confirm(...spec.confirm))) return false;
        return !!(await act(`/omnitumblr/posts/${spec.route ?? action}`, { postId }, spec.done));
    }

    // ───────────────────────────── moving around ─────────────────────────────

    function setTab(tab: TmbTab) {
        if (prefs.value.tab === tab) return;
        prefs.value = { ...prefs.value, tab };
        void loadTab();
    }

    function setBlog(blogId: string | null) {
        if (prefs.value.blogId === blogId) return;
        prefs.value = { ...prefs.value, blogId };
        void loadTab();
    }

    function setDays(days: number) {
        prefs.value = { ...prefs.value, days };
        void loadTab();
    }

    function setLive(live: boolean) {
        prefs.value = { ...prefs.value, live };
        if (live) void refresh();
    }

    watch(prefs, savePrefs, { deep: true });

    // The profile's permissions can arrive after the page mounts: the first read is skipped until they do,
    // so start as soon as they say yes (and read the open tab again when what may be read changes).
    watch(() => JSON.stringify(allowed.value), (next, before) => {
        if (next === before || !allowed.value.overview) return;
        if (!loadedAt.value) void refresh({ history: true }).then(() => loadTab());
        else void loadTab();
    });

    // ───────────────────────────── life cycle ─────────────────────────────

    function onVisibility() {
        hidden.value = document.visibilityState === 'hidden';
        if (!hidden.value && prefs.value.live && (!loadedAt.value || Date.now() - loadedAt.value > 15_000)) void refresh();
    }

    onMounted(() => {
        prefs.value = readPrefs();
        hidden.value = document.visibilityState === 'hidden';
        void refresh({ history: true }).then(() => loadTab());
        timer = window.setInterval(() => {
            if (!hidden.value && prefs.value.live) void refresh();
        }, TICK_MS);
        clock = window.setInterval(() => { now.value = Date.now(); }, 15_000);
        document.addEventListener('visibilitychange', onVisibility);
    });

    onBeforeUnmount(() => {
        if (timer != null) window.clearInterval(timer);
        if (clock != null) window.clearInterval(clock);
        document.removeEventListener('visibilitychange', onVisibility);
        confirming.value?.resolve(false);
    });

    return {
        accessReady, allowed, prefs, overview, pending, pendingSorted, history, details, analytics, reach, settings, events, catalog, errors,
        loadedAt, failures, busy, hidden, now, toasts, confirming, blogs, blog, verdict, linkState,
        refresh, loadTab, loadPost, loadCatalog, notify, dismissToast, confirm, act, updateBlog, setAutopilot, setPaused,
        planNow, syncBlog, removeBlog, approve, approveAll, postAction, setTab, setBlog, setDays, setLive,
        isPending: (post: TmbPost) => TMB_PENDING.includes(post.Status),
    };
}

export type TumblrConsole = ReturnType<typeof useTumblrConsole>;
