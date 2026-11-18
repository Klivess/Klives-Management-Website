import type { Page, Route } from '@playwright/test';
import { catalogPayload, mePayload } from './permissions';

/**
 * A stateful stand-in for the routes behind the Omniscience console. Payloads have the shapes the
 * server's code writes (OmniscienceRoutes, WorkspaceRoutes, ReplicaRoutes: snake_case rows, unix
 * milliseconds); every person, message and fact is invented. Writes change the state, so a test can
 * pin, merge or decide something and watch the page agree.
 */

export interface OmniscienceMockOptions {
  /** 'warming': the briefing preview answers 503, as it does while the snapshot is being built. */
  briefing?: 'ok' | 'warming';
  /** One linked source reports that it is not collecting. */
  sourceDown?: boolean;
}

export interface OmniscienceApiMock {
  /** Every path asked for, directly or inside a /batch. */
  requestedPaths: string[];
  directGets: string[];
  batchCalls: string[][];
  posts: Array<{ path: string; search: string; body: any }>;
  people: any[];
  facts: any[];
}

export const omniscienceTestOrigin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`,
).origin;

const T0 = Date.UTC(2026, 10, 14, 12, 0, 0);
const DAY = 86_400_000;

async function fulfilJson(route: Route, payload: unknown, status = 200) {
  await route.fulfill({
    status,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page',
      'access-control-expose-headers': 'RequestDeniedCode',
      'content-type': 'application/json; charset=utf-8',
    },
    body: status === 204 ? '' : typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

const person = (id: string, name: string, tier: string, messages: number, over: Record<string, unknown> = {}) => ({
  person_id: id, display_name: name, tier, created_at: T0 - 400 * DAY, updated_at: T0 - DAY, message_count: messages,
  first_message_at: T0 - 380 * DAY, last_message_at: T0 - 3_600_000, handles: `discord:${id}`,
  identities: [{ platform: 'discord', username: id, display_name: name }], profile_targeted: tier === 'tracked', pinned: false, completeness: tier === 'tracked' ? 0.82 : null, ...over,
});

export async function installOmniscienceApiMock(page: Page, options: OmniscienceMockOptions = {}): Promise<OmniscienceApiMock> {
  const people = [
    person('ada', 'Ada Example', 'tracked', 5210, { pinned: true }),
    person('bo', 'Bo Example', 'tracked', 3120, { completeness: 0.41 }),
    person('cy', 'Cy Example', 'watch', 640),
    person('dee', 'Dee Example', 'archive', 88),
    person('dee2', 'Dee E.', 'archive', 12, { handles: 'whatsapp:dee', identities: [{ platform: 'whatsapp', username: 'dee', display_name: 'Dee E.' }] }),
  ];
  const facts = [
    { fact_id: 'f1', category: 'location', fact: 'Lives in Leeds', confidence: 0.93, status: 'active', source_context: 'dm', extracted_by: 'deduction', evidence_message_ids: ['m1', 'm2'] },
    { fact_id: 'f2', category: 'employment', fact: 'Works at the library', confidence: 0.71, status: 'active', source_context: 'guild', extracted_by: 'deduction', evidence_message_ids: ['m3'] },
    { fact_id: 'f3', category: 'location', fact: 'Lives in Bristol', confidence: 0.6, status: 'superseded', source_context: 'dm', extracted_by: 'deduction', evidence_message_ids: [] },
  ];
  const state: OmniscienceApiMock = { requestedPaths: [], directGets: [], batchCalls: [], posts: [], people, facts };

  let pins = ['ada'];
  let suggestions = [{ person_id: 'cy', display_name: 'Cy Example', reasons: ['talks to you weekly', '640 messages'] }];
  let links = [{ suggestion_id: 'l1', person_id_a: 'dee', person_id_b: 'dee2', display_a: 'Dee Example', display_b: 'Dee E.', score: 0.86, reason: 'same avatar, overlapping friends' }];
  let merges = [{ suggestion_id: 'g1', entity_a: 'the library', entity_b: 'Leeds Library', kind: 'org', owner_display: 'Ada Example', reason: 'used interchangeably' }];
  let watchlists = [{ watch_id: 'w1', label: 'My name', terms: 'klives, klive', notify: true, person_display: null }];
  let notifications = [{ notif_id: 'n1', kind: 'replica_ready', person_id: 'ada', payload: { display_name: 'Ada Example' }, created_at: T0 - 7_200_000 }];
  let queries = [{ query_id: 'q1', name: 'Ada in March', query: { q: 'trip', personId: 'ada', contextKind: 'all', platform: 'all' }, use_count: 2, created_at: T0 - 9 * DAY }];
  let history = [{ history_id: 1, query_text: 'trip', scope: { q: 'trip', personId: 'ada' }, created_at: T0 - DAY }];
  let notes = [{ note_id: 'note1', person_id: 'ada', content: 'Ask about the Leeds move', tags: 'follow-up', created_at: T0 - 2 * DAY, updated_at: T0 - 2 * DAY }];
  const sources = [
    { source_id: 's1', platform: 'discord', label: 'Main', self_username: 'klives', status: 'active', last_event_at: T0 - 60_000, last_status_message: null },
    ...(options.sourceDown ? [{ source_id: 's2', platform: 'discord', label: 'Alt', self_username: 'klives-alt', status: 'error', last_event_at: T0 - 5 * DAY, last_status_message: 'token rejected' }] : []),
  ];
  const conversations = [
    { conversation_id: 'c1', platform: 'discord', kind: 'dm', guild_name: null, title: 'Ada Example', first_seen: T0 - 300 * DAY, last_seen: T0 - 3_600_000, message_count: 4100 },
    { conversation_id: 'c2', platform: 'discord', kind: 'guild_channel', guild_name: 'Climbers', title: 'general', first_seen: T0 - 200 * DAY, last_seen: T0 - 7_200_000, message_count: 9200 },
  ];
  const messages = [
    { message_id: 'm1', conversation_id: 'c1', sent_at: T0 - 3_600_000, content: 'the move to Leeds is finally done', conversation_title: 'Ada Example', conversation_kind: 'dm', guild_name: null },
    { message_id: 'm2', conversation_id: 'c1', sent_at: T0 - 2 * DAY, content: 'packing boxes all week', conversation_title: 'Ada Example', conversation_kind: 'dm', guild_name: null },
    { message_id: 'm3', conversation_id: 'c2', sent_at: T0 - 5 * DAY, content: 'back at the library tomorrow', conversation_title: 'general', conversation_kind: 'guild_channel', guild_name: 'Climbers' },
  ];
  const cited = messages.map(m => ({ ...m, author_display: 'Ada Example', author_person_id: 'ada', score: 0.88, channel_title: m.conversation_title, context_kind: m.conversation_kind, platform: 'discord' }));

  const byId = (id: string | null) => people.find(p => p.person_id === id);
  const overview = () => ({ persons: 45_969, identities: 51_200, conversations: 3_410, messages: 5_712_340, attachments: 88_100, sources: sources.length, personality_profiles: 14, tracked: people.filter(p => p.tier === 'tracked').length, facts_active: 1_284, relationships: 312, radar_alerts_24h: 3 });
  const pinRows = () => pins.map(id => byId(id)).filter(Boolean).map((p: any, i) => ({ person_id: p.person_id, display_name: p.display_name, tier: p.tier, pinned_at: T0, sort_order: i, message_count: p.message_count, last_message_at: p.last_message_at }));
  const dossier = (p: any) => ({
    ...p, notes: null, alt_names: [],
    identities: p.identities.map((i: any, n: number) => ({ identity_id: `${p.person_id}-i${n}`, platform: i.platform, platform_username: i.username, display_name: i.display_name })),
    analytics: {
      mood_trajectory: { payload: { current_mood_flag: 'normal', daily_series: Array.from({ length: 30 }, (_, i) => ({ avg_sentiment: Math.sin(i / 3) })) } },
      activity_pattern: { payload: { hour_histogram: Array.from({ length: 24 }, (_, h) => (h > 8 ? h * 3 : 0)) } },
      chronotype: { payload: { chronotype: 'night owl', estimated_sleep_start_local_hour: 2, estimated_sleep_end_local_hour: 10 } },
    },
    personality_profile: p.person_id === 'ada' ? { generated_at: T0 - 3 * DAY, narrative_markdown: '## Who she is\n\nAda is **direct** and plans ahead.\n\n- Climbs twice a week\n- Moved to Leeds in spring', biographical_markdown: 'Grew up in Bristol.', traits: { big_five_estimate: { openness: 0.8, conscientiousness: 0.7, extraversion: 0.4, agreeableness: 0.6, neuroticism: 0.3 } } } : null,
  });

  const getResponse = (pathWithQuery: string): { status: number; body: unknown } => {
    const url = new URL(pathWithQuery, 'https://klive.dev');
    const q = url.searchParams;
    const ok = (body: unknown) => ({ status: 200, body });
    switch (url.pathname) {
      case '/KMProfiles/me': return ok(mePayload({ rank: 5, userId: 'e2e-klives', name: 'Klives Fixture' }));
      case '/KMProfiles/permissions/catalog': return ok(catalogPayload(true));
      case '/omniscience/workspace/bootstrap': return ok({ workspace_version: '2.0', overview: overview(), pins: pinRows(), queries, history, unread_notifications: notifications.length, review_pending: links.length, activity_counts: { ready: true, running: false, completed_at: T0 - 3_600_000 } });
      case '/omniscience/stats/overview': return ok(overview());
      case '/omniscience/deduction/status': return ok({ facts_active: 1_284, qa_pairs: 9_420, name_usages: 310, entities: 640, open_hypotheses: 7, windows_extracted: 5_100, windows_pending_graph: 260, stimulus_reply_pairs: 21_000, tracked_persons: 2, relationships: 312, last_extraction_summary: 'Read 40 windows, kept 12 facts.' });
      case '/omniscience/schedule/status': return ok({ running: false, last_run_started_at: new Date(T0 - 6 * 3_600_000).toISOString(), last_run_finished_at: new Date(T0 - 5 * 3_600_000).toISOString(), last_run_status: 'completed', current_job: null });
      case '/omniscience/radar/alerts': return ok({ alerts: [{ author_display: 'Bo Example', channel_label: 'Climbers · #general', snippet: 'has anyone seen klives today', occurred_at: T0 - 1_800_000, matched_alias: 'klives' }], aliases_watched: ['klives', 'klive'] });
      case '/omniscience/targets/suggestions': return ok({ suggestions });
      case '/omniscience/notifications': return ok(notifications);
      case '/omniscience/identity-links': return ok({ links });
      case '/omniscience/review/queue': return ok({ merge_suggestions: merges });
      case '/omniscience/watchlists': return ok({ watchlists });
      case '/omniscience/sources': return ok(sources);
      case '/omniscience/briefing/preview': return options.briefing === 'warming' ? { status: 503, body: { error: 'warming', pending: true } } : ok({ markdown: '# Today\n\n**3 mentions** of your name.\n\n- Ada moved to Leeds\n- Bo is quiet this week' });
      case '/omniscience/workspace/health': return ok({ status: options.sourceDown ? 'attention' : 'healthy', warnings: options.sourceDown ? ['1 source has not sent an event for 5 days.'] : [], checked_at: T0, metrics: { persons: 45_969, messages: 5_712_340, tracked_messages: 8_330, tracked_embedded: 8_100, tracked_embedding_coverage_pct: 97.2, tracked_embedding_counting: false, stimulus_reply_pairs: 21_000, replicas_ready: 2, replica_eras: 5, failed_replica_jobs_7d: 0, latest_message_at: T0 - 60_000 }, activity_counts: { ready: true, running: false }, sources });
      case '/omniscience/workspace/directory': {
        const search = (q.get('search') ?? '').toLowerCase();
        const tier = q.get('tier') ?? 'all';
        let items = people.map(p => ({ ...p, pinned: pins.includes(p.person_id) }))
          .filter(p => (!search || p.display_name.toLowerCase().includes(search) || p.handles.includes(search)) && (tier === 'all' || p.tier === tier) && (q.get('pinned') !== '1' || p.pinned));
        if (q.get('sort') === 'name') items = items.sort((a, b) => a.display_name.localeCompare(b.display_name));
        return ok({ items, total: items.length, limit: Number(q.get('limit') ?? 50), offset: 0, has_more: false, activity_counts: { ready: true, running: false } });
      }
      case '/omniscience/workspace/search': {
        const text = (q.get('q') ?? '').toLowerCase();
        const hits = people.filter(p => p.display_name.toLowerCase().includes(text)).map(p => ({ kind: 'person', item_id: p.person_id, person_id: p.person_id, title: p.display_name, subtitle: `${p.tier} · ${p.message_count} messages` }));
        return ok({ query: q.get('q'), results: [...hits, ...(text.includes('leeds') ? [{ kind: 'fact', item_id: 'f1', person_id: 'ada', title: 'Lives in Leeds', subtitle: 'Ada Example · location' }] : [])], count: hits.length });
      }
      case '/omniscience/workspace/compare': return ok({ left: { ...byId(q.get('left')), facts: 3, relationships: 2, eras: 1 }, right: { ...byId(q.get('right')), facts: 0, relationships: 0, eras: 0 }, shared_conversations: [{ conversation_id: 'c2', title: 'general', context_kind: 'guild_channel' }], shared_conversation_count: 1, relationship_links: [], message_ratio: '7:1' });
      case '/omniscience/workspace/graph': return ok({ person_id: q.get('personId'), depth: Number(q.get('depth') ?? 1), nodes: [{ id: q.get('personId'), kind: 'person', label: byId(q.get('personId'))?.display_name, root: true, message_count: 5210, tier: 'tracked' }, { id: 'bo', kind: 'person', label: 'Bo Example', root: false, message_count: 3120, tier: 'tracked' }], edges: [{ source: q.get('personId'), target: 'bo', rel_type: 'friend', confidence: 0.8, evidence_count: 12 }] });
      case '/omniscience/workspace/activity': return ok({ person_id: q.get('personId'), days: Number(q.get('days') ?? 90), daily: Array.from({ length: 14 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, count: (i * 7) % 23 })), hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, count: hour > 9 ? hour : 0 })), top_conversations: [{ conversation_id: 'c1', title: 'Ada Example', context_kind: 'dm', count: 410 }], current_messages: 520, previous_messages: 480, trend_pct: 8.3, active_days: 12, average_per_active_day: 43 });
      case '/omniscience/workspace/timeline': return ok({ person_id: q.get('personId'), events: [{ type: 'fact', event_id: 'f1', at: T0 - 10 * DAY, title: 'location', content: 'Lives in Leeds', source: 'dm', evidence: ['m1'], metadata: {} }], count: 1 });
      case '/omniscience/workspace/notes': return ok({ notes: notes.filter(n => n.person_id === q.get('personId')) });
      case '/omniscience/workspace/export/person': return ok({ filename: 'ada.json', mime: 'application/json', content: '{"person_id":"ada"}' });
      case '/omniscience/persons/get': { const p = byId(q.get('personId')); return p ? ok(dossier(p)) : { status: 404, body: 'not found' }; }
      case '/omniscience/persons/facts': return ok({ facts: q.get('personId') === 'ada' ? facts : [] });
      case '/omniscience/persons/relationships': return ok({ relationships: q.get('personId') === 'ada' ? [{ related_person_id: 'bo', related_display: 'Bo Example', rel_type: 'friend', confidence: 0.8 }] : [], entities: [{ name: 'Leeds Library', kind: 'org', mentions: 14, descriptor: 'workplace' }] });
      case '/omniscience/persons/aliases': return ok({ aliases: [{ name: 'Ads', kind: 'nickname', uses: 14, distinct_speakers: 4, confidence: 0.8 }] });
      case '/omniscience/persons/open-questions': return ok({ open_questions: [{ slot: 'birthday', question: 'When is their birthday?' }], hypotheses: [{ statement: 'May be looking for a new flat', status: 'open', evidence_message_ids: ['m2'] }], completeness: { completeness_score: 0.82 } });
      case '/omniscience/persons/changelog': return ok({ changelogs: [] });
      case '/omniscience/persons/bigfive-series': return ok({ series: [] });
      case '/omniscience/persons/era-profiles': return ok({ eras: [] });
      case '/omniscience/persons/messages': return ok(q.get('personId') === 'ada' ? messages.slice(Number(q.get('offset') ?? 0)) : []);
      case '/omniscience/conversations': return ok(conversations.filter(c => !q.get('kind') || c.kind === q.get('kind')));
      case '/omniscience/conversations/messages': return ok(messages.filter(m => m.conversation_id === q.get('conversationId')).map(m => ({ message_id: m.message_id, sent_at: m.sent_at, content: m.content, author_identity_id: 'ada-i0', author_username: 'ada', author_display_name: 'Ada Example', author_person_id: 'ada' })));
      case '/omniscience/search/semantic': return ok({ results: cited });
      case '/omniscience/replica/fidelity': return ok({ runs: [] });
      case '/omniscience/replica/status': return ok({ person_id: q.get('personId'), status: 'ready', version: 2, built_at: T0 - 9 * DAY, model_used: 'fixture', messages_embedded: 3, prompt_token_estimate: 100, has_dossier: true, target_enabled: true });
      case '/omniscience/replica/eras': return ok({ eras: [], low_coverage: false, is_simulation: true });
      case '/omniscience/replica/chats': return ok([]);
      default: return ok({ ok: true });
    }
  };

  await page.routeWebSocket('wss://klive.dev/**', () => {});

  await page.route('https://klive.dev/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pathWithQuery = `${url.pathname}${url.search}`;
    if (request.method() === 'OPTIONS') { await fulfilJson(route, null, 204); return; }

    if (url.pathname === '/batch' && request.method() === 'POST') {
      const entries: Array<{ path?: string }> = JSON.parse(request.postData() ?? '[]');
      const paths = entries.map(entry => entry.path).filter((p): p is string => typeof p === 'string');
      state.batchCalls.push(paths);
      state.requestedPaths.push(...paths);
      await fulfilJson(route, paths.map(path => {
        const answer = getResponse(path);
        return { path, status: answer.status, ok: answer.status >= 200 && answer.status < 300, contentType: 'application/json', body: answer.body };
      }));
      return;
    }

    state.requestedPaths.push(pathWithQuery);
    if (request.method() === 'GET') {
      state.directGets.push(pathWithQuery);
      if (url.pathname === '/KMProfiles/LoginStatus') {
        await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' }, body: 'SessionActive' });
        return;
      }
      const answer = getResponse(pathWithQuery);
      await fulfilJson(route, answer.body, answer.status);
      return;
    }

    // ── writes ──
    let body: any = null;
    try { body = JSON.parse(request.postData() ?? 'null'); } catch { body = request.postData(); }
    state.posts.push({ path: url.pathname, search: url.search, body });
    const q = url.searchParams;
    switch (url.pathname) {
      case '/omniscience/workspace/pins/set':
        pins = body.pinned ? [...new Set([...pins, body.personId])] : pins.filter(id => id !== body.personId);
        await fulfilJson(route, { ok: true, pins: pinRows() }); return;
      case '/omniscience/persons/tier-set': { const p = byId(body.personId); if (p) p.tier = body.tier; await fulfilJson(route, { ok: true }); return; }
      case '/omniscience/persons/profile-targets/set': { const p = byId(q.get('personId')); if (p) p.profile_targeted = q.get('enabled') !== 'false'; await fulfilJson(route, { ok: true, person_id: q.get('personId'), enabled: q.get('enabled') !== 'false' }); return; }
      case '/omniscience/persons/merge': {
        const at = people.findIndex(p => p.person_id === body.merge_person_id);
        if (at >= 0) people.splice(at, 1);
        await fulfilJson(route, { ok: true }); return;
      }
      case '/omniscience/persons/observe': facts.unshift({ fact_id: `f-new-${facts.length}`, category: body.category, fact: body.observation, confidence: 1, status: 'active', source_context: 'you', extracted_by: 'manual', evidence_message_ids: [] }); await fulfilJson(route, { ok: true }); return;
      case '/omniscience/persons/recompute': await fulfilJson(route, { ok: true, accepted: true, run_id: 'r1', message: 'Recompute started for 1 person' }); return;
      case '/omniscience/persons/ask': await fulfilJson(route, { answer: 'Ada **moved to Leeds** this spring [1].', citations: cited.slice(0, 2) }); return;
      case '/omniscience/targets/dismiss': suggestions = suggestions.filter(s => s.person_id !== body.personId); await fulfilJson(route, { ok: true }); return;
      case '/omniscience/identity-links/resolve': links = links.filter(l => l.suggestion_id !== body.suggestionId); await fulfilJson(route, { ok: true }); return;
      case '/omniscience/review/resolve': merges = merges.filter(m => m.suggestion_id !== body.suggestionId); await fulfilJson(route, { ok: true }); return;
      case '/omniscience/watchlists/add': watchlists = [...watchlists, { watch_id: `w${watchlists.length + 1}`, label: body.label, terms: body.terms, notify: !!body.notify, person_display: null }]; await fulfilJson(route, { ok: true }); return;
      case '/omniscience/watchlists/remove': watchlists = watchlists.filter(w => w.watch_id !== body.watchId); await fulfilJson(route, { ok: true }); return;
      case '/omniscience/notifications/dismiss': notifications = notifications.filter(n => n.notif_id !== body.notifId); await fulfilJson(route, { ok: true }); return;
      case '/omniscience/workspace/search': await fulfilJson(route, { items: cited.filter(m => !body?.q || m.content.includes(body.q)), has_more: false, limit: 50, offset: 0, filters: body }); return;
      case '/omniscience/workspace/history': history = [{ history_id: history.length + 1, query_text: body.queryText, scope: body.scope, created_at: T0 }, ...history]; await fulfilJson(route, { ok: true, history }); return;
      case '/omniscience/workspace/history/clear': history = []; await fulfilJson(route, { ok: true }); return;
      case '/omniscience/workspace/queries/save': queries = [{ query_id: `q${queries.length + 1}`, name: body.name, query: body.query, use_count: 0, created_at: T0 }, ...queries]; await fulfilJson(route, { ok: true, queries }); return;
      case '/omniscience/workspace/queries/delete': queries = queries.filter(x => x.query_id !== body.queryId); await fulfilJson(route, { ok: true, queries }); return;
      case '/omniscience/workspace/notes/save': notes = [{ note_id: `note${notes.length + 1}`, person_id: body.personId, content: body.content, tags: body.tags, created_at: T0, updated_at: T0 }, ...notes]; await fulfilJson(route, { ok: true }); return;
      case '/omniscience/workspace/notes/delete': notes = notes.filter(n => n.note_id !== body.noteId); await fulfilJson(route, { ok: true }); return;
      default: await fulfilJson(route, { ok: true });
    }
  });

  return state;
}

export async function openOmniscience(page: Page, options: OmniscienceMockOptions & { path?: string } = {}): Promise<OmniscienceApiMock> {
  const api = await installOmniscienceApiMock(page, options);
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: omniscienceTestOrigin }]);
  await page.addInitScript(() => { window.localStorage.setItem('vnavCollapsed', '0'); });
  // Windows dev-server runs sometimes stall a navigation (ERR_NO_BUFFER_SPACE, or a module never answered): load again.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(options.path ?? '/omniscience', { waitUntil: 'commit', timeout: 20_000 });
      await page.getByTestId('omx').waitFor({ state: 'visible', timeout: 35_000 });
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(3_000 * (attempt + 1));
    }
  }
  return api;
}
