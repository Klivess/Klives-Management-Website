/**
 * KliveTech OS — shared types, transport and formatting.
 *
 * Everything the page knows about the KliveTech Hub's wire format lives here, so a
 * backend field rename is one edit rather than a hunt. The transport is a thin layer
 * over scripts/APIInterface.ts: it keeps the cookie auth and the CORS handling and adds
 * only the two things every caller needs and would otherwise get wrong — a readable
 * error message, and a parsed body.
 */

import { onBeforeUnmount, onMounted, ref } from 'vue';
import {
    RequestGETFromKliveAPI,
    RequestPOSTFromKliveAPI,
    KliveAPIUrl,
} from '~/scripts/APIInterface';

/* ------------------------------------------------------------------ wire types --- */

/** KliveTechActions.ActionParameterType. The numbers are protocol, not presentation. */
export const enum ActionParam {
    Integer = 0,
    String = 1,
    Bool = 2,
    None = 3,
}

export interface GadgetAction {
    name: string;
    parameters: number;
    paramDescription: string;
}

export interface Gadget {
    name: string;
    IPAddress: string;
    IPAddressLong: number;
    gadgetID: string;
    actions: GadgetAction[];
    timeConnected: string;
    isOnline: boolean;
    lastMessageReceived: string;
    connectionType: string;      // 'Bluetooth' | 'Hub' | 'Relayed'
    isHub: boolean;
    hubID: string;
    connectedViaHubID: string;
    connectedGadgetCount: number;
    streamableCount: number;
}

export type StreamValueType = 'integer' | 'number' | 'boolean' | 'string' | 'json' | 'binary';
export type StreamMode = 'periodic' | 'onChange' | 'manual';

export interface StreamableEntry {
    gadgetID: string;
    gadgetName: string;
    gadgetOnline: boolean;
    streamID: string;
    valueType: StreamValueType;
    mimeType: string;
    mode: StreamMode;
    intervalMs: number;
    enabled: boolean;
    sessionID: string;
    manifestRevision: number;
    latestSequence: number | null;
    latestDeviceTimestampMs: number | null;
    latestReceivedUtc: string | null;
    latestValue: unknown;
    latestBinaryBytes: number | null;
    latestBinarySha256: string;
    droppedEvents: number;
}

export interface StreamableSample {
    gadgetID: string;
    streamID: string;
    sessionID: string;
    sequence: number;
    deviceTimestampMs: number;
    receivedUtc: string;
    value: unknown;
}

export interface FirmwareJob {
    jobID: string;
    kind: string;                // 'Compile' | 'Update'
    project: string;
    gadgetID: string;
    gadgetName: string;
    fqbn: string;
    partitionScheme: string;
    state: string;               // Queued | Compiling | Uploading | Completed | Failed | Cancelled
    progressPercent: number;
    bytesTransferred: number;
    totalBytes: number;
    firmwareSha256: string;
    firmwareFileName: string;
    compilerOutput: string;
    error: string;
    createdUtc: string;
    startedUtc: string | null;
    completedUtc: string | null;
}

export interface FirmwareProject {
    name: string;
    sketches: string[];
    valid: boolean;
    error: string;
}

export interface FirmwareConfig {
    inboxDirectory: string;
    buildsDirectory: string;
    defaultFqbn: string;
    defaultPartitionScheme: string;
    chunkSize: number;
    maximumFirmwareBytes: number;
}

/* ------------------------------------------------------- protocol constants ----- */

/** From KliveTechStreamProtocol / KliveTechStreamables. Shown on the diagnostics tab
 *  and used to flag a gadget that is at or over a limit. */
export const KT_LIMITS = {
    streamablesPerGadget: 32,
    scalarValueBytes: 4 * 1024,
    binaryFrameBytes: 512 * 1024,
    minIntervalMs: 25,
    streamIdLength: 48,
    liveViewers: 32,
} as const;

/** The hub calls a gadget online while it has heard from it within 10s, so a quiet
 *  gadget flaps. Anything past this is worth marking, not worth alarming about. */
export const STALE_AFTER_MS = 15_000;

export const TERMINAL_JOB_STATES = ['Completed', 'Failed', 'Cancelled'];
export function isTerminalJob(state: string): boolean {
    return TERMINAL_JOB_STATES.includes(state);
}

/* -------------------------------------------------------------------- errors ---- */

export class KtError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = 'KtError';
    }
}

/** Turns a status code into something an operator can act on. The API returns
 *  `{error}` for its own failures; those win, because they are specific. */
