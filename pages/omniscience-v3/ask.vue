<template>
    <OmniscienceV3Shell>
        <div class="ot-pagehead">
            <div>
                <h1>Ask</h1>
                <p class="subtitle">Ask anything about the people in the archive. The answer comes from several independent readings of the evidence, with every message it rests on quoted, and it says when it does not know.</p>
            </div>
            <div class="ot-actions"><button class="ot-btn ghost" type="button" @click="refreshTab()">Refresh</button></div>
        </div>

        <div class="ot-segment tabs" role="tablist" aria-label="Ask">
            <button v-for="t in TABS" :key="t.value" type="button" role="tab" :aria-selected="view.tab === t.value" :aria-pressed="view.tab === t.value"
                    :data-testid="`ask-tab-${t.value}`" @click="view.tab = t.value">{{ t.label }}</button>
        </div>

        <!-- ── ask ──────────────────────────────────────────────────────────── -->
        <template v-if="view.tab === 'ask'">
            <div class="ot-grid sidebar">
                <OmniTraderCard title="Your question">
                    <form class="omni-form" data-testid="ask-form" @submit.prevent="ask()">
                        <div class="ot-field">
                            <label for="ask-q">Question</label>
                            <textarea id="ask-q" v-model="draft.question" class="ot-input" rows="4" maxlength="2000" required placeholder="e.g. Does Ada still live in Leeds?"></textarea>
                        </div>
                        <div class="ot-field">
                            <label for="ask-people">About (optional)</label>
                            <OmniscienceV3PersonPick v-model="draft.people" input-id="ask-people" :max="6" testid="ask-people" />
                            <span class="help">Leave empty to let the question name them. Nothing is ever worked out about someone under 18.</span>
                        </div>
                        <div class="ot-field">
                            <label for="ask-asof">As of (optional)</label>
                            <input id="ask-asof" v-model="draft.asOf" class="ot-input" type="datetime-local" />
                            <span class="help">Answer as if it were then: nothing written later is read. In {{ zoneLabel }}.</span>
                        </div>
                        <label class="ot-check"><input v-model="draft.standing" type="checkbox" /> Keep watching: ask again when new messages bear on it, and tell me if the answer changes</label>
                        <div class="omni-row">
                            <button class="ot-btn primary" type="submit" :disabled="!canAsk || busy !== null || !draft.question.trim()" data-testid="ask-submit">Ask</button>
                            <button class="ot-btn" type="button" :disabled="!canRun || busy !== null || !draft.question.trim()" data-testid="ask-plan" @click="preview()">How would it be answered?</button>
                        </div>
                        <p v-if="!canAsk" class="omni-muted">Asking needs the “Run tactics and inquiries” and “Ask about people” permissions.</p>
                    </form>

                    <div v-if="plan" class="plan" data-testid="ask-plan-result">
                        <h4 class="omni-h4">How it would be answered</h4>
                        <p><strong>{{ planTactic ? `${planTactic.code} ${planTactic.title}` : plan.tactic }}</strong><span v-if="plan.reason" class="omni-muted"> — {{ plan.reason }}</span></p>
                        <p><span class="omni-muted">Understood as:</span> {{ plan.restatement }}</p>
                        <div v-if="plan.people.length" class="omni-row">
                            <span class="omni-muted">People it found:</span>
                            <button v-for="c in plan.people" :key="c.personId" class="ot-btn ghost sm" type="button" :title="c.detail ?? undefined" @click="addPerson(c.personId, c.label)">+ {{ c.label }}</button>
                        </div>
                        <p v-if="planTactic && planTactic.category !== 'Inquiry'" class="omni-muted">
                            This is not a question for the inquiry engine. <NuxtLink :to="`${OMNI_BASE}/tactics?tactic=${encodeURIComponent(plan.tactic)}`">Open “{{ planTactic.title }}” under Tactics</NuxtLink>.
                        </p>
                    </div>
                </OmniTraderCard>

                <div>
                    <OmniTraderCard v-if="!view.run" title="The answer" empty empty-title="Nothing asked yet"
                                    empty-text="Ask a question, or open a past answer. A typical answer takes a minute or two: it reads the evidence several times and compares the readings." />
                    <template v-else>
                        <OmniTraderCard v-if="answer" title="The answer">
                            <template #controls>
                                <button v-if="canReview && !answerFeedback" class="ot-btn ghost sm" type="button" :disabled="busy !== null" @click="feedback(answer.inquiryId, 'correct')">It was right</button>
                                <button v-if="canReview && !answerFeedback" class="ot-btn ghost sm" type="button" :disabled="busy !== null" @click="feedback(answer.inquiryId, 'incorrect')">It was wrong</button>
                                <span v-if="answerFeedback" class="ot-chip sm ok">you said: {{ answerFeedback }}</span>
                            </template>
                            <OmniscienceV3InquiryReport :report="answer" @pick="(id, label) => askAbout(answer, id, label)" />
                        </OmniTraderCard>
                        <OmniTraderCard :title="answer ? 'How it ran' : 'Working on it'">
                            <OmniscienceV3TacticRunView :run-id="view.run" @changed="onRunChanged()" @open="id => (view.run = id)" @use="useSelection" />
                        </OmniTraderCard>
                    </template>
                </div>
            </div>
        </template>

        <!-- ── past answers ─────────────────────────────────────────────────── -->
        <template v-else-if="view.tab === 'past'">
            <div class="ot-filterbar">
                <div class="ot-segment" role="group" aria-label="Outcome">
                    <button v-for="s in STATES" :key="s.value" type="button" :aria-pressed="view.state === s.value" @click="view.state = s.value">{{ s.label }}</button>
                </div>
                <span class="summary"><b>{{ past.items.value.length }}</b> shown</span>
            </div>
            <OmniscienceV3Panel title="Past answers" flush :loading="past.loading.value" :error="past.error.value" :has-data="past.items.value.length > 0" :empty="!past.items.value.length"
                                empty-title="No answers here" :empty-kind="view.state ? 'filtered' : 'empty'" @retry="past.reload()">
                <table class="ot-table" data-testid="inquiries-table">
                    <thead><tr><th>Asked</th><th>Question</th><th>Answer</th><th class="num">Confidence</th><th>About</th><th>Your verdict</th></tr></thead>
                    <tbody>
                        <tr v-for="i in past.items.value" :key="i.inquiryId" class="clickable" :class="{ selected: view.inquiry === i.inquiryId }" @click="view.inquiry = i.inquiryId">
                            <td class="num"><OmniscienceV3Time :ms="i.createdAtMs" mode="age" /></td>
                            <td><span class="cellstack"><span>{{ i.question }}</span><span v-if="i.restatement && i.restatement !== i.question" class="sub">{{ i.restatement }}</span></span></td>
                            <td><span class="ot-chip" :class="verdictTone(i.verdict)">{{ verdictLabel(i.verdict) }}</span>
                                <span v-if="i.standingId" class="ot-chip sm info" title="Asked again whenever new messages bear on it">watching</span></td>
                            <td class="num">{{ omniPercent(i.probability) }}</td>
                            <td><NuxtLink v-if="i.primarySubjectId" :to="personLink(i.primarySubjectId)" @click.stop>{{ name(i.primarySubjectId) }}</NuxtLink><span v-else class="omni-muted">—</span></td>
                            <td><span v-if="i.feedback" class="ot-chip sm" :class="i.feedback === 'correct' || i.feedback === 'yes' ? 'ok' : 'warn'">{{ i.feedback }}</span><span v-else class="omni-muted">—</span></td>
                        </tr>
                    </tbody>
                </table>
                <template v-if="past.hasMore.value" #footer>
                    <button class="ot-btn sm" type="button" :disabled="past.loadingMore.value" @click="past.loadMore()">{{ past.loadingMore.value ? 'Loading…' : 'Load older answers' }}</button>
                </template>
            </OmniscienceV3Panel>

            <OmniTraderDrawer :open="!!view.inquiry" :title="opened.data.value?.question ?? 'Answer'" wide @close="view.inquiry = ''">
                <OmniscienceV3ErrorBlock v-if="opened.error.value && !opened.data.value" :error="opened.error.value" what="This answer" @retry="opened.refresh()" />
                <div v-else-if="!opened.data.value" class="ot-skelrows" aria-busy="true"><div v-for="n in 6" :key="n" class="ot-skel"></div></div>
                <template v-else>
                    <div v-if="canReview" class="omni-row feedback">
                        <span class="omni-muted">Was it right?</span>
                        <button class="ot-btn sm" type="button" :disabled="busy !== null" data-testid="inquiry-right" @click="feedback(opened.data.value.inquiryId, 'correct')">It was right</button>
                        <button class="ot-btn sm" type="button" :disabled="busy !== null" data-testid="inquiry-wrong" @click="feedback(opened.data.value.inquiryId, 'incorrect')">It was wrong</button>
                        <span class="omni-muted">Your marks are what the confidence numbers are corrected against.</span>
                    </div>
                    <OmniscienceV3InquiryReport :report="opened.data.value" @pick="(id, label) => askAbout(opened.data.value, id, label)" />
                </template>
            </OmniTraderDrawer>
        </template>

        <!-- ── standing questions ───────────────────────────────────────────── -->
        <template v-else>
            <OmniscienceV3Panel title="Questions being watched" flush :loading="standing.loading.value" :error="standing.error.value" :has-data="!!standing.data.value"
                                :empty="!!standing.data.value && !standing.data.value.length" empty-title="No questions are being watched"
                                empty-text="Tick “Keep watching” when you ask. The question is asked again when new live messages bear on it, and a change of answer becomes a notice under Signals."
                                @retry="standing.refresh()">
                <table v-if="standing.data.value" class="ot-table" data-testid="standing-table">
                    <thead><tr><th>Question</th><th>About</th><th>Last answer</th><th class="num">Asked again</th><th class="num">At most every</th><th>State</th><th v-if="canRun"></th></tr></thead>
                    <tbody>
                        <tr v-for="q in standing.data.value" :key="q.questionId">
                            <td>{{ q.question }}</td>
                            <td><NuxtLink v-for="p in q.personIds" :key="p" class="who" :to="personLink(p)">{{ name(p) }}</NuxtLink></td>
                            <td><span class="ot-chip" :class="verdictTone(q.lastVerdict)">{{ verdictLabel(q.lastVerdict) }}</span> <span class="omni-muted">{{ omniPercent(q.lastProbability) }}</span></td>
                            <td class="num"><OmniscienceV3Time :ms="q.lastEvaluatedMs" mode="age" /></td>
                            <td class="num">{{ omniDuration(q.minIntervalMs) }}</td>
                            <td><span class="ot-chip sm" :class="q.enabled ? 'ok' : ''">{{ q.enabled ? 'watching' : 'off' }}</span>
                                <span v-if="q.pending" class="ot-chip sm info" title="New evidence arrived; it will be asked again once its minimum interval has passed">due</span></td>
                            <td v-if="canRun" class="actions">
                                <button class="ot-btn ghost sm" type="button" :disabled="busy !== null" @click="toggleStanding(q)">{{ q.enabled ? 'Stop watching' : 'Watch again' }}</button>
                                <button class="ot-btn ghost sm" type="button" @click="showHistory(q.questionId)">Its answers</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </OmniscienceV3Panel>
        </template>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { OMNI_BASE, omniGet, omniPost } from '~/scripts/omniscience/api';
