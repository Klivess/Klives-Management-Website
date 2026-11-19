<template>
    <OmniscienceV3Shell>
        <div class="omni-pagehead">
            <div>
                <h1>Health</h1>
                <p class="subtitle">Is the data still flowing? Failing or silent sources, stuck backfills, model errors and dead jobs, plus the monitors that watch people and topics and what they found.</p>
            </div>
            <div class="omni-actions">
                <span v-if="health.data.value?.checkedAtMs" class="omni-muted">checked <OmniscienceV3Time :ms="health.data.value.checkedAtMs" mode="age" /></span>
                <button class="omni-btn ghost" type="button" @click="refreshAll()">Refresh</button>
            </div>
        </div>

        <OmniscienceV3Panel title="Problems" :loading="health.loading.value" :error="health.error.value" :has-data="!!health.data.value"
                            :empty="!!health.data.value && !health.data.value.open.length" empty-kind="ok"
                            :empty-title="health.data.value && !health.data.value.enabled ? 'Health checks are switched off' : 'Everything is flowing'"
                            :attention="!!health.data.value?.open.some(i => i.severity.toLowerCase() === 'urgent')" @retry="health.refresh()">
            <ul v-if="health.data.value" class="issues" data-testid="health-open">
                <li v-for="i in health.data.value.open" :key="i.issueId" :class="i.severity.toLowerCase()">
                    <span class="omni-chip sm" :class="severityTone(i.severity)">{{ omniHumanise(i.kind) }}</span>
                    <span class="text">{{ healthText(i.kind, i.detail, i.subject) }}</span>
                    <span class="omni-muted">since <OmniscienceV3Time :ms="i.firstMs" mode="age" /></span>
                    <NuxtLink v-if="i.kind === 'jobs_dead'" class="omni-muted" :to="`${OMNI_BASE}/jobs?state=dead`">jobs →</NuxtLink>
                    <NuxtLink v-else-if="i.kind === 'tail_stalled' || i.kind === 'module_stalled'" class="omni-muted" :to="`${OMNI_BASE}/jobs?module=${encodeURIComponent(i.subject ?? '')}`">its jobs →</NuxtLink>
                    <NuxtLink v-else-if="i.kind.startsWith('llm') || i.kind === 'cache_floor'" class="omni-muted" :to="`${OMNI_BASE}/llm`">model calls →</NuxtLink>
                </li>
            </ul>
        </OmniscienceV3Panel>

        <div class="omni-grid two">
            <OmniscienceV3Panel title="Monitors" flush :loading="rules.loading.value" :error="rules.error.value" :has-data="!!rules.data.value"
                                :empty="!!rules.data.value && !rules.data.value.rules.length" empty-title="No monitors"
                                empty-text="Watch a person's activity (X42) or a topic surge (X43) from the Tactics page." @retry="rules.refresh()">
                <table v-if="rules.data.value" class="omni-table" data-testid="monitor-rules">
                    <thead><tr><th>Monitor</th><th class="num">Found (30 d)</th><th class="num">Last</th><th v-if="canManage"></th></tr></thead>
                    <tbody>
                        <tr v-for="r in rules.data.value.rules" :key="r.watchId" class="clickable" :class="{ selected: filters.rule === r.watchId }" @click="filters.rule = filters.rule === r.watchId ? '' : r.watchId">
                            <td><span class="cellstack"><span><strong>{{ r.name }}</strong> <span v-if="!r.enabled" class="omni-chip sm">off</span></span>
                                <span class="sub">{{ describe(r) }}</span></span></td>
                            <td class="num">{{ omniCount(r.fired30d) }}</td>
                            <td class="num"><OmniscienceV3Time :ms="r.lastFiredMs" mode="age" /></td>
                            <td v-if="canManage" class="actions" @click.stop>
                                <button class="omni-btn ghost sm" type="button" :disabled="busy !== null" @click="toggle(r.watchId, !r.enabled)">{{ r.enabled ? 'Turn off' : 'Turn on' }}</button>
                                <button class="omni-btn ghost sm" type="button" :disabled="busy !== null" @click="remove(r.watchId, r.name)">Delete</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <template v-if="topic.data.value" #footer>
                    <div class="topic" data-testid="topic-status">
                        <strong>{{ topic.data.value.name }}</strong>
                        <span :class="topic.data.value.surging ? 'neg' : 'omni-muted'">{{ topic.data.value.surging ? 'surging' : 'normal' }}:
                            {{ omniCount(topic.data.value.last24h) }} in 24 h, usual day {{ topic.data.value.usualDay.toFixed(1) }}, robust z {{ topic.data.value.robustZ.toFixed(1) }}</span>
                        <svg class="spark" :viewBox="`0 0 ${Math.max(1, topic.data.value.days.length)} 20`" preserveAspectRatio="none" aria-hidden="true">
                            <rect v-for="(n, i) in topic.data.value.days" :key="i" :x="i + 0.1" width="0.8" :y="20 - spark(n)" :height="spark(n)" />
                        </svg>
                    </div>
                </template>
            </OmniscienceV3Panel>

            <OmniscienceV3Panel title="What the monitors found" flush :loading="events.loading.value" :error="events.error.value" :has-data="!!events.data.value"
                                :empty="!!events.data.value && !events.data.value.items.length" empty-title="Nothing yet" @retry="events.refresh()">
                <template #controls>
                    <select v-model="filters.kind" class="omni-select auto" aria-label="Kind of finding">
                        <option value="">Everything</option>
                        <option v-for="k in KINDS" :key="k" :value="k">{{ omniHumanise(k) }}</option>
                    </select>
                </template>
                <ul v-if="events.data.value" class="issues" data-testid="monitor-events">
                    <li v-for="e in events.data.value.items" :key="e.eventId">
                        <span class="text">{{ findingText(e.kind, e.data, e.personName) }}</span>
                        <NuxtLink v-if="e.personId" class="omni-muted" :to="`${OMNI_BASE}/people/${encodeURIComponent(e.personId)}`">person</NuxtLink>
                        <span class="omni-muted"><OmniscienceV3Time :ms="e.atMs" mode="age" /></span>
                        <span v-if="!e.notified" class="omni-chip sm" title="Recorded but not told (quiet hours, or a rule said not to)">quiet</span>
                    </li>
                </ul>
            </OmniscienceV3Panel>
        </div>

        <div class="omni-grid two">
            <OmniscienceV3Panel title="Resolved lately" flush :loading="health.loading.value" :error="health.error.value" :has-data="!!health.data.value"
                                :empty="!!health.data.value && !health.data.value.resolved.length" empty-title="Nothing resolved recently">
                <ul v-if="health.data.value" class="issues">
                    <li v-for="i in health.data.value.resolved" :key="i.issueId">
                        <span class="omni-chip sm">{{ omniHumanise(i.kind) }}</span>
                        <span class="text">{{ healthText(i.kind, i.detail, i.subject) }}</span>
                        <span class="omni-muted">fixed <OmniscienceV3Time :ms="i.resolvedMs" mode="age" /></span>
                    </li>
                </ul>
            </OmniscienceV3Panel>
            <OmniscienceV3Panel title="Translation" :loading="translate.loading.value" :error="translate.error.value" :has-data="!!translate.data.value" @retry="translate.refresh()">
                <dl v-if="translate.data.value" class="omni-kv" data-testid="translate-status">
                    <dt>Into</dt><dd>{{ translate.data.value.target }}</dd>
                    <dt>Automatic</dt><dd>{{ translate.data.value.auto ? 'yes, as messages arrive' : 'only when asked' }}</dd>
                    <dt>Stored</dt><dd>{{ omniCount(translate.data.value.stored) }} translations</dd>
                    <dt>Waiting</dt><dd>{{ omniCount(translate.data.value.queued) }}</dd>
                    <dt>This hour</dt><dd>{{ omniCount(translate.data.value.usedThisHour) }} of {{ omniCount(translate.data.value.perHour) }}</dd>
                </dl>
            </OmniscienceV3Panel>
        </div>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { OMNI_BASE, omniGet, omniPost } from '~/scripts/omniscience/api';
