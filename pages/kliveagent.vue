<template>
  <div class="ka">
    <!-- ── Header + view switcher ── -->
    <header class="ka-header">
      <div class="ka-brand">
        <span class="ka-glyph">◈</span>
        <div>
          <h1 class="ka-title">KliveAgent</h1>
          <p class="ka-subtitle">Runtime orchestrator for Omnipotent</p>
        </div>
      </div>

      <div class="ka-header-actions">
        <div class="seg" role="tablist">
          <button
            v-for="v in views"
            :key="v.id"
            class="seg-btn"
            :class="{ 'seg-active': view === v.id }"
            type="button"
            @click="setView(v.id)"
          >{{ v.label }}</button>
        </div>
        <button class="ka-reindex" type="button" @click="reindexCodebase" :disabled="reindexing" :title="reindexStatus">
          <span v-if="reindexing">Reindexing…</span>
          <span v-else-if="reindexDone">✓ Reindexed</span>
          <span v-else>⟳ Reindex Codebase</span>
        </button>
      </div>
    </header>

    <!-- ════════════════ CHAT VIEW ════════════════ -->
    <section v-show="view === 'chat'" class="view view-chat">
      <div class="chat-panel">
        <div class="chat-messages" ref="chatMessages">
          <div v-if="messages.length === 0" class="chat-empty">
            <div class="chat-empty-glyph">◈</div>
            <p class="chat-empty-title">Start a conversation</p>
            <p class="chat-empty-sub">Ask KliveAgent to inspect services, run scripts, or recall what it knows.</p>
          </div>

          <AgentMessage v-for="(msg, i) in messages" :key="i" :message="msg" />

          <div v-if="loading && !pendingRequestId" class="chat-thinking">
            <span class="chat-thinking-glyph">◈</span>
            <span class="msg-typing"><span></span><span></span><span></span></span>
          </div>
        </div>

        <div class="chat-input-row">
          <textarea
            ref="chatInput"
            v-model="inputMessage"
            class="chat-input"
            rows="1"
            placeholder="Ask KliveAgent anything…  (Enter to send, Shift+Enter for newline)"
            :disabled="loading"
            @input="autoGrowInput"
            @keydown.enter.exact.prevent="sendMessage"
          ></textarea>
          <button @click="sendMessage" type="button" class="chat-send-btn" :disabled="isSendDisabled" :title="sendButtonTitle">
            Send
          </button>
        </div>
      </div>

      <!-- Script panel: scripts from the current/active agent turn -->
      <aside class="script-panel">
        <div class="script-panel-head">
          <span class="script-panel-title">Scripts</span>
          <span v-if="currentTurnScripts.length" class="script-panel-count">{{ currentTurnScripts.length }}</span>
        </div>
        <div class="script-panel-body">
          <div v-if="currentTurnScripts.length === 0" class="script-panel-empty">
            Scripts the agent runs this turn appear here.
          </div>
          <ScriptResultCard v-for="(script, si) in currentTurnScripts" :key="si" :script="script" />
        </div>
      </aside>

      <!-- Context rail: live tasks + quick conversation access -->
      <aside class="chat-rail">
        <div class="rail-block">
          <div class="rail-head">
            <span class="rail-title">Session</span>
          </div>
          <button class="rail-newchat" type="button" @click="newChat">＋ New chat</button>
          <button
            class="rail-export"
            type="button"
            @click="downloadConversationCsv"
            :disabled="messages.length === 0"
            title="Download the full conversation (messages, scripts and outputs) as CSV"
          >⤓ Export CSV</button>
        </div>

        <div class="rail-block">
          <div class="rail-head">
            <span class="rail-title">Live Tasks</span>
            <button class="rail-refresh" type="button" @click="loadTasks" title="Refresh tasks">⟳</button>
          </div>
          <div v-if="tasks.length === 0" class="rail-empty">No background tasks.</div>
          <div v-for="task in tasks" :key="task.taskId" class="task-card">
            <div class="task-header">
              <span class="task-status" :class="getTaskStatusClass(task)">{{ getTaskStatusLabel(task) }}</span>
              <button v-if="canCancelTask(task)" @click="cancelTask(task.taskId)" class="cancel-btn" type="button">Cancel</button>
            </div>
            <div class="task-desc">{{ task.description || 'Background task' }}</div>
            <div class="task-time">{{ formatTime(task.createdAt) }}</div>
            <pre v-if="task.result" class="task-result">{{ task.result }}</pre>
            <pre v-if="task.errorMessage" class="task-error">{{ task.errorMessage }}</pre>
          </div>
        </div>

        <div class="rail-block">
          <div class="rail-head">
            <span class="rail-title">Recent</span>
            <button class="rail-refresh" type="button" @click="loadConversations" title="Refresh conversations">⟳</button>
          </div>
          <div v-if="conversationList.length === 0" class="rail-empty">No conversations yet.</div>
          <button
            v-for="conv in recentConversations"
            :key="conv.conversationId"
            class="rail-conv"
            type="button"
            @click="loadConversation(conv.conversationId)"
          >
            <span class="rail-conv-preview">{{ conv.lastMessage || 'Empty conversation' }}</span>
            <span class="rail-conv-meta">{{ conv.sourceChannel }} · {{ formatTime(conv.lastUpdated) }}</span>
          </button>
        </div>
      </aside>
    </section>

    <!-- ════════════════ ANALYTICS VIEW ════════════════ -->
    <section v-show="view === 'analytics'" class="view view-analytics">
      <div v-if="!analytics?.lifetime" class="view-loading">
        <p>Loading analytics…</p>
        <button @click="loadAnalytics" class="ghost-btn" type="button">Retry</button>
      </div>

      <template v-else>
        <div class="dash-header">
          <div>
            <h2 class="section-title">Usage &amp; Performance</h2>
            <p class="dash-period">Showing {{ periodLabel }}</p>
          </div>
          <div class="dash-controls">
            <div class="seg seg-sm">
              <button v-for="r in RANGES" :key="r.id" class="seg-btn" :class="{ 'seg-active': chartRange === r.id }" type="button" @click="chartRange = r.id">{{ r.label }}</button>
            </div>
            <button @click="loadAnalytics" class="ghost-btn" type="button">⟳ Refresh</button>
          </div>
        </div>

        <!-- KPI grid — every figure is aggregated over exactly the selected time range -->
        <div v-if="periodSummary" class="kpi-grid">
          <AgentStatCard :value="periodSummary.messages" label="Messages" />
          <AgentStatCard :value="fmtTokens(periodSummary.totalTokens)" label="Total Tokens" />
          <AgentStatCard :value="fmtTokens(periodSummary.avgPromptTokensPerMessage)" label="Avg Prompt / Msg" />
          <AgentStatCard :value="fmtTokens(periodSummary.avgCompletionTokensPerMessage)" label="Avg Output / Msg" />
          <AgentStatCard :value="periodSummary.avgIterationsPerMessage?.toFixed(2)" label="Avg Iterations" />
          <AgentStatCard :value="`${periodSummary.scriptSuccessRatePct?.toFixed(1)}%`" label="Script Success Rate" />
          <AgentStatCard :value="fmtMs(periodSummary.avgLatencyMs)" label="Avg Response Time" />
          <AgentStatCard :value="fmtCost(periodSummary.estimatedCostUsd)" label="Est. Cost" />
          <AgentStatCard :value="periodSummary.memorySaves" label="Memories Saved" />
          <AgentStatCard :value="periodSummary.discordMessages" :sub="`/ ${periodSummary.apiMessages}`" label="Discord / API Msgs" />
          <AgentStatCard :value="fmtTokens(analytics.lifetime.totalTokens)" :sub="`· ${analytics.historyWindow?.totalDays || chartDays.length}d`" label="Lifetime Tokens" />
        </div>

        <!-- Time-series charts -->
        <div class="charts-row">
          <AgentChartCard :title="`Tokens Per ${rangeLabel}`" variant="wide">
            <svg :viewBox="`0 0 ${chartW} ${chartH}`" class="chart-svg" preserveAspectRatio="none">
              <line v-for="y in [0.25,0.5,0.75,1]" :key="y"
                :x1="chartPad" :y1="chartPad + (1-y)*(chartH-2*chartPad)"
                :x2="chartW - chartPad" :y2="chartPad + (1-y)*(chartH-2*chartPad)"
                stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
              <polygon :points="tokenAreaPoints('prompt')" fill="#4d9e3922"/>
              <polygon :points="tokenAreaPoints('completion')" fill="#3b82f622"/>
              <polyline :points="tokenLinePoints('prompt')" fill="none" stroke="#4d9e39" stroke-width="2" stroke-linejoin="round"/>
              <polyline :points="tokenLinePoints('completion')" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linejoin="round"/>
              <circle v-for="(d,i) in chartDays" :key="'pd'+i" :cx="tokenX(i)" :cy="tokenY(d.promptTokens, 'tokens')" r="3" fill="#4d9e39"/>
              <circle v-for="(d,i) in chartDays" :key="'cd'+i" :cx="tokenX(i)" :cy="tokenY(d.completionTokens, 'tokens')" r="3" fill="#3b82f6"/>
              <text v-for="(d,i) in chartDaysLabeled" :key="'xl'+i" :x="tokenX(d.idx)" :y="chartH - 4" fill="#555" font-size="9" text-anchor="middle">{{ d.label }}</text>
            </svg>
            <template #legend>
              <span class="legend-dot" style="background:#4d9e39"></span>Prompt tokens
              <span class="legend-dot" style="background:#3b82f6;margin-left:12px"></span>Completion tokens
            </template>
          </AgentChartCard>

          <AgentChartCard :title="`Messages Per ${rangeLabel}`">
            <svg :viewBox="`0 0 ${chartW} ${chartH}`" class="chart-svg" preserveAspectRatio="none">
              <line v-for="y in [0.25,0.5,0.75,1]" :key="y"
                :x1="chartPad" :y1="chartPad + (1-y)*(chartH-2*chartPad)"
                :x2="chartW - chartPad" :y2="chartPad + (1-y)*(chartH-2*chartPad)"
                stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
              <rect v-for="(d,i) in chartDays" :key="'mb'+i"
                :x="tokenX(i) - barW/2" :y="tokenY(d.messages, 'messages')" :width="barW"
                :height="chartH - 2*chartPad - (tokenY(d.messages, 'messages') - chartPad)" fill="#4d9e39" rx="2"/>
              <text v-for="(d,i) in chartDaysLabeled" :key="'mxl'+i" :x="tokenX(d.idx)" :y="chartH - 4" fill="#555" font-size="9" text-anchor="middle">{{ d.label }}</text>
            </svg>
          </AgentChartCard>

          <AgentChartCard :title="`Avg Iterations Per ${rangeLabel}`">
            <svg :viewBox="`0 0 ${chartW} ${chartH}`" class="chart-svg" preserveAspectRatio="none">
              <line v-for="y in [0.25,0.5,0.75,1]" :key="y"
                :x1="chartPad" :y1="chartPad + (1-y)*(chartH-2*chartPad)"
                :x2="chartW - chartPad" :y2="chartPad + (1-y)*(chartH-2*chartPad)"
                stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
              <polygon :points="iterAreaPoints" fill="#f59e0b22"/>
              <polyline :points="iterLinePoints" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/>
              <circle v-for="(d,i) in chartDays" :key="'iter'+i" :cx="tokenX(i)" :cy="tokenY(d.messages > 0 ? d.iterations/d.messages : 0, 'iter')" r="3" fill="#f59e0b"/>
              <text v-for="(d,i) in chartDaysLabeled" :key="'ixl'+i" :x="tokenX(d.idx)" :y="chartH - 4" fill="#555" font-size="9" text-anchor="middle">{{ d.label }}</text>
            </svg>
          </AgentChartCard>

          <AgentChartCard :title="`Avg Response Time Per ${rangeLabel}`">
            <svg :viewBox="`0 0 ${chartW} ${chartH}`" class="chart-svg" preserveAspectRatio="none">
              <line v-for="y in [0.25,0.5,0.75,1]" :key="y"
                :x1="chartPad" :y1="chartPad + (1-y)*(chartH-2*chartPad)"
                :x2="chartW - chartPad" :y2="chartPad + (1-y)*(chartH-2*chartPad)"
                stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
              <polygon :points="latencyAreaPoints" fill="#a855f722"/>
              <polyline :points="latencyLinePoints" fill="none" stroke="#a855f7" stroke-width="2" stroke-linejoin="round"/>
              <circle v-for="(d,i) in chartDays" :key="'lat'+i" :cx="tokenX(i)" :cy="tokenY(d.avgLatencyMs, 'latency')" r="3" fill="#a855f7"/>
              <text v-for="(d,i) in chartDaysLabeled" :key="'lxl'+i" :x="tokenX(d.idx)" :y="chartH - 4" fill="#555" font-size="9" text-anchor="middle">{{ d.label }}</text>
            </svg>
          </AgentChartCard>
        </div>

        <!-- Donuts -->
        <div class="charts-row">
          <AgentChartCard :title="`Script Outcomes · ${activeRange.label}`" variant="donut">
            <div class="donut-wrap">
              <svg viewBox="0 0 120 120" class="donut-svg">
                <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="16"/>
                <circle cx="60" cy="60" r="46" fill="none" stroke="#4d9e39" stroke-width="16"
                  :stroke-dasharray="`${scriptSuccessDash} ${288.5 - scriptSuccessDash}`" stroke-dashoffset="72" stroke-linecap="round"/>
                <circle cx="60" cy="60" r="46" fill="none" stroke="#e0584b" stroke-width="16"
                  :stroke-dasharray="`${scriptFailDash} ${288.5 - scriptFailDash}`" :stroke-dashoffset="72 - scriptSuccessDash" stroke-linecap="round"/>
              </svg>
              <div class="donut-center">
                <div class="donut-pct">{{ periodSummary.scriptSuccessRatePct?.toFixed(0) }}%</div>
                <div class="donut-label">success</div>
              </div>
            </div>
            <template #legend>
              <span class="legend-dot" style="background:#4d9e39"></span>{{ periodSummary.scripts - periodSummary.scriptFailures }} passed
              <span class="legend-dot" style="background:#e0584b;margin-left:12px"></span>{{ periodSummary.scriptFailures }} failed
            </template>
          </AgentChartCard>

          <AgentChartCard :title="`Token Split · ${activeRange.label}`" variant="donut">
            <div class="donut-wrap">
              <svg viewBox="0 0 120 120" class="donut-svg">
                <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="16"/>
                <circle cx="60" cy="60" r="46" fill="none" stroke="#4d9e39" stroke-width="16"
                  :stroke-dasharray="`${promptTokenDash} ${288.5 - promptTokenDash}`" stroke-dashoffset="72" stroke-linecap="round"/>
                <circle cx="60" cy="60" r="46" fill="none" stroke="#3b82f6" stroke-width="16"
                  :stroke-dasharray="`${completionTokenDash} ${288.5 - completionTokenDash}`" :stroke-dashoffset="72 - promptTokenDash" stroke-linecap="round"/>
              </svg>
              <div class="donut-center">
                <div class="donut-pct" style="font-size:13px">{{ fmtTokens(periodSummary.totalTokens) }}</div>
                <div class="donut-label">total</div>
              </div>
            </div>
            <template #legend>
              <span class="legend-dot" style="background:#4d9e39"></span>{{ fmtTokens(periodSummary.promptTokens) }} prompt
              <span class="legend-dot" style="background:#3b82f6;margin-left:12px"></span>{{ fmtTokens(periodSummary.completionTokens) }} output
            </template>
          </AgentChartCard>

          <AgentChartCard v-if="analytics.today" title="Today" variant="default">
            <div class="today-grid">
              <AgentStatCard :value="analytics.today.messages" label="Messages" />
              <AgentStatCard :value="fmtTokens(analytics.today.promptTokens + analytics.today.completionTokens)" label="Tokens" />
              <AgentStatCard :value="fmtTokens(analytics.today.promptTokens)" label="Prompt" />
              <AgentStatCard :value="fmtTokens(analytics.today.completionTokens)" label="Output" />
            </div>
          </AgentChartCard>
        </div>
      </template>
    </section>

    <!-- ════════════════ LIBRARY VIEW ════════════════ -->
    <section v-show="view === 'library'" class="view view-library">
      <div class="lib-header">
        <h2 class="section-title">Library</h2>
        <div class="seg seg-sm">
          <button class="seg-btn" :class="{ 'seg-active': libTab === 'memories' }" type="button" @click="libTab = 'memories'">Memories</button>
          <button class="seg-btn" :class="{ 'seg-active': libTab === 'conversations' }" type="button" @click="libTab = 'conversations'">Conversations</button>
          <button class="seg-btn" :class="{ 'seg-active': libTab === 'shortcuts' }" type="button" @click="libTab = 'shortcuts'">Shortcuts</button>
        </div>
      </div>

      <!-- Memories -->
      <div v-show="libTab === 'memories'" class="lib-pane">
        <div class="memory-controls">
          <input v-model="memorySearch" placeholder="Search memories…" class="text-input" @input="searchMemories" />
          <button @click="showAddMemory = !showAddMemory" class="ghost-btn" type="button">{{ showAddMemory ? 'Cancel' : '＋ Add' }}</button>
        </div>
        <div v-if="showAddMemory" class="add-memory-form">
          <input v-model="newMemory.content" placeholder="Memory content…" class="text-input" />
          <input v-model="newMemory.tags" placeholder="Tags (comma-separated)" class="text-input" />
          <button @click="addMemory" class="primary-btn" type="button">Save Memory</button>
        </div>
        <div v-if="memories.length === 0" class="view-empty">No memories found.</div>
        <div class="card-grid">
          <div v-for="mem in memories" :key="mem.id" class="lib-card">
            <button @click="deleteMemory(mem.id)" class="card-del" type="button" title="Delete">×</button>
            <div class="lib-card-content">{{ mem.content }}</div>
            <div class="lib-card-meta">
              <span v-for="tag in mem.tags" :key="tag" class="tag">{{ tag }}</span>
              <span class="lib-card-date">{{ formatTime(mem.createdAt) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Conversations -->
      <div v-show="libTab === 'conversations'" class="lib-pane">
        <div class="memory-controls">
          <button @click="loadConversations" class="ghost-btn" type="button">⟳ Refresh</button>
        </div>
        <div v-if="conversationList.length === 0" class="view-empty">No conversations.</div>
        <div class="card-grid">
          <button v-for="conv in conversationList" :key="conv.conversationId" class="lib-card lib-card-btn" type="button" @click="loadConversation(conv.conversationId)">
            <div class="conv-channel">{{ conv.sourceChannel }}</div>
            <div class="lib-card-content">{{ conv.lastMessage || 'Empty conversation' }}</div>
            <div class="lib-card-meta">
              <span class="lib-card-date">{{ conv.messageCount }} messages · {{ formatTime(conv.lastUpdated) }}</span>
            </div>
          </button>
        </div>
      </div>

      <!-- Shortcuts -->
      <div v-show="libTab === 'shortcuts'" class="lib-pane">
        <div class="memory-controls">
          <button @click="loadShortcuts" class="ghost-btn" type="button">⟳ Refresh</button>
        </div>
        <div v-if="shortcuts.length === 0" class="view-empty">No shortcuts saved yet. KliveAgent saves shortcuts as it learns reusable recipes.</div>
        <div class="card-grid">
          <div v-for="sc in shortcuts" :key="sc.id" class="lib-card">
            <button @click="deleteMemory(sc.id)" class="card-del" type="button" title="Delete">×</button>
            <div class="shortcut-title">{{ sc.title || 'Untitled' }}</div>
            <div class="lib-card-content">{{ sc.content }}</div>
            <div class="lib-card-meta">
              <span v-for="t in sc.tags" :key="t" class="tag">{{ t }}</span>
              <span class="lib-card-date">{{ sc.createdAt ? new Date(sc.createdAt).toLocaleDateString() : '' }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { renderMarkdown } from '~/scripts/agentMarkdown';
import AgentMessage from '~/components/KliveAgent/AgentMessage.vue';
import ScriptResultCard from '~/components/KliveAgent/ScriptResultCard.vue';
import AgentStatCard from '~/components/KliveAgent/AgentStatCard.vue';
import AgentChartCard from '~/components/KliveAgent/AgentChartCard.vue';
import 'highlight.js/styles/github-dark.css';

definePageMeta({ layout: 'navbar' });

// ── View switching ──
const views = [
  { id: 'chat', label: 'Chat' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'library', label: 'Library' },
];
const view = ref('chat');
const loadedViews = ref(new Set());
const libTab = ref('memories');

function setView(v) {
  view.value = v;
  if (v === 'analytics' && !loadedViews.value.has('analytics')) {
    loadedViews.value.add('analytics');
    loadAnalytics();
  }
  if (v === 'library' && !loadedViews.value.has('library')) {
    loadedViews.value.add('library');
    searchMemories();
    loadShortcuts();
    loadConversations();
  }
}

// ── Chat state ──
const messages = ref([]);
const inputMessage = ref('');
const loading = ref(false);
const pendingRequestId = ref(null);
const conversationId = ref(null);
const chatMessages = ref(null);
const chatInput = ref(null);
let pendingPollHandle = null;

// ── Side data ──
const tasks = ref([]);
const memories = ref([]);
const memorySearch = ref('');
const conversationList = ref([]);
const analytics = ref(null);
const shortcuts = ref([]);

const showAddMemory = ref(false);
const newMemory = ref({ content: '', tags: '' });
const reindexing = ref(false);
const reindexDone = ref(false);
const reindexStatus = ref('');

const recentConversations = computed(() => conversationList.value.slice(0, 6));

// Scripts from the latest agent turn that actually ran scripts. Walking back from
// the end (rather than reading strictly the last message) keeps the panel populated
// with the most recent scripts instead of flickering to empty the moment the user
// sends a new message or when the final turn ran no scripts. Updates live during
// streaming because the poll mutates messages.value[i].scripts in place.
const currentTurnScripts = computed(() => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const m = messages.value[i];
    if (m.role === 'KliveAgent' && m.scripts && m.scripts.length) return m.scripts;
  }
  return [];
});

const isSendDisabled = computed(() => loading.value || !inputMessage.value.trim());

const sendButtonTitle = computed(() => {
  if (loading.value) {
    return pendingRequestId.value
      ? 'KliveAgent is finishing the current request.'
      : 'KliveAgent is processing your message.';
  }
  return inputMessage.value.trim() ? 'Send message' : 'Type a message to enable Send.';
});

function autoGrowInput() {
  const el = chatInput.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

function resetInputHeight() {
  nextTick(() => {
    if (chatInput.value) chatInput.value.style.height = 'auto';
  });
}

function newChat() {
  if (loading.value) return;
  messages.value = [];
  conversationId.value = null;
  inputMessage.value = '';
  resetInputHeight();
}

// RFC 4180 field escaping: quote any field containing a comma, quote or newline,
// and double embedded quotes. Newlines are preserved inside quoted fields so
// multi-line message content and script code/output stay intact (lossless).
function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Export the entire current conversation to CSV with one row per message and one
// row per executed script (associated back to its message), capturing every field
// we hold so the transcript can be reviewed/improved with no detail lost.
function downloadConversationCsv() {
  if (!messages.value.length) return;

  const headers = [
    'messageIndex', 'role', 'timestamp', 'rowType', 'scriptIndex',
    'content', 'scriptCode', 'scriptOutput', 'scriptSuccess',
    'scriptErrorMessage', 'scriptExecutionTimeMs', 'pending',
  ];
  const rows = [headers];

  messages.value.forEach((m, mi) => {
    // The message itself.
    rows.push([
      mi, m.role ?? '', m.timestamp ?? '', 'message', '',
      m.content ?? '', '', '', '', '', '', m.pending ? 'true' : '',
    ]);
    // Each script the agent ran on this turn, with full code + output.
    const scripts = Array.isArray(m.scripts) ? m.scripts : [];
    scripts.forEach((s, si) => {
      rows.push([
        mi, m.role ?? '', m.timestamp ?? '', 'script', si,
        '', s.code ?? '', s.output ?? '',
        s.success == null ? '' : String(s.success),
        s.errorMessage ?? '',
        s.executionTimeMs == null ? '' : String(s.executionTimeMs),
        '',
      ]);
    });
  });

  // Prepend a BOM so Excel reads the UTF-8 content (and emoji/glyphs) correctly.
  const csv = '﻿' + rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const idPart = conversationId.value ? `_${String(conversationId.value).replace(/[^A-Za-z0-9_-]/g, '_')}` : '';
  a.href = url;
  a.download = `kliveagent_conversation${idPart}_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function readAgentApiResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return { data: await res.json(), rawText: '' };
  }
  const rawText = await res.text();
  if (!rawText) return { data: null, rawText: '' };
  try {
    return { data: JSON.parse(rawText), rawText };
  } catch {
    return { data: null, rawText };
  }
}

async function sendMessage() {
  const msg = inputMessage.value.trim();
  if (!msg || loading.value) return;

  messages.value.push({ role: 'User', content: msg, timestamp: new Date().toISOString() });
  inputMessage.value = '';
  resetInputHeight();
  loading.value = true;
  scrollToBottom(true);

  try {
    const body = JSON.stringify({ message: msg, conversationId: conversationId.value });
    const res = await RequestPOSTFromKliveAPI('/kliveagent/chat', body, true, true);
    const { data, rawText } = await readAgentApiResponse(res);

    if (!res.ok) {
      throw new Error(
        data?.response || data?.error || data?.errorMessage || rawText || `KliveAgent API request failed with HTTP ${res.status}`
      );
    }
    if (!data) {
      throw new Error(rawText || 'KliveAgent API returned an empty response.');
    }

    if (data.success !== false) {
      conversationId.value = data.conversationId;
      if (data.isPending && data.pendingRequestId) {
        pendingRequestId.value = data.pendingRequestId;
        messages.value.push({
          role: 'KliveAgent',
          content: data.response,
          scripts: [],
          pending: true,
          timestamp: new Date().toISOString(),
        });
        scrollToBottom(true);
        // Mutate through the array index so updates are reactive (streaming + final).
        await pollPendingResponse(messages.value.length - 1);
      } else {
        messages.value.push({
          role: 'KliveAgent',
          content: data.response,
          scripts: data.scriptsExecuted || [],
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      messages.value.push({
        role: 'KliveAgent',
        content: data.response || data.errorMessage || 'Something went wrong.',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    messages.value.push({
      role: 'KliveAgent',
      content: 'Failed to reach KliveAgent API: ' + err.message,
      timestamp: new Date().toISOString(),
    });
  }

  pendingRequestId.value = null;
  loading.value = false;
  scrollToBottom();
}

function waitForPendingPoll(ms) {
  return new Promise((resolve) => {
    pendingPollHandle = setTimeout(resolve, ms);
  });
}

async function pollPendingResponse(messageIndex) {
  // Mutate the message via its array index (messages.value[messageIndex].*) rather
  // than a captured object reference — direct mutation of a pushed plain object does
  // not trigger Vue reactivity, so streaming/final updates would not render.
  const msg = () => messages.value[messageIndex];

  while (pendingRequestId.value) {
    try {
      // Cache-buster (`_t`): the poll URL is otherwise identical every tick, so the
      // browser can serve a cached "Running" response forever and the request never
      // resolves in the UI (the answer only shows after a manual refresh). A unique
      // param per poll forces a fresh network read each time.
      const res = await RequestGETFromKliveAPI(`/kliveagent/chat/pending?requestId=${encodeURIComponent(pendingRequestId.value)}&_t=${Date.now()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || `Pending request failed with HTTP ${res.status}`);
      }

      if (data.status === 'Running') {
        // Live "talking while working": the server streams the agent's prose into
        // data.response and the code it runs into data.scriptsExecuted between iterations.
        if (data.response != null) msg().content = data.response;
        if (Array.isArray(data.scriptsExecuted)) msg().scripts = data.scriptsExecuted;
        scrollToBottom();
        await waitForPendingPoll(600);
        continue;
      }

      const finalResponse = data.finalResponse;
      msg().pending = false;
      msg().timestamp = new Date().toISOString();

      if (finalResponse) {
        conversationId.value = finalResponse.conversationId || data.conversationId || conversationId.value;
        msg().content = finalResponse.response || msg().content;
        msg().scripts = finalResponse.scriptsExecuted || [];
      } else {
        msg().content = data.errorMessage || 'KliveAgent did not return a final response.';
      }
      break;
    } catch (err) {
      msg().pending = false;
      msg().content = 'Failed to retrieve KliveAgent response: ' + err.message;
      break;
    }
  }

  pendingRequestId.value = null;
  loading.value = false;
  if (pendingPollHandle) {
    clearTimeout(pendingPollHandle);
    pendingPollHandle = null;
  }
  scrollToBottom();
}

