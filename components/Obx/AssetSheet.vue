<template>
  <ObxSheet :open="assetId !== null" :title="detail?.Asset.Name ?? 'Model'" :sub="subtitle" wide testid="obx-asset-sheet" @close="emit('close')">
    <div v-if="!detail && !error" class="obx-stack"><div class="obx-skel" style="height: 300px"></div><div class="obx-skel" style="width: 70%"></div></div>
    <div v-else-if="error && !detail" class="obx-banner" data-tone="crit"><ObxIcon class="obx-banner__glyph" name="octagon" /><span class="obx-banner__text"><strong>Could not load the model</strong><span>{{ error }}</span></span></div>

    <template v-else-if="detail">
      <div v-if="views.length > 1" class="obx-seg" role="group" aria-label="View" style="align-self: flex-start">
        <button v-for="v in views" :key="v" class="obx-seg__opt" :aria-pressed="view === v" @click="view = v">{{ VIEW_LABEL[v] ?? v }}</button>
      </div>
      <div class="obx-frame" style="max-width: 440px; width: 100%; align-self: center">
        <ObxImg :path="bloxAssetImagePath(detail.Asset.AssetId, view)" ratio="1 / 1" contain eager :alt="`${detail.Asset.Name}, ${view}`" />
      </div>

      <section v-if="label">
        <h3 class="obx-sub" style="margin-top: 0">What the labeller saw</h3>
        <p style="font-weight: 600; font-size: 14px">{{ label.What }}</p>
        <p class="obx-ink2" style="margin: 4px 0 10px">{{ label.Description }}</p>
        <dl class="obx-kv">
          <dt>Category</dt><dd>{{ label.Category }}{{ label.Subcategory ? ` / ${label.Subcategory}` : '' }}</dd>
          <dt>Style</dt><dd>{{ label.Style || '—' }}</dd>
          <dt>Quality</dt><dd><span class="obx-quality" :data-tone="qualityTone(label.Quality)">{{ label.Quality }}</span>/10</dd>
          <dt>Front</dt><dd>{{ label.FrontYaw ? `turned ${label.FrontYaw}° from −Z` : 'faces −Z' }}</dd>
          <dt>Walkable</dt><dd>{{ label.Walkable ? 'yes' : 'no' }}</dd>
          <template v-if="label.Themes.length"><dt>Themes</dt><dd><span class="obx-tile__chips"><span v-for="t in label.Themes" :key="t" class="obx-chip">{{ t }}</span></span></dd></template>
          <template v-if="label.GoodFor.length"><dt>Good for</dt><dd>{{ label.GoodFor.join(' · ') }}</dd></template>
          <template v-if="label.PairsWith.length"><dt>Pairs with</dt><dd>{{ label.PairsWith.join(' · ') }}</dd></template>
          <template v-if="label.Issues.length"><dt>Issues</dt><dd style="color: var(--obx-warn)">{{ label.Issues.join(' · ') }}</dd></template>
          <template v-if="label.Model"><dt>Labelled by</dt><dd class="obx-dim">{{ label.Model }}</dd></template>
        </dl>
      </section>
      <section v-else>
        <h3 class="obx-sub" style="margin-top: 0">Status</h3>
        <p class="obx-ink2">{{ STATUS_TEXT[detail.Asset.Status] ?? detail.Asset.Status }}<template v-if="detail.Asset.StatusReason">: {{ detail.Asset.StatusReason }}</template></p>
      </section>

      <section v-if="detail.Measurements">
        <h3 class="obx-sub" style="margin-top: 0">Measured</h3>
        <dl class="obx-kv">
          <dt>Size</dt><dd>{{ bloxSize([detail.Measurements.SizeX, detail.Measurements.SizeY, detail.Measurements.SizeZ]) }} studs (W×H×D) · {{ detail.Asset.Proportions }}</dd>
          <dt>Parts</dt><dd>{{ detail.Measurements.PartCount }} parts · {{ detail.Measurements.MeshPartCount }} meshes · {{ obxCount(detail.Asset.Triangles) }} triangles · {{ detail.Asset.PerformanceCost }} cost</dd>
          <template v-if="extras"><dt>Also</dt><dd>{{ extras }}</dd></template>
          <template v-if="detail.Asset.Materials?.length"><dt>Materials</dt><dd>{{ detail.Asset.Materials.map(m => `${m.Material} ${obxPct(m.Share)}`).join(' · ') }}</dd></template>
        </dl>
        <div v-if="detail.Asset.Colors?.length" class="obx-tile__chips" style="margin-top: 8px; gap: 8px">
          <span v-for="c in detail.Asset.Colors" :key="c.Hex" class="obx-account__row" style="gap: 5px; font-size: 12px" :title="`${c.Name} ${c.Hex}`">
            <span :style="{ background: c.Hex, width: '14px', height: '14px', borderRadius: '4px', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)' }"></span>{{ c.Name }} <span class="obx-faint obx-mono">{{ obxPct(c.Share) }}</span>
          </span>
        </div>
      </section>

      <section v-if="detail.Asset.ScriptsRemoved || detail.Asset.ScriptFlags.length">
        <h3 class="obx-sub" style="margin-top: 0">Cleaned</h3>
        <p class="obx-ink2">{{ detail.Asset.ScriptsRemoved }} script{{ detail.Asset.ScriptsRemoved === 1 ? '' : 's' }} removed before the model can be placed.</p>
        <ul v-if="detail.Asset.ScriptFlags.length" class="obx-list" style="color: var(--obx-warn); margin-top: 4px"><li v-for="f in detail.Asset.ScriptFlags" :key="f">{{ f }}</li></ul>
      </section>

      <section v-if="detail.UsageNotes.length">
        <h3 class="obx-sub" style="margin-top: 0">Builders' notes</h3>
        <ul class="obx-list"><li v-for="(n, i) in detail.UsageNotes" :key="i">{{ n }}</li></ul>
      </section>

      <section>
        <h3 class="obx-sub" style="margin-top: 0">Source</h3>
        <dl class="obx-kv">
          <dt>Asset</dt><dd class="obx-mono">#{{ detail.Asset.AssetId }} <a class="obx-link" :href="bloxCreatorStoreUrl(detail.Asset.AssetId)" target="_blank" rel="noopener">Creator Store ↗</a></dd>
          <dt>Creator</dt><dd>{{ detail.Asset.CreatorName || '—' }}{{ detail.Asset.CreatorVerified ? ' ✓ verified' : '' }}</dd>
          <dt>Votes</dt><dd>{{ obxCount(detail.Asset.UpVotes) }} up · {{ detail.Asset.UpVotePercent }}%</dd>
          <dt>Found by</dt><dd>“{{ detail.Asset.DiscoveredQuery }}” · {{ obxDate(detail.Asset.DiscoveredUtc) }}</dd>
          <template v-if="detail.Asset.LabeledUtc"><dt>Labelled</dt><dd>{{ obxDate(detail.Asset.LabeledUtc) }}</dd></template>
          <dt>Used</dt><dd>{{ detail.Asset.TimesUsed ? `in ${detail.Asset.TimesUsed} game${detail.Asset.TimesUsed === 1 ? '' : 's'}` : 'not yet' }}</dd>
        </dl>
      </section>
    </template>
  </ObxSheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { bloxAssetImagePath, bloxCreatorStoreUrl, bloxGet, bloxSize, type BloxAssetDetail } from '~/composables/useOmniBlox';
