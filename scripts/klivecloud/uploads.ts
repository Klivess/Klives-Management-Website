import { reactive } from 'vue';
import { describeApiError } from './shared';

/* Uploads through a writable share link: a small queue (a few files at a time, each one a raw
   POST so progress can be reported), and the helpers that turn a drop or a folder picker into
   files plus the folders they need. */

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled';

export interface UploadJob {
    id: number;
    /** The name shown: with its folder for a folder upload ("Trip/Day 1/a.jpg"). */
    label: string;
    fileName: string;
    size: number;
    loaded: number;
    status: UploadStatus;
    error: string;
    folderId: string;
    /** The new item's id, once the server has it. */
    itemId: string;
    /** False when trying again can't help (an empty file). */
    canRetry: boolean;
}

export interface UploadRequest {
    file: File;
    folderId: string;
    fileName?: string;
    label?: string;
}

export function createUploadQueue(options: {
    url: (folderId: string, fileName: string) => string;
    concurrency?: number;
    onUploaded?: (job: UploadJob) => void;
}) {
    const jobs = reactive<UploadJob[]>([]);
    const files = new Map<number, File>();
    const requests = new Map<number, XMLHttpRequest>();
    const limit = options.concurrency ?? 3;
    let nextId = 1;

    function pump() {
        let running = jobs.filter(job => job.status === 'uploading').length;
        for (const job of jobs) {
            if (running >= limit) break;
            if (job.status !== 'queued') continue;
            start(job);
            running++;
        }
    }

    function start(job: UploadJob) {
        const file = files.get(job.id);
        if (!file) {
            job.status = 'failed';
            job.error = 'The file is no longer available.';
            return;
        }
        job.status = 'uploading';
        job.loaded = 0;
        job.error = '';

        const xhr = new XMLHttpRequest();
        requests.set(job.id, xhr);
        xhr.open('POST', options.url(job.folderId, job.fileName), true);
        xhr.upload.onprogress = event => {
            if (event.lengthComputable) job.loaded = Math.min(event.loaded, job.size);
        };
        xhr.onload = () => {
            requests.delete(job.id);
            if (xhr.status >= 200 && xhr.status < 300) {
                job.status = 'done';
                job.loaded = job.size;
                try { job.itemId = String(JSON.parse(xhr.responseText)?.ItemID ?? ''); } catch { /* the next listing has it anyway */ }
                files.delete(job.id);
                options.onUploaded?.(job);
            } else {
                job.status = 'failed';
                job.error = describeApiError(xhr.status, xhr.responseText);
            }
            pump();
        };
        xhr.onerror = () => {
            requests.delete(job.id);
            job.status = 'failed';
            job.error = describeApiError(0, '');
            pump();
        };
        xhr.onabort = () => {
            requests.delete(job.id);
            if (job.status === 'uploading') job.status = 'cancelled';
            pump();
        };
        xhr.send(file);
    }

    function find(id: number) {
        return jobs.find(job => job.id === id);
    }

    return {
        jobs,
        add(list: UploadRequest[]) {
            for (const request of list) {
                const id = nextId++;
                const fileName = request.fileName ?? request.file.name;
                jobs.push({
                    id,
                    label: request.label ?? fileName,
                    fileName,
                    size: request.file.size,
                    loaded: 0,
                    status: 'queued',
                    error: '',
                    folderId: request.folderId,
                    itemId: '',
                    canRetry: true,
                });
                const job = jobs[jobs.length - 1];
                if (request.file.size === 0) {
                    // The server refuses an empty body; say so now rather than after a round trip.
                    job.status = 'failed';
                    job.error = describeApiError(400, 'EmptyFileBody');
                    job.canRetry = false;
                    continue;
                }
                files.set(id, request.file);
            }
            pump();
        },
        cancel(id: number) {
            const job = find(id);
            if (!job) return;
            if (job.status === 'uploading') requests.get(id)?.abort();
            else if (job.status === 'queued') job.status = 'cancelled';
        },
        cancelAll() {
            for (const job of jobs) if (job.status === 'queued') job.status = 'cancelled';
            for (const xhr of [...requests.values()]) xhr.abort();
        },
        retry(id: number) {
            const job = find(id);
            if (!job || (job.status !== 'failed' && job.status !== 'cancelled') || !files.has(id)) return;
            job.status = 'queued';
            job.loaded = 0;
            job.error = '';
            pump();
        },
        /** Forgets every upload that has finished, failed or been cancelled. */
        clearFinished() {
            for (let i = jobs.length - 1; i >= 0; i--) {
                const job = jobs[i];
                if (job.status === 'queued' || job.status === 'uploading') continue;
                files.delete(job.id);
                jobs.splice(i, 1);
            }
        },
    };
}

