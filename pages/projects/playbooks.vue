<template>
  <ProjectsShell :status="`${playbooks.length} site playbook${playbooks.length === 1 ? '' : 's'} shared by every project`">
    <div class="ot-pagehead">
      <div>
        <h1>Playbooks</h1>
        <p class="subtitle">How to get through each website — the steps that worked, the URLs that matter, the traps to avoid. Agents write them when a site flow succeeds, and every agent in every project sees one automatically when it navigates there.</p>
      </div>
      <div class="ot-actions">
        <button class="ot-btn primary" @click="edit(null)">New playbook</button>
      </div>
    </div>

    <div v-if="error" class="ot-banner" role="alert">
      <span class="glyph" aria-hidden="true">⚠</span><div><strong>Playbooks could not load</strong>{{ error }}</div>
      <div class="actions"><button class="ot-btn sm" @click="load">Retry</button></div>
    </div>

    <div class="ot-filterbar">
      <div class="ot-search">
        <span class="glyph" aria-hidden="true">⌕</span>
        <input v-model="query" class="ot-input" type="search" placeholder="Find a site or a step…" aria-label="Search playbooks" />
      </div>
      <div class="ot-segment sm" role="group" aria-label="Verification">
        <button type="button" :aria-pressed="verifiedOnly === false" @click="verifiedOnly = false">All</button>
        <button type="button" :aria-pressed="verifiedOnly === true" @click="verifiedOnly = true">Verified</button>
      </div>
      <span class="grow"></span>
      <span class="summary">Showing <b>{{ visible.length }}</b> of {{ playbooks.length }}</span>
    </div>

    <div v-if="loading" class="ot-skelrows"><div v-for="n in 4" :key="n" class="ot-skel" style="height:64px"></div></div>
    <OmniTraderStateBlock v-else-if="!playbooks.length" kind="empty" title="No playbooks yet"
      detail="The first time an agent gets through a website flow it saves one here. You can also write one yourself." />
    <OmniTraderStateBlock v-else-if="!visible.length" kind="filtered" />
    <div v-else class="pb-list">
      <button v-for="p in visible" :key="p.domain" class="pb-item" type="button" @click="edit(p)">
        <span class="pb-domain">{{ p.domain }}</span>
        <span class="pb-summary">{{ p.summary || 'No summary yet.' }}</span>
        <span class="pb-meta">
          <span class="ot-chip" :class="p.verifiedAt ? 'ok' : ''">{{ p.verifiedAt ? `verified ${pjAgo(p.verifiedAt)}` : 'unverified' }}</span>
          <span class="ot-chip">{{ p.steps.length }} step{{ p.steps.length === 1 ? '' : 's' }}</span>
          <span v-if="p.pitfalls.length" class="ot-chip warn">{{ p.pitfalls.length }} pitfall{{ p.pitfalls.length === 1 ? '' : 's' }}</span>
          <span class="pj-muted">by {{ p.updatedBy || 'unknown' }} · {{ pjAgo(p.updatedAt) }} · rev {{ p.revisions }}</span>
        </span>
      </button>
    </div>

    <OmniTraderDrawer :open="drawerOpen" :title="editing ? editing.domain : 'New playbook'"
      :subtitle="editing ? `Revision ${editing.revisions} · ${editing.updatedBy}` : 'Shared with every project the moment you save it'"
      @close="drawerOpen = false">
      <form class="pb-form" @submit.prevent="save">
        <div class="ot-field">
          <label for="pb-domain">Site</label>
          <input id="pb-domain" v-model="form.domain" class="ot-input mono" placeholder="example.com" :readonly="!!editing" required />
          <span class="help">The site's host. A playbook for example.com also covers its subdomains unless they have their own.</span>
        </div>
        <div class="ot-field">
          <label for="pb-summary">Summary</label>
          <textarea id="pb-summary" v-model="form.summary" class="ot-input" rows="3" placeholder="What this site is for in our work, and the shortest path through it."></textarea>
        </div>
        <div class="ot-field">
          <label for="pb-steps">What worked — one step per line</label>
          <textarea id="pb-steps" v-model="form.steps" class="ot-input" rows="7"></textarea>
        </div>
        <div class="ot-field">
          <label for="pb-pitfalls">Pitfalls — one per line</label>
          <textarea id="pb-pitfalls" v-model="form.pitfalls" class="ot-input" rows="4"></textarea>
        </div>
        <div class="ot-field">
          <label for="pb-urls">Key URLs — one per line, as "label | https://…"</label>
          <textarea id="pb-urls" v-model="form.urls" class="ot-input mono" rows="4"></textarea>
        </div>
        <label class="ot-check"><input v-model="form.verified" type="checkbox" /> I just confirmed this works</label>
        <p v-if="formError" class="pb-error" role="alert">{{ formError }}</p>
      </form>
      <template #footer>
        <button v-if="editing" class="ot-btn danger sm" :disabled="saving" @click="remove">Delete</button>
        <span class="grow"></span>
        <button class="ot-btn ghost" @click="drawerOpen = false">Cancel</button>
        <button class="ot-btn primary" :disabled="saving || !form.domain.trim()" @click="save">{{ saving ? 'Saving…' : 'Save playbook' }}</button>
      </template>
    </OmniTraderDrawer>
  </ProjectsShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import ProjectsShell from '~/components/Projects/Shell.vue';
