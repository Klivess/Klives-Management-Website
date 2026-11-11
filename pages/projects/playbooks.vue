<template>
  <ProjectsShell :status="`${playbooks.length} site playbook${playbooks.length === 1 ? '' : 's'} shared by every project`">
    <section class="pjx-card pjx-verdict" data-tone="accent" aria-label="Playbooks summary">
      <span class="pjx-verdict__glyph"><ProjectsIcon name="book" /></span>
      <div class="pjx-verdict__text">
        <h1 class="pjx-verdict__headline">Playbooks</h1>
        <p class="pjx-verdict__sub">
          <b>{{ playbooks.length }}</b> {{ playbooks.length === 1 ? 'site' : 'sites' }} · <b>{{ verifiedCount }}</b> verified<template v-if="stale"> · {{ stale }} not confirmed in 30 days</template>.
          Agents write one when a site flow works, and every agent sees it the moment it opens that site.
        </p>
      </div>
      <div class="pjx-verdict__actions">
        <button class="pjx-btn pjx-btn--primary" aria-keyshortcuts="N" @click="edit(null)"><ProjectsIcon name="plus" />New playbook</button>
      </div>
    </section>

    <div v-if="error" class="pjx-banner" data-tone="fault" role="alert">
      <ProjectsIcon name="alert" /><div class="pjx-banner__body"><b>Playbooks could not load</b>{{ error }}</div>
      <div class="pjx-banner__actions"><button class="pjx-btn pjx-btn--sm" @click="load">Retry</button></div>
    </div>

    <section class="pjx-card" aria-label="Playbooks">
      <div class="pjx-board__tools">
        <label class="pjx-find" style="min-width: 260px"><ProjectsIcon name="search" /><input ref="searchInput" v-model="query" type="search" placeholder="Find a site or a step…" aria-label="Search playbooks" /><span class="pjx-kbd">/</span></label>
        <div class="pjx-seg" role="group" aria-label="Verification">
          <button type="button" class="pjx-seg__opt" :aria-pressed="verifiedOnly === false" @click="verifiedOnly = false">All <span class="pjx-seg__count">{{ playbooks.length }}</span></button>
          <button type="button" class="pjx-seg__opt" :aria-pressed="verifiedOnly === true" data-tone="work" @click="verifiedOnly = true">Verified <span class="pjx-seg__count">{{ verifiedCount }}</span></button>
        </div>
        <span class="pjx-grow"></span>
        <span class="pjx-dim pjx-num" style="font-size: 12px">{{ visible.length }} of {{ playbooks.length }}</span>
      </div>

      <div v-if="loading" style="padding: 14px; display: grid; gap: 10px"><div v-for="n in 4" :key="n" class="pjx-skel" style="height: 40px"></div></div>
      <div v-else-if="!playbooks.length" class="pjx-empty"><ProjectsIcon name="book" /><b>No playbooks yet</b>The first time an agent gets through a website flow it saves one here. You can write one too.</div>
      <div v-else-if="!visible.length" class="pjx-empty"><ProjectsIcon name="search" /><b>No playbook matches</b></div>
      <div v-else class="pjx-pbs">
        <button v-for="p in visible" :key="p.domain" class="pjx-pb pb-item" type="button" :data-active="editing?.domain === p.domain && drawerOpen || undefined" @click="edit(p)">
          <span class="pjx-pb__site"><span class="pjx-pb__favicon" aria-hidden="true">{{ p.domain.replace(/^www\./, '').charAt(0) }}</span>{{ p.domain }}</span>
          <span class="pjx-pb__summary">{{ p.summary || 'No summary yet.' }}</span>
          <span class="pjx-pb__meta">
            <span class="pjx-chip" :data-tone="p.verifiedAt ? (isOld(p.verifiedAt, now, 24 * 30) ? 'need' : 'work') : 'rest'">{{ p.verifiedAt ? `verified ${ageShort(p.verifiedAt, now)} ago` : 'unverified' }}</span>
            <span class="pjx-chip pjx-chip--quiet">{{ p.steps.length }} {{ p.steps.length === 1 ? 'step' : 'steps' }}</span>
            <span v-if="p.pitfalls.length" class="pjx-chip" data-tone="need">{{ p.pitfalls.length }} {{ p.pitfalls.length === 1 ? 'pitfall' : 'pitfalls' }}</span>
            <span class="pjx-pb__by">{{ p.updatedBy || 'unknown' }} · {{ ageShort(p.updatedAt, now) }} ago · rev {{ p.revisions }}</span>
          </span>
        </button>
      </div>
      <footer class="pjx-card__foot"><span><span class="pjx-kbd">/</span> find · <span class="pjx-kbd">N</span> new playbook</span></footer>
    </section>

    <Teleport to="body">
      <template v-if="drawerOpen">
        <div class="pjx-layer pjx-scrim" @click="drawerOpen = false"></div>
        <aside class="pjx-layer pjx-sheet" role="dialog" aria-modal="true" :aria-label="editing ? `${editing.domain} playbook` : 'New playbook'" @keydown.esc="drawerOpen = false">
          <header class="pjx-sheet__head">
            <div class="pjx-sheet__titles">
              <div class="pjx-sheet__title">{{ editing ? editing.domain : 'New playbook' }}</div>
              <div class="pjx-sheet__sub">{{ editing ? `Revision ${editing.revisions} · last by ${editing.updatedBy}` : 'Shared with every project the moment you save it' }}</div>
            </div>
            <button class="pjx-iconbtn" aria-label="Close" @click="drawerOpen = false"><ProjectsIcon name="x" /></button>
          </header>
          <form class="pjx-sheet__body pjx-pb-form" @submit.prevent="save" @keydown.ctrl.enter.prevent="save">
            <div class="pjx-field">
              <label for="pb-domain">Site</label>
              <input id="pb-domain" ref="domainInput" v-model="form.domain" class="pjx-input pjx-mono" placeholder="example.com" :readonly="!!editing" required />
              <span class="pjx-hint">The site's host. A playbook for example.com also covers its subdomains unless they have their own.</span>
            </div>
            <div class="pjx-field">
              <label for="pb-summary">Summary</label>
              <textarea id="pb-summary" v-model="form.summary" class="pjx-textarea" rows="3" placeholder="What this site is for in our work, and the shortest path through it." style="min-height: 70px"></textarea>
            </div>
            <div class="pjx-field">
              <label for="pb-steps">What worked — one step per line</label>
              <textarea id="pb-steps" v-model="form.steps" class="pjx-textarea" rows="7"></textarea>
            </div>
            <div class="pjx-field">
              <label for="pb-pitfalls">Pitfalls — one per line</label>
              <textarea id="pb-pitfalls" v-model="form.pitfalls" class="pjx-textarea" rows="4" style="min-height: 76px"></textarea>
            </div>
            <div class="pjx-field">
              <label for="pb-urls">Key URLs — one per line, as "label | https://…"</label>
              <textarea id="pb-urls" v-model="form.urls" class="pjx-textarea pjx-mono" rows="4" style="min-height: 76px"></textarea>
            </div>
            <label class="pjx-check"><input v-model="form.verified" type="checkbox" /> I just confirmed this works</label>
            <p v-if="formError" class="pjx-note" data-tone="fault" role="alert">{{ formError }}</p>
          </form>
          <footer class="pjx-sheet__foot">
            <button v-if="editing" class="pjx-btn pjx-btn--danger" style="margin-right: auto" :disabled="saving" @click="confirmDelete = true"><ProjectsIcon name="trash" />Delete</button>
            <span class="pjx-dim" style="font-size: 11.5px; align-self: center"><span class="pjx-kbd">Ctrl</span> <span class="pjx-kbd">Enter</span></span>
            <button class="pjx-btn pjx-btn--ghost" @click="drawerOpen = false">Cancel</button>
            <button class="pjx-btn pjx-btn--primary" :disabled="saving || !form.domain.trim()" @click="save">{{ saving ? 'Saving…' : 'Save playbook' }}</button>
          </footer>
        </aside>
      </template>
    </Teleport>

    <ProjectsDialog :open="confirmDelete" :title="`Delete the ${editing?.domain} playbook?`" subtitle="Every agent in every project stops seeing it on that site. An agent writes a new one the next time a flow there works." @close="confirmDelete = false">
      <template #foot>
        <button class="pjx-btn pjx-btn--ghost" @click="confirmDelete = false">Keep it</button>
        <button class="pjx-btn pjx-btn--danger" :disabled="saving" @click="remove"><ProjectsIcon name="trash" />Delete for every project</button>
      </template>
    </ProjectsDialog>
  </ProjectsShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import ProjectsShell from '~/components/Projects/Shell.vue';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import ProjectsDialog from '~/components/Projects/Dialog.vue';
