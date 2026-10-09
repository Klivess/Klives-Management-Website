<template>
    <div class="pe" :class="{ readonly: !editable }">
        <!-- Services -->
        <aside class="pe-rail" aria-label="Services">
            <label class="ot-search pe-search">
                <span class="glyph" aria-hidden="true"><AccessIcon name="search" :size="13" /></span>
                <input v-model="search" class="ot-input" type="search" placeholder="Search permissions" aria-label="Search permissions" />
            </label>
            <div class="pe-services" role="tablist" aria-orientation="vertical">
                <button type="button" role="tab" class="pe-service" :aria-selected="selected === '*'" @click="selected = '*'">
                    <span class="pe-service-name">Overview</span>
                    <span class="pe-service-count">{{ effectiveCount }}<small>/{{ totalCount }}</small></span>
                </button>
                <button v-for="s in serviceStats" :key="s.key" type="button" role="tab" class="pe-service"
                        :class="{ some: s.effective > 0, all: s.effective === s.total, dim: search && !s.matches }"
                        :aria-selected="selected === s.key" @click="selected = s.key">
                    <span class="pe-service-name">{{ s.name }}</span>
                    <span class="pe-service-count">{{ s.effective }}<small>/{{ s.total }}</small></span>
                    <span class="pe-service-bar" aria-hidden="true"><i :style="{ width: `${(s.effective / s.total) * 100}%` }"></i></span>
                </button>
            </div>
        </aside>

        <section class="pe-main">
            <!-- Overview: everything held, by service and tier -->
            <template v-if="selected === '*' && !search">
                <div class="pe-head">
                    <div>
                        <h3>All permissions</h3>
                        <p class="pe-sub">{{ effectiveCount }} of {{ totalCount }} held{{ impliedOnlyCount ? ` · ${impliedOnlyCount} included through another permission` : '' }}.</p>
                    </div>
                    <div v-if="editable && copySources.length" class="pe-copy">
                        <label class="pe-sub" for="pe-copy">Copy from</label>
                        <select id="pe-copy" v-model="copyFrom" class="ot-select auto" :disabled="copying" @change="copyGrants">
                            <option value="">a profile…</option>
                            <option v-for="p in copySources" :key="p.userId" :value="p.userId">{{ p.name }}</option>
                        </select>
                    </div>
                </div>
                <div class="pe-tiers" aria-hidden="true">
                    <span v-for="t in TIERS" :key="t.value" class="km-tier" :class="t.tone">{{ t.short }} {{ t.name }}</span>
                    <span class="pe-sub">— {{ TIERS[0].blurb.toLowerCase() }} → {{ TIERS[4].blurb.toLowerCase() }}</span>
                </div>
                <div class="pe-matrix">
                    <button v-for="s in serviceStats" :key="s.key" type="button" class="pe-mrow" @click="selected = s.key">
                        <span class="pe-mname">{{ s.name }}</span>
                        <span class="pe-mtiers">
                            <span v-for="t in TIERS" :key="t.value" class="pe-mcell" :class="[t.tone, cellState(s.key, t.value)]"
                                  :title="`${t.name}: ${cellText(s.key, t.value)}`">{{ cellText(s.key, t.value) }}</span>
                        </span>
                        <AccessIcon name="chevron" :size="14" />
                    </button>
                </div>
            </template>

            <!-- One service (or search results across all) -->
            <template v-else>
                <div class="pe-head">
                    <div>
                        <h3>{{ search ? `Results for “${search}”` : currentService?.name }}</h3>
                        <p class="pe-sub">
                            <template v-if="search">{{ shownPermissions.length }} permission{{ shownPermissions.length === 1 ? '' : 's' }}</template>
                            <template v-else-if="currentStats">{{ currentStats.effective }} of {{ currentStats.total }} held</template>
                        </p>
                    </div>
                    <div v-if="editable && !search && currentService" class="pe-bulk">
                        <span class="pe-sub">Set to</span>
                        <div class="ot-segment sm" role="group" aria-label="Grant this service up to a tier">
                            <button type="button" :aria-pressed="serviceLevel === 0" @click="setServiceLevel(0)">None</button>
                            <button v-for="t in serviceTiers" :key="t.value" type="button" :aria-pressed="serviceLevel === t.value"
                                    :title="`Every ${currentService.name} permission up to ${t.name}`" @click="setServiceLevel(t.value)">{{ t.name }}</button>
                        </div>
                    </div>
                </div>

                <div v-for="group in groups" :key="group.key" class="pe-area">
                    <h4 class="pe-area-title">
                        <span v-if="search" class="pe-area-service">{{ group.service }} ·</span> {{ group.area }}
                    </h4>
                    <div v-for="perm in group.permissions" :key="perm.key" class="pe-perm" :class="[stateOf(perm.key), { locked: lockedReason(perm.key) }]">
                        <button type="button" class="km-switch" role="switch" :aria-checked="isDirect(perm.key)"
                                :aria-label="perm.title" :disabled="!editable || !!lockedReason(perm.key)"
                                :title="lockedReason(perm.key) || ''" @click="toggle(perm.key)"></button>

                        <div class="pe-perm-main">
                            <div class="pe-perm-title">
                                <strong>{{ perm.title }}</strong>
                                <span class="km-tier" :class="tierMeta(perm.tier).tone">{{ tierMeta(perm.tier).short }} {{ perm.tier }}</span>
                                <span v-if="perm.sensitive" class="ot-chip warn pe-badge" title="Private data, money or credentials">Sensitive</span>
                                <span v-if="perm.ownerGrantOnly" class="ot-chip pe-badge" title="Only Klives can hand this out">Owner-only</span>
                            </div>
                            <p class="pe-perm-desc">{{ perm.description }}</p>
                            <div class="pe-perm-meta">
                                <code class="km-key">{{ perm.key }}</code>
                                <span v-if="!isDirect(perm.key) && implied.get(perm.key)" class="pe-included">
                                    Included with “{{ titleOf(implied.get(perm.key)!) }}”
                                </span>
                                <span v-if="usageText(perm.key)" class="pe-usage" :class="usageTone(perm.key)">{{ usageText(perm.key) }}</span>
                                <button v-if="perm.routes && perm.routes.length" type="button" class="pe-routes-btn"
                                        :aria-expanded="openRoutes.has(perm.key)" @click="toggleRoutes(perm.key)">
                                    <AccessIcon name="route" :size="12" /> {{ perm.routes.length }} route{{ perm.routes.length === 1 ? '' : 's' }}
                                </button>
                            </div>
                            <ul v-if="openRoutes.has(perm.key) && perm.routes" class="pe-routes">
                                <li v-for="r in perm.routes" :key="`${r.method}${r.path}`">
                                    <span class="pe-method" :class="(r.method || r.kind || '').toLowerCase()">{{ r.kind === 'refines' ? 'IN' : r.kind === 'websocket' ? 'WS' : r.method }}</span>
                                    <code>{{ r.path }}</code>
                                </li>
                            </ul>
                        </div>

                        <div v-if="isDirect(perm.key)" class="pe-expiry">
                            <select v-if="editable && !lockedReason(perm.key)" class="ot-select auto pe-expiry-select" :value="expiryChoice(perm.key)"
                                    :aria-label="`How long ${perm.title} lasts`" @change="setExpiry(perm.key, ($event.target as HTMLSelectElement).value)">
                                <option value="never">Permanent</option>
                                <option v-if="expiryChoice(perm.key) === 'current'" value="current">{{ expiryLabel(perm.key) }}</option>
                                <option value="1h">1 hour</option>
                                <option value="1d">1 day</option>
                                <option value="7d">1 week</option>
                                <option value="30d">30 days</option>
                            </select>
                            <span v-else-if="grantOf(perm.key)?.expiresUtc" class="ot-chip violet">{{ expiryLabel(perm.key) }}</span>
                        </div>
                    </div>
                </div>
                <OmniTraderStateBlock v-if="!groups.length" kind="filtered" title="No permissions match" compact />
            </template>
        </section>

        <!-- What saving would change -->
        <Transition name="pe-bar">
            <div v-if="editable && showDiffBar && diff.total" class="pe-diffbar" role="region" aria-label="Unsaved permission changes">
                <div class="pe-diff-text">
                    <strong>{{ diff.total }} unsaved change{{ diff.total === 1 ? '' : 's' }}</strong>
                    <span class="pe-diff-counts">
                        <span v-if="diff.added.length" class="add">+{{ diff.added.length }}</span>
                        <span v-if="diff.removed.length" class="del">−{{ diff.removed.length }}</span>
                        <span v-if="diff.changed.length" class="chg">~{{ diff.changed.length }}</span>
                    </span>
                    <span v-if="criticalAdded.length" class="pe-diff-warn" :title="criticalAdded.map(titleOf).join(', ')">
                        <AccessIcon name="warning" :size="13" /> {{ criticalAdded.length }} critical
                    </span>
                </div>
                <label class="pe-diff-expiry">
                    New permissions last
                    <select v-model="newExpiry" class="ot-select auto">
                        <option value="never">Permanently</option>
                        <option value="1h">1 hour</option>
                        <option value="1d">1 day</option>
                        <option value="7d">1 week</option>
                        <option value="30d">30 days</option>
                    </select>
                </label>
                <div class="pe-diff-actions">
                    <button type="button" class="ot-btn ghost" :disabled="saving" @click="$emit('discard')">Discard</button>
                    <button type="button" class="ot-btn primary" :disabled="saving" @click="$emit('save')">{{ saving ? 'Saving…' : 'Save changes' }}</button>
                </div>
            </div>
        </Transition>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CatalogPermission, GrantDraft, PermissionCatalogPayload, PermissionUsageRow } from '~/scripts/profilesApi';
