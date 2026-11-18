<template>
  <div class="tmb-pane" data-testid="tmb-reach">
    <div v-if="!report && error" class="tmb-error"><TumblrIcon name="alert" />{{ error }}</div>
    <div v-else-if="!report" style="display: grid; gap: 10px"><div class="tmb-skel" style="height: 64px"></div><div class="tmb-skel" style="height: 200px"></div></div>
    <template v-else>
      <div class="tmb-minikpis">
        <div class="tmb-minikpi"><b :class="{ 'tmb-neg': report.Posts30d >= 5 && report.WithNotes30d < report.Posts30d * 0.4 }">{{ report.Posts30d ? `${report.WithNotes30d} of ${report.Posts30d}` : '—' }}</b><span>posts that got any notes (30 d)</span></div>
        <div class="tmb-minikpi"><b>{{ report.AvgNotes30d ?? '—' }}</b><span>notes a post · {{ fmtCount(report.Notes30d) }} in all</span></div>
        <div class="tmb-minikpi"><b>{{ report.FollowersDelta30d != null ? fmtSignedCount(report.FollowersDelta30d) : '—' }}</b><span>followers in 30 d{{ report.Followers != null ? ` · ${fmtCount(report.Followers)} now` : '' }}</span></div>
        <div class="tmb-minikpi"><b>{{ report.PostsPerDay }}</b><span>posts a day on the schedule</span></div>
        <div class="tmb-minikpi" :title="'Once a day a recent post is looked for in the listing of one of its own tags.'">
          <b :class="report.Search.Listed === false ? 'tmb-neg' : report.Search.Listed ? 'tmb-pos' : ''">{{ report.Search.Listed == null ? 'Not checked' : report.Search.Listed ? 'Listed' : 'Not listed' }}</b>
          <span>{{ report.Search.CheckedUtc ? `in #${report.Search.Tag} · ${fmtRelative(report.Search.CheckedUtc, now)}` : 'in Tumblr\'s tag search' }}</span>
        </div>
      </div>

      <div class="tmb-panel">
        <div class="tmb-panel__title"><TumblrIcon name="radar" />What is holding reach back<small>worst first</small></div>
        <ul v-if="report.Findings.length" class="tmb-verdict__issues" style="padding: 0; max-height: none">
          <li v-for="f in report.Findings" :key="f.Title" class="tmb-issue" :data-tone="TONE[f.Level]">
            <span class="tmb-issue__bar"></span>
            <div style="min-width: 0"><p class="tmb-issue__title">{{ f.Title }}</p><p class="tmb-issue__detail" style="-webkit-line-clamp: unset">{{ f.Detail }}</p></div>
            <button v-if="f.Action === 'strategy' || f.Action === 'schedule'" class="tmb-btn tmb-btn--xs" @click="emit('strategy')">{{ f.Action === 'schedule' ? 'Schedule' : 'Strategy' }}</button>
            <a v-else-if="f.Action === 'profile'" class="tmb-btn tmb-btn--xs" :href="`https://www.tumblr.com/settings/blog/${blogName}`" target="_blank" rel="noopener noreferrer">Blog settings</a>
          </li>
        </ul>
        <div v-else class="tmb-empty">Nothing stands out yet: findings appear once the blog has a few posts and its tags have been checked.</div>
      </div>

      <div class="tmb-panel" style="padding: 0">
        <div class="tmb-panel__title" style="padding: 12px 12px 0"><TumblrIcon name="tag" />Tags, as Tumblr lists them<small>other people's posts only</small></div>
        <div v-if="report.Tags.length" class="tmb-tablewrap">
          <table class="tmb-table">
            <thead><tr><th>Tag</th><th>From</th><th>On Tumblr</th><th class="num">Others post</th><th class="num">Typical notes</th><th class="num">This blog</th><th class="num">Its notes</th></tr></thead>
            <tbody>
              <tr v-for="t in report.Tags" :key="t.Source + t.Tag" :title="t.Summary">
                <td style="min-width: 220px"><b>#{{ t.Tag }}</b><div class="tmb-help" style="white-space: normal">{{ t.Summary }}</div></td>
                <td class="tmb-dim">{{ SOURCE[t.Source] ?? t.Source }}</td>
                <td><span class="tmb-chip" :data-tone="verdictTone(t)">{{ TAG_VERDICT_LABEL[t.Verdict] }}</span></td>
                <td class="num">{{ t.Verdict === 'Unknown' ? '' : fmtTagRate(t.PostsPerDay) }}</td>
                <td class="num">{{ t.TypicalNotes ?? '' }}</td>
                <td class="num">{{ t.OurPosts || '' }}</td>
                <td class="num">{{ t.OurAvgNotes ?? '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="tmb-empty">No tags yet: add fixed tags in the strategy, or let the caption model suggest them.</div>
      </div>

      <div v-if="canCheck" class="tmb-panel">
        <div class="tmb-panel__title"><TumblrIcon name="search" />Try a tag<small>before adding it to the strategy</small></div>
        <div style="display: flex; gap: 8px; align-items: flex-start; flex-wrap: wrap">
          <div style="flex: 1 1 320px"><TumblrTagBox v-model="tryTags" :max="20" label="Tags to check" placeholder="Type tags, comma to add…" input-id="tmb-reach-try" /></div>
          <!-- Not disabled while empty: a tag still being typed is added when the box loses focus, which happens on this click. -->
          <button class="tmb-btn" :disabled="checking" data-testid="tmb-check-tags" @click="check"><TumblrIcon :name="checking ? 'refresh' : 'search'" :class="{ 'tmb-spin': checking }" />{{ checking ? 'Asking Tumblr…' : 'Check on Tumblr' }}</button>
        </div>
        <p v-if="checkError" class="tmb-error" style="margin-top: 8px">{{ checkError }}</p>
        <div v-if="report.RelatedTags.length" class="tmb-chips" style="margin-top: 10px; align-items: center">
          <span class="tmb-help">People also tag:</span>
          <button v-for="t in report.RelatedTags" :key="t" class="tmb-pick" :disabled="tryTags.includes(t)" @click="tryTags = [...tryTags, t]">#{{ t }}</button>
        </div>
        <ul v-if="checked.length" class="tmb-feed" style="margin-top: 10px">
          <li v-for="t in checked" :key="t.Tag" style="grid-template-columns: auto minmax(0, 1fr)">
            <span class="tmb-chip" :data-tone="verdictTone(t)">{{ TAG_VERDICT_LABEL[t.Verdict] }}</span>
            <div><b>#{{ t.Tag }}</b> <span class="tmb-dim">{{ t.Summary }}</span></div>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { TAG_VERDICT_LABEL, fmtCount, fmtRelative, fmtSignedCount, fmtTagRate, tumblrPost, type ReachFinding, type ReachReport, type TagHealth } from '~/composables/useOmniTumblr';

const props = defineProps<{ report: ReachReport | null; error: string | null; blogName: string; now: number; canCheck: boolean }>();
const emit = defineEmits<{ strategy: [] }>();

const TONE: Record<ReachFinding['Level'], string> = { problem: 'crit', warning: 'warn', info: 'info', good: 'ok' };
const SOURCE: Record<string, string> = { fixed: 'Always', rotating: 'Rotating', ai: 'Suggested', post: 'Post', checked: 'Checked' };

function verdictTone(t: Pick<TagHealth, 'Verdict' | 'Score'>): string {
  switch (t.Verdict) {
    case 'Dead': return 'crit';
    case 'Crowded': return 'warn';
    case 'Active': case 'Quiet': return t.Score >= 20 ? 'ok' : 'info';
    default: return 'neutral';
  }
}

const tryTags = ref<string[]>([]);
const checked = ref<TagHealth[]>([]);
const checking = ref(false);
const checkError = ref<string | null>(null);
watch(() => props.blogName, () => { checked.value = []; tryTags.value = []; });

async function check() {
  if (!tryTags.value.length) { checkError.value = 'Type a tag first.'; return; }
  checking.value = true;
  checkError.value = null;
  try {
    const result = await tumblrPost<{ Tags: TagHealth[] }>('/omnitumblr/tags/research', { tags: tryTags.value });
    if (!result.ok || !result.data) checkError.value = result.error;
    else checked.value = [...result.data.Tags].sort((a, b) => b.Score - a.Score);
  } finally {
    checking.value = false;
  }
}
</script>
