<template>
  <Teleport to="body">
    <div v-if="open" class="tmb-layer">
      <div class="tmb-scrim" style="place-items: stretch; padding: 0; background: rgba(3, 4, 8, 0.4)" @pointerdown.self="close"></div>
      <aside class="tmb-sheet tmb-sheet--wide" role="dialog" aria-modal="true" aria-label="Compose a post" data-testid="tmb-compose">
        <header class="tmb-sheet__head">
          <span class="tmb-dialog__glyph" data-tone="accent"><TumblrIcon name="edit" /></span>
          <div style="flex: 1">
            <h2 class="tmb-sheet__title">Compose a post</h2>
            <p class="tmb-sheet__sub">Now or later, on one blog or several. Autopilot keeps running alongside.</p>
          </div>
          <button class="tmb-iconbtn" aria-label="Close" @click="close"><TumblrIcon name="x" /></button>
        </header>

        <div class="tmb-sheet__body">
          <div v-if="created.length" class="tmb-note" data-tone="ok">
            <TumblrIcon name="check-circle" />
            <div style="flex: 1">
              <strong>Created {{ created.length }} post{{ created.length === 1 ? '' : 's' }}.</strong>
              <ul style="margin-top: 4px">
                <li v-for="c in created" :key="c.PostId">@{{ c.BlogName }} · {{ c.CaptionPending ? 'the caption is being written' : 'ready' }} · {{ fmtWhen(c.ScheduledUtc) }}</li>
              </ul>
            </div>
            <button class="tmb-btn tmb-btn--sm" @click="reset">Compose another</button>
          </div>

          <section class="tmb-field">
            <span class="tmb-label">Blogs</span>
            <div class="tmb-chips">
              <button v-for="b in blogs" :key="b.BlogId" class="tmb-scope__opt" :aria-pressed="selected.includes(b.BlogId)" :data-testid="`compose-blog-${b.Name}`" @click="toggleBlog(b.BlogId)">
                <TumblrAvatar :src="b.AvatarUrl" :name="b.Name" :size="20" />@{{ b.Name }}
              </button>
              <button v-if="blogs.length > 1" class="tmb-btn tmb-btn--xs tmb-btn--ghost" @click="selected = selected.length === blogs.length ? [] : blogs.map(b => b.BlogId)">{{ selected.length === blogs.length ? 'None' : 'All' }}</button>
            </div>
          </section>

          <section style="display: grid; gap: 10px">
            <div class="tmb-seg" role="group" aria-label="Post type">
              <button v-for="k in KINDS" :key="k.id" class="tmb-seg__opt" :aria-pressed="kind === k.id" @click="setKind(k.id)"><TumblrIcon :name="k.icon" />{{ k.id }}</button>
            </div>
            <div v-if="kind === 'Video' || kind === 'Photo'" class="tmb-drop" :data-over="dragging || undefined" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="onDrop">
              Drop {{ kind === 'Video' ? 'a video (.mp4, .mov)' : 'images (up to 30)' }} here, or <button type="button" class="tmb-link-btn" @click="picker?.click()">choose {{ kind === 'Video' ? 'a file' : 'files' }}</button>.
              <input ref="picker" type="file" hidden :multiple="kind === 'Photo'" :accept="kind === 'Video' ? 'video/mp4,video/quicktime,.m4v' : 'image/jpeg,image/png,image/gif,image/webp'" data-testid="tmb-compose-file" @change="onPick" />
            </div>
            <div v-if="files.length" style="display: grid; gap: 8px">
              <div v-for="f in files" :key="f.id" style="display: flex; gap: 10px; align-items: center">
                <video v-if="f.kind === 'Video'" :src="f.preview" muted playsinline preload="metadata" style="width: 64px; height: 64px; object-fit: cover; border-radius: 9px; background: #000"></video>
                <img v-else :src="f.preview" alt="" style="width: 64px; height: 64px; object-fit: cover; border-radius: 9px" />
                <div style="flex: 1; min-width: 0; font-size: 12.5px">
                  <div class="tmb-truncate">{{ f.name }}</div>
                  <div class="tmb-dim">{{ fmtBytes(f.size) }} · <span v-if="f.error" class="tmb-neg">{{ f.error }}</span><span v-else-if="f.mediaId" class="tmb-pos">uploaded</span><span v-else>{{ f.percent }}%</span></div>
                  <div v-if="!f.mediaId && !f.error" class="tmb-meter" style="margin-top: 4px"><span :style="{ width: `${f.percent}%` }"></span></div>
                </div>
                <button class="tmb-iconbtn tmb-iconbtn--sm" aria-label="Remove" @click="removeFile(f.id)"><TumblrIcon name="x" /></button>
              </div>
            </div>
            <div v-if="kind === 'Text' || kind === 'Link'" class="tmb-field"><label for="tmb-c-title">{{ kind === 'Link' ? 'Link title (optional)' : 'Title' }}</label><input id="tmb-c-title" v-model="title" class="tmb-input" /></div>
            <div v-if="kind === 'Link'" class="tmb-field"><label for="tmb-c-url">URL</label><input id="tmb-c-url" v-model="linkUrl" class="tmb-input tmb-mono" placeholder="https://…" /></div>
          </section>

          <section style="display: grid; gap: 10px">
            <div class="tmb-seg" role="group" aria-label="Caption">
              <button class="tmb-seg__opt" :aria-pressed="captionMode === 'manual'" @click="captionMode = 'manual'">Write it</button>
              <button class="tmb-seg__opt" :aria-pressed="captionMode === 'ai'" :disabled="kind === 'Link'" @click="captionMode = 'ai'"><TumblrIcon name="sparkles" />AI writes it</button>
              <button class="tmb-seg__opt" :aria-pressed="captionMode === 'none'" :disabled="kind === 'Text'" @click="captionMode = 'none'">No caption</button>
            </div>
            <div v-if="captionMode === 'manual'" class="tmb-field">
              <label for="tmb-c-cap">{{ kind === 'Text' ? 'Text' : 'Caption' }}</label>
              <textarea id="tmb-c-cap" v-model="caption" rows="4" class="tmb-textarea" data-testid="tmb-compose-caption"></textarea>
              <span class="tmb-help">{{ caption.length }} characters</span>
            </div>
            <div v-else-if="captionMode === 'ai'" class="tmb-field">
              <label for="tmb-c-ai">Direction for the AI (optional)</label>
              <input id="tmb-c-ai" v-model="aiInstruction" class="tmb-input" placeholder="make it about Monday mornings" />
              <span class="tmb-help">Each blog's own voice is used; the caption can be edited in the queue before it posts.</span>
            </div>
            <div class="tmb-field">
              <label for="tmb-c-tags">Tags</label>
              <TumblrTagBox v-model="tags" input-id="tmb-c-tags" />
              <label class="tmb-check"><input v-model="includeBlogTags" type="checkbox" />Also add each blog's fixed tags</label>
            </div>
          </section>

          <section style="display: grid; gap: 10px">
            <div class="tmb-seg" role="group" aria-label="When">
              <button class="tmb-seg__opt" :aria-pressed="when === 'now'" @click="when = 'now'"><TumblrIcon name="send" />Now</button>
              <button class="tmb-seg__opt" :aria-pressed="when === 'later'" @click="when = 'later'"><TumblrIcon name="clock" />Schedule</button>
            </div>
            <div v-if="when === 'later'" class="tmb-field" style="max-width: 280px"><label for="tmb-c-at">Date and time (your time)</label><input id="tmb-c-at" v-model="scheduledLocal" type="datetime-local" class="tmb-input" :min="minLocal" /></div>
            <details>
              <summary class="tmb-dim" style="cursor: pointer; font-size: 12.5px">More</summary>
              <div class="tmb-grid2" style="margin-top: 8px">
                <div class="tmb-field"><label for="tmb-c-state">Post as</label>
                  <select id="tmb-c-state" v-model="tumblrState" class="tmb-select"><option value="">The blog's default</option><option value="Published">Published</option><option value="Draft">Draft on Tumblr</option><option value="Private">Private</option></select></div>
                <div class="tmb-field"><label for="tmb-c-src">Source URL (credit)</label><input id="tmb-c-src" v-model="sourceUrl" class="tmb-input tmb-mono" placeholder="https://…" /></div>
              </div>
            </details>
          </section>
          <p v-if="error" class="tmb-error"><TumblrIcon name="alert" />{{ error }}</p>
        </div>

        <footer class="tmb-sheet__foot" style="align-items: center">
          <span class="tmb-dim" style="font-size: 12px; flex: 1">{{ readiness }}</span>
          <button class="tmb-btn tmb-btn--ghost" @click="close">Close</button>
          <button class="tmb-btn tmb-btn--primary" :disabled="!canSubmit || submitting" data-testid="tmb-compose-submit" @click="submit">
            <TumblrIcon :name="when === 'now' ? 'send' : 'clock'" />{{ submitting ? 'Creating…' : when === 'now' ? `Publish to ${selected.length || ''} blog${selected.length === 1 ? '' : 's'}` : 'Schedule' }}
          </button>
        </footer>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { fmtBytes, fmtWhen, fromLocalInput, toLocalInput, tumblrPost, uploadMedia, type BlogSummary, type PostKind, type PostSummary } from '~/composables/useOmniTumblr';

