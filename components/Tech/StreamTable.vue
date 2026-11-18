<template>
  <div class="ktx-panel" data-testid="ktx-streams">
    <div class="ktx-toolbar">
      <label class="ktx-field" style="flex: 1 1 220px; max-width: 320px">
        <TechIcon name="search" />
        <input v-model="query" type="search" placeholder="Stream or gadget" aria-label="Search streams" @keydown.stop />
      </label>
      <select v-model="gadget" class="ktx-select" aria-label="Gadget">
        <option value="">All gadgets</option>
        <option v-for="g in gadgetOptions" :key="g.id" :value="g.id">{{ g.name }}</option>
      </select>
      <div class="ktx-seg" role="group" aria-label="Type">
        <button class="ktx-seg__opt" :aria-pressed="!type" @click="type = ''">Any</button>
        <button v-for="t in types" :key="t" class="ktx-seg__opt" :aria-pressed="type === t" @click="type = type === t ? '' : t">{{ t }}</button>
      </div>
      <label class="ktx-check"><input v-model="enabledOnly" type="checkbox" />Live only</label>
      <span class="ktx-grow"></span>
      <span class="ktx-dim ktx-num">{{ rows.length === entries.length ? `${rows.length} streams` : `${rows.length} of ${entries.length}` }}</span>
    </div>

    <div v-if="rows.length" class="ktx-table-wrap">
      <table class="ktx-table">
        <thead>
          <tr>
            <th>Stream</th>
            <th class="ktx-col-md">Type</th>
            <th class="ktx-col-lg">Cadence</th>
            <th>Value</th>
            <th class="ktx-num">Age</th>
            <th class="ktx-num ktx-col-lg">Seq</th>
            <th class="ktx-num ktx-col-md">Dropped</th>
            <th class="ktx-num">Live</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in rows" :key="`${s.gadgetID}/${s.streamID}`" :data-off="!s.enabled || undefined" tabindex="0" @click="emit('open', s.gadgetID)" @keydown.enter="emit('open', s.gadgetID)">
            <td>
              <span class="ktx-cellstack">
                <span class="ktx-mono">{{ s.streamID }}</span>
                <span class="ktx-faint"><span class="ktx-dotmark" :data-tone="s.gadgetOnline ? 'ok' : 'neutral'"></span>{{ s.gadgetName || 'unknown gadget' }}</span>
              </span>
            </td>
            <td class="ktx-col-md"><span class="ktx-chip">{{ s.valueType }}</span></td>
            <td class="ktx-col-lg ktx-dim">{{ streamInterval(s) }}</td>
            <td class="ktx-mono ktx-value-cell" :title="fmtStreamValue(s.latestValue, s.valueType)">{{ fmtStreamValue(s.latestValue, s.valueType) }}</td>
            <td class="ktx-num" :data-tone="stale(s) ? 'warn' : undefined">{{ s.latestReceivedUtc ? fmtAgo(s.latestReceivedUtc, now).replace(' ago', '') : '—' }}</td>
            <td class="ktx-num ktx-col-lg ktx-dim">{{ s.latestSequence ?? '—' }}</td>
            <td class="ktx-num ktx-col-md" :data-tone="s.droppedEvents ? 'warn' : undefined">{{ s.droppedEvents || '·' }}</td>
            <td class="ktx-num" @click.stop>
              <label v-if="canControl && s.gadgetOnline" class="ktx-switch">
                <input type="checkbox" :checked="s.enabled" :disabled="!!pending[`${s.gadgetID}/${s.streamID}`]" :aria-label="`${s.streamID} live`" @change="emit('toggle', s, ($event.target as HTMLInputElement).checked)" />
                <span class="ktx-switch__track"></span>
              </label>
              <span v-else class="ktx-dim">{{ s.enabled ? 'on' : 'off' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="ktx-empty">
      <TechIcon name="wave" />
      <span v-if="entries.length">No stream matches these filters.</span>
      <span v-else>No gadget has published a Streamable. They are declared by a gadget's firmware (CreateStreamable…), not set up here.</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ageMs, fmtAgo, fmtStreamValue, streamInterval, type StreamableEntry } from '~/scripts/kliveTech';

/** Every Streamable across the fleet in one table. A row opens its gadget, where it plots live. */
const props = defineProps<{ entries: StreamableEntry[]; now: number; canControl: boolean; pending: Record<string, string> }>();
const emit = defineEmits<{ open: [gadgetID: string]; toggle: [entry: StreamableEntry, enabled: boolean] }>();

const query = ref('');
const gadget = ref('');
const type = ref('');
const enabledOnly = ref(false);

const gadgetOptions = computed(() => {
  const seen = new Map<string, string>();
  props.entries.forEach(e => { if (!seen.has(e.gadgetID)) seen.set(e.gadgetID, e.gadgetName || e.gadgetID); });
  return [...seen.entries()].map(pair => ({ id: pair[0], name: pair[1] })).sort((a, b) => a.name.localeCompare(b.name));
});
const types = computed(() => [...new Set(props.entries.map(e => e.valueType))].sort());

const rows = computed(() => {
  const q = query.value.trim().toLowerCase();
  return props.entries
    .filter(e => !gadget.value || e.gadgetID === gadget.value)
    .filter(e => !type.value || e.valueType === type.value)
    .filter(e => !enabledOnly.value || e.enabled)
    .filter(e => !q || e.streamID.toLowerCase().includes(q) || (e.gadgetName || '').toLowerCase().includes(q))
    .sort((a, b) => Number(b.gadgetOnline) - Number(a.gadgetOnline) || (a.gadgetName || '').localeCompare(b.gadgetName || '') || a.streamID.localeCompare(b.streamID));
});

/** Periodic streams that are well past their own interval. */
function stale(s: StreamableEntry): boolean {
  if (!s.enabled || s.mode !== 'periodic' || !s.intervalMs) return false;
  const age = ageMs(s.latestReceivedUtc, props.now);
  return age !== null && age > Math.max(15_000, s.intervalMs * 4);
}
</script>
