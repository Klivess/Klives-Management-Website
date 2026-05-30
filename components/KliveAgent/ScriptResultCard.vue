<template>
  <div class="script-result" :class="script.success ? 'script-ok' : 'script-err'">
    <button class="script-header" type="button" @click="expanded = !expanded">
      <span class="script-chevron" :class="{ open: expanded }">▸</span>
      <span class="script-label">
        <span class="script-glyph">{{ script.success ? '✓' : '✗' }}</span>
        {{ script.success ? 'Script' : 'Script Failed' }}
      </span>
      <span v-if="script.executionTimeMs != null" class="script-time">{{ script.executionTimeMs }}ms</span>
      <span class="script-copy" role="button" tabindex="0" @click.stop="copyToClipboard(script.code)" @keydown.enter.stop="copyToClipboard(script.code)" title="Copy code">⧉ Copy</span>
    </button>

    <div v-show="expanded" class="script-detail">
      <pre class="script-code hljs"><code v-html="highlightCsharp(script.code)"></code></pre>
      <pre v-if="script.output" class="script-output">{{ script.output }}</pre>
      <pre v-if="script.errorMessage" class="script-error">{{ script.errorMessage }}</pre>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { highlightCsharp, copyToClipboard } from '~/scripts/agentMarkdown';

const props = defineProps({
  // AgentScriptResult: { code, output, success, errorMessage, executionTimeMs }
  script: { type: Object, required: true },
});

// Collapsed by default to keep the thread skimmable; failed scripts open so the
// error is visible without a click.
const expanded = ref(props.script?.success === false);
</script>

<style scoped lang="scss">
.script-result {
  background: #141414;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-left: 3px solid $secondary;
  border-radius: 8px;
  margin-top: 8px;
  font-size: 12px;
  overflow: hidden;
}

.script-err {
  border-left-color: #e0584b;
}

.script-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  background: transparent;
  border: none;
  color: #9a9a9a;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.script-header:hover {
  background: rgba(255, 255, 255, 0.02);
}

.script-chevron {
  color: #6a6a6a;
  font-size: 11px;
  transition: transform 140ms ease;
}
.script-chevron.open {
  transform: rotate(90deg);
}

.script-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.script-glyph {
  color: $teritary;
}
.script-err .script-glyph {
  color: #e0584b;
}

.script-time {
  margin-left: auto;
  color: #6a6a6a;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.script-copy {
  background: #1c1c1c;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #8a8a8a;
  font-size: 10px;
  padding: 3px 9px;
  border-radius: 6px;
  cursor: pointer;
  transition: color 140ms ease, border-color 140ms ease;
}
.script-copy:hover {
  color: $teritary;
  border-color: rgba($secondary, 0.5);
}

.script-detail {
  padding: 0 10px 10px;
}

.script-code,
.script-output,
.script-error {
  margin: 6px 0 0 0;
  padding: 8px 10px;
  background: #0b0b0b;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 11.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Cascadia Code', 'Fira Code', ui-monospace, monospace;
}

.script-output {
  color: $teritary;
}
.script-error {
  color: #e0584b;
}

.script-code::-webkit-scrollbar,
.script-output::-webkit-scrollbar {
  height: 6px;
}
.script-code::-webkit-scrollbar-thumb,
.script-output::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
}
</style>
