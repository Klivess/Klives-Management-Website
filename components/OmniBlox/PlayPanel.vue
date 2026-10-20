<template>
    <OmniTraderCard class="bx-play" :title="`Play ${title}`" subtitle="Any build, at any stage. Buying is free and saves are kept apart from the real game.">
        <template #controls>
            <span v-if="view.Playing" class="ot-chip ok"><span class="ot-dot ok" aria-hidden="true"></span>In a playtest now</span>
            <button type="button" class="ot-btn ghost sm" aria-label="Close the Play panel" @click="$emit('close')">✕</button>
        </template>

        <OmniTraderStateBlock v-if="!view.Playable" title="Nothing to play yet" detail="The builder starts the world once research has written the brief." />

        <template v-else>
            <div class="row">
                <div class="ot-field build">
                    <label for="bx-play-build">Build</label>
                    <select id="bx-play-build" v-model="build" class="ot-select" :disabled="busy !== null">
                        <option value="latest">{{ newestLabel }}</option>
                        <option v-for="r in revisions" :key="r" :value="`r${r}`">r{{ r }}{{ r === newestRevision ? ' · newest clean build' : '' }}</option>
                    </select>
                    <span class="help">{{ buildHelp }}</span>
                </div>
                <div class="actions">
                    <button v-if="canAct" type="button" class="ot-btn primary" :disabled="!view.Roblox.Available || busy !== null" @click="playInRoblox">
                        {{ busy === 'roblox' ? 'Sending to Roblox…' : '▶ Play in Roblox' }}
                    </button>
                    <button type="button" class="ot-btn" :disabled="busy !== null" @click="openInStudio">
                        {{ busy === 'studio' ? 'Building…' : '⤓ Open in Roblox Studio' }}
                    </button>
                    <label v-if="canAct && view.Roblox.Available" class="ot-check"><input v-model="fresh" type="checkbox" :disabled="busy !== null" /> Start with fresh saves</label>
                </div>
            </div>

            <p class="where" :class="{ warn: !view.Roblox.Available }">{{ whereText }}</p>
            <p v-if="message" class="message" :class="message.tone" role="status">{{ message.text }}</p>

            <div v-if="last || canAct" class="state">
                <p v-if="last" class="current">
                    <span class="bx-muted">{{ view.InExperience ? 'In Roblox now' : 'Last sent to Roblox' }}:</span>
                    <strong>{{ last.Build }}</strong> · version {{ last.Version }} · {{ fmtRelative(last.Utc, now) }}{{ last.Followed ? ' · followed the build' : '' }}
                    <a v-if="view.JoinUrl" class="join" :href="view.JoinUrl" target="_blank" rel="noopener">Join ↗</a>
                </p>
                <label v-if="canAct" class="ot-check follow">
                    <input type="checkbox" :checked="game.Playtest.Follow" :disabled="busy !== null || !view.Roblox.Available" @change="setFollow(($event.target as HTMLInputElement).checked)" />
                    <span><strong>Follow the build.</strong> While you're in the playtest, each new clean build is published to it and your server moves onto it.</span>
                </label>
            </div>
        </template>

        <h3 class="ot-sectionhead bx-sub">Your playtests</h3>
        <ul v-if="sessions.length" class="sessions">
            <li v-for="s in sessions" :key="s.Server">
                <div class="line">
                    <span class="ot-chip" :class="s.Where === 'studio' ? 'violet' : 'info'">{{ s.Where === 'studio' ? 'Studio' : 'Roblox' }}</span>
                    <strong class="bx-mono">{{ s.Build || '—' }}</strong>
                    <span class="bx-muted">{{ fmtRelative(s.LastEventUtc, now) }}<template v-if="played(s)"> · {{ bloxSeconds(played(s)) }}</template></span>
                    <span v-if="liveNow(s)" class="ot-chip ok">playing now</span>
                </div>
                <p v-if="facts(s)" class="facts">{{ facts(s) }}</p>
                <ul v-if="s.Errors.length" class="errors" :aria-label="`Script errors in ${s.Build}`">
                    <li v-for="(e, i) in s.Errors.slice(0, 4)" :key="i">
                        <span class="count">×{{ e.Count }}</span>
                        <span class="msg">{{ e.Message }}</span>
                    </li>
                    <li v-if="s.Errors.length > 4" class="bx-muted">and {{ s.Errors.length - 4 }} more</li>
                </ul>
            </li>
        </ul>
        <p v-else class="bx-muted empty">
            None yet. How far you get, what you test-buy, the feedback you give and any script errors show here, and the builder reads them.
        </p>
    </OmniTraderCard>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAccess } from '~/composables/useAccess';
