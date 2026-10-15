<template>
  <div class="approval-card" :class="'k-' + (gate.kind || 'action')">
    <div class="ac-head">
      <span class="ot-chip" :class="kindTone">{{ kindLabel }}</span>
      <span class="ac-title">{{ gate.title }}</span>
    </div>
    <div class="ac-desc">{{ gate.description }}</div>
    <div v-if="gate.rationale" class="ac-rationale"><strong>Why:</strong> {{ gate.rationale }}</div>
    <textarea v-model="comment" class="ot-input ac-comment" rows="2" placeholder="Optional comment — the agent reads it either way…"></textarea>
    <div class="ac-actions">
      <button class="ot-btn primary sm" :disabled="busy" @click="resolve('Approve')">Approve</button>
      <button class="ot-btn danger sm" :disabled="busy" @click="resolve('Deny')">Deny</button>
      <button class="ot-btn ghost sm" :disabled="busy" @click="resolve('Discuss')">Discuss</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{ gate: { gateID: string; kind: string; title: string; description: string; rationale: string } }>();
const emit = defineEmits<{ (e: 'resolve', gateID: string, decision: string, comment: string): void }>();

const comment = ref('');
const busy = ref(false);
const kindLabel = computed(() => ({ plan: 'Grand Plan', budget: 'Budget', action: 'Approval', completion: 'Completion' } as Record<string, string>)[props.gate.kind] ?? (props.gate.kind || 'Approval'));
const kindTone = computed(() => props.gate.kind === 'budget' ? 'info' : props.gate.kind === 'plan' ? 'violet' : 'warn');

function resolve(decision: string) {
  busy.value = true;
  emit('resolve', props.gate.gateID, decision, comment.value);
  setTimeout(() => { busy.value = false; }, 1500);
}
</script>

<style scoped>
.approval-card { border: 1px solid rgba(240, 180, 41, 0.45); border-radius: var(--ot-radius); background: var(--ot-warning-soft); padding: var(--ot-space-3) var(--ot-card-pad); display: flex; flex-direction: column; gap: var(--ot-space-2); }
.approval-card.k-plan { border-color: rgba(168, 155, 240, 0.45); background: var(--ot-violet-soft); }
.approval-card.k-budget { border-color: rgba(99, 200, 234, 0.45); background: var(--ot-info-soft); }
.ac-head { display: flex; align-items: center; gap: var(--ot-space-2); flex-wrap: wrap; }
.ac-title { font-weight: 600; font-size: 14px; }
.ac-desc { font-size: 13px; color: var(--ot-text); white-space: pre-wrap; overflow-wrap: anywhere; }
.ac-rationale { font-size: 12.5px; color: var(--ot-text-2); }
.ac-comment { min-height: 44px; }
.ac-actions { display: flex; gap: var(--ot-space-2); flex-wrap: wrap; }
</style>