// True when the viewport is parked at (or within a line or two of) the bottom.
// Checked synchronously *before* the pending DOM growth, so it reflects where the
// user was sitting prior to this update.
function isNearBottom() {
  const el = chatMessages.value;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}

// Auto-scroll respects the user's scroll position: while the agent streams we only
// follow along if they were already at the bottom, so scrolling up to read earlier
// output no longer snaps them back down. `force` overrides this for explicit user
// actions (sending a message, opening a conversation).
function scrollToBottom(force = false) {
  if (!force && !isNearBottom()) return;
  nextTick(() => {
    if (chatMessages.value) {
      chatMessages.value.scrollTop = chatMessages.value.scrollHeight;
    }
  });
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Tasks ──
function getTaskStatusLabel(task) {
  return String(task?.status || 'Unknown');
}
function getTaskStatusClass(task) {
  return 'status-' + getTaskStatusLabel(task).toLowerCase().replace(/[^a-z0-9-]/g, '-');
}
function canCancelTask(task) {
  return Boolean(task?.taskId) && getTaskStatusLabel(task) === 'Running';
}
function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}
function normalizeTask(task) {
  return {
    taskId: task?.taskId || crypto.randomUUID(),
    description: task?.description || '',
    status: task?.status || 'Unknown',
    createdAt: task?.createdAt || null,
    result: task?.result || '',
    errorMessage: task?.errorMessage || '',
  };
}

