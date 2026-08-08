<!--
  KliveTech OS — fleet control.

  Component naming: files in components/KliveTech/ are auto-imported path-prefixed, so
  Panel.vue is <KliveTechPanel>. A bare <Panel> renders NOTHING, silently, with no
  console error. If a section of this page goes blank, check the tag name first.

  Two data loops feed this page and they have strictly separated jobs:
    * HTTP polling owns structure — which gadgets exist, whether they are online, what
      Streamables they declare, and every firmware job.
    * The WebSocket owns motion — samples and frames for the ONE gadget in the drawer.
  Where they overlap (latestValue, latestSequence) the socket wins while it is
  connected, because a 6s-old poll must never overwrite a 100ms-old sample.
-->
<template>
    <div class="kt-os" :data-density="density">
        <header class="kt-top">
            <div class="kt-brand">
                <b>KliveTech</b>
                <span>Fleet Control</span>
            </div>

            <span class="kt-chip" :class="fleetTone">
                {{ onlineGadgets.length }} / {{ gadgets.length }} online
            </span>
            <span v-if="transportSummary" class="kt-chip mono">{{ transportSummary }}</span>

            <span class="kt-fresh">
                <KliveTechLamp :tone="freshnessTone" :pulse="live.status.value === 'live'" />
                <b>{{ freshnessLabel }}</b>
            </span>

            <span class="grow"></span>
            <div class="kt-vent" aria-hidden="true"></div>

            <div class="kt-segment sm" role="group" aria-label="Telemetry">
                <button :aria-pressed="!telemetryPaused" @click="setTelemetry(true)">Live</button>
                <button :aria-pressed="telemetryPaused" @click="setTelemetry(false)">Paused</button>
            </div>
            <div class="kt-segment sm" role="group" aria-label="Density">
                <button :aria-pressed="density === 'standard'" @click="density = 'standard'">Standard</button>
                <button :aria-pressed="density === 'compact'" @click="density = 'compact'">Compact</button>
            </div>
            <button class="kt-btn ghost sm" :disabled="loadingFleet" @click="refreshAll">Refresh</button>
        </header>
        <div class="kt-rail" :class="[fleetTone, { live: live.status.value === 'live' }]" aria-hidden="true"></div>

        <div class="kt-page">
            <div v-if="fleetError" class="kt-notice fault" style="border-radius:var(--kt-radius)">
                <span aria-hidden="true">⚠</span>
                <span>{{ fleetError }}</span>
                <button class="kt-btn sm" style="margin-left:auto" @click="refreshAll">Try again</button>
            </div>
            <div v-if="live.status.value === 'refused' || live.status.value === 'unavailable'"
                 class="kt-notice warn" style="border-radius:var(--kt-radius)">
                <span aria-hidden="true">⚠</span>
                <span>{{ live.statusDetail.value }}</span>
            </div>

            <!-- KPI strip. Every tile is qualified: a bare count of gadgets would read as
                 "connected devices" when the hub also returns remembered-but-offline ones. -->
            <div class="kt-stats">
                <KliveTechStat label="Gadgets online" :loading="initialLoad"
                    :value="fleetLoaded ? `${onlineGadgets.length} / ${gadgets.length}` : NO_VALUE"
                    :tone="gadgets.length && !onlineGadgets.length ? 'warn' : 'ok'"
                    :foot="offlineCount ? `${offlineCount} remembered but offline` : 'all remembered gadgets are up'"
                    help="The hub also returns gadgets it remembers but cannot currently reach." />

                <KliveTechStat label="Relay hubs" :loading="initialLoad"
                    :value="fleetLoaded ? String(hubs.length) : NO_VALUE"
                    :foot="`hosting ${hostedCount} gadget${hostedCount === 1 ? '' : 's'}`"
                    help="ESP32 hubs that proxy their own children to Omnipotent over the internet." />

                <KliveTechStat label="Transports" :loading="initialLoad"
                    :value="dominantTransport" :foot="transportSummary || 'no links'"
                    help="How each gadget reaches the hub: Bluetooth directly, or through a relay hub." />

                <KliveTechStat label="Actions exposed" :loading="initialLoad"
                    :value="fleetLoaded ? String(totalActions) : NO_VALUE"
                    :foot="`across ${onlineGadgets.length} online gadget${onlineGadgets.length === 1 ? '' : 's'}`" />

                <KliveTechStat label="Streamables" :loading="initialLoad"
                    :value="streamablesLoaded ? `${enabledStreamCount} / ${streamables.length}` : NO_VALUE"
                    :foot="busiestLabel" help="Enabled of declared. A gadget may declare at most 32." />

                <KliveTechStat label="Dropped events" :loading="initialLoad"
                    :value="streamablesLoaded ? fmtNum(totalDropped) : NO_VALUE"
                    :tone="totalDropped > 0 ? 'fault' : 'ok'"
                    foot="since each gadget's session began"
                    help="Samples the hub discarded because a queue was full. Anything above zero means telemetry is lossy." />

                <KliveTechStat v-if="activeJobs.length" label="Firmware jobs" tone="warn"
                    :value="String(activeJobs.length)" :foot="activeJobs[0].state.toLowerCase()" />
            </div>

            <!-- Fleet -->
            <KliveTechPanel title="Fleet" :subtitle="fleetSubtitle" flush screws
                :loading="initialLoad" :empty="fleetLoaded && !gadgets.length"
                empty-kind="nohardware"
                empty-text="Omnipotent discovers gadgets over Bluetooth, or accepts an ESP32 relay hub over the internet. Neither has reported in. If this is unexpected, check that the host has a Bluetooth adapter and that KliveTechAllowNewDevices is enabled for a first enrolment.">
                <KliveTechDataTable :rows="gadgets" :columns="fleetColumns" label="gadgets"
                    :row-key="g => g.gadgetID" searchable search-placeholder="Search gadgets…"
                    selectable :selected-key="openGadget?.gadgetID"
                    :row-class="rowClass" default-sort="name" max-height="380px"
                    @select="openDrawer">
                    <template #cell-status="{ row }">
                        <KliveTechLamp :tone="gadgetTone(row, now)" :word="gadgetStateWord(row, now)" />
                    </template>
                    <template #cell-name="{ row }">
                        <span class="kt-cellstack">
                            <span>{{ row.name }}</span>
                            <span class="sub">{{ shortId(row.gadgetID) }}</span>
                        </span>
                    </template>
                    <template #cell-connectionType="{ row }">
                        <span class="kt-chip" :class="transportClass(row.connectionType)">
                            {{ row.connectionType }}
                        </span>
                        <span v-if="row.isHub" class="kt-chip accent" style="margin-left:4px">HUB</span>
                    </template>
                    <template #cell-via="{ row }">
                        <span v-if="row.isHub">hosts {{ row.connectedGadgetCount }}</span>
                        <span v-else-if="row.connectedViaHubID" class="mono">{{ hubNameFor(row) }}</span>
                        <span v-else class="none">{{ NO_VALUE }}</span>
                    </template>
                    <template #cell-IPAddress="{ row }">
                        <span class="mono">{{ row.IPAddress || NO_VALUE }}</span>
                    </template>
                    <template #cell-actions="{ row }">{{ row.actions?.length ?? 0 }}</template>
                    <template #cell-streams="{ row }">
                        <span class="kt-cellstack" style="align-items:flex-end">
                            <span>{{ row.streamableCount }}</span>
                            <span v-if="enabledFor(row)" class="sub">{{ enabledFor(row) }} live</span>
                        </span>
                    </template>
                    <template #cell-lastMessageReceived="{ row }">
                        <span :class="{ 'kt-stale': isQuiet(row) }">
                            {{ fmtAgo(row.lastMessageReceived, now) }}
                        </span>
                    </template>
                    <template #cell-uptime="{ row }">{{ uptimeFor(row) }}</template>
                </KliveTechDataTable>
            </KliveTechPanel>

            <!-- Tabs -->
            <div>
                <nav class="kt-tabs" role="tablist" aria-label="KliveTech sections">
                    <button v-for="t in TABS" :key="t.id" role="tab" :aria-selected="tab === t.id"
                            @click="tab = t.id">
                        {{ t.label }}
                        <span v-if="t.id === 'firmware' && activeJobs.length" class="kt-chip warn">
                            {{ activeJobs.length }}
                        </span>
                    </button>
                </nav>

                <!-- ---------------------------------------------------- telemetry --- -->
                <div v-if="tab === 'telemetry'" role="tabpanel">
                    <KliveTechPanel :subtitle="telemetrySubtitle" flush
                        :loading="initialLoad" :empty="!filteredStreamables.length"
                        :empty-kind="streamables.length ? 'filtered' : (gadgets.length ? 'empty' : 'nohardware')"
                        :empty-title="streamables.length ? undefined
                            : (gadgets.length ? 'No gadget has published a Streamable' : undefined)"
                        :empty-text="streamables.length ? undefined
                            : (gadgets.length
                                ? 'Streamables are declared by the gadget firmware, not configured here. A gadget that declares none will not appear.'
                                : 'Connect a gadget over Bluetooth, or bring up an ESP32 relay hub, to see telemetry.')">
                        <template #controls>
                            <select v-model="streamGadgetFilter" class="kt-select" aria-label="Filter by gadget">
                                <option value="">All gadgets</option>
                                <option v-for="g in gadgets" :key="g.gadgetID" :value="g.gadgetID">{{ g.name }}</option>
                            </select>
                            <label class="kt-switch">
                                <input v-model="enabledOnly" type="checkbox" />
                                <span class="track"></span>
                                <span>Enabled only</span>
                            </label>
                        </template>

                        <div class="kt-tabletools">
                            <button v-for="type in VALUE_TYPES" :key="type" class="kt-btn ghost sm"
                                    :class="{ active: typeFilter === type }"
                                    @click="typeFilter = typeFilter === type ? '' : type">
                                {{ type }}
                            </button>
                            <span class="grow"></span>
                            <input v-model="streamSearch" class="kt-input" type="search"
                                   placeholder="Search stream IDs…" aria-label="Search stream IDs"
                                   style="min-width:160px" />
                        </div>

                        <div class="readouts">
                            <KliveTechReadout v-for="(entry, index) in filteredStreamables"
                                :key="`${entry.gadgetID}/${entry.streamID}`"
                                :entry="entry" :spark="sparkFor(entry)" :now="now" clickable
                                :pulse="isLiveGadget(entry.gadgetID)"
                                :trace-stroke="traceColour(index)"
                                @open="openStream(entry)">
                                <span class="muted" style="font-size:10px">{{ entry.gadgetName }}</span>
                            </KliveTechReadout>
                        </div>
                    </KliveTechPanel>
                </div>

                <!-- ----------------------------------------------------- firmware --- -->
                <div v-else-if="tab === 'firmware'" role="tabpanel" class="kt-grid sidebar-left">
                    <KliveTechPanel title="Build & flash" subtitle="Compiles from the firmware inbox"
                        :error="firmwareConfigError"
                        :error-title="'The firmware toolchain is not available'"
                        @retry="loadFirmwareStatics">
                        <div class="kt-stack">
                            <div class="kt-field">
                                <label for="kt-project">Project</label>
                                <select id="kt-project" v-model="form.project" class="kt-select">
                                    <option value="">Choose a project…</option>
                                    <option v-for="p in projects" :key="p.name" :value="p.name" :disabled="!p.valid">
                                        {{ p.name }}{{ p.valid ? '' : ' — unusable' }}
                                    </option>
                                </select>
                                <span v-if="selectedProject && !selectedProject.valid" class="err">
                                    {{ selectedProject.error }}
                                </span>
                                <span v-else-if="selectedProject?.sketches.length" class="hint">
                                    {{ selectedProject.sketches.join(', ') }}
                                </span>
                            </div>

                            <div class="kt-formgrid">
                                <div class="kt-field">
                                    <label for="kt-fqbn">Board (FQBN)</label>
                                    <input id="kt-fqbn" v-model="form.fqbn" class="kt-input mono"
                                           :placeholder="config?.defaultFqbn || 'esp32:esp32:esp32'" />
                                    <span v-if="!form.fqbn" class="hint">using the server default</span>
                                </div>
                                <div class="kt-field">
                                    <label for="kt-partition">Partition scheme</label>
                                    <input id="kt-partition" v-model="form.partitionScheme" class="kt-input mono"
                                           :placeholder="config?.defaultPartitionScheme || 'min_spiffs'" />
                                    <span v-if="!form.partitionScheme" class="hint">using the server default</span>
                                </div>
                            </div>

                            <div class="kt-field">
                                <label for="kt-target">Target gadget</label>
                                <select id="kt-target" v-model="form.gadgetID" class="kt-select">
                                    <option value="">Compile only — do not flash</option>
                                    <option v-for="g in onlineGadgets" :key="g.gadgetID" :value="g.gadgetID">
                                        {{ g.name }}
                                    </option>
                                </select>
                            </div>

                            <div class="kt-actions">
                                <button class="kt-btn primary" :disabled="!canSubmit" @click="submitFirmware">
                                    {{ form.gadgetID ? 'Compile & flash' : 'Compile' }}
                                </button>
                                <button class="kt-btn ghost" :disabled="firmwareBusy" @click="loadFirmwareStatics">
                                    Rescan inbox
                                </button>
                            </div>
                            <p v-if="firmwareError" class="err">{{ firmwareError }}</p>
                        </div>

                        <template #footer>
                            <dl v-if="config" class="kt-kv">
                                <dt>Inbox</dt><dd>{{ config.inboxDirectory }}</dd>
                                <dt>Builds</dt><dd>{{ config.buildsDirectory }}</dd>
                                <dt>Transfer</dt>
                                <dd>{{ config.chunkSize }} B chunks · max {{ fmtBytes(config.maximumFirmwareBytes) }}</dd>
                            </dl>
                        </template>
                    </KliveTechPanel>

                    <KliveTechPanel title="Jobs" :subtitle="`${jobs.length} remembered`" flush
                        :loading="initialLoad" :empty="!jobs.length"
                        empty-title="No firmware job yet"
                        empty-text="Compiling needs no gadget — it is the quickest way to check the toolchain works.">
                        <KliveTechDataTable :rows="jobs" :columns="jobColumns" label="jobs"
                            :row-key="j => j.jobID" selectable :selected-key="expandedJob"
                            default-sort="createdUtc" default-direction="desc" max-height="none"
                            @select="j => expandedJob = expandedJob === j.jobID ? '' : j.jobID">
                            <template #cell-state="{ row }">
                                <span class="kt-chip" :class="jobTone(row.state)">{{ row.state }}</span>
                            </template>
                            <template #cell-target="{ row }">
                                <span class="kt-cellstack">
                                    <span>{{ row.project || NO_VALUE }}</span>
                                    <span class="sub">{{ row.gadgetName || 'compile only' }}</span>
                                </span>
                            </template>
                            <template #cell-progress="{ row }">
                                <KliveTechMeter v-if="!isTerminalJob(row.state)"
                                    :percent="row.progressPercent"
                                    :indeterminate="row.state === 'Compiling'"
                                    :tone="jobTone(row.state)"
                                    :value="progressLabel(row)" />
                                <span v-else class="muted">{{ jobDuration(row) }}</span>
                            </template>
                            <template #cell-createdUtc="{ row }">{{ fmtAgo(row.createdUtc, now) }}</template>
                            <template #cell-actions="{ row }">
                                <button v-if="!isTerminalJob(row.state)" class="kt-btn sm danger"
                                        @click.stop="cancelJob(row)">Cancel</button>
                            </template>
                        </KliveTechDataTable>

                        <div v-if="expandedJobRow" class="jobdetail">
                            <dl class="kt-kv">
                                <dt>Job ID</dt><dd>{{ expandedJobRow.jobID }}</dd>
                                <dt>Board</dt><dd>{{ expandedJobRow.fqbn }} · {{ expandedJobRow.partitionScheme }}</dd>
                                <dt>Artifact</dt>
                                <dd>
                                    {{ expandedJobRow.firmwareFileName || NO_VALUE }}
                                    <template v-if="expandedJobRow.totalBytes">
                                        · {{ fmtBytes(expandedJobRow.totalBytes) }}
                                    </template>
                                </dd>
                                <dt>SHA-256</dt>
                                <dd>{{ expandedJobRow.firmwareSha256
                                    ? expandedJobRow.firmwareSha256.slice(0, 32) + '…' : NO_VALUE }}</dd>
                                <dt>Started</dt><dd>{{ fmtTime(expandedJobRow.startedUtc) }}</dd>
                                <dt>Finished</dt><dd>{{ fmtTime(expandedJobRow.completedUtc) }}</dd>
                            </dl>
                            <div v-if="expandedJobRow.error" class="kt-notice fault"
                                 style="border-radius:var(--kt-radius-sm);margin-top:var(--kt-space-3)">
                                <span aria-hidden="true">⚠</span><span>{{ expandedJobRow.error }}</span>
                            </div>
                            <div style="margin-top:var(--kt-space-3)">
                                <button v-if="!showLog" class="kt-btn ghost sm" @click="showLog = true">
                                    Show build log
                                </button>
                                <KliveTechLogPane v-else :text="expandedJobRow.compilerOutput || '(no output)'"
                                    :file-name="`${expandedJobRow.project || 'build'}.log`"
                                    :following="!isTerminalJob(expandedJobRow.state)"
                                    :focus-error="expandedJobRow.state === 'Failed'" />
                            </div>
                        </div>
                    </KliveTechPanel>
                </div>

                <!-- ----------------------------------------------------- topology --- -->
                <div v-else-if="tab === 'topology'" role="tabpanel" class="kt-stack">
                    <KliveTechPanel title="Link map" subtitle="How each gadget reaches Omnipotent"
                        :loading="initialLoad" :empty="fleetLoaded && !gadgets.length" empty-kind="nohardware">
                        <KliveTechTopologyMap :gadgets="gadgets" :now="now" @select="openDrawer" />
                    </KliveTechPanel>

                    <div class="kt-grid two">
                        <KliveTechPanel title="Protocol limits" subtitle="Hard ceilings in the Streamables protocol">
                            <div class="kt-stack">
                                <KliveTechMeter v-for="g in gadgetsWithStreams" :key="g.gadgetID"
                                    :label="g.name"
                                    :percent="(g.streamableCount / KT_LIMITS.streamablesPerGadget) * 100"
                                    :tone="g.streamableCount >= KT_LIMITS.streamablesPerGadget ? 'fault' : ''"
                                    :value="`${g.streamableCount} / ${KT_LIMITS.streamablesPerGadget}`" />
                                <KliveTechStateBlock v-if="!gadgetsWithStreams.length" kind="empty" compact
                                    title="No gadget declares a Streamable" />
                                <dl class="kt-kv" style="margin-top:var(--kt-space-2)">
                                    <dt>Scalar value</dt><dd>≤ {{ fmtBytes(KT_LIMITS.scalarValueBytes) }}</dd>
                                    <dt>Binary frame</dt><dd>≤ {{ fmtBytes(KT_LIMITS.binaryFrameBytes) }}</dd>
                                    <dt>Minimum interval</dt><dd>{{ KT_LIMITS.minIntervalMs }} ms</dd>
                                    <dt>Stream ID</dt><dd>≤ {{ KT_LIMITS.streamIdLength }} chars</dd>
                                    <dt>Live viewers</dt><dd>{{ KT_LIMITS.liveViewers }} across the whole service</dd>
                                </dl>
                            </div>
                            <template #footer>
                                A stream below the minimum interval, or a gadget at the streamable ceiling,
                                is rejected by the hub rather than throttled.
                            </template>
                        </KliveTechPanel>

                        <KliveTechPanel title="Session ledger"
                            subtitle="A new session ID means the gadget restarted"
                            :empty="!live.sessionLedger.value.length && !sessionRows.length"
                            empty-title="No session change observed"
                            empty-text="Sessions are recorded while a gadget's telemetry is open in the drawer.">
                            <div class="kt-stack">
                                <table v-if="sessionRows.length" class="kt-table">
                                    <thead><tr><th>Gadget</th><th>Session</th><th class="num">Rev</th></tr></thead>
                                    <tbody>
                                        <tr v-for="row in sessionRows" :key="row.gadgetID">
                                            <td>{{ row.name }}</td>
                                            <td class="mono">{{ row.sessionID.slice(0, 16) }}…</td>
                                            <td class="num">{{ row.revision }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                                <div v-if="live.sessionLedger.value.length">
                                    <span class="kt-sectionhead">Observed restarts</span>
                                    <ul style="margin-top:var(--kt-space-2)">
                                        <li v-for="(entry, i) in live.sessionLedger.value" :key="i"
                                            class="mono" style="font-size:11px;color:var(--kt-muted)">
                                            {{ new Date(entry.at).toLocaleTimeString() }} —
                                            {{ entry.sessionID.slice(0, 12) }}…
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </KliveTechPanel>
                    </div>

                    <KliveTechPanel title="Raw feeds" subtitle="What the page last received">
                        <details>
                            <summary class="kt-btn ghost sm" style="display:inline-flex">Last WebSocket frames</summary>
                            <pre class="raw">{{ live.recentFrames.value.join('\n') || '(nothing yet)' }}</pre>
                        </details>
                        <details style="margin-top:var(--kt-space-2)">
                            <summary class="kt-btn ghost sm" style="display:inline-flex">Fleet response</summary>
                            <pre class="raw">{{ JSON.stringify(gadgets, null, 2) }}</pre>
                        </details>
                        <details style="margin-top:var(--kt-space-2)">
                            <summary class="kt-btn ghost sm" style="display:inline-flex">Streamables response</summary>
                            <pre class="raw">{{ JSON.stringify(streamables, null, 2) }}</pre>
                        </details>
                    </KliveTechPanel>
                </div>
            </div>
        </div>

        <KliveTechDrawer :open="!!openGadget" :title="openGadget?.name"
                         :subtitle="openGadget?.gadgetID" @close="closeDrawer">
            <KliveTechGadgetDrawer v-if="openGadget"
                :gadget="openGadget" :all-gadgets="gadgets"
                :streamables="drawerStreamables"
                :buffers="live.buffers.value" :frames="live.frames.value"
                :jobs="drawerJobs"
                :live-status="live.status.value" :live-detail="live.statusDetail.value"
                :busy-streams="busyStreams" :stream-errors="streamErrors"
                :now="now"
                @run-action="runAction"
                @set-enabled="setStreamEnabled"
                @set-interval="setStreamInterval"
                @fetch-frame="live.fetchFrame"
                @toggle-pause="setTelemetry(telemetryPaused)"
                @flash="prefillFlash"
                @open="openDrawer" />
            <template #footer>
                <button class="kt-btn ghost" @click="showInTelemetry">Open in Telemetry</button>
                <span class="grow"></span>
                <button class="kt-btn" @click="closeDrawer">Close</button>
            </template>
        </KliveTechDrawer>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import {
    ktGet, ktPostJson, ktPostQuery, useKtPolling, useKtClock,
    fmtAgo, fmtBytes, fmtDuration, fmtNum, fmtTime, parseUtc, ageMs,
    gadgetTone, gadgetStateWord, transportClass, traceColour, jobTone,
    isTerminalJob, shortId, isChartable,
    KT_LIMITS, KT_SWAL, NO_VALUE, STALE_AFTER_MS,
    type FirmwareConfig, type FirmwareJob, type FirmwareProject,
    type Gadget, type GadgetAction, type StreamableEntry,
} from '~/scripts/kliveTech';
import { useKliveTechLive } from '~/scripts/kliveTechLive';
import type { TableColumn } from '~/components/KliveTech/DataTable.vue';

definePageMeta({ layout: 'navbar' });

const TABS = [
    { id: 'telemetry', label: 'Telemetry' },
    { id: 'firmware', label: 'Firmware' },
    { id: 'topology', label: 'Topology & diagnostics' },
] as const;
const VALUE_TYPES = ['integer', 'number', 'boolean', 'string', 'json', 'binary'] as const;

const now = useKtClock();
const live = useKliveTechLive();

const gadgets = ref<Gadget[]>([]);
const streamables = ref<StreamableEntry[]>([]);
const jobs = ref<FirmwareJob[]>([]);
const projects = ref<FirmwareProject[]>([]);
const config = ref<FirmwareConfig | null>(null);

const fleetLoaded = ref(false);
const streamablesLoaded = ref(false);
const loadingFleet = ref(false);
const fleetError = ref('');
const firmwareError = ref('');
const firmwareConfigError = ref('');
const firmwareBusy = ref(false);
const lastGoodFetch = ref<number | null>(null);

const tab = ref<typeof TABS[number]['id']>('telemetry');
const density = ref<'standard' | 'compact'>('standard');
const telemetryPaused = ref(false);
const openGadget = ref<Gadget | null>(null);
const expandedJob = ref('');
const showLog = ref(false);

const streamGadgetFilter = ref('');
const typeFilter = ref('');
const streamSearch = ref('');
const enabledOnly = ref(false);

const busyStreams = ref(new Set<string>());
const streamErrors = ref<Record<string, string>>({});

const form = ref({ project: '', fqbn: '', partitionScheme: '', gadgetID: '' });

const initialLoad = computed(() => !fleetLoaded.value && !fleetError.value);

/* ------------------------------------------------------------------- loading --- */

async function loadFleet() {
    loadingFleet.value = true;
    try {
        const [fleet, catalog] = await Promise.all([
            ktGet<Gadget[]>('/klivetech/GetAllGadgets'),
            ktGet<StreamableEntry[]>('/klivetech/streamables'),
        ]);
        gadgets.value = fleet ?? [];

        // While a socket is open its gadget's live values are newer than anything this
        // poll can carry, so the poll updates that gadget's configuration but leaves
        // its readings alone.
        const liveId = live.gadgetID.value;
        streamables.value = (catalog ?? []).map((entry) => {
            if (!liveId || entry.gadgetID !== liveId) return entry;
            const current = streamables.value.find(
                e => e.gadgetID === entry.gadgetID && e.streamID === entry.streamID);
            if (!current) return entry;
            return {
                ...entry,
                latestValue: current.latestValue,
                latestSequence: current.latestSequence,
                latestReceivedUtc: current.latestReceivedUtc,
            };
        });

        fleetLoaded.value = true;
        streamablesLoaded.value = true;
        fleetError.value = '';
        lastGoodFetch.value = Date.now();

        // A gadget can vanish between polls; the drawer must not hold a ghost.
        if (openGadget.value) {
            const refreshed = gadgets.value.find(g => g.gadgetID === openGadget.value!.gadgetID);
            if (refreshed) openGadget.value = refreshed;
            else closeDrawer();
        }
    } catch (error: any) {
        fleetError.value = error?.message ?? 'The KliveTech hub could not be reached';
    } finally {
        loadingFleet.value = false;
    }
}

async function loadJobs() {
    try {
        jobs.value = await ktGet<FirmwareJob[]>('/klivetech/firmware/jobs');
    } catch {
        // Firmware is one section of the page; its failure must not blank the rest.
    }
}

async function loadFirmwareStatics() {
    firmwareBusy.value = true;
    firmwareConfigError.value = '';
    try {
        const [loadedConfig, loadedProjects] = await Promise.all([
            ktGet<FirmwareConfig>('/klivetech/firmware/config'),
            ktGet<FirmwareProject[]>('/klivetech/firmware/projects'),
        ]);
        config.value = loadedConfig;
        projects.value = loadedProjects ?? [];
    } catch (error: any) {
        firmwareConfigError.value = error?.message
            ?? 'Arduino CLI is not configured on this server, so firmware cannot be built.';
    } finally {
        firmwareBusy.value = false;
    }
}

useKtPolling(loadFleet, 4000);

// Jobs move fast while one is running and not at all when none is. Polling both at the
// same rate either wastes requests or makes an upload look frozen.
const activeJobs = computed(() => jobs.value.filter(j => !isTerminalJob(j.state)));
let jobTimer: ReturnType<typeof setInterval> | null = null;
function retuneJobPolling() {
    if (jobTimer) clearInterval(jobTimer);
    const interval = activeJobs.value.length ? 1500 : 20_000;
    jobTimer = setInterval(() => { if (!document.hidden) void loadJobs(); }, interval);
}
watch(() => activeJobs.value.length > 0, retuneJobPolling, { immediate: true });

onMounted(() => {
    void loadJobs();
    void loadFirmwareStatics();
});
onBeforeUnmount(() => { if (jobTimer) clearInterval(jobTimer); });

async function refreshAll() {
    await Promise.all([loadFleet(), loadJobs()]);
}

/* ------------------------------------------------------------------- derived --- */

const onlineGadgets = computed(() => gadgets.value.filter(g => g.isOnline));
const offlineCount = computed(() => gadgets.value.length - onlineGadgets.value.length);
const hubs = computed(() => gadgets.value.filter(g => g.isHub));
const hostedCount = computed(() => hubs.value.reduce((sum, h) => sum + h.connectedGadgetCount, 0));
const totalActions = computed(() =>
    onlineGadgets.value.reduce((sum, g) => sum + (g.actions?.length ?? 0), 0));
const enabledStreamCount = computed(() => streamables.value.filter(s => s.enabled).length);
const totalDropped = computed(() => streamables.value.reduce((sum, s) => sum + s.droppedEvents, 0));
const gadgetsWithStreams = computed(() => gadgets.value.filter(g => g.streamableCount > 0));

const transportCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const gadget of onlineGadgets.value) {
        counts[gadget.connectionType] = (counts[gadget.connectionType] ?? 0) + 1;
    }
    return counts;
});
const transportSummary = computed(() =>
    Object.entries(transportCounts.value)
        .map(([type, count]) => `${type} ${count}`)
        .join(' · '));