import { fmtCount, fmtRelative, useNow } from '~/composables/useOmniTumblr';
import {
    BLOX_RATING_LABEL, BLOX_REASON_LABEL, bloxDownloadPlace, bloxPost, bloxSeconds,
    type BloxDossier, type BloxPlaytestResult, type BloxPlaytestSession, type BloxPlaytestView,
} from '~/composables/useOmniBlox';

const props = defineProps<{ game: BloxDossier; view: BloxPlaytestView; revisions: number[]; title: string }>();
const emit = defineEmits<{ close: []; changed: [] }>();

const { can } = useAccess();
const now = useNow(15_000);
const canAct = computed(() => can('omniblox.studio.act'));

const build = ref('latest');
const fresh = ref(false);
const busy = ref<'roblox' | 'studio' | 'follow' | null>(null);
const message = ref<{ text: string; tone: 'ok' | 'warn' | 'bad' } | null>(null);

const revisions = computed(() => props.revisions.slice().sort((a, b) => b - a));
const newestRevision = computed(() => revisions.value[0] ?? null);
const newestLabel = computed(() => newestRevision.value ? `Newest: r${newestRevision.value} and any edits since` : 'Newest: the files as they are');
const buildHelp = computed(() => build.value === 'latest'
    ? (newestRevision.value
        ? `The files as they are right now, mid-build included. If they don't compile at this moment, r${newestRevision.value} (the last clean build) plays instead.`
        : 'The files as they are right now. Nothing has built cleanly yet, so they have to compile.')
    : `${build.value} exactly as it was built.`);

const last = computed(() => props.game.Playtest.LastPublish);

const whereText = computed(() => {
    const r = props.view.Roblox;
    if (!r.Available) return r.Reason ?? 'Playing in Roblox is not set up.';
    if (r.OwnExperience) {
        return r.UniverseId
            ? `Plays in this game's own experience (${r.UniverseId}), which stays private until launch.`
            : 'Plays in this game\'s own experience (a free experience slot is set aside for it on the first play), which stays private until launch.';
    }
    const other = props.view.OtherGame;
    return `Plays in your private playtest experience (${r.UniverseId}).` + (other ? ` It is running "${other.Title}" (${other.Build}) now; playing this game replaces it.` : '');
});

const sessions = computed(() => props.game.Playtest.Sessions.slice().reverse().slice(0, 5));

const played = (s: BloxPlaytestSession) => Math.max(s.PlayedSeconds, Math.round((Date.parse(s.LastEventUtc) - Date.parse(s.StartedUtc)) / 1000));
const liveNow = (s: BloxPlaytestSession) => s.Where === 'roblox' && s.Players > 0 && now.value - Date.parse(s.LastEventUtc) <= 3 * 60_000;

function facts(s: BloxPlaytestSession): string {
    const parts: string[] = [];
    if (s.FurthestStep != null) parts.push(`reached ${s.FurthestStepName ?? `step ${s.FurthestStep}`}${s.Completed ? ', finished' : ''}`);
    else if (s.Completed) parts.push('finished');
    if (s.Deaths) parts.push(`${s.Deaths} death${s.Deaths === 1 ? '' : 's'}`);
    if (s.Earned) parts.push(`earned ${fmtCount(s.Earned)}`);
    const bought = new Map<string, number>();
    for (const key of s.TestPurchases) bought.set(key, (bought.get(key) ?? 0) + 1);
    if (bought.size) {
        const name = (key: string) => props.game.Products.find(p => p.Key === key)?.Name ?? key;
        parts.push('test-bought ' + [...bought].map(([key, n]) => n > 1 ? `${name(key)} ×${n}` : name(key)).join(', '));
    }
    const actions = Object.entries(s.Actions).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (actions.length) parts.push(actions.map(([name, n]) => `${name.replace(/_/g, ' ')} ×${n}`).join(', '));
    for (const f of s.Feedback) parts.push(`rated it ${BLOX_RATING_LABEL[f.Rating] ?? f.Rating}: ${(BLOX_REASON_LABEL[f.Reason] ?? f.Reason).toLowerCase()}`);
    if (!parts.length && !s.Errors.length) parts.push(s.Joins ? 'joined; nothing recorded yet' : 'server started; nobody joined');
    return parts.join(' · ');
}

function show(text: string, tone: 'ok' | 'warn' | 'bad') {
    message.value = { text, tone };
}

