<template>
    <OmniscienceV3Drawer :open="open" wide :title="a && b ? `${a.displayName} and ${b.displayName}` : 'Compare'" subtitle="Side by side, then what there is between them" @close="$emit('close')">
        <div v-if="a && b" data-testid="pair-compare">
            <div class="sides">
                <div v-for="side in [a, b]" :key="side.personId" class="side">
                    <div class="omni-row">
                        <span class="omni-avatar" aria-hidden="true">{{ initials(side.displayName) }}</span>
                        <NuxtLink class="name" :to="`${OMNI_BASE}/people/${encodeURIComponent(side.personId)}`">{{ side.displayName }}</NuxtLink>
                        <span class="omni-chip sm" :class="side.tier === 'tracked' ? 'ok' : side.tier === 'watch' ? 'warn' : ''">{{ side.tier }}</span>
                    </div>
                    <dl class="omni-kv">
                        <dt>Messages</dt><dd>{{ omniCount(side.msgs) }}</dd>
                        <dt>Last 30 days</dt><dd>{{ omniCount(side.msgs30) }}</dd>
                        <dt>Last 90 days</dt><dd>{{ omniCount(side.msgs90) }}</dd>
                        <dt>Last seen</dt><dd><OmniscienceV3Time :ms="side.lastSeenMs" mode="age" /></dd>
                        <dt>Most active in</dt><dd>{{ side.topGuild ?? '—' }}</dd>
                        <dt>Platforms</dt><dd>{{ side.platforms.join(', ') || '—' }}</dd>
                    </dl>
                </div>
            </div>

            <section class="omni-section">
                <h4>Between them</h4>
                <OmniscienceV3StateBlock v-if="untracked" kind="empty" compact title="Not tracked as a pair" :detail="pair.error.value?.message" />
                <OmniscienceV3ErrorBlock v-else-if="pair.error.value && !p" :error="pair.error.value" what="This pair" @retry="pair.refresh()" />
                <div v-else-if="!p" class="omni-skelrows" aria-busy="true"><div v-for="n in 4" :key="n" class="omni-skel"></div></div>
                <template v-else>
                    <div class="omni-kpis tight">
                        <OmniscienceV3Kpi label="Interactions" :value="omniCount(p.summary.interactions)" :foot="`${omniCount(p.summary.recent)} recently`" small />
                        <OmniscienceV3Kpi label="Closeness" :value="ratio(p.summary.closeness)" :foot="`was ${ratio(p.summary.previousCloseness)}`" small
                                          :tone="p.summary.closeness > p.summary.previousCloseness ? 'good' : p.summary.closeness < p.summary.previousCloseness ? 'warn' : ''" />
                        <OmniscienceV3Kpi label="Reciprocity" :value="ratio(p.summary.reciprocity)" foot="how evenly they answer each other" small />
                        <OmniscienceV3Kpi label="Tension" :value="ratio(p.summary.tension)" :tone="p.summary.tension > 0.3 ? 'warn' : ''" :foot="`trend: ${omniHumanise(p.summary.trend)}`" small />
                    </div>
                    <div v-if="p.weeks.length" class="weeks">
                        <div class="omni-spark pair" role="img" aria-label="Messages a week from each to the other">
                            <template v-for="w in weeks" :key="w.week">
                                <i :style="{ height: bar(w.fromA) }" :title="`${w.week}: ${a.displayName} ${w.fromA}`"></i>
                                <i class="b" :style="{ height: bar(w.fromB) }" :title="`${w.week}: ${b.displayName} ${w.fromB}`"></i>
                            </template>
                        </div>
                        <div class="omni-axis"><span>{{ weeks[0]!.week }}</span><span class="legend"><i></i>{{ a.displayName }} <i class="b"></i>{{ b.displayName }}</span><span>{{ weeks[weeks.length - 1]!.week }}</span></div>
                    </div>
                    <dl class="omni-kv omni-section timing">
                        <dt>First week together</dt><dd>{{ p.summary.firstWeek }}</dd>
                        <dt>Latest week</dt><dd>{{ p.summary.lastWeek }}</dd>
                        <dt>{{ a.displayName }} answers in</dt><dd>{{ seconds(p.medianReplySecondsFromA) }}</dd>
                        <dt>{{ b.displayName }} answers in</dt><dd>{{ seconds(p.medianReplySecondsFromB) }}</dd>
                    </dl>
                    <ul v-if="p.events.length" class="omni-timeline omni-section">
                        <li v-for="e in p.events.slice(0, 8)" :key="e.eventId">{{ omniHumanise(e.kind) }}<span class="sub">week {{ e.week }}</span></li>
                    </ul>
                </template>
            </section>
        </div>
    </OmniscienceV3Drawer>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { OMNI_BASE, omniGet } from '~/scripts/omniscience/api';
import type { PairDetailDto, PersonCardDto } from '~/scripts/omniscience/contracts';
import { omniCount, omniDuration, omniPercent } from '~/scripts/omniscience/format';
import { omniHumanise } from '~/scripts/omniscience/findings';
import { useOmniResource } from '~/composables/useOmniscienceV3';

/**
 * Two people from the directory side by side, and the relationship between them as the insights
 * module tracks it (`insights/pair`). A pair with too few interactions is not tracked; the server
 * says so and that is shown as the fact it is, not as a failure.
 */
const props = defineProps<{ open: boolean; a: PersonCardDto | null; b: PersonCardDto | null }>();
defineEmits<{ close: [] }>();

const pair = useOmniResource<PairDetailDto | null>(
    signal => (props.a && props.b ? omniGet<PairDetailDto>('insights/pair', { a: props.a.personId, b: props.b.personId }, signal) : Promise.resolve(null)),
    { immediate: false });
watch(() => [props.open, props.a?.personId, props.b?.personId] as const, ([open]) => { pair.data.value = null; if (open && props.a && props.b) void pair.refresh(); }, { immediate: true });

const p = computed(() => pair.data.value);
const untracked = computed(() => pair.error.value?.kind === 'not_found');
const weeks = computed(() => (p.value?.weeks ?? []).slice(-26));
const peak = computed(() => Math.max(1, ...weeks.value.flatMap(w => [w.fromA, w.fromB])));
const bar = (n: number) => `${Math.max(2, Math.round((n / peak.value) * 36))}px`;
/** The insight scores are shares of one; anything larger is shown as the number it is. */
const ratio = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Math.abs(v) <= 1 ? omniPercent(v) : v.toFixed(1));
const seconds = (s: number | null | undefined) => (s === null || s === undefined ? 'not enough replies to say' : omniDuration(s * 1000));
function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return (words.length === 1 ? words[0]!.slice(0, 2) : words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}
</script>

<style scoped>
.sides { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.side { padding: 12px; border: 1px solid var(--omni-line); border-radius: var(--omni-radius); display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.name { font-weight: 620; font-size: 14px; color: var(--omni-text); overflow-wrap: anywhere; }
.name:hover { color: var(--omni-accent-2); }
.weeks { margin-top: 4px; }
.legend { display: inline-flex; align-items: center; gap: 6px; }
.legend i { width: 8px; height: 8px; border-radius: 2px; background: var(--omni-accent); display: inline-block; }
.legend i.b { background: var(--omni-accent-2); }
@media (max-width: 620px) { .sides { grid-template-columns: minmax(0, 1fr); } }
</style>
