<template>
    <div class="ot-os omni-v3">
        <a class="ot-skiplink" href="#omni-main">Skip to content</a>

        <header class="ot-top">
            <NuxtLink class="ot-brand" :to="OMNI_BASE"><b>OMNISCIENCE</b><small>v3 · shadow</small></NuxtLink>
            <button class="ot-btn ghost sm omni-cmd" type="button" @click="palette = true">
                <span aria-hidden="true">⌕</span> Go to… <kbd>Ctrl K</kbd>
            </button>
            <span class="ot-chip" :class="phaseTone" :title="phaseTitle" data-testid="omni-phase">
                <span class="ot-dot" :class="phaseTone"></span>{{ phaseLabel }}
            </span>
            <span v-if="deadJobs" class="ot-chip bad" title="Jobs that failed every attempt and wait for a decision">
                <NuxtLink :to="`${OMNI_BASE}/jobs?state=dead`">{{ deadJobs }} dead job{{ deadJobs === 1 ? '' : 's' }}</NuxtLink>
            </span>
            <span v-if="status?.llm?.circuitOpen" class="ot-chip bad" title="LLM calls are failing; background work is paused until they recover">LLM circuit open</span>
            <span v-else-if="status?.llm?.backgroundPaused" class="ot-chip warn" title="Background LLM work is yielding to interactive use">LLM background paused</span>
            <span class="ot-top-spacer"></span>
            <div class="ot-segment sm" role="group" aria-label="Time zone for every time on these pages">
                <button type="button" :aria-pressed="lens === 'Klives'" :title="`Times in ${klivesZone}`" @click="setLens('Klives')">{{ klivesZoneShort }}</button>
                <button type="button" :aria-pressed="lens === 'Utc'" title="Times in UTC" @click="setLens('Utc')">UTC</button>
            </div>
            <span class="ot-fresh" :class="freshTone" :title="statusAt ? utc(statusAt) : ''">
                <span class="ot-dot" :class="freshDot"></span>{{ statusAt ? age(statusAt) : '…' }}
            </span>
        </header>

        <nav class="ot-nav" aria-label="Omniscience">
            <div v-for="group in NAV" :key="group.label" class="ot-nav-group">
                <span class="label">{{ group.label }}</span>
                <NuxtLink v-for="item in group.items" :key="item.to" :to="item.to" :class="{ active: isActive(item.to) }"
                          :aria-current="isActive(item.to) ? 'page' : undefined">
                    {{ item.label }}
                    <span v-if="item.to.endsWith('/jobs') && deadJobs" class="ot-badge">{{ deadJobs }}</span>
                </NuxtLink>
            </div>
        </nav>

        <main id="omni-main" class="ot-page">
            <div v-if="banner" class="ot-banner" :class="banner.tone" role="status" data-testid="omni-engine-banner">
                <span class="glyph" aria-hidden="true">{{ banner.glyph }}</span>
                <div><strong>{{ banner.title }}</strong><span class="muted">{{ banner.detail }}</span></div>
                <div class="actions"><button class="ot-btn sm" type="button" @click="refreshStatus()">Check again</button></div>
            </div>
            <slot />
        </main>

        <Teleport to="body">
            <div v-if="palette" class="ot-palette" @click.self="palette = false" @keydown.esc="palette = false">
                <div class="box" role="dialog" aria-modal="true" aria-label="Go to">
                    <input ref="paletteInput" v-model="paletteText" type="text" placeholder="Page or tactic…" aria-label="Search pages and tactics"
                           @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="choose(matches[paletteIndex])" />
                    <ul role="listbox">
                        <li v-for="(entry, i) in matches" :key="entry.to" role="option" :aria-selected="i === paletteIndex"
                            :class="{ active: i === paletteIndex }" @mouseenter="paletteIndex = i" @click="choose(entry)">
                            <span>{{ entry.label }}</span><span class="group">{{ entry.group }}</span>
                        </li>
                        <li v-if="!matches.length" class="muted">Nothing matches “{{ paletteText }}”.</li>
                    </ul>
                </div>
            </div>
            <div class="omni-toasts ot-os" aria-live="polite">
                <div v-for="toast in toasts" :key="toast.id" class="ot-banner" :class="toast.tone === 'bad' ? '' : toast.tone" role="status">
                    <span>{{ toast.text }}</span>
                    <div class="actions"><button class="ot-btn ghost sm" type="button" aria-label="Dismiss" @click="dismiss(toast.id)">✕</button></div>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { OMNI_BASE, omniGet } from '~/scripts/omniscience/api';
