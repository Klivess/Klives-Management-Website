<template>
    <OmniTumblrShell>
        <div class="ot-pagehead">
            <div>
                <h1>Compose a post</h1>
                <p class="subtitle">Post now or schedule it, on one blog or several. Autopilot keeps running alongside.</p>
            </div>
        </div>

        <div v-if="!canPost" class="ot-banner info"><span class="glyph">🔒</span><div><strong>View only</strong> Your profile can view OmniTumblr but not post — that needs “Work on posts”.</div></div>

        <div class="ot-grid sidebar">
            <div class="ot-stack">
                <OmniTraderCard title="1 · Blogs">
                    <div v-if="!blogs.length" class="muted">No blogs yet — add one from the overview.</div>
                    <div class="blogpick">
                        <label v-for="b in blogs" :key="b.BlogId" class="blogopt" :class="{ on: selected.includes(b.BlogId) }">
                            <input v-model="selected" type="checkbox" :value="b.BlogId" />
                            <OmniTumblrAvatar :src="b.AvatarUrl" :name="b.Name" :size="22" round />
                            <span>@{{ b.Name }}</span>
                        </label>
                    </div>
                </OmniTraderCard>

                <OmniTraderCard title="2 · Content">
                    <div class="ot-segment" role="group" aria-label="Post type">
                        <button v-for="k in KINDS" :key="k" type="button" :aria-pressed="kind === k" @click="setKind(k)">{{ k }}</button>
                    </div>

                    <div v-if="kind === 'Video' || kind === 'Photo'" class="drop" :class="{ over: dragging }"
                         @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="onDrop">
                        <p>Drop {{ kind === 'Video' ? 'a video (.mp4 / .mov)' : 'images (up to 30)' }} here, or
                            <button type="button" class="linkish" @click="picker?.click()">choose {{ kind === 'Video' ? 'a file' : 'files' }}</button>.</p>
                        <input ref="picker" type="file" hidden :multiple="kind === 'Photo'"
                               :accept="kind === 'Video' ? 'video/mp4,video/quicktime,.m4v' : 'image/jpeg,image/png,image/gif,image/webp'" @change="onPick" />
                    </div>

                    <div v-if="files.length" class="files">
                        <div v-for="f in files" :key="f.id" class="file">
                            <video v-if="f.kind === 'Video'" :src="f.preview" muted playsinline preload="metadata"></video>
                            <img v-else :src="f.preview" alt="" />
                            <div class="fileinfo">
                                <span class="fname">{{ f.name }}</span>
                                <span class="muted">{{ fmtBytes(f.size) }}</span>
                                <span v-if="f.error" class="neg">{{ f.error }}</span>
                                <span v-else-if="f.mediaId" class="pos">ready</span>
                                <OmniTraderMeter v-else label="" :value="`${f.percent}%`" limit="uploading" :percent="f.percent" :warn-at="101" />
                            </div>
                            <button type="button" class="ot-btn sm ghost" @click="removeFile(f.id)">Remove</button>
                        </div>
                    </div>

                    <div v-if="kind === 'Text' || kind === 'Link'" class="ot-field">
                        <label for="tb-c-title">{{ kind === 'Link' ? 'Link title (optional)' : 'Title' }}</label>
                        <input id="tb-c-title" v-model="title" class="ot-input" />
                    </div>
                    <div v-if="kind === 'Link'" class="ot-field">
                        <label for="tb-c-link-url">URL</label>
                        <input id="tb-c-link-url" v-model="linkUrl" class="ot-input mono" placeholder="https://…" />
                    </div>
                </OmniTraderCard>

                <OmniTraderCard title="3 · Caption and tags">
                    <div class="ot-segment" role="group" aria-label="Caption">
                        <button type="button" :aria-pressed="captionMode === 'manual'" @click="captionMode = 'manual'">Write it</button>
                        <button type="button" :aria-pressed="captionMode === 'ai'" :disabled="kind === 'Link'" @click="captionMode = 'ai'">✨ AI writes it</button>
                        <button type="button" :aria-pressed="captionMode === 'none'" :disabled="kind === 'Text'" @click="captionMode = 'none'">No caption</button>
                    </div>
                    <div v-if="captionMode === 'manual'" class="ot-field">
                        <label for="tb-c-caption">{{ kind === 'Text' ? 'Text' : 'Caption' }}</label>
                        <textarea id="tb-c-caption" v-model="caption" class="ot-input" rows="4"></textarea>
                        <div class="help">{{ caption.length }} characters</div>
                    </div>
                    <div v-else-if="captionMode === 'ai'" class="ot-field">
                        <label for="tb-c-ai-instruction">Direction for the AI (optional)</label>
                        <input id="tb-c-ai-instruction" v-model="aiInstruction" class="ot-input" placeholder="e.g. make it about Monday mornings" />
                        <div class="help">Each blog's own AI voice is used; you can edit the result in the queue before it posts.</div>
                    </div>
                    <div class="ot-field">
                        <label for="tb-c-tags">Tags</label>
                        <OmniTumblrTagInput input-id="tb-c-tags" v-model="tags" />
                        <label class="ot-check"><input v-model="includeBlogTags" type="checkbox" /> Also add each blog's fixed tags</label>
                    </div>
                </OmniTraderCard>

                <OmniTraderCard title="4 · When">
                    <div class="ot-segment" role="group" aria-label="When">
                        <button type="button" :aria-pressed="when === 'now'" @click="when = 'now'">Now</button>
                        <button type="button" :aria-pressed="when === 'later'" @click="when = 'later'">Schedule</button>
                    </div>
                    <div v-if="when === 'later'" class="ot-formgrid">
                        <div class="ot-field">
                            <label for="tb-c-scheduled-local">Date and time (your local time)</label>
                            <input id="tb-c-scheduled-local" v-model="scheduledLocal" type="datetime-local" class="ot-input" :min="minLocal" />
                        </div>
                    </div>
                    <details>
                        <summary>More options</summary>
                        <div class="ot-formgrid wide">
                            <div class="ot-field">
                                <label for="tb-c-tumblr-state">Post as</label>
                                <select id="tb-c-tumblr-state" v-model="tumblrState" class="ot-select">
                                    <option value="">Blog default</option>
                                    <option value="Published">Published</option>
                                    <option value="Draft">Draft on Tumblr</option>
                                    <option value="Private">Private</option>
                                </select>
                            </div>
                            <div class="ot-field">
                                <label for="tb-c-source-url">Source URL (credit)</label>
                                <input id="tb-c-source-url" v-model="sourceUrl" class="ot-input mono" placeholder="https://…" />
                            </div>
                        </div>
                    </details>
                </OmniTraderCard>
            </div>

            <div class="ot-stack">
                <OmniTraderCard title="Ready?" class="sticky">
                    <ul class="checklist">
                        <li :class="selected.length ? 'pos' : 'muted'">{{ selected.length ? '✓' : '○' }} {{ selected.length || 'No' }} blog{{ selected.length === 1 ? '' : 's' }} selected</li>
                        <li :class="contentReady ? 'pos' : 'muted'">{{ contentReady ? '✓' : '○' }} {{ contentLabel }}</li>
                        <!-- A text post's caption is its body, which the line above already covers. -->
                        <li v-if="!(kind === 'Text' && captionMode === 'manual')" :class="captionReady ? 'pos' : 'muted'">{{ captionReady ? '✓' : '○' }} {{ captionLabel }}</li>
                        <li :class="timeReady ? 'pos' : 'muted'">{{ timeReady ? '✓' : '○' }} {{ when === 'now' ? 'Publishes right away' : scheduledLocal ? `Scheduled for ${new Date(scheduledLocal).toLocaleString()}` : 'Pick a time' }}</li>
                    </ul>
                    <p v-if="error" class="neg">{{ error }}</p>
                    <button class="ot-btn primary block" :disabled="!canSubmit || submitting" @click="submit">
                        {{ submitting ? 'Creating…' : when === 'now' ? `Publish to ${selected.length || ''} blog${selected.length === 1 ? '' : 's'}` : 'Schedule' }}
                    </button>
                    <div v-if="created.length" class="created">
                        <p class="pos">Created {{ created.length }} post{{ created.length === 1 ? '' : 's' }}:</p>
                        <ul>
                            <li v-for="c in created" :key="c.PostId">
                                <NuxtLink :to="`/schemery/omnitumblr/blog/${c.BlogId}?tab=queue`">@{{ c.BlogName }}</NuxtLink>
                                · {{ c.CaptionPending ? 'caption being written' : 'ready' }} · {{ fmtWhen(c.ScheduledUtc) }}
                            </li>
                        </ul>
                        <button class="ot-btn sm ghost" @click="resetForm">Compose another</button>
                    </div>
                </OmniTraderCard>
            </div>
        </div>
    </OmniTumblrShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAccess } from '~/composables/useAccess';
