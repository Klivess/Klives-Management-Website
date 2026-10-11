<template>
    <OmniGramShell>
        <div class="ot-pagehead">
            <div>
                <h1>Instagram accounts</h1>
                <p class="subtitle">{{ subtitle }}</p>
            </div>
            <div class="ot-actions">
                <NuxtLink v-if="can('omnigram.content.publish') && (overview?.Kpis.ConnectedAccounts ?? 0) > 0" class="ot-btn ghost" to="/schemery/omnigram/compose">Compose a post</NuxtLink>
                <button v-if="can('omnigram.settings.manage')" class="ot-btn primary" @click="openWizard(null)">Connect an account</button>
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
                <button v-if="(item.Action === 'reconnect' || item.Action === 'connect') && can('omnigram.settings.manage')" class="ot-btn sm" @click="openWizard(item.AccountId)">
                    {{ item.Action === 'reconnect' ? 'Reconnect' : 'Connect' }}
                </button>
                <NuxtLink v-else-if="item.Action === 'settings' && can('omnigram.settings.view')" class="ot-btn sm" to="/schemery/omnigram/settings">Open settings</NuxtLink>
                <NuxtLink v-else-if="item.Action === 'public-url' && can('omnigram.settings.view')" class="ot-btn sm" to="/schemery/omnigram/settings#public-media">Check media URL</NuxtLink>
                <NuxtLink v-else-if="item.Action === 'v1-passwords' && can('omnigram.settings.view')" class="ot-btn sm" to="/schemery/omnigram/settings#legacy">Review</NuxtLink>
                <NuxtLink v-else-if="item.AccountId && item.Action === 'strategy'" class="ot-btn sm" :to="`/schemery/omnigram/account/${item.AccountId}?tab=strategy`">Edit strategy</NuxtLink>
                <NuxtLink v-else-if="item.AccountId && item.Action === 'queue'" class="ot-btn sm" :to="`/schemery/omnigram/account/${item.AccountId}?tab=queue`">Open queue</NuxtLink>
            </div>
        </div>

        <div class="ot-kpis ig-kpis6">
            <OmniTraderKpi label="Followers" :value="fmtCount(k?.Followers)" :loading="!overview"
                           :compare="followerCompare" baseline="vs 7 days ago" :compare-format="countChange"
                           :spark="followerSpark" foot="all managed accounts" />
            <OmniTraderKpi label="Published" :value="String(k?.Published7d ?? '—')" :loading="!overview"
                           :compare="publishedCompare" baseline="vs the 7 days before" :compare-format="countChange" foot="last 7 days" />
            <OmniTraderKpi label="Views per post" :value="k?.AvgViews30d != null ? fmtCount(Math.round(k.AvgViews30d)) : '—'" :loading="!overview"
                           :foot="k?.AvgInteractions30d != null ? `${fmtCount(k.AvgInteractions30d)} interactions per post · 30 d` : '30-day average'"
                           help="Views on reels and feed posts published in the last 30 days (Instagram counts replays)." />
            <OmniTraderKpi label="Reach" :value="fmtCount(k?.Reach7d)" :loading="!overview"
                           foot="accounts reached, last 7 days" help="Sum of each account's daily reach from Instagram's account insights." />
            <OmniTraderKpi label="Queue" :value="String(k?.Pending ?? '—')" :loading="!overview" :attention-soft="(k?.AwaitingApproval ?? 0) > 0"
                           :foot="k?.AwaitingApproval ? `${k.AwaitingApproval} awaiting approval` : k?.NextPostUtc ? `next ${fmtRelative(k.NextPostUtc, now)}` : 'nothing scheduled'" />
            <OmniTraderKpi label="Success rate" :value="k?.SuccessRate30d != null ? `${k.SuccessRate30d}%` : '—'" :loading="!overview"
                           :tone="(k?.SuccessRate30d ?? 100) < 90 ? 'bad' : ''" :foot="`${k?.Failed7d ?? 0} failed in 7 days`" />
        </div>

        <h2 class="ot-sectionhead">Accounts</h2>
        <div v-if="overview && !overview.Accounts.length" class="ot-card">
            <div class="body">
                <OmniTraderStateBlock title="No Instagram accounts yet" detail="Connect a Creator or Business account. Each account gets a weekly schedule, a content source and an AI caption voice, then runs on its own.">
                    <button v-if="can('omnigram.settings.manage')" class="ot-btn primary" @click="openWizard(null)">Connect your first account</button>
                </OmniTraderStateBlock>
            </div>
        </div>
        <div v-else class="ig-accounts">
            <template v-if="!overview">
                <div v-for="n in 3" :key="n" class="ot-skel" style="height:240px"></div>
            </template>
            <OmniGramAccountCard v-for="account in overview?.Accounts ?? []" :key="account.AccountId" :account="account" @changed="refresh" @connect="openWizard" />
        </div>

        <div class="ot-grid two ig-section">
            <OmniTraderCard title="Coming up" subtitle="The next posts across every account" :loading="!overview" :empty="!!overview && !overview.Upcoming.length"
                            empty-title="Nothing scheduled" empty-text="Switch an account's autopilot on, or compose a post." flush>
                <div class="list">
                    <OmniGramPostRow v-for="post in overview?.Upcoming.slice(0, 8) ?? []" :key="post.PostId" :post="post" show-account @open="openPost" />
                </div>
            </OmniTraderCard>
            <OmniTraderCard title="Recently published" subtitle="Views and likes refresh hourly" :loading="!overview" :empty="!!overview && !overview.RecentlyPublished.length"
                            empty-title="Nothing published yet" flush>
                <div class="list">
                    <OmniGramPostRow v-for="post in overview?.RecentlyPublished.slice(0, 8) ?? []" :key="post.PostId" :post="post" show-account @open="openPost" />
                </div>
            </OmniTraderCard>
        </div>

        <div class="ot-grid two ig-section">
            <OmniTraderCard title="Followers" subtitle="All managed accounts, last 30 days" :loading="!overview"
                            :empty="!!overview && followerPoints.length < 2" empty-title="Not enough history yet"
                            empty-text="Follower counts are recorded every few hours; the line appears after a couple of readings.">
                <OmniTraderLineChart :series="[{ name: 'Followers', colour: 'var(--ot-cat-1)', points: followerPoints }]" :height="230"
                                     :format="(v: number) => fmtCount(v)" x-label="Day" />
            </OmniTraderCard>
            <OmniTraderCard title="Activity log" subtitle="What OmniGram did and why" :loading="!overview">
                <OmniGramEventList :events="overview?.Events ?? []" :limit="12" @open-post="openPost" />
            </OmniTraderCard>
        </div>

        <OmniGramPostDrawer :open="!!drawerPostId" :post-id="drawerPostId" @close="drawerPostId = null" @changed="refresh" />
        <OmniGramConnectWizard :open="wizardOpen" :app="overview?.App ?? null" :reconnect-account-id="reconnectId" :reconnect-username="reconnectAccount?.Username ?? null"
                               :first-connection="reconnectAccount?.State === 'connect'" @close="wizardOpen = false" @done="onWizardDone" />
    </OmniGramShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAccess } from '~/composables/useAccess';
