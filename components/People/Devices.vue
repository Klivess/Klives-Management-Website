<template>
  <div class="pfx-devices" :data-testid="testid">
    <div v-for="s in sorted" :key="s.sessionId" class="pfx-device" :data-ended="!s.active || undefined" :data-testid="`device-${s.sessionId}`">
      <span class="pfx-device__icon" :data-online="s.online || undefined" :data-idle="isIdle(s) || undefined">
        <PeopleIcon :name="deviceIcon(s)" />
      </span>
      <div class="pfx-device__main">
        <div class="pfx-device__title">
          <span class="pfx-truncate">{{ s.kind === 'Internal' ? 'Internal service' : (s.label || 'Unknown device') }}</span>
          <span v-if="s.current" class="pfx-chip" data-tone="violet">This device</span>
          <span v-if="s.online" class="pfx-chip" data-tone="ok"><span class="pfx-dot" data-presence="online"></span>Online</span>
          <span v-else-if="isIdle(s)" class="pfx-chip" data-tone="warn" :title="`Not used for ${idleText(s, now).replace('unused ', '')}; still signed in`"><PeopleIcon name="clock" />Idle · {{ idleText(s, now).replace('unused ', '') }}</span>
          <span v-if="!s.active" class="pfx-chip">{{ s.revokedUtc ? 'Signed out' : 'Expired' }}</span>
        </div>
        <div class="pfx-device__meta">
          <span v-if="s.ip" class="pfx-mono">{{ s.ip }}</span>
          <span>Signed in {{ relTime(s.createdUtc, now) }}</span>
          <span v-if="s.active">Last used {{ relTime(s.lastSeenUtc, now) }}</span>
          <span v-if="s.active && !compact">Ends {{ untilTime(s.expiresUtc, now) }} unless used</span>
          <span v-if="s.revokedUtc">Ended {{ relTime(s.revokedUtc, now) }}{{ s.revokeReason ? ` · ${s.revokeReason}` : '' }}</span>
        </div>
        <ul v-if="s.tabs.length && !compact" class="pfx-device__tabs">
          <li v-for="(tab, i) in s.tabs" :key="i"><span class="pfx-dot" :data-presence="tab.visible ? 'online' : 'idle'"></span><span class="pfx-truncate">{{ tab.title || tab.path }}</span></li>
        </ul>
        <p v-if="showAgent && s.userAgent && !compact" class="pfx-device__agent" :title="s.userAgent">{{ s.userAgent }}</p>
      </div>
      <button
        v-if="canRevoke && s.active && !s.current && s.kind !== 'Internal'"
        type="button"
        class="pfx-btn pfx-btn--xs pfx-btn--ghost"
        :disabled="busy"
        :aria-label="`Sign out ${s.label || 'this device'}`"
        @click="emit('revoke', s.sessionId)"
      >Sign out</button>
    </div>
    <div v-if="!sessions.length" class="pfx-empty"><PeopleIcon name="device" />No signed-in devices.</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SessionRow } from '~/scripts/profilesApi';
import { relTime, untilTime } from '~/scripts/profileFormat';
import { idleText, isIdleSession } from '~/scripts/profilesConsole';

/** Signed-in devices, the busiest first; one unused for a week is marked idle (it stays valid for 30 days). */
const props = withDefaults(defineProps<{ sessions: SessionRow[]; canRevoke?: boolean; busy?: boolean; showAgent?: boolean; compact?: boolean; now?: number; limit?: number; testid?: string }>(), {
  canRevoke: false, busy: false, showAgent: false, compact: false, now: () => Date.now(), limit: 0, testid: undefined,
});
const emit = defineEmits<{ revoke: [sessionId: string] }>();

const sorted = computed(() => {
  const list = [...props.sessions].sort((a, b) => Number(b.active) - Number(a.active) || Number(b.online) - Number(a.online)
    || Date.parse(b.lastSeenUtc) - Date.parse(a.lastSeenUtc));
  return props.limit ? list.slice(0, props.limit) : list;
});

const isIdle = (s: SessionRow) => isIdleSession(s, props.now);

function deviceIcon(s: SessionRow) {
  if (s.kind === 'Internal') return 'bolt';
  const label = (s.label ?? '').toLowerCase();
  if (label.includes('iphone') || label.includes('android') || label.includes('ipad')) return 'phone';
  if (label.startsWith('curl') || label.startsWith('python')) return 'terminal';
  return 'device';
}
</script>
