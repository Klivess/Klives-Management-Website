import { useState } from '#imports';
import { fmtCount, loadMediaUrl, q, tumblrGet, tumblrPost, type ApiResult } from '~/composables/useOmniTumblr';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

// Every export is prefixed (blox/Blox/BLOX): Nuxt auto-imports all composable exports site-wide,
// and a name shared with another composable silently resolves to the wrong one.

// ─────────────────────────────── API types (mirror OmniBloxViews.cs) ───────────────────────────────

export type BloxStage = 'Research' | 'Build' | 'Test' | 'Launch' | 'Live' | 'Sunset' | 'Abandoned';
export type BloxLevel = 'Info' | 'Success' | 'Warning' | 'Error';
export type BloxTaskKind = 'ApiKey' | 'Creator' | 'ExperienceSlot' | 'LaunchApproval' | 'UploadIcon' | 'Questionnaire' | 'Escalation' | 'Other' | 'BuildSignoff' | 'RobloxSession';

/** What the studio answered in Roblox's Maturity & Compliance questionnaire, and the rating it produced. */
export interface BloxQuestionnaire {
    Utc: string;
    QuestionnaireIds: string[];
    /** The rating is live on Roblox. */
    Published: boolean;
    /** Why the studio left it to the owner instead of publishing. */
    StoppedReason: string | null;
    AgeRating: string | null;
    MinimumAge: number | null;
    /** "Question → answer (because …)". */
    Answers: string[];
    /** Answered by the owner in the Creator Dashboard (the rating appeared without the studio answering). */
    ByOwner?: boolean;
}

/** GET /omniblox/roblox (and every connect action's answer): the owner's Roblox account (RobloxConnection.cs). Never carries the session itself. */
export interface BloxRobloxView {
    Connected: boolean;
    Account: { UserId: number; Name: string; Method: 'quick-login' | 'pasted' | string; ConnectedUtc: string; VerifiedUtc: string | null } | null;
    CreatorUserId: number | null;
    CreatorGroupId: number | null;
    /** A Quick Log In code waiting to be entered and confirmed on a signed-in device. */
    Pending: { Code: string; ExpiresUtc: string; StartedUtc: string; State: 'Created' | 'UserLinked' | 'Validated' | string; AccountName: string | null; ConfirmUrl: string } | null;
    LastError: string | null;
    /** Owner tasks that wait for the account (icon, questionnaire, sign-in, experiences). */
    Waiting: string[];
    /** Whether an API key is set, and what Roblox said about one set from the dashboard (never the key). */
    ApiKey?: { Set: boolean; Info: { Name: string; OwnerUserId: number; Scopes: string[]; ExpiresUtc: string | null; CheckedUtc: string } | null; MatchesAccount: boolean };
    /** Games still published on the account the studio switched away from. */
    OldAccountGames?: { GameId: string; Title: string; Stage: BloxStage; UniverseId: number }[];
}

/** POST /omniblox/games/action: what the owner can do to a game's place on Roblox (GameActions.cs). */
export type BloxGameAction = 'sync' | 'private' | 'public' | 'takedown' | 'move';

/** An action the owner started on a game, step by step. */
export interface BloxOwnerAction {
    Kind: BloxGameAction | 'delegate' | string;
    Title: string;
    StartedUtc: string;
    FinishedUtc: string | null;
    Running: boolean;
    Ok: boolean | null;
    Steps: string[];
    Message: string | null;
}

/** Owner tasks the studio can take over ("Do it yourself"): it does them, or hands them to the game's agent. */
export const BLOX_DELEGATABLE: ReadonlySet<BloxTaskKind> = new Set<BloxTaskKind>(['UploadIcon', 'Questionnaire', 'ExperienceSlot', 'Escalation', 'Other']);

/** Whether players can join a public game, as Roblox tells a signed-out visitor (PlayerReach.cs). */
export interface BloxReach {
    /** true: anyone with an account can join; false: Roblox shuts everyone but the creator out; null: unknown. */
    Playable: boolean | null;
    /** Roblox's playability status (GuestProhibited for a joinable game seen signed out, ContextualPlayabilityUnrated…). */
    Status: string | null;
    /** unrated, minimal, mild, moderate or restricted. */
    Maturity: string | null;
    MaturityLabel: string | null;
    CheckedUtc: string;
    SinceUtc: string | null;
    /** Why the last check could not reach Roblox (the status is then the one before). */
    Error: string | null;
}
export type BloxTaskStatus = 'Open' | 'Done' | 'Dismissed';
export type BloxProductKind = 'GamePass' | 'DeveloperProduct';

export interface BloxUsage {
    Calls: number;
    PromptTokens: number;
    CachedTokens: number;
    CompletionTokens: number;
    /** Prompt a continuation turn sent again (the previous request of its session): all of it could come from cache. */
    ResentTokens?: number;
    /** How much of ResentTokens the cache served; the gap is a prefix that expired or was rewritten. */
    ResentCachedTokens?: number;
}

