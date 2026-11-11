<template>
  <div class="kax-page" data-testid="kax-library">
    <div class="kax-page__inner">
      <div class="kax-page__head">
        <div>
          <h2 class="kax-page__title">Library</h2>
          <p class="kax-page__sub">What KliveAgent remembers, the recipes it saved, and what it can reach.</p>
        </div>
        <div class="kax-page__tools">
          <label class="kax-searchbox" style="width: 280px">
            <KliveAgentIcon name="search" />
            <input ref="searchEl" v-model="text" class="kax-input" type="search" :placeholder="placeholder" data-testid="lib-search" @keydown.enter="tab === 'memories' && recall()" />
          </label>
          <button v-if="tab === 'memories' && canManage" class="kax-btn kax-btn--sm" type="button" data-testid="lib-add" @click="adding = !adding"><KliveAgentIcon name="plus" />Remember something</button>
        </div>
      </div>

      <section class="kax-card">
        <nav class="kax-tabs" role="tablist" aria-label="Library">
          <button v-for="t in tabs" :key="t.id" class="kax-tab" type="button" role="tab" :aria-selected="tab === t.id" :data-testid="`lib-tab-${t.id}`" @click="tab = t.id">
            <KliveAgentIcon :name="t.icon" />{{ t.label }}<span class="kax-tab__count">{{ t.count ?? '' }}</span>
          </button>
        </nav>

        <!-- memories -->
        <template v-if="tab === 'memories'">
          <form v-if="adding" class="kax-filters" style="flex-direction: column; align-items: stretch" @submit.prevent="addMemory">
            <textarea v-model="draft.content" class="kax-input" rows="3" placeholder="A fact KliveAgent should keep, in one or two sentences" data-autofocus data-testid="lib-add-content"></textarea>
            <div style="display: flex; gap: 8px">
              <input v-model="draft.tags" class="kax-input" placeholder="tags, comma separated" />
              <button class="kax-btn kax-btn--primary" type="submit" :disabled="!draft.content.trim() || saving" data-testid="lib-add-save">{{ saving ? 'Saving…' : 'Save' }}</button>
            </div>
          </form>
          <div class="kax-filters">
            <div class="kax-seg" role="group" aria-label="Written by">
              <button v-for="s in SOURCES" :key="s.id" class="kax-seg__opt" type="button" :aria-pressed="source === s.id" @click="source = s.id">{{ s.label }}<span class="kax-seg__count">{{ sourceCount(s.id) }}</span></button>
            </div>
            <div class="kax-tags">
              <button v-for="t in topTags" :key="t.tag" class="kax-tag" type="button" :aria-pressed="tags.includes(t.tag)" @click="toggleTag(t.tag)">{{ t.tag }}<b>{{ t.count }}</b></button>
            </div>
            <span v-if="recalled" class="kax-chip" data-tone="info">recalled for “{{ recalled }}” <button class="kax-iconbtn kax-iconbtn--sm" type="button" aria-label="Clear" @click="clearRecall"><KliveAgentIcon name="x" /></button></span>
          </div>
          <div v-if="loading.memories" class="kax-loading">Reading memories…</div>
          <div v-else-if="!visibleMemories.length" class="kax-empty"><KliveAgentIcon name="memory" />{{ memories.length ? 'Nothing matches these filters.' : 'No memories.' }}</div>
          <div v-else class="kax-items">
            <div v-for="m in visibleMemories.slice(0, shownCount)" :key="m.id" class="kax-item" data-testid="lib-memory">
              <span class="kax-item__title">{{ m.title || plainText(m.content, 80) }}</span>
              <span class="kax-item__actions">
                <button class="kax-iconbtn kax-iconbtn--sm" type="button" title="Copy" aria-label="Copy" @click="copy(m.content)"><KliveAgentIcon name="copy" /></button>
                <button v-if="canManage" class="kax-iconbtn kax-iconbtn--sm" type="button" title="Forget this" aria-label="Forget this" data-testid="lib-delete" @click="emit('delete', m)"><KliveAgentIcon name="trash" /></button>
              </span>
              <p class="kax-item__text" :data-clamped="!expanded.has(m.id)" @click="toggle(m.id)">{{ m.content }}</p>
              <div class="kax-item__meta">
                <span class="kax-chip" :data-tone="m.source === 'projects' ? 'info' : m.source === 'user' ? 'accent' : 'neutral'">{{ m.source || 'agent' }}</span>
                <span v-if="m.memoryType" class="kax-chip" data-tone="neutral">{{ m.memoryType }}</span>
                <span v-for="t in (m.tags || []).slice(0, 6)" :key="t">#{{ t }}</span>
                <span style="margin-left: auto">{{ shortWhen(m.createdAt, now) }}</span>
              </div>
            </div>
            <button v-if="visibleMemories.length > shownCount" class="kax-btn kax-btn--sm kax-btn--ghost" type="button" style="margin: 8px auto 12px" @click="shownCount += 60">Show {{ Math.min(60, visibleMemories.length - shownCount) }} more of {{ visibleMemories.length - shownCount }}</button>
          </div>
        </template>

        <!-- shortcuts -->
        <template v-else-if="tab === 'shortcuts'">
          <div v-if="loading.shortcuts" class="kax-loading">Reading shortcuts…</div>
          <div v-else-if="!visibleShortcuts.length" class="kax-empty"><KliveAgentIcon name="bolt" />{{ shortcuts.length ? 'Nothing matches.' : 'KliveAgent saves shortcuts as it learns reusable recipes.' }}</div>
          <div v-else class="kax-items">
            <div v-for="s in visibleShortcuts" :key="s.id" class="kax-item" data-testid="lib-shortcut">
              <span class="kax-item__title">{{ s.title || 'Untitled' }}</span>
              <span class="kax-item__actions">
                <button class="kax-iconbtn kax-iconbtn--sm" type="button" title="Copy" aria-label="Copy" @click="copy(s.content)"><KliveAgentIcon name="copy" /></button>
                <button v-if="canManage" class="kax-iconbtn kax-iconbtn--sm" type="button" title="Delete" aria-label="Delete" @click="emit('delete', s)"><KliveAgentIcon name="trash" /></button>
              </span>
              <p class="kax-item__text" :data-clamped="!expanded.has(s.id)" @click="toggle(s.id)">{{ s.content }}</p>
              <div class="kax-item__meta"><span v-for="t in (s.tags || []).slice(0, 6)" :key="t">#{{ t }}</span><span style="margin-left: auto">{{ shortWhen(s.createdAt, now) }}</span></div>
            </div>
          </div>
        </template>

        <!-- capabilities -->
        <template v-else-if="tab === 'capabilities'">
          <div v-if="loading.capabilities" class="kax-loading">Reading capabilities…</div>
          <div v-else class="kax-tablewrap" style="padding: 4px 8px 10px">
            <table class="kax-table">
              <thead><tr><th>Capability</th><th>What it does</th><th>Tier</th><th></th></tr></thead>
              <tbody>
                <template v-for="group in capabilityGroups" :key="group.category">
                  <tr><td colspan="4" class="kax-rail__group" style="padding-top: 12px">{{ group.category }} · {{ group.items.length }}</td></tr>
                  <tr v-for="c in group.items" :key="c.name">
                    <td class="kax-mono" style="white-space: nowrap">{{ c.name }}</td>
                    <td class="kax-dim">{{ c.description }}</td>
                    <td><span class="kax-chip" :data-tone="tierTone(c.permissionTier)">{{ c.permissionTier }}</span></td>
                    <td><span v-if="c.requiresConfirmation" class="kax-chip" data-tone="warn" :title="c.confirmationMessage">asks first</span></td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </template>

        <!-- service tools -->
        <template v-else>
          <div v-if="loading.tools" class="kax-loading">Reading the service surface…</div>
          <div v-else class="kax-items">
            <div v-for="s in visibleServices" :key="s.key" class="kax-item">
              <span class="kax-item__title">{{ s.displayName || s.key }}</span>
              <span class="kax-item__meta" style="grid-column: auto">
                <span class="kax-chip" data-tone="neutral">{{ s.operations?.length ?? 0 }} operations</span>
                <span v-if="mutating(s)" class="kax-chip" data-tone="warn">{{ mutating(s) }} change things</span>
                <span v-if="destructive(s)" class="kax-chip" data-tone="crit">{{ destructive(s) }} destructive</span>
              </span>
              <p v-if="s.summary" class="kax-item__text" data-clamped="true">{{ s.summary }}</p>
              <div class="kax-item__meta"><span v-for="op in (s.operations || []).slice(0, 12)" :key="op.op" class="kax-mono" :title="op.description">{{ op.op }}</span></div>
            </div>
            <div class="kax-item">
              <span class="kax-item__title">Recent operations</span>
              <span></span>
              <div v-if="!audit.length" class="kax-item__text kax-dim">None since the last restart (the audit is kept in memory).</div>
              <div v-else class="kax-tablewrap" style="grid-column: 1 / -1">
                <table class="kax-table">
                  <thead><tr><th>When</th><th>Operation</th><th>Result</th><th class="kax-num">Time</th></tr></thead>
                  <tbody><tr v-for="(a, i) in audit" :key="i"><td>{{ shortWhen(a.atUtc, now) }}</td><td class="kax-mono">{{ a.service }}.{{ a.op }}</td><td><span class="kax-chip" :data-tone="a.success ? 'ok' : 'crit'">{{ a.success ? 'ok' : a.error || 'failed' }}</span></td><td class="kax-num">{{ fmtMs(a.durationMs) }}</td></tr></tbody>
                </table>
              </div>
            </div>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { copyToClipboard } from '~/scripts/agentMarkdown';
