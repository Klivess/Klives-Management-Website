<template>
  <div>
    <div class="odx-stats">
      <div class="odx-stat"><div class="odx-stat__label">Classifier</div><div class="odx-stat__value" :data-tone="engineTone" data-testid="fp-engine">{{ engineWord }}</div></div>
      <div class="odx-stat"><div class="odx-stat__label">Fingerprints</div><div class="odx-stat__value">{{ fmtInt(engine?.fingerprints) }}</div></div>
      <div class="odx-stat"><div class="odx-stat__label">Signals folded</div><div class="odx-stat__value">{{ fmtCompact(engine?.signalsFolded) }}</div></div>
      <div class="odx-stat"><div class="odx-stat__label">Waiting</div><div class="odx-stat__value" :data-tone="(engine?.backlog ?? 0) > 5000 ? 'warn' : undefined">{{ fmtInt(engine?.backlog) }}</div></div>
      <div class="odx-stat"><div class="odx-stat__label">Classified</div><div class="odx-stat__value">{{ fmtCompact(engine?.classifications) }}</div></div>
      <div class="odx-stat"><div class="odx-stat__label">Cloud ranges</div><div class="odx-stat__value">{{ fmtCompact(status?.intel?.datacenterRanges) }}</div></div>
      <div class="odx-stat"><div class="odx-stat__label">Crawler ranges</div><div class="odx-stat__value">{{ fmtCompact(status?.intel?.crawlerRanges) }}</div></div>
      <div class="odx-stat"><div class="odx-stat__label">Tor exits</div><div class="odx-stat__value">{{ fmtCompact(status?.intel?.torExits) }}</div></div>
    </div>
    <p v-if="loading" class="odx-note" style="margin: 0; padding: 0 14px 12px" data-testid="fp-loading">The engine loads once the routes are up. Until it has, new visitors are not classified.</p>

    <div class="odx-two">
      <section aria-label="Classes">
        <div class="odx-section-head"><h3><DefenceIcon name="fingerprint" /> Who visits</h3><span class="odx-card__meta">{{ fmtInt(totalClassified) }} addresses</span></div>
        <div class="odx-section-body">
          <div class="odx-bars">
            <div v-for="row in classRows" :key="row.id" class="odx-bar-row" :style="{ '--cls': row.color }" :title="row.description">
              <DefenceClassPill :id="row.id" :classes="classes" />
              <div class="odx-bar-row__track"><div class="odx-bar-row__fill" :style="{ width: `${row.share * 100}%` }"></div></div>
              <span class="odx-num" style="text-align: right">{{ fmtInt(row.count) }}</span>
            </div>
          </div>
          <div v-if="feeds.length" class="odx-note" style="margin-top: 12px">
            Range feeds: <span v-for="(feed, i) in feeds" :key="feed.name">{{ i ? ' · ' : '' }}<b>{{ feed.name }}</b> {{ feed.when }}</span>
          </div>
          <div v-if="canAct" class="odx-actions-row" style="justify-content: flex-start">
            <button class="odx-btn odx-btn--sm" @click="emit('reclassify')"><DefenceIcon name="refresh" />Reclassify every address</button>
          </div>
        </div>
      </section>

      <section v-if="draft" aria-label="Settings">
        <div class="odx-section-head">
          <h3><DefenceIcon name="sliders" /> Rules</h3>
          <span v-if="dirty" class="odx-chip" data-tone="warn">Unsaved</span>
          <div class="odx-card__tools">
            <button v-if="dirty" class="odx-btn odx-btn--xs odx-btn--ghost" @click="reset">Undo changes</button>
          </div>
        </div>
        <div class="odx-section-body">
          <template v-if="limits">
            <div class="odx-setting">
              <div class="odx-setting__label">Put on Watch at score<small>Answered as normal, flagged for review.</small></div>
              <input v-model.number="limits.autoWatchScore" class="odx-input" type="number" min="1" max="10000" :disabled="!canEdit" />
            </div>
            <div class="odx-setting">
              <div class="odx-setting__label">Block at score<small>Refused from then on. People proven by the beacon are never blocked by score.</small></div>
              <input v-model.number="limits.autoBlockScore" class="odx-input" type="number" min="1" max="10000" :disabled="!canEdit" />
            </div>
          </template>
          <div class="odx-setting">
            <div class="odx-setting__label">Fingerprinting<small>Classify every visitor from headers, timing, network and the browser beacon.</small></div>
            <label class="odx-check"><input v-model="draft.enabled" type="checkbox" :disabled="!canEdit" />{{ draft.enabled ? 'On' : 'Off' }}</label>
          </div>
          <div class="odx-setting">
            <div class="odx-setting__label">Raise the score of hostile classes<small>A new hostile verdict adds to the threat score.</small></div>
            <label class="odx-check"><input v-model="draft.classScoreDeltas" type="checkbox" :disabled="!canEdit" />{{ draft.classScoreDeltas ? 'On' : 'Off' }}</label>
          </div>
          <div class="odx-setting">
            <div class="odx-setting__label">Browser beacon<small>Proves a real person in a real browser.</small></div>
            <label class="odx-check"><input v-model="draft.beaconEnabled" type="checkbox" :disabled="!canEdit" />{{ draft.beaconEnabled ? 'On' : 'Off' }}</label>
          </div>
          <div class="odx-setting">
            <div class="odx-setting__label">robots.txt trap<small class="odx-mono">{{ draft.robotsTrapPath || '' }}</small></div>
            <label class="odx-check"><input v-model="draft.robotsTrapEnabled" type="checkbox" :disabled="!canEdit" />{{ draft.robotsTrapEnabled ? 'On' : 'Off' }}</label>
          </div>

          <h4 class="odx-dim" style="margin: 14px 0 4px; font-size: 11px; letter-spacing: 0.07em; text-transform: uppercase">Automatic actions</h4>
          <p class="odx-note">Applied when an address is classified at least {{ Math.round((draft.autoActionMinConfidence ?? 0.9) * 100) }}% sure. Profile-linked addresses are never touched.</p>
          <div v-for="cls in draft.actionableClasses || []" :key="cls" class="odx-setting">
            <div class="odx-setting__label"><DefenceClassPill :id="cls" :classes="classes" /></div>
            <select v-model="draft.autoActions[cls]" class="odx-select" :disabled="!canEdit">
              <option v-for="action in draft.allowedActions || []" :key="action" :value="action">{{ action }}</option>
            </select>
          </div>
          <div class="odx-setting">
            <div class="odx-setting__label">Minimum confidence</div>
            <input v-model.number="draft.autoActionMinConfidence" class="odx-input" type="number" min="0.5" max="1" step="0.05" :disabled="!canEdit" />
          </div>

          <h4 class="odx-dim" style="margin: 14px 0 4px; font-size: 11px; letter-spacing: 0.07em; text-transform: uppercase">Intelligence</h4>
          <div class="odx-setting">
            <div class="odx-setting__label">Reverse DNS and crawler proof</div>
            <label class="odx-check"><input v-model="draft.intelReverseDns" type="checkbox" :disabled="!canEdit" />{{ draft.intelReverseDns ? 'On' : 'Off' }}</label>
          </div>
          <div class="odx-setting">
            <div class="odx-setting__label">Range feeds<small>Tor exits, cloud and crawler ranges, refreshed hourly.</small></div>
            <label class="odx-check"><input v-model="draft.intelFeeds" type="checkbox" :disabled="!canEdit" />{{ draft.intelFeeds ? 'On' : 'Off' }}</label>
          </div>
          <div class="odx-setting">
            <div class="odx-setting__label">AbuseIPDB<small :data-tone="draft.intelAbuseIpDb && !draft.abuseIpDbKeySet ? 'warn' : undefined" :style="draft.intelAbuseIpDb && !draft.abuseIpDbKeySet ? 'color: var(--tone)' : ''">{{ draft.abuseIpDbKeySet ? 'Key set' : 'No key: set the OmniSetting AbuseIPDBKey' }}</small></div>
            <input v-model.number="draft.abuseIpDbDailyBudget" class="odx-input" type="number" min="0" max="1000" title="Lookups a day" :disabled="!canEdit" />
            <label class="odx-check"><input v-model="draft.intelAbuseIpDb" type="checkbox" :disabled="!canEdit" /></label>
          </div>
          <div class="odx-setting">
            <div class="odx-setting__label">GreyNoise<small :style="draft.intelGreyNoise && !draft.greyNoiseKeySet ? 'color: var(--odx-warn)' : ''">{{ draft.greyNoiseKeySet ? 'Key set' : 'No key: set the OmniSetting GreyNoiseKey' }}</small></div>
            <input v-model.number="draft.greyNoiseDailyBudget" class="odx-input" type="number" min="0" max="1000" title="Lookups a day" :disabled="!canEdit" />
            <label class="odx-check"><input v-model="draft.intelGreyNoise" type="checkbox" :disabled="!canEdit" /></label>
          </div>
          <div v-if="canEdit" class="odx-actions-row">
            <button class="odx-btn odx-btn--primary odx-btn--sm" :disabled="!dirty || saving" data-testid="fp-save" @click="save"><DefenceIcon name="check" />Save rules</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fmtCompact, fmtInt, type ClassInfo } from '~/scripts/omniDefence';

