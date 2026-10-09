<template>
    <OmniTumblrShell @refresh="loadAll">
        <div v-if="!detail && loading" class="ot-skelrows"><div class="ot-skel" style="height:64px"></div><div class="ot-skel" style="height:240px"></div></div>
        <div v-else-if="!detail && loadError" class="ot-card"><div class="body">
            <OmniTraderStateBlock kind="error" title="Could not load this blog" :detail="loadError">
                <NuxtLink class="ot-btn sm" to="/schemery/omnitumblr">Back to all blogs</NuxtLink>
            </OmniTraderStateBlock>
        </div></div>

        <template v-else-if="detail">
            <div class="ot-pagehead tb-bloghead">
                <div class="who">
                    <OmniTumblrAvatar :src="summary!.AvatarUrl" :name="blog!.Name" :size="52" />
                    <div>
                        <h1>@{{ blog!.Name }}</h1>
                        <p class="subtitle">
                            {{ blog!.Title || 'Untitled blog' }}
                            · <a :href="summary!.Url ?? '#'" target="_blank" rel="noopener noreferrer">open on Tumblr ↗</a>
                            <template v-if="detail.Connection"> · account @{{ detail.Connection.UserName }}</template>
                        </p>
                    </div>
                    <span class="ot-chip" :class="blogStateTone(summary!.State)" :title="summary!.StateReason">{{ stateLabel }}</span>
                </div>
                <div v-if="can('omnitumblr.blogs.manage')" class="ot-actions">
                    <label class="ot-check switch" :title="autopilotHelp">
                        <input type="checkbox" :checked="blog!.Autopilot" :disabled="busy" @change="toggleAutopilot" />
                        Autopilot
                    </label>
                    <button class="ot-btn ghost" :disabled="busy" @click="togglePause">{{ blog!.Paused ? 'Resume' : 'Pause' }}</button>
                    <button class="ot-btn ghost" :disabled="busy" @click="syncNow">{{ busyAction === 'sync' ? 'Refreshing…' : 'Refresh from Tumblr' }}</button>
                    <button v-if="blog!.Autopilot" class="ot-btn ghost" :disabled="busy" @click="planNow">{{ busyAction === 'plan' ? 'Planning…' : 'Plan now' }}</button>
                    <NuxtLink class="ot-btn" :to="`/schemery/omnitumblr/compose?blog=${blogId}`">Compose</NuxtLink>
                    <button class="ot-btn danger sm" :disabled="busy" @click="removeBlog">Remove</button>
                </div>
            </div>

            <div v-if="detail.Connection?.Health === 'NeedsReauth'" class="ot-banner" role="alert">
                <span class="glyph">⚠</span>
                <div><strong>Tumblr no longer accepts this account's authorization</strong>{{ detail.Connection.HealthDetail }}. Nothing is posted until it is reconnected.</div>
                <div v-if="can('omnitumblr.settings.manage')" class="actions"><button class="ot-btn sm" @click="wizardOpen = true">Reconnect @{{ detail.Connection.UserName }}</button></div>
            </div>
            <div v-else-if="summary!.State !== 'ok' && summary!.State !== 'idle'" class="ot-banner" :class="summary!.State === 'error' ? '' : 'warn'">
                <span class="glyph">{{ summary!.State === 'paused' ? '⏸' : '!' }}</span>
                <div><strong>{{ stateLabel }}</strong> {{ summary!.StateReason }}</div>
            </div>
            <div v-if="!blog!.Autopilot && tab !== 'strategy'" class="ot-banner info">
                <span class="glyph">ℹ</span>
                <div><strong>Autopilot is off.</strong> Only posts you compose go out. Review the strategy, then switch autopilot on to have posts planned and captioned automatically.</div>
                <div class="actions"><button class="ot-btn sm" @click="setTab('strategy')">Review strategy</button></div>
            </div>

            <div class="ot-segment tabs" role="tablist" aria-label="Blog sections">
                <button v-for="t in TABS" :key="t.id" type="button" role="tab" :aria-pressed="tab === t.id" :aria-selected="tab === t.id" @click="setTab(t.id)">
                    {{ t.label }}<span v-if="t.count" class="count">{{ t.count }}</span>
                </button>
            </div>

            <!-- ── Overview ── -->
            <template v-if="tab === 'overview'">
                <div class="ot-kpis tb-kpis6">
                    <OmniTraderKpi label="Followers" :value="fmtCount(summary!.Followers)" :compare="followerCompare" baseline="vs 7 days ago"
                                   :compare-format="countChange" :spark="summary!.FollowersSpark" />
                    <OmniTraderKpi label="Published" :value="String(summary!.Published7d)" foot="last 7 days"
                                   :baseline="`${summary!.SlotsPerWeek} slot${summary!.SlotsPerWeek === 1 ? '' : 's'} a week`" />
                    <OmniTraderKpi label="Notes per post" :value="summary!.AvgNotes30d != null ? String(summary!.AvgNotes30d) : '—'" foot="30-day average" />
                    <OmniTraderKpi label="Engagement" :value="analytics?.EngagementRate != null ? `${analytics.EngagementRate.toFixed(2)}%` : '—'"
                                   foot="notes per post ÷ followers" help="Average notes on a post as a share of followers, last 30 days." />
                    <OmniTraderKpi label="Queue" :value="String(summary!.Pending)" :attention-soft="summary!.AwaitingApproval > 0"
                                   :foot="summary!.AwaitingApproval ? `${summary!.AwaitingApproval} awaiting approval` : 'scheduled or being prepared'" />
                    <OmniTraderKpi label="Next post" small :value="summary!.NextPost ? fmtRelative(summary!.NextPost.ScheduledUtc, now) : 'none'"
                                   :foot="summary!.NextPost ? fmtWhen(summary!.NextPost.ScheduledUtc) : (blog!.Autopilot ? 'planning…' : 'nothing scheduled')" />
                </div>

                <div class="ot-grid sidebar">
                    <div class="ot-stack">
                        <OmniTraderCard title="Coming up" :empty="!detail.Pending.length" empty-title="Nothing scheduled"
                                        :empty-text="blog!.Autopilot ? `Autopilot plans up to ${blog!.Strategy.PlanAheadDays} days ahead.` : 'Compose a post or switch on autopilot.'" flush>
                            <template #controls><button class="ot-btn sm ghost" @click="setTab('queue')">Whole queue</button></template>
                            <div class="list"><OmniTumblrPostRow v-for="p in detail.Pending.slice(0, 5)" :key="p.PostId" :post="p" @open="openPost" /></div>
                        </OmniTraderCard>
                        <OmniTraderCard title="Recently published" :empty="!published.length" empty-title="Nothing published yet" flush>
                            <template #controls><button class="ot-btn sm ghost" @click="setTab('published')">All posts</button></template>
                            <div class="list"><OmniTumblrPostRow v-for="p in published.slice(0, 5)" :key="p.PostId" :post="p" @open="openPost" /></div>
                        </OmniTraderCard>
                        <OmniTraderCard title="Followers" subtitle="Last 30 days" :empty="followerPoints.length < 2" empty-title="Not enough history yet"
                                        empty-text="Recorded every few hours from Tumblr.">
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
                                        <OmniTumblrThumb size="md" :kind="c.Kind" :path="contentThumbPath(blogId, c.Key)"
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
                                <dt>Captions</dt><dd>{{ captionSummary }}</dd>
                                <dt>Tags</dt><dd>{{ blog!.Strategy.FixedTags.map(t => '#' + t).join(' ') || '—' }}</dd>
                                <dt>Approval</dt><dd>{{ blog!.RequireApproval ? 'posts wait for approval' : 'posts go out automatically' }}</dd>
                            </dl>
                        </OmniTraderCard>

                        <OmniTraderCard title="Health">
                            <dl class="ot-kv">
                                <dt>Connection</dt><dd>{{ detail.Connection ? `@${detail.Connection.UserName} · ${detail.Connection.Health}` : 'none' }}</dd>
                                <dt>Last success</dt><dd>{{ blog!.Health.LastSuccessUtc ? fmtRelative(blog!.Health.LastSuccessUtc, now) : 'never' }}</dd>
                                <dt>Last error</dt><dd>{{ blog!.Health.LastError ? `${blog!.Health.LastError} (${fmtRelative(blog!.Health.LastErrorUtc, now)})` : 'none' }}</dd>
                                <dt>Synced</dt><dd>info {{ fmtRelative(blog!.Stats.InfoSyncedUtc, now) }} · posts {{ fmtRelative(blog!.Stats.PostsIndexSyncedUtc, now) }} · activity {{ fmtRelative(blog!.Stats.ActivitySyncedUtc, now) }}</dd>
                            </dl>
                            <div v-if="relevantLimits.length" class="limits">
                                <OmniTraderMeter v-for="l in relevantLimits" :key="l.Key" :label="limitLabel(l.Key)"
                                                 :value="`${l.Limit - l.Remaining} used`" :limit="`of ${l.Limit} today`"
                                                 :percent="l.Limit ? ((l.Limit - l.Remaining) / l.Limit) * 100 : null" />
                            </div>
                        </OmniTraderCard>
                    </div>
                </div>
            </template>

            <!-- ── Queue ── -->
            <template v-else-if="tab === 'queue'">
                <div v-if="summary!.AwaitingApproval && can('omnitumblr.posts.act')" class="ot-banner info">
                    <span class="glyph">ℹ</span>
                    <div><strong>{{ summary!.AwaitingApproval }} post(s) are waiting for approval.</strong> Open one to edit it, or approve them all.</div>
                    <div class="actions"><button class="ot-btn sm primary" :disabled="busy" @click="approveAll">Approve all</button></div>
                </div>
                <OmniTraderCard :title="`Queue · ${detail.Pending.length}`" subtitle="Everything scheduled or being prepared, soonest first. Click a post to edit it."
                                :empty="!detail.Pending.length" empty-title="Nothing scheduled"
                                :empty-text="blog!.Autopilot ? `Autopilot plans up to ${blog!.Strategy.PlanAheadDays} days ahead — use Plan now if a slot is empty.` : 'Compose a post or switch on autopilot.'" flush>
                    <div v-for="group in queueGroups" :key="group.label" class="daygroup">
                        <h3 class="dayhead">{{ group.label }}</h3>
                        <OmniTumblrPostRow v-for="p in group.posts" :key="p.PostId" :post="p" @open="openPost" />
                    </div>
                </OmniTraderCard>
            </template>

            <!-- ── Published ── -->
            <template v-else-if="tab === 'published'">
                <OmniTraderCard title="Post history" :subtitle="`${historyFiltered.length} of ${detail.History.length} shown`" flush>
                    <template #controls>
                        <div class="ot-segment sm" role="group" aria-label="Filter">
                            <button v-for="f in HISTORY_FILTERS" :key="f" type="button" :aria-pressed="historyFilter === f" @click="historyFilter = f">{{ f }}</button>
                        </div>
                    </template>
                    <div class="ot-tablewrap">
                        <table class="ot-table">
                            <thead>
                                <tr><th></th><th>Caption</th><th>When</th><th class="num">Notes</th><th class="num">♥</th><th class="num">⟳</th><th class="num">24 h / 7 d</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                <tr v-for="p in historyFiltered" :key="p.PostId" class="clickable" tabindex="0" @click="openPost(p.PostId)" @keydown.enter="openPost(p.PostId)">
                                    <td><OmniTumblrThumb size="xs" :kind="p.Kind" :path="p.HasThumbnail ? postThumbPath(p.PostId) : null" /></td>
                                    <td class="captioncell">{{ p.Caption || '(no caption)' }}<span v-if="p.LastError && p.Status !== 'Published'" class="sub neg">{{ p.LastError }}</span></td>
                                    <td class="nowrap">{{ fmtWhen(p.PublishedUtc ?? p.ScheduledUtc) }}</td>
                                    <td class="num">{{ p.Status === 'Published' ? fmtCount(p.Notes) : '' }}</td>
                                    <td class="num">{{ p.Likes ?? '' }}</td>
                                    <td class="num">{{ p.Reblogs ?? '' }}</td>
                                    <td class="num">{{ p.Status === 'Published' ? `${p.NotesAt24h ?? '·'} / ${p.NotesAt7d ?? '·'}` : '' }}</td>
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
                    <span class="muted small">{{ analytics ? `${fmtDate(analytics.FromUtc)} – ${fmtDate(analytics.ToUtc)}` : '' }}</span>
                </div>
                <div class="ot-kpis tb-kpis6">
                    <OmniTraderKpi label="Followers" :value="fmtCount(analytics?.Followers)" :loading="!analytics"
                                   :foot="analytics?.FollowersDelta != null ? `${fmtSignedCount(analytics.FollowersDelta)} in range${analytics.FollowersGrowthPerWeek != null ? ` · ${fmtSignedCount(analytics.FollowersGrowthPerWeek)}/week` : ''}` : 'no baseline yet'" />
                    <OmniTraderKpi label="Posts published" :value="String(analytics?.PostsPublished ?? '—')" :loading="!analytics"
                                   :compare="compareCounts(analytics?.PostsPublished, analytics?.PostsPublishedPrev)" baseline="vs previous period" :compare-format="countChange" />
                    <OmniTraderKpi label="Notes" :value="fmtCount(analytics?.Notes)" :loading="!analytics"
                                   :compare="compareCounts(analytics?.Notes, analytics?.NotesPrev)" baseline="vs previous period" :compare-format="countChange"
                                   foot="on posts published in range" />
                    <OmniTraderKpi label="Notes per post" :value="analytics?.AvgNotes != null ? String(analytics.AvgNotes) : '—'" :loading="!analytics"
                                   :foot="analytics?.MedianNotes != null ? `median ${analytics.MedianNotes}` : ''" />
                    <OmniTraderKpi label="Engagement" :value="analytics?.EngagementRate != null ? `${analytics.EngagementRate.toFixed(2)}%` : '—'" :loading="!analytics"
                                   foot="notes per post ÷ followers" />
                    <OmniTraderKpi label="Likes · reblogs · replies" small :loading="!analytics"
                                   :value="analytics?.Likes != null ? `${fmtCount(analytics.Likes)} · ${fmtCount(analytics.Reblogs)} · ${fmtCount(analytics.Replies)}` : '—'"
                                   foot="breakdowns read at 1, 3, 7 and 30 days" />
                </div>

                <div class="tb-pair tb-section">
                    <OmniTraderCard title="Followers" :empty="analyticsFollowerPoints.length < 2" empty-title="Not enough history yet">
                        <OmniTraderLineChart :series="[{ name: 'Followers', colour: 'var(--ot-cat-1)', points: analyticsFollowerPoints }]" :height="230" :format="(v: number) => fmtCount(v)" />
                    </OmniTraderCard>
                    <OmniTraderCard title="Notes by publishing day" :subtitle="(analytics?.Days ?? 0) > 120 ? 'Notes earned by each week’s posts' : 'Notes earned by each day’s posts'">
                        <OmniTumblrDailyBars :days="analytics?.Posting ?? []" :height="230" />
                    </OmniTraderCard>
                </div>
                <div class="tb-pair tb-section">
                    <OmniTraderCard title="Audience activity" subtitle="From the blog's activity feed"
                                    :empty="!activitySeries.some(s => s.points.some(p => p.y > 0))" empty-title="No activity recorded yet">
                        <OmniTraderLineChart :series="activitySeries" :height="230" :zero-based="true" x-label="Day"
                                             :format="(v: number) => fmtCount(Math.round(v))" />
                    </OmniTraderCard>
                    <OmniTraderCard title="Best times to post" :subtitle="analytics?.BestSlotLabel ? `Strongest: ${analytics.BestSlotLabel}` : 'Average notes by weekday and hour, last 120 days'">
                        <OmniTumblrHeatmap :cells="analytics?.Heatmap ?? []" :time-zone="analytics?.TimeZone" :sample-size="analytics?.SampleSize" />
                    </OmniTraderCard>
                </div>

                <div class="tb-pair tb-section">
                    <OmniTraderCard title="Top posts" subtitle="By notes, including posts made outside OmniTumblr" :empty="!analytics?.TopPosts.length" empty-title="No posts in this range" flush>
                        <ol class="toplist">
                            <li v-for="(t, i) in analytics?.TopPosts ?? []" :key="t.Id">
                                <span class="rank">{{ i + 1 }}</span>
                                <OmniTumblrThumb size="xs" :kind="t.Type === 'video' ? 'Video' : t.Type === 'photo' ? 'Photo' : 'Text'"
                                                 :path="t.HasThumbnail && t.OmniPostId ? postThumbPath(t.OmniPostId) : null" />
                                <div class="topmain">
                                    <a :href="t.Url ?? undefined" target="_blank" rel="noopener noreferrer">{{ t.Summary || `${t.Type ?? 'post'} ${t.Id}` }}</a>
                                    <span class="sub">{{ fmtWhen(t.PublishedUtc) }}{{ t.Ours ? ' · by OmniTumblr' : '' }}</span>
                                </div>
                                <span class="notes">{{ fmtCount(t.Notes) }}</span>
                            </li>
                        </ol>
                    </OmniTraderCard>
                    <div class="ot-stack">
                        <OmniTraderCard title="Tags that work" subtitle="Average notes per post using the tag (2+ uses)">
                            <OmniTraderBarList :items="ranked(analytics?.Tags, '#')" :signed="false" empty-title="Not enough tagged posts yet" />
                        </OmniTraderCard>
                        <OmniTraderCard title="Content sources" subtitle="Average notes by where the content came from">
                            <OmniTraderBarList :items="ranked(analytics?.Sources, '@')" :signed="false" empty-title="No sourced posts yet" />
                        </OmniTraderCard>
                        <OmniTraderCard title="Caption styles">
                            <OmniTraderBarList :items="ranked(analytics?.CaptionModes)" :signed="false" empty-title="No captioned posts yet" />
                        </OmniTraderCard>
                    </div>
                </div>
            </template>

            <!-- ── Strategy ── -->
            <template v-else-if="tab === 'strategy'">
                <OmniTumblrStrategyEditor :blog-id="blogId" :strategy="blog!.Strategy" :require-approval="blog!.RequireApproval" @saved="loadDetail" />
                <OmniTraderCard v-if="can('omnitumblr.blogs.manage')" title="Notes" subtitle="Private notes about this blog" class="tb-section">
                    <textarea v-model="notesDraft" class="ot-input" rows="3" maxlength="4000" aria-label="Private notes about this blog"></textarea>
                    <div class="savebar"><button class="ot-btn sm" :disabled="busy || notesDraft === (blog!.Notes ?? '')" @click="saveNotes">Save notes</button></div>
                </OmniTraderCard>
            </template>

            <!-- ── Activity ── -->
            <template v-else-if="tab === 'activity'">
                <div class="ot-grid two">
                    <OmniTraderCard title="On Tumblr" subtitle="Likes, reblogs, replies and follows from the blog's activity feed">
                        <OmniTumblrActivityList :items="detail.Activity" />
                    </OmniTraderCard>
                    <OmniTraderCard title="OmniTumblr log" subtitle="Everything OmniTumblr did for this blog">
                        <OmniTumblrEventList :events="detail.Events" :show-blog="false" :limit="40" @open-post="openPost" />
                    </OmniTraderCard>
                </div>
            </template>
        </template>

        <OmniTumblrPostDrawer :open="!!drawerPostId" :post-id="drawerPostId" @close="drawerPostId = null" @changed="loadAll" />
        <OmniTumblrConnectWizard :open="wizardOpen" :app="overview?.App ?? null" :reconnect-connection-id="detail?.Connection?.ConnectionId ?? null"
                                 @close="wizardOpen = false" @done="() => { wizardOpen = false; loadAll(); }" />
    </OmniTumblrShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAccess } from '~/composables/useAccess';
