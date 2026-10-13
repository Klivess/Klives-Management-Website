<template>
    <div class="kcp" :class="[`is-${shown}`, `in-${variant}`]">
        <div v-if="shown === 'image'" ref="stage" class="kcp-image" :class="{ zoomable, zoomed }" @click="toggleZoom">
            <img v-if="placeholder && !loaded" class="kcp-ph" :src="placeholder" alt="" aria-hidden="true" draggable="false" />
            <img ref="img" class="kcp-img" :class="{ loaded }" :src="imageSrc" :alt="item.name" draggable="false"
                 @load="onImageLoad" @error="fail(`Couldn't load this image.`)" />
            <span v-if="!loaded" class="kcp-spinner" aria-hidden="true"></span>
        </div>

        <div v-else-if="shown === 'video'" class="kcp-video">
            <video :key="videoSrc" ref="video" :src="videoSrc" :poster="poster" controls playsinline preload="metadata" :autoplay="autoplay"
                   @loadeddata="videoReady = true" @error="onVideoError"></video>
            <div v-if="converting && !videoReady" class="kcp-wait kcp-over"><span class="kcp-spinner"></span><span>Preparing video…</span></div>
        </div>

        <div v-else-if="shown === 'audio'" class="kcp-audio">
            <KliveCloudFileGlyph kind="audio" :size="72" />
            <div class="kcp-audio-name">{{ item.name }}</div>
            <audio ref="audio" :src="api.download(item)" controls preload="metadata" :autoplay="autoplay" @error="fail(`Couldn't play this file.`)"></audio>
        </div>

        <iframe v-else-if="shown === 'pdf'" class="kcp-pdf" :src="pdfUrl" :title="item.name"></iframe>

        <div v-else-if="shown === 'text'" class="kcp-doc">
            <div class="kcp-doc-body">
                <table v-if="table" class="kcp-table">
                    <thead><tr><th v-for="(cell, i) in table[0]" :key="i" :class="{ num: numeric.has(i) }">{{ cell }}</th></tr></thead>
                    <tbody><tr v-for="(row, r) in table.slice(1)" :key="r"><td v-for="(cell, i) in row" :key="i" :class="{ num: numeric.has(i) }">{{ cell }}</td></tr></tbody>
                </table>
                <!-- eslint-disable-next-line vue/no-v-html -- markdown-it with raw HTML off -->
                <article v-else-if="html" class="kcp-md" @click="openLink" v-html="html"></article>
                <!-- eslint-disable-next-line vue/no-v-html -- highlight.js output escapes the source -->
                <pre v-else class="kcp-code"><code v-if="highlighted" v-html="highlighted"></code><code v-else>{{ text }}</code></pre>
            </div>
            <div v-if="cutNote" class="kcp-cut">{{ cutNote }}</div>
        </div>

        <div v-else-if="shown === 'loading'" class="kcp-wait"><span class="kcp-spinner"></span></div>

        <div v-else class="kcp-none">
            <KliveCloudFileGlyph :kind="item.kind" :size="variant === 'page' ? 88 : 76" />
            <div class="kcp-none-name">{{ item.name }}</div>
            <div class="kcp-none-meta">{{ describeItem(item) }} · {{ formatBytes(item.bytes) }}</div>
            <p v-if="problem" class="kcp-problem">{{ problem }}</p>
            <a class="ot-btn primary kcp-none-download" :href="api.download(item)"><KliveCloudIcon name="download" :size="16" /> Download</a>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { BROWSER_IMAGES, BROWSER_VIDEOS, describeItem, formatBytes, hasThumbnail, shareApi, type ShareItem } from '~/scripts/klivecloud/shared';

/* Shows one shared file as well as the browser allows: the image (click for full size), the
   video or audio player, the PDF, or the text of a document, code or CSV. Anything else, or
   anything that fails, gets a download card. */

const TEXT_LIMIT = 512 * 1024;
const PDF_LIMIT = 80 * 1024 * 1024;
const SVG_LIMIT = 4 * 1024 * 1024;
const HIGHLIGHT_LIMIT = 200 * 1024;
const TABLE_ROWS = 1000;

const LANGUAGES: Record<string, string> = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    vue: 'xml', svelte: 'xml', html: 'xml', htm: 'xml', xml: 'xml', csproj: 'xml', svg: 'xml',
    py: 'python', cs: 'csharp', java: 'java', kt: 'kotlin', swift: 'swift', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cc: 'cpp',
    go: 'go', rs: 'rust', rb: 'ruby', php: 'php', lua: 'lua', r: 'r', pl: 'perl', sh: 'bash', bash: 'bash', zsh: 'bash',
    sql: 'sql', css: 'css', scss: 'scss', sass: 'scss', less: 'less', json: 'json', jsonc: 'json', yml: 'yaml', yaml: 'yaml',
    toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini', gradle: 'groovy',
};

