<template>
    <OmniGramShell>
        <div class="ot-pagehead">
            <div>
                <h1>Compose a post</h1>
                <p class="subtitle">A reel, photo, carousel or story, now or scheduled, on one account or several. Autopilot keeps running alongside.</p>
            </div>
        </div>

        <div v-if="!canPost" class="ot-banner info"><span class="glyph">🔒</span><div><strong>View only</strong> Your profile can view OmniGram but not post; that needs “Publish content”.</div></div>

        <div class="ot-grid sidebar">
            <div class="ot-stack">
                <OmniTraderCard title="1 · Accounts">
                    <div v-if="!accounts.length" class="muted">No accounts yet; connect one from the overview.</div>
                    <div class="pick">
                        <label v-for="a in accounts" :key="a.AccountId" class="opt" :class="{ on: selected.includes(a.AccountId), off: a.State === 'connect' || a.Connection !== 'Healthy' }"
                               :title="a.Connection !== 'Healthy' ? a.StateReason : ''">
                            <input v-model="selected" type="checkbox" :value="a.AccountId" :disabled="a.Connection !== 'Healthy'" />
                            <OmniTumblrAvatar :src="a.ProfilePictureUrl" :name="a.Username" :size="22" round />
                            <span>@{{ a.Username }}</span>
                        </label>
                    </div>
                    <p v-if="accounts.some(a => a.Connection !== 'Healthy')" class="muted small">Accounts that are not connected cannot be selected.</p>
                </OmniTraderCard>

                <OmniTraderCard title="2 · Media">
                    <div class="ot-segment" role="group" aria-label="Format">
                        <button v-for="f in FORMATS" :key="f.value" type="button" :aria-pressed="format === f.value" @click="setFormat(f.value)">{{ f.label }}</button>
                    </div>
                    <p class="lead">{{ FORMATS.find(f => f.value === format)?.help }}</p>

                    <div class="drop" :class="{ over: dragging }" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="onDrop">
                        <p>Drop {{ dropLabel }} here, or
                            <button type="button" class="linkish" @click="picker?.click()">choose {{ format === 'Carousel' ? 'files' : 'a file' }}</button>.</p>
                        <input ref="picker" type="file" hidden :multiple="format === 'Carousel'" :accept="accept" @change="onPick" />
                    </div>

                    <div v-if="files.length" class="files">
                        <div v-for="(f, i) in files" :key="f.id" class="file">
                            <video v-if="f.kind === 'Video'" :src="f.preview" muted playsinline preload="metadata"></video>
                            <img v-else :src="f.preview" alt="" />
                            <div class="fileinfo">
                                <span class="fname">{{ format === 'Carousel' ? `${i + 1}. ` : '' }}{{ f.name }}</span>
                                <span class="muted">{{ f.kind }} · {{ fmtBytes(f.size) }}{{ f.info }}</span>
                                <span v-if="f.error" class="neg">{{ f.error }}</span>
                                <span v-else-if="f.mediaId" class="pos">uploaded</span>
                                <OmniTraderMeter v-else label="" :value="`${f.percent}%`" limit="uploading" :percent="f.percent" :warn-at="101" />
                            </div>
                            <div class="fileacts">
                                <button v-if="format === 'Carousel' && i > 0" type="button" class="ot-btn sm ghost" :aria-label="`Move ${f.name} earlier`" @click="move(i, -1)">↑</button>
                                <button type="button" class="ot-btn sm ghost" @click="removeFile(f.id)">Remove</button>
                            </div>
                        </div>
                    </div>
                    <p class="muted small">Media is made Instagram-ready on the server: videos are converted to H.264/AAC if needed, images become JPEGs in Instagram's 4:5 to 1.91:1 frame.</p>
                </OmniTraderCard>

                <OmniTraderCard v-if="format !== 'Story'" title="3 · Caption and hashtags">
                    <div class="ot-segment" role="group" aria-label="Caption">
                        <button type="button" :aria-pressed="captionMode === 'Manual'" @click="captionMode = 'Manual'">Write it</button>
                        <button type="button" :aria-pressed="captionMode === 'AI'" @click="captionMode = 'AI'">✨ AI writes it</button>
                        <button type="button" :aria-pressed="captionMode === 'None'" @click="captionMode = 'None'">No caption</button>
                    </div>
                    <div v-if="captionMode === 'Manual'" class="ot-field">
                        <label for="ig-c-caption">Caption</label>
                        <textarea id="ig-c-caption" v-model="caption" class="ot-input" rows="5" maxlength="2200"></textarea>
                        <div class="help">{{ caption.length }} / 2,200 · {{ mentionCount }} @mention{{ mentionCount === 1 ? '' : 's' }} (20 max)</div>
                    </div>
                    <div v-else-if="captionMode === 'AI'" class="ot-field">
                        <label for="ig-c-direction">Direction for the AI (optional)</label>
                        <input id="ig-c-direction" v-model="direction" class="ot-input" maxlength="300" placeholder="e.g. make it about Monday mornings" />
                        <div class="help">Each account's own AI voice is used, and the AI looks at the media. You can edit the result in the queue before it posts.</div>
                    </div>

                    <div v-if="canPost && selected.length && files[0]?.mediaId && captionMode !== 'None'" class="aipreview">
                        <button type="button" class="ot-btn sm" :disabled="previewing" @click="previewCaption">
                            {{ previewing ? 'Writing…' : `✨ ${preview ? 'Try another' : 'Draft a caption'} for @${accountName(selected[0])}` }}
                        </button>
                        <p v-if="previewError" class="neg small">{{ previewError }}</p>
                        <div v-if="preview" class="previewcard">
                            <p class="cap">{{ preview.Caption }}</p>
                            <p v-if="preview.SuggestedHashtags.length" class="tags">{{ preview.SuggestedHashtags.map(t => '#' + t).join(' ') }}</p>
                            <p class="muted small">{{ preview.UsedVision ? `Looked at ${preview.FramesSent} frame(s)` : 'Text only' }} · {{ preview.Model ?? 'default model' }}</p>
                            <button type="button" class="ot-btn sm primary" @click="usePreview">Use this caption</button>
                        </div>
                    </div>

                    <div class="ot-field">
                        <label for="ig-c-tags">Hashtags <span class="muted">({{ hashtags.length }}/30)</span></label>
                        <OmniTumblrTagInput input-id="ig-c-tags" v-model="hashtags" :max="30" label="Hashtags" placeholder="Add a hashtag…" />
                        <label class="ot-check"><input v-model="useAccountExtras" type="checkbox" /> Also add each account's hashtags and caption footer</label>
                    </div>
                    <div class="ot-formgrid wide">
                        <div class="ot-field">
                            <label for="ig-c-placement">Put hashtags</label>
                            <select id="ig-c-placement" v-model="placement" class="ot-select">
                                <option value="">as each account's strategy says</option>
                                <option value="Caption">at the end of the caption</option>
                                <option value="FirstComment">in the first comment</option>
                                <option value="None">nowhere</option>
                            </select>
                        </div>
                        <div v-if="format === 'Photo' || format === 'Carousel'" class="ot-field">
                            <label for="ig-c-alt">Alt text</label>
                            <input id="ig-c-alt" v-model="altText" class="ot-input" maxlength="1000" placeholder="Describe the image (AI fills it in if empty)" />
                        </div>
                    </div>
                    <div class="ot-field">
                        <label for="ig-c-first">First comment (optional)</label>
                        <textarea id="ig-c-first" v-model="firstComment" class="ot-input" rows="2" maxlength="2200" placeholder="Posted by the account right after publishing"></textarea>
                    </div>
                </OmniTraderCard>

                <OmniTraderCard v-if="format === 'Reel'" title="Reel options">
                    <div class="checks">
                        <label class="ot-check"><input v-model="shareToFeed" type="checkbox" :disabled="trial !== 'Off'" /> Also show in the profile grid</label>
                        <label class="ot-check"><input v-model="alsoPostStory" type="checkbox" /> Share to story after publishing</label>
                    </div>
                    <div class="ot-formgrid wide">
                        <div class="ot-field">
                            <label for="ig-c-trial">Trial reel</label>
                            <select id="ig-c-trial" v-model="trial" class="ot-select">
                                <option value="Off">No, show it to followers</option>
                                <option value="Manual">Yes, I decide whether to share it</option>
                                <option value="Auto">Yes, share it if it performs well</option>
                            </select>
                            <div class="help">Trial reels go to non-followers first.</div>
                        </div>
                        <div class="ot-field">
                            <label for="ig-c-cover">Cover frame (seconds in)</label>
                            <input id="ig-c-cover" v-model="coverFrame" type="number" min="0" step="0.5" class="ot-input" placeholder="first frame" />
                        </div>
                        <div class="ot-field">
                            <label for="ig-c-collabs">Collaborators (up to 3)</label>
                            <OmniTumblrTagInput input-id="ig-c-collabs" v-model="collaborators" prefix="@" :max="3" placeholder="username" label="Collaborators" />
                        </div>
                    </div>
                </OmniTraderCard>

                <OmniTraderCard :title="format === 'Story' ? '3 · When' : '4 · When'">
                    <div class="ot-segment" role="group" aria-label="When">
                        <button type="button" :aria-pressed="when === 'now'" @click="when = 'now'">Now</button>
                        <button type="button" :aria-pressed="when === 'later'" @click="when = 'later'">Schedule</button>
                    </div>
                    <div v-if="when === 'later'" class="ot-formgrid">
                        <div class="ot-field">
                            <label for="ig-c-when">Date and time (your local time)</label>
                            <input id="ig-c-when" v-model="scheduledLocal" type="datetime-local" class="ot-input" :min="minLocal" />
                        </div>
                    </div>
                    <label class="ot-check disclose"><input v-model="labelAsAi" type="checkbox" /> Add Instagram's “AI info” label (the media was made with AI)</label>
                </OmniTraderCard>
            </div>

            <div class="ot-stack">
                <OmniTraderCard title="Ready?" class="sticky">
                    <ul class="checklist">
                        <li :class="selected.length ? 'pos' : 'muted'">{{ selected.length ? '✓' : '○' }} {{ selected.length || 'No' }} account{{ selected.length === 1 ? '' : 's' }} selected</li>
                        <li :class="mediaReady ? 'pos' : 'muted'">{{ mediaReady ? '✓' : '○' }} {{ mediaLabel }}</li>
                        <li v-if="format !== 'Story'" class="pos">✓ {{ captionLabel }}</li>
                        <li :class="timeReady ? 'pos' : 'muted'">{{ timeReady ? '✓' : '○' }} {{ when === 'now' ? 'Publishes right away' : scheduledLocal ? `Scheduled for ${new Date(scheduledLocal).toLocaleString()}` : 'Pick a time' }}</li>
                    </ul>
                    <p v-if="error" class="neg">{{ error }}</p>
                    <button class="ot-btn primary block" :disabled="!canSubmit || submitting" @click="submit">
                        {{ submitting ? 'Creating…' : when === 'now' ? `Publish to ${selected.length || ''} account${selected.length === 1 ? '' : 's'}` : 'Schedule' }}
                    </button>
                    <p class="muted small">Publishing takes a minute or two: Instagram downloads and processes the media first.</p>
                    <div v-if="created.length" class="created">
                        <p class="pos">Created {{ created.length }} post{{ created.length === 1 ? '' : 's' }}:</p>
                        <ul>
                            <li v-for="c in created" :key="c.PostId">
                                <a href="#" @click.prevent="drawerPostId = c.PostId">@{{ accountName(c.AccountId) }}</a>
                                · <NuxtLink :to="`/schemery/omnigram/account/${c.AccountId}?tab=queue`">queue</NuxtLink>
                            </li>
                        </ul>
                        <button class="ot-btn sm ghost" @click="resetForm">Compose another</button>
                    </div>
                </OmniTraderCard>
            </div>
        </div>

        <OmniGramPostDrawer :open="!!drawerPostId" :post-id="drawerPostId" @close="drawerPostId = null" />
    </OmniGramShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAccess } from '~/composables/useAccess';
