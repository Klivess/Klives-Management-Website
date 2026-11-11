<template>
  <ProjectsShell>
    <section class="pjx-card pjx-verdict" :data-tone="banned ? 'fault' : 'accent'" aria-label="Accounts summary">
      <span class="pjx-verdict__glyph"><ProjectsIcon name="key" /></span>
      <div class="pjx-verdict__text">
        <h1 class="pjx-verdict__headline">Shared accounts</h1>
        <p class="pjx-verdict__sub">
          <b>{{ accounts.length }}</b> logins on <b>{{ services }}</b> {{ services === 1 ? 'service' : 'services' }} · <b>{{ countBy('Active') }}</b> active<template v-if="banned"> · <b>{{ banned }}</b> banned</template><template v-if="countBy('Dead')"> · {{ countBy('Dead') }} dead</template>.
          Agents sign in with placeholders and never see the secrets.
        </p>
      </div>
      <div class="pjx-verdict__actions">
        <button class="pjx-btn" :disabled="loading" @click="load"><ProjectsIcon name="refresh" :class="{ 'pjx-spin': loading }" />Refresh</button>
      </div>
    </section>

    <div v-if="loadError" class="pjx-banner" data-tone="fault" role="alert"><ProjectsIcon name="alert" /><div class="pjx-banner__body">{{ loadError }}</div></div>

    <section class="pjx-card" aria-label="Accounts">
      <div class="pjx-board__tools">
        <div class="pjx-seg" role="group" aria-label="Account status">
          <button v-for="s in STATUSES" :key="s" class="pjx-seg__opt" :aria-pressed="status === s" @click="status = s">{{ s }} <span class="pjx-seg__count">{{ s === 'All' ? accounts.length : countBy(s) }}</span></button>
        </div>
        <label class="pjx-find" style="min-width: 260px"><ProjectsIcon name="search" /><input v-model="search" type="search" placeholder="Service, login, email or project…" aria-label="Search accounts" /></label>
        <span class="pjx-grow"></span>
        <span class="pjx-dim pjx-num" style="font-size: 12px">{{ filtered.length }} of {{ accounts.length }}</span>
      </div>

      <div v-if="loading && !accounts.length" style="padding: 14px; display: grid; gap: 10px"><div v-for="n in 5" :key="n" class="pjx-skel"></div></div>
      <div v-else-if="!accounts.length && !loadError" class="pjx-empty"><ProjectsIcon name="key" /><b>No accounts yet</b>Agents record logins here as they sign up on external services.</div>
      <div v-else-if="!filtered.length" class="pjx-empty"><ProjectsIcon name="search" /><b>No account matches</b></div>

      <div v-else style="overflow-x: auto">
        <table class="pjx-acct" data-testid="accounts-table">
          <thead>
            <tr><th>Service</th><th>Login</th><th>Secrets</th><th>Used by</th><th>Status</th><th>Activity</th><th v-if="canManage"></th></tr>
          </thead>
          <tbody>
            <tr v-for="a in filtered" :key="a.accountID" :data-status="a.status" :data-account-id="a.accountID">
              <td>
                <div class="pjx-acct__service"><b>{{ a.serviceDisplay || a.serviceKey }}</b><small>{{ a.serviceKey }}</small></div>
              </td>
              <td>
                <div class="pjx-acct__login">
                  <span class="pjx-mono">{{ a.username }}</span>
                  <NuxtLink v-if="isKliveMail(a.email)" :to="`/klivemail?mailbox=${encodeURIComponent(a.email!)}`" :title="`Open the ${a.email} mailbox`"><ProjectsIcon name="mail" /> {{ a.email }}</NuxtLink>
                  <span v-else-if="a.email" class="pjx-dim">{{ a.email }}</span>
                  <span v-if="a.description" class="pjx-acct__notes" :title="a.description">{{ a.description }}</span>
                </div>
              </td>
              <td>
                <span v-if="!a.secrets?.length" class="pjx-faint">none</span>
                <div v-for="s in a.secrets" :key="s.name" class="pjx-secret">
                  <span class="pjx-secret__name">{{ s.name }}</span>
                  <code class="pjx-secret__value" :data-revealed="revealed[key(a, s.name)] ? '' : undefined" :aria-label="`${s.name} for ${a.serviceKey}`">{{ revealed[key(a, s.name)] ?? '••••••••' }}</code>
                  <template v-if="canReveal">
                    <button class="pjx-iconbtn pjx-iconbtn--sm" :disabled="busyKey === key(a, s.name)" :aria-label="`${revealed[key(a, s.name)] ? 'Hide' : 'Reveal'} the ${s.name} for ${a.serviceKey}`" :title="revealed[key(a, s.name)] ? 'Hide' : 'Reveal for 30 seconds'" @click="toggleReveal(a, s.name)"><ProjectsIcon :name="revealed[key(a, s.name)] ? 'eye-off' : 'eye'" /></button>
                    <button class="pjx-iconbtn pjx-iconbtn--sm" :disabled="busyKey === key(a, s.name)" :aria-label="`Copy the ${s.name} for ${a.serviceKey}`" title="Copy the value" @click="copyValue(a, s.name)"><ProjectsIcon :name="copied === `v:${key(a, s.name)}` ? 'check' : 'copy'" /></button>
                  </template>
                  <button class="pjx-iconbtn pjx-iconbtn--sm" :aria-label="`Copy the ${s.name} placeholder for ${a.serviceKey}`" :title="`Copy the placeholder agents use: ${s.placeholder}`" @click="copyText(s.placeholder, `p:${key(a, s.name)}`)"><ProjectsIcon :name="copied === `p:${key(a, s.name)}` ? 'check' : 'bot'" /></button>
                </div>
              </td>
              <td>
                <div class="pjx-owners">
                  <span v-if="!a.owners?.length" class="pjx-faint">nobody yet</span>
                  <template v-for="o in a.owners" :key="o">
                    <NuxtLink v-if="o.startsWith('project:')" :to="`/projects/${o.slice(8)}`" class="pjx-chip pjx-chip--quiet" :title="o">{{ projectNames[o.slice(8)] ?? `project ${o.slice(8, 16)}` }}</NuxtLink>
                    <NuxtLink v-else-if="o === 'KliveAgent'" to="/kliveagent" class="pjx-chip pjx-chip--quiet">KliveAgent</NuxtLink>
                    <span v-else class="pjx-chip pjx-chip--quiet">{{ o }}</span>
                  </template>
                </div>
              </td>
              <td>
                <select v-if="canManage" class="pjx-select" :value="a.status" :aria-label="`Status of ${a.serviceKey} account ${a.username}`" @change="setStatus(a, ($event.target as HTMLSelectElement).value)">
                  <option v-for="s in STATUSES.slice(1)" :key="s" :value="s">{{ s }}</option>
                </select>
                <span v-else class="pjx-chip" :data-tone="a.status === 'Active' ? 'work' : a.status === 'Banned' ? 'fault' : 'rest'">{{ a.status }}</span>
              </td>
              <td class="pjx-dim" style="white-space: nowrap; font-size: 12px">
                <div :title="new Date(a.createdAt).toLocaleString()">made {{ ageShort(a.createdAt, now) }} ago</div>
                <div v-if="a.lastUsedAt" :title="new Date(a.lastUsedAt).toLocaleString()">used {{ ageShort(a.lastUsedAt, now) }} ago</div>
                <div v-if="a.notes" class="pjx-acct__notes" :title="a.notes">{{ a.notes }}</div>
              </td>
              <td v-if="canManage" style="white-space: nowrap; text-align: right">
                <button class="pjx-iconbtn pjx-iconbtn--sm" :aria-label="`Notes for ${a.serviceKey} ${a.username}`" title="Notes" @click="openNotes(a)"><ProjectsIcon name="edit" /></button>
                <button class="pjx-iconbtn pjx-iconbtn--sm" :aria-label="`Delete ${a.serviceKey} ${a.username}`" title="Delete" @click="toDelete = a"><ProjectsIcon name="trash" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="pjx-card__foot">
        <span v-if="canReveal">Revealed secrets hide again after 30 seconds. Every reveal is logged with your profile.</span>
        <span v-else>Your profile can see which accounts exist, not their secrets.</span>
      </footer>
    </section>

    <ProjectsDialog :open="!!notesFor" :title="`Notes · ${notesFor?.serviceKey ?? ''}`" :subtitle="notesFor?.username" @close="notesFor = null">
      <textarea v-model="notesDraft" class="pjx-textarea" rows="6" aria-label="Notes" @keydown.ctrl.enter="saveNotes"></textarea>
      <template #foot>
        <button class="pjx-btn pjx-btn--ghost" @click="notesFor = null">Cancel</button>
        <button class="pjx-btn pjx-btn--primary" :disabled="saving" @click="saveNotes">Save notes</button>
      </template>
    </ProjectsDialog>
    <ProjectsDialog :open="!!toDelete" title="Delete this account record?" :subtitle="toDelete ? `${toDelete.serviceKey} · ${toDelete.username}. Its record and encrypted secrets are removed; the account on the site itself is not touched.` : ''" @close="toDelete = null">
      <template #foot>
        <button class="pjx-btn pjx-btn--ghost" @click="toDelete = null">Cancel</button>
        <button class="pjx-btn pjx-btn--danger" :disabled="saving" @click="confirmDelete"><ProjectsIcon name="trash" />Delete</button>
      </template>
    </ProjectsDialog>
  </ProjectsShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useAccess } from '~/composables/useAccess';
