<template>
  <div
    ref="root"
    class="hom"
    :data-size="size"
    :data-dragging="dragging || undefined"
    data-testid="home-root"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- ── bar ── -->
    <header class="hom-bar">
      <div class="hom-bar__id">
        <span class="hom-bar__mark" :data-tone="verdict.tone"><HomeIcon name="home" /></span>
        <span class="hom-bar__title">Home</span>
        <span v-if="home.server.value?.MachineName" class="hom-bar__host">{{ home.server.value.MachineName }}</span>
      </div>

      <button class="hom-search" aria-label="Go to a page or run an action" aria-keyshortcuts="Control+K" data-testid="home-search" @click="paletteOpen = true">
        <HomeIcon name="search" />
        <span class="hom-search__text">Go to a page, open a project, run an action…</span>
        <span class="hom-kbd">Ctrl</span><span class="hom-kbd">K</span>
      </button>

      <span class="hom-bar__spacer"></span>

      <button class="hom-live" :data-state="linkState" :data-tone="linkTone" :title="linkTitle" :aria-label="linkTitle" data-testid="home-live" @click="home.setLive(!prefs.live)">
        <span class="hom-live__dot"></span>
        <span class="hom-live__word">{{ linkWord }}</span>
      </button>
      <button class="hom-iconbtn hom-iconbtn--bar" title="Refresh now (R)" aria-label="Refresh now" aria-keyshortcuts="R" data-testid="home-refresh" @click="home.refreshAll()">
        <HomeIcon name="refresh" :class="{ 'hom-spin': anyBusy }" />
      </button>
    </header>

    <!-- The layout already provides the page's <main>. -->
    <div class="hom-main" :class="{ 'hom-enter': firstPaint }">
      <div class="hom-top">
        <HomeHero
          :greeting="greetingText"
          :date-label="dateLabel"
          :verdict="verdict"
          :loud="split.loud"
          :quiet="split.quiet"
          :muted="home.mutedSet.value"
          :server="home.server.value"
          :vitals="home.vitals.value"
          :now="now"
          :can-restart="caps.restart"
          :can-fleet="caps.fleet"
          :pending-restart="pending.restart"
          :pending-fleet="pending.fleet"
          :admin-link="canOpen('/admin')"
          :api-link="canOpen('/administration/api-telemetry')"
          :logs-link="canOpen('/administration/botlogs')"
          @mute="home.mute"
          @restart="askRestart"
          @resume="askControl('resume')"
        />
        <HomeActions
          ref="actions"
          :caps="caps"
          :upload="upload"
          :mail-code="home.mailCode.value"
          :mail-unread="mailUnread"
          :mail-open="canOpen('/klivemail')"
          :stopped="stoppedNames"
          :fleet="home.haltedFleet.value"
          :safe-mode-on="safeModeOn"
          :pending="pending"
          :now="now"
          @ask="ask"
          @upload="pickFiles"
          @copy-code="home.copyCode"
          @palette="paletteOpen = true"
          @control="askControl"
        />
      </div>

      <HomeJump v-if="jumpPages.length" :pages="jumpPages" :from-history="fromHistory" />

      <section class="hom-systems" aria-label="Systems" data-testid="home-systems">
        <header class="hom-section__head">
          <h2 class="hom-section__title">Systems</h2>
          <span class="hom-section__meta hom-num">{{ systemsMeta }}</span>
        </header>
        <div v-if="pulses.length" class="hom-grid">
          <HomePulse v-for="(pulse, index) in pulses" :key="pulse.id" :pulse="pulse" :index="index" :muted="home.mutedSet.value" />
        </div>
        <div v-else-if="home.loading.value" class="hom-grid" aria-hidden="true">
          <div v-for="n in 8" :key="n" class="hom-tile hom-tile--ghost"><span></span><span></span><span></span></div>
        </div>
        <p v-else class="hom-empty" data-testid="home-systems-empty">None of the systems are part of your access. Every page you can open is listed below.</p>
      </section>

      <HomePages :pages="pages" :open="prefs.pagesOpen || (!pulses.length && !home.loading.value)" @toggle="prefs.pagesOpen = !prefs.pagesOpen" />
    </div>

    <input ref="fileInput" class="hom-file" type="file" multiple tabindex="-1" aria-hidden="true" data-testid="home-file-input" @change="onFilesPicked" />

    <div v-if="dragging" class="hom-drop" aria-hidden="true">
      <div class="hom-drop__card"><HomeIcon name="upload" /><b>Drop to upload to KliveCloud</b><span>Files land in the root of the drive.</span></div>
    </div>

    <HomePalette :open="paletteOpen" :commands="commands" @close="paletteOpen = false" />

    <HomeDialog
      :open="!!confirm"
      :title="confirm?.title ?? ''"
      :sub="confirm?.sub ?? ''"
      :icon="confirm?.icon ?? 'alert'"
      :tone="confirm?.tone ?? 'warn'"
      :confirm-label="confirm?.label ?? 'Confirm'"
      testid="home-confirm"
      @close="confirm = null"
      @confirm="runConfirm"
    >
      <p>{{ confirm?.body }}</p>
    </HomeDialog>

    <Teleport to="body">
      <div v-if="toasts.length" class="hom-layer">
        <div class="hom-toasts" role="status" aria-live="polite">
          <div v-for="item in toasts" :key="item.id" class="hom-toast" :data-tone="item.tone">
            <HomeIcon :name="item.tone === 'crit' ? 'octagon-x' : item.tone === 'warn' ? 'alert' : item.tone === 'info' ? 'info' : 'check-circle'" />
            <span class="hom-toast__text">{{ item.text }}</span>
            <NuxtLink v-if="item.href" class="hom-link" :to="item.href" @click="home.dismissToast(item.id)">{{ item.hrefLabel }}</NuxtLink>
            <button class="hom-iconbtn hom-iconbtn--sm" aria-label="Dismiss" @click="home.dismissToast(item.id)"><HomeIcon name="x" /></button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useHome } from '~/composables/useHome';
