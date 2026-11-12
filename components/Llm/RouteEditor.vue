<template>
  <div class="llx-editor" :data-level="level">
    <div class="llx-form llx-form--grid">
      <label class="llx-field">
        <span>Router</span>
        <select v-if="!lane?.fixedRouter" v-model="routerModel" class="llx-select" :disabled="!canEdit" :data-testid="`${testid}-router`">
          <option value="">{{ inheritText(inherited.routerName) }}</option>
          <option v-for="r in routers" :key="r.id" :value="r.id" :disabled="!r.enabled || (lane?.needsToolCalling && r.id === 'local')">
            {{ r.name }} · {{ BILLING_LABELS[r.billing] ?? r.billing }}{{ !r.enabled ? ' (off)' : '' }}{{ lane?.needsToolCalling && r.id === 'local' ? ' (no tool calling)' : '' }}
          </option>
        </select>
        <span v-else class="llx-input llx-input--static">Always {{ routerName(lane.fixedRouter) }}</span>
      </label>

      <label class="llx-field">
        <span>Model</span>
        <input v-model.trim="modelModel" class="llx-input llx-mono" :list="listId" :placeholder="modelPlaceholder" :disabled="!canEdit" :data-testid="`${testid}-model`" />
        <datalist :id="listId"><option v-for="m in models" :key="m" :value="m" /></datalist>
      </label>

      <label class="llx-check llx-field--check" :title="'A service that chooses its own model keeps it unless this is ticked.'">
        <input v-model="pinModel" type="checkbox" :disabled="!canEdit || !policy.model" :data-testid="`${testid}-pin`" />
        Pin: use this model even where the service picks its own
      </label>

      <label class="llx-field">
        <span>Spending</span>
        <select v-model="spendingModel" class="llx-select" :disabled="!canEdit" :data-testid="`${testid}-spending`">
          <option value="">{{ inheritText(SPENDING_LABELS[inherited.spending ?? '']?.label ?? inherited.spending) }}</option>
          <option v-for="s in spendingOptions" :key="s" :value="s">{{ SPENDING_LABELS[s]?.label ?? s }}</option>
        </select>
        <small class="llx-dim">{{ SPENDING_LABELS[policy.spending || inherited.spending || '']?.help }}</small>
      </label>

      <label class="llx-field">
        <span>Thinking</span>
        <select v-model="thinkingModel" class="llx-select" :disabled="!canEdit">
          <option value="">{{ inheritText(inherited.thinking ?? 'as the service asks') }}</option>
          <option v-for="t in thinkingOptions" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>

      <label class="llx-field">
        <span>Service tier</span>
        <select v-model="tierModel" class="llx-select" :disabled="!canEdit" title="OpenRouter's flex and priority tiers; other routers ignore it.">
          <option value="">{{ inheritText(inherited.serviceTier ?? 'as the service asks') }}</option>
          <option v-for="t in tierOptions" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>

      <label class="llx-field">
        <span>Max parallel</span>
        <input v-model.number="parallelModel" class="llx-input" type="number" min="1" max="64" :placeholder="inherited.maxParallel ? String(inherited.maxParallel) : 'no limit'" :disabled="!canEdit" />
      </label>

      <label class="llx-field llx-field--wide">
        <span>Note</span>
        <input v-model="noteModel" class="llx-input" placeholder="Why this route (kept with it)" maxlength="300" :disabled="!canEdit" />
      </label>
    </div>

    <div class="llx-fallbacks">
      <div class="llx-fallbacks__head">
        <h4 class="llx-subhead">Fallbacks, in order</h4>
        <span class="llx-dim">Tried only after the primary’s own retries end in a router failure (down, timeout, 5xx, long rate limit, no credit, model gone).
          Never for a bad request, a cancel, or a reply that already started.</span>
      </div>
      <ol v-if="fallbacks.length" class="llx-fallbacks__list">
        <li v-for="(f, i) in fallbacks" :key="i" class="llx-fallbacks__row" :data-testid="`${testid}-fallback-${i}`">
          <span class="llx-num llx-dim">{{ i + 1 }}</span>
          <select :value="f.router" class="llx-select" :disabled="!canEdit" aria-label="Fallback router" @change="setFallback(i, 'router', ($event.target as HTMLSelectElement).value)">
            <option v-for="r in routers" :key="r.id" :value="r.id" :disabled="!r.enabled">{{ r.name }} · {{ BILLING_LABELS[r.billing] ?? r.billing }}</option>
          </select>
          <input :value="f.model ?? ''" class="llx-input llx-mono" :list="listId" placeholder="its default model" :disabled="!canEdit" aria-label="Fallback model"
                 @change="setFallback(i, 'model', ($event.target as HTMLInputElement).value.trim())" />
          <span v-if="leftOut(f)" class="llx-chip llx-chip--xs" data-tone="warn" title="Per-token: used only with spending set to 'Fallback anywhere'">left out</span>
          <span class="llx-fallbacks__tools">
            <button class="llx-iconbtn llx-iconbtn--sm" :disabled="!canEdit || i === 0" aria-label="Move up" @click="move(i, -1)"><LlmIcon name="chevron-up" /></button>
            <button class="llx-iconbtn llx-iconbtn--sm" :disabled="!canEdit || i === fallbacks.length - 1" aria-label="Move down" @click="move(i, 1)"><LlmIcon name="chevron-down" /></button>
            <button class="llx-iconbtn llx-iconbtn--sm" :disabled="!canEdit" aria-label="Remove fallback" @click="remove(i)"><LlmIcon name="x" /></button>
          </span>
        </li>
      </ol>
      <p v-else class="llx-dim">{{ level === 'default' ? 'None.' : 'None set here: inherited from above, if any.' }}</p>
      <button v-if="canEdit && fallbacks.length < 4" class="llx-btn llx-btn--xs" :data-testid="`${testid}-add-fallback`" @click="add"><LlmIcon name="plus" />Add a fallback</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { BILLING_LABELS, SPENDING_LABELS } from '~/scripts/kliveLlm';

