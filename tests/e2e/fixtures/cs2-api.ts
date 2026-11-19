import type { Page, Route } from '@playwright/test';
import { dashboardTestOrigin, installDashboardApiMock, type DashboardRole } from './dashboard-api';

/**
 * A stateful stand-in for /cs2arbitragebot/*, shaped like the live payloads of 2026-11-13 (status, compact analytics,
 * opportunities, cycles, plan, balance history). Every item name is a real CS2 market name, but every id, price, date
 * and balance is invented. Actions (scan, Steam login, relist check, close by hand) change the state, so a test can
 * press a button and watch the page agree with what the server now says.
 *
 * Scenarios: 'normal' (the live situation: buying off, Steam login dead, one stuck relist), 'legacy' (a server from
 * before this page: no new routes or fields), 'starting' (the bot is still loading; gated routes answer 503).
 */

export type Cs2Scenario = 'normal' | 'legacy' | 'starting';

export interface Cs2ApiMock {
  requestedPaths: string[];
  batchCalls: string[][];
  posts: Array<{ path: string; body: any }>;
  state: { loginPromptOpen: boolean };
}

const H = 3_600_000;
const D = 24 * H;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page',
};

async function fulfil(route: Route, payload: unknown, status = 200) {
  await route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload) });
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function installCs2ApiMock(page: Page, options: { scenario?: Cs2Scenario; role?: DashboardRole } = {}): Promise<Cs2ApiMock> {
  const scenario = options.scenario ?? 'normal';
  const legacy = scenario === 'legacy';
  const now = Date.now();
  const iso = (offset: number) => new Date(now + offset).toISOString();
  const mock: Cs2ApiMock = { requestedPaths: [], batchCalls: [], posts: [], state: { loginPromptOpen: false } };

  const relistDecision = {
    AtUtc: iso(-9 * D), Stage: 'review', Action: 'keep', Route: 'CSFloatRelist', Price: 294, ExpectedDaysToSell: 4.9, SellProbability: 0.79,
    CertaintyEquivalentPence: 203.3, SteamCertaintyEquivalentPence: 205.1, RelistCertaintyEquivalentPence: 204.8, SalesPerDay: 3.73,
    SalesRateBasis: 'CSFloat daily sales, last 30 days', MedianValueRatio: 0.976, DemandMultiplier: 0.068, DaysUntilTradable: 0,
    Rationale: 'keep the listing: the best alternative (Steam at £2.69 → £2.14 after fees, conversion and the converters\' 7-day hold, cash in ~15d, worth £2.05 now) gains only £0.02',
  };

  // ── positions (compact analytics shape) ──
  const stuck: any = {
    CSFloatListingID: 'buy-stuck', ItemMarketHashName: 'Sticker | Censored (Foil)', CurrentStrategicStage: 9, PlannedExit: 'CSFloatRelist',
    TimeOfPurchase: iso(-39 * D), TimeOfItemRetrieval: iso(-38 * D), PredictedTimeToBeResoldOnSteam: iso(-31 * D), PurchaseCostPence: 179, PurchasePriceCents: 236,
    ExpectedAbsoluteProfitInPounds: 0.26, ExpectedProfitPercentage: 14.5, ExpectedNetCashPence: 205, LastTradeState: 'pending',
    CSFloatResaleListingID: 'relist-stuck', CSFloatResalePriceCents: 294, ListedOnCSFloatAtUtc: iso(-25.4 * D), RelistBaseDaysToSell: 0.28,
    RelistModelExposure: 54.4, RelistTotalExposure: 54.4, RelistRepriceCount: 0, NextExitReviewUtc: iso(30 * 60_000),
    ExitHistory: [relistDecision], ExitHistoryCount: 4, Notes: '',
    comparison: { CSFloatURL: 'https://csfloat.com/item/buy-stuck', CSFloatListing: { PriceText: '£1.79', PriceInPounds: 1.79, ImageURL: '' } },
  };
  const locked: any = {
    CSFloatListingID: 'buy-locked', ItemMarketHashName: 'Sticker | Vitality (Holo) | Austin 2025', CurrentStrategicStage: 3, PlannedExit: 'CSFloatRelist',
    TimeOfPurchase: iso(-4 * D), TimeOfItemRetrieval: iso(-4 * D + H), PredictedTimeToBeResoldOnSteam: iso(3 * D + 5 * H), PurchaseCostPence: 52,
    ExpectedAbsoluteProfitInPounds: 0.11, ExpectedProfitPercentage: 21, ExitHistory: [],
    PurchasePlan: { ...relistDecision, AtUtc: iso(-4 * D), Stage: 'purchase', Action: 'buy', Price: 92, Rationale: 'CSFloat at $0.92 → ~1.9d to sell, 95% within the horizon, worth £0.63 now' },
  };
  const done = (id: string, name: string, cost: number, profit: number, daysAgo: number, extra: object = {}) => ({
    CSFloatListingID: id, ItemMarketHashName: name, CurrentStrategicStage: 7, PlannedExit: 'CSFloatRelist', PurchaseCostPence: cost,
    TimeOfPurchase: iso(-(daysAgo + 12) * D), TimeOfCollectedRevenue: iso(-daysAgo * D), ResaleSoldAtUtc: iso(-(daysAgo + 1) * D),
    ActualAbsoluteProfitInPounds: profit, ActualProfitPercentage: (profit / (cost / 100)) * 100, CSFloatResalePriceCents: Math.round(cost * 1.5),
    LastTradeState: 'resale:verified', ExitHistory: [], ...extra,
  });
  const purchases: any[] = [
    stuck, locked,
    done('buy-aug', 'AUG | Torque (Factory New)', 408, 0.33, 30),
    done('buy-p250', 'P250 | Contamination (Factory New)', 371, -0.3, 30),
    done('buy-hl', 'Budapest 2025 Ancient Souvenir Highlight', 204, 0.37, 27),
    { CSFloatListingID: 'buy-gone', ItemMarketHashName: 'Gamma 2 Case', CurrentStrategicStage: 10, PlannedExit: 'SteamMarket', PurchaseCostPence: 197, TimeOfPurchase: iso(-35 * D), ExitHistory: [] },
    { CSFloatListingID: 'buy-cancel', ItemMarketHashName: 'Spectrum 2 Case', CurrentStrategicStage: 8, PlannedExit: 'SteamMarket', PurchaseCostPence: 200, TimeOfPurchase: iso(-35 * D), ExitHistory: [] },
    { CSFloatListingID: 'legacy-1', ItemMarketHashName: 'Tec-9 | Rebel (Minimal Wear)', CurrentStrategicStage: 7, PlannedExit: 'SteamMarket', PurchaseCostPence: 0, ExpectedAbsoluteProfitInPounds: 0.01, TimeOfPurchase: '2025-11-10T06:18:00Z', ExitHistory: [] },
  ];

  // ── the daily counters: screen passes every day, the exit model only counted from today ──
  const daily: Record<string, any> = {};
  for (let i = 0; i < 40; i++) {
    const key = day(now - i * D);
    daily[key] = { Evaluated: 40_000 + (i % 7) * 900, Qualified: 150 + (i % 5) * 20, Purchased: i === 35 ? 3 : 0, BestRoi: 0.3 };
  }
  if (!legacy) Object.assign(daily[day(now)], { ModelChecked: 46, ModelConfirmed: 1, Blocked: 1, BestModelRoi: 0.11 });

  const analytics = () => ({
    TotalListingsScanned: 1_164_002, NumberOfListingsBelow0PercentGain: 1_142_191, NumberOfListingsBetween0And5PercentGain: 9083,
    NumberOfListingsBetween5And10PercentGain: 7823, NumberOfListingsBetween10And20PercentGain: 4463, NumberOfListingsAbove20PercentGain: 442,
    HighestPredictedGainFoundSoFar: 3.005, NameOfItemWithHighestPredictedGain: 'Tec-9 | Phoenix Chalk (Well-Worn)', FirstListingDateRecorded: iso(-40 * D),
    AnalyticsGeneratedAt: iso(0), QualifiedOpportunities: 4543, PurchaseAttempts: 22, Purchases: 20, Daily: daily, AllPurchasedItems: purchases,
    ...(legacy ? {} : { ModelChecked: 46, ModelConfirmed: 1, Blocked: 1, BlockReasons: { 'buying off': 1 }, FunnelSinceUtc: new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate(), 0, 51)).toISOString() }),
  });

  const status = () => ({
    startupState: scenario === 'starting' ? 'loading positions and scan history' : 'running',
    automationEnabled: true,
    startupMs: 49_000_000,
    settings: scenario === 'starting' ? null : {
      ScanningEnabled: true, PurchasingEnabled: false, AutoManageRelists: true,
      Evaluation: {
        MinimumSteamRoiPercent: 888, MinimumRelistRoiPercent: 9, MinimumProfitPence: 10,
        // As the bot does: re-read from its settings, so a saved switch shows in the next status.
        ...(legacy ? {} : {
          RejectHighFailureSellers: settingValue('CS2ArbitrageRejectHighFailureSellers') === 'true',
          MaximumSellerFailureRate: Number(settingValue('CS2ArbitrageMaxSellerFailurePercent')) / 100,
          MinimumSellerTradesForFailureRate: Number(settingValue('CS2ArbitrageSellerFailureMinimumTrades')),
        }),
      },
      Exit: { CapitalCostPerDay: 0.002, RiskAversion: 2, RelistHorizonDays: 21, ConversionSigma: 0.04 },
    },
    exchangeRateGbpPerUsd: 0.7562,
    conversion: { coefficient: 0.8644, computedAtUtc: iso(-1.5 * H), basis: 'capacity-weighted over 8 verified converter(s) covering £25 of £25/week', topConverters: [
      { MarketHashName: 'Sticker | ENCE (Foil) | Stockholm 2021', Coefficient: 0.988, CSFloatSales7d: 25, WeeklyCapacityPence: 473, VerifiedBySales: true },
    ] },
    balances: { csfloatUsd: 30.79, csfloatGbp: 23.28, csfloatFetchedUtc: iso(-28 * 60_000), steamGbp: null },
    engine: {
      State: 'running', StartedUtc: iso(-13.7 * H), LastFeedPollUtc: iso(-20_000), CurrentFeedIntervalSeconds: 33.2, FeedPolls: 2112, FeedCoverageGaps: 17,
      ObservedListingsPerMinute: 14.8, LastSweepUtc: iso(-90_000), LastStructuralScanUtc: iso(-11 * 60_000), LastConversionModelUtc: iso(-1.5 * H),
      ListingsSeen: 13310, Evaluated: 21560, Prefiltered: 21188, Opportunities: 150, Purchases: 0, RecentErrors: [], CSFloatPausedUntilUtc: null,
      LastStructuralSummary: '28191 items ranked, 1 plausible, 0 confirmed on Steam, 0 targeted lookups',
    },
    csfloatRateLimits: [
      { Name: 'listings', Limit: 200, Remaining: 29, ResetUtc: iso(2 * 60_000), TooManyRequestsCount: 0, Known: true },
      { Name: 'trades', Limit: 100, Remaining: 95, ResetUtc: iso(3 * 60_000), TooManyRequestsCount: 0, Known: true },
      { Name: 'history-sales', Limit: 500, Remaining: 25, ResetUtc: iso(7 * H), TooManyRequestsCount: 0, Known: true },
    ],
    steam: {
      Requests: 671, Successes: 516, CacheHits: 28, ConsecutiveFailures: 0, LastSuccessUtc: iso(-11 * 60_000), cachedBooks: 272, pacerIntervalMs: 1000,
      ...(legacy ? { Failures: 82, LastError: 'orderbook Souvenir PP-Bizon | Wood Block Camo (Battle-Scarred): unsuccessful or unconvertible response' }
        : { Failures: 0, misses: 1, missSkips: 81, knownMisses: 1, backedOff: [{ name: 'Souvenir PP-Bizon | Wood Block Camo (Battle-Scarred)', untilUtc: iso(11 * H), misses: 7 }] }),
    },
    bulkSteamPrices: { Count: 32077, LoadedAtUtc: iso(-1.6 * H), LastError: null },
    trades: { lastPollUtc: iso(-40_000), lastError: null, pollRunningSinceUtc: null },
    steamSession: {
      problem: "Steam rejected the saved login; it needs approving in the Steam app", problemSinceUtc: iso(-16 * D), lastWorkedUtc: null, checkedUtc: iso(-60_000),
      loginPromptOpen: mock.state.loginPromptOpen, lastLoginPromptUtc: null, lastLoginPromptOutcome: null,
      ...(legacy ? {} : { refreshTokenRejectedUtc: iso(-13.6 * H) }),
    },
    exitModel: {
      settings: { CapitalCostPerDay: 0.002, RiskAversion: 2, RelistHorizonDays: 21, ConversionSigma: 0.04 },
      autoManageRelists: true,
      locks: {
        timeline: { protectionEndsAtUtcHour: 7, handoverHours: 0.11, verificationLagHours: 0.01, ownSendHours: 1, saleCancelRate: 0.02, purchaseCancelRate: 0.039,
          csfloatSaleToCashDays: 7.54, steamSaleToCashDays: 15.39, converterHoldDays: 7.35, purchasesObserved: 100, salesObserved: 0, measuredUtc: iso(-40_000) },
        converterHoldGrowth: 0.9844, converterHoldSigma: 0.0995, steamWalletHeadroomGbp: null, csfloatSellingPaused: false,
      },
      market: { driftPerDay: { Skin: -0.0045, Sticker: -0.0015, Container: -0.0021 }, observations: { Skin: 297, Sticker: 294, Container: 153 }, volatilityScale: 1.129, forecastChecks: 997, coverageWithinOneSigma: 0.659 },
      calibration: { RelistTimeMultiplier: 6, RelistEpisodes: 10, RelistSales: 5, SteamForecastBiasLog: -0.077, CSFloatForecastBiasLog: -0.0068, ForecastChecks: 16, RealisedVsExpected: 0.959, CompletedPositions: 5 },
    },
    positions: purchases.filter((p) => ![7, 8, 10].includes(p.CurrentStrategicStage)).map((p) => ({
      ItemMarketHashName: p.ItemMarketHashName, CSFloatListingID: p.CSFloatListingID, stage: p.CurrentStrategicStage === 9 ? 'WaitingForCSFloatResale' : 'JustRetrieved',
      PlannedExit: p.PlannedExit, LastTradeState: p.LastTradeState, saleAttempts: 0, lastSaleFailure: null, autoSelling: true,
      relist: p.CurrentStrategicStage === 9 ? { priceCents: p.CSFloatResalePriceCents, listedUtc: p.ListedOnCSFloatAtUtc, expectedDaysToSell: 0.28, nextReviewUtc: p.NextExitReviewUtc,
        ...(legacy ? {} : { totalExposure: p.RelistTotalExposure, listingId: p.CSFloatResaleListingID, soldUtc: null, overdue: true }) } : null,
    })),
    totals: { TotalEvaluated: 1_164_002, QualifiedOpportunities: 4543, Purchases: 20 },
    ...(legacy ? {} : {
      startupSteps: [{ step: 'loading settings', ms: 1200 }, { step: 'loading positions and scan history', ms: 221_000 }, { step: 'reading the CSFloat balance', ms: 900 }],
      alerts: [
        { key: 'relist-overdue:buy-stuck', atUtc: iso(-1.5 * H), title: 'CS2 Arbitrage — relist overdue' },
        { key: 'steam-source', atUtc: iso(-3 * D), title: 'CS2 Arbitrage — Steam prices unavailable' },
      ],
    }),
    legacyFilesOnDisk: 32356,
  });

  const exit = (route: number, available: boolean, roi: number, sale: number, net: number, profit: number, reason: string | null = null) =>
    ({ Route: route, Available: available, UnavailableReason: reason, ExpectedSalePrice: sale, NetCashPence: net, ProfitPence: profit, Roi: roi, MeetsThreshold: roi >= 0.09 });
  const deals = [
    { ListingId: 'deal-luck', MarketHashName: 'Sticker | Luck Skill (Foil)', PriceCents: 317, CostPence: 240, ListingCreatedUtc: iso(-3 * 60_000), EvaluatedAtUtc: iso(-2 * 60_000), Source: 'feed',
      ConversionCoefficient: 0.864, SteamHighestBuyOrderPence: 277, SteamLowestSellOrderPence: 301, SteamBuyOrderCount: 400,
      Steam: exit(1, true, -0.15, 277, 205, -35), Relist: exit(2, true, 0.12, 370, 270, 30), BestRoute: 2, BestRoi: -0.125, BestProfitPence: -28, ShouldBuy: false,
      Reason: 'exit model: best exit worth -12.5% (£-0.28) after time, risk and fees, below the bar (≥9% and ≥£0.10) — CSFloat at $3.17 → ~41.2d to sell, 33% within the horizon, cash in ~36d after the buyer\'s protection, worth £1.94 now; Steam: Steam at £2.77 → £2.05 after fees, conversion and the converters\' 7-day hold, cash in ~23d, worth £1.91 now',
      ExitModelChecked: true, ScreenBestRoi: 0.12, ExpectedDaysToSell: 41.2, SellProbability: 0.33, CSFloatSalesPerDay: 0.4, MissingSignals: [] },
    { ListingId: 'deal-mac', MarketHashName: 'MAC-10 | Derailment (Factory New)', PriceCents: 720, CostPence: 545, ListingCreatedUtc: iso(-50 * 60_000), EvaluatedAtUtc: iso(-45 * 60_000), Source: 'feed',
      ConversionCoefficient: 0.864, SteamHighestBuyOrderPence: 0, SteamLowestSellOrderPence: 0, SteamBuyOrderCount: 0,
      Steam: exit(1, false, -1, 0, 0, 0, 'no Steam order book'), Relist: exit(2, true, -0.0073, 731, 541, -4), BestRoute: 2, BestRoi: -0.0073, BestProfitPence: -4, ShouldBuy: false,
      Reason: 'best CSFloatRelist ROI -0.7% (profit £-0.04) below the bar (≥9% and ≥£0.10)', ExitModelChecked: false, ScreenBestRoi: -0.0073 },
    { ListingId: 'deal-ence', MarketHashName: 'Sticker | ENCE (Foil) | Stockholm 2021', PriceCents: 190, CostPence: 144, ListingCreatedUtc: iso(-6 * 60_000), EvaluatedAtUtc: iso(-5 * 60_000), Source: 'sweep:highest_discount',
      ConversionCoefficient: 0.864, SteamHighestBuyOrderPence: 210, SteamLowestSellOrderPence: 230, SteamBuyOrderCount: 900,
      Steam: exit(1, true, 0.05, 210, 151, 7), Relist: exit(2, true, 0.2, 240, 175, 31), BestRoute: 2, BestRoi: 0.14, BestProfitPence: 20, ShouldBuy: true,
      Reason: 'exit model: CSFloat at $2.40 → ~1.2d to sell, 92% within the horizon, worth £1.64 now', ExitModelChecked: true, ScreenBestRoi: 0.2, ExpectedDaysToSell: 1.2, SellProbability: 0.92, CSFloatSalesPerDay: 3.5 },
  ];

  const balances = Array.from({ length: 40 }, (_, i) => {
    const back = 39 - i;
    const carried = back < 16;
    return {
      DateTimeOfBalanceRecord: new Date(now - back * D).toISOString(),
      CSFloatUsableBalanceInPounds: 20 + i * 0.1, CSFloatPendingBalanceInPounds: 0, CSFloatTotalBalanceInPounds: 20 + i * 0.1,
      SteamUsableBalanceInPounds: 60.84, SteamPendingBalanceInPounds: 0, SteamTotalBalanceInPounds: carried ? 60.84 : 55 + i * 0.25, SteamBalanceCarriedForward: carried,
    };
  });

  const plan = {
    ProductionDateOfLiquiditySearchResultUsed: iso(-1.5 * H), ConversionCoefficientUsed: 0.8644,
    Top10Gaps: [
      { csfloatContainer: { MarketHashName: 'Sticker | ENCE (Foil) | Stockholm 2021', PriceInPounds: 1.96 }, steamListing: { Name: 'Sticker | ENCE (Foil) | Stockholm 2021', CheapestSellOrderPriceInPounds: 2.2, HighestBuyOrderPriceInPounds: 2.0 }, ReturnCoefficientFromSteamToCSFloatTaxIncluded: 0.988, IdealPriceToPurchaseOnSteamInPounds: 2.29 },
      { csfloatContainer: { MarketHashName: 'Patch | City 17', PriceInPounds: 0.72 }, steamListing: { Name: 'Patch | City 17', CheapestSellOrderPriceInPounds: 0.88, HighestBuyOrderPriceInPounds: 0.8 }, ReturnCoefficientFromSteamToCSFloatTaxIncluded: 0.821, IdealPriceToPurchaseOnSteamInPounds: 0.85 },
    ],
  };
  const cycles = [{ StartedUtc: iso(-20_000), DurationMs: 205, Strategy: 'feed', ListingsReturned: 50, NewListings: 8, Evaluated: 8, SteamLookups: 0, Prefiltered: 8, Opportunities: 0, Purchased: 0, Errors: 0, CoverageGap: false, BestRoi: -0.07, BestItem: 'AK-47 | Ice Coaled (Field-Tested)' }];

  const settingsList = [
    { Name: 'PurchaseCSFloatArbitrageOpportunities', Type: 1, Sensitive: false, Value: 'false', ParentServiceName: 'CS2ArbitrageBot', ParentServiceId: 'cs2' },
    { Name: 'CS2ArbitrageMinimumRelistROIPercent', Type: 2, Sensitive: false, Value: '9', ParentServiceName: 'CS2ArbitrageBot', ParentServiceId: 'cs2' },
    { Name: 'CSFloatAPIKey', Type: 0, Sensitive: true, Value: '********', ParentServiceName: 'CS2ArbitrageBot', ParentServiceId: 'cs2' },
    // The seller failure-rate veto (a server from before it has neither the settings nor the status fields).
    ...(legacy ? [] : [
      { Name: 'CS2ArbitrageRejectHighFailureSellers', Type: 1, Sensitive: false, Value: 'true', ParentServiceName: 'CS2ArbitrageBot', ParentServiceId: 'cs2' },
      { Name: 'CS2ArbitrageMaxSellerFailurePercent', Type: 2, Sensitive: false, Value: '5', ParentServiceName: 'CS2ArbitrageBot', ParentServiceId: 'cs2' },
      { Name: 'CS2ArbitrageSellerFailureMinimumTrades', Type: 2, Sensitive: false, Value: '20', ParentServiceName: 'CS2ArbitrageBot', ParentServiceId: 'cs2' },
    ]),
  ];
  const settingValue = (name: string) => settingsList.find((s) => s.Name === name)?.Value;

  /** The answer for a GET path, as { status, body }. */
  const get = (path: string): { status: number; body: unknown } => {
    const url = new URL(`https://klive.dev${path}`);
    const gated = url.pathname !== '/cs2arbitragebot/status';
    if (scenario === 'starting' && gated && url.pathname.startsWith('/cs2arbitragebot/')) return { status: 503, body: { error: 'CS2ArbitrageBot is still starting (loading positions and scan history).', pending: true } };
    switch (url.pathname) {
      case '/cs2arbitragebot/status': return { status: 200, body: status() };
      case '/cs2arbitragebot/opportunities': return { status: 200, body: deals };
      case '/cs2arbitragebot/getscanalytics': return { status: 200, body: analytics() };
      case '/cs2arbitragebot/scanresults': return { status: 200, body: cycles };
      case '/cs2arbitragebot/latestliquidityplan': return { status: 200, body: plan };
      case '/cs2arbitragebot/balanceHistory': return { status: 200, body: balances };
      case '/OmniGlobalSettings/List': return { status: 200, body: settingsList };
      default: return { status: -1, body: null };
    }
  };

  // The dashboard fake keeps sign-in, the profile and the navbar's own calls working; this one answers CS2 on top.
  await installDashboardApiMock(page, options.role ?? 'Klives');
  await page.route('https://klive.dev/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathWithQuery = `${url.pathname}${url.search}`;
    if (request.method() === 'OPTIONS') { await route.fallback(); return; }

    if (url.pathname === '/batch' && request.method() === 'POST') {
      const paths: string[] = JSON.parse(request.postData() ?? '[]').map((e: { path?: string }) => e.path).filter((p: unknown): p is string => typeof p === 'string');
      if (!paths.some((p) => p.startsWith('/cs2arbitragebot/'))) { await route.fallback(); return; }
      mock.batchCalls.push(paths);
      mock.requestedPaths.push(...paths);
      await fulfil(route, paths.map((path) => {
        const answer = get(path);
        const statusCode = answer.status < 0 ? 404 : answer.status;
        return { path, status: statusCode, ok: statusCode < 300, contentType: 'application/json', body: answer.body ?? { error: 'Route not found' } };
      }));
      return;
    }

    if (request.method() === 'GET') {
      const answer = get(pathWithQuery);
      if (answer.status < 0) { await route.fallback(); return; }
      mock.requestedPaths.push(pathWithQuery);
      await fulfil(route, answer.body, answer.status);
      return;
    }

    if (request.method() === 'POST' && url.pathname === '/OmniGlobalSettings/Set') {
      let body: any = null;
      try { body = JSON.parse(request.postData() || 'null'); } catch { body = null; }
      mock.posts.push({ path: url.pathname, body });
      const setting = settingsList.find((s) => s.Name === body?.name && !s.Sensitive);
      if (!setting) { await fulfil(route, { error: 'No such setting.' }, 404); return; }
      setting.Value = String(body.value);
      await fulfil(route, { saved: true });
      return;
    }

    if (request.method() === 'POST' && url.pathname.startsWith('/cs2arbitragebot/')) {
      let body: any = null;
      try { body = JSON.parse(request.postData() || 'null'); } catch { body = null; }
      mock.posts.push({ path: url.pathname, body });
      const isNew = ['/cs2arbitragebot/steam/login', '/cs2arbitragebot/positions/recheck', '/cs2arbitragebot/positions/close'].includes(url.pathname);
      if (legacy && isNew) { await fulfil(route, 'Route not found', 404); return; }
      switch (url.pathname) {
        case '/cs2arbitragebot/scanNow': await fulfil(route, { queued: true }, 202); return;
        case '/cs2arbitragebot/steam/login':
          mock.state.loginPromptOpen = true;
          await fulfil(route, { requested: true, message: 'Approve the sign-in request in the Steam app (a Discord message explains it).' }, 202);
          return;
        case '/cs2arbitragebot/positions/recheck': {
          const p = purchases.find((x) => x.CSFloatListingID === body?.id);
          if (!p) { await fulfil(route, { error: 'No position with that id.' }, 404); return; }
          // CSFloat says the relist sold and the unit has gone: closed with the profit worked out from the listing price.
          Object.assign(p, { CurrentStrategicStage: 7, LastTradeState: 'resale:inferred', ActualAbsoluteProfitInPounds: 0.39, ActualProfitPercentage: 21.8, TimeOfCollectedRevenue: iso(0), ResaleSoldAtUtc: iso(0) });
          await fulfil(route, { outcome: 'completed', message: 'Sold and delivered: the position is closed with the profit worked out from the listing price.', stage: 'StrategyCompleted', lastTradeState: 'resale:inferred' });
          return;
        }
        case '/cs2arbitragebot/positions/close': {
          const p = purchases.find((x) => x.CSFloatListingID === body?.id);
          if (!p) { await fulfil(route, { error: 'No position with that id.' }, 404); return; }
          if (typeof body.soldForCents === 'number') Object.assign(p, { CurrentStrategicStage: 7, LastTradeState: 'closed:sold', ActualAbsoluteProfitInPounds: 0.39, CSFloatResalePriceCents: body.soldForCents, TimeOfCollectedRevenue: iso(0) });
          else Object.assign(p, { CurrentStrategicStage: 10, LastTradeState: 'closed:gone' });
          await fulfil(route, { closed: true, stage: p.CurrentStrategicStage === 7 ? 'StrategyCompleted' : 'LeftInventory', message: typeof body.soldForCents === 'number' ? `sold for $${(body.soldForCents / 100).toFixed(2)} (profit £0.39)` : 'closed with no recorded result' });
          return;
        }
        default: await fulfil(route, { error: 'Route not found' }, 404); return;
      }
    }
    await route.fallback();
  });

  return mock;
}

export async function openCs2(page: Page, options: { scenario?: Cs2Scenario; role?: DashboardRole; path?: string } = {}): Promise<Cs2ApiMock> {
  const api = await installCs2ApiMock(page, options);
  const role = options.role ?? 'Klives';
  await page.context().addCookies([{ name: 'password', value: `e2e-${role.toLowerCase()}`, url: dashboardTestOrigin }]);
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(options.path ?? '/schemery/cs2arbitragebot', { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.getByTestId('cs2x-verdict').waitFor({ state: 'visible', timeout: 20_000 });
      break;
    } catch (error) {
      // Nuxt dev occasionally aborts a module stream on the first load; a reload tells that apart from a real failure.
      if (attempt >= 2) throw error;
      await page.waitForTimeout(3_000 * (attempt + 1));
    }
  }
  return api;
}
