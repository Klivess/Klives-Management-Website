<template>
    <OmniscienceV3Shell>
        <div class="ot-pagehead">
            <div>
                <h1>Replicas</h1>
                <p class="subtitle">A replica answers in someone's style, learned from their past messages, so you can rehearse a conversation before you have it. It is never built for someone under 18 or for someone whose analysis is switched off, and nothing it writes is ever sent to anyone.</p>
            </div>
            <div class="ot-actions"><button class="ot-btn ghost" type="button" @click="refresh()">Refresh</button></div>
        </div>

        <div class="ot-kpis tight" data-testid="replica-kpis">
            <OmniTraderKpi label="Replicas" :value="omniCount(s?.replicas)" small />
            <OmniTraderKpi label="Ready" :value="omniCount(s?.ready)" small />
            <OmniTraderKpi label="Being built" :value="omniCount(s?.building)" small />
            <OmniTraderKpi label="Out of date" :value="omniCount(s?.stale)" small :tone="s?.stale ? 'warn' : undefined" help="New messages have arrived since the version in use was built" />
            <OmniTraderKpi label="Failed" :value="omniCount(s?.failed)" small :tone="s?.failed ? 'bad' : undefined" />
            <OmniTraderKpi label="Not allowed" :value="omniCount(s?.blocked)" small help="Under 18 or may be, or analysis switched off" />
        </div>
        <div v-if="s && !s.encoderAvailable" class="ot-banner warn" role="status">
            <span class="glyph" aria-hidden="true">⚠</span>
            <div><strong>The text encoder is not loaded.</strong><span class="muted">Replicas cannot be built or asked anything until it is. Model: {{ s.encoderModel ?? 'none configured' }}.</span></div>
        </div>
        <OmniscienceV3ErrorBlock v-if="status.error.value && !s" :error="status.error.value" what="Replica status" compact @retry="status.refresh()" />

        <div class="ot-segment tabs" role="tablist" aria-label="Replicas">
            <button v-for="t in TABS" :key="t.value" type="button" role="tab" :aria-selected="view.tab === t.value" :aria-pressed="view.tab === t.value"
                    :data-testid="`replicas-tab-${t.value}`" @click="view.tab = t.value">{{ t.label }}</button>
        </div>

        <!-- ── people ───────────────────────────────────────────────────────── -->
        <template v-if="view.tab === 'people'">
            <div class="ot-filterbar">
                <div class="ot-segment" role="group" aria-label="Status">
                    <button v-for="f in STATUSES" :key="f.value" type="button" :aria-pressed="view.status === f.value" @click="view.status = f.value">{{ f.label }}</button>
                </div>
                <span class="summary"><b>{{ people.items.value.length }}</b> shown</span>
            </div>
            <div class="ot-grid sidebar">
                <OmniscienceV3Panel title="People" flush :loading="people.loading.value" :error="people.error.value" :has-data="people.items.value.length > 0" :empty="!people.items.value.length"
                                    :empty-kind="view.status ? 'filtered' : 'empty'" empty-title="No replicas yet"
                                    empty-text="Check whether someone has written enough to build one from, then start the build from their replica page." @retry="people.reload()">
                    <table class="ot-table" data-testid="replica-people">
                        <thead><tr><th>Person</th><th>Replica</th><th>To build from</th><th>How close</th><th class="num">Version</th><th class="num">Updated</th></tr></thead>
                        <tbody>
                            <tr v-for="p in people.items.value" :key="p.personId" class="clickable" @click="open(p.personId)">
                                <td><strong>{{ p.name }}</strong></td>
                                <td><span class="ot-chip" :class="replicaStatusTone(p.status)" :title="p.statusDetail ?? undefined">{{ replicaStatusLabel(p.status) }}</span>
                                    <span v-if="p.stale" class="ot-chip sm warn" :title="p.staleReason ?? undefined">out of date</span>
                                    <span v-if="p.autoRetrain" class="ot-chip sm" title="Rebuilt by itself when it goes out of date">auto</span></td>
                                <td><template v-if="p.readiness"><span class="ot-chip sm" :class="readinessTone(p.readiness.tier)">{{ omniHumanise(p.readiness.tier) }}</span>
                                    <span class="omni-muted"> {{ omniCount(p.readiness.effective) }} replies</span></template><span v-else class="omni-muted">—</span></td>
                                <td><span v-if="p.serving?.metrics" class="ot-chip sm" :class="fidelityTone(p.serving.metrics.discriminationAccuracy)">{{ fidelityText(p.serving.metrics) }}</span>
                                    <span v-else class="omni-muted">—</span></td>
                                <td class="num">{{ p.serving ? `#${p.serving.number}` : '—' }}</td>
                                <td class="num"><OmniscienceV3Time :ms="p.updatedAtMs" mode="age" /></td>
                            </tr>
                        </tbody>
                    </table>
                    <template v-if="people.hasMore.value" #footer>
                        <button class="ot-btn sm" type="button" :disabled="people.loadingMore.value" @click="people.loadMore()">{{ people.loadingMore.value ? 'Loading…' : 'Load more' }}</button>
                    </template>
                </OmniscienceV3Panel>

                <OmniTraderCard title="Could someone have a replica?">
                    <form class="omni-form" data-testid="readiness-form" @submit.prevent="check()">
                        <div class="ot-field"><label for="r-who">Person</label><OmniscienceV3PersonPick v-model="who" input-id="r-who" :max="1" testid="readiness-who" /></div>
                        <div class="omni-row">
                            <button class="ot-btn primary" type="submit" :disabled="busy !== null || !who.length">Check</button>
                            <button class="ot-btn ghost" type="button" :disabled="!who.length" @click="who[0] && open(who[0].id)">Open their replica page</button>
                        </div>
                        <span class="help">It counts how many of their replies can be learned from. Messages from when they were under 18 are never counted.</span>
                    </form>
                </OmniTraderCard>
            </div>
        </template>

        <!-- ── group simulations ────────────────────────────────────────────── -->
        <template v-else>
            <div class="ot-grid sidebar">
                <div>
                    <OmniscienceV3Panel title="Group simulations" flush :loading="groups.loading.value" :error="groups.error.value" :has-data="groups.items.value.length > 0" :empty="!groups.items.value.length"
                                        empty-title="No simulations yet" empty-text="Pick two or more people with a ready replica and a topic, and watch how the conversation might go." @retry="groups.reload()">
                        <ul class="chats" data-testid="group-chats">
                            <li v-for="c in groups.items.value" :key="c.chatId" :class="{ selected: view.chat === c.chatId }">
                                <button type="button" @click="view.chat = c.chatId">{{ c.title ?? c.topic ?? 'Untitled' }}</button>
                                <span class="omni-muted">{{ c.members.length }} people · <OmniscienceV3Time :ms="c.updatedAtMs" mode="age" /></span>
                            </li>
                        </ul>
                    </OmniscienceV3Panel>
                    <OmniTraderCard v-if="canChat" title="New simulation">
                        <form class="omni-form" data-testid="group-form" @submit.prevent="createGroup()">
                            <div class="ot-field"><label for="g-who">People (2 to 6)</label><OmniscienceV3PersonPick v-model="members" input-id="g-who" :max="6" testid="group-members" /></div>
                            <div class="ot-field"><label for="g-topic">What they talk about</label>
                                <input id="g-topic" v-model="topic" class="ot-input" maxlength="300" required placeholder="e.g. where to go for the weekend" /></div>
                            <button class="ot-btn primary" type="submit" :disabled="busy !== null || members.length < 2 || !topic.trim()">Create</button>
                        </form>
                    </OmniTraderCard>
                </div>
                <OmniTraderCard v-if="selectedGroup" :title="selectedGroup.title ?? selectedGroup.topic ?? 'Simulation'" :subtitle="memberNames(selectedGroup)">
                    <template #controls>
                        <button v-if="canChat" class="ot-btn ghost sm" type="button" :disabled="busy !== null" @click="removeChat(selectedGroup)">Delete</button>
                    </template>
                    <OmniscienceV3ReplicaChat :chat="selectedGroup" :can-chat="canChat" @changed="groups.reload(true)" />
                </OmniTraderCard>
                <OmniTraderCard v-else title="Simulation" empty empty-title="Choose a simulation" empty-text="Or create one. Each turn is one of them speaking, written from how they usually talk in a group." />
            </div>
        </template>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { useRouter } from 'vue-router';
