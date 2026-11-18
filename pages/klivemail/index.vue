<template>
  <div class="kml" :data-pane="detail ? 'reader' : 'list'" :data-rail="railOpen || undefined" data-testid="kml-root">
    <MailRail
      :summary="summary"
      :view="view"
      :health="health"
      :accounts="accounts"
      :prefs="prefs"
      :now="now"
      :can-manage="allowed.manage"
      :codes-count="freshCodes"
      @folder="id => { railOpen = false; mail.goFolder(id); }"
      @mailbox="address => { railOpen = false; mail.goMailbox(address); }"
      @pref="key => (prefs[key] = !prefs[key])"
      @create="(address, label, done) => mail.createMailbox(address, label).then(done)"
      @unpin="address => (unpinning = address)"
    />

    <!-- ── the list ── -->
    <section class="kml-list" aria-label="Messages">
      <header class="kml-list__head">
        <div class="kml-list__title-row">
          <button class="kml-iconbtn kml-list__menu" title="Folders and addresses" aria-label="Folders and addresses" @click="railOpen = !railOpen"><MailIcon name="inbox" /></button>
          <div class="kml-list__title">
            <h2 data-testid="kml-list-title">{{ title }}</h2>
            <button v-if="view.mailbox" class="kml-list__addr" :title="`Copy ${view.mailbox}`" data-testid="kml-copy-address" @click="mail.copy(view.mailbox!, `${view.mailbox} copied`)">
              <span>{{ view.mailbox }}</span><MailIcon name="copy" />
            </button>
            <span v-else class="kml-list__sub kml-num">{{ subtitle }}</span>
          </div>
          <span class="kml-spacer"></span>
          <button class="kml-live" :data-tone="liveTone" :title="liveTitle" :aria-label="liveTitle" data-testid="kml-live" @click="mail.refresh()">
            <span class="kml-live__dot"></span><span class="kml-live__word">{{ liveWord }}</span>
          </button>
        </div>

        <label class="kml-search" :data-active="!!query || undefined">
          <MailIcon name="search" />
          <input
            ref="searchInput"
            v-model="searchText"
            class="kml-bare"
            :placeholder="view.mailbox && !prefs.searchEverywhere ? `Search ${localPart(view.mailbox)}…` : 'Search all mail…'"
            aria-label="Search mail"
            aria-keyshortcuts="/"
            spellcheck="false"
            data-testid="kml-search"
            @keydown.enter.prevent="mail.runSearch(searchText)"
            @keydown.esc.prevent="clearSearch"
            @keydown.down.prevent="focusList"
          />
          <button v-if="view.mailbox" class="kml-search__scope" :aria-pressed="!prefs.searchEverywhere" :title="prefs.searchEverywhere ? 'Searching every address: click to search only this one' : 'Searching this address only: click to search them all'" @click="toggleScope">
            {{ prefs.searchEverywhere ? 'all' : 'here' }}
          </button>
          <button v-if="searchText" class="kml-iconbtn kml-iconbtn--sm" title="Clear (Esc)" aria-label="Clear search" @click="clearSearch"><MailIcon name="x" /></button>
          <kbd v-else>/</kbd>
        </label>

        <div class="kml-list__tools">
          <div v-if="!query" class="kml-seg" role="group" aria-label="Show">
            <button v-for="f in quickFilters" :key="f.id" class="kml-seg__opt" :aria-pressed="view.folder === f.id" :data-testid="`filter-${f.id}`" @click="mail.setView({ folder: f.id })">
              {{ f.label }}
            </button>
          </div>
          <span v-else class="kml-dim" data-testid="kml-search-note">{{ rows.length >= PAGE_SIZE ? `${PAGE_SIZE}+` : rows.length }} match{{ rows.length === 1 ? '' : 'es' }} for “{{ query }}”</span>
          <span class="kml-spacer"></span>
          <button
            v-if="allowed.act && unreadHere > 0 && view.folder !== 'trash' && !query"
            class="kml-btn kml-btn--xs kml-btn--ghost"
            :title="view.mailbox ? `Mark every unread message to ${view.mailbox} read` : 'Mark every unread message read'"
            data-testid="kml-mark-all"
            @click="confirmAll = true"
          >
            <MailIcon name="check-all" />Mark {{ fmtInt(unreadHere) }} read
          </button>
        </div>

        <div v-if="confirmAll" class="kml-confirm" role="alertdialog" aria-label="Mark all read" data-testid="kml-confirm-all">
          <span>Mark <b>{{ fmtInt(unreadHere) }}</b> unread message{{ unreadHere === 1 ? '' : 's' }}{{ view.mailbox ? ` to ${view.mailbox}` : '' }} read?</span>
          <button class="kml-btn kml-btn--xs kml-btn--ghost" @click="confirmAll = false">Cancel</button>
          <button class="kml-btn kml-btn--xs kml-btn--primary" data-testid="kml-confirm-all-yes" @click="confirmAll = false; mail.markAllRead()">Mark read</button>
        </div>
      </header>

      <div v-if="checked.length" class="kml-bulk" role="toolbar" aria-label="Selected messages" data-testid="kml-bulk">
        <button class="kml-iconbtn kml-iconbtn--sm" title="Clear the selection (Esc)" aria-label="Clear the selection" @click="checked = []"><MailIcon name="x" /></button>
        <b class="kml-num">{{ checked.length }}</b> selected
        <button class="kml-link" @click="selectAll">select all {{ rows.length }}</button>
        <span class="kml-spacer"></span>
        <template v-if="view.folder === 'trash'">
          <button v-if="allowed.del" class="kml-btn kml-btn--xs" data-testid="bulk-restore" @click="act('restore')"><MailIcon name="restore" />Restore</button>
        </template>
        <template v-else>
          <button v-if="allowed.act" class="kml-btn kml-btn--xs" data-testid="bulk-read" @click="act('read')"><MailIcon name="mail-open" />Read</button>
          <button v-if="allowed.act" class="kml-btn kml-btn--xs" data-testid="bulk-unread" @click="act('unread')"><MailIcon name="mail" />Unread</button>
          <button v-if="allowed.del" class="kml-btn kml-btn--xs kml-btn--danger" data-testid="bulk-trash" @click="act('trash')"><MailIcon name="trash" />Trash</button>
        </template>
      </div>

      <div ref="listBody" class="kml-list__body" role="listbox" aria-label="Messages" tabindex="-1" data-testid="kml-list" @scroll.passive="onScroll">
        <div v-if="!allowed.read" class="kml-empty"><MailIcon name="lock" />Reading mail is not part of your access.<br />Counts still show on the left.</div>
        <template v-else>
          <template v-for="item in items" :key="item.key">
            <div v-if="item.kind === 'group'" class="kml-day">{{ item.label }}</div>
            <MailRowView
              v-else
              :row="item.row"
              :selected="item.row.id === selectedId"
              :checked="checkedSet.has(item.row.id)"
              :fresh="freshIds.has(item.row.id)"
              :pending="!!pending[item.row.id]"
              :show-mailbox="!view.mailbox"
              :in-trash="view.folder === 'trash'"
              :can-act="allowed.act"
              :can-delete="allowed.del"
              :now="now"
              @open="openRow(item.row.id)"
              @check="range => toggleCheck(item.row.id, range)"
              @copy="code => mail.copyCode(code)"
              @read="read => mail.setRead([item.row.id], read)"
              @trash="mail.trash([item.row.id])"
              @restore="mail.restore([item.row.id])"
            />
          </template>

          <div v-if="listLoading && !rows.length" class="kml-skeleton" aria-hidden="true">
            <div v-for="i in 8" :key="i" class="kml-skeleton__row"><span></span><span></span></div>
          </div>
          <div v-else-if="listError && !rows.length" class="kml-empty"><MailIcon name="alert" />{{ listError }}<button class="kml-btn kml-btn--sm" @click="mail.loadList()">Try again</button></div>
          <div v-else-if="!rows.length" class="kml-empty" data-testid="kml-empty"><MailIcon :name="query ? 'search' : 'inbox'" />{{ emptyText }}</div>

          <button v-if="hasMore" class="kml-more" :disabled="listLoading" data-testid="kml-more" @click="mail.loadMore()">
            <MailIcon v-if="listLoading" name="refresh" class="kml-spin" />{{ listLoading ? 'Loading…' : `Load ${PAGE_SIZE} older` }}
          </button>
          <p v-else-if="rows.length > PAGE_SIZE" class="kml-end kml-dim">That is everything: {{ fmtInt(rows.length) }} messages.</p>
        </template>
      </div>
    </section>

    <MailReader
      :detail="detail"
      :loading="detailLoading"
      :error="detailError"
      :paper="prefs.paper"
      :now="now"
      :accounts="detail ? (accounts.get(detail.to) ?? []) : []"
      :position="position"
      :recent-codes="features.codes === false ? null : recentCodes"
      :summary="summary"
      :can-act="allowed.act"
      :can-delete="allowed.del"
      @close="mail.open(null)"
      @step="d => mail.step(d)"
      @read="read => detail && mail.setRead([detail.id], read)"
      @trash="detail && mail.trash([detail.id])"
      @restore="detail && mail.restore([detail.id])"
      @copy="code => mail.copyCode(code)"
      @copy-text="(text, label) => mail.copy(text, label)"
      @download="a => mail.downloadAttachment(a.id, a.fileName)"
      @paper="mode => (prefs.paper = mode)"
      @open="id => openRow(id)"
      @mailbox="address => mail.goMailbox(address)"
    />

    <MailPalette :open="paletteOpen" :commands="commands" :on-search="paletteSearch" @close="paletteOpen = false" />

    <Teleport to="body">
      <div v-if="unpinning" class="kml-layer kml-scrim" @mousedown.self="unpinning = null">
        <div class="kml-layer kml-dialog" role="dialog" aria-modal="true" aria-label="Unpin address" data-testid="kml-unpin-dialog" @keydown.esc="unpinning = null">
          <h3>Unpin {{ unpinning }}?</h3>
          <p>Its mail stays and still arrives: it moves under “Not pinned” and All mail. Pin it again any time.</p>
          <div class="kml-dialog__actions">
            <button class="kml-btn kml-btn--ghost" @click="unpinning = null">Keep it</button>
            <button class="kml-btn kml-btn--primary" data-testid="kml-unpin-yes" @click="mail.unpinMailbox(unpinning!); unpinning = null">Unpin</button>
          </div>
        </div>
      </div>

      <div class="kml-layer kml-toasts" aria-live="polite">
        <div v-for="t in toasts" :key="t.id" class="kml-toast" :data-tone="t.tone" data-testid="kml-toast">
          <span>{{ t.text }}</span>
          <button v-if="t.action" class="kml-toast__action" @click="t.action.run(); mail.dismissToast(t.id)">{{ t.action.label }}</button>
          <button class="kml-toast__close" aria-label="Dismiss" @click="mail.dismissToast(t.id)">×</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MailIcon from '~/components/Mail/Icon.vue';
