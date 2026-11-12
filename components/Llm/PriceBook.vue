<template>
  <section class="llx-card" data-testid="llx-pricebook">
    <header class="llx-card__head">
      <h2 class="llx-card__title"><LlmIcon name="coins" />Price book</h2>
      <span class="llx-card__meta">{{ entries.length }} prices · used to cost calls whose router reports no cost, and for list-price equivalents</span>
      <div class="llx-card__tools">
        <label class="llx-field llx-field--inline llx-field--search"><LlmIcon name="search" /><input v-model="query" class="llx-input" placeholder="Find a model" aria-label="Find a price" /></label>
        <button v-if="canEdit" class="llx-btn llx-btn--sm" :disabled="c.busy.value.prices" data-testid="prices-refresh" @click="refresh"><LlmIcon name="refresh" />Read OpenRouter prices</button>
        <button v-if="canEdit" class="llx-btn llx-btn--sm" data-testid="prices-add" @click="addRow()"><LlmIcon name="plus" />Add a price</button>
      </div>
    </header>

    <div v-if="missing.length" class="llx-banner" data-tone="warn" data-testid="prices-missing">
      <LlmIcon name="alert" />
      <span>{{ missing.length }} model{{ missing.length === 1 ? '' : 's' }} used in the last 30 days {{ missing.length === 1 ? 'has' : 'have' }} no price, so {{ missing.length === 1 ? 'its' : 'their' }} cost shows as nothing:
        <template v-for="(m, i) in missing.slice(0, 6)" :key="`${m.router}|${m.model}`">
          <button v-if="canEdit" class="llx-link llx-mono" @click="addRow(m.router, m.model)">{{ m.model }}</button><span v-else class="llx-mono">{{ m.model }}</span>
          <span class="llx-dim"> ({{ m.router }}, {{ llmCompact(m.tokens) }} tokens){{ i < Math.min(5, missing.length - 1) ? ', ' : '' }}</span>
        </template>
        <template v-if="missing.length > 6"> and {{ missing.length - 6 }} more</template>
      </span>
    </div>

    <div class="llx-tablewrap llx-tablewrap--scroll">
      <table class="llx-table llx-prices">
        <thead>
          <tr><th class="l">Router</th><th class="l">Model</th><th>Input $/MTok</th><th>Cached input</th><th>Cache write</th><th>Output $/MTok</th><th class="l">Source</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.key" :data-edited="edits.has(row.key) || undefined" :data-testid="`price-${row.model}`">
            <td class="l">
              <select v-if="row.isNew" v-model="row.router" class="llx-select llx-select--sm" aria-label="Router">
                <option value="*">any router</option>
                <option v-for="r in routers" :key="r.id" :value="r.id">{{ r.name }}</option>
              </select>
              <span v-else class="llx-dim">{{ row.router === '*' ? 'any' : row.router }}</span>
            </td>
            <td class="l">
              <input v-if="row.isNew" v-model.trim="row.model" class="llx-input llx-input--sm llx-mono" placeholder="model id" aria-label="Model" />
              <span v-else class="llx-mono llx-truncate">{{ row.model }}</span>
            </td>
            <td v-for="f in FIELDS" :key="f" class="llx-num">
              <input v-if="canEdit" :value="row[f] ?? ''" class="llx-input llx-input--sm llx-input--num" type="number" min="0" step="0.001" :aria-label="`${row.model} ${f}`"
                     @change="edit(row, f, ($event.target as HTMLInputElement).value)" />
              <span v-else>{{ row[f] != null ? `$${row[f]}` : '—' }}</span>
            </td>
            <td class="l llx-dim">{{ row.source }}<template v-if="row.updatedUtc"> · {{ llmAgo(row.updatedUtc, c.now.value) }}</template></td>
            <td><button v-if="canEdit && !row.isNew" class="llx-iconbtn llx-iconbtn--sm" :aria-label="`Remove the price for ${row.model}`" @click="removeRow(row)"><LlmIcon name="trash" /></button>
              <button v-else-if="row.isNew" class="llx-iconbtn llx-iconbtn--sm" aria-label="Discard this row" @click="added = added.filter(a => a !== row)"><LlmIcon name="x" /></button></td>
          </tr>
          <tr v-if="!rows.length"><td colspan="8" class="llx-empty">{{ data ? 'No price matches.' : 'Reading the price book…' }}</td></tr>
        </tbody>
      </table>
    </div>
    <div v-if="dirty" class="llx-form__actions llx-pricebook__save">
      <span class="llx-dim">{{ edits.size + added.filter(a => a.model).length }} unsaved</span>
      <button class="llx-btn llx-btn--sm" @click="discard">Discard</button>
      <button class="llx-btn llx-btn--sm llx-btn--primary" :disabled="c.busy.value.prices" data-testid="prices-save" @click="save">Save prices</button>
    </div>
    <p class="llx-note">An “any router” price covers a model on every router without its own; OpenRouter’s catalogue prices cover the rest. Blank cached or cache-write prices are billed as input.</p>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, reactive, ref } from 'vue';
