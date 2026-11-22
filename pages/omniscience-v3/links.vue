<template>
    <OmniscienceV3Shell>
        <div class="omni-pagehead">
            <div>
                <h1>Links</h1>
                <p class="subtitle">Every link anyone shared, recognised by site (videos, posts, music, games, code) and filed by topic. Private links (invites, documents, anything with a token) are never looked up.</p>
            </div>
        </div>

        <div class="omni-segment tabs" role="tablist" aria-label="Links">
            <button type="button" role="tab" :aria-selected="filters.tab === 'search'" :aria-pressed="filters.tab === 'search'" data-testid="links-tab-search" @click="filters.tab = 'search'">Search</button>
            <button type="button" role="tab" :aria-selected="filters.tab === 'track'" :aria-pressed="filters.tab === 'track'" data-testid="links-tab-track" @click="filters.tab = 'track'">Follow a link</button>
        </div>

        <template v-if="filters.tab === 'search'">
            <div class="omni-filterbar words">
                <label class="omni-search grow"><span class="glyph" aria-hidden="true">⌕</span><span class="visually-hidden">Words</span>
                    <input v-model="filters.q" class="omni-input" type="search" placeholder="Title, site or words…" data-testid="links-q" /></label>
                <span class="summary"><b>{{ results.data.value?.items.length ?? 0 }}</b> shares{{ results.data.value?.truncated ? ' (more exist: narrow the search)' : '' }}</span>
            </div>
            <OmniscienceV3FilterBar :filters="searchFilters" label="Narrow the links" testid="links" />
            <OmniscienceV3Panel title="Shared links" flush :loading="results.loading.value" :refreshing="results.refreshing.value" :error="results.error.value" :has-data="!!results.data.value"
                                :empty="!!results.data.value && !results.data.value.items.length" :empty-kind="filtered ? 'filtered' : 'empty'"
                                :empty-title="filtered ? 'No links match' : 'No links yet'" @retry="results.refresh()">
                <table v-if="results.data.value" class="omni-table" data-testid="links-table">
                    <thead><tr><th>Link</th><th>Kind</th><th>Topic</th><th>Shared by</th><th>Where</th><th class="num">When</th><th></th></tr></thead>
                    <tbody>
                        <tr v-for="s in results.data.value.items" :key="s.messageId + s.link.urlId">
                            <td><span class="cellstack"><a :href="s.link.url" target="_blank" rel="noopener noreferrer nofollow">{{ s.link.title ?? s.link.url }}</a>
                                <span class="sub">{{ s.link.site }}{{ s.link.sensitive ? ' · private link (never looked up)' : '' }}{{ s.link.summary ? ` · ${s.link.summary}` : '' }}</span></span></td>
                            <td><span class="omni-chip sm">{{ s.link.kind }}</span></td>
                            <td>{{ s.link.topic?.replace('_', ' / ') ?? '—' }}</td>
                            <td><NuxtLink v-if="s.personId" :to="personLink(s.personId)">{{ omniPersonLabel(s.personName) }}</NuxtLink><span v-else class="omni-muted">—</span></td>
                            <td><button class="where" type="button" :title="`Only links shared in ${s.conversationTitle ?? 'this conversation'}`" @click="onlyIn(s.conversationId, s.conversationTitle)">{{ s.conversationTitle ?? 'a conversation' }}</button></td>
                            <td class="num"><OmniscienceV3Time :ms="s.atMs" mode="age" /></td>
                            <td><button class="omni-btn ghost sm" type="button" @click="follow(s.link.url)">Follow</button></td>
                        </tr>
                    </tbody>
                </table>
            </OmniscienceV3Panel>
        </template>

        <template v-else>
            <form class="omni-filterbar" data-testid="track-form" @submit.prevent="track.refresh()">
                <div class="omni-segment" role="group" aria-label="Follow">
                    <button type="button" :aria-pressed="trackBy === 'url'" @click="trackBy = 'url'">A link</button>
                    <button type="button" :aria-pressed="trackBy === 'site'" @click="trackBy = 'site'">A site</button>
                </div>
                <input v-model="filters.target" class="omni-input track" :placeholder="trackBy === 'url' ? 'https://…' : 'youtube, github, a domain…'" aria-label="Link or site" />
                <button class="omni-btn primary" type="submit" :disabled="!filters.target.trim()">Follow</button>
            </form>
            <OmniscienceV3FilterBar :filters="trackFilters" label="Narrow where it travelled" testid="track" />
            <OmniscienceV3Panel :title="t ? (t.link?.title ?? t.target) : 'How a link travelled'" :loading="track.loading.value && !!filters.target" :error="track.error.value"
                                :has-data="!!t" :empty="!filters.target || (!!t && !t.shares)" :empty-title="filters.target ? 'Nobody shared this' : 'Follow a link or a site'"
                                empty-text="Who shared it first, who passed it on, where it went and when." @retry="track.refresh()">
                <template v-if="t">
                    <div class="omni-kpis tight">
                        <OmniscienceV3Kpi label="Shares" :value="omniCount(t.shares)" small />
                        <OmniscienceV3Kpi label="People" :value="omniCount(t.sharers)" small />
                        <OmniscienceV3Kpi label="Reactions" :value="omniCount(t.reactions)" small />
                        <OmniscienceV3Kpi label="First" :value="t.firstAtMs ? at(t.firstAtMs) : '—'" small :foot="t.first?.personName ?? undefined" />
                    </div>
                    <div class="omni-grid three">
                        <section class="omni-section"><h4>Who shared it</h4>
                            <ol class="ranked"><li v-for="c in t.people" :key="c.key"><NuxtLink :to="personLink(c.key)">{{ c.label ?? c.key }}</NuxtLink> <span class="omni-muted">{{ c.shares }}</span></li></ol></section>
                        <section class="omni-section"><h4>Where</h4>
                            <ol class="ranked"><li v-for="c in t.places" :key="c.key">{{ c.label ?? c.key }} <span class="omni-muted">{{ c.shares }}</span></li></ol></section>
                        <section class="omni-section"><h4>When</h4>
                            <ol class="ranked"><li v-for="c in t.months" :key="c.key">{{ c.label ?? c.key }} <span class="omni-muted">{{ c.shares }}</span></li></ol></section>
                    </div>
                    <section v-if="t.topLinks.length" class="omni-section"><h4>Most shared from this site</h4>
                        <ul><li v-for="l in t.topLinks" :key="l.urlId"><a href="#" @click.prevent="follow(l.url)">{{ l.title ?? l.url }}</a> <span class="omni-muted">{{ l.shares }} shares by {{ l.sharers }}</span></li></ul></section>
                    <section class="omni-section"><h4>Every share{{ t.truncated ? ' (the latest only)' : '' }}</h4>
                        <table class="omni-table" data-testid="track-table">
                            <tbody><tr v-for="s in t.items" :key="s.messageId + s.link.urlId">
                                <td class="num"><OmniscienceV3Time :ms="s.atMs" /></td>
                                <td><NuxtLink v-if="s.personId" :to="personLink(s.personId)">{{ omniPersonLabel(s.personName) }}</NuxtLink></td>
                                <td>{{ s.conversationTitle ?? '—' }}</td>
                                <td class="num">{{ s.reactions }} reactions</td>
                            </tr></tbody>
                        </table>
                    </section>
                </template>
            </OmniscienceV3Panel>
        </template>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { OMNI_BASE, omniGet } from '~/scripts/omniscience/api';
