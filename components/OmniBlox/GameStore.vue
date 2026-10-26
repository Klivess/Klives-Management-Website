<template>
    <div class="ot-grid two">
        <div class="col">
            <OmniTraderCard title="Store page" :empty="!game.Store.Title" empty-title="Not written yet"
                            empty-text="Launch writes the title, description and keywords from the brief's marketing angle.">
                <div class="bx-tags status">
                    <span class="ot-chip" :class="game.Store.Applied ? 'ok' : ''">{{ game.Store.Applied ? 'On Roblox' : 'Not on Roblox yet' }}</span>
                    <span class="ot-chip" :class="game.Store.ComplianceOk === true ? 'ok' : game.Store.ComplianceOk === false ? 'bad' : ''">
                        {{ game.Store.ComplianceOk === true ? 'Compliance passed' : game.Store.ComplianceOk === false ? 'Compliance failed' : 'Not checked' }}
                    </span>
                </div>
                <h3 class="store-title">{{ game.Store.Title }}</h3>
                <p class="desc">{{ game.Store.Description }}</p>
                <dl class="ot-kv">
                    <dt>Genre</dt><dd>{{ game.Store.Genre || '—' }}</dd>
                    <dt>Length</dt><dd>title {{ game.Store.Title.length }}/50 · description {{ game.Store.Description.length }}/1000</dd>
                </dl>
                <div v-if="game.Store.Keywords.length" class="bx-tags keywords">
                    <span v-for="k in game.Store.Keywords" :key="k" class="ot-chip">{{ k }}</span>
                </div>
                <template v-if="game.Store.ComplianceNotes.length">
                    <h3 class="ot-sectionhead bx-sub">Compliance notes</h3>
                    <ul class="bx-list"><li v-for="(n, i) in game.Store.ComplianceNotes" :key="i">{{ n }}</li></ul>
                </template>
            </OmniTraderCard>

            <OmniTraderCard title="Products" :subtitle="productsSubtitle" :empty="!game.Products.length" empty-title="No products yet" flush>
                <div class="ot-tablewrap">
                    <table class="bx-table">
                        <thead><tr><th>Product</th><th>Kind</th><th class="num">Price</th><th>Grants</th><th>On Roblox</th></tr></thead>
                        <tbody>
                            <tr v-for="p in game.Products" :key="p.Key">
                                <td><strong>{{ p.Name }}</strong><span class="sub">{{ p.Description }}</span></td>
                                <td>{{ p.Kind === 'GamePass' ? 'Game pass' : 'Developer product' }}</td>
                                <td class="num">{{ bloxRobux(p.PriceRobux) }}</td>
                                <td class="mono">{{ p.Grant }}</td>
                                <td class="mono">{{ p.RobloxId ?? 'not yet' }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </OmniTraderCard>
        </div>

        <div class="col">
            <OmniTraderCard title="Icon and thumbnails" subtitle="Made from the game's own world" :empty="!art.length && !hasTrailer" empty-title="No art yet">
                <div class="art">
                    <figure v-for="file in art" :key="file" :class="{ icon: file === 'icon.png' }">
                        <OmniBloxImg :path="bloxMediaPath(game.GameId, file, game.UpdatedUtc)" :ratio="file === 'icon.png' ? '1 / 1' : '16 / 9'" :alt="file" />
                        <figcaption>
                            {{ file === 'icon.png' ? 'Icon' : `Thumbnail ${file.replace(/\D/g, '')}` }}
                            <button class="ot-btn ghost sm" @click="download(file)">⤓</button>
                        </figcaption>
                    </figure>
                </div>
                <div v-if="hasTrailer" class="trailer">
                    <video v-if="trailerUrl" :src="trailerUrl" controls preload="metadata" aria-label="Trailer"></video>
                    <div v-else class="ot-skel" style="aspect-ratio:16/9"></div>
                </div>
            </OmniTraderCard>

            <OmniTraderCard title="Publishing">
                <dl class="ot-kv">
                    <dt>Experience</dt>
                    <dd>
                        <template v-if="game.Slot">
                            {{ game.Slot.UniverseId }} / place {{ game.Slot.PlaceId }}
                            <a v-if="game.Publish.IsPublic" :href="bloxRobloxGameUrl(game.Slot.PlaceId)" target="_blank" rel="noopener">open ↗</a>
                        </template>
                        <template v-else>not assigned yet</template>
                    </dd>
                    <dt>Visibility</dt><dd>{{ game.Publish.IsPublic ? `public since ${fmtWhen(game.Publish.WentPublicUtc)}` : 'private' }}</dd>
                    <dt>Published</dt><dd>{{ game.Publish.LastPublishedVersion ? `version ${game.Publish.LastPublishedVersion} (r${game.Publish.LastPublishedRevision}) · ${fmtRelative(game.Publish.LastPublishedUtc, now)}` : 'never' }}</dd>
                    <dt>Engine-tested</dt><dd>{{ game.Publish.EngineTestedRevision ? `r${game.Publish.EngineTestedRevision}` : 'not yet' }}</dd>
                    <template v-if="game.Publish.FirstPublishedUtc || game.Publish.IconUploadedUtc">
                        <dt>Icon</dt><dd>{{ game.Publish.IconUploadedUtc ? `uploaded ${fmtRelative(game.Publish.IconUploadedUtc, now)}` : 'not uploaded yet' }}</dd>
                    </template>
                    <template v-if="questionnaire">
                        <dt>Maturity rating</dt>
                        <dd :class="{ warn: !questionnaire.Published }">
                            <template v-if="questionnaire.Published">{{ questionnaire.AgeRating ?? 'rated' }}{{ questionnaire.MinimumAge ? ` (${questionnaire.MinimumAge}+)` : '' }} · answered {{ fmtRelative(questionnaire.Utc, now) }}</template>
                            <template v-else>not published: {{ questionnaire.StoppedReason }}</template>
                            <details v-if="questionnaire.Answers.length" class="answers">
                                <summary>{{ questionnaire.Answers.length }} answers</summary>
                                <ul><li v-for="(a, i) in questionnaire.Answers" :key="i">{{ a }}</li></ul>
                            </details>
                        </dd>
                    </template>
                    <template v-else-if="game.Publish.FirstPublishedUtc"><dt>Maturity rating</dt><dd>questionnaire not answered yet</dd></template>
                    <template v-if="game.Publish.LaunchRequestedUtc"><dt>Launch requested</dt><dd>{{ fmtWhen(game.Publish.LaunchRequestedUtc) }}</dd></template>
                    <template v-if="game.Publish.LaunchApprovedUtc"><dt>Approved</dt><dd>{{ fmtWhen(game.Publish.LaunchApprovedUtc) }}</dd></template>
                    <template v-if="game.Publish.LastLaunchStep"><dt>Last step</dt><dd>{{ game.Publish.LastLaunchStep }}</dd></template>
                    <template v-if="game.Publish.LastLaunchError"><dt>Last error</dt><dd class="bad">{{ game.Publish.LastLaunchError }}</dd></template>
                </dl>
            </OmniTraderCard>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { fmtRelative, fmtWhen, loadMediaUrl, notify, useNow } from '~/composables/useOmniTumblr';
import { bloxDownload, bloxMediaPath, bloxRobloxGameUrl, bloxRobux, type BloxDossier } from '~/composables/useOmniBlox';

const props = defineProps<{ game: BloxDossier; media: string[] }>();
const now = useNow();

const art = computed(() => props.media.filter(f => f.endsWith('.png')));
const questionnaire = computed(() => props.game.Publish.Questionnaire ?? null);
const hasTrailer = computed(() => props.media.includes('trailer.mp4'));
const productsSubtitle = computed(() => {
    const passes = props.game.Products.filter(p => p.Kind === 'GamePass').length;
    return `${passes} game pass${passes === 1 ? '' : 'es'} · ${props.game.Products.length - passes} developer product${props.game.Products.length - passes === 1 ? '' : 's'}`;
});

const trailerUrl = ref<string | null>(null);
async function loadTrailer() {
    trailerUrl.value = hasTrailer.value ? await loadMediaUrl(bloxMediaPath(props.game.GameId, 'trailer.mp4', props.game.UpdatedUtc)) : null;
}
onMounted(loadTrailer);
watch(hasTrailer, loadTrailer);

async function download(file: string) {
    const name = `${(props.game.Store.Title || props.game.GameId).replace(/[^\w.-]+/g, '-')}-${file}`;
    if (!await bloxDownload(bloxMediaPath(props.game.GameId, file, props.game.UpdatedUtc), name)) notify('Download failed', `${file} is not available.`, 'error');
}
</script>

<style scoped>
.col { display: flex; flex-direction: column; gap: var(--ot-gutter); min-width: 0; }
.status { margin-bottom: var(--ot-space-2); }
.store-title { margin: 0 0 6px; font-size: 16px; }
.desc { margin: 0 0 var(--ot-space-3); font-size: 12.5px; line-height: 18px; white-space: pre-wrap; color: var(--ot-text-2); }
.keywords { margin-top: var(--ot-space-3); }
.bx-sub { margin-top: var(--ot-space-4); }
.art { display: flex; flex-wrap: wrap; gap: var(--ot-space-3); align-items: flex-start; }
.art figure { margin: 0; display: flex; flex-direction: column; gap: 4px; flex: 1 1 240px; min-width: 0; }
.art figure.icon { flex: 0 0 150px; }
.art figcaption { display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; color: var(--ot-muted); }
.trailer { margin-top: var(--ot-space-3); }
.trailer video { width: 100%; border-radius: var(--ot-radius-sm); background: #000; }
.bx-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.bx-table th { text-align: left; font-weight: 600; color: var(--ot-muted); padding: 6px var(--ot-space-2); border-bottom: 1px solid var(--ot-line); font-size: 11px; }
.bx-table td { padding: 6px var(--ot-space-2); border-bottom: 1px solid var(--ot-line); vertical-align: top; }
.bx-table .num { text-align: right; font-family: var(--ot-mono); white-space: nowrap; }
.bx-table .mono { font-family: var(--ot-mono); }
.bx-table .sub { display: block; font-size: 11px; color: var(--ot-muted); }
.bad { color: var(--ot-negative); }
.warn { color: var(--ot-warning); }
.answers { margin-top: 4px; color: var(--ot-text-2); }
.answers summary { cursor: pointer; font-size: 11.5px; color: var(--ot-muted); }
.answers ul { margin: 4px 0 0; padding-left: 16px; font-size: 11.5px; line-height: 16px; }
a { color: var(--ot-info); text-decoration: none; margin-left: 6px; }
</style>
