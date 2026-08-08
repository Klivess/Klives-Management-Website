<template>
    <!--
      compilerOutput is capped at 128 KiB server-side, which is far too much to put in
      the DOM by default. The tail is what anyone actually reads, so that is what is
      rendered; the whole thing is one click away, and downloading it is another.
    -->
    <div class="kt-log">
        <div class="logtools">
            <input v-model="filter" class="kt-input" type="search" placeholder="Filter lines…"
                   aria-label="Filter log lines" style="min-width:150px" />
            <button class="kt-btn ghost sm" :aria-pressed="wrap" @click="wrap = !wrap">
                {{ wrap ? 'No wrap' : 'Wrap' }}
            </button>
            <span class="grow"></span>
            <span class="muted" style="font-size:10px">
                {{ shownCount }} of {{ allLines.length }} lines
                <template v-if="truncated"> · tail only</template>
            </span>
            <button v-if="truncated" class="kt-btn ghost sm" @click="showAll = true">Show all</button>
            <button class="kt-btn ghost sm" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
            <button class="kt-btn ghost sm" @click="download">Download</button>
        </div>
        <pre ref="pane" :class="{ wrap }"><template v-for="(line, i) in visible" :key="i"><mark
            v-if="line.isError">{{ line.text }}</mark><template v-else>{{ line.text }}</template>{{ '\n' }}</template></pre>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ktCopy } from '~/scripts/kliveTech';

const props = withDefaults(defineProps<{
    text: string;
    fileName?: string;
    /** Scroll to the first error line — the reason to open a failed build's log. */
    focusError?: boolean;
    /** A live job appends; a finished one does not. */
    following?: boolean;
    tailLines?: number;
}>(), { fileName: 'build.log', tailLines: 400 });

const filter = ref('');
const wrap = ref(false);
const showAll = ref(false);
const copied = ref(false);
const pane = ref<HTMLElement | null>(null);

const ERROR_LINE = /\berror\b/i;

const allLines = computed(() => props.text.split('\n'));

const matching = computed(() => {
    const needle = filter.value.trim().toLowerCase();
    if (!needle) return allLines.value;
    return allLines.value.filter(line => line.toLowerCase().includes(needle));
});

const truncated = computed(() => !showAll.value && matching.value.length > props.tailLines);

const visible = computed(() => {
    const lines = truncated.value ? matching.value.slice(-props.tailLines) : matching.value;
    return lines.map(text => ({ text, isError: ERROR_LINE.test(text) }));
});

const shownCount = computed(() => visible.value.length);

async function copy() {
    copied.value = await ktCopy(props.text);
    if (copied.value) setTimeout(() => { copied.value = false; }, 1500);
}

function download() {
    const blob = new Blob([props.text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = props.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
}

// Follow the tail only while the reader is already at the bottom. Yanking the scroll
// out from under someone reading an earlier line is worse than not following at all.
watch(() => props.text, async () => {
    if (!props.following) return;
    const element = pane.value;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
    await nextTick();
    if (atBottom) element.scrollTop = element.scrollHeight;
});

watch(() => props.focusError, async (shouldFocus) => {
    if (!shouldFocus) return;
    await nextTick();
    pane.value?.querySelector('mark')?.scrollIntoView({ block: 'center' });
}, { immediate: true });
</script>
