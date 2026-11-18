<!--
  The page's time window: presets, a custom range, zoom in and out, pan, back to the last window,
  the bucket width, and a navigator strip over the whole kept history. Drag across the strip (or any
  chart) to zoom to that span; click the strip to move the window there.
-->
<template>
  <div class="llx-timebar" data-testid="llx-timebar">
    <div class="llx-seg" role="group" aria-label="Window">
      <button v-for="p in LLM_PRESETS" :key="p" class="llx-seg__opt" :aria-pressed="!isCustom && window.range === p" :data-testid="`range-${p}`" @click="$emit('preset', p)">{{ p }}</button>
      <button class="llx-seg__opt" :aria-pressed="isCustom" @click="customOpen = !customOpen">Custom</button>
    </div>
    <div class="llx-timebar__tools">
      <button class="llx-iconbtn" title="Earlier (←)" aria-label="Move the window earlier" @click="$emit('pan', -1)"><LlmIcon name="arrow-left" /></button>
      <button class="llx-iconbtn" title="Zoom out (−)" aria-label="Zoom out" data-testid="zoom-out" @click="$emit('zoomOut')"><LlmIcon name="zoom-out" /></button>
      <button class="llx-iconbtn" title="Zoom in (+)" aria-label="Zoom in" data-testid="zoom-in" @click="$emit('zoomIn')"><LlmIcon name="zoom-in" /></button>
      <button class="llx-iconbtn" title="Later (→)" aria-label="Move the window later" :disabled="atNow" @click="$emit('pan', 1)"><LlmIcon name="arrow-right" /></button>
      <button class="llx-iconbtn" title="Back to the last window (Backspace)" aria-label="Back to the last window" :disabled="!canBack" data-testid="zoom-back" @click="$emit('back')"><LlmIcon name="undo" /></button>
    </div>
    <span class="llx-timebar__label llx-num" data-testid="window-label">{{ label }}</span>
    <span class="llx-timebar__spacer"></span>
    <label class="llx-field llx-field--inline">
      <span>Bucket</span>
      <select class="llx-select" :value="bucket" aria-label="Bucket width" @change="$emit('bucket', ($event.target as HTMLSelectElement).value)">
        <option v-for="b in LLM_BUCKETS" :key="b" :value="b">{{ b === 'auto' ? `auto${autoBucket ? ` (${autoBucket})` : ''}` : b }}</option>
      </select>
    </label>

    <div v-if="customOpen" class="llx-timebar__custom">
      <label class="llx-field llx-field--inline"><span>From</span><input v-model="fromText" type="datetime-local" class="llx-input" /></label>
      <label class="llx-field llx-field--inline"><span>To</span><input v-model="toText" type="datetime-local" class="llx-input" /></label>
      <button class="llx-btn llx-btn--sm" :disabled="!customValid" @click="applyCustom">Show</button>
    </div>

    <div v-if="navigator.length > 1" ref="strip" class="llx-nav" role="slider" tabindex="0" aria-label="History: drag to choose a window"
         :aria-valuetext="label" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="drag = null">
      <svg :viewBox="`0 0 ${navigator.length} 24`" preserveAspectRatio="none">
        <rect v-for="(v, i) in navigator" :key="i" :x="i + 0.1" :y="24 - barH(v)" width="0.8" :height="barH(v)" />
      </svg>
      <span class="llx-nav__window" :style="windowStyle"></span>
      <span v-if="drag && drag.moved" class="llx-nav__drag" :style="dragStyle"></span>
      <span class="llx-nav__edge llx-nav__edge--l llx-num">{{ edgeFrom }}</span>
      <span class="llx-nav__edge llx-nav__edge--r llx-num">now</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { LLM_BUCKETS, LLM_PRESETS, describeWindow, windowBounds, type LlmWindow } from '~/scripts/kliveLlm';

const props = defineProps<{
  window: LlmWindow;
  bucket: string;
  now: number;
  canBack: boolean;
  autoBucket?: string;
  /** Calls per day (or another unit) over the kept history, oldest first. */
  navigator: number[];
  navigatorFrom: number;
  navigatorStep: number;
}>();
const emit = defineEmits<{ preset: [range: string]; custom: [from: number, to: number]; zoomIn: []; zoomOut: []; pan: [direction: -1 | 1]; back: []; bucket: [value: string] }>();

const isCustom = computed(() => props.window.from != null && props.window.to != null);
const label = computed(() => describeWindow(props.window, props.now));
const atNow = computed(() => !isCustom.value || Math.abs((props.window.to ?? 0) - props.now) < 90_000);

const customOpen = ref(false);
const toLocal = (ms: number) => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16); };
const fromText = ref('');
const toText = ref('');
watch(customOpen, open => {
  if (!open) return;
  const b = windowBounds(props.window, props.now);
  fromText.value = toLocal(b.from);
  toText.value = toLocal(b.to);
});
const customValid = computed(() => {
  const f = new Date(fromText.value).getTime(), t = new Date(toText.value).getTime();
  return Number.isFinite(f) && Number.isFinite(t) && t > f;
});
function applyCustom() {
  emit('custom', new Date(fromText.value).getTime(), new Date(toText.value).getTime());
  customOpen.value = false;
}

// ── navigator ──
const strip = ref<HTMLElement | null>(null);
const navMax = computed(() => Math.max(1, ...props.navigator));
const barH = (v: number) => (v > 0 ? Math.max(1.5, (v / navMax.value) * 22) : 0);
const navTo = computed(() => props.navigatorFrom + props.navigator.length * props.navigatorStep);
function fraction(ms: number) {
  return Math.min(1, Math.max(0, (ms - props.navigatorFrom) / Math.max(1, navTo.value - props.navigatorFrom)));
}
const windowStyle = computed(() => {
  const b = windowBounds(props.window, props.now);
  const l = fraction(b.from), r = fraction(b.to);
  return { left: `${l * 100}%`, width: `${Math.max(0.6, (r - l) * 100)}%` };
});
const edgeFrom = computed(() => new Date(props.navigatorFrom).toLocaleDateString([], { day: 'numeric', month: 'short' }));

const drag = ref<{ a: number; b: number; moved: boolean } | null>(null);
const dragStyle = computed(() => drag.value ? { left: `${Math.min(drag.value.a, drag.value.b) * 100}%`, width: `${Math.abs(drag.value.b - drag.value.a) * 100}%` } : {});
function at(e: PointerEvent) {
  const rect = strip.value!.getBoundingClientRect();
  return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
}
function onDown(e: PointerEvent) {
  if (e.button !== 0 || !strip.value) return;
  const f = at(e);
  drag.value = { a: f, b: f, moved: false };
  strip.value.setPointerCapture(e.pointerId);
}
function onMove(e: PointerEvent) {
  if (!drag.value) return;
  drag.value.b = at(e);
  if (Math.abs(drag.value.b - drag.value.a) > 0.01) drag.value.moved = true;
}
function onUp(e: PointerEvent) {
  const d = drag.value;
  drag.value = null;
  if (!d) return;
  const span = navTo.value - props.navigatorFrom;
  const ms = (f: number) => props.navigatorFrom + f * span;
  if (d.moved) {
    emit('custom', Math.round(ms(Math.min(d.a, d.b))), Math.round(Math.min(props.now, ms(Math.max(d.a, d.b)))));
    return;
  }
  // A click centres the current span on that point.
  const b = windowBounds(props.window, props.now);
  const width = b.to - b.from;
  let to = Math.min(props.now, ms(at(e)) + width / 2);
  emit('custom', Math.round(to - width), Math.round(to));
}
</script>
