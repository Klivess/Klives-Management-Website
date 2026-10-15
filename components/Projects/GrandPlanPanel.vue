<template>
  <div class="gp-panel">
    <p class="gp-intro">
      The Grand Plan is this project's strategic north star — the Commander drafts it and you approve it
      before work begins. Milestones and success criteria are ticked off live as work advances
      (<code>update_plan_progress</code>); the plan is revised with <code>amend_grand_plan</code>.
    </p>

    <div v-if="!versions.length" class="gp-empty">
      No Grand Plan yet — the Commander is still researching and drafting. It'll appear here for your approval.
    </div>

    <template v-else>
      <div class="gp-versions">
        <button
          v-for="v in versions"
          :key="v.version"
          class="gp-vtab"
          :class="{ active: shownVersion === v.version }"
          @click="shownVersion = v.version"
        >
          v{{ v.version }}
          <span class="gp-vbadge" :class="'st-' + (v.status || '').toLowerCase()">{{ statusLabel(v.status) }}</span>
        </button>
      </div>

      <div v-if="shown" class="gp-doc">
        <div class="gp-doc-head">
          <div>
            <span class="gp-vbadge big" :class="'st-' + (shown.status || '').toLowerCase()">{{ statusLabel(shown.status) }}</span>
            <span class="gp-when">submitted {{ fmtDate(shown.submittedAt) }}<template v-if="shown.resolvedAt"> · resolved {{ fmtDate(shown.resolvedAt) }}</template></span>
          </div>
        </div>
        <p v-if="shown.changeNote" class="gp-note"><strong>Change:</strong> {{ shown.changeNote }}</p>
        <p v-if="shown.klivesComment" class="gp-comment"><strong>Your note:</strong> {{ shown.klivesComment }}</p>

        <!-- Structured, analytical view -->
        <template v-if="content">
          <div class="gp-mission">
            <div class="gp-mission-label">Mission</div>
            <div class="gp-mission-text">{{ content.mission }}</div>
          </div>

          <div v-if="milestones.length || criteria.length" class="gp-progress">
            <div class="gp-prog-track"><div class="gp-prog-fill" :style="{ width: progressPct + '%' }"></div></div>
            <div class="gp-prog-legend">
              <span v-if="milestones.length"><strong>{{ doneCount }}</strong>/{{ milestones.length }} milestones</span>
              <span v-if="criteria.length"><strong>{{ metCount }}</strong>/{{ criteria.length }} criteria</span>
              <span class="gp-prog-pct">{{ progressPct }}%</span>
            </div>
          </div>

          <section v-if="milestones.length" class="gp-section">
            <h4 class="gp-h">Milestones</h4>
            <ul class="ms-list">
              <li v-for="m in milestones" :key="m.id" class="ms-row" :class="'ms-' + statusKey(m.status)">
                <span class="ms-ico">{{ statusIcon(m.status) }}</span>
                <div class="ms-body">
                  <div class="ms-title">
                    {{ m.title }}
                    <span class="ms-badge" :class="'ms-' + statusKey(m.status)">{{ msStatusLabel(m.status) }}</span>
                  </div>
                  <div v-if="m.detail" class="ms-detail">{{ m.detail }}</div>
                  <div v-if="m.target" class="ms-target">target: {{ m.target }}</div>
                </div>
              </li>
            </ul>
          </section>

          <section v-if="criteria.length" class="gp-section">
            <h4 class="gp-h">Success criteria</h4>
            <ul class="cr-list">
              <li v-for="c in criteria" :key="c.id" class="cr-row" :class="{ met: c.met }">
                <span class="cr-box">{{ c.met ? '☑' : '☐' }}</span>
                <span class="cr-text">{{ c.text }}</span>
              </li>
            </ul>
          </section>

          <section v-if="risks.length" class="gp-section">
            <h4 class="gp-h">Risks</h4>
            <ul class="rk-list">
              <li v-for="r in risks" :key="r.id" class="rk-row">
                <span class="rk-sev" :class="'sev-' + (r.severity || '').toLowerCase()">{{ r.severity }}</span>
                <div class="rk-body">
                  <span class="rk-desc">{{ r.description }}</span>
                  <span v-if="r.mitigation" class="rk-mit">→ {{ r.mitigation }}</span>
                </div>
              </li>
            </ul>
          </section>

          <section v-if="workstreams.length" class="gp-section">
            <h4 class="gp-h">Workstreams</h4>
            <div class="ws-grid">
              <div v-for="w in workstreams" :key="w.id" class="ws-card">
                <div class="ws-name">{{ w.name }}</div>
                <div v-if="w.description" class="ws-desc">{{ w.description }}</div>
              </div>
            </div>
          </section>

          <section v-if="content.budgetPlan" class="gp-section">
            <h4 class="gp-h">Budget plan</h4>
            <div class="gp-prose" v-html="renderMarkdown(content.budgetPlan)"></div>
          </section>
        </template>

        <!-- Legacy markdown-only versions: render formatted, not raw -->
        <div v-else-if="shown.markdown" class="gp-prose gp-legacy" v-html="renderMarkdown(shown.markdown)"></div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { renderMarkdown } from '~/scripts/agentMarkdown';

