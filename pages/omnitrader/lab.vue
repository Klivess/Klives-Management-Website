<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <h1><span class="code">LAB</span>Lab</h1>
            <div class="ot-actions">
                <span class="mono muted small">{{ running }} running · {{ workers }} workers</span>
                <button class="ot-btn sm" type="button" @click="openNew('backtest')">New backtest</button>
                <button class="ot-btn sm primary" type="button" @click="openNew('study')">New study</button>
            </div>
        </div>
        <nav class="ot-tabs">
            <button v-for="t in TABS" :key="t.id" type="button" :aria-selected="state.tab === t.id" @click="state.tab = t.id">{{ t.label }}<span v-if="t.id === 'compare' && selected.size" class="ot-badge info">{{ selected.size }}</span></button>
        </nav>

        <!-- backtests -->
        <template v-if="state.tab === 'backtests'">
            <div class="ot-toolbar">
                <select v-model="state.strategy" class="ot-select sm auto">
                    <option value="">all strategies</option>
                    <optgroup label="Studio"><option v-for="s in studioStrategies" :key="s.ClassName" :value="`${s.ClassName}*`">{{ s.Name }}</option></optgroup>
                    <optgroup label="Built-in"><option v-for="s in builtinStrategies" :key="s.ClassName" :value="s.ClassName">{{ s.Name }}</option></optgroup>
                </select>
                <select v-model="state.origin" class="ot-select sm auto">
                    <option value="">any origin</option><option v-for="o in ['lab', 'studio', 'alpha', 'kliveagent', 'lab-study', 'studio-quick']" :key="o" :value="o">{{ o }}</option>
                </select>
                <select v-model="state.status" class="ot-select sm auto"><option value="">any status</option><option v-for="s in ['Queued', 'Running', 'Succeeded', 'Failed', 'Cancelled']" :key="s" :value="s">{{ s }}</option></select>
                <input v-model="symbolFilter" class="ot-input sm mono sym" placeholder="symbol" @keydown.enter="state.symbol = symbolFilter.toUpperCase()" />
                <input v-model="textFilter" class="ot-input sm" placeholder="label / text" @keydown.enter="state.q = textFilter" />
                <span class="grow"></span>
                <button class="ot-btn sm" type="button" :disabled="selected.size < 2" @click="state.tab = 'compare'">Compare {{ selected.size || '' }}</button>
                <button class="ot-btn ghost sm" type="button" @click="loadJobs">↻</button>
            </div>
            <OtPanel title="Backtests" flush :loading="loadingJobs && !jobs.length" :error="jobsError" :empty="!jobs.length" :collapsible="false">
                <template #controls><span class="mono small muted">{{ jobs.length }} / {{ jobsTotal }}</span></template>
                <OtGrid :rows="jobs" :columns="jobCols" grid-key="lab.jobs" selectable :selected-key="state.job" :row-key="(r: any) => r.Id" export-name="backtests"
                        max-height="calc(100vh - 250px)" default-sort="QueuedUtc" :total="jobsTotal" @select="(r: any) => (state.job = r.Id)">
                    <template #cell-pick="{ row }"><input type="checkbox" :checked="selected.has(row.Id)" @click.stop="togglePick(row.Id)" /></template>
                    <template #cell-Status="{ row }">
                        <span class="ot-chip" :class="statusTone(row.Status)">{{ row.Status === 'Running' ? `${fmtN(row.ProgressPct, 0)}%` : row.Status }}</span>
                    </template>
                </OtGrid>
                <div v-if="jobs.length < jobsTotal" class="more"><button class="ot-btn sm ghost" type="button" @click="loadMore">Load more</button></div>
            </OtPanel>
        </template>

        <!-- studies -->
        <template v-else-if="state.tab === 'studies'">
            <div class="ot-grid sidebar-left">
                <OtPanel title="Studies" flush :loading="loadingStudies && !studies.length" :empty="!studies.length" :collapsible="false">
                    <OtGrid :rows="studies" :columns="studyCols" grid-key="lab.studies" selectable :selected-key="state.study" :row-key="(r: any) => r.Id" default-sort="CreatedUtc"
                            max-height="calc(100vh - 220px)" @select="(r: any) => (state.study = r.Id)">
                        <template #cell-Status="{ row }"><span class="ot-chip" :class="statusTone(row.Status)">{{ row.Status === 'Running' ? `${fmtN(row.Progress, 0)}%` : row.Status }}</span></template>
                    </OtGrid>
                </OtPanel>
                <div class="ot-stack">
                    <div v-if="!study" class="ot-state"><span class="muted">Select a study</span></div>
                    <template v-else>
                        <div class="ot-toolbar">
                            <span class="summary"><b>{{ study.Kind }}</b> · {{ strategyName(study.StrategyClass) }} · {{ study.Request?.Base?.Coin }} · {{ intervalShort(study.Request?.Base?.Interval) }} · objective {{ study.Request?.Objective }} · {{ study.Completed }}/{{ study.Total }} runs</span>
                            <span class="grow"></span>
                            <button v-if="study.Status === 'Running' || study.Status === 'Queued'" class="ot-btn sm danger" type="button" @click="cancelStudy">Cancel</button>
                            <button v-if="study.Result?.Best" class="ot-btn sm" type="button" @click="backtestBest">Backtest best</button>
                        </div>
                        <div v-if="study.Error" class="ot-banner"><span class="glyph">⚠</span><span class="mono small">{{ study.Error }}</span></div>
                        <template v-if="study.Result">
                            <div class="ot-statbar">
                                <div class="ot-stat"><span class="k">Trials</span><span class="v">{{ study.Result.Trials }}</span></div>
                                <div class="ot-stat"><span class="k">Best objective</span><span class="v">{{ fmtN(study.Result.Best?.Objective, 3) }}</span></div>
                                <div class="ot-stat"><span class="k">Deflated Sharpe</span><span class="v" :class="(study.Result.DeflatedSharpe ?? 0) > 0.95 ? 'pos' : (study.Result.DeflatedSharpe ?? 0) < 0.5 ? 'neg' : ''">{{ fmtN(study.Result.DeflatedSharpe, 3) }}</span><span class="s">E[max] {{ fmtN(study.Result.ExpectedMaxSharpe, 2) }}</span></div>
                                <div v-if="study.Result.WalkForwardEfficiency !== null && study.Result.WalkForwardEfficiency !== undefined" class="ot-stat"><span class="k">WF efficiency</span><span class="v" :class="tone(study.Result.WalkForwardEfficiency)">{{ fmtN(study.Result.WalkForwardEfficiency, 2) }}</span></div>
                                <div v-if="study.Result.OutOfSample" class="ot-stat"><span class="k">OOS Sharpe</span><span class="v" :class="tone(study.Result.OutOfSample.Sharpe)">{{ fmtN(study.Result.OutOfSample.Sharpe, 2) }}</span><span class="s">{{ fmtChg(study.Result.OutOfSample.ReturnPct, 1) }}</span></div>
                                <template v-if="study.Result.Batch">
                                    <div class="ot-stat"><span class="k">Profitable</span><span class="v">{{ study.Result.Batch.Profitable }}/{{ study.Result.Batch.Symbols }}</span></div>
                                    <div class="ot-stat"><span class="k">Median Sharpe</span><span class="v">{{ fmtN(study.Result.Batch.MedianSharpe, 2) }}</span></div>
                                    <div class="ot-stat"><span class="k">Beat B&amp;H</span><span class="v">{{ fmtPctPlain(study.Result.Batch.BeatBenchmarkPct, 0) }}</span></div>
                                </template>
                                <template v-if="study.Result.MonteCarlo">
                                    <div class="ot-stat"><span class="k">P(loss)</span><span class="v neg">{{ fmtPctPlain(study.Result.MonteCarlo.ProbabilityOfLossPct, 1) }}</span></div>
                                    <div class="ot-stat"><span class="k">P(ruin {{ study.Result.MonteCarlo.RuinThresholdPct }}%)</span><span class="v neg">{{ fmtPctPlain(study.Result.MonteCarlo.ProbabilityOfRuinPct, 1) }}</span></div>
                                </template>
                            </div>
                            <OtPanel v-if="study.Result.Heatmap" :title="`${study.Result.Heatmap.Y} × ${study.Result.Heatmap.X}`" code="HEAT" persist="lab.heat">
                                <OtHeatmap :rows="study.Result.Heatmap.YValues" :cols="study.Result.Heatmap.XValues" :values="study.Result.Heatmap.Z" :decimals="2" highlight-max :corner="`${study.Result.Heatmap.Y} \\ ${study.Result.Heatmap.X}`" />
                            </OtPanel>
                            <OtPanel v-if="Object.keys(study.Result.Sensitivity ?? {}).length" title="Parameter sensitivity" persist="lab.sens">
                                <div class="ot-bars">
                                    <div v-for="(v, k) in study.Result.Sensitivity" :key="k" class="ot-bar"><span class="lbl mono">{{ k }}</span><span class="track"><span class="fill" :style="{ left: 0, width: `${Math.min(100, Math.abs(Number(v)) * 100)}%` }"></span></span><span class="val">{{ fmtN(Number(v), 3) }}</span></div>
                                </div>
                            </OtPanel>
                            <OtPanel v-if="study.Result.Folds?.length" title="Walk-forward folds" flush persist="lab.folds">
                                <OtGrid :rows="study.Result.Folds" :columns="foldCols" bare :row-key="(r: any) => String(r.Index)" />
                            </OtPanel>
                            <OtPanel v-if="study.Result.OutOfSampleEquity?.length" title="Stitched out-of-sample equity" persist="lab.oos">
                                <OtSeries :series="[{ name: 'OOS', type: 'area', data: study.Result.OutOfSampleEquity.map((p: any) => ({ t: p.T, v: p.V })) }]" :height="200" />
                            </OtPanel>
                            <OtPanel v-if="study.Result.MonteCarlo" title="Monte Carlo (trade bootstrap)" persist="lab.mc">
                                <div class="mc">
                                    <div><h4 class="ot-sectionhead">Final return %</h4><div class="hist"><span v-for="(b, i) in study.Result.MonteCarlo.ReturnHistogram" :key="i" :class="b.From >= 0 ? 'p' : 'n'" :style="{ height: `${(b.Count / maxCount(study.Result.MonteCarlo.ReturnHistogram)) * 100}%` }" :title="`${fmtN(b.From, 1)}…${fmtN(b.To, 1)}: ${b.Count}`"></span></div></div>
                                    <div><h4 class="ot-sectionhead">Max drawdown %</h4><div class="hist"><span v-for="(b, i) in study.Result.MonteCarlo.DrawdownHistogram" :key="i" class="n" :style="{ height: `${(b.Count / maxCount(study.Result.MonteCarlo.DrawdownHistogram)) * 100}%` }" :title="`${fmtN(b.From, 1)}…${fmtN(b.To, 1)}: ${b.Count}`"></span></div></div>
                                    <div class="kvs mono">
                                        <span v-for="(v, k) in study.Result.MonteCarlo.FinalReturnPct" :key="`r${k}`">ret {{ k }} <b :class="tone(Number(v))">{{ fmtChg(Number(v), 1) }}</b></span>
                                        <span v-for="(v, k) in study.Result.MonteCarlo.MaxDrawdownPct" :key="`d${k}`">dd {{ k }} <b class="neg">{{ fmtPctPlain(Number(v), 1) }}</b></span>
                                    </div>
                                </div>
                            </OtPanel>
                            <OtPanel :title="study.Kind === 'Batch' ? 'Per symbol' : 'Runs'" flush persist="lab.runs">
                                <OtGrid :rows="studyRuns" :columns="runCols" :grid-key="`lab.runs.${study.Kind}`" :row-key="(r: any) => r.key" default-sort="Objective" export-name="study-runs" max-height="420px" />
                            </OtPanel>
                        </template>
                    </template>
                </div>
            </div>
        </template>

        <!-- compare -->
        <template v-else-if="state.tab === 'compare'">
            <div class="ot-toolbar">
                <span class="summary">{{ selected.size }} selected</span>
                <button class="ot-btn sm" type="button" :disabled="selected.size < 1" @click="loadCompare">Refresh</button>
                <button class="ot-btn ghost sm" type="button" @click="clearCompare">Clear</button>
            </div>
            <div v-if="!selected.size" class="ot-state"><span class="muted">Tick backtests in the blotter to compare them.</span></div>
            <template v-else>
                <OtPanel title="Equity (start = 100)" code="CMP" :loading="loadingCompare">
                    <OtSeries :series="compareSeries" :height="340" :decimals="1" />
                </OtPanel>
                <OtPanel title="Metrics" flush>
                    <OtGrid :rows="compareRows" :columns="compareCols" bare :row-key="(r: any) => r.Id" />
                </OtPanel>
            </template>
        </template>

        <!-- experiments -->
        <template v-else-if="state.tab === 'experiments'">
            <div class="ot-grid sidebar">
                <OtPanel title="Experiments" flush :empty="!experiments.length" :collapsible="false">
                    <OtGrid :rows="experiments" :columns="expCols" grid-key="lab.exp" :row-key="(r: any) => r.Id" />
                </OtPanel>
                <OtPanel title="New experiment" :collapsible="false">
                    <div class="form">
                        <label class="ot-field"><span class="lbl">Name</span><input v-model="expForm.Name" class="ot-input sm" /></label>
                        <label class="ot-field"><span class="lbl">Strategy</span>
                            <select v-model="expForm.StrategyClass" class="ot-select sm"><option v-for="s in strategies" :key="s.ClassName" :value="s.ClassName">{{ s.Name }}</option></select>
                        </label>
                        <label class="ot-field"><span class="lbl">Hypothesis</span><textarea v-model="expForm.Hypothesis" class="ot-input" rows="3"></textarea></label>
                        <button class="ot-btn primary" type="button" :disabled="!expForm.Name || !expForm.StrategyClass" @click="createExperiment">Create</button>
                    </div>
                </OtPanel>
            </div>
        </template>

        <!-- job detail -->
        <OmniTraderDrawer :open="!!state.job" wide :title="job ? `${strategyName(job.StrategyClass)} · ${job.Config?.Coin ?? ''} · ${intervalShort(job.Config?.Interval)}` : 'Backtest'"
                          :subtitle="job ? `${job.Id} · ${job.Status}${job.Config?.Label ? ' · ' + job.Config.Label : ''}` : ''" @close="state.job = ''">
            <div v-if="loadingJob && !job" class="ot-state compact"><span class="ot-spin"></span></div>
            <template v-else-if="job">
                <div v-if="job.Error" class="ot-banner"><span class="glyph">⚠</span><span class="mono small">{{ job.Error }}</span></div>
                <div class="cfg mono">
                    <span>{{ job.Config?.CandleCount }} bars</span>
                    <span v-if="job.Config?.FromUtc">{{ fmtDay10(job.Config.FromUtc) }} → {{ fmtDay10(job.Config.ToUtc) }}</span>
                    <span>fee {{ fmtN((job.Config?.FeeFraction ?? 0) * 100, 3) }}%</span><span>slip {{ fmtN((job.Config?.SlippageFraction ?? 0) * 100, 3) }}%</span>
                    <span>lev {{ job.Config?.Margin?.Leverage ?? 1 }}×</span><span>{{ job.Config?.Execution }}</span>
                    <template v-for="(v, k) in job.Config?.Parameters ?? {}" :key="k"><span v-if="String(k) !== 'TradeSymbol'">{{ k }}={{ v }}</span></template>
                </div>
                <OtBacktestReport v-if="job.Result" :result="job.Result" :interval="job.Config?.Interval" grid-key="lab" />
                <div v-else class="ot-state compact"><span class="muted">{{ job.Status === 'Running' ? `${fmtN(job.ProgressPct, 0)}% · ${job.CandlesDone ?? 0}/${job.CandlesTotal ?? '?'} bars` : 'No result' }}</span></div>
            </template>
            <template #footer>
                <button v-if="job && (job.Status === 'Queued' || job.Status === 'Running')" class="ot-btn danger" type="button" @click="cancelJob">Cancel</button>
                <button v-if="job?.Result" class="ot-btn" type="button" @click="monteCarlo">Monte Carlo</button>
                <button v-if="job?.Result" class="ot-btn" type="button" @click="attach">Attach to experiment</button>
                <button v-if="job" class="ot-btn" type="button" @click="rerun">Re-run…</button>
                <button v-if="job" class="ot-btn ghost" type="button" @click="togglePick(job.Id)">{{ selected.has(job.Id) ? 'Unpick' : 'Pick for compare' }}</button>
            </template>
        </OmniTraderDrawer>

        <!-- new backtest / study -->
        <OmniTraderDrawer :open="!!newKind" wide :title="newKind === 'study' ? 'New study' : 'New backtest'" @close="newKind = null">
            <div class="form">
                <div v-if="newKind === 'study'" class="ot-field">
                    <span class="lbl">Kind</span>
                    <div class="ot-segment sm">
                        <button v-for="k in ['Sweep', 'WalkForward', 'Batch', 'MonteCarlo']" :key="k" type="button" :aria-pressed="studyForm.Kind === k" @click="studyForm.Kind = k">{{ k }}</button>
                    </div>
                </div>
                <template v-if="!(newKind === 'study' && studyForm.Kind === 'MonteCarlo')">
                    <div class="ot-formgrid">
                        <label class="ot-field wide2"><span class="lbl">Strategy</span>
                            <select v-model="btForm.Strategy" class="ot-select sm">
                                <optgroup label="Studio"><option v-for="s in studioStrategies" :key="s.ClassName" :value="s.StudioId">{{ s.Name }} (v{{ s.Version }})</option></optgroup>
                                <optgroup label="Built-in"><option v-for="s in builtinStrategies" :key="s.ClassName" :value="s.ClassName">{{ s.Name }}</option></optgroup>
                            </select>
                        </label>
                        <label class="ot-field"><span class="lbl">Symbol</span><input v-model="btForm.Symbol" class="ot-input sm mono up" /></label>
                        <label class="ot-field"><span class="lbl">Interval</span><select v-model="btForm.Interval" class="ot-select sm"><option v-for="i in INTERVALS" :key="i.value" :value="i.value">{{ i.short }}</option></select></label>
                        <label class="ot-field"><span class="lbl">Bars</span><input v-model.number="btForm.Bars" class="ot-input sm num" type="number" min="50" max="50000" /></label>
                        <label class="ot-field"><span class="lbl">From</span><input v-model="btForm.From" class="ot-input sm mono" type="date" /></label>
                        <label class="ot-field"><span class="lbl">To</span><input v-model="btForm.To" class="ot-input sm mono" type="date" /></label>
                        <label class="ot-field"><span class="lbl">Capital</span><input v-model.number="btForm.Capital" class="ot-input sm num" type="number" min="100" /></label>
                        <label class="ot-field"><span class="lbl">Costs</span><select v-model="btForm.CostPreset" class="ot-select sm"><option v-for="c in costPresets" :key="c.Id" :value="c.Id">{{ c.Name }}</option></select></label>
                        <label class="ot-field"><span class="lbl">Fee override</span><input v-model.number="btForm.Fee" class="ot-input sm num" type="number" step="0.0001" placeholder="preset" /></label>
                        <label class="ot-field"><span class="lbl">Slippage override</span><input v-model.number="btForm.Slippage" class="ot-input sm num" type="number" step="0.0001" placeholder="preset" /></label>
                        <label class="ot-field"><span class="lbl">Leverage</span><input v-model.number="btForm.Leverage" class="ot-input sm num" type="number" min="1" max="10" step="0.5" /></label>
                        <label class="ot-field"><span class="lbl">Fills</span><select v-model="btForm.Execution" class="ot-select sm"><option value="NextOpen">next open</option><option value="SignalClose">signal close</option></select></label>
                        <label class="ot-field"><span class="lbl">Benchmark</span><input v-model="btForm.Benchmark" class="ot-input sm mono up" placeholder="traded symbol" /></label>
                        <label class="ot-field"><span class="lbl">Label</span><input v-model="btForm.Label" class="ot-input sm" /></label>
                    </div>
                    <label v-if="newKind === 'backtest'" class="ot-check"><input v-model="btForm.Validate" type="checkbox" /> cost sensitivity + walk-forward validation</label>
                    <div v-if="formParams.length" class="ot-field">
                        <span class="lbl">Parameters</span>
                        <table class="ot-table params">
                            <thead><tr><th>Name</th><th class="num">Value</th><template v-if="newKind === 'study' && sweepKind"><th>Sweep</th><th class="num">Min</th><th class="num">Max</th><th class="num">Step</th></template></tr></thead>
                            <tbody>
                                <tr v-for="p in formParams" :key="p.Name">
                                    <td class="mono">{{ p.Name }}<span class="muted small"> {{ p.Type }}</span></td>
                                    <td class="num"><input v-model="btForm.Parameters[p.Name]" class="ot-input sm num" :placeholder="String(p.Default ?? '')" /></td>
                                    <template v-if="newKind === 'study' && sweepKind">
                                        <td><input v-model="sweep[p.Name].on" type="checkbox" :disabled="!isNumeric(p)" /></td>
                                        <td class="num"><input v-model.number="sweep[p.Name].min" class="ot-input sm num" type="number" step="any" /></td>
                                        <td class="num"><input v-model.number="sweep[p.Name].max" class="ot-input sm num" type="number" step="any" /></td>
                                        <td class="num"><input v-model.number="sweep[p.Name].step" class="ot-input sm num" type="number" step="any" /></td>
                                    </template>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </template>
                <template v-if="newKind === 'study'">
                    <div class="ot-formgrid">
                        <label v-if="sweepKind" class="ot-field"><span class="lbl">Objective</span>
                            <select v-model="studyForm.Objective" class="ot-select sm"><option v-for="o in ['sharpe', 'sortino', 'calmar', 'return', 'cagr', 'profitfactor', 'expectancy']" :key="o" :value="o">{{ o }}</option></select>
                        </label>
                        <label v-if="sweepKind" class="ot-field"><span class="lbl">Method</span><select v-model="studyForm.Method" class="ot-select sm"><option value="grid">grid</option><option value="random">random</option></select></label>
                        <label v-if="sweepKind" class="ot-field"><span class="lbl">Max runs</span><input v-model.number="studyForm.MaxRuns" class="ot-input sm num" type="number" min="1" max="2000" /></label>
                        <label v-if="sweepKind" class="ot-field"><span class="lbl">Min trades</span><input v-model.number="studyForm.MinTrades" class="ot-input sm num" type="number" min="0" /></label>
                        <template v-if="studyForm.Kind === 'WalkForward'">
                            <label class="ot-field"><span class="lbl">In-sample bars</span><input v-model.number="studyForm.InSampleBars" class="ot-input sm num" type="number" min="50" /></label>
                            <label class="ot-field"><span class="lbl">Out-of-sample bars</span><input v-model.number="studyForm.OutOfSampleBars" class="ot-input sm num" type="number" min="10" /></label>
                        </template>
                        <template v-if="studyForm.Kind === 'MonteCarlo'">
                            <label class="ot-field wide2"><span class="lbl">Source job</span><input v-model="studyForm.SourceJobId" class="ot-input sm mono" /></label>
                            <label class="ot-field"><span class="lbl">Iterations</span><input v-model.number="studyForm.Iterations" class="ot-input sm num" type="number" min="100" max="20000" /></label>
                            <label class="ot-field"><span class="lbl">Ruin at DD %</span><input v-model.number="studyForm.RuinDrawdownPct" class="ot-input sm num" type="number" min="5" max="100" /></label>
                        </template>
                        <template v-if="studyForm.Kind === 'Batch'">
                            <label class="ot-field wide2"><span class="lbl">Universe</span>
                                <select v-model="studyForm.Universe" class="ot-select sm"><option value="">symbols below</option><option v-for="u in universes" :key="u.Id" :value="u.Id">{{ u.Name }}</option></select>
                            </label>
                            <label class="ot-field wide3"><span class="lbl">Symbols</span><input v-model="batchSymbols" class="ot-input sm mono up" placeholder="BTCUSDT ETHUSDT SOLUSDT" /></label>
                        </template>
                    </div>
                    <div v-if="sweepKind" class="muted small mono">{{ combos }} combinations{{ combos > studyForm.MaxRuns ? ` → ${studyForm.MaxRuns} sampled` : '' }}</div>
                </template>
                <div v-if="formError" class="ot-banner"><span class="glyph">⚠</span><span class="mono small">{{ formError }}</span></div>
            </div>
            <template #footer>
                <button class="ot-btn ghost" type="button" @click="newKind = null">Cancel</button>
                <button class="ot-btn primary" type="button" :disabled="submitting" @click="submitNew">{{ submitting ? 'Queueing…' : 'Queue' }}</button>
            </template>
        </OmniTraderDrawer>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Swal from 'sweetalert2';