const dominantTransport = computed(() => {
    const entries = Object.entries(transportCounts.value);
    if (!entries.length) return fleetLoaded.value ? 'none' : NO_VALUE;
    return entries.sort((a, b) => b[1] - a[1])[0][0];
});

const busiest = computed(() =>
    gadgets.value.reduce<Gadget | null>(
        (best, g) => (!best || g.streamableCount > best.streamableCount ? g : best), null));
const busiestLabel = computed(() => {
    const gadget = busiest.value;
    if (!gadget || !gadget.streamableCount) return 'none declared';
    return `busiest: ${gadget.name} at ${gadget.streamableCount} of ${KT_LIMITS.streamablesPerGadget}`;
});

const fleetTone = computed(() => {
    if (fleetError.value) return 'fault';
    if (!gadgets.value.length) return 'idle';
    return offlineCount.value ? 'warn' : 'ok';
});

const fleetSubtitle = computed(() => {
    if (!fleetLoaded.value) return 'Loading…';
    const remembered = offlineCount.value
        ? `, ${offlineCount.value} remembered but unreachable` : '';
    return `${onlineGadgets.value.length} reachable${remembered}`;
});

const freshnessTone = computed(() => {
    if (fleetError.value) return 'fault';
    if (live.status.value === 'live') return 'ok';
    const age = lastGoodFetch.value ? now.value - lastGoodFetch.value : null;
    return age !== null && age > 15_000 ? 'warn' : 'ok';
});
const freshnessLabel = computed(() => {
    if (fleetError.value) return 'Hub unreachable';
    if (!lastGoodFetch.value) return 'Connecting…';
    const age = now.value - lastGoodFetch.value;
    if (live.status.value === 'live') return 'Live telemetry';
    if (age > 15_000) return `Stale — last good ${fmtDuration(age)} ago`;
    return `Polling · ${fmtDuration(age)} ago`;
});

