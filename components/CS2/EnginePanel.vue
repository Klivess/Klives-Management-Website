<template>
  <section id="cs2x-engine" class="cs2x-card" aria-label="Engine" :data-flash="flash || undefined" data-testid="cs2x-engine">
    <header class="cs2x-card__head">
      <h2 class="cs2x-card__title"><CS2Icon name="gauge" />Engine</h2>
      <span class="cs2x-card__meta">{{ status?.engine?.State ? `engine ${status.engine.State}` : status?.startupState ?? '' }}</span>
    </header>
    <div class="cs2x-card__body">
      <div class="cs2x-loops">
        <div v-for="loop in loops" :key="loop.id" class="cs2x-loop" :data-tone="loop.tone" :data-testid="`loop-${loop.id}`">
          <span class="cs2x-loop__dot"></span>
          <span style="min-width: 0">
            <span class="cs2x-loop__name">{{ loop.label }}</span>
            <span class="cs2x-loop__detail" :title="loop.detail">{{ loop.detail ?? loop.every }}</span>
          </span>
          <span class="cs2x-loop__age">{{ fmtAgo(loop.at, now) }}<small>{{ loop.every }}</small></span>
        </div>
      </div>

      <h3 class="cs2x-sub" style="margin-top: 14px">CSFloat request budgets</h3>
      <div v-for="b in budgets" :key="b.name" class="cs2x-meter" :data-tone="b.tone" :title="`${b.remaining} of ${b.limit} left; resets ${b.resets}${b.throttled ? ` · ${b.throttled} × 429` : ''}`">
        <span class="cs2x-meter__name">{{ b.label }}</span>
        <span class="cs2x-meter__bar"><span :style="{ width: `${Math.max(2, b.pct * 100)}%` }"></span></span>
        <span class="cs2x-meter__value">{{ b.remaining }}/{{ b.limit }}</span>
      </div>
      <p v-if="!budgets.length" class="cs2x-note">No CSFloat budgets reported yet.</p>

      <h3 class="cs2x-sub" style="margin-top: 14px">Steam</h3>
      <div class="cs2x-kv">
        <span>Order books</span>
        <strong :class="steamRate != null && steamRate < 0.85 ? 'cs2x-down' : ''">{{ steamRate == null ? '—' : `${Math.round(steamRate * 100)}% ok` }}</strong>
        <em>{{ fmtCount(status?.steam?.Successes) }} fetched · {{ fmtCount(status?.steam?.cachedBooks) }} cached</em>
      </div>
      <div v-if="status?.steam?.knownMisses != null" class="cs2x-kv" data-testid="steam-misses">
        <span>Items with no Steam book</span>
        <strong>{{ status.steam.knownMisses }}</strong>
        <em>{{ fmtCount(status.steam.missSkips) }} lookups saved</em>
      </div>
      <p v-for="m in backedOff" :key="m.name" class="cs2x-note cs2x-truncate" :title="m.name">· {{ m.name }} — asked again {{ fmtAgo(m.untilUtc, now) }}</p>
      <div class="cs2x-kv" data-testid="steam-session">
        <span>Login</span>
        <strong :class="session?.problem ? 'cs2x-down' : session?.lastWorkedUtc ? 'cs2x-up' : ''">{{ sessionWord }}</strong>
        <em>{{ sessionDetail }}</em>
      </div>
      <div v-if="session?.problem && canManage" style="margin-top: 8px">
        <button class="cs2x-btn cs2x-btn--sm" :disabled="session.loginPromptOpen || loginPending" data-testid="engine-steam-login" @click="emit('steam-login')">
          <CS2Icon :name="loginPending ? 'refresh' : 'key'" :class="{ 'cs2x-spin': loginPending }" />{{ session.loginPromptOpen ? 'Waiting for your approval' : 'Ask me to approve a Steam login' }}
        </button>
      </div>
      <div class="cs2x-kv"><span>Bulk Steam prices</span><strong>{{ fmtCompactCount(status?.bulkSteamPrices?.Count) }}</strong><em>{{ status?.bulkSteamPrices?.LoadedAtUtc ? `loaded ${fmtAgo(status.bulkSteamPrices.LoadedAtUtc, now)}` : '' }}</em></div>

      <template v-if="alerts">
        <h3 class="cs2x-sub" style="margin-top: 14px">Discord alerts sent</h3>
        <div v-for="a in alerts" :key="a.key" class="cs2x-kv" data-testid="engine-alert">
          <span class="cs2x-truncate" :title="a.key">{{ (a.title ?? a.key).replace(/^CS2 Arbitrage — /, '') }}</span>
          <em>{{ fmtAgo(a.atUtc, now) }}</em>
        </div>
        <p v-if="!alerts.length" class="cs2x-note">None in the last month.</p>
      </template>

      <template v-if="steps.length">
        <h3 class="cs2x-sub" style="margin-top: 14px">Last start-up</h3>
        <div v-for="s in steps" :key="s.step" class="cs2x-meter" :data-tone="s.ms > 60_000 ? 'warn' : 'info'">
          <span class="cs2x-meter__name" :title="s.step">{{ s.step }}</span>
          <span class="cs2x-meter__bar"><span :style="{ width: `${Math.max(2, (s.ms / maxStep) * 100)}%` }"></span></span>
          <span class="cs2x-meter__value">{{ (s.ms / 1000).toFixed(1) }} s</span>
        </div>
      </template>
    </div>
    <footer v-if="issues.length" class="cs2x-card__foot">
      <div v-for="(issue, i) in issues" :key="i" class="cs2x-truncate" :title="issue">· {{ issue }}</div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CS2Icon from '~/components/CS2/Icon.vue';
