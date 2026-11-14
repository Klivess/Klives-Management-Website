<template>
  <div class="obx-stack">
    <section class="obx-card" aria-label="World">
      <header class="obx-card__head">
        <h2 class="obx-card__title"><ObxIcon name="map" />World</h2>
        <span class="obx-card__meta">{{ drawable ? `r${game.Build.Revision} · drawn from the compiled place` : 'nothing is built in Research' }}</span>
        <div v-if="drawable" class="obx-card__tools">
          <div class="obx-seg" role="group" aria-label="Camera">
            <button v-for="v in views" :key="v.id" class="obx-seg__opt" :aria-pressed="view === v.id" @click="view = v.id">{{ v.label }}</button>
          </div>
          <label v-if="view !== 'map' && view !== 'overview'" class="obx-check" style="font-size: 11.5px"><input v-model="labels" type="checkbox" /> Ids</label>
          <button v-if="playable" class="obx-btn obx-btn--sm obx-btn--brand" @click="emit('play')"><ObxIcon name="play" />Play</button>
        </div>
      </header>
      <div class="obx-card__body">
        <div v-if="!drawable" class="obx-empty">The builder creates the world once the brief is written.</div>
        <template v-else>
          <div class="obx-frame"><ObxImg :path="bloxRenderPath(game.GameId, view, game.Build.LastBuildUtc ?? game.Build.Revision, labels)" ratio="1280 / 760" contain eager :alt="`${game.Store.Title || game.WorkingTitle}: ${view} view`" fallback="Nothing to draw yet." /></div>
          <p class="obx-faint" style="font-size: 11.5px; margin-top: 6px">{{ VIEW_HINT[view] ?? 'A close look at one zone of the map plan.' }}</p>
        </template>
      </div>
    </section>

    <div v-if="drawable" class="obx-split obx-split--even">
      <section class="obx-card" aria-label="Map report" data-testid="obx-map-report">
        <header class="obx-card__head">
          <h2 class="obx-card__title"><ObxIcon name="chart" />Map report</h2>
          <span class="obx-card__meta">{{ report ? `${Math.round(report.AreaWidth)}×${Math.round(report.AreaDepth)} studs · ${report.Objects} objects · ${report.DistinctModels} models` : 'measured on the current files' }}</span>
        </header>
        <div class="obx-card__body">
          <div v-if="reportError" class="obx-banner" data-tone="crit"><ObxIcon class="obx-banner__glyph" name="octagon" /><span class="obx-banner__text"><strong>Could not measure the map</strong><span>{{ reportError }}</span></span></div>
          <div v-else-if="!report" class="obx-skel" style="height: 140px"></div>
          <template v-else>
            <div class="obx-account__row" style="gap: 12px; margin-bottom: 10px">
              <span class="obx-kpi__value" :data-tone="scoreTone" style="font-size: 34px">{{ report.Score }}</span>
              <span class="obx-stack" style="gap: 2px; flex: 1">
                <b>{{ scoreWord }}</b>
                <span class="obx-dim" style="font-size: 11.5px">{{ bar }} is the bar (an error caps the score); 85+ is the aim. {{ Math.round(report.DressedShare * 100) }}% of the play area is dressed.</span>
              </span>
            </div>
            <div v-if="report.Categories?.length" class="obx-bars">
              <div v-for="c in report.Categories" :key="c.Name" class="obx-bars__row" :title="c.Note">
                <span class="obx-bars__label">{{ c.Name }}</span>
                <span class="obx-meter"><span class="obx-meter__fill" :data-tone="c.Score >= c.Max * 0.85 ? 'ok' : c.Score >= c.Max * 0.5 ? 'warn' : 'crit'" :style="{ width: `${Math.round(100 * c.Score / Math.max(1, c.Max))}%` }"></span></span>
                <span class="obx-bars__value">{{ c.Score }}/{{ c.Max }}</span>
              </div>
            </div>
            <ul v-if="findings.length" class="obx-issues" style="margin-top: 10px">
              <li v-for="(f, i) in findings" :key="i"><span class="obx-chip" :data-tone="f.Severity === 'error' ? 'crit' : f.Severity === 'warning' ? 'warn' : 'neutral'">{{ f.Severity }}</span><code>{{ f.Area }}</code><span>{{ f.Message }}</span></li>
            </ul>
            <p v-else class="obx-dim" style="margin-top: 8px">No problems found.</p>
            <details v-if="report.Facts.length" style="margin-top: 10px">
              <summary class="obx-dim">Measurements</summary>
              <ul class="obx-list" style="margin-top: 6px"><li v-for="(f, i) in report.Facts" :key="i">{{ f }}</li></ul>
            </details>
          </template>
        </div>
      </section>

      <section class="obx-card" aria-label="Map plan">
        <header class="obx-card__head">
          <h2 class="obx-card__title"><ObxIcon name="route" />Map plan</h2>
          <span class="obx-card__meta">{{ zones.length ? `${zones.length} zone(s), in the order players reach them` : '' }}</span>
        </header>
        <div class="obx-card__body">
          <div v-if="!report?.Zones.length && !report?.Concept" class="obx-empty">No map plan yet.</div>
          <template v-else-if="report">
            <p v-if="report.Concept" class="obx-ink2" style="margin-bottom: 8px">{{ report.Concept }}</p>
            <ol class="obx-stack" style="gap: 6px">
              <li v-for="z in zones" :key="z.Id">
                <button class="obx-asset" style="width: 100%" :aria-pressed="view === `zone:${z.Id}`" @click="view = `zone:${z.Id}`">
                  <span class="obx-asset__name">{{ z.Order }}. {{ z.Name }}</span>
                  <span class="obx-asset__what" style="white-space: normal">{{ z.Purpose }}<template v-if="z.Theme"> · {{ z.Theme }}</template> · <span class="obx-mono">{{ Math.round(z.Area[2]! - z.Area[0]!) }}×{{ Math.round(z.Area[3]! - z.Area[1]!) }} studs</span></span>
                </button>
              </li>
            </ol>
            <p v-if="report.Landmarks.length" style="margin-top: 8px; font-size: 12px"><span class="obx-dim">Landmarks:</span> {{ report.Landmarks.map(l => l.Name).join(' · ') }}</p>
          </template>
        </div>
      </section>
    </div>

    <section v-if="game.Build.Economy" class="obx-card" aria-label="Economy check" data-testid="obx-economy">
      <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="coins" />Economy check</h2><span class="obx-card__meta">a bot plays the game's own prices on its map at every build</span></header>
      <div class="obx-card__body obx-stack" style="gap: 8px">
        <ul v-if="economyFindings.length" class="obx-issues">
          <li v-for="(f, i) in economyFindings" :key="i"><span class="obx-chip" :data-tone="f.level === 'error' ? 'crit' : 'warn'">{{ f.level }}</span><span>{{ f.text }}</span></li>
        </ul>
        <pre class="obx-code">{{ game.Build.Economy }}</pre>
      </div>
    </section>

    <div class="obx-split obx-split--even">
      <section class="obx-card" aria-label="Build">
        <header class="obx-card__head">
          <h2 class="obx-card__title"><ObxIcon name="wrench" />Build</h2>
          <span v-if="game.Build.Revision" class="obx-chip" :data-tone="game.Build.LastBuildOk ? 'ok' : 'crit'">r{{ game.Build.Revision }} · {{ game.Build.LastBuildOk ? 'compiles' : 'broken' }}</span>
        </header>
        <div class="obx-card__body">
          <dl class="obx-kv">
            <dt>Built</dt><dd>{{ game.Build.LastBuildUtc ? obxAgo(game.Build.LastBuildUtc, now) : 'never' }}</dd>
            <dt>Place</dt><dd>{{ bloxBytes(game.Build.PlaceBytes) }} · {{ obxCount(game.Build.InstanceCount) }} instances · {{ game.Build.ScriptCount }} scripts</dd>
            <dt>Must-haves</dt><dd>{{ game.Build.FeatureComplete ? 'declared complete' : 'in progress' }}</dd>
          </dl>
          <ul v-if="problems.length" class="obx-issues" style="margin-top: 10px">
            <li v-for="(p, i) in problems" :key="i"><span class="obx-chip" :data-tone="p.level === 'error' ? 'crit' : 'warn'">{{ p.tag }}</span><span>{{ p.text }}</span></li>
          </ul>
        </div>
      </section>
      <section class="obx-card" aria-label="Models placed">
        <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="cube" />Models placed</h2><span class="obx-card__meta">{{ game.Build.AssetsUsed.length }} from the library</span></header>
        <div class="obx-card__body">
          <div v-if="!game.Build.AssetsUsed.length" class="obx-empty">None yet.</div>
          <div v-else class="obx-assets" data-dense="true">
            <NuxtLink v-for="id in game.Build.AssetsUsed.slice(0, modelLimit)" :key="id" class="obx-asset" :to="`/schemery/omniblox/assets?asset=${id}`">
              <ObxImg :path="bloxAssetImagePath(id)" ratio="1 / 1" :alt="`Model ${id}`" fallback="#" />
              <span class="obx-asset__name obx-mono">#{{ id }}</span>
            </NuxtLink>
          </div>
          <button v-if="game.Build.AssetsUsed.length > modelLimit" class="obx-btn obx-btn--ghost obx-btn--sm" style="margin-top: 8px" @click="modelLimit += 48">Show {{ Math.min(48, game.Build.AssetsUsed.length - modelLimit) }} more</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { BLOX_MAP_BAR, bloxAssetImagePath, bloxBytes, bloxGet, bloxRenderPath, type BloxDossier, type BloxMapReport } from '~/composables/useOmniBlox';
