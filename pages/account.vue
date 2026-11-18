<template>
  <div class="pfx" data-testid="pfx-account">
    <header class="pfx-bar">
      <div class="pfx-bar__id">
        <span class="pfx-bar__mark"><PeopleIcon name="user" /></span>
        <h1 class="pfx-bar__title">Your account</h1>
        <span class="pfx-bar__sub">what you can do, where you're signed in, your password</span>
      </div>
      <span class="pfx-bar__spacer"></span>
      <div class="pfx-bar__actions">
        <NuxtLink v-if="can('profiles.directory.view')" class="pfx-btn pfx-btn--ghost" to="/administration/profiles" aria-label="All profiles"><PeopleIcon name="users" /><span class="pfx-hide-sm">All profiles</span></NuxtLink>
        <button class="pfx-btn" aria-label="Sign out" @click="signOut"><PeopleIcon name="signout" /><span class="pfx-hide-sm">Sign out</span></button>
      </div>
    </header>

    <div class="pfx-main" style="max-width: 1280px">
      <header class="pfx-hero">
        <PeopleAvatar :name="username" :id="me?.userId ?? ''" :owner="isOwner" presence="online" :size="58" />
        <div style="min-width: 0">
          <h1 class="pfx-hero__name">{{ username }} <span class="pfx-rank" :data-rank="rankInfo.value">{{ isOwner ? 'Owner' : rankInfo.name }}</span></h1>
          <p class="pfx-hero__line">
            <template v-if="isOwner">Holds every permission.</template>
            <template v-else>{{ grantedCount }} permission{{ grantedCount === 1 ? '' : 's' }} across {{ servicesHeld.length }} service{{ servicesHeld.length === 1 ? '' : 's' }}.</template>
            <template v-if="me?.createdUtc"> Member since {{ new Date(me.createdUtc).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }}.</template>
          </p>
          <div class="pfx-hero__flags">
            <span v-if="suspended" class="pfx-chip" data-tone="crit"><PeopleIcon name="pause" />Suspended</span>
            <span v-if="readOnly" class="pfx-chip" data-tone="info"><PeopleIcon name="eye" />Read-only</span>
            <span class="pfx-chip">{{ rankInfo.blurb }}</span>
          </div>
        </div>
      </header>

      <div class="pfx-grid-main">
        <!-- what you can do -->
        <section class="pfx-card" aria-label="What you can do">
          <header class="pfx-card__head">
            <h2 class="pfx-card__title"><PeopleIcon name="layers" />What you can do</h2>
            <span class="pfx-card__meta">{{ isOwner ? 'everything' : 'your permissions, by service' }}</span>
            <div v-if="!isOwner && servicesHeld.length > 3" class="pfx-card__tools">
              <button class="pfx-btn pfx-btn--xs pfx-btn--ghost" @click="openAll = !openAll">{{ openAll ? 'Collapse all' : 'Expand all' }}</button>
            </div>
          </header>
          <div class="pfx-card__body">
            <div v-if="isOwner" class="pfx-empty"><PeopleIcon name="star" />As the owner you hold every current and future permission.</div>
            <template v-else>
              <div v-if="!catalog.catalog.value" style="display: flex; flex-direction: column; gap: 6px"><span v-for="n in 4" :key="n" class="pfx-skel" style="height: 34px"></span></div>
              <div v-else-if="!servicesHeld.length" class="pfx-empty"><PeopleIcon name="lock" />You can sign in, but there's nothing you can open yet. Ask Klives for what you need — it applies the moment it's given.</div>
              <div v-else class="pfx-ax__list">
                <details v-for="s in servicesHeld" :key="`${s.key}-${openAll}`" class="pfx-acsvc" :open="openAll || servicesHeld.length <= 3">
                  <summary class="pfx-svc" style="grid-template-columns: minmax(0, 1fr) auto minmax(44px, auto); padding: 8px 12px; cursor: pointer">
                    <span class="pfx-svc__name ac-service-name" style="color: var(--pfx-ink); font-weight: 600">{{ s.name }}</span>
                    <span class="pfx-svc__pips"><i v-for="t in [1, 2, 3, 4, 5]" :key="t" :data-tier="s.tiers.includes(t) ? t : undefined"></i></span>
                    <span class="pfx-svc__n">{{ s.permissions.length }}<small>/{{ s.total }}</small></span>
                  </summary>
                  <div v-for="p in s.permissions" :key="p.key" class="pfx-perm" style="grid-template-columns: minmax(0, 1fr) auto" :data-state="permissions.has(p.key) ? 'on' : undefined">
                    <div class="pfx-perm__main">
                      <div class="pfx-perm__title"><strong>{{ p.title }}</strong><span v-if="!permissions.has(p.key)" class="pfx-chip" data-tone="warn" :title="suspended ? 'Suspended' : 'Read-only'">{{ suspended ? 'paused' : 'read-only' }}</span></div>
                      <div class="pfx-perm__desc" :title="p.description">{{ p.description }}</div>
                    </div>
                    <span class="pfx-tier" :data-tier="p.tierValue">{{ p.tier }}</span>
                  </div>
                </details>
              </div>
            </template>
          </div>
        </section>

        <div class="pfx-stack">
          <!-- devices -->
          <section class="pfx-card" aria-label="Signed-in devices">
            <header class="pfx-card__head">
              <h2 class="pfx-card__title"><PeopleIcon name="device" />Signed-in devices</h2>
              <span class="pfx-card__meta">{{ sessions.length }} active{{ idleOthers.length ? ` · ${idleOthers.length} idle` : '' }}</span>
              <div class="pfx-card__tools">
                <button v-if="idleOthers.length" class="pfx-btn pfx-btn--sm pfx-btn--warn" :disabled="busy" data-testid="ac-signout-idle" @click="revokeIdle"><PeopleIcon name="clock" />Sign out {{ idleOthers.length }} idle</button>
                <button v-if="sessions.length > 1" class="pfx-btn pfx-btn--sm pfx-btn--ghost" :disabled="busy" @click="revokeOthers"><PeopleIcon name="signout" />Everywhere else</button>
              </div>
            </header>
            <div class="pfx-card__body">
              <p class="pfx-help" style="margin: 0 0 6px">Sign out anything you don't recognise. A device stays signed in for 30 days after you last used it.</p>
              <div v-if="sessionsLoading && !sessions.length" style="display: flex; flex-direction: column; gap: 6px"><span v-for="n in 2" :key="n" class="pfx-skel" style="height: 40px"></span></div>
              <PeopleDevices v-else :sessions="sessions" can-revoke :busy="busy" :now="now" testid="ac-devices" @revoke="revoke" />
            </div>
          </section>

          <!-- password -->
          <section class="pfx-card" aria-label="Password">
            <header class="pfx-card__head"><h2 class="pfx-card__title"><PeopleIcon name="key" />Password</h2><span class="pfx-card__meta">changing it signs out your other devices</span></header>
            <form class="pfx-card__body pfx-form" @submit.prevent="changePassword">
              <input type="text" name="username" :value="username" autocomplete="username" class="pfx-sr" tabindex="-1" aria-hidden="true" readonly />
              <div><label class="pfx-label" for="ac-current">Current password</label><input id="ac-current" v-model="pw.current" class="pfx-input" style="width: 100%" type="password" autocomplete="current-password" /></div>
              <div>
                <label class="pfx-label" for="ac-new">New password</label>
                <input id="ac-new" v-model="pw.next" class="pfx-input" style="width: 100%" type="password" autocomplete="new-password" />
                <p class="pfx-help" :style="newError ? 'color: #ffb3bf' : ''">{{ newError || 'At least 8 characters. Longer is stronger.' }}</p>
              </div>
              <div>
                <label class="pfx-label" for="ac-confirm">New password again</label>
                <input id="ac-confirm" v-model="pw.confirm" class="pfx-input" style="width: 100%" type="password" autocomplete="new-password" />
                <p v-if="confirmError" class="pfx-error">{{ confirmError }}</p>
              </div>
              <p v-if="pwError" class="pfx-error" role="alert">{{ pwError }}</p>
              <div class="pfx-form__actions"><button type="submit" class="pfx-btn pfx-btn--primary pfx-btn--sm" :disabled="busy || !pwValid">Change password</button></div>
            </form>
          </section>
        </div>
      </div>
    </div>
    <PeopleToasts :toasts="toasts" @dismiss="dismiss" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useAccess, usePermissionCatalog } from '~/composables/useAccess';
