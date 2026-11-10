<template>
    <!-- Why the blog is or is not being seen: findings first, then what Tumblr's own listings say about its tags. -->
    <div class="tb-reach">
        <div v-if="!report && error" class="ot-card"><div class="body">
            <OmniTraderStateBlock kind="error" title="Could not load the reach check" :detail="error" />
        </div></div>
        <div v-else-if="!report" class="ot-skelrows"><div class="ot-skel" style="height:64px"></div><div class="ot-skel" style="height:200px"></div></div>

        <template v-else>
            <div class="ot-kpis tb-kpis5">
                <OmniTraderKpi label="Posts that got notes" :value="report.Posts30d ? `${report.WithNotes30d} of ${report.Posts30d}` : '—'"
                               :tone="report.Posts30d >= 5 && report.WithNotes30d < report.Posts30d * 0.4 ? 'bad' : undefined"
                               foot="last 30 days, posts a day old or more" />
                <OmniTraderKpi label="Notes per post" :value="report.AvgNotes30d != null ? String(report.AvgNotes30d) : '—'" :foot="`${fmtCount(report.Notes30d)} notes in all`" />
                <OmniTraderKpi label="New followers" :value="report.FollowersDelta30d != null ? fmtSignedCount(report.FollowersDelta30d) : '—'"
                               :foot="report.Followers != null ? `${fmtCount(report.Followers)} now · last 30 days` : 'last 30 days'" />
                <OmniTraderKpi label="Posts a day" :value="String(report.PostsPerDay)" foot="on the schedule" />
                <OmniTraderKpi label="Listed in Tumblr's tags" small :value="listedValue" :tone="report.Search.Listed === false ? 'bad' : report.Search.Listed ? 'good' : undefined"
                               :foot="listedFoot" help="Once a day a recent post is looked for in the listing of one of its own tags. A blog Tumblr has stopped listing cannot be found by tag at all." />
            </div>

            <OmniTraderCard title="What is holding reach back" subtitle="Worst first. Worked out from the blog's posts and from Tumblr's own listings of its tags."
                            :empty="!report.Findings.length" empty-kind="ok" empty-title="Nothing stands out" empty-text="Findings appear once the blog has a few posts and its tags have been checked.">
                <ul class="findings">
                    <li v-for="f in report.Findings" :key="f.Title" :class="f.Level">
                        <span class="ot-chip" :class="FINDING_TONE[f.Level]">{{ FINDING_LABEL[f.Level] }}</span>
                        <div class="text">
                            <strong>{{ f.Title }}</strong>
                            <p>{{ f.Detail }}</p>
                        </div>
                        <button v-if="f.Action === 'strategy' || f.Action === 'schedule'" class="ot-btn sm ghost" @click="emit('go', 'strategy')">
                            {{ f.Action === 'schedule' ? 'Edit schedule' : 'Edit strategy' }}
                        </button>
                        <a v-else-if="f.Action === 'profile'" class="ot-btn sm ghost" :href="`https://www.tumblr.com/settings/blog/${blogName}`" target="_blank" rel="noopener noreferrer">Blog settings ↗</a>
                    </li>
                </ul>
            </OmniTraderCard>

            <OmniTraderCard title="Tags" class="tb-section" flush
                            subtitle="Each tag as Tumblr lists it, leaving this account's own posts out. A tag earns its place when other people's posts under it get notes."
                            :empty="!report.Tags.length" empty-title="No tags yet" empty-text="Add fixed tags in the strategy, or let the caption model suggest them.">
                <div class="ot-tablewrap">
                    <table class="ot-table">
                        <thead>
                            <tr>
                                <th>Tag</th><th>From</th><th>On Tumblr</th><th class="num">Others post</th><th class="num">Typical notes</th>
                                <th class="num">This blog</th><th class="num">Its avg notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="t in report.Tags" :key="t.Source + t.Tag" :title="t.Summary">
                                <td class="tagcell">#{{ t.Tag }}<span class="sub">{{ t.Summary }}</span></td>
                                <td>{{ SOURCE_LABEL[t.Source] ?? t.Source }}</td>
                                <td><span class="ot-chip" :class="tagVerdictTone(t)">{{ TAG_VERDICT_LABEL[t.Verdict] }}</span></td>
                                <td class="num">{{ t.Verdict === 'Unknown' ? '' : fmtTagRate(t.PostsPerDay) }}</td>
                                <td class="num">{{ t.TypicalNotes ?? '' }}</td>
                                <td class="num">{{ t.OurPosts ? `${t.OurPosts} post${t.OurPosts === 1 ? '' : 's'}` : '' }}</td>
                                <td class="num">{{ t.OurAvgNotes ?? '' }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </OmniTraderCard>

            <OmniTraderCard v-if="canCheck" title="Try a tag" class="tb-section"
                            subtitle="Look tags up on Tumblr before adding them to the blog's fixed or rotating tags.">
                <div class="trybar">
                    <OmniTumblrTagInput v-model="tryTags" :max="20" label="Tags to check" placeholder="Type tags, comma to add…" input-id="tb-reach-try" />
                    <button class="ot-btn" :disabled="checking || !tryTags.length" @click="check">{{ checking ? 'Asking Tumblr…' : 'Check on Tumblr' }}</button>
                </div>
                <p v-if="checkError" class="neg small">{{ checkError }}</p>
                <div v-if="report.RelatedTags.length" class="related">
                    <span class="muted small">People also tag:</span>
                    <button v-for="t in report.RelatedTags" :key="t" type="button" class="chipbtn" :disabled="tryTags.includes(t)" @click="tryTags = [...tryTags, t]">#{{ t }}</button>
                </div>
                <ul v-if="checked.length" class="checked">
                    <li v-for="t in checked" :key="t.Tag">
                        <span class="ot-chip" :class="tagVerdictTone(t)">{{ TAG_VERDICT_LABEL[t.Verdict] }}</span>
                        <div class="text"><strong>#{{ t.Tag }}</strong><p>{{ t.Summary }}</p></div>
                    </li>
                </ul>
            </OmniTraderCard>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAccess } from '~/composables/useAccess';
