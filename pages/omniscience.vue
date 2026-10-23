<template>
    <div class="os-shell">
        <OmniscienceNav />
        <header class="os-page-heading os-overview-heading">
            <div>
                <span class="os-eyebrow"><i class="os-live-dot" /> LIVE INTELLIGENCE WORKSPACE</span>
                <h1>Good to see you, Klives.</h1>
                <p>{{ overviewSummary }}</p>
            </div>
            <div class="os-header-actions">
                <span v-if="lastUpdated" class="os-stamp">Synced {{ formatDate(lastUpdated, true) }}</span>
                <button class="os-btn ghost" :disabled="busy" @click="refreshAll">{{ busy ? 'Syncing…' : 'Refresh' }}</button>
                <button class="os-btn cyan" :disabled="actionRunning === 'deduction'" @click="runDeduction">{{ actionRunning === 'deduction' ? 'Running…' : 'Run deduction' }}</button>
                <button class="os-btn violet" :disabled="actionRunning === 'profiler'" @click="runProfiler">{{ actionRunning === 'profiler' ? 'Running…' : 'Run profiler' }}</button>
            </div>
        </header>

        <div v-if="activityNotice" class="os-system-banner" :class="{ error: bootstrap?.activity_counts?.last_error }">
            <span>{{ activityNotice }}</span><NuxtLink to="/omniscience-explore?tab=Health">View data health →</NuxtLink>
        </div>
        <div v-if="fatalError" class="os-error-state"><span>{{ fatalError }}</span><button class="os-btn sm" @click="refreshAll">Retry</button></div>

        <section class="os-metrics os-overview-metrics">
            <NuxtLink to="#directory" class="os-tile cyan"><span class="os-tile-copy"><span class="os-tile-label">People</span><small>{{ formatCompact(overview.tracked) }} tracked</small></span><strong>{{ formatCompact(overview.persons) }}</strong></NuxtLink>
            <NuxtLink to="/omniscience-explore" class="os-tile"><span class="os-tile-copy"><span class="os-tile-label">Messages</span><small>{{ formatCompact(overview.attachments) }} attachments</small></span><strong>{{ formatCompact(overview.messages) }}</strong></NuxtLink>
            <NuxtLink to="/omniscience-review" class="os-tile violet"><span class="os-tile-copy"><span class="os-tile-label">Evidence-backed facts</span><small>{{ formatCompact(overview.relationships) }} relationships</small></span><strong>{{ formatCompact(overview.facts_active) }}</strong></NuxtLink>
            <NuxtLink to="/omniscience-explore?tab=Network" class="os-tile"><span class="os-tile-copy"><span class="os-tile-label">Personality dossiers</span><small>{{ formatCompact(overview.conversations) }} conversations</small></span><strong>{{ formatCompact(overview.personality_profiles) }}</strong></NuxtLink>
            <NuxtLink to="/omniscience-review" class="os-tile amber"><span class="os-tile-copy"><span class="os-tile-label">Radar · 24h</span><small>mentions & watchlists</small></span><strong>{{ formatCompact(overview.radar_alerts_24h) }}</strong></NuxtLink>
        </section>

        <div class="os-overview-grid">
            <main class="os-overview-main">
                <section class="os-panel os-launcher">
                    <button @click="openCommand"><span>⌕</span><div><strong>Ask, search or jump to anything</strong><small>People, facts, saved investigations, messages and commands</small></div><kbd>Ctrl K</kbd></button>
                    <NuxtLink to="/omniscience-explore">Open explorer <span>→</span></NuxtLink>
                </section>

                <section v-if="pins.length" class="os-panel">
                    <div class="os-panel-head"><h2><span class="os-panel-code">PIN</span> Pinned people</h2><span class="os-stamp">Your working set</span></div>
                    <div class="os-panel-body os-pinned-people">
                        <NuxtLink v-for="person in pins" :key="person.person_id" :to="personLink(person.person_id)">
                            <span class="os-person-avatar">{{ initials(person.display_name) }}</span>
                            <span><strong>{{ person.display_name }}</strong><small>{{ formatCompact(person.message_count) }} messages · {{ formatDate(person.last_message_at) }}</small></span>
                            <b>→</b>
                        </NuxtLink>
                    </div>
                </section>

                <section id="directory" class="os-panel">
                    <div class="os-panel-head os-directory-head">
                        <div><h2><span class="os-panel-code">PPL</span> People directory</h2><p class="os-panel-subtitle">{{ directoryTotal }} canonical people · fast activity summaries</p></div>
                        <button class="os-btn sm ghost" :class="{ cyan: pinnedOnly }" @click="pinnedOnly = !pinnedOnly">{{ pinnedOnly ? '★ Pinned' : '☆ All people' }}</button>
                    </div>
                    <div class="os-directory-toolbar">
                        <div class="os-directory-search"><span>⌕</span><input v-model="search" class="os-input" placeholder="Filter names, handles or aliases…" /></div>
                        <select v-model="tier" class="os-select"><option value="all">All tiers</option><option value="tracked">Tracked</option><option value="watch">Watch</option><option value="archive">Archive</option></select>
                        <select v-model="sort" class="os-select"><option value="messages">Most messages</option><option value="recent">Recent activity</option><option value="name">Name</option><option value="completeness">Completeness</option></select>
                    </div>
                    <div class="os-panel-body">
                        <div v-if="directoryError" class="os-error-state"><span>{{ directoryError }}</span><button class="os-btn sm" @click="loadDirectory">Retry</button></div>
                        <div v-else-if="directoryLoading && !people.length" class="os-person-grid"><i v-for="n in 8" :key="n" class="os-person-skeleton" /></div>
                        <div v-else class="os-person-grid">
                            <article v-for="person in people" :key="person.person_id" class="os-person-card">
                                <button class="os-person-pin" :class="{ active: person.pinned }" :title="person.pinned ? 'Unpin' : 'Pin person'" @click="togglePin(person)">{{ person.pinned ? '★' : '☆' }}</button>
                                <NuxtLink :to="personLink(person.person_id)">
                                    <div class="os-person-card-head"><span class="os-person-avatar">{{ initials(person.display_name) }}</span><span class="os-badge" :class="person.tier">{{ person.tier }}</span></div>
                                    <h3>{{ person.display_name || '(unnamed)' }}</h3>
                                    <p>{{ topHandle(person) }}</p>
                                    <footer><span><strong>{{ formatCompact(person.message_count) }}</strong> messages</span><span v-if="person.completeness != null">{{ Math.round(person.completeness * 100) }}% complete</span><span v-else>{{ formatDate(person.last_message_at) }}</span></footer>
                                </NuxtLink>
                            </article>
                            <div v-if="!people.length" class="os-empty">No people match this view.</div>
                        </div>
                        <div class="os-pagination">
                            <button class="os-btn sm ghost" :disabled="offset === 0 || directoryLoading" @click="changePage(-1)">← Previous</button>
                            <span>{{ offset + 1 }}–{{ offset + people.length }} of {{ directoryTotal }}</span>
                            <button class="os-btn sm ghost" :disabled="!directoryHasMore || directoryLoading" @click="changePage(1)">Next →</button>
                        </div>
                    </div>
                </section>

                <section id="sources" class="os-panel">
                    <div class="os-panel-head"><div><h2><span class="os-panel-code">SRC</span> Collection sources</h2><p class="os-panel-subtitle">Linked accounts and import feeds. Tokens are write-only in this interface.</p></div><button class="os-btn sm ghost" @click="sourcesExpanded = !sourcesExpanded">{{ sourcesExpanded ? 'Hide' : 'Manage' }}</button></div>
                    <div v-if="sourcesExpanded" class="os-panel-body">
                        <form class="os-source-form" @submit.prevent="addSource">
                            <input v-model="newSource.label" class="os-input" placeholder="Source label (optional)" />
                            <input v-model="newSource.token" class="os-input" type="password" autocomplete="new-password" placeholder="Discord token" />
                            <button class="os-btn cyan" :disabled="!newSource.token || addingSource">{{ addingSource ? 'Adding…' : 'Add source' }}</button>
                        </form>
                        <div v-for="source in sources" :key="source.source_id" class="os-row">
                            <span class="os-badge" :class="source.status === 'active' ? 'good' : 'bad'">{{ source.status }}</span>
                            <div class="os-row-main"><strong>{{ source.self_username || source.label || source.platform }}</strong><small>{{ source.platform }} · last event {{ formatDate(source.last_event_at, true) }}<template v-if="source.last_status_message"> · {{ source.last_status_message }}</template></small></div>
                            <div class="os-row-actions"><button class="os-btn sm" @click="backfill(source)">Backfill</button><button class="os-btn sm danger" @click="removeSource(source)">Remove</button></div>
                        </div>
                        <div v-if="!sources.length" class="os-empty">No dedicated sources configured. Linked live feeds may still be active.</div>
                    </div>
                </section>
            </main>

            <aside class="os-overview-side">
                <section class="os-panel">
                    <div class="os-panel-head"><h2><span class="os-panel-code">OPS</span> Engine status</h2><span class="os-live-dot" /></div>
                    <div class="os-panel-body">
                        <div class="os-engine-kpis">
                            <div><span>Facts</span><strong>{{ formatCompact(deduction?.facts_active) }}</strong></div>
                            <div><span>Q&A pairs</span><strong>{{ formatCompact(deduction?.qa_pairs) }}</strong></div>
                            <div><span>Entities</span><strong>{{ formatCompact(deduction?.entities) }}</strong></div>
                            <div><span>Hypotheses</span><strong>{{ formatCompact(deduction?.open_hypotheses) }}</strong></div>
                        </div>
                        <p class="os-engine-summary">{{ deduction?.last_extraction_summary || 'No extraction summary yet.' }}</p>
                        <div class="os-engine-meta"><span>{{ formatCompact(deduction?.windows_pending_graph) }} windows awaiting graph</span><span>{{ formatCompact(deduction?.stimulus_reply_pairs) }} reply pairs</span></div>
                    </div>
                </section>

                <section class="os-panel">
                    <div class="os-panel-head"><h2><span class="os-panel-code">HIST</span> Jump back in</h2><NuxtLink to="/omniscience-explore" class="os-panel-link">All →</NuxtLink></div>
                    <div class="os-panel-body">
                        <NuxtLink v-for="saved in savedQueries.slice(0, 4)" :key="saved.query_id" class="os-recent-item" :to="`/omniscience-explore?saved=${saved.query_id}`"><span>★</span><div><strong>{{ saved.name }}</strong><small>{{ saved.use_count }} runs</small></div><b>→</b></NuxtLink>
                        <NuxtLink v-for="entry in history.slice(0, 3)" :key="entry.history_id" class="os-recent-item" :to="historyLink(entry)"><span>◷</span><div><strong>{{ entry.query_text }}</strong><small>{{ formatDate(entry.created_at) }}</small></div><b>→</b></NuxtLink>
                        <div v-if="!savedQueries.length && !history.length" class="os-empty">Your investigations will appear here.</div>
                    </div>
                </section>

                <section class="os-panel">
                    <div class="os-panel-head"><h2><span class="os-panel-code">RAD</span> Live radar</h2><span class="os-stamp">{{ radarAliases.length }} aliases</span></div>
                    <div class="os-panel-body">
                        <article v-for="(alert, index) in radarAlerts.slice(0, 5)" :key="index" class="os-radar-item"><div><strong>{{ alert.author_display }}</strong><span>{{ alert.channel_label }}</span></div><p>{{ alert.snippet }}</p><small>{{ formatDate(alert.occurred_at, true) }} · {{ alert.matched_alias }}</small></article>
                        <div v-if="!radarAlerts.length" class="os-empty">No recent watchlist hits.</div>
                    </div>
                </section>

                <section v-if="targetSuggestions.length" class="os-panel">
                    <div class="os-panel-head"><h2><span class="os-panel-code">SUG</span> Suggested to track</h2></div>
                    <div class="os-panel-body">
                        <div v-for="suggestion in targetSuggestions.slice(0, 4)" :key="suggestion.person_id" class="os-row">
                            <div class="os-row-main"><strong>{{ suggestion.display_name }}</strong><small>{{ (suggestion.reasons || []).join(' · ') }}</small></div>
                            <div class="os-row-actions"><button class="os-btn sm cyan" @click="promote(suggestion.person_id)">Track</button><button class="os-btn sm ghost" @click="dismissSuggestion(suggestion.person_id)">×</button></div>
                        </div>
                    </div>
                </section>

                <section class="os-panel">
                    <div class="os-panel-head"><h2><span class="os-panel-code">BRF</span> Latest briefing</h2><button class="os-btn sm ghost" @click="sendBriefing">DM me</button></div>
                    <div class="os-panel-body"><pre v-if="briefing" class="os-briefing">{{ briefing }}</pre><div v-else class="os-empty">The next briefing is warming. Core workspace features are available now.</div></div>
                </section>

                <OmniscienceNotifications @changed="unread = $event" />
            </aside>
        </div>
    </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'navbar' });
