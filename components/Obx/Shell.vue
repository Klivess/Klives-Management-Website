<template>
  <div ref="root" class="obx" :data-size="size" data-testid="obx-root">
    <!-- ── bar ── -->
    <header class="obx-bar">
      <NuxtLink class="obx-bar__id" to="/schemery/omniblox" aria-label="OmniBlox studio">
        <svg class="obx-mark" viewBox="0 0 32 32" aria-hidden="true">
          <defs>
            <linearGradient id="obx-mark-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd166" /><stop offset="1" stop-color="#ff9a3f" /></linearGradient>
            <linearGradient id="obx-mark-left" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a4c" /><stop offset="1" stop-color="#e2502f" /></linearGradient>
            <linearGradient id="obx-mark-right" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8432a" /><stop offset="1" stop-color="#8f2a1c" /></linearGradient>
          </defs>
          <path d="M16 3l11 6-11 6L5 9z" fill="url(#obx-mark-top)" />
          <path d="M5 9l11 6v14L5 23z" fill="url(#obx-mark-left)" />
          <path d="M27 9l-11 6v14l11-6z" fill="url(#obx-mark-right)" />
          <ellipse cx="16" cy="8.6" rx="3.1" ry="1.6" fill="#fff3d6" opacity="0.75" />
        </svg>
        <span class="obx-bar__title">OmniBlox</span>
      </NuxtLink>
      <span v-if="crumb" class="obx-bar__crumb"><ObxIcon name="chevron-right" /><b :data-stage="crumbStage">{{ crumb }}</b></span>

      <button class="obx-search" aria-label="Go to a game, a page or an action" aria-keyshortcuts="Control+K" data-testid="obx-search" @click="paletteOpen = true">
        <ObxIcon name="search" />
        <span class="obx-search__text">Go to a game, a page or an action…</span>
        <span class="obx-kbd">Ctrl</span><span class="obx-kbd">K</span>
      </button>

      <span class="obx-bar__spacer"></span>

      <div class="obx-bar__actions">
        <template v-if="overview && canManage && size !== 'sm'">
          <button class="obx-power" role="switch" :aria-checked="overview.Enabled" :disabled="switching" data-testid="obx-power-studio"
                  :title="overview.Enabled ? 'The studio researches, builds and maintains games. Click to switch it off.' : 'Nothing is being worked on. Click to switch the studio on.'"
                  @click="toggle('enabled', !overview.Enabled)">
            <span class="obx-power__track"></span><span>Studio <b>{{ overview.Enabled ? 'on' : 'off' }}</b></span>
          </button>
          <button v-if="size !== 'md'" class="obx-power" role="switch" :aria-checked="overview.HarvesterEnabled" :disabled="switching" data-testid="obx-power-harvester"
                  title="The asset harvester finds, measures and labels free models for the builders"
                  @click="toggle('harvester', !overview.HarvesterEnabled)">
            <span class="obx-power__track"></span><span>Harvester <b>{{ overview.HarvesterEnabled ? 'on' : 'off' }}</b></span>
          </button>
        </template>
        <button class="obx-live" :data-state="linkState" :data-tone="linkTone" :title="linkTitle" :aria-label="linkTitle" data-testid="obx-live" @click="refreshAll">
          <span class="obx-live__dot"></span>
          <span v-if="size !== 'sm'">{{ linkWord }}</span>
          <span v-if="linkState === 'live'" :key="sweepKey" class="obx-live__sweep" style="--sweep: 20s"></span>
        </button>
      </div>
    </header>

    <!-- narrow widths: the rail becomes a strip of chips -->
    <nav class="obx-strip" aria-label="OmniBlox">
      <NuxtLink v-for="link in pages" :key="link.to" class="obx-strip__link" :to="link.to" :aria-current="isPage(link.to) ? 'page' : undefined">
        <ObxIcon :name="link.icon" />{{ link.label }}<span v-if="link.count" class="obx-chip" :data-tone="link.tone">{{ link.count }}</span>
      </NuxtLink>
      <NuxtLink v-for="g in railGames" :key="g.GameId" class="obx-strip__link" :to="gamePath(g.GameId)" :aria-current="route.params.gameId === g.GameId ? 'page' : undefined" :data-stage="g.Stage">
        <span class="obx-dot" :data-tone="obxGameTone(g)"></span>{{ g.Title }}
      </NuxtLink>
    </nav>

    <div class="obx-body">
      <!-- ── rail ── -->
      <aside class="obx-rail" aria-label="OmniBlox sections">
        <nav class="obx-rail__group">
          <NuxtLink v-for="link in pages" :key="link.to" class="obx-rail__link" :to="link.to" :aria-current="isPage(link.to) ? 'page' : undefined" :data-testid="`rail-${link.id}`">
            <ObxIcon :name="link.icon" />{{ link.label }}
            <span v-if="link.count" class="obx-rail__count" :data-tone="link.tone">{{ link.count }}</span>
          </NuxtLink>
        </nav>

        <div v-for="group in railGroups" :key="group.label" class="obx-rail__group">
          <div class="obx-rail__label">{{ group.label }}<span>{{ group.games.length }}</span></div>
          <NuxtLink v-for="g in group.games" :key="g.GameId" class="obx-rail__link obx-rail__game" :to="gamePath(g.GameId)" :data-stage="g.Stage"
                    :aria-current="route.params.gameId === g.GameId ? 'page' : undefined" :title="obxGameLine(g).text" :data-testid="`rail-game-${g.GameId}`">
            <span class="obx-rail__thumb">
              <ObxImg v-if="g.HasIcon" :path="bloxMediaPath(g.GameId, 'icon.png', g.UpdatedUtc)" :alt="''" fallback="" eager />
              <template v-else>{{ obxInitials(g.Title) }}</template>
            </span>
            <span class="obx-rail__text">
              <b>{{ g.Title }}</b>
              <small>{{ railLine(g) }}</small>
            </span>
            <span class="obx-dot" :data-tone="obxGameTone(g)" :data-pulse="g.Live?.Running || undefined" style="margin-left: auto"></span>
          </NuxtLink>
        </div>

        <div v-if="retired.length" class="obx-rail__group">
          <button class="obx-rail__label" style="cursor: pointer" :aria-expanded="showRetired" @click="showRetired = !showRetired">
            Retired<span>{{ retired.length }} <ObxIcon :name="showRetired ? 'chevron-up' : 'chevron-down'" /></span>
          </button>
          <template v-if="showRetired">
            <NuxtLink v-for="g in retired" :key="g.GameId" class="obx-rail__link" :to="gamePath(g.GameId)" :data-stage="g.Stage" :aria-current="route.params.gameId === g.GameId ? 'page' : undefined">
              <span class="obx-dot" :data-tone="'neutral'"></span><span class="obx-truncate">{{ g.Title }}</span>
            </NuxtLink>
          </template>
        </div>
      </aside>

      <!-- The layout already provides the page's <main>. -->
      <div class="obx-main">
        <div v-if="error && !overview" class="obx-banner" data-tone="crit" role="alert">
          <ObxIcon class="obx-banner__glyph" name="octagon" />
          <div class="obx-banner__text"><strong>OmniBlox is not answering</strong><span>{{ error }}</span></div>
          <div class="obx-banner__actions"><button class="obx-btn obx-btn--sm" @click="refreshAll">Try again</button></div>
        </div>
        <slot :size="size" />
      </div>
    </div>

    <ObxPalette :open="paletteOpen" :commands="allCommands" @close="paletteOpen = false" />

    <ObxDialog :open="!!confirmation" :title="confirmation?.title ?? ''" :icon="confirmation?.danger ? 'alert' : 'info'" :tone="confirmation?.danger ? 'crit' : 'info'" testid="obx-confirm" @close="confirmation?.resolve(false)">
      <p class="obx-prose">{{ confirmation?.text }}</p>
      <template #actions>
        <button class="obx-btn obx-btn--ghost" @click="confirmation?.resolve(false)">Cancel</button>
        <button class="obx-btn" :class="confirmation?.danger ? 'obx-btn--danger' : 'obx-btn--primary'" data-autofocus data-testid="obx-confirm-yes" @click="confirmation?.resolve(true)">{{ confirmation?.confirm }}</button>
      </template>
    </ObxDialog>

    <Teleport to="body">
      <div class="obx-layer">
        <div class="obx-toasts" aria-live="polite">
          <div v-for="t in toasts" :key="t.id" class="obx-toast" :data-tone="t.tone" role="status" data-testid="obx-toast">
            <ObxIcon class="obx-toast__glyph" :name="t.tone === 'crit' ? 'octagon' : t.tone === 'warn' ? 'alert' : t.tone === 'info' ? 'info' : 'check-circle'" />
            <div class="obx-toast__text"><strong>{{ t.title }}</strong><span v-if="t.text">{{ t.text }}</span></div>
            <button class="obx-iconbtn obx-iconbtn--sm" aria-label="Dismiss" @click="obxDismissToast(t.id)"><ObxIcon name="x" /></button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAccess } from '~/composables/useAccess';
