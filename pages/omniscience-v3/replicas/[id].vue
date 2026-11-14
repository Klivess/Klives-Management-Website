<template>
    <OmniscienceV3Shell>
        <div class="ot-pagehead">
            <div>
                <p class="omni-muted crumbs"><NuxtLink :to="`${OMNI_BASE}/replicas`">Replicas</NuxtLink> ›</p>
                <h1 data-testid="replica-name">{{ c?.name ?? name(personId) }}</h1>
                <p class="subtitle"><NuxtLink :to="`${OMNI_BASE}/people/${encodeURIComponent(personId)}`">Their page</NuxtLink></p>
            </div>
            <div class="ot-actions">
                <button class="ot-btn ghost" type="button" @click="refresh()">Refresh</button>
                <button class="ot-btn ghost" type="button" :disabled="busy !== null" data-testid="replica-readiness" @click="readiness()">Count again</button>
                <template v-if="canTrain">
                    <button v-if="c?.building" class="ot-btn warn" type="button" :disabled="busy !== null" data-testid="replica-cancel" @click="cancelBuild()">Stop the build</button>
                    <button v-else class="ot-btn primary" type="button" :disabled="busy !== null || !canBuild" :title="canBuild ? undefined : cannotBuildReason" data-testid="replica-train" @click="train()">
                        {{ c?.serving ? 'Build a new version' : 'Build' }}</button>
                </template>
            </div>
        </div>

        <OmniscienceV3ErrorBlock v-if="card.error.value && !c" :error="card.error.value" what="This replica" @retry="card.refresh()" />
        <template v-else-if="c">
            <div class="omni-row chips" data-testid="replica-chips">
                <span class="ot-chip" :class="replicaStatusTone(c.status)">{{ replicaStatusLabel(c.status) }}</span>
                <span v-if="c.stale" class="ot-chip warn">out of date{{ c.newMessagesSinceServing ? `: ${omniCount(c.newMessagesSinceServing)} new messages` : '' }}</span>
                <span v-if="c.readiness" class="ot-chip" :class="readinessTone(c.readiness.tier)">{{ omniHumanise(c.readiness.tier) }}</span>
                <label v-if="canTrain && c.status !== 'blocked'" class="ot-check auto"><input type="checkbox" :checked="c.autoRetrain" :disabled="busy !== null" @change="setAuto(($event.target as HTMLInputElement).checked)" /> Rebuild by itself when out of date</label>
            </div>
            <div v-if="c.status === 'blocked'" class="ot-banner warn" role="status" data-testid="replica-blocked">
                <span class="glyph" aria-hidden="true">🔒</span>
                <div><strong>No replica is allowed for this person.</strong><span class="muted">{{ c.statusDetail ?? 'They are, or may be, under 18, or their analysis is switched off.' }}</span></div>
            </div>
            <div v-else-if="c.status === 'failed'" class="ot-banner" role="alert">
                <span class="glyph" aria-hidden="true">⚠</span><div><strong>The last build failed.</strong><span class="muted">{{ c.statusDetail ?? 'No reason was recorded.' }}</span></div>
            </div>
            <p v-else-if="c.stale && c.staleReason" class="omni-muted">{{ c.staleReason }}</p>

            <div class="ot-grid two">
                <OmniTraderCard title="What there is to learn from">
                    <template v-if="c.readiness">
                        <p>{{ readinessText(c.readiness) }}</p>
                        <dl class="ot-kv">
                            <dt>Replies</dt><dd>{{ omniCount(c.readiness.replies) }} ({{ omniCount(c.readiness.repliesToKlives) }} to you) · {{ omniCount(c.readiness.initiations) }} conversations started</dd>
                            <dt>Messages</dt><dd>{{ omniCount(c.readiness.authoredMessages) }} written, in {{ omniCount(c.readiness.conversations) }} conversations</dd>
                            <dt>Left out</dt><dd>{{ omniCount(c.readiness.deleted) }} deleted · {{ omniCount(c.readiness.minorPeriodExcluded) }} from when they were under 18</dd>
                            <dt>Span</dt><dd><OmniscienceV3Time :ms="c.readiness.firstMs" mode="absolute" /> to <OmniscienceV3Time :ms="c.readiness.lastMs" mode="absolute" /></dd>
                            <dt>Where</dt><dd><span v-for="(n, k) in c.readiness.byContext" :key="k" class="ot-chip sm">{{ omniHumanise(String(k)) }} {{ omniCount(n) }}</span></dd>
                        </dl>
                        <p v-if="c.readiness.truncated" class="omni-muted">Only their most recent messages were counted.</p>
                    </template>
                    <p v-else class="omni-muted">Not counted yet. Use “Count again”.</p>
                </OmniTraderCard>

                <OmniTraderCard :title="c.building ? 'Being built' : 'In use'">
                    <template v-if="c.building">
                        <ol class="stages" data-testid="replica-stages">
                            <li v-for="st in c.building.stages" :key="st.stage" :class="st.state">
                                <span class="ot-chip sm" :class="omniStateTone(st.state)">{{ st.state }}</span>
                                <span>{{ buildStageLabel(st.stage) }}</span>
                                <span v-if="st.total" class="omni-muted">{{ omniCount(st.completed) }} of {{ omniCount(st.total) }}</span>
                                <span v-if="st.error" class="neg">{{ st.error }}</span>
                            </li>
                        </ol>
                        <p class="omni-muted">Version #{{ c.building.number }} · started <OmniscienceV3Time :ms="c.building.createdAtMs" mode="age" />. The version in use stays in use until this one is ready.</p>
                    </template>
                    <template v-else-if="c.serving">
                        <p><strong>Version #{{ c.serving.number }}</strong> · built <OmniscienceV3Time :ms="c.serving.finishedAtMs" mode="age" /> ·
                            <span class="ot-chip sm" :class="fidelityTone(c.serving.metrics?.discriminationAccuracy)">{{ fidelityText(c.serving.metrics) }}</span></p>
                        <p class="omni-muted">A judge is shown one real reply and one written one, and has to pick the real one. 50% means it cannot tell them apart.</p>
                        <dl v-if="c.serving.metrics" class="ot-kv">
                            <dt>Tested on</dt><dd>{{ omniCount(c.serving.metrics.evaluated) }} replies it had not seen{{ c.serving.metrics.failed ? ` (${c.serving.metrics.failed} could not be written)` : '' }}</dd>
                            <dt>Same meaning</dt><dd>{{ omniPercent(c.serving.metrics.embeddingSimilarity) }}</dd>
                            <dt>Length</dt><dd>{{ c.serving.metrics.lengthError == null ? '—' : `off by ${omniPercent(c.serving.metrics.lengthError)}` }}</dd>
                        </dl>
                        <ul v-if="c.serving.degraded.length" class="degraded"><li v-for="(d, i) in c.serving.degraded" :key="i">{{ d }}</li></ul>
                    </template>
                    <p v-else class="omni-muted">No version has been built.</p>
                </OmniTraderCard>
            </div>
        </template>

        <div class="ot-segment tabs" role="tablist" aria-label="Replica">
            <button v-for="t in TABS" :key="t.value" type="button" role="tab" :aria-selected="view.tab === t.value" :aria-pressed="view.tab === t.value"
                    :data-testid="`replica-tab-${t.value}`" @click="view.tab = t.value">{{ t.label }}</button>
        </div>

        <!-- ── chat ─────────────────────────────────────────────────────────── -->
        <template v-if="view.tab === 'chat'">
            <div class="ot-grid sidebar">
                <div>
                    <OmniscienceV3Panel title="Chats" flush :loading="chats.loading.value" :error="chats.error.value" :has-data="chats.items.value.length > 0" :empty="!chats.items.value.length"
                                        empty-title="No chats yet" @retry="chats.reload()">
                        <ul class="chats" data-testid="replica-chats">
                            <li v-for="ch in chats.items.value" :key="ch.chatId" :class="{ selected: view.chat === ch.chatId }">
                                <button type="button" @click="view.chat = ch.chatId">{{ ch.title ?? 'Untitled chat' }}</button>
                                <span class="omni-muted"><template v-if="ch.asOfMs">as of <OmniscienceV3Time :ms="ch.asOfMs" mode="absolute" /> · </template><OmniscienceV3Time :ms="ch.updatedAtMs" mode="age" /></span>
                            </li>
                        </ul>
                    </OmniscienceV3Panel>
                    <OmniTraderCard v-if="canChat" title="New chat">
                        <form class="omni-form" data-testid="chat-form" @submit.prevent="createChat()">
                            <div class="ot-field"><label for="c-title">Title (optional)</label><input id="c-title" v-model="newChat.title" class="ot-input" maxlength="120" /></div>
                            <div class="ot-field"><label for="c-ctx">Setting</label>
                                <select id="c-ctx" v-model="newChat.contextKind" class="ot-select"><option v-for="x in CHAT_CONTEXTS" :key="x.value" :value="x.value">{{ x.label }}</option></select></div>
                            <div class="ot-field"><label for="c-asof">As they were on (optional)</label><input id="c-asof" v-model="newChat.asOf" class="ot-input" type="datetime-local" />
                                <span class="help">Answers from what they had written by then. In {{ zoneLabel }}.</span></div>
                            <button class="ot-btn primary" type="submit" :disabled="busy !== null || c?.status !== 'ready'" :title="c?.status === 'ready' ? undefined : 'There is no ready replica to talk to'">Start</button>
                        </form>
                    </OmniTraderCard>
                </div>
                <OmniTraderCard v-if="selectedChat" :title="selectedChat.title ?? 'Chat'" :subtitle="contextLabel(selectedChat.contextKind)">
                    <template #controls>
                        <template v-if="canChat">
                            <button class="ot-btn ghost sm" type="button" :disabled="busy !== null" @click="renameChat(selectedChat)">Rename</button>
                            <button class="ot-btn ghost sm" type="button" :disabled="busy !== null" @click="archiveChat(selectedChat)">{{ selectedChat.archived ? 'Unarchive' : 'Archive' }}</button>
                            <button class="ot-btn ghost sm" type="button" :disabled="busy !== null" @click="deleteChat(selectedChat)">Delete</button>
                        </template>
                    </template>
                    <OmniscienceV3ReplicaChat :chat="selectedChat" :can-chat="canChat" @changed="chats.reload(true)" />
                </OmniTraderCard>
                <OmniTraderCard v-else title="Chat" empty empty-title="Choose a chat" empty-text="Or start one. You can also ask how they would have answered at an earlier time." />
            </div>
        </template>

        <!-- ── versions ─────────────────────────────────────────────────────── -->
        <template v-else-if="view.tab === 'versions'">
            <div class="ot-grid sidebar">
                <OmniscienceV3Panel title="Versions" flush :loading="versions.loading.value" :error="versions.error.value" :has-data="!!versions.data.value"
                                    :empty="!!versions.data.value && !versions.data.value.versions.length" empty-title="Nothing built yet" @retry="versions.refresh()">
                    <table v-if="versions.data.value" class="ot-table compact" data-testid="replica-versions">
                        <thead><tr><th>#</th><th>State</th><th>Why</th><th>How close</th><th class="num">Built</th></tr></thead>
                        <tbody>
                            <tr v-for="v in versions.data.value.versions" :key="v.versionId" class="clickable" :class="{ selected: view.version === v.versionId }" @click="view.version = v.versionId">
                                <td>#{{ v.number }}</td>
                                <td><span class="ot-chip sm" :class="omniStateTone(v.state)">{{ v.state }}</span></td>
                                <td class="omni-muted">{{ v.reason }}</td>
                                <td>{{ fidelityText(v.metrics) }}</td>
                                <td class="num"><OmniscienceV3Time :ms="v.finishedAtMs ?? v.createdAtMs" mode="age" /></td>
                            </tr>
                        </tbody>
                    </table>
                </OmniscienceV3Panel>
                <OmniscienceV3Panel :title="version.data.value ? `Version #${version.data.value.summary.number}` : 'Version'" :loading="!!view.version && version.loading.value" :error="version.error.value"
                                    :has-data="!!version.data.value" :empty="!view.version" empty-title="Choose a version" what="This version" @retry="version.refresh()">
                    <template v-if="version.data.value">
                        <dl class="ot-kv">
                            <dt>Asked for by</dt><dd>{{ version.data.value.requestedBy }}</dd>
                            <dt>Learned from</dt><dd><OmniscienceV3Time :ms="version.data.value.summary.dataFromMs" mode="absolute" /> to <OmniscienceV3Time :ms="version.data.value.summary.dataToMs" mode="absolute" /></dd>
                            <dt v-if="vc">Replies</dt><dd v-if="vc">{{ omniCount(vc.replies) }} · {{ omniCount(vc.train) }} to learn from, {{ omniCount(vc.holdoutTest) }} kept back to test on</dd>
                            <dt v-if="version.data.value.config">Settings</dt>
                            <dd v-if="version.data.value.config">temperature {{ version.data.value.config.temperature }} · {{ version.data.value.config.candidates }} candidates · {{ version.data.value.config.retrieved }} examples shown</dd>
                            <dt v-if="version.data.value.summary.error">Error</dt><dd v-if="version.data.value.summary.error" class="neg">{{ version.data.value.summary.error }}</dd>
                        </dl>
                        <section v-if="version.data.value.style" class="omni-section">
                            <h4>How they write</h4>
                            <dl class="ot-kv">
                                <dt>Length</dt><dd>usually {{ version.data.value.style.charsP50 }} characters, rarely over {{ version.data.value.style.charsP90 }}</dd>
                                <dt>Favourite emoji</dt><dd>{{ version.data.value.style.topEmoji.join(' ') || '—' }}</dd>
                                <dt>Laughs with</dt><dd>{{ version.data.value.style.laughter.join(', ') || '—' }}</dd>
                                <dt>Their words</dt><dd>{{ version.data.value.style.distinctive.slice(0, 20).join(', ') || '—' }}</dd>
                                <dt>Most active</dt><dd>{{ version.data.value.style.peakLocalHours.map(h => `${h}:00`).join(', ') || '—' }}</dd>
                            </dl>
                        </section>
                        <section v-if="version.data.value.eras.length" class="omni-section">
                            <h4>Periods</h4>
                            <table class="ot-table compact">
                                <thead><tr><th>From</th><th>To</th><th class="num">Replies</th></tr></thead>
                                <tbody><tr v-for="e in version.data.value.eras" :key="e.index"><td><OmniscienceV3Time :ms="e.fromMs" mode="absolute" /></td><td><OmniscienceV3Time :ms="e.toMs" mode="absolute" /></td><td class="num">{{ omniCount(e.pairs) }}</td></tr></tbody>
                            </table>
                        </section>
                        <section v-if="version.data.value.summary.metrics?.tuning.length" class="omni-section">
                            <h4>Settings that were tried</h4>
                            <table class="ot-table compact">
                                <thead><tr><th>Temperature</th><th class="num">Examples</th><th class="num">Told apart</th><th class="num">Same meaning</th><th></th></tr></thead>
                                <tbody>
                                    <tr v-for="t in version.data.value.summary.metrics.tuning" :key="t.configKey"><td>{{ t.temperature }}</td><td class="num">{{ t.retrieved }}</td>
                                        <td class="num">{{ omniPercent(t.discriminationAccuracy) }}</td><td class="num">{{ omniPercent(t.embeddingSimilarity) }}</td>
                                        <td><span v-if="t.chosen" class="ot-chip sm ok">chosen</span></td></tr>
                                </tbody>
                            </table>
                        </section>
                    </template>
                </OmniscienceV3Panel>
            </div>
        </template>

        <!-- ── evaluation ───────────────────────────────────────────────────── -->
        <template v-else-if="view.tab === 'eval'">
            <div class="ot-filterbar">
                <select v-model="view.version" class="ot-select auto" aria-label="Version">
                    <option value="">Choose a version</option>
                    <option v-for="v in versions.data.value?.versions ?? []" :key="v.versionId" :value="v.versionId">#{{ v.number }} · {{ v.state }}</option>
                </select>
                <div class="ot-segment" role="group" aria-label="Which replies">
                    <button v-for="sp in SPLITS" :key="sp.value" type="button" :aria-pressed="view.split === sp.value" @click="view.split = sp.value">{{ sp.label }}</button>
                </div>
                <span class="summary"><b>{{ evals.items.value.length }}</b> shown</span>
            </div>
            <OmniscienceV3Panel title="What it wrote, beside what they really said" flush :loading="!!view.version && evals.loading.value" :error="evals.error.value" :has-data="evals.items.value.length > 0"
                                :empty="!evals.items.value.length" :empty-title="view.version ? 'No test replies for this version' : 'Choose a version'" @retry="evals.reload()">
                <p v-if="!textsIncluded && evals.items.value.length" class="omni-muted pad">The messages themselves are hidden: reading them needs the “Read raw messages” permission.</p>
                <table class="ot-table compact" data-testid="replica-evals">
                    <thead><tr><th>They were told</th><th>They really said</th><th>The replica wrote</th><th>Judge</th><th class="num">Same meaning</th></tr></thead>
                    <tbody>
                        <tr v-for="e in evals.items.value" :key="e.pairId + e.configKey">
                            <td class="omni-wrap">{{ e.stimulus ?? '—' }}</td><td class="omni-wrap">{{ e.realReply ?? '—' }}</td><td class="omni-wrap">{{ e.generatedReply ?? '—' }}</td>
                            <td><span v-if="e.judgeCorrect != null" class="ot-chip sm" :class="e.judgeCorrect ? 'warn' : 'ok'">{{ e.judgeCorrect ? 'told them apart' : 'fooled' }}</span>
                                <span v-else class="omni-muted">{{ omniHumanise(e.outcome) }}</span></td>
                            <td class="num">{{ omniPercent(e.embeddingSimilarity) }}</td>
                        </tr>
                    </tbody>
                </table>
                <template v-if="evals.hasMore.value" #footer>
                    <button class="ot-btn sm" type="button" :disabled="evals.loadingMore.value" @click="evals.loadMore()">{{ evals.loadingMore.value ? 'Loading…' : 'Load more' }}</button>
                </template>
            </OmniscienceV3Panel>
        </template>

        <!-- ── blind test ───────────────────────────────────────────────────── -->
        <template v-else>
            <div class="ot-grid two">
                <OmniTraderCard title="Can you tell them apart?">
                    <template v-if="blind">
                        <p class="omni-muted" data-testid="blind-progress">{{ blind.answered }} of {{ blind.items.length }} answered · {{ blind.correct }} right · started <OmniscienceV3Time :ms="blind.createdAtMs" mode="absolute" /></p>
                        <div v-if="blindItem && canChat" class="blind" data-testid="blind-item">
                            <p class="stimulus"><span class="omni-muted">They were told:</span> {{ blindItem.stimulus }}</p>
                            <p class="omni-muted">One of these is what they really said. Which?</p>
                            <button class="ot-btn option" type="button" :disabled="busy !== null" data-testid="blind-a" @click="answer('A')"><b>A</b> {{ blindItem.optionA }}</button>
                            <button class="ot-btn option" type="button" :disabled="busy !== null" data-testid="blind-b" @click="answer('B')"><b>B</b> {{ blindItem.optionB }}</button>
                        </div>
                        <p v-else-if="blindItem" class="omni-muted">{{ blind.items.length - blind.answered }} not answered yet.</p>
                        <p v-else data-testid="blind-done"><strong>Done.</strong> You picked the real one {{ blind.correct }} time{{ blind.correct === 1 ? '' : 's' }} out of {{ blind.answered }}{{ blind.accuracy != null ? ` (${omniPercent(blind.accuracy)})` : '' }}.
                            Half would mean you cannot tell.</p>
                        <p v-if="lastAnswer" class="omni-muted" data-testid="blind-last">Last one: you chose {{ lastAnswer.choice }}, the real one was {{ lastAnswer.real }}. {{ lastAnswer.correct ? 'Right.' : 'The replica fooled you.' }}</p>
                        <!-- Which was which is only ever shown for a pair that has been answered. -->
                        <ol v-if="blindAnswered.length && (!blindItem || !canChat)" class="review" data-testid="blind-review">
                            <li v-for="i in blindAnswered" :key="i.index">
                                <p class="stimulus"><span class="omni-muted">They were told:</span> {{ i.stimulus }}</p>
                                <p v-for="o in OPTIONS" :key="o" class="reply">
                                    <b>{{ o }}</b> <span class="text">{{ o === 'A' ? i.optionA : i.optionB }}</span>
                                    <span class="ot-chip sm" :class="realOf(i) === o ? 'ok' : ''">{{ realOf(i) === o ? 'really them' : 'the replica' }}</span>
                                    <span v-if="i.answered === o" class="ot-chip sm" :class="i.correct ? 'ok' : 'warn'">your pick</span>
                                </p>
                            </li>
                        </ol>
                        <div class="omni-row">
                            <button class="ot-btn sm" type="button" data-testid="blind-leave" @click="leaveBlind()">{{ blindItem ? (canChat ? 'Leave it for now' : 'Back') : (canChat ? 'Take another' : 'Back') }}</button>
                            <span v-if="blindItem && canChat" class="omni-muted">Your answers so far are kept; it can be carried on from your results.</span>
                        </div>
                    </template>
                    <template v-else>
                        <p>You are shown what they were told and two replies: the one they really wrote and one the replica wrote. Pick the real one.</p>
                        <div class="omni-row">
                            <label class="count">How many <input v-model.number="blindCount" class="ot-input" type="number" min="1" max="40" /></label>
                            <button class="ot-btn primary" type="button" :disabled="!canChat || busy !== null || c?.status !== 'ready'" data-testid="blind-start" @click="startBlind()">Start</button>
                        </div>
                    </template>
                </OmniTraderCard>
                <OmniscienceV3Panel title="Your results" :loading="results.loading.value" :error="results.error.value" :has-data="!!results.data.value"
                                    :empty="!!results.data.value && !results.data.value.sessions" empty-title="No tests taken yet" @retry="results.refresh()">
                    <template v-if="results.data.value">
                        <p><strong>{{ omniPercent(results.data.value.accuracy) }}</strong> right over {{ omniCount(results.data.value.answered) }} answers in {{ results.data.value.sessions }} test{{ results.data.value.sessions === 1 ? '' : 's' }}.</p>
                        <ul class="plain tests" data-testid="blind-results">
                            <li v-for="r in results.data.value.recent" :key="r.sessionId" :class="{ selected: view.blind === r.sessionId }">
                                <span><OmniscienceV3Time :ms="r.createdAtMs" mode="absolute" /> · {{ r.correct }} of {{ r.answered }} right</span>
                                <span v-if="r.answered < r.items.length" class="ot-chip sm info">{{ r.items.length - r.answered }} left</span>
                                <button class="ot-btn ghost sm" type="button" :disabled="view.blind === r.sessionId" @click="view.blind = r.sessionId">{{ r.answered < r.items.length && canChat ? 'Carry on' : 'Look at it' }}</button>
                            </li>
                        </ul>
                    </template>
                </OmniscienceV3Panel>
            </div>
        </template>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { OMNI_BASE, omniGet, omniPost, toOmniError } from '~/scripts/omniscience/api';
