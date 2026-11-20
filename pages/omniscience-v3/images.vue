<template>
    <OmniscienceV3Shell>
        <div class="omni-pagehead">
            <div>
                <h1>Images</h1>
                <p class="subtitle">Find a picture by describing it. It looks at what the image shows, at its caption, and at any text inside it. Images posted by someone under 18, or by someone whose analysis is switched off, are never searched or shown.</p>
            </div>
        </div>

        <form class="omni-filterbar search" role="search" @submit.prevent="search()">
            <input v-model="filters.q" class="omni-input grow" type="search" maxlength="300" placeholder="e.g. a screenshot of a price chart, a cat on a keyboard" aria-label="Describe the image" data-testid="image-query" />
            <button class="omni-btn primary" type="submit" :disabled="!filters.q.trim()">Search</button>
        </form>
        <OmniscienceV3FilterBar :filters="narrow" label="Narrow the images" testid="image" />

        <div v-if="r && !r.visualAvailable" class="omni-banner warn" role="status" data-testid="image-no-visual">
            <span class="glyph" aria-hidden="true">⚠</span>
            <div><strong>Searching by what a picture looks like is not available right now.</strong>
                <span class="muted">These results come from captions and from text inside images only.{{ r.note ? ` ${r.note}` : '' }}</span></div>
        </div>
        <p v-else-if="r?.note" class="omni-muted">{{ r.note }}</p>

        <OmniscienceV3Panel :title="r ? `${r.hits.length} image${r.hits.length === 1 ? '' : 's'} for “${r.query}”` : 'Results'" :loading="searching" :refreshing="searching" :error="results.error.value" :has-data="!!r"
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
                    <span v-if="place(h)" class="place omni-muted" :title="place(h) ?? undefined">{{ place(h) }}</span>
                    <span v-if="h.messageText" class="said" :title="h.messageText">“{{ h.messageText }}{{ h.messageTextCut ? '…' : '' }}”</span>
                    <span class="why">
                        <span v-if="h.kind" class="omni-chip sm info">{{ h.kind }}</span>
                        <span v-for="w in h.why" :key="w" class="omni-chip sm">{{ w }}</span>
                        <span v-if="h.timesPosted > 1" class="omni-chip sm" :title="`This exact file has been posted ${h.timesPosted} times`">posted {{ h.timesPosted }}×</span>
                        <span v-if="h.reactions > 0" class="omni-chip sm">{{ omniCount(h.reactions) }} reaction{{ h.reactions === 1 ? '' : 's' }}</span>
                        <span v-if="h.deleted" class="omni-chip sm warn">deleted at the source</span>
                    </span>
                </li>
            </ul>
        </OmniscienceV3Panel>

        <OmniscienceV3Drawer :open="!!opened" :title="opened?.caption ?? 'Image'" :subtitle="opened ? [opened.authorName ?? 'unknown', place(opened)].filter(Boolean).join(' · ') : undefined" wide @close="filters.open = ''">
            <template v-if="opened">
                <OmniscienceV3Media :attachment-id="opened.attachmentId" full contain :alt="opened.caption ?? ''" fallback="The file itself is not stored" class="full" />

                <div class="actions" data-testid="image-actions">
                    <template v-if="opened.messageUrl">
                        <a class="omni-btn primary" :href="opened.messageUrl" target="_blank" rel="noopener noreferrer" data-testid="image-discord">Open in Discord ↗</a>
                        <a class="omni-btn" :href="appLink(opened.messageUrl)" data-testid="image-discord-app" title="Opens the Discord app on this device, at the message">Open in the app</a>
                        <button class="omni-btn" type="button" data-testid="image-copy-link" @click="copyLink(opened.messageUrl)">{{ copied ? 'Link copied' : 'Copy message link' }}</button>
                    </template>
                    <button v-if="narrow.values.conversation !== opened.conversationId" class="omni-btn ghost" type="button" data-testid="image-only-here" @click="onlyHere(opened.conversationId)">Only images from here</button>
                    <button v-if="opened.guildId && narrow.values.guild !== opened.guildId" class="omni-btn ghost" type="button" data-testid="image-only-server" @click="onlyServer(opened)">Only this server</button>
                    <button v-if="opened.authorPersonId && narrow.values.person !== opened.authorPersonId" class="omni-btn ghost" type="button" data-testid="image-only-them" @click="onlyThem(opened)">Only their images</button>
                </div>
                <p v-if="opened.messageUrl && opened.deleted" class="omni-muted note">The message was deleted at the source: the link opens where it was, and Discord will not find it there.</p>
                <p v-else-if="!opened.messageUrl && noLink(opened)" class="omni-muted note" data-testid="image-no-link">{{ noLink(opened) }}</p>

                <section class="omni-section" data-testid="image-post">
                    <h4>The post</h4>
                    <dl class="omni-kv">
                        <dt>Posted</dt>
                        <dd><OmniscienceV3Time :ms="opened.sentAtMs" />
                            <span v-if="opened.edited" class="omni-chip sm gap">edited since</span>
                            <span v-if="opened.deleted" class="omni-chip sm warn gap">deleted at the source</span></dd>
                        <dt>By</dt><dd><NuxtLink v-if="opened.authorPersonId" :to="`${OMNI_BASE}/people/${encodeURIComponent(opened.authorPersonId)}`">{{ opened.authorName ?? opened.authorPersonId }}</NuxtLink><template v-else>unknown</template></dd>
                        <template v-if="place(opened)">
                            <dt>Where</dt><dd>{{ place(opened) }}<span v-if="opened.platform" class="omni-chip sm gap">{{ opened.platform }}</span></dd>
                        </template>
                        <template v-if="opened.platform">
                            <dt>Said with it</dt>
                            <dd v-if="opened.messageText" class="words">{{ opened.messageText }}{{ opened.messageTextCut ? '…' : '' }}</dd>
                            <dd v-else class="omni-muted">nothing was written with it</dd>
                        </template>
                        <template v-if="opened.inMessage > 1">
                            <dt>In the message</dt><dd>picture {{ opened.position }} of {{ opened.inMessage }} attachments</dd>
                        </template>
                        <template v-if="opened.reactions > 0">
                            <dt>Reactions</dt><dd>{{ omniCount(opened.reactions) }}</dd>
                        </template>
                        <template v-if="opened.messageUrl">
                            <dt>Link</dt><dd><a :href="opened.messageUrl" target="_blank" rel="noopener noreferrer">{{ opened.messageUrl }}</a></dd>
                        </template>
                    </dl>
                </section>

                <section class="omni-section" data-testid="image-shows">
                    <h4>What it shows</h4>
                    <dl class="omni-kv">
                        <dt>Caption</dt><dd>{{ opened.caption ?? 'not captioned yet' }}</dd>
                        <template v-if="opened.kind"><dt>Kind</dt><dd>{{ opened.kind }}</dd></template>
                        <template v-if="opened.tags.length"><dt>Tags</dt><dd><span v-for="t in opened.tags" :key="t" class="omni-chip sm">{{ t }}</span></dd></template>
                        <template v-if="opened.imageText"><dt>Text in it</dt><dd class="omni-wrap">{{ opened.imageText }}</dd></template>
                        <template v-if="opened.altText"><dt>Their description</dt><dd class="omni-wrap">{{ opened.altText }}</dd></template>
                        <template v-if="opened.nsfw || opened.spoiler">
                            <dt>Marked</dt>
                            <dd><span v-if="opened.spoiler" class="omni-chip sm warn">posted as a spoiler</span>
                                <span v-if="opened.nsfw" class="omni-chip sm warn" title="The caption model's reading of the picture, not a platform label">sensitive, by the caption model's reading</span></dd>
                        </template>
                        <dt>Found because</dt><dd>{{ opened.why.join(', ') }}</dd>
                        <template v-if="opened.captionedAtMs">
                            <dt>Captioned</dt><dd><OmniscienceV3Time :ms="opened.captionedAtMs" /><template v-if="opened.captionModel"> · by {{ opened.captionModel }}</template></dd>
                        </template>
                    </dl>
                </section>

                <section class="omni-section" data-testid="image-file">
                    <h4>The file</h4>
                    <dl class="omni-kv">
                        <template v-if="opened.filename"><dt>Name</dt><dd>{{ opened.filename }}</dd></template>
                        <template v-if="opened.mime"><dt>Type</dt><dd>{{ opened.mime }}</dd></template>
                        <template v-if="opened.width && opened.height"><dt>Size</dt><dd>{{ opened.width }} × {{ opened.height }} px</dd></template>
                        <template v-if="opened.sizeBytes"><dt>Weight</dt><dd>{{ omniBytes(opened.sizeBytes) }}</dd></template>
                        <template v-if="opened.takenAtMs"><dt>Taken</dt><dd><OmniscienceV3Time :ms="opened.takenAtMs" /> <span class="omni-muted">· from the file itself</span></dd></template>
                        <template v-if="opened.timesPosted > 1"><dt>Posted</dt><dd>{{ omniCount(opened.timesPosted) }} times, this one included <span class="omni-muted">· the exact same file</span></dd></template>
                        <dt>Attachment</dt><dd>{{ opened.attachmentId }}</dd>
                        <dt>Message</dt><dd>{{ opened.messageId }}</dd>
                        <dt>Conversation</dt><dd>{{ opened.conversationId }}</dd>
                    </dl>
                </section>
                <p class="omni-muted note">Captions are written by a model. They describe what is in the picture and never say who anyone is.</p>
            </template>
        </OmniscienceV3Drawer>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { OMNI_BASE, omniGet } from '~/scripts/omniscience/api';
