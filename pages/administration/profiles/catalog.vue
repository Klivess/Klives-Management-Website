<template>
    <ProfilesShell :scope="catalogScope" :error="catalog.error.value" :loading="catalog.loading.value" refreshable @refresh="reload">
        <div class="ot-pagehead">
            <div>
                <h1>Permissions</h1>
                <p class="subtitle">Every permission there is, what tier of power it gives, and exactly which routes it unlocks.</p>
            </div>
        </div>

        <div v-if="audit && (audit.permissionsWithoutRoutes.length || audit.grantsForUnknownPermissions.length)" class="ot-banner warn" role="status">
            <span class="glyph" aria-hidden="true">!</span>
            <div>
                <strong>Self-check</strong>
                <span v-if="audit.permissionsWithoutRoutes.length">{{ audit.permissionsWithoutRoutes.length }} permission{{ audit.permissionsWithoutRoutes.length === 1 ? '' : 's' }} unlock no route ({{ audit.permissionsWithoutRoutes.map(p => p.key).join(', ') }}). </span>
                <span v-if="audit.grantsForUnknownPermissions.length">{{ audit.grantsForUnknownPermissions.length }} grant{{ audit.grantsForUnknownPermissions.length === 1 ? '' : 's' }} name retired permissions.</span>
            </div>
        </div>

        <div class="ot-kpis tight">
            <OmniTraderKpi label="Permissions" :value="String(total)" :loading="!catalog.catalog.value" :foot="`${services.length} services`" />
            <OmniTraderKpi v-for="t in tierCounts" :key="t.name" :label="t.name" :value="String(t.count)" :loading="!catalog.catalog.value" :foot="t.blurb" />
        </div>

        <div class="ot-filterbar">
            <label class="ot-search">
                <span class="glyph" aria-hidden="true"><AccessIcon name="search" :size="13" /></span>
                <input v-model="search" class="ot-input" type="search" placeholder="Search keys, titles or routes" aria-label="Search permissions" />
            </label>
            <div class="ot-segment sm" role="group" aria-label="Tier">
                <button type="button" :aria-pressed="tier === 0" @click="tier = 0">All tiers</button>
                <button v-for="t in TIERS" :key="t.value" type="button" :aria-pressed="tier === t.value" @click="tier = t.value">{{ t.name }}</button>
            </div>
            <span class="grow"></span>
            <span class="summary"><b>{{ shown.reduce((n, s) => n + s.permissions.length, 0) }}</b> shown</span>
        </div>

        <div class="cat-services">
            <OmniTraderCard v-for="s in shown" :key="s.key" :title="s.name" :subtitle="`${s.permissions.length} permission${s.permissions.length === 1 ? '' : 's'} · ${s.key}.*`" flush>
                <table class="cat-table">
                    <thead><tr><th>Permission</th><th>Tier</th><th>Routes</th></tr></thead>
                    <tbody>
                        <tr v-for="p in s.permissions" :key="p.key">
                            <td>
                                <strong>{{ p.title }}</strong>
                                <span v-if="p.sensitive" class="ot-chip warn cat-badge">Sensitive</span>
                                <span v-if="p.ownerGrantOnly" class="ot-chip cat-badge">Owner-only</span>
                                <small>{{ p.description }}</small>
                                <code class="km-key">{{ p.key }}</code>
                                <small v-if="p.implies.length" class="cat-implies">Includes {{ p.implies.map(k => catalog.describe(k).title).join(', ') }}</small>
                            </td>
                            <td><span class="km-tier" :class="tierMeta(p.tier).tone">{{ tierMeta(p.tier).short }} {{ p.tier }}</span></td>
                            <td>
                                <ul v-if="p.routes?.length" class="cat-routes">
                                    <li v-for="r in p.routes" :key="`${r.method}${r.path}`"><span class="cat-method">{{ r.kind === 'refines' ? 'IN' : r.kind === 'websocket' ? 'WS' : r.method }}</span><code>{{ r.path }}</code></li>
                                </ul>
                                <span v-else class="cat-none">—</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </OmniTraderCard>
        </div>

        <OmniTraderCard v-if="catalog.catalog.value" title="Open to everyone" subtitle="Routes that need no permission: public, or any signed-in profile" flush>
            <div class="cat-open">
                <div>
                    <h4>Public</h4>
                    <ul class="cat-routes"><li v-for="r in catalog.catalog.value.publicRoutes ?? []" :key="`${r.method}${r.path}`"><span class="cat-method">{{ r.kind === 'websocket' ? 'WS' : r.method }}</span><code>{{ r.path }}</code></li></ul>
                </div>
                <div>
                    <h4>Any signed-in profile</h4>
                    <ul class="cat-routes"><li v-for="r in catalog.catalog.value.signedInRoutes ?? []" :key="`${r.method}${r.path}`"><span class="cat-method">{{ r.kind === 'websocket' ? 'WS' : r.method }}</span><code>{{ r.path }}</code></li></ul>
                </div>
            </div>
        </OmniTraderCard>
    </ProfilesShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { usePermissionCatalog } from '~/composables/useAccess';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';