import { profilesApi } from '~/scripts/profilesApi';
import { relTime, TIERS, tierMeta, untilTime } from '~/scripts/profileFormat';

const props = withDefaults(defineProps<{
    catalog: PermissionCatalogPayload;
    grants: GrantDraft[];
    baseline: GrantDraft[];
    editable?: boolean;
    saving?: boolean;
    /** Delegation: the owner may hand out anything; anyone else only keys they hold, never owner-only ones. */
    actorIsOwner?: boolean;
    actorHolds?: (key: string) => boolean;
    usage?: Map<string, PermissionUsageRow> | null;
    copySources?: { userId: string; name: string }[];
    /** Off when the editor is one step of a larger form (the new-profile wizard). */
    showDiffBar?: boolean;
    /** Expiry given to permissions switched on (the wizard sets it from its own control). */
    defaultExpiry?: 'never' | '1h' | '1d' | '7d' | '30d';
}>(), { editable: false, saving: false, actorIsOwner: false, usage: null, copySources: () => [], actorHolds: () => false, showDiffBar: true, defaultExpiry: 'never' });

const emit = defineEmits<{ 'update:grants': [grants: GrantDraft[]]; save: []; discard: [] }>();

const search = ref('');
const selected = ref<string>('*');
const openRoutes = ref(new Set<string>());
const newExpiry = ref<'never' | '1h' | '1d' | '7d' | '30d'>(props.defaultExpiry);
watch(() => props.defaultExpiry, value => { newExpiry.value = value; });
const copyFrom = ref('');
const copying = ref(false);