import type {
    AskPlanDto, AskStartedDto, InquiryPageDto, InquiryReportDto, InquiryRowDto, Selection, StandingQuestionDto, TacticCatalogDto, TacticDescriptor,
} from '~/scripts/omniscience/contracts';
import { omniDuration, omniPercent, omniZonedToMs } from '~/scripts/omniscience/format';
import { verdictLabel, verdictTone } from '~/scripts/omniscience/knowledge';
import { useOmniAction, useOmniCarry, useOmniDebounced, useOmniNames, useOmniPaged, useOmniResource, useOmniTime } from '~/composables/useOmniscienceV3';
import { useUrlState } from '~/composables/useOmniTrader';
import { useAccess } from '~/composables/useAccess';
import type { PickedPerson } from '~/components/OmniscienceV3/PersonPick.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Ask' });

type Tab = 'ask' | 'past' | 'standing';
const TABS: { value: Tab; label: string }[] = [{ value: 'ask', label: 'Ask' }, { value: 'past', label: 'Past answers' }, { value: 'standing', label: 'Questions being watched' }];
const STATES = [
    { value: '', label: 'All' }, { value: 'answered', label: 'Answered' }, { value: 'insufficient', label: 'Not enough evidence' },
    { value: 'needs_disambiguation', label: 'Which person?' }, { value: 'refused', label: 'Withheld' },
];

