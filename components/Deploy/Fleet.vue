<template>
  <section class="dpl-card dpl-fleet" aria-label="Deployments" data-testid="dpl-fleet">
    <header class="dpl-card__head">
      <h2 class="dpl-card__title"><DeployIcon name="layers" />Deployments</h2>
      <span class="dpl-card__meta dpl-num">{{ rows.length }} of {{ deployments.length }}</span>
      <div class="dpl-card__tools">
        <div class="dpl-seg" role="group" aria-label="Show">
          <button v-for="v in VIEWS" :key="v.id" class="dpl-seg__opt" :aria-pressed="view === v.id" :data-testid="`dpl-fleet-${v.id}`" @click="view = v.id">
            {{ v.label }}<span class="dpl-seg__count">{{ counts[v.id] }}</span>
          </button>
        </div>
      </div>
    </header>

    <div v-if="!loaded" class="dpl-skeleton" aria-busy="true"><span v-for="i in 3" :key="i"></span></div>
    <div v-else-if="!rows.length" class="dpl-empty">
      <DeployIcon name="rocket" />
      <span>{{ deployments.length ? 'Nothing in this view.' : 'No deployments yet. Pick a strategy on the right and it starts on paper.' }}</span>
    </div>

    <div v-else class="dpl-table" role="table" aria-label="Deployments">
      <div class="dpl-tr dpl-tr--head" role="row">
        <span role="columnheader">Strategy</span>
        <span role="columnheader">Health</span>
        <span role="columnheader" class="dpl-num">Equity</span>
        <span role="columnheader" class="dpl-num" title="Live return minus what its backtest made over the same time">vs test</span>
        <span role="columnheader" class="dpl-num">Orders</span>
        <span role="columnheader" class="dpl-num">Age</span>
        <span role="columnheader"><span class="dpl-sr">Actions</span></span>
      </div>
      <div
        v-for="d in rows"
        :key="d.Id"
        class="dpl-tr"
        role="row"
        tabindex="0"
        :data-selected="d.Id === selected || undefined"
        :data-focus="d.Id === focus || undefined"
        :data-testid="`dpl-row-${d.Id}`"
        @click="emit('open', d.Id)"
        @keydown.enter="emit('open', d.Id)"
      >
        <span class="dpl-td dpl-td--name" role="cell">
          <span class="dpl-mode" :data-mode="d.Mode" :data-armed="d.Armed || undefined" :title="d.Mode === 'Live' ? (d.Armed ? 'Live, armed' : 'Live, disarmed') : 'Paper'">{{ d.Mode === 'Live' ? (d.Armed ? 'LIVE' : 'live') : 'paper' }}</span>
          <span class="dpl-td__stack">
            <b class="dpl-truncate">{{ d.StrategyName ?? d.StrategyClass }}</b>
            <span class="dpl-dim dpl-truncate">
              {{ d.Shape === 'basket' ? 'basket' : d.Symbol }} · {{ intervalLabel(d.Interval) }}
              {{ d.Origin?.CandidateStatus ? ` · ${d.Origin.CandidateStatus}${d.Origin.Score != null ? ` ${Math.round(d.Origin.Score)}` : ''}` : '' }}
            </span>
          </span>
        </span>
        <span class="dpl-td" role="cell">
          <span class="dpl-health" :data-tone="healthOf(d).Tone" :title="healthOf(d).Detail ?? ''" :data-testid="`dpl-health-${d.Id}`">
            <i></i>{{ healthOf(d).Title }}
          </span>
        </span>
        <span class="dpl-td dpl-num" role="cell">
          <b>{{ moneyText(d.EquityCurrent) }}</b>
          <span :data-tone="signTone(d.PnLPercent)">{{ signedPctText(d.PnLPercent, 2) }}</span>
        </span>
        <span class="dpl-td dpl-num" role="cell" :title="pace(d)">
          <span :data-tone="signTone(vsExpected(d, now))">{{ vsExpected(d, now) == null ? '—' : signedPctText(vsExpected(d, now), 1) }}</span>
        </span>
        <span class="dpl-td dpl-num" role="cell" :title="d.Health?.LastOrderUtc ? `last ${agoText(d.Health.LastOrderUtc, now)}` : ''">
          {{ d.Health?.Orders ?? '—' }}<span v-if="d.Health?.Rejected" class="dpl-dim"> · {{ d.Health.Rejected }} refused</span>
        </span>
        <span class="dpl-td dpl-num dpl-dim" role="cell" :title="dateText(d.CreatedUtc)">{{ spanText(now - (toMillis(d.CreatedUtc) ?? now)) }}</span>
        <span class="dpl-td dpl-td--actions" role="cell" @click.stop>
          <button v-if="d.Mode === 'Live' && !d.Armed && d.Status !== 'Stopped' && canGoLive" class="dpl-btn dpl-btn--xs dpl-btn--danger" :disabled="!!busy" @click="emit('arm', d)">Arm…</button>
          <button v-if="d.Status === 'Running' && canControl" class="dpl-iconbtn dpl-iconbtn--sm" :disabled="!!busy" title="Pause" :aria-label="`Pause ${d.StrategyName ?? d.Id}`" @click="emit('act', d, 'pause')"><DeployIcon name="pause" /></button>
          <button v-else-if="d.Mode === 'Paper' && (d.Status === 'Paused' || d.Status === 'Stopped' || d.Status === 'Errored') && canControl" class="dpl-iconbtn dpl-iconbtn--sm" :disabled="!!busy" :title="d.Status === 'Paused' ? 'Resume' : 'Start again'" :aria-label="`Resume ${d.StrategyName ?? d.Id}`" @click="emit('act', d, 'resume')"><DeployIcon name="play" /></button>
          <button v-if="d.Status !== 'Stopped' && canManage" class="dpl-iconbtn dpl-iconbtn--sm" :disabled="!!busy" title="Stop" :aria-label="`Stop ${d.StrategyName ?? d.Id}`" @click="emit('act', d, 'kill')"><DeployIcon name="stop" /></button>
          <button v-else-if="canManage" class="dpl-iconbtn dpl-iconbtn--sm" :disabled="!!busy" title="Remove" :aria-label="`Remove ${d.StrategyName ?? d.Id}`" @click="emit('act', d, 'delete')"><DeployIcon name="trash" /></button>
        </span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  agoText, dateText, expectedReturnPct, healthOf, intervalLabel, isActive, moneyText, signTone, signedPctText, spanText, toMillis, vsExpected,
  type Deployment,
} from '~/scripts/deployConsole';