// ── catalog indexes ──
const byKey = computed(() => {
    const map = new Map<string, CatalogPermission & { service: string; serviceKey: string }>();
    for (const s of props.catalog.services) for (const p of s.permissions) map.set(p.key, { ...p, service: s.name, serviceKey: s.key });
    return map;
});
const totalCount = computed(() => byKey.value.size);

// ── what is held ──
const direct = computed(() => new Map(props.grants.map(g => [g.key, g])));

/** Keys held only because another held key implies them → the key that brings them in. */
const implied = computed(() => {
    const via = new Map<string, string>();
    const queue = [...direct.value.keys()];
    while (queue.length) {
        const key = queue.shift()!;
        for (const next of byKey.value.get(key)?.implies ?? []) {
            if (direct.value.has(next) || via.has(next)) continue;
            via.set(next, direct.value.has(key) ? key : via.get(key) ?? key);
            queue.push(next);
        }
    }
    return via;
});

const isDirect = (key: string) => direct.value.has(key);
const isHeld = (key: string) => direct.value.has(key) || implied.value.has(key);
const grantOf = (key: string) => direct.value.get(key);
const titleOf = (key: string) => byKey.value.get(key)?.title ?? key;
const effectiveCount = computed(() => [...byKey.value.keys()].filter(isHeld).length);
const impliedOnlyCount = computed(() => implied.value.size);

