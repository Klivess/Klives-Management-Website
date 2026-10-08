<template>
    <ol class="tb-activity">
        <li v-for="item in items.slice(0, limit)" :key="item.Id">
            <span class="glyph" :class="kind(item.Type)" aria-hidden="true">{{ activityGlyph(item.Type) }}</span>
            <div class="body">
                <span>
                    <a v-if="item.FromBlog" :href="`https://www.tumblr.com/${item.FromBlog}`" target="_blank" rel="noopener noreferrer" class="who">@{{ item.FromBlog }}</a>
                    <span v-else class="who">Someone</span>
                    {{ ACTIVITY_LABEL[item.Type] ?? item.Type.replace(/_/g, ' ') }}
                </span>
                <span v-if="item.Text" class="text">“{{ item.Text }}”</span>
                <span class="sub">{{ fmtRelative(item.Utc, now) }}</span>
            </div>
        </li>
        <li v-if="!items.length" class="empty">{{ emptyText }}</li>
    </ol>
</template>

<script setup lang="ts">
import { ACTIVITY_LABEL, activityGlyph, fmtRelative, useNow, type ActivityItem } from '~/composables/useOmniTumblr';

withDefaults(defineProps<{ items: ActivityItem[]; limit?: number; emptyText?: string }>(), {
    limit: 40,
    emptyText: 'No activity seen yet. Likes, reblogs, replies and new followers appear here within half an hour.',
});
const now = useNow();

function kind(type: string) {
    if (type === 'like') return 'like';
    if (type.startsWith('reblog')) return 'reblog';
    if (type === 'follow') return 'follow';
    return '';
}
</script>

<style scoped>
.tb-activity { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.tb-activity li { display: flex; gap: var(--ot-space-2); padding: 6px 0; font-size: 12.5px; line-height: 18px; }
.tb-activity li + li { border-top: 1px solid var(--ot-line); }
.glyph { width: 22px; height: 22px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%; background: var(--ot-surface-3); font-size: 11px; color: var(--ot-text-2); }
.glyph.like { color: #ff7ba5; }
.glyph.reblog { color: var(--ot-positive); }
.glyph.follow { color: var(--ot-info); }
.body { display: flex; flex-direction: column; min-width: 0; }
.who { color: var(--ot-text); font-weight: 600; }
a.who:hover { color: var(--ot-info); }
.text { color: var(--ot-text-2); font-style: italic; overflow-wrap: anywhere; }
.sub { font-size: 11px; color: var(--ot-muted); }
.empty { color: var(--ot-muted); }
</style>
