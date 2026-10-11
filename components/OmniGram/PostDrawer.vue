<template>
    <OmniTraderDrawer :open="open" :title="drawerTitle" :subtitle="drawerSubtitle" @close="$emit('close')">
        <div v-if="!detail && loading" class="ot-skelrows" aria-busy="true">
            <div class="ot-skel" style="height:280px"></div>
            <div class="ot-skel" style="width:80%"></div>
            <div class="ot-skel" style="width:60%"></div>
        </div>
        <OmniTraderStateBlock v-else-if="loadError" kind="error" title="Could not load this post" :detail="loadError" />

        <div v-else-if="detail" class="ig-drawer">
            <!-- Media -->
            <section class="media">
                <video v-if="videoUrl" class="player" :class="{ tall: p!.Format === 'Reel' || p!.Format === 'Story' }" :src="videoUrl" controls playsinline preload="metadata"></video>
                <OmniTumblrThumb v-else size="lg" :kind="mediaKind(current)"
                                 :path="current?.HasThumbnail ? postThumbPath(p!.PostId, current.Index) : null" alt="Post preview" />
                <div v-if="detail.Media.length > 1" class="strip" role="group" aria-label="Carousel items">
                    <button v-for="m in detail.Media" :key="m.Index" type="button" class="stripitem" :class="{ active: m.Index === mediaIndex }"
                            :aria-pressed="m.Index === mediaIndex" :aria-label="`Item ${m.Index + 1}`" @click="selectMedia(m.Index)">
                        <OmniTumblrThumb size="xs" :kind="mediaKind(m)" :path="m.HasThumbnail ? postThumbPath(p!.PostId, m.Index) : null" />
                    </button>
                </div>
                <div class="mediafacts">
                    <button v-if="current && current.MimeType.startsWith('video/') && !videoUrl && current.Exists" class="ot-btn sm"
                            :disabled="loadingVideo" @click="playVideo">{{ loadingVideo ? 'Loading video…' : '▶ Play video' }}</button>
                    <span v-if="current">{{ mediaFacts }}</span>
                    <span v-if="current && !current.Exists" class="neg">media file missing</span>
                    <span v-if="current?.PrepareError" class="neg">not prepared: {{ current.PrepareError }}</span>
                    <span v-else-if="current?.Prepared" class="muted" :title="current.PrepareNotes ?? ''">Instagram-ready copy {{ fmtBytes(current.PreparedBytes) }}</span>
                    <a v-if="detail.Content?.OriginalUrl" :href="detail.Content.OriginalUrl" target="_blank" rel="noopener noreferrer" class="link">
                        from @{{ detail.Content.Origin }} ↗
                    </a>
                </div>
            </section>

            <div v-if="banner" class="ot-banner" :class="banner.tone" role="status">
                <span class="glyph" aria-hidden="true">{{ banner.glyph }}</span>
                <div><strong>{{ banner.title }}</strong>{{ banner.text }}</div>
            </div>

            <!-- Caption, hashtags, time and format options -->
            <section class="editor">
                <template v-if="p!.Format !== 'Story'">
                    <div class="ot-field">
                        <label for="ig-caption">Caption</label>
                        <textarea id="ig-caption" v-model="caption" class="ot-input" rows="5" :disabled="!editable || !canEdit" maxlength="2200"
                                  :placeholder="p!.CaptionPending ? 'The caption is being written…' : 'No caption'"></textarea>
                        <div class="help">{{ caption.length }} / 2,200 · {{ captionProvenance }}</div>
                    </div>

                    <div v-if="editable && canEdit" class="regen">
                        <input v-model="direction" class="ot-input" maxlength="300" aria-label="Direction for the AI rewrite"
                               placeholder="Optional direction, e.g. “shorter, deadpan”" @keydown.enter.prevent="regenerate" />
                        <button class="ot-btn" :disabled="busy" @click="regenerate">{{ busyAction === 'regen' ? 'Writing…' : '✨ Rewrite with AI' }}</button>
                    </div>

                    <div class="ot-field">
                        <label for="ig-tags">Hashtags <span class="muted">({{ hashtags.length }}/30)</span></label>
                        <OmniTumblrTagInput input-id="ig-tags" v-model="hashtags" :max="30" placeholder="Add a hashtag…" label="Hashtags" :disabled="!editable || !canEdit" />
                        <div v-if="detail.CaptionInfo.SuggestedHashtags.length" class="help">AI suggested: {{ detail.CaptionInfo.SuggestedHashtags.map(t => '#' + t).join(' ') }}</div>
                    </div>

                    <div class="ot-formgrid">
                        <div class="ot-field">
                            <label for="ig-placement">Put hashtags</label>
                            <select id="ig-placement" v-model="placement" class="ot-select" :disabled="!editable || !canEdit">
                                <option value="Caption">at the end of the caption</option>
                                <option value="FirstComment">in the first comment</option>
                                <option value="None">nowhere (don't use them)</option>
                            </select>
                        </div>
                        <div v-if="p!.Format === 'Photo' || p!.Format === 'Carousel'" class="ot-field">
                            <label for="ig-alt">Alt text</label>
                            <input id="ig-alt" v-model="altText" class="ot-input" maxlength="1000" :disabled="!editable || !canEdit" placeholder="Describe the image for screen readers" />
                        </div>
                    </div>

                    <div class="ot-field">
                        <label for="ig-first">First comment <span class="muted">(posted by the account right after publishing)</span></label>
                        <textarea id="ig-first" v-model="firstComment" class="ot-input" rows="2" maxlength="2200" :disabled="!editable || !canEdit"
                                  placeholder="Optional"></textarea>
                    </div>
                </template>
                <p v-else class="muted storynote">Stories have no caption, hashtags or comments; they disappear from the profile after 24 hours.</p>

                <div v-if="p!.Format === 'Reel'" class="reelopts">
                    <label class="ot-check"><input v-model="shareToFeed" type="checkbox" :disabled="!editable || !canEdit || trial !== 'Off'" /> Also show in the profile grid</label>
                    <label class="ot-check"><input v-model="alsoPostStory" type="checkbox" :disabled="!editable || !canEdit" /> Share to story after publishing</label>
                    <div class="ot-field inline">
                        <label for="ig-trial">Trial reel</label>
                        <select id="ig-trial" v-model="trial" class="ot-select auto" :disabled="!editable || !canEdit">
                            <option value="Off">off</option>
                            <option value="Manual">yes, I decide whether to share it</option>
                            <option value="Auto">yes, share it if it performs well</option>
                        </select>
                    </div>
                    <div class="ot-field inline">
                        <label for="ig-cover">Cover frame at</label>
                        <input id="ig-cover" v-model="coverFrame" type="number" min="0" step="0.5" class="ot-input auto narrow" :disabled="!editable || !canEdit" placeholder="0" />
                        <span class="muted">seconds</span>
                    </div>
                </div>

                <div v-if="editable" class="ot-field">
                    <label for="ig-when">Publish at (your local time)</label>
                    <input id="ig-when" v-model="scheduledLocal" type="datetime-local" class="ot-input auto" :disabled="!canEdit" />
                    <div class="help">
                        {{ p!.Origin === 'Autopilot' && p!.SlotUtc ? `Autopilot slot: ${fmtWhen(p!.SlotUtc)}.` : '' }}
                        Changing the time overrides autopilot's daily cap and spacing for this post.
                    </div>
                </div>

                <div v-if="editable && canEdit" class="saverow">
                    <button class="ot-btn primary" :disabled="!dirty || busy" @click="save">{{ busyAction === 'save' ? 'Saving…' : 'Save changes' }}</button>
                    <button v-if="dirty" class="ot-btn ghost" :disabled="busy" @click="reset">Discard</button>
                </div>

                <details v-if="p!.Format !== 'Story' && p!.ComposedCaption" class="composed">
                    <summary>Exactly what Instagram receives{{ dirty ? ' (as last saved)' : '' }}</summary>
                    <pre>{{ p!.ComposedCaption }}</pre>
                    <p v-if="p!.HashtagPlacement === 'FirstComment' && p!.Hashtags.length" class="muted">First comment: {{ [p!.FirstComment, p!.Hashtags.map(t => '#' + t).join(' ')].filter(Boolean).join('\n\n') }}</p>
                </details>
            </section>

            <!-- Performance -->
            <section v-if="p!.Status === 'Published' || p!.Status === 'Removed'" class="perf">
                <h4 class="ot-sectionhead">Performance</h4>
                <div class="ot-kpis tight">
                    <OmniTraderKpi label="Views" :value="fmtCount(m.Views)" small :foot="m.InsightsSyncedUtc ? `checked ${fmtRelative(m.InsightsSyncedUtc, now)}` : 'not checked yet'" />
                    <OmniTraderKpi label="Reach" :value="fmtCount(m.Reach)" small foot="accounts reached" />
                    <OmniTraderKpi label="Likes" :value="fmtCount(m.Likes)" small />
                    <OmniTraderKpi label="Comments" :value="fmtCount(m.Comments)" small />
                    <OmniTraderKpi label="Shares" :value="fmtCount(m.Shares)" small />
                    <OmniTraderKpi label="Saves" :value="fmtCount(m.Saves)" small />
                    <OmniTraderKpi v-if="p!.IsVideo && p!.Format !== 'Story'" label="Avg watch" :value="fmtSeconds(m.AvgWatchTimeMs)" small
                                   :foot="m.SkipRate != null ? `${m.SkipRate.toFixed(0)}% skipped in 3 s` : ''" />
                    <OmniTraderKpi label="Follows" :value="fmtCount(m.Follows)" small foot="from this post" />
                    <OmniTraderKpi label="Profile visits" :value="fmtCount(m.ProfileVisits)" small />
                    <OmniTraderKpi label="At 24 h / 7 d" :value="`${fmtCount(m.ViewsAt24h)} / ${fmtCount(m.ViewsAt7d)}`" small foot="views" />
                </div>
                <p v-if="m.InsightsError" class="muted small">Insights: {{ m.InsightsError }}</p>
                <OmniTraderLineChart v-if="history.length > 1" :series="[{ name: 'Views', colour: 'var(--ot-cat-1)', points: history }]"
                                     :height="170" x-label="Time" :zero-based="true" :format="(v: number) => fmtCount(v)" />
            </section>

            <section v-if="p!.Status === 'Published' && p!.Format !== 'Story'">
                <h4 class="ot-sectionhead">Comments <span class="muted">({{ threads.length }})</span></h4>
                <OmniGramCommentList :threads="threads" :account-id="p!.AccountId" empty-text="No comments synced for this post yet (checked every 30 minutes)." @changed="load()" />
            </section>

            <!-- Facts -->
            <section>
                <h4 class="ot-sectionhead">Details</h4>
                <dl class="ot-kv">
                    <dt>Status</dt><dd>{{ STATUS_LABEL[p!.Status] }}{{ p!.Attempts ? ` · ${p!.Attempts} attempt(s)` : '' }}{{ detail.Deferrals ? ` · postponed ${detail.Deferrals}×` : '' }}</dd>
                    <dt>Origin</dt><dd>{{ p!.Origin }}{{ detail.ManualOverride ? ' · manual override' : '' }}</dd>
                    <dt>Format</dt><dd>{{ FORMAT_LABEL[p!.Format] }}{{ p!.Format === 'Reel' ? (p!.ShareToFeed ? ' · in the grid' : ' · reels tab only') : '' }}{{ p!.Trial !== 'Off' ? ` · trial (${p!.Trial.toLowerCase()})` : '' }}</dd>
                    <dt>Scheduled</dt><dd>{{ fmtWhen(p!.ScheduledUtc) }}</dd>
                    <template v-if="p!.PublishedUtc"><dt>Published</dt><dd>{{ fmtWhen(p!.PublishedUtc) }}</dd></template>
                    <template v-if="p!.Permalink"><dt>On Instagram</dt><dd><a :href="p!.Permalink" target="_blank" rel="noopener noreferrer" class="link">{{ p!.Permalink }}</a></dd></template>
                    <template v-if="detail.Content">
                        <dt>Content</dt>
                        <dd>{{ detail.Content.Kind }}{{ detail.Content.Origin ? ` · @${detail.Content.Origin}` : '' }}{{ detail.Content.Views ? ` · ${fmtCount(detail.Content.Views)} views at source` : '' }}</dd>
                    </template>
                    <template v-if="p!.Credit"><dt>Credit</dt><dd>{{ p!.Credit }}</dd></template>
                    <template v-if="p!.AltText && p!.Format !== 'Photo' && p!.Format !== 'Carousel'"><dt>Alt text</dt><dd>{{ p!.AltText }}</dd></template>
                    <template v-if="detail.Publish.Stage !== 'None'">
                        <dt>Instagram</dt>
                        <dd>
                            {{ detail.Publish.Stage === 'Processing' ? 'processing the media' : detail.Publish.Stage === 'PublishRequested' ? 'publish requested' : 'published' }}
                            {{ detail.Publish.ContainerStatus ? `· ${detail.Publish.ContainerStatus}` : '' }}
                            {{ detail.Publish.ContainerStatusDetail ? `· ${detail.Publish.ContainerStatusDetail}` : '' }}
                        </dd>
                    </template>
                    <template v-if="detail.Publish.MediaFetches">
                        <dt>Media fetched</dt>
                        <dd>{{ detail.Publish.MediaFetches }}× by Instagram{{ detail.Publish.LastMediaFetchUtc ? `, last ${fmtRelative(detail.Publish.LastMediaFetchUtc, now)}` : '' }}</dd>
                    </template>
                    <template v-if="p!.FirstCommentError || p!.FirstCommentPending">
                        <dt>First comment</dt><dd :class="{ neg: p!.FirstCommentError }">{{ p!.FirstCommentError ?? 'will be posted shortly' }}</dd>
                    </template>
                    <template v-if="current?.PrepareNotes"><dt>Preparation</dt><dd>{{ current.PrepareNotes }}</dd></template>
                </dl>
            </section>

            <section v-if="detail.Content?.OriginalCaption">
                <h4 class="ot-sectionhead">Original caption (source)</h4>
                <p class="original">{{ detail.Content.OriginalCaption }}</p>
            </section>

            <section v-if="detail.AttemptLog.length">
                <h4 class="ot-sectionhead">Publish log</h4>
                <ol class="ot-timeline">
                    <li v-for="(a, i) in [...detail.AttemptLog].reverse()" :key="i">
                        <span :class="a.Ok ? 'pos' : 'neg'">{{ a.Ok ? '✓' : '✕' }} {{ a.Step }}{{ a.Code ? ` · ${a.Code}` : '' }}</span>
                        {{ a.Message }}
                        <span class="sub">{{ fmtWhen(a.Utc) }} · {{ (a.DurationMs / 1000).toFixed(1) }} s</span>
                    </li>
                </ol>
            </section>
        </div>

        <template #footer>
            <template v-if="detail && canEdit">
                <button v-if="p!.Status === 'AwaitingApproval'" class="ot-btn primary" :disabled="busy" @click="act('approve')">Approve</button>
                <button v-if="editable" class="ot-btn" :disabled="busy" @click="act('publish-now')">Publish now</button>
                <button v-if="p!.Status === 'Failed' || p!.Status === 'Skipped'" class="ot-btn" :disabled="busy" @click="act('retry')">Retry</button>
                <button v-if="editable && p!.Origin === 'Autopilot' && p!.ContentSource" class="ot-btn ghost" :disabled="busy" @click="act('swap-content')">Swap content</button>
                <button v-if="['Planned', 'Ready', 'AwaitingApproval'].includes(p!.Status) && p!.Origin === 'Autopilot'" class="ot-btn ghost" :disabled="busy" @click="act('skip')">Skip slot</button>
                <button v-if="editable" class="ot-btn danger" :disabled="busy" @click="act('cancel')">Cancel post</button>
            </template>
            <button v-if="detail && p!.Status === 'Published' && p!.IgMediaId && can('omnigram.accounts.manage')" class="ot-btn danger" :disabled="busy" @click="act('delete-remote')">Delete from Instagram</button>
            <a v-if="p?.Permalink && p.Status === 'Published'" :href="p.Permalink" target="_blank" rel="noopener noreferrer" class="ot-btn ghost">Open on Instagram ↗</a>
        </template>
    </OmniTraderDrawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAccess } from '~/composables/useAccess';
