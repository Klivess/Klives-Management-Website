<template>
  <div class="obx-split obx-split--even">
    <div class="obx-stack">
      <section class="obx-card" aria-label="Checks on the current files" data-testid="obx-checks">
        <header class="obx-card__head">
          <h2 class="obx-card__title"><ObxIcon name="flask" />Checks</h2>
          <span class="obx-card__meta">{{ game.Build.Revision ? `on r${game.Build.Revision}` : 'not built yet' }}</span>
          <div v-if="canAct && buildable" class="obx-card__tools">
            <button class="obx-btn obx-btn--sm" :disabled="busy !== null" data-testid="obx-build" @click="build"><ObxIcon :name="busy === 'build' ? 'refresh' : 'wrench'" :class="{ 'obx-spin': busy === 'build' }" />{{ busy === 'build' ? 'Building…' : 'Build now' }}</button>
            <button class="obx-btn obx-btn--sm obx-btn--primary" :disabled="busy !== null || !(engineAvailable || localEngine) || testing" :title="runTitle" data-testid="obx-run" @click="runTests">
              <ObxIcon :name="testing ? 'refresh' : 'play'" :class="{ 'obx-spin': testing }" />{{ testing ? (standIn ? 'Running locally…' : 'Running in Roblox…') : (standIn ? 'Run locally' : 'Run in Roblox') }}
            </button>
          </div>
        </header>
        <div class="obx-card__body">
          <ul class="obx-checks">
            <li v-for="c in checks" :key="c.name" class="obx-check-row">
              <span class="obx-check-row__mark" :data-tone="c.ok === null ? 'neutral' : c.ok ? 'ok' : 'crit'">{{ c.ok === null ? '–' : c.ok ? '✓' : '✗' }}</span>
              <div><b>{{ c.name }}</b><small>{{ c.detail }}</small></div>
            </li>
          </ul>
          <pre v-if="buildReport" class="obx-code" style="margin-top: 10px">{{ buildReport }}</pre>
        </div>
      </section>

      <section v-if="game.LastTest" class="obx-card" aria-label="Test stage">
        <header class="obx-card__head">
          <h2 class="obx-card__title"><ObxIcon name="check-circle" />Test stage</h2>
          <span class="obx-chip" :data-tone="game.LastTest.Passed ? 'ok' : 'crit'">{{ game.LastTest.Passed ? 'Passed' : 'Failed' }}</span>
          <span class="obx-card__meta">r{{ game.LastTest.BuildRevision }} · {{ obxAgo(game.LastTest.Utc, now) }}</span>
        </header>
        <div class="obx-card__body">
          <p class="obx-ink2 obx-prose">{{ game.LastTest.Summary }}</p>
          <ul v-if="testIssues.length" class="obx-issues" style="margin-top: 8px">
            <li v-for="(issue, i) in testIssues" :key="i"><span class="obx-chip" :data-tone="issue.Severity === 'error' ? 'crit' : issue.Severity === 'warning' ? 'warn' : 'neutral'">{{ issue.Severity }}</span><code>{{ issue.Area }}</code><span>{{ issue.Message }}</span></li>
          </ul>
        </div>
      </section>
    </div>

    <section class="obx-card" aria-label="Engine run" data-testid="obx-engine">
      <header class="obx-card__head">
        <h2 class="obx-card__title"><ObxIcon name="chip" />{{ run?.Local ? 'Local engine run' : 'Roblox engine run' }}</h2>
        <span v-if="run" class="obx-chip" :data-tone="run.Ok ? 'ok' : 'crit'">{{ run.Ok ? 'Passed' : 'Failed' }}</span>
        <span v-if="run" class="obx-card__meta">r{{ run.Revision }}{{ run.Revision === game.Build.Revision ? ' (this build)' : ' (older)' }} · {{ obxAgo(run.Utc, now) }}</span>
      </header>
      <div class="obx-card__body obx-stack" style="gap: 10px">
        <div v-if="!run" class="obx-empty"><ObxIcon name="chip" /><span>{{ emptyText }}</span></div>
        <template v-else>
          <p class="obx-ink2">{{ run.Local ? run.Summary.replace(/^Local engine:\s*/, '') : run.Summary }}</p>
          <p v-if="run.Local" class="obx-faint" style="font-size: 11.5px">A stand-in for Roblox's engine — the same checks and playthrough, without physics, replication or clients — until the API key and an experience slot exist. Roblox's engine runs the game again before launch.</p>
          <p v-if="run.KitFailed" class="obx-banner" data-tone="warn"><ObxIcon class="obx-banner__glyph" name="alert" /><span class="obx-banner__text"><strong>The kit's own checks failed</strong><span>They run before any game code, so this is a studio bug, not the game's: it is on your task list.</span></span></p>
          <template v-if="failing.length">
            <h3 class="obx-sub" style="margin-top: 4px">Failing checks</h3>
            <ul class="obx-stack" style="gap: 8px">
              <li v-for="c in failing" :key="c.Name" class="obx-stack" style="gap: 3px">
                <span class="obx-account__row" style="gap: 6px"><span class="obx-chip">{{ c.Phase }}</span><span v-if="c.Owner === 'kit'" class="obx-chip" data-tone="warn">kit</span><b>{{ c.Name }}</b></span>
                <pre v-if="c.Detail" class="obx-code" style="color: #ffc6cc">{{ c.Detail }}</pre>
              </li>
            </ul>
          </template>
          <template v-if="run.Errors.length">
            <h3 class="obx-sub" style="margin-top: 4px">Runtime errors</h3>
            <ul class="obx-stack" style="gap: 8px">
              <li v-for="(e, i) in run.Errors" :key="i" class="obx-stack" style="gap: 3px">
                <span class="obx-account__row" style="gap: 6px"><span class="obx-chip">{{ e.Phase }}</span><code v-if="e.File" class="obx-mono">{{ e.File }}{{ e.Line ? `:${e.Line}` : '' }}</code></span>
                <pre class="obx-code" style="color: #ffc6cc">{{ e.Message }}</pre>
                <details v-if="e.Trace"><summary class="obx-dim">Stack trace</summary><pre class="obx-code" style="margin-top: 4px">{{ e.Trace }}</pre></details>
              </li>
            </ul>
          </template>
          <template v-if="run.Warnings.length || noted.length">
            <h3 class="obx-sub" style="margin-top: 4px">Warnings</h3>
            <ul class="obx-list"><li v-for="(w, i) in run.Warnings" :key="`w${i}`">{{ w }}</li><li v-for="(w, i) in noted" :key="`n${i}`">{{ w }}</li></ul>
          </template>
          <details v-if="passing.length">
            <summary class="obx-dim">{{ passing.length }} check(s) passed</summary>
            <ul class="obx-stack" style="gap: 4px; margin-top: 6px; font-size: 12px">
              <li v-for="c in passing" :key="c.Name" class="obx-account__row" style="gap: 6px"><span class="obx-chip" data-tone="ok">{{ c.Phase }}</span>{{ c.Name }}<span v-if="c.Skipped" class="obx-dim">— did not apply</span></li>
            </ul>
          </details>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { BLOX_MAP_BAR, bloxPost, type BloxDossier } from '~/composables/useOmniBlox';
