<template>
    <OmniscienceV3Shell>
        <div class="omni-pagehead">
            <div>
                <h1>Data controls</h1>
                <p class="subtitle">Forget a person, switch their analysis off, see what is kept and for how long, and keep encrypted backups. Forgetting cannot be undone, and a forgotten account is never imported again.</p>
            </div>
        </div>

        <div class="omni-grid two">
            <!-- ── forget ───────────────────────────────────────────────── -->
            <OmniscienceV3Card title="Forget a person" subtitle="Preview first: nothing changes until you confirm.">
                <form class="omni-form" data-testid="forget-form" @submit.prevent="preview()">
                    <div class="omni-field"><label for="f-person">Person</label>
                        <OmniscienceV3Pick kind="person" label="Person" any="Choose who…" :multiple="false" variant="field" input-id="f-person" testid="forget-person"
                                           :model-value="forget.personId ? [forget.personId] : []" @update:model-value="ids => { forget.personId = ids[0] ?? ''; clearPreview(); }" /></div>
                    <fieldset class="levels">
                        <legend class="visually-hidden">How much to forget</legend>
                        <label class="omni-check"><input v-model="forget.level" type="radio" value="derived" @change="clearPreview()" />
                            <span><strong>Switch analysis off.</strong> Forget what was worked out about them (labels, facts, relationships, briefs, alerts); their messages stay, and nothing is worked out from them again until you switch it back on.</span></label>
                        <label class="omni-check"><input v-model="forget.level" type="radio" value="erase" @change="clearPreview()" />
                            <span><strong>Erase everything.</strong> Remove their accounts, messages, reactions and media, and everything worked out from them. Future imports skip them.</span></label>
                    </fieldset>
                    <label v-if="forget.level === 'erase'" class="omni-check"><input v-model="forget.includeDirectChats" type="checkbox" @change="clearPreview()" />
                        Also erase your own messages in your direct chats with them</label>
                    <button class="omni-btn" type="submit" :disabled="busy !== null || !forget.personId.trim()">Preview</button>
                </form>

                <div v-if="pv" class="preview" data-testid="forget-preview">
                    <h4 class="omni-h4">{{ pv.level === 'erase' ? 'This will erase' : 'This will forget what was worked out about' }} {{ omniPersonLabel(pv.name) }}</h4>
                    <dl class="omni-kv">
                        <dt>Merged people</dt><dd>{{ omniCount(pv.persons) }}</dd>
                        <dt>Accounts</dt><dd>{{ omniCount(pv.identities) }}</dd>
                        <dt>Messages</dt><dd>{{ omniCount(pv.messages) }}<span v-if="pv.level !== 'erase'" class="omni-muted"> (kept)</span></dd>
                        <template v-if="pv.level === 'erase'">
                            <dt>Your messages to them</dt><dd>{{ pv.includeDirectChats ? omniCount(pv.directChatMessagesOfKlives) : 'kept' }} in {{ omniCount(pv.directChats) }} direct chats</dd>
                            <dt>Attachments</dt><dd>{{ omniCount(pv.attachments) }} ({{ omniCount(pv.mediaFiles) }} files; {{ omniCount(pv.mediaFilesLeft) }} shared with others stay)</dd>
                            <dt>Reactions</dt><dd>{{ omniCount(pv.reactions) }}</dd>
                        </template>
                        <dt>Events</dt><dd>{{ omniCount(pv.events) }}</dd>
                        <dt>Facts</dt><dd>{{ omniCount(pv.facts) }}</dd>
                    </dl>
                    <ul v-if="pv.notes.length" class="notes"><li v-for="(n, i) in pv.notes" :key="i">{{ n }}</li></ul>
                    <div class="omni-field" :class="{ invalid: typed && !typedOk }">
                        <label for="f-confirm">Type <strong>{{ confirmWord }}</strong> to confirm</label>
                        <input id="f-confirm" v-model="typed" class="omni-input" autocomplete="off" data-testid="forget-typed" />
                        <span class="help">This preview expires <OmniscienceV3Time :ms="pv.expiresAtMs" mode="age" />.</span>
                    </div>
                    <button class="omni-btn danger" type="button" :disabled="busy !== null || !typedOk" data-testid="forget-confirm" @click="confirm()">
                        {{ pv.level === 'erase' ? 'Erase for good' : 'Switch analysis off' }}</button>
                </div>

                <div v-if="runState" class="omni-banner" :class="runState.state === 'done' ? 'ok' : runState.state === 'failed' ? '' : 'info'" role="status" data-testid="forget-run">
                    <span class="glyph" aria-hidden="true">{{ runState.state === 'done' ? '✓' : runState.state === 'failed' ? '⚠' : '⏳' }}</span>
                    <div><strong>{{ runState.state === 'done' ? 'Done' : runState.state === 'failed' ? 'Failed' : 'Working…' }}</strong>
                        <span class="muted">{{ runState.error ?? Object.entries(runState.counts).filter(([, n]) => n).map(([k, n]) => `${omniHumanise(k).toLowerCase()} ${omniCount(n)}`).join(' · ') }}</span></div>
                </div>
            </OmniscienceV3Card>

            <div class="stack">
                <OmniscienceV3Panel title="Analysis switched off" flush :loading="analysisOff.loading.value" :error="analysisOff.error.value" :has-data="!!analysisOff.data.value"
                                    :empty="!!analysisOff.data.value && !analysisOff.data.value.people.length" empty-title="Nobody" empty-kind="ok"
                                    empty-text="Everyone's messages are analysed." @retry="analysisOff.refresh()">
                    <table v-if="analysisOff.data.value" class="omni-table" data-testid="analysis-off-table">
                        <tbody><tr v-for="p in analysisOff.data.value.people" :key="p.personId">
                            <td><NuxtLink :to="`${OMNI_BASE}/people/${encodeURIComponent(p.personId)}`">{{ omniPersonLabel(p.name) }}</NuxtLink></td>
                            <td class="num">since <OmniscienceV3Time :ms="p.sinceMs" mode="age" /></td>
                            <td class="actions"><button class="omni-btn ghost sm" type="button" :disabled="busy !== null" @click="analysisOn(p.personId)">Switch back on</button></td>
                        </tr></tbody>
                    </table>
                </OmniscienceV3Panel>

                <OmniscienceV3Card v-if="canExport" title="Export a person" subtitle="Everything held about one person, as a file.">
                    <form class="omni-row" data-testid="export-form" @submit.prevent="exportPerson()">
                        <OmniscienceV3Pick class="omni-grow" kind="person" label="Person" any="Choose who…" :multiple="false" variant="field" testid="export-person"
                                           :model-value="exportForm.personId ? [exportForm.personId] : []" @update:model-value="ids => (exportForm.personId = ids[0] ?? '')" />
                        <select v-model="exportForm.format" class="omni-select auto" aria-label="Format"><option value="json">JSON</option><option value="markdown">Markdown</option></select>
                        <button class="omni-btn" type="submit" :disabled="busy !== null || !exportForm.personId.trim()">Download</button>
                    </form>
                </OmniscienceV3Card>

                <OmniscienceV3Panel title="What is kept" flush :loading="retention.loading.value" :error="retention.error.value" :has-data="!!retention.data.value"
                                    :empty="!!retention.data.value && !retention.data.value.streams.length" @retry="retention.refresh()">
                    <table v-if="retention.data.value" class="omni-table" data-testid="retention-table">
                        <thead><tr><th>Stream</th><th class="num">Kept</th><th class="num">Deleted</th><th class="num">Last sweep</th></tr></thead>
                        <tbody><tr v-for="r in retention.data.value.streams" :key="r.stream">
                            <td>{{ omniHumanise(r.stream) }}</td><td class="num">{{ r.keptDays }} days</td>
                            <td class="num">{{ omniCount(r.deletedTotal) }}<span v-if="r.lastDeleted" class="sub">+{{ omniCount(r.lastDeleted) }} last time</span></td>
                            <td class="num"><OmniscienceV3Time :ms="r.lastRunMs" mode="age" /></td>
                        </tr></tbody>
                    </table>
                </OmniscienceV3Panel>
            </div>
        </div>

        <!-- ── backups ──────────────────────────────────────────────────── -->
        <OmniscienceV3Panel title="Encrypted backups" class="backups" :subtitle="backups.data.value ? `keeping ${backups.data.value.keep} · key ${backups.data.value.keyId ?? 'not made yet'}` : undefined"
                            flush :loading="backups.loading.value" :error="backups.error.value" :has-data="!!backups.data.value"
                            :empty="!!backups.data.value && !backups.data.value.backups.length"
                            :empty-title="backups.data.value && !backups.data.value.enabled ? 'Nightly backups are switched off' : 'No backups yet'" @retry="backups.refresh()">
            <template #controls>
                <button class="omni-btn sm" type="button" :disabled="busy !== null" data-testid="backup-run" @click="backupNow()">Back up now</button>
            </template>
            <table v-if="backups.data.value" class="omni-table" data-testid="backups-table">
                <thead><tr><th>When</th><th>Trigger</th><th>Stores</th><th class="num">Size</th><th></th></tr></thead>
                <tbody><tr v-for="b in backups.data.value.backups" :key="b.backupId">
                    <td><OmniscienceV3Time :ms="b.createdAtMs" /></td>
                    <td>{{ b.trigger }}</td>
                    <td>{{ b.files.map(f => f.store).join(', ') }}</td>
                    <td class="num">{{ bytes(b.files.reduce((sum, f) => sum + f.encryptedBytes, 0)) }}</td>
                    <td class="actions"><button class="omni-btn ghost sm" type="button" :disabled="busy !== null" @click="restore(b.backupId)">Restore to a folder</button></td>
                </tr></tbody>
            </table>
            <template #footer>
                <div class="keys">
                    <p v-if="restored" class="omni-wrap" data-testid="restored">Restored {{ restored.files.length }} files to <span class="omni-mono">{{ restored.folder }}</span>. {{ restored.note }}</p>
                    <form class="omni-row" @submit.prevent="exportKey()">
                        <input v-model="keyForm.passphrase" class="omni-input grow" type="password" autocomplete="new-password" placeholder="Passphrase (12+ characters)" aria-label="Passphrase to protect the exported key" />
                        <button class="omni-btn sm" type="submit" :disabled="busy !== null || keyForm.passphrase.length < 12">Export the backup key</button>
                    </form>
                    <div v-if="exportedKey" class="omni-banner warn" role="status">
                        <span class="glyph" aria-hidden="true">🔑</span>
                        <div><strong>Keep this somewhere safe, away from this server.</strong>
                            <span class="muted">Without it and its passphrase, the backups cannot be read anywhere else.</span>
                            <code class="omni-mono omni-wrap exported">{{ exportedKey }}</code></div>
                        <div class="actions"><button class="omni-btn ghost sm" type="button" @click="copyKey()">Copy</button></div>
                    </div>
                    <form class="omni-row" @submit.prevent="importKey()">
                        <input v-model="keyForm.exported" class="omni-input mono grow" placeholder="An exported key" aria-label="Exported key" />
                        <input v-model="keyForm.importPassphrase" class="omni-input" type="password" autocomplete="off" placeholder="Its passphrase" aria-label="Passphrase of the exported key" />
                        <button class="omni-btn sm" type="submit" :disabled="busy !== null || !keyForm.exported.trim() || !keyForm.importPassphrase">Import a key</button>
                    </form>
                </div>
            </template>
        </OmniscienceV3Panel>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { OMNI_BASE, omniGet, omniPost, omniPostText } from '~/scripts/omniscience/api';