const sessionRows = computed(() => {
    const seen = new Map<string, { gadgetID: string; name: string; sessionID: string; revision: number }>();
    for (const entry of streamables.value) {
        if (!entry.sessionID || seen.has(entry.gadgetID)) continue;
        seen.set(entry.gadgetID, {
            gadgetID: entry.gadgetID,
            name: entry.gadgetName,
            sessionID: entry.sessionID,
            revision: entry.manifestRevision,
        });
    }
    return [...seen.values()];
});

function hubNameFor(gadget: Gadget): string {
    const hub = gadgets.value.find(g => g.isHub && g.hubID === gadget.connectedViaHubID);
    return hub ? hub.name : gadget.connectedViaHubID;
}
function enabledFor(gadget: Gadget): number {
    return streamables.value.filter(s => s.gadgetID === gadget.gadgetID && s.enabled).length;
}
function isQuiet(gadget: Gadget): boolean {
    if (!gadget.isOnline) return false;
    const age = ageMs(gadget.lastMessageReceived, now.value);
    return age !== null && age > STALE_AFTER_MS;
}
function uptimeFor(gadget: Gadget): string {
    if (!gadget.isOnline) return NO_VALUE;
    const at = parseUtc(gadget.timeConnected);
    return at === null ? NO_VALUE : fmtDuration(now.value - at);
}
function rowClass(gadget: Gadget): string {
    if (!gadget.isOnline) return 'fault';
    return isQuiet(gadget) ? 'warn' : '';
}
function isLiveGadget(gadgetID: string): boolean {
    return live.status.value === 'live' && live.gadgetID.value === gadgetID;
}