import MailPalette from '~/components/Mail/Palette.vue';
import MailRail from '~/components/Mail/Rail.vue';
import MailReader from '~/components/Mail/Reader.vue';
import MailRowView from '~/components/Mail/Row.vue';
import { useKliveMail } from '~/composables/useKliveMail';
import { fmtInt } from '~/scripts/adminConsole';
import {
  FOLDERS, PAGE_SIZE, healthVerdict, localPart, withGroups,
  type FolderId, type MailCommand, type View,
} from '~/scripts/kliveMail';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'KliveMail' });

const route = useRoute();
const router = useRouter();
const mail = useKliveMail();
const {
  allowed, summary, rows, hasMore, recentCodes, accounts, features, view, query, selectedId, detail, detailLoading, detailError,
  checked, pending, prefs, freshIds, now, ready, listLoading, listError, lastOkAt, reachable, toasts,
} = mail;

const railOpen = ref(false);
const paletteOpen = ref(false);
const confirmAll = ref(false);
const unpinning = ref<string | null>(null);
const searchText = ref('');
const searchInput = ref<HTMLInputElement | null>(null);
const listBody = ref<HTMLElement | null>(null);

// ── what the header says ──
const folderOf = (id: FolderId) => FOLDERS.find(f => f.id === id)!;
const title = computed(() => {
  if (query.value) return 'Search';
  if (view.value.mailbox) {
    const box = [...(summary.value?.mailboxes ?? []), ...(summary.value?.others ?? [])].find(m => m.address === view.value.mailbox);
    return box?.displayName || localPart(view.value.mailbox);
  }
  return folderOf(view.value.folder).label;
});
const subtitle = computed(() => {
  const s = summary.value;
  if (!s) return '';
  if (view.value.folder === 'trash') return `${fmtInt(s.trash)} in the trash`;
  if (view.value.folder === 'codes') return 'sign-in and verification codes, newest first';
  if (view.value.folder === 'files') return 'mail with attachments';
  return `${fmtInt(s.unread)} unread of ${fmtInt(s.total)}`;
});
const unreadHere = computed(() => {
  const s = summary.value;
  if (!s) return 0;
  if (!view.value.mailbox) return s.unread;
  return [...s.mailboxes, ...s.others].find(m => m.address === view.value.mailbox)?.unread ?? 0;
});
const quickFilters = computed(() => FOLDERS.filter(f => f.id !== 'trash' && (f.id !== 'codes' || features.value.codes !== false)).map(f => ({ id: f.id, label: f.id === 'inbox' ? 'All' : f.id === 'files' ? 'Files' : f.label })));
const emptyText = computed(() => {
  if (query.value) return `Nothing matches “${query.value}”.`;
  if (view.value.folder === 'unread') return 'Nothing unread here.';
  if (view.value.folder === 'codes') return 'No sign-in codes here.';
  if (view.value.folder === 'trash') return 'The trash is empty.';
  if (view.value.folder === 'files') return 'No attachments here.';
  return view.value.mailbox ? `No mail to ${view.value.mailbox} yet.` : 'No mail yet.';
});
const freshCodes = computed(() => (recentCodes.value ?? []).filter(r => now.value - r.receivedAt < 86_400_000).length || null);
const health = computed(() => healthVerdict(summary.value, now.value, reachable.value));
const items = computed(() => withGroups(rows.value, now.value, !query.value));
const checkedSet = computed(() => new Set(checked.value));
const position = computed(() => {
  if (!detail.value) return null;
  const index = rows.value.findIndex(r => r.id === detail.value!.id);
  return index < 0 ? null : { index, count: rows.value.length, more: hasMore.value };
});

