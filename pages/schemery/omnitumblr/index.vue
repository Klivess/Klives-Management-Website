<template>
  <div class="tmb" data-testid="tmb-root">
    <!-- ── bar ── -->
    <header class="tmb-bar">
      <div class="tmb-bar__id">
        <span class="tmb-bar__mark" :data-tone="verdict.tone" aria-hidden="true">t<i></i></span>
        <h1 class="tmb-bar__title">OmniTumblr</h1>
        <span class="tmb-bar__sub">{{ subline }}</span>
      </div>

      <button class="tmb-search" aria-label="Find blogs, posts and actions" aria-keyshortcuts="Control+K" data-testid="tmb-search" @click="paletteOpen = true">
        <TumblrIcon name="search" />
        <span class="tmb-search__text">Find a blog, a post, an action…</span>
        <span class="tmb-kbd">Ctrl</span><span class="tmb-kbd">K</span>
      </button>

      <span class="tmb-bar__spacer"></span>

      <div class="tmb-bar__actions">
        <button class="tmb-link" :data-tone="link.tone" :title="link.title" data-testid="tmb-link" @click="showLinkHistory">
          <span class="tmb-link__dot"></span>
          <span>{{ link.word }}</span>
          <span v-if="link.sub" class="tmb-link__sub">{{ link.sub }}</span>
        </button>
        <button class="tmb-live" :data-state="linkState" :data-tone="liveTone" :title="liveTitle" data-testid="tmb-live" @click="c.setLive(!prefs.live)">
          <span class="tmb-live__dot"></span>
          <span class="tmb-live__word">{{ liveWord }}</span>
          <span v-if="linkState === 'live'" :key="loadedAt ?? 0" class="tmb-live__sweep"></span>
        </button>
        <button class="tmb-iconbtn" title="Refresh now (R)" aria-label="Refresh now" aria-keyshortcuts="R" data-testid="tmb-refresh" @click="refreshNow">
          <TumblrIcon name="refresh" :class="{ 'tmb-spin': busy }" />
        </button>
        <button v-if="allowed.act" class="tmb-btn tmb-btn--primary" aria-keyshortcuts="N" data-testid="tmb-compose-open" @click="openCompose(prefs.blogId)">
          <TumblrIcon name="edit" />Compose
        </button>
      </div>
    </header>

    <!-- The layout already provides the page's <main>. -->
    <div class="tmb-main">
      <div v-if="!allowed.overview && accessReady" class="tmb-card"><div class="tmb-empty"><TumblrIcon name="lock" />OmniTumblr is not part of your access.</div></div>
      <div v-else-if="!allowed.overview" class="tmb-card" style="display: grid; gap: 10px; padding: 14px"><div class="tmb-skel" style="height: 90px"></div><div class="tmb-skel" style="height: 220px"></div></div>

      <template v-else>
        <div v-if="failures >= 2 && !overview" class="tmb-error" role="alert"><TumblrIcon name="alert" />OmniTumblr is not answering. This page keeps trying.</div>

        <!-- ── verdict + figures ── -->
        <div class="tmb-top">
          <TumblrVerdict :verdict="verdict" :can-manage="allowed.manage" :can-settings="allowed.settingsView" @act="onIssue" />

          <div class="tmb-kpis">
            <div class="tmb-kpi" data-testid="kpi-followers">
              <span class="tmb-kpi__label"><TumblrIcon name="user" />Followers</span>
              <span class="tmb-kpi__value">{{ k ? fmtCount(k.Followers) : '—' }}
                <span v-if="k?.FollowersDelta30d != null" class="tmb-kpi__delta" :class="k.FollowersDelta30d > 0 ? 'tmb-pos' : k.FollowersDelta30d < 0 ? 'tmb-neg' : 'tmb-dim'">{{ fmtSignedCount(k.FollowersDelta30d) }}</span>
              </span>
              <span class="tmb-kpi__sub">{{ k ? `30 days · ${k.FollowersDelta7d != null ? `${fmtSignedCount(k.FollowersDelta7d)} this week` : 'all blogs'}` : '' }}</span>
              <div class="tmb-kpi__viz"><TumblrSpark :values="(k?.FollowersSeries ?? []).map(p => p.V)" label="Followers, last 30 days" /></div>
            </div>

            <button class="tmb-kpi" data-clickable data-testid="kpi-posts" @click="goTab('published')">
              <span class="tmb-kpi__label"><TumblrIcon name="send" />Posts this week</span>
              <span class="tmb-kpi__value" :data-tone="paceTone">{{ k ? k.Published7d : '—' }}<span class="tmb-kpi__unit">of {{ slotsPerWeek }} slots</span></span>
              <span class="tmb-kpi__sub"><template v-if="k"><b>{{ k.PublishedPrev7d }}</b> the week before · {{ k.Failed7d }} failed</template></span>
              <div class="tmb-kpi__viz"><div class="tmb-meter" style="height: 7px; margin-top: 18px"><span :data-tone="paceTone" :style="{ width: `${slotsPerWeek ? Math.min(100, ((k?.Published7d ?? 0) / slotsPerWeek) * 100) : 0}%` }"></span></div></div>
            </button>

            <button class="tmb-kpi" data-clickable data-testid="kpi-notes" @click="goTab('reach')">
              <span class="tmb-kpi__label"><TumblrIcon name="heart" />Notes per post</span>
              <span class="tmb-kpi__value" :data-tone="(k?.AvgNotes30d ?? 0) < 1 && (k?.Published7d ?? 0) > 0 ? 'warn' : undefined">{{ k?.AvgNotes30d ?? '—' }}<span class="tmb-kpi__unit">30 d</span></span>
              <span class="tmb-kpi__sub"><template v-if="k"><b>{{ fmtCount(k.Notes30d) }}</b> notes · {{ bestBlog }}</template></span>
              <div class="tmb-kpi__viz" style="display: flex; align-items: flex-end; gap: 4px">
                <span v-for="b in notesBars" :key="b.id" :title="b.title" :style="{ flex: '1 1 0', maxWidth: '22px', height: `${b.h}%`, minHeight: '2px', borderRadius: '2px 2px 0 0', background: 'var(--tmb-accent)', opacity: b.o }"></span>
              </div>
            </button>

            <button class="tmb-kpi" data-clickable data-testid="kpi-queue" @click="goTab('queue')">
              <span class="tmb-kpi__label"><TumblrIcon name="clock" />Queue</span>
              <span class="tmb-kpi__value">{{ k ? k.Pending : '—' }}
                <span v-if="k?.AwaitingApproval" class="tmb-chip" data-tone="warn">{{ k.AwaitingApproval }} to approve</span>
              </span>
              <span class="tmb-kpi__sub">{{ nextPostText }}</span>
              <div class="tmb-kpi__viz" style="display: flex; align-items: flex-end; gap: 2px">
                <span v-for="h in queueHours" :key="h.i" :title="h.title" :style="{ flex: 1, height: `${h.h}%`, minHeight: '2px', borderRadius: '2px 2px 0 0', background: h.warn ? 'var(--tmb-warn)' : 'var(--tmb-info)', opacity: h.n ? 0.85 : 0.18 }"></span>
              </div>
            </button>

            <button class="tmb-kpi" data-clickable data-testid="kpi-tumblr" @click="showLinkHistory">
              <span class="tmb-kpi__label"><TumblrIcon name="link" />Tumblr answered</span>
              <span class="tmb-kpi__value" :data-tone="answerTone">{{ edgeHistory?.AnsweredPct7d != null ? tmbPct(edgeHistory.AnsweredPct7d) : gate?.Blocked ? 'refusing' : '—' }}<span class="tmb-kpi__unit">7 days</span></span>
              <span class="tmb-kpi__sub"><template v-if="edgeHistory">{{ edgeHistory.Blocks7d }} blocks · typically {{ tmbMinutes(edgeHistory.MedianBlockMinutes) }}</template><template v-else>{{ gate?.Blocked ? `since ${tmbClock(gate.BlockedSinceUtc)}` : 'no record yet' }}</template></span>
              <div class="tmb-kpi__viz">
                <div v-if="edgeHistory?.Days.length" class="tmb-daybars" style="height: 100%">
                  <span v-for="d in edgeHistory.Days" :key="d.Day" :data-empty="d.Covered && !d.BlockedMinutes || undefined" :data-uncovered="!d.Covered || undefined"
                        :style="{ height: `${Math.max(4, (d.BlockedMinutes / 1440) * 100)}%` }" :title="d.Covered ? `${d.Day}: refused ${tmbMinutes(d.BlockedMinutes)}` : `${d.Day}: before the record`"></span>
                </div>
              </div>
            </button>

            <div class="tmb-kpi" data-testid="kpi-upnext">
              <span class="tmb-kpi__label"><TumblrIcon name="play" />Up next</span>
              <div v-if="upNext.length" class="tmb-upnext">
                <button v-for="p in upNext" :key="p.PostId" :title="tmbCaption(p)" @click="openPost(p.PostId)">
                  <TumblrThumb :path="tmbThumb(p)" :kind="p.Kind" size="xs" />
                  <span class="tmb-truncate"><b>@{{ p.BlogName }}</b> <span class="tmb-dim">{{ tmbCaption(p) }}</span></span>
                  <span :class="isOverdue(p) ? 'tmb-neg' : 'tmb-dim'" style="white-space: nowrap; font-size: 11px">{{ isOverdue(p) ? 'due' : fmtRelative(tmbDueUtc(p), now).replace('in ', '') }}</span>
                </button>
              </div>
              <span v-else class="tmb-kpi__sub">{{ overview ? 'nothing queued' : '' }}</span>
            </div>
          </div>
        </div>

        <!-- ── schedule ── -->
        <TumblrSchedule :blogs="blogs" :posts="schedulePosts" :spans="edgeHistory?.Spans ?? []" :now="now" :selected="prefs.blogId" @open="openPost" @select="c.setBlog" />

        <!-- ── fleet ── -->
        <TumblrFleet :blogs="blogs" :week="overview?.Week ?? []" :selected="prefs.blogId" :now="now" :loaded="!!overview" :can-manage="allowed.manage" :can-act="allowed.act"
                     @select="c.setBlog" @autopilot="c.setAutopilot" @pause="c.setPaused" @compose="openCompose" @add="openConnect(null)" />

        <!-- ── workbench ── -->
        <section id="tmb-work" class="tmb-card tmb-work" aria-label="Posts and settings" :data-flash="flashWork || undefined">
          <nav class="tmb-tabs" role="tablist" aria-label="Sections">
            <button v-for="t in tabs" :key="t.id" class="tmb-tab" role="tab" :aria-selected="prefs.tab === t.id" :data-testid="`tab-${t.id}`" :title="`${t.label} (${t.key})`" @click="goTab(t.id)">
              <TumblrIcon :name="t.icon" />{{ t.label }}
              <span v-if="tabCount(t.id)" class="tmb-count" :data-tone="tabTone(t.id)">{{ tabCount(t.id) }}</span>
            </button>
            <div class="tmb-tabs__tools"><span class="tmb-dim" style="font-size: 11.5px"><span class="tmb-kbd">1</span>–<span class="tmb-kbd">7</span> switch</span></div>
          </nav>
          <div class="tmb-scope" role="group" aria-label="Blogs shown">
            <button class="tmb-scope__opt tmb-scope__opt--all" :aria-pressed="!prefs.blogId" data-testid="scope-all" @click="c.setBlog(null)">All blogs</button>
            <button v-for="b in blogs" :key="b.BlogId" class="tmb-scope__opt" :aria-pressed="prefs.blogId === b.BlogId" :data-testid="`scope-${b.Name}`" @click="c.setBlog(b.BlogId)">
              <TumblrAvatar :src="b.AvatarUrl" :name="b.Name" :size="20" />@{{ b.Name }}
              <span v-if="b.AwaitingApproval" class="tmb-count" data-tone="warn">{{ b.AwaitingApproval }}</span>
            </button>
          </div>

          <div v-if="currentTab?.needsBlog && !blog" class="tmb-pane">
            <div class="tmb-empty"><TumblrIcon :name="currentTab.icon" /><strong>{{ currentTab.label }} is per blog</strong>Pick one:</div>
            <div class="tmb-chips" style="justify-content: center">
              <button v-for="b in blogs" :key="b.BlogId" class="tmb-scope__opt" @click="c.setBlog(b.BlogId)"><TumblrAvatar :src="b.AvatarUrl" :name="b.Name" :size="20" />@{{ b.Name }}</button>
            </div>
          </div>
          <TumblrQueue v-else-if="prefs.tab === 'queue'" :posts="scopedPending" :now="now" :show-blog="!prefs.blogId" :can-act="allowed.act" :can-publish="allowed.publish"
                       :autopilot-on="blog ? blog.Autopilot : blogs.some(b => b.Autopilot)" @open="openPost" @action="postAction" @approve-all="c.approveAll(prefs.blogId)" />
          <TumblrHistory v-else-if="prefs.tab === 'published'" :posts="scopedHistory" :filter="prefs.historyFilter" :now="now" :show-blog="!prefs.blogId"
                         @open="openPost" @filter="setHistoryFilter" />
          <TumblrAnalytics v-else-if="prefs.tab === 'analytics'" :data="analytics[`${prefs.blogId ?? 'all'}:${prefs.days}`] ?? null" :days="prefs.days" :scope-label="blog ? `@${blog.Name}` : 'all blogs'" :show-blog="!prefs.blogId" @days="c.setDays" />
          <TumblrReach v-else-if="prefs.tab === 'reach' && blog" :report="reach[blog.BlogId] ?? null" :error="errors['/omnitumblr/reach'] ?? null" :blog-name="blog.Name" :now="now" :can-check="allowed.manage" @strategy="goTab('strategy')" />
          <TumblrStrategy v-else-if="prefs.tab === 'strategy' && blog" :blog-id="blog.BlogId" :detail="details[blog.BlogId] ?? null" :catalog="catalog" :can-edit="allowed.manage" :can-upload="allowed.act" :can-delete="allowed.library"
                          @save="saveStrategy" @plan="c.planNow(blog.BlogId)" @sync="c.syncBlog(blog.BlogId)" @remove="c.removeBlog(blog.BlogId)"
                          @notify="(tone, text) => c.notify(tone as any, text)" @confirm="(t, x, done) => c.confirm(t, x, 'Delete', true).then(done)" />
          <TumblrActivity v-else-if="prefs.tab === 'activity'" :activity="blog ? details[blog.BlogId]?.Activity ?? null : null"
                          :events="blog ? details[blog.BlogId]?.Events ?? null : events" :now="now" @open="openPost" />
          <template v-else-if="prefs.tab === 'settings'">
            <div v-if="!allowed.settingsView" class="tmb-empty"><TumblrIcon name="lock" />Settings need “View OmniTumblr settings”.</div>
            <TumblrSettings v-else :settings="settings" :history="edgeHistory ?? null" :now="now" :can-manage="allowed.settingsManage" :can-manage-blogs="allowed.manage"
                            @connect="openConnect" @refresh-connection="refreshConnection" @remove-connection="removeConnection" @manage="manageBlog" @saved="onAppSaved" />
          </template>
        </section>
      </template>
    </div>

    <TumblrPostSheet :post-id="openPostId" :load="c.loadPost" :act="c.postAction" :can-edit="allowed.act" :can-publish="allowed.publish"
                     @close="closePost" @changed="c.refresh({ history: true })" @notify="(tone, text) => c.notify(tone as any, text)" />
    <TumblrCompose :open="composeOpen" :blogs="blogs" :preselect="composeBlog" :can-post="allowed.act" @close="composeOpen = false" @created="onCreated" />
    <TumblrConnect :open="connectOpen" :app="overview?.App ?? null" :reconnect-connection-id="reconnectId" @close="connectOpen = false" @done="onConnected" />
    <TumblrPalette :open="paletteOpen" :commands="commandsFor" @close="paletteOpen = false" />

    <TumblrDialog :open="!!confirming" :title="confirming?.title ?? ''" :sub="confirming?.text" :icon="confirming?.danger ? 'alert' : 'info'" :tone="confirming?.danger ? 'crit' : 'info'" testid="tmb-confirm" @close="confirming?.resolve(false)">
      <template #actions>
        <button class="tmb-btn tmb-btn--ghost" data-autofocus @click="confirming?.resolve(false)">Keep it</button>
        <button class="tmb-btn" :class="confirming?.danger ? 'tmb-btn--solid-danger' : 'tmb-btn--primary'" data-testid="tmb-confirm-yes" @click="confirming?.resolve(true)">{{ confirming?.confirm }}</button>
      </template>
    </TumblrDialog>

    <Teleport to="body">
      <div v-if="toasts.length" class="tmb-layer">
        <div class="tmb-toasts" role="status" aria-live="polite">
          <div v-for="toast in toasts" :key="toast.id" class="tmb-toast" :data-tone="toast.tone" data-testid="tmb-toast">
            <TumblrIcon :name="toast.tone === 'crit' ? 'octagon-x' : toast.tone === 'warn' ? 'alert' : toast.tone === 'info' ? 'info' : 'check-circle'" />
            <span class="tmb-toast__text">{{ toast.text }}</span>
            <button v-if="toast.action" class="tmb-btn tmb-btn--xs" @click="() => { c.dismissToast(toast.id); toast.action?.run(); }">{{ toast.action.label }}</button>
            <button class="tmb-iconbtn tmb-iconbtn--sm" aria-label="Dismiss" @click="c.dismissToast(toast.id)"><TumblrIcon name="x" /></button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fmtCount, fmtRelative, fmtSignedCount, fmtWhen, tumblrPost, type Strategy } from '~/composables/useOmniTumblr';
