/**
 * Types, stage metadata and formatters for the CS2 Arbitrage page (server field names are the
 * contract). Lives in scripts/ rather than composables/ so Nuxt doesn't auto-import these names
 * globally — `fmtAgo` & co. would collide with OmniTrader's helpers. Data loading is in
 * composables/useCs2Arbitrage.ts.
 */

// ── Route payloads (server field names) ─────────────────────────────────────

export interface Cs2Exit {
  Route: number | string;
  Available: boolean;
  UnavailableReason?: string | null;
  ExpectedSalePrice: number;
  NetCashPence: number;
  ProfitPence: number;
  Roi: number;
  MeetsThreshold: boolean;
}

export interface Cs2Evaluation {
  ListingId: string;
  MarketHashName: string;
  PriceCents: number;
  CostPence: number;
  FloatValue?: number | null;
  ListingCreatedUtc: string;
  EvaluatedAtUtc: string;
  Source: string;
  ConversionCoefficient: number;
  SteamHighestBuyOrderPence: number;
  SteamLowestSellOrderPence: number;
  SteamBuyOrderCount: number;
  Steam: Cs2Exit;
  Relist: Cs2Exit;
  BestRoute: number | string;
  BestRoi: number;
  BestProfitPence: number;
  ShouldBuy: boolean;
  Reason: string;
  /** Set once the exit model valued the listing with live evidence before buying (BestRoi is then the model's). */
  ExitModelChecked?: boolean;
  ScreenBestRoi?: number;
  ExpectedDaysToSell?: number;
  SellProbability?: number;
  PlannedPrice?: number;
  CSFloatSalesPerDay?: number;
  ExitModelSummary?: string | null;
  MissingSignals?: string[] | null;
}

/** One exit decision recorded on a position (server `ExitDecision`). */
export interface Cs2ExitDecision {
  AtUtc: string;
  /** "purchase", "sale" or "review". */
  Stage: string;
  /** "buy", "steam", "relist", "reprice", "keep", "delist+steam", "capped", … */
  Action: string;
  /** "SteamMarket", "CSFloatRelist" or "None". */
  Route: string;
  /** Steam: buy-order price in GBP pence. CSFloat: listing price in USD cents. */
  Price: number;
  ExpectedDaysToSell: number;
  SellProbability: number;
  CertaintyEquivalentPence: number;
  SteamCertaintyEquivalentPence: number;
  RelistCertaintyEquivalentPence: number;
  SalesPerDay: number;
  SalesRateBasis: string;
  MedianValueRatio: number;
  DemandMultiplier: number;
  DaysUntilTradable?: number;
  Rationale: string;
}

/** `/status` → `exitModel` (server field names). */
export interface Cs2ExitModelStatus {
  settings?: { CapitalCostPerDay: number; RiskAversion: number; RelistHorizonDays: number; ConversionSigma: number };
  autoManageRelists?: boolean;
  locks?: {
    timeline: {
      protectionEndsAtUtcHour: number;
      handoverHours: number;
      verificationLagHours: number;
      ownSendHours: number;
      saleCancelRate: number;
      purchaseCancelRate: number;
      csfloatSaleToCashDays: number;
      steamSaleToCashDays: number;
      converterHoldDays: number;
      purchasesObserved: number;
      salesObserved: number;
      measuredUtc?: string | null;
    };
    converterHoldGrowth: number;
    converterHoldSigma: number;
    steamWalletHeadroomGbp?: number | null;
    csfloatSellingPaused: boolean;
  };
  market?: {
    driftPerDay: Record<string, number>;
    observations: Record<string, number>;
    volatilityScale: number;
    forecastChecks: number;
    coverageWithinOneSigma?: number | null;
  };
  calibration?: {
    RelistTimeMultiplier: number;
    RelistEpisodes: number;
    RelistSales: number;
    SteamForecastBiasLog: number;
    CSFloatForecastBiasLog: number;
    ForecastChecks: number;
    RealisedVsExpected?: number | null;
    CompletedPositions: number;
  };
}

export interface Cs2Cycle {
  StartedUtc: string;
  DurationMs: number;
  Strategy: string;
  ListingsReturned: number;
  NewListings: number;
  Evaluated: number;
  SteamLookups: number;
  Prefiltered: number;
  Opportunities: number;
  Purchased: number;
  Errors: number;
  CoverageGap: boolean;
  BestRoi: number;
  BestItem?: string | null;
  Note?: string | null;
}

export interface Cs2Purchase {
  CSFloatListingID: string;
  ItemMarketHashName: string;
  ItemFloatValue?: number;
  CurrentStrategicStage: number;
  PlannedExit?: string;
  TimeOfPurchase?: string;
  TimeOfSellerToAcceptSale?: string;
  TimeOfSellerToSendTradeOffer?: string;
  TimeOfItemRetrieval?: string;
  PredictedTimeToBeResoldOnSteam?: string;
  ActualTimeResoldOnSteam?: string;
  TimeOfCollectedRevenue?: string;
  ExpectedAbsoluteProfitInPounds?: number;
  ExpectedProfitPercentage?: number;
  ActualAbsoluteProfitInPounds?: number;
  ActualProfitPercentage?: number;
  ActualSalePriceOnSteam?: number;
  PurchasePriceCents?: number;
  PurchaseCostPence?: number;
  ExpectedNetCashPence?: number;
  ConversionCoefficientAtPurchase?: number;
  PurchaseSource?: string;
  LastTradeState?: string;
  SaleAttempts?: number;
  CSFloatResaleListingID?: string;
  CSFloatResalePriceCents?: number;
  CSFloatToSteamTradeOfferLink?: string;
  Notes?: string;
  // Exit model (absent on older records)
  PurchasePlan?: Cs2ExitDecision | null;
  ExitHistory?: Cs2ExitDecision[];
  ListedOnCSFloatAtUtc?: string;
  RelistBaseDaysToSell?: number;
  RelistModelExposure?: number;
  RelistTotalExposure?: number;
  RelistRepriceCount?: number;
  ResaleSoldAtUtc?: string;
  NextExitReviewUtc?: string;
  SaleDeferrals?: number;
  SaleDeferredUntilUtc?: string;
  LastSaleAttemptUtc?: string;
  comparison?: {
    CSFloatURL?: string;
    SteamListingURL?: string;
    CSFloatListing?: { PriceText?: string; ImageURL?: string; PriceInPounds?: number };
    SteamListing?: { PriceText?: string; HighestBuyOrderPriceInPounds?: number };
  };
}

export interface Cs2Daily { Evaluated: number; Qualified: number; Purchased: number; BestRoi: number }

export interface Cs2Analytics {
  TotalListingsScanned: number;
  NumberOfListingsBelow0PercentGain: number;
  NumberOfListingsBetween0And5PercentGain: number;
  NumberOfListingsBetween5And10PercentGain: number;
  NumberOfListingsBetween10And20PercentGain: number;
  NumberOfListingsAbove20PercentGain: number;
  MeanPriceOfListingsBelow0PercentGain: number;
  MeanPriceOfListingsBetween0And5PercentGain: number;
  MeanPriceOfListingsBetween5And10PercentGain: number;
  MeanPriceOfListingsBetween10And20PercentGain: number;
  MeanPriceOfListingsAbove20PercentGain: number;
  HighestPredictedGainFoundSoFar: number;
  NameOfItemWithHighestPredictedGain: string;
  CountListingsWithPositiveGain: number;
  CountListingsWithNegativeGain: number;
  FirstListingDateRecorded: string;
  AnalyticsGeneratedAt: string;
  QualifiedOpportunities?: number;
  PurchaseAttempts?: number;
  Purchases?: number;
  TotalExpectedProfitPercent?: number;
  CurrentExpectedReturnCoefficientOfSteamToCSFloat?: number;
  Daily?: Record<string, Cs2Daily>;
  AllPurchasedItems?: Cs2Purchase[];
}