import {
    TAG_VERDICT_LABEL, fmtCount, fmtRelative, fmtSignedCount, fmtTagRate, q, tagVerdictTone, tumblrGet, tumblrPost, usePoll,
    type ReachFinding, type ReachReport, type TagHealth,
} from '~/composables/useOmniTumblr';

const props = defineProps<{ blogId: string; blogName: string }>();
const emit = defineEmits<{ go: [tab: 'strategy'] }>();
const { can } = useAccess();
const canCheck = computed(() => can('omnitumblr.blogs.manage'));

const FINDING_LABEL: Record<ReachFinding['Level'], string> = { problem: 'Problem', warning: 'Worth fixing', info: 'Note', good: 'Good' };
const FINDING_TONE: Record<ReachFinding['Level'], string> = { problem: 'bad', warning: 'warn', info: 'info', good: 'ok' };
const SOURCE_LABEL: Record<string, string> = { fixed: 'Always', rotating: 'Rotating', ai: 'Suggested' };

const report = ref<ReachReport | null>(null);
const error = ref<string | null>(null);

async function load() {
    const result = await tumblrGet<ReachReport>(`/omnitumblr/reach${q({ blogId: props.blogId })}`);
    if (result.ok && result.data) {
        report.value = result.data;
        error.value = null;
    } else {
        error.value = result.error;
    }
}

usePoll(load, 60_000);
watch(() => props.blogId, () => { report.value = null; checked.value = []; void load(); });
defineExpose({ reload: load });

const listedValue = computed(() => {
    const listed = report.value?.Search.Listed;
    return listed == null ? 'Not checked yet' : listed ? 'Yes' : 'No';
});
const listedFoot = computed(() => {
    const s = report.value?.Search;
    if (!s?.CheckedUtc) return 'checked once a post is a few hours old';
    return `#${s.Tag} · checked ${fmtRelative(s.CheckedUtc)}`;
});

// ── try a tag ──
const tryTags = ref<string[]>([]);
const checked = ref<TagHealth[]>([]);
const checking = ref(false);
const checkError = ref<string | null>(null);

async function check() {
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

<style scoped>
.tb-reach { display: flex; flex-direction: column; }
.ot-kpis { margin-bottom: var(--ot-gutter); }
.tb-kpis5 { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
.tb-section { margin-top: var(--ot-gutter); }
.findings, .checked { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.findings li, .checked li { display: flex; align-items: flex-start; gap: var(--ot-space-3); padding: var(--ot-space-3) 0; }
.findings li + li, .checked li + li { border-top: 1px solid var(--ot-line); }
.findings .ot-chip, .checked .ot-chip { flex: 0 0 auto; margin-top: 1px; }
.text { flex: 1 1 auto; min-width: 0; }
.text strong { display: block; font-size: 13.5px; }
.text p { margin: 2px 0 0; color: var(--ot-text-2); font-size: 12.5px; line-height: 18px; overflow-wrap: anywhere; }
.findings .ot-btn { flex: 0 0 auto; }
/* Wide enough to read on a phone: the table scrolls sideways inside its wrapper instead of squeezing this column. */
.tagcell { min-width: 230px; max-width: 460px; white-space: normal; }
.tagcell .sub { white-space: normal; }
.trybar { display: flex; gap: var(--ot-space-2); align-items: flex-start; }
.trybar :deep(.tb-tags) { flex: 1 1 auto; min-width: 0; }
.related { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: var(--ot-space-3); }
.chipbtn { border: 1px solid var(--ot-line-strong); background: transparent; border-radius: 999px; padding: 2px 10px; font-size: 12px; cursor: pointer; color: var(--ot-text-2); }
.chipbtn:hover:not(:disabled) { border-color: var(--ot-accent); color: var(--ot-accent); }
.chipbtn:disabled { opacity: 0.45; cursor: default; }
.checked { margin-top: var(--ot-space-3); border-top: 1px solid var(--ot-line); }
.small { font-size: 11.5px; margin: var(--ot-space-2) 0 0; }
@media (max-width: 640px) {
    .findings li { flex-wrap: wrap; }
    .findings .text { flex-basis: 100%; order: 2; }
    .findings .ot-btn { order: 3; }
    .trybar { flex-direction: column; align-items: stretch; }
}
</style>
