import type {
    AlertDto, AnalysisOffPersonDto, BackupDto, CommunitiesDto, DigestDto, DigestSubscriptionDto, DossierDto, ForgetPreviewDto, ForgetRunDto, HealthListDto,
    InboxItemDto, LinkDto, LinkShareDto, LinkTrackDto, LookupLabelsDto, LookupOptionDto, LookupPageDto, MonitorEventDto, MonitorRuleDto, NoticeDto, PairDetailDto, PeopleMapDto, PersonBriefDto, PersonCardDto, PersonLinksDto,
    PersonRelationshipsDto, ReadModelDto, RetentionDto, SimilarPeopleDto, SpaceCardDto, SpacePageDto, TopicStatusDto, TranslateStatusDto, WatchRuleDto,
    WellbeingSuggestionDto,
} from '../../../scripts/omniscience/contracts';

/**
 * The people, signals, digests, community, link, data-control and health routes of the v3 API
 * (the WS-C contract), mocked with synthetic people only. Typed against the generated contract
 * like the engine fixture, so a DTO change breaks this file at compile time.
 */

const NOW = Date.UTC(2026, 6, 1, 12, 0, 0);
const DAY = 86_400_000;
const HOUR = 3_600_000;

const card = (personId: string, displayName: string, over: Partial<PersonCardDto> = {}): PersonCardDto => ({
    personId, displayName, isSelf: false, tier: 'tracked', pinned: false, ageBand: 'Adult', platforms: ['discord'], firstSeenMs: NOW - 400 * DAY,
    lastSeenMs: NOW - 2 * HOUR, msgs: 1000, msgs30: 120, msgs90: 300, topGuild: 'Synthetic Server', sentiment90: { positive: 40, neutral: 50, negative: 10 }, ...over,
});

export const PEOPLE: PersonCardDto[] = [
    card('person-self', 'You (synthetic)', { isSelf: true, pinned: true, msgs: 9000, msgs30: 800 }),
    card('person-a', 'Synthetic Ada', { platforms: ['discord', 'whatsapp'], msgs: 4210, msgs30: 312, pinned: true }),
    card('person-b', 'Synthetic Bo', { tier: 'watch', msgs: 820, msgs30: 40, lastSeenMs: NOW - 3 * DAY }),
    card('person-c', 'Synthetic Cy', { tier: 'archive', msgs: 75, msgs30: 0, lastSeenMs: NOW - 200 * DAY, sentiment90: null, topGuild: null }),
    card('person-d', 'Synthetic Dee', { tier: 'watch', ageBand: 'Minor', msgs: 300, msgs30: 25 }),
    card('person-e', 'Synthetic Eli', { msgs: 510, msgs30: 12 }),
];

function dossier(c: PersonCardDto): DossierDto {
    const restricted = c.ageBand === 'Minor' || c.ageBand === 'LikelyMinor';
    return {
        personId: c.personId, displayName: c.displayName, isSelf: c.isSelf, tier: c.tier, pinned: c.pinned, ageBand: c.ageBand, restricted,
        names: [{ kind: 'display', value: c.displayName, platform: 'discord', fromMs: NOW - 400 * DAY, toMs: null }],
        identities: [{ identityId: `discord:${c.personId}`, platform: 'discord', kind: 'user', firstSeenMs: NOW - 400 * DAY, lastSeenMs: NOW - 2 * HOUR }],
        activity: {
            firstMs: c.firstSeenMs, lastMs: c.lastSeenMs, msgs: c.msgs, msgs30: c.msgs30, msgs90: c.msgs90, msgs365: c.msgs, activeDays: 140, activeDays30: 18, perActiveDay: 7.1,
            deleted: 3, edited: 12, replies: 400, attachments: 30, links: 44, dmShare: 0.35, reactionsGiven: 220, mentionsMade: 60,
        },
        series: Array.from({ length: 30 }, (_, i) => ({ day: `2026-06-${String(i + 1).padStart(2, '0')}`, msgs: (i * 7) % 23, authored: (i * 7) % 23 })),
        hours: restricted ? null : Array.from({ length: 24 }, (_, h) => (h >= 9 && h <= 23 ? 10 + ((h * 5) % 17) : 1)),
        weekdays: restricted ? null : [30, 40, 42, 38, 44, 60, 55],
        zone: restricted ? null : { zone: 'Europe/London', offsetMinutes: 60, confidence: 0.9, method: 'activity', month: '2026-06', alternatives: [] },
        zoneHistory: null,
        labels: { recent: { sentiment: { positive: 40, neutral: 50, negative: 10 } }, baseline: { sentiment: { positive: 35, neutral: 55, negative: 10 } }, recentAnswered: { sentiment: 100 }, labelset: 2 },
        languages: [{ id: 'en', name: 'English', count: 980 }],
        conversations: [{ id: 'conv-general', name: '#general', count: 600 }, { id: 'conv-dm-a', name: 'Direct chat', count: 250 }],
        guilds: [{ id: 'guild-1', name: 'Synthetic Server', count: 700 }],
        partners: c.personId === 'person-a' ? [{
            personId: 'person-b', name: 'Synthetic Bo', repliesOut: 120, repliesIn: 98, mentionsOut: 10, mentionsIn: 12, dmOut: 40, dmIn: 35, reactionsOut: 20, reactionsIn: 18,
            activeDays: 60, reciprocity: 0.82, medianReplyBucketOut: 3, medianReplyBucketIn: 4,
        }] : [],
        facts: restricted ? [] : [{ assertionId: 'as-1', attribute: 'hobby', value: 'rock climbing', status: 'accepted', probability: 0.92, validFromEarliestMs: null, validFromLatestMs: null,
            validToEarliestMs: null, validToLatestMs: null, assertedAtMs: NOW - 20 * DAY, recordedAtMs: NOW - 19 * DAY, modality: 'stated', sourceKind: 'live' }],
        coverage: { platforms: c.platforms, conversations: 2, guilds: 1, firstMs: c.firstSeenMs, lastMs: c.lastSeenMs },
        today: '2026-07-01', newestEvidenceMs: c.lastSeenMs ?? NOW, staleEvidence: c.personId === 'person-c', analysisOff: c.personId === 'person-e',
    };
}

