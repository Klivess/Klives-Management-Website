<template>
  <div class="agent-container">
    <div class="agent-header">
      <h1 class="agent-title">KliveAgent</h1>
      <p class="agent-subtitle">AI assistant for Omnipotent</p>
    </div>

    <div class="agent-layout">
      <!-- Chat Panel -->
      <div class="agent-chat-panel">
        <div class="chat-messages" ref="chatMessages">
          <div v-if="messages.length === 0" class="chat-empty">
            <p>No messages yet. Say something to KliveAgent.</p>
          </div>
          <div v-for="(msg, i) in messages" :key="i" class="chat-bubble" :class="msg.role === 'User' ? 'bubble-user' : 'bubble-agent'">
            <div class="bubble-role">{{ msg.role }}</div>
            <div class="bubble-content" v-html="renderMarkdown(msg.content)"></div>
            <div v-if="msg.scripts && msg.scripts.length" class="bubble-scripts">
              <div v-for="(script, si) in msg.scripts" :key="si" class="script-result" :class="script.success ? 'script-ok' : 'script-err'">
                <div class="script-header">
                  <span>{{ script.success ? '✓ Script' : '✗ Script Failed' }}</span>
                  <span class="script-time">{{ script.executionTimeMs }}ms</span>
                </div>
                <pre class="script-code">{{ script.code }}</pre>
                <pre v-if="script.output" class="script-output">{{ script.output }}</pre>
                <pre v-if="script.errorMessage" class="script-error">{{ script.errorMessage }}</pre>
              </div>
            </div>
            <div class="bubble-time">{{ formatTime(msg.timestamp) }}</div>
          </div>
          <div v-if="loading" class="chat-bubble bubble-agent">
            <div class="bubble-role">KliveAgent</div>
            <div class="bubble-content typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>

        <div class="chat-input-row">
          <input v-model="inputMessage" @keydown.enter="sendMessage" placeholder="Ask KliveAgent anything..." class="chat-input" :disabled="loading" />
          <button @click="sendMessage" class="chat-send-btn" :disabled="loading || !inputMessage.trim()">Send</button>
        </div>
      </div>

      <!-- Side Panel -->
      <div class="agent-side-panel">
        <!-- Tabs -->
        <div class="side-tabs">
          <button @click="activeTab = 'tasks'" :class="{ 'tab-active': activeTab === 'tasks' }" class="side-tab">Tasks</button>
          <button @click="activeTab = 'memories'" :class="{ 'tab-active': activeTab === 'memories' }" class="side-tab">Memories</button>
          <button @click="activeTab = 'conversations'" :class="{ 'tab-active': activeTab === 'conversations' }" class="side-tab">History</button>
        </div>

        <!-- Tasks Tab -->
        <div v-if="activeTab === 'tasks'" class="side-content">
          <button @click="loadTasks" class="refresh-btn">Refresh</button>
          <div v-if="tasks.length === 0" class="side-empty">No background tasks.</div>
          <div v-for="task in tasks" :key="task.taskId" class="task-card">
            <div class="task-header">
              <span class="task-status" :class="'status-' + task.status.toLowerCase()">{{ task.status }}</span>
              <button v-if="task.status === 'Running'" @click="cancelTask(task.taskId)" class="cancel-btn">Cancel</button>
            </div>
            <div class="task-desc">{{ task.description }}</div>
            <div class="task-time">{{ formatTime(task.createdAt) }}</div>
            <pre v-if="task.result" class="task-result">{{ task.result }}</pre>
            <pre v-if="task.errorMessage" class="task-error">{{ task.errorMessage }}</pre>
          </div>
        </div>

        <!-- Memories Tab -->
        <div v-if="activeTab === 'memories'" class="side-content">
          <div class="memory-controls">
            <input v-model="memorySearch" placeholder="Search memories..." class="memory-search" @input="searchMemories" />
            <button @click="showAddMemory = !showAddMemory" class="add-memory-btn">+</button>
          </div>
          <div v-if="showAddMemory" class="add-memory-form">
            <input v-model="newMemory.content" placeholder="Memory content..." class="memory-input" />
            <input v-model="newMemory.tags" placeholder="Tags (comma-separated)" class="memory-input" />
            <button @click="addMemory" class="save-memory-btn">Save</button>
          </div>
          <div v-if="memories.length === 0" class="side-empty">No memories found.</div>
          <div v-for="mem in memories" :key="mem.id" class="memory-card">
            <div class="memory-content">{{ mem.content }}</div>
            <div class="memory-meta">
              <span v-for="tag in mem.tags" :key="tag" class="memory-tag">{{ tag }}</span>
              <span class="memory-date">{{ formatTime(mem.createdAt) }}</span>
            </div>
            <button @click="deleteMemory(mem.id)" class="delete-memory-btn">×</button>
          </div>
        </div>

        <!-- Conversations Tab -->
        <div v-if="activeTab === 'conversations'" class="side-content">
          <button @click="loadConversations" class="refresh-btn">Refresh</button>
          <div v-if="conversationList.length === 0" class="side-empty">No conversations.</div>
          <div v-for="conv in conversationList" :key="conv.conversationId" class="conv-card" @click="loadConversation(conv.conversationId)">
            <div class="conv-channel">{{ conv.sourceChannel }}</div>
            <div class="conv-preview">{{ conv.lastMessage || 'Empty' }}</div>
            <div class="conv-meta">{{ conv.messageCount }} messages · {{ formatTime(conv.lastUpdated) }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

definePageMeta({ layout: 'navbar' });

const messages = ref([]);
const inputMessage = ref('');
const loading = ref(false);
const conversationId = ref(null);
const chatMessages = ref(null);

const activeTab = ref('tasks');
const tasks = ref([]);
const memories = ref([]);
const memorySearch = ref('');
const conversationList = ref([]);

const showAddMemory = ref(false);
const newMemory = ref({ content: '', tags: '' });

async function sendMessage() {
  const msg = inputMessage.value.trim();
  if (!msg || loading.value) return;

  messages.value.push({ role: 'User', content: msg, timestamp: new Date().toISOString() });
  inputMessage.value = '';
  loading.value = true;
  scrollToBottom();

  try {
    const body = JSON.stringify({ message: msg, conversationId: conversationId.value });
    const res = await RequestPOSTFromKliveAPI('/kliveagent/chat', body, true, true);
    const data = await res.json();

    if (data.success !== false) {
      conversationId.value = data.conversationId;
      messages.value.push({
        role: 'KliveAgent',
        content: data.response,
        scripts: data.scriptsExecuted || [],
        timestamp: new Date().toISOString()
      });
    } else {
      messages.value.push({
        role: 'KliveAgent',
        content: data.response || data.errorMessage || 'Something went wrong.',
        timestamp: new Date().toISOString()
      });
    }
  } catch (err) {
    messages.value.push({
      role: 'KliveAgent',
      content: 'Failed to reach KliveAgent API: ' + err.message,
      timestamp: new Date().toISOString()
    });
  }

  loading.value = false;
  scrollToBottom();
}

function scrollToBottom() {
  nextTick(() => {
    if (chatMessages.value) {
      chatMessages.value.scrollTop = chatMessages.value.scrollHeight;
    }
  });
}

function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Tasks
async function loadTasks() {
  try {
    const res = await RequestGETFromKliveAPI('/kliveagent/tasks');
    tasks.value = await res.json();
  } catch { }
}

async function cancelTask(taskId) {
  try {
    await RequestPOSTFromKliveAPI('/kliveagent/tasks/cancel', JSON.stringify({ taskId }), true, true);
    await loadTasks();
  } catch { }
}

// Memories
async function searchMemories() {
  try {
    const q = memorySearch.value ? `?query=${encodeURIComponent(memorySearch.value)}` : '';
    const res = await RequestGETFromKliveAPI('/kliveagent/memories' + q);
    memories.value = await res.json();
  } catch { }
}

async function addMemory() {
  if (!newMemory.value.content.trim()) return;
  try {
    const body = JSON.stringify({
      content: newMemory.value.content,
      tags: newMemory.value.tags.split(',').map(t => t.trim()).filter(Boolean),
      importance: 1
    });
    await RequestPOSTFromKliveAPI('/kliveagent/memories/add', body, true, true);
    newMemory.value = { content: '', tags: '' };
    showAddMemory.value = false;
    await searchMemories();
  } catch { }
}

async function deleteMemory(id) {
  try {
    await RequestPOSTFromKliveAPI('/kliveagent/memories/delete', JSON.stringify({ id }), true, true);
    await searchMemories();
  } catch { }
}

// Conversations
async function loadConversations() {
  try {
    const res = await RequestGETFromKliveAPI('/kliveagent/conversations');
    conversationList.value = await res.json();
  } catch { }
}

async function loadConversation(convId) {
  try {
    const res = await RequestGETFromKliveAPI(`/kliveagent/conversations/get?id=${convId}`);
    const data = await res.json();
    conversationId.value = convId;
    messages.value = data.messages.map(m => ({
      role: m.role === 'User' ? 'User' : 'KliveAgent',
      content: m.content,
      timestamp: m.timestamp
    }));
    scrollToBottom();
  } catch { }
}

onMounted(() => {
  loadTasks();
  searchMemories();
  loadConversations();
});
</script>

<style scoped>
.agent-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
  font-family: 'Segoe UI', sans-serif;
  color: #e0e0e0;
}

