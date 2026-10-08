<template>
    <ol class="tb-events" :class="{ compact }">
        <li v-for="(ev, i) in shown" :key="`${ev.Utc}-${i}`" :class="levelTone(ev.Level)">
            <span class="dot" aria-hidden="true"></span>
            <div class="body">
                <span class="msg">{{ ev.Message }}</span>
                <span class="sub">
                    <time :datetime="ev.Utc" :title="new Date(ev.Utc).toString()">{{ fmtRelative(ev.Utc, now) }}</time>
                    <template v-if="showBlog && ev.BlogName"> · @{{ ev.BlogName }}</template>
                    · {{ ev.Kind }}
                    <button v-if="ev.PostId && openable" type="button" class="linkish" @click="$emit('open-post', ev.PostId)">view post</button>
                </span>
            </div>
        </li>
        <li v-if="!events.length" class="empty">{{ emptyText }}</li>
    </ol>
    <button v-if="events.length > limit && !expanded" class="ot-btn ghost sm more" @click="expanded = true">Show {{ events.length - limit }} more</button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { fmtRelative, levelTone, useNow, type OmniEvent } from '~/composables/useOmniTumblr';

const props = withDefaults(defineProps<{
    events: OmniEvent[];
    limit?: number;
    showBlog?: boolean;
    compact?: boolean;
    openable?: boolean;
    emptyText?: string;
}>(), { limit: 15, showBlog: true, compact: false, openable: true, emptyText: 'Nothing has happened yet.' });
defineEmits<{ 'open-post': [postId: string] }>();
const now = useNow();
const expanded = ref(false);
const shown = computed(() => (expanded.value ? props.events : props.events.slice(0, props.limit)));
</script>

<style scoped>
.tb-events { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.tb-events li { display: flex; gap: var(--ot-space-2); padding: 6px 0; font-size: 12.5px; line-height: 18px; }
.tb-events li + li { border-top: 1px solid var(--ot-line); }
.dot { width: 7px; height: 7px; border-radius: 50%; margin-top: 6px; flex: 0 0 auto; background: var(--ot-info); }
.ok .dot { background: var(--ot-positive); }
.warn .dot { background: var(--ot-warning); }
.bad .dot { background: var(--ot-negative); }
.body { display: flex; flex-direction: column; min-width: 0; }
.msg { overflow-wrap: anywhere; }
.bad .msg { color: #ffc9c9; }
.sub { font-size: 11px; color: var(--ot-muted); }
.linkish { border: 0; background: none; padding: 0 0 0 4px; color: var(--ot-info); cursor: pointer; font-size: 11px; }
.empty { color: var(--ot-muted); }
.compact li { padding: 4px 0; }
.more { margin-top: var(--ot-space-2); }
</style>
