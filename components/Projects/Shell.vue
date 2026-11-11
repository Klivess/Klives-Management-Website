<template>
  <div class="pjx ot-os pj-os" data-testid="pjx-root">
    <!-- ot-os and pj-os stay on the root for the panels that still render ot-os components; .pjx
         re-themes them (projects-console.scss) so every Projects page reads as one surface. The comment
         lives inside the root: above it, dev builds render a two-node fragment and Nuxt cannot
         navigate away from the page. -->
    <a class="ot-skiplink" href="#pj-main">Skip to content</a>

    <header class="pjx-bar">
      <NuxtLink class="pjx-bar__brand" to="/projects" aria-label="Projects home">
        <span class="pjx-bar__mark" :data-working="working || undefined"><ProjectsIcon name="bot" /></span>
        <span class="pjx-bar__title">Projects</span>
      </NuxtLink>

      <nav class="pjx-nav" aria-label="Projects sections">
        <NuxtLink v-for="s in primary" :key="s.id" :to="s.to" class="pjx-nav__link" :class="{ active: section === s.id }" :aria-current="section === s.id ? 'page' : undefined">
          <ProjectsIcon :name="s.icon" />{{ s.label }}<span v-if="s.id === 'computers' && hostProblem" class="pjx-nav__badge" data-tone="fault" title="The computer host needs attention" aria-hidden="true">!</span>
        </NuxtLink>
        <span class="pjx-nav__sep" aria-hidden="true"></span>
        <NuxtLink v-for="s in insight" :key="s.id" :to="s.to" class="pjx-nav__link" :class="{ active: section === s.id }" :aria-current="section === s.id ? 'page' : undefined">
          <ProjectsIcon :name="s.icon" />{{ s.label }}
        </NuxtLink>
      </nav>

      <span v-if="crumb" class="pjx-bar__crumb pj-wide-only">
        <ProjectsIcon name="chevron-right" class="pjx-faint" /><b :title="crumb">{{ crumb }}</b>
      </span>

      <span class="pjx-bar__spacer"></span>

      <div class="pjx-bar__actions">
        <button class="pjx-search" aria-label="Jump to a project or action" aria-keyshortcuts="Control+K" data-testid="pjx-search" @click="openPalette">
          <ProjectsIcon name="search" />
          <span class="pjx-search__text">Jump to a project…</span>
          <span class="pjx-kbd">Ctrl</span><span class="pjx-kbd">K</span>
        </button>
        <span v-if="status" class="pjx-live" :data-state="working ? 'live' : 'idle'" :data-tone="liveTone" :title="status">
          <span class="pjx-live__dot"></span><span class="pjx-truncate" style="max-width: 26ch">{{ status }}</span>
        </span>
        <slot name="top" />
        <NuxtLink to="/projects/new" class="pjx-btn pjx-btn--primary pjx-btn--sm" aria-label="New project"><ProjectsIcon name="plus" /><span class="pjx-wide-text">New project</span></NuxtLink>
      </div>
    </header>

    <main id="pj-main" class="pjx-main ot-page">
      <slot />
    </main>

    <Teleport to="body">
      <div v-if="paletteOpen" class="pjx-layer pjx-scrim" @click="closePalette"></div>
      <div v-if="paletteOpen" class="pjx-layer pjx-palette" role="dialog" aria-modal="true" aria-label="Jump to">
        <label class="pjx-palette__input">
          <ProjectsIcon name="search" />
          <input ref="paletteInput" v-model="paletteQuery" type="text" placeholder="Project, page or action…" aria-label="Search projects, pages and actions" @keydown="onPaletteKey" />
          <span class="pjx-kbd">Esc</span>
        </label>
        <div class="pjx-palette__list" role="listbox" aria-label="Results">
          <template v-for="(group, gi) in groupedResults" :key="group.name">
            <div class="pjx-palette__group">{{ group.name }}</div>
            <button
              v-for="(cmd, ci) in group.items"
              :key="cmd.id"
              class="pjx-palette__item"
              role="option"
              :aria-selected="flatIndex(gi, ci) === paletteIndex"
              :data-active="flatIndex(gi, ci) === paletteIndex || undefined"
              @mouseenter="paletteIndex = flatIndex(gi, ci)"
              @click="runCommand(cmd)"
            >
              <ProjectsIcon :name="cmd.icon" />
              <span class="pjx-palette__label">{{ cmd.title }}</span>
              <span v-if="cmd.hint" class="pjx-palette__hint">{{ cmd.hint }}</span>
            </button>
          </template>
          <div v-if="!results.length" class="pjx-empty"><ProjectsIcon name="search" />Nothing matches “{{ paletteQuery }}”.</div>
        </div>
        <div class="pjx-palette__foot"><span><span class="pjx-kbd">↑</span> <span class="pjx-kbd">↓</span> move</span><span><span class="pjx-kbd">Enter</span> open</span></div>
      </div>
      <div class="pjx-layer pjx-toasts" aria-live="polite">
        <div v-for="t in toasts" :key="t.id" class="pjx-toast" :data-tone="t.tone" role="status"><ProjectsIcon :name="t.icon" />{{ t.text }}</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { pjxGet, usePjxPoll, usePjxToasts } from '~/composables/useProjectsConsole';