export interface Cs2Balance {
  DateTimeOfBalanceRecord: string;
  CSFloatUsableBalanceInPounds: number;
  CSFloatPendingBalanceInPounds: number;
  CSFloatTotalBalanceInPounds: number;
  SteamUsableBalanceInPounds: number;
  SteamPendingBalanceInPounds: number;
  SteamTotalBalanceInPounds: number;
  SteamBalanceCarriedForward?: boolean;
}

export interface Cs2PlanGap {
  csfloatContainer?: { MarketHashName: string; PriceInPounds: number };
  steamListing?: { Name: string; CheapestSellOrderPriceInPounds: number; HighestBuyOrderPriceInPounds: number; ListingURL?: string };
  ReturnCoefficientFromSteamToCSFloatTaxIncluded?: number;
  IdealReturnCoefficientFromSteamToCSFloatTaxIncluded?: number;
  IdealPriceToPurchaseOnSteamInPounds?: number;
}

export interface Cs2Plan {
  ProductionDateOfLiquiditySearchResultUsed?: string;
  Top10Gaps?: Cs2PlanGap[];
  LiquidityPlanDescription?: string;
  ConversionCoefficientUsed?: number;
  ConversionBasis?: string;
}

// ── Stage metadata ──────────────────────────────────────────────────────────

export type Cs2Tone = 'neutral' | 'good' | 'warning' | 'danger' | 'info';

export interface Cs2StageMeta { label: string; short: string; tone: Cs2Tone; action?: string }

/** Server enum `StrategicStages` (append-only). */
export const CS2_STAGES: Record<number, Cs2StageMeta> = {
  0: { label: 'Waiting for the seller to accept', short: 'Seller', tone: 'info' },
  1: { label: 'Waiting for the seller to send the trade', short: 'Trade', tone: 'info' },
  2: { label: 'Trade offer sent — accept it in Steam', short: 'Accept', tone: 'warning', action: 'Accept the trade offer' },
  3: { label: 'In inventory (7-day trade protection)', short: 'Hold', tone: 'neutral' },
  4: { label: 'Listed on the Steam market', short: 'Steam sale', tone: 'info' },
  5: { label: 'Converting: buy items on Steam', short: 'Convert', tone: 'info' },
  6: { label: 'Converting: sell items on CSFloat', short: 'Convert', tone: 'info' },
  7: { label: 'Completed', short: 'Done', tone: 'good' },
  8: { label: 'Trade cancelled (refunded)', short: 'Cancelled', tone: 'danger' },
  9: { label: 'Relisted on CSFloat — waiting for a buyer', short: 'Resale', tone: 'info' },
  10: { label: 'Left the inventory (sold or moved by hand)', short: 'Gone', tone: 'neutral' },
};

export const stageMeta = (stage: number): Cs2StageMeta =>
  CS2_STAGES[stage] ?? { label: `Unknown stage ${stage}`, short: '?', tone: 'neutral' };

/** Purchases still in play (not completed, cancelled, or closed because the unit left the inventory). */
export const isOpenPurchase = (p: Cs2Purchase) => p.CurrentStrategicStage !== 7 && p.CurrentStrategicStage !== 8 && p.CurrentStrategicStage !== 10;

/** Server serialises ExitRoute as an int (0 None, 1 SteamMarket, 2 CSFloatRelist); tolerate names too. */
export const routeName = (route: number | string | undefined | null): 'Steam' | 'CSFloat relist' | '—' => {
  if (route === 1 || route === 'SteamMarket') return 'Steam';
  if (route === 2 || route === 'CSFloatRelist') return 'CSFloat relist';
  return '—';
};

// ── Formatting ──────────────────────────────────────────────────────────────

const hasValue = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const fmtGbp = (pounds?: number | null, digits = 2) => (hasValue(pounds) ? `£${pounds.toFixed(digits)}` : '—');
export const fmtPence = (pence?: number | null) => (hasValue(pence) ? `£${(pence / 100).toFixed(2)}` : '—');
export const fmtCents = (cents?: number | null) => (hasValue(cents) ? `$${(cents / 100).toFixed(2)}` : '—');
export const fmtRoi = (roi?: number | null, digits = 1) => (hasValue(roi) ? `${roi >= 0 ? '+' : ''}${(roi * 100).toFixed(digits)}%` : '—');
export const fmtCount = (n?: number | null) => (hasValue(n) ? n.toLocaleString() : '—');
export const fmtNumber = (n?: number | null, digits = 2) => (hasValue(n) ? n.toFixed(digits) : '—');

export const isRealDate = (iso?: string | null) => Boolean(iso) && !String(iso).startsWith('0001-');

export const fmtAgo = (iso?: string | null, now = Date.now()) => {
  if (!isRealDate(iso)) return 'never';
  const seconds = Math.round((now - new Date(iso as string).getTime()) / 1000);
  if (seconds < 0) {
    const ahead = -seconds;
    if (ahead < 90) return `in ${ahead}s`;
    if (ahead < 5400) return `in ${Math.round(ahead / 60)}m`;
    if (ahead < 172800) return `in ${Math.round(ahead / 3600)}h`;
    return `in ${Math.round(ahead / 86400)}d`;
  }
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
};

export const fmtDateTime = (iso?: string | null) =>
  isRealDate(iso) ? new Date(iso as string).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const roiTone = (roi?: number | null, bar = 0.1): Cs2Tone => {
  if (!hasValue(roi)) return 'neutral';
  if (roi >= bar) return 'good';
  if (roi >= 0) return 'warning';
  return 'neutral';
};

export const steamListingUrl = (name: string) => `https://steamcommunity.com/market/listings/730/${encodeURIComponent(name)}`;
export const csfloatListingUrl = (id: string) => `https://csfloat.com/item/${id}`;

// ── Exit model & trade locks ────────────────────────────────────────────────

/** "17h", "1.9d", "never" (a wait of a year or more). */
export const fmtDays = (days?: number | null) => {
  if (!hasValue(days)) return '—';
  if (days >= 365) return 'never';
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  return `${days.toFixed(days < 10 ? 1 : 0)}d`;
};

export const fmtProbability = (p?: number | null) => (hasValue(p) ? `${Math.round(p * 100)}%` : '—');