interface PendingFile { id: number; name: string; size: number; kind: 'Video' | 'Photo'; preview: string; percent: number; mediaId: string | null; error: string | null; abort?: () => void }

const props = defineProps<{ open: boolean; blogs: BlogSummary[]; preselect: string | null; canPost: boolean }>();
const emit = defineEmits<{ close: []; created: [count: number] }>();

const KINDS: { id: PostKind; icon: string }[] = [{ id: 'Video', icon: 'video' }, { id: 'Photo', icon: 'image' }, { id: 'Text', icon: 'text' }, { id: 'Link', icon: 'link' }];
const selected = ref<string[]>([]);
const kind = ref<PostKind>('Video');
const files = ref<PendingFile[]>([]);
const dragging = ref(false);
const picker = ref<HTMLInputElement | null>(null);
const title = ref('');
const linkUrl = ref('');
const captionMode = ref<'manual' | 'ai' | 'none'>('manual');
const caption = ref('');
const aiInstruction = ref('');
const tags = ref<string[]>([]);
const includeBlogTags = ref(true);
const when = ref<'now' | 'later'>('now');
const scheduledLocal = ref(toLocalInput(new Date(Date.now() + 3_600_000).toISOString()));
const tumblrState = ref('');
const sourceUrl = ref('');
const submitting = ref(false);
const error = ref<string | null>(null);
const created = ref<PostSummary[]>([]);
const minLocal = toLocalInput(new Date().toISOString());
let nextId = 0;

