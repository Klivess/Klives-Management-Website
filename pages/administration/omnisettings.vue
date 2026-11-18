<template>
  <div class="adm ost" data-testid="ost-root">
    <!-- ── bar ── -->
    <header class="adm-bar">
      <NuxtLink to="/admin" class="ost-back" title="Back to Admin"><AdminIcon name="arrow-left" />Admin</NuxtLink>
      <div class="adm-bar__id">
        <h1 class="adm-bar__title">Settings</h1>
        <span v-if="settings.length" class="adm-bar__host">{{ fmtInt(settings.length) }} across {{ groupsAll.length }} services</span>
      </div>

      <label class="ost-search">
        <AdminIcon name="search" />
        <input
          ref="searchInput"
          v-model="query"
          type="search"
          placeholder="Find a setting by name, service or value"
          aria-label="Search settings"
          aria-keyshortcuts="/ Control+K"
          autocomplete="off"
          spellcheck="false"
          data-testid="ost-search"
          @keydown="onSearchKey"
        />
        <template v-if="query">
          <span class="ost-search__count" data-testid="ost-search-count">{{ visible.length }} found</span>
          <button class="ost-search__clear" type="button" aria-label="Clear search" @click="clearSearch"><AdminIcon name="x" /></button>
        </template>
        <span v-else class="adm-kbd">/</span>
      </label>

      <span class="adm-bar__spacer"></span>

      <div class="adm-bar__actions">
        <span v-if="profileReady && !canWrite" class="adm-chip" data-tone="info" data-testid="ost-readonly">Read only</span>
        <span class="ost-fresh" :title="loadedAt ? `Read at ${new Date(loadedAt).toLocaleTimeString()}` : ''">{{ freshness }}</span>
        <button class="adm-btn adm-btn--ghost" type="button" title="Read again (R)" aria-label="Read settings again" data-testid="ost-refresh" @click="s.load({ quiet: true })">
          <AdminIcon name="refresh" :class="{ 'adm-spin': refreshing }" />
        </button>
      </div>
    </header>

    <!-- The layout already provides the page's <main>. -->
    <div class="ost-main">
      <OmniSettingsRail
        v-if="settings.length"
        :groups="groupsAll"
        :active="owner"
        :total="settings.length"
        :tones="ownerTones"
        @select="selectOwner"
      />

      <div class="ost-content" :class="{ 'ost-content--solo': !settings.length }">
        <!-- ── banners ── -->
        <div v-if="loadError && settings.length" class="adm-banner" data-tone="warn" role="status">
          <AdminIcon class="adm-banner__mark" name="alert" />
          <div class="adm-banner__text">
            <div class="adm-banner__title">Could not read settings again</div>
            <div class="adm-banner__detail">{{ loadError }} What is shown is from {{ freshness.replace('read ', '') }}.</div>
          </div>
          <button class="adm-btn adm-btn--sm" type="button" @click="s.load({ quiet: true })">Try again</button>
        </div>
        <div v-if="profileReady && !canWrite && settings.length" class="adm-banner" data-tone="info">
          <AdminIcon class="adm-banner__mark" name="info" />
          <div class="adm-banner__text">
            <div class="adm-banner__title">Read only</div>
            <div class="adm-banner__detail">Your profile can see settings but not change them. Secrets stay hidden either way.</div>
          </div>
        </div>
        <div v-if="meta.source === 'list' && settings.length" class="adm-banner" data-tone="info" data-testid="ost-legacy">
          <AdminIcon class="adm-banner__mark" name="info" />
          <div class="adm-banner__text">
            <div class="adm-banner__title">The server is a version behind this page</div>
            <div class="adm-banner__detail">Code defaults, read times, change history and services waiting on a value appear once it has been updated.</div>
          </div>
        </div>

        <!-- ── first load ── -->
        <section v-if="loading" class="adm-panel" aria-busy="true" aria-label="Loading settings">
          <div class="ost-skel">
            <div v-for="n in 9" :key="n" class="ost-skel__row">
              <div class="ost-skel__bar" :style="{ width: `${48 + (n * 17) % 40}%` }"></div>
              <div class="ost-skel__bar" :style="{ width: `${30 + (n * 23) % 50}%` }"></div>
              <div class="ost-skel__bar" :style="{ width: `${20 + (n * 13) % 30}%` }"></div>
            </div>
          </div>
        </section>

        <section v-else-if="loadError && !settings.length" class="adm-panel">
          <div class="ost-empty" role="alert">
            <AdminIcon name="octagon-x" style="font-size: 22px; color: var(--adm-crit)" />
            <div class="ost-empty__title">Settings could not be read</div>
            <div>{{ loadError }}</div>
            <button class="adm-btn" type="button" data-testid="ost-retry" @click="s.load()"><AdminIcon name="refresh" />Try again</button>
          </div>
        </section>

        <template v-else-if="settings.length">
          <!-- ── views: the counts are the filters ── -->
          <div class="ost-views" role="group" aria-label="Show">
            <button
              v-for="tile in tiles"
              :key="tile.id"
              class="ost-view"
              type="button"
              :aria-pressed="view === tile.id"
              :data-tone="tile.tone"
              :title="tile.title"
              :data-testid="`view-${tile.id}`"
              @click="setView(tile.id)"
            >
              <span class="ost-view__label"><AdminIcon :name="tile.icon" />{{ tile.label }}</span>
              <span class="ost-view__value">{{ tile.value }}</span>
              <span class="ost-view__sub">{{ tile.sub }}</span>
            </button>
          </div>

          <!-- ── needs you ── -->
          <section
            v-if="showNeeds"
            class="adm-panel ost-needs"
            :data-tone="needsTone"
            aria-label="Needs you"
            data-testid="ost-needs"
          >
            <header class="adm-panel__head">
              <h2 class="adm-panel__title"><AdminIcon name="alert" />Needs you</h2>
              <span class="adm-panel__meta">{{ attention.length }} thing{{ attention.length === 1 ? '' : 's' }}, worst first</span>
            </header>
            <div class="ost-needs__list">
              <div v-for="item in attention" :key="item.id" class="ost-need" :data-tone="item.tone" :data-testid="`need-${item.kind}`">
                <div class="ost-need__head">
                  <AdminIcon class="ost-need__mark" :name="NEED_ICON[item.kind]" />
                  <div class="ost-need__text">
                    <div class="ost-need__title">{{ item.title }}</div>
                    <div class="ost-need__detail">{{ item.detail }}</div>
                  </div>
                  <div class="ost-need__acts">
                    <button v-if="item.kind === 'unowned' || item.kind === 'stale'" class="adm-btn adm-btn--sm adm-btn--ghost" type="button" @click="showKeys(item)">Show {{ item.keys.length }}</button>
                    <button
                      v-if="canWrite && item.removable?.length"
                      class="adm-btn adm-btn--sm adm-btn--danger"
                      type="button"
                      :data-testid="`need-remove-${item.kind}`"
                      @click="askRemove(item.removable!, item.kind === 'duplicate' ? 'Delete the copy nothing reads?' : `Delete ${item.removable!.length} unread settings?`)"
                    >
                      <AdminIcon name="trash" />{{ item.kind === 'duplicate' ? 'Delete unread copy' : `Delete ${item.removable!.length}` }}
                    </button>
                  </div>
                </div>
                <!-- What it is about, editable right here. -->
                <template v-if="item.kind === 'awaiting' || item.kind === 'empty-secret' || item.kind === 'duplicate'">
                  <OmniSettingsRow v-for="key in item.keys" :key="`need:${key}`" v-bind="rowBind(byKey.get(key)!)" show-owner v-on="rowOn(byKey.get(key)!)" />
                </template>
              </div>
            </div>
          </section>

          <!-- ── what is showing ── -->
          <div v-if="scopeText" class="ost-scope" data-testid="ost-scope">
            <span>Showing <b>{{ scopeText }}</b></span>
            <button class="ost-linkbtn" type="button" @click="resetScope">Show everything</button>
          </div>

          <!-- ── search results: one ranked list ── -->
          <section v-if="query" class="adm-panel" aria-label="Search results">
            <div v-if="visible.length" class="ost-rows">
              <OmniSettingsRow v-for="setting in visible" :key="setting.key" v-bind="rowBind(setting)" show-owner v-on="rowOn(setting)" />
            </div>
            <div v-else class="ost-empty">
              <div class="ost-empty__title">Nothing matches “{{ query }}”</div>
              <div>Names, services and values are searched{{ owner || view !== 'all' ? ', within what is showing' : '' }}.</div>
              <button v-if="owner || view !== 'all'" class="adm-btn adm-btn--sm" type="button" @click="resetScope">Search everything</button>
            </div>
          </section>

          <!-- ── by service ── -->
          <template v-else>
            <section
              v-for="group in groups"
              :id="groupId(group.owner)"
              :key="group.owner"
              class="adm-panel ost-group"
              :data-collapsed="isCollapsed(group.owner)"
              :data-testid="`group-${group.owner}`"
            >
              <button class="ost-group__head" type="button" :aria-expanded="!isCollapsed(group.owner)" @click="s.toggleCollapsed(group.owner)">
                <AdminIcon class="ost-group__chev" name="chevron-down" />
                <span class="ost-group__name">{{ group.owner }}</span>
                <span v-if="group.attention" class="adm-chip" :data-tone="ownerTones[group.owner] ?? 'warn'">{{ group.attention }} need you</span>
                <span class="ost-group__facts">
                  <span><b>{{ group.settings.length }}</b> {{ group.settings.length === 1 ? 'setting' : 'settings' }}</span>
                  <span v-if="meta.source === 'board' || group.read"><b>{{ group.read }}</b> read</span>
                  <span v-if="group.custom"><b>{{ group.custom }}</b> changed</span>
                  <span v-if="group.secrets"><b>{{ group.secrets }}</b> secret</span>
                </span>
              </button>
              <template v-if="!isCollapsed(group.owner)">
                <p v-if="isNonServiceOwner(group.owner)" class="ost-group__note">Not a service. Settings filed here were made outside one, most likely by an agent asking for a name that did not exist.</p>
                <div class="ost-rows">
                  <OmniSettingsRow v-for="setting in group.settings" :key="setting.key" v-bind="rowBind(setting)" v-on="rowOn(setting)" />
                </div>
              </template>
            </section>
            <section v-if="!groups.length" class="adm-panel">
              <div class="ost-empty">
                <div class="ost-empty__title">{{ emptyViewText }}</div>
                <button class="adm-btn adm-btn--sm" type="button" @click="resetScope">Show everything</button>
              </div>
            </section>
          </template>

          <div class="ost-keys" aria-hidden="true">
            <span><span class="adm-kbd">/</span> search</span>
            <span><span class="adm-kbd">↑</span><span class="adm-kbd">↓</span> move between settings</span>
            <span><span class="adm-kbd">↵</span> save</span>
            <span><span class="adm-kbd">Esc</span> put back</span>
            <span><span class="adm-kbd">Ctrl</span><span class="adm-kbd">S</span> save all</span>
            <span><span class="adm-kbd">R</span> read again</span>
            <span>Click a name to copy it</span>
          </div>
        </template>

        <section v-else class="adm-panel">
          <div class="ost-empty">
            <div class="ost-empty__title">No settings yet</div>
            <div>Services create their settings the first time they read them.</div>
          </div>
        </section>
      </div>
    </div>

    <!-- ── unsaved changes ── -->
    <div v-if="draftCount" class="ost-tray" role="region" aria-label="Unsaved changes" data-testid="ost-tray">
      <span class="ost-tray__text"><b>{{ draftCount }} unsaved</b> <span class="ost-tray__names">{{ draftNames }}</span></span>
      <button class="adm-btn adm-btn--sm adm-btn--ghost" type="button" @click="s.discardAll()">Discard</button>
      <button class="adm-btn adm-btn--sm adm-btn--primary" type="button" :disabled="!canWrite || savesInFlight > 0" data-testid="ost-save-all" @click="s.saveAll()">
        Save all <span class="adm-kbd" style="margin-left: 2px">Ctrl S</span>
      </button>
    </div>

    <!-- ── long text ── -->
    <OmniSettingsTextDialog
      :setting="textFor"
      :draft="textFor ? drafts[textFor.key]?.text : undefined"
      :can-write="canWrite"
      @close="textFor = null"
      @save="saveLongText"
    />

    <!-- ── deleting ── -->
    <AdminDialog
      :open="!!confirm"
      :title="confirm?.title ?? ''"
      :sub="confirm && confirm.targets.length > 1 ? 'Each is removed from the store. A service that reads one again recreates it with its default.' : 'It is removed from the store. If a service reads it again, it comes back with its default.'"
      icon="trash"
      tone="crit"
      testid="ost-confirm"
      @close="confirm = null"
    >
      <div class="ost-confirm-list">
        <div v-for="target in confirm?.targets ?? []" :key="target.key">
          <code>{{ target.name }}</code> <span>· {{ target.owner }}<template v-if="target.ownerId !== '0'"> (id {{ target.ownerId }})</template> · {{ target.sensitive ? (target.hasValue ? 'secret' : 'empty secret') : shortValue(target.type, target.value, target.unit) }}</span>
        </div>
      </div>
      <p v-if="deleting" class="adm-dim" style="margin-top: 8px">Deleting {{ deleting.done }} of {{ deleting.total }}…</p>
      <template #actions>
        <button class="adm-btn adm-btn--ghost" type="button" data-autofocus :disabled="!!deleting" @click="confirm = null">Cancel</button>
        <button class="adm-btn adm-btn--danger" type="button" :disabled="!!deleting" data-testid="ost-confirm-delete" @click="confirmRemove">
          <AdminIcon name="trash" />Delete{{ confirm && confirm.targets.length > 1 ? ` ${confirm.targets.length}` : '' }}
        </button>
      </template>
    </AdminDialog>

    <Teleport to="body">
      <div v-if="toasts.length" class="adm-layer">
        <div class="ost-toasts" role="status" aria-live="polite">
          <div v-for="toast in toasts" :key="toast.id" class="ost-toast" :data-tone="toast.tone" :data-testid="`toast-${toast.tone}`">
            <AdminIcon :name="toast.tone === 'crit' ? 'octagon-x' : toast.tone === 'warn' ? 'alert' : toast.tone === 'info' ? 'info' : 'check-circle'" />
            <span class="ost-toast__text">{{ toast.text }}</span>
            <button v-if="toast.action" class="adm-btn adm-btn--sm" type="button" data-testid="toast-action" @click="toast.action.run(); s.dismissToast(toast.id)">{{ toast.action.label }}</button>
            <button class="adm-iconbtn" type="button" aria-label="Dismiss" @click="s.dismissToast(toast.id)"><AdminIcon name="x" /></button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