/** Time until (or since) a moment as "3d 4h" / "5h 12m" / "12m". */
export const fmtCountdown = (iso?: string | null, now = Date.now()) => {
  if (!isRealDate(iso)) return '—';
  const totalMinutes = Math.round(Math.abs(new Date(iso as string).getTime() - now) / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

/** The bot sells an hour after Valve's trade protection lifts; this is when the protection itself ends. */
export const protectionEndsAt = (p: Cs2Purchase): string | null => {
  if (!isRealDate(p.PredictedTimeToBeResoldOnSteam)) return null;
  return new Date(new Date(p.PredictedTimeToBeResoldOnSteam as string).getTime() - 3_600_000).toISOString();
};

/** The most recent exit decision on a position (sale, review), else the plan made at purchase. */
export const latestDecision = (p: Cs2Purchase): Cs2ExitDecision | null =>
  (p.ExitHistory?.length ? p.ExitHistory[p.ExitHistory.length - 1] : null) ?? p.PurchasePlan ?? null;

/** The exit the position is on now: the sale decision once made, else the purchase-time plan. */
export const currentRoute = (p: Cs2Purchase): 'SteamMarket' | 'CSFloatRelist' => {
  if (p.CurrentStrategicStage === 9) return 'CSFloatRelist';
  if (p.CurrentStrategicStage === 4) return 'SteamMarket';
  const sale = [...(p.ExitHistory ?? [])].reverse().find((d) => d.Route === 'SteamMarket' || d.Route === 'CSFloatRelist');
  return (sale?.Route as 'SteamMarket' | 'CSFloatRelist' | undefined) ?? (p.PlannedExit === 'CSFloatRelist' ? 'CSFloatRelist' : 'SteamMarket');
};

/** Price of a decision in its venue's currency. */
export const fmtDecisionPrice = (d: Cs2ExitDecision) => (d.Route === 'SteamMarket' ? fmtPence(d.Price) : fmtCents(d.Price));

/** A relist that has sat through this many expected sales without one raises an alert (server: OverdueExpectedSales). */
export const RELIST_OVERDUE_EXPECTED_SALES = 8;

export const CATEGORY_LABELS: Record<string, string> = {
  Skin: 'Skins', Sticker: 'Stickers', Container: 'Cases', Charm: 'Charms', Patch: 'Patches', Other: 'Other',
};

// ═════════════════════════════ The console (rebuilt Nov 2026) ═════════════════════════════
// Everything below feeds pages/schemery/cs2arbitragebot.vue (.cs2x). Pure, so the page stays a view.
// Every field a newer bot build adds is optional: the site and the server deploy separately.

export interface Cs2SteamSession {
  problem?: string | null;
  problemSinceUtc?: string | null;
  lastWorkedUtc?: string | null;
  checkedUtc?: string | null;
  loginPromptOpen?: boolean;
  lastLoginPromptUtc?: string | null;
  lastLoginPromptOutcome?: string | null;
  refreshTokenRejectedUtc?: string | null;
}

export interface Cs2StatusRelist {
  priceCents: number;
  listedUtc?: string;
  RelistRepriceCount?: number;
  expectedDaysToSell?: number;
  totalExposure?: number;
  nextReviewUtc?: string;
  listingId?: string;
  soldUtc?: string | null;
  overdue?: boolean;
}

export interface Cs2StatusPosition {
  ItemMarketHashName: string;
  CSFloatListingID: string;
  stage: string;
  PlannedExit?: string;
  LastTradeState?: string;
  relist?: Cs2StatusRelist | null;
  saleAttempts?: number;
  lastSaleFailure?: string | null;
  autoSelling?: boolean;
  waitingForSteamLoginSinceUtc?: string | null;
  missingFromInventorySinceUtc?: string | null;
}

export interface Cs2Budget { Name: string; Limit: number; Remaining: number; ResetUtc?: string; TooManyRequestsCount?: number; RequestsSent?: number; Known?: boolean }

/** `/cs2arbitragebot/status`, loosely: only what the console reads. */
export interface Cs2Status {
  startupState?: string;
  automationEnabled?: boolean;
  settings?: Record<string, any> | null;
  exchangeRateGbpPerUsd?: number | null;
  conversion?: { coefficient?: number; computedAtUtc?: string | null; basis?: string; topConverters?: any[] } | null;
  balances?: { csfloatUsd?: number | null; csfloatGbp?: number | null; csfloatFetchedUtc?: string | null; steamGbp?: number | null } | null;
  engine?: Record<string, any> | null;
  csfloatRateLimits?: Cs2Budget[] | null;
  steam?: Record<string, any> | null;
  bulkSteamPrices?: { Count?: number; LoadedAtUtc?: string; LastError?: string | null } | null;
  trades?: { lastPollUtc?: string | null; lastError?: string | null; pollRunningSinceUtc?: string | null; sellerSideUtc?: string | null; sellerSideError?: string | null } | null;
  steamSession?: Cs2SteamSession | null;
  inventoryCheck?: { lastCheckUtc?: string | null; lastOkUtc?: string | null } | null;
  exitModel?: Cs2ExitModelStatus | null;
  positions?: Cs2StatusPosition[];
  totals?: Record<string, any> | null;
  startupSteps?: { step: string; ms: number }[];
  /** Discord alerts the bot sent (newest first, last 31 days); absent on builds before Nov 2026. */
  alerts?: { key: string; atUtc: string; title?: string | null }[];
  legacyFilesOnDisk?: number;
}

/** v3 analytics: the exit model's verdicts on screen-passers (absent on older builds). */
export interface Cs2DailyV3 extends Cs2Daily { ModelChecked?: number; ModelConfirmed?: number; Blocked?: number; BestModelRoi?: number | null }
export interface Cs2AnalyticsV3 extends Cs2Analytics {
  ModelChecked?: number;
  ModelConfirmed?: number;
  Blocked?: number;
  BlockReasons?: Record<string, number>;
  FunnelSinceUtc?: string | null;
  Daily?: Record<string, Cs2DailyV3>;
}

export type Cs2xTone = 'ok' | 'warn' | 'crit' | 'info' | 'neutral';

const DAY_MS = 86_400_000;
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ms = (iso?: string | null) => (isRealDate(iso) ? new Date(iso as string).getTime() : NaN);

// ── Money ───────────────────────────────────────────────────────────────────

/** "+£0.39" / "−£1.20" with a real minus. */
export const fmtSignedGbp = (pounds?: number | null) =>
  typeof pounds === 'number' && Number.isFinite(pounds) ? `${pounds >= 0 ? '+' : '−'}£${Math.abs(pounds).toFixed(2)}` : '—';

/** 1.16M, 21.6k, 950. */
export const fmtCompactCount = (n?: number | null) => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
  return Math.round(n).toLocaleString();
};

/** Cost of a position in pounds (legacy records only carry the listing's price text). */
export const positionCostGbp = (p: Cs2Purchase) => (p.PurchaseCostPence ? p.PurchaseCostPence / 100 : p.comparison?.CSFloatListing?.PriceInPounds ?? 0);

/** Positions bought by the rebuilt engine (Oct 2026 on); the 2025 records carry no cost and a 1p "profit". */
export const isEnginePosition = (p: Cs2Purchase) => (p.PurchaseCostPence ?? 0) > 0;

export interface Cs2TrackRecord {
  completed: number;
  wins: number;
  profitGbp: number;
  costGbp: number;
  roi: number | null;
  medianDaysToCash: number | null;
  inferred: number;
  byHand: number;
  closedNoResult: number;
  cancelled: number;
  rows: Cs2TrackRow[];
}

export interface Cs2TrackRow {
  id: string;
  name: string;
  route: 'Steam' | 'CSFloat relist' | '—';
  boughtUtc?: string;
  closedUtc?: string;
  days: number | null;
  costGbp: number;
  resultGbp: number | null;
  roi: number | null;
  stage: number;
  how: 'trade' | 'inferred' | 'by hand' | 'no result' | 'refunded';
  image?: string;
}

/** What the bot has actually made: closed engine positions, their result, and how each result is known. */
export function trackRecord(purchases: Cs2Purchase[]): Cs2TrackRecord {
  const rows: Cs2TrackRow[] = [];
  for (const p of purchases) {
    if (!isEnginePosition(p) || isOpenPurchase(p)) continue;
    const cost = positionCostGbp(p);
    const closed = p.TimeOfCollectedRevenue ?? p.ResaleSoldAtUtc ?? null;
    const days = isRealDate(p.TimeOfPurchase) && isRealDate(closed) ? (ms(closed) - ms(p.TimeOfPurchase)) / DAY_MS : null;
    const state = String(p.LastTradeState ?? '');
    const how: Cs2TrackRow['how'] = p.CurrentStrategicStage === 8 ? 'refunded'
      : p.CurrentStrategicStage === 10 ? 'no result'
      : state === 'resale:inferred' ? 'inferred'
      : state.startsWith('closed:') ? 'by hand' : 'trade';
    const result = p.CurrentStrategicStage === 7 ? (p.ActualAbsoluteProfitInPounds ?? 0) : null;
    rows.push({
      id: p.CSFloatListingID,
      name: p.ItemMarketHashName,
      route: p.CurrentStrategicStage === 7 ? routeName(p.CSFloatResalePriceCents ? 2 : p.ActualSalePriceOnSteam ? 1 : p.PlannedExit === 'CSFloatRelist' ? 2 : 1) : '—',
      boughtUtc: p.TimeOfPurchase,
      closedUtc: isRealDate(closed) ? (closed as string) : undefined,
      days: days != null && days >= 0 ? days : null,
      costGbp: cost,
      resultGbp: result,
      roi: result != null && cost > 0 ? result / cost : null,
      stage: p.CurrentStrategicStage,
      how,
      image: p.comparison?.CSFloatListing?.ImageURL,
    });
  }
  rows.sort((a, b) => (ms(b.closedUtc ?? b.boughtUtc) || 0) - (ms(a.closedUtc ?? a.boughtUtc) || 0));
  const done = rows.filter((r) => r.stage === 7);
  const profit = done.reduce((s, r) => s + (r.resultGbp ?? 0), 0);
  const cost = done.reduce((s, r) => s + r.costGbp, 0);
  const days = done.map((r) => r.days).filter((d): d is number => d != null).sort((a, b) => a - b);
  return {
    completed: done.length,
    wins: done.filter((r) => (r.resultGbp ?? 0) > 0).length,
    profitGbp: profit,
    costGbp: cost,
    roi: cost > 0 ? profit / cost : null,
    medianDaysToCash: days.length ? days[Math.floor(days.length / 2)] : null,
    inferred: done.filter((r) => r.how === 'inferred').length,
    byHand: rows.filter((r) => r.how === 'by hand').length,
    closedNoResult: rows.filter((r) => r.how === 'no result').length,
    cancelled: rows.filter((r) => r.how === 'refunded').length,
    rows,
  };
}

/** Money tied up in open positions, and what the bot expects back. */
export function openBook(purchases: Cs2Purchase[]) {
  const open = purchases.filter(isOpenPurchase).filter(isEnginePosition);
  return {
    count: open.length,
    costGbp: open.reduce((s, p) => s + positionCostGbp(p), 0),
    expectedGbp: open.reduce((s, p) => s + (p.ExpectedAbsoluteProfitInPounds ?? 0), 0),
    legacyOpen: purchases.filter(isOpenPurchase).length - open.length,
  };
}

// ── The funnel: valued → screen → exit model → bought ───────────────────────

export interface Cs2FunnelDay {
  day: string;
  label: string;
  valued: number;
  screen: number;
  modelChecked: number | null;
  confirmed: number | null;
  blocked: number | null;
  bought: number;
  bestScreenRoi: number | null;
  bestModelRoi: number | null;
}

export function funnelDays(analytics: Cs2AnalyticsV3 | null, days: number, nowMs: number): Cs2FunnelDay[] {
  const map = analytics?.Daily ?? {};
  const since = analytics?.FunnelSinceUtc ? ms(analytics.FunnelSinceUtc) : NaN;
  return Array.from({ length: days }, (_, i) => {
    const day = utcDay(nowMs - (days - 1 - i) * DAY_MS);
    const d = map[day];
    // Before the exit-model counters existed the model's numbers are unknown, not zero.
    const known = d?.ModelChecked != null && (Number.isNaN(since) || Date.parse(`${day}T23:59:59Z`) >= since);
    return {
      day,
      label: day.slice(8, 10),
      valued: d?.Evaluated ?? 0,
      screen: d?.Qualified ?? 0,
      modelChecked: known ? d!.ModelChecked ?? 0 : null,
      confirmed: known ? d!.ModelConfirmed ?? 0 : null,
      blocked: known ? d!.Blocked ?? 0 : null,
      bought: d?.Purchased ?? 0,
      bestScreenRoi: d && d.BestRoi > -1 ? d.BestRoi : null,
      bestModelRoi: known && d!.BestModelRoi != null ? d!.BestModelRoi! : null,
    };
  });
}

export function funnelTotals(rows: Cs2FunnelDay[]) {
  const sum = (pick: (r: Cs2FunnelDay) => number | null) => rows.reduce((s, r) => s + (pick(r) ?? 0), 0);
  const modelKnown = rows.some((r) => r.modelChecked != null);
  return {
    valued: sum((r) => r.valued),
    screen: sum((r) => r.screen),
    modelChecked: modelKnown ? sum((r) => r.modelChecked) : null,
    confirmed: modelKnown ? sum((r) => r.confirmed) : null,
    blocked: modelKnown ? sum((r) => r.blocked) : null,
    bought: sum((r) => r.bought),
    lastBoughtDay: [...rows].reverse().find((r) => r.bought > 0)?.day ?? null,
  };
}

/** The last day anything was bought, from the purchases themselves (the daily counters only keep 90 days). */
export const lastPurchaseAt = (purchases: Cs2Purchase[]) =>
  purchases.filter(isEnginePosition).map((p) => p.TimeOfPurchase).filter(isRealDate).sort().pop() ?? null;

// ── Deal flow ───────────────────────────────────────────────────────────────

export type Cs2DealGroup = 'buy' | 'model' | 'screen';

/** Would buy · checked by the exit model and turned down · quick screen only (near-miss). */
export const dealGroup = (o: Cs2Evaluation): Cs2DealGroup => (o.ShouldBuy ? 'buy' : o.ExitModelChecked ? 'model' : 'screen');

/** The server's reason, trimmed to the part that explains the verdict (the full text is in the expanded row). */
export const shortReason = (o: Cs2Evaluation) => {
  const reason = o.Reason ?? '';
  const model = reason.match(/^exit model: best exit worth (\S+) \((\S+)\) after time, risk and fees/);
  if (model) return `model: worth ${model[1]} (${model[2]}) after locks, time & risk`;
  if (o.ShouldBuy) return reason.replace(/^exit model: /, '');
  const rejected = reason.match(/rejected: (.*)$/);
  if (rejected) return rejected[1];
  const bar = reason.match(/below the bar \((.*)\)$/);
  if (bar) return `under the bar (${bar[1]})`;
  return reason;
};

/** Splits the exit model's reason into its "— CSFloat at …" and "; Steam: …" parts for the detail row. */
export const reasonParts = (reason?: string | null) => {
  const text = reason ?? '';
  const dash = text.indexOf(' — ');
  const head = dash >= 0 ? text.slice(0, dash) : text;
  const rest = dash >= 0 ? text.slice(dash + 3) : '';
  return { head, exits: rest ? rest.split(/;\s+(?=Steam:|best relist:|CSFloat)/).map((s) => s.trim()).filter(Boolean) : [] };
};

export function matchesDeal(o: Cs2Evaluation, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).every((w) => o.MarketHashName.toLowerCase().includes(w) || o.Source?.toLowerCase() === w || o.ListingId === w);
}

