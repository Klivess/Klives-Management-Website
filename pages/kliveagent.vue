<template>
  <div class="kax" data-testid="kax-root">
    <!-- ── bar ── -->
    <header class="kax-bar">
      <div class="kax-bar__id">
        <span class="kax-mark" :data-working="isWorking || undefined"><KliveAgentIcon name="agent" /></span>
        <h1 class="kax-bar__title">KliveAgent</h1>
      </div>
      <span class="kax-verdict" :data-tone="verdict.tone" :title="verdict.detail" data-testid="kax-verdict">
        <span class="kax-verdict__dot"></span>
        <span class="kax-verdict__word">{{ verdict.word }}</span>
        <span class="kax-verdict__detail">{{ verdict.detail }}</span>
      </span>

      <nav class="kax-views" role="tablist" aria-label="View">
        <button v-for="v in VIEWS" :key="v.id" class="kax-views__tab" type="button" role="tab" :aria-selected="view === v.id" :data-testid="`view-${v.id}`" @click="setView(v.id)">
          <KliveAgentIcon :name="v.icon" /><span class="kax-views__label">{{ v.label }}</span>
        </button>
      </nav>

      <span class="kax-bar__spacer"></span>

      <button class="kax-search" type="button" aria-label="Search conversations and actions" aria-keyshortcuts="Control+K" data-testid="kax-search" @click="paletteOpen = true">
        <KliveAgentIcon name="search" />
        <span class="kax-search__text">Find a conversation, memory or action…</span>
        <span class="kax-kbd">Ctrl</span><span class="kax-kbd">K</span>
      </button>
      <span class="kax-live" :data-state="agent.linkState.value" :data-tone="linkTone" :title="linkTitle" data-testid="kax-live">
        <span class="kax-live__dot"></span><span class="kax-live__word">{{ linkWord }}</span>
      </span>
      <button v-if="view === 'chat'" class="kax-iconbtn" type="button" :aria-pressed="sidePressed" title="What is going on (results, schedule, background work)" aria-label="Toggle the side panel" data-testid="kax-side-toggle" @click="toggleSide">
        <KliveAgentIcon name="panel-right" />
        <span v-if="agent.unreadCount.value && !sidePressed" class="kax-badge">{{ agent.unreadCount.value }}</span>
      </button>
      <button class="kax-btn kax-btn--primary kax-btn--sm" type="button" title="New chat (N)" aria-keyshortcuts="N" data-testid="kax-new-chat" @click="startNewChat">
        <KliveAgentIcon name="plus" /><span class="kax-new-label">New chat</span>
      </button>
    </header>

    <!-- ── chat ── -->
    <div v-show="view === 'chat'" class="kax-work" :data-side="sideShown ? 'open' : 'closed'" :data-rail="railShown ? 'open' : 'closed'">
      <KliveAgentConversationRail
        v-if="railShown"
        ref="rail"
        :conversations="agent.conversations.value"
        :loaded="agent.conversationsLoaded.value"
        :selected="chat.conversationId.value"
        :filter="prefs.filter"
        :working="working"
        :now="agent.now.value"
        @open="openConversation"
        @new="startNewChat"
        @update:filter="f => setPref('filter', f)"
      />

      <section class="kax-chat" aria-label="Conversation">
        <header class="kax-chat__head">
          <button v-if="narrowRail" class="kax-iconbtn" type="button" title="Conversations" aria-label="Show conversations" data-testid="kax-rail-open" @click="railDrawer = true"><KliveAgentIcon name="panel-left" /></button>
          <div style="min-width: 0; display: flex; flex-direction: column">
            <span class="kax-chat__title" data-testid="kax-chat-title">{{ chatTitle }}</span>
            <span class="kax-chat__sub">
              <template v-if="chat.conversationId.value">
                <span>{{ ORIGIN_LABELS[chatOrigin] }}</span>
                <span>· {{ chat.messages.value.length }} message{{ chat.messages.value.length === 1 ? '' : 's' }}</span>
                <span v-if="chatTokens">· {{ chatTokens }} tokens</span>
              </template>
              <template v-else>New conversation · {{ agent.ready.value ? 'KliveAgent is listening' : 'waiting for KliveAgent' }}</template>
            </span>
          </div>
          <span v-if="chat.loading.value" class="kax-chip kax-chip--dot" data-tone="accent" data-pulse="true" data-testid="kax-chat-running">running</span>
          <div class="kax-chat__tools">
            <button class="kax-btn kax-btn--sm" :class="{ 'kax-btn--ghost': !chat.liveOpen.value }" type="button" :aria-pressed="chat.liveOpen.value" title="KliveAgent's computer, live" data-testid="kax-live-toggle" @click="chat.toggleLive()">
              <KliveAgentIcon name="screen" />Computer<span v-if="chat.liveApproval.value" class="kax-unread-dot" style="background: var(--kax-warn)"></span>
            </button>
            <button class="kax-iconbtn" type="button" title="Copy a link to this conversation" aria-label="Copy link" :disabled="!chat.conversationId.value" @click="copyLink"><KliveAgentIcon name="external" /></button>
            <button class="kax-iconbtn" type="button" title="Download the conversation, scripts and outputs as CSV" aria-label="Export CSV" :disabled="!chat.messages.value.length" data-testid="kax-export" @click="chat.downloadCsv()"><KliveAgentIcon name="download" /></button>
          </div>
        </header>

        <div class="kax-chat__split">
          <div class="kax-chat__thread-col" data-testid="kax-thread" @dragenter.prevent="chat.onDragEnter" @dragover.prevent="chat.onDragOver" @dragleave.prevent="chat.onDragLeave" @drop.prevent="chat.onDrop">
            <div v-if="chat.draggingFiles.value" class="kax-drop" data-testid="kax-drop">Drop files to attach them</div>
            <div ref="threadEl" class="kax-thread">
              <div class="kax-thread__inner">
                <div v-if="chat.conversationError.value" class="kax-banner" data-tone="crit" role="alert"><KliveAgentIcon name="alert" />{{ chat.conversationError.value }}</div>
                <div v-if="!chat.messages.value.length && !chat.loadingConversation.value" class="kax-hello" data-testid="kax-hello">
                  <span class="kax-hello__mark"><KliveAgentIcon name="agent" /></span>
                  <h2>What should KliveAgent do?</h2>
                  <p>It runs C# against the live services, uses its own computer, and remembers what it learns.</p>
                  <div class="kax-hello__grid">
                    <button v-for="s in starters" :key="s.title" class="kax-starter" type="button" :data-testid="`starter-${s.id}`" @click="useStarter(s)">
                      <b><KliveAgentIcon :name="s.icon" />{{ s.title }}</b><span>{{ s.sub }}</span>
                    </button>
                  </div>
                </div>
                <div v-if="chat.loadingConversation.value && !chat.messages.value.length" class="kax-loading">Opening the conversation…</div>
                <KliveAgentMessage
                  v-for="(msg, i) in chat.messages.value"
                  :key="msg.messageId || msg.requestId || msg.clientMessageId || `${msg.role}-${msg.timestamp}-${i}`"
                  :message="msg"
                  :speaking="chat.talk.state === 'speaking' && i === chat.lastAgentIndex.value"
                  @stop="chat.stopRun(msg.requestId)"
                />
                <div v-if="chat.sending.value && !chat.pendingRequestId.value" class="kax-typing" aria-label="Sending"><span></span><span></span><span></span></div>
              </div>
            </div>

            <div v-if="chat.pollConnectionLost.value" class="kax-banner" data-tone="warn" style="margin-bottom: 6px"><KliveAgentIcon name="alert" />Connection interrupted. Retrying without stopping KliveAgent.</div>

            <div class="kax-composer" data-testid="kax-composer">
              <div class="kax-composer__box" :data-steering="chat.loading.value || undefined">
                <template v-if="!chat.talk.active">
                  <div v-if="chat.pendingFiles.value.length" class="kax-composer__files">
                    <span v-for="(file, index) in chat.pendingFiles.value" :key="index" class="kax-composer__file" data-testid="kax-attachment">
                      <KliveAgentIcon name="file" />{{ file.name }}<small>{{ fmtSize(file.size) }}</small>
                      <button class="kax-iconbtn kax-iconbtn--sm" type="button" :disabled="chat.sending.value" :aria-label="`Remove ${file.name}`" @click="chat.removeAttachment(index)"><KliveAgentIcon name="x" /></button>
                    </span>
                  </div>
                  <textarea
                    ref="inputEl"
                    v-model="chat.inputMessage.value"
                    rows="1"
                    :placeholder="placeholder"
                    :disabled="!agent.ready.value || !agent.allowed.value.chat"
                    aria-label="Message KliveAgent"
                    data-testid="kax-input"
                    @input="chat.autoGrowInput()"
                    @keydown.enter.exact.prevent="chat.sendMessage()"
                  ></textarea>
                  <div class="kax-composer__row">
                    <label class="kax-attach" :aria-disabled="attachDisabled" title="Attach files, images or videos (or drop them on the conversation)" data-testid="kax-attach">
                      <KliveAgentIcon name="paperclip" />
                      <input type="file" multiple hidden :disabled="attachDisabled" data-testid="kax-file-input" @change="chat.chooseAttachments">
                    </label>
                    <button class="kax-iconbtn" :class="{ 'is-resumable': chat.talkResumable.value }" type="button" :disabled="!agent.ready.value || !agent.allowed.value.chat"
                      :aria-pressed="chat.talkResumable.value || undefined" :title="chat.talkResumable.value ? 'Resume talking (Ctrl+.)' : 'Talk instead of typing (Ctrl+.)'"
                      aria-label="Talk mode" data-testid="talk-toggle" @click="chat.enterTalkMode()">
                      <KliveAgentIcon name="mic" />
                    </button>
                    <span class="kax-composer__hint">{{ hint }}</span>
                    <button class="kax-btn kax-btn--primary kax-composer__send" type="button" :disabled="chat.isSendDisabled.value" :title="sendTitle" data-testid="kax-send" @click="chat.sendMessage()">
                      <KliveAgentIcon :name="chat.loading.value ? 'flag' : 'send'" />{{ chat.loading.value ? 'Steer' : 'Send' }}
                    </button>
                  </div>
                </template>
                <div v-else class="kax-composer__talk"><TalkBar :talk="chat.talk" @exit="chat.exitTalkMode()" /></div>
              </div>
              <div v-if="!chat.talk.active && chat.talk.state === 'error' && chat.talk.error" class="kax-composer__error" role="alert">Talk mode stopped: {{ chat.talk.error }}</div>
              <div v-if="chat.attachmentError.value" class="kax-composer__error" role="alert" data-testid="kax-attachment-error">{{ chat.attachmentError.value }}</div>
              <div v-if="!agent.allowed.value.chat && agent.allowed.value.history" class="kax-composer__error" style="color: var(--kax-ink-3)">Your profile can read KliveAgent's history but not chat with it.</div>
            </div>
          </div>

          <div v-if="chat.liveOpen.value" class="kax-live-pane" data-testid="kax-live-pane">
            <LiveScreen
              :frame="chat.liveFrame.value ?? undefined"
              :phase="chat.livePhase.value"
              :status-note="chat.liveStatusNote.value"
              :iteration="chat.liveIteration.value"
              :approval="chat.liveApproval.value"
              :container-id="liveContainer ?? undefined"
              :asleep="computerAsleep"
              @approve="chat.submitApproval"
              @resolve-takeover="chat.resolveTakeover"
              @close="chat.dismissLive()"
            />
          </div>
        </div>
      </section>

      <aside v-if="sideShown" class="kax-side" aria-label="Now" data-testid="kax-side">
        <template v-if="true">
          <KliveAgentVitalsCard :summary="agent.summary.value" :stats="agent.stats.value" :status="agent.status.value" :ready="agent.ready.value" :now="agent.now.value" @insights="setView('insights')" />
          <section class="kax-card" aria-label="Computer" data-testid="kax-computer">
            <header class="kax-card__head"><h2 class="kax-card__title"><KliveAgentIcon name="monitor" />Computer</h2></header>
            <div class="kax-card__body">
              <button class="kax-computer" type="button" style="width: 100%; text-align: left" :data-tone="computerState.tone" @click="chat.toggleLive()">
                <span class="kax-computer__screen" :data-tone="computerState.tone"><KliveAgentIcon :name="computerState.tone === 'warn' ? 'hand' : 'screen'" /></span>
                <span class="kax-computer__text">
                  <span class="kax-computer__word">{{ computerState.word }}</span>
                  <span class="kax-computer__detail" style="display: block">{{ computerState.detail }}</span>
                </span>
                <KliveAgentIcon name="chevron-right" class="kax-dim" />
              </button>
            </div>
          </section>
          <KliveAgentInboxCard :notes="agent.notes.value" :unread="agent.unreadNotes.value" :now="agent.now.value" @open="openNote" @read-all="agent.markAllRead()" />
          <KliveAgentScheduleCard :schedule="agent.schedule.value" :supported="agent.scheduleSupported.value" :can-cancel="agent.allowed.value.jobs" :now="agent.now.value" @cancel="t => (cancelFor = t)" @open="openConversation" />
          <KliveAgentWorkCard :jobs="agent.jobs.value" :tasks="agent.tasks.value" :can-manage="agent.allowed.value.jobs" :now="agent.now.value"
            @new-job="jobOpen = true" @stop="j => agent.jobAction('stop', j.jobId)" @resume="j => agent.jobAction('resume', j.jobId)"
            @steer="(j, m) => agent.steerJob(j.jobId, m)" @cancel-task="t => agent.cancelTask(t.taskId)" />
          <section v-if="chat.currentTurnScripts.value.length" class="kax-card" aria-label="Scripts this turn" data-testid="kax-turn-scripts">
            <header class="kax-card__head">
              <h2 class="kax-card__title"><KliveAgentIcon name="code" />Scripts this turn</h2>
              <span class="kax-card__meta">{{ chat.currentTurnScripts.value.length }} · {{ chat.currentTurnScripts.value.filter(s => s.success === false).length }} failed</span>
            </header>
            <div class="kax-card__body" style="max-height: 360px; overflow-y: auto">
              <KliveAgentScriptCard v-for="(s, si) in [...chat.currentTurnScripts.value].reverse()" :key="si" :script="s" />
            </div>
          </section>
        </template>
      </aside>
    </div>

    <!-- ── insights / library ── -->
    <div v-if="view === 'insights'" class="kax-work kax-work--full">
      <KliveAgentInsightsView :stats="agent.stats.value" :loading="agent.statsLoading.value" :now="agent.now.value" @refresh="agent.loadStats(true)" />
    </div>
    <div v-if="libraryVisited" v-show="view === 'library'" class="kax-work kax-work--full">
      <KliveAgentLibraryView ref="library" :can-manage="agent.allowed.value.memoriesManage" :can-read="agent.allowed.value.memories || agent.allowed.value.history" :now="agent.now.value"
        @delete="item => (deleteFor = item)" @notify="(tone, text) => agent.notify(tone, text)" />
    </div>

    <!-- ── narrow screens: the rail and the side panel as drawers ── -->
    <Teleport to="body">
      <template v-if="railDrawer && narrowRail && view === 'chat'">
        <div class="kax-layer"><div class="kax-drawer-scrim" @click="railDrawer = false"></div></div>
        <div class="kax kax-layer kax-drawer" data-side="left" style="height: 100vh">
          <KliveAgentConversationRail :conversations="agent.conversations.value" :loaded="agent.conversationsLoaded.value" :selected="chat.conversationId.value"
            :filter="prefs.filter" :working="working" :now="agent.now.value" @open="id => { railDrawer = false; openConversation(id); }"
            @new="() => { railDrawer = false; startNewChat(); }" @update:filter="f => setPref('filter', f)" />
        </div>
      </template>
      <template v-if="sideDrawer && narrowSide && view === 'chat'">
        <div class="kax-layer"><div class="kax-drawer-scrim" @click="sideDrawer = false"></div></div>
        <div class="kax kax-layer kax-drawer" data-side="right" data-testid="kax-side-drawer">
          <KliveAgentVitalsCard :summary="agent.summary.value" :stats="agent.stats.value" :status="agent.status.value" :ready="agent.ready.value" :now="agent.now.value" @insights="() => { sideDrawer = false; setView('insights'); }" />
          <KliveAgentInboxCard :notes="agent.notes.value" :unread="agent.unreadNotes.value" :now="agent.now.value" @open="n => { sideDrawer = false; openNote(n); }" @read-all="agent.markAllRead()" />
          <KliveAgentScheduleCard :schedule="agent.schedule.value" :supported="agent.scheduleSupported.value" :can-cancel="agent.allowed.value.jobs" :now="agent.now.value" @cancel="t => (cancelFor = t)" @open="id => { sideDrawer = false; openConversation(id); }" />
          <KliveAgentWorkCard :jobs="agent.jobs.value" :tasks="agent.tasks.value" :can-manage="agent.allowed.value.jobs" :now="agent.now.value"
            @new-job="jobOpen = true" @stop="j => agent.jobAction('stop', j.jobId)" @resume="j => agent.jobAction('resume', j.jobId)"
            @steer="(j, m) => agent.steerJob(j.jobId, m)" @cancel-task="t => agent.cancelTask(t.taskId)" />
        </div>
      </template>
    </Teleport>

    <!-- ── confirmations ── -->
    <KliveAgentDialog :open="!!cancelFor" title="Cancel this scheduled task?" :sub="cancelFor ? plainText(cancelFor.instruction, 200) : ''" icon="calendar" tone="warn" testid="kax-cancel-dialog" @close="cancelFor = null">
      <p class="kax-dim">It will not fire again. KliveAgent can schedule it anew if you ask.</p>
      <template #actions>
        <button class="kax-btn kax-btn--ghost" type="button" @click="cancelFor = null">Keep it</button>
        <button class="kax-btn kax-btn--danger" type="button" data-testid="kax-cancel-confirm" @click="confirmCancel"><KliveAgentIcon name="x" />Cancel the task</button>
      </template>
    </KliveAgentDialog>

    <KliveAgentDialog :open="!!deleteFor" :title="deleteFor?.memoryType === 'Shortcut' ? 'Delete this shortcut?' : 'Forget this memory?'" :sub="deleteFor ? plainText(deleteFor.title || deleteFor.content, 200) : ''" icon="trash" tone="crit" testid="kax-delete-dialog" @close="deleteFor = null">
      <p class="kax-dim">KliveAgent stops recalling it. This cannot be undone from the page.</p>
      <template #actions>
        <button class="kax-btn kax-btn--ghost" type="button" @click="deleteFor = null">Keep it</button>
        <button class="kax-btn kax-btn--danger" type="button" data-testid="kax-delete-confirm" @click="confirmDelete"><KliveAgentIcon name="trash" />Delete</button>
      </template>
    </KliveAgentDialog>

    <KliveAgentDialog :open="jobOpen" title="Start a background job" sub="It runs in parallel as a Projects task force and reports back here and on Discord." icon="layers" tone="accent" testid="kax-job-dialog" @close="jobOpen = false">
      <label class="kax-field">Name<input v-model="jobDraft.name" class="kax-input" placeholder="optional" /></label>
      <label class="kax-field">Goal<textarea v-model="jobDraft.goal" class="kax-input" rows="4" placeholder="What should KliveAgent accomplish?" data-autofocus data-testid="kax-job-goal"></textarea></label>
      <label class="kax-field">Token budget (USD)<input v-model.number="jobDraft.tokenBudgetUsd" class="kax-input" type="number" min="0.1" step="0.5" style="width: 140px" /></label>
      <template #actions>
        <button class="kax-btn kax-btn--ghost" type="button" @click="jobOpen = false">Cancel</button>
        <button class="kax-btn kax-btn--primary" type="button" :disabled="!jobDraft.goal.trim() || jobBusy" data-testid="kax-job-start" @click="startJob">{{ jobBusy ? 'Starting…' : 'Start in parallel' }}</button>
      </template>
    </KliveAgentDialog>

    <KliveAgentCommandPalette :open="paletteOpen" :commands="commandsFor" @close="paletteOpen = false" />

    <Teleport to="body">
      <div v-if="agent.toasts.value.length" class="kax-layer">
        <div class="kax-toasts" role="status" aria-live="polite">
          <div v-for="toast in agent.toasts.value" :key="toast.id" class="kax-toast" :data-tone="toast.tone" data-testid="kax-toast">
            <KliveAgentIcon :name="toast.tone === 'crit' ? 'octagon-x' : toast.tone === 'warn' ? 'alert' : toast.tone === 'info' ? 'info' : 'check-circle'" />
            <span class="kax-toast__text">{{ toast.text }}</span>
            <button class="kax-iconbtn kax-iconbtn--sm" type="button" aria-label="Dismiss" @click="agent.dismissToast(toast.id)"><KliveAgentIcon name="x" /></button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useAgentChat, newClientId } from '~/composables/useAgentChat';
