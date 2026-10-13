import { KliveAPIUrl } from '~/scripts/APIInterface';

/* The public share page (/shared/[code]): what GetSharedItemInfo returns, turned into an index
   the page can browse, sort and search without going back to the server. */

export type ItemType = 'File' | 'Folder';
export type ShareMode = 'ReadOnly' | 'Write' | 'WriteDelete';
export type FileKind =
    | 'folder' | 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'code' | 'archive'
    | 'document' | 'spreadsheet' | 'presentation' | 'app' | 'font' | 'other';
export type PreviewMode = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'none';
export type SortKey = 'name' | 'kind' | 'size' | 'modified';

/** One item as /KliveCloud/GetSharedItemInfo returns it. */
export interface RawSharedItem {
    ItemID: string;
    Name: string;
    RelativePath?: string;
    ParentFolderID?: string | null;
    CreatedDate?: string;
    ModifiedDate?: string;
    ItemType: unknown;
    FileSizeBytes?: number;
    IsImage?: boolean;
    IsVideo?: boolean;
}

export interface RawShareInfo extends RawSharedItem {
    ShareCode: string;
    SharePermissionMode?: unknown;
    PermissionMode?: unknown;
    CanWrite?: unknown;
    CanDelete?: unknown;
    CanDownloadZip?: unknown;
    ExpirationDate?: string | null;
    Children?: RawSharedItem[];
}

export interface ShareItem {
    id: string;
    /** Lower-cased id: what every lookup uses. */
    key: string;
    name: string;
    ext: string;
    /** '' for the shared item itself. */
    parentKey: string;
    type: ItemType;
    kind: FileKind;
    preview: PreviewMode;
    /** A file's size, or everything inside a folder. */
    bytes: number;
    /** Folders: files anywhere inside. */
    files: number;
    /** Folders: direct children. */
    entries: number;
    modified: number;
    created: number;
}

export interface ShareIndex {
    root: ShareItem;
    byKey: Map<string, ShareItem>;
    childrenOf: Map<string, ShareItem[]>;
    totalFiles: number;
    totalFolders: number;
}

export const keyOf = (id: unknown) => String(id ?? '').trim().toLowerCase();

export function normalizeType(value: unknown): ItemType {
    const v = String(value ?? '').trim().toLowerCase();
    return v === 'folder' || v === '1' ? 'Folder' : 'File';
}

export function normalizeMode(value: unknown): ShareMode {
    const v = String(value ?? '').trim().replace(/[-_\s]/g, '').toLowerCase();
    if (v === '2' || v === 'writedelete' || v === 'delete') return 'WriteDelete';
    if (v === '1' || v === 'write') return 'Write';
    return 'ReadOnly';
}

export function truthy(value: unknown) {
    if (value === true || value === 1) return true;
    const v = String(value ?? '').trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
}

// ── kinds ────────────────────────────────────────────────────────────────────

const KIND_BY_EXT: Record<string, FileKind> = {};
const register = (kind: FileKind, exts: string) => exts.split(' ').forEach(ext => { KIND_BY_EXT[ext] = kind; });
register('image', 'jpg jpeg png gif webp bmp svg tif tiff ico heic heif avif jfif');
register('video', 'mp4 m4v mov qt mkv webm avi wmv flv mpg mpeg 3gp 3g2 ogv ts mts m2ts vob asf divx mxf');
register('audio', 'mp3 wav flac aac m4a ogg oga opus wma aiff aif alac mid midi amr');
register('pdf', 'pdf');
register('archive', 'zip rar 7z tar gz tgz bz2 xz zst iso dmg cab');
register('document', 'doc docx odt rtf pages');
register('spreadsheet', 'xls xlsx ods csv tsv numbers');
register('presentation', 'ppt pptx odp key');
register('text', 'txt md markdown log srt vtt nfo');
register('code', 'js mjs cjs ts tsx jsx vue svelte py cs java kt swift c h cpp hpp cc go rs rb php lua r pl sh bash zsh ps1 bat cmd sql html htm css scss sass less json jsonc xml yml yaml toml ini cfg conf env gradle csproj sln');
register('app', 'exe msi apk ipa appimage deb rpm jar');
register('font', 'ttf otf woff woff2');

