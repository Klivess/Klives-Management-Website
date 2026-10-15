<template>
  <article class="pj-computer" :class="['state-' + computer.state, { compact }]" :data-container-id="computer.containerID">
    <header class="pc-head">
      <div class="pc-title">
        <strong :title="label">{{ label }}</strong>
        <span class="pc-sub pj-mono">{{ pjShortId(computer.containerID) }}<template v-if="projectName"> · {{ projectName }}</template></span>
      </div>
      <span class="ot-chip" :class="state.tone">{{ state.label }}</span>
    </header>

    <div v-if="showLive && live" class="pc-live">
      <ProjectsLiveDesktop :container-id="computer.containerID" :label="label" :fps="compact ? 2 : 4" clickable @maximize="$emit('control')" />
    </div>
    <div v-else-if="showLive" class="pc-asleep dw-sleeping">
      <p>{{ restingText }}</p>
      <button v-if="computer.state === 'asleep'" class="ot-btn sm" :disabled="busy || hostDown" @click="$emit('resume')">
        {{ busy ? 'Resuming…' : 'Resume computer' }}
      </button>
    </div>

    <dl class="pc-facts">
      <div>
        <dt>Browser</dt>
        <dd>
          <template v-if="!computer.daemon">—</template>
          <template v-else-if="computer.daemon.browser.up">
            <span class="ok">● up</span><span v-if="computer.daemon.browser.tabs != null"> · {{ computer.daemon.browser.tabs }} tab{{ computer.daemon.browser.tabs === 1 ? '' : 's' }}</span>
          </template>
          <span v-else-if="computer.daemon.browser.process" class="warn">● starting / busy</span>
          <span v-else class="pj-muted">○ closed</span>
        </dd>
      </div>
      <div>
        <dt>Memory</dt>
        <dd>
          <template v-if="memory">
            <span class="pc-meter" :class="memoryTone" :title="`${memory.used} of ${memory.limit} MB`">
              <i :style="{ width: memory.pct + '%' }"></i>
            </span>
            <span class="pj-mono">{{ memory.used }}/{{ memory.limit }} MB</span>
            <span v-if="computer.daemon?.memory?.oomKills" class="bad" title="Processes the kernel killed for memory"> · {{ computer.daemon.memory.oomKills }} OOM</span>
          </template>
          <template v-else>—</template>
        </dd>
      </div>
      <div>
        <dt>Routes</dt>
        <dd class="pc-routes">
          <span class="ot-chip" :class="computer.vncConnected ? 'ok' : ''" title="Host VNC connection (live view, agent input)">VNC</span>
          <span class="ot-chip" :class="daemonTone" :title="daemonTitle">Daemon{{ computer.daemon ? ' v' + computer.daemon.protocol : '' }}</span>
        </dd>
      </div>
      <div>
        <dt>Activity</dt>
        <dd>
          <span v-if="computer.actionInFlight" class="ok">acting now</span>
          <span v-else-if="computer.controlledBy">held by {{ computer.controlledBy }}</span>
          <span v-else class="pj-muted">used {{ pjAgo(computer.lastUsedAt, now) }}</span>
        </dd>
      </div>
    </dl>

    <ul v-if="!compact && notableEvents.length" class="pc-events">
      <li v-for="e in notableEvents" :key="e.seq" :class="eventTone(e.kind)">
        <span class="pj-mono">{{ pjClock(e.at) }}</span> {{ e.message }}
      </li>
    </ul>

    <footer class="pc-actions">
      <button v-if="live" class="ot-btn sm" @click="$emit('control')">Take control</button>
      <button class="ot-btn ghost sm" @click="$emit('inspect')">Diagnose</button>
      <div v-if="computer.state !== 'missing'" class="pc-repair">
        <select class="ot-select auto pc-repair-select" :aria-label="`Repair ${label}`" :disabled="busy || hostDown" @change="onRepair">
          <option value="">Repair…</option>
          <option v-for="r in PJ_REPAIRS" :key="r.action" :value="r.action" :title="r.detail">{{ r.label }}</option>
        </select>
      </div>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import ProjectsLiveDesktop from '~/components/Projects/LiveDesktop.vue';
import { PJ_REPAIRS, pjAgo, pjClock, pjComputerState, pjShortId, type ProjectsComputer } from '~/composables/useProjectsUi';

const props = defineProps<{
  computer: ProjectsComputer;
  label: string;
  projectName?: string;
  showLive?: boolean;
  compact?: boolean;
  busy?: boolean;
  hostDown?: boolean;
}>();
const emit = defineEmits<{ control: []; inspect: []; resume: []; repair: [action: string] }>();

const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;
onMounted(() => { clock = setInterval(() => { now.value = Date.now(); }, 30000); });
onBeforeUnmount(() => { if (clock) clearInterval(clock); });

