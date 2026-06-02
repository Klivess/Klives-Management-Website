<template>
    <div class="ot-shell">
        <!-- Header -->
        <header class="ot-header">
            <div class="ot-head-left">
                <div class="ot-kicker">
                    <span class="live-dot" :class="{ on: isOnline }"></span>
                    {{ isOnline ? 'OMNITRADER ONLINE' : 'SERVICE UNREACHABLE' }}
                </div>
                <h1>OmniTrader</h1>
                <p>Deploy strategies to paper &amp; live sessions, run backtests, and watch the numbers.</p>
            </div>
            <div class="ot-head-right">
                <div class="head-chips">
                    <span class="chip" :class="status?.KrakenConfigured ? 'ok' : 'off'">
                        {{ status?.KrakenConfigured ? 'Kraken Linked' : 'Kraken Off' }}
                    </span>
                    <span class="chip muted" :title="status?.DbPath">Uptime {{ status?.Uptime ? shortUptime(status.Uptime) : '—' }}</span>
                </div>
                <span class="refresh-stamp">{{ refreshing ? 'Syncing…' : 'Updated ' + lastRefresh }}</span>
                <div class="ot-head-actions">
                    <button class="ot-btn ghost" :disabled="refreshing" @click="refreshAll">Refresh</button>
                    <button class="ot-btn" @click="goBack">Schemes</button>
                </div>
            </div>
        </header>

        <div v-if="globalError" class="ot-error">{{ globalError }}</div>

        <!-- Metric rows: Paper / Live -->
        <div class="metrics-rows">
            <div class="metrics-row-group">
                <div class="metrics-row-label paper-label">PAPER</div>
                <div class="ot-metrics">
                    <div class="metric-tile paper">
                        <span class="metric-copy"><span class="metric-label">Sessions</span><small>{{ paperDeployments.length }} paper deployments</small></span>
                        <strong>{{ paperRunning }}</strong>
                    </div>
                    <div class="metric-tile paper">
                        <span class="metric-copy"><span class="metric-label">Equity</span><small>across paper sessions</small></span>
                        <strong class="num">{{ fmtMoney(paperEquity) }}</strong>
                    </div>
                    <div class="metric-tile paper" :class="paperPnL >= 0 ? '' : 'danger'">
                        <span class="metric-copy"><span class="metric-label">Net PnL</span><small>paper vs initial capital</small></span>
                        <strong class="num">{{ fmtSignedPct(paperPnL) }}</strong>
                    </div>
                    <div class="metric-tile paper">
                        <span class="metric-copy"><span class="metric-label">Win Rate</span><small>avg across paper sessions</small></span>
                        <strong class="num">{{ fmtPct(paperAvgWinRate) }}</strong>
                    </div>
                    <div class="metric-tile violet">
                        <span class="metric-copy"><span class="metric-label">Backtests</span><small>{{ runningBacktests }} running now</small></span>
                        <strong>{{ backtests.length }}</strong>
                    </div>
                    <div class="metric-tile cyan">
                        <span class="metric-copy"><span class="metric-label">Strategies</span><small>available to deploy</small></span>
                        <strong>{{ strategies.length }}</strong>
                    </div>
                </div>
            </div>
            <div class="metrics-row-group">
                <div class="metrics-row-label live-label">LIVE</div>
                <div class="ot-metrics">
                    <div class="metric-tile live">
                        <span class="metric-copy"><span class="metric-label">Sessions</span><small>{{ liveDeployments.length }} live deployments</small></span>
                        <strong>{{ liveRunning }}</strong>
                    </div>
                    <div class="metric-tile live">
                        <span class="metric-copy"><span class="metric-label">Equity</span><small>across live sessions</small></span>
                        <strong class="num">{{ fmtMoney(liveEquity) }}</strong>
                    </div>
                    <div class="metric-tile live" :class="livePnL >= 0 ? '' : 'danger'">
                        <span class="metric-copy"><span class="metric-label">Net PnL</span><small>live vs initial capital</small></span>
                        <strong class="num">{{ fmtSignedPct(livePnL) }}</strong>
                    </div>
                    <div class="metric-tile warn" :class="{ danger: liveArmedCount > 0 }">
                        <span class="metric-copy"><span class="metric-label">Armed</span><small>firing real orders on Kraken</small></span>
                        <strong>{{ liveArmedCount }}</strong>
                    </div>
                    <div class="metric-tile live" :class="livePausedCount > 0 ? 'warn' : ''">
                        <span class="metric-copy"><span class="metric-label">Paused</span><small>awaiting re-arm</small></span>
                        <strong>{{ livePausedCount }}</strong>
                    </div>
                    <div class="metric-tile" :class="status?.KrakenConfigured ? 'cyan' : 'danger'">
                        <span class="metric-copy"><span class="metric-label">Kraken</span><small>exchange connection</small></span>
                        <strong>{{ status?.KrakenConfigured ? 'ON' : 'OFF' }}</strong>
                    </div>
                </div>
            </div>
        </div>

        <!-- Visual overview -->
        <section v-if="deployments.length" class="ot-overview">
            <div class="ov-card">
                <div class="ov-title">PnL % by deployment</div>
                <div class="ov-canvas"><canvas ref="pnlByDeployCanvas"></canvas></div>
            </div>
            <div class="ov-card">
                <div class="ov-title">Equity allocation</div>
                <div class="ov-canvas"><canvas ref="allocCanvas"></canvas></div>
            </div>
            <div class="ov-card">
                <div class="ov-title">Total Kraken account value</div>
                <div class="ov-canvas">
                    <canvas ref="krakenCanvas"></canvas>
                    <div v-if="krakenEmpty" class="ov-empty">No live (Kraken) equity yet — value appears once a live deployment is running.</div>
                </div>
            </div>
        </section>

        <!-- Deploy + Strategies -->
        <section class="ot-cols deploy-cols">
            <div class="ot-panel">
                <div class="panel-head">
                    <div><span class="panel-code">NEW</span><h2>Deploy Strategy</h2></div>
                    <div class="mode-toggle">
                        <button :class="{ active: deployForm.mode === 'Paper' }" @click="deployForm.mode = 'Paper'">Paper</button>
                        <button :class="{ active: deployForm.mode === 'Live' }" @click="deployForm.mode = 'Live'">Live</button>
                    </div>
                </div>
                <div class="panel-body">
                    <div class="form-grid">
                        <label class="field span2">
                            <span>Strategy</span>
                            <select v-model="deployForm.strategyClass">
                                <option value="" disabled>Select a strategy</option>
                                <option v-for="s in strategies" :key="s.ClassName" :value="s.ClassName">{{ s.Name }}{{ s.RequiresUniverse ? ' · multi-asset' : '' }}</option>
                            </select>
                        </label>
                        <label class="field">
                            <span>Interval</span>
                            <select v-model="deployForm.interval">
                                <option v-for="i in intervals" :key="i.value" :value="i.value">{{ i.label }}</option>
                            </select>
                        </label>
                        <template v-for="(plist, group) in deployParamGroups" :key="group">
                            <div class="param-group-label">{{ group }}</div>
                            <label v-for="p in plist" :key="p.Name" class="field" :title="p.Help || ''">
                                <span>{{ p.Label }}</span>
                                <select v-if="p.Type === 'enum'" v-model="deployParams[p.Name]">
                                    <option v-for="o in (p.Options || [])" :key="o" :value="o">{{ o }}</option>
                                </select>
                                <label v-else-if="p.Type === 'bool'" class="check"><input type="checkbox" v-model="deployParams[p.Name]" /> enabled</label>
                                <input v-else-if="p.Type === 'int' || p.Type === 'double' || p.Type === 'decimal'" type="number"
                                       v-model.number="deployParams[p.Name]" :min="p.Min ?? undefined" :max="p.Max ?? undefined" :step="p.Step ?? (p.Type === 'int' ? 1 : 'any')" />
                                <input v-else v-model="deployParams[p.Name]" />
                            </label>
                        </template>
                        <label class="field">
                            <span>Initial Quote</span>
                            <input v-model.number="deployForm.initialQuote" type="number" min="0" step="0.01" />
                        </label>
                        <label class="field">
                            <span>Leverage</span>
                            <input v-model.number="deployForm.leverage" type="number" min="1" max="10" step="1" />
                        </label>
                        <label class="field">
                            <span>Initial Base</span>
                            <input v-model.number="deployForm.initialBase" type="number" min="0" step="0.00000001" />
                        </label>
                        <label class="field">
                            <span>Fee Fraction</span>
                            <input v-model.number="deployForm.feeFraction" type="number" min="0" step="0.0001" />
                        </label>
                        <label class="field">
                            <span>Slippage Fraction</span>
                            <input v-model.number="deployForm.slippageFraction" type="number" min="0" step="0.0001" />
                        </label>
                    </div>

                    <div v-if="deployForm.mode === 'Live'" class="risk-box">
                        <div class="risk-head"><span class="panel-code danger">RISK GATE</span><small>Live caps — orders blocked / flattened when breached</small></div>
                        <div class="form-grid">
                            <label class="field">
                                <span>Max Position (USD)</span>
                                <input v-model.number="deployForm.maxPositionQuoteUsd" type="number" min="0" step="1" />
                            </label>
                            <label class="field">
                                <span>Max Daily Loss (USD)</span>
                                <input v-model.number="deployForm.maxDailyLossUsd" type="number" min="0" step="1" />
                            </label>
                            <label class="field">
                                <span>Max Orders / Hour</span>
                                <input v-model.number="deployForm.maxOrdersPerHour" type="number" min="1" step="1" />
                            </label>
                            <label class="field">
                                <span>Allowed Symbols</span>
                                <input v-model="deployForm.allowedSymbols" placeholder="defaults to symbol" />
                            </label>
                        </div>
                        <p class="live-note">Live deployments start <strong>paused</strong>. Arm them from the table to begin trading real funds.</p>
                    </div>

                    <button class="ot-btn primary block" :disabled="creatingDeployment || !deployForm.strategyClass" @click="createDeployment">
                        {{ creatingDeployment ? 'Deploying…' : (deployForm.mode === 'Live' ? 'Create Live Deployment (paused)' : 'Deploy Paper Session') }}
                    </button>
                </div>
            </div>

            <div class="ot-panel">
                <div class="panel-head"><div><span class="panel-code">LIB</span><h2>Strategies</h2></div></div>
                <div class="panel-body strat-body">
                    <div v-if="initialLoading" class="empty">Loading strategies…</div>
                    <div v-else-if="!strategies.length" class="empty">No strategies registered.</div>
                    <article v-for="s in strategies" :key="s.ClassName" class="strat-card">
                        <div class="strat-top">
                            <h3>{{ s.Name }}</h3>
                            <span class="tag mono">{{ s.ClassName }}</span>
                        </div>
                        <span v-if="s.RequiresUniverse" class="tag universe">Cross-sectional · multi-asset</span>
                        <p>{{ s.Description || 'No description.' }}</p>
                        <div class="strat-actions">
                            <button class="micro" @click="prefillDeploy(s.ClassName)">Use to Deploy</button>
                            <button class="micro cyan" @click="prefillBacktest(s.ClassName)">Use to Backtest</button>
                        </div>
                    </article>
                </div>
            </div>
        </section>

        <!-- Deployments -->
        <section class="ot-panel wide">
            <div class="panel-head">
                <div><span class="panel-code">RUN</span><h2>Deployments</h2></div>
                <span class="refresh-stamp">{{ deployments.length }} listed</span>
            </div>
            <div class="panel-body">
                <div class="table-shell" :class="{ refreshing }">
                    <table>
                        <thead>
                            <tr>
                                <th>Strategy</th><th>Symbol</th><th>Int</th><th>Mode</th><th>Status</th>
                                <th class="r">Equity</th><th class="r">PnL</th><th>Created</th><th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="d in deployments" :key="d.Id" class="clickable" @click="openDeployment(d.Id)">
                                <td class="strong">{{ d.StrategyClass }}</td>
                                <td>{{ d.Symbol }}</td>
                                <td>{{ intervalLabel(d.Interval) }}</td>
                                <td><span class="pill" :class="d.Mode === 'Live' ? 'live' : 'paper'">{{ d.Mode }}</span></td>
                                <td>
                                    <span class="pill" :class="statusClass(d.Status)">{{ d.Status }}</span>
                                    <span v-if="d.Mode === 'Live'" class="pill sm" :class="d.Armed ? 'armed' : 'safe'">{{ d.Armed ? 'ARMED' : 'safe' }}</span>
                                </td>
                                <td class="r num">{{ fmtMoney(d.EquityCurrent) }}</td>
                                <td class="r num" :class="pnlClass(d.PnLPercent)">{{ fmtSignedPct(d.PnLPercent) }}</td>
                                <td class="muted">{{ fmtDate(d.CreatedUtc) }}</td>
                                <td class="actions" @click.stop>
                                    <button v-if="canArm(d)" class="micro warn" :disabled="busyId === d.Id" @click="armLive(d)">Arm</button>
                                    <button v-if="canPause(d)" class="micro" :disabled="busyId === d.Id" @click="pauseDeployment(d)">Pause</button>
                                    <button v-if="canResume(d)" class="micro cyan" :disabled="busyId === d.Id" @click="resumeDeployment(d)">Resume</button>
                                    <button v-if="d.Status !== 'Stopped'" class="micro danger" :disabled="busyId === d.Id" @click="killDeployment(d)">Kill</button>
                                    <button class="micro ghost" :disabled="busyId === d.Id" @click="deleteDeployment(d)">Del</button>
                                </td>
                            </tr>
                            <tr v-if="!deployments.length"><td colspan="9" class="empty-cell">No deployments yet. Deploy a strategy above.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        <!-- Backtest + jobs -->
        <section class="ot-cols backtest-cols">
            <div class="ot-panel">
                <div class="panel-head"><div><span class="panel-code">SIM</span><h2>Run Backtest</h2></div></div>
                <div class="panel-body">
                    <label class="field span2 strat-select">
                        <span>Strategy</span>
                        <select v-model="backtestForm.strategyClass">
                            <option value="" disabled>Select a strategy</option>
                            <option v-for="s in strategies" :key="s.ClassName" :value="s.ClassName">{{ s.Name }}{{ s.RequiresUniverse ? ' · multi-asset' : '' }}</option>
                        </select>
                    </label>

                    <!-- Schema-driven form: works for any strategy (single-symbol or multi-asset universe).
                         Universe strategies render their own params (regime symbol, universe cap, etc.). -->
                    <div class="form-grid">
                        <label class="field">
                            <span>Interval</span>
                            <select v-model="backtestForm.interval">
                                <option v-for="i in intervals" :key="i.value" :value="i.value">{{ i.label }}</option>
                            </select>
                        </label>
                        <template v-for="(plist, group) in backtestParamGroups" :key="group">
                            <div class="param-group-label">{{ group }}</div>
                            <label v-for="p in plist" :key="p.Name" class="field" :title="p.Help || ''">
                                <span>{{ p.Label }}</span>
                                <select v-if="p.Type === 'enum'" v-model="backtestParams[p.Name]">
                                    <option v-for="o in (p.Options || [])" :key="o" :value="o">{{ o }}</option>
                                </select>
                                <label v-else-if="p.Type === 'bool'" class="check"><input type="checkbox" v-model="backtestParams[p.Name]" /> enabled</label>
                                <input v-else-if="p.Type === 'int' || p.Type === 'double' || p.Type === 'decimal'" type="number"
                                       v-model.number="backtestParams[p.Name]" :min="p.Min ?? undefined" :max="p.Max ?? undefined" :step="p.Step ?? (p.Type === 'int' ? 1 : 'any')" />
                                <input v-else v-model="backtestParams[p.Name]" />
                            </label>
                        </template>
                        <label class="field"><span>Candles</span><input v-model.number="backtestForm.candleCount" type="number" min="1" step="1" /></label>
                        <label class="field"><span>Initial Quote</span><input v-model.number="backtestForm.initialQuote" type="number" min="0" step="0.01" /></label>
                        <label class="field"><span>Initial Base</span><input v-model.number="backtestForm.initialBase" type="number" min="0" step="0.00000001" /></label>
                        <label class="field"><span>Fee Fraction</span><input v-model.number="backtestForm.feeFraction" type="number" min="0" step="0.0001" /></label>
                        <label class="field"><span>Slippage Fraction</span><input v-model.number="backtestForm.slippageFraction" type="number" min="0" step="0.0001" /></label>
                        <label class="field"><span>Leverage</span><input v-model.number="backtestForm.leverage" type="number" min="1" max="10" step="1" /></label>
                    </div>

                    <!-- Generic validation (any multi-asset/universe strategy) -->
                    <div v-if="selectedBacktestStrategy?.RequiresUniverse" class="val-toggle">
                        <label class="check"><input type="checkbox" v-model="backtestForm.runValidation" /> Run validation (walk-forward param sweep, deflated Sharpe, cost sensitivity, turnover)</label>
                        <div v-if="backtestForm.runValidation" class="form-grid">
                            <label class="field"><span>In-Sample (bars)</span><input v-model.number="backtestForm.valInSample" type="number" min="20" step="10" /></label>
                            <label class="field"><span>OOS (bars)</span><input v-model.number="backtestForm.valOos" type="number" min="10" step="10" /></label>
                            <label class="field"><span>Warmup (bars)</span><input v-model.number="backtestForm.valWarmup" type="number" min="5" step="5" /></label>
                        </div>
                    </div>

                    <button class="ot-btn primary block" :disabled="creatingBacktest || !backtestForm.strategyClass" @click="createBacktest">
                        {{ creatingBacktest ? 'Queuing…' : 'Queue Backtest' }}
                    </button>
                </div>
            </div>

            <div class="ot-panel">
                <div class="panel-head"><div><span class="panel-code">JOBS</span><h2>Backtest Jobs</h2></div></div>
                <div class="panel-body">
                    <div v-if="backtestChartHasData" class="bt-overview">
                        <div class="ov-canvas sm"><canvas ref="backtestPerfCanvas"></canvas></div>
                    </div>
                    <div class="table-shell">
                        <table>
                            <thead>
                                <tr><th>Strategy</th><th>Pair</th><th>Int</th><th>Status</th><th>Progress</th><th class="r">Trades</th><th class="r">PnL</th><th class="r">Sharpe</th><th class="r">Max DD</th><th></th></tr>
                            </thead>
                            <tbody>
                                <tr v-for="b in backtests" :key="b.Id" class="clickable" @click="openBacktest(b.Id)">
                                    <td class="strong">{{ b.StrategyClass }}</td>
                                    <td>{{ b.Coin }}/{{ b.Currency }}</td>
                                    <td>{{ intervalLabel(b.Interval) }}</td>
                                    <td><span class="pill" :class="btStatusClass(b.Status)">{{ b.Status }}</span></td>
                                    <td>
                                        <div class="bar"><span :style="{ width: barWidth(b) }"></span></div>
                                    </td>
                                    <td class="r num">{{ b.TotalTrades != null ? b.TotalTrades : '—' }}</td>
                                    <td class="r num" :class="pnlClass(b.TotalPnLPercent)">
                                        {{ b.TotalPnLPercent != null ? fmtSignedPct(b.TotalPnLPercent) : '—' }}
                                    </td>
                                    <td class="r num">{{ b.SharpeRatio != null ? fmtNum2(b.SharpeRatio) : '—' }}</td>
                                    <td class="r num neg">{{ b.MaxDrawdownPercent != null ? fmtPct(b.MaxDrawdownPercent) : '—' }}</td>
                                    <td class="actions" @click.stop>
                                        <button v-if="b.Status === 'Queued' || b.Status === 'Running'" class="micro danger" @click="cancelBacktest(b)">Cancel</button>
                                        <button v-else class="micro ghost" @click="openBacktest(b.Id)">View</button>
                                    </td>
                                </tr>
                                <tr v-if="!backtests.length"><td colspan="10" class="empty-cell">No backtest jobs yet.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </section>

        <!-- Deployment detail modal -->
        <div v-if="detailOpen" class="ot-modal-backdrop" @click.self="closeDeployment">
            <div class="ot-modal">
                <header class="modal-head">
                    <div>
                        <span class="panel-code">DEPLOYMENT</span>
                        <h2>{{ detail?.Deployment?.StrategyClass || 'Deployment' }}</h2>
                        <small v-if="detail">{{ detail.Deployment.Config?.Symbol }} · {{ intervalLabel(detail.Deployment.Config?.Interval) }} · {{ detail.Deployment.Mode }} · <span class="mono">{{ shortId(detail.Deployment.Id) }}</span></small>
                    </div>
                    <button class="ot-btn ghost" @click="closeDeployment">Close</button>
                </header>
                <div v-if="loadingDetail" class="modal-loading">Loading…</div>
                <div v-else-if="detail" class="modal-body">
                    <div class="mini-grid">
                        <div class="mini"><span>Equity</span><strong class="num">{{ fmtMoney(detail.Deployment.EquityCurrent) }}</strong></div>
                        <div class="mini"><span>Initial</span><strong class="num">{{ fmtMoney(detail.Deployment.EquityInitial) }}</strong></div>
                        <div class="mini"><span>Status</span><strong>{{ detail.Deployment.Status }}</strong></div>
                        <div class="mini"><span>Orders</span><strong>{{ detail.Orders?.length || 0 }}</strong></div>
                        <div class="mini"><span>Fills</span><strong>{{ detail.Fills?.length || 0 }}</strong></div>
                    </div>

                    <div class="curve-wrap">
                        <div class="curve-label">
                            Live Price · {{ detail.Deployment.Config?.Symbol }} · {{ intervalLabel(detail.Deployment.Config?.Interval) }}
                            <span class="dp-legend">
                                <span style="color:#62ce47">▲ Buy</span>
                                <span style="color:#ef4444">▼ Sell</span>
                                <span style="color:#ffc247">◆ Exit</span>
                            </span>
                        </div>
                        <div ref="dpPriceContainer" class="dp-chart"></div>
                        <div v-if="!dpChartData?.Candles?.length" class="dp-chart-empty">Waiting for live candles…</div>
                    </div>

                    <div v-if="equitySeries.length > 1" class="curve-wrap">
                        <div class="curve-label">Equity Curve · {{ equitySeries.length }} pts</div>
                        <svg class="curve" viewBox="0 0 300 70" preserveAspectRatio="none">
                            <polyline :points="equityPolyline" />
                        </svg>
                    </div>
                    <div v-if="detail.Deployment.Error" class="ot-error sm">{{ detail.Deployment.Error }}</div>

                    <div class="sub-cols">
                        <div>
                            <h4>Recent Orders</h4>
                            <div class="table-shell short">
                                <table>
                                    <thead><tr><th>Time</th><th>Side</th><th>Type</th><th class="r">Qty</th><th>Status</th></tr></thead>
                                    <tbody>
                                        <tr v-for="o in detail.Orders" :key="o.Id">
                                            <td class="muted">{{ fmtDate(o.PlacedUtc) }}</td>
                                            <td><span class="pill sm" :class="o.Side === 'buy' ? 'buy' : 'sell'">{{ o.Side }}</span></td>
                                            <td>{{ o.Type }}</td>
                                            <td class="r num">{{ fmtQty(o.Qty) }}</td>
                                            <td><span class="pill sm" :class="orderStatusClass(o.Status)">{{ o.Status }}</span></td>
                                        </tr>
                                        <tr v-if="!detail.Orders?.length"><td colspan="5" class="empty-cell">No orders.</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div>
                            <h4>Recent Fills</h4>
                            <div class="table-shell short">
                                <table>
                                    <thead><tr><th>Time</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Fee</th></tr></thead>
                                    <tbody>
                                        <tr v-for="f in detail.Fills" :key="f.Id">
                                            <td class="muted">{{ fmtDate(f.FilledUtc) }}</td>
                                            <td class="r num">{{ fmtQty(f.Qty) }}</td>
                                            <td class="r num">{{ fmtMoney(f.Price) }}</td>
                                            <td class="r num">{{ fmtMoney(f.Fee) }}</td>
                                        </tr>
                                        <tr v-if="!detail.Fills?.length"><td colspan="4" class="empty-cell">No fills.</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Backtest report modal -->
        <div v-if="btDetailOpen" class="ot-modal-backdrop" @click.self="closeBacktest">
            <div class="ot-modal report">
                <header class="modal-head">
                    <div>
                        <span class="panel-code">BACKTEST</span>
                        <h2>{{ btDetail?.StrategyClass || 'Backtest' }}</h2>
                        <small v-if="btDetail">
                            {{ btDetail.Config?.Coin }}/{{ btDetail.Config?.Currency }} · {{ intervalLabel(btDetail.Config?.Interval) }} · {{ btDetail.Config?.CandleCount }} candles
                            <span v-if="btResult"> · {{ fmtDate(btResult.StartTime) }} → {{ fmtDate(btResult.EndTime) }}</span>
                        </small>
                    </div>
                    <button class="ot-btn ghost" @click="closeBacktest">Close</button>
                </header>
                <div v-if="loadingBtDetail" class="modal-loading">Loading…</div>
                <div v-else-if="btDetail" class="modal-body">
                    <div v-if="btDetail.Error" class="ot-error sm">{{ btDetail.Error }}</div>
                    <div v-if="!btResult" class="empty">No result yet — status {{ btDetail.Status }} ({{ Math.round(btDetail.ProgressPct || 0) }}%).</div>
                    <template v-else>
                        <div class="verdict">
                            <span class="vchip" :class="pnlClass(btResult.TotalPnLPercent)">PnL {{ fmtSignedPct(btResult.TotalPnLPercent) }}</span>
                            <span class="vchip" :class="pnlClass(btResult.AlphaVsBuyAndHoldPercent)">α vs B&amp;H {{ fmtSignedPct(btResult.AlphaVsBuyAndHoldPercent) }}</span>
                            <span class="vchip">Win {{ fmtPct(btResult.WinRate) }}</span>
                            <span class="vchip">Sharpe {{ fmtNum2(btResult.SharpeRatio) }}</span>
                            <span class="vchip" :class="btResult.BeatsBuyAndHold ? 'pos' : 'neg'">{{ btResult.BeatsBuyAndHold ? 'Beats Buy & Hold' : 'Trails Buy & Hold' }}</span>
                        </div>

                        <div class="tabs">
                            <button :class="{ active: btTab === 'overview' }" @click="setBtTab('overview')">Overview</button>
                            <button :class="{ active: btTab === 'charts' }" @click="setBtTab('charts')">Charts</button>
                            <button :class="{ active: btTab === 'trades' }" @click="setBtTab('trades')">Trades ({{ btResult.TotalTrades }})</button>
                            <button v-if="btValidation" :class="{ active: btTab === 'validation' }" @click="setBtTab('validation')">Validation</button>
                        </div>

                        <!-- OVERVIEW -->
                        <section v-show="btTab === 'overview'" class="report-section">
                            <h4>Returns</h4>
                            <div class="mini-grid">
                                <div class="mini"><span>Total PnL</span><strong class="num" :class="pnlClass(btResult.TotalPnL)">{{ fmtMoney(btResult.TotalPnL) }}</strong></div>
                                <div class="mini"><span>Total PnL %</span><strong class="num" :class="pnlClass(btResult.TotalPnLPercent)">{{ fmtSignedPct(btResult.TotalPnLPercent) }}</strong></div>
                                <div class="mini"><span>Annualized (CAGR)</span><strong class="num" :class="pnlClass(btResult.AnnualizedReturnPercent)">{{ fmtSignedPct(btResult.AnnualizedReturnPercent) }}</strong></div>
                                <div class="mini"><span>Buy &amp; Hold %</span><strong class="num" :class="pnlClass(btResult.BuyAndHoldPnLPercent)">{{ fmtSignedPct(btResult.BuyAndHoldPnLPercent) }}</strong></div>
                                <div class="mini"><span>Alpha vs B&amp;H</span><strong class="num" :class="pnlClass(btResult.AlphaVsBuyAndHoldPercent)">{{ fmtSignedPct(btResult.AlphaVsBuyAndHoldPercent) }}</strong></div>
                                <div class="mini"><span>Initial Equity</span><strong class="num">{{ fmtMoney(btResult.InitialEquity) }}</strong></div>
                                <div class="mini"><span>Final Equity</span><strong class="num">{{ fmtMoney(btResult.FinalEquity) }}</strong></div>
                            </div>
                            <h4>Risk</h4>
                            <div class="mini-grid">
                                <div class="mini"><span>Sharpe</span><strong class="num">{{ fmtNum2(btResult.SharpeRatio) }}</strong></div>
                                <div class="mini"><span>Sortino</span><strong class="num">{{ fmtNum2(btResult.SortinoRatio) }}</strong></div>
                                <div class="mini"><span>Calmar</span><strong class="num">{{ fmtNum2(btResult.CalmarRatio) }}</strong></div>
                                <div class="mini"><span>Volatility (ann.)</span><strong class="num">{{ fmtPct(btResult.AnnualizedVolatilityPercent) }}</strong></div>
                                <div class="mini"><span>Max Drawdown</span><strong class="num neg">{{ fmtPct(btResult.MaxDrawdownPercent) }}</strong></div>
                                <div class="mini"><span>Max DD (abs)</span><strong class="num neg">{{ fmtMoney(btResult.MaxDrawdown) }}</strong></div>
                                <div class="mini"><span>Max DD Duration</span><strong class="num">{{ fmtHours(btResult.MaxDrawdownDurationHours) }}</strong></div>
                                <div class="mini"><span>Recovery Factor</span><strong class="num">{{ fmtNum2(btResult.RecoveryFactor) }}</strong></div>
                            </div>
                            <h4>Trades</h4>
                            <div class="mini-grid">
                                <div class="mini"><span>Total Trades</span><strong>{{ btResult.TotalTrades }}</strong></div>
                                <div class="mini"><span>Win Rate</span><strong class="num">{{ fmtPct(btResult.WinRate) }}</strong></div>
                                <div class="mini"><span>Won / Lost</span><strong class="num">{{ btResult.WinningTrades }} / {{ btResult.LosingTrades }}</strong></div>
                                <div class="mini"><span>Profit Factor</span><strong class="num">{{ fmtNum2(btResult.ProfitFactor) }}</strong></div>
                                <div class="mini"><span>Expectancy</span><strong class="num" :class="pnlClass(btResult.Expectancy)">{{ fmtMoney(btResult.Expectancy) }}</strong></div>
                                <div class="mini"><span>Payoff Ratio</span><strong class="num">{{ fmtNum2(btResult.PayoffRatio) }}</strong></div>
                                <div class="mini"><span>Avg Win</span><strong class="num pos">{{ fmtMoney(btResult.AverageWin) }}</strong></div>
                                <div class="mini"><span>Avg Loss</span><strong class="num neg">{{ fmtMoney(btResult.AverageLoss) }}</strong></div>
                                <div class="mini"><span>Largest Win</span><strong class="num pos">{{ fmtMoney(btResult.LargestWin) }}</strong></div>
                                <div class="mini"><span>Largest Loss</span><strong class="num neg">{{ fmtMoney(btResult.LargestLoss) }}</strong></div>
                                <div class="mini"><span>Max Consec W / L</span><strong class="num">{{ btResult.MaxConsecutiveWins }} / {{ btResult.MaxConsecutiveLosses }}</strong></div>
                                <div class="mini"><span>Long / Short</span><strong class="num">{{ btResult.LongTrades }} / {{ btResult.ShortTrades }}</strong></div>
                                <div class="mini"><span>Long Win Rate</span><strong class="num">{{ fmtPct(btResult.LongWinRate) }}</strong></div>
                                <div class="mini"><span>Short Win Rate</span><strong class="num">{{ fmtPct(btResult.ShortWinRate) }}</strong></div>
                                <div class="mini"><span>Best / Worst Trade</span><strong class="num"><span class="pos">{{ fmtSignedPct(btResult.BestTradePercent) }}</span> / <span class="neg">{{ fmtSignedPct(btResult.WorstTradePercent) }}</span></strong></div>
                            </div>
                            <h4>Costs &amp; Timing</h4>
                            <div class="mini-grid">
                                <div class="mini"><span>Fees Paid</span><strong class="num">{{ fmtMoney(btResult.TotalFeesPaid) }}</strong></div>
                                <div class="mini"><span>Exposure (time in mkt)</span><strong class="num">{{ fmtPct(btResult.ExposurePercent) }}</strong></div>
                                <div class="mini"><span>Avg Trade Duration</span><strong class="num">{{ fmtHours(btResult.AverageTradeDurationHours) }}</strong></div>
                                <div class="mini"><span>Max Trade Duration</span><strong class="num">{{ fmtHours(btResult.MaxTradeDurationHours) }}</strong></div>
                                <div class="mini"><span>Avg Trade Return</span><strong class="num" :class="pnlClass(btResult.AverageTradeReturnPercent)">{{ fmtSignedPct(btResult.AverageTradeReturnPercent) }}</strong></div>
                                <div class="mini"><span>Candles</span><strong class="num">{{ btResult.TotalCandles }}</strong></div>
                            </div>
                        </section>

                        <!-- CHARTS -->
                        <section v-show="btTab === 'charts'" class="report-section">
                            <div class="chart-block">
                                <div class="curve-label">Equity vs Buy &amp; Hold</div>
                                <div class="chart-wrap"><canvas ref="equityCanvas"></canvas></div>
                            </div>
                            <div class="chart-block">
                                <div class="curve-label">Drawdown (underwater)</div>
                                <div class="chart-wrap"><canvas ref="drawdownCanvas"></canvas></div>
                            </div>
                            <div v-if="isPortfolioResult" class="chart-block">
                                <div class="curve-label">Gross Exposure vs Equity</div>
                                <div class="chart-wrap"><canvas ref="exposureCanvas"></canvas></div>
                            </div>
                            <div v-else class="chart-block">
                                <div class="curve-label tv-head">
                                    <span>Price &amp; Trade Markers <small v-if="!btHasCandles">· close line (re-run for candlesticks)</small></span>
                                    <button class="micro ghost" @click="fitPrice">Fit</button>
                                </div>
                                <div ref="priceContainer" class="chart-wrap tv"></div>
                            </div>
                        </section>

                        <!-- TRADES -->
                        <section v-show="btTab === 'trades'" class="report-section">
                            <div class="chart-block">
                                <div class="curve-label">Per-Trade PnL Distribution</div>
                                <div class="chart-wrap sm"><canvas ref="histCanvas"></canvas></div>
                            </div>
                            <div class="table-shell">
                                <table>
                                    <thead>
                                        <tr><th>#</th><th>Side</th><th>Entry</th><th>Exit</th><th class="r">Entry Px</th><th class="r">Exit Px</th><th class="r">Qty</th><th class="r">Fees</th><th class="r">PnL</th><th class="r">PnL %</th><th class="r">Duration</th><th>W/L</th></tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="(t, i) in btTradeRows" :key="i" :class="t.isWin ? 'row-win' : 'row-loss'">
                                            <td class="muted">{{ i + 1 }}</td>
                                            <td><span class="pill sm" :class="t.isShort ? 'sell' : 'buy'">{{ t.isShort ? 'Short' : 'Long' }}</span></td>
                                            <td class="muted">{{ fmtDate(t.entryTime) }}</td>
                                            <td class="muted">{{ fmtDate(t.exitTime) }}</td>
                                            <td class="r num">{{ fmtMoney(t.entryPrice) }}</td>
                                            <td class="r num">{{ fmtMoney(t.exitPrice) }}</td>
                                            <td class="r num">{{ fmtQty(t.qty) }}</td>
                                            <td class="r num">{{ fmtMoney(t.fees) }}</td>
                                            <td class="r num" :class="pnlClass(t.pnl)">{{ fmtMoney(t.pnl) }}</td>
                                            <td class="r num" :class="pnlClass(t.pnlPct)">{{ fmtSignedPct(t.pnlPct) }}</td>
                                            <td class="r muted">{{ t.duration }}</td>
                                            <td><span class="pill sm" :class="t.isWin ? 'ok' : 'danger'">{{ t.isWin ? 'W' : 'L' }}</span></td>
                                        </tr>
                                        <tr v-if="!btTradeRows.length"><td colspan="12" class="empty-cell">No trades were taken.</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <!-- VALIDATION (generic — any strategy that opted into RunValidation) -->
                        <section v-if="btValidation" v-show="btTab === 'validation'" class="report-section">
                            <h4>Walk-Forward (out-of-sample, swept params)</h4>
                            <div class="mini-grid">
                                <div class="mini"><span>OOS PnL %</span><strong class="num" :class="pnlClass(btValidation.WalkForwardOosPnLPercent)">{{ fmtSignedPct(btValidation.WalkForwardOosPnLPercent) }}</strong></div>
                                <div class="mini"><span>OOS Sharpe</span><strong class="num">{{ fmtNum2(btValidation.WalkForwardOosSharpe) }}</strong></div>
                                <div class="mini"><span>OOS Max DD</span><strong class="num neg">{{ fmtPct(btValidation.WalkForwardOosMaxDrawdownPercent) }}</strong></div>
                                <div class="mini"><span>Folds</span><strong class="num">{{ btValidation.WalkForwardFolds }}</strong></div>
                            </div>
                            <h4>Deflated Sharpe (selection-bias adjusted)</h4>
                            <div class="mini-grid">
                                <div class="mini"><span>Deflated Sharpe</span><strong class="num" :class="num(btValidation.DeflatedSharpe) >= 0.95 ? 'pos' : (num(btValidation.DeflatedSharpe) >= 0.5 ? '' : 'neg')">{{ fmtNum2(btValidation.DeflatedSharpe) }}</strong></div>
                                <div class="mini"><span>Expected Max Sharpe</span><strong class="num">{{ fmtNum2(btValidation.ExpectedMaxSharpe) }}</strong></div>
                                <div class="mini"><span>Trials Tested</span><strong class="num">{{ btValidation.TrialsTested }}</strong></div>
                            </div>
                            <h4>Gross vs Net</h4>
                            <div class="mini-grid">
                                <div class="mini"><span>Gross PnL %</span><strong class="num" :class="pnlClass(btValidation.GrossPnLPercent)">{{ fmtSignedPct(btValidation.GrossPnLPercent) }}</strong></div>
                                <div class="mini"><span>Net PnL %</span><strong class="num" :class="pnlClass(btValidation.NetPnLPercent)">{{ fmtSignedPct(btValidation.NetPnLPercent) }}</strong></div>
                            </div>
                            <h4>Cost Sensitivity</h4>
                            <div class="chart-block"><div class="chart-wrap sm"><canvas ref="costCanvas"></canvas></div></div>
                            <div class="table-shell short">
                                <table>
                                    <thead><tr><th>Cost ×</th><th class="r">Net PnL %</th><th class="r">Sharpe</th><th class="r">Max DD</th><th class="r">Fees</th></tr></thead>
                                    <tbody>
                                        <tr v-for="(r, i) in (btValidation.CostSensitivity || [])" :key="i">
                                            <td class="strong">{{ fmtNum2(r.Multiplier) }}×</td>
                                            <td class="r num" :class="pnlClass(r.NetPnLPercent)">{{ fmtSignedPct(r.NetPnLPercent) }}</td>
                                            <td class="r num">{{ fmtNum2(r.SharpeRatio) }}</td>
                                            <td class="r num neg">{{ fmtPct(r.MaxDrawdownPercent) }}</td>
                                            <td class="r num">{{ fmtMoney(r.TotalFees) }}</td>
                                        </tr>
                                        <tr v-if="!(btValidation.CostSensitivity || []).length"><td colspan="5" class="empty-cell">—</td></tr>
                                    </tbody>
                                </table>
                            </div>
                            <h4>Turnover</h4>
                            <div class="mini-grid">
                                <div class="mini"><span>Weekly Turnover</span><strong class="num">{{ fmtNum2(btValidation.WeeklyTurnover) }}×</strong></div>
                                <div class="mini"><span>Annual Turnover</span><strong class="num">{{ fmtNum2(btValidation.AnnualTurnover) }}×</strong></div>
                            </div>
                            <div v-for="(n, i) in (btValidation.Notes || [])" :key="i" class="ot-error sm">{{ n }}</div>
                        </section>

                    </template>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';
