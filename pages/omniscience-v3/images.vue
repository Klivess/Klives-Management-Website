<template>
    <OmniscienceV3Shell>
        <div class="ot-pagehead">
            <div>
                <h1>Images</h1>
                <p class="subtitle">Find a picture by describing it. It looks at what the image shows, at its caption, and at any text inside it. Images posted by someone under 18, or by someone whose analysis is switched off, are never searched or shown.</p>
            </div>
        </div>

        <form class="ot-filterbar search" role="search" @submit.prevent="search()">
            <input v-model="filters.q" class="ot-input grow" type="search" maxlength="300" placeholder="e.g. a screenshot of a price chart, a cat on a keyboard" aria-label="Describe the image" data-testid="image-query" />
            <button class="ot-btn primary" type="submit" :disabled="!filters.q.trim()">Search</button>
        </form>
        <div class="ot-filterbar">
            <div class="who"><OmniscienceV3PersonPick v-model="person" :max="1" placeholder="Posted by anyone…" testid="image-person" /></div>
            <input v-model="filters.conversation" class="ot-input mono auto" placeholder="conversation id (optional)" aria-label="Conversation id" />
            <label class="range">From <input v-model="filters.from" class="ot-input" type="date" /></label>
            <label class="range">To <input v-model="filters.to" class="ot-input" type="date" /></label>
            <div class="grow"></div>
            <button v-if="activeCount > 1" class="ot-btn ghost sm" type="button" @click="clear()">Clear filters</button>
        </div>

        <div v-if="r && !r.visualAvailable" class="ot-banner warn" role="status" data-testid="image-no-visual">
            <span class="glyph" aria-hidden="true">⚠</span>
            <div><strong>Searching by what a picture looks like is not available right now.</strong>
                <span class="muted">These results come from captions and from text inside images only.{{ r.note ? ` ${r.note}` : '' }}</span></div>
        </div>
        <p v-else-if="r?.note" class="omni-muted">{{ r.note }}</p>

        <OmniscienceV3Panel :title="r ? `${r.hits.length} image${r.hits.length === 1 ? '' : 's'} for “${r.query}”` : 'Results'" :loading="searching" :error="results.error.value" :has-data="!!r"
                            :empty="!searching && (!r || !r.hits.length)" :empty-kind="r ? 'filtered' : 'empty'" :empty-title="r ? 'No image matches' : 'Describe what you are looking for'"
                            :empty-text="r ? `${omniCount(r.imagesEmbedded)} images can be searched by how they look.` : 'Words work best: what is in the picture, or what it says.'" what="Image search" @retry="search()">
            <ul v-if="r" class="grid" data-testid="image-results">
                <li v-for="h in r.hits" :key="h.attachmentId" :class="{ gone: h.deleted }">
                    <button class="thumb" type="button" :aria-label="h.caption ?? 'Open image'" @click="filters.open = h.attachmentId">
                        <OmniscienceV3Media :attachment-id="h.attachmentId" :alt="h.caption ?? ''" ratio="1 / 1" />
                    </button>
                    <span class="caption">{{ h.caption ?? (h.imageText ? `“${h.imageText}”` : 'No caption yet') }}</span>
                    <span class="meta omni-muted">
                        <NuxtLink v-if="h.authorPersonId" :to="`${OMNI_BASE}/people/${encodeURIComponent(h.authorPersonId)}`">{{ h.authorName ?? h.authorPersonId }}</NuxtLink>
                        <template v-else>unknown</template> · <OmniscienceV3Time :ms="h.sentAtMs" mode="age" />
                    </span>
                    <span class="why"><span v-for="w in h.why" :key="w" class="ot-chip sm">{{ w }}</span><span v-if="h.deleted" class="ot-chip sm warn">deleted at the source</span></span>
                </li>
            </ul>
        </OmniscienceV3Panel>

        <OmniTraderDrawer :open="!!opened" :title="opened?.caption ?? 'Image'" :subtitle="opened ? `${opened.authorName ?? 'unknown'}` : undefined" wide @close="filters.open = ''">
            <template v-if="opened">
                <OmniscienceV3Media :attachment-id="opened.attachmentId" full contain :alt="opened.caption ?? ''" fallback="The file itself is not stored" class="full" />
                <dl class="ot-kv omni-section">
                    <dt>Posted</dt><dd><OmniscienceV3Time :ms="opened.sentAtMs" /></dd>
                    <dt>By</dt><dd><NuxtLink v-if="opened.authorPersonId" :to="`${OMNI_BASE}/people/${encodeURIComponent(opened.authorPersonId)}`">{{ opened.authorName ?? opened.authorPersonId }}</NuxtLink><template v-else>unknown</template></dd>
                    <dt>Caption</dt><dd>{{ opened.caption ?? 'not captioned yet' }}</dd>
                    <dt v-if="opened.tags.length">Tags</dt><dd v-if="opened.tags.length"><span v-for="t in opened.tags" :key="t" class="ot-chip sm">{{ t }}</span></dd>
                    <dt v-if="opened.imageText">Text in it</dt><dd v-if="opened.imageText" class="omni-wrap">{{ opened.imageText }}</dd>
                    <dt>Found because</dt><dd>{{ opened.why.join(', ') }}</dd>
                    <dt>Message</dt><dd class="omni-mono">{{ opened.messageId }}</dd>
                </dl>
                <p class="omni-muted">Captions are written by a model. They describe what is in the picture and never say who anyone is.</p>
            </template>
        </OmniTraderDrawer>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { OMNI_BASE, omniGet } from '~/scripts/omniscience/api';