import { pjxGet, pjxPost, usePjxToasts } from '~/composables/useProjectsConsole';
import { ageShort } from '~/scripts/projectsConsole';
import ProjectsShell from '~/components/Projects/Shell.vue';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import ProjectsDialog from '~/components/Projects/Dialog.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Projects · Accounts' });

interface AccountSecret { name: string; value: string; placeholder: string; updatedAt: string }
interface Account {
  accountID: string; serviceKey: string; serviceDisplay: string; username: string;
  email?: string; description?: string; notes?: string; status: string; createdBy?: string;
  owners: string[]; createdAt: string; updatedAt: string; lastUsedAt?: string; secrets: AccountSecret[];
}

const STATUSES = ['All', 'Active', 'Dead', 'Banned'] as const;
const REVEAL_MS = 30_000;

// Viewing the registry and revealing its secrets are separate grants. The server refuses a reveal
// without accounts.secrets.reveal; the page doesn't offer one.
const access = useAccess();
const canReveal = computed(() => access.can('accounts.secrets.reveal'));
const canManage = computed(() => access.can('accounts.registry.manage'));
const { toast } = usePjxToasts();

const accounts = ref<Account[]>([]);
const loading = ref(true);
const loadError = ref('');
const search = ref('');
const status = ref<(typeof STATUSES)[number]>('All');
const now = ref(Date.now());
const projectNames = ref<Record<string, string>>({});