/** Publishes the build to the game's private experience and opens Roblox on it. */
async function playInRoblox() {
    if (busy.value) return;
    message.value = null;
    // The tab is opened inside the click: one opened after the publish (an await later) is blocked as a pop-up.
    const tab = window.open('', '_blank');
    if (tab) {
        try {
            tab.opener = null;
            tab.document.title = 'Starting your playtest…';
            tab.document.body.style.cssText = 'margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0d100c;color:#e9f1e5;font:15px system-ui,sans-serif';
            tab.document.body.textContent = `Sending ${build.value === 'latest' ? 'the newest build' : build.value} of ${props.title} to Roblox…`;
        } catch { /* the tab still works without the message */ }
    }
    busy.value = 'roblox';
    try {
        const result = await bloxPost<BloxPlaytestResult>('/omniblox/games/playtest', { gameId: props.game.GameId, build: build.value, fresh: fresh.value });
        if (!result.ok || !result.data) {
            tab?.close();
            show(result.error ?? 'The playtest could not start.', 'bad');
            return;
        }
        const r = result.data;
        if (tab && !tab.closed) tab.location.href = r.joinUrl;
        fresh.value = false;
        const head = r.reused ? `${r.build} is already in Roblox: joining it.` : `${r.build} is in Roblox (version ${r.version}).`;
        show([head, ...r.warnings].join(' ') + (tab ? '' : ' Your browser blocked the new tab: use Join.'), r.warnings.length || !tab ? 'warn' : 'ok');
        emit('changed');
    } finally {
        busy.value = null;
    }
}

async function openInStudio() {
    if (busy.value) return;
    message.value = null;
    busy.value = 'studio';
    try {
        const result = await bloxDownloadPlace(props.game.GameId, build.value);
        if (!result.ok) {
            show(result.error, 'bad');
            return;
        }
        show(`Saved ${result.fileName}. Open it in Roblox Studio and press Play (F5).` + (result.note ? ` ${result.note}` : ''), result.note ? 'warn' : 'ok');
        emit('changed');
    } finally {
        busy.value = null;
    }
}

async function setFollow(on: boolean) {
    busy.value = 'follow';
    try {
        const result = await bloxPost('/omniblox/games/playtest/follow', { gameId: props.game.GameId, follow: on });
        if (!result.ok) show(result.error ?? 'Could not change Follow.', 'bad');
        emit('changed');
    } finally {
        busy.value = null;
    }
}
</script>

<style scoped>
.row { display: flex; flex-wrap: wrap; gap: var(--ot-space-3) var(--ot-space-4); align-items: flex-start; }
.build { flex: 1 1 280px; max-width: 460px; }
.actions { display: flex; flex-wrap: wrap; gap: var(--ot-space-2); align-items: center; padding-top: 19px; }
.where { margin: var(--ot-space-3) 0 0; font-size: 12px; line-height: 17px; color: var(--ot-text-2); }
.where.warn { color: var(--ot-warning); }
.message { margin: var(--ot-space-2) 0 0; padding: var(--ot-space-2) var(--ot-space-3); border-radius: var(--ot-radius-sm); font-size: 12.5px; line-height: 18px; border: 1px solid var(--ot-line); }
.message.ok { border-color: rgba(78, 201, 138, 0.4); background: var(--ot-positive-soft); }
.message.warn { border-color: rgba(240, 180, 41, 0.4); background: var(--ot-warning-soft); }
.message.bad { border-color: rgba(255, 123, 123, 0.45); background: var(--ot-negative-soft); }
.state { margin-top: var(--ot-space-3); padding-top: var(--ot-space-3); border-top: 1px solid var(--ot-line); display: flex; flex-direction: column; gap: var(--ot-space-2); }
.current { margin: 0; font-size: 12.5px; display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: baseline; }
.join { font-weight: 600; }
.follow { align-items: flex-start; font-size: 12.5px; line-height: 18px; }
.follow input { margin-top: 3px; }
.bx-sub { margin-top: var(--ot-space-4); }
.sessions { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.sessions > li { padding: var(--ot-space-2) 0; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.sessions > li + li { border-top: 1px solid var(--ot-line); }
.line { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12.5px; }
.facts { margin: 0; font-size: 12px; line-height: 17px; color: var(--ot-text-2); }
.errors { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-size: 11.5px; line-height: 16px; }
.errors li { display: flex; gap: 6px; min-width: 0; }
.errors .count { flex: 0 0 auto; color: var(--ot-negative); font-family: var(--ot-mono); }
/* Ligatures off: an error is quoted as Luau printed it ("<=", not "≤"). */
.errors .msg { font-family: var(--ot-mono); font-variant-ligatures: none; color: #ffc9c9; overflow-wrap: anywhere; }
.empty { margin: 0; font-size: 12.5px; line-height: 18px; }
@media (max-width: 720px) {
    .actions { padding-top: 0; }
    .actions .ot-btn { flex: 1 1 auto; }
}
</style>
