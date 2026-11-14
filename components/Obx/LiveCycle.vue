<template>
  <section class="obx-card" :data-tone="live?.Running ? 'info' : undefined" aria-label="The agent's cycle" data-testid="obx-live-cycle">
    <header class="obx-card__head">
      <h2 class="obx-card__title"><ObxIcon name="activity" />{{ live?.Running ? 'Working now' : 'Last cycle' }}</h2>
      <span v-if="live?.Running" class="obx-chip" data-tone="info"><span class="obx-dot" data-tone="info" data-pulse="true"></span>{{ live.Status }}</span>
      <span v-else-if="live?.Outcome" class="obx-chip" :data-tone="live.Outcome === 'finished' ? 'ok' : 'warn'">{{ live.Outcome }}</span>
      <span class="obx-card__meta">{{ subtitle }}</span>
    </header>
    <div class="obx-card__body">
      <template v-if="live">
        <div class="obx-stats" style="margin-bottom: 8px">
          <span><b>{{ live.Role }}</b> · {{ live.Stage }}</span>
          <span><b>{{ live.Turns }}</b> turns</span>
          <span><b>{{ live.ToolCalls }}</b> calls<template v-if="live.ToolErrors"> · <b style="color: var(--obx-crit)">{{ live.ToolErrors }}</b> failed</template></span>
          <span><b>{{ obxCount(live.ContextTokens) }}</b> context</span>
          <span>cache <b>{{ obxPct(live.PromptTokens ? live.CachedTokens / live.PromptTokens : null) }}</b></span>
        </div>
        <div style="max-height: 520px; overflow-y: auto; overscroll-behavior: contain; padding-right: 4px">
          <ObxSteps :game-id="gameId" :cycle-id="live.CycleId" :entries="live.Entries" newest-first :limit="14" label="What the agent did, newest first" />
        </div>
      </template>
      <div v-else class="obx-empty"><ObxIcon name="clock" /><span>Nothing has run since the server started. Each cycle shows here step by step while it runs.</span></div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { bloxGet, type BloxLiveCycle } from '~/composables/useOmniBlox';
import { obxAgo, obxCount, obxPct } from '~/scripts/omniblox/console';

/** The cycle running now, followed every 4 s while it runs and the tab is visible. */
const props = defineProps<{ gameId: string; initial: BloxLiveCycle | null; now: number }>();
const emit = defineEmits<{ finished: [] }>();

const live = ref<BloxLiveCycle | null>(props.initial);
watch(() => props.initial, value => {
  // The page's slower read: take it unless ours is newer.
  if (!value || !live.value || value.CycleId !== live.value.CycleId || value.LastUtc >= live.value.LastUtc) live.value = value;
});

const subtitle = computed(() => {
  const l = live.value;
  if (!l) return '';
  return l.Running ? `started ${obxAgo(l.StartedUtc, props.now)}` : `ended ${obxAgo(l.LastUtc, props.now)}`;
});

let timer: ReturnType<typeof setInterval> | null = null;
async function tick() {
  if (!live.value?.Running || document.visibilityState !== 'visible') return;
  const result = await bloxGet<{ Live: BloxLiveCycle | null }>(`/omniblox/game/live?id=${encodeURIComponent(props.gameId)}`);
  if (!result.ok || !result.data) return;
  const wasRunning = live.value?.Running;
  live.value = result.data.Live;
  if (wasRunning && !live.value?.Running) emit('finished');
}
onMounted(() => { timer = setInterval(tick, 4000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>