import { OMNI_BASE, omniGet, omniPost } from '~/scripts/omniscience/api';
import type { ReplicaActionResultDto, ReplicaChatDto, ReplicaChatPageDto, ReplicaJobStartedDto, ReplicaModuleStatusDto, ReplicaPersonDto, ReplicaPersonPageDto } from '~/scripts/omniscience/contracts';
import { omniCount } from '~/scripts/omniscience/format';
import { omniHumanise } from '~/scripts/omniscience/findings';
import { fidelityText, fidelityTone, readinessTone, replicaStatusLabel, replicaStatusTone } from '~/scripts/omniscience/replica';
import { useOmniAction, useOmniDebounced, useOmniNames, useOmniPaged, useOmniResource } from '~/composables/useOmniscienceV3';
import { useUrlState } from '~/composables/useOmniTrader';
import { useAccess } from '~/composables/useAccess';
import type { PickedPerson } from '~/components/OmniscienceV3/PersonPick.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Replicas' });

type Tab = 'people' | 'groups';
const TABS: { value: Tab; label: string }[] = [{ value: 'people', label: 'People' }, { value: 'groups', label: 'Group simulations' }];
const STATUSES = [
    { value: '', label: 'All' }, { value: 'ready', label: 'Ready' }, { value: 'building', label: 'Being built' }, { value: 'failed', label: 'Failed' },
    { value: 'blocked', label: 'Not allowed' }, { value: 'none', label: 'Not built' },
];

