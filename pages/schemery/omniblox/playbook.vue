<template>
    <OmniBloxShell @refresh="load">
        <div class="ot-pagehead">
            <div>
                <h1>Playbook</h1>
                <p class="subtitle">{{ subtitle }}</p>
            </div>
        </div>

        <div class="ot-filterbar bx-filters">
            <div class="ot-search">
                <input v-model="text" class="ot-input" type="search" placeholder="Search lessons" aria-label="Search lessons" />
            </div>
            <div class="ot-segment sm" role="group" aria-label="Topic">
                <button type="button" :aria-pressed="topic === null" @click="topic = null">All topics</button>
                <button v-for="t in topics" :key="t" type="button" :aria-pressed="topic === t" @click="topic = t">{{ t }}</button>
            </div>
            <div class="ot-segment sm" role="group" aria-label="Outcome">
                <button type="button" :aria-pressed="outcome === null" @click="outcome = null">Any outcome</button>
                <button v-for="o in OUTCOMES" :key="o" type="button" :aria-pressed="outcome === o" @click="outcome = o">{{ o }}</button>
            </div>
        </div>

        <OmniTraderCard :loading="lessons === null" :error="error ?? undefined" :empty="!!lessons && !shown.length"
                        :empty-kind="lessons?.length ? 'filtered' : 'empty'"
                        :empty-title="lessons?.length ? 'No lessons match' : 'Nothing learned yet'"
                        :empty-text="lessons?.length ? undefined : 'Post-mortems and maintenance add lessons once games are live.'" flush>
            <ul class="lessons">
                <li v-for="l in shown" :key="l.LessonId">
                    <div class="top">
                        <span class="ot-chip">{{ l.Topic }}</span>
                        <span class="ot-chip" :class="OUTCOME_TONE[l.Outcome]">{{ l.Outcome }}</span>
                        <span class="conf" :title="`Confidence ${Math.round(l.Confidence * 100)}%`">
                            <span class="bar"><span :style="{ width: `${Math.round(l.Confidence * 100)}%` }"></span></span>
                            {{ Math.round(l.Confidence * 100) }}%
                        </span>
                        <span class="meta">
                            <template v-if="l.TimesUsed">read {{ l.TimesUsed }}× · </template>
                            <NuxtLink v-if="l.GameId" :to="`/schemery/omniblox/game/${l.GameId}`">{{ gameTitle(l.GameId) }}</NuxtLink>
                            <template v-if="l.GameId"> · </template>{{ fmtDate(l.Utc) }}
                        </span>
                    </div>
                    <p class="text">{{ l.Text }}</p>
                    <p v-if="l.Evidence" class="evidence">{{ l.Evidence }}</p>
                    <div v-if="l.Tags.length" class="bx-tags"><span v-for="t in l.Tags" :key="t" class="tag">#{{ t }}</span></div>
                </li>
            </ul>
        </OmniTraderCard>
    </OmniBloxShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { fmtDate } from '~/composables/useOmniTumblr';
import { bloxGet, useBloxOverview, type BloxLesson } from '~/composables/useOmniBlox';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Playbook · OmniBlox' });

const OUTCOMES = ['worked', 'failed', 'neutral'] as const;
const OUTCOME_TONE: Record<string, string> = { worked: 'ok', failed: 'bad', neutral: '' };

const { overview } = useBloxOverview();
const lessons = ref<BloxLesson[] | null>(null);
const error = ref<string | null>(null);
const text = ref('');
const topic = ref<string | null>(null);
const outcome = ref<string | null>(null);

async function load() {
    const result = await bloxGet<{ Lessons: BloxLesson[] }>('/omniblox/playbook');
    if (result.ok && result.data) {
        lessons.value = result.data.Lessons;
        error.value = null;
    } else {
        error.value = result.error;
        lessons.value ??= [];
    }
}
onMounted(load);

const topics = computed(() => [...new Set((lessons.value ?? []).map(l => l.Topic))].sort());
const shown = computed(() => {
    const needle = text.value.trim().toLowerCase();
    return (lessons.value ?? []).filter(l =>
        (topic.value === null || l.Topic === topic.value)
        && (outcome.value === null || l.Outcome === outcome.value)
        && (!needle || `${l.Text} ${l.Evidence} ${l.Tags.join(' ')}`.toLowerCase().includes(needle)));
});
const subtitle = computed(() => {
    const all = lessons.value;
    if (!all) return 'Loading…';
    const worked = all.filter(l => l.Outcome === 'worked').length;
    const failed = all.filter(l => l.Outcome === 'failed').length;
    return `${all.length} lesson${all.length === 1 ? '' : 's'} · ${worked} worked · ${failed} failed · read before every research, build and launch decision`;
});

function gameTitle(id: string) {
    return overview.value?.Games.find(g => g.GameId === id)?.Title ?? id;
}
</script>

<style scoped>
.bx-filters { display: flex; flex-wrap: wrap; gap: var(--ot-space-2); align-items: center; margin-bottom: var(--ot-gutter); }
.bx-filters .ot-search { flex: 1 1 240px; }
.bx-filters .ot-search .ot-input { width: 100%; }
.lessons { list-style: none; margin: 0; padding: 0; }
.lessons > li { padding: var(--ot-space-3) var(--ot-card-pad); display: flex; flex-direction: column; gap: 6px; }
.lessons > li + li { border-top: 1px solid var(--ot-line); }
.top { display: flex; gap: var(--ot-space-2); align-items: center; flex-wrap: wrap; }
.conf { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-family: var(--ot-mono); color: var(--ot-muted); }
.bar { width: 60px; height: 4px; border-radius: 2px; background: var(--ot-surface-3); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--ot-accent); }
.meta { margin-left: auto; font-size: 11px; color: var(--ot-muted); }
.meta a { color: var(--ot-info); text-decoration: none; }
.text { margin: 0; font-size: 13px; line-height: 19px; }
.evidence { margin: 0; font-size: 12px; color: var(--ot-text-2); }
.tag { font-size: 11px; color: var(--ot-muted); }
</style>
