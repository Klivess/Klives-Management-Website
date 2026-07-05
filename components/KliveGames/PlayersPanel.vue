<template>
  <div class="pp">
    <div class="pp-add">
      <input v-model="manualName" class="inp" placeholder="Player name…" @keyup.enter="firstAddAction && act(manualName, firstAddAction)" />
      <button v-if="has('whitelist-add')" class="btn" @click="act(manualName, 'whitelist-add')">Whitelist</button>
      <button v-if="has('op')" class="btn" @click="act(manualName, 'op')">Op</button>
      <button v-if="has('ban')" class="btn" @click="act(manualName, 'ban')">Ban</button>
    </div>

    <div v-if="!players.length" class="empty">No players online.</div>
    <div v-else class="pp-list">
      <div v-for="p in players" :key="p" class="pp-row">
        <span class="pname"><span class="av">{{ p.charAt(0).toUpperCase() }}</span>{{ p }}</span>
        <div class="pacts">
          <button v-if="has('op')" class="mini" @click="act(p, 'op')">Op</button>
          <button v-if="has('deop')" class="mini" @click="act(p, 'deop')">De-op</button>
          <button v-if="has('kick')" class="mini" @click="act(p, 'kick')">Kick</button>
          <button v-if="has('ban')" class="mini ban" @click="act(p, 'ban')">Ban</button>
        </div>
      </div>
    </div>
    <p v-if="note" class="note">{{ note }}</p>
  </div>
</template>

<script>
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

export default {
  name: 'KliveGamesPlayersPanel',
  props: { id: { type: String, required: true }, players: { type: Array, default: () => [] } },
  emits: ['changed'],
  data() {
    return { manualName: '', note: '', supportedActions: ['op', 'deop', 'kick', 'ban', 'whitelist-add'] };
  },
  computed: {
    firstAddAction() {
      return ['whitelist-add', 'op', 'ban'].find(a => this.has(a)) || null;
    },
  },
  async mounted() {
    try {
      const res = await RequestGETFromKliveAPI(`/klivegames/players/list?id=${this.id}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.supportedActions)) this.supportedActions = data.supportedActions;
    } catch (e) { /* ignore */ }
  },
  methods: {
    has(a) { return this.supportedActions.includes(a); },
    async act(player, action) {
      const name = (player || '').trim();
      if (!name) return;
      try {
        const res = await RequestPOSTFromKliveAPI('/klivegames/players/action', JSON.stringify({ id: this.id, action, player: name }), true, true);
        const data = await res.json();
        this.note = data.success ? `Ran: ${data.command}` : (data.error || 'Action failed.');
        setTimeout(() => (this.note = ''), 4000);
        this.$emit('changed');
      } catch (e) { this.note = 'Action failed.'; }
    },
  },
};
</script>

<style scoped>
.pp { color: #fff; }
.pp-add { display: flex; gap: 8px; margin-bottom: 18px; }
.inp { flex: 1; background: #0f0f0f; border: 1px solid #2a2a2a; color: #fff; border-radius: 7px; padding: 9px 11px; font-size: 13px; }
.btn { background: #1d1d1d; border: 1px solid #2c2c2c; color: #ddd; border-radius: 7px; padding: 8px 14px; cursor: pointer; font-size: 13px; }
.btn:hover { border-color: #4d9e39; }
.empty { color: #777; padding: 30px; text-align: center; }
.pp-list { display: flex; flex-direction: column; gap: 8px; }
.pp-row { display: flex; justify-content: space-between; align-items: center; background: #141414; border: 1px solid #222; border-radius: 8px; padding: 10px 14px; }
.pname { display: flex; align-items: center; gap: 10px; font-size: 14px; }
.av { width: 28px; height: 28px; border-radius: 6px; background: #4d9e39; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
.pacts { display: flex; gap: 6px; }
.mini { background: #1a1a1a; border: 1px solid #2a2a2a; color: #ccc; border-radius: 5px; padding: 5px 11px; cursor: pointer; font-size: 12px; }
.mini:hover { border-color: #4d9e39; }
.mini.ban { color: #d9483b; }
.note { color: #4d9e39; font-size: 13px; margin-top: 12px; }
</style>
