<template>
  <aside class="kml-rail" aria-label="Folders and addresses" data-testid="kml-rail">
    <header class="kml-brand">
      <span class="kml-brand__mark" aria-hidden="true"><MailIcon name="mail" /></span>
      <div class="kml-brand__text">
        <h1 class="kml-brand__title">KliveMail</h1>
        <span class="kml-brand__sub kml-num" data-testid="kml-totals">
          <template v-if="summary"><b>{{ fmtInt(summary.unread) }}</b> unread · {{ fmtInt(summary.total) }} kept</template>
          <template v-else>Reading…</template>
        </span>
      </div>
    </header>

    <button class="kml-health" :data-tone="health.tone" :aria-expanded="healthOpen" data-testid="kml-health" :title="health.detail" @click="healthOpen = !healthOpen">
      <span class="kml-health__dot"></span>
      <span class="kml-health__word">{{ health.word }}</span>
      <span class="kml-health__detail">{{ health.detail }}</span>
      <MailIcon :name="healthOpen ? 'chevron-up' : 'chevron-down'" class="kml-health__caret" />
    </button>
    <dl v-if="healthOpen" class="kml-health__facts" data-testid="kml-health-facts">
      <div><dt>Last mail</dt><dd>{{ summary?.lastReceivedAt ? `${ago(summary.lastReceivedAt, now)} · ${fullTime(summary.lastReceivedAt)}` : 'none yet' }}</dd></div>
      <div v-if="summary?.received24h != null"><dt>Arrived</dt><dd>{{ fmtInt(summary.received24h) }} in 24 h · {{ fmtInt(summary.received7d) }} in 7 days</dd></div>
      <template v-if="facts">
        <div><dt>SMTP :25</dt><dd>{{ facts.smtpState ?? 'unknown' }}{{ facts.smtpSince ? ` since ${ago(facts.smtpSince, now)}` : '' }}{{ facts.tls ? ' · STARTTLS' : facts.tls === false ? ' · plaintext' : '' }}</dd></div>
        <div v-if="facts.sessions != null"><dt>Connections</dt><dd>{{ fmtInt(facts.sessions) }} since start{{ facts.sessionFaults ? ` · ${fmtInt(facts.sessionFaults)} dropped` : '' }}{{ facts.lastSessionAt ? ` · last ${ago(facts.lastSessionAt, now)}` : '' }}</dd></div>
        <div v-if="facts.stored != null"><dt>Stored</dt><dd>{{ fmtInt(facts.stored) }} since start{{ facts.storeErrors ? ` · ${fmtInt(facts.storeErrors)} failed` : '' }}</dd></div>
        <div v-if="facts.restarts"><dt>Restarts</dt><dd>{{ fmtInt(facts.restarts) }}{{ facts.lastError ? ` · ${facts.lastError}` : '' }}</dd></div>
        <div v-if="facts.lastStoreError"><dt>Store error</dt><dd>{{ facts.lastStoreError }}</dd></div>
      </template>
      <div v-else><dt>SMTP</dt><dd>This server does not report it yet.</dd></div>
    </dl>

    <div v-if="summary?.daily?.length" class="kml-activity" data-testid="kml-activity">
      <MailSpark :days="summary.daily" />
      <span class="kml-activity__caption kml-num">
        <b>{{ fmtInt(summary.received7d ?? weekFromDaily) }}</b> this week · {{ fmtInt(todayCount) }} today
      </span>
    </div>

    <nav class="kml-folders" aria-label="Folders">
      <button
        v-for="f in FOLDERS"
        :key="f.id"
        class="kml-folder"
        :aria-current="!view.mailbox && view.folder === f.id ? 'page' : undefined"
        :title="`${f.hint} (g then ${f.key})`"
        :data-testid="`folder-${f.id}`"
        @click="$emit('folder', f.id)"
      >
        <MailIcon :name="f.icon" class="kml-folder__icon" :data-folder="f.id" />
        <span class="kml-folder__label">{{ f.label }}</span>
        <span v-if="folderCount(f.id)" class="kml-folder__count kml-num" :data-strong="f.id === 'unread' || f.id === 'codes' || undefined" :title="f.id === 'codes' ? 'Codes that arrived in the last 24 hours' : undefined">{{ fmtInt(folderCount(f.id)) }}</span>
      </button>
    </nav>

    <div class="kml-rail__head">
      <span>Addresses <b class="kml-num">{{ fmtInt((summary?.mailboxes.length ?? 0) + (summary?.others.length ?? 0)) }}</b></span>
      <button v-if="canManage" class="kml-iconbtn kml-iconbtn--sm" title="Pin a new address" aria-label="Pin a new address" data-testid="kml-add" @click="startAdding">
        <MailIcon name="plus" />
      </button>
    </div>

    <form v-if="adding" class="kml-add" data-testid="kml-add-form" @submit.prevent="submitAdd" @keydown.esc.prevent="adding = false">
      <div class="kml-add__field">
        <input ref="addInput" v-model="newAddress" class="kml-input" placeholder="name" aria-label="Address name" autocomplete="off" spellcheck="false" data-testid="kml-add-address" />
        <span class="kml-add__domain">@klive.dev</span>
      </div>
      <input v-model="newName" class="kml-input" placeholder="Label (optional)" aria-label="Label" data-testid="kml-add-label" />
      <p v-if="newAddress && addError" class="kml-add__error">{{ addError }}</p>
      <div class="kml-add__actions">
        <button type="button" class="kml-btn kml-btn--ghost kml-btn--sm" @click="adding = false">Cancel</button>
        <button type="submit" class="kml-btn kml-btn--primary kml-btn--sm" :disabled="!!addError || busyAdd">Pin</button>
      </div>
    </form>

    <label v-if="(summary?.mailboxes.length ?? 0) > 8" class="kml-rail__filter">
      <MailIcon name="filter" />
      <input v-model="filter" class="kml-bare" :placeholder="`Filter ${fmtInt(summary?.mailboxes.length ?? 0)} addresses`" aria-label="Filter addresses" data-testid="kml-rail-filter" @keydown.esc="filter = ''" />
    </label>

    <div class="kml-boxes" data-testid="kml-boxes">
      <ul>
        <li v-for="m in groups.active" :key="m.address">
          <MailboxButton :m="m" />
        </li>
      </ul>

      <template v-if="groups.unpinned.length">
        <button class="kml-group" :aria-expanded="prefs.unpinnedOpen" title="Mail to addresses nobody pinned: KliveMail takes mail for any @klive.dev address" data-testid="kml-group-unpinned" @click="$emit('pref', 'unpinnedOpen')">
          <MailIcon :name="prefs.unpinnedOpen ? 'chevron-down' : 'chevron-right'" />Not pinned <b class="kml-num">{{ groups.unpinned.length }}</b>
        </button>
        <ul v-if="prefs.unpinnedOpen">
          <li v-for="m in groups.unpinned" :key="m.address"><MailboxButton :m="m" /></li>
        </ul>
      </template>

      <template v-if="groups.quiet.length">
        <button class="kml-group" :aria-expanded="prefs.quietOpen || !!filter" data-testid="kml-group-quiet" @click="$emit('pref', 'quietOpen')">
          <MailIcon :name="prefs.quietOpen || filter ? 'chevron-down' : 'chevron-right'" />No mail yet <b class="kml-num">{{ groups.quiet.length }}</b>
        </button>
        <ul v-if="prefs.quietOpen || filter">
          <li v-for="m in groups.quiet" :key="m.address"><MailboxButton :m="m" quiet /></li>
        </ul>
      </template>

      <p v-if="summary && !groups.active.length && !groups.unpinned.length && !groups.quiet.length" class="kml-rail__empty">
        {{ filter ? 'No address matches.' : `Mail to any @klive.dev address arrives under All mail.` }}
      </p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, ref } from 'vue';