import { useAgentConsole } from '~/composables/useAgentConsole';
import {
  ORIGIN_LABELS, computerState as describeComputer, conversationOrigin, conversationTitle, fmtCompact, fmtSize, plainText,
  type AgentCommand, type AgentNote, type ConversationFilter, type ScheduledTask,
} from '~/scripts/agentConsole';
import KliveAgentIcon from '~/components/KliveAgent/Icon.vue';
import KliveAgentMessage from '~/components/KliveAgent/Message.vue';
import KliveAgentScriptCard from '~/components/KliveAgent/ScriptCard.vue';
import KliveAgentConversationRail from '~/components/KliveAgent/ConversationRail.vue';
import KliveAgentVitalsCard from '~/components/KliveAgent/VitalsCard.vue';
import KliveAgentInboxCard from '~/components/KliveAgent/InboxCard.vue';
import KliveAgentScheduleCard from '~/components/KliveAgent/ScheduleCard.vue';
import KliveAgentWorkCard from '~/components/KliveAgent/WorkCard.vue';
import KliveAgentInsightsView from '~/components/KliveAgent/InsightsView.vue';
import KliveAgentLibraryView from '~/components/KliveAgent/LibraryView.vue';
import KliveAgentCommandPalette from '~/components/KliveAgent/CommandPalette.vue';
import KliveAgentDialog from '~/components/KliveAgent/Dialog.vue';
import LiveScreen from '~/components/KliveAgent/LiveScreen.vue';
import TalkBar from '~/components/KliveAgent/TalkBar.vue';
import 'highlight.js/styles/github-dark.css';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'KliveAgent' });