/** Formats every browser can show in an <img> straight from the download. */
export const BROWSER_IMAGES = new Set(['jpg', 'jpeg', 'jfif', 'png', 'gif', 'webp', 'bmp', 'ico', 'avif']);
/** Formats a <video> element can usually play as stored; anything else goes through the server's MP4. */
export const BROWSER_VIDEOS = new Set(['mp4', 'm4v', 'webm', 'mov', 'ogv', 'ogg']);
/** Images the server makes thumbnails of (videos always get one, from a frame). */
export const SERVER_THUMBNAILS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tif', 'tiff', 'ico']);

/** Whether GetSharedPreview can produce a picture of this file. */
export function hasThumbnail(item: { type: ItemType; kind: FileKind; ext: string }) {
    return item.type === 'File' && (item.kind === 'video' || (item.kind === 'image' && SERVER_THUMBNAILS.has(item.ext)));
}
const TEXT_PREVIEW = new Set(['csv', 'tsv']);

export function extOf(name: string) {
    const dot = name.lastIndexOf('.');
    return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : '';
}

/** The kind a file name suggests, for files that aren't in the share yet (uploads). */
export function kindForName(name: string): FileKind {
    return KIND_BY_EXT[extOf(name)] ?? 'other';
}

function kindOf(type: ItemType, ext: string, raw: RawSharedItem): FileKind {
    if (type === 'Folder') return 'folder';
    if (raw.IsVideo) return 'video';
    if (raw.IsImage) return 'image';
    return KIND_BY_EXT[ext] ?? 'other';
}

function previewOf(kind: FileKind, ext: string): PreviewMode {
    switch (kind) {
        case 'image': return ext === 'heic' || ext === 'heif' ? 'none' : 'image';
        case 'video': return 'video';
        case 'audio': return 'audio';
        case 'pdf': return 'pdf';
        case 'text':
        case 'code': return 'text';
        default: return TEXT_PREVIEW.has(ext) ? 'text' : 'none';
    }
}

const TYPE_NAMES: Record<string, string> = {
    jpg: 'JPEG image', jpeg: 'JPEG image', jfif: 'JPEG image', png: 'PNG image', gif: 'GIF image', webp: 'WebP image',
    svg: 'SVG image', heic: 'HEIC image', heif: 'HEIF image', avif: 'AVIF image', tif: 'TIFF image', tiff: 'TIFF image',
    bmp: 'Bitmap image', ico: 'Icon',
    mp4: 'MP4 video', m4v: 'MP4 video', mov: 'QuickTime video', qt: 'QuickTime video', mkv: 'MKV video', webm: 'WebM video',
    avi: 'AVI video', wmv: 'WMV video', flv: 'Flash video',
    mp3: 'MP3 audio', wav: 'WAV audio', flac: 'FLAC audio', aac: 'AAC audio', m4a: 'M4A audio', ogg: 'Ogg media',
    opus: 'Opus audio', wma: 'WMA audio', mid: 'MIDI', midi: 'MIDI',
    pdf: 'PDF document',
    doc: 'Word document', docx: 'Word document', odt: 'OpenDocument text', rtf: 'Rich text', pages: 'Pages document',
    xls: 'Excel spreadsheet', xlsx: 'Excel spreadsheet', ods: 'OpenDocument sheet', csv: 'CSV', tsv: 'TSV', numbers: 'Numbers sheet',
    ppt: 'PowerPoint', pptx: 'PowerPoint', odp: 'OpenDocument slides', key: 'Keynote',
    zip: 'ZIP archive', rar: 'RAR archive', '7z': '7-Zip archive', tar: 'Tar archive', gz: 'Gzip archive', tgz: 'Gzip archive',
    iso: 'Disk image', dmg: 'Disk image',
    txt: 'Plain text', md: 'Markdown', markdown: 'Markdown', log: 'Log', srt: 'Subtitles', vtt: 'Subtitles',
    json: 'JSON', xml: 'XML', yml: 'YAML', yaml: 'YAML', toml: 'TOML', ini: 'Settings', cfg: 'Settings', conf: 'Settings',
    js: 'JavaScript', mjs: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', jsx: 'JavaScript', vue: 'Vue component',
    py: 'Python', cs: 'C#', java: 'Java', kt: 'Kotlin', swift: 'Swift', c: 'C', h: 'C header', cpp: 'C++', go: 'Go',
    rs: 'Rust', rb: 'Ruby', php: 'PHP', lua: 'Lua', sql: 'SQL', html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS',
    sh: 'Shell script', ps1: 'PowerShell', bat: 'Batch file', cmd: 'Batch file',
    exe: 'Windows app', msi: 'Windows installer', apk: 'Android app', ipa: 'iOS app', jar: 'Java archive',
    ttf: 'Font', otf: 'Font', woff: 'Web font', woff2: 'Web font',
};