import { pjGet, pjPost } from '~/composables/useProjectsUi';
import { usePjxToasts } from '~/composables/useProjectsConsole';
import { ageShort, isOld } from '~/scripts/projectsConsole';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Playbooks · Projects' });

interface Playbook {
  domain: string; summary: string; steps: string[]; pitfalls: string[];
  urls: { label: string; url: string }[]; updatedBy: string; updatedAt: string; verifiedAt: string | null; revisions: number;
}

const { toast } = usePjxToasts();
const playbooks = ref<Playbook[]>([]);
const loading = ref(true);
const error = ref('');
const query = ref('');
const verifiedOnly = ref(false);
const drawerOpen = ref(false);
const confirmDelete = ref(false);
const editing = ref<Playbook | null>(null);
const saving = ref(false);
const formError = ref('');
const now = ref(Date.now());
const searchInput = ref<HTMLInputElement | null>(null);
const domainInput = ref<HTMLInputElement | null>(null);
const form = reactive({ domain: '', summary: '', steps: '', pitfalls: '', urls: '', verified: false });

const verifiedCount = computed(() => playbooks.value.filter(p => !!p.verifiedAt).length);
const stale = computed(() => playbooks.value.filter(p => p.verifiedAt && isOld(p.verifiedAt, now.value, 24 * 30)).length);
const visible = computed(() => {
  const q = query.value.trim().toLowerCase();
  return playbooks.value
    .filter(p => !verifiedOnly.value || !!p.verifiedAt)
    .filter(p => !q || [p.domain, p.summary, ...p.steps, ...p.pitfalls].some(x => (x || '').toLowerCase().includes(q)))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.domain.localeCompare(b.domain));
});

