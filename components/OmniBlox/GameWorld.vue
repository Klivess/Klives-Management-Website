<template>
    <div class="bx-world">
        <OmniTraderCard title="World" :subtitle="drawable ? subtitle : 'Nothing is built in Research'">
            <template v-if="drawable" #controls>
                <div class="ot-segment sm" role="group" aria-label="Camera">
                    <button v-for="v in views" :key="v.id" type="button" :aria-pressed="view === v.id" @click="view = v.id">{{ v.label }}</button>
                </div>
                <label v-if="view !== 'map' && view !== 'overview'" class="labels"><input v-model="labels" type="checkbox" /> Object ids</label>
                <button v-if="playable" type="button" class="ot-btn sm" @click="emit('play')">▶ Play this world</button>
            </template>
            <OmniBloxImg v-if="drawable" :path="bloxRenderPath(game.GameId, view, game.Build.LastBuildUtc ?? game.Build.Revision, labels)" ratio="1280 / 760" contain
                         :alt="`${game.Store.Title || game.WorkingTitle}: ${view} view`" fallback="Nothing to draw yet." />
            <OmniTraderStateBlock v-else title="No world yet" detail="The builder creates the world once the brief is written." />
            <p v-if="drawable" class="hint bx-muted">{{ VIEW_HINT[view] ?? 'A close look at one zone of the map plan.' }}</p>
        </OmniTraderCard>

        <div class="ot-grid two">
            <OmniTraderCard title="Map report" :subtitle="report ? `${Math.round(report.AreaWidth)}×${Math.round(report.AreaDepth)} studs · ${report.Objects} objects · ${report.DistinctModels} different models` : 'Measured on the current files'"
                            :loading="drawable && report === null && !reportError" :empty="!drawable" empty-title="No world yet">
                <OmniTraderStateBlock v-if="reportError" kind="error" title="Could not measure the map" :detail="reportError" />
                <template v-else-if="report">
                    <div class="score">
                        <span class="value" :class="scoreTone">{{ report.Score }}</span>
                        <div>
                            <strong>{{ scoreWord }}</strong>
                            <span class="bx-muted">{{ bar }} is the bar for the Build stage (an error caps the score); 85+ is the aim. {{ pct(report.DressedShare) }} of the play area is dressed.</span>
                        </div>
                    </div>
                    <ul v-if="report.Categories?.length" class="cats" aria-label="Score by category">
                        <li v-for="c in report.Categories" :key="c.Name">
                            <span class="name">{{ c.Name }}</span>
                            <span class="meter" aria-hidden="true"><span :class="catTone(c.Score, c.Max)" :style="{ width: `${Math.round(100 * c.Score / Math.max(1, c.Max))}%` }"></span></span>
                            <span class="num">{{ c.Score }}/{{ c.Max }}</span>
                            <span v-if="c.Note" class="note">{{ c.Note }}</span>
                        </li>
                    </ul>
                    <ul v-if="report.Findings.length" class="findings">
                        <li v-for="(f, i) in findings" :key="i" :class="f.Severity">
                            <span class="sev">{{ f.Severity }}</span><span class="area">{{ f.Area }}</span>{{ f.Message }}
                        </li>
                    </ul>
                    <p v-else class="bx-muted">No problems found.</p>
                    <details v-if="report.Facts.length" class="facts">
                        <summary>Measurements</summary>
                        <ul class="bx-list small"><li v-for="(f, i) in report.Facts" :key="i">{{ f }}</li></ul>
                    </details>
                </template>
            </OmniTraderCard>

            <OmniTraderCard title="Map plan" :subtitle="report?.Zones.length ? `${report.Zones.length} zone(s), in the order players reach them` : undefined"
                            :empty="!report?.Zones.length && !report?.Concept" empty-title="No map plan yet" empty-text="The world generator lays out the zones, roads and landmarks when the game reaches Build.">
                <template v-if="report">
                    <p v-if="report.Concept" class="concept">{{ report.Concept }}</p>
                    <ol class="zones">
                        <li v-for="z in zonesInOrder" :key="z.Id">
                            <button type="button" class="zone" :aria-pressed="view === `zone:${z.Id}`" @click="view = `zone:${z.Id}`">
                                <strong>{{ z.Order }}. {{ z.Name }}</strong>
                                <span>{{ z.Purpose }}<template v-if="z.Theme"> · {{ z.Theme }}</template></span>
                                <span class="bx-muted mono">{{ Math.round(z.Area[2]! - z.Area[0]!) }}×{{ Math.round(z.Area[3]! - z.Area[1]!) }} studs</span>
                            </button>
                        </li>
                    </ol>
                    <p v-if="report.Landmarks.length" class="landmarks"><span class="bx-muted">Landmarks:</span> {{ report.Landmarks.map(l => l.Name).join(' · ') }}</p>
                </template>
            </OmniTraderCard>
        </div>

        <OmniTraderCard v-if="game.Build.Economy" title="Economy check" subtitle="At every build a bot plays the game's own prices on its map: the first sale, the first purchase, every zone, the rebirth">
            <ul v-if="economyFindings.length" class="findings economy">
                <li v-for="(f, i) in economyFindings" :key="i" :class="f.level"><span class="sev">{{ f.level }}</span>{{ f.text }}</li>
            </ul>
            <pre class="timeline">{{ game.Build.Economy }}</pre>
        </OmniTraderCard>

        <div class="ot-grid two">
            <OmniTraderCard title="Build">
                <dl class="ot-kv">
                    <dt>Revision</dt>
                    <dd>
                        r{{ game.Build.Revision }}
                        <span v-if="game.Build.Revision" class="ot-chip" :class="game.Build.LastBuildOk ? 'ok' : 'bad'">{{ game.Build.LastBuildOk ? 'compiles' : 'broken' }}</span>
                    </dd>
                    <dt>Built</dt><dd>{{ game.Build.LastBuildUtc ? fmtRelative(game.Build.LastBuildUtc, now) : 'never' }}</dd>
                    <dt>Place</dt><dd>{{ bloxBytes(game.Build.PlaceBytes) }} · {{ fmtCount(game.Build.InstanceCount) }} instances · {{ game.Build.ScriptCount }} scripts</dd>
                    <dt>Must-haves</dt><dd>{{ game.Build.FeatureComplete ? 'declared complete' : 'in progress' }}</dd>
                </dl>
                <template v-if="problems.length">
                    <h3 class="ot-sectionhead bx-sub">Problems</h3>
                    <ul class="problems">
                        <li v-for="(p, i) in problems" :key="i" :class="p.level">
                            <span class="tag">{{ p.tag }}</span>{{ p.text }}
                        </li>
                    </ul>
                </template>
            </OmniTraderCard>

            <OmniTraderCard title="Models placed" :subtitle="`${game.Build.AssetsUsed.length} from the Asset Library`" :empty="!game.Build.AssetsUsed.length" empty-title="None yet">
                <div class="models">
                    <NuxtLink v-for="id in game.Build.AssetsUsed" :key="id" class="model" :to="`/schemery/omniblox/assets?asset=${id}`">
                        <OmniBloxImg :path="bloxAssetImagePath(id)" ratio="1 / 1" :alt="`Model ${id}`" fallback="#" />
                        <span>#{{ id }}</span>
                    </NuxtLink>
                </div>
            </OmniTraderCard>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fmtCount, fmtRelative, useNow } from '~/composables/useOmniTumblr';
