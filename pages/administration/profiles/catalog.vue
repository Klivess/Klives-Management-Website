<template>
  <div class="pfx" data-testid="pfx-catalog">
    <header class="pfx-bar">
      <NuxtLink to="/administration/profiles" class="pfx-bar__crumb"><PeopleIcon name="arrow-left" />Profiles</NuxtLink>
      <div class="pfx-bar__id">
        <span class="pfx-bar__mark"><PeopleIcon name="catalog" /></span>
        <h1 class="pfx-bar__title">Permissions</h1>
        <span class="pfx-bar__sub">{{ total ? `${total} permissions · ${services.length} services` : '' }}</span>
      </div>
      <span class="pfx-bar__spacer"></span>
      <div class="pfx-bar__actions">
        <button class="pfx-iconbtn" title="Reload" aria-label="Reload" @click="reload"><PeopleIcon name="refresh" :class="{ 'pfx-spin': catalog.loading.value }" /></button>
      </div>
    </header>

    <div class="pfx-main">
      <div v-if="catalog.error.value" class="pfx-banner" data-tone="crit" role="alert"><PeopleIcon name="octagon-x" /><div><strong>Couldn't load the catalog</strong>{{ catalog.error.value }}</div></div>
      <div v-if="audit && (audit.permissionsWithoutRoutes.length || audit.grantsForUnknownPermissions.length)" class="pfx-banner" data-tone="warn" role="status">
        <PeopleIcon name="alert" />
        <div>
          <strong>Self-check</strong>
          <span v-if="audit.permissionsWithoutRoutes.length">{{ audit.permissionsWithoutRoutes.length }} permission{{ audit.permissionsWithoutRoutes.length === 1 ? '' : 's' }} unlock no route ({{ audit.permissionsWithoutRoutes.map(p => p.title).join(', ') }}): granting {{ audit.permissionsWithoutRoutes.length === 1 ? 'it' : 'them' }} does nothing. </span>
          <span v-if="audit.grantsForUnknownPermissions.length">{{ audit.grantsForUnknownPermissions.length }} grant{{ audit.grantsForUnknownPermissions.length === 1 ? '' : 's' }} name retired permissions.</span>
        </div>
      </div>

      <div class="pfx-kpis pfx-kpis--6">
        <PeopleKpi label="Permissions" icon="layers" :value="total ? String(total) : null"><template #sub>{{ services.length }} services · {{ audit?.routes ?? '…' }} routes</template></PeopleKpi>
        <PeopleKpi v-for="t in tierCounts" :key="t.value" :label="t.name" icon="shield" :value="total ? String(t.count) : null" :clickable="true" @open="tier = tier === t.value ? 0 : t.value">
          <template #sub>{{ t.blurb }}</template>
          <span class="pfx-meter" :data-tier="t.value" style="display: block; margin-top: 10px"><span :style="{ width: `${total ? (t.count / maxTier) * 100 : 0}%`, background: `var(--tier)` }"></span></span>
        </PeopleKpi>
      </div>

      <section class="pfx-card" aria-label="Every permission">
        <header class="pfx-card__head">
          <h2 class="pfx-card__title"><PeopleIcon name="catalog" />Every permission</h2>
          <span class="pfx-card__meta pfx-num">{{ shownCount }} shown</span>
          <div class="pfx-card__tools">
            <label class="pfx-field" style="width: 260px">
              <PeopleIcon name="search" />
              <input v-model="search" type="search" placeholder="Search keys, titles or routes" aria-label="Search permissions" />
            </label>
            <div class="pfx-seg" role="group" aria-label="Tier">
              <button class="pfx-seg__opt" :aria-pressed="tier === 0" @click="tier = 0">All tiers</button>
              <button v-for="t in TIERS" :key="t.value" class="pfx-seg__opt" :aria-pressed="tier === t.value" @click="tier = t.value">{{ t.name }}</button>
            </div>
            <label v-if="holders.size" class="pfx-check"><input v-model="heldOnly" type="checkbox" />Held by someone</label>
          </div>
        </header>

        <div class="pfx-cat">
          <div class="pfx-cat__row pfx-cat__row--head"><span>Permission</span><span>Tier</span><span>Held by</span><span>Unlocks</span></div>
          <template v-for="s in shown" :key="s.key">
            <div class="pfx-cat__svc"><h3>{{ s.name }}</h3><span class="pfx-dim pfx-mono">{{ s.key }}.*</span><span class="pfx-faint">· {{ s.permissions.length }}</span></div>
            <div v-for="p in s.permissions" :key="p.key" class="pfx-cat__row" :data-testid="`cat-${p.key}`">
              <div style="min-width: 0">
                <div class="pfx-perm__title">
                  <strong>{{ p.title }}</strong>
                  <span v-if="p.sensitive" class="pfx-chip" data-tone="warn">Sensitive</span>
                  <span v-if="p.ownerGrantOnly" class="pfx-chip">Owner-only</span>
                </div>
                <div class="pfx-dim" style="font-size: 12px">{{ p.description }}</div>
                <div class="pfx-faint pfx-mono" style="font-size: 11px">{{ p.key }}<template v-if="p.implies.length"> · includes {{ p.implies.map(k => catalog.describe(k).title).join(', ') }}</template></div>
              </div>
              <span><span class="pfx-tier" :data-tier="p.tierValue">{{ p.tier }}</span></span>
              <div class="pfx-cat__holders">
                <template v-if="holders.size">
                  <NuxtLink v-for="h in holdersOf(p.key)" :key="h.userId" :to="`/administration/profiles/${h.userId}?tab=access&service=${s.key}`" :title="`${h.name}${h.isOwner ? ' (owner: everything)' : ''}`">
                    <PeopleAvatar :name="h.name" :id="h.userId" :owner="h.isOwner" :size="22" />
                  </NuxtLink>
                  <span v-if="holdersOf(p.key).length <= 1" class="pfx-faint" style="font-size: 11.5px">{{ holdersOf(p.key).length ? 'only the owner' : 'nobody' }}</span>
                </template>
                <span v-else class="pfx-faint">—</span>
              </div>
              <ul v-if="p.routes?.length" class="pfx-cat__routes">
                <li v-for="r in p.routes.slice(0, openRoutes.has(p.key) ? 999 : 3)" :key="`${r.method}${r.path}`">
                  <span class="pfx-method" :data-method="r.kind === 'websocket' ? 'WS' : r.method">{{ r.kind === 'refines' ? 'IN' : r.kind === 'websocket' ? 'WS' : r.method }}</span><code :title="r.path">{{ r.path }}</code>
                </li>
                <li v-if="p.routes.length > 3 && !openRoutes.has(p.key)"><button class="pfx-link" style="font-size: 11.5px" @click="openRoutes = new Set([...openRoutes, p.key])">+{{ p.routes.length - 3 }} more</button></li>
              </ul>
              <span v-else class="pfx-faint">{{ p.routes ? 'no route' : '—' }}</span>
            </div>
          </template>
          <div v-if="catalog.catalog.value && !shownCount" class="pfx-empty"><PeopleIcon name="filter" />No permissions match.</div>
          <div v-if="!catalog.catalog.value" style="padding: 14px; display: flex; flex-direction: column; gap: 8px"><span v-for="n in 6" :key="n" class="pfx-skel" style="height: 36px"></span></div>
        </div>
      </section>

      <section v-if="catalog.catalog.value?.publicRoutes" class="pfx-card" aria-label="Open to everyone">
        <header class="pfx-card__head"><h2 class="pfx-card__title"><PeopleIcon name="globe" />Open to everyone</h2><span class="pfx-card__meta">routes that need no permission</span></header>
        <div class="pfx-card__body pfx-grid2">
          <div>
            <div class="pfx-ax__area">Public · {{ catalog.catalog.value.publicRoutes.length }}</div>
            <ul class="pfx-cat__routes"><li v-for="r in catalog.catalog.value.publicRoutes" :key="`${r.method}${r.path}`"><span class="pfx-method" :data-method="r.kind === 'websocket' ? 'WS' : r.method">{{ r.kind === 'websocket' ? 'WS' : r.method }}</span><code>{{ r.path }}</code></li></ul>
          </div>
          <div>
            <div class="pfx-ax__area">Any signed-in profile · {{ catalog.catalog.value.signedInRoutes?.length ?? 0 }}</div>
            <ul class="pfx-cat__routes"><li v-for="r in catalog.catalog.value.signedInRoutes ?? []" :key="`${r.method}${r.path}`"><span class="pfx-method" :data-method="r.kind === 'websocket' ? 'WS' : r.method">{{ r.kind === 'websocket' ? 'WS' : r.method }}</span><code>{{ r.path }}</code></li></ul>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { usePermissionCatalog } from '~/composables/useAccess';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';
