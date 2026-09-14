import { expect, test, type Page } from '@playwright/test';
import { dashboardTestOrigin, installDashboardApiMock } from './fixtures/dashboard-api';

/**
 * Removing an agent is instant, destroys a container, and cannot be undone — so the UI's job is to
 * state the cost BEFORE the click and account for what happened after it. These tests pin exactly
 * that: that the confirm names what is in flight, that the Commander is never offered up, that a cap
 * reduction warns before it retires anyone, and that preserved work is visible rather than implied.
 */

const projectID = 'project-roster';

function agent(over: Record<string, any> = {}) {
  return {
    agentID: 'w1', role: 'scraper', tier: 'Text', parentAgentID: 'commander',
    createdAt: '2026-09-12T09:00:00Z', mission: 'Task', workStatus: 'Running',
    objective: 'Scrape the supplier catalogue into a CSV',
    activeMilestoneIDs: [], lastReport: null, lastReportAt: null, lastWakeAt: '2026-09-12T11:55:00Z',
    isCommander: false, awake: false, reclaimable: false, helperAgentIDs: [],
    ...over,
  };
}

const commander = agent({
  agentID: 'commander', role: 'commander', parentAgentID: null, isCommander: true,
  objective: 'Coordinate the project to its approved goal.', awake: true,
});

async function setup(page: Page, options: {
  agents?: any[];
  handovers?: any[];
  cap?: number;
} = {}) {
  await installDashboardApiMock(page, 'Klives');
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: dashboardTestOrigin }]);

  const state = {
    agents: options.agents ?? [commander, agent()],
    handovers: options.handovers ?? [],
    cap: options.cap ?? 4,
    retireCalls: [] as any[],
    budgetCalls: [] as any[],
  };

  await page.routeWebSocket('wss://klive.dev/projects/events/stream**', () => { /* silent */ });
  await page.route('https://klive.dev/projects/**', async route => {
    const url = new URL(route.request().url());
    const json = (body: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (url.pathname === '/projects/agents/retire') {
        state.retireCalls.push(body);
        const going = new Set<string>([body.agentID, ...(body.agentIDs ?? [])]);
        // Helpers leave with their parent, exactly as the backend expands the request.
        for (const a of state.agents) if (going.has(a.agentID)) for (const h of a.helperAgentIDs ?? []) going.add(h);
        state.agents = state.agents.filter(a => !going.has(a.agentID));
        return json({ ok: true, retired: [...going].map(id => ({ agentID: id, role: 'scraper' })), slotsFree: 2 });
      }
      if (url.pathname === '/projects/budget/update') {
        state.budgetCalls.push(body);
        const over = Math.max(0, state.agents.filter(a => !a.isCommander).length - (body.subAgentCap - 1));
        const doomed = state.agents.filter(a => !a.isCommander).slice(0, over);
        state.agents = state.agents.filter(a => !doomed.includes(a));
        state.cap = body.subAgentCap;
        return json({
          projectID, name: 'Roster project', goal: 'g', status: 'Active',
          tokenBudgetUsd: body.tokenBudgetUsd, moneyBudgetUsd: body.moneyBudgetUsd,
          moneyAutonomousThresholdUsd: body.moneyAutonomousThresholdUsd, subAgentCap: body.subAgentCap,
          retiredAgents: doomed.map(a => ({
            handoverID: 'h-' + a.agentID, agentID: a.agentID, role: a.role,
            activeMilestoneIDs: a.activeMilestoneIDs ?? [], status: 'Open',
          })),
        });
      }
      return json({ ok: true });
    }

    if (url.pathname === '/projects/get') {
      return json({
        projectID, name: 'Roster project', goal: 'Ship the thing', status: 'Active',
        createdAt: '2026-09-10T09:00:00Z', tokenBudgetUsd: 100, moneyBudgetUsd: 10,
        moneyAutonomousThresholdUsd: 2, subAgentCap: state.cap,
      });
    }
    if (url.pathname === '/projects/agents') return json(state.agents);
    if (url.pathname === '/projects/agents/handovers') return json(state.handovers);
    if (url.pathname === '/projects/containers') return json([]);
    if (url.pathname === '/projects/events') return json({ events: [], lastSequence: 0 });
    if (url.pathname === '/projects/ledger') return json({ tokenSpendUsd: 4, moneySpendUsd: 0 });
    if (url.pathname === '/projects/grandplan') return json({ current: null, versions: [] });
    if (url.pathname === '/projects/digest') return json({});
    return json([]);
  });

  await page.goto(`/projects/${projectID}`);
  await expect(page.getByRole('heading', { name: 'Roster project' })).toBeVisible();
  return state;
}

async function openAgentsTab(page: Page) {
  await page.getByRole('button', { name: 'Agents', exact: true }).click();
  await expect(page.locator('.ap-list')).toBeVisible();
}

