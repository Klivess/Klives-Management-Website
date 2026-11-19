import { BuildKliveHeaders, BuildKliveWsUrl, KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, RequestPUTFromKliveAPI } from '~/scripts/APIInterface';

/**
 * The one client for the Omniscience v3 API. Every page goes through it, so there is a single
 * place that knows the route prefix, the error contract and how a request is cancelled.
 *
 * Errors are classified, never thrown as raw text: a caller renders `error.kind`
 * ("the engine is off", "you may not see this", "not computed yet") instead of guessing from
 * a status code. Requests are not retried here; KliveAPI's client already retries a GET while
 * the server restarts, and a second retry layer on top of it multiplied the wait.
 */

/** API route prefix on the server. */
export const OMNI_API = '/omniscience/v3';
/** Page route prefix on the site (renamed to `/omniscience` at cutover). */
export const OMNI_BASE = '/omniscience-v3';

export type OmniErrorKind =
    | 'disabled' | 'starting' | 'failed' | 'unavailable'   // the engine is not serving
    | 'forbidden'                                          // signed in, not allowed
    | 'not_found' | 'not_built'                            // nothing there (yet)
    | 'bad_request' | 'conflict' | 'refused' | 'confirmation_required'
    | 'network' | 'internal' | 'aborted';

const KNOWN = new Set<string>(['disabled', 'starting', 'failed', 'unavailable', 'forbidden', 'not_found', 'not_built',
    'bad_request', 'conflict', 'refused', 'confirmation_required', 'internal']);

export class OmniApiError extends Error {
    constructor(public readonly kind: OmniErrorKind, message: string, public readonly status: number, public readonly route: string) {
        super(message);
        this.name = 'OmniApiError';
    }

    /** The engine itself is not answering (as opposed to this one request being wrong). */
    get engineDown(): boolean {
        return this.kind === 'disabled' || this.kind === 'starting' || this.kind === 'failed' || this.kind === 'unavailable';
    }
}

export function isOmniAbort(error: unknown): boolean {
    return error instanceof OmniApiError && error.kind === 'aborted';
}

export function toOmniError(error: unknown, route = ''): OmniApiError {
    if (error instanceof OmniApiError) return error;
    if (error instanceof DOMException && error.name === 'AbortError') return new OmniApiError('aborted', 'Cancelled.', 0, route);
    return new OmniApiError('internal', error instanceof Error ? error.message : 'Something went wrong.', 0, route);
}

type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];

// ── requests in flight ───────────────────────────────────────────────────────

/** One request that has been sent and not answered yet. `startedAt` is on the monotonic clock (performance.now), not the wall clock. */
export interface OmniFlight { id: number; route: string; startedAt: number }

const flights = new Map<number, OmniFlight>();
const flightListeners = new Set<() => void>();
let flightSeq = 0;

/** The requests that are waiting for an answer right now, oldest first. */
export function omniFlights(): OmniFlight[] {
    return [...flights.values()];
}

/** Calls `listener` whenever a request starts or ends. Returns the function that stops it. */
export function onOmniFlights(listener: () => void): () => void {
    flightListeners.add(listener);
    return () => { flightListeners.delete(listener); };
}

/**
 * Counts a request for as long as it is in flight, so the frame can show that something is being
 * waited for. A slow answer used to look exactly like no answer: nothing on the page moved.
 */
async function tracked<T>(route: string, work: () => Promise<T>): Promise<T> {
    const id = ++flightSeq;
    flights.set(id, { id, route, startedAt: performance.now() });
    for (const listener of flightListeners) listener();
    try {
        return await work();
    } finally {
        flights.delete(id);
        for (const listener of flightListeners) listener();
    }
}

export function omniQuery(params: Record<string, QueryValue> = {}): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === null || value === undefined || value === '') continue;
        if (Array.isArray(value)) {
            if (value.length) search.set(key, value.join(','));
        } else {
            search.set(key, String(value));
        }
    }
    const text = search.toString();
    return text ? `?${text}` : '';
}