import type {
    AnalysisOffListDto, AnalysisOnDto, BackupKeyDto, BackupListDto, BackupRequestedDto, ForgetPreviewDto, ForgetRunDto, RestoreDto, RetentionListDto,
} from '~/scripts/omniscience/contracts';
import { omniCount, omniDownload } from '~/scripts/omniscience/format';
import { omniHumanise } from '~/scripts/omniscience/findings';
import { omniPersonLabel, useOmniAction, useOmniResource } from '~/composables/useOmniscienceV3';
import { useAccess } from '~/composables/useAccess';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Data controls' });

const route = useRoute();
const { can } = useAccess();
const canExport = computed(() => can('omniscience.data.export'));
const { busy, run } = useOmniAction();

const initialPerson = typeof route.query.person === 'string' ? route.query.person : '';
const forget = reactive({ personId: initialPerson, level: 'derived', includeDirectChats: false });
const pv = ref<ForgetPreviewDto | null>(null);
const typed = ref('');
const runState = ref<ForgetRunDto | null>(null);
let poll: ReturnType<typeof setInterval> | null = null;

const confirmWord = computed(() => (pv.value?.level === 'erase' ? 'ERASE' : 'FORGET'));
const typedOk = computed(() => typed.value.trim().toUpperCase() === confirmWord.value);

