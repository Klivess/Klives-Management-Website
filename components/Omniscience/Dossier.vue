<template>
    <div data-testid="omx-dossier">
        <button class="omx-btn quiet sm" type="button" style="margin-bottom: 10px" @click="omx.go('people')"><OmniscienceIcon name="back" /> People</button>

        <div v-if="error" class="omx-error" role="alert"><span class="omx-grow">{{ error }}</span><button class="omx-btn sm" type="button" @click="load()">Try again</button></div>
        <div v-else-if="!person" class="omx-card"><div class="omx-skels"><div class="omx-skel" style="width: 34%; height: 24px"></div><div class="omx-skel" style="width: 58%"></div><div class="omx-skel" style="width: 80%"></div></div></div>
        <template v-else>
            <div class="omx-dossier-head">
                <span class="omx-avatar lg" :class="tier">{{ omxInitials(person.display_name) }}</span>
                <div class="omx-grow">
                    <h1 class="omx-dossier-name" data-testid="omx-dossier-name">{{ person.display_name || '(unnamed)' }}</h1>
                    <div class="omx-dossier-handles">{{ handles || 'no linked account' }}</div>
                </div>
                <div class="omx-head-actions">
                    <div class="omx-seg" role="group" aria-label="Tier" data-testid="omx-tier">
                        <button v-for="t in OMX_TIERS" :key="t" type="button" :aria-pressed="tier === t" :title="OMX_TIER_HELP[t]" :disabled="!!omx.busy.value" @click="setTier(t)">{{ t }}</button>
                    </div>
                    <button class="omx-btn" :class="{ on: person.profile_targeted }" type="button" :aria-pressed="!!person.profile_targeted" :disabled="!!omx.busy.value" data-testid="omx-profile-target"
                            :title="person.profile_targeted ? 'A dossier is written for them on every profiler run. Click to stop.' : 'Write a dossier for them on the next profiler run.'" @click="toggleProfiled()">
                        <OmniscienceIcon name="spark" /> {{ person.profile_targeted ? 'Profiled' : 'Profile them' }}
                    </button>
                    <button class="omx-btn" :class="{ on: pinned }" type="button" :aria-pressed="pinned" data-testid="omx-pin" @click="pin()">{{ pinned ? '★ Pinned' : '☆ Pin' }}</button>
                    <button class="omx-btn" type="button" @click="omx.go('ask', { mode: 'scope', person: id })"><OmniscienceIcon name="ask" /> Ask</button>
                    <button class="omx-btn" type="button" title="Download everything held on them as JSON" @click="exportAs('json')"><OmniscienceIcon name="download" /> JSON</button>
                    <button class="omx-btn" type="button" title="Download the dossier as Markdown" @click="exportAs('markdown')"><OmniscienceIcon name="download" /> MD</button>
                    <button class="omx-btn primary" type="button" :disabled="!!omx.busy.value" title="Work everything out about them again now" @click="recompute()"><OmniscienceIcon name="refresh" /> Recompute</button>
                </div>
            </div>

            <div v-if="completeness !== null" class="omx-rowflex" style="margin-bottom: 12px; flex-wrap: nowrap" :title="'How many of the things worth knowing about a person are known'">
                <span class="omx-eyebrow">Dossier</span>
                <div class="omx-meter omx-grow"><i :style="{ width: `${completeness}%` }"></i></div>
                <strong class="omx-num">{{ completeness }}%</strong>
            </div>

            <div class="omx-tabs" role="tablist">
                <button v-for="t in OMX_DOSSIER_TABS" :key="t" class="omx-tab" type="button" role="tab" :aria-selected="tab === t" :data-testid="`omx-tab-${t}`" @click="omx.patchQuery({ tab: t === 'summary' ? undefined : t })">
                    {{ OMX_DOSSIER_TAB_LABELS[t] }}<template v-if="t === 'knowledge' && facts.length"> · {{ facts.length }}</template>
                </button>
            </div>

            <!-- ── summary ── -->
            <div v-if="tab === 'summary'" class="omx-grid">
                <div class="omx-stack">
                    <section class="omx-card">
                        <div class="omx-card-head"><h2>Surest facts</h2><div class="omx-acts"><button class="omx-btn quiet sm" type="button" @click="omx.patchQuery({ tab: 'knowledge' })">All {{ facts.length }} <OmniscienceIcon name="go" /></button></div></div>
                        <div v-if="topFacts.length">
                            <div v-for="fact in topFacts" :key="fact.fact_id" class="omx-fact">
                                <span class="omx-fact-conf">{{ Math.round((fact.confidence ?? 0) * 100) }}%</span>
                                <div><div class="omx-fact-text">{{ fact.fact }}</div><div class="omx-fact-meta">{{ fact.source_context }} · {{ fact.extracted_by }}</div></div>
                                <span class="omx-chip">{{ fact.category }}</span>
                            </div>
                        </div>
                        <div v-else class="omx-empty"><strong>Nothing known yet</strong>Facts appear after a deduction pass has read their messages.</div>
                    </section>
                    <section v-if="narrative" class="omx-card">
                        <div class="omx-card-head"><h2>In short</h2><span class="omx-sub">from the dossier, {{ omxAgo(person.personality_profile?.generated_at, omx.now.value) }}</span>
                            <div class="omx-acts"><button class="omx-btn quiet sm" type="button" @click="omx.patchQuery({ tab: 'profile' })">Read it all <OmniscienceIcon name="go" /></button></div></div>
                        <div class="omx-card-body"><OmniscienceMd :source="narrative" /></div>
                    </section>
                </div>
                <div class="omx-stack">
                    <section class="omx-card">
                        <div class="omx-card-head"><h2>Vitals</h2><span v-if="moodFlag" class="omx-chip" :class="moodFlag === 'low' ? 'crit' : moodFlag === 'high' ? 'ok' : ''">mood {{ moodFlag }}</span></div>
                        <div class="omx-card-body">
                            <dl class="omx-kv">
                                <dt>Messages</dt><dd class="omx-num">{{ omxNum(person.message_count) }}</dd>
                                <dt v-if="chronotype">Rhythm</dt><dd v-if="chronotype">{{ chronotype }}</dd>
                            </dl>
                            <template v-if="mood.length">
                                <div class="omx-h">Mood, last {{ mood.length }} days</div>
                                <div class="omx-bars"><i v-for="(v, i) in mood" :key="i" :class="{ neg: v < 0 }" :style="{ height: `${Math.max(6, Math.round((v + 2) / 4 * 100))}%` }"></i></div>
                            </template>
                            <template v-if="hours.length">
                                <div class="omx-h">Hours they write in</div>
                                <div class="omx-bars"><i v-for="(v, i) in hours" :key="i" :class="{ zero: !v }" :title="`${String(i).padStart(2, '0')}:00 · ${v}`" :style="{ height: `${Math.max(4, Math.round(v / hourMax * 100))}%`, background: 'var(--omx-cyan)' }"></i></div>
                                <div class="omx-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
                            </template>
                            <template v-if="taste.length">
                                <div class="omx-h">Listening and playing</div>
                                <div class="omx-chips"><span v-for="t in taste" :key="t" class="omx-chip">{{ t }}</span></div>
                            </template>
                            <p v-if="!mood.length && !hours.length && !taste.length" class="omx-dim" style="margin-top: 8px">No activity analysis yet.</p>
                        </div>
                    </section>
                    <section v-if="bigFive" class="omx-card">
                        <div class="omx-card-head"><h2>Big Five</h2><span class="omx-sub">an estimate from how they write</span></div>
                        <div class="omx-card-body">
                            <div v-for="trait in TRAITS" :key="trait.key" class="omx-trait">
                                <span>{{ trait.label }}</span>
                                <div class="omx-meter"><i :style="{ width: `${Math.round((bigFive[trait.key] ?? 0) * 100)}%` }"></i></div>
                                <span>{{ Math.round((bigFive[trait.key] ?? 0) * 100) }}</span>
                            </div>
                        </div>
                    </section>
                    <section v-if="openQuestions.length" class="omx-card">
                        <div class="omx-card-head"><h2>Not known yet</h2><span class="omx-sub">{{ openQuestions.length }}</span></div>
                        <ul class="omx-rows"><li v-for="(q, i) in openQuestions.slice(0, 5)" :key="i"><span class="omx-chip">{{ q.slot }}</span><span class="omx-row-main"><small class="wrap" style="color: var(--omx-ink-2)">{{ q.question }}</small></span></li></ul>
                    </section>
                </div>
            </div>

            <OmniscienceDossierKnowledge v-else-if="tab === 'knowledge'" :person-id="id" :facts="facts" :open-questions="openQuestions" :hypotheses="hypotheses" @changed="reloadFacts()" />
            <OmniscienceDossierCircle v-else-if="tab === 'circle'" :person-id="id" :name="person.display_name" :relationships="relationships" :entities="entities" :aliases="aliases" />
            <OmniscienceDossierActivity v-else-if="tab === 'activity'" :person-id="id" />
            <OmniscienceDossierMessages v-else-if="tab === 'messages'" :person-id="id" :name="person.display_name" />
            <OmniscienceDossierProfile v-else-if="tab === 'profile'" :person-id="id" :person="person" />
            <OmniscienceDossierNotes v-else-if="tab === 'notes'" :person-id="id" />
            <div v-else-if="tab === 'replica'" class="omx-stack">
                <ReplicaChatPanel :person-id="id" :display-name="person.display_name" :profile-targeted="!!person.profile_targeted" />
                <OmniscienceDossierFidelity :person-id="id" />
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import {
    OMX_DOSSIER_TABS, OMX_DOSSIER_TAB_LABELS, OMX_TIERS, OMX_TIER_HELP, omxAgo, omxErrorText, omxInitials, omxNum, omxTier, type OmxDossierTab,
} from '~/scripts/omniscienceConsole';