const props = withDefaults(defineProps<{
    item: ShareItem;
    code: string;
    /** The file is the whole share, so it is addressed by the code alone. */
    single?: boolean;
    variant?: 'viewer' | 'page';
    autoplay?: boolean;
}>(), { single: false, variant: 'viewer', autoplay: false });

const emit = defineEmits<{ zoom: [zoomed: boolean] }>();

const api = computed(() => shareApi(props.code, props.single));
const ext = props.item.ext;
const failed = ref(false);
const problem = ref('');
const needsFetch = props.item.preview === 'pdf' || props.item.preview === 'text' || (props.item.preview === 'image' && ext === 'svg');
const busy = ref(needsFetch);

// ── image ──
const stage = ref<HTMLElement | null>(null);
const img = ref<HTMLImageElement | null>(null);
const loaded = ref(false);
const zoomable = ref(false);
const zoomed = ref(false);
const svgUrl = ref('');
const imageSrc = computed(() => {
    if (BROWSER_IMAGES.has(ext)) return api.value.download(props.item);
    if (ext === 'svg') return svgUrl.value;
    return api.value.preview(props.item, 1920, 1920); // TIFF and the like: the server converts them
});
// The list's thumbnail, usually already cached: something to look at while the full image arrives.
const placeholder = computed(() => (hasThumbnail(props.item) ? api.value.preview(props.item) : ''));

// ── video & audio ──
const video = ref<HTMLVideoElement | null>(null);
const audio = ref<HTMLAudioElement | null>(null);
const converting = ref(!BROWSER_VIDEOS.has(ext));
const videoSrc = ref(converting.value ? api.value.playable(props.item) : api.value.stream(props.item));
const videoReady = ref(false);
const poster = computed(() => (props.variant === 'page' ? api.value.preview(props.item, 1280, 720) : api.value.preview(props.item)));

// ── pdf & text ──
const pdfUrl = ref('');
const text = ref('');
const html = ref('');
const highlighted = ref('');
const table = ref<string[][] | null>(null);
const truncated = ref(false);
const tableCut = ref(false);

const shown = computed(() => {
    if (failed.value) return 'none';
    switch (props.item.preview) {
        case 'image': return ext !== 'svg' || svgUrl.value ? 'image' : busy.value ? 'loading' : 'none';
        case 'video': return 'video';
        case 'audio': return 'audio';
        case 'pdf': return pdfUrl.value ? 'pdf' : busy.value ? 'loading' : 'none';
        case 'text': return text.value || html.value || table.value ? 'text' : busy.value ? 'loading' : 'none';
        default: return 'none';
    }
});

/** Columns holding only numbers line up on the right, like a spreadsheet. */
const numeric = computed(() => {
    const columns = new Set<number>();
    const rows = table.value?.slice(1) ?? [];
    const width = table.value?.[0]?.length ?? 0;
    for (let i = 0; i < width; i++) {
        const cells = rows.map(row => (row[i] ?? '').trim()).filter(Boolean);
        if (cells.length && cells.every(cell => /^[-+]?[\d\s.,]*\d[\d\s.,]*%?$/.test(cell))) columns.add(i);
    }
    return columns;
});

const cutNote = computed(() => {
    if (tableCut.value) return `Showing the first ${TABLE_ROWS.toLocaleString('en-GB')} rows`;
    if (truncated.value) return `Showing the first ${formatBytes(TEXT_LIMIT)}`;
    return '';
});

function fail(reason: string) {
    failed.value = true;
    problem.value = reason;
    if (zoomed.value) emit('zoom', false);
}

// ── image zoom: fit to the screen, or click for full size where you clicked ──

function measureZoom() {
    const el = img.value;
    if (!el || zoomed.value) return;
    zoomable.value = el.naturalWidth > el.clientWidth + 1 || el.naturalHeight > el.clientHeight + 1;
}

function onImageLoad() {
    loaded.value = true;
    void nextTick(measureZoom);
}

function toggleZoom(event: MouseEvent) {
    const el = img.value;
    const box = stage.value;
    if (!loaded.value || !el || !box) return;
    if (zoomed.value) {
        zoomed.value = false;
        emit('zoom', false);
        return;
    }
    if (!zoomable.value) return;
    const rect = el.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const fy = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    zoomed.value = true;
    emit('zoom', true);
    void nextTick(() => {
        const frame = box.getBoundingClientRect();
        box.scrollLeft = el.offsetLeft + fx * el.naturalWidth - (event.clientX - frame.left);
        box.scrollTop = el.offsetTop + fy * el.naturalHeight - (event.clientY - frame.top);
    });
}