import { pjAgo, pjGet, pjPost } from '~/composables/useProjectsUi';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Playbooks · Projects' });

interface Playbook {
  domain: string; summary: string; steps: string[]; pitfalls: string[];
  urls: { label: string; url: string }[]; updatedBy: string; updatedAt: string; verifiedAt: string | null; revisions: number;
}

const playbooks = ref<Playbook[]>([]);
const loading = ref(true);
const error = ref('');
const query = ref('');
const verifiedOnly = ref(false);
const drawerOpen = ref(false);
const editing = ref<Playbook | null>(null);
const saving = ref(false);
const formError = ref('');
const form = reactive({ domain: '', summary: '', steps: '', pitfalls: '', urls: '', verified: false });

const visible = computed(() => {
  const q = query.value.trim().toLowerCase();
  return playbooks.value
    .filter(p => !verifiedOnly.value || !!p.verifiedAt)
    .filter(p => !q || [p.domain, p.summary, ...p.steps, ...p.pitfalls].some(x => (x || '').toLowerCase().includes(q)));
});

async function load() {
  const list = await pjGet<Playbook[]>('/projects/playbooks');
  if (Array.isArray(list)) { playbooks.value = list; error.value = ''; }
  else if (!playbooks.value.length) error.value = 'The Projects API did not return the playbook list.';
  loading.value = false;
}

function edit(p: Playbook | null) {
  editing.value = p;
  formError.value = '';
  form.domain = p?.domain ?? '';
  form.summary = p?.summary ?? '';
  form.steps = (p?.steps ?? []).join('\n');
  form.pitfalls = (p?.pitfalls ?? []).join('\n');
  form.urls = (p?.urls ?? []).map(u => `${u.label} | ${u.url}`).join('\n');
  form.verified = false;
  drawerOpen.value = true;
}

const lines = (text: string) => text.split('\n').map(x => x.trim()).filter(Boolean);

async function save() {
  saving.value = true;
  formError.value = '';
  try {
    const urls = lines(form.urls).map(line => {
      const [label, ...rest] = line.split('|');
      const url = (rest.length ? rest.join('|') : label).trim();
      return { label: rest.length ? label.trim() : 'link', url };
    });
    await pjPost('/projects/playbooks/save', {
      domain: form.domain.trim(), summary: form.summary.trim(), steps: lines(form.steps),
      pitfalls: lines(form.pitfalls), urls, verified: form.verified,
    });
    drawerOpen.value = false;
    await load();
  } catch (e: any) { formError.value = e?.message || 'Save failed.'; }
  finally { saving.value = false; }
}

async function remove() {
  if (!editing.value || !confirm(`Delete the ${editing.value.domain} playbook for every project?`)) return;
  saving.value = true;
  try {
    await pjPost('/projects/playbooks/delete', { domain: editing.value.domain });
    drawerOpen.value = false;
    await load();
  } catch (e: any) { formError.value = e?.message || 'Delete failed.'; }
  finally { saving.value = false; }
}

onMounted(load);
</script>

<style scoped>
.pb-list { display: flex; flex-direction: column; gap: var(--ot-space-2); }
.pb-item { display: grid; grid-template-columns: minmax(140px, 220px) minmax(0, 1fr); gap: var(--ot-space-1) var(--ot-space-4); text-align: left;
  padding: var(--ot-space-3) var(--ot-card-pad); border: 1px solid var(--ot-line); border-radius: var(--ot-radius); background: var(--ot-surface); cursor: pointer; color: inherit; width: 100%; }
.pb-item:hover { border-color: var(--ot-line-strong); background: var(--ot-surface-2); }
.pb-domain { font-family: var(--ot-mono); font-weight: 600; color: var(--ot-accent); overflow-wrap: anywhere; grid-row: span 2; }
.pb-summary { font-size: 13px; color: var(--ot-text); }
.pb-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ot-space-2); font-size: 11.5px; }
.pb-form { display: flex; flex-direction: column; gap: var(--ot-space-4); }
.pb-error { color: var(--ot-negative); margin: 0; font-size: 12.5px; }
.grow { flex: 1 1 auto; }
@media (max-width: 720px) { .pb-item { grid-template-columns: minmax(0, 1fr); } .pb-domain { grid-row: auto; } }
</style>
