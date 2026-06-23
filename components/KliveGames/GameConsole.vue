<template>
  <div class="console">
    <div class="console-head">
      <span class="conn" :class="{ on: connected }">{{ connected ? '● live' : '○ connecting…' }}</span>
      <button class="clr" @click="lines = []">Clear</button>
    </div>
    <div ref="out" class="console-out">
      <div v-for="(l, i) in lines" :key="i" class="line" :class="lineClass(l)">{{ l }}</div>
    </div>
    <div class="console-in">
      <span class="prompt">&gt;</span>
      <input
        v-model="command"
        class="cmd"
        placeholder="Type a command (e.g. say hello, list, op Player)…"
        @keyup.enter="send"
        :disabled="!connected"
      />
      <button class="send" :disabled="!connected" @click="send">Send</button>
    </div>
  </div>
</template>

<script>
import { KliveAPIUrl } from '~/scripts/APIInterface';
import { useCookie } from '#imports';

export default {
  name: 'KliveGamesGameConsole',
  props: { id: { type: String, required: true } },
  emits: ['status'],
  data() {
    return { lines: [], command: '', connected: false, _socket: null, _retry: null, _alive: true };
  },
  mounted() { this.connect(); },
  beforeUnmount() {
    this._alive = false;
    if (this._retry) clearTimeout(this._retry);
    if (this._socket) { try { this._socket.close(); } catch (e) {} }
  },
  methods: {
    connect() {
      if (!process.client) return;
      let pw = '';
      try { pw = useCookie('password').value || ''; } catch (e) {}
      const wsBase = KliveAPIUrl.replace('https', 'wss').replace('http', 'ws');
      const url = `${wsBase}/klivegames/servers/console?id=${encodeURIComponent(this.id)}&authorization=${encodeURIComponent(pw)}`;
      const socket = new WebSocket(url);
      this._socket = socket;

      socket.onopen = () => { this.connected = true; };
      socket.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'replay') { this.lines = (msg.lines || []).slice(-1000); this.scroll(); }
          else if (msg.type === 'line') { this.push(msg.data); }
          else if (msg.type === 'status') { this.$emit('status', msg.data); }
        } catch (e) { /* ignore */ }
      };
      socket.onclose = () => {
        this.connected = false;
        if (this._alive) this._retry = setTimeout(() => this.connect(), 1500);
      };
      socket.onerror = () => { try { socket.close(); } catch (e) {} };
    },
    push(line) {
      this.lines.push(line);
      if (this.lines.length > 1000) this.lines.splice(0, this.lines.length - 1000);
      this.scroll();
    },
    scroll() {
      this.$nextTick(() => { const el = this.$refs.out; if (el) el.scrollTop = el.scrollHeight; });
    },
    send() {
      const c = this.command.trim();
      if (!c || !this.connected) return;
      try { this._socket.send(c); } catch (e) {}
      this.command = '';
    },
    lineClass(l) {
      if (/error|exception|failed|severe/i.test(l)) return 'err';
      if (/warn/i.test(l)) return 'warn';
      if (l.startsWith('[provision]')) return 'prov';
      if (l.startsWith('>')) return 'cmd-echo';
      return '';
    },
  },
};
</script>

<style scoped>
.console { background: #0a0a0a; border: 1px solid #232323; border-radius: 10px; display: flex; flex-direction: column; height: 100%; min-height: 420px; }
.console-head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #1c1c1c; }
.conn { font-size: 12px; color: #777; }
.conn.on { color: #4d9e39; }
.clr { background: none; border: 1px solid #2a2a2a; color: #999; border-radius: 6px; padding: 3px 10px; cursor: pointer; font-size: 12px; }
.console-out { flex: 1; overflow-y: auto; padding: 12px; font-family: 'Consolas', 'Courier New', monospace; font-size: 12.5px; line-height: 1.5; }
.line { color: #cfcfcf; white-space: pre-wrap; word-break: break-word; }
.line.err { color: #ff6b5e; }
.line.warn { color: #e3b341; }
.line.prov { color: #6fb3ff; }
.line.cmd-echo { color: #4d9e39; }
.console-in { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-top: 1px solid #1c1c1c; }
.prompt { color: #4d9e39; font-family: monospace; }
.cmd { flex: 1; background: #0f0f0f; border: 1px solid #2a2a2a; color: #fff; border-radius: 6px; padding: 9px 11px; font-family: monospace; font-size: 13px; }
.send { background: #4d9e39; border: none; color: #fff; border-radius: 6px; padding: 9px 16px; cursor: pointer; font-weight: 600; }
.send:disabled { opacity: .5; cursor: not-allowed; }
</style>
