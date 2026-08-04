<template>
    <article class="ic" :class="{ dragging, watched, unevaluated: !row }"
             :draggable="draggable" :aria-label="`${displayName}${watched ? ' — already on the watchlist' : ''}`"
             @dragstart="onDragStart" @dragend="dragging = false">
        <header>
            <span class="names">
                <b>{{ displayName }}</b>
                <span class="sub">{{ subtitle }}</span>
            </span>
            <button v-if="!watched" class="ot-btn sm primary add" type="button"
                    :title="`Add ${displayName} to the watchlist`" @click.stop="$emit('add')">＋</button>
            <span v-else class="ot-chip ok" title="Already on this watchlist">on list</span>
        </header>

        <!-- Without bars there is nothing to judge, and inventing a flat line would imply a
             price that never moved rather than one nobody could fetch. -->
        <div v-if="!row" class="nodata">No price data for this symbol</div>

        <template v-else>
            <div class="body">
                <OmniTraderSparkline v-if="row.Spark?.length > 1" :values="row.Spark" :height="30"
                                     :label="`${displayName} price`" class="spark" />
                <div v-else class="spark empty" aria-hidden="true"></div>
                <span class="price">
                    <b :class="{ 'ot-stale': row.Stale }" :title="row.DataIssue ?? ''">{{ fmtNum(row.Price, 6) }}</b>
                    <span :class="row.ChangePercent24h >= 0 ? 'pos' : 'neg'">
                        {{ fmtSignedPct(row.ChangePercent24h) }}
                    </span>
                </span>
            </div>

            <footer>
                <span class="ot-chip" :class="regimeTone(row.Regime)">{{ regimeLabel(row.Regime) }}</span>
                <span class="metric" title="Momentum score">
                    mom <b :class="row.MomentumScore >= 0 ? 'pos' : 'neg'">{{ fmtNum(row.MomentumScore, 1) }}</b>
                </span>
                <span class="grow"></span>
                <span v-for="v in row.TradableOn" :key="v" class="ot-chip venue">{{ v }}</span>
                <span v-if="!row.TradableOn?.length" class="ot-chip warn" title="No venue mapping — chart and analytics only">
                    chart only
                </span>
            </footer>
        </template>
    </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
    fmtNum, fmtSignedPct, regimeTone, regimeLabel, INSTRUMENT_MIME, type MarketRow,
} from '~/composables/useOmniTrader';

const props = withDefaults(defineProps<{
    /** The evaluated market row. Null when the feed returned no bars for this symbol. */
    row?: MarketRow | null;
    /** Falls back to the row's own name — a match with no bars still has an identity. */
    name?: string;
    assetClass?: string;
    exchange?: string;
    /** The id a watchlist stores. Carried in the drag payload. */
    watchKey: string;
    watched?: boolean;
    draggable?: boolean;
}>(), { draggable: true });

defineEmits<{ add: [] }>();

const dragging = ref(false);

const displayName = computed(() => props.name || props.row?.DisplayName || props.watchKey);
const subtitle = computed(() =>
    [props.assetClass || props.row?.AssetClass, props.exchange].filter(Boolean).join(' · ') || props.watchKey);

function onDragStart(event: DragEvent) {
    if (!props.draggable || !event.dataTransfer) return;
    dragging.value = true;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(INSTRUMENT_MIME, props.watchKey);
    // Plain text too, so dropping onto an input or another app still yields the symbol.
    event.dataTransfer.setData('text/plain', props.watchKey);
}
</script>

<style scoped>
.ic {
    display: flex;
    flex-direction: column;
    gap: var(--ot-space-2);
    min-width: 240px;
    padding: var(--ot-space-3);
    border: 1px solid var(--ot-line);
    border-radius: var(--ot-radius);
    background: var(--ot-surface-2);
    cursor: grab;
    transition: border-color var(--ot-fast), background var(--ot-fast), opacity var(--ot-fast);
}
.ic:hover { border-color: var(--ot-accent); background: var(--ot-surface-3); }
.ic:active { cursor: grabbing; }
.ic.dragging { opacity: 0.45; }
.ic.watched { opacity: 0.62; cursor: default; }
.ic.unevaluated { border-style: dashed; }

.ic > header { display: flex; align-items: flex-start; gap: var(--ot-space-2); }
.names { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.names b { font-size: 13px; font-weight: 620; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.names .sub { font-size: 10.5px; color: var(--ot-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.add { min-width: 26px; padding: 0 var(--ot-space-2); line-height: 22px; }

.nodata { font-size: 11.5px; color: var(--ot-muted); padding: var(--ot-space-2) 0; }

.body { display: flex; align-items: center; gap: var(--ot-space-3); }
.spark { flex: 1; min-width: 0; }
.spark.empty { height: 30px; }
.price { display: flex; flex-direction: column; align-items: flex-end; font-family: var(--ot-mono); }
.price b { font-size: 13px; font-weight: 600; }
.price span { font-size: 11px; }

.ic > footer { display: flex; align-items: center; gap: var(--ot-space-2); flex-wrap: wrap; font-size: 11px; }
.metric { color: var(--ot-muted); font-family: var(--ot-mono); }
.metric b { color: var(--ot-text); }
.grow { flex: 1 1 auto; }
</style>