import {
    fmtBytes, fmtClipLength, fromLocalInput, igPost, toLocalInput, uploadMedia, useGramOverview,
    type CaptionPreview, type HashtagPlacement, type PostFormat, type TrialReelMode,
} from '~/composables/useOmniGram';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Compose · OmniGram' });

interface PendingFile { id: number; name: string; size: number; kind: 'Video' | 'Photo'; preview: string; percent: number; mediaId: string | null; info: string; error: string | null; abort?: () => void }

const FORMATS: { value: PostFormat; label: string; help: string }[] = [
    { value: 'Reel', label: 'Reel', help: 'One video, 3 seconds to 15 minutes. Shown in Reels and, optionally, the profile grid.' },
    { value: 'Photo', label: 'Photo', help: 'One image in the feed and profile grid.' },
    { value: 'Carousel', label: 'Carousel', help: '2 to 10 images and/or videos people swipe through. The first item is the cover.' },
    { value: 'Story', label: 'Story', help: 'One image or video (up to 60 s) that disappears after 24 hours. Stories have no caption.' },
];

const route = useRoute();
const { can } = useAccess();
const canPost = computed(() => can('omnigram.content.publish'));
const { overview } = useGramOverview();

const accounts = computed(() => overview.value?.Accounts ?? []);
const selected = ref<string[]>([]);
const format = ref<PostFormat>('Reel');
const files = ref<PendingFile[]>([]);
const dragging = ref(false);
const picker = ref<HTMLInputElement | null>(null);
const captionMode = ref<'Manual' | 'AI' | 'None'>('Manual');
const caption = ref('');
const direction = ref('');
const hashtags = ref<string[]>([]);
const useAccountExtras = ref(true);
const placement = ref<HashtagPlacement | ''>('');
const altText = ref('');
const firstComment = ref('');
const shareToFeed = ref(true);
const alsoPostStory = ref(false);
const trial = ref<TrialReelMode>('Off');
const coverFrame = ref<string | number>('');
const collaborators = ref<string[]>([]);
const labelAsAi = ref(false);
const when = ref<'now' | 'later'>('now');
const scheduledLocal = ref(toLocalInput(new Date(Date.now() + 60 * 60_000).toISOString()));
const submitting = ref(false);
const error = ref<string | null>(null);
const created = ref<{ AccountId: string; PostId: string }[]>([]);
const drawerPostId = ref<string | null>(null);
const previewing = ref(false);
const previewError = ref<string | null>(null);
const preview = ref<CaptionPreview | null>(null);
let nextId = 0;