import type { MediaSearchDto, MediaSearchHitDto } from '~/scripts/omniscience/contracts';
import { omniBytes, omniCount } from '~/scripts/omniscience/format';
import { omniFilterDefaults, omniScopeFilters, type OmniFilterDef } from '~/scripts/omniscience/filters';
import { useOmniDebounced, useOmniResource } from '~/composables/useOmniscienceV3';
import { useOmniUrlState } from '~/composables/useOmniscienceV3';
import { useOmniFilters, useOmniPickLabels } from '~/composables/useOmniFilters';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Images' });

// Who posted it, where and when (the filters every search shares), then what the image itself is.
const ABOUT: OmniFilterDef[] = [
    { key: 'kind', kind: 'options', label: 'Kind of image', any: 'any', param: 'kinds', help: 'What the caption model took it to be. An image with no caption yet has no kind.',
        options: ['photo', 'screenshot', 'meme', 'drawing', 'chart', 'document', 'other'].map(k => ({ id: k, label: k[0]!.toUpperCase() + k.slice(1) })) },
    { key: 'format', kind: 'options', label: 'Format', any: 'any', param: 'formats', options: [{ id: 'png', label: 'PNG' }, { id: 'jpeg', label: 'JPEG' }, { id: 'gif', label: 'GIF' }, { id: 'webp', label: 'WebP' }] },
    { key: 'text', kind: 'flag', label: 'Text in it', any: 'With or without', yes: 'With text in it', no: 'Without text', param: 'hasText' },
    { key: 'deleted', kind: 'flag', label: 'Deleted', any: 'Shown either way', yes: 'Only deleted at the source', no: 'Hide deleted ones', param: 'deleted' },
    { key: 'sensitive', kind: 'flag', label: 'Sensitive', any: 'Shown either way', yes: 'Only marked sensitive', no: 'Hide marked sensitive', param: 'nsfw',
        help: 'The caption model’s reading of the picture, not a platform label.' },
];
const FILTERS = [...omniScopeFilters('Posted by'), ...ABOUT];