import type {
    ReplicaActionResultDto, ReplicaBlindAnswerDto, ReplicaBlindItemDto, ReplicaBlindResultsDto, ReplicaBlindSessionDto, ReplicaChatDto, ReplicaChatPageDto, ReplicaEvalItemDto, ReplicaEvalPageDto,
    ReplicaJobStartedDto, ReplicaPersonDto, ReplicaTrainResultDto, ReplicaVersionDto, ReplicaVersionListDto,
} from '~/scripts/omniscience/contracts';
import { omniCount, omniPercent, omniStateTone, omniZonedToMs } from '~/scripts/omniscience/format';
import { omniHumanise } from '~/scripts/omniscience/findings';
import { CHAT_CONTEXTS, buildStageLabel, fidelityText, fidelityTone, readinessText, readinessTone, replicaStatusLabel, replicaStatusTone } from '~/scripts/omniscience/replica';
import { useOmniAction, useOmniDebounced, useOmniNames, useOmniPaged, useOmniResource, useOmniTime } from '~/composables/useOmniscienceV3';
import { useUrlState } from '~/composables/useOmniTrader';
import { useAccess } from '~/composables/useAccess';

definePageMeta({ layout: 'navbar' });

type Tab = 'chat' | 'versions' | 'eval' | 'blind';
const TABS: { value: Tab; label: string }[] = [{ value: 'chat', label: 'Chat' }, { value: 'versions', label: 'Versions' }, { value: 'eval', label: 'Test replies' }, { value: 'blind', label: 'Blind test' }];
const SPLITS = [{ value: '', label: 'All' }, { value: 'holdout_test', label: 'Kept back to test' }, { value: 'holdout_tune', label: 'Used to choose settings' }, { value: 'shadow', label: 'Since it was built' }];

