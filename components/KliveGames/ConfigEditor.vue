<template>
  <div class="cfg">
    <div v-if="loading" class="muted">Loading configuration…</div>
    <template v-else>
      <div class="cfg-section">
        <h3 class="sec-title">Runtime</h3>
        <div class="grid">
          <template v-if="usesMemoryLimit">
            <div class="field">
              <label>Memory: {{ (ram / 1024).toFixed(1) }} GB</label>
              <input type="range" min="1024" max="16384" step="512" v-model.number="ram" class="range" />
            </div>
            <div class="field">
              <label>Extra JVM Args</label>
              <input v-model="jvmArgs" class="inp" placeholder="(optional)" />
            </div>
            <div class="field toggle"><label><input type="checkbox" v-model="useAikarFlags" /> Aikar GC flags</label></div>
          </template>
          <div class="field toggle"><label><input type="checkbox" v-model="autoRestart" /> Auto-restart on crash</label></div>
          <div class="field toggle"><label><input type="checkbox" v-model="autoStart" /> Start on boot</label></div>
        </div>
      </div>

      <div v-for="cat in categories" :key="cat" class="cfg-section">
        <h3 class="sec-title">{{ cat }}</h3>
        <div class="grid">
          <div v-for="f in fieldsByCat(cat)" :key="f.Key" class="field">
            <label :title="f.Key">{{ f.Label }}</label>
            <input v-if="f.Type === 'Text'" v-model="values[f.Key]" class="inp" />
            <input v-else-if="f.Type === 'Number'" type="number" v-model="values[f.Key]" class="inp" />
            <label v-else-if="f.Type === 'Boolean'" class="bool"><input type="checkbox" :checked="values[f.Key] === 'true'" @change="values[f.Key] = $event.target.checked ? 'true' : 'false'" /> {{ values[f.Key] === 'true' ? 'On' : 'Off' }}</label>
            <select v-else-if="f.Type === 'Dropdown'" v-model="values[f.Key]" class="inp">
              <option v-for="o in f.Options" :key="o" :value="o">{{ o }}</option>
            </select>
            <span v-if="f.Description" class="desc">{{ f.Description }}</span>
          </div>
        </div>
      </div>

      <div class="cfg-foot">
        <span v-if="saved" class="ok">Saved — restart the server to apply.</span>
        <span v-if="error" class="err">{{ error }}</span>
        <button class="btn primary" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save Changes' }}</button>
      </div>
    </template>
  </div>
</template>

<script>
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

export default {
  name: 'KliveGamesConfigEditor',
  props: { id: { type: String, required: true } },
  data() {
    return {
      loading: true, saving: false, saved: false, error: '',
      schema: [], values: {}, usesMemoryLimit: true,
      ram: 2048, jvmArgs: '', useAikarFlags: true, autoRestart: true, autoStart: false,
    };
  },
  computed: {
    categories() { return [...new Set(this.schema.map(f => f.Category))]; },
  },
  async mounted() { await this.load(); },
  methods: {
    async load() {
      this.loading = true;
      try {
        const res = await RequestGETFromKliveAPI(`/klivegames/config/get?id=${this.id}`);
        const data = await res.json();
        if (data.success) {
          this.schema = data.schema || [];
          const v = {};
          for (const f of this.schema) v[f.Key] = f.Value ?? '';
          this.values = v;
          this.usesMemoryLimit = data.usesMemoryLimit !== false;
          this.ram = data.ram; this.jvmArgs = data.jvmArgs || '';
          this.useAikarFlags = data.useAikarFlags; this.autoRestart = data.autoRestart; this.autoStart = data.autoStart;
        } else { this.error = data.error; }
      } catch (e) { this.error = 'Failed to load configuration.'; }
      finally { this.loading = false; }
    },
    fieldsByCat(cat) { return this.schema.filter(f => f.Category === cat); },
    async save() {
      this.saving = true; this.saved = false; this.error = '';
      try {
        const body = {
          id: this.id, values: this.values,
          ram: this.ram, jvmArgs: this.jvmArgs, useAikarFlags: this.useAikarFlags,
          autoRestart: this.autoRestart, autoStart: this.autoStart,
        };
        const res = await RequestPOSTFromKliveAPI('/klivegames/config/set', JSON.stringify(body), true, true);
        const data = await res.json();
        if (data.success) { this.saved = true; setTimeout(() => (this.saved = false), 4000); }
        else this.error = data.error || 'Save failed.';
      } catch (e) { this.error = 'Save failed.'; }
      finally { this.saving = false; }
    },
  },
};
</script>

<style scoped>
.cfg { color: #fff; }
.muted { color: #888; }
.cfg-section { margin-bottom: 24px; }
.sec-title { font-size: 14px; color: #4d9e39; text-transform: uppercase; letter-spacing: .6px; margin: 0 0 12px; border-bottom: 1px solid #1f1f1f; padding-bottom: 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field > label { font-size: 13px; color: #c4c4c4; }
.inp { background: #0f0f0f; border: 1px solid #2a2a2a; color: #fff; border-radius: 7px; padding: 9px; font-size: 13px; }
.range { accent-color: #4d9e39; }
.bool { display: flex; align-items: center; gap: 8px; color: #ddd; font-size: 13px; }
.toggle label { display: flex; align-items: center; gap: 8px; color: #ddd; font-size: 13px; }
.desc { color: #777; font-size: 11px; }
.cfg-foot { display: flex; justify-content: flex-end; align-items: center; gap: 14px; border-top: 1px solid #1f1f1f; padding-top: 16px; }
.ok { color: #4d9e39; font-size: 13px; }
.err { color: #d9483b; font-size: 13px; }
.btn { background: #1d1d1d; border: 1px solid #2c2c2c; color: #fff; border-radius: 8px; padding: 10px 18px; cursor: pointer; }
.btn.primary { background: #4d9e39; border-color: #4d9e39; font-weight: 600; }
.btn.primary:disabled { opacity: .5; }
</style>
