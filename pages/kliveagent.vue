<template>
  <div class="agent-page">
    <KMInfoGrid columns="1" rows="1" rowHeight="auto">
      <KMInfoBox caption="KliveAgent Overview">
        <div class="agent-header">
          <div class="agent-kicker">KLIVES MANAGEMENT :: KLIVEAGENT</div>
          <h1>KLIVEAGENT COMMAND CENTRE</h1>
          <p>Direct operations interface for KliveAgent. Run missions, stream outputs, and inspect model context, prompt data, and execution traces.</p>
        </div>

        <div class="ops-strip">
          <div class="ops-block">
            <span class="ops-label">SERVICE HEALTH</span>
            <div class="health-dots" v-if="serviceHealth.length > 0">
              <span
                v-for="service in serviceHealth"
                :key="service.name"
                class="health-dot"
                :class="service.isActive ? 'dot-online' : 'dot-offline'"
                :title="service.name + ' :: ' + (service.isActive ? 'ONLINE' : 'OFFLINE')"
              ></span>
            </div>
            <div class="health-dots" v-else>
              <span class="health-dot dot-unknown"></span>
            </div>
            <span class="ops-value" v-if="serviceHealth.length > 0">
              <span class="clr-green">{{ onlineServiceCount }}</span>/<span>{{ serviceHealth.length }}</span> ONLINE
            </span>
            <span class="ops-value" v-else>NO DATA</span>
          </div>

          <div class="ops-block tags">
            <span class="ops-label">AGENT STATUS</span>
            <div class="tag-row">
              <span class="tag" :class="isSending ? 'tag-active' : 'tag-idle'">{{ isSending ? 'ACTIVE' : 'IDLE' }}</span>
              <span class="tag" :class="enableStreaming ? 'tag-active' : 'tag-idle'">STREAM {{ enableStreaming ? 'ON' : 'OFF' }}</span>
              <span class="tag" :class="allowScriptExecution ? 'tag-warning' : 'tag-idle'">SCRIPTS {{ allowScriptExecution ? 'ENABLED' : 'BLOCKED' }}</span>
              <span class="tag" :class="(lastResult && lastResult.usedFallback) ? 'tag-error' : 'tag-active'">{{ (lastResult && lastResult.usedFallback) ? 'FALLBACK' : 'DIRECT' }}</span>
            </div>
          </div>
        </div>
      </KMInfoBox>
    </KMInfoGrid>

    <div class="agent-layout">
      <KMInfoBox caption="Conversation" class="panel conversation-panel">
        <div class="panel-header">
          <h2>Conversation</h2>
          <div class="status-row">
            <span class="status-pill" :class="isSending ? 'active' : 'idle'">
              {{ isSending ? 'Thinking' : 'Idle' }}
            </span>
            <span class="status-text" v-if="streamStatus">{{ streamStatus }}</span>
          </div>
        </div>

        <div class="message-list" ref="messageListRef">
          <div v-if="messages.length === 0" class="empty-state">
            Ask KliveAgent to perform a mission. Example: "Check current Omnipotent health and notify me if any service looks unstable."
          </div>

          <article
            v-for="message in messages"
            :key="message.id"
            :class="['message', message.role]"
          >
            <div class="message-meta">
              <span class="role">{{ message.role === 'user' ? 'You' : 'KliveAgent' }}</span>
              <span class="time">{{ formatTime(message.createdAt) }}</span>
            </div>
            <div v-if="message.role === 'assistant'" class="message-body" v-html="message.formatted"></div>
            <div v-else class="message-body plain">{{ message.raw }}</div>
            <div v-if="message.streaming" class="stream-caret"></div>
          </article>
        </div>

        <div class="composer">
          <label>Mission</label>
          <textarea
            v-model="goalInput"
            placeholder="What should KliveAgent do?"
            rows="4"
            :disabled="isSending"
          ></textarea>

          <label>Additional Context (Optional)</label>
          <textarea
            v-model="contextInput"
            placeholder="Extra constraints, preferences, or data for this run"
            rows="3"
            :disabled="isSending"
          ></textarea>

          <KliveAgentVoiceRecorder :disabled="isSending" @voice-command="handleVoiceCommand" />

          <div class="controls">
            <label class="toggle"><input type="checkbox" v-model="allowScriptExecution" :disabled="isSending" /> Allow Script Execution</label>
            <label class="toggle"><input type="checkbox" v-model="notifyOnCompletion" :disabled="isSending" /> Notify Klives On Completion</label>
            <label class="toggle"><input type="checkbox" v-model="enableStreaming" :disabled="isSending" /> Token Streaming</label>
          </div>

          <div class="composer-actions">
            <div class="action-button" :class="{ disabled: isSending || !goalInput.trim() }">
              <KMButton :message="isSending ? 'Running...' : 'Send Mission'" @click="sendMission" />
            </div>
            <div class="action-button" :class="{ disabled: isSending }">
              <KMButton message="Clear Chat" @click="clearConversation" />
            </div>
            <div class="action-button" :class="{ disabled: isSending || loadingDecisions }">
              <KMButton :message="loadingDecisions ? 'Loading...' : 'Refresh Decisions'" @click="loadRecentDecisions" />
            </div>
          </div>
        </div>
      </KMInfoBox>

      <KMInfoBox caption="LLM Telemetry" class="panel telemetry-panel">
        <div class="panel-header">
          <h2>LLM Telemetry</h2>
          <span class="subtitle">Context, prompt, and action traces</span>
        </div>

        <div v-if="lastResult" class="telemetry-content">
          <div class="metric-grid">
            <div class="metric">
              <span class="label">Decision ID</span>
              <span class="value mono">{{ lastResult.decisionId }}</span>
            </div>
            <div class="metric">
              <span class="label">Mission Type</span>
              <span class="value">{{ lastResult.missionType }}</span>
            </div>
            <div class="metric">
              <span class="label">LLM Session</span>
              <span class="value mono">{{ lastResult.llmSessionId || 'N/A' }}</span>
            </div>
            <div class="metric">
              <span class="label">Approx Output Tokens</span>
              <span class="value">{{ lastResult.approxOutputTokens ?? 0 }}</span>
            </div>
            <div class="metric">
              <span class="label">Fallback Used</span>
              <span class="value" :class="lastResult.usedFallback ? 'danger' : 'success'">{{ lastResult.usedFallback ? 'Yes' : 'No' }}</span>
            </div>
            <div class="metric">
              <span class="label">Confidence</span>
              <span class="value">{{ formatConfidence(lastResult.decision?.confidence) }}</span>
            </div>
          </div>

          <div class="telemetry-block">
            <h3>Final Response</h3>
            <div class="formatted-response" v-html="formatAgentText(lastResult.finalResponse || lastResult.summary || '')"></div>
          </div>

          <div class="telemetry-block">
            <h3>Context Used</h3>
            <p class="context-line"><strong>Profile Scope:</strong> {{ lastResult.contextUsed?.requestingProfileScope || 'N/A' }}</p>
            <p class="context-line"><strong>Goal:</strong> {{ lastResult.contextUsed?.goal || 'N/A' }}</p>
            <p class="context-line"><strong>User Context:</strong> {{ lastResult.contextUsed?.userContext || 'None' }}</p>

            <details class="expandable" open>
              <summary>Prompt Used</summary>
              <pre class="mono-scroll">{{ lastResult.contextUsed?.promptUsed || '' }}</pre>
            </details>

            <details class="expandable" open>
              <summary>Memory Entries ({{ (lastResult.contextUsed?.memoryEntries || []).length }})</summary>
              <ul class="entry-list">
                <li v-for="(entry, index) in (lastResult.contextUsed?.memoryEntries || [])" :key="'mem-' + index">{{ entry }}</li>
              </ul>
            </details>

            <details class="expandable">
              <summary>Recent Event Entries ({{ (lastResult.contextUsed?.recentEventEntries || []).length }})</summary>
              <ul class="entry-list">
                <li v-for="(entry, index) in (lastResult.contextUsed?.recentEventEntries || [])" :key="'evt-' + index">{{ entry }}</li>
              </ul>
            </details>

            <details class="expandable">
              <summary>Matched Rule Entries ({{ (lastResult.contextUsed?.matchedRuleEntries || []).length }})</summary>
              <ul class="entry-list">
                <li v-for="(entry, index) in (lastResult.contextUsed?.matchedRuleEntries || [])" :key="'rule-' + index">{{ entry }}</li>
              </ul>
            </details>
          </div>

          <div class="telemetry-block">
            <h3>Action Plan</h3>
            <div class="action-row" v-for="(action, index) in (lastResult.decision?.actions || [])" :key="'planned-' + index">
              <span class="action-type">{{ action.actionType || action.action_type || 'unknown' }}</span>
              <span class="action-reason">{{ action.reason || 'No reason supplied.' }}</span>
            </div>
            <div class="action-row result" v-for="(result, index) in (lastResult.actionResults || [])" :key="'result-' + index">
              <span class="action-type">{{ result.actionType }}</span>
              <span class="action-reason">{{ result.status }} · {{ result.details }}</span>
            </div>
          </div>

          <details class="expandable">
            <summary>Raw Model Output</summary>
            <pre class="mono-scroll">{{ lastResult.rawModelOutput || '[empty]' }}</pre>
          </details>
        </div>

        <div v-else class="empty-state telemetry-empty">
          No mission run yet. Send a mission to populate telemetry.
        </div>

        <div class="telemetry-block decisions-block">
          <h3>Decision Log</h3>
          <div v-if="recentDecisions.length === 0" class="empty-small">No recent decisions recorded.</div>
          <button
            v-for="decision in recentDecisions"
            :key="decision.decisionId"
            class="decision-item"
            @click="lastResult = decision"
          >
            <span class="decision-service" :class="decision.usedFallback ? 'danger' : 'success'">{{ decision.missionType }}</span>
            <span class="decision-title">{{ decision.summary || decision.finalResponse || 'Decision' }}</span>
            <span class="decision-meta">{{ formatDate(decision.requestedAtUtc) }}</span>
          </button>
        </div>
      </KMInfoBox>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
