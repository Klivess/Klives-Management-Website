<template>
    <div data-testid="omx-people">
        <OmniscienceCompare v-if="comparing" :left="comparing[0]" :right="comparing[1]" style="margin-bottom: 12px" @close="omx.patchQuery({ compare: undefined })" />

        <section class="omx-card">
            <div class="omx-toolbar">
                <div class="omx-find" style="flex: 1 1 240px; max-width: 420px; height: 32px">
                    <OmniscienceIcon name="search" />
                    <input ref="searchEl" v-model="f.q" class="omx-grow" style="border: 0; outline: none; background: transparent; height: 100%" type="search" placeholder="Name, handle or alias" aria-label="Filter people" data-testid="omx-people-search" />
                    <kbd>/</kbd>
                </div>
                <div class="omx-seg" role="group" aria-label="Tier">
                    <button v-for="t in TIERS" :key="t.value" type="button" :aria-pressed="f.tier === t.value" :title="t.help" @click="f.tier = t.value">{{ t.label }}</button>
                </div>
                <button class="omx-btn" :class="{ on: f.pinned }" type="button" :aria-pressed="f.pinned" @click="f.pinned = !f.pinned"><span class="omx-star" :class="{ on: f.pinned }" style="width: auto; height: auto">★</span> Pinned</button>
                <span class="omx-grow"></span>
                <span class="omx-stamp" data-testid="omx-people-total">{{ range }}</span>
                <div class="omx-pager">
                    <button class="omx-btn sm icon" type="button" aria-label="Previous page" :disabled="f.page === 0 || loading" @click="f.page--"><OmniscienceIcon name="back" /></button>
                    <button class="omx-btn sm icon" type="button" aria-label="Next page" :disabled="!hasMore || loading" @click="f.page++"><OmniscienceIcon name="go" /></button>
                </div>
            </div>

            <div v-if="picked.length" class="omx-bulk" data-testid="omx-bulk">
                <strong>{{ picked.length }} selected</strong>
                <span class="omx-dim">set tier</span>
                <button v-for="t in OMX_TIERS" :key="t" class="omx-btn sm" type="button" :disabled="!!omx.busy.value" @click="bulkTier(t)">{{ t }}</button>
                <button class="omx-btn sm" type="button" :disabled="picked.length !== 2" :title="picked.length === 2 ? 'Side by side' : 'Pick exactly two people'" data-testid="omx-compare" @click="compare()"><OmniscienceIcon name="compare" /> Compare</button>
                <button class="omx-btn sm danger" type="button" :disabled="picked.length !== 2 || !!omx.busy.value" :title="picked.length === 2 ? 'They are the same person' : 'Pick exactly two people'" data-testid="omx-merge" @click="merge()"><OmniscienceIcon name="merge" /> Same person…</button>
                <span class="omx-grow"></span>
                <button class="omx-btn quiet sm" type="button" @click="picked = []">Clear</button>
            </div>

            <div v-if="activityNote" class="omx-note" style="margin: 10px 14px 0">{{ activityNote }}</div>
            <div v-if="error" class="omx-error" style="margin: 10px 14px" role="alert"><span class="omx-grow">{{ error }}</span><button class="omx-btn sm" type="button" @click="load()">Try again</button></div>

            <div class="omx-tablewrap">
                <table class="omx-table" data-testid="omx-people-table">
                    <thead>
                        <tr>
                            <th style="width: 34px"><input class="omx-check" type="checkbox" aria-label="Select everyone on this page" :checked="allPicked" @change="pickAll(($event.target as HTMLInputElement).checked)" /></th>
                            <th :aria-sort="f.sort === 'name' ? 'ascending' : undefined"><button type="button" @click="f.sort = 'name'">Person</button></th>
                            <th>Tier</th>
                            <th class="num" :aria-sort="f.sort === 'messages' ? 'descending' : undefined"><button type="button" @click="f.sort = 'messages'">Messages</button></th>
                            <th :aria-sort="f.sort === 'recent' ? 'descending' : undefined"><button type="button" @click="f.sort = 'recent'">Last active</button></th>
                            <th class="omx-hide-sm" style="width: 170px" :aria-sort="f.sort === 'completeness' ? 'descending' : undefined"><button type="button" @click="f.sort = 'completeness'">Dossier</button></th>
                            <th style="width: 40px"></th>
                        </tr>
                    </thead>
                    <tbody v-if="loading && !items.length">
                        <tr v-for="n in 8" :key="n"><td colspan="7"><div class="omx-skel" :style="{ width: `${40 + (n * 13) % 45}%` }"></div></td></tr>
                    </tbody>
                    <tbody v-else>
                        <tr v-for="(p, i) in items" :key="p.person_id" :class="{ cursor: i === cursor, picked: picked.includes(p.person_id) }" :data-testid="`omx-person-${p.person_id}`"
                            @click="peek(i)" @dblclick="omx.openPerson(p.person_id)">
                            <td @click.stop><input class="omx-check" type="checkbox" :aria-label="`Select ${p.display_name}`" :checked="picked.includes(p.person_id)" @change="pick(p.person_id)" /></td>
                            <td>
                                <div class="omx-person">
                                    <span class="omx-avatar" :class="p.tier">{{ omxInitials(p.display_name) }}</span>
                                    <div>
                                        <button class="omx-link" type="button" style="color: inherit; font-weight: 600" @click.stop="omx.openPerson(p.person_id)">{{ p.display_name || '(unnamed)' }}</button>
                                        <small>{{ omxHandle(p) }}<template v-if="(p.identities?.length ?? 0) > 1"> +{{ p.identities.length - 1 }}</template></small>
                                    </div>
                                </div>
                            </td>
                            <td @click.stop>
                                <select class="omx-select sm" :class="p.tier" :value="p.tier" :aria-label="`Tier of ${p.display_name}`" :title="OMX_TIER_HELP[p.tier]" @change="changeTier(p, ($event.target as HTMLSelectElement).value)">
                                    <option v-for="t in OMX_TIERS" :key="t" :value="t">{{ t }}</option>
                                </select>
                            </td>
                            <td class="num">{{ omxNum(p.message_count) }}</td>
                            <td class="omx-dim" :title="omxDateTime(p.last_message_at)">{{ omxAgo(p.last_message_at, omx.now.value) }}</td>
                            <td class="omx-hide-sm">
                                <div v-if="p.completeness != null" class="omx-rowflex" style="flex-wrap: nowrap"><div class="omx-meter omx-grow"><i :style="{ width: `${Math.round(p.completeness * 100)}%` }"></i></div><span class="omx-num omx-dim" style="width: 34px; text-align: right">{{ Math.round(p.completeness * 100) }}%</span></div>
                                <span v-else class="omx-faint">{{ p.profile_targeted ? 'profiling' : 'not profiled' }}</span>
                            </td>
                            <td @click.stop><button class="omx-star" :class="{ on: p.pinned }" type="button" :aria-label="p.pinned ? `Unpin ${p.display_name}` : `Pin ${p.display_name}`" :aria-pressed="!!p.pinned" @click="togglePin(p)">{{ p.pinned ? '★' : '☆' }}</button></td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-if="!loading && !items.length && !error" class="omx-empty"><strong>Nobody matches</strong>Try fewer letters, another tier, or switch “Pinned” off.</div>
            <div class="omx-card-foot"><span>Click a row to peek · double-click or Enter to open · ↑↓ to move · P to pin · X to select</span></div>
        </section>
    </div>
