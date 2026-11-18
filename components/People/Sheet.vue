<template>
  <Teleport to="body">
    <div v-if="profile" class="pfx-layer">
      <aside class="pfx-sheet" role="dialog" aria-modal="false" :aria-label="`Profile ${profile.name}`" data-testid="pfx-sheet" @keydown.esc.stop="emit('close')">
        <header class="pfx-sheet__head">
          <div class="pfx-sheet__toprow">
            <PeopleAvatar :name="profile.name" :id="profile.userId" :owner="profile.isOwner" :presence="presence" :size="44" />
            <div style="flex: 1; min-width: 0">
              <div class="pfx-sheet__name">
                <span data-testid="pfx-sheet-name">{{ profile.name }}</span>
                <span class="pfx-rank" :data-rank="profile.rankValue">{{ profile.isOwner ? 'Owner' : profile.rank }}</span>
                <span v-if="profile.isYou" class="pfx-you">you</span>
              </div>
              <div class="pfx-sheet__presence">
                <span class="pfx-dot" :data-presence="presence"></span>
                <span class="pfx-truncate">{{ presence === 'offline' ? (person ? lastSeenText(person, insights, now) : 'Offline') : presenceText(profile.presence, now) }}</span>
                <PeopleIcon v-if="loading" name="refresh" class="pfx-spin pfx-dim" />
              </div>
            </div>
            <button class="pfx-iconbtn" title="Close (Esc)" aria-label="Close" data-testid="pfx-sheet-close" @click="emit('close')"><PeopleIcon name="x" /></button>
          </div>
          <div class="pfx-sheet__flags">
            <span v-if="profile.suspended" class="pfx-chip" data-tone="crit"><PeopleIcon name="pause" />Suspended · lifts {{ untilTime(profile.suspendedUntilUtc, now) }}</span>
            <span v-if="!profile.canLogin" class="pfx-chip" data-tone="crit"><PeopleIcon name="power" />Sign-in off</span>
            <span v-if="profile.readOnly" class="pfx-chip" data-tone="info"><PeopleIcon name="eye" />Read-only</span>
            <span v-if="profile.allowPasswordApiAccess" class="pfx-chip" data-tone="warn" title="This profile's password also works as an API key"><PeopleIcon name="key" />Password API access</span>
            <span class="pfx-chip">Created {{ profile.createdUtc ? relTime(profile.createdUtc, now) : '—' }}</span>
          </div>
          <div v-if="canControl" class="pfx-sheet__acts">
            <button v-if="!profile.suspended" class="pfx-btn pfx-btn--sm pfx-btn--warn" :disabled="!!busy" data-testid="sheet-suspend" @click="emit('suspend')"><PeopleIcon name="pause" />Suspend…</button>
            <button v-else class="pfx-btn pfx-btn--sm" :disabled="!!busy" @click="emit('unsuspend')"><PeopleIcon name="play" />Lift suspension</button>
            <button class="pfx-btn pfx-btn--sm" :aria-pressed="profile.readOnly" :disabled="!!busy" @click="emit('read-only', !profile.readOnly)"><PeopleIcon name="eye" />{{ profile.readOnly ? 'Lift read-only' : 'Read-only' }}</button>
            <button v-if="idleCount" class="pfx-btn pfx-btn--sm" :disabled="!!busy" data-testid="sheet-signout-idle" @click="emit('sign-out-idle')"><PeopleIcon name="clock" />Sign out {{ idleCount }} idle</button>
            <button class="pfx-btn pfx-btn--sm pfx-btn--ghost" :disabled="!!busy || !profile.sessions" @click="emit('sign-out-all')"><PeopleIcon name="signout" />Sign out everywhere</button>
            <button class="pfx-btn pfx-btn--sm pfx-btn--ghost" :disabled="!!busy" @click="emit('login', !profile.canLogin)"><PeopleIcon name="power" />{{ profile.canLogin ? 'Turn sign-in off' : 'Turn sign-in on' }}</button>
          </div>
          <p v-else-if="profile.isYou && idleCount" class="pfx-sheet__acts">
            <button class="pfx-btn pfx-btn--sm" :disabled="!!busy" data-testid="sheet-signout-idle" @click="emit('sign-out-idle')"><PeopleIcon name="clock" />Sign out my {{ idleCount }} idle device{{ idleCount === 1 ? '' : 's' }}</button>
          </p>
        </header>

        <div class="pfx-sheet__body">
          <section class="pfx-sheet__section" aria-label="Figures">
            <div class="pfx-facts">
              <div>
                <div class="pfx-fact__label">Requests 24 h</div>
                <div class="pfx-fact__value">{{ fmtCount(profile.requests24h) }}<small v-if="profile.denied24h" style="color: var(--pfx-crit)">{{ profile.denied24h }} refused</small></div>
              </div>
              <div>
                <div class="pfx-fact__label">Permissions</div>
                <div class="pfx-fact__value">
                  <template v-if="profile.isOwner">All</template>
                  <template v-else-if="person?.used != null">{{ person.used }}<small>/ {{ person.held }} used</small></template>
                  <template v-else>{{ profile.grantCount }}</template>
                </div>
              </div>
              <div>
                <div class="pfx-fact__label">Devices</div>
                <div class="pfx-fact__value" :data-tone="idleCount ? 'warn' : undefined">{{ profile.sessions }}<small v-if="idleCount">{{ idleCount }} idle</small></div>
              </div>
            </div>
            <div v-if="person?.hourly.length" style="margin-top: 10px">
              <PeopleSpark :values="person.hourly" :tone="profile.denied24h ? 'warn' : 'violet'" />
            </div>
            <p v-if="auth" class="pfx-help" style="margin-top: 8px">
              7 days: <b class="pfx-num" style="color: var(--pfx-ink-2)">{{ fmtCount(auth.session7d) }}</b> with a session ·
              <b class="pfx-num" :style="{ color: auth.password7d && !auth.passwordApiAllowed ? 'var(--pfx-warn)' : 'var(--pfx-ink-2)' }">{{ fmtCount(auth.password7d) }}</b> with the password<template v-if="auth.password7d && !auth.passwordApiAllowed"> — without password access: switching passwords-as-keys off would lock this out</template>.
            </p>
          </section>

          <section v-if="!profile.isOwner && person?.unused.length" class="pfx-sheet__section" aria-label="Unused permissions">
            <h4>Unused for 30 days <span class="pfx-chip" data-tone="warn">{{ person.unused.length }}</span><button class="pfx-link" @click="emit('page', 'access')">Review →</button></h4>
            <div style="display: flex; flex-wrap: wrap; gap: 4px">
              <span v-for="key in person.unused.slice(0, 12)" :key="key" class="pfx-chip" :title="key">{{ titleOf(key) }}</span>
              <span v-if="person.unused.length > 12" class="pfx-chip">+{{ person.unused.length - 12 }}</span>
            </div>
          </section>

          <section v-if="sessions.length" class="pfx-sheet__section" aria-label="Devices">
            <h4>Devices<button v-if="sessions.length > 4" class="pfx-link" @click="emit('page', 'devices')">All {{ sessions.length }} →</button></h4>
            <PeopleDevices :sessions="sessions" :can-revoke="canControl || profile.isYou" :busy="!!busy" compact :limit="4" :now="now" @revoke="id => emit('revoke', id)" />
          </section>

          <section v-if="canActivity" class="pfx-sheet__section" aria-label="Recent activity">
            <h4>Recent activity<button class="pfx-link" @click="emit('page', 'activity')">Open →</button></h4>
            <PeopleTimeline :items="activity" :loading="loading" :profile-id="profile.userId" :show-ip="false" :title-of="titleOf" />
          </section>
        </div>

        <footer class="pfx-sheet__foot">
          <button class="pfx-btn pfx-btn--primary" data-testid="sheet-open" @click="emit('page', '')"><PeopleIcon name="external" />Open profile</button>
          <button v-if="canAccess && !profile.isOwner" class="pfx-btn" @click="emit('page', 'access')"><PeopleIcon name="layers" />Permissions</button>
        </footer>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ProfileRow, SessionRow, TimelineItem } from '~/scripts/profilesApi';