import Swal from 'sweetalert2';
import { formatCompact, formatDate, omniscienceError, useOmniscienceApi } from '~/composables/useOmniscienceApi';

const api = useOmniscienceApi();
const overview = ref<any>({});
const bootstrap = ref<any>(null);
const deduction = ref<any>(null);
const schedule = ref<any>(null);
const radarAlerts = ref<any[]>([]);
const radarAliases = ref<any[]>([]);
const targetSuggestions = ref<any[]>([]);
const pins = ref<any[]>([]);
const savedQueries = ref<any[]>([]);
const history = ref<any[]>([]);
const sources = ref<any[]>([]);
const sourcesExpanded = ref(false);
const briefing = ref('');
const unread = ref(0);
const people = ref<any[]>([]);
const directoryTotal = ref(0);
const directoryHasMore = ref(false);
const directoryLoading = ref(false);
const directoryError = ref('');
const search = ref('');
const tier = ref('all');
const sort = ref('messages');
const pinnedOnly = ref(false);
const offset = ref(0);
const limit = 48;
const busy = ref(false);
const fatalError = ref('');
const actionRunning = ref('');
const addingSource = ref(false);
const newSource = reactive({ label: '', token: '' });
const lastUpdated = ref<number | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const overviewSummary = computed(() => `${formatCompact(overview.value.messages)} ${noun(overview.value.messages, 'message')} across ${formatCompact(overview.value.conversations)} ${noun(overview.value.conversations, 'conversation')}, distilled into ${formatCompact(overview.value.facts_active)} active ${noun(overview.value.facts_active, 'fact')} and ${formatCompact(overview.value.relationships)} relationship ${noun(overview.value.relationships, 'edge')}.`);
function noun(value: any, singular: string) { return Number(value) === 1 ? singular : singular + 's'; }
const directoryTotalLabel = computed(() => formatCompact(directoryTotal.value));
const activityNotice = computed(() => {
    const activity = bootstrap.value?.activity_counts;
    if (!activity) return '';
    if (activity.last_error) return 'Activity summaries reported an error. Directory data is available, but coverage may be incomplete.';
    if (activity.running) return 'Activity summaries are warming in the background. The fast directory remains available while counts catch up.';
    if (!activity.ready) return 'Activity summaries need attention. Some message counts may be incomplete.';
    return '';
});
function initials(name: string) { return (name || '?').trim().slice(0, 2).toUpperCase(); }
function personLink(id: string) { return '/omniscience-person?personId=' + encodeURIComponent(id); }
function topHandle(person: any) { const identity = person.identities?.[0]; return identity ? `${identity.platform}:${identity.username || identity.display_name}` : person.handles?.split('|')[0] || 'No linked handle'; }
function historyLink(entry: any) { return '/omniscience-explore?scope=' + encodeURIComponent(JSON.stringify(entry.scope || { q: entry.query_text })); }
function openCommand() { if (import.meta.client) window.dispatchEvent(new CustomEvent('omniscience:command')); }