import { usePoll } from '~/composables/useOmniTumblr';
import { bloxMediaPath, bloxPlayPath, bloxPost, useBloxOverview, type BloxGameSummary, type BloxStage } from '~/composables/useOmniBlox';
import { obxConfirm, obxDismissToast, obxToast, useObxUi } from '~/composables/useObxConsole';
import { obxActive, obxAgo, obxGameLine, obxGameTone, obxInitials, obxLanes, obxProduction, type ObxCommand } from '~/scripts/omniblox/console';

/**
 * Every OmniBlox page sits in this: the bar (studio switches, the palette, the live link), the rail of games,
 * and the layer for confirmations and toasts. It reads the studio overview every 20 s while the tab is
 * visible; pages read their own data and are told to refresh with it.
 */
const props = withDefaults(defineProps<{ crumb?: string; crumbStage?: BloxStage; commands?: ObxCommand[] }>(), { crumb: '', crumbStage: undefined, commands: () => [] });
const emit = defineEmits<{ refresh: [] }>();

const route = useRoute();
const router = useRouter();
const { can } = useAccess();
const canManage = computed(() => can('omniblox.studio.manage'));
const { overview, error, loading, loadedAt, refresh } = useBloxOverview();
const { toasts, confirmation } = useObxUi();

const POLL_MS = 20_000;
usePoll(refresh, POLL_MS);

