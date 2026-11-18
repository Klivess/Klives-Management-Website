<template>
  <LlmDialog :open="open" :title="title" :sub="sub" icon="server" wide testid="llx-router-dialog" @close="$emit('close')">
    <div class="llx-form llx-form--grid">
      <template v-if="!builtIn">
        <label class="llx-field"><span>Name</span><input v-model.trim="form.name" class="llx-input" maxlength="60" placeholder="Together, Groq, my vLLM box…" data-autofocus data-testid="router-name" /></label>
        <label class="llx-field llx-field--wide"><span>Base URL</span><input v-model.trim="form.baseUrl" class="llx-input llx-mono" placeholder="https://api.example.com/v1" data-testid="router-url" />
          <small class="llx-dim">OpenAI-compatible: KliveLLM posts to &lt;base URL&gt;/chat/completions and reads &lt;base URL&gt;/models.</small></label>
        <label class="llx-field"><span>Default model</span><input v-model.trim="form.defaultModel" class="llx-input llx-mono" placeholder="the model sent when no route names one" data-testid="router-model" /></label>
      </template>
      <label v-if="!builtIn || router?.id === 'custom'" class="llx-field">
        <span>Billing</span>
        <select v-model="form.billing" class="llx-select" data-testid="router-billing">
          <option value="PerToken">Per token</option>
          <option value="Flat">Flat fee (a subscription)</option>
          <option value="Free">Free</option>
        </select>
      </label>
      <label v-if="form.billing === 'Flat' || router?.billing === 'Flat'" class="llx-field"><span>Monthly fee (USD)</span>
        <input v-model.number="form.monthlyFeeUsd" class="llx-input" type="number" min="0" step="1" placeholder="for flat-fee economics" /></label>
      <template v-if="!builtIn">
        <label class="llx-field"><span>Max parallel calls</span><input v-model.number="form.maxParallel" class="llx-input" type="number" min="1" max="64" placeholder="no limit" /></label>
        <label class="llx-field"><span>Requests a minute</span><input v-model.number="form.requestsPerMinute" class="llx-input" type="number" min="1" placeholder="no limit" /></label>
      </template>
      <label class="llx-field llx-field--wide"><span>Notes</span><input v-model="form.notes" class="llx-input" maxlength="300" placeholder="What it is for, its limits…" /></label>
      <label class="llx-check llx-field--wide"><input v-model="form.enabled" type="checkbox" />Enabled: lanes may be routed to it</label>
      <label v-if="isNew" class="llx-field llx-field--wide"><span>Key (optional now, can be set later)</span>
        <input v-model="key" class="llx-input llx-mono" type="password" autocomplete="new-password" spellcheck="false" placeholder="kept as a sensitive OmniSetting, never shown again" data-testid="router-key" /></label>
    </div>
    <p v-if="error" class="llx-banner" data-tone="crit"><LlmIcon name="octagon-x" />{{ error }}</p>
    <template #actions>
      <button class="llx-btn" @click="$emit('close')">Cancel</button>
      <button class="llx-btn llx-btn--primary" :disabled="!valid || c.busy.value['router-save']" data-testid="router-save" @click="save">{{ isNew ? 'Add router' : 'Save' }}</button>
    </template>
  </LlmDialog>
</template>

<script setup lang="ts">
import { computed, inject, reactive, ref, watch } from 'vue';
import type { KliveLlmConsole } from '~/composables/useKliveLlm';

const props = defineProps<{ open: boolean; router: any | null }>();
const emit = defineEmits<{ close: []; saved: [id: string] }>();
const c = inject<KliveLlmConsole>('llx')!;

const isNew = computed(() => !props.router);
const builtIn = computed(() => !!props.router?.builtIn);
const title = computed(() => (isNew.value ? 'Add a router' : `Edit ${props.router.name}`));
const sub = computed(() => (builtIn.value ? 'A built-in router: its address, key and default model stay in their existing settings.' : 'Any OpenAI-compatible endpoint.'));

const form = reactive({ name: '', baseUrl: '', defaultModel: '', billing: 'PerToken', monthlyFeeUsd: null as number | null, maxParallel: null as number | null, requestsPerMinute: null as number | null, notes: '', enabled: true });
const key = ref('');
const error = ref<string | null>(null);

watch(() => props.open, open => {
  if (!open) return;
  const r = props.router;
  Object.assign(form, {
    name: r?.name ?? '', baseUrl: r?.baseUrl ?? '', defaultModel: r?.defaultModel ?? '', billing: r?.billing ?? 'PerToken',
    monthlyFeeUsd: r?.monthlyFeeUsd ?? null, maxParallel: r?.maxParallel ?? null, requestsPerMinute: r?.requestsPerMinute ?? null,
    notes: r?.notes ?? '', enabled: r?.enabled ?? true,
  });
  key.value = '';
  error.value = null;
});

const valid = computed(() => {
  if (builtIn.value) return true;
  return form.name.length > 0 && /^https?:\/\/\S+$/i.test(form.baseUrl) && form.defaultModel.length > 0;
});

async function save() {
  error.value = null;
  const n = (v: number | null) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const definition = builtIn.value
    ? { id: props.router.id, name: props.router.name, builtIn: true, billing: props.router.id === 'custom' ? form.billing : props.router.billing, monthlyFeeUsd: n(form.monthlyFeeUsd), notes: form.notes || null, enabled: form.enabled }
    : {
        id: props.router?.id ?? '', name: form.name, kind: 'openai', baseUrl: form.baseUrl, defaultModel: form.defaultModel, billing: form.billing,
        monthlyFeeUsd: form.billing === 'Flat' ? n(form.monthlyFeeUsd) : null, maxParallel: n(form.maxParallel), requestsPerMinute: n(form.requestsPerMinute),
        notes: form.notes || null, enabled: form.enabled,
      };
  const result = await c.saveRouter(definition);
  if (!result) { error.value = 'The router was not saved (the message above says why).'; return; }
  const id = result.id ?? definition.id;
  if (isNew.value && key.value.trim() && id) await c.setRouterKey(id, key.value.trim());
  key.value = '';
  emit('saved', id);
  emit('close');
}
</script>