const minLocal = toLocalInput(new Date().toISOString());

// Preselect ?account= (from an account page's Compose button), or the only connected account.
watch(accounts, list => {
    const wanted = route.query.account ? String(route.query.account) : null;
    const usable = list.filter(a => a.Connection === 'Healthy');
    if (wanted && !selected.value.length && usable.some(a => a.AccountId === wanted)) selected.value = [wanted];
    else if (!selected.value.length && usable.length === 1) selected.value = [usable[0].AccountId];
}, { immediate: true });

onBeforeUnmount(() => clearFiles());

function accountName(id: string) {
    return accounts.value.find(a => a.AccountId === id)?.Username ?? 'account';
}

const accept = computed(() => {
    const video = 'video/mp4,video/quicktime,.m4v,.mov';
    const image = 'image/jpeg,image/png,image/gif,image/webp';
    return format.value === 'Reel' ? video : format.value === 'Photo' ? image : `${video},${image}`;
});
const dropLabel = computed(() => ({ Reel: 'a video (.mp4 / .mov)', Photo: 'an image', Carousel: 'up to 10 images or videos', Story: 'an image or a video' })[format.value]);

function clearFiles() {
    files.value.forEach(f => { f.abort?.(); URL.revokeObjectURL(f.preview); });
    files.value = [];
    preview.value = null;
}

