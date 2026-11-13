import type { Page, Route } from '@playwright/test';
import { catalogPayload, mePayload } from './permissions';

/**
 * A stateful stand-in for the routes behind /klivecloud. Payloads have the shapes the server
 * writes (KliveCloudRoutes.ItemDto for the tree, ShareLinkDto for links, the Ticket/Version
 * routes as added in Nov 2026); every name, size and date is invented. Actions change the state,
 * so a test can rename, move or delete and watch the page agree with what the server holds.
 *
 * 'legacy' is a server from before this page: no Version, Ticket, RenameItem or UpdateShareLink
 * routes ("Route not found"), and share links without Problem or Usage.
 */

export type CloudScenario = 'normal' | 'legacy' | 'empty';

export interface CloudMockOptions { scenario?: CloudScenario; permissions?: string[]; userId?: string }

export interface FakeItem {
  ItemID: string; Name: string; ParentFolderID: string; ItemType: 'File' | 'Folder'; FileSizeBytes: number;
  CreatedDate: string; ModifiedDate: string; CreatedByUserID: string; CreatedByName: string | null;
  MyLevel: 'Editor' | 'Viewer'; MinimumPermissionLevel: string;
}

export interface FakeLink {
  ShareCode: string; ItemID: string; CreatedByUserID: string; CreatedDate: string; ExpirationDate: string | null; PermissionMode: string;
  opens: number; downloads: number; bytes: number; lastOpened: string | null;
}

export interface CloudApiMock {
  items: FakeItem[];
  links: FakeLink[];
  requestedPaths: string[];
  directGets: string[];
  batchCalls: string[][];
  posts: Array<{ path: string; query: Record<string, string>; body: any }>;
  /** Paths of /KliveCloud/Open requests (ticket downloads and previews). */
  opened: string[];
  /** Bumps the version, as a change made elsewhere would. */
  touch: () => void;
}

