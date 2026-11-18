<template>
    <div data-testid="omx-brief">
        <div class="omx-kpis" data-testid="omx-kpis">
            <button class="omx-kpi" type="button" @click="omx.go('people')">
                <span class="omx-kpi-label">People</span><span class="omx-kpi-value">{{ omxCompact(o.persons) }}</span>
                <span class="omx-kpi-sub">{{ omxNum(o.tracked) }} tracked</span>
            </button>
            <button class="omx-kpi" type="button" @click="omx.go('talk')">
                <span class="omx-kpi-label">Messages</span><span class="omx-kpi-value">{{ omxCompact(o.messages) }}</span>
                <span class="omx-kpi-sub">{{ omxCompact(o.conversations) }} conversations</span>
            </button>
            <button class="omx-kpi" type="button" @click="omx.go('engine')">
                <span class="omx-kpi-label">Facts</span><span class="omx-kpi-value">{{ omxCompact(o.facts_active) }}</span>
                <span class="omx-kpi-sub">{{ omxCompact(o.relationships) }} relationships</span>
            </button>
            <button class="omx-kpi" type="button" @click="omx.go('people', { tier: 'tracked' })">
                <span class="omx-kpi-label">Dossiers</span><span class="omx-kpi-value">{{ omxCompact(o.personality_profiles) }}</span>
                <span class="omx-kpi-sub">written profiles</span>
            </button>
            <button class="omx-kpi" :class="{ warn: Number(o.radar_alerts_24h) > 0 }" type="button" @click="omx.go('review', { tab: 'mentions' })">
                <span class="omx-kpi-label">Radar · 24 h</span><span class="omx-kpi-value">{{ omxCompact(o.radar_alerts_24h) }}</span>
                <span class="omx-kpi-sub">{{ omx.radarAliases.value.length }} names watched</span>
            </button>
            <button class="omx-kpi" :class="{ warn: omx.reviewCount.value > 0 }" type="button" @click="omx.go('review')">
                <span class="omx-kpi-label">To review</span><span class="omx-kpi-value">{{ omx.loaded.value ? omx.reviewCount.value : OMX_DASH }}</span>
                <span class="omx-kpi-sub">decisions waiting</span>
            </button>
        </div>

        <div v-if="omx.syncError.value" class="omx-error" style="margin-bottom: 12px" role="alert">
            <span class="omx-grow">{{ omx.syncError.value }} The last answer stays on screen.</span>
            <button class="omx-btn sm" type="button" @click="omx.sync(true)">Try again</button>
        </div>

        <div class="omx-grid">
            <div class="omx-stack">
                <section class="omx-card" :class="{ attn: urgent }" data-testid="omx-needs">
                    <div class="omx-card-head">
                        <h2>Needs you</h2><span class="omx-sub">{{ omx.needs.value.length ? `${omx.needs.value.length} thing${omx.needs.value.length === 1 ? '' : 's'}` : 'nothing waiting' }}</span>
                    </div>
                    <div v-if="!omx.loaded.value" class="omx-skels"><div class="omx-skel" style="width: 70%"></div><div class="omx-skel" style="width: 52%"></div></div>
                    <div v-else-if="!omx.needs.value.length" class="omx-empty"><strong>All clear</strong>No decision is waiting and every part of the engine reports well.</div>
                    <div v-else>
                        <button v-for="need in omx.needs.value" :key="need.id" class="omx-need" type="button" @click="omx.go(need.view)">
                            <span class="omx-dot" :class="need.tone"></span>
                            <span class="omx-row-main"><strong>{{ need.title }}</strong><small class="wrap">{{ need.detail }}</small></span>
                            <span class="omx-need-go"><OmniscienceIcon name="go" /></span>
                        </button>
                    </div>
                </section>

                <section class="omx-card" data-testid="omx-working-set">
                    <div class="omx-card-head">
                        <h2>Working set</h2><span class="omx-sub">pinned, then recently opened</span>
                        <div class="omx-acts"><button class="omx-btn quiet sm" type="button" @click="omx.go('people')">All people <OmniscienceIcon name="go" /></button></div>
                    </div>
                    <div class="omx-card-body">
                        <div v-if="working.length" class="omx-tiles">
                            <button v-for="p in working" :key="p.id" class="omx-tile" type="button" :title="`Open ${p.name}`" @click="omx.openPerson(p.id)">
                                <span class="omx-avatar" :class="p.tier">{{ omxInitials(p.name) }}</span>
                                <span class="omx-row-main"><strong>{{ p.name }}</strong><small>{{ p.sub }}</small></span>
                                <span v-if="p.pinned" class="omx-star on" aria-label="pinned">★</span>
                            </button>
                        </div>
                        <div v-else class="omx-empty"><strong>Nobody pinned yet</strong>Star someone in People and they stay here; people you open are remembered too.</div>
                    </div>
                </section>

                <section class="omx-card" data-testid="omx-briefing">
                    <div class="omx-card-head">
                        <h2>Briefing</h2><span class="omx-sub">{{ briefingNote }}</span>
                        <div class="omx-acts"><button class="omx-btn sm" type="button" :disabled="!!omx.busy.value" @click="omx.run('briefing')"><OmniscienceIcon name="send" /> DM it to me</button></div>
                    </div>
                    <div class="omx-card-body">
                        <OmniscienceMd v-if="omx.briefing.markdown" :source="omx.briefing.markdown" />
                        <div v-else-if="omx.briefing.state === 'error'" class="omx-empty"><strong>The briefing could not be read</strong>The rest of the console is unaffected. <button class="omx-link" type="button" @click="omx.loadBriefing()">Try again</button></div>
                        <div v-else class="omx-empty"><strong>The briefing is being written</strong>It is rebuilt in the background; this fills in by itself.</div>
                    </div>
                </section>
            </div>

            <div class="omx-stack">
                <section class="omx-card" data-testid="omx-radar">
                    <div class="omx-card-head"><h2>Radar</h2><span class="omx-sub">latest mentions</span>
                        <div class="omx-acts"><button class="omx-btn quiet sm" type="button" @click="omx.go('review', { tab: 'mentions' })">All <OmniscienceIcon name="go" /></button></div></div>
                    <div v-if="omx.radarAlerts.value.length">
                        <div v-for="(alert, i) in omx.radarAlerts.value.slice(0, 5)" :key="i" class="omx-msg">
                            <div class="omx-msg-head"><strong>{{ alert.author_display || 'someone' }}</strong><span>{{ alert.channel_label }}</span><span>{{ omxAgo(alert.occurred_at, omx.now.value) }}</span><span class="omx-chip warn">{{ alert.matched_alias }}</span></div>
                            <div class="omx-msg-text">{{ alert.snippet }}</div>
                        </div>
                    </div>
                    <div v-else class="omx-empty">No watched name has come up lately.</div>
                </section>

                <section class="omx-card" data-testid="omx-engine-mini">
                    <div class="omx-card-head"><h2>Engine</h2><span class="omx-dot" :class="omx.pulse.value"></span>
                        <div class="omx-acts"><button class="omx-btn quiet sm" type="button" @click="omx.go('engine')">Open <OmniscienceIcon name="go" /></button></div></div>
                    <div class="omx-card-body">
                        <dl class="omx-kv">
                            <dt>Profiler</dt><dd>{{ omx.schedule.value?.running ? 'running now' : omx.schedule.value?.last_run_finished_at ? `last ran ${omxAgo(omx.schedule.value.last_run_finished_at, omx.now.value)}` : 'has not run yet' }}</dd>
                            <dt>Q&amp;A pairs</dt><dd class="omx-num">{{ omxNum(omx.deduction.value?.qa_pairs) }}</dd>
                            <dt>Entities</dt><dd class="omx-num">{{ omxNum(omx.deduction.value?.entities) }}</dd>
                            <dt>Open guesses</dt><dd class="omx-num">{{ omxNum(omx.deduction.value?.open_hypotheses) }}</dd>
                            <dt>Waiting for graph</dt><dd class="omx-num">{{ omxNum(omx.deduction.value?.windows_pending_graph) }} windows</dd>
                        </dl>
                        <p v-if="omx.deduction.value?.last_extraction_summary" class="omx-dim" style="margin-top: 10px; font-size: 12px">{{ omx.deduction.value.last_extraction_summary }}</p>
                    </div>
                </section>

                <section class="omx-card" data-testid="omx-jump">
                    <div class="omx-card-head"><h2>Jump back in</h2>
                        <div class="omx-acts"><button class="omx-btn quiet sm" type="button" @click="omx.go('ask')">Ask <OmniscienceIcon name="go" /></button></div></div>
                    <div v-if="omx.queries.value.length || omx.history.value.length">
                        <button v-for="s in omx.queries.value.slice(0, 4)" :key="`s${s.query_id}`" class="omx-rowbtn" type="button" @click="omx.go('ask', { saved: String(s.query_id) })">
                            <span class="omx-star on">★</span><span class="omx-row-main"><strong>{{ s.name }}</strong><small>saved · used {{ s.use_count || 0 }} times</small></span>
                        </button>
                        <button v-for="h in omx.history.value.slice(0, 4)" :key="`h${h.history_id}`" class="omx-rowbtn" type="button" @click="omx.go('ask', { mode: 'scope', q: h.scope?.q ?? h.query_text, person: h.scope?.personId, c: h.scope?.conversationId })">
                            <OmniscienceIcon name="clock" /><span class="omx-row-main"><strong>{{ h.query_text }}</strong><small>{{ omxAgo(h.created_at, omx.now.value) }}</small></span>
                        </button>
                    </div>
                    <div v-else class="omx-empty">Searches you run and save are kept here.</div>
                </section>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { OMX_DASH, omxAgo, omxCompact, omxInitials, omxNum, omxTier } from '~/scripts/omniscienceConsole';

/**
 * The first screen: the size of what is held, what is waiting on Klives, the people he works with,
 * what was said about the names he watches, and today's briefing. Everything is a way in.
 */
const omx = useOmx();
const o = computed(() => omx.overview.value ?? {});
const urgent = computed(() => omx.needs.value.some(n => n.tone !== 'info'));

/** Pinned people first, then the ones opened lately that are not pinned. */
const working = computed(() => {
    const pinned = omx.pins.value.map(p => ({
        id: String(p.person_id), name: p.display_name || '(unnamed)', pinned: true, tier: omxTier(p.tier),
        sub: `${omxCompact(p.message_count)} messages · ${omxAgo(p.last_message_at, omx.now.value)}`,
    }));
    const seen = new Set(pinned.map(p => p.id));
    const recent = omx.recent.value.filter(r => !seen.has(r.id)).slice(0, Math.max(0, 8 - pinned.length))
        .map(r => ({ id: r.id, name: r.name, pinned: false, tier: 'archive' as const, sub: `opened ${omxAgo(r.at, omx.now.value)}` }));
    return [...pinned, ...recent];
});

const briefingNote = computed(() => (omx.briefing.state === 'warming' ? 'being written' : omx.briefing.state === 'ok' ? 'latest' : ''));
</script>