export interface BloxGameSummary {
    GameId: string;
    Title: string;
    Stage: BloxStage;
    Paused: boolean;
    WaitingReason: string | null;
    NextAttemptUtc: string | null;
    Template: string | null;
    Genre: string | null;
    Pitch: string | null;
    CreatedUtc: string;
    UpdatedUtc: string;
    StageEnteredUtc: string;
    WentPublicUtc: string | null;
    IsPublic: boolean;
    PlaceId: number | null;
    UniverseId: number | null;
    BuildRevision: number;
    LastBuildOk: boolean;
    /** It has a world to play (from Build on). */
    Playable: boolean;
    TestPassed: boolean | null;
    Cycles: Partial<Record<BloxStage, number>>;
    /** Cycles in the current stage: a statistic, never a budget (there is no cycle limit). */
    StageCycles: number;
    /** The map report's score at the last build (0-100; BLOX_MAP_BAR is the bar, and any error blocks). */
    MapScore: number | null;
    TypeChecked: boolean;
    /** The newest engine run; Current means it ran on the current build, Local that it ran in the studio's local engine. */
    Engine: { Utc: string; Revision: number; Ok: boolean; Local?: boolean; Passed: number; Failed: number; KitFailed: boolean; Summary: string; Current: boolean } | null;
    OpenDirectives: number;
    Watchdog: { Level: number; Name: string; StalledCycles: number; LastProgressUtc: string | null };
    /** The cycle running now (or the last one since the server started), without its steps. */
    Live: { CycleId: string; Role: string; Running: boolean; Status: string; StartedUtc: string; LastUtc: string; Turns: number; ToolCalls: number; ToolErrors: number; ContextTokens: number } | null;
    ChecklistMet: number;
    ChecklistTotal: number;
    MilestonesDone: number;
    MilestonesTotal: number;
    Usage: BloxUsage;
    /** Whether players can join (public games, checked every 30 min); Why says why not. Null until first checked. */
    Reach: (BloxReach & { Why: string | null }) | null;
    HasIcon: boolean;
    Revenue14d: number;
    Dau7d: number;
    DauSpark: number[];
    NextMaintenanceUtc: string | null;
    UrgentMaintenance: boolean;
    Escalations: number;
    AbandonReason: string | null;
    SunsetReason: string | null;
    LastActivity: string | null;
    LastActivityUtc: string | null;
}

export interface BloxTask {
    TaskId: string;
    Kind: BloxTaskKind;
    GameId: string | null;
    Title: string;
    Detail: string;
    Status: BloxTaskStatus;
    CreatedUtc: string;
    ResolvedUtc: string | null;
    Files: string[];
    DedupeKey: string;
}

export interface BloxEvent { Utc: string; Level: BloxLevel; Kind: string; Message: string; GameId: string | null }

export interface BloxAttention { Level: 'error' | 'warning' | 'info'; Title: string; Detail: string; Action: 'studio' | 'harvester' | null }

export interface BloxLibraryStats { ByStatus: Record<string, number>; Total: number; Placeable: number; TopCategories: { Category: string; Count: number }[] }

export interface BloxOverview {
    NowUtc: string;
    Enabled: boolean;
    HarvesterEnabled: boolean;
    Status: string;
    CurrentGameId: string | null;
    Model: { Available: boolean; Reason: string | null };
    ApiKey: boolean;
    CreatorSet: boolean;
    Slots: { Total: number; Free: number };
    RequireLaunchApproval: boolean;
    RequireBuildSignoff?: boolean;
    MaxGamesInProduction: number;
    Attention: BloxAttention[];
    StageCounts: Record<BloxStage, number>;
    Games: BloxGameSummary[];
    OwnerTasks: BloxTask[];
    Library: BloxLibraryStats;
    Harvester: {
        Discovered: number;
        Downloaded: number;
        Labeled: number;
        /** Labels from before the calibrated quality scale, re-rated against its anchors. */
        Relabeled?: number;
        LastRunUtc: string | null;
        LastError: string | null;
        PriorityQueries: string[];
        Last: string | null;
        LastHarvestUtc: string | null;
    };
    Usage: {
        Today: BloxUsage;
        Week: BloxUsage;
        /** Week's agent cycles (and their one-shot reviews), recorded since the split existed. */
        WeekAgents?: BloxUsage;
        /** Week's asset labelling (one-shot vision calls), recorded since the split existed. */
        WeekLabeler?: BloxUsage;
        Labeler: BloxUsage;
        /**
         * The labeller's frozen reference examples: models scored side by side, kept at four levels of that
         * calibrated scale (Anchors, best first) so every label is judged against the same comparisons.
         */
        LabelerReference?: { Version: number; CreatedUtc: string; Examples: number; Anchors?: number[] } | null;
        Daily: (BloxUsage & { Day: string })[];
    };
    Money: { Spent: number; Revenue7dRobux: number; Revenue30dRobux: number; DevExRate: number; Cash30dEstimateUsd: number };
    Daily: { Day: string; Robux: number; Players: number; Visits: number }[];
    GamesLaunched: number;
    PlaybookLessons: number;
    Events: BloxEvent[];
}