function setFormat(f: PostFormat) {
    if (f === format.value) return;
    const keep = f === 'Carousel' || (f === 'Story' && files.value.length === 1)
        || (f === 'Reel' && files.value.length === 1 && files.value[0].kind === 'Video')
        || (f === 'Photo' && files.value.length === 1 && files.value[0].kind === 'Photo');
    format.value = f;
    if (!keep) clearFiles();
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
    error.value = null;
    for (const file of list) {
        const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|m4v)$/i.test(file.name);
        const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(file.name);
        if (!isVideo && !isImage) { error.value = `${file.name} is not an image or a video.`; continue; }
        if (format.value === 'Reel' && !isVideo) { error.value = 'A reel needs a video.'; continue; }
        if (format.value === 'Photo' && !isImage) { error.value = 'A photo post needs an image; use a reel for video.'; continue; }
        if (format.value === 'Carousel') {
            if (files.value.length >= 10) { error.value = 'A carousel holds at most 10 items.'; break; }
        } else {
            clearFiles(); // single-media formats: the new file replaces the old one
        }
        files.value.push({ id: ++nextId, name: file.name, size: file.size, kind: isVideo ? 'Video' : 'Photo', preview: URL.createObjectURL(file), percent: 0, mediaId: null, info: '', error: null });
        const tracked = files.value[files.value.length - 1];
        const upload = uploadMedia(file, 'compose', null, pct => { tracked.percent = pct; });
        tracked.abort = upload.abort;
        upload.promise.then(result => {
            tracked.mediaId = result.MediaId;
            const parts = [result.Width && result.Height ? `${result.Width}×${result.Height}` : '', result.DurationSeconds ? fmtClipLength(result.DurationSeconds) : ''].filter(Boolean);
            tracked.info = parts.length ? ` · ${parts.join(' · ')}` : '';
            if (format.value === 'Story' && tracked.kind === 'Video' && (result.DurationSeconds ?? 0) > 60) tracked.info += ' · trimmed to 60 s';
        }).catch(e => { tracked.error = e?.message ?? 'Upload failed'; });
    }
}

