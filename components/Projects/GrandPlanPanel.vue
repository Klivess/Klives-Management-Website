<template>
  <div class="pjx-gp">
    <div v-if="!versions.length" class="pjx-empty">
      <ProjectsIcon name="target" />
      <b>No Grand Plan yet</b>
      <span>The Commander is still researching and drafting. It appears here, and in your approvals, when it is ready.</span>
    </div>

    <template v-else>
      <div class="pjx-gp__bar">
        <div class="pjx-seg pjx-gp__versions" role="group" aria-label="Grand Plan versions">
          <button v-for="v in versions" :key="v.version" type="button" class="pjx-seg__opt" :aria-pressed="shownVersion === v.version"
            :title="statusLabel(v.status)" @click="shownVersion = v.version">
            v{{ v.version }}<span class="pjx-chip__dot" :data-tone="versionTone(v.status)" aria-hidden="true"></span>
          </button>
        </div>
        <template v-if="shown">
          <span class="pjx-chip" :data-tone="versionTone(shown.status)">{{ statusLabel(shown.status) }}</span>
          <span class="pjx-dim pjx-gp__when">submitted {{ fmtDate(shown.submittedAt) }}<template v-if="shown.resolvedAt"> · resolved {{ fmtDate(shown.resolvedAt) }}</template></span>
        </template>
      </div>

      <template v-if="shown">
        <p v-if="shown.changeNote" class="pjx-note" data-tone="need"><b>Change:</b> {{ shown.changeNote }}</p>
        <p v-if="shown.klivesComment" class="pjx-note" data-tone="info"><b>Your note:</b> {{ shown.klivesComment }}</p>

        <!-- Structured plan -->
        <template v-if="content">
          <div class="pjx-gp__mission">
            <span class="pjx-gp__label">Mission</span>
            <p>{{ content.mission }}</p>
          </div>

          <div v-if="milestones.length || criteria.length" class="pjx-gp__progress">
            <div class="pjx-meter" style="height: 6px"><span class="pjx-meter__fill" :style="{ width: progressPct + '%', background: 'var(--pjx-work)' }"></span></div>
            <div class="pjx-gp__legend">
              <span v-if="milestones.length"><b class="pjx-num">{{ doneCount }}</b>/{{ milestones.length }} milestones</span>
              <span v-if="criteria.length"><b class="pjx-num">{{ metCount }}</b>/{{ criteria.length }} success criteria</span>
              <b class="pjx-num pjx-gp__pct">{{ progressPct }}%</b>
            </div>
          </div>

          <div class="pjx-gp__grid">
            <section v-if="milestones.length" class="pjx-gp__section" aria-label="Milestones">
              <h4 class="pjx-gp__label">Milestones</h4>
              <ul class="pjx-gp__ms">
                <li v-for="m in milestones" :key="m.id" :data-tone="msTone(m.status)">
                  <span class="pjx-gp__ms-mark" aria-hidden="true"><ProjectsIcon :name="msIcon(m.status)" /></span>
                  <div class="pjx-gp__ms-body">
                    <div class="pjx-gp__ms-title">
                      <span>{{ m.title }}</span>
                      <span class="pjx-chip" :data-tone="msTone(m.status)">{{ msStatusLabel(m.status) }}</span>
                    </div>
                    <p v-if="m.detail" class="pjx-gp__ms-detail">{{ m.detail }}</p>
                    <p v-if="m.target" class="pjx-gp__ms-target"><ProjectsIcon name="target" />{{ m.target }}</p>
                  </div>
                </li>
              </ul>
            </section>

            <div class="pjx-gp__side">
              <section v-if="criteria.length" class="pjx-gp__section" aria-label="Success criteria">
                <h4 class="pjx-gp__label">Success criteria</h4>
                <ul class="pjx-gp__criteria">
                  <li v-for="c in criteria" :key="c.id" :data-met="c.met || undefined">
                    <ProjectsIcon :name="c.met ? 'check-circle' : 'dot'" />
                    <span>{{ c.text }}</span>
                  </li>
                </ul>
              </section>

              <section v-if="risks.length" class="pjx-gp__section" aria-label="Risks">
                <h4 class="pjx-gp__label">Risks</h4>
                <ul class="pjx-gp__risks">
                  <li v-for="r in risks" :key="r.id">
                    <span class="pjx-chip" :data-tone="riskTone(r.severity)">{{ r.severity || 'Risk' }}</span>
                    <div>
                      <span>{{ r.description }}</span>
                      <span v-if="r.mitigation" class="pjx-dim"> → {{ r.mitigation }}</span>
                    </div>
                  </li>
                </ul>
              </section>

              <section v-if="workstreams.length" class="pjx-gp__section" aria-label="Workstreams">
                <h4 class="pjx-gp__label">Workstreams</h4>
                <ul class="pjx-gp__ws">
                  <li v-for="w in workstreams" :key="w.id">
                    <b>{{ w.name }}</b>
                    <span v-if="w.description" class="pjx-dim">{{ w.description }}</span>
                  </li>
                </ul>
              </section>
            </div>
          </div>

          <section v-if="content.budgetPlan" class="pjx-gp__section" aria-label="Budget plan">
            <h4 class="pjx-gp__label">Budget plan</h4>
            <div class="pj-prose pjx-gp__prose" v-html="renderMarkdown(content.budgetPlan)"></div>
          </section>
        </template>

        <!-- Older versions were markdown only: rendered, not raw. -->
        <div v-else-if="shown.markdown" class="pj-prose pjx-gp__prose" v-html="renderMarkdown(shown.markdown)"></div>
      </template>

      <p class="pjx-faint pjx-gp__foot">
        Milestones and criteria tick off live as the work advances (<code class="pjx-mono">update_plan_progress</code>);
        the Commander revises the plan with <code class="pjx-mono">amend_grand_plan</code>, and every revision comes back to you.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import { renderMarkdown } from '~/scripts/agentMarkdown';
import type { PjTone } from '~/scripts/projectsConsole';

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
  return total ? Math.round(((doneCount.value + metCount.value) / total) * 100) : 0;
});

// Server enum → key: "InProgress" → "in-progress".
function statusKey(s: string): string { return (s || '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(); }
function msStatusLabel(s: string): string {
  return ({ pending: 'Pending', 'in-progress': 'In progress', done: 'Done', blocked: 'Blocked' } as Record<string, string>)[statusKey(s)] || s;
}
function msTone(s: string): PjTone {
  return ({ done: 'work', 'in-progress': 'info', blocked: 'fault' } as Record<string, PjTone>)[statusKey(s)] ?? 'rest';
}
function msIcon(s: string): string {
  return ({ done: 'check-circle', 'in-progress': 'clock', blocked: 'alert' } as Record<string, string>)[statusKey(s)] ?? 'dot';
}
function riskTone(severity: string): PjTone {
  const s = (severity || '').toLowerCase();
  return s === 'high' || s === 'critical' ? 'fault' : s === 'medium' ? 'need' : 'rest';
}
function versionTone(s: string): PjTone {
  return s === 'Approved' ? 'work' : s === 'PendingApproval' ? 'need' : s === 'Rejected' ? 'fault' : 'rest';
}
function statusLabel(s: string): string {
  return ({ PendingApproval: 'Pending approval', Approved: 'Approved', Rejected: 'Rejected', Superseded: 'Superseded' } as Record<string, string>)[s] ?? s;
}
function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
</script>
