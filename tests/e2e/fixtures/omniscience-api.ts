import type { Page } from '@playwright/test';
import { dashboardTestOrigin, installDashboardApiMock } from './dashboard-api';

const overview = { persons: 2, identities: 2, conversations: 1, messages: 4, attachments: 0, sources: 0, personality_profiles: 1, tracked: 2, facts_active: 1, relationships: 1, radar_alerts_24h: 1 };
const people = [
  { person_id: 'p1', display_name: 'Alice Example', tier: 'tracked', message_count: 3, handles: 'discord:alice', identities: [{ platform: 'discord', username: 'alice' }], completeness: .82, pinned: true, last_message_at: 1_800_000_000_000 },
  { person_id: 'p2', display_name: 'Bob Example', tier: 'watch', message_count: 1, handles: 'discord:bob', identities: [{ platform: 'discord', username: 'bob' }], completeness: .41, pinned: false, last_message_at: 1_799_000_000_000 },
];
const alice = {
  person_id: 'p1', display_name: 'Alice Example', tier: 'tracked', notes: null, created_at: 1_700_000_000_000, updated_at: 1_800_000_000_000,
  identities: [{ identity_id: 'i1', platform: 'discord', platform_username: 'alice', display_name: 'Alice Example' }], profile_targeted: true,
  analytics: {}, personality_profile: null, alt_names: [], message_count: 3,
};
const style = { sample_size: 120, average_length: 42, median_length: 31, average_words: 8, lowercase_start_rate: .8, terminal_period_rate: .1, question_rate: .2, exclamation_rate: .1, emoji_rate: .25, caps_rate: .02, multiline_rate: .1, dominant_laugh: 'lol', signature_tokens: ['alpha', 'yeah'], common_emojis: ['😂'], active_hour_utc: 20, context_kind: 'auto', context_fallback: false };