import { useOmniTrader, useUrlState } from '~/composables/useOmniTrader';
import { INTERVALS, SWAL_TERMINAL, colourAt, fmtChg, fmtDay10, fmtN, fmtPctPlain, intervalShort, tGet, tPost, tone, useTicker } from '~/composables/useTerminal';
import type { GridColumn } from '~/components/Ot/Grid.vue';
import type { SeriesDef } from '~/components/Ot/Series.vue';

definePageMeta({ layout: 'navbar' });

const route = useRoute();
const { get, post } = useOmniTrader();
const TABS = [{ id: 'backtests', label: 'Backtests' }, { id: 'studies', label: 'Studies' }, { id: 'compare', label: 'Compare' }, { id: 'experiments', label: 'Experiments' }];
const { state } = useUrlState({ tab: 'backtests', job: '', study: '', strategy: '', origin: '', status: '', symbol: '', q: '' });
const symbolFilter = ref(state.symbol);
const textFilter = ref(state.q);

const strategies = ref<any[]>([]);
const costPresets = ref<any[]>([]);
const universes = ref<any[]>([]);
const studioStrategies = computed(() => strategies.value.filter(s => s.StudioId));
const builtinStrategies = computed(() => strategies.value.filter(s => !s.StudioId));
const nameByClass = computed(() => new Map(strategies.value.map(s => [s.ClassName, s.Name])));
function strategyName(cls?: string) {
    if (!cls) return '—';
    const base = cls.split('@')[0];
    const n = nameByClass.value.get(base) ?? nameByClass.value.get(cls);
    const v = cls.includes('@v') ? ` ${cls.slice(cls.indexOf('@') + 1)}` : '';
    return n ? `${n}${v}` : cls;
}

