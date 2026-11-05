<template>
  <div class="ot-os kl-global">
    <div class="ot-pagehead">
      <div><h1><span class="code">COL</span>Collection search</h1><p class="subtitle">Every record from every agent, filtered locally after one read.</p></div>
      <div class="ot-actions"><NuxtLink to="/klivelink" class="ot-btn ghost">Fleet</NuxtLink><button class="ot-btn ghost" @click="load">Refresh</button></div>
    </div>
    <div class="ot-filterbar">
      <input v-model="query" class="ot-input auto" type="search" placeholder="Search name, source, user, URL, category…" />
      <span class="grow"></span><span class="summary">{{ filtered.length }} of {{ records.length }}</span>
    </div>
    <section class="ot-card">
      <div class="body flush">
        <table class="ot-table">
          <thead><tr><th>Agent</th><th>Category</th><th>Name</th><th>User</th><th>Source</th><th>Expiry</th></tr></thead>
          <tbody>
            <tr v-for="r in filtered" :key="r.RecordId">
              <td class="mono">{{ r.AgentId }}</td><td><span class="ot-chip">{{ r.Category }}</span></td>
              <td>{{ r.Name }}</td><td>{{ r.Username || '—' }}</td>
              <td class="truncate" :title="r.SourcePath">{{ r.SourcePath }}</td>
              <td>{{ r.ExpiresAt ? new Date(r.ExpiresAt).toLocaleDateString() : '—' }}</td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="6" class="muted">No collection records found.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';
definePageMeta({ layout: 'navbar' });
useHead({ title: 'KliveLink · Collection search' });
const records = ref<any[]>([]);
const query = ref('');
const filtered = computed(() => {
  const q = query.value.toLowerCase().trim();
  if (!q) return records.value;
  return records.value.filter(r => [r.AgentId, r.Category, r.Name, r.Username, r.SourcePath, r.Url]
    .some(v => String(v || '').toLowerCase().includes(q)));
});
async function load() {
  const res = await RequestGETFromKliveAPI('/klivelink/v2/collection/records?limit=2000');
  records.value = res.ok ? await res.json() : [];
}
onMounted(load);
</script>

<style scoped>
.kl-global { padding: var(--ot-space-4) var(--ot-space-6) 64px; }
.ot-pagehead h1 { display: flex; gap: 10px; align-items: baseline; }
.ot-pagehead h1 .code { font-family: var(--ot-mono); font-size: 13px; color: var(--ot-accent); }
.ot-filterbar .auto { flex: 1 1 360px; }
.truncate { max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