async function fail(res: Response, route: string): Promise<never> {
    let body: any = null;
    try { body = await res.clone().json(); } catch { /* not JSON: classified from the status below */ }

    // The v3 handlers answer { code, message }; KliveAPI's own gate answers { error, reason, message }.
    if (body && typeof body.code === 'string') {
        const kind = (KNOWN.has(body.code) ? body.code : 'internal') as OmniErrorKind;
        throw new OmniApiError(kind, String(body.message ?? 'The request failed.'), res.status, route);
    }
    if (res.status === 403 || res.status === 401) {
        throw new OmniApiError('forbidden', String(body?.message || 'You do not have permission for this.'), res.status, route);
    }
    if (res.status === 404) {
        // No such route: an older server, or v3 is not part of this build.
        throw new OmniApiError('unavailable', 'This server does not serve Omniscience v3 here yet.', 404, route);
    }
    if (res.status === 504 || res.status === 0) {
        throw new OmniApiError('network', 'The server could not be reached.', res.status, route);
    }
    if (res.status === 503) {
        throw new OmniApiError('unavailable', 'The server is restarting.', 503, route);
    }
    throw new OmniApiError('internal', `The server answered ${res.status}.`, res.status, route);
}

async function read<T>(res: Response, route: string, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw new OmniApiError('aborted', 'Cancelled.', 0, route);
    if (!res.ok) return fail(res, route);
    try {
        return await res.json() as T;
    } catch {
        throw new OmniApiError('internal', 'The server answered with something that is not JSON.', res.status, route);
    }
}

export async function omniGet<T>(path: string, params: Record<string, QueryValue> = {}, signal?: AbortSignal): Promise<T> {
    const route = `${OMNI_API}/${path}${omniQuery(params)}`;
    return tracked(route, async () => {
        // The server answers every read within a few seconds: with the data, or with 202 { code: "pending" } while it
        // goes on working (the same work, not a second run). "Pending" is asked again until the data is there, so the
        // page waits with its loading state up and ends with the answer; nothing is left hanging until it times out.
        for (let asked = 1; ; asked++) {
            const res = await RequestGETFromKliveAPI(route, false, false, {}, signal);
            const wait = await pendingWait(res);
            if (wait === null) return read<T>(res, route, signal);
            if (asked >= OMNI_PENDING_ASKS)
                throw new OmniApiError('unavailable', 'The server is still working on this. It has not given up; ask again in a while.', 202, route);
            await pause(wait, signal, route);
        }
    });
}

/** How often a "pending" read is asked again before the page says so (about ten minutes of asking). */
export const OMNI_PENDING_ASKS = 300;

/** The wait a "pending" answer asks for, in ms; null for any other answer. */
async function pendingWait(res: Response): Promise<number | null> {
    if (res.status !== 202) return null;
    try {
        const body = await res.clone().json();
        if (body?.code !== 'pending') return null;
        return Math.min(5000, Math.max(250, Number(body.retryAfterMs) || 1500));
    } catch {
        return null;
    }
}

function pause(ms: number, signal: AbortSignal | undefined, route: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new OmniApiError('aborted', 'Cancelled.', 0, route)); return; }
        const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
        const onAbort = () => { clearTimeout(timer); reject(new OmniApiError('aborted', 'Cancelled.', 0, route)); };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

export async function omniPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const route = `${OMNI_API}/${path}`;
    return tracked(route, async () => {
        const res = await RequestPOSTFromKliveAPI(route, JSON.stringify(body ?? {}), false, true, signal);
        return read<T>(res, route, signal);
    });
}

/** A POST whose answer is a file (a person export): its text, for `omniDownload`. Errors are classified as for JSON. */
export async function omniPostText(path: string, body: unknown, signal?: AbortSignal): Promise<string> {
    const route = `${OMNI_API}/${path}`;
    return tracked(route, async () => {
        const res = await RequestPOSTFromKliveAPI(route, JSON.stringify(body ?? {}), false, true, signal);
        if (signal?.aborted) throw new OmniApiError('aborted', 'Cancelled.', 0, route);
        if (!res.ok) return fail(res, route);
        return res.text();
    });
}

/**
 * Reads an NDJSON answer (a tactic run, an inquiry report) line by line as it arrives. Uses
 * fetch + ReadableStream rather than EventSource, which cannot send the Bearer header. A
 * failure after the 200 arrives in-band as `{ type: "error" }` and is rethrown classified.
 */
