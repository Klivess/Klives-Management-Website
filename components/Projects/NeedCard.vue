<template>
  <article class="pjx-need" :data-tone="tone" :data-testid="`need-${need.projectID}`" :aria-label="`${kindLabel}: ${need.projectName}`">
    <div class="pjx-need__top">
      <span class="pjx-chip" :data-tone="tone"><ProjectsIcon :name="icon" />{{ kindLabel }}</span>
      <NuxtLink class="pjx-need__project" :to="`/projects/${need.projectID}`" :title="need.projectName">{{ need.projectName }}</NuxtLink>
      <span v-if="need.since" class="pjx-need__age" :data-old="old || undefined" :title="new Date(need.since).toLocaleString()">waiting {{ ageWords(need.since, now) }}</span>
    </div>

    <template v-if="need.gate">
      <p class="pjx-need__title">{{ need.gate.title }}</p>
      <p v-if="need.gate.description" class="pjx-need__detail" :data-open="expanded || undefined">{{ need.gate.description }}</p>
      <button v-if="(need.gate.description?.length ?? 0) > 220" class="pjx-btn pjx-btn--ghost pjx-btn--xs" style="align-self: flex-start" @click="expanded = !expanded">{{ expanded ? 'Less' : 'Read all' }}</button>
      <textarea v-if="commenting" v-model="comment" class="pjx-textarea pjx-need__comment" rows="2" :aria-label="`Comment for ${need.projectName}`" placeholder="Optional: the agent reads this with your decision"></textarea>
      <div class="pjx-need__actions">
        <button class="pjx-btn pjx-btn--go pjx-btn--sm" :disabled="busy || !canResolve" :data-testid="`approve-${need.projectID}`" @click="decide('Approve')"><ProjectsIcon name="check" />Approve</button>
        <button class="pjx-btn pjx-btn--danger pjx-btn--sm" :disabled="busy || !canResolve" @click="decide('Deny')"><ProjectsIcon name="x" />Deny</button>
        <button class="pjx-btn pjx-btn--sm" :disabled="busy || !canResolve" title="Ask the agent about it instead of deciding" @click="decide('Discuss')"><ProjectsIcon name="message" />Discuss</button>
        <button class="pjx-btn pjx-btn--ghost pjx-btn--sm" :aria-pressed="commenting" @click="commenting = !commenting">{{ commenting ? 'No comment' : 'Add a comment' }}</button>
        <span v-if="need.more" class="pjx-dim" style="margin-left: auto; font-size: 11.5px">+{{ need.more }} more in the project</span>
      </div>
    </template>

    <template v-else>
      <p class="pjx-need__title">{{ need.label }}</p>
      <div class="pjx-need__actions">
        <button v-if="need.kind === 'blocked'" class="pjx-btn pjx-btn--go pjx-btn--sm" :disabled="busy || !canControl" title="Clear the block and set the fleet back to work, once the cause is fixed" @click="$emit('resume', need.projectID)"><ProjectsIcon name="play" />Unblock</button>
        <NuxtLink class="pjx-btn pjx-btn--sm" :to="`/projects/${need.projectID}`"><ProjectsIcon name="arrow-right" />Open</NuxtLink>
      </div>
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ageWords, isOld, type PjNeed, type PjTone } from '~/scripts/projectsConsole';
import ProjectsIcon from '~/components/Projects/Icon.vue';

const props = defineProps<{ need: PjNeed; now: number; busy?: boolean; canResolve?: boolean; canControl?: boolean }>();
const emit = defineEmits<{ (e: 'resolve', projectID: string, gateID: string, decision: string, comment: string): void; (e: 'resume', projectID: string): void }>();

const comment = ref('');
const commenting = ref(false);
const expanded = ref(false);
const tone = computed<PjTone>(() => props.need.kind === 'blocked' || props.need.kind === 'budget' ? 'fault' : props.need.gate?.kind === 'plan' ? 'plan' : 'need');
const icon = computed(() => props.need.kind === 'blocked' ? 'octagon-x' : props.need.kind === 'budget' ? 'coins' : props.need.gate?.kind === 'plan' ? 'plan' : 'inbox');
const kindLabel = computed(() => {
  if (props.need.gate) return ({ plan: 'Grand Plan', budget: 'Budget', completion: 'Completion' } as Record<string, string>)[props.need.gate.kind] ?? 'Approval';
  return props.need.kind === 'blocked' ? 'Blocked' : props.need.kind === 'budget' ? 'Budget' : 'Needs you';
});
const old = computed(() => isOld(props.need.since, props.now, 24));

function decide(decision: string) {
  if (!props.need.gate) return;
  emit('resolve', props.need.projectID, props.need.gate.gateID, decision, comment.value.trim());
}
</script>