const route = useRoute();
const router = useRouter();
const carry = useOmniCarry();
const { can } = useAccess();
const canRun = computed(() => can('omniscience.tactics.run'));
const canAsk = computed(() => canRun.value && can('omniscience.persons.ask'));
const canReview = computed(() => can('omniscience.review.act'));
const { busy, run } = useOmniAction();
const { zone, lens } = useOmniTime();
const zoneLabel = computed(() => (lens.value === 'Utc' ? 'UTC' : zone.value));
const { state: view } = useUrlState({ tab: 'ask' as Tab, run: '', state: '', standing: '', inquiry: '' });

function personLink(id: string): string { return `${OMNI_BASE}/people/${encodeURIComponent(id)}`; }

// ── asking ─────────────────────────────────────────────────────────────────
const draft = reactive({ question: '', people: [] as PickedPerson[], asOf: '', standing: false });
// Arriving from a person page: the question is about them.
if (typeof route.query.person === 'string' && route.query.person) draft.people = [{ id: route.query.person, label: null }];

const plan = shallowRef<AskPlanDto | null>(null);
const catalog = shallowRef<TacticDescriptor[]>([]);
const planTactic = computed(() => catalog.value.find(t => t.key === plan.value?.tactic) ?? null);
watch(() => draft.question, () => { plan.value = null; });

