<template>
    <div class="tb-strategy">
        <div v-if="dirty || saveError" class="ot-banner" :class="saveError ? '' : 'info'" role="status">
            <span class="glyph" aria-hidden="true">{{ saveError ? '⚠' : '✎' }}</span>
            <div>
                <strong>{{ saveError ? 'Not saved' : 'Unsaved changes' }}</strong>
                {{ saveError ?? 'Save to apply them. Upcoming captions are rewritten if the caption style changes.' }}
            </div>
            <div v-if="canEdit" class="actions">
                <button class="ot-btn ghost sm" :disabled="saving" @click="discard">Discard</button>
                <button class="ot-btn primary sm" :disabled="saving || !dirty" @click="save">{{ saving ? 'Saving…' : 'Save strategy' }}</button>
            </div>
        </div>

        <!-- Schedule -->
        <OmniTraderCard title="When to post" subtitle="Weekly time slots. Autopilot fills each one with content, a caption and tags ahead of time.">
            <OmniTumblrScheduleEditor v-model:slots="draft.Slots" v-model:timeZone="draft.TimeZone" :disabled="!canEdit" />
            <details class="advanced">
                <summary>Timing rules</summary>
                <div class="ot-formgrid">
                    <div class="ot-field">
                        <label :for="fid('plan-ahead-days')">Prepare ahead (days)</label>
                        <input :id="fid('plan-ahead-days')" v-model.number="draft.PlanAheadDays" type="number" min="1" max="30" class="ot-input" :disabled="!canEdit" />
                        <div class="help">How far ahead posts are planned and captioned for review.</div>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('jitter-minutes')">Natural jitter (± min)</label>
                        <input :id="fid('jitter-minutes')" v-model.number="draft.JitterMinutes" type="number" min="0" max="120" class="ot-input" :disabled="!canEdit" />
                        <div class="help">Posts go out a few minutes either side of the slot, not on the dot.</div>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('max-posts-per-day')">Max posts per day</label>
                        <input :id="fid('max-posts-per-day')" v-model.number="draft.MaxPostsPerDay" type="number" min="1" max="250" class="ot-input" :disabled="!canEdit" />
                    </div>
                    <div class="ot-field">
                        <label :for="fid('min-gap-minutes')">Min gap between posts (min)</label>
                        <input :id="fid('min-gap-minutes')" v-model.number="draft.MinGapMinutes" type="number" min="0" max="1440" class="ot-input" :disabled="!canEdit" />
                    </div>
                    <div class="ot-field">
                        <label :for="fid('missed-slots')">If a slot is missed</label>
                        <select :id="fid('missed-slots')" v-model="draft.MissedSlots" class="ot-select" :disabled="!canEdit">
                            <option value="PublishLate">Publish late (within grace)</option>
                            <option value="Skip">Skip it</option>
                        </select>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('missed-slot-grace-hours')">Grace period (hours)</label>
                        <input :id="fid('missed-slot-grace-hours')" v-model.number="draft.MissedSlotGraceHours" type="number" min="0" max="72" class="ot-input" :disabled="!canEdit || draft.MissedSlots === 'Skip'" />
                        <div class="help">After an outage, older slots are skipped instead of flooding the blog.</div>
                    </div>
                </div>
            </details>
        </OmniTraderCard>

        <!-- Content -->
        <OmniTraderCard title="What to post" subtitle="Where autopilot finds content. Each item is used once per blog.">
            <div class="ot-segment" role="group" aria-label="Content source">
                <button v-for="opt in SOURCES" :key="opt.value" type="button" :aria-pressed="draft.Source === opt.value" :disabled="!canEdit" @click="draft.Source = opt.value">{{ opt.label }}</button>
            </div>
            <p class="lead">{{ SOURCES.find(s => s.value === draft.Source)?.help }}</p>

            <template v-if="draft.Source === 'MemeScraper'">
                <div v-if="catalog && !catalog.Ready" class="ot-banner warn"><span class="glyph">⏳</span><div><strong>MemeScraper is still loading</strong> Its niches and accounts appear here once it is ready.</div></div>
                <div class="ot-formgrid wide">
                    <div class="ot-field">
                        <label :id="fid('niches')">Niches</label>
                        <div class="chips" role="group" :aria-labelledby="fid('niches')">
                            <button v-for="n in catalog?.Niches ?? []" :key="n.Name" type="button" class="chip" :aria-pressed="hasNiche(n.Name)" :disabled="!canEdit" @click="toggleNiche(n.Name)">
                                {{ n.Name }} <small>{{ n.Reels }}</small>
                            </button>
                            <span v-if="catalog && !catalog.Niches.length" class="muted">No niches defined in MemeScraper.</span>
                        </div>
                        <div class="help">None selected = every niche.</div>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('meme-scraper-sources')">Only these Instagram accounts</label>
                        <OmniTumblrTagInput :input-id="fid('meme-scraper-sources')" v-model="draft.MemeScraper.Sources" prefix="@" placeholder="Any account (type to restrict)" label="Source accounts" :disabled="!canEdit" />
                        <div v-if="sourceSuggestions.length" class="help">
                            Accounts:
                            <button v-for="s in sourceSuggestions" :key="s.Username" type="button" class="linkish" :disabled="!canEdit" @click="addSource(s.Username)">@{{ s.Username }} ({{ s.Reels }})</button>
                        </div>
                    </div>
                </div>
                <div class="ot-formgrid">
                    <div class="ot-field">
                        <label :for="fid('meme-scraper-pick')">Pick</label>
                        <select :id="fid('meme-scraper-pick')" v-model="draft.MemeScraper.Pick" class="ot-select" :disabled="!canEdit">
                            <option value="Best">Best performing (views, likes, freshness)</option>
                            <option value="Newest">Newest first</option>
                            <option value="Random">Random</option>
                            <option value="Oldest">Oldest first</option>
                        </select>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('meme-scraper-max-age-days')">Max age (days)</label>
                        <input :id="fid('meme-scraper-max-age-days')" v-model.number="draft.MemeScraper.MaxAgeDays" type="number" min="0" class="ot-input" :disabled="!canEdit" />
                        <div class="help">0 = any age.</div>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('meme-scraper-min-views')">Min views at source</label>
                        <input :id="fid('meme-scraper-min-views')" v-model.number="draft.MemeScraper.MinViews" type="number" min="0" class="ot-input" :disabled="!canEdit" />
                    </div>
                    <div class="ot-field">
                        <label :for="fid('meme-scraper-max-duration-seconds')">Max length (seconds)</label>
                        <input :id="fid('meme-scraper-max-duration-seconds')" v-model.number="draft.MemeScraper.MaxDurationSeconds" type="number" min="0" max="3600" class="ot-input" :disabled="!canEdit" />
                        <div class="help">Tumblr allows 60 min of video a day.</div>
                    </div>
                </div>
                <label class="ot-check"><input v-model="draft.MemeScraper.AllowReuseAcrossBlogs" type="checkbox" :disabled="!canEdit" /> Let other managed blogs post the same reels</label>
            </template>

            <template v-else-if="draft.Source === 'Folder'">
                <div class="ot-formgrid wide">
                    <div class="ot-field">
                        <label :for="fid('folder-path')">Folder on the server</label>
                        <input :id="fid('folder-path')" v-model="draft.Folder.Path" class="ot-input mono" placeholder="D:\Content\memes" :disabled="!canEdit" />
                    </div>
                    <div class="ot-field">
                        <label :for="fid('folder-pick')">Pick</label>
                        <select :id="fid('folder-pick')" v-model="draft.Folder.Pick" class="ot-select" :disabled="!canEdit">
                            <option value="Random">Random</option>
                            <option value="Newest">Newest file first</option>
                            <option value="Oldest">Oldest file first</option>
                        </select>
                    </div>
                </div>
                <div class="checks">
                    <label class="ot-check"><input v-model="draft.Folder.Videos" type="checkbox" :disabled="!canEdit" /> Videos</label>
                    <label class="ot-check"><input v-model="draft.Folder.Images" type="checkbox" :disabled="!canEdit" /> Images</label>
                    <label class="ot-check"><input v-model="draft.Folder.IncludeSubfolders" type="checkbox" :disabled="!canEdit" /> Include subfolders</label>
                </div>
            </template>

            <template v-else-if="draft.Source === 'Library'">
                <OmniTumblrLibrary :blog-id="blogId" />
            </template>
        </OmniTraderCard>

        <!-- Captions -->
        <OmniTraderCard title="Captions" subtitle="How each post is captioned. AI captions are written when a post is planned, so you can review them.">
            <div class="ot-segment" role="group" aria-label="Caption style">
                <button v-for="opt in CAPTION_MODES" :key="opt.value" type="button" :aria-pressed="draft.CaptionMode === opt.value" :disabled="!canEdit" @click="draft.CaptionMode = opt.value">{{ opt.label }}</button>
            </div>
            <p class="lead">{{ CAPTION_MODES.find(m => m.value === draft.CaptionMode)?.help }}</p>

            <div v-if="draft.CaptionMode === 'AI'" class="ai">
                <div class="ot-formgrid wide">
                    <div class="ot-field">
                        <label :for="fid('ai-persona')">Voice / persona</label>
                        <textarea :id="fid('ai-persona')" v-model="draft.Ai.Persona" class="ot-input" rows="3" :disabled="!canEdit"></textarea>
                        <div class="help">Who is writing. E.g. “a sleep-deprived student who finds everything a bit too relatable”.</div>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('ai-instructions')">Extra instructions</label>
                        <textarea :id="fid('ai-instructions')" v-model="draft.Ai.Instructions" class="ot-input" rows="3" placeholder="e.g. lowercase only; reference the video's punchline; no puns" :disabled="!canEdit"></textarea>
                    </div>
                </div>
                <div class="ot-field">
                    <label :for="fid('examples-text')">Example captions in the right voice (one per line)</label>
                    <textarea :id="fid('examples-text')" v-model="examplesText" class="ot-input" rows="3" placeholder="me explaining to my dog why we can't go outside at 3am" :disabled="!canEdit"></textarea>
                    <div class="help">The model imitates their style; it never reuses them.</div>
                </div>
                <div class="ot-formgrid">
                    <div class="ot-field">
                        <label :for="fid('ai-max-length')">Max length (characters)</label>
                        <input :id="fid('ai-max-length')" v-model.number="draft.Ai.MaxLength" type="number" min="20" max="2000" class="ot-input" :disabled="!canEdit" />
                    </div>
                    <div class="ot-field">
                        <label :for="fid('ai-language')">Language</label>
                        <input :id="fid('ai-language')" v-model="draft.Ai.Language" class="ot-input" :disabled="!canEdit" />
                    </div>
                    <div class="ot-field">
                        <label :for="fid('ai-fallback')">If the AI fails</label>
                        <select :id="fid('ai-fallback')" v-model="draft.Ai.Fallback" class="ot-select" :disabled="!canEdit">
                            <option value="Empty">Post without a caption</option>
                            <option value="Fixed">Use the fixed caption</option>
                            <option value="Hold">Hold the post until it works</option>
                        </select>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('model-text')">Model override</label>
                        <input :id="fid('model-text')" v-model="modelText" class="ot-input mono" placeholder="(KliveLLM default)" :disabled="!canEdit" />
                    </div>
                </div>
                <div class="checks">
                    <label class="ot-check"><input v-model="draft.Ai.UseVision" type="checkbox" :disabled="!canEdit" /> Look at the video (frames to a vision model)</label>
                    <label class="ot-check"><input v-model="draft.Ai.UseSourceCaption" type="checkbox" :disabled="!canEdit" /> Use the original caption as context</label>
                    <label class="ot-check"><input v-model="draft.Ai.SuggestTags" type="checkbox" :disabled="!canEdit" /> Suggest tags (up to
                        <input v-model.number="draft.Ai.MaxSuggestedTags" type="number" min="0" max="15" class="ot-input tiny" aria-label="Max suggested tags" :disabled="!canEdit || !draft.Ai.SuggestTags" />)</label>
                    <label class="ot-check"><input v-model="draft.Ai.AllowEmoji" type="checkbox" :disabled="!canEdit" /> Allow emoji</label>
                </div>
            </div>

            <div v-if="draft.CaptionMode === 'Fixed' || (draft.CaptionMode === 'AI' && draft.Ai.Fallback === 'Fixed')" class="ot-field">
                <label :for="fid('fixed-caption')">Fixed caption</label>
                <textarea :id="fid('fixed-caption')" v-model="draft.FixedCaption" class="ot-input" rows="2" :disabled="!canEdit"></textarea>
            </div>
            <div v-if="draft.CaptionMode === 'Rotate'" class="ot-field">
                <label :for="fid('pool-text')">Caption pool (one per line, used in turn)</label>
                <textarea :id="fid('pool-text')" v-model="poolText" class="ot-input" rows="5" :disabled="!canEdit"></textarea>
            </div>

            <div v-if="draft.CaptionMode === 'AI' && canEdit" class="preview">
                <div class="previewbar">
                    <input v-model="previewDirection" class="ot-input" placeholder="Optional direction for this test" aria-label="Direction for the test caption" />
                    <button class="ot-btn" :disabled="previewing" @click="preview">{{ previewing ? 'Writing a test caption…' : '✨ Try it on the next video' }}</button>
                </div>
                <p v-if="previewError" class="neg small">{{ previewError }}</p>
                <div v-if="previewResult" class="previewcard">
                    <OmniTumblrThumb size="md" :kind="previewResult.Content.Kind" :path="contentThumbPath(blogId, previewResult.Content.Key)" />
                    <div class="previewtext">
                        <p class="cap">{{ previewResult.Caption }}</p>
                        <p class="tags">{{ previewResult.Tags.map(t => '#' + t).join(' ') }}</p>
                        <p class="muted small">
                            {{ previewResult.UsedVision ? `Looked at ${previewResult.FramesSent} frames` : 'Text only (no frames)' }}
                            · {{ previewResult.Model ?? 'default model' }}
                            <template v-if="previewResult.Content.Origin"> · source @{{ previewResult.Content.Origin }}</template>
                        </p>
                        <p v-if="previewResult.Content.OriginalCaption" class="muted small">Original: “{{ previewResult.Content.OriginalCaption }}”</p>
                    </div>
                </div>
                <p class="muted small">Tests use your unsaved settings and do not create a post.</p>
            </div>
        </OmniTraderCard>

        <!-- Tags -->
        <OmniTraderCard title="Tags" subtitle="Tags are how Tumblr users find posts. Fixed tags go on every post; rotating ones are sampled per post.">
            <div class="ot-formgrid wide">
                <div class="ot-field">
                    <label :for="fid('fixed-tags')">Always</label>
                    <OmniTumblrTagInput :input-id="fid('fixed-tags')" v-model="draft.FixedTags" :disabled="!canEdit" label="Fixed tags" />
                </div>
                <div class="ot-field">
                    <label :for="fid('rotating-tags')">Rotating pool</label>
                    <OmniTumblrTagInput :input-id="fid('rotating-tags')" v-model="draft.RotatingTags" :disabled="!canEdit" label="Rotating tags" />
                </div>
            </div>
            <div class="ot-formgrid">
                <div class="ot-field">
                    <label :for="fid('rotating-tags-per-post')">Rotating tags per post</label>
                    <input :id="fid('rotating-tags-per-post')" v-model.number="draft.RotatingTagsPerPost" type="number" min="0" max="30" class="ot-input" :disabled="!canEdit" />
                </div>
                <div class="ot-field">
                    <label :for="fid('max-tags')">Max tags per post</label>
                    <input :id="fid('max-tags')" v-model.number="draft.MaxTags" type="number" min="1" max="30" class="ot-input" :disabled="!canEdit" />
                    <div class="help">Including AI suggestions. Tumblr allows 30.</div>
                </div>
            </div>
        </OmniTraderCard>

        <!-- Publishing -->
        <OmniTraderCard title="Publishing" subtitle="How posts land on Tumblr.">
            <div class="ot-formgrid">
                <div class="ot-field">
                    <label :for="fid('post-state')">Post as</label>
                    <select :id="fid('post-state')" v-model="draft.PostState" class="ot-select" :disabled="!canEdit">
                        <option value="Published">Published</option>
                        <option value="Draft">Draft on Tumblr (review there)</option>
                        <option value="Private">Private</option>
                    </select>
                </div>
            </div>
            <div class="checks">
                <label class="ot-check"><input v-model="approval" type="checkbox" :disabled="!canEdit" /> Hold autopilot posts for my approval</label>
                <label class="ot-check"><input v-model="draft.CreditSource" type="checkbox" :disabled="!canEdit" /> Credit the original post as the Tumblr source</label>
            </div>
        </OmniTraderCard>

        <div v-if="canEdit" class="savebar">
            <button class="ot-btn primary" :disabled="saving || !dirty" @click="save">{{ saving ? 'Saving…' : 'Save strategy' }}</button>
            <button class="ot-btn ghost" :disabled="saving || !dirty" @click="discard">Discard changes</button>
            <span v-if="savedNotes.length" class="muted">{{ savedNotes.join(' ') }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from 'vue';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import {
    cloneDeep, contentThumbPath, notify, tumblrGet, tumblrPost, type CaptionMode, type CatalogOptions, type ContentPreview,
    type ContentSourceKind, type Strategy,
} from '~/composables/useOmniTumblr';

const props = defineProps<{ blogId: string; strategy: Strategy; requireApproval: boolean }>();
const emit = defineEmits<{ saved: [] }>();
const { isAdmin } = useCurrentProfile();
const canEdit = isAdmin;
const uid = useId();
const fid = (key: string) => `${uid}-${key}`;

const SOURCES: { value: ContentSourceKind; label: string; help: string }[] = [
    { value: 'MemeScraper', label: 'MemeScraper reels', help: 'Videos MemeScraper downloads from Instagram meme accounts, filtered by niche and account.' },
    { value: 'Library', label: 'Upload library', help: 'Files you upload for this blog. Good for a curated weekly series.' },
    { value: 'Folder', label: 'Server folder', help: 'Media files in a folder on the Omnipotent server.' },
    { value: 'None', label: 'Manual only', help: 'Autopilot plans nothing; only posts you compose go out.' },
];

const CAPTION_MODES: { value: CaptionMode; label: string; help: string }[] = [
    { value: 'AI', label: 'AI', help: 'A language model writes each caption in your blog\'s voice — after looking at the video, if the model can see.' },
    { value: 'Fixed', label: 'Fixed', help: 'The same caption on every post.' },
    { value: 'Rotate', label: 'Rotate', help: 'Cycles through a list of captions you write.' },
    { value: 'Original', label: 'Original', help: 'The source post\'s own caption, minus hashtags, mentions and “follow for more”.' },
    { value: 'None', label: 'None', help: 'No caption — the media speaks for itself.' },
];

const draft = ref<Strategy>(cloneDeep(props.strategy));
const approval = ref(props.requireApproval);
const saving = ref(false);
const saveError = ref<string | null>(null);
const savedNotes = ref<string[]>([]);
const catalog = ref<CatalogOptions | null>(null);

// Set after a save: the server's normalized copy (sorted slots, cleaned tags) replaces the draft
// even though it differs slightly from what was typed.
let adoptNextRefresh = false;

watch(() => [props.strategy, props.requireApproval] as const, ([strategy, requireApproval]) => {
    // A refresh from the server must not wipe an edit in progress.
    if (!dirty.value || adoptNextRefresh) {
        draft.value = cloneDeep(strategy);
        approval.value = requireApproval;
        adoptNextRefresh = false;
    }
});

const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(props.strategy) || approval.value !== props.requireApproval);

