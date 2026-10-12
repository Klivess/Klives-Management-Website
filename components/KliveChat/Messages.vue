<template>
    <div class="kc-chat">
        <div ref="list" class="kc-chat-list" role="log" aria-live="polite" @scroll="onScroll">
            <p v-if="!entries.length" class="kc-chat-empty">No messages</p>
            <template v-for="(entry, index) in entries" :key="entry.key">
                <div v-if="entry.system" class="kc-chat-system">{{ entry.text }} <time>{{ clockTime(entry.ts) }}</time></div>
                <div v-else class="kc-msg" :class="{ mine: entry.senderId === selfId, grouped: grouped(index), pending: entry.state === 'pending' }">
                    <div v-if="!grouped(index)" class="kc-msg-head">
                        <span class="kc-msg-who">{{ entry.senderId === selfId ? 'You' : entry.senderName }}</span>
                        <span v-if="entry.senderIsGuest && entry.senderId !== selfId" class="kc-tag">guest</span>
                        <time>{{ clockTime(entry.ts) }}</time>
                    </div>
                    <div class="kc-msg-text"><template v-for="(part, i) in linkify(entry.text)" :key="i"><a v-if="part.href" :href="part.href" target="_blank" rel="noopener noreferrer">{{ part.text }}</a><template v-else>{{ part.text }}</template></template></div>
                    <button v-if="entry.state === 'failed'" type="button" class="kc-msg-retry" @click="$emit('retry', entry.key)">Not sent · Retry</button>
                </div>
            </template>
        </div>
        <button v-if="!atBottom" type="button" class="kc-chat-jump" @click="scrollToBottom(true)">Latest ↓</button>
        <form class="kc-chat-form" @submit.prevent="submit">
            <textarea ref="input" v-model="draft" rows="1" :maxlength="2000" :placeholder="disabled ? 'Reconnecting…' : 'Message'"
                      :disabled="disabled" aria-label="Message" @keydown.enter.exact.prevent="submit" @input="autosize"></textarea>
            <button type="submit" class="kc-send" :disabled="disabled || !draft.trim()" title="Send (Enter)">
                <KliveChatIcon name="send" :size="18" />
            </button>
        </form>
    </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import type { ChatEntry } from '~/scripts/klivechat/call';
import { clockTime, linkify } from '~/scripts/klivechat/format';

const props = defineProps<{ entries: ChatEntry[]; selfId: string; disabled?: boolean }>();
const emit = defineEmits<{ send: [text: string]; retry: [key: string] }>();

const list = ref<HTMLElement | null>(null);
const input = ref<HTMLTextAreaElement | null>(null);
const draft = ref('');
const atBottom = ref(true);

/** Consecutive messages from one person within five minutes share a header. */
function grouped(index: number): boolean {
    const entry = props.entries[index];
    const previous = props.entries[index - 1];
    return !!previous && !previous.system && previous.senderId === entry.senderId && entry.ts - previous.ts < 5 * 60_000;
}

function onScroll() {
    const el = list.value;
    if (el) atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}

function scrollToBottom(smooth = false) {
    const el = list.value;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    atBottom.value = true;
}

function autosize() {
    const el = input.value;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
}

function submit() {
    const text = draft.value.trim();
    if (!text || props.disabled) return;
    emit('send', text);
    draft.value = '';
    void nextTick(() => {
        autosize();
        scrollToBottom();
    });
}

function focusInput() {
    input.value?.focus();
}

watch(() => props.entries.length, () => {
    // Follow new messages unless the reader has scrolled up to read history.
    if (atBottom.value) void nextTick(() => scrollToBottom());
});

onMounted(() => {
    scrollToBottom();
    focusInput();
});

defineExpose({ focusInput });
</script>

<style scoped>
.kc-chat { position: relative; display: flex; flex-direction: column; min-height: 0; height: 100%; }
.kc-chat-list { flex: 1 1 auto; overflow-y: auto; padding: var(--ot-space-3) var(--ot-space-4); display: flex; flex-direction: column; gap: 2px; scrollbar-width: thin; }
.kc-chat-empty { margin: auto; color: var(--ot-muted); font-size: 12.5px; }
.kc-chat-system { align-self: center; margin: 6px 0; font-size: 11.5px; color: var(--ot-muted); text-align: center; }
.kc-chat-system time { color: var(--ot-disabled); margin-left: 4px; }
.kc-msg { padding: 2px 0; }
.kc-msg:not(.grouped) { margin-top: 8px; }
.kc-msg.pending { opacity: 0.6; }
.kc-msg-head { display: flex; align-items: baseline; gap: 6px; font-size: 12px; }
.kc-msg-who { font-weight: 650; color: var(--ot-text); }
.kc-msg.mine .kc-msg-who { color: var(--ot-accent); }
.kc-msg-head time { color: var(--ot-muted); font-size: 11px; }
.kc-msg-text { font-size: 13.5px; line-height: 19px; color: var(--ot-text); white-space: pre-wrap; overflow-wrap: anywhere; }
.kc-msg-text a { color: var(--ot-info); text-decoration: underline; text-underline-offset: 2px; }
.kc-msg-retry { margin-top: 2px; padding: 0; border: 0; background: none; color: var(--ot-negative); font-size: 11.5px; cursor: pointer; }
.kc-tag { font-size: 10px; line-height: 14px; padding: 0 5px; border-radius: 4px; color: var(--ot-muted); border: 1px solid var(--ot-line-strong); }
.kc-chat-jump {
    position: absolute;
    left: 50%;
    bottom: 64px;
    transform: translateX(-50%);
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--ot-line-strong);
    background: var(--ot-surface-2);
    color: var(--ot-text);
    font-size: 12px;
    cursor: pointer;
}
.kc-chat-jump:hover { border-color: var(--ot-accent); }
.kc-chat-form { display: flex; align-items: flex-end; gap: var(--ot-space-2); padding: var(--ot-space-3); border-top: 1px solid var(--ot-line); }
.kc-chat-form textarea {
    flex: 1 1 auto;
    min-height: 36px;
    max-height: 140px;
    resize: none;
    padding: 8px 10px;
    border-radius: var(--ot-radius);
    border: 1px solid var(--ot-line);
    background: rgba(0, 0, 0, 0.3);
    color: var(--ot-text);
    font: inherit;
    font-size: 13.5px;
    line-height: 19px;
}
.kc-chat-form textarea:focus { outline: none; border-color: var(--ot-line-strong); }
.kc-send {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--ot-radius);
    border: 0;
    background: var(--ot-accent);
    color: var(--ot-on-accent);
    cursor: pointer;
}
.kc-send:disabled { background: var(--ot-surface-3); color: var(--ot-disabled); cursor: default; }
</style>
