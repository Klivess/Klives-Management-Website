<template>
    <OmniscienceV3Shell>
        <div class="omni-pagehead">
            <div>
                <h1>Sources</h1>
                <p class="subtitle">Where messages come from: the Discord bot's live connection and its reading of channel history, and exports you bring in yourself. Someone you have forgotten is never brought back by either.</p>
            </div>
            <div class="omni-actions"><button class="omni-btn ghost" type="button" @click="refresh()">Refresh</button></div>
        </div>

        <!-- ── Discord ──────────────────────────────────────────────────────── -->
        <OmniscienceV3Panel title="Discord (through KliveBot)" :loading="discord.loading.value" :error="discord.error.value" :has-data="!!d" what="The Discord source" @retry="discord.refresh()">
            <template v-if="d">
                <div class="omni-row" data-testid="discord-chips">
                    <span class="omni-chip" :class="d.enabled ? 'ok' : ''">{{ d.enabled ? 'switched on' : 'switched off' }}</span>
                    <span class="omni-chip" :class="d.attached ? 'ok' : d.enabled ? 'warn' : ''">{{ d.attached ? 'listening' : 'not connected' }}</span>
                    <span class="omni-chip" :class="sourceTone">{{ omniHumanise(d.sourceStatus) }}</span>
                    <span v-if="!d.contentIntent" class="omni-chip warn" title="Without it Discord sends messages with their text removed">no message-content permission</span>
                    <span class="omni-muted">last event <OmniscienceV3Time :ms="d.lastEventAtMs" mode="age" /></span>
                </div>
                <div v-if="d.sourceStatus === 'unauthorised'" class="omni-banner" role="alert">
                    <span class="glyph" aria-hidden="true">⚠</span>
                    <div><strong>Discord refused the bot's token.</strong><span class="muted">{{ d.sourceStatusDetail ?? 'Nothing can be read until the token is replaced.' }}</span></div>
                </div>
                <p v-else-if="d.lastError" class="neg">{{ d.lastError }}</p>
                <p v-if="!d.enabled" class="omni-muted">While the old service is still the one collecting, this source stays off. It is switched on at cutover (Settings: ingest.discord_bot.enabled).</p>
                <div class="omni-kpis tight">
                    <OmniscienceV3Kpi label="Events heard" :value="omniCount(d.eventsReceived)" small />
                    <OmniscienceV3Kpi label="Written" :value="omniCount(d.eventsWritten)" small />
                    <OmniscienceV3Kpi label="Dropped" :value="omniCount(d.eventsDropped)" small :tone="d.eventsDropped ? 'bad' : undefined" help="Events that arrived faster than they could be queued" />
                    <OmniscienceV3Kpi label="Channels" :value="omniCount(d.channels)" small :foot="`${omniCount(d.channelsComplete)} read back to their start`" />
                    <OmniscienceV3Kpi label="Not allowed in" :value="omniCount(d.channelsForbidden)" small help="Channels the bot can see but may not read" />
                    <OmniscienceV3Kpi label="API requests" :value="omniCount(d.apiRequests)" small />
                </div>
                <form v-if="canManage" class="backfill" data-testid="backfill-form" @submit.prevent="backfill()">
                    <label for="bf-channel">Read a channel's whole history now</label>
                    <input id="bf-channel" v-model="channelId" class="omni-input mono" inputmode="numeric" placeholder="Discord channel id" />
                    <button class="omni-btn" type="submit" :disabled="busy !== null || !/^\d{5,25}$/.test(channelId.trim())">Start</button>
                    <span class="help">Every channel is read back by itself over time; this puts one at the front.</span>
                </form>
            </template>
        </OmniscienceV3Panel>

        <!-- ── imports ──────────────────────────────────────────────────────── -->
        <div class="omni-grid sidebar imports">
            <div>
                <OmniscienceV3Panel title="Waiting to be imported" flush :loading="imports.loading.value" :error="imports.error.value" :has-data="!!im" :empty="!!im && !im.inbox.length"
                                    empty-title="The inbox is empty" :empty-text="im ? `Upload an export here, or put one in ${im.inboxPath}.` : undefined" what="The import inbox" @retry="imports.refresh()">
                    <table v-if="im" class="omni-table" data-testid="inbox-table">
                        <thead><tr><th>Export</th><th class="num">Size</th><th class="num">Added</th><th v-if="canManage"></th></tr></thead>
                        <tbody>
                            <tr v-for="e in im.inbox" :key="e.name" :class="{ selected: working?.name === e.name }">
                                <td class="omni-wrap">{{ e.name }}<span v-if="e.isFolder" class="omni-chip sm">folder</span></td>
                                <td class="num">{{ e.isFolder ? '—' : omniBytes(e.bytes) }}</td>
                                <td class="num"><OmniscienceV3Time :ms="e.modifiedAtMs" mode="age" /></td>
                                <td v-if="canManage" class="actions"><button class="omni-btn ghost sm" type="button" :disabled="!!waiting" :data-testid="`preview-${e.name}`" @click="preview(e.name)">Look inside</button></td>
                            </tr>
                        </tbody>
                    </table>
                </OmniscienceV3Panel>

                <OmniscienceV3Card v-if="canManage" title="Upload an export">
                    <div class="upload" data-testid="upload">
                        <input ref="fileInput" type="file" class="visually-hidden" aria-label="Choose an export to upload" @change="onFile" />
                        <button class="omni-btn" type="button" :disabled="uploading || !!waiting" @click="fileInput?.click()">{{ uploading ? 'Uploading…' : 'Choose a file' }}</button>
                        <span class="help">{{ formatsText }} A zip is fine. Nothing is imported until you have looked inside and said so.</span>
                        <p v-if="uploadError" class="neg" role="alert">{{ uploadError }}</p>
                    </div>
                </OmniscienceV3Card>

                <OmniscienceV3Panel title="Imported before" flush :loading="imports.loading.value" :error="imports.error.value" :has-data="!!im" :empty="!!im && !im.ledger.length" empty-title="Nothing imported yet">
                    <table v-if="im" class="omni-table compact" data-testid="ledger-table">
                        <thead><tr><th>When</th><th>Format</th><th>State</th><th class="num">Messages added</th></tr></thead>
                        <tbody>
                            <tr v-for="l in im.ledger" :key="l.importId" :title="l.error ?? undefined">
                                <td><OmniscienceV3Time :ms="l.committedAtMs ?? l.createdAtMs" mode="absolute" /></td>
                                <td>{{ formatTitle(l.format) }}</td>
                                <td><span class="omni-chip sm" :class="l.state === 'committed' ? 'ok' : l.error ? 'bad' : ''">{{ l.state }}</span></td>
                                <td class="num">{{ omniCount(inserted(l.countsJson)) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </OmniscienceV3Panel>
            </div>

            <OmniscienceV3Card :title="working ? working.name : 'An export, before it is imported'" :empty="!working && !waiting" empty-title="Nothing opened"
                            empty-text="“Look inside” reads an export without importing it: how many messages, from whom, over what period, and what is already here.">
                <p v-if="waiting" class="omni-muted" data-testid="import-waiting"><span class="omni-dot warn"></span> {{ waiting }}</p>
                <p v-if="jobError" class="neg" role="alert">{{ jobError }}</p>

                <template v-if="result">
                    <div class="omni-banner ok" role="status" data-testid="import-result">
                        <span class="glyph" aria-hidden="true">✓</span>
                        <div><strong>Imported.</strong><span class="muted">{{ omniCount(result.inserted) }} messages added, {{ omniCount(result.unchanged) }} were already here, {{ omniCount(result.updated) }} updated.
                            {{ omniCount(result.newIdentities) }} new people, {{ omniCount(result.attachmentsStored) }} of {{ omniCount(result.attachmentsAdded) }} files stored.</span></div>
                    </div>
                    <ul v-if="result.warnings.length" class="warnings"><li v-for="(w, i) in result.warnings" :key="i">{{ w }}</li></ul>
                </template>

                <template v-else-if="working?.preview">
                    <dl class="omni-kv" data-testid="import-preview">
                        <dt>Format</dt><dd>{{ pv.formatTitle }}</dd>
                        <dt>Messages</dt><dd>{{ omniCount(pv.messages) }}<template v-if="pv.systemMessages"> · {{ omniCount(pv.systemMessages) }} system notices</template></dd>
                        <dt>Already here</dt><dd>{{ omniCount(pv.alreadyInCorpus) }}<template v-if="pv.committedBeforeMs"> · this same export was imported <OmniscienceV3Time :ms="pv.committedBeforeMs" mode="age" /></template></dd>
                        <dt>Period</dt><dd><OmniscienceV3Time :ms="pv.firstMs" mode="absolute" /> to <OmniscienceV3Time :ms="pv.lastMs" mode="absolute" /></dd>
                        <dt>Times read as</dt><dd>{{ pv.zoneUsed ?? 'exact (the export carries offsets)' }}{{ pv.dateOrder ? ` · dates as ${pv.dateOrder}` : '' }}
                            <template v-if="pv.ambiguousTimes || pv.invalidTimes"> · {{ pv.ambiguousTimes }} fall in a clock change, {{ pv.invalidTimes }} could not be read</template></dd>
                        <dt>Files</dt><dd>{{ omniCount(pv.mediaFound) }} found, {{ omniCount(pv.mediaMissing) }} missing from the export</dd>
                        <dt>You are</dt><dd>{{ pv.ownerDetected ?? 'not worked out' }}</dd>
                    </dl>
                    <div v-if="pv.decisionNeeded" class="omni-banner warn" role="status" data-testid="import-decision">
                        <span class="glyph" aria-hidden="true">?</span><div><strong>It needs an answer first.</strong><span class="muted">{{ pv.decisionNeeded }}</span></div>
                    </div>
                    <ul v-if="pv.warnings.length" class="warnings"><li v-for="(w, i) in pv.warnings" :key="i">{{ w }}</li></ul>
                    <section class="omni-section">
                        <h4>Who wrote ({{ pv.senderCount }})</h4>
                        <ul class="senders"><li v-for="s in pv.senders" :key="s.identityId">{{ s.name }} <span class="omni-muted">{{ omniCount(s.messages) }}</span><span v-if="s.isOwner" class="omni-chip sm ok">you</span></li></ul>
                    </section>
                    <section v-if="pv.unreadableFiles.length" class="omni-section">
                        <h4>Could not be read ({{ pv.unreadableFiles.length }})</h4>
                        <ul class="warnings"><li v-for="u in pv.unreadableFiles" :key="u.file">{{ u.file }}: {{ u.reason }}</li></ul>
                    </section>

                    <form class="omni-form options" data-testid="import-options" @submit.prevent="commit()">
                        <div v-if="needsZone" class="omni-field"><label for="io-zone">Time zone the phone was in</label>
                            <input id="io-zone" v-model="options.zone" class="omni-input" list="io-zones" placeholder="e.g. Europe/London" />
                            <datalist id="io-zones"><option v-for="z in ZONES" :key="z" :value="z" /></datalist></div>
                        <div class="omni-field"><label for="io-owner">Your name in this export (if it guessed wrong)</label><input id="io-owner" v-model="options.ownerName" class="omni-input" maxlength="120" /></div>
                        <div class="omni-row">
                            <button class="omni-btn" type="button" :disabled="!!waiting" @click="preview(working.name)">Look again with these answers</button>
                            <button class="omni-btn primary" type="submit" :disabled="!!waiting || !!pv.decisionNeeded" :title="pv.decisionNeeded ? 'Answer the question above first' : undefined" data-testid="import-commit">
                                Import {{ omniCount(pv.messages - pv.alreadyInCorpus) }} new messages</button>
                        </div>
                    </form>
                </template>
            </OmniscienceV3Card>
        </div>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, shallowRef } from 'vue';
import { OMNI_BASE, omniGet, omniParse, omniPost, omniUpload, toOmniError } from '~/scripts/omniscience/api';
import type { DiscordBotStatusDto, ImportJobStartedDto, ImportListDto, ImportPreview, ImportResult, ImportUploadedDto, JobRecord } from '~/scripts/omniscience/contracts';
import { omniBytes, omniCount } from '~/scripts/omniscience/format';
import { omniHumanise } from '~/scripts/omniscience/findings';
import { useOmniAction, useOmniResource } from '~/composables/useOmniscienceV3';
import { useAccess } from '~/composables/useAccess';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Sources' });

const ZONES = ['Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'];

const { can } = useAccess();
const canManage = computed(() => can('omniscience.sources.manage'));
const { busy, run } = useOmniAction();

// ── Discord ────────────────────────────────────────────────────────────────
const discord = useOmniResource(signal => omniGet<DiscordBotStatusDto>('sources/discord', {}, signal), { pollMs: 15_000 });
const d = computed(() => discord.data.value);
const sourceTone = computed(() => (d.value?.sourceStatus === 'active' ? 'ok' : d.value?.sourceStatus === 'unauthorised' ? 'bad' : 'warn'));
const channelId = ref('');
async function backfill() {
    const id = channelId.value.trim();
    const result = await run('backfill', () => omniPost<ImportJobStartedDto>('sources/discord/backfill', { channelId: id }), r => `Reading that channel's history (job ${r.jobId}). Follow it under ${OMNI_BASE}/jobs.`);
    if (result) channelId.value = '';
}

// ── imports ────────────────────────────────────────────────────────────────
const imports = useOmniResource(signal => omniGet<ImportListDto>('imports', {}, signal));
const im = computed(() => imports.data.value);
const formatsText = computed(() => (im.value?.formats.length ? `Takes: ${im.value.formats.map(f => f.title).join(', ')}.` : ''));
function formatTitle(id: string): string { return im.value?.formats.find(f => f.id === id)?.title ?? id; }
function inserted(countsJson: string | null | undefined): number | null { return omniParse<{ inserted?: number }>(countsJson)?.inserted ?? null; }

/** The export being looked at: its name, what the last look found, and the answers given so far. */
const working = shallowRef<{ name: string; preview: ImportPreview | null } | null>(null);
const pv = computed(() => working.value!.preview!);
const result = shallowRef<ImportResult | null>(null);
const options = reactive({ zone: '', ownerName: '' });
const needsZone = computed(() => !!working.value?.preview && (im.value?.formats.find(f => f.id === working.value!.preview!.format)?.needsZone ?? false));
const waiting = ref('');
const jobError = ref('');
let polling: AbortController | null = null;

function payload(name: string) {
    return { name, format: working.value?.preview?.format ?? null, options: { zone: options.zone.trim() || null, ownerName: options.ownerName.trim() || null } };
}

/** Imports run as jobs: wait for this one and hand back its result, or say why it failed. */
async function finished<T>(jobId: number, what: string): Promise<T | null> {
    polling?.abort();
    const mine = new AbortController();
    polling = mine;
    waiting.value = what;
    jobError.value = '';
    try {
        for (let i = 0; i < 1800 && !mine.signal.aborted; i++) {
            const job = await omniGet<JobRecord>('jobs/get', { id: jobId }, mine.signal);
            if (job.state === 'succeeded') return omniParse<T>(job.resultJson);
            if (job.state === 'dead' || job.state === 'cancelled') {
                jobError.value = job.errorMessage ?? `The job was ${job.state}.`;
                return null;
            }
            await new Promise(resolve => setTimeout(resolve, i < 10 ? 500 : 2000));
        }
        if (!mine.signal.aborted) jobError.value = 'It is taking a long time. It keeps running; see Jobs.';
        return null;
    } catch (caught) {
        const e = toOmniError(caught);
        if (e.kind !== 'aborted') jobError.value = e.message;
        return null;
    } finally {
        if (polling === mine) { polling = null; waiting.value = ''; }
    }
}

async function preview(name: string) {
    if (working.value?.name !== name) { working.value = { name, preview: null }; Object.assign(options, { zone: '', ownerName: '' }); }
    result.value = null;
    const started = await run('preview', () => omniPost<ImportJobStartedDto>('imports/preview', payload(name)));
    if (!started) return;
    const found = await finished<ImportPreview>(started.jobId, 'Looking inside the export…');
    if (found) working.value = { name, preview: found };
}

async function commit() {
    const current = working.value;
    if (!current?.preview) return;
    if (!window.confirm(`Import ${current.name}? Its messages are added to the archive. Messages already here are not added twice.`)) return;
    const started = await run('commit', () => omniPost<ImportJobStartedDto>('imports/commit', payload(current.name)));
    if (!started) return;
    const done = await finished<ImportResult>(started.jobId, 'Importing…');
    if (done) { result.value = done; void imports.refresh(); }
}

// ── upload ─────────────────────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const uploadError = ref('');
async function onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    uploading.value = true;
    uploadError.value = '';
    try {
        const up = await omniUpload<ImportUploadedDto>('imports/upload', { name: file.name }, file);
        void imports.refresh();
        working.value = { name: up.name, preview: null };
        result.value = null;
        Object.assign(options, { zone: '', ownerName: '' });
        uploading.value = false;
        const found = await finished<ImportPreview>(up.previewJobId, 'Looking inside the export…');
        if (found) working.value = { name: up.name, preview: found };
    } catch (caught) {
        uploadError.value = toOmniError(caught).message;
    } finally {
        uploading.value = false;
    }
}

function refresh() { void discord.refresh(); void imports.refresh(); }
onBeforeUnmount(() => polling?.abort());
</script>

<style scoped>
.imports { margin-top: var(--omni-gutter); }
.backfill { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 12px; font-size: 13px; }
.backfill input { width: 220px; }
.upload { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.warnings { margin: 8px 0 0; padding-left: 18px; font-size: 12.5px; color: var(--omni-warning); }
.senders { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 13px; }
.omni-form { display: flex; flex-direction: column; gap: 12px; }
.options { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--omni-line); }
td.actions { white-space: nowrap; text-align: right; }
.omni-banner .muted { display: block; color: var(--omni-text-2); }
.help { font-size: 12px; color: var(--omni-muted); }
p { margin: 0 0 8px; }
</style>