async function loadBootstrap() {
    try {
        const data = await api.get('/omniscience/workspace/bootstrap');
        bootstrap.value = data;
        overview.value = data.overview || {};
        pins.value = data.pins || [];
        savedQueries.value = data.queries || [];
        history.value = data.history || [];
        unread.value = data.unread_notifications || 0;
    } catch (cause: any) {
        if (cause?.status !== 404) throw cause;
        overview.value = await api.get('/omniscience/stats/overview');
        bootstrap.value = { activity_counts: { ready: true } };
    }
}
async function loadOperations() {
    const results = await Promise.allSettled([
        api.get('/omniscience/deduction/status'), api.get('/omniscience/schedule/status'),
        api.get('/omniscience/radar/alerts'), api.get('/omniscience/targets/suggestions'),
    ]);
    if (results[0].status === 'fulfilled') deduction.value = results[0].value;
    if (results[1].status === 'fulfilled') schedule.value = results[1].value;
    if (results[2].status === 'fulfilled') { radarAlerts.value = results[2].value.alerts || []; radarAliases.value = results[2].value.aliases_watched || []; }
    if (results[3].status === 'fulfilled') targetSuggestions.value = results[3].value.suggestions || [];
}
async function loadDirectory() {
    directoryLoading.value = true; directoryError.value = '';
    try {
        const params = new URLSearchParams({ limit: String(limit), offset: String(offset.value), tier: tier.value, sort: sort.value });
        if (search.value.trim()) params.set('search', search.value.trim());
        if (pinnedOnly.value) params.set('pinned', '1');
        try {
            const data = await api.get('/omniscience/workspace/directory?' + params);
            people.value = data.items || [];
            directoryTotal.value = data.total || 0;
            directoryHasMore.value = !!data.has_more;
            bootstrap.value = { ...(bootstrap.value || {}), activity_counts: data.activity_counts };
        } catch (cause: any) {
            if (cause?.status !== 404) throw cause;
            const legacy = await api.get('/omniscience/persons?' + params);
            people.value = (legacy || []).filter((person: any) => tier.value === 'all' || person.tier === tier.value);
            directoryTotal.value = offset.value + people.value.length + (people.value.length === limit ? 1 : 0);
            directoryHasMore.value = people.value.length === limit;
        }
    } catch (cause) { directoryError.value = omniscienceError(cause, 'Could not load the people directory.'); }
    finally { directoryLoading.value = false; }
}
async function loadSources() { try { sources.value = await api.get('/omniscience/sources'); } catch { sources.value = []; } }
async function loadBriefing() { try { const data = await api.get('/omniscience/briefing/preview', { retries: 1 }); briefing.value = data.markdown || ''; } catch { /* non-critical snapshot */ } }
async function refreshAll() {
    if (busy.value) return;
    busy.value = true; fatalError.value = '';
    try {
        await loadBootstrap();
        await Promise.allSettled([loadOperations(), loadDirectory(), loadSources(), loadBriefing()]);
        lastUpdated.value = Date.now();
    } catch (cause) { fatalError.value = omniscienceError(cause, 'Could not sync Omniscience.'); }
    finally { busy.value = false; }
}
function changePage(direction: number) { offset.value = Math.max(0, offset.value + direction * limit); void loadDirectory(); }
async function togglePin(person: any) {
    try {
        const data = await api.post('/omniscience/workspace/pins/set', { personId: person.person_id, pinned: !person.pinned });
        person.pinned = !person.pinned;
        pins.value = data.pins || [];
        if (pinnedOnly.value && !person.pinned) people.value = people.value.filter(item => item.person_id !== person.person_id);
    } catch (cause) { directoryError.value = omniscienceError(cause, 'Could not update pin.'); }
}
async function action(name: string, path: string, notice: string) {
    actionRunning.value = name;
    try { await api.post(path, {}); toast(notice, 'info'); await loadOperations(); }
    catch (cause) { toast(omniscienceError(cause), 'error'); }
    finally { actionRunning.value = ''; }
}
async function runDeduction() { await action('deduction', '/omniscience/deduction/run', 'Deduction pass queued'); }
async function runProfiler() { await action('profiler', '/omniscience/schedule/run-now', 'Profiler run queued'); }
async function sendBriefing() { await action('briefing', '/omniscience/briefing/run', 'Briefing sent to your DMs'); }
async function promote(personId: string) { await api.post('/omniscience/persons/tier-set', { personId, tier: 'tracked' }); targetSuggestions.value = targetSuggestions.value.filter(item => item.person_id !== personId); void loadDirectory(); }
async function dismissSuggestion(personId: string) { await api.post('/omniscience/targets/dismiss', { personId }); targetSuggestions.value = targetSuggestions.value.filter(item => item.person_id !== personId); }
async function addSource() {
    if (!newSource.token) return;
    addingSource.value = true;
    try { await api.post('/omniscience/sources/add', { platform: 'discord', ...newSource }); Object.assign(newSource, { label: '', token: '' }); await loadSources(); toast('Source added'); }
    catch (cause) { toast(omniscienceError(cause), 'error'); }
    finally { addingSource.value = false; }
}
async function backfill(source: any) { await api.post('/omniscience/sources/backfill?sourceId=' + encodeURIComponent(source.source_id), {}); toast('Backfill queued', 'info'); }
async function removeSource(source: any) {
    const result = await Swal.fire({ icon: 'warning', title: 'Remove source?', text: source.self_username || source.label, showCancelButton: true, background: '#0e1626', color: '#eaf6ff' });
    if (!result.isConfirmed) return;
    await api.post('/omniscience/sources/remove?sourceId=' + encodeURIComponent(source.source_id), {});
    await loadSources();
}
function toast(title: string, icon: 'success' | 'info' | 'error' | 'warning' = 'success') { Swal.fire({ icon, title, timer: 1500, showConfirmButton: false, background: '#0e1626', color: '#eaf6ff' }); }
watch([search, tier, sort, pinnedOnly], () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { offset.value = 0; void loadDirectory(); }, 260);
});
onMounted(() => {
    void refreshAll();
    pollTimer = setInterval(() => { if (!busy.value) void refreshAll(); }, 90_000);
});
onBeforeUnmount(() => { if (pollTimer) clearInterval(pollTimer); if (searchTimer) clearTimeout(searchTimer); });
</script>

