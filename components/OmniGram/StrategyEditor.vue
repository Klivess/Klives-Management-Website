<template>
    <div class="ig-strategy">
        <div v-if="dirty || saveError" class="ot-banner" :class="saveError ? '' : 'info'" role="status">
            <span class="glyph" aria-hidden="true">{{ saveError ? '⚠' : '✎' }}</span>
            <div>
                <strong>{{ saveError ? 'Not saved' : 'Unsaved changes' }}</strong>
                {{ saveError ?? 'Save to apply them. Posts already planned keep their content; new slots use the new settings.' }}
            </div>
            <div v-if="canEdit" class="actions">
                <button class="ot-btn ghost sm" :disabled="saving" @click="discard">Discard</button>
                <button class="ot-btn primary sm" :disabled="saving || !dirty" @click="save">{{ saving ? 'Saving…' : 'Save strategy' }}</button>
            </div>
        </div>
        <div v-else-if="validation.length" class="ot-banner warn" role="status">
            <span class="glyph" aria-hidden="true">!</span>
            <div><strong>This strategy cannot run yet.</strong> {{ validation.join(' ') }}</div>
        </div>

        <!-- Schedule -->
        <OmniTraderCard title="When to post" subtitle="Weekly time slots. Autopilot fills each one ahead of time: content picked, media made Instagram-ready, caption written.">
            <OmniTumblrScheduleEditor v-model:slots="draft.Slots" v-model:timeZone="draft.TimeZone" :disabled="!canEdit" />
            <details class="advanced">
                <summary>Timing rules</summary>
                <div class="ot-formgrid">
                    <div class="ot-field">
                        <label :for="fid('plan-ahead')">Prepare ahead (days)</label>
                        <input :id="fid('plan-ahead')" v-model.number="draft.PlanAheadDays" type="number" min="1" max="30" class="ot-input" :disabled="!canEdit" />
                        <div class="help">How far ahead posts are planned, so you can review them.</div>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('jitter')">Natural jitter (± min)</label>
                        <input :id="fid('jitter')" v-model.number="draft.JitterMinutes" type="number" min="0" max="120" class="ot-input" :disabled="!canEdit" />
                        <div class="help">Posts go out a few minutes either side of the slot, not on the dot.</div>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('max-day')">Max posts per day</label>
                        <input :id="fid('max-day')" v-model.number="draft.MaxPostsPerDay" type="number" min="1" max="50" class="ot-input" :disabled="!canEdit" />
                        <div class="help">Instagram's own 24-hour API limit is also checked before every post.</div>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('min-gap')">Min gap between posts (min)</label>
                        <input :id="fid('min-gap')" v-model.number="draft.MinGapMinutes" type="number" min="0" max="1440" class="ot-input" :disabled="!canEdit" />
                    </div>
                    <div class="ot-field">
                        <label :for="fid('missed')">If a slot is missed</label>
                        <select :id="fid('missed')" v-model="draft.MissedSlots" class="ot-select" :disabled="!canEdit">
                            <option value="PublishLate">Publish late (within grace)</option>
                            <option value="Skip">Skip it</option>
                        </select>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('grace')">Grace period (hours)</label>
                        <input :id="fid('grace')" v-model.number="draft.MissedSlotGraceHours" type="number" min="0" max="72" class="ot-input" :disabled="!canEdit || draft.MissedSlots === 'Skip'" />
                        <div class="help">After an outage, older slots are skipped instead of flooding the account.</div>
                    </div>
                </div>
            </details>
        </OmniTraderCard>

        <!-- Content -->
        <OmniTraderCard title="What to post" subtitle="Where autopilot finds content. Each item is used once per account.">
            <div class="ot-segment wrap" role="group" aria-label="Content source">
                <button v-for="opt in SOURCES" :key="opt.value" type="button" :aria-pressed="draft.Source === opt.value" :disabled="!canEdit" @click="draft.Source = opt.value">{{ opt.label }}</button>
            </div>
            <p class="lead">{{ SOURCES.find(s => s.value === draft.Source)?.help }}</p>

            <template v-if="draft.Source === 'MemeScraper'">
                <div v-if="catalog && !catalog.Ready" class="ot-banner warn"><span class="glyph">⏳</span><div><strong>MemeScraper is still loading</strong> Its niches and accounts appear here once it is ready.</div></div>
                <p v-else-if="catalog" class="muted small">{{ fmtCount(catalog.DownloadedReels) }} downloaded reels from {{ catalog.Sources.length }} accounts.</p>
                <div class="ot-formgrid wide">
                    <div class="ot-field">
                        <label :id="fid('niches')">Niches</label>
                        <div class="chips" role="group" :aria-labelledby="fid('niches')">
                            <button v-for="n in catalog?.Niches ?? []" :key="n.Name" type="button" class="chip" :aria-pressed="hasNiche(n.Name)" :disabled="!canEdit" @click="toggleNiche(n.Name)">
                                {{ n.Name }} <small>{{ n.Reels }}</small>
                            </button>
                            <span v-if="catalog && catalog.Ready && !catalog.Niches.length" class="muted">No niches defined in MemeScraper.</span>
                        </div>
                        <div class="help">None selected = every niche.</div>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('ms-sources')">Only these Instagram accounts</label>
                        <OmniTumblrTagInput :input-id="fid('ms-sources')" v-model="draft.MemeScraper.Sources" prefix="@" placeholder="Any account (type to restrict)" label="Source accounts" :disabled="!canEdit" />
                        <div v-if="sourceSuggestions.length" class="help">
                            Accounts:
                            <button v-for="s in sourceSuggestions" :key="s.Username" type="button" class="linkish" :disabled="!canEdit" @click="addSource(s.Username)">@{{ s.Username }} ({{ s.Reels }})</button>
                        </div>
                    </div>
                </div>
                <div class="ot-formgrid">
                    <div class="ot-field">
                        <label :for="fid('ms-pick')">Pick</label>
                        <select :id="fid('ms-pick')" v-model="draft.MemeScraper.Pick" class="ot-select" :disabled="!canEdit">
                            <option value="Best">Best performing (views, likes, freshness)</option>
                            <option value="Newest">Newest first</option>
                            <option value="Random">Random</option>
                            <option value="Oldest">Oldest first</option>
                        </select>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('ms-age')">Max age (days)</label>
                        <input :id="fid('ms-age')" v-model.number="draft.MemeScraper.MaxAgeDays" type="number" min="0" class="ot-input" :disabled="!canEdit" />
                        <div class="help">0 = any age.</div>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('ms-views')">Min views at source</label>
                        <input :id="fid('ms-views')" v-model.number="draft.MemeScraper.MinViews" type="number" min="0" class="ot-input" :disabled="!canEdit" />
                    </div>
                    <div class="ot-field">
                        <label :for="fid('ms-length')">Max length (seconds)</label>
                        <input :id="fid('ms-length')" v-model.number="draft.MemeScraper.MaxDurationSeconds" type="number" min="0" max="900" class="ot-input" :disabled="!canEdit" />
                        <div class="help">Reels run 3 s to 15 min; stories are trimmed to 60 s.</div>
                    </div>
                </div>
                <label class="ot-check"><input v-model="draft.MemeScraper.AllowReuseAcrossAccounts" type="checkbox" :disabled="!canEdit" /> Let other managed accounts post the same reels</label>
            </template>

            <template v-else-if="draft.Source === 'Folder'">
                <div class="ot-formgrid wide">
                    <div class="ot-field">
                        <label :for="fid('folder')">Folder on the server</label>
                        <input :id="fid('folder')" v-model="draft.Folder.Path" class="ot-input mono" placeholder="D:\Content\memes" :disabled="!canEdit" />
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
                <OmniGramLibrary :account-id="accountId" />
            </template>

            <details v-if="draft.Source !== 'None'" class="advanced" open>
                <summary>Formats</summary>
                <div class="ot-formgrid">
                    <div class="ot-field">
                        <label :for="fid('video-format')">Videos become</label>
                        <select :id="fid('video-format')" v-model="draft.VideoFormat" class="ot-select" :disabled="!canEdit">
                            <option value="Reel">Reels</option>
                            <option value="Story">Stories (24 h)</option>
                        </select>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('image-format')">Images become</label>
                        <select :id="fid('image-format')" v-model="draft.ImageFormat" class="ot-select" :disabled="!canEdit">
                            <option value="Photo">Photo posts</option>
                            <option value="Story">Stories (24 h)</option>
                        </select>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('fit')">Images outside 4:5 – 1.91:1</label>
                        <select :id="fid('fit')" v-model="draft.ImageFit" class="ot-select" :disabled="!canEdit">
                            <option value="BlurPad">Pad with a blurred background</option>
                            <option value="Pad">Pad with black bars</option>
                            <option value="Crop">Crop to fit</option>
                        </select>
                        <div class="help">Instagram rejects feed photos outside these proportions.</div>
                    </div>
                </div>
                <div v-if="draft.VideoFormat === 'Reel'" class="reels">
                    <div class="checks">
                        <label class="ot-check"><input v-model="draft.Reels.ShareToFeed" type="checkbox" :disabled="!canEdit || draft.Reels.Trial !== 'Off'" /> Show reels in the profile grid</label>
                        <label class="ot-check"><input v-model="draft.Reels.AlsoPostStory" type="checkbox" :disabled="!canEdit" /> Also share each reel to the story</label>
                    </div>
                    <div class="ot-formgrid">
                        <div class="ot-field">
                            <label :for="fid('trial')">Trial reels</label>
                            <select :id="fid('trial')" v-model="draft.Reels.Trial" class="ot-select" :disabled="!canEdit">
                                <option value="Off">Off (followers see them)</option>
                                <option value="Manual">Trial, I share winners by hand</option>
                                <option value="Auto">Trial, Instagram shares winners</option>
                            </select>
                            <div class="help">Trial reels are shown to non-followers first.</div>
                        </div>
                        <div class="ot-field">
                            <label :for="fid('cover')">Cover frame (seconds in)</label>
                            <input :id="fid('cover')" v-model="coverText" type="number" min="0" step="0.5" class="ot-input" placeholder="first frame" :disabled="!canEdit" />
                        </div>
                        <div class="ot-field">
                            <label :for="fid('collabs')">Collaborators (up to 3)</label>
                            <OmniTumblrTagInput :input-id="fid('collabs')" v-model="draft.Reels.Collaborators" prefix="@" :max="3" placeholder="username" label="Collaborators" :disabled="!canEdit" />
                            <div class="help">They are invited and must accept in the app.</div>
                        </div>
                    </div>
                </div>
            </details>
        </OmniTraderCard>

        <!-- Captions -->
        <OmniTraderCard title="Captions" subtitle="How each post is captioned. AI captions are written when a post is planned, so you can review them first.">
            <div class="ot-segment wrap" role="group" aria-label="Caption style">
                <button v-for="opt in CAPTION_MODES" :key="opt.value" type="button" :aria-pressed="draft.CaptionMode === opt.value" :disabled="!canEdit" @click="draft.CaptionMode = opt.value">{{ opt.label }}</button>
            </div>
            <p class="lead">{{ CAPTION_MODES.find(m => m.value === draft.CaptionMode)?.help }}</p>

            <div v-if="draft.CaptionMode === 'AI'" class="ai">
                <div class="ot-formgrid wide">
                    <div class="ot-field">
                        <label :for="fid('persona')">Voice / persona</label>
                        <textarea :id="fid('persona')" v-model="draft.Ai.Persona" class="ot-input" rows="3" :disabled="!canEdit"></textarea>
                        <div class="help">Who is writing, e.g. “a deadpan meme page that never explains the joke”.</div>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('instructions')">Extra instructions</label>
                        <textarea :id="fid('instructions')" v-model="draft.Ai.Instructions" class="ot-input" rows="3" placeholder="e.g. lowercase only; end with a question to get comments" :disabled="!canEdit"></textarea>
                    </div>
                </div>
                <div class="ot-field">
                    <label :for="fid('examples')">Example captions in the right voice (one per line)</label>
                    <textarea :id="fid('examples')" v-model="examplesText" class="ot-input" rows="3" placeholder="when the group chat goes silent after you send a meme" :disabled="!canEdit"></textarea>
                    <div class="help">The model imitates their style; it never reuses them.</div>
                </div>
                <div class="ot-formgrid">
                    <div class="ot-field">
                        <label :for="fid('max-length')">Max length (characters)</label>
                        <input :id="fid('max-length')" v-model.number="draft.Ai.MaxLength" type="number" min="20" max="2200" class="ot-input" :disabled="!canEdit" />
                        <div class="help">Hashtags, credit and footer come on top.</div>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('language')">Language</label>
                        <input :id="fid('language')" v-model="draft.Ai.Language" class="ot-input" :disabled="!canEdit" />
                    </div>
                    <div class="ot-field">
                        <label :for="fid('fallback')">If the AI fails</label>
                        <select :id="fid('fallback')" v-model="draft.Ai.Fallback" class="ot-select" :disabled="!canEdit">
                            <option value="Empty">Post without a caption</option>
                            <option value="Fixed">Use the fixed caption</option>
                            <option value="Hold">Hold the post until it works</option>
                        </select>
                    </div>
                    <div class="ot-field">
                        <label :for="fid('model')">Model override</label>
                        <input :id="fid('model')" v-model="modelText" class="ot-input mono" placeholder="(KliveLLM default)" :disabled="!canEdit" />
                    </div>
                </div>
                <div class="checks">
                    <label class="ot-check"><input v-model="draft.Ai.UseVision" type="checkbox" :disabled="!canEdit" /> Look at the media (frames to a vision model)</label>
                    <label class="ot-check"><input v-model="draft.Ai.UseSourceCaption" type="checkbox" :disabled="!canEdit" /> Use the original caption as context</label>
                    <label class="ot-check"><input v-model="draft.Ai.SuggestHashtags" type="checkbox" :disabled="!canEdit" /> Suggest hashtags (up to
                        <input v-model.number="draft.Ai.MaxSuggestedHashtags" type="number" min="0" max="15" class="ot-input tiny" aria-label="Max suggested hashtags" :disabled="!canEdit || !draft.Ai.SuggestHashtags" />)</label>
                    <label class="ot-check"><input v-model="draft.Ai.AllowEmoji" type="checkbox" :disabled="!canEdit" /> Allow emoji</label>
                </div>
            </div>

            <div v-if="draft.CaptionMode === 'Fixed' || (draft.CaptionMode === 'AI' && draft.Ai.Fallback === 'Fixed')" class="ot-field">
                <label :for="fid('fixed')">Fixed caption</label>
                <textarea :id="fid('fixed')" v-model="draft.FixedCaption" class="ot-input" rows="2" maxlength="2200" :disabled="!canEdit"></textarea>
            </div>
            <div v-if="draft.CaptionMode === 'Rotate'" class="ot-field">
                <label :for="fid('pool')">Caption pool (one per line, used in turn)</label>
                <textarea :id="fid('pool')" v-model="poolText" class="ot-input" rows="5" :disabled="!canEdit"></textarea>
            </div>

            <div class="ot-formgrid wide extras">
                <div class="ot-field">
                    <label :for="fid('credit')">Credit line for reposted content</label>
                    <input :id="fid('credit')" v-model="draft.CreditTemplate" class="ot-input" maxlength="200" placeholder="e.g. 🎥 @{origin}" :disabled="!canEdit" />
                    <div class="help">{origin} becomes the source account. Added to MemeScraper reels only. Empty = no credit.</div>
                </div>
                <div class="ot-field">
                    <label :for="fid('footer')">Footer on every caption</label>
                    <input :id="fid('footer')" v-model="draft.CaptionFooter" class="ot-input" maxlength="300" placeholder="e.g. follow for daily memes" :disabled="!canEdit" />
                </div>
            </div>

            <div v-if="draft.CaptionMode === 'AI' && canEdit" class="preview">
                <div class="previewbar">
                    <input v-model="previewDirection" class="ot-input" placeholder="Optional direction for this test" aria-label="Direction for the test caption" />
                    <button class="ot-btn" :disabled="previewing" @click="preview">{{ previewing ? 'Writing a test caption…' : '✨ Try it on the next item' }}</button>
                </div>
                <p v-if="previewError" class="neg small">{{ previewError }}</p>
                <div v-if="previewResult" class="previewcard">
                    <OmniTumblrThumb size="md" :kind="previewResult.Content.Kind" :path="contentThumbPath(accountId, previewResult.Content.Key)" />
                    <div class="previewtext">
                        <p class="cap">{{ previewResult.ComposedCaption || previewResult.Caption }}</p>
                        <p v-if="previewResult.FirstComment" class="muted small">First comment: {{ previewResult.FirstComment }}</p>
                        <p class="muted small">
                            {{ previewResult.UsedVision ? `Looked at ${previewResult.FramesSent} frame(s)` : 'Text only (no frames)' }}
                            · {{ previewResult.Model ?? 'default model' }}
                            <template v-if="previewResult.Content.Origin"> · source @{{ previewResult.Content.Origin }}</template>
                        </p>
                        <p v-if="previewResult.AltText" class="muted small">Alt text: {{ previewResult.AltText }}</p>
                        <p v-if="previewResult.Content.OriginalCaption" class="muted small">Original: “{{ previewResult.Content.OriginalCaption }}”</p>
                    </div>
                </div>
                <p class="muted small">Tests use your unsaved settings and do not create a post.</p>
            </div>
        </OmniTraderCard>

        <!-- Hashtags -->
        <OmniTraderCard title="Hashtags" subtitle="A handful of specific hashtags beats 30 generic ones. Fixed ones go on every post; rotating ones are sampled per post.">
            <div class="ot-formgrid wide">
                <div class="ot-field">
                    <label :for="fid('fixed-tags')">Always</label>
                    <OmniTumblrTagInput :input-id="fid('fixed-tags')" v-model="draft.FixedHashtags" :max="30" :disabled="!canEdit" label="Fixed hashtags" placeholder="Add a hashtag…" />
                </div>
                <div class="ot-field">
                    <label :for="fid('rotating-tags')">Rotating pool</label>
                    <OmniTumblrTagInput :input-id="fid('rotating-tags')" v-model="draft.RotatingHashtags" :disabled="!canEdit" label="Rotating hashtags" placeholder="Add a hashtag…" />
                </div>
            </div>
            <div class="ot-formgrid">
                <div class="ot-field">
                    <label :for="fid('rot-per-post')">Rotating per post</label>
                    <input :id="fid('rot-per-post')" v-model.number="draft.RotatingHashtagsPerPost" type="number" min="0" max="30" class="ot-input" :disabled="!canEdit" />
                </div>
                <div class="ot-field">
                    <label :for="fid('max-tags')">Max per post</label>
                    <input :id="fid('max-tags')" v-model.number="draft.MaxHashtags" type="number" min="0" max="30" class="ot-input" :disabled="!canEdit" />
                    <div class="help">Including AI suggestions. Instagram allows 30.</div>
                </div>
                <div class="ot-field">
                    <label :for="fid('placement')">Put them</label>
                    <select :id="fid('placement')" v-model="draft.HashtagPlacement" class="ot-select" :disabled="!canEdit">
                        <option value="Caption">At the end of the caption</option>
                        <option value="FirstComment">In the first comment</option>
                        <option value="None">Nowhere</option>
                    </select>
                </div>
            </div>
        </OmniTraderCard>

        <!-- Publishing -->
        <OmniTraderCard title="Publishing">
            <div class="checks column">
                <label class="ot-check"><input v-model="approval" type="checkbox" :disabled="!canEdit" /> Hold autopilot posts for my approval</label>
                <label class="ot-check"><input v-model="draft.LabelAsAiGenerated" type="checkbox" :disabled="!canEdit" /> Add Instagram's “AI info” label (for media made with AI, not for AI-written captions)</label>
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
import { useAccess } from '~/composables/useAccess';
import {
    cloneDeep, contentThumbPath, fmtCount, igGet, igPost, notify, type CaptionMode, type CaptionPreview, type CatalogOptions, type ContentSourceKind, type Strategy,
} from '~/composables/useOmniGram';

