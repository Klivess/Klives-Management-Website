<template>
    <ol class="ig-comments">
        <li v-for="thread in threads" :key="thread.Id" :class="{ hidden: thread.Hidden, unanswered: !thread.Own && !thread.Replied }">
            <div class="row">
                <div class="body">
                    <div class="who">
                        <a :href="`https://www.instagram.com/${thread.Username ?? ''}`" target="_blank" rel="noopener noreferrer" class="user">@{{ thread.Username ?? 'someone' }}</a>
                        <span class="sub">
                            <time :datetime="thread.Utc" :title="new Date(thread.Utc).toString()">{{ fmtRelative(thread.Utc, now) }}</time>
                            <template v-if="thread.LikeCount"> · ♥ {{ thread.LikeCount }}</template>
                            <template v-if="thread.Hidden"> · hidden</template>
                            <template v-if="!thread.Own && !thread.Replied"> · no reply yet</template>
                        </span>
                    </div>
                    <p class="text">{{ thread.Text || '(empty)' }}</p>
                    <button v-if="showMedia && thread.Media" type="button" class="media" :title="thread.Media.Caption ?? ''"
                            @click="thread.OmniPostId ? $emit('open-post', thread.OmniPostId) : openPermalink(thread.Media.Permalink)">
                        on {{ productLabel(thread.Media.ProductType) }}: “{{ (thread.Media.Caption ?? '').slice(0, 60) || 'untitled' }}{{ (thread.Media.Caption?.length ?? 0) > 60 ? '…' : '' }}”
                    </button>
                </div>
                <div v-if="canAct && !thread.Own" class="acts">
                    <button class="ot-btn ghost sm" :disabled="busyId === thread.Id" @click="toggleReply(thread.Id)">Reply</button>
                    <button class="ot-btn ghost sm" :disabled="busyId === thread.Id" @click="hide(thread)">{{ thread.Hidden ? 'Unhide' : 'Hide' }}</button>
                    <button class="ot-btn ghost sm danger" :disabled="busyId === thread.Id" @click="remove(thread)">Delete</button>
                </div>
            </div>

            <ol v-if="thread.Replies.length" class="replies">
                <li v-for="reply in thread.Replies" :key="reply.Id" :class="{ own: reply.Own, hidden: reply.Hidden }">
                    <span class="user">@{{ reply.Username ?? 'someone' }}</span>
                    <span class="text">{{ reply.Text }}</span>
                    <span class="sub">{{ fmtRelative(reply.Utc, now) }}</span>
                    <button v-if="canAct && reply.Own" class="linkish" :disabled="busyId === reply.Id" @click="remove(reply)">delete</button>
                </li>
            </ol>

            <form v-if="replyingTo === thread.Id" class="reply" @submit.prevent="sendReply(thread)">
                <input v-model="draft" class="ot-input" maxlength="2200" :aria-label="`Reply to @${thread.Username}`"
                       :placeholder="`Reply to @${thread.Username ?? 'them'}…`" />
                <button class="ot-btn primary sm" :disabled="!draft.trim() || busyId === thread.Id">{{ busyId === thread.Id ? 'Sending…' : 'Send' }}</button>
                <button type="button" class="ot-btn ghost sm" @click="replyingTo = null">Cancel</button>
            </form>
        </li>
        <li v-if="!threads.length" class="empty">{{ emptyText }}</li>
    </ol>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAccess } from '~/composables/useAccess';
import { confirmAction, fmtRelative, igPost, notify, useNow, type CommentItem, type CommentThread } from '~/composables/useOmniGram';

const props = withDefaults(defineProps<{
    threads: CommentThread[];
    accountId: string;
    showMedia?: boolean;
    emptyText?: string;
}>(), { showMedia: false, emptyText: 'No comments yet.' });
const emit = defineEmits<{ changed: []; 'open-post': [postId: string] }>();