const KIND_NAMES: Partial<Record<FileKind, string>> = {
    image: 'image', video: 'video', audio: 'audio', archive: 'archive', document: 'document',
    spreadsheet: 'spreadsheet', presentation: 'slides', code: 'source', text: 'text',
};

/** "JPEG image", "Word document", "12 items". */
export function describeItem(item: ShareItem) {
    if (item.type === 'Folder') return item.entries === 0 ? 'Empty' : plural(item.entries, 'item');
    const known = TYPE_NAMES[item.ext];
    if (known) return known;
    const ext = item.ext.toUpperCase();
    const kind = KIND_NAMES[item.kind];
    if (ext && kind) return `${ext} ${kind}`;
    return ext ? `${ext} file` : 'File';
}

export function plural(n: number, word: string, many = `${word}s`) {
    // A fixed locale: the server render and the browser must print the same digits.
    return `${n.toLocaleString('en-GB')} ${n === 1 ? word : many}`;
}

// ── index ────────────────────────────────────────────────────────────────────

function toItem(raw: RawSharedItem, parentKey: string): ShareItem {
    const type = normalizeType(raw.ItemType);
    const name = String(raw.Name ?? '');
    const ext = type === 'File' ? extOf(name) : '';
    const kind = kindOf(type, ext, raw);
    return {
        id: String(raw.ItemID ?? ''),
        key: keyOf(raw.ItemID),
        name,
        ext,
        parentKey,
        type,
        kind,
        preview: type === 'File' ? previewOf(kind, ext) : 'none',
        bytes: type === 'File' ? Math.max(0, Number(raw.FileSizeBytes) || 0) : 0,
        files: 0,
        entries: 0,
        modified: Date.parse(raw.ModifiedDate ?? ''),
        created: Date.parse(raw.CreatedDate ?? ''),
    };
}

export function buildShareIndex(raw: RawShareInfo): ShareIndex {
    const root = toItem(raw, '');
    const byKey = new Map<string, ShareItem>([[root.key, root]]);
    for (const child of raw.Children ?? []) {
        const item = toItem(child, keyOf(child.ParentFolderID));
        if (item.key && !byKey.has(item.key)) byKey.set(item.key, item);
    }

    const childrenOf = new Map<string, ShareItem[]>();
    for (const item of byKey.values()) {
        if (item === root) continue;
        // Something served whose folder isn't (the folder isn't shared, the item is): it belongs at the top.
        const parent = byKey.get(item.parentKey);
        if (!parent || parent.type !== 'Folder' || parent.key === item.key) item.parentKey = root.key;
        const list = childrenOf.get(item.parentKey);
        if (list) list.push(item);
        else childrenOf.set(item.parentKey, [item]);
    }

    // Folder totals, innermost first; `seen` guards against a cycle in bad data.
    const seen = new Set<string>();
    const total = (folder: ShareItem): void => {
        if (seen.has(folder.key)) return;
        seen.add(folder.key);
        const kids = childrenOf.get(folder.key) ?? [];
        folder.entries = kids.length;
        folder.bytes = 0;
        folder.files = 0;
        for (const kid of kids) {
            if (kid.type === 'Folder') {
                total(kid);
                folder.files += kid.files;
            } else {
                folder.files += 1;
            }
            folder.bytes += kid.bytes;
        }
    };
    if (root.type === 'Folder') total(root);

    let totalFolders = 0;
    for (const item of byKey.values()) if (item !== root && item.type === 'Folder') totalFolders++;
    return { root, byKey, childrenOf, totalFiles: root.type === 'Folder' ? root.files : 1, totalFolders };
}