// ── Positions ───────────────────────────────────────────────────────────────

/** Positions that need Klives (accept a trade, send a sold relist's trade, a stuck relist). */
export function needsYou(p: Cs2Purchase, live?: Cs2StatusPosition | null) {
  const state = String(p.LastTradeState ?? '');
  if (p.CurrentStrategicStage === 2) return 'accept';
  if (/^resale:(pending|queued|sold)$/.test(state)) return 'send';
  if (p.CurrentStrategicStage === 9 && (live?.relist?.overdue || (!isRealDate(p.ResaleSoldAtUtc) && (p.RelistTotalExposure ?? 0) >= RELIST_OVERDUE_EXPECTED_SALES))) return 'stuck';
  if (p.CurrentStrategicStage === 3 && live && live.autoSelling === false) return 'manual';
  return null;
}

/** One line per position: where it is in its locks and exit. */
export function positionLine(p: Cs2Purchase, nowMs: number) {
  const stage = p.CurrentStrategicStage;
  if (stage === 3) {
    const lifts = protectionEndsAt(p);
    if (lifts && ms(lifts) > nowMs) return `Trade-locked · sellable in ${fmtCountdown(lifts, nowMs)}`;
    if (isRealDate(p.SaleDeferredUntilUtc) && ms(p.SaleDeferredUntilUtc) > nowMs) return `Unlocked · exit waits (retry ${fmtAgo(p.SaleDeferredUntilUtc, nowMs)})`;
    return 'Unlocked · deciding the exit';
  }
  if (stage === 9) {
    if (p.LastTradeState === 'resale:sold') return `Sold on CSFloat ${fmtCents(p.CSFloatResalePriceCents)} · trade not seen`;
    if (isRealDate(p.ResaleSoldAtUtc)) return `Sold ${fmtCents(p.CSFloatResalePriceCents)} · waiting on the buyer's protection`;
    const parts = [`Relisted ${fmtCents(p.CSFloatResalePriceCents)}`];
    if (isRealDate(p.ListedOnCSFloatAtUtc)) parts.push(`up ${fmtCountdown(p.ListedOnCSFloatAtUtc, nowMs)}`);
    if (p.RelistBaseDaysToSell) parts.push(`~${fmtDays(p.RelistBaseDaysToSell)} expected`);
    if (p.RelistRepriceCount) parts.push(`${p.RelistRepriceCount}× re-priced`);
    return parts.join(' · ');
  }
  if (stage === 4) return `Listed on Steam ${fmtGbp(p.ActualSalePriceOnSteam)}`;
  if (stage === 7) return `Done · ${fmtSignedGbp(p.ActualAbsoluteProfitInPounds)}${p.LastTradeState === 'resale:inferred' ? ' (inferred)' : ''}`;
  if (stage === 8) return 'Trade cancelled · refunded';
  if (stage === 10) return 'Left the inventory · no result recorded';
  return `${currentRoute(p) === 'CSFloatRelist' ? 'Relist on CSFloat' : 'Sell on Steam'} · bought ${fmtAgo(p.TimeOfPurchase, nowMs)}`;
}