import { obxAgo, obxCount, type ObxTone } from '~/scripts/omniblox/console';

const props = defineProps<{ game: BloxDossier; playable?: boolean; now: number }>();
const emit = defineEmits<{ play: [] }>();

const BASE_VIEWS = [
  { id: 'map', label: 'Map' },
  { id: 'aerial', label: 'Aerial' },
  { id: 'iso', label: '3/4' },
  { id: 'spawn', label: 'Spawn' },
] as const;
const VIEW_HINT: Record<string, string> = {
  map: 'From above with the map plan: zones, paths, landmarks, the play area, a grid in studs and where the spawn faces.',
  aerial: 'The whole world from high up, as a player flying over it would see it.',
  iso: 'A three-quarter view of everything that is built.',
  spawn: 'What a player sees the moment they join: the first impression.',
};
const view = ref<string>('map');
const labels = ref(false);
const modelLimit = ref(48);

const drawable = computed(() => props.game.Stage !== 'Research' && !(props.game.Stage === 'Abandoned' && props.game.Build.Revision === 0));

const report = ref<BloxMapReport | null>(null);
const reportError = ref<string | null>(null);
async function loadReport() {
  if (!drawable.value) return;
  const result = await bloxGet<BloxMapReport>(`/omniblox/game/map?id=${encodeURIComponent(props.game.GameId)}`);
  if (result.ok && result.data) { report.value = result.data; reportError.value = null; }
  else reportError.value = result.error;
}
// Measured again after every build (the files only change the picture when they are built).
watch(() => [props.game.GameId, props.game.Build.LastBuildUtc], loadReport, { immediate: true });

