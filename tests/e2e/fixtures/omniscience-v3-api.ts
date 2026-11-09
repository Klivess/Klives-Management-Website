import { type Page, type WebSocketRoute } from '@playwright/test';
import type {
    CohortDto, DatasetCatalogDto, ExploreQuery, ExploreRecordsRequest, ExploreResult, JobRecord, LlmCallDto, LlmSummaryRowDto, ModuleDto,
    Playbook, Selection, SettingDto, StreamEventDto, TacticDescriptor, TacticRunDto, V3Phase, V3StatusDto,
} from '../../../scripts/omniscience/contracts';
import { catalogPayload, mePayload } from './permissions';

/**
 * Mocked Omniscience v3 API. Every payload is typed against the contract generated from the C#
 * DTOs (scripts/omniscience/contracts.ts), so a contract change breaks this file at compile time
 * instead of leaving the tests green against shapes the server no longer sends. All data is
 * synthetic. A v3 route the mock does not know is recorded in `state.unknown` and answered 500,
 * and every test asserts that list is empty — a page can never pass by calling something unmocked.
 */

export const apiOrigin = 'https://klive.dev';
export const V3 = '/omniscience/v3';
/** 2026-07-01 12:00:00 UTC — 13:00 in Europe/London (BST), so the two time lenses visibly differ. */
export const NOW = Date.UTC(2026, 6, 1, 12, 0, 0);
export const BOOT = { timeout: 60_000 };

const V3_PERMISSIONS = ['omniscience.engine.manage', 'omniscience.tactics.run', 'omniscience.faces.read', 'omniscience.faces.label',
    'omniscience.data.export', 'omniscience.alerts.manage', 'omniscience.outbound.confirm'];

const descriptor = (over: Partial<TacticDescriptor> & Pick<TacticDescriptor, 'key' | 'code' | 'title'>): TacticDescriptor => ({
    category: 'Transform', description: '', accepts: ['Person'], minSelections: 1, maxSelections: 1, parameterSchemaJson: '{"type":"object","properties":{}}',
    outputs: ['Cohort'], lane: 'Cpu', requiredPermission: 'omniscience.overview.view', outbound: false, minorRestriction: null, version: 1,
    typicalDurationMs: 200, typicalLlmCalls: 0, ...over,
});

export const TACTICS: TacticDescriptor[] = [
    descriptor({
        key: 'x26.cohort', code: 'X26', title: 'Save as cohort', description: 'Save a set of people as a named cohort.',
        requiredPermission: 'omniscience.persons.read',
        parameterSchemaJson: '{"type":"object","required":["name"],"properties":{"name":{"type":"string","minLength":1,"maxLength":120},"cohortId":{"type":"string","description":"Update this cohort instead of creating a new one."}}}',
    }),
    descriptor({
        key: 'x27.setalgebra', code: 'X27', title: 'Set algebra', description: 'Combine two sets of the same kind, or sort a set and keep the top k.',
        accepts: ['Person', 'Message', 'TimeRange'], maxSelections: 2, outputs: ['Cohort', 'MessageSet'],
        parameterSchemaJson: '{"type":"object","required":["op"],"properties":{"op":{"type":"string","enum":["union","intersect","difference","sort","topk"]},"k":{"type":"integer","minimum":1,"maximum":100000},"order":{"type":"string","enum":["ScoreDescending","ScoreAscending","Label","Id"]}}}',
    }),
    descriptor({
        key: 'x77.notify', code: 'X77', title: 'KliveBot notify', category: 'Outward', description: 'Send a result to Klives as a direct message.',
        accepts: ['Message'], outputs: ['ActionProposal'], outbound: true, requiredPermission: 'omniscience.outbound.confirm',
    }),
];