import { useTumblrConsole } from '~/composables/useTumblrConsole';
import {
  TMB_TABS, tmbCaption, tmbClock, tmbDueUtc, tmbIsTab, tmbMinutes, tmbPct, tmbThumb,
  type TmbCommand, type TmbIssue, type TmbPost, type TmbTab, type TmbTone,
} from '~/scripts/tumblrConsole';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'OmniTumblr · Klives Management' });

const route = useRoute();
const router = useRouter();
const c = useTumblrConsole();
const {
  accessReady, allowed, prefs, overview, pendingSorted, history, details, analytics, reach, settings, events, catalog, errors,
  loadedAt, failures, busy, now, toasts, confirming, blogs, blog, verdict, linkState,
} = c;

const paletteOpen = ref(false);
const composeOpen = ref(false);
const composeBlog = ref<string | null>(null);
const connectOpen = ref(false);
const reconnectId = ref<string | null>(null);
const openPostId = ref<string | null>(null);
const flashWork = ref(false);

const k = computed(() => overview.value?.Kpis ?? null);
const gate = computed(() => overview.value?.Engine.EdgeGate ?? null);
const edgeHistory = computed(() => overview.value?.EdgeHistory ?? null);
const tabs = computed(() => TMB_TABS.filter(t => t.id !== 'settings' || allowed.value.settingsView));
const currentTab = computed(() => TMB_TABS.find(t => t.id === prefs.value.tab));