import {
    DAY_SHORT, STATUS_LABEL, WEEK_ORDER, blogStateTone, confirmAction, contentThumbPath, fmtCount, fmtDate, fmtClipLength, fmtRelative,
    fmtSignedCount, fmtWhen, minuteToHHMM, notify, postThumbPath, q, statusTone, tumblrGet, tumblrPost, useNow, usePoll, useTumblrOverview,
    type Analytics, type BlogDetail, type PostSummary, type Ranked,
} from '~/composables/useOmniTumblr';

definePageMeta({ layout: 'navbar' });

const route = useRoute();
const router = useRouter();
const { can } = useAccess();
const { overview, refresh: refreshOverview } = useTumblrOverview();
const now = useNow();

const blogId = computed(() => String(route.params.blogId));
const detail = ref<BlogDetail | null>(null);
const analytics = ref<Analytics | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const busy = ref(false);
const busyAction = ref<string | null>(null);
const drawerPostId = ref<string | null>(null);
const wizardOpen = ref(false);
const notesDraft = ref('');
const historyFilter = ref('All');
const range = ref(30);

const blog = computed(() => detail.value?.Blog ?? null);
const summary = computed(() => detail.value?.Summary ?? null);

useHead(() => ({ title: blog.value ? `@${blog.value.Name} · OmniTumblr` : 'OmniTumblr' }));

