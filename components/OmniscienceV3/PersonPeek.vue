<template>
    <OmniscienceV3Drawer :open="!!personId" modeless :title="d?.displayName ?? 'Person'" :subtitle="d ? subtitle : undefined" @close="$emit('close')">
        <OmniscienceV3ErrorBlock v-if="dossier.error.value && !d" :error="dossier.error.value" what="This person" @retry="dossier.refresh()" />
        <div v-else-if="!d" class="omni-skelrows" aria-busy="true"><div v-for="n in 6" :key="n" class="omni-skel"></div></div>
        <div v-else data-testid="person-peek">
            <div class="omni-row who">
                <span class="omni-avatar lg" aria-hidden="true">{{ initials }}</span>
                <span class="omni-row">
                    <span class="omni-chip" :class="d.tier === 'tracked' ? 'ok' : d.tier === 'watch' ? 'warn' : ''">{{ d.tier }}</span>
                    <span v-if="d.isSelf" class="omni-chip">you</span>
                    <span v-if="d.pinned" class="omni-chip" title="Pinned">★ pinned</span>
                    <span v-if="d.restricted" class="omni-chip warn" title="Under 18, or may be: routine and identity details are not shown">minor</span>
                </span>
            </div>

            <div class="omni-kpis tight">
                <OmniscienceV3Kpi label="Messages" :value="omniCount(d.activity.msgs)" :foot="`${omniCount(d.activity.msgs30)} in 30 days`" small />
                <OmniscienceV3Kpi label="Active days" :value="omniCount(d.activity.activeDays)" :foot="`${d.activity.perActiveDay.toFixed(1)} a day when active`" small />
                <OmniscienceV3Kpi label="Last seen" :value="age(d.activity.lastMs)" :foot="d.activity.firstMs ? `first ${at(d.activity.firstMs).slice(0, 10)}` : undefined" small />
            </div>

            <section v-if="days.length" class="omni-section">
                <h4>Last {{ days.length }} days</h4>
                <div class="omni-spark" role="img" :aria-label="`Messages a day over the last ${days.length} days`">
                    <i v-for="day in days" :key="day.day" :class="{ zero: !day.msgs }" :style="{ height: `${Math.max(2, Math.round((day.msgs / peak) * 36))}px` }" :title="`${day.day}: ${day.msgs}`"></i>
                </div>
                <div class="omni-axis"><span>{{ days[0]!.day }}</span><span>{{ days[days.length - 1]!.day }}</span></div>
            </section>

            <section v-if="!d.restricted && d.facts.length" class="omni-section" data-testid="peek-facts">
                <h4>Known</h4>
                <ul class="facts">
                    <li v-for="f in d.facts.slice(0, 6)" :key="f.assertionId">
                        <span class="omni-muted">{{ omniHumanise(f.attribute) }}</span><strong>{{ f.value ?? '—' }}</strong>
                        <span class="omni-chip sm" :class="factTone(f.status)">{{ f.status }}</span>
                    </li>
                </ul>
            </section>
            <p v-else-if="d.restricted" class="omni-muted omni-section">They are, or may be, under 18: routine, facts about who they are and look-alikes are not shown.</p>

            <section v-if="d.partners.length" class="omni-section">
                <h4>Talks most with</h4>
                <ul class="facts">
                    <li v-for="p in d.partners.slice(0, 5)" :key="p.personId">
                        <NuxtLink :to="`${OMNI_BASE}/people/${encodeURIComponent(p.personId)}`">{{ p.name }}</NuxtLink>
                        <span class="omni-muted">{{ omniCount(p.repliesOut) }} replies to them · {{ omniCount(p.repliesIn) }} back</span>
                    </li>
                </ul>
            </section>

            <section v-if="d.guilds.length || d.languages.length" class="omni-section">
                <h4>Where and how</h4>
                <div class="omni-row">
                    <span v-for="g in d.guilds.slice(0, 4)" :key="g.id" class="omni-chip">{{ g.name }} · {{ omniCount(g.count) }}</span>
                    <span v-for="l in d.languages.slice(0, 2)" :key="l.id" class="omni-chip info">{{ l.name }}</span>
                </div>
            </section>
        </div>
        <template #footer>
            <NuxtLink class="omni-btn primary" :to="page" data-testid="peek-open">Open their page</NuxtLink>
            <NuxtLink class="omni-btn" :to="`${page}?tab=knowledge`">What is known</NuxtLink>
            <NuxtLink class="omni-btn" :to="`${page}?tab=timeline`">Timeline</NuxtLink>
            <span class="omni-muted hint"><kbd>Esc</kbd> closes</span>
        </template>
    </OmniscienceV3Drawer>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { OMNI_BASE, omniGet } from '~/scripts/omniscience/api';
import type { DossierDto, ReadModelDto } from '~/scripts/omniscience/contracts';
import { omniCount } from '~/scripts/omniscience/format';
import { omniHumanise } from '~/scripts/omniscience/findings';
import { factTone } from '~/scripts/omniscience/knowledge';
import { useOmniResource, useOmniTime } from '~/composables/useOmniscienceV3';

/**
 * A person at a glance, without leaving the list they were found in: how much they write, when they
 * were last seen, what is known, who they talk to. The same read model the full page uses.
 */
const props = defineProps<{ personId: string | null }>();
defineEmits<{ close: [] }>();

const { at, age } = useOmniTime();
const dossier = useOmniResource<DossierDto | null>(async signal => {
    if (!props.personId) return null;
    return (await omniGet<ReadModelDto>('rm', { model: 'person.dossier', key: props.personId }, signal)).body as DossierDto;
}, { immediate: false });
watch(() => props.personId, id => { dossier.data.value = null; if (id) void dossier.refresh(); }, { immediate: true });

const d = computed(() => dossier.data.value);
const page = computed(() => `${OMNI_BASE}/people/${encodeURIComponent(props.personId ?? '')}`);
const subtitle = computed(() => (d.value ? d.value.identities.map(i => i.platform).filter((p, i, all) => all.indexOf(p) === i).join(', ') || 'no linked account' : ''));
const initials = computed(() => {
    const words = (d.value?.displayName ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return (words.length === 1 ? words[0]!.slice(0, 2) : words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
});
const days = computed(() => (d.value?.series ?? []).slice(-60));
const peak = computed(() => Math.max(1, ...days.value.map(day => day.msgs)));
</script>

<style scoped>
.who { margin-bottom: 12px; }
.facts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; }
.facts li { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.facts a { color: var(--omni-accent-2); }
.hint { margin-left: auto; font-size: 11.5px; }
</style>