export const cloudTestOrigin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`,
).origin;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page, Range',
  'access-control-expose-headers': '*',
};

async function fulfil(route: Route, payload: unknown, status = 200, type = 'application/json; charset=utf-8') {
  await route.fulfill({ status, headers: { ...CORS, 'content-type': type }, body: status === 204 ? '' : typeof payload === 'string' ? payload : JSON.stringify(payload) });
}

// A 2x2 PNG: thumbnails and pictures.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGNkYPhfz8DAwMDAxMDAwAAAHwMBAZr5QYwAAAAASUVORK5CYII=', 'base64');

export async function installCloudApiMock(page: Page, options: CloudMockOptions = {}): Promise<CloudApiMock> {
  const legacy = options.scenario === 'legacy';
  const empty = options.scenario === 'empty';
  const t0 = Date.now();
  const iso = (msAgo: number) => new Date(t0 - msAgo).toISOString();
  const H = 3_600_000;
  const D = 24 * H;
  const me = options.userId ?? 'e2e-klives';
  let seq = 900_000_000_000;
  const newId = () => String(++seq);
  let version = 1;
  const touch = () => { version++; };

  const items: FakeItem[] = [];
  const add = (Name: string, parent: string, type: 'File' | 'Folder', bytes: number, ageMs: number, extra: Partial<FakeItem> = {}): FakeItem => {
    const item: FakeItem = {
      ItemID: newId(), Name, ParentFolderID: parent, ItemType: type, FileSizeBytes: type === 'File' ? bytes : 0,
      CreatedDate: iso(ageMs + 3 * D), ModifiedDate: iso(ageMs), CreatedByUserID: me, CreatedByName: 'Klives Fixture',
      MyLevel: 'Editor', MinimumPermissionLevel: parent ? 'Inherited' : 'Only Klives', ...extra,
    };
    items.push(item);
    return item;
  };

  if (!empty) {
    const photos = add('Photos', '', 'Folder', 0, 2 * H, { MinimumPermissionLevel: '1 person' });
    const trip = add('Trip 2026', photos.ItemID, 'Folder', 0, 3 * H);
    add('beach.jpg', trip.ItemID, 'File', 3_400_000, 3 * H);
    add('harbour.png', trip.ItemID, 'File', 1_900_000, 4 * H);
    add('sunset.mp4', trip.ItemID, 'File', 182_000_000, 5 * H);
    add('portrait.jpg', photos.ItemID, 'File', 2_200_000, 8 * D);
    const projects = add('Projects', '', 'Folder', 0, 1 * D);
    add('notes.md', projects.ItemID, 'File', 4_096, 1 * D);
    add('build.zip', projects.ItemID, 'File', 640_000_000, 12 * D);
    add('main.py', projects.ItemID, 'File', 12_288, 2 * D);
    const shared = add('Shared drive', '', 'Folder', 0, 20 * D, { MinimumPermissionLevel: 'Everyone' });
    add('handbook.pdf', shared.ItemID, 'File', 2_431_000, 20 * D, { CreatedByUserID: 'shared:abc', CreatedByName: null });
    add('Invoices', '', 'Folder', 0, 40 * D);
    add('report.pdf', '', 'File', 812_000, 30 * 60_000);
    add('installer.exe', '', 'File', 231_000_000, 60 * D, { MinimumPermissionLevel: 'Everyone' });
    add('readme.txt', '', 'File', 2_048, 90 * D);
  }

  const byName = (name: string) => items.find(item => item.Name === name)!;
  const links: FakeLink[] = empty ? [] : [
    { ShareCode: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', ItemID: byName('Trip 2026').ItemID, CreatedByUserID: me, CreatedDate: iso(6 * D), ExpirationDate: null, PermissionMode: 'Write', opens: 14, downloads: 3, bytes: 190_000_000, lastOpened: iso(2 * H) },
    { ShareCode: 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6', ItemID: byName('report.pdf').ItemID, CreatedByUserID: me, CreatedDate: iso(D), ExpirationDate: iso(-2 * D), PermissionMode: 'ReadOnly', opens: 0, downloads: 0, bytes: 0, lastOpened: null },
    { ShareCode: 'c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6', ItemID: byName('installer.exe').ItemID, CreatedByUserID: me, CreatedDate: iso(50 * D), ExpirationDate: null, PermissionMode: 'ReadOnly', opens: 4, downloads: 4, bytes: 924_000_000, lastOpened: iso(5 * D) },
    { ShareCode: 'd1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6', ItemID: '777777777777', CreatedByUserID: me, CreatedDate: iso(190 * D), ExpirationDate: null, PermissionMode: 'ReadOnly', opens: 0, downloads: 0, bytes: 0, lastOpened: null },
    { ShareCode: 'e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6', ItemID: byName('readme.txt').ItemID, CreatedByUserID: '', CreatedDate: iso(52 * D), ExpirationDate: null, PermissionMode: 'ReadOnly', opens: 0, downloads: 0, bytes: 0, lastOpened: null },
    { ShareCode: 'f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6', ItemID: byName('main.py').ItemID, CreatedByUserID: '', CreatedDate: iso(51 * D), ExpirationDate: null, PermissionMode: 'ReadOnly', opens: 0, downloads: 0, bytes: 0, lastOpened: null },
  ];

  const state: CloudApiMock = { items, links, requestedPaths: [], directGets: [], batchCalls: [], posts: [], opened: [], touch };
  /** token → item id */
  const tickets = new Map<string, string>();

  const find = (id: string | null | undefined) => items.find(item => item.ItemID === id);
  const pathOf = (item: FakeItem): string => {
    const names = [item.Name];
    let cursor = find(item.ParentFolderID);
    while (cursor) { names.unshift(cursor.Name); cursor = find(cursor.ParentFolderID); }
    return names.join('/');
  };
  const dto = (item: FakeItem) => ({ ...item, RelativePath: pathOf(item), Access: null });
  const within = (item: FakeItem, folderId: string): boolean => {
    let cursor = find(item.ParentFolderID);
    while (cursor) { if (cursor.ItemID === folderId) return true; cursor = find(cursor.ParentFolderID); }
    return false;
  };

  const linkRow = (link: FakeLink) => {
    const item = find(link.ItemID);
    const expired = !!link.ExpirationDate && Date.parse(link.ExpirationDate) < Date.now();
    const problem = expired ? 'Expired' : !item ? 'ItemDeleted' : !link.CreatedByUserID ? 'NoOwner' : null;
    const row: any = {
      ShareCode: link.ShareCode, ItemID: link.ItemID, CreatedByUserID: link.CreatedByUserID, CreatedByName: link.CreatedByUserID ? 'Klives Fixture' : null,
      CreatedDate: link.CreatedDate, ExpirationDate: link.ExpirationDate, PermissionMode: link.PermissionMode,
      ItemName: item?.Name ?? null, ItemType: item?.ItemType ?? null, Servable: !problem,
    };
    if (!legacy) {
      Object.assign(row, {
        ItemPath: item ? pathOf(item) : null, ItemBytes: item?.ItemType === 'File' ? item.FileSizeBytes : null, Problem: problem,
        ProblemText: problem === 'NoOwner' ? 'Nobody owns it, and a link only serves what its owner can see.' : problem === 'ItemDeleted' ? 'What it shared was deleted.' : problem === 'Expired' ? 'Expired: it stops working on the next visit.' : null,
        Usage: { Opens: link.opens, Downloads: link.downloads, BytesServed: link.bytes, LastOpenedUtc: link.lastOpened, LastDownloadUtc: null, CountingSinceUtc: iso(30 * D) },
      });
    }
    return row;
  };

  const notFound = { status: 404, body: 'Route not found', text: true };

  const getResponse = (pathWithQuery: string): { status: number; body: unknown; text?: boolean } => {
    const url = new URL(pathWithQuery, 'https://klive.dev');
    const q = url.searchParams;
    switch (url.pathname) {
      case '/KMProfiles/me': return { status: 200, body: options.permissions ? mePayload({ rank: 3, userId: me, name: 'Guest Fixture', permissions: options.permissions }) : mePayload({ rank: 5, userId: me, name: 'Klives Fixture' }) };
      case '/KMProfiles/permissions/catalog': return { status: 200, body: catalogPayload(true) };
      case '/KliveCloud/GetFolderTree': return { status: 200, body: items.map(dto) };
      case '/KliveCloud/ListShareLinks': return { status: 200, body: links.map(linkRow) };
      case '/KliveCloud/GetDriveInfo': return { status: 200, body: { DriveName: 'D:\\', DriveFormat: 'NTFS', TotalCapacityBytes: 2_000_000_000_000, UsedCapacityBytes: 680_000_000_000, FreeCapacityBytes: 1_320_000_000_000, UsagePercentage: 34 } };
      case '/KliveCloud/Version':
        if (legacy) return notFound;
        return { status: 200, body: { Stamp: `p-${version}`, Items: `p-${version}`, Links: `p-${version}` } };
      case '/KliveCloud/GetItemAccess': {
        const item = find(q.get('itemID'));
        return item
          ? { status: 200, body: { ItemID: item.ItemID, Name: item.Name, ItemType: item.ItemType, MyLevel: 'Editor', CanManage: true, HasParent: !!item.ParentFolderID, Inherit: true, Everyone: null, Entries: [{ ProfileId: 'p-sam', Name: 'Sam Carter', Level: 'Viewer', AddedById: me, AddedByName: 'Klives Fixture', AddedUtc: iso(9 * D) }], Inherited: [], OwnerAlwaysHasAccess: true } }
          : { status: 404, body: { error: 'ItemNotFound', message: 'ItemNotFound' } };
      }
      case '/KliveCloud/People': return { status: 200, body: [{ userId: me, name: 'Klives Fixture', rank: 'Klives', isOwner: true, isYou: true }, { userId: 'p-sam', name: 'Sam Carter', rank: 'Manager', isOwner: false, isYou: false }, { userId: 'p-alex', name: 'Alex Moreno', rank: 'Guest', isOwner: false, isYou: false }] };
      default: return { status: 404, body: { error: 'NotFound' } };
    }
  };

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
    const q = url.searchParams;
    if (request.method() === 'GET') {
      state.directGets.push(pathWithQuery);
      if (url.pathname === '/KMProfiles/LoginStatus') { await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/plain' }, body: 'SessionActive' }); return; }
      if (url.pathname === '/KliveCloud/GetPreview') { await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/png', 'cache-control': 'private, max-age=300' }, body: PNG }); return; }
      if (url.pathname === '/KliveCloud/Open') {
        state.opened.push(pathWithQuery);
        const ticket = tickets.get(q.get('t') ?? '');
        const item = ticket ? find(ticket) : undefined;
        if (!item) { await fulfil(route, { error: 'TicketExpired', message: 'This file link has expired.' }, 404); return; }
        if (q.get('download') === '1' || item.ItemType === 'Folder') {
          await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${item.Name}${item.ItemType === 'Folder' ? '.zip' : ''}"` }, body: 'fixture bytes' });
          return;
        }
        if (/\.(png|jpe?g)$/i.test(item.Name) || q.get('as') === 'jpg') { await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/png' }, body: PNG }); return; }
        if (/\.(md|txt|py)$/i.test(item.Name)) { await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8' }, body: item.Name.endsWith('.md') ? '# Notes\n\nA short **fixture** document.\n' : 'print("fixture")\n' }); return; }
        await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/octet-stream' }, body: 'fixture bytes' });
        return;
      }
      const answer = getResponse(pathWithQuery);
      if (answer.text) { await route.fulfill({ status: answer.status, headers: { ...CORS, 'content-type': 'text/plain' }, body: String(answer.body) }); return; }
      await fulfil(route, answer.body, answer.status);
      return;
    }

    let body: any = null;
    try { body = JSON.parse(request.postData() ?? 'null'); } catch { body = request.postData(); }
    const query = Object.fromEntries(url.searchParams.entries());
    state.posts.push({ path: url.pathname, query, body: url.pathname === '/KliveCloud/UploadFile' ? '<file>' : body });

    const noRoute = async () => { await route.fulfill({ status: 404, headers: { ...CORS, 'content-type': 'text/plain' }, body: 'Route not found' }); };

    switch (url.pathname) {
      case '/KMProfiles/Login':
        await fulfil(route, { token: 'kms_e2e-klives', sessionId: 'session-e2e', expiresUtc: '2027-01-01T00:00:00Z', me: mePayload({ rank: 5, name: 'Klives Fixture' }) });
        return;
      case '/KliveCloud/CreateFolder': {
        const parent = query.parentFolderID ?? '';
        const taken = items.some(item => item.ParentFolderID === parent && item.Name.toLowerCase() === (query.name ?? '').toLowerCase());
        const made = add(taken ? `${query.name} (1)` : query.name, parent, 'Folder', 0, 0);
        touch();
        await fulfil(route, dto(made));
        return;
      }
      case '/KliveCloud/RenameItem': {
        if (legacy) { await noRoute(); return; }
        const item = find(query.itemID);
        if (!item) { await fulfil(route, { error: 'ItemNotFound', message: "That item doesn't exist any more." }, 404); return; }
        if (items.some(other => other !== item && other.ParentFolderID === item.ParentFolderID && other.Name.toLowerCase() === (query.name ?? '').toLowerCase())) {
          await fulfil(route, { error: 'NameTaken', message: `Something called '${query.name}' is already in this folder.` }, 409);
          return;
        }
        item.Name = query.name;
        item.ModifiedDate = new Date().toISOString();
        touch();
        await fulfil(route, dto(item));
        return;
      }
      case '/KliveCloud/MoveItem': {
        const item = find(query.itemID);
        if (!item) { await fulfil(route, 'ItemNotFound', 404); return; }
        item.ParentFolderID = query.newParentFolderID ?? '';
        touch();
        await fulfil(route, 'ItemMoved');
        return;
      }
      case '/KliveCloud/DeleteItem': {
        const item = find(query.itemID);
        if (!item) { await fulfil(route, 'ItemNotFound', 404); return; }
        const gone = new Set([item.ItemID, ...items.filter(other => within(other, item.ItemID)).map(other => other.ItemID)]);
        for (let i = items.length - 1; i >= 0; i--) if (gone.has(items[i].ItemID)) items.splice(i, 1);
        for (let i = links.length - 1; i >= 0; i--) if (gone.has(links[i].ItemID)) links.splice(i, 1);
        touch();
        await fulfil(route, 'ItemDeleted');
        return;
      }
      case '/KliveCloud/UploadFile': {
        const made = add(query.fileName, query.parentFolderID ?? '', 'File', request.postDataBuffer()?.length ?? 1, 0);
        touch();
        await fulfil(route, dto(made));
        return;
      }
      case '/KliveCloud/CreateShareLink': {
        const item = find(query.itemID);
        if (!item) { await fulfil(route, 'ItemNotFound', 404); return; }
        const code = `${'0'.repeat(24)}${String(links.length).padStart(8, '0')}`;
        const hours = Number(query.expirationHours ?? 0);
        links.push({ ShareCode: code, ItemID: item.ItemID, CreatedByUserID: me, CreatedDate: new Date().toISOString(), ExpirationDate: hours > 0 ? new Date(Date.now() + hours * H).toISOString() : null, PermissionMode: query.permissionMode ?? 'ReadOnly', opens: 0, downloads: 0, bytes: 0, lastOpened: null });
        touch();
        await fulfil(route, { ShareCode: code, ItemID: item.ItemID, FileName: item.Name, ItemType: item.ItemType, SharePermissionMode: query.permissionMode ?? 'ReadOnly' });
        return;
      }
      case '/KliveCloud/UpdateShareLink': {
        if (legacy) { await noRoute(); return; }
        const link = links.find(l => l.ShareCode === query.code);
        if (!link) { await fulfil(route, { error: 'ShareLinkNotFound', message: 'That link no longer exists.' }, 404); return; }
        if (query.permissionMode) link.PermissionMode = query.permissionMode;
        if (query.expirationHours === 'never') link.ExpirationDate = null;
        else if (query.expirationHours) link.ExpirationDate = new Date(Date.now() + Number(query.expirationHours) * H).toISOString();
        if (query.adopt === '1') link.CreatedByUserID = me;
        touch();
        await fulfil(route, linkRow(link));
        return;
      }
      case '/KliveCloud/UpdateShareLinkPermission': {
        const link = links.find(l => l.ShareCode === query.code);
        if (link && query.permissionMode) link.PermissionMode = query.permissionMode;
        touch();
        await fulfil(route, { ShareCode: query.code, SharePermissionMode: query.permissionMode });
        return;
      }
      case '/KliveCloud/DeleteShareLink': {
        const at = links.findIndex(l => l.ShareCode === query.code);
        if (at >= 0) links.splice(at, 1);
        touch();
        await fulfil(route, at >= 0 ? 'ShareLinkDeleted' : 'ShareLinkNotFound', at >= 0 ? 200 : 404);
        return;
      }
      case '/KliveCloud/SetItemAccess': {
        const item = find(body?.itemID);
        if (item) item.MinimumPermissionLevel = body?.everyone ? 'Everyone' : `${body?.entries?.length ?? 0} ${body?.entries?.length === 1 ? 'person' : 'people'}`;
        touch();
        await fulfil(route, item ? { ...dto(item), Access: { Everyone: body?.everyone ?? null, Inherit: body?.inherit ?? true, People: [], Summary: item.MinimumPermissionLevel } } : { error: 'ItemNotFound' }, item ? 200 : 404);
        return;
      }
      case '/KliveCloud/Ticket': {
        if (legacy) { await noRoute(); return; }
        const ids = (query.itemIDs ?? query.itemID ?? '').split(',').filter(Boolean);
        const issued = ids.map(id => find(id)).filter((item): item is FakeItem => !!item).map(item => {
          const token = `t${tickets.size + 1}x${item.ItemID}`;
          tickets.set(token, item.ItemID);
          return { ItemID: item.ItemID, Ticket: token, Path: `/KliveCloud/Open?t=${token}`, Inline: true, ExpiresUtc: new Date(Date.now() + 3 * H).toISOString() };
        });
        await fulfil(route, issued.length ? { Tickets: issued, Refused: [], LifetimeSeconds: 10_800 } : { error: 'ItemNotFound', message: 'Not found' }, issued.length ? 200 : 404);
        return;
      }
      default:
        await fulfil(route, { success: true });
    }
  });

  return state;
}

export async function openCloud(page: Page, options: CloudMockOptions & { path?: string } = {}): Promise<CloudApiMock> {
  const api = await installCloudApiMock(page, options);
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: cloudTestOrigin }]);
  await page.addInitScript(() => { window.localStorage.setItem('vnavCollapsed', '0'); });
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(options.path ?? '/klivecloud', { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.getByTestId('kcl-root').waitFor({ state: 'visible', timeout: 15_000 });
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(3_000 * (attempt + 1));
    }
  }
  return api;
}
