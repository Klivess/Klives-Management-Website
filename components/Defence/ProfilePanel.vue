<template>
  <div>
    <div class="odx-filters" role="search" aria-label="Filter profile actions">
      <label class="odx-field" style="max-width: 220px">
        <DefenceIcon name="user" />
        <input v-model="draft.profile" placeholder="Profile" spellcheck="false" @input="debounced" />
      </label>
      <label class="odx-field" style="max-width: 220px">
        <DefenceIcon name="tag" />
        <input v-model="draft.category" placeholder="Category (exact)" spellcheck="false" @input="debounced" />
      </label>
      <div v-if="categories.length" class="odx-seg" role="group" aria-label="Category">
        <button v-for="c in categories" :key="c.name" class="odx-seg__opt" :aria-pressed="draft.category === c.name" @click="draft.category = draft.category === c.name ? '' : c.name; apply()">
          {{ c.name }} <span class="odx-seg__count">{{ c.count }}</span>
        </button>
      </div>
      <div class="odx-filters__end">
        <span class="odx-filters__count">{{ rows.length ? `${fmtInt(filter.offset + 1)}–${fmtInt(filter.offset + rows.length)}` : 'No rows' }}</span>
        <button v-if="canExport" class="odx-btn odx-btn--sm odx-btn--ghost" @click="emit('export')"><DefenceIcon name="download" />CSV</button>
      </div>
    </div>
    <div class="odx-table-wrap" :data-busy="busy || undefined">
      <table class="odx-table" data-testid="profile-table">
        <thead><tr><th style="width: 92px">Time</th><th>Profile</th><th>Category</th><th>Action</th><th>Address</th><th>Detail</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td class="odx-num" :title="fmtFull(row.ts)">{{ fmtStamp(row.ts, now) }}</td>
            <td>{{ row.profile || '—' }}</td>
            <td><span class="odx-chip">{{ row.category }}</span></td>
            <td>{{ row.action }}</td>
            <td><button v-if="row.ip" class="odx-ip-link" @click="emit('open', row.ip)">{{ row.ip }}</button></td>
            <td class="route" :title="row.detail || ''">{{ row.detail || '' }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!rows.length" class="odx-empty"><DefenceIcon :name="error ? 'alert' : 'inbox'" /><span>{{ error || (busy ? 'Reading profile actions…' : 'No actions match.') }}</span></div>
    </div>
    <div class="odx-pager">
      <button class="odx-btn odx-btn--sm odx-btn--ghost" :disabled="filter.offset === 0" @click="emit('page', -1)"><DefenceIcon name="chevron-left" />Newer</button>
      <span>Newest first · {{ PROFILE_LIMIT }} a page</span>
      <button class="odx-btn odx-btn--sm odx-btn--ghost" :disabled="rows.length < PROFILE_LIMIT" @click="emit('page', 1)">Older<DefenceIcon name="chevron-right" /></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, watch } from 'vue';
import { PROFILE_LIMIT, type ProfileFilter } from '~/composables/useOmniDefence';
import { fmtFull, fmtInt, fmtStamp, type DefenceProfileAction } from '~/scripts/omniDefence';

/** What signed-in profiles did: settings changed, files shared, agents started. */
const props = defineProps<{ rows: DefenceProfileAction[]; filter: ProfileFilter; busy: boolean; error?: string; now: number; canExport: boolean }>();
const emit = defineEmits<{ apply: [filter: ProfileFilter]; page: [direction: number]; open: [ip: string]; export: [] }>();

const draft = reactive<ProfileFilter>({ ...props.filter });
watch(() => props.filter, value => Object.assign(draft, value), { deep: true });

/** The categories on this page, most common first, as one-click filters. */
const categories = computed(() => {
  const counts = new Map<string, number>();
  for (const row of props.rows) if (row.category) counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  const list = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, count }));
  if (draft.category && !list.some(c => c.name === draft.category)) list.unshift({ name: draft.category, count: props.rows.length });
  return list;
});

let timer: number | null = null;
function debounced() { if (timer != null) window.clearTimeout(timer); timer = window.setTimeout(apply, 380); }
function apply() { if (timer != null) { window.clearTimeout(timer); timer = null; } emit('apply', { ...draft, offset: 0 }); }
onBeforeUnmount(() => { if (timer != null) window.clearTimeout(timer); });
</script>
