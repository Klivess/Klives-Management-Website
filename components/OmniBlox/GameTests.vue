<template>
    <div class="ot-grid two">
        <div class="col">
            <OmniTraderCard title="Checks on the current files" :subtitle="game.Build.Revision ? `Revision ${game.Build.Revision}` : 'Not built yet'">
                <template v-if="canAct && buildable" #controls>
                    <button type="button" class="ot-btn sm" :disabled="busy !== null" @click="build">{{ busy === 'build' ? 'Building…' : 'Build now' }}</button>
                    <button type="button" class="ot-btn primary sm" :disabled="busy !== null || !engineAvailable || testing"
                            :title="engineAvailable ? 'Runs the game in Roblox\'s engine (about a minute)' : 'Needs the Roblox API key and an experience slot'" @click="runTests">
                        {{ testing ? 'Running in Roblox…' : 'Run in Roblox' }}
                    </button>
                </template>
                <ul class="checks">
                    <li :class="tone(game.Build.Revision > 0 ? game.Build.LastBuildOk : null)">
                        <span class="mark" aria-hidden="true">{{ mark(game.Build.Revision > 0 ? game.Build.LastBuildOk : null) }}</span>
                        <div><strong>Compiles</strong><span class="sub">{{ game.Build.LastBuildUtc ? `built ${fmtRelative(game.Build.LastBuildUtc, now)}` : 'never built' }} · {{ game.Build.ScriptCount }} scripts, {{ fmtCount(game.Build.InstanceCount) }} instances</span></div>
                    </li>
                    <li :class="tone(game.Build.TypeChecked ? typeErrors === 0 : null)">
                        <span class="mark" aria-hidden="true">{{ mark(game.Build.TypeChecked ? typeErrors === 0 : null) }}</span>
                        <div><strong>Strict types</strong><span class="sub">{{ game.Build.TypeChecked ? `${typeErrors} error(s) — every call checked against Roblox's API and the kit` : (game.Build.TypeCheckNote || 'not checked') }}</span></div>
                    </li>
                    <li :class="tone(game.Build.Revision > 0 ? geometryErrors === 0 : null)">
                        <span class="mark" aria-hidden="true">{{ mark(game.Build.Revision > 0 ? geometryErrors === 0 : null) }}</span>
                        <div><strong>Geometry</strong><span class="sub">{{ geometryErrors }} error(s), {{ geometryWarnings }} warning(s): floating, buried, unreachable, out of bounds</span></div>
                    </li>
                    <li :class="tone(game.Build.MapScore == null ? null : game.Build.MapScore >= 60 && !mapBlocked)">
                        <span class="mark" aria-hidden="true">{{ mark(game.Build.MapScore == null ? null : game.Build.MapScore >= 60 && !mapBlocked) }}</span>
                        <div><strong>Map</strong><span class="sub">{{ game.Build.MapScore == null ? 'not measured yet' : `${game.Build.MapScore}/100 (60 is the bar, 80+ is the aim)${mapBlocked ? ' — blocking problems' : ''}` }}</span></div>
                    </li>
                    <li :class="tone(engineState)">
                        <span class="mark" aria-hidden="true">{{ mark(engineState) }}</span>
                        <div><strong>Roblox's engine</strong><span class="sub">{{ engineLine }}</span></div>
                    </li>
                </ul>
                <pre v-if="buildReport" class="report">{{ buildReport }}</pre>
            </OmniTraderCard>

            <OmniTraderCard v-if="game.LastTest" title="Test stage" :subtitle="`r${game.LastTest.BuildRevision} · ${fmtRelative(game.LastTest.Utc, now)}`">
                <p class="testline">
                    <span class="ot-chip" :class="game.LastTest.Passed ? 'ok' : 'bad'">{{ game.LastTest.Passed ? 'Passed' : 'Failed' }}</span>
                    <span v-if="game.LastTest.MapScore != null" class="ot-chip">map {{ game.LastTest.MapScore }}/100</span>
                    {{ game.LastTest.Summary }}
                </p>
                <ul v-if="testIssues.length" class="issues">
                    <li v-for="(issue, i) in testIssues" :key="i" :class="issue.Severity">
                        <span class="sev">{{ issue.Severity }}</span><span class="area">{{ issue.Area }}</span>{{ issue.Message }}
                    </li>
                </ul>
            </OmniTraderCard>
        </div>

        <div class="col">
            <OmniTraderCard title="Last run in Roblox's engine" :empty="!run" empty-title="Not run yet"
                            :empty-text="engineAvailable ? 'Run in Roblox starts one: the kit checks itself, every module loads, the whole server boots, then the world and the game\'s own checks.' : 'Engine runs need the Roblox API key and a free experience slot.'"
                            :subtitle="run ? `r${run.Revision}${run.Revision === game.Build.Revision ? ' (this build)' : ' (an older build)'} · ${fmtRelative(run.Utc, now)}${run.Version ? ` · place version ${run.Version}` : ''}` : undefined">
                <template v-if="run">
                    <p class="testline">
                        <span class="ot-chip" :class="run.Ok ? 'ok' : 'bad'">{{ run.Ok ? 'Passed' : 'Failed' }}</span>
                        {{ run.Summary }}
                    </p>
                    <div v-if="run.KitFailed" class="ot-banner warn" role="note">
                        <span class="glyph" aria-hidden="true">!</span>
                        <div><strong>The kit's own checks failed</strong> They run before any game code, so this is a studio bug, not the game's: the game is not blamed for it, and it is on your task list.</div>
                    </div>
                    <template v-if="failing.length">
                        <h3 class="ot-sectionhead bx-sub">Failing checks</h3>
                        <ul class="cases">
                            <li v-for="c in failing" :key="c.Name" class="bad">
                                <div class="name"><span class="ot-chip">{{ c.Phase }}</span><span v-if="c.Owner === 'kit'" class="ot-chip">kit</span>{{ c.Name }}</div>
                                <p v-if="c.Detail" class="detail">{{ c.Detail }}</p>
                            </li>
                        </ul>
                    </template>
                    <template v-if="run.Errors.length">
                        <h3 class="ot-sectionhead bx-sub">Runtime errors</h3>
                        <ul class="cases">
                            <li v-for="(e, i) in run.Errors" :key="i" class="bad">
                                <div class="name"><span class="ot-chip">{{ e.Phase }}</span><code v-if="e.File">{{ e.File }}{{ e.Line ? `:${e.Line}` : '' }}</code></div>
                                <p class="detail">{{ e.Message }}</p>
                                <details v-if="e.Trace"><summary>Stack trace</summary><pre class="trace">{{ e.Trace }}</pre></details>
                            </li>
                        </ul>
                    </template>
                    <template v-if="run.Warnings.length || noted.length">
                        <h3 class="ot-sectionhead bx-sub">Warnings</h3>
                        <ul class="bx-list small">
                            <li v-for="(w, i) in run.Warnings" :key="`w${i}`">{{ w }}</li>
                            <li v-for="(w, i) in noted" :key="`n${i}`">{{ w }}</li>
                        </ul>
                    </template>
                    <details v-if="passing.length" class="passed">
                        <summary>{{ passing.length }} check(s) passed</summary>
                        <ul class="cases">
                            <li v-for="c in passing" :key="c.Name" class="ok">
                                <div class="name"><span class="ot-chip">{{ c.Phase }}</span>{{ c.Name }}<span v-if="c.Skipped" class="bx-muted"> — did not apply</span></div>
                            </li>
                        </ul>
                    </details>
                </template>
            </OmniTraderCard>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fmtCount, fmtRelative, notify, useNow } from '~/composables/useOmniTumblr';