const props = defineProps<{ projectId: string; grandPlan: any }>();

const versions = computed<any[]>(() => props.grandPlan?.versions ?? []);
const shownVersion = ref<number | null>(null);

// Default to the current approved version, else the newest.
watch(versions, (vs) => {
  if (shownVersion.value != null && vs.some(v => v.version === shownVersion.value)) return;
  const approved = props.grandPlan?.current?.version;
  shownVersion.value = approved ?? (vs[0]?.version ?? null);
}, { immediate: true });

const shown = computed(() => versions.value.find(v => v.version === shownVersion.value) ?? null);
const content = computed<any | null>(() => shown.value?.content ?? null);
const milestones = computed<any[]>(() => content.value?.milestones ?? []);
const criteria = computed<any[]>(() => content.value?.successCriteria ?? []);
const risks = computed<any[]>(() => content.value?.risks ?? []);
const workstreams = computed<any[]>(() => content.value?.workstreams ?? []);

const doneCount = computed(() => milestones.value.filter(m => statusKey(m.status) === 'done').length);
const metCount = computed(() => criteria.value.filter(c => c.met).length);
const progressPct = computed(() => {
  const total = milestones.value.length + criteria.value.length;
  if (!total) return 0;
  return Math.round(((doneCount.value + metCount.value) / total) * 100);
});

