<template>
    <div class="omni-v3">
        <a class="omni-skiplink" href="#omni-main">Skip to content</a>

        <header class="omni-top">
            <NuxtLink class="omni-brand" :to="OMNI_BASE" aria-label="Omniscience: the brief">
                <span class="mark" aria-hidden="true">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                        <circle cx="8" cy="8" r="2.1" fill="currentColor" stroke="none" /><ellipse cx="8" cy="8" rx="6.6" ry="3.4" /><ellipse cx="8" cy="8" rx="3.4" ry="6.6" opacity="0.55" />
                    </svg>
                </span>
                <b>Omniscience</b><small>v3 · shadow</small>
            </NuxtLink>
            <button class="omni-find omni-cmd" type="button" aria-label="Find a page, a person or a tactic" @click="palette = true">
                <span aria-hidden="true">⌕</span><span class="what">Find a page, a person, a tactic…</span><kbd>Ctrl K</kbd>
            </button>
            <span class="omni-chip" :class="phaseTone" :title="phaseTitle" data-testid="omni-phase">
                <span class="omni-dot" :class="phaseTone"></span>{{ phaseLabel }}
            </span>
            <span v-if="deadJobs" class="omni-chip bad omni-top-dead" title="Jobs that failed every attempt and wait for a decision">
                <NuxtLink :to="`${OMNI_BASE}/jobs?state=dead`">{{ deadJobs }} dead job{{ deadJobs === 1 ? '' : 's' }}</NuxtLink>
            </span>
            <span v-if="status?.llm?.circuitOpen" class="omni-chip bad omni-hide-sm" title="LLM calls are failing; background work is paused until they recover">LLM circuit open</span>
            <span v-else-if="status?.llm?.backgroundPaused" class="omni-chip warn omni-hide-sm" title="Background LLM work is yielding to interactive use">LLM background paused</span>
            <span class="omni-top-spacer"></span>
            <div class="omni-segment sm" role="group" aria-label="Time zone for every time on these pages">
                <button type="button" :aria-pressed="lens === 'Klives'" :title="`Times in ${klivesZone}`" @click="setLens('Klives')">{{ klivesZoneShort }}</button>
                <button type="button" :aria-pressed="lens === 'Utc'" title="Times in UTC" @click="setLens('Utc')">UTC</button>
            </div>
            <span class="omni-fresh omni-hide-sm" :class="freshTone" :title="statusAt ? utc(statusAt) : ''">
                <span class="omni-dot" :class="freshDot"></span>{{ statusAt ? age(statusAt) : '…' }}
            </span>
        </header>

        <!-- Two levels: the five areas, then the pages of the one you are in (or are pointing at). Every page is two clicks away at most. -->
        <nav class="omni-nav" aria-label="Omniscience" @mouseleave="leaveNav()" @mouseenter="stayInNav()">
            <div class="omni-nav-areas">
                <NuxtLink class="omni-area" :class="{ here: onBrief }" :to="OMNI_BASE" :aria-current="onBrief ? 'page' : undefined" @mouseenter="point('')">Brief</NuxtLink>
                <button v-for="area in AREAS" :key="area.id" class="omni-area" type="button" :class="{ here: area.id === hereArea, shown: area.id === shownArea && area.id !== hereArea }"
                        :aria-expanded="area.id === shownArea" :data-area="area.id" @mouseenter="point(area.id)" @focus="point(area.id)" @click="point(area.id)">
                    {{ area.label }}
                    <span v-if="area.id === 'engine' && deadJobs" class="omni-badge">{{ deadJobs }}</span>
                </button>
            </div>
            <div v-if="shown" class="omni-nav-pages" data-testid="omni-nav-pages">
                <NuxtLink v-for="item in shown.items" :key="item.to" :to="item.to" :class="{ active: isActive(item.to) }" :aria-current="isActive(item.to) ? 'page' : undefined">
                    {{ item.label }}
                    <span v-if="item.to.endsWith('/jobs') && deadJobs" class="omni-badge">{{ deadJobs }}</span>
                </NuxtLink>
                <span class="hint">{{ shown.hint }}</span>
            </div>
        </nav>

        <main id="omni-main" class="omni-page">
            <div v-if="banner" class="omni-banner" :class="banner.tone" role="status" data-testid="omni-engine-banner">
                <span class="glyph" aria-hidden="true">{{ banner.glyph }}</span>
                <div><strong>{{ banner.title }}</strong><span class="muted">{{ banner.detail }}</span></div>
                <div class="actions"><button class="omni-btn sm" type="button" @click="refreshStatus()">Check again</button></div>
            </div>
            <slot />
        </main>

        <Teleport to="body">
            <div class="omni-layer">
                <div v-if="palette" class="omni-palette" @click.self="palette = false">
                    <div class="box" role="dialog" aria-modal="true" aria-label="Go to">
                        <div class="ask">
                            <span aria-hidden="true">⌕</span>
                            <input ref="paletteInput" v-model="paletteText" type="text" placeholder="A page, a person's name, a tactic…" aria-label="Search pages, people and tactics"
                                   @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="choose(flat[paletteIndex])" />
                            <span v-if="searching" class="omni-muted">searching…</span>
                        </div>
                        <ul role="listbox">
                            <template v-for="section in sections" :key="section.title">
                                <li class="head" role="presentation">{{ section.title }}</li>
                                <li v-for="entry in section.items" :key="entry.to" role="option" :aria-selected="flat[paletteIndex] === entry"
                                    :class="{ active: flat[paletteIndex] === entry }" @mouseenter="paletteIndex = flat.indexOf(entry)" @click="choose(entry)">
                                    <span v-if="entry.kind === 'person'" class="omni-avatar" aria-hidden="true">{{ initials(entry.label) }}</span>
                                    <span class="label">{{ entry.label }}</span><span class="group">{{ entry.group }}</span>
                                </li>
                            </template>
                            <li v-if="!flat.length" class="muted">Nothing matches “{{ paletteText }}”.</li>
                        </ul>
                        <div class="foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>
                    </div>
                </div>
                <div class="omni-toasts" aria-live="polite">
                    <div v-for="toast in toasts" :key="toast.id" class="omni-banner" :class="toast.tone === 'bad' ? '' : toast.tone" role="status">
                        <span>{{ toast.text }}</span>
                        <div class="actions"><button class="omni-btn ghost sm" type="button" aria-label="Dismiss" @click="dismiss(toast.id)">✕</button></div>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { OMNI_BASE, omniGet } from '~/scripts/omniscience/api';
