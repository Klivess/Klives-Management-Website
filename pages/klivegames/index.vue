<template>
  <div class="kg-container">
    <div class="kg-header">
      <div>
        <h1 class="kg-title">KliveGames</h1>
        <p class="kg-subtitle">Deploy and fully manage your game servers.</p>
      </div>
      <button class="kg-btn kg-btn-primary" @click="showWizard = true">＋ Deploy New Server</button>
    </div>

    <div v-if="loading && servers.length === 0" class="kg-empty">Loading servers…</div>

    <div v-else-if="servers.length === 0" class="kg-empty">
      <div class="kg-empty-icon">⛏</div>
      <h3>No servers yet</h3>
      <p>Deploy your first Minecraft server in seconds.</p>
      <button class="kg-btn kg-btn-primary" @click="showWizard = true">Deploy a Server</button>
    </div>

    <div v-else class="kg-grid">
      <KliveGamesServerCard
        v-for="s in servers"
        :key="s.Id"
        :server="s"
        @open="openServer(s.Id)"
        @start="lifecycle(s.Id, 'start')"
        @stop="lifecycle(s.Id, 'stop')"
        @restart="lifecycle(s.Id, 'restart')"
      />
    </div>

    <KliveGamesDeployWizard
      v-if="showWizard"
      @close="showWizard = false"
      @deployed="onDeployed"
    />
  </div>
</template>

<script>
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

export default {
  name: 'KliveGamesDashboard',
  data() {
    return {
      servers: [],
      loading: true,
      showWizard: false,
      _poll: null,
    };
  },
  async mounted() {
    await this.fetchServers();
    this._poll = setInterval(this.fetchServers, 4000);
  },
  beforeUnmount() {
    if (this._poll) clearInterval(this._poll);
  },
  methods: {
    async fetchServers() {
      try {
        const res = await RequestGETFromKliveAPI('/klivegames/servers');
        if (!res.ok) return;
        const data = await res.json();
        if (data.success) this.servers = data.servers || [];
      } catch (e) { /* ignore transient */ }
      finally { this.loading = false; }
    },
    openServer(id) {
      this.$router.push(`/klivegames/${id}`);
    },
    async lifecycle(id, op) {
      try {
        await RequestPOSTFromKliveAPI(`/klivegames/servers/${op}`, JSON.stringify({ id }), true, true);
        await this.fetchServers();
      } catch (e) { /* ignore */ }
    },
    onDeployed(id) {
      this.showWizard = false;
      this.fetchServers();
      if (id) this.$router.push(`/klivegames/${id}`);
    },
  },
};
</script>

<style scoped>
.kg-container { padding: 28px 32px; color: #fff; max-width: 1400px; margin: 0 auto; }
.kg-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
.kg-title { font-size: 30px; margin: 0; font-weight: 700; }
.kg-subtitle { color: #9a9a9a; margin: 6px 0 0; }
.kg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 18px; }
.kg-empty { text-align: center; padding: 80px 20px; color: #9a9a9a; }
.kg-empty-icon { font-size: 54px; margin-bottom: 10px; }
.kg-empty h3 { color: #fff; margin: 6px 0; }
.kg-btn {
  background: #1d1d1d; color: #fff; border: 1px solid #2c2c2c; border-radius: 8px;
  padding: 11px 18px; cursor: pointer; font-size: 14px; transition: all .15s;
}
.kg-btn:hover { border-color: #4d9e39; }
.kg-btn-primary { background: #4d9e39; border-color: #4d9e39; font-weight: 600; }
.kg-btn-primary:hover { background: #58b341; }
</style>
