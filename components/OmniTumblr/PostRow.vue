<template>
    <div class="tb-postrow" :class="`st-${post.Status}`" role="button" tabindex="0"
         @click="$emit('open', post.PostId)" @keydown.enter.prevent="$emit('open', post.PostId)">
        <OmniTumblrThumb :path="post.HasThumbnail ? postThumbPath(post.PostId) : null" :kind="post.Kind"
                         :badge="post.IsVideo && post.DurationSeconds ? fmtClipLength(post.DurationSeconds) : null" :size="compact ? 'xs' : 'sm'" />
        <div class="main">
            <div class="meta">
                <span v-if="showBlog && post.BlogName" class="blog">@{{ post.BlogName }}</span>
                <span class="when" :title="exactTime">{{ whenLabel }}</span>
                <span class="ot-chip" :class="statusTone(post.Status)">{{ STATUS_LABEL[post.Status] }}</span>
                <span v-if="post.Origin === 'Autopilot'" class="origin" title="Planned by autopilot">auto</span>
                <span v-if="post.TumblrState !== 'Published'" class="origin">{{ post.TumblrState.toLowerCase() }}</span>
            </div>
            <p class="caption" :class="{ empty: !post.Caption, pending: post.CaptionPending }">{{ captionText }}</p>
            <div v-if="post.Tags.length && !compact" class="tags">
                <span v-for="tag in post.Tags.slice(0, 8)" :key="tag">#{{ tag }}</span>
                <span v-if="post.Tags.length > 8" class="muted">+{{ post.Tags.length - 8 }}</span>
            </div>
            <p v-if="notice" class="notice" :class="noticeTone">{{ notice }}</p>
        </div>
        <div class="side">
            <template v-if="post.Status === 'Published'">
                <span class="metric" :title="`${post.Notes} notes`">{{ fmtCount(post.Notes) }}<small> notes</small></span>
                <span v-if="post.Likes !== null" class="sub">♥ {{ fmtCount(post.Likes) }} · ⟳ {{ fmtCount(post.Reblogs) }}</span>
            </template>
            <span v-else-if="pending" class="sub">{{ fmtRelative(post.ScheduledUtc, now) }}</span>
            <slot name="actions" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
    STATUS_LABEL, fmtCount, fmtClipLength, fmtRelative, fmtWhen, postThumbPath, statusTone, useNow, type PostSummary,
} from '~/composables/useOmniTumblr';

const props = withDefaults(defineProps<{ post: PostSummary; showBlog?: boolean; compact?: boolean }>(), { showBlog: false, compact: false });
defineEmits<{ open: [postId: string] }>();
const now = useNow();

const pending = computed(() => ['Draft', 'Planned', 'Ready', 'AwaitingApproval', 'Publishing'].includes(props.post.Status));

const whenLabel = computed(() => {
    const p = props.post;
    if (p.Status === 'Published' && p.PublishedUtc) return fmtWhen(p.PublishedUtc);
    if (pending.value) return fmtWhen(p.NextAttemptUtc && p.NextAttemptUtc > p.ScheduledUtc ? p.NextAttemptUtc : p.ScheduledUtc);
    return fmtWhen(p.PublishedUtc ?? p.ScheduledUtc);
});

const exactTime = computed(() => new Date(props.post.PublishedUtc ?? props.post.ScheduledUtc).toString());

const captionText = computed(() => {
    const p = props.post;
    if (p.CaptionPending) return p.CaptionError ? `Caption pending — AI failed: ${p.CaptionError}` : 'Writing the caption…';
    if (p.Kind === 'Text' && p.Title) return p.Title + (p.Caption ? ` — ${p.Caption}` : '');
    return p.Caption?.trim() || '(no caption)';
});

const notice = computed(() => {
    const p = props.post;
    if (pending.value && p.BlockedReason) return p.BlockedReason;
    if (p.Status === 'Failed' || p.Status === 'Skipped' || p.Status === 'Cancelled' || p.Status === 'Removed') return p.LastError;
    return null;
});

const noticeTone = computed(() => (props.post.Status === 'Failed' ? 'bad' : 'warn'));
</script>

<style scoped>
.tb-postrow {
    display: flex;
    gap: var(--ot-space-3);
    align-items: flex-start;
    padding: var(--ot-space-2) var(--ot-space-3);
    border-radius: var(--ot-radius-sm);
    cursor: pointer;
    transition: background var(--ot-fast);
}
.tb-postrow:hover, .tb-postrow:focus-visible { background: var(--ot-surface-3); }
.tb-postrow + .tb-postrow { border-top: 1px solid var(--ot-line); }
.main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ot-space-2); font-size: 12px; color: var(--ot-text-2); }
.blog { color: var(--ot-text); font-weight: 600; }
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
}
.caption.empty, .caption.pending { color: var(--ot-muted); font-style: italic; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11.5px; color: var(--ot-info); }
.notice { margin: 2px 0 0; font-size: 11.5px; line-height: 16px; overflow-wrap: anywhere; }
.notice.warn { color: var(--ot-warning); }
.notice.bad { color: var(--ot-negative); }
.side { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex: 0 0 auto; text-align: right; }
.metric { font-family: var(--ot-mono); font-weight: 600; font-size: 15px; }
.metric small { font-weight: 400; color: var(--ot-muted); font-size: 11px; }
.sub { font-size: 11.5px; color: var(--ot-muted); white-space: nowrap; }
</style>
