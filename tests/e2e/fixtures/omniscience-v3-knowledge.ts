import type {
    AgeBandDto, AgendaDto, AliasDto, AskPlanDto, AssertionDetailDto, ClaimDto, DiscordBotStatusDto, EntityDto, ExtractionRunDto, HypothesisDto, IdentityLinkDecisionDto, IdentityLinkDto,
    ImportListDto, ImportPreview, ImportResult, ImportUploadedDto, InquiryReportDto, InquiryRowDto, JobRecord, KnowledgeFactDto, KnowledgeFactsPageDto, KnowledgeProfileDto, KnowledgeReviewItemDto,
    LifeTimelineDto, MediaSearchDto, MediaSearchHitDto, MergeRowDto, PersonNamesDto, PlanItemDto, QualityLabDto, ReplicaBlindSessionDto, ReplicaChatDto, ReplicaChatMessageDto,
    ReplicaEvalItemDto, ReplicaModuleStatusDto, ReplicaPersonDto, ReplicaReadinessDto, ReplicaStreamEventDto, ReplicaVersionDto, ReplicaVersionSummaryDto, StandingQuestionDto, TacticRunDto,
} from '../../../scripts/omniscience/contracts';

/**
 * The knowledge and replica routes (WS-B, WS-D), sources, imports and image search (WS-A) of the v3 API,
 * mocked with synthetic people only and typed against the generated contract like the other fixtures.
 * Value sets (fact statuses, inquiry states, job states, replica statuses) are the server's own.
 */

const NOW = Date.UTC(2026, 6, 1, 12, 0, 0);
const DAY = 86_400_000;
const HOUR = 3_600_000;

const NAMES: Record<string, string> = {
    'person-self': 'Klives', 'person-a': 'Synthetic Ada', 'person-b': 'Synthetic Bo', 'person-c': 'Synthetic Cy', 'person-d': 'Synthetic Dee', 'person-e': 'Synthetic Eli',
};
/** Treated as under 18 by this mock (MinorGuard), as in the domain fixture. */
const MINOR = 'person-d';

// ── knowledge ────────────────────────────────────────────────────────────────

const fact = (assertionId: string, attribute: string, attributeTitle: string, category: string, value: string, over: Partial<KnowledgeFactDto> = {}): KnowledgeFactDto => ({
    assertionId, attribute, attributeTitle, category, value, polarity: 'affirmed', objectPersonId: null, status: 'accepted', probability: 0.9, storedProbability: 0.88, calibrated: true,
    validFromEarliestMs: null, validFromLatestMs: null, validToEarliestMs: null, validToLatestMs: null, lastEvidenceMs: NOW - 3 * DAY, firstEvidenceMs: NOW - 200 * DAY,
    recordedAtMs: NOW - 3 * DAY, sourceKind: 'self_disclosure', sensitivity: 'normal', producer: 'extract', ...over,
});

const FACTS: KnowledgeFactDto[] = [
    fact('as-city', 'city', 'City', 'location', 'Leeds', { validFromEarliestMs: NOW - 70 * DAY, validFromLatestMs: NOW - 40 * DAY, firstEvidenceMs: NOW - 45 * DAY }),
    fact('as-city-old', 'city', 'City', 'location', 'Bristol', { validToEarliestMs: NOW - 90 * DAY, validToLatestMs: NOW - 60 * DAY }),
    fact('as-job', 'employer', 'Employer', 'work', 'the library', { status: 'confirmed', probability: 1 }),
    fact('as-hobby', 'hobby', 'Hobby', 'interests', 'rock climbing', { status: 'proposed', probability: 0.55 }),
    // Long true, but only said a few weeks ago: known today about the spring, not knowable from the spring's messages.
    fact('as-sibling', 'sibling', 'Sibling', 'family', 'Synthetic Eli', { objectPersonId: 'person-e', sourceKind: 'third_party', probability: 0.72, firstEvidenceMs: NOW - 20 * DAY }),
];
const INFERENCE = fact('as-inf', 'pet', 'Pet', 'home', 'a dog', { status: 'inferred', probability: 0.61, producer: 'detective', sourceKind: 'inferred' });
/** The statuses the server shows as knowledge when none is asked for (AssertionStatus.IsShownAsKnowledge). */
const SHOWN_AS_KNOWLEDGE = ['accepted', 'confirmed', 'contested', 'inferred'];

function profile(personId: string, statuses: Record<string, string>): KnowledgeProfileDto {
    const live = FACTS.map(f => ({ ...f, status: statuses[f.assertionId] ?? f.status })).filter(f => SHOWN_AS_KNOWLEDGE.includes(f.status));
    const categories = [...new Set(live.map(f => f.category))].map(category => ({ category, facts: live.filter(f => f.category === category) }));
    return { personId, asOfMs: NOW - HOUR, minorRestricted: false, coveredMessages: 3120, lastExtractMs: NOW - 2 * HOUR, backlogPending: false, promptVersion: 'extract-7', categories, inferences: [INFERENCE] };
}

function factDetail(f: KnowledgeFactDto, gold: string | null): AssertionDetailDto {
    return {
        fact: f, naturalKey: `person:person-a|${f.attribute}|${f.value}`, modality: 'literal', derivationJson: null, detailJson: null,
        evidence: [{
            messageId: 'm-301', version: 1, role: 'support', quote: `synthetic: ${f.value}`, weight: 1, sentAtMs: NOW - 40 * DAY, authorPersonId: 'person-a', authorName: 'Synthetic Ada',
            conversationId: 'conv-dm-a', conversationKind: 'dm', conversationTitle: 'Direct chat', guildId: null, guildName: null, platform: 'discord', deleted: false, edited: false,
            text: `synthetic: I can tell you about ${f.value}, it has been a while`,
        }],
        history: [
            { assertionId: `${f.assertionId}-v1`, status: 'proposed', probability: 0.6, recordedAtMs: NOW - 30 * DAY, supersededAtMs: NOW - 3 * DAY, retractedAtMs: null, value: f.value, validFromLatestMs: null, validToLatestMs: null, promptVersion: 'extract-6', model: 'synthetic-model' },
            { assertionId: f.assertionId, status: f.status, probability: f.probability, recordedAtMs: f.recordedAtMs, supersededAtMs: null, retractedAtMs: null, value: f.value, validFromLatestMs: f.validFromLatestMs, validToLatestMs: f.validToLatestMs, promptVersion: 'extract-7', model: 'synthetic-model' },
        ],
        goldVerdict: gold, goldDecidedAtMs: gold ? NOW : null,
    };
}

const plan = (planId: string, title: string, over: Partial<PlanItemDto> = {}): PlanItemDto => ({
    planId, kind: 'plan', subtype: null, ownerPersonId: 'person-a', counterpartyPersonId: 'person-self', involvesKlives: true, klivesPromised: false, title,
    scheduledEarliestMs: NOW + 2 * DAY, scheduledLatestMs: NOW + 2 * DAY + 3 * HOUR, nextOccurrenceMs: NOW + 2 * DAY, localZone: 'Europe/London', allDay: false, firmness: 'firm',
    status: 'upcoming', recurrence: null, evidenceCount: 2, evidenceMessageIds: ['m-201', 'm-202'], conversationId: 'conv-dm-a', ...over,
});
const PLANS: PlanItemDto[] = [
    plan('pl-1', 'Dinner at the noodle place'),
    plan('pl-2', 'Send the hiking photos', { klivesPromised: true, kind: 'promise', ownerPersonId: 'person-self', counterpartyPersonId: 'person-a', status: 'due', firmness: 'firm' }),
    plan('pl-3', "Synthetic Bo's birthday", { kind: 'birthday', ownerPersonId: 'person-b', counterpartyPersonId: null, involvesKlives: false, allDay: true, nextOccurrenceMs: NOW + 5 * DAY, recurrence: 'yearly', status: 'recurring' }),
    plan('pl-4', 'Return the board game', { status: 'overdue', nextOccurrenceMs: NOW - 2 * DAY, scheduledEarliestMs: NOW - 2 * DAY, scheduledLatestMs: NOW - 2 * DAY, firmness: 'tentative' }),
];