</template>

<script setup lang="ts">
import { OMX_TIERS, OMX_TIER_HELP, omxAgo, omxDateTime, omxErrorText, omxHandle, omxInitials, omxNum } from '~/scripts/omniscienceConsole';

/**
 * Everyone Omniscience knows, as a table that can be driven from the keyboard: filter, sort on the
 * server, peek at a row, change a tier in place, and act on a selection (tier, compare, merge).
 * Filters live in the link, so a filtered list can be bookmarked and comes back as it was.
 */
const PAGE = 50;
const TIERS = [
    { value: 'all', label: 'All', help: 'Everyone' },
    { value: 'tracked', label: 'Tracked', help: OMX_TIER_HELP.tracked },
    { value: 'watch', label: 'Watch', help: OMX_TIER_HELP.watch },
    { value: 'archive', label: 'Archive', help: OMX_TIER_HELP.archive },
];

const omx = useOmx();
const route = useRoute();
const f = reactive({
    q: String(route.query.q ?? ''), tier: String(route.query.tier ?? 'all'), sort: String(route.query.sort ?? 'messages'),
    pinned: route.query.pinned === '1', page: Math.max(0, Number(route.query.page ?? 0) || 0),
});
const items = ref<any[]>([]);
const total = ref(0);
const hasMore = ref(false);
const loading = ref(true);
const error = ref('');
const activity = ref<any>(null);
const cursor = ref(-1);
const picked = ref<string[]>([]);
const searchEl = ref<HTMLInputElement | null>(null);
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

const range = computed(() => (total.value ? `${omxNum(f.page * PAGE + 1)}–${omxNum(f.page * PAGE + items.value.length)} of ${omxNum(total.value)}` : loading.value ? 'reading…' : '0 people'));
const allPicked = computed(() => items.value.length > 0 && items.value.every(p => picked.value.includes(p.person_id)));
const activityNote = computed(() => {
    const a = activity.value;
    if (!a) return '';
    if (a.last_error) return 'Activity counts reported an error: message counts may be incomplete.';
    if (a.running) return 'Activity counts are being rebuilt in the background. The list is usable; counts catch up.';
    return '';
});
const comparing = computed(() => {
    const ids = String(route.query.compare ?? '').split(',').filter(Boolean);
    return ids.length === 2 ? ids as [string, string] : null;
});