import {
    FORMAT_LABEL, STATUS_LABEL, confirmAction, fmtBytes, fmtClipLength, fmtCount, fmtRelative, fmtSeconds, fmtWhen, forgetMedia, fromLocalInput, igGet, igPost,
    loadMediaUrl, notify, postMediaPath, postThumbPath, q, toLocalInput, useNow,
    type CommentThread, type HashtagPlacement, type PostDetail, type PostSummary, type TrialReelMode,
} from '~/composables/useOmniGram';

const props = defineProps<{ open: boolean; postId: string | null }>();
const emit = defineEmits<{ close: []; changed: [post: PostSummary | null] }>();
const { can } = useAccess();
const canEdit = computed(() => can('omnigram.content.publish'));
const now = useNow();

const detail = ref<PostDetail | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const busy = ref(false);
const busyAction = ref<string | null>(null);
const videoUrl = ref<string | null>(null);
const loadingVideo = ref(false);
const mediaIndex = ref(0);

const caption = ref('');
const hashtags = ref<string[]>([]);
const placement = ref<HashtagPlacement>('Caption');
const firstComment = ref('');
const altText = ref('');
const scheduledLocal = ref('');
const shareToFeed = ref(true);
const alsoPostStory = ref(false);
const trial = ref<TrialReelMode>('Off');
const coverFrame = ref<string | number>('');
const direction = ref('');

