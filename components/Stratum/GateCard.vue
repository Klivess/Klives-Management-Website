<template>
  <div class="gate-card">
    <div class="gate-head">
      <span class="gate-badge">Approval needed</span>
      <strong class="gate-title">{{ gate.title }}</strong>
    </div>
    <p class="gate-desc">{{ gate.description }}</p>
    <p v-if="gate.rationale" class="gate-rationale">{{ gate.rationale }}</p>
    <div v-if="gate.artifactIDs?.length" class="gate-artifacts">
      <button
        v-for="id in gate.artifactIDs"
        :key="id"
        class="artifact-chip"
        title="Preview this artifact"
        @click="$emit('preview', id)"
      >
        📦 {{ shortId(id) }}
      </button>
    </div>
    <textarea
      v-model="comment"
      class="gate-comment"
      rows="2"
      placeholder="Optional comment (required context when rejecting)…"
      :disabled="busy"
    />
    <div class="gate-actions">
      <button class="approve-btn" :disabled="busy" @click="resolve('Approve')">Approve</button>
      <button class="reject-btn" :disabled="busy" @click="resolve('Reject')">Reject & refine</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

export interface GateInfo {
  gateID: string;
  runID: string;
  title: string;
  description: string;
  rationale: string;
  proposalJson?: string;
  artifactIDs: string[];
}

defineProps<{ gate: GateInfo }>();
const emit = defineEmits<{
  (e: 'resolve', decision: 'Approve' | 'Reject', comment: string): void;
  (e: 'preview', artifactID: string): void;
}>();

const comment = ref('');
const busy = ref(false);

function resolve(decision: 'Approve' | 'Reject') {
  busy.value = true;
  emit('resolve', decision, comment.value.trim());
  // Parent removes the card on success; re-enable in case it stays mounted on error.
  setTimeout(() => { busy.value = false; }, 4000);
}

function shortId(id: string) { return id.length > 8 ? id.slice(0, 8) : id; }
</script>

<style scoped>
.gate-card {
  background: #262214; border: 1px solid #6b5d20; border-radius: 8px;
  padding: 12px; margin: 8px 0;
}
.gate-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.gate-badge {
  background: #6b5d20; color: #ffe89a; font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; padding: 3px 8px; border-radius: 4px;
}
.gate-title { color: #ffe89a; font-size: 14px; }
.gate-desc { color: #ccc; font-size: 13px; margin: 4px 0; }
.gate-rationale { color: #998f66; font-size: 12px; font-style: italic; margin: 4px 0; }
.gate-artifacts { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.artifact-chip {
  background: #1f1f23; border: 1px solid #3a3a3e; color: #9fcf92; border-radius: 12px;
  font-size: 11px; padding: 3px 10px; cursor: pointer;
}
.artifact-chip:hover { background: #2d4030; }
.gate-comment {
  width: 100%; box-sizing: border-box; background: #161618; border: 1px solid #3a3a3e;
  color: #ddd; border-radius: 6px; padding: 8px; font-size: 12px; resize: vertical;
}
.gate-actions { display: flex; gap: 8px; margin-top: 8px; }
.approve-btn, .reject-btn {
  border: none; border-radius: 6px; padding: 8px 16px; font-weight: 700;
  font-size: 13px; cursor: pointer;
}
.approve-btn { background: #4d9e39; color: #fff; }
.approve-btn:hover { background: #5cb946; }
.reject-btn { background: #8a3b30; color: #fff; }
.reject-btn:hover { background: #a64a3d; }
.approve-btn:disabled, .reject-btn:disabled { opacity: 0.5; cursor: default; }
</style>
