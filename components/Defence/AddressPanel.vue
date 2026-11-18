<template>
  <div>
    <div class="odx-filters" role="search" aria-label="Filter addresses">
      <label class="odx-field" style="max-width: 340px">
        <DefenceIcon name="search" />
        <input ref="textInput" v-model="filter.text" placeholder="Address, place, network, profile, note, tag…" spellcheck="false" data-testid="address-search" />
      </label>
      <div class="odx-seg" role="group" aria-label="Kind of visitor">
        <button v-for="group in GROUPS" :key="group.id" class="odx-seg__opt" :aria-pressed="filter.groups.includes(group.id)" :data-testid="`address-group-${group.id}`" @click="toggle(filter.groups, group.id)">
          {{ group.label }} <span class="odx-seg__count">{{ fmtCompact(counts[group.id]) }}</span>
        </button>
      </div>
      <div class="odx-seg" role="group" aria-label="Status">
        <button v-for="status in STATUSES" :key="status" class="odx-seg__opt" :aria-pressed="filter.statuses.includes(status)" @click="toggle(filter.statuses, status)">
          {{ status === 'Honeypot' ? 'Trapped' : status }}
        </button>
      </div>
      <div class="odx-seg" role="group" aria-label="Seen within">
        <button v-for="window in WINDOWS" :key="window.hours" class="odx-seg__opt" :aria-pressed="filter.seenWithinHours === window.hours" @click="filter.seenWithinHours = window.hours">{{ window.label }}</button>
      </div>
      <select v-model="filter.tag" class="odx-select" aria-label="Tag">
        <option value="">Any tag</option>
        <option v-for="t in tags" :key="t.tag" :value="t.tag">{{ t.tag }} ({{ t.count }})</option>
      </select>
      <select v-model="sort" class="odx-select" aria-label="Sort">
        <option value="recent">Last seen</option>
        <option value="score">Threat score</option>
        <option value="requests">Most requests</option>
        <option value="denied">Most denied</option>
        <option value="first">Newest</option>
      </select>
      <button v-if="active" class="odx-btn odx-btn--sm odx-btn--ghost" @click="reset"><DefenceIcon name="x" />Clear</button>
      <div class="odx-filters__end">
        <span class="odx-filters__count" data-testid="address-count">{{ fmtInt(matches.length) }} of {{ fmtInt(ips.length) }}</span>
        <button v-if="canExport" class="odx-btn odx-btn--sm odx-btn--ghost" title="Download every IP record as CSV" @click="emit('export')"><DefenceIcon name="download" />CSV</button>
      </div>
    </div>

    <div class="odx-table-wrap">
      <table class="odx-table" data-testid="address-table">
        <thead>
          <tr>
            <th>Address</th>
            <th>Class</th>
            <th>Place</th>
            <th>Network</th>
            <th>Status</th>
            <th>Score</th>
            <th class="num">Requests</th>
            <th class="num">Denied</th>
            <th class="num">Last seen</th>
            <th style="width: 1%"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ip in visible" :key="ip.ip" data-clickable="true" :data-selected="selected === ip.ip || undefined" @click="emit('open', ip.ip)">
            <td>
              <span class="odx-ip">{{ ip.ip }}</span>
              <span v-if="ip.profileName" class="odx-chip" style="margin-left: 6px" :data-tone="ip.isKlives ? 'info' : 'neutral'" :title="ip.isKlives ? 'Linked to a Klives-rank profile: never blocked' : 'Seen signed in'">
                <DefenceIcon name="user-check" />{{ ip.profileName }}
              </span>
            </td>
            <td><DefenceClassPill :id="ip.classification" :classes="classes" :confidence="ip.classConfidence" /></td>
            <td :title="fmtGeo(ip)">{{ ip.city || '' }}<span v-if="ip.country" class="odx-dim">{{ ip.city ? ', ' : '' }}{{ ip.country }}</span><span v-if="!ip.city && !ip.country" class="odx-faint">—</span></td>
            <td class="odx-dim" :title="fmtNetwork(ip)">{{ fmtNetwork(ip) }}</td>
            <td><DefenceStatusChip :status="ip.status" /></td>
            <td>
              <span class="odx-score" :data-tone="scoreTone(ip.score, watchAt, blockAt)">
                <span class="odx-score__track"><span class="odx-score__fill" :style="{ width: `${scoreFill(ip.score, blockAt) * 100}%` }"></span></span>
                <span class="odx-score__value">{{ Math.round(ip.score) }}</span>
              </span>
            </td>
            <td class="num odx-num">{{ fmtInt(ip.total) }}</td>
            <td class="num odx-num" :class="{ 'odx-dim': !ip.deny }">{{ fmtInt(ip.deny) }}</td>
            <td class="num odx-dim" :title="fmtFull(ip.lastSeen)">{{ fmtAgo(ip.lastSeen, now) }}</td>
            <td>
              <span v-if="canBlock && !ip.isKlives" class="odx-row-acts">
                <button v-if="HOSTILE.includes(ip.status)" class="odx-btn odx-btn--xs odx-btn--ok" :disabled="!!pending[ip.ip]" @click.stop="emit('release', ip.ip)">Release</button>
                <button v-else class="odx-btn odx-btn--xs odx-btn--danger" :disabled="!!pending[ip.ip]" @click.stop="emit('block', ip.ip)">Block</button>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!matches.length" class="odx-empty">
        <DefenceIcon name="inbox" />
        <span>{{ ips.length ? 'No address matches.' : 'Reading every known address…' }}</span>
      </div>
      <div v-if="matches.length > visible.length" class="odx-more">
        <button class="odx-btn odx-btn--sm" @click="shown += 300">Show {{ Math.min(300, matches.length - visible.length) }} more</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  GROUPS, HOSTILE_STATUSES, STATUSES, filterAddresses, fmtAgo, fmtCompact, fmtFull, fmtGeo, fmtInt, fmtNetwork, groupCounts,
  scoreFill, scoreTone, sortAddresses, tagCounts, type AddressFilter, type AddressSort, type ClassGroup, type ClassInfo, type DefenceIp,
} from '~/scripts/omniDefence';

