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
.cn-panel { color: var(--ot-text); }
.cn-intro { font-size: 12px; color: var(--ot-muted); margin: 0 0 14px; line-height: 1.5; }
.cn-intro code { background: var(--ot-surface-2); color: var(--ot-text-2); padding: 1px 5px; border-radius: 4px; font-size: 11px; }
.cn-empty { padding: 28px; text-align: center; color: var(--ot-muted); background: var(--ot-surface); border-radius: 8px; font-size: 13px; }

.cn-list { display: flex; flex-direction: column; gap: 10px; }
.cn-card { background: var(--ot-surface); border: 1px solid var(--ot-line); border-radius: 10px; overflow: hidden; }
.cn-card-head { width: 100%; text-align: left; background: none; border: none; cursor: pointer; padding: 13px 14px; display: flex; gap: 10px; align-items: flex-start; color: inherit; }
.cn-card-head:hover { background: var(--ot-surface-2); }
.cn-card-main { flex: 1; min-width: 0; }
.cn-topic { font-size: 14px; font-weight: 600; color: var(--ot-text); }
.cn-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 5px; font-size: 11px; color: var(--ot-muted); }
.cn-badge { padding: 1px 7px; border-radius: 8px; text-transform: capitalize; }
.st-completed { background: var(--ot-positive-soft); color: var(--ot-positive); }
.st-running { background: var(--ot-violet-soft); color: var(--ot-violet); }
.st-failed, .st-cancelled { background: var(--ot-negative-soft); color: var(--ot-negative); }
.cn-purpose { text-transform: capitalize; }
.cn-urgency { color: var(--ot-warning); text-transform: capitalize; }
.cn-roles { color: var(--ot-warning); }
.cn-cost { color: var(--ot-positive); font-variant-numeric: tabular-nums; }
.cn-when { color: var(--ot-muted); }
.cn-excerpt { font-size: 12px; color: var(--ot-muted); margin-top: 7px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cn-caret { color: var(--ot-muted); flex-shrink: 0; padding-top: 2px; }

.cn-body { padding: 4px 14px 16px; border-top: 1px solid var(--ot-line); }
.cn-thin { font-size: 12px; color: var(--ot-muted); padding: 12px 0; }
.cn-error { color: var(--ot-negative); font-size: 12px; padding: 8px 0; }
.cn-round { margin-top: 14px; }
.cn-round-title { font-size: 12px; color: var(--ot-warning); text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px; }
.cn-round-title.cn-chair { color: var(--ot-warning); }
.cn-statement { border-left: 2px solid var(--ot-line); padding: 2px 0 8px 12px; margin-bottom: 8px; }
.cn-role { font-size: 12px; font-weight: 600; color: var(--ot-warning); margin-bottom: 3px; }
.cn-text { font-size: 13px; color: var(--ot-text-2); line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.cn-verdict { margin-top: 16px; background: var(--ot-warning-soft); border: 1px solid var(--ot-warning); border-radius: 8px; padding: 12px 14px; }
.cn-verdict-text { font-size: 13px; color: var(--ot-warning); line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }

@media (prefers-color-scheme: light) {
  .cn-panel { color: var(--ot-muted); }
  .cn-card { background: var(--ot-text); border-color: var(--ot-line-strong); }
  .cn-card-head:hover { background: var(--ot-text); }
  .cn-topic { color: var(--ot-muted); }
  .cn-empty { background: var(--ot-text); color: var(--ot-muted); }
  .cn-text { color: var(--ot-muted); }
  .cn-verdict { background: var(--ot-text); border-color: var(--ot-warning); }
  .cn-verdict-text { color: var(--ot-warning); }
}
</style>
