<template>
    <div class="os-shell">
        <OmniscienceNav />
        <header class="os-page-heading">
            <div>
                <span class="os-eyebrow">INVESTIGATION WORKSPACE</span>
                <h1>Explore the evidence.</h1>
                <p>Move from a question to the underlying messages, temporal context and relationship evidence — without losing your place.</p>
            </div>
            <button class="os-btn ghost" @click="openCommand"><span>⌕</span> New investigation <kbd>Ctrl K</kbd></button>
        </header>
        <nav class="os-explore-tabs" aria-label="Explorer views">
            <button v-for="view in views" :key="view" :class="{ active: tab === view }" @click="setTab(view)">
                <span>{{ icon(view) }}</span>{{ view }}
            </button>
        </nav>

        <OmniscienceInvestigate v-if="tab === 'Investigate'" :key="'investigate-' + route.fullPath" />
        <template v-else-if="tab === 'Timeline'">
            <section class="os-panel os-explore-person-bar">
                <div class="os-panel-body"><OmnisciencePersonPicker v-model="personId" label="Timeline subject" placeholder="Choose a person…" /></div>
            </section>
            <OmniscienceTimeline :person-id="personId" />
            <OmniscienceActivity v-if="personId" :person-id="personId" />
        </template>
        <OmniscienceCompare v-else-if="tab === 'Compare'" :initial-left="String(route.query.left || '')" :initial-right="String(route.query.right || personId)" />
        <template v-else-if="tab === 'Network'">
            <section class="os-panel os-explore-person-bar">
                <div class="os-panel-body"><OmnisciencePersonPicker v-model="personId" label="Network subject" placeholder="Choose a person…" /></div>
            </section>
            <OmniscienceGraph :person-id="personId" @select="personId = $event" />
        </template>
        <OmniscienceHealth v-else-if="tab === 'Health'" />
    </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'navbar' });
const route = useRoute();
const router = useRouter();
const views = ['Investigate', 'Timeline', 'Compare', 'Network', 'Health'];
const tab = ref(views.includes(String(route.query.tab)) ? String(route.query.tab) : 'Investigate');
const personId = ref(String(route.query.personId || ''));
function icon(view: string) { return ({ Investigate: '⌕', Timeline: '◷', Compare: '⇄', Network: '⌘', Health: '✓' } as any)[view]; }
function setTab(view: string) {
    tab.value = view;
    void router.replace({ query: { ...route.query, tab: view } });
}
function openCommand() { if (import.meta.client) window.dispatchEvent(new CustomEvent('omniscience:command')); }
watch(() => route.query.tab, value => { if (views.includes(String(value))) tab.value = String(value); });
watch(() => route.query.personId, value => { personId.value = String(value || ''); });
</script>

<style scoped>
.os-page-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 18px; }
.os-page-heading h1 { margin: 4px 0 6px; color: var(--os-ink); font-size: clamp(28px,4vw,40px); letter-spacing: -.035em; }
.os-page-heading p { max-width: 690px; margin: 0; color: var(--os-muted); font-size: 12px; line-height: 1.55; }
.os-eyebrow { color: var(--os-cyan); font: 750 9px var(--os-mono); letter-spacing: .13em; }
.os-page-heading kbd { margin-left: 8px; color: var(--os-faint); font: 700 9px var(--os-mono); }
.os-explore-tabs { display: flex; gap: 4px; margin-bottom: 15px; padding: 4px; overflow-x: auto; border: 1px solid var(--os-line); border-radius: 10px; background: rgba(255,255,255,.015); }
.os-explore-tabs button { display: flex; align-items: center; justify-content: center; gap: 7px; flex: 1; min-width: 105px; padding: 8px 12px; border: 0; border-radius: 7px; background: transparent; color: var(--os-muted); cursor: pointer; font-size: 11px; font-weight: 650; white-space: nowrap; }
.os-explore-tabs button span { font-size: 14px; }
.os-explore-tabs button.active { background: rgba(95,211,255,.1); color: var(--os-cyan); box-shadow: inset 0 0 0 1px rgba(95,211,255,.12); }
.os-explore-person-bar .os-panel-body { padding: 11px; }
.os-explore-person-bar .os-person-picker { max-width: 520px; }
@media (max-width: 650px) { .os-page-heading { align-items: flex-start; flex-direction: column; } }
</style>