function removeFile(id: number) {
    const f = files.value.find(x => x.id === id);
    f?.abort?.();
    if (f) URL.revokeObjectURL(f.preview);
    files.value = files.value.filter(x => x.id !== id);
    if (!files.value.length) preview.value = null;
}

function move(index: number, delta: number) {
    const next = [...files.value];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    files.value = next;
}

const mentionCount = computed(() => (caption.value.match(/(^|\s)@[\w.]+/g) ?? []).length);
const uploading = computed(() => files.value.some(f => !f.mediaId && !f.error));
const mediaReady = computed(() => {
    const ok = files.value.length > 0 && files.value.every(f => !!f.mediaId);
    return format.value === 'Carousel' ? ok && files.value.length >= 2 : ok && files.value.length === 1;
});
const mediaLabel = computed(() => {
    if (uploading.value) return 'Uploading…';
    if (files.value.some(f => f.error)) return 'An upload failed; remove it and try again';
    if (format.value === 'Carousel') return files.value.length >= 2 ? `${files.value.length} items` : `Add ${2 - files.value.length} more item${files.value.length === 1 ? '' : 's'} (2 minimum)`;
    return files.value.length ? `${files.value[0].kind === 'Video' ? 'Video' : 'Image'} uploaded` : `Add ${format.value === 'Reel' ? 'a video' : format.value === 'Photo' ? 'an image' : 'an image or video'}`;
});
const captionLabel = computed(() => captionMode.value === 'AI' ? 'AI writes the caption per account' : captionMode.value === 'None' ? 'No caption text' : caption.value.trim() ? 'Caption written' : 'No caption written (optional)');
const timeReady = computed(() => when.value === 'now' || !!scheduledLocal.value);
const canSubmit = computed(() => canPost.value && selected.value.length > 0 && mediaReady.value && !uploading.value && timeReady.value);

async function previewCaption() {
    const mediaId = files.value[0]?.mediaId;
    if (!mediaId || !selected.value.length) return;
    previewing.value = true;
    previewError.value = null;
    try {
        const result = await igPost<CaptionPreview>('/omnigram/captions/preview', {
            accountId: selected.value[0],
            mediaId,
            instruction: direction.value.trim() || null,
        });
        if (!result.ok || !result.data) previewError.value = result.error;
        else preview.value = result.data;
    } finally {
        previewing.value = false;
    }
}

function usePreview() {
    if (!preview.value) return;
    caption.value = preview.value.Caption;
    const have = new Set(hashtags.value.map(t => t.toLowerCase()));
    hashtags.value = [...hashtags.value, ...preview.value.SuggestedHashtags.filter(t => !have.has(t.toLowerCase()))].slice(0, 30);
    if (!altText.value && preview.value.AltText) altText.value = preview.value.AltText;
    captionMode.value = 'Manual';
}