/**
 * Every address OmniDefence has seen, searched in the browser: no round trip per keystroke, and the
 * same records the map draws.
 */
const props = defineProps<{
  ips: DefenceIp[];
  classes: readonly ClassInfo[];
  selected: string | null;
  pending: Record<string, string>;
  canBlock: boolean;
  canExport: boolean;
  watchAt: number;
  blockAt: number;
  now: number;
  preset?: Partial<AddressFilter> | null;
}>();
const emit = defineEmits<{ open: [ip: string]; block: [ip: string]; release: [ip: string]; export: [] }>();

const HOSTILE: string[] = HOSTILE_STATUSES;
const WINDOWS = [{ hours: 1, label: '1h' }, { hours: 24, label: '24h' }, { hours: 168, label: '7d' }, { hours: 0, label: 'Any' }];

const filter = reactive<AddressFilter>({ text: '', groups: [], statuses: [], seenWithinHours: 0, profiled: 'any', tag: '' });
const sort = ref<AddressSort>('recent');
const shown = ref(300);
const textInput = ref<HTMLInputElement | null>(null);

watch(() => props.preset, preset => {
  if (!preset) return;
  Object.assign(filter, { text: '', groups: [], statuses: [], seenWithinHours: 0, profiled: 'any', tag: '' }, preset);
  if (preset.statuses?.length || preset.groups?.length) sort.value = 'score';
}, { immediate: true });

function toggle<T>(list: T[], value: T) {
  const at = list.indexOf(value);
  if (at >= 0) list.splice(at, 1); else list.push(value);
}

const active = computed(() => !!(filter.text || filter.groups.length || filter.statuses.length || filter.seenWithinHours || filter.tag));
function reset() {
  Object.assign(filter, { text: '', groups: [], statuses: [], seenWithinHours: 0, profiled: 'any', tag: '' });
}

const counts = computed(() => groupCounts(props.ips, props.classes) as Record<ClassGroup, number>);
const tags = computed(() => tagCounts(props.ips).slice(0, 40));
const matches = computed(() => sortAddresses(filterAddresses(props.ips, filter, props.classes, props.now), sort.value));
const visible = computed(() => matches.value.slice(0, shown.value));
watch(() => [filter.text, filter.groups.length, filter.statuses.length, filter.seenWithinHours, filter.tag, sort.value], () => { shown.value = 300; });

function focus() { textInput.value?.focus(); }
defineExpose({ focus });
</script>
