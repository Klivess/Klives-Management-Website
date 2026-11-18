<template>
  <Teleport to="body">
    <div v-if="postId" class="tmb-layer">
      <div class="tmb-scrim" style="place-items: stretch; padding: 0; background: rgba(3, 4, 8, 0.4)" @pointerdown.self="emit('close')"></div>
      <aside class="tmb-sheet" role="dialog" aria-modal="true" :aria-label="title" data-testid="tmb-post-sheet">
        <header class="tmb-sheet__head">
          <TumblrThumb v-if="p" :path="tmbThumb(p)" :kind="p.Kind" size="xs" />
          <div style="flex: 1; min-width: 0">
            <h2 class="tmb-sheet__title tmb-truncate">{{ title }}</h2>
            <p class="tmb-sheet__sub">{{ subtitle }}</p>
          </div>
          <span v-if="p" class="tmb-chip" :data-tone="tmbStatusTone(p.Status)">{{ tmbStatusLabel(p.Status) }}</span>
          <button ref="closeButton" class="tmb-iconbtn" aria-label="Close" @click="emit('close')"><TumblrIcon name="x" /></button>
        </header>

        <div class="tmb-sheet__body">
          <div v-if="!detail && loading" style="display: grid; gap: 10px"><div class="tmb-skel" style="height: 280px"></div><div class="tmb-skel" style="width: 70%"></div></div>
          <div v-else-if="!detail" class="tmb-error"><TumblrIcon name="alert" />Could not load this post.</div>
          <template v-else-if="p">
            <!-- media -->
            <section style="display: grid; gap: 8px">
              <video v-if="videoUrl" class="tmb-player" :src="videoUrl" controls playsinline preload="metadata"></video>
              <TumblrThumb v-else size="lg" :kind="p.Kind" :path="tmbThumb(p)" alt="Post preview" />
              <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center; font-size: 12px" class="tmb-dim">
                <button v-if="firstMedia?.MimeType.startsWith('video/') && !videoUrl && firstMedia.Exists" class="tmb-btn tmb-btn--sm" :disabled="loadingVideo" @click="playVideo">
                  <TumblrIcon name="play" />{{ loadingVideo ? 'Loading…' : 'Play' }}
                </button>
                <span v-if="firstMedia">{{ mediaFacts }}</span>
                <span v-if="firstMedia && !firstMedia.Exists" class="tmb-neg">the media file is missing</span>
                <a v-if="detail.Content?.OriginalUrl" class="tmb-ext" :href="detail.Content.OriginalUrl" target="_blank" rel="noopener noreferrer">from @{{ detail.Content.Origin }} ↗</a>
              </div>
            </section>

            <div v-if="banner" class="tmb-note" :data-tone="banner.tone"><TumblrIcon :name="banner.icon" /><div><strong>{{ banner.title }}</strong> {{ banner.text }}</div></div>

            <section v-if="reblog" class="tmb-panel">
              <div class="tmb-panel__title"><TumblrIcon name="reblog" />Reblog of @{{ reblog.ParentBlogName }}</div>
              <p v-if="reblog.Summary" style="margin-bottom: 8px; white-space: pre-wrap">{{ reblog.Summary }}</p>
              <dl class="tmb-kv">
                <dt>Original</dt><dd><a v-if="reblog.ParentUrl" class="tmb-ext" :href="reblog.ParentUrl" target="_blank" rel="noopener noreferrer">on Tumblr ↗</a> · {{ fmtCount(reblog.ParentNotes) }} notes when picked{{ reblog.ParentPublishedUtc ? ` · posted ${fmtRelative(reblog.ParentPublishedUtc)}` : '' }}</dd>
                <template v-if="reblog.FoundUnderTag"><dt>Found under</dt><dd>#{{ reblog.FoundUnderTag }}</dd></template>
                <dt>Screening</dt><dd>{{ reblog.Reason || 'Passed.' }}<span v-if="!reblog.SeenByModel" style="color: var(--tmb-warn)"> The model could not look at it: look at the original first.</span></dd>
              </dl>
            </section>

            <!-- caption, tags, time -->
            <section style="display: grid; gap: 12px">
              <div class="tmb-field">
                <label for="tmb-cap">{{ reblog ? 'Comment (optional)' : 'Caption' }}</label>
                <textarea id="tmb-cap" v-model="caption" class="tmb-textarea" :rows="reblog ? 2 : 4" :disabled="!editable || !canEdit"
                          :placeholder="reblog ? 'Reblogged as it is; anything here goes under the original.' : p.CaptionPending ? 'The caption is being written…' : 'No caption'"></textarea>
                <span class="tmb-help">{{ caption.length }} characters{{ reblog ? '' : ` · ${provenance}` }}</span>
              </div>
              <div v-if="editable && canEdit && !reblog" style="display: flex; gap: 6px">
                <input v-model="direction" class="tmb-input" maxlength="300" placeholder="Direction for the AI, e.g. “lean into the cat's face”" aria-label="Direction for the AI rewrite" @keydown.enter.prevent="regenerate" />
                <button class="tmb-btn" :disabled="busy" data-testid="tmb-rewrite" @click="regenerate"><TumblrIcon name="sparkles" />{{ busyAction === 'regen' ? 'Writing…' : 'Rewrite' }}</button>
              </div>
              <div class="tmb-field">
                <label for="tmb-tags">Tags</label>
                <TumblrTagBox v-model="tags" input-id="tmb-tags" :disabled="!editable || !canEdit" :tones="tagTones" :titles="tagTitles" />
                <span v-if="knownTags.length && !reblog" class="tmb-help">Colour is how Tumblr's listing of each tag looks: green, people's posts there get notes; amber, flooded; red, nobody else uses it.</span>
                <span v-if="detail.CaptionInfo.SuggestedTags.length && !reblog" class="tmb-help">AI suggested {{ detail.CaptionInfo.SuggestedTags.map(t => '#' + t).join(' ') }}{{ detail.CaptionInfo.TagsResearched ? ' (checked on Tumblr)' : '' }}</span>
                <span v-if="detail.CaptionInfo.DroppedTags?.length && !reblog" class="tmb-help">Left out, nobody else uses them: {{ detail.CaptionInfo.DroppedTags.map(t => '#' + t).join(' ') }}</span>
              </div>
              <div v-if="editable" class="tmb-field" style="max-width: 280px">
                <label for="tmb-when">Publish at (your time)</label>
                <input id="tmb-when" v-model="scheduledLocal" type="datetime-local" class="tmb-input" :disabled="!canEdit" />
                <span class="tmb-help">{{ p.Origin === 'Autopilot' && p.SlotUtc ? `Autopilot's slot: ${fmtWhen(p.SlotUtc)}. ` : '' }}A new time overrides autopilot's caps and spacing for this post.</span>
              </div>
              <div v-if="editable && canEdit && dirty" style="display: flex; gap: 6px">
                <button class="tmb-btn tmb-btn--primary" :disabled="busy" data-testid="tmb-save-post" @click="save">{{ busyAction === 'save' ? 'Saving…' : 'Save changes' }}</button>
                <button class="tmb-btn tmb-btn--ghost" :disabled="busy" @click="reset">Discard</button>
              </div>
            </section>

            <!-- how it did -->
            <section v-if="(p.Status === 'Published' || p.Status === 'Removed') && !reblog">
              <h3 class="tmb-section-title">How it did</h3>
              <div class="tmb-minikpis">
                <div class="tmb-minikpi"><b>{{ fmtCount(p.Notes) }}</b><span>notes · {{ p.MetricsSyncedUtc ? `checked ${fmtRelative(p.MetricsSyncedUtc)}` : 'not checked yet' }}</span></div>
                <div class="tmb-minikpi"><b>{{ fmtCount(p.Likes) }} · {{ fmtCount(p.Reblogs) }}</b><span>likes · reblogs</span></div>
                <div class="tmb-minikpi"><b>{{ fmtCount(p.NotesAt24h) }} · {{ fmtCount(p.NotesAt7d) }}</b><span>after 24 h · 7 d</span></div>
              </div>
              <div v-if="growth.length > 1" style="height: 46px; margin-top: 8px"><TumblrSpark :values="growth" label="Notes over time" /></div>
            </section>
            <p v-else-if="reblog && p.Status === 'Published'" class="tmb-help">Tumblr shows the original's notes on every reblog of it, so a reblog has no notes of its own to measure.</p>

            <section>
              <h3 class="tmb-section-title">Details</h3>
              <dl class="tmb-kv">
                <dt>Status</dt><dd>{{ tmbStatusLabel(p.Status) }}{{ p.Attempts ? ` · ${p.Attempts} attempt(s)` : '' }}{{ detail.Deferrals ? ` · postponed ${detail.Deferrals}×` : '' }}</dd>
                <dt>Made by</dt><dd>{{ p.Origin === 'Autopilot' ? 'autopilot' : p.Origin === 'Manual' ? 'you' : 'import' }}{{ detail.ManualOverride ? ' · time set by hand' : '' }}</dd>
                <dt>Scheduled</dt><dd>{{ fmtWhen(p.ScheduledUtc) }}</dd>
                <template v-if="p.PublishedUtc"><dt>Published</dt><dd>{{ fmtWhen(p.PublishedUtc) }}</dd></template>
                <dt>Posts as</dt><dd>{{ p.TumblrState }}</dd>
                <template v-if="p.TumblrUrl"><dt>On Tumblr</dt><dd>
                  <span v-if="p.TumblrIdPending">Tumblr is still processing the video; the link appears once it is live.</span>
                  <a v-else class="tmb-ext" :href="p.TumblrUrl" target="_blank" rel="noopener noreferrer">{{ p.TumblrUrl }}</a>
                </dd></template>
                <template v-if="detail.Content"><dt>Content</dt><dd>{{ detail.Content.Kind }} · <span class="tmb-mono">{{ detail.Content.Key }}</span>{{ detail.Content.Views ? ` · ${fmtCount(detail.Content.Views)} views at the source` : '' }}</dd></template>
                <template v-if="detail.CaptionInfo.AltText"><dt>Alt text</dt><dd>{{ detail.CaptionInfo.AltText }}</dd></template>
              </dl>
            </section>
            <section v-if="detail.Content?.OriginalCaption">
              <h3 class="tmb-section-title">The source's caption</h3>
              <p class="tmb-dim" style="white-space: pre-wrap; overflow-wrap: anywhere">{{ detail.Content.OriginalCaption }}</p>
            </section>
            <section v-if="detail.AttemptLog.length">
              <h3 class="tmb-section-title">Publish attempts</h3>
              <ul class="tmb-feed">
                <li v-for="(a, i) in [...detail.AttemptLog].reverse()" :key="i">
                  <span class="tmb-feed__glyph" :data-tone="a.Ok ? 'ok' : 'crit'"><TumblrIcon :name="a.Ok ? 'check' : 'x'" /></span>
                  <div style="min-width: 0; overflow-wrap: anywhere"><span class="tmb-mono">{{ a.Code }}</span> {{ a.Message }}</div>
                  <span class="tmb-feed__when">{{ fmtWhen(a.Utc) }} · {{ (a.DurationMs / 1000).toFixed(1) }} s</span>
                </li>
              </ul>
            </section>
          </template>
        </div>

        <footer v-if="p && canEdit" class="tmb-sheet__foot">
          <button v-if="p.Status === 'AwaitingApproval'" class="tmb-btn tmb-btn--ok" :disabled="busy" data-testid="tmb-sheet-approve" @click="run('approve')"><TumblrIcon name="check" />Approve</button>
          <button v-if="canPublishNow && canPublish" class="tmb-btn" :disabled="busy" @click="run('publish-now')"><TumblrIcon name="send" />Publish now</button>
          <button v-if="p.Status === 'Failed'" class="tmb-btn" :disabled="busy" @click="run('retry')"><TumblrIcon name="refresh" />Retry</button>
          <button v-if="editable && reblog" class="tmb-btn tmb-btn--ghost" :disabled="busy" @click="run('pick-another')"><TumblrIcon name="swap" />Pick another</button>
          <button v-if="editable && !reblog && p.Origin === 'Autopilot'" class="tmb-btn tmb-btn--ghost" :disabled="busy" @click="run('swap-content')"><TumblrIcon name="swap" />Swap content</button>
          <button v-if="editable && !reblog && p.Origin === 'Autopilot'" class="tmb-btn tmb-btn--ghost" :disabled="busy" @click="run('skip')"><TumblrIcon name="skip" />Skip slot</button>
          <span style="flex: 1"></span>
          <button v-if="editable" class="tmb-btn tmb-btn--danger" :disabled="busy" @click="run('cancel')">{{ reblog ? 'Don’t reblog' : 'Cancel' }}</button>
          <button v-if="p.Status === 'Published' && canPublish" class="tmb-btn tmb-btn--danger" :disabled="busy" @click="run('delete-remote')"><TumblrIcon name="trash" />Delete from Tumblr</button>
          <a v-if="p.TumblrUrl && p.Status === 'Published' && !p.TumblrIdPending" class="tmb-btn tmb-btn--ghost" :href="p.TumblrUrl" target="_blank" rel="noopener noreferrer"><TumblrIcon name="external" />Open</a>
        </footer>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  fmtBytes, fmtClipLength, fmtCount, fmtRelative, fmtWhen, forgetMedia, fromLocalInput, loadMediaUrl, postMediaPath, toLocalInput, tumblrPost,
  type PostDetail,
} from '~/composables/useOmniTumblr';
import { TMB_EDITABLE, tmbStatusLabel, tmbStatusTone, tmbThumb, type TmbPost } from '~/scripts/tumblrConsole';