const zones = computed(() => (report.value?.Zones ?? []).slice().sort((a, b) => a.Order - b.Order));
const views = computed(() => [...BASE_VIEWS, ...zones.value.slice(0, 5).map(z => ({ id: `zone:${z.Id}`, label: z.Name }))]);
const rank = (s: string) => (s === 'error' ? 0 : s === 'warning' ? 1 : 2);
const findings = computed(() => (report.value?.Findings ?? []).slice().sort((a, b) => rank(a.Severity) - rank(b.Severity)));
const blocked = computed(() => report.value?.Blocked ?? (report.value?.Findings ?? []).some(f => f.Severity === 'error'));
const bar = computed(() => report.value?.Bar ?? BLOX_MAP_BAR);
const scoreTone = computed<ObxTone>(() => { const s = report.value?.Score ?? 0; return blocked.value || s < bar.value ? 'crit' : s >= 85 ? 'ok' : 'warn'; });
const scoreWord = computed(() => {
  const s = report.value?.Score ?? 0;
  if (blocked.value) return 'Not ready: fix the errors first';
  return s >= 85 ? 'A full, finished world' : s >= bar.value ? 'Good enough to ship; room to improve' : 'Not ready: the map needs work';
});
const economyFindings = computed(() => (props.game.Build.EconomyFindings ?? []).map(line => {
  const m = /^\[(\w+)\]\s*(?:[\w ]+:\s*)?(.*)$/.exec(line);
  return m ? { level: m[1]!.toLowerCase(), text: m[2]! } : { level: 'warning', text: line };
}));
const problems = computed(() => {
  const parse = (line: string, fallback: 'error' | 'warning') => {
    const m = /^\[(geometry|types)\]\s*(?:\[(\w+)\]\s*)?(.*)$/.exec(line);
    return m ? { tag: m[1]!, level: (m[2] ?? fallback).toLowerCase(), text: m[3]! } : { tag: 'build', level: fallback, text: line };
  };
  return [...props.game.Build.Errors.map(e => parse(e, 'error')), ...props.game.Build.Warnings.map(w => parse(w, 'warning'))];
});
</script>