async function load() {
    const mine = ++seq;
    loading.value = true; error.value = '';
    try {
        const params = new URLSearchParams({ limit: String(PAGE), offset: String(f.page * PAGE), tier: f.tier, sort: f.sort });
        if (f.q.trim()) params.set('search', f.q.trim());
        if (f.pinned) params.set('pinned', '1');
        const data = await omx.api.get('/omniscience/workspace/directory?' + params);
        if (mine !== seq) return;
        items.value = Array.isArray(data?.items) ? data.items : [];
        total.value = Number(data?.total ?? items.value.length);
        hasMore.value = !!data?.has_more;
        activity.value = data?.activity_counts ?? null;
        cursor.value = Math.min(cursor.value, items.value.length - 1);
    } catch (cause) {
        if (mine === seq) error.value = omxErrorText(cause, 'The people directory could not be read.');
    } finally { if (mine === seq) loading.value = false; }
}

function writeUrl() {
    omx.patchQuery({ q: f.q.trim() || undefined, tier: f.tier === 'all' ? undefined : f.tier, sort: f.sort === 'messages' ? undefined : f.sort, pinned: f.pinned ? '1' : undefined, page: f.page ? String(f.page) : undefined });
}
// A new filter starts again from the first page; typing waits until the fingers stop.
watch(() => [f.tier, f.sort, f.pinned], () => { f.page = 0; picked.value = []; writeUrl(); void load(); });
watch(() => f.page, () => { writeUrl(); void load(); });
watch(() => f.q, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { if (f.page !== 0) f.page = 0; else { writeUrl(); void load(); } }, 260);
});

function peek(i: number) { cursor.value = i; const p = items.value[i]; if (p) omx.peekId.value = p.person_id; }
function pick(id: string) { picked.value = picked.value.includes(id) ? picked.value.filter(x => x !== id) : [...picked.value, id]; }
function pickAll(on: boolean) { picked.value = on ? items.value.map(p => p.person_id) : []; }
const byId = (id: string) => items.value.find(p => p.person_id === id);

async function togglePin(p: any) {
    const pinned = await omx.togglePin(p);
    if (pinned === null) return;
    p.pinned = pinned;
    if (f.pinned && !pinned) items.value = items.value.filter(x => x.person_id !== p.person_id);
}
async function changeTier(p: any, tier: string) {
    if (await omx.setTier(p.person_id, tier)) { p.tier = tier; if (f.tier !== 'all' && f.tier !== tier) items.value = items.value.filter(x => x.person_id !== p.person_id); }
    else void load();
}
async function bulkTier(tier: string) {
    for (const id of [...picked.value]) {
        const p = byId(id);
        if (p && p.tier !== tier && !await omx.setTier(id, tier)) break;
        if (p) p.tier = tier;
    }
    picked.value = [];
    void load();
}
function compare() { if (picked.value.length === 2) omx.patchQuery({ compare: picked.value.join(',') }); }
async function merge() {
    const [a, b] = picked.value.map(byId);
    if (!a || !b) return;
    // The fuller record is kept; the other one's accounts and messages move to it.
    const [keep, drop] = Number(a.message_count ?? 0) >= Number(b.message_count ?? 0) ? [a, b] : [b, a];
    const sure = await omx.confirm({
        title: `Merge ${drop.display_name} into ${keep.display_name}?`,
        text: `They become one person: ${drop.display_name}'s accounts and messages move to ${keep.display_name}. This cannot be undone from here.`,
        yes: 'Merge them', danger: true,
    });
    if (!sure) return;
    if (await omx.mergePeople(keep.person_id, drop.person_id)) { picked.value = []; void load(); }
}

function onKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (omx.paletteOpen.value || omx.dialog.value || event.ctrlKey || event.metaKey || event.altKey) return;
    if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) { if (event.key === 'Escape') target.blur(); return; }
    if (event.key === '/') { event.preventDefault(); searchEl.value?.focus(); return; }
    if (!items.value.length) return;
    const p = items.value[cursor.value];
    switch (event.key) {
        case 'ArrowDown': case 'j': event.preventDefault(); cursor.value = Math.min(items.value.length - 1, cursor.value + 1); if (omx.peekId.value) peek(cursor.value); break;
        case 'ArrowUp': case 'k': event.preventDefault(); cursor.value = Math.max(0, cursor.value - 1); if (omx.peekId.value) peek(cursor.value); break;
        case 'Enter': if (p) { event.preventDefault(); omx.peekId.value = ''; omx.openPerson(p.person_id); } break;
        case ' ': if (p) { event.preventDefault(); omx.peekId.value = omx.peekId.value ? '' : p.person_id; } break;
        case 'p': if (p) void togglePin(p); break;
        case 'x': if (p) pick(p.person_id); break;
        default: return;
    }
    void nextTick(() => document.querySelector('.omx-table tr.cursor')?.scrollIntoView({ block: 'nearest' }));
}

onMounted(() => { void load(); window.addEventListener('keydown', onKey); });
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); if (timer) clearTimeout(timer); });
</script>
