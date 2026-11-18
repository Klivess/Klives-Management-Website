<template>
    <div class="omx-stack" data-testid="omx-activity">
        <section class="omx-card">
            <div class="omx-card-head">
                <h2>How much they write</h2><span v-if="data" class="omx-sub">{{ omxNum(data.current_messages) }} messages in {{ data.days }} days · {{ trend }}</span>
                <div class="omx-acts"><div class="omx-seg" role="group" aria-label="Period"><button v-for="d in PERIODS" :key="d" type="button" :aria-pressed="days === d" @click="days = d">{{ d }} d</button></div></div>
            </div>
            <div class="omx-card-body">
                <div v-if="error" class="omx-error" role="alert"><span class="omx-grow">{{ error }}</span><button class="omx-btn sm" type="button" @click="load()">Try again</button></div>
                <div v-else-if="!data" class="omx-skels" style="padding: 0"><div class="omx-skel" style="height: 60px"></div></div>
                <template v-else>
                    <div class="omx-bars" style="height: 64px"><i v-for="point in daily" :key="point.day" :class="{ zero: !point.count }" :title="`${point.day} · ${point.count}`" :style="{ height: `${Math.max(3, Math.round(point.count / dayMax * 100))}%` }"></i></div>
                    <div class="omx-axis"><span>{{ daily[0]?.day }}</span><span>{{ data.active_days }} active days · {{ omxNum(data.average_per_active_day) }} a day when active</span><span>{{ daily[daily.length - 1]?.day }}</span></div>
                    <div class="omx-two" style="margin-top: 14px">
                        <div>
                            <div class="omx-h">By hour (UTC)</div>
                            <div class="omx-bars"><i v-for="h in hourly" :key="h.hour" :class="{ zero: !h.count }" :title="`${String(h.hour).padStart(2, '0')}:00 · ${h.count}`" :style="{ height: `${Math.max(4, Math.round(h.count / hourMax * 100))}%`, background: 'var(--omx-cyan)' }"></i></div>
                            <div class="omx-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
                        </div>
                        <div>
                            <div class="omx-h">Where they talk most</div>
                            <ul v-if="(data.top_conversations ?? []).length" class="omx-rows" style="margin: 0 -14px">
                                <li v-for="c in data.top_conversations" :key="c.conversation_id ?? c.title">
                                    <button class="omx-link omx-row-main omx-clip" type="button" style="text-align: left" @click="c.conversation_id && omx.go('talk', { c: c.conversation_id })">{{ c.title || c.conversation_id }}</button>
                                    <span class="omx-chip">{{ c.context_kind || 'unknown' }}</span><span class="omx-num omx-dim">{{ omxNum(c.count) }}</span>
                                </li>
                            </ul>
                            <p v-else class="omx-dim">No conversation in this period.</p>
                        </div>
                    </div>
                </template>
            </div>
        </section>

        <section class="omx-card">
            <div class="omx-toolbar">
                <strong>Timeline</strong>
                <div class="omx-seg" role="group" aria-label="What to show">
                    <button v-for="t in TYPES" :key="t.id" type="button" :aria-pressed="types.includes(t.id)" @click="toggle(t.id)">{{ t.label }}</button>
                </div>
                <span class="omx-grow"></span>
                <label class="omx-rowflex omx-dim" style="font-size: 12px">From <input v-model="from" class="omx-input" type="date" /></label>
                <label class="omx-rowflex omx-dim" style="font-size: 12px">To <input v-model="to" class="omx-input" type="date" /></label>
            </div>
            <div v-if="timelineError" class="omx-card-body"><div class="omx-error" role="alert"><span class="omx-grow">{{ timelineError }}</span><button class="omx-btn sm" type="button" @click="loadTimeline()">Try again</button></div></div>
            <div v-else-if="events === null" class="omx-skels"><div class="omx-skel" style="width: 70%"></div><div class="omx-skel" style="width: 55%"></div><div class="omx-skel" style="width: 62%"></div></div>
            <div v-else-if="events.length" data-testid="omx-timeline">
                <div v-for="event in events" :key="`${event.type}-${event.event_id}`" class="omx-msg">
                    <div class="omx-msg-head"><span class="omx-chip" :class="event.type === 'fact' ? 'accent' : event.type === 'message' ? '' : 'info'">{{ event.type }}</span><strong>{{ event.title }}</strong><span>{{ event.source }}</span><span>{{ omxDateTime(event.at) }}</span>
                        <span v-if="(event.evidence ?? []).length">{{ event.evidence.length }} message{{ event.evidence.length === 1 ? '' : 's' }} behind it</span></div>
                    <div class="omx-msg-text">{{ event.content }}</div>
                </div>
            </div>
            <div v-else class="omx-empty"><strong>Nothing in this window</strong>Widen the dates or switch more kinds on.</div>
        </section>
    </div>
</template>

<script setup lang="ts">
import { omxDateTime, omxDayToMs, omxErrorText, omxNum } from '~/scripts/omniscienceConsole';

/** A person over time: how much they write and when, where, and the dated record of what was learned about them. */
const PERIODS = [30, 90, 365];
const TYPES = [
    { id: 'message', label: 'Messages' }, { id: 'fact', label: 'Facts' }, { id: 'identity', label: 'Identity' },
    { id: 'profile', label: 'Dossiers' }, { id: 'change', label: 'Changes' }, { id: 'note', label: 'Notes' },
];

const props = defineProps<{ personId: string }>();
const omx = useOmx();
const days = ref(90);
const data = ref<any>(null);
const error = ref('');
const types = ref(['fact', 'identity', 'profile', 'change', 'note']);
const from = ref('');
const to = ref('');
const events = ref<any[] | null>(null);
const timelineError = ref('');

const daily = computed<{ day: string; count: number }[]>(() => data.value?.daily ?? []);
const hourly = computed<{ hour: number; count: number }[]>(() => data.value?.hourly ?? []);
const dayMax = computed(() => Math.max(1, ...daily.value.map(p => p.count)));
const hourMax = computed(() => Math.max(1, ...hourly.value.map(h => h.count)));
const trend = computed(() => {
    const pct = Number(data.value?.trend_pct);
    if (!Number.isFinite(pct)) return 'no earlier period to compare';
    return `${pct > 0 ? '+' : ''}${Math.round(pct)}% on the ${data.value.days} days before`;
});

async function load() {
    data.value = null; error.value = '';
    try { data.value = await omx.api.get(`/omniscience/workspace/activity?personId=${encodeURIComponent(props.personId)}&days=${days.value}`); }
    catch (cause) { error.value = omxErrorText(cause, 'Their activity could not be read.'); }
}
async function loadTimeline() {
    events.value = null; timelineError.value = '';
    if (!types.value.length) { events.value = []; return; }
    try {
        const params = new URLSearchParams({ personId: props.personId, limit: '100', types: types.value.join(',') });
        const start = omxDayToMs(from.value), end = omxDayToMs(to.value, true);
        if (start) params.set('from', String(start));
        if (end) params.set('to', String(end));
        events.value = (await omx.api.get('/omniscience/workspace/timeline?' + params))?.events ?? [];
    } catch (cause) { timelineError.value = omxErrorText(cause, 'The timeline could not be read.'); events.value = []; }
}
function toggle(id: string) { types.value = types.value.includes(id) ? types.value.filter(t => t !== id) : [...types.value, id]; }

watch(() => [props.personId, days.value], load, { immediate: true });
watch(() => [props.personId, types.value.join(','), from.value, to.value], loadTimeline, { immediate: true });
</script>
