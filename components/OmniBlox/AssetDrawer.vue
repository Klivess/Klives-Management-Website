<template>
    <OmniTraderDrawer :open="assetId !== null" :title="detail?.Asset.Name ?? 'Model'" :subtitle="subtitle" wide @close="$emit('close')">
        <div v-if="!detail && !error" class="ot-skelrows" aria-busy="true">
            <div class="ot-skel" style="height:300px"></div>
            <div class="ot-skel" style="width:70%"></div>
        </div>
        <OmniTraderStateBlock v-else-if="error && !detail" kind="error" title="Could not load the model" :detail="error" />

        <template v-else-if="detail">
            <div v-if="views.length > 1" class="ot-segment sm views" role="group" aria-label="View">
                <button v-for="v in views" :key="v" type="button" :aria-pressed="view === v" @click="view = v">{{ VIEW_LABEL[v] ?? v }}</button>
            </div>
            <OmniBloxImg :path="bloxAssetImagePath(detail.Asset.AssetId, view)" ratio="1 / 1" contain :alt="`${detail.Asset.Name}, ${view}`" class="hero" />

            <section v-if="label" class="block">
                <h3 class="ot-sectionhead">What the labeller saw</h3>
                <p class="what">{{ label.What }}</p>
                <p class="desc">{{ label.Description }}</p>
                <dl class="ot-kv">
                    <dt>Category</dt><dd>{{ label.Category }}{{ label.Subcategory ? ` / ${label.Subcategory}` : '' }}</dd>
                    <dt>Style</dt><dd>{{ label.Style || '—' }}</dd>
                    <dt>Quality</dt><dd>{{ label.Quality }}/10</dd>
                    <dt>Front</dt><dd>{{ label.FrontYaw ? `turned ${label.FrontYaw}° from −Z` : 'faces −Z' }}</dd>
                    <dt>Walkable</dt><dd>{{ label.Walkable ? 'yes' : 'no' }}</dd>
                    <template v-if="label.Model"><dt>Labelled by</dt><dd>{{ label.Model }}</dd></template>
                </dl>
                <div v-if="label.Themes.length" class="row"><span class="k">Themes</span><span class="bx-tags"><span v-for="t in label.Themes" :key="t" class="ot-chip">{{ t }}</span></span></div>
                <div v-if="label.GoodFor.length" class="row"><span class="k">Good for</span><span>{{ label.GoodFor.join(' · ') }}</span></div>
                <div v-if="label.PairsWith.length" class="row"><span class="k">Pairs with</span><span>{{ label.PairsWith.join(' · ') }}</span></div>
                <div v-if="label.Issues.length" class="row warn"><span class="k">Issues</span><span>{{ label.Issues.join(' · ') }}</span></div>
            </section>
            <section v-else class="block">
                <h3 class="ot-sectionhead">Status</h3>
                <p class="desc">{{ STATUS_TEXT[detail.Asset.Status] ?? detail.Asset.Status }}<template v-if="detail.Asset.StatusReason">: {{ detail.Asset.StatusReason }}</template></p>
            </section>

            <section v-if="detail.Measurements" class="block">
                <h3 class="ot-sectionhead">Measured</h3>
                <dl class="ot-kv">
                    <dt>Size</dt><dd>{{ bloxSize([detail.Measurements.SizeX, detail.Measurements.SizeY, detail.Measurements.SizeZ]) }} studs (W×H×D) · {{ detail.Asset.Proportions }}</dd>
                    <dt>Parts</dt><dd>{{ detail.Measurements.PartCount }} parts · {{ detail.Measurements.MeshPartCount }} meshes · {{ fmtCount(detail.Asset.Triangles) }} triangles · {{ detail.Asset.PerformanceCost }} cost</dd>
                    <template v-if="extras"><dt>Also</dt><dd>{{ extras }}</dd></template>
                </dl>
                <div v-if="detail.Asset.Colors?.length" class="swatches">
                    <span v-for="c in detail.Asset.Colors" :key="c.Hex" class="swatch" :title="`${c.Name} ${c.Hex}`">
                        <span class="chip" :style="{ background: c.Hex }"></span>{{ c.Name }} <span class="pct">{{ bloxPct(c.Share) }}</span>
                    </span>
                </div>
                <div v-if="detail.Asset.Materials?.length" class="row"><span class="k">Materials</span><span>{{ detail.Asset.Materials.map(m => `${m.Material} ${bloxPct(m.Share)}`).join(' · ') }}</span></div>
            </section>

            <section v-if="detail.Asset.ScriptsRemoved || detail.Asset.ScriptFlags.length" class="block">
                <h3 class="ot-sectionhead">Cleaned</h3>
                <p class="desc">{{ detail.Asset.ScriptsRemoved }} script{{ detail.Asset.ScriptsRemoved === 1 ? '' : 's' }} removed before the model can be placed.</p>
                <ul v-if="detail.Asset.ScriptFlags.length" class="bx-list flags"><li v-for="f in detail.Asset.ScriptFlags" :key="f">{{ f }}</li></ul>
            </section>

            <section v-if="detail.UsageNotes.length" class="block">
                <h3 class="ot-sectionhead">Builders' notes</h3>
                <ul class="bx-list"><li v-for="(n, i) in detail.UsageNotes" :key="i">{{ n }}</li></ul>
            </section>

            <section class="block">
                <h3 class="ot-sectionhead">Source</h3>
                <dl class="ot-kv">
                    <dt>Asset</dt><dd>#{{ detail.Asset.AssetId }} <a :href="bloxCreatorStoreUrl(detail.Asset.AssetId)" target="_blank" rel="noopener">Creator Store ↗</a></dd>
                    <dt>Creator</dt><dd>{{ detail.Asset.CreatorName || '—' }}{{ detail.Asset.CreatorVerified ? ' ✓ verified' : '' }}</dd>
                    <dt>Votes</dt><dd>{{ fmtCount(detail.Asset.UpVotes) }} up · {{ detail.Asset.UpVotePercent }}%</dd>
                    <dt>Found by</dt><dd>"{{ detail.Asset.DiscoveredQuery }}" · {{ fmtDate(detail.Asset.DiscoveredUtc) }}</dd>
                    <template v-if="detail.Asset.LabeledUtc"><dt>Labelled</dt><dd>{{ fmtDate(detail.Asset.LabeledUtc) }}</dd></template>
                    <dt>Used</dt><dd>{{ detail.Asset.TimesUsed ? `in ${detail.Asset.TimesUsed} game${detail.Asset.TimesUsed === 1 ? '' : 's'}` : 'not yet' }}</dd>
                </dl>
            </section>
        </template>
    </OmniTraderDrawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fmtCount, fmtDate } from '~/composables/useOmniTumblr';