async function submit() {
    submitting.value = true;
    error.value = null;
    try {
        const cover = Number(coverFrame.value);
        const result = await igPost<{ created: { AccountId: string; PostId: string }[] }>('/omnigram/posts/create', {
            accountIds: selected.value,
            format: format.value,
            media: files.value.map(f => ({ mediaId: f.mediaId })),
            captionMode: format.value === 'Story' ? 'None' : captionMode.value,
            caption: captionMode.value === 'Manual' ? caption.value : null,
            direction: captionMode.value === 'AI' ? (direction.value.trim() || null) : null,
            hashtags: format.value === 'Story' ? [] : hashtags.value,
            hashtagPlacement: placement.value || null,
            useAccountExtras: format.value !== 'Story' && useAccountExtras.value,
            firstComment: firstComment.value.trim() || null,
            altText: altText.value.trim() || null,
            scheduledUtc: when.value === 'later' ? fromLocalInput(scheduledLocal.value) : null,
            shareToFeed: shareToFeed.value,
            trial: trial.value,
            coverFrameSeconds: String(coverFrame.value).trim() !== '' && Number.isFinite(cover) && cover >= 0 ? cover : null,
            collaborators: collaborators.value,
            alsoPostStory: format.value === 'Reel' && alsoPostStory.value,
            labelAsAiGenerated: labelAsAi.value,
        });
        if (!result.ok || !result.data) { error.value = result.error; return; }
        created.value = result.data.created;
    } finally {
        submitting.value = false;
    }
}

function resetForm() {
    clearFiles();
    caption.value = '';
    direction.value = '';
    altText.value = '';
    firstComment.value = '';
    coverFrame.value = '';
    collaborators.value = [];
    created.value = [];
    error.value = null;
}
</script>

<style scoped>
.pick { display: flex; flex-wrap: wrap; gap: var(--ot-space-2); }
.opt { position: relative; display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; border: 1px solid var(--ot-line-strong); border-radius: 999px; cursor: pointer; font-size: 13px; max-width: 100%; }
.opt span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.opt:focus-within { outline: var(--ot-focus) solid var(--ot-accent); outline-offset: 2px; }
.opt input { position: absolute; opacity: 0; pointer-events: none; }
.opt.on { border-color: var(--ot-accent); background: var(--ot-accent-soft); color: var(--ot-accent); }
.opt.off { opacity: 0.5; cursor: not-allowed; }
.ot-segment { margin-bottom: var(--ot-space-3); flex-wrap: wrap; }
.lead { margin: 0 0 var(--ot-space-3); color: var(--ot-text-2); font-size: 12.5px; }
.drop { border: 1px dashed var(--ot-line-strong); border-radius: var(--ot-radius); padding: var(--ot-space-6) var(--ot-space-4); text-align: center; color: var(--ot-text-2); margin-bottom: var(--ot-space-3); }
.drop.over { border-color: var(--ot-accent); background: var(--ot-accent-soft); }
.drop p { margin: 0; }
.linkish { border: 0; background: none; padding: 0; color: var(--ot-info); cursor: pointer; font-size: inherit; text-decoration: underline; }
.files { display: flex; flex-direction: column; gap: var(--ot-space-2); margin-bottom: var(--ot-space-3); }
.file { display: flex; align-items: center; gap: var(--ot-space-3); min-width: 0; }
.file video, .file img { width: 72px; height: 72px; object-fit: cover; border-radius: var(--ot-radius-sm); background: #000; flex: 0 0 auto; }
.fileinfo { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; font-size: 12.5px; }
.fname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fileacts { display: flex; gap: 4px; flex: 0 0 auto; }
.ot-field { margin-bottom: var(--ot-space-3); }
.ot-formgrid.wide { grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); }
.checks { display: flex; flex-wrap: wrap; gap: var(--ot-space-2) var(--ot-space-4); margin-bottom: var(--ot-space-3); }
.aipreview { display: flex; flex-direction: column; gap: var(--ot-space-2); margin-bottom: var(--ot-space-3); align-items: flex-start; }
.previewcard { display: flex; flex-direction: column; gap: 6px; padding: var(--ot-space-3); border-radius: var(--ot-radius); background: var(--ot-surface-2); border: 1px solid var(--ot-line); width: 100%; }
.previewcard p { margin: 0; overflow-wrap: anywhere; }
.previewcard .cap { font-size: 14px; line-height: 20px; white-space: pre-wrap; }
.previewcard .tags { color: var(--ot-info); font-size: 12.5px; }
.previewcard .ot-btn { align-self: flex-start; }
.disclose { margin-top: var(--ot-space-3); }
.small { font-size: 11.5px; margin: var(--ot-space-2) 0 0; }
.sticky { position: sticky; top: var(--ot-space-4); }
.checklist { list-style: none; margin: 0 0 var(--ot-space-3); padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.created { margin-top: var(--ot-space-3); font-size: 12.5px; }
.created p { margin: 0 0 4px; }
.created ul { margin: 0 0 var(--ot-space-2); padding-left: 18px; }
.created a { color: var(--ot-info); }
</style>
