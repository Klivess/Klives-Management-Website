<template>
    <div class="kmail">
        <!-- ── Left rail: folders + mailboxes ── -->
        <aside class="kmail-rail">
            <div class="kmail-brand">
                <span class="kmail-brand-mark">@</span>
                <div>
                    <div class="kmail-brand-title">KliveMail</div>
                    <div class="kmail-brand-sub">{{ stats.total }} messages · {{ stats.unread }} unread</div>
                </div>
            </div>

            <nav class="kmail-folders">
                <button class="kmail-folder" :class="{ active: isFolder('all') }" @click="selectFolder('all')">
                    <span class="kmail-folder-ic">▤</span>
                    <span class="kmail-folder-label">All mail</span>
                    <span class="kmail-folder-count">{{ stats.total }}</span>
                </button>
                <button class="kmail-folder" :class="{ active: isFolder('unread') }" @click="selectFolder('unread')">
                    <span class="kmail-folder-ic">●</span>
                    <span class="kmail-folder-label">Unread</span>
                    <span v-if="stats.unread" class="kmail-folder-count accent">{{ stats.unread }}</span>
                </button>
                <button class="kmail-folder" :class="{ active: isFolder('trash') }" @click="selectFolder('trash')">
                    <span class="kmail-folder-ic">🗑</span>
                    <span class="kmail-folder-label">Trash</span>
                    <span v-if="stats.trash" class="kmail-folder-count">{{ stats.trash }}</span>
                </button>
            </nav>

            <div class="kmail-rail-head">
                <span>Addresses</span>
                <button class="kmail-mini" title="Add address" @click="showCreate = !showCreate">＋</button>
            </div>

            <div v-if="showCreate" class="kmail-create">
                <input
                    v-model="newAddress"
                    class="kmail-input"
                    placeholder="name (→ name@klive.dev)"
                    @keyup.enter="createMailbox"
                />
                <button class="kmail-btn" @click="createMailbox">Add</button>
            </div>

            <ul class="kmail-mailboxes">
                <li v-for="mb in mailboxes" :key="mb.Address">
                    <button
                        class="kmail-folder"
                        :class="{ active: isFolder('mailbox', mb.Address) }"
                        @click="selectFolder('mailbox', mb.Address)"
                    >
                        <span class="kmail-folder-ic">✉</span>
                        <span class="kmail-folder-label" :title="mb.Address">{{ localPart(mb.Address) }}</span>
                        <span v-if="mb.Unread" class="kmail-folder-count accent">{{ mb.Unread }}</span>
                        <span class="kmail-folder-del" title="Remove address" @click.stop="deleteMailbox(mb.Address)">✕</span>
                    </button>
                </li>
                <li v-if="mailboxes.length === 0" class="kmail-empty-rail">
                    No pinned addresses. Mail to <em>any</em> @klive.dev still arrives in All mail.
                </li>
            </ul>
        </aside>

        <!-- ── Middle: message list ── -->
        <section class="kmail-list">
            <div class="kmail-list-head">
                <div class="kmail-search">
                    <input
                        v-model="searchQuery"
                        class="kmail-input"
                        placeholder="Search mail…"
                        @keyup.enter="runSearch"
                    />
                    <button v-if="searchMode" class="kmail-mini" title="Clear search" @click="clearSearch">✕</button>
                    <button v-else class="kmail-mini" title="Search" @click="runSearch">⌕</button>
                </div>
                <div class="kmail-list-title">
                    {{ searchMode ? `Search: “${activeSearch}”` : folderTitle }}
                    <span class="kmail-list-sub">{{ messages.length }}{{ messages.length === pageSize ? '+' : '' }}</span>
                </div>
            </div>

            <div class="kmail-list-body">
                <button
                    v-for="m in messages"
                    :key="m.Id"
                    class="kmail-row"
                    :class="{ unread: !m.IsRead, selected: selected && selected.Id === m.Id }"
                    @click="openMessage(m.Id)"
                >
                    <span class="kmail-dot" :class="{ on: !m.IsRead }"></span>
                    <div class="kmail-row-main">
                        <div class="kmail-row-top">
                            <span class="kmail-from">{{ m.FromName || m.FromAddress }}</span>
                            <span class="kmail-time">{{ shortDate(m.ReceivedUtc) }}</span>
                        </div>
                        <div class="kmail-subject">
                            {{ m.Subject || '(no subject)' }}
                            <span v-if="m.HasAttachments" class="kmail-clip" title="Has attachments">📎</span>
                        </div>
                        <div class="kmail-snippet">{{ m.Snippet }}</div>
                        <div class="kmail-to">to {{ localPart(m.ToAddress) }}@</div>
                    </div>
                </button>

                <div v-if="!loading && messages.length === 0" class="kmail-empty">
                    {{ searchMode ? 'No matches.' : 'No messages here yet.' }}
                </div>

                <button
                    v-if="messages.length >= pageSize"
                    class="kmail-loadmore"
                    @click="loadMore"
                >
                    Load more
                </button>
            </div>
        </section>

        <!-- ── Right: reader ── -->
        <section class="kmail-reader">
            <div v-if="!selected" class="kmail-reader-empty">
                <div class="kmail-reader-empty-mark">@</div>
                <p>Select a message to read it.</p>
            </div>

            <article v-else class="kmail-message">
                <header class="kmail-msg-head">
                    <h1 class="kmail-msg-subject">{{ selected.Subject || '(no subject)' }}</h1>
                    <div class="kmail-msg-meta">
                        <div>
                            <strong>{{ selected.FromName || selected.FromAddress }}</strong>
                            <span v-if="selected.FromName" class="kmail-msg-addr">&lt;{{ selected.FromAddress }}&gt;</span>
                        </div>
                        <div class="kmail-msg-when">{{ longDate(selected.DateUtc || selected.ReceivedUtc) }}</div>
                    </div>
                    <div class="kmail-msg-to">to <strong>{{ selected.ToAddress }}</strong></div>

                    <div class="kmail-msg-actions">
                        <button class="kmail-btn ghost" @click="markUnread(selected.Id)">Mark unread</button>
                        <button class="kmail-btn danger" @click="deleteMessage(selected.Id)">Delete</button>
                        <label v-if="selected.BodyHtml" class="kmail-img-toggle">
                            <input type="checkbox" v-model="loadImages" /> Load remote images
                        </label>
                    </div>
                </header>

                <div v-if="selected.Attachments && selected.Attachments.length" class="kmail-attachments">
                    <button
                        v-for="a in selected.Attachments"
                        :key="a.Id"
                        class="kmail-attachment"
                        @click="downloadAttachment(a)"
                        :title="`Download ${a.FileName}`"
                    >
                        📎 {{ a.FileName }} <span class="kmail-att-size">{{ humanSize(a.SizeBytes) }}</span>
                    </button>
                </div>

                <div class="kmail-msg-body">
                    <iframe
                        v-if="selected.BodyHtml"
                        class="kmail-iframe"
                        sandbox="allow-popups allow-popups-to-escape-sandbox"
                        :srcdoc="renderedHtml"
                    ></iframe>
                    <pre v-else class="kmail-plain">{{ selected.BodyText || '(empty message)' }}</pre>
                </div>

                <footer v-if="threadOthers.length" class="kmail-thread">
                    <div class="kmail-thread-head">Conversation ({{ selected.Thread.length }})</div>
                    <button
                        v-for="t in threadOthers"
                        :key="t.Id"
                        class="kmail-thread-row"
                        @click="openMessage(t.Id)"
                    >
                        <span class="kmail-dot" :class="{ on: !t.IsRead }"></span>
                        <span class="kmail-thread-from">{{ t.FromName || t.FromAddress }}</span>
                        <span class="kmail-thread-snippet">{{ t.Snippet }}</span>
                        <span class="kmail-time">{{ shortDate(t.ReceivedUtc) }}</span>
                    </button>
                </footer>
            </article>
        </section>
    </div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });

import { computed, onMounted, onUnmounted, ref } from 'vue';
import Swal from 'sweetalert2';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '../../scripts/APIInterface';

const POLL_MS = 10000;
const pageSize = ref(50);

const stats = ref({ total: 0, unread: 0, trash: 0 });
const mailboxes = ref([]);
const messages = ref([]);
const selected = ref(null);
const loading = ref(false);

const folder = ref({ type: 'all', address: null });
const showCreate = ref(false);
const newAddress = ref('');

const searchQuery = ref('');
const activeSearch = ref('');
const searchMode = ref(false);

const loadImages = ref(false);

let pollTimer = null;

// ── derived ──
const folderTitle = computed(() => {
    if (folder.value.type === 'all') return 'All mail';
    if (folder.value.type === 'unread') return 'Unread';
    if (folder.value.type === 'trash') return 'Trash';
    return folder.value.address || 'Mailbox';
});

const threadOthers = computed(() => {
    if (!selected.value?.Thread) return [];
    return selected.value.Thread.filter(t => t.Id !== selected.value.Id);
});

const renderedHtml = computed(() => {
    const html = selected.value?.BodyHtml || '';
    const csp = loadImages.value
        ? "default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data: https:;"
        : "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:;";
    return `<!doctype html><html><head><meta charset="utf-8">`
        + `<meta http-equiv="Content-Security-Policy" content="${csp}">`
        + `<base target="_blank">`
        + `<style>html,body{margin:0}body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#e8e8e8;background:#141414;padding:14px;word-wrap:break-word}a{color:#62ce47}img{max-width:100%}</style>`
        + `</head><body>${html}</body></html>`;
});