function stateOf(key: string) {
    return isDirect(key) ? 'on' : implied.value.has(key) ? 'implied' : 'off';
}

function lockedReason(key: string): string {
    if (!props.editable || props.actorIsOwner) return '';
    const p = byKey.value.get(key);
    if (p?.ownerGrantOnly) return 'Only Klives can hand this out.';
    if (!props.actorHolds(key)) return "You can't hand out a permission you don't have.";
    return '';
}

// ── services ──
const serviceStats = computed(() => props.catalog.services.map(s => {
    const q = search.value.trim().toLowerCase();
    return {
        key: s.key,
        name: s.name,
        total: s.permissions.length,
        effective: s.permissions.filter(p => isHeld(p.key)).length,
        matches: !q || s.permissions.some(p => matchesSearch(p, s.name, q)),
    };
}));
const currentService = computed(() => props.catalog.services.find(s => s.key === selected.value) ?? null);
const currentStats = computed(() => serviceStats.value.find(s => s.key === selected.value) ?? null);
const serviceTiers = computed(() => TIERS.filter(t => currentService.value?.permissions.some(p => p.tierValue === t.value)));

function matchesSearch(p: CatalogPermission, service: string, q: string) {
    return p.title.toLowerCase().includes(q) || p.key.includes(q) || p.description.toLowerCase().includes(q)
        || p.area.toLowerCase().includes(q) || service.toLowerCase().includes(q);
}

const shownPermissions = computed(() => {
    const q = search.value.trim().toLowerCase();
    if (q) return props.catalog.services.flatMap(s => s.permissions.filter(p => matchesSearch(p, s.name, q)).map(p => ({ p, service: s.name })));
    return (currentService.value?.permissions ?? []).map(p => ({ p, service: currentService.value!.name }));
});

/** Areas in order of their lowest tier, permissions by tier then title. */
const groups = computed(() => {
    const map = new Map<string, { key: string; area: string; service: string; minTier: number; permissions: CatalogPermission[] }>();
    for (const { p, service } of shownPermissions.value) {
        const key = `${service}/${p.area}`;
        const g = map.get(key) ?? { key, area: p.area, service, minTier: 9, permissions: [] };
        g.permissions.push(p);
        g.minTier = Math.min(g.minTier, p.tierValue);
        map.set(key, g);
    }
    return [...map.values()]
        .sort((a, b) => a.service.localeCompare(b.service) || a.minTier - b.minTier || a.area.localeCompare(b.area))
        .map(g => ({ ...g, permissions: g.permissions.sort((a, b) => a.tierValue - b.tierValue || a.title.localeCompare(b.title)) }));
});

/** The highest tier this service is granted "through" (every key up to it held), or -1 if mixed. */
const serviceLevel = computed(() => {
    const perms = currentService.value?.permissions ?? [];
    if (!perms.length) return -1;
    const held = perms.filter(p => isDirect(p.key));
    if (!held.length) return 0;
    const top = Math.max(...held.map(p => p.tierValue));
    const exact = perms.every(p => (p.tierValue <= top) === isDirect(p.key));
    return exact ? top : -1;
});

function cellState(serviceKey: string, tier: number) {
    const perms = props.catalog.services.find(s => s.key === serviceKey)?.permissions.filter(p => p.tierValue === tier) ?? [];
    if (!perms.length) return 'na';
    const n = perms.filter(p => isHeld(p.key)).length;
    return n === 0 ? 'none' : n === perms.length ? 'full' : 'part';
}

function cellText(serviceKey: string, tier: number) {
    const perms = props.catalog.services.find(s => s.key === serviceKey)?.permissions.filter(p => p.tierValue === tier) ?? [];
    if (!perms.length) return '·';
    return `${perms.filter(p => isHeld(p.key)).length}/${perms.length}`;
}

