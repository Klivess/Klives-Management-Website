<template>
  <div class="dmx ot-os dm-os" data-testid="dmx-root">
    <!-- ot-os and dm-os stay on the root for the panels that still render ot-os components; .dmx
         re-themes them (demiurge-console.scss) so every Demiurge page reads as one surface. The comment
         lives inside the root: above it, dev builds render a two-node fragment and Nuxt cannot
         navigate away from the page. -->
    <a class="ot-skiplink" href="#dm-main">Skip to content</a>

    <header class="dmx-bar">
      <NuxtLink class="dmx-bar__brand" to="/demiurge" aria-label="Demiurge home">
        <span class="dmx-bar__mark" :data-working="working || undefined"><DemiurgeIcon name="bot" /></span>
        <span class="dmx-bar__title">Demiurge</span>
      </NuxtLink>

      <nav class="dmx-nav" aria-label="Demiurge sections">
        <NuxtLink v-for="s in primary" :key="s.id" :to="s.to" class="dmx-nav__link" :class="{ active: section === s.id }" :aria-current="section === s.id ? 'page' : undefined">
          <DemiurgeIcon :name="s.icon" />{{ s.label }}<span v-if="s.id === 'computers' && hostProblem" class="dmx-nav__badge" data-tone="fault" title="The computer host needs attention" aria-hidden="true">!</span>
        </NuxtLink>
        <span class="dmx-nav__sep" aria-hidden="true"></span>
        <NuxtLink v-for="s in insight" :key="s.id" :to="s.to" class="dmx-nav__link" :class="{ active: section === s.id }" :aria-current="section === s.id ? 'page' : undefined">
          <DemiurgeIcon :name="s.icon" />{{ s.label }}
        </NuxtLink>
      </nav>

      <span v-if="crumb" class="dmx-bar__crumb dm-wide-only">
        <DemiurgeIcon name="chevron-right" class="dmx-faint" /><b :title="crumb">{{ crumb }}</b>
      </span>

      <span class="dmx-bar__spacer"></span>

      <div class="dmx-bar__actions">
        <button class="dmx-search" aria-label="Jump to a Steward or action" aria-keyshortcuts="Control+K" data-testid="dmx-search" @click="openPalette">
          <DemiurgeIcon name="search" />
          <span class="dmx-search__text">Jump to a Steward…</span>
          <span class="dmx-kbd">Ctrl</span><span class="dmx-kbd">K</span>
        </button>
        <span v-if="status" class="dmx-live" :data-state="working ? 'live' : 'idle'" :data-tone="liveTone" :title="status">
          <span class="dmx-live__dot"></span><span class="dmx-truncate" style="max-width: 26ch">{{ status }}</span>
        </span>
        <slot name="top" />
        <NuxtLink to="/demiurge/new" class="dmx-btn dmx-btn--primary dmx-btn--sm" aria-label="New Steward"><DemiurgeIcon name="plus" /><span class="dmx-wide-text">New Steward</span></NuxtLink>
      </div>
    </header>

    <main id="dm-main" class="dmx-main ot-page">
      <slot />
    </main>

    <Teleport to="body">
      <div v-if="paletteOpen" class="dmx-layer dmx-scrim" @click="closePalette"></div>
      <div v-if="paletteOpen" class="dmx-layer dmx-palette" role="dialog" aria-modal="true" aria-label="Jump to">
        <label class="dmx-palette__input">
          <DemiurgeIcon name="search" />
          <input ref="paletteInput" v-model="paletteQuery" type="text" placeholder="Steward, page or action…" aria-label="Search Stewards, pages and actions" @keydown="onPaletteKey" />
          <span class="dmx-kbd">Esc</span>
        </label>
        <div class="dmx-palette__list" role="listbox" aria-label="Results">
          <template v-for="(group, gi) in groupedResults" :key="group.name">
            <div class="dmx-palette__group">{{ group.name }}</div>
            <button
              v-for="(cmd, ci) in group.items"
              :key="cmd.id"
              class="dmx-palette__item"
              role="option"
              :aria-selected="flatIndex(gi, ci) === paletteIndex"
              :data-active="flatIndex(gi, ci) === paletteIndex || undefined"
              @mouseenter="paletteIndex = flatIndex(gi, ci)"
              @click="runCommand(cmd)"
            >
              <DemiurgeIcon :name="cmd.icon" />
              <span class="dmx-palette__label">{{ cmd.title }}</span>
              <span v-if="cmd.hint" class="dmx-palette__hint">{{ cmd.hint }}</span>
            </button>
          </template>
          <div v-if="!results.length" class="dmx-empty"><DemiurgeIcon name="search" />Nothing matches “{{ paletteQuery }}”.</div>
        </div>
        <div class="dmx-palette__foot"><span><span class="dmx-kbd">↑</span> <span class="dmx-kbd">↓</span> move</span><span><span class="dmx-kbd">Enter</span> open</span></div>
      </div>
      <div class="dmx-layer dmx-toasts" aria-live="polite">
        <div v-for="t in toasts" :key="t.id" class="dmx-toast" :data-tone="t.tone" role="status"><DemiurgeIcon :name="t.icon" />{{ t.text }}</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { dmxGet, useDmxPoll, useDmxToasts } from '~/composables/useDemiurgeConsole';
