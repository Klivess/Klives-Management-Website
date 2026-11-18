<template>
  <section class="tmb-card tmb-verdict" aria-label="How the blogs are doing" data-testid="tmb-verdict">
    <div class="tmb-verdict__head">
      <span class="tmb-verdict__glyph" :data-tone="verdict.tone"><TumblrIcon :name="glyph" /></span>
      <div style="min-width: 0">
        <h2 class="tmb-verdict__title" data-testid="tmb-verdict-title">{{ verdict.title }}</h2>
        <p class="tmb-verdict__detail">{{ verdict.detail }}</p>
      </div>
    </div>
    <ul v-if="verdict.issues.length" class="tmb-verdict__issues">
      <li v-for="issue in verdict.issues" :key="issue.id" class="tmb-issue" :data-tone="issue.tone" data-testid="tmb-issue">
        <span class="tmb-issue__bar"></span>
        <div style="min-width: 0">
          <p class="tmb-issue__title">{{ issue.title }}</p>
          <p class="tmb-issue__detail" :data-open="opened === issue.id || undefined" :title="issue.detail" @click="opened = opened === issue.id ? null : issue.id">{{ issue.detail }}</p>
        </div>
        <button v-if="issue.action && labelFor(issue)" class="tmb-btn tmb-btn--xs" @click="emit('act', issue)">{{ labelFor(issue) }}</button>
      </li>
    </ul>
    <div v-else-if="verdict.tone === 'ok'" class="tmb-empty" style="padding: 8px 16px 16px; align-items: flex-start; text-align: left">Nothing needs you.</div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TmbIssue, TmbVerdict } from '~/scripts/tumblrConsole';

const props = defineProps<{ verdict: TmbVerdict; canManage: boolean; canSettings: boolean }>();
const emit = defineEmits<{ act: [issue: TmbIssue] }>();
const opened = ref<string | null>(null);

const glyph = computed(() => ({ crit: 'octagon-x', warn: 'alert', ok: 'check-circle', info: 'info', neutral: 'dot', violet: 'dot', accent: 'dot' } as Record<string, string>)[props.verdict.tone]);

function labelFor(issue: TmbIssue): string {
  switch (issue.action) {
    case 'settings': return props.canSettings ? 'Settings' : '';
    case 'reconnect': return props.canSettings ? 'Reconnect' : '';
    case 'add-blog': return props.canManage ? 'Add blogs' : '';
    case 'strategy': return 'Strategy';
    case 'queue': return 'Queue';
    case 'reach': return 'Reach';
    case 'published': return 'Show';
    default: return '';
  }
}
</script>