const route = useRoute();
const { can } = useAccess();
const canChat = computed(() => can('omniscience.replica.chat'));
const canTrain = computed(() => can('omniscience.replica.train'));
const { busy, run } = useOmniAction();
const { zone, lens } = useOmniTime();
const zoneLabel = computed(() => (lens.value === 'Utc' ? 'UTC' : zone.value));
const { want, name } = useOmniNames();
const personId = computed(() => String(route.params.id ?? ''));
watch(personId, id => want([id]), { immediate: true });
const { state: view } = useUrlState({ tab: 'chat' as Tab, chat: '', version: '', split: '', blind: '' });

// A card that has not been computed yet is an empty state with the way to compute it, not a failure.
const card = useOmniResource(signal => omniGet<ReplicaPersonDto>('replica/person', { id: personId.value }, signal), { pollMs: 15_000 });
const c = computed(() => card.data.value);
useHead({ title: computed(() => `Omniscience v3 · Replica of ${c.value?.name ?? 'someone'}`) });

const canBuild = computed(() => !!c.value && c.value.status !== 'blocked' && (c.value.readiness?.tier === 'Ready' || c.value.readiness?.tier === 'Experimental'));
const cannotBuildReason = computed(() => (!c.value ? 'Count what they have written first' : c.value.status === 'blocked' ? 'No replica is allowed for this person'
    : c.value.readiness ? 'There is not enough of their writing to build from' : 'Count what they have written first'));

