<template>
    <OmniTraderCard title="Manage on Roblox" :subtitle="subtitle" :attention="!!game.Publish.OnOldAccount">
        <p v-if="game.Publish.OnOldAccount" class="old" role="status">
            This game's experience is on the Roblox account the studio switched away from. <strong>Move it</strong> to put it on the new account.
        </p>

        <div class="buttons" role="group" aria-label="Actions on Roblox">
            <button v-if="canSync" class="ot-btn sm" :disabled="busy" title="Products, the current build, the store page, the icon and the maturity questionnaire, all put on Roblox again"
                    @click="run('sync')">Update on Roblox</button>
            <button v-if="game.Slot && game.Publish.IsPublic" class="ot-btn sm" :disabled="busy" @click="run('private')">Make private</button>
            <button v-if="game.Slot && !game.Publish.IsPublic && game.Publish.LastPublishedVersion != null" class="ot-btn sm" :disabled="busy" @click="run('public')">Make public</button>
            <button v-if="canMove" class="ot-btn sm" :class="{ primary: game.Publish.OnOldAccount }" :aria-expanded="panel === 'move'" :disabled="busy" @click="toggle('move')">Move…</button>
            <button v-if="game.Slot" class="ot-btn danger sm" :aria-expanded="panel === 'takedown'" :disabled="busy" @click="toggle('takedown')">Take down…</button>
        </div>

        <form v-if="panel === 'move'" class="panel" @submit.prevent="move">
            <p>The game is put on Roblox again in another experience, as it is now: its build, store page and products. The old experience is made private, its products come off sale, and the studio never uses it again.</p>
            <label class="choice"><input v-model="moveTarget" type="radio" value="new" /> A new experience on your connected Roblox account</label>
            <label class="choice">
                <input v-model="moveTarget" type="radio" value="mine" /> An experience of mine:
                <input v-model="slotText" class="ot-input mono slot" placeholder="universeId:placeId" aria-label="Experience as universeId:placeId" :disabled="moveTarget !== 'mine'" />
            </label>
            <div class="row">
                <button class="ot-btn primary sm" :disabled="busy || moveTarget === 'mine' && !slotText.trim()">Move it</button>
                <button type="button" class="ot-btn ghost sm" @click="panel = null">Cancel</button>
            </div>
        </form>

        <form v-if="panel === 'takedown'" class="panel" @submit.prevent="takedown">
            <p>The experience is made private and its products come off sale; maintenance stops. Make it public again to bring it back.</p>
            <label class="choice"><input v-model="archive" type="checkbox" /> Also archive the experience on Roblox (Roblox's delete: it leaves your creations; restore it from the Creator Dashboard → Archived)</label>
            <div class="row">
                <button class="ot-btn danger sm" :disabled="busy">{{ archive ? 'Take it down and archive it' : 'Take it down' }}</button>
                <button type="button" class="ot-btn ghost sm" @click="panel = null">Cancel</button>
            </div>
        </form>

        <div v-if="action" class="action" :class="action.Running ? 'running' : action.Ok ? 'ok' : 'bad'" :role="action.Running ? 'status' : undefined" aria-live="polite">
            <div class="head">
                <span v-if="action.Running" class="pulse" aria-hidden="true"></span>
                <span v-else class="ot-chip" :class="action.Ok ? 'ok' : 'bad'">{{ action.Ok ? 'Done' : 'Stopped' }}</span>
                <strong>{{ action.Title }}</strong>
                <span class="bx-muted">{{ fmtRelative(action.FinishedUtc ?? action.StartedUtc, now) }}</span>
            </div>
            <p v-if="action.Message" class="message">{{ action.Message }}</p>
            <ol v-if="action.Steps.length" class="steps">
                <li v-for="(s, i) in action.Steps" :key="i">{{ s }}</li>
            </ol>
        </div>
    </OmniTraderCard>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { confirmAction, fmtRelative, notify, useNow } from '~/composables/useOmniTumblr';
import { bloxPost, type BloxDossier, type BloxGameAction } from '~/composables/useOmniBlox';

const props = defineProps<{ game: BloxDossier }>();
const emit = defineEmits<{ changed: [] }>();
const now = useNow();

const busy = ref(false);
const panel = ref<'move' | 'takedown' | null>(null);
const moveTarget = ref<'new' | 'mine'>('new');
const slotText = ref('');
const archive = ref(false);

const action = computed(() => props.game.OwnerAction ?? null);
const canSync = computed(() => !!props.game.Slot && props.game.Publish.LastPublishedVersion != null && ['Live', 'Sunset'].includes(props.game.Stage));
const canMove = computed(() => ['Launch', 'Live', 'Sunset'].includes(props.game.Stage) && (!!props.game.Slot || props.game.Publish.OnOldAccount));
const subtitle = computed(() => {
    const g = props.game;
    if (!g.Slot) return 'No experience yet';
    return `Experience ${g.Slot.UniverseId} · ${g.Publish.IsPublic ? 'public' : 'private'}${g.Publish.LastPublishedVersion != null ? ` · version ${g.Publish.LastPublishedVersion}` : ''}`;
});

function toggle(which: 'move' | 'takedown') {
    panel.value = panel.value === which ? null : which;
}

async function run(kind: BloxGameAction, extra: Record<string, unknown> = {}) {
    busy.value = true;
    try {
        const result = await bloxPost<{ ok: boolean; started: string }>('/omniblox/games/action', { gameId: props.game.GameId, action: kind, ...extra });
        if (!result.ok) { notify('Not started', result.error ?? '', 'warning'); return; }
        panel.value = null;
        emit('changed');
    } finally {
        busy.value = false;
    }
}

async function move() {
    const target = moveTarget.value === 'new' ? 'new' : slotText.value.trim();
    if (!await confirmAction('Move this game?', moveTarget.value === 'new'
        ? 'The studio creates a new experience on your connected Roblox account and relaunches the game there. The old experience is made private and never used again.'
        : `The game is relaunched in experience ${target}. The old experience is made private and never used again.`, 'Move it')) return;
    await run('move', { target });
}

async function takedown() {
    if (!await confirmAction(archive.value ? 'Take the game down and archive it?' : 'Take the game down?',
        archive.value ? 'Players lose it at once, and the experience is archived on Roblox (restore it from the Creator Dashboard).' : 'Players lose it at once; you can make it public again later.',
        'Take it down', true)) return;
    await run('takedown', { archive: archive.value });
}

// While an action runs, refresh the game every few seconds to follow its steps.
let timer: ReturnType<typeof setInterval> | null = null;
watch(() => action.value?.Running === true, running => {
    if (running && !timer) timer = setInterval(() => emit('changed'), 3000);
    else if (!running && timer) { clearInterval(timer); timer = null; }
}, { immediate: true });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
.old { margin: 0 0 var(--ot-space-3); font-size: 12.5px; line-height: 18px; color: var(--ot-warning); }
.buttons { display: flex; gap: var(--ot-space-2); flex-wrap: wrap; }
.panel { margin-top: var(--ot-space-3); padding: var(--ot-space-3); border-radius: var(--ot-radius-sm); background: var(--ot-surface-2); display: flex; flex-direction: column; gap: var(--ot-space-2); font-size: 12.5px; }
.panel p { margin: 0; line-height: 18px; color: var(--ot-text-2); }
.choice { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; line-height: 18px; }
.slot { width: 220px; max-width: 100%; }
.mono { font-family: var(--ot-mono); }
.row { display: flex; gap: var(--ot-space-2); flex-wrap: wrap; }
.action { margin-top: var(--ot-space-3); padding-top: var(--ot-space-3); border-top: 1px solid var(--ot-line); font-size: 12.5px; }
.action .head { display: flex; align-items: center; gap: var(--ot-space-2); flex-wrap: wrap; }
.action .message { margin: 6px 0 0; line-height: 18px; overflow-wrap: anywhere; }
.action.bad .message { color: #ffc9c9; }
.steps { margin: 6px 0 0; padding-left: 20px; font-size: 12px; line-height: 18px; color: var(--ot-text-2); }
.pulse { flex: 0 0 8px; height: 8px; border-radius: 50%; background: var(--ot-accent); animation: bx-pulse 1.4s ease-in-out infinite; }
@keyframes bx-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.75); } }
@media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
</style>
