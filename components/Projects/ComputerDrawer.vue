<template>
  <OmniTraderDrawer :open="open" :title="label" :subtitle="subtitle" wide @close="$emit('close')">
    <div v-if="loading && !diag" class="ot-skelrows"><div v-for="n in 6" :key="n" class="ot-skel"></div></div>
    <OmniTraderStateBlock v-else-if="error" kind="error" title="Diagnostics unavailable" :detail="error">
      <button class="ot-btn sm" @click="load">Try again</button>
    </OmniTraderStateBlock>
    <template v-else-if="diag">
      <section class="cd-section">
        <h4 class="ot-sectionhead">Components</h4>
        <div class="cd-chips">
          <span v-for="c in components" :key="c.key" class="ot-chip" :class="c.up ? 'ok' : c.optional ? '' : 'bad'" :title="c.help">
            {{ c.up ? '●' : '○' }} {{ c.label }}
          </span>
        </div>
      </section>

      <section class="cd-section">
        <h4 class="ot-sectionhead">Resources</h4>
        <dl class="ot-kv">
          <dt>Memory</dt><dd>{{ mem(health?.resources?.memory?.usedMB) }} used of {{ mem(health?.resources?.memory?.limitMB) }} ({{ mem(health?.resources?.memory?.availableMB) }} free)</dd>
          <dt>OOM kills</dt><dd :class="{ bad: (health?.resources?.memory?.oomKills ?? 0) > 0 }">{{ health?.resources?.memory?.oomKills ?? '—' }}</dd>
          <dt>Load</dt><dd>{{ health?.resources?.load1 ?? '—' }} on {{ health?.resources?.cpus ?? '?' }} CPUs</dd>
          <dt>Disk free</dt><dd>{{ mem(health?.resources?.rootFreeMB) }}<template v-if="health?.resources?.projectFreeMB != null"> · /project {{ mem(health?.resources?.projectFreeMB) }}</template></dd>
          <dt>Image</dt><dd>v{{ health?.image?.version || '?' }} · daemon protocol {{ health?.protocol }} · up {{ pjDuration(health?.uptimeSeconds) }}</dd>
          <dt>Browser</dt><dd>{{ health?.browserUp ? `up · ${health?.browser?.tabs ?? '?'} tab(s) · ${health?.browser?.processCount ?? '?'} process(es)` : (health?.browser?.process ? 'process running, debugger silent' : 'closed') }}</dd>
        </dl>
      </section>

      <section v-if="diag.topMemory?.length" class="cd-section">
        <h4 class="ot-sectionhead">Largest processes</h4>
        <div class="ot-bars">
          <div v-for="p in diag.topMemory" :key="p.pid" class="ot-bar">
            <span class="lbl" :title="`pid ${p.pid}`">{{ p.comm }}</span>
            <span class="track"><span class="fill" :style="{ left: 0, width: barWidth(p.rssMB) }"></span></span>
            <span class="val">{{ Math.round(p.rssMB) }} MB</span>
          </div>
        </div>
      </section>

      <section class="cd-section">
        <h4 class="ot-sectionhead">What happened to this computer</h4>
        <p v-if="!diag.events?.length" class="pj-muted cd-note">No events recorded since its control daemon started.</p>
        <ul v-else class="ot-timeline">
          <li v-for="e in [...diag.events].reverse().slice(0, 30)" :key="e.seq">
            {{ e.message }}
            <span class="sub">{{ pjTime(e.at) }} · {{ e.kind }}</span>
          </li>
        </ul>
      </section>

      <section v-if="logNames.length" class="cd-section">
        <h4 class="ot-sectionhead">Logs</h4>
        <details v-for="name in logNames" :key="name" class="cd-log">
          <summary>{{ name }}</summary>
          <pre>{{ diag.logs[name] }}</pre>
        </details>
      </section>
    </template>

    <template #footer>
      <span class="cd-footnote">Repairs are ordered gentlest first. The agent using this computer is told what changed.</span>
      <button v-for="r in PJ_REPAIRS" :key="r.action" class="ot-btn sm" :class="r.tone" :title="r.detail" :disabled="busy" @click="$emit('repair', r.action)">
        {{ r.label }}
      </button>
    </template>
  </OmniTraderDrawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';