/**
 * Everything held on one person. The header carries what can be done about them; the summary is
 * the page you would want if you only had ten seconds; each tab after it reads its own data when
 * it is opened, so opening a dossier costs six small reads, not fifteen.
 */
const TRAITS = [
    { key: 'openness', label: 'Openness' }, { key: 'conscientiousness', label: 'Conscientiousness' }, { key: 'extraversion', label: 'Extraversion' },
    { key: 'agreeableness', label: 'Agreeableness' }, { key: 'neuroticism', label: 'Neuroticism' },
];

const omx = useOmx();
const id = computed(() => omx.personId.value);
const tabQuery = omx.query('tab');
const tab = computed<OmxDossierTab>(() => ((OMX_DOSSIER_TABS as readonly string[]).includes(tabQuery.value) ? tabQuery.value as OmxDossierTab : 'summary'));

const person = ref<any>(null);
const facts = ref<any[]>([]);
const relationships = ref<any[]>([]);
const entities = ref<any[]>([]);
const aliases = ref<any[]>([]);
const openQuestions = ref<any[]>([]);
const hypotheses = ref<any[]>([]);
const completenessRaw = ref<number | null>(null);
const seriesFive = ref<any>(null);
const error = ref('');

const tier = computed(() => omxTier(person.value?.tier));
const pinned = computed(() => omx.isPinned(id.value));
const handles = computed(() => (person.value?.identities ?? []).map((i: any) => `${i.platform}:${i.platform_username || i.username || i.display_name || '?'}`).join('  ·  '));
const completeness = computed(() => (completenessRaw.value === null ? null : Math.round(completenessRaw.value * 100)));
const topFacts = computed(() => facts.value.filter(f => f.status === 'active').sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 8));
const payload = (module: string) => person.value?.analytics?.[module]?.payload ?? null;
const mood = computed<number[]>(() => (payload('mood_trajectory')?.daily_series ?? []).slice(-60).map((d: any) => Number(d.avg_sentiment) || 0));
const moodFlag = computed(() => String(payload('mood_trajectory')?.current_mood_flag ?? ''));
const hours = computed<number[]>(() => (payload('activity_pattern')?.hour_histogram ?? []).map((v: any) => Number(v) || 0));
const hourMax = computed(() => Math.max(1, ...hours.value));
const chronotype = computed(() => { const c = payload('chronotype'); return c?.chronotype ? `${c.chronotype}, asleep about ${c.estimated_sleep_start_local_hour}:00–${c.estimated_sleep_end_local_hour}:00 their time` : ''; });
const taste = computed<string[]>(() => [
    ...(payload('music_taste')?.current_top_artists ?? []).slice(0, 4).map((a: any) => `♪ ${a.artist}`),
    ...(payload('gaming_profile')?.current_top_games ?? []).slice(0, 4).map((g: any) => `▶ ${g.game}`),
]);
const bigFive = computed<any>(() => person.value?.personality_profile?.traits?.big_five_estimate ?? seriesFive.value);
const narrative = computed(() => {
    const text = String(person.value?.personality_profile?.narrative_markdown ?? '').trim();
    return text.length > 900 ? `${text.slice(0, 900).replace(/\s+\S*$/, '')}…` : text;
});

