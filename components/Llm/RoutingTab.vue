<template>
  <div class="llx-stack" data-testid="llx-routing">
    <div v-if="!doc" class="llx-card"><div class="llx-empty">{{ c.errors.value.routing ?? 'Reading the routing…' }}</div></div>

    <template v-else>
      <div v-if="!canEdit" class="llx-banner" data-tone="info"><LlmIcon name="lock" />You can see the routing; changing it needs the “Change routing” permission.</div>
      <div v-if="rebaseNote" class="llx-banner" data-tone="warn" data-testid="routing-rebased">
        <LlmIcon name="alert" /><span>{{ rebaseNote }}</span>
        <button class="llx-btn llx-btn--xs" @click="rebaseNote = null">OK</button>
      </div>

      <!-- emergency override -->
      <section id="llx-override" class="llx-card" :data-flash="ui.target.value === 'override' || undefined" data-testid="routing-override">
        <header class="llx-card__head">
          <h2 class="llx-card__title"><LlmIcon name="alert" />Emergency override</h2>
          <span class="llx-card__meta">Every service (or the ones you pick) to one router for a while, whatever their own routes say</span>
        </header>
        <div v-if="overrideOn" class="llx-override llx-override--on">
          <div>
            <b>Everything{{ overrideOn.services?.length ? ` from ${overrideOn.services.join(', ')}` : '' }} goes to {{ routerName(overrideOn.router) }}</b>
            <span v-if="overrideOn.model" class="llx-mono"> ({{ overrideOn.model }})</span>
            <p class="llx-dim">Until {{ llmClock(overrideOn.untilUtc) }} ({{ llmAgo(overrideOn.untilUtc, c.now.value) }}){{ overrideOn.reason ? ` · ${overrideOn.reason}` : '' }}{{ overrideOn.setBy ? ` · set by ${overrideOn.setBy}` : '' }}</p>
          </div>
          <button v-if="canEdit" class="llx-btn llx-btn--sm" :disabled="c.busy.value.override" data-testid="override-clear" @click="c.clearOverride()"><LlmIcon name="undo" />Clear now</button>
        </div>
        <div v-else-if="canEdit" class="llx-form llx-form--row">
          <label class="llx-field"><span>Router</span>
            <select v-model="ov.router" class="llx-select" data-testid="override-router">
              <option value="" disabled>Pick a router</option>
              <option v-for="r in usableRouters" :key="r.id" :value="r.id">{{ r.name }} · {{ BILLING_LABELS[r.billing] ?? r.billing }}</option>
            </select>
          </label>
          <label class="llx-field"><span>Model (optional)</span><input v-model.trim="ov.model" class="llx-input llx-mono" :list="'llx-override-models'" placeholder="the router’s default" /></label>
          <datalist id="llx-override-models"><option v-for="m in allModels" :key="m" :value="m" /></datalist>
          <label class="llx-field"><span>For</span>
            <select v-model.number="ov.minutes" class="llx-select">
              <option v-for="d in DURATIONS" :key="d.minutes" :value="d.minutes">{{ d.label }}</option>
            </select>
          </label>
          <label class="llx-field llx-field--grow"><span>Why</span><input v-model="ov.reason" class="llx-input" placeholder="OpenRouter is down, AIRouter key suspended…" /></label>
          <details class="llx-details">
            <summary>{{ ov.services.length ? `${ov.services.length} services` : 'Every service' }}</summary>
            <div class="llx-details__body">
              <label v-for="s in services" :key="s" class="llx-check"><input v-model="ov.services" type="checkbox" :value="s" />{{ s }}</label>
            </div>
          </details>
          <button class="llx-btn llx-btn--danger" :disabled="!ov.router || c.busy.value.override" data-testid="override-set" @click="setOverride">Send everything there</button>
        </div>
        <p v-else class="llx-dim">No override is in force.</p>
      </section>

      <!-- default route -->
      <section class="llx-card" data-testid="routing-default">
        <header class="llx-card__head">
          <h2 class="llx-card__title"><LlmIcon name="route" />Default route</h2>
          <span class="llx-card__meta">What every lane uses unless its service or the lane itself says otherwise</span>
        </header>
        <LlmRouteEditor :policy="draft.default" :routers="routers" level="default" :can-edit="canEdit" :models="allModels" testid="default"
                        :inherited="{ router: c.routing.value?.defaultRouterFromSetting, routerName: `RemoteLLMProvider: ${routerName(c.routing.value?.defaultRouterFromSetting)}`, spending: 'PrimaryOnly' }"
                        :spending-options="c.routing.value?.spendingOptions" :thinking-options="c.routing.value?.thinkingOptions" :tier-options="c.routing.value?.serviceTierOptions" />
      </section>

      <!-- the matrix -->
      <section class="llx-card" data-testid="routing-matrix">
        <header class="llx-card__head">
          <h2 class="llx-card__title"><LlmIcon name="grid" />Services and lanes</h2>
          <span class="llx-card__meta">A lane inherits its service; a service inherits the default route. Edits wait below until you apply them.</span>
          <div class="llx-card__tools">
            <label class="llx-field llx-field--inline llx-field--search"><LlmIcon name="search" /><input v-model="query" class="llx-input" placeholder="Filter" aria-label="Filter the routing" /></label>
            <label class="llx-check"><input v-model="onlySet" type="checkbox" />Only what is set</label>
          </div>
        </header>
        <div class="llx-tablewrap">
          <table class="llx-table llx-matrix">
            <thead>
              <tr>
                <th class="l">Service › lane</th>
                <th class="l">Router</th>
                <th class="l">Model</th>
                <th class="l">Spending</th>
                <th class="l">Fallbacks</th>
                <th class="l">In force now</th>
                <th></th>
              </tr>
            </thead>
            <tbody v-for="g in groups" :key="g.service">
              <tr class="llx-matrix__service" :data-changed="changed(serviceScope(g.service)) || undefined">
                <th class="l"><b>{{ g.service }}</b> <span class="llx-dim">all lanes</span></th>
                <td class="l">
                  <select :value="policyOf('services', g.service)?.router ?? ''" class="llx-select llx-select--sm" :disabled="!canEdit" :aria-label="`${g.service} router`" :data-testid="`svc-router-${g.service}`"
                          @change="set('services', g.service, 'router', ($event.target as HTMLSelectElement).value)">
                    <option value="">Inherit · {{ routerName(defaultRouter) }}</option>
                    <option v-for="r in routers" :key="r.id" :value="r.id" :disabled="!r.enabled">{{ r.name }}</option>
                  </select>
                </td>
                <td class="l">
                  <input :value="policyOf('services', g.service)?.model ?? ''" class="llx-input llx-input--sm llx-mono" list="llx-all-models" :placeholder="'inherit'" :disabled="!canEdit"
                         :aria-label="`${g.service} model`" @change="set('services', g.service, 'model', ($event.target as HTMLInputElement).value.trim())" />
                </td>
                <td class="l">
                  <select :value="policyOf('services', g.service)?.spending ?? ''" class="llx-select llx-select--sm" :disabled="!canEdit" :aria-label="`${g.service} spending`"
                          @change="set('services', g.service, 'spending', ($event.target as HTMLSelectElement).value)">
                    <option value="">Lane default</option>
                    <option v-for="s in spendingOptions" :key="s" :value="s">{{ SPENDING_LABELS[s]?.label ?? s }}</option>
                  </select>
                </td>
                <td class="l llx-dim">{{ fallbackText(policyOf('services', g.service)) }}</td>
                <td class="l"></td>
                <td><button class="llx-iconbtn llx-iconbtn--sm" :aria-expanded="open === serviceScope(g.service)" :aria-label="`More for ${g.service}`" @click="toggle(serviceScope(g.service), 'services', g.service)"><LlmIcon :name="open === serviceScope(g.service) ? 'chevron-up' : 'chevron-down'" /></button></td>
              </tr>
              <tr v-if="open === serviceScope(g.service)" class="llx-matrix__editor">
                <td colspan="7">
                  <LlmRouteEditor :policy="draft.services[g.service]" :routers="routers" level="service" :can-edit="canEdit" :models="allModels" :testid="`svc-${g.service}`"
                                  :inherited="{ router: defaultRouter, routerName: routerName(defaultRouter), model: draft.default?.model, spending: undefined }"
                                  :spending-options="spendingOptions" :thinking-options="c.routing.value?.thinkingOptions" :tier-options="c.routing.value?.serviceTierOptions" />
                </td>
              </tr>

              <template v-for="lane in g.lanes" :key="lane.key">
                <tr :id="`llx-route-${lane.key}`" class="llx-matrix__lane" :data-changed="changed(lane.key) || undefined" :data-flash="ui.target.value === lane.key || undefined" :data-testid="`route-${lane.key}`">
                  <td class="l">
                    <span class="llx-lane">
                      <b class="llx-truncate">{{ lane.label }}</b>
                      <span class="llx-dim llx-truncate">
                        <template v-if="lane.fixedRouter">always {{ routerName(lane.fixedRouter) }}</template>
                        <template v-else-if="lane.needsToolCalling">tool calling</template>
                        <template v-if="lane.modelSource"> · own model: {{ lane.modelSource }}</template>
                      </span>
                    </span>
                  </td>
                  <td class="l">
                    <span v-if="lane.fixedRouter" class="llx-dim">{{ routerName(lane.fixedRouter) }}</span>
                    <select v-else :value="policyOf('lanes', lane.key)?.router ?? ''" class="llx-select llx-select--sm" :disabled="!canEdit" :aria-label="`${lane.label} router`" :data-testid="`lane-router-${lane.key}`"
                            @change="set('lanes', lane.key, 'router', ($event.target as HTMLSelectElement).value)">
                      <option value="">Inherit · {{ routerName(inheritedRouter(lane)) }}</option>
                      <option v-for="r in routers" :key="r.id" :value="r.id" :disabled="!r.enabled || (lane.needsToolCalling && r.id === 'local')">{{ r.name }}</option>
                    </select>
                  </td>
                  <td class="l">
                    <span class="llx-model">
                      <input :value="policyOf('lanes', lane.key)?.model ?? ''" class="llx-input llx-input--sm llx-mono" list="llx-all-models" :placeholder="inheritedModel(lane)" :disabled="!canEdit"
                             :aria-label="`${lane.label} model`" :data-testid="`lane-model-${lane.key}`" @change="set('lanes', lane.key, 'model', ($event.target as HTMLInputElement).value.trim())" />
                      <label v-if="policyOf('lanes', lane.key)?.model" class="llx-check llx-check--icon" title="Pin: use this model even where the service picks its own">
                        <input type="checkbox" :checked="policyOf('lanes', lane.key)?.pin === true" :disabled="!canEdit" :aria-label="`Pin the model for ${lane.label}`"
                               @change="set('lanes', lane.key, 'pin', ($event.target as HTMLInputElement).checked ? true : null)" /><LlmIcon name="pin" />
                      </label>
                    </span>
                  </td>
                  <td class="l">
                    <select :value="policyOf('lanes', lane.key)?.spending ?? ''" class="llx-select llx-select--sm" :disabled="!canEdit" :aria-label="`${lane.label} spending`"
                            @change="set('lanes', lane.key, 'spending', ($event.target as HTMLSelectElement).value)">
                      <option value="">Inherit · {{ SPENDING_LABELS[inheritedSpending(lane)]?.label ?? inheritedSpending(lane) }}</option>
                      <option v-for="s in spendingOptions" :key="s" :value="s">{{ SPENDING_LABELS[s]?.label ?? s }}</option>
                    </select>
                  </td>
                  <td class="l llx-dim">{{ fallbackText(policyOf('lanes', lane.key)) }}</td>
                  <td class="l">
                    <span class="llx-inforce" :title="lane.effective?.chain?.join('\n')">
                      <span v-if="lane.effective?.blocked" class="llx-chip llx-chip--xs" :data-tone="lane.effective.blocked === 'Paused' ? 'info' : 'warn'">{{ lane.effective.blocked === 'Paused' ? 'paused' : 'refused' }}</span>
                      <span class="llx-truncate">{{ lane.effective?.routerName ?? '—' }}</span>
                      <span class="llx-dim llx-mono llx-truncate">{{ lane.effective?.model ?? '' }}</span>
                    </span>
                  </td>
                  <td>
                    <button class="llx-iconbtn llx-iconbtn--sm" :aria-expanded="open === lane.key" :aria-label="`More for ${lane.label}`" :data-testid="`lane-expand-${lane.key}`" @click="toggle(lane.key, 'lanes', lane.key)">
                      <LlmIcon :name="open === lane.key ? 'chevron-up' : 'chevron-down'" />
                    </button>
                  </td>
                </tr>
                <tr v-if="open === lane.key" class="llx-matrix__editor">
                  <td colspan="7">
                    <div class="llx-matrix__extra">
                      <span v-if="lane.description" class="llx-dim">{{ lane.description }}</span>
                      <span class="llx-spacer"></span>
                      <button v-if="canEdit" class="llx-btn llx-btn--xs" :class="{ 'llx-btn--danger': lane.effective?.blocked !== 'Paused' }" @click="pause(lane)">
                        <LlmIcon :name="lane.effective?.blocked === 'Paused' ? 'play' : 'pause'" />{{ lane.effective?.blocked === 'Paused' ? 'Resume now' : 'Pause now' }}
                      </button>
                      <button class="llx-btn llx-btn--xs llx-btn--ghost" @click="ui.openLane(lane.key)"><LlmIcon name="eye" />Lane details</button>
                    </div>
                    <LlmRouteEditor :policy="draft.lanes[lane.key]" :routers="routers" level="lane" :lane="lane" :can-edit="canEdit" :models="allModels" :testid="`lane-${lane.key}`"
                                    :inherited="{ router: inheritedRouter(lane), routerName: routerName(inheritedRouter(lane)), model: inheritedModelValue(lane), spending: inheritedSpending(lane), billing: billingOf(inheritedRouter(lane)) }"
                                    :spending-options="spendingOptions" :thinking-options="c.routing.value?.thinkingOptions" :tier-options="c.routing.value?.serviceTierOptions" />
                    <ol v-if="lane.effective?.chain?.length" class="llx-chain llx-chain--compact"><li v-for="(s, i) in lane.effective.chain" :key="i">{{ s }}</li></ol>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
          <datalist id="llx-all-models"><option v-for="m in allModels" :key="m" :value="m" /></datalist>
        </div>
      </section>

      <!-- skipped routers -->
      <section v-if="circuits.length" class="llx-card" data-testid="routing-circuits">
        <header class="llx-card__head">
          <h2 class="llx-card__title"><LlmIcon name="power" />Routers being skipped</h2>
          <span class="llx-card__meta">After repeated router failures a lane uses its fallback straight away, then tries the router again (2 min, doubling to 15 min)</span>
          <div class="llx-card__tools"><button v-if="canEdit" class="llx-btn llx-btn--sm" @click="c.resetCircuits()">Try them all again</button></div>
        </header>
        <ul class="llx-list">
          <li v-for="cc in circuits" :key="`${cc.lane}-${cc.router}`" class="llx-list__row">
            <span class="llx-chip llx-chip--dot" data-tone="warn">skipping</span>
            <span><b>{{ cc.lane.replace('/', ' › ') }}</b> is skipping <b>{{ routerName(cc.router) }}</b> until {{ llmTime(new Date(cc.openUntilUtc).getTime(), true) }}
              <span class="llx-dim">· failed {{ cc.failures }}× · {{ cc.lastError }}</span></span>
            <button v-if="canEdit" class="llx-btn llx-btn--xs" @click="c.resetCircuits(cc.lane, cc.router)">Try again now</button>
          </li>
        </ul>
      </section>

      <!-- history -->
      <section class="llx-card" data-testid="routing-history">
        <header class="llx-card__head">
          <h2 class="llx-card__title"><LlmIcon name="clock" />History</h2>
          <span class="llx-card__meta">Every change, who made it and why; any revision can be put back</span>
        </header>
        <ul class="llx-history">
          <li v-for="h in history" :key="h.revision" class="llx-history__row" :data-current="h.revision === doc.revision || undefined">
            <span class="llx-history__rev llx-num">r{{ h.revision }}</span>
            <div class="llx-history__body">
              <div><b>{{ h.note || 'Routing changed' }}</b> <span class="llx-dim">· {{ llmClock(h.atUtc) }} · {{ h.by ?? 'someone' }}</span>
                <span v-if="h.revision === doc.revision" class="llx-chip llx-chip--xs" data-tone="ok">in force</span></div>
              <ul v-if="h.changes?.length" class="llx-history__changes">
                <li v-for="(ch, i) in (expanded.has(h.revision) ? h.changes : h.changes.slice(0, 3))" :key="i">{{ ch }}</li>
                <li v-if="h.changes.length > 3 && !expanded.has(h.revision)"><button class="llx-link" @click="expanded = new Set([...expanded, h.revision])">and {{ h.changes.length - 3 }} more</button></li>
              </ul>
            </div>
            <span v-if="canEdit" class="llx-history__tools">
              <button class="llx-btn llx-btn--xs" :disabled="h.revision === doc.revision" title="Put this revision back in force" @click="restore(h, false)">Restore</button>
              <button class="llx-btn llx-btn--xs llx-btn--ghost" title="Put back what this revision replaced" @click="restore(h, true)">Undo it</button>
            </span>
          </li>
          <li v-if="!history.length" class="llx-empty">{{ historyRead.value.value ? 'No changes yet: everything follows the RemoteLLMProvider setting.' : 'Reading the history…' }}</li>
        </ul>
      </section>
    </template>

    <!-- pending changes -->
    <div v-if="changes.length" class="llx-pending" role="region" aria-label="Unsaved routing changes" data-testid="routing-pending">
      <span class="llx-pending__count"><b class="llx-num">{{ changes.length }}</b> unsaved change{{ changes.length === 1 ? '' : 's' }}</span>
      <span class="llx-pending__list llx-truncate llx-dim">{{ changes.slice(0, 2).join(' · ') }}{{ changes.length > 2 ? ' …' : '' }}</span>
      <span class="llx-spacer"></span>
      <button class="llx-btn llx-btn--sm llx-btn--ghost" data-testid="routing-discard" @click="discard">Discard</button>
      <button class="llx-btn llx-btn--sm llx-btn--primary" :disabled="!canEdit" data-testid="routing-review" @click="review">Review and apply</button>
    </div>

    <LlmDialog :open="reviewOpen" title="Apply these routing changes?" :sub="previewSub" icon="route" wide testid="routing-preview" @close="reviewOpen = false">
      <div v-if="previewing" class="llx-empty">Working out what changes…</div>
      <template v-else-if="preview">
        <div v-if="!preview.valid" class="llx-banner" data-tone="crit"><LlmIcon name="octagon-x" />{{ preview.error }}</div>
        <div v-if="preview.conflict" class="llx-banner" data-tone="warn"><LlmIcon name="alert" />The routing moved to revision {{ preview.revision }} while you were editing; applying is refused until your edits are carried onto it (reopen this after it refreshes).</div>
        <h4 class="llx-subhead">What changes</h4>
        <ul class="llx-bullets"><li v-for="(ch, i) in (preview.changes?.length ? preview.changes : changes)" :key="i">{{ ch }}</li></ul>
        <template v-if="preview.lanes?.length">
          <h4 class="llx-subhead">Lanes whose route changes</h4>
          <div class="llx-tablewrap">
            <table class="llx-table">
              <thead><tr><th class="l">Lane</th><th class="l">Now</th><th class="l">After</th><th>Warm sessions going cold</th></tr></thead>
              <tbody>
                <tr v-for="l in preview.lanes" :key="l.key">
                  <td class="l"><b>{{ l.label }}</b></td>
                  <td class="l">{{ l.before.routerName ?? '—' }} <span class="llx-mono llx-dim">{{ l.before.model }}</span></td>
                  <td class="l">
                    <span v-if="l.after.blocked" class="llx-chip llx-chip--xs" data-tone="warn" :title="l.after.blockReason">refused</span>
                    {{ l.after.routerName ?? '—' }} <span class="llx-mono llx-dim">{{ l.after.model }}</span>
                    <span v-if="l.after.pin" class="llx-chip llx-chip--xs">pinned</span>
                    <div v-for="(w, i) in l.after.warnings ?? []" :key="i" class="llx-text-warn llx-small"><LlmIcon name="alert" />{{ w }}</div>
                    <div v-if="l.after.blocked" class="llx-text-warn llx-small">{{ l.after.blockReason }}</div>
                  </td>
                  <td class="llx-num">{{ l.warmSessionsGoingCold || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="coldTotal" class="llx-note">{{ coldTotal }} warm session{{ coldTotal === 1 ? '' : 's' }} will re-send their whole prompt once (their cached prefix stays on the old router).</p>
        </template>
        <label class="llx-field llx-field--wide"><span>Note for the history</span><input v-model="note" class="llx-input" placeholder="Why (optional)" maxlength="300" data-autofocus data-testid="routing-note" /></label>
      </template>
      <div v-else-if="previewError" class="llx-banner" data-tone="crit"><LlmIcon name="octagon-x" />{{ previewError }}</div>
      <template #actions>
        <button class="llx-btn" @click="reviewOpen = false">Keep editing</button>
        <button class="llx-btn llx-btn--primary" :disabled="!preview?.valid || preview?.conflict || c.busy.value.apply" data-testid="routing-apply" @click="apply">Apply as revision {{ (doc?.revision ?? 0) + 1 }}</button>
      </template>
    </LlmDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useLlmRead, type KliveLlmConsole, type LlmUi } from '~/composables/useKliveLlm';
import {
  BILLING_LABELS, SPENDING_LABELS, cloneRouting, llmAgo, llmClock, llmTime, normalizePolicy, rebaseRouting, routingDraftChanges,
} from '~/scripts/kliveLlm';

const c = inject<KliveLlmConsole>('llx')!;
const ui = inject<LlmUi>('llxUi')!;
const canEdit = computed(() => c.allowed.value.routing);

const doc = computed(() => c.routing.value?.document ?? null);
const routers = computed<any[]>(() => c.routing.value?.routers ?? []);
const usableRouters = computed(() => routers.value.filter(r => r.enabled));
const byId = computed(() => new Map(routers.value.map((r: any) => [String(r.id).toLowerCase(), r])));
const routerName = (id?: string | null) => (id ? byId.value.get(String(id).toLowerCase())?.name ?? id : '—');
const billingOf = (id?: string | null) => (id ? byId.value.get(String(id).toLowerCase())?.billing : undefined);
const spendingOptions = computed<string[]>(() => c.routing.value?.spendingOptions ?? ['Never', 'PrimaryOnly', 'Anywhere']);

// ── the draft (kept by the page shell, so it survives switching tabs) ──
const rebaseNote = ref<string | null>(null);
let applying = false;

function resetDraft() {
  if (!doc.value) return;
  ui.draft.value = cloneRouting(doc.value);
  ui.draftBase.value = doc.value.revision;
  ui.draftOrigin.value = cloneRouting(doc.value);
}

function syncDraft() {
  if (!doc.value || applying) return;
  if (!ui.draft.value || !ui.draftOrigin.value) { resetDraft(); return; }
  if (ui.draftBase.value === doc.value.revision) return;
  const mine = routingDraftChanges(ui.draftOrigin.value, ui.draft.value);
  if (!mine.length) { resetDraft(); return; }
  const { doc: merged, conflicts } = rebaseRouting(ui.draftOrigin.value, ui.draft.value, doc.value);
  ui.draft.value = merged;
  ui.draftBase.value = doc.value.revision;
  ui.draftOrigin.value = cloneRouting(doc.value);
  rebaseNote.value = conflicts.length
    ? `Revision ${doc.value.revision} came in while you were editing. Your edits were kept, and they replace what it changed in: ${conflicts.join('; ')}.`
    : `Revision ${doc.value.revision} came in while you were editing; your unsaved edits were carried onto it.`;
}
watch(() => doc.value?.revision, syncDraft, { immediate: true });

const draft = computed<any>(() => {
  const d = ui.draft.value ?? {};
  d.default ??= {};
  d.services ??= {};
  d.lanes ??= {};
  return d;
});
const changes = computed(() => (doc.value && ui.draft.value ? routingDraftChanges(doc.value, ui.draft.value) : []));

function policyOf(part: 'services' | 'lanes', key: string) {
  return draft.value[part]?.[key] ?? null;
}
function set(part: 'services' | 'lanes', key: string, field: string, value: any) {
  const map = draft.value[part];
  const p = map[key] ?? (map[key] = {});
  if (value == null || value === '') {
    delete p[field];
    if (field === 'model') delete p.pin;
  } else p[field] = value;
  if (!normalizePolicy(p)) delete map[key];
}
const serviceScope = (service: string) => `svc:${service}`;
function changed(scope: string) {
  if (!doc.value) return false;
  const [part, key] = scope.startsWith('svc:') ? ['services', scope.slice(4)] as const : ['lanes', scope] as const;
  return JSON.stringify(normalizePolicy(doc.value[part]?.[key])) !== JSON.stringify(normalizePolicy(draft.value[part]?.[key]));
}

const open = ref<string | null>(null);
function toggle(scope: string, part: 'services' | 'lanes', key: string) {
  if (open.value === scope) { open.value = null; return; }
  draft.value[part][key] ??= {};
  open.value = scope;
}

// ── what a lane would inherit ──
const defaultRouter = computed(() => draft.value.default?.router || c.routing.value?.defaultRouterFromSetting || '');
// A free-model call with no router set for it goes to OpenRouter's free model before the default route.
const isFreeModelLane = (lane: any) => lane.effective?.source === 'free-model' || lane.effective?.router === 'openrouter-free' && !doc.value?.lanes?.[lane.key]?.router && !doc.value?.services?.[lane.service]?.router;
const inheritedRouter = (lane: any) => draft.value.services?.[lane.service]?.router || (isFreeModelLane(lane) ? 'openrouter-free' : defaultRouter.value);
const inheritedModelValue = (lane: any) => {
  const svc = draft.value.services?.[lane.service];
  if (svc?.router) return svc.model;
  return svc?.model ?? draft.value.default?.model;
};
const inheritedModel = (lane: any) => {
  const m = inheritedModelValue(lane);
  if (m) return `inherit · ${m}`;
  const r = byId.value.get(String(inheritedRouter(lane)).toLowerCase());
  return lane.modelSource ? 'the service’s own' : r?.defaultModel ? `default · ${r.defaultModel}` : 'the router’s default';
};
const inheritedSpending = (lane: any) => draft.value.services?.[lane.service]?.spending || lane.defaultSpending || 'PrimaryOnly';
const fallbackText = (p: any) => (p?.fallbacks?.length ? p.fallbacks.map((f: any) => routerName(f.router)).join(' → ') : '—');

// ── rows ──
const query = ref('');
const onlySet = ref(false);
const services = computed<string[]>(() => c.routing.value?.services ?? []);
const groups = computed(() => {
  const words = query.value.toLowerCase().split(/\s+/).filter(Boolean);
  const lanes: any[] = c.routing.value?.lanes ?? [];
  const out: { service: string; lanes: any[] }[] = [];
  for (const service of services.value) {
    let list = lanes.filter(l => l.service === service);
    if (words.length) list = list.filter(l => words.every(w => `${l.service} ${l.lane} ${l.label} ${l.effective?.routerName ?? ''} ${l.effective?.model ?? ''}`.toLowerCase().includes(w)));
    if (onlySet.value) list = list.filter(l => normalizePolicy(draft.value.lanes?.[l.key]) || normalizePolicy(doc.value?.lanes?.[l.key]));
    const serviceSet = !!normalizePolicy(draft.value.services?.[service]);
    if (!list.length && (words.length || onlySet.value) && !(onlySet.value && serviceSet)) continue;
    out.push({ service, lanes: list });
  }
  return out;
});

/** Models worth suggesting: what answered lately, what routes name, and each router's default. */
const allModels = computed(() => {
  const set = new Set<string>();
  for (const f of c.overview.value?.data?.flows ?? []) if (f.model && f.model !== '(none)') set.add(f.model);
  for (const l of c.routing.value?.lanes ?? []) if (l.effective?.model) set.add(l.effective.model);
  for (const r of routers.value) if (r.defaultModel) set.add(r.defaultModel);
  for (const r of c.routers.value?.routers ?? []) if (r.defaultModel) set.add(r.defaultModel);
  return [...set].sort();
});

// ── override ──
const DURATIONS = [
  { minutes: 15, label: '15 minutes' }, { minutes: 30, label: '30 minutes' }, { minutes: 60, label: '1 hour' }, { minutes: 120, label: '2 hours' },
  { minutes: 360, label: '6 hours' }, { minutes: 720, label: '12 hours' }, { minutes: 1440, label: '24 hours' },
];
const ov = reactive<{ router: string; model: string; minutes: number; reason: string; services: string[] }>({ router: '', model: '', minutes: 60, reason: '', services: [] });
const overrideOn = computed(() => {
  const o = doc.value?.override;
  return o && new Date(o.untilUtc).getTime() > c.now.value ? o : null;
});
async function setOverride() {
  const scope = ov.services.length ? ov.services.join(', ') : 'every service';
  const label = DURATIONS.find(d => d.minutes === ov.minutes)?.label ?? `${ov.minutes} minutes`;
  if (!(await ui.confirm({
    title: `Send ${scope} to ${routerName(ov.router)} for ${label}?`,
    body: 'This overrides every route below until it expires or you clear it. Spending rules still apply: a lane that may never spend per token is refused rather than sent to a per-token router.',
    confirm: 'Send everything', danger: true,
  }))) return;
  const result = await c.setOverride({ router: ov.router, model: ov.model || null, minutes: ov.minutes, reason: ov.reason || undefined, services: ov.services.length ? ov.services : undefined });
  if (result) { ov.reason = ''; ov.services = []; }
}

// ── circuits, history ──
const circuits = computed<any[]>(() => c.live.value?.circuits ?? c.routing.value?.circuits ?? []);
const historyRead = useLlmRead(c, () => `/klivellm/routing/history?limit=40&r=${doc.value?.revision ?? 0}`);
const history = computed<any[]>(() => historyRead.value.value?.history ?? []);
const expanded = ref(new Set<number>());

async function restore(h: any, before: boolean) {
  if (changes.value.length && !(await ui.confirm({ title: 'Throw away your unsaved edits?', body: 'Restoring a revision replaces the routing, and your edits here would be lost.', confirm: 'Discard and restore', danger: true }))) return;
  if (!(await ui.confirm({
    title: before ? `Undo revision ${h.revision}?` : `Restore revision ${h.revision}?`,
    body: before ? 'The routing goes back to what it was just before that change, as a new revision.' : 'That revision’s routing is put back in force, as a new revision.',
    confirm: before ? 'Undo it' : 'Restore',
  }))) return;
  applying = true;
  try {
    const result = await c.restoreRevision(h.revision, undefined, before);
    if (result) resetDraft();
  } finally { applying = false; syncDraft(); }
}

// ── review and apply ──
const reviewOpen = ref(false);
const previewing = ref(false);
const preview = ref<any | null>(null);
const previewError = ref<string | null>(null);
const note = ref('');
const coldTotal = computed(() => (preview.value?.lanes ?? []).reduce((s: number, l: any) => s + Number(l.warmSessionsGoingCold ?? 0), 0));
const previewSub = computed(() => `${changes.value.length} change${changes.value.length === 1 ? '' : 's'} on revision ${ui.draftBase.value ?? '—'}`);

async function review() {
  reviewOpen.value = true;
  previewing.value = true;
  preview.value = null;
  previewError.value = null;
  try {
    preview.value = await c.previewRouting(ui.draft.value, ui.draftBase.value ?? 0);
  } catch (e: any) {
    previewError.value = e?.message ?? 'The preview did not come back.';
  } finally { previewing.value = false; }
}

async function apply() {
  applying = true;
  try {
    const result = await c.applyRouting(ui.draft.value, ui.draftBase.value ?? 0, note.value.trim());
    if (result) {
      resetDraft();
      reviewOpen.value = false;
      note.value = '';
      rebaseNote.value = null;
      void c.refreshMain();
    } else void c.refreshSlow();
  } finally { applying = false; }
}

async function discard() {
  if (!(await ui.confirm({ title: `Discard ${changes.value.length} unsaved change${changes.value.length === 1 ? '' : 's'}?`, confirm: 'Discard', danger: true }))) return;
  resetDraft();
  rebaseNote.value = null;
}

async function pause(lane: any) {
  const paused = lane.effective?.blocked === 'Paused';
  if (!paused && !(await ui.confirm({ title: `Pause ${lane.service} › ${lane.label}?`, body: 'Its model calls are refused before anything is sent, until you resume it.', confirm: 'Pause', danger: true }))) return;
  await c.setPaused(lane.service, lane.lane, !paused, paused ? undefined : 'Paused from the Routing tab');
}

// A target (from another tab or an issue) opens that row and scrolls to it.
async function focusTarget() {
  const t = ui.target.value;
  if (!t) return;
  if (t === 'override') { await nextTick(); document.getElementById('llx-override')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  const lane = (c.routing.value?.lanes ?? []).find((l: any) => l.key === t);
  if (!lane) return;
  draft.value.lanes[t] ??= {};
  open.value = t;
  await nextTick();
  document.getElementById(`llx-route-${t}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
onMounted(focusTarget);
watch(() => [ui.target.value, c.routing.value?.lanes?.length], () => void focusTarget());
</script>