async function readiness() {
    const result = await run('readiness', () => omniPost<ReplicaJobStartedDto>('replica/readiness', { personId: personId.value }), () => 'Counting what they have written. This page updates when it is done.');
    if (result) setTimeout(() => { void card.refresh(); }, 1500);
}
async function train() {
    const result = await run('train', () => omniPost<ReplicaTrainResultDto>('replica/train', { personId: personId.value, reason: 'requested' }),
        r => (r.alreadyRunning ? `Version #${r.number} is already being built.` : `Building version #${r.number}. It takes a while; the version in use stays in use until then.`));
    if (result) { void card.refresh(); void versions.refresh(); }
}
async function cancelBuild() {
    const result = await run('cancel', () => omniPost<ReplicaActionResultDto>('replica/train/cancel', { personId: personId.value }), r => r.detail ?? 'Stopped.');
    if (result) void card.refresh();
}
async function setAuto(enabled: boolean) {
    const result = await run('auto', () => omniPost<ReplicaActionResultDto>('replica/autoretrain', { personId: personId.value, enabled }), r => r.detail ?? 'Saved.');
    void card.refresh();
    return result;
}

// ── chats ──────────────────────────────────────────────────────────────────
const chats = useOmniPaged<ReplicaChatDto, string>((cursor, signal) => omniGet<ReplicaChatPageDto>('replica/chats', { personId: personId.value, kind: 'chat', cursor, limit: 50 }, signal));
const selectedChat = computed(() => chats.items.value.find(ch => ch.chatId === view.chat) ?? null);
const newChat = reactive({ title: '', contextKind: 'auto', asOf: '' });
function contextLabel(kind: string): string { return CHAT_CONTEXTS.find(x => x.value === kind)?.label ?? omniHumanise(kind); }