import { fmtRelative } from '~/scripts/adminConsole';
import { buildVerdict, greeting, HOME_PAGES, type HomeCommand, type HomePage } from '~/scripts/home';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'KM: Home' });

const home = useHome();
const { caps, canOpen, prefs, toasts, pending, upload, now, at } = home;

const root = ref<HTMLElement | null>(null);
const actions = ref<{ focusAsk: () => void } | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const paletteOpen = ref(false);
const firstPaint = ref(true);
const size = ref<'xl' | 'lg' | 'md' | 'sm'>('lg');
const dragging = ref(false);
let dragDepth = 0;
let resizer: ResizeObserver | null = null;

// ───────────────────────────── what to say ─────────────────────────────

const pulses = computed(() => home.pulses.value);
const split = computed(() => home.split.value);
const anyBusy = computed(() => Object.values(home.busy).some(Boolean));

const verdict = computed(() => buildVerdict(split.value.loud, {
  loading: home.loading.value,
  offline: home.linkState.value === 'offline',
  starting: home.linkState.value === 'starting',
  systems: pulses.value.length,
}));

const greetingText = computed(() => greeting(home.current.username.value, new Date(now.value)));
const dateLabel = computed(() => new Date(now.value).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).replace(' at ', ' · '));

const systemsMeta = computed(() => {
  const last = Math.max(at.systems, at.core);
  if (!last) return home.restored.value ? 'from your last visit · updating…' : 'reading…';
  return `${pulses.value.length} · updated ${fmtRelative(last, now.value)}`;
});

const mailUnread = computed<number | null>(() => {
  const mail: any = home.data.mail;
  return mail && typeof mail === 'object' ? Number(mail.unread ?? mail.Unread ?? 0) : null;
});
const safeModeOn = computed<boolean | null>(() => {
  const trader: any = home.data.trader;
  return trader && typeof trader === 'object' ? !!trader.Controls?.SafeModeActive : null;
});
const stoppedNames = computed(() => home.stopped.value.map(service => service.Name));

// ───────────────────────────── the bar ─────────────────────────────

const linkState = computed(() => home.linkState.value);
const linkTone = computed(() => ({ live: 'ok', paused: 'neutral', stale: 'warn', offline: 'crit', connecting: 'neutral', starting: 'info' } as Record<string, string>)[linkState.value]);
const linkWord = computed(() => ({ live: 'Live', paused: 'Paused', stale: 'Stale', offline: 'Offline', connecting: 'Connecting', starting: 'Starting' } as Record<string, string>)[linkState.value]);
const linkTitle = computed(() => (linkState.value === 'paused'
  ? 'Paused. Click to resume live updates.'
  : linkState.value === 'offline' ? 'No answer from the server. Still trying.'
    : 'Live: the server every 15 seconds, systems every minute. Nothing is read while this tab is hidden. Click to pause.'));