import Chart from 'chart.js/auto';

definePageMeta({ layout: 'navbar' });

const API = '/api/omnitrader';
const router = useRouter();

interface OmniStatus { Service: string; DbPath: string; DeployedCount: number; ActiveDeploymentIds: string[]; Uptime: string; KrakenConfigured: boolean; }
interface ParamDescriptor { Name: string; Label: string; Type: string; Default: any; Min?: number | null; Max?: number | null; Step?: number | null; Group: string; Help?: string | null; Options?: string[] | null; }
interface StrategyMeta { Name: string; ClassName: string; Description: string; RequiresUniverse?: boolean; Parameters?: ParamDescriptor[]; }
interface Deployment {
    Id: string; StrategyClass: string; Symbol: string; Interval: string; Mode: string; Status: string;
    Armed: boolean; EquityInitial: number; EquityCurrent: number; PnLPercent: number; CreatedUtc: string; Error?: string;
}
interface BacktestJob {
    Id: string; StrategyClass: string; Coin: string; Currency: string; Interval: string; CandleCount: number;
    Status: string; ProgressPct: number; CandlesTotal?: number; CandlesDone?: number; Result?: any;
    TotalPnLPercent?: number | null; WinRate?: number | null; SharpeRatio?: number | null;
    MaxDrawdownPercent?: number | null; TotalTrades?: number | null;
}
interface TradeRow {
    isShort: boolean; isWin: boolean; entryTime: string; exitTime: string;
    entryPrice: number; exitPrice: number; qty: number; fees: number; pnl: number; pnlPct: number; duration: string;
}
interface EquityPoint { Ts: string; MarkPrice: number; QuoteBalance: number; BaseBalance: number; Equity: number; }

