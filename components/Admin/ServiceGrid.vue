<template>
  <section id="adm-services" class="adm-panel" aria-label="Services" :data-flash="flash">
    <header class="adm-panel__head">
      <h2 class="adm-panel__title"><AdminIcon name="layers" />Services</h2>
      <span class="adm-panel__meta adm-num" data-testid="services-count">{{ activeCount }} of {{ expectedCount }} running<template v-if="finishedCount">, {{ finishedCount }} finished</template></span>
      <div class="adm-panel__tools">
        <div class="adm-seg" role="group" aria-label="Which services to show">
          <button
            v-for="option in modes"
            :key="option.value"
            class="adm-seg__opt"
            :aria-pressed="mode === option.value"
            :data-testid="`services-mode-${option.value}`"
            @click="mode = option.value"
          >{{ option.label }}<span class="adm-seg__count" :data-tone="option.tone">{{ option.count }}</span></button>
        </div>
        <div class="adm-seg" role="group" aria-label="Sort services by">
          <button v-for="option in sorts" :key="option.value" class="adm-seg__opt" :aria-pressed="sort === option.value" @click="sort = option.value">{{ option.label }}</button>
        </div>
        <label class="adm-filter">
          <AdminIcon name="search" />
          <span class="adm-sr">Filter services</span>
          <input
            ref="filterInput"
            v-model.trim="query"
            type="text"
            placeholder="Filter"
            autocomplete="off"
            spellcheck="false"
            data-testid="services-filter"
            @keydown.esc.prevent="clearFilter"
          />
          <span v-if="!query" class="adm-kbd" aria-hidden="true">/</span>
        </label>
      </div>
    </header>

    <div class="adm-panel__body adm-panel__body--flush">
      <ul v-if="visible.length" class="adm-services">
        <li
          v-for="row in visible"
          :key="row.service.Name"
          class="adm-svc"
          :data-active="row.service.IsActive"
          :data-confirm="confirming?.name === row.service.Name ? confirming.action : null"
          :data-testid="`service-${row.service.Name}`"
        >
          <span class="adm-dot" :class="{ 'adm-dot--ring': !row.service.IsActive }" :data-tone="row.service.IsActive ? 'ok' : row.finished ? 'neutral' : 'crit'" :title="row.service.IsActive ? 'Running' : row.finished ? 'Finished' : 'Not running'"></span>
          <span class="adm-svc__name" :title="row.service.Name">{{ row.service.Name }}</span>
          <span v-if="row.critical" class="adm-svc__crit" title="Critical service: it restarts itself after a crash, and other services depend on it"><AdminIcon name="shield" /></span>
          <NuxtLink
            v-if="row.errors > 0 && canLogs"
            class="adm-svc__errors"
            :data-tone="row.errors >= 50 ? 'crit' : 'warn'"
            :to="logsLink(row.service.Name) + '&type=error'"
            :title="`${row.errors} error${row.errors === 1 ? '' : 's'} in the last hour${row.lastError ? ', most recent ' + row.lastError : ''}. Open them in the logs.`"
          ><AdminIcon name="alert" />{{ row.errors }}</NuxtLink>
          <span v-else-if="row.errors > 0" class="adm-svc__errors" :data-tone="row.errors >= 50 ? 'crit' : 'warn'" :title="`${row.errors} errors in the last hour`"><AdminIcon name="alert" />{{ row.errors }}</span>

          <span v-if="pending[row.service.Name]" class="adm-svc__busy" role="status">
            <AdminIcon name="refresh" class="adm-spin" /> {{ pending[row.service.Name] === 'restart' ? 'Restarting' : 'Stopping' }}
          </span>
          <span v-else-if="confirming?.name === row.service.Name" class="adm-svc__confirm">
            <span class="adm-svc__confirm-text">{{ confirming.action === 'restart' ? 'Restart?' : 'Stop?' }}</span>
            <button
              class="adm-btn adm-btn--sm adm-btn--danger"
              :title="confirmHint(row.service.Name, confirming.action)"
              :data-testid="`service-confirm-${row.service.Name}`"
              @click="confirm"
            >Yes</button>
            <button class="adm-btn adm-btn--sm adm-btn--ghost" @click="cancel">No</button>
          </span>
          <template v-else>
            <span class="adm-svc__up" :data-tone="row.upTone" :title="row.upTitle">{{ row.upLabel }}</span>
            <span class="adm-svc__acts">
              <button
                v-if="canControl"
                class="adm-iconbtn"
                :disabled="disabled"
                :aria-label="`Restart ${row.service.Name}`"
                title="Restart"
                :data-testid="`service-restart-${row.service.Name}`"
                @click="ask(row.service.Name, 'restart')"
              ><AdminIcon name="restart" /></button>
              <button
                v-if="canControl && row.service.IsActive"
                class="adm-iconbtn adm-iconbtn--danger"
                :disabled="disabled"
                :aria-label="`Stop ${row.service.Name}`"
                title="Stop"
                @click="ask(row.service.Name, 'quit')"
              ><AdminIcon name="stop" /></button>
              <NuxtLink v-if="canLogs" class="adm-iconbtn" :to="logsLink(row.service.Name)" :aria-label="`Logs for ${row.service.Name}`" title="Logs"><AdminIcon name="logs" /></NuxtLink>
            </span>
          </template>
        </li>
      </ul>
      <div v-else-if="!services.length" class="adm-empty">{{ loading ? 'Reading services…' : 'No services reported.' }}</div>
      <div v-else class="adm-empty">
        <span v-if="query">Nothing matches “{{ query }}”. <button class="adm-panel__link" @click="clearFilter">Clear</button></span>
        <span v-else-if="mode === 'issues'">Every service is running without errors.</span>
        <span v-else>No services in this view.</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { fmtDuration, fmtRelative, isFinishedService, logsLink, serviceUptimeSeconds, type AdminService } from '~/scripts/adminConsole';