</script>

<script>
import { useCookie } from '#imports';
import KMButton from '~/components/KMButton.vue';
import KMInfoBox from '~/components/KMInfoBox.vue';
import KMInfoGrid from '~/components/KMInfoGrid.vue';
import KliveAgentVoiceRecorder from '~/components/KliveAgentVoiceRecorder.vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';

export default {
  components: {
    KMButton,
    KMInfoBox,
    KMInfoGrid,
    KliveAgentVoiceRecorder
  },
  data() {
    return {
      goalInput: '',
      contextInput: '',
      conversationId: '',
      allowScriptExecution: true,
      notifyOnCompletion: false,
      enableStreaming: true,
      isSending: false,
      streamStatus: '',
      streamTimeoutMs: 190000,
      loadingDecisions: false,
      serviceHealth: [],
      healthRefreshHandle: null,
      messages: [],
      lastResult: null,
      recentDecisions: []
    };
  },
  computed: {
    onlineServiceCount() {
      return this.serviceHealth.filter(service => service.isActive).length;
    }
  },
  mounted() {
    this.initializeConversationId();
    this.loadRecentDecisions();
    this.loadServiceHealth();
    this.healthRefreshHandle = setInterval(() => {
      this.loadServiceHealth();
    }, 25000);
  },
  beforeUnmount() {
    if (this.healthRefreshHandle) {
      clearInterval(this.healthRefreshHandle);
      this.healthRefreshHandle = null;
    }
  },
  methods: {
    async sendMission() {
      if (this.isSending || !this.goalInput.trim()) {
        return;
      }

      const payload = {
        goal: this.goalInput.trim(),
        context: this.contextInput.trim(),
        conversationId: this.conversationId,
        allowScriptExecution: this.allowScriptExecution,
        notifyKlivesOnCompletion: this.notifyOnCompletion
      };

      const userText = this.contextInput.trim()
        ? `${this.goalInput.trim()}\n\nContext: ${this.contextInput.trim()}`
        : this.goalInput.trim();

      this.messages.push(this.createMessage('user', userText));
      const assistantMessage = this.createMessage('assistant', '');
      assistantMessage.streaming = true;
      this.messages.push(assistantMessage);
      this.scrollMessagesToBottom();

      this.streamStatus = 'Connecting...';
      this.isSending = true;

      try {
        if (this.enableStreaming) {
          await this.executeMissionStream(payload, assistantMessage);
        } else {
          await this.executeMissionStandard(payload, assistantMessage);
        }

        this.goalInput = '';
      } catch (err) {
        assistantMessage.raw = `KliveAgent request failed: ${err?.message || err}`;
        assistantMessage.formatted = this.formatAgentText(assistantMessage.raw);
        assistantMessage.streaming = false;
        this.streamStatus = 'Error';

        Swal.fire({
          icon: 'error',
          title: 'KliveAgent Error',
          text: assistantMessage.raw,
          confirmButtonColor: '#4d9e39',
          background: '#161516',
          color: '#ffffff'
        });
      } finally {
        this.isSending = false;
        this.scrollMessagesToBottom();
      }
    },

    handleVoiceCommand(voiceData) {
      // Extract transcript from voice command
      const { transcript, diagnostics } = voiceData;

      if (!transcript?.trim()) {
        Swal.fire({
          icon: 'warning',
          title: 'No Speech Detected',
          text: 'Please try speaking again. The microphone may not have picked up your voice.',
          confirmButtonColor: '#4d9e39',
          background: '#161516',
          color: '#ffffff'
        });
        return;
      }

      // Populate goal with transcribed text
      this.goalInput = transcript;

      // Optionally add voice diagnostics to context
      const voiceContext = diagnostics
        ? `[Voice Command]\nConfidence: ${Math.round(diagnostics.transcriptConfidence * 100)}%\nProcessing: ${diagnostics.totalDurationMs}ms`
        : '[Voice Command Received]';

      if (this.contextInput.trim()) {
        this.contextInput = `${this.contextInput}\n\n${voiceContext}`;
      } else {
        this.contextInput = voiceContext;
      }

      // Automatically send the mission
      this.sendMission();
    },

    async executeMissionStandard(payload, assistantMessage) {
      this.streamStatus = 'Waiting for response...';
      const response = await RequestPOSTFromKliveAPI('/kliveagent/brain/execute', JSON.stringify(payload), true, true);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Request failed (${response.status})`);
      }

      const result = await response.json();
      this.lastResult = this.normalizeBrainResult(result);
      assistantMessage.raw = this.lastResult.finalResponse || this.lastResult.summary || '[No response generated]';
      assistantMessage.formatted = this.formatAgentText(assistantMessage.raw);
      assistantMessage.streaming = false;
      this.streamStatus = 'Completed';
      await this.loadRecentDecisions();
    },

    async executeMissionStream(payload, assistantMessage) {
      const password = this.getPassword();
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => {
        controller.abort();
      }, this.streamTimeoutMs);

      let response;
      try {
        response = await fetch('https://klive.dev/kliveagent/brain/execute-stream', {
          method: 'POST',
          mode: 'cors',
          headers: {
            Authorization: password,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error(`KliveAgent stream timed out after ${Math.round(this.streamTimeoutMs / 1000)} seconds.`);
        }

        throw error;
      } finally {
        clearTimeout(timeoutHandle);
      }

      if (!response.ok || !response.body) {
        throw new Error(`Stream request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let doneReceived = false;
      const previousDecisionId = this.lastResult?.decisionId || '';

      this.streamStatus = 'Streaming tokens...';

      while (!doneReceived) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');

        while (true) {
          const eventBoundary = buffer.indexOf('\n\n');
          if (eventBoundary < 0) {
            break;
          }

          const rawEvent = buffer.slice(0, eventBoundary);
          buffer = buffer.slice(eventBoundary + 2);
          const handledDone = this.handleSseEvent(rawEvent, assistantMessage);
          if (handledDone) {
            doneReceived = true;
            break;
          }
        }
      }

      assistantMessage.streaming = false;
      if (!assistantMessage.raw.trim() && this.lastResult) {
        assistantMessage.raw = this.lastResult.finalResponse || this.lastResult.summary || '[No response generated]';
        assistantMessage.formatted = this.formatAgentText(assistantMessage.raw);
      }

      const receivedNewResult = Boolean(this.lastResult?.decisionId) && this.lastResult.decisionId !== previousDecisionId;
      if (doneReceived || receivedNewResult || assistantMessage.raw.trim().length > 0) {
        this.streamStatus = 'Completed';
      } else {
        this.streamStatus = 'Stream ended before completion signal.';
      }

      await this.loadRecentDecisions();
    },

    handleSseEvent(rawEvent, assistantMessage) {
      if (!rawEvent || !rawEvent.trim()) {
        return false;
      }

      let eventName = 'message';
      const dataLines = [];

      for (const line of rawEvent.split('\n')) {
        const normalizedLine = line.replace(/^\uFEFF/, '');
        if (normalizedLine.startsWith('event:')) {
          eventName = normalizedLine.slice(6).trim();
        } else if (normalizedLine.startsWith('data:')) {
          dataLines.push(normalizedLine.slice(5).trimStart());
        }
      }

      const data = dataLines.join('\n');
      if (eventName === 'status') {
        this.streamStatus = data;
        return false;
      }

      if (eventName === 'meta') {
        return false;
      }

      if (eventName === 'token') {
        let token = data;
        try {
          const parsed = JSON.parse(data);
          token = parsed.token ?? data;
        } catch {
          token = data;
        }

        assistantMessage.raw += token;
        assistantMessage.formatted = this.formatAgentText(assistantMessage.raw);
        this.scrollMessagesToBottom();
        return false;
      }

      if (eventName === 'result') {
        try {
          this.lastResult = this.normalizeBrainResult(JSON.parse(data));
        } catch {
          // Ignore parse error and keep the streamed text
        }
        return false;
      }

      if (eventName === 'error') {
        assistantMessage.raw += `\n[Stream Error] ${data}`;
        assistantMessage.formatted = this.formatAgentText(assistantMessage.raw);
        return false;
      }

      if (eventName === 'done') {
        return true;
      }

      return false;
    },

    createMessage(role, rawText) {
      return {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role,
        raw: rawText,
        formatted: role === 'assistant' ? this.formatAgentText(rawText) : this.escapeHtml(rawText),
        createdAt: new Date(),
        streaming: false
      };
    },

    clearConversation() {
      this.messages = [];
      this.streamStatus = '';
      this.rotateConversationId();
    },

    initializeConversationId() {
      if (!process.client) {
        this.conversationId = `server-${Date.now()}`;
        return;
      }

      const key = 'kliveagent-conversation-id';
      const existing = localStorage.getItem(key);
      if (existing) {
        this.conversationId = existing;
        return;
      }

      this.rotateConversationId();
    },

    rotateConversationId() {
      const next = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      this.conversationId = next;
      if (process.client) {
        localStorage.setItem('kliveagent-conversation-id', next);
      }
    },

    async loadServiceHealth() {
      try {
        const response = await RequestGETFromKliveAPI('/admin/frontpageStats', false, false);
        if (!response.ok) {
          return;
        }

        const json = await response.json();
        const services = Array.isArray(json?.Services) ? json.Services : [];
        this.serviceHealth = services.map(service => ({
          name: service.Name || 'UnknownService',
          isActive: Boolean(service.IsActive)
        }));
      } catch {
        // Keep UI stable if health endpoint fails.
      }
    },

    async loadRecentDecisions() {
      this.loadingDecisions = true;
      try {
        const response = await RequestGETFromKliveAPI('/kliveagent/brain/decisions?count=20', false, false);
        if (response.ok) {
          const data = await response.json();
          this.recentDecisions = Array.isArray(data) ? data.map(item => this.normalizeBrainResult(item)) : [];
        }
      } catch {
        // Ignore decision polling errors for UX continuity.
      } finally {
        this.loadingDecisions = false;
      }
    },

    normalizeBrainResult(raw) {
      if (!raw || typeof raw !== 'object') {
        return {
          decisionId: '',
          missionType: 'manual-task',
          llmSessionId: '',
          approxOutputTokens: 0,
          usedFallback: true,
          summary: '',
          finalResponse: '',
          rawModelOutput: '',
          decision: { summary: '', shouldAct: false, confidence: 0, finalResponse: '', actions: [] },
          contextUsed: { requestingProfileScope: '', goal: '', userContext: '', promptUsed: '', memoryEntries: [], recentEventEntries: [], matchedRuleEntries: [] },
          actionResults: [],
          requestedAtUtc: null
        };
      }

      const decisionRaw = raw.Decision || raw.decision || {};
      const contextRaw = raw.ContextUsed || raw.contextUsed || {};
      const actionsRaw = decisionRaw.Actions || decisionRaw.actions || [];
      const actionResultsRaw = raw.ActionResults || raw.actionResults || [];

      return {
        decisionId: raw.DecisionId ?? raw.decisionId ?? '',
        missionType: raw.MissionType ?? raw.missionType ?? 'manual-task',
        requestedAtUtc: raw.RequestedAtUtc ?? raw.requestedAtUtc ?? null,
        completedAtUtc: raw.CompletedAtUtc ?? raw.completedAtUtc ?? null,
        llmSessionId: raw.LlmSessionId ?? raw.llmSessionId ?? '',
        approxOutputTokens: raw.ApproxOutputTokens ?? raw.approxOutputTokens ?? 0,
        usedFallback: raw.UsedFallback ?? raw.usedFallback ?? false,
        summary: raw.Summary ?? raw.summary ?? '',
        finalResponse: raw.FinalResponse ?? raw.finalResponse ?? '',
        rawModelOutput: raw.RawModelOutput ?? raw.rawModelOutput ?? '',
        decision: {
          summary: decisionRaw.Summary ?? decisionRaw.summary ?? '',
          shouldAct: decisionRaw.ShouldAct ?? decisionRaw.shouldAct ?? false,
          confidence: decisionRaw.Confidence ?? decisionRaw.confidence ?? 0,
          finalResponse: decisionRaw.FinalResponse ?? decisionRaw.finalResponse ?? '',
          actions: Array.isArray(actionsRaw)
            ? actionsRaw.map(action => ({
              actionType: action.ActionType ?? action.actionType ?? action.action_type ?? '',
              reason: action.Reason ?? action.reason ?? '',
              message: action.Message ?? action.message ?? '',
              scriptCode: action.ScriptCode ?? action.scriptCode ?? action.script_code ?? '',
              memoryType: action.MemoryType ?? action.memoryType ?? action.memory_type ?? '',
              memoryTitle: action.MemoryTitle ?? action.memoryTitle ?? action.memory_title ?? '',
              memoryContent: action.MemoryContent ?? action.memoryContent ?? action.memory_content ?? ''
            }))
            : []
        },
        contextUsed: {
          requestingProfileScope: contextRaw.RequestingProfileScope ?? contextRaw.requestingProfileScope ?? '',
          goal: contextRaw.Goal ?? contextRaw.goal ?? '',
          userContext: contextRaw.UserContext ?? contextRaw.userContext ?? '',
          promptUsed: contextRaw.PromptUsed ?? contextRaw.promptUsed ?? '',
          memoryEntries: contextRaw.MemoryEntries ?? contextRaw.memoryEntries ?? [],
          recentEventEntries: contextRaw.RecentEventEntries ?? contextRaw.recentEventEntries ?? [],
          matchedRuleEntries: contextRaw.MatchedRuleEntries ?? contextRaw.matchedRuleEntries ?? []
        },
        actionResults: Array.isArray(actionResultsRaw)
          ? actionResultsRaw.map(result => ({
            actionType: result.ActionType ?? result.actionType ?? '',
            status: result.Status ?? result.status ?? '',
            details: result.Details ?? result.details ?? '',
            scriptRunId: result.ScriptRunId ?? result.scriptRunId ?? null
          }))
          : []
      };
    },

    formatTime(date) {
      return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    },

    formatDate(value) {
      if (!value) return 'Unknown';
      return new Date(value).toLocaleString();
    },

    formatConfidence(value) {
      if (value === null || value === undefined || Number.isNaN(value)) {
        return '0%';
      }

      const normalized = Math.max(0, Math.min(1, Number(value)));
      return `${(normalized * 100).toFixed(1)}%`;
    },

    escapeHtml(text) {
      return (text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },

    formatAgentText(text) {
      if (!text) {
        return '';
      }

      let safe = this.escapeHtml(text);
      const codeBlocks = [];

      safe = safe.replace(/```([\s\S]*?)```/g, (_, code) => {
        const html = `<pre class="code-block"><code>${code.trim()}</code></pre>`;
        codeBlocks.push(html);
        return `@@CODEBLOCK_${codeBlocks.length - 1}@@`;
      });

      safe = safe.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
      safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      safe = safe.replace(/\n/g, '<br>');

      safe = safe.replace(/@@CODEBLOCK_(\d+)@@/g, (_, idx) => codeBlocks[Number(idx)] || '');
      return safe;
    },

    scrollMessagesToBottom() {
      this.$nextTick(() => {
        const element = this.$refs.messageListRef;
        if (element) {
          element.scrollTop = element.scrollHeight;
        }
      });
    },

    getPassword() {
      try {
        const cookie = useCookie('password').value;
        return cookie || '';
      } catch {
        if (process.client) {
          const match = document.cookie.match(/(?:^|; )password=([^;]*)/);
          if (match) {
            return decodeURIComponent(match[1]);
          }
        }
        return '';
      }
    }
  }
};
</script>

