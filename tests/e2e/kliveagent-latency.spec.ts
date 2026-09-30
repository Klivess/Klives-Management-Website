import { expect, test } from '@playwright/test';
import { openDashboard } from './fixtures/dashboard-api';

for (const supportsWait of [true, false]) {
  test(`chat receives progress and completion from ${supportsWait ? 'waiting' : 'legacy'} servers`, async ({ page }) => {
    await openDashboard(page, 'Klives');
    await page.addInitScript(() => {
      const original = window.setTimeout;
      (window as any).pendingPollDelays = 0;
      window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: any[]) => {
        if (timeout === 600) (window as any).pendingPollDelays++;
        return original(handler, timeout, ...args);
      }) as typeof window.setTimeout;
    });
    await page.goto('/kliveagent');
    const headers: Record<string, string> = {
      'access-control-allow-origin': '*', 'content-type': 'application/json',
      'access-control-expose-headers': 'X-Klive-Pending-Wait',
    };
    if (supportsWait) headers['X-Klive-Pending-Wait'] = 'supported';
    let conversationId = '';
    const sequences: string[] = [];
    await page.route('https://klive.dev/kliveagent/chat', async route => {
      conversationId = JSON.parse(route.request().postData()!).conversationId;
      await route.fulfill({ headers, body: JSON.stringify({ isPending: true, pendingRequestId: 'latency-run', conversationId, sequence: 1 }) });
    });
    await page.route('https://klive.dev/kliveagent/chat/pending**', async route => {
      const query = new URL(route.request().url()).searchParams;
      sequences.push(query.get('afterSequence')!);
      expect(query.get('waitMs')).toBe('15000');
      const completed = sequences.length > 1;
      await route.fulfill({ headers, body: JSON.stringify({
        requestId: 'latency-run', conversationId, sequence: completed ? 3 : 2,
        status: completed ? 'Completed' : 'Running', response: completed ? 'Fast reply complete.' : 'Fast reply',
        finalResponse: completed ? { conversationId, response: 'Fast reply complete.' } : null,
      }) });
    });
    const chat = page.locator('.chat-panel');
    await expect(chat.locator('textarea')).toBeEnabled();
    await chat.locator('textarea').fill('Reply quickly');
    await chat.locator('.chat-send-btn').click();
    await expect(chat).toContainText('Fast reply complete.');
    expect(sequences).toEqual(['1', '2']);
    expect(await page.evaluate(() => (window as any).pendingPollDelays)).toBe(supportsWait ? 0 : 1);
  });
}

test('new chat aborts a pending progress wait and ignores its late response', async ({ page }) => {
  await openDashboard(page, 'Klives');
  await page.addInitScript(() => {
    const original = window.fetch;
    (window as any).pendingWaitAborted = false;
    window.fetch = (input, init) => {
      if (String(input).includes('/kliveagent/chat/pending')) {
        init?.signal?.addEventListener('abort', () => { (window as any).pendingWaitAborted = true; });
      }
      return original(input, init);
    };
  });
  await page.goto('/kliveagent');
  const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  await page.route('https://klive.dev/kliveagent/chat', async route => {
    const { conversationId } = JSON.parse(route.request().postData()!);
    await route.fulfill({ headers, body: JSON.stringify({ isPending: true, pendingRequestId: 'aborted-run', conversationId }) });
  });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let waiting = false;
  await page.route('https://klive.dev/kliveagent/chat/pending**', async route => {
    waiting = true;
    await held;
    await route.fulfill({ headers, body: JSON.stringify({ status: 'Completed', response: 'Obsolete response', sequence: 2 }) }).catch(() => {});
  });
  const chat = page.locator('.chat-panel');
  await expect(chat.locator('textarea')).toBeEnabled();
  await chat.locator('textarea').fill('Start a run');
  await chat.locator('.chat-send-btn').click();
  await expect.poll(() => waiting).toBe(true);
  await page.locator('.ka-header').getByRole('button', { name: /Panels/ }).click();
  await page.getByRole('button', { name: '＋ New chat' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).pendingWaitAborted)).toBe(true);
  release();
  await expect(chat).not.toContainText('Obsolete response');
});