function bucketLabel(value, keyName) {
  if (!value) return '';
  if (keyName === 'date') return value.slice(5);
  if (keyName === 'week') return value.slice(5);
  return value;
}

function normalizeBucket(b, keyName) {
  const promptTokens = toFiniteNumber(b?.promptTokens);
  const completionTokens = toFiniteNumber(b?.completionTokens);
  const keyValue = typeof b?.[keyName] === 'string' ? b[keyName] : '';
  return {
    key: keyValue,
    label: bucketLabel(keyValue, keyName),
    date: keyValue,
    messages: toFiniteNumber(b?.messages),
    promptTokens,
    completionTokens,
    totalTokens: toFiniteNumber(b?.totalTokens, promptTokens + completionTokens),
    iterations: toFiniteNumber(b?.iterations),
    scripts: toFiniteNumber(b?.scripts),
    scriptFailures: toFiniteNumber(b?.scriptFailures),
    capabilityCalls: toFiniteNumber(b?.capabilityCalls),
    capabilityFailures: toFiniteNumber(b?.capabilityFailures),
    apiMessages: toFiniteNumber(b?.apiMessages),
    discordMessages: toFiniteNumber(b?.discordMessages),
    avgLatencyMs: toFiniteNumber(b?.avgLatencyMs),
    maxLatencyMs: toFiniteNumber(b?.maxLatencyMs),
    memorySaves: toFiniteNumber(b?.memorySaves),
    memoryRecalls: toFiniteNumber(b?.memoryRecalls),
    estimatedCostUsd: toFiniteNumber(b?.estimatedCostUsd),
  };
}

