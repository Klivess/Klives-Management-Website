<template>
    <ol class="bx-approvals">
        <li v-for="(a, i) in history" :key="i">
            <div class="top">
                <span class="ot-chip" :class="a.Decision === 'approved' ? 'ok' : 'warn'">{{ a.Decision === 'approved' ? 'Approved' : 'Changes asked' }}</span>
                <strong>{{ a.Gate === 'build' ? 'Build sign-off' : 'Launch' }} · r{{ a.Revision }}</strong>
                <time class="when" :datetime="a.Utc" :title="new Date(a.Utc).toString()">{{ fmtRelative(a.Utc, now) }}</time>
            </div>
            <p v-if="a.Note" class="note">{{ a.Note }}</p>
        </li>
    </ol>
</template>

<script setup lang="ts">
import { fmtRelative, useNow } from '~/composables/useOmniTumblr';
import type { BloxApproval } from '~/composables/useOmniBlox';

defineProps<{ history: BloxApproval[] }>();
const now = useNow();
</script>

<style scoped>
.bx-approvals { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.bx-approvals li { padding: var(--ot-space-2) 0; display: flex; flex-direction: column; gap: 4px; }
.bx-approvals li + li { border-top: 1px solid var(--ot-line); }
.top { display: flex; align-items: center; gap: var(--ot-space-2); flex-wrap: wrap; font-size: 12px; }
.when { margin-left: auto; color: var(--ot-muted); font-size: 11px; }
.note { margin: 0; font-size: 12.5px; line-height: 18px; color: var(--ot-text-2); white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