const props = withDefaults(defineProps<{ accountId: string; strategy: Strategy; requireApproval: boolean; validation?: string[] }>(), { validation: () => [] });
const emit = defineEmits<{ saved: [] }>();
const { can } = useAccess();
const canEdit = computed(() => can('omnigram.accounts.manage'));
const uid = useId();
const fid = (key: string) => `${uid}-${key}`;

const SOURCES: { value: ContentSourceKind; label: string; help: string }[] = [
    { value: 'MemeScraper', label: 'MemeScraper reels', help: 'Videos MemeScraper downloads from Instagram meme accounts, filtered by niche and account. The source is credited if you set a credit line.' },
    { value: 'Library', label: 'Upload library', help: 'Files you upload for this account. Good for a curated weekly series.' },
    { value: 'Folder', label: 'Server folder', help: 'Media files in a folder on the Omnipotent server.' },
    { value: 'None', label: 'Manual only', help: 'Autopilot plans nothing; only posts you compose go out.' },
];

const CAPTION_MODES: { value: CaptionMode; label: string; help: string }[] = [
    { value: 'AI', label: 'AI', help: 'A language model writes each caption in the account\'s voice, after looking at the media if the model can see.' },
    { value: 'Fixed', label: 'Fixed', help: 'The same caption on every post.' },
    { value: 'Rotate', label: 'Rotate', help: 'Cycles through a list of captions you write.' },
    { value: 'Original', label: 'Original', help: 'The source post\'s own caption, minus hashtags, mentions and “follow for more”.' },
    { value: 'None', label: 'None', help: 'No caption text (hashtags, credit and footer still apply).' },
];