import {
    fmtBytes, fmtWhen, fromLocalInput, toLocalInput, tumblrPost, uploadMedia, useTumblrOverview, type PostKind, type PostSummary,
} from '~/composables/useOmniTumblr';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Compose · OmniTumblr' });

interface PendingFile { id: number; file: File; name: string; size: number; kind: 'Video' | 'Photo'; preview: string; percent: number; mediaId: string | null; error: string | null; abort?: () => void }

const KINDS: PostKind[] = ['Video', 'Photo', 'Text', 'Link'];
const route = useRoute();
const { can } = useAccess();
const canPost = computed(() => can('omnitumblr.posts.act'));
const { overview } = useTumblrOverview();

const blogs = computed(() => overview.value?.Blogs ?? []);
const selected = ref<string[]>([]);
const kind = ref<PostKind>('Video');
const files = ref<PendingFile[]>([]);
const dragging = ref(false);
const picker = ref<HTMLInputElement | null>(null);
const title = ref('');
const linkUrl = ref('');
const captionMode = ref<'manual' | 'ai' | 'none'>('manual');
const caption = ref('');
const aiInstruction = ref('');
const tags = ref<string[]>([]);
const includeBlogTags = ref(true);
const when = ref<'now' | 'later'>('now');
const scheduledLocal = ref(toLocalInput(new Date(Date.now() + 60 * 60_000).toISOString()));
const tumblrState = ref('');
const sourceUrl = ref('');
const submitting = ref(false);
const error = ref<string | null>(null);
const created = ref<PostSummary[]>([]);
let nextId = 0;