async function createChat() {
    const chat = await run('chat-create', () => omniPost<ReplicaChatDto>('replica/chats/create', {
        personId: personId.value, title: newChat.title.trim() || null, contextKind: newChat.contextKind, asOfMs: newChat.asOf ? omniZonedToMs(newChat.asOf, zone.value) : null, addresseePersonId: null,
    }));
    if (!chat) return;
    Object.assign(newChat, { title: '', contextKind: 'auto', asOf: '' });
    await chats.reload(true);
    view.chat = chat.chatId;
}
async function renameChat(chat: ReplicaChatDto) {
    const title = window.prompt('Name this chat', chat.title ?? '');
    if (title === null) return;
    const result = await run('chat-update', () => omniPost<ReplicaChatDto>('replica/chats/update', { chatId: chat.chatId, title: title.trim(), archived: null }));
    if (result) void chats.reload(true);
}
async function archiveChat(chat: ReplicaChatDto) {
    const result = await run('chat-update', () => omniPost<ReplicaChatDto>('replica/chats/update', { chatId: chat.chatId, title: null, archived: !chat.archived }));
    if (result) void chats.reload(true);
}
async function deleteChat(chat: ReplicaChatDto) {
    if (!window.confirm('Delete this chat and everything written in it?')) return;
    const result = await run('chat-delete', () => omniPost<ReplicaActionResultDto>('replica/chats/delete', { chatId: chat.chatId }), r => r.detail ?? 'Deleted.');
    if (!result) return;
    view.chat = '';
    void chats.reload(true);
}

