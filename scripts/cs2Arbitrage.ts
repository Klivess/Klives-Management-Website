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
};

export const stageMeta = (stage: number): Cs2StageMeta =>
  CS2_STAGES[stage] ?? { label: `Unknown stage ${stage}`, short: '?', tone: 'neutral' };

/** Purchases still in play (not completed or cancelled). */
export const isOpenPurchase = (p: Cs2Purchase) => p.CurrentStrategicStage !== 7 && p.CurrentStrategicStage !== 8;

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