function normalizeAnalyticsPeriod(period) {
  if (!period || typeof period !== 'object') return null;
  const promptTokens = toFiniteNumber(period.promptTokens);
  const completionTokens = toFiniteNumber(period.completionTokens);
  return {
    messages: toFiniteNumber(period.messages),
    promptTokens,
    completionTokens,
    totalTokens: toFiniteNumber(period.totalTokens, promptTokens + completionTokens),
    iterations: toFiniteNumber(period.iterations),
    scripts: toFiniteNumber(period.scripts),
    scriptFailures: toFiniteNumber(period.scriptFailures),
    capabilityCalls: toFiniteNumber(period.capabilityCalls),
    capabilityFailures: toFiniteNumber(period.capabilityFailures),
    capabilityConfirmationBlocks: toFiniteNumber(period.capabilityConfirmationBlocks),
    apiMessages: toFiniteNumber(period.apiMessages),
    discordMessages: toFiniteNumber(period.discordMessages),
    memorySaves: toFiniteNumber(period.memorySaves),
    memoryRecalls: toFiniteNumber(period.memoryRecalls),
    avgPromptTokensPerMessage: toFiniteNumber(period.avgPromptTokensPerMessage),
    avgCompletionTokensPerMessage: toFiniteNumber(period.avgCompletionTokensPerMessage),
    avgIterationsPerMessage: toFiniteNumber(period.avgIterationsPerMessage),
    avgLatencyMs: toFiniteNumber(period.avgLatencyMs),
    maxLatencyMs: toFiniteNumber(period.maxLatencyMs),
    avgCapabilityDurationMs: toFiniteNumber(period.avgCapabilityDurationMs),
    estimatedCostUsd: toFiniteNumber(period.estimatedCostUsd),
    scriptSuccessRatePct: toFiniteNumber(period.scriptSuccessRatePct, 100),
    capabilitySuccessRatePct: toFiniteNumber(period.capabilitySuccessRatePct, 100),
  };
}