// ───────────────────────────── bar ─────────────────────────────

const subline = computed(() => {
  const o = overview.value;
  if (!o) return '';
  const auto = o.Kpis.AutopilotBlogs;
  return `${o.Blogs.length} blog${o.Blogs.length === 1 ? '' : 's'} · ${auto} on autopilot`;
});

const link = computed<{ tone: TmbTone; word: string; sub: string; title: string }>(() => {
  const g = gate.value;
  const h = edgeHistory.value;
  if (!overview.value) return { tone: 'neutral', word: 'Tumblr', sub: '', title: '' };
  if (g?.Blocked) {
    return { tone: 'crit', word: 'Tumblr refusing', sub: `since ${tmbClock(g.BlockedSinceUtc)} · next try ${tmbClock(g.NextCheckUtc)}`,
      title: `Tumblr's edge has refused every call from this server since ${fmtWhen(g.BlockedSinceUtc)}. Posts wait and go out once it answers. Click for the history.` };
  }
  const pct = h?.AnsweredPct7d;
  const tone: TmbTone = pct == null ? 'ok' : pct < 60 ? 'warn' : pct < 90 ? 'warn' : 'ok';
  return { tone, word: 'Tumblr answering', sub: pct != null ? `${tmbPct(pct)} of 7 d` : '', title: 'Whether Tumblr answers this server. Click for the history.' };
});