import { fmtInt, fmtMs, plainText, shortWhen } from '~/scripts/agentConsole';
import KliveAgentIcon from '~/components/KliveAgent/Icon.vue';

type LibTab = 'memories' | 'shortcuts' | 'capabilities' | 'tools';

const props = defineProps<{ canManage: boolean; canRead: boolean; now: number; query?: string }>();
const emit = defineEmits<{ delete: [item: any]; notify: [tone: 'ok' | 'crit' | 'info', text: string] }>();

const tab = ref<LibTab>('memories');
const text = ref(props.query ?? '');
const searchEl = ref<HTMLInputElement | null>(null);
const memories = ref<any[]>([]);
const shortcuts = ref<any[]>([]);
const capabilities = ref<any[]>([]);
const services = ref<any[]>([]);
const audit = ref<any[]>([]);
const loading = reactive({ memories: false, shortcuts: false, capabilities: false, tools: false });
const loaded = reactive(new Set<LibTab>());
const expanded = ref(new Set<string>());
const tags = ref<string[]>([]);
const source = ref<'all' | 'agent' | 'projects' | 'user'>('all');
const shownCount = ref(60);
const recalled = ref('');
const adding = ref(false);
const saving = ref(false);
const draft = reactive({ content: '', tags: '' });

const SOURCES = [{ id: 'all', label: 'All' }, { id: 'agent', label: 'Agent' }, { id: 'projects', label: 'Projects' }, { id: 'user', label: 'You' }] as const;

