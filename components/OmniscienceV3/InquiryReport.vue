<template>
    <div class="report" data-testid="inquiry-report">
        <div class="omni-row verdict">
            <span class="ot-chip big" :class="verdictTone(report.verdict)" data-testid="inquiry-verdict">{{ verdictLabel(report.verdict) }}</span>
            <strong v-if="report.probability != null">{{ probabilityText(report.probability, report.bandLow, report.bandHigh) }}</strong>
            <span v-if="report.estimate != null" class="omni-mono">≈ {{ report.estimate }}</span>
            <span v-if="report.probability != null && !report.calibrated" class="ot-chip sm warn" title="Too few of your right/wrong marks yet to correct the model's confidence">not calibrated yet</span>
            <span v-if="report.isPrediction" class="ot-chip sm info">a prediction, not a fact</span>
            <span v-if="report.worldKnowledgeDependent" class="ot-chip sm warn" title="Part of the answer rests on general knowledge, not on the messages">leans on general knowledge</span>
        </div>
        <p class="understood"><span class="omni-muted">Understood as:</span> {{ report.restatement }}</p>
        <div v-if="report.policyNote" class="ot-banner warn" role="status"><span class="glyph" aria-hidden="true">🔒</span><div><strong>Limited by policy</strong><span class="muted">{{ report.policyNote }}</span></div></div>
        <p v-if="report.asOfNote" class="omni-muted">{{ report.asOfNote }}</p>

        <section v-if="report.disambiguation.length" class="omni-section">
            <h4>Which person did you mean?</h4>
            <div v-for="dis in report.disambiguation" :key="dis.mention" class="omni-row">
                <span>“{{ dis.mention }}” could be</span>
                <button v-for="c in dis.candidates" :key="c.personId" class="ot-btn sm" type="button" :title="c.detail ?? undefined" @click="$emit('pick', c.personId, c.label)">{{ c.label }}</button>
            </div>
        </section>

        <section v-if="report.reasoning" class="omni-section"><h4>Why</h4><p class="reasoning">{{ report.reasoning }}</p>
            <p v-if="report.temporalNote" class="omni-muted">{{ report.temporalNote }}</p></section>

        <section v-if="report.distribution.length" class="omni-section">
            <h4>The options</h4>
            <ul class="bars">
                <li v-for="c in report.distribution" :key="c.option"><span class="label">{{ c.option }}</span>
                    <span class="bar"><i :style="{ width: `${Math.round(c.probability * 100)}%` }"></i></span><span class="num">{{ omniPercent(c.probability) }}</span></li>
            </ul>
        </section>
        <section v-if="report.ranking.length" class="omni-section">
            <h4>Ranked</h4>
            <ol class="ranking">
                <li v-for="r in report.ranking" :key="r.personId">
                    <NuxtLink :to="`${OMNI_BASE}/people/${encodeURIComponent(r.personId)}`">{{ r.label }}</NuxtLink>
                    <span class="omni-muted">{{ r.score.toFixed(2) }}</span><span v-if="r.reason" class="reason">{{ r.reason }}</span>
                </li>
            </ol>
        </section>

        <section class="omni-section">
            <h4>Evidence for ({{ report.evidenceFor.length }})</h4>
            <p v-if="!report.evidenceFor.length" class="omni-muted">None found.</p>
            <ul class="evidence"><li v-for="e in report.evidenceFor" :key="e.id" class="for"><OmniscienceV3InquiryEvidence :evidence="e" /></li></ul>
        </section>
        <section class="omni-section">
            <h4>Evidence against ({{ report.evidenceAgainst.length }})</h4>
            <p v-if="!report.evidenceAgainst.length" class="omni-muted">None found.</p>
            <ul class="evidence"><li v-for="e in report.evidenceAgainst" :key="e.id" class="against"><OmniscienceV3InquiryEvidence :evidence="e" /></li></ul>
        </section>

        <section v-if="report.devilsAdvocate" class="omni-section"><h4>The case against this answer</h4><p>{{ report.devilsAdvocate }}</p></section>
        <section v-if="report.wouldChange.length" class="omni-section"><h4>What would change the answer</h4><ul><li v-for="(w, i) in report.wouldChange" :key="i">{{ w }}</li></ul></section>
        <section v-if="report.questionsToAsk.length" class="omni-section"><h4>What you could ask them</h4><ul><li v-for="(q, i) in report.questionsToAsk" :key="i">{{ q }}</li></ul></section>

        <section class="omni-section">
            <h4>What was read</h4>
            <dl class="ot-kv">
                <dt>Messages</dt><dd>{{ omniCount(report.coverage.messagesConsidered) }} considered, {{ omniCount(report.coverage.itemsInDossier) }} shown to the model</dd>
                <dt>Facts</dt><dd>{{ omniCount(report.coverage.factsConsidered) }}</dd>
                <dt>Left out</dt><dd>{{ report.coverage.excludedAsJokeOrFiction }} as jokes or fiction, {{ report.coverage.excludedAfterAsOf }} written after the as-of time</dd>
                <dt>Sources</dt><dd>{{ report.coverage.platforms.join(', ') || '—' }}{{ report.coverage.vectorSearch ? '' : ' · search by meaning was not available' }}</dd>
                <dt>As of</dt><dd><OmniscienceV3Time :ms="report.asOfMs" mode="absolute" /></dd>
                <dt>Readings</dt><dd>{{ report.passes }} independent readings{{ report.passesDropped ? `, ${report.passesDropped} failed` : '' }} · they disagreed by {{ omniPercent(report.disagreement) }}</dd>
                <dt v-if="report.priorProbability != null">Before reading</dt>
                <dd v-if="report.priorProbability != null">{{ omniPercent(report.priorProbability) }}{{ report.priorRationale ? ` — ${report.priorRationale}` : '' }}</dd>
                <dt>Model</dt><dd class="omni-muted">{{ report.model ?? '—' }} · {{ report.promptVersion }}</dd>
            </dl>
            <ul v-if="report.coverage.notes.length" class="omni-muted notes"><li v-for="(n, i) in report.coverage.notes" :key="i">{{ n }}</li></ul>
        </section>
    </div>