const props = defineProps<{
  postId: string | null;
  load: (postId: string) => Promise<PostDetail | null>;
  act: (action: string, postId: string) => Promise<boolean>;
  canEdit: boolean;
  canPublish: boolean;
}>();
const emit = defineEmits<{ close: []; changed: []; notify: [tone: string, text: string] }>();

const detail = ref<PostDetail | null>(null);
const loading = ref(false);
const busy = ref(false);
const busyAction = ref<string | null>(null);
const videoUrl = ref<string | null>(null);
const loadingVideo = ref(false);
const caption = ref('');
const tags = ref<string[]>([]);
const scheduledLocal = ref('');
const direction = ref('');
const closeButton = ref<HTMLElement | null>(null);

const p = computed(() => (detail.value?.Post ?? null) as TmbPost | null);
const reblog = computed(() => (p.value?.Kind === 'Reblog' ? detail.value?.Reblog ?? null : null));
const firstMedia = computed(() => detail.value?.Media[0] ?? null);
const editable = computed(() => !!p.value && TMB_EDITABLE.includes(p.value.Status));
const canPublishNow = computed(() => !!p.value && ['Draft', 'Planned', 'Ready', 'AwaitingApproval', 'Failed', 'Skipped', 'Cancelled'].includes(p.value.Status));
const dirty = computed(() => !!p.value && (caption.value !== (p.value.Caption ?? '') || JSON.stringify(tags.value) !== JSON.stringify(p.value.Tags) || scheduledLocal.value !== toLocalInput(p.value.ScheduledUtc)));