const { state: filters } = useOmniUrlState({ q: '', open: '', ...omniFilterDefaults(FILTERS) });
const narrow = useOmniFilters(FILTERS, filters);
const { remember } = useOmniPickLabels();

const results = useOmniResource<MediaSearchDto | null>(signal => (filters.q.trim()
    ? omniGet<MediaSearchDto>('media/search', { q: filters.q.trim(), ...narrow.params(), limit: 60 }, signal)
    : Promise.resolve(null)), { immediate: false });
const r = computed(() => results.data.value);
const searching = computed(() => results.refreshing.value);
const opened = computed(() => r.value?.hits.find(h => h.attachmentId === filters.open) ?? null);

/**
 * Where an image was posted, in words: "#general in Some server", "Direct chat", "Group chat: the lads".
 * Null when the server said nothing about the place (an engine older than this page).
 */
function place(h: MediaSearchHitDto): string | null {
    const title = h.conversationTitle?.trim() || null;
    if (h.conversationKind === 'dm') return title ? `Direct chat: ${title}` : 'Direct chat';
    if (h.conversationKind === 'group_dm') return title ? `Group chat: ${title}` : 'Group chat';
    const server = h.guildName?.trim() || (h.guildId ? 'a server' : null);
    if (server) return `${title ? `#${title}` : h.conversationKind === 'thread' ? 'a thread' : 'a channel'} in ${server}`;
    return title ?? (h.conversationKind ? 'A conversation' : null);
}