/* -------------------------------------------------------------- telemetry tab -- */

const filteredStreamables = computed(() => streamables.value.filter((entry) => {
    if (streamGadgetFilter.value && entry.gadgetID !== streamGadgetFilter.value) return false;
    if (typeFilter.value && entry.valueType !== typeFilter.value) return false;
    if (enabledOnly.value && !entry.enabled) return false;
    if (streamSearch.value && !entry.streamID.toLowerCase().includes(streamSearch.value.toLowerCase())) return false;
    return true;
}));

const telemetrySubtitle = computed(() => {
    if (!streamables.value.length) return '';
    const shown = filteredStreamables.value.length;
    const base = shown === streamables.value.length
        ? `${shown} streamable${shown === 1 ? '' : 's'}`
        : `${shown} of ${streamables.value.length} streamables`;
    return live.status.value === 'live'
        ? `${base} · live samples for ${liveGadgetName.value}`
        : `${base} · open a gadget for live samples`;
});

const liveGadgetName = computed(() =>
    gadgets.value.find(g => g.gadgetID === live.gadgetID.value)?.name ?? 'the selected gadget');

function sparkFor(entry: StreamableEntry): number[] {
    if (!isChartable(entry.valueType)) return [];
    if (live.gadgetID.value !== entry.gadgetID) return [];
    return (live.buffers.value.get(entry.streamID)?.points ?? []).slice(-40).map(p => p.y);
}

