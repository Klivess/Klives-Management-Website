<template>
  <div class="accounts-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Shared Accounts</h1>
        <p class="page-subtitle">Global registry — accounts agents created on external services, shared across every project + KliveAgent</p>
      </div>
      <div class="header-actions">
        <label class="reveal-toggle">
          <input type="checkbox" v-model="reveal" @change="load" />
          <span>Reveal secrets</span>
        </label>
        <button class="ghost-btn" @click="load">↻ Refresh</button>
        <NuxtLink to="/projects" class="ghost-btn">← Projects</NuxtLink>
      </div>
    </div>

    <div v-if="loading" class="info-banner">Loading accounts…</div>
    <div v-else-if="loadError" class="error-banner">{{ loadError }}</div>
    <div v-else-if="!accounts.length" class="empty-banner">
      No accounts registered yet. Agents record accounts here as they sign up on external services.
    </div>

    <div v-else class="accounts-grid">
      <div v-for="a in accounts" :key="a.accountID" class="account-card" :class="statusClass(a.status)">
        <div class="card-head">
          <div class="svc">
            <span class="svc-name">{{ a.serviceDisplay || a.serviceKey }}</span>
            <span class="svc-key">{{ a.serviceKey }}</span>
          </div>
          <span class="status-pill" :class="statusClass(a.status)">{{ a.status }}</span>
        </div>

        <div class="row"><span class="k">Username</span><span class="v">{{ a.username }}</span></div>
        <div class="row" v-if="a.email">
          <span class="k">Email</span>
          <span class="v">
            <NuxtLink v-if="isKliveMail(a.email)" :to="`/klivemail?mailbox=${encodeURIComponent(a.email)}`" class="mail-link">{{ a.email }} ✉</NuxtLink>
            <template v-else>{{ a.email }}</template>
          </span>
        </div>
        <div class="row" v-if="a.description"><span class="k">Purpose</span><span class="v">{{ a.description }}</span></div>

        <div class="secrets" v-if="a.secrets && a.secrets.length">
          <div v-for="s in a.secrets" :key="s.name" class="secret-row">
            <span class="s-name">{{ s.name }}</span>
            <code class="s-val">{{ reveal ? s.value : '••••••' }}</code>
            <button class="copy-btn" title="Copy placeholder" @click="copy(s.placeholder)">{{ copied === s.placeholder ? '✓' : '⧉' }}</button>
          </div>
        </div>

        <div class="owners" v-if="a.owners && a.owners.length">
          <span v-for="o in a.owners" :key="o" class="owner-chip">
            <NuxtLink v-if="o.startsWith('project:')" :to="`/projects/${o.slice(8)}`">{{ o }}</NuxtLink>
            <NuxtLink v-else-if="o === 'KliveAgent'" to="/kliveagent">KliveAgent</NuxtLink>
            <template v-else>{{ o }}</template>
          </span>
        </div>

        <div class="meta">
          <span>created {{ fmt(a.createdAt) }}</span>
          <span v-if="a.lastUsedAt">· last used {{ fmt(a.lastUsedAt) }}</span>
          <span v-if="a.createdBy">· by {{ a.createdBy }}</span>
        </div>

        <div v-if="a.notes" class="notes">{{ a.notes }}</div>

        <div class="card-actions">
          <select :value="a.status" @change="setStatus(a, ($event.target as HTMLSelectElement).value)">
            <option value="Active">Active</option>
            <option value="Dead">Dead</option>
            <option value="Banned">Banned</option>
          </select>
          <button class="ghost-btn" @click="editNotes(a)">Notes</button>
          <button class="danger-btn" @click="del(a)">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import Swal from 'sweetalert2';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

definePageMeta({ layout: 'navbar' });

interface AccountSecret { name: string; value: string; placeholder: string; updatedAt: string; }
interface Account {
  accountID: string; serviceKey: string; serviceDisplay: string; username: string;
  email?: string; description?: string; notes?: string; status: string; createdBy?: string;
  owners: string[]; createdAt: string; updatedAt: string; lastUsedAt?: string; secrets: AccountSecret[];
}

const accounts = ref<Account[]>([]);
const loading = ref(true);
const loadError = ref('');
const reveal = ref(false);
const copied = ref('');

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const r = await RequestGETFromKliveAPI(`/accounts/list${reveal.value ? '?revealSensitive=true' : ''}`, false, false);
    if (r.ok) accounts.value = await r.json();
    else loadError.value = `Couldn't load accounts (HTTP ${r.status}).`;
  } catch { loadError.value = 'Network error loading accounts.'; }
  finally { loading.value = false; }
}

function isKliveMail(email?: string) { return !!email && email.toLowerCase().endsWith('@klive.dev'); }
function statusClass(s: string) { return 's-' + (s || '').toLowerCase(); }
function fmt(d?: string) { return d ? new Date(d).toLocaleDateString() : ''; }

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); copied.value = text; setTimeout(() => { if (copied.value === text) copied.value = ''; }, 1200); } catch { /* clipboard blocked */ }
}

