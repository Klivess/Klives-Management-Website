<template>
    <article class="tb-blogcard" :class="`state-${blog.State}`">
        <header>
            <OmniTumblrAvatar :src="blog.AvatarUrl" :name="blog.Name" :size="40" />
            <div class="id">
                <NuxtLink :to="link" class="name">@{{ blog.Name }}</NuxtLink>
                <span class="title">{{ blog.Title || '—' }}</span>
            </div>
            <span class="ot-chip" :class="blogStateTone(blog.State)" :title="blog.StateReason">{{ stateLabel }}</span>
        </header>

        <div class="numbers">
            <div>
                <span class="v">{{ fmtCount(blog.Followers) }}</span>
                <span class="k">followers</span>
                <span v-if="blog.FollowersDelta7d !== null" class="d" :class="blog.FollowersDelta7d > 0 ? 'pos' : blog.FollowersDelta7d < 0 ? 'neg' : 'muted'">
                    {{ fmtSignedCount(blog.FollowersDelta7d) }} in 7 d
                </span>
            </div>
            <div>
                <span class="v">{{ blog.Published7d }}</span>
                <span class="k">posts, 7 d</span>
                <span class="d muted">{{ blog.SlotsPerWeek ? `${blog.SlotsPerWeek}/week planned` : 'no schedule' }}</span>
            </div>
            <div>
                <span class="v">{{ blog.AvgNotes30d ?? '—' }}</span>
                <span class="k">notes / post</span>
                <span class="d muted">30 d average</span>
            </div>
        </div>
        <OmniTraderSparkline v-if="blog.FollowersSpark.length > 1" :values="blog.FollowersSpark" :height="26" label="Followers, last 14 days" />

        <div class="next">
            <OmniTumblrThumb size="xs" :kind="blog.NextPost?.Kind" :path="blog.NextPost?.HasThumbnail ? postThumbPath(blog.NextPost.PostId) : null" />
            <div class="nexttext">
                <span class="k">Next post</span>
                <span v-if="blog.NextPost">{{ fmtWhen(blog.NextPost.ScheduledUtc) }} · {{ fmtRelative(blog.NextPost.ScheduledUtc, now) }}</span>
                <span v-else class="muted">{{ blog.Autopilot ? 'planning…' : 'nothing scheduled' }}</span>
            </div>
        </div>

        <p v-if="blog.State !== 'ok'" class="reason" :class="blogStateTone(blog.State)">{{ blog.StateReason }}</p>

        <footer>
            <label class="ot-check" :title="canManage ? '' : 'Needs “Manage blogs”'">
                <input type="checkbox" :checked="blog.Autopilot" :disabled="!canManage || busy" @change="toggleAutopilot" />
                Autopilot
            </label>
            <button v-if="canManage" class="ot-btn sm ghost" :disabled="busy" @click="togglePause">{{ blog.Paused ? 'Resume' : 'Pause' }}</button>
            <NuxtLink class="ot-btn sm" :to="link">Open</NuxtLink>
        </footer>
    </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAccess } from '~/composables/useAccess';
import {
    blogStateTone, confirmAction, fmtCount, fmtRelative, fmtSignedCount, fmtWhen, notify, postThumbPath, tumblrPost, useNow, type BlogSummary,
} from '~/composables/useOmniTumblr';

const props = defineProps<{ blog: BlogSummary }>();
const emit = defineEmits<{ changed: [] }>();
const { can } = useAccess();
const canManage = computed(() => can('omnitumblr.blogs.manage'));
const now = useNow();
const busy = ref(false);

const link = computed(() => `/schemery/omnitumblr/blog/${props.blog.BlogId}`);
const stateLabel = computed(() => ({ ok: props.blog.Autopilot ? 'Autopilot' : 'Manual', attention: 'Attention', error: 'Problem', paused: 'Paused', idle: 'Idle' }[props.blog.State]));

async function update(body: Record<string, unknown>, done: string) {
    busy.value = true;
    try {
        const result = await tumblrPost('/omnitumblr/blogs/update', { blogId: props.blog.BlogId, ...body });
        if (!result.ok) notify('Could not update the blog', result.error ?? '', 'error');
        else { notify(done); emit('changed'); }
    } finally {
        busy.value = false;
    }
}

async function toggleAutopilot(event: Event) {
    const target = event.target as HTMLInputElement;
    const turningOn = target.checked;
    target.checked = props.blog.Autopilot; // reflect the server's answer, not the click
    if (!turningOn && props.blog.Pending > 0
        && !(await confirmAction('Switch autopilot off?', 'Posts autopilot has already planned for this blog will be cancelled. Manually created posts stay scheduled.', 'Switch off', true)))
        return;
    await update({ autopilot: turningOn }, turningOn ? 'Autopilot on' : 'Autopilot off');
}

async function togglePause() {
    await update({ paused: !props.blog.Paused }, props.blog.Paused ? 'Resumed' : 'Paused');
}
</script>

<style scoped>
.tb-blogcard {
    display: flex;
    flex-direction: column;
    gap: var(--ot-space-3);
    padding: var(--ot-card-pad);
    background: var(--ot-surface);
    border: 1px solid var(--ot-line);
    border-radius: var(--ot-radius);
    min-width: 0;
}
.tb-blogcard.state-error { border-color: rgba(255, 123, 123, 0.45); }
.tb-blogcard.state-attention { border-color: rgba(240, 180, 41, 0.4); }
header { display: flex; align-items: center; gap: var(--ot-space-3); min-width: 0; }
.id { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.name { font-weight: 650; font-size: 15px; color: var(--ot-text); }
.name:hover { color: var(--ot-accent); }
.title { font-size: 12px; color: var(--ot-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.numbers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--ot-space-2); }
.numbers > div { display: flex; flex-direction: column; min-width: 0; }
.v { font-size: 20px; line-height: 26px; font-weight: 650; font-family: var(--ot-mono); }
.k { font-size: 11.5px; color: var(--ot-text-2); }
.d { font-size: 11px; }
.next { display: flex; align-items: center; gap: var(--ot-space-2); font-size: 12.5px; }
.nexttext { display: flex; flex-direction: column; min-width: 0; }
.nexttext .k { font-size: 11px; color: var(--ot-muted); }
.reason { margin: 0; font-size: 12px; line-height: 16px; overflow-wrap: anywhere; color: var(--ot-text-2); }
.reason.bad { color: var(--ot-negative); }
.reason.warn { color: var(--ot-warning); }
footer { display: flex; align-items: center; gap: var(--ot-space-2); margin-top: auto; }
footer .ot-check { margin-right: auto; }
</style>
