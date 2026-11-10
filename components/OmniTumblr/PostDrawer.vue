<template>
    <OmniTraderDrawer :open="open" :title="drawerTitle" :subtitle="drawerSubtitle" @close="$emit('close')">
        <div v-if="!detail && loading" class="ot-skelrows" aria-busy="true">
            <div class="ot-skel" style="height:280px"></div>
            <div class="ot-skel" style="width:80%"></div>
            <div class="ot-skel" style="width:60%"></div>
        </div>
        <OmniTraderStateBlock v-else-if="loadError" kind="error" title="Could not load this post" :detail="loadError" />

        <div v-else-if="detail" class="tb-drawer">
            <!-- Media -->
            <section class="media">
                <video v-if="videoUrl" class="player" :src="videoUrl" controls playsinline preload="metadata"></video>
                <OmniTumblrThumb v-else size="lg" :kind="p!.Kind"
                                 :path="p!.HasThumbnail ? postThumbPath(p!.PostId) : null" alt="Post preview" />
                <div class="mediafacts">
                    <button v-if="firstMedia?.MimeType.startsWith('video/') && !videoUrl && firstMedia.Exists" class="ot-btn sm"
                            :disabled="loadingVideo" @click="playVideo">{{ loadingVideo ? 'Loading video…' : '▶ Play video' }}</button>
                    <span v-if="firstMedia">{{ mediaFacts }}</span>
                    <span v-if="firstMedia && !firstMedia.Exists" class="neg">media file missing</span>
                    <a v-if="detail.Content?.OriginalUrl" :href="detail.Content.OriginalUrl" target="_blank" rel="noopener noreferrer" class="link">
                        from @{{ detail.Content.Origin }} ↗
                    </a>
                </div>
            </section>

            <!-- A reblog: whose post, and why it was picked -->
            <section v-if="reblog" class="reblog">
                <h4 class="ot-sectionhead">Reblog of @{{ reblog.ParentBlogName }}</h4>
                <p v-if="reblog.Summary" class="original">{{ reblog.Summary }}</p>
                <dl class="ot-kv">
                    <dt>Original</dt>
                    <dd><a v-if="reblog.ParentUrl" :href="reblog.ParentUrl" target="_blank" rel="noopener noreferrer" class="link">open on Tumblr ↗</a>
                        · {{ fmtCount(reblog.ParentNotes) }} notes when picked{{ reblog.ParentPublishedUtc ? ` · posted ${fmtRelative(reblog.ParentPublishedUtc)}` : '' }}</dd>
                    <dt v-if="reblog.FoundUnderTag">Found under</dt><dd v-if="reblog.FoundUnderTag">#{{ reblog.FoundUnderTag }}</dd>
                    <dt v-if="reblog.ParentTags.length">Its tags</dt><dd v-if="reblog.ParentTags.length">{{ reblog.ParentTags.map(t => '#' + t).join(' ') }}</dd>
                    <dt>Screening</dt>
                    <dd>{{ reblog.Reason || 'Passed.' }}<span v-if="!reblog.SeenByModel" class="warn"> Look at the original before approving.</span></dd>
                </dl>
            </section>

            <div v-if="banner" class="ot-banner" :class="banner.tone" role="status">
                <span class="glyph" aria-hidden="true">{{ banner.tone === 'warn' ? '⏸' : banner.tone === 'info' ? 'ℹ' : '⚠' }}</span>
                <div><strong>{{ banner.title }}</strong>{{ banner.text }}</div>
            </div>

            <!-- Caption + tags + time -->
            <section class="editor">
                <div class="ot-field">
                    <label for="tb-caption">{{ reblog ? 'Comment (optional)' : 'Caption' }}</label>
                    <textarea id="tb-caption" v-model="caption" class="ot-input" :rows="reblog ? 2 : 4" :disabled="!editable"
                              :placeholder="reblog ? 'Reblogged as it is. Anything typed here is added under the original.' : p!.CaptionPending ? 'The caption is being written…' : 'No caption'"></textarea>
                    <div class="help">
                        {{ caption.length }} characters{{ reblog ? '' : ` · ${captionProvenance}` }}
                    </div>
                </div>

                <div v-if="editable && canEdit && !reblog" class="regen">
                    <input v-model="direction" class="ot-input" maxlength="300" aria-label="Direction for the AI rewrite"
                           placeholder="Optional direction for the AI, e.g. “lean into the cat's face”" @keydown.enter.prevent="regenerate" />
                    <button class="ot-btn" :disabled="busy" @click="regenerate">{{ busyAction === 'regen' ? 'Writing…' : '✨ Rewrite with AI' }}</button>
                </div>

                <div class="ot-field">
                    <label for="tb-tags">Tags</label>
                    <OmniTumblrTagInput input-id="tb-tags" v-model="tags" :disabled="!editable || !canEdit" />
                    <div v-if="reblog" class="help">Tumblr lists only original posts under a tag, so a reblog's tags only file it in the blog's own archive.</div>
                    <div v-if="knownTags.length && !reblog" class="taghealth" aria-label="How each tag is doing on Tumblr">
                        <span v-for="t in knownTags" :key="t.Tag" class="ot-chip" :class="tagVerdictTone(t)" :title="t.Summary">#{{ t.Tag }} · {{ TAG_VERDICT_LABEL[t.Verdict] }}</span>
                    </div>
                    <div v-if="detail.CaptionInfo.SuggestedTags.length && !reblog" class="help">
                        AI suggested: {{ detail.CaptionInfo.SuggestedTags.map(t => '#' + t).join(' ') }}{{ detail.CaptionInfo.TagsResearched ? ' (checked on Tumblr)' : '' }}
                    </div>
                    <div v-if="detail.CaptionInfo.DroppedTags?.length && !reblog" class="help">
                        Left out, nobody else on Tumblr uses them: {{ detail.CaptionInfo.DroppedTags.map(t => '#' + t).join(' ') }}
                    </div>
                </div>

                <div v-if="editable" class="ot-field">
                    <label for="tb-when">Publish at (your local time)</label>
                    <input id="tb-when" v-model="scheduledLocal" type="datetime-local" class="ot-input auto" :disabled="!canEdit" />
                    <div class="help">
                        {{ p!.Origin === 'Autopilot' && p!.SlotUtc ? `Autopilot slot: ${fmtWhen(p!.SlotUtc)}.` : '' }}
                        Changing the time overrides autopilot's caps and spacing for this post.
                    </div>
                </div>

                <div v-if="editable && canEdit" class="saverow">
                    <button class="ot-btn primary" :disabled="!dirty || busy" @click="save">{{ busyAction === 'save' ? 'Saving…' : 'Save changes' }}</button>
                    <button v-if="dirty" class="ot-btn ghost" :disabled="busy" @click="reset">Discard</button>
                </div>
            </section>

            <!-- Performance -->
            <section v-if="reblog && p!.Status === 'Published'">
                <h4 class="ot-sectionhead">Performance</h4>
                <p class="original">Tumblr shows the original's notes on every reblog of it, so a reblog has no notes of its own to measure. What reblogs do for the blog shows up in its followers and activity.</p>
            </section>
            <section v-else-if="p!.Status === 'Published' || p!.Status === 'Removed'" class="perf">
                <h4 class="ot-sectionhead">Performance</h4>
                <div class="ot-kpis tight">
                    <OmniTraderKpi label="Notes" :value="fmtCount(p!.Notes)" small :foot="p!.MetricsSyncedUtc ? `checked ${fmtRelative(p!.MetricsSyncedUtc)}` : 'not checked yet'" />
                    <OmniTraderKpi label="Likes" :value="fmtCount(p!.Likes)" small />
                    <OmniTraderKpi label="Reblogs" :value="fmtCount(p!.Reblogs)" small />
                    <OmniTraderKpi label="At 24 h / 7 d" :value="`${fmtCount(p!.NotesAt24h)} / ${fmtCount(p!.NotesAt7d)}`" small />
                </div>
                <OmniTraderLineChart v-if="history.length > 1" :series="[{ name: 'Notes', colour: 'var(--ot-cat-1)', points: history }]"
                                     :height="170" x-label="Time" :zero-based="true" :format="(v: number) => fmtCount(v)" />
            </section>

            <!-- Facts -->
            <section>
                <h4 class="ot-sectionhead">Details</h4>
                <dl class="ot-kv">
                    <dt>Status</dt><dd>{{ STATUS_LABEL[p!.Status] }}{{ p!.Attempts ? ` · ${p!.Attempts} attempt(s)` : '' }}{{ detail.Deferrals ? ` · postponed ${detail.Deferrals}×` : '' }}</dd>
                    <dt>Origin</dt><dd>{{ p!.Origin }}{{ detail.ManualOverride ? ' · manual override' : '' }}</dd>
                    <dt>Scheduled</dt><dd>{{ fmtWhen(p!.ScheduledUtc) }}</dd>
                    <dt v-if="p!.PublishedUtc">Published</dt><dd v-if="p!.PublishedUtc">{{ fmtWhen(p!.PublishedUtc) }}</dd>
                    <dt>Posts as</dt><dd>{{ p!.TumblrState }}</dd>
                    <dt v-if="p!.TumblrUrl">On Tumblr</dt>
                    <dd v-if="p!.TumblrUrl && p!.TumblrIdPending">Tumblr is processing the video; the link appears once it is live</dd>
                    <dd v-else-if="p!.TumblrUrl"><a :href="p!.TumblrUrl" target="_blank" rel="noopener noreferrer" class="link">{{ p!.TumblrUrl }}</a></dd>
                    <dt v-if="detail.Content">Content</dt>
                    <dd v-if="detail.Content">{{ detail.Content.Kind }} · {{ detail.Content.Key }}{{ detail.Content.Views ? ` · ${fmtCount(detail.Content.Views)} views at source` : '' }}</dd>
                    <dt v-if="detail.Slug">Slug</dt><dd v-if="detail.Slug">{{ detail.Slug }}</dd>
                    <dt v-if="detail.CaptionInfo.AltText">Alt text</dt><dd v-if="detail.CaptionInfo.AltText">{{ detail.CaptionInfo.AltText }}</dd>
                </dl>
            </section>

            <section v-if="detail.Content?.OriginalCaption">
                <h4 class="ot-sectionhead">Original caption (source)</h4>
                <p class="original">{{ detail.Content.OriginalCaption }}</p>
            </section>

            <section v-if="detail.AttemptLog.length">
                <h4 class="ot-sectionhead">Publish attempts</h4>
                <ol class="ot-timeline">
                    <li v-for="(a, i) in [...detail.AttemptLog].reverse()" :key="i">
                        <span :class="a.Ok ? 'pos' : 'neg'">{{ a.Ok ? '✓' : '✕' }} {{ a.Code }}</span>
                        {{ a.Message }}
                        <span class="sub">{{ fmtWhen(a.Utc) }} · {{ (a.DurationMs / 1000).toFixed(1) }} s</span>
                    </li>
                </ol>
            </section>
        </div>

        <template #footer>
            <template v-if="detail && canEdit">
                <button v-if="p!.Status === 'AwaitingApproval'" class="ot-btn primary" :disabled="busy" @click="act('approve')">Approve</button>
                <button v-if="canPublishNow && canPublish" class="ot-btn" :disabled="busy" @click="act('publish-now')">Publish now</button>
                <button v-if="p!.Status === 'Failed'" class="ot-btn" :disabled="busy" @click="act('retry')">Retry</button>
                <button v-if="editable && reblog" class="ot-btn ghost" :disabled="busy" @click="act('pick-another')">{{ busyAction === 'pick-another' ? 'Looking…' : 'Pick another' }}</button>
                <button v-if="editable && !reblog && p!.Origin === 'Autopilot'" class="ot-btn ghost" :disabled="busy" @click="act('swap-content')">Swap content</button>
                <button v-if="editable && !reblog && p!.Origin === 'Autopilot'" class="ot-btn ghost" :disabled="busy" @click="act('skip')">Skip slot</button>
                <button v-if="editable" class="ot-btn danger" :disabled="busy" @click="act('cancel')">{{ reblog ? 'Don’t reblog' : 'Cancel post' }}</button>
                <button v-if="p!.Status === 'Published' && canPublish" class="ot-btn danger" :disabled="busy" @click="act('delete-remote')">Delete from Tumblr</button>
            </template>
            <a v-if="p?.TumblrUrl && p.Status === 'Published' && !p.TumblrIdPending" :href="p.TumblrUrl" target="_blank" rel="noopener noreferrer" class="ot-btn ghost">Open on Tumblr ↗</a>
        </template>
    </OmniTraderDrawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAccess } from '~/composables/useAccess';
