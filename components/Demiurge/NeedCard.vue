<template>
  <article class="dmx-need" :data-tone="tone" :data-testid="`need-${need.stewardID}`" :aria-label="`${kindLabel}: ${need.stewardName}`">
    <div class="dmx-need__top">
      <span class="dmx-chip" :data-tone="tone"><DemiurgeIcon :name="icon" />{{ kindLabel }}</span>
      <NuxtLink class="dmx-need__steward" :to="`/demiurge/${need.stewardID}`" :title="need.stewardName">{{ need.stewardName }}</NuxtLink>
      <span v-if="need.since" class="dmx-need__age" :data-old="old || undefined" :title="new Date(need.since).toLocaleString()">waiting {{ ageWords(need.since, now) }}</span>
    </div>

    <template v-if="need.gate">
      <p class="dmx-need__title">{{ need.gate.title }}</p>
      <p v-if="need.gate.description" class="dmx-need__detail" :data-open="expanded || undefined">{{ need.gate.description }}</p>
      <button v-if="(need.gate.description?.length ?? 0) > 220" class="dmx-btn dmx-btn--ghost dmx-btn--xs" style="align-self: flex-start" @click="expanded = !expanded">{{ expanded ? 'Less' : 'Read all' }}</button>
      <textarea v-if="commenting" v-model="comment" class="dmx-textarea dmx-need__comment" rows="2" :aria-label="`Comment for ${need.stewardName}`" placeholder="Optional: the agent reads this with your decision"></textarea>
      <div class="dmx-need__actions">
        <button class="dmx-btn dmx-btn--go dmx-btn--sm" :disabled="busy || !canResolve" :data-testid="`approve-${need.stewardID}`" @click="decide('Approve')"><DemiurgeIcon name="check" />Approve</button>
        <button class="dmx-btn dmx-btn--danger dmx-btn--sm" :disabled="busy || !canResolve" @click="decide('Deny')"><DemiurgeIcon name="x" />Deny</button>
        <button class="dmx-btn dmx-btn--sm" :disabled="busy || !canResolve" title="Ask the agent about it instead of deciding" @click="decide('Discuss')"><DemiurgeIcon name="message" />Discuss</button>
        <button class="dmx-btn dmx-btn--ghost dmx-btn--sm" :aria-pressed="commenting" @click="commenting = !commenting">{{ commenting ? 'No comment' : 'Add a comment' }}</button>
        <span v-if="need.more" class="dmx-dim" style="margin-left: auto; font-size: 11.5px">+{{ need.more }} more in the Steward</span>
      </div>
    </template>

    <template v-else>
      <p class="dmx-need__title">{{ need.label }}</p>
      <div class="dmx-need__actions">
        <button v-if="need.kind === 'blocked'" class="dmx-btn dmx-btn--go dmx-btn--sm" :disabled="busy || !canControl" title="Clear the block and set the fleet back to work, once the cause is fixed" @click="$emit('resume', need.stewardID)"><DemiurgeIcon name="play" />Unblock</button>
        <NuxtLink class="dmx-btn dmx-btn--sm" :to="`/demiurge/${need.stewardID}`"><DemiurgeIcon name="arrow-right" />Open</NuxtLink>
      </div>
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ageWords, isOld, type DmNeed, type DmTone } from '~/scripts/demiurgeConsole';
import DemiurgeIcon from '~/components/Demiurge/Icon.vue';

const props = defineProps<{ need: DmNeed; now: number; busy?: boolean; canResolve?: boolean; canControl?: boolean }>();
const emit = defineEmits<{ (e: 'resolve', stewardID: string, gateID: string, decision: string, comment: string): void; (e: 'resume', stewardID: string): void }>();

const comment = ref('');
const commenting = ref(false);
const expanded = ref(false);
const tone = computed<DmTone>(() => props.need.kind === 'blocked' || props.need.kind === 'budget' ? 'fault' : props.need.gate?.kind === 'plan' ? 'plan' : 'need');
const icon = computed(() => props.need.kind === 'blocked' ? 'octagon-x' : props.need.kind === 'budget' ? 'coins' : props.need.gate?.kind === 'plan' ? 'plan' : 'inbox');
const kindLabel = computed(() => {
  if (props.need.gate) return ({ plan: 'Grand Plan', budget: 'Budget', completion: 'Completion' } as Record<string, string>)[props.need.gate.kind] ?? 'Approval';
  return props.need.kind === 'blocked' ? 'Blocked' : props.need.kind === 'budget' ? 'Budget' : 'Needs you';
});
const old = computed(() => isOld(props.need.since, props.now, 24));

function decide(decision: string) {
  if (!props.need.gate) return;
  emit('resolve', props.need.stewardID, props.need.gate.gateID, decision, comment.value.trim());
}
</script>
