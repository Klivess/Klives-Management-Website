<template>
    <div class="os-shell">
        <div class="os-crumb"><a href="/omniscience">◎ Omniscience</a> <span>/</span> <span>Review queue</span></div>

        <header class="os-header">
            <div>
                <div class="os-kicker"><span class="os-live-dot"></span> HUMAN-IN-THE-LOOP</div>
                <h1>Review queue</h1>
                <p>Confirm what the engine inferred, decide who to track, manage watchlists, and review every mention of you.</p>
            </div>
            <div class="os-header-actions">
                <button class="os-btn ghost" @click="loadAll">Refresh</button>
                <button class="os-btn cyan" @click="runDeduction">Run deduction</button>
                <button class="os-btn violet" @click="runBriefing">Send briefing</button>
            </div>
        </header>

        <!-- pipeline stats -->
        <section class="os-metrics" v-if="status">
            <div class="os-tile cyan"><span class="os-tile-copy"><span class="os-tile-label">Facts</span><small>{{ fmtNum(status.qa_pairs) }} Q&amp;A pairs</small></span><strong>{{ fmtNum(status.facts_active) }}</strong></div>
            <div class="os-tile violet"><span class="os-tile-copy"><span class="os-tile-label">Entities</span><small>{{ fmtNum(status.relationships) }} relationships</small></span><strong>{{ fmtNum(status.entities) }}</strong></div>
            <div class="os-tile"><span class="os-tile-copy"><span class="os-tile-label">Hypotheses</span><small>open theories</small></span><strong>{{ fmtNum(status.open_hypotheses) }}</strong></div>
            <div class="os-tile amber"><span class="os-tile-copy"><span class="os-tile-label">Pending graph</span><small>{{ fmtNum(status.windows_extracted) }} extracted</small></span><strong>{{ fmtNum(status.windows_pending_graph) }}</strong></div>
            <div class="os-tile"><span class="os-tile-copy"><span class="os-tile-label">Tracked</span><small>people</small></span><strong>{{ fmtNum(status.tracked_persons) }}</strong></div>
        </section>

        <div class="os-cols two">
            <!-- target suggestions -->
            <section class="os-panel">
                <div class="os-panel-head"><h2><span class="os-panel-code">SUG</span> Suggested to track</h2></div>
                <div class="os-panel-body">
                    <div v-for="s in targetSuggestions" :key="s.person_id" class="os-row">
                        <div class="os-row-main">
                            <strong><a class="osx-link" :href="`/omniscience-person?personId=${s.person_id}`">{{ s.display_name || s.person_id }}</a></strong>
                            <small>{{ (s.reasons || []).join(' · ') }}</small>
                        </div>
                        <div class="os-row-actions">
                            <button class="os-btn sm cyan" @click="promote(s.person_id)">Track</button>
                            <button class="os-btn sm ghost" @click="dismiss(s.person_id)">✕</button>
                        </div>
                    </div>
                    <div v-if="!targetSuggestions.length" class="os-empty">No suggestions.</div>
                </div>
            </section>

            <!-- identity links -->
            <section class="os-panel">
                <div class="os-panel-head"><h2><span class="os-panel-code">LINK</span> Cross-platform identities</h2></div>
                <div class="os-panel-body">
                    <div v-for="l in identityLinks" :key="l.suggestion_id" class="os-row">
                        <div class="os-row-main">
                            <strong>{{ l.display_a || l.person_id_a }} ⇄ {{ l.display_b || l.person_id_b }}</strong>
                            <small>{{ Math.round(l.score*100) }}% · {{ l.reason }}</small>
                        </div>
                        <div class="os-row-actions">
                            <button class="os-btn sm cyan" @click="resolveLink(l.suggestion_id, 'accept')">Same</button>
                            <button class="os-btn sm ghost" @click="resolveLink(l.suggestion_id, 'reject')">Different</button>
                        </div>
                    </div>
                    <div v-if="!identityLinks.length" class="os-empty">No link suggestions.</div>
                </div>
            </section>
        </div>

        <!-- entity merges -->
        <section class="os-panel">
            <div class="os-panel-head"><h2><span class="os-panel-code">MRG</span> Entity merge review</h2></div>
            <div class="os-panel-body">
                <div v-for="m in mergeSuggestions" :key="m.suggestion_id" class="os-row">
                    <div class="os-row-main">
                        <strong>{{ m.entity_a }} ↔ {{ m.entity_b }}</strong>
                        <small>[{{ m.kind }}] in {{ m.owner_display }}'s graph · {{ m.reason }}</small>
                    </div>
                    <div class="os-row-actions">
                        <button class="os-btn sm cyan" @click="resolveMerge(m.suggestion_id, 'accept')">Merge</button>
                        <button class="os-btn sm ghost" @click="resolveMerge(m.suggestion_id, 'reject')">Keep</button>
                    </div>
                </div>
                <div v-if="!mergeSuggestions.length" class="os-empty">Nothing to review.</div>
            </div>
        </section>

        <!-- watchlists -->
        <section class="os-panel">
            <div class="os-panel-head"><h2><span class="os-panel-code">WCH</span> Watchlists</h2></div>
            <div class="os-panel-body">
                <div class="os-field-row" style="margin-bottom:12px">
                    <input v-model="newWatch.label" class="os-input" style="width:180px" placeholder="Label" />
                    <input v-model="newWatch.terms" class="os-input" style="flex:1" placeholder="Terms, comma-separated" />
                    <label class="os-stamp" style="display:flex;align-items:center;gap:6px"><input type="checkbox" v-model="newWatch.notify" /> DM me</label>
                    <button class="os-btn cyan" @click="addWatch">Add</button>
                </div>
                <div v-for="w in watchlists" :key="w.watch_id" class="os-row">
                    <div class="os-row-main">
                        <strong>{{ w.label }}</strong>
                        <small>{{ w.terms }}<template v-if="w.person_display"> · only {{ w.person_display }}</template> · {{ w.notify ? 'DM alerts' : 'briefing only' }}</small>
                    </div>
                    <div class="os-row-actions"><button class="os-btn sm danger" @click="removeWatch(w.watch_id)">Remove</button></div>
                </div>
                <div v-if="!watchlists.length" class="os-empty">No watchlists.</div>
            </div>
        </section>

        <!-- radar -->
        <section class="os-panel">
            <div class="os-panel-head"><h2><span class="os-panel-code">RAD</span> Radar history</h2><span class="os-stamp">watching: {{ radarAliases.join(', ') || '—' }}</span></div>
            <div class="os-panel-body">
                <div v-for="(a, i) in radarAlerts" :key="i" class="os-feed-item">
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
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
</script>

