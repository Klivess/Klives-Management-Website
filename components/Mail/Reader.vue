<template>
  <section class="kml-reader" aria-label="Message" data-testid="kml-reader">
    <!-- ── nothing open: the quickest things to reach for ── -->
    <div v-if="!detail" class="kml-idle" data-testid="kml-idle">
      <div class="kml-idle__head">
        <MailIcon name="mail-open" class="kml-idle__mark" />
        <div>
          <h2 class="kml-idle__title">{{ idleTitle }}</h2>
          <p class="kml-idle__sub">{{ idleSub }}</p>
        </div>
      </div>

      <section v-if="recentCodes && recentCodes.length" class="kml-card" data-testid="kml-recent-codes">
        <header class="kml-card__head"><MailIcon name="key" /><h3>Latest codes</h3><span class="kml-dim">click to copy, Enter on a row to open it</span></header>
        <ul class="kml-codes">
          <li v-for="r in recentCodes" :key="r.id" :data-stale="now - r.receivedAt > 3_600_000 || undefined">
            <button class="kml-codes__code" :title="`Copy ${codeForClipboard(r.code!)}`" :data-testid="`recent-code-${r.id}`" @click="$emit('copy', r.code!)">
              <span class="kml-mono">{{ spacedCode(r.code!) }}</span><MailIcon name="copy" />
            </button>
            <button class="kml-codes__what" @click="$emit('open', r.id)">
              <span class="kml-codes__from">{{ senderName(r) }}</span>
              <span class="kml-codes__to">to {{ localPart(r.to) }}</span>
            </button>
            <span class="kml-codes__when kml-num" :title="fullTime(r.receivedAt)">{{ ago(r.receivedAt, now) }}</span>
          </li>
        </ul>
      </section>

      <section class="kml-card kml-keys" aria-label="Keyboard">
        <header class="kml-card__head"><MailIcon name="keyboard" /><h3>Keys</h3></header>
        <dl>
          <div><dt><kbd>j</kbd><kbd>k</kbd></dt><dd>next / previous</dd></div>
          <div><dt><kbd>x</kbd></dt><dd>select</dd></div>
          <div><dt><kbd>e</kbd></dt><dd>trash</dd></div>
          <div><dt><kbd>u</kbd></dt><dd>read / unread</dd></div>
          <div><dt><kbd>c</kbd></dt><dd>copy the code</dd></div>
          <div><dt><kbd>/</kbd></dt><dd>search</dd></div>
          <div><dt><kbd>g</kbd><kbd>i</kbd><kbd>u</kbd><kbd>c</kbd><kbd>t</kbd></dt><dd>go to a folder</dd></div>
          <div><dt><kbd>Ctrl</kbd><kbd>K</kbd></dt><dd>jump to an address</dd></div>
        </dl>
      </section>
    </div>

    <!-- ── a message ── -->
    <article v-else class="kml-msg" :data-testid="`msg-${detail.id}`">
      <header class="kml-msg__bar">
        <button class="kml-iconbtn kml-msg__back" title="Back to the list (Esc)" aria-label="Back to the list" @click="$emit('close')"><MailIcon name="arrow-left" /></button>
        <div class="kml-msg__nav">
          <button class="kml-iconbtn" :disabled="!position || position.index <= 0" title="Newer (k)" aria-label="Newer" @click="$emit('step', -1)"><MailIcon name="arrow-up" /></button>
          <button class="kml-iconbtn" :disabled="!position || position.index >= position.count - 1" title="Older (j)" aria-label="Older" @click="$emit('step', 1)"><MailIcon name="arrow-down" /></button>
          <span v-if="position" class="kml-dim kml-num">{{ position.index + 1 }} of {{ position.count }}{{ position.more ? '+' : '' }}</span>
        </div>
        <span class="kml-spacer"></span>
        <template v-if="detail.isDeleted">
          <button v-if="canDelete" class="kml-btn kml-btn--sm" data-testid="msg-restore" @click="$emit('restore')"><MailIcon name="restore" />Restore</button>
        </template>
        <template v-else>
          <button v-if="canAct" class="kml-btn kml-btn--sm kml-btn--ghost" title="Mark unread (u)" data-testid="msg-unread" @click="$emit('read', false)"><MailIcon name="mail" />Unread</button>
          <button v-if="canDelete" class="kml-btn kml-btn--sm kml-btn--ghost" title="Move to Trash (e)" data-testid="msg-trash" @click="$emit('trash')"><MailIcon name="trash" />Trash</button>
        </template>
      </header>

      <div class="kml-msg__head">
        <h2 class="kml-msg__subject" data-testid="msg-subject">{{ detail.subject || '(no subject)' }}</h2>
        <div class="kml-msg__people">
          <span class="kml-avatar kml-avatar--lg" :style="{ '--hue': String(avatarHue(detail.from || name)) }" aria-hidden="true">{{ initialOf(name) }}</span>
          <div class="kml-msg__who">
            <div class="kml-msg__from">
              <b>{{ name }}</b>
              <button class="kml-msg__addr" :title="`Copy ${detail.from}`" @click="$emit('copyText', detail.from, 'Sender address copied')">{{ detail.from }}</button>
            </div>
            <div class="kml-msg__to">
              to <button class="kml-link" :title="`Open the ${detail.to} mailbox`" @click="$emit('mailbox', detail.to)">{{ detail.to }}</button>
              <template v-if="accounts.length"> · <span class="kml-msg__acct" :title="accounts.map(a => `${a.service}${a.username ? ` (${a.username})` : ''} · ${a.status ?? ''}`).join('\n')">{{ accounts.map(a => a.service).join(', ') }}</span></template>
            </div>
          </div>
          <time class="kml-msg__when kml-num" :title="fullTime(detail.dateAt ?? detail.receivedAt)">{{ fullTime(detail.receivedAt) }}<span class="kml-dim"> · {{ ago(detail.receivedAt, now) }}</span></time>
        </div>
      </div>

      <!-- what this mail wants done -->
      <div v-if="detail.code || detail.links.length" class="kml-quick" data-testid="msg-quick">
        <button v-if="detail.code" class="kml-quick__code" :title="`Copy ${codeForClipboard(detail.code)} (c)`" data-testid="msg-code" @click="$emit('copy', detail.code)">
          <span class="kml-quick__label">Code</span>
          <span class="kml-mono kml-quick__digits">{{ spacedCode(detail.code) }}</span>
          <span class="kml-quick__copy"><MailIcon name="copy" />Copy</span>
        </button>
        <a
          v-for="(link, i) in detail.links.slice(0, detail.code ? 1 : 2)"
          :key="link.url"
          class="kml-quick__link"
          :href="link.url"
          target="_blank"
          rel="noopener noreferrer nofollow"
          referrerpolicy="no-referrer"
          :title="link.url"
          :data-testid="`msg-link-${i}`"
        >
          <MailIcon name="external" />
          <span class="kml-quick__linktext">{{ i === 0 ? 'Open the link it asks for' : 'Other link' }}</span>
          <span class="kml-quick__host">{{ link.host }}</span>
        </a>
      </div>

      <div v-if="files.length" class="kml-files">
        <button v-for="a in files" :key="a.id" class="kml-file" :title="`Download ${a.fileName}`" @click="$emit('download', a)">
          <MailIcon name="download" /><span class="kml-truncate">{{ a.fileName }}</span><span class="kml-dim kml-num">{{ fmtBytes(a.sizeBytes) }}</span>
        </button>
      </div>

      <div class="kml-paper" :data-mode="paper">
        <div class="kml-paper__tools">
          <span v-if="loading" class="kml-dim"><MailIcon name="refresh" class="kml-spin" /> Opening…</span>
          <span v-else-if="error" class="kml-error">{{ error }}</span>
          <span v-else-if="remoteImages && !images" class="kml-dim" data-testid="msg-images-blocked"><MailIcon name="shield" /> {{ remoteImages }} remote image{{ remoteImages === 1 ? '' : 's' }} blocked</span>
          <span class="kml-spacer"></span>
          <button v-if="remoteImages" class="kml-btn kml-btn--xs kml-btn--ghost" :aria-pressed="images" data-testid="msg-images" @click="images = !images"><MailIcon name="image" />{{ images ? 'Hide images' : 'Load images' }}</button>
          <div class="kml-seg" role="group" aria-label="Paper">
            <button class="kml-seg__opt" :aria-pressed="paper === 'light'" title="Light paper: how most mail is designed to look" @click="$emit('paper', 'light')"><MailIcon name="sun" /></button>
            <button class="kml-seg__opt" :aria-pressed="paper === 'dark'" title="Dark paper" @click="$emit('paper', 'dark')"><MailIcon name="moon" /></button>
          </div>
        </div>
        <iframe
          v-if="hasBody"
          class="kml-paper__frame"
          :title="`Message: ${detail.subject}`"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerpolicy="no-referrer"
          :srcdoc="frameDoc"
          data-testid="msg-frame"
        ></iframe>
        <p v-else-if="!loading" class="kml-paper__empty">This message has no body.</p>
      </div>

      <section v-if="others.length" class="kml-thread" aria-label="Conversation">
        <h3 class="kml-thread__head"><MailIcon name="thread" />Conversation <span class="kml-num">{{ detail.thread.length }}</span></h3>
        <button v-for="t in others" :key="t.id" class="kml-thread__row" :data-unread="!t.isRead || undefined" @click="$emit('open', t.id)">
          <span class="kml-thread__from">{{ senderName(t) }}</span>
          <span class="kml-thread__snippet">{{ t.snippet || t.subject }}</span>
          <span class="kml-dim kml-num">{{ listTime(t.receivedAt, now) }}</span>
        </button>
      </section>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MailIcon from '~/components/Mail/Icon.vue';
