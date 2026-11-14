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
    const chat = page.getByTestId('kax-thread');
    await expect(chat.locator('textarea')).toBeEnabled();
    await chat.locator('textarea').fill('Reply quickly');
    await chat.getByTestId('kax-send').click();
    await expect(chat).toContainText('Fast reply complete.');
    expect(sequences).toEqual(['1', '2']);
    expect(await page.evaluate(() => (window as any).pendingPollDelays)).toBe(supportsWait ? 0 : 1);
  });
}

test('a long run sends only what changed, and the page keeps every step, script and word', async ({ page }) => {
  // 12 Nov 2026: every wake of this poll carried the whole run; one run's polls came to 4.27 GB in four hours.
  // The server now leaves out unchanged parts (null) and, asked with activity=append, sends new steps only.
  await openDashboard(page, 'Klives');
  await page.goto('/kliveagent');
  const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json',
    'access-control-expose-headers': 'X-Klive-Pending-Wait', 'X-Klive-Pending-Wait': 'supported' };
  let conversationId = '';
  await page.route('https://klive.dev/kliveagent/chat', async route => {
    conversationId = JSON.parse(route.request().postData()!).conversationId;
    await route.fulfill({ headers, body: JSON.stringify({ isPending: true, pendingRequestId: 'append-run', conversationId, sequence: 1 }) });
  });
  const step = (i: number) => ({ timestamp: '2026-11-14T10:00:00Z', iteration: i, kind: 'tool', text: `step ${i} done` });
  const script = { code: 'Svc("OmniTrader")', output: 'ok', success: true };
  const asked: URLSearchParams[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('https://klive.dev/kliveagent/chat/pending**', async route => {
    const query = new URL(route.request().url()).searchParams;
    asked.push(query);
    const n = asked.length;
    if (n >= 3) await held;
    const body = n === 1
      ? { requestId: 'append-run', conversationId, sequence: 2, status: 'Running', response: 'Working on it', scriptsExecuted: [script], activity: [step(1), step(2)] }
      : n === 2
        ? { requestId: 'append-run', conversationId, sequence: 3, status: 'Running', response: null, scriptsExecuted: null, activity: [step(3)], activityFrom: 2 }
        : { requestId: 'append-run', conversationId, sequence: 4, status: 'Completed', response: null, scriptsExecuted: null, activity: [step(4)], activityFrom: 3,
            finalResponse: { conversationId, response: 'All four steps done.', scriptsExecuted: [script] } };
    await route.fulfill({ headers, body: JSON.stringify(body) }).catch(() => {});
  });

  const chat = page.getByTestId('kax-thread');
  await expect(chat.locator('textarea')).toBeEnabled();
  await chat.locator('textarea').fill('Run the long batch');
  await chat.getByTestId('kax-send').click();

  // Mid-run, after an answer that left out the reply and scripts and sent one new step.
  await expect.poll(() => asked.length).toBe(3);
  const toggle = chat.locator('.kax-steps__toggle').last();
  await expect(toggle).toContainText('3 steps · 1 script');
  await expect(chat).toContainText('Working on it');
  await toggle.click();
  await expect(chat.locator('.kax-step__text')).toHaveText(['step 1 done', 'step 2 done', 'step 3 done']);

  release();
  await expect(chat).toContainText('All four steps done.');
  expect(asked.map(query => query.get('afterSequence'))).toEqual(['1', '2', '3']);
  expect(asked.every(query => query.get('activity') === 'append')).toBe(true);
});

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
  const chat = page.getByTestId('kax-thread');
  await expect(chat.locator('textarea')).toBeEnabled();
  await chat.locator('textarea').fill('Start a run');
  await chat.getByTestId('kax-send').click();
  await expect.poll(() => waiting).toBe(true);
  await page.getByTestId('kax-new-chat').click();
  await expect.poll(() => page.evaluate(() => (window as any).pendingWaitAborted)).toBe(true);
  release();
  await expect(chat).not.toContainText('Obsolete response');
});