const minLocal = toLocalInput(new Date().toISOString());

// Preselect ?blog= (from a blog page's Compose button).
watch(blogs, list => {
    const wanted = route.query.blog ? String(route.query.blog) : null;
    if (wanted && !selected.value.length && list.some(b => b.BlogId === wanted)) selected.value = [wanted];
    else if (!selected.value.length && list.length === 1) selected.value = [list[0].BlogId];
}, { immediate: true });

onBeforeUnmount(() => files.value.forEach(f => { f.abort?.(); URL.revokeObjectURL(f.preview); }));

function setKind(k: PostKind) {
    if (k === kind.value) return;
    kind.value = k;
    files.value.forEach(f => { f.abort?.(); URL.revokeObjectURL(f.preview); });
    files.value = [];
    if (k === 'Link' && captionMode.value === 'ai') captionMode.value = 'manual';
    if (k === 'Text' && captionMode.value === 'none') captionMode.value = 'manual';
}

function onPick(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) addFiles(Array.from(input.files));
    input.value = '';
}

function onDrop(event: DragEvent) {
    dragging.value = false;
    if (event.dataTransfer?.files) addFiles(Array.from(event.dataTransfer.files));
}

function addFiles(list: File[]) {
    const wantVideo = kind.value === 'Video';
    for (const file of list) {
        const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|m4v)$/i.test(file.name);
        const isImage = file.type.startsWith('image/');
        if (wantVideo ? !isVideo : !isImage) { error.value = `${file.name} is not ${wantVideo ? 'a video' : 'an image'}.`; continue; }
        if (wantVideo) { files.value.forEach(f => { f.abort?.(); URL.revokeObjectURL(f.preview); }); files.value = []; }
        if (!wantVideo && files.value.length >= 30) break;
        const entry: PendingFile = { id: ++nextId, file, name: file.name, size: file.size, kind: wantVideo ? 'Video' : 'Photo', preview: URL.createObjectURL(file), percent: 0, mediaId: null, error: null };
        files.value.push(entry);
        const tracked = files.value[files.value.length - 1];
        const upload = uploadMedia(file, 'compose', null, pct => { tracked.percent = pct; });
        tracked.abort = upload.abort;
        upload.promise.then(result => { tracked.mediaId = result.MediaId; }).catch(e => { tracked.error = e?.message ?? 'Upload failed'; });
        error.value = null;
    }
}

function removeFile(id: number) {
    const f = files.value.find(x => x.id === id);
    f?.abort?.();
    if (f) URL.revokeObjectURL(f.preview);
    files.value = files.value.filter(x => x.id !== id);
}

