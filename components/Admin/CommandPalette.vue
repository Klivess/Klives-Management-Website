<template>
  <Teleport to="body">
    <div v-if="open" class="adm-layer">
      <div class="adm-scrim" @pointerdown.self="emit('close')">
        <div class="adm-palette" role="dialog" aria-modal="true" aria-label="Search and run" data-testid="adm-palette" @keydown="onKey">
          <div class="adm-palette__input">
            <AdminIcon name="search" />
            <input
              ref="input"
              v-model="query"
              type="text"
              placeholder="Go to a tool, or restart a service…"
              autocomplete="off"
              spellcheck="false"
              role="combobox"
              aria-expanded="true"
              aria-controls="adm-palette-list"
              :aria-activedescendant="results[selected] ? `adm-cmd-${selected}` : undefined"
              data-testid="adm-palette-input"
            />
            <span class="adm-kbd">esc</span>
          </div>

          <div id="adm-palette-list" ref="list" class="adm-palette__list" role="listbox">
            <template v-for="(command, index) in results" :key="command.id">
              <div v-if="!query && (index === 0 || results[index - 1].group !== command.group)" class="adm-palette__group">{{ command.group }}</div>
              <button
                :id="`adm-cmd-${index}`"
                class="adm-cmd"
                role="option"
                :aria-selected="index === selected"
                :data-danger="command.danger || undefined"
                :data-testid="`cmd-${command.id}`"
                @pointermove="select(index)"
                @click="run(index)"
              >
                <AdminIcon :name="command.icon" />
                <span class="adm-cmd__title">{{ command.title }}</span>
                <span v-if="armed === command.id" class="adm-cmd__confirm">Press Enter again to confirm</span>
                <span v-else-if="command.hint || query" class="adm-cmd__hint">{{ command.hint || command.group }}</span>
              </button>
            </template>
            <div v-if="!results.length" class="adm-empty">Nothing matches “{{ query }}”.</div>
          </div>

          <footer class="adm-palette__foot">
            <span><span class="adm-kbd">↑</span><span class="adm-kbd">↓</span> move</span>
            <span><span class="adm-kbd">↵</span> run</span>
            <span style="margin-left: auto">Restarts and updates ask twice</span>
          </footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { commandScore, type AdminCommand } from '~/scripts/adminConsole';

/*
 * Everything the page can do, from the keyboard: type a few letters of a tool or a service and
 * press Enter. Anything that interrupts something needs Enter twice, so a slip costs nothing.
 */
const props = defineProps<{ open: boolean; commands: AdminCommand[] }>();
const emit = defineEmits<{ close: [] }>();

const query = ref('');
const selected = ref(0);
const armed = ref<string | null>(null);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);

const results = computed<AdminCommand[]>(() => {
  const text = query.value.trim();
  // Unprompted, the per-service commands would bury the rest: they appear once something is typed.
  if (!text) return props.commands.filter(command => command.group !== 'Services');
  return props.commands
    .map(command => ({ command, score: commandScore(text, command) }))
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
  list.value?.querySelector(`#adm-cmd-${selected.value}`)?.scrollIntoView({ block: 'nearest' });
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
  else if (event.key === 'Home') { event.preventDefault(); void move(0); }
  else if (event.key === 'End') { event.preventDefault(); void move(results.value.length - 1); }
  else if (event.key === 'Enter') { event.preventDefault(); run(selected.value); }
  else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (armed.value) armed.value = null;
    else emit('close');
  } else if (event.key === 'Tab') {
    // One control: keep focus on the input.
    event.preventDefault();
  }
}
</script>