// ── backtests ────────────────────────────────────────────────────────────────

const jobs = ref<any[]>([]);
const jobsTotal = ref(0);
const loadingJobs = ref(false);
const jobsError = ref<string | null>(null);
const running = ref(0);
const workers = ref(0);
const limit = ref(200);
async function loadJobs() {
    loadingJobs.value = true;
    try {
        const r = await tGet<any>('/lab/backtests', {
            strategy: state.strategy || undefined, origin: state.origin || undefined, status: state.status || undefined,
            symbol: state.symbol || undefined, q: state.q || undefined, limit: limit.value,
        });
        jobs.value = r.Rows ?? [];
        jobsTotal.value = r.Total ?? jobs.value.length;
        running.value = r.Running ?? 0;
        workers.value = r.Workers ?? 0;
        jobsError.value = null;
    } catch (e: any) { jobsError.value = e?.message ?? 'failed'; }
    finally { loadingJobs.value = false; }
}
function loadMore() { limit.value += 200; void loadJobs(); }
useTicker(() => { if (state.tab === 'backtests') return loadJobs(); }, 8000);
watch(() => [state.strategy, state.origin, state.status, state.symbol, state.q], () => void loadJobs());

const selected = ref(new Set<string>());
function togglePick(id: string) { const s = new Set(selected.value); if (!s.delete(id)) s.add(id); selected.value = s; }
function statusTone(s: string) { return ({ Succeeded: 'ok', Done: 'ok', Running: 'info', Queued: '', Failed: 'bad', Cancelled: 'warn' } as Record<string, string>)[s] ?? ''; }

