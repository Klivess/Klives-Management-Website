<template>
  <section class="ktx-card ktx-verdict" :data-tone="verdict.tone" aria-label="KliveTech status" data-testid="ktx-verdict">
    <div class="ktx-verdict__top">
      <div class="ktx-verdict__glyph"><TechIcon :name="glyph" /></div>
      <div style="min-width: 0">
        <h2 class="ktx-verdict__title" data-testid="ktx-verdict-title">{{ verdict.headline }}</h2>
        <p v-if="verdict.detail" class="ktx-verdict__detail">{{ verdict.detail }}</p>
      </div>
    </div>

    <ul v-if="verdict.issues.length" class="ktx-verdict__issues">
      <li v-for="issue in shown" :key="issue.id" class="ktx-issue" :data-tone="issue.tone" :data-testid="`issue-${issue.id}`">
        <TechIcon class="ktx-issue__mark" :name="issue.tone === 'crit' ? 'octagon-x' : issue.tone === 'warn' ? 'alert' : 'info'" />
        <div class="ktx-issue__text">
          <div class="ktx-issue__title">{{ issue.title }}</div>
          <div v-if="issue.detail" class="ktx-issue__detail">{{ issue.detail }}</div>
        </div>
        <button v-if="issue.action" class="ktx-btn ktx-btn--xs" :disabled="!!(issue.action.kind === 'retry' || issue.action.kind === 'enrol') && !!pending[issue.action.target]" @click="emit('act', issue)">
          {{ issue.action.label }}<TechIcon name="chevron-right" />
        </button>
      </li>
      <li v-if="verdict.issues.length > shown.length" class="ktx-issue ktx-issue--more">
        <button class="ktx-btn ktx-btn--xs ktx-btn--ghost" @click="expanded = !expanded">
          {{ expanded ? 'Fewer' : `${verdict.issues.length - shown.length} more` }}<TechIcon :name="expanded ? 'chevron-up' : 'chevron-down'" />
        </button>
      </li>
    </ul>

    <footer class="ktx-verdict__foot" data-testid="ktx-health">
      <span v-if="status?.startedUtc" :title="`Hub started ${new Date(status.startedUtc).toLocaleString()}`">hub up <b>{{ fmtDuration(now - (parseUtc(status.startedUtc) ?? now)) }}</b></span>
      <span v-if="status?.bluetooth?.available && status.bluetooth.lastScanUtc" title="Bluetooth discovery">
        scanned <b>{{ fmtAgo(status.bluetooth.lastScanUtc, now) }}</b>
      </span>
      <span v-else-if="status && !status.bluetooth?.available">no Bluetooth adapter</span>
      <span v-if="status">relay <b :data-tone="hubs ? 'ok' : undefined">{{ hubs ? `${hubs} hub${hubs === 1 ? '' : 's'}` : 'none connected' }}</b></span>
      <span v-if="status?.streamables?.liveViewers">viewers <b>{{ status.streamables.liveViewers }}/{{ status.streamables.maximumLiveViewers }}</b></span>
      <span v-if="lastOkAt">read <b :data-tone="stale ? 'warn' : undefined">{{ fmtAgo(new Date(lastOkAt).toISOString(), now) }}</b></span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { fmtAgo, fmtDuration, parseUtc, type HubStatus, type Issue, type Verdict } from '~/scripts/kliveTech';

/** The page's answer to "is anything wrong": one sentence, the things behind it, and a fix on each. */
const props = defineProps<{ verdict: Verdict; status: HubStatus | null; now: number; lastOkAt: number | null; pending: Record<string, string> }>();
const emit = defineEmits<{ act: [issue: Issue] }>();

const expanded = ref(false);
const shown = computed(() => (expanded.value || props.verdict.issues.length <= 4 ? props.verdict.issues : props.verdict.issues.slice(0, 3)));
const glyph = computed(() => ({ ok: 'check-circle', warn: 'alert', crit: 'octagon-x', info: 'info', neutral: 'chip' } as Record<string, string>)[props.verdict.tone] ?? 'chip');
const hubs = computed(() => (props.status?.relay?.hubs ?? []).filter(h => h.open).length);
const stale = computed(() => props.lastOkAt != null && props.now - props.lastOkAt > 20_000);
</script>
