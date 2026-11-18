import type { Page, Route } from '@playwright/test';
import { catalogPayload, mePayload } from './permissions';

/**
 * A stateful stand-in for the KliveTech Hub's routes. Payloads have the shapes the server writes
 * (KliveTechHub.KliveTechGadget for the gadget list, StreamableCatalogEntry for streams, FirmwareJob,
 * and KliveTechHubStatus.HubStatus for /klivetech/status as added in Nov 2026). Every name, address
 * and value is invented. Actions change the state, so a test can retry, enrol, forget or flash and
 * watch the page agree. The live WebSocket is faked too: it sends a snapshot and then samples.
 *
 * 'legacy' is a server from before the status route ("Route not found"); 'empty' knows no gadgets.
 */

export type TechScenario = 'normal' | 'empty' | 'legacy';

export interface TechMockOptions { scenario?: TechScenario; permissions?: string[] }

export interface TechApiMock {
  requestedPaths: string[];
  directGets: string[];
  batchCalls: string[][];
  posts: Array<{ path: string; query: Record<string, string>; body: any }>;
  sockets: string[];
  state: { gadgets: any[]; remembered: any[]; nearby: any[]; streams: any[]; jobs: any[]; events: any[] };
}

export const techTestOrigin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`,
).origin;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page',
  'access-control-expose-headers': '*',
};

async function fulfil(route: Route, payload: unknown, status = 200, type = 'application/json; charset=utf-8', extra: Record<string, string> = {}) {
  await route.fulfill({ status, headers: { ...CORS, 'content-type': type, ...extra }, body: status === 204 ? '' : typeof payload === 'string' || Buffer.isBuffer(payload) ? payload as any : JSON.stringify(payload) });
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGNkYPhfz8DAwMDAxMDAwAAAHwMBAZr5QYwAAAAASUVORK5CYII=', 'base64');
const SESSION = '00112233445566778899AABBCCDDEEFF';

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
/** The server writes DateTime.UtcNow without a zone marker. */
const utc = (msAgo: number) => iso(msAgo).replace('Z', '');

function gadget(over: Record<string, unknown>) {
  return {
    name: 'KliveTech Gadget', IPAddress: '0A:00:00:00:00:01', IPAddressLong: 0x0a0000000001, gadgetID: 'g', actions: [],
    timeConnected: utc(3_600_000), isOnline: true, lastMessageReceived: utc(2_000), connectionType: 'Bluetooth',
    isHub: false, hubID: '', connectedViaHubID: '', connectedGadgetCount: 0, streamableCount: 0, ...over,
  };
}

function stream(gadgetID: string, gadgetName: string, streamID: string, valueType: string, over: Record<string, unknown> = {}) {
  return {
    gadgetID, gadgetName, gadgetOnline: true, streamID, valueType, mimeType: valueType === 'binary' ? 'image/jpeg' : 'application/json',
    mode: 'periodic', intervalMs: 1000, enabled: true, sessionID: SESSION, manifestRevision: 3, latestSequence: 120,
    latestDeviceTimestampMs: 99_000, latestReceivedUtc: utc(1_000), latestValue: null, latestBinaryBytes: null, latestBinarySha256: '',
    droppedEvents: 0, ...over,
  };
}

function remembered(over: Record<string, unknown>) {
  return {
    gadgetID: '', name: '', address: '', connectionType: 'Bluetooth', isHub: false, connectedViaHubID: '', online: false,
    state: 'not-tried', failedAttempts: 0, totalAttempts: 0, lastAttemptUtc: null, lastConnectedUtc: null, lastDisconnectedUtc: null,
    lastDisconnectReason: '', lastError: '', lastErrorUtc: null, canRetry: true, ...over,
  };
}

export async function installTechApiMock(page: Page, options: TechMockOptions = {}): Promise<TechApiMock> {
  const scenario = options.scenario ?? 'normal';
  const empty = scenario === 'empty';
  const legacy = scenario === 'legacy';
  let eventSeq = 50;

  const lamp = gadget({
    name: 'KliveTech Desk Lamp', gadgetID: 'lamp-1', IPAddress: '0A:1B:2C:3D:4E:01', IPAddressLong: 0x0a1b2c3d4e01, streamableCount: 3,
    actions: [
      { name: 'Set light', parameters: 2, paramDescription: 'Whether the light is on' },
      { name: 'Brightness', parameters: 0, paramDescription: '0 to 255' },
      { name: 'Reboot', parameters: 3, paramDescription: '' },
      { name: 'Say', parameters: 1, paramDescription: 'Text to scroll' },
    ],
  });
  const hub = gadget({
    name: 'KliveTech Kitchen Hub', gadgetID: 'hub-1', IPAddress: 'AABBCCDDEE01', IPAddressLong: 0xaabbccddee01, connectionType: 'Hub',
    isHub: true, hubID: 'AABBCCDDEE01', connectedGadgetCount: 1, timeConnected: utc(7_200_000),
    actions: [{ name: 'Restart relay', parameters: 3, paramDescription: '' }],
  });
  const plant = gadget({
    name: 'KliveTech Plant Sensor', gadgetID: 'plant-1', IPAddress: 'AABBCCDDEE02', IPAddressLong: 0xaabbccddee02, connectionType: 'Relayed',
    connectedViaHubID: 'AABBCCDDEE01', streamableCount: 1, lastMessageReceived: utc(4_000),
  });

  const state = {
    gadgets: empty ? [] : legacy ? [lamp] : [lamp, hub, plant],
    remembered: empty || legacy ? [] as any[] : [
      remembered({ gadgetID: 'lamp-1', name: lamp.name, address: '0A:1B:2C:3D:4E:01', online: true, state: 'online', totalAttempts: 1, lastAttemptUtc: utc(3_600_000), lastConnectedUtc: utc(3_600_000), canRetry: false }),
      remembered({ gadgetID: 'hub-1', name: hub.name, address: 'AA:BB:CC:DD:EE:01', connectionType: 'Hub', isHub: true, online: true, state: 'online', lastConnectedUtc: utc(7_200_000), canRetry: false }),
      remembered({ gadgetID: 'plant-1', name: plant.name, address: 'AA:BB:CC:DD:EE:02', connectionType: 'Relayed', connectedViaHubID: 'AABBCCDDEE01', online: true, state: 'online', canRetry: false }),
      remembered({
        gadgetID: 'garage-1', name: 'KliveTech Garage Door', address: '0A:1B:2C:3D:4E:09', state: 'unreachable', failedAttempts: 5, totalAttempts: 5,
        lastAttemptUtc: utc(600_000), lastError: 'no answer (it is off, out of range or not accepting connections)', lastErrorUtc: utc(600_000),
      }),
    ],
    nearby: empty || legacy ? [] as any[] : [
      { address: '0A:1B:2C:3D:4E:77', name: 'KliveTech Porch Light', firstSeenUtc: utc(300_000), lastSeenUtc: utc(5_000), sightings: 12, enrolling: false },
    ],
    streams: empty ? [] as any[] : [
      stream('lamp-1', lamp.name, 'temperature', 'number', { latestValue: 21.4 }),
      stream('lamp-1', lamp.name, 'doorOpen', 'boolean', { mode: 'onChange', intervalMs: 0, latestValue: false }),
      stream('lamp-1', lamp.name, 'camera', 'binary', { mode: 'manual', intervalMs: 0, enabled: false, latestBinaryBytes: 18_000 }),
      ...(legacy ? [] : [stream('plant-1', plant.name, 'moisture', 'integer', { intervalMs: 5000, latestValue: 412, droppedEvents: 3 })]),
    ],
    jobs: empty ? [] as any[] : [{
      jobID: 'job-old', kind: 'Compile', project: 'WorkshopLight', gadgetID: '', gadgetName: '', fqbn: 'esp32:esp32:esp32', partitionScheme: 'min_spiffs',
      state: 'Completed', progressPercent: 100, bytesTransferred: 0, totalBytes: 0, firmwareSha256: 'ab'.repeat(32), firmwareFileName: 'WorkshopLight.ino.bin',
      compilerOutput: 'Sketch uses 1032 bytes\nwarning: unused variable x\nDone.', error: '', createdUtc: utc(7_000_000), startedUtc: utc(7_000_000), completedUtc: utc(6_960_000),
    }],
    events: empty || legacy ? [] as any[] : [
      { seq: 49, atUtc: utc(30_000), kind: 'action', tone: 'ok', gadgetID: 'lamp-1', gadgetName: lamp.name, text: 'Set light → true (41 ms).', by: 'Klives' },
      { seq: 48, atUtc: utc(600_000), kind: 'connect-failed', tone: 'warn', gadgetID: '', gadgetName: '', text: 'KliveTech Garage Door did not connect after 5 attempts: no answer (it is off, out of range or not accepting connections)', by: '' },
      { seq: 47, atUtc: utc(7_200_000), kind: 'relay-refused', tone: 'crit', gadgetID: '', gadgetName: '', text: 'Old Hub was turned away: Its access token does not match KliveTechHubAccessToken.', by: '' },
      { seq: 46, atUtc: utc(7_200_000), kind: 'relay-connected', tone: 'ok', gadgetID: '', gadgetName: '', text: 'KliveTech Kitchen Hub connected.', by: '' },
    ],
  };

  const relayAttempts = empty || legacy ? [] : [
    { atUtc: utc(7_100_000), hubID: 'AABBCCDDEE01', hubName: 'KliveTech Kitchen Hub', outcome: 'connected', detail: '', endedUtc: null },
    { atUtc: utc(7_200_000), hubID: 'AABBCCDDEE99', hubName: 'Old Hub', outcome: 'refused', detail: 'Its access token does not match KliveTechHubAccessToken.', endedUtc: utc(7_200_000) },
  ];

  const projects = empty ? [] : [
    { name: 'PlantSensor', sketches: ['PlantSensor.ino'], valid: true, error: '' },
    { name: 'WorkshopLight', sketches: ['WorkshopLight.ino'], valid: true, error: '' },
    { name: 'broken', sketches: [], valid: false, error: 'The project has no .ino sketch.' },
  ];

  const record = (kind: string, tone: string, text: string, g: any = null, by = 'Klives Fixture') => {
    state.events.unshift({ seq: ++eventSeq, atUtc: utc(0), kind, tone, gadgetID: g?.gadgetID ?? '', gadgetName: g?.name ?? '', text, by });
  };

  const status = () => ({
    serverUtc: utc(0),
    startedUtc: utc(13 * 3_600_000),
    bluetooth: {
      available: true, scanning: true, intervalSeconds: 5, timeoutSeconds: 30, scans: 2_811, failures: 2, consecutiveFailures: 0,
      lastScanUtc: utc(8_000), lastScanMs: 10_240, lastDevicesSeen: 7, lastKliveTechSeen: state.nearby.length + 1,
      lastError: 'The Bluetooth scan did not finish within 30 s.', lastErrorUtc: utc(4 * 3_600_000),
    },
    enrolment: { allowNewDevices: false, setting: 'KliveTechAllowNewDevices', windowMinutes: 10, allowances: state.nearby.filter(d => d.enrolling).map(d => d.address) },
    remembered: state.remembered,
    nearby: state.nearby,
    relay: {
      endpoint: '/klivetech/hub/connect', tokenConfigured: true, connectedTotal: empty ? 0 : 3, refusedTotal: empty ? 0 : 1,
      hubs: empty ? [] : [{ hubID: 'AABBCCDDEE01', name: 'KliveTech Kitchen Hub', open: true, connectedSinceUtc: utc(7_100_000), lastMessageUtc: utc(3_000), gadgets: 1 }],
      attempts: relayAttempts,
    },
    firmware: {
      toolchain: empty
        ? { command: 'arduino-cli', found: false, version: '', error: "'arduino-cli' could not be started on this server. Install arduino-cli or set KliveTechArduinoCliPath to its full path.", checkedUtc: utc(1_000) }
        : { command: 'arduino-cli', found: true, version: 'arduino-cli  Version: 1.0.4 Commit: 1a2b3c4', error: '', checkedUtc: utc(1_000) },
      libraryConfigured: !empty, inboxProjects: projects.length, activeJobs: state.jobs.filter(j => !['Completed', 'Failed', 'Cancelled'].includes(j.state)).length, rememberedJobs: state.jobs.length,
    },
    streamables: {
      declared: state.streams.length, enabled: state.streams.filter(s => s.enabled).length, gadgets: new Set(state.streams.map(s => s.gadgetID)).size,
      droppedEvents: state.streams.reduce((n, s) => n + s.droppedEvents, 0), liveViewers: 1, maximumLiveViewers: 32,
      retainedSamples: 1_840, retainedSampleBytes: 210_000, retainedFrameBytes: 36_000,
    },
    events: state.events,
  });

  // Jobs move on by one step per read, so progress can be watched.
  const advanceJobs = () => {
    for (const job of state.jobs) {
      if (job.state === 'Compiling') { job.state = job.kind === 'Update' ? 'Uploading' : 'Completed'; job.progressPercent = job.kind === 'Update' ? 40 : 100; if (job.state === 'Completed') job.completedUtc = utc(0); }
      else if (job.state === 'Uploading') { job.progressPercent = Math.min(100, job.progressPercent + 30); job.bytesTransferred = Math.round(job.totalBytes * job.progressPercent / 100); if (job.progressPercent >= 100) { job.state = 'Completed'; job.completedUtc = utc(0); } }
    }
  };

  const mock: TechApiMock = { requestedPaths: [], directGets: [], batchCalls: [], posts: [], sockets: [], state };

  const getResponse = (pathWithQuery: string): { status: number; body: unknown } => {
    const url = new URL(pathWithQuery, 'https://klive.dev');
    switch (url.pathname) {
      case '/KMProfiles/me': return { status: 200, body: mePayload(options.permissions ? { rank: 1, permissions: options.permissions, name: 'Viewer Fixture' } : { rank: 5, userId: 'e2e-klives', name: 'Klives Fixture' }) };
      case '/KMProfiles/permissions/catalog': return { status: 200, body: catalogPayload(true) };
      // A connected gadget keeps talking (pings, heartbeats), so its last message is always recent.
      case '/klivetech/GetAllGadgets': return { status: 200, body: state.gadgets.map(g => ({ ...g, lastMessageReceived: g.isOnline ? utc(g.gadgetID === 'plant-1' ? 4_000 : 2_000) : g.lastMessageReceived, streamableCount: state.streams.filter(s => s.gadgetID === g.gadgetID).length })) };
      case '/klivetech/status': return legacy ? { status: 404, body: { error: 'Route not found.' } } : { status: 200, body: status() };
      case '/klivetech/streamables': {
        const id = url.searchParams.get('gadgetID');
        return { status: 200, body: id ? state.streams.filter(s => s.gadgetID === id) : state.streams };
      }
      case '/klivetech/streamables/history': {
        const id = url.searchParams.get('streamID');
        if (id !== 'temperature') return { status: 200, body: [] };
        // Sequences 91..120 (the catalog's latest), on the same curve the live samples continue.
        return { status: 200, body: Array.from({ length: 30 }, (_, i) => ({ gadgetID: 'lamp-1', streamID: 'temperature', sessionID: SESSION, sequence: 91 + i, deviceTimestampMs: (91 + i) * 1000, receivedUtc: utc((30 - i) * 250), value: 21 + Math.sin((91 + i) / 4) })) };
      }
      case '/klivetech/firmware/jobs': advanceJobs(); return { status: 200, body: state.jobs };
      case '/klivetech/firmware/config': return { status: 200, body: { inboxDirectory: 'D:\\Example\\SavedData\\KliveTechHub\\FirmwareInbox', buildsDirectory: 'D:\\Example\\SavedData\\KliveTechHub\\FirmwareBuilds', defaultFqbn: 'esp32:esp32:esp32', defaultPartitionScheme: 'min_spiffs', chunkSize: 2048, maximumFirmwareBytes: 8_388_608 } };
      case '/klivetech/firmware/projects': return { status: 200, body: projects };
      default: return { status: 200, body: { success: true } };
    }
  };

  // The live feed: a snapshot of the gadget's streams, then a temperature sample every 250 ms.
  await page.routeWebSocket(/wss:\/\/klive\.dev\/.*/, ws => {
    const url = new URL(ws.url());
    mock.sockets.push(`${url.pathname}?gadgetID=${url.searchParams.get('gadgetID')}`);
    if (url.pathname !== '/klivetech/streamables/live') return;
    const id = url.searchParams.get('gadgetID') ?? '';
    ws.send(JSON.stringify({ type: 'snapshot', streamables: state.streams.filter(s => s.gadgetID === id) }));
    let sequence = 120;
    const timer = setInterval(() => {
      sequence += 1;
      try {
        ws.send(JSON.stringify({ type: 'sample', gadgetID: id, streamID: 'temperature', sessionID: SESSION, sequence, deviceTimestampMs: sequence * 1000, receivedUtc: utc(0), value: 21 + Math.sin(sequence / 4) }));
      } catch { clearInterval(timer); }
    }, 250);
    ws.onClose(() => clearInterval(timer));
  });

  await page.route('https://klive.dev/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pathWithQuery = `${url.pathname}${url.search}`;
    if (request.method() === 'OPTIONS') { await fulfil(route, null, 204); return; }

    if (url.pathname === '/batch' && request.method() === 'POST') {
      const entries: Array<{ path?: string }> = JSON.parse(request.postData() ?? '[]');
      const paths = entries.map(entry => entry.path).filter((p): p is string => typeof p === 'string');
      mock.batchCalls.push(paths);
      mock.requestedPaths.push(...paths);
      await fulfil(route, paths.map(path => {
        const answer = getResponse(path);
        return { path, status: answer.status, ok: answer.status >= 200 && answer.status < 300, contentType: 'application/json', body: answer.body };
      }));
      return;
    }

    mock.requestedPaths.push(pathWithQuery);
    if (request.method() === 'GET') {
      mock.directGets.push(pathWithQuery);
      if (url.pathname === '/KMProfiles/LoginStatus') { await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/plain' }, body: 'SessionActive' }); return; }
      if (url.pathname === '/klivetech/streamables/latest') {
        await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/png', 'X-KliveTech-Sequence': '7', 'X-KliveTech-SHA256': 'cd'.repeat(32), 'X-KliveTech-Received-UTC': iso(0) }, body: PNG });
        return;
      }
      const answer = getResponse(pathWithQuery);
      await fulfil(route, answer.body, answer.status);
      return;
    }

    // ── writes ──
    let body: any = null;
    try { body = JSON.parse(request.postData() ?? 'null'); } catch { body = request.postData(); }
    const query = Object.fromEntries(url.searchParams.entries());
    mock.posts.push({ path: url.pathname, query, body });

    switch (url.pathname) {
      case '/klivetech/executegadgetaction': {
        const g = state.gadgets.find(x => x.gadgetID === query.gadgetID);
        if (!g) { await fulfil(route, { error: 'Gadget not found.' }, 404); return; }
        if (query.actionName === 'Reboot' && g.gadgetID === 'lamp-1' && query.actionParam === 'fail') { await fulfil(route, { error: 'The gadget timed out.' }, 504); return; }
        record('action', 'ok', `${query.actionName}${query.actionParam ? ` → ${query.actionParam}` : ''} (41 ms).`, g);
        await fulfil(route, { success: true, ms: 41 });
        return;
      }
      case '/klivetech/gadgets/reconnect': {
        const r = state.remembered.find(x => x.gadgetID === body?.gadgetID);
        if (!r) { await fulfil(route, { error: 'No remembered gadget has that ID.' }, 404); return; }
        r.state = 'connecting';
        record('retry', 'info', `Trying ${r.name} again.`, { gadgetID: r.gadgetID, name: r.name });
        await fulfil(route, { state: 'connecting' }, 202);
        return;
      }
      case '/klivetech/gadgets/enrol': {
        const d = state.nearby.find(x => x.address.replace(/:/g, '').toUpperCase() === String(body?.address ?? '').replace(/:/g, '').toUpperCase());
        if (!d) { await fulfil(route, { error: 'That device has not been seen nearby in the last 15 minutes.' }, 404); return; }
        d.enrolling = true;
        record('enrolled', 'info', `Enrolment allowed for ${d.name}; connecting.`);
        await fulfil(route, { state: 'connecting' }, 202);
        return;
      }
      case '/klivetech/gadgets/forget': {
        const r = state.remembered.find(x => x.gadgetID === body?.gadgetID);
        if (!r) { await fulfil(route, { error: 'No remembered gadget has that ID.' }, 404); return; }
        state.remembered = state.remembered.filter(x => x !== r);
        record('forgotten', 'info', `Forgot ${r.name}.`);
        await fulfil(route, { success: true, name: r.name });
        return;
      }
      case '/klivetech/streamables/control': {
        const s = state.streams.find(x => x.gadgetID === body?.gadgetID && x.streamID === body?.streamID);
        if (!s) { await fulfil(route, { error: 'Streamable not found.' }, 404); return; }
        s.enabled = !!body.enabled;
        if (typeof body.intervalMs === 'number') s.intervalMs = body.intervalMs;
        await fulfil(route, s);
        return;
      }
      case '/klivetech/firmware/compile':
      case '/klivetech/firmware/update': {
        const g = state.gadgets.find(x => x.gadgetID === body?.gadgetID);
        const job = {
          jobID: `job-${state.jobs.length + 1}`, kind: g ? 'Update' : 'Compile', project: body?.project ?? '', gadgetID: g?.gadgetID ?? '', gadgetName: g?.name ?? '',
          fqbn: body?.fqbn ?? 'esp32:esp32:esp32', partitionScheme: body?.partitionScheme ?? 'min_spiffs', state: 'Compiling', progressPercent: 0,
          bytesTransferred: 0, totalBytes: g ? 1_048_576 : 0, firmwareSha256: '', firmwareFileName: '', compilerOutput: 'Compiling sketch...\nerror: example failure line\n',
          error: '', createdUtc: utc(0), startedUtc: utc(0), completedUtc: null,
        };
        state.jobs.unshift(job);
        await fulfil(route, job, 202);
        return;
      }
      case '/klivetech/firmware/jobs/cancel': {
        const job = state.jobs.find(j => j.jobID === body?.jobID);
        if (job) { job.state = 'Cancelled'; job.completedUtc = utc(0); }
        await fulfil(route, { success: true, jobID: body?.jobID });
        return;
      }
      case '/KMProfiles/Login':
        await fulfil(route, { token: 'kms_e2e-klives', sessionId: 'session-e2e', expiresUtc: '2027-01-01T00:00:00Z', me: mePayload({ rank: 5, name: 'Klives Fixture' }) });
        return;
      default:
        await fulfil(route, { success: true });
    }
  });

  return mock;
}

export async function openTech(page: Page, options: TechMockOptions & { path?: string } = {}): Promise<TechApiMock> {
  const api = await installTechApiMock(page, options);
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: techTestOrigin }]);
  await page.addInitScript(() => { window.localStorage.setItem('vnavCollapsed', '0'); });
  // Windows dev-server runs sometimes stall a navigation (ERR_NO_BUFFER_SPACE): load again.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(options.path ?? '/klivetech', { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.getByTestId('ktx-root').waitFor({ state: 'visible', timeout: 15_000 });
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(3_000 * (attempt + 1));
    }
  }
  return api;
}