const link = (urlId: string, over: Partial<LinkDto> = {}): LinkDto => ({
    urlId, url: `https://www.youtube.com/watch?v=${urlId}`, host: 'www.youtube.com', site: 'youtube', provider: 'youtube', kind: 'video', sensitive: false,
    title: `Synthetic video ${urlId}`, author: 'Synthetic Channel', description: null, metaSource: 'oembed', metaAtMs: NOW - DAY, topic: 'music', summary: null,
    shares: 3, sharers: 2, firstSharedMs: NOW - 10 * DAY, lastSharedMs: NOW - DAY, ...over,
});
const share = (messageId: string, l: LinkDto, personId = 'person-a', name = 'Synthetic Ada', atMs = NOW - DAY): LinkShareDto => ({
    messageId, personId, personName: name, conversationId: 'conv-general', conversationTitle: '#general', guildId: 'guild-1', atMs, reactions: 4, link: l,
});
const SHARES: LinkShareDto[] = [
    share('m-101', link('vid001')),
    share('m-102', link('vid001'), 'person-b', 'Synthetic Bo', NOW - 2 * DAY),
    share('m-103', link('repo1', { url: 'https://github.com/synthetic/repo', host: 'github.com', site: 'github', provider: 'github', kind: 'code', title: 'synthetic/repo', topic: 'tech' })),
    share('m-104', link('inv1', { url: 'https://discord.gg/synthetic', host: 'discord.gg', site: 'discord', provider: 'discord', kind: 'invite', sensitive: true, title: null, topic: null, metaSource: null })),
];

const alert = (alertId: string, over: Partial<AlertDto> = {}): AlertDto => ({
    alertId, kind: 'radar', ruleId: null, ruleName: null, reason: 'mentioned', messageId: `m-${alertId}`, conversationId: 'conv-general', conversationTitle: '#general', guildId: 'guild-1',
    platform: 'discord', personId: 'person-a', personName: 'Synthetic Ada', occurredAtMs: NOW - HOUR, lastHitMs: NOW - HOUR, hitCount: 1,
    hits: [{ messageId: `m-${alertId}`, conversationId: 'conv-general', atMs: NOW - HOUR, reason: 'mentioned', probability: 0.91, personId: 'person-a', excerpt: 'synthetic: has anyone asked you about the trip?', deleted: false }],
    probability: 0.91, state: 'new', delivery: 'pushed', sourceDeletedAtMs: null, createdAtMs: NOW - HOUR, verdict: null, ...over,
});

const notice = (noticeId: string, kind: string, data: unknown, over: Partial<NoticeDto> = {}): NoticeDto => ({
    noticeId, kind, moduleId: 'monitors', severity: 'Attention', personId: null, personName: null, otherPersonId: null, otherPersonName: null, guildId: null, conversationId: null,
    occurredAtMs: NOW - 2 * HOUR, data, state: 'new', delivery: 'digest', createdAtMs: NOW - 2 * HOUR, ...over,
});

const digest = (digestId: string, over: Partial<DigestDto> = {}): DigestDto => ({
    digestId, scopeKind: 'all', scopeId: null, scopeTitle: null, fromMs: NOW - DAY, toMs: NOW - HOUR, state: 'done', trigger: 'daily', messages: 420, messagesRead: 400,
    conversations: 6, people: 18, nothingNew: false,
    overall: [{ text: 'Synthetic: plans for the weekend were the main topic.', refs: ['m-1', 'm-2'] }],
    sections: [{
        kind: 'guild', id: 'guild-1', title: 'Synthetic Server', messages: 300, people: 12, lastMessageMs: NOW - 2 * HOUR,
        points: [{ text: 'Synthetic: a tournament was organised for Saturday.', refs: ['m-3'] }],
        children: [{ kind: 'conversation', id: 'conv-general', title: '#general', messages: 200, people: 10, lastMessageMs: NOW - 2 * HOUR, points: [{ text: 'Synthetic: teams were picked.', refs: ['m-4'] }], children: [] }],
    }],
    notable: ['Synthetic Ada asked for you twice.'], newFacts: [{ assertionId: 'as-9', personId: 'person-a', personName: 'Synthetic Ada', attribute: 'city', value: 'Synthetic Town', recordedAtMs: NOW - 3 * HOUR }],
    error: null, llmCalls: 4, createdAtMs: NOW - HOUR, finishedAtMs: NOW - HOUR + 60_000, ...over,
});

const SPACE: SpacePageDto = {
    scopeKind: 'guild', scopeId: 'guild-1', title: 'Synthetic Server', platform: 'discord', windowDays: 30, fromDay: '2026-06-01', toDay: '2026-06-30', asOfMs: NOW - HOUR,
    messages: 3000, previousMessages: 2400, people: 40, previousPeople: 38,
    days: Array.from({ length: 30 }, (_, i) => ({ day: `2026-06-${String(i + 1).padStart(2, '0')}`, messages: 60 + ((i * 13) % 50), people: 10 + (i % 7) })),
    core: [{ personId: 'person-a', name: 'Synthetic Ada', messages: 600, share: 0.2, activeDays: 28, devotion: 0.7 }, { personId: 'person-b', name: 'Synthetic Bo', messages: 400, share: 0.13, activeDays: 20, devotion: 0.5 }],
    rising: [{ personId: 'person-e', name: 'Synthetic Eli', recent: 120, earlier: 5, isNew: true, everywhere: false, firstDay: '2026-06-12' }],
    tone: { recent: { positive: 30, neutral: 60, negative: 10 }, baseline: { positive: 28, neutral: 62, negative: 10 }, recentAnswered: 100, baselineAnswered: 100, conflictRecent: 0.04, conflictBaseline: 0.03 },
    aboutKlives: { messages: 25, previousMessages: 10, kinds: { mentioned: 20, indirect: 5 }, sentiment: { positive: 15, neutral: 8, negative: 2 }, sentimentAnswered: 25, people: [{ personId: 'person-a', name: 'Synthetic Ada', messages: 12 }] },
    events: [{ day: '2026-06-20', kind: 'surge', value: 160, baseline: 80, text: 'Twice the usual messages (a tournament).' }],
    factions: [{ factionId: 'f1', size: 12, weight: 0.6, members: [{ personId: 'person-a', name: 'Synthetic Ada', strength: 0.9 }] }], factionModularity: 0.31,
    channels: [{ conversationId: 'conv-general', title: '#general', messages: 2000, people: 35 }],
    coverage: { channelsKnown: 12, channelsWithMessages: 9, channelsActive: 6, channelsFullyBackfilled: 8, firstMessageMs: NOW - 400 * DAY, lastMessageMs: NOW - HOUR, note: '9 of 12 channels have messages; 8 are fully backfilled.' },
    peopleLeftOut: 1, latestDigestId: 'dg-1',
};