import { obxCount, obxDate, obxPct, type ObxTone } from '~/scripts/omniblox/console';

const props = defineProps<{ assetId: number | null }>();
const emit = defineEmits<{ close: [] }>();

const VIEW_LABEL: Record<string, string> = { thumb: 'Roblox', iso: '3/4', front: 'Front', right: 'Right', top: 'Top' };
const STATUS_TEXT: Record<string, string> = {
  discovered: 'Found in the Creator Store, not looked at yet',
  previewed: 'Thumbnail saved; waiting to be downloaded and measured',
  analyzed: 'Downloaded, cleaned and measured; waiting for the vision labeller',
  rejected: 'Rejected',
  failed: 'Failed',
};

const detail = ref<BloxAssetDetail | null>(null);
const error = ref<string | null>(null);
const view = ref('thumb');

watch(() => props.assetId, async id => {
  detail.value = null;
  error.value = null;
  view.value = 'thumb';
  if (id === null) return;
  const result = await bloxGet<BloxAssetDetail>(`/omniblox/asset?id=${id}`);
  if (id !== props.assetId) return;
  if (result.ok && result.data) {
    detail.value = result.data;
    if (!result.data.Asset.HasThumbnail && result.data.Asset.Renders.length) view.value = result.data.Asset.Renders.includes('iso') ? 'iso' : result.data.Asset.Renders[0]!;
  } else {
    error.value = result.error;
  }
}, { immediate: true });

const label = computed(() => detail.value?.Asset.Label ?? null);
const views = computed(() => {
  const a = detail.value?.Asset;
  if (!a) return [];
  return [...(a.HasThumbnail ? ['thumb'] : []), ...['iso', 'front', 'right', 'top'].filter(v => a.Renders.includes(v))];
});
const subtitle = computed(() => {
  const a = detail.value?.Asset;
  if (!a) return undefined;
  return [a.Label?.What, a.Size ? `${bloxSize(a.Size)} studs` : null, a.Placeable ? 'placeable' : 'not placeable'].filter(Boolean).join(' · ');
});
const extras = computed(() => {
  const m = detail.value?.Measurements;
  if (!m) return '';
  const bits: string[] = [];
  if (m.LightCount) bits.push(`${m.LightCount} light${m.LightCount === 1 ? '' : 's'}`);
  if (m.SoundCount) bits.push(`${m.SoundCount} sound${m.SoundCount === 1 ? '' : 's'} (muted)`);
  if (m.ParticleCount) bits.push(`${m.ParticleCount} particle emitter${m.ParticleCount === 1 ? '' : 's'}`);
  if (m.DecalCount) bits.push(`${m.DecalCount} decal${m.DecalCount === 1 ? '' : 's'}`);
  if (m.HasSeat) bits.push('a seat');
  if (m.HasHumanoid) bits.push('a humanoid');
  return bits.join(' · ');
});
const qualityTone = (q: number): ObxTone => (q >= 7 ? 'ok' : q >= 4 ? 'warn' : 'crit');
</script>