async function load() {
  const list = await pjGet<Playbook[]>('/projects/playbooks');
  if (Array.isArray(list)) { playbooks.value = list; error.value = ''; }
  else if (!playbooks.value.length) error.value = 'The Projects API did not return the playbook list.';
  loading.value = false;
  now.value = Date.now();
}

async function edit(p: Playbook | null) {
  editing.value = p;
  formError.value = '';
  form.domain = p?.domain ?? '';
  form.summary = p?.summary ?? '';
  form.steps = (p?.steps ?? []).join('\n');
  form.pitfalls = (p?.pitfalls ?? []).join('\n');
  form.urls = (p?.urls ?? []).map(u => `${u.label} | ${u.url}`).join('\n');
  form.verified = false;
  drawerOpen.value = true;
  if (!p) { await nextTick(); domainInput.value?.focus(); }
}

const lines = (text: string) => text.split('\n').map(x => x.trim()).filter(Boolean);

async function save() {
  if (saving.value || !form.domain.trim()) return;
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
    toast(`Saved the ${form.domain.trim()} playbook for every project.`, 'work');
    await load();
  } catch (e: any) { formError.value = e?.message || 'Save failed.'; }
  finally { saving.value = false; }
}

async function remove() {
  if (!editing.value) return;
  const domain = editing.value.domain;
  saving.value = true;
  try {
    await pjPost('/projects/playbooks/delete', { domain });
    confirmDelete.value = false;
    drawerOpen.value = false;
    toast(`Deleted the ${domain} playbook.`, 'work');
    await load();
  } catch (e: any) { formError.value = e?.message || 'Delete failed.'; confirmDelete.value = false; }
  finally { saving.value = false; }
}

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
  if (e.ctrlKey || e.metaKey || e.altKey || drawerOpen.value || confirmDelete.value) return;
  if (document.querySelector('.pjx-layer.pjx-palette')) return;
  if (e.key === '/') { e.preventDefault(); searchInput.value?.focus(); }
  else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); edit(null); }
}
onMounted(() => { load(); window.addEventListener('keydown', onKey); });
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>
