<template>
    <section class="os-panel os-activity-panel">
        <div class="os-panel-head">
            <div>
                <h2><span class="os-panel-code">ACT</span> Activity rhythm</h2>
                <p class="os-panel-subtitle">Message volume, active hours and conversation distribution</p>
            </div>
            <div class="os-segmented" aria-label="Activity period">
                <button v-for="period in [30, 90, 365]" :key="period" :class="{ active: days === period }" @click="days = period">{{ period }}d</button>
            </div>
        </div>
        <div class="os-panel-body">
            <div v-if="error" class="os-error-state"><span>{{ error }}</span><button class="os-btn sm" @click="load">Retry</button></div>
            <div v-else-if="loading && !data" class="os-skeleton-stack"><i /><i /><i /></div>
            <template v-else-if="data">
                <div class="os-activity-kpis">
                    <div><span>Messages</span><strong>{{ formatCompact(data.current_messages) }}</strong><small>in {{ data.days }} days</small></div>
                    <div><span>Vs previous</span><strong :class="trendClass">{{ signed(data.trend_pct) }}%</strong><small>{{ formatCompact(data.previous_messages) }} before</small></div>
                    <div><span>Active days</span><strong>{{ data.active_days }}</strong><small>of {{ data.days }}</small></div>
                    <div><span>Daily average</span><strong>{{ formatCompact(data.average_per_active_day) }}</strong><small>per active day</small></div>
                </div>
                <div class="os-chart-heading"><span>Daily volume</span><small>Hover a bar for exact counts</small></div>
                <div v-if="daily.length" class="os-daily-chart" role="img" aria-label="Daily message volume">
                    <div v-for="point in daily" :key="point.day" class="os-daily-bar" :title="`${point.day}: ${point.count} messages`">
                        <i :style="{ height: barHeight(point.count) + '%' }" />
                    </div>
                </div>
                <div v-else class="os-empty">No messages in this period.</div>
                <div class="os-activity-grid">
                    <div>
                        <div class="os-chart-heading"><span>Active hours · UTC</span><small>Brighter means more messages</small></div>
                        <div class="os-hour-heatmap">
                            <div v-for="hour in hourly" :key="hour.hour" class="os-hour-cell" :style="{ '--intensity': intensity(hour.count) }" :title="`${pad(hour.hour)}:00 · ${hour.count} messages`">
                                <span>{{ hour.count || '' }}</span><small>{{ hour.hour % 3 === 0 ? pad(hour.hour) : '' }}</small>
                            </div>
                        </div>
                    </div>
                    <div>
                        <div class="os-chart-heading"><span>Top conversations</span><small>{{ data.days }} days</small></div>
                        <div class="os-conversation-list">
                            <NuxtLink v-for="conversation in data.top_conversations || []" :key="conversation.conversation_id" :to="conversationLink(conversation)">
                                <span><strong>{{ conversation.title }}</strong><small>{{ conversation.context_kind || 'unknown' }}</small></span>
                                <b>{{ formatCompact(conversation.count) }}</b>
                            </NuxtLink>
                            <div v-if="!(data.top_conversations || []).length" class="os-empty">No conversation data.</div>
                        </div>
                    </div>
                </div>
            </template>
        </div>
    </section>
</template>

<script setup lang="ts">
import { formatCompact, omniscienceError, useOmniscienceApi } from '~/composables/useOmniscienceApi';