type View = 'active' | 'stopped' | 'all';
const VIEWS: { id: View; label: string }[] = [{ id: 'active', label: 'Active' }, { id: 'stopped', label: 'Stopped' }, { id: 'all', label: 'All' }];

/** Every deployment with its health, compactly; a row opens its sheet. */
const props = defineProps<{
  deployments: Deployment[]; loaded: boolean; now: number; selected?: string | null; focus?: string | null; busy?: string | null;
  canControl: boolean; canManage: boolean; canGoLive: boolean;
}>();
const emit = defineEmits<{ open: [id: string]; act: [d: Deployment, action: 'pause' | 'resume' | 'kill' | 'delete']; arm: [d: Deployment] }>();

const view = ref<View>('active');
const counts = computed(() => ({
  active: props.deployments.filter(isActive).length,
  stopped: props.deployments.filter(d => !isActive(d)).length,
  all: props.deployments.length,
}));
// With nothing active, show what there is.
watch(() => props.loaded, ok => { if (ok && !counts.value.active && counts.value.all) view.value = 'all'; }, { immediate: true });

const TONE_RANK: Record<string, number> = { crit: 0, warn: 1, info: 2, ok: 3, neutral: 4 };
const rows = computed(() => props.deployments
  .filter(d => view.value === 'all' || (view.value === 'active' ? isActive(d) : !isActive(d)))
  .slice()
  .sort((a, b) => Number(isActive(b)) - Number(isActive(a))
    || (TONE_RANK[healthOf(a).Tone] ?? 5) - (TONE_RANK[healthOf(b).Tone] ?? 5)
    || (toMillis(b.CreatedUtc) ?? 0) - (toMillis(a.CreatedUtc) ?? 0)));

function pace(d: Deployment) {
  const e = expectedReturnPct(d, props.now);
  return e == null ? 'No backtest pace on record (deployed before plans)' : `Its backtest would have made ${signedPctText(e, 2)} over the same time`;
}
</script>