function modules(): ModuleDto[] {
    const health = (moduleId: string, title: string, over: Partial<NonNullable<ModuleDto['health']>> = {}) => ({
        moduleId, title, version: 1, enabled: true, watermark: 48_210, backlog: 0, dirtySubjects: 0, queued: 0, leased: 0, dead: 0,
        lastSucceededMs: NOW - 90_000, lastFailedMs: null, lastError: null, ...over,
    });
    return [
        {
            id: 'ingest.legacy', version: 1, title: 'Legacy import', category: 'Ingest', description: 'Imports the v2 corpus, then tails it every two minutes.',
            dependsOn: [], subscribedChangeKinds: [], schedules: [{ name: 'tail', everyMs: 120_000 }], defaultLane: 'Io', minorRestricted: false,
            datasets: [{ id: 'messages', title: 'Messages', dimensions: [{ dimensionId: 'time.sent', column: 'sent_at' }], measures: [{ id: 'count', title: 'Messages', aggregate: 'count', unit: '' }], recordKind: 'message', requiredPermission: 'omniscience.overview.view', minorFiltered: false }],
            settings: [], health: health('ingest.legacy', 'Legacy import', { queued: 2, leased: 1 }),
        },
        {
            id: 'knowledge.deduction', version: 3, title: 'Deduction', category: 'Knowledge', description: 'Extracts, verifies and consolidates facts from evidence.',
            dependsOn: ['ingest.legacy'], subscribedChangeKinds: ['message.inserted', 'message.edited'], schedules: [{ name: 'consolidate', dailyAtLocal: '03:30' }],
            defaultLane: 'LlmBackground', minorRestricted: true, datasets: [], settings: [],
            health: health('knowledge.deduction', 'Deduction', { backlog: 420, dirtySubjects: 7, dead: 2, lastFailedMs: NOW - 30_000, lastError: 'provider answered 503 three times' }),
        },
        {
            id: 'analytics.rollups', version: 1, title: 'Rollups', category: 'Analytics', description: 'Per-person, per-day rollups maintained incrementally.',
            dependsOn: ['ingest.legacy'], subscribedChangeKinds: ['message.inserted'], schedules: [], defaultLane: 'Cpu', minorRestricted: false,
            datasets: [], settings: [], health: health('analytics.rollups', 'Rollups', { enabled: false }),
        },
    ];
}

function settings(): SettingDto[] {
    return [
        { key: 'kernel.klivesTimeZone', scope: 'kernel', type: 'zone', defaultJson: '"Europe/London"', valueJson: null, description: "Klives's IANA time zone: defines today, schedules and day boundaries." },
        { key: 'kernel.llmSlotMinutesPerDay', scope: 'kernel', type: 'int', defaultJson: '600', valueJson: '480', description: 'Daily budget of background LLM slot-minutes.', min: 0, max: 1440, updatedAtMs: NOW - 86_400_000 },
        { key: 'ingest.legacy.enabled', scope: 'ingest.legacy', type: 'bool', defaultJson: 'true', valueJson: null, description: 'Import from Omniscience v2.' },
        { key: 'knowledge.deduction.minConfidence', scope: 'knowledge.deduction', type: 'number', defaultJson: '0.8', valueJson: null, description: 'Facts below this confidence stay proposals.', min: 0, max: 1 },
    ];
}

function job(jobId: number, over: Partial<JobRecord> = {}): JobRecord {
    return {
        jobId, moduleId: 'knowledge.deduction', kind: 'extract.slice', subjectKind: 'person', subjectId: `person-${jobId}`, dedupeKey: `extract:${jobId}`,
        priority: 5, lane: 'LlmBackground', state: 'succeeded', attempts: 1, maxAttempts: 5, notBeforeMs: NOW - 600_000, leaseOwner: null, leaseExpiresMs: null,
        payloadJson: JSON.stringify({ slice: jobId }), progressJson: null, resultJson: JSON.stringify({ claims: 4 }), errorClass: null, errorMessage: null,
        createdAtMs: NOW - 600_000 - jobId * 1000, startedAtMs: NOW - 590_000, finishedAtMs: NOW - 530_000, parentJobId: null, runId: null, ...over,
    };
}

function llmCall(callId: number, over: Partial<LlmCallDto> = {}): LlmCallDto {
    return {
        callId, atMs: NOW - callId * 60_000, moduleId: 'knowledge.deduction', purpose: 'extract', jobId: 900 + callId, model: 'fixture-model', provider: 'AIRouter',
        workClass: 'Background', promptTokens: 180_000, cachedTokens: 150_000, completionTokens: 2_400, requestBytes: 760_000, latencyMs: 92_000,
        outcome: 'ok', finishReason: 'stop', promptVersion: 'extract/3', error: null, ...over,
    };
}

