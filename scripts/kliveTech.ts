/**
 * KliveTech console: wire types, transport, and the pure rules the page is built from.
 *
 * Everything the page knows about the KliveTech Hub's wire format lives here, so a backend field
 * rename is one edit rather than a hunt. The rules (how a gadget's state is read, what counts as a
 * problem, how the command palette ranks) are plain functions so they can be reasoned about apart
 * from the page. The transport is a thin layer over scripts/APIInterface.ts.
 */

import {
    RequestGETFromKliveAPI,
    RequestPOSTFromKliveAPI,
    KliveAPIUrl, GetAuthToken,
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

/* ------------------------------------------------- hub status (GET /klivetech/status) */
/* Every field is optional on the page: the site and the server deploy separately, and a server from
   before 13 Nov 2026 has no status route at all. */

export type RememberedState = 'online' | 'connecting' | 'unreachable' | 'offline' | 'waiting-for-hub' | 'not-tried';

export interface RememberedStatus {
    gadgetID: string;
    name: string;
    address: string;
    connectionType: string;
    isHub: boolean;
    connectedViaHubID: string;
    online: boolean;
    state: RememberedState;
    failedAttempts: number;
    totalAttempts: number;
    lastAttemptUtc: string | null;
    lastConnectedUtc: string | null;
    lastDisconnectedUtc: string | null;
    lastDisconnectReason: string;
    lastError: string;
    lastErrorUtc: string | null;
    canRetry: boolean;
}

export interface NearbyStatus {
    address: string;
    name: string;
    firstSeenUtc: string;
    lastSeenUtc: string;
    sightings: number;
    enrolling: boolean;
}

export interface HubEvent {
    seq: number;
    atUtc: string;
    kind: string;
    tone: 'ok' | 'info' | 'warn' | 'crit';
    gadgetID: string;
    gadgetName: string;
    text: string;
    by: string;
}

export interface RelayAttempt {
    atUtc: string;
    hubID: string;
    hubName: string;
    outcome: 'pending' | 'connected' | 'closed' | 'refused' | 'bad-hello' | 'handshake-timeout' | 'failed';
    detail: string;
    endedUtc: string | null;
}

export interface RelayHub {
    hubID: string;
    name: string;
    open: boolean;
    connectedSinceUtc: string;
    lastMessageUtc: string;
    gadgets: number;
}

export interface ToolchainStatus {
    command: string;
    found: boolean;
    version: string;
    error: string;
    checkedUtc: string;
}

export interface HubStatus {
    serverUtc: string;
    startedUtc: string;
    bluetooth: {
        available: boolean;
        scanning: boolean;
        intervalSeconds: number;
        timeoutSeconds: number;
        scans: number;
        failures: number;
        consecutiveFailures: number;
        lastScanUtc: string | null;
        lastScanMs: number;
        lastDevicesSeen: number;
        lastKliveTechSeen: number;
        lastError: string;
        lastErrorUtc: string | null;
    };
    enrolment: { allowNewDevices: boolean; setting: string; windowMinutes: number; allowances: string[] };
    remembered: RememberedStatus[];
    nearby: NearbyStatus[];
    relay: {
        endpoint: string;
        tokenConfigured: boolean;
        connectedTotal: number;
        refusedTotal: number;
        hubs: RelayHub[];
        attempts: RelayAttempt[];
    };
    firmware: {
        toolchain: ToolchainStatus | null;
        libraryConfigured: boolean;
        inboxProjects: number;
        activeJobs: number;
        rememberedJobs: number;
    };
    streamables: {
        declared: number;
        enabled: number;
        gadgets: number;
        droppedEvents: number;
        liveViewers: number;
        maximumLiveViewers: number;
        retainedSamples: number;
        retainedSampleBytes: number;
        retainedFrameBytes: number;
    };
    events: HubEvent[];
}

/* ------------------------------------------------------- protocol constants ----- */

/** From KliveTechStreamProtocol / KliveTechStreamables. */
export const KT_LIMITS = {
    streamablesPerGadget: 32,
    scalarValueBytes: 4 * 1024,
    binaryFrameBytes: 512 * 1024,
    minIntervalMs: 25,
    streamIdLength: 48,
    liveViewers: 32,
} as const;

/**
 * When a gadget counts as quiet. The hub only pings a gadget once it has been silent for 10 s, and
 * checks every 5 s, so a healthy but idle gadget is routinely 10-15 s since its last message, and
 * the page reads every 5 s on top of that. 15 s (the old page's figure) made idle gadgets flap.
 */
export const STALE_AFTER_MS = 25_000;

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

/** Turns a failed response into something an operator can act on. The API's own `{error}` wins. */
export function describeFailureBody(status: number, body: any): string {
    if (body && body.error === 'AccessDenied' && typeof body.message === 'string') return body.message;
    if (body && typeof body.error === 'string') return body.error;
    switch (status) {
        case 400: return 'The request was rejected as invalid';
        case 401: case 403: return "Your profile doesn't have permission for this";
        case 404: return 'Not found';
        case 409: return 'That conflicts with something already running';
        case 503: return 'The gadget is unavailable';
        case 504: return 'The gadget timed out';
        default: return `The request failed (${status})`;
    }
}

async function describeFailure(response: Response): Promise<string> {
    let body: any = null;
    try { body = await response.clone().json(); } catch { /* not every failure has a JSON body */ }
    return describeFailureBody(response.status, body);
}

/* ----------------------------------------------------------------- transport ---- */

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
 * Gadget actions are the one endpoint that reads its arguments from the query string rather than
 * the body (KliveTechRoutes.ExecuteGadgetAction uses userParameters), so this sends an empty body.
 * Changing that silently produces "actionName is required".
 */
export async function ktPostQuery<T>(path: string): Promise<T> {
    const response = await RequestPOSTFromKliveAPI(path, '', false, false);
    if (!response.ok) throw new KtError(await describeFailure(response), response.status);
    return await response.json() as T;
}

export function wsBase(): string {
    return KliveAPIUrl.replace('https', 'wss').replace('http', 'ws');
}

/** A browser cannot set an Authorization header on a WebSocket, so the session token rides in the
 *  query string (`authorization=`) and the API gate checks it like a header. */
export function ktPassword(): string {
    return GetAuthToken();
}

/** A /batch item's body may arrive parsed or as text. */
export function parseBody<T>(value: unknown): T | null {
    if (value == null) return null;
    if (typeof value !== 'string') return value as T;
    const trimmed = value.trim();
    if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return null;
    try { return JSON.parse(trimmed) as T; } catch { return null; }
}

/* ---------------------------------------------------------------- formatting ---- */

/** Absent is not zero. A missing reading renders as absent and is never coloured. */
export const NO_VALUE = '—';

export function fmtNum(value: number | null | undefined, decimals = 0): string {
    if (value === null || value === undefined || Number.isNaN(value)) return NO_VALUE;
    return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtCompact(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return NO_VALUE;
    if (Math.abs(value) < 1000) return String(Math.round(value));
    if (Math.abs(value) < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
    return `${(value / 1_000_000).toFixed(1)}M`;
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

/** The backend stamps DateTime.UtcNow without a zone marker, so an unsuffixed string has to be read
 *  as UTC or every timestamp on the page lands an hour or more out. */
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
    if (delta < 1000) return 'just now';
    if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
    if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
    return `${Math.floor(delta / 86_400_000)}d ago`;
}

/** 14:02, or 12 Nov 14:02 when it was not today. */
export function fmtClock(iso: string | null | undefined, now = Date.now()): string {
    const at = parseUtc(iso);
    if (at === null) return NO_VALUE;
    const date = new Date(at);
    const sameDay = new Date(now).toDateString() === date.toDateString();
    const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return sameDay ? time : `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`;
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

export function plural(count: number, one: string, many = `${one}s`): string {
    return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

/**
 * A streamable value is a JToken: null, boolean, number, string, or a whole object for a json
 * stream. Every branch has to be handled or a healthy `false` renders as blank and a `0` as absent.
 */
export function fmtStreamValue(value: unknown, valueType: StreamValueType): string {
    if (value === null || value === undefined) return NO_VALUE;
    switch (valueType) {
        case 'boolean': return value === true ? 'true' : value === false ? 'false' : String(value);
        case 'integer': return typeof value === 'number' ? fmtNum(value) : String(value);
        case 'number':
            return typeof value === 'number'
                ? value.toLocaleString(undefined, { maximumFractionDigits: Math.abs(value) >= 100 ? 1 : 3 })
                : String(value);
        case 'string': return String(value);
        case 'json': try { return JSON.stringify(value); } catch { return String(value); }
        case 'binary': return 'frame';
        default: return String(value);
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

/** An int64 Bluetooth address is unreadable; the same value as a MAC is the thing printed on it. */
export function fmtMac(addressLong: number | null | undefined): string {
    if (addressLong === null || addressLong === undefined || addressLong <= 0) return NO_VALUE;
    const hex = addressLong.toString(16).toUpperCase().padStart(12, '0');
    return (hex.match(/.{2}/g) ?? []).join(':');
}

/** "0A1B2C3D4E5F" or "0a:1b:…" → "0A:1B:2C:3D:4E:5F". */
export function fmtAddress(address: string | null | undefined): string {
    const hex = String(address ?? '').replace(/[^0-9a-f]/gi, '').toUpperCase();
    if (hex.length !== 12) return address || NO_VALUE;
    return (hex.match(/.{2}/g) ?? []).join(':');
}

export function shortId(id: string | null | undefined, length = 8): string {
    if (!id) return NO_VALUE;
    return id.length <= length ? id : id.slice(0, length);
}

export function streamInterval(entry: Pick<StreamableEntry, 'mode' | 'intervalMs'>): string {
    if (entry.mode === 'manual') return 'manual';
    if (entry.mode === 'onChange') return entry.intervalMs ? `on change · ≥${fmtMs(entry.intervalMs)}` : 'on change';
    return entry.intervalMs ? `every ${fmtMs(entry.intervalMs)}` : 'periodic';
}

/* ------------------------------------------------------------------ actions ---- */

export type ActionKind = 'button' | 'toggle' | 'number' | 'text';

export function actionKind(action: GadgetAction): ActionKind {
    switch (action.parameters) {
        case ActionParam.Bool: return 'toggle';
        case ActionParam.Integer: return 'number';
        case ActionParam.String: return 'text';
        default: return 'button';
    }
}

/** Validates what the server would refuse, so the mistake shows beside the field. */
export function validateActionParam(action: GadgetAction, value: string): string {
    if (action.parameters === ActionParam.Integer) {
        if (!/^-?\d+$/.test(value.trim())) return 'A whole number';
        const n = Number(value);
        if (n < -2_147_483_648 || n > 2_147_483_647) return 'Out of range for a 32-bit number';
    }
    if (action.parameters === ActionParam.Bool && value !== 'true' && value !== 'false') return 'true or false';
    return '';
}

/** One-click actions first, so a card's quick controls are the ones that need no typing. */
export function quickActions(actions: GadgetAction[] | null | undefined, max = 3): GadgetAction[] {
    const rank = (a: GadgetAction) => ({ toggle: 0, button: 1, number: 2, text: 3 })[actionKind(a)];
    return [...(actions ?? [])].sort((a, b) => rank(a) - rank(b)).slice(0, max);
}

/* --------------------------------------------------------------------- fleet ---- */

export type FleetState = 'online' | 'quiet' | 'connecting' | 'unreachable' | 'offline' | 'waiting-for-hub' | 'not-tried';
export type Transport = 'bluetooth' | 'hub' | 'relayed';

export interface FleetItem {
    key: string;
    gadgetID: string;
    name: string;
    state: FleetState;
    transport: Transport;
    address: string;
    hubName: string;
    gadget: Gadget | null;
    remembered: RememberedStatus | null;
    actions: GadgetAction[];
    streams: StreamableEntry[];
}

export function transportOf(connectionType: string | null | undefined): Transport {
    switch ((connectionType || '').toLowerCase()) {
        case 'hub': return 'hub';
        case 'relayed': return 'relayed';
        default: return 'bluetooth';
    }
}

export const TRANSPORT_LABEL: Record<Transport, string> = { bluetooth: 'Bluetooth', hub: 'Relay hub', relayed: 'Via hub' };

export const STATE_LABEL: Record<FleetState, string> = {
    online: 'Online',
    quiet: 'Quiet',
    connecting: 'Connecting',
    unreachable: 'Unreachable',
    offline: 'Offline',
    'waiting-for-hub': 'Waiting for hub',
    'not-tried': 'Not tried yet',
};

export const STATE_TONE: Record<FleetState, 'ok' | 'warn' | 'crit' | 'info' | 'neutral'> = {
    online: 'ok',
    quiet: 'warn',
    connecting: 'info',
    unreachable: 'crit',
    offline: 'neutral',
    'waiting-for-hub': 'neutral',
    'not-tried': 'neutral',
};

const STATE_ORDER: Record<FleetState, number> = {
    online: 0, quiet: 1, connecting: 2, unreachable: 3, offline: 4, 'waiting-for-hub': 5, 'not-tried': 6,
};

export function isLive(state: FleetState): boolean {
    return state === 'online' || state === 'quiet';
}

/**
 * One list of every gadget the hub knows: the ones connected now (GetAllGadgets) and the remembered
 * ones it could not reach (only the status route has those). Before the status route a remembered
 * gadget that did not answer at start-up was simply missing.
 */
export function buildFleet(
    gadgets: Gadget[],
    status: HubStatus | null,
    streamables: StreamableEntry[],
    now: number,
): FleetItem[] {
    const remembered = status?.remembered ?? [];
    const byId = new Map(remembered.filter(r => r.gadgetID).map(r => [r.gadgetID.toLowerCase(), r]));
    const hubs = new Map<string, string>();
    for (const g of gadgets) if (g.isHub && g.hubID) hubs.set(g.hubID.toUpperCase(), g.name);
    for (const r of remembered) if (r.isHub) hubs.set(r.address.replace(/:/g, '').toUpperCase(), r.name);
    for (const h of status?.relay?.hubs ?? []) hubs.set(h.hubID.toUpperCase(), h.name);

    const streamsFor = (id: string) => streamables.filter(s => s.gadgetID === id);
    const items: FleetItem[] = [];
    const seen = new Set<string>();

    for (const gadget of gadgets) {
        const rec = byId.get(gadget.gadgetID.toLowerCase()) ?? null;
        seen.add(gadget.gadgetID.toLowerCase());
        let state: FleetState;
        if (gadget.isOnline) {
            const age = ageMs(gadget.lastMessageReceived, now);
            state = age !== null && age > STALE_AFTER_MS ? 'quiet' : 'online';
        } else {
            state = rec && rec.state !== 'online' ? rec.state : 'offline';
        }
        items.push({
            key: gadget.gadgetID,
            gadgetID: gadget.gadgetID,
            name: gadget.name,
            state,
            transport: transportOf(gadget.connectionType),
            address: fmtAddress(gadget.IPAddress) !== NO_VALUE ? fmtAddress(gadget.IPAddress) : fmtMac(gadget.IPAddressLong),
            hubName: gadget.connectedViaHubID ? hubs.get(gadget.connectedViaHubID.toUpperCase()) ?? gadget.connectedViaHubID : '',
            gadget,
            remembered: rec,
            actions: gadget.actions ?? [],
            streams: streamsFor(gadget.gadgetID),
        });
    }

    for (const rec of remembered) {
        if (rec.gadgetID && seen.has(rec.gadgetID.toLowerCase())) continue;
        items.push({
            key: rec.gadgetID || rec.address,
            gadgetID: rec.gadgetID,
            name: rec.name,
            state: rec.state === 'online' ? 'offline' : rec.state,
            transport: transportOf(rec.connectionType),
            address: rec.address,
            hubName: rec.connectedViaHubID ? hubs.get(rec.connectedViaHubID.toUpperCase()) ?? rec.connectedViaHubID : '',
            gadget: null,
            remembered: rec,
            actions: [],
            streams: streamsFor(rec.gadgetID),
        });
    }

    return items.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]
        || Number(b.transport === 'hub') - Number(a.transport === 'hub')
        || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function matchesFleet(item: FleetItem, text: string): boolean {
    const q = text.trim().toLowerCase();
    if (!q) return true;
    return [item.name, item.address, item.gadgetID, item.hubName, TRANSPORT_LABEL[item.transport], STATE_LABEL[item.state],
        ...item.actions.map(a => a.name), ...item.streams.map(s => s.streamID)]
        .some(value => (value || '').toLowerCase().includes(q));
}

/* ------------------------------------------------------------------- verdict ---- */

export type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'neutral';

export interface IssueAction {
    label: string;
    kind: 'retry' | 'enrol' | 'tab' | 'open';
    target: string;
}

export interface Issue {
    id: string;
    tone: Tone;
    title: string;
    detail: string;
    action?: IssueAction;
}

export interface Verdict {
    tone: Tone;
    headline: string;
    detail: string;
    issues: Issue[];
}

export interface VerdictInput {
    fleet: FleetItem[];
    status: HubStatus | null;
    statusSupported: boolean;
    jobs: FirmwareJob[];
    streamables: StreamableEntry[];
    error: string;
    loaded: boolean;
    now: number;
    can: { act: boolean; manage: boolean };
}

const TONE_RANK: Record<Tone, number> = { crit: 0, warn: 1, info: 2, neutral: 3, ok: 4 };
const DAY_MS = 86_400_000;

/** The page's answer to "is anything wrong": one sentence and the few things behind it. */
export function computeVerdict(input: VerdictInput): Verdict {
    const { fleet, status, jobs, now } = input;
    if (input.error && !input.loaded) {
        return { tone: 'crit', headline: "The KliveTech hub isn't answering", detail: input.error, issues: [] };
    }
    if (!input.loaded) {
        return { tone: 'neutral', headline: 'Reading the fleet…', detail: '', issues: [] };
    }

    const issues: Issue[] = [];
    const live = fleet.filter(item => isLive(item.state));

    for (const item of fleet.filter(i => i.state === 'unreachable')) {
        const rec = item.remembered;
        const tries = rec?.failedAttempts ? `${plural(rec.failedAttempts, 'attempt')}, last ${fmtClock(rec.lastAttemptUtc, now)}` : '';
        issues.push({
            id: `unreachable-${item.key}`,
            tone: 'warn',
            title: `${item.name} didn't answer`,
            detail: [tries, rec?.lastError].filter(Boolean).join(' · '),
            action: rec?.canRetry && input.can.act ? { label: 'Try again', kind: 'retry', target: item.gadgetID } : { label: 'Open', kind: 'open', target: item.key },
        });
    }

    const hubConnected = (status?.relay?.hubs ?? []).some(h => h.open);
    for (const item of fleet.filter(i => i.state === 'waiting-for-hub' && i.transport === 'hub')) {
        issues.push({
            id: `hub-${item.key}`,
            tone: 'warn',
            title: `${item.name} isn't connected`,
            detail: 'Its gadgets come back when it reconnects to Omnipotent.',
            action: { label: 'Relay log', kind: 'tab', target: 'radio' },
        });
    }

    const refused = (status?.relay?.attempts ?? []).filter(a =>
        ['refused', 'bad-hello', 'handshake-timeout'].includes(a.outcome) && (ageMs(a.atUtc, now) ?? Infinity) < DAY_MS);
    if (refused.length) {
        const last = refused[0];
        issues.push({
            id: 'relay-refused',
            tone: 'crit',
            title: refused.length === 1 ? 'A relay hub was turned away' : `Relay hubs were turned away ${refused.length} times today`,
            detail: `${last.hubName || 'Unknown hub'} at ${fmtClock(last.atUtc, now)}: ${last.detail}`,
            action: { label: 'Relay log', kind: 'tab', target: 'radio' },
        });
    }

    for (const device of status?.nearby ?? []) {
        if (device.enrolling) continue;
        issues.push({
            id: `nearby-${device.address}`,
            tone: 'info',
            title: `${device.name || device.address} is nearby, not enrolled`,
            detail: status?.enrolment?.allowNewDevices
                ? 'Enrolment is on; it should connect on the next scan.'
                : `Enrolment is off (${status?.enrolment?.setting ?? 'KliveTechAllowNewDevices'}). Let this one in without turning it on.`,
            action: input.can.manage ? { label: 'Enrol', kind: 'enrol', target: device.address } : undefined,
        });
    }

    const bt = status?.bluetooth;
    if (bt && bt.available && bt.consecutiveFailures >= 3) {
        issues.push({
            id: 'scan-failing',
            tone: bt.consecutiveFailures >= 10 ? 'crit' : 'warn',
            title: `Bluetooth scans are failing (${bt.consecutiveFailures} in a row)`,
            detail: bt.lastError || 'The adapter stopped answering.',
            action: { label: 'Radio', kind: 'tab', target: 'radio' },
        });
    }

    for (const item of fleet.filter(i => i.state === 'quiet')) {
        issues.push({
            id: `quiet-${item.key}`,
            tone: 'warn',
            title: `${item.name} has gone quiet`,
            detail: `Last heard ${fmtAgo(item.gadget?.lastMessageReceived, now)}.`,
            action: { label: 'Open', kind: 'open', target: item.key },
        });
    }

    const dropped = input.streamables.reduce((sum, s) => sum + (s.droppedEvents || 0), 0);
    if (dropped > 0) {
        issues.push({
            id: 'dropped',
            tone: 'warn',
            title: `${plural(dropped, 'sample')} dropped`,
            detail: 'The hub discarded telemetry because a queue was full. Charts have gaps.',
            action: { label: 'Streams', kind: 'tab', target: 'streams' },
        });
    }

    const failed = jobs.filter(j => j.state === 'Failed' && (ageMs(j.completedUtc ?? j.createdUtc, now) ?? Infinity) < DAY_MS);
    if (failed.length) {
        issues.push({
            id: 'firmware-failed',
            tone: 'crit',
            title: `Firmware job failed: ${failed[0].project}`,
            detail: failed[0].error || 'See the build log.',
            action: { label: 'Firmware', kind: 'tab', target: 'firmware' },
        });
    }
    const running = jobs.filter(j => !isTerminalJob(j.state));
    if (running.length) {
        const job = running[0];
        issues.push({
            id: 'firmware-running',
            tone: 'info',
            title: job.kind === 'Update' ? `Flashing ${job.gadgetName || 'a gadget'}` : `Compiling ${job.project}`,
            detail: `${job.state} · ${job.progressPercent}%`,
            action: { label: 'Firmware', kind: 'tab', target: 'firmware' },
        });
    }

    const toolchain = status?.firmware?.toolchain;
    if (toolchain && !toolchain.found) {
        issues.push({
            id: 'toolchain',
            tone: 'info',
            title: "Firmware can't be built on this server",
            detail: toolchain.error,
            action: { label: 'Firmware', kind: 'tab', target: 'firmware' },
        });
    }

    issues.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);

    const known = fleet.length;
    const worst = issues[0]?.tone ?? 'ok';
    let tone: Tone;
    let headline: string;
    let detail: string;
    if (!known && !(status?.nearby?.length)) {
        tone = refused.length ? 'crit' : 'neutral';
        headline = 'No gadgets yet';
        detail = status
            ? `Pair one over Bluetooth${status.bluetooth?.available ? '' : ' (this server has no adapter)'}, or connect a relay hub to ${status.relay?.endpoint ?? '/klivetech/hub/connect'}.`
            : 'Pair one over Bluetooth, or connect a relay hub.';
    } else if (live.length === known && known) {
        tone = worst === 'crit' ? 'crit' : worst === 'warn' ? 'warn' : 'ok';
        headline = known === 1 ? `${live[0].name} is online` : `All ${known} gadgets are online`;
        detail = linkSummary(live, hubConnected);
    } else if (!live.length) {
        tone = known ? 'crit' : 'neutral';
        headline = 'No gadget is connected';
        detail = known ? `${plural(known, 'remembered gadget')}, none reachable right now.` : '';
    } else {
        tone = worst === 'crit' ? 'crit' : 'warn';
        headline = `${live.length} of ${known} gadgets online`;
        detail = linkSummary(live, hubConnected);
    }
    if (!input.statusSupported) {
        detail = [detail, "This server doesn't report gadgets it couldn't reach."].filter(Boolean).join(' ');
    }
    return { tone, headline, detail, issues };
}

function linkSummary(live: FleetItem[], hubConnected: boolean): string {
    const bt = live.filter(i => i.transport === 'bluetooth').length;
    const relayed = live.filter(i => i.transport !== 'bluetooth').length;
    const parts: string[] = [];
    if (bt) parts.push(`${bt} over Bluetooth`);
    if (relayed) parts.push(`${relayed} through ${hubConnected ? 'the relay' : 'a relay hub'}`);
    return parts.join(' · ');
}

/* ------------------------------------------------------------------ commands ---- */

export interface TechCommand {
    id: string;
    group: string;
    title: string;
    hint?: string;
    icon: string;
    keywords?: string;
    danger?: boolean;
    run: () => unknown;
}

/** Prefix of a word beats a substring beats letters in order; nothing matched is 0. */
export function scoreCommand(query: string, command: Pick<TechCommand, 'title' | 'keywords' | 'group'>): number {
    const q = query.trim().toLowerCase();
    if (!q) return 1;
    const hay = `${command.title} ${command.keywords ?? ''} ${command.group}`.toLowerCase();
    const title = command.title.toLowerCase();
    if (title.startsWith(q)) return 100;
    if (title.split(/[\s·→/-]+/).some(word => word.startsWith(q))) return 80;
    if (hay.includes(q)) return 60;
    let at = 0;
    for (const ch of q) {
        at = hay.indexOf(ch, at);
        if (at < 0) return 0;
        at++;
    }
    return 20;
}

/* --------------------------------------------------------------- events -------- */

export const EVENT_ICON: Record<string, string> = {
    connected: 'link',
    disconnected: 'unlink',
    'connect-failed': 'alert',
    'discovery-failed': 'radar',
    nearby: 'radar',
    enrolled: 'plus',
    forgotten: 'trash',
    retry: 'refresh',
    action: 'bolt',
    'action-failed': 'bolt',
    'relay-connected': 'hub',
    'relay-refused': 'shield',
    'relay-closed': 'hub',
    firmware: 'chip',
};

export function eventIcon(kind: string): string {
    return EVENT_ICON[kind] ?? 'dot';
}

export const RELAY_OUTCOME: Record<string, { label: string; tone: Tone }> = {
    pending: { label: 'Handshaking', tone: 'info' },
    connected: { label: 'Connected', tone: 'ok' },
    closed: { label: 'Session ended', tone: 'neutral' },
    failed: { label: 'Dropped', tone: 'warn' },
    refused: { label: 'Wrong token', tone: 'crit' },
    'bad-hello': { label: 'Bad hello', tone: 'crit' },
    'handshake-timeout': { label: 'No hello', tone: 'crit' },
};

export function jobTone(state: string): Tone {
    switch (state) {
        case 'Completed': return 'ok';
        case 'Failed': return 'crit';
        case 'Cancelled': return 'neutral';
        case 'Compiling': case 'Uploading': return 'info';
        default: return 'neutral';
    }
}

export function jobDuration(job: FirmwareJob): string {
    const started = parseUtc(job.startedUtc) ?? parseUtc(job.createdUtc);
    const finished = parseUtc(job.completedUtc);
    if (started === null || finished === null) return NO_VALUE;
    return fmtDuration(finished - started);
}

export async function ktCopy(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}
