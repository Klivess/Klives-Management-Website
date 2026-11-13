import { computed, reactive, ref, shallowRef } from 'vue';
import { BuildKliveHeaders, KliveAPIUrl, ReportXhrAccess, RequestBatchFromKliveAPI, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useAccess } from '~/composables/useAccess';
import {
    ROOT, buildDriveIndex, childrenIn, keyOf, linksByItem, normalizeDrive, normalizeLink,
    type DriveIndex, type DriveItem, type DriveLink, type DriveSpace, type RawCloudItem, type RawShareLink,
} from '~/scripts/klivecloud/drive';
import { createUploadQueue, type Picked } from '~/scripts/klivecloud/uploads';
import { describeApiError, type PreviewSource, type ShareItem, type ShareMode } from '~/scripts/klivecloud/shared';

/*
 * State and actions behind /klivecloud.
 *
 * Loading: the whole tree, the share links and the drive in one /batch (one round trip, where the
 * old page made three requests plus one GetItemInfo per dead link, every one of which 404ed). Then
 * a few bytes every 30 s (/KliveCloud/Version) and a reload only when something changed; nothing
 * while the tab is hidden. Every field from a newer server is optional, and a route an older
 * server lacks turns its feature off instead of failing.
 */

export type CloudTone = 'ok' | 'info' | 'warn' | 'crit';
export interface CloudToast { id: number; tone: CloudTone; text: string; action?: { label: string; run: () => void } }

interface Ticket { token: string; path: string; expires: number }

const POLL_MS = 30_000;
const FALLBACK_POLL_MS = 120_000;
const TICKET_MARGIN_MS = 10 * 60_000;
/** What KliveAPI answers for a route it doesn't have (a server older than this page). */
const NO_ROUTE = 'Route not found';

/** Clicks a link the browser will save (the response says attachment), without leaving the page. */
export function saveFromUrl(url: string, name?: string) {
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    if (name) a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function queryOf(params: Record<string, string | number | undefined | null>) {
    const query = new URLSearchParams();
    for (const name of Object.keys(params)) {
        const value = params[name];
        if (value !== undefined && value !== null && value !== '') query.set(name, String(value));
    }
    return query.toString();
}

type CallResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; missing: boolean };

async function callPost<T = any>(path: string, body?: unknown): Promise<CallResult<T>> {
    const res = await RequestPOSTFromKliveAPI(path, body === undefined ? '' : JSON.stringify(body), false, body !== undefined);
    const text = await res.text().catch(() => '');
    if (!res.ok) return { ok: false, status: res.status, error: describeApiError(res.status, text), missing: res.status === 404 && text.trim() === NO_ROUTE };
    let data: any = text;
    try { data = text ? JSON.parse(text) : null; } catch { /* plain text */ }
    return { ok: true, data };
}