function clearPreview() { pv.value = null; typed.value = ''; }

async function preview() {
    runState.value = null;
    const result = await run('forget-preview', () => omniPost<ForgetPreviewDto>('data/forget/preview', {
        personId: forget.personId.trim(), includeDirectChats: forget.level === 'erase' && forget.includeDirectChats, level: forget.level,
    }));
    if (result) { pv.value = result; typed.value = ''; }
}

async function confirm() {
    if (!pv.value) return;
    const result = await run('forget-confirm', () => omniPost<ForgetRunDto>('data/forget/confirm', { personId: pv.value!.personId, confirmToken: pv.value!.confirmToken }),
        () => (pv.value?.level === 'erase' ? 'Erasing: this takes a little while.' : 'Switching analysis off.'));
    if (!result) return;
    runState.value = result;
    pv.value = null;
    typed.value = '';
    watchRun(result.runId);
}

function watchRun(runId: string) {
    stopPoll();
    poll = setInterval(async () => {
        try {
            const state = await omniGet<ForgetRunDto>('data/forget/run', { id: runId });
            runState.value = state;
            if (state.state === 'done' || state.state === 'failed') { stopPoll(); void analysisOff.refresh(); }
        } catch {
            stopPoll(); // the next manual action shows the error
        }
    }, 2000);
}
function stopPoll() { if (poll) { clearInterval(poll); poll = null; } }
onBeforeUnmount(stopPoll);