async function setStatus(a: Account, status: string) {
  const res = await RequestPOSTFromKliveAPI('/accounts/update', JSON.stringify({ accountID: a.accountID, status }), false, true);
  if (res.ok) a.status = status; else Swal.fire('Update failed', `HTTP ${res.status}`, 'error');
}

async function editNotes(a: Account) {
  const { value, isConfirmed } = await Swal.fire({
    title: `Notes — ${a.serviceKey}`, input: 'textarea', inputValue: a.notes || '',
    showCancelButton: true, confirmButtonText: 'Save',
  });
  if (!isConfirmed) return;
  const res = await RequestPOSTFromKliveAPI('/accounts/update', JSON.stringify({ accountID: a.accountID, notes: value || '' }), false, true);
  if (res.ok) a.notes = value || ''; else Swal.fire('Update failed', `HTTP ${res.status}`, 'error');
}

async function del(a: Account) {
  const { isConfirmed } = await Swal.fire({
    title: 'Delete account?', text: `${a.serviceKey} · ${a.username} — this removes its record and encrypted secrets.`,
    icon: 'warning', showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#c0392b',
  });
  if (!isConfirmed) return;
  const res = await RequestPOSTFromKliveAPI('/accounts/delete', JSON.stringify({ accountID: a.accountID }), false, true);
  if (res.ok) accounts.value = accounts.value.filter(x => x.accountID !== a.accountID);
  else Swal.fire('Delete failed', `HTTP ${res.status}`, 'error');
}

onMounted(load);
</script>

<style scoped lang="scss">
.accounts-page { padding: 24px; max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.page-title { font-size: 1.6rem; margin: 0; }
.page-subtitle { color: #888; margin: 4px 0 0; font-size: 0.9rem; }
.header-actions { display: flex; gap: 10px; align-items: center; }
.reveal-toggle { display: flex; gap: 6px; align-items: center; color: #aaa; font-size: 0.85rem; cursor: pointer; }
.ghost-btn, .danger-btn { background: #1f1f23; border: 1px solid #333; color: #ddd; padding: 6px 12px; border-radius: 8px; cursor: pointer; text-decoration: none; font-size: 0.85rem; }
.ghost-btn:hover { border-color: #4d9e39; }
.danger-btn { border-color: #5a2a2a; color: #e08585; }
.danger-btn:hover { background: #3a1e1e; }

.info-banner, .error-banner, .empty-banner { padding: 16px; border-radius: 10px; background: #161519; color: #aaa; }
.error-banner { color: #e08585; }

.accounts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
.account-card { background: #161519; border: 1px solid #26262c; border-left: 3px solid #4d9e39; border-radius: 12px; padding: 16px; }
.account-card.s-dead { border-left-color: #777; opacity: 0.75; }
.account-card.s-banned { border-left-color: #c0392b; }

.card-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.svc-name { font-weight: 600; font-size: 1.05rem; }
.svc-key { display: block; color: #777; font-size: 0.78rem; }
.status-pill { font-size: 0.72rem; padding: 2px 8px; border-radius: 20px; background: #24351e; color: #7fc35f; text-transform: uppercase; letter-spacing: 0.04em; }
.status-pill.s-dead { background: #2a2a2a; color: #999; }
.status-pill.s-banned { background: #3a1e1e; color: #e08585; }

.row { display: flex; gap: 8px; font-size: 0.88rem; margin: 3px 0; }
.row .k { color: #777; min-width: 72px; }
.row .v { color: #ddd; word-break: break-word; }
.mail-link { color: #6cc0e0; text-decoration: none; }
.mail-link:hover { text-decoration: underline; }

.secrets { margin: 10px 0; border-top: 1px solid #24242a; padding-top: 8px; }
.secret-row { display: flex; align-items: center; gap: 8px; margin: 3px 0; }
.s-name { color: #999; font-size: 0.8rem; min-width: 72px; }
.s-val { background: #0f0f12; padding: 2px 8px; border-radius: 6px; color: #cbb; font-size: 0.82rem; flex: 1; overflow-x: auto; white-space: nowrap; }
.copy-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 0.95rem; }
.copy-btn:hover { color: #4d9e39; }

.owners { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.owner-chip { background: #1f1f23; border: 1px solid #303036; border-radius: 20px; padding: 2px 10px; font-size: 0.75rem; }
.owner-chip a { color: #9ac; text-decoration: none; }

.meta { color: #666; font-size: 0.76rem; display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.notes { margin-top: 8px; padding: 8px; background: #0f0f12; border-radius: 8px; color: #b0b0b0; font-size: 0.83rem; white-space: pre-wrap; }

.card-actions { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
.card-actions select { background: #1f1f23; border: 1px solid #333; color: #ddd; padding: 5px 8px; border-radius: 8px; font-size: 0.82rem; }
</style>