type Tab = 'overview' | 'queue' | 'published' | 'analytics' | 'strategy' | 'activity';
const tab = computed<Tab>(() => {
    const t = String(route.query.tab ?? 'overview');
    return (['overview', 'queue', 'published', 'analytics', 'strategy', 'activity'].includes(t) ? t : 'overview') as Tab;
});
const TABS = computed(() => [
    { id: 'overview' as Tab, label: 'Overview', count: 0 },
    { id: 'queue' as Tab, label: 'Queue', count: detail.value?.Pending.length ?? 0 },
    { id: 'published' as Tab, label: 'Published', count: 0 },
    { id: 'analytics' as Tab, label: 'Analytics', count: 0 },
    { id: 'strategy' as Tab, label: 'Strategy', count: 0 },
    { id: 'activity' as Tab, label: 'Activity', count: 0 },
]);
const HISTORY_FILTERS = ['All', 'Published', 'Failed', 'Skipped', 'Cancelled', 'Removed'];
const RANGES = [{ days: 7, label: '7 d' }, { days: 30, label: '30 d' }, { days: 90, label: '90 d' }, { days: 365, label: '1 y' }];

function setTab(t: Tab) {
    void router.replace({ query: { ...route.query, tab: t === 'overview' ? undefined : t } });
}