async function describeFailure(response: Response): Promise<string> {
    let supplied = '';
    try {
        const body = await response.clone().json();
        if (body && typeof body.error === 'string') supplied = body.error;
    } catch { /* not every failure has a JSON body */ }
    if (supplied) return supplied;

    switch (response.status) {
        case 400: return 'The request was rejected as invalid';
        case 401: case 403: return 'This needs Klives clearance';
        case 404: return 'Not found';
        case 409: return 'That conflicts with something already running';
        case 503: return 'The gadget is unavailable';
        case 504: return 'The gadget timed out';
        default: return `The request failed (${response.status})`;
    }
}

/* ----------------------------------------------------------------- transport ---- */

/**
 * The page owns its own error surfaces, so these never redirect and never raise a
 * SweetAlert on an auth failure — a burst of polls would otherwise stack a dozen
 * modals over each other.
 */
export async function ktGetRaw(path: string): Promise<Response> {
    return RequestGETFromKliveAPI(path, false, false);
}

export async function ktGet<T>(path: string): Promise<T> {
    const response = await ktGetRaw(path);
    if (!response.ok) throw new KtError(await describeFailure(response), response.status);
    return await response.json() as T;
}

export async function ktPostJson<T>(path: string, body: unknown): Promise<T> {
    const response = await RequestPOSTFromKliveAPI(path, JSON.stringify(body), false, true);
    if (!response.ok) throw new KtError(await describeFailure(response), response.status);
    return await response.json() as T;
}

/**
 * Gadget actions are the one endpoint that reads its arguments from the query string
 * rather than the body (KliveTechRoutes.ExecuteGadgetAction uses userParameters), so
 * this sends an empty body and is NOT a JSON post. Changing that silently produces
 * "actionName is required".
 */
export async function ktPostQuery<T>(path: string): Promise<T> {
    const response = await RequestPOSTFromKliveAPI(path, '', false, false);
    if (!response.ok) throw new KtError(await describeFailure(response), response.status);
    return await response.json() as T;
}

export function wsBase(): string {
    return KliveAPIUrl.replace('https', 'wss').replace('http', 'ws');
}

/** A browser cannot set an Authorization header on a WebSocket, so the password rides
 *  in the query string and the route authorizes it in-handler. */
export function ktPassword(): string {
    if (typeof document === 'undefined') return '';
    const match = document.cookie.match(/(?:^|; )password=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
}

/* ------------------------------------------------------------------- polling ---- */

/**
 * Poll while the tab is visible and stop while it is not. A background tab that keeps
 * hammering the API produces load nobody is reading, and comes back showing whatever
 * it last managed to fetch.
 */
export function useKtPolling(fn: () => void | Promise<void>, intervalMs: number) {
    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
        stop();
        timer = setInterval(() => { if (!document.hidden) void fn(); }, intervalMs);
    }
    function stop() {
        if (timer) { clearInterval(timer); timer = null; }
    }
    function onVisibility() { if (!document.hidden) void fn(); }

    onMounted(() => {
        void fn();
        start();
        document.addEventListener('visibilitychange', onVisibility);
    });
    onBeforeUnmount(() => {
        stop();
        document.removeEventListener('visibilitychange', onVisibility);
    });

    return { start, stop, refresh: fn };
}

/** A 1s clock, so "4s ago" keeps counting without every consumer owning a timer. */
export function useKtClock(intervalMs = 1000) {
    const now = ref(Date.now());
    let timer: ReturnType<typeof setInterval> | null = null;
    onMounted(() => { timer = setInterval(() => { now.value = Date.now(); }, intervalMs); });
    onBeforeUnmount(() => { if (timer) clearInterval(timer); });
    return now;
}

/* ---------------------------------------------------------------- formatting ---- */

/** Absent is not zero. A missing reading renders as absent and is never coloured. */
export const NO_VALUE = '—';

