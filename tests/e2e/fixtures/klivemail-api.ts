import type { Page, Route } from '@playwright/test';
import { catalogPayload, mePayload } from './permissions';

/**
 * A stateful stand-in for the routes behind the KliveMail page. Payloads have the shapes the
 * server writes (MessageSummary / MailboxInfo in PascalCase from KliveMailModels.cs, the summary
 * snapshot from KliveMail.BuildSnapshot, the detail from KliveMailRoutes.HandleMessageDetail); the
 * values are invented and every address is fake. Actions change the state, so a test can mark
 * mail read and watch the counts agree.
 *
 * 'legacy' is a server from before this page: no codes, no health, no bulk or restore routes.
 */

export type MailScenario = 'normal' | 'legacy';

export interface MailMockOptions { scenario?: MailScenario; permissions?: string[] }

export interface MailMessage {
  Id: string; ToAddress: string; FromAddress: string; FromName: string | null; Subject: string; ReceivedUtc: string; DateUtc: string;
  ThreadId: string; HasAttachments: boolean; IsRead: boolean; Snippet: string; Code: string | null; BodyText: string | null; BodyHtml: string | null;
  deleted: boolean;
  /** Carries an image its HTML draws by Content-ID. */
  Inline?: boolean;
}

export interface MailApiMock {
  messages: MailMessage[];
  mailboxes: Array<{ Address: string; DisplayName: string | null }>;
  requestedPaths: string[];
  directGets: string[];
  batchCalls: string[][];
  posts: Array<{ path: string; query: Record<string, string>; body: any }>;
  /** Delivers a new message, as SMTP would. */
  deliver: (message: Partial<MailMessage> & { Subject: string; ToAddress: string }) => MailMessage;
}

