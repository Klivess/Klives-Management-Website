<template>
  <section class="kgx-con" :data-wrap="wrap || undefined" aria-label="Console" data-testid="console">
    <div v-if="!allowed" class="kgx-empty kgx-empty--lock"><GamesIcon name="lock" />The console needs “Use server consoles”.</div>
    <template v-else>
      <div class="kgx-con__bar">
        <span class="kgx-con__state" :data-state="state" data-testid="console-state"><i></i>{{ stateWord }}</span>
        <label class="kgx-con__find">
          <GamesIcon name="filter" />
          <input v-model="filterText" type="search" placeholder="Filter lines" aria-label="Filter console lines" data-testid="console-filter" />
        </label>
        <div class="kgx-seg" role="group" aria-label="Show">
          <button v-for="l in LEVELS" :key="l.id" class="kgx-seg__opt" :aria-pressed="level === l.id" @click="level = l.id">{{ l.label }}<span v-if="l.id !== 'all' && levelCount(l.id)" class="kgx-num">{{ levelCount(l.id) }}</span></button>
        </div>
        <span class="kgx-con__spacer"></span>
        <span class="kgx-con__count kgx-num">{{ shown.length === lines.length ? `${kgInt(lines.length)} lines` : `${kgInt(shown.length)} of ${kgInt(lines.length)}` }}</span>
        <button class="kgx-iconbtn" :aria-pressed="wrap" title="Wrap long lines" aria-label="Wrap long lines" @click="wrap = !wrap"><GamesIcon name="sliders" /></button>
        <button class="kgx-iconbtn" title="Copy what is shown" aria-label="Copy what is shown" @click="copyShown"><GamesIcon name="copy" /></button>
        <button class="kgx-iconbtn" title="Download the console as a text file" aria-label="Download console" @click="downloadLog"><GamesIcon name="download" /></button>
        <button class="kgx-iconbtn" title="Clear the view (Ctrl+L)" aria-label="Clear the view" @click="clear"><GamesIcon name="trash" /></button>
      </div>

      <div class="kgx-con__body">
        <div ref="out" class="kgx-con__out" role="log" aria-live="off" tabindex="0" data-testid="console-out" @scroll="onScroll">
          <p v-if="!live && lines.length" class="kgx-con__note">{{ server.status === 'Provisioning' ? 'Installing — the install log follows.' : 'The server is not running. This is its last output.' }}</p>
          <div v-for="(l, i) in shown" :key="i" class="kgx-con__line" :data-kind="kindOf(l)"><span v-if="splitOf(l).stamp" class="kgx-con__stamp">{{ splitOf(l).stamp }}</span>{{ splitOf(l).rest }}</div>
          <p v-if="!lines.length" class="kgx-con__note">{{ emptyText }}</p>
        </div>
        <button v-if="unseen > 0" class="kgx-con__jump" data-testid="console-jump" @click="jump"><GamesIcon name="arrow-down" />{{ unseen }} new line{{ unseen === 1 ? '' : 's' }}</button>
      </div>

      <div v-if="quick.length" class="kgx-con__quick" role="group" aria-label="Quick commands">
        <button v-for="q in quick" :key="q.command" class="kgx-chip" :title="q.hint" :disabled="!canSend" @click="useQuick(q.command)">{{ q.label }}</button>
      </div>

      <form class="kgx-con__in" @submit.prevent="send">
        <span class="kgx-con__prompt" aria-hidden="true">›</span>
        <input ref="box" v-model="command" class="kgx-con__cmd" :disabled="!canSend" spellcheck="false" autocomplete="off"
          :placeholder="canSend ? `Command for ${server.name} (↑ for history)` : (live ? 'Connecting…' : 'Start the server to send commands')"
          aria-label="Console command" data-testid="console-input" @keydown.up.prevent="historyStep(-1)" @keydown.down.prevent="historyStep(1)" @keydown.tab="complete" />
        <button type="submit" class="kgx-btn kgx-btn--go kgx-btn--sm" :disabled="!canSend || !command.trim()" data-testid="console-send">Send</button>
      </form>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { BuildKliveWsUrl } from '~/scripts/APIInterface';