const intervals = [
    { value: 'OneMinute', label: '1m' }, { value: 'FiveMinute', label: '5m' },
    { value: 'FifteenMinute', label: '15m' }, { value: 'ThirtyMinute', label: '30m' },
    { value: 'OneHour', label: '1h' }, { value: 'FourHour', label: '4h' },
    { value: 'OneDay', label: '1d' }, { value: 'OneWeek', label: '1w' },
];

const initialLoading = ref(true);
const refreshing = ref(false);
const creatingDeployment = ref(false);
const creatingBacktest = ref(false);
const busyId = ref('');
const globalError = ref('');
const lastRefresh = ref('never');

const status = ref<OmniStatus | null>(null);
const strategies = ref<StrategyMeta[]>([]);
const deployments = ref<Deployment[]>([]);
const backtests = ref<BacktestJob[]>([]);

const detailOpen = ref(false);
const loadingDetail = ref(false);
const detail = ref<any>(null);
const equitySeries = ref<EquityPoint[]>([]);

const btDetailOpen = ref(false);
const loadingBtDetail = ref(false);
const btDetail = ref<any>(null);
const btTab = ref<'overview' | 'charts' | 'trades' | 'validation'>('overview');

const equityCanvas = ref<HTMLCanvasElement | null>(null);
const drawdownCanvas = ref<HTMLCanvasElement | null>(null);
const histCanvas = ref<HTMLCanvasElement | null>(null);
const exposureCanvas = ref<HTMLCanvasElement | null>(null);
const costCanvas = ref<HTMLCanvasElement | null>(null);
let exposureChart: Chart | null = null;
let costChart: Chart | null = null;
const priceContainer = ref<HTMLDivElement | null>(null);
let equityChart: Chart | null = null;
let drawdownChart: Chart | null = null;
let histChart: Chart | null = null;
// lightweight-charts (TradingView) instance for the price/candlestick chart
let priceTvChart: any = null;

