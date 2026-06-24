<template>
  <div class="card" @click="$emit('open')">
    <div class="card-top">
      <div class="card-icon">{{ flavorIcon }}</div>
      <div class="card-id">
        <h3 class="card-name">{{ server.Name }}</h3>
        <span class="card-meta">{{ server.Flavor }} · {{ server.Version }}</span>
      </div>
      <span class="badge" :style="{ background: statusColor + '22', color: statusColor, borderColor: statusColor + '55' }">
        <span class="dot" :style="{ background: statusColor }"></span>{{ server.Status }}
      </span>
    </div>

    <div class="card-stats">
      <div class="stat"><span class="stat-label">Players</span><span class="stat-val">{{ (server.OnlinePlayers || []).length }}<span v-if="server.MaxPlayers"> / {{ server.MaxPlayers }}</span></span></div>
      <div class="stat"><span class="stat-label">CPU</span><span class="stat-val">{{ (server.CpuPercent || 0).toFixed(0) }}%</span></div>
      <div class="stat"><span class="stat-label">RAM</span><span class="stat-val">{{ ramText }}</span></div>
      <div class="stat"><span class="stat-label">Port</span><span class="stat-val">{{ server.Port }}</span></div>
    </div>

    <div class="card-foot" @click.stop>
      <span class="net" :title="server.PublicJoinAddress || 'Local only'">
        {{ server.Public ? (server.PublicJoinAddress || 'Public') : 'Local' }}
      </span>
      <div class="actions">
        <button v-if="canStart" class="a-btn start" @click="$emit('start')">▶ Start</button>
        <button v-if="canStop" class="a-btn" @click="$emit('restart')">⟳</button>
        <button v-if="canStop" class="a-btn stop" @click="$emit('stop')">■ Stop</button>
        <button class="a-btn" @click="$emit('open')">Manage ›</button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'KliveGamesServerCard',
  props: { server: { type: Object, required: true } },
  emits: ['open', 'start', 'stop', 'restart'],
  computed: {
    canStart() { return ['Stopped', 'Crashed'].includes(this.server.Status); },
    canStop() { return ['Running', 'Starting', 'Stalled'].includes(this.server.Status); },
    statusColor() {
      switch (this.server.Status) {
        case 'Running': return '#4d9e39';
        case 'Starting': case 'Provisioning': case 'Stopping': return '#d9a528';
        case 'Crashed': case 'Stalled': return '#d9483b';
        default: return '#6a6a6a';
      }
    },
    flavorIcon() {
      if (this.server.GameType === 'Terraria') return this.server.Flavor === 'TModLoader' ? '🔧' : '🌳';
      switch (this.server.Flavor) {
        case 'Paper': return '📄';
        case 'Fabric': return '🧵';
        case 'Forge': return '🔨';
        default: return '⛏';
      }
    },
    ramText() {
      const mb = (this.server.RamUsedBytes || 0) / (1024 * 1024);
      if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
      return mb.toFixed(0) + ' MB';
    },
  },
};
</script>

<style scoped>
.card { background: #161516; border: 1px solid #232323; border-radius: 12px; padding: 16px; cursor: pointer; transition: border-color .15s, transform .15s; }
.card:hover { border-color: #4d9e39; transform: translateY(-2px); }
.card-top { display: flex; align-items: center; gap: 12px; }
.card-icon { font-size: 26px; }
.card-id { flex: 1; min-width: 0; }
.card-name { margin: 0; font-size: 17px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-meta { color: #8c8c8c; font-size: 12px; }
.badge { font-size: 11px; padding: 4px 9px; border-radius: 20px; border: 1px solid; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
.dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.card-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 16px 0; }
.stat { background: #0f0f0f; border-radius: 8px; padding: 9px; text-align: center; }
.stat-label { display: block; color: #777; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; }
.stat-val { color: #fff; font-size: 16px; font-weight: 600; }
.card-foot { display: flex; justify-content: space-between; align-items: center; }
.net { color: #8c8c8c; font-size: 12px; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions { display: flex; gap: 6px; }
.a-btn { background: #1d1d1d; border: 1px solid #2c2c2c; color: #ddd; border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 12px; }
.a-btn:hover { border-color: #4d9e39; }
.a-btn.start { color: #4d9e39; }
.a-btn.stop { color: #d9483b; }
</style>