function normalizeAnalytics(data) {
  const lifetime = normalizeAnalyticsPeriod(data?.lifetime) || normalizeAnalyticsPeriod({}) || {};
  const today = normalizeAnalyticsPeriod(data?.today);
  const dailyHistory = Array.isArray(data?.dailyHistory) ? data.dailyHistory.map((d) => normalizeBucket(d, 'date')) : [];
  const weeklyHistory = Array.isArray(data?.weeklyHistory) ? data.weeklyHistory.map((d) => normalizeBucket(d, 'week')) : [];
  const monthlyHistory = Array.isArray(data?.monthlyHistory) ? data.monthlyHistory.map((d) => normalizeBucket(d, 'month')) : [];
  return {
    lifetime,
    today,
    historyWindow: {
      firstDay: typeof data?.historyWindow?.firstDay === 'string' ? data.historyWindow.firstDay : null,
      lastDay: typeof data?.historyWindow?.lastDay === 'string' ? data.historyWindow.lastDay : null,
      totalDays: toFiniteNumber(data?.historyWindow?.totalDays, dailyHistory.length),
    },
    dailyHistory,
    weeklyHistory,
    monthlyHistory,
    topCapabilities: Array.isArray(data?.topCapabilities) ? data.topCapabilities : [],
  };
}

async function loadTasks() {
  try {
    const res = await RequestGETFromKliveAPI('/kliveagent/tasks');
    const data = await res.json();
    tasks.value = Array.isArray(data) ? data.map(normalizeTask) : [];
  } catch {}
}

async function cancelTask(taskId) {
  try {
    await RequestPOSTFromKliveAPI('/kliveagent/tasks/cancel', JSON.stringify({ taskId }), true, true);
    await loadTasks();
  } catch {}
}

// ── Memories ──
async function searchMemories() {
  try {
    const q = memorySearch.value ? `?query=${encodeURIComponent(memorySearch.value)}` : '';
    const res = await RequestGETFromKliveAPI('/kliveagent/memories' + q);
    memories.value = await res.json();
  } catch {}
}

async function addMemory() {
  if (!newMemory.value.content.trim()) return;
  try {
    const body = JSON.stringify({
      content: newMemory.value.content,
      tags: newMemory.value.tags.split(',').map((t) => t.trim()).filter(Boolean),
      importance: 1,
    });
    await RequestPOSTFromKliveAPI('/kliveagent/memories/add', body, true, true);
    newMemory.value = { content: '', tags: '' };
    showAddMemory.value = false;
    await searchMemories();
  } catch {}
}

async function deleteMemory(id) {
  try {
    await RequestPOSTFromKliveAPI('/kliveagent/memories/delete', JSON.stringify({ id }), true, true);
    await searchMemories();
    await loadShortcuts();
  } catch {}
}

