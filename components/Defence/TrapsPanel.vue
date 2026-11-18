<template>
  <div class="odx-two">
    <section aria-label="Honeypot routes">
      <div class="odx-section-head">
        <h3><DefenceIcon name="trap" /> Honeypot routes</h3>
        <span class="odx-card__meta">{{ honeypots ? `${honeypots.length} armed` : '' }}</span>
        <div class="odx-card__tools">
          <button class="odx-iconbtn odx-iconbtn--sm" title="Recount hits" :disabled="busy" @click="emit('reload')"><DefenceIcon name="refresh" :class="{ 'odx-spin': busy }" /></button>
        </div>
      </div>
      <div class="odx-section-body">
        <p class="odx-note" style="margin-bottom: 10px">
          A request for one of these paths answers with convincing junk and counts heavily against the caller. Pick paths
          nothing on the site links to: <b>/wp-admin</b>, <b>/.env.backup</b>, <b>/phpmyadmin</b>.
        </p>
        <form v-if="canManage" style="display: flex; gap: 6px; margin-bottom: 10px" @submit.prevent="arm">
          <input v-model="route" class="odx-input" style="flex: 1" placeholder="/path-to-trap" spellcheck="false" data-testid="trap-route" />
          <input v-model="note" class="odx-input" style="flex: 1" placeholder="Note (optional)" />
          <button class="odx-btn odx-btn--sm" type="submit" :disabled="!route.trim()"><DefenceIcon name="plus" />Arm</button>
        </form>
        <div v-if="honeypots === null" class="odx-empty"><DefenceIcon name="refresh" class="odx-spin" />Counting hits per trap…</div>
        <table v-else-if="honeypots.length" class="odx-table">
          <thead><tr><th>Route</th><th class="num">Hits</th><th class="num">Last hit</th><th style="width: 1%"></th></tr></thead>
          <tbody>
            <tr v-for="trap in honeypots" :key="trap.route" :title="trap.note || ''">
              <td class="route">{{ trap.route }}<div v-if="trap.note" class="odx-dim" style="font-family: var(--odx-sans)">{{ trap.note }}</div></td>
              <td class="num odx-num">{{ fmtInt(trap.hits) }}</td>
              <td class="num odx-dim">{{ trap.lastHit ? fmtAgo(trap.lastHit, now) : 'never' }}</td>
              <td><button v-if="canManage" class="odx-iconbtn odx-iconbtn--sm" :title="`Disarm ${trap.route}`" @click="emit('remove-trap', trap.route)"><DefenceIcon name="trash" /></button></td>
            </tr>
          </tbody>
        </table>
        <div v-else class="odx-empty"><DefenceIcon name="trap" />No honeypot routes armed.</div>
      </div>
    </section>

    <section aria-label="Blocked regions">
      <div class="odx-section-head">
        <h3><DefenceIcon name="globe" /> Blocked regions</h3>
        <span class="odx-card__meta">{{ regions.length ? `${regions.length} active` : '' }}</span>
        <div class="odx-card__tools">
          <button v-if="canRegions" class="odx-btn odx-btn--xs" @click="emit('draw')"><DefenceIcon name="box" />Draw on the map</button>
        </div>
      </div>
      <div class="odx-section-body">
        <p class="odx-note" style="margin-bottom: 10px">
          Every address located inside a box is blocked, including ones that arrive later. Addresses linked to a
          Klives-rank profile are never blocked.
        </p>
        <table v-if="regions.length" class="odx-table">
          <thead><tr><th>Rule</th><th>Box</th><th class="num">Inside</th><th class="num">Added</th><th style="width: 1%"></th></tr></thead>
          <tbody>
            <tr v-for="region in regions" :key="region.id">
              <td>#{{ region.id }} {{ region.reason }}<div v-if="region.createdBy" class="odx-dim">by {{ region.createdBy }}</div></td>
              <td class="odx-mono odx-dim">{{ region.latMin.toFixed(1) }}…{{ region.latMax.toFixed(1) }}, {{ region.lonMin.toFixed(1) }}…{{ region.lonMax.toFixed(1) }}</td>
              <td class="num odx-num">{{ fmtInt(inside(region)) }}</td>
              <td class="num odx-dim">{{ fmtAgo(region.createdUtc, now) }}</td>
              <td><button v-if="canRegions" class="odx-iconbtn odx-iconbtn--sm" title="Remove this rule" @click="emit('remove-region', region)"><DefenceIcon name="trash" /></button></td>
            </tr>
          </tbody>
        </table>
        <div v-else class="odx-empty"><DefenceIcon name="globe" />No regions blocked.</div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { fmtAgo, fmtInt, mapCoordinates, type DefenceHoneypot, type DefenceIp, type DefenceRegion } from '~/scripts/omniDefence';

/** The two standing rules: paths that trap whoever asks for them, and boxes on the map that are blocked. */
const props = defineProps<{
  honeypots: DefenceHoneypot[] | null;
  regions: DefenceRegion[];
  ips: DefenceIp[];
  canManage: boolean;
  canRegions: boolean;
  busy: boolean;
  now: number;
}>();
const emit = defineEmits<{ arm: [route: string, note: string]; 'remove-trap': [route: string]; 'remove-region': [region: DefenceRegion]; draw: []; reload: [] }>();

const route = ref('');
const note = ref('');

function arm() {
  if (!route.value.trim()) return;
  emit('arm', route.value.trim(), note.value.trim());
  route.value = '';
  note.value = '';
}

function inside(region: DefenceRegion): number {
  let n = 0;
  for (const ip of props.ips) {
    const at = mapCoordinates(ip);
    if (at && !at.approximate && at.lat >= region.latMin && at.lat <= region.latMax && at.lon >= region.lonMin && at.lon <= region.lonMax) n++;
  }
  return n;
}
</script>
