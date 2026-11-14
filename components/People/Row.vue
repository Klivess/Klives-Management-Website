<template>
  <div
    class="pfx-trow pfx-trow--body"
    role="row"
    tabindex="-1"
    :aria-selected="selected"
    :data-dim="(!row.canLogin && !row.isOwner) || undefined"
    :data-testid="`row-${row.userId}`"
    @click="emit('open')"
    @dblclick="emit('page')"
  >
    <PeopleAvatar :name="row.name" :id="row.userId" :owner="row.isOwner" :presence="row.presence.state" :size="32" />

    <div class="pfx-trow__who" role="cell">
      <div class="pfx-trow__name">
        <strong>{{ row.name }}</strong>
        <span class="pfx-rank" :data-rank="row.rankValue">{{ row.isOwner ? 'Owner' : row.rank }}</span>
        <span v-if="row.isYou" class="pfx-you">you</span>
      </div>
      <div class="pfx-trow__flags">
        <span v-if="row.suspended" class="pfx-chip" data-tone="crit" :title="row.suspensionReason ?? ''"><PeopleIcon name="pause" />Suspended{{ row.suspendedUntilUtc ? ` · ${untilTime(row.suspendedUntilUtc, now)}` : '' }}</span>
        <span v-if="!row.canLogin" class="pfx-chip" data-tone="crit"><PeopleIcon name="power" />Sign-in off</span>
        <span v-if="row.readOnly" class="pfx-chip" data-tone="info"><PeopleIcon name="eye" />Read-only</span>
        <span v-if="row.temporaryGrantCount" class="pfx-chip" data-tone="violet"><PeopleIcon name="clock" />{{ row.temporaryGrantCount }} temporary</span>
        <span v-if="dormant" class="pfx-chip" data-tone="warn" title="Can sign in, holds permissions, unseen for 30+ days"><PeopleIcon name="user-x" />Dormant</span>
        <span v-if="row.attention.includes('password')" class="pfx-chip" data-tone="warn" title="Signs requests with its password but has no password access: switching passwords-as-keys off would lock it out"><PeopleIcon name="key" />Uses its password</span>
      </div>
    </div>

    <div class="pfx-trow__where" role="cell">
      <span class="pfx-trow__where-main" :data-presence="row.presence.state">
        <span class="pfx-dot" :data-presence="row.presence.state"></span>
        <span class="pfx-truncate">{{ row.presence.state === 'offline' ? 'Offline' : presenceText(row.presence, now) }}</span>
      </span>
      <span class="pfx-trow__sub">
        <template v-if="row.presence.state !== 'offline'">{{ row.presence.connections }} tab{{ row.presence.connections === 1 ? '' : 's' }} open</template>
        <template v-else>{{ lastSeenText(row, insights, now) }}</template>
      </span>
    </div>

    <div class="pfx-trow__activity" role="cell" :title="`${row.requests24h.toLocaleString()} requests in 24 hours${row.denied24h ? `, ${row.denied24h} refused` : ''}`">
      <span class="pfx-trow__figure">
        <b>{{ fmtCount(row.requests24h) }}</b><span>24 h</span>
        <span v-if="row.denied24h" data-tone="crit">· {{ row.denied24h }} refused</span>
      </span>
      <PeopleSpark v-if="row.hourly.length" :values="row.hourly" small :tone="row.denied24h ? 'warn' : 'violet'" />
    </div>

    <div class="pfx-trow__access" role="cell">
      <template v-if="row.isOwner">
        <span class="pfx-trow__figure"><b>All</b><span>permissions</span></span>
        <span class="pfx-meter" data-tone="violet"><span style="width: 100%"></span></span>
      </template>
      <template v-else>
        <span class="pfx-trow__figure" :title="row.used != null ? `${row.used} of ${row.held} used in 30 days` : `${row.held} permissions`">
          <template v-if="row.used != null"><b>{{ row.used }}</b><span>/ {{ row.held }} used</span></template>
          <template v-else><b>{{ row.held }}</b><span>permissions</span></template>
        </span>
        <span class="pfx-meter" :data-tone="row.used != null && row.held && row.used / row.held < 0.4 ? 'warn' : 'violet'">
          <span :style="{ width: `${row.held ? Math.max(row.used != null ? (row.used / row.held) * 100 : 100, 2) : 0}%`, opacity: row.used == null ? 0.45 : 1 }"></span>
        </span>
      </template>
    </div>

    <div class="pfx-trow__devices" role="cell">
      <span class="pfx-trow__figure"><b>{{ row.sessions }}</b><span>device{{ row.sessions === 1 ? '' : 's' }}</span></span>
      <span v-if="row.idleDevices" class="pfx-trow__sub" style="color: var(--pfx-warn)">{{ row.idleDevices }} idle</span>
      <span v-else-if="row.password7d" class="pfx-trow__sub" title="Requests signed with the password (no session) in 7 days">{{ fmtCount(row.password7d) }} by password</span>
      <span v-else class="pfx-trow__sub">&nbsp;</span>
    </div>

    <div role="cell" @click.stop @dblclick.stop>
      <button class="pfx-iconbtn" :aria-label="`Actions for ${row.name}`" :data-testid="`menu-${row.userId}`" @click="emit('menu', $event)"><PeopleIcon name="more" /></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { fmtCount, presenceText, untilTime } from '~/scripts/profileFormat';
import { isDormant, lastSeenText, type InsightsPayload, type PersonRow } from '~/scripts/profilesConsole';

/** One profile in the directory: who, where, how busy, how much of their access they use, devices. */
const props = defineProps<{ row: PersonRow; insights: InsightsPayload | null; now: number; selected: boolean }>();
const emit = defineEmits<{ open: []; page: []; menu: [event: MouseEvent] }>();
const dormant = computed(() => isDormant(props.row, props.insights, props.now));
</script>