import { fmtCount, fmtRelative, fmtSignedCount, useGramOverview, useNow } from '~/composables/useOmniGram';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'OmniGram · Klives Management' });

const router = useRouter();
const { can } = useAccess();
const { overview, refresh } = useGramOverview();
const now = useNow();

const k = computed(() => overview.value?.Kpis);
const drawerPostId = ref<string | null>(null);
const wizardOpen = ref(false);
const reconnectId = ref<string | null>(null);

const reconnectAccount = computed(() => overview.value?.Accounts.find(a => a.AccountId === reconnectId.value) ?? null);

const subtitle = computed(() => {
    const o = overview.value;
    if (!o) return 'Loading…';
    const n = o.Accounts.length;
    const parts = [`${n} account${n === 1 ? '' : 's'}`, `${o.Kpis.AutopilotAccounts} on autopilot`];
    if (o.Kpis.NextPostUtc) parts.push(`next post ${fmtRelative(o.Kpis.NextPostUtc, now.value)} on @${o.Kpis.NextPostAccount}`);
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

function openWizard(accountId: string | null) {
    // An existing account (reconnecting, or an imported v1 account connecting for the first time) keeps its
    // record: the server attaches the new token to it rather than creating a new account.
    reconnectId.value = accountId;
    wizardOpen.value = true;
}

async function onWizardDone(payload: { accountId: string | null; openStrategy: boolean }) {
    wizardOpen.value = false;
    await refresh();
    if (payload.accountId && payload.openStrategy) await router.push(`/schemery/omnigram/account/${payload.accountId}?tab=strategy`);
}
</script>

<style scoped>
.ig-accounts { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); gap: var(--ot-gutter); margin-bottom: var(--ot-space-6); }
.ig-section { margin-bottom: var(--ot-gutter); }
.list { display: flex; flex-direction: column; padding: var(--ot-space-1); }
.ot-kpis { margin-bottom: var(--ot-space-6); }
</style>
