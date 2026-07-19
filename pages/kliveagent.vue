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
        <button
          v-if="view === 'chat'"
          class="ka-panels-toggle"
          :class="{ 'is-open': liveOpen }"
          type="button"
          @click="toggleLive"
          title="Toggle the live view of the agent controlling the computer"
        >▦ Live</button>
        <button
          v-if="view === 'chat'"
          class="ka-panels-toggle"
          :class="{ 'is-open': panelsOpen }"
          type="button"
          @click="panelsOpen = !panelsOpen"
          title="Toggle Scripts / Session / Tasks panels"
        >⚏ Panels <span v-if="unreadNotificationCount" class="ka-notification-badge">{{ unreadNotificationCount }}</span></button>
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

          <AgentMessage
            v-for="(msg, i) in messages"
            :key="messageKey(msg, i)"
            :message="msg"
            @stop="stopRun(msg.requestId)"
          />

          <div v-if="loading && !pendingRequestId" class="chat-thinking">
            <span class="chat-thinking-glyph">◈</span>
            <span class="msg-typing"><span></span><span></span><span></span></span>
          </div>
        </div>

        <!-- Setup loading bar: shown until KliveAgent finishes warming up (100% = ready to talk). -->
        <div v-if="!agentReady" class="ka-setup" :class="{ 'ka-setup-failed': agentState === 'failed' }">
          <div class="ka-setup-top">
            <span class="ka-setup-label">
              {{ agentState === 'failed' ? '⚠ KliveAgent failed to start' : '◈ KliveAgent is starting up…' }}
            </span>
            <span class="ka-setup-pct">{{ agentProgress }}%</span>
          </div>
          <div class="ka-setup-track">
            <div class="ka-setup-fill" :style="{ width: agentProgress + '%' }"></div>
          </div>
          <div class="ka-setup-msg">{{ agentStatusMessage }}</div>
        </div>

        <div class="chat-input-row">
          <textarea
            ref="chatInput"
            v-model="inputMessage"
            class="chat-input"
            rows="1"
            :placeholder="agentReady ? (loading ? 'Steer the active run…  (Enter to send)' : 'Ask KliveAgent anything…  (Enter to send, Shift+Enter for newline)') : 'KliveAgent is still setting up…'"
            :disabled="!agentReady"
            @input="autoGrowInput"
            @keydown.enter.exact.prevent="sendMessage"
          ></textarea>
          <button @click="sendMessage" type="button" class="chat-send-btn" :disabled="isSendDisabled" :title="sendButtonTitle">
            {{ loading ? 'Steer' : 'Send' }}
          </button>
        </div>
        <div v-if="pollConnectionLost" class="chat-reconnect">Connection interrupted — retrying without stopping KliveAgent.</div>
      </div>

      <!-- Dedicated live video stream of what the agent is doing on the host machine. Slides out with
           motion when the agent starts driving the computer, and can be toggled/dismissed manually. -->
      <transition name="ka-liveslide">
        <LiveScreen
          v-if="liveOpen"
          :frame="liveFrame"
          :phase="livePhase"
          :status-note="liveStatusNote"
          :iteration="liveIteration"
          :approval="liveApproval"
          @approve="submitApproval"
          @close="dismissLive"
        />
      </transition>

      <!-- Toggleable overlay: scripts + session/tasks/recent (hidden by default in commander view). -->
      <transition name="ka-drawer">
        <div v-if="panelsOpen" class="ka-drawer-wrap">
          <div class="ka-drawer-backdrop" @click="panelsOpen = false"></div>
          <aside class="ka-drawer">
            <div class="ka-drawer-head">
              <span class="ka-drawer-title">Panels</span>
              <button class="ka-drawer-close" type="button" @click="panelsOpen = false" title="Close">✕</button>
            </div>

            <div class="ka-drawer-body">
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
                    <span class="rail-title">Long-term Jobs</span>
                    <div class="rail-head-actions">
                      <button class="rail-refresh" type="button" @click="showNewJob = !showNewJob" title="Create a parallel job">＋</button>
                      <button class="rail-refresh" type="button" @click="loadJobs" title="Refresh jobs">⟳</button>
                    </div>
                  </div>
                  <form v-if="showNewJob" class="job-create" @submit.prevent="createJob">
                    <input v-model="newJob.name" class="job-input" placeholder="Job name (optional)" />
                    <textarea v-model="newJob.goal" class="job-input" rows="3" placeholder="What should KliveAgent accomplish in the background?" required></textarea>
                    <label class="job-budget">Token budget (USD)<input v-model.number="newJob.tokenBudgetUsd" class="job-budget-input" type="number" min="0.1" step="0.5" /></label>
                    <button class="rail-newchat" type="submit" :disabled="creatingJob || !newJob.goal.trim()">{{ creatingJob ? 'Starting…' : 'Start in parallel' }}</button>
                  </form>
                  <div v-if="jobError" class="job-error">{{ jobError }}</div>
                  <div v-if="jobs.length === 0" class="rail-empty">No long-term jobs.</div>
                  <div v-for="job in jobs" :key="job.jobId" class="job-card">
                    <div class="task-header">
                      <span class="task-status" :class="getJobStatusClass(job.status)">{{ job.status }}</span>
                      <div class="job-actions">
                        <button v-if="canStopJob(job)" class="cancel-btn" type="button" @click="stopJob(job.jobId)">Stop</button>
                        <button v-if="canResumeJob(job)" class="job-resume" type="button" @click="resumeJob(job.jobId)">Resume</button>
                      </div>
                    </div>
                    <div class="job-name">{{ job.name || 'Long-term job' }}</div>
                    <div class="task-desc">{{ job.goal }}</div>
                    <div v-if="job.attentionRequired" class="job-error">{{ job.attentionMessage }}</div>
                    <div class="task-time">Updated {{ formatTime(job.lastUpdated) }}</div>
                    <NuxtLink class="job-project-link" :to="'/projects/' + job.projectId">Open Project →</NuxtLink>
                    <pre v-if="job.result" class="task-result">{{ job.result }}</pre>
                    <div v-if="job.artifactPaths?.length" class="job-artifacts">
                      <span v-for="path in job.artifactPaths" :key="path" class="job-artifact">{{ path }}</span>
                    </div>
                    <form v-if="canSteerJob(job)" class="job-steer" @submit.prevent="steerJob(job)">
                      <input v-model="jobSteerDrafts[job.jobId]" class="job-input" placeholder="Add guidance…" />
                      <button class="job-steer-btn" type="submit" :disabled="!jobSteerDrafts[job.jobId]?.trim()">Steer</button>
                    </form>
                  </div>
                </div>

                <div class="rail-block">
                  <div class="rail-head">
                    <span class="rail-title">Results <span v-if="unreadNotificationCount" class="rail-count">{{ unreadNotificationCount }}</span></span>
                    <button class="rail-refresh" type="button" @click="loadNotifications" title="Refresh results">⟳</button>
                  </div>
                  <div v-if="notifications.length === 0" class="rail-empty">No completed work yet.</div>
                  <button
                    v-for="note in recentNotifications"
                    :key="note.notificationId"
                    class="notification-card"
                    :class="{ 'is-unread': !note.readAt }"
                    type="button"
                    @click="openNotification(note)"
                  >
                    <span class="notification-title">{{ note.title }}</span>
                    <span class="notification-body">{{ note.body }}</span>
                    <span class="task-time">{{ formatTime(note.createdAt) }}</span>
                  </button>
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
                    <span class="rail-conv-preview">
                      <span v-if="conv.activeRun" class="rail-conv-working">● Working</span>
                      {{ conv.lastMessage || 'Empty conversation' }}
                    </span>
                    <span class="rail-conv-meta">{{ conv.sourceChannel }} · {{ formatTime(conv.lastUpdated) }}</span>
                  </button>
                </div>
              </aside>
            </div>
          </aside>
        </div>
      </transition>
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
import LiveScreen from '~/components/KliveAgent/LiveScreen.vue';
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