import type { TacticCatalogDto } from '~/scripts/omniscience/contracts';
import { useOmniEngine, useOmniTime, useOmniToasts } from '~/composables/useOmniscienceV3';

/**
 * Frame for every Omniscience v3 page: what the engine is doing right now, the time lens every
 * timestamp on the page obeys, navigation, the command palette and toasts.
 */

const route = useRoute();
const router = useRouter();
const { status, statusError, statusAt, klivesZone, refreshStatus } = useOmniEngine();
const { lens, setLens, age, utc, now } = useOmniTime();
const { toasts, dismiss } = useOmniToasts();

const NAV = [
    { label: 'Work', items: [
        { to: `${OMNI_BASE}/explore`, label: 'Explore' },
        { to: `${OMNI_BASE}/tactics`, label: 'Tactics' },
        { to: `${OMNI_BASE}/playbooks`, label: 'Playbooks' },
        { to: `${OMNI_BASE}/cohorts`, label: 'Cohorts' },
        { to: `${OMNI_BASE}/live`, label: 'Live' },
    ] },
    { label: 'People', items: [
        { to: `${OMNI_BASE}/people`, label: 'People' },
        { to: `${OMNI_BASE}/communities`, label: 'Communities' },
        { to: `${OMNI_BASE}/links`, label: 'Links' },
    ] },
    { label: 'Watch', items: [
        { to: `${OMNI_BASE}/signals`, label: 'Signals' },
        { to: `${OMNI_BASE}/digests`, label: 'Digests' },
        { to: `${OMNI_BASE}/health`, label: 'Health' },
    ] },
    { label: 'Engine', items: [
        { to: OMNI_BASE, label: 'Overview' },
        { to: `${OMNI_BASE}/modules`, label: 'Modules' },
        { to: `${OMNI_BASE}/jobs`, label: 'Jobs' },
        { to: `${OMNI_BASE}/llm`, label: 'LLM' },
        { to: `${OMNI_BASE}/data`, label: 'Data controls' },
        { to: `${OMNI_BASE}/settings`, label: 'Settings' },
    ] },
];

function isActive(to: string): boolean {
    const path = route.path.replace(/\/+$/, '');
    return to === OMNI_BASE ? path === OMNI_BASE : path === to || path.startsWith(`${to}/`);
}

const klivesZoneShort = computed(() => klivesZone.value.split('/').pop()?.replace(/_/g, ' ') ?? klivesZone.value);
const deadJobs = computed(() => (status.value?.lanes ?? []).reduce((sum, lane) => sum + lane.dead, 0));

const phaseLabel = computed(() => {
    if (status.value) return status.value.phase === 'Starting' ? `Starting · ${status.value.stage}` : status.value.phase;
    return statusError.value ? 'Unreachable' : '…';
});
const phaseTone = computed(() => {
    switch (status.value?.phase) {
        case 'Ready': return 'ok';
        case 'Starting': case 'Stopping': return 'warn';
        case 'Failed': return 'bad';
        case 'Disabled': return '';
        default: return statusError.value ? 'bad' : '';
    }
});
const phaseTitle = computed(() => status.value?.failure ?? statusError.value?.message ?? '');

const banner = computed(() => {
    const s = status.value;
    if (!s) {
        if (!statusError.value) return null;
        if (statusError.value.kind === 'forbidden')
            return { tone: 'warn', glyph: '🔒', title: 'You cannot see the engine status.', detail: statusError.value.message };
        return { tone: '', glyph: '⚠', title: 'Omniscience v3 is not answering.', detail: statusError.value.message };
    }
    if (s.phase === 'Disabled')
        return { tone: 'info', glyph: 'ℹ', title: 'Omniscience v3 is installed but switched off.', detail: 'Set OmniscienceV3_ShadowEnabled to true to run it in shadow mode beside the current service.' };
    if (s.phase === 'Starting')
        return { tone: 'warn', glyph: '…', title: 'Omniscience v3 is starting.', detail: `Stage: ${s.stage}. Pages fill in once it is ready.` };
    if (s.phase === 'Failed')
        return { tone: '', glyph: '⚠', title: 'Omniscience v3 failed to start.', detail: `${s.failure ?? 'No reason was recorded.'} The service log has the details.` };
    if (s.phase === 'Stopping')
        return { tone: 'warn', glyph: '…', title: 'Omniscience v3 is stopping.', detail: 'The server is shutting the engine down.' };
    return null;
});