export const mailTestOrigin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`,
).origin;

async function fulfil(route: Route, payload: unknown, status = 200) {
  await route.fulfill({
    status,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page',
      'content-type': 'application/json; charset=utf-8',
    },
    body: status === 204 ? '' : typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

const SENDERS = [
  ['no-reply@video.example', 'Video Example'], ['security@social.example', 'Social'], ['hello@shop.example', 'Shop Example'],
  ['talent@jobs.example', 'Jobs Board'], ['noreply@code.example', 'CodeHost'], ['news@paper.example', 'The Paper'],
] as const;

const PINNED = [
  ['shop@klive.dev', 'Shopping'], ['videos@klive.dev', 'Avery Video'], ['writer@klive.dev', 'Avery Reed'], ['agent@klive.dev', null],
  ['quiet1@klive.dev', null], ['quiet2@klive.dev', 'Never used'],
] as const;

export async function installMailApiMock(page: Page, options: MailMockOptions = {}): Promise<MailApiMock> {
  const legacy = options.scenario === 'legacy';
  const t0 = Date.now();
  const iso = (msAgo: number) => new Date(t0 - msAgo).toISOString();
  let seq = 0;
  const id = () => (++seq).toString(16).padStart(32, '0');

  const messages: MailMessage[] = [];
  const make = (m: Partial<MailMessage> & { Subject: string; ToAddress: string }, msAgo: number): MailMessage => {
    const sender = SENDERS[seq % SENDERS.length];
    const mid = id();
    const msg: MailMessage = {
      Id: mid, FromAddress: sender[0], FromName: sender[1], ReceivedUtc: iso(msAgo), DateUtc: iso(msAgo), ThreadId: mid,
      HasAttachments: false, IsRead: false, Snippet: 'Hello, this is the start of the message.', Code: null,
      BodyText: 'Hello, this is the start of the message.\n\nMore text follows here.', BodyHtml: null, deleted: false, ...m,
    };
    return msg;
  };

  // Newest first in time: a code a few minutes ago, an HTML-only mail with a verify link, and a long tail.
  messages.push(make({ ToAddress: 'videos@klive.dev', Subject: '483920 is your verification code', Code: '483920', FromName: 'Video Example', FromAddress: 'no-reply@video.example', Snippet: '' , BodyText: null,
    BodyHtml: '<p>Use this code to finish signing up:</p><p style="font-size:28px"><b>483920</b></p><img src="https://tracker.example/open.gif"><p><a href="https://video.example/help">Help</a></p>' }, 4 * 60_000));
  messages.push(make({ ToAddress: 'writer@klive.dev', Subject: 'Confirm your email address', FromName: 'Jobs Board', FromAddress: 'talent@jobs.example', BodyText: null,
    Snippet: 'Click the button below to confirm your email and start applying.',
    BodyHtml: '<p>Click the button below to confirm your email and start applying.</p><a href="https://jobs.example/verify-email?token=abc">Confirm</a> <a href="https://jobs.example/unsubscribe">Unsubscribe</a>' }, 40 * 60_000));
  messages.push(make({ ToAddress: 'stray@klive.dev', Subject: 'Your receipt', HasAttachments: true, Snippet: 'Thanks for your order. Your receipt is attached.' }, 3 * 3_600_000));
  messages.push(make({ ToAddress: 'shop@klive.dev', Subject: 'Re: order question', ThreadId: 'thread-1', IsRead: true }, 5 * 3_600_000));
  messages.push(make({ ToAddress: 'shop@klive.dev', Subject: 'order question', ThreadId: 'thread-1', IsRead: true }, 7 * 3_600_000));
  messages.push(make({ ToAddress: 'shop@klive.dev', Subject: 'Weekly picks', IsRead: true, Inline: true, BodyText: null, Snippet: 'This week in pictures.',
    BodyHtml: '<p>This week in pictures.</p><img src="cid:hero@fixture" alt="hero" data-hero>' }, 8 * 3_600_000));
  for (let i = 0; i < 125; i++) {
    const box = ['shop@klive.dev', 'videos@klive.dev', 'writer@klive.dev', 'agent@klive.dev'][i % 4];
    const code = i % 9 === 0 ? String(100000 + i * 37) : null;
    messages.push(make({
      ToAddress: box, Subject: code ? `${code} is your sign-in code` : `Weekly update number ${i}`, Code: code,
      IsRead: i % 3 !== 0, Snippet: `Weekly update ${i}: the things that happened, in short.`,
    }, (26 + i * 11) * 3_600_000));
  }
  if (legacy) for (const m of messages) m.Code = null;

  const mailboxes = PINNED.map(([Address, DisplayName]) => ({ Address, DisplayName }));
  const state: MailApiMock = {
    messages, mailboxes, requestedPaths: [], directGets: [], batchCalls: [], posts: [],
    deliver: m => { const msg = make(m, 0); messages.unshift(msg); return msg; },
  };

  const live = () => messages.filter(m => !m.deleted);
  const summaryRow = (m: MailMessage) => ({
    Id: m.Id, ToAddress: m.ToAddress, FromAddress: m.FromAddress, FromName: m.FromName, Subject: m.Subject, ReceivedUtc: m.ReceivedUtc,
    DateUtc: m.DateUtc, ThreadId: m.ThreadId, HasAttachments: m.HasAttachments, IsRead: m.IsRead, Snippet: m.Snippet,
    ...(legacy ? {} : { Code: m.Code }),
  });

  const summary = () => {
    const counts = new Map<string, { Total: number; Unread: number; Last: string | null }>();
    for (const m of live()) {
      const c = counts.get(m.ToAddress) ?? { Total: 0, Unread: 0, Last: null };
      c.Total++; if (!m.IsRead) c.Unread++;
      if (!c.Last || m.ReceivedUtc > c.Last) c.Last = m.ReceivedUtc;
      counts.set(m.ToAddress, c);
    }
    const pinned = mailboxes.map(b => {
      const c = counts.get(b.Address);
      return { Address: b.Address, DisplayName: b.DisplayName, Total: c?.Total ?? 0, Unread: c?.Unread ?? 0, Pinned: true, ...(legacy ? {} : { LastReceivedUtc: c?.Last ?? null }) };
    });
    const total = live().length;
    const unread = live().filter(m => !m.IsRead).length;
    const trash = messages.filter(m => m.deleted).length;
    if (legacy) return { all: { total, unread }, trash, mailboxes: pinned };
    const others = [...counts.entries()].filter(([a]) => !mailboxes.some(b => b.Address === a))
      .map(([Address, c]) => ({ Address, DisplayName: null, Total: c.Total, Unread: c.Unread, Pinned: false, LastReceivedUtc: c.Last }));
    const daily = Array.from({ length: 30 }, (_, k) => {
      const day = new Date(t0 - (29 - k) * 86_400_000).toISOString().slice(0, 10);
      return { D: day, N: messages.filter(m => m.ReceivedUtc.slice(0, 10) === day).length };
    });
    return {
      all: { total, unread }, trash, mailboxes: pinned, others, daily,
      lastReceivedUtc: live()[0]?.ReceivedUtc ?? null, received24h: messages.filter(m => t0 - Date.parse(m.ReceivedUtc) < 86_400_000).length,
      received7d: daily.slice(-7).reduce((s, d) => s + d.N, 0),
      health: {
        startedUtc: iso(3 * 3_600_000),
        smtp: { state: 'listening', sinceUtc: iso(3 * 3_600_000), port: 25, tls: true, restarts: 0, lastError: null, lastErrorUtc: null, sessions: 214, sessionFaults: 37, lastSessionUtc: iso(60_000) },
        store: { stored: 6, lastStoredUtc: iso(4 * 60_000), errors: 0, lastError: null, lastErrorUtc: null },
        digests: { built: 0, ms: 3 },
      },
      generatedAtUtc: new Date().toISOString(),
    };
  };

  const list = (q: URLSearchParams) => {
    const trash = q.get('trash') === '1';
    let rows = messages.filter(m => m.deleted === trash);
    const box = q.get('mailbox');
    if (box) rows = rows.filter(m => m.ToAddress === box.toLowerCase());
    if (q.get('unread') === '1') rows = rows.filter(m => !m.IsRead);
    if (q.get('hasAttachment') === '1') rows = rows.filter(m => m.HasAttachments);
    if (q.get('codes') === '1' && !legacy) rows = rows.filter(m => m.Code);
    const pageNo = Math.max(1, Number(q.get('page') ?? 1));
    const size = Math.min(200, Math.max(1, Number(q.get('pageSize') ?? 50)));
    return rows.slice((pageNo - 1) * size, pageNo * size).map(summaryRow);
  };

  const search = (q: URLSearchParams) => {
    const words = (q.get('q') ?? '').toLowerCase().split(/\W+/).filter(Boolean);
    let rows = live().filter(m => words.every(w => `${m.Subject} ${m.Snippet} ${m.FromAddress} ${m.FromName}`.toLowerCase().includes(w)));
    const box = q.get('mailbox');
    if (box) rows = rows.filter(m => m.ToAddress === box.toLowerCase());
    return rows.slice(0, Number(q.get('pageSize') ?? 50)).map(summaryRow);
  };

  const detail = (q: URLSearchParams) => {
    const m = messages.find(x => x.Id === q.get('id'));
    if (!m) return { status: 404, body: 'Message not found.' };
    const peek = !legacy && q.get('peek') === '1';
    const wasRead = m.IsRead;
    if (!peek) m.IsRead = true;
    const links = m.BodyHtml?.includes('verify-email') ? [{ url: 'https://jobs.example/verify-email?token=abc', host: 'jobs.example' }] : [];
    return {
      status: 200,
      body: {
        Id: m.Id, ToAddress: m.ToAddress, FromAddress: m.FromAddress, FromName: m.FromName, Subject: m.Subject, DateUtc: m.DateUtc, ReceivedUtc: m.ReceivedUtc,
        ThreadId: m.ThreadId, BodyText: m.BodyText, BodyHtml: m.BodyHtml, HasAttachments: m.HasAttachments, RawSize: 4096,
        IsRead: peek ? wasRead : true,
        ...(legacy ? {} : { WasRead: wasRead, IsDeleted: m.deleted, Code: m.Code, Links: links }),
        Attachments: [
          ...(m.HasAttachments ? [{ Id: `${m.Id}-a`, FileName: 'receipt.pdf', ContentType: 'application/pdf', SizeBytes: 48_213, IsInline: false, ContentId: null }] : []),
          ...(m.Inline ? [{ Id: `${m.Id}-img`, FileName: 'hero.png', ContentType: 'image/png', SizeBytes: 68, IsInline: true, ContentId: 'hero@fixture' }] : []),
        ],
        Thread: live().filter(x => x.ThreadId === m.ThreadId).sort((a, b) => a.ReceivedUtc.localeCompare(b.ReceivedUtc)).map(summaryRow),
      },
    };
  };

  const accounts = [
    { accountID: 'a1', serviceKey: 'video.example', serviceDisplay: 'video.example', username: 'avery_video', email: 'videos@klive.dev', status: 'Active' },
    { accountID: 'a2', serviceKey: 'jobs.example', serviceDisplay: 'jobs.example', username: 'avery.reed', email: 'writer@klive.dev', status: 'Banned' },
  ];

  const getResponse = (pathWithQuery: string): { status: number; body: unknown } => {
    const url = new URL(pathWithQuery, 'https://klive.dev');
    const q = url.searchParams;
    switch (url.pathname) {
      case '/KMProfiles/me': return { status: 200, body: options.permissions ? mePayload({ rank: 3, userId: 'e2e-guest', name: 'Guest Fixture', permissions: options.permissions }) : mePayload({ rank: 5, userId: 'e2e-klives', name: 'Klives Fixture' }) };
      case '/KMProfiles/permissions/catalog': return { status: 200, body: catalogPayload(true) };
      case '/klivemail/mailboxes': return { status: 200, body: summary() };
      case '/klivemail/stats': { const s: any = summary(); return { status: 200, body: { total: s.all.total, unread: s.all.unread, trash: s.trash } }; }
      case '/klivemail/messages': return { status: 200, body: list(q) };
      case '/klivemail/search': return { status: 200, body: search(q) };
      case '/klivemail/messages/detail': return detail(q);
      case '/accounts/list': return { status: 200, body: accounts };
      default: return { status: 200, body: { success: true } };
    }
  };

  const bulkIds = (query: Record<string, string>, body: any): string[] =>
    [...(query.ids ? query.ids.split(',') : []), ...(Array.isArray(body?.ids) ? body.ids : [])];

  await page.routeWebSocket('wss://klive.dev/**', () => {});
  await page.route('https://klive.dev/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pathWithQuery = `${url.pathname}${url.search}`;
    if (request.method() === 'OPTIONS') { await fulfil(route, null, 204); return; }

    if (url.pathname === '/batch' && request.method() === 'POST') {
      const entries: Array<{ path?: string }> = JSON.parse(request.postData() ?? '[]');
      const paths = entries.map(e => e.path).filter((p): p is string => typeof p === 'string');
      state.batchCalls.push(paths);
      state.requestedPaths.push(...paths);
      await fulfil(route, paths.map(path => {
        const answer = getResponse(path);
        return { path, status: answer.status, ok: answer.status < 300, contentType: 'application/json', body: answer.body };
      }));
      return;
    }

    state.requestedPaths.push(pathWithQuery);
    if (request.method() === 'GET') {
      state.directGets.push(pathWithQuery);
      if (url.pathname === '/KMProfiles/LoginStatus') {
        await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' }, body: 'SessionActive' });
        return;
      }
      if (url.pathname === '/klivemail/attachments/download' && (url.searchParams.get('id') ?? '').endsWith('-img')) {
        // A 1x1 PNG.
        await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'image/png' },
          body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64') });
        return;
      }
      if (url.pathname === '/klivemail/attachments/download') {
        await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/pdf' }, body: '%PDF-1.4 fixture' });
        return;
      }
      const answer = getResponse(pathWithQuery);
      await fulfil(route, answer.body, answer.status);
      return;
    }

    let body: any = null;
    try { body = JSON.parse(request.postData() ?? 'null'); } catch { body = request.postData(); }
    const query = Object.fromEntries(url.searchParams.entries());
    state.posts.push({ path: url.pathname, query, body });
    const find = (mid: string) => messages.find(m => m.Id === mid);

    switch (url.pathname) {
      case '/KMProfiles/Login':
        await fulfil(route, { token: 'kms_e2e-klives', sessionId: 'session-e2e', expiresUtc: '2027-01-01T00:00:00Z', me: mePayload({ rank: 5, name: 'Klives Fixture' }) });
        return;
      case '/klivemail/messages/bulk-read': {
        if (legacy) { await fulfil(route, 'Route not found', 404); return; }
        const read = query.read !== '0';
        let changed = 0;
        const targets = query.all === '1'
          ? live().filter(m => !m.IsRead && (!query.mailbox || m.ToAddress === query.mailbox))
          : bulkIds(query, body).map(find).filter((m): m is MailMessage => !!m);
        for (const m of targets) if (m.IsRead !== read) { m.IsRead = read; changed++; }
        await fulfil(route, { success: true, changed });
        return;
      }
      case '/klivemail/messages/bulk-delete': {
        if (legacy) { await fulfil(route, 'Route not found', 404); return; }
        const restore = query.restore === '1';
        let changed = 0;
        for (const m of bulkIds(query, body).map(find)) if (m && m.deleted !== !restore) { m.deleted = !restore; changed++; }
        await fulfil(route, { success: true, changed, restored: restore });
        return;
      }
      case '/klivemail/messages/mark-read': case '/klivemail/messages/mark-unread': {
        const m = find(query.id ?? '');
        if (m) m.IsRead = url.pathname.endsWith('mark-read');
        await fulfil(route, { success: !!m });
        return;
      }
      case '/klivemail/messages/delete': {
        const m = find(query.id ?? '');
        if (m) m.deleted = true;
        await fulfil(route, { success: !!m });
        return;
      }
      case '/klivemail/mailboxes/create': {
        const address = (query.address ?? '').toLowerCase();
        const exists = mailboxes.some(b => b.Address === address);
        if (!exists) mailboxes.push({ Address: address, DisplayName: query.displayName ?? null });
        await fulfil(route, { success: !exists, address });
        return;
      }
      case '/klivemail/mailboxes/delete': {
        const index = mailboxes.findIndex(b => b.Address === (query.address ?? '').toLowerCase());
        if (index >= 0) mailboxes.splice(index, 1);
        await fulfil(route, { success: index >= 0 });
        return;
      }
      default:
        await fulfil(route, { success: true });
    }
  });

  return state;
}

export async function openMail(page: Page, options: MailMockOptions & { path?: string } = {}): Promise<MailApiMock> {
  const api = await installMailApiMock(page, options);
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: mailTestOrigin }]);
  await page.addInitScript(() => { window.localStorage.setItem('vnavCollapsed', '0'); });
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(options.path ?? '/klivemail', { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.getByTestId('kml-root').waitFor({ state: 'visible', timeout: 15_000 });
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(3_000 * (attempt + 1));
    }
  }
  return api;
}