// ── Conversations ──
async function loadConversations() {
  try {
    const res = await RequestGETFromKliveAPI('/kliveagent/conversations');
    conversationList.value = await res.json();
  } catch {}
}

async function loadConversation(convId) {
  try {
    const res = await RequestGETFromKliveAPI(`/kliveagent/conversations/get?id=${convId}`);
    const data = await res.json();
    conversationId.value = convId;
    messages.value = data.messages.map((m) => ({
      role: m.role === 'User' ? 'User' : 'KliveAgent',
      content: m.content,
      // Replay the scripts+outputs the agent ran on this turn (persisted server-side).
      scripts: m.scriptResults || (m.scriptResult ? [m.scriptResult] : []),
      timestamp: m.timestamp,
    }));
    view.value = 'chat';
    scrollToBottom(true);
  } catch {}
}

// ── Analytics charts ──
const chartW = 560;
const chartH = 130;
const chartPad = 18;
const barW = 10;
// Stock-graph-style time ranges. Each maps to a bucket granularity (the backend stores
// day/week/month buckets) and how many of the most-recent buckets to include. 'auto'
// granularity picks the coarsest bucket that has enough history to be worth plotting.
const RANGES = [
  { id: '7D',  label: '7D',  gran: 'day',   count: 7 },
  { id: '30D', label: '30D', gran: 'day',   count: 30 },
  { id: '90D', label: '90D', gran: 'day',   count: 90 },
  { id: '6M',  label: '6M',  gran: 'week',  count: 26 },
  { id: '1Y',  label: '1Y',  gran: 'month', count: 12 },
  { id: 'ALL', label: 'All', gran: 'auto',  count: Infinity },
];
const chartRange = ref('30D');

const activeRange = computed(() => RANGES.find((r) => r.id === chartRange.value) ?? RANGES[1]);

// Resolve 'auto' to the coarsest granularity that actually has history.
const chartGran = computed(() => {
  const r = activeRange.value;
  if (r.gran !== 'auto') return r.gran;
  const a = analytics.value;
  if ((a?.monthlyHistory?.length ?? 0) > 2) return 'month';
  if ((a?.weeklyHistory?.length ?? 0) > 2) return 'week';
  return 'day';
});

// The buckets actually plotted: the selected granularity's history, trimmed to the window.
const chartDays = computed(() => {
  const a = analytics.value;
  if (!a) return [];
  const all = chartGran.value === 'month' ? (a.monthlyHistory ?? [])
            : chartGran.value === 'week' ? (a.weeklyHistory ?? [])
            : (a.dailyHistory ?? []);
  const count = activeRange.value.count;
  return Number.isFinite(count) && all.length > count ? all.slice(all.length - count) : all;
});

const rangeLabel = computed(() =>
  chartGran.value === 'week' ? 'Week' : chartGran.value === 'month' ? 'Month' : 'Day'
);

// Every headline figure is AGGREGATED over exactly the buckets on screen, so the KPI
// cards, donuts and charts all describe the same window. Raw counts are summed; averages
// and rates are recomputed from those sums (avgLatency*messages reconstructs total latency).
const periodSummary = computed(() => {
  // Always returns a valid (possibly all-zero) object so the donuts — which aren't wrapped in
  // a v-if — never dereference null when the selected range has no activity.
  const buckets = chartDays.value;
  const sum = (sel) => buckets.reduce((acc, b) => acc + (sel(b) || 0), 0);
  const messages = sum((b) => b.messages);
  const promptTokens = sum((b) => b.promptTokens);
  const completionTokens = sum((b) => b.completionTokens);
  const iterations = sum((b) => b.iterations);
  const scripts = sum((b) => b.scripts);
  const scriptFailures = sum((b) => b.scriptFailures);
  const totalLatency = buckets.reduce((acc, b) => acc + (b.avgLatencyMs || 0) * (b.messages || 0), 0);
  return {
    messages,
    totalTokens: sum((b) => b.totalTokens),
    promptTokens,
    completionTokens,
    iterations,
    scripts,
    scriptFailures,
    avgPromptTokensPerMessage: messages ? promptTokens / messages : 0,
    avgCompletionTokensPerMessage: messages ? completionTokens / messages : 0,
    avgIterationsPerMessage: messages ? iterations / messages : 0,
    scriptSuccessRatePct: scripts ? ((scripts - scriptFailures) / scripts) * 100 : 100,
    avgLatencyMs: messages ? totalLatency / messages : 0,
    maxLatencyMs: Math.max(0, ...buckets.map((b) => b.maxLatencyMs || 0)),
    estimatedCostUsd: sum((b) => b.estimatedCostUsd),
    memorySaves: sum((b) => b.memorySaves),
    memoryRecalls: sum((b) => b.memoryRecalls),
    discordMessages: sum((b) => b.discordMessages),
    apiMessages: sum((b) => b.apiMessages),
  };
});

const periodLabel = computed(() => {
  const buckets = chartDays.value;
  if (!buckets.length) return 'no activity in range';
  const first = buckets[0]?.label || buckets[0]?.key;
  const last = buckets[buckets.length - 1]?.label || buckets[buckets.length - 1]?.key;
  const noun = chartGran.value === 'week' ? 'week' : chartGran.value === 'month' ? 'month' : 'day';
  const span = `${buckets.length} ${noun}${buckets.length === 1 ? '' : 's'}`;
  if (first && last && first !== last) return `${span} · ${first} – ${last}`;
  return last ? `${span} · ${last}` : span;
});

const chartDaysLabeled = computed(() => {
  const days = chartDays.value;
  if (!days.length) return [];
  const step = Math.max(1, Math.floor(days.length / 6));
  return days
    .map((d, i) => ({ idx: i, label: d.label ?? '' }))
    .filter((_, i) => i % step === 0 || i === days.length - 1);
});

function tokenX(i) {
  const n = chartDays.value.length;
  if (n <= 1) return chartW / 2; // center a lone data point instead of pinning it left
  return chartPad + i * ((chartW - 2 * chartPad) / (n - 1));
}

function tokenY(val, kind) {
  const days = chartDays.value;
  let max = 1;
  if (kind === 'tokens') max = Math.max(1, ...days.map((d) => Math.max(d.promptTokens, d.completionTokens)));
  else if (kind === 'messages') max = Math.max(1, ...days.map((d) => d.messages));
  else if (kind === 'iter') max = Math.max(1, ...days.map((d) => (d.messages > 0 ? d.iterations / d.messages : 0)));
  else if (kind === 'latency') max = Math.max(1, ...days.map((d) => d.avgLatencyMs));
  const ratio = Math.min(1, val / max);
  return chartPad + (1 - ratio) * (chartH - 2 * chartPad);
}

function tokenLinePoints(type) {
  return chartDays.value.map((d, i) => `${tokenX(i)},${tokenY(type === 'prompt' ? d.promptTokens : d.completionTokens, 'tokens')}`).join(' ');
}

function tokenAreaPoints(type) {
  const days = chartDays.value;
  if (!days.length) return '';
  const top = days.map((d, i) => `${tokenX(i)},${tokenY(type === 'prompt' ? d.promptTokens : d.completionTokens, 'tokens')}`).join(' ');
  const bottom = `${tokenX(days.length - 1)},${chartH - chartPad} ${tokenX(0)},${chartH - chartPad}`;
  return top + ' ' + bottom;
}