// ── KliveAgent setup readiness (loading bar) ──
// The backend gates chat until it finishes warming up; talking too early returned "Something went wrong."
// We poll /kliveagent/status (ungated) and show a progress bar until ready (100%), gating the composer.
const agentReady = ref(false);
const agentProgress = ref(0);
const agentState = ref('starting');           // 'starting' | 'ready' | 'failed'
const agentStatusMessage = ref('Connecting to KliveAgent…');
let agentStatusHandle = null;
const loading = ref(false);
const sending = ref(false);
const pendingRequestId = ref(null);
const conversationId = ref(null);
const chatMessages = ref(null);
const chatInput = ref(null);
const pollConnectionLost = ref(false);
let componentActive = false;
let pollGeneration = 0;
let conversationLoadGeneration = 0;
let sideDataHandle = null;

// ── Commander view: live screen feed + toggleable side panels ──
const panelsOpen = ref(false);
const liveOpen = ref(false);        // is the live-view panel slid out?
const liveDismissed = ref(false);   // user closed it this run → don't auto-reopen on every frame
const liveFrame = ref(null);        // base64 JPEG of the latest annotated computer-use frame
const liveApproval = ref(null);     // pending approval card (or null)
const livePhase = ref('');
const liveStatusNote = ref('');
const liveIteration = ref(0);

// Slide the live view away (user pressed ✕). Stays closed until the next message starts a run.
function dismissLive() {
  liveOpen.value = false;
  liveDismissed.value = true;
}
function toggleLive() {
  liveOpen.value = !liveOpen.value;
  liveDismissed.value = !liveOpen.value;
}

// ── Durable chat attachment ──
// The server owns run state. Local storage only remembers which conversation the user was viewing;
// it is never used to decide whether work exists or should be cancelled.
const LAST_CONVERSATION_KEY = 'kliveagent.lastConversation';
const LEGACY_ACTIVE_RUN_KEY = 'kliveagent.activeRun';