const liveTone = computed(() => ({ live: 'ok', paused: 'neutral', stale: 'warn', offline: 'crit', connecting: 'neutral' } as Record<string, string>)[linkState.value]);
const liveWord = computed(() => ({ live: 'Live', paused: 'Paused', stale: 'Stale', offline: 'Offline', connecting: 'Connecting' } as Record<string, string>)[linkState.value]);
const liveTitle = computed(() => (linkState.value === 'live' ? `Live: read every 30 seconds while this tab is open${loadedAt.value ? `, last ${fmtRelative(new Date(loadedAt.value).toISOString(), now.value)}` : ''}. Click to pause.` : linkState.value === 'paused' ? 'Paused. Click to resume.' : 'Connecting to the server.'));

function refreshNow() {
  void c.refresh({ history: true }).then(() => c.loadTab());
}

// ───────────────────────────── figures ─────────────────────────────

const slotsPerWeek = computed(() => blogs.value.reduce((s, b) => s + (b.Autopilot && !b.Paused ? b.SlotsPerWeek : 0), 0));
const paceTone = computed<TmbTone | undefined>(() => {
  if (!k.value || !slotsPerWeek.value) return undefined;
  const share = k.value.Published7d / slotsPerWeek.value;
  return share >= 0.85 ? undefined : share >= 0.5 ? 'warn' : 'crit';
});
const answerTone = computed<TmbTone | undefined>(() => {
  const pct = edgeHistory.value?.AnsweredPct7d;
  if (gate.value?.Blocked && pct == null) return 'crit';
  return pct == null ? undefined : pct < 60 ? 'crit' : pct < 90 ? 'warn' : 'ok';
});
const bestBlog = computed(() => {
  const best = [...blogs.value].filter(b => b.AvgNotes30d != null).sort((a, b) => (b.AvgNotes30d ?? 0) - (a.AvgNotes30d ?? 0))[0];
  return best ? `best @${best.Name} ${best.AvgNotes30d}` : 'no posts yet';
});
const notesBars = computed(() => {
  const max = Math.max(1, ...blogs.value.map(b => b.AvgNotes30d ?? 0));
  return blogs.value.map(b => ({ id: b.BlogId, h: ((b.AvgNotes30d ?? 0) / max) * 100, o: prefs.value.blogId && prefs.value.blogId !== b.BlogId ? 0.3 : 0.85, title: `@${b.Name}: ${b.AvgNotes30d ?? '—'} notes a post` }));
});
const nextPostText = computed(() => {
  const kp = k.value;
  if (!kp) return '';
  if (!kp.NextPostUtc) return 'nothing scheduled';
  // A slot already past is waiting (usually for Tumblr to answer), not "25 min ago".
  if (new Date(kp.NextPostUtc).getTime() < now.value - 60_000) return `next due now on @${kp.NextPostBlog}, waiting`;
  return `next ${fmtRelative(kp.NextPostUtc, now.value)} on @${kp.NextPostBlog}`;
});
const isOverdue = (p: TmbPost) => new Date(tmbDueUtc(p)).getTime() < now.value - 60_000;
/** The next three that will go out by themselves (one waiting for approval goes only when approved). */
const upNext = computed(() => pendingSorted.value.filter(p => p.Status !== 'AwaitingApproval').slice(0, 3));
/** The next 48 hours of the queue, hour by hour. */
const queueHours = computed(() => {
  const start = Math.floor(now.value / 3_600_000) * 3_600_000;
  const slots = Array.from({ length: 48 }, (_, i) => ({ i, n: 0, warn: false, h: 0, title: '' }));
  for (const p of pendingSorted.value) {
    const at = new Date(tmbDueUtc(p)).getTime();
    const i = Math.max(0, Math.floor((at - start) / 3_600_000));
    if (i >= 48) continue;
    slots[i].n++;
    if (p.Status === 'AwaitingApproval' || p.BlockedReason) slots[i].warn = true;
  }
  const max = Math.max(1, ...slots.map(s => s.n));
  for (const s of slots) {
    s.h = s.n ? 30 + (s.n / max) * 70 : 8;
    s.title = `${new Date(start + s.i * 3_600_000).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}: ${s.n} post(s)`;
  }
  return slots;
});

