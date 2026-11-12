<template>
  <div class="llx-budget" :data-testid="testid">
    <div v-if="status && status.limit" class="llx-budget__status">
      <div class="llx-meter" :data-tone="status.exceeded ? 'crit' : status.warning ? 'warn' : 'ok'" role="meter" :aria-valuenow="Math.round(status.fraction * 100)" aria-valuemin="0" aria-valuemax="100" :aria-label="`${status.limit} budget used`">
        <span :style="{ width: `${Math.min(100, status.fraction * 100)}%` }"></span>
      </div>
      <span class="llx-num"><b>{{ Math.round(status.fraction * 100) }}%</b> of the {{ status.limit }} budget</span>
      <span class="llx-dim">{{ status.detail }}<template v-if="status.resetsIn"> · resets in {{ resets }}</template></span>
    </div>
    <p v-else-if="!editing && !hasBudget" class="llx-dim">No budget. Spending here is not limited.</p>

    <div v-if="editing" class="llx-form llx-form--grid">
      <label class="llx-field"><span>Per day (USD)</span><input v-model.number="form.dailyUsd" class="llx-input" type="number" min="0" step="0.5" placeholder="no limit" /></label>
      <label class="llx-field"><span>Per month (USD)</span><input v-model.number="form.monthlyUsd" class="llx-input" type="number" min="0" step="1" placeholder="no limit" /></label>
      <label class="llx-field"><span>Tokens a day</span><input v-model.number="form.dailyTokens" class="llx-input" type="number" min="0" step="100000" placeholder="no limit" /></label>
      <label class="llx-field"><span>Tokens a month</span><input v-model.number="form.monthlyTokens" class="llx-input" type="number" min="0" step="1000000" placeholder="no limit" /></label>
      <label class="llx-field llx-field--wide">
        <span>When a limit is reached</span>
        <select v-model="form.action" class="llx-select">
          <option value="warn">Warn only: keep calling, flag it on this page</option>
          <option value="fallback">Move to a free or flat-fee fallback (refuse if there is none)</option>
          <option value="block">Refuse further calls until the limit resets</option>
        </select>
      </label>
      <p class="llx-note llx-field--wide">Days and months are UTC. Spend counts what the routers reported, or the price book where they report nothing; flat-fee and free routers spend nothing.</p>
      <div class="llx-form__actions llx-field--wide">
        <button class="llx-btn llx-btn--sm" @click="editing = false">Cancel</button>
        <button v-if="hasBudget" class="llx-btn llx-btn--sm llx-btn--danger" :disabled="busy" @click="$emit('save', null); editing = false">Remove budget</button>
        <button class="llx-btn llx-btn--sm llx-btn--primary" :disabled="busy || !valid" data-testid="budget-save" @click="save">Save budget</button>
      </div>
    </div>
    <div v-else-if="canEdit" class="llx-form__actions">
      <button class="llx-btn llx-btn--sm" data-testid="budget-edit" @click="start"><LlmIcon name="edit" />{{ hasBudget ? 'Change budget' : 'Set a budget' }}</button>
    </div>
    <dl v-if="hasBudget && !editing" class="llx-dl llx-dl--compact">
      <template v-if="budget.dailyUsd"><dt>Per day</dt><dd>{{ llmUsd(budget.dailyUsd) }}</dd></template>
      <template v-if="budget.monthlyUsd"><dt>Per month</dt><dd>{{ llmUsd(budget.monthlyUsd) }}</dd></template>
      <template v-if="budget.dailyTokens"><dt>Tokens a day</dt><dd>{{ llmCompact(budget.dailyTokens) }}</dd></template>
      <template v-if="budget.monthlyTokens"><dt>Tokens a month</dt><dd>{{ llmCompact(budget.monthlyTokens) }}</dd></template>
      <dt>At the limit</dt><dd>{{ ACTIONS[budget.action] ?? budget.action }}</dd>
    </dl>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { llmCompact, llmDuration, llmUsd } from '~/scripts/kliveLlm';

const props = defineProps<{ budget: any | null; status?: any | null; canEdit: boolean; busy?: boolean; testid?: string }>();
const emit = defineEmits<{ save: [budget: any | null] }>();

const ACTIONS: Record<string, string> = { warn: 'warn only', fallback: 'move to a free or flat-fee fallback', block: 'refuse calls' };
const editing = ref(false);
const form = reactive<{ dailyUsd: number | null; monthlyUsd: number | null; dailyTokens: number | null; monthlyTokens: number | null; action: string }>({
  dailyUsd: null, monthlyUsd: null, dailyTokens: null, monthlyTokens: null, action: 'warn',
});
const hasBudget = computed(() => !!props.budget && ['dailyUsd', 'monthlyUsd', 'dailyTokens', 'monthlyTokens'].some(k => Number(props.budget[k]) > 0));
const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const valid = computed(() => [form.dailyUsd, form.monthlyUsd, form.dailyTokens, form.monthlyTokens].some(positive));
const resets = computed(() => {
  const r = props.status?.resetsIn;
  if (!r) return '';
  // TimeSpan arrives as "d.hh:mm:ss" or "hh:mm:ss".
  const m = /^(?:(\d+)\.)?(\d+):(\d+):(\d+)/.exec(String(r));
  return m ? llmDuration(Number(m[1] ?? 0) * 86_400 + Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4])) : String(r);
});

function start() {
  form.dailyUsd = props.budget?.dailyUsd ?? null;
  form.monthlyUsd = props.budget?.monthlyUsd ?? null;
  form.dailyTokens = props.budget?.dailyTokens ?? null;
  form.monthlyTokens = props.budget?.monthlyTokens ?? null;
  form.action = props.budget?.action ?? 'warn';
  editing.value = true;
}
function save() {
  const out: Record<string, any> = { action: form.action };
  for (const k of ['dailyUsd', 'monthlyUsd'] as const) if (positive(form[k])) out[k] = form[k];
  for (const k of ['dailyTokens', 'monthlyTokens'] as const) if (positive(form[k])) out[k] = Math.round(form[k]!);
  emit('save', out);
  editing.value = false;
}
</script>
