<template>
  <div class="kax-page" data-testid="kax-insights">
    <div class="kax-page__inner">
      <div class="kax-page__head">
        <div>
          <h2 class="kax-page__title">Insights</h2>
          <p class="kax-page__sub">{{ periodText }}</p>
        </div>
        <div class="kax-page__tools">
          <div class="kax-seg" role="group" aria-label="Range">
            <button v-for="r in USAGE_RANGES" :key="r.id" class="kax-seg__opt" type="button" :aria-pressed="range === r.id" :data-testid="`range-${r.id}`" @click="range = r.id">{{ r.label }}</button>
          </div>
          <button class="kax-btn kax-btn--sm" type="button" :disabled="loading" @click="refresh"><KliveAgentIcon name="refresh" :class="{ 'kax-spin': loading || cacheLoading || scriptsLoading }" />Refresh</button>
        </div>
      </div>

      <div v-if="!stats" class="kax-card kax-loading">{{ loading ? 'Reading the usage history…' : 'No usage history from the server.' }}</div>
      <template v-else>
        <div class="kax-kpis">
          <div class="kax-card kax-kpi" data-testid="kpi-messages">
            <span class="kax-kpi__label"><KliveAgentIcon name="message" />Messages</span>
            <span class="kax-kpi__value">{{ fmtInt(period.messages) }}</span>
            <span class="kax-kpi__sub"><b>{{ period.avgIterations == null ? '—' : period.avgIterations.toFixed(1) }}</b> steps each · {{ fmtInt(channelSplit.api) }} web · {{ fmtInt(channelSplit.discord) }} Discord</span>
          </div>
          <div class="kax-card kax-kpi" data-testid="kpi-tokens">
            <span class="kax-kpi__label"><KliveAgentIcon name="layers" />Tokens</span>
            <span class="kax-kpi__value">{{ fmtTokens(period.totalTokens) }}</span>
            <span class="kax-kpi__sub"><b>{{ fmtTokens(period.avgPromptPerMessage) }}</b> prompt per message · {{ completionShare }} output</span>
          </div>
          <div class="kax-card kax-kpi" :data-tone="scriptTone(period.scriptSuccessPct)" data-testid="kpi-scripts">
            <span class="kax-kpi__label"><KliveAgentIcon name="code" />Scripts that ran</span>
            <span class="kax-kpi__value">{{ period.scriptSuccessPct == null ? '—' : `${Math.round(period.scriptSuccessPct)}%` }}</span>
            <span class="kax-kpi__sub"><b>{{ fmtInt(period.scripts) }}</b> run · {{ fmtInt(period.scriptFailures) }} failed to compile or threw</span>
          </div>
          <div class="kax-card kax-kpi" data-testid="kpi-runtime">
            <span class="kax-kpi__label"><KliveAgentIcon name="clock" />Run time</span>
            <span class="kax-kpi__value">{{ fmtMs(period.avgLatencyMs) }}</span>
            <span class="kax-kpi__sub">average · median <b>{{ fmtMs(perf?.recentP50DurationMs) }}</b> · p95 {{ fmtMs(perf?.recentP95DurationMs) }}</span>
          </div>
          <div class="kax-card kax-kpi" :data-tone="cache ? (cache.meetsCacheHitTarget ? 'ok' : 'warn') : undefined" data-testid="kpi-cache">
            <span class="kax-kpi__label"><KliveAgentIcon name="bolt" />Prompt cache</span>
            <span class="kax-kpi__value">{{ cache ? fmtPct(cache.cacheHitRatePct, 1) : cacheLoading ? '…' : '—' }}</span>
            <span class="kax-kpi__sub"><template v-if="cache">reusable prefix <b>{{ fmtPct(cache.reusablePrefixEfficiencyPct, 1) }}</b> · target {{ fmtPct(cache.targetCacheHitRatePct, 1) }}</template><template v-else>{{ cacheError || 'reading…' }}</template></span>
          </div>
          <div class="kax-card kax-kpi" data-testid="kpi-cost">
            <span class="kax-kpi__label"><KliveAgentIcon name="coins" />Cost</span>
            <span class="kax-kpi__value">{{ cost.value }}</span>
            <span class="kax-kpi__sub">{{ cost.note }} · lifetime {{ lifetimeCost }}</span>
          </div>
        </div>

        <div class="kax-grid-2">
          <section class="kax-card">
            <header class="kax-card__head">
              <h3 class="kax-card__title"><KliveAgentIcon name="insights" />Messages and scripts per {{ unit }}</h3>
              <span class="kax-card__meta kax-legend"><span><i style="background: var(--kax-accent)"></i>messages</span><span><i style="background: var(--kax-ok)"></i>scripts ok</span><span><i style="background: var(--kax-crit)"></i>failed</span></span>
            </header>
            <div class="kax-card__body">
              <svg class="kax-chart" :viewBox="`0 0 ${CW} ${CH}`" preserveAspectRatio="none" role="img" aria-label="Messages and scripts">
                <line v-for="y in gridY" :key="y" :x1="0" :x2="CW" :y1="y" :y2="y" stroke="rgba(186,190,230,0.07)" />
                <g v-for="(b, i) in buckets" :key="b.key || i">
                  <rect :x="slotX(i) + 1" :y="yScripts(b.scripts)" :width="slot / 2 - 2" :height="CH - PAD_B - yScripts(b.scripts)" fill="var(--kax-ok)" opacity="0.45" rx="1.5"><title>{{ b.key }}: {{ b.scripts }} scripts</title></rect>
                  <rect :x="slotX(i) + 1" :y="yScripts(b.scriptFailures)" :width="slot / 2 - 2" :height="CH - PAD_B - yScripts(b.scriptFailures)" fill="var(--kax-crit)" opacity="0.85" rx="1.5"><title>{{ b.key }}: {{ b.scriptFailures }} failed</title></rect>
                  <rect :x="slotX(i) + slot / 2" :y="yMessages(b.messages)" :width="slot / 2 - 2" :height="CH - PAD_B - yMessages(b.messages)" fill="var(--kax-accent)" opacity="0.9" rx="1.5"><title>{{ b.key }}: {{ b.messages }} messages</title></rect>
                </g>
                <text v-for="t in ticks" :key="t.i" :x="slotX(t.i) + slot / 2" :y="CH - 3" text-anchor="middle">{{ t.label }}</text>
              </svg>
            </div>
          </section>

          <section class="kax-card">
            <header class="kax-card__head">
              <h3 class="kax-card__title"><KliveAgentIcon name="layers" />Tokens per {{ unit }}</h3>
              <span class="kax-card__meta kax-legend"><span><i style="background: var(--kax-info)"></i>prompt</span><span><i style="background: var(--kax-accent)"></i>output ×20</span></span>
            </header>
            <div class="kax-card__body">
              <svg class="kax-chart" :viewBox="`0 0 ${CW} ${CH}`" preserveAspectRatio="none" role="img" aria-label="Tokens">
                <line v-for="y in gridY" :key="y" :x1="0" :x2="CW" :y1="y" :y2="y" stroke="rgba(186,190,230,0.07)" />
                <path :d="tokenArea" fill="var(--kax-info)" opacity="0.16" />
                <path :d="tokenLine('promptTokens', 1)" fill="none" stroke="var(--kax-info)" stroke-width="1.6" vector-effect="non-scaling-stroke" />
                <path :d="tokenLine('completionTokens', 20)" fill="none" stroke="var(--kax-accent)" stroke-width="1.4" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
                <text v-for="t in ticks" :key="t.i" :x="slotX(t.i) + slot / 2" :y="CH - 3" text-anchor="middle">{{ t.label }}</text>
                <text x="4" y="12" text-anchor="start">{{ fmtTokens(tokenMax) }}</text>
              </svg>
            </div>
          </section>
        </div>

        <div class="kax-grid-3">
          <section class="kax-card">
            <header class="kax-card__head">
              <h3 class="kax-card__title"><KliveAgentIcon name="clock" />Recent runs</h3>
              <span class="kax-card__meta">{{ fmtInt(perf?.measuredRuns) }} measured · {{ fmtInt(perf?.stoppedRuns) }} stopped · {{ fmtInt(perf?.failedRuns) }} failed</span>
            </header>
            <div v-if="!recentRuns.length" class="kax-card__empty">Timing appears after the next run.</div>
            <div v-else class="kax-tablewrap" style="padding: 0 6px 8px">
              <table class="kax-table">
                <thead><tr><th>Started</th><th>Result</th><th class="kax-num">Time</th><th class="kax-num">Steps</th><th class="kax-num">Model</th><th class="kax-num">Tools</th><th class="kax-num">Waiting</th></tr></thead>
                <tbody>
                  <tr v-for="(run, i) in recentRuns" :key="`${run.startedAtUtc}-${i}`">
                    <td class="kax-num">{{ shortWhen(run.startedAtUtc, now) }}</td>
                    <td><span class="kax-chip" :data-tone="run.outcome === 'completed' ? 'ok' : run.outcome === 'failed' ? 'crit' : 'warn'">{{ run.outcome }}</span></td>
                    <td class="kax-num">{{ fmtMs(run.durationMs) }}</td>
                    <td class="kax-num">{{ fmtInt(run.iterations) }}</td>
                    <td class="kax-num">{{ fmtMs(run.stages?.model?.totalMs) }}</td>
                    <td class="kax-num">{{ toolMs(run) ? fmtMs(toolMs(run)) : '—' }}</td>
                    <td class="kax-num">{{ run.stages?.waitTool ? fmtMs(run.stages.waitTool.totalMs) : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="kax-card" data-testid="kax-stages">
            <header class="kax-card__head">
              <h3 class="kax-card__title"><KliveAgentIcon name="gauge" />Where run time goes</h3>
              <span class="kax-card__meta">all measured runs</span>
            </header>
            <div v-if="!stages.length" class="kax-card__empty">No stage timings yet.</div>
            <div v-else class="kax-tablewrap" style="padding: 0 6px 8px">
              <table class="kax-table">
                <thead><tr><th>Stage</th><th>Total</th><th class="kax-num">Per call</th><th class="kax-num">Calls</th></tr></thead>
                <tbody>
                  <tr v-for="stage in stages" :key="stage.name" :title="`Longest ${fmtMs(stage.maxMs)}`">
                    <td>{{ stageLabel(stage.name) }}</td>
                    <td class="kax-bar-cell"><span class="kax-bar-cell__fill" :style="{ width: `${(stage.totalMs / stageMax) * 100}%` }"></span><span class="kax-bar-cell__text kax-num">{{ fmtMs(stage.totalMs) }}</span></td>
                    <td class="kax-num">{{ fmtMs(stage.avgMs) }}</td>
                    <td class="kax-num">{{ fmtInt(stage.calls) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div class="kax-grid-3">
          <section class="kax-card" data-testid="kax-script-health">
            <header class="kax-card__head">
              <h3 class="kax-card__title"><KliveAgentIcon name="code" />Script health</h3>
              <span class="kax-card__meta">{{ scriptsMeta }}</span>
            </header>
            <div class="kax-card__body">
              <p v-if="!scriptsSupported" class="kax-dim">This server does not report script health yet. It appears after the next deploy.</p>
              <p v-else-if="scriptsError" class="kax-verdict-line" data-tone="crit"><KliveAgentIcon name="alert" />{{ scriptsError }}</p>
              <p v-else-if="!scripts" class="kax-dim">{{ scriptsLoading ? 'Reading script outcomes…' : '—' }}</p>
              <template v-else>
                <p class="kax-verdict-line" :data-tone="scriptVerdict.tone" data-testid="script-verdict"><KliveAgentIcon :name="scriptVerdict.tone === 'ok' ? 'check-circle' : 'alert'" /><span>{{ scriptVerdict.text }}</span></p>
                <div class="kax-vitals kax-vitals--4" style="margin-top: 10px">
                  <div class="kax-vital" :title="`The first script of a conversation: ${fmtInt(scripts.totals.coldCompiles)} compiled, the slowest in ${fmtMs(scripts.totals.coldCompileMaxMs)}`">
                    <span class="kax-vital__v">{{ fmtUnder(scripts.totals.coldCompileP50Ms) }}</span>
                    <span class="kax-vital__l">first compile · p95 {{ fmtUnder(scripts.totals.coldCompileP95Ms) }}</span>
                  </div>
                  <div class="kax-vital" :title="`Every later script: ${fmtInt(scripts.totals.warmCompiles)} compiled, the slowest in ${fmtMs(scripts.totals.warmCompileMaxMs)}`">
                    <span class="kax-vital__v">{{ fmtUnder(scripts.totals.warmCompileP50Ms) }}</span>
                    <span class="kax-vital__l">later compiles · p95 {{ fmtUnder(scripts.totals.warmCompileP95Ms) }}</span>
                  </div>
                  <div class="kax-vital" :title="`Scripts the engine corrected before running them. ${fmtInt(scripts.totals.repairedButFailed)} more were corrected and still failed.`">
                    <span class="kax-vital__v">{{ fmtInt(scripts.totals.repaired) }}</span>
                    <span class="kax-vital__l">fixed by the engine</span>
                  </div>
                  <div class="kax-vital" :data-tone="scripts.totals.longestFailureStreak > 5 ? 'warn' : undefined" title="The most scripts that failed one after another in a single run">
                    <span class="kax-vital__v">{{ fmtInt(scripts.totals.longestFailureStreak) }}</span>
                    <span class="kax-vital__l">longest failure streak</span>
                  </div>
                </div>
                <template v-if="scriptPoints.length > 1">
                  <KliveAgentSpark :points="scriptPoints" bars color="var(--kax-ok)" label="Scripts per day, failed scripts in red" :format="v => `${v} scripts`" />
                  <div class="kax-spark__caption"><span>{{ scriptPoints[0].label }}</span><span>scripts a day · failed in red</span><span>{{ scriptPoints[scriptPoints.length - 1].label }}</span></div>
                </template>
                <h4 class="kax-subhead">Latest failures</h4>
                <p v-if="!scripts.recentFailures.length" class="kax-dim">None recorded.</p>
                <!-- A list, not a table: the compiler's sentence needs the full width at any screen size. -->
                <ul v-else class="kax-fails" data-testid="script-failures">
                  <li v-for="(failure, i) in scripts.recentFailures.slice(0, 8)" :key="`${failure.at}-${i}`" class="kax-fail">
                    <div class="kax-fail__head">
                      <span class="kax-chip" :data-tone="failure.kind === 'compile' ? 'warn' : 'crit'">{{ FAILURE_KIND_LABELS[failure.kind] || failure.kind }}</span>
                      <span class="kax-mono">{{ failure.code }}</span>
                      <span class="kax-fail__when">{{ shortWhen(failure.at, now) }}</span>
                    </div>
                    <div class="kax-fail__text">{{ failure.summary }}</div>
                  </li>
                </ul>
              </template>
            </div>
          </section>

          <section class="kax-card" data-testid="kax-script-causes">
            <header class="kax-card__head">
              <h3 class="kax-card__title"><KliveAgentIcon name="wrench" />Fixed, and still failing</h3>
              <span class="kax-card__meta">{{ scripts ? 'all time' : '' }}</span>
            </header>
            <div v-if="!scripts" class="kax-card__empty">{{ scriptsSupported ? '—' : 'Not reported by this server yet.' }}</div>
            <div v-else class="kax-card__body">
              <h4 class="kax-subhead" style="margin-top: 2px">Fixed before running</h4>
              <p v-if="!scripts.repairKinds.length" class="kax-dim">The engine has not had to fix a script yet.</p>
              <table v-else class="kax-table" data-testid="script-repairs">
                <tbody>
                  <tr v-for="repair in scripts.repairKinds" :key="repair.kind">
                    <td>{{ repair.kind }}</td>
                    <td class="kax-bar-cell" data-tone="ok"><span class="kax-bar-cell__fill" :style="{ width: `${(repair.count / repairMax) * 100}%` }"></span></td>
                    <td class="kax-num" style="width: 1%">{{ fmtInt(repair.count) }}</td>
                  </tr>
                </tbody>
              </table>
              <h4 class="kax-subhead">Most common failures</h4>
              <p v-if="!scripts.topErrorCodes.length" class="kax-dim">None recorded.</p>
              <table v-else class="kax-table" data-testid="script-codes">
                <tbody>
                  <tr v-for="code in scripts.topErrorCodes.slice(0, 8)" :key="code.code">
                    <td class="kax-mono">{{ code.code }}</td>
                    <td class="kax-bar-cell" data-tone="crit"><span class="kax-bar-cell__fill" :style="{ width: `${(code.count / codeMax) * 100}%` }"></span></td>
                    <td class="kax-num" style="width: 1%">{{ fmtInt(code.count) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div class="kax-grid-2">
          <section class="kax-card" data-testid="kax-model-split">
            <header class="kax-card__head">
              <h3 class="kax-card__title"><KliveAgentIcon name="clock" />Inside a model call</h3>
              <span class="kax-card__meta">{{ split ? `${fmtMs(split.totalMs)} over all measured runs` : '' }}</span>
            </header>
            <div class="kax-card__body">
              <p v-for="line in providerLines" :key="line.id" class="kax-verdict-line" :data-tone="line.tone" style="margin-bottom: 8px" data-testid="provider-slow"><KliveAgentIcon name="alert" /><span><b>{{ line.title }}.</b> {{ line.detail }}</span></p>
              <p v-if="!split" class="kax-dim">The server splits a model call into its parts from the first run after its next deploy.</p>
              <template v-else>
                <div class="kax-stack" role="img" :aria-label="split.states.map(s => `${s.label} ${s.sharePct.toFixed(0)}%`).join(', ')">
                  <span v-for="state in split.states" :key="state.name" class="kax-stack__part" :data-tone="stateTone(state.name)" :style="{ width: `${state.sharePct}%` }" :title="`${state.label}: ${fmtMs(state.totalMs)} (${state.sharePct.toFixed(1)}%)`"></span>
                </div>
                <div class="kax-tablewrap">
                  <table class="kax-table">
                    <thead><tr><th>Part of the call</th><th class="kax-num">Share</th><th class="kax-num">Total</th><th class="kax-num">Each time</th></tr></thead>
                    <tbody>
                      <tr v-for="state in split.states" :key="state.name" :title="state.name === 'model.awaiting' ? 'From sending the request to the first output. A call that does not stream counts wholly here.' : undefined">
                        <td><i class="kax-swatch" :data-tone="stateTone(state.name)"></i>{{ state.label }}</td>
                        <td class="kax-num">{{ state.sharePct.toFixed(1) }}%</td>
                        <td class="kax-num">{{ fmtMs(state.totalMs) }}</td>
                        <td class="kax-num">{{ fmtMs(state.avgMs) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <template v-if="split.concurrency.length">
                  <h4 class="kax-subhead">A whole call, by what else was in flight when it was sent</h4>
                  <table class="kax-table">
                    <thead><tr><th>Other KliveAgent calls</th><th class="kax-num">Calls</th><th class="kax-num">Each call</th></tr></thead>
                    <tbody>
                      <tr v-for="row in split.concurrency" :key="row.name"><td>{{ row.label }}</td><td class="kax-num">{{ fmtInt(row.calls) }}</td><td class="kax-num">{{ fmtMs(row.avgMs) }}</td></tr>
                    </tbody>
                  </table>
                </template>
                <template v-if="split.thinking.length">
                  <h4 class="kax-subhead">A whole call, by the reasoning effort asked for</h4>
                  <table class="kax-table">
                    <thead><tr><th>Effort</th><th class="kax-num">Calls</th><th class="kax-num">Each call</th></tr></thead>
                    <tbody>
                      <tr v-for="row in split.thinking" :key="row.level"><td style="text-transform: capitalize">{{ row.level }}</td><td class="kax-num">{{ fmtInt(row.calls) }}</td><td class="kax-num">{{ fmtMs(row.avgMs) }}</td></tr>
                    </tbody>
                  </table>
                </template>
              </template>
            </div>
          </section>

          <section class="kax-card" data-testid="kax-slow-tools">
            <header class="kax-card__head">
              <h3 class="kax-card__title"><KliveAgentIcon name="alert" />Slow tool calls</h3>
              <span class="kax-card__meta">a minute or more</span>
            </header>
            <div v-if="!scripts" class="kax-card__empty">{{ scriptsSupported ? '—' : 'Not reported by this server yet.' }}</div>
            <div v-else-if="!scripts.slowTools.length" class="kax-card__empty">No tool call has taken a minute or more.</div>
            <div v-else class="kax-tablewrap" style="padding: 0 6px 8px">
              <table class="kax-table">
                <thead><tr><th>When</th><th>Tool</th><th>Operation</th><th class="kax-num">Took</th></tr></thead>
                <tbody>
                  <tr v-for="(tool, i) in scripts.slowTools.slice(0, 10)" :key="`${tool.at}-${i}`">
                    <td class="kax-num kax-dim" style="white-space: nowrap">{{ shortWhen(tool.at, now) }}</td>
                    <td class="kax-mono">{{ tool.tool }}</td>
                    <td class="kax-dim kax-truncate" style="max-width: 220px" :title="tool.operation || ''">{{ tool.operation || '—' }}</td>
                    <td class="kax-num" style="white-space: nowrap">{{ fmtMs(tool.durationMs) }}<span v-if="tool.timedOut" class="kax-chip" data-tone="crit" style="margin-left: 6px" title="The call was still running at its deadline, so the run moved on without it">hit the limit</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div class="kax-grid-3">
          <section class="kax-card" data-testid="kax-cache">
            <header class="kax-card__head">
              <h3 class="kax-card__title"><KliveAgentIcon name="bolt" />Prompt cache</h3>
              <span class="kax-card__meta">{{ cache ? `${fmtInt(cache.measuredRequests)} of ${fmtInt(cache.requests)} calls measured` : '' }}</span>
            </header>
            <div class="kax-card__body">
              <p v-if="cacheError" class="kax-verdict-line" data-tone="crit"><KliveAgentIcon name="alert" />{{ cacheError }}</p>
              <p v-else-if="!cache" class="kax-dim">{{ cacheLoading ? 'Reading the provider’s cache measurements…' : '—' }}</p>
              <template v-else>
                <p class="kax-verdict-line" :data-tone="cache.meetsCacheHitTarget ? 'ok' : 'warn'"><KliveAgentIcon :name="cache.meetsCacheHitTarget ? 'check-circle' : 'alert'" /><span><b style="text-transform: capitalize">{{ cache.status }}</b> · {{ cache.verdict }}</span></p>
                <div class="kax-vitals kax-vitals--4" style="margin-top: 10px">
                  <div class="kax-vital"><span class="kax-vital__v">{{ fmtPct(cache.firstTurnHitRatePct, 0) }} / {{ fmtPct(cache.continuationHitRatePct, 0) }}</span><span class="kax-vital__l">first / later turns</span></div>
                  <div class="kax-vital"><span class="kax-vital__v">{{ fmtTokens(cache.uncachedTokens) }}</span><span class="kax-vital__l">uncached tokens</span></div>
                  <div class="kax-vital"><span class="kax-vital__v">{{ fmtInt(cache.zeroHitRequests) }}</span><span class="kax-vital__l">calls with no hit</span></div>
                  <div class="kax-vital"><span class="kax-vital__v">{{ fmtMs(cache.averageRequestDurationMs) }}</span><span class="kax-vital__l">per call · queue {{ fmtMs(cache.averageQueueDurationMs) }}</span></div>
                </div>
                <KliveAgentSpark v-if="cachePoints.length" :points="cachePoints" bars color="var(--kax-info)" label="Cache hit rate per day" :format="v => `${v.toFixed(1)}% hit`" />
                <div v-if="cache.breakdown?.length" class="kax-tablewrap" style="margin-top: 8px">
                  <table class="kax-table">
                    <thead><tr><th>Model</th><th>Provider</th><th class="kax-num">Calls</th><th class="kax-num">Hit</th><th class="kax-num">Avg time</th></tr></thead>
                    <tbody><tr v-for="item in cache.breakdown" :key="item.key"><td>{{ item.model }}</td><td>{{ item.provider }}</td><td class="kax-num">{{ fmtInt(item.requests) }}</td><td class="kax-num">{{ fmtPct(item.cacheHitRatePct, 1) }}</td><td class="kax-num">{{ fmtMs(item.averageRequestDurationMs) }}</td></tr></tbody>
                  </table>
                </div>
              </template>
            </div>
          </section>

          <section class="kax-card" data-testid="kax-capabilities">
            <header class="kax-card__head">
              <h3 class="kax-card__title"><KliveAgentIcon name="wrench" />Capabilities used</h3>
              <span class="kax-card__meta">lifetime</span>
            </header>
            <div v-if="!capabilities.length" class="kax-card__empty">No capability calls recorded.</div>
            <div v-else class="kax-tablewrap" style="padding: 0 6px 8px">
              <table class="kax-table">
                <thead><tr><th>Capability</th><th class="kax-num">Calls</th><th class="kax-num">Failed</th><th class="kax-num">Last</th></tr></thead>
                <tbody>
                  <tr v-for="cap in capabilities" :key="cap.name">
                    <td class="kax-mono kax-truncate" style="max-width: 260px" :title="cap.name">{{ cap.name }}</td>
                    <td class="kax-num">{{ fmtInt(cap.executions) }}</td>
                    <td class="kax-num"><span class="kax-chip" :data-tone="cap.failures / Math.max(1, cap.executions) >= 0.5 ? 'crit' : cap.failures ? 'warn' : 'ok'">{{ fmtInt(cap.failures) }}</span></td>
                    <td class="kax-num kax-dim">{{ shortWhen(cap.lastExecutedAt, now) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';
import {
  FAILURE_KIND_LABELS, USAGE_RANGES, bucketsFor, costLabel, fmtInt, fmtMs, fmtPct, fmtTokens, fmtUnder, isSubStage, modelCallSplit,
  readScriptHealth, scriptHealthVerdict, scriptTone, shortWhen, stageLabel, summarise, watchLines,
  type AgentTone, type ScriptHealth, type UsageRangeId, type UsageStats,
} from '~/scripts/agentConsole';
import KliveAgentIcon from '~/components/KliveAgent/Icon.vue';
import KliveAgentSpark from '~/components/KliveAgent/Spark.vue';

const props = defineProps<{ stats: UsageStats | null; loading: boolean; now: number }>();
const emit = defineEmits<{ refresh: [] }>();

const range = ref<UsageRangeId>('30D');
const buckets = computed(() => bucketsFor(props.stats, range.value, props.now));
const period = computed(() => summarise(buckets.value));
const perf = computed(() => props.stats?.performance ?? null);
const unit = computed(() => (USAGE_RANGES.find(r => r.id === range.value)?.gran ?? 'day'));
const periodText = computed(() => {
  const list = buckets.value;
  if (!list.length) return 'No activity in this range.';
  return `${list.length} ${unit.value}${list.length === 1 ? '' : 's'} · ${list[0].key} → ${list[list.length - 1].key}`;
});
const channelSplit = computed(() => ({
  api: buckets.value.reduce((t, b) => t + b.apiMessages, 0),
  discord: buckets.value.reduce((t, b) => t + b.discordMessages, 0),
}));
const completionShare = computed(() => (period.value.totalTokens ? `${((period.value.completionTokens / period.value.totalTokens) * 100).toFixed(1)}%` : '—'));
const cost = computed(() => costLabel(period.value.costUsd, period.value.totalTokens));
const lifetimeCost = computed(() => {
  const usd = Number(props.stats?.lifetime?.estimatedCostUsd) || 0;
  return usd ? `$${usd.toFixed(0)}` : '$0';
});

// ── charts ──
const CW = 600;
const CH = 150;
const PAD_B = 16;
const slot = computed(() => CW / Math.max(1, buckets.value.length));
const slotX = (i: number) => i * slot.value;
const gridY = [CH - PAD_B - (CH - PAD_B - 8) * 0.5, 8];
const scriptMax = computed(() => Math.max(1, ...buckets.value.map(b => b.scripts)));
const messageMax = computed(() => Math.max(1, ...buckets.value.map(b => b.messages)));
const yScripts = (v: number) => CH - PAD_B - (v / scriptMax.value) * (CH - PAD_B - 8);
const yMessages = (v: number) => CH - PAD_B - (v / messageMax.value) * (CH - PAD_B - 8);
const ticks = computed(() => {
  const n = buckets.value.length;
  const step = Math.max(1, Math.ceil(n / 7));
  return buckets.value.map((b, i) => ({ i, label: b.label })).filter(t => t.i % step === 0 || t.i === n - 1);
});
const tokenMax = computed(() => Math.max(1, ...buckets.value.map(b => Math.max(b.promptTokens, b.completionTokens * 20))));
const yTokens = (v: number) => CH - PAD_B - (v / tokenMax.value) * (CH - PAD_B - 8);
function tokenLine(key: 'promptTokens' | 'completionTokens', scale: number) {
  return buckets.value.map((b, i) => `${i ? 'L' : 'M'}${(slotX(i) + slot.value / 2).toFixed(1)},${yTokens(b[key] * scale).toFixed(1)}`).join(' ');
}
const tokenArea = computed(() => {
  if (!buckets.value.length) return '';
  const last = buckets.value.length - 1;
  return `${tokenLine('promptTokens', 1)} L${(slotX(last) + slot.value / 2).toFixed(1)},${CH - PAD_B} L${(slot.value / 2).toFixed(1)},${CH - PAD_B} Z`;
});

// ── runs ──
const recentRuns = computed<any[]>(() => (Array.isArray(perf.value?.recent) ? perf.value.recent.slice(0, 12) : []));
// The parts of a model call and of a script have their own cards: listed here beside "Model" and
// "C# scripts" they would count the same time twice.
const stages = computed<any[]>(() => (Array.isArray(perf.value?.stages) ? [...perf.value.stages] : [])
  .filter(s => (s.totalMs ?? 0) > 0 && !String(s.name).startsWith('talk.') && !isSubStage(String(s.name)))
  .sort((a, b) => b.totalMs - a.totalMs)
  .slice(0, 10));
const stageMax = computed(() => Math.max(1, ...stages.value.map(s => s.totalMs)));
function toolMs(run: any) {
  return ['script', 'nativeTool', 'computerTool'].reduce((t, k) => t + (Number(run.stages?.[k]?.totalMs) || 0), 0);
}
const capabilities = computed(() => [...(props.stats?.topCapabilities ?? [])].sort((a, b) => b.executions - a.executions).slice(0, 10));

// ── prompt cache: read on its own, per range ──
const cache = ref<any | null>(null);
const cacheLoading = ref(false);
const cacheError = ref('');
const cacheRange = computed(() => ({ '7D': '7d', '30D': '30d', '90D': '90d', '6M': 'all', '1Y': 'all', ALL: 'all' } as Record<UsageRangeId, string>)[range.value]);
const cacheMemo = new Map<string, any>();
const cachePoints = computed(() => (cache.value?.series ?? []).filter((p: any) => p.requests > 0).map((p: any) => ({ v: Number(p.cacheHitRatePct) || 0, label: p.date })));

async function loadCache(force = false) {
  const key = cacheRange.value;
  if (!force && cacheMemo.has(key)) { cache.value = cacheMemo.get(key); return; }
  cacheLoading.value = true;
  cacheError.value = '';
  try {
    const response = await RequestGETFromKliveAPI(`/kliveagent/stats/prompt-cache?range=${key}`, false, false);
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw new Error(data?.error || `HTTP ${response.status}`);
    cacheMemo.set(key, data);
    if (key === cacheRange.value) cache.value = data;
  } catch (error: any) {
    cacheError.value = `Could not read the cache measurements: ${error?.message ?? error}`;
  } finally {
    cacheLoading.value = false;
  }
}
watch(cacheRange, () => void loadCache(), { immediate: true });

// ── script health: read on its own, per range. The server keeps 180 days of it. ──
const scripts = ref<ScriptHealth | null>(null);
const scriptsLoading = ref(false);
const scriptsError = ref('');
/** False on a server from before /kliveagent/stats/scripts (404): the cards say so instead of showing zeros. */
const scriptsSupported = ref(true);
const scriptDays = computed(() => ({ '7D': 7, '30D': 30, '90D': 90, '6M': 180, '1Y': 180, ALL: 180 } as Record<UsageRangeId, number>)[range.value]);
const scriptsMemo = new Map<number, ScriptHealth>();
const scriptVerdict = computed(() => (scripts.value ? scriptHealthVerdict(scripts.value) : { tone: 'neutral' as AgentTone, text: '' }));
const scriptsMeta = computed(() => {
  const health = scripts.value;
  if (!health) return '';
  const days = `last ${health.windowDays} day${health.windowDays === 1 ? '' : 's'}`;
  // Days before the server kept these figures are unknown, not zero.
  const since = health.trackingSince ? new Date(`${health.trackingSince}T00:00:00Z`) : null;
  return since && !Number.isNaN(since.getTime())
    ? `${days} · recorded since ${since.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
    : days;
});
const scriptPoints = computed(() => (scripts.value?.days ?? []).map(day => ({ v: day.total - day.stopped, failed: day.failed, label: day.key.slice(5) })));
const repairMax = computed(() => Math.max(1, ...(scripts.value?.repairKinds ?? []).map(r => r.count)));
const codeMax = computed(() => Math.max(1, ...(scripts.value?.topErrorCodes ?? []).map(c => c.count)));

async function loadScripts(force = false) {
  const days = scriptDays.value;
  if (!force && scriptsMemo.has(days)) { scripts.value = scriptsMemo.get(days) ?? null; return; }
  scriptsLoading.value = true;
  scriptsError.value = '';
  try {
    const response = await RequestGETFromKliveAPI(`/kliveagent/stats/scripts?days=${days}`, false, false);
    if (response.status === 404) { scriptsSupported.value = false; scripts.value = null; return; }
    const data = await response.json().catch(() => null);
    const parsed = readScriptHealth(data);
    if (!response.ok || !parsed) throw new Error(data?.error || `HTTP ${response.status}`);
    scriptsSupported.value = true;
    scriptsMemo.set(days, parsed);
    if (days === scriptDays.value) scripts.value = parsed;
  } catch (error: any) {
    scriptsError.value = `Could not read script health: ${error?.message ?? error}`;
  } finally {
    scriptsLoading.value = false;
  }
}
watch(scriptDays, () => void loadScripts(), { immediate: true });

// ── inside a model call ──
const split = computed(() => modelCallSplit(perf.value?.stages));
const providerLines = computed(() => watchLines(scripts.value?.watch ?? null).filter(line => line.id === 'provider'));
function stateTone(name: string): AgentTone {
  return ({ 'model.queued': 'warn', 'model.awaiting': 'info', 'model.reasoning': 'accent', 'model.streaming': 'ok', 'model.retrying': 'crit' } as Record<string, AgentTone>)[name] ?? 'neutral';
}

function refresh() {
  cacheMemo.clear();
  scriptsMemo.clear();
  emit('refresh');
  void loadCache(true);
  void loadScripts(true);
}
</script>
