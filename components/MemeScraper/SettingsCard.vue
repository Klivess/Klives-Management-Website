<template>
    <OmniTraderCard title="Schedule" subtitle="How often each source is scraped and how deep" :loading="!settings && !error" :error="error ?? undefined" @retry="load">
        <form v-if="settings" class="form" @submit.prevent="save">
            <label class="ms-switch">
                <input v-model="draft.enabled" type="checkbox" :disabled="!editable || saving" />
                <span class="track" aria-hidden="true"></span>
                <span>
                    <b>{{ draft.enabled ? 'Scheduled scrapes are on' : 'Scheduled scrapes are paused' }}</b>
                    <small>{{ draft.enabled ? 'Each source is scraped when it falls due.' : 'Nothing runs on its own; manual scrapes still work.' }}</small>
                </span>
            </label>

            <div class="ot-formgrid">
                <div class="ot-field" :class="{ invalid: intervalProblem }">
                    <label for="ms-interval">Scrape each source every</label>
                    <div class="inline">
                        <input id="ms-interval" v-model.number="draft.interval" class="ot-input mono" type="number" min="1" max="336" step="1" :disabled="!editable || saving" />
                        <span class="unit">hours</span>
                    </div>
                    <div class="presets">
                        <button v-for="h in [6, 12, 24, 48]" :key="h" type="button" class="ot-btn ghost sm" :class="{ active: draft.interval === h }" :disabled="!editable || saving" @click="draft.interval = h">{{ h }} h</button>
                    </div>
                    <span class="help">{{ intervalProblem ?? 'A new value applies from each source’s next scrape.' }}</span>
                </div>
                <div class="ot-field" :class="{ invalid: pagesProblem }">
                    <label for="ms-pages">Pages per scrape</label>
                    <div class="inline">
                        <input id="ms-pages" v-model.number="draft.pages" class="ot-input mono" type="number" min="1" max="500" step="1" :disabled="!editable || saving" />
                        <span class="unit">× 12 reels</span>
                    </div>
                    <span class="help">{{ pagesProblem ?? 'How far back inflact is paged. Scrapes stop early once they reach reels already saved.' }}</span>
                </div>
            </div>

            <div v-if="settings.OnServer === false" class="ot-banner info">
                <span class="glyph" aria-hidden="true">ℹ</span>
                <div>This server is not the scraping server, so the schedule never runs here. The settings are shared with it.</div>
            </div>

            <div class="row">
                <span v-if="!editable" class="muted">Changing the schedule needs the “Run the scraper” permission.</span>
                <span class="grow"></span>
                <button v-if="dirty" type="button" class="ot-btn ghost sm" :disabled="saving" @click="reset">Undo</button>
                <button type="submit" class="ot-btn primary sm" :disabled="!editable || !dirty || saving || !!intervalProblem || !!pagesProblem">{{ saving ? 'Saving…' : 'Save schedule' }}</button>
            </div>
        </form>
    </OmniTraderCard>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useAccess } from '~/composables/useAccess';
import { msGet, msPost, toast, useMemeHealth, type ScraperSettings } from '~/composables/useMemeScraper';

const { can } = useAccess();
const { refresh } = useMemeHealth();
const editable = computed(() => can('memescraper.scrape.run'));

const settings = ref<ScraperSettings | null>(null);
const error = ref<string | null>(null);
const saving = ref(false);
const draft = reactive({ enabled: true, interval: 24, pages: 40 });

const dirty = computed(() => !!settings.value && (draft.enabled === settings.value.Paused
    || draft.interval !== settings.value.IntervalHours || draft.pages !== settings.value.MaxPagesPerScrape));
const intervalProblem = computed(() => (!Number.isInteger(draft.interval) || draft.interval < 1 || draft.interval > 336 ? 'Between 1 and 336 hours (two weeks).' : null));
const pagesProblem = computed(() => (!Number.isInteger(draft.pages) || draft.pages < 1 || draft.pages > 500 ? 'Between 1 and 500 pages.' : null));

function reset() {
    if (!settings.value) return;
    draft.enabled = !settings.value.Paused;
    draft.interval = settings.value.IntervalHours;
    draft.pages = settings.value.MaxPagesPerScrape;
}

async function load() {
    error.value = null;
    const result = await msGet<ScraperSettings>('/memescraper/settings');
    if (result.ok && result.data) {
        settings.value = result.data;
        reset();
    } else {
        error.value = result.error ?? 'The settings could not be loaded.';
    }
}

async function save() {
    if (!settings.value) return;
    saving.value = true;
    try {
        const body: Record<string, unknown> = {};
        if (draft.enabled === settings.value.Paused) body.paused = !draft.enabled;
        if (draft.interval !== settings.value.IntervalHours) body.intervalHours = draft.interval;
        if (draft.pages !== settings.value.MaxPagesPerScrape) body.maxPagesPerScrape = draft.pages;
        const result = await msPost<ScraperSettings>('/memescraper/saveSettings', body);
        if (result.ok && result.data) {
            settings.value = result.data;
            reset();
            toast('Schedule saved');
            void refresh();
        } else if (result.status !== 401 && result.status !== 403) {
            toast(result.error ?? 'The schedule could not be saved', 'error');
        }
    } finally {
        saving.value = false;
    }
}

onMounted(load);
</script>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--ot-space-4); }
.inline { display: flex; align-items: center; gap: var(--ot-space-2); }
.inline .ot-input { width: 96px; }
.unit { font-size: 12px; color: var(--ot-muted); white-space: nowrap; }
.presets { display: flex; gap: var(--ot-space-1); flex-wrap: wrap; }
.row { display: flex; align-items: center; gap: var(--ot-space-2); flex-wrap: wrap; }
.grow { flex: 1 1 auto; }
.ms-switch { display: flex; align-items: center; gap: var(--ot-space-3); cursor: pointer; }
.ms-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.ms-switch .track { position: relative; flex: 0 0 auto; width: 38px; height: 20px; border-radius: 999px; background: var(--ot-surface-3); border: 1px solid var(--ot-line-strong); transition: background var(--ot-fast); }
.ms-switch .track::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--ot-text-2); transition: transform var(--ot-fast); }
.ms-switch input:checked + .track { background: var(--ot-accent); border-color: var(--ot-accent); }
.ms-switch input:checked + .track::after { transform: translateX(18px); background: var(--ot-on-accent); }
.ms-switch input:focus-visible + .track { outline: var(--ot-focus) solid var(--ot-accent); outline-offset: 2px; }
.ms-switch input:disabled + .track { opacity: 0.5; }
.ms-switch b { display: block; font-size: 13px; font-weight: 600; }
.ms-switch small { display: block; font-size: 11.5px; color: var(--ot-muted); }
</style>