const p = computed(() => detail.value?.Post ?? null);
const m = computed(() => detail.value!.Metrics);
const current = computed(() => detail.value?.Media.find(x => x.Index === mediaIndex.value) ?? detail.value?.Media[0] ?? null);
const editable = computed(() => !!p.value && ['Draft', 'Planned', 'Ready', 'AwaitingApproval'].includes(p.value.Status));

const coverValue = computed(() => {
    const raw = String(coverFrame.value ?? '').trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
});

const dirty = computed(() => {
    const post = p.value;
    const info = detail.value;
    if (!post || !info) return false;
    return caption.value !== (post.Caption ?? '')
        || JSON.stringify(hashtags.value) !== JSON.stringify(post.Hashtags)
        || placement.value !== post.HashtagPlacement
        || firstComment.value !== (post.FirstComment ?? '')
        || altText.value !== (post.AltText ?? '')
        || scheduledLocal.value !== toLocalInput(post.ScheduledUtc)
        || shareToFeed.value !== info.Reel.ShareToFeed
        || alsoPostStory.value !== info.Reel.AlsoPostStory
        || trial.value !== info.Reel.Trial
        || coverValue.value !== (info.Reel.CoverFrameSeconds ?? null);
});

const drawerTitle = computed(() => p.value ? `${FORMAT_LABEL[p.value.Format]}${p.value.Username ? ` · @${p.value.Username}` : ''}` : 'Post');
const drawerSubtitle = computed(() => p.value ? `${STATUS_LABEL[p.value.Status]} · ${fmtWhen(p.value.PublishedUtc ?? p.value.ScheduledUtc)}` : '');