import type { LinkSearchDto, LinkTrackDto } from '~/scripts/omniscience/contracts';
import { omniCount } from '~/scripts/omniscience/format';
import { omniFilterDefaults, omniScopeFilters, type OmniFilterDef } from '~/scripts/omniscience/filters';
import { omniPersonLabel, useOmniDebounced, useOmniResource, useOmniTime } from '~/composables/useOmniscienceV3';
import { useOmniUrlState } from '~/composables/useOmniscienceV3';
import { useOmniFilters, useOmniPickLabels } from '~/composables/useOmniFilters';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Links' });

const KINDS = ['video', 'post', 'music', 'game', 'code', 'image', 'shop', 'invite', 'page'];
const TOPICS = ['music', 'gaming', 'film_tv', 'tech', 'science', 'news', 'sports', 'memes', 'art', 'education', 'shopping', 'other'];

// Who shared it, where and when narrow both tabs; what the link is (its site, kind and topic) narrows the search.
const SCOPE = omniScopeFilters('Shared by');
const ABOUT: OmniFilterDef[] = [
    { key: 'site', kind: 'site', label: 'Site', any: 'any', primary: true, help: 'A site is also matched as an exact host: “open.spotify.com” finds only that one.' },
    { key: 'kind', kind: 'options', label: 'Kind of link', any: 'any', primary: true, param: 'kinds', options: KINDS.map(k => ({ id: k, label: k })) },
    { key: 'topic', kind: 'options', label: 'Topic', any: 'any', primary: true, param: 'topics', options: TOPICS.map(t => ({ id: t, label: t.replace('_', ' / ') })) },
];
const SEARCH = [...SCOPE.filter(d => d.primary), ...ABOUT, ...SCOPE.filter(d => !d.primary)];

