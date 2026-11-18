<template>
  <div>
    <div class="odx-filters" role="search" aria-label="Filter traffic">
      <label class="odx-field" style="max-width: 200px">
        <DefenceIcon name="globe" />
        <input ref="ipInput" v-model="draft.ip" placeholder="Address" spellcheck="false" data-testid="traffic-ip" @input="debounced" />
      </label>
      <label class="odx-field" style="max-width: 280px">
        <DefenceIcon name="route" />
        <input v-model="draft.route" placeholder="Route contains…" spellcheck="false" data-testid="traffic-route" @input="debounced" />
      </label>
      <label class="odx-field" style="max-width: 170px">
        <DefenceIcon name="user" />
        <input v-model="draft.profile" placeholder="Profile" spellcheck="false" @input="debounced" />
      </label>
      <select v-model="draft.status" class="odx-select" aria-label="Status" @change="apply">
        <option value="">Any status</option>
        <option value="2xx">2xx</option><option value="3xx">3xx</option><option value="4xx">4xx</option><option value="5xx">5xx</option>
        <option value="403">403</option><option value="404">404</option><option value="429">429</option>
      </select>
      <select v-model="draft.method" class="odx-select" aria-label="Method" @change="apply">
        <option value="">Any method</option><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option><option>OPTIONS</option>
      </select>
      <select v-model="draft.origin" class="odx-select" aria-label="Origin" @change="apply">
        <option value="">Any origin</option>
        <option v-for="origin in ORIGINS" :key="origin" :value="origin">{{ originLabel(origin).label }}</option>
      </select>
      <button class="odx-btn odx-btn--sm" :aria-pressed="draft.denyOnly" data-testid="traffic-denied" @click="draft.denyOnly = !draft.denyOnly; apply()">
        <DefenceIcon name="block" />Denied only
      </button>
      <button v-if="filtered" class="odx-btn odx-btn--sm odx-btn--ghost" @click="clear"><DefenceIcon name="x" />Clear</button>
      <div class="odx-filters__end">
        <span class="odx-filters__count">{{ rows.length ? `${fmtInt(filter.offset + 1)}–${fmtInt(filter.offset + rows.length)}` : 'No rows' }}</span>
        <button v-if="canExport" class="odx-btn odx-btn--sm odx-btn--ghost" title="Download the latest 50,000 requests as CSV" @click="emit('export')"><DefenceIcon name="download" />CSV</button>
      </div>
    </div>

    <div class="odx-table-wrap" :data-busy="busy || undefined">
      <table class="odx-table" data-testid="traffic-table">
        <thead>
          <tr>
            <th style="width: 92px">Time</th>
            <th>Address</th>
            <th>Origin</th>
            <th style="width: 58px">Method</th>
            <th>Route</th>
            <th class="num" style="width: 64px">Status</th>
            <th>Profile</th>
            <th>Denied because</th>
            <th class="num" style="width: 70px">Time taken</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.id"
            data-clickable="true"
            :data-tone="row.reason || row.status >= 500 ? 'crit' : row.status >= 400 ? 'warn' : undefined"
            :title="row.clientPage ? `From ${row.clientPage}` : 'Open the full request'"
            @click="emit('request', row.id)"
          >
            <td class="odx-num" :title="fmtFull(row.ts)">{{ fmtStamp(row.ts, now) }}</td>
            <td>
              <span style="display: inline-flex; align-items: center; gap: 7px">
                <DefenceClassPill :id="ipIndex.get(row.ip)?.classification" :classes="classes" dot-only />
                <button class="odx-ip-link" @click.stop="emit('open', row.ip)">{{ row.ip || 'unknown' }}</button>
              </span>
            </td>
            <td><span class="odx-chip" :data-tone="originLabel(row.origin).tone">{{ originLabel(row.origin).label }}</span></td>
            <td><span class="odx-method">{{ row.method }}</span></td>
            <td class="route" :title="row.route + (row.query || '')">{{ row.route }}<span v-if="row.query" class="odx-faint">{{ row.query }}</span></td>
            <td class="num"><span class="odx-http" :data-tone="httpTone(row.status)">{{ row.status || '—' }}</span></td>
            <td>{{ row.profile || '' }}</td>
            <td :title="row.reason || ''"><span v-if="row.reason" class="odx-chip" data-tone="crit">{{ row.reason }}</span></td>
            <td class="num odx-dim">{{ fmtMs(row.duration) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!rows.length" class="odx-empty">
        <DefenceIcon :name="error ? 'alert' : 'inbox'" />
        <span>{{ error || (busy ? 'Reading the request log…' : filtered ? 'No request matches these filters.' : 'No requests recorded.') }}</span>
      </div>
    </div>

    <div class="odx-pager">
      <button class="odx-btn odx-btn--sm odx-btn--ghost" :disabled="filter.offset === 0" @click="emit('page', -1)"><DefenceIcon name="chevron-left" />Newer</button>
      <span>Newest first · {{ TRAFFIC_LIMIT }} a page</span>
      <button class="odx-btn odx-btn--sm odx-btn--ghost" :disabled="rows.length < TRAFFIC_LIMIT" @click="emit('page', 1)">Older<DefenceIcon name="chevron-right" /></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { TRAFFIC_LIMIT, type TrafficFilter } from '~/composables/useOmniDefence';
import { ORIGINS, fmtFull, fmtInt, fmtMs, fmtStamp, httpTone, originLabel, type ClassInfo, type DefenceIp, type DefenceRequest } from '~/scripts/omniDefence';

/**
 * Every API request, newest first. Filters apply as they are typed; a row opens the request with its
 * headers and body, an address opens that visitor.
 */
const props = defineProps<{
  rows: DefenceRequest[];
  filter: TrafficFilter;
  busy: boolean;
  error?: string;
  classes: readonly ClassInfo[];
  ipIndex: Map<string, DefenceIp>;
  now: number;
  canExport: boolean;
}>();
const emit = defineEmits<{ apply: [filter: TrafficFilter]; page: [direction: number]; open: [ip: string]; request: [id: number | string]; export: [] }>();

const draft = reactive<TrafficFilter>({ ...props.filter });
const ipInput = ref<HTMLInputElement | null>(null);
watch(() => props.filter, value => Object.assign(draft, value), { deep: true });

const filtered = computed(() => !!(draft.ip || draft.route || draft.profile || draft.status || draft.method || draft.origin || draft.denyOnly));

let timer: number | null = null;
function debounced() {
  if (timer != null) window.clearTimeout(timer);
  timer = window.setTimeout(apply, 380);
}
function apply() {
  if (timer != null) { window.clearTimeout(timer); timer = null; }
  emit('apply', { ...draft, offset: 0 });
}
function clear() {
  Object.assign(draft, { ip: '', profile: '', route: '', status: '', method: '', origin: '', denyOnly: false, offset: 0 });
  apply();
}
function focus() { ipInput.value?.focus(); }
defineExpose({ focus });
onBeforeUnmount(() => { if (timer != null) window.clearTimeout(timer); });
</script>