import { useAccess } from '~/composables/useAccess';
import { projectState, rankCommands, type PjCommand } from '~/scripts/projectsConsole';
import ProjectsIcon from '~/components/Projects/Icon.vue';

const props = defineProps<{
  /** One line on what the fleet (or this project) is doing right now. */
  status?: string;
  statusTone?: 'ok' | 'warn' | 'bad' | '';
  /** True while agents are actively working, so the mark and status breathe. */
  working?: boolean;
  /** Project name shown after the section nav inside a workspace. */
  crumb?: string;
  /** Page-specific palette actions (halt all, broadcast, pause this project…). */
  commands?: PjCommand[];
}>();

// Every Projects page reads as one surface: the ot-os tokens follow while the shell is mounted.
useHead({ htmlAttrs: { class: 'pjx-theme' } });

const route = useRoute();
const router = useRouter();
const { toasts } = usePjxToasts();

const primary = [
  { id: 'operations', label: 'Operations', to: '/projects', icon: 'layers' },
  { id: 'computers', label: 'Computers', to: '/projects/computers', icon: 'monitor' },
  { id: 'playbooks', label: 'Playbooks', to: '/projects/playbooks', icon: 'book' },
  { id: 'accounts', label: 'Accounts', to: '/projects/accounts', icon: 'key' },
];
const insight = [
  { id: 'analytics', label: 'Analytics', to: '/projects/analytics', icon: 'chart' },
  { id: 'costs', label: 'Costs', to: '/projects/cost-simulator', icon: 'coins' },
];
// Whole path segments only: a project whose ID happens to start with "computers" is still a workspace.
const SECTIONS: Record<string, string> = {
  computers: 'computers', playbooks: 'playbooks', accounts: 'accounts',
  analytics: 'analytics', 'cost-simulator': 'costs', new: 'new',
};
// A project workspace belongs to Operations (it is where the board leads).
const section = computed(() => SECTIONS[route.path.split('/').filter(Boolean)[1] ?? ''] ?? 'operations');
const liveTone = computed(() => props.statusTone === 'bad' ? 'fault' : props.statusTone === 'warn' ? 'need' : props.working ? 'work' : 'rest');

// Host health drives the Computers badge; checked every 30 s, never while the tab is hidden, and only for a
// profile that may read it (an Accounts-only profile would otherwise collect a 403 every 30 s).
const access = useAccess();
const canOverview = computed(() => access.can('projects.overview.view'));
const host = ref<any>(null);
const hostProblem = computed(() => !!(host.value?.daemonProblem || host.value?.available === false || host.value?.restartRequired));
usePjxPoll(async () => {
  if (!canOverview.value) return;
  const r = await pjxGet('/projects/computers/health');
  if (r.ok) host.value = r.body;
}, 30_000);

// ── palette ──
const paletteOpen = ref(false);
const paletteQuery = ref('');
const paletteIndex = ref(0);
const paletteInput = ref<HTMLInputElement | null>(null);
const projects = ref<{ projectID: string; name: string; status: string; halted: boolean; executionDisposition: string; pendingApprovals: number }[]>([]);
let projectsLoadedAt = 0;

async function openPalette() {
  paletteOpen.value = true;
  paletteQuery.value = '';
  paletteIndex.value = 0;
  await nextTick();
  paletteInput.value?.focus();
  if (canOverview.value && Date.now() - projectsLoadedAt > 30_000) {
    const r = await pjxGet<any[]>('/projects/list');
    if (r.ok && Array.isArray(r.body)) { projects.value = r.body; projectsLoadedAt = Date.now(); }
  }
}
function closePalette() { paletteOpen.value = false; }

