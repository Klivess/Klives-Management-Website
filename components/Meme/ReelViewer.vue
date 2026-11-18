<template>
  <Teleport to="body">
    <div v-if="v.id" class="msx-layer" @keydown="onKey">
      <div class="msx-scrim" @click="c.closeReel()"></div>
      <div class="msx-viewer" role="dialog" aria-modal="true" :aria-label="r ? `Reel by @${r.Owner}` : 'Reel'" data-testid="msx-viewer">
        <div class="msx-viewer__frame">
          <div class="msx-viewer__media">
            <video v-if="v.video" :key="v.video" :src="v.video" controls autoplay loop playsinline data-testid="viewer-video"></video>
            <template v-else>
              <MemeThumb v-if="v.id" :post-id="v.id" />
              <div class="msx-viewer__state" data-testid="viewer-state">
                <span v-if="v.videoState === 'loading' || v.loading" style="display: inline-flex; gap: 8px; align-items: center; background: rgba(0,0,0,.55); padding: 6px 10px; border-radius: 8px"><MemeIcon name="refresh" class="msx-spin" />Loading the video…</span>
                <span v-else-if="v.videoState === 'missing'" style="background: rgba(0,0,0,.6); padding: 6px 10px; border-radius: 8px">The video file is no longer on disk.</span>
                <span v-else-if="v.videoState === 'error'" style="background: rgba(0,0,0,.6); padding: 6px 10px; border-radius: 8px">The video could not be loaded.</span>
              </div>
            </template>
            <div v-if="hasPrev" class="msx-viewer__nav msx-viewer__nav--prev"><button class="msx-iconbtn" type="button" aria-label="Previous reel" title="Previous (←)" @click="c.stepReel(-1)"><MemeIcon name="chevron-left" /></button></div>
            <div v-if="hasNext" class="msx-viewer__nav msx-viewer__nav--next"><button class="msx-iconbtn" type="button" aria-label="Next reel" title="Next (→)" @click="c.stepReel(1)"><MemeIcon name="chevron-right" /></button></div>
          </div>

          <div class="msx-viewer__side">
            <header class="msx-viewer__head">
              <template v-if="r">
                <span class="msx-avatar" :style="{ '--hue': msAvatarHue(r.Owner) }">{{ r.Owner.replace(/[^a-z0-9]/gi, '').slice(0, 1) || '?' }}</span>
                <div style="min-width: 0">
                  <button class="msx-who__name" type="button" style="font-size: 14px" :title="`Open @${r.Owner}`" @click="openOwner">@{{ r.Owner }}</button>
                  <div class="msx-dim" style="font-size: 11.5px">{{ position }}</div>
                </div>
              </template>
              <span v-else class="msx-dim">{{ v.error ?? 'Loading…' }}</span>
              <button ref="closeBtn" class="msx-iconbtn" type="button" style="margin-left: auto" aria-label="Close" title="Close (Esc)" @click="c.closeReel()"><MemeIcon name="x" /></button>
            </header>

            <div v-if="r && detail" class="msx-viewer__body">
              <div class="msx-viewer__stats">
                <div class="msx-viewer__stat"><b>{{ msCompact(r.Views) }}</b><span>views</span></div>
                <div class="msx-viewer__stat"><b>{{ msCompact(r.Likes) }}</b><span>likes</span></div>
                <div class="msx-viewer__stat"><b>{{ msCompact(r.Comments) }}</b><span>comments</span></div>
              </div>
              <p class="msx-note">
                #{{ detail.OwnerRank }} of {{ msInt(detail.OwnerReels) }} from @{{ r.Owner }} by views<template v-if="detail.OwnerMedianViews"> · their median {{ msCompact(detail.OwnerMedianViews) }}</template>
                <template v-if="r.EngagementPct != null"> · {{ msPct(r.EngagementPct, 2) }} engagement</template>
              </p>
              <p class="msx-viewer__caption">{{ r.Description || 'No caption.' }}</p>
              <dl class="msx-facts">
                <div><dt>Posted</dt><dd>{{ msStamp(r.PostedUtc) }}<small>{{ msAgo(r.PostedUtc, c.now.value, '') }}</small></dd></div>
                <div><dt>Saved</dt><dd>{{ msStamp(r.DownloadedUtc) }}<small>{{ r.AgeHours != null ? `${msHours(r.AgeHours)} after posting` : '' }}</small></dd></div>
                <div><dt>Found via</dt><dd>{{ msProviderLabel(r.Via) }}</dd></div>
                <div><dt>File</dt><dd>{{ r.Bytes ? msBytes(r.Bytes) : r.VideoExists === false ? 'missing' : '—' }}</dd></div>
              </dl>
              <div v-if="r.Niches.length" class="msx-niches"><span v-for="n in r.Niches" :key="n" class="msx-chip">{{ n }}</span></div>
              <div class="msx-sheet__actions">
                <button class="msx-btn msx-btn--sm msx-btn--light" type="button" :disabled="r.VideoExists === false" data-testid="viewer-download" @click="c.downloadReel(r)"><MemeIcon name="download" />Download</button>
                <a v-if="r.Url" class="msx-btn msx-btn--sm" :href="r.Url" target="_blank" rel="noopener noreferrer"><MemeIcon name="external" />Instagram</a>
                <button v-if="r.Url" class="msx-btn msx-btn--sm msx-btn--ghost" type="button" @click="copy(r.Url!)"><MemeIcon name="copy" />Copy link</button>
              </div>
              <p class="msx-note msx-mono" style="font-size: 11px">{{ r.ShortCode ?? '' }} · post {{ r.PostID }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useMemeConsole } from '~/composables/useMemeConsole';
import { msAgo, msAvatarHue, msBytes, msCompact, msHours, msInt, msPct, msProviderLabel, msStamp } from '~/scripts/memeConsole';

const c = useMemeConsole();
const v = c.viewer;
const detail = computed(() => v.detail);
const r = computed(() => v.detail?.Reel ?? null);
const closeBtn = ref<HTMLButtonElement | null>(null);

const at = computed(() => (v.id ? v.list.indexOf(v.id) : -1));
const hasPrev = computed(() => at.value > 0);
const hasNext = computed(() => at.value >= 0 && at.value < v.list.length - 1);
const position = computed(() => (at.value >= 0 && v.list.length > 1 ? `${at.value + 1} of ${v.list.length} · ← → to move` : ''));

function onKey(event: KeyboardEvent) {
  if ((event.target as HTMLElement)?.tagName === 'VIDEO' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) return;
  if (event.key === 'ArrowLeft') { event.preventDefault(); c.stepReel(-1); }
  else if (event.key === 'ArrowRight') { event.preventDefault(); c.stepReel(1); }
  else if (event.key === 'Escape') { event.stopPropagation(); c.closeReel(); }
}

function openOwner() {
  const owner = r.value?.Owner;
  if (!owner) return;
  c.closeReel();
  c.openSource(owner);
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); c.notify('ok', 'Link copied'); } catch { c.notify('warn', 'The browser would not copy that'); }
}

watch(() => v.id, async (id, old) => { if (id && !old) { await nextTick(); closeBtn.value?.focus(); } });
</script>