const jobCols: GridColumn[] = [
    { key: 'pick', label: '', format: 'text', sortable: false, width: '22px' },
    { key: 'QueuedUtc', label: 'Queued', format: 'datetime' },
    { key: 'StrategyClass', label: 'Strategy', format: 'text', value: r => strategyName(r.StrategyClass) },
    { key: 'Label', label: 'Label', format: 'text', hidden: true }, { key: 'Coin', label: 'Symbol', format: 'sym' },
    { key: 'Interval', label: 'TF', format: 'text', value: r => intervalShort(r.Interval) }, { key: 'CandleCount', label: 'Bars', format: 'int', hidden: true },
    { key: 'Status', label: 'Status', format: 'text' },
    { key: 'TotalPnLPercent', label: 'Return', format: 'chg', heat: 50, decimals: 1 }, { key: 'CagrPct', label: 'CAGR', format: 'chg', decimals: 1 },
    { key: 'BenchmarkReturnPct', label: 'Bench', format: 'chg', decimals: 1, hidden: true },
    { key: 'SharpeRatio', label: 'Sharpe', format: 'num', heat: 2 }, { key: 'Sortino', label: 'Sortino', format: 'num' }, { key: 'Calmar', label: 'Calmar', format: 'num', hidden: true },
    { key: 'MaxDrawdownPercent', label: 'Max DD', format: 'pct', decimals: 1 }, { key: 'ProfitFactor', label: 'PF', format: 'num' },
    { key: 'WinRate', label: 'Win', format: 'pct', decimals: 0 }, { key: 'TotalTrades', label: 'Trades', format: 'int' }, { key: 'ExposurePct', label: 'Exp.', format: 'pct', decimals: 0, hidden: true },
    { key: 'Alpha', label: 'Alpha', format: 'signed', signed: true, hidden: true }, { key: 'Origin', label: 'Origin', format: 'text' },
    { key: 'Execution', label: 'Fills', format: 'text', hidden: true }, { key: 'StrategyErrors', label: 'Err', format: 'int', hidden: true },
    { key: 'Error', label: 'Error', format: 'text', hidden: true, class: r => (r.Error ? 'neg' : undefined), clip: 260 },
];