const liveTone = computed(() => (!reachable.value ? 'crit' : lastOkAt.value && now.value - lastOkAt.value > 60_000 ? 'warn' : ready.value ? 'ok' : 'neutral'));
const liveWord = computed(() => (!reachable.value ? 'Offline' : !ready.value ? 'Connecting' : 'Live'));
const liveTitle = computed(() => `${liveWord.value}: refreshes every 15 s while this tab is open${lastOkAt.value ? ` · last read ${new Date(lastOkAt.value).toLocaleTimeString('en-GB')}` : ''} (click to refresh now)`);

// ── list interaction ──
let anchor: string | null = null;
function toggleCheck(id: string, range: boolean) {
  const set = new Set(checked.value);
  if (range && anchor) {
    const ids = rows.value.map(r => r.id);
    const [a, b] = [ids.indexOf(anchor), ids.indexOf(id)].sort((x, y) => x - y);
    if (a >= 0 && b >= 0) for (const x of ids.slice(a, b + 1)) set.add(x);
  } else if (set.has(id)) set.delete(id);
  else set.add(id);
  anchor = id;
  checked.value = [...set];
}
function selectAll() { checked.value = rows.value.map(r => r.id); }

function act(what: 'read' | 'unread' | 'trash' | 'restore') {
  const ids = [...checked.value];
  checked.value = [];
  if (what === 'read' || what === 'unread') void mail.setRead(ids, what === 'read');
  else if (what === 'trash') void mail.trash(ids);
  else void mail.restore(ids);
}

