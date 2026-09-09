import { expect, test, type Page } from '@playwright/test';
import { dashboardTestOrigin, installDashboardApiMock } from './fixtures/dashboard-api';
import type { OverviewSnapshot, OverviewProject } from '../../composables/useProjectsOverview';

const names = ['Instagram audience growth', 'AI freelance services', 'Digital products on Gumroad', 'Hackforums research', 'Omnipotent testing', 'TikTok publishing', 'Market research lab', 'Client delivery pipeline', 'Product launch'];
function fixture(count = 9): OverviewSnapshot {
  const now = new Date();
  const series = Array.from({ length: 24 }, (_, i) => ({ date: new Date(+now - (23-i)*3600000).toISOString(), spendUsd: +(0.4 + (i%7)*0.15).toFixed(2), moneySpendUsd: i === 16 ? 2 : 0, completedSteps: i%3 === 0 ? 1 : 0, completed: i%4, failed: i === 12 ? 1 : 0, deferred: i%5 === 0 ? 1 : 0, cancelled: i === 7 ? 1 : 0 }));
  const projects: OverviewProject[] = Array.from({ length: count }, (_, i) => ({
    projectID: `project-${i}`, name: names[i] ?? `Operation ${i}`, status: i === 2 ? 'Blocked' : i === 4 ? 'Planning' : i === 6 ? 'Paused' : 'Active', halted: i === 6,
    executionDisposition: i === 2 ? 'Waiting' : 'Ready', executionHealth: 'Healthy', blocker: i === 2 ? 'Payment account needs verification' : null,
    nextRetryAt: null, pendingApprovals: i === 1 ? 2 : 0,
    currentWork: ['Publishing the next audience-tested reel', 'Preparing a client delivery proposal', 'Waiting for account verification', 'Comparing feasible revenue opportunities'][i%4],
    currentWorkSource: 'Active step', currentWorkAt: now.toISOString(), workingAgents: i%3 === 0 ? 0 : 2, activityPhase: 'tool', subAgentCap: 5,
    tokenSpendUsd: 25+i*9, tokenBudgetUsd: 100, moneySpendUsd: 0, moneyBudgetUsd: 10, rangeSpendUsd: +(2.7+i*1.3).toFixed(2), rangeMoneySpendUsd: i%2,
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
    attention: count ? [{ projectID:'project-1', name:names[1], kind:'approval', label:'2 approvals pending' },{ projectID:'project-2', name:names[2], kind:'blocked', label:'Payment account needs verification' }] : [] };
}
async function setup(page: Page, count = 9, options: { waitForReady?: boolean; startupResponses?: number; historicalLoading?: boolean } = {}) {
  await installDashboardApiMock(page, 'Klives');
  await page.context().addCookies([{ name:'password', value:'e2e-klives', url:dashboardTestOrigin }]);
  const state = { snapshot:fixture(count), fail:false, failureBody:null as string | null, startupResponses:options.startupResponses ?? 0, calls:[] as string[], mutations:[] as { path:string; body:any }[], socket:null as any };
  if (options.historicalLoading) {
    state.snapshot.historicalLoading = true;
    state.snapshot.historicalLoadingMessage = 'Building historical activity for 9 projects from the durable event log';
    state.snapshot.projects.forEach(project => { project.historicalReady = false; });
  }
  await page.routeWebSocket('wss://klive.dev/projects/events/stream**', ws => { state.socket = ws; });
  await page.route('https://klive.dev/projects/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/projects/overview') {
      state.calls.push(url.searchParams.get('range')!);
      if (state.startupResponses > 0) {
        state.startupResponses--;
        await route.fulfill({ status:503, headers:{ 'Retry-After':'1' }, contentType:'application/json', body:JSON.stringify({ ready:false, stage:'Opening project history and runtime state' }) }); return;
      }
      if (state.failureBody) {
        await route.fulfill({ status:500, contentType:'text/plain', body:state.failureBody }); return;
      }
      const snapshot = structuredClone(state.snapshot); snapshot.range.key = url.searchParams.get('range')!;
      await route.fulfill({ status:state.fail?503:200, contentType:'application/json', body:JSON.stringify(snapshot) }); return;
    }
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); state.mutations.push({ path:url.pathname, body });
      const p = state.snapshot.projects.find(p=>p.projectID === body.projectID);
      if (url.pathname === '/projects/result-pin' && p) { p.result.selection = body.observableID ? 'pinned' : 'commander'; p.result.observableID = body.observableID ?? `metric-${p.projectID.split('-')[1]}`; }
      if (url.pathname === '/projects/unarchive' && p) p.status = 'Active';
      if (url.pathname === '/projects/unhalt-all') state.snapshot.projects.forEach(p=>p.halted=false);
      await route.fulfill({ contentType:'application/json', body:JSON.stringify({ saved:true, delivered:count, restored:1, halted:count }) }); return;
    }
    await route.fallback();
  });
  await page.goto('/projects', { waitUntil:'domcontentloaded' });
  if (options.waitForReady !== false) await expect(page.getByRole('region', { name:'Fleet summary' })).toBeAttached();
  return state;
}
async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => ({ x:document.documentElement.scrollWidth-innerWidth, y:document.documentElement.scrollHeight-innerHeight }))).toEqual({ x:0, y:0 });
  const clipped = await page.locator('.project-lane').evaluateAll(rows => rows.some(row => row.getBoundingClientRect().bottom > row.parentElement!.getBoundingClientRect().bottom + 1));
  expect(clipped).toBe(false);
  const occluded = await page.evaluate(() => {
    if (innerWidth >= 768) return false;
    const rail = document.querySelector('.vnav')!.getBoundingClientRect();
    const heading = document.querySelector('.projects-overview h1')!.getBoundingClientRect();
    return heading.left < rail.right;
  });
  expect(occluded, 'The mobile sidebar must not cover dashboard content').toBe(false);
}