export interface Cs2TimelineEvent { label: string; at: string; future: boolean }

export function positionTimeline(p: Cs2Purchase, nowMs: number): Cs2TimelineEvent[] {
  const events: { label: string; at?: string | null; future?: boolean }[] = [
    { label: 'Bought', at: p.TimeOfPurchase },
    { label: 'Seller accepted', at: p.TimeOfSellerToAcceptSale },
    { label: 'Trade offer sent', at: p.TimeOfSellerToSendTradeOffer },
    { label: 'Received · protection starts', at: p.TimeOfItemRetrieval },
    { label: 'Trade protection lifts', at: protectionEndsAt(p), future: true },
    { label: 'Exit decided', at: p.ExitHistory?.find((d) => d.Stage === 'sale')?.AtUtc },
    { label: 'Listed on CSFloat', at: p.ListedOnCSFloatAtUtc },
    { label: 'Listed on Steam', at: p.ActualTimeResoldOnSteam },
    { label: 'Sold on CSFloat', at: p.ResaleSoldAtUtc },
    { label: 'Cash collected', at: p.TimeOfCollectedRevenue },
  ];
  if (p.CurrentStrategicStage === 9 && !isRealDate(p.ResaleSoldAtUtc)) events.push({ label: 'Next relist review', at: p.NextExitReviewUtc, future: true });
  if (p.CurrentStrategicStage === 3) events.push({ label: 'Exit retry', at: p.SaleDeferredUntilUtc, future: true });
  return events
    .filter((e) => isRealDate(e.at))
    .map((e) => ({ label: e.label, at: e.at as string, future: Boolean(e.future) && ms(e.at) > nowMs }))
    .filter((e) => !(e.label === 'Exit retry' && !e.future))
    .sort((a, b) => ms(a.at) - ms(b.at));
}

/** What lock or hold the position is in right now, if any. */
export function lockNote(p: Cs2Purchase, nowMs: number): { title: string; detail: string; tone: Cs2xTone } | null {
  const stage = p.CurrentStrategicStage;
  const lifts = protectionEndsAt(p);
  if (stage <= 2) return { title: 'Not received yet.', detail: "Once the trade lands, Valve's 7-day trade protection starts (it lifts on the next 07:00 UTC boundary).", tone: 'info' };
  if (stage === 3 && lifts) {
    const left = ms(lifts) - nowMs;
    if (left > 0) return { title: `Trade-locked for ${fmtCountdown(lifts, nowMs)}.`, detail: `Protection lifts ${fmtDateTime(lifts)}; the exit is decided an hour later with fresh prices.`, tone: 'neutral' };
    if (left < -DAY_MS) return { title: 'Still not sold a day after unlocking.', detail: 'If CSFloat still shows it as not tradable, something else is locking it (a reversal or a Steam restriction).', tone: 'crit' };
    return { title: 'Unlocked.', detail: 'Protection has lifted; the bot decides the exit on its next pass.', tone: 'ok' };
  }
  if (stage === 9) {
    if (p.LastTradeState === 'resale:sold') return { title: 'Sold, but its trade is not in sight.', detail: "CSFloat shows the listing sold. If its Trades page has it waiting, send it (2-hour deadline); the bot checks again every 6 hours.", tone: 'warn' };
    if (isRealDate(p.ResaleSoldAtUtc)) return { title: 'Sold — waiting on the buyer\'s protection.', detail: "CSFloat pays out when the buyer's 7-day protection lifts.", tone: 'info' };
    return { title: 'Listed on CSFloat.', detail: "When it sells, the money stays pending through the buyer's 7-day trade protection.", tone: 'info' };
  }
  if (stage === 4) return { title: 'Listed on the Steam market.', detail: 'The wallet comes back through converter items, which Steam holds 7 days before they sell on CSFloat.', tone: 'info' };
  return null;
}

