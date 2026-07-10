<template>
  <div class="cn-panel">
    <p class="cn-intro">
      Adversarial councils the Commander convened to pressure-test a decision — opposing seats argue,
      rebut, then a Chair synthesizes a verdict. The Commander raises them with <code>convene_council</code>.
    </p>

    <div v-if="!councils.length" class="cn-empty">
      No councils yet — the Commander convenes them for high-stakes calls (planning, pivots, big spends).
    </div>

    <div v-else class="cn-list">
      <div v-for="c in councils" :key="c.councilID" class="cn-card">
        <button class="cn-card-head" @click="toggle(c.councilID)">
          <div class="cn-card-main">
            <div class="cn-topic">{{ c.topic }}</div>
            <div class="cn-meta">
              <span class="cn-badge" :class="'st-' + (c.status || '').toLowerCase()">{{ c.status }}</span>
              <span class="cn-purpose">{{ c.purpose }}</span>
              <span v-if="c.urgency && c.urgency !== 'routine'" class="cn-urgency">{{ c.urgency }}</span>
              <span class="cn-roles">{{ (c.roles || []).join(' · ') }} + Chair</span>
              <span class="cn-cost">${{ (c.totalCostUsd || 0).toFixed(4) }}</span>
              <span class="cn-when">{{ fmtDate(c.createdAt) }}</span>
            </div>
            <div v-if="c.verdictExcerpt && expandedId !== c.councilID" class="cn-excerpt">{{ c.verdictExcerpt }}</div>
          </div>
          <span class="cn-caret">{{ expandedId === c.councilID ? '▾' : '▸' }}</span>
        </button>

        <div v-if="expandedId === c.councilID" class="cn-body">
          <div v-if="loadingDetail" class="cn-thin">Loading transcript…</div>
          <template v-else-if="detail">
            <div v-if="detail.error" class="cn-error">{{ detail.error }}</div>

            <div v-for="round in [1, 2]" :key="round" v-show="statementsOf(round).length" class="cn-round">
              <h4 class="cn-round-title">{{ round === 1 ? 'Round 1 — Opening positions' : 'Round 2 — Rebuttals' }}</h4>
              <div v-for="(st, i) in statementsOf(round)" :key="i" class="cn-statement">
                <div class="cn-role">{{ st.role }}</div>
                <div class="cn-text">{{ st.text }}</div>
              </div>
            </div>

            <div v-if="detail.verdictText" class="cn-verdict">
              <h4 class="cn-round-title cn-chair">Chair — Verdict</h4>
              <div class="cn-verdict-text">{{ detail.verdictText }}</div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

const props = defineProps<{ projectId: string; councils: any[] }>();

const expandedId = ref<string | null>(null);
const detail = ref<any>(null);
const loadingDetail = ref(false);

function statementsOf(round: number) {
  return (detail.value?.statements ?? []).filter((s: any) => s.round === round);
}

async function toggle(id: string) {
  if (expandedId.value === id) { expandedId.value = null; detail.value = null; return; }
  expandedId.value = id;
  detail.value = null;
  loadingDetail.value = true;
  try {
    const r = await RequestGETFromKliveAPI(
      `/projects/councils/get?projectID=${props.projectId}&councilID=${id}`, false, false);
    if (r.ok) detail.value = await r.json();
  } catch { /* transient */ } finally { loadingDetail.value = false; }
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
</script>

<style scoped>
.cn-panel { color: #e6e6e6; }
.cn-intro { font-size: 12px; color: #888; margin: 0 0 14px; line-height: 1.5; }
.cn-intro code { background: #26262b; color: #cdd; padding: 1px 5px; border-radius: 4px; font-size: 11px; }
.cn-empty { padding: 28px; text-align: center; color: #888; background: #161519; border-radius: 8px; font-size: 13px; }

.cn-list { display: flex; flex-direction: column; gap: 10px; }
.cn-card { background: #161519; border: 1px solid #232228; border-radius: 10px; overflow: hidden; }
.cn-card-head { width: 100%; text-align: left; background: none; border: none; cursor: pointer; padding: 13px 14px; display: flex; gap: 10px; align-items: flex-start; color: inherit; }
.cn-card-head:hover { background: #1a1a1f; }
.cn-card-main { flex: 1; min-width: 0; }
.cn-topic { font-size: 14px; font-weight: 600; color: #ece6da; }
.cn-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 5px; font-size: 11px; color: #888; }
.cn-badge { padding: 1px 7px; border-radius: 8px; text-transform: capitalize; }
.st-completed { background: #1d3a1d; color: #7fd97f; }
.st-running { background: #241d3a; color: #a68fd9; }
.st-failed, .st-cancelled { background: #3a2020; color: #d99; }
.cn-purpose { text-transform: capitalize; }
.cn-urgency { color: #e0b23f; text-transform: capitalize; }
.cn-roles { color: #a68f5e; }
.cn-cost { color: #3fae8f; font-variant-numeric: tabular-nums; }
.cn-when { color: #666; }
.cn-excerpt { font-size: 12px; color: #9a9a9a; margin-top: 7px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cn-caret { color: #777; flex-shrink: 0; padding-top: 2px; }

.cn-body { padding: 4px 14px 16px; border-top: 1px solid #232228; }
.cn-thin { font-size: 12px; color: #777; padding: 12px 0; }
.cn-error { color: #e08a8a; font-size: 12px; padding: 8px 0; }
.cn-round { margin-top: 14px; }
.cn-round-title { font-size: 12px; color: #c9a227; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px; }
.cn-round-title.cn-chair { color: #e0b23f; }
.cn-statement { border-left: 2px solid #2f2f36; padding: 2px 0 8px 12px; margin-bottom: 8px; }
.cn-role { font-size: 12px; font-weight: 600; color: #a68f5e; margin-bottom: 3px; }
.cn-text { font-size: 13px; color: #ccc; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.cn-verdict { margin-top: 16px; background: #1a180f; border: 1px solid #3a3320; border-radius: 8px; padding: 12px 14px; }
.cn-verdict-text { font-size: 13px; color: #e6ddc4; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }

@media (prefers-color-scheme: light) {
  .cn-panel { color: #222; }
  .cn-card { background: #fff; border-color: #e2e2e6; }
  .cn-card-head:hover { background: #f6f6f8; }
  .cn-topic { color: #1a1a1a; }
  .cn-empty { background: #f2f2f4; color: #666; }
  .cn-text { color: #333; }
  .cn-verdict { background: #fbf7e8; border-color: #e6dcbb; }
  .cn-verdict-text { color: #4a3f1e; }
}
</style>