import { fmtBytes, fmtInt } from '~/scripts/adminConsole';
import {
  ago, avatarHue, codeForClipboard, emailDocument, fullTime, initialOf, listTime, localPart, remoteImageCount, senderName, spacedCode, textToHtml,
  type MailAccount, type MailAttachment, type MailDetail, type MailRow, type MailSummary, type PaperMode,
} from '~/scripts/kliveMail';

const props = defineProps<{
  detail: MailDetail | null;
  loading: boolean;
  error: string | null;
  paper: PaperMode;
  now: number;
  accounts: MailAccount[];
  position: { index: number; count: number; more: boolean } | null;
  recentCodes: MailRow[] | null;
  summary: MailSummary | null;
  canAct: boolean;
  canDelete: boolean;
}>();

defineEmits<{
  (e: 'close'): void;
  (e: 'step', delta: 1 | -1): void;
  (e: 'read', read: boolean): void;
  (e: 'trash'): void;
  (e: 'restore'): void;
  (e: 'copy', code: string): void;
  (e: 'copyText', text: string, label: string): void;
  (e: 'download', attachment: MailAttachment): void;
  (e: 'paper', mode: PaperMode): void;
  (e: 'open', id: string): void;
  (e: 'mailbox', address: string): void;
}>();

const images = ref(false);
watch(() => props.detail?.id, () => { images.value = false; });