export const decisionLabel = (d: Cs2ExitDecision) => ({
  purchase: 'planned at purchase',
  sale: 'when protection lifted',
  review: d.Action === 'keep' ? 'last review: kept' : `last review: ${d.Action}`,
} as Record<string, string>)[d.Stage] ?? d.Stage;

// ── Balances ────────────────────────────────────────────────────────────────

export interface Cs2BalancePoint { at: number; csfloat: number; steam: number; carried: boolean }

export function balanceSeries(balances: Cs2Balance[], days: number | null, nowMs: number): Cs2BalancePoint[] {
  const from = days == null ? -Infinity : nowMs - days * DAY_MS;
  return balances
    .map((b) => ({ at: Date.parse(b.DateTimeOfBalanceRecord), csfloat: b.CSFloatTotalBalanceInPounds ?? 0, steam: b.SteamTotalBalanceInPounds ?? 0, carried: Boolean(b.SteamBalanceCarriedForward) }))
    .filter((p) => Number.isFinite(p.at) && p.at >= from)
    .sort((a, b) => a.at - b.at);
}

/** Change in the total over the window, and the run of carried-forward Steam values at its end. */
export function balanceSummary(points: Cs2BalancePoint[]) {
  if (!points.length) return null;
  const first = points[0];
  const last = points[points.length - 1];
  let carriedSince: number | null = null;
  for (let i = points.length - 1; i >= 0 && points[i].carried; i--) carriedSince = points[i].at;
  return { total: last.csfloat + last.steam, change: last.csfloat + last.steam - (first.csfloat + first.steam), from: first.at, last, carriedSince };
}

// ── Verdict and the things that need Klives ────────────────────────────────

export type Cs2ActionKind = 'steam-login' | 'recheck' | 'open-position' | 'settings' | 'link';

export interface Cs2Attention {
  key: string;
  tone: Cs2xTone;
  title: string;
  detail: string;
  action?: { kind: Cs2ActionKind; label: string; id?: string; href?: string };
}

export interface Cs2Context {
  status: Cs2Status | null;
  statusError: string | null;
  analytics: Cs2AnalyticsV3 | null;
  purchases: Cs2Purchase[];
  nowMs: number;
}

const isStarting = (s: Cs2Status | null) => Boolean(s && s.startupState && s.startupState !== 'running' && !String(s.startupState).startsWith('ready') && !String(s.startupState).startsWith('failed'));

/** The one sentence at the top: what the bot is doing right now, and the single most important reason why. */
export function cs2Verdict(ctx: Cs2Context): { tone: Cs2xTone; word: string; headline: string; detail: string } {
  const s = ctx.status;
  if (!s) {
    return ctx.statusError
      ? { tone: 'crit', word: 'Unreachable', headline: 'The bot is not answering.', detail: ctx.statusError }
      : { tone: 'neutral', word: 'Connecting', headline: 'Reading the bot…', detail: '' };
  }
  const state = String(s.startupState ?? '');
  if (state.startsWith('failed')) return { tone: 'crit', word: 'Failed', headline: 'The bot failed to start.', detail: state };
  if (isStarting(s)) return { tone: 'info', word: 'Starting', headline: `Starting up: ${state}.`, detail: 'Scanning and selling begin once every model has loaded (a few minutes after a restart).' };
  if (!s.automationEnabled) return { tone: 'neutral', word: 'Viewer', headline: 'This instance only watches.', detail: 'Scanning, buying and selling run on the server only.' };
  const e = s.engine ?? {};
  const today = ctx.analytics?.Daily?.[utcDay(ctx.nowMs)];
  const feedAge = ctx.nowMs - ms(e.LastFeedPollUtc);
  if (s.settings && !s.settings.ScanningEnabled) return { tone: 'warn', word: 'Idle', headline: 'Scanning is switched off.', detail: 'Nothing is being watched. Turn on "Scan the market" in settings.' };
  if (e.CSFloatPausedUntilUtc) return { tone: 'warn', word: 'Paused', headline: 'CSFloat paused the bot.', detail: `Rate-limited or the key was refused; it resumes ${fmtAgo(e.CSFloatPausedUntilUtc, ctx.nowMs)}.` };
  if (Number.isFinite(feedAge) && feedAge > 5 * 60_000) return { tone: 'crit', word: 'Stalled', headline: 'The listing feed has stalled.', detail: `Last CSFloat poll ${fmtAgo(e.LastFeedPollUtc, ctx.nowMs)}.` };

  const rate = typeof e.ObservedListingsPerMinute === 'number' ? `${e.ObservedListingsPerMinute.toFixed(1)} new listings a minute` : 'every new listing';
  const screen = today?.Qualified ?? 0;
  const checked = today?.ModelChecked;
  const confirmed = today?.ModelConfirmed ?? 0;
  const buying = s.settings?.PurchasingEnabled !== false;
  if (!buying) {
    const model = checked != null ? `the exit model passed ${confirmed} of ${checked} it checked today` : `${screen} passed the quick screen today`;
    return { tone: 'warn', word: 'Watching', headline: 'Watching, not buying: auto-buy is off.', detail: `Valuing ${rate}; ${model}.` };
  }
  if (checked != null && checked > 0 && confirmed === 0) {
    return { tone: 'ok', word: 'Hunting', headline: 'Hunting. Nothing worth buying yet today.', detail: `Valuing ${rate}; the exit model turned down all ${checked} of today's ${screen} screen passes.` };
  }
  return { tone: 'ok', word: 'Hunting', headline: 'Hunting for underpriced listings.', detail: `Valuing ${rate}; ${screen} passed the quick screen today.` };
}