// detail
const job = ref<any>(null);
const loadingJob = ref(false);
async function loadJob(id: string) {
    if (!id) { job.value = null; return; }
    loadingJob.value = true;
    try { job.value = await tGet<any>('/lab/backtest', { id }); }
    catch { job.value = null; }
    finally { loadingJob.value = false; }
}
watch(() => state.job, id => void loadJob(id), { immediate: true });
let jobTimer: ReturnType<typeof setInterval> | null = null;
watch(() => job.value?.Status, s => {
    if (jobTimer) { clearInterval(jobTimer); jobTimer = null; }
    if (s === 'Queued' || s === 'Running') jobTimer = setInterval(() => void loadJob(state.job), 3000);
});

async function cancelJob() { await tPost('/backtest/cancel', undefined, { id: job.value.Id }); void loadJob(state.job); }
async function monteCarlo() {
    const rec = await tPost<any>('/lab/study/create', { Kind: 'MonteCarlo', SourceJobId: job.value.Id, Base: { Strategy: job.value.StrategyClass }, Iterations: 2000 });
    state.job = '';
    state.tab = 'studies';
    state.study = rec.Id;
    void loadStudies();
}
function rerun() {
    const c = job.value.Config ?? {};
    Object.assign(btForm, {
        Strategy: c.StrategyClass?.startsWith('studio:') ? c.StrategyClass.slice(7).split('@')[0] : c.StrategyClass, Symbol: c.Coin, Interval: c.Interval, Bars: c.CandleCount,
        From: c.FromUtc ? fmtDay10(c.FromUtc) : '', To: c.ToUtc ? fmtDay10(c.ToUtc) : '', Capital: c.InitialQuoteBalance ?? 10000, Fee: c.FeeFraction, Slippage: c.SlippageFraction,
        Leverage: c.Margin?.Leverage ?? 1, Execution: c.Execution ?? 'NextOpen', Benchmark: c.Benchmark ?? '', Label: c.Label ?? '',
        Parameters: Object.fromEntries(Object.entries(c.Parameters ?? {}).filter(([k]) => k !== 'TradeSymbol')),
    });
    state.job = '';
    newKind.value = 'backtest';
}
async function attach() {
    const exps = await get<any[]>('/experiments').catch(() => []);
    if (!exps.length) { void Swal.fire({ title: 'No experiments', icon: 'info', ...SWAL_TERMINAL }); return; }
    const r = await Swal.fire({ title: 'Attach to experiment', input: 'select', inputOptions: Object.fromEntries(exps.map(e => [e.Id, e.Name])), showCancelButton: true, ...SWAL_TERMINAL });
    if (!r.isConfirmed || !r.value) return;
    await post('/experiment/attach', { id: r.value, job: job.value.Id });
}