import type { DirectoryPageDto, TacticCatalogDto } from '~/scripts/omniscience/contracts';
import { omniCount } from '~/scripts/omniscience/format';
import { useOmniEngine, useOmniRecent, useOmniTime, useOmniToasts } from '~/composables/useOmniscienceV3';
import { useAccess } from '~/composables/useAccess';

/**
 * The frame around every Omniscience page: what the engine is doing right now, the time lens every
 * timestamp obeys, navigation in two levels, the command palette (pages, people, tactics) and toasts.
 * It also loads Omniscience's own stylesheet, so a page needs nothing but this component around it.
 */

const route = useRoute();
const router = useRouter();
const { can } = useAccess();
const { status, statusError, statusAt, klivesZone, refreshStatus } = useOmniEngine();
const { lens, setLens, age, utc, now } = useOmniTime();
const { toasts, dismiss } = useOmniToasts();
const { recent } = useOmniRecent();

const AREAS = [
    { id: 'work', label: 'Work', hint: 'Question the messages and run tactics', items: [
        { to: `${OMNI_BASE}/explore`, label: 'Explore' },
        { to: `${OMNI_BASE}/tactics`, label: 'Tactics' },
        { to: `${OMNI_BASE}/playbooks`, label: 'Playbooks' },
        { to: `${OMNI_BASE}/cohorts`, label: 'Cohorts' },
        { to: `${OMNI_BASE}/live`, label: 'Live' },
    ] },
    { id: 'people', label: 'People', hint: 'Who they are and how they connect', items: [
        { to: `${OMNI_BASE}/people`, label: 'People' },
        { to: `${OMNI_BASE}/communities`, label: 'Communities' },
        { to: `${OMNI_BASE}/links`, label: 'Links' },
        { to: `${OMNI_BASE}/images`, label: 'Images' },
        { to: `${OMNI_BASE}/replicas`, label: 'Replicas' },
    ] },
    { id: 'knowledge', label: 'Knowledge', hint: 'What is known, and what waits for a decision', items: [
        { to: `${OMNI_BASE}/ask`, label: 'Ask' },
        { to: `${OMNI_BASE}/review`, label: 'Review' },
        { to: `${OMNI_BASE}/agenda`, label: 'Agenda' },
    ] },
    { id: 'watch', label: 'Watch', hint: 'What happened while you were away', items: [
        { to: `${OMNI_BASE}/signals`, label: 'Signals' },
        { to: `${OMNI_BASE}/digests`, label: 'Digests' },
        { to: `${OMNI_BASE}/health`, label: 'Health' },
    ] },
    { id: 'engine', label: 'Engine', hint: 'How the machine itself is doing', items: [
        { to: `${OMNI_BASE}/engine`, label: 'Overview' },
        { to: `${OMNI_BASE}/sources`, label: 'Sources' },
        { to: `${OMNI_BASE}/modules`, label: 'Modules' },
        { to: `${OMNI_BASE}/jobs`, label: 'Jobs' },
        { to: `${OMNI_BASE}/llm`, label: 'LLM' },
        { to: `${OMNI_BASE}/quality`, label: 'Quality Lab' },
        { to: `${OMNI_BASE}/data`, label: 'Data controls' },
        { to: `${OMNI_BASE}/settings`, label: 'Settings' },
    ] },
];