const title = computed(() => (p.value ? `${p.value.Kind === 'Reblog' ? 'Reblog' : `${p.value.Kind} post`}${p.value.BlogName ? ` on @${p.value.BlogName}` : ''}` : 'Post'));
const subtitle = computed(() => (p.value ? fmtWhen(p.value.PublishedUtc ?? p.value.ScheduledUtc) : ''));
const mediaFacts = computed(() => {
  const m = firstMedia.value;
  if (!m) return '';
  const parts = [m.Width && m.Height ? `${m.Width}×${m.Height}` : null, m.DurationSeconds ? fmtClipLength(m.DurationSeconds) : null, fmtBytes(m.Bytes)];
  if ((detail.value?.Media.length ?? 0) > 1) parts.push(`${detail.value!.Media.length} files`);
  return parts.filter(Boolean).join(' · ');
});
const provenance = computed(() => {
  const info = detail.value?.CaptionInfo;
  if (!info) return '';
  if (p.value?.CaptionPending) return info.Error ? `the AI failed ${info.Failures}× (${info.Error}); retrying` : 'being written';
  if (info.Edited) return 'written by hand';
  if (info.Mode === 'AI') return `AI${info.UsedVision ? ', looked at the video' : ''}${info.Model ? ` · ${info.Model}` : ''}${info.GeneratedUtc ? ` · ${fmtRelative(info.GeneratedUtc)}` : ''}`;
  return ({ None: 'no caption by design', Fixed: 'the blog\'s fixed caption', Rotate: 'from the caption pool', Original: 'the source\'s own caption', AI: 'AI' } as Record<string, string>)[info.Mode];
});
const banner = computed(() => {
  const post = p.value;
  if (!post) return null;
  if (post.Status === 'Failed') return { tone: 'crit', icon: 'octagon-x', title: 'This post failed.', text: post.LastError ?? '' };
  if (post.Status === 'AwaitingApproval' && post.Kind === 'Reblog') return { tone: 'warn', icon: 'inbox', title: 'Waiting for your approval.', text: 'This is someone else\'s post: it is reblogged once approved, and dropped after two days if left alone.' };
  if (post.Status === 'AwaitingApproval') return { tone: 'warn', icon: 'inbox', title: 'Waiting for your approval.', text: 'Autopilot will not publish it until it is approved.' };
  if (editable.value && post.BlockedReason) return { tone: 'warn', icon: 'pause', title: 'On hold.', text: post.BlockedReason };
  if (['Skipped', 'Cancelled', 'Removed'].includes(post.Status) && post.LastError) return { tone: 'info', icon: 'info', title: `${tmbStatusLabel(post.Status)}.`, text: post.LastError };
  return null;
});