// ── studies ──────────────────────────────────────────────────────────────────

const studies = ref<any[]>([]);
const loadingStudies = ref(false);
async function loadStudies() {
    loadingStudies.value = true;
    try { studies.value = await tGet<any[]>('/lab/studies', { limit: 300 }) ?? []; }
    finally { loadingStudies.value = false; }
}
useTicker(() => { if (state.tab === 'studies') return loadStudies(); }, 8000);
const study = ref<any>(null);
async function loadStudy(id: string) {
    if (!id) { study.value = null; return; }
    try { study.value = await tGet<any>('/lab/study', { id }); } catch { study.value = null; }
}
watch(() => state.study, id => void loadStudy(id), { immediate: true });
let studyTimer: ReturnType<typeof setInterval> | null = null;
watch(() => study.value?.Status, s => {
    if (studyTimer) { clearInterval(studyTimer); studyTimer = null; }
    if (s === 'Queued' || s === 'Running') studyTimer = setInterval(() => void loadStudy(state.study), 3000);
});
async function cancelStudy() { await tPost('/lab/study/cancel', undefined, { id: study.value.Id }); void loadStudy(state.study); }
function backtestBest() {
    const b = study.value.Result.Best;
    const base = study.value.Request.Base;
    Object.assign(btForm, {
        Strategy: base.StrategyClass?.startsWith('studio:') ? base.StrategyClass.slice(7).split('@')[0] : base.StrategyClass, Symbol: b.Symbol ?? base.Coin, Interval: base.Interval,
        Bars: base.CandleCount, Parameters: { ...Object.fromEntries(Object.entries(base.Parameters ?? {}).filter(([k]) => k !== 'TradeSymbol')), ...b.Params }, Validate: true,
        Label: `best of ${study.value.Id}`,
    });
    newKind.value = 'backtest';
}
const studyRuns = computed(() => (study.value?.Result?.Runs ?? []).map((r: any, i: number) => ({ key: `${i}`, ...r, ...(r.Metrics ?? {}), P: Object.entries(r.Params ?? {}).map(([k, v]) => `${k}=${fmtN(Number(v), Number.isInteger(v) ? 0 : 2)}`).join(' ') })));
const studyCols: GridColumn[] = [
    { key: 'CreatedUtc', label: 'Created', format: 'datetime' }, { key: 'Kind', label: 'Kind', format: 'text' },
    { key: 'StrategyClass', label: 'Strategy', format: 'text', value: r => strategyName(r.StrategyClass), hidden: true }, { key: 'Symbol', label: 'Symbol', format: 'sym' },
    { key: 'Status', label: 'Status', format: 'text' }, { key: 'DeflatedSharpe', label: 'DSR', format: 'num', decimals: 2 },
    { key: 'Origin', label: 'Origin', format: 'text', hidden: true }, { key: 'Label', label: 'Label', format: 'text', hidden: true },
];
const runCols: GridColumn[] = [
    { key: 'P', label: 'Params', format: 'text' }, { key: 'Symbol', label: 'Symbol', format: 'sym' }, { key: 'Objective', label: 'Objective', format: 'num', decimals: 3, heat: 2 },
    { key: 'ReturnPct', label: 'Return', format: 'chg', decimals: 1, heat: 50 }, { key: 'Sharpe', label: 'Sharpe', format: 'num' }, { key: 'Sortino', label: 'Sortino', format: 'num', hidden: true },
    { key: 'MaxDrawdownPct', label: 'Max DD', format: 'pct', decimals: 1 }, { key: 'ProfitFactor', label: 'PF', format: 'num' }, { key: 'WinRatePct', label: 'Win', format: 'pct', decimals: 0 },
    { key: 'Trades', label: 'Trades', format: 'int' }, { key: 'ExposurePct', label: 'Exp.', format: 'pct', decimals: 0, hidden: true }, { key: 'Error', label: 'Error', format: 'text', hidden: true, clip: 260 },
];
const foldCols: GridColumn[] = [
    { key: 'Index', label: '#', format: 'int' }, { key: 'InSampleFrom', label: 'IS from', format: 'date' }, { key: 'OutOfSampleFrom', label: 'OOS from', format: 'date' },
    { key: 'OutOfSampleTo', label: 'OOS to', format: 'date' }, { key: 'BestParams', label: 'Chosen', format: 'text', value: r => Object.entries(r.BestParams ?? {}).map(([k, v]) => `${k}=${v}`).join(' ') },
    { key: 'InSampleObjective', label: 'IS obj', format: 'num' }, { key: 'OosSharpe', label: 'OOS Sharpe', format: 'num', value: r => r.OutOfSample?.Sharpe, heat: 2 },
    { key: 'OosReturn', label: 'OOS ret', format: 'chg', value: r => r.OutOfSample?.ReturnPct, decimals: 1 },
];
function maxCount(h: { Count: number }[]) { return Math.max(1, ...h.map(b => b.Count)); }

