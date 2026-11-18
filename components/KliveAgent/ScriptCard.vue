<template>
  <div class="kax-script" :data-ok="script.success !== false">
    <button class="kax-script__head" type="button" :aria-expanded="open" @click="open = !open">
      <KliveAgentIcon :name="open ? 'chevron-down' : 'chevron-right'" />
      <span class="kax-script__state" :data-tone="script.success === false ? 'crit' : 'ok'">
        <KliveAgentIcon :name="script.success === false ? 'x' : 'check'" />{{ script.success === false ? 'Failed' : 'Ran' }}
      </span>
      <span class="kax-script__peek">{{ peek }}</span>
      <span v-if="script.executionTimeMs != null" class="kax-script__ms">{{ fmtMs(script.executionTimeMs) }}</span>
      <span class="kax-iconbtn kax-iconbtn--sm" role="button" tabindex="0" title="Copy the code" aria-label="Copy the code"
        @click.stop="copy" @keydown.enter.stop="copy"><KliveAgentIcon :name="copied ? 'check' : 'copy'" /></span>
    </button>
    <div v-if="open" class="kax-script__body">
      <pre class="hljs"><code v-html="highlightCsharp(script.code)"></code></pre>
      <pre v-if="script.output" class="kax-script__out">{{ script.output }}</pre>
      <pre v-if="script.errorMessage" class="kax-script__err">{{ script.errorMessage }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { copyToClipboard, highlightCsharp } from '~/scripts/agentMarkdown';
import { fmtMs } from '~/scripts/agentConsole';
import KliveAgentIcon from '~/components/KliveAgent/Icon.vue';

/** One C# script the agent ran: collapsed to its first line, so a long turn stays skimmable. */
const props = defineProps<{ script: { code?: string; output?: string; success?: boolean; errorMessage?: string; executionTimeMs?: number } }>();
const open = ref(false);
const copied = ref(false);

const peek = computed(() => {
  const line = String(props.script.code ?? '').split('\n').map(l => l.trim()).find(l => l && !l.startsWith('//') && !l.startsWith('using ')) ?? '';
  return line.length > 90 ? line.slice(0, 89) + '…' : line;
});

async function copy() {
  await copyToClipboard(props.script.code);
  copied.value = true;
  window.setTimeout(() => { copied.value = false; }, 1500);
}
</script>