import {
    STATUS_LABEL, TAG_VERDICT_LABEL, confirmAction, fmtBytes, fmtCount, fmtClipLength, fmtRelative, fmtWhen, forgetMedia, fromLocalInput, loadMediaUrl, notify,
    postMediaPath, postThumbPath, q, tagVerdictTone, toLocalInput, tumblrGet, tumblrPost, type PostDetail, type PostSummary,
} from '~/composables/useOmniTumblr';

const props = defineProps<{ open: boolean; postId: string | null }>();
const emit = defineEmits<{ close: []; changed: [post: PostSummary | null] }>();
const { can } = useAccess();
const canEdit = computed(() => can('omnitumblr.posts.act'));
// Publishing straight to Tumblr (and deleting from it) is a step above editing.
const canPublish = computed(() => can('omnitumblr.posts.publish'));

const detail = ref<PostDetail | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const busy = ref(false);
const busyAction = ref<string | null>(null);
const videoUrl = ref<string | null>(null);
const loadingVideo = ref(false);

const caption = ref('');
const tags = ref<string[]>([]);
// What Tumblr's listings say about the tags still on the post (ones not looked up yet are left out).
const knownTags = computed(() => (detail.value?.TagHealth ?? [])
    .filter(t => t.Verdict !== 'Unknown' && tags.value.some(x => x.toLowerCase() === t.Tag)));