const VERDICT_TONE: Record<string, string> = { Dead: 'crit', Crowded: 'warn', Active: 'ok', Quiet: 'info' };
const knownTags = computed(() => (detail.value?.TagHealth ?? []).filter(t => t.Verdict !== 'Unknown'));
const tagTones = computed(() => Object.fromEntries(knownTags.value.map(t => [t.Tag.toLowerCase(), t.Verdict === 'Quiet' && t.Score >= 20 ? 'ok' : VERDICT_TONE[t.Verdict]])));
const tagTitles = computed(() => Object.fromEntries(knownTags.value.map(t => [t.Tag.toLowerCase(), t.Summary])));
const growth = computed(() => (detail.value?.MetricsHistory ?? []).map(m => m.Notes));

/** Esc closes the sheet wherever focus is (a save removes the button that had it). A dialog above it stops the key first. */
function onWindowKey(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  event.preventDefault();
  emit('close');
}
watch(() => !!props.postId, open => {
  if (open) window.addEventListener('keydown', onWindowKey);
  else window.removeEventListener('keydown', onWindowKey);
}, { immediate: true });
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKey));

watch(() => props.postId, async (postId, before) => {
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value);
  videoUrl.value = null;
  direction.value = '';
  if (!postId) { detail.value = null; return; }
  if (postId !== before) detail.value = null;
  await reload();
  await nextTick();
  closeButton.value?.focus();
}, { immediate: true });

