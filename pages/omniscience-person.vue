<template>
    <div class="os-shell">
        <div class="os-crumb"><a href="/omniscience">◎ Omniscience</a> <span>/</span> <span>Dossier</span></div>

        <!-- ─────── Header ─────── -->
        <header class="os-header">
            <div>
                <div class="os-kicker"><span class="os-live-dot"></span> SUBJECT DOSSIER</div>
                <h1>{{ displayName || '…' }}</h1>
                <p v-if="handles">{{ handles }}</p>
            </div>
            <div class="os-header-actions">
                <div class="osx-tier">
                    <span class="os-stamp">tier</span>
                    <button v-for="t in ['tracked','watch','archive']" :key="t" :class="['os-btn','sm', tier === t ? (t === 'tracked' ? 'cyan' : t === 'watch' ? 'violet' : '') : 'ghost']" @click="setTier(t)">{{ t }}</button>
                </div>
                <button class="os-btn ghost" @click="loadAll">Refresh</button>
                <button class="os-btn cyan" @click="recompute">Recompute</button>
            </div>
        </header>

        <!-- completeness bar -->
        <div v-if="completeness" class="osx-complete">
            <span class="os-stamp">DOSSIER COMPLETENESS</span>
            <div class="os-meter" style="flex:1"><div class="os-meter-fill" :style="{ width: Math.round((completeness.completeness_score||0)*100) + '%' }"></div></div>
            <strong class="os-mono">{{ Math.round((completeness.completeness_score||0)*100) }}%</strong>
        </div>

        <!-- ─────── Tabs ─────── -->
        <nav class="os-tabs">
            <button v-for="t in tabs" :key="t" :class="['os-tab', { active: tab === t }]" @click="tab = t">{{ t }}</button>
        </nav>

        <!-- ═══════ OVERVIEW ═══════ -->
        <template v-if="tab === 'Overview'">
            <div class="os-cols two">
                <section class="os-panel">
                    <div class="os-panel-head"><h2><span class="os-panel-code">KEY</span> Headline facts</h2></div>
                    <div class="os-panel-body">
                        <div v-for="f in topFacts" :key="f.fact_id" class="os-fact" :class="f.status">
                            <span class="os-fact-cat">{{ f.category }}</span>
                            <div class="os-fact-body">
                                <div class="os-fact-text">{{ f.fact }}</div>
                                <div class="os-fact-meta">{{ f.source_context }} · {{ f.extracted_by }}</div>
                            </div>
                            <span class="os-conf"><span class="os-conf-track"><span class="os-conf-fill" :style="{ width: Math.round(f.confidence*100) + '%' }"></span></span></span>
                        </div>
                        <div v-if="!topFacts.length" class="os-empty">No facts yet — run a deduction pass.</div>
                    </div>
                </section>

                <section class="os-panel">
                    <div class="os-panel-head"><h2><span class="os-panel-code">VIT</span> Vitals</h2></div>
                    <div class="os-panel-body">
                        <div class="os-h">Mood (90d)</div>
                        <div v-if="moodSeries.length" class="osx-vital">
                            <div class="os-spark">
                                <i v-for="(v, i) in moodSeries" :key="i" :style="{ height: moodBarHeight(v) + 'px', background: v < 0 ? 'var(--os-red)' : 'var(--os-cyan)' }"></i>
                            </div>
                            <span class="os-badge" :class="moodFlag === 'low' ? 'bad' : moodFlag === 'high' ? 'good' : 'mid'">{{ moodFlag || 'normal' }}</span>
                        </div>
                        <div v-else class="os-muted">No sentiment data.</div>

                        <div class="os-h">Activity by hour</div>
                        <div v-if="hourHisto.length" class="os-spark" style="height:34px">
                            <i v-for="(v, i) in hourHisto" :key="i" :style="{ height: hourBarHeight(v) + 'px', background: 'var(--os-violet)' }" :title="i + ':00'"></i>
                        </div>
                        <div v-if="chronotype" class="os-fact-meta">{{ chronotype }}</div>

                        <div class="os-h">Now playing taste</div>
                        <div class="osx-chips">
                            <span v-for="(a, i) in topArtists" :key="'a'+i" class="os-badge mid">♪ {{ a }}</span>
                            <span v-for="(g, i) in topGames" :key="'g'+i" class="os-badge platform">🎮 {{ g }}</span>
                            <span v-if="!topArtists.length && !topGames.length" class="os-muted">No presence data.</span>
                        </div>
                    </div>
                </section>
            </div>

            <section class="os-panel" v-if="bigFive">
                <div class="os-panel-head"><h2><span class="os-panel-code">OCEAN</span> Big Five</h2></div>
                <div class="os-panel-body">
                    <div v-for="t in bigFiveTraits" :key="t.key" class="osx-trait">
                        <span class="osx-trait-label">{{ t.label }}</span>
                        <div class="os-meter" style="flex:1"><div class="os-meter-fill" :style="{ width: Math.round((bigFive[t.key]||0)*100) + '%', background: 'linear-gradient(90deg, var(--os-violet), var(--os-cyan))' }"></div></div>
                        <span class="os-conf-num">{{ Math.round((bigFive[t.key]||0)*100) }}</span>
                    </div>
                </div>
            </section>
        </template>

        <!-- ═══════ KNOWLEDGE ═══════ -->
        <template v-if="tab === 'Knowledge'">
            <section class="os-panel">
                <div class="os-panel-head"><h2><span class="os-panel-code">HUM</span> Add a fact you know (HUMINT)</h2></div>
                <div class="os-panel-body">
                    <div class="os-field-row">
                        <input v-model="newObservation" class="os-input" style="flex:1" placeholder="e.g. Works at a hospital in Manchester" @keyup.enter="addObservation" />
                        <select v-model="newObsCat" class="os-select" style="width:150px">
                            <option v-for="c in obsCategories" :key="c" :value="c">{{ c }}</option>
                        </select>
                        <button class="os-btn cyan" @click="addObservation">Add fact</button>
                    </div>
                </div>
            </section>

            <section class="os-panel">
                <div class="os-panel-head"><h2><span class="os-panel-code">FACT</span> Knowledge graph · {{ facts.length }} facts</h2></div>
                <div class="os-panel-body">
                    <template v-for="(group, cat) in factsByCategory" :key="cat">
                        <div class="os-h">{{ cat }}</div>
                        <div v-for="f in group" :key="f.fact_id" class="os-fact" :class="f.status">
                            <span class="os-fact-cat">{{ Math.round(f.confidence*100) }}%</span>
                            <div class="os-fact-body">
                                <div class="os-fact-text">{{ f.fact }}</div>
                                <div class="os-fact-meta">{{ f.source_context }} · {{ f.extracted_by }}<template v-if="f.status !== 'active'"> · {{ f.status }}</template><template v-if="(f.evidence_message_ids||[]).length"> · {{ f.evidence_message_ids.length }} evidence msgs</template></div>
                                <div v-if="f.derivation" class="os-fact-derivation">🔍 {{ derivationText(f.derivation) }}</div>
                            </div>
                        </div>
                    </template>
                    <div v-if="!facts.length" class="os-empty">No facts yet.</div>
                </div>
            </section>

            <div class="os-cols two">
                <section class="os-panel">
                    <div class="os-panel-head"><h2><span class="os-panel-code">OPEN</span> What we don't know</h2></div>
                    <div class="os-panel-body">
                        <div v-for="(q, i) in openQuestions" :key="i" class="os-row">
                            <span class="os-fact-cat">{{ q.slot }}</span>
                            <div class="os-row-main"><strong>{{ q.question }}</strong></div>
                        </div>
                        <div v-if="!openQuestions.length" class="os-empty">No open questions.</div>
                    </div>
                </section>
                <section class="os-panel">
                    <div class="os-panel-head"><h2><span class="os-panel-code">HYP</span> Hypotheses</h2></div>
                    <div class="os-panel-body">
                        <div v-for="(h, i) in hypotheses" :key="i" class="os-fact" :class="h.status === 'confirmed' ? '' : h.status === 'refuted' ? 'contradicted' : ''">
                            <div class="os-fact-body">
                                <div class="os-fact-text">{{ h.statement }}</div>
                                <div class="os-fact-meta">{{ h.status }} · {{ (h.evidence_message_ids||[]).length }} watcher hits</div>
                            </div>
                        </div>
                        <div v-if="!hypotheses.length" class="os-empty">No hypotheses.</div>
                    </div>
                </section>
            </div>
        </template>

        <!-- ═══════ RELATIONSHIPS ═══════ -->
        <template v-if="tab === 'Relationships'">
            <section class="os-panel">
                <div class="os-panel-head"><h2><span class="os-panel-code">NET</span> Relationship graph</h2></div>
                <div class="os-panel-body">
                    <div v-if="graphNodes.length" class="os-graph" ref="graph">
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none"><line v-for="(n, i) in graphNodes" :key="'l'+i" x1="50" y1="50" :x2="n.x" :y2="n.y" :stroke="'rgba(120,200,255,' + (0.15 + n.conf*0.4) + ')'" :stroke-width="0.3 + n.conf*0.6" /></svg>
                        <div class="os-graph-center">{{ shortName(displayName) }}</div>
                        <div v-for="(n, i) in graphNodes" :key="'n'+i" class="os-graph-node" :style="{ left: n.x + '%', top: n.y + '%' }">
                            {{ n.label }}<small>{{ n.rel }}</small>
                        </div>
                    </div>
                    <div v-else class="os-empty">No relationship edges yet.</div>
                </div>
            </section>

            <div class="os-cols two">
                <section class="os-panel">
                    <div class="os-panel-head"><h2><span class="os-panel-code">ALIAS</span> Known as</h2></div>
                    <div class="os-panel-body">
                        <div v-for="(a, i) in aliases" :key="i" class="os-row">
                            <div class="os-row-main"><strong>{{ a.name }}</strong><small>{{ a.kind }} · {{ a.uses }} uses by {{ a.distinct_speakers }} people</small></div>
                            <span class="os-conf"><span class="os-conf-track"><span class="os-conf-fill" :style="{ width: Math.round(a.confidence*100)+'%' }"></span></span><span class="os-conf-num">{{ Math.round(a.confidence*100) }}%</span></span>
                        </div>
                        <div v-if="!aliases.length" class="os-empty">No alias data.</div>
                    </div>
                </section>
                <section class="os-panel">
                    <div class="os-panel-head"><h2><span class="os-panel-code">ENT</span> Entities in their world</h2></div>
                    <div class="os-panel-body">
                        <div class="osx-chips">
                            <span v-for="(e, i) in entities" :key="i" class="os-badge platform" :title="e.descriptor || ''">{{ entityIcon(e.kind) }} {{ e.name }} ·{{ e.mentions }}</span>
                        </div>
                        <div v-if="!entities.length" class="os-empty">No entities extracted.</div>
                    </div>
                </section>
            </div>
        </template>

        <!-- ═══════ CONTEXTS ═══════ -->
        <template v-if="tab === 'Contexts'">
            <section class="os-panel">
                <div class="os-panel-head"><h2><span class="os-panel-code">CTX</span> Context personas</h2></div>
                <div class="os-panel-body">
                    <p v-if="facetDivergence" class="os-fact-meta">
                        Code-switching score {{ Math.round((facetDivergence.divergence_score||0)*100) }}% ·
                        most themselves in <strong class="os-mono">{{ facetDivergence.most_relaxed_facet || '?' }}</strong> ·
                        most guarded in <strong class="os-mono">{{ facetDivergence.most_formal_facet || '?' }}</strong>
                    </p>
                    <div v-if="facetVectors.length" class="osx-facets">
                        <div v-for="f in facetVectors" :key="f.key" class="osx-facet">
                            <div class="osx-facet-name">{{ f.key }}</div>
                            <div class="osx-facet-bars">
                                <div class="osx-fbar"><span>profanity</span><div class="os-meter"><div class="os-meter-fill" :style="{ width: pct(f.v.profanity_rate), background: 'var(--os-red)' }"></div></div></div>
                                <div class="osx-fbar"><span>emoji</span><div class="os-meter"><div class="os-meter-fill" :style="{ width: pct(f.v.emoji_rate), background: 'var(--os-amber)' }"></div></div></div>
                                <div class="osx-fbar"><span>laughter</span><div class="os-meter"><div class="os-meter-fill" :style="{ width: pct(f.v.laughter_rate), background: 'var(--os-cyan)' }"></div></div></div>
                                <div class="osx-fbar"><span>questions</span><div class="os-meter"><div class="os-meter-fill" :style="{ width: pct(f.v.question_rate), background: 'var(--os-violet)' }"></div></div></div>
                            </div>
                        </div>
                    </div>
                    <div v-else class="os-empty">Not enough per-context data yet.</div>
                </div>
            </section>
        </template>

        <!-- ═══════ PROFILE ═══════ -->
        <template v-if="tab === 'Profile'">
            <section class="os-panel" v-if="profile">
                <div class="os-panel-head"><h2><span class="os-panel-code">DOS</span> Personality dossier</h2><span class="os-stamp">{{ fmtTime(profile.generated_at) }}</span></div>
                <div class="os-panel-body"><pre class="os-md">{{ profile.narrative_markdown }}</pre></div>
            </section>
            <section class="os-panel" v-if="profile?.biographical_markdown">
                <div class="os-panel-head"><h2><span class="os-panel-code">BIO</span> Biographical inference</h2></div>
                <div class="os-panel-body"><pre class="os-md">{{ profile.biographical_markdown }}</pre></div>
            </section>

            <div class="os-cols two">
                <section class="os-panel">
                    <div class="os-panel-head"><h2><span class="os-panel-code">DIFF</span> What changed</h2></div>
                    <div class="os-panel-body">
                        <div v-for="(c, i) in changelogs" :key="i" style="margin-bottom:12px">
                            <div class="os-fact-meta">{{ fmtTime(c.generated_at) }}</div>
                            <pre class="os-md">{{ c.changes_markdown }}</pre>
                        </div>
                        <div v-if="!changelogs.length" class="os-empty">No changes recorded.</div>
                    </div>
                </section>
                <section class="os-panel">
                    <div class="os-panel-head">
                        <h2><span class="os-panel-code">ERA</span> Personality timeline</h2>
                        <div class="os-field-row">
                            <select v-model="eraYear" class="os-select" style="width:90px">
                                <option v-for="y in eraYearOptions" :key="y" :value="y">{{ y }}</option>
                            </select>
                            <button class="os-btn sm cyan" @click="generateEra">Build</button>
                        </div>
                    </div>
                    <div class="os-panel-body">
                        <details v-for="e in eras" :key="e.era" class="osx-era">
                            <summary>{{ e.era }} <span class="os-stamp">{{ fmtTime(e.generated_at) }}</span></summary>
                            <pre class="os-md">{{ e.profile_markdown }}</pre>
                        </details>
                        <div v-if="!eras.length" class="os-empty">No era profiles. Pick a year and build one.</div>
                    </div>
                </section>
            </div>
        </template>

        <!-- ═══════ REPLICA ═══════ -->
        <template v-if="tab === 'Replica'">
            <section class="os-panel">
                <div class="os-panel-head">
                    <h2><span class="os-panel-code">FID</span> Replica fidelity</h2>
                    <button class="os-btn sm cyan" @click="runFidelity">Run benchmark</button>
                </div>
                <div class="os-panel-body">
                    <div v-for="r in fidelityRuns" :key="r.run_id" class="osx-fid">
                        <div class="osx-fid-head">
                            <strong class="os-conf-num" style="font-size:18px">{{ (r.overall_fidelity*100).toFixed(0) }}%</strong>
                            <span class="os-stamp">v{{ r.replica_version }} · {{ r.pairs_tested }} pairs · emb {{ (r.avg_embedding_similarity*100).toFixed(0) }}% · style {{ (r.avg_style_score*100).toFixed(0) }}% · {{ fmtTime(r.ran_at) }}</span>
                        </div>
                        <details v-if="(r.worst_misses||[]).length">
                            <summary class="os-muted">Worst misses</summary>
                            <div v-for="(m, i) in r.worst_misses" :key="i" class="osx-miss">
                                <div class="os-fact-meta">They said: {{ m.stimulus }}</div>
                                <div>Real: <em class="os-muted">{{ m.real }}</em></div>
                                <div>Replica: <em style="color:var(--os-violet)">{{ m.predicted }}</em></div>
                            </div>
                        </details>
                    </div>
                    <div v-if="!fidelityRuns.length" class="os-empty">No fidelity runs. Train a replica, then benchmark it.</div>
                    <p class="os-fact-meta" style="margin-top:10px">Chat with this replica from the ReplicaChat panel.</p>
                </div>
            </section>
        </template>
    </div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