/** The classifier: whether it is keeping up, what it has found, and the rules it acts on. */
const props = defineProps<{
  status: any | null;
  /** Start-up is still loading the engine: its counts read zero because it does not exist yet. */
  loading?: boolean;
  thresholds:{ autoWatchScore: number; autoBlockScore: number; escalation2: number; escalation3: number } | null;
  classes: readonly ClassInfo[];
  canEdit: boolean;
  canAct: boolean;
  save: (change: Record<string, unknown>) => Promise<boolean>;
}>();
const emit = defineEmits<{ reclassify: [] }>();

const draft = ref<any | null>(null);
const limits = ref<{ autoWatchScore: number; autoBlockScore: number } | null>(null);
const saving = ref(false);
let baseline = '';

function snapshot() { return JSON.stringify({ d: draft.value, l: limits.value }); }

function reset() {
  draft.value = props.status?.settings ? JSON.parse(JSON.stringify(props.status.settings)) : null;
  if (draft.value && !draft.value.autoActions) draft.value.autoActions = {};
  limits.value = props.thresholds ? { autoWatchScore: props.thresholds.autoWatchScore, autoBlockScore: props.thresholds.autoBlockScore } : null;
  baseline = snapshot();
}

const dirty = computed(() => !!draft.value && snapshot() !== baseline);