import type { KliveGamesApi } from '~/composables/useKliveGames';
import { fmtInt as kgInt, kgGame, kgLineKind, kgSplitStamp, kgStatus, type KgLineKind, type KgServer } from '~/scripts/kliveGames';

const props = defineProps<{ server: KgServer; api: KliveGamesApi; allowed: boolean }>();
const emit = defineEmits<{ status: [status: string] }>();

const MAX_LINES = 2000;
const LEVELS: { id: 'all' | 'warn' | 'err' | 'cmd'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'warn', label: 'Warnings' },
  { id: 'err', label: 'Errors' },
  { id: 'cmd', label: 'Commands' },
];

const lines = ref<string[]>([]);
const state = ref<'connecting' | 'live' | 'closed' | 'denied'>('connecting');
const command = ref('');
const filterText = ref('');
const level = ref<'all' | 'warn' | 'err' | 'cmd'>('all');
const wrap = ref(true);
const unseen = ref(0);
const out = ref<HTMLElement | null>(null);
const box = ref<HTMLInputElement | null>(null);
let pinned = true;
let socket: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let alive = true;
let attempts = 0;

const live = computed(() => kgStatus(props.server.status).live);
const canSend = computed(() => props.allowed && live.value && state.value === 'live');
const quick = computed(() => kgGame(props.server.gameType).quick);
const stateWord = computed(() => ({ connecting: 'Connecting…', live: live.value ? 'Live' : 'Connected', closed: 'Reconnecting…', denied: 'Not allowed' }[state.value]));
const emptyText = computed(() => (live.value ? 'Waiting for output…' : props.server.lastStartedUtc ? 'No output kept since Omnipotent last restarted.' : 'This server has not run yet.'));

const kinds = new Map<string, KgLineKind>();
function kindOf(l: string): KgLineKind {
  let k = kinds.get(l);
  if (!k) { k = kgLineKind(l); if (kinds.size > 6000) kinds.clear(); kinds.set(l, k); }
  return k;
}
const splitOf = (l: string) => kgSplitStamp(l);

function levelCount(id: 'warn' | 'err' | 'cmd' | 'all') { return lines.value.filter(l => kindOf(l) === id).length; }

const shown = computed(() => {
  const words = filterText.value.toLowerCase();
  return lines.value.filter(l => {
    if (level.value === 'warn' && kindOf(l) !== 'warn' && kindOf(l) !== 'err') return false;
    if (level.value === 'err' && kindOf(l) !== 'err') return false;
    if (level.value === 'cmd' && kindOf(l) !== 'cmd') return false;
    return !words || l.toLowerCase().includes(words);
  });
});

// ── socket ──
function connect() {
  if (!props.allowed || !alive) return;
  state.value = 'connecting';
  const ws = new WebSocket(BuildKliveWsUrl('/klivegames/servers/console', { id: props.server.id }));
  socket = ws;
  ws.onopen = () => { state.value = 'live'; attempts = 0; };
  ws.onmessage = ev => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'replay') { lines.value = (msg.lines ?? []).slice(-MAX_LINES); pinned = true; unseen.value = 0; toBottom(); }
      else if (msg.type === 'line') push(String(msg.data ?? ''));
      else if (msg.type === 'status' && msg.data?.status) emit('status', msg.data.status);
    } catch { /* not JSON */ }
  };
  ws.onclose = ev => {
    if (socket !== ws) return;
    socket = null;
    if (ev.code === 1008) { state.value = 'denied'; return; } // policy violation: no permission or no server
    state.value = 'closed';
    if (alive) retry = setTimeout(connect, Math.min(15_000, 1500 * 2 ** Math.min(attempts++, 3)));
  };
  ws.onerror = () => { try { ws.close(); } catch { /* closed */ } };
}

