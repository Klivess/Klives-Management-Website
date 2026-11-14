<template>
  <section class="pfx-card pfx-verdict" :data-tone="review.tone" aria-label="Access review" data-testid="pfx-review">
    <div class="pfx-verdict__top">
      <span class="pfx-verdict__glyph"><PeopleIcon :name="review.tone === 'ok' ? 'check-circle' : review.tone === 'info' ? 'info' : 'shield'" /></span>
      <div style="min-width: 0">
        <h2 class="pfx-verdict__title" data-testid="pfx-review-title">{{ review.title }}</h2>
        <p v-if="review.detail" class="pfx-verdict__detail">{{ review.detail }}</p>
      </div>
    </div>
    <div v-if="review.issues.length" class="pfx-verdict__issues">
      <button v-for="issue in shown" :key="issue.id" type="button" class="pfx-issue" :data-tone="issue.tone" :data-testid="`issue-${issue.id}`" :disabled="!issue.action" @click="issue.action && emit('act', issue)">
        <PeopleIcon class="pfx-issue__mark" :name="issue.icon" />
        <span class="pfx-issue__text">
          <span class="pfx-issue__title">{{ issue.title }}</span>
          <span class="pfx-issue__detail">{{ issue.detail }}</span>
        </span>
        <PeopleIcon v-if="issue.action" class="pfx-issue__go" name="chevron-right" />
      </button>
      <button v-if="review.issues.length > limit && !expanded" type="button" class="pfx-btn pfx-btn--xs pfx-btn--ghost" style="align-self: flex-start; margin: 2px 8px" @click="expanded = true">
        {{ review.issues.length - limit }} more
      </button>
    </div>
    <footer class="pfx-verdict__foot">
      <slot name="foot" />
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Review, ReviewIssue } from '~/scripts/profilesConsole';

/** The directory's verdict: one line on the state of access, then what to look at, worst first. */
const props = withDefaults(defineProps<{ review: Review; limit?: number }>(), { limit: 6 });
const emit = defineEmits<{ act: [issue: ReviewIssue] }>();
const expanded = ref(false);
const shown = computed(() => (expanded.value ? props.review.issues : props.review.issues.slice(0, props.limit)));
</script>
