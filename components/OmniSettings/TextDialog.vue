<template>
  <AdminDialog
    :open="!!setting"
    :title="setting?.label ?? ''"
    :sub="setting ? `${setting.name} · ${setting.owner}` : ''"
    icon="edit"
    tone="info"
    wide
    testid="ost-text-dialog"
    @close="emit('close')"
  >
    <textarea
      v-if="setting"
      ref="area"
      v-model="text"
      class="ost-textarea"
      :readonly="!canWrite"
      :spellcheck="true"
      :aria-label="setting.name"
      data-autofocus
      @keydown.ctrl.enter.prevent="submit"
      @keydown.meta.enter.prevent="submit"
    ></textarea>
    <div class="ost-textarea__foot">
      <span>{{ fmtInt(text.length) }} characters<template v-if="changed"> · changed</template></span>
      <span v-if="setting?.defaultValue != null && setting.matchesDefault === false">
        <button class="ost-linkbtn" type="button" :disabled="!canWrite" @click="text = setting!.defaultValue!">Use the code's default</button>
      </span>
      <span v-if="tooLong" class="ost-textarea__err">Longer than the server keeps ({{ fmtInt(MAX_VALUE_LENGTH) }}).</span>
    </div>
    <template #actions>
      <span class="ost-dialog-hint"><span class="adm-kbd">Ctrl</span><span class="adm-kbd">↵</span> saves</span>
      <button class="adm-btn adm-btn--ghost" type="button" @click="emit('close')">{{ changed ? 'Cancel' : 'Close' }}</button>
      <button v-if="canWrite" class="adm-btn adm-btn--primary" type="button" :disabled="!changed || tooLong" data-testid="ost-text-save" @click="submit">Save</button>
    </template>
  </AdminDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fmtInt } from '~/scripts/adminConsole';
import { MAX_VALUE_LENGTH, type Setting } from '~/scripts/settingsConsole';

/* Long or multi-line text (an agent's personality, a vocabulary) gets room to be read and edited. */
const props = defineProps<{ setting: Setting | null; draft?: string; canWrite: boolean }>();
const emit = defineEmits<{ close: []; save: [text: string] }>();

const text = ref('');
const area = ref<HTMLTextAreaElement | null>(null);

watch(() => props.setting?.key, () => { text.value = props.draft ?? props.setting?.value ?? ''; }, { immediate: true });

const changed = computed(() => !!props.setting && text.value !== props.setting.value);
const tooLong = computed(() => text.value.length > MAX_VALUE_LENGTH);

function submit() {
  if (!props.canWrite || !changed.value || tooLong.value) return;
  emit('save', text.value);
}
</script>