const countBy = (s: string) => accounts.value.filter(a => a.status === s).length;
const banned = computed(() => countBy('Banned'));
const services = computed(() => new Set(accounts.value.map(a => a.serviceKey)).size);
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return accounts.value
    .filter(a => (status.value === 'All' || a.status === status.value)
      && (!q || [a.serviceKey, a.serviceDisplay, a.username, a.email, a.description, a.notes, ...(a.owners ?? []).map(o => projectNames.value[o.slice(8)] ?? o)]
        .some(v => (v || '').toLowerCase().includes(q))))
    .sort((a, b) => Number(a.status !== 'Active') - Number(b.status !== 'Active') || (a.serviceDisplay || a.serviceKey).localeCompare(b.serviceDisplay || b.serviceKey));
});

async function load() {
  loading.value = true;
  loadError.value = '';
  const r = await pjxGet<Account[]>('/accounts/list');
  if (r.ok && Array.isArray(r.body)) accounts.value = r.body;
  else loadError.value = r.status === 403 ? 'Your profile cannot view the account registry.' : `Couldn't load accounts (HTTP ${r.status || 'network'}).`;
  loading.value = false;
  now.value = Date.now();
}
async function loadProjectNames() {
  if (!access.can('projects.overview.view')) return; // owners stay "project 1a2b3c4d" for profiles without Projects
  const r = await pjxGet<{ projectID: string; name: string }[]>('/projects/list');
  if (r.ok && Array.isArray(r.body)) projectNames.value = Object.fromEntries(r.body.map(p => [p.projectID, p.name]));
}