<style scoped>
.agent-page {
  --bg-main: #201f20;
  --bg-panel: #161616;
  --bg-panel-2: #1c1c1c;
  --line-main: #2e2e2e;
  --line-soft: #2a2a2a;
  --txt-main: #ffffff;
  --txt-muted: #969696;
  --phosphor: #4d9e39;
  --phosphor-soft: #62ce47;
  --danger: #d26868;
  --warning: #d6b058;
  background: var(--bg-main);
  color: var(--txt-main);
  padding: 10px;
  min-height: calc(100vh - 88px);
  font-family: 'Roboto', sans-serif;
}

:deep(.infobox) {
  background: var(--bg-panel);
  border: 1px solid var(--line-main);
}

:deep(.caption) {
  color: var(--txt-muted);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 8px 10px;
}

.agent-header {
  margin-bottom: 10px;
  padding: 8px 4px;
}

.agent-kicker {
  color: var(--txt-muted);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.72rem;
  margin-bottom: 8px;
}

.agent-header h1 {
  margin: 0;
  font-size: 1.6rem;
  line-height: 1.1;
  color: var(--phosphor);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 800;
}

.agent-header p {
  margin: 8px 0 0;
  color: var(--txt-muted);
  max-width: 90ch;
}

.ops-strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 10px;
}

