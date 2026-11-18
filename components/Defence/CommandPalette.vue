<template>
  <Teleport to="body">
    <div v-if="open" class="odx-layer">
      <div class="odx-scrim" @pointerdown.self="emit('close')">
        <div class="odx-palette" role="dialog" aria-modal="true" aria-label="Search and run" data-testid="odx-palette" @keydown="onKey">
          <div class="odx-palette__input">
            <DefenceIcon name="search" />
            <input
              ref="input"
              v-model="query"
              type="text"
              placeholder="An address, a place, a network… or an action"
              autocomplete="off"
              spellcheck="false"
              role="combobox"
              aria-expanded="true"
              aria-controls="odx-palette-list"
              :aria-activedescendant="results[selected] ? `odx-cmd-${selected}` : undefined"
              data-testid="odx-palette-input"
            />
            <span class="odx-kbd">esc</span>
          </div>
          <div id="odx-palette-list" ref="list" class="odx-palette__list" role="listbox">
            <template v-for="(command, index) in results" :key="command.id">
              <div v-if="index === 0 || results[index - 1].group !== command.group" class="odx-palette__group">{{ command.group }}</div>
              <button
                :id="`odx-cmd-${index}`"
                class="odx-cmd"
                role="option"
                :aria-selected="index === selected"
                :data-danger="command.danger || undefined"
                :data-testid="`cmd-${command.id}`"
                @pointermove="select(index)"
                @click="run(index)"
              >
                <DefenceIcon :name="command.icon" />
                <span class="odx-cmd__title">{{ command.title }}</span>
                <span v-if="armed === command.id" class="odx-cmd__confirm">Enter again to confirm</span>
                <span v-else-if="command.hint" class="odx-cmd__hint">{{ command.hint }}</span>
              </button>
            </template>
            <div v-if="!results.length" class="odx-empty">Nothing matches “{{ query }}”.</div>
          </div>
          <footer class="odx-palette__foot">
            <span><span class="odx-kbd">↑</span><span class="odx-kbd">↓</span> move</span>
            <span><span class="odx-kbd">↵</span> run</span>
            <span style="margin-left: auto">Blocks ask twice</span>
          </footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { scoreCommand, type DefenceCommand } from '~/scripts/omniDefence';

/**
 * Everything on the page from the keyboard: type part of an address to open it, or a few letters of
 * an action. The page supplies the commands (including the matching addresses) for what is typed.
 */
const props = defineProps<{ open: boolean; commands: (query: string) => DefenceCommand[] }>();
const emit = defineEmits<{ close: [] }>();

const query = ref('');
const selected = ref(0);
const armed = ref<string | null>(null);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);

const results = computed<DefenceCommand[]>(() => {
  const text = query.value.trim();
  const all = props.commands(text);
  if (!text) return all.filter(command => command.group !== 'Addresses').slice(0, 40);
  // Addresses come pre-ranked by the page; everything else is scored against what was typed.
  const addresses = all.filter(command => command.group === 'Addresses');
  const rest = all
    .filter(command => command.group !== 'Addresses')
    .map(command => ({ command, score: scoreCommand(text, command) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.command);
  return [...addresses.slice(0, 8), ...rest].slice(0, 40);
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
  list.value?.querySelector(`#odx-cmd-${selected.value}`)?.scrollIntoView({ block: 'nearest' });
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