.agent-header {
  margin-bottom: 24px;
}

.agent-title {
  font-size: 28px;
  font-weight: 700;
  color: #4d9e39;
  margin: 0;
}

.agent-subtitle {
  color: #888;
  margin: 4px 0 0 0;
  font-size: 14px;
}

.agent-layout {
  display: flex;
  gap: 20px;
  height: calc(100vh - 180px);
}

/* Chat Panel */
.agent-chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  border-radius: 12px;
  border: 1px solid #2a2a2a;
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-empty {
  text-align: center;
  color: #555;
  padding: 40px;
}

.chat-bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
}

.bubble-user {
  align-self: flex-end;
  background: #2a4a22;
  border: 1px solid #3a6a30;
}

.bubble-agent {
  align-self: flex-start;
  background: #252525;
  border: 1px solid #333;
}

.bubble-role {
  font-size: 11px;
  font-weight: 600;
  color: #4d9e39;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.bubble-user .bubble-role { color: #7dc96e; }

.bubble-content { word-break: break-word; }
.bubble-content code {
  background: #111;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 13px;
  color: #7dc96e;
}

.bubble-time {
  font-size: 10px;
  color: #555;
  margin-top: 4px;
  text-align: right;
}

/* Script results */
.bubble-scripts { margin-top: 8px; }

.script-result {
  background: #111;
  border-radius: 6px;
  padding: 8px;
  margin-top: 6px;
  font-size: 12px;
  border-left: 3px solid #4d9e39;
}

.script-err { border-left-color: #c0392b; }

.script-header {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
  margin-bottom: 4px;
  color: #999;
}

.script-time { color: #666; }

.script-code, .script-output, .script-error {
  margin: 4px 0 0 0;
  padding: 6px;
  background: #0a0a0a;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 11px;
  white-space: pre-wrap;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
}

.script-output { color: #7dc96e; }
.script-error { color: #e74c3c; }

/* Typing indicator */
.typing-indicator span {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4d9e39;
  margin-right: 4px;
  animation: blink 1.4s infinite both;
}

.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

@keyframes blink {
  0%, 80%, 100% { opacity: 0.3; }
  40% { opacity: 1; }
}

/* Chat input */
.chat-input-row {
  display: flex;
  padding: 12px;
  background: #151515;
  border-top: 1px solid #2a2a2a;
  gap: 8px;
}

.chat-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #333;
  border-radius: 8px;
  background: #1a1a1a;
  color: #e0e0e0;
  font-size: 14px;
  outline: none;
}

.chat-input:focus { border-color: #4d9e39; }
.chat-input::placeholder { color: #555; }

.chat-send-btn {
  padding: 10px 20px;
  background: #4d9e39;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.chat-send-btn:hover:not(:disabled) { background: #3d8e29; }
.chat-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Side Panel */
.agent-side-panel {
  width: 340px;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  border-radius: 12px;
  border: 1px solid #2a2a2a;
  overflow: hidden;
}

.side-tabs {
  display: flex;
  border-bottom: 1px solid #2a2a2a;
}

.side-tab {
  flex: 1;
  padding: 10px;
  background: transparent;
  border: none;
  color: #888;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  transition: color 0.2s, background 0.2s;
}

.side-tab:hover { color: #ccc; background: #222; }
.tab-active { color: #4d9e39; border-bottom: 2px solid #4d9e39; }

.side-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.side-empty {
  text-align: center;
  color: #555;
  padding: 20px;
  font-size: 13px;
}

.refresh-btn {
  width: 100%;
  padding: 6px;
  background: #252525;
  border: 1px solid #333;
  border-radius: 6px;
  color: #888;
  font-size: 12px;
  cursor: pointer;
  margin-bottom: 8px;
}

.refresh-btn:hover { background: #2a2a2a; color: #ccc; }

/* Task cards */
.task-card {
  background: #222;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
  border: 1px solid #2a2a2a;
}

.task-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }

.task-status {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 4px;
}

.status-running { background: #2a4a22; color: #7dc96e; }
.status-completed { background: #1a3a1a; color: #4d9e39; }
.status-failed { background: #3a1a1a; color: #e74c3c; }
.status-cancelled { background: #3a3a1a; color: #f39c12; }

.cancel-btn {
  font-size: 11px;
  padding: 2px 8px;
  background: #3a1a1a;
  color: #e74c3c;
  border: 1px solid #e74c3c33;
  border-radius: 4px;
  cursor: pointer;
}

.task-desc { font-size: 13px; color: #ccc; }
.task-time { font-size: 11px; color: #555; margin-top: 4px; }
.task-result, .task-error {
  font-size: 11px;
  margin-top: 6px;
  padding: 6px;
  background: #111;
  border-radius: 4px;
  white-space: pre-wrap;
  font-family: monospace;
}
.task-error { color: #e74c3c; }

/* Memory cards */
.memory-controls {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.memory-search {
  flex: 1;
  padding: 6px 10px;
  background: #222;
  border: 1px solid #333;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 12px;
  outline: none;
}

.memory-search:focus { border-color: #4d9e39; }

.add-memory-btn {
  width: 32px;
  background: #4d9e39;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 18px;
  cursor: pointer;
}

.add-memory-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.memory-input {
  padding: 6px 10px;
  background: #222;
  border: 1px solid #333;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 12px;
  outline: none;
}

.save-memory-btn {
  padding: 6px;
  background: #4d9e39;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.memory-card {
  background: #222;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
  border: 1px solid #2a2a2a;
  position: relative;
}

.memory-content { font-size: 13px; color: #ccc; }

.memory-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
  align-items: center;
}

.memory-tag {
  font-size: 10px;
  background: #2a4a22;
  color: #7dc96e;
  padding: 1px 6px;
  border-radius: 3px;
}

.memory-date { font-size: 10px; color: #555; }

.delete-memory-btn {
  position: absolute;
  top: 6px;
  right: 8px;
  background: transparent;
  border: none;
  color: #555;
  font-size: 16px;
  cursor: pointer;
}

.delete-memory-btn:hover { color: #e74c3c; }

/* Conversation cards */
.conv-card {
  background: #222;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
  border: 1px solid #2a2a2a;
  cursor: pointer;
  transition: border-color 0.2s;
}

.conv-card:hover { border-color: #4d9e39; }

.conv-channel {
  font-size: 10px;
  text-transform: uppercase;
  color: #4d9e39;
  font-weight: 600;
}

.conv-preview {
  font-size: 13px;
  color: #aaa;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}

.conv-meta { font-size: 10px; color: #555; margin-top: 4px; }

/* Scrollbar */
.chat-messages::-webkit-scrollbar,
.side-content::-webkit-scrollbar {
  width: 6px;
}

.chat-messages::-webkit-scrollbar-track,
.side-content::-webkit-scrollbar-track {
  background: transparent;
}

.chat-messages::-webkit-scrollbar-thumb,
.side-content::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 3px;
}
</style>