.ops-block {
  background: var(--bg-panel);
  border: 1px solid var(--line-main);
  padding: 10px 12px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
}

.ops-block.tags {
  grid-template-columns: auto 1fr;
}

.ops-label {
  color: var(--txt-muted);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.68rem;
  white-space: nowrap;
}

.ops-value {
  color: var(--txt-muted);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.clr-green {
  color: var(--phosphor);
}

.health-dots {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.health-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  border: 1px solid #101010;
}

.dot-online {
  background: var(--phosphor);
}

.dot-offline {
  background: var(--danger);
}

.dot-unknown {
  background: #4b4b4b;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  font-size: 0.69rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 3px 8px;
  border: 1px solid var(--line-soft);
  border-radius: 999px;
  color: var(--txt-muted);
  background: #141414;
}

.tag-active {
  color: var(--phosphor);
  border-color: #3b7b2c;
  background: rgba(77, 158, 57, 0.14);
}

.tag-idle {
  color: #8a8a8a;
}

.tag-error {
  color: var(--danger);
  border-color: #7c3131;
  background: rgba(210, 104, 104, 0.1);
}

.tag-warning {
  color: var(--warning);
  border-color: #71592b;
  background: rgba(214, 176, 88, 0.12);
}

.agent-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}

.panel {
  border: none;
  background: transparent;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line-main);
}