/** Everything that needs Klives, most urgent first, each with the one action that deals with it. */
export function cs2Attention(ctx: Cs2Context): Cs2Attention[] {
  const items: Cs2Attention[] = [];
  const s = ctx.status;
  const now = ctx.nowMs;
  const live = new Map((s?.positions ?? []).map((p) => [p.CSFloatListingID, p]));
  if (!s && ctx.statusError) items.push({ key: 'status', tone: 'crit', title: 'Bot unreachable', detail: ctx.statusError });

  for (const p of ctx.purchases) {
    const need = needsYou(p, live.get(p.CSFloatListingID));
    if (need === 'accept') {
      items.push({ key: `accept-${p.CSFloatListingID}`, tone: 'warn', title: 'Accept the trade offer', detail: p.ItemMarketHashName,
        action: p.CSFloatToSteamTradeOfferLink ? { kind: 'link', label: 'Open in Steam', href: p.CSFloatToSteamTradeOfferLink } : { kind: 'open-position', label: 'Open', id: p.CSFloatListingID } });
    } else if (need === 'send') {
      items.push({ key: `send-${p.CSFloatListingID}`, tone: 'warn', title: 'Send the CSFloat trade', detail: `${p.ItemMarketHashName} sold — send it from CSFloat's Trades page (2-hour deadline)`,
        action: { kind: 'link', label: 'CSFloat trades', href: 'https://csfloat.com/profile/trades' } });
    } else if (need === 'stuck') {
      const up = isRealDate(p.ListedOnCSFloatAtUtc) ? fmtCountdown(p.ListedOnCSFloatAtUtc, now) : 'long';
      items.push({ key: `stuck-${p.CSFloatListingID}`, tone: 'warn', title: 'Relist not selling', detail: `${p.ItemMarketHashName} has been up ${up} and should have sold ~${Math.round(p.RelistTotalExposure ?? live.get(p.CSFloatListingID)?.relist?.totalExposure ?? 0)}× by now`,
        action: { kind: 'recheck', label: 'Check on CSFloat', id: p.CSFloatListingID } });
    } else if (need === 'manual') {
      items.push({ key: `manual-${p.CSFloatListingID}`, tone: 'warn', title: 'Not sold automatically', detail: `${p.ItemMarketHashName}: ${live.get(p.CSFloatListingID)?.lastSaleFailure ?? 'sale attempts used up'}`,
        action: { kind: 'open-position', label: 'Open', id: p.CSFloatListingID } });
    }
  }

  const session = s?.steamSession;
  if (s?.automationEnabled && session?.problem) {
    const since = session.problemSinceUtc ?? session.refreshTokenRejectedUtc;
    items.push({
      key: 'steam-login', tone: 'warn', title: session.loginPromptOpen ? 'Steam login waiting for you' : 'Steam login needs approving',
      detail: session.loginPromptOpen
        ? 'Approve the sign-in request in the Steam app.'
        : `${session.problem}${isRealDate(since) ? ` (since ${fmtDateTime(since)})` : ''}. Selling on Steam and the Steam wallet are unavailable until then.`,
      action: session.loginPromptOpen ? undefined : { kind: 'steam-login', label: 'Ask me to approve' },
    });
  }
  const locks = s?.exitModel?.locks;
  if (locks?.csfloatSellingPaused && ctx.purchases.some((p) => p.CurrentStrategicStage === 3 || p.CurrentStrategicStage === 9)) {
    items.push({ key: 'away', tone: 'warn', title: 'CSFloat is set to away', detail: 'Relists are hidden and sales that would relist are waiting.' });
  }
  if (locks?.steamWalletHeadroomGbp != null && locks.steamWalletHeadroomGbp < 25) {
    items.push({ key: 'wallet-cap', tone: 'warn', title: 'Steam wallet near its cap', detail: `${fmtGbp(Math.max(0, locks.steamWalletHeadroomGbp))} of room — convert some back before Steam refuses a listing.` });
  }
  const following = ctx.purchases.some((p) => p.CurrentStrategicStage < 3 || p.CurrentStrategicStage === 9);
  const polled = s?.trades?.lastPollUtc;
  if (following && (s?.trades?.pollRunningSinceUtc || (isRealDate(polled) && now - ms(polled) > 10 * 60_000))) {
    items.push({ key: 'trades', tone: 'crit', title: 'Trade tracking stalled', detail: `Last CSFloat trade poll ${fmtAgo(polled, now)} — deliveries and sales are not being followed.` });
  }
  if (s?.steam && (s.steam.ConsecutiveFailures ?? 0) >= 10) {
    items.push({ key: 'steam-prices', tone: 'crit', title: 'Steam prices failing', detail: s.steam.LastError || `${s.steam.ConsecutiveFailures} failures in a row` });
  }
  const rank: Record<Cs2xTone, number> = { crit: 0, warn: 1, info: 2, ok: 3, neutral: 4 };
  return items.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

// ── Engine ──────────────────────────────────────────────────────────────────

export interface Cs2Loop { id: string; label: string; at?: string | null; every: string; tone: Cs2xTone; detail?: string }

/** The bot's loops with how fresh each is against its own cadence. */
export function engineLoops(s: Cs2Status | null, nowMs: number): Cs2Loop[] {
  const e = s?.engine ?? {};
  const fresh = (iso: string | null | undefined, okMs: number, warnMs: number): Cs2xTone => {
    const age = nowMs - ms(iso);
    if (!Number.isFinite(age)) return 'neutral';
    return age <= okMs ? 'ok' : age <= warnMs ? 'warn' : 'crit';
  };
  return [
    { id: 'feed', label: 'Listing feed', at: e.LastFeedPollUtc, every: typeof e.CurrentFeedIntervalSeconds === 'number' ? `every ${Math.round(e.CurrentFeedIntervalSeconds)} s` : 'continuous',
      tone: fresh(e.LastFeedPollUtc, 2 * 60_000, 5 * 60_000), detail: `${fmtCount(e.FeedPolls)} polls · ${e.FeedCoverageGaps ?? 0} coverage gaps` },
    { id: 'sweep', label: 'Discount sweeps', at: e.LastSweepUtc, every: 'every 5 min', tone: fresh(e.LastSweepUtc, 12 * 60_000, 30 * 60_000) },
    { id: 'structural', label: 'Whole-market scan', at: e.LastStructuralScanUtc, every: 'hourly', tone: fresh(e.LastStructuralScanUtc, 90 * 60_000, 3 * 3_600_000), detail: e.LastStructuralSummary ?? undefined },
    { id: 'conversion', label: 'Conversion model', at: e.LastConversionModelUtc ?? s?.conversion?.computedAtUtc, every: 'every 3 h', tone: fresh(e.LastConversionModelUtc ?? s?.conversion?.computedAtUtc, 4 * 3_600_000, 12 * 3_600_000) },
    { id: 'trades', label: 'Trade monitor', at: s?.trades?.lastPollUtc, every: '90 s while trading', tone: s?.trades?.pollRunningSinceUtc ? 'crit' : fresh(s?.trades?.lastPollUtc, 20 * 60_000, 60 * 60_000), detail: s?.trades?.lastError ?? undefined },
  ];
}

export const BUDGET_LABELS: Record<string, string> = {
  listings: 'Listing search', trades: 'Trades', history: 'Sales graph', 'history-sales': 'Recent sales', me: 'Account', inventory: 'Inventory',
  'price-list': 'Price list', 'modify-listing': 'Re-price', 'single-listing': 'One listing',
};

export function budgetRows(s: Cs2Status | null, nowMs: number) {
  return (s?.csfloatRateLimits ?? [])
    .filter((b) => b.Limit > 0 && b.Known !== false)
    .map((b) => {
      const pct = Math.max(0, Math.min(1, b.Remaining / b.Limit));
      return {
        name: b.Name,
        label: BUDGET_LABELS[b.Name] ?? b.Name,
        remaining: b.Remaining,
        limit: b.Limit,
        pct,
        resets: isRealDate(b.ResetUtc) ? fmtAgo(b.ResetUtc, nowMs) : '',
        tone: (b.TooManyRequestsCount ?? 0) > 0 && pct < 0.1 ? 'crit' : pct < 0.1 ? 'warn' : 'ok' as Cs2xTone,
        throttled: b.TooManyRequestsCount ?? 0,
      };
    })
    .sort((a, b) => a.pct - b.pct);
}

// ── Settings (OmniSettings names are the server's contract) ────────────────

export interface Cs2SettingMeta {
  label: string;
  help: string;
  group: 'Engine' | 'Buying thresholds' | 'Seller checks' | 'Exit model' | 'Risk limits' | 'Pacing & model';
  order: number;
  prefix?: string;
  suffix?: string;
  min?: number;
  step?: number;
}

export const CS2_SETTINGS: Record<string, Cs2SettingMeta> = {
  PerformCS2Scans: { group: 'Engine', order: 1, label: 'Scan the market', help: 'Run the live feed, sweeps and the hourly whole-market scan.' },
  PurchaseCSFloatArbitrageOpportunities: { group: 'Engine', order: 2, label: 'Buy automatically', help: 'Off = find and log only. On = buy what the exit model confirms, at once.' },
  CS2ArbitrageAllowCSFloatRelistExit: { group: 'Engine', order: 3, label: 'Allow CSFloat relist exit', help: 'Consider reselling on CSFloat after trade protection (no Steam fee, no wallet conversion).' },
  CS2ArbitrageAlertOnUnboughtOpportunities: { group: 'Engine', order: 4, label: 'Alert on unbought deals', help: 'Discord message when a qualifying listing is skipped (caps, balance, rejected purchase).' },
  CS2ArbitrageMinimumRelistROIPercent: { group: 'Buying thresholds', order: 1, label: 'Relist exit: minimum return', suffix: '%', min: 0, help: "Risk-adjusted: after CSFloat's fee, how long it takes to sell, the 7-day lock before and the buyer's protection after." },
  CS2ArbitrageMinimumSteamROIPercent: { group: 'Buying thresholds', order: 2, label: 'Steam exit: minimum return', suffix: '%', min: 0, help: "Risk-adjusted: after Steam fees, the conversion and the converters' 7-day hold. A very high value switches the Steam exit off." },
  CS2ArbitrageMinimumProfitPence: { group: 'Buying thresholds', order: 3, label: 'Minimum profit per trade', suffix: 'p', min: 0, help: 'Each trade needs a manual Steam accept — skip ones not worth it.' },
  CS2ArbitrageMinimumListingPriceCents: { group: 'Buying thresholds', order: 4, label: 'Ignore listings under', suffix: '¢ (USD)', min: 3, help: 'Feed price floor. Lower = more listings but the feed may not keep up.' },
  CS2ArbitrageMaximumListingPriceDollars: { group: 'Buying thresholds', order: 5, label: 'Ignore listings over', prefix: '$', min: 0, help: '0 = no absolute cap (the per-item balance share still applies).' },
  CS2ArbitrageRejectHighFailureSellers: { group: 'Seller checks', order: 1, label: 'Refuse sellers who fail trades', help: "Off = no listing is turned down for its seller's failure rate. The exit model still prices the chance the trade falls through (CSFloat refunds it)." },
  CS2ArbitrageMaxSellerFailurePercent: { group: 'Seller checks', order: 2, label: 'Highest failure rate allowed', suffix: '%', min: 0, help: "Failed plus avoided trades as a share of the seller's total. Listings from sellers above this are refused while the check is on." },
  CS2ArbitrageSellerFailureMinimumTrades: { group: 'Seller checks', order: 3, label: 'Judge sellers with at least', suffix: 'trades', min: 1, help: 'Sellers with fewer trades are not judged on their failure rate: a small sample says little.' },
  CS2ArbitrageMaxSpendPerItemPercent: { group: 'Risk limits', order: 1, label: 'Max spend per item', suffix: '% of balance', min: 1, help: 'Largest share of the CSFloat balance one listing may cost.' },
  CS2ArbitrageMaxUnitsPerItem: { group: 'Risk limits', order: 2, label: 'Max units of one item', min: 1, help: 'Held at once (bought, in trade, in protection or relisted).' },
  CS2ArbitrageDailySpendLimitPounds: { group: 'Risk limits', order: 3, label: 'Daily spend limit', prefix: '£', min: 0, help: '0 = unlimited.' },
  CS2ArbitrageSteamPriceHaircutPercent: { group: 'Risk limits', order: 4, label: 'Steam price safety haircut', suffix: '%', min: 0, help: "Used by the quick screen only; the exit model forecasts the lock's drift and risk itself." },
  CS2ArbitrageMinimumSteamBuyOrders: { group: 'Risk limits', order: 5, label: 'Minimum Steam buy orders', min: 0, help: 'An item needs at least this many buy orders to count as sellable on Steam.' },
  CS2ArbitrageAutoManageRelists: { group: 'Exit model', order: 1, label: 'Manage relists automatically', help: 'Re-price an unsold CSFloat relist, or switch it to Steam, when the evidence says so. Off = Discord advice only.' },
  CS2ArbitrageCapitalCostBasisPointsPerDay: { group: 'Exit model', order: 2, label: 'Cost of tied-up money', suffix: 'bp/day', min: 0, help: '20 = 0.2% a day. Every lock, hold and slow sale is charged at this rate.' },
  CS2ArbitrageRiskAversionTenths: { group: 'Exit model', order: 3, label: 'Risk aversion', suffix: '÷10', min: 0, help: '20 = 2.0. Higher prefers certain exits over uncertain ones. 0 = risk-neutral.' },
  CS2ArbitrageRelistHorizonDays: { group: 'Exit model', order: 4, label: 'Relist patience', suffix: 'days', min: 3, help: 'How long a relist is given before the model assumes its fallback.' },
  CS2ArbitrageSteamConfirmHours: { group: 'Exit model', order: 5, label: 'Steam confirmation delay', suffix: 'h', min: 0, help: "How long confirming a Steam listing in the app usually takes." },
  CS2ArbitrageSteamWalletCapDollars: { group: 'Exit model', order: 6, label: 'Steam wallet cap', prefix: '$', min: 0, help: 'Steam refuses a listing that would take the wallet past this.' },
  CS2ArbitrageDefaultConversionPercent: { group: 'Pacing & model', order: 1, label: 'Fallback conversion rate', suffix: '%', min: 40, help: 'Used until the conversion model has verified converters.' },
  CS2ArbitrageFeedMinIntervalSeconds: { group: 'Pacing & model', order: 2, label: 'Fastest feed poll', suffix: 's', min: 5, help: 'The 200/hour CSFloat key usually sets the pace anyway.' },
  CS2ArbitrageSteamRequestSpacingMs: { group: 'Pacing & model', order: 3, label: 'Steam request spacing', suffix: 'ms', min: 250, help: 'Backs off automatically on rate limits.' },
};

/** Credentials are managed on the admin settings page, never here. */
export const CS2_HIDDEN_SETTINGS = new Set(['CSFloatAPIKey', 'CS2ArbitrageBotSteamLoginUsername', 'CS2ArbitrageBotSteamLoginPassword']);
export const CS2_SETTING_GROUPS: Cs2SettingMeta['group'][] = ['Engine', 'Buying thresholds', 'Seller checks', 'Exit model', 'Risk limits', 'Pacing & model'];

/** One entry in the console's command palette (Ctrl K). */
export interface Cs2Command { id: string; title: string; group: string; icon: string; hint?: string; keywords?: string; run: () => void }

/** A Steam ROI bar this high means the Steam exit is effectively switched off. */
export const steamExitOff = (settings?: Record<string, any> | null) => (settings?.Evaluation?.MinimumSteamRoiPercent ?? 0) >= 200;