import { budgetRows, engineLoops, fmtAgo, fmtCompactCount, fmtCount, fmtDateTime, isRealDate, type Cs2Status } from '~/scripts/cs2Arbitrage';

const props = defineProps<{ status: Cs2Status | null; now: number; canManage: boolean; loginPending: boolean; flash?: boolean }>();
const emit = defineEmits<{ 'steam-login': [] }>();

const loops = computed(() => engineLoops(props.status, props.now));
const budgets = computed(() => budgetRows(props.status, props.now));
const session = computed(() => props.status?.steamSession ?? null);
const steamRate = computed(() => {
  const s = props.status?.steam;
  if (!s) return null;
  const total = (s.Successes ?? 0) + (s.Failures ?? 0);
  return total ? (s.Successes ?? 0) / total : null;
});
const backedOff = computed(() => (props.status?.steam?.backedOff ?? []) as { name: string; untilUtc: string; misses: number }[]);
const sessionWord = computed(() => {
  const s = session.value;
  if (!props.status?.automationEnabled) return 'not used here';
  if (!s) return '—';
  if (s.loginPromptOpen) return 'waiting for you';
  if (s.problem) return 'needs approving';
  return s.lastWorkedUtc ? 'working' : 'unchecked';
});
const sessionDetail = computed(() => {
  const s = session.value;
  if (!s) return '';
  if (s.problem) return `down since ${isRealDate(s.problemSinceUtc) ? fmtDateTime(s.problemSinceUtc) : '—'}${isRealDate(s.lastWorkedUtc) ? ` · last worked ${fmtAgo(s.lastWorkedUtc, props.now)}` : ''}`;
  return isRealDate(s.lastWorkedUtc) ? `proved ${fmtAgo(s.lastWorkedUtc, props.now)}` : '';
});
const steps = computed(() => (props.status?.startupSteps ?? []).filter((s) => s.ms > 0));
/** Null on a bot build that doesn't report them (the section is then hidden, not shown as "none"). */
const alerts = computed(() => (Array.isArray(props.status?.alerts) ? props.status!.alerts!.slice(0, 6) : null));
const maxStep = computed(() => Math.max(1, ...steps.value.map((s) => s.ms)));
const issues = computed(() => {
  const list: string[] = [...((props.status?.engine?.RecentErrors as string[] | undefined) ?? [])];
  if (props.status?.steam?.LastError) list.push(`Steam: ${props.status.steam.LastError}`);
  if (props.status?.trades?.lastError) list.push(`CSFloat trades: ${props.status.trades.lastError}`);
  if (props.status?.trades?.sellerSideError) list.push(`CSFloat sales: ${props.status.trades.sellerSideError}`);
  if (props.status?.bulkSteamPrices?.LastError) list.push(`Bulk Steam prices: ${props.status.bulkSteamPrices.LastError}`);
  return list.slice(0, 6);
});
</script>
