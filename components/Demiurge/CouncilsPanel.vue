<template>
  <div class="dmx-cn">
    <ul class="dmx-cn__list">
      <li v-for="c in councils" :key="c.councilID" class="dmx-cn__item" :data-open="expandedId === c.councilID || undefined">
        <button class="dmx-cn__head" type="button" :aria-expanded="expandedId === c.councilID" @click="toggle(c.councilID)">
          <DemiurgeIcon name="chevron-right" class="dmx-cn__caret" />
          <div class="dmx-cn__main">
            <div class="dmx-cn__topic">{{ c.topic }}</div>
            <div class="dmx-cn__meta">
              <span class="dmx-chip" :data-tone="statusTone(c.status)">{{ c.status }}</span>
              <span v-if="c.urgency && c.urgency !== 'routine'" class="dmx-chip" data-tone="need">{{ c.urgency }}</span>
              <span class="dmx-cn__purpose">{{ c.purpose }}</span>
              <span class="dmx-dim">{{ (c.roles || []).join(' · ') }} + Chair</span>
              <span class="dmx-mono dmx-dim">{{ cost(c.totalCostUsd) }}</span>
              <span class="dmx-faint">{{ fmtDate(c.createdAt) }}</span>
            </div>
            <p v-if="c.verdictExcerpt && expandedId !== c.councilID" class="dmx-cn__excerpt">{{ c.verdictExcerpt }}</p>
          </div>
        </button>

        <div v-if="expandedId === c.councilID" class="dmx-cn__body">
          <p v-if="loadingDetail" class="dmx-dim" style="font-size: 12px"><DemiurgeIcon name="refresh" class="dmx-spin" /> Loading the transcript…</p>
          <template v-else-if="detail">
            <div v-if="detail.error" class="dmx-banner" data-tone="fault" role="alert"><DemiurgeIcon name="alert" /><div class="dmx-banner__body">{{ detail.error }}</div></div>
            <section v-for="round in [1, 2]" v-show="statementsOf(round).length" :key="round" class="dmx-cn__round">
              <h4 class="dmx-gp__label">{{ round === 1 ? 'Round 1 · opening positions' : 'Round 2 · rebuttals' }}</h4>
              <div class="dmx-cn__seats">
                <article v-for="(st, i) in statementsOf(round)" :key="i" class="dmx-cn__seat">
                  <b>{{ st.role }}</b>
                  <p>{{ st.text }}</p>
                </article>
              </div>
            </section>
            <section v-if="detail.verdictText" class="dmx-cn__verdict">
              <h4 class="dmx-gp__label">Chair's verdict</h4>
              <p>{{ detail.verdictText }}</p>
            </section>
          </template>
        </div>
      </li>
    </ul>
    <p class="dmx-faint dmx-gp__foot">
      Opposing seats argue and rebut, then a Chair rules. The Commander convenes one (<code class="dmx-mono">convene_council</code>)
      before a plan, a pivot or an irreversible spend.
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import DemiurgeIcon from '~/components/Demiurge/Icon.vue';
import { dmxGet } from '~/composables/useDemiurgeConsole';
import { dmUsd, type DmTone } from '~/scripts/demiurgeConsole';

const props = defineProps<{ stewardId: string; councils: any[] }>();

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
  const r = await dmxGet<any>(`/demiurge/councils/get?stewardID=${encodeURIComponent(props.stewardId)}&councilID=${encodeURIComponent(id)}`);
  loadingDetail.value = false;
  if (expandedId.value !== id) return;
  detail.value = r.ok ? r.body : { error: `Could not load the transcript (${r.status ? `HTTP ${r.status}` : 'network error'}).` };
}

function statusTone(status: string): DmTone {
  const s = (status || '').toLowerCase();
  return s === 'completed' ? 'work' : s === 'running' ? 'plan' : s === 'failed' || s === 'cancelled' ? 'fault' : 'rest';
}
// Councils cost cents; two decimals would show most of them as $0.00.
function cost(v: number | null | undefined) { const n = Number(v) || 0; return n < 1 ? `$${n.toFixed(3)}` : dmUsd(n); }
function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
</script>
