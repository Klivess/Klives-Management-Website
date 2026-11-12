<template>
  <LlmDialog :open="open" title="Ledger settings" sub="How long KliveLLM keeps what it records, and whether it probes the routers" icon="gauge" testid="llx-settings-dialog" @close="$emit('close')">
    <div v-if="!data" class="llx-empty">{{ error ?? 'Reading…' }}</div>
    <template v-else>
      <div class="llx-form llx-form--grid">
        <label class="llx-field"><span>Keep each call for (days)</span>
          <input v-model.number="form.callRetentionDays" class="llx-input" type="number" min="7" max="730" data-autofocus data-testid="settings-call-days" />
          <small class="llx-dim">7–730. Minute rollups stay {{ data.retention?.minuteRetentionDays ?? 14 }} days, hourly {{ data.retention?.hourRetentionDays ?? 400 }}, daily forever.</small></label>
        <label class="llx-field"><span>Keep prompt and reply text for (days)</span>
          <input v-model.number="form.keptTextRetentionDays" class="llx-input" type="number" min="1" max="14" />
          <small class="llx-dim">1–14. Only for lanes whose text capture is switched on.</small></label>
        <label class="llx-check llx-field--wide"><input v-model="form.routerProbes" type="checkbox" />Probe every keyed router once a minute (a model-list read: no tokens are spent)</label>
      </div>
      <h4 class="llx-subhead">The ledger now</h4>
      <dl class="llx-dl llx-dl--compact">
        <dt>Running</dt><dd>{{ data.ledger?.running ? 'yes' : 'no' }}{{ data.ledgerError ? ` · ${data.ledgerError}` : '' }}</dd>
        <dt>Calls written</dt><dd class="llx-num">{{ llmInt(data.ledger?.written) }} since {{ llmClock(data.ledger?.startedUtc) }}</dd>
        <dt>Not recorded</dt><dd class="llx-num">{{ llmInt(data.ledger?.dropped) }} dropped · {{ llmInt(data.ledger?.writeFailures) }} write failures</dd>
        <dt>Waiting to be written</dt><dd class="llx-num">{{ llmInt(data.ledger?.queued) }}</dd>
        <dt>On disk</dt><dd class="llx-num">{{ llmBytes(data.ledger?.dbBytes) }} ledger · {{ llmBytes(data.ledger?.contentBytes) }} kept text</dd>
      </dl>
    </template>
    <template #actions>
      <button class="llx-btn" @click="$emit('close')">Cancel</button>
      <button class="llx-btn llx-btn--primary" :disabled="!data || c.busy.value.settings" data-testid="settings-save" @click="save">Save</button>
    </template>
  </LlmDialog>
</template>

<script setup lang="ts">
import { inject, reactive, ref, watch } from 'vue';
import type { KliveLlmConsole } from '~/composables/useKliveLlm';
import { llmBytes, llmClock, llmInt } from '~/scripts/kliveLlm';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const c = inject<KliveLlmConsole>('llx')!;

const data = ref<any | null>(null);
const error = ref<string | null>(null);
const form = reactive({ callRetentionDays: 90, keptTextRetentionDays: 3, routerProbes: true });

watch(() => props.open, async open => {
  if (!open) return;
  data.value = null;
  error.value = null;
  try {
    data.value = await c.get('/klivellm/settings');
    form.callRetentionDays = data.value.callRetentionDays ?? 90;
    form.keptTextRetentionDays = data.value.keptTextRetentionDays ?? 3;
    form.routerProbes = data.value.routerProbes ?? true;
  } catch (e: any) { error.value = e?.message ?? 'The settings did not come back.'; }
});

async function save() {
  const result = await c.saveSettings({
    callRetentionDays: Math.min(730, Math.max(7, Math.round(form.callRetentionDays))),
    keptTextRetentionDays: Math.min(14, Math.max(1, Math.round(form.keptTextRetentionDays))),
    routerProbes: form.routerProbes,
  });
  if (result) emit('close');
}
</script>
