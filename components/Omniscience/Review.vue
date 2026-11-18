<template>
    <div data-testid="omx-review">
        <div class="omx-tabs" role="tablist">
            <button class="omx-tab" type="button" role="tab" :aria-selected="tab === 'decide'" data-testid="omx-review-decide" @click="setTab('decide')">Decide · {{ omx.reviewCount.value }}</button>
            <button class="omx-tab" type="button" role="tab" :aria-selected="tab === 'mentions'" data-testid="omx-review-mentions" @click="setTab('mentions')">Mentions · {{ omx.radarAlerts.value.length }}</button>
            <button class="omx-tab" type="button" role="tab" :aria-selected="tab === 'watch'" data-testid="omx-review-watch" @click="setTab('watch')">Watchlists · {{ omx.watchlists.value.length }}</button>
        </div>

        <!-- ── decisions ── -->
        <section v-if="tab === 'decide'" class="omx-card">
            <div class="omx-toolbar">
                <div class="omx-seg" role="group" aria-label="Kind of decision">
                    <button v-for="k in KINDS" :key="k.id" type="button" :aria-pressed="kind === k.id" @click="kind = k.id; cursor = 0">{{ k.label }} {{ count(k.id) }}</button>
                </div>
                <span class="omx-grow"></span>
                <span class="omx-stamp">J K to move · Y yes · N no · O to look</span>
            </div>
            <ul v-if="items.length" class="omx-rows" data-testid="omx-queue">
                <li v-for="(item, i) in items" :key="item.key" :class="{ cursor: i === cursor }" :data-testid="`omx-item-${item.key}`" @mousemove="cursor = i">
                    <span class="omx-chip" :class="item.kind === 'link' ? 'accent' : item.kind === 'track' ? 'tracked' : ''">{{ item.tag }}</span>
                    <div class="omx-row-main"><strong>{{ item.title }}</strong><small class="wrap">{{ item.detail }}</small></div>
                    <div class="omx-row-acts">
                        <button v-if="item.peek" class="omx-btn quiet sm" type="button" @click="omx.peekId.value = item.peek">Look</button>
                        <button class="omx-btn sm primary" type="button" :disabled="!!omx.busy.value" @click="item.yes()">{{ item.yesLabel }}</button>
                        <button class="omx-btn sm" type="button" :disabled="!!omx.busy.value" @click="item.no()">{{ item.noLabel }}</button>
                    </div>
                </li>
            </ul>
            <div v-else class="omx-empty"><strong>{{ omx.loaded.value ? 'Nothing to decide' : 'Reading…' }}</strong>{{ omx.loaded.value ? 'New suggestions arrive as the engine reads more messages.' : '' }}</div>
        </section>

        <!-- ── mentions ── -->
        <section v-else-if="tab === 'mentions'" class="omx-card">
            <div class="omx-toolbar">
                <strong>Names being watched</strong>
                <div class="omx-chips omx-grow"><span v-for="alias in omx.radarAliases.value" :key="String(alias)" class="omx-chip warn">{{ alias }}</span><span v-if="!omx.radarAliases.value.length" class="omx-dim">none: add a watchlist to start</span></div>
            </div>
            <div v-if="omx.radarAlerts.value.length" data-testid="omx-mentions">
                <div v-for="(alert, i) in omx.radarAlerts.value" :key="i" class="omx-msg">
                    <div class="omx-msg-head"><strong>{{ alert.author_display || 'someone' }}</strong><span>{{ alert.channel_label }}</span><span :title="omxDateTime(alert.occurred_at)">{{ omxAgo(alert.occurred_at, omx.now.value) }}</span><span class="omx-chip warn">{{ alert.matched_alias }}</span></div>
                    <div class="omx-msg-text">{{ alert.snippet }}</div>
                </div>
            </div>
            <div v-else class="omx-empty"><strong>No mention lately</strong>When a watched name comes up in a message, it is listed here.</div>
        </section>

        <!-- ── watchlists ── -->
        <div v-else class="omx-grid">
            <section class="omx-card">
                <div class="omx-card-head"><h2>Watchlists</h2><span class="omx-sub">words that raise a mention when someone writes them</span></div>
                <ul v-if="omx.watchlists.value.length" class="omx-rows" data-testid="omx-watchlists">
                    <li v-for="w in omx.watchlists.value" :key="w.watch_id">
                        <div class="omx-row-main"><strong>{{ w.label || w.terms }}</strong><small class="wrap">{{ w.terms }}<template v-if="w.person_display"> · about {{ w.person_display }}</template></small></div>
                        <span class="omx-chip" :class="w.notify ? 'warn' : ''">{{ w.notify ? 'messages you' : 'briefing only' }}</span>
                        <button class="omx-btn quiet sm icon" type="button" :aria-label="`Remove ${w.label || w.terms}`" @click="remove(w)"><OmniscienceIcon name="trash" /></button>
                    </li>
                </ul>
                <div v-else class="omx-empty"><strong>No watchlist yet</strong>Add a name or a phrase and every message that uses it is flagged.</div>
            </section>
            <form class="omx-card" @submit.prevent="add()">
                <div class="omx-card-head"><h2>Watch for something</h2></div>
                <div class="omx-card-body omx-stack">
                    <label class="omx-field"><span>Name it</span><input v-model="draft.label" class="omx-input" maxlength="80" placeholder="e.g. My name" /></label>
                    <label class="omx-field"><span>Words, separated by commas</span><input v-model="draft.terms" class="omx-input" maxlength="400" placeholder="klives, klive, k-man" data-testid="omx-watch-terms" /></label>
                    <label class="omx-rowflex"><input v-model="draft.notify" class="omx-check" type="checkbox" /> Message me when it comes up (otherwise it waits for the briefing)</label>
                    <button class="omx-btn primary" type="submit" :disabled="!draft.terms.trim() || !!omx.busy.value">Start watching</button>
                </div>
            </form>
        </div>
    </div>
