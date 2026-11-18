import { BuildKliveHeaders, KliveAPIUrl } from '~/scripts/APIInterface';
import { requestThumbSlot } from './thumbs';

/* Thumbnails on the owner's page. GetPreview needs the Authorization header, which an <img> can't
   send, so each one is fetched and held as an object URL. The URL stays the same between visits
   and the server now answers with a validator, so the browser's own cache turns a repeat into a
   304 (or nothing at all for five minutes) instead of the full JPEG and a server-side read. */

const ready = new Map<string, string>();
const waiting = new Map<string, Promise<string | null>>();
const failed = new Set<string>();

const keyFor = (id: string, size: number) => `${id.toLowerCase()}:${size}`;

/** The thumbnail if it has already arrived. */
export function readyThumb(id: string, size = 300): string | null {
    return ready.get(keyFor(id, size)) ?? null;
}

export function loadThumb(id: string, size = 300): Promise<string | null> {
    const key = keyFor(id, size);
    const have = ready.get(key);
    if (have) return Promise.resolve(have);
    if (failed.has(key)) return Promise.resolve(null);
    const pending = waiting.get(key);
    if (pending) return pending;

    const promise = new Promise<string | null>(resolve => {
        requestThumbSlot(async release => {
            try {
                const url = `${KliveAPIUrl}/KliveCloud/GetPreview?itemID=${encodeURIComponent(id)}&maxWidth=${size}&maxHeight=${size}`;
                const res = await fetch(url, { mode: 'cors', headers: BuildKliveHeaders(false) });
                if (!res.ok) { failed.add(key); resolve(null); return; }
                const objectUrl = URL.createObjectURL(await res.blob());
                ready.set(key, objectUrl);
                resolve(objectUrl);
            } catch {
                failed.add(key);
                resolve(null);
            } finally {
                waiting.delete(key);
                release();
            }
        });
    });
    waiting.set(key, promise);
    return promise;
}

/** Lets a thumbnail be tried again (the file was replaced, or the server is back). */
export function forgetFailedThumbs() {
    failed.clear();
}

/** Frees every thumbnail (the page is going away). */
export function forgetThumbs() {
    for (const url of ready.values()) URL.revokeObjectURL(url);
    ready.clear();
    failed.clear();
}
