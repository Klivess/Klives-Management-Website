<template>
  <div class="ot-os pj-os">
    <a class="ot-skiplink" href="#pj-main">Skip to content</a>
    <div class="pj-band" :class="bandTone" role="presentation"></div>

    <header class="ot-top">
      <NuxtLink class="ot-brand" to="/projects">
        <b>Projects</b>
        <small class="pj-wide-only">Autonomous operations</small>
      </NuxtLink>
      <span v-if="status" class="ot-scope pj-status" :title="status">
        <span class="ot-dot" :class="[statusTone, { 'pj-pulse': working }]" aria-hidden="true"></span>
        <span class="pj-trunc">{{ status }}</span>
      </span>
      <span v-if="hostProblem" class="ot-scope pj-wide-only">
        <span class="sep" aria-hidden="true">·</span>
        <NuxtLink to="/projects/computers" class="pj-hostwarn">Computers unavailable</NuxtLink>
      </span>
      <div class="ot-top-spacer"></div>
      <slot name="top" />
      <NuxtLink to="/projects/new" class="ot-btn primary sm">+ New project</NuxtLink>
    </header>

    <nav class="ot-nav" aria-label="Projects sections">
      <div class="ot-nav-group">
        <NuxtLink to="/projects" :class="{ active: section === 'operations' }">Operations</NuxtLink>
        <NuxtLink to="/projects/computers" :class="{ active: section === 'computers' }">
          Computers
          <span v-if="hostProblem" class="ot-badge" title="The computer host needs attention">!</span>
        </NuxtLink>
        <NuxtLink to="/projects/playbooks" :class="{ active: section === 'playbooks' }">Playbooks</NuxtLink>
        <NuxtLink to="/projects/accounts" :class="{ active: section === 'accounts' }">Accounts</NuxtLink>
      </div>
      <div class="ot-nav-group">
        <span class="label" aria-hidden="true">Insight</span>
        <NuxtLink to="/projects/analytics" :class="{ active: section === 'analytics' }">Analytics</NuxtLink>
        <NuxtLink to="/projects/cost-simulator" :class="{ active: section === 'costs' }">Costs</NuxtLink>
      </div>
      <div v-if="crumb" class="ot-nav-group pj-crumb">
        <span class="label" aria-hidden="true">Project</span>
        <span class="pj-crumb-name" :title="crumb">{{ crumb }}</span>
      </div>
    </nav>

    <main id="pj-main" class="ot-page">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useProjectsHostHealth } from '~/composables/useProjectsUi';

const props = defineProps<{
  /** One line on what the fleet (or this project) is doing right now. */
  status?: string;
  statusTone?: 'ok' | 'warn' | 'bad' | '';
  /** True while agents are actively working, so the status dot pulses. */
  working?: boolean;
  /** Project name shown at the end of the nav inside a workspace. */
  crumb?: string;
}>();

const route = useRoute();
const { health } = useProjectsHostHealth(30000);
const hostProblem = computed(() => !!(health.value?.daemonProblem || health.value?.available === false || health.value?.restartRequired));

// Whole path segments only: a project whose ID happens to start with "computers" is still a workspace.
const SECTIONS: Record<string, string> = {
  computers: 'computers', playbooks: 'playbooks', accounts: 'accounts',
  analytics: 'analytics', 'cost-simulator': 'costs', new: 'new',
};
const section = computed(() => SECTIONS[route.path.split('/').filter(Boolean)[1] ?? ''] ?? 'operations');

const bandTone = computed(() => hostProblem.value || props.statusTone === 'bad' ? 'bad'
  : props.statusTone === 'warn' ? 'warn' : props.working ? 'good' : 'idle');
</script>

<style scoped>
.pj-band { height: 3px; width: 100%; background: var(--ot-line-strong); }
.pj-band.good { background: linear-gradient(90deg, #4ec98a, #6ddc4f); }
.pj-band.warn { background: var(--ot-warning); }
.pj-band.bad { background: var(--ot-negative); box-shadow: 0 0 12px rgba(255, 107, 107, 0.45); }
.pj-band.idle { background: var(--ot-info); opacity: 0.55; }
.ot-nav a { display: inline-flex; align-items: center; gap: 4px; }
/* Long Projects pages scroll under the sticky section nav; blur it like the top bar so it stays legible. */
.ot-nav { background: rgba(18, 21, 15, 0.92); backdrop-filter: blur(8px); }
.pj-status { min-width: 0; flex: 0 1 auto; }
.pj-trunc { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.pj-hostwarn { color: var(--ot-negative); text-decoration: underline; text-underline-offset: 3px; }
.pj-pulse { animation: pj-pulse 1.4s ease-in-out infinite; }
@keyframes pj-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.pj-crumb { margin-left: auto; min-width: 0; }
.pj-crumb-name { font-size: 12.5px; color: var(--ot-text); padding: 0 var(--ot-space-2); max-width: 32ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 720px) {
  .pj-wide-only { display: none; }
  .pj-crumb { display: none; }
}
</style>

<style>
/* Layout helpers shared by every Projects page. Drawers teleport to <body>, so helpers they use are
   listed for .ot-drawer as well. The site's global `button` chrome (uppercase, padding, glow) is reset
   inside the shell the same way the other ot-os sections do it. */
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
@media (max-width: 720px) {
  .pj-os .ot-top { padding: 0 var(--ot-space-3); gap: var(--ot-space-2); }
}
</style>