/*
 * Every service on one screen, in name order so each stays where the eye expects it. Restart and stop
 * confirm in the row itself: one click to ask, one to confirm, no dialog in between.
 */
const props = withDefaults(defineProps<{
  services: AdminService[];
  pending: Record<string, 'restart' | 'quit'>;
  canControl: boolean;
  canLogs: boolean;
  /** Seconds the whole process has been up: a service up for much less was restarted on its own. */
  processUptime: number | null;
  now: number;
  disabled?: boolean;
  loading?: boolean;
  flash?: boolean;
}>(), { disabled: false, loading: false, flash: false });

const emit = defineEmits<{ control: [name: string, action: 'restart' | 'quit'] }>();

type Mode = 'all' | 'issues' | 'critical';
type Sort = 'name' | 'uptime' | 'errors';

const query = ref('');
const mode = ref<Mode>('all');
const sort = ref<Sort>('name');
const filterInput = ref<HTMLInputElement | null>(null);
const confirming = ref<{ name: string; action: 'restart' | 'quit' } | null>(null);
let confirmTimer: number | undefined;

interface Row {
  service: AdminService;
  /** Stopped because its work is done, by design: not a fault. */
  finished: boolean;
  critical: boolean;
  errors: number;
  lastError: string;
  uptime: number | null;
  restartedAlone: boolean;
  upLabel: string;
  upTone: string | undefined;
  upTitle: string;
  troubled: boolean;
}