const scheduledLocal = ref('');
const direction = ref('');

const p = computed(() => detail.value?.Post ?? null);
const reblog = computed(() => (p.value?.Kind === 'Reblog' ? detail.value?.Reblog ?? null : null));
const firstMedia = computed(() => detail.value?.Media[0] ?? null);
const editable = computed(() => !!p.value && ['Draft', 'Planned', 'Ready', 'AwaitingApproval'].includes(p.value.Status));
const canPublishNow = computed(() => !!p.value && ['Draft', 'Planned', 'Ready', 'AwaitingApproval', 'Failed', 'Skipped', 'Cancelled'].includes(p.value.Status));

const dirty = computed(() => {
    const post = p.value;
    if (!post) return false;
    return caption.value !== (post.Caption ?? '')
        || JSON.stringify(tags.value) !== JSON.stringify(post.Tags)
        || scheduledLocal.value !== toLocalInput(post.ScheduledUtc);
});

const drawerTitle = computed(() => p.value ? `${p.value.Kind === 'Reblog' ? 'Reblog' : `${p.value.Kind} post`}${p.value.BlogName ? ` · @${p.value.BlogName}` : ''}` : 'Post');
const drawerSubtitle = computed(() => p.value ? `${STATUS_LABEL[p.value.Status]} · ${fmtWhen(p.value.PublishedUtc ?? p.value.ScheduledUtc)}` : '');