const props = withDefaults(defineProps<{ personId: string; initialDays?: number }>(), { initialDays: 90 });
const api = useOmniscienceApi();
const days = ref(props.initialDays);
const data = ref<any>(null);
const loading = ref(false);
const error = ref('');
const daily = computed(() => data.value?.daily || []);
const hourly = computed(() => data.value?.hourly || Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })));
const maxDaily = computed(() => Math.max(1, ...daily.value.map((point: any) => point.count || 0)));
const maxHourly = computed(() => Math.max(1, ...hourly.value.map((point: any) => point.count || 0)));
const trendClass = computed(() => (data.value?.trend_pct || 0) > 0 ? 'positive' : (data.value?.trend_pct || 0) < 0 ? 'negative' : '');
function barHeight(count: number) { return Math.max(2, Math.round(count / maxDaily.value * 100)); }
function intensity(count: number) { return count ? Math.max(.12, count / maxHourly.value) : 0; }
function signed(value: number) { return `${value > 0 ? '+' : ''}${value || 0}`; }
function pad(value: number) { return String(value).padStart(2, '0'); }
function conversationLink(conversation: any) {
    return '/omniscience-explore?scope=' + encodeURIComponent(JSON.stringify({ conversationId: conversation.conversation_id }));
}
async function load() {
    if (!props.personId) { data.value = null; return; }
    loading.value = true;
    error.value = '';
    try { data.value = await api.get(`/omniscience/workspace/activity?personId=${encodeURIComponent(props.personId)}&days=${days.value}`); }
    catch (cause) { error.value = omniscienceError(cause, 'Could not load activity.'); }
    finally { loading.value = false; }
}
watch([() => props.personId, days], load, { immediate: true });
</script>

<style scoped>
.os-activity-kpis { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin-bottom: 20px; }
.os-activity-kpis > div { padding: 11px; border: 1px solid var(--os-line); border-radius: 9px; background: rgba(255,255,255,.018); }
.os-activity-kpis span, .os-activity-kpis small { display: block; color: var(--os-muted); font-size: 9px; text-transform: uppercase; letter-spacing: .05em; }
.os-activity-kpis strong { display: block; margin: 5px 0 3px; color: var(--os-ink); font: 750 21px var(--os-mono); }
.os-activity-kpis strong.positive { color: var(--os-green); }
.os-activity-kpis strong.negative { color: var(--os-red); }
.os-chart-heading { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin: 13px 0 8px; color: var(--os-ink-dim); font-size: 11px; font-weight: 700; }
.os-chart-heading small { color: var(--os-faint); font-size: 9px; font-weight: 500; }
.os-daily-chart { display: flex; align-items: flex-end; gap: 2px; height: 135px; padding: 10px 8px 4px; border-bottom: 1px solid var(--os-line); }
.os-daily-bar { display: flex; align-items: flex-end; flex: 1; min-width: 1px; height: 100%; }
.os-daily-bar i { display: block; width: 100%; min-height: 2px; border-radius: 2px 2px 0 0; background: linear-gradient(180deg,var(--os-cyan),rgba(95,211,255,.25)); transition: height .2s; }
.os-daily-bar:hover i { background: var(--os-violet); }
.os-activity-grid { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(220px,1fr); gap: 18px; }
.os-hour-heatmap { display: grid; grid-template-columns: repeat(12,1fr); gap: 4px; }
.os-hour-cell { display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 42px; border: 1px solid rgba(95,211,255,calc(var(--intensity) * .5)); border-radius: 5px; background: rgba(95,211,255,calc(var(--intensity) * .65)); color: var(--os-ink); font: 700 9px var(--os-mono); }
.os-hour-cell small { color: var(--os-muted); font-size: 8px; }
.os-conversation-list { display: flex; flex-direction: column; gap: 5px; }
.os-conversation-list a { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 6px; color: inherit; text-decoration: none; }
.os-conversation-list a:hover { background: rgba(95,211,255,.06); }
.os-conversation-list a > span { flex: 1; min-width: 0; }
.os-conversation-list strong, .os-conversation-list small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.os-conversation-list strong { color: var(--os-ink-dim); font-size: 10px; }
.os-conversation-list small { color: var(--os-faint); font-size: 9px; }
.os-conversation-list b { color: var(--os-cyan); font: 700 10px var(--os-mono); }
.os-segmented { display: flex; padding: 2px; border: 1px solid var(--os-line); border-radius: 7px; }
.os-segmented button { padding: 4px 8px; border: 0; border-radius: 5px; background: transparent; color: var(--os-muted); cursor: pointer; font-size: 10px; }
.os-segmented button.active { background: rgba(95,211,255,.12); color: var(--os-cyan); }
@media (max-width: 800px) { .os-activity-kpis { grid-template-columns: repeat(2,1fr); } .os-activity-grid { grid-template-columns: 1fr; } .os-hour-heatmap { grid-template-columns: repeat(8,1fr); } }
</style>
