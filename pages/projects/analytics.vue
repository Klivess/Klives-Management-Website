<template>
  <ProjectsShell>
    <section class="pjx-card pjx-verdict" :data-tone="verdict.tone" aria-label="Analytics summary" data-testid="analytics-verdict">
      <span class="pjx-verdict__glyph"><ProjectsIcon :name="verdict.icon" /></span>
      <div class="pjx-verdict__text">
        <h1 class="pjx-verdict__headline">{{ verdict.headline }}</h1>
        <p class="pjx-verdict__sub">{{ verdict.sub }}</p>
      </div>
      <div class="pjx-verdict__actions">
        <NuxtLink to="/projects/cost-simulator" class="pjx-btn"><ProjectsIcon name="coins" />Re-price in the cost simulator</NuxtLink>
      </div>
    </section>

    <ProjectsAnalyticsDashboard all-projects compact-header @loaded="onLoaded" />
  </ProjectsShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import ProjectsShell from '~/components/Projects/Shell.vue';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import ProjectsAnalyticsDashboard from '~/components/Projects/AnalyticsDashboard.vue';
import { pjUsd, type PjTone } from '~/scripts/projectsConsole';
import { fmtInt } from '~/scripts/adminConsole';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Projects · Analytics' });

const payload = ref<any>(null);
function onLoaded(value: any) { payload.value = value; }

// One sentence on the fleet's delivery in the chosen window, from the same payload the charts draw.
const verdict = computed<{ tone: PjTone; icon: string; headline: string; sub: string }>(() => {
  const p = payload.value;
  if (!p) return { tone: 'rest', icon: 'chart', headline: 'Fleet analytics', sub: 'Spend, tokens, activity and delivery across every project.' };
  const s = p.summary ?? {};
  const e = p.execution ?? {};
  const range = (p.range?.label || 'this window').toLowerCase();
  const wakes = Number(s.wakes ?? e.observedWakes ?? 0);
  const spend = Number(s.rangeSpendUsd ?? 0) + Number(s.rangeMoneySpendUsd ?? 0);
  const tail = `${pjUsd(spend)} spent · ${fmtInt(s.events ?? 0)} events · ${fmtInt(s.productiveActions ?? 0)} productive actions`;
  if (!wakes) return { tone: 'rest', icon: 'clock', headline: `No wakes in ${range}`, sub: `Nothing ran in this window. ${tail}.` };
  const active = typeof e.activeRate === 'number' ? e.activeRate : null;
  const productive = typeof e.productiveRate === 'number' ? e.productiveRate : null;
  const tone: PjTone = active == null ? 'info' : active >= 90 ? 'work' : active >= 60 ? 'need' : 'fault';
  const rates = [active != null ? `${active.toFixed(0)}% active` : '', productive != null ? `${productive.toFixed(0)}% productive` : ''].filter(Boolean).join(' · ');
  return {
    tone,
    icon: tone === 'work' ? 'zap' : tone === 'fault' ? 'alert' : 'chart',
    headline: `${fmtInt(wakes)} ${wakes === 1 ? 'wake' : 'wakes'}${rates ? ` · ${rates}` : ''}`,
    sub: `${range.charAt(0).toUpperCase()}${range.slice(1)} · ${tail}${typeof e.targetActiveRate === 'number' ? ` · target ${e.targetActiveRate}% active` : ''}`,
  };
});
</script>