function mediaKind(media: PostDetail['Media'][number] | null) {
    return media?.MimeType.startsWith('video/') ? 'Video' : 'Photo';
}

const mediaFacts = computed(() => {
    const media = current.value;
    if (!media) return '';
    const parts = [media.Width && media.Height ? `${media.Width}×${media.Height}` : null, media.DurationSeconds ? fmtClipLength(media.DurationSeconds) : null, fmtBytes(media.Bytes)];
    if ((detail.value?.Media.length ?? 0) > 1) parts.push(`item ${media.Index + 1} of ${detail.value!.Media.length}`);
    return parts.filter(Boolean).join(' · ');
});

const captionProvenance = computed(() => {
    const info = detail.value?.CaptionInfo;
    if (!info) return '';
    if (p.value?.CaptionPending) return info.Error ? `AI failed ${info.Failures}× (${info.Error}); retrying` : 'being written';
    if (info.Edited) return 'written by hand';
    if (info.Mode === 'AI') return `AI${info.UsedVision ? ' (looked at the media)' : ''}${info.Model ? ` · ${info.Model}` : ''}${info.GeneratedUtc ? ` · ${fmtRelative(info.GeneratedUtc, now.value)}` : ''}`;
    return ({ None: 'no caption by design', Fixed: 'the account\'s fixed caption', Rotate: 'from the caption pool', Original: 'the source\'s own caption', Manual: 'written by hand', AI: 'AI' } as Record<string, string>)[info.Mode] ?? '';
});