export interface BloxScores { Demand: number; Competition: number; Monetization: number; Feasibility: number; Lessons: number; Total: number }
export interface BloxConcept { ConceptId: string; Pitch: string; Genre: string; Template: string; CoreLoop: string; Twist: string; Evidence: string[]; Scores: BloxScores; Chosen: boolean }
export interface BloxProductIdea { Key: string; Kind: BloxProductKind; Name: string; Description: string; PriceRobux: number; Grant: string }
export interface BloxBrief {
    Title: string;
    Genre: string;
    Template: string;
    Pitch: string;
    TargetPlayers: string;
    CoreLoop: string;
    MustHave: string[];
    NiceToHave: string[];
    ArtStyle: string;
    AssetNeeds: string[];
    Monetization: BloxProductIdea[];
    Marketing: { TitleIdeas: string[]; ThumbnailIdeas: string[]; Keywords: string[]; Hook: string };
    DoneWhen: string[];
    Evidence: string[];
}
export interface BloxMilestone { MilestoneId: string; Title: string; Done: boolean; Notes: string | null }
/** Severity: error, warning or info. */
export interface BloxTestIssue { Severity: string; Area: string; Message: string }

/** One check of an engine run. Phase: kit (the kit's own control, before game code), load, boot, world, game, run. */
export interface BloxEngineCase { Name: string; Ok: boolean; Detail: string | null; Phase: string; Owner: string; Seconds: number; Skipped: boolean; Warnings: string[] }
/** A runtime error while the game ran, located in the game's files when possible. */
export interface BloxEngineError { Message: string; Source: string | null; Trace: string | null; Phase: string; File: string | null; Line: number | null }
/** The game run in Roblox's real engine (run_tests, the Test stage or a launch), or in the studio's local engine standing in for it. */
export interface BloxEngineRun {
    Utc: string;
    Revision: number;
    Ran: boolean;
    Ok: boolean;
    /** It ran in the local engine (Lune; no physics, replication or clients) because Roblox's could not run the game yet. */
    Local?: boolean;
    Version: number | null;
    Passed: number;
    Failed: number;
    /** The kit's own control checks failed: the studio's bug, not the game's. */
    KitFailed: boolean;
    Summary: string;
    Results: BloxEngineCase[];
    Errors: BloxEngineError[];
    Warnings: string[];
}

export interface BloxTestReport {
    Utc: string;
    BuildRevision: number;
    Passed: boolean;
    StaticOk: boolean;
    GeometryOk: boolean;
    EngineRan: boolean;
    EngineOk: boolean;
    EngineVersion: number | null;
    Issues: BloxTestIssue[];
    Summary: string;
    /** The run learned nothing about the game (Roblox or the model unreachable); it is retried. */
    Infrastructure?: boolean;
    Engine?: BloxEngineRun | null;
    MapScore?: number | null;
}

/** A kept fact: a fact with a key replaces the older one with that key. Source: agent, owner or studio. */
export interface BloxKeyFact { Key: string; Text: string; Utc: string; Stage: BloxStage | null; Source: 'agent' | 'owner' | 'studio' | string }

export type BloxDirectiveStatus = 'Open' | 'Done' | 'Dropped';
/** A direction from the owner: delivered to a running cycle, at the top of every briefing until an agent reports it done. */
export interface BloxDirective { DirectiveId: string; Utc: string; Text: string; Status: BloxDirectiveStatus; Response: string | null; ResolvedUtc: string | null; Delivered: boolean }

/** The watchdog: whether the game is moving. Level 0 moving, 1 rethink, 2 deep dive, 3 waiting for the owner. */
export interface BloxProgress {
    StalledCycles: number;
    LastFailureSignature: string | null;
    SameFailureCount: number;
    LastProgressUtc: string | null;
    Level: number;
    Directive: string | null;
    History: string[];
}

/** One step of a cycle. Kind: text (the agent's words), call, result, note. Images are file names in the cycle's folder. */
export interface BloxLiveEntry { Utc: string; Kind: 'text' | 'call' | 'result' | 'note' | string; Tool: string | null; Text: string; Error: boolean; Images: string[] }
export interface BloxLiveCycle {
    CycleId: string;
    GameId: string;
    Role: string;
    Stage: BloxStage;
    StartedUtc: string;
    LastUtc: string;
    Running: boolean;
    Outcome: string | null;
    Status: string;
    Turns: number;
    ToolCalls: number;
    ToolErrors: number;
    PromptTokens: number;
    CachedTokens: number;
    CompletionTokens: number;
    ContextTokens: number;
    Entries: BloxLiveEntry[];
}