</script>

<script>
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';

export default {
    name: 'OmnisciencePerson',
    data() {
        return {
            personId: '',
            displayName: '',
            handles: '',
            tier: 'archive',
            tabs: ['Overview', 'Knowledge', 'Relationships', 'Contexts', 'Profile', 'Replica'],
            tab: 'Overview',
            dossier: null,
            facts: [],
            relationships: [],
            entities: [],
            aliases: [],
            openQuestions: [],
            hypotheses: [],
            completeness: null,
            changelogs: [],
            eras: [],
            fidelityRuns: [],
            profile: null,
            bigFive: null,
            newObservation: '',
            newObsCat: 'misc',
            obsCategories: ['misc', 'location', 'education', 'employment', 'relationships', 'family', 'pets', 'health', 'preferences', 'beliefs', 'skills', 'plans', 'age', 'name'],
            eraYear: new Date().getFullYear() - 1,
            bigFiveTraits: [
                { key: 'openness', label: 'Openness' },
                { key: 'conscientiousness', label: 'Conscientiousness' },
                { key: 'extraversion', label: 'Extraversion' },
                { key: 'agreeableness', label: 'Agreeableness' },
                { key: 'neuroticism', label: 'Neuroticism' },
            ],
        };
    },
    computed: {
        topFacts() { return [...this.facts].filter(f => f.status === 'active').sort((a, b) => b.confidence - a.confidence).slice(0, 8); },
        factsByCategory() {
            const g = {};
            for (const f of this.facts) (g[f.category] ||= []).push(f);
            return g;
        },
        moodSeries() {
            const s = this.analyticsPayload('mood_trajectory')?.daily_series || [];
            return s.slice(-60).map(d => d.avg_sentiment);
        },
        moodFlag() { return this.analyticsPayload('mood_trajectory')?.current_mood_flag; },
        hourHisto() { return this.analyticsPayload('activity_pattern')?.hour_histogram || []; },
        chronotype() {
            const c = this.analyticsPayload('chronotype');
            if (!c) return '';
            return `${c.chronotype} · sleeps ~${c.estimated_sleep_start_local_hour}:00–${c.estimated_sleep_end_local_hour}:00 local`;
        },
        topArtists() { return (this.analyticsPayload('music_taste')?.current_top_artists || []).slice(0, 5).map(a => a.artist); },
        topGames() { return (this.analyticsPayload('gaming_profile')?.current_top_games || []).slice(0, 5).map(g => g.game); },
        facetDivergence() { return this.analyticsPayload('facet_divergence'); },
        facetVectors() {
            const fv = this.analyticsPayload('facet_divergence')?.facet_vectors || {};
            return Object.keys(fv).map(k => ({ key: k, v: fv[k] }));
        },
        eraYearOptions() {
            const now = new Date().getFullYear();
            return Array.from({ length: 8 }, (_, i) => now - i);
        },
        graphNodes() {
            const rels = this.relationships.slice(0, 10);
            return rels.map((r, i) => {
                const angle = (i / Math.max(1, rels.length)) * Math.PI * 2 - Math.PI / 2;
                return {
                    label: this.shortName(r.related_display || '?'),
                    rel: r.rel_type,
                    conf: r.confidence || 0.3,
                    x: 50 + Math.cos(angle) * 38,
                    y: 50 + Math.sin(angle) * 40,
                };
            });
        },
    },
    methods: {
        fmtTime(t) { if (!t) return ''; const d = new Date(t); return isNaN(d) ? '' : d.toLocaleDateString(); },
        pct(v) { return Math.min(100, Math.round((v || 0) * 100)) + '%'; },
        shortName(n) { return (n || '').length > 14 ? n.slice(0, 13) + '…' : (n || '?'); },
        entityIcon(k) { return { person: '👤', place: '📍', org: '🏢', school: '🎓', pet: '🐾', event: '📅', object: '📦' }[k] || '•'; },
        analyticsPayload(module) { return this.dossier?.analytics?.[module]?.payload || null; },
        moodBarHeight(v) { return Math.max(2, Math.round((v + 2) / 4 * 26)); },
        hourBarHeight(v) { const max = Math.max(1, ...this.hourHisto); return Math.max(2, Math.round(v / max * 30)); },
        derivationText(d) { try { const o = JSON.parse(d); return o.reasoning || d; } catch { return d; } },
        async getJson(path) {
            const r = await RequestGETFromKliveAPI(path, false, false);
            if (!r.ok) return null;
            try { return await r.json(); } catch { return null; }
        },
        async loadAll() {
            const pid = encodeURIComponent(this.personId);
            const [dossier, facts, rels, aliases, oq, changelog, b5, eras, fidelity] = await Promise.all([
                this.getJson(`/omniscience/persons/get?personId=${pid}`),
                this.getJson(`/omniscience/persons/facts?personId=${pid}`),
                this.getJson(`/omniscience/persons/relationships?personId=${pid}`),
                this.getJson(`/omniscience/persons/aliases?personId=${pid}`),
                this.getJson(`/omniscience/persons/open-questions?personId=${pid}`),
                this.getJson(`/omniscience/persons/changelog?personId=${pid}`),
                this.getJson(`/omniscience/persons/bigfive-series?personId=${pid}`),
                this.getJson(`/omniscience/persons/era-profiles?personId=${pid}`),
                this.getJson(`/omniscience/replica/fidelity?personId=${pid}`),
            ]);
            this.dossier = dossier;
            if (dossier) {
                this.displayName = dossier.display_name || '';
                this.tier = dossier.tier || 'archive';
                this.handles = (dossier.identities || []).map(i => `${i.platform}:${i.platform_username || i.display_name || '?'}`).join('  ·  ');
                this.profile = dossier.personality_profile || null;
                this.bigFive = this.profile?.traits?.big_five_estimate || null;
            }
            this.facts = facts?.facts || [];
            this.relationships = rels?.relationships || [];
            this.entities = rels?.entities || [];
            this.aliases = aliases?.aliases || [];
            this.openQuestions = oq?.open_questions || [];
            this.hypotheses = oq?.hypotheses || [];
            this.completeness = oq?.completeness || null;
            this.changelogs = changelog?.changelogs || [];
            this.eras = eras?.eras || [];
            this.fidelityRuns = fidelity?.runs || [];
            // Big Five fallback: latest series point.
            if (!this.bigFive && b5?.series?.length) this.bigFive = b5.series[b5.series.length - 1].big_five;
        },
        async setTier(tier) {
            const r = await RequestPOSTFromKliveAPI('/omniscience/persons/tier-set', JSON.stringify({ personId: this.personId, tier }), false, true);
            if (r.ok) { this.tier = tier; this.toast(`Tier: ${tier}`); }
        },
        async recompute() {
            await RequestPOSTFromKliveAPI('/omniscience/persons/recompute?personId=' + encodeURIComponent(this.personId), '', false);
            this.toast('Recompute queued', 'info');
        },
        async addObservation() {
            if (!this.newObservation.trim()) return;
            const r = await RequestPOSTFromKliveAPI('/omniscience/persons/observe',
                JSON.stringify({ personId: this.personId, observation: this.newObservation, category: this.newObsCat }), false, true);
            if (r.ok) { this.toast('Fact added'); this.newObservation = ''; const f = await this.getJson(`/omniscience/persons/facts?personId=${encodeURIComponent(this.personId)}`); this.facts = f?.facts || []; }
        },
        async generateEra() {
            await RequestPOSTFromKliveAPI('/omniscience/persons/profile-era', JSON.stringify({ personId: this.personId, era: this.eraYear }), false, true);
            this.toast('Era profile queued — refresh shortly', 'info');
        },
        async runFidelity() {
            await RequestPOSTFromKliveAPI('/omniscience/replica/fidelity/run', JSON.stringify({ personId: this.personId }), false, true);
            this.toast('Benchmark queued', 'info');
        },
        toast(title, icon = 'success') { Swal.fire({ icon, title, timer: 1300, showConfirmButton: false, background: '#0e1626', color: '#eaf6ff' }); },
    },
    mounted() {
        this.personId = new URLSearchParams(window.location.search).get('personId') || '';
        if (this.personId) this.loadAll();
    },
};
</script>