// ── compare ──────────────────────────────────────────────────────────────────

const compare = ref<any[]>([]);
const loadingCompare = ref(false);
function clearCompare() { selected.value = new Set(); compare.value = []; }
async function loadCompare() {
    if (!selected.value.size) return;
    loadingCompare.value = true;
    try { compare.value = await tPost<any[]>('/lab/compare', { JobIds: [...selected.value] }) ?? []; }
    finally { loadingCompare.value = false; }
}
watch(() => state.tab, t => { if (t === 'compare') void loadCompare(); if (t === 'studies') void loadStudies(); if (t === 'experiments') void loadExperiments(); }, { immediate: true });
const compareSeries = computed<SeriesDef[]>(() => compare.value.filter(c => c.Equity).map((c, i) => ({
    name: `${strategyName(c.StrategyClass)} ${c.Symbol}`.slice(0, 40), color: colourAt(i), data: c.Equity.map((p: any) => ({ t: p.T, v: p.V })),
})));
const compareRows = computed(() => compare.value.map(c => ({ Id: c.Id, Name: strategyName(c.StrategyClass), Symbol: c.Symbol, Interval: intervalShort(c.Interval), ...(c.Summary ?? {}) })));
const compareCols: GridColumn[] = [
    { key: 'Name', label: 'Strategy', format: 'text' }, { key: 'Symbol', label: 'Symbol', format: 'sym' }, { key: 'Interval', label: 'TF', format: 'text' },
    { key: 'ReturnPct', label: 'Return', format: 'chg', heat: 50, decimals: 1 }, { key: 'BenchmarkPct', label: 'Bench', format: 'chg', decimals: 1 },
    { key: 'CagrPct', label: 'CAGR', format: 'chg', decimals: 1 }, { key: 'Sharpe', label: 'Sharpe', format: 'num' }, { key: 'Sortino', label: 'Sortino', format: 'num' },
    { key: 'MaxDrawdownPct', label: 'Max DD', format: 'pct', decimals: 1 }, { key: 'Calmar', label: 'Calmar', format: 'num' }, { key: 'ProfitFactor', label: 'PF', format: 'num' },
    { key: 'WinRatePct', label: 'Win', format: 'pct', decimals: 0 }, { key: 'TotalTrades', label: 'Trades', format: 'int' }, { key: 'ExposurePct', label: 'Exp.', format: 'pct', decimals: 0 },
    { key: 'Alpha', label: 'Alpha', format: 'signed' }, { key: 'Beta', label: 'Beta', format: 'num' },
];

// ── experiments ──────────────────────────────────────────────────────────────

const experiments = ref<any[]>([]);
async function loadExperiments() { experiments.value = await get<any[]>('/experiments').catch(() => []); }
const expForm = reactive({ Name: '', StrategyClass: '', Hypothesis: '' });
async function createExperiment() {
    await post('/experiment/create', undefined, { ...expForm });
    expForm.Name = ''; expForm.Hypothesis = '';
    await loadExperiments();
}
const expCols: GridColumn[] = [
    { key: 'Name', label: 'Experiment', format: 'text' }, { key: 'StrategyClass', label: 'Strategy', format: 'text', value: r => strategyName(r.StrategyClass) },
    { key: 'Hypothesis', label: 'Hypothesis', format: 'text', clip: 320 }, { key: 'Status', label: 'Status', format: 'text' },
    { key: 'Return', label: 'Return', format: 'chg', value: r => r.Results?.TotalPnLPercent ?? null }, { key: 'Sharpe', label: 'Sharpe', format: 'num', value: r => r.Results?.SharpeRatio ?? null },
    { key: 'Jobs', label: 'Jobs', format: 'int', value: r => r.JobIds?.length ?? 0 },
];

// ── new backtest / study ─────────────────────────────────────────────────────