// ── editing ──
function expiryFor(choice: string): string | null {
    const hours: Record<string, number> = { '1h': 1, '1d': 24, '7d': 24 * 7, '30d': 24 * 30 };
    return hours[choice] ? new Date(Date.now() + hours[choice] * 3_600_000).toISOString() : null;
}

function commit(next: GrantDraft[]) {
    emit('update:grants', next.sort((a, b) => a.key.localeCompare(b.key)));
}

function toggle(key: string) {
    if (!props.editable || lockedReason(key)) return;
    if (isDirect(key)) commit(props.grants.filter(g => g.key !== key));
    else commit([...props.grants, { key, expiresUtc: expiryFor(newExpiry.value), note: null }]);
}

function setServiceLevel(level: number) {
    const service = currentService.value;
    if (!service) return;
    const next = props.grants.filter(g => byKey.value.get(g.key)?.serviceKey !== service.key || lockedReason(g.key));
    for (const p of service.permissions) {
        if (p.tierValue > level || lockedReason(p.key)) continue;
        next.push(direct.value.get(p.key) ?? { key: p.key, expiresUtc: expiryFor(newExpiry.value), note: null });
    }
    commit(next);
}

function expiryChoice(key: string) {
    return grantOf(key)?.expiresUtc ? 'current' : 'never';
}

function expiryLabel(key: string) {
    const expires = grantOf(key)?.expiresUtc;
    return expires ? `Expires ${untilTime(expires)}` : 'Permanent';
}

function setExpiry(key: string, choice: string) {
    if (choice === 'current') return;
    commit(props.grants.map(g => (g.key === key ? { ...g, expiresUtc: expiryFor(choice) } : g)));
}

function toggleRoutes(key: string) {
    const next = new Set(openRoutes.value);
    if (next.has(key)) next.delete(key); else next.add(key);
    openRoutes.value = next;
}

async function copyGrants() {
    const id = copyFrom.value;
    if (!id) return;
    copying.value = true;
    try {
        const source = await profilesApi.get(id);
        const keys = source.isOwner ? [...byKey.value.keys()] : (source.grants ?? []).filter(g => g.active).map(g => g.key);
        const kept = props.grants.filter(g => lockedReason(g.key));
        const copied = keys.filter(k => byKey.value.has(k) && !lockedReason(k) && !kept.some(g => g.key === k))
            .map(k => direct.value.get(k) ?? { key: k, expiresUtc: expiryFor(newExpiry.value), note: null });
        commit([...kept, ...copied]);
    } finally {
        copying.value = false;
        copyFrom.value = '';
    }
}

// ── usage ──
function usageText(key: string) {
    const u = props.usage?.get(key);
    if (!u) return isDirect(key) && props.usage ? 'never used' : '';
    if (!u.count && !u.denied) return isDirect(key) ? 'never used' : '';
    const parts = [];
    if (u.count) parts.push(`used ${u.count.toLocaleString()}×${u.lastUsedMs ? `, ${relTime(u.lastUsedMs)}` : ''}`);
    if (u.denied) parts.push(`${u.denied} refused`);
    return parts.join(' · ');
}

function usageTone(key: string) {
    const u = props.usage?.get(key);
    if (u?.denied && !isHeld(key)) return 'warn';
    if (isDirect(key) && (!u || !u.count)) return 'stale';
    return '';
}

// ── diff against what is saved ──
const diff = computed(() => {
    const before = new Map(props.baseline.map(g => [g.key, g]));
    const added = props.grants.filter(g => !before.has(g.key)).map(g => g.key);
    const removed = props.baseline.filter(g => !direct.value.has(g.key)).map(g => g.key);
    const changed = props.grants.filter(g => before.has(g.key) && (before.get(g.key)!.expiresUtc ?? null) !== (g.expiresUtc ?? null)).map(g => g.key);
    return { added, removed, changed, total: added.length + removed.length + changed.length };
});
const criticalAdded = computed(() => diff.value.added.filter(k => (byKey.value.get(k)?.tierValue ?? 0) >= 5));

defineExpose({ diff });

watch(search, q => { if (q && selected.value === '*') selected.value = ''; if (!q && selected.value === '') selected.value = '*'; });
</script>

<style scoped>
.pe {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: var(--ot-gutter);
    align-items: start;
    position: relative;
    padding-bottom: 8px;
}
@media (max-width: 900px) { .pe { grid-template-columns: minmax(0, 1fr); } }