test('the roster shows slot arithmetic and offers Retire on workers but never the Commander', async ({ page }) => {
  await setup(page, { agents: [commander, agent()], cap: 4 });
  await openAgentsTab(page);

  await expect(page.locator('.ap-slots')).toContainText('2 of 4 slots');
  await expect(page.locator('.ap-slots')).toContainText('2 free');

  // The Commander is the agent work is handed BACK to, so retiring it is not offered at all.
  await expect(page.locator('.ap-item.is-commander .ap-retire')).toHaveCount(0);
  await expect(page.locator('.ap-item:not(.is-commander) .ap-retire')).toHaveCount(1);
});

test('the confirm names what retiring an agent would interrupt', async ({ page }) => {
  await setup(page, {
    agents: [commander, agent({
      awake: true, mission: 'Standing', activeMilestoneIDs: ['m2', 'm3'], helperAgentIDs: ['h9'],
    })],
  });
  await openAgentsTab(page);
  await page.locator('.ap-item:not(.is-commander) .ap-retire').click();

  const modal = page.locator('.ap-modal');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('generating right now');
  await expect(modal).toContainText('m2, m3');
  await expect(modal).toContainText('standing beat');
  await expect(modal).toContainText('h9');
  // And it says the work survives, because otherwise this reads as destroying the work itself.
  await expect(modal).toContainText('preserved');
});

test('a clean worker is described as a clean removal', async ({ page }) => {
  await setup(page, { agents: [commander, agent({ awake: false, reclaimable: true })] });
  await openAgentsTab(page);
  await page.locator('.ap-item:not(.is-commander) .ap-retire').click();

  await expect(page.locator('.ap-modal')).toContainText('Nothing in flight');
});

test('confirming retires the agent and it leaves the roster', async ({ page }) => {
  const state = await setup(page, { agents: [commander, agent()] });
  await openAgentsTab(page);
  await page.locator('.ap-item:not(.is-commander) .ap-retire').click();
  await page.locator('.ap-modal-note input').fill('too expensive for what it produced');
  await page.getByRole('button', { name: 'Retire now' }).click();

  await expect(page.locator('.ap-modal')).toHaveCount(0);
  await expect(page.locator('.ap-item')).toHaveCount(1);
  expect(state.retireCalls).toHaveLength(1);
  expect(state.retireCalls[0].agentID).toBe('w1');
  // The note reaches the Commander, so it must actually be sent.
  expect(state.retireCalls[0].note).toBe('too expensive for what it produced');
});

test('unclaimed work from retired agents is shown above the roster', async ({ page }) => {
  await setup(page, {
    handovers: [{
      handoverID: 'h1', agentID: 'w9', role: 'researcher', reason: 'CapLowered', status: 'Open',
      mission: 'Task', objective: 'Compare the three supplier APIs',
      activeMilestoneIDs: ['m4'], deliverablePaths: ['outputs/compare.md'],
      openDirectives: 1, interruptedMidWake: true, retiredAt: '2026-09-12T11:00:00Z',
    }],
  });
  await openAgentsTab(page);

  const panel = page.locator('.ap-handovers');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('researcher');
  await expect(panel).toContainText('slot reclaimed by a lower cap');
  await expect(panel).toContainText('Compare the three supplier APIs');
  await expect(panel).toContainText('1 milestone unowned');
  await expect(panel).toContainText('interrupted mid-wake');
});

test('lowering the cap below the roster warns first, then reports who was retired', async ({ page }) => {
  const state = await setup(page, {
    agents: [commander, agent({ agentID: 'w1' }), agent({ agentID: 'w2', activeMilestoneIDs: ['m7'] })],
    cap: 4,
  });

  await page.locator('.budget-edit-btn').click();
  const capInput = page.locator('.bf-field', { hasText: 'Agent cap' }).locator('input');
  await capInput.fill('1');

  // The warning has to appear BEFORE saving — this is the whole point of the affordance.
  const warn = page.locator('.bf-warn');
  await expect(warn).toBeVisible();
  await expect(warn).toContainText('2 agents will be retired immediately');
  await expect(warn).toContainText('no work is lost');
  await expect(page.getByRole('button', { name: 'Save and retire 2' })).toBeVisible();

  await page.getByRole('button', { name: 'Save and retire 2' }).click();

  const summary = page.locator('.bf-retired');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('w1');
  await expect(summary).toContainText('w2');
  await expect(summary).toContainText('1 milestone now unowned');
  expect(state.budgetCalls[0].subAgentCap).toBe(1);
});

test('raising the cap retires nobody and shows no warning', async ({ page }) => {
  await setup(page, { agents: [commander, agent()], cap: 4 });

  await page.locator('.budget-edit-btn').click();
  await page.locator('.bf-field', { hasText: 'Agent cap' }).locator('input').fill('8');

  await expect(page.locator('.bf-warn')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save budgets' })).toBeVisible();
});