const props = withDefaults(defineProps<{
  /** The draft policy, edited in place. */
  policy: Record<string, any>;
  routers: any[];
  level: 'default' | 'service' | 'lane';
  /** What applies where this policy leaves a field empty. */
  inherited?: { router?: string; routerName?: string; model?: string; spending?: string; thinking?: string; serviceTier?: string; maxParallel?: number; billing?: string };
  lane?: any | null;
  models?: string[];
  canEdit: boolean;
  spendingOptions?: string[];
  thinkingOptions?: string[];
  tierOptions?: string[];
  testid?: string;
}>(), {
  inherited: () => ({}), models: () => [], spendingOptions: () => ['Never', 'PrimaryOnly', 'Anywhere'],
  thinkingOptions: () => ['off', 'low', 'medium', 'high'], tierOptions: () => ['default', 'flex', 'priority'], testid: 'route',
});

const listId = `llx-models-${Math.random().toString(36).slice(2, 9)}`;
const byId = computed(() => new Map(props.routers.map(r => [String(r.id).toLowerCase(), r])));
const routerName = (id: string) => byId.value.get(String(id).toLowerCase())?.name ?? id;
const inheritText = (what?: string | null) => (props.level === 'default' ? `Not set${what ? ` (${what})` : ''}` : `Inherit${what ? ` · ${what}` : ''}`);

// Each field: an empty control means "not set here" (null), so the level above applies.
function field<T>(name: string, read: (v: any) => T, write: (v: T) => any) {
  return computed<T>({
    get: () => read(props.policy[name]),
    set: v => {
      const next = write(v);
      if (next == null || next === '') delete props.policy[name];
      else props.policy[name] = next;
    },
  });
}
const routerModel = field<string>('router', v => v ?? '', v => v || null);
const modelModel = field<string>('model', v => v ?? '', v => {
  if (!v) delete props.policy.pin;
  return v || null;
});
const pinModel = field<boolean>('pin', v => v === true, v => (v ? true : null));
const spendingModel = field<string>('spending', v => v ?? '', v => v || null);
const thinkingModel = field<string>('thinking', v => v ?? '', v => v || null);
const tierModel = field<string>('serviceTier', v => v ?? '', v => v || null);
const parallelModel = field<number | ''>('maxParallel', v => (typeof v === 'number' ? v : ''), v => (typeof v === 'number' && v >= 1 ? Math.min(64, Math.round(v)) : null));
const noteModel = field<string>('note', v => v ?? '', v => v?.trim() || null);

const modelPlaceholder = computed(() => {
  const routerSet = props.policy.router || props.inherited.router;
  const r = routerSet ? byId.value.get(String(routerSet).toLowerCase()) : null;
  if (props.inherited.model && !props.policy.router) return `inherit · ${props.inherited.model}`;
  return r?.defaultModel ? `the router’s default (${r.defaultModel})` : 'the router’s default';
});

// ── fallbacks ──
const fallbacks = computed<any[]>(() => props.policy.fallbacks ?? []);
function write(list: any[]) {
  if (list.length) props.policy.fallbacks = list;
  else delete props.policy.fallbacks;
}
function add() {
  const primary = String(props.policy.router || props.inherited.router || '').toLowerCase();
  const choice = props.routers.find(r => r.enabled && String(r.id).toLowerCase() !== primary && !fallbacks.value.some(f => f.router === r.id)) ?? props.routers[0];
  if (choice) write([...fallbacks.value, { router: choice.id }]);
}
function remove(i: number) { write(fallbacks.value.filter((_, j) => j !== i)); }
function move(i: number, d: number) {
  const list = [...fallbacks.value];
  const [x] = list.splice(i, 1);
  list.splice(i + d, 0, x);
  write(list);
}
function setFallback(i: number, key: 'router' | 'model', value: string) {
  const list = fallbacks.value.map(f => ({ ...f }));
  if (key === 'model' && !value) delete list[i].model; else list[i][key] = value;
  write(list);
}

/** A per-token fallback behind a free or flat-fee primary is dropped unless spending allows it. */
function leftOut(f: any) {
  const spending = props.policy.spending || props.inherited.spending || 'PrimaryOnly';
  const primaryId = String(props.policy.router || props.inherited.router || '').toLowerCase();
  const primaryBilling = byId.value.get(primaryId)?.billing ?? props.inherited.billing;
  const billing = byId.value.get(String(f.router).toLowerCase())?.billing;
  if (billing !== 'PerToken') return false;
  if (spending === 'Never') return true;
  return spending === 'PrimaryOnly' && primaryBilling !== 'PerToken';
}
</script>
