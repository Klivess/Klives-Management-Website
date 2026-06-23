<template>
  <div class="fb">
    <div class="fb-bar">
      <div class="crumbs">
        <span class="crumb" @click="go('')">root</span>
        <template v-for="(c, i) in crumbs" :key="i">
          <span class="sep">/</span>
          <span class="crumb" @click="go(crumbPath(i))">{{ c }}</span>
        </template>
      </div>
      <div class="fb-actions">
        <label class="btn upload">⬆ Upload<input type="file" hidden @change="upload" /></label>
        <button class="btn" @click="load(path)">⟳</button>
      </div>
    </div>

    <div v-if="error" class="err">{{ error }}</div>

    <table class="fb-table">
      <thead><tr><th>Name</th><th>Size</th><th>Modified</th><th></th></tr></thead>
      <tbody>
        <tr v-if="path"><td colspan="4" class="up" @click="goUp">📁 ..</td></tr>
        <tr v-for="e in entries" :key="e.Path">
          <td class="nm" @click="e.IsDirectory ? go(e.Path) : null">
            <span>{{ e.IsDirectory ? '📁' : '📄' }}</span> {{ e.Name }}
          </td>
          <td class="sz">{{ e.IsDirectory ? '—' : fmtSize(e.Size) }}</td>
          <td class="dt">{{ fmtDate(e.ModifiedUtc) }}</td>
          <td class="ops">
            <button v-if="!e.IsDirectory && isText(e.Name)" class="mini" @click="edit(e)">Edit</button>
            <button v-if="!e.IsDirectory" class="mini" @click="download(e)">↓</button>
            <button class="mini del" @click="remove(e)">✕</button>
          </td>
        </tr>
        <tr v-if="!entries.length"><td colspan="4" class="empty">Empty folder</td></tr>
      </tbody>
    </table>

    <!-- Edit modal -->
    <div v-if="editing" class="modal-overlay" @click.self="editing = null">
      <div class="modal">
        <div class="modal-head"><h3>{{ editing.Name }}</h3><button class="x" @click="editing = null">✕</button></div>
        <textarea v-model="editContent" class="editor" spellcheck="false"></textarea>
        <div class="modal-foot">
          <button class="btn" @click="editing = null">Cancel</button>
          <button class="btn primary" :disabled="savingEdit" @click="saveEdit">{{ savingEdit ? 'Saving…' : 'Save' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

const TEXT_EXT = ['.txt', '.properties', '.json', '.yml', '.yaml', '.conf', '.cfg', '.log', '.toml', '.sh', '.bat', '.mcmeta', '.md', '.ini'];

export default {
  name: 'KliveGamesFileBrowser',
  props: { id: { type: String, required: true } },
  data() {
    return { path: '', entries: [], error: '', editing: null, editContent: '', savingEdit: false };
  },
  computed: {
    crumbs() { return this.path ? this.path.split('/').filter(Boolean) : []; },
  },
  mounted() { this.load(''); },
  methods: {
    crumbPath(i) { return this.crumbs.slice(0, i + 1).join('/'); },
    async load(p) {
      this.error = '';
      try {
        const res = await RequestGETFromKliveAPI(`/klivegames/files/list?id=${this.id}&path=${encodeURIComponent(p || '')}`);
        const data = await res.json();
        if (data.success) { this.entries = data.entries || []; this.path = p || ''; }
        else this.error = data.error || 'Could not list files.';
      } catch (e) { this.error = 'Could not list files.'; }
    },
    go(p) { this.load(p); },
    goUp() { const parts = this.path.split('/').filter(Boolean); parts.pop(); this.load(parts.join('/')); },
    isText(name) { return TEXT_EXT.some(x => name.toLowerCase().endsWith(x)); },
    async download(e) {
      const res = await RequestGETFromKliveAPI(`/klivegames/files/download?id=${this.id}&path=${encodeURIComponent(e.Path)}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = e.Name; a.click();
      URL.revokeObjectURL(url);
    },
    async edit(e) {
      const res = await RequestGETFromKliveAPI(`/klivegames/files/download?id=${this.id}&path=${encodeURIComponent(e.Path)}`);
      this.editContent = await res.text();
      this.editing = e;
    },
    async saveEdit() {
      this.savingEdit = true;
      try {
        await RequestPOSTFromKliveAPI('/klivegames/files/edit', JSON.stringify({ id: this.id, path: this.editing.Path, content: this.editContent }), true, true);
        this.editing = null;
        await this.load(this.path);
      } catch (e) { /* ignore */ }
      finally { this.savingEdit = false; }
    },
    async upload(ev) {
      const file = ev.target.files[0];
      if (!file) return;
      try {
        await RequestPOSTFromKliveAPI(`/klivegames/files/upload?id=${this.id}&path=${encodeURIComponent(this.path)}&name=${encodeURIComponent(file.name)}`, file, true, false);
        await this.load(this.path);
      } catch (e) { this.error = 'Upload failed.'; }
      ev.target.value = '';
    },
    async remove(e) {
      if (!confirm(`Delete ${e.Name}?`)) return;
      try {
        await RequestPOSTFromKliveAPI('/klivegames/files/delete', JSON.stringify({ id: this.id, path: e.Path }), true, true);
        await this.load(this.path);
      } catch (err) { /* ignore */ }
    },
    fmtSize(b) { if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB'; if (b >= 1024) return (b / 1024).toFixed(0) + ' KB'; return b + ' B'; },
    fmtDate(d) { try { return new Date(d).toLocaleString(); } catch (e) { return ''; } },
  },
};
</script>

<style scoped>
.fb { color: #fff; }
.fb-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.crumbs { font-size: 13px; color: #9a9a9a; }
.crumb { cursor: pointer; color: #4d9e39; }
.crumb:hover { text-decoration: underline; }
.sep { margin: 0 5px; color: #555; }
.fb-actions { display: flex; gap: 8px; }
.btn { background: #1d1d1d; border: 1px solid #2c2c2c; color: #ddd; border-radius: 7px; padding: 7px 13px; cursor: pointer; font-size: 13px; }
.btn:hover { border-color: #4d9e39; }
.btn.primary { background: #4d9e39; border-color: #4d9e39; color: #fff; font-weight: 600; }
.upload { display: inline-flex; align-items: center; }
.fb-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.fb-table th { text-align: left; color: #777; font-weight: 500; padding: 8px; border-bottom: 1px solid #1f1f1f; font-size: 11px; text-transform: uppercase; }
.fb-table td { padding: 9px 8px; border-bottom: 1px solid #161616; }
.nm { cursor: pointer; color: #e6e6e6; }
.nm:hover { color: #fff; }
.sz, .dt { color: #888; }
.ops { text-align: right; white-space: nowrap; }
.mini { background: #1a1a1a; border: 1px solid #2a2a2a; color: #bbb; border-radius: 5px; padding: 4px 9px; cursor: pointer; margin-left: 5px; font-size: 12px; }
.mini.del { color: #d9483b; }
.up { cursor: pointer; color: #9a9a9a; }
.empty { color: #666; text-align: center; padding: 24px; }
.err { color: #d9483b; margin-bottom: 10px; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.65); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal { background: #141414; border: 1px solid #2a2a2a; border-radius: 12px; width: 800px; max-width: 94vw; height: 80vh; display: flex; flex-direction: column; }
.modal-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid #232323; }
.modal-head h3 { margin: 0; font-size: 15px; }
.x { background: none; border: none; color: #888; cursor: pointer; font-size: 16px; }
.editor { flex: 1; background: #0a0a0a; border: none; color: #d8d8d8; font-family: 'Consolas', monospace; font-size: 13px; padding: 14px; resize: none; outline: none; }
.modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 18px; border-top: 1px solid #232323; }
</style>