import type { HealthListDto, MonitorEventPageDto, MonitorRuleChangedDto, MonitorRuleDto, MonitorRuleListDto, TopicStatusDto, TranslateStatusDto } from '~/scripts/omniscience/contracts';
import { omniCount } from '~/scripts/omniscience/format';
import { findingText, healthText, omniHumanise } from '~/scripts/omniscience/findings';
import { useOmniAction, useOmniDebounced, useOmniResource } from '~/composables/useOmniscienceV3';
import { useOmniUrlState } from '~/composables/useOmniscienceV3';
import { useAccess } from '~/composables/useAccess';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Health' });

const KINDS = ['person_activity', 'new_person', 'topic_surge', 'klives_tone', 'data_health'];

const { can } = useAccess();
const canManage = computed(() => can('omniscience.alerts.manage'));
const { busy, run } = useOmniAction();
const { state: filters } = useOmniUrlState({ kind: '', rule: '' });

const health = useOmniResource(signal => omniGet<HealthListDto>('monitors/health', {}, signal), { pollMs: 60_000 });
const rules = useOmniResource(signal => omniGet<MonitorRuleListDto>('monitors/rules', {}, signal));
const events = useOmniResource(signal => omniGet<MonitorEventPageDto>('monitors/events', { kind: filters.kind, limit: 50 }, signal));
useOmniDebounced(() => filters.kind, () => { void events.refresh(); }, 50);
const translate = useOmniResource(signal => omniGet<TranslateStatusDto>('translate/status', {}, signal));

