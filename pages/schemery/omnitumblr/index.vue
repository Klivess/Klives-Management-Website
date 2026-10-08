<template>
    <OmniTumblrShell>
        <div class="ot-pagehead">
            <div>
                <h1>Tumblr blogs</h1>
                <p class="subtitle">{{ subtitle }}</p>
            </div>
            <div class="ot-actions">
                <NuxtLink class="ot-btn ghost" to="/schemery/omnitumblr/compose">Compose a post</NuxtLink>
                <button v-if="isAdmin" class="ot-btn primary" @click="openWizard(null)">Add blogs</button>
            </div>
        </div>

        <!-- What needs a decision comes first. -->
        <div v-for="(item, i) in overview?.Attention ?? []" :key="i" class="ot-banner" :class="bannerTone(item.Level)" role="status">
            <span class="glyph" aria-hidden="true">{{ item.Level === 'error' ? '⚠' : item.Level === 'warning' ? '!' : 'ℹ' }}</span>
            <div>
                <strong>{{ item.Title }}</strong>
                {{ item.Detail }}
            </div>
            <div v-if="item.Action" class="actions">
                <button v-if="item.Action === 'reconnect' && isAdmin" class="ot-btn sm" @click="openWizard(item.ConnectionId)">Reconnect</button>
                <NuxtLink v-else-if="item.Action === 'settings'" class="ot-btn sm" to="/schemery/omnitumblr/settings">Open settings</NuxtLink>
                <button v-else-if="item.Action === 'add-blog' && isAdmin" class="ot-btn sm" @click="openWizard(null)">Add blogs</button>
                <NuxtLink v-else-if="item.BlogId && item.Action === 'strategy'" class="ot-btn sm" :to="`/schemery/omnitumblr/blog/${item.BlogId}?tab=strategy`">Edit strategy</NuxtLink>
                <NuxtLink v-else-if="item.BlogId && item.Action === 'queue'" class="ot-btn sm" :to="`/schemery/omnitumblr/blog/${item.BlogId}?tab=queue`">Open queue</NuxtLink>
            </div>
        </div>

        <div class="ot-kpis tb-kpis6">
            <OmniTraderKpi label="Followers" :value="fmtCount(k?.Followers)" :loading="!overview"
                           :compare="followerCompare" baseline="vs 7 days ago" :compare-format="countChange"
                           :spark="followerSpark" foot="all managed blogs" />
            <OmniTraderKpi label="Published" :value="String(k?.Published7d ?? '—')" :loading="!overview"
                           :compare="publishedCompare" baseline="vs the 7 days before" :compare-format="countChange" foot="last 7 days" />
            <OmniTraderKpi label="Notes per post" :value="k?.AvgNotes30d != null ? String(k.AvgNotes30d) : '—'" :loading="!overview"
                           foot="30-day average" help="Notes = likes + reblogs + replies on a post." />
            <OmniTraderKpi label="Next post" :value="k?.NextPostUtc ? fmtRelative(k.NextPostUtc, now) : 'none'" :loading="!overview" small
                           :foot="k?.NextPostUtc ? `@${k.NextPostBlog} · ${fmtWhen(k.NextPostUtc)}` : 'nothing scheduled'" />
            <OmniTraderKpi label="Queue" :value="String(k?.Pending ?? '—')" :loading="!overview" :attention-soft="(k?.AwaitingApproval ?? 0) > 0"
                           :foot="k?.AwaitingApproval ? `${k.AwaitingApproval} awaiting approval` : 'posts scheduled or being prepared'" />
            <OmniTraderKpi label="Success rate" :value="k?.SuccessRate30d != null ? `${k.SuccessRate30d}%` : '—'" :loading="!overview"
                           :tone="(k?.SuccessRate30d ?? 100) < 90 ? 'bad' : ''" :foot="`${k?.Failed7d ?? 0} failed in 7 days`" />
        </div>

        <h2 class="ot-sectionhead">Blogs</h2>
        <div v-if="overview && !overview.Blogs.length" class="ot-card">
            <div class="body">
                <OmniTraderStateBlock title="No blogs yet" detail="Connect a Tumblr account and pick the blogs OmniTumblr should run. Each blog gets a weekly schedule, a content source and an AI caption voice.">
                    <button v-if="isAdmin" class="ot-btn primary" @click="openWizard(null)">Add your first blog</button>
                </OmniTraderStateBlock>
            </div>
        </div>
        <div v-else class="tb-blogs">
            <template v-if="!overview">
                <div v-for="n in 3" :key="n" class="ot-skel" style="height:230px"></div>
            </template>
            <OmniTumblrBlogCard v-for="blog in overview?.Blogs ?? []" :key="blog.BlogId" :blog="blog" @changed="refresh" />
        </div>

        <div class="ot-grid two tb-section">
            <OmniTraderCard title="Coming up" subtitle="The next posts across every blog" :loading="!overview" :empty="!!overview && !overview.Upcoming.length"
                            empty-title="Nothing scheduled" empty-text="Switch a blog's autopilot on, or compose a post." flush>
                <div class="list">
                    <OmniTumblrPostRow v-for="post in overview?.Upcoming.slice(0, 8) ?? []" :key="post.PostId" :post="post" show-blog @open="openPost" />
                </div>
            </OmniTraderCard>
            <OmniTraderCard title="Recently published" subtitle="Notes are refreshed hourly" :loading="!overview" :empty="!!overview && !overview.RecentlyPublished.length"
                            empty-title="Nothing published yet" flush>
                <div class="list">
                    <OmniTumblrPostRow v-for="post in overview?.RecentlyPublished.slice(0, 8) ?? []" :key="post.PostId" :post="post" show-blog @open="openPost" />
                </div>
            </OmniTraderCard>
        </div>

        <div class="ot-grid two tb-section">
            <OmniTraderCard title="Followers" subtitle="All managed blogs, last 30 days" :loading="!overview"
                            :empty="!!overview && followerPoints.length < 2" empty-title="Not enough history yet"
                            empty-text="Follower counts are recorded every few hours; the line appears after a couple of readings.">
                <OmniTraderLineChart :series="[{ name: 'Followers', colour: 'var(--ot-cat-1)', points: followerPoints }]" :height="230"
                                     :format="(v: number) => fmtCount(v)" x-label="Day" />
            </OmniTraderCard>
            <OmniTraderCard title="Activity log" subtitle="What OmniTumblr did and why" :loading="!overview">
                <OmniTumblrEventList :events="overview?.Events ?? []" :limit="12" @open-post="openPost" />
            </OmniTraderCard>
        </div>

        <OmniTumblrPostDrawer :open="!!drawerPostId" :post-id="drawerPostId" @close="drawerPostId = null" @changed="refresh" />
        <OmniTumblrConnectWizard :open="wizardOpen" :app="overview?.App ?? null" :reconnect-connection-id="reconnectId"
                                 @close="wizardOpen = false" @done="onWizardDone" />
    </OmniTumblrShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import { fmtCount, fmtRelative, fmtSignedCount, fmtWhen, useNow, useTumblrOverview } from '~/composables/useOmniTumblr';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'OmniTumblr · Klives Management' });