const tabs = computed(() => [
  { id: 'memories' as const, label: 'Memories', icon: 'memory', count: loaded.has('memories') ? memories.value.length : null },
  { id: 'shortcuts' as const, label: 'Shortcuts', icon: 'bolt', count: loaded.has('shortcuts') ? shortcuts.value.length : null },
  { id: 'capabilities' as const, label: 'Capabilities', icon: 'wrench', count: loaded.has('capabilities') ? capabilities.value.length : null },
  { id: 'tools' as const, label: 'Service tools', icon: 'terminal', count: loaded.has('tools') ? services.value.length : null },
]);
const placeholder = computed(() => (tab.value === 'memories' ? 'Filter, or Enter to ask KliveAgent’s recall' : 'Filter'));

async function getJson(path: string) {
  const res = await RequestGETFromKliveAPI(path, false, false);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function load(which: LibTab, force = false) {
  if (!props.canRead || (!force && loaded.has(which))) return;
  loading[which] = true;
  try {
    if (which === 'memories') memories.value = toList(await getJson('/kliveagent/memories'));
    else if (which === 'shortcuts') shortcuts.value = toList(await getJson('/kliveagent/shortcuts'));
    else if (which === 'capabilities') capabilities.value = toList(await getJson('/kliveagent/capabilities'));
    else {
      const [surface, recent] = await Promise.all([getJson('/kliveagent/servicetools'), getJson('/kliveagent/servicetools/audit?limit=50').catch(() => [])]);
      services.value = Array.isArray(surface?.services) ? surface.services : [];
      audit.value = toList(recent);
    }
    loaded.add(which);
  } catch (error: any) {
    emit('notify', 'crit', `Could not read ${which}: ${error?.message ?? error}`);
  } finally {
    loading[which] = false;
  }
}
const toList = (value: unknown) => (Array.isArray(value) ? value : []);
watch(tab, which => { void load(which); shownCount.value = 60; }, { immediate: true });

async function recall() {
  const q = text.value.trim();
  if (!q) return clearRecall();
  loading.memories = true;
  try {
    memories.value = toList(await getJson(`/kliveagent/memories?query=${encodeURIComponent(q)}`));
    recalled.value = q;
    text.value = '';
  } catch (error: any) {
    emit('notify', 'crit', `Recall failed: ${error?.message ?? error}`);
  } finally {
    loading.memories = false;
  }
}
function clearRecall() { recalled.value = ''; void load('memories', true); }

const sourceCount = (id: string) => (id === 'all' ? memories.value.length : memories.value.filter(m => (m.source || 'agent') === id).length);
const topTags = computed(() => {
  const counts = new Map<string, number>();
  memories.value.forEach(m => (m.tags || []).forEach((t: string) => counts.set(t, (counts.get(t) ?? 0) + 1)));
  return [...counts.entries()].map(entry => ({ tag: entry[0], count: entry[1] })).sort((a, b) => b.count - a.count).slice(0, 14);
});
function toggleTag(tag: string) { tags.value = tags.value.includes(tag) ? tags.value.filter(t => t !== tag) : [...tags.value, tag]; }
const needle = computed(() => text.value.trim().toLowerCase());
const matches = (item: any) => !needle.value || `${item.title ?? ''} ${item.content ?? ''} ${(item.tags || []).join(' ')}`.toLowerCase().includes(needle.value);
const visibleMemories = computed(() => memories.value
  .filter(m => source.value === 'all' || (m.source || 'agent') === source.value)
  .filter(m => !tags.value.length || tags.value.every(t => (m.tags || []).includes(t)))
  .filter(matches)
  .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))));