import { useProfileActions } from '~/composables/useProfilesConsole';
import { SignOut } from '~/scripts/APIInterface';
import { profilesApi, type SessionRow } from '~/scripts/profilesApi';
import { rankMeta } from '~/scripts/profileFormat';
import { IDLE_DAYS, isIdleSession } from '~/scripts/profilesConsole';

definePageMeta({ layout: 'navbar' });

const access = useAccess();
const { can, isOwner, permissions, grantedPermissions, suspended, readOnly } = access;
const catalog = usePermissionCatalog();
const { toasts, notify, dismiss } = useProfileActions();

const me = computed(() => access.profile.value);
const username = computed(() => String(me.value?.name ?? me.value?.Name ?? ''));
const rankInfo = computed(() => rankMeta(access.rank.value));
const grantedCount = computed(() => grantedPermissions.value.size);
const openAll = ref(false);
const now = ref(Date.now());

const servicesHeld = computed(() => (catalog.catalog.value?.services ?? [])
  .map(s => ({
    key: s.key,
    name: s.name,
    total: s.permissions.length,
    permissions: s.permissions.filter(p => grantedPermissions.value.has(p.key)).sort((a, b) => a.tierValue - b.tierValue),
  }))
  .filter(s => s.permissions.length)
  .map(s => ({ ...s, tiers: [...new Set(s.permissions.map(p => p.tierValue))].sort() })));

