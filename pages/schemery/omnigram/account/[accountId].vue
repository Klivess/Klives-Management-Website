<template>
    <OmniGramShell @refresh="loadAll">
        <div v-if="!detail && loading" class="ot-skelrows"><div class="ot-skel" style="height:64px"></div><div class="ot-skel" style="height:240px"></div></div>
        <div v-else-if="!detail && loadError" class="ot-card"><div class="body">
            <OmniTraderStateBlock kind="error" title="Could not load this account" :detail="loadError">
                <NuxtLink class="ot-btn sm" to="/schemery/omnigram">Back to all accounts</NuxtLink>
            </OmniTraderStateBlock>
        </div></div>

        <template v-else-if="detail">
            <div class="ot-pagehead ig-accounthead">
                <div class="who">
                    <OmniTumblrAvatar :src="account!.ProfilePictureUrl" :name="account!.Username" :size="52" round />
                    <div class="whotext">
                        <h1>@{{ account!.Username }}</h1>
                        <p class="subtitle">
                            {{ account!.Name || typeLabel }}
                            · <a :href="account!.ProfileUrl" target="_blank" rel="noopener noreferrer">open on Instagram ↗</a>
                            <template v-if="account!.Stats.MediaCount != null"> · {{ fmtCount(account!.Stats.MediaCount) }} posts</template>
                        </p>
                    </div>
                    <span class="ot-chip" :class="accountStateTone(summary!.State)" :title="summary!.StateReason">{{ stateLabel }}</span>
                </div>
                <div class="ot-actions">
                    <label v-if="can('omnigram.accounts.manage') && connected" class="ot-check switch" :title="autopilotHelp">
                        <input type="checkbox" :checked="account!.Autopilot" :disabled="busy" @change="toggleAutopilot" />
                        Autopilot
                    </label>
                    <button v-if="can('omnigram.accounts.act') && connected" class="ot-btn ghost" :disabled="busy" @click="togglePause">{{ account!.Paused ? 'Resume' : 'Pause' }}</button>
                    <button v-if="can('omnigram.accounts.act') && connected" class="ot-btn ghost" :disabled="busy" @click="syncNow">{{ busyAction === 'sync' ? 'Syncing…' : 'Sync from Instagram' }}</button>
                    <button v-if="can('omnigram.accounts.act') && account!.Autopilot && !account!.Paused" class="ot-btn ghost" :disabled="busy" @click="planNow">{{ busyAction === 'plan' ? 'Planning…' : 'Plan now' }}</button>
                    <NuxtLink v-if="can('omnigram.content.publish') && connected" class="ot-btn" :to="`/schemery/omnigram/compose?account=${accountId}`">Compose</NuxtLink>
                    <button v-if="can('omnigram.accounts.manage')" class="ot-btn danger sm" :disabled="busy" @click="removeAccount">Remove</button>
                </div>
            </div>

            <div v-if="!connected" class="ot-banner warn" role="alert">
                <span class="glyph">!</span>
                <div>
                    <strong>{{ account!.Legacy ? 'Imported from OmniGram v1, not connected yet.' : 'Not connected to Instagram.' }}</strong>
                    {{ account!.Legacy
                        ? 'v1 logged in with the password and stopped working. Connect it through Instagram\'s official login (it must be a Creator or Business account); its settings below are kept.'
                        : 'Connect it to start posting.' }}
                </div>
                <div v-if="can('omnigram.settings.manage')" class="actions"><button class="ot-btn sm primary" @click="wizardOpen = true">Connect @{{ account!.Username }}</button></div>
            </div>
            <div v-else-if="detail.Connection.Connection === 'NeedsReauth'" class="ot-banner" role="alert">
                <span class="glyph">⚠</span>
                <div><strong>Instagram no longer accepts this account's token.</strong> {{ detail.Connection.ConnectionDetail }} Nothing is posted until it is reconnected.</div>
                <div v-if="can('omnigram.settings.manage')" class="actions"><button class="ot-btn sm" @click="wizardOpen = true">Reconnect @{{ account!.Username }}</button></div>
            </div>
            <div v-else-if="summary!.State !== 'ok' && summary!.State !== 'idle'" class="ot-banner" :class="summary!.State === 'error' ? '' : 'warn'">
                <span class="glyph">{{ summary!.State === 'paused' ? '⏸' : '!' }}</span>
                <div><strong>{{ stateLabel }}</strong> {{ summary!.StateReason }}</div>
            </div>
            <div v-if="connected && !account!.Autopilot && tab !== 'strategy'" class="ot-banner info">
                <span class="glyph">ℹ</span>
                <div><strong>Autopilot is off.</strong> Only posts you compose go out. Review the strategy, then switch autopilot on to have posts planned, captioned and published on schedule.</div>
                <div class="actions"><button class="ot-btn sm" @click="setTab('strategy')">Review strategy</button></div>
            </div>

            <div class="ot-segment tabs" role="tablist" aria-label="Account sections">
                <button v-for="t in TABS" :key="t.id" type="button" role="tab" :aria-pressed="tab === t.id" :aria-selected="tab === t.id" @click="setTab(t.id)">
                    {{ t.label }}<span v-if="t.count" class="count">{{ t.count }}</span>
                </button>
            </div>

            <!-- ── Overview ── -->
            <template v-if="tab === 'overview'">
                <div class="ot-kpis ig-kpis6">
                    <OmniTraderKpi label="Followers" :value="fmtCount(summary!.Followers)" :compare="followerCompare" baseline="vs 7 days ago"
                                   :compare-format="countChange" :spark="summary!.FollowersSpark" />
                    <OmniTraderKpi label="Published" :value="String(summary!.Published7d)" foot="last 7 days"
                                   :baseline="`${summary!.SlotsPerWeek} slot${summary!.SlotsPerWeek === 1 ? '' : 's'} a week`" />
                    <OmniTraderKpi label="Views per post" :value="summary!.AvgViews30d != null ? fmtCount(Math.round(summary!.AvgViews30d)) : '—'" foot="30-day average" />
                    <OmniTraderKpi label="Engagement" :value="analytics?.EngagementRate != null ? `${analytics.EngagementRate.toFixed(2)}%` : '—'"
                                   foot="interactions ÷ reach, 30 d" help="Likes, comments, shares and saves on posts published in the last 30 days, divided by the accounts they reached." />
                    <OmniTraderKpi label="Queue" :value="String(summary!.Pending)" :attention-soft="summary!.AwaitingApproval > 0"
                                   :foot="summary!.AwaitingApproval ? `${summary!.AwaitingApproval} awaiting approval` : 'scheduled or being prepared'" />
                    <OmniTraderKpi label="Next post" small :value="summary!.NextPost ? fmtRelative(summary!.NextPost.ScheduledUtc, now) : 'none'"
                                   :foot="summary!.NextPost ? `${FORMAT_LABEL[summary!.NextPost.Format]} · ${fmtWhen(summary!.NextPost.ScheduledUtc)}` : (account!.Autopilot ? 'planning…' : 'nothing scheduled')" />
                </div>

                <div class="ot-grid sidebar">
                    <div class="ot-stack">
                        <OmniTraderCard title="Coming up" :empty="!detail.Pending.length" empty-title="Nothing scheduled"
                                        :empty-text="account!.Autopilot ? `Autopilot plans up to ${account!.Strategy.PlanAheadDays} days ahead.` : 'Compose a post or switch on autopilot.'" flush>
                            <template #controls><button class="ot-btn sm ghost" @click="setTab('queue')">Whole queue</button></template>
                            <div class="list"><OmniGramPostRow v-for="p in detail.Pending.slice(0, 5)" :key="p.PostId" :post="p" @open="openPost" /></div>
                        </OmniTraderCard>
                        <OmniTraderCard title="Recently published" :empty="!published.length" empty-title="Nothing published yet" flush>
                            <template #controls><button class="ot-btn sm ghost" @click="setTab('published')">All posts</button></template>
                            <div class="list"><OmniGramPostRow v-for="p in published.slice(0, 5)" :key="p.PostId" :post="p" @open="openPost" /></div>
                        </OmniTraderCard>
                        <OmniTraderCard title="Followers" subtitle="Last 30 days" :empty="followerPoints.length < 2" empty-title="Not enough history yet"
                                        empty-text="Recorded every few hours from Instagram.">
                            <OmniTraderLineChart :series="[{ name: 'Followers', colour: 'var(--ot-cat-1)', points: followerPoints }]" :height="220" :format="(v: number) => fmtCount(v)" />
                        </OmniTraderCard>
                    </div>
                    <div class="ot-stack">
                        <OmniTraderCard title="Content runway" :subtitle="runwaySubtitle">
                            <p v-if="detail.Runway.Error" class="neg">{{ detail.Runway.Error }}</p>
                            <template v-else>
                                <div class="runway">
                                    <span class="big">{{ detail.Runway.Eligible ?? 0 }}</span>
                                    <span>unused item{{ detail.Runway.Eligible === 1 ? '' : 's' }}
                                        <template v-if="detail.Runway.WeeksOfContent != null"> · about <strong>{{ detail.Runway.WeeksOfContent }}</strong> weeks at {{ detail.Runway.SlotsPerWeek }}/week</template>
                                    </span>
                                </div>
                                <p v-if="summary!.ContentWarning" class="warnline">{{ summary!.ContentWarning }}</p>
                                <div v-if="detail.Runway.Next?.length" class="runwaygrid">
                                    <a v-for="c in detail.Runway.Next.slice(0, 8)" :key="c.Key" :href="c.OriginalUrl ?? undefined" target="_blank" rel="noopener noreferrer"
                                       :title="`${c.Origin ? '@' + c.Origin + ' · ' : ''}${c.Views ? fmtCount(c.Views) + ' views · ' : ''}${c.OriginalCaption ?? c.FileName}`">
                                        <OmniTumblrThumb size="md" :kind="c.Kind" :path="contentThumbPath(accountId, c.Key)"
                                                         :badge="c.DurationSeconds ? fmtClipLength(c.DurationSeconds) : null" />
                                    </a>
                                </div>
                                <p class="muted small">Next in line, in the order autopilot will use them.</p>
                            </template>
                        </OmniTraderCard>

                        <OmniTraderCard title="Strategy at a glance">
                            <template #controls><button class="ot-btn sm ghost" @click="setTab('strategy')">Edit</button></template>
                            <dl class="ot-kv">
                                <dt>Schedule</dt><dd>{{ scheduleSummary }}</dd>
                                <dt>Content</dt><dd>{{ sourceSummary }}</dd>
                                <dt>Formats</dt><dd>{{ formatSummary }}</dd>
                                <dt>Captions</dt><dd>{{ captionSummary }}</dd>
                                <dt>Hashtags</dt><dd>{{ hashtagSummary }}</dd>
                                <dt>Approval</dt><dd>{{ account!.RequireApproval ? 'posts wait for approval' : 'posts go out automatically' }}</dd>
                            </dl>
                            <p v-if="detail.Validation.length" class="warnline">{{ detail.Validation.join(' ') }}</p>
                        </OmniTraderCard>

                        <OmniTraderCard title="Health">
                            <dl class="ot-kv">
                                <dt>Connection</dt><dd>{{ CONNECTION_LABEL[detail.Connection.Connection] }}{{ detail.Connection.ConnectedVia ? ` · via ${detail.Connection.ConnectedVia === 'oauth' ? 'Instagram login' : 'access token'}` : '' }}</dd>
                                <dt>Token</dt><dd>{{ detail.Connection.TokenExpiresUtc ? `expires ${fmtDate(detail.Connection.TokenExpiresUtc)}, renewed automatically` : '—' }}</dd>
                                <dt>Last success</dt><dd>{{ account!.Health.LastSuccessUtc ? fmtRelative(account!.Health.LastSuccessUtc, now) : 'never' }}</dd>
                                <dt>Last error</dt><dd>{{ account!.Health.LastError ? `${account!.Health.LastError} (${fmtRelative(account!.Health.LastErrorUtc, now)})` : 'none' }}</dd>
                                <template v-if="account!.Health.CooldownUntilUtc && new Date(account!.Health.CooldownUntilUtc).getTime() > now">
                                    <dt>Cooling down</dt><dd class="warn">until {{ fmtWhen(account!.Health.CooldownUntilUtc) }}: {{ account!.Health.CooldownReason }}</dd>
                                </template>
                                <dt>Synced</dt><dd>profile {{ fmtRelative(account!.Stats.ProfileSyncedUtc, now) }} · posts {{ fmtRelative(account!.Stats.MediaIndexSyncedUtc, now) }} · insights {{ fmtRelative(account!.Stats.PostInsightsSyncedUtc, now) }}</dd>
                            </dl>
                            <div v-if="account!.Quota.QuotaTotal" class="limits">
                                <OmniTraderMeter label="Instagram API posts, last 24 h" :value="`${account!.Quota.QuotaUsage ?? 0} used`" :limit="`of ${account!.Quota.QuotaTotal}`"
                                                 :percent="((account!.Quota.QuotaUsage ?? 0) / account!.Quota.QuotaTotal) * 100" />
                            </div>
                        </OmniTraderCard>
                    </div>
                </div>
            </template>

            <!-- ── Queue ── -->
            <template v-else-if="tab === 'queue'">
                <div v-if="summary!.AwaitingApproval && can('omnigram.content.publish')" class="ot-banner info">
                    <span class="glyph">ℹ</span>
                    <div><strong>{{ summary!.AwaitingApproval }} post(s) are waiting for approval.</strong> Open one to edit it, or approve them all.</div>
                    <div class="actions"><button class="ot-btn sm primary" :disabled="busy" @click="approveAll">Approve all</button></div>
                </div>
                <OmniTraderCard :title="`Queue · ${detail.Pending.length}`" subtitle="Everything scheduled or being prepared, soonest first. Click a post to edit it."
                                :empty="!detail.Pending.length" empty-title="Nothing scheduled"
                                :empty-text="account!.Autopilot ? `Autopilot plans up to ${account!.Strategy.PlanAheadDays} days ahead; use Plan now if a slot is empty.` : 'Compose a post or switch on autopilot.'" flush>
                    <div v-for="group in queueGroups" :key="group.label" class="daygroup">
                        <h3 class="dayhead">{{ group.label }}</h3>
                        <OmniGramPostRow v-for="p in group.posts" :key="p.PostId" :post="p" @open="openPost" />
                    </div>
                </OmniTraderCard>
            </template>

            <!-- ── Published ── -->
            <template v-else-if="tab === 'published'">
                <OmniTraderCard title="Post history" :subtitle="`${historyFiltered.length} of ${detail.History.length} shown`" flush>
                    <template #controls>
                        <div class="ot-segment sm wrap" role="group" aria-label="Filter">
                            <button v-for="f in HISTORY_FILTERS" :key="f" type="button" :aria-pressed="historyFilter === f" @click="historyFilter = f">{{ f }}</button>
                        </div>
                    </template>
                    <div class="ot-tablewrap">
                        <table class="ot-table">
                            <thead>
                                <tr><th></th><th>Caption</th><th>When</th><th class="num">Views</th><th class="num">Reach</th><th class="num">♥</th><th class="num">💬</th><th class="num">Shares · saves</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                <tr v-for="p in historyFiltered" :key="p.PostId" class="clickable" tabindex="0" @click="openPost(p.PostId)" @keydown.enter="openPost(p.PostId)">
                                    <td><OmniTumblrThumb size="xs" :kind="thumbKind(p)" :path="p.HasThumbnail ? postThumbPath(p.PostId) : null" /></td>
                                    <td class="captioncell">
                                        <span class="fmt">{{ FORMAT_GLYPH[p.Format] }}</span> {{ p.Format === 'Story' ? 'Story' : (p.Caption || '(no caption)') }}
                                        <span v-if="p.LastError && p.Status !== 'Published'" class="sub neg">{{ p.LastError }}</span>
                                    </td>
                                    <td class="nowrap">{{ fmtWhen(p.PublishedUtc ?? p.ScheduledUtc) }}</td>
                                    <td class="num">{{ p.Status === 'Published' ? fmtCount(p.Views) : '' }}</td>
                                    <td class="num">{{ p.Status === 'Published' ? fmtCount(p.Reach) : '' }}</td>
                                    <td class="num">{{ p.Likes ?? '' }}</td>
                                    <td class="num">{{ p.Comments ?? '' }}</td>
                                    <td class="num">{{ p.Status === 'Published' ? `${p.Shares ?? '·'} · ${p.Saves ?? '·'}` : '' }}</td>
                                    <td><span class="ot-chip" :class="statusTone(p.Status)">{{ STATUS_LABEL[p.Status] }}</span></td>
                                </tr>
                            </tbody>
                        </table>
                        <OmniTraderStateBlock v-if="!historyFiltered.length" kind="filtered" title="No posts here" />
                    </div>
                </OmniTraderCard>
            </template>

            <!-- ── Analytics ── -->
            <template v-else-if="tab === 'analytics'">
                <div class="rangebar">
                    <div class="ot-segment sm" role="group" aria-label="Range">
                        <button v-for="r in RANGES" :key="r.days" type="button" :aria-pressed="range === r.days" @click="setRange(r.days)">{{ r.label }}</button>
                    </div>
                    <span class="muted small">{{ analytics ? `${fmtDate(analytics.FromUtc)} – ${fmtDate(analytics.ToUtc)} · times in ${analytics.TimeZone}` : '' }}</span>
                </div>
                <div class="ot-kpis ig-kpis6">
                    <OmniTraderKpi label="Followers" :value="fmtCount(analytics?.Followers)" :loading="!analytics"
                                   :foot="analytics?.FollowersDelta != null ? `${fmtSignedCount(analytics.FollowersDelta)} in range${analytics.FollowersGrowthPerWeek != null ? ` · ${fmtSignedCount(analytics.FollowersGrowthPerWeek)}/week` : ''}` : 'no baseline yet'" />
                    <OmniTraderKpi label="Posts published" :value="String(analytics?.PostsPublished ?? '—')" :loading="!analytics"
                                   :compare="compareCounts(analytics?.PostsPublished, analytics?.PostsPublishedPrev)" baseline="vs previous period" :compare-format="countChange" />
                    <OmniTraderKpi label="Views" :value="fmtCount(analytics?.Views)" :loading="!analytics"
                                   :compare="compareCounts(analytics?.Views, analytics?.ViewsPrev)" baseline="vs previous period" :compare-format="countChange"
                                   foot="on posts published in range" />
                    <OmniTraderKpi label="Views per post" :value="analytics?.AvgViews != null ? fmtCount(Math.round(analytics.AvgViews)) : '—'" :loading="!analytics"
                                   :foot="analytics?.MedianViews != null ? `median ${fmtCount(Math.round(analytics.MedianViews))}` : ''" />
                    <OmniTraderKpi label="Engagement" :value="analytics?.EngagementRate != null ? `${analytics.EngagementRate.toFixed(2)}%` : '—'" :loading="!analytics"
                                   :foot="analytics?.EngagementPerFollower != null ? `${analytics.EngagementPerFollower.toFixed(2)}% per follower` : 'interactions ÷ reach'" />
                    <OmniTraderKpi label="Likes · comments · shares · saves" small :loading="!analytics"
                                   :value="analytics?.Likes != null ? `${fmtCount(analytics.Likes)} · ${fmtCount(analytics.Comments)} · ${fmtCount(analytics.Shares)} · ${fmtCount(analytics.Saves)}` : '—'"
                                   :foot="analytics?.AvgWatchSeconds != null ? `avg watch ${analytics.AvgWatchSeconds.toFixed(1)} s on reels` : 'on posts published in range'" />
                </div>

                <div class="ig-pair ig-section">
                    <OmniTraderCard title="Followers" :empty="followerPoints.length < 2" empty-title="Not enough history yet">
                        <OmniTraderLineChart :series="[{ name: 'Followers', colour: 'var(--ot-cat-1)', points: followerPoints }]" :height="230" :format="(v: number) => fmtCount(v)" />
                    </OmniTraderCard>
                    <OmniTraderCard title="Views by publishing day" :subtitle="(analytics?.Days ?? 0) > 120 ? 'Views earned by each week’s posts' : 'Views earned by each day’s posts'">
                        <OmniTumblrDailyBars :days="postingDays" :height="230" unit="views" owner="OmniGram" />
                    </OmniTraderCard>
                </div>
                <div class="ig-pair ig-section">
                    <OmniTraderCard title="Account reach" subtitle="Accounts reached and views per day, from Instagram's account insights"
                                    :empty="!accountSeries.some(s => s.points.length > 1)" empty-title="No account insights yet"
                                    empty-text="Instagram's daily account insights are read every few hours.">
                        <OmniTraderLineChart :series="accountSeries" :height="230" :zero-based="true" x-label="Day" :format="(v: number) => fmtCount(Math.round(v))" />
                    </OmniTraderCard>
                    <OmniTraderCard title="Follows and unfollows" subtitle="Per day"
                                    :empty="!followSeries.some(s => s.points.some(p => p.y > 0))" empty-title="No follow data yet"
                                    :empty-text="analytics?.NewFollows == null ? 'Instagram reports follows for accounts with 100+ followers.' : 'No follows recorded in this range.'">
                        <OmniTraderLineChart :series="followSeries" :height="230" :zero-based="true" x-label="Day" :format="(v: number) => fmtCount(Math.round(v))" />
                    </OmniTraderCard>
                </div>
                <div class="ig-pair ig-section">
                    <OmniTraderCard title="Best times to post" :subtitle="analytics?.BestSlotLabel ? `Strongest: ${analytics.BestSlotLabel}` : 'Average views by weekday and hour, last 120 days'">
                        <OmniTumblrHeatmap :cells="heatCells" :time-zone="analytics?.TimeZone" :sample-size="analytics?.SampleSize" :unit="heatUnit" owner="account" />
                    </OmniTraderCard>
                    <OmniTraderCard title="When followers are online" subtitle="Average followers online in each hour">
                        <OmniGramHourBars :values="analytics?.OnlineByHour ?? []" :caption="analytics?.OnlinePeakLabel" :time-zone="analytics?.TimeZone" />
                    </OmniTraderCard>
                </div>

                <div class="ig-pair ig-section">
                    <OmniTraderCard title="Top posts" subtitle="By views, including posts made outside OmniGram" :empty="!analytics?.TopPosts.length" empty-title="No posts in this range" flush>
                        <ol class="toplist">
                            <li v-for="(t, i) in analytics?.TopPosts ?? []" :key="t.Id">
                                <span class="rank">{{ i + 1 }}</span>
                                <OmniTumblrThumb size="xs" :kind="t.ProductType === 'REELS' ? 'Video' : 'Photo'"
                                                 :path="t.HasThumbnail && t.OmniPostId ? postThumbPath(t.OmniPostId) : null" />
                                <div class="topmain">
                                    <a v-if="t.OmniPostId" href="#" @click.prevent="openPost(t.OmniPostId)">{{ t.Caption || `${productLabel(t.ProductType)} ${t.Id}` }}</a>
                                    <a v-else :href="t.Permalink ?? undefined" target="_blank" rel="noopener noreferrer">{{ t.Caption || `${productLabel(t.ProductType)} ${t.Id}` }}</a>
                                    <span class="sub">{{ productLabel(t.ProductType) }} · {{ fmtWhen(t.PublishedUtc) }}{{ t.Ours ? ' · by OmniGram' : '' }} · ♥ {{ fmtCount(t.Likes) }} · 💬 {{ fmtCount(t.Comments) }}</span>
                                </div>
                                <span class="views">{{ t.Views != null ? fmtCount(t.Views) : '—' }}</span>
                            </li>
                        </ol>
                    </OmniTraderCard>
                    <div class="ot-stack">
                        <OmniTraderCard title="Hashtags that work" subtitle="Average views per post using the hashtag (2+ uses)">
                            <OmniTraderBarList :items="ranked(analytics?.Hashtags, '#')" :signed="false" :format="(v: number) => fmtCount(Math.round(v))" empty-title="Not enough hashtagged posts yet" />
                        </OmniTraderCard>
                        <OmniTraderCard title="Content sources" subtitle="Average views by where the content came from">
                            <OmniTraderBarList :items="ranked(analytics?.Sources, '@')" :signed="false" :format="(v: number) => fmtCount(Math.round(v))" empty-title="No sourced posts yet" />
                        </OmniTraderCard>
                        <OmniTraderCard title="Caption styles and formats">
                            <OmniTraderBarList :items="[...ranked(analytics?.CaptionModes), ...ranked(analytics?.Formats)]" :signed="false" :format="(v: number) => fmtCount(Math.round(v))" empty-title="No published posts yet" />
                        </OmniTraderCard>
                    </div>
                </div>

                <OmniTraderCard title="Audience" subtitle="Who follows this account (Instagram reports the top groups; refreshed weekly)" class="ig-section"
                                :empty="!demographicGroups.length" empty-title="No audience data yet"
                                :empty-text="analytics?.DemographicsNote ?? 'Instagram shares follower demographics once an account has 100+ followers.'">
                    <div class="demo">
                        <div v-for="g in demographicGroups" :key="g.key">
                            <h4 class="ot-sectionhead">{{ g.label }}</h4>
                            <OmniTraderBarList :items="g.items" :signed="false" :format="(v: number) => `${v.toFixed(1)}%`" :limit="6" />
                        </div>
                    </div>
                </OmniTraderCard>
            </template>

            <!-- ── Strategy ── -->
            <template v-else-if="tab === 'strategy'">
                <OmniGramStrategyEditor :account-id="accountId" :strategy="account!.Strategy" :require-approval="account!.RequireApproval"
                                        :validation="detail.Validation" @saved="loadDetail" />
                <OmniTraderCard v-if="can('omnigram.accounts.act')" title="Notes" subtitle="Private notes and tags for this account" class="ig-section">
                    <textarea v-model="notesDraft" class="ot-input" rows="3" maxlength="4000" aria-label="Private notes about this account"></textarea>
                    <div class="ot-field tagsfield">
                        <label :for="`ig-acct-tags-${accountId}`">Tags</label>
                        <OmniTumblrTagInput :input-id="`ig-acct-tags-${accountId}`" v-model="tagsDraft" prefix="" placeholder="e.g. memes, client" label="Account tags" />
                    </div>
                    <div class="savebar"><button class="ot-btn sm" :disabled="busy || !notesDirty" @click="saveNotes">Save notes</button></div>
                </OmniTraderCard>
            </template>

            <!-- ── Comments ── -->
            <template v-else-if="tab === 'comments'">
                <OmniTraderCard title="Comments" subtitle="Newest first, across this account's recent posts. Synced every 30 minutes." :loading="commentsLoading && !comments">
                    <template #controls>
                        <div class="ot-segment sm" role="group" aria-label="Filter comments">
                            <button type="button" :aria-pressed="commentFilter === 'all'" @click="commentFilter = 'all'">All</button>
                            <button type="button" :aria-pressed="commentFilter === 'unanswered'" @click="commentFilter = 'unanswered'">No reply yet</button>
                        </div>
                    </template>
                    <p v-if="commentsError" class="neg">{{ commentsError }}</p>
                    <OmniGramCommentList :threads="commentsShown" :account-id="accountId" show-media
                                         :empty-text="commentFilter === 'unanswered' ? 'Every comment has a reply.' : 'No comments synced yet.'"
                                         @changed="loadComments" @open-post="openPost" />
                </OmniTraderCard>
            </template>

            <!-- ── Activity ── -->
            <template v-else-if="tab === 'activity'">
                <div class="ot-grid two">
                    <OmniTraderCard title="OmniGram log" subtitle="Everything OmniGram did for this account">
                        <OmniGramEventList :events="detail.Events" :show-account="false" :limit="40" @open-post="openPost" />
                    </OmniTraderCard>
                    <OmniTraderCard title="Instagram connection">
                        <dl class="ot-kv">
                            <dt>Status</dt><dd>{{ CONNECTION_LABEL[detail.Connection.Connection] }}{{ detail.Connection.ConnectionDetail ? ` · ${detail.Connection.ConnectionDetail}` : '' }}</dd>
                            <dt>Account type</dt><dd>{{ typeLabel }}</dd>
                            <dt>Instagram user id</dt><dd class="mono">{{ detail.Connection.IgUserId ?? '—' }}</dd>
                            <dt>Connected</dt><dd>{{ detail.Connection.ConnectedUtc ? `${fmtDate(detail.Connection.ConnectedUtc)} via ${detail.Connection.ConnectedVia === 'oauth' ? 'Instagram login' : 'access token'}` : 'never' }}</dd>
                            <dt>Token</dt><dd>{{ detail.Connection.TokenExpiresUtc ? `expires ${fmtWhen(detail.Connection.TokenExpiresUtc)}` : '—' }}{{ detail.Connection.TokenRefreshedUtc ? ` · renewed ${fmtRelative(detail.Connection.TokenRefreshedUtc, now)}` : '' }}</dd>
                            <dt>Permissions</dt><dd>{{ detail.Connection.Scopes.length ? detail.Connection.Scopes.join(', ') : 'not reported (token connection)' }}</dd>
                            <template v-if="account!.Legacy">
                                <dt>From v1</dt><dd>imported {{ fmtDate(account!.Legacy.ImportedUtc) }}{{ account!.Legacy.V1PostedCount ? ` · ${account!.Legacy.V1PostedCount} posts made by v1` : '' }}</dd>
                            </template>
                        </dl>
                        <div v-if="can('omnigram.settings.manage') && connected" class="savebar">
                            <button class="ot-btn sm ghost" :disabled="busy" @click="renewToken">{{ busyAction === 'token' ? 'Renewing…' : 'Renew token now' }}</button>
                            <button class="ot-btn sm ghost" :disabled="busy" @click="wizardOpen = true">Reconnect</button>
                        </div>
                    </OmniTraderCard>
                </div>
            </template>
        </template>

        <OmniGramPostDrawer :open="!!drawerPostId" :post-id="drawerPostId" @close="drawerPostId = null" @changed="loadAll" />
        <OmniGramConnectWizard :open="wizardOpen" :app="overview?.App ?? null" :reconnect-account-id="accountId" :reconnect-username="account?.Username ?? null"
                               :first-connection="!connected" @close="wizardOpen = false" @done="onWizardDone" />
    </OmniGramShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAccess } from '~/composables/useAccess';