// Opened from a link, the sheet can open before the blog list has loaded: pick the blog once it is there.
let preselected: string | null = null;
watch(() => [props.open, props.preselect, props.blogs.length] as const, ([open, preselect]) => {
  if (!open) { preselected = null; return; }
  if (preselect && preselect !== preselected && props.blogs.some(b => b.BlogId === preselect)) {
    selected.value = [preselect];
    preselected = preselect;
  } else if (!selected.value.length && props.blogs.length === 1) selected.value = [props.blogs[0].BlogId];
}, { immediate: true });

/** Esc closes it wherever focus is. */
function onWindowKey(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  event.preventDefault();
  close();
}
watch(() => props.open, open => {
  if (open) window.addEventListener('keydown', onWindowKey);
  else window.removeEventListener('keydown', onWindowKey);
}, { immediate: true });

onBeforeUnmount(() => { clearFiles(); window.removeEventListener('keydown', onWindowKey); });

function toggleBlog(id: string) {
  selected.value = selected.value.includes(id) ? selected.value.filter(x => x !== id) : [...selected.value, id];
}

function clearFiles() {
  files.value.forEach(f => { f.abort?.(); URL.revokeObjectURL(f.preview); });
  files.value = [];
}

function setKind(k: PostKind) {
  if (k === kind.value) return;
  kind.value = k;
  clearFiles();
  if (k === 'Link' && captionMode.value === 'ai') captionMode.value = 'manual';
  if (k === 'Text' && captionMode.value === 'none') captionMode.value = 'manual';
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files) addFiles(Array.from(input.files));
  input.value = '';
}
function onDrop(event: DragEvent) {
  dragging.value = false;
  if (event.dataTransfer?.files) addFiles(Array.from(event.dataTransfer.files));
}
function addFiles(list: File[]) {
  const wantVideo = kind.value === 'Video';
  for (const file of list) {
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|m4v)$/i.test(file.name);
    if (wantVideo ? !isVideo : !file.type.startsWith('image/')) { error.value = `${file.name} is not ${wantVideo ? 'a video' : 'an image'}.`; continue; }
    if (wantVideo) clearFiles();
    if (!wantVideo && files.value.length >= 30) break;
    files.value.push({ id: ++nextId, name: file.name, size: file.size, kind: wantVideo ? 'Video' : 'Photo', preview: URL.createObjectURL(file), percent: 0, mediaId: null, error: null });
    const tracked = files.value[files.value.length - 1];
    const upload = uploadMedia(file, 'compose', null, pct => { tracked.percent = pct; });
    tracked.abort = upload.abort;
    upload.promise.then(result => { tracked.mediaId = result.MediaId; }).catch(e => { tracked.error = e?.message ?? 'Upload failed'; });
    error.value = null;
  }
}
function removeFile(id: number) {
  const f = files.value.find(x => x.id === id);
  f?.abort?.();
  if (f) URL.revokeObjectURL(f.preview);
  files.value = files.value.filter(x => x.id !== id);
}

