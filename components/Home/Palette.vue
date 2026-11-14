<template>
  <Teleport to="body">
    <div v-if="open" class="hom-layer">
      <div class="hom-scrim" @pointerdown.self="emit('close')">
        <div class="hom-palette" role="dialog" aria-modal="true" aria-label="Go to or do" data-testid="home-palette" @keydown="onKey">
          <div class="hom-palette__input">
            <HomeIcon name="search" />
            <input
              ref="input"
              v-model="query"
              type="text"
              placeholder="Go to a page, open a project, upload, resume the fleet…"
              autocomplete="off"
              spellcheck="false"
              role="combobox"
              aria-expanded="true"
              aria-controls="hom-palette-list"
              :aria-activedescendant="results[selected] ? `hom-cmd-${selected}` : undefined"
              data-testid="home-palette-input"
            />
            <span class="hom-kbd">esc</span>
          </div>
          <div id="hom-palette-list" ref="list" class="hom-palette__list" role="listbox">
            <template v-for="(command, index) in results" :key="command.id">
              <div v-if="!query && (index === 0 || results[index - 1].group !== command.group)" class="hom-palette__group">{{ command.group }}</div>
              <button
                :id="`hom-cmd-${index}`"
                class="hom-cmd"
                role="option"
                :aria-selected="index === selected"
                :data-danger="command.danger || undefined"
                :data-testid="`cmd-${command.id}`"
                @pointermove="select(index)"
                @click="run(index)"
              >
                <HomeIcon :name="command.icon" />
                <span class="hom-cmd__title">{{ command.title }}</span>
                <span v-if="armed === command.id" class="hom-cmd__confirm">Enter again to confirm</span>
                <span v-else-if="command.hint || query" class="hom-cmd__hint">{{ command.hint || command.group }}</span>
              </button>
            </template>
            <div v-if="!results.length" class="hom-empty">Nothing matches “{{ query }}”.</div>
          </div>
          <footer class="hom-palette__foot">
            <span><span class="hom-kbd">↑</span><span class="hom-kbd">↓</span> move</span>
            <span><span class="hom-kbd">↵</span> run</span>
            <span style="margin-left: auto">Anything that stops or starts work asks twice</span>
          </footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { commandScore } from '~/scripts/adminConsole';
import type { HomeCommand } from '~/scripts/home';

/* Every page and action from the keyboard. Groups that would bury the rest (projects, services) appear once something is typed. */
const props = defineProps<{ open: boolean; commands: HomeCommand[] }>();
const emit = defineEmits<{ close: [] }>();

const TYPED_ONLY = new Set(['Projects', 'Services']);
const query = ref('');
const selected = ref(0);
const armed = ref<string | null>(null);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);

const results = computed<HomeCommand[]>(() => {
  const text = query.value.trim();
  if (!text) return props.commands.filter(command => !TYPED_ONLY.has(command.group));
  return props.commands
    // Specific items (a project, a service) rank like Admin's per-service entries: below pages and actions.
    .map(command => ({ command, score: commandScore(text, { title: command.title, keywords: command.keywords, group: TYPED_ONLY.has(command.group) ? 'Services' : 'Actions' }) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
    .map(entry => entry.command);
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
  list.value?.querySelector(`#hom-cmd-${selected.value}`)?.scrollIntoView({ block: 'nearest' });
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