</template>

<script setup lang="ts">
import { omxAgo, omxDateTime } from '~/scripts/omniscienceConsole';

/**
 * Everything the engine wants a human answer to, in one queue that can be cleared from the
 * keyboard; the mentions of watched names; and the watchlists that produce them.
 */
type Kind = 'all' | 'track' | 'link' | 'merge';
const KINDS: { id: Kind; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'link', label: 'Same person?' }, { id: 'track', label: 'Track?' }, { id: 'merge', label: 'Same thing?' }];

const omx = useOmx();
const tabQuery = omx.query('tab');
const tab = computed(() => (tabQuery.value === 'mentions' || tabQuery.value === 'watch' ? tabQuery.value : 'decide'));
const kind = ref<Kind>('all');
const cursor = ref(0);
const draft = reactive({ label: '', terms: '', notify: true });

const all = computed(() => [
    ...omx.links.value.map(l => ({
        key: `link-${l.suggestion_id}`, kind: 'link' as const, tag: 'same person?', peek: String(l.person_id_a ?? ''),
        title: `${l.display_a || l.person_id_a} and ${l.display_b || l.person_id_b}`, detail: `${Math.round((l.score ?? 0) * 100)}% alike · ${l.reason ?? ''}`,
        yesLabel: 'Same person', noLabel: 'Different', yes: () => omx.resolveLink(l.suggestion_id, 'accept'), no: () => omx.resolveLink(l.suggestion_id, 'reject'),
    })),
    ...omx.suggestions.value.map(s => ({
        key: `track-${s.person_id}`, kind: 'track' as const, tag: 'track?', peek: String(s.person_id),
        title: String(s.display_name || s.person_id), detail: (s.reasons ?? []).join(' · '),
        yesLabel: 'Track', noLabel: 'Not now', yes: () => omx.trackSuggestion(s.person_id), no: () => omx.dismissSuggestion(s.person_id),
    })),
    ...omx.merges.value.map(m => ({
        key: `merge-${m.suggestion_id}`, kind: 'merge' as const, tag: 'same thing?', peek: '',
        title: `${m.entity_a} and ${m.entity_b}`, detail: `${m.kind} in ${m.owner_display}'s world · ${m.reason ?? ''}`,
        yesLabel: 'Same thing', noLabel: 'Different', yes: () => omx.resolveMerge(m.suggestion_id, 'accept'), no: () => omx.resolveMerge(m.suggestion_id, 'reject'),
    })),
]);
const items = computed(() => (kind.value === 'all' ? all.value : all.value.filter(i => i.kind === kind.value)));
const count = (id: Kind) => (id === 'all' ? all.value.length : all.value.filter(i => i.kind === id).length);

function setTab(next: string) { omx.patchQuery({ tab: next === 'decide' ? undefined : next }); }
async function add() {
    if (await omx.addWatch({ label: draft.label.trim(), terms: draft.terms.trim(), notify: draft.notify })) { draft.label = ''; draft.terms = ''; }
}
async function remove(w: any) {
    if (await omx.confirm({ title: 'Stop watching?', text: `“${w.label || w.terms}” no longer raises mentions.`, yes: 'Stop watching', danger: true })) await omx.removeWatch(w.watch_id);
}

function onKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (tab.value !== 'decide' || omx.paletteOpen.value || omx.dialog.value || omx.peekId.value || event.ctrlKey || event.metaKey || event.altKey) return;
    if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
    const item = items.value[cursor.value];
    switch (event.key.toLowerCase()) {
        case 'j': case 'arrowdown': event.preventDefault(); cursor.value = Math.min(items.value.length - 1, cursor.value + 1); break;
        case 'k': case 'arrowup': event.preventDefault(); cursor.value = Math.max(0, cursor.value - 1); break;
        case 'y': if (item) void item.yes(); break;
        case 'n': if (item) void item.no(); break;
        case 'o': if (item?.peek) omx.peekId.value = item.peek; break;
        default: return;
    }
}
// Deciding an item removes it; the cursor stays where it was, on the next one.
watch(() => items.value.length, n => { cursor.value = Math.max(0, Math.min(cursor.value, n - 1)); });
onMounted(() => { window.addEventListener('keydown', onKey); void omx.refreshSlow(); });
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>
