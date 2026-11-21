<template>
  <Teleport to="body">
    <div v-if="request" class="twx-layer twx-scrim" @mousedown.self="answer(false)">
      <div class="twx-dialog twx-confirm" role="alertdialog" aria-modal="true" aria-labelledby="twx-confirm-title" data-testid="twx-confirm" @keydown.esc.prevent="answer(false)">
        <header class="twx-dialog__head">
          <span class="twx-mark" data-tone="crit"><TripwiresIcon name="alert" /></span>
          <div><h2 id="twx-confirm-title">{{ request.title }}</h2></div>
        </header>
        <div class="twx-dialog__body"><p>{{ request.text }}</p></div>
        <footer class="twx-dialog__foot">
          <button ref="cancel" class="twx-btn twx-btn--ghost" @click="answer(false)">Cancel</button>
          <button class="twx-btn twx-btn--danger" data-testid="confirm-yes" @click="answer(true)">{{ request.confirm }}</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { ConfirmRequest } from '~/scripts/tripwires';

const props = defineProps<{ request: ConfirmRequest | null }>();
const emit = defineEmits<{ done: [] }>();
const cancel = ref<HTMLButtonElement | null>(null);

watch(() => props.request, request => { if (request) void nextTick(() => cancel.value?.focus()); });

function answer(yes: boolean) {
  props.request?.resolve(yes);
  emit('done');
}
</script>
