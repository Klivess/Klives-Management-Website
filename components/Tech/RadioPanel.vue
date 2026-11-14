<template>
  <div class="ktx-panel ktx-radio" data-testid="ktx-radio">
    <div v-if="!status" class="ktx-empty">
      <TechIcon name="radar" />
      <span>{{ supported ? 'Reading the hub…' : "This server doesn't report its radio or relay yet. It arrives with the hub status route." }}</span>
    </div>

    <template v-else>
      <div class="ktx-radio__grid">
        <!-- Bluetooth -->
        <section class="ktx-box" aria-label="Bluetooth">
          <h3 class="ktx-sec-title"><TechIcon name="bluetooth" />Bluetooth<span class="ktx-sec-title__meta">{{ bt.available ? (bt.scanning ? 'scanning' : 'idle') : 'no adapter' }}</span></h3>
          <dl class="ktx-kv">
            <dt>Last scan</dt><dd>{{ bt.lastScanUtc ? `${fmtAgo(bt.lastScanUtc, now)} · took ${fmtMs(bt.lastScanMs)}` : '—' }}</dd>
            <dt>Saw</dt><dd>{{ bt.lastScanUtc ? `${plural(bt.lastDevicesSeen, 'device')}, ${bt.lastKliveTechSeen} KliveTech` : '—' }}</dd>
            <dt>Scans</dt><dd class="ktx-num">{{ fmtNum(bt.scans) }} · every {{ bt.intervalSeconds }} s, {{ bt.timeoutSeconds }} s limit</dd>
            <dt>Failures</dt><dd :data-tone="bt.consecutiveFailures ? 'warn' : undefined">{{ fmtNum(bt.failures) }}<template v-if="bt.consecutiveFailures"> · {{ bt.consecutiveFailures }} in a row</template></dd>
            <template v-if="bt.lastError"><dt>Last error</dt><dd>{{ bt.lastError }} · {{ fmtClock(bt.lastErrorUtc, now) }}</dd></template>
          </dl>
        </section>

        <!-- enrolment -->
        <section class="ktx-box" aria-label="Enrolment">
          <h3 class="ktx-sec-title"><TechIcon name="plus" />Enrolment<span class="ktx-sec-title__meta">{{ status.enrolment.allowNewDevices ? 'open' : 'remembered only' }}</span></h3>
          <p class="ktx-note">
            <template v-if="status.enrolment.allowNewDevices">Any device named “KliveTech…” that Bluetooth sees is connected and remembered.</template>
            <template v-else>Only remembered gadgets connect. <span class="ktx-mono">{{ status.enrolment.setting }}</span> is off; a nearby device can still be let in one at a time.</template>
          </p>
          <ul v-if="status.nearby.length" class="ktx-mini">
            <li v-for="d in status.nearby" :key="d.address">
              <span class="ktx-dotmark" data-tone="info"></span>
              <span class="ktx-truncate">{{ d.name || 'KliveTech device' }}</span>
              <span class="ktx-mono ktx-faint">{{ d.address }}</span>
              <span class="ktx-grow"></span>
              <span v-if="d.enrolling" class="ktx-chip" data-tone="info">connecting</span>
              <button v-else-if="canManage && !status.enrolment.allowNewDevices" class="ktx-btn ktx-btn--xs" @click="emit('enrol', d.address)">Enrol</button>
            </li>
          </ul>
          <p v-else class="ktx-faint">Nothing unenrolled nearby in the last 15 minutes.</p>
        </section>

        <!-- relay -->
        <section class="ktx-box ktx-box--wide" aria-label="Relay hubs">
          <h3 class="ktx-sec-title"><TechIcon name="hub" />Relay<span class="ktx-sec-title__meta">{{ openHubs.length ? `${openHubs.length} connected` : 'no hub connected' }} · {{ status.relay.connectedTotal }} sessions, {{ status.relay.refusedTotal }} turned away</span></h3>
          <div class="ktx-relay-facts">
            <span><b>Endpoint</b><button class="ktx-copy ktx-mono" @click="copy(endpoint)">{{ endpoint }}</button></span>
            <span><b>Access token</b><span :data-tone="status.relay.tokenConfigured ? 'ok' : 'crit'">{{ status.relay.tokenConfigured ? 'set (KliveTechHubAccessToken)' : 'missing' }}</span></span>
          </div>
          <table v-if="status.relay.hubs.length" class="ktx-table ktx-table--tight">
            <thead><tr><th>Hub</th><th>Connected</th><th>Last message</th><th class="ktx-num">Gadgets</th></tr></thead>
            <tbody>
              <tr v-for="h in status.relay.hubs" :key="h.hubID">
                <td><span class="ktx-dotmark" :data-tone="h.open ? 'ok' : 'neutral'"></span>{{ h.name }} <span class="ktx-mono ktx-faint">{{ h.hubID }}</span></td>
                <td>{{ fmtClock(h.connectedSinceUtc, now) }} <span class="ktx-faint">({{ fmtDuration(now - (parseUtc(h.connectedSinceUtc) ?? now)) }})</span></td>
                <td>{{ fmtAgo(h.lastMessageUtc, now) }}</td>
                <td class="ktx-num">{{ h.gadgets }}</td>
              </tr>
            </tbody>
          </table>
          <h4 class="ktx-subhead">Connection attempts <span class="ktx-faint">(newest first, since the server started)</span></h4>
          <table v-if="status.relay.attempts.length" class="ktx-table ktx-table--tight" data-testid="relay-attempts">
            <thead><tr><th>When</th><th>Hub</th><th>Outcome</th><th>Detail</th><th class="ktx-num ktx-col-md">Lasted</th></tr></thead>
            <tbody>
              <tr v-for="(a, i) in status.relay.attempts" :key="i">
                <td style="white-space: nowrap; font-variant-numeric: tabular-nums">{{ fmtClock(a.atUtc, now) }}</td>
                <td class="ktx-truncate">{{ a.hubName || '—' }}</td>
                <td><span class="ktx-chip" :data-tone="RELAY_OUTCOME[a.outcome]?.tone ?? 'neutral'">{{ RELAY_OUTCOME[a.outcome]?.label ?? a.outcome }}</span></td>
                <td class="ktx-dim">{{ a.detail || '—' }}</td>
                <td class="ktx-num ktx-col-md ktx-dim">{{ a.endedUtc ? fmtDuration((parseUtc(a.endedUtc) ?? 0) - (parseUtc(a.atUtc) ?? 0)) : a.outcome === 'connected' ? 'open' : '—' }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="ktx-faint">No hub has tried to connect since the server started {{ fmtAgo(status.startedUtc, now) }}. If one is powered, its serial log says why it cannot reach {{ endpoint }}.</p>
        </section>

        <!-- remembered -->
        <section class="ktx-box ktx-box--wide" aria-label="Remembered gadgets">
          <h3 class="ktx-sec-title"><TechIcon name="chip" />Remembered<span class="ktx-sec-title__meta">{{ status.remembered.length }}</span></h3>
          <table v-if="status.remembered.length" class="ktx-table ktx-table--tight">
            <thead><tr><th>Gadget</th><th>State</th><th class="ktx-col-md">Link</th><th class="ktx-num">Attempts</th><th>Last result</th></tr></thead>
            <tbody>
              <tr v-for="r in status.remembered" :key="r.gadgetID || r.address" tabindex="0" @click="emit('open', r.gadgetID || r.address)" @keydown.enter="emit('open', r.gadgetID || r.address)">
                <td><span class="ktx-cellstack"><span>{{ r.name }}</span><span class="ktx-mono ktx-faint">{{ r.address }}</span></span></td>
                <td><span class="ktx-chip" :data-tone="r.state === 'online' ? 'ok' : r.state === 'unreachable' ? 'crit' : 'neutral'">{{ r.state.replace(/-/g, ' ') }}</span></td>
                <td class="ktx-col-md">{{ r.connectionType }}</td>
                <td class="ktx-num">{{ r.totalAttempts }}<span v-if="r.failedAttempts" class="ktx-faint">&nbsp;({{ r.failedAttempts }} failed)</span></td>
                <td class="ktx-dim">{{ r.lastError ? `${r.lastError} · ${fmtClock(r.lastErrorUtc, now)}` : r.lastConnectedUtc ? `connected ${fmtClock(r.lastConnectedUtc, now)}` : '—' }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="ktx-faint">No gadget is remembered yet.</p>
        </section>

        <!-- telemetry budget -->
        <section class="ktx-box ktx-box--wide" aria-label="Telemetry limits">
          <h3 class="ktx-sec-title"><TechIcon name="gauge" />Telemetry budget</h3>
          <div class="ktx-budget">
            <div><span>Streams</span><b>{{ status.streamables.enabled }}/{{ status.streamables.declared }}</b><i>on {{ status.streamables.gadgets }} gadget{{ status.streamables.gadgets === 1 ? '' : 's' }} · ≤ {{ KT_LIMITS.streamablesPerGadget }} each</i></div>
            <div><span>Samples kept</span><b>{{ fmtCompact(status.streamables.retainedSamples) }}</b><i>{{ fmtBytes(status.streamables.retainedSampleBytes) }} of 16 MiB</i></div>
            <div><span>Frames kept</span><b>{{ fmtBytes(status.streamables.retainedFrameBytes) }}</b><i>two per stream, ≤ {{ fmtBytes(KT_LIMITS.binaryFrameBytes) }} each</i></div>
            <div><span>Live viewers</span><b>{{ status.streamables.liveViewers }}/{{ status.streamables.maximumLiveViewers }}</b><i>8-deep queue each, oldest dropped</i></div>
            <div><span>Dropped</span><b :data-tone="status.streamables.droppedEvents ? 'warn' : undefined">{{ fmtNum(status.streamables.droppedEvents) }}</b><i>since the server started</i></div>
            <div><span>Fastest stream</span><b>{{ KT_LIMITS.minIntervalMs }} ms</b><i>faster is refused, not throttled</i></div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  KT_LIMITS, RELAY_OUTCOME, fmtAgo, fmtBytes, fmtClock, fmtCompact, fmtDuration, fmtMs, fmtNum, ktCopy, parseUtc, plural, wsBase,
  type HubStatus,
} from '~/scripts/kliveTech';

/** The hub's radio and relay: what Bluetooth sees, who may enrol, every relay attempt, the budgets. */
const props = defineProps<{ status: HubStatus | null; supported: boolean; now: number; canManage: boolean }>();
const emit = defineEmits<{ enrol: [address: string]; open: [key: string]; copied: [] }>();

const bt = computed(() => props.status!.bluetooth);
const openHubs = computed(() => (props.status?.relay.hubs ?? []).filter(h => h.open));
const endpoint = computed(() => `${wsBase()}${props.status?.relay.endpoint ?? '/klivetech/hub/connect'}`);

async function copy(text: string) {
  if (await ktCopy(text)) emit('copied');
}
</script>