// Server enum → CSS key: "InProgress" → "in-progress".
function statusKey(s: string): string {
  return (s || '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
function msStatusLabel(s: string): string {
  return ({ pending: 'Pending', 'in-progress': 'In progress', done: 'Done', blocked: 'Blocked' } as any)[statusKey(s)] || s;
}
function statusIcon(s: string): string {
  return ({ pending: '○', 'in-progress': '◐', done: '✓', blocked: '⚠' } as any)[statusKey(s)] || '○';
}

function statusLabel(s: string): string {
  switch (s) {
    case 'PendingApproval': return 'Pending approval';
    case 'Approved': return 'Approved';
    case 'Rejected': return 'Rejected';
    case 'Superseded': return 'Superseded';
    default: return s;
  }
}
function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
</script>

<style scoped>
.gp-panel { color: var(--ot-text); }
.gp-intro { font-size: 12px; color: var(--ot-muted); margin: 0 0 14px; line-height: 1.5; }
.gp-intro code { background: var(--ot-surface-2); color: var(--ot-text-2); padding: 1px 5px; border-radius: 4px; font-size: 11px; }
.gp-empty { padding: 28px; text-align: center; color: var(--ot-muted); background: var(--ot-surface); border-radius: 8px; font-size: 13px; }

.gp-versions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.gp-vtab { background: var(--ot-surface-2); border: 1px solid var(--ot-line); color: var(--ot-text-2); border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 13px; display: inline-flex; align-items: center; gap: 8px; }
.gp-vtab.active { border-color: var(--ot-violet); color: var(--ot-text); }

.gp-vbadge { font-size: 10px; padding: 1px 6px; border-radius: 7px; text-transform: capitalize; }
.gp-vbadge.big { font-size: 11px; padding: 2px 9px; margin-right: 8px; }
.st-approved { background: var(--ot-positive-soft); color: var(--ot-positive); }
.st-pendingapproval { background: var(--ot-warning-soft); color: var(--ot-warning); }
.st-rejected { background: var(--ot-negative-soft); color: var(--ot-negative); }
.st-superseded { background: var(--ot-surface-3); color: var(--ot-muted); }

.gp-doc { background: var(--ot-surface); border: 1px solid var(--ot-line); border-radius: 10px; padding: 16px; }
.gp-doc-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.gp-when { font-size: 11px; color: var(--ot-muted); }
.gp-note, .gp-comment { font-size: 12px; color: var(--ot-text-2); margin: 0 0 8px; line-height: 1.5; }
.gp-note strong, .gp-comment strong { color: var(--ot-warning); }

/* Mission */
.gp-mission { border-top: 1px solid var(--ot-line); padding-top: 14px; margin-top: 6px; }
.gp-mission-label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ot-muted); margin-bottom: 4px; }
.gp-mission-text { font-size: 15px; color: var(--ot-text); line-height: 1.45; font-weight: 500; }

/* Progress */
.gp-progress { margin: 14px 0 4px; }
.gp-prog-track { height: 8px; background: var(--ot-surface-2); border-radius: 6px; overflow: hidden; }
.gp-prog-fill { height: 100%; background: linear-gradient(90deg, var(--ot-accent), var(--ot-accent)); border-radius: 6px; transition: width .35s ease; }
.gp-prog-legend { display: flex; gap: 14px; align-items: center; font-size: 12px; color: var(--ot-muted); margin-top: 6px; }
.gp-prog-legend strong { color: var(--ot-text-2); }
.gp-prog-pct { margin-left: auto; color: var(--ot-positive); font-weight: 600; }

/* Sections */
.gp-section { margin-top: 18px; }
.gp-h { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ot-muted); margin: 0 0 8px; }