function isFolder(type, address = null) {
    return folder.value.type === type && (type !== 'mailbox' || folder.value.address === address);
}

// ── loaders ──
async function loadStats() {
    try {
        const r = await RequestGETFromKliveAPI('/klivemail/mailboxes', false, false);
        if (r && r.ok) {
            const data = await r.json();
            stats.value = { total: data.all?.total ?? 0, unread: data.all?.unread ?? 0, trash: data.trash ?? 0 };
            mailboxes.value = Array.isArray(data.mailboxes) ? data.mailboxes : [];
        }
    } catch (e) { /* ignore */ }
}

async function loadMessages(replace = true) {
    if (searchMode.value) return loadSearch();
    loading.value = true;
    try {
        const params = new URLSearchParams({ page: '1', pageSize: String(pageSize.value) });
        if (folder.value.type === 'unread') params.set('unread', '1');
        else if (folder.value.type === 'trash') params.set('trash', '1');
        else if (folder.value.type === 'mailbox') params.set('mailbox', folder.value.address);
        const r = await RequestGETFromKliveAPI(`/klivemail/messages?${params.toString()}`, false, false);
        if (r && r.ok) {
            const data = await r.json();
            messages.value = Array.isArray(data) ? data : [];
        }
    } catch (e) { /* ignore */ }
    finally { loading.value = false; }
}

async function loadSearch() {
    loading.value = true;
    try {
        const r = await RequestGETFromKliveAPI(
            `/klivemail/search?q=${encodeURIComponent(activeSearch.value)}&pageSize=${pageSize.value}`, false, false);
        if (r && r.ok) {
            const data = await r.json();
            messages.value = Array.isArray(data) ? data : [];
        }
    } catch (e) { /* ignore */ }
    finally { loading.value = false; }
}

async function openMessage(id) {
    try {
        const r = await RequestGETFromKliveAPI(`/klivemail/messages/detail?id=${encodeURIComponent(id)}`, false, false);
        if (r && r.ok) {
            selected.value = await r.json();
            loadImages.value = false;
            // reflect the now-read state locally
            const row = messages.value.find(m => m.Id === id);
            if (row) row.IsRead = true;
            loadStats();
        }
    } catch (e) { /* ignore */ }
}