const freshAge = computed(() => (statusAt.value === null ? Infinity : now.value - statusAt.value));
const freshTone = computed(() => (statusError.value ? 'failed' : freshAge.value > 45_000 ? 'stale' : ''));
const freshDot = computed(() => (statusError.value ? 'bad' : freshAge.value > 45_000 ? 'warn' : 'ok'));

// ── command palette ──────────────────────────────────────────────────────────

interface PaletteEntry { to: string; label: string; group: string }

const palette = ref(false);
const paletteText = ref('');
const paletteIndex = ref(0);
const paletteInput = ref<HTMLInputElement | null>(null);
const tacticEntries = ref<PaletteEntry[]>([]);
let tacticsLoaded = false;

const entries = computed<PaletteEntry[]>(() => [
    ...NAV.flatMap(group => group.items.map(item => ({ to: item.to, label: item.label, group: group.label }))),
    ...tacticEntries.value,
]);
const matches = computed(() => {
    const needle = paletteText.value.trim().toLowerCase();
    const all = entries.value;
    return (needle ? all.filter(e => `${e.label} ${e.group}`.toLowerCase().includes(needle)) : all).slice(0, 30);
});

function move(step: number) {
    if (!matches.value.length) return;
    paletteIndex.value = (paletteIndex.value + step + matches.value.length) % matches.value.length;
}

function choose(entry: PaletteEntry | undefined) {
    if (!entry) return;
    palette.value = false;
    void router.push(entry.to);
}

async function loadTactics() {
    if (tacticsLoaded || status.value?.phase !== 'Ready') return;
    tacticsLoaded = true;
    try {
        const catalog = await omniGet<TacticCatalogDto>('tactics');
        tacticEntries.value = catalog.tactics.map(t => ({
            to: `${OMNI_BASE}/tactics?tactic=${encodeURIComponent(t.key)}`, label: `${t.code} ${t.title}`, group: `Tactic · ${t.category}`,
        }));
    } catch {
        // The palette still lists pages; the Tactics page explains why the catalogue is missing.
        tacticsLoaded = false;
    }
}

watch(palette, async open => {
    if (!open) return;
    paletteText.value = '';
    paletteIndex.value = 0;
    void loadTactics();
    await nextTick();
    paletteInput.value?.focus();
});
watch(paletteText, () => { paletteIndex.value = 0; });

function onKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        palette.value = !palette.value;
    } else if (event.key === 'Escape' && palette.value) {
        palette.value = false;
    }
}

let poll: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
    void refreshStatus();
    poll = setInterval(() => { if (!document.hidden) void refreshStatus(); }, 10_000);
    window.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
    if (poll) clearInterval(poll);
    window.removeEventListener('keydown', onKeydown);
});
</script>

<style scoped>
.omni-cmd { gap: 8px; color: var(--ot-muted); }
.omni-cmd kbd { font-family: var(--ot-mono); font-size: 10px; padding: 1px 5px; border: 1px solid var(--ot-line-strong); border-radius: 3px; }
.ot-chip a { color: inherit; text-decoration: none; }
.ot-banner .muted { display: block; color: var(--ot-text-2); }
</style>

<style>
.omni-toasts {
    position: fixed;
    left: 236px;
    bottom: 16px;
    z-index: 2000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(420px, calc(100vw - 32px));
    min-height: 0;
    background: transparent;
    pointer-events: none;
}
.omni-toasts > .ot-banner { pointer-events: auto; margin: 0; background-color: var(--ot-surface-2); box-shadow: 0 12px 34px rgba(0, 0, 0, 0.5); }
@media (max-width: 768px) { .omni-toasts { left: 16px; } }
.omni-v3 .visually-hidden, .ot-drawer .visually-hidden {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
.omni-v3 .omni-mono, .ot-drawer .omni-mono { font-family: var(--ot-mono); font-size: 12px; }
.omni-v3 .omni-muted, .ot-drawer .omni-muted { color: var(--ot-muted); }
.omni-v3 .omni-wrap, .ot-drawer .omni-wrap { overflow-wrap: anywhere; }
.omni-v3 .omni-row, .ot-drawer .omni-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.omni-v3 .omni-section, .ot-drawer .omni-section { margin-top: 16px; }
.omni-v3 .omni-section > h4, .ot-drawer .omni-section > h4 { margin: 0 0 8px; font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--ot-muted); }
</style>