async function loadDetail() {
    loading.value = true;
    const result = await tumblrGet<BlogDetail>(`/omnitumblr/blog${q({ blogId: blogId.value })}`);
    loading.value = false;
    if (result.ok && result.data) {
        detail.value = result.data;
        loadError.value = null;
        if (notesDraft.value === '' || notesDraft.value === (detail.value.Blog.Notes ?? '')) notesDraft.value = result.data.Blog.Notes ?? '';
    } else {
        loadError.value = result.error;
    }
}

async function loadAnalytics() {
    const result = await tumblrGet<Analytics>(`/omnitumblr/analytics${q({ blogId: blogId.value, days: range.value })}`);
    if (result.ok && result.data) analytics.value = result.data;
}

async function loadAll() {
    await Promise.all([loadDetail(), loadAnalytics(), refreshOverview()]);
}

usePoll(() => Promise.all([loadDetail(), tab.value === 'analytics' ? loadAnalytics() : Promise.resolve()]), 30_000);
watch(blogId, () => { detail.value = null; analytics.value = null; void loadAll(); });
watch(tab, t => { if (t === 'analytics' || t === 'overview') void loadAnalytics(); }, { immediate: true });

function setRange(days: number) {
    range.value = days;
    analytics.value = null;
    void loadAnalytics();
}

