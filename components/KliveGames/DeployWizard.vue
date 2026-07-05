<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-head">
        <h2>Deploy a Server</h2>
        <button class="x" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <!-- Game -->
        <label class="fld-label">Game</label>
        <div class="chips">
          <button
            v-for="g in games" :key="g.gameType"
            class="chip" :class="{ active: selectedGame === g.gameType, disabled: !g.implemented }"
            :disabled="!g.implemented"
            @click="selectGame(g)"
          >{{ g.displayName }}<span v-if="!g.implemented" class="soon">soon</span></button>
        </div>

        <!-- Flavor -->
        <label class="fld-label">Server Type</label>
        <div class="chips">
          <button
            v-for="f in flavors" :key="f"
            class="chip" :class="{ active: selectedFlavor === f }"
            @click="selectFlavor(f)"
          >{{ f }}</button>
        </div>
        <p class="hint">{{ flavorHint }}</p>

        <!-- Version -->
        <label class="fld-label">Version</label>
        <select v-model="selectedVersion" class="kg-select" :disabled="loadingVersions">
          <option v-if="loadingVersions" value="">Loading versions…</option>
          <option v-for="v in versions" :key="v.Version" :value="v.Version">{{ v.Version }}</option>
        </select>

        <!-- Name -->
        <label class="fld-label">Server Name</label>
        <input v-model="name" class="kg-input" placeholder="My Server" />

        <!-- Game-specific deploy options (e.g. Terraria world settings) -->
        <div v-if="deployOptions.length" class="opt-grid">
          <div v-for="f in deployOptions" :key="f.Key" class="opt-field">
            <label class="fld-label">{{ f.Label }}</label>
            <input v-if="f.Type === 'Text'" v-model="deployValues[f.Key]" class="kg-input" :placeholder="f.Key === 'worldName' ? (name || 'World') : ''" />
            <input v-else-if="f.Type === 'Number'" type="number" v-model="deployValues[f.Key]" class="kg-input" />
            <select v-else-if="f.Type === 'Dropdown'" v-model="deployValues[f.Key]" class="kg-select">
              <option v-for="o in f.Options" :key="o" :value="o">{{ o }}</option>
            </select>
            <p v-if="f.Description" class="hint">{{ f.Description }}</p>
          </div>
        </div>

        <!-- Memory (memory-based games only) -->
        <template v-if="usesMemory">
          <label class="fld-label">Memory: {{ (ramMb / 1024).toFixed(1) }} GB</label>
          <input type="range" min="1024" max="16384" step="512" v-model.number="ramMb" class="kg-range" />
        </template>

        <div class="row2">
          <div>
            <label class="fld-label">Port (blank = auto)</label>
            <input v-model="port" class="kg-input" :placeholder="String(defaultPort)" />
          </div>
          <div class="toggles">
            <label class="toggle"><input type="checkbox" v-model="makePublic" /> Make public (port-forward)</label>
            <label class="toggle"><input type="checkbox" v-model="startAfter" /> Start after deploy</label>
            <label class="toggle" v-if="usesMemory && selectedFlavor !== 'Vanilla'"><input type="checkbox" v-model="useAikar" /> Aikar GC flags</label>
          </div>
        </div>

        <label class="eula" v-if="requiresEula"><input type="checkbox" v-model="eula" /> I accept the
          <a href="https://aka.ms/MinecraftEULA" target="_blank">Minecraft EULA</a>.</label>

        <p v-if="error" class="err">{{ error }}</p>
      </div>

      <div class="modal-foot">
        <button class="kg-btn" @click="$emit('close')">Cancel</button>
        <button class="kg-btn kg-btn-primary" :disabled="!canDeploy || deploying" @click="deploy">
          {{ deploying ? 'Deploying…' : 'Deploy Server' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

export default {
  name: 'KliveGamesDeployWizard',
  emits: ['close', 'deployed'],
  data() {
    return {
      games: [],
      selectedGame: 'Minecraft',
      selectedFlavor: 'Paper',
      versions: [],
      selectedVersion: '',
      loadingVersions: false,
      name: '',
      ramMb: 2048,
      port: '',
      makePublic: false,
      startAfter: true,
      useAikar: true,
      eula: false,
      deployValues: {},
      deploying: false,
      error: '',
    };
  },
  computed: {
    selectedGameObj() { return this.games.find(g => g.gameType === this.selectedGame) || {}; },
    flavors() { return this.selectedGameObj.flavors || ['Vanilla', 'Paper', 'Fabric', 'Forge']; },
    requiresEula() { return !!this.selectedGameObj.requiresEula; },
    usesMemory() { return this.selectedGameObj.usesMemoryLimit !== false; },
    deployOptions() { return this.selectedGameObj.deployOptions || []; },
    defaultPort() { return this.selectedGameObj.defaultPort || 25565; },
    flavorHint() {
      if (this.selectedGame === 'Terraria') {
        return this.selectedFlavor === 'TModLoader'
          ? 'Modded Terraria via tModLoader. Upload .tmod files to the Mods/ folder after deploy.'
          : 'The official Terraria dedicated server. No mods.';
      }
      switch (this.selectedFlavor) {
        case 'Vanilla': return 'The official Mojang server. No plugins or mods.';
        case 'Paper': return 'High-performance fork with Bukkit/Spigot plugin support. Recommended.';
        case 'Fabric': return 'Lightweight modern mod loader. Drop mods into the mods/ folder.';
        case 'Forge': return 'Classic modpack loader. Installs automatically (takes a little longer).';
        default: return '';
      }
    },
    canDeploy() {
      return this.name.trim() && this.selectedVersion && (!this.requiresEula || this.eula) && !this.loadingVersions;
    },
  },
  async mounted() {
    try {
      const res = await RequestGETFromKliveAPI('/klivegames/games');
      const data = await res.json();
      if (data.success) this.games = data.games || [];
    } catch (e) { /* ignore */ }
    this.initDeployValues();
    await this.loadVersions();
  },
  methods: {
    selectGame(g) {
      if (!g.implemented) return;
      this.selectedGame = g.gameType;
      this.selectedFlavor = (g.flavors && g.flavors[0]) || 'Vanilla';
      this.initDeployValues();
      this.loadVersions();
    },
    selectFlavor(f) { this.selectedFlavor = f; this.loadVersions(); },
    initDeployValues() {
      const vals = {};
      for (const f of this.deployOptions) vals[f.Key] = f.Value ?? '';
      this.deployValues = vals;
    },
    async loadVersions() {
      this.loadingVersions = true;
      this.versions = [];
      this.selectedVersion = '';
      try {
        const res = await RequestGETFromKliveAPI(`/klivegames/versions?game=${this.selectedGame}&flavor=${this.selectedFlavor}`);
        const data = await res.json();
        if (data.success) {
          this.versions = data.versions || [];
          if (this.versions.length) this.selectedVersion = this.versions[0].Version;
        } else { this.error = data.error || 'Could not load versions.'; }
      } catch (e) { this.error = 'Could not load versions.'; }
      finally { this.loadingVersions = false; }
    },
    async deploy() {
      this.error = '';
      this.deploying = true;
      try {
        const body = {
          name: this.name.trim(),
          gameType: this.selectedGame,
          flavor: this.selectedFlavor,
          version: this.selectedVersion,
          port: parseInt(this.port) || 0,
          ramMb: this.ramMb,
          useAikarFlags: this.useAikar,
          public: this.makePublic,
          autoStart: false,
          startAfterCreate: this.startAfter,
          eulaAccepted: this.requiresEula ? this.eula : true,
          options: { ...this.deployValues },
        };
        const res = await RequestPOSTFromKliveAPI('/klivegames/servers/create', JSON.stringify(body), true, true);
        const data = await res.json();
        if (data.success) this.$emit('deployed', data.server.Id);
        else this.error = data.error || 'Deploy failed.';
      } catch (e) { this.error = 'Deploy failed.'; }
      finally { this.deploying = false; }
    },
  },
};
</script>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.65); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal { background: #141414; border: 1px solid #2a2a2a; border-radius: 14px; width: 640px; max-width: 94vw; max-height: 92vh; display: flex; flex-direction: column; color: #fff; }
.modal-head { display: flex; justify-content: space-between; align-items: center; padding: 18px 22px; border-bottom: 1px solid #232323; }
.modal-head h2 { margin: 0; font-size: 20px; }
.x { background: none; border: none; color: #888; font-size: 18px; cursor: pointer; }
.modal-body { padding: 20px 22px; overflow-y: auto; }
.fld-label { display: block; color: #bdbdbd; font-size: 13px; margin: 16px 0 7px; font-weight: 600; }
.fld-label:first-child { margin-top: 0; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { background: #1c1c1c; border: 1px solid #2c2c2c; color: #ddd; border-radius: 8px; padding: 9px 15px; cursor: pointer; font-size: 14px; }
.chip.active { border-color: #4d9e39; background: #4d9e3922; color: #fff; }
.chip.disabled { opacity: .4; cursor: not-allowed; }
.soon { font-size: 10px; color: #d9a528; margin-left: 6px; }
.hint { color: #8c8c8c; font-size: 12px; margin: 8px 0 0; }
.kg-select, .kg-input { width: 100%; background: #0f0f0f; border: 1px solid #2c2c2c; color: #fff; border-radius: 8px; padding: 11px; font-size: 14px; box-sizing: border-box; }
.kg-range { width: 100%; accent-color: #4d9e39; }
.opt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; }
.opt-field { min-width: 0; }
.row2 { display: grid; grid-template-columns: 1fr 1.2fr; gap: 18px; align-items: start; }
.toggles { display: flex; flex-direction: column; gap: 8px; margin-top: 26px; }
.toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #cfcfcf; cursor: pointer; }
.eula { display: flex; align-items: center; gap: 8px; margin-top: 20px; font-size: 13px; color: #cfcfcf; }
.eula a { color: #4d9e39; }
.err { color: #d9483b; margin-top: 12px; font-size: 13px; }
.modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 22px; border-top: 1px solid #232323; }
.kg-btn { background: #1d1d1d; color: #fff; border: 1px solid #2c2c2c; border-radius: 8px; padding: 11px 18px; cursor: pointer; font-size: 14px; }
.kg-btn:hover { border-color: #4d9e39; }
.kg-btn-primary { background: #4d9e39; border-color: #4d9e39; font-weight: 600; }
.kg-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
</style>
