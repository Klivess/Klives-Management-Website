<template>
  <div class="pfx-ax" :data-readonly="!editable || undefined" data-testid="pfx-access">
    <!-- services -->
    <aside class="pfx-ax__rail" aria-label="Services">
      <label class="pfx-field">
        <PeopleIcon name="search" />
        <input v-model="search" type="search" placeholder="Search permissions" aria-label="Search permissions" />
      </label>
      <div class="pfx-ax__services" role="tablist" aria-orientation="vertical">
        <button type="button" role="tab" class="pfx-ax__svc" :aria-selected="selected === '*'" @click="selected = '*'">
          <span class="pfx-ax__svc-name">All services</span>
          <span class="pfx-ax__svc-n">{{ effectiveCount }}<small>/{{ totalCount }}</small></span>
        </button>
        <button
          v-for="s in serviceStats"
          :key="s.key"
          type="button"
          role="tab"
          class="pfx-ax__svc"
          :aria-selected="selected === s.key"
          :data-dim="(search && !s.matches) || undefined"
          @click="selected = s.key"
        >
          <span class="pfx-ax__svc-name">{{ s.name }}</span>
          <span class="pfx-ax__svc-n">{{ s.effective }}<small>/{{ s.total }}</small></span>
          <span class="pfx-ax__svc-bar" aria-hidden="true"><i :style="{ width: `${(s.effective / s.total) * 100}%` }"></i></span>
        </button>
      </div>
    </aside>

    <section class="pfx-ax__main">
      <!-- every service: a tier matrix -->
      <template v-if="selected === '*' && !search && show === 'all'">
        <div class="pfx-ax__head">
          <div>
            <h3>All permissions</h3>
            <p>{{ effectiveCount }} of {{ totalCount }} held{{ impliedOnlyCount ? ` · ${impliedOnlyCount} included through another permission` : '' }}{{ unusedHeld.length ? ` · ${unusedHeld.length} unused for 30 days` : '' }}</p>
          </div>
          <div class="pfx-toolbar">
            <PeopleAccessShow v-model="show" :unused-count="unused ? unusedHeld.length : null" />
            <button v-if="editable && removableUnused.length" type="button" class="pfx-btn pfx-btn--sm pfx-btn--warn" data-testid="pfx-remove-unused" :title="`Switch off the ${removableUnused.length} direct grants not used in 30 days (a draft: nothing is saved until you save)`" @click="removeUnused">
              <PeopleIcon name="scissors" />Remove unused ({{ removableUnused.length }})
            </button>
            <label v-if="editable && copySources.length" class="pfx-dim" style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px">
              Copy from
              <select v-model="copyFrom" class="pfx-select pfx-select--sm" :disabled="copying" aria-label="Copy permissions from" @change="copyGrants">
                <option value="">a profile…</option>
                <option v-for="p in copySources" :key="p.userId" :value="p.userId">{{ p.name }}</option>
              </select>
            </label>
          </div>
        </div>
        <div class="pfx-ax__matrix">
          <button v-for="s in serviceStats" :key="s.key" type="button" class="pfx-ax__mrow" @click="selected = s.key">
            <span class="pfx-truncate">{{ s.name }}</span>
            <span class="pfx-ax__mcells">
              <span v-for="t in TIERS" :key="t.value" class="pfx-ax__mcell" :data-tier="t.value" :data-state="cellState(s.key, t.value)" :title="`${t.name}: ${cellText(s.key, t.value)}`">{{ cellText(s.key, t.value) }}</span>
            </span>
            <PeopleIcon name="chevron-right" />
          </button>
        </div>
        <div class="pfx-toolbar pfx-dim" style="font-size: 11.5px">
          <span v-for="t in TIERS" :key="t.value" class="pfx-tier" :data-tier="t.value">{{ t.name }}</span>
          <span>· {{ TIERS[0].blurb.toLowerCase() }} → {{ TIERS[4].blurb.toLowerCase() }}</span>
        </div>
      </template>

      <!-- one service, a search, or a "held / unused" list -->
      <template v-else>
        <div class="pfx-ax__head">
          <div>
            <h3>{{ heading }}</h3>
            <p>
              <template v-if="search || selected === '*'">{{ shownCount }} permission{{ shownCount === 1 ? '' : 's' }}</template>
              <template v-else-if="currentStats">{{ currentStats.effective }} of {{ currentStats.total }} held</template>
            </p>
          </div>
          <div class="pfx-toolbar">
            <PeopleAccessShow v-model="show" :unused-count="unused ? unusedHeld.length : null" />
            <button v-if="editable && show === 'unused' && removableUnused.length" type="button" class="pfx-btn pfx-btn--sm pfx-btn--warn" data-testid="pfx-remove-unused" @click="removeUnused">
              <PeopleIcon name="scissors" />Remove unused ({{ removableUnused.length }})
            </button>
            <template v-if="editable && !search && currentService">
              <span class="pfx-dim" style="font-size: 12px">Set to</span>
              <div class="pfx-seg" role="group" aria-label="Grant this service up to a tier">
                <button type="button" class="pfx-seg__opt" :aria-pressed="serviceLevel === 0" @click="setServiceLevel(0)">None</button>
                <button v-for="t in serviceTiers" :key="t.value" type="button" class="pfx-seg__opt" :aria-pressed="serviceLevel === t.value" :title="`Every ${currentService.name} permission up to ${t.name}`" @click="setServiceLevel(t.value)">{{ t.name }}</button>
              </div>
            </template>
          </div>
        </div>

        <template v-for="group in groups" :key="group.key">
          <div class="pfx-ax__area"><span v-if="search || selected === '*'">{{ group.service }} · </span>{{ group.area }}</div>
          <div class="pfx-ax__list">
            <div v-for="perm in group.permissions" :key="perm.key" class="pfx-perm" :data-state="stateOf(perm.key)" :data-changed="changedKeys.has(perm.key) || undefined" :data-testid="`perm-${perm.key}`">
              <button
                type="button"
                class="pfx-switch"
                role="switch"
                :aria-checked="isDirect(perm.key)"
                :data-implied="(!isDirect(perm.key) && implied.has(perm.key)) || undefined"
                :aria-label="perm.title"
                :disabled="!editable || !!lockedReason(perm.key)"
                :title="lockedReason(perm.key) || (implied.has(perm.key) && !isDirect(perm.key) ? `Included with “${titleOf(implied.get(perm.key)!)}”` : '')"
                @click="toggle(perm.key)"
              ></button>
              <div class="pfx-perm__main">
                <div class="pfx-perm__title">
                  <strong :title="perm.key">{{ perm.title }}</strong>
                  <span v-if="perm.sensitive" class="pfx-chip" data-tone="warn" title="Private data, money or credentials">Sensitive</span>
                  <span v-if="perm.ownerGrantOnly" class="pfx-chip" title="Only Klives can hand this out">Owner-only</span>
                </div>
                <div class="pfx-perm__desc" :title="perm.description">
                  <template v-if="!isDirect(perm.key) && implied.get(perm.key)">Included with “{{ titleOf(implied.get(perm.key)!) }}” · </template>{{ perm.description }}
                </div>
              </div>
              <div class="pfx-perm__meta">
                <span v-if="usageText(perm.key)" class="pfx-perm__use" :data-tone="usageTone(perm.key)">{{ usageText(perm.key) }}</span>
                <button v-if="perm.routes && perm.routes.length" type="button" class="pfx-btn pfx-btn--xs pfx-btn--ghost" :aria-expanded="openRoutes.has(perm.key)" :title="`${perm.routes.length} route${perm.routes.length === 1 ? '' : 's'} this unlocks`" @click="toggleRoutes(perm.key)">
                  <PeopleIcon name="route" />{{ perm.routes.length }}
                </button>
                <span class="pfx-tier" :data-tier="perm.tierValue">{{ perm.tier }}</span>
              </div>
              <div>
                <select v-if="isDirect(perm.key) && editable && !lockedReason(perm.key)" class="pfx-select pfx-select--sm" :value="expiryChoice(perm.key)" :aria-label="`How long ${perm.title} lasts`" @change="setExpiry(perm.key, ($event.target as HTMLSelectElement).value)">
                  <option value="never">Permanent</option>
                  <option v-if="expiryChoice(perm.key) === 'current'" value="current">{{ expiryLabel(perm.key) }}</option>
                  <option value="1h">1 hour</option>
                  <option value="1d">1 day</option>
                  <option value="7d">1 week</option>
                  <option value="30d">30 days</option>
                </select>
                <span v-else-if="grantOf(perm.key)?.expiresUtc" class="pfx-chip" data-tone="violet">{{ expiryLabel(perm.key) }}</span>
              </div>
              <ul v-if="openRoutes.has(perm.key) && perm.routes" class="pfx-perm__routes">
                <li v-for="r in perm.routes" :key="`${r.method}${r.path}`">
                  <span class="pfx-method" :data-method="r.kind === 'websocket' ? 'WS' : r.method">{{ r.kind === 'refines' ? 'IN' : r.kind === 'websocket' ? 'WS' : r.method }}</span>
                  <code>{{ r.path }}</code>
                </li>
              </ul>
            </div>
          </div>
        </template>
        <div v-if="!groups.length" class="pfx-empty"><PeopleIcon name="filter" />{{ show === 'unused' ? 'Every held permission was used in the last 30 days.' : 'No permissions match.' }}</div>
      </template>
    </section>

    <!-- what saving would change -->
    <div v-if="editable && showDiffBar && diff.total" class="pfx-diffbar" role="region" aria-label="Unsaved permission changes">
      <strong>{{ diff.total }} unsaved change{{ diff.total === 1 ? '' : 's' }}</strong>
      <span class="pfx-diffbar__counts">
        <span v-if="diff.added.length" class="add">+{{ diff.added.length }}</span>
        <span v-if="diff.removed.length" class="del">−{{ diff.removed.length }}</span>
        <span v-if="diff.changed.length" class="chg">~{{ diff.changed.length }}</span>
      </span>
      <span v-if="criticalAdded.length" class="pfx-diffbar__warn" :title="criticalAdded.map(titleOf).join(', ')"><PeopleIcon name="alert" />{{ criticalAdded.length }} critical</span>
      <label class="pfx-dim" style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px">
        New permissions last
        <select v-model="newExpiry" class="pfx-select pfx-select--sm" aria-label="How long new permissions last">
          <option value="never">Permanently</option>
          <option value="1h">1 hour</option>
          <option value="1d">1 day</option>
          <option value="7d">1 week</option>
          <option value="30d">30 days</option>
        </select>
      </label>
      <div class="pfx-diffbar__actions">
        <button type="button" class="pfx-btn pfx-btn--ghost" :disabled="saving" @click="emit('discard')">Discard</button>
        <button type="button" class="pfx-btn pfx-btn--primary" :disabled="saving" @click="emit('save')">{{ saving ? 'Saving…' : 'Save changes' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CatalogPermission, GrantDraft, PermissionCatalogPayload, PermissionUsageRow } from '~/scripts/profilesApi';
import { profilesApi } from '~/scripts/profilesApi';
import { relTime, TIERS, untilTime } from '~/scripts/profileFormat';

/**
 * Which permissions a profile holds, one compact row each: switch, title, what it is, how it has
 * been used, its tier and how long it lasts. A key brought in by another shows as included, never
 * as a second grant. The owner hands out anything; anyone else only keys they hold themselves.
 */
const props = withDefaults(defineProps<{
  catalog: PermissionCatalogPayload;
  grants: GrantDraft[];
  baseline: GrantDraft[];
  editable?: boolean;
  saving?: boolean;
  actorIsOwner?: boolean;
  actorHolds?: (key: string) => boolean;
  usage?: Map<string, PermissionUsageRow> | null;
  /** Direct grants not used in the usage window (from the review); enables "Unused" and "Remove unused". */
  unused?: string[] | null;
  copySources?: { userId: string; name: string }[];
  /** Off when the editor is one step of a larger form (the new-profile wizard). */
  showDiffBar?: boolean;
  defaultExpiry?: 'never' | '1h' | '1d' | '7d' | '30d';
  /** A service key to open on (a click in the directory's matrix). */
  focusService?: string | null;
}>(), {
  editable: false, saving: false, actorIsOwner: false, usage: null, unused: null, copySources: () => [], actorHolds: () => false,
  showDiffBar: true, defaultExpiry: 'never', focusService: null,
});
const emit = defineEmits<{ 'update:grants': [grants: GrantDraft[]]; save: []; discard: [] }>();

const search = ref('');
const show = ref<'all' | 'held' | 'off' | 'unused'>('all');
const selected = ref<string>(props.focusService && props.catalog.services.some(s => s.key === props.focusService) ? props.focusService : '*');
watch(() => props.focusService, key => { if (key && props.catalog.services.some(s => s.key === key)) selected.value = key; });
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
const stateOf = (key: string) => (isDirect(key) ? 'on' : implied.value.has(key) ? 'implied' : 'off');

function lockedReason(key: string): string {
  if (!props.editable || props.actorIsOwner) return '';
  const p = byKey.value.get(key);
  if (p?.ownerGrantOnly) return 'Only Klives can hand this out.';
  if (!props.actorHolds(key)) return "You can't hand out a permission you don't have.";
  return '';
}

// ── unused ──
const unusedSet = computed(() => new Set(props.unused ?? []));
/** Held directly now and in the server's unused list (a grant added in this draft is never "unused"). */
const unusedHeld = computed(() => [...unusedSet.value].filter(k => isDirect(k) && props.baseline.some(g => g.key === k)));
const removableUnused = computed(() => unusedHeld.value.filter(k => !lockedReason(k)));
function removeUnused() {
  const drop = new Set(removableUnused.value);
  commit(props.grants.filter(g => !drop.has(g.key)));
}

// ── services ──
function matchesSearch(p: CatalogPermission, service: string, q: string) {
  return p.title.toLowerCase().includes(q) || p.key.includes(q) || p.description.toLowerCase().includes(q)
    || p.area.toLowerCase().includes(q) || service.toLowerCase().includes(q);
}
function matchesShow(key: string) {
  if (show.value === 'held') return isHeld(key);
  if (show.value === 'off') return !isHeld(key);
  if (show.value === 'unused') return unusedSet.value.has(key) && isDirect(key);
  return true;
}
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
const heading = computed(() => {
  if (search.value) return `Results for “${search.value}”`;
  if (selected.value === '*') return show.value === 'unused' ? 'Unused for 30 days' : show.value === 'held' ? 'Everything held' : 'Not held';
  return currentService.value?.name ?? '';
});

const shown = computed(() => {
  const q = search.value.trim().toLowerCase();
  const source = q || selected.value === '*'
    ? props.catalog.services.flatMap(s => s.permissions.filter(p => !q || matchesSearch(p, s.name, q)).map(p => ({ p, service: s.name })))
    : (currentService.value?.permissions ?? []).map(p => ({ p, service: currentService.value!.name }));
  return source.filter(({ p }) => matchesShow(p.key));
});
const shownCount = computed(() => shown.value.length);

/** Areas in order of their lowest tier; permissions by tier then title. */
const groups = computed(() => {
  const map = new Map<string, { key: string; area: string; service: string; minTier: number; permissions: CatalogPermission[] }>();
  for (const { p, service } of shown.value) {
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
  return perms.every(p => (p.tierValue <= top) === isDirect(p.key)) ? top : -1;
});

function cellPerms(serviceKey: string, tier: number) {
  return props.catalog.services.find(s => s.key === serviceKey)?.permissions.filter(p => p.tierValue === tier) ?? [];
}
function cellState(serviceKey: string, tier: number) {
  const perms = cellPerms(serviceKey, tier);
  if (!perms.length) return 'na';
  const n = perms.filter(p => isHeld(p.key)).length;
  return n === 0 ? 'none' : n === perms.length ? 'full' : 'part';
}
function cellText(serviceKey: string, tier: number) {
  const perms = cellPerms(serviceKey, tier);
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
const expiryChoice = (key: string) => (grantOf(key)?.expiresUtc ? 'current' : 'never');
function expiryLabel(key: string) {
  const expires = grantOf(key)?.expiresUtc;
  return expires ? `Ends ${untilTime(expires)}` : 'Permanent';
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
  if (isDirect(key) && unusedSet.value.has(key)) return u?.lastUsedMs ? `unused 30 d · last ${relTime(u.lastUsedMs)}` : 'never used';
  if (!u) return isDirect(key) && props.usage ? 'never used' : '';
  if (!u.count && !u.denied) return isDirect(key) ? 'never used' : '';
  const parts = [];
  if (u.count) parts.push(`${u.count.toLocaleString()}×${u.lastUsedMs ? ` · ${relTime(u.lastUsedMs)}` : ''}`);
  if (u.denied) parts.push(`${u.denied} refused`);
  return parts.join(' · ');
}
function usageTone(key: string) {
  const u = props.usage?.get(key);
  if (u?.denied && !isHeld(key)) return 'crit';
  if (isDirect(key) && (unusedSet.value.has(key) || !u || !u.count)) return 'warn';
  return undefined;
}

// ── diff against what is saved ──
const diff = computed(() => {
  const before = new Map(props.baseline.map(g => [g.key, g]));
  const added = props.grants.filter(g => !before.has(g.key)).map(g => g.key);
  const removed = props.baseline.filter(g => !direct.value.has(g.key)).map(g => g.key);
  const changed = props.grants.filter(g => before.has(g.key) && (before.get(g.key)!.expiresUtc ?? null) !== (g.expiresUtc ?? null)).map(g => g.key);
  return { added, removed, changed, total: added.length + removed.length + changed.length };
});
const changedKeys = computed(() => new Set([...diff.value.added, ...diff.value.removed, ...diff.value.changed]));
const criticalAdded = computed(() => diff.value.added.filter(k => (byKey.value.get(k)?.tierValue ?? 0) >= 5));

defineExpose({ diff });

watch(search, q => { if (q && selected.value === '*' && show.value === 'all') selected.value = ''; if (!q && selected.value === '') selected.value = '*'; });
</script>
