<template>
    <div ref="terminalContainer" class="terminal-container" :class="{ 'terminal-fullscreen': isFullscreen }">
        <div class="terminal-header">
            <div class="terminal-title-wrap">
                <div class="terminal-title">Omnipotent Console</div>
                <div class="terminal-meta">
                    <span class="meta-pill" :class="sessionReady ? 'meta-online' : 'meta-offline'">
                        {{ sessionReady ? 'Session Ready' : 'Session Unavailable' }}
                    </span>
                    <span class="meta-pill meta-neutral">{{ shortSessionId }}</span>
                    <span class="meta-pill meta-path" :title="currentPath || 'No current path'">{{ currentPath || 'Connecting...' }}</span>
                </div>
            </div>

            <div class="terminal-controls">
                <button class="terminal-btn" @click="openSession(true)" :disabled="isExecuting">New Session</button>
                <button class="terminal-btn" @click="resetSession" :disabled="!sessionId || isExecuting">Reset Shell</button>
                <button class="terminal-btn" @click="clearScreen">Clear Screen</button>
                <button class="terminal-btn" @click="clearHistory" :disabled="!sessionId || isExecuting">Clear History</button>
                <button class="terminal-btn" @click="toggleHistory">{{ showHistoryPanel ? 'Hide' : 'Show' }} History</button>
                <button class="terminal-btn" @click="toggleFullscreen">{{ isFullscreen ? 'Exit Fullscreen' : 'Fullscreen' }}</button>
            </div>
        </div>

        <div class="terminal-body">
            <aside v-if="showHistoryPanel" class="history-panel">
                <div class="history-header">Session History</div>
                <div class="history-list">
                    <button
                        v-for="cmd in filteredHistory"
                        :key="cmd.commandId"
                        type="button"
                        class="history-item"
                        :class="{
                            'history-success': cmd.status === 'completed',
                            'history-error': cmd.status === 'error',
                            active: selectedCommand?.commandId === cmd.commandId
                        }"
                        @click="loadPreviousCommand(cmd)"
                        :title="cmd.command"
                    >
                        <span class="history-status" :class="`status-${cmd.status}`"></span>
                        <span class="history-copy">
                            <span class="history-cmd">{{ cmd.command }}</span>
                            <span class="history-subline">{{ formatTime(cmd.executedAt) }} · {{ abbreviatePath(cmd.workingDirectory) }}</span>
                        </span>
                    </button>
                </div>
            </aside>

            <div class="terminal-main">
                <div ref="outputContainer" class="terminal-screen" @click="focusInput">
                    <div class="screen-banner">
                        <div class="screen-banner-title">PowerShell session attached to Omnipotent</div>
                        <div class="screen-banner-copy">Working directory, variables, and shell state persist inside this session until you reset or replace it.</div>
                    </div>

                    <div v-if="connectionError" class="screen-alert">{{ connectionError }}</div>

                    <div v-if="transcript.length === 0 && !connectionError" class="terminal-empty">
                        <p>{{ bannerMessage }}</p>
                        <p class="empty-hint">Run a command to start building terminal history for this session.</p>
                    </div>

                    <div v-for="execution in transcript" :key="execution.commandId" class="execution-block">
                        <div class="command-line">
                            <span class="prompt" :title="execution.workingDirectory || currentPath">PS {{ execution.workingDirectory || currentPath }}&gt;</span>
                            <span class="command-text">{{ execution.command }}</span>
                        </div>

                        <pre v-if="execution.output" class="output-text">{{ execution.output }}</pre>
                        <pre v-if="execution.error" class="output-text error-text">{{ execution.error }}</pre>

                        <div class="execution-meta">
                            <span class="status-badge" :class="`badge-${execution.status}`">{{ execution.status }}</span>
                            <span v-if="execution.exitCode !== null && execution.exitCode !== undefined">Exit {{ execution.exitCode }}</span>
                            <span>{{ formatExecutionTime(execution) }}</span>
                            <span>{{ formatTime(execution.executedAt) }}</span>
                        </div>
                    </div>

                    <div v-if="isExecuting" class="live-status">Running command in {{ shortSessionId }}...</div>
                </div>

                <div class="terminal-input-area">
                    <div class="composer-shell" :class="{ disabled: !sessionReady }" @click="focusInput">
                        <span class="composer-prompt" :title="currentPath">PS {{ currentPath || '~' }}&gt;</span>
                        <textarea
                            ref="inputField"
                            v-model="currentCommand"
                            rows="1"
                            class="terminal-input"
                            placeholder="Type a PowerShell command..."
                            spellcheck="false"
                            autocomplete="off"
                            @input="resizeInput"
                            @keydown="handleKeydown"
                        ></textarea>
                        <button
                            class="send-btn"
                            @click="executeCommand"
                            :disabled="currentCommand.trim() === '' || isExecuting || !sessionReady"
                        >
                            {{ isExecuting ? 'Running' : 'Run' }}
                        </button>
                    </div>
                    <div class="input-hint">Enter runs the command. Shift+Enter inserts a newline. Up and Down browse session command history.</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import Swal from 'sweetalert2';
import { RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

const SESSION_STORAGE_KEY = 'omnipotent-terminal-session-id';

const currentCommand = ref('');
const transcript = ref([]);
const commandHistory = ref([]);
const historyIndex = ref(-1);
const isExecuting = ref(false);
const showHistoryPanel = ref(true);
const selectedCommand = ref(null);
const terminalContainer = ref(null);
const outputContainer = ref(null);
const inputField = ref(null);
const sessionId = ref('');
const currentPath = ref('');
const sessionReady = ref(false);
const bannerMessage = ref('Opening terminal session...');
const connectionError = ref('');
const isFullscreen = ref(false);

const filteredHistory = computed(() => commandHistory.value.slice().reverse().slice(0, 60));
const shortSessionId = computed(() => sessionId.value ? `Session ${sessionId.value.slice(0, 8)}` : 'Session pending');

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
        output: record.output || '',
        error: record.error || '',
        status: record.status || 'completed',
        exitCode: record.exitCode ?? null,
        executedAt: record.executedAt || new Date().toISOString(),
        completedAt: record.completedAt || null,
        workingDirectory: record.workingDirectory || currentPath.value || ''
    };
}

function syncSessionState(session) {
    sessionId.value = session?.sessionId || '';
    currentPath.value = session?.currentPath || currentPath.value || '';
    bannerMessage.value = session?.welcomeMessage || 'Terminal session ready.';
    sessionReady.value = Boolean(session?.sessionId);
    connectionError.value = '';
    storeSessionId(sessionId.value);

    const history = Array.isArray(session?.history) ? session.history : [];
    transcript.value = history.map(normalizeRecord);
    commandHistory.value = [...transcript.value];
    historyIndex.value = -1;
    selectedCommand.value = null;
    resizeInput();
    scrollToBottom();
}

async function openSession(forceNew = false) {
    connectionError.value = '';
    bannerMessage.value = 'Opening terminal session...';

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
        connectionError.value = error?.message || 'Failed to connect to the terminal backend.';
        bannerMessage.value = 'Unable to open a PowerShell session right now.';
    }
}

async function executeCommand() {
    const command = currentCommand.value.trim();
    if (!command || isExecuting.value || !sessionReady.value) return;

    const pendingRecord = normalizeRecord({
        commandId: `pending-${Date.now()}`,
        command,
        status: 'running',
        executedAt: new Date().toISOString(),
        workingDirectory: currentPath.value,
        output: '',
        error: '',
        exitCode: null
    });

    transcript.value.push(pendingRecord);
    commandHistory.value.push(pendingRecord);
    currentCommand.value = '';
    historyIndex.value = -1;
    resizeInput();
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

        Object.assign(pendingRecord, normalizeRecord(data));
        currentPath.value = data.currentPath || currentPath.value;
        selectedCommand.value = pendingRecord;
    } catch (error) {
        console.error('Failed to execute terminal command:', error);
        pendingRecord.status = 'error';
        pendingRecord.error = error?.message || 'Failed to execute terminal command.';
        pendingRecord.exitCode = -1;
        pendingRecord.completedAt = new Date().toISOString();
    } finally {
        isExecuting.value = false;
        scrollToBottom();
    }
}