const review = (itemId: string, kind: string, title: string, over: Partial<KnowledgeReviewItemDto> = {}): KnowledgeReviewItemDto => ({
    itemId, kind, subjectId: 'person-a', title, detailJson: null, priority: 50, state: 'open', createdAtMs: NOW - DAY, updatedAtMs: NOW - DAY, resolvedAtMs: null,
    resolution: null, actor: null, ...over,
});

const inquiryRow = (inquiryId: string, question: string, over: Partial<InquiryRowDto> = {}): InquiryRowDto => ({
    inquiryId, runId: `run-${inquiryId}`, tacticKey: 'x01.ask_yes_no', question, restatement: question, answerType: 'Binary', primarySubjectId: 'person-a', asOfMs: NOW - DAY,
    verdict: 'Yes', probability: 0.82, state: 'answered', feedback: null, standingId: null, createdAtMs: NOW - DAY, ...over,
});

function report(row: InquiryRowDto): InquiryReportDto {
    const who = row.verdict === 'NeedsDisambiguation';
    return {
        inquiryId: row.inquiryId, runId: row.runId, question: row.question, restatement: row.restatement ?? row.question, answerType: 'Binary',
        verdict: (row.verdict ?? 'Yes') as InquiryReportDto['verdict'], probability: row.probability ?? null,
        probabilityRaw: 0.86, bandLow: 0.7, bandHigh: 0.9, calibrated: true, distribution: [], ranking: [], estimate: null, changeFromMs: null, changeToMs: null,
        evidenceFor: who ? [] : [{ id: 'e1', kind: 'message', messageId: 'm-301', assertionId: null, authorPersonId: 'person-a', atMs: NOW - 40 * DAY, quote: 'synthetic: I moved to Leeds last month',
            conversationId: 'conv-dm-a', guildId: null, platform: 'discord', where: 'Direct chat', reliability: 'self_disclosure', facet: 'home' }],
        evidenceAgainst: [], reasoning: who ? null : 'They said so themselves, and nothing since contradicts it.', temporalNote: null, wouldChange: ['A later message saying they moved again'],
        questionsToAsk: [], coverage: { subjects: ['person-a'], fromMs: null, toMs: NOW - DAY, messagesConsidered: 412, factsConsidered: 9, itemsInDossier: 40, excludedAsJokeOrFiction: 1,
            excludedAfterAsOf: 0, vectorSearch: true, platforms: ['discord'], notes: [] },
        evidenceStrength: 0.8, passes: 5, passesDropped: 0, disagreement: 0.05, devilsAdvocate: null, priorProbability: null, priorRationale: null, worldKnowledgeDependent: false,
        isPrediction: false, policyNote: null,
        disambiguation: who ? [{ mention: 'Ada', candidates: [{ personId: 'person-a', label: 'Synthetic Ada', detail: 'discord' }, { personId: 'person-e', label: 'Synthetic Eli', detail: 'also called Ada in one server' }] }] : [],
        asOfMs: row.asOfMs, asOfNote: null, promptVersion: 'inquiry-4', model: 'synthetic-model', assertionId: null, standingId: row.standingId ?? null,
    };
}

// ── replicas ─────────────────────────────────────────────────────────────────

const readiness = (personId: string, over: Partial<ReplicaReadinessDto> = {}): ReplicaReadinessDto => ({
    personId, name: NAMES[personId] ?? personId, tier: 'Ready', mode: 'full', reason: 'Enough replies.', replies: 2400, initiations: 310, effective: 2100, explicitReplies: 900, repliesToKlives: 640,
    authoredMessages: 4210, nonAuthored: 0, deleted: 12, minorPeriodExcluded: 0, byContext: { dm: 1500, guild_channel: 600 }, firstMs: NOW - 700 * DAY, lastMs: NOW - DAY, conversations: 9,
    ageBand: 'Adult', adultFromMs: null, thresholdExperimental: 150, thresholdReady: 600, isSelf: false, isBot: false, truncated: false, computedAtMs: NOW - HOUR, sourceSeq: 48_000, ...over,
});

const version = (versionId: string, number: number, over: Partial<ReplicaVersionSummaryDto> = {}): ReplicaVersionSummaryDto => ({
    versionId, number, state: 'ready', reason: 'requested', createdAtMs: NOW - 9 * DAY, finishedAtMs: NOW - 9 * DAY + 2 * HOUR, dataFromMs: NOW - 700 * DAY, dataToMs: NOW - 9 * DAY,
    encoderModel: 'synthetic-encoder', stages: [], degraded: [], error: null,
    metrics: { evaluated: 120, failed: 2, discriminationAccuracy: 0.61, discriminationCiLow: 0.52, discriminationCiHigh: 0.69, embeddingSimilarity: 0.74, styleDistance: 0.21, lengthError: 0.18,
        burstError: 0.1, configKey: 't0.8-r6', discriminationByContext: { dm: 0.58 }, model: 'synthetic-model', evaluatedAtMs: NOW - 9 * DAY + 2 * HOUR, note: '',
        tuning: [{ configKey: 't0.8-r6', temperature: 0.8, retrieved: 6, burstSampling: true, pairs: 40, discriminationAccuracy: 0.6, embeddingSimilarity: 0.75, styleDistance: 0.2, chosen: true },
            { configKey: 't0.5-r6', temperature: 0.5, retrieved: 6, burstSampling: true, pairs: 40, discriminationAccuracy: 0.71, embeddingSimilarity: 0.77, styleDistance: 0.26, chosen: false }] },
    counts: { pairs: 2710, replies: 2400, initiations: 310, train: 2300, holdoutTune: 150, holdoutTest: 120, shadow: 14, eras: 2, slices: 9, personaItems: 40, personaDropped: 3, reflexLabelled: 600, vectors: 2710 },
    ...over,
});

const replicaCard = (personId: string, over: Partial<ReplicaPersonDto> = {}): ReplicaPersonDto => ({
    personId, name: NAMES[personId] ?? personId, status: 'ready', statusDetail: null, stale: false, staleReason: null, staleSinceMs: null, newMessagesSinceServing: 0, autoRetrain: false,
    readiness: readiness(personId), serving: version(`rv-${personId}-2`, 2), building: null, fidelityTrend: [], updatedAtMs: NOW - HOUR, ...over,
});

const chatLine = (chatId: string, seq: number, role: string, content: string, over: Partial<ReplicaChatMessageDto> = {}): ReplicaChatMessageDto => ({
    chatId, seq, role, content, atMs: NOW - HOUR + seq * 1000, personId: role === 'user' ? null : 'person-a', speaker: role === 'user' ? null : 'Synthetic Ada', turnId: `t-${Math.ceil(seq / 2)}`,
    status: role === 'user' ? 'answered' : null, error: null, simulated: role !== 'user', versionId: role === 'user' ? null : 'rv-person-a-2', generationId: null, burstIndex: null, burstSize: null, ...over,
});

const hit = (attachmentId: string, over: Partial<MediaSearchHitDto> = {}): MediaSearchHitDto => ({
    attachmentId, messageId: attachmentId.split('#')[0]!, conversationId: 'conv-general', authorPersonId: 'person-a', authorName: 'Synthetic Ada', sentAtMs: NOW - 5 * DAY, deleted: false,
    caption: 'A screenshot of a trading app showing a price chart.', tags: ['screenshot', 'chart'], imageText: null, score: 0.031, why: ['looks like it', 'the caption says so'],
    platform: 'discord', conversationKind: 'text', conversationTitle: 'general', guildId: 'discord:800000000000000001', guildName: 'Synthetic server',
    messageUrl: 'https://discord.com/channels/800000000000000001/900000000000000001/1024709476269436948', messageText: 'synthetic: look at this chart', messageTextCut: false, edited: true,
    reactions: 3, position: 2, inMessage: 4, filename: 'chart.png', mime: 'image/png', sizeBytes: 482_113, width: 1920, height: 1080, spoiler: false, altText: null, takenAtMs: null,
    kind: 'screenshot', nsfw: false, captionModel: 'synthetic-vision', captionedAtMs: NOW - 4 * DAY, timesPosted: 2, ...over,
});