/** [shared folder, …, item]. */
export function pathTo(index: ShareIndex, key: string): ShareItem[] {
    const path: ShareItem[] = [];
    const seen = new Set<string>();
    let cursor = index.byKey.get(key);
    while (cursor && !seen.has(cursor.key)) {
        seen.add(cursor.key);
        path.unshift(cursor);
        if (cursor === index.root) break;
        cursor = index.byKey.get(cursor.parentKey);
    }
    return path;
}

/** Is `key` the folder `folderKey` or somewhere inside it? */
export function isWithin(index: ShareIndex, key: string, folderKey: string) {
    return pathTo(index, key).some(step => step.key === folderKey);
}

/** Everything in the share whose name contains every word of the query. */
export function searchShare(index: ShareIndex, query: string): ShareItem[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const hits: ShareItem[] = [];
    for (const item of index.byKey.values()) {
        if (item === index.root) continue;
        const name = item.name.toLowerCase();
        if (terms.every(term => name.includes(term))) hits.push(item);
    }
    return hits;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function sortItems(items: ShareItem[], key: SortKey, dir: 1 | -1): ShareItem[] {
    const byName = (a: ShareItem, b: ShareItem) => collator.compare(a.name, b.name);
    const compare = (a: ShareItem, b: ShareItem) => {
        switch (key) {
            case 'size': return a.bytes - b.bytes || byName(a, b);
            case 'modified': return (a.modified || 0) - (b.modified || 0) || byName(a, b);
            case 'kind': return collator.compare(describeItem(a), describeItem(b)) || byName(a, b);
            default: return byName(a, b);
        }
    };
    return [...items].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'Folder' ? -1 : 1;
        return compare(a, b) * dir;
    });
}

// ── formatting ───────────────────────────────────────────────────────────────

export function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, i);
    const text = i === 0 || value >= 10 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, '');
    return `${text} ${units[i]}`;
}

const dayStart = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const timeOf = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * "Today, 14:03", "Yesterday, 09:12", "12 Oct, 14:03", "3 Mar 2024". Without `now` (the server
 * render, and the first client render that must match it) a plain UTC date.
 */
