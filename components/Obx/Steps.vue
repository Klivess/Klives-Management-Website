<template>
  <div>
    <ol class="obx-steps" :aria-label="label">
      <li v-for="(e, i) in shown" :key="`${e.Utc}-${i}`" class="obx-step" :data-kind="e.Kind" :data-error="e.Error || undefined">
        <span class="obx-step__glyph" :data-tone="e.Error ? 'crit' : e.Kind === 'result' ? 'ok' : e.Kind === 'call' ? 'info' : e.Kind === 'text' ? 'violet' : 'neutral'">{{ glyph(e) }}</span>
        <div class="obx-step__body">
          <div class="obx-step__head">
            <span v-if="e.Kind === 'call'" class="obx-step__tool">{{ e.Tool }}</span>
            <span v-else-if="e.Kind === 'result'" class="obx-step__tool">{{ e.Tool }} {{ e.Error ? 'failed' : '→' }}</span>
            <span v-else-if="e.Kind === 'text'" class="obx-dim" style="font-weight: 600">The agent</span>
            <time class="obx-step__when" :datetime="e.Utc">{{ obxClock(e.Utc) }}</time>
          </div>
          <p v-if="e.Kind === 'call'" class="obx-step__text">{{ args(e.Text) }}</p>
          <p v-else class="obx-step__text" :class="{ 'obx-clamp3': !open.has(i) && long(e.Text) }">{{ e.Text }}</p>
          <button v-if="e.Kind !== 'call' && long(e.Text)" class="obx-step__more" @click="toggle(i)">{{ open.has(i) ? 'Less' : 'More' }}</button>
          <div v-if="e.Images?.length" class="obx-step__pics">
            <button v-for="file in e.Images" :key="file" class="obx-step__pic" :data-big="zoomed === `${i}/${file}` || undefined"
                    :aria-label="zoomed === `${i}/${file}` ? 'Shrink picture' : 'Enlarge picture'" @click="zoomed = zoomed === `${i}/${file}` ? null : `${i}/${file}`">
              <ObxImg :path="bloxCycleImagePath(gameId, cycleId, file)" ratio="1280 / 760" contain :alt="`${e.Tool ?? 'picture'} ${file}`" fallback="Picture gone" />
            </button>
          </div>
        </div>
      </li>
    </ol>
    <button v-if="entries.length > limitNow" class="obx-btn obx-btn--ghost obx-btn--sm" style="margin-top: 6px" @click="limitNow = entries.length">Show all {{ entries.length }} steps</button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { bloxCycleImagePath, type BloxLiveEntry } from '~/composables/useOmniBlox';
import { obxClock } from '~/scripts/omniblox/console';

/** A cycle's steps: what the agent said, each tool it called and what came back, and the pictures it looked at. */
const props = withDefaults(defineProps<{ gameId: string; cycleId: string; entries: BloxLiveEntry[]; newestFirst?: boolean; limit?: number; label?: string }>(), {
  newestFirst: false, limit: 40, label: 'Cycle steps',
});

const limitNow = ref(props.limit);
const open = ref(new Set<number>());
const zoomed = ref<string | null>(null);
watch(() => props.cycleId, () => { limitNow.value = props.limit; open.value = new Set(); zoomed.value = null; });

const ordered = computed(() => (props.newestFirst ? props.entries.slice().reverse() : props.entries));
const shown = computed(() => ordered.value.slice(0, limitNow.value));
const long = (text: string) => text.length > 320 || text.split('\n').length > 5;
function toggle(i: number) {
  const next = new Set(open.value);
  if (next.has(i)) next.delete(i); else next.add(i);
  open.value = next;
}
function glyph(e: BloxLiveEntry) {
  return e.Kind === 'text' ? '“' : e.Kind === 'call' ? '▸' : e.Kind === 'result' ? (e.Error ? '✗' : '✓') : '•';
}
/** A tool call's arguments as short "key: value" pairs (long values clipped). */
function args(json: string): string {
  try {
    const value = JSON.parse(json);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const parts = Object.keys(value).map(k => {
        const v = value[k];
        const text = typeof v === 'string' ? v : JSON.stringify(v);
        return `${k}: ${text.length > 90 ? `${text.slice(0, 90)}…` : text}`;
      });
      return parts.length ? parts.join(' · ') : '(no arguments)';
    }
  } catch { /* not JSON: show it as it came */ }
  return json.length > 400 ? `${json.slice(0, 400)}…` : json;
}
</script>