function openStream(entry: StreamableEntry) {
    const gadget = gadgets.value.find(g => g.gadgetID === entry.gadgetID);
    if (gadget) openDrawer(gadget);
}

/* ------------------------------------------------------------------- drawer ---- */

const drawerStreamables = computed(() => {
    if (!openGadget.value) return [];
    const id = openGadget.value.gadgetID;
    // While the socket is open its catalog is the fresher of the two.
    const source = live.gadgetID.value === id && live.liveCatalog.value.length
        ? live.liveCatalog.value
        : streamables.value;
    return source.filter(entry => entry.gadgetID === id);
});

const drawerJobs = computed(() => {
    if (!openGadget.value) return [];
    return jobs.value
        .filter(job => job.gadgetID === openGadget.value!.gadgetID)
        .slice(0, 5);
});

function openDrawer(gadget: Gadget) {
    openGadget.value = gadget;
    if (!telemetryPaused.value) live.subscribe(gadget.gadgetID);
}

function closeDrawer() {
    openGadget.value = null;
    live.unsubscribe();
}

function showInTelemetry() {
    if (openGadget.value) streamGadgetFilter.value = openGadget.value.gadgetID;
    tab.value = 'telemetry';
    closeDrawer();
}

function setTelemetry(pause: boolean) {
    telemetryPaused.value = pause;
    live.setPaused(pause);
    if (!pause && openGadget.value) live.subscribe(openGadget.value.gadgetID);
}

