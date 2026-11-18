import {
    describeItem, extOf, formatBytes, kindForName, normalizeMode, normalizeType, plural, truthy,
    type FileKind, type ItemType, type PreviewMode, type ShareItem, type ShareMode,
} from './shared';

/* The owner's side of KliveCloud (/klivecloud): the whole drive as GetFolderTree returns it,
   turned into an index the page can browse, search, sort and total without asking the server
   again. Pure: the composable owns fetching, this owns meaning. */

export type Level = 'Editor' | 'Viewer' | 'None';
export type DriveSort = 'name' | 'kind' | 'size' | 'modified' | 'access';
/** Where the main panel is: a folder (by key; '' is the top of the drive) or one of the views across it. */
export type DriveView = 'folder' | 'recent' | 'large' | 'links' | 'shared' | 'search';

/** The drive's top level. */
export const ROOT = '';
/** Where items shared with you sit when you can't see the folder they're in. */
export const SHARED = '~shared';

/** One item as GetFolderTree / Browse return it (KliveCloudRoutes.ItemDto). */
export interface RawCloudItem {
    ItemID: string;
    Name: string;
    RelativePath?: string;
    ParentFolderID?: string | null;
    CreatedDate?: string;
    ModifiedDate?: string;
    CreatedByUserID?: string | null;
    CreatedByName?: string | null;
    ItemType: unknown;
    FileSizeBytes?: number;
    MyLevel?: string;
    MinimumPermissionLevel?: string;
    Access?: { Everyone: string | null; Inherit: boolean; People: { ProfileId: string; Name: string; Level: string }[]; Summary: string } | null;
}

export interface DriveItem extends ShareItem {
    /** Folders: folders anywhere inside. */
    folders: number;
    /** The newest change anywhere inside a folder (its own for a file). */
    newest: number;
    level: Level;
    /** "Everyone", "3 people", "Inherited", "Only Klives". */
    access: string;
    createdBy: string;
    createdById: string;
    /** Written through a share link rather than by a profile. */
    viaLink: boolean;
    /** The folders above it that the viewer can see, top first, as names. */
    path: string;
}

export interface KindTotal { kind: FileKind; files: number; bytes: number }

export interface DriveIndex {
    byKey: Map<string, DriveItem>;
    /** ROOT for the top of the drive, SHARED for shared-with-you items whose folder you can't see. */
    childrenOf: Map<string, DriveItem[]>;
    files: number;
    folders: number;
    bytes: number;
    kinds: KindTotal[];
    /** Items written through share links (visitors' uploads). */
    viaLinks: { files: number; bytes: number };
    sharedCount: number;
    newest: number;
}

export const keyOf = (id: unknown) => String(id ?? '').trim().toLowerCase();

const PREVIEWS: Partial<Record<FileKind, PreviewMode>> = { image: 'image', video: 'video', audio: 'audio', pdf: 'pdf', text: 'text', code: 'text' };
const TEXT_EXTS = new Set(['csv', 'tsv']);

function previewOf(kind: FileKind, ext: string): PreviewMode {
    if (kind === 'image' && (ext === 'heic' || ext === 'heif')) return 'none';
    return PREVIEWS[kind] ?? (TEXT_EXTS.has(ext) ? 'text' : 'none');
}

function levelOf(value: unknown): Level {
    const v = String(value ?? '').toLowerCase();
    return v === 'editor' ? 'Editor' : v === 'viewer' ? 'Viewer' : v === 'none' ? 'None' : 'Editor';
}

function toItem(raw: RawCloudItem): DriveItem {
    const type = normalizeType(raw.ItemType);
    const name = String(raw.Name ?? '');
    const ext = type === 'File' ? extOf(name) : '';
    const kind: FileKind = type === 'Folder' ? 'folder' : kindForName(name);
    const modified = Date.parse(raw.ModifiedDate ?? '');
    const createdById = String(raw.CreatedByUserID ?? '');
    const viaLink = createdById.startsWith('shared:');
    return {
        id: String(raw.ItemID ?? ''),
        key: keyOf(raw.ItemID),
        name,
        ext,
        parentKey: keyOf(raw.ParentFolderID),
        type,
        kind,
        preview: type === 'File' ? previewOf(kind, ext) : 'none',
        bytes: type === 'File' ? Math.max(0, Number(raw.FileSizeBytes) || 0) : 0,
        files: 0,
        entries: 0,
        folders: 0,
        modified,
        newest: modified,
        created: Date.parse(raw.CreatedDate ?? ''),
        level: levelOf(raw.MyLevel),
        access: String(raw.MinimumPermissionLevel ?? ''),
        createdBy: viaLink ? 'Share link' : String(raw.CreatedByName ?? ''),
        createdById,
        viaLink,
        path: '',
    };
}