const banner = computed(() => {
    const post = p.value;
    if (!post) return null;
    if (post.Status === 'Failed') return { tone: '', glyph: '⚠', title: 'This post failed', text: ` ${post.LastError ?? ''}${post.LastErrorCode ? ` (${post.LastErrorCode})` : ''}` };
    if (post.Status === 'Publishing') return { tone: 'info', glyph: '⟳', title: 'Publishing', text: post.ContainerStatus ? ` Instagram is processing the media (${post.ContainerStatus}).` : ' Sending it to Instagram…' };
    if (post.Status === 'AwaitingApproval') return { tone: 'info', glyph: 'ℹ', title: 'Waiting for your approval', text: ' Autopilot will not publish it until it is approved.' };
    if (editable.value && post.BlockedReason) return { tone: 'warn', glyph: '⏸', title: 'On hold', text: ` ${post.BlockedReason}` };
    if (editable.value && post.PrepareError) return { tone: 'warn', glyph: '!', title: 'The media could not be prepared', text: ` ${post.PrepareError}` };
    if (['Skipped', 'Cancelled', 'Removed'].includes(post.Status) && post.LastError) return { tone: 'info', glyph: 'ℹ', title: STATUS_LABEL[post.Status], text: ` ${post.LastError}` };
    if (post.Status === 'Published' && post.FirstCommentError) return { tone: 'warn', glyph: '!', title: 'The first comment was not posted', text: ` ${post.FirstCommentError}` };
    return null;
});

