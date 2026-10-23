<template>
    <div class="os-shell">
        <OmniscienceNav />
        <div class="os-crumb"><a href="/omniscience">◎ Omniscience</a> <span>/</span> <span>Search &amp; Q&amp;A</span></div>

        <header class="os-header">
            <div>
                <div class="os-kicker"><span class="os-live-dot"></span> SEMANTIC RETRIEVAL</div>
                <h1>Search &amp; Q&amp;A</h1>
                <p>Search the entire message corpus by meaning, or ask a question and get an answer grounded in real messages with citations.</p>
            </div>
            <div class="os-header-actions"><a class="os-btn ghost" href="/omniscience-explore">Advanced evidence explorer</a></div>
        </header>

        <section class="os-panel">
            <div class="os-panel-body">
                <div class="os-field-row">
                    <input v-model="query" class="os-input" style="flex:1" :placeholder="mode === 'ask' ? 'Ask anything — e.g. has anyone mentioned a birthday in March?' : 'Search messages by meaning…'" @keyup.enter="run" />
                    <button class="os-btn cyan" :disabled="searching" @click="run">{{ searching ? '…' : (mode === 'ask' ? 'Ask' : 'Search') }}</button>
                </div>
                <div class="os-nav" style="margin:12px 0 0">
                    <a :class="{ active: mode === 'search' }" @click="mode = 'search'"><span class="os-nav-code">FIND</span> Find messages</a>
                    <a :class="{ active: mode === 'ask' }" @click="mode = 'ask'"><span class="os-nav-code">ASK</span> Ask a question</a>
                </div>
            </div>
        </section>

        <div v-if="error" class="os-error-state"><span>{{ error }}</span><button class="os-btn sm" @click="run">Retry</button></div>

        <section v-if="mode === 'ask' && answer" class="os-panel">
            <div class="os-panel-head"><h2><span class="os-panel-code">ANS</span> Answer</h2></div>
            <div class="os-panel-body"><pre class="os-md">{{ answer }}</pre></div>
        </section>

        <section v-if="results.length" class="os-panel">
            <div class="os-panel-head"><h2><span class="os-panel-code">{{ mode === 'ask' ? 'CITE' : 'HITS' }}</span> {{ mode === 'ask' ? 'Evidence' : 'Results' }} · {{ results.length }}</h2></div>
            <div class="os-panel-body">
                <div v-for="(r, i) in results" :key="i" class="os-fact">
                    <span class="os-fact-cat" v-if="mode === 'ask'">{{ i + 1 }}</span>
                    <span class="os-fact-cat" v-else>{{ Math.round((r.score||0)*100) }}%</span>
                    <div class="os-fact-body">
                        <div class="os-fact-text">{{ r.content }}</div>
                        <div class="os-fact-meta">
                            <a v-if="r.author_person_id" class="osx-link" :href="`/omniscience-person?personId=${r.author_person_id}`">{{ r.author_display || '?' }}</a>
                            <template v-else>{{ r.author_display || '?' }}</template>
                            · {{ fmtTime(r.sent_at) }} · {{ r.conversation_kind === 'dm' ? 'DM' : (r.guild_name || '') + ' #' + (r.channel_title || '') }}
                        </div>
                    </div>
                </div>
            </div>
        </section>
        <div v-else-if="searched && !searching && !error" class="os-empty">No results.</div>
    </div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
</script>

<script>
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

export default {
    name: 'OmniscienceSearch',
    data() {
        return { query: '', mode: 'search', searching: false, searched: false, results: [], answer: '', error: '' };
    },
    methods: {
        fmtTime(t) { if (!t) return ''; const d = new Date(t); return isNaN(d) ? '' : d.toLocaleString(); },
        async run() {
            if (!this.query.trim() || this.searching) return;
            this.searching = true; this.answer = ''; this.results = []; this.error = '';
            try {
                if (this.mode === 'ask') {
                    const res = await RequestPOSTFromKliveAPI('/omniscience/persons/ask', JSON.stringify({ question: this.query }), false, true);
                    if (res.ok) { const d = await res.json(); this.answer = d.answer || ''; this.results = d.citations || []; }
                    else this.error = await res.text();
                } else {
                    const res = await RequestGETFromKliveAPI('/omniscience/search/semantic?q=' + encodeURIComponent(this.query) + '&limit=30', false, false);
                    if (res.ok) { const d = await res.json(); this.results = d.results || []; }
                    else this.error = await res.text();
                }
            } catch (e) { this.error = e?.message || 'Search failed.'; }
            finally { this.searching = false; this.searched = true; }
        },
    },
    mounted() {
        const params = new URLSearchParams(window.location.search);
        this.mode = params.get('mode') === 'ask' ? 'ask' : 'search';
        this.query = params.get('q') || '';
        if (this.query) this.run();
    },
};
</script>

<style scoped>
.osx-link { color: var(--os-cyan); text-decoration: none; }
.osx-link:hover { text-decoration: underline; }
.os-nav a { cursor: pointer; }
</style>
