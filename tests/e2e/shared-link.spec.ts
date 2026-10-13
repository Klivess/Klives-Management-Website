import { deflateSync } from 'node:zlib';
import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The public share page (/shared/[code]) against an in-memory KliveCloud. Every share route is
 * mocked, statefully: uploads, new folders, moves and deletes change what the next
 * GetSharedItemInfo returns. Photos are generated PNGs so thumbnails and the viewer have real
 * pixels. Screenshots land in test-results/shared-link/.
 *
 * The page fetches the share during the server render, which a browser-side mock can't see, so
 * each test boots the app on another page and moves to the share in-app.
 */

const API = 'https://klive.dev';
const SHOTS = 'test-results/shared-link';
const CODE = 'e2eShareCode';
const NOW = Date.now();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

test.describe.configure({ timeout: 120_000 });
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

// ── generated photos ────────────────────────────────────────────────────────

const CRC = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(buf: Buffer) {
    let c = 0xffffffff;
    for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
}

type RGB = [number, number, number];

function hsl(h: number, s: number, l: number): RGB {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
}

const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;

/** A landscape: sky, sun, two mountain ridges and a lake, its palette and shape set by `seed`. */
function photo(seed: number, width: number, height: number) {
    const hue = (seed * 53) % 360;
    const skyTop = hsl(hue, 0.5, 0.45);
    const skyLow = hsl((hue + 35) % 360, 0.65, 0.78);
    const far = hsl((hue + 210) % 360, 0.18, 0.46);
    const near = hsl((hue + 190) % 360, 0.24, 0.24);
    const lake = hsl((hue + 200) % 360, 0.35, 0.3);
    const raw = Buffer.alloc((width * 3 + 1) * height);
    for (let y = 0; y < height; y++) {
        const row = y * (width * 3 + 1);
        for (let x = 0; x < width; x++) {
            const u = x / width;
            const v = y / height;
            const ridgeFar = 0.44 + 0.08 * Math.sin(u * 6 + seed) + 0.04 * Math.sin(u * 19 + seed * 2);
            const ridgeNear = 0.6 + 0.07 * Math.sin(u * 4 + seed * 3) + 0.03 * Math.sin(u * 27 + seed);
            const sun = (u - 0.68) ** 2 + ((v - 0.24) * height / width) ** 2 < 0.0035;
            let color: RGB;
            if (v > 0.82) color = mix(lake, skyLow, 0.25 * Math.sin(y * 0.9) ** 2);
            else if (v > ridgeNear) color = mix(near, [10, 12, 9], (v - ridgeNear) * 2);
            else if (v > ridgeFar) color = far;
            else if (sun) color = [255, 238, 205];
            else color = mix(skyTop, skyLow, Math.min(1, v / ridgeFar));
            raw[row + 1 + x * 3] = color[0];
            raw[row + 2 + x * 3] = color[1];
            raw[row + 3 + x * 3] = color[2];
        }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8; // bit depth
    header[9] = 2; // RGB
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', header),
        pngChunk('IDAT', deflateSync(raw)),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

const photoCache = new Map<string, Buffer>();
function cachedPhoto(seed: number, width: number, height: number) {
    const key = `${seed}:${width}x${height}`;
    if (!photoCache.has(key)) photoCache.set(key, photo(seed, width, height));
    return photoCache.get(key)!;
}

// ── the share ───────────────────────────────────────────────────────────────

interface Node {
    ItemID: string;
    Name: string;
    ParentFolderID: string;
    ItemType: 'File' | 'Folder';
    FileSizeBytes: number;
    CreatedDate: string;
    ModifiedDate: string;
    IsImage: boolean;
    IsVideo: boolean;
    seed?: number;
    portrait?: boolean;
    text?: string;
}

const MARKDOWN = `# Iceland, ten days

The ring road, counter-clockwise, with two nights in the highlands.

## Bookings

| Night | Where | Paid |
| --- | --- | --- |
| 1–2 | Reykjavík | yes |
| 3 | Vík | yes |
| 4–5 | Höfn | deposit |

- Car pickup at **08:30** from the airport desk
- Ferry to Heimaey is *weather permitting*
- Glacier walk: bring \`crampons\` (provided) and gloves

> Fuel up whenever the gauge is under half. Stations are far apart in the east.

See [the road conditions](https://umferdin.is) every morning.
`;

const CSV = `Date,Category,Description,Amount (ISK)
2026-07-02,Fuel,N1 Hella,14820
2026-07-02,Food,Bakery in Vík,3240
2026-07-03,Lodging,Guesthouse Höfn,32500
2026-07-04,Activity,"Glacier walk, 3h",18900
2026-07-05,Food,Lobster soup,5600
2026-07-06,Fuel,Olís Egilsstaðir,12400
`;

const NOTES = `Packing
- Wool base layers (2 sets)
- Rain shell + overtrousers
- Swimsuit for the hot pools
- Power bank, 12V car charger

Don't forget: the camera's second battery is in the side pocket.
`;

const ROUTE_JSON = '{"name":"Ring road","stages":[{"from":"Reykjavík","to":"Vík","km":186},{"from":"Vík","to":"Höfn","km":272},{"from":"Höfn","to":"Egilsstaðir","km":247}],"ferry":false}';

let nextId = 100;
const id = () => String(++nextId).padStart(12, '7');

function folder(name: string, parent: string, ageMs: number): Node {
    return { ItemID: id(), Name: name, ParentFolderID: parent, ItemType: 'Folder', FileSizeBytes: 0, CreatedDate: iso(ageMs + DAY), ModifiedDate: iso(ageMs), IsImage: false, IsVideo: false };
}

function file(name: string, parent: string, bytes: number, ageMs: number, extra: Partial<Node> = {}): Node {
    const ext = name.split('.').pop()!.toLowerCase();
    return {
        ItemID: id(), Name: name, ParentFolderID: parent, ItemType: 'File', FileSizeBytes: bytes,
        CreatedDate: iso(ageMs + HOUR), ModifiedDate: iso(ageMs),
        IsImage: ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext), IsVideo: ['mp4', 'mov', 'mkv'].includes(ext), ...extra,
    };
}

interface Share {
    root: Node;
    items: Node[];
    mode: 'ReadOnly' | 'Write' | 'WriteDelete';
    zip: boolean;
    expiresInMs: number | null;
    status: 200 | 404 | 410;
    /** Every request the page made that changes something, and every ZIP it asked for. */
    calls: string[];
}

function tripShare(mode: Share['mode'] = 'WriteDelete'): Share {
    const root = folder('Iceland trip', '', 2 * HOUR);
    const photos = folder('Photos', root.ItemID, 3 * HOUR);
    const docs = folder('Documents', root.ItemID, 5 * DAY);
    const drone = folder('Drone', root.ItemID, 9 * DAY);
    const items: Node[] = [photos, docs, drone];
    const places = ['Seljalandsfoss', 'Skógafoss', 'Reynisfjara', 'Jökulsárlón', 'Vestrahorn', 'Stokksnes', 'Dettifoss', 'Mývatn', 'Kirkjufell', 'Hraunfossar', 'Gullfoss', 'Þingvellir', 'Diamond beach', 'Fjaðrárgljúfur'];
    places.forEach((place, i) => items.push(file(`IMG_${4210 + i * 7} ${place}.jpg`, photos.ItemID, 2_400_000 + i * 731_000, (i + 1) * 5 * HOUR, { seed: i + 3, portrait: i % 5 === 2 })));
    items.push(file('Glacier walk.mp4', photos.ItemID, 184_000_000, 26 * HOUR, { seed: 21 }));
    items.push(file('Northern lights timelapse.mov', photos.ItemID, 412_000_000, 30 * HOUR, { seed: 22 }));
    items.push(file('Itinerary.pdf', docs.ItemID, 482_000, 6 * DAY));
    items.push(file('Budget.xlsx', docs.ItemID, 38_400, 6 * DAY + 3 * HOUR));
    items.push(file('Packing list.md', docs.ItemID, MARKDOWN.length, 7 * DAY, { text: MARKDOWN }));
    items.push(file('Expenses.csv', docs.ItemID, CSV.length, 2 * DAY, { text: CSV }));
    items.push(file('notes.txt', docs.ItemID, NOTES.length, 8 * DAY, { text: NOTES }));
    items.push(file('route.json', root.ItemID, ROUTE_JSON.length, 12 * DAY, { text: ROUTE_JSON }));
    items.push(file('Map.png', root.ItemID, 1_830_000, 4 * DAY, { seed: 30 }));
    items.push(file('Highlights.mp4', root.ItemID, 96_500_000, 20 * HOUR, { seed: 31 }));
    items.push(file('Raw files.zip', root.ItemID, 3_220_000_000, 11 * DAY));
    return { root, items, mode, zip: true, expiresInMs: 3 * DAY + HOUR, status: 200, calls: [] };
}

function info(share: Share) {
    return {
        ...share.root,
        ShareCode: CODE,
        SharePermissionMode: share.mode,
        CanWrite: share.mode !== 'ReadOnly',
        CanDelete: share.mode === 'WriteDelete',
        ...(share.zip ? { CanDownloadZip: share.root.ItemType === 'Folder' } : {}),
        ExpirationDate: share.expiresInMs == null ? null : new Date(Date.now() + share.expiresInMs).toISOString(),
        Children: share.root.ItemType === 'Folder' ? share.items.map(({ seed: _s, portrait: _p, text: _t, ...rest }) => rest) : [],
    };
}

const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-expose-headers': '*',
};

