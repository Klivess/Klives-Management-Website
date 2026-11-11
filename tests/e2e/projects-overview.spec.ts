import { expect, test, type Page } from '@playwright/test';
import { dashboardTestOrigin, installDashboardApiMock } from './fixtures/dashboard-api';
import type { OverviewSnapshot, OverviewProject } from '../../composables/useProjectsOverview';

const names = ['Instagram audience growth', 'AI freelance services', 'Digital products on Gumroad', 'Hackforums research', 'Omnipotent testing', 'TikTok publishing', 'Market research lab', 'Client delivery pipeline', 'Product launch'];
function fixture(count = 9): OverviewSnapshot {
  const now = new Date();
  const series = Array.from({ length: 24 }, (_, i) => ({ date: new Date(+now - (23-i)*3600000).toISOString(), spendUsd: +(0.4 + (i%7)*0.15).toFixed(2), moneySpendUsd: i === 16 ? 2 : 0, completedSteps: i%3 === 0 ? 1 : 0, completed: i%4, failed: i === 12 ? 1 : 0, deferred: i%5 === 0 ? 1 : 0, cancelled: i === 7 ? 1 : 0 }));
  const projects: OverviewProject[] = Array.from({ length: count }, (_, i) => ({
    projectID: `project-${i}`, name: names[i] ?? `Operation ${i}`, status: i === 2 ? 'Blocked' : i === 4 ? 'Planning' : i === 6 ? 'Paused' : 'Active', halted: i === 6,
    executionDisposition: i === 2 ? 'Waiting' : 'Running', executionHealth: 'Healthy', blocker: i === 2 ? 'Payment account needs verification' : null,
    nextRetryAt: null, pendingApprovals: i === 1 ? 2 : 0,
    currentWork: ['Publishing the next audience-tested reel', 'Preparing a client delivery proposal', 'Waiting for account verification', 'Comparing feasible revenue opportunities'][i%4],
    currentWorkSource: 'Active step', currentWorkAt: new Date(+now - i * 3_600_000).toISOString(), workingAgents: i%3 === 0 ? 0 : 2, activityPhase: 'tool', subAgentCap: 5,
    tokenSpendUsd: 25+i*9, tokenBudgetUsd: i === 0 ? 999999 : 100, moneySpendUsd: 0, moneyBudgetUsd: 10, rangeSpendUsd: +(2.7+i*1.3).toFixed(2), rangeMoneySpendUsd: i%2,
    completedSteps: i%6, historicalAt: now.toISOString(), series,
    result: { observableID: `metric-${i}`, name: ['Audience reached', 'Revenue earned', 'Products published', 'Opportunities qualified'][i%4],
      selection: 'commander', direction: 'higher', rationale: 'Measures a concrete outcome tied to the project goal.', value: i%4 === 1 ? 120+i : 450+i*80,
      format: i%4 === 1 ? 'Currency' : 'Count', unit: null, delta: 24+i, observedAt: now.toISOString(), stale: i === 3, validity: i === 4 ? 'Unknown' : 'Valid', source: 'Agent',
      evidenceEventSequence: 123, evidenceArtifactIDs: ['result-report'], history: series.map((p,j) => ({ timestamp:p.date, value:200+j*10+i })) },
    resultOptions: [{ observableID: `metric-${i}`, name: 'Primary outcome' }, { observableID: `alternative-${i}`, name: 'Alternative outcome' }],
  }));
  if (count) projects.push({ ...projects[0], projectID:'archived-project', name:'Shelved experiment', status:'Archived', halted:false, workingAgents:0, series:[] });
  return { liveAt:now.toISOString(), historicalAt:now.toISOString(), range:{ key:'24h', fromUtc:new Date(+now-86400000).toISOString(), toUtc:now.toISOString(), label:'Last 24 hours', bucket:'hour' }, scope:'All unshelved projects', workingProjects:projects.filter(p => p.workingAgents).length, completedSteps:projects.filter(p=>p.status!=='Archived').reduce((n,p)=>n+p.completedSteps,0), modelSpendUsd:64.2, externalSpendUsd:12,
    execution:{ productiveRate:76, coveragePct:92, observedWakes:92, outcomes:100 }, series:count?series:[], projects,
    attention: count ? [{ projectID:'project-1', name:names[1], kind:'approval', label:'2 approval(s) pending' },{ projectID:'project-2', name:names[2], kind:'blocked', label:'Payment account needs verification' }] : [] };
}