const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;

// ── size: the page follows its own width (the site nav takes 220–250 px), never the viewport ──
const root = ref<HTMLElement | null>(null);
const size = ref<'xl' | 'lg' | 'md' | 'sm'>('lg');
let resize: ResizeObserver | null = null;
function measure(width: number) {
  size.value = width >= 1380 ? 'xl' : width >= 1080 ? 'lg' : width >= 720 ? 'md' : 'sm';
}

// ── live link ──
const sweepKey = ref(0);
watch(loadedAt, () => { sweepKey.value++; });
const linkState = computed(() => (error.value ? 'error' : loading.value && !overview.value ? 'loading' : overview.value ? 'live' : 'loading'));
const linkTone = computed(() => (linkState.value === 'error' ? 'crit' : linkState.value === 'live' ? 'ok' : 'neutral'));
const linkWord = computed(() => (linkState.value === 'error' ? 'Reconnecting' : linkState.value === 'live' ? 'Live' : 'Loading'));
const linkTitle = computed(() => (error.value ? `Last read failed: ${error.value}. Click to retry.`
  : loadedAt.value ? `Read ${obxAgo(new Date(loadedAt.value).toISOString(), now.value)}; every 20 s while this tab is open. Click (or R) to read now.` : 'Loading the studio…'));

function refreshAll() {
  void refresh();
  emit('refresh');
}

// ── rail ──
const games = computed(() => overview.value?.Games ?? []);
const lanes = computed(() => obxLanes(games.value));
const retired = computed(() => lanes.value.retired);
const showRetired = ref(false);
const railGroups = computed(() => {
  const production = games.value.filter(obxActive).sort((a, b) => a.CreatedUtc.localeCompare(b.CreatedUtc));
  const live = games.value.filter(g => g.Stage === 'Live');
  return [
    { label: 'In production', games: production },
    { label: 'Live', games: live },
  ].filter(g => g.games.length);
});
const railGames = computed(() => railGroups.value.flatMap(g => g.games));
const gamePath = (id: string) => `/schemery/omniblox/game/${id}`;

function railLine(g: BloxGameSummary): string {
  if (g.Live?.Running) return `${g.Live.Role} at work`;
  if ((g.Watchdog?.Level ?? 0) >= 3) return `${g.Stage} · paused`;
  if (g.WaitingReason) return `${g.Stage} · waiting`;
  if (g.Paused) return `${g.Stage} · paused`;
  if (g.Stage === 'Live') return `${Math.round(g.Dau7d)} players a day`;
  return `${g.Stage} · ${g.ChecklistMet}/${g.ChecklistTotal}`;
}

