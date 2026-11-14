<template>
  <Teleport to="body">
    <div v-if="open" class="pfx-layer">
      <div class="pfx-scrim" @pointerdown.self="emit('close')">
        <div class="pfx-palette" role="dialog" aria-modal="true" aria-label="Find a profile or run an action" data-testid="pfx-palette" @keydown="onKey">
          <div class="pfx-palette__input">
            <PeopleIcon name="search" />
            <input
              ref="input"
              v-model="query"
              type="text"
              placeholder="A name, or what to do: “suspend”, “sign out idle”, “new”…"
              autocomplete="off"
              spellcheck="false"
              role="combobox"
              aria-expanded="true"
              aria-controls="pfx-palette-list"
              :aria-activedescendant="results[selected] ? `pfx-cmd-${selected}` : undefined"
              data-testid="pfx-palette-input"
            />
            <span class="pfx-kbd">esc</span>
          </div>
          <div id="pfx-palette-list" ref="list" class="pfx-palette__list" role="listbox">
            <template v-for="(command, index) in results" :key="command.id">
              <div v-if="index === 0 || results[index - 1].group !== command.group" class="pfx-palette__group">{{ command.group }}</div>
              <button
                :id="`pfx-cmd-${index}`"
                class="pfx-cmd"
                role="option"
                :aria-selected="index === selected"
                :data-danger="command.danger || undefined"
                :data-testid="`cmd-${command.id}`"
                @pointermove="selected = index"
                @click="run(index)"
              >
                <PeopleIcon :name="command.icon" />
                <span class="pfx-cmd__title">{{ command.title }}</span>
                <span v-if="armed === command.id" class="pfx-cmd__confirm">Enter again to confirm</span>
                <span v-else-if="command.hint" class="pfx-cmd__hint">{{ command.hint }}</span>
              </button>
            </template>
            <div v-if="!results.length" class="pfx-empty">Nothing matches “{{ query }}”.</div>
          </div>
          <footer class="pfx-palette__foot">
            <span><span class="pfx-kbd">↑</span> <span class="pfx-kbd">↓</span> move</span>
            <span><span class="pfx-kbd">↵</span> run</span>
            <span style="margin-left: auto">Anything that signs people out asks twice</span>
          </footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { scoreCommand, type ConsoleCommand } from '~/scripts/profilesConsole';

/**
 * Everything on the page from the keyboard: type part of a name to open a profile, or a verb to
 * act on one ("suspend kb", "sign out idle"). Commands marked danger need Enter twice.
 */
const props = defineProps<{ open: boolean; commands: ConsoleCommand[] }>();
const emit = defineEmits<{ close: [] }>();

const query = ref('');
const selected = ref(0);
const armed = ref<string | null>(null);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);

const results = computed(() => {
  const q = query.value.trim();
  const scored = props.commands
    .map((command, order) => ({ command, order, score: scoreCommand(q, command) }))
    .filter(entry => entry.score > 0);
  if (q) scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, 40).map(entry => entry.command);
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

function run(index: number) {
  const command = results.value[index];
  if (!command) return;
  if (command.danger && armed.value !== command.id) { armed.value = command.id; selected.value = index; return; }
  emit('close');
  void command.run();
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); return; }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const n = results.value.length;
    if (!n) return;
    selected.value = (selected.value + (event.key === 'ArrowDown' ? 1 : -1) + n) % n;
    armed.value = null;
    void nextTick(() => list.value?.querySelector(`#pfx-cmd-${selected.value}`)?.scrollIntoView({ block: 'nearest' }));
    return;
  }
  if (event.key === 'Enter') { event.preventDefault(); run(selected.value); }
}
</script>