export function domainState() {
    return {
        brief: null as PersonBriefDto | null,
        alerts: [
            alert('a1'),
            alert('a2', { kind: 'watch', ruleId: 'w1', ruleName: 'Trip plans', reason: 'watch', personId: 'person-b', personName: 'Synthetic Bo' }),
            alert('a3', { state: 'seen', verdict: 'Correct' }),
        ] as AlertDto[],
        inbox: [{
            itemId: 'i1', kind: 'question', messageId: 'm-i1', conversationId: 'conv-dm-a', conversationKind: 'dm', conversationTitle: 'Direct chat', guildId: null, platform: 'discord',
            personId: 'person-a', personName: 'Synthetic Ada', sentAtMs: NOW - 5 * HOUR, waitingMs: 5 * HOUR, state: 'open', reason: 'question', probability: 0.88, snoozedUntilMs: null,
            live: true, excerpt: 'synthetic: are you coming on Saturday?', strength: 0.8, rank: 1,
        }] as InboxItemDto[],
        notices: [
            notice('n1', 'person_activity', { trigger: 'returned', ruleId: 'mw1', ruleName: 'Old friends', gapDays: 41 }, { personId: 'person-c', personName: 'Synthetic Cy' }),
            notice('n2', 'topic_surge', { ruleName: 'tournament', count: 64, usualDay: 4.5, z: 6.1 }, { severity: 'Info', state: 'seen' }),
            notice('n3', 'data_health', { issue: 'source_stalled', subject: 'src-wa', detail: { label: 'Synthetic WhatsApp', silentHours: 14.2, usualPerDay: 120 } }, { severity: 'Urgent' }),
        ] as NoticeDto[],
        watches: [{
            watchId: 'w1', name: 'Trip plans', definition: { text: 'someone making plans that include me', persons: null, conversations: null, guilds: ['guild-1'] }, enabled: true,
            state: 'active', reason: null, threshold: 0.7, checked: 5000, matched: 12, lastMatchMs: NOW - HOUR, createdAtMs: NOW - 30 * DAY, updatedAtMs: NOW - 3 * DAY,
        }] as WatchRuleDto[],
        wellbeing: [{
            suggestionId: 'wb1', personId: 'person-b', personName: 'Synthetic Bo', kind: 'withdrawn', week: '2026-W26', state: 'new', data: { drop: 0.7 },
            resourceText: 'A short, low-pressure message is usually welcome.', createdAtMs: NOW - DAY,
        }] as WellbeingSuggestionDto[],
        digests: [digest('dg-1'), digest('dg-0', { fromMs: NOW - 2 * DAY, toMs: NOW - DAY, nothingNew: true, sections: [], overall: [], notable: [], newFacts: [], messages: 0, messagesRead: 0 })] as DigestDto[],
        itemReads: 0,
        subscriptions: [{ subscriptionId: 'ds1', name: 'Server weekly', scopeKind: 'guild', scopeId: 'guild-1', cadence: 'weekly', at: '09:00', weekday: 0, enabled: true, lastRunMs: NOW - 4 * DAY, createdAtMs: NOW - 40 * DAY }] as DigestSubscriptionDto[],
        analysisOff: [{ personId: 'person-e', name: 'Synthetic Eli', sinceMs: NOW - 5 * DAY }] as AnalysisOffPersonDto[],
        forgetRuns: new Map<string, ForgetRunDto>(),
        forgetReads: 0,
        backups: [{
            backupId: 'bk-1', createdAtMs: NOW - DAY, trigger: 'nightly', keyId: 'key-1',
            files: [{ store: 'corpus', file: 'corpus.db.enc', plainBytes: 6_000_000_000, encryptedBytes: 6_000_100_000, sha256: 'ab'.repeat(32) },
                { store: 'intel', file: 'intel.db.enc', plainBytes: 800_000_000, encryptedBytes: 800_010_000, sha256: 'cd'.repeat(32) }],
        }] as BackupDto[],
        monitorRules: [
            { watchId: 'mw1', kind: 'person_activity', name: 'Old friends', enabled: true, definition: { persons: ['person-c'], absenceDays: 30, guilds: [] }, createdAtMs: NOW - 20 * DAY, updatedAtMs: NOW - 20 * DAY, fired30d: 1, lastFiredMs: NOW - 2 * HOUR },
            { watchId: 'mw2', kind: 'topic_surge', name: 'tournament', enabled: true, definition: { conceptId: null, phrase: 'tournament', guilds: ['guild-1'], conversations: [], minCount: 10, factor: 3 }, createdAtMs: NOW - 9 * DAY, updatedAtMs: NOW - 9 * DAY, fired30d: 2, lastFiredMs: NOW - 2 * HOUR },
        ] as MonitorRuleDto[],
    };
}
export type DomainState = ReturnType<typeof domainState>;

type Reply = (body: unknown, status?: number) => Promise<void>;
type Fail = (status: number, code: string, message: string) => Promise<void>;
type Text = (body: string, contentType: string) => Promise<void>;

const lower = (value: string | null) => (value ?? '').toLowerCase();
/** A comma-separated list parameter, as the shared filters send them (`persons=a,b`). */
const list = (p: URLSearchParams, name: string) => (p.get(name) ?? '').split(',').map(s => s.trim()).filter(Boolean);
/** True when nothing is asked for, or the value is one of those asked for. */
const among = (asked: string[], value: string | null | undefined) => !asked.length || (!!value && asked.includes(value));