const route = useRoute();
const router = useRouter();

type View = 'chat' | 'insights' | 'library';
const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'insights', label: 'Insights', icon: 'insights' },
  { id: 'library', label: 'Library', icon: 'library' },
];
const initialView = (['insights', 'library'] as const).find(v => v === route.query.view);
const view = ref<View>(initialView ?? 'chat');
const libraryVisited = ref(view.value === 'library');

// ── preferences kept in this browser ──
const PREFS_KEY = 'kax:prefs';
const prefs = reactive<{ sideOpen: boolean; filter: ConversationFilter }>({ sideOpen: true, filter: 'mine' });
function setPref<K extends keyof typeof prefs>(key: K, value: (typeof prefs)[K]) {
  prefs[key] = value;
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
}

// ── layout ──
const width = ref(1600);
// Same edges as the stylesheet's max-width queries (≤ 1280 px hides the side column, ≤ 980 px the rail).
const narrowSide = computed(() => width.value <= 1280);
const narrowRail = computed(() => width.value <= 980);
const railDrawer = ref(false);
const sideDrawer = ref(false);
const railShown = computed(() => !narrowRail.value);
const sideShown = computed(() => !narrowSide.value && prefs.sideOpen);
const sidePressed = computed(() => (narrowSide.value ? sideDrawer.value : prefs.sideOpen));
function toggleSide() {
  if (narrowSide.value) sideDrawer.value = !sideDrawer.value;
  else setPref('sideOpen', !prefs.sideOpen);
}
const onResize = () => { width.value = window.innerWidth; };