function body(tactic: string | null) {
    return {
        question: draft.question.trim(), personIds: draft.people.length ? draft.people.map(p => p.id) : null, tactic,
        asOfMs: draft.asOf ? omniZonedToMs(draft.asOf, zone.value) : null, standing: draft.standing,
    };
}

function addPerson(id: string, label: string) {
    if (!draft.people.some(p => p.id === id)) draft.people = [...draft.people, { id, label }];
}

async function preview() {
    const result = await run('plan', () => omniPost<AskPlanDto>('knowledge/ask/plan', body(null)));
    if (!result) return;
    plan.value = result;
    if (!catalog.value.length) {
        try { catalog.value = (await omniGet<TacticCatalogDto>('tactics')).tactics; } catch { /* the plan still shows the tactic's key */ }
    }
}

const answer = shallowRef<InquiryReportDto | null>(null);
const answerFeedback = ref<string | null>(null);

async function ask() {
    // The router's choice is used only when it is an inquiry; otherwise the plain question-answering tactic runs.
    const tactic = planTactic.value?.category === 'Inquiry' ? plan.value!.tactic : null;
    const started = await run('ask', () => omniPost<AskStartedDto>('knowledge/ask', body(tactic)), () => 'Asked. The answer appears here when the readings are done.');
    if (!started) return;
    answer.value = null;
    answerFeedback.value = null;
    view.run = started.runId;
}

