<template>
  <div class="llx-tablewrap">
    <table class="llx-table">
      <thead>
        <tr>
          <th class="l">{{ head }}</th>
          <th>Calls</th>
          <th>Share</th>
          <th>Tokens</th>
          <th>Cost</th>
          <th>p95</th>
          <th>Errors</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="g in groups.slice(0, limit)" :key="g.key" :class="{ 'llx-row': clickable }" @click="clickable && $emit('select', g)">
          <td class="l"><span class="llx-truncate" :class="{ 'llx-mono': mono }" :title="g.key">{{ g.label ?? g.key }}</span></td>
          <td class="llx-num">{{ llmCompact(g.values?.calls) }}</td>
          <td class="llx-num">
            <span class="llx-sharebar"><i :style="{ width: `${Math.round((g.share?.calls ?? 0) * 100)}%` }"></i></span>
            {{ llmPct((g.share?.calls ?? 0) * 100, 0) }}
          </td>
          <td class="llx-num">{{ llmCompact(g.values?.totalTokens) }}</td>
          <td class="llx-num">{{ llmUsd(g.values?.estCostUsd) }}</td>
          <td class="llx-num">{{ llmMs(g.values?.p95TotalMs) }}</td>
          <td class="llx-num">{{ llmPct(g.values?.errorPct) }}</td>
        </tr>
        <tr v-if="!groups.length"><td colspan="7" class="llx-empty">{{ loading ? 'Reading…' : emptyText }}</td></tr>
        <tr v-else-if="groups.length > limit"><td colspan="7" class="llx-dim">and {{ groups.length - limit }} more</td></tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { llmCompact, llmMs, llmPct, llmUsd } from '~/scripts/kliveLlm';

withDefaults(defineProps<{ groups: any[]; head?: string; loading?: boolean; emptyText?: string; mono?: boolean; limit?: number; clickable?: boolean }>(),
  { head: 'Name', emptyText: 'Nothing in this window.', limit: 10 });
defineEmits<{ select: [group: any] }>();
</script>