import { bloxPost, type BloxDossier } from '~/composables/useOmniBlox';

const props = defineProps<{ game: BloxDossier; engineAvailable: boolean; canAct: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const now = useNow();

const run = computed(() => props.game.Build.LastEngineRun ?? null);
const failing = computed(() => (run.value?.Results ?? []).filter(c => !c.Ok));
const passing = computed(() => (run.value?.Results ?? []).filter(c => c.Ok));
const noted = computed(() => passing.value.flatMap(c => c.Warnings.map(w => `${c.Name}: ${w}`)));
const typeErrors = computed(() => props.game.Build.Errors.filter(e => e.startsWith('[types]')).length);
const geometryErrors = computed(() => props.game.Build.Errors.filter(e => e.startsWith('[geometry]')).length);
const geometryWarnings = computed(() => props.game.Build.Warnings.filter(e => e.startsWith('[geometry]')).length);
const mapBlocked = computed(() => (props.game.Build.MapFindings ?? []).some(f => f.startsWith('[error]')));
const buildable = computed(() => props.game.Stage !== 'Research' && props.game.Stage !== 'Abandoned');
const testIssues = computed(() => (props.game.LastTest?.Issues ?? []).slice()
    .sort((a, b) => rank(a.Severity) - rank(b.Severity)));
const rank = (s: string) => s === 'error' ? 0 : s === 'warning' ? 1 : 2;

/** true passed on this build · false failed on it · null not run on it. */
const engineState = computed<boolean | null>(() => {
    const r = run.value;
    if (!r || r.Revision !== props.game.Build.Revision) return null;
    return r.Ok;
});
const engineLine = computed(() => {
    const r = run.value;
    if (!props.engineAvailable && !r) return 'not available yet (needs the API key and an experience slot)';
    if (!r) return 'never run';
    if (r.Revision !== props.game.Build.Revision) return `last run on r${r.Revision}; not run on this build`;
    return r.Summary;
});

const mark = (ok: boolean | null) => ok === null ? '–' : ok ? '✓' : '✗';
const tone = (ok: boolean | null) => ok === null ? 'idle' : ok ? 'ok' : 'bad';

const busy = ref<'build' | 'test' | null>(null);
const buildReport = ref<string | null>(null);
async function build() {
    busy.value = 'build';
    try {
        const result = await bloxPost<{ ok: boolean; report: string; revision: number; mapScore: number }>('/omniblox/games/build', { gameId: props.game.GameId });
        if (!result.ok) { notify('Build failed to run', result.error ?? '', 'error'); return; }
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
        const result = await bloxPost('/omniblox/games/test', { gameId: props.game.GameId });
        if (!result.ok) { notify('Could not start the run', result.error ?? '', 'error'); return; }
        notify('Running in Roblox', 'The result arrives in about a minute.', 'info');
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
        notify(run.value?.Ok ? 'Passed in Roblox' : 'Failed in Roblox', run.value?.Summary ?? '', run.value?.Ok ? undefined : 'error');
    }
});
</script>

