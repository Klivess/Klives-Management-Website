<template>
    <OmniscienceV3Drawer :open="!!assertionId" :title="detail.data.value ? `${detail.data.value.fact.attributeTitle}: ${detail.data.value.fact.value}` : 'Fact'"
                      :subtitle="detail.data.value ? sourceKindLabel(detail.data.value.fact.sourceKind) : undefined" wide @close="$emit('close')">
        <OmniscienceV3ErrorBlock v-if="detail.error.value && !detail.data.value" :error="detail.error.value" what="This fact" @retry="detail.refresh()" />
        <div v-else-if="!detail.data.value" class="omni-skelrows" aria-busy="true"><div v-for="n in 5" :key="n" class="omni-skel"></div></div>
        <div v-else data-testid="fact-drawer">
            <div class="omni-row">
                <span class="omni-chip" :class="factTone(f.status)" :title="factStatusHelp(f.status)">{{ f.status }}</span>
                <span v-if="f.polarity === 'negated'" class="omni-chip warn">not</span>
                <span v-if="d.goldVerdict" class="omni-chip ok">you said: {{ d.goldVerdict }}</span>
                <span class="omni-muted">confidence {{ omniPercent(f.probability) }}{{ f.calibrated ? '' : ' (not calibrated yet)' }}</span>
            </div>
            <dl class="omni-kv omni-section">
                <dt>Value</dt><dd>{{ f.polarity === 'negated' ? 'not ' : '' }}{{ f.value }}</dd>
                <dt>Valid</dt><dd>{{ factValidity(f, month) || 'no period known' }}</dd>
                <dt>First evidence</dt><dd><OmniscienceV3Time :ms="f.firstEvidenceMs" /></dd>
                <dt>Latest evidence</dt><dd><OmniscienceV3Time :ms="f.lastEvidenceMs" /></dd>
                <dt>Recorded</dt><dd><OmniscienceV3Time :ms="f.recordedAtMs" /></dd>
                <dt v-if="f.objectPersonId">About</dt>
                <dd v-if="f.objectPersonId"><NuxtLink :to="`${OMNI_BASE}/people/${encodeURIComponent(f.objectPersonId)}`">{{ name(f.objectPersonId) }}</NuxtLink></dd>
            </dl>

            <section v-if="canReview" class="omni-section">
                <h4>Is it right?</h4>
                <div class="omni-row">
                    <button class="omni-btn sm" type="button" :disabled="busy !== null" data-testid="fact-confirm" @click="review('confirm')">Yes, confirm</button>
                    <button class="omni-btn sm warn" type="button" :disabled="busy !== null" data-testid="fact-reject" @click="review('reject')">No, reject</button>
                    <button class="omni-btn ghost sm" type="button" @click="correcting = !correcting">{{ correcting ? 'Cancel correction' : 'Correct it…' }}</button>
                </div>
                <form v-if="correcting" class="correct" @submit.prevent="review('correct')">
                    <div class="omni-field"><label :for="`${uid}-v`">The right value</label><input :id="`${uid}-v`" v-model="correction" class="omni-input" maxlength="400" required /></div>
                    <div class="omni-field"><label :for="`${uid}-n`">Note (optional)</label><input :id="`${uid}-n`" v-model="note" class="omni-input" maxlength="400" /></div>
                    <button class="omni-btn primary sm" type="submit" :disabled="busy !== null || !correction.trim()">Save the correction</button>
                </form>
                <p class="omni-muted help">Your decision is kept as a gold label: it outranks the model, and the fact is consolidated again at once.</p>
            </section>

            <section class="omni-section">
                <h4>Evidence ({{ d.evidence.length }})</h4>
                <p v-if="!d.evidence.length" class="omni-muted">No message is attached: it was worked out from other facts.</p>
                <ul class="evidence">
                    <li v-for="e in d.evidence" :key="e.messageId + e.role" :class="{ gone: e.deleted }">
                        <span class="omni-muted">
                            {{ e.authorName ?? 'someone' }} · <OmniscienceV3Time :ms="e.sentAtMs" mode="absolute" />
                            · {{ e.conversationTitle ?? e.guildName ?? e.conversationKind ?? e.platform ?? '' }}
                            <span v-if="e.edited" class="omni-chip sm">edited since</span><span v-if="e.deleted" class="omni-chip sm warn">deleted at the source</span>
                        </span>
                        <q v-if="e.quote">{{ e.quote }}</q>
                        <span v-if="e.text && e.text !== e.quote" class="full">{{ e.text }}</span>
                    </li>
                </ul>
            </section>

            <section v-if="d.history.length > 1" class="omni-section">
                <h4>History</h4>
                <table class="omni-table compact">
                    <thead><tr><th>Recorded</th><th>Value</th><th>Status</th><th class="num">Confidence</th><th>Read by</th></tr></thead>
                    <tbody>
                        <tr v-for="h in d.history" :key="h.assertionId">
                            <td><OmniscienceV3Time :ms="h.recordedAtMs" mode="absolute" /></td>
                            <td>{{ h.value ?? '—' }}</td>
                            <td><span class="omni-chip sm" :class="factTone(h.status)">{{ h.retractedAtMs ? 'withdrawn' : h.supersededAtMs ? 'replaced' : h.status }}</span></td>
                            <td class="num">{{ omniPercent(h.probability) }}</td>
                            <td class="omni-muted">{{ h.promptVersion ?? '—' }}</td>
                        </tr>
                    </tbody>
                </table>
            </section>
        </div>
    </OmniscienceV3Drawer>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { OMNI_BASE, omniGet, omniPost } from '~/scripts/omniscience/api';
