<template>
    <!-- One downloaded reel: its frame, the numbers that matter, who posted it and when. -->
    <button type="button" class="ms-reel" :class="{ compact }" :title="reel.Description ?? undefined" @click="$emit('open', reel.PostID)">
        <span class="frame">
            <OmniTumblrThumb :path="reel.VideoExists === false ? null : reelThumbPath(reel.PostID)" kind="Video" size="lg" :alt="`Reel by @${reel.Owner}`" />
            <span class="views" :title="`${reel.Views.toLocaleString()} views`">▶ {{ fmtCount(reel.Views) }}</span>
            <span v-if="rank" class="rank">#{{ rank }}</span>
            <span v-if="reel.VideoExists === false" class="missing">video missing</span>
        </span>
        <span class="meta">
            <span class="owner">@{{ reel.Owner }}</span>
            <span class="facts">
                <span title="Likes">♥ {{ reel.Likes ? fmtCount(reel.Likes) : '—' }}</span>
                <span title="Comments">✎ {{ fmtCount(reel.Comments) }}</span>
                <span v-if="reel.EngagementPct != null" :title="'Likes + comments as a share of views'">{{ reel.EngagementPct.toFixed(1) }}%</span>
            </span>
            <span v-if="!compact" class="when" :title="whenTitle">{{ reel.PostedUtc ? `posted ${fmtRel(reel.PostedUtc, now)}` : `saved ${fmtRel(reel.DownloadedUtc, now)}` }}</span>
        </span>
    </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { fmtRel, fmtStamp, reelThumbPath, useMemeNow, type ReelRow } from '~/composables/useMemeScraper';
import { fmtCount } from '~/composables/useOmniTumblr';

const props = defineProps<{ reel: ReelRow; rank?: number; compact?: boolean }>();
defineEmits<{ open: [postId: string] }>();
const now = useMemeNow();
const whenTitle = computed(() => `Posted ${fmtStamp(props.reel.PostedUtc)} · downloaded ${fmtStamp(props.reel.DownloadedUtc)}`);
</script>

<style scoped>
.ms-reel {
    display: flex;
    flex-direction: column;
    gap: var(--ot-space-1);
    padding: 0;
    border: 1px solid var(--ot-line);
    border-radius: var(--ot-radius);
    background: var(--ot-surface);
    overflow: hidden;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    color: inherit;
    min-width: 0;
    transition: border-color var(--ot-fast), transform var(--ot-fast);
}
.ms-reel:hover { border-color: var(--ot-line-strong); }
.ms-reel:hover .owner { color: var(--ot-accent); }
.frame { position: relative; display: block; width: 100%; aspect-ratio: 9 / 14; background: #000; }
.frame :deep(.tb-thumb.lg) { position: absolute; inset: 0; width: 100%; height: 100%; max-height: none; aspect-ratio: auto; border: 0; border-radius: 0; }
.frame :deep(.tb-thumb.lg img) { object-fit: cover; }
.views, .rank, .missing {
    position: absolute;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.72);
    color: #fff;
    font-size: 11px;
    line-height: 17px;
    font-family: var(--ot-mono);
}
.views { left: 6px; bottom: 6px; }
.rank { left: 6px; top: 6px; color: var(--ot-accent); }
.missing { right: 6px; top: 6px; color: var(--ot-warning); font-family: inherit; }
.meta { display: flex; flex-direction: column; gap: 1px; padding: 0 var(--ot-space-2) var(--ot-space-2); min-width: 0; }
.owner { font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.facts { display: flex; flex-wrap: wrap; gap: 0 var(--ot-space-2); font-size: 11px; color: var(--ot-text-2); font-family: var(--ot-mono); }
.facts > span { white-space: nowrap; }
.when { font-size: 11px; color: var(--ot-muted); }
.compact .meta { padding-bottom: var(--ot-space-1); }
</style>
