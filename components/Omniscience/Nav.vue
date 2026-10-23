<template>
    <nav class="os-workspace-nav" aria-label="Omniscience workspace">
        <NuxtLink class="os-workspace-brand" to="/omniscience" aria-label="Omniscience overview">
            <span class="os-brand-mark">O</span>
            <span><strong>Omniscience</strong><small>Intelligence workspace</small></span>
        </NuxtLink>
        <div class="os-workspace-links">
            <NuxtLink v-for="item in items" :key="item.to" :to="item.to" :class="{ active: isActive(item) }">
                <span>{{ item.code }}</span>{{ item.label }}
            </NuxtLink>
        </div>
        <button type="button" class="os-command-trigger" @click="openCommand">
            <span>⌕</span><span class="os-command-trigger-label">Search or command</span><kbd>Ctrl K</kbd>
        </button>
    </nav>
</template>

<script setup lang="ts">
const route = useRoute();
const items = [
    { to: '/omniscience', label: 'Overview', code: '01', match: '/omniscience' },
    { to: '/omniscience-explore', label: 'Explore', code: '02', match: '/omniscience-explore' },
    { to: '/omniscience-search', label: 'Ask & semantic', code: '03', match: '/omniscience-search' },
    { to: '/omniscience-review', label: 'Review', code: '04', match: '/omniscience-review' },
    { to: '/omniscience-explore?tab=Health', label: 'Data health', code: '05', match: 'health' },
];
function isActive(item: any) {
    if (item.match === 'health') return route.path === '/omniscience-explore' && route.query.tab === 'Health';
    if (item.to === '/omniscience-explore') return route.path === item.to && route.query.tab !== 'Health';
    if (item.to === '/omniscience') return route.path === '/omniscience' || route.path === '/omniscience-person';
    return route.path === item.match;
}
function openCommand() {
    if (import.meta.client) window.dispatchEvent(new CustomEvent('omniscience:command'));
}
</script>

<style scoped>
.os-workspace-nav { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: 18px; margin: -18px -18px 22px; padding: 11px 18px; border-bottom: 1px solid var(--os-line); background: rgba(7,11,18,.88); backdrop-filter: blur(18px); }
.os-workspace-brand { display: flex; align-items: center; gap: 9px; color: var(--os-ink); text-decoration: none; white-space: nowrap; }
.os-brand-mark { display: grid; place-items: center; width: 31px; height: 31px; border: 1px solid rgba(95,211,255,.45); border-radius: 9px; background: linear-gradient(145deg,rgba(95,211,255,.18),rgba(151,113,255,.16)); color: var(--os-cyan); font: 800 16px var(--os-mono); box-shadow: inset 0 0 14px rgba(95,211,255,.08); }
.os-workspace-brand strong, .os-workspace-brand small { display: block; }
.os-workspace-brand strong { font-size: 13px; letter-spacing: .01em; }
.os-workspace-brand small { color: var(--os-muted); font-size: 9px; text-transform: uppercase; letter-spacing: .09em; }
.os-workspace-links { display: flex; align-items: center; gap: 3px; flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; }
.os-workspace-links a { display: inline-flex; align-items: center; gap: 6px; padding: 7px 9px; border-radius: 7px; color: var(--os-muted); text-decoration: none; font-size: 11px; font-weight: 650; white-space: nowrap; }
.os-workspace-links a span { color: var(--os-faint); font: 700 9px var(--os-mono); }
.os-workspace-links a:hover { color: var(--os-ink); background: rgba(255,255,255,.04); }
.os-workspace-links a.active { color: var(--os-ink); background: rgba(95,211,255,.09); }
.os-workspace-links a.active span { color: var(--os-cyan); }
.os-command-trigger { display: flex; align-items: center; gap: 8px; min-width: 210px; padding: 7px 9px; border: 1px solid var(--os-line); border-radius: 8px; background: rgba(255,255,255,.025); color: var(--os-muted); cursor: pointer; font: 500 11px inherit; text-align: left; }
.os-command-trigger > span:first-child { color: var(--os-cyan); font-size: 16px; }
.os-command-trigger-label { flex: 1; }
kbd { padding: 2px 5px; border: 1px solid var(--os-line); border-radius: 4px; color: var(--os-faint); background: rgba(255,255,255,.03); font: 700 9px var(--os-mono); }
@media (max-width: 980px) { .os-workspace-brand small, .os-command-trigger-label { display: none; } .os-command-trigger { min-width: auto; } .os-workspace-nav { gap: 10px; } }
@media (max-width: 640px) { .os-workspace-nav { margin: -12px -12px 16px; padding: 9px 12px; } .os-workspace-brand > span:last-child, .os-workspace-links a span { display: none; } .os-workspace-links a { padding: 7px; } }
</style>
