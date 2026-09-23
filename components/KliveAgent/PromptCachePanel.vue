<template>
  <section class="cache-panel" aria-labelledby="agent-cache-heading">
    <div class="cache-head">
      <div>
        <h3 id="agent-cache-heading">Prompt cache</h3>
        <p>Provider reported cache reads for KliveAgent model calls. Whole prompt rate includes each new suffix; reusable prefix efficiency compares consecutive turns.</p>
      </div>
      <div class="cache-actions">
        <select v-model="range" aria-label="Prompt cache range"><option value="7d">7 days</option><option value="30d">30 days</option><option value="90d">90 days</option><option value="all">All time</option></select>
        <button type="button" @click="load">Refresh</button>
      </div>
    </div>
    <p v-if="error" class="cache-error">{{ error }}</p>
    <p v-else-if="loading && !cache">Loading cache telemetry…</p>
    <template v-else-if="cache">
      <p class="cache-verdict" role="status"><strong>{{ cache.status }}</strong> · {{ cache.verdict }}</p>
      <p v-if="cache.lastMeasuredAt" class="cache-sampled">Measured {{ new Date(cache.measurementStartedAt).toLocaleString() }} – {{ new Date(cache.lastMeasuredAt).toLocaleString() }}</p>
      <div class="cache-metrics">
        <div><strong>{{ pct(cache.cacheHitRatePct) }}</strong><span>Whole prompt hit rate</span></div>
        <div><strong>{{ pct(cache.reusablePrefixEfficiencyPct) }}</strong><span>Reusable prefix efficiency</span></div>
        <div><strong>{{ count(cache.cachedTokens) }}</strong><span>Cached tokens</span></div>
        <div><strong>{{ count(cache.uncachedTokens) }}</strong><span>Uncached tokens</span></div>
        <div><strong>{{ count(cache.excessUncachedTokens) }}</strong><span>Above {{ pct(cache.targetCacheHitRatePct) }} hit target budget</span></div>
        <div><strong>{{ pct(cache.telemetryCoveragePct) }}</strong><span>Telemetry coverage</span></div>
        <div><strong>{{ count(cache.measuredRequests) }} / {{ count(cache.requests) }}</strong><span>Measured requests</span></div>
        <div><strong>{{ pct(cache.firstTurnHitRatePct) }} / {{ pct(cache.continuationHitRatePct) }}</strong><span>First / continued turns</span></div>
        <div><strong>{{ count(cache.zeroHitRequests) }}</strong><span>Zero hit requests</span></div>
        <div><strong>{{ count(cache.cacheWriteTokens) }}</strong><span>Cache write tokens</span></div>
        <div><strong>{{ count(cache.reusablePrefixSamples) }}</strong><span>Comparable prefixes</span></div>
        <div><strong>{{ count(cache.expiredPrefixSamples) }}</strong><span>Expired prefixes</span></div>
        <div><strong>{{ count(cache.expiredPrefixTokens) }}</strong><span>Expired prefix tokens</span></div>
        <div><strong>{{ count(cache.averageUncachedTokens) }}</strong><span>Average uncached tokens / call</span></div>
        <div><strong>{{ duration(cache.averageRequestDurationMs) }}</strong><span>Average request time</span></div>
        <div><strong>{{ duration(cache.averageQueueDurationMs) }} / {{ duration(cache.averageProviderDurationMs) }}</strong><span>Queue / provider time</span></div>
        <div><strong>{{ duration(cache.maxQueueDurationMs) }} / {{ count(cache.parkedRequests) }}</strong><span>Max queue / parked requests</span></div>
        <div><strong>{{ pct(cache.latencyBreakdownCoveragePct) }}</strong><span>Latency telemetry coverage</span></div>
        <div><strong>{{ pct(cache.routedProviderCoveragePct) }} / {{ pct(cache.providerStabilityPct) }}</strong><span>Route coverage / stability</span></div>
        <div><strong>{{ count(cache.providerSwitches) }} / {{ count(cache.providerComparisons) }}</strong><span>Provider switches / comparisons</span></div>
        <div><strong>{{ pct(cache.compactionRatePct) }}</strong><span>Context compaction rate</span></div>
        <div><strong>{{ count(cache.responseCacheHits) }}</strong><span>Response cache hits</span></div>
      </div>
      <div v-if="points.length" class="cache-bars" role="img" aria-label="Prompt cache hit rate by time bucket">
        <div v-for="point in points" :key="point.date" class="cache-bar" :title="`${point.date}: ${pct(point.cacheHitRatePct)} of ${count(point.promptTokens)} prompt tokens`">
          <div :style="{ height: `${Math.max(2, point.cacheHitRatePct)}%` }"></div>
        </div>
      </div>
      <div v-if="cache.breakdown?.length" class="cache-table-wrap">
        <h4>By provider and model</h4>
        <table><thead><tr><th>Provider</th><th>Model</th><th>Calls</th><th>Hit rate</th><th>Cached / prompt</th><th>Average latency</th></tr></thead>
          <tbody><tr v-for="item in cache.breakdown" :key="item.key"><td>{{ item.provider }}</td><td>{{ item.model }}</td><td>{{ count(item.requests) }}</td><td>{{ pct(item.cacheHitRatePct) }}</td><td>{{ count(item.cachedTokens) }} / {{ count(item.promptTokens) }}</td><td>{{ duration(item.averageRequestDurationMs) }}</td></tr></tbody>
        </table>
      </div>
      <details v-if="cache.recent?.length" class="cache-table-wrap"><summary>Recent calls · {{ cache.recent.length }}</summary>
        <table><thead><tr><th>Time</th><th>Model</th><th>Turn</th><th>Cached / prompt</th><th>Queue / provider</th></tr></thead>
          <tbody><tr v-for="(item, index) in cache.recent" :key="`${item.generationID || item.occurredAt}-${index}`"><td>{{ new Date(item.occurredAt).toLocaleString() }}</td><td>{{ item.model }}</td><td>{{ item.turnIndex }}</td><td>{{ count(item.cachedTokens) }} / {{ count(item.promptTokens) }}</td><td>{{ duration(item.queueDurationMs) }} / {{ duration(item.providerDurationMs) }}</td></tr></tbody>
        </table>
      </details>
    </template>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