import {
    CONNECTION_LABEL, DAY_SHORT, FORMAT_GLYPH, FORMAT_LABEL, STATUS_LABEL, WEEK_ORDER, accountStateTone, confirmAction, contentThumbPath, fmtClipLength, fmtCount,
    fmtDate, fmtRelative, fmtSignedCount, fmtWhen, igGet, igPost, minuteToHHMM, notify, postThumbPath, q, statusTone, thumbKind, useGramOverview, useNow, usePoll,
    type AccountDetail, type Analytics, type CommentThread, type PostSummary, type Ranked,
} from '~/composables/useOmniGram';

definePageMeta({ layout: 'navbar' });

const route = useRoute();
const router = useRouter();
const { can } = useAccess();
const { overview, refresh: refreshOverview } = useGramOverview();
const now = useNow();

const accountId = computed(() => String(route.params.accountId));
const detail = ref<AccountDetail | null>(null);
const analytics = ref<Analytics | null>(null);
const comments = ref<CommentThread[] | null>(null);
const commentsLoading = ref(false);
const commentsError = ref<string | null>(null);
const commentFilter = ref<'all' | 'unanswered'>('all');
const loading = ref(false);
const loadError = ref<string | null>(null);
const busy = ref(false);
const busyAction = ref<string | null>(null);
const drawerPostId = ref<string | null>(null);
const wizardOpen = ref(false);
const notesDraft = ref('');
const tagsDraft = ref<string[]>([]);
const historyFilter = ref('All');
const range = ref(30);