// ── header actions ──

const stateLabel = computed(() => {
    const s = summary.value;
    if (!s) return '';
    return ({ ok: s.Autopilot ? 'Autopilot' : 'Manual', attention: 'Needs attention', error: 'Problem', paused: 'Paused', idle: 'Idle' })[s.State];
});
const autopilotHelp = computed(() => blog.value?.Autopilot ? 'Autopilot plans and publishes posts on the schedule.' : 'Switch on to plan and publish posts on the schedule.');

async function update(body: Record<string, unknown>, done: string) {
    busy.value = true;
    try {
        const result = await tumblrPost<{ Notes: string[] }>('/omnitumblr/blogs/update', { blogId: blogId.value, ...body });
        if (!result.ok) notify('Could not update the blog', result.error ?? '', 'error');
        else notify(done, (result.data?.Notes ?? []).join(' '));
        await loadAll();
    } finally {
        busy.value = false;
    }
}

async function toggleAutopilot(event: Event) {
    const target = event.target as HTMLInputElement;
    const on = target.checked;
    target.checked = !on;
    if (!on && (summary.value?.Pending ?? 0) > 0
        && !(await confirmAction('Switch autopilot off?', 'Posts autopilot has planned for this blog will be cancelled. Posts you composed stay scheduled.', 'Switch off', true)))
        return;
    await update({ autopilot: on }, on ? 'Autopilot on' : 'Autopilot off');
}