// ── video: a format the browser can't play gets the server's MP4 copy instead ──

function onVideoError() {
    if (!converting.value) {
        converting.value = true;
        videoReady.value = false;
        videoSrc.value = api.value.playable(props.item);
        return;
    }
    fail(`This video can't be played here.`);
}

// ── fetching what an <img>/<iframe> can't take straight from the download ──

let abort: AbortController | null = null;
const objectUrls: string[] = [];

function track(url: string) {
    objectUrls.push(url);
    return url;
}

/** The first `limit` bytes of a download, and whether there was more. */
async function readHead(url: string, limit: number, signal: AbortSignal) {
    const res = await fetch(url, { signal, mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!res.body) {
        const all = new Uint8Array(await res.arrayBuffer());
        return { bytes: all.subarray(0, limit), cut: all.length > limit };
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let cut = false;
    for (;;) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        size += value.length;
        if (size > limit) {
            cut = true;
            reader.cancel().catch(() => undefined);
            break;
        }
    }
    const bytes = new Uint8Array(Math.min(size, limit));
    let at = 0;
    for (const chunk of chunks) {
        const take = Math.min(chunk.length, bytes.length - at);
        bytes.set(chunk.subarray(0, take), at);
        at += take;
        if (at >= bytes.length) break;
    }
    return { bytes, cut };
}

function looksBinary(content: string) {
    const sample = content.slice(0, 8192);
    if (sample.includes('\u0000')) return true;
    const replaced = sample.match(/�/g)?.length ?? 0;
    return replaced > sample.length * 0.02;
}

function guessDelimiter(content: string) {
    const line = content.slice(0, Math.max(0, content.indexOf('\n')) || 2000);
    const count = (char: string) => line.split(char).length - 1;
    return count(';') > count(',') ? ';' : count('\t') > count(',') ? '\t' : ',';
}

function parseDelimited(content: string, delimiter: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < content.length; i++) {
        const c = content[i];
        if (quoted) {
            if (c !== '"') field += c;
            else if (content[i + 1] === '"') { field += '"'; i++; }
            else quoted = false;
        } else if (c === '"' && field === '') {
            quoted = true;
        } else if (c === delimiter) {
            row.push(field);
            field = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && content[i + 1] === '\n') i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
            if (rows.length > TABLE_ROWS) {
                tableCut.value = true;
                return rows;
            }
        } else {
            field += c;
        }
    }
    if (field || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

async function present(content: string, cut: boolean) {
    if (ext === 'csv' || ext === 'tsv') {
        const rows = parseDelimited(content, ext === 'tsv' ? '\t' : guessDelimiter(content));
        if (rows.length > 1 && rows[0].length > 1) {
            table.value = rows;
            return;
        }
    }
    if (ext === 'md' || ext === 'markdown') {
        const { renderMarkdown } = await import('~/scripts/agentMarkdown');
        html.value = renderMarkdown(content);
        return;
    }
    let body = content;
    if ((ext === 'json' || ext === 'jsonc') && !cut) {
        try { body = JSON.stringify(JSON.parse(content), null, 2); } catch { /* shown as written */ }
    }
    text.value = body;
    const language = LANGUAGES[ext];
    if (language && body.length <= HIGHLIGHT_LIMIT) {
        const { default: hljs } = await import('highlight.js/lib/common');
        if (hljs.getLanguage(language)) highlighted.value = hljs.highlight(body, { language, ignoreIllegals: true }).value;
    }
}

async function load() {
    if (!needsFetch) return;
    abort = new AbortController();
    const { signal } = abort;
    try {
        if (props.item.preview === 'pdf') {
            // Phones and tablets show a PDF in a frame badly or not at all: they get the download card.
            if (!window.matchMedia('(pointer: fine)').matches || props.item.bytes > PDF_LIMIT) return;
            const res = await fetch(api.value.download(props.item), { signal, mode: 'cors' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            pdfUrl.value = track(URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })));
        } else if (ext === 'svg') {
            const { bytes, cut } = await readHead(api.value.download(props.item), SVG_LIMIT, signal);
            if (cut) return;
            svgUrl.value = track(URL.createObjectURL(new Blob([bytes], { type: 'image/svg+xml' })));
        } else {
            const { bytes, cut } = await readHead(api.value.download(props.item), TEXT_LIMIT, signal);
            const content = new TextDecoder('utf-8').decode(bytes);
            if (looksBinary(content)) return;
            truncated.value = cut;
            await present(content, cut);
        }
    } catch {
        if (!signal.aborted) problem.value = `Couldn't load the preview.`;
    } finally {
        if (!signal.aborted) busy.value = false;
    }
}

