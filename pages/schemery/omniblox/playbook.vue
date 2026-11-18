<template>
  <ObxShell crumb="Playbook" @refresh="load">
    <section class="obx-card" aria-label="Playbook" data-testid="obx-playbook">
      <header class="obx-card__head">
        <h1 class="obx-card__title" style="font-size: 15px"><ObxIcon name="book" />Playbook</h1>
        <span class="obx-card__meta">{{ subtitle }}</span>
      </header>
      <div class="obx-card__body obx-stack" style="gap: 10px">
        <div class="obx-toolbar">
          <label class="obx-field"><ObxIcon name="search" /><input v-model="text" type="search" placeholder="Search lessons" aria-label="Search lessons" /></label>
          <div class="obx-seg" role="group" aria-label="Topic">
            <button class="obx-seg__opt" :aria-pressed="topic === null" @click="topic = null">All topics</button>
            <button v-for="t in topics" :key="t" class="obx-seg__opt" :aria-pressed="topic === t" @click="topic = t">{{ t }}<span class="obx-seg__count">{{ topicCount(t) }}</span></button>
          </div>
          <div class="obx-seg" role="group" aria-label="Outcome">
            <button class="obx-seg__opt" :aria-pressed="outcome === null" @click="outcome = null">Any outcome</button>
            <button v-for="o in OUTCOMES" :key="o" class="obx-seg__opt" :aria-pressed="outcome === o" @click="outcome = o">{{ o }}</button>
          </div>
        </div>
      </div>
      <div class="obx-card__body obx-card__body--flush">
        <div v-if="error && !lessons?.length" class="obx-banner" data-tone="crit" style="margin: 0 14px 12px"><span class="obx-banner__text"><span>{{ error }}</span></span></div>
        <div v-else-if="lessons === null" class="obx-stack" style="padding: 0 14px 12px"><div v-for="n in 4" :key="n" class="obx-skel" style="height: 64px"></div></div>
        <div v-else-if="!shown.length" class="obx-empty">{{ lessons.length ? 'No lessons match.' : 'Nothing learned yet: post-mortems and maintenance add lessons once games are live.' }}</div>
        <ul v-else>
          <li v-for="l in shown" :key="l.LessonId" class="obx-lesson" data-testid="obx-lesson">
            <div class="obx-lesson__top">
              <span class="obx-chip">{{ l.Topic }}</span>
              <span class="obx-chip" :data-tone="OUTCOME_TONE[l.Outcome]">{{ l.Outcome }}</span>
              <span class="obx-conf" :title="`Confidence ${Math.round(l.Confidence * 100)}%`">
                <span class="obx-meter"><span class="obx-meter__fill" :style="{ width: `${Math.round(l.Confidence * 100)}%`, background: 'var(--obx-brick)' }"></span></span>
                <span class="obx-num">{{ Math.round(l.Confidence * 100) }}%</span>
              </span>
              <span style="margin-left: auto">
                <template v-if="l.TimesUsed">read {{ obxCount(l.TimesUsed) }}× · </template>
                <NuxtLink v-if="l.GameId" class="obx-link" :to="`/schemery/omniblox/game/${l.GameId}`">{{ gameTitle(l.GameId) }}</NuxtLink>
                <template v-if="l.GameId"> · </template>{{ obxDate(l.Utc) }}
              </span>
            </div>
            <p class="obx-lesson__text">{{ l.Text }}</p>
            <p v-if="l.Evidence" class="obx-lesson__evidence">{{ l.Evidence }}</p>
            <div v-if="l.Tags.length" class="obx-lesson__tags"><span v-for="t in l.Tags" :key="t">#{{ t }}</span></div>
          </li>
        </ul>
      </div>
    </section>
  </ObxShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { bloxGet, useBloxOverview, type BloxLesson } from '~/composables/useOmniBlox';
import { obxCount, obxDate, type ObxTone } from '~/scripts/omniblox/console';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Playbook · OmniBlox' });

const OUTCOMES = ['worked', 'failed', 'neutral'] as const;
const OUTCOME_TONE: Record<string, ObxTone> = { worked: 'ok', failed: 'crit', neutral: 'neutral' };

const { overview } = useBloxOverview();
const lessons = ref<BloxLesson[] | null>(null);
const error = ref<string | null>(null);
const text = ref('');
const topic = ref<string | null>(null);
const outcome = ref<string | null>(null);

async function load() {
  const result = await bloxGet<{ Lessons: BloxLesson[] }>('/omniblox/playbook');
  if (result.ok && result.data) { lessons.value = result.data.Lessons; error.value = null; }
  else { error.value = result.error; lessons.value ??= []; }
}
onMounted(load);

const topics = computed(() => [...new Set((lessons.value ?? []).map(l => l.Topic))].sort());
const topicCount = (t: string) => (lessons.value ?? []).filter(l => l.Topic === t).length;
const shown = computed(() => {
  const needle = text.value.trim().toLowerCase();
  return (lessons.value ?? []).filter(l =>
    (topic.value === null || l.Topic === topic.value)
    && (outcome.value === null || l.Outcome === outcome.value)
    && (!needle || `${l.Text} ${l.Evidence} ${l.Tags.join(' ')}`.toLowerCase().includes(needle)));
});
const subtitle = computed(() => {
  const all = lessons.value;
  if (!all) return '';
  const worked = all.filter(l => l.Outcome === 'worked').length;
  const failed = all.filter(l => l.Outcome === 'failed').length;
  return `${all.length} lesson${all.length === 1 ? '' : 's'} · ${worked} worked · ${failed} failed · read before every research, build and launch decision`;
});
function gameTitle(id: string) { return overview.value?.Games.find(g => g.GameId === id)?.Title ?? id; }
</script>