import { useSettingsConsole } from '~/composables/useSettingsConsole';
import { fmtInt, fmtRelative } from '~/scripts/adminConsole';
import {
  RECENT_DAYS, STALE_DAYS, changedLabel, groupByOwner, inView, isNonServiceOwner, queryWords, searchScore, shortValue,
  trackingMature, type AttentionItem, type AttentionKind, type Setting, type ViewId,
} from '~/scripts/settingsConsole';

definePageMeta({ layout: 'navbar' });

const s = useSettingsConsole();
const {
  canWrite, settings, meta, loading, refreshing, loadError, loadedAt, now,
  drafts, secrets, rows, savesInFlight, deleting, draftCount, attention, attentionKeys, byKey, toasts, prefs,
} = s;
const profileReady = s.profile.ready;
const route = useRoute();

const NEED_ICON: Record<AttentionKind, string> = {
  awaiting: 'hourglass', 'empty-secret': 'lock', duplicate: 'layers', unowned: 'help-circle', stale: 'clock',
};

// ───────────────────────────── what is showing ─────────────────────────────

const query = ref('');
const owner = ref<string | null>(null);
const view = computed<ViewId>(() => prefs.value.view);
const words = computed(() => queryWords(query.value));
const textFor = ref<Setting | null>(null);
const flashKey = ref<string | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);

