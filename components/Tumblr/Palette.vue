<template>
  <Teleport to="body">
    <div v-if="open" class="tmb-layer">
      <div class="tmb-scrim" @pointerdown.self="emit('close')">
        <div class="tmb-palette" role="dialog" aria-modal="true" aria-label="Find and run" data-testid="tmb-palette" @keydown="onKey">
          <div class="tmb-palette__input">
            <TumblrIcon name="search" />
            <input ref="input" v-model="query" type="text" placeholder="A blog, a caption, a tag… or an action" autocomplete="off" spellcheck="false"
                   role="combobox" aria-expanded="true" aria-controls="tmb-palette-list" :aria-activedescendant="results[selected] ? `tmb-cmd-${selected}` : undefined"
                   data-testid="tmb-palette-input" />
            <span class="tmb-kbd">esc</span>
          </div>
          <div id="tmb-palette-list" ref="list" class="tmb-palette__list" role="listbox">
            <template v-for="(command, index) in results" :key="command.id">
              <div v-if="index === 0 || results[index - 1].group !== command.group" class="tmb-palette__group">{{ command.group }}</div>
              <button :id="`tmb-cmd-${index}`" class="tmb-cmd" role="option" :aria-selected="index === selected" :data-danger="command.danger || undefined"
                      :data-testid="`cmd-${command.id}`" @pointermove="select(index)" @click="run(index)">
                <TumblrIcon :name="command.icon" />
                <span class="tmb-cmd__title">{{ command.title }}</span>
                <span v-if="armed === command.id" class="tmb-cmd__hint" style="color: var(--tmb-crit)">Enter again to confirm</span>
                <span v-else-if="command.hint" class="tmb-cmd__hint">{{ command.hint }}</span>
              </button>
            </template>
            <div v-if="!results.length" class="tmb-empty">Nothing matches “{{ query }}”.</div>
          </div>
          <footer class="tmb-palette__foot">
            <span><span class="tmb-kbd">↑</span> <span class="tmb-kbd">↓</span> move</span>
            <span><span class="tmb-kbd">↵</span> run</span>
            <span style="margin-left: auto">Anything that can't be undone asks twice</span>
          </footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { tmbScore, type TmbCommand } from '~/scripts/tumblrConsole';

/** Everything on the page from the keyboard. The page supplies the commands, including matching blogs and posts. */
const props = defineProps<{ open: boolean; commands: (query: string) => TmbCommand[] }>();
const emit = defineEmits<{ close: [] }>();

const query = ref('');
const selected = ref(0);
const armed = ref<string | null>(null);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);

const results = computed<TmbCommand[]>(() => {
  const text = query.value.trim();
  const all = props.commands(text);
  if (!text) return all.filter(c => c.group !== 'Posts').slice(0, 40);
  return all
    .map(command => ({ command, score: command.group === 'Posts' ? 25 : tmbScore(text, command) }))
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
  list.value?.querySelector(`#tmb-cmd-${selected.value}`)?.scrollIntoView({ block: 'nearest' });
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
  else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (armed.value) armed.value = null; else emit('close'); }
  else if (event.key === 'Tab') event.preventDefault();
}
</script>