const examplesText = computed({
    get: () => draft.value.Ai.Examples.join('\n'),
    set: (v: string) => { draft.value.Ai.Examples = v.split('\n').map(s => s.trim()).filter(Boolean); },
});
const poolText = computed({
    get: () => draft.value.CaptionPool.join('\n'),
    set: (v: string) => { draft.value.CaptionPool = v.split('\n').map(s => s.trim()).filter(Boolean); },
});
const modelText = computed({
    get: () => draft.value.Ai.Model ?? '',
    set: (v: string) => { draft.value.Ai.Model = v.trim() || null; },
});

onMounted(async () => {
    const result = await tumblrGet<CatalogOptions>('/omnitumblr/memescraper/options');
    if (result.ok) catalog.value = result.data;
});

function hasNiche(name: string) {
    return draft.value.MemeScraper.Niches.some(n => n.toLowerCase() === name.toLowerCase());
}

function toggleNiche(name: string) {
    const niches = draft.value.MemeScraper.Niches;
    draft.value.MemeScraper.Niches = hasNiche(name) ? niches.filter(n => n.toLowerCase() !== name.toLowerCase()) : [...niches, name];
}

const sourceSuggestions = computed(() => {
    const chosen = new Set(draft.value.MemeScraper.Sources.map(s => s.toLowerCase()));
    const niches = draft.value.MemeScraper.Niches.map(n => n.toLowerCase());
    return (catalog.value?.Sources ?? [])
        .filter(s => !chosen.has(s.Username.toLowerCase()))
        .filter(s => !niches.length || s.Niches.some(n => niches.includes(n.toLowerCase())))
        .sort((a, b) => b.Reels - a.Reels)
        .slice(0, 8);
});