/* ------------------------------------------------------------------ actions ---- */

async function runAction(action: GadgetAction, param: string, done: (error?: string) => void) {
    const gadget = openGadget.value;
    if (!gadget) { done('No gadget is selected.'); return; }
    try {
        // This route reads its arguments from the query string, not a JSON body.
        await ktPostQuery(
            `/klivetech/executegadgetaction?gadgetID=${encodeURIComponent(gadget.gadgetID)}` +
            `&gadgetName=${encodeURIComponent(gadget.name)}` +
            `&actionName=${encodeURIComponent(action.name)}` +
            `&actionParam=${encodeURIComponent(param)}`);
        done();
    } catch (error: any) {
        done(error?.message ?? 'The gadget did not acknowledge the action.');
        if (error?.status === 404) void loadFleet();
    }
}

/* -------------------------------------------------------------- stream control - */

async function controlStream(streamID: string, body: Record<string, unknown>) {
    const gadget = openGadget.value;
    if (!gadget) return;

    const busy = new Set(busyStreams.value);
    busy.add(streamID);
    busyStreams.value = busy;
    streamErrors.value = { ...streamErrors.value, [streamID]: '' };

    try {
        const updated = await ktPostJson<StreamableEntry>('/klivetech/streamables/control', {
            gadgetID: gadget.gadgetID,
            streamID,
            ...body,
        });
        // The response IS the updated entry, so there is nothing to re-fetch.
        patchStreamable(updated);
    } catch (error: any) {
        streamErrors.value = {
            ...streamErrors.value,
            [streamID]: error?.message ?? 'The gadget rejected that change.',
        };
        if (error?.status === 404) void loadFleet();
    } finally {
        const done = new Set(busyStreams.value);
        done.delete(streamID);
        busyStreams.value = done;
    }
}

