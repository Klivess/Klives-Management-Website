<template>
  <Teleport to="body">
    <div v-if="open" class="twx-layer twx-scrim twx-scrim--top" @mousedown.self="emit('close')">
      <div class="twx-palette" role="dialog" aria-modal="true" aria-label="Find a tripwire or an action" data-testid="twx-palette">
        <div class="twx-palette__input">
          <TripwiresIcon name="search" />
          <input ref="input" v-model="query" placeholder="Find a tripwire, copy a link, pause, export…" aria-label="Search"
            @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="run(results[cursor])" @keydown.esc.prevent="emit('close')" />
          <span class="twx-kbd">Esc</span>
        </div>
        <ul class="twx-palette__list" role="listbox">
          <li v-for="(command, i) in results" :key="command.id" role="option" :aria-selected="i === cursor"
            :class="{ 'twx-palette__item--on': i === cursor }" class="twx-palette__item" @mousemove="cursor = i" @click="run(command)">
            <span class="twx-palette__group">{{ command.group }}</span>
            <span class="twx-truncate">{{ command.title }}</span>
            <span v-if="command.hint" class="twx-kbd">{{ command.hint }}</span>
          </li>
          <li v-if="!results.length" class="twx-palette__none">Nothing matches.</li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { commandScore, type TwCommand } from '~/scripts/tripwires';

const props = defineProps<{ open: boolean; commands: TwCommand[] }>();
const emit = defineEmits<{ close: [] }>();
const query = ref('');
const cursor = ref(0);
const input = ref<HTMLInputElement | null>(null);

const results = computed(() => props.commands
  .map(command => ({ command, score: commandScore(query.value, command) }))
  .filter(x => x.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 12)
  .map(x => x.command));

watch(query, () => { cursor.value = 0; });
watch(() => props.open, open => {
  if (!open) return;
  query.value = '';
  cursor.value = 0;
  void nextTick(() => input.value?.focus());
});

function move(by: number) {
  const n = results.value.length;
  if (n) cursor.value = (cursor.value + by + n) % n;
}

function run(command: TwCommand | undefined) {
  if (!command) return;
  emit('close');
  void command.run();
}
</script>