export function knowledgeState() {
    return {
        /** Klives's decisions about facts in this session: assertion id → the status it now has. */
        factStatuses: {} as Record<string, string>,
        factDecisions: [] as { assertionId: string; verdict: string; value?: string | null }[],
        deductionRuns: [] as string[],
        aliases: [{ aliasId: 'al-1', personId: 'person-a', alias: 'Ads', nameKind: 'nickname', scopeKind: 'guild', scopeId: 'guild-1', validFromMs: NOW - 100 * DAY, validToMs: null,
            usages: 14, speakers: 4, selfClaims: 0, probability: 0.8, status: 'candidate', commonWord: false, alertEligible: false }] as AliasDto[],
        ageStatements: [{ evidenceId: 'age-1', kind: 'age_now', status: 'accepted', sourceKind: 'self_disclosure', assertedAtMs: NOW - 300 * DAY, messageId: 'm-401', probability: 0.9, quote: "synthetic: I'm 27 now" }] as AgeBandDto['statements'],
        review: [
            review('rv-1', 'contradiction', 'City: Leeds or Bristol?', { priority: 80, detailJson: JSON.stringify({ attribute: 'city', values: ['Leeds', 'Bristol'] }) }),
            review('rv-2', 'alias', 'Is "Ads" a name for Synthetic Ada?', { priority: 40 }),
            review('rv-3', 'age_conflict', 'Age statements disagree for Synthetic Bo', { subjectId: 'person-b', priority: 90 }),
        ] as KnowledgeReviewItemDto[],
        links: [{
            linkId: 'lk-1', identityA: 'discord:ada', identityB: 'whatsapp:ada', personA: 'person-a', personB: 'person-e',
            signals: [{ kind: 'same_name', strength: 0.7, detail: 'Both call themselves "Synthetic Ada".' }, { kind: 'shared_contact', strength: 0.5, detail: 'They talk to the same three people.' }],
            independentSignals: 2, probability: 0.78, verdict: 'suggested', judgeJson: null, createdAtMs: NOW - 2 * DAY, updatedAtMs: NOW - 2 * DAY, decidedAtMs: null, mergeId: null,
        }] as IdentityLinkDto[],
        merges: [{ mergeId: 7, fromPersonId: 'person-a-old', intoPersonId: 'person-a', mergedAtMs: NOW - 50 * DAY, actor: 'Klives', reason: 'same account, renamed', undoneAtMs: null }] as MergeRowDto[],
        inquiries: [
            inquiryRow('iq-1', 'Does Synthetic Ada live in Leeds?'),
            inquiryRow('iq-2', 'Is Synthetic Bo still at the bakery?', { primarySubjectId: 'person-b', verdict: 'Uncertain', probability: 0.5, standingId: 'sq-1' }),
            inquiryRow('iq-3', 'Where does Ada work?', { primarySubjectId: null, verdict: 'NeedsDisambiguation', probability: null, state: 'needs_disambiguation' }),
        ] as InquiryRowDto[],
        asked: [] as { question: string; personIds: string[] | null; tactic: string | null; standing: boolean }[],
        standing: [{
            questionId: 'sq-1', question: 'Is Synthetic Bo still at the bakery?', personIds: ['person-b'], enabled: true, minIntervalMs: 6 * HOUR, lastEvaluatedMs: NOW - 5 * HOUR,
            lastVerdict: 'Uncertain', lastProbability: 0.5, pending: false, createdAtMs: NOW - 20 * DAY,
        }] as StandingQuestionDto[],
        qualityRuns: [] as string[],
        imports: {
            inboxPath: 'D:/synthetic/v3/imports', formats: [{ id: 'whatsapp', title: 'WhatsApp chat export', needsZone: true }, { id: 'discord_package', title: 'Discord data package', needsZone: false }],
            inbox: [{ name: 'synthetic-chat.zip', isFolder: false, bytes: 2_400_000, modifiedAtMs: NOW - HOUR }],
            ledger: [{ importId: 'im-1', format: 'discord_package', sha256: 'ab'.repeat(32), zone: null, state: 'committed', createdAtMs: NOW - 9 * DAY, committedAtMs: NOW - 9 * DAY, error: null,
                countsJson: JSON.stringify({ inserted: 15400, updated: 12 }) }],
        } as ImportListDto,
        previews: [] as { name: string; zone: string | null }[],
        uploads: [] as string[],
        backfills: [] as string[],
        // replicas
        replicas: [
            replicaCard('person-a'),
            replicaCard('person-b', { status: 'none', serving: null, readiness: readiness('person-b', { tier: 'Experimental', effective: 320, replies: 380, reason: 'Only just enough replies.' }) }),
            replicaCard('person-d', { status: 'blocked', statusDetail: 'They are, or may be, under 18. No replica is ever built for a minor.', serving: null, readiness: readiness('person-d', { tier: 'Blocked', reason: 'Under 18 or may be.', ageBand: 'Minor' }) }),
        ] as ReplicaPersonDto[],
        chats: [{ chatId: 'ch-1', kind: 'chat', personId: 'person-a', title: 'About the trip', asOfMs: null, contextKind: 'dm', addresseePersonId: null, archived: false, createdAtMs: NOW - 2 * DAY,
            updatedAtMs: NOW - HOUR, members: ['person-a'], topic: null }] as ReplicaChatDto[],
        lines: { 'ch-1': [chatLine('ch-1', 1, 'user', 'are you still coming on friday?'), chatLine('ch-1', 2, 'replica', 'yeah!! wouldnt miss it')] } as Record<string, ReplicaChatMessageDto[]>,
        ratings: [] as { chatId: string; seq: number; rating: number }[],
        trained: [] as string[],
        /** Blind tests, oldest first. */
        blinds: [] as ReplicaBlindSessionDto[],
    };
}

export type KnowledgeState = ReturnType<typeof knowledgeState>;

type Reply = (body: unknown, status?: number) => Promise<void>;
type Fail = (status: number, code: string, message: string) => Promise<void>;
type Text = (body: string, contentType: string) => Promise<void>;
type Lines = (lines: unknown[]) => Promise<void>;

export interface KnowledgeContext { jobs: JobRecord[]; runs: TacticRunDto[] }

/** A stand-in image: a small grey square (the page only needs something to show). */
const IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#8a8f98"/></svg>';

const job = (jobId: number, moduleId: string, kind: string, resultJson: string): JobRecord => ({
    jobId, moduleId, kind, subjectKind: null, subjectId: null, dedupeKey: null, priority: 300, lane: 'Io', state: 'succeeded', attempts: 1, maxAttempts: 3, notBeforeMs: NOW,
    leaseOwner: null, leaseExpiresMs: null, payloadJson: null, progressJson: null, resultJson, errorClass: null, errorMessage: null, createdAtMs: NOW, startedAtMs: NOW, finishedAtMs: NOW + 1000,
    parentJobId: null, runId: null,
});

function importPreview(name: string, zone: string | null): ImportPreview {
    return {
        name, format: 'whatsapp', formatTitle: 'WhatsApp chat export', sha256: 'cd'.repeat(32), messages: 1820, systemMessages: 12, firstMs: NOW - 300 * DAY, lastMs: NOW - DAY,
        alreadyInCorpus: 40, committedBeforeMs: null, conversations: [{ conversationId: 'whatsapp:synthetic-group', title: 'Synthetic group', kind: 'group_dm', messages: 1820 }],
        senders: [{ name: 'Synthetic Ada', identityId: 'whatsapp:ada', messages: 900, isOwner: false }, { name: 'Synthetic Bo', identityId: 'whatsapp:bo', messages: 920, isOwner: true }],
        senderCount: 2, zoneUsed: zone, dateOrder: 'dmy', ambiguousTimes: 0, invalidTimes: 0, mediaFound: 40, mediaMissing: 2, repairedText: 0, skippedRecords: 0,
        ownerDetected: 'Synthetic Bo', unreadableFiles: [], warnings: ['2 media files are referenced but missing from the export.'],
        decisionNeeded: zone ? null : 'Which time zone was the phone in? WhatsApp exports carry local times only.',
    };
}

