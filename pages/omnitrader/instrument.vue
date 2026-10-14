<template>
    <OmniTraderShell>
        <div class="sechead">
            <div class="id">
                <span class="sym mono">{{ symbol }}</span>
                <span class="nm">{{ displayName }}</span>
                <span class="meta mono">{{ [quote?.Exchange, quote?.AssetClass, quote?.Currency].filter(Boolean).join(' · ') }}</span>
            </div>
            <div class="px">
                <span class="last mono">{{ fmtPrice(quote?.Price) }}</span>
                <span class="chg mono" :class="tone(quote?.ChangePercent)">{{ fmtSignedN(netChange, 2) }} {{ fmtChg(quote?.ChangePercent) }}</span>
                <span class="state mono"><span class="ot-dot" :class="quote?.Streaming ? 'live' : quote?.MarketState === 'REGULAR' ? 'ok' : ''"></span>{{ quote?.Streaming ? 'stream' : (quote?.MarketState ?? '') }}</span>
            </div>
            <span class="grow"></span>
            <div class="acts">
                <button v-if="quote?.InstrumentId" class="ot-btn sm" :disabled="busy" @click="toggleWatch">{{ watched ? '★ Watching' : '☆ Watch' }}</button>
                <NuxtLink class="ot-btn sm" :to="`/omnitrader/alerts?symbol=${encodeURIComponent(symbol)}`">Alert</NuxtLink>
                <NuxtLink class="ot-btn sm" :to="`/omnitrader/lab?new=1&symbol=${encodeURIComponent(symbol)}`">Backtest</NuxtLink>
                <NuxtLink v-if="quote?.InstrumentId" class="ot-btn sm primary" :to="{ path: '/omnitrader/execution', query: { instrument: quote.InstrumentId } }">Ticket</NuxtLink>
            </div>
        </div>

        <nav class="ot-tabs" role="tablist">
            <button v-for="t in tabs" :key="t.id" role="tab" type="button" :aria-selected="state.tab === t.id" @click="state.tab = t.id">
                <span class="fn">{{ t.id }}</span>{{ t.label }}
            </button>
        </nav>

        <div v-if="quoteError" class="ot-banner warn"><span class="glyph">⚠</span><strong>{{ symbol }}</strong><span class="muted">{{ quoteError }}</span></div>

        <!-- GP -->
        <div v-if="state.tab === 'GP'" class="gp">
            <OtChart v-model:symbol="symbolModel" v-model:interval="state.interval" persist="security" :height="chartHeight" symbol-editable />
        </div>

        <!-- DES -->
        <div v-else-if="state.tab === 'DES'" class="ot-grid sidebar">
            <div class="ot-stack">
                <OtPanel v-if="!crypto" title="Key statistics" code="DES" :loading="loadingDes" :error="desError" :empty="!statRows.length" persist="sec.stats">
                    <div class="kvgrid">
                        <div v-for="r in statRows" :key="r.k" class="kv"><span class="k">{{ r.k }}</span><span class="v mono" :class="r.cls">{{ r.v }}</span></div>
                    </div>
                </OtPanel>
                <OtPanel v-if="company?.Summary" title="Business" persist="sec.summary">
                    <p class="summary">{{ company.Summary }}</p>
                    <div class="facts mono">
                        <span v-if="company.Sector">{{ company.Sector }}</span><span v-if="company.Industry">{{ company.Industry }}</span>
                        <span v-if="company.Country">{{ [company.City, company.Country].filter(Boolean).join(', ') }}</span>
                        <span v-if="company.Employees">{{ fmtInt(company.Employees) }} employees</span>
                        <a v-if="company.Website" :href="company.Website" target="_blank" rel="noopener">{{ company.Website.replace(/^https?:\/\//, '') }}</a>
                    </div>
                </OtPanel>
                <OtPanel v-if="company?.Earnings?.length" title="Earnings" code="ERN" flush persist="sec.earnings">
                    <template #controls><span class="mono muted small">next {{ fmtDay10(company.NextEarningsUtc) }} · est {{ fmtN(company.NextEpsEstimate, 2) }}</span></template>
                    <OtGrid :rows="company.Earnings" :columns="earnCols" bare :row-key="(r: any) => r.Period" />
                </OtPanel>
                <OtPanel v-if="crypto" title="Coin" code="DES" :loading="loadingDes" :error="desError" :empty="!coin" persist="sec.coin">
                    <div v-if="coin" class="kvgrid">
                        <div class="kv"><span class="k">Rank</span><span class="v mono">#{{ coin.Rank }}</span></div>
                        <div class="kv"><span class="k">Market cap</span><span class="v mono">{{ fmtBig(coin.MarketCap) }}</span></div>
                        <div class="kv"><span class="k">24h volume</span><span class="v mono">{{ fmtBig(coin.Volume24h) }}</span></div>
                        <div class="kv"><span class="k">Circulating</span><span class="v mono">{{ fmtBig(coin.CirculatingSupply) }}</span></div>
                        <div class="kv"><span class="k">1h</span><span class="v mono" :class="tone(coin.Change1hPct)">{{ fmtChg(coin.Change1hPct) }}</span></div>
                        <div class="kv"><span class="k">24h</span><span class="v mono" :class="tone(coin.Change24hPct)">{{ fmtChg(coin.Change24hPct) }}</span></div>
                        <div class="kv"><span class="k">7d</span><span class="v mono" :class="tone(coin.Change7dPct)">{{ fmtChg(coin.Change7dPct) }}</span></div>
                        <div class="kv"><span class="k">From ATH</span><span class="v mono neg">{{ fmtChg(coin.AthChangePct) }}</span></div>
                    </div>
                </OtPanel>
                <OtPanel v-if="crypto" title="Order book" code="DOM" persist="sec.book.depth" :loading="loadingDepth && !depth" :error="depthError" :empty="!depth" refreshable @refresh="loadDepth()">
                    <template #controls>
                        <select v-model="bookGroup" class="ot-select sm auto mono" title="Group price levels" aria-label="Price grouping">
                            <option value="">auto · {{ depth ? fmtN(depth.Group, decimalsOf(depth.Group)) : '' }}</option>
                            <option v-for="g in depth?.Groups ?? []" :key="g" :value="String(g)">{{ fmtN(g, decimalsOf(g)) }}</option>
                        </select>
                        <select v-model.number="bookPrefs.rows" class="ot-select sm auto mono" title="Rows per side" aria-label="Rows per side">
                            <option v-for="n in [10, 20, 30]" :key="n" :value="n">{{ n }} rows</option>
                        </select>
                        <button class="ot-btn ghost sm" type="button" :aria-pressed="bookPrefs.live" title="Refresh every few seconds" @click="bookPrefs.live = !bookPrefs.live">
                            <span class="ot-dot" :class="bookPrefs.live ? 'live' : ''"></span>live
                        </button>
                    </template>
                    <div v-if="depth" class="book mono">
                        <div class="bookhead">
                            <span><span class="k">Spread</span> {{ fmtN(depth.Spread, tickDecimals) }} <span class="muted">· {{ fmtBps(depth.SpreadBps) }} bps</span></span>
                            <span><span class="k">Mid</span> {{ fmtN(depth.Mid, tickDecimals + 1) }}</span>
                            <span class="grow"></span>
                            <span class="muted">{{ depth.Source }} · {{ fmtAge(depth.AsOfUtc) }} ago</span>
                        </div>
                        <div class="ladder" role="table" aria-label="Order book">
                            <div class="lhead bid" role="row"><span role="columnheader">Total</span><span role="columnheader">Size</span><span role="columnheader">Bid</span></div>
                            <div class="lhead ask" role="row"><span role="columnheader">Ask</span><span role="columnheader">Size</span><span role="columnheader">Total</span></div>
                            <div class="side bid">
                                <div v-for="l in depth.Bids" :key="`b${l[0]}`" class="lvl" :class="{ wall: isWall(l[1]) }" role="row"
                                     :title="`${fmtN(l[0], groupDecimals)} · ${fmtN(l[1], sizeDecimals)} (≈ ${fmtBig(l[0] * l[1])}) · cumulative ${fmtN(l[2], sizeDecimals)}`">
                                    <span class="cum" :style="{ width: barPct(l[2], cumMax) }"></span><span class="sz" :style="{ width: barPct(l[1], levelMax) }"></span>
                                    <span class="t">{{ fmtN(l[2], sizeDecimals) }}</span><span class="s">{{ fmtN(l[1], sizeDecimals) }}</span><span class="p">{{ fmtN(l[0], groupDecimals) }}</span>
                                </div>
                            </div>
                            <div class="side ask">
                                <div v-for="l in depth.Asks" :key="`a${l[0]}`" class="lvl" :class="{ wall: isWall(l[1]) }" role="row"
                                     :title="`${fmtN(l[0], groupDecimals)} · ${fmtN(l[1], sizeDecimals)} (≈ ${fmtBig(l[0] * l[1])}) · cumulative ${fmtN(l[2], sizeDecimals)}`">
                                    <span class="cum" :style="{ width: barPct(l[2], cumMax) }"></span><span class="sz" :style="{ width: barPct(l[1], levelMax) }"></span>
                                    <span class="p">{{ fmtN(l[0], groupDecimals) }}</span><span class="s">{{ fmtN(l[1], sizeDecimals) }}</span><span class="t">{{ fmtN(l[2], sizeDecimals) }}</span>
                                </div>
                            </div>
                        </div>
                        <table class="bands">
                            <thead><tr><th>Depth</th><th v-for="b in depth.Bands ?? []" :key="b.Pct" class="num">±{{ b.Pct }}%</th></tr></thead>
                            <tbody>
                                <tr>
                                    <td class="k">Bid</td>
                                    <td v-for="b in depth.Bands ?? []" :key="b.Pct" class="num pos" :class="{ partial: !b.BidCovered }" :title="b.BidCovered ? '' : coverageNote('bid')">{{ b.BidCovered ? '' : '≥' }}{{ fmtBig(b.Bid) }}</td>
                                </tr>
                                <tr>
                                    <td class="k">Ask</td>
                                    <td v-for="b in depth.Bands ?? []" :key="b.Pct" class="num neg" :class="{ partial: !b.AskCovered }" :title="b.AskCovered ? '' : coverageNote('ask')">{{ b.AskCovered ? '' : '≥' }}{{ fmtBig(b.Ask) }}</td>
                                </tr>
                                <tr>
                                    <td class="k">Imbalance</td>
                                    <td v-for="b in depth.Bands ?? []" :key="b.Pct" class="num" :class="[tone(b.Imbalance), { partial: !b.BidCovered || !b.AskCovered }]">{{ fmtSignedN(b.Imbalance, 2) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </OtPanel>
            </div>
            <div class="ot-stack">
                <OtPanel title="Book" code="POS" persist="sec.book" :loading="loadingBook">
                    <div v-if="row" class="kvgrid two">
                        <div class="kv"><span class="k">Regime</span><span class="v mono">{{ row.Regime }} {{ ((row.RegimeConfidence ?? 0) * 100).toFixed(0) }}%</span></div>
                        <div class="kv"><span class="k">Momentum</span><span class="v mono" :class="tone(row.MomentumScore)">{{ fmtN(row.MomentumScore, 2) }}</span></div>
                        <div class="kv"><span class="k">Breakout</span><span class="v mono">{{ row.BreakoutDirection === 0 ? 'range' : row.BreakoutDirection > 0 ? 'up' : 'down' }}</span></div>
                        <div class="kv"><span class="k">Ann. vol</span><span class="v mono">{{ fmtPctPlain(row.AnnualizedVolatility, 1) }}</span></div>
                        <div class="kv"><span class="k">Avg quote vol</span><span class="v mono">{{ fmtBig(row.AverageQuoteVolume) }}</span></div>
                        <div class="kv"><span class="k">Est. spread</span><span class="v mono">{{ fmtPctPlain(row.EstimatedSpreadPercent, 3) }}</span></div>
                        <div class="kv"><span class="k">Venues</span><span class="v mono">{{ row.TradableOn?.join(', ') || '—' }}</span></div>
                    </div>
                    <OtGrid v-if="positions.length" :rows="positions" :columns="positionCols" bare :row-key="(p: any) => `${p.InstrumentId}:${p.Venue}:${p.Environment}`" />
                    <div v-else class="muted small">No position.</div>
                </OtPanel>
                <OtPanel v-if="company?.Analysts" title="Analysts" code="ANR" persist="sec.analysts">
                    <div class="kvgrid two">
                        <div class="kv"><span class="k">Consensus</span><span class="v mono">{{ company.Analysts.RecommendationKey ?? '—' }} ({{ fmtN(company.Analysts.RecommendationMean, 2) }})</span></div>
                        <div class="kv"><span class="k">Analysts</span><span class="v mono">{{ company.Analysts.Analysts ?? '—' }}</span></div>
                        <div class="kv"><span class="k">Target mean</span><span class="v mono">{{ fmtPrice(company.Analysts.TargetMean) }} <span :class="tone(upside)">{{ fmtChg(upside, 1) }}</span></span></div>
                        <div class="kv"><span class="k">Range</span><span class="v mono">{{ fmtPrice(company.Analysts.TargetLow) }} – {{ fmtPrice(company.Analysts.TargetHigh) }}</span></div>
                    </div>
                    <div v-for="b in company.Analysts.Trend.slice(0, 1)" :key="b.Period" class="recbar" title="Strong buy · Buy · Hold · Sell · Strong sell">
                        <span v-for="(n, i) in [b.StrongBuy, b.Buy, b.Hold, b.Sell, b.StrongSell]" :key="i" :style="{ flex: n || 0.0001, background: ['#1f9e64', '#26c281', '#7d8893', '#e8775a', '#f2545b'][i] }">{{ n || '' }}</span>
                    </div>
                </OtPanel>
                <OtPanel v-if="company?.Ownership && Object.keys(company.Ownership).length" title="Ownership" persist="sec.own">
                    <div class="kvgrid two">
                        <div v-for="(v, k) in company.Ownership" :key="k" class="kv"><span class="k">{{ k }}</span><span class="v mono">{{ fmtN(v, 2) }}</span></div>
                    </div>
                </OtPanel>
                <OtPanel v-if="company?.Institutions?.length" title="Top holders" flush persist="sec.holders">
                    <OtGrid :rows="company.Institutions" :columns="holderCols" bare :row-key="(r: any) => r.Name" />
                </OtPanel>
                <OtPanel v-if="company?.Insiders?.length" title="Insiders" flush persist="sec.insiders" default-collapsed>
                    <OtGrid :rows="company.Insiders" :columns="insiderCols" bare :row-key="(r: any) => `${r.Name}${r.Date}`" />
                </OtPanel>
                <OtPanel v-if="company?.RatingChanges?.length" title="Rating changes" flush persist="sec.ratings" default-collapsed>
                    <OtGrid :rows="company.RatingChanges" :columns="ratingCols" bare :row-key="(r: any) => `${r.Firm}${r.Date}`" />
                </OtPanel>
                <OtPanel v-if="company?.Officers?.length" title="Officers" flush persist="sec.officers" default-collapsed>
                    <OtGrid :rows="company.Officers" :columns="officerCols" bare :row-key="(r: any) => r.Name" />
                </OtPanel>
            </div>
        </div>

        <!-- FA -->
        <div v-else-if="state.tab === 'FA'" class="ot-stack">
            <div class="ot-toolbar">
                <div class="ot-segment sm"><button type="button" :aria-pressed="faPeriod === 'Annual'" @click="faPeriod = 'Annual'">Annual</button><button type="button" :aria-pressed="faPeriod === 'Quarterly'" @click="faPeriod = 'Quarterly'">Quarterly</button></div>
                <div class="ot-segment sm"><button type="button" :aria-pressed="faSource === 'yahoo'" @click="faSource = 'yahoo'">Statements</button><button type="button" :aria-pressed="faSource === 'sec'" @click="faSource = 'sec'; loadSec()">SEC XBRL</button></div>
                <span class="summary">{{ financials?.Currency ?? '' }} · {{ faUnitLabel }}</span>
                <span class="grow"></span>
                <button class="ot-btn ghost sm" @click="exportFa">CSV</button>
            </div>
            <div v-if="loadingFa" class="ot-state compact"><span class="ot-spin"></span></div>
            <div v-else-if="faError" class="ot-state compact error"><strong>{{ faError }}</strong></div>
            <div v-else-if="!faGroups.length" class="ot-state compact"><span>No statements</span></div>
            <OtPanel v-for="grp in faGroups" v-else :key="grp.name" :title="grp.name" flush :persist="`sec.fa.${grp.name}`">
                <div class="ot-tablewrap">
                    <table class="ot-table fa">
                        <thead><tr><th>{{ faPeriod }}</th><th v-for="d in faDates" :key="d" class="num">{{ d }}</th><th class="num">CAGR</th></tr></thead>
                        <tbody>
                            <tr v-for="r in grp.rows" :key="r.key" :class="{ derived: r.derived }">
                                <td>{{ r.label }}</td>
                                <td v-for="(v, i) in r.values" :key="i" class="num" :class="r.pct ? tone(v) : (v !== null && v < 0 ? 'neg' : '')">{{ r.pct ? fmtPctPlain(v, 1) : faFmt(v, r.key) }}</td>
                                <td class="num" :class="tone(r.cagr)">{{ fmtChg(r.cagr, 1) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </OtPanel>
        </div>

        <!-- HP -->
        <div v-else-if="state.tab === 'HP'" class="ot-grid two">
            <OtPanel title="Trailing returns" code="HP" :loading="loadingStats" :error="statsError" :empty="!stats" persist="sec.returns">
                <div v-if="stats" class="ret">
                    <div v-for="(v, k) in stats.Returns" :key="k" class="r" :style="{ background: heat(v, 30) }">
                        <span class="k mono">{{ k }}</span><span class="v mono" :class="tone(v)">{{ fmtChg(v, 1) }}</span>
                    </div>
                </div>
                <div v-if="stats" class="kvgrid" style="margin-top:8px">
                    <div v-for="f in statFields" :key="f.k" class="kv"><span class="k">{{ f.label }}</span><span class="v mono" :class="f.cls">{{ f.text }}</span></div>
                </div>
            </OtPanel>
            <OtPanel title="Realised volatility cone" code="HVT" :loading="loadingStats" :empty="!stats?.VolCone?.length" persist="sec.cone" flush>
                <OtGrid :rows="stats?.VolCone ?? []" :columns="coneCols" bare :row-key="(r: any) => String(r.Window)" />
            </OtPanel>
            <OtPanel title="Drawdowns" code="DD" :loading="loadingStats" :empty="!stats?.Drawdowns?.length" persist="sec.dd" flush>
                <OtGrid :rows="stats?.Drawdowns ?? []" :columns="ddCols" bare :row-key="(r: any) => String(r.Peak)" />
            </OtPanel>
            <OtPanel title="Calendar years" code="YR" :loading="loadingStats" :empty="!stats?.Calendar?.length" persist="sec.years" flush>
                <OtGrid :rows="[...(stats?.Calendar ?? [])].reverse()" :columns="yearCols" bare :row-key="(r: any) => String(r.Year)" />
            </OtPanel>
        </div>

        <!-- SEAS -->
        <div v-else-if="state.tab === 'SEAS'" class="ot-stack">
            <div class="ot-toolbar">
                <label class="inline">Years <select v-model.number="seasYears" class="ot-select sm auto" @change="loadSeas"><option v-for="y in [5, 10, 15, 20, 30]" :key="y" :value="y">{{ y }}</option></select></label>
                <span v-if="seas" class="summary">{{ fmtDay10(seas.From) }} → {{ fmtDay10(seas.To) }}</span>
            </div>
            <div v-if="loadingSeas" class="ot-state compact"><span class="ot-spin"></span></div>
            <div v-else-if="seasError" class="ot-state compact error"><strong>{{ seasError }}</strong></div>
            <template v-else-if="seas">
                <OtPanel title="Monthly returns %" code="SEAS" persist="sec.seas.grid">
                    <OtHeatmap :rows="seas.Grid.map((g: any) => g.Year)" :cols="MONTHS" :values="seas.Grid.map((g: any) => g.Months)" :row-totals="seas.Grid.map((g: any) => g.Total)" :decimals="1" />
                </OtPanel>
                <div class="ot-grid three">
                    <OtPanel title="By month" flush persist="sec.seas.month">
                        <OtGrid :rows="seas.ByMonth.map((m: any) => ({ M: MONTHS[m.Month - 1], ...m.Stats }))" :columns="seasCols" bare :row-key="(r: any) => r.M" />
                    </OtPanel>
                    <OtPanel title="By weekday" flush persist="sec.seas.dow">
                        <OtGrid :rows="seas.ByWeekday.map((d: any) => ({ M: d.Day.slice(0, 3), ...d.Stats }))" :columns="seasCols" bare :row-key="(r: any) => r.M" />
                    </OtPanel>
                    <OtPanel title="Turn of month" persist="sec.seas.tom">
                        <div class="kvgrid">
                            <div class="kv"><span class="k">Last + first 3 days</span><span class="v mono" :class="tone(seas.TurnOfMonth.Window.Mean)">{{ fmtSignedN(seas.TurnOfMonth.Window.Mean, 3) }}% / day</span></div>
                            <div class="kv"><span class="k">Rest of month</span><span class="v mono" :class="tone(seas.TurnOfMonth.Rest.Mean)">{{ fmtSignedN(seas.TurnOfMonth.Rest.Mean, 3) }}% / day</span></div>
                            <div class="kv"><span class="k">t-stat (window)</span><span class="v mono">{{ fmtN(seas.TurnOfMonth.Window.TStat, 2) }}</span></div>
                            <div class="kv"><span class="k">Hit rate</span><span class="v mono">{{ fmtPctPlain(seas.TurnOfMonth.Window.PositivePct) }}</span></div>
                        </div>
                    </OtPanel>
                </div>
                <OtPanel v-if="seas.ByHour" title="By hour (UTC)" flush persist="sec.seas.hour">
                    <OtHeatmap :rows="['mean %', 'hit − 50']" :cols="seas.ByHour.map((h: any) => h.HourUtc)"
                               :values="[seas.ByHour.map((h: any) => h.Stats.Mean), seas.ByHour.map((h: any) => (h.Stats.PositivePct ?? 50) - 50)]" :decimals="3" />
                </OtPanel>
            </template>
        </div>

        <!-- OMON -->
        <div v-else-if="state.tab === 'OMON'" class="ot-stack">
            <template v-if="crypto">
                <OtPanel :title="`${base} options · Deribit`" code="OMON" :loading="loadingOpt" :error="optError" :empty="!cryptoOpt" persist="sec.copt">
                    <template #controls><span class="mono small muted">put/call OI {{ fmtN(cryptoOpt?.PutCallOi, 2) }} · spot {{ fmtPrice(cryptoOpt?.Underlying) }}</span></template>
                    <OtCurve v-if="cryptoOpt" :series="cryptoTerm" :height="200" :log-x="false" :decimals="1" />
                </OtPanel>
                <OtPanel title="Smile" persist="sec.copt.smile">
                    <template #controls>
                        <select v-model="smileExpiry" class="ot-select sm auto mono"><option v-for="e in cryptoExpiries" :key="e" :value="e">{{ fmtDay10(e) }}</option></select>
                    </template>
                    <OtCurve :series="smileSeries" :height="220" :log-x="false" :decimals="1" />
                </OtPanel>
            </template>
            <template v-else>
                <div class="ot-toolbar">
                    <label class="inline">Expiry
                        <select v-model="optExpiry" class="ot-select sm auto mono" @change="loadOptions">
                            <option v-for="e in options?.Expirations ?? []" :key="e" :value="e">{{ fmtDay10(e) }}</option>
                        </select>
                    </label>
                    <span class="summary">spot <b>{{ fmtPrice(options?.UnderlyingPrice) }}</b> · ATM IV <b>{{ fmtPctPlain(options?.AtmIvPct) }}</b> · P/C vol <b>{{ fmtN(options?.PutCallVolumeRatio, 2) }}</b> · P/C OI <b>{{ fmtN(options?.PutCallOiRatio, 2) }}</b> · max pain <b>{{ fmtPrice(options?.MaxPain) }}</b> · {{ fmtN(options?.DaysToExpiry, 0) }}d</span>
                    <span class="grow"></span>
                    <label class="inline">Strikes ±<select v-model.number="strikeWindow" class="ot-select sm auto"><option v-for="n in [10, 20, 40, 1000]" :key="n" :value="n">{{ n === 1000 ? 'all' : n }}</option></select></label>
                </div>
                <div v-if="loadingOpt" class="ot-state compact"><span class="ot-spin"></span></div>
                <div v-else-if="optError" class="ot-state compact error"><strong>{{ optError }}</strong></div>
                <template v-else-if="options">
                    <OtPanel title="Chain" code="OMON" flush persist="sec.chain">
                        <div class="ot-tablewrap" style="max-height: 560px">
                            <table class="ot-table chain">
                                <thead>
                                    <tr><th colspan="7" class="side">Calls</th><th class="strike">Strike</th><th colspan="7" class="side">Puts</th></tr>
                                    <tr>
                                        <th class="num">Δ</th><th class="num">IV</th><th class="num">OI</th><th class="num">Vol</th><th class="num">Bid</th><th class="num">Ask</th><th class="num">Last</th>
                                        <th class="num strike"></th>
                                        <th class="num">Last</th><th class="num">Bid</th><th class="num">Ask</th><th class="num">Vol</th><th class="num">OI</th><th class="num">IV</th><th class="num">Δ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="r in chainRows" :key="r.strike" :class="{ atm: r.atm }">
                                        <td class="num" :class="{ itm: r.c?.InTheMoney }">{{ fmtN(r.c?.Delta, 2) }}</td>
                                        <td class="num" :class="{ itm: r.c?.InTheMoney }">{{ fmtN(r.c?.IvPct, 1) }}</td>
                                        <td class="num" :class="{ itm: r.c?.InTheMoney }" :style="{ background: heatSeq((r.c?.OpenInterest ?? 0) / maxOi) }">{{ fmtBig(r.c?.OpenInterest) }}</td>
                                        <td class="num" :class="{ itm: r.c?.InTheMoney }">{{ fmtBig(r.c?.Volume) }}</td>
                                        <td class="num" :class="{ itm: r.c?.InTheMoney }">{{ fmtN(r.c?.Bid, 2) }}</td>
                                        <td class="num" :class="{ itm: r.c?.InTheMoney }">{{ fmtN(r.c?.Ask, 2) }}</td>
                                        <td class="num" :class="{ itm: r.c?.InTheMoney }">{{ fmtN(r.c?.Last, 2) }}</td>
                                        <td class="num strike mono">{{ fmtN(r.strike, 2) }}</td>
                                        <td class="num" :class="{ itm: r.p?.InTheMoney }">{{ fmtN(r.p?.Last, 2) }}</td>
                                        <td class="num" :class="{ itm: r.p?.InTheMoney }">{{ fmtN(r.p?.Bid, 2) }}</td>
                                        <td class="num" :class="{ itm: r.p?.InTheMoney }">{{ fmtN(r.p?.Ask, 2) }}</td>
                                        <td class="num" :class="{ itm: r.p?.InTheMoney }">{{ fmtBig(r.p?.Volume) }}</td>
                                        <td class="num" :class="{ itm: r.p?.InTheMoney }" :style="{ background: heatSeq((r.p?.OpenInterest ?? 0) / maxOi) }">{{ fmtBig(r.p?.OpenInterest) }}</td>
                                        <td class="num" :class="{ itm: r.p?.InTheMoney }">{{ fmtN(r.p?.IvPct, 1) }}</td>
                                        <td class="num" :class="{ itm: r.p?.InTheMoney }">{{ fmtN(r.p?.Delta, 2) }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </OtPanel>
                    <div class="ot-grid two">
                        <OtPanel title="IV smile" persist="sec.smile"><OtCurve :series="equitySmile" :height="200" :log-x="false" :decimals="1" /></OtPanel>
                        <OtPanel title="ATM IV term structure" persist="sec.term"><OtCurve :series="equityTerm" :height="200" :log-x="false" :decimals="1" /></OtPanel>
                    </div>
                </template>
            </template>
        </div>

        <!-- DER -->
        <div v-else-if="state.tab === 'DER'" class="ot-stack">
            <div class="ot-toolbar">
                <div class="ot-segment sm mono"><button v-for="p in ['5m', '15m', '1h', '4h', '1d']" :key="p" type="button" :aria-pressed="derPeriod === p" @click="derPeriod = p; loadDer()">{{ p }}</button></div>
                <span v-if="der?.Current" class="summary">
                    funding <b :class="tone(der.Current.FundingRate)">{{ (der.Current.FundingRate * 100).toFixed(4) }}%</b> ({{ fmtChg(der.Current.FundingAnnualPct, 1) }} ann.)
                    · basis <b :class="tone(der.Current.BasisPct)">{{ fmtChg(der.Current.BasisPct, 3) }}</b> · mark <b>{{ fmtPrice(der.Current.MarkPrice) }}</b>
                    · next {{ fmtDateTime(der.Current.NextFundingUtc).slice(11) }} UTC
                </span>
            </div>
            <div v-if="loadingDer" class="ot-state compact"><span class="ot-spin"></span></div>
            <div v-else-if="derError" class="ot-state compact error"><strong>{{ derError }}</strong></div>
            <template v-else-if="der">
                <div class="ot-grid two">
                    <OtPanel title="Funding (annualised %)" code="FUND" persist="sec.der.fund"><OtSeries :series="[{ name: 'funding', type: 'histogram', data: der.Funding.map((p: any) => ({ t: p.T, v: p.V * 3 * 365 * 100 })) }]" :height="200" format="pct" /></OtPanel>
                    <OtPanel title="Open interest (USD)" code="OI" persist="sec.der.oi"><OtSeries :series="[{ name: 'OI', type: 'area', data: der.OpenInterestValue.map((p: any) => ({ t: p.T, v: p.V })) }]" :height="200" format="big" time-visible /></OtPanel>
                    <OtPanel title="Long/short ratio" persist="sec.der.ls">
                        <OtSeries :series="[{ name: 'accounts', data: der.LongShortAccounts.map((p: any) => ({ t: p.T, v: p.V })) }, { name: 'top traders', data: der.TopTraderLongShort.map((p: any) => ({ t: p.T, v: p.V })) }]" :height="200" time-visible />
                    </OtPanel>
                    <OtPanel title="Taker buy/sell" persist="sec.der.taker">
                        <OtSeries :series="[{ name: 'taker', type: 'baseline', data: der.TakerBuySell.map((p: any) => ({ t: p.T, v: p.V })) }]" :baseline="1" :height="200" time-visible />
                    </OtPanel>
                </div>
                <OtPanel title="Cross-venue funding" flush persist="sec.der.venues">
                    <OtGrid :rows="der.Venues" :columns="venueCols" bare :row-key="(r: any) => r.Venue" />
                </OtPanel>
            </template>
        </div>

        <!-- CF -->
        <OtPanel v-else-if="state.tab === 'CF'" title="SEC filings" code="CF" flush :loading="loadingFilings" :error="filingsError" :empty="!filings.length && !loadingFilings">
            <template #controls>
                <select v-model="filingForm" class="ot-select sm auto" @change="loadFilings"><option value="">all forms</option><option v-for="f in ['10-K', '10-Q', '8-K', '4', 'S-1', 'DEF 14A', '13F-HR', 'SC 13G']" :key="f" :value="f">{{ f }}</option></select>
            </template>
            <OtGrid :rows="filings" :columns="filingCols" grid-key="filings" :row-key="(r: any) => r.Accession" export-name="filings">
                <template #cell-Url="{ row }"><a :href="row.Url" target="_blank" rel="noopener" class="info-text">open</a></template>
            </OtGrid>
        </OtPanel>

        <!-- CN -->
        <OtPanel v-else-if="state.tab === 'CN'" title="News" code="CN" flush :loading="loadingNews" :empty="!symbolNews.length && !loadingNews">
            <ul class="news">
                <li v-for="n in symbolNews" :key="n.Url">
                    <span class="t mono">{{ fmtDateTime(n.PublishedUtc) }}</span>
                    <a :href="n.Url" target="_blank" rel="noopener">{{ n.Title }}</a>
                    <span class="src">{{ n.Source }}</span>
                </li>
            </ul>
        </OtPanel>

        <!-- DATA -->
        <OtPanel v-else-if="state.tab === 'DATA'" title="Bars" code="DATA" flush :loading="loadingBars" :empty="!barRows.length && !loadingBars">
            <template #controls>
                <div class="ot-segment sm mono"><button v-for="i in INTERVALS" :key="i.value" type="button" :aria-pressed="state.interval === i.value" @click="state.interval = i.value; loadBars()">{{ i.short }}</button></div>
            </template>
            <OtGrid :rows="barRows" :columns="barCols" grid-key="bars" :row-key="(r: any) => String(r.T)" :export-name="`${symbol}-${state.interval}`" default-sort="Time" max-height="640px" />
        </OtPanel>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import { useOmniTrader, useUrlState } from '~/composables/useOmniTrader';
import {
    INTERVALS, SWAL_TERMINAL, baseAsset, downloadCsv, fmtAge, fmtBig, fmtChg, fmtDateTime, fmtDay10, fmtInt, fmtN, fmtPctPlain, fmtPrice, fmtSignedN,
    heat, heatSeq, isAbort, isCrypto, tGet, tPost, tone, useLatest, usePersisted, useRecentSymbols, type ChartPayload,
} from '~/composables/useTerminal';
import type { GridColumn } from '~/components/Ot/Grid.vue';
import type { CurveSeries } from '~/components/Ot/Curve.vue';

definePageMeta({ layout: 'navbar' });

const { get, post } = useOmniTrader();
const { state } = useUrlState({ symbol: 'BTCUSDT', tab: 'GP', interval: 'OneDay' });
const { push: pushRecent } = useRecentSymbols();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const symbol = computed(() => (state.symbol || 'BTCUSDT').toUpperCase());
const symbolModel = computed({ get: () => symbol.value, set: (v: string) => { state.symbol = v; } });
const crypto = computed(() => isCrypto(symbol.value));
const base = computed(() => baseAsset(symbol.value));
const chartHeight = computed(() => (typeof window !== 'undefined' ? Math.max(460, window.innerHeight - 250) : 640));

const tabs = computed(() => [
    { id: 'GP', label: 'Chart' }, { id: 'DES', label: 'Overview' },
    ...(crypto.value ? [] : [{ id: 'FA', label: 'Financials' }]),
    { id: 'HP', label: 'Stats' }, { id: 'SEAS', label: 'Seasonality' },
    ...(crypto.value && !['BTC', 'ETH'].includes(base.value) ? [] : [{ id: 'OMON', label: 'Options' }]),
    ...(crypto.value ? [{ id: 'DER', label: 'Derivatives' }] : [{ id: 'CF', label: 'Filings' }]),
    { id: 'CN', label: 'News' }, { id: 'DATA', label: 'Bars' },
]);

// ── header ───────────────────────────────────────────────────────────────────

const quote = ref<any>(null);
const quoteError = ref('');
const busy = ref(false);
const watched = ref(false);
const netChange = computed(() => quote.value?.Price && quote.value?.PreviousClose ? quote.value.Price - quote.value.PreviousClose : null);
const displayName = computed(() => {
    const n = quote.value?.DisplayName;
    if (n && n.toUpperCase() !== symbol.value) return n;
    return company.value?.Name ?? coin.value?.Name ?? '';
});

async function loadQuote() {
    try {
        quote.value = await get<any>('/quote', { symbol: symbol.value });
        quoteError.value = '';
        // Instrument-master ids (crypto:BTC/USD) resolve to the engine symbol.
        if (symbol.value.includes(':') && quote.value?.Symbol && quote.value.Symbol.toUpperCase() !== symbol.value) state.symbol = quote.value.Symbol;
        if (quote.value?.InstrumentId) {
            const lists = await get<any>('/markets/watchlists').catch(() => null);
            const all = Array.isArray(lists) ? lists : lists?.Watchlists ?? [];
            watched.value = all.some((l: any) => (l.InstrumentIds ?? []).includes(quote.value.InstrumentId));
        }
    } catch (e: any) { quoteError.value = e?.message ?? 'quote failed'; }
}

async function toggleWatch() {
    busy.value = true;
    try {
        await post('/markets/watchlist/instrument', undefined, { InstrumentId: quote.value.InstrumentId, Remove: watched.value });
        watched.value = !watched.value;
    } catch (e: any) { void Swal.fire({ title: 'Watchlist', text: e?.message, icon: 'error', ...SWAL_TERMINAL }); }
    finally { busy.value = false; }
}

// ── DES ──────────────────────────────────────────────────────────────────────

const company = ref<any>(null);
const coin = ref<any>(null);
const loadingDes = ref(false);
const desError = ref<string | null>(null);
async function loadDes() {
    loadingDes.value = true;
    desError.value = null;
    try {
        if (crypto.value) {
            const coins = await tGet<any[]>('/terminal/crypto/coins', { count: 250 });
            coin.value = coins?.find(c => c.BinanceSymbol === symbol.value) ?? coins?.find(c => c.Symbol?.toUpperCase() === base.value) ?? null;
            company.value = null;
            void loadDepth();
        } else {
            company.value = await tGet<any>('/terminal/company', { symbol: symbol.value });
            coin.value = null;
        }
    } catch (e: any) { desError.value = e?.message ?? 'failed'; }
    finally { loadingDes.value = false; }
    void loadBook();
}

// Order book: rows are [price, size, cumulative size], best first, grouped server-side.
const depth = ref<any>(null);
const loadingDepth = ref(false);
const depthError = ref<string | null>(null);
const bookPrefs = usePersisted<{ rows: number; live: boolean; groups: Record<string, string> }>('sec.book.prefs', { rows: 20, live: true, groups: {} });
bookPrefs.value.groups ??= {};
/** '' = the server's default grouping for the price; remembered per symbol. */
const bookGroup = computed({
    get: () => bookPrefs.value.groups[symbol.value] ?? '',
    set: (v: string) => { bookPrefs.value.groups = { ...bookPrefs.value.groups, [symbol.value]: v }; },
});
const bookLatest = useLatest();
async function loadDepth(silent = false) {
    if (!crypto.value) return;
    const signal = bookLatest.next();
    if (!silent) loadingDepth.value = true;
    try {
        depth.value = await tGet<any>('/terminal/crypto/orderbook', { symbol: symbol.value, rows: bookPrefs.value.rows, group: bookGroup.value || undefined }, signal);
        depthError.value = null;
    } catch (e: any) {
        if (!isAbort(e)) {
            depthError.value = e?.message ?? 'order book unavailable';
            if (!silent) depth.value = null;
        }
    } finally {
        if (!silent) loadingDepth.value = false;
    }
}
watch(() => [bookGroup.value, bookPrefs.value.rows], () => { if (state.tab === 'DES') void loadDepth(true); });
let bookTimer: ReturnType<typeof setInterval> | null = null;
function scheduleBook() {
    if (bookTimer) clearInterval(bookTimer);
    bookTimer = null;
    if (!bookPrefs.value.live || state.tab !== 'DES' || !crypto.value) return;
    bookTimer = setInterval(() => { if (!document.hidden) void loadDepth(true); }, 2500);
}
watch(() => [bookPrefs.value.live, state.tab, crypto.value, symbol.value], scheduleBook, { immediate: true });
onBeforeUnmount(() => { if (bookTimer) clearInterval(bookTimer); bookLatest.abort(); });

function decimalsOf(v: number | null | undefined): number {
    if (v === null || v === undefined || !Number.isFinite(v) || v <= 0) return 0;
    const s = v.toFixed(12).replace(/0+$/, '');
    const dot = s.indexOf('.');
    return dot < 0 ? 0 : s.length - dot - 1;
}
const groupDecimals = computed(() => decimalsOf(depth.value?.Group));
const tickDecimals = computed(() => decimalsOf(depth.value?.TickSize));
const sizeDecimals = computed(() => Math.min(5, decimalsOf(depth.value?.StepSize ?? 0.0001)));
const bookLevels = computed<number[][]>(() => [...(depth.value?.Bids ?? []), ...(depth.value?.Asks ?? [])]);
const levelMax = computed(() => Math.max(1e-12, ...bookLevels.value.map(l => l[1])));
const cumMax = computed(() => Math.max(1e-12, ...bookLevels.value.map(l => l[2] ?? l[1])));
/** A level several times the median visible level stands out as a wall. */
const wallMin = computed(() => {
    const sizes = bookLevels.value.map(l => l[1]).sort((a, b) => a - b);
    return sizes.length < 6 ? Infinity : sizes[Math.floor(sizes.length / 2)] * 4;
});
function isWall(size: number) { return size >= wallMin.value; }
function barPct(v: number, max: number) { return `${Math.min(100, (v / max) * 100).toFixed(1)}%`; }
function fmtBps(v: number | null | undefined) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '—';
    return v < 0.01 ? v.toFixed(4) : v < 1 ? v.toFixed(3) : v.toFixed(2);
}
function coverageNote(side: 'bid' | 'ask') {
    const reach = side === 'bid' ? depth.value?.Coverage?.BidPct : depth.value?.Coverage?.AskPct;
    return `The snapshot reaches ${fmtN(reach, 2)}% from mid on the ${side} side; liquidity beyond it is not counted.`;
}

const row = ref<any>(null);
const positions = ref<any[]>([]);
const loadingBook = ref(false);
async function loadBook() {
    loadingBook.value = true;
    try {
        const id = quote.value?.InstrumentId ?? symbol.value;
        const [markets, portfolio] = await Promise.all([
            get<any>('/markets', { instruments: id, interval: 'OneDay' }).catch(() => null),
            get<any>('/portfolio').catch(() => null),
        ]);
        row.value = markets?.Rows?.[0] ?? null;
        positions.value = (portfolio?.Lines ?? []).filter((l: any) => String(l.InstrumentId ?? '').toLowerCase() === String(id).toLowerCase());
    } finally { loadingBook.value = false; }
}
const positionCols: GridColumn[] = [
    { key: 'Venue', label: 'Venue', format: 'text' }, { key: 'Environment', label: 'Env', format: 'text' },
    { key: 'Quantity', label: 'Qty', format: 'num', decimals: 6, signed: true }, { key: 'AveragePrice', label: 'Avg', format: 'price' },
    { key: 'UnrealizedPnL', label: 'Unreal.', format: 'signed', signed: true },
];

const upside = computed(() => company.value?.Analysts?.TargetMean && quote.value?.Price ? (company.value.Analysts.TargetMean / quote.value.Price - 1) * 100 : null);

const statRows = computed(() => {
    const s = company.value?.Stats ?? {};
    return Object.entries(s).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => {
        const n = v as number;
        const pct = /%|margin|yield|growth|return|payout/i.test(k);
        return { k, v: Math.abs(n) >= 1e6 ? fmtBig(n) : fmtN(n, Math.abs(n) >= 100 ? 1 : 2), cls: pct ? tone(n) : '' };
    });
});

const earnCols: GridColumn[] = [
    { key: 'Period', label: 'Quarter', format: 'text' }, { key: 'Actual', label: 'EPS', format: 'num' },
    { key: 'Estimate', label: 'Est.', format: 'num' }, { key: 'SurprisePct', label: 'Surprise', format: 'chg', heat: 20 },
];
const holderCols: GridColumn[] = [
    { key: 'Name', label: 'Holder', format: 'text', clip: 260 }, { key: 'PctHeld', label: '% held', format: 'num', value: r => r.PctHeld === null ? null : r.PctHeld <= 1 ? r.PctHeld * 100 : r.PctHeld },
    { key: 'Shares', label: 'Shares', format: 'big' }, { key: 'Value', label: 'Value', format: 'big' }, { key: 'ReportDate', label: 'As of', format: 'date' },
];
const insiderCols: GridColumn[] = [
    { key: 'Name', label: 'Insider', format: 'text' }, { key: 'Relation', label: 'Role', format: 'text' }, { key: 'Text', label: 'Transaction', format: 'text' },
    { key: 'Date', label: 'Date', format: 'date' }, { key: 'Shares', label: 'Shares', format: 'big' }, { key: 'Value', label: 'Value', format: 'big' },
];
const ratingCols: GridColumn[] = [
    { key: 'Date', label: 'Date', format: 'date' }, { key: 'Firm', label: 'Firm', format: 'text' }, { key: 'Action', label: 'Action', format: 'text' },
    { key: 'From', label: 'From', format: 'text' }, { key: 'To', label: 'To', format: 'text' },
];
const officerCols: GridColumn[] = [
    { key: 'Name', label: 'Name', format: 'text' }, { key: 'Title', label: 'Title', format: 'text' }, { key: 'Age', label: 'Age', format: 'int' }, { key: 'Pay', label: 'Pay', format: 'big' },
];

// ── FA ───────────────────────────────────────────────────────────────────────

const financials = ref<any>(null);
const secFacts = ref<any>(null);
const loadingFa = ref(false);
const faError = ref<string | null>(null);
const faPeriod = ref<'Annual' | 'Quarterly'>('Annual');
const faSource = ref<'yahoo' | 'sec'>('yahoo');

async function loadFa() {
    loadingFa.value = true;
    faError.value = null;
    try { financials.value = await tGet<any>('/terminal/financials', { symbol: symbol.value }); }
    catch (e: any) { faError.value = e?.message ?? 'failed'; }
    finally { loadingFa.value = false; }
}
async function loadSec() {
    if (secFacts.value?.Ticker?.toUpperCase() === symbol.value) return;
    loadingFa.value = true;
    try { secFacts.value = await tGet<any>('/terminal/sec/facts', { symbol: symbol.value }); faError.value = null; }
    catch (e: any) { faError.value = e?.message ?? 'SEC facts unavailable'; }
    finally { loadingFa.value = false; }
}

const FA_GROUPS = [
    { name: 'Income statement', keys: ['TotalRevenue', 'CostOfRevenue', 'GrossProfit', 'ResearchAndDevelopment', 'OperatingExpense', 'OperatingIncome', 'EBITDA', 'InterestExpense', 'TaxProvision', 'NetIncome', 'BasicEPS', 'DilutedEPS', 'DilutedAverageShares'] },
    { name: 'Balance sheet', keys: ['TotalAssets', 'CurrentAssets', 'CashAndCashEquivalents', 'TotalLiabilitiesNetMinorityInterest', 'CurrentLiabilities', 'TotalDebt', 'NetDebt', 'WorkingCapital', 'StockholdersEquity', 'RetainedEarnings'] },
    { name: 'Cash flow', keys: ['OperatingCashFlow', 'CapitalExpenditure', 'FreeCashFlow', 'RepurchaseOfCapitalStock', 'CashDividendsPaid'] },
];
const metricLabel = (k: string) => k.replace('NetMinorityInterest', '').replace(/([a-z])([A-Z])/g, '$1 $2').trim();

const faData = computed<Record<string, { Date: string; Value: number }[]>>(() => {
    const src = faSource.value === 'sec' ? secFacts.value : financials.value;
    return (src?.[faPeriod.value] ?? {}) as Record<string, { Date: string; Value: number }[]>;
});
const faDates = computed(() => {
    const all = new Set<string>();
    for (const list of Object.values(faData.value)) for (const p of list) all.add(fmtDay10(p.Date));
    return [...all].sort().slice(faPeriod.value === 'Annual' ? -8 : -10);
});
const faScale = computed(() => {
    const ref_ = faData.value['TotalRevenue'] ?? faData.value['Revenues'] ?? Object.values(faData.value)[0] ?? [];
    const m = Math.max(0, ...ref_.map(p => Math.abs(p.Value)));
    return m >= 1e9 ? 1e9 : m >= 1e6 ? 1e6 : 1e3;
});
const faUnitLabel = computed(() => (faScale.value === 1e9 ? 'billions' : faScale.value === 1e6 ? 'millions' : 'thousands'));
function faFmt(v: number | null, key: string) {
    if (v === null || v === undefined) return '—';
    if (/EPS/i.test(key)) return v.toFixed(2);
    const d = faScale.value === 1e9 ? 2 : 1;
    return (v / faScale.value).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
}
function seriesFor(key: string) {
    const byDate = new Map((faData.value[key] ?? []).map(p => [fmtDay10(p.Date), p.Value]));
    return faDates.value.map(d => byDate.get(d) ?? null);
}
function cagr(values: (number | null)[]) {
    const v = values.filter((x): x is number => x !== null);
    if (v.length < 2 || v[0] <= 0 || v[v.length - 1] <= 0) return null;
    const years = (v.length - 1) / (faPeriod.value === 'Annual' ? 1 : 4);
    return (Math.pow(v[v.length - 1] / v[0], 1 / years) - 1) * 100;
}
const faGroups = computed(() => {
    const groups = faSource.value === 'sec' ? [{ name: 'SEC XBRL facts', keys: Object.keys(faData.value).sort() }] : FA_GROUPS;
    const out = groups.map(g => ({
        name: g.name,
        rows: g.keys.filter(k => faData.value[k]?.length).map(k => { const values = seriesFor(k); return { key: k, label: metricLabel(k), values, cagr: cagr(values), derived: false, pct: false }; }),
    })).filter(g => g.rows.length);
    if (faSource.value === 'yahoo' && faData.value['TotalRevenue']) {
        const rev = seriesFor('TotalRevenue');
        const ratio = (k: string) => seriesFor(k).map((v, i) => (v !== null && rev[i] ? (v / rev[i]!) * 100 : null));
        const growth = rev.map((v, i) => (i > 0 && v !== null && rev[i - 1] ? (v / rev[i - 1]! - 1) * 100 : null));
        out.push({
            name: 'Ratios', rows: [
                { key: 'rev_growth', label: 'Revenue growth', values: growth, cagr: null, derived: true, pct: true },
                { key: 'gross_margin', label: 'Gross margin', values: ratio('GrossProfit'), cagr: null, derived: true, pct: true },
                { key: 'op_margin', label: 'Operating margin', values: ratio('OperatingIncome'), cagr: null, derived: true, pct: true },
                { key: 'net_margin', label: 'Net margin', values: ratio('NetIncome'), cagr: null, derived: true, pct: true },
                { key: 'fcf_margin', label: 'FCF margin', values: ratio('FreeCashFlow'), cagr: null, derived: true, pct: true },
            ].filter(r => r.values.some(v => v !== null)),
        });
    }
    return out;
});
function exportFa() {
    downloadCsv(`${symbol.value}-${faPeriod.value}`, ['Metric', ...faDates.value], faGroups.value.flatMap(g => g.rows.map(r => [r.label, ...r.values])));
}

// ── HP ───────────────────────────────────────────────────────────────────────

const stats = ref<any>(null);
const loadingStats = ref(false);
const statsError = ref<string | null>(null);
async function loadStats() {
    loadingStats.value = true;
    try { stats.value = await tGet<any>('/terminal/stats', { symbol: symbol.value }); statsError.value = null; }
    catch (e: any) { statsError.value = e?.message ?? 'failed'; }
    finally { loadingStats.value = false; }
}
const FIELD_LABELS: Record<string, [string, 'pct' | 'chg' | 'num' | 'big']> = {
    rsi14: ['RSI 14', 'num'], atrpct: ['ATR %', 'pct'], vol20: ['Vol 20d', 'pct'], adx14: ['ADX 14', 'num'], dist52h: ['From 52w high', 'chg'],
    dist52l: ['From 52w low', 'chg'], sma50dist: ['vs 50d MA', 'chg'], sma200dist: ['vs 200d MA', 'chg'], relvol: ['Rel. volume', 'num'],
    dollarvol: ['$ volume 20d', 'big'], trend: ['Trend score', 'num'], gap: ['Gap', 'chg'], mcap: ['Market cap', 'big'], pe: ['P/E', 'num'],
    fpe: ['Fwd P/E', 'num'], divyield: ['Div. yield', 'pct'],
};
const statFields = computed(() => {
    const f = stats.value?.Fields ?? {};
    return Object.entries(FIELD_LABELS).filter(([k]) => f[k] !== null && f[k] !== undefined).map(([k, [lbl, kind]]) => {
        const v = f[k] as number;
        const text = kind === 'big' ? fmtBig(v) : kind === 'pct' ? fmtPctPlain(v, 2) : kind === 'chg' ? fmtChg(v, 1) : fmtN(v, 2);
        return { k, label: lbl, text, cls: kind === 'chg' ? tone(v) : '' };
    });
});
const coneCols: GridColumn[] = [
    { key: 'Window', label: 'Window', format: 'int' }, { key: 'Current', label: 'Now', format: 'num', decimals: 1 },
    { key: 'Percentile', label: 'Pctile', format: 'pct', decimals: 0, heat: 'seq', heatValue: r => (r.Percentile == null ? null : r.Percentile / 100) },
    { key: 'Min', label: 'Min', format: 'num', decimals: 1 }, { key: 'P25', label: 'P25', format: 'num', decimals: 1 }, { key: 'Median', label: 'Med', format: 'num', decimals: 1 },
    { key: 'P75', label: 'P75', format: 'num', decimals: 1 }, { key: 'Max', label: 'Max', format: 'num', decimals: 1 },
];
const ddCols: GridColumn[] = [
    { key: 'DepthPct', label: 'Depth', format: 'chg', decimals: 1 }, { key: 'Peak', label: 'Peak', format: 'date' }, { key: 'Trough', label: 'Trough', format: 'date' },
    { key: 'Recovery', label: 'Recovered', format: 'date' }, { key: 'DaysToTrough', label: 'To trough', format: 'int', hint: 'Days from peak to trough' }, { key: 'DaysToRecover', label: 'To recover', format: 'int', hint: 'Days from trough back to the peak' },
];
const yearCols: GridColumn[] = [
    { key: 'Year', label: 'Year', format: 'text' }, { key: 'ReturnPct', label: 'Return', format: 'chg', heat: 40, decimals: 1 },
    { key: 'High', label: 'High', format: 'price' }, { key: 'Low', label: 'Low', format: 'price' }, { key: 'Partial', label: 'Partial', format: 'bool' },
];

// ── SEAS ─────────────────────────────────────────────────────────────────────

const seas = ref<any>(null);
const loadingSeas = ref(false);
const seasError = ref<string | null>(null);
const seasYears = ref(10);
async function loadSeas() {
    loadingSeas.value = true;
    try { seas.value = await tGet<any>('/terminal/seasonality', { symbol: symbol.value, years: seasYears.value }); seasError.value = null; }
    catch (e: any) { seasError.value = e?.message ?? 'failed'; }
    finally { loadingSeas.value = false; }
}
const seasCols: GridColumn[] = [
    { key: 'M', label: '', format: 'text' }, { key: 'Mean', label: 'Mean %', format: 'signed', decimals: 2, heat: 3 }, { key: 'Median', label: 'Median', format: 'signed', decimals: 2 },
    { key: 'PositivePct', label: 'Hit %', format: 'pct' }, { key: 'TStat', label: 't', format: 'num' }, { key: 'Count', label: 'N', format: 'int' },
];

// ── OMON ─────────────────────────────────────────────────────────────────────

const options = ref<any>(null);
const cryptoOpt = ref<any>(null);
const loadingOpt = ref(false);
const optError = ref<string | null>(null);
const optExpiry = ref<string>('');
const strikeWindow = ref(20);
const smileExpiry = ref('');

async function loadOptions() {
    loadingOpt.value = true;
    optError.value = null;
    try {
        if (crypto.value) {
            cryptoOpt.value = await tGet<any>('/terminal/crypto/options', { currency: base.value });
            if (!smileExpiry.value) smileExpiry.value = cryptoExpiries.value[Math.min(2, Math.max(0, cryptoExpiries.value.length - 1))] ?? '';
        } else {
            options.value = await tGet<any>('/terminal/options', { symbol: symbol.value, expiration: optExpiry.value || undefined });
            optExpiry.value = options.value?.Expiration ?? optExpiry.value;
        }
    } catch (e: any) { optError.value = e?.message ?? 'no options'; }
    finally { loadingOpt.value = false; }
}

const chainRows = computed(() => {
    const o = options.value;
    if (!o) return [];
    const strikes = [...new Set<number>([...(o.Calls ?? []), ...(o.Puts ?? [])].map((c: any) => c.Strike))].sort((a, b) => a - b);
    if (!strikes.length) return [];
    const spot = o.UnderlyingPrice ?? 0;
    let atm = 0;
    strikes.forEach((s, i) => { if (Math.abs(s - spot) < Math.abs(strikes[atm] - spot)) atm = i; });
    const lo = Math.max(0, atm - strikeWindow.value), hi = Math.min(strikes.length, atm + strikeWindow.value + 1);
    return strikes.slice(lo, hi).map((s, i) => ({
        strike: s, atm: lo + i === atm,
        c: (o.Calls ?? []).find((c: any) => c.Strike === s), p: (o.Puts ?? []).find((p: any) => p.Strike === s),
    }));
});
const maxOi = computed(() => Math.max(1, ...chainRows.value.flatMap(r => [r.c?.OpenInterest ?? 0, r.p?.OpenInterest ?? 0])));
const equitySmile = computed<CurveSeries[]>(() => {
    const o = options.value;
    if (!o) return [];
    const pts = (list: any[]) => list.filter(c => c.IvPct && c.IvPct < 400).map(c => ({ x: c.Strike, y: c.IvPct, label: String(c.Strike) }));
    return [{ name: 'calls', color: '#26c281', points: pts(o.Calls ?? []) }, { name: 'puts', color: '#f2545b', points: pts(o.Puts ?? []) }];
});
const equityTerm = computed<CurveSeries[]>(() => [{
    name: 'ATM IV', color: '#f5a524',
    points: (options.value?.TermStructure ?? []).filter((t: any) => t.AtmIvPct).map((t: any) => ({ x: t.Days, y: t.AtmIvPct, label: fmtDay10(t.Expiration).slice(5) })),
}]);
const cryptoTerm = computed<CurveSeries[]>(() => [{
    name: 'ATM IV', color: '#f5a524',
    points: (cryptoOpt.value?.Term ?? []).filter((t: any) => t.AtmIv).map((t: any) => ({ x: t.Days, y: t.AtmIv, label: fmtDay10(t.Expiry).slice(5) })),
}]);
const cryptoExpiries = computed<string[]>(() => [...new Set<string>((cryptoOpt.value?.Points ?? []).map((p: any) => p.Expiry))].sort());
const smileSeries = computed<CurveSeries[]>(() => {
    const pts = (cryptoOpt.value?.Points ?? []).filter((p: any) => p.Expiry === smileExpiry.value && p.MarkIv);
    const side = (call: boolean) => pts.filter((p: any) => p.Call === call).sort((a: any, b: any) => a.Strike - b.Strike).map((p: any) => ({ x: p.Strike, y: p.MarkIv, label: String(p.Strike) }));
    return [{ name: 'calls', color: '#26c281', points: side(true) }, { name: 'puts', color: '#f2545b', points: side(false) }];
});

// ── DER ──────────────────────────────────────────────────────────────────────

const der = ref<any>(null);
const loadingDer = ref(false);
const derError = ref<string | null>(null);
const derPeriod = ref('1h');
async function loadDer() {
    loadingDer.value = true;
    try { der.value = await tGet<any>('/terminal/crypto/derivatives', { symbol: symbol.value, period: derPeriod.value, limit: 200 }); derError.value = null; }
    catch (e: any) { derError.value = e?.message ?? 'No perpetual for this symbol'; }
    finally { loadingDer.value = false; }
}
const venueCols: GridColumn[] = [
    { key: 'Venue', label: 'Venue', format: 'text' }, { key: 'Instrument', label: 'Instrument', format: 'sym' },
    { key: 'FundingRate', label: 'Rate %', format: 'num', decimals: 4, value: r => (r.FundingRate === null || r.FundingRate === undefined ? null : r.FundingRate * 100) },
    { key: 'FundingAnnualPct', label: 'Annualised', format: 'chg', heat: 30, decimals: 1 }, { key: 'NextFundingUtc', label: 'Next', format: 'datetime' },
];

// ── CF / CN / DATA ───────────────────────────────────────────────────────────

const filings = ref<any[]>([]);
const loadingFilings = ref(false);
const filingsError = ref<string | null>(null);
const filingForm = ref('');
async function loadFilings() {
    loadingFilings.value = true;
    try { filings.value = await tGet<any[]>('/terminal/sec/filings', { symbol: symbol.value, form: filingForm.value || undefined }) ?? []; filingsError.value = null; }
    catch (e: any) { filingsError.value = e?.message ?? 'failed'; }
    finally { loadingFilings.value = false; }
}
const filingCols: GridColumn[] = [
    { key: 'FiledUtc', label: 'Filed', format: 'date' }, { key: 'Form', label: 'Form', format: 'sym' }, { key: 'ReportDate', label: 'Period', format: 'date' },
    { key: 'Description', label: 'Description', format: 'text', clip: 380 }, { key: 'Url', label: '', format: 'text', sortable: false },
];

const symbolNews = ref<any[]>([]);
const loadingNews = ref(false);
async function loadNews() {
    loadingNews.value = true;
    try { symbolNews.value = await tGet<any[]>('/terminal/news', { symbol: symbol.value, limit: 60 }) ?? []; }
    catch { symbolNews.value = []; }
    finally { loadingNews.value = false; }
}

const barData = ref<ChartPayload | null>(null);
const loadingBars = ref(false);
async function loadBars() {
    loadingBars.value = true;
    try { barData.value = await tPost<ChartPayload>('/terminal/chart', { Symbol: symbol.value, Interval: state.interval, Count: 2000 }); }
    catch { barData.value = null; }
    finally { loadingBars.value = false; }
}
const barRows = computed(() => {
    const p = barData.value;
    if (!p) return [];
    return p.Time.map((t, i) => ({
        T: t, Time: t, Open: p.Open[i], High: p.High[i], Low: p.Low[i], Close: p.Close[i], Volume: p.Volume[i],
        Chg: i > 0 && p.Close[i - 1] ? (p.Close[i] / p.Close[i - 1] - 1) * 100 : null, Range: p.Close[i] ? ((p.High[i] - p.Low[i]) / p.Close[i]) * 100 : null,
    }));
});
const barCols: GridColumn[] = [
    { key: 'Time', label: 'Bar (UTC)', format: 'datetime' }, { key: 'Open', label: 'Open', format: 'price' }, { key: 'High', label: 'High', format: 'price' },
    { key: 'Low', label: 'Low', format: 'price' }, { key: 'Close', label: 'Close', format: 'price' }, { key: 'Chg', label: 'Chg', format: 'chg', heat: 4 },
    { key: 'Range', label: 'Range %', format: 'pct', decimals: 2 }, { key: 'Volume', label: 'Volume', format: 'big' },
];

// ── per-tab loading ──────────────────────────────────────────────────────────

const loaded = new Set<string>();
function loadTab(tab: string) {
    const key = `${symbol.value}:${tab}`;
    if (loaded.has(key)) return;
    loaded.add(key);
    switch (tab) {
        case 'DES': void loadDes(); break;
        case 'FA': void loadFa(); break;
        case 'HP': void loadStats(); break;
        case 'SEAS': void loadSeas(); break;
        case 'OMON': void loadOptions(); break;
        case 'DER': void loadDer(); break;
        case 'CF': void loadFilings(); break;
        case 'CN': void loadNews(); break;
        case 'DATA': void loadBars(); break;
    }
}

watch(symbol, s => {
    loaded.clear();
    company.value = coin.value = financials.value = secFacts.value = stats.value = seas.value = options.value = cryptoOpt.value = der.value = depth.value = null;
    optExpiry.value = '';
    smileExpiry.value = '';
    if (!s.includes(':')) pushRecent(s);
    void loadQuote();
    if (!tabs.value.some(t => t.id === state.tab)) state.tab = 'GP';
    loadTab(state.tab);
}, { immediate: true });
watch(() => state.tab, t => loadTab(t));
</script>

<style scoped>
.sechead { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 2px 2px 6px; }
.sechead .id { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.sechead .sym { font-size: 18px; font-weight: 700; color: var(--ot-accent-2); }
.sechead .nm { font-size: 13px; color: var(--ot-text); font-weight: 600; }
.sechead .meta { font-size: 11px; color: var(--ot-muted); }
.sechead .px { display: flex; align-items: baseline; gap: 10px; }
.sechead .last { font-size: 20px; font-weight: 700; }
.sechead .chg { font-size: 13px; }
.sechead .state { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; color: var(--ot-muted); }
.sechead .grow { flex: 1 1 auto; }
.sechead .acts { display: flex; gap: 6px; }
.gp { border: 1px solid var(--ot-line); border-radius: var(--ot-radius); overflow: hidden; }
.kvgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1px 16px; }
.kvgrid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.kv { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.035); font-size: 12px; }
.kv .k { color: var(--ot-muted); }
.summary { color: var(--ot-text-2); font-size: 12px; line-height: 18px; max-width: 110ch; }
.facts { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 8px; font-size: 11px; color: var(--ot-muted); }
.facts a { color: var(--ot-info); }
.small { font-size: 10.5px; }
.recbar { display: flex; height: 16px; margin-top: 8px; border-radius: 2px; overflow: hidden; font-size: 10px; font-family: var(--ot-mono); }
.recbar span { display: flex; align-items: center; justify-content: center; color: #08130d; font-weight: 700; }
table.fa td:first-child { white-space: nowrap; color: var(--ot-text-2); }
table.fa tr.derived td { color: var(--ot-text-2); font-style: italic; }
.ret { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 2px; }
.ret .r { display: flex; flex-direction: column; padding: 4px 6px; border-radius: 2px; background: rgba(255, 255, 255, 0.02); }
.ret .k { font-size: 10px; color: var(--ot-muted); }
.ret .v { font-size: 13px; font-weight: 600; }
table.chain th.side { text-align: center; color: var(--ot-text-2); }
table.chain .strike { background: var(--ot-surface-2); text-align: center; font-weight: 700; color: var(--ot-accent-2); }
table.chain td.itm { background: rgba(74, 168, 255, 0.06); }
table.chain tr.atm td { border-top: 1px solid var(--ot-accent); border-bottom: 1px solid var(--ot-accent); }
/* Order book: bids mirror asks around the spread; the faint bar is cumulative depth, the strong one the level itself. */
.book { display: flex; flex-direction: column; gap: 6px; font-size: 11px; }
.book .bookhead { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; padding: 0 2px; }
.book .bookhead .k { color: var(--ot-muted); margin-right: 4px; }
.book .bookhead .grow { flex: 1 1 auto; }
.book .ladder { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 2px; }
.book .lhead, .book .lvl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 8px; padding: 1px 6px; }
.book .lhead { color: var(--ot-muted); font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; padding-bottom: 3px; border-bottom: 1px solid var(--ot-line); }
.book .lhead span, .book .lvl span { text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.book .lhead.ask span:first-child, .book .ask .lvl .p { text-align: left; }
.book .side { display: flex; flex-direction: column; }
.book .lvl { position: relative; line-height: 17px; }
.book .lvl > span:not(.cum):not(.sz) { position: relative; }
.book .lvl .cum, .book .lvl .sz { position: absolute; top: 1px; bottom: 1px; pointer-events: none; }
.book .bid .lvl .cum, .book .bid .lvl .sz { right: 0; }
.book .ask .lvl .cum, .book .ask .lvl .sz { left: 0; }
.book .bid .cum { background: rgba(38, 194, 129, 0.09); }
.book .ask .cum { background: rgba(242, 84, 91, 0.09); }
.book .bid .sz { background: rgba(38, 194, 129, 0.22); }
.book .ask .sz { background: rgba(242, 84, 91, 0.22); }
.book .bid .p { color: var(--ot-positive); }
.book .ask .p { color: var(--ot-negative); }
.book .lvl .t { color: var(--ot-muted); }
.book .lvl.wall .s, .book .lvl.wall .p { font-weight: 700; }
.book .lvl.wall .s { color: var(--ot-text); }
.book .lvl:hover { background: var(--ot-surface-3); }
.book .bands { border-collapse: collapse; width: 100%; font-size: 11px; margin-top: 2px; }
.book .bands th { color: var(--ot-muted); font-weight: 500; font-size: 10px; text-align: left; padding: 3px 6px; border-top: 1px solid var(--ot-line); }
.book .bands th.num, .book .bands td.num { text-align: right; }
.book .bands td { padding: 2px 6px; }
.book .bands td.k { color: var(--ot-muted); }
.book .bands td.partial { opacity: 0.55; cursor: help; }
@media (max-width: 700px) {
    .book .lhead, .book .lvl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .book .lhead span:nth-child(1), .book .bid .lvl .t { display: none; }
    .book .lhead.ask span:nth-child(3), .book .ask .lvl .t { display: none; }
    .book .lhead.ask span:nth-child(1) { display: inline; }
}
.news { list-style: none; margin: 0; padding: 0; }
.news li { display: grid; grid-template-columns: 120px 1fr auto; gap: 10px; padding: 4px 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.035); font-size: 12px; align-items: baseline; }
.news li:hover { background: var(--ot-surface-3); }
.news .t { color: var(--ot-muted); font-size: 10.5px; }
.news a { color: var(--ot-text); }
.news a:hover { color: var(--ot-accent); }
.news .src { color: var(--ot-muted); font-size: 10.5px; }
</style>
