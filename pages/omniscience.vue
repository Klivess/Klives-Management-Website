<template>
    <div class="os-shell">
        <!-- ─────── Header ─────── -->
        <header class="os-header">
            <div>
                <div class="os-kicker"><span class="os-live-dot"></span> INTELLIGENCE CONSOLE · {{ pipelineState }}</div>
                <h1>Omniscience</h1>
                <p>Passive ingestion, behavioural analytics and a multi-stage deduction engine across every linked account — building a living dossier of everyone who matters.</p>
            </div>
            <div class="os-header-actions">
                <span class="os-stamp">{{ busyLabel || lastUpdatedLabel }}</span>
                <button class="os-btn ghost" :disabled="isBusy" @click="refreshAll">Refresh</button>
                <button class="os-btn cyan" :disabled="dedRunning" @click="runDeduction">{{ dedRunning ? 'Deducing…' : 'Run deduction' }}</button>
                <button class="os-btn violet" :disabled="profilerRunning" @click="runProfiler">{{ profilerRunning ? 'Profiling…' : 'Run profiler' }}</button>
            </div>
        </header>

        <!-- ─────── Metric tiles ─────── -->
        <section class="os-metrics">
            <a class="os-tile cyan" href="#directory"><span class="os-tile-copy"><span class="os-tile-label">People</span><small>{{ fmtNum(overview?.tracked) }} tracked</small></span><strong>{{ fmtNum(overview?.persons) }}</strong></a>
            <div class="os-tile violet"><span class="os-tile-copy"><span class="os-tile-label">Facts deduced</span><small>{{ fmtNum(overview?.relationships) }} relationships</small></span><strong>{{ fmtNum(overview?.facts_active) }}</strong></div>
            <div class="os-tile"><span class="os-tile-copy"><span class="os-tile-label">Messages</span><small>{{ fmtNum(overview?.attachments) }} attachments</small></span><strong>{{ fmtNum(overview?.messages) }}</strong></div>
            <div class="os-tile amber"><span class="os-tile-copy"><span class="os-tile-label">Radar · 24h</span><small>mentions of you</small></span><strong>{{ fmtNum(overview?.radar_alerts_24h) }}</strong></div>
            <div class="os-tile"><span class="os-tile-copy"><span class="os-tile-label">Dossiers</span><small>{{ fmtNum(overview?.conversations) }} conversations</small></span><strong>{{ fmtNum(overview?.personality_profiles) }}</strong></div>
        </section>

        <!-- ─────── Section nav ─────── -->
        <nav class="os-nav">
            <a class="active"><span class="os-nav-code">CMD</span> Command center</a>
            <a href="/omniscience-search"><span class="os-nav-code">SRCH</span> Search &amp; Q&amp;A</a>
            <a href="/omniscience-review"><span class="os-nav-code">REV</span> Review queue</a>
            <a href="#directory"><span class="os-nav-code">PPL</span> People</a>
            <a href="#sources"><span class="os-nav-code">SRC</span> Sources</a>
        </nav>

        <!-- ─────── Row 1: briefing | radar ─────── -->
        <div class="os-cols two">
            <section class="os-panel">
                <div class="os-panel-head">
                    <h2><span class="os-panel-code">BRF</span> Daily briefing</h2>
                    <button class="os-btn sm" @click="sendBriefing">DM me this</button>
                </div>
                <div class="os-panel-body">
                    <pre v-if="briefing" class="os-md">{{ briefing }}</pre>
                    <div v-else class="os-empty">{{ briefingLoading ? 'Composing…' : 'Nothing notable in the last 24h.' }}</div>
                </div>
            </section>

            <section class="os-panel">
                <div class="os-panel-head">
                    <h2><span class="os-panel-code">RAD</span> Radar — mentions of you</h2>
                    <span class="os-stamp">watching {{ radarAliases.length }} aliases</span>
                </div>
                <div class="os-panel-body">
                    <div v-for="(a, i) in radarAlerts.slice(0, 8)" :key="i" class="os-feed-item">
                        <div class="os-feed-icon amber">📡</div>
                        <div class="os-feed-body">
                            <p><strong>{{ a.author_display }}</strong> in {{ a.channel_label }}</p>
                            <p class="os-muted">{{ a.snippet }}</p>
                            <time>{{ fmtTime(a.occurred_at) }} · matched "{{ a.matched_alias }}"</time>
                        </div>
                    </div>
                    <div v-if="!radarAlerts.length" class="os-empty">No mentions captured yet.</div>
                </div>
            </section>
        </div>

        <!-- ─────── Row 2: pipeline | suggestions ─────── -->
        <div class="os-cols two">
            <section class="os-panel">
                <div class="os-panel-head"><h2><span class="os-panel-code">DED</span> Deduction pipeline</h2></div>
                <div class="os-panel-body">
                    <div class="os-kpis">
                        <div class="os-kpi cyan"><span>Facts</span><strong>{{ fmtNum(dedu?.facts_active) }}</strong></div>
                        <div class="os-kpi"><span>Q&amp;A pairs</span><strong>{{ fmtNum(dedu?.qa_pairs) }}</strong></div>
                        <div class="os-kpi"><span>Name uses</span><strong>{{ fmtNum(dedu?.name_usages) }}</strong></div>
                        <div class="os-kpi violet"><span>Entities</span><strong>{{ fmtNum(dedu?.entities) }}</strong></div>
                        <div class="os-kpi"><span>Hypotheses</span><strong>{{ fmtNum(dedu?.open_hypotheses) }}</strong></div>
                        <div class="os-kpi"><span>Windows</span><strong>{{ fmtNum(dedu?.windows_extracted) }}</strong></div>
                    </div>
                    <p class="os-fact-meta" style="margin-top:10px">{{ dedu?.last_extraction_summary || 'No extraction run yet.' }}</p>
                    <p class="os-fact-meta" v-if="dedu">{{ fmtNum(dedu.windows_pending_graph) }} windows awaiting graph assembly · {{ fmtNum(dedu.stimulus_reply_pairs) }} replica training pairs</p>
                </div>
            </section>

            <section class="os-panel">
                <div class="os-panel-head"><h2><span class="os-panel-code">SUG</span> Suggested to track</h2></div>
                <div class="os-panel-body">
                    <div v-for="s in targetSuggestions.slice(0, 6)" :key="s.person_id" class="os-row">
                        <div class="os-row-main">
                            <strong>{{ s.display_name || s.person_id }}</strong>
                            <small>{{ (s.reasons || []).join(' · ') }}</small>
                        </div>
                        <div class="os-row-actions">
                            <button class="os-btn sm cyan" @click="promote(s.person_id)">Track</button>
                            <button class="os-btn sm ghost" @click="dismissSuggestion(s.person_id)">✕</button>
                        </div>
                    </div>
                    <div v-if="!targetSuggestions.length" class="os-empty">No suggestions — run a deduction pass.</div>
                </div>
            </section>
        </div>

        <!-- ─────── People directory ─────── -->
        <section id="directory" class="os-panel">
            <div class="os-panel-head">
                <h2><span class="os-panel-code">PPL</span> People</h2>
                <div class="os-field-row">
                    <input v-model="search" class="os-input" style="width:240px" placeholder="Search names, handles, aliases…" @keyup.enter="loadPeople" />
                    <select v-model="tierFilter" class="os-select" style="width:130px" @change="loadPeople">
                        <option value="">All tiers</option>
                        <option value="tracked">Tracked</option>
                        <option value="watch">Watch</option>
                        <option value="archive">Archive</option>
                    </select>
                </div>
            </div>
            <div class="os-panel-body">
                <div class="osx-people">
                    <a v-for="p in filteredPeople" :key="p.person_id" class="osx-person" :href="`/omniscience-person?personId=${p.person_id}`">
                        <div class="osx-person-top">
                            <span class="osx-person-name">{{ p.display_name || '(unnamed)' }}</span>
                            <span class="os-badge" :class="p.tier">{{ p.tier }}</span>
                        </div>
                        <div class="osx-person-handles">{{ topHandle(p) }}</div>
                        <div class="osx-person-foot">
                            <span class="os-mono os-muted">{{ fmtNum(p.message_count) }} msgs</span>
                            <span v-if="p.completeness != null" class="os-conf">
                                <span class="os-conf-track"><span class="os-conf-fill" :style="{ width: Math.round(p.completeness * 100) + '%' }"></span></span>
                                <span class="os-conf-num">{{ Math.round(p.completeness * 100) }}%</span>
                            </span>
                        </div>
                    </a>
                </div>
                <div v-if="!people.length" class="os-empty">No people match.</div>
            </div>
        </section>

        <!-- ─────── Sources ─────── -->
        <section id="sources" class="os-panel">
            <div class="os-panel-head"><h2><span class="os-panel-code">SRC</span> Harvest sources</h2></div>
            <div class="os-panel-body">
                <div class="os-field-row" style="margin-bottom:12px">
                    <input v-model="newSource.label" class="os-input" style="flex:1" placeholder="Label (optional)" />
                    <input v-model="newSource.token" class="os-input" style="flex:2" placeholder="Discord token" type="password" />
                    <button class="os-btn cyan" :disabled="addingSource || !newSource.token" @click="addSource">{{ addingSource ? 'Adding…' : 'Add source' }}</button>
                </div>
                <div v-for="s in sources" :key="s.source_id" class="os-row">
                    <span class="os-badge" :class="s.status === 'active' ? 'good' : 'bad'">{{ s.status }}</span>
                    <div class="os-row-main">
                        <strong>{{ s.self_username || s.label || s.platform }}</strong>
                        <small>{{ s.platform }} · last event {{ fmtTime(s.last_event_at) }}<template v-if="s.last_status_message"> · {{ s.last_status_message }}</template></small>
                    </div>
                    <div class="os-row-actions">
                        <button class="os-btn sm" @click="backfill(s)">Backfill</button>
                        <button class="os-btn sm danger" @click="removeSource(s)">Remove</button>
                    </div>
                </div>
                <div v-if="!sources.length" class="os-empty">No sources linked. Add a Discord token above to begin ingesting.</div>
            </div>
        </section>
    </div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