.panel-header h2 {
  margin: 0;
  font-size: 0.92rem;
  color: var(--phosphor);
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.panel-header .subtitle {
  color: var(--txt-muted);
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-pill {
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 100px;
  border: 1px solid var(--line-soft);
  color: var(--txt-muted);
}

.status-pill.active {
  color: var(--phosphor);
  border-color: #3b7b2c;
  background: rgba(77, 158, 57, 0.14);
}

.status-pill.idle {
  color: var(--txt-muted);
}

.status-text {
  font-size: 0.76rem;
  color: var(--txt-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.message-list {
  height: 480px;
  overflow: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--bg-panel-2);
}

.message {
  border: 1px solid var(--line-soft);
  padding: 8px 10px;
  background: #111111;
}

.message.user {
  border-left: 3px solid var(--phosphor);
}

.message.assistant {
  border-left: 3px solid var(--phosphor-soft);
}

.message-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: 0.7rem;
  color: var(--txt-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.message-body {
  color: var(--txt-main);
  line-height: 1.45;
  font-size: 0.9rem;
}

.message-body.plain {
  white-space: pre-wrap;
}

.stream-caret {
  width: 8px;
  height: 14px;
  margin-top: 6px;
  background: var(--phosphor);
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 45% { opacity: 1; }
  60%, 100% { opacity: 0; }
}

.composer {
  border-top: 1px solid var(--line-main);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--bg-panel);
}

.composer label {
  color: var(--txt-muted);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.composer textarea {
  resize: vertical;
  min-height: 74px;
  border: 1px solid var(--line-main);
  background: #111111;
  color: var(--txt-main);
  padding: 8px;
  font-size: 0.88rem;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 2px;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
  color: var(--txt-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.composer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}

.action-button {
  min-width: 180px;
  height: 62px;
  flex: 1 1 180px;
}

.action-button.disabled {
  opacity: 0.45;
  pointer-events: none;
}

.action-button :deep(button[name='kmButton']) {
  width: 100%;
  height: 100%;
}

button {
  border: 1px solid var(--line-main);
  border-radius: 0;
  padding: 7px 12px;
  color: var(--txt-main);
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  cursor: pointer;
  background: #111;
}

button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

button.send {
  border-color: #1f5b2d;
  color: var(--phosphor);
  background: #0f150f;
}

button.secondary {
  background: #131313;
  border-color: #303030;
}

button:hover:not(:disabled) {
  border-color: #3d4e3d;
}

.telemetry-content {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.metric {
  border: 1px solid var(--line-main);
  padding: 8px;
  background: #101010;
}

.metric .label {
  display: block;
  font-size: 0.66rem;
  color: var(--txt-muted);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.metric .value {
  font-size: 1.03rem;
  color: var(--phosphor);
  font-weight: 700;
  word-break: break-word;
}

.metric .value.success {
  color: var(--phosphor);
}

.metric .value.danger {
  color: var(--danger);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.telemetry-block {
  border: 1px solid var(--line-main);
  background: #101010;
  padding: 10px;
}

.telemetry-block h3 {
  margin: 0 0 8px;
  font-size: 0.78rem;
  color: var(--phosphor);
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.formatted-response {
  line-height: 1.5;
}

.context-line {
  margin: 4px 0;
  color: var(--txt-main);
  line-height: 1.45;
  font-size: 0.86rem;
}

.expandable {
  margin-top: 8px;
}

.expandable summary {
  cursor: pointer;
  color: var(--txt-main);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-size: 0.73rem;
}

.mono-scroll {
  max-height: 180px;
  overflow: auto;
  background: #090909;
  border: 1px solid var(--line-main);
  padding: 8px;
  color: #cad1ca;
  white-space: pre-wrap;
  font-size: 0.82rem;
}

.entry-list {
  margin: 8px 0 0;
  padding-left: 18px;
  color: var(--txt-main);
}

.entry-list li {
  margin: 5px 0;
  font-size: 0.83rem;
}

.action-row {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 6px;
}

.action-row.result {
  opacity: 0.85;
}

.action-type {
  min-width: 110px;
  border: 1px solid var(--line-main);
  background: #0c0c0c;
  padding: 4px 6px;
  font-size: 0.7rem;
  text-transform: uppercase;
  color: var(--phosphor);
  letter-spacing: 0.06em;
}

.action-reason {
  color: var(--txt-main);
  font-size: 0.84rem;
  line-height: 1.4;
}

.decisions-block {
  margin: 10px;
}

.decision-item {
  width: 100%;
  text-align: left;
  background: #111;
  border: 1px solid var(--line-main);
  margin-bottom: 5px;
  border-radius: 0;
  display: grid;
  grid-template-columns: 138px minmax(0, 1fr) auto;
  gap: 10px;
  padding: 8px;
  align-items: center;
}

.decision-service {
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: 1px solid var(--line-main);
  padding: 3px 6px;
  justify-self: start;
}

.decision-service.success {
  color: var(--phosphor);
  border-color: #1f5b2d;
}

.decision-service.danger {
  color: var(--danger);
  border-color: #5e2121;
}

.decision-title {
  font-size: 0.84rem;
  color: var(--txt-main);
  line-height: 1.3;
}

.decision-meta {
  font-size: 0.72rem;
  color: var(--txt-muted);
  white-space: nowrap;
}

.empty-state,
.telemetry-empty,
.empty-small {
  color: var(--txt-muted);
  border: 1px dashed var(--line-main);
  padding: 12px;
  line-height: 1.45;
  background: #0f0f0f;
}

:deep(.code-block) {
  margin: 8px 0;
  overflow: auto;
  border: 1px solid var(--line-main);
  background: #080808;
  padding: 8px;
}

:deep(.inline-code) {
  border: 1px solid var(--line-main);
  background: #0b0b0b;
  padding: 1px 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--phosphor);
}

@media (max-width: 1180px) {
  .ops-strip {
    grid-template-columns: 1fr;
  }

  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .agent-layout {
    grid-template-columns: 1fr;
  }

  .message-list {
    height: 390px;
  }
}

@media (max-width: 640px) {
  .ops-block,
  .ops-block.tags {
    grid-template-columns: 1fr;
    align-items: start;
    gap: 8px;
  }

  .metric-grid {
    grid-template-columns: 1fr;
  }

  .decision-item {
    grid-template-columns: 1fr;
    gap: 5px;
  }

  .controls,
  .composer-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .action-button {
    min-width: 0;
    width: 100%;
  }
}
</style>