import MailIcon from '~/components/Mail/Icon.vue';
import MailSpark from '~/components/Mail/Spark.vue';
import { fmtInt } from '~/scripts/adminConsole';
import {
  FOLDERS, addressProblem, ago, avatarHue, fullAddress, fullTime, initialOf, localPart, railGroups,
  type FolderId, type HealthVerdict, type MailAccount, type MailboxRow, type MailSummary, type View,
} from '~/scripts/kliveMail';

const props = defineProps<{
  summary: MailSummary | null;
  view: View;
  health: HealthVerdict;
  accounts: Map<string, MailAccount[]>;
  prefs: { quietOpen: boolean; unpinnedOpen: boolean };
  now: number;
  canManage: boolean;
  codesCount: number | null;
}>();

const emit = defineEmits<{
  (e: 'folder', id: FolderId): void;
  (e: 'mailbox', address: string): void;
  (e: 'pref', key: 'quietOpen' | 'unpinnedOpen'): void;
  (e: 'create', address: string, label: string, done: (ok: boolean) => void): void;
  (e: 'unpin', address: string): void;
}>();

const healthOpen = ref(false);
const filter = ref('');
const facts = computed(() => props.summary?.health ?? null);
const groups = computed(() => railGroups(props.summary, filter.value));
const todayCount = computed(() => props.summary?.daily.at(-1)?.n ?? 0);
const weekFromDaily = computed(() => (props.summary?.daily ?? []).slice(-7).reduce((s, d) => s + d.n, 0));