const path = computed(() => route.path.replace(/\/+$/, ''));
function isActive(to: string): boolean { return path.value === to || path.value.startsWith(`${to}/`); }
const onBrief = computed(() => path.value === OMNI_BASE);
const hereArea = computed(() => AREAS.find(area => area.items.some(item => isActive(item.to)))?.id ?? '');

// The second row shows the area being pointed at, and falls back to the one this page belongs to.
const pointed = ref<string | null>(null);
let leaveTimer: ReturnType<typeof setTimeout> | null = null;
const shownArea = computed(() => pointed.value ?? hereArea.value);
const shown = computed(() => AREAS.find(area => area.id === shownArea.value) ?? null);
function stayInNav() { if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; } }
function point(id: string) { stayInNav(); pointed.value = id; }
function leaveNav() {
    stayInNav();
    leaveTimer = setTimeout(() => { pointed.value = null; }, 320);
}
watch(path, () => { pointed.value = null; });

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

interface PaletteEntry { to: string; label: string; group: string; kind: 'page' | 'person' | 'tactic' }

const palette = ref(false);
const paletteText = ref('');
const paletteIndex = ref(0);
const paletteInput = ref<HTMLInputElement | null>(null);
const tacticEntries = ref<PaletteEntry[]>([]);
const peopleEntries = ref<PaletteEntry[]>([]);
const searching = ref(false);
let tacticsLoaded = false;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchSeq = 0;

const personTo = (id: string) => `${OMNI_BASE}/people/${encodeURIComponent(id)}`;
function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return (words.length === 1 ? words[0]!.slice(0, 2) : words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

const pageEntries: PaletteEntry[] = [
    { to: OMNI_BASE, label: 'Brief', group: 'Start', kind: 'page' },
    ...AREAS.flatMap(area => area.items.map(item => ({ to: item.to, label: item.label, group: area.label, kind: 'page' as const }))),
];
const sections = computed(() => {
    const needle = paletteText.value.trim().toLowerCase();
    const matching = (entries: PaletteEntry[]) => (needle ? entries.filter(e => `${e.label} ${e.group}`.toLowerCase().includes(needle)) : entries);
    const out: { title: string; items: PaletteEntry[] }[] = [];
    if (!needle && recent.value.length)
        out.push({ title: 'Opened recently', items: recent.value.map(r => ({ to: personTo(r.id), label: r.name, group: 'Person', kind: 'person' as const })) });
    if (peopleEntries.value.length) out.push({ title: 'People', items: peopleEntries.value });
    const pages = matching(pageEntries);
    if (pages.length) out.push({ title: 'Pages', items: pages });
    // Eighty tactics would bury the pages, so they are listed once something is typed.
    const tactics = needle ? matching(tacticEntries.value).slice(0, 12) : [];
    if (tactics.length) out.push({ title: 'Tactics', items: tactics });
    return out;
});
const flat = computed(() => sections.value.flatMap(section => section.items));

function move(step: number) {
    if (!flat.value.length) return;
    paletteIndex.value = (paletteIndex.value + step + flat.value.length) % flat.value.length;
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
            to: `${OMNI_BASE}/tactics?tactic=${encodeURIComponent(t.key)}`, label: `${t.code} ${t.title}`, group: `Tactic · ${t.category}`, kind: 'tactic' as const,
        }));
    } catch {
        // The palette still lists pages; the Tactics page explains why the catalogue is missing.
        tacticsLoaded = false;
    }
}

/** People by name, as you type: the fastest way to a person from anywhere. */
function searchPeople(text: string) {
    if (searchTimer) clearTimeout(searchTimer);
    const q = text.trim();
    if (q.length < 2 || !can('omniscience.persons.read') || status.value?.phase !== 'Ready') { searchSeq++; peopleEntries.value = []; searching.value = false; return; }
    searching.value = true;
    searchTimer = setTimeout(async () => {
        const mine = ++searchSeq;
        try {
            const page = await omniGet<DirectoryPageDto>('people', { q, sort: 'Messages', limit: 6 });
            if (mine !== searchSeq) return;
            peopleEntries.value = page.items.map(p => ({ to: personTo(p.personId), label: p.displayName, group: `${p.tier} · ${omniCount(p.msgs)} messages`, kind: 'person' as const }));
        } catch {
            if (mine === searchSeq) peopleEntries.value = [];
        } finally {
            if (mine === searchSeq) searching.value = false;
        }
    }, 180);
}

watch(palette, async open => {
    if (!open) return;
    paletteText.value = '';
    paletteIndex.value = 0;
    peopleEntries.value = [];
    void loadTactics();
    await nextTick();
    paletteInput.value?.focus();
});
watch(paletteText, text => { paletteIndex.value = 0; searchPeople(text); });
watch(flat, entries => { if (paletteIndex.value >= entries.length) paletteIndex.value = 0; });

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
    if (searchTimer) clearTimeout(searchTimer);
    stayInNav();
    window.removeEventListener('keydown', onKeydown);
});
</script>

<style lang="scss" src="~/assets/scss/omniscience-v3.scss"></style>