import { PJ_REPAIRS, pjDuration, pjTime } from '~/composables/useProjectsUi';

const props = defineProps<{ open: boolean; containerId: string | null; label: string; busy?: boolean }>();
defineEmits<{ close: []; repair: [action: string] }>();

const diag = ref<any>(null);
const loading = ref(false);
const error = ref('');
const health = computed(() => diag.value?.health ?? null);
const subtitle = computed(() => props.containerId ? `Computer ${props.containerId.slice(0, 12)}` : '');
const logNames = computed(() => Object.keys(diag.value?.logs ?? {}));

const COMPONENTS: { key: string; label: string; optional?: boolean; help: string }[] = [
  { key: 'display', label: 'Display', help: 'The X display (Xvfb) accepts connections.' },
  { key: 'x11vnc', label: 'VNC server', help: 'Serves the live view and the host input route.' },
  { key: 'windowManager', label: 'Window manager', help: 'Focus, maximise and window control.' },
  { key: 'panel', label: 'Panel', optional: true, help: 'Taskbar — for humans; restarts itself.' },
  { key: 'session', label: 'Session', optional: true, help: 'XFCE session manager.' },
  { key: 'desktop', label: 'Desktop', optional: true, help: 'Wallpaper and icons — cosmetic.' },
  { key: 'browserProcess', label: 'Browser', optional: true, help: 'Chromium is running.' },
  { key: 'browserCdp', label: 'Browser control', optional: true, help: 'Chromium answers its debugger (structured browser tools).' },
];
const components = computed(() => COMPONENTS.map(c => ({ ...c, up: !!health.value?.components?.[c.key] })));

function mem(value: number | null | undefined) { return value == null ? '—' : value >= 1024 ? `${(value / 1024).toFixed(1)} GB` : `${Math.round(value)} MB`; }
function barWidth(rss: number) {
  const max = Math.max(...(diag.value?.topMemory ?? []).map((p: any) => p.rssMB), 1);
  return `${Math.max(2, Math.round(100 * rss / max))}%`;
}

async function load() {
  if (!props.containerId) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await RequestGETFromKliveAPI(`/projects/computers/diagnostics?containerID=${encodeURIComponent(props.containerId)}`, false, false);
    const body = res.ok ? await res.json() : null;
    if (!body || body.ok === false) throw new Error(body?.error || `Diagnostics failed (HTTP ${res.status}).`);
    diag.value = body;
  } catch (e: any) {
    error.value = e?.message || 'Diagnostics failed.';
  } finally { loading.value = false; }
}

watch(() => [props.open, props.containerId], ([open]) => { if (open) { diag.value = null; load(); } }, { immediate: true });
defineExpose({ reload: load });
</script>

<style scoped>
.cd-section { margin-bottom: var(--ot-space-6); }
.cd-chips { display: flex; flex-wrap: wrap; gap: var(--ot-space-1); }
.cd-note { margin: 0; font-size: 12.5px; }
.cd-log { margin-bottom: var(--ot-space-2); border: 1px solid var(--ot-line); border-radius: var(--ot-radius-sm); }
.cd-log summary { cursor: pointer; padding: var(--ot-space-2) var(--ot-space-3); font-family: var(--ot-mono); font-size: 12px; color: var(--ot-text-2); }
.cd-log pre { margin: 0; padding: var(--ot-space-2) var(--ot-space-3); max-height: 260px; overflow: auto; font-size: 11px; line-height: 15px; background: rgba(0,0,0,0.35); white-space: pre-wrap; overflow-wrap: anywhere; }
.cd-footnote { font-size: 11.5px; color: var(--ot-muted); margin-right: auto; align-self: center; }
.bad { color: var(--ot-negative); }
</style>
