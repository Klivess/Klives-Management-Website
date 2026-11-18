<template>
    <aside class="omx-sheet" role="dialog" aria-modal="true" :aria-label="name || 'Person'" data-testid="omx-peek">
        <div class="omx-sheet-head">
            <span class="omx-avatar lg" :class="tier">{{ omxInitials(name) }}</span>
            <div class="omx-grow">
                <h3 style="font-size: 17px">{{ name || (loading ? 'Reading…' : 'Unknown person') }}</h3>
                <div class="omx-dossier-handles omx-clip">{{ handles }}</div>
            </div>
            <button class="omx-btn quiet icon" type="button" aria-label="Close" @click="omx.peekId.value = ''"><OmniscienceIcon name="close" /></button>
        </div>
        <div class="omx-sheet-body">
            <div v-if="error" class="omx-error" role="alert"><span class="omx-grow">{{ error }}</span><button class="omx-btn sm" type="button" @click="load()">Try again</button></div>
            <div v-else-if="loading" class="omx-skels" style="padding: 0"><div class="omx-skel" style="width: 60%"></div><div class="omx-skel" style="width: 85%"></div><div class="omx-skel" style="width: 45%"></div></div>
            <template v-else-if="person">
                <div class="omx-chips">
                    <span class="omx-chip" :class="tier" :title="OMX_TIER_HELP[tier]">{{ tier }}</span>
                    <span v-if="person.profile_targeted" class="omx-chip accent">profiled</span>
                    <span v-if="omx.isPinned(personId)" class="omx-chip warn">pinned</span>
                    <span v-if="moodFlag" class="omx-chip" :class="moodFlag === 'low' ? 'crit' : moodFlag === 'high' ? 'ok' : ''">mood {{ moodFlag }}</span>
                </div>
                <dl class="omx-kv" style="margin-top: 12px">
                    <dt>Messages</dt><dd class="omx-num">{{ omxNum(person.message_count) }}</dd>
                    <dt>Accounts</dt><dd>{{ (person.identities ?? []).length }}</dd>
                    <dt v-if="chronotype">Rhythm</dt><dd v-if="chronotype">{{ chronotype }}</dd>
                    <dt v-if="person.personality_profile?.generated_at">Dossier</dt><dd v-if="person.personality_profile?.generated_at">written {{ omxAgo(person.personality_profile.generated_at, omx.now.value) }}</dd>
                </dl>

                <div class="omx-h" style="margin-top: 16px">What is known</div>
                <div v-if="topFacts.length" class="omx-card" style="border-radius: 10px">
                    <div v-for="fact in topFacts" :key="fact.fact_id" class="omx-fact" style="grid-template-columns: 36px minmax(0, 1fr)">
                        <span class="omx-fact-conf">{{ Math.round((fact.confidence ?? 0) * 100) }}%</span>
                        <div><div class="omx-fact-text">{{ fact.fact }}</div><div class="omx-fact-meta">{{ fact.category }}</div></div>
                    </div>
                </div>
                <p v-else class="omx-dim">No fact is recorded yet.</p>

                <template v-if="excerpt">
                    <div class="omx-h" style="margin-top: 16px">From the dossier</div>
                    <OmniscienceMd :source="excerpt" />
                </template>
            </template>
        </div>
        <div class="omx-sheet-foot">
            <button class="omx-btn primary" type="button" data-testid="omx-peek-open" @click="open()">Open dossier <span class="omx-kbd" style="margin-left: 2px">Enter</span></button>
            <button class="omx-btn" type="button" :disabled="!person" @click="pin()">{{ omx.isPinned(personId) ? 'Unpin' : 'Pin' }}</button>
            <button class="omx-btn" type="button" :disabled="!person" @click="open('messages')">Messages</button>
            <button class="omx-btn" type="button" :disabled="!person" @click="ask()">Ask about them</button>
        </div>
    </aside>
</template>

<script setup lang="ts">
import { OMX_TIER_HELP, omxAgo, omxErrorText, omxInitials, omxNum, omxTier } from '~/scripts/omniscienceConsole';

/** A person at a glance, without leaving the list: who they are, the surest facts, and the ways further in. */
const props = defineProps<{ personId: string }>();
const omx = useOmx();
const person = ref<any>(null);
const facts = ref<any[]>([]);
const loading = ref(true);
const error = ref('');

const name = computed(() => String(person.value?.display_name ?? ''));
const tier = computed(() => omxTier(person.value?.tier));
const handles = computed(() => (person.value?.identities ?? []).map((i: any) => `${i.platform}:${i.platform_username || i.username || i.display_name || '?'}`).join('  ·  '));
const topFacts = computed(() => facts.value.filter(f => f.status === 'active').sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 6));
const payload = (module: string) => person.value?.analytics?.[module]?.payload ?? null;
const moodFlag = computed(() => String(payload('mood_trajectory')?.current_mood_flag ?? ''));
const chronotype = computed(() => { const c = payload('chronotype'); return c?.chronotype ? `${c.chronotype}, asleep about ${c.estimated_sleep_start_local_hour}:00–${c.estimated_sleep_end_local_hour}:00` : ''; });
const excerpt = computed(() => {
    const text = String(person.value?.personality_profile?.narrative_markdown ?? '').trim();
    return text.length > 700 ? `${text.slice(0, 700).replace(/\s+\S*$/, '')}…` : text;
});

async function load() {
    loading.value = true; error.value = '';
    try {
        const id = encodeURIComponent(props.personId);
        const [dossier, known] = await Promise.all([
            omx.api.get(`/omniscience/persons/get?personId=${id}`),
            omx.api.get(`/omniscience/persons/facts?personId=${id}`).catch(() => ({ facts: [] })),
        ]);
        person.value = dossier;
        facts.value = Array.isArray(known?.facts) ? known.facts : [];
    } catch (cause) { error.value = omxErrorText(cause, 'This person could not be read.'); }
    finally { loading.value = false; }
}
function open(tab?: string) { omx.peekId.value = ''; omx.openPerson(props.personId, tab); }
function ask() { omx.peekId.value = ''; omx.go('ask', { mode: 'scope', person: props.personId }); }
async function pin() { await omx.togglePin({ person_id: props.personId, pinned: omx.isPinned(props.personId) }); }

onMounted(load);
</script>
