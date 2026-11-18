<template>
  <Teleport to="body">
    <div v-if="open" class="ktx-layer">
      <div class="ktx-scrim ktx-scrim--top" @pointerdown.self="emit('close')">
        <div class="ktx-palette" role="dialog" aria-modal="true" aria-label="Search and run" data-testid="ktx-palette" @keydown="onKey">
          <div class="ktx-palette__input">
            <TechIcon name="search" />
            <input
              ref="input"
              v-model="query"
              type="text"
              placeholder="A gadget, an action (“light on”), a stream…"
              autocomplete="off"
              spellcheck="false"
              role="combobox"
              aria-expanded="true"
              aria-controls="ktx-palette-list"
              :aria-activedescendant="results[selected] ? `ktx-cmd-${selected}` : undefined"
              data-testid="ktx-palette-input"
            />
            <span class="ktx-kbd">esc</span>
          </div>
          <div id="ktx-palette-list" ref="list" class="ktx-palette__list" role="listbox">
            <template v-for="(command, index) in results" :key="command.id">
              <div v-if="index === 0 || results[index - 1].group !== command.group" class="ktx-palette__group">{{ command.group }}</div>
              <button
                :id="`ktx-cmd-${index}`"
                class="ktx-cmd"
                role="option"
                :aria-selected="index === selected"
                :data-danger="command.danger || undefined"
                :data-testid="`cmd-${command.id}`"
                @pointermove="select(index)"
                @click="run(index)"
              >
                <TechIcon :name="command.icon" />
                <span class="ktx-cmd__title">{{ command.title }}</span>
                <span v-if="armed === command.id" class="ktx-cmd__confirm">Enter again to confirm</span>
                <span v-else-if="command.hint" class="ktx-cmd__hint">{{ command.hint }}</span>
              </button>
            </template>
            <div v-if="!results.length" class="ktx-empty">Nothing matches “{{ query }}”.</div>
          </div>
          <footer class="ktx-palette__foot">
            <span><span class="ktx-kbd">↑</span><span class="ktx-kbd">↓</span> move</span>
            <span><span class="ktx-kbd">↵</span> run</span>
            <span style="margin-left: auto">Flashing and forgetting ask twice</span>
          </footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { scoreCommand, type TechCommand } from '~/scripts/kliveTech';

/** Everything on the page from the keyboard: open a gadget, run its action, jump to a tab. */
const props = defineProps<{ open: boolean; commands: TechCommand[] }>();
const emit = defineEmits<{ close: [] }>();

const query = ref('');
const selected = ref(0);
const armed = ref<string | null>(null);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);

const results = computed<TechCommand[]>(() => {
  const text = query.value.trim();
  if (!text) return props.commands.slice(0, 40);
  return props.commands
    .map((command, order) => ({ command, order, score: scoreCommand(text, command) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(entry => entry.command)
    .slice(0, 40);
});

watch(() => props.open, async open => {
  if (!open) return;
  query.value = '';
  selected.value = 0;
  armed.value = null;
  await nextTick();
  input.value?.focus();
});
watch(query, () => { selected.value = 0; armed.value = null; });

function select(index: number) {
  if (selected.value === index) return;
  selected.value = index;
  armed.value = null;
}

async function move(to: number) {
  if (!results.value.length) return;
  selected.value = (to + results.value.length) % results.value.length;
  armed.value = null;
  await nextTick();
  list.value?.querySelector(`#ktx-cmd-${selected.value}`)?.scrollIntoView({ block: 'nearest' });
}

function run(index: number) {
  const command = results.value[index];
  if (!command) return;
  if (command.danger && armed.value !== command.id) {
    selected.value = index;
    armed.value = command.id;
    return;
  }
  emit('close');
  void command.run();
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') { event.preventDefault(); void move(selected.value + 1); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); void move(selected.value - 1); }
  else if (event.key === 'Enter') { event.preventDefault(); run(selected.value); }
  else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (armed.value) armed.value = null; else emit('close');
  } else if (event.key === 'Tab') event.preventDefault();
}
</script>