import { useAccess } from '~/composables/useAccess';
import { stewardState, rankCommands, type DmCommand } from '~/scripts/demiurgeConsole';
import DemiurgeIcon from '~/components/Demiurge/Icon.vue';

const props = defineProps<{
  /** One line on what the fleet (or this Steward) is doing right now. */
  status?: string;
  statusTone?: 'ok' | 'warn' | 'bad' | '';
  /** True while agents are actively working, so the mark and status breathe. */
  working?: boolean;
  /** Steward name shown after the section nav inside a workspace. */
  crumb?: string;
  /** Page-specific palette actions (halt all, broadcast, pause this Steward…). */
  commands?: DmCommand[];
}>();

// Every Demiurge page reads as one surface: the ot-os tokens follow while the shell is mounted.
useHead({ htmlAttrs: { class: 'dmx-theme' } });

const route = useRoute();
const router = useRouter();
const { toasts } = useDmxToasts();

const primary = [
  { id: 'operations', label: 'Operations', to: '/demiurge', icon: 'layers' },
  { id: 'computers', label: 'Computers', to: '/demiurge/computers', icon: 'monitor' },
  { id: 'playbooks', label: 'Playbooks', to: '/demiurge/playbooks', icon: 'book' },
  { id: 'accounts', label: 'Accounts', to: '/demiurge/accounts', icon: 'key' },
];
const insight = [
  { id: 'analytics', label: 'Analytics', to: '/demiurge/analytics', icon: 'chart' },
  { id: 'costs', label: 'Costs', to: '/demiurge/cost-simulator', icon: 'coins' },
];
// Whole path segments only: a Steward whose ID happens to start with "computers" is still a workspace.
const SECTIONS: Record<string, string> = {
  computers: 'computers', playbooks: 'playbooks', accounts: 'accounts',
  analytics: 'analytics', 'cost-simulator': 'costs', new: 'new',
};
// A Steward workspace belongs to Operations (it is where the board leads).
const section = computed(() => SECTIONS[route.path.split('/').filter(Boolean)[1] ?? ''] ?? 'operations');
const liveTone = computed(() => props.statusTone === 'bad' ? 'fault' : props.statusTone === 'warn' ? 'need' : props.working ? 'work' : 'rest');

// Host health drives the Computers badge; checked every 30 s, never while the tab is hidden, and only for a
// profile that may read it (an Accounts-only profile would otherwise collect a 403 every 30 s).
const access = useAccess();
const canOverview = computed(() => access.can('demiurge.overview.view'));
const host = ref<any>(null);
const hostProblem = computed(() => !!(host.value?.daemonProblem || host.value?.available === false || host.value?.restartRequired));
useDmxPoll(async () => {
  if (!canOverview.value) return;
  const r = await dmxGet('/demiurge/computers/health');
  if (r.ok) host.value = r.body;
}, 30_000);

// ── palette ──
const paletteOpen = ref(false);
const paletteQuery = ref('');
const paletteIndex = ref(0);
const paletteInput = ref<HTMLInputElement | null>(null);
const stewards = ref<{ stewardID: string; name: string; status: string; halted: boolean; executionDisposition: string; pendingApprovals: number }[]>([]);
let demiurgeLoadedAt = 0;

async function openPalette() {
  paletteOpen.value = true;
  paletteQuery.value = '';
  paletteIndex.value = 0;
  await nextTick();
  paletteInput.value?.focus();
  if (canOverview.value && Date.now() - demiurgeLoadedAt > 30_000) {
    const r = await dmxGet<any[]>('/demiurge/list');
    if (r.ok && Array.isArray(r.body)) { stewards.value = r.body; demiurgeLoadedAt = Date.now(); }
  }
}
function closePalette() { paletteOpen.value = false; }