const iterLinePoints = computed(() =>
  chartDays.value
    .map((d, i) => {
      const v = d.messages > 0 ? d.iterations / d.messages : 0;
      return `${tokenX(i)},${tokenY(v, 'iter')}`;
    })
    .join(' ')
);

const iterAreaPoints = computed(() => {
  const days = chartDays.value;
  if (!days.length) return '';
  const top = days
    .map((d, i) => {
      const v = d.messages > 0 ? d.iterations / d.messages : 0;
      return `${tokenX(i)},${tokenY(v, 'iter')}`;
    })
    .join(' ');
  return top + ` ${tokenX(days.length - 1)},${chartH - chartPad} ${tokenX(0)},${chartH - chartPad}`;
});

const latencyLinePoints = computed(() => chartDays.value.map((d, i) => `${tokenX(i)},${tokenY(d.avgLatencyMs, 'latency')}`).join(' '));

const latencyAreaPoints = computed(() => {
  const days = chartDays.value;
  if (!days.length) return '';
  const top = days.map((d, i) => `${tokenX(i)},${tokenY(d.avgLatencyMs, 'latency')}`).join(' ');
  return top + ` ${tokenX(days.length - 1)},${chartH - chartPad} ${tokenX(0)},${chartH - chartPad}`;
});

function fmtMs(ms) {
  const n = Number(ms) || 0;
  if (n >= 1000) return (n / 1000).toFixed(1) + 's';
  return Math.round(n) + 'ms';
}

function fmtCost(usd) {
  const n = Number(usd) || 0;
  return '$' + n.toFixed(n >= 1 ? 2 : 4);
}

// Donut helpers — circumference of r=46 circle ≈ 288.5. Driven by the windowed
// periodSummary so the donuts describe the SAME range as the rest of the dashboard.
const scriptSuccessDash = computed(() => {
  const a = periodSummary.value;
  if (!a || !a.scripts) return 0;
  return ((a.scripts - a.scriptFailures) / a.scripts) * 288.5;
});
const scriptFailDash = computed(() => {
  const a = periodSummary.value;
  if (!a || !a.scripts) return 0;
  return (a.scriptFailures / a.scripts) * 288.5;
});
const promptTokenDash = computed(() => {
  const a = periodSummary.value;
  if (!a || !a.totalTokens) return 0;
  return (a.promptTokens / a.totalTokens) * 288.5;
});
const completionTokenDash = computed(() => {
  const a = periodSummary.value;
  if (!a || !a.totalTokens) return 0;
  return (a.completionTokens / a.totalTokens) * 288.5;
});

function fmtTokens(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}

async function loadAnalytics() {
  try {
    const res = await RequestGETFromKliveAPI('/kliveagent/stats');
    const { data } = await readAgentApiResponse(res);
    analytics.value = res.ok ? normalizeAnalytics(data) : null;
  } catch {
    analytics.value = null;
  }
}

async function reindexCodebase() {
  if (reindexing.value) return;
  reindexing.value = true;
  reindexDone.value = false;
  reindexStatus.value = '';
  try {
    const res = await RequestPOSTFromKliveAPI('/kliveagent/reindex', '{}', true, true);
    const data = await res.json();
    reindexStatus.value = data.message || 'Reindex triggered.';
    reindexDone.value = true;
    setTimeout(() => {
      reindexDone.value = false;
    }, 4000);
  } catch (err) {
    reindexStatus.value = 'Reindex failed: ' + err.message;
  } finally {
    reindexing.value = false;
  }
}

async function loadShortcuts() {
  try {
    const res = await RequestGETFromKliveAPI('/kliveagent/shortcuts');
    shortcuts.value = await res.json();
  } catch {}
}

onMounted(() => {
  // Chat is the default view — load just what the chat rail needs up front.
  loadTasks();
  loadConversations();
});

onUnmounted(() => {
  pendingRequestId.value = null;
  if (pendingPollHandle) {
    clearTimeout(pendingPollHandle);
    pendingPollHandle = null;
  }
});
</script>

<style scoped lang="scss">
.ka {
  padding: 20px 24px;
  font-family: 'Segoe UI', sans-serif;
  color: #dcdcdc;
}

/* ── Header ── */
.ka-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.ka-brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.ka-glyph {
  font-size: 26px;
  color: $secondary;
  width: 46px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba($secondary, 0.12);
  border: 1px solid rgba($secondary, 0.25);
  border-radius: 12px;
}

.ka-title {
  font-size: 24px;
  font-weight: 700;
  color: $white;
  margin: 0;
  letter-spacing: 0.3px;
}

.ka-subtitle {
  color: #7a7a7a;
  margin: 2px 0 0;
  font-size: 13px;
}

.ka-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* ── Segmented control (shared) ── */
.seg {
  display: inline-flex;
  background: $mainDarker;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
}

.seg-btn {
  background: transparent;
  border: none;
  color: #8a8a8a;
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 7px;
  cursor: pointer;
  text-transform: capitalize;
  transition: background 140ms ease, color 140ms ease;
}
.seg-btn:hover {
  color: #d0d0d0;
}
.seg-active {
  background: rgba($secondary, 0.16);
  color: $teritary;
}

.seg-sm .seg-btn {
  padding: 5px 12px;
  font-size: 12px;
}

.ka-reindex {
  background: $mainDarker;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #8a8a8a;
  padding: 9px 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 140ms ease, color 140ms ease;
}
.ka-reindex:hover:not(:disabled) {
  border-color: rgba($secondary, 0.5);
  color: $teritary;
}
.ka-reindex:disabled {
  opacity: 0.6;
  cursor: default;
}

/* ── Shared buttons / inputs ── */
.ghost-btn {
  background: #1c1c1c;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #9a9a9a;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 140ms ease, color 140ms ease;
}
.ghost-btn:hover {
  border-color: rgba($secondary, 0.45);
  color: $teritary;
}

.primary-btn {
  background: $secondary;
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 140ms ease;
}
.primary-btn:hover {
  background: #3d8e29;
}

.text-input {
  flex: 1;
  padding: 9px 13px;
  background: $mainDarker;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: #dcdcdc;
  font-size: 13px;
  outline: none;
  transition: border-color 140ms ease;
}
.text-input:focus {
  border-color: rgba($secondary, 0.55);
}
.text-input::placeholder {
  color: #5a5a5a;
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  color: $white;
  margin: 0;
}

.view-loading,
.view-empty {
  text-align: center;
  color: #6a6a6a;
  padding: 48px 20px;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

/* ════════ CHAT VIEW ════════ */
.view-chat {
  display: flex;
  gap: 20px;
  height: calc(100vh - 150px);
}

.chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  overflow: hidden;
  min-width: 0;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Script panel ── */
.script-panel {
  width: 360px;
  flex: 0 0 360px;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  overflow: hidden;
  min-width: 0;
}

.script-panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.script-panel-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #8a8a8a;
}

.script-panel-count {
  font-size: 11px;
  font-weight: 700;
  color: $teritary;
  background: rgba($secondary, 0.16);
  border-radius: 999px;
  padding: 1px 8px;
  font-variant-numeric: tabular-nums;
}

.script-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
}

.script-panel-empty {
  color: #5a5a5a;
  font-size: 13px;
  line-height: 1.5;
  padding: 4px 2px;
}