import { fmtCount, presenceText, relTime, untilTime } from '~/scripts/profileFormat';
import { isIdleSession, lastSeenText, type InsightsPayload, type PersonRow } from '~/scripts/profilesConsole';

/**
 * A quick look at one profile beside the directory: who and where, the figures that matter, the
 * unused permissions and idle devices, recent activity, and the controls — without leaving the list.
 */
const props = defineProps<{
  profile: ProfileRow | null;
  person: PersonRow | null;
  insights: InsightsPayload | null;
  sessions: SessionRow[];
  activity: TimelineItem[];
  loading: boolean;
  busy: string | null;
  now: number;
  canControl: boolean;
  canActivity: boolean;
  canAccess: boolean;
  titleOf: (key: string) => string;
}>();
const emit = defineEmits<{
  close: []; page: [tab: string]; suspend: []; unsuspend: []; 'read-only': [on: boolean]; login: [on: boolean];
  'sign-out-all': []; 'sign-out-idle': []; revoke: [sessionId: string];
}>();

const presence = computed(() => props.profile?.presence.state ?? 'offline');
const auth = computed(() => props.person?.insight?.auth ?? null);
const idleCount = computed(() => (props.sessions.length ? props.sessions.filter(s => isIdleSession(s, props.now)).length : props.person?.idleDevices ?? 0));
</script>
