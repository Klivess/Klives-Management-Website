<template>
    <div class="ot-grid sidebar">
        <OmniTraderCard title="World" :subtitle="drawable ? `Revision ${game.Build.Revision}, drawn from the compiled place` : 'Nothing is built in Research'">
            <template v-if="drawable" #controls>
                <div class="ot-segment sm" role="group" aria-label="Camera">
                    <button v-for="v in VIEWS" :key="v.id" type="button" :aria-pressed="view === v.id" @click="view = v.id">{{ v.label }}</button>
                </div>
            </template>
            <OmniBloxImg v-if="drawable" :path="bloxRenderPath(game.GameId, view, game.Build.Revision)" ratio="1280 / 760" contain
                         :alt="`${game.Store.Title || game.WorkingTitle}: ${view} view`" fallback="Nothing to draw yet." />
            <OmniTraderStateBlock v-else title="No world yet" detail="The builder creates the world once the brief is written." />
        </OmniTraderCard>

        <div class="col">
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
import { computed, ref } from 'vue';
import { fmtCount, fmtRelative, useNow } from '~/composables/useOmniTumblr';
import { bloxAssetImagePath, bloxBytes, bloxRenderPath, type BloxDossier } from '~/composables/useOmniBlox';

const props = defineProps<{ game: BloxDossier }>();
const now = useNow();

const VIEWS = [
    { id: 'iso', label: '3/4' },
    { id: 'overview', label: 'Above' },
    { id: 'spawn', label: 'Spawn' },
] as const;
const view = ref<string>('iso');

const drawable = computed(() => props.game.Stage !== 'Research' && !(props.game.Stage === 'Abandoned' && props.game.Build.Revision === 0));

/** Build errors and warnings; geometry ones carry a "[geometry] [level]" prefix from the verifier. */
const problems = computed(() => {
    const parse = (line: string, fallback: 'error' | 'warning') => {
        const m = /^\[geometry\]\s*(?:\[(\w+)\]\s*)?(.*)$/.exec(line);
        return m ? { tag: 'geometry', level: (m[1] ?? fallback).toLowerCase(), text: m[2]! } : { tag: 'luau', level: fallback, text: line };
    };
    return [...props.game.Build.Errors.map(e => parse(e, 'error')), ...props.game.Build.Warnings.map(w => parse(w, 'warning'))];
});
</script>

<style scoped>
.col { display: flex; flex-direction: column; gap: var(--ot-gutter); min-width: 0; }
.bx-sub { margin-top: var(--ot-space-4); }
.problems { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12px; line-height: 17px; }
.problems .tag { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 6px; color: var(--ot-muted); }
.problems .error { color: #ffc9c9; }
.problems .warning .tag { color: var(--ot-warning); }
.models { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: var(--ot-space-2); }
.model { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--ot-text-2); text-decoration: none; font-family: var(--ot-mono); }
.model:hover { color: var(--ot-accent); }
</style>