const { can } = useAccess();
const canAct = computed(() => can('omnigram.comments.act'));
const now = useNow();
const busyId = ref<string | null>(null);
const replyingTo = ref<string | null>(null);
const draft = ref('');

function productLabel(type: string | null) {
    return type === 'REELS' ? 'a reel' : type === 'STORY' ? 'a story' : 'a post';
}

function openPermalink(url: string | null) {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

function toggleReply(id: string) {
    replyingTo.value = replyingTo.value === id ? null : id;
    draft.value = '';
}

async function run(id: string, call: () => Promise<{ ok: boolean; error: string | null }>, done: string) {
    busyId.value = id;
    try {
        const result = await call();
        if (!result.ok) {
            notify('Instagram did not accept that', result.error ?? '', 'error');
            return false;
        }
        notify(done);
        emit('changed');
        return true;
    } finally {
        busyId.value = null;
    }
}

async function sendReply(thread: CommentThread) {
    const message = draft.value.trim();
    if (!message) return;
    const ok = await run(thread.Id, () => igPost('/omnigram/comments/reply', { accountId: props.accountId, commentId: thread.Id, message }), 'Reply posted');
    if (ok) {
        replyingTo.value = null;
        draft.value = '';
    }
}

async function hide(thread: CommentThread) {
    const hidden = !thread.Hidden;
    await run(thread.Id, () => igPost('/omnigram/comments/hide', { accountId: props.accountId, commentId: thread.Id, hidden }), hidden ? 'Comment hidden' : 'Comment visible again');
}

async function remove(comment: CommentItem | CommentThread) {
    if (!(await confirmAction('Delete this comment?', 'It is deleted on Instagram. This cannot be undone.', 'Delete', true))) return;
    await run(comment.Id, () => igPost('/omnigram/comments/delete', { accountId: props.accountId, commentId: comment.Id }), 'Comment deleted');
}
</script>

<style scoped>
.ig-comments { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.ig-comments > li { padding: var(--ot-space-2) 0; display: flex; flex-direction: column; gap: 6px; }
.ig-comments > li + li { border-top: 1px solid var(--ot-line); }
.ig-comments > li.hidden .text { opacity: 0.55; }
.row { display: flex; gap: var(--ot-space-2); align-items: flex-start; min-width: 0; }
.body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.who { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
.user { font-weight: 600; font-size: 12.5px; color: var(--ot-text); }
a.user:hover { color: var(--ot-accent); }
.sub { font-size: 11px; color: var(--ot-muted); }
.unanswered .sub { color: var(--ot-warning); }
.text { margin: 0; font-size: 13px; line-height: 18px; overflow-wrap: anywhere; white-space: pre-line; }
.media { align-self: flex-start; border: 0; background: none; padding: 0; color: var(--ot-info); font-size: 11.5px; cursor: pointer; text-align: left; overflow-wrap: anywhere; }
.media:hover { text-decoration: underline; }
.acts { display: flex; flex-wrap: wrap; gap: 4px; flex: 0 0 auto; justify-content: flex-end; }
.replies { list-style: none; margin: 0 0 0 var(--ot-space-4); padding: 0 0 0 var(--ot-space-3); border-left: 2px solid var(--ot-line); display: flex; flex-direction: column; gap: 4px; }
.replies li { font-size: 12.5px; line-height: 17px; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.replies li.own .user { color: var(--ot-accent); }
.replies .text { font-size: 12.5px; }
.linkish { border: 0; background: none; padding: 0; color: var(--ot-negative); cursor: pointer; font-size: 11px; }
.reply { display: flex; flex-wrap: wrap; gap: var(--ot-space-2); }
.reply .ot-input { flex: 1 1 200px; min-width: 0; }
.empty { color: var(--ot-muted); font-size: 12.5px; }
@media (max-width: 560px) {
    .row { flex-direction: column; }
    .acts { justify-content: flex-start; }
}
</style>
