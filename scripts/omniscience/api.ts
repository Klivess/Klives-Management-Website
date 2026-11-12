import { BuildKliveHeaders, BuildKliveWsUrl, KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

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
    const res = await RequestGETFromKliveAPI(route, false, false, {}, signal);
    return read<T>(res, route, signal);
}

export async function omniPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const route = `${OMNI_API}/${path}`;
    const res = await RequestPOSTFromKliveAPI(route, JSON.stringify(body ?? {}), false, true, signal);
    return read<T>(res, route, signal);
}

/** A POST whose answer is a file (a person export): its text, for `omniDownload`. Errors are classified as for JSON. */
export async function omniPostText(path: string, body: unknown, signal?: AbortSignal): Promise<string> {
    const route = `${OMNI_API}/${path}`;
    const res = await RequestPOSTFromKliveAPI(route, JSON.stringify(body ?? {}), false, true, signal);
    if (signal?.aborted) throw new OmniApiError('aborted', 'Cancelled.', 0, route);
    if (!res.ok) return fail(res, route);
    return res.text();
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

/** The live-stream socket URL, resuming after `since` and limited to topic prefixes. */
export function omniStreamUrl(since: number, topics: readonly string[] = []): string {
    return BuildKliveWsUrl(`${OMNI_API}/stream`, { since: since > 0 ? since : null, topics: topics.length ? topics.join(',') : null });
}

/** Parses a JSON string field (`payloadJson`, `parameterSchemaJson`…) without throwing. */
export function omniParse<T = unknown>(json: string | null | undefined): T | null {
    if (json === null || json === undefined || json === '') return null;
    try { return JSON.parse(json) as T; } catch { return null; }
}
