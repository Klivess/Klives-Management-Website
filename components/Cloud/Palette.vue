<template>
    <Teleport to="body">
        <div v-if="open" class="kcl-layer">
            <div class="kcl-scrim" @mousedown.self="$emit('close')">
                <div class="kcl-palette" role="dialog" aria-modal="true" aria-label="Go to or do" data-testid="kcl-palette">
                    <label class="kcl-palette__input">
                        <KliveCloudIcon name="search" :size="16" />
                        <input ref="input" v-model="query" placeholder="Jump to a folder or file, or run an action…" aria-label="Search" autocomplete="off" spellcheck="false"
                               @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="run(active)" @keydown.esc.prevent="$emit('close')" />
                        <span class="kcl-kbd">Esc</span>
                    </label>
                    <div class="kcl-palette__list" role="listbox">
                        <template v-for="(entry, i) in results" :key="entry.id">
                            <div v-if="i === 0 || results[i - 1].group !== entry.group" class="kcl-palette__group">{{ entry.group }}</div>
                            <button class="kcl-palette__item" role="option" :aria-selected="i === active" :data-testid="`cmd-${entry.id}`" @mouseenter="active = i" @click="run(i)">
                                <CloudGlyph v-if="entry.kind" :kind="entry.kind" :size="22" />
                                <KliveCloudIcon v-else :name="entry.icon ?? 'command'" :size="15" />
                                <span class="kcl-truncate">{{ entry.title }}</span>
                                <span v-if="entry.hint" class="kcl-palette__hint">{{ entry.hint }}</span>
                                <span v-if="entry.keys" class="kcl-kbd">{{ entry.keys }}</span>
                            </button>
                        </template>
                        <div v-if="!results.length" class="kcl-empty" style="min-height: 80px">Nothing matches “{{ query }}”.</div>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { CloudCommand } from '~/scripts/klivecloud/drive';


/* Ctrl K: actions first, then every folder and file whose name matches. */
const props = defineProps<{ open: boolean; commands: CloudCommand[]; find: (query: string) => CloudCommand[] }>();
const emit = defineEmits<{ close: [] }>();

const query = ref('');
const active = ref(0);
const input = ref<HTMLInputElement | null>(null);

function score(text: string, terms: string[]) {
    const hay = text.toLowerCase();
    let total = 0;
    for (const term of terms) {
        const at = hay.indexOf(term);
        if (at < 0) return -1;
        total += at === 0 ? 3 : hay[at - 1] === ' ' ? 2 : 1;
    }
    return total;
}

const results = computed(() => {
    const terms = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return props.commands.slice(0, 40);
    const scored = props.commands
        .map(cmd => ({ cmd, s: score(`${cmd.title} ${cmd.keywords ?? ''} ${cmd.group}`, terms) }))
        .filter(entry => entry.s >= 0)
        .sort((a, b) => b.s - a.s)
        .map(entry => entry.cmd);
    return [...scored.slice(0, 12), ...props.find(query.value)].slice(0, 60);
});

watch(results, () => { active.value = 0; });
watch(() => props.open, async open => {
    if (!open) return;
    query.value = '';
    active.value = 0;
    await nextTick();
    input.value?.focus();
});

function move(delta: number) {
    if (!results.value.length) return;
    active.value = (active.value + delta + results.value.length) % results.value.length;
    void nextTick(() => document.querySelector('.kcl-palette__item[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
}

function run(i: number) {
    const cmd = results.value[i];
    if (!cmd) return;
    emit('close');
    cmd.run();
}
</script>
