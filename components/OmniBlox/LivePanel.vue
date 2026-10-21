<template>
    <OmniTraderCard :title="live?.Running ? 'Working now' : 'Last cycle'" :subtitle="subtitle" class="bx-live" :class="{ running: live?.Running }">
        <template #controls>
            <span v-if="live?.Running" class="ot-chip info"><span class="pulse" aria-hidden="true"></span>{{ live.Status }}</span>
            <span v-else-if="live?.Outcome" class="ot-chip" :class="live.Outcome === 'finished' ? 'ok' : 'warn'">{{ live.Outcome }}</span>
        </template>
        <template v-if="live">
            <dl class="stats">
                <div><dt>Role</dt><dd>{{ live.Role }}</dd></div>
                <div><dt>Stage</dt><dd>{{ live.Stage }}</dd></div>
                <div><dt>Turns</dt><dd>{{ live.Turns }}</dd></div>
                <div><dt>Tool calls</dt><dd>{{ live.ToolCalls }}<span v-if="live.ToolErrors" class="bad"> · {{ live.ToolErrors }} failed</span></dd></div>
                <div><dt>Context</dt><dd>{{ bloxTokens(live.ContextTokens) }} tokens</dd></div>
                <div><dt>Cache</dt><dd>{{ bloxPct(live.PromptTokens ? live.CachedTokens / live.PromptTokens : null) }}</dd></div>
            </dl>
            <div class="feed">
                <OmniBloxCycleEntries :game-id="gameId" :cycle-id="live.CycleId" :entries="live.Entries" newest-first :limit="14" label="What the agent did, newest first" />
            </div>
        </template>
        <OmniTraderStateBlock v-else title="Nothing has run since the server started" detail="Each cycle shows here step by step while it runs: what the agent says, every tool it calls and what came back, and the pictures it looked at." />
    </OmniTraderCard>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { fmtRelative, useNow } from '~/composables/useOmniTumblr';
import { bloxGet, bloxPct, bloxTokens, type BloxLiveCycle } from '~/composables/useOmniBlox';

const props = defineProps<{ gameId: string; initial: BloxLiveCycle | null }>();
const emit = defineEmits<{ finished: [] }>();
const now = useNow();

const live = ref<BloxLiveCycle | null>(props.initial);
watch(() => props.initial, value => {
    // The page's slower poll: take it unless ours is newer.
    if (!value || !live.value || value.CycleId !== live.value.CycleId || value.LastUtc >= live.value.LastUtc) live.value = value;
});

const subtitle = computed(() => {
    const l = live.value;
    if (!l) return 'What the agents are doing';
    const started = fmtRelative(l.StartedUtc, now.value);
    return l.Running ? `${l.Role} cycle started ${started}` : `${l.Role} cycle, ended ${fmtRelative(l.LastUtc, now.value)}`;
});

// While a cycle runs, follow it closely (every 4 s, only while the page is visible).
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

<style scoped>
.bx-live.running { border-color: color-mix(in srgb, var(--ot-accent) 45%, var(--ot-line)); }
.stats { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0 0 var(--ot-space-3); font-size: 12px; }
.stats dt { font-size: 10.5px; color: var(--ot-muted); }
.stats dd { margin: 0; font-family: var(--ot-mono); }
.stats .bad { color: var(--ot-negative); }
/* The newest steps stay in view without pushing the rest of the page down. */
.feed { max-height: 560px; overflow-y: auto; overscroll-behavior: contain; padding-right: 4px; }
.pulse { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: currentColor; margin-right: 6px; animation: bx-pulse 1.4s ease-in-out infinite; }
@keyframes bx-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
@media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
</style>