const summaryRow = (key: string, over: Partial<LlmSummaryRowDto> = {}): LlmSummaryRowDto => ({
    key, calls: 12, ok: 11, failed: 1, promptTokens: 2_000_000, cachedTokens: 1_600_000, completionTokens: 30_000, cacheHitRate: 0.8,
    p50LatencyMs: 60_000, p95LatencyMs: 140_000, firstAtMs: NOW - 3_000_000, lastAtMs: NOW - 120_000, ...over,
});

const DATASETS: DatasetCatalogDto = {
    datasets: [{
        id: 'messages', title: 'Messages', recordKind: 'message', requiredPermission: 'omniscience.overview.view', minorFiltered: true,
        dimensions: [{ dimensionId: 'time.sent', column: 'sent_at' }, { dimensionId: 'where.platform', column: 'platform' }, { dimensionId: 'content.has_link', column: 'has_link' }],
        measures: [{ id: 'count', title: 'Messages', aggregate: 'count', unit: '' }, { id: 'chars', title: 'Characters', aggregate: 'sum', column: 'length', unit: 'chars' }],
    }],
    dimensions: [
        { id: 'time.sent', title: 'Sent at', kind: 'Time', group: 'Time' },
        { id: 'where.platform', title: 'Platform', kind: 'Category', group: 'Where' },
        { id: 'content.has_link', title: 'Has a link', kind: 'Flag', group: 'Content' },
    ],
};

export interface V3MockOptions {
    phase?: V3Phase;
    /** Permissions of a non-owner profile; omitted = the owner (everything). */
    permissions?: string[];
    /** The Explore engine is not installed in this build (WS-C not merged). */
    exploreInstalled?: boolean;
}