const groupsAll = computed(() => groupByOwner(settings.value, attentionKeys.value));
const ctx = computed(() => ({ attentionKeys: attentionKeys.value, meta: meta.value, now: now.value }));

/** The settings one "Needs you" line is about, when its Show was pressed. */
const pinned = ref<{ label: string; keys: Set<string> } | null>(null);

/** Owner, view and pinned filters; search ranks within them. */
const scoped = computed(() => settings.value.filter(setting =>
  (pinned.value == null || pinned.value.keys.has(setting.key))
  && (owner.value == null || setting.owner === owner.value)
  && inView(view.value, setting, ctx.value)));

const visible = computed<Setting[]>(() => {
  if (!query.value.trim()) return scoped.value;
  return scoped.value
    .map(setting => ({ setting, score: searchScore(setting, query.value) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.setting);
});

const groups = computed(() => groupByOwner(visible.value, attentionKeys.value));

/** The worst state of anything that needs attention in each service, for its dot. */
const ownerTones = computed(() => {
  const tones: Record<string, 'crit' | 'warn' | 'info'> = {};
  const rank = { crit: 0, warn: 1, info: 2 };
  for (const item of attention.value) {
    for (const key of item.keys) {
      const ownerName = byKey.value.get(key)?.owner;
      if (!ownerName) continue;
      if (!tones[ownerName] || rank[item.tone] < rank[tones[ownerName]]) tones[ownerName] = item.tone;
    }
  }
  return tones;
});

const showNeeds = computed(() => !query.value && !pinned.value && attention.value.length > 0
  && (view.value === 'all' || view.value === 'attention') && owner.value == null);
const needsTone = computed(() => attention.value[0]?.tone ?? 'info');

const isCollapsed = (name: string) => owner.value == null && prefs.value.collapsed.includes(name);
const groupId = (name: string) => `ost-group-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;

// ───────────────────────────── the tiles ─────────────────────────────

const tiles = computed(() => {
  const all = settings.value;
  const mature = trackingMature(meta.value, now.value);
  const board = meta.value.source === 'board';
  const secretsAll = all.filter(x => x.sensitive);
  const unset = secretsAll.filter(x => !x.hasValue).length;
  const custom = all.filter(x => x.matchesDefault === false).length;
  const known = all.filter(x => x.matchesDefault != null).length;
  const recent = all.filter(x => inView('recent', x, ctx.value));
  const lastChange = [...all].filter(x => x.updatedAt != null).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
  const unread = all.filter(x => inView('unread', x, ctx.value)).length;
  const crit = attention.value.some(item => item.tone === 'crit');
  const warn = attention.value.some(item => item.tone === 'warn');
  const waiting = attention.value.filter(item => item.kind === 'awaiting').length;
  const started = meta.value.sessionStartedAt;

  return [
    { id: 'all' as ViewId, icon: 'settings', label: 'All', value: fmtInt(all.length), sub: `${groupsAll.value.length} services`, tone: undefined, title: 'Every setting' },
    {
      id: 'attention' as ViewId, icon: 'alert', label: 'Needs you', value: fmtInt(attention.value.length),
      sub: waiting ? `${waiting} service${waiting === 1 ? '' : 's'} waiting` : attention.value.length ? 'worth a look' : 'nothing',
      tone: crit ? 'crit' : warn ? 'warn' : attention.value.length ? 'info' : 'ok', title: 'Settings that need a value, a decision or a clean-up',
    },
    {
      id: 'custom' as ViewId, icon: 'edit', label: 'Custom', value: board ? fmtInt(custom) : '—',
      sub: board ? 'not the code default' : 'after the server update',
      tone: undefined,
      title: 'Stored values that differ from what the code now asks for. A changed default in code never replaces a stored value.'
        + (board && known < all.length ? ` Defaults are known for ${fmtInt(known)} of ${fmtInt(all.length)}: those a service has read since the restart.` : ''),
    },
    {
      id: 'recent' as ViewId, icon: 'history', label: `Changed in ${RECENT_DAYS} days`, value: board ? fmtInt(recent.length) : '—',
      sub: lastChange ? `last ${changedLabel(lastChange, now.value)}` : board ? 'nothing recorded yet' : 'after the server update',
      tone: undefined, title: 'Settings whose value changed recently, newest first',
    },
    { id: 'secrets' as ViewId, icon: 'lock', label: 'Secrets', value: fmtInt(secretsAll.length), sub: unset ? `${unset} not set` : 'all set', tone: undefined, title: 'Encrypted settings. Their values never reach this page.' },
    {
      id: 'unread' as ViewId, icon: 'eye', label: mature ? `Unread ${STALE_DAYS} days` : 'Not read yet', value: fmtInt(unread),
      sub: mature ? 'nothing asked for them' : started ? `since the restart ${fmtRelative(started, now.value)}` : 'since the restart',
      tone: undefined, title: mature ? `Settings no service has read in ${STALE_DAYS} days` : 'Settings no service has read since Omnipotent last started. Many are read only when a feature is used.',
    },
  ];
});

/** "6 secret settings in KliveLLM", "5 settings changed from their default": what the filters leave. */
const scopeText = computed(() => {
  if (view.value === 'all' && !owner.value && !pinned.value) return '';
  const count = visible.value.length;
  const noun = count === 1 ? 'setting' : 'settings';
  const phrase = ({
    all: noun,
    attention: `${noun} that need you`,
    custom: `${noun} changed from their default`,
    recent: `${noun} changed in the last ${RECENT_DAYS} days`,
    secrets: `secret ${noun}`,
    unread: trackingMature(meta.value, now.value) ? `${noun} unread for ${STALE_DAYS} days` : `${noun} not read since the restart`,
  } as Record<ViewId, string>)[view.value];
  return [`${fmtInt(count)} ${phrase}`, pinned.value ? `from “${pinned.value.label}”` : '', owner.value ? `in ${owner.value}` : ''].filter(Boolean).join(' ');
});

const emptyViewText = computed(() => ({
  attention: 'Nothing needs you',
  custom: 'Every setting read so far matches its code default',
  recent: `No changes recorded in the last ${RECENT_DAYS} days`,
  secrets: 'No secrets here',
  unread: 'Everything has been read',
  all: 'No settings here',
} as Record<ViewId, string>)[view.value]);

const freshness = computed(() => (loadedAt.value ? `read ${fmtRelative(loadedAt.value, now.value)}` : ''));

const draftNames = computed(() => [...Object.keys(drafts.value), ...Object.keys(secrets.value).filter(key => secrets.value[key])]
  .map(key => byKey.value.get(key)?.name).filter(Boolean).slice(0, 4).join(', '));

function setView(next: ViewId) {
  pinned.value = null;
  s.setView(view.value === next && next !== 'all' ? 'all' : next);
}

function selectOwner(next: string | null) {
  owner.value = next;
  void nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

function resetScope() {
  owner.value = null;
  pinned.value = null;
  s.setView('all');
}

function showKeys(item: AttentionItem) {
  query.value = '';
  owner.value = null;
  s.setView('all');
  pinned.value = { label: item.title, keys: new Set(item.keys) };
  void nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

function clearSearch() {
  query.value = '';
  searchInput.value?.focus();
}

// ───────────────────────────── rows ─────────────────────────────

const latest = (setting: Setting) => byKey.value.get(setting.key) ?? setting;

function rowBind(setting: Setting) {
  return {
    setting,
    draft: drafts.value[setting.key]?.text,
    secret: secrets.value[setting.key],
    state: rows.value[setting.key],
    canWrite: canWrite.value,
    meta: meta.value,
    now: now.value,
    words: words.value,
    view: view.value,
    flash: flashKey.value === setting.key,
  };
}

function rowOn(setting: Setting) {
  return {
    draft: (text: string) => s.setDraft(latest(setting), text),
    secret: (text: string) => s.setSecret(latest(setting), text),
    commit: () => { void s.commit(latest(setting)); },
    revert: () => s.revert(latest(setting)),
    toggle: () => s.toggle(latest(setting)),
    choose: (option: string) => s.choose(latest(setting), option),
    reset: () => s.resetToDefault(latest(setting)),
    remove: () => askRemove([setting.key], `Delete ${setting.name}?`),
    copy: () => { void s.copyName(setting); },
    'long-text': () => { textFor.value = latest(setting); },
    nav: (direction: 1 | -1) => moveFocus(direction),
  };
}

async function saveLongText(text: string) {
  const setting = textFor.value;
  if (!setting) return;
  s.setDraft(latest(setting), text);
  if (await s.commit(latest(setting))) textFor.value = null;
}

// ───────────────────────────── deleting ─────────────────────────────

const confirm = ref<{ title: string; targets: Setting[] } | null>(null);

function askRemove(keys: string[], title: string) {
  const targets = keys.map(key => byKey.value.get(key)).filter((x): x is Setting => !!x);
  if (targets.length) confirm.value = { title, targets };
}

async function confirmRemove() {
  if (!confirm.value) return;
  await s.remove(confirm.value.targets);
  confirm.value = null;
}

// ───────────────────────────── keyboard ─────────────────────────────

function rowElements(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.ost-content .ost-row')];
}

function focusRow(element: HTMLElement | undefined) {
  if (!element) return;
  const editor = element.querySelector<HTMLElement>('[data-editor]');
  (editor ?? element).focus({ preventScroll: true });
  if (editor instanceof HTMLInputElement && editor.type !== 'password' && !editor.readOnly) editor.select();
  element.scrollIntoView({ block: 'nearest' });
}

/** From whichever row has focus to the next or previous one on screen; up from the first goes to search. */
function moveFocus(direction: 1 | -1) {
  const all = rowElements();
  const current = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.ost-row');
  const index = current ? all.indexOf(current) : -1;
  const next = all[index + direction];
  if (next) focusRow(next);
  else if (direction === -1) searchInput.value?.focus();
}

function onSearchKey(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'Enter') {
    event.preventDefault();
    // Search results are one list; otherwise start at the first service, below "Needs you".
    focusRow(query.value ? rowElements()[0] : document.querySelector<HTMLElement>('.ost-group .ost-row') ?? rowElements()[0]);
  } else if (event.key === 'Escape') {
    if (query.value) { event.preventDefault(); query.value = ''; }
    else searchInput.value?.blur();
  }
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element?.tagName) return false;
  return element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
}

function onKeydown(event: KeyboardEvent) {
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchInput.value?.focus();
    searchInput.value?.select();
    return;
  }
  if (mod && event.key.toLowerCase() === 's') {
    event.preventDefault();
    if (draftCount.value && canWrite.value) void s.saveAll();
    return;
  }
  if (mod || event.altKey || textFor.value || confirm.value || isTyping(event.target)) return;
  if (event.key === '/') {
    event.preventDefault();
    searchInput.value?.focus();
  } else if (event.key.toLowerCase() === 'r') {
    void s.load({ quiet: true });
  }
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!draftCount.value) return;
  event.preventDefault();
  event.returnValue = '';
}

onBeforeRouteLeave(() => {
  if (!draftCount.value) return true;
  return window.confirm(`Leave with ${draftCount.value} unsaved change${draftCount.value === 1 ? '' : 's'}?`);
});

// ───────────────────────────── arriving ─────────────────────────────

/** `?q=` searches, `?service=` narrows, `?focus=Name` scrolls to one setting and lights it up. */
const focusName = typeof route.query.focus === 'string' ? route.query.focus : null;
if (typeof route.query.q === 'string') query.value = route.query.q;
if (typeof route.query.service === 'string') owner.value = route.query.service;

watch(() => settings.value.length, async (count, before) => {
  if (!focusName || !count || before) return;
  const target = settings.value.find(setting => setting.name.toLowerCase() === focusName.toLowerCase());
  if (!target) return;
  if (prefs.value.collapsed.includes(target.owner)) s.toggleCollapsed(target.owner);
  await nextTick();
  const element = rowElements().find(row => row.dataset.key === target.key && !row.closest('.ost-needs'));
  if (!element) return;
  element.scrollIntoView({ block: 'center' });
  focusRow(element);
  flashKey.value = target.key;
  window.setTimeout(() => { if (flashKey.value === target.key) flashKey.value = null; }, 2_000);
});

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', onBeforeUnload);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('beforeunload', onBeforeUnload);
});
</script>

<style lang="scss" src="~/assets/scss/admin-console.scss"></style>
<style lang="scss" src="~/assets/scss/settings-console.scss"></style>
