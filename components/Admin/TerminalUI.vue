<template>
    <div class="terminal-container">
        <!-- Terminal Header -->
        <div class="terminal-header">
            <div class="terminal-title">
                <span class="terminal-icon">⌘</span>
                Terminal CLI
            </div>
            <div class="terminal-controls">
                <button class="terminal-btn" @click="clearOutput" title="Clear terminal output">
                    <span>🗑</span> Clear
                </button>
                <button class="terminal-btn" @click="clearHistory" title="Clear command history">
                    <span>📋</span> Clear History
                </button>
                <button class="terminal-btn" @click="toggleHistory" title="Toggle history panel">
                    <span>📜</span> {{ showHistoryPanel ? 'Hide' : 'Show' }} History
                </button>
            </div>
        </div>

        <div class="terminal-body">
            <!-- History Panel -->
            <div v-if="showHistoryPanel" class="history-panel">
                <div class="history-header">Command History</div>
                <div class="history-list">
                    <div
                        v-for="cmd in filteredHistory"
                        :key="cmd.commandId"
                        class="history-item"
                        :class="{
                            'history-success': cmd.status === 'completed',
                            'history-error': cmd.status === 'error',
                            'history-running': cmd.status === 'running',
                            'active': selectedCommand?.commandId === cmd.commandId
                        }"
                        @click="loadPreviousCommand(cmd)"
                        :title="cmd.command"
                    >
                        <div class="history-status">
                            <span v-if="cmd.status === 'completed'" class="status-badge success">✓</span>
                            <span v-else-if="cmd.status === 'error'" class="status-badge error">✕</span>
                            <span v-else-if="cmd.status === 'running'" class="status-badge running">⟳</span>
                            <span v-else class="status-badge pending">◯</span>
                        </div>
                        <div class="history-text">
                            <div class="history-cmd">{{ cmd.command.substring(0, 40) }}</div>
                            <div class="history-time">{{ formatTime(cmd.executedAt) }}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Main Terminal -->
            <div class="terminal-main">
                <!-- Output Display -->
                <div class="terminal-output" ref="outputContainer">
                    <div v-if="executionHistory.length === 0" class="terminal-empty">
                        <div class="empty-message">
                            <p>Welcome to Omnipotent Terminal</p>
                            <p class="empty-hint">Enter a command below or select from history to get started</p>
                        </div>
                    </div>

                    <div v-for="execution in executionHistory" :key="execution.commandId" class="execution-block">
                        <div class="command-line">
                            <span class="prompt">$</span>
                            <span class="command-text">{{ execution.command }}</span>
                        </div>

                        <div v-if="execution.status === 'running'" class="output-section">
                            <div class="status-message running">
                                <span class="spinner">⟳</span> Executing...
                            </div>
                        </div>

                        <div v-else-if="execution.output" class="output-section">
                            <pre class="output-text">{{ execution.output }}</pre>
                        </div>

                        <div v-if="execution.error" class="output-section error">
                            <pre class="output-text error-text">{{ execution.error }}</pre>
                        </div>

                        <div class="execution-meta">
                            <span :class="['status-badge', execution.status]">
                                {{ execution.status.toUpperCase() }}
                            </span>
                            <span v-if="execution.exitCode !== null" class="exit-code">
                                Exit: {{ execution.exitCode }}
                            </span>
                            <span class="execution-time">
                                {{ formatExecutionTime(execution) }}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Command Input -->
                <div class="terminal-input-area">
                    <div class="input-wrapper">
                        <span class="prompt">$</span>
                        <input
                            v-model="currentCommand"
                            type="text"
                            class="terminal-input"
                            placeholder="Enter command..."
                            @keydown="handleKeydown"
                            autocomplete="off"
                            ref="inputField"
                        />
                        <button
                            class="send-btn"
                            @click="executeCommand"
                            :disabled="currentCommand.trim() === '' || isExecuting"
                            title="Execute command (Ctrl+Enter)"
                        >
                            <span v-if="isExecuting">⟳</span>
                            <span v-else>▶</span>
                        </button>
                    </div>
                    <div class="input-hint">Press Enter to execute • ↑↓ for history • Ctrl+L to clear</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';