/* Milestones */
.ms-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ms-row { display: flex; gap: 10px; align-items: flex-start; background: var(--ot-surface-2); border: 1px solid var(--ot-line); border-left-width: 3px; border-radius: 8px; padding: 9px 11px; }
.ms-row.ms-done { border-left-color: var(--ot-accent); }
.ms-row.ms-in-progress { border-left-color: var(--ot-warning); }
.ms-row.ms-blocked { border-left-color: var(--ot-negative); }
.ms-row.ms-pending { border-left-color: var(--ot-line-strong); }
.ms-ico { font-size: 14px; line-height: 1.5; width: 16px; text-align: center; flex: none; }
.ms-done .ms-ico { color: var(--ot-positive); }
.ms-in-progress .ms-ico { color: var(--ot-warning); }
.ms-blocked .ms-ico { color: var(--ot-violet); }
.ms-pending .ms-ico { color: var(--ot-muted); }
.ms-body { flex: 1; min-width: 0; }
.ms-title { font-size: 13px; color: var(--ot-text); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ms-done .ms-title { color: var(--ot-text-2); }
.ms-badge { font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; padding: 1px 6px; border-radius: 6px; }
.ms-badge.ms-done { background: var(--ot-positive-soft); color: var(--ot-positive); }
.ms-badge.ms-in-progress { background: var(--ot-warning-soft); color: var(--ot-warning); }
.ms-badge.ms-blocked { background: var(--ot-negative-soft); color: var(--ot-violet); }
.ms-badge.ms-pending { background: var(--ot-surface-2); color: var(--ot-muted); }
.ms-detail { font-size: 12px; color: var(--ot-muted); margin-top: 3px; line-height: 1.45; }
.ms-target { font-size: 11px; color: var(--ot-muted); margin-top: 3px; }

/* Success criteria */
.cr-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.cr-row { display: flex; gap: 9px; align-items: flex-start; font-size: 13px; color: var(--ot-text-2); line-height: 1.45; }
.cr-box { color: var(--ot-muted); flex: none; }
.cr-row.met .cr-box { color: var(--ot-positive); }
.cr-row.met .cr-text { color: var(--ot-muted); }

/* Risks */
.rk-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.rk-row { display: flex; gap: 10px; align-items: baseline; font-size: 13px; }
.rk-sev { font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; padding: 2px 7px; border-radius: 6px; flex: none; min-width: 46px; text-align: center; }
.sev-high { background: var(--ot-negative-soft); color: var(--ot-violet); }
.sev-medium { background: var(--ot-warning-soft); color: var(--ot-warning); }
.sev-low { background: var(--ot-surface-2); color: var(--ot-positive); }
.rk-body { color: var(--ot-text-2); line-height: 1.45; }
.rk-desc { color: var(--ot-text); }
.rk-mit { color: var(--ot-muted); margin-left: 6px; }

/* Workstreams */
.ws-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
.ws-card { background: var(--ot-surface-2); border: 1px solid var(--ot-line); border-radius: 8px; padding: 10px 12px; }
.ws-name { font-size: 13px; color: var(--ot-text); font-weight: 600; }
.ws-desc { font-size: 12px; color: var(--ot-muted); margin-top: 4px; line-height: 1.45; }

/* Prose (budget plan + legacy markdown) */
.gp-prose { font-size: 13px; color: var(--ot-text); line-height: 1.6; overflow-wrap: anywhere; }
.gp-prose :deep(h1), .gp-prose :deep(h2), .gp-prose :deep(h3) { font-size: 14px; color: var(--ot-text); margin: 12px 0 6px; }
.gp-prose :deep(ul) { padding-left: 20px; margin: 6px 0; }
.gp-prose :deep(code) { background: var(--ot-surface-2); color: var(--ot-text-2); padding: 1px 5px; border-radius: 4px; font-size: 12px; }
.gp-legacy { border-top: 1px solid var(--ot-line); padding-top: 12px; margin-top: 6px; }

@media (prefers-color-scheme: light) {
  .gp-panel { color: var(--ot-muted); }
  .gp-empty, .gp-doc { background: var(--ot-text); border-color: var(--ot-line-strong); }
  .gp-vtab { background: var(--ot-text); border-color: var(--ot-line-strong); color: var(--ot-muted); }
  .gp-mission-text { color: var(--ot-muted); }
  .gp-mission, .gp-legacy { border-top-color: var(--ot-line-strong); }
  .gp-prog-track { background: var(--ot-text); }
  .ms-row, .ws-card { background: var(--ot-text); border-color: var(--ot-line-strong); }
  .ms-title { color: var(--ot-muted); }
  .ms-done .ms-title { color: var(--ot-muted); }
  .cr-row, .rk-body, .ws-desc, .ms-detail { color: var(--ot-muted); }
  .gp-prose { color: var(--ot-muted); }
}
:root[data-theme="dark"] .gp-panel { color: var(--ot-text); }
:root[data-theme="light"] .gp-panel { color: var(--ot-muted); }
:root[data-theme="light"] .gp-empty, :root[data-theme="light"] .gp-doc { background: var(--ot-text); border-color: var(--ot-line-strong); }
:root[data-theme="light"] .gp-mission-text { color: var(--ot-muted); }
:root[data-theme="light"] .ms-row, :root[data-theme="light"] .ws-card { background: var(--ot-text); border-color: var(--ot-line-strong); }
</style>