import type { MediaSearchDto } from '~/scripts/omniscience/contracts';
import { omniCount, omniZonedToMs } from '~/scripts/omniscience/format';
import { useOmniDebounced, useOmniResource, useOmniTime } from '~/composables/useOmniscienceV3';
import { useUrlState } from '~/composables/useOmniTrader';
import type { PickedPerson } from '~/components/OmniscienceV3/PersonPick.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Images' });

const { zone } = useOmniTime();
const { state: filters, reset, activeCount } = useUrlState({ q: '', person: '', conversation: '', from: '', to: '', open: '' });
const person = ref<PickedPerson[]>(filters.person ? [{ id: filters.person, label: null }] : []);
watch(person, list => { filters.person = list[0]?.id ?? ''; });

/** A day typed in the time lens's zone, as the instant it starts (or, for "to", the instant after it ends). */
function day(text: string, end: boolean): number | null {
    if (!text) return null;
    const start = omniZonedToMs(`${text}T00:00`, zone.value);
    return start === null ? null : end ? start + 86_400_000 : start;
}

const results = useOmniResource<MediaSearchDto | null>(signal => (filters.q.trim()
    ? omniGet<MediaSearchDto>('media/search', { q: filters.q.trim(), person: filters.person, conversation: filters.conversation.trim(), from: day(filters.from, false), to: day(filters.to, true), limit: 60 }, signal)
    : Promise.resolve(null)), { immediate: false });
const r = computed(() => results.data.value);
const searching = computed(() => results.refreshing.value);
const opened = computed(() => r.value?.hits.find(h => h.attachmentId === filters.open) ?? null);

function search() { if (filters.q.trim()) void results.refresh(); }
// A link with a query in it searches on arrival. The filters search again once they stop changing: the conversation id is typed, and a search per keystroke would each embed the query again.
useOmniDebounced(() => [filters.person, filters.conversation, filters.from, filters.to].join('\u0001'), () => search());
if (filters.q.trim()) search();

function clear() {
    const q = filters.q;
    reset();
    filters.q = q;
    person.value = [];
}
</script>

<style scoped>
.search { margin-bottom: 8px; }
.search .grow { flex: 1 1 320px; }
.who { min-width: 240px; }
.range { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ot-muted); }
.grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; }
.grid li { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; min-width: 0; }
.grid li.gone { opacity: 0.6; }
.thumb { padding: 0; border: 0; background: none; cursor: pointer; border-radius: var(--ot-radius-sm); overflow: hidden; }
.thumb:focus-visible { outline: 2px solid var(--ot-accent); outline-offset: 2px; }
.caption { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.why { display: flex; flex-wrap: wrap; gap: 4px; }
.full { width: 100%; max-height: 60vh; }
.ot-banner .muted { display: block; color: var(--ot-text-2); }
</style>