function addSource(username: string) {
    draft.value.MemeScraper.Sources = [...draft.value.MemeScraper.Sources, username];
}

function discard() {
    draft.value = cloneDeep(props.strategy);
    approval.value = props.requireApproval;
    saveError.value = null;
}

async function save() {
    saving.value = true;
    saveError.value = null;
    try {
        const result = await tumblrPost<{ Notes: string[] }>('/omnitumblr/blogs/update', {
            blogId: props.blogId,
            strategy: draft.value,
            requireApproval: approval.value,
        });
        if (!result.ok) {
            saveError.value = result.error;
            return;
        }
        savedNotes.value = result.data?.Notes ?? [];
        notify('Strategy saved', savedNotes.value.join(' '));
        adoptNextRefresh = true;
        emit('saved');
    } finally {
        saving.value = false;
    }
}

// ── caption preview ──
const previewing = ref(false);
const previewError = ref<string | null>(null);
const previewDirection = ref('');
const previewResult = ref<{ Caption: string; Tags: string[]; SuggestedTags: string[]; AltText: string | null; Model: string | null; UsedVision: boolean; FramesSent: number; Content: ContentPreview } | null>(null);

async function preview() {
    previewing.value = true;
    previewError.value = null;
    try {
        const result = await tumblrPost<NonNullable<typeof previewResult.value>>('/omnitumblr/captions/preview', {
            blogId: props.blogId,
            strategy: draft.value,
            instruction: previewDirection.value.trim() || null,
        });
        if (!result.ok || !result.data) previewError.value = result.error;
        else previewResult.value = result.data;
    } finally {
        previewing.value = false;
    }
}
</script>