// ───────────────────────────── posts in view ─────────────────────────────

const scopedPending = computed(() => (prefs.value.blogId ? pendingSorted.value.filter(p => p.BlogId === prefs.value.blogId) : pendingSorted.value));
const scopedHistory = computed(() => (history.value === null ? null : prefs.value.blogId ? history.value.filter(p => p.BlogId === prefs.value.blogId) : history.value));
const schedulePosts = computed<TmbPost[]>(() => {
  const o = overview.value;
  return [...pendingSorted.value, ...(history.value ?? []), ...((o?.Upcoming ?? []) as TmbPost[]), ...((o?.RecentlyPublished ?? []) as TmbPost[])];
});

function tabCount(id: TmbTab): string {
  if (id === 'queue') return scopedPending.value.length ? String(scopedPending.value.length) : '';
  if (id === 'published') {
    const failed = (scopedHistory.value ?? []).filter(p => p.Status === 'Failed' && Date.now() - new Date(p.ScheduledUtc).getTime() < 7 * 86_400_000).length;
    return failed ? String(failed) : '';
  }
  return '';
}
const tabTone = (id: TmbTab) => (id === 'queue' && scopedPending.value.some(p => p.Status === 'AwaitingApproval') ? 'warn' : id === 'published' ? 'crit' : undefined);