export type UploadQueue = ReturnType<typeof createUploadQueue>;

// ── picking files ────────────────────────────────────────────────────────────

export interface PickedFile {
    file: File;
    /** The folder it goes in, relative to where it was dropped ("Trip/Day 1"); '' for right there. */
    dir: string;
}

export interface Picked {
    files: PickedFile[];
    /** Every folder to create, parents before children. */
    dirs: string[];
}

/** Files every OS leaves lying around that nobody means to upload. */
const JUNK = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);
const isJunk = (name: string) => JUNK.has(name.toLowerCase());

function withParents(dirs: Iterable<string>) {
    const all = new Set<string>();
    for (const dir of dirs) {
        const parts = dir.split('/').filter(Boolean);
        for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join('/'));
    }
    return [...all].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
}

/**
 * Reads a drop. The browser empties a DataTransfer as soon as the event handler returns, so this
 * takes what it needs synchronously and hands back a function that walks dropped folders later.
 */
export function takeDrop(transfer: DataTransfer): () => Promise<Picked> {
    const entries: FileSystemEntry[] = [];
    const loose: File[] = [];
    const items = Array.from(transfer.items ?? []);
    if (items.length && typeof items[0].webkitGetAsEntry === 'function') {
        for (const item of items) {
            if (item.kind !== 'file') continue;
            const entry = item.webkitGetAsEntry();
            if (entry) entries.push(entry);
            else {
                const file = item.getAsFile();
                if (file) loose.push(file);
            }
        }
    } else {
        loose.push(...Array.from(transfer.files ?? []));
    }

    return async () => {
        const files: PickedFile[] = loose.filter(file => !isJunk(file.name)).map(file => ({ file, dir: '' }));
        const dirs: string[] = [];
        for (const entry of entries) await walk(entry, '', files, dirs);
        return { files, dirs: withParents(dirs) };
    };
}

async function walk(entry: FileSystemEntry, dir: string, files: PickedFile[], dirs: string[]) {
    if (entry.isFile) {
        if (isJunk(entry.name)) return;
        const file = await new Promise<File | null>(resolve => (entry as FileSystemFileEntry).file(resolve, () => resolve(null)));
        if (file) files.push({ file, dir });
        return;
    }
    if (!entry.isDirectory) return;
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    dirs.push(path);
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // Entries arrive in batches (Chrome gives 100 at a time) until an empty one.
    for (;;) {
        const batch = await new Promise<FileSystemEntry[]>(resolve => reader.readEntries(resolve, () => resolve([])));
        if (!batch.length) break;
        for (const child of batch) await walk(child, path, files, dirs);
    }
}

/** What a file input (with or without `webkitdirectory`) picked. */
export function takeInput(list: FileList | null): Picked {
    const files: PickedFile[] = [];
    const dirs = new Set<string>();
    for (const file of Array.from(list ?? [])) {
        if (isJunk(file.name)) continue;
        const relative = file.webkitRelativePath || '';
        const dir = relative.includes('/') ? relative.slice(0, relative.lastIndexOf('/')) : '';
        if (dir) dirs.add(dir);
        files.push({ file, dir });
    }
    return { files, dirs: withParents(dirs) };
}

/** A pasted screenshot arrives as "image.png"; give it a name worth keeping. */
export function pastedName(file: File, at = new Date()) {
    if (file.name && !/^image\.(png|jpe?g|gif|webp)$/i.test(file.name)) return file.name;
    const ext = file.name.split('.').pop() || (file.type.split('/')[1] ?? 'png');
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}.${pad(at.getMinutes())}.${pad(at.getSeconds())}`;
    return `Pasted image ${stamp}.${ext}`;
}