const mediaFacts = computed(() => {
    const m = firstMedia.value;
    if (!m) return '';
    const parts = [m.Width && m.Height ? `${m.Width}×${m.Height}` : null, m.DurationSeconds ? fmtClipLength(m.DurationSeconds) : null, fmtBytes(m.Bytes)];
    if ((detail.value?.Media.length ?? 0) > 1) parts.push(`${detail.value!.Media.length} files`);
    return parts.filter(Boolean).join(' · ');
});

const captionProvenance = computed(() => {
    const info = detail.value?.CaptionInfo;
    if (!info) return '';
    if (p.value?.CaptionPending) return info.Error ? `AI failed ${info.Failures}× (${info.Error}); retrying` : 'being written';
    if (info.Edited) return 'written by hand';
    if (info.Mode === 'AI') return `AI${info.UsedVision ? ' (looked at the video)' : ''}${info.Model ? ` · ${info.Model}` : ''}${info.GeneratedUtc ? ` · ${fmtRelative(info.GeneratedUtc)}` : ''}`;
    return { None: 'no caption by design', Fixed: 'the blog\'s fixed caption', Rotate: 'from the caption pool', Original: 'the source\'s own caption', AI: 'AI' }[info.Mode];
});

const banner = computed(() => {
    const post = p.value;
    if (!post) return null;
    if (post.Status === 'Failed') return { tone: 'bad', title: 'This post failed', text: ` ${post.LastError ?? ''}` };
    if (post.Status === 'AwaitingApproval' && post.Kind === 'Reblog')
        return { tone: 'info', title: 'Waiting for your approval', text: ' This is someone else\'s post. It is reblogged once you approve it; left alone, it is dropped after two days.' };
    if (post.Status === 'AwaitingApproval') return { tone: 'info', title: 'Waiting for your approval', text: ' Autopilot will not publish it until it is approved.' };
    if (editable.value && post.BlockedReason) return { tone: 'warn', title: 'On hold', text: ` ${post.BlockedReason}` };
    if (['Skipped', 'Cancelled', 'Removed'].includes(post.Status) && post.LastError) return { tone: 'info', title: STATUS_LABEL[post.Status], text: ` ${post.LastError}` };
    return null;
});

