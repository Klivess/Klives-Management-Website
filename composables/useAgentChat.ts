import { computed, nextTick, reactive, ref, watch, type Ref } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, RequestPUTFromKliveAPI } from '~/scripts/APIInterface';
import { conversationCsv } from '~/scripts/agentConsole';
import { useTalkMode } from '~/composables/useTalkMode';

/**
 * The conversation on screen and the run attached to it. The server owns run state: the browser only
 * remembers which conversation it was looking at, and rediscovers live work from /kliveagent/chat/runs.
 *
 * Moved here unchanged in behaviour from the old single-file page, with one exception: the page no longer
 * marks a run's result read the moment it sees the run finish. The server creates that notification after
 * it has persisted the run and already stamps it read when someone was watching, so the page's call came
 * first and 404'd (15 of 21 calls in 30 days).
 */

export interface ChatHooks {
  /** A run this page followed has finished. */
  onRunFinished?: (requestId: string) => void;
  /** A conversation was opened (or a new chat started: null). */
  onConversationChanged?: (id: string | null) => void;
}

const LAST_CONVERSATION_KEY = 'kliveagent.lastConversation';
const LEGACY_ACTIVE_RUN_KEY = 'kliveagent.activeRun';
const MAX_FILES = 8;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

export function newClientId(prefix: string): string {
  const random = (globalThis.crypto as Crypto | undefined)?.randomUUID?.().replaceAll('-', '')
    || Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${random}`;
}

export async function readAgentApiResponse(res: Response): Promise<{ data: any; rawText: string }> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try { return { data: await res.json(), rawText: '' }; } catch { return { data: null, rawText: '' }; }
  }
  const rawText = await res.text();
  if (!rawText) return { data: null, rawText: '' };
  try { return { data: JSON.parse(rawText), rawText }; } catch { return { data: null, rawText }; }
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function useAgentChat(options: { agentReady: Ref<boolean>; threadEl: Ref<HTMLElement | null>; inputEl: Ref<HTMLTextAreaElement | null>; hooks?: ChatHooks }) {
  const { agentReady, threadEl, inputEl } = options;
  const hooks = options.hooks ?? {};
  const route = useRoute();

  const messages = ref<any[]>([]);
  const inputMessage = ref('');
  const pendingFiles = ref<File[]>([]);
  const attachmentError = ref('');
  const draggingFiles = ref(false);
  let dragDepth = 0;

  const loading = ref(false);
  const sending = ref(false);
  const pendingRequestId = ref<string | null>(null);
  const conversationId = ref<string | null>(null);
  const pollConnectionLost = ref(false);
  const conversationError = ref('');
  const loadingConversation = ref(false);
  let active = false;
  let pollGeneration = 0;
  let pendingPollAbort: AbortController | null = null;
  let conversationLoadGeneration = 0;

  // ── live view of the agent's computer ──
  const liveOpen = ref(false);
  const liveDismissed = ref(false);
  const liveFrame = ref<string | null>(null);
  const liveApproval = ref<any | null>(null);
  const livePhase = ref('');
  const liveStatusNote = ref('');
  const liveIteration = ref(0);
  const liveContainerId = ref<string | null>(null);

  function rememberConversation(id: string | null) {
    try {
      if (id) localStorage.setItem(LAST_CONVERSATION_KEY, id);
      else localStorage.removeItem(LAST_CONVERSATION_KEY);
    } catch { /* storage unavailable */ }
  }

  // ── attachments ──
  function addAttachments(files: File[]) {
    attachmentError.value = '';
    if (!agentReady.value || loading.value || sending.value) {
      attachmentError.value = 'Wait for the active run to finish before attaching files.';
      return;
    }
    files.forEach(file => {
      if (pendingFiles.value.length >= MAX_FILES) { attachmentError.value = `Attach at most ${MAX_FILES} files per message.`; return; }
      if (!file.size || file.size > MAX_FILE_BYTES) { attachmentError.value = `${file.name} is empty or exceeds the 100 MB limit.`; return; }
      pendingFiles.value.push(file);
    });
  }
  function chooseAttachments(event: Event) {
    const input = event.target as HTMLInputElement;
    addAttachments(Array.from(input.files || []));
    input.value = '';
  }
  const isFileDrag = (event: DragEvent) => Array.from(event.dataTransfer?.types || []).includes('Files');
  function onDragEnter(event: DragEvent) { if (!isFileDrag(event)) return; dragDepth += 1; draggingFiles.value = true; }
  function onDragOver(event: DragEvent) { if (isFileDrag(event) && event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; }
  function onDragLeave() { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) draggingFiles.value = false; }
  function onDrop(event: DragEvent) {
    dragDepth = 0;
    draggingFiles.value = false;
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length) addAttachments(files);
  }
  function removeAttachment(index: number) { pendingFiles.value.splice(index, 1); }

  // ── scrolling ──
  function isNearBottom() {
    const el = threadEl.value;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }
  function scrollToBottom(force = false) {
    if (!force && !isNearBottom()) return;
    nextTick(() => { if (threadEl.value) threadEl.value.scrollTop = threadEl.value.scrollHeight; });
  }
  function autoGrowInput() {
    const el = inputEl.value;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }
  function resetInputHeight() { nextTick(() => { if (inputEl.value) inputEl.value.style.height = 'auto'; }); }

  // ── runs ──
  function detachLocalRun() {
    // Invalidating the generation stops only this page's poll loop. The run on the server continues.
    pollGeneration += 1;
    pendingPollAbort?.abort();
    pendingPollAbort = null;
    pendingRequestId.value = null;
    loading.value = false;
    pollConnectionLost.value = false;
    liveApproval.value = null;
  }

  const findRunMessage = (requestId: string) => messages.value.find(m => m.role === 'KliveAgent' && m.requestId === requestId);

  function ensureRunMessage(run: any) {
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
      message = messages.value[messages.value.length - 1];
    }
    return message;
  }

  function applyPendingFields(msg: any, data: any) {
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
    if (data.status) msg.status = data.status;
    if (data.stopReason !== undefined) msg.stopReason = data.stopReason;
    if (Array.isArray(data.activity)) msg.activity = data.activity;
    // The run's own plan and notes. Absent until the run writes one, so never cleared by a snapshot without it.
    if (data.ledger) msg.ledger = data.ledger;
    if (data.computerContainerId) liveContainerId.value = data.computerContainerId;
    if (data.pendingApproval?.containerId) liveContainerId.value = data.pendingApproval.containerId;
    // A new frame slides the live view out (unless dismissed this run); a pending approval always does.
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

  async function submitApproval({ approvalId, approved }: { approvalId: string; approved: boolean }) {
    if (!approvalId) return;
    try { await RequestPOSTFromKliveAPI('/kliveagent/chat/approve', JSON.stringify({ approvalId, approved }), true, true); } catch { /* the poll shows the outcome */ }
  }
  async function resolveTakeover({ approvalId, outcome }: { approvalId: string; outcome: string }) {
    if (!approvalId) return;
    try { await RequestPOSTFromKliveAPI('/kliveagent/chat/handoff/resolve', JSON.stringify({ approvalId, outcome }), true, true); } catch { /* ditto */ }
  }

  async function stopRun(requestId: string | null = pendingRequestId.value) {
    const id = requestId || pendingRequestId.value;
    if (!id) return;
    const message = findRunMessage(id);
    if (message) message.statusNote = 'Stopping safely…';
    try { await RequestPOSTFromKliveAPI('/kliveagent/chat/cancel', JSON.stringify({ requestId: id }), true, true); } catch { /* the poll shows the outcome */ }
  }

  async function fetchRuns(targetConversationId: string | null = null, includeCompleted = false) {
    const params = new URLSearchParams();
    if (targetConversationId) params.set('conversationId', targetConversationId);
    params.set('includeCompleted', String(includeCompleted));
    const response = await RequestGETFromKliveAPI(`/kliveagent/chat/runs?${params.toString()}`);
    const { data, rawText } = await readAgentApiResponse(response);
    if (!response.ok) throw new Error(data?.error || rawText || `Run reconciliation failed with HTTP ${response.status}`);
    return Array.isArray(data) ? data : [];
  }

  function attachRun(run: any) {
    if (!run?.requestId || run.status !== 'Running') return;
    // A run the server started itself (the continuation after a restart) has no request bubble yet.
    if (run.senderName === 'System' && run.userMessage
      && !messages.value.some(m => m.role === 'User' && m.requestId === run.requestId)) {
      messages.value.push({
        messageId: `sys_${run.requestId}`, requestId: run.requestId, role: 'User', senderName: 'System',
        content: run.userMessage, attachments: [], scripts: [], timestamp: run.createdAt || new Date().toISOString(),
      });
    }
    const message = ensureRunMessage(run);
    applyPendingFields(message, run);
    if (message) message.pending = true;
    pendingRequestId.value = run.requestId;
    loading.value = true;
    pollConnectionLost.value = false;
    pendingPollAbort?.abort();
    const generation = ++pollGeneration;
    void pollPendingResponse(run.requestId, generation);
  }

  /** Attaches to a run the server reports for the conversation on screen (called by the console's poll). */
  function adoptRunningRun(run: any) {
    if (!run || run.status !== 'Running' || !active) return;
    if (run.conversationId !== conversationId.value || pendingRequestId.value === run.requestId) return;
    attachRun(run);
  }

  async function reconcileActiveRun(targetConversationId: string | null = conversationId.value) {
    const loadGeneration = conversationLoadGeneration;
    const selected = conversationId.value;
    const runs = await fetchRuns(targetConversationId, false);
    if (!active || loadGeneration !== conversationLoadGeneration || selected !== conversationId.value) return null;
    const running = runs
      .filter(run => run?.status === 'Running')
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
    const run = running[0];
    if (!run) return null;
    if (!targetConversationId || conversationId.value !== run.conversationId) await loadConversation(run.conversationId);
    else if (pendingRequestId.value !== run.requestId) attachRun(run);
    return run;
  }

  async function restoreDurableSession() {
    let preferred: string | null = null;
    const linked = typeof route.query.conversation === 'string' ? route.query.conversation : null;
    if (route.query.takeover === '1') { liveOpen.value = true; liveDismissed.value = false; }
    try {
      preferred = linked || localStorage.getItem(LAST_CONVERSATION_KEY);
      if (!preferred) {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_ACTIVE_RUN_KEY) || 'null');
        preferred = legacy?.conversationId || null;
      }
      localStorage.removeItem(LEGACY_ACTIVE_RUN_KEY);
    } catch { /* storage unavailable */ }

    if (preferred) {
      const expected = conversationLoadGeneration + 1;
      try { await loadConversation(preferred); } catch { /* shown on the page */ }
      if (conversationLoadGeneration !== expected) return;
    }
    if (!pendingRequestId.value) {
      try { await reconcileActiveRun(conversationId.value || null); } catch { /* the console's poll retries */ }
    }
  }

  function newChat() {
    conversationLoadGeneration += 1;
    detachLocalRun();
    messages.value = [];
    conversationId.value = null;
    conversationError.value = '';
    inputMessage.value = '';
    liveApproval.value = null;
    liveStatusNote.value = '';
    livePhase.value = '';
    liveIteration.value = 0;
    liveOpen.value = false;
    liveDismissed.value = false;
    rememberConversation(null);
    resetInputHeight();
    hooks.onConversationChanged?.(null);
    nextTick(() => inputEl.value?.focus());
  }

  async function postAgentJsonWithRetry(path: string, payload: unknown) {
    let last: { response: Response; data: any; rawText: string } | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await RequestPOSTFromKliveAPI(path, JSON.stringify(payload), true, true);
      const parsed = await readAgentApiResponse(response);
      last = { response, ...parsed };
      if (response.status !== 504 || attempt === 1) return last;
      await wait(700);
    }
    return last!;
  }

  const isSendDisabled = computed(() => sending.value || !agentReady.value
    || (!inputMessage.value.trim() && !pendingFiles.value.length)
    || (loading.value && pendingFiles.value.length > 0));

  async function sendMessage() {
    const msg = inputMessage.value.trim();
    const selectedFiles = [...pendingFiles.value];
    if ((!msg && !selectedFiles.length) || sending.value || !agentReady.value || (loading.value && selectedFiles.length)) return;

    conversationLoadGeneration += 1;
    const targetConversationId = conversationId.value || newClientId('conv');
    const clientMessageId = newClientId('msg');
    const activeRequestId = pendingRequestId.value;
    conversationId.value = targetConversationId;
    rememberConversation(targetConversationId);

    messages.value.push({
      messageId: `client_${clientMessageId}`,
      clientMessageId,
      requestId: activeRequestId || null,
      role: 'User',
      content: msg || 'Please inspect the attached files.',
      attachments: selectedFiles.map(file => ({ name: file.name, mimeType: file.type, size: file.size })),
      timestamp: new Date().toISOString(),
      deliveryStatus: 'sending',
    });
    const optimistic = messages.value[messages.value.length - 1];
    sending.value = true;
    liveDismissed.value = false;
    scrollToBottom(true);
    const isStillSelected = () => conversationId.value === targetConversationId;

    try {
      const uploaded: any[] = [];
      for (const file of selectedFiles) {
        const query = new URLSearchParams({ conversationId: targetConversationId, name: file.name, contentType: file.type || 'application/octet-stream' });
        const uploadResponse = await RequestPUTFromKliveAPI(`/kliveagent/attachments/upload?${query}`, file, false);
        const { data: attachment, rawText: uploadError } = await readAgentApiResponse(uploadResponse);
        if (!uploadResponse.ok || !attachment?.id) throw new Error(attachment?.error || uploadError || `Could not upload ${file.name}`);
        uploaded.push(attachment);
      }
      optimistic.attachments = uploaded;
      let path = activeRequestId ? '/kliveagent/chat/steer' : '/kliveagent/chat';
      let payload: any = activeRequestId
        ? { requestId: activeRequestId, message: msg, senderName: 'Website', clientMessageId }
        : { message: msg, conversationId: targetConversationId, senderName: 'Website', clientMessageId, attachmentIds: uploaded.map(file => file.id) };
      let { response: res, data, rawText } = await postAgentJsonWithRetry(path, payload);

      // The run may seal between typing and POST: the guidance becomes a fresh turn with the same key.
      if (activeRequestId && res.status === 409) {
        path = '/kliveagent/chat';
        payload = { message: msg, conversationId: targetConversationId, senderName: 'Website', clientMessageId, attachmentIds: uploaded.map(file => file.id) };
        ({ response: res, data, rawText } = await postAgentJsonWithRetry(path, payload));
      }
      if (!res.ok) throw new Error(data?.response || data?.reason || data?.error || data?.errorMessage || rawText || `KliveAgent API request failed with HTTP ${res.status}`);
      if (!data) throw new Error(rawText || 'KliveAgent API returned an empty response.');

      optimistic.deliveryStatus = 'accepted';
      inputMessage.value = '';
      resetInputHeight();
      pendingFiles.value = [];
      attachmentError.value = '';
      optimistic.messageId = data.acceptedMessageId || data.messageId || optimistic.messageId;
      optimistic.requestId = data.pendingRequestId || data.requestId || activeRequestId || null;
      const acceptedConversationId = data.conversationId || targetConversationId;
      if (isStillSelected()) {
        conversationId.value = acceptedConversationId;
        rememberConversation(acceptedConversationId);
        hooks.onConversationChanged?.(acceptedConversationId);
      }

      const runRequestId = data.pendingRequestId || data.requestId || activeRequestId;
      const isSteeringReceipt = data.accepted === true && !!data.requestId;
      if (runRequestId && (data.isPending || data.wasSteering || isSteeringReceipt)) {
        if (isStillSelected() && pendingRequestId.value !== runRequestId) {
          attachRun({ ...data, requestId: runRequestId, conversationId: conversationId.value, clientMessageId, userMessage: msg,
            response: data.response || '', status: 'Running', createdAt: new Date().toISOString() });
        }
      } else if (isStillSelected() && data.success !== false && data.response) {
        messages.value.push({ messageId: newClientId('agent'), role: 'KliveAgent', content: data.response, scripts: data.scriptsExecuted || [], timestamp: new Date().toISOString() });
      } else if (data.success === false || data.accepted === false) {
        throw new Error(data.response || data.reason || data.errorMessage || 'KliveAgent rejected the message.');
      }
    } catch (err: any) {
      // A timeout is ambiguous: the server may already have the message. Reconcile by client id first.
      let recovered = false;
      try {
        const runs = await fetchRuns(targetConversationId, true);
        const run = runs.find(candidate => candidate.clientMessageId === clientMessageId
          || candidate.steeringMessages?.some((steer: any) => steer.clientMessageId === clientMessageId));
        if (run) {
          recovered = true;
          optimistic.deliveryStatus = 'accepted';
          optimistic.requestId = run.requestId;
          if (isStillSelected() && run.status === 'Running') attachRun(run);
          else if (isStillSelected()) await loadConversation(targetConversationId);
        }
      } catch { /* fall through to the failure bubble */ }
      if (!recovered && isStillSelected()) {
        optimistic.deliveryStatus = 'failed';
        messages.value.push({
          messageId: newClientId('error'), role: 'KliveAgent', status: 'failed',
          content: 'I could not confirm delivery of that message. Your conversation is safe; please retry it.\n\n' + (err?.message ?? err),
          timestamp: new Date().toISOString(),
        });
      }
    }
    sending.value = false;
    scrollToBottom();
  }

  async function pollPendingResponse(requestId: string, generation: number) {
    let failures = 0;
    const controller = new AbortController();
    pendingPollAbort = controller;
    const attachedConversationId = conversationId.value;
    const isStillAttached = () => active && generation === pollGeneration && pendingRequestId.value === requestId
      && conversationId.value === attachedConversationId;
    while (active && generation === pollGeneration && pendingRequestId.value === requestId) {
      try {
        const afterSequence = Number(findRunMessage(requestId)?.sequence) || 0;
        const res = await RequestGETFromKliveAPI(
          `/kliveagent/chat/pending?requestId=${encodeURIComponent(requestId)}&afterSequence=${afterSequence}&waitMs=15000&_t=${Date.now()}`,
          true, true, {}, controller.signal,
        );
        const { data, rawText } = await readAgentApiResponse(res);
        if (!isStillAttached()) return;
        if (!res.ok) throw new Error(data?.error || rawText || `Pending request failed with HTTP ${res.status}`);
        if (!data) throw new Error('KliveAgent returned an empty run snapshot.');

        failures = 0;
        pollConnectionLost.value = false;
        const message = ensureRunMessage({ ...data, requestId });
        if ((Number(data.sequence) || 0) >= (Number(message.sequence) || 0)) applyPendingFields(message, data);

        if (data.status === 'Running') {
          message.pending = true;
          scrollToBottom();
          // New servers wait for progress; keep bounded polling for servers that do not support waiting.
          if (res.headers.get('X-Klive-Pending-Wait') !== 'supported') await wait(600);
          continue;
        }

        const finalResponse = data.finalResponse;
        message.pending = false;
        message.phase = 'final';
        message.status = data.status;
        message.stopReason = data.stopReason || null;
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
        hooks.onRunFinished?.(requestId);
        break;
      } catch (err) {
        // A transport failure cancels nothing: keep the live bubble and retry with bounded backoff.
        if (!isStillAttached()) return;
        failures += 1;
        pollConnectionLost.value = true;
        const message = findRunMessage(requestId);
        if (message) message.statusNote = `Connection lost; reconnecting (attempt ${failures})…`;
        await wait(Math.min(10_000, 750 * (2 ** Math.min(failures, 4))));
      }
    }
    scrollToBottom();
  }

  async function loadConversation(convId: string) {
    const loadGeneration = ++conversationLoadGeneration;
    detachLocalRun();
    loadingConversation.value = true;
    conversationError.value = '';
    try {
      const res = await RequestGETFromKliveAPI(`/kliveagent/conversations/get?id=${encodeURIComponent(convId)}`);
      const { data, rawText } = await readAgentApiResponse(res);
      if (loadGeneration !== conversationLoadGeneration || !active) return;
      if (!res.ok || !data) {
        conversationError.value = res.status === 404 ? 'That conversation is not on the server.' : (data?.error || rawText || `Could not open the conversation (HTTP ${res.status}).`);
        throw new Error(conversationError.value);
      }

      conversationId.value = data.conversationId || convId;
      rememberConversation(conversationId.value);
      const recentRuns = Array.isArray(data.recentRuns) ? data.recentRuns : [];
      const finishedRuns = new Map(recentRuns.filter((run: any) => run?.requestId && run.status !== 'Running').map((run: any) => [run.requestId, run]));
      messages.value = (Array.isArray(data.messages) ? data.messages : []).map((m: any) => {
        const role = m.role === 'User' ? 'User' : 'KliveAgent';
        const message: any = {
          messageId: m.messageId, requestId: m.requestId, role, senderName: m.senderName, content: m.content,
          attachments: m.attachments || [], scripts: m.scriptResults || (m.scriptResult ? [m.scriptResult] : []),
          timestamp: m.timestamp, deliveryStatus: m.deliveryStatus,
        };
        // The run record keeps the activity, token counts and how the turn actually ended.
        const run: any = role === 'KliveAgent' ? finishedRuns.get(m.requestId) : null;
        if (run) {
          message.activity = Array.isArray(run.activity) ? run.activity : [];
          message.status = run.status;
          message.stopReason = run.stopReason || null;
          message.promptTokens = run.promptTokens;
          message.completionTokens = run.completionTokens;
          message.iteration = run.iteration;
          message.ledger = run.ledger || null;
          message.phase = 'final';
        }
        return message;
      });
      hooks.onConversationChanged?.(conversationId.value);
      const running = recentRuns
        .filter((run: any) => run?.status === 'Running')
        .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())[0];
      if (running) attachRun(running);
      scrollToBottom(true);
    } finally {
      if (loadGeneration === conversationLoadGeneration) loadingConversation.value = false;
    }
  }

  function downloadCsv() {
    if (!messages.value.length) return;
    const blob = new Blob([conversationCsv(messages.value)], { type: 'text/csv;charset=utf-8;' });
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

  // ── talk mode ──
  const talk = reactive(useTalkMode({ onTurn: onSpokenTurn }));
  const talkResumable = computed(() => !talk.active && talk.prefs.mode === 'talk');
  const lastAgentIndex = computed(() => {
    for (let i = messages.value.length - 1; i >= 0; i--) if (messages.value[i].role !== 'User') return i;
    return -1;
  });

  async function enterTalkMode() {
    if (!agentReady.value || talk.active) return;
    const id = conversationId.value || newClientId('conv');
    conversationId.value = id;
    rememberConversation(id);
    talk.updatePrefs({ mode: 'talk' });
    await talk.start(id);
  }
  async function exitTalkMode() {
    talk.updatePrefs({ mode: 'type' });
    await talk.stop();
    nextTick(() => inputEl.value?.focus());
  }
  function toggleTalkMode() { if (talk.active) void exitTalkMode(); else void enterTalkMode(); }

  function onSpokenTurn(event: any) {
    if (!event?.accepted) return;
    conversationLoadGeneration += 1;
    const requestId = event.requestId || pendingRequestId.value || null;
    const resent = event.resubmitOf && messages.value.find(m => m.clientMessageId === event.resubmitOf);
    if (resent) {
      resent.clientMessageId = event.clientMessageId;
      resent.messageId = event.clientMessageId;
      resent.requestId = requestId;
    } else {
      messages.value.push({
        messageId: event.clientMessageId, clientMessageId: event.clientMessageId, requestId, role: 'User', content: event.text,
        spoken: true, attachments: [], timestamp: new Date().toISOString(), deliveryStatus: 'accepted',
      });
    }
    liveDismissed.value = false;
    scrollToBottom(true);
    if (requestId && !event.steering && pendingRequestId.value !== requestId) {
      attachRun({ requestId, conversationId: conversationId.value, clientMessageId: event.clientMessageId, userMessage: event.text,
        response: '', status: 'Running', createdAt: new Date().toISOString() });
    }
  }

  // Switching conversations while talking moves the talk socket with it.
  watch(conversationId, id => {
    if (!talk.active) return;
    if (!id) {
      const fresh = newClientId('conv');
      conversationId.value = fresh;
      rememberConversation(fresh);
      return;
    }
    void talk.start(id);
  });

  const isTypingTarget = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable || !!el.closest?.('.crd'));
  };

  function onTalkKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === '.') { event.preventDefault(); toggleTalkMode(); return; }
    if (!talk.active) return;
    if (event.key === 'Escape') { talk.interrupt(); return; }
    if (event.code === 'Space' && !talk.prefs.handsFree && !event.repeat && !isTypingTarget(event.target)) { event.preventDefault(); talk.pttDown(); }
  }
  function onTalkKeyUp(event: KeyboardEvent) {
    if (talk.active && event.code === 'Space' && !talk.prefs.handsFree && !isTypingTarget(event.target)) { event.preventDefault(); talk.pttUp(); }
  }

  function dismissLive() { liveOpen.value = false; liveDismissed.value = true; }
  function toggleLive() { liveOpen.value = !liveOpen.value; liveDismissed.value = !liveOpen.value; }

  /** Scripts from the latest turn that ran any: the side panel follows the run live. */
  const currentTurnScripts = computed(() => {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const m = messages.value[i];
      if (m.role === 'KliveAgent' && m.scripts?.length) return m.scripts as any[];
    }
    return [] as any[];
  });

  function start() {
    active = true;
    window.addEventListener('keydown', onTalkKeyDown);
    window.addEventListener('keyup', onTalkKeyUp);
    void restoreDurableSession();
  }
  function stop() {
    active = false;
    window.removeEventListener('keydown', onTalkKeyDown);
    window.removeEventListener('keyup', onTalkKeyUp);
    void talk.stop();
    detachLocalRun();
  }

  return {
    messages, inputMessage, pendingFiles, attachmentError, draggingFiles, loading, sending, pendingRequestId, conversationId,
    pollConnectionLost, conversationError, loadingConversation, isSendDisabled,
    liveOpen, liveFrame, liveApproval, livePhase, liveStatusNote, liveIteration, liveContainerId,
    talk, talkResumable, lastAgentIndex, currentTurnScripts,
    chooseAttachments, removeAttachment, onDragEnter, onDragOver, onDragLeave, onDrop, autoGrowInput,
    sendMessage, stopRun, submitApproval, resolveTakeover, newChat, loadConversation, adoptRunningRun, downloadCsv,
    enterTalkMode, exitTalkMode, toggleTalkMode, dismissLive, toggleLive, scrollToBottom, start, stop,
  };
}