/** GET /omniblox/game/map: the map report on the game's current files. */
export interface BloxMapReport {
    Score: number;
    AreaWidth: number;
    AreaDepth: number;
    Objects: number;
    DistinctModels: number;
    DressedShare: number;
    /** Which rubric scored it: an open map (hub and zones), an obby course or tycoon plots. */
    Kind?: 'open' | 'obby' | 'tycoon' | string;
    /** Any error caps the score and blocks the Build stage. */
    Blocked?: boolean;
    /** The score the Build stage needs. */
    Bar?: number;
    Categories?: { Name: string; Score: number; Max: number; Note: string }[];
    Findings: { Severity: 'error' | 'warning' | 'info' | string; Area: string; Message: string }[];
    Facts: string[];
    Zones: { Id: string; Name: string; Purpose: string; Area: number[]; Order: number; Theme: string }[];
    Landmarks: { Name: string; Position: number[]; ObjectId: string | null; Note: string }[];
    Concept: string;
    Bounds: number[] | null;
    Terrain: { OriginX: number; OriginZ: number; MaxX: number; MaxZ: number; Biome: string | null } | null;
    Compiled: boolean;
    Errors: string[];
}
export interface BloxProduct extends BloxProductIdea { RobloxId: number | null; SyncedUtc: string | null }
export interface BloxDailyMetrics {
    Date: string;
    DailyActiveUsers: number | null;
    Visits: number | null;
    PlayHours: number | null;
    AvgSessionMinutes: number | null;
    RevenueRobux: number | null;
    PayingUsers: number | null;
    D1Retention: number | null;
    D7Retention: number | null;
    PeakConcurrent: number | null;
    /** People Roblox showed the game's tile to, and people who clicked it. */
    Impressions?: number | null;
    Clicks?: number | null;
    /** Clicks ÷ impressions (a fraction). */
    ClickThrough: number | null;
}
export interface BloxCycle {
    /** Names the cycle's full log (GET /omniblox/game/cycle) while it is kept. Empty for cycles from before logs. */
    CycleId?: string;
    StartedUtc?: string | null;
    Utc: string;
    Stage: BloxStage;
    Role: string;
    /** finished, handed over (its context filled), cut short, error. */
    Outcome: string;
    Done: string;
    Decisions: string[];
    Problems: string[];
    NextSteps: string[];
    Turns: number;
    ToolCalls?: number;
    ToolErrors?: number;
    /** Replies cut off by the output limit (their tool calls were not run). */
    Truncations?: number;
    Error?: string | null;
    PromptTokens: number;
    CachedTokens: number;
    CompletionTokens: number;
}

/** A playtest build sent to Roblox (PlaytestPublish in OmniBloxModels.cs). */
export interface BloxPlaytestPublish {
    Utc: string;
    UniverseId: number;
    PlaceId: number;
    Version: number;
    /** "r12" is the clean build r12, "r12+" the files past it, "wip" before the first clean build. */
    Build: string;
    Revision: number;
    /** The game's own experience (private until launch) rather than the studio's playtest experience. */
    OwnExperience: boolean;
    Fingerprint: string;
    /** Published by Follow after a clean build. */
    Followed: boolean;
    ServersRestarted: boolean;
    Note: string | null;
}

/** One playtest server: a Roblox server or one run in Studio. */
export interface BloxPlaytestSession {
    Server: string;
    Where: 'roblox' | 'studio';
    Build: string;
    StartedUtc: string;
    LastEventUtc: string;
    Players: number;
    Joins: number;
    PlayedSeconds: number;
    Events: number;
    Deaths: number;
    FurthestStep: number | null;
    FurthestStepName: string | null;
    Completed: boolean;
    Earned: number;
    Actions: Record<string, number>;
    TestPurchases: string[];
    Errors: { Message: string; Source: string | null; Count: number }[];
    Feedback: { Utc: string; Rating: number; Reason: string }[];
}

/** How the owner can play the game now (OmniBloxViews.Playtest). */
export interface BloxPlaytestView {
    Playable: boolean;
    Roblox: { Available: boolean; OwnExperience: boolean; UniverseId: number | null; PlaceId: number | null; Reason: string | null };
    /** The last build sent to Roblox is still what its experience runs. */
    InExperience: boolean;
    JoinUrl: string | null;
    /** Another game the playtest experience runs now (playing this one replaces it). */
    OtherGame: { GameId: string; Title: string; Build: string } | null;
    /** Someone is in this game's Roblox playtest now. */
    Playing: boolean;
}