function patchStreamable(updated: StreamableEntry) {
    const apply = (list: StreamableEntry[]) => list.map(entry =>
        entry.gadgetID === updated.gadgetID && entry.streamID === updated.streamID
            ? { ...entry, ...updated }
            : entry);
    streamables.value = apply(streamables.value);
    live.liveCatalog.value = apply(live.liveCatalog.value);
}

function setStreamEnabled(streamID: string, enabled: boolean) {
    void controlStream(streamID, { enabled });
}

function setStreamInterval(streamID: string, intervalMs: number) {
    const entry = drawerStreamables.value.find(e => e.streamID === streamID);
    void controlStream(streamID, { enabled: entry?.enabled ?? true, intervalMs });
}

/* ------------------------------------------------------------------ firmware --- */

const selectedProject = computed(() => projects.value.find(p => p.name === form.value.project) ?? null);
const canSubmit = computed(() =>
    !!form.value.project && !!selectedProject.value?.valid && !firmwareBusy.value);

const expandedJobRow = computed(() => jobs.value.find(j => j.jobID === expandedJob.value) ?? null);
watch(expandedJob, () => { showLog.value = false; });

function progressLabel(job: FirmwareJob): string {
    if (job.state === 'Compiling') return 'compiling';
    if (!job.totalBytes) return `${job.progressPercent}%`;
    return `${fmtBytes(job.bytesTransferred)} / ${fmtBytes(job.totalBytes)}`;
}

