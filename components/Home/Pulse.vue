<template>
  <NuxtLink
    class="hom-tile"
    :to="pulse.href"
    :data-tone="pulse.tone"
    :data-testid="`pulse-${pulse.id}`"
    :aria-label="ariaLabel"
    :style="{ '--i': index }"
  >
    <div class="hom-tile__head">
      <span class="hom-tile__icon"><HomeIcon :name="pulse.icon" /></span>
      <span class="hom-tile__label">{{ pulse.label }}</span>
      <span v-if="loudCount" class="hom-tile__badge" :data-tone="worst" :title="`${loudCount} to look at`">{{ loudCount }}</span>
      <span v-else class="hom-tile__state" :title="stateWord"></span>
    </div>
    <div class="hom-tile__figure">
      <span class="hom-tile__value hom-num" data-testid="pulse-value">{{ pulse.value }}</span>
      <span v-if="pulse.unit" class="hom-tile__unit">{{ pulse.unit }}</span>
    </div>
    <div class="hom-tile__line" data-testid="pulse-line">{{ pulse.line }}</div>
    <div v-if="headline" class="hom-tile__note" :data-tone="headline.tone">
      <HomeIcon :name="headline.tone === 'crit' ? 'octagon-x' : headline.tone === 'warn' ? 'alert' : 'info'" />
      <span>{{ headline.title }}</span>
    </div>
    <div v-else-if="pulse.foot" class="hom-tile__foot">{{ pulse.foot }}</div>
    <HomeSpark v-if="pulse.spark" class="hom-tile__spark" :points="pulse.spark" :bars="pulse.sparkBars" :tone="pulse.tone === 'idle' ? 'neutral' : pulse.tone === 'ok' ? 'data' : pulse.tone" :label="`${pulse.label} trend`" />
    <HomeIcon class="hom-tile__go" name="arrow-up-right" />
  </NuxtLink>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { HomeFinding, HomePulse } from '~/scripts/home';

/* One system: its figure, one line, and the most pressing thing about it if there is one. The whole tile opens the page. */
const props = defineProps<{ pulse: HomePulse; index?: number; muted?: Set<string> }>();

const loud = computed<HomeFinding[]>(() => props.pulse.findings.filter(f => f.tone !== 'info' && !f.chronic && !props.muted?.has(f.id)));
const loudCount = computed(() => loud.value.length);
const worst = computed(() => (loud.value.some(f => f.tone === 'crit') ? 'crit' : 'warn'));
const headline = computed<HomeFinding | null>(() => loud.value[0] ?? props.pulse.findings.find(f => f.tone === 'info' && !f.chronic) ?? null);
const stateWord = computed(() => ({ ok: 'Healthy', warn: 'Needs a look', crit: 'Broken', idle: 'Not in use', info: 'Note', neutral: 'Waiting' } as Record<string, string>)[props.pulse.tone] ?? '');
const ariaLabel = computed(() => [props.pulse.label, `${props.pulse.value} ${props.pulse.unit ?? ''}`.trim(), props.pulse.line, headline.value?.title, stateWord.value].filter(Boolean).join('. '));
</script>