// ── actions ──
function selectFolder(type, address = null) {
    folder.value = { type, address };
    searchMode.value = false;
    activeSearch.value = '';
    searchQuery.value = '';
    pageSize.value = 50;
    loadMessages();
}

function runSearch() {
    const q = searchQuery.value.trim();
    if (!q) { clearSearch(); return; }
    activeSearch.value = q;
    searchMode.value = true;
    pageSize.value = 50;
    loadSearch();
}

function clearSearch() {
    searchMode.value = false;
    activeSearch.value = '';
    searchQuery.value = '';
    loadMessages();
}

function loadMore() {
    pageSize.value += 50;
    loadMessages();
}

async function createMailbox() {
    const a = newAddress.value.trim();
    if (!a) return;
    await RequestPOSTFromKliveAPI(`/klivemail/mailboxes/create?address=${encodeURIComponent(a)}`, '', false);
    newAddress.value = '';
    showCreate.value = false;
    loadStats();
}

async function deleteMailbox(address) {
    const res = await Swal.fire({
        icon: 'warning', title: 'Remove address?',
        text: `Stop pinning ${address}? (Existing mail is kept and still shows under All mail.)`,
        showCancelButton: true, confirmButtonText: 'Remove', confirmButtonColor: '#b04848',
        background: '#161516', color: '#ffffff',
    });
    if (!res.isConfirmed) return;
    await RequestPOSTFromKliveAPI(`/klivemail/mailboxes/delete?address=${encodeURIComponent(address)}`, '', false);
    if (folder.value.type === 'mailbox' && folder.value.address === address) selectFolder('all');
    else loadStats();
}

async function markUnread(id) {
    await RequestPOSTFromKliveAPI(`/klivemail/messages/mark-unread?id=${encodeURIComponent(id)}`, '', false);
    const row = messages.value.find(m => m.Id === id);
    if (row) row.IsRead = false;
    if (selected.value && selected.value.Id === id) selected.value.IsRead = false;
    loadStats();
}

async function deleteMessage(id) {
    await RequestPOSTFromKliveAPI(`/klivemail/messages/delete?id=${encodeURIComponent(id)}`, '', false);
    messages.value = messages.value.filter(m => m.Id !== id);
    if (selected.value && selected.value.Id === id) selected.value = null;
    loadStats();
}