import { obxToast } from '~/composables/useObxConsole';
import { obxAgo, obxCount } from '~/scripts/omniblox/console';

const props = defineProps<{ game: BloxDossier; engineAvailable: boolean; localEngine?: boolean; canAct: boolean; now: number }>();
const emit = defineEmits<{ changed: [] }>();

const run = computed(() => props.game.Build.LastEngineRun ?? null);
const failing = computed(() => (run.value?.Results ?? []).filter(c => !c.Ok));
const passing = computed(() => (run.value?.Results ?? []).filter(c => c.Ok));
const noted = computed(() => passing.value.flatMap(c => c.Warnings.map(w => `${c.Name}: ${w}`)));
const typeErrors = computed(() => props.game.Build.Errors.filter(e => e.startsWith('[types]')).length);
const geometryErrors = computed(() => props.game.Build.Errors.filter(e => e.startsWith('[geometry]')).length);
const geometryWarnings = computed(() => props.game.Build.Warnings.filter(e => e.startsWith('[geometry]')).length);
const mapBlocked = computed(() => (props.game.Build.MapFindings ?? []).some(f => f.startsWith('[error]')));
const buildable = computed(() => props.game.Stage !== 'Research' && props.game.Stage !== 'Abandoned');
const rank = (s: string) => (s === 'error' ? 0 : s === 'warning' ? 1 : 2);
const testIssues = computed(() => (props.game.LastTest?.Issues ?? []).slice().sort((a, b) => rank(a.Severity) - rank(b.Severity)));

/** Roblox's engine cannot run the game yet and the studio's local engine stands in for it. */
const standIn = computed(() => !props.engineAvailable && !!props.localEngine);
const runTitle = computed(() => (props.engineAvailable ? 'Runs the game in Roblox\'s engine (about a minute)'
  : standIn.value ? 'No API key or experience slot yet: runs the game in the studio\'s local engine (about a minute)'
  : 'Needs the Roblox API key and an experience slot'));
