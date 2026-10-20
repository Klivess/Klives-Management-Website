<template>
    <button type="button" class="ot-card bx-asset" :class="{ active, dim: asset.Status === 'rejected' || asset.Status === 'failed' }" @click="$emit('open', asset.AssetId)">
        <OmniBloxImg :path="asset.HasThumbnail ? bloxAssetImagePath(asset.AssetId) : null" ratio="1 / 1" :alt="asset.Name" fallback="No thumbnail" />
        <span class="name" :title="asset.Name">{{ asset.Name }}</span>
        <span class="what">{{ asset.Label?.What || asset.StatusReason || statusText }}</span>
        <span class="chips">
            <span v-if="asset.Label?.Category" class="ot-chip">{{ asset.Label.Category }}</span>
            <span v-if="asset.Status !== 'labeled'" class="ot-chip" :class="statusTone">{{ statusText }}</span>
            <span v-if="asset.Size && asset.Size.some(v => v > 0)" class="dims">{{ bloxSize(asset.Size) }}</span>
            <span v-if="asset.TimesUsed" class="used">used {{ asset.TimesUsed }}×</span>
            <span v-if="asset.ScriptFlags.length" class="flag" :title="asset.ScriptFlags.join('; ')">⚠ {{ asset.ScriptsRemoved }} script{{ asset.ScriptsRemoved === 1 ? '' : 's' }} stripped</span>
        </span>
    </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { bloxAssetImagePath, bloxSize, type BloxAsset } from '~/composables/useOmniBlox';

const props = defineProps<{ asset: BloxAsset; active?: boolean }>();
defineEmits<{ open: [assetId: number] }>();

const STATUS: Record<string, [string, string]> = {
    discovered: ['found', ''],
    previewed: ['previewed', ''],
    analyzed: ['awaiting label', 'info'],
    labeled: ['labelled', 'ok'],
    rejected: ['rejected', 'bad'],
    failed: ['failed', 'bad'],
};
const statusText = computed(() => STATUS[props.asset.Status]?.[0] ?? props.asset.Status);
const statusTone = computed(() => STATUS[props.asset.Status]?.[1] ?? '');
</script>

<style scoped>
.bx-asset {
    display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start;
    gap: 6px; padding: var(--ot-space-2); text-align: left; cursor: pointer; min-width: 0;
    text-transform: none; letter-spacing: normal; transition: border-color var(--ot-fast);
}
.bx-asset:hover, .bx-asset.active { border-color: var(--ot-line-strong); }
.bx-asset.active { box-shadow: 0 0 0 1px var(--ot-accent) inset; }
.bx-asset.dim { opacity: 0.65; }
.name { font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.what { font-size: 11.5px; color: var(--ot-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-height: 16px; }
.chips { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; font-size: 10.5px; }
.dims { font-family: var(--ot-mono); color: var(--ot-muted); }
.used { color: var(--ot-info); }
.flag { color: var(--ot-warning); }
</style>