const togglePause = () => update({ paused: !blog.value?.Paused }, blog.value?.Paused ? 'Resumed' : 'Paused');
const saveNotes = () => update({ notes: notesDraft.value }, 'Notes saved');

async function syncNow() {
    busy.value = true;
    busyAction.value = 'sync';
    try {
        const result = await tumblrPost<{ Errors: string[] }>('/omnitumblr/blogs/refresh', { blogId: blogId.value });
        if (!result.ok) notify('Refresh failed', result.error ?? '', 'error');
        else if (result.data?.Errors.length) notify('Refreshed with problems', result.data.Errors.join(' · '), 'warning');
        else notify('Refreshed from Tumblr');
        await loadAll();
    } finally {
        busy.value = false;
        busyAction.value = null;
    }
}

async function planNow() {
    busy.value = true;
    busyAction.value = 'plan';
    try {
        const result = await tumblrPost<{ Planned: number; FreeSlots: number; Warning: string | null }>('/omnitumblr/blogs/plan-now', { blogId: blogId.value });
        if (!result.ok) notify('Planning failed', result.error ?? '', 'error');
        else if (result.data?.Warning) notify(`Planned ${result.data.Planned}`, result.data.Warning, 'warning');
        else notify(result.data?.Planned ? `Planned ${result.data.Planned} post(s)` : 'Every slot in the horizon is already filled');
        await loadAll();
    } finally {
        busy.value = false;
        busyAction.value = null;
    }
}