const uploading = computed(() => files.value.some(f => !f.mediaId && !f.error));
const contentReady = computed(() => {
  if (kind.value === 'Video') return files.value.length === 1 && !!files.value[0].mediaId;
  if (kind.value === 'Photo') return files.value.length > 0 && files.value.every(f => !!f.mediaId);
  if (kind.value === 'Link') return /^https?:\/\/\S+/i.test(linkUrl.value.trim());
  return !!(title.value.trim() || caption.value.trim() || captionMode.value === 'ai');
});
const canSubmit = computed(() => props.canPost && selected.value.length > 0 && contentReady.value && !uploading.value && (when.value === 'now' || !!scheduledLocal.value));
const readiness = computed(() => {
  if (!props.canPost) return 'Posting needs “Work on posts”.';
  if (!selected.value.length) return 'Pick at least one blog.';
  if (uploading.value) return 'Uploading…';
  if (!contentReady.value) return kind.value === 'Video' ? 'Add a video.' : kind.value === 'Photo' ? 'Add images.' : kind.value === 'Link' ? 'Add a URL.' : 'Write a title or some text.';
  return when.value === 'now' ? 'Goes out within seconds.' : scheduledLocal.value ? `Scheduled for ${new Date(scheduledLocal.value).toLocaleString()}.` : 'Pick a time.';
});

async function submit() {
  submitting.value = true;
  error.value = null;
  try {
    const result = await tumblrPost<{ Created: PostSummary[] }>('/omnitumblr/posts/create', {
      blogIds: selected.value, kind: kind.value, captionMode: captionMode.value,
      caption: captionMode.value === 'manual' ? caption.value : null,
      aiInstruction: captionMode.value === 'ai' ? (aiInstruction.value.trim() || null) : null,
      title: title.value.trim() || null, linkUrl: kind.value === 'Link' ? linkUrl.value.trim() : null,
      tags: tags.value, includeBlogTags: includeBlogTags.value,
      mediaIds: files.value.map(f => f.mediaId).filter(Boolean),
      scheduledUtc: when.value === 'later' ? fromLocalInput(scheduledLocal.value) : null,
      tumblrState: tumblrState.value || null, sourceUrl: sourceUrl.value.trim() || null,
    });
    if (!result.ok || !result.data) { error.value = result.error; return; }
    created.value = result.data.Created;
    emit('created', created.value.length);
  } finally {
    submitting.value = false;
  }
}

function reset() {
  clearFiles();
  caption.value = '';
  aiInstruction.value = '';
  title.value = '';
  linkUrl.value = '';
  sourceUrl.value = '';
  created.value = [];
  error.value = null;
}

function close() {
  if (created.value.length) reset();
  emit('close');
}
</script>