const commands = computed<DmCommand[]>(() => {
  const go = (title: string, to: string, icon: string, keywords = ''): DmCommand => ({ id: `go:${to}`, title, group: 'Go to', icon, keywords, run: () => router.push(to) });
  const list: DmCommand[] = [];
  list.push(...(props.commands ?? []));
  const sorted = [...stewards.value].sort((a, b) => Number(a.status === 'Archived') - Number(b.status === 'Archived') || a.name.localeCompare(b.name));
  for (const p of sorted) {
    const state = stewardState({ status: p.status, halted: p.halted, workingAgents: 0, executionDisposition: p.executionDisposition });
    list.push({
      id: `p:${p.stewardID}`, title: p.name || '(untitled)', group: 'Stewards', icon: state.icon,
      hint: p.pendingApprovals ? `${p.pendingApprovals} waiting · ${state.label}` : state.label,
      keywords: `${p.stewardID} ${state.label}`,
      run: () => router.push(`/demiurge/${p.stewardID}`),
    });
  }
  list.push(
    { id: 'new', title: 'New Steward', group: 'Actions', icon: 'plus', keywords: 'create start', run: () => router.push('/demiurge/new') },
    go('Operations', '/demiurge', 'layers', 'fleet overview home'),
    go('Computers', '/demiurge/computers', 'monitor', 'desktops containers docker'),
    go('Playbooks', '/demiurge/playbooks', 'book', 'sites how-to'),
    go('Accounts', '/demiurge/accounts', 'key', 'logins passwords registry'),
    go('Analytics', '/demiurge/analytics', 'chart', 'insight trends'),
    go('Costs', '/demiurge/cost-simulator', 'coins', 'spend simulator price'),
  );
  return list;
});
const results = computed(() => rankCommands(paletteQuery.value, commands.value, 40));
const groupedResults = computed(() => {
  const order = ['Actions', 'Stewards', 'Go to'];
  const groups = new Map<string, DmCommand[]>();
  for (const c of results.value) {
    if (!groups.has(c.group)) groups.set(c.group, []);
    groups.get(c.group)!.push(c);
  }
  return [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([name, items]) => ({ name, items }));
});
const flat = computed(() => groupedResults.value.flatMap(g => g.items));
function flatIndex(gi: number, ci: number) {
  let n = 0;
  for (let i = 0; i < gi; i++) n += groupedResults.value[i].items.length;
  return n + ci;
}
watch(paletteQuery, () => { paletteIndex.value = 0; });
function runCommand(cmd: DmCommand | undefined) {
  if (!cmd) return;
  closePalette();
  cmd.run();
}
function onPaletteKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') { e.preventDefault(); paletteIndex.value = Math.min(flat.value.length - 1, paletteIndex.value + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); paletteIndex.value = Math.max(0, paletteIndex.value - 1); }
  else if (e.key === 'Enter') { e.preventDefault(); runCommand(flat.value[paletteIndex.value]); }
  else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
}
function onGlobalKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); paletteOpen.value ? closePalette() : openPalette(); }
}
onMounted(() => window.addEventListener('keydown', onGlobalKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey));
</script>

<style lang="scss" src="~/assets/scss/demiurge-console.scss"></style>

<style>
/* Layout helpers shared by the Demiurge pages that still render ot-os panels. Drawers teleport to
   <body>, so helpers they use are listed for .ot-drawer as well. The site's global `button` chrome
   (uppercase, padding, glow) is reset inside the shell the same way the other ot-os sections do it. */
html :where(.dm-os, .ot-drawer, .ot-modal-backdrop) button {
  padding: 0;
  border: 0;
  background: none;
  letter-spacing: normal;
  text-transform: none;
  line-height: inherit;
  overflow: visible;
  user-select: none;
}
html :where(.dm-os, .ot-drawer, .ot-modal-backdrop) button:hover { box-shadow: none; border-color: transparent; background-color: transparent; }
html :where(.dm-os, .ot-drawer, .ot-modal-backdrop) button:active { background-color: transparent; }
.dm-os .dm-section { margin-bottom: var(--ot-gutter); }
.dm-os .dm-main { display: grid; gap: var(--ot-gutter); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1240px) { .dm-os .dm-main { grid-template-columns: minmax(0, 1fr) minmax(320px, 380px); } }
.dm-os .dm-pair { display: grid; gap: var(--ot-gutter); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1100px) { .dm-os .dm-pair { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
:is(.dm-os, .ot-drawer) .dm-muted { color: var(--ot-muted); }
:is(.dm-os, .ot-drawer) .dm-mono { font-family: var(--ot-mono); }
:is(.dm-os, .ot-drawer) .dm-link { color: var(--ot-info); cursor: pointer; text-decoration: none; }
:is(.dm-os, .ot-drawer) .dm-link:hover { text-decoration: underline; text-underline-offset: 3px; }
:is(.dm-os, .ot-drawer) .dm-prose { font-size: 13.5px; line-height: 21px; color: var(--ot-text); overflow-wrap: anywhere; }
:is(.dm-os, .ot-drawer) .dm-prose p { margin: 0 0 8px; font-size: inherit; }
:is(.dm-os, .ot-drawer) .dm-prose p:last-child { margin-bottom: 0; }
:is(.dm-os, .ot-drawer) .dm-prose code { font-family: var(--ot-mono); font-size: 12px; background: rgba(255,255,255,0.06); padding: 1px 4px; border-radius: 4px; }
:is(.dm-os, .ot-drawer) .dm-prose pre { background: rgba(0,0,0,0.35); padding: 8px; border-radius: 6px; overflow-x: auto; }
:is(.dm-os, .ot-drawer) .dm-prose ul, :is(.dm-os, .ot-drawer) .dm-prose ol { margin: 4px 0 8px; padding-left: 20px; }
:is(.dm-os, .ot-drawer) .dm-prose a { color: var(--ot-info); }
/* The console's own main supplies the padding; ot-page's would double it. */
.dmx > .dmx-main.ot-page { padding: 14px 20px 48px; }
@media (max-width: 860px) { .dmx > .dmx-main.ot-page { padding: 10px 12px 40px; } .dm-wide-only { display: none; } }
</style>