async function approveAll() {
    busy.value = true;
    try {
        const result = await tumblrPost<{ approved: number }>('/omnitumblr/posts/approve', { blogId: blogId.value });
        if (!result.ok) notify('Could not approve', result.error ?? '', 'error');
        else notify(`Approved ${result.data?.approved ?? 0} post(s)`);
        await loadAll();
    } finally {
        busy.value = false;
    }
}

async function removeBlog() {
    if (!blog.value) return;
    if (!(await confirmAction(`Stop managing @${blog.value.Name}?`, 'Pending posts are cancelled and its history is archived. Nothing is deleted on Tumblr.', 'Remove', true))) return;
    const result = await tumblrPost('/omnitumblr/blogs/remove', { blogId: blogId.value });
    if (!result.ok) { notify('Could not remove it', result.error ?? '', 'error'); return; }
    await refreshOverview();
    await router.push('/schemery/omnitumblr');
}

function openPost(postId: string) {
    drawerPostId.value = postId;
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

const followerPoints = computed(() => (analytics.value?.FollowersSeries ?? []).map(p => ({ x: new Date(p.T).getTime(), y: p.V })));
const analyticsFollowerPoints = followerPoints;

const activitySeries = computed(() => {
    const rows = analytics.value?.Activity ?? [];
    // Local noon: the day keys are calendar days, so this keeps every label on its own date.
    const x = (day: string) => new Date(day + 'T12:00:00').getTime();
    return [
        { name: 'Likes', colour: 'var(--ot-cat-5)', points: rows.map(r => ({ x: x(r.Day), y: r.Likes })) },
        { name: 'Reblogs', colour: 'var(--ot-cat-3)', points: rows.map(r => ({ x: x(r.Day), y: r.Reblogs })) },
        { name: 'New followers', colour: 'var(--ot-cat-1)', points: rows.map(r => ({ x: x(r.Day), y: r.Follows })) },
        { name: 'Replies', colour: 'var(--ot-cat-7)', points: rows.map(r => ({ x: x(r.Day), y: r.Replies })) },
    ];
});

function ranked(items: Ranked[] | undefined, prefix = '') {
    return (items ?? []).map(r => ({ key: r.Key, label: `${prefix}${r.Key}`, value: r.AvgNotes, secondary: `${r.Posts} posts · ${r.TotalNotes} notes` }));
}

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
    const st = blog.value?.Strategy;
    if (!st || !st.Slots.length) return 'no time slots';
    const byDay = new Map<number, number[]>();
    for (const s of st.Slots) byDay.set(s.Day, [...(byDay.get(s.Day) ?? []), s.Minute]);
    const parts = WEEK_ORDER.filter(d => byDay.has(d)).map(d => `${DAY_SHORT[d]} ${byDay.get(d)!.sort((a, b) => a - b).map(minuteToHHMM).join(', ')}`);
    return `${parts.join(' · ')} (${st.TimeZone})`;
});

