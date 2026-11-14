<template>
  <div class="obx-split obx-split--even">
    <div class="obx-stack">
      <section class="obx-card" aria-label="Store page">
        <header class="obx-card__head">
          <h2 class="obx-card__title"><ObxIcon name="store" />Store page</h2>
          <span class="obx-chip" :data-tone="game.Store.Applied ? 'ok' : 'neutral'">{{ game.Store.Applied ? 'On Roblox' : 'Not on Roblox yet' }}</span>
          <span class="obx-chip" :data-tone="game.Store.ComplianceOk === true ? 'ok' : game.Store.ComplianceOk === false ? 'crit' : 'neutral'">{{ game.Store.ComplianceOk === true ? 'Compliance passed' : game.Store.ComplianceOk === false ? 'Compliance failed' : 'Not checked' }}</span>
        </header>
        <div class="obx-card__body">
          <div v-if="!game.Store.Title" class="obx-empty">Launch writes the title, description and keywords from the brief's marketing angle.</div>
          <template v-else>
            <h3 style="font-size: 16px; margin-bottom: 6px">{{ game.Store.Title }}</h3>
            <p class="obx-ink2 obx-prose" style="margin-bottom: 10px">{{ game.Store.Description }}</p>
            <dl class="obx-kv">
              <dt>Genre</dt><dd>{{ game.Store.Genre || '—' }}</dd>
              <dt>Length</dt><dd :style="{ color: game.Store.Title.length > 50 || game.Store.Description.length > 1000 ? 'var(--obx-crit)' : undefined }">title {{ game.Store.Title.length }}/50 · description {{ game.Store.Description.length }}/1000</dd>
            </dl>
            <div v-if="game.Store.Keywords.length" class="obx-tile__chips" style="margin-top: 10px"><span v-for="k in game.Store.Keywords" :key="k" class="obx-chip">{{ k }}</span></div>
            <template v-if="game.Store.ComplianceNotes.length">
              <h3 class="obx-sub">Compliance notes</h3>
              <ul class="obx-list"><li v-for="(n, i) in game.Store.ComplianceNotes" :key="i">{{ n }}</li></ul>
            </template>
          </template>
        </div>
      </section>

      <section class="obx-card" aria-label="Products">
        <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="coins" />Products</h2><span class="obx-card__meta">{{ productsMeta }}</span></header>
        <div class="obx-card__body obx-card__body--flush obx-tablewrap">
          <div v-if="!game.Products.length" class="obx-empty">No products yet.</div>
          <table v-else class="obx-table">
            <thead><tr><th>Product</th><th>Kind</th><th class="num">Price</th><th>Grants</th><th>Roblox id</th></tr></thead>
            <tbody>
              <tr v-for="p in game.Products" :key="p.Key">
                <td><b>{{ p.Name }}</b><span class="obx-dim" style="display: block; font-size: 11px">{{ p.Description }}</span></td>
                <td>{{ p.Kind === 'GamePass' ? 'Game pass' : 'Product' }}</td>
                <td class="num">{{ obxRobux(p.PriceRobux) }}</td>
                <td class="obx-mono">{{ p.Grant }}</td>
                <td class="obx-mono obx-dim">{{ p.RobloxId ?? 'not yet' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div class="obx-stack">
      <section class="obx-card" aria-label="Icon and thumbnails">
        <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="sparkle" />Icon and thumbnails</h2><span class="obx-card__meta">made from the game's own world</span></header>
        <div class="obx-card__body">
          <div v-if="!art.length && !hasTrailer" class="obx-empty">No art yet.</div>
          <div v-else style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px">
            <figure v-for="file in art" :key="file" class="obx-stack" style="gap: 4px">
              <ObxImg :path="bloxMediaPath(game.GameId, file, game.UpdatedUtc)" :ratio="file === 'icon.png' ? '1 / 1' : '16 / 9'" :alt="file" />
              <figcaption class="obx-account__row" style="justify-content: space-between; font-size: 11.5px; color: var(--obx-ink-3)">
                {{ file === 'icon.png' ? 'Icon' : `Thumbnail ${file.replace(/\D/g, '')}` }}
                <button class="obx-iconbtn obx-iconbtn--sm" :aria-label="`Download ${file}`" @click="download(file)"><ObxIcon name="download" /></button>
              </figcaption>
            </figure>
          </div>
          <div v-if="hasTrailer" style="margin-top: 10px">
            <video v-if="trailerUrl" :src="trailerUrl" controls preload="metadata" aria-label="Trailer" style="width: 100%; border-radius: 10px; background: #000"></video>
            <div v-else class="obx-skel" style="aspect-ratio: 16 / 9"></div>
          </div>
        </div>
      </section>

      <section class="obx-card" aria-label="Publishing">
        <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="upload" />Publishing</h2></header>
        <div class="obx-card__body">
          <dl class="obx-kv">
            <dt>Experience</dt>
            <dd>
              <template v-if="game.Slot">{{ game.Slot.UniverseId }} / place {{ game.Slot.PlaceId }} <a v-if="game.Publish.IsPublic" class="obx-link" :href="bloxRobloxGameUrl(game.Slot.PlaceId)" target="_blank" rel="noopener">open ↗</a></template>
              <template v-else>not assigned yet</template>
            </dd>
            <dt>Visibility</dt><dd>{{ game.Publish.IsPublic ? `public since ${obxDate(game.Publish.WentPublicUtc)}` : 'private' }}</dd>
            <dt>Published</dt><dd>{{ game.Publish.LastPublishedVersion ? `version ${game.Publish.LastPublishedVersion} (r${game.Publish.LastPublishedRevision}) · ${obxAgo(game.Publish.LastPublishedUtc, now)}` : 'never' }}</dd>
            <dt>Engine-tested</dt><dd>{{ game.Publish.EngineTestedRevision ? `r${game.Publish.EngineTestedRevision}` : 'not yet' }}</dd>
            <template v-if="game.Publish.FirstPublishedUtc || game.Publish.IconUploadedUtc">
              <dt>Icon</dt><dd>{{ game.Publish.IconUploadedUtc ? `uploaded ${obxAgo(game.Publish.IconUploadedUtc, now)}` : 'not uploaded yet' }}</dd>
              <template v-if="thumbnails.made">
                <dt>Thumbnails</dt>
                <dd :style="{ color: thumbnails.up < thumbnails.made ? 'var(--obx-warn)' : undefined }">
                  <template v-if="!thumbnails.up">not on the store page yet ({{ thumbnails.made }} made)</template>
                  <template v-else>{{ thumbnails.up < thumbnails.made ? `${thumbnails.up} of ${thumbnails.made}` : thumbnails.up }} on the store page{{ thumbnails.lastUtc ? ` · ${obxAgo(thumbnails.lastUtc, now)}` : '' }}</template>
                </dd>
              </template>
            </template>
            <template v-if="questionnaire">
              <dt>Maturity</dt>
              <dd :style="{ color: !questionnaire.Published ? 'var(--obx-warn)' : undefined }">
                <template v-if="questionnaire.Published">{{ questionnaire.AgeRating ?? 'rated' }}{{ questionnaire.MinimumAge ? ` (${questionnaire.MinimumAge}+)` : '' }} · answered {{ obxAgo(questionnaire.Utc, now) }}{{ questionnaire.ByOwner ? ' by you' : '' }}</template>
                <template v-else>not published: {{ questionnaire.StoppedReason }}</template>
                <details v-if="questionnaire.Answers.length" style="margin-top: 4px; color: var(--obx-ink-2)">
                  <summary class="obx-dim" style="font-size: 11.5px">{{ questionnaire.Answers.length }} answers</summary>
                  <ul class="obx-list" style="margin-top: 4px; font-size: 11.5px"><li v-for="(a, i) in questionnaire.Answers" :key="i">{{ a }}</li></ul>
                </details>
              </dd>
            </template>
            <template v-else-if="game.Publish.FirstPublishedUtc"><dt>Maturity</dt><dd>questionnaire not answered yet</dd></template>
            <template v-if="game.Publish.LaunchRequestedUtc"><dt>Requested</dt><dd>{{ obxDateTime(game.Publish.LaunchRequestedUtc) }}</dd></template>
            <template v-if="game.Publish.LaunchApprovedUtc"><dt>Approved</dt><dd>{{ obxDateTime(game.Publish.LaunchApprovedUtc) }}</dd></template>
            <template v-if="game.Publish.LastLaunchStep"><dt>Last step</dt><dd>{{ game.Publish.LastLaunchStep }}</dd></template>
            <template v-if="game.Publish.LastLaunchError"><dt>Last error</dt><dd style="color: #ffc6cc">{{ game.Publish.LastLaunchError }}</dd></template>
          </dl>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { loadMediaUrl } from '~/composables/useOmniTumblr';
import { bloxDownload, bloxMediaPath, bloxRobloxGameUrl, type BloxDossier } from '~/composables/useOmniBlox';
import { obxToast } from '~/composables/useObxConsole';
import { obxAgo, obxDate, obxDateTime, obxRobux } from '~/scripts/omniblox/console';

const props = defineProps<{ game: BloxDossier; media: string[]; now: number }>();

const art = computed(() => props.media.filter(f => f.endsWith('.png')));
const questionnaire = computed(() => props.game.Publish.Questionnaire ?? null);
const hasTrailer = computed(() => props.media.includes('trailer.mp4'));
/** How many of the game's thumbnails are on its store page (Publish.StoreThumbnails; older launches only counted them). */
const thumbnails = computed(() => {
  const files = props.game.Store.ThumbnailFiles;
  const records = props.game.Publish.StoreThumbnails ?? [];
  const up = records.length ? files.filter(f => records.some(r => r.File === f)).length : Math.min(files.length, props.game.Publish.StoreThumbnailsUploaded ?? 0);
  return { made: files.length, up, lastUtc: records.length ? records[records.length - 1]!.UploadedUtc : null };
});
const productsMeta = computed(() => {
  const passes = props.game.Products.filter(p => p.Kind === 'GamePass').length;
  const products = props.game.Products.length - passes;
  return `${passes} game pass${passes === 1 ? '' : 'es'} · ${products} developer product${products === 1 ? '' : 's'}`;
});

const trailerUrl = ref<string | null>(null);
async function loadTrailer() {
  trailerUrl.value = hasTrailer.value ? await loadMediaUrl(bloxMediaPath(props.game.GameId, 'trailer.mp4', props.game.UpdatedUtc)) : null;
}
onMounted(loadTrailer);
watch(hasTrailer, loadTrailer);

async function download(file: string) {
  const name = `${(props.game.Store.Title || props.game.GameId).replace(/[^\w.-]+/g, '-')}-${file}`;
  if (!await bloxDownload(bloxMediaPath(props.game.GameId, file, props.game.UpdatedUtc), name)) obxToast('Download failed', `${file} is not available.`, 'crit');
}
</script>