export async function installOmniscienceApiMock(page: Page) {
  const base = await installDashboardApiMock(page, 'Klives');
  const state = {
    queries: [{ query_id: 'q1', name: 'Alpha investigation', query: { q: 'alpha', personId: 'p1' }, use_count: 2, created_at: 1_800_000_000_000, updated_at: 1_800_000_000_000, last_used_at: null }],
    history: [{ history_id: 1, query_text: 'alpha', scope: { q: 'alpha', personId: 'p1' }, created_at: 1_800_000_000_000 }],
    chats: [] as any[],
    messages: [] as any[],
  };
  const pins = [{ person_id: 'p1', display_name: 'Alice Example', pinned_at: 1_800_000_000_000, sort_order: 0, message_count: 3, last_message_at: 1_800_000_000_000 }];
  const bootstrap = () => ({ workspace_version: '2.0', overview, pins, queries: state.queries, history: state.history, unread_notifications: 0, review_pending: 0, activity_counts: { ready: true, running: false, completed_at: 1_800_000_000_000 }, generated_at: 1_800_000_000_000 });
  const messages = [
    { message_id: 'm1', sent_at: 1_800_000_000_000, content: 'alpha one', conversation_id: 'c1', conversation_title: 'Private chat', context_kind: 'dm', guild_name: null, person_id: 'p1', author_display: 'Alice Example', platform: 'discord' },
    { message_id: 'm2', sent_at: 1_799_999_999_000, content: 'alpha two', conversation_id: 'c1', conversation_title: 'Private chat', context_kind: 'dm', guild_name: null, person_id: 'p1', author_display: 'Alice Example', platform: 'discord' },
  ];

  await page.route('https://klive.dev/omniscience/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = request.postData() ? JSON.parse(request.postData()!) : {};
    const json = async (payload: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });

    switch (path) {
      case '/omniscience/stats/overview': return json(overview);
      case '/omniscience/deduction/status': return json({ facts_active: 1, qa_pairs: 2, name_usages: 3, entities: 1, open_hypotheses: 0, windows_extracted: 4, windows_pending_graph: 0, stimulus_reply_pairs: 2, last_extraction_summary: 'Fixture extraction complete.' });
      case '/omniscience/schedule/status': return json({ running: false });
      case '/omniscience/radar/alerts': return json({ alerts: [{ author_display: 'Bob Example', channel_label: 'general', snippet: 'Alice was mentioned', occurred_at: 1_800_000_000_000, matched_alias: 'Alice' }], aliases_watched: ['Alice'] });
      case '/omniscience/targets/suggestions': return json({ suggestions: [] });
      case '/omniscience/sources': return json([]);
      case '/omniscience/briefing/preview': return json({ markdown: 'Fixture briefing: evidence coverage is healthy.' });
      case '/omniscience/notifications': return json([]);
      case '/omniscience/workspace/bootstrap': return json(bootstrap());
      case '/omniscience/workspace/directory': {
        const query = (url.searchParams.get('search') || '').toLowerCase();
        const pinned = url.searchParams.get('pinned') === '1';
        const items = people.filter(person => (!query || person.display_name.toLowerCase().includes(query) || person.handles.includes(query)) && (!pinned || person.pinned));
        return json({ items, total: items.length, limit: 48, offset: 0, has_more: false, activity_counts: { ready: true, running: false } });
      }
      case '/omniscience/workspace/search': {
        if (method === 'POST') return json({ items: messages, has_more: false, limit: 50, offset: 0, filters: body });
        return json({ query: url.searchParams.get('q'), results: [
          { kind: 'person', item_id: 'p1', person_id: 'p1', title: 'Alice Example', subtitle: 'tracked · 3 messages', url: '/omniscience-person?personId=p1' },
          { kind: 'fact', item_id: 'f1', person_id: 'p1', title: 'Lives in Leeds', subtitle: 'Alice Example · location', at: 1_800_000_000_000, evidence: ['m1'], url: '/omniscience-person?personId=p1&tab=Knowledge' },
        ], count: 2 });
      }
      case '/omniscience/workspace/search/export': return json({ filename: 'messages.csv', mime: 'text/csv', content: 'message_id,content\nm1,alpha one' });
      case '/omniscience/workspace/queries': return json({ queries: state.queries });
      case '/omniscience/workspace/queries/save': {
        state.queries.unshift({ query_id: 'q-new', name: body.name, query: body.query, use_count: 0, created_at: 1_800_000_000_000, updated_at: 1_800_000_000_000, last_used_at: null });
        return json({ ok: true, query_id: 'q-new', queries: state.queries });
      }
      case '/omniscience/workspace/queries/delete': state.queries = state.queries.filter(query => query.query_id !== body.queryId); return json({ ok: true, queries: state.queries });
      case '/omniscience/workspace/queries/use': return json({ ok: true });
      case '/omniscience/workspace/history': return method === 'POST' ? json({ ok: true, history: state.history }) : json({ history: state.history });
      case '/omniscience/workspace/history/clear': state.history = []; return json({ ok: true });
      case '/omniscience/workspace/pins/set': return json({ ok: true, pins });
      case '/omniscience/workspace/notes': return json({ notes: [{ note_id: 'n1', person_id: 'p1', content: 'Alpha lead', tags: 'investigation', created_at: 1_800_000_000_000, updated_at: 1_800_000_000_000 }] });
      case '/omniscience/workspace/notes/save': return json({ ok: true, note_id: 'n-new' });
      case '/omniscience/workspace/notes/delete': return json({ ok: true });
      case '/omniscience/workspace/timeline': return json({ person_id: 'p1', events: [
        { type: 'message', event_id: 'm1', at: 1_800_000_000_000, title: 'Message', content: 'alpha one', source: 'Private chat', person_id: 'p1', evidence: [], metadata: { conversation_id: 'c1', context_kind: 'dm' } },
        { type: 'fact', event_id: 'f1', at: 1_799_000_000_000, title: 'location', content: 'Lives in Leeds', source: 'dm', person_id: 'p1', evidence: ['m1'], metadata: {} },
        { type: 'identity', event_id: 'h1', at: 1_798_000_000_000, title: 'Identity · display_name', content: '∅ → Alice Example', source: 'discord', person_id: 'p1', evidence: [], metadata: {} },
      ], count: 3 });
      case '/omniscience/workspace/activity': return json({ person_id: 'p1', days: 90, daily: [{ day: '2026-08-10', count: 2 }, { day: '2026-08-11', count: 1 }], hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, count: hour === 20 ? 3 : 0 })), top_conversations: [{ conversation_id: 'c1', title: 'Private chat', context_kind: 'dm', count: 3 }], current_messages: 3, previous_messages: 1, trend_pct: 200, active_days: 2, average_per_active_day: 1.5 });
      case '/omniscience/workspace/compare': return json({ left: people[0], right: people[1], shared_conversations: [{ conversation_id: 'c1', title: 'Private chat', context_kind: 'dm' }], shared_conversation_count: 1, relationship_links: [], message_ratio: 3 });
      case '/omniscience/workspace/graph': return json({ person_id: 'p1', depth: 1, nodes: [{ id: 'p1', kind: 'person', label: 'Alice Example', root: true, message_count: 3, tier: 'tracked' }, { id: 'p2', kind: 'person', label: 'Bob Example', root: false, message_count: 1, tier: 'watch' }], edges: [{ rel_id: 1, source: 'p1', target: 'p2', rel_type: 'friend', confidence: .85, evidence_count: 3, status: 'active' }] });
      case '/omniscience/workspace/health': return json({ status: 'healthy', warnings: [], metrics: { persons: 2, messages: 4, tracked_messages: 3, tracked_embedded: 3, tracked_embedding_coverage_pct: 100, stimulus_reply_pairs: 2, replica_eras: 2, replicas_ready: 1, failed_replica_jobs_7d: 0, saved_queries: 1, operator_notes: 1, latest_message_at: 1_800_000_000_000 }, sources: [], activity_counts: { ready: true, running: false }, checked_at: 1_800_000_000_000 });
      case '/omniscience/workspace/export/person': return json({ filename: 'alice.json', mime: 'application/json', content: JSON.stringify(alice) });
      case '/omniscience/persons/get': return json(alice);
      case '/omniscience/persons/facts': return json({ facts: [{ fact_id: 'f1', category: 'location', fact: 'Lives in Leeds', confidence: .9, status: 'active', source_context: 'dm', extracted_by: 'manual', evidence_message_ids: ['m1'] }] });
      case '/omniscience/persons/relationships': return json({ relationships: [], entities: [] });
      case '/omniscience/persons/aliases': return json({ aliases: [] });
      case '/omniscience/persons/open-questions': return json({ open_questions: [], hypotheses: [], completeness: { completeness_score: .82 } });
      case '/omniscience/persons/changelog': return json({ changelogs: [] });
      case '/omniscience/persons/bigfive-series': return json({ series: [] });
      case '/omniscience/persons/era-profiles': return json({ eras: [] });
      case '/omniscience/replica/fidelity': return json({ runs: [] });
      case '/omniscience/replica/status': return json({ person_id: 'p1', status: 'ready', version: 2, built_at: 1_800_000_000_000, model_used: 'fixture', messages_embedded: 3, prompt_token_estimate: 100, has_dossier: true, target_messages: 3, embedded_messages: 3, stimulus_reply_pairs: 2, embedded_stimuli: 2, active_facts: 1, era_count: 2, latest_message_at: 1_800_000_000_000, is_stale: false, coverage_warnings: [], pipeline_version: 'temporal-v2', is_simulation: true });
      case '/omniscience/replica/eras': return json({ eras: [
        { era: '2023', start_at: 1_672_531_200_000, end_at: 1_704_403_199_999, first_message_at: 1_680_000_000_000, last_message_at: 1_690_000_000_000, message_count: 1, style: { ...style, median_length: 55, lowercase_start_rate: .3 } },
        { era: '2022', start_at: 1_640_995_200_000, end_at: 1_672_531_199_999, first_message_at: 1_650_000_000_000, last_message_at: 1_660_000_000_000, message_count: 2, style },
      ], low_coverage: false, is_simulation: true });
      case '/omniscience/replica/chats': return json(state.chats);
      case '/omniscience/replica/chats/new': {
        const chat = { chat_id: 1, person_id: 'p1', title: null, created_at: 1_800_000_000_000, updated_at: 1_800_000_000_000, archived: false, as_of_at: body.asOfAt, context_kind: body.contextKind || 'auto', is_simulation: true };
        state.chats = [chat];
        return json({ ok: true, chat_id: 1, as_of_at: chat.as_of_at, context_kind: chat.context_kind, is_simulation: true });
      }
      case '/omniscience/replica/chats/settings': state.chats[0] = { ...state.chats[0], as_of_at: body.asOfAt, context_kind: body.contextKind }; return json({ ok: true });
      case '/omniscience/replica/chats/rename': state.chats[0].title = body.title; return json({ ok: true });
      case '/omniscience/replica/chats/delete': state.chats = []; state.messages = []; return json({ ok: true });
      case '/omniscience/replica/chats/messages': return json(state.messages);
      case '/omniscience/replica/chats/send': {
        state.messages = [
          { message_id: 1, role: 'user', content: body.message, sent_at: 1_800_000_000_000, as_of_at: body.asOfAt, context_kind: body.contextKind },
          { message_id: 2, role: 'assistant', content: 'Temporal fixture reply', sent_at: 1_800_000_000_001, latency_ms: 42, used_self_critique: false, model_used: 'fixture', as_of_at: body.asOfAt, context_kind: body.contextKind, evidence_count: 1, style, generation_version: 'temporal-v2', is_simulation: true },
        ];
        return json({ ok: true, message_id: 2, draft: 'Temporal fixture reply', polished: null, used_self_critique: false, draft_latency_ms: 42, polish_latency_ms: 0, model_used: 'fixture', as_of_at: body.asOfAt, era: '2022', context_kind: body.contextKind, style, evidence_count: 1, low_coverage: false, prompt_token_estimate: 100, generation_version: 'temporal-v2', is_simulation: true });
      }
      case '/omniscience/replica/evidence': return json({ message_id: 2, evidence: [{ message_id: 'm1', conversation_id: 'c1', sent_at: 1_650_000_000_000, stimulus: 'historical stimulus', reply: 'historical reply', score: .9, match_kind: 'stimulus_reply', context_kind: 'dm' }], label: 'Historical evidence consulted', is_simulation: true });
      case '/omniscience/replica/feedback': return method === 'POST' ? json({ ok: true, feedback_id: 'fb1' }) : json({ total: 0, positive: 0, negative: 0, neutral: 0, items: [] });
      case '/omniscience/replica/compare': return json({ ok: true, left: { draft: 'Earlier answer', era: '2022', evidence_count: 1, generation_version: 'temporal-v2', style }, right: { draft: 'Later answer', era: '2023', evidence_count: 1, generation_version: 'temporal-v2', style: { ...style, median_length: 55, lowercase_start_rate: .3 } }, is_simulation: true });
      default: return json({ ok: true });
    }
  });
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: dashboardTestOrigin }]);
  return { base, state };
}
