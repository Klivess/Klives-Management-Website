<template>
  <section ref="root" class="obx-card" :data-flash="flash || undefined" aria-label="Your directions" data-testid="obx-directions">
    <header class="obx-card__head">
      <h2 class="obx-card__title"><ObxIcon name="steer" />Steer</h2>
      <span class="obx-card__meta">{{ openCount ? `${openCount} open` : 'directions lead every briefing' }}</span>
    </header>
    <div class="obx-card__body obx-stack" style="gap: 10px">
      <form v-if="canAct && active" class="obx-stack" style="gap: 6px" @submit.prevent="send">
        <textarea ref="box" v-model="note" class="obx-textarea" rows="3" maxlength="2000" aria-label="New direction"
                  placeholder="e.g. Make the map twice as big with a snowy zone behind a gate" @keydown.ctrl.enter.prevent="send" @keydown.meta.enter.prevent="send"></textarea>
        <div class="obx-account__row" style="justify-content: space-between">
          <span class="obx-faint" style="font-size: 11px">{{ note.length }}/2000 · Ctrl+Enter sends · a running cycle gets it at its next turn</span>
          <button class="obx-btn obx-btn--sm obx-btn--primary" :disabled="busy || !note.trim()" data-testid="obx-steer-send"><ObxIcon name="send" />Send</button>
        </div>
      </form>
      <ul v-if="ordered.length" class="obx-stack" style="gap: 0">
        <li v-for="d in ordered" :key="d.DirectiveId" class="obx-lesson" style="padding: 8px 0" :style="{ opacity: d.Status === 'Dropped' ? 0.6 : 1 }">
          <div class="obx-lesson__top">
            <span class="obx-chip" :data-tone="d.Status === 'Open' ? 'info' : d.Status === 'Done' ? 'ok' : 'neutral'">{{ d.Status === 'Open' ? (d.Delivered ? 'Open · delivered' : 'Open · next cycle') : d.Status }}</span>
            <span class="obx-mono obx-faint">{{ d.DirectiveId }}</span>
            <span style="margin-left: auto">{{ obxAgo(d.Utc, now) }}</span>
            <template v-if="canAct">
              <button v-if="d.Status === 'Open'" class="obx-btn obx-btn--xs obx-btn--ghost" :disabled="busy" @click="act(d.DirectiveId, 'drop')">Drop</button>
              <button v-else class="obx-btn obx-btn--xs obx-btn--ghost" :disabled="busy" @click="act(d.DirectiveId, 'reopen')">Reopen</button>
            </template>
          </div>
          <p class="obx-prose" style="font-size: 12.5px">{{ d.Text }}</p>
          <p v-if="d.Response" class="obx-dim" style="font-size: 12px"><b class="obx-ink2">Done:</b> {{ d.Response }}</p>
        </li>
      </ul>
      <p v-else-if="!(canAct && active)" class="obx-dim">No directions given.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { BloxDossier } from '~/composables/useOmniBlox';
import { obxPost } from '~/composables/useObxConsole';
import { obxAgo } from '~/scripts/omniblox/console';

/** The owner's directions: delivered to a running cycle, at the top of every briefing until an agent reports them done. */
const props = defineProps<{ game: BloxDossier; canAct: boolean; now: number }>();
const emit = defineEmits<{ changed: [] }>();

const root = ref<HTMLElement | null>(null);
const box = ref<HTMLTextAreaElement | null>(null);
const flash = ref(false);
const note = ref('');
const busy = ref(false);

const active = computed(() => !['Sunset', 'Abandoned'].includes(props.game.Stage));
const ORDER = { Open: 0, Done: 1, Dropped: 2 } as const;
const ordered = computed(() => (props.game.Directives ?? []).slice().sort((a, b) => ORDER[a.Status] - ORDER[b.Status] || b.Utc.localeCompare(a.Utc)));
const openCount = computed(() => ordered.value.filter(d => d.Status === 'Open').length);

async function send() {
  const text = note.value.trim();
  if (!text || busy.value) return;
  busy.value = true;
  try {
    const result = await obxPost<{ ok: boolean; directiveId: string; resumed: boolean }>('/omniblox/games/steer', { gameId: props.game.GameId, note: text }, undefined, 'Direction not sent');
    if (!result) return;
    note.value = '';
    emit('changed');
  } finally {
    busy.value = false;
  }
}

async function act(directiveId: string, action: 'drop' | 'reopen') {
  busy.value = true;
  try {
    if (await obxPost('/omniblox/games/directive', { gameId: props.game.GameId, directiveId, action })) emit('changed');
  } finally {
    busy.value = false;
  }
}

/** Brings the box into view and focuses it (the header's Steer, or S). */
async function focus() {
  root.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  flash.value = false;
  requestAnimationFrame(() => { flash.value = true; });
  setTimeout(() => { flash.value = false; }, 1500);
  await nextTick();
  box.value?.focus();
}
defineExpose({ focus });
</script>
