<template>
  <div ref="root" class="adm-uptime" :style="{ '--strip-h': `${height}px` }" @pointerleave="hover = null">
    <div v-if="view.blocks.length" class="adm-uptime__track" role="img" :aria-label="summary">
      <span
        v-for="(block, index) in view.blocks"
        :key="`${block.start}-${index}`"
        class="adm-uptime__seg"
        :data-up="block.up"
        :style="{ flexGrow: Math.max(block.end - block.start, 1), flexBasis: '0px' }"
        @pointerenter="show($event, block)"
        @pointermove="show($event, block)"
      ></span>
    </div>
    <div v-else class="adm-uptime__empty"></div>

    <div v-if="axis && view.blocks.length" class="adm-uptime__axis">
      <span>{{ fmtClock(view.windowStart) }}</span>
      <span>now</span>
    </div>

    <span v-if="hover" class="adm-tip" :style="{ left: `${hover.x}px`, top: '0' }">
      <b>{{ hover.block.up ? 'Online' : 'Down' }}</b>
      {{ fmtDuration((hover.block.end - hover.block.start) / 1000) }}
      <span>{{ fmtClock(hover.block.start) }} → {{ hover.block.end >= view.windowEnd ? 'now' : fmtClock(hover.block.end) }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { fmtClock, fmtDuration, type UptimeBlock, type UptimeView } from '~/scripts/adminConsole';

/*
 * The window as one bar: green while the process was up, red for each gap. A gap is never drawn
 * thinner than 3px, since a 40-second restart on a 30-day bar would otherwise vanish, and the
 * outages are what this is for. The exact times are in the readout.
 */
const props = withDefaults(defineProps<{ view: UptimeView; height?: number; axis?: boolean }>(), { height: 22, axis: false });

const root = ref<HTMLElement | null>(null);
const hover = ref<{ x: number; block: UptimeBlock } | null>(null);

function show(event: PointerEvent, block: UptimeBlock) {
  if (!root.value) return;
  const bounds = root.value.getBoundingClientRect();
  const x = Math.min(bounds.width - 96, Math.max(96, event.clientX - bounds.left));
  hover.value = { x, block };
}

const summary = computed(() => {
  const view = props.view;
  if (view.availability == null) return 'No uptime history';
  return `Up ${view.availability.toFixed(2)}% of the window, ${view.restarts} restart${view.restarts === 1 ? '' : 's'}, ${fmtDuration(view.downMs / 1000)} down in total`;
});
</script>