import { profilesApi, type ProfileRow } from '~/scripts/profilesApi';
import { TIERS } from '~/scripts/profileFormat';
import type { InsightsPayload } from '~/scripts/profilesConsole';

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
const heldOnly = ref(false);
const audit = ref<AuditPayload | null>(null);
const openRoutes = ref(new Set<string>());
const people = shallowRef<ProfileRow[]>([]);
const insights = shallowRef<InsightsPayload | null>(null);

const services = computed(() => catalog.catalog.value?.services ?? []);
const total = computed(() => services.value.reduce((n, s) => n + s.permissions.length, 0));
const tierCounts = computed(() => TIERS.map(t => ({ ...t, count: services.value.reduce((n, s) => n + s.permissions.filter(p => p.tierValue === t.value).length, 0) })));
const maxTier = computed(() => Math.max(1, ...tierCounts.value.map(t => t.count)));

/** Permission key → the profiles holding it (owner always), from the review's effective keys. */
const holders = computed(() => {
  const map = new Map<string, { userId: string; name: string; isOwner: boolean }[]>();
  if (!insights.value) return map;
  const byId = new Map(people.value.map(p => [p.userId, p]));
  const owners = people.value.filter(p => p.isOwner).map(p => ({ userId: p.userId, name: p.name, isOwner: true }));
  for (const s of services.value) for (const p of s.permissions) map.set(p.key, [...owners]);
  for (const row of insights.value.profiles) {
    const person = byId.get(row.userId);
    if (!person || person.isOwner || !row.effective) continue;
    for (const key of row.effective) map.get(key)?.push({ userId: person.userId, name: person.name, isOwner: false });
  }
  return map;
});
const holdersOf = (key: string) => holders.value.get(key) ?? [];