function newClientId(prefix) {
  const random = globalThis.crypto?.randomUUID?.().replaceAll('-', '')
    || Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${random}`;
}

function messageKey(message, index) {
  return message.messageId || message.requestId || message.clientMessageId || `${message.role}-${message.timestamp}-${index}`;
}

function rememberConversation(id) {
  try {
    if (id) localStorage.setItem(LAST_CONVERSATION_KEY, id);
    else localStorage.removeItem(LAST_CONVERSATION_KEY);
  } catch {}
}

function detachLocalRun() {
  // Invalidating the generation stops only this component's poll loop. The backend run continues.
  pollGeneration += 1;
  pendingRequestId.value = null;
  loading.value = false;
  pollConnectionLost.value = false;
  liveApproval.value = null;
}

function findRunMessage(requestId) {
  return messages.value.find((message) => message.role === 'KliveAgent' && message.requestId === requestId);
}

function ensureRunMessage(run) {
  if (!run?.requestId) return null;
  let message = findRunMessage(run.requestId);
  if (!message) {
    message = {
      messageId: `run_${run.requestId}`,
      requestId: run.requestId,
      clientMessageId: run.clientMessageId || null,
      role: 'KliveAgent',
      content: run.response || '',
      scripts: [],
      activity: [],
      pending: run.status === 'Running',
      phase: run.phase || 'thinking',
      timestamp: run.createdAt || new Date().toISOString(),
      sequence: 0,
    };
    messages.value.push(message);
  }
  return message;
}

// Apply the live transparency fields from a pending-poll payload onto a message object.
function applyPendingFields(msg, data) {
  if (!msg || !data) return;
  msg.requestId = data.requestId || msg.requestId;
  msg.clientMessageId = data.clientMessageId || msg.clientMessageId;
  msg.sequence = Math.max(Number(msg.sequence) || 0, Number(data.sequence) || 0);
  if (data.response != null) msg.content = data.response;
  if (Array.isArray(data.scriptsExecuted)) msg.scripts = data.scriptsExecuted;
  msg.phase = data.phase;
  msg.iteration = data.iteration;
  msg.promptTokens = data.promptTokens;
  msg.completionTokens = data.completionTokens;
  msg.statusNote = data.statusNote;
  if (Array.isArray(data.activity)) msg.activity = data.activity;
  // Computer-use: drive the dedicated LiveScreen panel (video stream + approval gate), not the bubble.
  // A new frame slides the live view out automatically (unless the user dismissed it this run); a pending
  // approval always forces it open since it needs a decision.
  if (data.latestFrame) {
    liveFrame.value = data.latestFrame;
    if (!liveDismissed.value) liveOpen.value = true;
  }
  liveApproval.value = data.pendingApproval && data.pendingApproval.status === 'pending' ? data.pendingApproval : null;
  if (liveApproval.value) { liveOpen.value = true; liveDismissed.value = false; }
  livePhase.value = data.phase || '';
  liveStatusNote.value = data.statusNote || '';
  liveIteration.value = data.iteration || 0;
}

// Approve/deny a pending computer-use action (the inline card buttons). Resolves it server-side; the
// poll loop then clears the card and the blocked action proceeds or aborts.
async function submitApproval({ approvalId, approved }) {
  if (!approvalId) return;
  try {
    await RequestPOSTFromKliveAPI('/kliveagent/chat/approve', JSON.stringify({ approvalId, approved }), true, true);
  } catch {}
}

// Stop the live run (manual Stop button). Cancels server-side; the poll loop then observes a
// non-Running status and renders the truthful partial answer.
async function stopRun(requestId = pendingRequestId.value) {
  const id = requestId || pendingRequestId.value;
  if (!id) return;
  const message = findRunMessage(id);
  if (message) message.statusNote = 'Stopping safely…';
  try {
    await RequestPOSTFromKliveAPI('/kliveagent/chat/cancel', JSON.stringify({ requestId: id }), true, true);
  } catch {}
}

async function fetchRuns(targetConversationId = null, includeCompleted = false) {
  const params = new URLSearchParams();
  if (targetConversationId) params.set('conversationId', targetConversationId);
  params.set('includeCompleted', String(includeCompleted));
  params.set('_t', String(Date.now()));
  const response = await RequestGETFromKliveAPI(`/kliveagent/chat/runs?${params.toString()}`);
  const { data, rawText } = await readAgentApiResponse(response);
  if (!response.ok) throw new Error(data?.error || rawText || `Run reconciliation failed with HTTP ${response.status}`);
  return Array.isArray(data) ? data : [];
}

function attachRun(run) {
  if (!run?.requestId || run.status !== 'Running') return;
  const message = ensureRunMessage(run);
  applyPendingFields(message, run);
  message.pending = true;
  pendingRequestId.value = run.requestId;
  loading.value = true;
  pollConnectionLost.value = false;
  const generation = ++pollGeneration;
  void pollPendingResponse(run.requestId, generation);
}

async function reconcileActiveRun(targetConversationId = conversationId.value) {
  const reconciliationLoadGeneration = conversationLoadGeneration;
  const selectedConversationId = conversationId.value;
  const runs = await fetchRuns(targetConversationId, false);
  if (!componentActive
    || reconciliationLoadGeneration !== conversationLoadGeneration
    || selectedConversationId !== conversationId.value) return null;
  const running = runs
    .filter((run) => run?.status === 'Running')
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  const run = running[0];
  if (!run) return null;

  if (!targetConversationId || conversationId.value !== run.conversationId) {
    await loadConversation(run.conversationId);
  } else if (pendingRequestId.value !== run.requestId) {
    attachRun(run);
  }
  return run;
}

// Restore the last viewed conversation, then ask the server for active runs. If browser storage was
// cleared, the global run list still discovers work and opens its conversation.
async function restoreDurableSession() {
  let preferredConversation = null;
  try {
    preferredConversation = localStorage.getItem(LAST_CONVERSATION_KEY);
    if (!preferredConversation) {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_ACTIVE_RUN_KEY) || 'null');
      preferredConversation = legacy?.conversationId || null;
    }
    localStorage.removeItem(LEGACY_ACTIVE_RUN_KEY);
  } catch {}

  if (preferredConversation) {
    const expectedLoadGeneration = conversationLoadGeneration + 1;
    try { await loadConversation(preferredConversation); } catch {}
    if (conversationLoadGeneration !== expectedLoadGeneration) return;
  }
  if (!pendingRequestId.value) {
    try { await reconcileActiveRun(conversationId.value || null); } catch {}
  }
}

// ── Side data ──
const tasks = ref([]);
const jobs = ref([]);
const notifications = ref([]);
const showNewJob = ref(false);
const creatingJob = ref(false);
const newJob = ref({ name: '', goal: '', tokenBudgetUsd: 10, clientJobId: null });
const jobSteerDrafts = ref({});
const jobError = ref('');
let notificationsInitialized = false;
const knownNotificationIds = new Set();
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
const recentNotifications = computed(() => notifications.value.slice(0, 8));
const unreadNotificationCount = computed(() => notifications.value.filter((note) => !note.readAt).length);

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

const isSendDisabled = computed(() => sending.value || !agentReady.value || !inputMessage.value.trim());

const sendButtonTitle = computed(() => {
  if (!agentReady.value) {
    return agentState.value === 'failed'
      ? 'KliveAgent failed to start — check the bot logs.'
      : `KliveAgent is starting up… (${agentProgress.value}%)`;
  }
  if (sending.value) return 'Delivering your message…';
  if (loading.value) return 'Send guidance to the active run.';
  return inputMessage.value.trim() ? 'Start a durable run' : 'Type a message to enable Send.';
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
  conversationLoadGeneration += 1;
  detachLocalRun();
  messages.value = [];
  conversationId.value = null;
  inputMessage.value = '';
  liveApproval.value = null;
  liveStatusNote.value = '';
  livePhase.value = '';
  liveIteration.value = 0;
  liveOpen.value = false;
  liveDismissed.value = false;
  // liveFrame is kept as the last seen view until a new run produces one.
  rememberConversation(null);
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
  if (!msg || sending.value || !agentReady.value) return;

  // Sending is an explicit choice of the currently displayed conversation; invalidate any older
  // conversation-load request that is still in flight.
  conversationLoadGeneration += 1;
  const targetConversationId = conversationId.value || newClientId('conv');
  const clientMessageId = newClientId('msg');
  const activeRequestId = pendingRequestId.value;
  conversationId.value = targetConversationId;
  rememberConversation(targetConversationId);

  const optimisticMessage = {
    messageId: `client_${clientMessageId}`,
    clientMessageId,
    requestId: activeRequestId || null,
    role: 'User',
    content: msg,
    timestamp: new Date().toISOString(),
    deliveryStatus: 'sending',
  };
  messages.value.push(optimisticMessage);
  inputMessage.value = '';
  resetInputHeight();
  sending.value = true;
  liveDismissed.value = false; // allow the live view to auto-open if this run drives the computer
  scrollToBottom(true);
  const isStillSelected = () => conversationId.value === targetConversationId;

  try {
    let path = activeRequestId ? '/kliveagent/chat/steer' : '/kliveagent/chat';
    let payload = activeRequestId
      ? { requestId: activeRequestId, message: msg, senderName: 'Website', clientMessageId }
      : { message: msg, conversationId: targetConversationId, senderName: 'Website', clientMessageId };
    let { response: res, data, rawText } = await postAgentJsonWithRetry(path, payload);

    // The run may seal in the instant between typing and POST. In that case the message becomes a
    // fresh turn with the same idempotency key, so steering guidance is never discarded.
    if (activeRequestId && res.status === 409) {
      path = '/kliveagent/chat';
      payload = { message: msg, conversationId: targetConversationId, senderName: 'Website', clientMessageId };
      ({ response: res, data, rawText } = await postAgentJsonWithRetry(path, payload));
    }

    if (!res.ok) {
      throw new Error(
        data?.response || data?.reason || data?.error || data?.errorMessage || rawText || `KliveAgent API request failed with HTTP ${res.status}`
      );
    }
    if (!data) {
      throw new Error(rawText || 'KliveAgent API returned an empty response.');
    }

    optimisticMessage.deliveryStatus = 'accepted';
    optimisticMessage.messageId = data.acceptedMessageId || data.messageId || optimisticMessage.messageId;
    optimisticMessage.requestId = data.pendingRequestId || data.requestId || activeRequestId || null;
    const acceptedConversationId = data.conversationId || targetConversationId;
    if (isStillSelected()) {
      conversationId.value = acceptedConversationId;
      rememberConversation(acceptedConversationId);
    }

    const runRequestId = data.pendingRequestId || data.requestId || activeRequestId;
    const isSteeringReceipt = data.accepted === true && !!data.requestId;
    if (runRequestId && (data.isPending || data.wasSteering || isSteeringReceipt)) {
      if (isStillSelected() && pendingRequestId.value !== runRequestId) {
        attachRun({
          ...data,
          requestId: runRequestId,
          conversationId: conversationId.value,
          clientMessageId,
          userMessage: msg,
          response: data.response || '',
          status: 'Running',
          createdAt: new Date().toISOString(),
        });
      }
    } else if (isStillSelected() && data.success !== false && data.response) {
      messages.value.push({
        messageId: newClientId('agent'),
        role: 'KliveAgent',
        content: data.response,
        scripts: data.scriptsExecuted || [],
        timestamp: new Date().toISOString(),
      });
    } else if (data.success === false || data.accepted === false) {
      throw new Error(data.response || data.reason || data.errorMessage || 'KliveAgent rejected the message.');
    }
  } catch (err) {
    // A timeout is ambiguous: the server may already have durably accepted the message. Reconcile
    // by client ID before showing failure, which makes automatic retries safe and duplicate-free.
    let recovered = false;
    try {
      const runs = await fetchRuns(targetConversationId, true);
      const run = runs.find((candidate) => candidate.clientMessageId === clientMessageId
        || candidate.steeringMessages?.some((steer) => steer.clientMessageId === clientMessageId));
      if (run) {
        recovered = true;
        optimisticMessage.deliveryStatus = 'accepted';
        optimisticMessage.requestId = run.requestId;
        if (isStillSelected() && run.status === 'Running') attachRun(run);
        else if (isStillSelected()) await loadConversation(targetConversationId);
      }
    } catch {}

    if (!recovered && isStillSelected()) {
      optimisticMessage.deliveryStatus = 'failed';
      messages.value.push({
        messageId: newClientId('error'),
        role: 'KliveAgent',
        content: 'I could not confirm delivery of that message. Your conversation is safe; please retry it.\n\n' + err.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  sending.value = false;
  scrollToBottom();
}

async function postAgentJsonWithRetry(path, payload) {
  let lastResult;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await RequestPOSTFromKliveAPI(path, JSON.stringify(payload), true, true);
    const parsed = await readAgentApiResponse(response);
    lastResult = { response, ...parsed };
    if (response.status !== 504 || attempt === 1) return lastResult;
    await waitForPendingPoll(700);
  }
  return lastResult;
}

function waitForPendingPoll(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollPendingResponse(requestId, generation) {
  let failures = 0;
  const attachedConversationId = conversationId.value;
  const isStillAttached = () => componentActive
    && generation === pollGeneration
    && pendingRequestId.value === requestId
    && conversationId.value === attachedConversationId;
  while (componentActive && generation === pollGeneration && pendingRequestId.value === requestId) {
    try {
      const res = await RequestGETFromKliveAPI(`/kliveagent/chat/pending?requestId=${encodeURIComponent(requestId)}&_t=${Date.now()}`);
      const { data, rawText } = await readAgentApiResponse(res);
      if (!isStillAttached()) return;

      if (!res.ok) {
        throw new Error(data?.error || rawText || `Pending request failed with HTTP ${res.status}`);
      }
      if (!data) throw new Error('KliveAgent returned an empty run snapshot.');

      failures = 0;
      pollConnectionLost.value = false;
      const message = ensureRunMessage({ ...data, requestId });
      if ((Number(data.sequence) || 0) >= (Number(message.sequence) || 0)) applyPendingFields(message, data);

      if (data.status === 'Running') {
        message.pending = true;
        scrollToBottom();
        await waitForPendingPoll(600);
        continue;
      }

      const finalResponse = data.finalResponse;
      message.pending = false;
      message.phase = 'final';
      message.timestamp = data.completedAt || new Date().toISOString();

      if (finalResponse) {
        conversationId.value = finalResponse.conversationId || data.conversationId || conversationId.value;
        message.content = finalResponse.response || message.content;
        message.scripts = finalResponse.scriptsExecuted || message.scripts || [];
      } else if (!message.content || data.status !== 'Completed') {
        message.content = data.errorMessage || `This run ended with status: ${data.status}.`;
      }
      rememberConversation(conversationId.value);
      pendingRequestId.value = null;
      loading.value = false;
      pollConnectionLost.value = false;
      void loadConversations();
      void loadNotifications();
      break;
    } catch (err) {
      // A transport failure detaches nothing and cancels nothing. Keep the truthful live bubble and
      // retry with bounded backoff until navigation changes the generation or the server recovers.
      if (!isStillAttached()) return;
      failures += 1;
      pollConnectionLost.value = true;
      const message = findRunMessage(requestId);
      if (message) message.statusNote = `Connection lost; reconnecting (attempt ${failures})…`;
      await waitForPendingPoll(Math.min(10_000, 750 * (2 ** Math.min(failures, 4))));
    }
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

// ── Durable long-term jobs + result notifications ──
function canStopJob(job) {
  return ['Active', 'Planning'].includes(job?.status);
}

function canResumeJob(job) {
  return ['Paused', 'Blocked', 'BudgetPaused'].includes(job?.status);
}

function canSteerJob(job) {
  return ['Active', 'Planning'].includes(job?.status);
}

function getJobStatusClass(status) {
  if (status === 'Completed') return 'status-completed';
  if (status === 'Active' || status === 'Planning') return 'status-running';
  if (status === 'Blocked' || status === 'BudgetPaused') return 'status-failed';
  return 'status-cancelled';
}

async function loadJobs() {
  try {
    const response = await RequestGETFromKliveAPI('/kliveagent/jobs');
    const { data } = await readAgentApiResponse(response);
    if (response.ok && Array.isArray(data)) jobs.value = data;
  } catch {}
}

async function createJob() {
  const goal = newJob.value.goal.trim();
  if (!goal || creatingJob.value) return;
  creatingJob.value = true;
  jobError.value = '';
  const clientJobId = newJob.value.clientJobId || newClientId('job');
  newJob.value.clientJobId = clientJobId;
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
    const response = await RequestPOSTFromKliveAPI('/kliveagent/jobs/create', JSON.stringify({
      clientJobId,
      name: newJob.value.name.trim() || null,
      goal,
      conversationId: conversationId.value,
      tokenBudgetUsd: Math.max(0.1, Number(newJob.value.tokenBudgetUsd) || 10),
      subAgentCap: 3,
    }), true, true);
    const { data, rawText } = await readAgentApiResponse(response);
    if (!response.ok) throw new Error(data?.error || data?.errorMessage || rawText || `HTTP ${response.status}`);
    newJob.value = { name: '', goal: '', tokenBudgetUsd: 10, clientJobId: null };
    showNewJob.value = false;
    await loadJobs();
  } catch (error) {
    // A lost POST response is ambiguous. Reconcile by the stable creation ID before showing an
    // error; the backend idempotency key guarantees a retry cannot fund duplicate work.
    await loadJobs();
    if (jobs.value.some((job) => job.clientJobId === clientJobId)) {
      newJob.value = { name: '', goal: '', tokenBudgetUsd: 10, clientJobId: null };
      showNewJob.value = false;
    } else {
      jobError.value = 'Could not start job: ' + error.message;
    }
  } finally {
    creatingJob.value = false;
  }
}

async function steerJob(job) {
  const message = jobSteerDrafts.value[job.jobId]?.trim();
  if (!message) return;
  jobError.value = '';
  try {
    const response = await RequestPOSTFromKliveAPI('/kliveagent/jobs/steer', JSON.stringify({
      jobId: job.jobId,
      message,
      senderName: 'Website',
    }), true, true);
    const { data, rawText } = await readAgentApiResponse(response);
    if (!response.ok) throw new Error(data?.reason || data?.error || rawText || `HTTP ${response.status}`);
    jobSteerDrafts.value[job.jobId] = '';
    await loadJobs();
  } catch (error) {
    jobError.value = `Could not steer job: ${error.message}`;
  }
}

async function stopJob(jobId) {
  jobError.value = '';
  try {
    const response = await RequestPOSTFromKliveAPI('/kliveagent/jobs/stop', JSON.stringify({ jobId }), true, true);
    const { data, rawText } = await readAgentApiResponse(response);
    if (!response.ok) throw new Error(data?.error || rawText || `HTTP ${response.status}`);
    await loadJobs();
  } catch (error) {
    jobError.value = `Could not stop job: ${error.message}`;
  }
}

async function resumeJob(jobId) {
  jobError.value = '';
  try {
    const response = await RequestPOSTFromKliveAPI('/kliveagent/jobs/resume', JSON.stringify({ jobId }), true, true);
    const { data, rawText } = await readAgentApiResponse(response);
    if (!response.ok) throw new Error(data?.error || rawText || `HTTP ${response.status}`);
    await loadJobs();
  } catch (error) {
    jobError.value = `Could not resume job: ${error.message}`;
  }
}

async function loadNotifications() {
  try {
    const response = await RequestGETFromKliveAPI('/kliveagent/notifications');
    const { data } = await readAgentApiResponse(response);
    if (!response.ok || !Array.isArray(data)) return;

    if (notificationsInitialized && 'Notification' in window && Notification.permission === 'granted') {
      for (const note of data) {
        if (!note.readAt && !knownNotificationIds.has(note.notificationId) && document.hidden) {
          new Notification(note.title || 'KliveAgent finished work', { body: note.body || '' });
        }
      }
    }
    data.forEach((note) => knownNotificationIds.add(note.notificationId));
    notificationsInitialized = true;
    notifications.value = data;
  } catch {}
}

async function openNotification(note) {
  if (!note.readAt) {
    note.readAt = new Date().toISOString();
    try {
      await RequestPOSTFromKliveAPI('/kliveagent/notifications/read', JSON.stringify({ notificationId: note.notificationId }), true, true);
    } catch {}
  }
  panelsOpen.value = true;
  if (note.kind === 'job-attention' && note.projectId) {
    await navigateTo('/projects/' + note.projectId);
  } else if (note.conversationId) {
    await loadConversation(note.conversationId);
  }
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
    const data = await res.json();
    if (res.ok && Array.isArray(data)) conversationList.value = data;
  } catch {}
}

async function loadConversation(convId) {
  const loadGeneration = ++conversationLoadGeneration;
  detachLocalRun();
  const res = await RequestGETFromKliveAPI(`/kliveagent/conversations/get?id=${encodeURIComponent(convId)}&_t=${Date.now()}`);
  const { data, rawText } = await readAgentApiResponse(res);
  if (loadGeneration !== conversationLoadGeneration || !componentActive) return;
  if (!res.ok || !data) throw new Error(data?.error || rawText || `Conversation failed with HTTP ${res.status}`);

  conversationId.value = data.conversationId || convId;
  rememberConversation(conversationId.value);
  messages.value = (Array.isArray(data.messages) ? data.messages : []).map((m) => ({
      messageId: m.messageId,
      requestId: m.requestId,
      role: m.role === 'User' ? 'User' : 'KliveAgent',
      content: m.content,
      // Replay the scripts+outputs the agent ran on this turn (persisted server-side).
      scripts: m.scriptResults || (m.scriptResult ? [m.scriptResult] : []),
      timestamp: m.timestamp,
      deliveryStatus: m.deliveryStatus,
    }));
  view.value = 'chat';

  const running = (Array.isArray(data.recentRuns) ? data.recentRuns : [])
    .filter((run) => run?.status === 'Running')
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))[0];
  if (running) attachRun(running);
  scrollToBottom(true);
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

// Poll the agent's setup status until it's ready, driving the loading bar.
async function pollAgentStatus() {
  try {
    const res = await RequestGETFromKliveAPI(`/kliveagent/status?_t=${Date.now()}`, false, false);
    if (res.ok) {
      const data = await res.json();
      agentState.value = data.state || 'starting';
      if (typeof data.progress === 'number') agentProgress.value = data.progress;
      if (data.message) agentStatusMessage.value = data.message;
      agentReady.value = !!data.ready;
    } else {
      // Backend reachable but not ready (or 202/503 during warmup) — keep the bar up and retry.
      agentStatusMessage.value = 'Waiting for KliveAgent to come online…';
    }
  } catch {
    agentStatusMessage.value = 'Waiting for KliveAgent to come online…';
  }
  if (!componentActive) return;
  // Keep a lightweight heartbeat even after readiness so a live service restart immediately
  // disables new sends, while durable history/jobs remain usable and active runs reconcile.
  const delay = agentReady.value ? 10_000 : agentState.value === 'failed' ? 4_000 : 1_000;
  agentStatusHandle = setTimeout(pollAgentStatus, delay);
}

async function refreshDurableSideData() {
  await Promise.allSettled([loadTasks(), loadConversations(), loadJobs(), loadNotifications()]);
  if (componentActive && conversationId.value && !pendingRequestId.value) {
    try { await reconcileActiveRun(conversationId.value); } catch {}
  }
}

onMounted(() => {
  componentActive = true;
  // Chat is the default view — load just what the chat rail needs up front.
  pollAgentStatus();
  void refreshDurableSideData();
  // Re-attach from server state. This also discovers active work when browser storage was cleared.
  void restoreDurableSession();
  sideDataHandle = setInterval(refreshDurableSideData, 10_000);
});

onUnmounted(() => {
  componentActive = false;
  // This only invalidates the page's poll generation; no server cancellation or durable state clear.
  detachLocalRun();
  if (sideDataHandle) {
    clearInterval(sideDataHandle);
    sideDataHandle = null;
  }
  if (agentStatusHandle) {
    clearTimeout(agentStatusHandle);
    agentStatusHandle = null;
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

/* Setup loading bar (shown until KliveAgent is ready to talk) */
.ka-setup {
  padding: 12px 16px;
  background: $mainDarker;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.ka-setup-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
}
.ka-setup-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
  color: #cfcfcf;
}
.ka-setup-pct {
  font-size: 12px;
  font-weight: 800;
  color: $secondary;
  font-variant-numeric: tabular-nums;
}
.ka-setup-track {
  height: 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.ka-setup-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba($secondary, 0.8), $secondary);
  transition: width 0.5s ease;
  box-shadow: 0 0 10px rgba($secondary, 0.5);
}
.ka-setup-msg {
  margin-top: 6px;
  font-size: 11px;
  color: #8a8a8a;
}
.ka-setup-failed .ka-setup-pct { color: #ff7a7a; }
.ka-setup-failed .ka-setup-fill {
  background: #ff5a5a;
  box-shadow: 0 0 10px rgba(255, 80, 80, 0.5);
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

.chat-reconnect {
  padding: 6px 14px 8px;
  background: $mainDarker;
  color: #f0b44d;
  font-size: 11px;
  text-align: right;
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

.rail-head-actions,
.job-actions {
  display: flex;
  align-items: center;
  gap: 5px;
}

.ka-notification-badge,
.rail-count {
  display: inline-flex;
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #e0584b;
  color: #fff;
  font-size: 9px;
  font-weight: 800;
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

/* ── Durable jobs + completion results ── */
.job-create,
.job-steer {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 10px;
}
.rail-conv-working {
  margin-right: 4px;
  color: $secondary;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
}

.job-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 9px;
  background: #121212;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 7px;
  color: #d0d0d0;
  font: inherit;
  font-size: 11px;
  resize: vertical;
  outline: none;
}
.job-input:focus { border-color: rgba($secondary, 0.5); }

.job-budget {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #777;
  font-size: 10px;
}
.job-budget-input {
  width: 70px;
  padding: 5px 7px;
  color: #ccc;
  background: #121212;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 6px;
}

.job-card {
  background: #202020;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
}
.job-name {
  margin-bottom: 4px;
  color: #ddd;
  font-size: 12px;
  font-weight: 700;
}
.job-resume,
.job-steer-btn {
  padding: 3px 8px;
  border: 1px solid rgba($secondary, 0.3);
  border-radius: 5px;
  background: rgba($secondary, 0.12);
  color: $teritary;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}
.job-steer {
  flex-direction: row;
  margin: 8px 0 0;
}
.job-steer .job-input { flex: 1; min-width: 0; }
.job-steer-btn:disabled,
.rail-newchat:disabled { opacity: 0.45; cursor: not-allowed; }
.job-artifacts {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 7px;
}
.job-artifact {
  overflow: hidden;
  color: #7daedb;
  font: 10px 'Cascadia Code', monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.job-error {
  margin: 6px 0 9px;
  padding: 7px;
  border-radius: 6px;
  background: rgba(224, 88, 75, 0.1);
  color: #e9786c;
  font-size: 10px;
}
.job-project-link {
  display: inline-block;
  margin-top: 5px;
  color: #7daedb;
  font-size: 10px;
  text-decoration: none;
}
.job-project-link:hover { color: #a9cff1; text-decoration: underline; }

.notification-card {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 6px;
  padding: 9px 10px;
  text-align: left;
  background: #202020;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  cursor: pointer;
}
.notification-card.is-unread {
  border-color: rgba($secondary, 0.4);
  background: rgba($secondary, 0.08);
}
.notification-title { color: #ddd; font-size: 11px; font-weight: 700; }
.notification-body {
  display: -webkit-box;
  overflow: hidden;
  color: #888;
  font-size: 10px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

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

/* ── Header: panels toggle ── */
.ka-panels-toggle {
  font-size: 12px;
  font-weight: 600;
  color: #bdbdbd;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 7px 12px;
  cursor: pointer;
}
.ka-panels-toggle:hover { background: rgba(255, 255, 255, 0.09); }
.ka-panels-toggle.is-open {
  color: $teritary;
  background: rgba($secondary, 0.16);
  border-color: rgba($secondary, 0.4);
}

/* ── Commander view: chat + live screen side by side ── */
.view-chat .chat-panel { flex: 1 1 0; }

/* Live view slide-out motion (the panel is added/removed via v-if; the chat panel reflows to fill). */
.ka-liveslide-enter-active,
.ka-liveslide-leave-active {
  transition: transform 0.34s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.26s ease;
  will-change: transform, opacity;
}
.ka-liveslide-enter-from,
.ka-liveslide-leave-to {
  transform: translateX(6%);
  opacity: 0;
}

/* ── Toggleable overlay drawer (Scripts / Session / Tasks / Recent) ── */
.ka-drawer-wrap {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: flex-end;
}
.ka-drawer-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(1px);
}
.ka-drawer {
  position: relative;
  width: min(720px, 92vw);
  height: 100%;
  background: #161616;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: -20px 0 60px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
}
.ka-drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex: 0 0 auto;
}
.ka-drawer-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #9a9a9a;
}
.ka-drawer-close {
  font-size: 14px;
  color: #9a9a9a;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 6px;
}
.ka-drawer-close:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
.ka-drawer-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
/* Panels fill the drawer width instead of their fixed sidebar widths. */
.ka-drawer-body .script-panel {
  width: auto;
  flex: 0 0 auto;
  max-height: 55vh;
}
.ka-drawer-body .chat-rail {
  width: auto;
  flex: 0 0 auto;
  overflow: visible;
}

/* Drawer slide/fade transition */
.ka-drawer-enter-active,
.ka-drawer-leave-active { transition: opacity 0.2s ease; }
.ka-drawer-enter-active .ka-drawer,
.ka-drawer-leave-active .ka-drawer { transition: transform 0.25s ease; }
.ka-drawer-enter-from,
.ka-drawer-leave-to { opacity: 0; }
.ka-drawer-enter-from .ka-drawer,
.ka-drawer-leave-to .ka-drawer { transform: translateX(100%); }

/* ── Responsive ── */
@media (max-width: 1100px) {
  .view-chat {
    flex-direction: column;
    height: auto;
  }
  .view-chat .chat-panel {
    height: 55vh;
    flex: none;
  }
  .live-screen {
    height: 42vh;
    flex: none;
  }
}
</style>
