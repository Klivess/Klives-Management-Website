<template>
    <OmniTraderCard title="Your directions" subtitle="A running cycle gets a new one at its next turn; open ones lead every briefing until an agent reports them done">
        <form v-if="canAct && active" class="compose" @submit.prevent="send">
            <textarea v-model="note" class="ot-input" rows="3" maxlength="2000" aria-label="New direction"
                      placeholder="e.g. Make the map twice as big with a snowy zone behind a gate, and give the first quest a guide line to the nearest tree"></textarea>
            <div class="row">
                <span class="bx-muted">{{ note.length }}/2000</span>
                <button class="ot-btn primary sm" :disabled="busy || !note.trim()">Send direction</button>
            </div>
        </form>
        <ul v-if="ordered.length" class="list">
            <li v-for="d in ordered" :key="d.DirectiveId" :class="d.Status.toLowerCase()">
                <div class="top">
                    <span class="ot-chip" :class="tone(d)">{{ label(d) }}</span>
                    <span class="id">{{ d.DirectiveId }}</span>
                    <time class="when" :datetime="d.Utc">{{ fmtRelative(d.Utc, now) }}</time>
                    <template v-if="canAct">
                        <button v-if="d.Status === 'Open'" type="button" class="ot-btn ghost xs" :disabled="busy" @click="act(d, 'drop')">Drop</button>
                        <button v-else type="button" class="ot-btn ghost xs" :disabled="busy" @click="act(d, 'reopen')">Reopen</button>
                    </template>
                </div>
                <p class="text">{{ d.Text }}</p>
                <p v-if="d.Response" class="response"><span class="bx-muted">Done:</span> {{ d.Response }}</p>
            </li>
        </ul>
        <p v-else-if="!(canAct && active)" class="bx-muted none">No directions given.</p>
    </OmniTraderCard>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { fmtRelative, notify, useNow } from '~/composables/useOmniTumblr';
import { bloxPost, type BloxDirective, type BloxDossier } from '~/composables/useOmniBlox';

const props = defineProps<{ game: BloxDossier; canAct: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const now = useNow();

const active = computed(() => !['Sunset', 'Abandoned'].includes(props.game.Stage));
const order = { Open: 0, Done: 1, Dropped: 2 } as const;
const ordered = computed(() => (props.game.Directives ?? []).slice()
    .sort((a, b) => order[a.Status] - order[b.Status] || b.Utc.localeCompare(a.Utc)));

const label = (d: BloxDirective) => d.Status === 'Open' ? (d.Delivered ? 'Open · delivered' : 'Open · next cycle') : d.Status;
const tone = (d: BloxDirective) => d.Status === 'Open' ? 'info' : d.Status === 'Done' ? 'ok' : '';

const note = ref('');
const busy = ref(false);

async function send() {
    const text = note.value.trim();
    if (!text) return;
    busy.value = true;
    try {
        const result = await bloxPost<{ ok: boolean; directiveId: string; resumed: boolean }>('/omniblox/games/steer', { gameId: props.game.GameId, note: text });
        if (!result.ok) { notify('Direction not sent', result.error ?? '', 'error'); return; }
        notify(result.data?.resumed ? 'Direction sent; the game is running again' : 'Direction sent');
        note.value = '';
        emit('changed');
    } finally {
        busy.value = false;
    }
}

async function act(d: BloxDirective, action: 'drop' | 'reopen') {
    busy.value = true;
    try {
        const result = await bloxPost('/omniblox/games/directive', { gameId: props.game.GameId, directiveId: d.DirectiveId, action });
        if (!result.ok) notify('That did not work', result.error ?? '', 'error');
        emit('changed');
    } finally {
        busy.value = false;
    }
}
</script>

<style scoped>
.compose { display: flex; flex-direction: column; gap: var(--ot-space-2); margin-bottom: var(--ot-space-3); }
.compose .row { display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.list li { padding: var(--ot-space-2) 0; display: flex; flex-direction: column; gap: 4px; }
.list li + li { border-top: 1px solid var(--ot-line); }
.list li.dropped { opacity: 0.6; }
.top { display: flex; align-items: center; gap: var(--ot-space-2); font-size: 11.5px; }
.id { font-family: var(--ot-mono); color: var(--ot-muted); }
.when { margin-left: auto; color: var(--ot-muted); font-size: 11px; }
.text { margin: 0; font-size: 12.5px; line-height: 18px; white-space: pre-wrap; overflow-wrap: anywhere; }
.response { margin: 0; font-size: 12px; line-height: 17px; color: var(--ot-text-2); }
.none { margin: 0; font-size: 12px; }
.ot-btn.xs { padding: 2px 8px; font-size: 11px; }
</style>