<style scoped>
.col { display: flex; flex-direction: column; gap: var(--ot-gutter); min-width: 0; }
.checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.checks li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: var(--ot-space-2); align-items: start; font-size: 12.5px; }
.checks .mark { width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; border: 1px solid var(--ot-line-strong); color: var(--ot-muted); }
.checks .ok .mark { background: var(--ot-positive-soft); border-color: var(--ot-positive); color: var(--ot-positive); }
.checks .bad .mark { background: var(--ot-negative-soft, rgba(255, 90, 90, 0.12)); border-color: var(--ot-negative); color: var(--ot-negative); }
.checks strong { display: block; }
.checks .sub { display: block; font-size: 11.5px; line-height: 16px; color: var(--ot-text-2); }
.report { margin: var(--ot-space-3) 0 0; padding: var(--ot-space-2); border-radius: var(--ot-radius-sm); background: var(--ot-surface-2); font-size: 11px; line-height: 15px; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 320px; overflow: auto; }
.testline { margin: 0 0 var(--ot-space-2); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 12.5px; line-height: 18px; }
.issues { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; font-size: 12px; line-height: 17px; }
.issues .sev { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 6px; color: var(--ot-muted); }
.issues .error .sev { color: var(--ot-negative); }
.issues .warning .sev { color: var(--ot-warning); }
.issues .area { font-family: var(--ot-mono); color: var(--ot-text-2); margin-right: 6px; }
.bx-sub { margin-top: var(--ot-space-4); }
.cases { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.cases li { font-size: 12px; line-height: 17px; }
.cases .name { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-weight: 600; }
.cases .name code { font-family: var(--ot-mono); font-size: 11.5px; font-weight: 400; }
.cases .detail { margin: 3px 0 0; color: var(--ot-text-2); white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--ot-mono); font-size: 11.5px; }
.cases .bad .detail { color: #ffc9c9; }
.trace { margin: 4px 0 0; font-size: 10.5px; white-space: pre-wrap; color: var(--ot-muted); }
.passed { margin-top: var(--ot-space-3); font-size: 12px; }
.passed summary { cursor: pointer; color: var(--ot-text-2); margin-bottom: 6px; }
.small { font-size: 12px; }
</style>