/** POST /omniblox/games/playtest. */
export interface BloxPlaytestResult {
    ok: boolean;
    build: string;
    version: number;
    reused: boolean;
    joinUrl: string;
    gameUrl: string;
    universeId: number;
    placeId: number;
    ownExperience: boolean;
    serversRestarted: boolean;
    warnings: string[];
}

export interface BloxDossier {
    GameId: string;
    WorkingTitle: string;
    Stage: BloxStage;
    CreatedUtc: string;
    UpdatedUtc: string;
    StageEnteredUtc: string;
    WaitingReason: string | null;
    Paused: boolean;
    Concepts: BloxConcept[];
    Brief: BloxBrief | null;
    Research: { LastScanUtc: string | null; Findings: string[]; ReferenceUniverses: number[] };
    Milestones: BloxMilestone[];
    Build: {
        Revision: number;
        LastBuildUtc: string | null;
        LastBuildOk: boolean;
        PlaceBytes: number;
        InstanceCount: number;
        ScriptCount: number;
        Errors: string[];
        Warnings: string[];
        FeatureComplete: boolean;
        AssetsUsed: number[];
        TypeChecked?: boolean;
        TypeCheckNote?: string | null;
        MapScore?: number | null;
        /** "[error] area: …" / "[warning] area: …" lines from the map report at the last build. */
        MapFindings?: string[];
        /** A simulator's economy check at the last build: a bot's timeline playing the game's own numbers on its map. */
        Economy?: string | null;
        /** "[error] economy: …" lines (a wall, a slow first purchase); empty when the pacing is healthy. */
        EconomyFindings?: string[];
        LastEngineRun?: BloxEngineRun | null;
    };
    LastTest: BloxTestReport | null;
    Slot: { UniverseId: number; PlaceId: number } | null;
    Store: {
        Title: string;
        Description: string;
        Genre: string;
        Keywords: string[];
        IconFile: string | null;
        ThumbnailFiles: string[];
        TrailerFile: string | null;
        Applied: boolean;
        ComplianceOk: boolean | null;
        ComplianceNotes: string[];
    };
    Products: BloxProduct[];
    Playtest: {
        Follow: boolean;
        SaveSlot: number;
        LastPublish: BloxPlaytestPublish | null;
        /** Newest last. */
        Sessions: BloxPlaytestSession[];
    };
    Publish: {
        LastSavedVersion: number | null;
        LastPublishedVersion: number | null;
        LastPublishedRevision: number | null;
        FirstPublishedUtc: string | null;
        LastPublishedUtc: string | null;
        IsPublic: boolean;
        LaunchRequestedUtc: string | null;
        LaunchApprovedUtc: string | null;
        /** The revision the owner played and signed off (the build gate). */
        SignoffRevision?: number | null;
        SignoffUtc?: string | null;
        /** The revision (and store page + products) the launch approval covers. */
        ApprovedRevision?: number | null;
        Approvals?: BloxApproval[];
        LaunchFailures?: number;
        WentPublicUtc: string | null;
        EngineTestedRevision: number | null;
        LastLaunchStep: string | null;
        LastLaunchError: string | null;
        /** The icon the studio put on Roblox through the owner's session (by content hash). */
        IconUploadedHash?: string | null;
        IconUploadedUtc?: string | null;
        /** Store thumbnails still owed through the session (the homepage-thumbnail API refused them). */
        StoreThumbnailsPending?: boolean;
        StoreThumbnailsUploaded?: number;
        /** The newest answering of Roblox's maturity questionnaire. */
        Questionnaire?: BloxQuestionnaire | null;
        /** Whether players can join, as Roblox reports it. */
        Reach?: BloxReach | null;
        /** Its experience is on the Roblox account the studio switched away from (move it to put it on the new one). */
        OnOldAccount?: boolean;
    };
    /** The newest action the owner started on the game (update on Roblox, take down, move…). */
    OwnerAction?: BloxOwnerAction | null;
    Stats: {
        LastSyncUtc: string | null;
        LastSyncError: string | null;
        Daily: BloxDailyMetrics[];
        Telemetry: { Events: number; Sessions: number; Errors: number; Purchases: number; Feedback: number; LastEventUtc: string | null };
    };
    Maintenance: { Utc: string; Summary: string; Actions: string[]; ShippedUpdate: boolean; Urgent: boolean }[];
    NextMaintenanceUtc: string | null;
    PostMortems: { Utc: string; DaysSinceLaunch: number; WorkedWell: string; DidNotWork: string; Lessons: string[] }[];
    PendingUpdateNotes: string | null;
    SunsetReason: string | null;
    UrgentMaintenance: boolean;
    Cycles: BloxCycle[];
    Decisions: { Utc: string; Stage: BloxStage; What: string; Why: string }[];
    KeyFacts: BloxKeyFact[];
    Directives: BloxDirective[];
    StageFailures: Partial<Record<BloxStage, number>>;
    StageCycles: Partial<Record<BloxStage, number>>;
    Usage: BloxUsage;
    NextAttemptUtc: string | null;
    Escalations: number;
    AbandonReason: string | null;
    /** Where an abandoned game stopped (Revive brings it back there; Test and Launch go back to Build). */
    AbandonedFromStage?: BloxStage | null;
    Progress: BloxProgress;
    /** Model or provider failures in a row: they back off and never count against the game. */
    ProviderFailures?: number;
}

