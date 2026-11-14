<template>
  <Teleport to="body">
    <div v-if="open" class="msx-layer">
      <div class="msx-scrim" @click="$emit('close')"></div>
      <div class="msx-palette" role="dialog" aria-modal="true" aria-label="Find and run" data-testid="msx-palette" @keydown="onKey">
        <label class="msx-palette__input">
          <MemeIcon name="search" />
          <input ref="input" v-model="query" placeholder="A source, a reel caption, or an action…" aria-label="Search" aria-controls="msx-palette-list" data-testid="palette-input" />
          <span class="msx-kbd">Esc</span>
        </label>
        <div id="msx-palette-list" class="msx-palette__list" role="listbox">
          <template v-for="group in groups" :key="group.name">
            <div class="msx-palette__group">{{ group.name }}</div>
            <button v-for="item in group.items" :key="item.id" class="msx-palette__item" type="button" role="option"
                    :aria-selected="flat[active]?.id === item.id" :data-danger="item.danger || undefined" @mouseenter="active = flat.indexOf(item)" @click="run(item)">
              <MemeIcon :name="item.icon ?? 'chevron-right'" />
              <span class="msx-truncate">{{ item.title }}</span>
              <span v-if="item.hint" class="msx-palette__hint">{{ item.hint }}</span>
            </button>
          </template>
          <div v-if="!flat.length" class="msx-empty">Nothing matches “{{ query }}”.</div>
        </div>
        <div class="msx-palette__foot"><span><span class="msx-kbd">↑</span> <span class="msx-kbd">↓</span> move</span><span><span class="msx-kbd">Enter</span> run</span><span><span class="msx-kbd">1</span>–<span class="msx-kbd">4</span> views · <span class="msx-kbd">R</span> refresh · <span class="msx-kbd">/</span> search</span></div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { msRankCommands, type MsCommand } from '~/scripts/memeConsole';

const props = defineProps<{ open: boolean; commands: (query: string) => MsCommand[] }>();
const emit = defineEmits<{ close: [] }>();
const query = ref('');
const active = ref(0);
const input = ref<HTMLInputElement | null>(null);

// Grouped in the order the best match of each group ranks; arrows move through them as shown.
const groups = computed(() => {
  const map = new Map<string, MsCommand[]>();
  for (const item of msRankCommands(props.commands(query.value), query.value, 40)) {
    if (!map.has(item.group)) map.set(item.group, []);
    map.get(item.group)!.push(item);
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }));
});
const flat = computed(() => groups.value.flatMap(g => g.items));

watch(() => props.open, async open => {
  if (!open) return;
  query.value = '';
  active.value = 0;
  await nextTick();
  input.value?.focus();
});
watch(query, () => { active.value = 0; });

function run(item: MsCommand) {
  emit('close');
  item.run();
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close'); }
  else if (event.key === 'ArrowDown') { event.preventDefault(); active.value = Math.min(flat.value.length - 1, active.value + 1); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); active.value = Math.max(0, active.value - 1); }
  else if (event.key === 'Enter') { event.preventDefault(); const item = flat.value[active.value]; if (item) run(item); }
}
</script>