// ───────────────────────────── moving around ─────────────────────────────

async function goTab(tab: TmbTab, blogId?: string | null) {
  if (blogId !== undefined) c.setBlog(blogId);
  c.setTab(tab);
  await nextTick();
  document.getElementById('tmb-work')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  flashWork.value = true;
  window.setTimeout(() => { flashWork.value = false; }, 1_300);
}

async function showLinkHistory() {
  if (!allowed.value.settingsView) return;
  await goTab('settings');
  await nextTick();
  window.setTimeout(() => document.getElementById('tmb-link-history')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
}

function onIssue(issue: TmbIssue) {
  switch (issue.action) {
    case 'settings': void goTab('settings'); break;
    case 'reconnect': openConnect(issue.connectionId ?? null); break;
    case 'add-blog': openConnect(null); break;
    case 'strategy': void goTab('strategy', issue.blogId ?? prefs.value.blogId ?? blogs.value[0]?.BlogId ?? null); break;
    case 'reach': void goTab('reach', issue.blogId ?? prefs.value.blogId ?? blogs.value[0]?.BlogId ?? null); break;
    case 'queue': void goTab('queue', issue.blogId ?? prefs.value.blogId); break;
    case 'published': prefs.value = { ...prefs.value, historyFilter: 'Failed' }; void goTab('published', issue.blogId ?? null); break;
  }
}

function setHistoryFilter(filter: string) { prefs.value = { ...prefs.value, historyFilter: filter }; }
function openPost(postId: string) { openPostId.value = postId; }
function closePost() { openPostId.value = null; }
function openCompose(blogId: string | null) { composeBlog.value = blogId; composeOpen.value = true; }
function openConnect(connectionId: string | null) { reconnectId.value = connectionId; connectOpen.value = true; }

async function postAction(action: string, postId: string) { await c.postAction(action, postId); }

function onCreated(count: number) {
  c.notify('ok', `Created ${count} post${count === 1 ? '' : 's'}`);
  void c.refresh({ history: true });
}

async function onConnected(payload: { connectionId: string | null; blogIds: string[] }) {
  connectOpen.value = false;
  await c.refresh();
  if (payload.blogIds.length) void goTab('strategy', payload.blogIds[0]);
}

async function saveStrategy(body: { strategy: Strategy; requireApproval: boolean; notes?: string }, done: (error: string | null) => void) {
  const id = prefs.value.blogId;
  if (!id) { done('Pick a blog first'); return; }
  const result = await tumblrPost<{ Notes?: string[] }>('/omnitumblr/blogs/update', { blogId: id, ...body });
  if (!result.ok) { done(result.error ?? 'Not saved'); return; }
  done(null);
  c.notify('ok', ['Strategy saved.', ...(result.data?.Notes ?? [])].join(' '));
  await c.refresh();
}

async function refreshConnection(connectionId: string) {
  await c.act('/omnitumblr/connections/refresh', { connectionId }, 'Account refreshed');
}

async function removeConnection(connectionId: string) {
  const conn = settings.value?.Connections.find(x => x.ConnectionId === connectionId);
  if (!(await c.confirm(`Remove @${conn?.UserName}?`, 'OmniTumblr forgets this account and its tokens. To revoke access fully, also remove the app in Tumblr\'s own settings.', 'Remove', true))) return;
  await c.act('/omnitumblr/connections/remove', { connectionId }, 'Account removed');
}

async function manageBlog(connectionId: string, blogName: string) {
  const data = await c.act<{ Added: { BlogId: string }[]; Skipped: string[] }>('/omnitumblr/blogs/add', { connectionId, blogs: [blogName], autopilot: false, preset: 'weekly-memes' },
    d => (d.Added?.length ? `Now managing @${blogName}` : `Not added: ${(d.Skipped ?? []).join(' ')}`));
  if (data?.Added?.length) void goTab('strategy', data.Added[0].BlogId);
}

function onAppSaved(message: string, ok: boolean) {
  c.notify(ok ? 'ok' : 'warn', message);
  void c.refresh();
}

// ───────────────────────────── commands ─────────────────────────────

function commandsFor(query: string): TmbCommand[] {
  const list: TmbCommand[] = [];
  const text = query.trim().toLowerCase();
  for (const b of blogs.value) {
    list.push({ id: `blog-${b.BlogId}`, group: 'Blogs', title: `@${b.Name}`, icon: 'user', hint: b.Title ?? '', keywords: `${b.Title ?? ''} blog`, run: () => { c.setBlog(b.BlogId); void goTab(prefs.value.tab === 'settings' ? 'queue' : prefs.value.tab); } });
  }
  if (text.length >= 2) {
    const seen = new Set<string>();
    const posts = [...pendingSorted.value, ...(history.value ?? [])].filter(p => {
      if (seen.has(p.PostId)) return false;
      seen.add(p.PostId);
      return tmbCaption(p).toLowerCase().includes(text) || p.Tags.some(t => t.toLowerCase().includes(text)) || (p.ContentOrigin ?? '').toLowerCase().includes(text);
    }).slice(0, 8);
    for (const p of posts) list.push({ id: `post-${p.PostId}`, group: 'Posts', title: tmbCaption(p), icon: p.Kind === 'Reblog' ? 'reblog' : p.IsVideo ? 'video' : 'image', hint: `@${p.BlogName} · ${fmtRelative(tmbDueUtc(p), now.value)}`, run: () => openPost(p.PostId) });
  }
  for (const t of tabs.value) list.push({ id: `go-${t.id}`, group: 'Go to', title: t.label, icon: t.icon, hint: t.key, run: () => goTab(t.id) });
  list.push({ id: 'go-schedule', group: 'Go to', title: 'Schedule', icon: 'calendar', run: () => document.getElementById('tmb-schedule')?.scrollIntoView({ behavior: 'smooth' }) });
  if (allowed.value.act) list.push({ id: 'compose', group: 'Actions', title: blog.value ? `Compose for @${blog.value.Name}` : 'Compose a post', icon: 'edit', hint: 'N', keywords: 'new post write', run: () => openCompose(prefs.value.blogId) });
  list.push({ id: 'refresh', group: 'Actions', title: 'Refresh now', icon: 'refresh', hint: 'R', run: refreshNow });
  list.push({ id: 'live', group: 'Actions', title: prefs.value.live ? 'Pause live updates' : 'Resume live updates', icon: prefs.value.live ? 'pause' : 'play', run: () => c.setLive(!prefs.value.live) });
  if (allowed.value.act && pendingSorted.value.some(p => p.Status === 'AwaitingApproval')) {
    list.push({ id: 'approve-all', group: 'Actions', title: blog.value ? `Approve everything waiting on @${blog.value.Name}` : 'Approve everything waiting', icon: 'check', keywords: 'approval queue', danger: true, run: () => c.approveAll(prefs.value.blogId) });
  }
  if (allowed.value.manage) {
    list.push({ id: 'add', group: 'Actions', title: 'Add blogs…', icon: 'plus', keywords: 'connect account', run: () => openConnect(null) });
    const b = blog.value;
    if (b) {
      list.push({ id: 'plan', group: 'Actions', title: `Plan @${b.Name}'s empty slots now`, icon: 'calendar', run: () => c.planNow(b.BlogId) });
      list.push({ id: 'sync', group: 'Actions', title: `Refresh @${b.Name} from Tumblr`, icon: 'refresh', run: () => c.syncBlog(b.BlogId) });
      list.push({ id: 'pause', group: 'Actions', title: b.Paused ? `Resume @${b.Name}` : `Pause @${b.Name}`, icon: b.Paused ? 'play' : 'pause', run: () => c.setPaused(b.BlogId, !b.Paused) });
      list.push({ id: 'autopilot', group: 'Actions', title: b.Autopilot ? `Switch autopilot off for @${b.Name}` : `Switch autopilot on for @${b.Name}`, icon: 'bolt', run: () => c.setAutopilot(b.BlogId, !b.Autopilot) });
    }
  }
  return list;
}

// ───────────────────────────── keys and the address bar ─────────────────────────────

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

function onKey(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); paletteOpen.value = true; return; }
  if (event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
  if (paletteOpen.value || composeOpen.value || connectOpen.value || openPostId.value || confirming.value) return;
  if (event.key === '/') { event.preventDefault(); paletteOpen.value = true; }
  else if (event.key === 'r' || event.key === 'R') refreshNow();
  else if ((event.key === 'n' || event.key === 'N') && allowed.value.act) openCompose(prefs.value.blogId);
  else {
    const tab = tabs.value.find(t => t.key === event.key);
    if (tab) void goTab(tab.id);
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  // Links into the console: ?blog=, ?tab=, ?post=, ?compose=1 (the old blog, compose and settings pages redirect here).
  const query = route.query;
  window.setTimeout(() => {
    if (typeof query.blog === 'string') c.setBlog(query.blog);
    if (tmbIsTab(query.tab)) c.setTab(query.tab);
    if (typeof query.post === 'string') openPostId.value = query.post;
    if (query.compose === '1') openCompose(typeof query.blog === 'string' ? query.blog : null);
  }, 0);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

// The address follows the view, so a link or a reload lands in the same place.
watch(() => [prefs.value.tab, prefs.value.blogId, openPostId.value] as const, ([tab, blogId, post]) => {
  const next: Record<string, string> = {};
  if (tab !== 'queue') next.tab = tab;
  if (blogId) next.blog = blogId;
  if (post) next.post = post;
  const current = route.query;
  if ((current.tab ?? '') === (next.tab ?? '') && (current.blog ?? '') === (next.blog ?? '') && (current.post ?? '') === (next.post ?? '') && !current.compose) return;
  void router.replace({ query: next });
});

// A blog that was removed (or belongs to nobody any more) stops being the one shown.
watch(blogs, list => {
  if (overview.value && prefs.value.blogId && !list.some(b => b.BlogId === prefs.value.blogId)) c.setBlog(null);
});
</script>

<style lang="scss" src="~/assets/scss/tumblr-console.scss"></style>