async function clearHistory() {
    if (!sessionId.value) return;

    const result = await Swal.fire({
        icon: 'warning',
        title: 'Clear terminal history?',
        text: 'This clears the saved transcript for the current shell session.',
        showCancelButton: true,
        confirmButtonText: 'Clear History',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#4d9e39',
        background: '#161516',
        color: '#ffffff'
    });

    if (!result.isConfirmed) return;

    try {
        const response = await RequestPOSTFromKliveAPI(
            '/admin/terminal/clear',
            JSON.stringify({ sessionId: sessionId.value }),
            false,
            true
        );

        if (!response.ok) {
            throw new Error(`Failed to clear history (HTTP ${response.status})`);
        }

        transcript.value = [];
        commandHistory.value = [];
        selectedCommand.value = null;
        bannerMessage.value = 'History cleared. Shell state is still active.';
    } catch (error) {
        console.error('Failed to clear terminal history:', error);
    }
}

function clearScreen() {
    transcript.value = [];
    selectedCommand.value = null;
}

async function resetSession() {
    if (!sessionId.value) {
        await openSession(true);
        return;
    }

    const result = await Swal.fire({
        icon: 'warning',
        title: 'Reset shell session?',
        text: 'This starts a fresh PowerShell session and discards current shell state.',
        showCancelButton: true,
        confirmButtonText: 'Reset Session',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#4d9e39',
        background: '#161516',
        color: '#ffffff'
    });

    if (!result.isConfirmed) return;

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

        syncSessionState(data.session);
    } catch (error) {
        console.error('Failed to reset terminal session:', error);
    }
}

function toggleHistory() {
    showHistoryPanel.value = !showHistoryPanel.value;
}

function loadPreviousCommand(cmd) {
    currentCommand.value = cmd.command || '';
    selectedCommand.value = cmd;
    resizeInput();
    focusInput();
}

function focusInput() {
    inputField.value?.focus();
}

function resizeInput() {
    nextTick(() => {
        if (!inputField.value) return;
        inputField.value.style.height = '0px';
        inputField.value.style.height = `${Math.min(inputField.value.scrollHeight, 180)}px`;
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
            const historyItem = commandHistory.value[commandHistory.value.length - 1 - historyIndex.value];
            currentCommand.value = historyItem.command || '';
            resizeInput();
        }
        return;
    }

    if (event.key === 'ArrowDown' && !event.shiftKey && !currentCommand.value.includes('\n')) {
        event.preventDefault();
        if (historyIndex.value > 0) {
            historyIndex.value -= 1;
            const historyItem = commandHistory.value[commandHistory.value.length - 1 - historyIndex.value];
            currentCommand.value = historyItem.command || '';
        } else if (historyIndex.value === 0) {
            historyIndex.value = -1;
            currentCommand.value = '';
        }
        resizeInput();
    }
}

function scrollToBottom() {
    nextTick(() => {
        if (outputContainer.value) {
            outputContainer.value.scrollTop = outputContainer.value.scrollHeight;
        }
    });
}

function syncFullscreenState() {
    if (!process.client) return;
    isFullscreen.value = document.fullscreenElement === terminalContainer.value;
}

async function toggleFullscreen() {
    if (!process.client || !terminalContainer.value) return;

    try {
        if (document.fullscreenElement === terminalContainer.value) {
            await document.exitFullscreen();
            return;
        }

        if (document.fullscreenElement) {
            await document.exitFullscreen();
        }

        await terminalContainer.value.requestFullscreen();
    } catch (error) {
        console.error('Failed to toggle terminal fullscreen:', error);
    }
}

function abbreviatePath(path) {
    if (!path) return 'No path';
    const normalized = path.replace(/\\/g, '/');
    if (normalized.length <= 28) return normalized;
    return `...${normalized.slice(-25)}`;
}

function formatTime(date) {
    if (!date) return '';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleTimeString();
}

function formatExecutionTime(execution) {
    const start = new Date(execution.executedAt);
    const end = execution.completedAt ? new Date(execution.completedAt) : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
    const elapsed = Math.max(end.getTime() - start.getTime(), 0);
    if (elapsed < 1000) return `${elapsed}ms`;
    return `${(elapsed / 1000).toFixed(2)}s`;
}

onMounted(async () => {
    if (process.client) {
        document.addEventListener('fullscreenchange', syncFullscreenState);
    }

    await openSession(false);
});

onBeforeUnmount(() => {
    if (process.client) {
        document.removeEventListener('fullscreenchange', syncFullscreenState);
    }
});
</script>