const history = computed(() => (detail.value?.MetricsHistory ?? [])
    .filter(point => point.Views != null)
    .map(point => ({ x: new Date(point.Utc).getTime(), y: point.Views as number })));

const threads = computed<CommentThread[]>(() => {
    const all = detail.value?.Comments ?? [];
    return all.filter(c => !c.ParentId).sort((a, b) => b.Utc.localeCompare(a.Utc)).map(c => ({
        ...c,
        Replies: all.filter(r => r.ParentId === c.Id).sort((a, b) => a.Utc.localeCompare(b.Utc)),
        Media: null,
    }));
});

watch(() => [props.open, props.postId] as const, ([open, postId]) => {
    if (open && postId) {
        mediaIndex.value = 0;
        void load(postId);
    }
    if (!open) {
        clearVideo();
        direction.value = '';
    }
}, { immediate: true });

function clearVideo() {
    if (videoUrl.value) URL.revokeObjectURL(videoUrl.value);
    videoUrl.value = null;
}

async function load(postId = props.postId) {
    if (!postId) return;
    loading.value = true;
    loadError.value = null;
    const result = await igGet<PostDetail>(`/omnigram/post${q({ postId })}`);
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
    const info = detail.value;
    if (!post || !info) return;
    caption.value = post.Caption ?? '';
    hashtags.value = [...post.Hashtags];
    placement.value = post.HashtagPlacement;
    firstComment.value = post.FirstComment ?? '';
    altText.value = post.AltText ?? '';
    scheduledLocal.value = toLocalInput(post.ScheduledUtc);
    shareToFeed.value = info.Reel.ShareToFeed;
    alsoPostStory.value = info.Reel.AlsoPostStory;
    trial.value = info.Reel.Trial;
    coverFrame.value = info.Reel.CoverFrameSeconds ?? '';
}

function selectMedia(index: number) {
    if (index === mediaIndex.value) return;
    clearVideo();
    mediaIndex.value = index;
}

async function playVideo() {
    if (!p.value || !current.value) return;
    loadingVideo.value = true;
    const url = await loadMediaUrl(postMediaPath(p.value.PostId, current.value.Index));
    loadingVideo.value = false;
    if (url) videoUrl.value = url;
    else notify('Could not load the video', 'The media file may have been removed.', 'error');
}

async function save() {
    const post = p.value;
    const info = detail.value;
    if (!post || !info) return;
    const body: Record<string, unknown> = { postId: post.PostId };
    if (caption.value !== (post.Caption ?? '')) body.caption = caption.value;
    if (JSON.stringify(hashtags.value) !== JSON.stringify(post.Hashtags)) body.hashtags = hashtags.value;
    if (placement.value !== post.HashtagPlacement) body.hashtagPlacement = placement.value;
    if (firstComment.value !== (post.FirstComment ?? '')) body.firstComment = firstComment.value;
    if (altText.value !== (post.AltText ?? '')) body.altText = altText.value;
    if (scheduledLocal.value !== toLocalInput(post.ScheduledUtc)) body.scheduledUtc = fromLocalInput(scheduledLocal.value);
    if (shareToFeed.value !== info.Reel.ShareToFeed) body.shareToFeed = shareToFeed.value;
    if (alsoPostStory.value !== info.Reel.AlsoPostStory) body.alsoPostStory = alsoPostStory.value;
    if (trial.value !== info.Reel.Trial) body.trial = trial.value;
    if (coverValue.value !== (info.Reel.CoverFrameSeconds ?? null)) body.coverFrameSeconds = coverValue.value;
    await run('save', () => igPost<PostSummary>('/omnigram/posts/update', body), 'Saved');
}

