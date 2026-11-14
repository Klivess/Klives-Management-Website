import { expect, test, type Page } from '@playwright/test';
import { openTech, type TechApiMock } from './fixtures/klivetech-api';

/**
 * The KliveTech console against a fake hub shaped like production (fixtures/klivetech-api.ts).
 * What it must do: show every gadget the hub knows, including the remembered ones it could not
 * reach (live on 13 Nov 2026 the old page said nothing had ever reported in while two had failed
 * five attempts each), run an action in one click, and ask the server for one batch at a time.
 */

const posts = (api: TechApiMock, path: string) => api.posts.filter(post => post.path === path);

async function hide(page: Page, hidden: boolean) {
  await page.evaluate(value => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.describe('KliveTech console', () => {
  test('says what needs attention and lists the whole fleet, the unreachable ones too', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openTech(page);

    await expect(page.getByTestId('ktx-verdict-title')).toHaveText('3 of 4 gadgets online');
    await expect(page.getByTestId('issue-unreachable-garage-1')).toContainText("KliveTech Garage Door didn't answer");
    await expect(page.getByTestId('issue-unreachable-garage-1')).toContainText('5 attempts');
    await expect(page.getByTestId('issue-relay-refused')).toContainText('turned away');
    await expect(page.getByTestId('issue-nearby-0A:1B:2C:3D:4E:77')).toContainText('KliveTech Porch Light');
    await expect(page.getByTestId('ktx-health')).toContainText('relay');

    await expect(page.getByTestId('kpi-gadgets')).toContainText('3/4');
    await expect(page.getByTestId('kpi-gadgets')).toContainText('1 unreachable');
    await expect(page.getByTestId('kpi-relay')).toContainText('1 turned away');
    await expect(page.getByTestId('kpi-radio')).toContainText('7 devices seen');
    await expect(page.getByTestId('kpi-firmware')).toContainText('Ready');

    // Online gadgets first, then the one that did not answer, then the one waiting to be let in.
    const garage = page.getByTestId('gadget-garage-1');
    await expect(garage.getByTestId('gadget-state')).toHaveText('Unreachable');
    await expect(garage.getByTestId('gadget-reason')).toContainText("Didn't answer: no answer");
    await expect(page.getByTestId('gadget-lamp-1').getByTestId('gadget-state')).toContainText('Online');
    await expect(page.getByTestId('gadget-plant-1')).toContainText('KliveTech Kitchen Hub');
    await expect(page.getByTestId('gadget-hub-1').getByTestId('gadget-carries')).toContainText('KliveTech Plant Sensor');
    await expect(page.getByTestId('nearby-0A:1B:2C:3D:4E:77')).toContainText('Not enrolled');
    await expect(page.getByTestId('ktx-linkmap')).toContainText('3 of 4 linked');
    await expect(page.getByTestId('ktx-feed')).toContainText('did not connect after 5 attempts');

    // One batch carries everything; nothing is read on its own.
    await expect.poll(() => api.batchCalls.length).toBeGreaterThanOrEqual(1);
    expect(api.batchCalls[0]).toEqual(expect.arrayContaining([
      '/klivetech/GetAllGadgets', '/klivetech/status?events=120', '/klivetech/streamables', '/klivetech/firmware/jobs',
      '/klivetech/firmware/config', '/klivetech/firmware/projects',
    ]));
    expect(api.directGets.filter(path => path.startsWith('/klivetech/'))).toEqual([]);
  });

  test('runs a gadget action from its card in one click', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openTech(page);
    const lamp = page.getByTestId('gadget-lamp-1');

    await lamp.getByTestId('run-Set light-true').click();
    await expect.poll(() => posts(api, '/klivetech/executegadgetaction').length).toBe(1);
    expect(posts(api, '/klivetech/executegadgetaction')[0].query).toMatchObject({ gadgetID: 'lamp-1', actionName: 'Set light', actionParam: 'true' });
    await expect(lamp.getByTestId('run-Set light-true')).toHaveAttribute('aria-pressed', 'true');

    await lamp.getByTestId('run-Reboot').click();
    await expect.poll(() => posts(api, '/klivetech/executegadgetaction').length).toBe(2);

    // A number is checked before it is sent.
    const brightness = lamp.getByTestId('input-Brightness');
    await brightness.fill('bright');
    await expect(lamp.getByTestId('action-Brightness')).toContainText('A whole number');
    await expect(lamp.getByTestId('run-Brightness')).toBeDisabled();
    await brightness.fill('200');
    await brightness.press('Enter');
    await expect.poll(() => posts(api, '/klivetech/executegadgetaction').length).toBe(3);
    expect(posts(api, '/klivetech/executegadgetaction')[2].query).toMatchObject({ actionName: 'Brightness', actionParam: '200' });

    // The card shows the first three one-click controls and says how many more there are.
    await expect(lamp).toContainText('+1 more');
  });

  test('retries an unreachable gadget, enrols a nearby one, forgets only after asking', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openTech(page);

    await page.getByTestId('retry-garage-1').click();
    await expect.poll(() => posts(api, '/klivetech/gadgets/reconnect').length).toBe(1);
    expect(posts(api, '/klivetech/gadgets/reconnect')[0].body).toEqual({ gadgetID: 'garage-1' });
    await expect(page.getByTestId('gadget-garage-1').getByTestId('gadget-state')).toHaveText('Connecting');

    await page.getByTestId('enrol-0A:1B:2C:3D:4E:77').click();
    await expect.poll(() => posts(api, '/klivetech/gadgets/enrol').length).toBe(1);
    expect(posts(api, '/klivetech/gadgets/enrol')[0].body).toEqual({ address: '0A:1B:2C:3D:4E:77' });
    await expect(page.getByTestId('enrol-0A:1B:2C:3D:4E:77')).toContainText('Connecting');

    await page.getByTestId('forget-garage-1').click();
    await expect(page.getByTestId('ktx-forget-dialog')).toBeVisible();
    expect(posts(api, '/klivetech/gadgets/forget')).toHaveLength(0);
    await page.getByTestId('ktx-forget-confirm').click();
    await expect.poll(() => posts(api, '/klivetech/gadgets/forget').length).toBe(1);
    await expect(page.getByTestId('gadget-garage-1')).toHaveCount(0);
  });

  test('opens a gadget with live telemetry; J and K move, Escape closes', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openTech(page);

    await page.getByRole('button', { name: 'Open KliveTech Desk Lamp' }).click();
    const sheet = page.getByTestId('ktx-sheet');
    await expect(page.getByTestId('ktx-sheet-title')).toHaveText('KliveTech Desk Lamp');
    await expect(page).toHaveURL(/gadget=lamp-1/);

    // The one live socket follows the sheet, and the chart fills from history and samples.
    await expect.poll(() => api.sockets.some(s => s.includes('/klivetech/streamables/live?gadgetID=lamp-1'))).toBe(true);
    await expect(sheet.getByTestId('stream-temperature').locator('.ktx-trace__line')).toHaveCount(1);
    await expect(sheet).toContainText('live');
    await expect(sheet.getByTestId('action-Say')).toBeVisible();

    await sheet.getByTestId('stream-toggle-camera').check();
    await expect.poll(() => posts(api, '/klivetech/streamables/control').length).toBe(1);
    expect(posts(api, '/klivetech/streamables/control')[0].body).toMatchObject({ gadgetID: 'lamp-1', streamID: 'camera', enabled: true });

    await page.keyboard.press('j');
    await expect(page.getByTestId('ktx-sheet-title')).not.toHaveText('KliveTech Desk Lamp');
    await page.keyboard.press('k');
    await expect(page.getByTestId('ktx-sheet-title')).toHaveText('KliveTech Desk Lamp');

    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(page).not.toHaveURL(/gadget=/);
  });

  test('opens the gadget named in the address', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openTech(page, { path: '/klivetech?gadget=garage-1' });
    await expect(page.getByTestId('ktx-sheet-title')).toHaveText('KliveTech Garage Door');
    await expect(page.getByTestId('ktx-sheet')).toContainText("It didn't answer 5 connection attempts");
    await expect(page.getByTestId('sheet-retry')).toBeVisible();
  });

  test('flashes firmware only after a confirmation, compiles without one, and shows the log', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openTech(page);

    await page.getByTestId('tab-firmware').click();
    const panel = page.getByTestId('ktx-firmware');
    await expect(panel.getByTestId('ready-toolchain')).toContainText('1.0.4');

    await panel.getByTestId('fw-project').selectOption('PlantSensor');
    await panel.getByTestId('fw-target').selectOption('lamp-1');
    await panel.getByTestId('fw-submit').click();
    await expect(page.getByTestId('ktx-flash-dialog')).toContainText('Flash KliveTech Desk Lamp?');
    expect(posts(api, '/klivetech/firmware/update')).toHaveLength(0);
    await page.getByTestId('ktx-flash-confirm').click();
    await expect.poll(() => posts(api, '/klivetech/firmware/update').length).toBe(1);
    expect(posts(api, '/klivetech/firmware/update')[0].body).toEqual({ project: 'PlantSensor', gadgetID: 'lamp-1' });

    const job = panel.getByTestId('job-job-2');
    await expect(job).toBeVisible();
    await expect(job).toHaveAttribute('aria-expanded', 'true');
    await expect(job.locator('.ktx-log__body [data-tone="crit"]')).toContainText('error: example failure line');

    await panel.getByTestId('fw-target').selectOption('');
    await panel.getByTestId('fw-submit').click();
    await expect.poll(() => posts(api, '/klivetech/firmware/compile').length).toBe(1);
    await expect(page.getByTestId('ktx-flash-dialog')).toHaveCount(0);
  });

  test('the palette runs an action from the keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openTech(page);

    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('ktx-palette')).toBeVisible();
    await page.getByTestId('ktx-palette-input').fill('set light on');
    await page.keyboard.press('Enter');
    await expect.poll(() => posts(api, '/klivetech/executegadgetaction').length).toBe(1);
    expect(posts(api, '/klivetech/executegadgetaction')[0].query).toMatchObject({ actionName: 'Set light', actionParam: 'true' });

    // Number keys switch the workbench.
    await page.keyboard.press('4');
    await expect(page.getByTestId('ktx-radio')).toContainText('Its access token does not match');
    await expect(page.getByTestId('relay-attempts')).toContainText('Wrong token');
  });

  test('a server without the status route still shows its connected gadgets', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openTech(page, { scenario: 'legacy' });

    await expect(page.getByTestId('ktx-verdict-title')).toHaveText('KliveTech Desk Lamp is online');
    await expect(page.getByTestId('ktx-verdict')).toContainText("doesn't report gadgets it couldn't reach");
    await expect(page.getByTestId('gadget-lamp-1')).toBeVisible();

    // The missing route is asked for once, then left out of every later batch.
    await expect.poll(() => api.batchCalls.length, { timeout: 12_000 }).toBeGreaterThanOrEqual(2);
    expect(api.batchCalls[0]).toContain('/klivetech/status?events=120');
    expect(api.batchCalls.at(-1)).not.toContain('/klivetech/status?events=120');
  });

  test('an empty fleet says how to connect the first gadget', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openTech(page, { scenario: 'empty' });

    await expect(page.getByTestId('ktx-verdict-title')).toHaveText('No gadgets yet');
    const setup = page.getByTestId('ktx-setup');
    await expect(setup).toContainText('Enrolment is off: it will appear here to let in with one click.');
    await expect(setup).toContainText('/klivetech/hub/connect');
    await expect(setup).toContainText('KliveTechArduinoCliPath');
    await expect(page.getByTestId('issue-toolchain')).toBeVisible();
  });

  test('asks for nothing while the tab is hidden', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openTech(page);
    await expect.poll(() => api.batchCalls.length).toBeGreaterThanOrEqual(1);

    await hide(page, true);
    const before = api.batchCalls.length;
    await page.waitForTimeout(6_500);
    expect(api.batchCalls.length).toBe(before);

    await hide(page, false);
    await expect.poll(() => api.batchCalls.length).toBeGreaterThan(before);
  });

  test('a read-only profile sees the fleet but no controls', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openTech(page, { permissions: ['klivetech.gadgets.read', 'klivetech.streamables.read'] });

    await expect(page.getByTestId('gadget-lamp-1')).toBeVisible();
    await expect(page.getByTestId('gadget-lamp-1').getByTestId('run-Reboot')).toBeDisabled();
    await expect(page.getByTestId('retry-garage-1')).toHaveCount(0);
    await expect(page.getByTestId('forget-garage-1')).toHaveCount(0);
    await expect(page.getByTestId('enrol-0A:1B:2C:3D:4E:77')).toHaveCount(0);
    // Firmware it may not read is not asked for.
    expect(api.batchCalls[0]).not.toContain('/klivetech/firmware/jobs');
  });

  test('fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTech(page);
    await expect(page.getByTestId('gadget-lamp-1')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: 'Open KliveTech Desk Lamp' }).click();
    const box = await page.getByTestId('ktx-sheet').boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(391);
  });
});