// Fresh server values replace the form only while nothing is being edited.
watch(() => [props.status?.settings, props.thresholds], () => { if (!dirty.value) reset(); }, { immediate: true });

async function save() {
  if (!draft.value) return;
  saving.value = true;
  try {
    const change: Record<string, unknown> = { fingerprint: draft.value };
    if (limits.value) Object.assign(change, limits.value);
    if (await props.save(change)) baseline = snapshot();
  } finally { saving.value = false; }
}

const engineWord = computed(() => {
  const s = props.status;
  if (props.loading && !s?.running) return 'Loading';
  if (!s) return '—';
  if (s.backfillRunning) return 'Backfilling';
  return s.running ? 'Running' : 'Stopped';
});
const engineTone = computed(() => (props.loading && !props.status?.running ? 'info' : !props.status ? undefined : props.status.running ? 'ok' : 'crit'));
/** The engine's own counts, which do not exist until it has loaded. */
const engine = computed(() => (props.loading && !props.status?.running ? null : props.status));

const totalClassified = computed(() => Object.values(props.status?.classBreakdown ?? {}).reduce((n: number, v: any) => n + (Number(v) || 0), 0));
const classRows = computed(() => {
  const breakdown: Record<string, number> = props.status?.classBreakdown ?? {};
  const max = Math.max(1, ...Object.values(breakdown).map(Number));
  return props.classes
    .map(c => ({ ...c, count: Number(breakdown[c.id] ?? 0), share: Number(breakdown[c.id] ?? 0) / max }))
    .filter(row => row.count > 0)
    .sort((a, b) => b.count - a.count);
});
const feeds = computed(() => Object.entries(props.status?.intel?.feeds ?? {}).map(([name, value]) => {
  const at = typeof value === 'string' && value !== 'cached' ? new Date(value) : null;
  return { name, when: at && !Number.isNaN(at.getTime()) ? at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'cached' };
}));
</script>
