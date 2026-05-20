<template>
  <div
    class="artifact-row"
    :class="{ active, superseded }"
    @click="$emit('click')"
    tabindex="0"
    @keydown.enter="$emit('click')"
  >
    <span class="art-kind">{{ art.Kind }}</span>
    <span class="art-name" :title="art.FileName">{{ art.FileName }}</span>
    <span class="art-size">{{ formatBytes(art.SizeBytes) }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  art: {
    ArtifactID: string;
    Kind: string;
    FileName: string;
    SizeBytes: number;
    SupersededByArtifactID?: string | null;
  };
  active?: boolean;
  superseded?: boolean;
}>();
defineEmits<{ (e: 'click'): void }>();

function formatBytes(n: number) {
  if (!Number.isFinite(n)) return '?';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
</script>

<style scoped>
.artifact-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  background: #1b1b1f;
  border: 1px solid transparent;
}
.artifact-row:hover { background: #262629; border-color: #333; }
.artifact-row:focus { outline: none; border-color: #4d9e39; }
.artifact-row.active { background: #2d4030; color: #b9e8b4; border-color: #4d9e39; }
.artifact-row.superseded { opacity: 0.55; }
.art-kind {
  font-size: 10px;
  padding: 2px 6px;
  background: #2a2a2e;
  border-radius: 3px;
  color: #aaa;
  font-family: 'Consolas', 'Courier New', monospace;
}
.art-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.art-size { font-size: 11px; color: #777; min-width: 56px; text-align: right; }
</style>