const commands = computed<PjCommand[]>(() => {
  const go = (title: string, to: string, icon: string, keywords = ''): PjCommand => ({ id: `go:${to}`, title, group: 'Go to', icon, keywords, run: () => router.push(to) });
  const list: PjCommand[] = [];
  list.push(...(props.commands ?? []));
  const sorted = [...projects.value].sort((a, b) => Number(a.status === 'Archived') - Number(b.status === 'Archived') || a.name.localeCompare(b.name));
  for (const p of sorted) {
    const state = projectState({ status: p.status, halted: p.halted, workingAgents: 0, executionDisposition: p.executionDisposition });
    list.push({
      id: `p:${p.projectID}`, title: p.name || '(untitled)', group: 'Projects', icon: state.icon,
      hint: p.pendingApprovals ? `${p.pendingApprovals} waiting · ${state.label}` : state.label,
      keywords: `${p.projectID} ${state.label}`,
      run: () => router.push(`/projects/${p.projectID}`),
    });
  }
  list.push(
    { id: 'new', title: 'New project', group: 'Actions', icon: 'plus', keywords: 'create start', run: () => router.push('/projects/new') },
    go('Operations', '/projects', 'layers', 'fleet overview home'),
    go('Computers', '/projects/computers', 'monitor', 'desktops containers docker'),
    go('Playbooks', '/projects/playbooks', 'book', 'sites how-to'),
    go('Accounts', '/projects/accounts', 'key', 'logins passwords registry'),
    go('Analytics', '/projects/analytics', 'chart', 'insight trends'),
    go('Costs', '/projects/cost-simulator', 'coins', 'spend simulator price'),
  );
  return list;
});
const results = computed(() => rankCommands(paletteQuery.value, commands.value, 40));
const groupedResults = computed(() => {
  const order = ['Actions', 'Projects', 'Go to'];
  const groups = new Map<string, PjCommand[]>();
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
function runCommand(cmd: PjCommand | undefined) {
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

<style lang="scss" src="~/assets/scss/projects-console.scss"></style>

<style>
/* Layout helpers shared by the Projects pages that still render ot-os panels. Drawers teleport to
   <body>, so helpers they use are listed for .ot-drawer as well. The site's global `button` chrome
   (uppercase, padding, glow) is reset inside the shell the same way the other ot-os sections do it. */
html :where(.pj-os, .ot-drawer, .ot-modal-backdrop) button {
  padding: 0;
  border: 0;
  background: none;
  letter-spacing: normal;
  text-transform: none;
  line-height: inherit;
  overflow: visible;
  user-select: none;
}
html :where(.pj-os, .ot-drawer, .ot-modal-backdrop) button:hover { box-shadow: none; border-color: transparent; background-color: transparent; }
html :where(.pj-os, .ot-drawer, .ot-modal-backdrop) button:active { background-color: transparent; }
.pj-os .pj-section { margin-bottom: var(--ot-gutter); }
.pj-os .pj-main { display: grid; gap: var(--ot-gutter); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1240px) { .pj-os .pj-main { grid-template-columns: minmax(0, 1fr) minmax(320px, 380px); } }
.pj-os .pj-pair { display: grid; gap: var(--ot-gutter); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1100px) { .pj-os .pj-pair { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
:is(.pj-os, .ot-drawer) .pj-muted { color: var(--ot-muted); }
:is(.pj-os, .ot-drawer) .pj-mono { font-family: var(--ot-mono); }
:is(.pj-os, .ot-drawer) .pj-link { color: var(--ot-info); cursor: pointer; text-decoration: none; }
:is(.pj-os, .ot-drawer) .pj-link:hover { text-decoration: underline; text-underline-offset: 3px; }
:is(.pj-os, .ot-drawer) .pj-prose { font-size: 13.5px; line-height: 21px; color: var(--ot-text); overflow-wrap: anywhere; }
:is(.pj-os, .ot-drawer) .pj-prose p { margin: 0 0 8px; font-size: inherit; }
:is(.pj-os, .ot-drawer) .pj-prose p:last-child { margin-bottom: 0; }
:is(.pj-os, .ot-drawer) .pj-prose code { font-family: var(--ot-mono); font-size: 12px; background: rgba(255,255,255,0.06); padding: 1px 4px; border-radius: 4px; }
:is(.pj-os, .ot-drawer) .pj-prose pre { background: rgba(0,0,0,0.35); padding: 8px; border-radius: 6px; overflow-x: auto; }
:is(.pj-os, .ot-drawer) .pj-prose ul, :is(.pj-os, .ot-drawer) .pj-prose ol { margin: 4px 0 8px; padding-left: 20px; }
:is(.pj-os, .ot-drawer) .pj-prose a { color: var(--ot-info); }
/* The console's own main supplies the padding; ot-page's would double it. */
.pjx > .pjx-main.ot-page { padding: 14px 20px 48px; }
@media (max-width: 860px) { .pjx > .pjx-main.ot-page { padding: 10px 12px 40px; } .pj-wide-only { display: none; } }
</style>
