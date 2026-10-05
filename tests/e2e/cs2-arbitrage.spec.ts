import { expect, test, type Page } from '@playwright/test';
import { dashboardTestOrigin, installDashboardApiMock, type ApiOverrides } from './fixtures/dashboard-api';

/**
 * The CS2 Arbitrage page against payloads shaped like the bot's real `/cs2arbitragebot/*` responses:
 * one position inside Valve's trade lock, one CSFloat relist that has sat unsold far longer than
 * expected, and a listing the exit model rejected after the quick screen passed it.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function cs2Fixtures(nowMs: number): ApiOverrides {
  const iso = (offsetMs: number) => new Date(nowMs + offsetMs).toISOString();

  const relistDecision = {
    AtUtc: iso(-10 * DAY), Stage: 'sale', Action: 'relist', Route: 'CSFloatRelist', Price: 380,
    ExpectedDaysToSell: 0.71, SellProbability: 0.95, CertaintyEquivalentPence: 270, SteamCertaintyEquivalentPence: 145,
    RelistCertaintyEquivalentPence: 270, SalesPerDay: 2.8, SalesRateBasis: 'CSFloat daily sales, last 30 days',
    MedianValueRatio: 0.96, DemandMultiplier: 1, DaysUntilTradable: 0,
    Rationale: 'CSFloat at $3.80 → ~17h to sell, 95% within the horizon, cash in ~8d after the buyer\'s protection, worth £2.70 now; Steam: Steam at £2.60 → £1.50 after fees, conversion and the converters\' 7-day hold, cash in ~15d, worth £1.45 now',
  };

  const locked = {
    CSFloatListingID: 'pos-locked',
    ItemMarketHashName: 'Sticker | Vitality (Holo) | Austin 2025',
    CurrentStrategicStage: 3,
    PlannedExit: 'CSFloatRelist',
    TimeOfPurchase: iso(-4 * DAY),
    TimeOfItemRetrieval: iso(-4 * DAY + HOUR),
    // Protection lifts in 3 days 4 hours; the bot decides the exit an hour after.
    PredictedTimeToBeResoldOnSteam: iso(3 * DAY + 4 * HOUR + HOUR),
    PurchaseCostPence: 52,
    ExpectedAbsoluteProfitInPounds: 0.11,
    ExpectedProfitPercentage: 21,
    PurchasePlan: { ...relistDecision, AtUtc: iso(-4 * DAY), Stage: 'purchase', Action: 'buy', Price: 92, DaysUntilTradable: 7.3,
      Rationale: 'CSFloat at $0.92 → ~1.9d to sell, 95% within the horizon, worth £0.63 now' },
    ExitHistory: [],
  };

  const overdue = {
    CSFloatListingID: 'pos-relisted',
    ItemMarketHashName: 'AK-47 | Slate (Field-Tested)',
    CurrentStrategicStage: 9,
    PlannedExit: 'CSFloatRelist',
    TimeOfPurchase: iso(-19 * DAY),
    TimeOfItemRetrieval: iso(-18 * DAY),
    PredictedTimeToBeResoldOnSteam: iso(-10 * DAY),
    PurchaseCostPence: 250,
    CSFloatResaleListingID: 'resale-1',
    CSFloatResalePriceCents: 372,
    ListedOnCSFloatAtUtc: iso(-10 * DAY),
    RelistBaseDaysToSell: 0.68,
    RelistModelExposure: 3.7,
    RelistTotalExposure: 14.7,
    RelistRepriceCount: 2,
    NextExitReviewUtc: iso(2 * HOUR),
    ExitHistory: [relistDecision, { ...relistDecision, AtUtc: iso(-1 * DAY), Stage: 'review', Action: 'reprice', Price: 372, DemandMultiplier: 0.31 }],
  };

  return {
    '/cs2arbitragebot/status': {
      startupState: 'running',
      automationEnabled: true,
      settings: { ScanningEnabled: true, PurchasingEnabled: true },
      engine: { State: 'running', LastFeedPollUtc: iso(-20_000), CurrentFeedIntervalSeconds: 19, FeedPolls: 120, FeedCoverageGaps: 0, ListingsSeen: 900, Evaluated: 1200, Prefiltered: 600, Opportunities: 1, RecentErrors: [] },
      conversion: { coefficient: 0.66, computedAtUtc: iso(-HOUR), basis: 'capacity-weighted', topConverters: [] },
      balances: { csfloatUsd: 98.46, csfloatGbp: 74.35, steamGbp: 12.5 },
      csfloatRateLimits: [],
      steam: { Successes: 300, Failures: 3, ConsecutiveFailures: 0, cachedBooks: 400, pacerIntervalMs: 1000 },
      exitModel: {
        settings: { CapitalCostPerDay: 0.002, RiskAversion: 2, RelistHorizonDays: 21, ConversionSigma: 0.04 },
        autoManageRelists: true,
        locks: {
          timeline: {
            protectionEndsAtUtcHour: 7, handoverHours: 0.11, verificationLagHours: 0.01, ownSendHours: 1,
            saleCancelRate: 0.02, purchaseCancelRate: 0.021, csfloatSaleToCashDays: 7.54, steamSaleToCashDays: 15.39,
            converterHoldDays: 7.35, purchasesObserved: 100, salesObserved: 0, measuredUtc: iso(-90_000),
          },
          converterHoldGrowth: 1,
          converterHoldSigma: 0.0877,
          steamWalletHeadroomGbp: 1312.4,
          csfloatSellingPaused: false,
        },
        market: {
          driftPerDay: { Skin: -0.0005, Sticker: -0.0015, Container: 0, Charm: -0.0025, Patch: -0.0017, Other: -0.0013 },
          observations: { Skin: 12, Sticker: 10, Container: 6, Charm: 5, Patch: 3, Other: 3 },
          volatilityScale: 1.12,
          forecastChecks: 39,
          coverageWithinOneSigma: 0.69,
        },
        calibration: { RelistTimeMultiplier: 1.4, RelistEpisodes: 2, RelistSales: 1, SteamForecastBiasLog: -0.02, CSFloatForecastBiasLog: 0.01, ForecastChecks: 1, RealisedVsExpected: 0.94, CompletedPositions: 1 },
      },
    },
    '/cs2arbitragebot/opportunities?limit=60': [{
      ListingId: 'l-astralis', MarketHashName: 'Patch | Astralis (Gold) | Stockholm 2021', PriceCents: 1090, CostPence: 823,
      ListingCreatedUtc: iso(-60_000), EvaluatedAtUtc: iso(-50_000), Source: 'feed', ConversionCoefficient: 0.66,
      SteamHighestBuyOrderPence: 821, SteamLowestSellOrderPence: 890, SteamBuyOrderCount: 400,
      Steam: { Route: 1, Available: true, ExpectedSalePrice: 796, NetCashPence: 455, ProfitPence: -368, Roi: -0.45, MeetsThreshold: false },
      Relist: { Route: 2, Available: true, ExpectedSalePrice: 1265, NetCashPence: 930, ProfitPence: 107, Roi: 0.13, MeetsThreshold: true },
      BestRoute: 2, BestRoi: -0.195, BestProfitPence: -162, ShouldBuy: false,
      Reason: 'exit model: best exit worth -19.5% (£-1.62) after time, risk and fees, below the bar (≥10% and ≥£0.40) — CSFloat at $11.13 → ~7.8d to sell, 75% within the horizon',
      ExitModelChecked: true, ScreenBestRoi: 0.13, ExpectedDaysToSell: 7.8, SellProbability: 0.75, PlannedPrice: 1113, CSFloatSalesPerDay: 0.4,
    }],
    '/cs2arbitragebot/getscanalytics': {
      TotalListingsScanned: 1200, NumberOfListingsBelow0PercentGain: 1100, NumberOfListingsBetween0And5PercentGain: 60,
      NumberOfListingsBetween5And10PercentGain: 30, NumberOfListingsBetween10And20PercentGain: 9, NumberOfListingsAbove20PercentGain: 1,
      FirstListingDateRecorded: iso(-30 * DAY), AnalyticsGeneratedAt: iso(0), QualifiedOpportunities: 3, PurchaseAttempts: 2, Purchases: 2,
      Daily: {}, AllPurchasedItems: [locked, overdue],
    },
    '/cs2arbitragebot/scanresults': [],
    '/cs2arbitragebot/latestliquidityplan': { Top10Gaps: [], ConversionCoefficientUsed: 0.66 },
    '/cs2arbitragebot/balanceHistory': [],
    '/OmniGlobalSettings/List': [
      { Name: 'CS2ArbitrageCapitalCostBasisPointsPerDay', Type: 2, Sensitive: false, Value: '20', ParentServiceName: 'CS2ArbitrageBot', ParentServiceId: 'cs2' },
      { Name: 'CS2ArbitrageAutoManageRelists', Type: 1, Sensitive: false, Value: 'true', ParentServiceName: 'CS2ArbitrageBot', ParentServiceId: 'cs2' },
      { Name: 'CS2ArbitrageMinimumRelistROIPercent', Type: 2, Sensitive: false, Value: '10', ParentServiceName: 'CS2ArbitrageBot', ParentServiceId: 'cs2' },
    ],
  };
}

async function openCs2Page(page: Page) {
  await installDashboardApiMock(page, 'Klives', cs2Fixtures(Date.now()));
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: dashboardTestOrigin }]);
  await page.goto('/schemery/cs2arbitragebot', { waitUntil: 'domcontentloaded' });
  const panel = page.getByTestId('cs2-exit-model');
  try {
    await panel.waitFor({ state: 'visible', timeout: 20_000 });
  } catch {
    // Nuxt dev occasionally aborts a module stream on the first load; one reload tells that apart from a real failure.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await panel.waitFor({ state: 'visible', timeout: 25_000 });
  }
}

test.describe('CS2 Arbitrage — trade locks and exit decisions', () => {
  test('shows the measured lock timeline the bot plans with', async ({ page }) => {
    await openCs2Page(page);
    const panel = page.getByTestId('cs2-exit-model');
    await expect(panel).toContainText('lifts 07:00 UTC');
    await expect(panel).toContainText('A purchase now is sellable');
    await expect(panel.locator('.cs2-kv', { hasText: 'Relist sale → spendable cash' })).toContainText('7.5d');
    await expect(panel.locator('.cs2-kv', { hasText: 'Steam sale → CSFloat cash' })).toContainText('15d');
    await expect(panel.locator('.cs2-kv', { hasText: "Converters' Steam hold" })).toContainText(/7\.[34]d/);
    await expect(panel).toContainText('last 100 purchases');
    await expect(panel.locator('.cs2-kv', { hasText: 'Stickers' })).toContainText('−4.4%');
  });

  test('a position inside its trade lock says when it can be sold', async ({ page }) => {
    await openCs2Page(page);
    const row = page.locator('.cs2-position', { hasText: 'Vitality (Holo)' });
    await expect(row).toContainText(/Trade-locked · sellable in 3d [34]h/);
    await row.click();
    await expect(page.getByTestId('cs2-lock-note')).toContainText(/Trade-locked for 3d [34]h/);
    await expect(page.locator('.cs2-subhead', { hasText: 'Exit decision' })).toContainText('planned at purchase');
    await expect(page.getByTestId('cs2-exit-decision')).toContainText('$0.92');
    await expect(page.locator('.cs2-timeline')).toContainText('Trade protection lifts');
  });

  test('an overdue relist shows its evidence, its last decision and an alert', async ({ page }) => {
    await openCs2Page(page);
    await expect(page.locator('.cs2-attention__item', { hasText: 'Relist overdue' })).toContainText('AK-47 | Slate (Field-Tested)');
    const row = page.locator('.cs2-position', { hasText: 'AK-47 | Slate' });
    await expect(row).toContainText('Relisted $3.72');
    await expect(row).toContainText('2× re-priced');
    await row.click();
    await expect(page.locator('.cs2-subhead', { hasText: 'Exit decision' })).toContainText('last review: reprice');
    const decision = page.getByTestId('cs2-exit-decision');
    await expect(decision).toContainText('$3.72');
    await expect(decision).toContainText('Demand marked down');
    await expect(page.getByTestId('cs2-relist-state')).toContainText('14.7 expected sales passed');
  });

  test('an opportunity the exit model rejected is labelled with the model value', async ({ page }) => {
    await openCs2Page(page);
    const row = page.locator('.cs2-table tr', { hasText: 'Astralis (Gold)' });
    await expect(row).toContainText('-19.5%');
    await expect(row.locator('.cs2-tag')).toHaveText('model');
    await expect(row).toContainText('~7.8d, 75%');
    await expect(row).toContainText('exit model: worth -19.5%');
  });

  test('the new exit-model settings have plain-English labels', async ({ page }) => {
    await openCs2Page(page);
    await page.getByRole('button', { name: /Settings/ }).click();
    const drawer = page.locator('.cs2-drawer');
    await expect(drawer.locator('h3', { hasText: 'Exit model' })).toBeVisible();
    await expect(drawer).toContainText('Cost of tied-up money');
    await expect(drawer).toContainText('Manage relists automatically');
    await expect(drawer).toContainText("buyer's protection after");
  });
});
