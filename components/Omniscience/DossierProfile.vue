<template>
    <div class="omx-stack" data-testid="omx-profile">
        <div class="omx-grid">
            <div class="omx-stack">
                <section class="omx-card">
                    <div class="omx-card-head"><h2>Dossier</h2><span v-if="profile" class="omx-sub">written {{ omxDateTime(profile.generated_at) }}</span></div>
                    <div class="omx-card-body">
                        <OmniscienceMd v-if="profile?.narrative_markdown" :source="profile.narrative_markdown" />
                        <div v-else class="omx-empty"><strong>No dossier written yet</strong>{{ person.profile_targeted ? 'It is written on the next profiler run.' : 'Switch “Profile them” on above and one is written on the next profiler run.' }}</div>
                    </div>
                </section>
                <section v-if="profile?.biographical_markdown" class="omx-card">
                    <div class="omx-card-head"><h2>Life so far</h2><span class="omx-sub">inferred from what they said</span></div>
                    <div class="omx-card-body"><OmniscienceMd :source="profile.biographical_markdown" /></div>
                </section>
            </div>
            <div class="omx-stack">
                <section class="omx-card">
                    <div class="omx-card-head"><h2>How they change with the room</h2></div>
                    <div class="omx-card-body">
                        <template v-if="facets.length">
                            <p class="omx-dim" style="margin-bottom: 10px">
                                Shifts {{ omxPct(divergence?.divergence_score) }} between places. Most themselves in <strong style="color: var(--omx-ink)">{{ divergence?.most_relaxed_facet || '?' }}</strong>,
                                most guarded in <strong style="color: var(--omx-ink)">{{ divergence?.most_formal_facet || '?' }}</strong>.
                            </p>
                            <div v-for="facet in facets" :key="facet.key" style="margin-bottom: 10px">
                                <div class="omx-h" style="margin: 0 0 4px">{{ facet.key }}</div>
                                <div v-for="m in MEASURES" :key="m.key" class="omx-trait" style="grid-template-columns: 82px minmax(0, 1fr) 34px">
                                    <span class="omx-dim">{{ m.label }}</span><div class="omx-meter" :class="m.tone"><i :style="{ width: omxPct(Math.min(1, facet.v[m.key] ?? 0)) }"></i></div><span>{{ omxPct(facet.v[m.key]) }}</span>
                                </div>
                            </div>
                        </template>
                        <p v-else class="omx-dim">Not enough writing in different places to compare yet.</p>
                    </div>
                </section>
                <section class="omx-card">
                    <div class="omx-card-head">
                        <h2>Who they were</h2><span class="omx-sub">a dossier from one year's messages</span>
                        <div class="omx-acts">
                            <select v-model.number="year" class="omx-select sm" aria-label="Year"><option v-for="y in years" :key="y" :value="y">{{ y }}</option></select>
                            <button class="omx-btn sm" type="button" :disabled="!!omx.busy.value" @click="buildEra()">Write it</button>
                        </div>
                    </div>
                    <div v-if="eras.length" class="omx-card-body flush">
                        <details v-for="era in eras" :key="era.era" style="border-bottom: 1px solid var(--omx-line)">
                            <summary style="padding: 9px 14px; cursor: pointer">{{ era.era }} <span class="omx-dim">· written {{ omxDate(era.generated_at) }}</span></summary>
                            <div style="padding: 0 14px 12px"><OmniscienceMd :source="era.profile_markdown" /></div>
                        </details>
                    </div>
                    <div v-else class="omx-empty">None written. Pick a year and one is written from that year's messages only.</div>
                </section>
                <section class="omx-card">
                    <div class="omx-card-head"><h2>What changed</h2><span class="omx-sub">between dossiers</span></div>
                    <div v-if="changes.length" class="omx-card-body">
                        <div v-for="(c, i) in changes" :key="i" style="margin-bottom: 12px"><div class="omx-h" style="margin: 0 0 4px">{{ omxDate(c.generated_at) }}</div><OmniscienceMd :source="c.changes_markdown" /></div>
                    </div>
                    <div v-else class="omx-empty">No change recorded between two dossiers yet.</div>
                </section>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { omxDate, omxDateTime, omxPct } from '~/scripts/omniscienceConsole';

/** The written dossier, how the person differs from place to place, who they were in earlier years, and what changed. */
const MEASURES = [
    { key: 'profanity_rate', label: 'swearing', tone: 'crit' }, { key: 'emoji_rate', label: 'emoji', tone: 'warn' },
    { key: 'laughter_rate', label: 'laughter', tone: 'ok' }, { key: 'question_rate', label: 'questions', tone: '' },
];
const props = defineProps<{ personId: string; person: any }>();
const omx = useOmx();
const changes = ref<any[]>([]);
const eras = ref<any[]>([]);
const year = ref(new Date().getFullYear() - 1);
const years = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i);

const profile = computed(() => props.person?.personality_profile ?? null);
const divergence = computed(() => props.person?.analytics?.facet_divergence?.payload ?? null);
const facets = computed(() => Object.entries(divergence.value?.facet_vectors ?? {}).map(([key, v]) => ({ key, v: v as Record<string, number> })));

async function load() {
    const q = encodeURIComponent(props.personId);
    const [changelog, eraList] = await Promise.all([
        omx.api.get(`/omniscience/persons/changelog?personId=${q}`).catch(() => null),
        omx.api.get(`/omniscience/persons/era-profiles?personId=${q}`).catch(() => null),
    ]);
    changes.value = changelog?.changelogs ?? [];
    eras.value = eraList?.eras ?? [];
}
async function buildEra() {
    await omx.act('era', () => omx.api.post('/omniscience/persons/profile-era', { personId: props.personId, era: year.value }), `Writing the ${year.value} dossier. It appears here when it is done.`);
}
watch(() => props.personId, load, { immediate: true });
</script>
