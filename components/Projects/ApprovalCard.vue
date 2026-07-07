<template>
  <div class="approval-card">
    <div class="ac-head">
      <span class="ac-badge" :class="'k-' + (gate.kind || 'action')">{{ gate.kind || 'action' }}</span>
      <span class="ac-title">{{ gate.title }}</span>
    </div>
    <div class="ac-desc">{{ gate.description }}</div>
    <div v-if="gate.rationale" class="ac-rationale"><strong>Why:</strong> {{ gate.rationale }}</div>
    <textarea v-model="comment" class="ac-comment" placeholder="Optional comment…"></textarea>
    <div class="ac-actions">
      <button class="btn approve" @click="resolve('Approve')">Approve</button>
      <button class="btn deny" @click="resolve('Deny')">Deny</button>
      <button class="btn discuss" @click="resolve('Discuss')">Discuss</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{ gate: { gateID: string; kind: string; title: string; description: string; rationale: string } }>();
const emit = defineEmits<{ (e: 'resolve', gateID: string, decision: string, comment: string): void }>();

const comment = ref('');
function resolve(decision: string) {
  emit('resolve', props.gate.gateID, decision, comment.value);
}
</script>

<style scoped>
.approval-card { border: 1px solid #d98c2b; border-radius: 8px; background: #241f17; padding: 14px; margin: 8px 0; }
.ac-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.ac-badge { font-size: 10px; text-transform: uppercase; padding: 2px 6px; border-radius: 8px; background: #3a2f17; color: #d9b872; }
.k-budget { background: #17303a; color: #7fb0d9; }
.ac-title { font-weight: 600; }
.ac-desc { font-size: 13px; color: #ddd; margin-bottom: 6px; }
.ac-rationale { font-size: 12px; color: #b7a98a; margin-bottom: 8px; }
.ac-comment { width: 100%; min-height: 48px; background: #1a1a1e; color: #eee; border: 1px solid #333; border-radius: 6px; padding: 6px; box-sizing: border-box; margin-bottom: 8px; }
.ac-actions { display: flex; gap: 8px; }
.btn { border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; color: #fff; }
.btn.approve { background: #4d9e39; }
.btn.deny { background: #a13a3a; }
.btn.discuss { background: #3a3a44; }
</style>