<style scoped>
.os-overview-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 17px; }
.os-overview-heading h1 { margin: 4px 0 6px; color: var(--os-ink); font-size: clamp(29px,4vw,41px); letter-spacing: -.04em; }
.os-overview-heading p { max-width: 760px; margin: 0; color: var(--os-muted); font-size: 12px; }
.os-eyebrow { display: flex; align-items: center; gap: 7px; color: var(--os-cyan); font: 750 9px var(--os-mono); letter-spacing: .12em; }
.os-eyebrow .os-live-dot { margin: 0; }
.os-system-banner { display: flex; justify-content: space-between; gap: 12px; padding: 9px 12px; margin-bottom: 12px; border: 1px solid rgba(255,194,71,.22); border-radius: 8px; background: rgba(255,194,71,.045); color: var(--os-amber); font-size: 10px; }
.os-system-banner.error { border-color: rgba(255,90,120,.25); color: var(--os-red); }
.os-system-banner a { color: inherit; white-space: nowrap; }
.os-overview-metrics { grid-template-columns: repeat(5,minmax(0,1fr)); }
.os-overview-grid { display: grid; grid-template-columns: minmax(0,1fr) 320px; gap: 12px; }
.os-overview-main, .os-overview-side { min-width: 0; }
.os-launcher { display: flex; align-items: center; padding: 7px; background: linear-gradient(100deg,rgba(95,211,255,.065),rgba(151,113,255,.04)); }
.os-launcher > button { display: flex; align-items: center; gap: 11px; flex: 1; padding: 7px 9px; border: 0; background: transparent; color: inherit; cursor: pointer; text-align: left; }
.os-launcher > button > span { color: var(--os-cyan); font-size: 22px; }
.os-launcher > button > div { flex: 1; }
.os-launcher strong, .os-launcher small { display: block; }
.os-launcher strong { color: var(--os-ink); font-size: 12px; }
.os-launcher small { margin-top: 2px; color: var(--os-muted); font-size: 10px; }
.os-launcher kbd { color: var(--os-faint); font: 700 9px var(--os-mono); }
.os-launcher > a { padding: 9px 11px; color: var(--os-cyan); font-size: 10px; font-weight: 700; text-decoration: none; white-space: nowrap; }
.os-pinned-people { display: grid; grid-template-columns: repeat(auto-fill,minmax(210px,1fr)); gap: 7px; }
.os-pinned-people a { display: flex; align-items: center; gap: 9px; padding: 8px; border: 1px solid var(--os-line); border-radius: 8px; color: inherit; text-decoration: none; }
.os-pinned-people a > span:nth-child(2) { flex: 1; min-width: 0; }
.os-pinned-people strong, .os-pinned-people small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.os-pinned-people strong { color: var(--os-ink-dim); font-size: 11px; }
.os-pinned-people small { color: var(--os-muted); font-size: 9px; }
.os-pinned-people b { color: var(--os-cyan); }
.os-person-avatar { display: grid; place-items: center; width: 32px; height: 32px; flex: 0 0 32px; border-radius: 9px; background: linear-gradient(145deg,rgba(95,211,255,.14),rgba(151,113,255,.13)); color: var(--os-cyan); font: 800 10px var(--os-mono); }
.os-directory-toolbar { display: grid; grid-template-columns: minmax(0,1fr) 130px 150px; gap: 7px; padding: 10px 12px; border-bottom: 1px solid var(--os-line); }
.os-directory-search { position: relative; }
.os-directory-search > span { position: absolute; left: 11px; top: 9px; color: var(--os-cyan); }
.os-directory-search input { padding-left: 31px; }
.os-person-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(195px,1fr)); gap: 8px; }
.os-person-card { position: relative; min-width: 0; border: 1px solid var(--os-line); border-radius: 10px; background: rgba(255,255,255,.014); transition: border-color .12s,transform .12s; }
.os-person-card:hover { border-color: var(--os-line-strong); transform: translateY(-1px); }
.os-person-card > a { display: block; padding: 11px; color: inherit; text-decoration: none; }
.os-person-card-head { display: flex; align-items: center; justify-content: space-between; }
.os-person-card h3 { margin: 9px 0 3px; overflow: hidden; color: var(--os-ink); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.os-person-card p { margin: 0; overflow: hidden; color: var(--os-muted); font: 500 9px var(--os-mono); text-overflow: ellipsis; white-space: nowrap; }
.os-person-card footer { display: flex; justify-content: space-between; gap: 7px; margin-top: 10px; color: var(--os-faint); font-size: 8px; }
.os-person-card footer strong { color: var(--os-cyan); font-weight: 750; }
.os-person-pin { position: absolute; z-index: 2; right: 7px; top: 43px; border: 0; background: transparent; color: var(--os-faint); cursor: pointer; font-size: 15px; }
.os-person-pin.active { color: var(--os-amber); }
.os-person-skeleton { height: 135px; border-radius: 10px; background: linear-gradient(100deg,rgba(255,255,255,.02),rgba(255,255,255,.055),rgba(255,255,255,.02)); background-size: 200% 100%; animation: os-shimmer 1.4s infinite; }
.os-pagination { display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 13px; color: var(--os-muted); font-size: 10px; }
.os-source-form { display: grid; grid-template-columns: 1fr 1.6fr auto; gap: 7px; margin-bottom: 10px; }
.os-engine-kpis { display: grid; grid-template-columns: repeat(2,1fr); gap: 6px; }
.os-engine-kpis > div { padding: 8px; border-radius: 7px; background: rgba(255,255,255,.025); }
.os-engine-kpis span { display: block; color: var(--os-muted); font-size: 9px; }
.os-engine-kpis strong { display: block; margin-top: 3px; color: var(--os-ink); font: 750 16px var(--os-mono); }
.os-engine-summary { color: var(--os-ink-dim); font-size: 10px; line-height: 1.5; }
.os-engine-meta { display: flex; flex-direction: column; gap: 3px; color: var(--os-faint); font-size: 9px; }
.os-panel-link { color: var(--os-cyan); font-size: 10px; text-decoration: none; }
.os-recent-item { display: flex; align-items: center; gap: 8px; padding: 7px 3px; color: inherit; text-decoration: none; }
.os-recent-item > span { color: var(--os-amber); }
.os-recent-item > div { flex: 1; min-width: 0; }
.os-recent-item strong, .os-recent-item small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.os-recent-item strong { color: var(--os-ink-dim); font-size: 10px; }
.os-recent-item small { color: var(--os-faint); font-size: 9px; }
.os-recent-item b { color: var(--os-cyan); }
.os-radar-item { padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.045); }
.os-radar-item > div { display: flex; justify-content: space-between; gap: 8px; }
.os-radar-item strong { color: var(--os-ink-dim); font-size: 10px; }
.os-radar-item span, .os-radar-item small { color: var(--os-faint); font-size: 9px; }
.os-radar-item p { margin: 4px 0; color: var(--os-muted); font-size: 10px; }
.os-briefing { max-height: 260px; overflow: auto; margin: 0; color: var(--os-muted); font: 500 10px/1.55 inherit; white-space: pre-wrap; }
@media (max-width: 1200px) { .os-overview-grid { grid-template-columns: 1fr; } .os-overview-side { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; } .os-overview-side .os-panel { margin-bottom: 0; } }
@media (max-width: 850px) { .os-overview-metrics { grid-template-columns: repeat(2,1fr); } .os-overview-heading { align-items: flex-start; flex-direction: column; } .os-directory-toolbar { grid-template-columns: 1fr 1fr; } .os-directory-search { grid-column: 1 / -1; } }
@media (max-width: 650px) { .os-overview-side { grid-template-columns: 1fr; } .os-source-form { grid-template-columns: 1fr; } .os-launcher > a, .os-launcher kbd { display: none; } .os-system-banner { flex-direction: column; } }
</style>