export interface BloxCriterion { Text: string; Met: boolean }

export type BloxGate = 'build' | 'launch';
export interface BloxApproval { Gate: BloxGate; Decision: 'approved' | 'changes'; Note: string; Revision: number; Utc: string }

/**
 * The owner's two gates on the way to players: play and sign off the tested build (before any marketing), then
 * approve the launch (this build, store page and products) before anything happens on Roblox.
 */
export interface BloxGates {
    RequireBuildSignoff: boolean;
    RequireLaunchApproval: boolean;
    /** The gate the game is stopped at now, if any. */
    Waiting: BloxGate | null;
    Revision: number;
    SignoffRevision: number | null;
    SignoffUtc: string | null;
    LaunchApproved: boolean;
    ApprovedRevision: number | null;
    LaunchApprovedUtc: string | null;
    /** Newest first. */
    History: BloxApproval[];
}

export interface BloxGameDetail {
    Game: BloxDossier;
    Summary: BloxGameSummary;
    Goal: string;
    Checklist: BloxCriterion[];
    OwnerTasks: BloxTask[];
    Revisions: number[];
    Media: string[];
    Playtest: BloxPlaytestView;
    /** The cycle running now (or the last one since the server started), step by step. */
    Live: BloxLiveCycle | null;
    /** Cycles whose full log is still kept, newest first. */
    CycleLogs: string[];
    /** A Roblox API key and an experience slot exist, so the game can run in the engine here. */
    EngineAvailable: boolean;
    /** Roblox's engine cannot run it yet and the studio's local engine stands in (run_tests and Run locally use it). */
    LocalEngine?: boolean;
    Approvals?: BloxGates;
    Watchdog: {
        Level: number;
        Name: string;
        StalledCycles: number;
        SameFailureCount: number;
        LastFailureSignature: string | null;
        LastProgressUtc: string | null;
        Directive: string | null;
        History: string[];
        Ladder: string[];
    };
}

/** GET /omniblox/game/cycle: one past cycle's full log. */
export interface BloxCycleLog { CycleId: string; Report: BloxCycle | null; Entries: BloxLiveEntry[] }

export interface BloxTelemetry {
    Days: number;
    Events: number;
    Sessions: number;
    AvgSessionSeconds: number;
    MedianSessionSeconds: number;
    DeathsPerSession: number;
    Purchases: number;
    PurchaseRobux: number;
    PurchasesByKey: Record<string, number>;
    FeedbackByRating: Record<string, number>;
    FeedbackByReason: Record<string, number>;
    TopErrors: { Message: string; Count: number }[];
    Funnel: Record<string, number>;
    SessionsByDay: Record<string, number>;
    PeakPlayersPerServer: number;
    LastEventUtc: string | null;
}

export interface BloxFile { Path: string; Bytes: number; ModifiedUtc: string }

export interface BloxAssetLabel {
    What: string;
    Category: string;
    Subcategory: string;
    Style: string;
    Themes: string[];
    Description: string;
    GoodFor: string[];
    PairsWith: string[];
    FrontYaw: number;
    Walkable: boolean;
    Quality: number;
    Issues: string[];
    Model: string;
}

export interface BloxColorShare { Hex: string; Name: string; Share: number }

export interface BloxAsset {
    AssetId: number;
    Name: string;
    CreatorName: string;
    CreatorVerified: boolean;
    Status: string;
    StatusReason: string | null;
    Placeable: boolean;
    UpVotes: number;
    UpVotePercent: number;
    HasScripts: boolean;
    ScriptsRemoved: number;
    ScriptFlags: string[];
    Triangles: number;
    HasThumbnail: boolean;
    Renders: string[];
    TimesUsed: number;
    DiscoveredQuery: string;
    Size: [number, number, number] | null;
    Colors: BloxColorShare[] | null;
    Materials: { Material: string; Share: number }[] | null;
    Proportions: string | null;
    PerformanceCost: string | null;
    Label: BloxAssetLabel | null;
    Summary: string;
    DiscoveredUtc: string;
    AnalyzedUtc: string | null;
    LabeledUtc: string | null;
}

