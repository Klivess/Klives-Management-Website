<template>
    <div class="terminal">
        <div class="titlebar">
            <span class="titlebar-name">Windows PowerShell</span>
            <span class="titlebar-path" :title="currentPath">{{ currentPath }}</span>
            <span class="titlebar-spacer"></span>
            <button class="titlebar-btn" @click="clearScreen">clear</button>
            <button class="titlebar-btn" @click="resetSession" :disabled="isExecuting">restart</button>
        </div>

        <div ref="screen" class="screen" @click="focusInput">
            <div v-if="banner" class="line dim">{{ banner }}</div>

            <div v-for="execution in transcript" :key="execution.commandId" class="entry">
                <div class="line">
                    <span class="prompt">PS {{ execution.workingDirectory || currentPath }}&gt;</span>
                    <span>{{ execution.command }}</span>
                </div>
                <pre v-if="execution.output" class="out">{{ execution.output }}</pre>
                <pre v-if="execution.error" class="out err">{{ execution.error }}</pre>
            </div>

            <div v-if="sessionReady" class="line prompt-line">
                <span class="prompt">PS {{ currentPath }}&gt;</span>
                <textarea
                    ref="inputField"
                    v-model="currentCommand"
                    rows="1"
                    class="input"
                    spellcheck="false"
                    autocomplete="off"
                    autocapitalize="off"
                    :disabled="isExecuting"
                    @input="resizeInput"
                    @keydown="handleKeydown"
                ></textarea>
            </div>
        </div>
    </div>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue';
import { RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

const SESSION_STORAGE_KEY = 'omnipotent-terminal-session-id';

const currentCommand = ref('');
const transcript = ref([]);
const commandHistory = ref([]);
const historyIndex = ref(-1);
const isExecuting = ref(false);
const screen = ref(null);
const inputField = ref(null);
const sessionId = ref('');
const currentPath = ref('');
const sessionReady = ref(false);
const banner = ref('Connecting...');

function readStoredSessionId() {
    if (!process.client) return '';
    return localStorage.getItem(SESSION_STORAGE_KEY) || '';
}

function storeSessionId(value) {
    if (!process.client) return;

    if (!value) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        return;
    }

    localStorage.setItem(SESSION_STORAGE_KEY, value);
}

function normalizeRecord(record) {
    return {
        commandId: record.commandId || `command-${Date.now()}-${Math.random()}`,
        sessionId: record.sessionId || sessionId.value,
        command: record.command || '',
        output: trimTrailing(record.output),
        error: trimTrailing(record.error),
        status: record.status || 'completed',
        exitCode: record.exitCode ?? null,
        workingDirectory: record.workingDirectory || currentPath.value || ''
    };
}

function trimTrailing(text) {
    return (text || '').replace(/\s+$/, '');
}

function syncSessionState(session) {
    sessionId.value = session?.sessionId || '';
    currentPath.value = session?.currentPath || currentPath.value || '';
    banner.value = session?.welcomeMessage || '';
    sessionReady.value = Boolean(session?.sessionId);
    storeSessionId(sessionId.value);

    const history = Array.isArray(session?.history) ? session.history : [];
    transcript.value = history.map(normalizeRecord);
    commandHistory.value = [...transcript.value];
    historyIndex.value = -1;
    resizeInput();
    focusInput();
    scrollToBottom();
}

async function openSession(forceNew = false) {
    banner.value = 'Connecting...';

    try {
        const response = await RequestPOSTFromKliveAPI(
            '/admin/terminal/session/open',
            JSON.stringify({ sessionId: forceNew ? null : readStoredSessionId() }),
            false,
            true
        );

        const data = await response.json();
        if (!response.ok || !data?.success || !data?.session) {
            throw new Error(data?.error || `Failed to open terminal session (HTTP ${response.status})`);
        }

        syncSessionState(data.session);
    } catch (error) {
        console.error('Failed to open terminal session:', error);
        sessionReady.value = false;
        sessionId.value = '';
        currentPath.value = '';
        storeSessionId('');
        banner.value = error?.message || 'Failed to connect to the terminal backend.';
    }
}

async function executeCommand() {
    const command = currentCommand.value.trim();
    if (!command || isExecuting.value || !sessionReady.value) return;

    commandHistory.value.push({ command });
    currentCommand.value = '';
    historyIndex.value = -1;
    resizeInput();

    if (/^(cls|clear|clear-host)$/i.test(command)) {
        clearScreen();
        return;
    }

    const pendingRecord = normalizeRecord({
        commandId: `pending-${Date.now()}`,
        command,
        status: 'running',
        workingDirectory: currentPath.value
    });

    transcript.value.push(pendingRecord);
    scrollToBottom();
    isExecuting.value = true;

    try {
        const response = await RequestPOSTFromKliveAPI(
            '/admin/terminal/session/execute',
            JSON.stringify({ sessionId: sessionId.value, command }),
            false,
            true
        );

        const data = await response.json();
        if (!response.ok || !data?.success) {
            throw new Error(data?.error || `Command failed (HTTP ${response.status})`);
        }

        Object.assign(pendingRecord, normalizeRecord(data), { workingDirectory: pendingRecord.workingDirectory });
        currentPath.value = data.currentPath || currentPath.value;
    } catch (error) {
        console.error('Failed to execute terminal command:', error);
        pendingRecord.status = 'error';
        pendingRecord.error = error?.message || 'Failed to execute terminal command.';
        pendingRecord.exitCode = -1;
    } finally {
        isExecuting.value = false;
        focusInput();
        scrollToBottom();
    }
}