const state = computed(() => pjComputerState(props.computer));
const live = computed(() => props.computer.state === 'running' || props.computer.state === 'degraded');
const restingText = computed(() => props.hostDown ? 'Waiting for the computer host to recover.'
  : props.computer.state === 'missing' ? 'Computer is missing from the host.'
  : props.computer.state === 'asleep' ? 'Sleeping — installed apps and files are preserved.'
  : 'Not answering. Diagnose it, or restart it from Repair.');

const memory = computed(() => {
  const m = props.computer.daemon?.memory;
  if (!m || m.usedMB == null || !m.limitMB) return null;
  return { used: Math.round(m.usedMB), limit: Math.round(m.limitMB), pct: Math.min(100, Math.round(100 * m.usedMB / m.limitMB)) };
});
const memoryTone = computed(() => !memory.value ? '' : memory.value.pct >= 90 ? 'bad' : memory.value.pct >= 75 ? 'warn' : 'ok');

const daemonTone = computed(() => {
  const d = props.computer.daemon;
  if (!d) return props.computer.state === 'asleep' ? '' : 'warn';
  return d.authConfigured ? 'ok' : 'warn';
});
const daemonTitle = computed(() => {
  const d = props.computer.daemon;
  if (!d) return 'The in-computer control daemon is not answering (asleep, outdated, or starting).';
  return d.authConfigured
    ? `Control daemon up for ${Math.round(d.uptimeSeconds / 60)} min — exec, input and screenshots skip Docker.`
    : 'Control daemon up but not yet authorised; the next helper refresh delivers its token.';
});

const NOTABLE = new Set(['oom-kill', 'browser-exited', 'browser-hung-killed', 'watchdog-error']);
const notableEvents = computed(() => (props.computer.daemon?.events ?? []).filter(e => NOTABLE.has(e.kind)).slice(-3).reverse());
function eventTone(kind: string) { return kind === 'oom-kill' || kind === 'browser-hung-killed' ? 'bad' : 'warn'; }

function onRepair(event: Event) {
  const select = event.target as HTMLSelectElement;
  const action = select.value;
  select.value = '';
  if (action) emit('repair', action);
}
</script>

<style scoped>
.pj-computer { display: flex; flex-direction: column; border: 1px solid var(--ot-line); border-radius: var(--ot-radius); background: var(--ot-surface); min-width: 0; overflow: hidden; }
.pj-computer.state-missing, .pj-computer.state-unreachable { border-color: rgba(255, 123, 123, 0.4); }
.pj-computer.state-degraded { border-color: rgba(240, 180, 41, 0.4); }
.pc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--ot-space-2); padding: var(--ot-space-2) var(--ot-space-3); border-bottom: 1px solid var(--ot-line); }
.pc-title { display: flex; flex-direction: column; min-width: 0; }
.pc-title strong { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: capitalize; }
.pc-sub { font-size: 11px; color: var(--ot-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-live :deep(.live-desktop) { border-radius: 0; background: #070907; }
.pc-live :deep(.ld-head) { display: none; }
.pc-live :deep(.ld-frame) { aspect-ratio: 16 / 9; min-height: 0; background: #070907; }
.pc-asleep { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ot-space-2); padding: var(--ot-space-4) var(--ot-space-3); background: rgba(0,0,0,0.25); font-size: 12.5px; color: var(--ot-text-2); aspect-ratio: 16 / 9; justify-content: center; }
.compact .pc-asleep { aspect-ratio: auto; }
.pc-asleep p { margin: 0; font-size: 12.5px; }
.pc-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ot-space-2) var(--ot-space-3); margin: 0; padding: var(--ot-space-3); font-size: 12px; }
.pc-facts dt { font-size: 10px; letter-spacing: 0.8px; text-transform: uppercase; color: var(--ot-muted); font-weight: 650; margin-bottom: 2px; }
.pc-facts dd { margin: 0; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; min-width: 0; }
.pc-routes { gap: var(--ot-space-1); }
.ok { color: var(--ot-positive); }
.warn { color: var(--ot-warning); }
.bad { color: var(--ot-negative); }
.pc-meter { display: inline-block; width: 46px; height: 6px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
.pc-meter i { display: block; height: 100%; background: var(--ot-positive); border-radius: 999px; }
.pc-meter.warn i { background: var(--ot-warning); }
.pc-meter.bad i { background: var(--ot-negative); }
.pc-events { list-style: none; margin: 0; padding: 0 var(--ot-space-3) var(--ot-space-2); display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; }
.pc-events li.bad { color: #ffb4b4; }
.pc-events li.warn { color: #f5d78a; }
.pc-events .pj-mono { color: var(--ot-muted); margin-right: 4px; }
.pc-actions { display: flex; align-items: center; gap: var(--ot-space-2); padding: var(--ot-space-2) var(--ot-space-3); border-top: 1px solid var(--ot-line); margin-top: auto; flex-wrap: wrap; }
.pc-repair { margin-left: auto; }
.pc-repair-select { height: var(--ot-control-sm); font-size: 11.5px; }
</style>