const account = computed(() => detail.value?.Account ?? null);
const summary = computed(() => detail.value?.Summary ?? null);
const connected = computed(() => !!detail.value?.Connection.Connected);

useHead(() => ({ title: account.value ? `@${account.value.Username} · OmniGram` : 'OmniGram' }));

type Tab = 'overview' | 'queue' | 'published' | 'analytics' | 'strategy' | 'comments' | 'activity';
const TAB_IDS: Tab[] = ['overview', 'queue', 'published', 'analytics', 'strategy', 'comments', 'activity'];
const tab = computed<Tab>(() => {
    const t = String(route.query.tab ?? 'overview') as Tab;
    return TAB_IDS.includes(t) ? t : 'overview';
});
const TABS = computed(() => [
    { id: 'overview' as Tab, label: 'Overview', count: 0 },
    { id: 'queue' as Tab, label: 'Queue', count: detail.value?.Pending.length ?? 0 },
    { id: 'published' as Tab, label: 'Published', count: 0 },
    { id: 'analytics' as Tab, label: 'Analytics', count: 0 },
    { id: 'strategy' as Tab, label: 'Strategy', count: 0 },
    { id: 'comments' as Tab, label: 'Comments', count: summary.value?.NewComments ?? 0 },
    { id: 'activity' as Tab, label: 'Activity', count: 0 },
]);
const HISTORY_FILTERS = ['All', 'Published', 'Failed', 'Skipped', 'Cancelled', 'Removed'];
const RANGES = [{ days: 7, label: '7 d' }, { days: 30, label: '30 d' }, { days: 90, label: '90 d' }, { days: 365, label: '1 y' }];