function disconnect() {
  if (retry) clearTimeout(retry);
  retry = null;
  const ws = socket;
  socket = null;
  try { ws?.close(); } catch { /* closed */ }
}

function push(line: string) {
  const next = lines.value.length >= MAX_LINES ? lines.value.slice(-(MAX_LINES - 200)) : lines.value.slice();
  next.push(line);
  lines.value = next;
  if (pinned) toBottom();
  else unseen.value++;
}

function onScroll() {
  const el = out.value;
  if (!el) return;
  pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  if (pinned) unseen.value = 0;
}
function toBottom() { nextTick(() => { const el = out.value; if (el) el.scrollTop = el.scrollHeight; }); }
function jump() { pinned = true; unseen.value = 0; toBottom(); }
function clear() { lines.value = []; unseen.value = 0; pinned = true; }

// ── sending ──
const historyKey = computed(() => `kgx:history:${props.server.id}`);
const history = ref<string[]>([]);
let historyAt = -1;
function loadHistory() {
  try { history.value = JSON.parse(localStorage.getItem(historyKey.value) ?? '[]'); } catch { history.value = []; }
  historyAt = -1;
}
function remember(c: string) {
  history.value = [c, ...history.value.filter(h => h !== c)].slice(0, 50);
  try { localStorage.setItem(historyKey.value, JSON.stringify(history.value)); } catch { /* private window */ }
}
function historyStep(dir: number) {
  if (!history.value.length) return;
  historyAt = Math.max(-1, Math.min(history.value.length - 1, historyAt - dir));
  command.value = historyAt < 0 ? '' : history.value[historyAt];
}
function complete(e: KeyboardEvent) {
  const typed = command.value.trim().toLowerCase();
  if (!typed) return;
  const match = quick.value.map(q => q.command).find(c => c.toLowerCase().startsWith(typed) && c.toLowerCase() !== typed);
  if (match) { e.preventDefault(); command.value = match; }
}

async function send() {
  const c = command.value.trim();
  if (!c || !canSend.value) return;
  remember(c);
  historyAt = -1;
  command.value = '';
  jump();
  if (socket && socket.readyState === WebSocket.OPEN) { socket.send(c); return; }
  const r = await props.api.sendCommand(props.server.id, c);
  if (!r.ok) props.api.say('crit', 'Command not sent', r.error);
}

function useQuick(c: string) {
  if (c.endsWith(' ')) { command.value = c; nextTick(() => box.value?.focus()); return; }
  command.value = c;
  send();
}

// ── copy / download ──
async function copyShown() {
  try { await navigator.clipboard.writeText(shown.value.join('\n')); props.api.say('ok', `Copied ${shown.value.length} line${shown.value.length === 1 ? '' : 's'}.`); }
  catch { props.api.say('warn', 'The browser would not allow copying.'); }
}
function downloadLog() {
  const url = URL.createObjectURL(new Blob([lines.value.join('\n')], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.server.name.replace(/[^\w.-]+/g, '_')}-console-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.log`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Ctrl+L clears, but only from inside the console: anywhere else it is the browser's address bar. */
function onKey(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'l') return;
  const el = document.activeElement;
  if (!el || !(box.value === el || out.value?.contains(el) || out.value === el)) return;
  e.preventDefault();
  clear();
}

defineExpose({ focus: () => box.value?.focus() });

onMounted(() => { loadHistory(); connect(); window.addEventListener('keydown', onKey); });
onBeforeUnmount(() => { alive = false; disconnect(); window.removeEventListener('keydown', onKey); });
watch(() => props.server.id, () => { disconnect(); lines.value = []; loadHistory(); alive = true; connect(); });
// A server that comes up after the socket gave up: try again straight away.
watch(live, now => { if (now && state.value === 'closed') { disconnect(); connect(); } });
</script>
