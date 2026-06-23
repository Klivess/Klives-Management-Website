<template>
  <div class="bp">
    <div class="bp-head">
      <p class="muted">Snapshots of the entire server folder. Restore requires the server to be stopped.</p>
      <button class="btn primary" :disabled="creating" @click="create">{{ creating ? 'Backing up…' : '＋ Create Backup' }}</button>
    </div>

    <div v-if="!backups.length" class="empty">No backups yet.</div>
    <table v-else class="bp-table">
      <thead><tr><th>Backup</th><th>Size</th><th>Created</th><th></th></tr></thead>
      <tbody>
        <tr v-for="b in backups" :key="b.Id">
          <td>{{ b.Id }}</td>
          <td>{{ fmtSize(b.SizeBytes) }}</td>
          <td>{{ fmtDate(b.CreatedUtc) }}</td>
          <td class="ops">
            <button class="mini" @click="download(b)">↓</button>
            <button class="mini" @click="restore(b)">Restore</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="note" class="note" :class="{ err: noteErr }">{{ note }}</p>
  </div>
</template>

<script>
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

export default {
  name: 'KliveGamesBackupsPanel',
  props: { id: { type: String, required: true } },
  data() { return { backups: [], creating: false, note: '', noteErr: false }; },
  mounted() { this.load(); },
  methods: {
    async load() {
      try {
        const res = await RequestGETFromKliveAPI(`/klivegames/backups/list?id=${this.id}`);
        const data = await res.json();
        if (data.success) this.backups = data.backups || [];
      } catch (e) { /* ignore */ }
    },
    async create() {
      this.creating = true; this.note = '';
      try {
        const res = await RequestPOSTFromKliveAPI('/klivegames/backups/create', JSON.stringify({ id: this.id }), true, true);
        const data = await res.json();
        if (data.success) { this.flash('Backup created.'); await this.load(); }
        else this.flash(data.error || 'Backup failed.', true);
      } catch (e) { this.flash('Backup failed.', true); }
      finally { this.creating = false; }
    },
    async restore(b) {
      if (!confirm(`Restore ${b.Id}? This overwrites the current world. The server must be stopped.`)) return;
      try {
        const res = await RequestPOSTFromKliveAPI('/klivegames/backups/restore', JSON.stringify({ id: this.id, backupId: b.Id }), true, true);
        const data = await res.json();
        this.flash(data.success ? 'Restored.' : (data.error || 'Restore failed.'), !data.success);
      } catch (e) { this.flash('Restore failed.', true); }
    },
    async download(b) {
      const res = await RequestGETFromKliveAPI(`/klivegames/backups/download?id=${this.id}&backupId=${encodeURIComponent(b.Id)}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = b.Id; a.click();
      URL.revokeObjectURL(url);
    },
    flash(msg, err = false) { this.note = msg; this.noteErr = err; setTimeout(() => (this.note = ''), 5000); },
    fmtSize(b) { if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB'; if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB'; return (b / 1024).toFixed(0) + ' KB'; },
    fmtDate(d) { try { return new Date(d).toLocaleString(); } catch (e) { return ''; } },
  },
};
</script>

<style scoped>
.bp { color: #fff; }
.bp-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.muted { color: #888; font-size: 13px; max-width: 60%; }
.btn { background: #1d1d1d; border: 1px solid #2c2c2c; color: #ddd; border-radius: 8px; padding: 9px 16px; cursor: pointer; }
.btn.primary { background: #4d9e39; border-color: #4d9e39; color: #fff; font-weight: 600; }
.btn.primary:disabled { opacity: .5; }
.empty { color: #777; padding: 30px; text-align: center; }
.bp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.bp-table th { text-align: left; color: #777; padding: 8px; border-bottom: 1px solid #1f1f1f; font-size: 11px; text-transform: uppercase; }
.bp-table td { padding: 10px 8px; border-bottom: 1px solid #161616; color: #ccc; }
.ops { text-align: right; }
.mini { background: #1a1a1a; border: 1px solid #2a2a2a; color: #ccc; border-radius: 5px; padding: 5px 11px; cursor: pointer; margin-left: 6px; font-size: 12px; }
.mini:hover { border-color: #4d9e39; }
.note { color: #4d9e39; margin-top: 12px; font-size: 13px; }
.note.err { color: #d9483b; }
</style>
