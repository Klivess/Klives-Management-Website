<template>
    <div class="action">
        <div class="head">
            <div style="min-width:0">
                <span class="mono name">{{ action.name }}</span>
                <p v-if="action.paramDescription" class="muted desc">{{ action.paramDescription }}</p>
            </div>
            <span class="kt-chip idle">{{ typeLabel }}</span>
        </div>

        <div class="widget">
            <!-- None: nothing to supply, so nothing to type. -->
            <button v-if="action.parameters === ActionParam.None"
                    class="kt-btn primary" :class="stateClass" :disabled="disabled || state === 'sending'"
                    @click="run('')">
                {{ buttonLabel('Run') }}
            </button>

            <!-- Bool: the gadget reports no state, so this shows what WE last sent and
                 when, rather than implying it knows the switch position. -->
            <template v-else-if="action.parameters === ActionParam.Bool">
                <div class="kt-segment">
                    <button :disabled="disabled || state === 'sending'"
                            :aria-pressed="lastSent === 'true'" @click="run('true')">True</button>
                    <button :disabled="disabled || state === 'sending'"
                            :aria-pressed="lastSent === 'false'" @click="run('false')">False</button>
                </div>
                <span v-if="lastSent" class="muted sent">sent {{ lastSent }} · {{ fmtAgo(lastSentAt, now) }}</span>
            </template>

            <template v-else-if="action.parameters === ActionParam.Integer">
                <input v-model="draft" class="kt-input mono" type="number" step="1"
                       :aria-label="`Value for ${action.name}`" :disabled="disabled"
                       :class="{ invalid: !!validationError }"
                       style="width:130px" @keydown.enter="submit" />
                <button class="kt-btn" :class="stateClass" :disabled="disabled || state === 'sending'"
                        @click="submit">{{ buttonLabel('Send') }}</button>
            </template>

            <template v-else-if="action.parameters === ActionParam.String">
                <!-- An empty string is a valid parameter server-side; do not block it. -->
                <input v-model="draft" class="kt-input" type="text"
                       :aria-label="`Value for ${action.name}`" :disabled="disabled"
                       placeholder="(text, may be empty)" style="min-width:180px;flex:1 1 auto"
                       @keydown.enter="submit" />
                <button class="kt-btn" :class="stateClass" :disabled="disabled || state === 'sending'"
                        @click="submit">{{ buttonLabel('Send') }}</button>
            </template>

            <span v-else class="muted">The gadget advertised a parameter type this page does not know.</span>
        </div>

        <p v-if="validationError" class="err">{{ validationError }}</p>
        <!-- Inline, never a modal: a burst of actions would otherwise stack dialogs. -->
        <p v-else-if="message" class="err" :class="{ ok: state === 'ok' }">{{ message }}</p>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ActionParam, fmtAgo, type GadgetAction } from '~/scripts/kliveTech';

const props = withDefaults(defineProps<{
    action: GadgetAction;
    disabled?: boolean;
    now?: number;
}>(), { now: () => Date.now() });

const emit = defineEmits<{ run: [action: GadgetAction, param: string, done: (error?: string) => void] }>();

const draft = ref('');
const state = ref<'idle' | 'sending' | 'ok' | 'failed'>('idle');
const message = ref('');
const lastSent = ref('');
const lastSentAt = ref<string | null>(null);

const TYPE_LABELS: Record<number, string> = {
    [ActionParam.Integer]: 'integer',
    [ActionParam.String]: 'string',
    [ActionParam.Bool]: 'boolean',
    [ActionParam.None]: 'no parameter',
};
const typeLabel = computed(() => TYPE_LABELS[props.action.parameters] ?? 'unknown');

// The server parses this with int.TryParse, so anything outside Int32 is a 400 that
// would arrive as a confusing "invalid request" a second later.
const validationError = computed(() => {
    if (props.action.parameters !== ActionParam.Integer) return '';
    if (draft.value === '') return '';
    const parsed = Number(draft.value);
    if (!Number.isInteger(parsed)) return 'Must be a whole number.';
    if (parsed > 2147483647 || parsed < -2147483648) return 'Outside the 32-bit integer range.';
    return '';
});

const stateClass = computed(() =>
    state.value === 'ok' ? 'ok' : state.value === 'failed' ? 'danger' : '');

function buttonLabel(base: string): string {
    if (state.value === 'sending') return 'Sending…';
    if (state.value === 'ok') return '✓ Done';
    if (state.value === 'failed') return '✗ Failed';
    return base;
}

function submit() {
    if (validationError.value) return;
    if (props.action.parameters === ActionParam.Integer && draft.value === '') {
        message.value = 'Enter a value first.';
        state.value = 'failed';
        resetLater();
        return;
    }
    run(draft.value);
}

function run(param: string) {
    if (state.value === 'sending') return;
    state.value = 'sending';
    message.value = '';
    emit('run', props.action, param, (error?: string) => {
        if (error) {
            state.value = 'failed';
            message.value = error;
        } else {
            state.value = 'ok';
            lastSent.value = param;
            lastSentAt.value = new Date().toISOString();
        }
        resetLater();
    });
}

function resetLater() {
    const failed = state.value === 'failed';
    setTimeout(() => {
        state.value = 'idle';
        if (!failed) message.value = '';
    }, failed ? 4000 : 2000);
}
</script>

<style scoped>
.action {
    display: flex;
    flex-direction: column;
    gap: var(--kt-space-2);
    padding: var(--kt-space-3);
    border: 1px solid var(--kt-line);
    border-radius: var(--kt-radius-sm);
    background: var(--kt-surface-2);
}
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--kt-space-2); }
.name { font-size: 13px; color: var(--kt-text); }
.desc { font-size: 11px; margin-top: 2px; }
.widget { display: flex; align-items: center; gap: var(--kt-space-2); flex-wrap: wrap; }
.sent { font-size: 10px; }
.err { font-size: 11px; color: var(--kt-lamp-fault); }
.err.ok { color: var(--kt-lamp-ok); }
</style>