export interface BloxAssetDetail {
    Asset: BloxAsset;
    Description: string;
    Measurements: {
        SizeX: number;
        SizeY: number;
        SizeZ: number;
        Pivot: number[];
        PartCount: number;
        MeshPartCount: number;
        InstanceCount: number;
        LightCount: number;
        SoundCount: number;
        ParticleCount: number;
        DecalCount: number;
        HasHumanoid: boolean;
        HasSeat: boolean;
        HasTool: boolean;
        Anchored: string;
        TexturedShare: number;
        ClassCounts: Record<string, number>;
    } | null;
    UsageNotes: string[];
}

export interface BloxLesson {
    LessonId: string;
    Utc: string;
    GameId: string | null;
    Topic: string;
    Text: string;
    Evidence: string;
    Outcome: 'worked' | 'failed' | 'neutral';
    Confidence: number;
    Tags: string[];
    TimesUsed: number;
}

// ─────────────────────────────── API ───────────────────────────────

export const bloxGet = <T>(path: string): Promise<ApiResult<T>> => tumblrGet<T>(path);
export const bloxPost = <T = { ok: boolean }>(path: string, body: unknown = {}): Promise<ApiResult<T>> => tumblrPost<T>(path, body);

/** `v` only changes the cache key, so a re-made icon or a new build is fetched again. */
export const bloxMediaPath = (gameId: string, file: string, v?: string | number | null) => `/omniblox/game/media${q({ id: gameId, file, v })}`;
/** A picture of the world: view = map, overview, aerial, iso, spawn, zone:<id> or an object id; `v` (the last build's time) refreshes it. */
export const bloxRenderPath = (gameId: string, view: string, v?: string | number | null, labels = false) =>
    `/omniblox/game/render${q({ id: gameId, view, v, labels: labels ? 1 : undefined })}`;
/** A picture an agent looked at (or made) during a cycle. */
export const bloxCycleImagePath = (gameId: string, cycleId: string, file: string) => `/omniblox/game/cycle/image${q({ id: gameId, cycle: cycleId, file })}`;
export const bloxAssetImagePath = (assetId: number, view = 'thumb') => `/omniblox/asset/image${q({ id: assetId, view })}`;

/** Saves an authenticated file (e.g. the icon the owner uploads by hand) under a readable name. */
export async function bloxDownload(path: string, fileName: string): Promise<boolean> {
    const url = await loadMediaUrl(path);
    if (!url) return false;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
}

/** A game's page with its Play panel open. */
export const bloxPlayPath = (gameId: string) => `/schemery/omniblox/game/${gameId}?play=1`;

export type BloxPlaceDownload =
    | { ok: true; build: string; note: string | null; fileName: string }
    | { ok: false; error: string };

/**
 * Saves a playtest build as a place file for Roblox Studio. `build` is "latest" or a revision ("r12"); the
 * answer says which build it was (latest falls back to the last clean build when the files do not compile,
 * and the note says so).
 */
export async function bloxDownloadPlace(gameId: string, build: string): Promise<BloxPlaceDownload> {
    const response = await RequestGETFromKliveAPI(`/omniblox/game/place${q({ id: gameId, build })}`, false, false);
    if (!response.ok) {
        let error = `Request failed (${response.status})`;
        try {
            const body = await response.json();
            if (typeof body?.error === 'string') error = body.error;
        } catch { /* not JSON */ }
        return { ok: false, error };
    }
    const label = response.headers.get('X-OmniBlox-Build') ?? build;
    const rawNote = response.headers.get('X-OmniBlox-Note');
    let note: string | null = null;
    if (rawNote) {
        try { note = decodeURIComponent(rawNote); } catch { note = rawNote; }
    }
    const fileName = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? `${gameId} ${label}.rbxlx`;
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { ok: true, build: label, note, fileName };
}

/** One overview fetch shared by the shell (status, nav) and the pages, so nothing double-polls. */
export function useBloxOverview() {
    const overview = useState<BloxOverview | null>('omniblox:overview', () => null);
    const error = useState<string | null>('omniblox:overview-error', () => null);
    const loading = useState<boolean>('omniblox:overview-loading', () => false);
    const loadedAt = useState<number | null>('omniblox:overview-at', () => null);

    async function refresh() {
        if (loading.value) return;
        loading.value = true;
        try {
            const result = await bloxGet<BloxOverview>('/omniblox/overview');
            if (result.ok && result.data) {
                overview.value = result.data;
                error.value = null;
                loadedAt.value = Date.now();
            } else {
                error.value = result.error;
            }
        } finally {
            loading.value = false;
        }
    }

    return { overview, error, loading, loadedAt, refresh };
}

// ─────────────────────────────── Vocabulary and formatting ───────────────────────────────

/** The production line, in order (Sunset and Abandoned are exits, not steps). */
export const BLOX_STAGES: BloxStage[] = ['Research', 'Build', 'Test', 'Launch', 'Live'];