const newKind = ref<'backtest' | 'study' | null>(null);
const submitting = ref(false);
const formError = ref('');
const btForm = reactive<any>({
    Strategy: '', Symbol: 'BTCUSDT', Interval: 'OneDay', Bars: 2000, From: '', To: '', Capital: 10000, CostPreset: 'binance', Fee: null, Slippage: null,
    Leverage: 1, Execution: 'NextOpen', Benchmark: '', Label: '', Validate: false, Parameters: {} as Record<string, any>,
});
const studyForm = reactive<any>({ Kind: 'Sweep', Objective: 'sharpe', Method: 'grid', MaxRuns: 150, MinTrades: 5, InSampleBars: 500, OutOfSampleBars: 120, SourceJobId: '', Iterations: 2000, RuinDrawdownPct: 50, Universe: '' });
const batchSymbols = ref('');
const sweep = reactive<Record<string, { on: boolean; min: number | null; max: number | null; step: number | null }>>({});
const sweepKind = computed(() => studyForm.Kind === 'Sweep' || studyForm.Kind === 'WalkForward');

const selectedDescriptor = computed(() => strategies.value.find(s => s.StudioId === btForm.Strategy || s.ClassName === btForm.Strategy) ?? null);
const formParams = computed<any[]>(() => (selectedDescriptor.value?.Parameters ?? []).filter((p: any) => p.Name !== 'TradeSymbol'));
const isNumeric = (p: any) => ['int', 'double', 'decimal', 'Int32', 'Double', 'Decimal'].includes(p.Type);
watch(formParams, ps => {
    for (const p of ps) if (!sweep[p.Name]) sweep[p.Name] = { on: false, min: p.Min ?? null, max: p.Max ?? null, step: p.Step ?? (p.Type === 'int' ? 1 : null) };
}, { immediate: true });
const combos = computed(() => Object.entries(sweep).filter(([k, s]) => s.on && formParams.value.some(p => p.Name === k)).reduce((acc, [, s]) => {
    if (s.min === null || s.max === null) return acc;
    const step = s.step && s.step > 0 ? s.step : (s.max - s.min) / 10 || 1;
    return acc * (Math.floor((s.max - s.min) / step + 1e-9) + 1);
}, 1));

function openNew(kind: 'backtest' | 'study') {
    formError.value = '';
    if (route.query.symbol) btForm.Symbol = String(route.query.symbol).toUpperCase();
    if (route.query.strategy) btForm.Strategy = String(route.query.strategy);
    if (!btForm.Strategy) btForm.Strategy = studioStrategies.value[0]?.StudioId ?? builtinStrategies.value[0]?.ClassName ?? '';
    if (kind === 'study' && route.query.new === 'sweep') studyForm.Kind = 'Sweep';
    newKind.value = kind;
}

function labDto() {
    const parameters = Object.fromEntries(Object.entries(btForm.Parameters).filter(([, v]) => v !== '' && v !== null && v !== undefined)
        .map(([k, v]) => [k, typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v]));
    return {
        Strategy: btForm.Strategy, Symbol: btForm.Symbol, Interval: btForm.Interval, Bars: btForm.Bars,
        From: btForm.From ? `${btForm.From}T00:00:00Z` : null, To: btForm.To ? `${btForm.To}T23:59:59Z` : null, Capital: btForm.Capital,
        CostPreset: btForm.CostPreset, Fee: btForm.Fee === '' ? null : btForm.Fee, Slippage: btForm.Slippage === '' ? null : btForm.Slippage,
        Leverage: btForm.Leverage, Execution: btForm.Execution, Benchmark: btForm.Benchmark || null, Label: btForm.Label || null,
        Validate: btForm.Validate, Parameters: parameters,
    };
}

async function submitNew() {
    submitting.value = true;
    formError.value = '';
    try {
        if (newKind.value === 'backtest') {
            const r = await tPost<any>('/lab/backtest', labDto());
            newKind.value = null;
            state.tab = 'backtests';
            state.job = r.JobId;
            void loadJobs();
        } else {
            const params = Object.entries(sweep).filter(([k, s]) => s.on && formParams.value.some(p => p.Name === k)).map(([k, s]) => {
                const p = formParams.value.find(x => x.Name === k);
                return { Name: k, Min: s.min, Max: s.max, Step: s.step, Integer: p?.Type === 'int' };
            });
            const rec = await tPost<any>('/lab/study/create', {
                ...studyForm, Base: labDto(), Params: params,
                Symbols: batchSymbols.value.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean), Universe: studyForm.Universe || null,
            });
            newKind.value = null;
            state.tab = 'studies';
            state.study = rec.Id;
            void loadStudies();
        }
    } catch (e: any) { formError.value = e?.message ?? 'failed'; }
    finally { submitting.value = false; }
}

// ── boot ─────────────────────────────────────────────────────────────────────

void (async () => {
    const [s, c, u] = await Promise.allSettled([tGet<any[]>('/lab/strategies'), tGet<any[]>('/terminal/cost-presets'), tGet<any>('/terminal/universes')]);
    if (s.status === 'fulfilled') strategies.value = s.value ?? [];
    if (c.status === 'fulfilled') costPresets.value = c.value ?? [];
    if (u.status === 'fulfilled') universes.value = [...(u.value?.Catalog ?? []), ...(u.value?.Watchlists ?? [])];
    if (route.query.new === '1') openNew('backtest');
    else if (route.query.new === 'sweep' || route.query.new === 'study') openNew('study');
})();
</script>

<style scoped>
.small { font-size: 10.5px; }
.sym { width: 100px; text-transform: uppercase; }
.more { padding: 6px; text-align: center; border-top: 1px solid var(--ot-line); }
.form { display: flex; flex-direction: column; gap: 10px; }
.wide2 { grid-column: span 2; }
.wide3 { grid-column: span 3; }
.up { text-transform: uppercase; }
.params td { padding: 2px 6px; height: auto; }
.params input[type='number'], .params input.num { width: 90px; }
.cfg { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; color: var(--ot-muted); margin-bottom: 8px; }
.mc { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mc .kvs { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 11px; color: var(--ot-muted); }
.hist { display: flex; align-items: flex-end; gap: 1px; height: 110px; border-bottom: 1px solid var(--ot-line-strong); }
.hist span { flex: 1 1 0; min-height: 1px; }
.hist span.p { background: rgba(38, 194, 129, 0.7); }
.hist span.n { background: rgba(242, 84, 91, 0.7); }
</style>