function clearScreen() {
    transcript.value = [];
    banner.value = '';
    focusInput();
}

async function resetSession() {
    if (!sessionId.value) {
        await openSession(true);
        return;
    }

    try {
        const response = await RequestPOSTFromKliveAPI(
            '/admin/terminal/session/reset',
            JSON.stringify({ sessionId: sessionId.value }),
            false,
            true
        );

        const data = await response.json();
        if (!response.ok || !data?.success || !data?.session) {
            throw new Error(data?.error || `Failed to reset session (HTTP ${response.status})`);
        }

        transcript.value = [];
        syncSessionState(data.session);
    } catch (error) {
        console.error('Failed to reset terminal session:', error);
        banner.value = error?.message || 'Failed to reset the terminal session.';
    }
}

function focusInput() {
    nextTick(() => inputField.value?.focus());
}

function resizeInput() {
    nextTick(() => {
        if (!inputField.value) return;
        inputField.value.style.height = '0px';
        inputField.value.style.height = `${inputField.value.scrollHeight}px`;
    });
}

function handleKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        executeCommand();
        return;
    }

    if (event.key === 'ArrowUp' && !event.shiftKey && !currentCommand.value.includes('\n')) {
        event.preventDefault();
        if (historyIndex.value < commandHistory.value.length - 1) {
            historyIndex.value += 1;
            currentCommand.value = commandHistory.value[commandHistory.value.length - 1 - historyIndex.value]?.command || '';
            resizeInput();
        }
        return;
    }

    if (event.key === 'ArrowDown' && !event.shiftKey && !currentCommand.value.includes('\n')) {
        event.preventDefault();
        if (historyIndex.value > 0) {
            historyIndex.value -= 1;
            currentCommand.value = commandHistory.value[commandHistory.value.length - 1 - historyIndex.value]?.command || '';
        } else if (historyIndex.value === 0) {
            historyIndex.value = -1;
            currentCommand.value = '';
        }
        resizeInput();
    }
}

function scrollToBottom() {
    nextTick(() => {
        if (screen.value) {
            screen.value.scrollTop = screen.value.scrollHeight;
        }
    });
}

onMounted(async () => {
    await openSession(false);
});
</script>

<style scoped>
.terminal {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #0c0c0c;
    border: 1px solid #2a2a2a;
    border-radius: 6px;
    overflow: hidden;
    font-family: 'Cascadia Mono', 'Consolas', 'Courier New', monospace;
    font-size: 0.82rem;
    line-height: 1.35;
}

.titlebar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 8px;
    background: #1b1b1b;
    border-bottom: 1px solid #2a2a2a;
    color: #9a9a9a;
    font-size: 0.72rem;
}

.titlebar-name {
    color: #cccccc;
}

.titlebar-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.titlebar-spacer {
    flex: 1;
}

.titlebar-btn {
    padding: 1px 6px;
    border: 1px solid #333;
    border-radius: 3px;
    background: transparent;
    color: #9a9a9a;
    font-family: inherit;
    font-size: 0.7rem;
    cursor: pointer;
}

.titlebar-btn:hover:not(:disabled) {
    background: #2a2a2a;
    color: #dddddd;
}

.titlebar-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.screen {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 6px 10px 10px;
    color: #cccccc;
    cursor: text;
}

.entry {
    margin-bottom: 2px;
}

.line {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    white-space: pre-wrap;
    word-break: break-word;
}

.prompt {
    color: #7fba7f;
    flex-shrink: 0;
    white-space: pre;
}

.dim {
    color: #7a7a7a;
    margin-bottom: 6px;
}

.out {
    margin: 0;
    padding: 0;
    font: inherit;
    color: #cccccc;
    white-space: pre-wrap;
    word-break: break-word;
}

.err {
    color: #f47171;
}

.prompt-line {
    margin-top: 2px;
}

.input {
    flex: 1;
    min-width: 0;
    border: none;
    padding: 0;
    margin: 0;
    resize: none;
    overflow: hidden;
    background: transparent;
    color: #ffffff;
    font: inherit;
    line-height: inherit;
    outline: none;
    caret-color: #cccccc;
}

.input:disabled {
    color: #7a7a7a;
}

.screen::-webkit-scrollbar {
    width: 10px;
}

.screen::-webkit-scrollbar-thumb {
    background: #3a3a3a;
}

.screen::-webkit-scrollbar-track {
    background: #141414;
}
</style>