const emptyText = computed(() => (props.engineAvailable
  ? 'Run in Roblox starts one: the kit checks itself, every module loads, the server boots, then the world and the game\'s own checks.'
  : standIn.value ? 'Run locally starts one in the studio\'s local engine, which stands in until the API key and an experience slot exist.'
  : 'Engine runs need the Roblox API key and a free experience slot.'));

/** true passed on this build · false failed on it · null not run on it (in the engine that counts now). */
const engineState = computed<boolean | null>(() => {
  const r = run.value;
  if (!r || r.Revision !== props.game.Build.Revision) return null;
  if (r.Local && props.engineAvailable) return null;
  return r.Ok;
});
const engineLine = computed(() => {
  const r = run.value;
  if (!props.engineAvailable && !standIn.value && !r) return 'not available yet (needs the API key and an experience slot)';
  if (!r) return standIn.value ? 'never run — the local engine stands in until the API key and a slot exist' : 'never run';
  if (r.Revision !== props.game.Build.Revision) return `last run on r${r.Revision}; not run on this build`;
  if (r.Local && props.engineAvailable) return 'ran only in the local engine; Roblox\'s engine has not run this build';
  return r.Local ? r.Summary.replace(/^Local engine:\s*/, '') : r.Summary;
});

const checks = computed(() => {
  const b = props.game.Build;
  const built = b.Revision > 0;
  return [
    { name: 'Compiles', ok: built ? b.LastBuildOk : null, detail: `${b.LastBuildUtc ? `built ${obxAgo(b.LastBuildUtc, props.now)}` : 'never built'} · ${b.ScriptCount} scripts, ${obxCount(b.InstanceCount)} instances` },
    { name: 'Strict types', ok: b.TypeChecked ? typeErrors.value === 0 : null, detail: b.TypeChecked ? `${typeErrors.value} error(s) — every call checked against Roblox's API and the kit` : (b.TypeCheckNote || 'not checked') },
    { name: 'Geometry', ok: built ? geometryErrors.value === 0 : null, detail: `${geometryErrors.value} error(s), ${geometryWarnings.value} warning(s): floating, buried, unreachable, out of bounds` },
    { name: 'Map', ok: b.MapScore == null ? null : b.MapScore >= BLOX_MAP_BAR && !mapBlocked.value, detail: b.MapScore == null ? 'not measured yet' : `${b.MapScore}/100 (${BLOX_MAP_BAR} is the bar, 85+ the aim)${mapBlocked.value ? ' — blocking problems' : ''}` },
    { name: standIn.value ? 'Local engine' : 'Roblox\'s engine', ok: engineState.value, detail: engineLine.value },
  ];
});

const busy = ref<'build' | 'test' | null>(null);
const buildReport = ref<string | null>(null);
async function build() {
  busy.value = 'build';
  try {
    const result = await bloxPost<{ ok: boolean; report: string; revision: number; mapScore: number }>('/omniblox/games/build', { gameId: props.game.GameId });
    if (!result.ok) { obxToast('Build failed to run', result.error ?? '', 'crit'); return; }
    buildReport.value = result.data?.report ?? null;
    emit('changed');
  } finally {
    busy.value = null;
  }
}

// An engine run happens in the background; the page's poll brings the result (LastEngineRun changes).
const testing = ref(false);
const startedFrom = ref<string | null>(null);
async function runTests() {
  busy.value = 'test';
  try {
    const result = await bloxPost<{ started: boolean; local?: boolean }>('/omniblox/games/test', { gameId: props.game.GameId });
    if (!result.ok) { obxToast('Could not start the run', result.error ?? '', 'crit'); return; }
    obxToast((result.data?.local ?? standIn.value) ? 'Running in the local engine' : 'Running in Roblox', 'The result arrives in about a minute.', 'info');
    startedFrom.value = run.value?.Utc ?? '';
    testing.value = true;
    emit('changed');
  } finally {
    busy.value = null;
  }
}
watch(() => run.value?.Utc, utc => {
  if (testing.value && utc && utc !== startedFrom.value) {
    testing.value = false;
    const where = run.value?.Local ? 'in the local engine' : 'in Roblox';
    obxToast(run.value?.Ok ? `Passed ${where}` : `Failed ${where}`, run.value?.Summary ?? '', run.value?.Ok ? 'ok' : 'crit');
  }
});
</script>