function setTab(t: Tab) {
    void router.replace({ query: { ...route.query, tab: t === 'overview' ? undefined : t } });
}

async function loadDetail() {
    loading.value = true;
    const result = await igGet<AccountDetail>(`/omnigram/account${q({ accountId: accountId.value })}`);
    loading.value = false;
    if (result.ok && result.data) {
        const before = detail.value?.Account;
        // Keep an edit in progress; adopt the server's copy otherwise.
        if (!before || notesDraft.value === (before.Notes ?? '')) notesDraft.value = result.data.Account.Notes ?? '';
        if (!before || JSON.stringify(tagsDraft.value) === JSON.stringify(before.Tags)) tagsDraft.value = [...result.data.Account.Tags];
        detail.value = result.data;
        loadError.value = null;
    } else {
        loadError.value = result.error;
    }
}

async function loadAnalytics() {
    const result = await igGet<Analytics>(`/omnigram/analytics${q({ accountId: accountId.value, days: range.value })}`);
    if (result.ok && result.data) analytics.value = result.data;
}

async function loadComments() {
    commentsLoading.value = true;
    const result = await igGet<CommentThread[]>(`/omnigram/comments${q({ accountId: accountId.value, limit: 150 })}`);
    commentsLoading.value = false;
    if (result.ok && result.data) {
        comments.value = result.data;
        commentsError.value = null;
    } else {
        commentsError.value = result.error;
    }
}