import type { AssertionDetailDto, KnowledgeJobStartedDto } from '~/scripts/omniscience/contracts';
import { omniPercent } from '~/scripts/omniscience/format';
import { factStatusHelp, factTone, factValidity, sourceKindLabel } from '~/scripts/omniscience/knowledge';
import { useOmniAction, useOmniNames, useOmniResource, useOmniTime } from '~/composables/useOmniscienceV3';

/**
 * One fact with what it rests on: the messages quoted as evidence, its earlier versions, and
 * Klives's own decision about it, which outranks the model.
 */
const props = defineProps<{ assertionId: string | null; canReview: boolean }>();
const emit = defineEmits<{ close: []; changed: [] }>();

const uid = useId();
const { at } = useOmniTime();
const { busy, run } = useOmniAction();
const correcting = ref(false);
const correction = ref('');
const note = ref('');

const detail = useOmniResource<AssertionDetailDto | null>(
    signal => (props.assertionId ? omniGet<AssertionDetailDto>('knowledge/facts/get', { id: props.assertionId }, signal) : Promise.resolve(null)),
    { immediate: false });
watch(() => props.assertionId, id => {
    detail.data.value = null;
    correcting.value = false;
    correction.value = '';
    note.value = '';
    if (id) void detail.refresh();
}, { immediate: true });

const d = computed(() => detail.data.value!);
const f = computed(() => detail.data.value!.fact);
const { want, name } = useOmniNames();
watch(() => detail.data.value?.fact.objectPersonId, id => want([id]));
/** Validity is rarely known to the day: a month is the honest precision. */
function month(ms: number): string { return at(ms).slice(0, 7); }

async function review(verdict: 'confirm' | 'reject' | 'correct') {
    if (!props.assertionId) return;
    const body = { assertionId: props.assertionId, verdict, value: verdict === 'correct' ? correction.value.trim() : null, note: note.value.trim() || null };
    const result = await run(`fact-${verdict}`, () => omniPost<KnowledgeJobStartedDto>('knowledge/facts/review', body),
        r => r.detail ?? 'Recorded.');
    if (!result) return;
    emit('changed');
    emit('close');
}
</script>

<style scoped>
.evidence { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.evidence li { display: flex; flex-direction: column; gap: 3px; font-size: 13px; padding-left: 10px; border-left: 2px solid var(--omni-line-strong); }
.evidence li.gone { opacity: 0.65; }
.evidence q { font-style: italic; }
.evidence .full { font-size: 12px; color: var(--omni-muted); overflow-wrap: anywhere; }
.correct { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
.help { margin: 8px 0 0; font-size: 12px; }
</style>