async function reload() {
  if (!props.postId) return;
  loading.value = true;
  try {
    const loaded = await props.load(props.postId);
    if (loaded && loaded.Post.PostId === props.postId) {
      detail.value = loaded;
      reset();
    }
  } finally {
    loading.value = false;
  }
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
  else emit('notify', 'crit', 'The video could not be loaded; its file may have been removed.');
}

async function save() {
  const post = p.value;
  if (!post) return;
  const body: Record<string, unknown> = { postId: post.PostId };
  if (caption.value !== (post.Caption ?? '')) body.caption = caption.value;
  if (JSON.stringify(tags.value) !== JSON.stringify(post.Tags)) body.tags = tags.value;
  if (scheduledLocal.value !== toLocalInput(post.ScheduledUtc)) body.scheduledUtc = fromLocalInput(scheduledLocal.value);
  await call('save', '/omnitumblr/posts/update', body, 'Saved');
}

async function regenerate() {
  const post = p.value;
  if (!post) return;
  await call('regen', '/omnitumblr/posts/regenerate-caption', { postId: post.PostId, instruction: direction.value.trim() || null }, 'Rewritten');
}

async function call(action: string, path: string, body: Record<string, unknown>, done: string) {
  busy.value = true;
  busyAction.value = action;
  try {
    const result = await tumblrPost(path, body);
    if (!result.ok) { emit('notify', 'crit', result.error ?? 'That did not work'); return; }
    emit('notify', 'ok', done);
    if (p.value) forgetMedia(p.value.PostId);
    await reload();
    emit('changed');
  } finally {
    busy.value = false;
    busyAction.value = null;
  }
}

async function run(action: string) {
  const post = p.value;
  if (!post) return;
  busy.value = true;
  busyAction.value = action;
  try {
    const ok = await props.act(action, post.PostId);
    if (!ok) return;
    forgetMedia(post.PostId);
    if (action === 'delete-remote' || action === 'cancel' || action === 'skip') emit('close');
    else await reload();
  } finally {
    busy.value = false;
    busyAction.value = null;
  }
}
</script>