// ── versions and their test replies ────────────────────────────────────────
const versions = useOmniResource(signal => omniGet<ReplicaVersionListDto>('replica/versions', { personId: personId.value }, signal));
const version = useOmniResource<ReplicaVersionDto | null>(
    signal => (view.version ? omniGet<ReplicaVersionDto>('replica/version', { id: view.version }, signal) : Promise.resolve(null)), { immediate: false });
watch(() => view.version, id => { version.data.value = null; if (id) void version.refresh(); }, { immediate: true });
const vc = computed(() => version.data.value?.summary.counts ?? null);

const textsIncluded = ref(true);
const evals = useOmniPaged<ReplicaEvalItemDto, string>(async (cursor, signal) => {
    if (!view.version) return { items: [], nextCursor: null };
    const page = await omniGet<ReplicaEvalPageDto>('replica/evals', { versionId: view.version, split: view.split, cursor, limit: 50 }, signal);
    textsIncluded.value = page.textsIncluded;
    return page;
});
useOmniDebounced(() => `${view.version}|${view.split}`, () => { void evals.reload(); }, 50);

// ── blind test ─────────────────────────────────────────────────────────────
const OPTIONS = ['A', 'B'] as const;
const results = useOmniResource(signal => omniGet<ReplicaBlindResultsDto>('replica/blind/results', { personId: personId.value }, signal));
/**
 * The test on screen is named in the link (`view.blind`), so a reload or a link carries on where it was.
 * `blindRead` is that test as last read or answered here; until it arrives, the copy in the results list stands in.
 */