// ── state ──
const threadEl = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLTextAreaElement | null>(null);
const rail = ref<{ focus: () => void } | null>(null);
const library = ref<{ removed: (id: string) => void; focus: () => void; setQuery: (q: string) => void } | null>(null);
const agent = useAgentConsole();
const chat = useAgentChat({
  agentReady: agent.ready,
  threadEl,
  inputEl,
  hooks: {
    onRunFinished: () => { void agent.readConversations(); void agent.readFast(); },
    onConversationChanged: id => {
      // Keep the address shareable: ?conversation=… names what is on screen.
      const query = { ...route.query } as Record<string, any>;
      if (id) query.conversation = id; else delete query.conversation;
      delete query.takeover;
      void router.replace({ query });
    },
  },
});

const working = computed(() => new Set(agent.runningRuns.value.map(run => run.conversationId)));
const isWorking = computed(() => chat.loading.value || agent.runningRuns.value.length > 0);
const verdict = computed(() => agent.verdictFor(chat.liveApproval.value ? 1 : 0));

const linkTone = computed(() => ({ live: 'ok', paused: 'neutral', stale: 'warn', offline: 'crit', connecting: 'neutral' } as Record<string, string>)[agent.linkState.value]);
const linkWord = computed(() => ({ live: 'Live', paused: 'Paused', stale: 'Stale', offline: 'Offline', connecting: 'Connecting' } as Record<string, string>)[agent.linkState.value]);
const linkTitle = computed(() => ({
  live: 'Live: run state every 15 s, conversations every minute. Paused while the tab is hidden.',
  paused: 'Paused while this tab is hidden; a run you are watching keeps streaming.',
  stale: 'The last read is over 45 s old. Still trying.',
  offline: 'No answer from the server. Still trying.',
  connecting: 'Connecting to the server',
} as Record<string, string>)[agent.linkState.value]);