async function loadAll() {
    await Promise.all([loadDetail(), loadAnalytics(), refreshOverview(), tab.value === 'comments' ? loadComments() : Promise.resolve()]);
}

usePoll(() => Promise.all([
    loadDetail(),
    tab.value === 'analytics' ? loadAnalytics() : Promise.resolve(),
    tab.value === 'comments' ? loadComments() : Promise.resolve(),
]), 30_000);
watch(accountId, () => { detail.value = null; analytics.value = null; comments.value = null; void loadAll(); });
watch(tab, t => {
    if (t === 'analytics' || t === 'overview') void loadAnalytics();
    if (t === 'comments') void loadComments();
}, { immediate: true });

function setRange(days: number) {
    range.value = days;
    analytics.value = null;
    void loadAnalytics();
}

// ── header actions ──

const typeLabel = computed(() => {
    const t = account.value?.AccountType;
    return t === 'MEDIA_CREATOR' ? 'Creator account' : t === 'BUSINESS' ? 'Business account' : t ? t.toLowerCase() : 'Instagram account';
});

const stateLabel = computed(() => {
    const s = summary.value;
    if (!s) return '';
    return ({ ok: s.Autopilot ? 'Autopilot' : 'Manual', attention: 'Needs attention', error: 'Problem', paused: 'Paused', idle: 'Idle', connect: 'Not connected' })[s.State];
});
const autopilotHelp = computed(() => account.value?.Autopilot ? 'Autopilot plans and publishes posts on the schedule.' : 'Switch on to plan and publish posts on the schedule.');