const router = useRouter();
const { isAdmin } = useCurrentProfile();
const { overview, refresh } = useTumblrOverview();
const now = useNow();

const k = computed(() => overview.value?.Kpis);
const drawerPostId = ref<string | null>(null);
const wizardOpen = ref(false);
const reconnectId = ref<string | null>(null);

const subtitle = computed(() => {
    const o = overview.value;
    if (!o) return 'Loading…';
    const blogs = o.Blogs.length;
    const parts = [`${blogs} blog${blogs === 1 ? '' : 's'}`, `${o.Kpis.AutopilotBlogs} on autopilot`];
    if (o.Kpis.NextPostUtc) parts.push(`next post ${fmtRelative(o.Kpis.NextPostUtc, now.value)} on @${o.Kpis.NextPostBlog}`);
    return parts.join(' · ');
});

const followerPoints = computed(() => (k.value?.FollowersSeries ?? []).map(p => ({ x: new Date(p.T).getTime(), y: p.V })));
const followerSpark = computed(() => (k.value?.FollowersSeries ?? []).slice(-14).map(p => p.V));

function compareCounts(current: number | null | undefined, previous: number | null | undefined) {
    if (current == null || previous == null) return null;
    const absolute = current - previous;
    return { absolute, percent: previous > 0 ? (absolute / previous) * 100 : null, direction: Math.sign(absolute) };
}

const followerCompare = computed(() => {
    const kp = k.value;
    if (!kp || kp.FollowersDelta7d == null) return null;
    return compareCounts(kp.Followers, kp.Followers - kp.FollowersDelta7d);
});
const publishedCompare = computed(() => compareCounts(k.value?.Published7d, k.value?.PublishedPrev7d));
const countChange = (v: { absolute: number; percent: number | null }) =>
    `${fmtSignedCount(v.absolute)}${v.percent != null ? ` (${v.percent >= 0 ? '+' : ''}${v.percent.toFixed(1)}%)` : ''}`;

function bannerTone(level: string) {
    return level === 'error' ? '' : level === 'warning' ? 'warn' : 'info';
}

function openPost(postId: string) {
    drawerPostId.value = postId;
}

function openWizard(connectionId: string | null) {
    reconnectId.value = connectionId;
    wizardOpen.value = true;
}

async function onWizardDone(payload: { connectionId: string | null; blogIds: string[] }) {
    wizardOpen.value = false;
    await refresh();
    if (payload.blogIds.length) await router.push(`/schemery/omnitumblr/blog/${payload.blogIds[0]}?tab=strategy`);
}
</script>

<style scoped>
.tb-blogs { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--ot-gutter); margin-bottom: var(--ot-space-6); }
.tb-section { margin-bottom: var(--ot-gutter); }
.list { display: flex; flex-direction: column; padding: var(--ot-space-1); }
.ot-kpis { margin-bottom: var(--ot-space-6); }
</style>