export function formatWhen(ms: number, now: number | null) {
    if (!Number.isFinite(ms)) return '—';
    if (now == null) return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    const days = Math.round((dayStart(now) - dayStart(ms)) / 86_400_000);
    if (days === 0) return `Today, ${timeOf(ms)}`;
    if (days === 1) return `Yesterday, ${timeOf(ms)}`;
    const d = new Date(ms);
    if (d.getFullYear() === new Date(now).getFullYear()) {
        return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${timeOf(ms)}`;
    }
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "12 Oct 2026, 14:03". */
export function formatFull(ms: number, now: number | null) {
    if (!Number.isFinite(ms)) return '—';
    if (now == null) return formatWhen(ms, null);
    return new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function describeExpiry(ms: number, now: number | null): { text: string; soon: boolean } {
    if (now == null) return { text: `Expires ${formatWhen(ms, null)}`, soon: false };
    const left = ms - now;
    if (left <= 0) return { text: 'Expired', soon: true };
    const minutes = Math.round(left / 60_000);
    if (minutes < 60) return { text: `Expires in ${plural(Math.max(1, minutes), 'minute')}`, soon: true };
    const hours = Math.round(left / 3_600_000);
    if (hours < 24) return { text: `Expires in ${plural(hours, 'hour')}`, soon: true };
    const days = Math.round(left / 86_400_000);
    if (days <= 7) return { text: `Expires in ${plural(days, 'day')}`, soon: false };
    const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
    const date = new Date(ms).toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
    return { text: `Expires ${date}`, soon: false };
}

// ── API ──────────────────────────────────────────────────────────────────────

function api(route: string, params: Record<string, string | undefined>) {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) if (value) query.set(name, value);
    return `${KliveAPIUrl}/KliveCloud/${route}?${query.toString()}`;
}

/** Links into one share. A file shared on its own is addressed by the code alone. */
export function shareApi(code: string, single: boolean) {
    const target = (item?: ShareItem) => (single || !item ? undefined : item.id);
    return {
        info: () => api('GetSharedItemInfo', { code }),
        download: (item?: ShareItem) => api('DownloadShared', { code, itemID: target(item) }),
        stream: (item?: ShareItem) => api('StreamSharedVideo', { code, itemID: target(item) }),
        playable: (item?: ShareItem) => api('StreamSharedVideoEmbed', { code, itemID: target(item) }),
        preview: (item: ShareItem | undefined, width = 320, height = 320) =>
            api('GetSharedPreview', { code, itemID: target(item), maxWidth: String(width), maxHeight: String(height) }),
        zip: (folderId?: string, itemIds?: string[]) =>
            api('DownloadSharedZip', { code, folderID: folderId, itemIDs: itemIds?.length ? itemIds.join(',') : undefined }),
        upload: (folderId: string, fileName: string) => api('UploadShared', { code, parentFolderID: folderId, fileName }),
        createFolder: (parentId: string, name: string) => api('CreateSharedFolder', { code, parentFolderID: parentId, name }),
        remove: (itemId: string) => api('DeleteSharedItem', { code, itemID: itemId }),
        move: (itemId: string, folderId: string) => api('MoveSharedItem', { code, itemID: itemId, newParentFolderID: folderId }),
    };
}

const API_ERRORS: Record<string, string> = {
    ShareLinkExpired: 'This link has expired.',
    ShareLinkNotFound: 'This link no longer works.',
    SharedItemNotFound: 'That item is no longer here.',
    SharedFolderNotFound: 'That folder is no longer here.',
    SharedFolderWriteNotAllowed: "This link doesn't allow changes.",
    SharedFolderDeleteNotAllowed: "This link doesn't allow deleting.",
    NewParentFolderNotFound: 'That folder is no longer here.',
    EmptyFileBody: "Empty files can't be uploaded.",
    FolderNameRequired: 'Enter a folder name.',
    FileNameRequired: 'The file has no name.',
    MoveFailed: "Couldn't move it.",
    DeleteFailed: "Couldn't delete it.",
};

/** A readable sentence for a failed share request. */
export function describeApiError(status: number, body: string) {
    const text = (body || '').trim();
    if (text.startsWith('{')) {
        try {
            const parsed = JSON.parse(text);
            const code = String(parsed?.error ?? '');
            if (API_ERRORS[code]) return API_ERRORS[code];
            if (parsed?.message) return String(parsed.message);
        } catch { /* not JSON after all */ }
    }
    if (API_ERRORS[text]) return API_ERRORS[text];
    if (status === 413) return 'That file is too large.';
    if (status === 409 && text && text.length < 200) return text;
    if (status === 0) return "Couldn't reach KliveCloud.";
    if (status >= 500) return 'Something went wrong on the server.';
    return `Request failed (${status}).`;
}

export async function postShare(url: string): Promise<{ ok: true; body: string } | { ok: false; error: string }> {
    try {
        const res = await fetch(url, { method: 'POST', mode: 'cors' });
        const body = await res.text().catch(() => '');
        return res.ok ? { ok: true, body } : { ok: false, error: describeApiError(res.status, body) };
    } catch {
        return { ok: false, error: describeApiError(0, '') };
    }
}

export async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // No clipboard API (an insecure origin, or permission refused): the old way.
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        area.remove();
        return ok;
    }
}