const history = computed(() => (detail.value?.MetricsHistory ?? []).map(point => ({ x: new Date(point.Utc).getTime(), y: point.Notes })));

watch(() => [props.open, props.postId] as const, ([open, postId]) => {
    if (open && postId) void load(postId);
    if (!open) {
        if (videoUrl.value) URL.revokeObjectURL(videoUrl.value);
        videoUrl.value = null;
        direction.value = '';
    }
}, { immediate: true });

async function load(postId = props.postId) {
    if (!postId) return;
    loading.value = true;
    loadError.value = null;
    const result = await tumblrGet<PostDetail>(`/omnitumblr/post${q({ postId })}`);
    loading.value = false;
    if (!result.ok || !result.data) {
        loadError.value = result.error;
        return;
    }
    detail.value = result.data;
    reset();
}

function reset() {
    const post = p.value;
    if (!post) return;
    caption.value = post.Caption ?? '';
    tags.value = [...post.Tags];
    scheduledLocal.value = toLocalInput(post.ScheduledUtc);
}

async function playVideo() {
    if (!p.value) return;
    loadingVideo.value = true;
    const url = await loadMediaUrl(postMediaPath(p.value.PostId));
    loadingVideo.value = false;
    if (url) videoUrl.value = url;
    else notify('Could not load the video', 'The media file may have been removed.', 'error');
}

