<template>
  <div class="obx-split obx-split--even">
    <div class="obx-stack">
      <section class="obx-card" aria-label="Brief">
        <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="note" />Brief</h2><span v-if="game.Brief" class="obx-card__meta">{{ game.Brief.Genre }}</span></header>
        <div class="obx-card__body">
          <div v-if="!game.Brief" class="obx-empty">Research writes the brief once a concept is chosen.</div>
          <template v-else>
            <p style="font-size: 13.5px; margin-bottom: 10px">{{ game.Brief.Pitch }}</p>
            <dl class="obx-kv">
              <template v-if="game.Brief.World"><dt>World</dt><dd class="obx-prose">{{ game.Brief.World }}</dd></template>
              <template v-if="game.Brief.Template"><dt>Made from</dt><dd>the old {{ game.Brief.Template }} template</dd></template>
              <dt>Core loop</dt><dd class="obx-prose">{{ game.Brief.CoreLoop }}</dd>
              <dt>For</dt><dd>{{ game.Brief.TargetPlayers || '—' }}</dd>
              <template v-if="game.Brief.Marketing?.Hook"><dt>Hook</dt><dd class="obx-prose">{{ game.Brief.Marketing.Hook }}</dd></template>
            </dl>
            <h3 class="obx-sub">Must have</h3>
            <ul class="obx-list"><li v-for="m in game.Brief.MustHave" :key="m">{{ m }}</li></ul>
            <h3 class="obx-sub">Done when</h3>
            <ul class="obx-list"><li v-for="m in game.Brief.DoneWhen" :key="m">{{ m }}</li></ul>
            <details v-if="game.Brief.NiceToHave.length" style="margin-top: 10px">
              <summary class="obx-dim">Nice to have ({{ game.Brief.NiceToHave.length }})</summary>
              <ul class="obx-list" style="margin-top: 6px"><li v-for="m in game.Brief.NiceToHave" :key="m">{{ m }}</li></ul>
            </details>
          </template>
        </div>
      </section>

      <section class="obx-card" aria-label="Milestones">
        <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="check-circle" />Milestones</h2><span class="obx-card__meta">{{ done }}/{{ game.Milestones.length }}</span></header>
        <div class="obx-card__body">
          <div v-if="!game.Milestones.length" class="obx-empty">No milestones yet.</div>
          <ul v-else class="obx-criteria" style="grid-template-columns: minmax(0, 1fr)">
            <li v-for="m in game.Milestones" :key="m.MilestoneId" :data-met="m.Done || undefined"><span class="obx-box">{{ m.Done ? '✓' : '' }}</span><span>{{ m.Title }}<span v-if="m.Notes" class="obx-dim"> — {{ m.Notes }}</span></span></li>
          </ul>
        </div>
      </section>

      <section class="obx-card" aria-label="Last test">
        <header class="obx-card__head">
          <h2 class="obx-card__title"><ObxIcon name="flask" />Last test</h2>
          <span v-if="game.LastTest" class="obx-chip" :data-tone="game.LastTest.Passed ? 'ok' : 'crit'">{{ game.LastTest.Passed ? 'Passed' : 'Failed' }}</span>
          <span v-if="game.LastTest" class="obx-card__meta">r{{ game.LastTest.BuildRevision }} · {{ obxAgo(game.LastTest.Utc, now) }}</span>
          <div class="obx-card__tools"><button class="obx-btn obx-btn--xs obx-btn--ghost" @click="emit('tab', 'tests')">All checks<ObxIcon name="chevron-right" /></button></div>
        </header>
        <div class="obx-card__body">
          <div v-if="!game.LastTest" class="obx-empty">Not tested yet.</div>
          <template v-else>
            <p class="obx-ink2 obx-prose" style="margin-bottom: 8px">{{ game.LastTest.Summary }}</p>
            <div class="obx-tile__chips">
              <span class="obx-chip" :data-tone="game.LastTest.StaticOk ? 'ok' : 'crit'">Luau, types + scene</span>
              <span class="obx-chip" :data-tone="game.LastTest.GeometryOk ? 'ok' : 'crit'">Geometry</span>
              <span v-if="game.LastTest.MapScore != null" class="obx-chip" :data-tone="obxMapTone(game.LastTest.MapScore)">Map {{ game.LastTest.MapScore }}/100</span>
              <span class="obx-chip" :data-tone="!game.LastTest.EngineRan ? 'neutral' : game.LastTest.EngineOk ? 'ok' : 'crit'">{{ game.LastTest.EngineRan ? 'Roblox engine' : 'Engine not run' }}</span>
            </div>
            <ul v-if="issues.length" class="obx-issues" style="margin-top: 10px">
              <li v-for="(issue, i) in issues" :key="i"><span class="obx-chip" :data-tone="issue.Severity === 'error' ? 'crit' : 'warn'">{{ issue.Severity }}</span><code>{{ issue.Area }}</code><span>{{ issue.Message }}</span></li>
            </ul>
          </template>
        </div>
      </section>
    </div>

    <div class="obx-stack">
      <section class="obx-card" aria-label="Key facts">
        <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="key" />Key facts</h2><span class="obx-card__meta">kept word for word in every briefing</span></header>
        <div class="obx-card__body">
          <div v-if="!game.KeyFacts.length" class="obx-empty">None yet.</div>
          <ul v-else class="obx-stack" style="gap: 6px; font-size: 12.5px">
            <li v-for="(f, i) in game.KeyFacts" :key="`${f.Key}-${i}`" style="display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap">
              <span v-if="f.Source !== 'agent'" class="obx-chip" :data-tone="f.Source === 'owner' ? 'brick' : 'violet'">{{ f.Source === 'owner' ? 'you' : f.Source }}</span>
              <b v-if="f.Key" class="obx-mono" style="color: var(--obx-accent)">{{ f.Key }}:</b>
              <span style="overflow-wrap: anywhere">{{ f.Text }}</span>
            </li>
          </ul>
        </div>
      </section>

      <section v-if="approvals?.length" class="obx-card" aria-label="Your approvals" data-testid="obx-approvals">
        <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="check-circle" />Your approvals</h2><span class="obx-card__meta">the build sign-off and the launch, newest first</span></header>
        <div class="obx-card__body obx-card__body--flush">
          <ol>
            <li v-for="(a, i) in approvals" :key="i" class="obx-lesson" style="padding: 8px 14px">
              <div class="obx-lesson__top">
                <span class="obx-chip" :data-tone="a.Decision === 'approved' ? 'ok' : 'warn'">{{ a.Decision === 'approved' ? 'Approved' : 'Changes asked' }}</span>
                <b style="color: var(--obx-ink)">{{ a.Gate === 'build' ? 'Build sign-off' : 'Launch' }} · r{{ a.Revision }}</b>
                <span style="margin-left: auto">{{ obxAgo(a.Utc, now) }}</span>
              </div>
              <p v-if="a.Note" class="obx-ink2 obx-prose" style="font-size: 12.5px">{{ a.Note }}</p>
            </li>
          </ol>
        </div>
      </section>

      <section class="obx-card" aria-label="Decisions">
        <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="history" />Decisions</h2><span class="obx-card__meta">{{ game.Decisions.length }}, newest first</span></header>
        <div class="obx-card__body obx-card__body--flush">
          <div v-if="!game.Decisions.length" class="obx-empty">None yet.</div>
          <ol v-else>
            <li v-for="(d, i) in decisions" :key="i" class="obx-lesson" style="padding: 8px 14px">
              <span style="font-weight: 600; font-size: 12.5px">{{ d.What }}</span>
              <span class="obx-ink2" style="font-size: 12px">{{ d.Why }}</span>
              <span class="obx-faint" style="font-size: 11px">{{ d.Stage }} · {{ obxAgo(d.Utc, now) }}</span>
            </li>
          </ol>
          <button v-if="game.Decisions.length > decisionLimit" class="obx-btn obx-btn--ghost obx-btn--sm" style="margin: 4px 14px 8px" @click="decisionLimit += 20">Show more</button>
        </div>
      </section>

      <section v-if="game.Concepts.length" class="obx-card" aria-label="Concepts">
        <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="sparkle" />Concepts</h2><span class="obx-card__meta">scored 0–10; feasibility weighs most</span></header>
        <div class="obx-card__body obx-card__body--flush obx-tablewrap">
          <table class="obx-table">
            <thead><tr><th>Concept</th><th class="num" title="Demand">D</th><th class="num" title="Competition">C</th><th class="num" title="Monetisation">M</th><th class="num" title="Feasibility">F</th><th class="num" title="Lessons">L</th><th class="num">Total</th></tr></thead>
            <tbody>
              <tr v-for="c in game.Concepts" :key="c.ConceptId" :data-chosen="c.Chosen || undefined">
                <td><span v-if="c.Chosen" class="obx-chip" data-tone="brick">chosen</span> {{ c.Pitch }} <span class="obx-dim">· {{ c.Genre }}</span></td>
                <td class="num">{{ c.Scores.Demand }}</td><td class="num">{{ c.Scores.Competition }}</td><td class="num">{{ c.Scores.Monetization }}</td>
                <td class="num">{{ c.Scores.Feasibility }}</td><td class="num">{{ c.Scores.Lessons }}</td><td class="num"><b>{{ c.Scores.Total.toFixed(2) }}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="game.Research.Findings.length" class="obx-card" aria-label="Research findings">
        <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="search" />Research findings</h2></header>
        <div class="obx-card__body"><ul class="obx-list"><li v-for="(f, i) in game.Research.Findings" :key="i">{{ f }}</li></ul></div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BloxApproval, BloxDossier } from '~/composables/useOmniBlox';
import { obxAgo, obxMapTone } from '~/scripts/omniblox/console';

const props = defineProps<{ game: BloxDossier; now: number; approvals?: BloxApproval[] }>();
const emit = defineEmits<{ tab: [id: string] }>();

const done = computed(() => props.game.Milestones.filter(m => m.Done).length);
const decisionLimit = ref(10);
const decisions = computed(() => props.game.Decisions.slice().reverse().slice(0, decisionLimit.value));
const issues = computed(() => (props.game.LastTest?.Issues ?? []).filter(i => i.Severity !== 'info').slice(0, 10));
</script>