export function bloxStageTone(stage: BloxStage): string {
    switch (stage) {
        case 'Live': return 'ok';
        case 'Launch': return 'warn';
        case 'Abandoned': return 'bad';
        case 'Sunset': return '';
        case 'Test': return 'violet';
        default: return 'info';
    }
}

/** The watchdog's ladder: 1 rethink and 2 deep dive are warnings, 3 (paused, waiting for the owner) is bad. */
export function bloxWatchdogTone(level: number): string {
    return level >= 3 ? 'bad' : level >= 1 ? 'warn' : 'ok';
}

/** Dot colour for a game in lists: what state it is in, not which stage. */
export function bloxGameDot(g: Pick<BloxGameSummary, 'Stage' | 'Paused' | 'WaitingReason' | 'UrgentMaintenance' | 'LastBuildOk' | 'BuildRevision'>): string {
    if (g.Stage === 'Abandoned') return 'bad';
    if (g.Stage === 'Sunset' || g.Paused) return '';
    if (g.UrgentMaintenance) return 'bad';
    if (g.WaitingReason) return 'warn';
    if (g.Stage === 'Build' && g.BuildRevision > 0 && !g.LastBuildOk) return 'warn';
    return 'ok';
}

export function bloxLevelTone(level: BloxLevel | BloxAttention['Level']): string {
    switch (level) {
        case 'Success': return 'ok';
        case 'Warning': case 'warning': return 'warn';
        case 'Error': case 'error': return 'bad';
        default: return '';
    }
}

export const BLOX_TASK_LABEL: Record<BloxTaskKind, string> = {
    ApiKey: 'API key',
    Creator: 'Creator',
    ExperienceSlot: 'Experience slot',
    LaunchApproval: 'Launch approval',
    UploadIcon: 'Upload',
    Questionnaire: 'Questionnaire',
    Escalation: 'Escalation',
    Other: 'Task',
    BuildSignoff: 'Build sign-off',
    RobloxSession: 'Roblox sign-in',
};

/** The owner gates are approved from the game (games/approve, games/reject), never marked "done". */
export const bloxIsGateTask = (kind: BloxTaskKind) => kind === 'LaunchApproval' || kind === 'BuildSignoff';

/** The map score the Build stage needs (MapReport.Bar); a map report says its own Bar. */
export const BLOX_MAP_BAR = 75;

/** The in-game feedback button's scale and reasons (GameKit Feedback.luau / Client HUD). */
export const BLOX_RATING_LABEL: Record<string, string> = { 1: 'Bad', 2: 'Okay', 3: 'Great' };
export const BLOX_REASON_LABEL: Record<string, string> = {
    fun: "It's fun", want_more: 'Want more', too_hard: 'Too hard', too_easy: 'Too easy',
    boring: 'Boring', confusing: 'Confusing', bug: 'Found a bug', laggy: 'Laggy',
};

export function bloxRobux(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return `R$ ${fmtCount(Math.round(value))}`;
}

export function bloxTokens(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return fmtCount(value);
}

/** Share of prompt tokens served from the cache (AIRouter's fair-use measure); null without traffic. */
export function bloxCacheRate(usage: BloxUsage | null | undefined): number | null {
    if (!usage || usage.PromptTokens <= 0) return null;
    return usage.CachedTokens / usage.PromptTokens;
}

/**
 * Share of re-sent prompt (a turn's earlier turns, sent again) that came from the cache. 100% means nothing
 * was prefilled twice; what the hit rate still misses is new content no cache can serve. Null when nothing
 * was re-sent yet.
 */
export function bloxReuseRate(usage: BloxUsage | null | undefined): number | null {
    const resent = usage?.ResentTokens ?? 0;
    if (!usage || resent <= 0) return null;
    return (usage.ResentCachedTokens ?? 0) / resent;
}

/** 0.213 → "21%"; values already in percent (> 1) are shown as they are. */
export function bloxPct(value: number | null | undefined, digits = 0): string {
    if (value == null || !Number.isFinite(value)) return '—';
    const pct = value <= 1 ? value * 100 : value;
    return `${pct.toFixed(digits)}%`;
}

export function bloxSeconds(seconds: number | null | undefined): string {
    if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '—';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

export function bloxBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function bloxSize(size: [number, number, number] | number[] | null | undefined): string {
    if (!size || size.length < 3) return '—';
    const f = (v: number) => (Math.round(v * 10) / 10).toString();
    return `${f(size[0])} × ${f(size[1])} × ${f(size[2])}`;
}

export const bloxRobloxGameUrl = (placeId: number) => `https://www.roblox.com/games/${placeId}`;
export const bloxCreatorStoreUrl = (assetId: number) => `https://create.roblox.com/store/asset/${assetId}`;