export async function omniStream(path: string, params: Record<string, QueryValue>, onLine: (line: any) => void, signal?: AbortSignal): Promise<void> {
    const route = `${OMNI_API}/${path}${omniQuery(params)}`;
    let res: Response;
    try {
        res = await fetch(`${KliveAPIUrl}${route}`, { method: 'GET', mode: 'cors', headers: BuildKliveHeaders(), signal });
    } catch (error) {
        if (signal?.aborted) throw new OmniApiError('aborted', 'Cancelled.', 0, route);
        throw new OmniApiError('network', 'The server could not be reached.', 0, route);
    }
    await readLines(res, route, onLine, signal);
}

/**
 * A command whose answer is an NDJSON stream (a replica writing its reply, a simulated group taking
 * turns). Aborting the signal closes the connection, which the server takes as "stop writing".
 */
export async function omniPostStream(path: string, body: unknown, onLine: (line: any) => void, signal?: AbortSignal): Promise<void> {
    const route = `${OMNI_API}/${path}`;
    let res: Response;
    try {
        res = await fetch(`${KliveAPIUrl}${route}`, { method: 'POST', mode: 'cors', headers: BuildKliveHeaders(true), body: JSON.stringify(body ?? {}), signal });
    } catch (error) {
        if (signal?.aborted) throw new OmniApiError('aborted', 'Cancelled.', 0, route);
        throw new OmniApiError('network', 'The server could not be reached.', 0, route);
    }
    await readLines(res, route, onLine, signal);
}

async function readLines(res: Response, route: string, onLine: (line: any) => void, signal?: AbortSignal): Promise<void> {
    if (!res.ok) await fail(res, route);
    if (!res.body) throw new OmniApiError('internal', 'The server sent no stream.', res.status, route);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const emit = (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        let line: any;
        try { line = JSON.parse(trimmed); } catch { return; }
        if (line?.type === 'error') {
            const kind = (KNOWN.has(line.code) ? line.code : 'internal') as OmniErrorKind;
            throw new OmniApiError(kind, String(line.message ?? 'The stream failed.'), res.status, route);
        }
        onLine(line);
    };
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let newline = buffer.indexOf('\n');
            while (newline >= 0) {
                emit(buffer.slice(0, newline));
                buffer = buffer.slice(newline + 1);
                newline = buffer.indexOf('\n');
            }
        }
        emit(buffer + decoder.decode());
    } catch (error) {
        if (signal?.aborted) throw new OmniApiError('aborted', 'Cancelled.', 0, route);
        if (error instanceof OmniApiError) throw error;
        throw new OmniApiError('network', 'The stream was interrupted.', 0, route);
    }
}

/** Sends a file as the body of a PUT (an export for the import inbox). The server streams it to disk; nothing is buffered here either. */
export async function omniUpload<T>(path: string, params: Record<string, QueryValue>, file: Blob): Promise<T> {
    const route = `${OMNI_API}/${path}${omniQuery(params)}`;
    let res: Response;
    try {
        res = await RequestPUTFromKliveAPI(route, file, false);
    } catch {
        throw new OmniApiError('network', 'The upload was interrupted.', 0, route);
    }
    return read<T>(res, route);
}

/** The API path of an attachment's stored file, or of its thumbnail. It needs the Authorization header, so an <img> cannot use it directly (see OmniscienceV3Media). */
export function omniMediaPath(attachmentId: string, thumbnail: boolean): string {
    return `${OMNI_API}/media/${thumbnail ? 'thumb' : 'file'}${omniQuery({ attachment: attachmentId })}`;
}

/** The live-stream socket URL, resuming after `since` and limited to topic prefixes. */
export function omniStreamUrl(since: number, topics: readonly string[] = []): string {
    return BuildKliveWsUrl(`${OMNI_API}/stream`, { since: since > 0 ? since : null, topics: topics.length ? topics.join(',') : null });
}

/** Parses a JSON string field (`payloadJson`, `parameterSchemaJson`…) without throwing. */
export function omniParse<T = unknown>(json: string | null | undefined): T | null {
    if (json === null || json === undefined || json === '') return null;
    try { return JSON.parse(json) as T; } catch { return null; }
}