/** Why an image has no link to its message. Only Discord has such links, and only for ids Discord itself issued. */
function noLink(h: MediaSearchHitDto): string | null {
    if (!h.platform) return null;
    if (h.platform !== 'discord') return `No link to the message: ${h.platform} has none to give.`;
    return 'No link to the message: the server this channel belongs to is not on record, or the message came from an import that did not keep Discord\'s own ids.';
}

/** The same message, addressed to the Discord app instead of the browser. */
function appLink(url: string): string { return url.replace(/^https:\/\/discord\.com\//, 'discord://-/'); }

const copied = ref(false);
watch(() => filters.open, () => { copied.value = false; });
async function copyLink(url: string) {
    try {
        await navigator.clipboard.writeText(url);
        copied.value = true;
    } catch { /* the link is written out under "The post" to copy by hand */ }
}

/** Narrows the search to the conversation the opened image is from. The filters search again by themselves. */
function onlyHere(conversationId: string) {
    const from = r.value?.hits.find(h => h.conversationId === conversationId);
    const title = from?.conversationTitle?.trim();
    // The filter shows the conversation by name straight away, without asking the server what the id is called.
    if (title) remember('conversation', conversationId, from?.guildName ? `#${title} · ${from.guildName}` : title);
    narrow.pick('conversation', [conversationId]);
    filters.open = '';
}

/** Narrows the search to the server the opened image was posted in. */
function onlyServer(h: MediaSearchHitDto) {
    if (!h.guildId) return;
    if (h.guildName) remember('guild', h.guildId, h.guildName);
    narrow.pick('guild', [h.guildId]);
    filters.open = '';
}

/** Narrows the search to whoever posted the opened image. */
function onlyThem(h: MediaSearchHitDto) {
    if (!h.authorPersonId) return;
    if (h.authorName) remember('person', h.authorPersonId, h.authorName);
    narrow.pick('person', [h.authorPersonId]);
    filters.open = '';
}

function search() { if (filters.q.trim()) void results.refresh(); }
// A link with a query in it searches on arrival. The filters search again once they stop changing: a search per change would each embed the query again.
useOmniDebounced(() => narrow.signature.value, () => search());
if (filters.q.trim()) search();
</script>

<style scoped>
.search { margin-bottom: 8px; }
.search .grow { flex: 1 1 320px; }
.grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; }
.grid li { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; min-width: 0; }
.grid li.gone { opacity: 0.6; }
.thumb { padding: 0; border: 0; background: none; cursor: pointer; border-radius: var(--omni-radius-sm); overflow: hidden; }
.thumb:focus-visible { outline: 2px solid var(--omni-accent); outline-offset: 2px; }
.caption { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.place { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; }
.said { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; color: var(--omni-text-2); }
.why { display: flex; flex-wrap: wrap; gap: 4px; }
.full { width: 100%; max-height: 60vh; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.actions a.omni-btn { text-decoration: none; }
.note { margin: 10px 0 0; font-size: 12px; }
.omni-kv dd .omni-chip { margin: 0 4px 2px 0; vertical-align: middle; }
.omni-kv dd .omni-chip.gap { margin-left: 8px; }
.omni-kv dd.words { white-space: pre-wrap; color: var(--omni-text); }
.omni-banner .muted { display: block; color: var(--omni-text-2); }
</style>