async function downloadAttachment(att) {
    try {
        const r = await RequestGETFromKliveAPI(`/klivemail/attachments/download?id=${encodeURIComponent(att.Id)}`, false, false);
        if (!r || !r.ok) return;
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = att.FileName || 'attachment';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (e) { /* ignore */ }
}

// ── formatting ──
function localPart(addr) {
    if (!addr) return '';
    const i = addr.indexOf('@');
    return i > 0 ? addr.slice(0, i) : addr;
}
function shortDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString())
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function longDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
function humanSize(bytes) {
    if (!bytes) return '';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0, n = bytes;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

// ── lifecycle ──
onMounted(() => {
    loadStats();
    loadMessages();
    pollTimer = window.setInterval(() => {
        loadStats();
        if (!searchMode.value) loadMessages();
    }, POLL_MS);
});
onUnmounted(() => {
    if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped lang="scss">
@use '~/assets/scss/colors' as c;

.kmail {
    display: grid;
    grid-template-columns: 240px 360px 1fr;
    height: 100vh;
    background: c.$main;
    color: c.$gray;
    font-size: 13px;
}

/* rail */
.kmail-rail {
    background: c.$mainDarker;
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
}
.kmail-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.kmail-brand-mark {
    width: 34px; height: 34px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(c.$secondary, 0.16);
    color: c.$teritary;
    border-radius: 8px;
    font-size: 20px; font-weight: 700;
}
.kmail-brand-title { color: c.$white; font-weight: 600; letter-spacing: 0.5px; }
.kmail-brand-sub { font-size: 11px; color: rgba(150, 150, 150, 0.7); }

.kmail-folders { padding: 8px 6px; display: flex; flex-direction: column; gap: 2px; }
.kmail-folder {
    display: flex; align-items: center; gap: 10px;
    width: 100%;
    background: transparent; border: 0;
    color: c.$gray;
    padding: 8px 10px; border-radius: 6px;
    cursor: pointer; font-size: 13px; text-align: left;
    font-family: inherit;
    transition: background 120ms, color 120ms;
}
.kmail-folder:hover { background: rgba(255, 255, 255, 0.04); color: c.$white; }
.kmail-folder.active { background: rgba(c.$secondary, 0.14); color: c.$teritary; }
.kmail-folder-ic { width: 18px; text-align: center; opacity: 0.85; }
.kmail-folder-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kmail-folder-count { font-size: 11px; color: rgba(150, 150, 150, 0.7); }
.kmail-folder-count.accent { color: c.$teritary; font-weight: 600; }
.kmail-folder-del { opacity: 0; font-size: 11px; color: rgba(255,255,255,0.4); padding-left: 4px; }
.kmail-folder:hover .kmail-folder-del { opacity: 0.8; }
.kmail-folder-del:hover { color: #ff9a9a; }

.kmail-rail-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px 4px;
    font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px;
    color: rgba(150, 150, 150, 0.55);
}
.kmail-mailboxes { list-style: none; margin: 0; padding: 0 6px 12px; }
.kmail-empty-rail { font-size: 11px; color: rgba(150,150,150,0.5); padding: 6px 10px; line-height: 1.5; }

.kmail-create { display: flex; gap: 6px; padding: 4px 10px 8px; }

/* list */
.kmail-list {
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    display: flex; flex-direction: column;
    overflow: hidden;
    background: rgba(0,0,0,0.12);
}
.kmail-list-head { padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
.kmail-search { display: flex; gap: 6px; margin-bottom: 10px; }
.kmail-list-title { color: c.$white; font-weight: 600; display: flex; align-items: baseline; gap: 8px; }
.kmail-list-sub { font-size: 11px; color: rgba(150,150,150,0.6); font-weight: 400; }

.kmail-list-body { flex: 1; overflow-y: auto; }
.kmail-row {
    display: flex; gap: 8px;
    width: 100%; text-align: left;
    background: transparent; border: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    padding: 10px 12px; cursor: pointer; color: c.$gray;
    font-family: inherit;
    transition: background 120ms;
}
.kmail-row:hover { background: rgba(255, 255, 255, 0.03); }
.kmail-row.selected { background: rgba(c.$secondary, 0.10); }
.kmail-row.unread .kmail-from, .kmail-row.unread .kmail-subject { color: c.$white; font-weight: 600; }
.kmail-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex: 0 0 auto; background: transparent; }
.kmail-dot.on { background: c.$teritary; }
.kmail-row-main { flex: 1; min-width: 0; }
.kmail-row-top { display: flex; justify-content: space-between; gap: 8px; }
.kmail-from { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kmail-time { font-size: 11px; color: rgba(150,150,150,0.6); flex: 0 0 auto; }
.kmail-subject { color: c.$gray; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
.kmail-clip { font-size: 11px; }
.kmail-snippet { font-size: 11px; color: rgba(150,150,150,0.55); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }
.kmail-to { font-size: 10px; color: rgba(c.$secondary, 0.7); margin-top: 3px; }
.kmail-empty { padding: 30px 16px; text-align: center; color: rgba(150,150,150,0.5); }
.kmail-loadmore {
    width: calc(100% - 24px); margin: 12px; padding: 8px;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
    color: c.$gray; border-radius: 6px; cursor: pointer; font-family: inherit;
}
.kmail-loadmore:hover { background: rgba(255,255,255,0.06); color: c.$white; }

/* reader */
.kmail-reader { overflow-y: auto; }
.kmail-reader-empty {
    height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: rgba(150,150,150,0.4); gap: 12px;
}
.kmail-reader-empty-mark { font-size: 56px; opacity: 0.25; }
.kmail-message { padding: 22px 26px; max-width: 900px; }
.kmail-msg-subject { color: c.$white; font-size: 20px; margin: 0 0 14px; font-weight: 600; }
.kmail-msg-meta { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.kmail-msg-meta strong { color: c.$white; }
.kmail-msg-addr { color: rgba(150,150,150,0.7); font-size: 12px; margin-left: 6px; }
.kmail-msg-when { font-size: 12px; color: rgba(150,150,150,0.7); flex: 0 0 auto; }
.kmail-msg-to { font-size: 12px; color: rgba(150,150,150,0.7); margin-top: 4px; }
.kmail-msg-to strong { color: c.$teritary; }
.kmail-msg-actions { display: flex; align-items: center; gap: 8px; margin: 14px 0; flex-wrap: wrap; }
.kmail-img-toggle { font-size: 11px; color: rgba(150,150,150,0.7); display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }

.kmail-attachments { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.kmail-attachment {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    color: c.$gray; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;
    font-family: inherit;
}
.kmail-attachment:hover { background: rgba(c.$secondary, 0.12); color: c.$white; border-color: rgba(c.$secondary, 0.4); }
.kmail-att-size { color: rgba(150,150,150,0.6); font-size: 11px; }

.kmail-msg-body { border-top: 1px solid rgba(255,255,255,0.06); padding-top: 16px; }
.kmail-iframe { width: 100%; height: 62vh; border: 0; border-radius: 6px; background: #141414; }
.kmail-plain { white-space: pre-wrap; word-wrap: break-word; font-family: ui-monospace, Consolas, monospace; color: #d6d6d6; line-height: 1.5; margin: 0; }

.kmail-thread { margin-top: 22px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 12px; }
.kmail-thread-head { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: rgba(150,150,150,0.55); margin-bottom: 8px; }
.kmail-thread-row {
    display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
    background: transparent; border: 0; border-bottom: 1px solid rgba(255,255,255,0.04);
    padding: 8px 4px; cursor: pointer; color: c.$gray; font-family: inherit;
}
.kmail-thread-row:hover { background: rgba(255,255,255,0.03); }
.kmail-thread-from { color: c.$white; flex: 0 0 auto; }
.kmail-thread-snippet { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgba(150,150,150,0.7); }

/* shared inputs/buttons */
.kmail-input {
    flex: 1; min-width: 0;
    background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);
    color: c.$white; border-radius: 6px; padding: 7px 10px; font-size: 12px; font-family: inherit;
}
.kmail-input:focus { outline: none; border-color: rgba(c.$secondary, 0.6); }
.kmail-mini {
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
    color: c.$gray; width: 30px; border-radius: 6px; cursor: pointer; font-size: 14px; flex: 0 0 auto;
}
.kmail-mini:hover { background: rgba(c.$secondary, 0.14); color: c.$teritary; }
.kmail-btn {
    background: rgba(c.$secondary, 0.16); border: 1px solid rgba(c.$secondary, 0.4);
    color: c.$teritary; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;
    font-family: inherit; flex: 0 0 auto;
}
.kmail-btn:hover { background: rgba(c.$secondary, 0.26); }
.kmail-btn.ghost { background: transparent; border-color: rgba(255,255,255,0.12); color: c.$gray; }
.kmail-btn.ghost:hover { color: c.$white; background: rgba(255,255,255,0.05); }
.kmail-btn.danger { background: transparent; border-color: rgba(176,72,72,0.4); color: #ff9a9a; }
.kmail-btn.danger:hover { background: rgba(176,72,72,0.14); }

@media (max-width: 1100px) {
    .kmail { grid-template-columns: 200px 300px 1fr; }
}
</style>