const visibleShortcuts = computed(() => shortcuts.value.filter(matches));
const capabilityGroups = computed(() => {
  const groups = new Map<string, any[]>();
  capabilities.value
    .filter(c => !needle.value || `${c.name} ${c.displayName ?? ''} ${c.description ?? ''} ${c.category ?? ''}`.toLowerCase().includes(needle.value))
    .forEach(c => { const key = c.category || 'Other'; groups.set(key, [...(groups.get(key) ?? []), c]); });
  return [...groups.keys()].sort().map(category => ({ category, items: groups.get(category)! }));
});
const visibleServices = computed(() => services.value.filter(s => !needle.value || `${s.key} ${s.displayName ?? ''} ${s.summary ?? ''}`.toLowerCase().includes(needle.value)));
const mutating = (s: any) => (s.operations || []).filter((o: any) => o.mutating).length;
const destructive = (s: any) => (s.operations || []).filter((o: any) => o.destructive).length;
const tierTone = (tier: string) => ({ Glance: 'neutral', Read: 'info', Act: 'accent', Manage: 'warn', Critical: 'crit' } as Record<string, string>)[tier] ?? 'neutral';

function toggle(id: string) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  expanded.value = next;
}
async function copy(value: string) { await copyToClipboard(value); emit('notify', 'ok', 'Copied'); }

async function addMemory() {
  if (!draft.content.trim()) return;
  saving.value = true;
  try {
    const res = await RequestPOSTFromKliveAPI('/kliveagent/memories/add', JSON.stringify({
      content: draft.content.trim(), tags: draft.tags.split(',').map(t => t.trim()).filter(Boolean), importance: 1,
    }), true, true);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    draft.content = '';
    draft.tags = '';
    adding.value = false;
    emit('notify', 'ok', 'Remembered');
    await load('memories', true);
  } catch (error: any) {
    emit('notify', 'crit', `Could not save the memory: ${error?.message ?? error}`);
  } finally {
    saving.value = false;
  }
}

/** Called by the page after it deleted something from here. */
function removed(id: string) {
  memories.value = memories.value.filter(m => m.id !== id);
  shortcuts.value = shortcuts.value.filter(s => s.id !== id);
}

defineExpose({ removed, focus: () => searchEl.value?.focus(), setQuery: (q: string) => { tab.value = 'memories'; text.value = q; } });
</script>