const blindRead = shallowRef<ReplicaBlindSessionDto | null>(null);
const blind = computed(() => (!view.blind ? null
    : blindRead.value?.sessionId === view.blind ? blindRead.value
    : results.data.value?.recent.find(s => s.sessionId === view.blind) ?? null));
const blindCount = ref(10);
const lastAnswer = shallowRef<ReplicaBlindAnswerDto | null>(null);
const blindItem = computed(() => blind.value?.items.find(i => !i.answered) ?? null);
const blindAnswered = computed(() => blind.value?.items.filter(i => !!i.answered) ?? []);
/** Which reply was really theirs, known once a pair is answered: the pick when it was right, the other one when not. */
function realOf(item: ReplicaBlindItemDto): 'A' | 'B' { return (item.answered === 'A') === (item.correct === true) ? 'A' : 'B'; }

// A test named in the link is read by id: it may be older than the few the results list carries. Reading one needs
// the chat permission; without it the results list's own copy is what is shown.
watch(() => [view.blind, canChat.value] as const, async ([id, allowed]) => {
    if (!id) { lastAnswer.value = null; return; }
    if (!allowed || blindRead.value?.sessionId === id) return;
    lastAnswer.value = null;
    try {
        const session = await omniGet<ReplicaBlindSessionDto>('replica/blind/session', { id });
        // Not when the reader moved on meanwhile, or answered a pair before this arrived.
        if (view.blind === id && blindRead.value?.sessionId !== id) blindRead.value = session;
    } catch (caught) {
        // A test that no longer exists: back to the start, where another can be taken.
        if (view.blind === id && toOmniError(caught).kind === 'not_found') view.blind = '';
    }
}, { immediate: true });