const { at } = useOmniTime();
const { state: filters } = useOmniUrlState({ tab: 'search', q: '', target: '', ...omniFilterDefaults(SEARCH) });
const searchFilters = useOmniFilters(SEARCH, filters);
const trackFilters = useOmniFilters(SCOPE, filters);
const { remember } = useOmniPickLabels();
const trackBy = ref<'url' | 'site'>(/^https?:\/\//i.test(filters.target) || !filters.target ? 'url' : 'site');
const filtered = computed(() => !!filters.q || searchFilters.activeCount.value > 0);

function personLink(id: string): string { return `${OMNI_BASE}/people/${encodeURIComponent(id)}`; }

const results = useOmniResource(signal => omniGet<LinkSearchDto>('links/search', { q: filters.q.trim(), ...searchFilters.params(), limit: 100 }, signal));
useOmniDebounced(() => `${filters.q}\u0001${searchFilters.signature.value}`, () => { void results.refresh(); });

/** Narrows the search to one conversation, straight from a row. */
function onlyIn(conversationId: string, title: string | null | undefined) {
    if (title) remember('conversation', conversationId, title);
    searchFilters.pick('conversation', [conversationId]);
}

const track = useOmniResource(signal => {
    const target = filters.target.trim();
    if (!target) return Promise.resolve(null as LinkTrackDto | null);
    return omniGet<LinkTrackDto>('links/track', { ...(trackBy.value === 'url' ? { url: target } : { site: target }), ...trackFilters.params() }, signal);
});
// Who, where and when narrow a followed link too: it is followed again when they change.
useOmniDebounced(() => trackFilters.signature.value, () => { if (filters.tab === 'track' && filters.target.trim()) void track.refresh(); });
const t = computed(() => track.data.value);

function follow(url: string) {
    trackBy.value = 'url';
    filters.target = url;
    filters.tab = 'track';
    void track.refresh();
}
</script>

<style scoped>
.tabs { margin-bottom: var(--omni-gutter); }
.omni-input.track { flex: 1 1 360px; }
.words { margin-bottom: 8px; }
.words .grow { flex: 1 1 320px; }
.where { color: inherit; text-align: left; cursor: pointer; }
.where:hover { color: var(--omni-accent-2); text-decoration: underline; }
.ranked { margin: 0; padding-left: 20px; font-size: 13px; }
</style>