export function useKliveCloud() {
    const { can } = useAccess();

    const allowed = computed(() => ({
        browse: can('klivecloud.files.browse'),
        download: can('klivecloud.files.download'),
        upload: can('klivecloud.files.upload'),
        organize: can('klivecloud.files.organize'),
        remove: can('klivecloud.files.delete'),
        share: can('klivecloud.sharing.manage'),
        shareAny: can('klivecloud.sharing.manage-any'),
        drive: can('klivecloud.drive.view'),
    }));

    // ── data ──
    let raw: RawCloudItem[] = [];
    const index = shallowRef<DriveIndex | null>(null);
    const links = shallowRef<DriveLink[]>([]);
    const linkMap = computed(() => linksByItem(links.value));
    const drive = shallowRef<DriveSpace | null>(null);
    const state = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const loadError = ref('');
    const loadedAt = ref(0);
    const now = ref(Date.now());
    const reloading = ref(false);
    const supports = reactive({ version: true, tickets: true, rename: true, updateLink: true, usage: false });
    const stamps = { items: '', links: '' };

    // ── toasts ──
    const toasts = ref<CloudToast[]>([]);
    let toastSeq = 0;
    function toastNote(tone: CloudTone, text: string, action?: CloudToast['action']) {
        const id = ++toastSeq;
        toasts.value = [...toasts.value.slice(-3), { id, tone, text, action }];
        setTimeout(() => dismiss(id), tone === 'crit' || action ? 8_000 : 3_600);
    }
    function dismiss(id: number) {
        toasts.value = toasts.value.filter(t => t.id !== id);
    }

    function rebuild() {
        index.value = buildDriveIndex(raw);
    }

    // ── loading ──
    const TREE = '/KliveCloud/GetFolderTree';
    const LINKS = '/KliveCloud/ListShareLinks';
    const DRIVE = '/KliveCloud/GetDriveInfo';
    const VERSION = '/KliveCloud/Version';

    function takeLinks(body: unknown) {
        if (!Array.isArray(body)) return;
        links.value = (body as RawShareLink[]).map(normalizeLink);
        supports.usage = (body as RawShareLink[]).some(row => !!row?.Usage);
    }

    async function load(parts: { tree?: boolean; links?: boolean; drive?: boolean } = { tree: true, links: true, drive: true }) {
        if (!allowed.value.browse) {
            state.value = 'ready';
            return;
        }
        if (!index.value) state.value = 'loading';
        reloading.value = true;
        const paths: string[] = [];
        if (parts.tree) paths.push(TREE);
        if (parts.links && allowed.value.share) paths.push(LINKS);
        if (parts.drive && allowed.value.drive) paths.push(DRIVE);
        try {
            const batch = await RequestBatchFromKliveAPI(paths);
            if (!batch.size && paths.length) {
                // /batch itself failed: ask one by one.
                for (const path of paths) {
                    const res = await RequestGETFromKliveAPI(path, false, false);
                    const text = await res.text().catch(() => '');
                    let body: any = text;
                    try { body = JSON.parse(text); } catch { /* plain */ }
                    batch.set(path, { path, status: res.status, ok: res.ok, contentType: res.headers.get('content-type') ?? '', body });
                }
            }
            if (parts.tree) {
                const tree = batch.get(TREE);
                if (tree?.ok && Array.isArray(tree.body)) {
                    raw = tree.body as RawCloudItem[];
                    rebuild();
                    loadedAt.value = Date.now();
                    loadError.value = '';
                    state.value = 'ready';
                } else if (!index.value) {
                    loadError.value = tree ? describeApiError(tree.status, typeof tree.body === 'string' ? tree.body : JSON.stringify(tree.body ?? '')) : "Couldn't reach KliveCloud.";
                    state.value = 'error';
                }
            }
            const linkRes = batch.get(LINKS);
            if (linkRes?.ok) takeLinks(linkRes.body);
            const driveRes = batch.get(DRIVE);
            if (driveRes?.ok) drive.value = normalizeDrive(driveRes.body);
        } finally {
            reloading.value = false;
            now.value = Date.now();
        }
    }

    /** Asks whether anything changed (a few bytes) and reloads only what did. */
    async function poll() {
        now.value = Date.now();
        if (!allowed.value.browse) return;
        if (!supports.version) {
            if (Date.now() - loadedAt.value >= FALLBACK_POLL_MS) await load();
            return;
        }
        const res = await RequestGETFromKliveAPI(VERSION, false, false);
        if (res.status === 404) {
            supports.version = false;
            return;
        }
        if (!res.ok) return;
        const body = await res.json().catch(() => null);
        if (!body) return;
        const items = String(body.Items ?? '');
        const linkStamp = String(body.Links ?? '');
        const first = !stamps.items && !stamps.links;
        const treeChanged = !first && items !== stamps.items;
        const linksChanged = !first && linkStamp !== stamps.links;
        // The stamp read before the fetch is kept: a change landing in between shows up next time.
        stamps.items = items;
        stamps.links = linkStamp;
        if (treeChanged || linksChanged) await load({ tree: treeChanged, links: linksChanged || treeChanged, drive: treeChanged });
    }

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let clockTimer: ReturnType<typeof setInterval> | null = null;
    function onVisible() {
        if (document.visibilityState === 'visible') void poll();
    }
    function start() {
        void load().then(() => poll());
        pollTimer = setInterval(() => { if (document.visibilityState === 'visible') void poll(); }, POLL_MS);
        clockTimer = setInterval(() => { now.value = Date.now(); }, 30_000);
        document.addEventListener('visibilitychange', onVisible);
    }
    function stop() {
        if (pollTimer) clearInterval(pollTimer);
        if (clockTimer) clearInterval(clockTimer);
        if (reloadTimer) clearTimeout(reloadTimer);
        document.removeEventListener('visibilitychange', onVisible);
        uploads.cancelAll();
    }

    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    function reloadSoon(parts: { tree?: boolean; links?: boolean; drive?: boolean } = { tree: true, links: true, drive: true }) {
        if (reloadTimer) clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => { reloadTimer = null; void load(parts); }, 500);
    }

    /** The server refused because it predates the route: say so plainly. */
    function oldServer(feature: string) {
        toastNote('warn', `${feature} needs the newer KliveCloud server, which isn't running yet.`);
    }

    // ── tickets: what lets an <img>, <video> or download link open a private file ──
    const tickets = new Map<string, Ticket>();

    function liveTicket(key: string): Ticket | null {
        const ticket = tickets.get(key);
        return ticket && ticket.expires - Date.now() > TICKET_MARGIN_MS ? ticket : null;
    }

    async function ensureTickets(items: Pick<DriveItem, 'id' | 'key'>[]): Promise<boolean> {
        if (!supports.tickets) return false;
        const missing = items.filter(item => !liveTicket(item.key));
        for (let i = 0; i < missing.length; i += 50) {
            const chunk = missing.slice(i, i + 50);
            const res = await callPost<any>(`/KliveCloud/Ticket?${queryOf({ itemIDs: chunk.map(item => item.id).join(',') })}`);
            if (!res.ok) {
                if (res.missing) supports.tickets = false;
                return false;
            }
            for (const row of res.data?.Tickets ?? []) {
                tickets.set(keyOf(row.ItemID), { token: String(row.Ticket), path: String(row.Path), expires: Date.parse(row.ExpiresUtc) || Date.now() + 3_600_000 });
            }
        }
        return items.every(item => !!liveTicket(item.key));
    }

    function ticketUrl(key: string, extra: Record<string, string | number | undefined> = {}) {
        const ticket = liveTicket(key) ?? tickets.get(key);
        if (!ticket) return '';
        const more = queryOf(extra);
        return `${KliveAPIUrl}${ticket.path}${more ? `&${more}` : ''}`;
    }

    /** URL builders for the shared preview component, backed by this item's ticket. */
    function previewSource(item: DriveItem, thumb: (key: string) => string | null): PreviewSource {
        const key = item.key;
        return {
            download: () => ticketUrl(key),
            stream: () => ticketUrl(key),
            playable: () => ticketUrl(key, { as: 'mp4' }),
            preview: (_item?: ShareItem, width = 320, height = 320) => (width <= 320 && thumb(key)) || ticketUrl(key, { as: 'jpg', w: width, h: height }),
            save: () => ticketUrl(key, { download: 1 }),
        };
    }

    async function fallbackDownload(item: DriveItem) {
        // Servers without tickets: the old way, the whole file through memory first.
        const res = await RequestGETFromKliveAPI(`/KliveCloud/DownloadFile?${queryOf({ itemID: item.id })}`, false, false);
        if (!res.ok) {
            toastNote('crit', `Couldn't download ${item.name}: ${describeApiError(res.status, await res.text().catch(() => ''))}`);
            return;
        }
        const url = URL.createObjectURL(await res.blob());
        saveFromUrl(url, item.name);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    async function download(items: DriveItem[], zipFolder?: DriveItem | null) {
        if (!items.length) return;
        if (!allowed.value.download) { toastNote('warn', "Downloading isn't part of your access."); return; }
        const single = items.length === 1 ? items[0] : null;
        // One file: straight to the browser's downloads (streamed to disk, resumable).
        if (single && single.type === 'File') {
            if (await ensureTickets([single])) saveFromUrl(ticketUrl(single.key, { download: 1 }));
            else await fallbackDownload(single);
            return;
        }
        if (!supports.tickets) {
            for (const item of items.filter(i => i.type === 'File')) await fallbackDownload(item);
            if (items.some(item => item.type === 'Folder')) oldServer('Downloading a folder');
            return;
        }
        // A folder, or several things in one folder: one ZIP.
        const folder = single?.type === 'Folder' ? single : zipFolder;
        if (folder) {
            if (!await ensureTickets([folder])) { toastNote('crit', `Couldn't prepare ${folder.name}.zip.`); return; }
            const selection = single ? undefined : items.map(item => item.id).join(',');
            saveFromUrl(ticketUrl(folder.key, selection ? { itemIDs: selection } : {}));
            toastNote('info', `Preparing ${folder.name}.zip…`);
            return;
        }
        // Several things at the top of the drive: one download each.
        const files = items.filter(item => item.type === 'File');
        if (files.length && !await ensureTickets(files)) { toastNote('crit', "Couldn't prepare those downloads."); return; }
        files.forEach((item, i) => setTimeout(() => saveFromUrl(ticketUrl(item.key, { download: 1 })), i * 400));
        if (items.some(item => item.type === 'Folder')) toastNote('info', 'Folders at the top of the drive download one at a time: open one to get it as a ZIP.');
    }

    // ── changes ──
    function rawFor(key: string) {
        return raw.find(row => keyOf(row.ItemID) === key);
    }

    function insideAny(all: DriveIndex, item: DriveItem, folders: Set<string>) {
        let cursor = all.byKey.get(item.parentKey);
        const guard = new Set<string>();
        while (cursor && !guard.has(cursor.key)) {
            if (folders.has(cursor.key)) return true;
            guard.add(cursor.key);
            cursor = all.byKey.get(cursor.parentKey);
        }
        return false;
    }

    async function createFolder(name: string, parentKey: string): Promise<DriveItem | null> {
        const parent = parentKey && parentKey !== ROOT ? index.value?.byKey.get(parentKey) : null;
        const res = await callPost<RawCloudItem>(`/KliveCloud/CreateFolder?${queryOf({ name: name.trim(), parentFolderID: parent?.id })}`);
        if (!res.ok) { toastNote('crit', `Couldn't create “${name}”: ${res.error}`); return null; }
        const made = res.data && typeof res.data === 'object' ? (res.data as RawCloudItem) : null;
        if (made?.ItemID) {
            raw = [...raw, made];
            rebuild();
        }
        reloadSoon({ tree: true });
        return made?.ItemID ? index.value?.byKey.get(keyOf(made.ItemID)) ?? null : null;
    }

    async function rename(item: DriveItem, name: string): Promise<boolean> {
        const clean = name.trim();
        if (!clean || clean === item.name) return true;
        const res = await callPost<RawCloudItem>(`/KliveCloud/RenameItem?${queryOf({ itemID: item.id, name: clean })}`);
        if (!res.ok) {
            if (res.missing) { supports.rename = false; oldServer('Renaming'); }
            else toastNote('crit', `Couldn't rename: ${res.error}`);
            return false;
        }
        const row = rawFor(item.key);
        if (row) { row.Name = clean; rebuild(); }
        toastNote('ok', `Renamed to “${clean}”`);
        reloadSoon({ tree: true, links: true });
        return true;
    }

    async function move(items: DriveItem[], targetKey: string): Promise<number> {
        const target = targetKey && targetKey !== ROOT ? index.value?.byKey.get(targetKey) : null;
        let moved = 0;
        let lastError = '';
        for (const item of items) {
            if (target && item.key === target.key) continue;
            const res = await callPost(`/KliveCloud/MoveItem?${queryOf({ itemID: item.id, newParentFolderID: target?.id ?? '' })}`);
            if (res.ok) {
                moved++;
                const row = rawFor(item.key);
                if (row) row.ParentFolderID = target?.id ?? '';
            } else lastError = res.error;
        }
        if (moved) rebuild();
        const where = target ? `“${target.name}”` : 'the top of the drive';
        if (moved && !lastError) toastNote('ok', `Moved ${moved === 1 ? `“${items[0].name}”` : `${moved} items`} to ${where}`);
        else if (moved) toastNote('warn', `Moved ${moved} of ${items.length}. ${lastError}`);
        else if (lastError) toastNote('crit', `Couldn't move: ${lastError}`);
        reloadSoon({ tree: true, links: true });
        return moved;
    }

    async function remove(items: DriveItem[]): Promise<number> {
        let removed = 0;
        let lastError = '';
        const gone = new Set<string>();
        for (const item of items) {
            const res = await callPost(`/KliveCloud/DeleteItem?${queryOf({ itemID: item.id })}`);
            if (res.ok) { removed++; gone.add(item.key); }
            else lastError = res.error;
        }
        const all = index.value;
        if (removed && all) {
            // Everything inside a deleted folder went with it.
            const folders = new Set([...gone].filter(key => all.byKey.get(key)?.type === 'Folder'));
            raw = raw.filter(row => {
                const key = keyOf(row.ItemID);
                const item = all.byKey.get(key);
                return !gone.has(key) && !(item && folders.size && insideAny(all, item, folders));
            });
            rebuild();
        }
        if (removed && !lastError) toastNote('ok', removed === 1 ? `Deleted “${items[0].name}”` : `Deleted ${removed} items`);
        else if (removed) toastNote('warn', `Deleted ${removed} of ${items.length}. ${lastError}`);
        else if (lastError) toastNote('crit', `Couldn't delete: ${lastError}`);
        reloadSoon();
        return removed;
    }

    /** After the access dialog saved: the row's summary changes at once, the rest on reload. */
    function accessSaved(updated: RawCloudItem) {
        const row = rawFor(keyOf(updated?.ItemID));
        if (row) {
            row.MinimumPermissionLevel = updated.MinimumPermissionLevel ?? row.MinimumPermissionLevel;
            rebuild();
        }
        toastNote('ok', `Access updated${updated?.MinimumPermissionLevel ? `: ${updated.MinimumPermissionLevel}` : ''}`);
        reloadSoon({ tree: true, links: true });
    }

    // ── share links ──
    async function createLink(item: DriveItem, mode: ShareMode, hours: number): Promise<DriveLink | null> {
        const res = await callPost<any>(`/KliveCloud/CreateShareLink?${queryOf({ itemID: item.id, permissionMode: item.type === 'Folder' ? mode : 'ReadOnly', expirationHours: hours > 0 ? hours : undefined })}`);
        if (!res.ok) { toastNote('crit', `Couldn't create the link: ${res.error}`); return null; }
        await load({ links: true });
        const code = String(res.data?.ShareCode ?? '');
        return links.value.find(link => link.code === code) ?? (code ? normalizeLink({ ShareCode: code, ItemID: item.id, ItemName: item.name, ItemType: item.type, PermissionMode: res.data?.SharePermissionMode }) : null);
    }

    async function updateLink(link: DriveLink, change: { mode?: ShareMode; hours?: number; adopt?: boolean }): Promise<boolean> {
        const res = await callPost(`/KliveCloud/UpdateShareLink?${queryOf({
            code: link.code,
            permissionMode: change.mode,
            expirationHours: change.hours === undefined ? undefined : change.hours > 0 ? change.hours : 'never',
            adopt: change.adopt ? 1 : undefined,
        })}`);
        if (!res.ok) {
            if (res.missing) {
                supports.updateLink = false;
                // An older server can still change the mode.
                if (change.mode && change.hours === undefined && !change.adopt) {
                    const old = await callPost(`/KliveCloud/UpdateShareLinkPermission?${queryOf({ code: link.code, permissionMode: change.mode })}`);
                    if (old.ok) { await load({ links: true }); return true; }
                }
                oldServer("Changing a link's expiry or owner");
            } else toastNote('crit', `Couldn't change the link: ${res.error}`);
            return false;
        }
        await load({ links: true });
        return true;
    }

    async function deleteLinks(list: DriveLink[]): Promise<number> {
        let done = 0;
        let lastError = '';
        const removedCodes = new Set<string>();
        for (const link of list) {
            const res = await callPost(`/KliveCloud/DeleteShareLink?${queryOf({ code: link.code })}`);
            if (res.ok || res.status === 404) { done++; removedCodes.add(link.code); }
            else lastError = res.error;
        }
        if (done) links.value = links.value.filter(link => !removedCodes.has(link.code));
        if (lastError) toastNote('crit', `Couldn't remove ${list.length - done} link(s): ${lastError}`);
        else toastNote('ok', done === 1 ? 'Link removed: it stops working now' : `${done} links removed`);
        return done;
    }

    // ── uploads ──
    const uploads = createUploadQueue({
        concurrency: 3,
        url: (folderId, fileName) => `${KliveAPIUrl}/KliveCloud/UploadFile?${queryOf({ fileName, parentFolderID: folderId || undefined })}`,
        headers: () => BuildKliveHeaders(false),
        onUploaded: () => reloadSoon({ tree: true, drive: true }),
        onFailed: (_job, xhr) => ReportXhrAccess(xhr, '/KliveCloud/UploadFile'),
    });

    /** Files (and the folders they came in) into a folder, making only the folders that aren't there yet. */
    async function upload(picked: Picked, targetKey: string) {
        if (!picked.files.length) return;
        if (!allowed.value.upload) { toastNote('warn', "Uploading isn't part of your access."); return; }
        const target = targetKey && targetKey !== ROOT ? index.value?.byKey.get(targetKey) : null;
        const baseId = target?.id ?? '';
        const folderFor = new Map<string, string>([['', baseId]]);
        for (const dir of picked.dirs) {
            const slash = dir.lastIndexOf('/');
            const parentDir = slash >= 0 ? dir.slice(0, slash) : '';
            const name = slash >= 0 ? dir.slice(slash + 1) : dir;
            const parentId = folderFor.get(parentDir);
            if (parentId === undefined) continue;
            const siblings = index.value ? childrenIn(index.value, keyOf(parentId) || ROOT) : [];
            const existing = siblings.find(child => child.type === 'Folder' && child.name.toLowerCase() === name.toLowerCase());
            if (existing) { folderFor.set(dir, existing.id); continue; }
            const made = await createFolder(name, keyOf(parentId));
            if (!made) return;
            folderFor.set(dir, made.id);
        }
        uploads.add(picked.files.map(entry => ({
            file: entry.file,
            folderId: folderFor.get(entry.dir) ?? baseId,
            label: entry.dir ? `${entry.dir}/${entry.file.name}` : entry.file.name,
        })));
    }

    const uploading = computed(() => uploads.jobs.filter(job => job.status === 'queued' || job.status === 'uploading').length);

    return {
        allowed, index, links, linkMap, drive, state, loadError, loadedAt, now, reloading, supports, toasts, uploads, uploading,
        start, stop, load, poll, toast: toastNote, dismiss, ensureTickets, ticketUrl, previewSource, download,
        createFolder, rename, move, remove, accessSaved, createLink, updateLink, deleteLinks, upload,
    };
}

export type KliveCloudState = ReturnType<typeof useKliveCloud>;