export function buildDriveIndex(raw: RawCloudItem[]): DriveIndex {
    const byKey = new Map<string, DriveItem>();
    for (const row of raw ?? []) {
        const item = toItem(row);
        if (item.key && !byKey.has(item.key)) byKey.set(item.key, item);
    }

    const childrenOf = new Map<string, DriveItem[]>();
    const add = (parent: string, item: DriveItem) => {
        const list = childrenOf.get(parent);
        if (list) list.push(item);
        else childrenOf.set(parent, [item]);
    };
    let sharedCount = 0;
    for (const item of byKey.values()) {
        const parent = item.parentKey ? byKey.get(item.parentKey) : undefined;
        if (!item.parentKey) add(ROOT, item);
        else if (parent && parent.type === 'Folder' && parent.key !== item.key) add(item.parentKey, item);
        else {
            // Its folder isn't one you can see: it was shared with you on its own.
            item.parentKey = SHARED;
            add(SHARED, item);
            sharedCount++;
        }
    }

    // Folder totals, innermost first; `seen` guards against a cycle in bad data.
    const seen = new Set<string>();
    const total = (folder: DriveItem) => {
        if (seen.has(folder.key)) return;
        seen.add(folder.key);
        const kids = childrenOf.get(folder.key) ?? [];
        folder.entries = kids.length;
        folder.files = 0;
        folder.folders = 0;
        folder.bytes = 0;
        for (const kid of kids) {
            if (kid.type === 'Folder') {
                total(kid);
                folder.files += kid.files;
                folder.folders += kid.folders + 1;
            } else {
                folder.files += 1;
            }
            folder.bytes += kid.bytes;
            if (Number.isFinite(kid.newest) && !(kid.newest <= folder.newest)) folder.newest = kid.newest;
        }
    };
    for (const item of byKey.values()) if (item.type === 'Folder') total(item);

    // Paths, from the top down, using only folders the viewer can see.
    const pathOf = (item: DriveItem): string => {
        const names: string[] = [];
        const guard = new Set<string>();
        let cursor = byKey.get(item.parentKey);
        while (cursor && !guard.has(cursor.key)) {
            guard.add(cursor.key);
            names.unshift(cursor.name);
            cursor = byKey.get(cursor.parentKey);
        }
        return names.join(' / ');
    };
    for (const item of byKey.values()) item.path = pathOf(item);

    let files = 0, folders = 0, bytes = 0, newest = 0;
    const kinds = new Map<FileKind, KindTotal>();
    const viaLinks = { files: 0, bytes: 0 };
    for (const item of byKey.values()) {
        if (item.type === 'Folder') { folders++; continue; }
        files++;
        bytes += item.bytes;
        if (item.modified > newest) newest = item.modified;
        const totalForKind = kinds.get(item.kind) ?? { kind: item.kind, files: 0, bytes: 0 };
        totalForKind.files++;
        totalForKind.bytes += item.bytes;
        kinds.set(item.kind, totalForKind);
        if (item.viaLink) { viaLinks.files++; viaLinks.bytes += item.bytes; }
    }

    return {
        byKey, childrenOf, files, folders, bytes, newest, viaLinks, sharedCount,
        kinds: [...kinds.values()].sort((a, b) => b.bytes - a.bytes || b.files - a.files),
    };
}

/** [top folder, …, item]. */
export function pathTo(index: DriveIndex, key: string): DriveItem[] {
    const path: DriveItem[] = [];
    const seen = new Set<string>();
    let cursor = index.byKey.get(key);
    while (cursor && !seen.has(cursor.key)) {
        seen.add(cursor.key);
        path.unshift(cursor);
        cursor = index.byKey.get(cursor.parentKey);
    }
    return path;
}

