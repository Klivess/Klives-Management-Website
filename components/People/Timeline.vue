<template>
  <div class="pfx-tl" :data-testid="testid">
    <template v-for="day in days" :key="day.label">
      <div class="pfx-tl__day">{{ day.label }}</div>
      <div
        v-for="item in day.items"
        :key="keyOf(item)"
        class="pfx-tl__item"
        :data-type="item.type"
        :data-denied="!!item.denyReason || undefined"
        :data-fresh="freshKeys?.has(keyOf(item)) || undefined"
      >
        <time class="pfx-tl__time" :datetime="new Date(item.tsMs).toISOString()" :title="new Date(item.tsMs).toLocaleString()">{{ clock(item.tsMs) }}</time>
        <span class="pfx-tl__glyph" :data-tone="toneOf(item)"><PeopleIcon :name="iconOf(item)" /></span>

        <div v-if="item.type === 'request'" style="min-width: 0">
          <div class="pfx-tl__line">
            <span class="pfx-tl__method" :data-method="item.method || 'GET'">{{ item.method || 'GET' }}</span>
            <code :title="item.route ?? ''">{{ item.route }}</code>
            <span class="pfx-tl__status" :data-tone="statusTone(item.status)">{{ item.status }}</span>
          </div>
          <div class="pfx-tl__meta">
            <span v-if="item.denyReason" class="pfx-tl__deny">refused · {{ denyReasonText(item.denyReason) }}</span>
            <span v-if="item.permKey" :title="item.permKey">{{ titleOf(item.permKey) }}</span>
            <span v-if="item.durationMs != null">{{ Math.round(item.durationMs) }} ms</span>
            <span v-if="item.viaBatch">batch</span>
            <span v-if="item.page" :title="item.page">on {{ item.page }}</span>
            <span v-if="!item.sessionId" title="Signed with the password, not a session">password</span>
            <span v-if="showIp && item.ip" class="pfx-mono">{{ item.ip }}</span>
          </div>
        </div>

        <div v-else-if="item.type === 'page'" style="min-width: 0">
          <div class="pfx-tl__line"><span class="pfx-truncate">Viewed <b style="font-weight: 600">{{ item.title || item.page }}</b></span></div>
          <div class="pfx-tl__meta">
            <code v-if="item.title" class="pfx-tl__route">{{ item.page }}</code>
            <span v-if="item.dwellMs">for {{ durationShort(item.dwellMs) }}</span>
          </div>
        </div>

        <div v-else style="min-width: 0">
          <div class="pfx-tl__line">
            <b style="font-weight: 600">{{ eventMeta(item.kind).label }}</b>
            <span v-if="eventDetail(item)" class="pfx-dim pfx-truncate">{{ eventDetail(item) }}</span>
          </div>
          <div class="pfx-tl__meta">
            <span v-if="item.actorName && item.actorId !== profileId">by {{ item.actorName }}</span>
            <span v-if="showIp && item.ip" class="pfx-mono">{{ item.ip }}</span>
          </div>
        </div>
      </div>
    </template>

    <div v-if="loading && !items.length" style="display: flex; flex-direction: column; gap: 6px; padding-top: 6px">
      <span v-for="n in 4" :key="n" class="pfx-skel" style="height: 26px"></span>
    </div>
    <div v-else-if="!items.length" class="pfx-empty">
      <PeopleIcon name="history" />{{ filtered ? 'Nothing matches these filters.' : emptyText }}
    </div>
    <div v-if="hasMore" class="pfx-tl__more">
      <button type="button" class="pfx-btn pfx-btn--sm pfx-btn--ghost" :disabled="loading" @click="emit('more')">
        <PeopleIcon :name="loading ? 'refresh' : 'chevron-down'" :class="{ 'pfx-spin': loading }" />Load older
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TimelineItem } from '~/scripts/profilesApi';
import { denyReasonText, durationShort, eventDetail, eventMeta } from '~/scripts/profileFormat';

/** What a profile did, newest first, grouped by day: requests, page visits, sign-ins and access changes. */
const props = withDefaults(defineProps<{
  items: TimelineItem[];
  loading?: boolean;
  hasMore?: boolean;
  filtered?: boolean;
  profileId?: string;
  showIp?: boolean;
  freshKeys?: Set<string> | null;
  titleOf?: (key: string) => string;
  emptyText?: string;
  testid?: string;
}>(), { loading: false, hasMore: false, filtered: false, profileId: '', showIp: true, freshKeys: null, titleOf: (k: string) => k, emptyText: 'No activity on record.', testid: undefined });
const emit = defineEmits<{ more: [] }>();

function keyOf(item: TimelineItem) {
  return `${item.type}:${item.tsMs}:${item.route ?? item.kind ?? item.page ?? ''}:${item.status ?? ''}`;
}

const days = computed(() => {
  const groups: { label: string; items: TimelineItem[] }[] = [];
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  for (const item of props.items) {
    const d = new Date(item.tsMs);
    const key = d.toDateString();
    const label = key === today ? 'Today' : key === yesterday ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
});

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function statusTone(status: number | null | undefined) {
  if (!status) return undefined;
  if (status === 401 || status === 403) return 'crit';
  if (status >= 500) return 'crit';
  if (status >= 400) return 'warn';
  return undefined;
}

function toneOf(item: TimelineItem) {
  if (item.type === 'request') return item.denyReason || (item.status ?? 0) >= 500 ? 'crit' : 'neutral';
  if (item.type === 'page') return 'info';
  const tone = eventMeta(item.kind).tone;
  return tone === 'bad' ? 'crit' : tone === 'violet' ? 'violet' : tone || 'neutral';
}

function iconOf(item: TimelineItem) {
  if (item.type === 'page') return 'eye';
  if (item.type === 'request') return item.denyReason ? 'ban' : 'route';
  const kind = item.kind ?? '';
  if (kind.startsWith('login')) return kind === 'login.refused' ? 'ban' : 'signout';
  if (kind === 'logout' || kind.startsWith('session')) return 'signout';
  if (kind.startsWith('password')) return 'key';
  if (kind === 'access.permissions') return 'layers';
  if (kind.startsWith('access.suspend') || kind === 'access.unsuspended') return 'pause';
  if (kind.includes('read-only')) return 'eye';
  if (kind.includes('login')) return 'power';
  if (kind.startsWith('profile')) return 'user';
  return 'info';
}
</script>