// Live candlestick chart for the deployment detail modal (streams via pollLight).
const dpPriceContainer = ref<HTMLDivElement | null>(null);
const dpChartData = ref<any>(null);
let dpChart: any = null;
let dpSeries: any = null;

// Overview charts (top of page) — visual summary across all deployments.
const pnlByDeployCanvas = ref<HTMLCanvasElement | null>(null);
const allocCanvas = ref<HTMLCanvasElement | null>(null);
const krakenCanvas = ref<HTMLCanvasElement | null>(null);
const krakenEmpty = ref(false);
let pnlByDeployChart: Chart | null = null;
let allocChart: Chart | null = null;
let krakenChart: Chart | null = null;
const backtestPerfCanvas = ref<HTMLCanvasElement | null>(null);
let backtestPerfChart: Chart | null = null;
const chartPalette = ['#62ce47', '#34d399', '#22d3ee', '#0ea5e9', '#a78bfa', '#f59e0b', '#ec4899', '#84cc16', '#fb923c', '#60a5fa'];

const deployForm = reactive({
    strategyClass: '', symbol: 'BTCUSDT', interval: 'OneHour', mode: 'Paper',
    initialQuote: 10000, initialBase: 0, feeFraction: 0.001, slippageFraction: 0.0005, leverage: 1,
    maxPositionQuoteUsd: 100, maxDailyLossUsd: 50, maxOrdersPerHour: 30, allowedSymbols: '',
});
const backtestForm = reactive({
    strategyClass: '', coin: 'BTC', currency: 'USD', interval: 'OneHour', candleCount: 500,
    initialQuote: 10000, initialBase: 0, feeFraction: 0.001, slippageFraction: 0.0005, leverage: 1,
    runValidation: false, valInSample: 180, valOos: 60, valWarmup: 30,
});

let pollTimer: ReturnType<typeof setInterval> | null = null;
let dpTickTimer: ReturnType<typeof setInterval> | null = null;

// ---- computed ----
const isOnline = computed(() => (status.value?.Service || '').toLowerCase() === 'omnitrader');
const runningBacktests = computed(() => backtests.value.filter(b => b.Status === 'Running' || b.Status === 'Queued').length);

const selectedBacktestStrategy = computed(() => strategies.value.find(s => s.ClassName === backtestForm.strategyClass));
const selectedDeployStrategy = computed(() => strategies.value.find(s => s.ClassName === deployForm.strategyClass));

// ---- dynamic strategy parameters (schema-driven forms) ----
const backtestParams = reactive<Record<string, any>>({});
const deployParams = reactive<Record<string, any>>({});

function groupParams(meta: StrategyMeta | undefined): Record<string, ParamDescriptor[]> {
    const out: Record<string, ParamDescriptor[]> = {};
    for (const p of (meta?.Parameters ?? [])) (out[p.Group] ||= []).push(p);
    return out;
}
const backtestParamGroups = computed(() => groupParams(selectedBacktestStrategy.value));
const deployParamGroups = computed(() => groupParams(selectedDeployStrategy.value));

function resetParams(target: Record<string, any>, meta: StrategyMeta | undefined) {
    for (const k of Object.keys(target)) delete target[k];
    for (const p of (meta?.Parameters ?? [])) target[p.Name] = p.Default;
}
watch(selectedBacktestStrategy, (m) => resetParams(backtestParams, m));
watch(selectedDeployStrategy, (m) => resetParams(deployParams, m));

// Paper vs Live split
const paperDeployments = computed(() => deployments.value.filter(d => d.Mode === 'Paper'));
const liveDeployments  = computed(() => deployments.value.filter(d => d.Mode === 'Live'));

const paperRunning = computed(() => paperDeployments.value.filter(d => d.Status === 'Running').length);
const liveRunning  = computed(() => liveDeployments.value.filter(d => d.Status === 'Running').length);

const paperEquity  = computed(() => paperDeployments.value.reduce((s, d) => s + num(d.EquityCurrent), 0));
const liveEquity   = computed(() => liveDeployments.value.reduce((s, d) => s + num(d.EquityCurrent), 0));

const paperInitial = computed(() => paperDeployments.value.reduce((s, d) => s + num(d.EquityInitial), 0));
const liveInitial  = computed(() => liveDeployments.value.reduce((s, d) => s + num(d.EquityInitial), 0));

const paperPnL = computed(() => paperInitial.value === 0 ? 0 : (paperEquity.value - paperInitial.value) / paperInitial.value * 100);
const livePnL  = computed(() => liveInitial.value === 0 ? 0 : (liveEquity.value - liveInitial.value) / liveInitial.value * 100);

const liveArmedCount  = computed(() => liveDeployments.value.filter(d => d.Armed).length);
const livePausedCount = computed(() => liveDeployments.value.filter(d => !d.Armed && d.Status !== 'Stopped' && d.Status !== 'Errored').length);

// Paper avg win rate (from recent backtest jobs, as a proxy when no direct per-deployment metric is available)
const paperAvgWinRate = computed(() => {
    const winRates = backtests.value
        .filter(b => b.Status === 'Succeeded' && b.WinRate != null)
        .map(b => num(b.WinRate));
    return winRates.length === 0 ? 0 : winRates.reduce((s, v) => s + v, 0) / winRates.length;
});
const equityPolyline = computed(() => buildSpark(equitySeries.value.map(p => num(p.Equity))));
const btResult = computed<any>(() => btDetail.value?.Result ?? null);
// Generic validation report (any strategy that opted in via RunValidation); null otherwise.
const btValidation = computed<any>(() => btResult.value?.Validation ?? null);
// Multi-asset (universe) results have per-symbol trades that shouldn't be crammed onto one price line,
// so we show portfolio visuals instead. Detected generically from the strategy's declared shape.
const isPortfolioResult = computed<boolean>(() =>
    !!strategies.value.find(s => s.ClassName === btDetail.value?.StrategyClass)?.RequiresUniverse);
const btEquitySeries = computed<EquityPoint[]>(() => Array.isArray(btResult.value?.EquityCurve) ? btResult.value.EquityCurve : []);
const btHasCandles = computed<boolean>(() => Array.isArray(btResult.value?.Candles) && btResult.value.Candles.length > 0);
const btTradeRows = computed<TradeRow[]>(() => {
    const trades = btResult.value?.Trades;
    if (!Array.isArray(trades)) return [];
    return trades.map((t: any): TradeRow => {
        const cost = num(t.EntryPrice) * num(t.Qty);
        const pnl = num(t.RealizedPnL);
        return {
            isShort: !!t.IsShort, isWin: !!t.IsWin,
            entryTime: t.EntryTime, exitTime: t.ExitTime,
            entryPrice: num(t.EntryPrice), exitPrice: num(t.ExitPrice),
            qty: num(t.Qty), fees: num(t.Fees), pnl,
            pnlPct: cost === 0 ? 0 : pnl / cost * 100,
            duration: fmtDuration(new Date(t.ExitTime).getTime() - new Date(t.EntryTime).getTime()),
        };
    });
});