const draft = ref<Strategy>(cloneDeep(props.strategy));
const approval = ref(props.requireApproval);
const saving = ref(false);
const saveError = ref<string | null>(null);
const savedNotes = ref<string[]>([]);
const catalog = ref<CatalogOptions | null>(null);

// Set after a save: the server's normalized copy (sorted slots, cleaned hashtags) replaces the draft
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
const coverText = computed({
    get: () => (draft.value.Reels.CoverFrameSeconds == null ? '' : String(draft.value.Reels.CoverFrameSeconds)),
    set: (v: string | number) => {
        const n = Number(v);
        draft.value.Reels.CoverFrameSeconds = String(v).trim() === '' || !Number.isFinite(n) || n < 0 ? null : n;
    },
});

onMounted(async () => {
    const result = await igGet<CatalogOptions>('/omnigram/memescraper/options');
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
        const result = await igPost<{ updated: boolean; Notes: string[] }>('/omnigram/accounts/update', {
            accountId: props.accountId,
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
const previewResult = ref<CaptionPreview | null>(null);

async function preview() {
    previewing.value = true;
    previewError.value = null;
    try {
        const result = await igPost<CaptionPreview>('/omnigram/captions/preview', {
            accountId: props.accountId,
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
.ig-strategy { display: flex; flex-direction: column; gap: var(--ot-gutter); min-width: 0; }
.lead { margin: var(--ot-space-2) 0 var(--ot-space-3); color: var(--ot-text-2); font-size: 12.5px; }
.ot-formgrid { margin-bottom: var(--ot-space-3); }
.ot-formgrid.wide { grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); }
.ot-segment.wrap { flex-wrap: wrap; max-width: 100%; }
.advanced { margin-top: var(--ot-space-3); }
.advanced summary { cursor: pointer; color: var(--ot-text-2); font-size: 12.5px; margin-bottom: var(--ot-space-3); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { border: 1px solid var(--ot-line-strong); background: transparent; border-radius: 999px; padding: 2px 10px; font-size: 12px; cursor: pointer; color: var(--ot-text-2); }
.chip small { color: var(--ot-muted); margin-left: 4px; }
.chip[aria-pressed='true'] { border-color: var(--ot-accent); background: var(--ot-accent-soft); color: var(--ot-accent); }
.checks { display: flex; flex-wrap: wrap; gap: var(--ot-space-2) var(--ot-space-4); }
.checks.column { flex-direction: column; }
.reels { display: flex; flex-direction: column; gap: var(--ot-space-3); }
.ai { display: flex; flex-direction: column; gap: var(--ot-space-3); }
.extras { margin-top: var(--ot-space-3); }
.tiny { width: 52px !important; height: 24px; padding: 0 4px; }
.linkish { border: 0; background: none; padding: 0 4px; color: var(--ot-info); cursor: pointer; font-size: inherit; }
.preview { margin-top: var(--ot-space-4); display: flex; flex-direction: column; gap: var(--ot-space-2); border-top: 1px solid var(--ot-line); padding-top: var(--ot-space-3); }
.previewbar { display: flex; flex-wrap: wrap; gap: var(--ot-space-2); }
.previewbar .ot-input { flex: 1 1 200px; min-width: 0; }
.previewcard { display: flex; gap: var(--ot-space-3); padding: var(--ot-space-3); border-radius: var(--ot-radius); background: var(--ot-surface-2); border: 1px solid var(--ot-line); min-width: 0; }
.previewtext { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.previewtext p { margin: 0; overflow-wrap: anywhere; }
.cap { font-size: 14px; line-height: 20px; white-space: pre-wrap; }
.small { font-size: 11.5px; margin: 0; }
.savebar { display: flex; flex-wrap: wrap; gap: var(--ot-space-2); align-items: center; position: sticky; bottom: 0; padding: var(--ot-space-3) 0; background: linear-gradient(transparent, var(--ot-bg) 35%); }
@media (max-width: 560px) {
    .previewcard { flex-direction: column; }
}
</style>
