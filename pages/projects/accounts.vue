<template>
  <ProjectsShell>
    <div class="ot-pagehead">
      <div>
        <h1>Shared accounts</h1>
        <p class="subtitle">Accounts agents created on external services — one registry shared by every project and KliveAgent. Secrets stay encrypted; agents use them through placeholders.</p>
      </div>
      <div class="ot-actions">
        <label class="ot-check"><input v-model="reveal" type="checkbox" @change="load" /> Reveal secrets</label>
        <button class="ot-btn ghost" :disabled="loading" @click="load">↻ Refresh</button>
      </div>
    </div>

    <section class="ot-kpis tight" aria-label="Account summary">
      <OmniTraderKpi label="Accounts" :value="String(accounts.length)" :loading="loading && !accounts.length" />
      <OmniTraderKpi label="Active" :value="String(countBy('Active'))" tone="good" :loading="loading && !accounts.length" />
      <OmniTraderKpi label="Dead or banned" :value="String(countBy('Dead') + countBy('Banned'))" :tone="countBy('Banned') ? 'bad' : ''" :loading="loading && !accounts.length" />
      <OmniTraderKpi label="Services" :value="String(services)" :loading="loading && !accounts.length" />
    </section>

    <div class="ot-filterbar">
      <div class="ot-search"><span class="glyph" aria-hidden="true">⌕</span><input v-model="search" class="ot-input" type="search" placeholder="Service, username, email or owner…" aria-label="Search accounts" /></div>
      <div class="ot-segment sm" role="group" aria-label="Account status">
        <button v-for="s in ['All', 'Active', 'Dead', 'Banned']" :key="s" type="button" :aria-pressed="status === s" @click="status = s">{{ s }}</button>
      </div>
      <span class="grow"></span>
      <span class="summary"><b>{{ filtered.length }}</b> of {{ accounts.length }}</span>
    </div>

    <div v-if="loadError" class="ot-banner warn" role="alert"><span class="glyph" aria-hidden="true">⚠</span><div>{{ loadError }}</div></div>

    <div v-if="loading && !accounts.length" class="ot-card"><div class="ot-skelrows"><div v-for="n in 4" :key="n" class="ot-skel"></div></div></div>
    <OmniTraderStateBlock v-else-if="!accounts.length && !loadError" kind="empty" title="No accounts registered yet"
      detail="Agents record accounts here as they sign up on external services." />
    <OmniTraderStateBlock v-else-if="!filtered.length && accounts.length" kind="filtered" title="No matching accounts" />

    <div v-else class="ac-grid">
      <article v-for="a in filtered" :key="a.accountID" class="ot-card ac-card" :class="statusClass(a.status)">
        <header>
          <div class="titles">
            <h2>{{ a.serviceDisplay || a.serviceKey }}</h2>
            <p class="subtitle pj-mono">{{ a.serviceKey }}</p>
          </div>
          <span class="ot-chip" :class="statusTone(a.status)">{{ a.status }}</span>
        </header>
        <div class="body">
          <dl class="ot-kv">
            <dt>Username</dt><dd class="pj-mono">{{ a.username }}</dd>
            <template v-if="a.email">
              <dt>Email</dt>
              <dd>
                <NuxtLink v-if="isKliveMail(a.email)" :to="`/klivemail?mailbox=${encodeURIComponent(a.email)}`" class="pj-link">{{ a.email }} ✉</NuxtLink>
                <template v-else>{{ a.email }}</template>
              </dd>
            </template>
            <template v-if="a.description"><dt>Purpose</dt><dd>{{ a.description }}</dd></template>
          </dl>

          <div v-if="a.secrets && a.secrets.length" class="ac-secrets">
            <div v-for="s in a.secrets" :key="s.name" class="ac-secret">
              <span class="ac-secret-name">{{ s.name }}</span>
              <code class="ac-secret-val">{{ reveal ? s.value : '••••••' }}</code>
              <button class="ot-btn ghost sm" :aria-label="`Copy the ${s.name} placeholder`" title="Copy placeholder" @click="copy(s.placeholder)">{{ copied === s.placeholder ? '✓ Copied' : '⧉' }}</button>
            </div>
          </div>

          <div v-if="a.owners && a.owners.length" class="ac-owners">
            <span v-for="o in a.owners" :key="o" class="ot-chip">
              <NuxtLink v-if="o.startsWith('project:')" :to="`/projects/${o.slice(8)}`" class="pj-link">{{ o }}</NuxtLink>
              <NuxtLink v-else-if="o === 'KliveAgent'" to="/kliveagent" class="pj-link">KliveAgent</NuxtLink>
              <template v-else>{{ o }}</template>
            </span>
          </div>

          <p class="ac-meta">
            created {{ fmt(a.createdAt) }}<span v-if="a.lastUsedAt"> · last used {{ fmt(a.lastUsedAt) }}</span><span v-if="a.createdBy"> · by {{ a.createdBy }}</span>
          </p>
          <p v-if="a.notes" class="ac-notes">{{ a.notes }}</p>
        </div>
        <footer class="ac-actions">
          <select class="ot-select auto" :value="a.status" :aria-label="`Status of ${a.serviceKey} account ${a.username}`" @change="setStatus(a, ($event.target as HTMLSelectElement).value)">
            <option value="Active">Active</option>
            <option value="Dead">Dead</option>
            <option value="Banned">Banned</option>
          </select>
          <button class="ot-btn ghost sm" @click="editNotes(a)">Notes</button>
          <button class="ot-btn danger sm" @click="del(a)">Delete</button>
        </footer>
      </article>
    </div>
  </ProjectsShell>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import Swal from 'sweetalert2';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import ProjectsShell from '~/components/Projects/Shell.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Projects · Accounts' });

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
const search = ref('');
const status = ref('All');