async function regenerate() {
    const post = p.value;
    if (!post) return;
    if (post.CaptionEdited && caption.value.trim()
        && !(await confirmAction('Replace your caption?', 'The AI writes a new caption and your edited one is discarded.', 'Rewrite', false))) return;
    await run('regen', () => igPost<PostSummary>('/omnigram/posts/regenerate-caption', { postId: post.PostId, instruction: direction.value.trim() || null }), null);
}

const ACTIONS: Record<string, { confirm?: [string, string, string, boolean]; done: string }> = {
    'approve': { done: 'Approved' },
    'publish-now': { confirm: ['Publish now?', 'It goes to Instagram within a few seconds, ignoring the schedule, daily cap and spacing.', 'Publish now', false], done: 'Publishing…' },
    'retry': { done: 'Queued for another attempt' },
    'swap-content': { confirm: ['Swap the content?', 'Autopilot picks the next video in line for this slot and writes a new caption. This one will not be used again.', 'Swap', false], done: 'Swapped' },
    'skip': { confirm: ['Skip this slot?', 'Nothing is posted in this slot and the content is not reused.', 'Skip slot', true], done: 'Skipped' },
    'cancel': { confirm: ['Cancel this post?', 'Autopilot fills its slot with different content.', 'Cancel post', true], done: 'Cancelled' },
    'delete-remote': { confirm: ['Delete it from Instagram?', 'The post is permanently deleted from the account on Instagram, with its likes, comments and views. This cannot be undone.', 'Delete from Instagram', true], done: 'Deleted from Instagram' },
};

async function act(action: string) {
    const post = p.value;
    if (!post) return;
    const spec = ACTIONS[action];
    if (spec.confirm && !(await confirmAction(...spec.confirm))) return;
    await run(action, () => igPost<any>(`/omnigram/posts/${action}`, { postId: post.PostId }), spec.done);
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
        if (done) notify(done, action === 'swap-content' ? result.data?.message ?? '' : '');
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
.ig-drawer { display: flex; flex-direction: column; gap: var(--ot-space-4); }
.media { display: flex; flex-direction: column; gap: var(--ot-space-2); }
.player { width: 100%; max-height: 460px; border-radius: var(--ot-radius-sm); background: #000; }
.player.tall { max-height: 560px; }
.strip { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
.stripitem { border: 2px solid transparent; border-radius: var(--ot-radius-sm); padding: 0; background: none; cursor: pointer; flex: 0 0 auto; }
.stripitem.active { border-color: var(--ot-accent); }
.mediafacts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ot-space-3); font-size: 12px; color: var(--ot-text-2); }
.link { color: var(--ot-info); overflow-wrap: anywhere; }
.link:hover { text-decoration: underline; }
.editor { display: flex; flex-direction: column; gap: var(--ot-space-3); }
.regen { display: flex; flex-wrap: wrap; gap: var(--ot-space-2); }
.regen .ot-input { flex: 1 1 200px; min-width: 0; }
.reelopts { display: flex; flex-direction: column; gap: var(--ot-space-2); padding: var(--ot-space-3); border: 1px solid var(--ot-line); border-radius: var(--ot-radius-sm); }
.ot-field.inline { display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; gap: var(--ot-space-2); }
.ot-field.inline label { margin: 0; }
.narrow { width: 90px; }
.storynote { margin: 0; font-size: 12.5px; }
.saverow { display: flex; gap: var(--ot-space-2); }
.composed summary { cursor: pointer; font-size: 12px; color: var(--ot-text-2); }
.composed pre { margin: var(--ot-space-2) 0 0; padding: var(--ot-space-3); background: var(--ot-surface-2); border: 1px solid var(--ot-line); border-radius: var(--ot-radius-sm); white-space: pre-wrap; overflow-wrap: anywhere; font-family: inherit; font-size: 12.5px; line-height: 1.5; }
.composed p { font-size: 12px; white-space: pre-wrap; margin: var(--ot-space-2) 0 0; }
.perf { display: flex; flex-direction: column; gap: var(--ot-space-3); }
.perf .ot-kpis { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); margin-bottom: 0; }
.small { font-size: 11.5px; margin: 0; }
.original { margin: 0; font-size: 12.5px; color: var(--ot-text-2); white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
