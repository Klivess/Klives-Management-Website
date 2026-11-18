<template>
  <section class="obx-card" :data-tone="game.Publish.OnOldAccount ? 'warn' : undefined" aria-label="Manage on Roblox" data-testid="obx-manage">
    <header class="obx-card__head">
      <h2 class="obx-card__title"><ObxIcon name="globe" />On Roblox</h2>
      <span class="obx-card__meta">{{ subtitle }}</span>
    </header>
    <div class="obx-card__body obx-stack" style="gap: 10px">
      <p v-if="game.Publish.OnOldAccount" class="obx-banner" data-tone="warn" role="status">
        <ObxIcon class="obx-banner__glyph" name="swap" />
        <span class="obx-banner__text"><span>This game's experience is on the Roblox account the studio switched away from. <b>Move it</b> to put it on the new account.</span></span>
      </p>

      <div class="obx-account__row" role="group" aria-label="Actions on Roblox">
        <button v-if="canSync" class="obx-btn obx-btn--sm" :disabled="busy" title="Products, the current build, the store page, the icon and the maturity questionnaire, all put on Roblox again" @click="run('sync')"><ObxIcon name="refresh" />Update</button>
        <button v-if="game.Slot && game.Publish.IsPublic" class="obx-btn obx-btn--sm" :disabled="busy" @click="run('private')"><ObxIcon name="lock" />Make private</button>
        <button v-if="game.Slot && !game.Publish.IsPublic && game.Publish.LastPublishedVersion != null" class="obx-btn obx-btn--sm" :disabled="busy" @click="run('public')"><ObxIcon name="globe" />Make public</button>
        <button v-if="canMove" class="obx-btn obx-btn--sm" :class="{ 'obx-btn--primary': game.Publish.OnOldAccount }" :disabled="busy" @click="moveOpen = true"><ObxIcon name="swap" />Move…</button>
        <button v-if="game.Slot" class="obx-btn obx-btn--sm obx-btn--danger" :disabled="busy" @click="takedownOpen = true"><ObxIcon name="trash" />Take down…</button>
        <a v-if="game.Slot && game.Publish.IsPublic" class="obx-btn obx-btn--sm obx-btn--ghost" :href="bloxRobloxGameUrl(game.Slot.PlaceId)" target="_blank" rel="noopener"><ObxIcon name="external" />Open</a>
      </div>

      <div v-if="action" class="obx-banner" :data-tone="action.Running ? 'info' : action.Ok ? 'ok' : 'crit'" :role="action.Running ? 'status' : undefined" aria-live="polite">
        <span class="obx-banner__glyph"><span v-if="action.Running" class="obx-dot" data-tone="info" data-pulse="true"></span><ObxIcon v-else :name="action.Ok ? 'check-circle' : 'octagon'" /></span>
        <span class="obx-banner__text">
          <strong>{{ action.Title }} <span class="obx-dim" style="font-weight: 400">· {{ action.Running ? 'running' : action.Ok ? 'done' : 'stopped' }} {{ obxAgo(action.FinishedUtc ?? action.StartedUtc, now) }}</span></strong>
          <span v-if="action.Message">{{ action.Message }}</span>
          <ol v-if="action.Steps.length" class="obx-list" style="list-style: decimal !important; margin-top: 4px"><li v-for="(s, i) in action.Steps" :key="i">{{ s }}</li></ol>
        </span>
      </div>
    </div>

    <ObxDialog :open="moveOpen" title="Move this game" sub="It is put on Roblox again in another experience, as it is now: build, store page and products." icon="swap" tone="info" @close="moveOpen = false">
      <p>The old experience is made private, its products come off sale, and the studio never uses it again.</p>
      <label class="obx-check"><input v-model="moveTarget" type="radio" value="new" /> A new experience on your connected Roblox account</label>
      <label class="obx-check"><input v-model="moveTarget" type="radio" value="mine" /> An experience of mine:</label>
      <input v-model="slotText" class="obx-input obx-mono" placeholder="universeId:placeId" aria-label="Experience as universeId:placeId" :disabled="moveTarget !== 'mine'" />
      <template #actions>
        <button class="obx-btn obx-btn--ghost" @click="moveOpen = false">Cancel</button>
        <button class="obx-btn obx-btn--primary" :disabled="busy || (moveTarget === 'mine' && !slotText.trim())" @click="move">Move it</button>
      </template>
    </ObxDialog>

    <ObxDialog :open="takedownOpen" title="Take the game down?" sub="Players lose it at once. Make it public again to bring it back." icon="alert" tone="crit" @close="takedownOpen = false">
      <p>The experience is made private and its products come off sale; maintenance stops.</p>
      <label class="obx-check"><input v-model="archive" type="checkbox" /> Also archive the experience on Roblox (Roblox's delete: restore it from the Creator Dashboard → Archived)</label>
      <template #actions>
        <button class="obx-btn obx-btn--ghost" @click="takedownOpen = false">Cancel</button>
        <button class="obx-btn obx-btn--danger" :disabled="busy" data-testid="obx-takedown" @click="takedown">{{ archive ? 'Take it down and archive it' : 'Take it down' }}</button>
      </template>
    </ObxDialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { bloxRobloxGameUrl, type BloxDossier, type BloxGameAction } from '~/composables/useOmniBlox';
import { obxPost } from '~/composables/useObxConsole';
import { obxAgo } from '~/scripts/omniblox/console';

/** The owner's actions on the game's place on Roblox: update, visibility, move, take down. */
const props = defineProps<{ game: BloxDossier; now: number }>();
const emit = defineEmits<{ changed: [] }>();

const busy = ref(false);
const moveOpen = ref(false);
const takedownOpen = ref(false);
const moveTarget = ref<'new' | 'mine'>('new');
const slotText = ref('');
const archive = ref(false);

const action = computed(() => props.game.OwnerAction ?? null);
const canSync = computed(() => !!props.game.Slot && props.game.Publish.LastPublishedVersion != null && ['Live', 'Sunset'].includes(props.game.Stage));
const canMove = computed(() => ['Launch', 'Live', 'Sunset'].includes(props.game.Stage) && (!!props.game.Slot || !!props.game.Publish.OnOldAccount));
const subtitle = computed(() => {
  const g = props.game;
  if (!g.Slot) return 'no experience yet';
  return `${g.Slot.UniverseId} · ${g.Publish.IsPublic ? 'public' : 'private'}${g.Publish.LastPublishedVersion != null ? ` · v${g.Publish.LastPublishedVersion}` : ''}`;
});

async function run(kind: BloxGameAction, extra: Record<string, unknown> = {}) {
  busy.value = true;
  try {
    const ok = await obxPost<{ ok: boolean; started: string }>('/omniblox/games/action', { gameId: props.game.GameId, action: kind, ...extra }, undefined, 'Not started');
    if (ok) { moveOpen.value = false; takedownOpen.value = false; emit('changed'); }
  } finally {
    busy.value = false;
  }
}
const move = () => run('move', { target: moveTarget.value === 'new' ? 'new' : slotText.value.trim() });
const takedown = () => run('takedown', { archive: archive.value });

// While an action runs, read the game every few seconds to follow its steps.
let timer: ReturnType<typeof setInterval> | null = null;
watch(() => action.value?.Running === true, running => {
  if (running && !timer) timer = setInterval(() => emit('changed'), 3000);
  else if (!running && timer) { clearInterval(timer); timer = null; }
}, { immediate: true });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>