// ───────────────────────────── pages ─────────────────────────────

const pages = computed<HomePage[]>(() => (home.current.profile.value ? HOME_PAGES.filter(page => canOpen(page.path)) : []));
const DEFAULT_JUMP = ['/kliveagent', '/projects', '/admin', '/omnitrader', '/schemery/omniblox', '/klivecloud', '/klivemail', '/omnidefence', '/omniscience'];
const fromHistory = computed(() => home.visits.value.length > 0);
const jumpPages = computed<HomePage[]>(() => {
  const open = new Map(pages.value.map(page => [page.path, page]));
  const ranked = [...home.frecency.value.entries()].sort((a, b) => b[1] - a[1]).map(([path]) => open.get(path)).filter((page): page is HomePage => !!page);
  const list = ranked.length ? ranked : DEFAULT_JUMP.map(path => open.get(path)).filter((page): page is HomePage => !!page);
  return list.slice(0, 8);
});

// ───────────────────────────── actions ─────────────────────────────

function ask(text: string) {
  void navigateTo(`/kliveagent?ask=${encodeURIComponent(text)}`);
}

function pickFiles() {
  if (!caps.value.upload || upload.active) return;
  fileInput.value?.click();
}
function onFilesPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (files.length) void home.uploadFiles(files);
}

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
function onDragEnter(event: DragEvent) {
  if (!caps.value.upload || !hasFiles(event)) return;
  event.preventDefault();
  dragDepth++;
  dragging.value = true;
}
function onDragOver(event: DragEvent) {
  if (!caps.value.upload || !hasFiles(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}
function onDragLeave() {
  if (!dragging.value) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dragging.value = false;
}
function onDrop(event: DragEvent) {
  if (!caps.value.upload || !hasFiles(event)) return;
  event.preventDefault();
  dragDepth = 0;
  dragging.value = false;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length) void home.uploadFiles(files);
}

interface Confirmation { title: string; sub?: string; body: string; icon: string; tone: string; label: string; run: () => unknown }
const confirm = ref<Confirmation | null>(null);

function askRestart(name: string) {
  confirm.value = {
    title: `Restart ${name}?`, sub: 'It is stopped right now.', icon: 'restart', tone: 'warn', label: 'Restart',
    body: 'The restart is queued in the background; Home checks for up to half a minute that it came back, and says so either way.',
    run: () => home.restartService(name),
  };
}

function askControl(id: string) {
  const fleet = home.haltedFleet.value;
  if (id === 'restart' && stoppedNames.value[0]) return askRestart(stoppedNames.value[0]);
  if (id === 'resume') {
    confirm.value = {
      title: `Resume ${fleet.halted} project${fleet.halted === 1 ? '' : 's'}?`, icon: 'play', tone: 'ok', label: 'Resume fleet',
      body: 'Each project goes back to the state it had before it was halted, and its agents start waking again. Model spend starts again with them.',
      run: () => home.fleet('resume'),
    };
  } else if (id === 'halt') {
    const running = fleet.live - fleet.halted;
    confirm.value = {
      title: `Halt ${running} project${running === 1 ? '' : 's'}?`, icon: 'pause', tone: 'warn', label: 'Halt fleet',
      body: 'Every running project stops after its current step and remembers where it was. Resuming is one click here or on Projects.',
      run: () => home.fleet('halt'),
    };
  } else if (id === 'safe-mode') {
    confirm.value = {
      title: 'Enter Firm safe mode?', icon: 'shield', tone: 'crit', label: 'Enter safe mode',
      body: 'New Firm orders are blocked until safe mode is cleared on the OmniTrader risk page. It does not stop legacy deployment sessions.',
      run: () => home.enterSafeMode(),
    };
  }
}

function runConfirm() {
  const action = confirm.value;
  confirm.value = null;
  if (action) void action.run();
}

// ───────────────────────────── palette ─────────────────────────────

const commands = computed<HomeCommand[]>(() => {
  const list: HomeCommand[] = [];
  for (const page of pages.value) {
    list.push({ id: `go:${page.path}`, group: 'Go to', title: page.label, icon: page.icon, keywords: `${page.about} ${page.keywords ?? ''}`, run: () => navigateTo(page.path) });
  }
  if (caps.value.ask) list.push({ id: 'ask', group: 'Actions', title: 'Ask KliveAgent…', icon: 'agent', hint: '/', keywords: 'chat question ai', run: () => nextTick(() => actions.value?.focusAsk()) });
  if (caps.value.upload) list.push({ id: 'upload', group: 'Actions', title: 'Upload files to KliveCloud…', icon: 'upload', hint: 'U', keywords: 'cloud file drive', run: pickFiles });
  if (caps.value.newProject) list.push({ id: 'new-project', group: 'Actions', title: 'New project', icon: 'plus', keywords: 'create task force', run: () => navigateTo('/projects/new') });
  if (home.mailCode.value) list.push({ id: 'copy-code', group: 'Actions', title: `Copy the code from ${home.mailCode.value.from}`, icon: 'key', keywords: 'sign in login otp verification mail', run: home.copyCode });
  list.push({ id: 'refresh', group: 'Actions', title: 'Refresh now', icon: 'refresh', hint: 'R', run: () => home.refreshAll() });
  list.push({ id: 'live', group: 'Actions', title: prefs.value.live ? 'Pause live updates' : 'Resume live updates', icon: prefs.value.live ? 'pause' : 'play', run: () => home.setLive(!prefs.value.live) });
  list.push({ id: 'pages', group: 'Actions', title: prefs.value.pagesOpen ? 'Hide every page' : 'Show every page', icon: 'schemes', run: () => { prefs.value.pagesOpen = !prefs.value.pagesOpen; } });
  const fleet = home.haltedFleet.value;
  if (caps.value.fleet && fleet.live) {
    if (fleet.halted === fleet.live) list.push({ id: 'resume', group: 'Actions', title: `Resume the fleet (${fleet.halted} projects)`, icon: 'play', danger: true, keywords: 'unhalt projects start', run: () => home.fleet('resume') });
    else list.push({ id: 'halt', group: 'Actions', title: `Halt the fleet (${fleet.live - fleet.halted} running)`, icon: 'pause', danger: true, keywords: 'stop projects pause', run: () => home.fleet('halt') });
  }
  if (caps.value.safeMode && safeModeOn.value === false) list.push({ id: 'safe-mode', group: 'Actions', title: 'Enter Firm safe mode', icon: 'shield', danger: true, keywords: 'omnitrader stop trading orders', run: () => home.enterSafeMode() });

  const projects = Array.isArray(home.data.projects) ? home.data.projects as any[] : [];
  for (const project of projects) {
    const status = String(project?.status ?? project?.Status ?? '');
    if (/^(archived|completed)$/i.test(status)) continue;
    const id = String(project?.projectID ?? project?.ProjectID ?? '');
    if (!id) continue;
    list.push({ id: `project:${id}`, group: 'Projects', title: String(project?.name ?? project?.Name ?? id), icon: 'projects', hint: project?.halted ? 'halted' : status.toLowerCase(), keywords: 'project', run: () => navigateTo(`/projects/${encodeURIComponent(id)}`) });
  }
  if (caps.value.restart) {
    for (const name of stoppedNames.value) list.push({ id: `restart:${name}`, group: 'Services', title: `Restart ${name}`, icon: 'restart', danger: true, hint: 'stopped', keywords: 'service start', run: () => home.restartService(name) });
  }
  return list;
});

// ───────────────────────────── keys ─────────────────────────────

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element?.tagName && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName));
}

function onKeydown(event: KeyboardEvent) {
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    paletteOpen.value = !paletteOpen.value;
    return;
  }
  if (mod || event.altKey || paletteOpen.value || confirm.value || isTyping(event.target)) return;
  if (event.key === '/') {
    event.preventDefault();
    if (caps.value.ask) actions.value?.focusAsk(); else paletteOpen.value = true;
  } else if (/^[1-9]$/.test(event.key)) {
    const page = jumpPages.value[Number(event.key) - 1];
    if (page) { event.preventDefault(); void navigateTo(page.path); }
  } else if (event.key.toLowerCase() === 'r') {
    void home.refreshAll();
  } else if (event.key.toLowerCase() === 'u' && caps.value.upload) {
    pickFiles();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.setTimeout(() => { firstPaint.value = false; }, 900);
  // The side nav takes 56–220 px, so the page follows its own width, not the window's.
  if (root.value && typeof ResizeObserver !== 'undefined') {
    resizer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0;
      size.value = width >= 1400 ? 'xl' : width >= 1080 ? 'lg' : width >= 720 ? 'md' : 'sm';
    });
    resizer.observe(root.value);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  resizer?.disconnect();
});
</script>

<style lang="scss" src="~/assets/scss/home.scss"></style>