type CacheHaltFixture = { engaged: boolean; engagedAt: string | null; reason: string; haltedProjectIDs: string[] };
async function setup(page: Page, count = 9, options: { startupResponses?: number; cacheHalt?: CacheHaltFixture; slowFleet?: boolean } = {}) {
  await installDashboardApiMock(page, 'Klives');
  await page.context().addCookies([{ name:'password', value:'e2e-klives', url:dashboardTestOrigin }]);
  const gateAge = new Date(Date.now() - 23 * 86_400_000).toISOString();
  const state = { snapshot:fixture(count), startupResponses:options.startupResponses ?? 0, mutations:[] as { path:string; body:any }[],
    cacheHalt: options.cacheHalt ?? { engaged:false, engagedAt:null, reason:'', haltedProjectIDs:[] as string[] },
    gates: [
      { gateID:'gate-old', projectID:'project-1', kind:'action', title:'Pick the unblock for the page: drop the seed, or authorize a new account', description:'The account has been frozen for six weeks. Two options were checked live; both are described in the plan.', rationale:'Unblocks the goal.', createdAt:gateAge },
      { gateID:'gate-new', projectID:'project-1', kind:'budget', title:'Raise the external budget to $25', description:'Ads test.', rationale:'', createdAt:new Date().toISOString() },
    ] };
  await page.routeWebSocket('wss://klive.dev/projects/events/stream**', () => {});
  await page.route('https://klive.dev/projects/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/projects/overview') {
      if (state.startupResponses > 0) {
        state.startupResponses--;
        await route.fulfill({ status:503, headers:{ 'Retry-After':'1' }, contentType:'application/json', body:JSON.stringify({ ready:false, stage:'Opening project history and runtime state' }) }); return;
      }
      const snapshot = structuredClone(state.snapshot); snapshot.range.key = url.searchParams.get('range') ?? '24h';
      await route.fulfill({ contentType:'application/json', body:JSON.stringify(snapshot) }); return;
    }
    if (url.pathname === '/projects/gates') {
      await route.fulfill({ contentType:'application/json', body:JSON.stringify(state.gates.filter(g => g.projectID === url.searchParams.get('projectID'))) }); return;
    }
    if (url.pathname === '/projects/cache-health') {
      await route.fulfill({ contentType:'application/json', body:JSON.stringify({ halt:state.cacheHalt, window:{ weightedHitRatePct:78.3, measuredRequests:20 }, settings:{} }) }); return;
    }
    if (url.pathname === '/projects/computers/health') {
      await route.fulfill({ contentType:'application/json', body:JSON.stringify({ available:true, daemonProblem:null, restartRequired:false }) }); return;
    }
    if (url.pathname === '/projects/list') {
      await route.fulfill({ contentType:'application/json', body:JSON.stringify(state.snapshot.projects.map(p => ({ projectID:p.projectID, name:p.name, status:p.status, halted:p.halted, executionDisposition:p.executionDisposition, pendingApprovals:p.pendingApprovals }))) }); return;
    }
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() ?? {}; state.mutations.push({ path:url.pathname, body });
      const p = state.snapshot.projects.find(x => x.projectID === body.projectID);
      if (url.pathname === '/projects/cache-health/clear') {
        state.cacheHalt = { engaged:false, engagedAt:null, reason:'', haltedProjectIDs:[] };
        if (body.unhalt) state.snapshot.projects.forEach(x => x.halted = false);
        await route.fulfill({ contentType:'application/json', body:JSON.stringify({ ok:true, pending:false, cleared:true, restored:body.unhalt ? 5 : 0, projectIDs:[], halt:state.cacheHalt }) }); return;
      }
      if (url.pathname === '/projects/halt-all') {
        if (options.slowFleet) { await route.fulfill({ status:202, contentType:'application/json', body:JSON.stringify({ ok:true, pending:true, halted:3, projectIDs:[], step:'cancel-wake' }) }); return; }
        state.snapshot.projects.forEach(x => { if (x.status !== 'Archived') { x.halted = true; x.workingAgents = 0; } });
        await route.fulfill({ contentType:'application/json', body:JSON.stringify({ ok:true, pending:false, halted:8, projectIDs:[] }) }); return;
      }
      if (url.pathname === '/projects/gates/resolve') {
        state.gates = state.gates.filter(g => g.gateID !== body.gateID);
        if (p) p.pendingApprovals = state.gates.filter(g => g.projectID === p.projectID).length;
        await route.fulfill({ contentType:'application/json', body:JSON.stringify({ ok:true }) }); return;
      }
      if (url.pathname === '/projects/result-pin' && p) { p.result.selection = body.observableID ? 'pinned' : 'commander'; p.result.observableID = body.observableID ?? `metric-${p.projectID.split('-')[1]}`; }
      if (url.pathname === '/projects/unarchive' && p) p.status = 'Paused';
      if (url.pathname === '/projects/pause' && p) p.status = 'Paused';
      await route.fulfill({ contentType:'application/json', body:JSON.stringify(p ?? { ok:true }) }); return;
    }
    await route.fallback();
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto('/projects', { waitUntil:'domcontentloaded' });
    try { await expect(page.getByTestId('fleet-verdict')).toBeVisible({ timeout:20_000 }); break; }
    catch (e) { if (attempt === 2) throw e; } // the dev server's first compile can leave the page blank
  }
  return state;
}