async function startBlind() {
    const session = await run('blind-start', () => omniPost<ReplicaBlindSessionDto>('replica/blind/start', { personId: personId.value, count: Math.min(40, Math.max(1, Math.round(blindCount.value || 10))) }));
    if (!session) return;
    blindRead.value = session;
    lastAnswer.value = null;
    view.blind = session.sessionId;
    void results.refresh();
}
async function answer(choice: 'A' | 'B') {
    const session = blind.value, item = blindItem.value;
    if (!session || !item) return;
    const result = await run('blind-answer', () => omniPost<ReplicaBlindAnswerDto>('replica/blind/answer', { sessionId: session.sessionId, index: item.index, choice }));
    if (!result) return;
    lastAnswer.value = result;
    blindRead.value = {
        ...session, answered: result.answered, correct: result.correctTotal, accuracy: result.answered ? result.correctTotal / result.answered : null,
        items: session.items.map(i => (i.index === item.index ? { ...i, answered: choice, correct: result.correct } : i)),
    };
    if (!blindItem.value) void results.refresh();
}
/** Back to the start. An unfinished test keeps its answers and is listed under the results, where it can be carried on. */
function leaveBlind() {
    view.blind = '';
    blindRead.value = null;
    void results.refresh();
}

function refresh() { void card.refresh(); void chats.reload(); void versions.refresh(); void results.refresh(); if (view.version) { void version.refresh(); void evals.reload(); } }
</script>

<style scoped>
.crumbs { margin: 0 0 2px; font-size: 12px; }
.chips { gap: 8px; flex-wrap: wrap; margin: 0 0 10px; }
.ot-check.auto { margin-left: auto; font-size: 12.5px; }
.ot-grid.two { margin-top: var(--ot-gutter); }
.tabs { margin: var(--ot-gutter) 0; }
.stages { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.stages li { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.degraded { margin: 8px 0 0; padding-left: 18px; font-size: 12.5px; color: var(--ot-warning); }
.chats, .plain { list-style: none; margin: 0; padding: 0; }
.chats li { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--ot-line); font-size: 13px; }
.chats li.selected { background: var(--ot-accent-soft); }
.chats button { background: none; border: 0; color: inherit; font: inherit; cursor: pointer; text-align: left; padding: 0; }
.chats button:hover { text-decoration: underline; }
.plain li { padding: 4px 0; font-size: 13px; }
.omni-form { display: flex; flex-direction: column; gap: 12px; }
.blind { display: flex; flex-direction: column; gap: 8px; }
.blind .option { text-align: left; white-space: pre-wrap; height: auto; padding: 10px 12px; justify-content: flex-start; gap: 8px; }
.stimulus { font-size: 14px; white-space: pre-wrap; }
.review { margin: 8px 0; padding-left: 20px; display: flex; flex-direction: column; gap: 12px; font-size: 13px; }
.review .reply { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; margin: 0 0 4px; }
.review .reply .text { white-space: pre-wrap; }
.tests li { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tests li.selected { font-weight: 600; }
.count { display: flex; align-items: center; gap: 6px; font-size: 12.5px; }
.count input { width: 70px; }
.pad { padding: 8px 12px; }
.ot-banner .muted { display: block; color: var(--ot-text-2); }
p { margin: 0 0 8px; }
</style>