const analysisOff = useOmniResource(signal => omniGet<AnalysisOffListDto>('data/analysis', {}, signal));
async function analysisOn(personId: string) {
    const result = await run('analysis-on', () => omniPost<AnalysisOnDto>('data/analysis/on', { personId }),
        r => (r.changed ? 'Analysis is back on; their messages are read again in the background.' : 'It was already on.'));
    if (result) void analysisOff.refresh();
}

const retention = useOmniResource(signal => omniGet<RetentionListDto>('data/retention', {}, signal));

const exportForm = reactive({ personId: initialPerson, format: 'json' });
async function exportPerson() {
    const format = exportForm.format;
    const text = await run('export', () => omniPostText('data/export/person', { personId: exportForm.personId.trim(), format }));
    if (text !== null) omniDownload(`omniscience-person.${format === 'markdown' ? 'md' : 'json'}`, text, format === 'markdown' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8');
}

const backups = useOmniResource(signal => omniGet<BackupListDto>('data/backups', {}, signal));
const restored = ref<RestoreDto | null>(null);
async function backupNow() {
    await run('backup', () => omniPost<BackupRequestedDto>('data/backups/run', {}), r => `Backing up (job #${r.jobId}); it appears here when it is done.`);
}
async function restore(backupId: string) {
    if (!window.confirm('Decrypt this backup into a new folder on the server? The live stores are not touched.')) return;
    const result = await run('restore', () => omniPost<RestoreDto>('data/backups/restore', { backupId }));
    if (result) restored.value = result;
}

const keyForm = reactive({ passphrase: '', exported: '', importPassphrase: '' });
const exportedKey = ref<string | null>(null);
async function exportKey() {
    const result = await run('key-export', () => omniPost<BackupKeyDto>('data/backups/export-key', { passphrase: keyForm.passphrase }));
    keyForm.passphrase = '';
    if (result) exportedKey.value = result.exported ?? null;
}
async function importKey() {
    const result = await run('key-import', () => omniPost<BackupKeyDto>('data/backups/import-key', { exported: keyForm.exported.trim(), passphrase: keyForm.importPassphrase }),
        r => `Key ${r.keyId} imported.`);
    keyForm.importPassphrase = '';
    if (result) { keyForm.exported = ''; void backups.refresh(); }
}
async function copyKey() {
    if (!exportedKey.value) return;
    try { await navigator.clipboard.writeText(exportedKey.value); } catch { /* the key stays on screen to copy by hand */ }
}

function bytes(n: number): string {
    if (n < 1024) return `${n} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let v = n / 1024, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}
</script>

<style scoped>
.stack { display: flex; flex-direction: column; gap: var(--omni-gutter); min-width: 0; }
.omni-form { display: flex; flex-direction: column; gap: 12px; }
.levels { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.levels .omni-check { align-items: flex-start; }
.levels .omni-check span { line-height: 1.45; }
.preview { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--omni-line); display: flex; flex-direction: column; gap: 12px; }
.omni-h4 { margin: 0; font-size: 13px; }
.notes { margin: 0; padding-left: 18px; font-size: 12.5px; color: var(--omni-text-2); }
td.actions { white-space: nowrap; text-align: right; }
.grow { flex: 1 1 220px; }
.backups { margin-top: var(--omni-gutter); }
.keys { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.exported { display: block; margin-top: 6px; font-size: 11px; }
</style>
