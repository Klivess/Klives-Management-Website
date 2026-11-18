<template>
  <Teleport to="body">
    <div v-if="open" class="kax-layer">
      <div class="kax-scrim" @pointerdown.self="emit('close')">
        <div class="kax-palette" role="dialog" aria-modal="true" aria-label="Search and run" data-testid="kax-palette" @keydown="onKey">
          <div class="kax-palette__input">
            <KliveAgentIcon name="search" />
            <input
              ref="input"
              v-model="query"
              type="text"
              placeholder="A conversation, a memory, or an action…"
              autocomplete="off"
              spellcheck="false"
              role="combobox"
              aria-expanded="true"
              aria-controls="kax-palette-list"
              :aria-activedescendant="results[selected] ? `kax-cmd-${selected}` : undefined"
              data-testid="kax-palette-input"
            />
            <span class="kax-kbd">esc</span>
          </div>
          <div id="kax-palette-list" ref="list" class="kax-palette__list" role="listbox">
            <template v-for="(command, index) in results" :key="command.id">
              <div v-if="index === 0 || results[index - 1].group !== command.group" class="kax-palette__group">{{ command.group }}</div>
              <button
                :id="`kax-cmd-${index}`"
                class="kax-cmd"
                type="button"
                role="option"
                :aria-selected="index === selected"
                :data-danger="command.danger || undefined"
                :data-testid="`cmd-${command.id}`"
                @pointermove="select(index)"
                @click="run(index)"
              >
                <KliveAgentIcon :name="command.icon" />
                <span class="kax-cmd__title">{{ command.title }}</span>
                <span v-if="armed === command.id" class="kax-cmd__confirm">Enter again to confirm</span>
                <span v-else-if="command.hint" class="kax-cmd__hint">{{ command.hint }}</span>
              </button>
            </template>
            <div v-if="!results.length" class="kax-empty">Nothing matches “{{ query }}”.</div>
          </div>
          <footer class="kax-palette__foot">
            <span><span class="kax-kbd">↑</span> <span class="kax-kbd">↓</span> move</span>
            <span><span class="kax-kbd">↵</span> run</span>
            <span style="margin-left: auto">Cancelling asks twice</span>
          </footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { scoreAgentCommand, type AgentCommand } from '~/scripts/agentConsole';
import KliveAgentIcon from '~/components/KliveAgent/Icon.vue';

/** Everything on the page from the keyboard. The page supplies the commands, including matching conversations. */
const props = defineProps<{ open: boolean; commands: (query: string) => AgentCommand[] }>();
const emit = defineEmits<{ close: [] }>();

const query = ref('');
const selected = ref(0);
const armed = ref<string | null>(null);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);

const results = computed<AgentCommand[]>(() => {
  const text = query.value.trim();
  const all = props.commands(text);
  if (!text) return all.filter(command => command.group !== 'Conversations' || all.indexOf(command) < 40).slice(0, 40);
  const ranked = all
    .map(command => ({ command, score: scoreAgentCommand(text, command) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.command)
    .slice(0, 40);
  // Groups stay together, in the order of their best match, so a heading is never shown twice.
  const order: string[] = [];
  ranked.forEach(command => { if (!order.includes(command.group)) order.push(command.group); });
  return order.flatMap(group => ranked.filter(command => command.group === group));
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
  list.value?.querySelector(`#kax-cmd-${selected.value}`)?.scrollIntoView({ block: 'nearest' });
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
