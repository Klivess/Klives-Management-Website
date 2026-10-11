<template>
    <!-- What needs a decision comes first; a healthy scraper shows nothing here. -->
    <div v-if="items.length" class="ms-attention">
        <div v-for="item in items" :key="item.key" class="ot-banner" :class="item.tone" role="status">
            <span class="glyph" aria-hidden="true">{{ item.tone === '' ? '⚠' : item.tone === 'warn' ? '!' : 'ℹ' }}</span>
            <div>
                <strong>{{ item.title }}</strong>
                {{ item.detail }}
            </div>
            <div v-if="item.action" class="actions">
                <button v-if="item.action === 'resume' && can('memescraper.scrape.run')" class="ot-btn sm" :disabled="busy" @click="resume">Resume schedule</button>
                <NuxtLink v-else-if="item.action === 'health' && !onHealth" class="ot-btn sm" :to="{ path: '/schemery/memescraper/health', query: range.linkQuery.value }">Open Health</NuxtLink>
                <NuxtLink v-else-if="item.action === 'sources' && !onSources" class="ot-btn sm" :to="{ path: '/schemery/memescraper/sources', query: { ...range.linkQuery.value, state: 'attention' } }">Show sources</NuxtLink>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAccess } from '~/composables/useAccess';
import { msPost, providerLabel, toast, useMemeHealth, useMemeRange } from '~/composables/useMemeScraper';

const props = withDefaults(defineProps<{ showServerNote?: boolean }>(), { showServerNote: false });

const route = useRoute();
const { can } = useAccess();
const range = useMemeRange();
const { health, refresh } = useMemeHealth();
const busy = ref(false);
const onHealth = computed(() => route.path.startsWith('/schemery/memescraper/health'));
const onSources = computed(() => route.path.startsWith('/schemery/memescraper/sources'));

interface Item { key: string; tone: '' | 'warn' | 'info'; title: string; detail: string; action?: 'resume' | 'health' | 'sources' }

const items = computed<Item[]>(() => {
    const h = health.value;
    if (!h || !h.DataLoaded) return [];
    const out: Item[] = [];
    const state = h.SchedulerState ?? '';
    if (state.startsWith('failed') || state.startsWith('tick failed')) {
        out.push({ key: 'scheduler', tone: '', title: 'The scheduler is broken', detail: state, action: 'health' });
    }
    const providers = h.Providers ?? [];
    const failing = providers.filter(p => p.ConsecutiveFailures > 0);
    if (providers.length && failing.length === providers.length) {
        out.push({ key: 'providers', tone: '', title: 'Every provider is failing', detail: `Nothing can be scraped until one works again. ${failing[0].LastError ?? ''}`.trim(), action: 'health' });
    } else if (failing.length) {
        out.push({ key: 'providers', tone: 'warn', title: `${failing.map(p => providerLabel(p.Name)).join(', ')} failing`, detail: 'Scrapes fall back to the other provider. A passing provider check re-enables it.', action: 'health' });
    }
    const reelSources = (h.Sources ?? []).filter(s => s.DownloadReels);
    const broken = reelSources.filter(s => (s.ConsecutiveScrapeFailures ?? 0) >= 3);
    if (broken.length) {
        out.push({
            key: 'sources', tone: '',
            title: broken.length === 1 ? `@${broken[0].Username} keeps failing` : `${broken.length} sources keep failing`,
            detail: broken.length === 1 ? (broken[0].LastScrapeError ?? '') : broken.slice(0, 4).map(s => `@${s.Username}`).join(', ') + (broken.length > 4 ? ` and ${broken.length - 4} more` : ''),
            action: 'sources',
        });
    }
    if (h.Settings?.Paused || state.startsWith('paused')) {
        out.push({ key: 'paused', tone: 'warn', title: 'Scheduled scrapes are paused', detail: 'No source is scraped on its own until the schedule is resumed. Manual scrapes still work.', action: 'resume' });
    }
    if (props.showServerNote && !h.OnServer) {
        out.push({ key: 'server', tone: 'info', title: 'Not the scraping server', detail: 'Scheduled scrapes only run on the server; manual scrapes and provider checks still work from here.' });
    }
    return out;
});

async function resume() {
    busy.value = true;
    try {
        const result = await msPost('/memescraper/saveSettings', { paused: false });
        if (result.ok) {
            toast('Schedule resumed');
            await refresh();
        } else if (result.status !== 401 && result.status !== 403) {
            toast(result.error ?? 'Could not resume the schedule', 'error');
        }
    } finally {
        busy.value = false;
    }
}
</script>