// ── the conversation on screen ──
const currentSummary = computed(() => agent.conversations.value.find(c => c.conversationId === chat.conversationId.value) ?? null);
const chatOrigin = computed(() => conversationOrigin({ conversationId: chat.conversationId.value ?? '', sourceChannel: currentSummary.value?.sourceChannel }));
const chatTitle = computed(() => {
  if (!chat.conversationId.value) return 'New chat';
  const firstUser = chat.messages.value.find(m => m.role === 'User' && m.senderName !== 'System');
  if (currentSummary.value && conversationOrigin(currentSummary.value) === 'automated') return conversationTitle(currentSummary.value);
  if (firstUser?.content) return plainText(firstUser.content, 90);
  return currentSummary.value ? conversationTitle(currentSummary.value) : 'Conversation';
});
const chatTokens = computed(() => {
  const total = chat.messages.value.reduce((t, m) => t + (Number(m.promptTokens) || 0) + (Number(m.completionTokens) || 0), 0);
  return total ? fmtCompact(total) : '';
});
const attachDisabled = computed(() => !agent.ready.value || !agent.allowed.value.chat || chat.loading.value || chat.sending.value);
const placeholder = computed(() => {
  if (!agent.allowed.value.chat) return 'Read-only';
  if (!agent.ready.value) return agent.status.value?.state === 'failed' ? 'KliveAgent failed to start' : `KliveAgent is starting… ${Math.round(agent.status.value?.progress ?? 0)}%`;
  return chat.loading.value ? 'Steer the run: new guidance joins it straight away' : 'Ask KliveAgent anything';
});
const hint = computed(() => (chat.loading.value ? 'Enter steers the run · Stop is on the reply' : 'Enter to send · Shift+Enter new line · Ctrl+. talk'));
const sendTitle = computed(() => {
  if (!agent.ready.value) return 'KliveAgent is not ready yet';
  if (chat.sending.value) return 'Delivering your message…';
  if (chat.loading.value) return 'Send guidance to the active run';
  return 'Start a run';
});

