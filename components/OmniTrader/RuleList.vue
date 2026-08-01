<template>
    <!--
      The rule-level record behind a decision. Passes are shown alongside failures:
      a list of only the things that went wrong cannot tell you whether the other
      six layers ran at all.
    -->
    <div>
        <div v-if="failuresOnly.length" class="summary">
            <span class="ot-chip bad" v-if="hard.length">
                <span class="glyph" aria-hidden="true">✕</span> {{ hard.length }} hard
            </span>
            <span class="ot-chip warn" v-if="soft.length">
                <span class="glyph" aria-hidden="true">!</span> {{ soft.length }} soft
            </span>
            <span class="ot-chip ok">
                <span class="glyph" aria-hidden="true">✓</span> {{ passes.length }} passed
            </span>
            <button v-if="passes.length" class="ot-btn ghost sm" :aria-pressed="showAll"
                    @click="showAll = !showAll">
                {{ showAll ? 'Failures only' : 'Show all layers' }}
            </button>
        </div>
        <p v-else class="allclear">
            <span class="ot-chip ok"><span class="glyph" aria-hidden="true">✓</span> all {{ rules.length }} checks passed</span>
        </p>

        <div class="ot-rules">
            <div v-for="(rule, index) in visible" :key="index" class="ot-rule" :class="ruleTone(rule.Severity)">
                <span class="icon" aria-hidden="true">{{ ruleGlyph(rule.Severity) }}</span>
                <span class="name">{{ rule.Rule }}</span>
                <span class="detail">{{ rule.Detail ?? layerLabel(rule.Layer) }}</span>
                <span class="measure" v-if="rule.Observed !== null && rule.Observed !== undefined">
                    {{ fmtNum(rule.Observed, 2) }}<span v-if="rule.Limit !== null && rule.Limit !== undefined"> / {{ fmtNum(rule.Limit, 2) }}</span>
                </span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { fmtNum, layerLabel, ruleGlyph, ruleTone, type RiskRule } from '~/composables/useOmniTrader';

const props = defineProps<{ rules: RiskRule[] }>();

const showAll = ref(false);

const hard = computed(() => props.rules.filter(r => r.Severity === 'Hard'));
const soft = computed(() => props.rules.filter(r => r.Severity === 'Soft'));
const passes = computed(() => props.rules.filter(r => r.Severity !== 'Hard' && r.Severity !== 'Soft'));
const failuresOnly = computed(() => [...hard.value, ...soft.value]);
const visible = computed(() =>
    showAll.value || !failuresOnly.value.length ? props.rules : failuresOnly.value);
</script>

<style scoped>
.summary { display: flex; align-items: center; gap: var(--ot-space-2); flex-wrap: wrap; margin-bottom: var(--ot-space-2); }
.allclear { margin: 0 0 var(--ot-space-2); }
</style>