/** Is `key` the folder `folderKey` or somewhere inside it? */
export function isWithin(index: DriveIndex, key: string, folderKey: string) {
    return pathTo(index, key).some(step => step.key === folderKey);
}

export function childrenIn(index: DriveIndex, folderKey: string): DriveItem[] {
    return index.childrenOf.get(folderKey) ?? [];
}

/** Every folder, as the move dialog and the palette list them: [folder, its path]. */
export function allFolders(index: DriveIndex): DriveItem[] {
    return [...index.byKey.values()].filter(item => item.type === 'Folder');
}

// ── search ───────────────────────────────────────────────────────────────────

const KIND_WORDS: Record<string, FileKind> = {
    photo: 'image', photos: 'image', image: 'image', images: 'image', picture: 'image', pictures: 'image',
    video: 'video', videos: 'video', movie: 'video', audio: 'audio', music: 'audio', song: 'audio',
    pdf: 'pdf', pdfs: 'pdf', doc: 'document', docs: 'document', document: 'document', sheet: 'spreadsheet',
    spreadsheet: 'spreadsheet', slides: 'presentation', archive: 'archive', zip: 'archive', code: 'code', folder: 'folder', folders: 'folder',
};

/**
 * Everything on the drive whose name holds every word of the query; a word that names a kind
 * ("photos", "pdf") may match the kind instead. Best matches first: a name that is the query,
 * then one that starts with it, then the rest newest first.
 */
export function searchDrive(index: DriveIndex, query: string, limit = 400): DriveItem[] {
    const raw = query.trim().toLowerCase();
    const terms = raw.split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const scored: { item: DriveItem; score: number }[] = [];
    for (const item of index.byKey.values()) {
        const name = item.name.toLowerCase();
        let ok = true;
        for (const term of terms) {
            if (name.includes(term) || item.ext === term) continue;
            if (KIND_WORDS[term] === item.kind) continue;
            ok = false;
            break;
        }
        if (!ok) continue;
        const score = name === raw ? 3 : name.startsWith(raw) ? 2 : name.includes(raw) ? 1 : 0;
        scored.push({ item, score });
    }
    scored.sort((a, b) => b.score - a.score || (b.item.newest || 0) - (a.item.newest || 0));
    return scored.slice(0, limit).map(entry => entry.item);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function sortDrive<T extends DriveItem>(items: readonly T[], key: DriveSort, dir: 1 | -1): T[] {
    const byName = (a: T, b: T) => collator.compare(a.name, b.name);
    const compare = (a: T, b: T) => {
        switch (key) {
            case 'size': return a.bytes - b.bytes || byName(a, b);
            case 'modified': return (a.newest || 0) - (b.newest || 0) || byName(a, b);
            case 'kind': return collator.compare(describeItem(a), describeItem(b)) || byName(a, b);
            case 'access': return collator.compare(a.access, b.access) || byName(a, b);
            default: return byName(a, b);
        }
    };
    return [...items].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'Folder' ? -1 : 1;
        return compare(a, b) * dir;
    });
}

/** The newest files anywhere, for the Recent view. */
export function recentFiles(index: DriveIndex, limit = 60): DriveItem[] {
    return [...index.byKey.values()]
        .filter(item => item.type === 'File' && Number.isFinite(item.modified))
        .sort((a, b) => b.modified - a.modified)
        .slice(0, limit);
}

/** The biggest files anywhere, for the Large files view. */
export function largestFiles(index: DriveIndex, limit = 60): DriveItem[] {
    return [...index.byKey.values()]
        .filter(item => item.type === 'File')
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, limit);
}