import type { KliveLlmConsole } from '~/composables/useKliveLlm';
import { llmAgo, llmCompact } from '~/scripts/kliveLlm';

const props = defineProps<{ data: any | null; canEdit: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const c = inject<KliveLlmConsole>('llx')!;

const FIELDS = ['inputPerMTok', 'cachedInputPerMTok', 'cacheWritePerMTok', 'outputPerMTok'] as const;
type Field = (typeof FIELDS)[number];
const routers = computed<any[]>(() => c.routing.value?.routers ?? []);
const entries = computed<any[]>(() => props.data?.entries ?? []);
const missing = computed<any[]>(() => (props.data?.missing ?? []).filter((m: any) => m.billing !== 'Free').sort((a: any, b: any) => b.tokens - a.tokens));

const query = ref('');
const edits = reactive(new Map<string, any>());
const added = ref<any[]>([]);
const keyOf = (router: string, model: string) => `${router}|${model}`.toLowerCase();

const rows = computed(() => {
  const words = query.value.toLowerCase().split(/\s+/).filter(Boolean);
  const list = entries.value
    .map(e => ({ ...e, ...(edits.get(keyOf(e.router, e.model)) ?? {}), key: keyOf(e.router, e.model), isNew: false }))
    .filter(e => words.every(w => `${e.router} ${e.model}`.toLowerCase().includes(w)))
    .slice(0, 400);
  return [...added.value, ...list];
});
const dirty = computed(() => edits.size > 0 || added.value.some(a => a.model));

function edit(row: any, field: Field, text: string) {
  const value = text.trim() === '' ? null : Number(text);
  if (value != null && (!Number.isFinite(value) || value < 0)) return;
  if (row.isNew) { row[field] = value; return; }
  const current = edits.get(row.key) ?? { router: row.router, model: row.model, inputPerMTok: row.inputPerMTok, cachedInputPerMTok: row.cachedInputPerMTok, cacheWritePerMTok: row.cacheWritePerMTok, outputPerMTok: row.outputPerMTok };
  current[field] = value;
  edits.set(row.key, current);
}
function addRow(router = '*', model = '') {
  added.value = [reactive({ key: `new-${Date.now()}-${Math.random()}`, router, model, inputPerMTok: null, cachedInputPerMTok: null, cacheWritePerMTok: null, outputPerMTok: null, source: 'manual', isNew: true }), ...added.value];
}
function removeRow(row: any) {
  edits.set(row.key, { router: row.router, model: row.model, inputPerMTok: null, cachedInputPerMTok: null, cacheWritePerMTok: null, outputPerMTok: null });
}
function discard() { edits.clear(); added.value = []; }

async function save() {
  const list = [
    ...[...edits.values()],
    ...added.value.filter(a => a.model).map(a => ({ router: a.router, model: a.model, inputPerMTok: a.inputPerMTok, cachedInputPerMTok: a.cachedInputPerMTok, cacheWritePerMTok: a.cacheWritePerMTok, outputPerMTok: a.outputPerMTok })),
  ].map(e => ({ ...e, source: 'manual' }));
  if (!list.length) return;
  const result = await c.savePrices(list);
  if (result) { discard(); emit('changed'); }
}
async function refresh() {
  const result = await c.refreshPrices();
  if (result) emit('changed');
}
</script>