async function load() {
    const pid = id.value;
    if (!pid) { error.value = 'No person was named in the link.'; return; }
    error.value = ''; person.value = null;
    const q = encodeURIComponent(pid);
    const soft = <T,>(work: Promise<T>, fallback: T) => work.catch(() => fallback);
    try {
        const [dossier, known, rels, names, open, five] = await Promise.all([
            omx.api.get(`/omniscience/persons/get?personId=${q}`),
            soft(omx.api.get(`/omniscience/persons/facts?personId=${q}`), { facts: [] }),
            soft(omx.api.get(`/omniscience/persons/relationships?personId=${q}`), { relationships: [], entities: [] }),
            soft(omx.api.get(`/omniscience/persons/aliases?personId=${q}`), { aliases: [] }),
            soft(omx.api.get(`/omniscience/persons/open-questions?personId=${q}`), {}),
            soft(omx.api.get(`/omniscience/persons/bigfive-series?personId=${q}`), { series: [] }),
        ]);
        if (pid !== id.value) return;
        person.value = dossier;
        facts.value = known?.facts ?? [];
        relationships.value = rels?.relationships ?? [];
        entities.value = rels?.entities ?? [];
        aliases.value = names?.aliases ?? [];
        openQuestions.value = open?.open_questions ?? [];
        hypotheses.value = open?.hypotheses ?? [];
        completenessRaw.value = typeof open?.completeness?.completeness_score === 'number' ? open.completeness.completeness_score : null;
        seriesFive.value = five?.series?.length ? five.series[five.series.length - 1].big_five : null;
        omx.noteViewed(pid, dossier?.display_name || '');
    } catch (cause: any) {
        error.value = cause?.status === 404 ? 'There is no such person (they may have been merged into someone else).' : omxErrorText(cause, 'The dossier could not be read.');
    }
}
async function reloadFacts() {
    try { facts.value = (await omx.api.get(`/omniscience/persons/facts?personId=${encodeURIComponent(id.value)}`))?.facts ?? []; } catch { /* the list on screen stays */ }
}

async function setTier(next: string) { if (next !== tier.value && await omx.setTier(id.value, next)) person.value = { ...person.value, tier: next }; }
async function toggleProfiled() {
    const next = !person.value.profile_targeted;
    if (await omx.setProfileTarget(id.value, next)) person.value = { ...person.value, profile_targeted: next };
}
async function pin() { await omx.togglePin({ person_id: id.value, pinned: pinned.value }); }
async function recompute() {
    await omx.act('recompute', () => omx.api.post('/omniscience/persons/recompute?personId=' + encodeURIComponent(id.value), {}), r => r?.message || 'Recompute queued');
}
async function exportAs(format: 'json' | 'markdown') {
    const data = await omx.act('export', () => omx.api.get(`/omniscience/workspace/export/person?personId=${encodeURIComponent(id.value)}&format=${format}`));
    if (data?.content) omx.api.download(data.filename || `person.${format === 'json' ? 'json' : 'md'}`, data.mime || 'text/plain', data.content);
}

watch(id, load, { immediate: true });
</script>