// ---- helpers ----
function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function fmtMoney(v: unknown): string { return num(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtQty(v: unknown): string { return num(v).toLocaleString(undefined, { maximumFractionDigits: 8 }); }
function fmtNum2(v: unknown): string { return num(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtPct(v: unknown): string { return `${num(v).toFixed(2)}%`; }
function fmtSignedPct(v: unknown): string { const n = num(v); return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`; }
function fmtDate(v: unknown): string { if (!v || typeof v !== 'string') return '—'; const d = new Date(v); return isNaN(d.getTime()) ? '—' : d.toLocaleString(); }
function shortId(v: string): string { return v && v.length > 12 ? `${v.slice(0, 6)}…${v.slice(-4)}` : (v || ''); }
function shortUptime(v: string): string { return (v || '').split('.')[0]; }
function fmtDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return '—';
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60), remMin = mins % 60;
    if (hours < 24) return remMin ? `${hours}h ${remMin}m` : `${hours}h`;
    const days = Math.floor(hours / 24), remH = hours % 24;
    return remH ? `${days}d ${remH}h` : `${days}d`;
}
function fmtHours(h: unknown): string { return fmtDuration(num(h) * 3600000); }
function intervalLabel(v: unknown): string {
    const map: Record<string, string> = {
        OneMinute: '1m', FiveMinute: '5m', FifteenMinute: '15m', ThirtyMinute: '30m', OneHour: '1h', FourHour: '4h', OneDay: '1d', OneWeek: '1w',
        '1': '1m', '5': '5m', '15': '15m', '30': '30m', '60': '1h', '240': '4h', '1440': '1d', '10080': '1w',
    };
    return map[String(v)] || String(v ?? '—');
}
function statusClass(s: string): string { return ({ Running: 'ok', Paused: 'warn', Stopped: 'off', Errored: 'danger' } as Record<string, string>)[s] || 'off'; }
function btStatusClass(s: string): string { return ({ Succeeded: 'ok', Running: 'cyan', Queued: 'warn', Failed: 'danger', Cancelled: 'off' } as Record<string, string>)[s] || 'off'; }
function orderStatusClass(s: string): string { return s === 'Filled' ? 'ok' : (s === 'Rejected' || s === 'Cancelled' ? 'danger' : 'warn'); }
function pnlClass(v: unknown): string { return num(v) >= 0 ? 'pos' : 'neg'; }
function barWidth(b: BacktestJob): string {
    if (b.Status === 'Succeeded') return '100%';
    return `${Math.max(2, Math.min(100, Math.round(num(b.ProgressPct))))}%`;
}
function buildSpark(values: number[]): string {
    if (values.length < 2) return '';
    const w = 300, h = 70, pad = 4;
    const min = Math.min(...values), max = Math.max(...values), range = (max - min) || 1;
    const step = (w - pad * 2) / (values.length - 1);
    return values.map((v, i) => {
        const x = pad + i * step;
        const y = h - pad - ((v - min) / range) * (h - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
}

// ---- action gating ----
function canArm(d: Deployment): boolean { return d.Mode === 'Live' && !d.Armed && d.Status !== 'Stopped'; }
function canPause(d: Deployment): boolean { return (d.Mode === 'Paper' && d.Status === 'Running') || (d.Mode === 'Live' && d.Armed); }
function canResume(d: Deployment): boolean { return d.Mode === 'Paper' && d.Status === 'Paused'; }

// ---- api ----
async function parsePayload(res: Response): Promise<any> {
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
}
function messageOf(payload: any, statusCode: number): string {
    if (payload && typeof payload === 'object') {
        const m = payload.Error ?? payload.error ?? payload.Message ?? payload.message;
        if (typeof m === 'string') return m;
    }
    if (typeof payload === 'string' && payload) return payload;
    return `Request failed (${statusCode})`;
}
async function apiGet<T>(path: string): Promise<T> {
    const res = await RequestGETFromKliveAPI(API + path, false, false);
    const payload = await parsePayload(res);
    if (!res.ok) throw new Error(messageOf(payload, res.status));
    return payload as T;
}
async function apiPost<T>(path: string, body: unknown = null, isJson = false): Promise<T> {
    const res = await RequestPOSTFromKliveAPI(API + path, isJson ? JSON.stringify(body) : '', false, isJson);
    const payload = await parsePayload(res);
    if (!res.ok) throw new Error(messageOf(payload, res.status));
    return payload as T;
}
function qs(params: Record<string, string | number | undefined | null>): string {
    const q = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
    return q ? `?${q}` : '';
}

const ok = (title: string, text = '') => Swal.fire({ icon: 'success', title, text, timer: 1800, showConfirmButton: false, background: '#161616', color: '#fff' });
const fail = (title: string, text = '') => Swal.fire({ icon: 'error', title, text, confirmButtonColor: '#4d9e39', background: '#161616', color: '#fff' });

// ---- fetchers ----
async function fetchStatus() { status.value = await apiGet<OmniStatus>('/status'); }
async function fetchStrategies() { const d = await apiGet<StrategyMeta[]>('/strategies'); strategies.value = Array.isArray(d) ? d : []; }
async function fetchDeployments() { const d = await apiGet<Deployment[]>('/deployments'); deployments.value = Array.isArray(d) ? d : []; }
async function fetchBacktests() { const d = await apiGet<BacktestJob[]>('/backtests'); backtests.value = Array.isArray(d) ? d : []; }

async function refreshAll() {
    refreshing.value = true;
    globalError.value = '';
    const results = await Promise.allSettled([fetchStatus(), fetchStrategies(), fetchDeployments(), fetchBacktests()]);
    const errs = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
    if (errs.length) globalError.value = errs.map(e => String(e.reason?.message ?? e.reason)).join(' · ');
    if (!deployForm.strategyClass && strategies.value.length) deployForm.strategyClass = strategies.value[0].ClassName;
    if (!backtestForm.strategyClass && strategies.value.length) backtestForm.strategyClass = strategies.value[0].ClassName;
    lastRefresh.value = new Date().toLocaleTimeString();
    refreshing.value = false;
    initialLoading.value = false;
}
async function pollLight() {
    await Promise.allSettled([fetchStatus(), fetchDeployments(), fetchBacktests()]);
    lastRefresh.value = new Date().toLocaleTimeString();
    if (detailOpen.value && detail.value?.Deployment?.Id) {
        const id = detail.value.Deployment.Id;
        await loadDetailData(id);
        await loadDeploymentChart(id);
    }
}

// ---- deploy ----
function prefillDeploy(cls: string) { deployForm.strategyClass = cls; document.querySelector('.deploy-cols')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
function prefillBacktest(cls: string) { backtestForm.strategyClass = cls; document.querySelector('.backtest-cols')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

async function createDeployment() {
    if (!deployForm.strategyClass) return;
    creatingDeployment.value = true;
    try {
        const body: Record<string, unknown> = {
            StrategyClass: deployForm.strategyClass,
            Symbol: deployForm.symbol,
            Interval: deployForm.interval,
            Mode: deployForm.mode,
            InitialQuoteBalance: deployForm.initialQuote,
            InitialBaseBalance: deployForm.initialBase,
            FeeFraction: deployForm.feeFraction,
            SlippageFraction: deployForm.slippageFraction,
            Leverage: deployForm.leverage,
            Parameters: { ...deployParams },
        };
        if (deployForm.mode === 'Live') {
            body.MaxPositionQuoteUsd = deployForm.maxPositionQuoteUsd;
            body.MaxDailyLossUsd = deployForm.maxDailyLossUsd;
            body.MaxOrdersPerHour = deployForm.maxOrdersPerHour;
            const syms = deployForm.allowedSymbols.split(',').map(s => s.trim()).filter(Boolean);
            if (syms.length) body.AllowedSymbols = syms;
        }
        const res = await apiPost<{ Id: string; Mode: string }>('/deployment/create', body, true);
        await ok('Deployment created', deployForm.mode === 'Live' ? 'Live session created paused — arm it to trade.' : 'Paper session running.');
        await fetchDeployments();
        await fetchStatus();
        if (res?.Id) openDeployment(res.Id);
    } catch (e) {
        fail('Deploy failed', e instanceof Error ? e.message : String(e));
    } finally {
        creatingDeployment.value = false;
    }
}

async function armLive(d: Deployment) {
    const confirm = await Swal.fire({
        icon: 'warning', title: 'Arm live trading?',
        html: `<b>${d.StrategyClass}</b> on <b>${d.Symbol}</b> will place <b>real orders</b> on Kraken under its risk caps.`,
        showCancelButton: true, confirmButtonText: 'Arm', cancelButtonText: 'Cancel',
        confirmButtonColor: '#f59e0b', background: '#161616', color: '#fff',
    });
    if (!confirm.isConfirmed) return;
    busyId.value = d.Id;
    try {
        await apiPost(`/deployment/arm-live${qs({ id: d.Id, confirm: d.Id })}`);
        await ok('Armed', `${d.Symbol} is now live.`);
        await fetchDeployments();
    } catch (e) { fail('Arm failed', e instanceof Error ? e.message : String(e)); }
    finally { busyId.value = ''; }
}
async function pauseDeployment(d: Deployment) {
    busyId.value = d.Id;
    try { await apiPost(`/deployment/pause${qs({ id: d.Id })}`); await fetchDeployments(); }
    catch (e) { fail('Pause failed', e instanceof Error ? e.message : String(e)); }
    finally { busyId.value = ''; }
}
async function resumeDeployment(d: Deployment) {
    busyId.value = d.Id;
    try { await apiPost(`/deployment/resume${qs({ id: d.Id })}`); await fetchDeployments(); }
    catch (e) { fail('Resume failed', e instanceof Error ? e.message : String(e)); }
    finally { busyId.value = ''; }
}
async function killDeployment(d: Deployment) {
    const c = await Swal.fire({ icon: 'warning', title: 'Kill deployment?', text: 'Stops the session and flattens any live position.', showCancelButton: true, confirmButtonText: 'Kill', confirmButtonColor: '#ef4444', background: '#161616', color: '#fff' });
    if (!c.isConfirmed) return;
    busyId.value = d.Id;
    try { await apiPost(`/deployment/kill${qs({ id: d.Id })}`); await fetchDeployments(); await fetchStatus(); }
    catch (e) { fail('Kill failed', e instanceof Error ? e.message : String(e)); }
    finally { busyId.value = ''; }
}
async function deleteDeployment(d: Deployment) {
    const c = await Swal.fire({ icon: 'warning', title: 'Delete deployment?', text: 'Removes it and its records permanently.', showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#ef4444', background: '#161616', color: '#fff' });
    if (!c.isConfirmed) return;
    busyId.value = d.Id;
    try {
        await apiPost(`/deployment/delete${qs({ id: d.Id })}`);
        if (detail.value?.Deployment?.Id === d.Id) closeDeployment();
        await fetchDeployments(); await fetchStatus();
    } catch (e) { fail('Delete failed', e instanceof Error ? e.message : String(e)); }
    finally { busyId.value = ''; }
}

// ---- deployment detail ----
async function loadDetailData(id: string) {
    const [d, eq] = await Promise.allSettled([
        apiGet<any>(`/deployment${qs({ id })}`),
        apiGet<EquityPoint[]>(`/deployment/equity${qs({ id })}`),
    ]);
    if (d.status === 'fulfilled') detail.value = d.value;
    if (eq.status === 'fulfilled' && Array.isArray(eq.value)) equitySeries.value = eq.value;
}
async function openDeployment(id: string) {
    detailOpen.value = true;
    loadingDetail.value = true;
    detail.value = null;
    equitySeries.value = [];
    dpChartData.value = null;
    try { await loadDetailData(id); }
    catch (e) { fail('Detail failed', e instanceof Error ? e.message : String(e)); }
    finally { loadingDetail.value = false; }
    await loadDeploymentChart(id); // container now rendered; builds the live chart
    // Fast live-tick poll so the price moves between closed candles.
    if (dpTickTimer) clearInterval(dpTickTimer);
    dpTickTimer = setInterval(pollDpTick, 3000);
}
function closeDeployment() {
    if (dpTickTimer) { clearInterval(dpTickTimer); dpTickTimer = null; }
    detailOpen.value = false; detail.value = null; equitySeries.value = []; destroyDeploymentChart();
}

// Update the forming candle live (lightweight-charts series.update upserts the latest bar).
async function pollDpTick() {
    const id = detail.value?.Deployment?.Id;
    if (!detailOpen.value || !id || !dpSeries) return;
    try {
        const t = await apiGet<any>(`/deployment/ticks${qs({ id })}`);
        const f = t?.Forming;
        if (f && f.Timestamp) {
            // Never land before the series' last bar (update() requires time >= last). If the forming
            // bucket reads slightly behind — clock/bucket skew or a just-closed bar — snap it onto the
            // rightmost bar so the live price still moves instead of being silently dropped.
            const time = Math.max(toUnixSec(f.Timestamp), dpLastBarTime);
            dpSeries.update({ time, open: num(f.Open), high: num(f.High), low: num(f.Low), close: num(f.Close) });
            dpLastBarTime = time;
        }
    } catch { /* transient */ }
}

// ---- backtest ----
async function createBacktest() {
    if (!backtestForm.strategyClass) return;
    creatingBacktest.value = true;
    try {
        const body: Record<string, unknown> = {
            StrategyClass: backtestForm.strategyClass,
            Coin: backtestForm.coin,
            Currency: backtestForm.currency,
            Interval: backtestForm.interval,
            CandleCount: backtestForm.candleCount,
            InitialQuoteBalance: backtestForm.initialQuote,
            InitialBaseBalance: backtestForm.initialBase,
            FeeFraction: backtestForm.feeFraction,
            SlippageFraction: backtestForm.slippageFraction,
            Leverage: backtestForm.leverage,
            Parameters: { ...backtestParams },
        };
        if (backtestForm.runValidation && selectedBacktestStrategy.value?.RequiresUniverse) {
            body.Validation = {
                InSampleBars: backtestForm.valInSample,
                OosBars: backtestForm.valOos,
                WarmupBars: backtestForm.valWarmup,
            };
        }
        await apiPost<{ JobId: string }>('/backtest/create', body, true);
        await ok('Backtest queued', 'It will run in the background — watch the jobs table.');
        await fetchBacktests();
    } catch (e) { fail('Backtest failed', e instanceof Error ? e.message : String(e)); }
    finally { creatingBacktest.value = false; }
}
async function cancelBacktest(b: BacktestJob) {
    try { await apiPost(`/backtest/cancel${qs({ id: b.Id })}`); await fetchBacktests(); }
    catch (e) { fail('Cancel failed', e instanceof Error ? e.message : String(e)); }
}
async function openBacktest(id: string) {
    btDetailOpen.value = true;
    loadingBtDetail.value = true;
    btDetail.value = null;
    btTab.value = 'overview';
    destroyCharts();
    try { btDetail.value = await apiGet<any>(`/backtest${qs({ id })}`); }
    catch (e) { fail('Backtest detail failed', e instanceof Error ? e.message : String(e)); }
    finally { loadingBtDetail.value = false; }
}
function closeBacktest() { destroyCharts(); btDetailOpen.value = false; btDetail.value = null; btTab.value = 'overview'; }

// ---- backtest charts (Chart.js) ----
const chartFont = { color: '#8a958a', font: { size: 10 } };
function darkScales(yTitle = '') {
    return {
        x: { ticks: { ...chartFont, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: chartFont, grid: { color: 'rgba(255,255,255,0.05)' }, title: yTitle ? { display: true, text: yTitle, color: '#8a958a' } : undefined },
    };
}
const legendOpts = { labels: { color: '#cdd8c9', boxWidth: 12, font: { size: 11 } } };

function destroyCharts() {
    equityChart?.destroy(); equityChart = null;
    drawdownChart?.destroy(); drawdownChart = null;
    histChart?.destroy(); histChart = null;
    exposureChart?.destroy(); exposureChart = null;
    costChart?.destroy(); costChart = null;
    if (priceTvChart) { try { priceTvChart.remove(); } catch { /* already disposed */ } priceTvChart = null; }
}

function setBtTab(tab: 'overview' | 'charts' | 'trades' | 'validation') {
    btTab.value = tab;
    nextTick(() => {
        if (tab === 'charts') {
            buildEquityChart(); buildDrawdownChart();
            if (isPortfolioResult.value) buildExposureChart(); else buildPriceChart();
        }
        else if (tab === 'trades') { buildHistChart(); }
        else if (tab === 'validation') { buildCostChart(); }
    });
}

// Cost-sensitivity bars (net PnL% at each cost multiplier) in the validation tab.
function buildCostChart() {
    costChart?.destroy(); costChart = null;
    const rows = btValidation.value?.CostSensitivity;
    if (!costCanvas.value || !Array.isArray(rows) || rows.length === 0) return;
    costChart = new Chart(costCanvas.value, {
        type: 'bar',
        data: {
            labels: rows.map((r: any) => `${fmtNum2(r.Multiplier)}×`),
            datasets: [{
                label: 'Net PnL %', data: rows.map((r: any) => num(r.NetPnLPercent)),
                backgroundColor: rows.map((r: any) => num(r.NetPnLPercent) >= 0 ? 'rgba(98,206,71,0.7)' : 'rgba(239,68,68,0.7)'),
            }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: darkScales('Net PnL %') },
    });
}

// Portfolio gross exposure over time (EquityPoint.BaseBalance carries gross notional for portfolio runs).
function buildExposureChart() {
    exposureChart?.destroy(); exposureChart = null;
    const pts = btEquitySeries.value;
    if (!exposureCanvas.value || pts.length < 2) return;
    const gross = pts.map(p => num(p.BaseBalance));
    const equity = pts.map(p => num(p.Equity));
    exposureChart = new Chart(exposureCanvas.value, {
        type: 'line',
        data: {
            labels: chartLabels(),
            datasets: [
                { label: 'Gross Exposure', data: gross, borderColor: '#ffc247', backgroundColor: 'rgba(255,194,71,0.12)', fill: true, pointRadius: 0, borderWidth: 1.6, tension: 0.1 },
                { label: 'Equity', data: equity, borderColor: '#62ce47', backgroundColor: 'transparent', fill: false, pointRadius: 0, borderWidth: 1.4, tension: 0.1 },
            ],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: legendOpts }, scales: darkScales('USD') },
    });
}

function fitPrice() { try { priceTvChart?.timeScale().fitContent(); } catch { /* not ready */ } }

function chartLabels(): string[] {
    return btEquitySeries.value.map(p => {
        const d = new Date(p.Ts);
        return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    });
}
function buildEquityChart() {
    equityChart?.destroy(); equityChart = null;
    const pts = btEquitySeries.value;
    if (!equityCanvas.value || pts.length < 2) return;
    const initial = num(btResult.value?.InitialEquity) || num(pts[0].Equity);
    const firstPrice = num(pts[0].MarkPrice) || 1;
    const equity = pts.map(p => num(p.Equity));
    const buyHold = pts.map(p => initial * (num(p.MarkPrice) / firstPrice));
    equityChart = new Chart(equityCanvas.value, {
        type: 'line',
        data: {
            labels: chartLabels(),
            datasets: [
                { label: 'Strategy', data: equity, borderColor: '#62ce47', backgroundColor: 'rgba(98,206,71,0.12)', fill: true, pointRadius: 0, borderWidth: 1.8, tension: 0.1 },
                { label: 'Buy & Hold', data: buyHold, borderColor: '#5fa8ff', backgroundColor: 'transparent', fill: false, pointRadius: 0, borderWidth: 1.4, borderDash: [5, 4], tension: 0.1 },
            ],
        },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: legendOpts }, scales: darkScales('Equity') },
    });
}

function buildDrawdownChart() {
    drawdownChart?.destroy(); drawdownChart = null;
    const pts = btEquitySeries.value;
    if (!drawdownCanvas.value || pts.length < 2) return;
    let peak = num(pts[0].Equity);
    const dd = pts.map(p => {
        const eq = num(p.Equity);
        if (eq > peak) peak = eq;
        return peak > 0 ? -((peak - eq) / peak * 100) : 0;
    });
    drawdownChart = new Chart(drawdownCanvas.value, {
        type: 'line',
        data: { labels: chartLabels(), datasets: [{ label: 'Drawdown %', data: dd, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.18)', fill: true, pointRadius: 0, borderWidth: 1.4, tension: 0.1 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: darkScales('% from peak') },
    });
}

// Strictly-ascending unique time series (lightweight-charts rejects equal/out-of-order times).
function dedupeByTime<T extends { time: number }>(rows: T[]): T[] {
    const out: T[] = [];
    let last = -Infinity;
    for (const r of rows) {
        if (r.time > last) { out.push(r); last = r.time; }
    }
    return out;
}
function setTradeMarkers(series: any, candleTimes: number[]) {
    const trades = btResult.value?.Trades;
    if (!Array.isArray(trades) || !candleTimes.length) return;
    const snap = (ms: number): number => {
        const t = Math.floor(ms / 1000);
        let best = candleTimes[0], bestDiff = Math.abs(candleTimes[0] - t);
        for (const ct of candleTimes) { const d = Math.abs(ct - t); if (d < bestDiff) { bestDiff = d; best = ct; } }
        return best;
    };
    const markers: any[] = [];
    for (const tr of trades) {
        markers.push({ time: snap(new Date(tr.EntryTime).getTime()), position: 'belowBar', color: '#ffc247', shape: 'arrowUp', text: tr.IsShort ? 'Short' : 'Long' });
        markers.push({ time: snap(new Date(tr.ExitTime).getTime()), position: 'aboveBar', color: tr.IsWin ? '#62ce47' : '#ef4444', shape: 'arrowDown', text: 'Exit' });
    }
    markers.sort((a, b) => a.time - b.time);
    series.setMarkers(markers);
}

// TradingView-style candlestick chart (lightweight-charts) with built-in drag-pan + wheel-zoom.
// Dynamically imported so it never runs during SSR.
async function buildPriceChart() {
    if (priceTvChart) { try { priceTvChart.remove(); } catch { /* disposed */ } priceTvChart = null; }
    const container = priceContainer.value;
    if (!container) return;

    const lc = await import('lightweight-charts');
    // The async chunk may resolve after the user navigated away.
    if (!btDetailOpen.value || btTab.value !== 'charts' || priceContainer.value !== container) return;

    const chart = lc.createChart(container, {
        autoSize: true,
        layout: { background: { type: lc.ColorType.Solid, color: 'transparent' }, textColor: '#8a958a', fontSize: 11 },
        grid: { vertLines: { color: 'rgba(255,255,255,0.05)' }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
        rightPriceScale: { borderColor: 'rgba(255,255,255,0.12)' },
        timeScale: { borderColor: 'rgba(255,255,255,0.12)', timeVisible: true, secondsVisible: false },
        crosshair: { mode: lc.CrosshairMode.Normal },
    });
    priceTvChart = chart;

    const candles = btResult.value?.Candles;
    if (Array.isArray(candles) && candles.length) {
        const data = dedupeByTime(candles.map((c: any) => ({
            time: Math.floor(new Date(c.Timestamp).getTime() / 1000),
            open: num(c.Open), high: num(c.High), low: num(c.Low), close: num(c.Close),
        })));
        const series = chart.addCandlestickSeries({
            upColor: '#62ce47', downColor: '#ef4444',
            borderUpColor: '#62ce47', borderDownColor: '#ef4444',
            wickUpColor: '#62ce47', wickDownColor: '#ef4444',
        });
        series.setData(data as any);
        setTradeMarkers(series, data.map(d => d.time));
    } else {
        const data = dedupeByTime(btEquitySeries.value.map(p => ({
            time: Math.floor(new Date(p.Ts).getTime() / 1000), value: num(p.MarkPrice),
        })));
        const series = chart.addLineSeries({ color: '#9aa79a', lineWidth: 1 });
        series.setData(data as any);
        setTradeMarkers(series, data.map(d => d.time));
    }
    chart.timeScale().fitContent();
}

// ---- live deployment candlestick chart (lightweight-charts) ----
// Parse a timestamp to unix seconds, treating an offset-less string as UTC. Both the chart and the
// tick endpoints must resolve the same bar to the same value, otherwise the forming candle's update
// lands on the wrong (or an earlier) bar and the graph appears frozen.
function toUnixSec(ts: string): number {
    const s = /[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : ts + 'Z';
    return Math.floor(new Date(s).getTime() / 1000);
}
function snapToTimes(tsec: number, times: number[]): number {
    if (!times.length) return tsec;
    let best = times[0], bestDiff = Math.abs(times[0] - tsec);
    for (const ct of times) { const d = Math.abs(ct - tsec); if (d < bestDiff) { bestDiff = d; best = ct; } }
    return best;
}
// Map backend markers -> lightweight-charts markers, snapped to the nearest candle.
function dpBuildMarkers(times: number[]): any[] {
    const raw = dpChartData.value?.Markers;
    if (!Array.isArray(raw) || !times.length) return [];
    const markers = raw.map((m: any) => {
        const time = snapToTimes(toUnixSec(m.Time), times);
        if (m.Kind === 'exit')
            return { time, position: m.Side === 'sell' ? 'aboveBar' : 'belowBar', color: '#ffc247', shape: m.Side === 'sell' ? 'arrowDown' : 'arrowUp', text: 'Exit' };
        if (m.Side === 'buy')
            return { time, position: 'belowBar', color: '#62ce47', shape: 'arrowUp', text: 'Buy' };
        return { time, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: 'Sell' };
    });
    markers.sort((a: any, b: any) => a.time - b.time);
    return markers;
}
let dpLastSig = '';
let dpLastBarTime = 0;
function dpApplyData() {
    if (!dpChart || !dpSeries) return;
    const candles = dpChartData.value?.Candles;
    if (!Array.isArray(candles) || !candles.length) return;
    const data = dedupeByTime(candles.map((c: any) => ({
        time: toUnixSec(c.Timestamp),
        open: num(c.Open), high: num(c.High), low: num(c.Low), close: num(c.Close),
    })));
    // Only rebuild the series when the closed candles / markers actually change. Otherwise the
    // 8s poll's setData would wipe the live forming bar that the 3s tick poller is updating,
    // making the price look frozen between bar closes.
    const markerCount = Array.isArray(dpChartData.value?.Markers) ? dpChartData.value.Markers.length : 0;
    const sig = `${data.length}:${data[data.length - 1].time}:${markerCount}`;
    if (sig === dpLastSig) return;
    dpLastSig = sig;
    dpSeries.setData(data as any);
    dpSeries.setMarkers(dpBuildMarkers(data.map(d => d.time)));
    dpLastBarTime = data[data.length - 1].time;
}
async function buildDeploymentChart() {
    const container = dpPriceContainer.value;
    if (!container) return;
    const lc = await import('lightweight-charts');
    // Async chunk may resolve after the modal closed / re-rendered.
    if (!detailOpen.value || dpPriceContainer.value !== container) return;
    if (dpChart) { try { dpChart.remove(); } catch { /* disposed */ } dpChart = null; dpSeries = null; }
    const chart = lc.createChart(container, {
        autoSize: true,
        layout: { background: { type: lc.ColorType.Solid, color: 'transparent' }, textColor: '#8a958a', fontSize: 11 },
        grid: { vertLines: { color: 'rgba(255,255,255,0.05)' }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
        rightPriceScale: { borderColor: 'rgba(255,255,255,0.12)' },
        timeScale: { borderColor: 'rgba(255,255,255,0.12)', timeVisible: true, secondsVisible: false },
        crosshair: { mode: lc.CrosshairMode.Normal },
    });
    dpChart = chart;
    dpSeries = chart.addCandlestickSeries({
        upColor: '#62ce47', downColor: '#ef4444',
        borderUpColor: '#62ce47', borderDownColor: '#ef4444',
        wickUpColor: '#62ce47', wickDownColor: '#ef4444',
    });
    dpLastSig = ''; dpLastBarTime = 0; // force a fresh apply for the new chart
    dpApplyData();
    chart.timeScale().fitContent();
}
function destroyDeploymentChart() {
    if (dpChart) { try { dpChart.remove(); } catch { /* disposed */ } }
    dpChart = null; dpSeries = null; dpChartData.value = null;
    dpLastSig = ''; dpLastBarTime = 0;
}
// Fetch candles + markers for the deployment. First call builds the chart; later calls
// (from pollLight) just re-apply data so the user's zoom/pan is preserved — the "stream".
async function loadDeploymentChart(id: string) {
    try { dpChartData.value = await apiGet<any>(`/deployment/chart${qs({ id, limit: 300 })}`); }
    catch { return; }
    await nextTick();
    if (!detailOpen.value) return;
    if (!dpChart) await buildDeploymentChart();
    else dpApplyData();
}

// Overview charts: PnL% per deployment (bars), equity allocation + status mix (doughnuts).
function buildOverviewCharts() {
    const ds = deployments.value;
    if (!ds.length) return;

    if (pnlByDeployCanvas.value) {
        pnlByDeployChart?.destroy();
        const sorted = [...ds].sort((a, b) => num(b.PnLPercent) - num(a.PnLPercent));
        pnlByDeployChart = new Chart(pnlByDeployCanvas.value, {
            type: 'bar',
            data: {
                labels: sorted.map(d => `${d.Symbol} ${shortId(d.Id)}`),
                datasets: [{
                    data: sorted.map(d => num(d.PnLPercent)),
                    backgroundColor: sorted.map(d => num(d.PnLPercent) >= 0 ? 'rgba(98,206,71,.75)' : 'rgba(239,68,68,.75)'),
                    borderWidth: 0,
                }],
            },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: darkScales('PnL %') },
        });
    }

    if (allocCanvas.value) {
        allocChart?.destroy();
        const withEq = ds.filter(d => num(d.EquityCurrent) > 0);
        allocChart = new Chart(allocCanvas.value, {
            type: 'doughnut',
            data: {
                labels: withEq.map(d => `${d.Symbol} ${shortId(d.Id)}`),
                datasets: [{ data: withEq.map(d => num(d.EquityCurrent)), backgroundColor: withEq.map((_, i) => chartPalette[i % chartPalette.length]), borderWidth: 0 }],
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#9aa79a', boxWidth: 10, font: { size: 10 } } } } },
        });
    }

}

// Total Kraken (live) account value over time — summed equity series across live deployments.
async function loadKrakenValueChart() {
    if (!krakenCanvas.value) return;
    let series: any[] = [];
    try {
        const r = await apiGet<any>('/portfolio/equity' + qs({ mode: 'Live' }));
        series = Array.isArray(r?.Series) ? r.Series : [];
    } catch { return; }

    krakenEmpty.value = series.length === 0;
    krakenChart?.destroy(); krakenChart = null;
    if (!krakenCanvas.value || series.length === 0) return;

    const labels = series.map((p: any) => {
        const d = new Date(p.Ts);
        return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    });
    krakenChart = new Chart(krakenCanvas.value, {
        type: 'line',
        data: { labels, datasets: [{ data: series.map((p: any) => num(p.Equity)), borderColor: '#62ce47', backgroundColor: 'rgba(98,206,71,0.15)', fill: true, pointRadius: 0, borderWidth: 1.6, tension: 0.15 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: darkScales('USD') },
    });
}

function destroyOverviewCharts() {
    pnlByDeployChart?.destroy(); pnlByDeployChart = null;
    allocChart?.destroy(); allocChart = null;
    krakenChart?.destroy(); krakenChart = null;
}

const backtestChartHasData = computed(() => backtests.value.some(b => b.Status === 'Succeeded' && b.TotalPnLPercent != null));
function buildBacktestChart() {
    if (!backtestPerfCanvas.value) return;
    backtestPerfChart?.destroy();
    const rows = backtests.value.filter(b => b.Status === 'Succeeded' && b.TotalPnLPercent != null).slice(0, 15).reverse();
    if (!rows.length) return;
    backtestPerfChart = new Chart(backtestPerfCanvas.value, {
        type: 'bar',
        data: {
            labels: rows.map(b => `${b.StrategyClass.replace(/Strategy$/, '')} ${b.Coin}`),
            datasets: [{
                data: rows.map(b => num(b.TotalPnLPercent)),
                backgroundColor: rows.map(b => num(b.TotalPnLPercent) >= 0 ? 'rgba(98,206,71,.75)' : 'rgba(239,68,68,.75)'),
                borderWidth: 0,
            }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, title: { display: true, text: 'Recent backtest PnL %', color: '#8a958a', font: { size: 11 } } },
            scales: darkScales('PnL %'),
        },
    });
}
function destroyBacktestChart() { backtestPerfChart?.destroy(); backtestPerfChart = null; }

function buildHistChart() {
    histChart?.destroy(); histChart = null;
    const rows = btTradeRows.value;
    if (!histCanvas.value || rows.length === 0) return;
    const vals = rows.map(r => r.pnl);
    const min = Math.min(...vals), max = Math.max(...vals);
    const n = Math.min(12, Math.max(5, Math.ceil(Math.sqrt(rows.length))));
    const step = ((max - min) || 1) / n;
    const counts = new Array(n).fill(0);
    for (const v of vals) {
        let idx = Math.floor((v - min) / step);
        if (idx >= n) idx = n - 1;
        if (idx < 0) idx = 0;
        counts[idx]++;
    }
    const labels = counts.map((_, i) => fmtMoney(min + step * (i + 0.5)));
    const colors = counts.map((_, i) => (min + step * (i + 0.5)) >= 0 ? 'rgba(98,206,71,0.7)' : 'rgba(239,68,68,0.7)');
    histChart = new Chart(histCanvas.value, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Trades', data: counts, backgroundColor: colors, borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: darkScales('# trades') },
    });
}

function goBack() { router.push('/schemes'); }

onMounted(async () => {
    await refreshAll();
    pollTimer = setInterval(pollLight, 8000);
});
watch(deployments, () => { nextTick(() => { buildOverviewCharts(); loadKrakenValueChart(); }); });
watch(backtests, () => { nextTick(() => buildBacktestChart()); });
onBeforeUnmount(() => { if (pollTimer) clearInterval(pollTimer); if (dpTickTimer) clearInterval(dpTickTimer); destroyCharts(); destroyDeploymentChart(); destroyOverviewCharts(); destroyBacktestChart(); });
</script>

<style scoped>
.ot-shell {
    min-height: 100vh;
    padding: 18px;
    color: #e6f2e2;
    background:
        linear-gradient(rgba(18, 21, 16, 0.94), rgba(12, 13, 11, 0.97)),
        repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 28px),
        repeating-linear-gradient(90deg, rgba(98, 206, 71, 0.04) 0 1px, transparent 1px 32px);
}

/* header */
.ot-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 14px; }
.ot-kicker { font: 700 11px/1.2 ui-monospace, Consolas, monospace; letter-spacing: 1.2px; color: #62ce47; }
.live-dot { display: inline-block; width: 8px; height: 8px; margin-right: 7px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 12px #ef4444; }
.live-dot.on { background: #62ce47; box-shadow: 0 0 12px #62ce47; animation: pulse 1.5s infinite; }
.ot-header h1 { margin: 4px 0 2px; font-size: 38px; line-height: 1; color: #f2fbef; background: linear-gradient(135deg, #4d9e39, #62ce47); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.ot-header p { margin: 0; color: #8a958a; font-size: 13px; }
.ot-head-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.head-chips { display: flex; gap: 6px; }
.chip { padding: 3px 9px; border-radius: 999px; font: 700 11px ui-monospace, Consolas, monospace; text-transform: uppercase; letter-spacing: .5px; border: 1px solid rgba(255,255,255,.12); }
.chip.ok { color: #9ff08a; background: rgba(98,206,71,.14); border-color: rgba(98,206,71,.32); }
.chip.off { color: #ff9aa2; background: rgba(239,68,68,.12); border-color: rgba(239,68,68,.3); }
.chip.muted { color: #9aa79a; background: rgba(255,255,255,.04); }
.refresh-stamp { color: #83937f; font: 700 11px ui-monospace, Consolas, monospace; text-transform: uppercase; }
.ot-head-actions { display: flex; gap: 8px; }

/* buttons */
.ot-btn, .micro { border: 1px solid rgba(98,206,71,.3); border-radius: 5px; background: linear-gradient(180deg, rgba(44,98,38,.4), rgba(13,20,12,.9)); color: #eafbe5; cursor: pointer; font-weight: 700; }
.ot-btn { padding: 7px 12px; font-size: 13px; }
.micro { padding: 4px 8px; font-size: 11px; }
.ot-btn:hover, .micro:hover { border-color: #62ce47; }
.ot-btn:disabled, .micro:disabled { opacity: .5; cursor: not-allowed; }
.ot-btn.ghost, .micro.ghost { background: rgba(255,255,255,.04); color: #c7d4c3; }
.ot-btn.primary { background: linear-gradient(180deg, #4d9e39, #3c7e2d); border-color: #62ce47; }
.ot-btn.danger, .micro.danger { border-color: rgba(239,68,68,.45); color: #ffc2c8; background: linear-gradient(180deg, rgba(120,30,36,.4), rgba(20,11,12,.9)); }
.ot-btn.cyan, .micro.cyan { border-color: rgba(56,189,248,.4); color: #b6e8ff; }
.micro.warn { border-color: rgba(245,158,11,.45); color: #ffd98a; }
.ot-btn.block { display: block; width: 100%; margin-top: 12px; padding: 9px; }

/* metrics rows */
.metrics-rows { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.metrics-row-group { display: flex; align-items: stretch; gap: 0; }
.metrics-row-label { display: flex; align-items: center; justify-content: center; writing-mode: vertical-lr; transform: rotate(180deg); font: 800 10px ui-monospace, Consolas, monospace; letter-spacing: 1.6px; min-width: 24px; padding: 8px 0; border-radius: 6px 0 0 6px; }
.paper-label { background: rgba(56,189,248,.12); border: 1px solid rgba(56,189,248,.25); border-right: 0; color: #7ad4f7; }
.live-label { background: rgba(245,158,11,.1); border: 1px solid rgba(245,158,11,.3); border-right: 0; color: #ffc247; }
.metrics-row-group .ot-metrics { flex: 1; margin-bottom: 0; border-radius: 0 6px 6px 0; }
.ot-metrics { display: grid; grid-template-columns: repeat(6, minmax(120px, 1fr)); gap: 8px; }
.metric-tile { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 10px; padding: 10px 12px; min-height: 72px; border: 1px solid rgba(98,206,71,.2); border-radius: 6px; background: linear-gradient(180deg, rgba(24,32,20,.95), rgba(12,14,11,.96)); }
.metric-tile.paper { border-color: rgba(56,189,248,.22); background: linear-gradient(180deg, rgba(18,30,40,.95), rgba(10,14,18,.97)); }
.metric-tile.live { border-color: rgba(245,158,11,.28); background: linear-gradient(180deg, rgba(32,24,12,.95), rgba(16,13,8,.97)); }
.metric-copy { min-width: 0; }
.metric-tile strong { font-size: 26px; line-height: 1; color: #8ff07a; text-align: right; }
.metric-tile.paper strong { color: #7ad4f7; }
.metric-tile.live strong { color: #ffc247; }
.metric-tile strong.num { font-size: 20px; }
.metric-label, .metric-tile small { display: block; color: #8a958a; font-size: 11px; line-height: 1.4; text-transform: uppercase; letter-spacing: .6px; }
.metric-tile small { text-transform: none; letter-spacing: 0; color: #6f7c6d; }
.metric-tile.danger strong { color: #ff6b76; } .metric-tile.warn strong { color: #ffc247; } .metric-tile.cyan strong { color: #5fd3ff; } .metric-tile.violet strong { color: #c79cff; }

/* columns */
.ot-cols { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, .95fr); gap: 12px; margin-bottom: 12px; }
.backtest-cols { grid-template-columns: minmax(0, .95fr) minmax(0, 1.05fr); }

/* panels */
.ot-panel { border: 1px solid rgba(98,206,71,.16); border-radius: 7px; background: rgba(15,17,13,.88); overflow: hidden; }
.ot-panel.wide { margin-bottom: 12px; }
.panel-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 11px 14px; border-bottom: 1px solid rgba(98,206,71,.14); background: linear-gradient(90deg, rgba(30,52,22,.6), rgba(12,15,11,.4)); }
.panel-head h2 { margin: 2px 0 0; font-size: 18px; color: #eafbe5; }
.panel-code { font: 700 10px ui-monospace, Consolas, monospace; color: #62ce47; letter-spacing: 1.2px; }
.panel-code.danger { color: #ff7a84; }
.panel-body { padding: 13px 14px; }

/* mode toggle */
.mode-toggle { display: flex; gap: 3px; padding: 3px; border: 1px solid rgba(98,206,71,.2); border-radius: 6px; background: rgba(255,255,255,.03); }
.mode-toggle button { border: 0; background: transparent; color: #9aa79a; font: 800 11px ui-monospace, Consolas, monospace; text-transform: uppercase; padding: 5px 11px; border-radius: 4px; cursor: pointer; }
.mode-toggle button.active { color: #f2fbef; background: rgba(98,206,71,.2); box-shadow: inset 0 0 0 1px rgba(98,206,71,.3); }

/* forms */
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.field.span2 { grid-column: 1 / -1; }
.field span { color: #8a958a; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
.field input, .field select { border: 1px solid rgba(98,206,71,.22); border-radius: 5px; background: #0c100a; color: #eafbe5; padding: 7px 9px; font-size: 13px; outline: none; min-width: 0; }
.param-group-label { grid-column: 1 / -1; margin-top: 6px; color: #62ce47; font: 700 10px ui-monospace, Consolas, monospace; letter-spacing: 1px; text-transform: uppercase; border-bottom: 1px solid rgba(98,206,71,.12); padding-bottom: 3px; }
.field input:focus, .field select:focus { border-color: #62ce47; box-shadow: 0 0 0 1px rgba(98,206,71,.2); }

/* risk box */
.risk-box { margin-top: 12px; padding: 11px; border: 1px solid rgba(245,158,11,.3); border-radius: 6px; background: rgba(245,158,11,.05); }
.risk-head { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
.risk-head small { color: #c99a4a; font-size: 11px; }
.live-note { margin: 9px 0 0; color: #d6b873; font-size: 12px; }
.live-note strong { color: #ffd98a; }
.live-note.warn-note { color: #ffc247; }

.panel-code.cyan { color: #5fd3ff; }
.strat-select { margin-bottom: 11px; }
.val-toggle { margin-top: 11px; padding-top: 11px; border-top: 1px solid rgba(255,255,255,.06); }
.val-toggle .form-grid { margin-top: 9px; }
.check { display: flex; align-items: center; gap: 8px; color: #cdd8c9; font-size: 12px; cursor: pointer; }
.check input { width: 15px; height: 15px; accent-color: #62ce47; }
.tag.universe { color: #5fd3ff; border-color: rgba(56,189,248,.35); background: rgba(56,189,248,.1); margin: 4px 0 2px; display: inline-block; }
.muted.sm { font-size: 11px; }

/* strategies */
.strat-body { display: flex; flex-direction: column; gap: 9px; max-height: 520px; overflow-y: auto; }
.strat-card { border: 1px solid rgba(98,206,71,.14); border-radius: 6px; background: rgba(255,255,255,.02); padding: 10px; }
.strat-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.strat-top h3 { margin: 0; font-size: 14px; color: #f2fbef; }
.strat-card p { margin: 6px 0 9px; color: #9aa79a; font-size: 12px; line-height: 1.45; }
.strat-actions { display: flex; gap: 6px; flex-wrap: wrap; }

/* tags / pills */
.tag { font-size: 10px; color: #9ccf8f; border: 1px solid rgba(98,206,71,.3); background: rgba(98,206,71,.1); border-radius: 999px; padding: 2px 7px; white-space: nowrap; }
.mono { font-family: ui-monospace, Consolas, monospace; }
.pill { display: inline-block; padding: 2px 7px; border-radius: 4px; font: 700 11px ui-monospace, Consolas, monospace; text-transform: uppercase; }
.pill.sm { padding: 1px 5px; font-size: 10px; margin-left: 4px; }
.pill.ok { color: #9ff08a; background: rgba(98,206,71,.16); } .pill.warn { color: #ffc247; background: rgba(245,158,11,.15); }
.pill.off { color: #9aa79a; background: rgba(255,255,255,.06); } .pill.danger { color: #ff8a93; background: rgba(239,68,68,.16); }
.pill.cyan { color: #5fd3ff; background: rgba(56,189,248,.14); }
.pill.live { color: #ffd98a; background: rgba(245,158,11,.16); } .pill.paper { color: #b6e8ff; background: rgba(56,189,248,.12); }
.pill.armed { color: #ff6b76; background: rgba(239,68,68,.18); } .pill.safe { color: #9aa79a; background: rgba(255,255,255,.05); }
.pill.buy { color: #9ff08a; background: rgba(98,206,71,.16); } .pill.sell { color: #ff8a93; background: rgba(239,68,68,.14); }

/* tables */
.table-shell { max-height: 520px; overflow: auto; border: 1px solid rgba(255,255,255,.07); border-radius: 5px; }
.table-shell.short { max-height: 240px; }
.table-shell.refreshing table { opacity: .8; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { padding: 7px 9px; border-bottom: 1px solid rgba(255,255,255,.05); text-align: left; vertical-align: middle; white-space: nowrap; }
th { position: sticky; top: 0; z-index: 1; background: #11150e; color: #73d35f; font: 700 11px ui-monospace, Consolas, monospace; text-transform: uppercase; }
th.r, td.r { text-align: right; }
td.num { font-family: ui-monospace, Consolas, monospace; }
td.strong { color: #f2fbef; font-weight: 600; }
td.muted { color: #7c887a; }
tr.clickable { cursor: pointer; }
tr.clickable:hover td { background: rgba(98,206,71,.06); }
td.actions { display: flex; gap: 4px; flex-wrap: wrap; }
.pos { color: #8ff07a; } .neg { color: #ff6b76; }
.empty-cell { text-align: center; color: #6f7c6d; padding: 22px; }
.empty { text-align: center; color: #7c887a; padding: 18px; font-size: 13px; }

/* progress bar */
.bar { width: 90px; height: 7px; border-radius: 999px; background: rgba(255,255,255,.07); overflow: hidden; }
.bar span { display: block; height: 100%; background: linear-gradient(90deg, #4d9e39, #62ce47); }

/* modal */
.ot-modal-backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 24px; background: rgba(0,0,0,.6); backdrop-filter: blur(2px); }
.ot-modal { width: min(880px, 96vw); max-height: 88vh; overflow: auto; border: 1px solid rgba(98,206,71,.25); border-radius: 9px; background: #121511; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 14px 16px; border-bottom: 1px solid rgba(98,206,71,.16); position: sticky; top: 0; background: #121511; }
.modal-head h2 { margin: 3px 0 2px; font-size: 19px; color: #eafbe5; }
.modal-head small { color: #8a958a; font-size: 12px; }
.modal-loading { padding: 40px; text-align: center; color: #8a958a; }
.modal-body { padding: 14px 16px; }
.mini-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 12px; }
.mini-grid.wide { grid-template-columns: repeat(4, 1fr); }
.mini { border: 1px solid rgba(255,255,255,.07); border-radius: 6px; background: rgba(255,255,255,.025); padding: 8px 9px; }
.mini span { display: block; color: #7c887a; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; }
.mini strong { display: block; margin-top: 3px; color: #f2fbef; font-size: 14px; }
.mini strong.num { font-family: ui-monospace, Consolas, monospace; }
.curve-wrap { margin: 12px 0; }
.curve-label { color: #8a958a; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 5px; }
.curve { width: 100%; height: 70px; border: 1px solid rgba(98,206,71,.16); border-radius: 6px; background: linear-gradient(180deg, rgba(98,206,71,.07), rgba(98,206,71,.01)); }
.ot-overview { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 12px; margin-bottom: 16px; }
@media (max-width: 900px) { .ot-overview { grid-template-columns: 1fr; } }
.ov-card { border: 1px solid rgba(98,206,71,.16); border-radius: 8px; background: linear-gradient(180deg, rgba(98,206,71,.05), rgba(0,0,0,.12)); padding: 12px 14px; }
.ov-title { color: #8a958a; font: 700 11px ui-monospace, Consolas, monospace; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; }
.ov-canvas { position: relative; width: 100%; height: 180px; }
.ov-canvas.sm { height: 150px; }
.ov-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: 0 18px; color: #83937f; font-size: 11px; }
.bt-overview { margin-bottom: 12px; }
.dp-legend { float: right; display: inline-flex; gap: 12px; font-weight: 700; }
.dp-chart { position: relative; width: 100%; height: 280px; border: 1px solid rgba(98,206,71,.16); border-radius: 6px; background: linear-gradient(180deg, rgba(98,206,71,.04), rgba(0,0,0,.06)); }
.dp-chart-empty { color: #83937f; font-size: 11px; padding: 6px 2px; }
.curve polyline { fill: none; stroke: #62ce47; stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
.sub-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 6px; }
.sub-cols h4 { margin: 0 0 7px; font-size: 12px; color: #9ccf8f; text-transform: uppercase; letter-spacing: .5px; }

/* backtest report */
.ot-modal.report { width: min(1180px, 96vw); }
.verdict { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.vchip { padding: 4px 11px; border-radius: 999px; font: 700 12px ui-monospace, Consolas, monospace; color: #cdd8c9; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); }
.vchip.pos { color: #8ff07a; background: rgba(98,206,71,.1); border-color: rgba(98,206,71,.3); }
.vchip.neg { color: #ff6b76; background: rgba(239,68,68,.1); border-color: rgba(239,68,68,.3); }
.tabs { display: flex; gap: 4px; margin-bottom: 14px; border-bottom: 1px solid rgba(98,206,71,.14); }
.tabs button { border: 0; background: transparent; color: #9aa79a; font: 800 12px ui-monospace, Consolas, monospace; text-transform: uppercase; letter-spacing: .5px; padding: 8px 14px; cursor: pointer; border-bottom: 2px solid transparent; }
.tabs button:hover { color: #cdd8c9; }
.tabs button.active { color: #eafbe5; border-bottom-color: #62ce47; }
.report-section h4 { margin: 16px 0 7px; font-size: 12px; color: #9ccf8f; text-transform: uppercase; letter-spacing: .5px; }
.report-section h4:first-child { margin-top: 0; }
.chart-block { margin-bottom: 16px; }
.chart-wrap { position: relative; height: 240px; }
.chart-wrap.sm { height: 200px; }
.chart-wrap.tv { height: 380px; border: 1px solid rgba(98,206,71,.12); border-radius: 6px; overflow: hidden; }
.tv-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.tv-head small { color: #7c887a; text-transform: none; letter-spacing: 0; }
.row-loss td { background: rgba(239,68,68,.05); }
.row-win td { background: rgba(98,206,71,.04); }

.ot-error { padding: 9px 12px; margin-bottom: 12px; border: 1px solid rgba(239,68,68,.4); border-radius: 6px; background: rgba(239,68,68,.1); color: #ffbcc1; font-size: 13px; }
.ot-error.sm { margin: 0 0 10px; font-size: 12px; padding: 7px 10px; }

@keyframes pulse { 0%,100% { opacity: .5; } 50% { opacity: 1; } }

/* responsive */
@media (max-width: 1100px) {
    .ot-metrics { grid-template-columns: repeat(3, 1fr); }
    .metrics-row-label { writing-mode: horizontal-tb; transform: none; min-width: unset; padding: 6px 10px; min-height: 24px; border-radius: 6px 6px 0 0; border-right: 1px solid; border-bottom: 0; }
    .paper-label { border-right-color: rgba(56,189,248,.25); border-bottom: 0; }
    .live-label { border-right-color: rgba(245,158,11,.3); border-bottom: 0; }
    .metrics-row-group { flex-direction: column; }
    .metrics-row-group .ot-metrics { border-radius: 0 0 6px 6px; }
    .ot-cols, .backtest-cols { grid-template-columns: 1fr; }
    .sub-cols { grid-template-columns: 1fr; }
    .mini-grid, .mini-grid.wide { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 680px) {
    .ot-header { flex-direction: column; align-items: stretch; }
    .ot-head-right { align-items: stretch; }
    .ot-metrics { grid-template-columns: repeat(2, 1fr); }
    .metrics-row-label { writing-mode: horizontal-tb; transform: none; }
    .form-grid { grid-template-columns: 1fr; }
}
</style>
