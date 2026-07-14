<template>
  <span class="status-pill" :class="'s-' + (status || '').toLowerCase()">
    <span v-if="status === 'Active'" class="live-dot"></span>{{ status }}
  </span>
</template>

<script setup lang="ts">
// Shared project status pill — previously the same block of CSS was copy-pasted into the fleet
// page and the workspace header. One component keeps them in sync (Phase 4 design-system dedup).
defineProps<{ status: string }>();
</script>

<style scoped>
.status-pill { font-size: 11px; padding: 2px 8px; border-radius: 10px; text-transform: capitalize; display: inline-flex; align-items: center; gap: 5px; }
.live-dot { width: 6px; height: 6px; border-radius: 50%; background: #7fd97f; animation: blink 1.6s ease-in-out infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.s-active { background: #1d3a1d; color: #7fd97f; }
.s-paused, .s-budgetpaused { background: #3a331d; color: #d9c47f; }
.s-completed { background: #1d2a3a; color: #7fb0d9; }
.s-archived { background: #2a2a2e; color: #999; }
.s-planning { background: #241d3a; color: #a68fd9; }
.s-blocked { background: #3a2117; color: #e8a877; }

@media (prefers-color-scheme: light) {
  .s-active { background: #e3f5e3; color: #2e7d32; }
  .s-paused, .s-budgetpaused { background: #f6efd6; color: #9a7b1e; }
  .s-completed { background: #e2edf7; color: #1e5b96; }
  .s-archived { background: #ececec; color: #666; }
  .s-planning { background: #ebe3f7; color: #5b3e96; }
  .s-blocked { background: #fbe6da; color: #b5551b; }
}
</style>