import { TIERS, tierMeta } from '~/scripts/profileFormat';

definePageMeta({ layout: 'navbar' });

interface AuditPayload {
    permissions: number;
    routes: number;
    permissionsWithoutRoutes: { key: string; title: string; service: string }[];
    grantsForUnknownPermissions: { profile: string; key: string }[];
}

const catalog = usePermissionCatalog();
const search = ref('');
const tier = ref(0);
const audit = ref<AuditPayload | null>(null);

const services = computed(() => catalog.catalog.value?.services ?? []);
const total = computed(() => services.value.reduce((n, s) => n + s.permissions.length, 0));
const tierCounts = computed(() => TIERS.map(t => ({ ...t, count: services.value.reduce((n, s) => n + s.permissions.filter(p => p.tierValue === t.value).length, 0) })));
const catalogScope = computed(() => (total.value ? `${total.value} permissions` : ''));

const shown = computed(() => {
    const q = search.value.trim().toLowerCase();
    return services.value.map(s => ({
        ...s,
        permissions: s.permissions
            .filter(p => !tier.value || p.tierValue === tier.value)
            .filter(p => !q || p.key.includes(q) || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
                || s.name.toLowerCase().includes(q) || (p.routes ?? []).some(r => r.path.toLowerCase().includes(q)))
            .sort((a, b) => a.tierValue - b.tierValue || a.title.localeCompare(b.title)),
    })).filter(s => s.permissions.length);
});

async function loadAudit() {
    try {
        const res = await RequestGETFromKliveAPI('/KMProfiles/permissions/audit', false, false);
        if (res.ok) audit.value = await res.json();
    } catch { /* optional */ }
}

function reload() {
    void catalog.load(true);
    void loadAudit();
}

onMounted(() => {
    // Routes are only in the catalog for someone who may view permissions: load it fresh.
    void catalog.load(!catalog.withRoutes.value);
    void loadAudit();
});
</script>

<style scoped>
.cat-services { display: flex; flex-direction: column; gap: var(--ot-gutter); margin-bottom: var(--ot-gutter); }
.cat-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.cat-table th { text-align: left; font-size: 11px; color: var(--ot-muted); font-weight: 600; padding: 8px 14px; border-bottom: 1px solid var(--ot-line); }
.cat-table td { padding: 10px 14px; border-bottom: 1px solid var(--ot-line); vertical-align: top; }
.cat-table tr:last-child td { border-bottom: 0; }
.cat-table td:first-child { width: 46%; }
.cat-table td strong { color: var(--ot-text); font-weight: 600; margin-right: 6px; }
.cat-table td small { display: block; color: var(--ot-text-2); font-size: 12px; margin: 2px 0 4px; }
.cat-badge { height: 18px; font-size: 10px; padding: 0 6px; vertical-align: middle; }
.cat-implies { color: var(--ot-info) !important; }
.cat-routes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.cat-routes li { display: flex; gap: 8px; align-items: center; min-width: 0; }
.cat-routes code { font-family: var(--ot-mono); font-size: 11.5px; color: var(--ot-text-2); overflow-wrap: anywhere; }
.cat-method { flex: 0 0 auto; min-width: 40px; text-align: center; font-family: var(--ot-mono); font-size: 9.5px; font-weight: 700; padding: 1px 4px; border-radius: 4px; color: var(--ot-info); background: var(--ot-info-soft); }
.cat-none { color: var(--ot-disabled); }
.cat-open { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; padding: 14px; }
.cat-open h4 { font-size: 12px; color: var(--ot-muted); text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px; }
@media (max-width: 760px) {
    .cat-table thead { display: none; }
    .cat-table tr { display: grid; grid-template-columns: 1fr; }
    .cat-table td:first-child { width: auto; }
    .cat-table td { border-bottom: 0; padding: 6px 14px; }
    .cat-table tr { border-bottom: 1px solid var(--ot-line); padding: 6px 0; }
}
</style>