function folderCount(id: FolderId): number {
  const s = props.summary;
  if (!s) return 0;
  if (id === 'inbox') return s.total;
  if (id === 'unread') return s.unread;
  if (id === 'trash') return s.trash;
  if (id === 'codes') return props.codesCount ?? 0;
  return 0;
}

// ── pinning an address ──
const adding = ref(false);
const newAddress = ref('');
const newName = ref('');
const busyAdd = ref(false);
const addInput = ref<HTMLInputElement | null>(null);
const addError = computed(() => addressProblem(newAddress.value));
function startAdding() {
  adding.value = !adding.value;
  newAddress.value = '';
  newName.value = '';
  if (adding.value) void nextTick(() => addInput.value?.focus());
}
function submitAdd() {
  if (addError.value || busyAdd.value) return;
  busyAdd.value = true;
  emit('create', fullAddress(newAddress.value), newName.value, ok => {
    busyAdd.value = false;
    if (ok) adding.value = false;
  });
}

// ── one address ──
const MailboxButton = defineComponent({
  props: { m: { type: Object as () => MailboxRow, required: true }, quiet: Boolean },
  setup(p) {
    return () => {
      const m = p.m;
      const active = props.view.mailbox === m.address;
      const accounts = props.accounts.get(m.address) ?? [];
      const sub = m.displayName || accounts.map(a => a.service).join(', ');
      const unhealthy = accounts.some(a => a.status && !/^active$/i.test(a.status));
      return h('div', { class: 'kml-box', 'data-active': active || undefined, 'data-quiet': p.quiet || undefined }, [
        h('button', {
          class: 'kml-box__main',
          title: `${m.address}${m.displayName ? ` · ${m.displayName}` : ''}${accounts.length ? `\nUsed by: ${accounts.map(a => `${a.service}${a.username ? ` (${a.username})` : ''}${a.status ? ` · ${a.status}` : ''}`).join(', ')}` : ''}`,
          'aria-current': active ? 'page' : undefined,
          'data-testid': `box-${m.address}`,
          onClick: () => emit('mailbox', m.address),
        }, [
          h('span', { class: 'kml-avatar kml-avatar--sm', style: { '--hue': String(avatarHue(m.address)) } }, initialOf(localPart(m.address))),
          h('span', { class: 'kml-box__text' }, [
            h('span', { class: 'kml-box__name', 'data-unread': m.unread > 0 || undefined }, localPart(m.address)),
            sub || m.lastAt
              ? h('span', { class: 'kml-box__sub' }, [
                  accounts.length ? h('span', { class: 'kml-box__acct', 'data-tone': unhealthy ? 'warn' : undefined }, accounts.length > 1 ? `${accounts.length} accounts` : accounts[0].service) : null,
                  m.displayName ? h('span', { class: 'kml-box__label' }, m.displayName) : null,
                  m.lastAt ? h('span', { class: 'kml-box__when' }, ago(m.lastAt, props.now).replace(' ago', '')) : null,
                ])
              : null,
          ]),
          m.unread ? h('span', { class: 'kml-badge kml-num' }, fmtInt(m.unread)) : null,
        ]),
        props.canManage
          ? h('button', {
              class: 'kml-box__pin',
              title: m.pinned ? `Unpin ${m.address} (its mail stays)` : `Pin ${m.address}`,
              'aria-label': m.pinned ? `Unpin ${m.address}` : `Pin ${m.address}`,
              'data-testid': `${m.pinned ? 'unpin' : 'pin'}-${m.address}`,
              onClick: () => (m.pinned ? emit('unpin', m.address) : emit('create', m.address, '', () => {})),
            }, [h(MailIcon, { name: m.pinned ? 'pin-off' : 'pin' })])
          : null,
      ]);
    };
  },
});
</script>
