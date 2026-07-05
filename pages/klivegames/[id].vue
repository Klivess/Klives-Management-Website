<template>
  <div class="kg-detail" v-if="server">
    <div class="d-header">
      <button class="back" @click="$router.push('/klivegames')">‹ Servers</button>
      <div class="d-id">
        <h1>{{ server.Name }}</h1>
        <span class="d-meta">{{ server.Flavor }} · {{ server.Version }} · port {{ server.Port }}</span>
      </div>
      <span class="badge" :style="{ background: statusColor + '22', color: statusColor, borderColor: statusColor + '55' }">
        <span class="dot" :style="{ background: statusColor }"></span>{{ server.Status }}
      </span>
      <div class="d-actions">
        <button v-if="canStart" class="ab start" @click="lifecycle('start')">▶ Start</button>
        <button v-if="canStop" class="ab" @click="lifecycle('restart')">⟳ Restart</button>
        <button v-if="canStop" class="ab stop" @click="lifecycle('stop')">■ Stop</button>
        <button v-if="canStop" class="ab kill" @click="lifecycle('kill')" title="Force kill">✕</button>
      </div>
    </div>

    <div class="join" v-if="server.PublicJoinAddress || server.Public">
      <span>Join: <code>localhost:{{ server.Port }}</code></span>
      <span v-if="server.PublicJoinAddress">Public: <code>{{ server.PublicJoinAddress }}</code></span>
    </div>

    <div class="tabs">
      <button v-for="t in tabs" :key="t" class="tab" :class="{ active: tab === t }" @click="tab = t">{{ t }}</button>
    </div>

    <div class="tab-body">
      <KliveGamesGameConsole v-show="tab === 'Console'" :id="id" @status="onStatus" />
      <KliveGamesConfigEditor v-if="tab === 'Configuration'" :id="id" />
      <KliveGamesFileBrowser v-if="tab === 'Files'" :id="id" />
      <KliveGamesPlayersPanel v-if="tab === 'Players'" :id="id" :players="server.OnlinePlayers || []" @changed="fetchServer" />
      <KliveGamesBackupsPanel v-if="tab === 'Backups'" :id="id" />

      <div v-if="tab === 'Settings'" class="settings">
        <div class="set-row">
          <label>Server Name</label>
          <div class="set-inline">
            <input v-model="renameValue" class="inp" />
            <button class="btn" @click="rename">Rename</button>
          </div>
        </div>
        <div class="set-row">
          <label>Public Access</label>
          <div class="set-inline">
            <label class="toggle"><input type="checkbox" :checked="server.Public" @change="setPublic($event.target.checked)" /> Forward port {{ server.Port }} via UPnP</label>
          </div>
          <p v-if="netMsg" class="muted">{{ netMsg }}</p>
        </div>
        <div class="set-row danger">
          <label>Danger Zone</label>
          <button class="btn del" @click="del">Delete this server permanently</button>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="loading">Loading…</div>
</template>

<script>
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