// State
const currentCommand = ref('');
const executionHistory = ref([]);
const commandHistory = ref([]);
const historyIndex = ref(-1);
const isExecuting = ref(false);
const showHistoryPanel = ref(true);
const selectedCommand = ref(null);
const outputContainer = ref(null);
const inputField = ref(null);

// Constants
const API_BASE = 'https://klive.dev';
const POLL_INTERVAL = 500; // Poll every 500ms for command status
const AUTO_SCROLL_THRESHOLD = 100; // pixels from bottom

// Computed
const filteredHistory = computed(() => {
    return commandHistory.value.slice().reverse().slice(0, 30);
});

// Lifecycle
onMounted(async () => {
    await loadCommandHistory();
    inputField.value?.focus();
});

// Methods
async function executeCommand() {
    const command = currentCommand.value.trim();
    if (!command || isExecuting.value) return;

    isExecuting.value = true;

    try {
        // Send command to backend
        const response = await fetch(`${API_BASE}/admin/terminal/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
                'Authorization': `Bearer ${await getAuthToken()}`
            },
            body: command
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.statusText}`);
        }

        const data = await response.json();
        const commandId = data.commandId;

        // Add to execution history
        const execution = {
            commandId,
            command,
            status: 'running',
            output: '',
            error: '',
            exitCode: null,
            executedAt: new Date()
        };

        executionHistory.value.push(execution);

        // Add to history if not already there
        if (!commandHistory.value.find(c => c.commandId === commandId)) {
            commandHistory.value.push(execution);
        }

        // Clear input
        currentCommand.value = '';
        historyIndex.value = -1;

        // Poll for status
        await pollCommandStatus(commandId, execution);

        // Save history to localStorage
        saveCommandHistory();

        scrollToBottom();
    } catch (error) {
        console.error('Failed to execute command:', error);
        executionHistory.value.push({
            commandId: `err-${Date.now()}`,
            command: currentCommand.value,
            status: 'error',
            output: '',
            error: `Failed to execute: ${error.message}`,
            exitCode: -1,
            executedAt: new Date()
        });
    } finally {
        isExecuting.value = false;
        inputField.value?.focus();
    }
}

async function pollCommandStatus(commandId, executionObj) {
    const maxAttempts = 120; // 60 seconds with 500ms interval
    let attempts = 0;

    while (attempts < maxAttempts && executionObj.status === 'running') {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

        try {
            const response = await fetch(`${API_BASE}/admin/terminal/status?commandId=${commandId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${await getAuthToken()}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                executionObj.status = data.status;
                executionObj.output = data.output || '';
                executionObj.error = data.error || '';
                executionObj.exitCode = data.exitCode;

                if (data.isComplete) {
                    scrollToBottom();
                    break;
                }
            }
        } catch (error) {
            console.warn('Polling error:', error);
        }

        attempts++;
        scrollToBottom();
    }

    if (attempts >= maxAttempts) {
        executionObj.status = 'timeout';
        executionObj.error = 'Command execution timeout (60s limit exceeded)';
    }
}

async function loadCommandHistory() {
    try {
        const response = await fetch(`${API_BASE}/admin/terminal/history?limit=50`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${await getAuthToken()}`
            }
        });

        if (response.ok) {
            commandHistory.value = await response.json();
        }
    } catch (error) {
        console.warn('Failed to load command history:', error);
    }
}

async function loadPreviousCommand(cmd) {
    currentCommand.value = cmd.command;
    selectedCommand.value = cmd;
    inputField.value?.focus();
}