const sessions = ref<SessionRow[]>([]);
const sessionsLoading = ref(false);
const busy = ref(false);
/** Your other devices nobody has used for a week (the one you are on never counts). */
const idleOthers = computed(() => sessions.value.filter(s => !s.current && isIdleSession(s, now.value)));

async function loadSessions() {
  sessionsLoading.value = true;
  try { sessions.value = await profilesApi.mySessions(); } catch { /* keep the last list */ } finally { sessionsLoading.value = false; }
}

async function run(work: () => Promise<void>) {
  busy.value = true;
  try { await work(); } catch (e) { notify('crit', 'That didn’t work', e instanceof Error ? e.message : ''); } finally { busy.value = false; }
}
const revoke = (sessionId: string) => run(async () => { await profilesApi.revokeMySessions(sessionId); notify('ok', 'Device signed out'); await loadSessions(); });
// One device at a time, by id: a server from before idleDays would read idleDays as "everywhere else".
const revokeIdle = () => run(async () => {
  let revoked = 0;
  for (const s of idleOthers.value) revoked += (await profilesApi.revokeMySessions(s.sessionId)).revoked;
  notify('ok', revoked ? `Signed out ${revoked} idle device${revoked === 1 ? '' : 's'}` : 'No idle devices to sign out', revoked ? `Unused for ${IDLE_DAYS}+ days.` : undefined);
  await loadSessions();
});
const revokeOthers = () => run(async () => {
  const { revoked } = await profilesApi.revokeMySessions();
  notify('ok', 'Signed out everywhere else', `${revoked} device${revoked === 1 ? '' : 's'} signed out.`);
  await loadSessions();
});

const pw = reactive({ current: '', next: '', confirm: '' });
const pwError = ref<string | null>(null);
const newError = computed(() => (pw.next && pw.next.length < 8 ? 'At least 8 characters.' : pw.next.startsWith('kms_') ? "Can't start with “kms_”." : ''));
const confirmError = computed(() => (pw.confirm && pw.confirm !== pw.next ? "Doesn't match." : ''));
const pwValid = computed(() => !!pw.current && pw.next.length >= 8 && !newError.value && pw.confirm === pw.next);

async function changePassword() {
  if (!pwValid.value) return;
  busy.value = true;
  pwError.value = null;
  try {
    const result = await profilesApi.changePassword(pw.current, pw.next);
    Object.assign(pw, { current: '', next: '', confirm: '' });
    notify('ok', 'Password changed', result.signedOutSessions ? `${result.signedOutSessions} other device${result.signedOutSessions === 1 ? '' : 's'} signed out.` : '');
    await loadSessions();
  } catch (e) {
    pwError.value = e instanceof Error ? e.message : 'Could not change your password.';
  } finally {
    busy.value = false;
  }
}

function signOut() {
  SignOut(null, { serverLogout: true });
}

let clock: number | undefined;
onMounted(() => {
  void catalog.load();
  void loadSessions();
  void access.refresh();
  clock = window.setInterval(() => { now.value = Date.now(); }, 30_000);
});
onBeforeUnmount(() => window.clearInterval(clock));
</script>

<style lang="scss" src="~/assets/scss/profiles-console.scss"></style>