export async function mockV3(page: Page, options: V3MockOptions = {}) {
    const phase = options.phase ?? 'Ready';
    const state = {
        requests: [] as string[],
        posts: [] as { path: string; body: any }[],
        unknown: [] as string[],
        errors: [] as string[],
        sockets: [] as { ws: WebSocketRoute; url: URL }[],
        modules: modules(),
        settings: settings(),
        jobs: [
            job(1206, { state: 'leased', lane: 'Io', moduleId: 'ingest.legacy', kind: 'tail', finishedAtMs: null, leaseOwner: 'worker-io-1', leaseExpiresMs: NOW + 60_000, progressJson: JSON.stringify({ rows: 1200 }), resultJson: null }),
            job(1205, { state: 'queued', startedAtMs: null, finishedAtMs: null, resultJson: null, attempts: 0 }),
            job(1204, { state: 'dead', attempts: 5, errorClass: 'transient', errorMessage: 'provider answered 503 three times', resultJson: null }),
            job(1203), job(1202), job(1201),
        ] as JobRecord[],
        calls: [llmCall(1), llmCall(2, { purpose: 'critic' }), llmCall(3, { outcome: 'http_503', error: 'provider answered 503', cachedTokens: 0, workClass: 'Interactive' })],
        runs: [] as TacticRunDto[],
        playbooks: [{
            id: 'pb-sunday', name: 'Sunday catch-up', enabled: true, lastRunMs: NOW - 3 * 86_400_000, createdAtMs: NOW - 30 * 86_400_000, updatedAtMs: NOW - 86_400_000,
            trigger: { kind: 'Weekly', at: '10:00', days: ['Sunday'] }, definition: { steps: [{ tactic: 'x27.setalgebra', parameters: { op: 'sort' }, input: { from: 'trigger' } }] },
        }] as Playbook[],
        cohorts: [{ cohortId: 'c-close', name: 'Close friends', members: 3, createdAtMs: NOW - 10 * 86_400_000, updatedAtMs: NOW - 3_600_000 }] as CohortDto[],
        refuseRuns: null as { status: number; code: string; message: string } | null,
        /** Push a live-stream frame to every open socket. */
        push(frame: StreamEventDto) { for (const s of state.sockets) s.ws.send(JSON.stringify(frame)); },
    };
    const cohortSelection: Selection = {
        kind: 'Person', sampled: false, items: [{ id: 'person-a', label: 'Synthetic Ada' }, { id: 'person-b', label: 'Synthetic Bo' }, { id: 'person-c', label: 'Synthetic Cy' }],
    };
    const owner = options.permissions === undefined;

    page.on('pageerror', e => state.errors.push(`pageerror: ${e.message}`));
    await page.clock.setFixedTime(NOW);
    // Later registrations win: every other socket is refused quietly, the v3 stream is served.
    await page.routeWebSocket(/klive\.dev/, ws => { ws.close({ code: 1000 }); });
    await page.routeWebSocket(/\/omniscience\/v3\/stream/, ws => {
        const entry = { ws, url: new URL(ws.url()) };
        state.sockets.push(entry);
        ws.onClose(() => { state.sockets = state.sockets.filter(s => s !== entry); });
    });

    function status(): V3StatusDto {
        if (phase !== 'Ready') {
            return { phase, stage: phase === 'Starting' ? 'opening stores' : '', failure: phase === 'Failed' ? 'corpus.db is locked by another process' : null,
                nowMs: NOW, startedAtMs: null, readyAtMs: null, klivesZone: null, stores: [], lanes: [], modules: [], llm: null, stream: null, routes: [] };
        }
        return {
            phase: 'Ready', stage: 'ready', failure: null, nowMs: NOW, startedAtMs: NOW - 7_300_000, readyAtMs: NOW - 7_200_000, klivesZone: 'Europe/London',
            stores: [
                { name: 'corpus', fileBytes: 6_400_000_000, walBytes: 12_000_000, pendingWrites: 0, committedBatches: 4812, lastCommitMs: NOW - 4000 },
                { name: 'intel', fileBytes: 900_000_000, walBytes: 3_000_000, pendingWrites: 14, committedBatches: 990, lastCommitMs: NOW - 1000 },
            ],
            lanes: [
                { lane: 'Cpu', queued: 3, leased: 2, succeeded: 5120, dead: 0, cancelled: 4 },
                { lane: 'LlmBackground', queued: 41, leased: 1, succeeded: 212, dead: 2, cancelled: 0 },
            ],
            modules: state.modules.map(m => m.health!),
            llm: { circuitOpen: false, backgroundPaused: false, lastHourByWorkClass: [summaryRow('Background'), summaryRow('Interactive', { calls: 2, ok: 2, failed: 0, promptTokens: 200_000, cachedTokens: 20_000, cacheHitRate: 0.1 })] },
            stream: { connections: state.sockets.length, oldestEventId: 1, newestEventId: 40 },
            routes: ['GET /omniscience/v3/status'],
        };
    }

    function exploreResult(q: ExploreQuery): ExploreResult {
        const grouped = q.groupBy.includes('where.platform');
        return {
            columns: [...(grouped ? [{ id: 'where.platform', title: 'Platform', kind: 'Category' }] : []), ...q.measures.map(m => ({ id: m, title: m === 'count' ? 'Messages' : 'Characters', kind: 'Measure' }))],
            rows: grouped ? [['discord', ...q.measures.map(() => 4200)], ['whatsapp', ...q.measures.map(() => 900)], [null, ...q.measures.map(() => 12)]] : [q.measures.map(() => 5112)],
            asOfMs: q.asOfMs ?? NOW, coverage: { sources: ['discord:synthetic', 'whatsapp:synthetic'], fromMs: NOW - 400 * 86_400_000, toMs: NOW, records: 5112, sampled: false },
            nextCursor: null, drillToken: 'drill-fixture', explain: 'SELECT platform, count(*) FROM messages GROUP BY 1',
        };
    }

    await page.route(`${apiOrigin}/**`, async route => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const p = url.searchParams;
        const method = request.method();
        const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page, Cache-Control', 'access-control-expose-headers': '*' };
        if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
        const json = (body: unknown, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
        const fail = (status: number, code: string, message: string) => json({ code, message }, status);
        let body: any = null;
        if (method === 'POST') {
            try { body = JSON.parse(request.postData() ?? 'null'); } catch { body = request.postData(); }
            state.posts.push({ path, body });
        }
        state.requests.push(`${method} ${path}${url.search}`);

        switch (path) {
            case '/KMProfiles/LoginStatus': return route.fulfill({ status: 200, headers: cors, body: 'SessionActive' });
            case '/KMProfiles/me': {
                if (owner) return json({ ...mePayload({ rank: 5 }), permissions: [...mePayload({ rank: 5 }).permissions, ...V3_PERMISSIONS] });
                return json(mePayload({ rank: 3, permissions: options.permissions }));
            }
            case '/KMProfiles/permissions/catalog': return json(catalogPayload(false));
            case '/KMProfiles/GetCurrentProfile': return json({ Name: 'Klives', KlivesManagementRank: owner ? 5 : 3 });
        }
        if (!path.startsWith(`${V3}/`)) return json({});

        const sub = path.slice(V3.length + 1);
        if (sub === 'status') return json(status());
        if (phase === 'Disabled') return fail(503, 'disabled', 'Omniscience v3 is installed but off. Set OmniscienceV3_ShadowEnabled=true to run it in shadow mode.');
        if (phase === 'Starting') return fail(503, 'starting', 'Omniscience v3 is starting: opening stores.');
        if (phase === 'Failed') return fail(503, 'failed', 'Omniscience v3 failed to start: corpus.db is locked by another process. The service log has the details.');
        const can = (key: string) => owner || options.permissions!.includes(key);

        switch (`${method} ${sub}`) {
            case 'GET modules': return json(state.modules);
            case 'POST modules/enabled': {
                if (!can('omniscience.engine.manage')) return fail(403, 'forbidden', 'Needs engine.manage.');
                const m = state.modules.find(x => x.id === body.moduleId);
                if (!m) return fail(404, 'not_found', `No module '${body.moduleId}'.`);
                m.health = { ...m.health!, enabled: body.enabled };
                return json(m);
            }
            case 'GET settings': return json(state.settings);
            case 'POST settings/set': {
                const s = state.settings.find(x => x.key === body.key);
                if (!s) return fail(404, 'not_found', `No setting is named '${body.key}'.`);
                if (typeof body.value === 'number' && s.max != null && body.value > s.max) return fail(400, 'bad_request', `'${s.key}' must be at most ${s.max}.`);
                s.valueJson = JSON.stringify(body.value);
                s.updatedAtMs = NOW;
                return json(s);
            }
            case 'GET jobs': {
                let items = state.jobs.filter(j =>
                    (!p.get('state') || j.state === p.get('state')) && (!p.get('lane') || j.lane === p.get('lane')) && (!p.get('module') || j.moduleId === p.get('module')));
                const cursor = Number(p.get('cursor') ?? 0);
                if (cursor) items = items.filter(j => j.jobId < cursor);
                // Pages of four, so "load older" is exercised with a real cursor.
                const pageItems = items.slice(0, 4);
                return json({ items: pageItems, nextCursor: items.length > 4 ? pageItems[3]!.jobId : null });
            }
            case 'GET jobs/get': {
                const found = state.jobs.find(j => j.jobId === Number(p.get('id')));
                return found ? json(found) : fail(404, 'not_found', 'No such job.');
            }
            case 'POST jobs/retry': case 'POST jobs/cancel': {
                const found = state.jobs.find(j => j.jobId === body.jobId);
                if (!found) return fail(404, 'not_found', 'No such job.');
                found.state = sub === 'jobs/retry' ? 'queued' : 'cancelled';
                return json({ jobId: found.jobId, changed: true, state: found.state });
            }
            case 'GET llm/calls': {
                const items = state.calls.filter(c => (!p.get('workClass') || c.workClass === p.get('workClass')) && (!p.get('outcome') || c.outcome === p.get('outcome')));
                return json({ items, nextCursor: null });
            }
            case 'GET llm/summary': {
                const groupBy = p.get('groupBy') ?? 'WorkClass';
                const rows = groupBy === 'WorkClass' ? [summaryRow('Background'), summaryRow('Interactive', { calls: 2, ok: 2, failed: 0 })] : [summaryRow(`${groupBy.toLowerCase()}-a`)];
                return json({ fromMs: Number(p.get('from')) || null, toMs: null, groupBy, rows });
            }
            case 'GET events': return json({ items: [], cursor: 0, more: false });
            case 'GET tactics': return json({ tactics: TACTICS });
            case 'POST tactics/estimate': return json({ durationMs: 200, llmCalls: 0, items: (body.selections ?? []).reduce((n: number, s: Selection) => n + s.items.length, 0), willSample: false });
            case 'POST tactics/run': {
                if (state.refuseRuns) return fail(state.refuseRuns.status, state.refuseRuns.code, state.refuseRuns.message);
                const runId = `run-${state.runs.length + 1}`;
                state.runs.unshift({
                    runId, tactic: body.tactic, tacticVersion: 1, actor: 'Klives (e2e)', state: 'succeeded', input: { selections: body.selections, parameters: body.parameters },
                    asOfMs: body.asOfMs ?? null, currentStage: null, progress: null, error: null, parentRunId: null, playbookRunId: null,
                    outputs: [{ kind: 'Cohort', summary: 'Sorted 3 people', selection: { ...cohortSelection, items: cohortSelection.items.map((item, i) => ({ ...item, score: 1 - i / 10 })) } }],
                    createdAtMs: NOW, startedAtMs: NOW, finishedAtMs: NOW + 180, stale: false,
                });
                return json({ runId }, 202);
            }
            case 'GET tactics/runs': return json({ items: state.runs.filter(r => !p.get('state') || r.state === p.get('state')), nextCursor: null });
            case 'GET tactics/runs/get': {
                const found = state.runs.find(r => r.runId === p.get('id'));
                return found ? json(found) : fail(404, 'not_found', 'No such run.');
            }
            case 'GET tactics/runs/stream': {
                const found = state.runs.find(r => r.runId === p.get('id'));
                if (!found) return fail(404, 'not_found', 'No such run.');
                const lines = [
                    { type: 'run', run: { ...found, state: 'running', outputs: null, finishedAtMs: null } },
                    { type: 'tactic.progress', id: 41, at: NOW + 50, detail: { runId: found.runId, tactic: found.tactic, detail: { stage: 'combine', note: '3 people' } } },
                    { type: 'tactic.finished', id: 42, at: NOW + 180, detail: { runId: found.runId, tactic: found.tactic, detail: { state: 'succeeded', outputs: 1 } } },
                    { type: 'run', run: found },
                ];
                return route.fulfill({ status: 200, headers: cors, contentType: 'application/x-ndjson; charset=utf-8', body: lines.map(l => JSON.stringify(l)).join('\n') + '\n' });
            }
            case 'POST tactics/runs/rerun': {
                const source = state.runs.find(r => r.runId === body.runId);
                if (!source) return fail(404, 'not_found', 'No such run.');
                const runId = `run-${state.runs.length + 1}`;
                state.runs.unshift({ ...source, runId, parentRunId: source.runId });
                return json({ runId }, 202);
            }
            case 'GET cohorts': return can('omniscience.persons.read') ? json(state.cohorts) : fail(403, 'forbidden', 'Needs persons.read.');
            case 'GET cohorts/get': return json({ cohort: state.cohorts[0], selection: cohortSelection });
            case 'GET playbooks': return json({ playbooks: state.playbooks });
            case 'POST playbooks/validate': {
                const problems: string[] = [];
                if ((body.trigger.kind === 'Daily' || body.trigger.kind === 'Weekly') && !/^\d\d:\d\d$/.test(body.trigger.at ?? ''))
                    problems.push("A daily or weekly trigger needs 'at' as HH:mm (Klives's local time).");
                return json({ problems, nextDueMs: problems.length || body.trigger.kind === 'Manual' ? null : NOW + 3_600_000 });
            }
            case 'POST playbooks/save': {
                const saved: Playbook = { id: body.id ?? 'pb-new', name: body.name, definition: body.definition, trigger: body.trigger, enabled: body.enabled, lastRunMs: null, createdAtMs: NOW, updatedAtMs: NOW };
                state.playbooks = [...state.playbooks.filter(x => x.id !== saved.id), saved];
                return json(saved);
            }
            case 'GET playbooks/runs': return json([]);
            case 'POST playbooks/run': return json({ runId: 'pbrun-1' }, 202);
            case 'GET explore/datasets': return json(DATASETS);
            case 'POST explore/query':
                return options.exploreInstalled === false ? fail(503, 'unavailable', 'The Explore engine is not installed in this build yet.') : json(exploreResult(body as ExploreQuery));
            case 'POST explore/records': {
                const req = body as ExploreRecordsRequest;
                const platform = String(req.narrow?.[0]?.values?.[0] ?? 'discord');
                return json({ recordKind: 'message', total: 2, nextCursor: null, records: [
                    { id: `${platform}:1001`, sentAtMs: NOW - 86_400_000, platform, text: 'synthetic message one' },
                    { id: `${platform}:1002`, sentAtMs: NOW - 3_600_000, platform, text: 'synthetic message two' },
                ] });
            }
            case 'GET rm/catalog': return json({ models: [] });
        }
        state.unknown.push(`${method} ${path}`);
        return fail(500, 'internal', `e2e: no fixture for ${method} ${path}`);
    });

    return state;
}
