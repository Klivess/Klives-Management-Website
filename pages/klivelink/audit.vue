<template>
  <div class="ot-os kl-global">
    <div class="ot-pagehead">
      <div><h1><span class="code">AUD</span>Fleet audit</h1><p class="subtitle">Commands, connections and purges across the fleet.</p></div>
      <div class="ot-actions"><NuxtLink to="/klivelink" class="ot-btn ghost">Fleet</NuxtLink><button class="ot-btn ghost" @click="load">Refresh</button></div>
    </div>
    <section class="ot-card">
      <div class="body flush">
        <table class="ot-table">
          <thead><tr><th>Time</th><th>Agent</th><th>Action</th><th>Actor</th><th>Detail</th></tr></thead>
          <tbody>
            <tr v-for="row in rows" :key="row.Id">
              <td :title="row.Timestamp">{{ new Date(row.Timestamp).toLocaleString() }}</td>
              <td class="mono">{{ row.AgentId || '—' }}</td><td class="mono">{{ row.Action }}</td>
              <td>{{ row.Actor || '—' }}</td><td class="truncate mono">{{ JSON.stringify(row.Detail) }}</td>
            </tr>
            <tr v-if="!rows.length"><td colspan="5" class="muted">No audit entries.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';
definePageMeta({ layout: 'navbar' });
useHead({ title: 'KliveLink · Audit' });
const rows = ref<any[]>([]);
async function load() {
  const res = await RequestGETFromKliveAPI('/klivelink/v2/audit?limit=1000');
  rows.value = res.ok ? await res.json() : [];
}
onMounted(load);
</script>

<style scoped>
.kl-global { padding: var(--ot-space-4) var(--ot-space-6) 64px; }
.ot-pagehead h1 { display: flex; gap: 10px; align-items: baseline; }
.ot-pagehead h1 .code { font-family: var(--ot-mono); font-size: 13px; color: var(--ot-accent); }
.truncate { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