const rows = computed<Row[]>(() => props.services.map(service => {
  const uptime = serviceUptimeSeconds(service);
  const errors = service.ErrorsLastHour ?? 0;
  // Started well after the process did, and recently: it was restarted (or crashed and came back).
  const restartedAlone = service.IsActive && uptime != null && props.processUptime != null
    && uptime < 15 * 60 && props.processUptime - uptime > 120;
  const finished = isFinishedService(service);
  return {
    service,
    finished,
    critical: service.Anteriority === 'Critical',
    errors,
    lastError: service.LastErrorAt ? fmtRelative(service.LastErrorAt, props.now) : '',
    uptime,
    restartedAlone,
    upLabel: finished ? 'finished' : !service.IsActive ? 'stopped' : uptime != null ? fmtDuration(uptime) : (service.UptimeHumanized ?? ''),
    upTone: finished ? undefined : !service.IsActive ? 'crit' : restartedAlone ? 'warn' : undefined,
    upTitle: finished
      ? 'Did its start-up work and stopped, as designed'
      : !service.IsActive
      ? 'Not running'
      : restartedAlone ? `Restarted ${fmtDuration(uptime ?? 0)} ago, on its own: the rest of the process has been up longer` : `Up ${fmtDuration(uptime ?? 0)}`,
    troubled: (!service.IsActive && !finished) || errors > 0 || restartedAlone,
  };
}));

const activeCount = computed(() => props.services.filter(service => service.IsActive).length);
const finishedCount = computed(() => rows.value.filter(row => row.finished).length);
/** Services that are meant to be running: one that finished by design is not short of anything. */
const expectedCount = computed(() => props.services.length - finishedCount.value);
const troubledCount = computed(() => rows.value.filter(row => row.troubled).length);

const modes = computed(() => [
  { value: 'all' as Mode, label: 'All', count: rows.value.length, tone: undefined },
  { value: 'issues' as Mode, label: 'Issues', count: troubledCount.value, tone: troubledCount.value ? (rows.value.some(row => !row.service.IsActive && !row.finished) ? 'crit' : 'warn') : undefined },
  { value: 'critical' as Mode, label: 'Critical', count: rows.value.filter(row => row.critical).length, tone: undefined },
]);
const sorts: { value: Sort; label: string }[] = [
  { value: 'name', label: 'A–Z' },
  { value: 'uptime', label: 'Newest' },
  { value: 'errors', label: 'Errors' },
];

const visible = computed(() => {
  let list = rows.value;
  if (mode.value === 'issues') list = list.filter(row => row.troubled);
  else if (mode.value === 'critical') list = list.filter(row => row.critical);
  if (query.value) {
    // Plain containment, every word: a filter should never surprise with a loose match.
    const words = query.value.toLowerCase().split(/\s+/).filter(Boolean);
    list = list.filter(row => words.every(word => row.service.Name.toLowerCase().includes(word)));
  }

  const byName = (a: Row, b: Row) => a.service.Name.localeCompare(b.service.Name, undefined, { sensitivity: 'base' });
  const sorted = [...list];
  if (sort.value === 'uptime') {
    // Stopped first, then the most recently started.
    sorted.sort((a, b) => (a.uptime ?? -1) - (b.uptime ?? -1) || byName(a, b));
  } else if (sort.value === 'errors') {
    const down = (row: Row) => (row.service.IsActive ? 0 : 1);
    sorted.sort((a, b) => down(b) - down(a) || b.errors - a.errors || byName(a, b));
  } else {
    sorted.sort(byName);
  }
  return sorted;
});

function ask(name: string, action: 'restart' | 'quit') {
  confirming.value = { name, action };
  window.clearTimeout(confirmTimer);
  // An unanswered question goes away on its own: a stale "Yes" must not be waiting under the pointer.
  confirmTimer = window.setTimeout(cancel, 6_000);
}
function cancel() {
  window.clearTimeout(confirmTimer);
  confirming.value = null;
}
function confirm() {
  const pendingAction = confirming.value;
  cancel();
  if (pendingAction) emit('control', pendingAction.name, pendingAction.action);
}
function confirmHint(name: string, action: 'restart' | 'quit') {
  if (name.toLowerCase() === 'kliveapi') return 'This is the API this page talks to: it will drop out for a few seconds.';
  return action === 'restart' ? `Restart ${name} now` : `Stop ${name} until it is started again`;
}

function clearFilter() {
  query.value = '';
  filterInput.value?.blur();
}

defineExpose({
  focusFilter: () => { filterInput.value?.focus(); filterInput.value?.select(); },
  showIssues: () => { mode.value = 'issues'; },
});

onBeforeUnmount(() => window.clearTimeout(confirmTimer));
</script>
