<template>
    <OmniTraderCard attention :title="title" :subtitle="subtitle" class="bx-gate">
        <template v-if="gates.Waiting === 'build'">
            <p class="lead">It passed its tests. Play it before anything is marketed: you are its first player. Approving lets the marketer start; nothing goes to Roblox until the launch approval after that.</p>
            <ul class="facts">
                <li><span class="k">Map</span>{{ game.Build.MapScore ?? '—' }}/100</li>
                <li v-if="engine"><span class="k">Roblox engine</span>{{ engine }}</li>
                <li v-if="economy"><span class="k">Economy</span>{{ economy }}</li>
                <li v-if="game.LastTest"><span class="k">Review</span>{{ game.LastTest.Summary }}</li>
            </ul>
            <div class="actions">
                <button v-if="playable" type="button" class="ot-btn primary sm" @click="emit('play')">▶ Play r{{ gates.Revision }}</button>
                <button type="button" class="ot-btn ghost sm" @click="emit('world')">Look at the world</button>
            </div>
        </template>
        <template v-else>
            <p class="lead">Ready to go public. Nothing happens on Roblox until you approve: then the studio creates the products, sets the store page and thumbnails, publishes and makes it public.</p>
            <dl class="ot-kv">
                <dt>Title</dt><dd>{{ game.Store.Title || '—' }}</dd>
                <dt>Description</dt><dd class="prose">{{ game.Store.Description || '—' }}</dd>
                <dt>Products</dt>
                <dd>
                    <ul v-if="game.Products.length" class="products">
                        <li v-for="p in game.Products" :key="p.Key">{{ p.Name }} · R$ {{ p.PriceRobux }} <span class="bx-muted">({{ p.Kind === 'GamePass' ? 'game pass' : 'product' }}, {{ p.Grant }})</span></li>
                    </ul>
                    <template v-else>none</template>
                </dd>
                <dt>Build</dt><dd>r{{ gates.Revision }}<template v-if="gates.SignoffRevision === gates.Revision && gates.SignoffUtc">, signed off {{ fmtRelative(gates.SignoffUtc, now) }}</template></dd>
            </dl>
            <div class="actions">
                <button type="button" class="ot-btn ghost sm" @click="emit('store')">Store page and art</button>
            </div>
        </template>

        <div v-if="canManage" class="decide">
            <button type="button" class="ot-btn primary sm" :disabled="busy" @click="approve">{{ gates.Waiting === 'build' ? 'Approve build' : 'Approve launch' }}</button>
            <button type="button" class="ot-btn sm" :aria-expanded="changing" @click="changing = !changing">Request changes</button>
        </div>
        <p v-else class="bx-muted none">The owner approves this, or asks for changes.</p>
        <form v-if="changing && canManage" class="compose" @submit.prevent="requestChanges">
            <textarea v-model="note" class="ot-input" rows="3" maxlength="2000" aria-label="What to change"
                      :placeholder="gates.Waiting === 'build' ? 'e.g. The first zone takes too long to finish, and the sell pad is hard to find from the spawn' : 'e.g. Make the VIP pass 99 R$ and lead the description with the lava'"></textarea>
            <label v-if="gates.Waiting === 'launch'" class="check"><input v-model="backToBuild" type="checkbox" /> The game itself needs work (back to Build)</label>
            <div class="row">
                <span class="bx-muted">{{ note.length }}/2000 · {{ toBuild ? 'the builder gets it and the game goes back to Build' : 'the marketer gets it' }}</span>
                <button class="ot-btn primary sm" :disabled="busy || !note.trim()">Send to the {{ toBuild ? 'builder' : 'marketer' }}</button>
            </div>
        </form>

        <details v-if="gates.History.length" class="history">
            <summary>Your earlier decisions ({{ gates.History.length }})</summary>
            <OmniBloxApprovalHistory :history="gates.History" />
        </details>
    </OmniTraderCard>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { fmtRelative, notify, useNow } from '~/composables/useOmniTumblr';
import { bloxPost, type BloxDossier, type BloxGates } from '~/composables/useOmniBlox';

const props = defineProps<{ game: BloxDossier; gates: BloxGates; playable?: boolean; canManage: boolean }>();
const emit = defineEmits<{ changed: []; play: []; world: []; store: [] }>();
const now = useNow();

const title = computed(() => props.gates.Waiting === 'build' ? `Play and sign off r${props.gates.Revision}` : 'Approve the launch');
const subtitle = computed(() => props.gates.Waiting === 'build'
    ? 'Gate 1 of 2: the build. A new revision needs a new sign-off.'
    : 'Gate 2 of 2: this build, store page and products. A change to any of them needs approving again.');

const engine = computed(() => {
    const run = props.game.Build.LastEngineRun;
    return run && run.Revision === props.gates.Revision ? run.Summary : null;
});
/** The economy bot's headline ("A player who plays well: first harvest 14 s, …"), for a simulator. */
const economy = computed(() => {
    const first = props.game.Build.Economy?.split('\n')[0]?.trim();
    return first ? first.replace(/^A player who plays well:\s*/, '') : null;
});

const busy = ref(false);
const changing = ref(false);
const note = ref('');
const backToBuild = ref(false);
const toBuild = computed(() => props.gates.Waiting === 'build' || backToBuild.value);

async function approve() {
    const gate = props.gates.Waiting;
    if (!gate) return;
    busy.value = true;
    try {
        const result = await bloxPost('/omniblox/games/approve', { gameId: props.game.GameId, gate });
        if (!result.ok) { notify('Could not approve', result.error ?? '', 'error'); return; }
        if (gate === 'build') notify('Build signed off', 'The marketer starts on the store page; the launch waits for your approval.');
        else notify('Launch approved', 'The studio publishes it on its next step.');
        emit('changed');
    } finally {
        busy.value = false;
    }
}

async function requestChanges() {
    const gate = props.gates.Waiting;
    const text = note.value.trim();
    if (!gate || !text) return;
    busy.value = true;
    try {
        const result = await bloxPost('/omniblox/games/reject', { gameId: props.game.GameId, gate, note: text, backToBuild: toBuild.value });
        if (!result.ok) { notify('Changes not sent', result.error ?? '', 'error'); return; }
        notify('Changes requested', toBuild.value ? 'The builder gets your note; the game is back in Build.' : 'The marketer gets your note.');
        note.value = '';
        changing.value = false;
        emit('changed');
    } finally {
        busy.value = false;
    }
}
</script>

<style scoped>
.lead { margin: 0 0 var(--ot-space-3); font-size: 13px; line-height: 19px; }
.facts { list-style: none; margin: 0 0 var(--ot-space-3); padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; line-height: 18px; }
.facts .k { display: inline-block; min-width: 104px; color: var(--ot-muted); }
.products { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.prose { white-space: pre-wrap; overflow-wrap: anywhere; }
.actions, .decide { display: flex; gap: 6px; flex-wrap: wrap; }
.actions { margin-bottom: var(--ot-space-3); }
.decide { padding-top: var(--ot-space-3); border-top: 1px solid var(--ot-line); }
.compose { display: flex; flex-direction: column; gap: var(--ot-space-2); margin-top: var(--ot-space-3); }
.compose .row { display: flex; align-items: center; justify-content: space-between; gap: var(--ot-space-2); flex-wrap: wrap; font-size: 11.5px; }
.check { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ot-text-2); }
.none { margin: var(--ot-space-3) 0 0; font-size: 12px; }
.history { margin-top: var(--ot-space-3); font-size: 12px; }
.history summary { cursor: pointer; color: var(--ot-text-2); }
</style>
