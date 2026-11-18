<template>
  <DemiurgeShell>
    <section class="dmx-card dmx-verdict" :data-tone="verdict.tone" aria-label="Analytics summary" data-testid="analytics-verdict">
      <span class="dmx-verdict__glyph"><DemiurgeIcon :name="verdict.icon" /></span>
      <div class="dmx-verdict__text">
        <h1 class="dmx-verdict__headline">{{ verdict.headline }}</h1>
        <p class="dmx-verdict__sub">{{ verdict.sub }}</p>
      </div>
      <div class="dmx-verdict__actions">
        <NuxtLink to="/demiurge/cost-simulator" class="dmx-btn"><DemiurgeIcon name="coins" />Re-price in the cost simulator</NuxtLink>
      </div>
    </section>

    <DemiurgeAnalyticsDashboard all-stewards compact-header @loaded="onLoaded" />
  </DemiurgeShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import DemiurgeShell from '~/components/Demiurge/Shell.vue';
import DemiurgeIcon from '~/components/Demiurge/Icon.vue';
import DemiurgeAnalyticsDashboard from '~/components/Demiurge/AnalyticsDashboard.vue';
import { dmUsd, type DmTone } from '~/scripts/demiurgeConsole';
import { fmtInt } from '~/scripts/adminConsole';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Demiurge · Analytics' });

const payload = ref<any>(null);
function onLoaded(value: any) { payload.value = value; }

// One sentence on the fleet's delivery in the chosen window, from the same payload the charts draw.
const verdict = computed<{ tone: DmTone; icon: string; headline: string; sub: string }>(() => {
  const p = payload.value;
  if (!p) return { tone: 'rest', icon: 'chart', headline: 'Fleet analytics', sub: 'Spend, tokens, activity and delivery across every Steward.' };
  const s = p.summary ?? {};
  const e = p.execution ?? {};
  const range = (p.range?.label || 'this window').toLowerCase();
  const wakes = Number(s.wakes ?? e.observedWakes ?? 0);
  const spend = Number(s.rangeSpendUsd ?? 0) + Number(s.rangeMoneySpendUsd ?? 0);
  const tail = `${dmUsd(spend)} spent · ${fmtInt(s.events ?? 0)} events · ${fmtInt(s.productiveActions ?? 0)} productive actions`;
  if (!wakes) return { tone: 'rest', icon: 'clock', headline: `No wakes in ${range}`, sub: `Nothing ran in this window. ${tail}.` };
  const active = typeof e.activeRate === 'number' ? e.activeRate : null;
  const productive = typeof e.productiveRate === 'number' ? e.productiveRate : null;
  const tone: DmTone = active == null ? 'info' : active >= 90 ? 'work' : active >= 60 ? 'need' : 'fault';
  const rates = [active != null ? `${active.toFixed(0)}% active` : '', productive != null ? `${productive.toFixed(0)}% productive` : ''].filter(Boolean).join(' · ');
  return {
    tone,
    icon: tone === 'work' ? 'zap' : tone === 'fault' ? 'alert' : 'chart',
    headline: `${fmtInt(wakes)} ${wakes === 1 ? 'wake' : 'wakes'}${rates ? ` · ${rates}` : ''}`,
    sub: `${range.charAt(0).toUpperCase()}${range.slice(1)} · ${tail}${typeof e.targetActiveRate === 'number' ? ` · target ${e.targetActiveRate}% active` : ''}`,
  };
});
</script>