const uploading = computed(() => files.value.some(f => !f.mediaId && !f.error));
const contentReady = computed(() => {
    if (kind.value === 'Video') return files.value.length === 1 && !!files.value[0].mediaId;
    if (kind.value === 'Photo') return files.value.length > 0 && files.value.every(f => !!f.mediaId);
    if (kind.value === 'Link') return /^https?:\/\/\S+/i.test(linkUrl.value.trim());
    return !!(title.value.trim() || caption.value.trim() || captionMode.value === 'ai');
});
const contentLabel = computed(() => {
    if (uploading.value) return 'Uploading…';
    if (kind.value === 'Video') return files.value.length ? 'Video uploaded' : 'Add a video';
    if (kind.value === 'Photo') return files.value.length ? `${files.value.length} image(s)` : 'Add images';
    if (kind.value === 'Link') return linkUrl.value ? 'Link set' : 'Add a URL';
    return contentReady.value ? 'Text written' : 'Write a title or text';
});
const captionReady = computed(() => captionMode.value !== 'manual' || kind.value !== 'Text' || !!caption.value.trim() || !!title.value.trim());
const captionLabel = computed(() => captionMode.value === 'ai' ? 'AI writes the caption per blog' : captionMode.value === 'none' ? 'No caption' : caption.value ? 'Caption written' : 'No caption written (optional)');
const timeReady = computed(() => when.value === 'now' || !!scheduledLocal.value);
const canSubmit = computed(() => canPost.value && selected.value.length > 0 && contentReady.value && !uploading.value && timeReady.value);

async function submit() {
    submitting.value = true;
    error.value = null;
    try {
        const result = await tumblrPost<{ Created: PostSummary[] }>('/omnitumblr/posts/create', {
            blogIds: selected.value,
            kind: kind.value,
            captionMode: captionMode.value,
            caption: captionMode.value === 'manual' ? caption.value : null,
            aiInstruction: captionMode.value === 'ai' ? (aiInstruction.value.trim() || null) : null,
            title: title.value.trim() || null,
            linkUrl: kind.value === 'Link' ? linkUrl.value.trim() : null,
            tags: tags.value,
            includeBlogTags: includeBlogTags.value,
            mediaIds: files.value.map(f => f.mediaId).filter(Boolean),
            scheduledUtc: when.value === 'later' ? fromLocalInput(scheduledLocal.value) : null,
            tumblrState: tumblrState.value || null,
            sourceUrl: sourceUrl.value.trim() || null,
        });
        if (!result.ok || !result.data) { error.value = result.error; return; }
        created.value = result.data.Created;
    } finally {
        submitting.value = false;
    }
}

function resetForm() {
    files.value.forEach(f => URL.revokeObjectURL(f.preview));
    files.value = [];
    caption.value = '';
    aiInstruction.value = '';
    title.value = '';
    linkUrl.value = '';
    sourceUrl.value = '';
    created.value = [];
    error.value = null;
}
</script>

<style scoped>
.blogpick { display: flex; flex-wrap: wrap; gap: var(--ot-space-2); }
.blogopt { position: relative; display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; border: 1px solid var(--ot-line-strong); border-radius: 999px; cursor: pointer; font-size: 13px; }
.blogopt:focus-within { outline: var(--ot-focus) solid var(--ot-accent); outline-offset: 2px; }
.blogopt input { position: absolute; opacity: 0; pointer-events: none; }
.blogopt.on { border-color: var(--ot-accent); background: var(--ot-accent-soft); color: var(--ot-accent); }
.ot-segment { margin-bottom: var(--ot-space-3); flex-wrap: wrap; }
.drop { border: 1px dashed var(--ot-line-strong); border-radius: var(--ot-radius); padding: var(--ot-space-6) var(--ot-space-4); text-align: center; color: var(--ot-text-2); margin-bottom: var(--ot-space-3); }
.drop.over { border-color: var(--ot-accent); background: var(--ot-accent-soft); }
.drop p { margin: 0; }
.linkish { border: 0; background: none; padding: 0; color: var(--ot-info); cursor: pointer; font-size: inherit; text-decoration: underline; }
.files { display: flex; flex-direction: column; gap: var(--ot-space-2); margin-bottom: var(--ot-space-3); }
.file { display: flex; align-items: center; gap: var(--ot-space-3); }
.file video, .file img { width: 72px; height: 72px; object-fit: cover; border-radius: var(--ot-radius-sm); background: #000; flex: 0 0 auto; }
.fileinfo { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; font-size: 12.5px; }
.fname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ot-field { margin-bottom: var(--ot-space-3); }
.ot-formgrid.wide { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
details summary { cursor: pointer; color: var(--ot-text-2); font-size: 12.5px; margin: var(--ot-space-2) 0; }
.sticky { position: sticky; top: var(--ot-space-4); }
.checklist { list-style: none; margin: 0 0 var(--ot-space-3); padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.created { margin-top: var(--ot-space-3); font-size: 12.5px; }
.created p { margin: 0 0 4px; }
.created ul { margin: 0 0 var(--ot-space-2); padding-left: 18px; }
.created a { color: var(--ot-info); }
</style>