<script>
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';

export default {
    name: 'OmniscienceReview',
    data() {
        return {
            status: null,
            targetSuggestions: [],
            identityLinks: [],
            mergeSuggestions: [],
            watchlists: [],
            radarAlerts: [],
            radarAliases: [],
            newWatch: { label: '', terms: '', notify: true },
        };
    },
    methods: {
        fmtNum(n) { return n == null ? '—' : Number(n).toLocaleString(); },
        fmtTime(t) { if (!t) return ''; const d = new Date(t); return isNaN(d) ? '' : d.toLocaleString(); },
        toast(title, icon = 'success') { Swal.fire({ icon, title, timer: 1300, showConfirmButton: false, background: '#0e1626', color: '#eaf6ff' }); },
        async getJson(p) { const r = await RequestGETFromKliveAPI(p, false, false); if (!r.ok) return null; try { return await r.json(); } catch { return null; } },
        async loadAll() {
            const [status, targets, links, queue, watches, radar] = await Promise.all([
                this.getJson('/omniscience/deduction/status'),
                this.getJson('/omniscience/targets/suggestions'),
                this.getJson('/omniscience/identity-links'),
                this.getJson('/omniscience/review/queue'),
                this.getJson('/omniscience/watchlists'),
                this.getJson('/omniscience/radar/alerts'),
            ]);
            this.status = status;
            this.targetSuggestions = targets?.suggestions || [];
            this.identityLinks = links?.links || [];
            this.mergeSuggestions = queue?.merge_suggestions || [];
            this.watchlists = watches?.watchlists || [];
            this.radarAlerts = radar?.alerts || [];
            this.radarAliases = radar?.aliases_watched || [];
        },
        async promote(personId) {
            const r = await RequestPOSTFromKliveAPI('/omniscience/persons/tier-set', JSON.stringify({ personId, tier: 'tracked' }), false, true);
            if (r.ok) { this.toast('Now tracked'); this.targetSuggestions = this.targetSuggestions.filter(s => s.person_id !== personId); }
        },
        async dismiss(personId) {
            const r = await RequestPOSTFromKliveAPI('/omniscience/targets/dismiss', JSON.stringify({ personId }), false, true);
            if (r.ok) this.targetSuggestions = this.targetSuggestions.filter(s => s.person_id !== personId);
        },
        async resolveLink(suggestionId, action) {
            const r = await RequestPOSTFromKliveAPI('/omniscience/identity-links/resolve', JSON.stringify({ suggestionId, action }), false, true);
            if (r.ok) { this.toast(action === 'accept' ? 'Merged across platforms' : 'Kept separate'); this.identityLinks = this.identityLinks.filter(l => l.suggestion_id !== suggestionId); }
        },
        async resolveMerge(suggestionId, action) {
            const r = await RequestPOSTFromKliveAPI('/omniscience/review/resolve', JSON.stringify({ suggestionId, action }), false, true);
            if (r.ok) { this.toast(action === 'accept' ? 'Merged' : 'Kept separate'); this.mergeSuggestions = this.mergeSuggestions.filter(m => m.suggestion_id !== suggestionId); }
        },
        async addWatch() {
            if (!this.newWatch.label.trim() || !this.newWatch.terms.trim()) return;
            const r = await RequestPOSTFromKliveAPI('/omniscience/watchlists/add', JSON.stringify(this.newWatch), false, true);
            if (r.ok) { this.toast('Watchlist added'); this.newWatch = { label: '', terms: '', notify: true }; const w = await this.getJson('/omniscience/watchlists'); this.watchlists = w?.watchlists || []; }
        },
        async removeWatch(watchId) {
            const r = await RequestPOSTFromKliveAPI('/omniscience/watchlists/remove', JSON.stringify({ watchId }), false, true);
            if (r.ok) this.watchlists = this.watchlists.filter(w => w.watch_id !== watchId);
        },
        async runDeduction() { await RequestPOSTFromKliveAPI('/omniscience/deduction/run', '{}', false, true); this.toast('Deduction queued', 'info'); },
        async runBriefing() { await RequestPOSTFromKliveAPI('/omniscience/briefing/run', '{}', false, true); this.toast('Briefing sent', 'info'); },
    },
    mounted() { this.loadAll(); },
};
</script>

<style scoped>
.osx-link { color: var(--os-cyan); text-decoration: none; }
.osx-link:hover { text-decoration: underline; }
</style>