/* rail */
.pe-rail {
    position: sticky;
    top: 100px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: calc(100vh - 120px);
}
@media (max-width: 900px) { .pe-rail { position: static; max-height: none; } }
.pe-search { width: 100%; min-width: 0; }
.pe-search input { width: 100%; }
.pe-services {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
    padding: 4px;
    border-radius: var(--ot-radius);
    border: 1px solid var(--ot-line);
    background: var(--ot-surface);
}
@media (max-width: 900px) {
    .pe-services { flex-direction: row; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
    .pe-service { flex: 0 0 auto; }
    .pe-service-bar { display: none !important; }
}
.pe-service {
    position: relative;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 8px 10px 10px !important;
    border: 0 !important;
    border-radius: 7px;
    background: none !important;
    color: var(--ot-text-2);
    text-align: left;
    cursor: pointer;
    font-size: 13px;
}
.pe-service:hover { background: rgba(255, 255, 255, 0.04) !important; color: var(--ot-text); }
.pe-service[aria-selected='true'] { background: var(--ot-accent-soft) !important; color: var(--ot-text); }
.pe-service.dim { opacity: 0.4; }
.pe-service-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pe-service-count { font-family: var(--ot-mono); font-size: 12px; color: var(--ot-muted); }
.pe-service.some .pe-service-count { color: var(--ot-text); }
.pe-service-count small { color: var(--ot-disabled); font-size: 10.5px; }
.pe-service-bar { position: absolute; left: 10px; right: 10px; bottom: 4px; height: 2px; border-radius: 2px; background: rgba(255, 255, 255, 0.05); display: block; }
.pe-service-bar i { display: block; height: 100%; border-radius: 2px; background: var(--ot-accent); }

/* main */
.pe-main { min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.pe-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.pe-head h3 { font-size: 17px; font-weight: 620; color: var(--ot-text); }
.pe-sub { font-size: 12.5px; color: var(--ot-muted); }
.pe-bulk, .pe-copy { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pe-bulk .ot-segment { max-width: 100%; overflow-x: auto; scrollbar-width: none; }
.pe-tiers { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }

.pe-matrix { display: flex; flex-direction: column; border: 1px solid var(--ot-line); border-radius: var(--ot-radius); overflow: hidden; background: var(--ot-surface); }
.pe-mrow {
    display: grid !important;
    grid-template-columns: minmax(120px, 200px) minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 8px 12px !important;
    border: 0 !important;
    border-radius: 0 !important;
    border-top: 1px solid var(--ot-line) !important;
    background: none !important;
    color: var(--ot-text-2);
    text-align: left;
    cursor: pointer;
}
.pe-mrow:first-child { border-top: 0 !important; }
.pe-mrow:hover { background: rgba(255, 255, 255, 0.03) !important; color: var(--ot-text); }
.pe-mname { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pe-mtiers { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; }
.pe-mcell {
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    font-family: var(--ot-mono);
    font-size: 10.5px;
    color: var(--ot-disabled);
    background: rgba(255, 255, 255, 0.025);
}
.pe-mcell.na { background: none; }
.pe-mcell.part { color: var(--ot-text-2); background: rgba(109, 220, 79, 0.08); }
.pe-mcell.full.glance { color: #9fb39a; background: rgba(159, 179, 154, 0.18); }
.pe-mcell.full.read { color: var(--ot-info); background: rgba(99, 200, 234, 0.2); }
.pe-mcell.full.act { color: var(--ot-positive); background: rgba(78, 201, 138, 0.2); }
.pe-mcell.full.manage { color: var(--ot-warning); background: rgba(240, 180, 41, 0.2); }
.pe-mcell.full.critical { color: var(--ot-negative); background: rgba(255, 123, 123, 0.2); }

.pe-area { display: flex; flex-direction: column; gap: 6px; }
.pe-area-title { font-size: 11px; letter-spacing: 1.1px; text-transform: uppercase; color: var(--ot-muted); font-weight: 700; margin: 6px 0 0; }
.pe-area-service { color: var(--ot-text-2); }

.pe-perm {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 12px;
    align-items: flex-start;
    padding: 12px 14px;
    border-radius: var(--ot-radius);
    border: 1px solid var(--ot-line);
    background: var(--ot-surface);
    transition: border-color var(--ot-fast), background var(--ot-fast);
}
.pe-perm.on { border-color: rgba(109, 220, 79, 0.35); background: linear-gradient(90deg, rgba(109, 220, 79, 0.06), transparent 40%), var(--ot-surface); }
.pe-perm.implied { border-style: dashed; }
.pe-perm.locked .km-switch { cursor: not-allowed; }
.pe-perm .km-switch { margin-top: 2px; }
.pe-perm.implied .km-switch { border-style: dashed; }
.pe-perm-main { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.pe-perm-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pe-perm-title strong { font-size: 14px; font-weight: 600; color: var(--ot-text); }
.pe-badge { height: 18px; font-size: 10px; padding: 0 6px; }
.pe-perm-desc { font-size: 12.5px; color: var(--ot-text-2); line-height: 18px; }
.pe-perm-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 11.5px; }
.pe-included { color: var(--ot-info); }
.pe-usage { color: var(--ot-muted); }
.pe-usage.stale { color: var(--ot-warning); }
.pe-usage.warn { color: var(--ot-negative); }
.pe-routes-btn {
    display: inline-flex !important;
    align-items: center;
    gap: 4px;
    padding: 1px 7px !important;
    border-radius: 999px;
    border: 1px solid var(--ot-line-strong) !important;
    background: none !important;
    color: var(--ot-text-2);
    font-size: 11px;
    cursor: pointer;
}
.pe-routes-btn[aria-expanded='true'] { color: var(--ot-accent); border-color: var(--ot-accent) !important; }
.pe-routes {
    list-style: none;
    margin: 4px 0 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(5, 7, 4, 0.45);
    display: flex;
    flex-direction: column;
    gap: 3px;
}
.pe-routes li { display: flex; align-items: center; gap: 8px; min-width: 0; }
.pe-routes code { font-family: var(--ot-mono); font-size: 11.5px; color: var(--ot-text-2); overflow-wrap: anywhere; }
.pe-method {
    flex: 0 0 auto;
    min-width: 42px;
    text-align: center;
    font-family: var(--ot-mono);
    font-size: 9.5px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 4px;
    color: var(--ot-info);
    background: var(--ot-info-soft);
}
.pe-method.post, .pe-method.put { color: var(--ot-warning); background: var(--ot-warning-soft); }
.pe-method.ws { color: var(--ot-violet); background: var(--ot-violet-soft); }
.pe-method.refines { color: var(--ot-muted); background: rgba(255, 255, 255, 0.05); }
.pe-expiry { display: flex; align-items: center; }
.pe-expiry-select { height: var(--ot-control-sm); font-size: 11.5px; }

/* diff bar */
.pe-diffbar {
    position: sticky;
    bottom: 12px;
    grid-column: 1 / -1;
    z-index: var(--ot-z-sticky);
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    padding: 10px 12px 10px 16px;
    border-radius: 12px;
    border: 1px solid var(--ot-line-strong);
    background: rgba(25, 29, 22, 0.97);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(6px);
}
.pe-diff-text { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pe-diff-text strong { color: var(--ot-text); font-size: 13px; }
.pe-diff-counts { display: inline-flex; gap: 6px; font-family: var(--ot-mono); font-size: 12px; }
.pe-diff-counts .add { color: var(--ot-positive); }
.pe-diff-counts .del { color: var(--ot-negative); }
.pe-diff-counts .chg { color: var(--ot-violet); }
.pe-diff-warn { display: inline-flex; align-items: center; gap: 4px; color: var(--ot-negative); font-size: 12px; }
.pe-diff-expiry { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ot-muted); }
.pe-diff-actions { margin-left: auto; display: flex; gap: 8px; }

.pe-bar-enter-active, .pe-bar-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.pe-bar-enter-from, .pe-bar-leave-to { opacity: 0; transform: translateY(10px); }

.readonly .pe-perm .km-switch { display: none; }
.readonly .pe-perm { grid-template-columns: minmax(0, 1fr) auto; }
</style>
