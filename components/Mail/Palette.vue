<template>
  <Teleport to="body">
    <div v-if="open" class="kml-layer kml-scrim" data-testid="kml-palette" @mousedown.self="$emit('close')">
      <div class="kml-layer kml-palette" role="dialog" aria-modal="true" aria-label="Jump to">
        <label class="kml-palette__search">
          <MailIcon name="search" />
          <input
            ref="input"
            v-model="text"
            class="kml-bare"
            placeholder="Jump to an address, a folder, or search mail…"
            aria-label="Jump to"
            autocomplete="off"
            spellcheck="false"
            data-testid="kml-palette-input"
            @keydown.down.prevent="move(1)"
            @keydown.up.prevent="move(-1)"
            @keydown.enter.prevent="run(results[active])"
            @keydown.esc.prevent="$emit('close')"
          />
          <kbd>Esc</kbd>
        </label>
        <ul class="kml-palette__list" role="listbox">
          <template v-for="(c, i) in results" :key="c.id">
            <li v-if="i === 0 || results[i - 1].group !== c.group" class="kml-palette__group">{{ c.group }}</li>
            <li
              class="kml-palette__item"
              role="option"
              :aria-selected="i === active"
              :data-testid="`cmd-${c.id}`"
              @mousemove="active = i"
              @click="run(c)"
            >
              <MailIcon :name="c.icon" />
              <span class="kml-palette__title">{{ c.title }}</span>
              <span v-if="c.hint" class="kml-palette__hint">{{ c.hint }}</span>
              <kbd v-if="c.shortcut">{{ c.shortcut }}</kbd>
            </li>
          </template>
          <li v-if="!results.length" class="kml-palette__none">Nothing matches.</li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import MailIcon from '~/components/Mail/Icon.vue';
import { scoreCommand, type MailCommand } from '~/scripts/kliveMail';

const props = defineProps<{ open: boolean; commands: MailCommand[]; onSearch: (text: string) => void }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const text = ref('');
const active = ref(0);
const input = ref<HTMLInputElement | null>(null);

watch(() => props.open, value => {
  if (!value) return;
  text.value = '';
  active.value = 0;
  void nextTick(() => input.value?.focus());
});
watch(text, () => { active.value = 0; });

const results = computed<MailCommand[]>(() => {
  const q = text.value.trim();
  const scored = props.commands
    .map(c => ({ c, s: scoreCommand(q, c) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s);
  const order: MailCommand['group'][] = ['Go to', 'Addresses', 'Actions'];
  // Best matches first, then shown group by group (the sort is stable, so score order holds within a group).
  const list = scored.slice(0, q ? 14 : 30).map(x => x.c).sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  if (q.length >= 2) {
    list.push({ id: 'search', title: `Search mail for “${q}”`, group: 'Search', icon: 'search', hint: 'subject, sender, body and attachments', run: () => props.onSearch(q) });
  }
  return list;
});

function move(delta: number) {
  const n = results.value.length;
  if (n) active.value = (active.value + delta + n) % n;
}

function run(command: MailCommand | undefined) {
  if (!command) return;
  emit('close');
  void command.run();
}
</script>
