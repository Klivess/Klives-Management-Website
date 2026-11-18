<template>
  <Teleport to="body">
    <div v-if="open" class="cs2x-layer">
      <div class="cs2x-scrim" @pointerdown.self="emit('close')">
        <div class="cs2x-palette" role="dialog" aria-modal="true" aria-label="Commands" data-testid="cs2x-palette" @keydown="onKey">
          <label class="cs2x-palette__input">
            <CS2Icon name="search" />
            <input ref="input" v-model="query" placeholder="Jump to a position, run a scan, open settings…" aria-label="Command" data-testid="palette-input" />
            <span class="cs2x-kbd">Esc</span>
          </label>
          <div class="cs2x-palette__list" role="listbox">
            <template v-for="group in grouped" :key="group.name">
              <div class="cs2x-palette__group">{{ group.name }}</div>
              <button
                v-for="cmd in group.items"
                :key="cmd.id"
                class="cs2x-palette__item"
                role="option"
                :aria-selected="flat[active]?.id === cmd.id"
                :data-testid="`cmd-${cmd.id}`"
                @mouseenter="active = flat.indexOf(cmd)"
                @click="run(cmd)"
              >
                <CS2Icon :name="cmd.icon" /><span class="cs2x-truncate">{{ cmd.title }}</span><span v-if="cmd.hint" class="cs2x-palette__hint">{{ cmd.hint }}</span>
              </button>
            </template>
            <div v-if="!flat.length" class="cs2x-empty" style="min-height: 60px">Nothing matches.</div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import CS2Icon from '~/components/CS2/Icon.vue';
import { commandScore } from '~/scripts/adminConsole';
import type { Cs2Command } from '~/scripts/cs2Arbitrage';

const props = defineProps<{ open: boolean; commands: Cs2Command[] }>();
const emit = defineEmits<{ close: [] }>();
const query = ref('');
const active = ref(0);
const input = ref<HTMLInputElement | null>(null);

const flat = computed(() => {
  const q = query.value.trim();
  const scored = props.commands
    // Every command here ranks like the admin palette's actions (its "Services" group is the only one it marks down).
    .map((c) => ({ c, s: commandScore(q, { title: c.title, keywords: c.keywords, group: 'Actions' }) }))
    .filter((x) => x.s > 0);
  if (q) scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, 40).map((x) => x.c);
});
const grouped = computed(() => {
  const order: string[] = [];
  const map = new Map<string, Cs2Command[]>();
  for (const c of flat.value) {
    if (!map.has(c.group)) { map.set(c.group, []); order.push(c.group); }
    map.get(c.group)!.push(c);
  }
  return order.map((name) => ({ name, items: map.get(name)! }));
});

watch(() => props.open, async (open) => {
  if (!open) return;
  query.value = '';
  active.value = 0;
  await nextTick();
  input.value?.focus();
});
watch(query, () => { active.value = 0; });

function run(cmd: Cs2Command) {
  emit('close');
  cmd.run();
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); }
  else if (event.key === 'ArrowDown') { event.preventDefault(); active.value = Math.min(flat.value.length - 1, active.value + 1); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); active.value = Math.max(0, active.value - 1); }
  else if (event.key === 'Enter') { event.preventDefault(); const cmd = flat.value[active.value]; if (cmd) run(cmd); }
}
</script>