import { BLOX_MAP_BAR, bloxAssetImagePath, bloxBytes, bloxGet, bloxRenderPath, type BloxDossier, type BloxMapReport } from '~/composables/useOmniBlox';

const props = defineProps<{ game: BloxDossier; playable?: boolean }>();
const emit = defineEmits<{ play: [] }>();
const now = useNow();

const BASE_VIEWS = [
    { id: 'map', label: 'Map' },
    { id: 'aerial', label: 'Aerial' },
    { id: 'iso', label: '3/4' },
    { id: 'spawn', label: 'Spawn' },
] as const;
const VIEW_HINT: Record<string, string> = {
    map: 'From above, with the map plan: zones, paths, landmarks, the play area, a grid in studs and where the spawn faces.',
    aerial: 'The whole world from high up, as a player flying over it would see it.',
    iso: 'A three-quarter view of everything that is built.',
    spawn: 'What a player sees the moment they join: the first impression.',
};
const view = ref<string>('map');
const labels = ref(false);

const drawable = computed(() => props.game.Stage !== 'Research' && !(props.game.Stage === 'Abandoned' && props.game.Build.Revision === 0));
const subtitle = computed(() => `Revision ${props.game.Build.Revision} · drawn from the compiled place, models as Roblox's own pictures of them`);

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

const zonesInOrder = computed(() => (report.value?.Zones ?? []).slice().sort((a, b) => a.Order - b.Order));
const views = computed(() => [...BASE_VIEWS, ...zonesInOrder.value.slice(0, 6).map(z => ({ id: `zone:${z.Id}`, label: z.Name }))]);
const findings = computed(() => (report.value?.Findings ?? []).slice().sort((a, b) => rank(a.Severity) - rank(b.Severity)));
const rank = (s: string) => s === 'error' ? 0 : s === 'warning' ? 1 : 2;
const blocked = computed(() => report.value?.Blocked ?? (report.value?.Findings ?? []).some(f => f.Severity === 'error'));
const bar = computed(() => report.value?.Bar ?? BLOX_MAP_BAR);
const scoreTone = computed(() => { const s = report.value?.Score ?? 0; return blocked.value || s < bar.value ? 'bad' : s >= 85 ? 'good' : 'ok'; });
const scoreWord = computed(() => {
    const s = report.value?.Score ?? 0;
    if (blocked.value) return 'Not ready: fix the errors below first';
    return s >= 85 ? 'A full, finished world' : s >= bar.value ? 'Good enough to ship; room to improve' : 'Not ready: the map needs work';
});
const catTone = (score: number, max: number) => score >= max * 0.85 ? 'good' : score >= max * 0.5 ? 'ok' : 'bad';
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** "[error] economy: …" lines from the last build's economy check. */
const economyFindings = computed(() => (props.game.Build.EconomyFindings ?? []).map(line => {
    const m = /^\[(\w+)\]\s*(?:[\w ]+:\s*)?(.*)$/.exec(line);
    return m ? { level: m[1]!.toLowerCase(), text: m[2]! } : { level: 'warning', text: line };
}));

