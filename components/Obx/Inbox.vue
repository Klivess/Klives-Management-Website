<template>
  <ul class="obx-inbox" data-testid="obx-inbox">
    <li v-for="item in shown" :key="item.id" class="obx-inbox__item" :data-testid="`inbox-${item.task?.Kind ?? 'attention'}`">
      <span class="obx-inbox__glyph" :data-tone="item.tone"><ObxIcon :name="item.icon" /></span>
      <div class="obx-inbox__main">
        <div class="obx-inbox__title">
          <span class="obx-chip" :data-tone="item.tone">{{ item.kind }}</span>
          <span>{{ item.title }}</span>
        </div>
        <div class="obx-inbox__meta">
          <NuxtLink v-if="item.gameId && showGame" :to="`/schemery/omniblox/game/${item.gameId}`">{{ gameTitle(item.gameId) }}</NuxtLink>
          <span v-if="item.since" class="obx-inbox__age" :data-tone="obxWaitTone(item.since, now)" :title="obxDateTime(item.since)">waiting {{ obxSpan(now - Date.parse(item.since)) }}</span>
        </div>
        <p v-if="expanded.has(item.id) || !long(item.detail)" class="obx-inbox__detail">{{ item.detail }}</p>
        <p v-else class="obx-inbox__detail obx-clamp2">{{ item.detail }}</p>
        <button v-if="long(item.detail)" class="obx-inbox__more" @click="toggle(item.id)">{{ expanded.has(item.id) ? 'Less' : 'Read all' }}</button>
      </div>
      <div class="obx-inbox__actions">
        <template v-for="action in item.actions" :key="action">
          <NuxtLink v-if="action === 'play' && item.gameId" class="obx-btn obx-btn--sm" :class="item.primary === action ? 'obx-btn--brand' : ''" :to="bloxPlayPath(item.gameId)"><ObxIcon name="play" />Play it</NuxtLink>
          <NuxtLink v-else-if="action === 'review-store' && item.gameId" class="obx-btn obx-btn--sm obx-btn--ghost" :to="`/schemery/omniblox/game/${item.gameId}?tab=store`">Review first</NuxtLink>
          <template v-else-if="action === 'download'">
            <button v-for="file in item.files" :key="file" class="obx-btn obx-btn--sm obx-btn--ghost" :disabled="busy === item.id" @click="download(item, file)"><ObxIcon name="download" />{{ file }}</button>
          </template>
          <button v-else class="obx-btn obx-btn--sm" :class="buttonClass(item, action)" :disabled="busy === item.id" :data-testid="`inbox-${action}`" @click="run(item, action)">{{ ACTION_LABEL[action] }}</button>
        </template>
      </div>
    </li>
    <li v-if="!items.length" class="obx-empty"><ObxIcon name="check-circle" /><span><b>Nothing waits for you.</b> Owner tasks and anything the studio flags show up here.</span></li>
  </ul>
  <button v-if="items.length > limit && !all" class="obx-btn obx-btn--ghost obx-btn--sm" style="margin: 0 14px 12px" @click="all = true">Show {{ items.length - limit }} more</button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { bloxDownload, bloxMediaPath, bloxPlayPath, bloxPost, type BloxGameSummary } from '~/composables/useOmniBlox';
import { obxConfirm, obxToast } from '~/composables/useObxConsole';
import { obxDateTime, obxSpan, obxWaitTone, type ObxInboxAction, type ObxInboxItem } from '~/scripts/omniblox/console';

/** What waits for the owner, each with the one or two things that settle it, right there. */
const props = withDefaults(defineProps<{ items: ObxInboxItem[]; games?: BloxGameSummary[]; now: number; limit?: number; showGame?: boolean }>(), {
  games: () => [], limit: 6, showGame: true,
});
const emit = defineEmits<{ changed: []; account: [] }>();

const ACTION_LABEL: Record<ObxInboxAction, string> = {
  'approve-build': 'Approve build', 'approve-launch': 'Approve launch', play: 'Play it', 'review-store': 'Review first',
  delegate: 'Do it yourself', done: 'Done', dismiss: 'Dismiss', download: 'Download', 'switch-studio': 'Switch on',
  'switch-harvester': 'Switch on', 'connect-roblox': 'Connect Roblox', 'open-account': 'Fix the account', 'open-game': 'Open',
};

const all = ref(false);
const shown = computed(() => (all.value ? props.items : props.items.slice(0, props.limit)));
const expanded = ref(new Set<string>());
const busy = ref<string | null>(null);

const long = (text: string) => text.length > 180 || text.split('\n').length > 2;
function toggle(id: string) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  expanded.value = next;
}
function gameTitle(id: string) { return props.games.find(g => g.GameId === id)?.Title ?? id; }

function buttonClass(item: ObxInboxItem, action: ObxInboxAction) {
  if (item.primary === action) return action.startsWith('approve') ? 'obx-btn--ok' : 'obx-btn--primary';
  return action === 'dismiss' || action === 'done' ? 'obx-btn--ghost' : '';
}

async function run(item: ObxInboxItem, action: ObxInboxAction) {
  if (action === 'open-account' || action === 'connect-roblox') { emit('account'); return; }
  busy.value = item.id;
  try {
    if (action === 'approve-build' || action === 'approve-launch') {
      if (!item.gameId) return;
      const gate = action === 'approve-build' ? 'build' : 'launch';
      if (gate === 'launch' && !await obxConfirm(`Approve the launch of ${gameTitle(item.gameId)}?`, 'The studio creates its products, puts up the store page and thumbnails, publishes this build and makes the game public on its next step.', 'Approve launch')) return;
      const result = await bloxPost('/omniblox/games/approve', { gameId: item.gameId, gate });
      if (!result.ok) obxToast('Could not approve', result.error ?? '', 'crit');
      else obxToast(gate === 'build' ? 'Build signed off' : 'Launch approved', gate === 'build' ? 'The marketer starts on the store page; the launch waits for your approval.' : 'The studio publishes it on its next step.');
    } else if (action === 'delegate' && item.task) {
      const result = await bloxPost<{ ok: boolean; message: string }>('/omniblox/tasks/delegate', { taskId: item.task.TaskId });
      if (!result.ok) obxToast('OmniBlox cannot take this one', result.error ?? '', 'warn');
      else obxToast('OmniBlox is on it', result.data?.message ?? '', 'info');
    } else if ((action === 'done' || action === 'dismiss') && item.task) {
      const result = await bloxPost('/omniblox/tasks/resolve', { taskId: item.task.TaskId, action: action === 'done' ? 'done' : 'dismiss' });
      if (!result.ok) obxToast('Could not update the task', result.error ?? '', 'crit');
    } else if (action === 'switch-harvester' || action === 'switch-studio') {
      const result = await bloxPost('/omniblox/studio/toggle', { [action === 'switch-studio' ? 'enabled' : 'harvester']: true });
      if (!result.ok) obxToast('Could not switch', result.error ?? '', 'crit');
    }
    emit('changed');
  } finally {
    busy.value = null;
  }
}

async function download(item: ObxInboxItem, file: string) {
  if (!item.gameId) return;
  const ok = await bloxDownload(bloxMediaPath(item.gameId, file), `${gameTitle(item.gameId).replace(/[^\w.-]+/g, '-')}-${file}`);
  if (!ok) obxToast('Download failed', `${file} is not available.`, 'crit');
}
</script>