.chat-empty {
  margin: auto;
  text-align: center;
  color: #5a5a5a;
  max-width: 360px;
}
.chat-empty-glyph {
  font-size: 40px;
  color: rgba($secondary, 0.5);
  margin-bottom: 12px;
}
.chat-empty-title {
  font-size: 16px;
  font-weight: 600;
  color: #b0b0b0;
  margin: 0 0 6px;
}
.chat-empty-sub {
  font-size: 13px;
  margin: 0;
  line-height: 1.5;
}

.chat-thinking {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-left: 2px;
}
.chat-thinking-glyph {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1c1c1c;
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: #8a8a8a;
  font-size: 14px;
}
.msg-typing {
  display: flex;
  gap: 5px;
}
.msg-typing span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: $secondary;
  animation: ka-blink 1.4s infinite both;
}
.msg-typing span:nth-child(2) {
  animation-delay: 0.2s;
}
.msg-typing span:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes ka-blink {
  0%, 80%, 100% { opacity: 0.25; }
  40% { opacity: 1; }
}

.chat-input-row {
  display: flex;
  align-items: flex-end;
  padding: 14px;
  background: $mainDarker;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  gap: 10px;
}

.chat-input {
  flex: 1;
  padding: 11px 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: #1a1a1a;
  color: #dcdcdc;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.4;
  outline: none;
  resize: none;
  max-height: 160px;
  transition: border-color 140ms ease;
}
.chat-input:focus {
  border-color: rgba($secondary, 0.55);
}
.chat-input::placeholder {
  color: #5a5a5a;
}

.chat-send-btn {
  padding: 11px 22px;
  background: $secondary;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: background 140ms ease;
}
.chat-send-btn:hover:not(:disabled) {
  background: #3d8e29;
}
.chat-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Context rail ── */
.chat-rail {
  width: 300px;
  flex: 0 0 300px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding-right: 2px;
}

.rail-block {
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 14px;
}

.rail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.rail-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #8a8a8a;
}

.rail-refresh {
  background: transparent;
  border: none;
  color: #6a6a6a;
  font-size: 14px;
  cursor: pointer;
  padding: 0 4px;
  transition: color 140ms ease;
}
.rail-refresh:hover {
  color: $teritary;
}

.rail-newchat {
  width: 100%;
  padding: 9px;
  background: rgba($secondary, 0.12);
  border: 1px solid rgba($secondary, 0.3);
  border-radius: 8px;
  color: $teritary;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 140ms ease;
}
.rail-newchat:hover {
  background: rgba($secondary, 0.2);
}

.rail-export {
  width: 100%;
  margin-top: 8px;
  padding: 9px;
  background: #1c1c1c;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: #9a9a9a;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 140ms ease, color 140ms ease;
}
.rail-export:hover:not(:disabled) {
  border-color: rgba($secondary, 0.45);
  color: $teritary;
}
.rail-export:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.rail-empty {
  color: #5a5a5a;
  font-size: 12px;
  padding: 4px 0;
}

.rail-conv {
  display: block;
  width: 100%;
  text-align: left;
  background: #202020;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: border-color 140ms ease;
}
.rail-conv:hover {
  border-color: rgba($secondary, 0.4);
}
.rail-conv-preview {
  display: block;
  font-size: 12px;
  color: #c0c0c0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rail-conv-meta {
  display: block;
  font-size: 10px;
  color: #5a5a5a;
  margin-top: 3px;
}

/* ── Task cards (rail) ── */
.task-card {
  background: #202020;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
}
.task-card:last-child {
  margin-bottom: 0;
}
.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 5px;
}
.task-status {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 5px;
  letter-spacing: 0.4px;
}
.status-running { background: rgba($secondary, 0.18); color: $teritary; }
.status-completed { background: rgba($secondary, 0.1); color: $secondary; }
.status-failed { background: rgba(224, 88, 75, 0.16); color: #e0584b; }
.status-cancelled { background: rgba(243, 156, 18, 0.16); color: #f39c12; }
.status-unknown { background: rgba(255, 255, 255, 0.08); color: #aaa; }

.cancel-btn {
  font-size: 10px;
  padding: 2px 8px;
  background: rgba(224, 88, 75, 0.12);
  color: #e0584b;
  border: 1px solid rgba(224, 88, 75, 0.3);
  border-radius: 5px;
  cursor: pointer;
}
.task-desc { font-size: 12px; color: #c0c0c0; }
.task-time { font-size: 10px; color: #5a5a5a; margin-top: 4px; }
.task-result,
.task-error {
  font-size: 11px;
  margin-top: 6px;
  padding: 6px 8px;
  background: #0e0e0e;
  border-radius: 6px;
  white-space: pre-wrap;
  font-family: 'Cascadia Code', monospace;
}
.task-error { color: #e0584b; }

/* ════════ ANALYTICS VIEW ════════ */
.dash-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 18px;
}
.dash-period {
  margin: 3px 0 0;
  font-size: 12px;
  color: #6a6a6a;
}

.dash-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.charts-row {
  display: flex;
  gap: 14px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.chart-svg {
  width: 100%;
  height: 130px;
  display: block;
}

.legend-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
}

.donut-wrap {
  position: relative;
  width: 120px;
  height: 120px;
  margin: 0 auto;
}
.donut-svg {
  width: 120px;
  height: 120px;
}
.donut-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}
.donut-pct {
  font-size: 18px;
  font-weight: 700;
  color: #e0e0e0;
}
.donut-label {
  font-size: 10px;
  color: #6a6a6a;
}

.today-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

/* ════════ LIBRARY VIEW ════════ */
.lib-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 18px;
}

.memory-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.add-memory-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding: 14px;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.lib-card {
  position: relative;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 14px;
  text-align: left;
}
.lib-card-btn {
  cursor: pointer;
  width: 100%;
  transition: border-color 140ms ease;
}
.lib-card-btn:hover {
  border-color: rgba($secondary, 0.4);
}

.card-del {
  position: absolute;
  top: 8px;
  right: 10px;
  background: transparent;
  border: none;
  color: #5a5a5a;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: color 140ms ease;
}
.card-del:hover {
  color: #e0584b;
}

.lib-card-content {
  font-size: 13px;
  color: #c8c8c8;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
  padding-right: 14px;
}

.lib-card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-top: 10px;
}

.tag {
  font-size: 10px;
  background: rgba($secondary, 0.14);
  color: $teritary;
  padding: 2px 7px;
  border-radius: 5px;
}

.lib-card-date {
  font-size: 10px;
  color: #5a5a5a;
}

.conv-channel {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: $secondary;
  font-weight: 700;
  margin-bottom: 6px;
}

.shortcut-title {
  font-size: 13px;
  font-weight: 600;
  color: $teritary;
  margin-bottom: 6px;
  padding-right: 14px;
}

/* ── Scrollbars ── */
.chat-messages::-webkit-scrollbar,
.script-panel-body::-webkit-scrollbar,
.chat-rail::-webkit-scrollbar {
  width: 6px;
}
.chat-messages::-webkit-scrollbar-thumb,
.script-panel-body::-webkit-scrollbar-thumb,
.chat-rail::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
}

/* ── Responsive ── */
@media (max-width: 900px) {
  .view-chat {
    flex-direction: column;
    height: auto;
  }
  .chat-panel {
    height: 60vh;
  }
  .script-panel {
    width: 100%;
    flex: none;
    height: 40vh;
  }
  .chat-rail {
    width: 100%;
    flex: none;
  }
}
</style>