function isKliveMail(email?: string) { return !!email && email.toLowerCase().endsWith('@klive.dev'); }

// ── secrets: one at a time, hidden again after REVEAL_MS ──
const revealed = reactive<Record<string, string>>({});
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const busyKey = ref('');
const copied = ref('');
const key = (a: Account, name: string) => `${a.accountID}/${name}`;

async function fetchSecret(a: Account, name: string): Promise<string | null> {
  busyKey.value = key(a, name);
  const r = await pjxGet<{ value: string }>(`/accounts/secret?accountID=${encodeURIComponent(a.accountID)}&name=${encodeURIComponent(name)}`);
  busyKey.value = '';
  if (r.ok && typeof r.body?.value === 'string') return r.body.value;
  toast(r.status === 403 ? "Your profile can't reveal account secrets." : r.status === 404 ? 'That secret no longer exists.' : `Couldn't read the secret (HTTP ${r.status || 'network'}).`, 'fault', 6000);
  return null;
}
function hide(k: string) { delete revealed[k]; clearTimeout(timers.get(k)); timers.delete(k); }
async function toggleReveal(a: Account, name: string) {
  const k = key(a, name);
  if (revealed[k] !== undefined) { hide(k); return; }
  const value = await fetchSecret(a, name);
  if (value == null) return;
  revealed[k] = value;
  clearTimeout(timers.get(k));
  timers.set(k, setTimeout(() => hide(k), REVEAL_MS));
}
async function copyText(text: string, mark: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = mark;
    setTimeout(() => { if (copied.value === mark) copied.value = ''; }, 1400);
  } catch { toast('The browser blocked the clipboard.', 'need'); }
}
async function copyValue(a: Account, name: string) {
  const k = key(a, name);
  const value = revealed[k] ?? await fetchSecret(a, name);
  if (value != null) await copyText(value, `v:${k}`);
}

// ── management ──
const saving = ref(false);
const notesFor = ref<Account | null>(null);
const notesDraft = ref('');
const toDelete = ref<Account | null>(null);
function openNotes(a: Account) { notesFor.value = a; notesDraft.value = a.notes || ''; }
async function setStatus(a: Account, next: string) {
  const r = await pjxPost('/accounts/update', { accountID: a.accountID, status: next });
  if (r.ok) { a.status = next; toast(`${a.serviceKey} · ${a.username} marked ${next.toLowerCase()}.`, 'work'); }
  else toast(r.error, 'fault', 6000);
}
async function saveNotes() {
  const a = notesFor.value;
  if (!a || saving.value) return;
  saving.value = true;
  const r = await pjxPost('/accounts/update', { accountID: a.accountID, notes: notesDraft.value });
  saving.value = false;
  if (!r.ok) { toast(r.error, 'fault', 6000); return; }
  a.notes = notesDraft.value;
  notesFor.value = null;
}
async function confirmDelete() {
  const a = toDelete.value;
  if (!a || saving.value) return;
  saving.value = true;
  const r = await pjxPost('/accounts/delete', { accountID: a.accountID });
  saving.value = false;
  if (!r.ok) { toast(r.error, 'fault', 6000); return; }
  accounts.value = accounts.value.filter(x => x.accountID !== a.accountID);
  toDelete.value = null;
  toast(`Deleted ${a.serviceKey} · ${a.username}.`, 'work');
}

onMounted(() => { load(); loadProjectNames(); });
onBeforeUnmount(() => { for (const t of timers.values()) clearTimeout(t); });
</script>