const sourceSummary = computed(() => {
    const st = blog.value?.Strategy;
    if (!st) return '';
    switch (st.Source) {
        case 'MemeScraper': return `MemeScraper reels${st.MemeScraper.Niches.length ? ` · niches ${st.MemeScraper.Niches.join(', ')}` : ''}${st.MemeScraper.Sources.length ? ` · ${st.MemeScraper.Sources.length} account(s)` : ''} · ${st.MemeScraper.Pick.toLowerCase()} first`;
        case 'Folder': return `folder ${st.Folder.Path}`;
        case 'Library': return 'upload library';
        default: return 'manual only';
    }
});

const captionSummary = computed(() => {
    const st = blog.value?.Strategy;
    if (!st) return '';
    if (st.CaptionMode === 'AI') return `AI${st.Ai.UseVision ? ', looks at the video' : ''} · ≤${st.Ai.MaxLength} chars · “${st.Ai.Persona.slice(0, 60)}${st.Ai.Persona.length > 60 ? '…' : ''}”`;
    return ({ Fixed: 'fixed caption', Rotate: `rotating pool of ${st.CaptionPool.length}`, Original: 'the source\'s own caption', None: 'no captions', AI: '' })[st.CaptionMode];
});

const runwaySubtitle = computed(() => {
    const src = detail.value?.Runway.Source;
    return src === 'MemeScraper' ? 'Unused MemeScraper reels matching this blog\'s filters' : src === 'Library' ? 'Unused files in the upload library' : src === 'Folder' ? 'Unused files in the folder' : 'No content source';
});

const relevantLimits = computed(() => (detail.value?.Connection?.Limits ?? []).filter(l => /post|video|photo|image/i.test(l.Key)));
const limitLabel = (key: string) => `Tumblr ${key.replace(/_/g, ' ')}`;
</script>

<style scoped>
.tb-bloghead .who { display: flex; align-items: center; gap: var(--ot-space-3); min-width: 0; }
.tb-bloghead .subtitle a { color: var(--ot-info); }
.switch { padding: 0 var(--ot-space-2); border: 1px solid var(--ot-line-strong); border-radius: var(--ot-radius-sm); height: var(--ot-control); }
.tabs { margin: var(--ot-space-2) 0 var(--ot-space-4); flex-wrap: wrap; }
.tabs .count { margin-left: 6px; padding: 0 6px; border-radius: 999px; background: var(--ot-surface-3); font-size: 11px; }
.list { display: flex; flex-direction: column; padding: var(--ot-space-1); }
.ot-kpis { margin-bottom: var(--ot-gutter); }
.tb-section { margin-top: var(--ot-gutter); }
.runway { display: flex; align-items: baseline; gap: var(--ot-space-2); font-size: 13px; color: var(--ot-text-2); }
.runway .big { font-size: 30px; font-weight: 650; color: var(--ot-text); font-family: var(--ot-mono); }
.warnline { color: var(--ot-warning); font-size: 12px; margin: var(--ot-space-2) 0 0; }
.runwaygrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--ot-space-2); margin-top: var(--ot-space-3); }
.runwaygrid :deep(.tb-thumb.md) { width: 100%; height: auto; aspect-ratio: 1; }
.small { font-size: 11.5px; margin: var(--ot-space-2) 0 0; }
.limits { display: flex; flex-direction: column; gap: var(--ot-space-3); margin-top: var(--ot-space-3); }
.daygroup + .daygroup { border-top: 1px solid var(--ot-line-strong); }
.dayhead { margin: 0; padding: var(--ot-space-2) var(--ot-space-3) 0; font-size: 11.5px; letter-spacing: 0.4px; text-transform: uppercase; color: var(--ot-muted); }
.captioncell { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.captioncell .sub { white-space: normal; }
.rangebar { display: flex; align-items: center; gap: var(--ot-space-3); margin-bottom: var(--ot-space-3); }
.toplist { list-style: none; margin: 0; padding: var(--ot-space-1) var(--ot-space-3); display: flex; flex-direction: column; }
.toplist li { display: flex; align-items: center; gap: var(--ot-space-3); padding: 6px 0; font-size: 12.5px; }
.toplist li + li { border-top: 1px solid var(--ot-line); }
.rank { width: 18px; color: var(--ot-muted); font-family: var(--ot-mono); text-align: right; }
.topmain { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.topmain a { color: var(--ot-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.topmain a:hover { color: var(--ot-info); }
.topmain .sub { font-size: 11px; color: var(--ot-muted); }
.notes { font-family: var(--ot-mono); font-weight: 600; }
.savebar { margin-top: var(--ot-space-2); }
</style>
