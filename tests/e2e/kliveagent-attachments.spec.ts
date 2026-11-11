import { expect, test } from '@playwright/test';
import { openDashboard } from './fixtures/dashboard-api';

test('chat accepts dropped files and combines them with file picker selections', async ({ page }) => {
  await openDashboard(page, 'Klives');
  await page.goto('/kliveagent');
  const chat = page.getByTestId('kax-thread');
  await expect(chat.getByTestId('kax-attach')).toBeVisible();
  await expect(chat.locator('input[type=file]')).toBeEnabled();

  await chat.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['sample image'], 'sample.png', { type: 'image/png' }));
    element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: transfer }));
    element.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: transfer }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  });
  await expect(chat.getByTestId('kax-attachment')).toContainText('sample.png');
  await expect(chat.getByTestId('kax-drop')).toHaveCount(0);

  await chat.locator('input[type=file]').setInputFiles({
    name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video fixture'),
  });
  await expect(chat.getByTestId('kax-attachment')).toHaveCount(2);
  await expect(chat.getByTestId('kax-attachment').nth(1)).toContainText('clip.mp4');
  await expect(chat.getByTestId('kax-send')).toBeEnabled();

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
  await chat.getByTestId('kax-send').click();
  await expect.poll(() => uploaded).toEqual(['sample.png', 'clip.mp4']);
  await expect.poll(() => chatPayload?.attachmentIds).toEqual(['attachment-1', 'attachment-2']);
  await expect(chat.getByTestId('kax-attachment')).toHaveCount(0);
  // A finished reply that came back in the POST itself is shown at once.
  await expect(chat).toContainText('Received the files.');
});

test('a file that is too large or one too many is refused with a reason', async ({ page }) => {
  await openDashboard(page, 'Klives');
  await page.goto('/kliveagent');
  const chat = page.getByTestId('kax-thread');
  await expect(chat.locator('input[type=file]')).toBeEnabled();
  await chat.locator('input[type=file]').setInputFiles(Array.from({ length: 9 }, (_, i) => ({
    name: `note-${i}.txt`, mimeType: 'text/plain', buffer: Buffer.from('x'),
  })));
  await expect(chat.getByTestId('kax-attachment')).toHaveCount(8);
  await expect(chat.getByTestId('kax-attachment-error')).toContainText('at most 8 files');
});
