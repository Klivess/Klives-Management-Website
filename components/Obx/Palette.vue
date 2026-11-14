<template>
  <Teleport to="body">
    <div v-if="open" class="obx-layer">
      <div class="obx-scrim" @pointerdown.self="emit('close')">
        <div class="obx-palette" role="dialog" aria-modal="true" aria-label="Go to or run" data-testid="obx-palette" @keydown="onKey">
          <div class="obx-palette__input">
            <ObxIcon name="search" />
            <input
              ref="input"
              v-model="query"
              type="text"
              placeholder="A game, a page or an action…"
              autocomplete="off"
              spellcheck="false"
              role="combobox"
              aria-expanded="true"
              aria-controls="obx-palette-list"
              :aria-activedescendant="results[selected] ? `obx-cmd-${selected}` : undefined"
              data-testid="obx-palette-input"
            />
            <span class="obx-kbd">esc</span>
          </div>
          <div id="obx-palette-list" ref="list" class="obx-palette__list" role="listbox">
            <template v-for="(command, index) in results" :key="command.id">
              <div v-if="index === 0 || results[index - 1]!.group !== command.group" class="obx-palette__group">{{ command.group }}</div>
              <button
                :id="`obx-cmd-${index}`"
                class="obx-cmd"
                role="option"
                :aria-selected="index === selected"
                :data-danger="command.danger || undefined"
                :data-testid="`cmd-${command.id}`"
                @pointermove="select(index)"
                @click="run(index)"
              >
                <ObxIcon :name="command.icon" />
                <span class="obx-cmd__title">{{ command.title }}</span>
                <span v-if="armed === command.id" class="obx-cmd__confirm">Enter again to confirm</span>
                <span v-else-if="command.hint" class="obx-cmd__hint">{{ command.hint }}</span>
              </button>
            </template>
            <div v-if="!results.length" class="obx-empty">Nothing matches “{{ query }}”.</div>
          </div>
          <footer class="obx-palette__foot">
            <span><span class="obx-kbd">↑</span> <span class="obx-kbd">↓</span> move</span>
            <span><span class="obx-kbd">↵</span> run</span>
            <span style="margin-left: auto">Switches and abandons ask twice</span>
          </footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { commandScore } from '~/scripts/adminConsole';
import type { ObxCommand } from '~/scripts/omniblox/console';

/** Everything in the studio from the keyboard: a game by a few letters of its name, a page, or an action. */
const props = defineProps<{ open: boolean; commands: ObxCommand[] }>();
const emit = defineEmits<{ close: [] }>();

const query = ref('');
const selected = ref(0);
const armed = ref<string | null>(null);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);

const results = computed<ObxCommand[]>(() => {
  const text = query.value.trim();
  if (!text) return props.commands.slice(0, 40);
  return props.commands
    // Games rank like the Admin console's services: a page or an action of the same name comes first.
    .map(command => ({ command, score: commandScore(text, { title: command.title, keywords: command.keywords, group: command.group === 'Games' ? 'Services' : 'Actions' }) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
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
  list.value?.querySelector(`#obx-cmd-${selected.value}`)?.scrollIntoView({ block: 'nearest' });
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
