<template>
  <div class="pjx-cn">
    <ul class="pjx-cn__list">
      <li v-for="c in councils" :key="c.councilID" class="pjx-cn__item" :data-open="expandedId === c.councilID || undefined">
        <button class="pjx-cn__head" type="button" :aria-expanded="expandedId === c.councilID" @click="toggle(c.councilID)">
          <ProjectsIcon name="chevron-right" class="pjx-cn__caret" />
          <div class="pjx-cn__main">
            <div class="pjx-cn__topic">{{ c.topic }}</div>
            <div class="pjx-cn__meta">
              <span class="pjx-chip" :data-tone="statusTone(c.status)">{{ c.status }}</span>
              <span v-if="c.urgency && c.urgency !== 'routine'" class="pjx-chip" data-tone="need">{{ c.urgency }}</span>
              <span class="pjx-cn__purpose">{{ c.purpose }}</span>
              <span class="pjx-dim">{{ (c.roles || []).join(' · ') }} + Chair</span>
              <span class="pjx-mono pjx-dim">{{ cost(c.totalCostUsd) }}</span>
              <span class="pjx-faint">{{ fmtDate(c.createdAt) }}</span>
            </div>
            <p v-if="c.verdictExcerpt && expandedId !== c.councilID" class="pjx-cn__excerpt">{{ c.verdictExcerpt }}</p>
          </div>
        </button>

        <div v-if="expandedId === c.councilID" class="pjx-cn__body">
          <p v-if="loadingDetail" class="pjx-dim" style="font-size: 12px"><ProjectsIcon name="refresh" class="pjx-spin" /> Loading the transcript…</p>
          <template v-else-if="detail">
            <div v-if="detail.error" class="pjx-banner" data-tone="fault" role="alert"><ProjectsIcon name="alert" /><div class="pjx-banner__body">{{ detail.error }}</div></div>
            <section v-for="round in [1, 2]" v-show="statementsOf(round).length" :key="round" class="pjx-cn__round">
              <h4 class="pjx-gp__label">{{ round === 1 ? 'Round 1 · opening positions' : 'Round 2 · rebuttals' }}</h4>
              <div class="pjx-cn__seats">
                <article v-for="(st, i) in statementsOf(round)" :key="i" class="pjx-cn__seat">
                  <b>{{ st.role }}</b>
                  <p>{{ st.text }}</p>
                </article>
              </div>
            </section>
            <section v-if="detail.verdictText" class="pjx-cn__verdict">
              <h4 class="pjx-gp__label">Chair's verdict</h4>
              <p>{{ detail.verdictText }}</p>
            </section>
          </template>
        </div>
      </li>
    </ul>
    <p class="pjx-faint pjx-gp__foot">
      Opposing seats argue and rebut, then a Chair rules. The Commander convenes one (<code class="pjx-mono">convene_council</code>)
      before a plan, a pivot or an irreversible spend.
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import { pjxGet } from '~/composables/useProjectsConsole';
import { pjUsd, type PjTone } from '~/scripts/projectsConsole';

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
  const r = await pjxGet<any>(`/projects/councils/get?projectID=${encodeURIComponent(props.projectId)}&councilID=${encodeURIComponent(id)}`);
  loadingDetail.value = false;
  if (expandedId.value !== id) return;
  detail.value = r.ok ? r.body : { error: `Could not load the transcript (${r.status ? `HTTP ${r.status}` : 'network error'}).` };
}

function statusTone(status: string): PjTone {
  const s = (status || '').toLowerCase();
  return s === 'completed' ? 'work' : s === 'running' ? 'plan' : s === 'failed' || s === 'cancelled' ? 'fault' : 'rest';
}
// Councils cost cents; two decimals would show most of them as $0.00.
function cost(v: number | null | undefined) { const n = Number(v) || 0; return n < 1 ? `$${n.toFixed(3)}` : pjUsd(n); }
function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
</script>