</template>

<script setup lang="ts">
import { OMNI_BASE } from '~/scripts/omniscience/api';
import type { InquiryReportDto } from '~/scripts/omniscience/contracts';
import { omniCount, omniPercent } from '~/scripts/omniscience/format';
import { probabilityText, verdictLabel, verdictTone } from '~/scripts/omniscience/knowledge';

/**
 * One answer with everything behind it: the verdict and its band, the messages for and against
 * (quoted, never paraphrased), what was and was not read, and what would change the answer.
 */
defineProps<{ report: InquiryReportDto }>();
defineEmits<{ pick: [personId: string, label: string] }>();
</script>

<style scoped>
.verdict { gap: 10px; }
.ot-chip.big { font-size: 14px; padding: 4px 12px; }
.understood { margin: 8px 0 0; font-size: 13px; }
.reasoning { margin: 0; white-space: pre-wrap; }
.evidence { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.evidence li { padding-left: 10px; border-left: 2px solid var(--ot-line-strong); }
.evidence li.for { border-left-color: var(--ot-positive, #3fb950); }
.evidence li.against { border-left-color: var(--ot-negative, #f85149); }
.bars { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.bars li { display: grid; grid-template-columns: minmax(80px, 180px) 1fr 48px; gap: 8px; align-items: center; font-size: 13px; }
.bars .bar { height: 8px; background: var(--ot-surface-2); border-radius: 4px; overflow: hidden; }
.bars .bar i { display: block; height: 100%; background: var(--ot-accent, #58a6ff); }
.bars .num { text-align: right; font-variant-numeric: tabular-nums; }
.ranking { margin: 0; padding-left: 24px; font-size: 13px; }
.ranking li { padding: 2px 0; }
.ranking .reason { display: block; font-size: 12px; color: var(--ot-muted); }
.notes { margin: 8px 0 0; padding-left: 20px; font-size: 12px; }
.ot-banner .muted { display: block; color: var(--ot-text-2); }
section ul:not(.evidence):not(.bars) { margin: 0; padding-left: 20px; font-size: 13px; }
p { margin: 0; }
</style>