async function run(action: string | null, call: () => Promise<void>) {
    busy.value = true;
    busyAction.value = action;
    try {
        await call();
    } finally {
        busy.value = false;
        busyAction.value = null;
    }
}

async function update(body: Record<string, unknown>, done: string) {
    await run(null, async () => {
        const result = await igPost<{ updated: boolean; Notes: string[] }>('/omnigram/accounts/update', { accountId: accountId.value, ...body });
        if (!result.ok) notify('Could not update the account', result.error ?? '', 'error');
        else notify(done, (result.data?.Notes ?? []).join(' '));
        await loadAll();
    });
}

async function toggleAutopilot(event: Event) {
    const target = event.target as HTMLInputElement;
    const on = target.checked;
    target.checked = !on;
    if (!on && (summary.value?.Pending ?? 0) > 0
        && !(await confirmAction('Switch autopilot off?', 'Posts autopilot has planned for this account will be cancelled. Posts you composed stay scheduled.', 'Switch off', true)))
        return;
    await update({ autopilot: on }, on ? 'Autopilot on' : 'Autopilot off');
}

const togglePause = () => update({ paused: !account.value?.Paused }, account.value?.Paused ? 'Resumed' : 'Paused');

const notesDirty = computed(() => !!account.value && (notesDraft.value !== (account.value.Notes ?? '') || JSON.stringify(tagsDraft.value) !== JSON.stringify(account.value.Tags)));
const saveNotes = () => update({ notes: notesDraft.value, tags: tagsDraft.value }, 'Notes saved');

async function syncNow() {
    await run('sync', async () => {
        const result = await igPost<{ refreshed: boolean; Errors: string[] }>('/omnigram/accounts/refresh', { accountId: accountId.value });
        if (!result.ok) notify('Sync failed', result.error ?? '', 'error');
        else if (result.data?.Errors.length) notify('Synced with problems', result.data.Errors.join(' · '), 'warning');
        else notify('Synced from Instagram');
        await loadAll();
    });
}

async function planNow() {
    await run('plan', async () => {
        const result = await igPost<{ Planned: number; FreeSlots: number; Warning: string | null }>('/omnigram/accounts/plan-now', { accountId: accountId.value });
        if (!result.ok) notify('Planning failed', result.error ?? '', 'error');
        else if (result.data?.Warning) notify(`Planned ${result.data.Planned}`, result.data.Warning, 'warning');
        else notify(result.data?.Planned ? `Planned ${result.data.Planned} post(s)` : 'Every slot in the horizon is already filled');
        await loadAll();
    });
}