const liveContainer = computed(() => chat.liveContainerId.value
  || (!chat.pendingRequestId.value && agent.computer.value?.target === 'container' ? agent.computer.value?.containerId ?? null : null));
// Idle desktops are stopped to free memory; streaming one would only spin. Shown as asleep until a run wakes it.
const computerAsleep = computed(() => !chat.pendingRequestId.value && !!agent.computer.value?.suspended
  && agent.computer.value?.containerId === liveContainer.value);
const computerState = computed(() => describeComputer(agent.computerEnabled.value, agent.computer.value));

// ── starters: one click fills the box; Enter sends ──
const starters = computed(() => {
  const list = [
    { id: 'broken', icon: 'alert', title: 'What is broken right now?', sub: 'Every service: failing, slow or silently idle', prompt: 'Check every Omnipotent service and tell me what is failing, slow, or silently not doing its job right now. Lead with anything that needs me.' },
    { id: 'day', icon: 'clock', title: 'The last 24 hours', sub: 'Errors, restarts and what needs me', prompt: 'Summarise the last 24 hours across the platform: errors, restarts, unusual activity, and anything waiting on me.' },
    { id: 'trader', icon: 'insights', title: 'How is OmniTrader doing?', sub: 'Positions, P&L and anything unusual', prompt: 'How is OmniTrader doing today? Positions, P&L, reconciliation breaks and anything unusual.' },
  ];
  const last = agent.conversations.value
    .filter(c => conversationOrigin(c) === 'mine' && c.messageCount)
    .sort((a, b) => String(b.lastUpdated ?? '').localeCompare(String(a.lastUpdated ?? '')))[0];
  return last
    ? [...list, { id: 'continue', icon: 'chat', title: 'Continue the last chat', sub: conversationTitle(last), prompt: '', conversationId: last.conversationId }]
    : [...list, { id: 'remember', icon: 'memory', title: 'What do you remember?', sub: 'Its memories about the platform', prompt: 'What are the most important things you remember about how the platform is set up and what I care about?' }];
});
function useStarter(s: { prompt: string; conversationId?: string }) {
  if (s.conversationId) { void openConversation(s.conversationId); return; }
  chat.inputMessage.value = s.prompt;
  nextTick(() => { chat.autoGrowInput(); inputEl.value?.focus(); });
}