/** Build errors and warnings, tagged by where they came from ("[geometry]", "[types]"). */
const problems = computed(() => {
    const parse = (line: string, fallback: 'error' | 'warning') => {
        const m = /^\[(geometry|types)\]\s*(?:\[(\w+)\]\s*)?(.*)$/.exec(line);
        return m ? { tag: m[1]!, level: (m[2] ?? fallback).toLowerCase(), text: m[3]! } : { tag: 'build', level: fallback, text: line };
    };
    return [...props.game.Build.Errors.map(e => parse(e, 'error')), ...props.game.Build.Warnings.map(w => parse(w, 'warning'))];
});
</script>

<style scoped>
.bx-world { display: flex; flex-direction: column; gap: var(--ot-gutter); }
.labels { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: var(--ot-text-2); }
.hint { margin: var(--ot-space-2) 0 0; font-size: 11.5px; }
.score { display: flex; gap: var(--ot-space-3); align-items: center; margin-bottom: var(--ot-space-3); }
.score .value { font-size: 34px; font-weight: 800; font-family: var(--ot-mono); line-height: 1; min-width: 64px; }
.score .value.good { color: var(--ot-positive); }
.score .value.ok { color: var(--ot-warning); }
.score .value.bad { color: var(--ot-negative); }
.score strong { display: block; font-size: 13px; }
.score .bx-muted { font-size: 11.5px; line-height: 16px; }
.cats { list-style: none; margin: 0 0 var(--ot-space-3); padding: 0; display: flex; flex-direction: column; gap: 6px; }
.cats li { display: grid; grid-template-columns: minmax(0, 150px) minmax(0, 1fr) 44px; align-items: center; column-gap: var(--ot-space-2); font-size: 12px; }
.cats .meter { height: 6px; border-radius: 999px; background: var(--ot-surface-3); overflow: hidden; }
.cats .meter span { display: block; height: 100%; border-radius: 999px; background: var(--ot-warning); }
.cats .meter span.good { background: var(--ot-positive); }
.cats .meter span.bad { background: var(--ot-negative); }
.cats .num { font-family: var(--ot-mono); font-size: 11.5px; text-align: right; }
.cats .note { grid-column: 1 / -1; font-size: 11px; line-height: 15px; color: var(--ot-muted); overflow-wrap: anywhere; }
.timeline { margin: 0; padding: var(--ot-space-2) var(--ot-space-3); border-radius: var(--ot-radius-sm); background: var(--ot-surface-2); font-family: var(--ot-mono); font-size: 11.5px; line-height: 17px; white-space: pre-wrap; overflow-wrap: anywhere; }
.findings.economy { margin-bottom: var(--ot-space-3); }
.findings { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12px; line-height: 17px; }
.findings .sev { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 6px; color: var(--ot-muted); }
.findings .error .sev { color: var(--ot-negative); }
.findings .warning .sev { color: var(--ot-warning); }
.findings .area { font-family: var(--ot-mono); color: var(--ot-text-2); margin-right: 6px; }
.facts { margin-top: var(--ot-space-3); font-size: 12px; }
.facts summary { cursor: pointer; color: var(--ot-text-2); }
.concept { margin: 0 0 var(--ot-space-3); font-size: 12.5px; line-height: 18px; }
.zones { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.zone { width: 100%; text-align: left; display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: var(--ot-radius-sm); border: 1px solid var(--ot-line); background: var(--ot-surface-2); color: inherit; font-size: 12px; cursor: pointer; }
.zone[aria-pressed="true"] { border-color: var(--ot-accent); }
.mono { font-family: var(--ot-mono); font-size: 11px; }
.landmarks { margin: var(--ot-space-3) 0 0; font-size: 12px; }
.bx-sub { margin-top: var(--ot-space-4); }
.problems { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12px; line-height: 17px; }
.problems .tag { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 6px; color: var(--ot-muted); }
.problems .error { color: #ffc9c9; }
.problems .warning .tag { color: var(--ot-warning); }
.models { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: var(--ot-space-2); }
.model { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--ot-text-2); text-decoration: none; font-family: var(--ot-mono); }
.model:hover { color: var(--ot-accent); }
.small { font-size: 12px; }
</style>
