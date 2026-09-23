import { expect, test } from '@playwright/test';
import { openDashboard } from './fixtures/dashboard-api';

test('chat accepts dropped files and combines them with file picker selections', async ({ page }) => {
  await openDashboard(page, 'Klives');
  await page.goto('/kliveagent');
  const chat = page.locator('.chat-panel');
  await expect(chat.locator('.chat-attach-btn')).toBeVisible();
  await expect(chat.locator('input[type=file]')).toBeEnabled();

  await chat.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['sample image'], 'sample.png', { type: 'image/png' }));
    element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: transfer }));
    element.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: transfer }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  });
  await expect(chat.locator('.chat-attachment')).toContainText('sample.png');
  await expect(chat.locator('.chat-drop-overlay')).toHaveCount(0);

  await chat.locator('input[type=file]').setInputFiles({
    name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video fixture'),
  });
  await expect(chat.locator('.chat-attachment')).toHaveCount(2);
  await expect(chat.locator('.chat-attachment').nth(1)).toContainText('clip.mp4');
  await expect(chat.locator('.chat-send-btn')).toBeEnabled();

  const uploaded: string[] = [];
  let chatPayload: any = null;
  const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  await page.route('https://klive.dev/kliveagent/attachments/upload**', async (route) => {
    const name = new URL(route.request().url()).searchParams.get('name') || '';
    const id = `attachment-${uploaded.length + 1}`;
    uploaded.push(name);
    await route.fulfill({ status: 200, headers, body: JSON.stringify({ id, name, conversationId: 'fixture-conversation', size: 12, mimeType: 'application/octet-stream' }) });
  });
  await page.route('https://klive.dev/kliveagent/chat', async (route) => {
    chatPayload = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ status: 200, headers, body: JSON.stringify({ success: true, response: 'Received the files.', conversationId: chatPayload.conversationId }) });
  });
  await chat.locator('.chat-send-btn').click();
  await expect.poll(() => uploaded).toEqual(['sample.png', 'clip.mp4']);
  await expect.poll(() => chatPayload?.attachmentIds).toEqual(['attachment-1', 'attachment-2']);
  await expect(chat.locator('.chat-attachment')).toHaveCount(0);

  await page.route('https://klive.dev/kliveagent/stats/prompt-cache**', async (route) => {
    await route.fulfill({ status: 200, headers, body: JSON.stringify({
      status: 'warming', verdict: 'Collecting provider measurements.', requests: 1,
      measuredRequests: 1, cachedTokens: 600, uncachedTokens: 400, cacheHitRatePct: 60,
      telemetryCoveragePct: 100, series: [], breakdown: [], recent: [],
    }) });
  });
  await page.locator('.ka-header').getByRole('button', { name: 'Analytics' }).click();
  await expect(page.getByRole('heading', { name: 'Prompt cache' })).toBeVisible();
  await expect(page.locator('.cache-panel')).toContainText('600');
});