// ── navigation ──
function setView(next: View) {
  view.value = next;
  if (next === 'library') libraryVisited.value = true;
  if (next === 'insights') void agent.loadStats(false);
  const query = { ...route.query } as Record<string, any>;
  if (next === 'chat') delete query.view; else query.view = next;
  void router.replace({ query });
  if (next === 'chat') nextTick(() => chat.scrollToBottom(true));
}

async function openConversation(id: string) {
  setView('chat');
  if (id === chat.conversationId.value && chat.messages.value.length) return;
  try { await chat.loadConversation(id); } catch { /* the thread shows why */ }
}

function startNewChat() {
  setView('chat');
  chat.newChat();
}

async function openNote(note: AgentNote) {
  void agent.markRead(note);
  if (note.kind === 'job-attention' && note.projectId) { await navigateTo(`/projects/${note.projectId}`); return; }
  // A message from the server's own watch (scripts failing more, provider slow): the figures are in Insights.
  if (note.kind?.startsWith('health-')) { setView('insights'); return; }
  if (note.conversationId) await openConversation(note.conversationId);
}

async function copyLink() {
  if (!chat.conversationId.value) return;
  const url = `${window.location.origin}/kliveagent?conversation=${encodeURIComponent(chat.conversationId.value)}`;
  try { await navigator.clipboard.writeText(url); agent.notify('ok', 'Link copied'); } catch { agent.notify('warn', url, undefined, 10_000); }
}

// ── confirmations ──
const cancelFor = ref<ScheduledTask | null>(null);
const deleteFor = ref<any | null>(null);
const jobOpen = ref(false);
const jobBusy = ref(false);
const jobDraft = reactive({ name: '', goal: '', tokenBudgetUsd: 10, clientJobId: '' });

async function confirmCancel() {
  const task = cancelFor.value;
  cancelFor.value = null;
  if (task) await agent.cancelScheduled(task.id);
}
async function confirmDelete() {
  const item = deleteFor.value;
  deleteFor.value = null;
  if (!item) return;
  try {
    const res = await RequestPOSTFromKliveAPI('/kliveagent/memories/delete', JSON.stringify({ id: item.id }), true, true);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    library.value?.removed(item.id);
    agent.notify('ok', item.memoryType === 'Shortcut' ? 'Shortcut deleted' : 'Forgotten');
  } catch (error: any) {
    agent.notify('crit', `Could not delete it: ${error?.message ?? error}`);
  }
}
async function startJob() {
  if (!jobDraft.goal.trim() || jobBusy.value) return;
  jobBusy.value = true;
  jobDraft.clientJobId ||= newClientId('job');
  try {
    const created = await agent.createJob({ ...jobDraft, conversationId: chat.conversationId.value });
    if (created) { jobOpen.value = false; Object.assign(jobDraft, { name: '', goal: '', tokenBudgetUsd: 10, clientJobId: '' }); }
  } finally { jobBusy.value = false; }
}