const openTasks = computed(() => (overview.value?.OwnerTasks ?? []).filter(t => t.Status === 'Open').length);
const pages = computed(() => [
  { id: 'studio', to: '/schemery/omniblox', label: 'Studio', icon: 'blocks', count: openTasks.value || null, tone: openTasks.value ? 'brick' : undefined },
  { id: 'assets', to: '/schemery/omniblox/assets', label: 'Asset library', icon: 'cube', count: overview.value ? compact(overview.value.Library?.ByStatus?.labeled ?? 0) : null, tone: undefined },
  { id: 'playbook', to: '/schemery/omniblox/playbook', label: 'Playbook', icon: 'book', count: overview.value?.PlaybookLessons || null, tone: undefined },
]);
function compact(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n); }
function isPage(to: string) { return to === '/schemery/omniblox' ? route.path === to || route.path === `${to}/` : route.path.startsWith(to); }

// ── switches ──
const switching = ref(false);
async function toggle(which: 'enabled' | 'harvester', on: boolean) {
  if (which === 'enabled' && on && !await obxConfirm('Switch the studio on?', 'It starts working through its games again: research, building, tests and maintenance, with AIRouter as its model. Nothing is published to Roblox without your approval.', 'Switch it on')) return;
  switching.value = true;
  try {
    const result = await bloxPost('/omniblox/studio/toggle', { [which]: on });
    if (!result.ok) obxToast('Could not switch', result.error ?? '', 'crit');
    else obxToast(`${which === 'enabled' ? 'Studio' : 'Harvester'} ${on ? 'on' : 'off'}`);
    await refresh();
  } finally {
    switching.value = false;
  }
}

// ── palette ──
const paletteOpen = ref(false);
const allCommands = computed<ObxCommand[]>(() => {
  const list: ObxCommand[] = [...props.commands];
  const go = (path: string) => () => router.push(path);
  list.push(
    { id: 'go-studio', group: 'Go to', title: 'Studio', icon: 'blocks', keywords: 'home overview needs', run: go('/schemery/omniblox') },
    { id: 'go-assets', group: 'Go to', title: 'Asset library', icon: 'cube', keywords: 'models library harvester', run: go('/schemery/omniblox/assets') },
    { id: 'go-playbook', group: 'Go to', title: 'Playbook', icon: 'book', keywords: 'lessons learned', run: go('/schemery/omniblox/playbook') },
  );
  const production = obxProduction(games.value);
  if (production?.Playable) list.push({ id: 'play-production', group: 'Actions', title: `Play ${production.Title}`, icon: 'play', hint: production.Stage, run: go(bloxPlayPath(production.GameId)) });
  if (overview.value && canManage.value) {
    list.push(
      { id: 'toggle-studio', group: 'Actions', title: overview.value.Enabled ? 'Switch the studio off' : 'Switch the studio on', icon: 'power', keywords: 'enable disable', danger: true, run: () => toggle('enabled', !overview.value!.Enabled) },
      { id: 'toggle-harvester', group: 'Actions', title: overview.value.HarvesterEnabled ? 'Switch the harvester off' : 'Switch the harvester on', icon: 'harvest', keywords: 'assets models', run: () => toggle('harvester', !overview.value!.HarvesterEnabled) },
    );
  }
  list.push({ id: 'refresh', group: 'Actions', title: 'Read everything again', icon: 'refresh', hint: 'R', keywords: 'refresh reload', run: refreshAll });
  for (const g of [...railGames.value, ...retired.value]) {
    list.push({ id: `game-${g.GameId}`, group: 'Games', title: g.Title, icon: 'cube', hint: g.Stage, keywords: `${g.Genre ?? ''} ${g.GameId}`, run: go(gamePath(g.GameId)) });
  }
  return list;
});

function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}
function onKey(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); paletteOpen.value = !paletteOpen.value; return; }
  if (paletteOpen.value || confirmation.value || typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === '/') { event.preventDefault(); paletteOpen.value = true; }
  else if (event.key === 'r' || event.key === 'R') { event.preventDefault(); refreshAll(); }
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  clock = setInterval(() => { now.value = Date.now(); }, 15_000);
  if (root.value) {
    measure(root.value.clientWidth);
    resize = new ResizeObserver(entries => { const w = entries[0]?.contentRect.width; if (w) measure(w); });
    resize.observe(root.value);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  if (clock) clearInterval(clock);
  resize?.disconnect();
  confirmation.value?.resolve(false);
});
</script>

<style lang="scss" src="~/assets/scss/omniblox.scss"></style>