async function clearHistory() {
    if (!confirm('Are you sure you want to clear command history?')) return;

    try {
        await fetch(`${API_BASE}/admin/terminal/clear`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${await getAuthToken()}`
            }
        });

        commandHistory.value = [];
        inputField.value?.focus();
    } catch (error) {
        console.error('Failed to clear history:', error);
    }
}

function clearOutput() {
    executionHistory.value = [];
}

function toggleHistory() {
    showHistoryPanel.value = !showHistoryPanel.value;
}

function handleKeydown(e) {
    if (e.key === 'Enter' && e.ctrlKey) {
        executeCommand();
    } else if (e.key === 'Enter') {
        executeCommand();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (historyIndex.value < commandHistory.value.length - 1) {
            historyIndex.value++;
            const histCmd = commandHistory.value[commandHistory.value.length - 1 - historyIndex.value];
            currentCommand.value = histCmd.command;
        }
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex.value > 0) {
            historyIndex.value--;
            const histCmd = commandHistory.value[commandHistory.value.length - 1 - historyIndex.value];
            currentCommand.value = histCmd.command;
        } else if (historyIndex.value === 0) {
            historyIndex.value = -1;
            currentCommand.value = '';
        }
    } else if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        clearOutput();
    }
}

function scrollToBottom() {
    nextTick(() => {
        if (outputContainer.value) {
            outputContainer.value.scrollTop = outputContainer.value.scrollHeight;
        }
    });
}

function formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleTimeString();
}

function formatExecutionTime(execution) {
    const start = new Date(execution.executedAt);
    let end = execution.status === 'running' ? new Date() : start;

    // Try to calculate from polling if available
    if (execution.status === 'completed' || execution.status === 'error') {
        // Estimate based on output
        const elapsed = 100; // Default estimate
        return `${elapsed}ms`;
    }

    return `${Math.round((end - start))}ms`;
}

async function getAuthToken() {
    // Get token from localStorage or auth system
    return localStorage.getItem('auth_token') || '';
}

function saveCommandHistory() {
    try {
        localStorage.setItem('terminal_history', JSON.stringify(commandHistory.value.slice(-50)));
    } catch (error) {
        console.warn('Failed to save history:', error);
    }
}
</script>

<style scoped>
.terminal-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: linear-gradient(135deg, #0a0e0c 0%, #0f1410 100%);
    border-radius: 12px;
    border: 1px solid rgba(77, 158, 57, 0.15);
    overflow: hidden;
    font-family: 'Fira Code', 'Courier New', monospace;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.terminal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(77, 158, 57, 0.1);
    background: rgba(7, 12, 9, 0.5);
}

.terminal-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
    color: #86c96d;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}

.terminal-icon {
    font-size: 20px;
    opacity: 0.8;
}

.terminal-controls {
    display: flex;
    gap: 8px;
}

.terminal-btn {
    padding: 6px 14px;
    border: 1px solid rgba(77, 158, 57, 0.3);
    border-radius: 6px;
    background: rgba(77, 158, 57, 0.08);
    color: #86c96d;
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.terminal-btn:hover:not(:disabled) {
    background: rgba(77, 158, 57, 0.15);
    border-color: rgba(77, 158, 57, 0.5);
}

.terminal-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.terminal-body {
    display: flex;
    flex: 1;
    overflow: hidden;
}

.history-panel {
    width: 250px;
    border-right: 1px solid rgba(77, 158, 57, 0.1);
    display: flex;
    flex-direction: column;
    background: rgba(7, 12, 9, 0.3);
}

.history-header {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(77, 158, 57, 0.1);
    font-size: 12px;
    font-weight: 600;
    color: #86c96d;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.history-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
}

.history-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    margin: 0 4px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 11px;
    border-left: 2px solid transparent;
}

.history-item:hover {
    background: rgba(77, 158, 57, 0.1);
}

.history-item.active {
    background: rgba(77, 158, 57, 0.15);
    border-left-color: #86c96d;
}

.history-item.history-success {
    color: #86c96d;
}

.history-item.history-error {
    color: #ff6b6b;
}

.history-item.history-running {
    color: #ffd93d;
}

.history-status {
    min-width: 16px;
}

.history-text {
    flex: 1;
    overflow: hidden;
}

.history-cmd {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #e0e0e0;
}

.history-time {
    font-size: 9px;
    color: #888;
    margin-top: 2px;
}

.status-badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    border-radius: 3px;
    background: rgba(77, 158, 57, 0.2);
    color: #86c96d;
}

.status-badge.error {
    background: rgba(255, 107, 107, 0.2);
    color: #ff6b6b;
}

.status-badge.running {
    background: rgba(255, 217, 61, 0.2);
    color: #ffd93d;
}

.status-badge.pending {
    background: rgba(130, 170, 255, 0.2);
    color: #82aaff;
}

.status-badge.timeout {
    background: rgba(255, 107, 107, 0.2);
    color: #ff9999;
}

.terminal-main {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
}

.terminal-output {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    color: #e0e0e0;
}

.terminal-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
}

.empty-message {
    color: #888;
}

.empty-message p {
    margin: 8px 0;
}

.empty-hint {
    font-size: 12px;
    color: #666;
}

.execution-block {
    margin-bottom: 16px;
    border-left: 2px solid rgba(77, 158, 57, 0.2);
    padding-left: 12px;
}

.command-line {
    display: flex;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
    color: #e0e0e0;
}

.prompt {
    color: #86c96d;
    font-weight: 700;
}

.command-text {
    color: #82aaff;
    word-break: break-all;
}

.output-section {
    margin-bottom: 8px;
}

.output-text {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: #d0d0d0;
    white-space: pre-wrap;
    word-wrap: break-word;
    background: rgba(0, 0, 0, 0.2);
    padding: 10px;
    border-radius: 6px;
    border-left: 2px solid rgba(77, 158, 57, 0.3);
    max-height: 400px;
    overflow: auto;
}

.output-text.error-text {
    border-left-color: #ff6b6b;
    color: #ff9999;
}

.status-message {
    padding: 10px;
    border-radius: 6px;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.status-message.running {
    color: #ffd93d;
    background: rgba(255, 217, 61, 0.1);
    border-left: 2px solid #ffd93d;
}

.spinner {
    display: inline-block;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}

.execution-meta {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: #999;
    margin-top: 6px;
}

.exit-code {
    color: #888;
}

.execution-time {
    color: #777;
}

.terminal-input-area {
    border-top: 1px solid rgba(77, 158, 57, 0.1);
    padding: 12px 20px;
    background: rgba(7, 12, 9, 0.5);
}

.input-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(77, 158, 57, 0.2);
    border-radius: 8px;
    padding: 8px 12px;
    transition: all 0.2s ease;
}

.input-wrapper:focus-within {
    border-color: rgba(77, 158, 57, 0.5);
    background: rgba(0, 0, 0, 0.5);
}

.terminal-input {
    flex: 1;
    background: transparent;
    border: none;
    color: #e0e0e0;
    font-family: inherit;
    font-size: 13px;
    outline: none;
    caret-color: #86c96d;
}

.terminal-input::placeholder {
    color: #666;
}

.send-btn {
    width: 32px;
    height: 32px;
    border: 1px solid rgba(77, 158, 57, 0.3);
    border-radius: 6px;
    background: rgba(77, 158, 57, 0.1);
    color: #86c96d;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.send-btn:hover:not(:disabled) {
    background: rgba(77, 158, 57, 0.2);
    border-color: rgba(77, 158, 57, 0.5);
}

.send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.input-hint {
    font-size: 10px;
    color: #666;
    margin-top: 6px;
    letter-spacing: 0.05em;
}

/* Scrollbar styling */
.terminal-output::-webkit-scrollbar,
.history-list::-webkit-scrollbar,
.output-text::-webkit-scrollbar {
    width: 8px;
}

.terminal-output::-webkit-scrollbar-track,
.history-list::-webkit-scrollbar-track,
.output-text::-webkit-scrollbar-track {
    background: transparent;
}

.terminal-output::-webkit-scrollbar-thumb,
.history-list::-webkit-scrollbar-thumb,
.output-text::-webkit-scrollbar-thumb {
    background: rgba(77, 158, 57, 0.2);
    border-radius: 4px;
}

.terminal-output::-webkit-scrollbar-thumb:hover,
.history-list::-webkit-scrollbar-thumb:hover,
.output-text::-webkit-scrollbar-thumb:hover {
    background: rgba(77, 158, 57, 0.4);
}

/* Responsive */
@media (max-width: 768px) {
    .history-panel {
        display: none;
    }

    .terminal-controls {
        flex-wrap: wrap;
    }

    .terminal-btn {
        padding: 4px 10px;
        font-size: 10px;
    }
}
</style>