import { bloxAssetImagePath, bloxCreatorStoreUrl, bloxGet, bloxPct, bloxSize, type BloxAssetDetail } from '~/composables/useOmniBlox';

const props = defineProps<{ assetId: number | null }>();
defineEmits<{ close: [] }>();

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
</script>

<style scoped>
.views { margin-bottom: var(--ot-space-2); }
.hero { max-width: 420px; margin: 0 auto var(--ot-space-3); }
.block { margin-top: var(--ot-space-4); }
.what { margin: 0 0 4px; font-size: 14px; font-weight: 600; }
.desc { margin: 0 0 var(--ot-space-2); font-size: 12.5px; line-height: 18px; color: var(--ot-text-2); }
.row { display: flex; gap: var(--ot-space-2); font-size: 12.5px; margin-top: 6px; align-items: baseline; }
.row .k { flex: 0 0 110px; color: var(--ot-muted); }
.row.warn span:last-child { color: var(--ot-warning); }
.swatches { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: var(--ot-space-2); font-size: 12px; }
.swatch { display: inline-flex; align-items: center; gap: 5px; }
.swatch .chip { width: 14px; height: 14px; border-radius: 3px; border: 1px solid var(--ot-line-strong); }
.pct { color: var(--ot-muted); font-family: var(--ot-mono); font-size: 11px; }
.flags { color: var(--ot-warning); }
a { color: var(--ot-info); text-decoration: none; margin-left: 6px; }
</style>