function openRow(id: string) {
  void mail.open(id);
  void nextTick(() => listBody.value?.querySelector<HTMLElement>(`[data-testid="row-${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' }));
}

function onScroll() {
  const el = listBody.value;
  if (el && hasMore.value && el.scrollTop + el.clientHeight > el.scrollHeight - 240) void mail.loadMore();
}

function focusList() {
  searchInput.value?.blur();
  if (!selectedId.value && rows.value[0]) openRow(rows.value[0].id);
}

function clearSearch() {
  searchText.value = '';
  if (query.value) mail.runSearch('');
  searchInput.value?.blur();
}

// Search as you type, once there is something worth asking for.
let searchTimer: number | null = null;
watch(searchText, text => {
  if (searchTimer != null) window.clearTimeout(searchTimer);
  const q = text.trim();
  if (q.length === 1) return;
  searchTimer = window.setTimeout(() => mail.runSearch(q), q ? 320 : 0);
});
watch(query, q => { if (q !== searchText.value.trim()) searchText.value = q; });

function toggleScope() {
  prefs.value.searchEverywhere = !prefs.value.searchEverywhere;
  if (query.value) void mail.loadList();
}

function paletteSearch(text: string) {
  searchText.value = text;
  mail.runSearch(text);
}

// ── the palette ──
const commands = computed<MailCommand[]>(() => {
  const list: MailCommand[] = FOLDERS.map(f => ({ id: `go-${f.id}`, title: f.label, hint: f.hint, group: 'Go to', icon: f.icon, shortcut: `g ${f.key}`, run: () => mail.goFolder(f.id) }));
  for (const m of [...(summary.value?.mailboxes ?? []), ...(summary.value?.others ?? [])]) {
    const acct = accounts.value.get(m.address) ?? [];
    list.push({
      id: `box-${m.address}`, title: m.address, group: 'Addresses', icon: m.pinned ? 'at' : 'inbox',
      hint: [m.displayName, acct.map(a => a.service).join(', '), m.unread ? `${m.unread} unread` : m.total ? `${m.total}` : 'no mail yet'].filter(Boolean).join(' · '),
      keywords: `${m.displayName ?? ''} ${acct.map(a => `${a.service} ${a.username ?? ''}`).join(' ')}`,
      run: () => mail.goMailbox(m.address),
    });
  }
  const latest = recentCodes.value?.[0];
  if (latest?.code) list.push({ id: 'copy-latest', title: `Copy the latest code (${latest.code})`, group: 'Actions', icon: 'copy', hint: `${latest.from} · to ${latest.to}`, keywords: 'code otp verify', run: () => mail.copyCode(latest.code!) });
  if (allowed.value.act && unreadHere.value) list.push({ id: 'mark-all', title: `Mark ${unreadHere.value} unread read`, group: 'Actions', icon: 'check-all', keywords: 'read all clear', run: () => { confirmAll.value = true; } });
  list.push({ id: 'paper', title: prefs.value.paper === 'light' ? 'Read mail on dark paper' : 'Read mail on light paper', group: 'Actions', icon: prefs.value.paper === 'light' ? 'moon' : 'sun', keywords: 'theme dark light', run: () => { prefs.value.paper = prefs.value.paper === 'light' ? 'dark' : 'light'; } });
  list.push({ id: 'refresh', title: 'Refresh now', group: 'Actions', icon: 'refresh', shortcut: 'r', run: () => mail.refresh() });
  return list;
});

// ── keys ──
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

let goPending = 0;
function onKeydown(event: KeyboardEvent) {
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === 'k') { event.preventDefault(); paletteOpen.value = !paletteOpen.value; return; }
  if (paletteOpen.value || unpinning.value) return;
  if (event.key === 'Escape' && !isTyping(event.target)) {
    if (confirmAll.value) confirmAll.value = false;
    else if (checked.value.length) checked.value = [];
    else if (detail.value) void mail.open(null);
    else if (query.value) clearSearch();
    else if (railOpen.value) railOpen.value = false;
    return;
  }
  if (mod && event.key.toLowerCase() === 'a' && !isTyping(event.target) && rows.value.length) { event.preventDefault(); selectAll(); return; }
  if (mod || event.altKey || isTyping(event.target)) return;

  const key = event.key;
  if (Date.now() - goPending < 1200) {
    goPending = 0;
    const folder = FOLDERS.find(f => f.key === key.toLowerCase());
    if (folder) { event.preventDefault(); mail.goFolder(folder.id); }
    return;
  }
  const current = detail.value ?? rows.value.find(r => r.id === selectedId.value) ?? null;
  switch (key) {
    case 'j': case 'ArrowDown': event.preventDefault(); scrollToSelected(mail.step(1)); break;
    case 'k': case 'ArrowUp': event.preventDefault(); scrollToSelected(mail.step(-1)); break;
    case 'Enter': case 'o': if (!detail.value && rows.value[0]) { event.preventDefault(); openRow(selectedId.value ?? rows.value[0].id); } break;
    case '/': event.preventDefault(); searchInput.value?.focus(); searchInput.value?.select(); break;
    case 'x': if (current) { event.preventDefault(); toggleCheck(current.id, event.shiftKey); } break;
    case 'X': if (current) { event.preventDefault(); toggleCheck(current.id, true); } break;
    case 'e': case '#': case 'Delete':
      if (checked.value.length) act(view.value.folder === 'trash' ? 'restore' : 'trash');
      else if (current && view.value.folder !== 'trash') void mail.trash([current.id]);
      break;
    case 'u': case 'U':
      if (checked.value.length) act('unread');
      else if (current) void mail.setRead([current.id], !current.isRead);
      break;
    case 'I': if (checked.value.length) act('read'); else if (current) void mail.setRead([current.id], true); break;
    case 'c': {
      const code = current?.code ?? (!current ? recentCodes.value?.[0]?.code : null);
      if (code) { event.preventDefault(); void mail.copyCode(code); }
      break;
    }
    case 'r': void mail.refresh(); break;
    case 'g': goPending = Date.now(); break;
    case '?': paletteOpen.value = true; break;
  }
}

function scrollToSelected(id: string | null) {
  if (!id) return;
  void nextTick(() => listBody.value?.querySelector<HTMLElement>(`[data-testid="row-${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' }));
}

// ── the address bar: ?mailbox= (the Accounts page links here), ?folder=, ?m=, ?q= ──
function readQuery(): { view: Partial<View>; open: string | null; q: string } {
  const q = route.query;
  const folder = String(q.folder ?? '') as FolderId;
  return {
    view: {
      folder: FOLDERS.some(f => f.id === folder) ? folder : 'inbox',
      mailbox: typeof q.mailbox === 'string' && q.mailbox ? q.mailbox.toLowerCase() : null,
    },
    open: typeof q.m === 'string' && q.m ? q.m : null,
    q: typeof q.q === 'string' ? q.q : '',
  };
}

watch([view, selectedId, query], ([v, m, q]) => {
  const next: Record<string, string> = {};
  if (v.mailbox) next.mailbox = v.mailbox;
  if (v.folder !== 'inbox') next.folder = v.folder;
  if (m) next.m = m;
  if (q) next.q = q;
  const same = Object.keys(next).length === Object.keys(route.query).length && Object.entries(next).every(([k, val]) => route.query[k] === val);
  if (!same) void router.replace({ query: next });
}, { deep: true });

watch(view, () => { confirmAll.value = false; listBody.value?.scrollTo({ top: 0 }); }, { deep: true });

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
  const initial = readQuery();
  if (initial.q) { searchText.value = initial.q; query.value = initial.q; }
  await mail.start({ view: initial.view, open: initial.open });
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  if (searchTimer != null) window.clearTimeout(searchTimer);
});
</script>

<style lang="scss" src="~/assets/scss/klivemail.scss"></style>
