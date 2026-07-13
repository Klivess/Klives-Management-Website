<template>
  <div class="route-list">
    <div class="route-heading">
      <div>
        <span class="route-label">{{ label }}</span>
        <span class="route-hint">Preferred first; failures advance downward.</span>
      </div>
      <button type="button" class="route-add" @click="add">+ Add route</button>
    </div>
    <div v-for="(route, index) in modelValue" :key="index" class="route-row">
      <span class="route-rank">{{ index === 0 ? 'Primary' : `Fallback ${index}` }}</span>
      <input
        :value="route"
        class="route-input"
        :class="{ invalid: !route.trim() }"
        :placeholder="index === 0 ? placeholder : 'provider/model'"
        :aria-label="`${label} ${index === 0 ? 'primary' : `fallback ${index}`}`"
        @input="onInput(index, $event)"
      />
      <div class="route-buttons">
        <button type="button" title="Move up" :disabled="index === 0" @click="move(index, -1)">↑</button>
        <button type="button" title="Move down" :disabled="index === modelValue.length - 1" @click="move(index, 1)">↓</button>
        <button type="button" title="Remove route" :disabled="modelValue.length === 1" @click="remove(index)">×</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue: string[]; label: string; placeholder: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();

function set(index: number, value: string) {
  const next = [...props.modelValue];
  next[index] = value;
  emit('update:modelValue', next);
}
function onInput(index: number, event: Event) { set(index, (event.target as HTMLInputElement).value); }
function add() { emit('update:modelValue', [...props.modelValue, '']); }
function remove(index: number) {
  if (props.modelValue.length <= 1) return;
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index));
}
function move(index: number, direction: number) {
  const target = index + direction;
  if (target < 0 || target >= props.modelValue.length) return;
  const next = [...props.modelValue];
  [next[index], next[target]] = [next[target], next[index]];
  emit('update:modelValue', next);
}
</script>

<style scoped>
.route-list { padding: 10px 0 12px; border-bottom: 1px solid #28282d; }
.route-list:last-child { border-bottom: none; }
.route-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 7px; }
.route-heading > div { display: flex; flex-direction: column; }
.route-label { font-size: 13px; color: #ccc; }
.route-hint { font-size: 10px; color: #666; }
.route-add { border: 1px solid #3b6334; background: #1b281a; color: #82c777; border-radius: 5px; padding: 5px 9px; cursor: pointer; font-size: 11px; }
.route-row { display: grid; grid-template-columns: 72px minmax(180px, 1fr) auto; align-items: center; gap: 8px; margin-top: 6px; }
.route-rank { color: #777; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
.route-input { width: 100%; box-sizing: border-box; background: #14141a; color: #eee; border: 1px solid #333; border-radius: 6px; padding: 8px 10px; font-size: 12px; font-family: ui-monospace, monospace; }
.route-input:focus { outline: none; border-color: #4d9e39; }
.route-input.invalid { border-color: #9a4d42; }
.route-buttons { display: flex; gap: 3px; }
.route-buttons button { width: 27px; height: 28px; border: 1px solid #35353b; border-radius: 4px; background: #222228; color: #aaa; cursor: pointer; }
.route-buttons button:disabled { opacity: .28; cursor: default; }
@media (max-width: 620px) { .route-row { grid-template-columns: 1fr auto; } .route-rank { grid-column: 1 / -1; } }
</style>
