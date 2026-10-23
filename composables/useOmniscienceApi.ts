import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

export class OmniscienceApiError extends Error {
    status: number;
    retryable: boolean;

    constructor(message: string, status: number, retryable = false) {
        super(message);
        this.name = 'OmniscienceApiError';
        this.status = status;
        this.retryable = retryable;
    }
}

type RequestOptions = {
    retries?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
};

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
});

async function errorFrom(response: Response): Promise<OmniscienceApiError> {
    let message = `Request failed (${response.status})`;
    try {
        const body = await response.clone().json();
        message = body?.detail || body?.error || body?.message || message;
    } catch {
        try { message = (await response.text()).trim() || message; } catch { /* keep status */ }
    }
    return new OmniscienceApiError(message, response.status, response.status === 503 || response.status === 504 || response.status === 429);
}

async function parse<T>(response: Response): Promise<T> {
    if (!response.ok) throw await errorFrom(response);
    const type = response.headers.get('content-type') ?? '';
    if (type.includes('json')) return await response.json() as T;
    return await response.text() as T;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    const retries = options.retries ?? (method === 'GET' ? 3 : 1);
    let attempt = 0;
    let lastError: unknown;
    while (attempt < retries) {
        attempt++;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? (method === 'GET' ? 25_000 : 120_000));
        const abort = () => controller.abort();
        options.signal?.addEventListener('abort', abort, { once: true });
        try {
            const response = method === 'GET'
                ? await RequestGETFromKliveAPI(path, false, false, {}, controller.signal)
                : await RequestPOSTFromKliveAPI(path, JSON.stringify(body ?? {}), false, true, controller.signal);
            return await parse<T>(response);
        } catch (error) {
            lastError = error;
            const apiError = error instanceof OmniscienceApiError ? error : null;
            const canRetry = apiError?.retryable ?? (error instanceof DOMException && error.name !== 'AbortError');
            if (attempt >= retries || !canRetry) break;
            const retryAfter = apiError?.status === 503 ? 900 : 1400;
            await sleep(retryAfter * attempt, options.signal);
        } finally {
            clearTimeout(timeout);
            options.signal?.removeEventListener('abort', abort);
        }
    }
    if (lastError instanceof Error) throw lastError;
    throw new OmniscienceApiError('The request could not be completed.', 0, true);
}

export function useOmniscienceApi() {
    return {
        get: <T = any>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
        post: <T = any>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, body, options),
        download(filename: string, mime: string, content: string) {
            if (!import.meta.client) return;
            const blob = new Blob([content], { type: mime });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
    };
}

export function omniscienceError(error: unknown, fallback = 'Something went wrong.') {
    return error instanceof Error ? error.message : fallback;
}

export function formatCompact(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return new Intl.NumberFormat(undefined, { notation: number >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(number);
}

export function formatDate(value: unknown, withTime = false): string {
    if (!value) return '—';
    const date = new Date(value as string | number);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, withTime
        ? { dateStyle: 'medium', timeStyle: 'short' }
        : { dateStyle: 'medium' });
}

export function toUnixMs(date: string, endOfDay = false): number | null {
    if (!date) return null;
    const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
    const value = Date.parse(date + suffix);
    return Number.isFinite(value) ? value : null;
}