async function mockShare(page: Page, share: Share) {
    await page.route(`${API}/**`, async (route: Route) => {
        const request = route.request();
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
        const url = new URL(request.url());
        const json = (body: unknown, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
        const text = (body: string, status = 200) => route.fulfill({ status, headers: cors, contentType: 'text/plain', body });
        if (!url.pathname.startsWith('/KliveCloud/')) return json({ error: 'NotFound' }, 404);
        if (url.searchParams.get('code') !== CODE || share.status === 404) return text('ShareLinkNotFound', 404);
        if (share.status === 410) return text('ShareLinkExpired', 410);

        const find = (itemId: string | null) => (itemId ? share.items.find(item => item.ItemID === itemId) : share.root) ?? null;
        const target = find(url.searchParams.get('itemID'));
        const descendants = (folderId: string): Node[] => share.items.filter(item => item.ParentFolderID === folderId)
            .flatMap(item => [item, ...(item.ItemType === 'Folder' ? descendants(item.ItemID) : [])]);

        switch (url.pathname) {
            case '/KliveCloud/GetSharedItemInfo':
                return json(info(share));
            case '/KliveCloud/GetSharedPreview': {
                if (!target?.seed) return text('ItemNotPreviewable', 400);
                const width = Math.min(Number(url.searchParams.get('maxWidth')) || 320, 480);
                const height = Math.round(width * (target.portrait ? 4 / 3 : 3 / 4));
                return route.fulfill({ status: 200, headers: { ...cors, 'cache-control': 'private, max-age=300' }, contentType: 'image/png', body: cachedPhoto(target.seed, width, height) });
            }
            case '/KliveCloud/DownloadShared': {
                if (!target || target.ItemType !== 'File') return text('SharedFileNotFound', 404);
                const body = target.text != null ? Buffer.from(target.text) : target.seed ? cachedPhoto(target.seed, target.portrait ? 720 : 1280, target.portrait ? 960 : 960) : Buffer.from('%binary%');
                return route.fulfill({ status: 200, headers: { ...cors, 'content-disposition': `attachment; filename="${encodeURIComponent(target.Name)}"` }, contentType: 'application/octet-stream', body });
            }
            case '/KliveCloud/StreamSharedVideo':
            case '/KliveCloud/StreamSharedVideoEmbed':
                // No video bytes to hand out: the page has to fall back to its download card.
                return text('VideoEmbedGenerationFailed', 500);
            case '/KliveCloud/DownloadSharedZip':
                share.calls.push(`zip${url.search.replace(`code=${CODE}`, '').replace('?&', '?')}`);
                return route.fulfill({ status: 200, headers: { ...cors, 'content-disposition': 'attachment; filename="share.zip"' }, contentType: 'application/zip', body: Buffer.from('PK\u0005\u0006' + '\u0000'.repeat(18)) });
            case '/KliveCloud/UploadShared': {
                const name = url.searchParams.get('fileName')!;
                const parent = url.searchParams.get('parentFolderID')!;
                const created = file(name, parent, request.postDataBuffer()?.length ?? 0, 0);
                share.items.push(created);
                share.calls.push(`upload ${name}`);
                return json({ ItemID: created.ItemID, Name: name, ParentFolderID: parent, ItemType: 'File', FileSizeBytes: created.FileSizeBytes });
            }
            case '/KliveCloud/CreateSharedFolder': {
                const created = folder(url.searchParams.get('name')!, url.searchParams.get('parentFolderID') || share.root.ItemID, 0);
                share.items.push(created);
                share.calls.push(`folder ${created.Name}`);
                return json({ ItemID: created.ItemID, Name: created.Name, ParentFolderID: created.ParentFolderID, ItemType: 'Folder' });
            }
            case '/KliveCloud/DeleteSharedItem': {
                if (!target || target === share.root) return text('SharedItemNotFound', 404);
                const gone = new Set([target.ItemID, ...descendants(target.ItemID).map(item => item.ItemID)]);
                share.items = share.items.filter(item => !gone.has(item.ItemID));
                share.calls.push(`delete ${target.Name}`);
                return text('ItemDeleted');
            }
            case '/KliveCloud/MoveSharedItem': {
                const destination = url.searchParams.get('newParentFolderID')!;
                if (!target) return text('SharedItemNotFound', 404);
                target.ParentFolderID = destination;
                share.calls.push(`move ${target.Name} -> ${find(destination)?.Name}`);
                return text('ItemMoved');
            }
            default:
                return json({ error: 'NotFound' }, 404);
        }
    });
    await page.routeWebSocket(/klive\.dev/, ws => ws.close({ code: 1000 }));
}

/**
 * Boots the app on the sign-in page, then moves to the share in-app (see the note at the top).
 * A cold dev-server load occasionally never hydrates on this machine; that gets one reload.
 */
async function openShare(page: Page, query = '') {
    const attempt = async () => {
        await page.goto('/');
        await page.waitForFunction(() => !!(document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null)?.__vue_app__, null, { timeout: 40_000 });
        await page.evaluate(path => {
            const app = (document.querySelector('#__nuxt') as unknown as { __vue_app__: { config: { globalProperties: { $router: { push: (to: string) => Promise<unknown> } } } } }).__vue_app__;
            return app.config.globalProperties.$router.push(path);
        }, `/shared/${CODE}${query}`);
        await page.locator('.ks-head').waitFor({ timeout: 30_000 });
    };
    try {
        await attempt();
    } catch {
        await attempt();
    }
}

/** Waits out a dialog's fade, so a screenshot or the next dialog doesn't catch it halfway. */
async function dialogSettled(page: Page, open: boolean) {
    if (open) await expect(page.locator('.pc-modal-backdrop')).toHaveCSS('opacity', '1');
    else await expect(page.locator('.pc-modal-backdrop')).toHaveCount(0);
}

async function settleThumbs(page: Page) {
    await page.waitForFunction(() => {
        const thumbs = [...document.querySelectorAll('.kct img')] as HTMLImageElement[];
        return thumbs.every(img => img.complete);
    }, null, { timeout: 15_000 });
    await page.waitForTimeout(250);
}

/** A screenshot once every finite animation and transition (page fades, the viewer opening) has finished. */
async function shot(page: Page, name: string) {
    await page.waitForFunction(() => document.getAnimations().every(animation =>
        animation.playState !== 'running' || animation.effect?.getComputedTiming().iterations === Infinity));
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

// ── tests ───────────────────────────────────────────────────────────────────

test('folder share: header, list, sort, folders, grid and the viewer', async ({ page }) => {
    const share = tripShare();
    await mockShare(page, share);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openShare(page);

    await expect(page.locator('.ks-title h1')).toHaveText('Iceland trip');
    await expect(page.locator('.ks-summary')).toHaveText('25 files · 3 folders · 3.7 GB');
    await expect(page.locator('.ks-meta')).toContainText('Can add & delete');
    await expect(page.locator('.ks-meta')).toContainText('Expires in 3 days');

    // Folders first, then files by name; a folder shows its total and how many things are in it.
    const names = page.locator('.ks-row .ks-open');
    await expect(names).toHaveText(['Documents', 'Drone', 'Photos', 'Highlights.mp4', 'Map.png', 'Raw files.zip', 'route.json']);
    const photosRow = page.locator('.ks-row', { hasText: 'Photos' });
    await expect(photosRow.locator('.ks-c-kind')).toHaveText('16 items');
    await expect(page.locator('.ks-row', { hasText: 'Drone' }).locator('.ks-c-size')).toHaveText('—');
    await expect(page.locator('.ks-row', { hasText: 'Raw files.zip' }).locator('.ks-c-kind')).toHaveText('ZIP archive');
    await expect(page.locator('.ks-foot')).toContainText('7 items');
    await settleThumbs(page);
    await shot(page, '01-folder-list');

    // Sort by size, largest first; folders stay on top.
    await page.locator('th.ks-c-size .ks-sort').click();
    await expect(names.nth(3)).toHaveText('Raw files.zip');
    await page.locator('th.ks-c-name .ks-sort').click();
    await expect(names.nth(3)).toHaveText('Highlights.mp4');

    // Into Photos: mostly pictures, so it opens as a grid; the address says where we are.
    await photosRow.click();
    await expect(page).toHaveURL(/\?f=7+\d+/);
    await expect(page.locator('.ks-crumb')).toHaveText(['Iceland trip', 'Photos']);
    await expect(page.locator('.ks-tile')).toHaveCount(16);
    await settleThumbs(page);
    await shot(page, '02-photos-grid');

    // A photo opens over the page; arrows step through the folder; Escape and Back both close it.
    await page.locator('.ks-tile', { hasText: 'Jökulsárlón' }).click();
    const viewer = page.locator('.kcv');
    await expect(viewer).toBeVisible();
    await expect(viewer.locator('.kcv-title strong')).toContainText('Jökulsárlón');
    await expect(viewer.locator('.kcp-img.loaded')).toBeVisible();
    await expect(page).toHaveURL(/file=7+\d+/);
    const count = await viewer.locator('.kcv-count').innerText();
    await page.keyboard.press('ArrowRight');
    await expect(viewer.locator('.kcv-count')).not.toHaveText(count);
    await expect(viewer.locator('.kcp-img.loaded')).toBeVisible();
    await shot(page, '03-viewer-photo');
    const lastViewed = await viewer.locator('.kcv-title strong').innerText();
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
    await expect(page).not.toHaveURL(/file=/);
    await expect(page.locator('.ks-crumb.current')).toHaveText('Photos');
    // Focus comes back to the photo last looked at, so the keyboard carries on from there.
    await expect(page.locator('.ks-open:focus')).toHaveText(lastViewed);

    await page.locator('.ks-tile', { hasText: 'Kirkjufell' }).click();
    await expect(viewer).toBeVisible();
    await page.goBack();
    await expect(viewer).toHaveCount(0);
    await expect(page.locator('.ks-crumb.current')).toHaveText('Photos');

    // A video the browser can't get (the mock has no bytes) ends on the download card.
    await page.locator('.ks-tile', { hasText: 'Glacier walk.mp4' }).click();
    await expect(viewer.locator('.kcp-none')).toBeVisible({ timeout: 15_000 });
    await expect(viewer.locator('.kcp-none .ot-btn')).toHaveAttribute('href', /DownloadShared\?code=e2eShareCode&itemID=7+\d+$/);
    await expect(viewer.locator('.kcp-problem')).toHaveText("This video can't be played here.");
    await shot(page, '04-viewer-video-fallback');
    await page.keyboard.press('Escape');

    // An empty folder says so, and offers the ways to fill it.
    await page.locator('.ks-crumb', { hasText: 'Iceland trip' }).click();
    await page.locator('.ks-row', { hasText: 'Drone' }).click();
    await expect(page.locator('.ks-empty strong')).toHaveText('This folder is empty');
    await expect(page.locator('.ks-empty .ot-btn')).toHaveText(['Upload files', 'New folder']);
    await shot(page, '04b-empty-folder');
    await page.locator('.ks-crumb', { hasText: 'Iceland trip' }).click();
    await page.locator('.ks-row', { hasText: 'Photos' }).click();

    // The view switch is remembered for this share.
    await page.locator('.ks-views button[aria-label="List"]').click();
    await expect(page.locator('.ks-row')).toHaveCount(16);
    await page.locator('.ks-crumb', { hasText: 'Iceland trip' }).click();
    await page.locator('.ks-row', { hasText: 'Photos' }).click();
    await expect(page.locator('.ks-row')).toHaveCount(16);
});

test('documents preview as text, markdown and a table; search finds files anywhere', async ({ page }) => {
    const share = tripShare();
    await mockShare(page, share);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openShare(page);

    await page.locator('.ks-row', { hasText: 'Documents' }).click();
    await page.locator('.ks-row', { hasText: 'Packing list.md' }).click();
    const viewer = page.locator('.kcv');
    await expect(viewer.locator('.kcp-md h1')).toHaveText('Iceland, ten days');
    await expect(viewer.locator('.kcp-md table tr')).toHaveCount(4);
    await shot(page, '05-viewer-markdown');

    await page.keyboard.press('ArrowLeft');
    await expect(viewer.locator('.kcv-title strong')).toHaveText('notes.txt');
    await page.keyboard.press('ArrowLeft');
    await expect(viewer.locator('.kcv-title strong')).toHaveText('Itinerary.pdf');
    await page.keyboard.press('ArrowLeft');
    await expect(viewer.locator('.kcv-title strong')).toHaveText('Expenses.csv');
    await expect(viewer.locator('.kcp-table thead th')).toHaveText(['Date', 'Category', 'Description', 'Amount (ISK)']);
    await expect(viewer.locator('.kcp-table tbody tr')).toHaveCount(6);
    await expect(viewer.locator('.kcp-table thead th.num')).toHaveText(['Amount (ISK)']);
    await shot(page, '06-viewer-csv');
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);

    // "/" jumps to search; results come from every folder and say where they live.
    await page.keyboard.press('/');
    await page.keyboard.type('foss');
    await expect(page.locator('.ks-crumbs')).toContainText('5 results for “foss”');
    await expect(page.locator('.ks-row')).toHaveCount(5);
    await expect(page.locator('.ks-row .ks-where').first()).toHaveText('Photos');
    await settleThumbs(page);
    await shot(page, '07-search');
    await page.locator('.ks-row .ks-where').first().click();
    await expect(page.locator('.ks-crumb.current')).toHaveText('Photos');
    await expect(page.locator('.ks-search input')).toHaveValue('');

    // A JSON file is shown formatted and highlighted.
    await page.locator('.ks-crumb', { hasText: 'Iceland trip' }).click();
    await page.locator('.ks-row', { hasText: 'route.json' }).click();
    await expect(page.locator('.kcp-code .hljs-attr').first()).toBeVisible();
    await expect(page.locator('.kcp-code')).toContainText('"stages": [');
    await shot(page, '07b-viewer-code');
});

test('selection: zip download, move into a folder, delete, new folder', async ({ page }) => {
    const share = tripShare();
    await mockShare(page, share);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openShare(page);

    // Download all is one ZIP of the whole share.
    const whole = page.waitForEvent('download');
    await page.locator('.ks-actions a', { hasText: 'Download all' }).click();
    await whole;
    expect(share.calls).toContain('zip?');

    // Pick two files: the toolbar becomes the selection bar.
    await page.locator('.ks-row', { hasText: 'Map.png' }).locator('.ks-check').click();
    await page.locator('.ks-row', { hasText: 'route.json' }).locator('.ks-check').click();
    await expect(page.locator('.ks-selected')).toContainText('2 selected');
    await shot(page, '08-selection');

    const picked = page.waitForEvent('download');
    await page.locator('.ks-tools button', { hasText: 'Download' }).click();
    await picked;
    expect(share.calls.at(-1)).toMatch(/^zip\?itemIDs=7+\d+%2C7+\d+$/);

    // Move them into Drone with the folder picker.
    await page.locator('.ks-tools button', { hasText: 'Move' }).click();
    const picker = page.locator('.pc-modal');
    await expect(picker.locator('h3')).toHaveText('Move 2 items');
    await picker.locator('.kcf-row', { hasText: 'Drone' }).click();
    await dialogSettled(page, true);
    await shot(page, '09-move-picker');
    await picker.locator('button', { hasText: 'Move here' }).click();
    await expect(page.locator('.ks-toast')).toHaveText('Moved 2 items to Drone');
    await dialogSettled(page, false);
    await expect(page.locator('.ks-row', { hasText: 'Map.png' })).toHaveCount(0);
    expect(share.calls).toEqual(expect.arrayContaining(['move Map.png -> Drone', 'move route.json -> Drone']));

    // Delete a folder (and everything in it) from its row menu.
    await page.locator('.ks-row', { hasText: 'Drone' }).hover();
    await page.locator('.ks-row', { hasText: 'Drone' }).locator('button[title="More"]').click();
    await expect(page.locator('.ks-menu > *')).toHaveText(['Open', 'Download as ZIP', 'Copy link', 'Move to…', 'Delete']);
    await shot(page, '09b-row-menu');
    await page.locator('.ks-menu button', { hasText: 'Delete' }).click();
    const confirm = page.locator('.pc-modal');
    await expect(confirm.locator('h3')).toContainText('Delete “Drone”?');
    await expect(confirm).toContainText('Folders are deleted with everything in them.');
    await dialogSettled(page, true);
    await shot(page, '10-delete-confirm');
    await confirm.locator('button', { hasText: 'Delete' }).click();
    await expect(page.locator('.ks-toast').last()).toHaveText('Deleted “Drone”');
    await expect(page.locator('.ks-row', { hasText: 'Drone' })).toHaveCount(0);
    await dialogSettled(page, false);

    // A new folder, named in a dialog.
    await page.locator('.ks-newfolder').click();
    await page.locator('.pc-modal input').fill('Edits');
    await page.keyboard.press('Enter');
    await expect(page.locator('.ks-row', { hasText: 'Edits' })).toHaveCount(1);
    expect(share.calls).toContain('folder Edits');
    await dialogSettled(page, false);

    // Ctrl+A then Delete asks about everything here.
    await page.locator('body').click({ position: { x: 5, y: 880 } });
    await page.keyboard.press('Control+a');
    await expect(page.locator('.ks-selected')).toContainText(/\d+ selected/);
    await page.keyboard.press('Delete');
    await expect(page.locator('.pc-modal h3')).toHaveText(/Delete \d+ items\?/);
    await page.keyboard.press('Escape');
});

test('uploads: picker, drop and paste, with the tray', async ({ page }) => {
    const share = tripShare('Write');
    await mockShare(page, share);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openShare(page);
    await expect(page.locator('.ks-meta')).toContainText('Can add files');

    await page.locator('.ks-row', { hasText: 'Documents' }).click();
    await expect(page.locator('.ks-crumb.current')).toHaveText('Documents');

    // The split button's other ways in.
    await page.locator('.ks-split-more').click();
    await expect(page.locator('.ks-split .ks-menu > *')).toHaveText(['Upload files', 'Upload a folder', 'New folder']);
    await shot(page, '10b-upload-menu');
    await page.keyboard.press('Escape');
    await expect(page.locator('.ks-menu')).toHaveCount(0);

    // Dragging files over the page shows where they'll land.
    await page.evaluate(() => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(['x'], 'a.txt', { type: 'text/plain' }));
        document.querySelector('.ks-list')!.dispatchEvent(new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    });
    await expect(page.locator('.ks-drop-card')).toHaveText('Drop to upload to Documents');
    await shot(page, '10c-drop-overlay');
    await page.evaluate(() => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(['x'], 'a.txt', { type: 'text/plain' }));
        document.querySelector('.ks-list')!.dispatchEvent(new DragEvent('dragleave', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    });
    await expect(page.locator('.ks-drop')).toHaveCount(0);

    await page.locator('input[type=file]:not([webkitdirectory])').setInputFiles([
        { name: 'Boarding pass.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(220_000, 1) },
        { name: 'Receipt.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(90_000, 2) },
        { name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) },
    ]);
    const tray = page.locator('.kcu');
    await expect(tray.locator('.kcu-titles strong')).toHaveText('2 files uploaded, 1 failed');
    await expect(tray.locator('li.failed small')).toHaveText("Empty files can't be uploaded.");
    await expect(page.locator('.ks-row', { hasText: 'Boarding pass.pdf' })).toHaveCount(1);
    await expect(page.locator('.ks-row', { hasText: 'Receipt.jpg' })).toHaveCount(1);
    await shot(page, '11-upload-tray');

    // Dropping a file over the page uploads it into the folder being shown.
    await page.evaluate(() => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(['day 3: lunch at the harbour'], 'Dropped note.txt', { type: 'text/plain' }));
        const target = document.querySelector('.ks-list')!;
        for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
    });
    await expect(page.locator('.ks-row', { hasText: 'Dropped note.txt' })).toHaveCount(1);

    // Pasting a screenshot uploads it with a name worth keeping.
    await page.evaluate(() => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([new Uint8Array(4000)], 'image.png', { type: 'image/png' }));
        window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    });
    await expect(page.locator('.ks-row .ks-open', { hasText: /^Pasted image \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}\.png$/ })).toHaveCount(1);
    expect(share.calls.filter(call => call.startsWith('upload'))).toHaveLength(4);

    // This link can't delete: no delete anywhere.
    await page.locator('.ks-row', { hasText: 'notes.txt' }).locator('.ks-check').click();
    await expect(page.locator('.ks-tools button', { hasText: 'Delete' })).toHaveCount(0);
    await expect(page.locator('.ks-tools button', { hasText: 'Move' })).toHaveCount(1);
});