async function approveAll() {
    await run(null, async () => {
        const result = await igPost<{ approved: number }>('/omnigram/posts/approve', { accountId: accountId.value });
        if (!result.ok) notify('Could not approve', result.error ?? '', 'error');
        else notify(`Approved ${result.data?.approved ?? 0} post(s)`);
        await loadAll();
    });
}

async function renewToken() {
    await run('token', async () => {
        const result = await igPost<{ refreshed: boolean }>('/omnigram/accounts/refresh-token', { accountId: accountId.value });
        if (!result.ok) notify('Could not renew the token', result.error ?? '', 'error');
        else notify(result.data?.refreshed ? 'Token renewed for another 60 days' : 'The token was not due for renewal');
        await loadDetail();
    });
}

async function removeAccount() {
    if (!account.value) return;
    if (!(await confirmAction(`Stop managing @${account.value.Username}?`, 'Its queue is dropped and its history is archived on the server. Nothing is deleted on Instagram.', 'Remove', true))) return;
    const result = await igPost('/omnigram/accounts/remove', { accountId: accountId.value });
    if (!result.ok) { notify('Could not remove it', result.error ?? '', 'error'); return; }
    await refreshOverview();
    await router.push('/schemery/omnigram');
}

function openPost(postId: string) {
    drawerPostId.value = postId;
}

async function onWizardDone(payload: { accountId: string | null; openStrategy: boolean }) {
    wizardOpen.value = false;
    await loadAll();
    if (payload.openStrategy) setTab('strategy');
}

// ── derived views ──

const published = computed(() => (detail.value?.History ?? []).filter(p => p.Status === 'Published'));
const historyFiltered = computed(() => (detail.value?.History ?? []).filter(p => historyFilter.value === 'All' || p.Status === historyFilter.value));

const queueGroups = computed(() => {
    const groups: { label: string; posts: PostSummary[] }[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const post of detail.value?.Pending ?? []) {
        const d = new Date(post.ScheduledUtc);
        const day = new Date(d); day.setHours(0, 0, 0, 0);
        const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
        const label = diff < 0 ? 'Overdue' : diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow'
            : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
        const last = groups[groups.length - 1];
        if (last && last.label === label) last.posts.push(post);
        else groups.push({ label, posts: [post] });
    }
    return groups;
});

const commentsShown = computed(() => (comments.value ?? []).filter(c => commentFilter.value === 'all' || (!c.Own && !c.Replied)));

const followerPoints = computed(() => (analytics.value?.FollowersSeries ?? []).map(p => ({ x: new Date(p.T).getTime(), y: p.V })));

// Local noon: the day keys are calendar days, so this keeps every label on its own date.
const dayX = (day: string) => new Date(day + 'T12:00:00').getTime();
const accountSeries = computed(() => {
    const rows = analytics.value?.Account ?? [];
    return [
        { name: 'Accounts reached', colour: 'var(--ot-cat-1)', points: rows.filter(r => r.Reach != null).map(r => ({ x: dayX(r.Day), y: r.Reach as number })) },
        { name: 'Views', colour: 'var(--ot-cat-3)', points: rows.filter(r => r.Views != null).map(r => ({ x: dayX(r.Day), y: r.Views as number })) },
    ];
});
const followSeries = computed(() => {
    const rows = analytics.value?.Account ?? [];
    return [
        { name: 'New followers', colour: 'var(--ot-cat-1)', points: rows.filter(r => r.Follows != null).map(r => ({ x: dayX(r.Day), y: r.Follows as number })) },
        { name: 'Unfollows', colour: 'var(--ot-cat-5)', points: rows.filter(r => r.Unfollows != null).map(r => ({ x: dayX(r.Day), y: r.Unfollows as number })) },
    ];
});

// The shared OmniTumblr charts name their measure "Notes"; here it carries views.
const postingDays = computed(() => (analytics.value?.Posting ?? []).map(p => ({ Day: p.Day, Ours: p.Ours, Others: p.Others, Notes: p.Views })));
const heatCells = computed(() => (analytics.value?.Heatmap ?? []).map(c => ({ Dow: c.Dow, Hour: c.Hour, Posts: c.Posts, AvgNotes: c.AvgViews })));
const heatUnit = computed(() => (analytics.value?.BestSlotLabel?.includes(' likes ') ? 'likes' : 'views'));

function productLabel(type: string | null) {
    return type === 'REELS' ? 'Reel' : type === 'STORY' ? 'Story' : 'Post';
}

function ranked(items: Ranked[] | undefined, prefix = '') {
    return (items ?? []).map(r => ({ key: `${prefix}${r.Key}`, label: `${prefix}${r.Key}`, value: r.AvgViews, secondary: `${r.Posts} post${r.Posts === 1 ? '' : 's'} · ${fmtCount(r.AvgInteractions)} interactions avg` }));
}

const regionNames = (() => {
    try { return new Intl.DisplayNames(undefined, { type: 'region' }); } catch { return null; }
})();
const DEMO_LABELS: Record<string, string> = { age: 'Age', gender: 'Gender', country: 'Country', city: 'City' };
const GENDER: Record<string, string> = { F: 'Women', M: 'Men', U: 'Unknown' };

const demographicGroups = computed(() => {
    const demo = analytics.value?.Demographics ?? {};
    return Object.keys(DEMO_LABELS).filter(k => demo[k]?.length).map(k => ({
        key: k,
        label: DEMO_LABELS[k],
        items: demo[k].map(r => {
            let label = r.Key;
            if (k === 'gender') label = GENDER[r.Key] ?? r.Key;
            else if (k === 'country' && /^[A-Z]{2}$/.test(r.Key)) label = regionNames?.of(r.Key) ?? r.Key;
            return { key: `${k}:${r.Key}`, label, value: r.AvgViews, secondary: `${fmtCount(r.Posts)} followers` };
        }),
    }));
});

function compareCounts(current: number | null | undefined, previous: number | null | undefined) {
    if (current == null || previous == null) return null;
    const absolute = current - previous;
    return { absolute, percent: previous > 0 ? (absolute / previous) * 100 : null, direction: Math.sign(absolute) };
}
const countChange = (v: { absolute: number; percent: number | null }) =>
    `${fmtSignedCount(v.absolute)}${v.percent != null ? ` (${v.percent >= 0 ? '+' : ''}${v.percent.toFixed(1)}%)` : ''}`;

const followerCompare = computed(() => {
    const s = summary.value;
    if (!s || s.Followers == null || s.FollowersDelta7d == null) return null;
    return compareCounts(s.Followers, s.Followers - s.FollowersDelta7d);
});