const rows = (page: Page) => page.getByTestId('project-board').locator('.pjx-row');

test('the board leads with one verdict, the figures and every live project', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width:1600, height:1000 });
  await setup(page);
  await expect(page.getByTestId('fleet-verdict')).toContainText('of 9 projects working');
  await expect(page.getByRole('region', { name:'Fleet summary' })).toContainText('$76.20');
  await expect(rows(page)).toHaveCount(9);
  await expect(page.getByRole('region', { name:'Needs you' })).toContainText('waiting 23 days');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await page.screenshot({ path:testInfo.outputPath('operations.png'), fullPage:true });
  expect(errors).toEqual([]);
});

test('an approval is decided from the board, oldest first, with an optional comment', async ({ page }) => {
  const state = await setup(page);
  const card = page.getByTestId('need-project-1');
  await expect(card).toContainText('Pick the unblock for the page');
  await expect(card).toContainText('+1 more in the project');
  await card.getByRole('button', { name:'Add a comment' }).click();
  await card.getByLabel('Comment for AI freelance services').fill('Go with the new account.');
  await card.getByRole('button', { name:'Approve' }).click();
  await expect.poll(() => state.mutations.find(m => m.path === '/projects/gates/resolve')?.body)
    .toEqual({ projectID:'project-1', gateID:'gate-old', decision:'Approve', comment:'Go with the new account.' });
  await expect(page.getByTestId('need-project-1')).toContainText('Raise the external budget');
});

test('a blocked project is unblocked from the needs queue', async ({ page }) => {
  const state = await setup(page);
  await page.getByTestId('need-project-2').getByRole('button', { name:'Unblock' }).click();
  await expect.poll(() => state.mutations.at(-1)).toEqual({ path:'/projects/resume', body:{ projectID:'project-2' } });
});

