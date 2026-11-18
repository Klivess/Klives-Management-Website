<template>
  <Teleport to="body">
    <div v-if="open" class="kgx-layer kgx-scrim kgx-scrim--top" @mousedown.self="emit('close')">
      <div class="kgx-palette" role="dialog" aria-modal="true" aria-label="Commands" @keydown.esc.stop="emit('close')">
        <label class="kgx-palette__find">
          <GamesIcon name="search" />
          <input ref="box" v-model="query" placeholder="Jump to a server or run a command…" aria-label="Search commands" data-testid="palette-input"
            @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="run(results[active])" />
          <span class="kgx-kbd">Esc</span>
        </label>
        <ul class="kgx-palette__list" role="listbox">
          <template v-for="(c, i) in results" :key="c.id">
            <li v-if="i === 0 || results[i - 1].group !== c.group" class="kgx-palette__group" role="presentation">{{ c.group }}</li>
            <li role="option" :aria-selected="i === active">
              <button class="kgx-palette__item" :data-active="i === active || undefined" :disabled="c.disabled" :data-testid="`cmd-${c.id}`" @mouseenter="active = i" @click="run(c)">
                <GamesIcon :name="c.icon" /><span class="kgx-truncate">{{ c.title }}</span>
                <span v-if="c.hint" class="kgx-palette__hint">{{ c.hint }}</span>
              </button>
            </li>
          </template>
          <li v-if="!results.length" class="kgx-palette__none">Nothing matches “{{ query }}”.</li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { commandScore, type KgCommand } from '~/scripts/kliveGames';

const props = defineProps<{ open: boolean; commands: KgCommand[] }>();
const emit = defineEmits<{ close: [] }>();

const query = ref('');
const active = ref(0);
const box = ref<HTMLInputElement | null>(null);

const results = computed(() => {
  const q = query.value.trim();
  const scored = props.commands
    .map((c, i) => ({ c, i, s: q ? commandScore(q, { title: c.title, keywords: c.keywords, group: c.group } as Parameters<typeof commandScore>[1]) : 1 }))
    .filter(x => x.s > 0);
  if (q) scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return scored.slice(0, 40).map(x => x.c);
});

function move(d: number) { if (results.value.length) active.value = (active.value + d + results.value.length) % results.value.length; }
function run(c: KgCommand | undefined) {
  if (!c || c.disabled) return;
  emit('close');
  c.run();
}

watch(query, () => { active.value = 0; });
watch(() => props.open, open => { if (open) { query.value = ''; active.value = 0; nextTick(() => box.value?.focus()); } });
</script>