const scheduleSummary = computed(() => {
    const st = account.value?.Strategy;
    if (!st || !st.Slots.length) return 'no time slots';
    const byDay = new Map<number, number[]>();
    for (const s of st.Slots) byDay.set(Number(s.Day), [...(byDay.get(Number(s.Day)) ?? []), s.Minute]);
    const parts = WEEK_ORDER.filter(d => byDay.has(d)).map(d => `${DAY_SHORT[d]} ${byDay.get(d)!.sort((a, b) => a - b).map(minuteToHHMM).join(', ')}`);
    return `${parts.join(' · ')} (${st.TimeZone})`;
});

const sourceSummary = computed(() => {
    const st = account.value?.Strategy;
    if (!st) return '';
    switch (st.Source) {
        case 'MemeScraper': return `MemeScraper reels${st.MemeScraper.Niches.length ? ` · niches ${st.MemeScraper.Niches.join(', ')}` : ''}${st.MemeScraper.Sources.length ? ` · ${st.MemeScraper.Sources.length} account(s)` : ''} · ${st.MemeScraper.Pick.toLowerCase()} first`;
        case 'Folder': return `folder ${st.Folder.Path}`;
        case 'Library': return 'upload library';
        default: return 'manual only';
    }
});

const formatSummary = computed(() => {
    const st = account.value?.Strategy;
    if (!st) return '';
    const video = st.VideoFormat === 'Reel'
        ? `videos as reels${st.Reels.Trial !== 'Off' ? ' (trial)' : ''}${st.Reels.AlsoPostStory ? ' + story' : ''}`
        : 'videos as stories';
    return `${video} · images as ${st.ImageFormat === 'Story' ? 'stories' : 'photos'}`;
});

const captionSummary = computed(() => {
    const st = account.value?.Strategy;
    if (!st) return '';
    if (st.CaptionMode === 'AI') return `AI${st.Ai.UseVision ? ', looks at the media' : ''} · ≤${st.Ai.MaxLength} chars · “${st.Ai.Persona.slice(0, 60)}${st.Ai.Persona.length > 60 ? '…' : ''}”`;
    return ({ Fixed: 'fixed caption', Rotate: `rotating pool of ${st.CaptionPool.length}`, Original: 'the source\'s own caption', None: 'no caption text', Manual: 'written by hand' } as Record<string, string>)[st.CaptionMode] ?? st.CaptionMode;
});

const hashtagSummary = computed(() => {
    const st = account.value?.Strategy;
    if (!st) return '';
    const fixed = st.FixedHashtags.map(t => '#' + t).join(' ');
    const where = st.HashtagPlacement === 'FirstComment' ? ' · in the first comment' : st.HashtagPlacement === 'None' ? ' · not used' : '';
    const rotating = st.RotatingHashtags.length ? ` + ${st.RotatingHashtagsPerPost} of ${st.RotatingHashtags.length} rotating` : '';
    return `${fixed || 'none fixed'}${rotating}${where}`;
});

const runwaySubtitle = computed(() => {
    const src = detail.value?.Runway.Source;
    return src === 'MemeScraper' ? 'Unused MemeScraper reels matching this account\'s filters' : src === 'Library' ? 'Unused files in the upload library' : src === 'Folder' ? 'Unused files in the folder' : 'No content source';
});
</script>

<style scoped>
.ig-accounthead .who { display: flex; align-items: center; gap: var(--ot-space-3); min-width: 0; }
.ig-accounthead .whotext { min-width: 0; }
.ig-accounthead h1 { overflow-wrap: anywhere; }
.ig-accounthead .subtitle a { color: var(--ot-info); }
.switch { padding: 0 var(--ot-space-2); border: 1px solid var(--ot-line-strong); border-radius: var(--ot-radius-sm); height: var(--ot-control); }
.tabs { margin: var(--ot-space-2) 0 var(--ot-space-4); flex-wrap: wrap; max-width: 100%; }
.tabs .count { margin-left: 6px; padding: 0 6px; border-radius: 999px; background: var(--ot-surface-3); font-size: 11px; }
.ot-segment.wrap { flex-wrap: wrap; }
.list { display: flex; flex-direction: column; padding: var(--ot-space-1); }
.ot-kpis { margin-bottom: var(--ot-gutter); }
.ig-section { margin-top: var(--ot-gutter); }
.runway { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--ot-space-2); font-size: 13px; color: var(--ot-text-2); }
.runway .big { font-size: 30px; font-weight: 650; color: var(--ot-text); font-family: var(--ot-mono); }
.warnline { color: var(--ot-warning); font-size: 12px; margin: var(--ot-space-2) 0 0; }
.runwaygrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--ot-space-2); margin-top: var(--ot-space-3); }
.runwaygrid :deep(.tb-thumb.md) { width: 100%; height: auto; aspect-ratio: 9 / 16; }
.small { font-size: 11.5px; margin: var(--ot-space-2) 0 0; }
.limits { display: flex; flex-direction: column; gap: var(--ot-space-3); margin-top: var(--ot-space-3); }
dd.warn { color: var(--ot-warning); }
.daygroup + .daygroup { border-top: 1px solid var(--ot-line-strong); }
.dayhead { margin: 0; padding: var(--ot-space-2) var(--ot-space-3) 0; font-size: 11.5px; letter-spacing: 0.4px; text-transform: uppercase; color: var(--ot-muted); }
.captioncell { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.captioncell .fmt { color: var(--ot-muted); }
.captioncell .sub { display: block; white-space: normal; font-size: 11px; }
.rangebar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--ot-space-3); margin-bottom: var(--ot-space-3); }
.toplist { list-style: none; margin: 0; padding: var(--ot-space-1) var(--ot-space-3); display: flex; flex-direction: column; }
.toplist li { display: flex; align-items: center; gap: var(--ot-space-3); padding: 6px 0; font-size: 12.5px; min-width: 0; }
.toplist li + li { border-top: 1px solid var(--ot-line); }
.rank { width: 18px; color: var(--ot-muted); font-family: var(--ot-mono); text-align: right; flex: 0 0 auto; }
.topmain { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.topmain a { color: var(--ot-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.topmain a:hover { color: var(--ot-info); }
.topmain .sub { font-size: 11px; color: var(--ot-muted); }
.views { font-family: var(--ot-mono); font-weight: 600; flex: 0 0 auto; }
.demo { display: grid; gap: var(--ot-gutter); grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); }
.tagsfield { margin-top: var(--ot-space-3); }
.savebar { margin-top: var(--ot-space-3); display: flex; flex-wrap: wrap; gap: var(--ot-space-2); }
</style>