/** Links in a rendered document open in a new tab rather than replacing the share page. */
function openLink(event: MouseEvent) {
    const link = (event.target as HTMLElement | null)?.closest('a');
    const href = link?.getAttribute('href');
    if (!link || !href || href.startsWith('#')) return;
    event.preventDefault();
    window.open(link.href, '_blank', 'noopener,noreferrer');
}

function onResize() {
    measureZoom();
}

/**
 * A server-rendered image or player starts loading before the page hydrates, so it can finish
 * (or fail) before any listener exists. Read where it got to instead of waiting for an event
 * that has already happened.
 */
function catchUp() {
    const picture = img.value;
    if (picture?.getAttribute('src') && picture.complete) {
        if (picture.naturalWidth > 0) onImageLoad();
        else fail(`Couldn't load this image.`);
    }
    if (video.value?.error) onVideoError();
    else if (video.value && video.value.readyState >= 2) videoReady.value = true;
    if (audio.value?.error) fail(`Couldn't play this file.`);
}

onMounted(() => {
    catchUp();
    void load();
    window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
    abort?.abort();
    for (const url of objectUrls) URL.revokeObjectURL(url);
    window.removeEventListener('resize', onResize);
});
</script>

<style scoped>
.kcp {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}

.kcp-spinner {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 3px solid rgba(255, 255, 255, 0.12);
    border-top-color: var(--ot-accent);
    animation: kcp-spin 0.8s linear infinite;
    flex: 0 0 auto;
}
@keyframes kcp-spin { to { transform: rotate(360deg); } }

.kcp-wait {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--ot-text-2);
    font-size: 13px;
}
.kcp-over {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 10px 16px;
    border-radius: 999px;
    background: rgba(8, 10, 7, 0.82);
    pointer-events: none;
}

/* image */
.kcp-image {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
}
.kcp-image.zoomable { cursor: zoom-in; }
.kcp-image.zoomed { display: block; overflow: auto; cursor: zoom-out; }
.kcp-img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    opacity: 0;
    transition: opacity var(--ot-normal);
    user-select: none;
}
.kcp-img.loaded { opacity: 1; }
.kcp-image.zoomed .kcp-img { display: block; max-width: none; max-height: none; margin: 0 auto; }
.kcp-ph {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: blur(12px);
    opacity: 0.55;
}
.kcp-image > .kcp-spinner { position: absolute; left: 50%; top: 50%; margin: -13px 0 0 -13px; }

/* video & audio */
.kcp-video { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.kcp-video video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
    border-radius: var(--ot-radius-sm);
    color-scheme: dark;
    outline: none;
}
.in-page .kcp-video video { border-radius: var(--ot-radius); }

.kcp-audio {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    width: min(520px, 100%);
    padding: 32px 24px;
    border-radius: var(--ot-radius-lg);
    border: 1px solid var(--ot-line);
    background: var(--ot-surface);
}
.kcp-audio-name { font-size: 15px; font-weight: 620; text-align: center; overflow-wrap: anywhere; }
.kcp-audio audio { width: 100%; color-scheme: dark; }