<style scoped>
.osx-tier { display: flex; align-items: center; gap: 4px; }
.osx-complete { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; padding: 10px 14px; border: 1px solid var(--os-line); border-radius: 6px; background: rgba(255, 255, 255, .02); }
.osx-vital { display: flex; align-items: center; gap: 12px; }
.osx-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.osx-trait { display: flex; align-items: center; gap: 12px; margin: 8px 0; }
.osx-trait-label { width: 150px; font-size: 12px; color: var(--os-ink-dim); }
.osx-facets { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.osx-facet { border: 1px solid rgba(255, 255, 255, .07); border-radius: 6px; padding: 10px 12px; background: rgba(255, 255, 255, .02); }
.osx-facet-name { font: 700 12px ui-monospace, Consolas, monospace; color: var(--os-cyan); margin-bottom: 8px; word-break: break-all; }
.osx-fbar { display: grid; grid-template-columns: 70px 1fr; align-items: center; gap: 8px; margin: 5px 0; }
.osx-fbar span { font-size: 10px; color: var(--os-muted); }
.osx-era summary, .osx-fid details summary { cursor: pointer; color: var(--os-ink-dim); padding: 6px 0; }
.osx-era pre { margin-top: 8px; }
.osx-fid { border: 1px solid rgba(255, 255, 255, .07); border-radius: 6px; padding: 12px; margin: 8px 0; background: rgba(255, 255, 255, .02); }
.osx-fid-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.osx-miss { margin: 8px 0; padding: 8px; background: rgba(0, 0, 0, .25); border-radius: 4px; font-size: 12px; }
</style>