</script>

<script>
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, RequestBatchFromKliveAPI } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';

export default {
    name: 'OmniscienceConsole',
    data() {
        return {
            overview: null,
            dedu: null,
            scheduleStatus: null,
            briefing: '',
            briefingLoading: false,
            radarAlerts: [],
            radarAliases: [],
            targetSuggestions: [],
            people: [],
            sources: [],
            search: '',
            tierFilter: '',
            newSource: { label: '', token: '' },
            addingSource: false,
            isBusy: false,
            busyLabel: '',
            dedRunning: false,
            profilerRunning: false,
            lastUpdated: null,
            pollTimer: null,
        };
    },
    computed: {
        lastUpdatedLabel() { return this.lastUpdated ? 'Updated ' + this.fmtTime(this.lastUpdated) : ''; },
        pipelineState() { return this.dedRunning ? 'DEDUCING' : (this.profilerRunning ? 'PROFILING' : 'IDLE'); },
        filteredPeople() {
            return this.tierFilter ? this.people.filter(p => p.tier === this.tierFilter) : this.people;
        },
    },
    methods: {
        fmtNum(n) { return n == null ? '—' : Number(n).toLocaleString(); },
        fmtTime(t) {
            if (!t) return '—';
            const d = typeof t === 'number' ? new Date(t) : new Date(t);
            if (isNaN(d)) return '—';
            const diff = (Date.now() - d.getTime()) / 1000;
            if (diff < 60) return 'just now';
            if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
            if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
            return d.toLocaleDateString();
        },
        topHandle(p) {
            const id = (p.identities || [])[0];
            if (id) return `${id.platform}:${id.username || id.display_name || '?'}`;
            return (p.handles || '').split('|')[0] || '—';
        },
        async getJson(path) {
            const r = await RequestGETFromKliveAPI(path, false, false);
            if (!r.ok) return null;
            try { return await r.json(); } catch { return null; }
        },
        // Extracts a /batch item's parsed body (already JSON), or null on failure.
        batchJson(item) { return item && item.ok ? item.body : null; },
        // Built once so the batch path string and the standalone loadPeople path match.
        peopleQuery() {
            const params = new URLSearchParams({ limit: '60' });
            if (this.search.trim()) params.set('search', this.search.trim());
            return '/omniscience/persons?' + params.toString();
        },
        applyOverview(overview, dedu, sched, radar, targets) {
            this.overview = overview;
            this.dedu = dedu;
            this.scheduleStatus = sched;
            this.profilerRunning = !!sched?.running;
            this.radarAlerts = radar?.alerts || [];
            this.radarAliases = radar?.aliases_watched || [];
            this.targetSuggestions = targets?.suggestions || [];
        },
        async refreshAll() {
            this.isBusy = true; this.busyLabel = 'Loading…';
            const peoplePath = this.peopleQuery();
            // One /batch round-trip for what used to be 8 separate requests.
            const results = await RequestBatchFromKliveAPI([
                '/omniscience/stats/overview',
                '/omniscience/deduction/status',
                '/omniscience/schedule/status',
                '/omniscience/radar/alerts',
                '/omniscience/targets/suggestions',
                peoplePath,
                '/omniscience/sources',
                '/omniscience/briefing/preview',
            ]);

            if (results.size === 0) {
                // Batch unavailable — fall back to the original independent fetches.
                const [overview, dedu, sched, radar, targets] = await Promise.all([
                    this.getJson('/omniscience/stats/overview'),
                    this.getJson('/omniscience/deduction/status'),
                    this.getJson('/omniscience/schedule/status'),
                    this.getJson('/omniscience/radar/alerts'),
                    this.getJson('/omniscience/targets/suggestions'),
                ]);
                this.applyOverview(overview, dedu, sched, radar, targets);
                await this.loadPeople();
                await this.loadSources();
                this.loadBriefing();
            } else {
                const j = (p) => this.batchJson(results.get(p));
                this.applyOverview(
                    j('/omniscience/stats/overview'),
                    j('/omniscience/deduction/status'),
                    j('/omniscience/schedule/status'),
                    j('/omniscience/radar/alerts'),
                    j('/omniscience/targets/suggestions'),
                );
                this.people = j(peoplePath) || [];
                this.sources = j('/omniscience/sources') || [];
                this.briefing = j('/omniscience/briefing/preview')?.markdown || '';
            }

            this.lastUpdated = Date.now();
            this.isBusy = false; this.busyLabel = '';
        },
        async loadBriefing() {
            this.briefingLoading = true;
            const b = await this.getJson('/omniscience/briefing/preview');
            this.briefing = b?.markdown || '';
            this.briefingLoading = false;
        },
        async loadPeople() {
            this.people = (await this.getJson(this.peopleQuery())) || [];
        },
        async loadSources() {
            this.sources = (await this.getJson('/omniscience/sources')) || [];
        },
        async runDeduction() {
            this.dedRunning = true;
            await RequestPOSTFromKliveAPI('/omniscience/deduction/run', '{}', false, true);
            this.toast('Deduction pass queued', 'info');
            setTimeout(() => { this.dedRunning = false; this.refreshAll(); }, 3000);
        },
        async runProfiler() {
            this.profilerRunning = true;
            await RequestPOSTFromKliveAPI('/omniscience/schedule/run-now', '', false);
            this.toast('Profiler run queued', 'info');
        },
        async sendBriefing() {
            await RequestPOSTFromKliveAPI('/omniscience/briefing/run', '{}', false, true);
            this.toast('Briefing sent to your DMs', 'info');
        },
        async promote(personId) {
            const r = await RequestPOSTFromKliveAPI('/omniscience/persons/tier-set', JSON.stringify({ personId, tier: 'tracked' }), false, true);
            if (r.ok) { this.toast('Now tracked'); this.targetSuggestions = this.targetSuggestions.filter(s => s.person_id !== personId); this.loadPeople(); }
        },
        async dismissSuggestion(personId) {
            const r = await RequestPOSTFromKliveAPI('/omniscience/targets/dismiss', JSON.stringify({ personId }), false, true);
            if (r.ok) this.targetSuggestions = this.targetSuggestions.filter(s => s.person_id !== personId);
        },
        async addSource() {
            if (!this.newSource.token) return;
            this.addingSource = true;
            const r = await RequestPOSTFromKliveAPI('/omniscience/sources/add',
                JSON.stringify({ platform: 'discord', token: this.newSource.token, label: this.newSource.label }), false, true);
            this.addingSource = false;
            if (r.ok) { this.toast('Source added'); this.newSource = { label: '', token: '' }; this.loadSources(); }
            else this.toast('Failed to add source', 'error');
        },
        async backfill(s) {
            await RequestPOSTFromKliveAPI('/omniscience/sources/backfill?sourceId=' + encodeURIComponent(s.source_id), '', false);
            this.toast('Backfill queued', 'info');
        },
        async removeSource(s) {
            const c = await Swal.fire({ icon: 'warning', title: 'Remove source?', text: s.self_username || s.label, showCancelButton: true, confirmButtonColor: '#ff5a78', background: '#0e1626', color: '#eaf6ff' });
            if (!c.isConfirmed) return;
            await RequestPOSTFromKliveAPI('/omniscience/sources/remove?sourceId=' + encodeURIComponent(s.source_id), '', false);
            this.loadSources();
        },
        toast(title, icon = 'success') {
            Swal.fire({ icon, title, timer: 1400, showConfirmButton: false, background: '#0e1626', color: '#eaf6ff' });
        },
    },
    mounted() {
        this.refreshAll();
        this.pollTimer = setInterval(() => { if (!this.isBusy) this.refreshAll(); }, 45000);
    },
    beforeUnmount() { if (this.pollTimer) clearInterval(this.pollTimer); },
};
</script>

<style scoped>
/* Page-specific layout only; visual language lives in assets/scss/omniscience.scss */
.osx-people { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.osx-person {
    display: flex; flex-direction: column; gap: 7px; padding: 11px 13px;
    border: 1px solid rgba(255, 255, 255, .07); border-radius: 6px; background: rgba(255, 255, 255, .025);
    text-decoration: none; color: inherit; transition: border-color .12s ease, background .12s ease;
}
.osx-person:hover { border-color: #5fd3ff; background: rgba(95, 211, 255, .07); }
.osx-person-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.osx-person-name { font-weight: 700; color: #eaf6ff; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.osx-person-handles { font: 600 11px ui-monospace, Consolas, monospace; color: #b6cee5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.osx-person-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
</style>