/* pdf */
.kcp-pdf { width: 100%; height: 100%; border: 0; border-radius: var(--ot-radius-sm); background: #2a2a2e; }

/* text, code, markdown, csv */
.kcp-doc {
    width: 100%;
    max-width: 1040px;
    height: 100%;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--ot-line);
    border-radius: var(--ot-radius);
    background: var(--ot-surface);
    overflow: hidden;
}
.kcp-doc-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
.kcp-cut {
    flex: 0 0 auto;
    padding: 6px 14px;
    border-top: 1px solid var(--ot-line);
    font-size: 12px;
    color: var(--ot-muted);
}
.kcp-code {
    margin: 0;
    padding: 14px 18px;
    font-family: var(--ot-mono);
    font-size: 12.5px;
    line-height: 1.6;
    white-space: pre;
    tab-size: 4;
    color: var(--ot-text);
}
.kcp-code :deep(.hljs-keyword), .kcp-code :deep(.hljs-selector-tag), .kcp-code :deep(.hljs-built_in) { color: #c792ea; }
.kcp-code :deep(.hljs-string), .kcp-code :deep(.hljs-regexp), .kcp-code :deep(.hljs-attr-value) { color: #9fd67a; }
.kcp-code :deep(.hljs-number), .kcp-code :deep(.hljs-literal), .kcp-code :deep(.hljs-symbol) { color: #f6b26b; }
.kcp-code :deep(.hljs-comment), .kcp-code :deep(.hljs-quote) { color: var(--ot-disabled); font-style: italic; }
.kcp-code :deep(.hljs-title), .kcp-code :deep(.hljs-section), .kcp-code :deep(.hljs-function) { color: #82b8f5; }
.kcp-code :deep(.hljs-type), .kcp-code :deep(.hljs-class), .kcp-code :deep(.hljs-params) { color: #e5c07b; }
.kcp-code :deep(.hljs-attr), .kcp-code :deep(.hljs-attribute), .kcp-code :deep(.hljs-property), .kcp-code :deep(.hljs-variable) { color: #7fd3e6; }
.kcp-code :deep(.hljs-name), .kcp-code :deep(.hljs-tag) { color: #ef8f8f; }
.kcp-code :deep(.hljs-meta) { color: var(--ot-muted); }

.kcp-md { max-width: 780px; margin: 0 auto; padding: 24px 32px 40px; font-size: 14.5px; line-height: 1.7; color: var(--ot-text); }
.kcp-md :deep(h1), .kcp-md :deep(h2), .kcp-md :deep(h3), .kcp-md :deep(h4) { margin: 1.4em 0 0.5em; line-height: 1.3; font-weight: 650; }
.kcp-md :deep(h1) { font-size: 1.7em; margin-top: 0.4em; }
.kcp-md :deep(h2) { font-size: 1.35em; padding-bottom: 0.3em; border-bottom: 1px solid var(--ot-line); }
.kcp-md :deep(h3) { font-size: 1.12em; }
.kcp-md :deep(p), .kcp-md :deep(ul), .kcp-md :deep(ol), .kcp-md :deep(blockquote), .kcp-md :deep(pre), .kcp-md :deep(table) { margin: 0 0 1em; }
.kcp-md :deep(ul), .kcp-md :deep(ol) { padding-left: 1.5em; }
.kcp-md :deep(li) { margin: 0.2em 0; }
.kcp-md :deep(a) { color: var(--ot-accent); text-decoration: underline; text-underline-offset: 2px; }
.kcp-md :deep(code) { font-family: var(--ot-mono); font-size: 0.88em; padding: 1px 5px; border-radius: 4px; background: rgba(255, 255, 255, 0.06); }
.kcp-md :deep(pre) { padding: 12px 14px; border-radius: var(--ot-radius-sm); background: rgba(0, 0, 0, 0.35); overflow-x: auto; }
.kcp-md :deep(pre code) { padding: 0; background: none; font-size: 12.5px; }
.kcp-md :deep(blockquote) { padding: 2px 14px; border-left: 3px solid var(--ot-line-strong); color: var(--ot-text-2); }
.kcp-md :deep(hr) { border: 0; border-top: 1px solid var(--ot-line); margin: 1.6em 0; }
.kcp-md :deep(img) { max-width: 100%; }
.kcp-md :deep(table) { border-collapse: collapse; }
.kcp-md :deep(th), .kcp-md :deep(td) { padding: 5px 10px; border: 1px solid var(--ot-line); }

.kcp-table { border-collapse: separate; border-spacing: 0; font-size: 12.5px; min-width: 100%; }
.kcp-table th, .kcp-table td {
    max-width: 320px;
    padding: 6px 12px;
    border-bottom: 1px solid rgba(146, 196, 130, 0.08);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
}
.kcp-table th {
    position: sticky;
    top: 0;
    background: var(--ot-surface-2);
    color: var(--ot-text-2);
    font-weight: 650;
    border-bottom-color: var(--ot-line);
}
.kcp-table tbody tr:hover td { background: rgba(255, 255, 255, 0.025); }
.kcp-table .num { text-align: right; font-variant-numeric: tabular-nums; }

/* nothing to show */
.kcp-none {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    max-width: 440px;
    padding: 32px 24px;
    text-align: center;
}
.kcp-none-name { margin-top: 6px; font-size: 16px; font-weight: 620; overflow-wrap: anywhere; }
.kcp-none-meta { font-size: 13px; color: var(--ot-muted); }
.kcp-problem { margin: 2px 0 0; font-size: 13px; color: var(--ot-warning); }
.kcp-none-download { margin-top: 12px; height: var(--ot-control-lg); padding: 0 18px; }

@media (max-width: 720px) {
    .kcp-md { padding: 18px 18px 32px; }
    .kcp-code { padding: 12px 14px; font-size: 12px; }
}
</style>
