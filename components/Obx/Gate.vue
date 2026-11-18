<template>
  <section class="obx-card" data-tone="brick" aria-label="Your approval" data-testid="obx-gate">
    <header class="obx-card__head">
      <h2 class="obx-card__title"><ObxIcon :name="gates.Waiting === 'build' ? 'play' : 'rocket'" />{{ gates.Waiting === 'build' ? `Play and sign off r${gates.Revision}` : 'Approve the launch' }}</h2>
      <span class="obx-chip" data-tone="brick">Gate {{ gates.Waiting === 'build' ? 1 : 2 }} of 2</span>
      <span class="obx-card__meta">{{ gates.Waiting === 'build' ? 'a new revision needs a new sign-off' : 'this build, store page and products' }}</span>
    </header>
    <div class="obx-card__body obx-stack" style="gap: 10px">
      <template v-if="gates.Waiting === 'build'">
        <p class="obx-ink2">It passed its tests. Play it before anything is marketed: you are its first player. Approving lets the marketer start; nothing goes to Roblox until the launch approval after it.</p>
        <dl class="obx-kv">
          <dt>Map</dt><dd>{{ game.Build.MapScore ?? '—' }}/100</dd>
          <template v-if="engine"><dt>Roblox engine</dt><dd>{{ engine }}</dd></template>
          <template v-if="economy"><dt>Economy</dt><dd>{{ economy }}</dd></template>
          <template v-if="game.LastTest"><dt>Review</dt><dd>{{ game.LastTest.Summary }}</dd></template>
        </dl>
      </template>
      <template v-else>
        <p class="obx-ink2">Ready to go public. Nothing happens on Roblox until you approve: then the studio creates the products, sets the store page and thumbnails, publishes and makes it public.</p>
        <dl class="obx-kv">
          <dt>Title</dt><dd>{{ game.Store.Title || '—' }}</dd>
          <dt>Description</dt><dd class="obx-prose obx-clamp3">{{ game.Store.Description || '—' }}</dd>
          <dt>Products</dt>
          <dd>
            <span v-if="!game.Products.length">none</span>
            <span v-for="p in game.Products" :key="p.Key" style="display: block">{{ p.Name }} · R$ {{ p.PriceRobux }} <span class="obx-dim">({{ p.Kind === 'GamePass' ? 'game pass' : 'product' }}, {{ p.Grant }})</span></span>
          </dd>
          <dt>Build</dt><dd>r{{ gates.Revision }}<template v-if="gates.SignoffRevision === gates.Revision && gates.SignoffUtc">, signed off {{ obxAgo(gates.SignoffUtc, now) }}</template></dd>
        </dl>
      </template>

      <div class="obx-account__row">
        <button v-if="gates.Waiting === 'build' && playable" class="obx-btn obx-btn--brand" @click="emit('play')"><ObxIcon name="play" />Play r{{ gates.Revision }}</button>
        <button v-if="gates.Waiting === 'build'" class="obx-btn obx-btn--ghost" @click="emit('tab', 'world')"><ObxIcon name="map" />Look at the world</button>
        <button v-else class="obx-btn obx-btn--ghost" @click="emit('tab', 'store')"><ObxIcon name="store" />Store page and art</button>
        <span style="flex: 1"></span>
        <template v-if="canManage">
          <button class="obx-btn" :aria-expanded="changing" @click="changing = !changing">Request changes</button>
          <button class="obx-btn obx-btn--ok" :disabled="busy" data-testid="obx-gate-approve" @click="approve"><ObxIcon name="check" />{{ gates.Waiting === 'build' ? 'Approve build' : 'Approve launch' }}</button>
        </template>
        <span v-else class="obx-dim">The owner approves this, or asks for changes.</span>
      </div>

      <form v-if="changing && canManage" class="obx-stack" style="gap: 6px" @submit.prevent="requestChanges">
        <textarea v-model="note" class="obx-textarea" rows="3" maxlength="2000" aria-label="What to change" data-autofocus
                  :placeholder="gates.Waiting === 'build' ? 'e.g. The first zone takes too long, and the sell pad is hard to find from the spawn' : 'e.g. Make the VIP pass 99 R$ and lead the description with the lava'"></textarea>
        <label v-if="gates.Waiting === 'launch'" class="obx-check"><input v-model="backToBuild" type="checkbox" /> The game itself needs work (back to Build)</label>
        <div class="obx-account__row" style="justify-content: space-between">
          <span class="obx-faint" style="font-size: 11px">{{ toBuild ? 'the builder gets it and the game goes back to Build' : 'the marketer gets it' }}</span>
          <button class="obx-btn obx-btn--sm obx-btn--primary" :disabled="busy || !note.trim()">Send to the {{ toBuild ? 'builder' : 'marketer' }}</button>
        </div>
      </form>

      <details v-if="gates.History.length">
        <summary class="obx-dim">Your earlier decisions ({{ gates.History.length }})</summary>
        <ul class="obx-stack" style="gap: 6px; margin-top: 8px">
          <li v-for="(a, i) in gates.History" :key="i" class="obx-stack" style="gap: 2px">
            <span class="obx-account__row" style="gap: 6px"><span class="obx-chip" :data-tone="a.Decision === 'approved' ? 'ok' : 'warn'">{{ a.Decision === 'approved' ? 'Approved' : 'Changes asked' }}</span><b>{{ a.Gate === 'build' ? 'Build sign-off' : 'Launch' }} · r{{ a.Revision }}</b><span class="obx-dim">{{ obxAgo(a.Utc, now) }}</span></span>
            <span v-if="a.Note" class="obx-ink2 obx-prose">{{ a.Note }}</span>
          </li>
        </ul>
      </details>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BloxDossier, BloxGates } from '~/composables/useOmniBlox';
import { obxConfirm, obxPost } from '~/composables/useObxConsole';
import { obxAgo } from '~/scripts/omniblox/console';

/** The owner's two gates: play and sign off the tested build, then approve the launch. */
const props = defineProps<{ game: BloxDossier; gates: BloxGates; playable?: boolean; canManage: boolean; now: number }>();
const emit = defineEmits<{ changed: []; play: []; tab: [id: string] }>();

const engine = computed(() => {
  const run = props.game.Build.LastEngineRun;
  return run && run.Revision === props.gates.Revision ? run.Summary : null;
});
/** The economy bot's headline, for a simulator. */
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
  if (gate === 'launch' && !await obxConfirm('Approve the launch?', 'The studio creates the products, puts up the store page and thumbnails, publishes this build and makes the game public on its next step.', 'Approve launch')) return;
  busy.value = true;
  try {
    const ok = await obxPost('/omniblox/games/approve', { gameId: props.game.GameId, gate }, gate === 'build'
      ? { title: 'Build signed off', text: 'The marketer starts on the store page; the launch waits for your approval.' }
      : { title: 'Launch approved', text: 'The studio publishes it on its next step.' }, 'Could not approve');
    if (ok) emit('changed');
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
    const ok = await obxPost('/omniblox/games/reject', { gameId: props.game.GameId, gate, note: text, backToBuild: toBuild.value },
      { title: 'Changes requested', text: toBuild.value ? 'The builder gets your note; the game is back in Build.' : 'The marketer gets your note.' }, 'Changes not sent');
    if (!ok) return;
    note.value = '';
    changing.value = false;
    emit('changed');
  } finally {
    busy.value = false;
  }
}
</script>