function versionDetail(summary: ReplicaVersionSummaryDto, personId: string): ReplicaVersionDto {
    return {
        summary, personId, moduleVersion: 1, requestedBy: 'Klives',
        eras: [{ index: 0, fromMs: NOW - 700 * DAY, toMs: NOW - 300 * DAY, pairs: 1200, means: {} }, { index: 1, fromMs: NOW - 300 * DAY, toMs: NOW - 9 * DAY, pairs: 1510, means: {} }],
        style: { bursts: 1800, fromMs: NOW - 700 * DAY, toMs: NOW - 9 * DAY, charsP50: 38, charsP90: 140, burstShares: [0.7, 0.2, 0.1], latencyP50Ms: 40_000, casing: { lower: 0.9 }, endings: { none: 0.8 },
            emojiLines: 210, topEmoji: ['😭', '✨'], laughter: ['lol', 'hahaha'], distinctive: ['wouldnt', 'honestly', 'proper'], scripts: { latin: 1 }, peakLocalHours: [21, 22] },
        config: { temperature: 0.8, topP: 0.95, candidates: 4, retrieved: 6, burstSampling: true, llmJudge: true, key: 't0.8-r6' },
    };
}

const evalItem = (pairId: string, over: Partial<ReplicaEvalItemDto> = {}): ReplicaEvalItemDto => ({
    pairId, configKey: 't0.8-r6', split: 'holdout_test', contextKind: 'dm', occurredMs: NOW - 30 * DAY, asOfMs: NOW - 30 * DAY, stimulus: 'synthetic: how was the climb?', realReply: 'synthetic: brutal but worth it',
    generatedReply: 'synthetic: honestly so hard, loved it tho', outcome: 'judged', judgeCorrect: false, judgeConfidence: 0.55, embeddingSimilarity: 0.78, styleDistance: 0.2, lengthError: 0.1, model: 'synthetic-model', ...over,
});