/** "Today", "Yesterday", "This week", "Earlier this month", "October 2026": the Recent view's groups. */
export function dayGroup(ms: number, now: number): string {
    if (!Number.isFinite(ms)) return 'Undated';
    const start = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const days = Math.round((start(now) - start(ms)) / 86_400_000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return 'This week';
    const d = new Date(ms);
    const n = new Date(now);
    if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth()) return 'Earlier this month';
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** "12 folders · 41 files · 1.2 GB" (the parts that aren't zero). */
export function folderSummary(item: Pick<DriveItem, 'folders' | 'files' | 'bytes' | 'entries'>, deep = true): string {
    if (!item.entries) return 'Empty';
    const parts: string[] = [];
    if (deep) {
        if (item.folders) parts.push(plural(item.folders, 'folder'));
        if (item.files) parts.push(plural(item.files, 'file'));
    } else {
        parts.push(plural(item.entries, 'item'));
    }
    if (item.bytes) parts.push(formatBytes(item.bytes));
    return parts.join(' · ');
}

// ── selection ────────────────────────────────────────────────────────────────

/** The keys from `anchor` to `target` in the order shown (a shift-click). */
export function rangeKeys(order: readonly string[], anchor: string, target: string): string[] {
    const a = order.indexOf(anchor);
    const b = order.indexOf(target);
    if (a < 0 || b < 0) return [target];
    return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

// ── share links ──────────────────────────────────────────────────────────────

/** One row of ListShareLinks (KliveCloudRoutes.ShareLinkDto). Older servers send fewer fields. */
export interface RawShareLink {
    ShareCode: string;
    ItemID: string;
    CreatedByUserID?: string | null;
    CreatedByName?: string | null;
    CreatedDate?: string;
    ExpirationDate?: string | null;
    PermissionMode?: unknown;
    SharePermissionMode?: unknown;
    ItemName?: string | null;
    ItemType?: string | null;
    ItemPath?: string | null;
    ItemBytes?: number | null;
    Servable?: unknown;
    Problem?: string | null;
    ProblemText?: string | null;
    Usage?: {
        Opens?: number; Downloads?: number; BytesServed?: number;
        LastOpenedUtc?: string | null; LastDownloadUtc?: string | null; CountingSinceUtc?: string | null;
    } | null;
}

export type LinkProblem = 'Expired' | 'ItemDeleted' | 'NoOwner' | 'OwnerLostAccess' | 'Unknown';
export type LinkState = 'ok' | 'expiring' | 'broken';

export interface DriveLink {
    code: string;
    itemId: string;
    itemKey: string;
    name: string;
    type: ItemType | null;
    path: string;
    bytes: number | null;
    mode: ShareMode;
    expires: number | null;
    created: number;
    createdBy: string;
    createdById: string;
    problem: LinkProblem | null;
    problemText: string;
    /** The server counts use (a newer server than this page may be talking to). */
    counted: boolean;
    opens: number;
    downloads: number;
    bytesServed: number;
    lastOpened: number | null;
    lastDownload: number | null;
    countingSince: number | null;
}

const PROBLEM_TEXT: Record<LinkProblem, string> = {
    Expired: 'Expired: it stops working on the next visit.',
    ItemDeleted: 'What it shared was deleted.',
    NoOwner: 'Nobody owns it, and a link only serves what its owner can see.',
    OwnerLostAccess: 'Its owner can no longer see what it shares.',
    Unknown: "This link can't open.",
};

const ms = (value: string | null | undefined) => {
    const t = Date.parse(value ?? '');
    return Number.isFinite(t) ? t : null;
};

export function normalizeLink(raw: RawShareLink): DriveLink {
    const servable = raw.Servable === undefined ? true : truthy(raw.Servable);
    let problem: LinkProblem | null = null;
    if (raw.Problem && raw.Problem in PROBLEM_TEXT) problem = raw.Problem as LinkProblem;
    else if (!servable) problem = raw.ItemName ? 'Unknown' : 'ItemDeleted';
    const usage = raw.Usage ?? null;
    return {
        code: String(raw.ShareCode ?? ''),
        itemId: String(raw.ItemID ?? ''),
        itemKey: keyOf(raw.ItemID),
        name: raw.ItemName ? String(raw.ItemName) : 'Deleted item',
        type: raw.ItemType ? normalizeType(raw.ItemType) : null,
        path: String(raw.ItemPath ?? '').replace(/\\/g, '/'),
        bytes: typeof raw.ItemBytes === 'number' ? raw.ItemBytes : null,
        mode: normalizeMode(raw.PermissionMode ?? raw.SharePermissionMode),
        expires: ms(raw.ExpirationDate),
        created: ms(raw.CreatedDate) ?? NaN,
        createdBy: String(raw.CreatedByName ?? ''),
        createdById: String(raw.CreatedByUserID ?? ''),
        problem,
        problemText: problem ? String(raw.ProblemText || PROBLEM_TEXT[problem]) : '',
        counted: !!usage,
        opens: Number(usage?.Opens) || 0,
        downloads: Number(usage?.Downloads) || 0,
        bytesServed: Number(usage?.BytesServed) || 0,
        lastOpened: ms(usage?.LastOpenedUtc),
        lastDownload: ms(usage?.LastDownloadUtc),
        countingSince: ms(usage?.CountingSinceUtc),
    };
}

const SOON = 3 * 86_400_000;

export function linkState(link: DriveLink, now: number): LinkState {
    if (link.problem) return 'broken';
    if (link.expires != null && link.expires <= now) return 'broken';
    if (link.expires != null && link.expires - now < SOON) return 'expiring';
    return 'ok';
}

/** Links a problem can be fixed for in place: taking it over makes it serve your access. */
export function canAdopt(link: DriveLink) {
    return link.problem === 'NoOwner' || link.problem === 'OwnerLostAccess';
}

export const MODE_LABEL: Record<ShareMode, string> = { ReadOnly: 'View', Write: 'Add', WriteDelete: 'Add & delete' };
export const MODE_HINT: Record<ShareMode, string> = {
    ReadOnly: 'Visitors can open and download.',
    Write: 'Visitors can also upload files and make folders.',
    WriteDelete: 'Visitors can also upload, move and delete.',
};

/** Expiry choices, in hours (0 = never). */
export const EXPIRY_CHOICES: { hours: number; label: string }[] = [
    { hours: 0, label: 'Never' },
    { hours: 1, label: '1 hour' },
    { hours: 24, label: '1 day' },
    { hours: 24 * 7, label: '7 days' },
    { hours: 24 * 30, label: '30 days' },
];

export function linksByItem(links: readonly DriveLink[]): Map<string, DriveLink[]> {
    const map = new Map<string, DriveLink[]>();
    for (const link of links) {
        const list = map.get(link.itemKey);
        if (list) list.push(link);
        else map.set(link.itemKey, [link]);
    }
    return map;
}

export function shareUrl(origin: string, code: string) {
    return `${origin}/shared/${encodeURIComponent(code)}`;
}

// ── drive ────────────────────────────────────────────────────────────────────

export interface RawDriveInfo {
    DriveName?: string;
    DriveFormat?: string;
    TotalCapacityBytes?: number;
    UsedCapacityBytes?: number;
    FreeCapacityBytes?: number;
    UsagePercentage?: number;
}

export interface DriveSpace { name: string; total: number; used: number; free: number; pct: number }

export function normalizeDrive(raw: RawDriveInfo | null | undefined): DriveSpace | null {
    if (!raw || !Number(raw.TotalCapacityBytes)) return null;
    const total = Number(raw.TotalCapacityBytes) || 0;
    const free = Number(raw.FreeCapacityBytes) || 0;
    const used = Number(raw.UsedCapacityBytes) || Math.max(0, total - free);
    return { name: String(raw.DriveName ?? '').replace(/\\$/, ''), total, used, free, pct: total ? (used / total) * 100 : 0 };
}

/** The kinds' order and colour key on the page (the colour lives in klivecloud.scss). */
export const KIND_LABEL: Record<FileKind, string> = {
    folder: 'Folders', image: 'Images', video: 'Video', audio: 'Audio', pdf: 'PDFs', text: 'Text', code: 'Code',
    archive: 'Archives', document: 'Documents', spreadsheet: 'Sheets', presentation: 'Slides', app: 'Apps', font: 'Fonts', other: 'Other',
};

/** One line of the Ctrl K palette. */
export interface CloudCommand {
    id: string;
    title: string;
    group: string;
    icon?: string;
    kind?: FileKind;
    hint?: string;
    keys?: string;
    keywords?: string;
    run: () => void;
}

export { describeItem, formatBytes, plural };
