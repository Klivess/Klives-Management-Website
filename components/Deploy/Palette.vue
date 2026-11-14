<template>
  <Teleport to="body">
    <div v-if="open" class="dpl-layer">
      <div class="dpl-scrim" @pointerdown.self="emit('close')">
        <div class="dpl-palette" role="dialog" aria-modal="true" aria-label="Search and run" data-testid="dpl-palette" @keydown="onKey">
          <div class="dpl-palette__input">
            <DeployIcon name="search" />
            <input
              ref="input"
              v-model="query"
              type="text"
              placeholder="A strategy to deploy, a deployment, or an action"
              autocomplete="off"
              spellcheck="false"
              role="combobox"
              aria-expanded="true"
              aria-controls="dpl-palette-list"
              :aria-activedescendant="results[selected] ? `dpl-cmd-${selected}` : undefined"
              data-testid="dpl-palette-input"
            />
            <span class="dpl-kbd">esc</span>
          </div>
          <div id="dpl-palette-list" ref="list" class="dpl-palette__list" role="listbox">
            <template v-for="(command, index) in results" :key="command.id">
              <div v-if="index === 0 || results[index - 1].group !== command.group" class="dpl-palette__group">{{ command.group }}</div>
              <button
                :id="`dpl-cmd-${index}`"
                class="dpl-cmd"
                role="option"
                :aria-selected="index === selected"
                :data-danger="command.danger || undefined"
                :data-testid="`dpl-cmd-${command.id}`"
                @pointermove="selected = index"
                @click="run(index)"
              >
                <DeployIcon :name="command.icon" />
                <span class="dpl-cmd__title">{{ command.title }}</span>
                <span v-if="command.hint" class="dpl-cmd__hint">{{ command.hint }}</span>
              </button>
            </template>
            <div v-if="!results.length" class="dpl-empty">Nothing matches “{{ query }}”.</div>
          </div>
          <footer class="dpl-palette__foot">
            <span><span class="dpl-kbd">↑</span><span class="dpl-kbd">↓</span> move</span>
            <span><span class="dpl-kbd">↵</span> run</span>
            <span style="margin-left: auto"><span class="dpl-kbd">N</span> new · <span class="dpl-kbd">R</span> refresh</span>
          </footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { scoreDeployCommand, type DeployCommand } from '~/scripts/deployConsole';

/** Everything on the page from the keyboard. The page supplies the commands; this ranks them. */
const props = defineProps<{ open: boolean; commands: DeployCommand[] }>();
const emit = defineEmits<{ close: [] }>();

const query = ref('');
const selected = ref(0);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);

const results = computed<DeployCommand[]>(() => {
  const text = query.value.trim();
  if (!text) return props.commands.filter(c => c.group !== 'Strategies').concat(props.commands.filter(c => c.group === 'Strategies').slice(0, 8)).slice(0, 40);
  return props.commands
    .map(command => ({ command, score: scoreDeployCommand(text, command) }))
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(e => e.command)
    .slice(0, 40);
});

watch(() => props.open, async open => {
  if (!open) return;
  query.value = '';
  selected.value = 0;
  await nextTick();
  input.value?.focus();
});
watch(query, () => { selected.value = 0; });

async function move(to: number) {
  if (!results.value.length) return;
  selected.value = (to + results.value.length) % results.value.length;
  await nextTick();
  list.value?.querySelector(`#dpl-cmd-${selected.value}`)?.scrollIntoView({ block: 'nearest' });
}

function run(index: number) {
  const command = results.value[index];
  if (!command) return;
  emit('close');
  void command.run();
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') { event.preventDefault(); void move(selected.value + 1); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); void move(selected.value - 1); }
  else if (event.key === 'Enter') { event.preventDefault(); run(selected.value); }
  else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close'); }
  else if (event.key === 'Tab') event.preventDefault();
}
</script>
