<!-- Ctrl+K: go anywhere on the page, or run an action, by typing a few letters of it. -->
<template>
  <Teleport to="body">
    <div v-if="open" class="llx-layer">
      <div class="llx-scrim" @click="$emit('close')"></div>
      <div class="llx-palette" role="dialog" aria-modal="true" aria-label="Search and run" data-testid="llx-palette">
        <div class="llx-palette__search">
          <LlmIcon name="search" />
          <input ref="input" v-model="query" class="llx-palette__input" placeholder="A service, a router, a tab, an action…" aria-label="Search"
                 @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="choose(active)" @keydown.esc.prevent="$emit('close')" />
          <span class="llx-kbd">Esc</span>
        </div>
        <ul class="llx-palette__list" role="listbox">
          <template v-for="(group, gi) in groups" :key="group.name">
            <li class="llx-palette__group" role="presentation">{{ group.name }}</li>
            <li v-for="item in group.items" :key="item.id" role="option" :aria-selected="item.index === active"
                class="llx-palette__item" :data-danger="item.command.danger || undefined" @mousemove="active = item.index" @click="choose(item.index)">
              <LlmIcon :name="item.command.icon" />
              <span class="llx-truncate">{{ item.command.title }}</span>
              <span v-if="item.command.hint" class="llx-kbd">{{ item.command.hint }}</span>
            </li>
          </template>
          <li v-if="!ranked.length" class="llx-empty">Nothing matches “{{ query }}”.</li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { llmCommandScore, type LlmCommand } from '~/scripts/kliveLlm';

const props = defineProps<{ open: boolean; commands: (query: string) => LlmCommand[] }>();
const emit = defineEmits<{ close: [] }>();
const query = ref('');
const active = ref(0);
const input = ref<HTMLInputElement | null>(null);

const ranked = computed(() => {
  const list = props.commands(query.value).map(command => ({ command, score: llmCommandScore(query.value, command) }))
    .filter(x => x.score > 0);
  if (query.value.trim()) list.sort((a, b) => b.score - a.score);
  return list.slice(0, 40).map((x, index) => ({ ...x, index, id: x.command.id }));
});
const groups = computed(() => {
  const out: { name: string; items: typeof ranked.value }[] = [];
  for (const item of ranked.value) {
    let g = out.find(x => x.name === item.command.group);
    if (!g) out.push(g = { name: item.command.group, items: [] });
    g.items.push(item);
  }
  return out;
});
function move(d: number) {
  const n = ranked.value.length;
  if (n) active.value = (active.value + d + n) % n;
}
function choose(index: number) {
  const item = ranked.value[index];
  if (!item) return;
  emit('close');
  void item.command.run();
}
watch(query, () => { active.value = 0; });
watch(() => props.open, async open => {
  if (!open) return;
  query.value = '';
  active.value = 0;
  await nextTick();
  input.value?.focus();
});
</script>