const name = computed(() => (props.detail ? senderName(props.detail) : ''));
const files = computed(() => (props.detail?.attachments ?? []).filter(a => !a.isInline || !props.detail?.bodyHtml));
const others = computed(() => (props.detail?.thread ?? []).filter(t => t.id !== props.detail?.id));
const remoteImages = computed(() => remoteImageCount(props.detail?.bodyHtml ?? null));
const hasBody = computed(() => !!(props.detail?.bodyHtml || props.detail?.bodyText));
const frameDoc = computed(() => {
  const d = props.detail;
  if (!d) return '';
  const html = d.bodyHtml || textToHtml(d.bodyText ?? '');
  return emailDocument(html, { images: images.value, mode: props.paper });
});

const idleTitle = computed(() => {
  const s = props.summary;
  if (!s) return 'Reading the mailboxes…';
  if (!s.unread) return 'All read';
  const boxes = [...s.mailboxes, ...s.others].filter(m => m.unread > 0).length;
  return `${fmtInt(s.unread)} unread across ${fmtInt(boxes)} address${boxes === 1 ? '' : 'es'}`;
});
const idleSub = computed(() => {
  const s = props.summary;
  if (!s) return '';
  const last = s.lastReceivedAt ? `Last mail ${ago(s.lastReceivedAt, props.now)}` : 'No mail yet';
  return `${last}. Open a message with Enter, or j to start at the top.`;
});
</script>
