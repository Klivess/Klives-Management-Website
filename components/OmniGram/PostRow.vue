<template>
    <div class="ig-postrow" :class="`st-${post.Status}`" role="button" tabindex="0"
         @click="$emit('open', post.PostId)" @keydown.enter.prevent="$emit('open', post.PostId)">
        <OmniTumblrThumb :path="post.HasThumbnail ? postThumbPath(post.PostId) : null" :kind="thumbKind(post)"
                         :badge="badge" :size="compact ? 'xs' : 'sm'" />
        <div class="main">
            <div class="meta">
                <span v-if="showAccount && post.Username" class="account">@{{ post.Username }}</span>
                <span class="format" :title="FORMAT_LABEL[post.Format]">{{ FORMAT_GLYPH[post.Format] }} {{ FORMAT_LABEL[post.Format] }}</span>
                <span class="when" :title="exactTime">{{ whenLabel }}</span>
                <span class="ot-chip" :class="statusTone(post.Status)">{{ STATUS_LABEL[post.Status] }}</span>
                <span v-if="post.Origin === 'Autopilot'" class="origin" title="Planned by autopilot">auto</span>
                <span v-if="post.Trial !== 'Off'" class="origin" title="Trial reel: shown to non-followers first">trial</span>
                <span v-if="post.CompanionPostId && post.Format === 'Story'" class="origin" title="Story sharing a reel">story of reel</span>
            </div>
            <p class="caption" :class="{ empty: !captionShown, pending: post.CaptionPending }">{{ captionText }}</p>
            <div v-if="post.Hashtags.length && !compact" class="tags">
                <span v-for="tag in post.Hashtags.slice(0, 6)" :key="tag">#{{ tag }}</span>
                <span v-if="post.Hashtags.length > 6" class="muted">+{{ post.Hashtags.length - 6 }}</span>
                <span v-if="post.HashtagPlacement === 'FirstComment'" class="muted">(first comment)</span>
            </div>
            <p v-if="notice" class="notice" :class="noticeTone">{{ notice }}</p>
        </div>
        <div class="side">
            <template v-if="post.Status === 'Published'">
                <span v-if="post.Views !== null" class="metric" :title="`${post.Views} views`">{{ fmtCount(post.Views) }}<small> views</small></span>
                <span v-else class="metric muted" title="Insights arrive within the hour">—</span>
                <span class="sub">♥ {{ fmtCount(post.Likes) }} · 💬 {{ fmtCount(post.Comments) }}</span>
            </template>
            <span v-else-if="pending" class="sub">{{ fmtRelative(post.ScheduledUtc, now) }}</span>
            <slot name="actions" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
    FORMAT_GLYPH, FORMAT_LABEL, STATUS_LABEL, fmtClipLength, fmtCount, fmtRelative, fmtWhen, postThumbPath, statusTone, thumbKind, useNow, type PostSummary,
} from '~/composables/useOmniGram';

const props = withDefaults(defineProps<{ post: PostSummary; showAccount?: boolean; compact?: boolean }>(), { showAccount: false, compact: false });
defineEmits<{ open: [postId: string] }>();
const now = useNow();

const pending = computed(() => ['Draft', 'Planned', 'Ready', 'AwaitingApproval', 'Publishing'].includes(props.post.Status));

const badge = computed(() => {
    const p = props.post;
    if (p.Format === 'Carousel') return `${p.MediaCount}`;
    return p.IsVideo && p.DurationSeconds ? fmtClipLength(p.DurationSeconds) : null;
});

const whenLabel = computed(() => {
    const p = props.post;
    if (p.Status === 'Published' && p.PublishedUtc) return fmtWhen(p.PublishedUtc);
    if (pending.value) return fmtWhen(p.NextAttemptUtc && p.NextAttemptUtc > p.ScheduledUtc ? p.NextAttemptUtc : p.ScheduledUtc);
    return fmtWhen(p.PublishedUtc ?? p.ScheduledUtc);
});

const exactTime = computed(() => new Date(props.post.PublishedUtc ?? props.post.ScheduledUtc).toString());

const captionShown = computed(() => props.post.Caption?.trim() || '');

const captionText = computed(() => {
    const p = props.post;
    if (p.Format === 'Story') return 'Story (stories have no caption)';
    if (p.CaptionPending) return p.CaptionError ? `Caption pending — AI failed: ${p.CaptionError}` : 'Writing the caption…';
    return captionShown.value || '(no caption)';
});

const notice = computed(() => {
    const p = props.post;
    if (p.Status === 'Publishing') return p.ContainerStatus ? `Instagram is processing the media (${p.ContainerStatus.toLowerCase().replace('_', ' ')})` : 'Sending to Instagram…';
    if (pending.value && p.BlockedReason) return p.BlockedReason;
    if (pending.value && p.PrepareError) return `Preparing the media failed: ${p.PrepareError}`;
    if (p.Status === 'Failed' || p.Status === 'Skipped' || p.Status === 'Cancelled' || p.Status === 'Removed') return p.LastError;
    if (p.Status === 'Published' && p.FirstCommentError) return `First comment failed: ${p.FirstCommentError}`;
    return null;
});

const noticeTone = computed(() => (props.post.Status === 'Failed' ? 'bad' : props.post.Status === 'Publishing' ? 'info' : 'warn'));
</script>

<style scoped>
.ig-postrow {
    display: flex;
    gap: var(--ot-space-3);
    align-items: flex-start;
    padding: var(--ot-space-2) var(--ot-space-3);
    border-radius: var(--ot-radius-sm);
    cursor: pointer;
    transition: background var(--ot-fast);
    min-width: 0;
}
.ig-postrow:hover, .ig-postrow:focus-visible { background: var(--ot-surface-3); }
.ig-postrow + .ig-postrow { border-top: 1px solid var(--ot-line); }
.main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ot-space-2); font-size: 12px; color: var(--ot-text-2); }
.account { color: var(--ot-text); font-weight: 600; }
.format { color: var(--ot-text-2); white-space: nowrap; }
.origin { font-size: 11px; color: var(--ot-muted); border: 1px solid var(--ot-line); border-radius: 4px; padding: 0 4px; }
.caption {
    margin: 0;
    color: var(--ot-text);
    font-size: 13px;
    line-height: 18px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
    white-space: pre-line;
}
.caption.empty, .caption.pending { color: var(--ot-muted); font-style: italic; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11.5px; color: var(--ot-info); }
.notice { margin: 2px 0 0; font-size: 11.5px; line-height: 16px; overflow-wrap: anywhere; }
.notice.warn { color: var(--ot-warning); }
.notice.bad { color: var(--ot-negative); }
.notice.info { color: var(--ot-info); }
.side { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex: 0 0 auto; text-align: right; }
.metric { font-family: var(--ot-mono); font-weight: 600; font-size: 15px; }
.metric small { font-weight: 400; color: var(--ot-muted); font-size: 11px; }
.sub { font-size: 11.5px; color: var(--ot-muted); white-space: nowrap; }
</style>