// ── command palette ──
const paletteOpen = ref(false);
function commandsFor(query: string): AgentCommand[] {
  const list: AgentCommand[] = [
    { id: 'new-chat', group: 'Actions', title: 'New chat', icon: 'plus', hint: 'N', run: startNewChat },
    { id: 'talk', group: 'Actions', title: chat.talk.active ? 'Back to typing' : 'Talk to KliveAgent', icon: 'mic', hint: 'Ctrl+.', keywords: 'voice speak', run: () => chat.toggleTalkMode() },
    { id: 'computer', group: 'Actions', title: chat.liveOpen.value ? 'Hide the computer' : "Show KliveAgent's computer", icon: 'screen', keywords: 'live view desktop screen', run: () => { setView('chat'); chat.toggleLive(); } },
    { id: 'go-chat', group: 'Go to', title: 'Chat', icon: 'chat', run: () => setView('chat') },
    { id: 'go-insights', group: 'Go to', title: 'Insights', icon: 'insights', keywords: 'analytics usage tokens cost cache performance', run: () => setView('insights') },
    { id: 'go-library', group: 'Go to', title: 'Library: memories', icon: 'library', keywords: 'memories shortcuts capabilities tools', run: () => setView('library') },
    { id: 'refresh', group: 'Actions', title: 'Refresh everything', icon: 'refresh', run: () => agent.refreshAll() },
  ];
  if (chat.messages.value.length) list.push({ id: 'export', group: 'Actions', title: 'Download this conversation as CSV', icon: 'download', keywords: 'export', run: () => chat.downloadCsv() });
  if (chat.conversationId.value) list.push({ id: 'copy-link', group: 'Actions', title: 'Copy a link to this conversation', icon: 'external', run: copyLink });
  if (chat.loading.value) list.push({ id: 'stop', group: 'Actions', title: 'Stop the running reply', icon: 'stop', danger: true, run: () => chat.stopRun() });
  if (agent.unreadCount.value) list.push({ id: 'read-all', group: 'Actions', title: `Mark ${agent.unreadCount.value} result${agent.unreadCount.value === 1 ? '' : 's'} read`, icon: 'check', run: () => agent.markAllRead() });
  if (agent.allowed.value.jobs) list.push({ id: 'new-job', group: 'Actions', title: 'Start a background job', icon: 'layers', keywords: 'parallel long-term', run: () => { jobOpen.value = true; } });
  if (agent.allowed.value.reindex) list.push({ id: 'reindex', group: 'Actions', title: 'Re-index the codebase', icon: 'refresh', keywords: 'reindex code index', run: () => agent.reindex() });
  if (query) list.push({ id: 'recall', group: 'Library', title: `Search memories for “${query}”`, icon: 'memory', run: () => { setView('library'); nextTick(() => library.value?.setQuery(query)); } });
  (agent.schedule.value?.active ?? []).forEach(task => {
    if (agent.allowed.value.jobs) list.push({ id: `cancel-${task.id}`, group: 'Scheduled', title: `Cancel: ${plainText(task.instruction, 80)}`, icon: 'calendar', danger: true, run: () => agent.cancelScheduled(task.id) });
  });
  const conversations = [...agent.conversations.value]
    .filter(c => c.messageCount)
    .sort((a, b) => String(b.lastUpdated ?? '').localeCompare(String(a.lastUpdated ?? '')));
  (query ? conversations : conversations.filter(c => conversationOrigin(c) === 'mine').slice(0, 6)).forEach(c => {
    list.push({ id: `conv-${c.conversationId}`, group: 'Conversations', title: conversationTitle(c), icon: conversationOrigin(c) === 'automated' ? 'robot' : 'chat',
      keywords: `${plainText(c.lastMessage, 300)} ${c.conversationId}`, run: () => openConversation(c.conversationId) });
  });
  return list;
}

// ── keyboard ──
function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable || !!el.closest?.('.crd'));
}
function onKey(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); paletteOpen.value = !paletteOpen.value; return; }
  if (paletteOpen.value || cancelFor.value || deleteFor.value || jobOpen.value) return;
  if (event.key === 'Escape') { railDrawer.value = false; sideDrawer.value = false; return; }
  if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'n' || event.key === 'N') { event.preventDefault(); startNewChat(); }
  else if (event.key === '/') {
    event.preventDefault();
    if (view.value === 'library') library.value?.focus();
    else if (narrowRail.value) railDrawer.value = true;
    else rail.value?.focus();
  }
}

onMounted(() => {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (stored && typeof stored === 'object') {
      if (typeof stored.sideOpen === 'boolean') prefs.sideOpen = stored.sideOpen;
      if (['mine', 'auto', 'all'].includes(stored.filter)) prefs.filter = stored.filter;
    }
  } catch { /* defaults */ }
  onResize();
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKey);
  chat.start();
  agent.start(runs => runs.forEach(run => chat.adoptRunningRun(run)));
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  window.removeEventListener('keydown', onKey);
  agent.stop();
  // Only this page's poll stops; nothing on the server is cancelled.
  chat.stop();
});
</script>

<style lang="scss" src="~/assets/scss/kliveagent-console.scss"></style>