const range = ref('30d');
const cache = ref(null);
const loading = ref(false);
const error = ref('');
const points = computed(() => (cache.value?.series || []).filter((point) => point.requests > 0));
const count = (value) => Number(value || 0).toLocaleString();
const pct = (value) => `${Number(value || 0).toFixed(1)}%`;
const duration = (value) => `${Math.round(Number(value || 0)).toLocaleString()} ms`;
async function load() {
  loading.value = true;
  error.value = '';
  try {
    const response = await RequestGETFromKliveAPI(`/kliveagent/stats/prompt-cache?range=${range.value}&_t=${Date.now()}`, false, false);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Could not load cache telemetry.');
    cache.value = data;
  } catch (failure) { error.value = failure?.message || 'Could not load cache telemetry.'; }
  finally { loading.value = false; }
}
watch(range, load, { immediate: true });
</script>

<style scoped>
.cache-panel { margin: 20px 0; padding: 18px; background: #1d1e20; border: 1px solid #383a3d; border-radius: 12px; color: #ddd; }
.cache-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.cache-head h3 { margin: 0 0 5px; font-size: 17px; }
.cache-head p { margin: 0; color: #aaa; font-size: 12px; max-width: 730px; }
.cache-actions { display: flex; gap: 6px; }
.cache-actions select, .cache-actions button { background: #292b2e; border: 1px solid #494b4f; border-radius: 6px; color: #eee; padding: 5px 8px; cursor: pointer; }
.cache-verdict { background: #282a2c; border-radius: 7px; padding: 9px 11px; font-size: 12px; }
.cache-verdict strong { text-transform: capitalize; }
.cache-sampled { color: #aaa; font-size: 11px; margin-top: -4px; }
.cache-error { color: #f99; }
.cache-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 7px; }
.cache-metrics div { display: flex; flex-direction: column; padding: 9px; border: 1px solid #35373a; border-radius: 7px; }
.cache-metrics strong { font-size: 16px; color: #e9f4e5; }
.cache-metrics span { color: #a9aaac; font-size: 11px; }
.cache-bars { height: 90px; display: flex; align-items: flex-end; gap: 2px; margin: 15px 0; border-bottom: 1px solid #555; }
.cache-bar { flex: 1; height: 100%; display: flex; align-items: flex-end; min-width: 3px; }
.cache-bar div { width: 100%; background: #6fac5c; }
.cache-table-wrap { overflow-x: auto; margin-top: 13px; }
.cache-table-wrap h4 { margin: 0 0 6px; }
.cache-table-wrap table { width: 100%; border-collapse: collapse; font-size: 12px; }
.cache-table-wrap th, .cache-table-wrap td { padding: 6px; border-bottom: 1px solid #3d3f42; text-align: left; }
.cache-table-wrap th { color: #aaa; }
@media (max-width: 650px) { .cache-head { flex-direction: column; } }
</style>