<style scoped>
.tb-strategy { display: flex; flex-direction: column; gap: var(--ot-gutter); }
.lead { margin: var(--ot-space-2) 0 var(--ot-space-3); color: var(--ot-text-2); font-size: 12.5px; }
.ot-formgrid { margin-bottom: var(--ot-space-3); }
.ot-formgrid.wide { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.advanced { margin-top: var(--ot-space-3); }
.advanced summary { cursor: pointer; color: var(--ot-text-2); font-size: 12.5px; margin-bottom: var(--ot-space-3); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { border: 1px solid var(--ot-line-strong); background: transparent; border-radius: 999px; padding: 2px 10px; font-size: 12px; cursor: pointer; color: var(--ot-text-2); }
.chip small { color: var(--ot-muted); margin-left: 4px; }
.chip[aria-pressed='true'] { border-color: var(--ot-accent); background: var(--ot-accent-soft); color: var(--ot-accent); }
.checks { display: flex; flex-wrap: wrap; gap: var(--ot-space-2) var(--ot-space-4); }
.ai { display: flex; flex-direction: column; gap: var(--ot-space-3); }
.tiny { width: 52px !important; height: 24px; padding: 0 4px; }
.linkish { border: 0; background: none; padding: 0 4px; color: var(--ot-info); cursor: pointer; font-size: inherit; }
.preview { margin-top: var(--ot-space-4); display: flex; flex-direction: column; gap: var(--ot-space-2); border-top: 1px solid var(--ot-line); padding-top: var(--ot-space-3); }
.previewbar { display: flex; gap: var(--ot-space-2); }
.previewbar .ot-input { flex: 1 1 auto; }
.previewcard { display: flex; gap: var(--ot-space-3); padding: var(--ot-space-3); border-radius: var(--ot-radius); background: var(--ot-surface-2); border: 1px solid var(--ot-line); }
.previewtext { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.previewtext p { margin: 0; overflow-wrap: anywhere; }
.cap { font-size: 15px; line-height: 21px; }
.tags { color: var(--ot-info); font-size: 12.5px; }
.small { font-size: 11.5px; margin: 0; }
.savebar { display: flex; gap: var(--ot-space-2); align-items: center; position: sticky; bottom: 0; padding: var(--ot-space-3) 0; background: linear-gradient(transparent, var(--ot-bg) 35%); }
</style>