/** A finished inquiry is filed under its run: look it up each time the run changes state. */
async function onRunChanged() {
    if (!view.run || answer.value) return;
    try {
        const page = await omniGet<InquiryPageDto>('knowledge/inquiries', { limit: 50 });
        const row = page.items.find(i => i.runId === view.run);
        if (!row) return;
        answer.value = await omniGet<InquiryReportDto>('knowledge/inquiries/get', { id: row.inquiryId });
        answerFeedback.value = row.feedback ?? null;
    } catch {
        // The run view above already shows the state; the answer can be opened from "Past answers".
    }
}
watch(() => view.run, () => { answer.value = null; answerFeedback.value = null; if (view.run) void onRunChanged(); }, { immediate: true });

/** "Which person did you mean?": the question of that answer, ready to be asked again about the one picked. */
function askAbout(of: InquiryReportDto | null, personId: string, label: string) {
    if (of) draft.question = of.question;
    draft.people = [{ id: personId, label }];
    view.tab = 'ask';
    view.inquiry = '';
}

function useSelection(selection: Selection) {
    carry.value = selection;
    void router.push(`${OMNI_BASE}/tactics`);
}

// ── past answers ───────────────────────────────────────────────────────────
const past = useOmniPaged<InquiryRowDto, string>((cursor, signal) =>
    omniGet<InquiryPageDto>('knowledge/inquiries', { state: view.state, standing: view.standing, cursor, limit: 50 }, signal));
useOmniDebounced(() => `${view.state}|${view.standing}`, () => { void past.reload(); }, 50);
const opened = useOmniResource<InquiryReportDto | null>(
    signal => (view.inquiry ? omniGet<InquiryReportDto>('knowledge/inquiries/get', { id: view.inquiry }, signal) : Promise.resolve(null)), { immediate: false });
watch(() => view.inquiry, id => { opened.data.value = null; if (id) void opened.refresh(); }, { immediate: true });

async function feedback(inquiryId: string, value: 'correct' | 'incorrect') {
    const result = await run('feedback', () => omniPost<{ inquiryId: string; recorded: boolean }>('knowledge/inquiries/feedback', { inquiryId, feedback: value }),
        () => 'Thanks: the confidence numbers learn from this.');
    if (!result) return;
    if (answer.value?.inquiryId === inquiryId) answerFeedback.value = value;
    void past.reload(true);
}

// ── standing questions ─────────────────────────────────────────────────────
const standing = useOmniResource(signal => omniGet<StandingQuestionDto[]>('knowledge/standing', {}, signal));
async function toggleStanding(q: StandingQuestionDto) {
    const result = await run('standing', () => omniPost<{ questionId: string; enabled: boolean }>('knowledge/standing/enabled', { questionId: q.questionId, enabled: !q.enabled }),
        r => (r.enabled ? 'Watching again.' : 'Stopped watching. Its past answers stay.'));
    if (result) void standing.refresh();
}
const { want, name } = useOmniNames();
watchEffect(() => want([...past.items.value.map(i => i.primarySubjectId), ...(standing.data.value ?? []).flatMap(q => q.personIds), ...draft.people.filter(p => !p.label).map(p => p.id)]));

function showHistory(questionId: string) {
    view.standing = questionId;
    view.state = '';
    view.tab = 'past';
}

function refreshTab() {
    if (view.tab === 'past') void past.reload();
    else if (view.tab === 'standing') void standing.refresh();
    else if (view.run) void onRunChanged();
}
</script>

<style scoped>
.tabs { margin-bottom: var(--ot-gutter); }
.omni-form { display: flex; flex-direction: column; gap: 12px; }
.plan { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--ot-line); display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.plan p { margin: 0; }
.omni-h4 { margin: 0; font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--ot-muted); }
.feedback { margin-bottom: 12px; }
td.actions { white-space: nowrap; text-align: right; }
.who { margin-right: 6px; }
</style>