async function save() {
    const post = p.value;
    if (!post) return;
    const body: Record<string, unknown> = { postId: post.PostId };
    if (caption.value !== (post.Caption ?? '')) body.caption = caption.value;
    if (JSON.stringify(tags.value) !== JSON.stringify(post.Tags)) body.tags = tags.value;
    if (scheduledLocal.value !== toLocalInput(post.ScheduledUtc)) body.scheduledUtc = fromLocalInput(scheduledLocal.value);
    await run('save', () => tumblrPost<PostSummary>('/omnitumblr/posts/update', body), 'Saved');
}

async function regenerate() {
    const post = p.value;
    if (!post) return;
    await run('regen', () => tumblrPost<PostSummary>('/omnitumblr/posts/regenerate-caption', { postId: post.PostId, instruction: direction.value.trim() || null }), null);
}

const ACTIONS: Record<string, { confirm?: [string, string, string, boolean]; done: string }> = {
    'approve': { done: 'Approved' },
    'publish-now': { confirm: ['Publish now?', 'It goes out within a few seconds, ignoring the schedule, daily cap and spacing.', 'Publish now', false], done: 'Publishing…' },
    'retry': { done: 'Queued for another attempt' },
    'swap-content': { confirm: ['Swap the content?', 'Autopilot picks the next video in line for this slot and writes a new caption. This one will not be used again.', 'Swap', false], done: 'Swapped' },
    'pick-another': { done: 'Picked a different post' },
    'skip': { confirm: ['Skip this slot?', 'Nothing will be posted in this slot. The content is not reused.', 'Skip slot', true], done: 'Skipped' },
    'cancel': { confirm: ['Cancel this post?', 'Autopilot will fill its slot with different content.', 'Cancel post', true], done: 'Cancelled' },
    'delete-remote': { confirm: ['Delete it from Tumblr?', 'The post is permanently deleted from the blog on Tumblr. Its notes are lost. This cannot be undone.', 'Delete from Tumblr', true], done: 'Deleted from Tumblr' },
};

async function act(action: string) {
    const post = p.value;
    if (!post) return;
    const spec = ACTIONS[action];
    if (spec.confirm && !(await confirmAction(...spec.confirm))) return;
    // A reblog is swapped through the same route as any content; the server picks another post to reblog.
    const route = action === 'pick-another' ? 'swap-content' : action;
    await run(action, () => tumblrPost<any>(`/omnitumblr/posts/${route}`, { postId: post.PostId }), spec.done);
}

async function run(action: string, call: () => Promise<{ ok: boolean; error: string | null; data: any }>, done: string | null) {
    busy.value = true;
    busyAction.value = action;
    try {
        const result = await call();
        if (!result.ok) {
            notify('That did not work', result.error ?? 'Unknown error', 'error');
            return;
        }
        if (done) notify(done);
        if (p.value) forgetMedia(p.value.PostId);
        await load();
        emit('changed', p.value);
    } finally {
        busy.value = false;
        busyAction.value = null;
    }
}
</script>

<style scoped>
.tb-drawer { display: flex; flex-direction: column; gap: var(--ot-space-4); }
.taghealth { display: flex; flex-wrap: wrap; gap: 4px; margin-top: var(--ot-space-2); }
.reblog .warn { color: var(--ot-warning); }
.media { display: flex; flex-direction: column; gap: var(--ot-space-2); }
.player { width: 100%; max-height: 460px; border-radius: var(--ot-radius-sm); background: #000; }
.mediafacts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ot-space-3); font-size: 12px; color: var(--ot-text-2); }
.link { color: var(--ot-info); overflow-wrap: anywhere; }
.link:hover { text-decoration: underline; }
.editor { display: flex; flex-direction: column; gap: var(--ot-space-3); }
.regen { display: flex; gap: var(--ot-space-2); }
.regen .ot-input { flex: 1 1 auto; }
.saverow { display: flex; gap: var(--ot-space-2); }
.perf { display: flex; flex-direction: column; gap: var(--ot-space-3); }
.perf .ot-kpis { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); margin-bottom: 0; }
.original { margin: 0; font-size: 12.5px; color: var(--ot-text-2); white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