const countBy = (s: string) => accounts.value.filter(a => a.status === s).length;
const services = computed(() => new Set(accounts.value.map(a => a.serviceKey)).size);
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return accounts.value.filter(a => (status.value === 'All' || a.status === status.value)
    && (!q || [a.serviceKey, a.serviceDisplay, a.username, a.email, a.description, ...(a.owners ?? [])]
      .some(v => (v || '').toLowerCase().includes(q))));
});

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const r = await RequestGETFromKliveAPI(`/accounts/list${reveal.value ? '?revealSensitive=true' : ''}`, false, false);
    const body = r.ok ? await r.json() : null;
    if (Array.isArray(body)) accounts.value = body;
    else loadError.value = r.ok ? 'The server returned something other than an account list.' : `Couldn't load accounts (HTTP ${r.status}).`;
  } catch { loadError.value = 'Network error loading accounts.'; }
  finally { loading.value = false; }
}

function isKliveMail(email?: string) { return !!email && email.toLowerCase().endsWith('@klive.dev'); }
function statusClass(s: string) { return 's-' + (s || '').toLowerCase(); }
function statusTone(s: string) { return s === 'Active' ? 'ok' : s === 'Banned' ? 'bad' : ''; }
function fmt(d?: string) { return d ? new Date(d).toLocaleDateString() : ''; }

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); copied.value = text; setTimeout(() => { if (copied.value === text) copied.value = ''; }, 1200); } catch { /* clipboard blocked */ }
}

async function setStatus(a: Account, next: string) {
  const res = await RequestPOSTFromKliveAPI('/accounts/update', JSON.stringify({ accountID: a.accountID, status: next }), false, true);
  if (res.ok) a.status = next; else Swal.fire('Update failed', `HTTP ${res.status}`, 'error');
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

<style scoped>
.grow { flex: 1 1 auto; }
.ac-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: var(--ot-gutter); }
.ac-card { border-left: 3px solid var(--ot-accent); }
.ac-card.s-dead { border-left-color: var(--ot-line-strong); opacity: 0.78; }
.ac-card.s-banned { border-left-color: var(--ot-negative); }
.ac-card > .body { display: flex; flex-direction: column; gap: var(--ot-space-3); }
.ac-card :deep(.ot-kv) dd { overflow-wrap: anywhere; }
.ac-secrets { display: flex; flex-direction: column; gap: var(--ot-space-1); border-top: 1px solid var(--ot-line); padding-top: var(--ot-space-2); }
.ac-secret { display: flex; align-items: center; gap: var(--ot-space-2); }
.ac-secret-name { color: var(--ot-muted); font-size: 12px; min-width: 76px; }
.ac-secret-val { flex: 1; min-width: 0; overflow-x: auto; white-space: nowrap; font-family: var(--ot-mono); font-size: 12px; color: var(--ot-text-2); background: rgba(0, 0, 0, 0.3); border: 1px solid var(--ot-line); border-radius: var(--ot-radius-sm); padding: 2px 8px; }
.ac-owners { display: flex; flex-wrap: wrap; gap: var(--ot-space-1); }
.ac-meta { margin: 0; color: var(--ot-muted); font-size: 11.5px; }
.ac-notes { margin: 0; padding: var(--ot-space-2); background: rgba(0, 0, 0, 0.25); border-radius: var(--ot-radius-sm); color: var(--ot-text-2); font-size: 12.5px; white-space: pre-wrap; }
.ac-actions { display: flex; gap: var(--ot-space-2); align-items: center; }
</style>