const shown = computed(() => {
  const q = search.value.trim().toLowerCase();
  return services.value.map(s => ({
    ...s,
    permissions: s.permissions
      .filter(p => !tier.value || p.tierValue === tier.value)
      .filter(p => !heldOnly.value || holdersOf(p.key).some(h => !h.isOwner))
      .filter(p => !q || p.key.includes(q) || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
        || s.name.toLowerCase().includes(q) || (p.routes ?? []).some(r => r.path.toLowerCase().includes(q)))
      .sort((a, b) => a.tierValue - b.tierValue || a.title.localeCompare(b.title)),
  })).filter(s => s.permissions.length);
});
const shownCount = computed(() => shown.value.reduce((n, s) => n + s.permissions.length, 0));

async function loadAudit() {
  try {
    const res = await RequestGETFromKliveAPI('/KMProfiles/permissions/audit', false, false);
    if (res.ok) audit.value = await res.json();
  } catch { /* optional */ }
}
async function loadHolders() {
  try {
    const [list, review] = await Promise.all([profilesApi.list(), profilesApi.insights()]);
    people.value = list.profiles;
    insights.value = review;
  } catch { /* the column says — */ }
}
function reload() {
  void catalog.load(true);
  void loadAudit();
  void loadHolders();
}

onMounted(() => {
  // Routes are only in the catalog for someone who may view permissions: load it fresh.
  void catalog.load(!catalog.withRoutes.value);
  void loadAudit();
  void loadHolders();
});
</script>

<style lang="scss" src="~/assets/scss/profiles-console.scss"></style>
