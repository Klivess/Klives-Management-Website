<template>
  <div class="dmx-gp">
    <div v-if="!versions.length" class="dmx-empty">
      <DemiurgeIcon name="target" />
      <b>No Grand Plan yet</b>
      <span>The Commander is still researching and drafting. It appears here, and in your approvals, when it is ready.</span>
    </div>

    <template v-else>
      <div class="dmx-gp__bar">
        <div class="dmx-seg dmx-gp__versions" role="group" aria-label="Grand Plan versions">
          <button v-for="v in versions" :key="v.version" type="button" class="dmx-seg__opt" :aria-pressed="shownVersion === v.version"
            :title="statusLabel(v.status)" @click="shownVersion = v.version">
            v{{ v.version }}<span class="dmx-chip__dot" :data-tone="versionTone(v.status)" aria-hidden="true"></span>
          </button>
        </div>
        <template v-if="shown">
          <span class="dmx-chip" :data-tone="versionTone(shown.status)">{{ statusLabel(shown.status) }}</span>
          <span class="dmx-dim dmx-gp__when">submitted {{ fmtDate(shown.submittedAt) }}<template v-if="shown.resolvedAt"> · resolved {{ fmtDate(shown.resolvedAt) }}</template></span>
        </template>
      </div>

      <template v-if="shown">
        <p v-if="shown.changeNote" class="dmx-note" data-tone="need"><b>Change:</b> {{ shown.changeNote }}</p>
        <p v-if="shown.klivesComment" class="dmx-note" data-tone="info"><b>Your note:</b> {{ shown.klivesComment }}</p>

        <!-- Structured plan -->
        <template v-if="content">
          <div class="dmx-gp__mission">
            <span class="dmx-gp__label">Mission</span>
            <p>{{ content.mission }}</p>
          </div>

          <div v-if="milestones.length || criteria.length" class="dmx-gp__progress">
            <div class="dmx-meter" style="height: 6px"><span class="dmx-meter__fill" :style="{ width: progressPct + '%', background: 'var(--dmx-work)' }"></span></div>
            <div class="dmx-gp__legend">
              <span v-if="milestones.length"><b class="dmx-num">{{ doneCount }}</b>/{{ milestones.length }} milestones</span>
              <span v-if="criteria.length"><b class="dmx-num">{{ metCount }}</b>/{{ criteria.length }} success criteria</span>
              <b class="dmx-num dmx-gp__pct">{{ progressPct }}%</b>
            </div>
          </div>

          <div class="dmx-gp__grid">
            <section v-if="milestones.length" class="dmx-gp__section" aria-label="Milestones">
              <h4 class="dmx-gp__label">Milestones</h4>
              <ul class="dmx-gp__ms">
                <li v-for="m in milestones" :key="m.id" :data-tone="msTone(m.status)">
                  <span class="dmx-gp__ms-mark" aria-hidden="true"><DemiurgeIcon :name="msIcon(m.status)" /></span>
                  <div class="dmx-gp__ms-body">
                    <div class="dmx-gp__ms-title">
                      <span>{{ m.title }}</span>
                      <span class="dmx-chip" :data-tone="msTone(m.status)">{{ msStatusLabel(m.status) }}</span>
                    </div>
                    <p v-if="m.detail" class="dmx-gp__ms-detail">{{ m.detail }}</p>
                    <p v-if="m.target" class="dmx-gp__ms-target"><DemiurgeIcon name="target" />{{ m.target }}</p>
                  </div>
                </li>
              </ul>
            </section>

            <div class="dmx-gp__side">
              <section v-if="criteria.length" class="dmx-gp__section" aria-label="Success criteria">
                <h4 class="dmx-gp__label">Success criteria</h4>
                <ul class="dmx-gp__criteria">
                  <li v-for="c in criteria" :key="c.id" :data-met="c.met || undefined">
                    <DemiurgeIcon :name="c.met ? 'check-circle' : 'dot'" />
                    <span>{{ c.text }}</span>
                  </li>
                </ul>
              </section>

              <section v-if="risks.length" class="dmx-gp__section" aria-label="Risks">
                <h4 class="dmx-gp__label">Risks</h4>
                <ul class="dmx-gp__risks">
                  <li v-for="r in risks" :key="r.id">
                    <span class="dmx-chip" :data-tone="riskTone(r.severity)">{{ r.severity || 'Risk' }}</span>
                    <div>
                      <span>{{ r.description }}</span>
                      <span v-if="r.mitigation" class="dmx-dim"> → {{ r.mitigation }}</span>
                    </div>
                  </li>
                </ul>
              </section>

              <section v-if="workstreams.length" class="dmx-gp__section" aria-label="Workstreams">
                <h4 class="dmx-gp__label">Workstreams</h4>
                <ul class="dmx-gp__ws">
                  <li v-for="w in workstreams" :key="w.id">
                    <b>{{ w.name }}</b>
                    <span v-if="w.description" class="dmx-dim">{{ w.description }}</span>
                  </li>
                </ul>
              </section>
            </div>
          </div>

          <section v-if="content.budgetPlan" class="dmx-gp__section" aria-label="Budget plan">
            <h4 class="dmx-gp__label">Budget plan</h4>
            <div class="dm-prose dmx-gp__prose" v-html="renderMarkdown(content.budgetPlan)"></div>
          </section>
        </template>

        <!-- Older versions were markdown only: rendered, not raw. -->
        <div v-else-if="shown.markdown" class="dm-prose dmx-gp__prose" v-html="renderMarkdown(shown.markdown)"></div>
      </template>

      <p class="dmx-faint dmx-gp__foot">
        Milestones and criteria tick off live as the work advances (<code class="dmx-mono">update_plan_progress</code>);
        the Commander revises the plan with <code class="dmx-mono">amend_grand_plan</code>, and every revision comes back to you.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import DemiurgeIcon from '~/components/Demiurge/Icon.vue';
import { renderMarkdown } from '~/scripts/agentMarkdown';
import type { DmTone } from '~/scripts/demiurgeConsole';

const props = defineProps<{ stewardId: string; grandPlan: any }>();

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
function msTone(s: string): DmTone {
  return ({ done: 'work', 'in-progress': 'info', blocked: 'fault' } as Record<string, DmTone>)[statusKey(s)] ?? 'rest';
}
function msIcon(s: string): string {
  return ({ done: 'check-circle', 'in-progress': 'clock', blocked: 'alert' } as Record<string, string>)[statusKey(s)] ?? 'dot';
}
function riskTone(severity: string): DmTone {
  const s = (severity || '').toLowerCase();
  return s === 'high' || s === 'critical' ? 'fault' : s === 'medium' ? 'need' : 'rest';
}
function versionTone(s: string): DmTone {
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