/** What the filter pickers offer: servers and conversations by name, as the lookup routes answer. */
const option = (id: string, label: string, over: Partial<LookupOptionDto> = {}): LookupOptionDto => ({ id, label, detail: null, platform: 'discord', kind: null, groupId: null, groupLabel: null, count: null, lastMs: NOW - HOUR, ...over });
export const LOOKUP_GUILDS: LookupOptionDto[] = [
    option('guild-1', 'Synthetic Server', { detail: 'Discord', kind: 'server', count: 12 }),
    option('guild-2', 'Second synthetic server', { detail: 'Discord', kind: 'server', count: 3, lastMs: NOW - 40 * DAY }),
];
export const LOOKUP_CONVERSATIONS: LookupOptionDto[] = [
    option('conv-general', 'general', { detail: 'Synthetic Server', kind: 'server', groupId: 'guild-1', groupLabel: 'Synthetic Server' }),
    option('conv-lobby', 'lobby', { detail: 'Second synthetic server', kind: 'server', groupId: 'guild-2', groupLabel: 'Second synthetic server', lastMs: NOW - 40 * DAY }),
    option('conv-dm-a', 'Synthetic Ada', { detail: 'Direct chat', kind: 'dm', lastMs: NOW - 2 * HOUR }),
    option('conv-group', 'The synthetic group', { detail: 'Group chat', kind: 'group', lastMs: NOW - 3 * DAY }),
];
const page = (items: LookupOptionDto[], limit: number): LookupPageDto => ({ items: items.slice(0, limit), truncated: items.length > limit });

