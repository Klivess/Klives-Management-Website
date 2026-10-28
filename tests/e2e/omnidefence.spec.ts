import { expect, test, type Page } from '@playwright/test';
import { dashboardTestOrigin, installDashboardApiMock, type ApiOverrides } from './fixtures/dashboard-api';

/**
 * OmniDefence's "Needs review" rail against an overview shaped like production on 2026-10-28:
 * exploit scanners classified with high confidence but still answered, and website visitors the
 * classifier calls people sitting on Watch or Blocked. Addresses are documentation ranges.
 */

const NOW = Math.floor(Date.now() / 1000);

function reviewItem(ip: string, classification: string, status: string, score: number, requests: number, reason: string | null = null) {
  return { ip, classification, confidence: 0.97, status, score, requests, unauth: 0, lastSeen: NOW - 3600, country: 'NL', network: 'Example Hosting', reason, tags: 'Datacenter' };
}

function overview(): Record<string, unknown> {
  return {
    asOfUtc: new Date().toISOString(),
    requests24h: 2812, totalRequests: 1_648_252, requests7d: 25_844, denied24h: 544, totalDenied: 143_761,
    authFailures24h: 2, unauth24h: 2, totalAuthEvents: 1675, blockedIps: 47, watchedIps: 125, honeypotIps: 0, tarpitIps: 0,
    totalIps: 5413, knownIps: 5413, topThreat: null, topAttackers: [], topRoutes: [], originBreakdown: [],
    classBreakdown: { VulnScanner: 262 }, tagBreakdown: {},
    review: {
      hostileAnsweredCount: 20,
      hostileAnswered: [
        reviewItem('198.51.100.17', 'VulnScanner', 'Watch', 189, 271),
        reviewItem('198.51.100.23', 'VulnScanner', 'Normal', 45, 10),
      ],
      benignPenalisedCount: 1,
      benignPenalised: [reviewItem('203.0.113.40', 'LikelyHuman', 'Blocked', 345, 162, 'Auto: threat score reached 257')],
    },
    health: { overviewBuildMs: 23, auditQueue: 4, auditRowsDropped: 0, readPoolTimeouts: 0, fingerprintBacklog: 0 },
  };
}

function ipDetail(ip: string) {
  return {
    record: { Ip: ip, Status: 'Blocked', ThreatScore: 345, TotalRequests: 162, Classification: 'LikelyHuman', FirstSeen: NOW - 86400, LastSeen: NOW - 3600 },
    recentRequests: [], events: [], auth: [],
  };
}

async function openOmniDefence(page: Page) {
  const overrides: ApiOverrides = {
    '/omnidefence/overview': overview(),
    '/omnidefence/ip-map': [],
    '/omnidefence/ips': [],
    '/omnidefence/requests': [],
    '/omnidefence/regions': [],
    '/omnidefence/ip': ipDetail('203.0.113.40'),
    '/omnidefence/ip/untrap': { ok: true },
    '/omnidefence/ip/block': { ok: true },
  };
  const api = await installDashboardApiMock(page, 'Klives', overrides);
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: dashboardTestOrigin }]);
  await page.goto('/omnidefence', { waitUntil: 'domcontentloaded' });
  return api;
}

test('Needs review shows attackers still answered and people turned away', async ({ page }) => {
  await openOmniDefence(page);
  const rail = page.locator('.rail-section', { hasText: 'Needs Review' });

  await expect(rail.locator('.review-head', { hasText: 'Attackers still answered' })).toContainText('20');
  await expect(rail.locator('.review-row', { hasText: '198.51.100.17' })).toContainText('Vuln scanner / 271 req / Watch');
  await expect(rail.locator('.review-head', { hasText: 'People on Watch / Blocked' })).toContainText('1');
  await expect(rail.locator('.review-row', { hasText: '203.0.113.40' })).toContainText('Likely human / Blocked / 345');
  await expect(rail.locator('.review-health')).toContainText('Overview 23 ms');
});

test('Release lets a misjudged visitor back in; Block asks for a reason first', async ({ page }) => {
  const api = await openOmniDefence(page);
  const rail = page.locator('.rail-section', { hasText: 'Needs Review' });

  await rail.locator('.review-row', { hasText: '203.0.113.40' }).getByRole('button', { name: 'Release' }).click();
  await expect.poll(() => api.mutations.find(m => m.path === '/omnidefence/ip/untrap')?.body ?? '').toContain('203.0.113.40');

  await rail.locator('.review-row', { hasText: '198.51.100.17' }).getByRole('button', { name: 'Block' }).click();
  await page.locator('.swal2-input').fill('exploit probes');
  await page.locator('.swal2-confirm').click();
  await expect.poll(() => api.mutations.find(m => m.path === '/omnidefence/ip/block')?.body ?? '').toContain('exploit probes');
});

test('the full IP map is not refetched on every 5 s refresh', async ({ page }) => {
  const api = await openOmniDefence(page);
  await expect(page.locator('.rail-section', { hasText: 'Needs Review' })).toBeVisible();
  const count = (path: string) => api.requestedPaths.filter(p => p.split('?')[0] === path).length;

  // Two refresh ticks: the overview is polled each time, the 4 MB map is not.
  await expect.poll(() => count('/omnidefence/overview'), { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  expect(count('/omnidefence/ip-map')).toBe(1);
});