export function fmtNum(value: number | null | undefined, decimals = 0): string {
    if (value === null || value === undefined || Number.isNaN(value)) return NO_VALUE;
    return value.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

export function fmtBytes(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return NO_VALUE;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
}

export function fmtMs(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return NO_VALUE;
    if (value < 1000) return `${Math.round(value)} ms`;
    return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`;
}

export function fmtDuration(ms: number | null | undefined): string {
    if (ms === null || ms === undefined || Number.isNaN(ms) || ms < 0) return NO_VALUE;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/** The backend stamps DateTime.UtcNow without a zone marker, so an unsuffixed string
 *  has to be read as UTC or every timestamp on the page lands an hour or more out. */
export function parseUtc(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const normalized = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
    const parsed = Date.parse(normalized);
    if (Number.isNaN(parsed)) return null;
    // DateTime.MinValue means "never", not 1 January 0001.
    return parsed <= Date.parse('0001-01-02T00:00:00Z') ? null : parsed;
}

export function fmtAgo(iso: string | null | undefined, now = Date.now()): string {
    const at = parseUtc(iso);
    if (at === null) return NO_VALUE;
    const delta = now - at;
    if (delta < 0) return 'just now';
    if (delta < 1000) return 'just now';
    if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
    if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
    return `${Math.floor(delta / 86_400_000)}d ago`;
}

export function fmtTime(iso: string | null | undefined): string {
    const at = parseUtc(iso);
    if (at === null) return NO_VALUE;
    return new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}

export function ageMs(iso: string | null | undefined, now = Date.now()): number | null {
    const at = parseUtc(iso);
    return at === null ? null : now - at;
}

/**
 * A streamable value is a JToken: null, boolean, number, string, or a whole object for
 * a json stream. Every branch has to be handled or a perfectly healthy `false` renders
 * as blank and a `0` renders as absent.
 */
export function fmtStreamValue(value: unknown, valueType: StreamValueType): string {
    if (value === null || value === undefined) return NO_VALUE;
    switch (valueType) {
        case 'boolean':
            return value === true ? 'TRUE' : value === false ? 'FALSE' : String(value);
        case 'integer':
            return typeof value === 'number' ? fmtNum(value) : String(value);
        case 'number':
            return typeof value === 'number'
                ? value.toLocaleString(undefined, { maximumFractionDigits: 4 })
                : String(value);
        case 'string':
            return String(value);
        case 'json':
            try { return JSON.stringify(value); } catch { return String(value); }
        case 'binary':
            return 'binary';
        default:
            return String(value);
    }
}

/** Only these can be plotted. A string or a json blob has no position on an axis. */
export function isChartable(valueType: StreamValueType): boolean {
    return valueType === 'integer' || valueType === 'number' || valueType === 'boolean';
}

export function numericValue(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return null;
}

/* ---------------------------------------------------------------------- tone ---- */

export type Tone = '' | 'ok' | 'warn' | 'fault' | 'idle' | 'accent';

export function gadgetTone(gadget: Gadget | null | undefined, now = Date.now()): Tone {
    if (!gadget) return 'idle';
    if (!gadget.isOnline) return 'idle';
    const age = ageMs(gadget.lastMessageReceived, now);
    return age !== null && age > STALE_AFTER_MS ? 'warn' : 'ok';
}

export function gadgetStateWord(gadget: Gadget | null | undefined, now = Date.now()): string {
    if (!gadget) return 'Unknown';
    if (!gadget.isOnline) return 'Offline';
    const age = ageMs(gadget.lastMessageReceived, now);
    return age !== null && age > STALE_AFTER_MS ? 'Quiet' : 'Online';
}

export function transportClass(connectionType: string | null | undefined): string {
    switch ((connectionType || '').toLowerCase()) {
        case 'bluetooth': return 'tx-bluetooth';
        case 'hub': return 'tx-hub';
        case 'relayed': return 'tx-relayed';
        default: return 'idle';
    }
}

export function jobTone(state: string): Tone {
    switch (state) {
        case 'Completed': return 'ok';
        case 'Failed': return 'fault';
        case 'Cancelled': return 'idle';
        case 'Compiling': case 'Uploading': return 'accent';
        default: return 'idle';
    }
}

export function traceColour(index: number): string {
    return `var(--kt-trace-${(index % 8) + 1})`;
}

/** An int64 Bluetooth address is unreadable; the same value as a MAC is the thing
 *  printed on the device. Both are shown, because only one of them is searchable. */
export function fmtMac(addressLong: number | null | undefined): string {
    if (addressLong === null || addressLong === undefined || addressLong <= 0) return NO_VALUE;
    const hex = addressLong.toString(16).toUpperCase().padStart(12, '0');
    return (hex.match(/.{2}/g) ?? []).join(':');
}

export function shortId(id: string | null | undefined, length = 8): string {
    if (!id) return NO_VALUE;
    return id.length <= length ? id : id.slice(0, length);
}

/* ------------------------------------------------------------------ clipboard --- */

export async function ktCopy(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

/** SweetAlert teleports to <body>, outside .kt-os, so it cannot inherit the theme. */
export const KT_SWAL = {
    background: '#171b23',
    color: '#e6ecf5',
    confirmButtonColor: '#34c9d4',
    cancelButtonColor: '#2a3140',
} as const;