function jobDuration(job: FirmwareJob): string {
    const started = parseUtc(job.startedUtc) ?? parseUtc(job.createdUtc);
    const finished = parseUtc(job.completedUtc);
    if (started === null || finished === null) return NO_VALUE;
    return fmtDuration(finished - started);
}

async function submitFirmware() {
    const gadget = gadgets.value.find(g => g.gadgetID === form.value.gadgetID);
    if (gadget) {
        const confirmed = await Swal.fire({
            title: 'Flash this gadget?',
            html: `<b>${gadget.name}</b> will be flashed with <b>${form.value.project}</b>.<br>` +
                  'It reboots when the upload finishes and drops its current Streamables session.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Compile & flash',
            ...KT_SWAL,
            confirmButtonColor: '#f2a93b',
        });
        if (!confirmed.isConfirmed) return;
    }

    firmwareBusy.value = true;
    firmwareError.value = '';
    try {
        // fqbn and partitionScheme are omitted when untouched so the server applies its
        // own defaults rather than us echoing them back as an explicit choice.
        const body: Record<string, string> = { project: form.value.project };
        if (form.value.fqbn.trim()) body.fqbn = form.value.fqbn.trim();
        if (form.value.partitionScheme.trim()) body.partitionScheme = form.value.partitionScheme.trim();
        if (gadget) body.gadgetID = gadget.gadgetID;

        const job = await ktPostJson<FirmwareJob>(
            gadget ? '/klivetech/firmware/update' : '/klivetech/firmware/compile', body);
        jobs.value = [job, ...jobs.value];
        expandedJob.value = job.jobID;
        tab.value = 'firmware';
    } catch (error: any) {
        firmwareError.value = error?.status === 409
            ? 'That gadget already has a firmware job running. Wait for it or cancel it first.'
            : error?.message ?? 'The firmware job could not be started.';
    } finally {
        firmwareBusy.value = false;
    }
}

async function cancelJob(job: FirmwareJob) {
    const confirmed = await Swal.fire({
        title: 'Cancel this job?',
        text: job.state === 'Uploading'
            ? 'Cancelling mid-upload leaves the gadget with a partial image, and it will need reflashing.'
            : 'The build will stop where it is.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Cancel job',
        cancelButtonText: 'Leave it running',
        ...KT_SWAL,
        confirmButtonColor: '#ff5f5f',
    });
    if (!confirmed.isConfirmed) return;

    try {
        await ktPostJson('/klivetech/firmware/jobs/cancel', { jobID: job.jobID });
    } catch {
        // A 404 means it finished on its own between the click and the request.
    } finally {
        void loadJobs();
    }
}

function prefillFlash(gadget: Gadget) {
    form.value.gadgetID = gadget.gadgetID;
    tab.value = 'firmware';
    closeDrawer();
}

/* ------------------------------------------------------------------- columns --- */

const fleetColumns: TableColumn<Gadget>[] = [
    { key: 'status', label: '', width: '110px', sortValue: g => (g.isOnline ? 1 : 0) },
    { key: 'name', label: 'Gadget', searchValue: g => `${g.name} ${g.gadgetID}` },
    { key: 'connectionType', label: 'Link', width: '150px' },
    { key: 'via', label: 'Via', width: '150px', sortValue: g => g.connectedViaHubID || '' },
    { key: 'IPAddress', label: 'Address', width: '140px' },
    { key: 'actions', label: 'Actions', num: true, width: '80px', sortValue: g => g.actions?.length ?? 0 },
    { key: 'streams', label: 'Streams', num: true, width: '90px', sortValue: g => g.streamableCount },
    {
        key: 'lastMessageReceived', label: 'Last heard', num: true, width: '110px',
        sortValue: g => parseUtc(g.lastMessageReceived) ?? 0,
    },
    { key: 'uptime', label: 'Up', num: true, width: '90px', sortValue: g => parseUtc(g.timeConnected) ?? 0 },
];

const jobColumns: TableColumn<FirmwareJob>[] = [
    { key: 'state', label: 'State', width: '110px' },
    { key: 'target', label: 'Project', searchValue: j => `${j.project} ${j.gadgetName}` },
    { key: 'progress', label: 'Progress', width: '190px', sortValue: j => j.progressPercent },
    { key: 'createdUtc', label: 'Started', num: true, width: '100px', sortValue: j => parseUtc(j.createdUtc) ?? 0 },
    { key: 'actions', label: '', num: true, sortable: false, width: '90px' },
];
</script>

<style scoped>
.readouts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: var(--kt-space-2);
    padding: var(--kt-card-pad);
}
.jobdetail {
    padding: var(--kt-card-pad);
    border-top: 1px solid var(--kt-line);
}
.raw {
    max-height: 300px;
    overflow: auto;
    margin-top: var(--kt-space-2);
    padding: var(--kt-space-2);
    background: var(--kt-inset);
    border: 1px solid var(--kt-line);
    border-radius: var(--kt-radius-sm);
    font-family: var(--kt-mono);
    font-size: 10px;
    color: var(--kt-text-2);
}
.err { font-size: 11px; color: var(--kt-lamp-fault); }
</style>