/** Answers one domain route; false when the route is not one of these. */
export async function handleDomain(key: string, p: URLSearchParams, body: any, d: DomainState, json: Reply, fail: Fail, can: (k: string) => boolean, text: Text): Promise<boolean> {
    const person = (id: string | null) => PEOPLE.find(x => x.personId === id);
    switch (key) {
        // ── people ─────────────────────────────────────────────────────
        case 'GET people': {
            const q = lower(p.get('q'));
            const tiers = [...list(p, 'tiers'), ...list(p, 'tier')], platforms = list(p, 'platforms');
            // Who has written in a server or conversation: in this mock, everyone but Cy has written in the first server and its channel.
            const there = [...list(p, 'guilds'), ...list(p, 'conversations')];
            const wroteThere = (x: PersonCardDto) => !there.length || (there.some(id => id === 'guild-1' || id === 'conv-general') && x.personId !== 'person-c');
            const min = Number(p.get('minMessages') ?? 0);
            let items = PEOPLE.filter(x => (!q || x.displayName.toLowerCase().includes(q)) && among(tiers, x.tier) && (!platforms.length || platforms.some(pl => x.platforms.includes(pl)))
                && wroteThere(x) && x.msgs >= min);
            if (p.get('sort') === 'Recent') items = [...items].sort((a, b) => b.msgs30 - a.msgs30);
            await json({ items: items.slice(0, Number(p.get('limit') ?? 100)), nextCursor: null, asOfMs: NOW - 60_000 }); return true;
        }

        // ── what the filter pickers offer ──────────────────────────────
        case 'GET lookup/guilds': {
            const q = lower(p.get('q')), ids = list(p, 'ids');
            await json(page(LOOKUP_GUILDS.filter(g => among(ids, g.id) && (!q || g.label.toLowerCase().includes(q) || g.id === q)), Number(p.get('limit') ?? 30))); return true;
        }
        case 'GET lookup/conversations': {
            const q = lower(p.get('q')), ids = list(p, 'ids'), guilds = list(p, 'guilds'), places = list(p, 'places');
            await json(page(LOOKUP_CONVERSATIONS.filter(c => among(ids, c.id) && among(guilds, c.groupId) && among(places, c.kind)
                && (!q || c.label.toLowerCase().includes(q) || c.id === q)), Number(p.get('limit') ?? 30))); return true;
        }
        case 'GET lookup/platforms':
            await json(page([option('discord', 'Discord', { count: 14, lastMs: null }), option('whatsapp', 'Whatsapp', { platform: 'whatsapp', count: 2, lastMs: null })], 30)); return true;
        case 'GET lookup/sites': {
            const q = lower(p.get('q'));
            const sites = [...new Set(SHARES.map(s => s.link.site))].filter(s => !q || s.includes(q));
            await json(page(sites.map(s => option(s, s, { platform: null, count: SHARES.filter(x => x.link.site === s).length, lastMs: null })), Number(p.get('limit') ?? 30))); return true;
        }
        case 'GET lookup/labels': {
            const named = (ids: string[], name: (id: string) => string | null | undefined) => Object.fromEntries(ids.map(id => [id, name(id)]).filter(([, n]) => !!n)) as Record<string, string>;
            const conversation = (id: string) => { const c = LOOKUP_CONVERSATIONS.find(x => x.id === id); return c ? (c.kind === 'server' ? `${c.label} · ${c.groupLabel}` : c.label) : null; };
            const dto: LookupLabelsDto = {
                persons: named(list(p, 'persons'), id => person(id)?.displayName), guilds: named(list(p, 'guilds'), id => LOOKUP_GUILDS.find(g => g.id === id)?.label),
                conversations: named(list(p, 'conversations'), conversation),
            };
            await json(dto); return true;
        }
        case 'GET rm': {
            const c = person(p.get('key'));
            if (p.get('model') !== 'person.dossier' || !c) { await fail(404, 'not_built', 'This read model has not been built for this key yet.'); return true; }
            const rm: ReadModelDto = { model: 'person.dossier', key: c.personId, version: 7, schemaVersion: 2, asOfMs: NOW - 60_000, sourceSeq: 48_000, computedAtMs: NOW - 60_000, body: dossier(c) };
            await json(rm); return true;
        }
        case 'GET briefs/person':
            if (d.brief && d.brief.personId === p.get('personId')) await json(d.brief);
            else await fail(404, 'not_found', 'No brief has been written for this person yet.');
            return true;
        case 'POST briefs/person': {
            const c = person(body.personId);
            if (!c) { await fail(404, 'not_found', 'No such person.'); return true; }
            d.brief = {
                personId: c.personId, name: c.displayName, state: 'done', asOfMs: NOW, newestEvidenceMs: NOW - 2 * HOUR, stale: false, messages30d: c.msgs30, messagesPrevious30d: 280,
                activeDays30d: 18, messagesRead: 200, messagesInWindow: c.msgs30,
                sections: [{ key: 'lately', title: 'Lately', points: [{ text: 'Synthetic: has been planning a climbing trip.', refs: ['m-7', 'm-8'] }] }],
                mood: null, style: null, facts: [], openThreads: [], error: null, llmCalls: 2, requestedAtMs: NOW, finishedAtMs: NOW + 30_000,
            };
            await json(d.brief, 202); return true;
        }
        case 'GET insights/pair': {
            // Like the server: only a pair with enough interactions is tracked; anything else is a 404 that says so.
            const pair = [p.get('a'), p.get('b')].sort().join('|');
            if (pair !== 'person-a|person-b') { await fail(404, 'not_found', 'These two have too few interactions to be tracked as a relationship.'); return true; }
            const detail: PairDetailDto = {
                summary: { a: 'person-a', aName: 'Synthetic Ada', b: 'person-b', bName: 'Synthetic Bo', interactions: 300, recent: 40, closeness: 0.62, previousCloseness: 0.5, reciprocity: 0.8, tension: 0.05,
                    trend: 'closer', firstWeek: '2025-W30', lastWeek: '2026-W26' },
                weeks: [{ week: '2026-W24', fromA: 12, fromB: 9, conflict: 0, negative: 1, positive: 6, answered: 15, closeness: 0.58 }, { week: '2026-W25', fromA: 18, fromB: 14, conflict: 0, negative: 0, positive: 9, answered: 24, closeness: 0.6 },
                    { week: '2026-W26', fromA: 10, fromB: 16, conflict: 1, negative: 2, positive: 7, answered: 20, closeness: 0.62 }],
                events: [{ eventId: 'pe-1', a: 'person-a', b: 'person-b', kind: 'grew_closer', week: '2026-W25', atMs: NOW - 7 * DAY, data: null }],
                medianReplySecondsFromA: 95, medianReplySecondsFromB: 240, asOfMs: NOW - HOUR,
            };
            await json(detail); return true;
        }
        case 'GET insights/person': {
            const rel: PersonRelationshipsDto = {
                personId: p.get('personId') ?? '', name: person(p.get('personId'))?.displayName ?? null, communityId: 'c1', bridgeTo: null, outsideShare: 0.1, asOfMs: NOW - HOUR, events: [],
                relationships: p.get('personId') === 'person-a' ? [{ a: 'person-a', aName: 'Synthetic Ada', b: 'person-b', bName: 'Synthetic Bo', interactions: 300, recent: 40, closeness: 0.62, previousCloseness: 0.5, reciprocity: 0.8, tension: 0.05, trend: 'closer', firstWeek: '2025-W30', lastWeek: '2026-W26' }] : [],
            };
            await json(rel); return true;
        }
        case 'GET insights/similar': {
            const c = person(p.get('personId'));
            if (c?.ageBand === 'Minor') { await fail(422, 'refused', 'Similar people are never worked out for someone who is, or may be, under 18.'); return true; }
            const sim: SimilarPeopleDto = {
                personId: c?.personId ?? '', name: c?.displayName ?? null, messages: c?.msgs ?? 0, asOfMs: NOW - DAY, note: null,
                traits: [{ trait: 'topic:gaming', text: 'talks about games', z: 2.1 }],
                people: [{ personId: 'person-b', name: 'Synthetic Bo', similarity: 0.74, content: 0.8, tone: 0.6, style: 0.7, rhythm: 0.5, shared: [{ trait: 'topic:gaming', text: 'talks about games', mine: 2.1, theirs: 1.8 }], sharedPlaces: ['Synthetic Server'], messages: 820, communityId: 'c1' }],
            };
            await json(sim); return true;
        }
        case 'GET links/person': {
            const recent = SHARES.filter(s => s.personId === p.get('personId'));
            const dto: PersonLinksDto = {
                personId: p.get('personId') ?? '', name: person(p.get('personId'))?.displayName ?? null, days: Number(p.get('days') ?? 90), shares: recent.length, links: recent.length,
                kinds: [{ key: 'video', label: null, shares: 1 }, { key: 'code', label: null, shares: 1 }], providers: [], sites: [], topics: [], recent,
            };
            await json(dto); return true;
        }

        // ── signals ────────────────────────────────────────────────────
        case 'GET signals/alerts': {
            const items = d.alerts.filter(a => (!p.get('state') || a.state === lower(p.get('state'))) && (!p.get('kind') || a.kind === p.get('kind'))
                && among(list(p, 'persons'), a.personId) && among(list(p, 'guilds'), a.guildId) && among(list(p, 'conversations'), a.conversationId));
            await json({ items, nextCursor: null, unseen: d.alerts.filter(a => a.state === 'new').length }); return true;
        }
        case 'POST signals/alerts/state': {
            const target = d.alerts.filter(a => (body.all ? (!body.kind || a.kind === body.kind) && a.state === 'new' : (body.alertIds ?? []).includes(a.alertId)));
            for (const a of target) a.state = lower(body.state);
            await json({ changed: target.length, unseen: d.alerts.filter(a => a.state === 'new').length }); return true;
        }
        case 'POST signals/alerts/feedback': {
            const a = d.alerts.find(x => x.alertId === body.alertId);
            if (!a) { await fail(404, 'not_found', 'No such alert.'); return true; }
            a.verdict = body.verdict;
            a.state = body.verdict === 'Correct' ? 'seen' : 'dismissed';
            await json({ feedback: { alertId: a.alertId, kind: a.kind, reason: a.reason, messageId: a.messageId, verdict: body.verdict }, classifierCorrected: a.kind === 'radar' }); return true;
        }
        case 'GET signals/notices': {
            const items = d.notices.filter(n => (!p.get('state') || n.state === lower(p.get('state'))) && (!p.get('kind') || n.kind === p.get('kind'))
                && among(list(p, 'persons'), n.personId) && among(list(p, 'guilds'), n.guildId));
            await json({ items, nextCursor: null, unseen: d.notices.filter(n => n.state === 'new').length }); return true;
        }
        case 'POST signals/notices/state': {
            const target = d.notices.filter(n => (body.all ? n.state === 'new' : (body.noticeIds ?? []).includes(n.noticeId)));
            for (const n of target) n.state = lower(body.state);
            await json({ changed: target.length, unseen: d.notices.filter(n => n.state === 'new').length }); return true;
        }
        case 'GET signals/watchlists': await json({ rules: d.watches }); return true;
        case 'POST signals/watchlists/save': {
            if (!can('omniscience.alerts.manage')) { await fail(403, 'forbidden', 'Needs alerts.manage.'); return true; }
            const existing = d.watches.find(w => w.watchId === body.watchId);
            const saved: WatchRuleDto = {
                watchId: existing?.watchId ?? `w${d.watches.length + 1}`, name: body.name, definition: { text: body.text, persons: body.persons, conversations: body.conversations, guilds: body.guilds },
                enabled: body.enabled, state: 'checking', reason: null, threshold: null, checked: 0, matched: 0, lastMatchMs: null, createdAtMs: existing?.createdAtMs ?? NOW, updatedAtMs: NOW,
            };
            d.watches = [...d.watches.filter(w => w.watchId !== saved.watchId), saved];
            await json(saved); return true;
        }
        case 'POST signals/watchlists/enabled': {
            const w = d.watches.find(x => x.watchId === body.watchId);
            if (!w) { await fail(404, 'not_found', 'No such watch rule.'); return true; }
            w.enabled = body.enabled;
            await json(w); return true;
        }
        case 'POST signals/watchlists/delete':
            d.watches = d.watches.filter(w => w.watchId !== body.watchId);
            await json({ watchId: body.watchId, deleted: true }); return true;
        case 'GET signals/inbox': {
            const state = p.get('state') ?? 'open';
            await json({ items: d.inbox.filter(i => i.state === state), open: d.inbox.filter(i => i.state === 'open').length, asOfMs: NOW }); return true;
        }
        case 'POST signals/inbox/resolve': {
            const target = d.inbox.filter(i => (body.itemIds ?? []).includes(i.itemId));
            for (const i of target) {
                i.state = body.action === 'Snooze' ? 'snoozed' : body.action === 'Dismiss' ? 'dismissed' : 'open';
                i.snoozedUntilMs = body.action === 'Snooze' ? body.untilMs : null;
            }
            await json({ changed: target.length, open: d.inbox.filter(i => i.state === 'open').length }); return true;
        }
        case 'GET insights/wellbeing': await json({ suggestions: d.wellbeing, enabled: true, asOfMs: NOW }); return true;
        case 'POST insights/wellbeing/state': {
            const s = d.wellbeing.find(x => x.suggestionId === body.suggestionId);
            if (!s) { await fail(404, 'not_found', 'No such suggestion.'); return true; }
            s.state = body.state;
            await json({ suggestionId: s.suggestionId, state: s.state }); return true;
        }

        // ── digests ────────────────────────────────────────────────────
        case 'GET digests':
            await json({ items: d.digests.filter(x => !p.get('scopeKind') || x.scopeKind === p.get('scopeKind')), nextCursor: null }); return true;
        case 'GET digests/item': {
            const found = d.digests.find(x => x.digestId === p.get('id'));
            if (!found) { await fail(404, 'not_found', `No digest '${p.get('id')}'.`); return true; }
            // A digest being written finishes on its second read, so the page's polling is exercised.
            if (found.state === 'running' && ++d.itemReads >= 2) Object.assign(found, digest(found.digestId, { scopeKind: found.scopeKind, scopeId: found.scopeId, scopeTitle: found.scopeTitle, trigger: 'on_demand' }));
            await json(found); return true;
        }
        case 'POST digests/run': {
            const made = digest(`dg-${d.digests.length + 1}`, {
                scopeKind: body.scopeKind, scopeId: body.scopeId, scopeTitle: body.scopeKind === 'guild' ? 'Synthetic Server' : null, state: 'running', trigger: 'on_demand',
                fromMs: body.fromMs ?? NOW - DAY, toMs: body.toMs ?? NOW, sections: [], overall: [], notable: [], newFacts: [], finishedAtMs: null,
            });
            d.digests = [made, ...d.digests];
            d.itemReads = 0;
            await json(made, 202); return true;
        }
        case 'POST digests/seen': await json({ scopeKind: body.scopeKind, scopeId: body.scopeId, seen: true }); return true;
        case 'GET digests/subscriptions': await json({ subscriptions: d.subscriptions }); return true;
        case 'POST digests/subscriptions/save': {
            if (!/^\d\d:\d\d$/.test(body.at ?? '')) { await fail(400, 'bad_request', "'at' must be a time of day as HH:mm (Klives's zone)."); return true; }
            const saved: DigestSubscriptionDto = {
                subscriptionId: body.subscriptionId ?? `ds${d.subscriptions.length + 1}`, name: body.name, scopeKind: body.scopeKind, scopeId: body.scopeId, cadence: body.cadence,
                at: body.at, weekday: body.weekday, enabled: body.enabled, lastRunMs: null, createdAtMs: NOW,
            };
            d.subscriptions = [...d.subscriptions.filter(s => s.subscriptionId !== saved.subscriptionId), saved];
            await json(saved); return true;
        }
        case 'POST digests/subscriptions/delete':
            d.subscriptions = d.subscriptions.filter(s => s.subscriptionId !== body.subscriptionId);
            await json({ subscriptionId: body.subscriptionId, deleted: true }); return true;

        // ── communities ────────────────────────────────────────────────
        case 'GET insights/spaces': {
            const spaces: SpaceCardDto[] = [
                { scopeKind: 'guild', scopeId: 'guild-1', title: 'Synthetic Server', platform: 'discord', messages: 3000, previousMessages: 2400, people: 40, aboutKlives: 25, lastMessageMs: NOW - HOUR, computedAtMs: NOW - HOUR },
                { scopeKind: 'conversation', scopeId: 'conv-group', title: 'Synthetic group chat', platform: 'whatsapp', messages: 900, previousMessages: 1200, people: 8, aboutKlives: 3, lastMessageMs: NOW - 3 * HOUR, computedAtMs: NOW - HOUR },
            ];
            await json({ spaces, windowDays: 30 }); return true;
        }
        case 'GET insights/space':
            if (p.get('scopeId') === 'guild-1') await json(SPACE);
            else await fail(404, 'not_found', 'There is no community page for this server or chat yet.');
            return true;
        case 'POST insights/space/refresh': await json({ jobId: 7001 }, 202); return true;
        case 'POST insights/refresh': await json({ jobId: 7002 }, 202); return true;
        case 'GET insights/communities': {
            const dto: CommunitiesDto = {
                communities: [
                    { communityId: 'c1', size: 14, weight: 0.6, top: [{ personId: 'person-a', name: 'Synthetic Ada', strength: 0.9 }, { personId: 'person-b', name: 'Synthetic Bo', strength: 0.7 }] },
                    { communityId: 'c2', size: 6, weight: 0.2, top: [{ personId: 'person-c', name: 'Synthetic Cy', strength: 0.5 }] },
                ],
                bridges: [{ personId: 'person-b', name: 'Synthetic Bo', communityId: 'c1', bridgeTo: 'c2', outsideShare: 0.34 }],
                people: 20, modularity: 0.42, asOfMs: NOW - HOUR, note: 'Circles from who replies to, mentions and messages whom over the last 180 days.',
            };
            await json(dto); return true;
        }
        case 'GET insights/map': {
            const map: PeopleMapDto = {
                points: PEOPLE.filter(x => x.ageBand !== 'Minor' && !x.isSelf).map((x, i) => ({ personId: x.personId, name: x.displayName, x: Math.cos(i) * 10, y: Math.sin(i) * 10, communityId: i % 2 ? 'c2' : 'c1', messages: x.msgs })),
                asOfMs: NOW - DAY, people: 4,
            };
            await json(map); return true;
        }

        // ── links ──────────────────────────────────────────────────────
        case 'GET links/search': {
            const q = lower(p.get('q'));
            const kinds = [...list(p, 'kinds'), ...list(p, 'kind')], notPersons = list(p, 'notPersons');
            const items = SHARES.filter(s => (!q || (s.link.title ?? s.link.url).toLowerCase().includes(q) || s.link.site.includes(q)) && among(kinds, s.link.kind)
                && among(list(p, 'sites'), s.link.site) && among(list(p, 'topics'), s.link.topic) && among(list(p, 'persons'), s.personId) && !(s.personId && notPersons.includes(s.personId))
                && among(list(p, 'guilds'), s.guildId) && among(list(p, 'conversations'), s.conversationId));
            await json({ items, truncated: false }); return true;
        }
        case 'GET links/track': {
            const url = p.get('url'), site = p.get('site');
            const items = SHARES.filter(s => (url ? s.link.url === url : s.link.site === site) && among(list(p, 'persons'), s.personId) && among(list(p, 'guilds'), s.guildId));
            const dto: LinkTrackDto = {
                target: url ?? site ?? '', targetKind: url ? 'url' : 'site', link: url ? items[0]?.link ?? null : null, shares: items.length, sharers: new Set(items.map(s => s.personId)).size,
                reactions: items.reduce((n, s) => n + s.reactions, 0), firstAtMs: items.length ? Math.min(...items.map(s => s.atMs)) : null, lastAtMs: items.length ? Math.max(...items.map(s => s.atMs)) : null,
                first: items.length ? [...items].sort((a, b) => a.atMs - b.atMs)[0]! : null,
                people: [...new Set(items.map(s => s.personId!))].map(id => ({ key: id, label: person(id)?.displayName ?? null, shares: items.filter(s => s.personId === id).length })),
                places: items.length ? [{ key: 'conv-general', label: '#general', shares: items.length }] : [], months: items.length ? [{ key: '2026-06', label: 'June 2026', shares: items.length }] : [],
                topLinks: site ? [...new Map(items.map(s => [s.link.urlId, s.link])).values()] : [], items, truncated: false,
            };
            await json(dto); return true;
        }

        // ── data controls ──────────────────────────────────────────────
        case 'POST data/forget/preview': {
            if (!can('omniscience.engine.manage')) { await fail(403, 'forbidden', 'Needs engine.manage.'); return true; }
            const c = person(body.personId);
            if (!c) { await fail(404, 'not_found', `No person '${body.personId}'.`); return true; }
            const erase = body.level === 'erase';
            const dto: ForgetPreviewDto = {
                personId: c.personId, name: c.displayName, persons: 1, identities: 2, messages: c.msgs, directChatMessagesOfKlives: body.includeDirectChats ? 140 : 0, directChats: 1,
                attachments: erase ? 30 : 0, mediaFiles: erase ? 28 : 0, mediaFilesLeft: erase ? 2 : 0, reactions: erase ? 220 : 0, events: 3, facts: 1, includeDirectChats: !!body.includeDirectChats,
                level: body.level, confirmToken: `tok-${body.level}-${c.personId}`, expiresAtMs: NOW + 10 * 60_000,
                notes: erase ? ['Their account ids are remembered (as tombstones) so a later import skips them.'] : ['Their messages stay in the archive; nothing is worked out from them until analysis is switched back on.'],
            };
            await json(dto); return true;
        }
        case 'POST data/forget/confirm': {
            if (!String(body.confirmToken ?? '').startsWith('tok-')) { await fail(409, 'conflict', 'This preview has expired; preview again.'); return true; }
            const run: ForgetRunDto = { runId: `fr-${d.forgetRuns.size + 1}`, state: 'queued', counts: {}, error: null, startedAtMs: NOW, finishedAtMs: null };
            d.forgetRuns.set(run.runId, run);
            d.forgetReads = 0;
            if (String(body.confirmToken).startsWith('tok-derived-')) {
                const c = person(body.personId);
                if (c && !d.analysisOff.some(x => x.personId === c.personId)) d.analysisOff = [...d.analysisOff, { personId: c.personId, name: c.displayName, sinceMs: NOW }];
            }
            await json(run, 202); return true;
        }
        case 'GET data/forget/run': {
            const run = d.forgetRuns.get(p.get('id') ?? '');
            if (!run) { await fail(404, 'not_found', 'No such forget run.'); return true; }
            if (++d.forgetReads >= 1) Object.assign(run, { state: 'done', counts: { labels: 410, facts: 1, alerts: 2, messages: 0 }, finishedAtMs: NOW + 4000 });
            await json(run); return true;
        }
        case 'GET data/analysis': await json({ people: d.analysisOff }); return true;
        case 'POST data/analysis/on': {
            const was = d.analysisOff.some(x => x.personId === body.personId);
            d.analysisOff = d.analysisOff.filter(x => x.personId !== body.personId);
            await json({ personId: body.personId, changed: was }); return true;
        }
        case 'GET data/retention': {
            const streams: RetentionDto[] = [
                { stream: 'llm_calls', keptDays: 90, cutoffMs: NOW - 90 * DAY, deletedTotal: 120_000, lastDeleted: 1400, lastRunMs: NOW - 6 * HOUR },
                { stream: 'events', keptDays: 30, cutoffMs: NOW - 30 * DAY, deletedTotal: 9_000, lastDeleted: 0, lastRunMs: NOW - 6 * HOUR },
            ];
            await json({ streams }); return true;
        }
        case 'GET data/backups': await json({ backups: d.backups, keyId: 'key-1', keep: 7, enabled: true }); return true;
        case 'POST data/backups/run': await json({ jobId: 8001 }, 202); return true;
        case 'POST data/backups/restore': await json({ backupId: body.backupId, folder: 'D:/omniscience/v3/restores/bk-1', files: ['corpus.db', 'intel.db'], note: 'The live stores were not touched.' }); return true;
        case 'POST data/backups/export-key':
            if (String(body.passphrase ?? '').length < 12) { await fail(400, 'bad_request', 'The passphrase needs at least 12 characters.'); return true; }
            await json({ keyId: 'key-1', exported: 'omnikey1:key-1:c3ludGhldGljLWtleS1ub3QtcmVhbA' }); return true;
        case 'POST data/backups/import-key': await json({ keyId: 'key-2', exported: null }); return true;
        case 'POST data/export/person':
            if (!can('omniscience.data.export')) { await fail(403, 'forbidden', 'Needs data.export.'); return true; }
            await text(JSON.stringify({ personId: body.personId, synthetic: true }), body.format === 'markdown' ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8');
            return true;

        // ── health and monitors ────────────────────────────────────────
        case 'GET monitors/health': {
            const dto: HealthListDto = {
                open: [
                    { issueId: 'source_stalled|src-wa', kind: 'source_stalled', subject: 'src-wa', severity: 'Attention', detail: { sourceId: 'src-wa', label: 'Synthetic WhatsApp', silentHours: 14.2, usualPerDay: 120 }, firstMs: NOW - 2 * HOUR, lastMs: NOW - 600_000, resolvedMs: null },
                    { issueId: 'jobs_dead|knowledge.deduction', kind: 'jobs_dead', subject: 'knowledge.deduction', severity: 'Attention', detail: { moduleId: 'knowledge.deduction', jobs: 2, lastError: 'provider answered 503 three times' }, firstMs: NOW - HOUR, lastMs: NOW - 600_000, resolvedMs: null },
                    { issueId: 'tail_stalled', kind: 'tail_stalled', subject: 'ingest.legacy', severity: 'Urgent', detail: { moduleId: 'ingest.legacy', minutes: 570, queued: 1 }, firstMs: NOW - HOUR, lastMs: NOW - 600_000, resolvedMs: null },
                    { issueId: 'module_stalled|insights', kind: 'module_stalled', subject: 'insights', severity: 'Attention', detail: { moduleId: 'insights', queued: 19, hours: 9.5 }, firstMs: NOW - HOUR, lastMs: NOW - 600_000, resolvedMs: null },
                    // What parts of the engine report about themselves (no room for a backup; handlers that would not stop).
                    { issueId: 'module_problem|datacontrols|backup', kind: 'module_problem', subject: 'datacontrols', severity: 'attention', detail: { moduleId: 'datacontrols', problem: 'backup', sinceMs: NOW - DAY, lastMs: NOW - HOUR, detail: { reason: 'no_space', folder: 'C:\\data\\backups', neededBytes: 32_480_000_000, freeBytes: 23_300_000_000, lastBackupMs: null } }, firstMs: NOW - DAY, lastMs: NOW - 600_000, resolvedMs: null },
                    { issueId: 'module_problem|kernel|handlers_left_behind', kind: 'module_problem', subject: 'kernel', severity: 'attention', detail: { moduleId: 'kernel', problem: 'handlers_left_behind', sinceMs: NOW - HOUR, lastMs: NOW - 600_000, detail: { count: 2, jobs: [{ jobId: 41, moduleId: 'media.text', kind: 'extract', sinceMs: NOW - HOUR }, { jobId: 44, moduleId: 'datacontrols', kind: 'backup', sinceMs: NOW - HOUR }] } }, firstMs: NOW - HOUR, lastMs: NOW - 600_000, resolvedMs: null },
                ],
                resolved: [{ issueId: 'llm_circuit', kind: 'llm_circuit', subject: null, severity: 'Urgent', detail: { reason: 'The model refused the credentials.' }, firstMs: NOW - 3 * DAY, lastMs: NOW - 3 * DAY + HOUR, resolvedMs: NOW - 3 * DAY + HOUR }],
                enabled: true, checkedAtMs: NOW - 300_000,
            };
            await json(dto); return true;
        }
        case 'GET monitors/rules': await json({ rules: d.monitorRules.filter(r => !p.get('kind') || r.kind === p.get('kind')) }); return true;
        case 'GET monitors/events': {
            const items: MonitorEventDto[] = [
                { eventId: 'e1', kind: 'person_activity', ruleId: 'mw1', personId: 'person-c', personName: 'Synthetic Cy', guildId: null, conversationId: null, atMs: NOW - 2 * HOUR, data: { trigger: 'returned', ruleName: 'Old friends', gapDays: 41 }, notified: true },
                { eventId: 'e2', kind: 'klives_tone', ruleId: null, personId: null, personName: null, guildId: 'guild-1', conversationId: null, atMs: NOW - 5 * HOUR, data: { tone: 'positive', count: 9, authors: 4, expected: 1.5, windowHours: 6 }, notified: false },
            ];
            await json({ items: items.filter(e => !p.get('kind') || e.kind === p.get('kind')) }); return true;
        }
        case 'GET monitors/topic': {
            const rule = d.monitorRules.find(r => r.watchId === p.get('watchId'));
            if (!rule) { await fail(404, 'not_found', 'No such watch.'); return true; }
            const dto: TopicStatusDto = { watchId: rule.watchId, name: rule.name, last24h: 64, usualDay: 4.5, robustZ: 6.1, surging: true, threshold: 13.5, days: [3, 5, 4, 6, 4, 5, 64], recentMessageIds: ['m-31'] };
            await json(dto); return true;
        }
        case 'POST monitors/rules/enabled': {
            const r = d.monitorRules.find(x => x.watchId === body.watchId);
            if (!r) { await fail(404, 'not_found', 'No such watch.'); return true; }
            r.enabled = body.enabled;
            await json({ watchId: r.watchId, changed: true }); return true;
        }
        case 'POST monitors/rules/delete':
            d.monitorRules = d.monitorRules.filter(r => r.watchId !== body.watchId);
            await json({ watchId: body.watchId, changed: true }); return true;
        case 'GET translate/status': {
            const dto: TranslateStatusDto = { target: 'en', auto: true, queued: 3, stored: 1200, usedThisHour: 40, perHour: 600 };
            await json(dto); return true;
        }
    }
    return false;
}