<style scoped>
.terminal-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: radial-gradient(circle at top, rgba(40, 72, 42, 0.38), rgba(8, 12, 10, 0.98) 45%), #090c0a;
    border: 1px solid rgba(111, 199, 121, 0.18);
    border-radius: 16px;
    overflow: hidden;
    font-family: 'Consolas', 'Courier New', monospace;
    box-shadow: 0 26px 60px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.terminal-fullscreen {
    height: 100vh;
    border-radius: 0;
    border-color: rgba(111, 199, 121, 0.3);
}

.terminal-fullscreen .terminal-screen {
    padding-bottom: 28px;
}

.terminal-header {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    align-items: flex-start;
    padding: 18px 22px;
    border-bottom: 1px solid rgba(111, 199, 121, 0.12);
    background: linear-gradient(180deg, rgba(10, 16, 12, 0.95), rgba(10, 16, 12, 0.75));
}

.terminal-title-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
}

.terminal-title {
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #9df4a0;
}

.terminal-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.meta-pill {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    padding: 6px 10px;
    border-radius: 999px;
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.meta-online {
    background: rgba(46, 179, 82, 0.14);
    color: #9df4a0;
    border: 1px solid rgba(46, 179, 82, 0.22);
}

.meta-offline {
    background: rgba(239, 68, 68, 0.12);
    color: #ff9b9b;
    border: 1px solid rgba(239, 68, 68, 0.2);
}

.meta-neutral {
    background: rgba(148, 163, 184, 0.12);
    color: #cbd5e1;
    border: 1px solid rgba(148, 163, 184, 0.18);
}

.meta-path {
    max-width: min(42vw, 420px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.terminal-controls {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
}

.terminal-btn {
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid rgba(111, 199, 121, 0.22);
    background: rgba(111, 199, 121, 0.08);
    color: #bffac1;
    font-family: inherit;
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.terminal-btn:hover:not(:disabled) {
    background: rgba(111, 199, 121, 0.16);
    border-color: rgba(111, 199, 121, 0.42);
    transform: translateY(-1px);
}

.terminal-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.terminal-body {
    display: flex;
    flex: 1;
    min-height: 0;
}

.history-panel {
    width: 280px;
    border-right: 1px solid rgba(111, 199, 121, 0.1);
    background: linear-gradient(180deg, rgba(9, 13, 11, 0.96), rgba(9, 13, 11, 0.72));
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.history-header {
    padding: 14px 16px;
    font-size: 0.76rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #8fe28f;
    border-bottom: 1px solid rgba(111, 199, 121, 0.1);
}

.history-list {
    flex: 1;
    overflow-y: auto;
    padding: 10px 8px;
}

.history-item {
    width: 100%;
    display: flex;
    gap: 10px;
    align-items: flex-start;
    text-align: left;
    margin-bottom: 8px;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.02);
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease;
}

.history-item:hover,
.history-item.active {
    background: rgba(111, 199, 121, 0.08);
    border-color: rgba(111, 199, 121, 0.16);
}

.history-status {
    width: 10px;
    height: 10px;
    margin-top: 5px;
    border-radius: 999px;
    background: #7c8a7e;
    flex-shrink: 0;
}

.status-completed {
    background: #7fe78a;
}

.status-error {
    background: #ff8c8c;
}

.status-running {
    background: #facc15;
}

.history-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}

.history-cmd {
    color: #edf7ee;
    font-size: 0.8rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.history-subline {
    color: #7f907f;
    font-size: 0.68rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.terminal-main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
}

.terminal-screen {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 20px 22px 18px;
    background:
        linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
        radial-gradient(circle at top left, rgba(111, 199, 121, 0.07), transparent 34%),
        #060907;
    background-size: 100% 22px, auto, auto;
    color: #d7e7d7;
}

.screen-banner {
    margin-bottom: 18px;
    padding: 14px 16px;
    border-radius: 12px;
    border: 1px solid rgba(111, 199, 121, 0.12);
    background: rgba(111, 199, 121, 0.06);
}

.screen-banner-title {
    color: #9df4a0;
    font-size: 0.84rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 6px;
}

.screen-banner-copy {
    color: #9aaf9a;
    font-size: 0.78rem;
    line-height: 1.45;
}

.screen-alert {
    margin-bottom: 18px;
    padding: 12px 14px;
    border-radius: 10px;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.18);
    color: #ffadad;
    font-size: 0.82rem;
}

.terminal-empty {
    padding: 24px 0;
    color: #b0bdb0;
}

.terminal-empty p {
    margin: 0 0 8px;
}

.empty-hint {
    color: #778577;
    font-size: 0.78rem;
}

.execution-block {
    margin-bottom: 18px;
}

.command-line {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin-bottom: 8px;
    font-size: 0.86rem;
}

.prompt {
    color: #8fe28f;
    min-width: 0;
    word-break: break-all;
}

.command-text {
    color: #b8d4ff;
    word-break: break-word;
}

.output-text {
    margin: 0 0 8px 0;
    padding: 12px 14px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(111, 199, 121, 0.1);
    color: #d6e5d6;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-x: auto;
}

.error-text {
    border-color: rgba(239, 68, 68, 0.18);
    background: rgba(239, 68, 68, 0.08);
    color: #ffb5b5;
}

.execution-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 0.7rem;
    color: #7f907f;
}

.status-badge {
    padding: 2px 8px;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
}

.badge-completed {
    background: rgba(46, 179, 82, 0.14);
    color: #9df4a0;
}

.badge-error {
    background: rgba(239, 68, 68, 0.14);
    color: #ffb5b5;
}

.badge-running {
    background: rgba(250, 204, 21, 0.14);
    color: #fde68a;
}

.live-status {
    padding: 12px 14px;
    border-radius: 10px;
    background: rgba(250, 204, 21, 0.1);
    border: 1px solid rgba(250, 204, 21, 0.16);
    color: #fde68a;
    font-size: 0.78rem;
}

.terminal-input-area {
    border-top: 1px solid rgba(111, 199, 121, 0.12);
    background: linear-gradient(180deg, rgba(9, 13, 11, 0.96), rgba(9, 13, 11, 0.88));
    padding: 14px 18px 16px;
}

.composer-shell {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid rgba(111, 199, 121, 0.16);
    border-radius: 14px;
    background: rgba(4, 6, 5, 0.72);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.composer-shell:focus-within {
    border-color: rgba(111, 199, 121, 0.34);
    box-shadow: 0 0 0 1px rgba(111, 199, 121, 0.12);
}

.composer-shell.disabled {
    opacity: 0.6;
}

.composer-prompt {
    max-width: 320px;
    color: #8fe28f;
    font-size: 0.8rem;
    line-height: 1.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
}

.terminal-input {
    flex: 1;
    min-height: 22px;
    max-height: 180px;
    resize: none;
    border: none;
    background: transparent;
    color: #eef8ef;
    font-family: inherit;
    font-size: 0.86rem;
    line-height: 1.5;
    outline: none;
    padding: 0;
}

.terminal-input::placeholder {
    color: #6b776b;
}

.send-btn {
    flex-shrink: 0;
    min-width: 92px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(111, 199, 121, 0.22);
    background: rgba(111, 199, 121, 0.12);
    color: #cbf7cd;
    font-family: inherit;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
}

.send-btn:disabled {
    opacity: 0.42;
    cursor: not-allowed;
}

.input-hint {
    margin-top: 8px;
    color: #6f7e6f;
    font-size: 0.68rem;
    letter-spacing: 0.04em;
}

.terminal-screen::-webkit-scrollbar,
.history-list::-webkit-scrollbar,
.output-text::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

.terminal-screen::-webkit-scrollbar-thumb,
.history-list::-webkit-scrollbar-thumb,
.output-text::-webkit-scrollbar-thumb {
    background: rgba(111, 199, 121, 0.2);
    border-radius: 999px;
}

@media (max-width: 1080px) {
    .terminal-body {
        flex-direction: column;
    }

    .history-panel {
        width: 100%;
        max-height: 200px;
        border-right: none;
        border-bottom: 1px solid rgba(111, 199, 121, 0.1);
    }
}

@media (max-width: 760px) {
    .terminal-header {
        flex-direction: column;
    }

    .terminal-controls {
        justify-content: flex-start;
    }

    .composer-shell {
        flex-direction: column;
        align-items: stretch;
    }

    .composer-prompt {
        max-width: 100%;
    }

    .send-btn {
        width: 100%;
    }
}
</style>