export default {
  name: 'KliveGamesServerDetail',
  data() {
    return {
      id: this.$route.params.id,
      server: null,
      tab: 'Console',
      tabs: ['Console', 'Configuration', 'Files', 'Players', 'Backups', 'Settings'],
      renameValue: '',
      netMsg: '',
      _poll: null,
    };
  },
  computed: {
    canStart() { return this.server && ['Stopped', 'Crashed'].includes(this.server.Status); },
    canStop() { return this.server && ['Running', 'Starting', 'Stalled', 'Stopping'].includes(this.server.Status); },
    statusColor() {
      switch (this.server && this.server.Status) {
        case 'Running': return '#4d9e39';
        case 'Starting': case 'Provisioning': case 'Stopping': return '#d9a528';
        case 'Crashed': case 'Stalled': return '#d9483b';
        default: return '#6a6a6a';
      }
    },
  },
  async mounted() {
    await this.fetchServer();
    this._poll = setInterval(this.fetchServer, 4000);
  },
  beforeUnmount() { if (this._poll) clearInterval(this._poll); },
  methods: {
    async fetchServer() {
      try {
        const res = await RequestGETFromKliveAPI(`/klivegames/servers/get?id=${this.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success) {
          this.server = data.server;
          if (!this.renameValue) this.renameValue = data.server.Name;
        }
      } catch (e) { /* ignore */ }
    },
    onStatus(s) { if (this.server && s && s.status) this.server.Status = s.status; },
    async lifecycle(op) {
      try {
        await RequestPOSTFromKliveAPI(`/klivegames/servers/${op}`, JSON.stringify({ id: this.id }), true, true);
        await this.fetchServer();
      } catch (e) { /* ignore */ }
    },
    async rename() {
      try {
        await RequestPOSTFromKliveAPI('/klivegames/config/set', JSON.stringify({ id: this.id, name: this.renameValue }), true, true);
        await this.fetchServer();
      } catch (e) { /* ignore */ }
    },
    async setPublic(val) {
      try {
        const res = await RequestPOSTFromKliveAPI('/klivegames/network/setpublic', JSON.stringify({ id: this.id, public: val }), true, true);
        const data = await res.json();
        this.netMsg = data.message || '';
        await this.fetchServer();
      } catch (e) { /* ignore */ }
    },
    async del() {
      if (!confirm(`Delete "${this.server.Name}"? This removes all server files and backups permanently.`)) return;
      try {
        await RequestPOSTFromKliveAPI('/klivegames/servers/delete', JSON.stringify({ id: this.id }), true, true);
        this.$router.push('/klivegames');
      } catch (e) { /* ignore */ }
    },
  },
};
</script>

<style scoped>
.kg-detail { padding: 24px 32px; color: #fff; max-width: 1400px; margin: 0 auto; }
.loading { padding: 60px; text-align: center; color: #888; }
.d-header { display: flex; align-items: center; gap: 16px; }
.back { background: none; border: 1px solid #2a2a2a; color: #bbb; border-radius: 7px; padding: 8px 14px; cursor: pointer; }
.back:hover { border-color: #4d9e39; }
.d-id { flex: 1; }
.d-id h1 { margin: 0; font-size: 24px; }
.d-meta { color: #8c8c8c; font-size: 13px; }
.badge { font-size: 12px; padding: 5px 12px; border-radius: 20px; border: 1px solid; display: inline-flex; align-items: center; gap: 7px; font-weight: 600; }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.d-actions { display: flex; gap: 8px; }
.ab { background: #1d1d1d; border: 1px solid #2c2c2c; color: #ddd; border-radius: 7px; padding: 9px 14px; cursor: pointer; font-size: 13px; }
.ab:hover { border-color: #4d9e39; }
.ab.start { color: #4d9e39; }
.ab.stop { color: #d9a528; }
.ab.kill { color: #d9483b; }
.join { margin-top: 14px; display: flex; gap: 22px; font-size: 13px; color: #9a9a9a; }
.join code { background: #0f0f0f; padding: 3px 8px; border-radius: 5px; color: #4d9e39; }
.tabs { display: flex; gap: 4px; margin: 22px 0 18px; border-bottom: 1px solid #1f1f1f; }
.tab { background: none; border: none; color: #999; padding: 11px 18px; cursor: pointer; font-size: 14px; border-bottom: 2px solid transparent; }
.tab.active { color: #fff; border-bottom-color: #4d9e39; }
.tab-body { min-height: 440px; }
.settings { max-width: 640px; }
.set-row { margin-bottom: 26px; }
.set-row > label { display: block; color: #4d9e39; font-size: 13px; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 10px; }
.set-row.danger > label { color: #d9483b; }
.set-inline { display: flex; gap: 10px; align-items: center; }
.inp { flex: 1; background: #0f0f0f; border: 1px solid #2a2a2a; color: #fff; border-radius: 7px; padding: 9px 11px; }
.btn { background: #1d1d1d; border: 1px solid #2c2c2c; color: #ddd; border-radius: 7px; padding: 9px 16px; cursor: pointer; }
.btn:hover { border-color: #4d9e39; }
.btn.del { background: #2a1414; border-color: #5a2020; color: #ff6b5e; }
.toggle { display: flex; align-items: center; gap: 9px; color: #ddd; font-size: 13px; }
.muted { color: #888; font-size: 12px; margin-top: 8px; }
</style>