test('view-only share and copying links', async ({ page }) => {
    const share = tripShare('ReadOnly');
    await mockShare(page, share);
    await page.setViewportSize({ width: 1280, height: 820 });
    await openShare(page);

    await expect(page.locator('.ks-meta')).toContainText('View only');
    await expect(page.locator('.ks-split')).toHaveCount(0);
    await expect(page.locator('.ks-newfolder')).toHaveCount(0);

    await page.locator('.ks-actions button', { hasText: 'Copy link' }).click();
    await expect(page.locator('.ks-actions button')).toContainText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/shared/${CODE}$`));

    // A file's own link opens straight into the viewer, in its folder.
    await page.locator('.ks-row', { hasText: 'Photos' }).click();
    const tile = page.locator('.ks-tile', { hasText: 'Vestrahorn' });
    await tile.hover();
    await tile.locator('button[title="More"]').click();
    await page.locator('.ks-menu button', { hasText: 'Copy link' }).click();
    await expect(page.locator('.ks-toast')).toHaveText('Link copied');
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(new RegExp(`/shared/${CODE}\\?file=7+\\d+$`));

    await openShare(page, new URL(link).search);
    await expect(page.locator('.kcv-title strong')).toContainText('Vestrahorn');
    await page.locator('.kcv button[aria-label="Close"]').click();
    await expect(page.locator('.ks-crumb.current')).toHaveText('Photos');
    await expect(page).toHaveURL(/\?f=7+\d+$/);
});

test('a single shared file, and links that no longer work', async ({ page }) => {
    const share = tripShare();
    const picture = share.items.find(item => item.Name.includes('Kirkjufell'))!;
    share.root = { ...picture, ParentFolderID: '' };
    share.items = [];
    share.expiresInMs = 5 * HOUR;
    await mockShare(page, share);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openShare(page);

    await expect(page.locator('.ks-title h1')).toHaveText(picture.Name);
    await expect(page.locator('.ks-summary')).toContainText('JPEG image · 7.9 MB');
    await expect(page.locator('.ks-meta .ot-chip.warn')).toHaveText('Expires in 5 hours');
    await expect(page.locator('.ks-single .kcp-img.loaded')).toBeVisible();
    await expect(page.locator('.ks-actions a', { hasText: 'Download' })).toHaveAttribute('href', /DownloadShared\?code=e2eShareCode$/);
    await shot(page, '12-single-photo');

    share.root = { ...share.root, Name: 'Ferry timetable.docx', IsImage: false, FileSizeBytes: 64_200 };
    await openShare(page);
    await expect(page.locator('.kcp-none-meta')).toHaveText('Word document · 63 KB');
    await shot(page, '13-single-download-card');

    share.status = 410;
    await openShare(page);
    await expect(page.locator('.ks-state h2')).toHaveText('This link has expired');
    await shot(page, '14-expired');

    share.status = 404;
    await openShare(page);
    await expect(page.locator('.ks-state h2')).toHaveText("This link doesn't work");
});

test('phone width', async ({ page }) => {
    const share = tripShare();
    await mockShare(page, share);
    await page.setViewportSize({ width: 390, height: 844 });
    await openShare(page);

    await expect(page.locator('.ks-row')).toHaveCount(7);
    await expect(page.locator('.ks-row').first().locator('.ks-sub-meta')).toHaveText('5 items · 509 KB');
    await expect(page.locator('.ks-row', { hasText: 'Drone' }).locator('.ks-sub-meta')).toHaveText('Empty');
    // The summary keeps its room in the header, and the upload button stays beside the search box.
    expect(await page.locator('.ks-summary').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const search = (await page.locator('.ks-search').boundingBox())!;
    const upload = (await page.locator('.ks-split').boundingBox())!;
    expect(Math.abs(upload.y - search.y)).toBeLessThan(4);
    await settleThumbs(page);
    await shot(page, '15-phone-list');

    await page.locator('.ks-row', { hasText: 'Photos' }).click();
    await expect(page.locator('.ks-tile')).toHaveCount(16);
    await settleThumbs(page);
    await shot(page, '16-phone-grid');

    await page.locator('.ks-tile', { hasText: 'Skógafoss' }).click();
    await expect(page.locator('.kcp-img.loaded')).toBeVisible();
    await shot(page, '17-phone-viewer');
    await page.keyboard.press('Escape');

    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(docWidth).toBeLessThanOrEqual(390);
});