for (const size of [{ width:1920,height:1080 }, { width:1366,height:768 }]) {
  test(`nine projects fit at ${size.width}×${size.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(size); const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message)); await setup(page);
    await expect(page.getByRole('group',{name:'Model and external spend, and completed steps over time'})).toBeVisible();
    await fits(page);
    expect(await page.locator('.project-lane').count()).toBeGreaterThanOrEqual(size.width===1920?9:4);
    await page.screenshot({ path:testInfo.outputPath('overview.png'),fullPage:true });
    expect(errors).toEqual([]);
  });
}
test('fleet totals survive pagination, searching, shelving and stable refresh', async ({ page }) => {
  const state=await setup(page,30); const initial=await page.locator('.project-lane').first().getAttribute('data-project-id');
  await page.getByRole('button',{name:'Next project page'}).click();
  expect(await page.locator('.project-lane').first().getAttribute('data-project-id')).not.toBe(initial);
  await expect(page.getByRole('region',{name:'Fleet summary'})).toContainText('$64.20');
  await page.getByRole('button',{name:'Previous project page'}).click();
  state.snapshot.projects[0].pendingApprovals=20; await page.getByRole('button',{name:'Refresh overview'}).click();
  await expect(page.getByRole('button',{name:'Refresh overview'})).toBeEnabled();
  expect(await page.locator('.project-lane').first().getAttribute('data-project-id')).toBe(initial);
  await page.getByLabel('Search projects').fill('Operation 29'); await expect(page.locator('.project-lane')).toHaveCount(1);
  await page.getByLabel('Search projects').fill(''); await page.getByRole('button',{name:'Shelved 1',exact:true}).click();
  await expect(page.locator('.project-lane')).toHaveCount(1); await page.getByRole('button',{name:'Unshelve',exact:true}).click();
  await expect.poll(()=>state.mutations.at(-1)?.path).toBe('/projects/unarchive');
});
test('inspector pins results, restores Commander choice, supports grouped chart points', async ({ page }) => {
  const state=await setup(page); await page.getByRole('button',{name:'Inspect result for AI freelance services',exact:true}).click();
  const dialog=page.locator('dialog'); await expect(dialog).toBeVisible(); await expect(dialog).toContainText('Event #123');
  await page.getByLabel('Primary result', {exact:true}).selectOption('alternative-1'); await page.getByLabel('Favourable direction').selectOption('lower');
  await page.getByRole('button',{name:'Save selection'}).click(); await expect.poll(()=>state.mutations.at(-1)?.body).toEqual({projectID:'project-1',observableID:'alternative-1',direction:'lower'});
  await page.getByLabel('Primary result',{exact:true}).selectOption(''); await page.getByRole('button',{name:'Save selection'}).click(); await expect.poll(()=>state.mutations.at(-1)?.body.observableID).toBe(null);
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  const point=page.getByRole('img',{name:'Project cost and delivery chart. Left and right arrows select a point; Enter opens its result.'}); await point.focus(); await page.keyboard.press('Enter'); await expect(dialog).toBeVisible();
});
test('live events refresh without row movement and failed refresh retains data', async ({ page }) => {
  const state=await setup(page); const before=state.calls.length;
  state.snapshot.projects[1].currentWork='Delivering the approved client report';
  await expect.poll(()=>!!state.socket).toBe(true); state.socket.send(JSON.stringify({kind:'project-event',projectID:'project-1',type:'activity-changed'}));
  await expect.poll(()=>state.calls.length).toBeGreaterThan(before); await expect(page.getByText('Delivering the approved client report')).toBeVisible();
  state.fail=true; await page.getByRole('button',{name:'Refresh overview'}).click(); await expect(page.locator('.notice[role=status]')).toContainText('last successful snapshot');
  await expect(page.getByText('Delivering the approved client report')).toBeVisible();
  state.fail=false; await page.getByRole('button',{name:'1H',exact:true}).click(); await expect.poll(()=>state.calls.at(-1)).toBe('1h');
  await expect(page.getByRole('button',{name:'Refresh overview'})).toBeEnabled(); await fits(page);
});
test('broadcast and fleet controls preserve mutation contracts', async ({ page }) => {
  const state=await setup(page); await page.getByRole('button',{name:'Broadcast',exact:true}).click(); await page.getByLabel('Message',{exact:true}).fill('Report the next measurable result.');
  await page.getByRole('button',{name:'Send to all',exact:true}).click(); await expect.poll(()=>state.mutations.at(-1)).toEqual({path:'/projects/broadcast',body:{text:'Report the next measurable result.'}});
  await page.getByRole('button',{name:'▶ Unhalt all (1)',exact:true}).click(); await expect.poll(()=>state.mutations.at(-1)?.path).toBe('/projects/unhalt-all');
  await expect(page.getByRole('button',{name:'Ⅱ Halt all',exact:true})).toBeEnabled(); await page.getByRole('button',{name:'Ⅱ Halt all',exact:true}).click(); await expect.poll(()=>state.mutations.at(-1)?.path).toBe('/projects/halt-all');
});
test('mobile tabs and empty fleet remain usable', async ({ page }, testInfo) => {
  await page.setViewportSize({width:390,height:844}); await setup(page,30); await fits(page); await page.screenshot({path:testInfo.outputPath('mobile-overview.png')});
  await page.getByRole('tab',{name:'projects',exact:true}).click(); await expect(page.locator('.project-lane').first()).toBeVisible(); await fits(page); await page.screenshot({path:testInfo.outputPath('mobile-projects.png')});
  await page.getByRole('tab',{name:'attention (2)',exact:true}).click(); await expect(page.getByRole('region',{name:'Mobile attention queue'})).toBeVisible(); await fits(page);
});
test('empty fleet and accessibility reflow do not clip controls', async ({ page }) => {
  await setup(page,0); await expect(page.getByText('No unshelved projects. Create a project or restore one from Shelved.')).toBeVisible(); await fits(page);
  await page.setViewportSize({width:640,height:450}); await page.getByRole('tab',{name:'projects',exact:true}).click();
  await expect(page.getByLabel('Search projects')).toBeVisible(); expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
});
test('server error details and degraded project warnings remain visible', async ({ page }) => {
  const state = await setup(page);
  state.failureBody = 'Observable history is invalid.';
  await page.getByRole('button',{name:'Refresh overview'}).click();
  await expect(page.locator('.notice[role=status]').first()).toContainText('Observable history is invalid.');
  state.failureBody = null;
  state.snapshot.degraded = true;
  state.snapshot.warnings = ['project-1: project results unavailable (legacy history was null)'];
  await page.getByRole('button',{name:'Refresh overview'}).click();
  await expect(page.getByText('Live operations loaded with partial project data.', { exact:false })).toBeVisible();
  await expect(page.getByText('project-1: project results unavailable', { exact:false })).toBeVisible();
});

test('service startup stays on a descriptive loading screen and retries automatically', async ({ page }) => {
  const state = await setup(page, 9, { waitForReady:false, startupResponses:2 });
  await expect(page.getByRole('status')).toContainText('Opening project history and runtime state');
  await expect(page.locator('.loading-state')).toContainText('The page will open automatically');
  await expect(page.getByRole('region', { name:'Fleet summary' })).toBeVisible({ timeout:5_000 });
  expect(state.calls.length).toBeGreaterThanOrEqual(3);
});

test('cold historical analytics never blocks live project status', async ({ page }) => {
  const state = await setup(page, 9, { historicalLoading:true });
  await expect(page.locator('.loading-notice')).toContainText('Building historical activity for 9 projects');
  await expect(page.locator('.project-lane').first()).toBeVisible();
  await expect(page.locator('.project-lane').first()).toContainText('Building activity');
  state.snapshot.historicalLoading = false;
  state.snapshot.historicalLoadingMessage = null;
  state.snapshot.projects.forEach(project => { project.historicalReady = true; });
  await expect(page.locator('.loading-notice')).toHaveCount(0, { timeout:5_000 });
});

test('Chart.js legends, aligned zoom, hover tooltips and project selection are interactive', async ({ page }) => {
  await page.setViewportSize({width:1920,height:1080});
  const state = await setup(page);
  const legend = page.getByRole('group', {name:'Model and external spend, and completed steps over time'});
  const model = page.getByRole('button',{name:'Model USD',exact:true});
  await model.click(); await expect(model).toHaveAttribute('aria-pressed','false');
  await model.click(); await expect(model).toHaveAttribute('aria-pressed','true');
  const reset = page.getByRole('button',{name:'Reset timeline zoom'});
  await page.getByRole('button',{name:'Zoom in on timeline'}).click();
  await expect(reset).toBeEnabled(); await expect(page.locator('.range-caption[data-zoomed="true"]')).toBeVisible();
  await reset.click(); await expect(reset).toBeDisabled();
  const canvas = legend.locator('canvas').first();
  const bounds = await canvas.boundingBox(); expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width * .25, bounds!.y + bounds!.height * .5);
  await page.mouse.down(); await page.mouse.move(bounds!.x + bounds!.width * .65, bounds!.y + bounds!.height * .5, {steps:8}); await page.mouse.up();
  await expect(reset).toBeEnabled();
  // Hovering and zooming are presentation-only; no analytics requests or mutations.
  expect(state.mutations).toEqual([]);
  await page.getByRole('button',{name:'Next project point'}).click();
  await expect(page.locator('.overview-charts [role="status"]')).toContainText('completed steps');
  await page.getByRole('button',{name:'Inspect selected project point'}).click();
  await expect(page.locator('dialog')).toBeVisible();
});