const router = useRouter();
const { can } = useAccess();
const canChat = computed(() => can('omniscience.replica.chat'));
const { busy, run } = useOmniAction();
const { want, name } = useOmniNames();
const { state: view } = useUrlState({ tab: 'people' as Tab, status: '', chat: '' });

const status = useOmniResource(signal => omniGet<ReplicaModuleStatusDto>('replica/status', {}, signal), { pollMs: 30_000 });
const s = computed(() => status.data.value);

const people = useOmniPaged<ReplicaPersonDto, string>((cursor, signal) => omniGet<ReplicaPersonPageDto>('replica/persons', { status: view.status, cursor, limit: 50 }, signal), { pollMs: 30_000 });
useOmniDebounced(() => view.status, () => { void people.reload(); }, 50);

function open(personId: string) { void router.push(`${OMNI_BASE}/replicas/${encodeURIComponent(personId)}`); }

const who = ref<PickedPerson[]>([]);
async function check() {
    const person = who.value[0];
    if (!person) return;
    const result = await run('readiness', () => omniPost<ReplicaJobStartedDto>('replica/readiness', { personId: person.id }),
        () => `Counting what ${person.label ?? 'they'} have written. Their replica page shows the result in a moment.`);
    if (result) open(result.personId);
}

// ── group simulations ──────────────────────────────────────────────────────
const groups = useOmniPaged<ReplicaChatDto, string>((cursor, signal) => omniGet<ReplicaChatPageDto>('replica/chats', { kind: 'group_simulation', cursor, limit: 50 }, signal));
const selectedGroup = computed(() => groups.items.value.find(c => c.chatId === view.chat) ?? null);
watchEffect(() => want(groups.items.value.flatMap(c => c.members)));
function memberNames(c: ReplicaChatDto): string { return c.members.map(name).join(', '); }

const members = ref<PickedPerson[]>([]);
const topic = ref('');
async function createGroup() {
    const chat = await run('group', () => omniPost<ReplicaChatDto>('replica/groups/create', { personIds: members.value.map(m => m.id), topic: topic.value.trim(), conversationId: null, turns: 0 }),
        () => 'Created. Let them talk when you are ready.');
    if (!chat) return;
    members.value = [];
    topic.value = '';
    await groups.reload(true);
    view.chat = chat.chatId;
}

async function removeChat(chat: ReplicaChatDto) {
    if (!window.confirm('Delete this simulation and everything written in it?')) return;
    const result = await run('chat-delete', () => omniPost<ReplicaActionResultDto>('replica/chats/delete', { chatId: chat.chatId }), r => r.detail ?? 'Deleted.');
    if (!result) return;
    view.chat = '';
    void groups.reload(true);
}

function refresh() { void status.refresh(); void people.reload(); void groups.reload(); }
</script>

<style scoped>
.tabs { margin: var(--ot-gutter) 0; }
.omni-form { display: flex; flex-direction: column; gap: 12px; }
.chats { list-style: none; margin: 0; padding: 0; }
.chats li { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--ot-line); font-size: 13px; }
.chats li.selected { background: var(--ot-accent-soft); }
.chats button { background: none; border: 0; color: inherit; font: inherit; cursor: pointer; text-align: left; padding: 0; }
.chats button:hover { text-decoration: underline; }
.ot-banner .muted { display: block; color: var(--ot-text-2); }
</style>