export async function handleKnowledge(key: string, p: URLSearchParams, body: any, k: KnowledgeState, json: Reply, fail: Fail, can: (perm: string) => boolean,
    ctx: KnowledgeContext, text: Text, lines: Lines): Promise<boolean> {
    const need = async (perm: string, what: string): Promise<boolean> => { if (can(perm)) return true; await fail(403, 'forbidden', `Needs ${what}.`); return false; };
    const startJob = (moduleId: string, kind: string, result: unknown): number => { const j = job(9000 + ctx.jobs.length + 1, moduleId, kind, JSON.stringify(result)); ctx.jobs.push(j); return j.jobId; };
    const card = (id: string | null) => k.replicas.find(r => r.personId === id);

    switch (key) {
        // ── names ──────────────────────────────────────────────────────
        case 'GET people/names': {
            const names: Record<string, string> = {};
            for (const id of (p.get('ids') ?? '').split(',').filter(Boolean)) if (NAMES[id]) names[id] = NAMES[id]!;
            const dto: PersonNamesDto = { names };
            await json(dto); return true;
        }

        // ── knowledge: one person ──────────────────────────────────────
        case 'GET knowledge/profile': {
            const person = p.get('person') ?? '';
            const envelope = (b: KnowledgeProfileDto) => ({ model: 'knowledge.profile', key: person, version: 3, schemaVersion: 1, asOfMs: NOW - HOUR, sourceSeq: 9000, computedAtMs: NOW - HOUR, body: b });
            if (person === MINOR) { await json(envelope({ ...profile(person, {}), minorRestricted: true, categories: [], inferences: [] })); return true; }
            if (person !== 'person-a') { await fail(404, 'not_built', 'This view has not been built yet; it is computed in the background.'); return true; }
            await json(envelope(profile(person, k.factStatuses))); return true;
        }
        case 'GET knowledge/facts': {
            const person = p.get('person') ?? '';
            const mode = p.get('mode') ?? 'current';
            if (!['current', 'asof', 'known'].includes(mode)) { await fail(400, 'bad_request', "'mode' must be current, asof or known."); return true; }
            const at = Number(p.get('at') ?? NOW);
            const wanted = (p.get('status') ?? '').split(',').filter(Boolean);
            const all = person === 'person-a' ? [...FACTS, INFERENCE].map(f => ({ ...f, status: k.factStatuses[f.assertionId] ?? f.status })) : [];
            const items = all
                .filter(f => (wanted.length ? wanted : SHOWN_AS_KNOWLEDGE).includes(f.status))
                // "known": what was on record by then. Otherwise what could have held at the instant, as known now.
                .filter(f => (mode === 'known' ? f.recordedAtMs <= at : (f.validToLatestMs ?? Infinity) > at && (f.validFromEarliestMs ?? -Infinity) <= at))
                .filter(f => p.get('knownByThen') !== 'true' || (f.firstEvidenceMs ?? Infinity) <= at);
            const dto: KnowledgeFactsPageDto = { personId: person, mode: mode === 'asof' ? 'AsOfWorld' : mode === 'known' ? 'AsKnownAt' : 'Current', atMs: at, minorRestricted: person === MINOR, items, nextCursor: null };
            await json(dto); return true;
        }
        case 'GET knowledge/facts/get': {
            const f = [...FACTS, INFERENCE].find(x => x.assertionId === p.get('id'));
            if (!f) { await fail(404, 'not_found', 'No such fact.'); return true; }
            const decided = k.factDecisions.find(d => d.assertionId === f.assertionId);
            await json(factDetail({ ...f, status: k.factStatuses[f.assertionId] ?? f.status }, decided?.verdict ?? null)); return true;
        }
        case 'POST knowledge/facts/review': {
            if (!await need('omniscience.review.act', 'review.act')) return true;
            if (!['confirm', 'reject', 'correct'].includes(body.verdict)) { await fail(400, 'bad_request', "'verdict' must be confirm, reject or correct."); return true; }
            k.factDecisions.push({ assertionId: body.assertionId, verdict: body.verdict, value: body.value });
            k.factStatuses[body.assertionId] = body.verdict === 'reject' ? 'rejected' : 'confirmed';
            await json({ jobId: 7001, detail: 'The fact is re-consolidated with your decision.' }); return true;
        }
        case 'POST knowledge/deduction/run': {
            if (!await need('omniscience.analysis.run', 'analysis.run')) return true;
            k.deductionRuns.push(body.personId);
            await json({ jobId: 7002, detail: 'Extraction, consolidation and the detective run as one pipeline.' }, 202); return true;
        }
        case 'GET knowledge/age': {
            const person = p.get('person') ?? '';
            const minor = person === MINOR;
            const dto: AgeBandDto = { personId: person, band: minor ? 'Minor' : 'Adult', restricted: minor, markedMinorByKlives: minor, atMs: NOW, statements: person === 'person-a' ? k.ageStatements : [] };
            await json(dto); return true;
        }
        case 'POST knowledge/age/review': {
            if (!await need('omniscience.review.act', 'review.act')) return true;
            const s = k.ageStatements.find(x => x.evidenceId === body.evidenceId);
            if (!s) { await fail(404, 'not_found', 'No such age statement.'); return true; }
            s.status = body.verdict === 'confirm' ? 'confirmed' : 'rejected';
            await json({ jobId: 7003, detail: 'The band is recomputed from the remaining statements.' }); return true;
        }
        case 'GET knowledge/aliases': await json(k.aliases.filter(a => a.personId === p.get('person'))); return true;
        case 'POST knowledge/aliases/review': {
            if (!await need('omniscience.review.act', 'review.act')) return true;
            const a = k.aliases.find(x => x.aliasId === body.aliasId);
            if (!a) { await fail(404, 'not_found', 'No such alias.'); return true; }
            a.status = body.verdict === 'confirm' ? 'confirmed' : 'rejected';
            await json({ aliasId: a.aliasId, status: a.status }); return true;
        }
        case 'GET knowledge/entities': {
            const items: EntityDto[] = p.get('person') !== 'person-a' ? [] : [{ entityId: 'en-1', ownerPersonId: 'person-a', kind: 'place', name: 'The climbing wall', attributesJson: '{}',
                firstEvidenceMs: NOW - 90 * DAY, lastEvidenceMs: NOW - 4 * DAY, mentions: 18, status: 'active' }];
            await json(items); return true;
        }
        case 'GET knowledge/hypotheses': {
            const person = p.get('person') ?? '';
            const items: HypothesisDto[] = person !== 'person-a' ? [] : [{ hypothesisId: 'hy-1', personId: person, statement: 'May be looking for a new flat', attribute: 'city', probability: 0.62,
                status: 'open', createdAtMs: NOW - 4 * DAY, expiresAtMs: NOW + 26 * DAY, resolvedAtMs: null, resolutionNote: null, derivedFromJson: '[]' }];
            await json(items); return true;
        }
        case 'GET knowledge/timeline': {
            const person = p.get('person') ?? '';
            const b: LifeTimelineDto = { personId: person, asOfMs: NOW - HOUR, totalEvents: 2, events: person !== 'person-a' ? [] : [
                { eventId: 'ev-1', category: 'location', title: 'Moved to Leeds', attribute: 'city', assertionId: 'as-city', earliestMs: NOW - 70 * DAY, latestMs: NOW - 40 * DAY,
                    midpointMs: NOW - 55 * DAY, precision: 'month', probability: 0.9, evidenceCount: 3, evidenceMessageIds: ['m-301'] },
                { eventId: 'ev-2', category: 'work', title: 'Started at the library', attribute: 'employer', assertionId: 'as-job', earliestMs: NOW - 30 * DAY, latestMs: NOW - 30 * DAY,
                    midpointMs: NOW - 30 * DAY, precision: 'day', probability: 1, evidenceCount: 1, evidenceMessageIds: ['m-302'] },
            ] };
            await json({ model: 'knowledge.timeline', key: person, version: 1, schemaVersion: 1, asOfMs: NOW, sourceSeq: 1, computedAtMs: NOW, body: b }); return true;
        }
        case 'GET knowledge/plans': {
            const person = p.get('person');
            let items = PLANS.filter(x => !person || x.ownerPersonId === person || x.counterpartyPersonId === person);
            if (p.get('status')) items = items.filter(x => x.status === p.get('status'));
            if (p.get('kind')) items = items.filter(x => x.kind === p.get('kind'));
            if (p.get('klivesOnly') === 'true') items = items.filter(x => x.involvesKlives);
            await json({ items, nextCursor: null }); return true;
        }
        case 'GET knowledge/agenda': {
            const b: AgendaDto = { asOfMs: NOW, zone: 'Europe/London', upcoming: [PLANS[0]!, PLANS[2]!], overdue: [PLANS[3]!], klivesPromises: [PLANS[1]!] };
            await json({ model: 'knowledge.agenda', key: 'klives', version: 1, schemaVersion: 1, asOfMs: NOW, sourceSeq: 1, computedAtMs: NOW, body: b }); return true;
        }
        case 'GET knowledge/runs': {
            const items: ExtractionRunDto[] = p.get('person') !== 'person-a' ? [] : [{ runId: 'xr-1', personId: 'person-a', jobId: 1203, promptVersion: 'extract-7', model: 'synthetic-model', slices: 2,
                messages: 640, claimsRaw: 31, claimsAgreed: 22, claimsVerified: 17, claimsRejected: 5, rejectionsJson: JSON.stringify({ rejections: { quote_not_found: 3, critic_unsupported: 2 } }), llmCalls: 8,
                outcome: 'ok', startedAtMs: NOW - 2 * HOUR, finishedAtMs: NOW - 2 * HOUR + 240_000 }];
            await json({ items, nextCursor: null }); return true;
        }
        case 'GET knowledge/claims': {
            const claim = (claimId: string, attribute: string, value: string | null, verdict: string, reason: string | null): ClaimDto => ({
                claimId, runId: 'xr-1', personId: 'person-a', attribute, category: 'location', value, modality: 'literal', sourceKind: 'self_disclosure', probability: 0.8, agreement: 'both',
                verdict, reason, critic: verdict === 'verified' ? 'supported' : null, assertedAtMs: NOW - 40 * DAY, recordedAtMs: NOW - 2 * HOUR, promptVersion: 'extract-7', model: 'synthetic-model', conversationId: 'conv-dm-a' });
            let items = p.get('person') !== 'person-a' ? [] : [claim('cl-1', 'city', 'Leeds', 'verified', null), claim('cl-2', 'city', 'Paris', 'rejected', 'quote_not_found')];
            if (p.get('verdict')) items = items.filter(c => c.verdict === p.get('verdict'));
            await json({ items, nextCursor: null }); return true;
        }
        case 'GET knowledge/persons/merges': await json(k.merges.filter(m => m.intoPersonId === p.get('person') || m.fromPersonId === p.get('person'))); return true;
        case 'POST knowledge/persons/unmerge': {
            if (!await need('omniscience.sources.manage', 'sources.manage')) return true;
            const m = k.merges.find(x => x.mergeId === body.mergeId && !x.undoneAtMs);
            if (!m) { await fail(409, 'conflict', 'That merge does not exist or was already undone.'); return true; }
            m.undoneAtMs = NOW;
            await json({ mergeId: m.mergeId, undone: true }); return true;
        }
        case 'POST knowledge/persons/merge': {
            if (!await need('omniscience.sources.manage', 'sources.manage')) return true;
            if (!body.confirm) { await fail(409, 'confirmation_required', 'Merging two people needs confirm=true (it can be undone).'); return true; }
            k.merges.push({ mergeId: 8, fromPersonId: body.personB, intoPersonId: body.personA, mergedAtMs: NOW, actor: 'Klives (e2e)', reason: body.reason ?? 'manual merge', undoneAtMs: null });
            await json({ mergeId: 8, survivor: body.personA, absorbed: body.personB, changed: true, rule: body.reason ?? 'manual merge' }); return true;
        }

        // ── review ─────────────────────────────────────────────────────
        case 'GET knowledge/review': {
            const state = p.get('state') ?? 'open';
            const kind = p.get('kind');
            const items = k.review.filter(r => r.state === state && (!kind || r.kind === kind) && (!p.get('person') || r.subjectId === p.get('person')));
            items.sort((a, b) => (p.get('sort') === 'age' ? a.createdAtMs - b.createdAtMs : b.priority - a.priority));
            await json({ asOfMs: NOW, items, nextCursor: null }); return true;
        }
        case 'POST knowledge/review/resolve': {
            if (!await need('omniscience.review.act', 'review.act')) return true;
            const item = k.review.find(r => r.itemId === body.itemId);
            if (!item || item.state !== 'open') { await fail(409, 'conflict', 'That item is not open.'); return true; }
            item.state = body.state; item.resolution = body.resolution; item.resolvedAtMs = NOW; item.actor = 'Klives (e2e)';
            await json({ itemId: item.itemId, state: item.state }); return true;
        }
        case 'GET knowledge/identity-links': await json({ items: k.links.filter(l => l.verdict === (p.get('verdict') ?? 'suggested')), nextCursor: null }); return true;
        case 'POST knowledge/identity-links/decide': {
            if (!await need('omniscience.review.act', 'review.act')) return true;
            const link = k.links.find(l => l.linkId === body.linkId);
            if (!link) { await fail(404, 'not_found', 'No such link.'); return true; }
            if (body.accept && !body.confirm) { await fail(409, 'confirmation_required', 'Accepting merges the two people. Review the evidence and send confirm=true (it can be undone).'); return true; }
            if (body.accept && !await need('omniscience.sources.manage', "the 'Manage sources' permission")) return true;
            link.verdict = body.accept ? 'accepted' : 'rejected';
            link.decidedAtMs = NOW;
            link.mergeId = body.accept ? 11 : null;
            const decision: IdentityLinkDecisionDto = { link, merge: body.accept ? { mergeId: 11, survivor: link.personA, absorbed: link.personB, changed: true, rule: 'accepted link' } : null };
            await json(decision); return true;
        }
        case 'POST knowledge/identity-links/undo': {
            if (!await need('omniscience.sources.manage', 'sources.manage')) return true;
            const link = k.links.find(l => l.linkId === body.linkId && l.verdict === 'accepted');
            if (!link) { await fail(409, 'conflict', 'That suggestion has no merge to undo.'); return true; }
            link.verdict = 'suggested'; link.mergeId = null; link.decidedAtMs = null;
            await json({ linkId: link.linkId, undone: true }); return true;
        }

        // ── asking ─────────────────────────────────────────────────────
        case 'POST knowledge/ask/plan': {
            if (!await need('omniscience.tactics.run', 'tactics.run')) return true;
            const dto: AskPlanDto = { tactic: 'x01.ask_yes_no', parameters: null, restatement: `Whether it is true that: ${String(body.question).replace(/\?$/, '')}`,
                people: [{ personId: 'person-a', label: 'Synthetic Ada', detail: 'named in the question' }], reason: 'A yes-or-no question about one person.' };
            await json(dto); return true;
        }
        case 'POST knowledge/ask': {
            if (!await need('omniscience.tactics.run', 'tactics.run')) return true;
            if (!can('omniscience.persons.ask')) { await fail(403, 'forbidden', "Asking about people needs the 'Ask about people' permission."); return true; }
            if ((body.personIds ?? []).includes(MINOR)) { await fail(422, 'refused', 'Ask (yes or no) is not available for Synthetic Dee: they are, or may be, under 18 (Minor).'); return true; }
            k.asked.push({ question: body.question, personIds: body.personIds ?? null, tactic: body.tactic ?? null, standing: !!body.standing });
            const id = `iq-${k.inquiries.length + 1}`;
            const row = inquiryRow(id, String(body.question), { primarySubjectId: body.personIds?.[0] ?? 'person-a', standingId: body.standing ? 'sq-new' : null, createdAtMs: NOW });
            k.inquiries = [row, ...k.inquiries];
            if (body.standing) k.standing = [...k.standing, { questionId: 'sq-new', question: row.question, personIds: body.personIds ?? ['person-a'], enabled: true, minIntervalMs: 6 * HOUR,
                lastEvaluatedMs: NOW, lastVerdict: 'Yes', lastProbability: 0.82, pending: false, createdAtMs: NOW }];
            const tactic = body.tactic ?? (body.standing ? 'x14.standing_question' : 'x01.ask_yes_no');
            ctx.runs.unshift({
                runId: row.runId, tactic, tacticVersion: 1, actor: 'Klives (e2e)', state: 'succeeded', input: { selections: [], parameters: { question: body.question } }, asOfMs: body.asOfMs ?? null,
                currentStage: null, progress: null, error: null, parentRunId: null, playbookRunId: null, outputs: [{ kind: 'Answer', summary: 'Yes (82%)', data: report(row) }],
                createdAtMs: NOW, startedAtMs: NOW, finishedAtMs: NOW + 60_000, stale: false,
            });
            await json({ runId: row.runId, tactic }, 202); return true;
        }
        case 'GET knowledge/inquiries': {
            let items = k.inquiries;
            if (p.get('state')) items = items.filter(i => i.state === p.get('state'));
            if (p.get('standing')) items = items.filter(i => i.standingId === p.get('standing'));
            const about = (p.get('persons') ?? '').split(',').filter(Boolean), words = (p.get('q') ?? '').toLowerCase();
            if (about.length) items = items.filter(i => !!i.primarySubjectId && about.includes(i.primarySubjectId));
            if (words) items = items.filter(i => i.question.toLowerCase().includes(words));
            await json({ items, nextCursor: null }); return true;
        }
        case 'GET knowledge/inquiries/get': {
            const row = k.inquiries.find(i => i.inquiryId === p.get('id'));
            if (!row) { await fail(404, 'not_found', 'No such inquiry.'); return true; }
            await json(report(row)); return true;
        }
        case 'POST knowledge/inquiries/feedback': {
            if (!await need('omniscience.review.act', 'review.act')) return true;
            const row = k.inquiries.find(i => i.inquiryId === body.inquiryId);
            if (row) row.feedback = body.feedback;
            await json({ inquiryId: body.inquiryId, recorded: !!row }); return true;
        }
        case 'GET knowledge/standing': await json(k.standing); return true;
        case 'POST knowledge/standing/enabled': {
            if (!await need('omniscience.tactics.run', 'tactics.run')) return true;
            const q = k.standing.find(s => s.questionId === body.questionId);
            if (!q) { await fail(404, 'not_found', 'No such standing question.'); return true; }
            q.enabled = body.enabled;
            await json({ questionId: q.questionId, enabled: q.enabled }); return true;
        }

        // ── Quality Lab ────────────────────────────────────────────────
        case 'GET knowledge/quality': {
            const b: QualityLabDto = {
                asOfMs: NOW - HOUR, promptVersion: 'extract-7',
                gold: [{ scope: 'all', metric: 'precision', value: 0.94, ciLow: 0.88, ciHigh: 0.97, n: 120, promptVersion: 'extract-7', model: 'synthetic-model' },
                    { scope: 'location', metric: 'precision', value: 0.9, ciLow: 0.74, ciHigh: 0.97, n: 31, promptVersion: 'extract-7', model: 'synthetic-model' }],
                planted: [{ scope: 'literal_self', metric: 'precision', value: 0.98, ciLow: 0.9, ciHigh: 1, n: 52, promptVersion: 'extract-7', model: 'synthetic-model' },
                    { scope: 'all', metric: 'recall', value: 0.71, ciLow: 0.6, ciHigh: 0.8, n: 80, promptVersion: 'extract-7', model: 'synthetic-model' }],
                gate: { subject: 'deduction.extract', candidate: 'extract-7', baseline: 'extract-6', decision: 'pass', reasons: ['Precision is not below the baseline in any category with enough decisions.'], decidedAtMs: NOW - DAY },
            };
            await json({ model: 'knowledge.quality', key: 'lab', version: 1, schemaVersion: 1, asOfMs: NOW - HOUR, sourceSeq: 1, computedAtMs: NOW - HOUR, body: b }); return true;
        }
        case 'POST knowledge/quality/run': {
            if (!await need('omniscience.analysis.run', 'analysis.run')) return true;
            if (!['lab', 'planted'].includes(body.kind)) { await fail(400, 'bad_request', "'kind' must be lab or planted."); return true; }
            k.qualityRuns.push(body.kind);
            await json({ jobId: 7200 + k.qualityRuns.length, detail: body.kind === 'planted' ? 'Runs the real model on the synthetic planted-fact corpus in a scratch store.' : null }, 202); return true;
        }

        // ── sources and imports ────────────────────────────────────────
        case 'GET sources/discord': {
            const dto: DiscordBotStatusDto = { enabled: true, attached: true, botUserId: '100000000000000001', contentIntent: true, sourceStatus: 'active', sourceStatusDetail: null,
                eventsReceived: 48_210, eventsWritten: 47_990, eventsDropped: 0, lastEventAtMs: NOW - 60_000, lastError: null, channels: 42, channelsComplete: 30, channelsForbidden: 3, channelsGone: 1, apiRequests: 9_120 };
            await json(dto); return true;
        }
        case 'POST sources/discord/backfill': {
            if (!await need('omniscience.sources.manage', 'sources.manage')) return true;
            if (!/^\d{5,25}$/.test(String(body.channelId ?? ''))) { await fail(400, 'bad_request', "'channelId' must be a Discord channel id."); return true; }
            k.backfills.push(body.channelId);
            await json({ jobId: 7101 }, 202); return true;
        }
        case 'GET imports': await json(k.imports); return true;
        case 'POST imports/preview': {
            if (!await need('omniscience.sources.manage', 'sources.manage')) return true;
            const zone = body.options?.zone ?? null;
            k.previews.push({ name: body.name, zone });
            await json({ jobId: startJob('ingest.imports', 'preview', importPreview(body.name, zone)) }, 202); return true;
        }
        case 'PUT imports/upload': {
            if (!await need('omniscience.sources.manage', 'sources.manage')) return true;
            const name = p.get('name') ?? '';
            k.uploads.push(name);
            k.imports.inbox = [{ name, isFolder: false, bytes: 1234, modifiedAtMs: NOW }, ...k.imports.inbox];
            const dto: ImportUploadedDto = { name, bytes: 1234, previewJobId: startJob('ingest.imports', 'preview', importPreview(name, null)) };
            await json(dto, 201); return true;
        }
        case 'POST imports/commit': {
            if (!await need('omniscience.sources.manage', 'sources.manage')) return true;
            const result: ImportResult = { importId: 'im-2', format: 'whatsapp', sha256: 'cd'.repeat(32), read: 1820, inserted: 1780, updated: 0, unchanged: 40, rejected: 0, newIdentities: 1, newConversations: 1,
                attachmentsAdded: 40, attachmentsStored: 38, mediaTooLarge: 0, mediaFailed: 2, skippedRecords: 0, unreadableFiles: [], warnings: [] };
            k.imports.inbox = k.imports.inbox.filter(e => e.name !== body.name);
            k.imports.ledger = [{ importId: 'im-2', format: 'whatsapp', sha256: 'cd'.repeat(32), zone: body.options?.zone ?? null, state: 'committed', createdAtMs: NOW, committedAtMs: NOW, error: null, countsJson: JSON.stringify({ inserted: 1780 }) }, ...k.imports.ledger];
            await json({ jobId: startJob('ingest.imports', 'commit', result) }, 202); return true;
        }

        // ── images ─────────────────────────────────────────────────────
        case 'GET media/thumb': case 'GET media/file': await text(IMAGE, 'image/svg+xml'); return true;
        case 'GET media/search': {
            if (!await need('omniscience.messages.read', 'messages.read')) return true;
            const q = (p.get('q') ?? '').trim();
            if (!q) { await fail(400, 'bad_request', "Describe what to look for ('q')."); return true; }
            // The second is a photo in a direct chat on a platform with no message links, with nothing said and only what a file always has.
            let hits = [hit('m-501#0'), hit('m-502#0', { authorPersonId: 'person-b', authorName: 'Synthetic Bo', caption: 'A cat asleep on a keyboard.', tags: ['cat'], why: ['looks like it'], score: 0.016, conversationId: 'conv-dm-a',
                imageText: null, platform: 'whatsapp', conversationKind: 'dm', conversationTitle: null, guildId: null, guildName: null, messageUrl: null, messageText: null, edited: false, reactions: 0,
                position: 1, inMessage: 1, filename: 'IMG-0042.jpg', mime: 'image/jpeg', sizeBytes: 1_530_000, width: 4032, height: 3024, takenAtMs: NOW - 9 * DAY, kind: 'photo', timesPosted: 1 })];
            const asked = (name: string) => (p.get(name) ?? '').split(',').filter(Boolean);
            const keep = (ids: string[], value: string | null | undefined) => !ids.length || (!!value && ids.includes(value));
            hits = hits.filter(h => keep([...asked('persons'), ...asked('person')], h.authorPersonId) && keep([...asked('conversations'), ...asked('conversation')], h.conversationId)
                // The pickers know the synthetic server as "guild-1"; the image carries the id Discord gave it.
                && keep(asked('guilds').map(g => (g === 'guild-1' ? 'discord:800000000000000001' : g)), h.guildId) && keep(asked('kinds'), h.kind) && keep(asked('platforms'), h.platform)
                && !asked('notPersons').includes(h.authorPersonId ?? '') && (p.get('deleted') === null || String(h.deleted) === p.get('deleted')));
            const dto: MediaSearchDto = { query: q, hits, visualAvailable: true, imagesEmbedded: 1240, note: null };
            await json(dto); return true;
        }

        // ── replicas ───────────────────────────────────────────────────
        case 'GET replica/status': {
            const dto: ReplicaModuleStatusDto = { encoderModel: 'synthetic-encoder', encoderAvailable: true, assistantVoice: { modelId: 'assistant-voice', version: 2, state: 'ready', trainedAtMs: NOW - 5 * DAY, metrics: null, detail: null },
                replicas: k.replicas.length, ready: k.replicas.filter(r => r.status === 'ready').length, building: k.replicas.filter(r => r.building).length, failed: 0,
                blocked: k.replicas.filter(r => r.status === 'blocked').length, stale: k.replicas.filter(r => r.stale).length, nowMs: NOW };
            await json(dto); return true;
        }
        case 'GET replica/persons': await json({ items: k.replicas.filter(r => !p.get('status') || r.status === p.get('status')), nextCursor: null }); return true;
        case 'GET replica/person': {
            const found = card(p.get('id'));
            if (!found) { await fail(404, 'not_built', 'No replica card for this person yet: request readiness (POST replica/readiness) to compute it.'); return true; }
            await json(found); return true;
        }
        case 'POST replica/readiness': {
            if (!card(body.personId)) k.replicas.push(replicaCard(body.personId, { status: 'none', serving: null, readiness: readiness(body.personId, { tier: 'NotPossible', effective: 40, replies: 55, reason: 'Too few replies to learn from.' }) }));
            await json({ personId: body.personId, jobId: 7301 }, 202); return true;
        }
        case 'POST replica/train': {
            if (!await need('omniscience.replica.train', 'replica.train')) return true;
            const found = card(body.personId);
            if (!found) { await fail(404, 'not_found', 'No such person.'); return true; }
            if (found.status === 'blocked') { await fail(422, 'refused', 'Not available: they are, or may be, under 18.'); return true; }
            k.trained.push(body.personId);
            const next = (found.serving?.number ?? 0) + 1;
            found.status = 'building';
            found.building = version(`rv-${body.personId}-${next}`, next, { state: 'building', finishedAtMs: null, metrics: null, counts: null, createdAtMs: NOW, stages: [
                { stage: 'index', state: 'succeeded', attempts: 1, startedAtMs: NOW, finishedAtMs: NOW + 1000, detail: null, error: null, total: 2400, completed: 2400, failed: 0 },
                { stage: 'vectors', state: 'running', attempts: 1, startedAtMs: NOW + 1000, finishedAtMs: null, detail: null, error: null, total: 2400, completed: 800, failed: 0 },
                { stage: 'persona', state: 'queued', attempts: 0, startedAtMs: null, finishedAtMs: null, detail: null, error: null, total: 0, completed: 0, failed: 0 }] });
            await json({ personId: body.personId, versionId: found.building.versionId, number: next, jobId: 7302, alreadyRunning: false, readiness: found.readiness }, 202); return true;
        }
        case 'POST replica/train/cancel': {
            if (!await need('omniscience.replica.train', 'replica.train')) return true;
            const found = card(body.personId);
            const changed = !!found?.building;
            if (found) { found.building = null; found.status = found.serving ? 'ready' : 'none'; }
            await json({ changed, detail: changed ? 'The build was cancelled; the serving version is unchanged.' : 'No build was running.' }); return true;
        }
        case 'POST replica/autoretrain': {
            if (!await need('omniscience.replica.train', 'replica.train')) return true;
            const found = card(body.personId);
            if (found) found.autoRetrain = body.enabled;
            await json({ changed: true, detail: body.enabled ? 'Retrains automatically when stale.' : 'Retrains only on request.' }); return true;
        }
        case 'GET replica/versions': {
            const found = card(p.get('personId'));
            const versions = [found?.building, found?.serving, found?.serving ? version(`rv-${found.personId}-1`, 1, { state: 'retired', createdAtMs: NOW - 40 * DAY, finishedAtMs: NOW - 40 * DAY + HOUR }) : null].filter(Boolean);
            await json({ versions }); return true;
        }
        case 'GET replica/version': {
            const id = p.get('id') ?? '';
            const owner = k.replicas.find(r => id.startsWith(`rv-${r.personId}-`));
            if (!owner) { await fail(404, 'not_found', 'No such version.'); return true; }
            await json(versionDetail(owner.serving?.versionId === id ? owner.serving : version(id, Number(id.split('-').pop())), owner.personId)); return true;
        }
        case 'GET replica/evals': {
            const texts = can('omniscience.messages.read');
            let items = [evalItem('pr-1'), evalItem('pr-2', { judgeCorrect: true, generatedReply: 'synthetic: It was a very challenging climb.', embeddingSimilarity: 0.6 }), evalItem('pr-3', { split: 'shadow' })];
            if (p.get('split')) items = items.filter(e => e.split === p.get('split'));
            if (!texts) items = items.map(e => ({ ...e, stimulus: null, realReply: null }));
            await json({ items, nextCursor: null, textsIncluded: texts }); return true;
        }
        case 'GET replica/chats': {
            let items = k.chats.filter(c => (!p.get('kind') || c.kind === p.get('kind')) && (!p.get('personId') || c.personId === p.get('personId')));
            if (p.get('archived') !== 'true') items = items.filter(c => !c.archived || p.get('kind') === 'chat');
            await json({ items, nextCursor: null }); return true;
        }
        case 'GET replica/chats/messages': {
            const all = k.lines[p.get('chatId') ?? ''];
            if (!all) { await fail(404, 'not_found', 'No such chat.'); return true; }
            await json({ items: all.filter(l => l.seq > Number(p.get('cursor') ?? 0)), nextCursor: null }); return true;
        }
        case 'POST replica/chats/create': {
            if (!await need('omniscience.replica.chat', 'replica.chat')) return true;
            const chat: ReplicaChatDto = { chatId: `ch-${k.chats.length + 1}`, kind: 'chat', personId: body.personId, title: body.title ?? null, asOfMs: body.asOfMs ?? null, contextKind: body.contextKind ?? 'auto',
                addresseePersonId: null, archived: false, createdAtMs: NOW, updatedAtMs: NOW, members: [body.personId], topic: null };
            k.chats = [chat, ...k.chats];
            k.lines[chat.chatId] = [];
            await json(chat, 201); return true;
        }
        case 'POST replica/chats/update': {
            const chat = k.chats.find(c => c.chatId === body.chatId);
            if (!chat) { await fail(404, 'not_found', 'No such chat.'); return true; }
            if (typeof body.title === 'string') chat.title = body.title;
            if (typeof body.archived === 'boolean') chat.archived = body.archived;
            await json(chat); return true;
        }
        case 'POST replica/chats/delete': {
            const had = k.chats.some(c => c.chatId === body.chatId);
            k.chats = k.chats.filter(c => c.chatId !== body.chatId);
            await json({ changed: had, detail: had ? 'Deleted.' : 'No such chat.' }); return true;
        }
        case 'POST replica/chats/send': case 'POST replica/chats/regenerate': {
            if (!await need('omniscience.replica.chat', 'replica.chat')) return true;
            const all = k.lines[body.chatId];
            if (!all) { await fail(404, 'not_found', 'No such chat.'); return true; }
            const turnId = `t-${all.length + 1}`;
            const events: ReplicaStreamEventDto[] = [];
            let next = (all.at(-1)?.seq ?? 0) + 1;
            if (key.endsWith('send')) {
                const mine = chatLine(body.chatId, next++, 'user', String(body.content), { turnId, atMs: NOW });
                all.push(mine);
                events.push({ type: 'accepted', chatId: body.chatId, turnId, index: mine.seq });
            } else {
                events.push({ type: 'accepted', chatId: body.chatId, turnId });
            }
            const reply = chatLine(body.chatId, next, 'replica', key.endsWith('send') ? 'honestly yes, cant wait' : 'ok ok i am definitely coming', { turnId, atMs: NOW + 2000 });
            all.push(reply);
            events.push({ type: 'stage', chatId: body.chatId, turnId, stage: 'composing', index: 0, of: 0 }, { type: 'stage', chatId: body.chatId, turnId, stage: 'generating', index: 1, of: 4 },
                { type: 'message', chatId: body.chatId, turnId, message: reply }, { type: 'done', chatId: body.chatId, turnId });
            await lines(events); return true;
        }
        case 'POST replica/chats/cancel': await json({ changed: false, detail: 'No reply was being written.' }); return true;
        case 'POST replica/chats/rate': {
            if (![-1, 0, 1].includes(body.rating)) { await fail(400, 'bad_request', "'rating' must be -1, 0 or 1."); return true; }
            k.ratings.push({ chatId: body.chatId, seq: body.seq, rating: body.rating });
            await json({ changed: true, detail: 'Recorded as a gold label.' }); return true;
        }
        case 'POST replica/groups/create': {
            if (!await need('omniscience.replica.chat', 'replica.chat')) return true;
            if ((body.personIds ?? []).includes(MINOR)) { await fail(422, 'refused', 'Not available: Synthetic Dee is, or may be, under 18.'); return true; }
            const chat: ReplicaChatDto = { chatId: `grp-${k.chats.length + 1}`, kind: 'group_simulation', personId: 'group', title: null, asOfMs: null, contextKind: 'group_dm', addresseePersonId: null,
                archived: false, createdAtMs: NOW, updatedAtMs: NOW, members: body.personIds, topic: body.topic };
            k.chats = [chat, ...k.chats];
            k.lines[chat.chatId] = [];
            await json(chat, 201); return true;
        }
        case 'POST replica/groups/advance': case 'POST replica/groups/send': {
            const all = k.lines[body.chatId];
            const chat = k.chats.find(c => c.chatId === body.chatId);
            if (!all || !chat) { await fail(404, 'not_found', 'No such chat.'); return true; }
            const events: ReplicaStreamEventDto[] = [{ type: 'accepted', chatId: body.chatId, turnId: 'grp-run-1' }];
            let next = (all.at(-1)?.seq ?? 0) + 1;
            if (key.endsWith('send')) all.push(chatLine(body.chatId, next++, 'user', String(body.content), { atMs: NOW }));
            chat.members.slice(0, 2).forEach((member, i) => {
                const line = chatLine(body.chatId, next++, 'replica', i === 0 ? 'what about the lakes?' : 'only if someone else drives', { personId: member, speaker: NAMES[member] ?? member, atMs: NOW + 1000 * (i + 1) });
                all.push(line);
                events.push({ type: 'message', chatId: body.chatId, turnId: 'grp-run-1', message: line });
            });
            events.push({ type: 'done', chatId: body.chatId, turnId: 'grp-run-1' });
            await lines(events); return true;
        }
        case 'POST replica/blind/start': {
            if (!await need('omniscience.replica.chat', 'replica.chat')) return true;
            const session: ReplicaBlindSessionDto = { sessionId: `bl-${k.blinds.length + 1}`, personId: body.personId, versionId: `rv-${body.personId}-2`, createdAtMs: NOW + k.blinds.length * 60_000,
                answered: 0, correct: 0, accuracy: null, finishedAtMs: null, items: [
                    { index: 0, stimulus: 'synthetic: how was the climb?', optionA: 'synthetic: brutal but worth it', optionB: 'synthetic: honestly so hard, loved it tho', answered: null, correct: null },
                    { index: 1, stimulus: 'synthetic: free on friday?', optionA: 'synthetic: i think so, will check', optionB: 'synthetic: yeah should be!!', answered: null, correct: null }] };
            k.blinds.push(session);
            await json(session, 201); return true;
        }
        case 'POST replica/blind/answer': {
            if (!await need('omniscience.replica.chat', 'replica.chat')) return true;
            const session = k.blinds.find(s => s.sessionId === body.sessionId);
            if (!session) { await fail(404, 'not_found', 'Not found.'); return true; }
            const item = session.items[body.index]!;
            // The first pair's real reply is A, the second's is B. The truth is only ever sent back for an answered pair.
            const real = body.index === 0 ? 'A' : 'B';
            item.answered = body.choice; item.correct = body.choice === real;
            session.answered++; if (item.correct) session.correct++;
            session.accuracy = session.correct / session.answered;
            if (session.answered >= session.items.length) session.finishedAtMs = NOW;
            await json({ index: body.index, choice: body.choice, real, correct: item.correct, answered: session.answered, correctTotal: session.correct }); return true;
        }
        case 'GET replica/blind/session': {
            if (!await need('omniscience.replica.chat', 'replica.chat')) return true;
            const session = k.blinds.find(s => s.sessionId === p.get('id'));
            if (!session) { await fail(404, 'not_found', 'No such blind test.'); return true; }
            await json(session); return true;
        }
        case 'GET replica/blind/results': {
            // Like the server: every test of this person counts, started or finished, newest first; the five newest are sent.
            const mine = k.blinds.filter(s => s.personId === p.get('personId')).reverse();
            const answered = mine.reduce((n, s) => n + s.answered, 0), correct = mine.reduce((n, s) => n + s.correct, 0);
            await json({ personId: p.get('personId'), sessions: mine.length, answered, correct, accuracy: answered ? correct / answered : null, recent: mine.slice(0, 5) }); return true;
        }
    }
    return false;
}