test('filters, search and the keyboard narrow and open projects', async ({ page }) => {
  await setup(page);
  const show = page.getByRole('group', { name:'Show' });
  await show.getByRole('button', { name:/Needs you/ }).click();
  await expect(rows(page)).toHaveCount(2);
  await show.getByRole('button', { name:/Shelved/ }).click();
  await expect(rows(page)).toHaveCount(1);
  await show.getByRole('button', { name:/^All/ }).click();
  await page.keyboard.press('/');
  await expect(page.getByLabel('Find a project')).toBeFocused();
  await page.getByLabel('Find a project').fill('gumroad');
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel('Find a project').fill('');
  await page.getByLabel('Find a project').blur();
  await page.keyboard.press('ArrowDown');
  const first = await rows(page).first().getAttribute('data-project-id');
  await expect(rows(page).first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/projects/${first}$`));
});

test('peeking a project shows its result and pins another one', async ({ page }) => {
  const state = await setup(page);
  await rows(page).filter({ hasText:'AI freelance services' }).locator('.pjx-row__work').click();
  const sheet = page.getByTestId('project-sheet');
  await expect(sheet).toContainText('Revenue earned');
  await expect(sheet).toContainText('event #123');
  await sheet.getByLabel('Primary result').selectOption('alternative-1');
  await sheet.getByLabel('Favourable direction').selectOption('lower');
  await sheet.getByRole('button', { name:'Save selection' }).click();
  await expect.poll(() => state.mutations.at(-1)?.body).toEqual({ projectID:'project-1', observableID:'alternative-1', direction:'lower' });
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('halt all asks first and halts the fleet', async ({ page }) => {
  const state = await setup(page);
  await page.getByTestId('fleet-halt').click();
  const dialog = page.getByRole('dialog', { name:'Halt every project?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name:'Halt all' }).click();
  await expect.poll(() => state.mutations.at(-1)?.path).toBe('/projects/halt-all');
  await expect(page.getByText('Halted 8 projects.')).toBeVisible();
  await expect(page.getByTestId('fleet-verdict')).toContainText('Fleet halted');
  await expect(page.getByTestId('fleet-unhalt')).toBeVisible();
});

test('a halt that is still settling says so instead of hanging', async ({ page }) => {
  await setup(page, 9, { slowFleet:true });
  await page.getByTestId('fleet-halt').click();
  await page.getByRole('dialog', { name:'Halt every project?' }).getByRole('button', { name:'Halt all' }).click();
  await expect(page.getByText(/Halting the fleet: 3 done so far, the rest finish by themselves \(now: cancel-wake\)/)).toBeVisible();
});

test('the prompt-cache guard is the verdict and is cleared from it', async ({ page }) => {
  const state = await setup(page, 9, { cacheHalt:{ engaged:true, engagedAt:new Date(Date.now() - 3_600_000).toISOString(), reason:'Weighted hit rate 57.3% under the 80% floor.', haltedProjectIDs:['project-0'] } });
  await expect(page.getByTestId('fleet-verdict')).toContainText('The prompt-cache guard has stopped the fleet');
  await expect(page.getByTestId('fleet-verdict')).toContainText('57.3%');
  await page.getByRole('button', { name:'Clear halt & resume' }).click();
  await expect.poll(() => state.mutations.at(-1)).toEqual({ path:'/projects/cache-health/clear', body:{ unhalt:true } });
});

test('the board waits through a Projects start-up and then opens', async ({ page }) => {
  await setup(page, 9, { startupResponses:2 });
  await expect(rows(page)).toHaveCount(9);
});

test('the palette jumps to a project', async ({ page }) => {
  await setup(page);
  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name:'Jump to' });
  await expect(palette).toBeVisible();
  await palette.getByLabel('Search projects, pages and actions').fill('tiktok');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/projects\/project-5$/);
});

test('a phone gets the same board without sideways scrolling', async ({ page }, testInfo) => {
  await page.setViewportSize({ width:390, height:844 });
  await setup(page);
  await expect(rows(page)).toHaveCount(9);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await page.screenshot({ path:testInfo.outputPath('operations-phone.png'), fullPage:true });
});