const selectedRule = computed(() => rules.data.value?.rules.find(r => r.watchId === filters.rule) ?? null);
const topic = useOmniResource(signal => (selectedRule.value?.kind === 'topic_surge'
    ? omniGet<TopicStatusDto>('monitors/topic', { watchId: selectedRule.value.watchId }, signal)
    : Promise.resolve(null as TopicStatusDto | null)));
watch(() => selectedRule.value?.watchId, () => { topic.data.value = null; void topic.refresh(); });

function refreshAll() { void health.refresh(); void rules.refresh(); void events.refresh(); void translate.refresh(); void topic.refresh(); }

function severityTone(severity: string): string {
    const s = severity.toLowerCase();
    return s === 'urgent' ? 'bad' : s === 'attention' ? 'warn' : 'info';
}

function describe(r: MonitorRuleDto): string {
    const d = (r.definition && typeof r.definition === 'object' ? r.definition : {}) as Record<string, unknown>;
    const list = (v: unknown) => (Array.isArray(v) ? v.length : 0);
    if (r.kind === 'person_activity') {
        const parts = [`${list(d.persons)} ${list(d.persons) === 1 ? 'person' : 'people'}`];
        if (typeof d.absenceDays === 'number') parts.push(`back after ${d.absenceDays} days`);
        if (list(d.guilds)) parts.push(`posting in ${list(d.guilds)} server${list(d.guilds) === 1 ? '' : 's'}`);
        return `Person activity: ${parts.join(', ')}`;
    }
    if (r.kind === 'topic_surge') {
        const what = typeof d.phrase === 'string' && d.phrase ? `“${d.phrase}”` : 'a taught concept';
        const places = list(d.guilds) + list(d.conversations);
        const where = places ? ` in ${places} place${places === 1 ? '' : 's'}` : ' everywhere';
        return `Topic surge: ${what}${where}`;
    }
    return omniHumanise(r.kind);
}

async function toggle(watchId: string, enabled: boolean) {
    const result = await run('monitor-enabled', () => omniPost<MonitorRuleChangedDto>('monitors/rules/enabled', { watchId, enabled }));
    if (result) void rules.refresh();
}
async function remove(watchId: string, name: string) {
    if (!window.confirm(`Delete the monitor “${name}”? What it already found stays.`)) return;
    const result = await run('monitor-delete', () => omniPost<MonitorRuleChangedDto>('monitors/rules/delete', { watchId }), () => 'Monitor deleted.');
    if (result) { if (filters.rule === watchId) filters.rule = ''; void rules.refresh(); }
}

const maxSpark = computed(() => Math.max(1, ...(topic.data.value?.days ?? [])));
function spark(n: number): number { return n <= 0 ? 0 : Math.max(1, (n / maxSpark.value) * 19); }
</script>

<style scoped>
.omni-grid.two { margin-top: var(--omni-gutter); }
.issues { list-style: none; margin: 0; padding: 0; }
.issues li { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--omni-line); font-size: 13px; flex-wrap: wrap; }
.issues li .text { flex: 1 1 300px; min-width: 0; }
.issues li.urgent { box-shadow: inset 2px 0 0 var(--omni-negative); }
.issues li.attention { box-shadow: inset 2px 0 0 var(--omni-warning); }
td.actions { white-space: nowrap; text-align: right; }
.topic { display: flex; flex-direction: column; gap: 4px; width: 100%; font-size: 13px; }
.spark { width: 100%; height: 28px; }
.spark rect { fill: var(--omni-accent, #58a6ff); }
</style>
