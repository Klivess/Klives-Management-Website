<template>
    <ProfilesShell brand="Your account" tagline="Klives Management" brand-to="/account" :hide-error="true">
        <header class="ac-hero">
            <ProfilesAvatar :name="username" :id="me?.userId ?? ''" :owner="isOwner" presence="online" :size="64" />
            <div class="ac-ident">
                <h1>{{ username }} <span class="km-rank" :class="`r${rankInfo.value}`">{{ isOwner ? 'Owner' : rankInfo.name }}</span></h1>
                <p class="ac-sub">
                    <template v-if="isOwner">Holds every permission.</template>
                    <template v-else>{{ grantedCount }} permission{{ grantedCount === 1 ? '' : 's' }} across {{ servicesHeld.length }} service{{ servicesHeld.length === 1 ? '' : 's' }}.</template>
                    <template v-if="me?.createdUtc"> Member since {{ new Date(me.createdUtc).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }}.</template>
                </p>
                <div class="ac-flags">
                    <span v-if="suspended" class="ot-chip bad">⏸ Suspended</span>
                    <span v-if="readOnly" class="ot-chip info">◐ Read-only</span>
                    <span class="ot-chip">{{ rankInfo.blurb }}</span>
                </div>
            </div>
            <button type="button" class="ot-btn ghost" @click="signOut"><AccessIcon name="signout" :size="15" /> Sign out</button>
        </header>

        <div class="ac-grid">
            <!-- What you can do -->
            <OmniTraderCard title="What you can do" :subtitle="isOwner ? 'Everything' : 'Your permissions, by service'" class="ac-perms">
                <OmniTraderStateBlock v-if="isOwner" kind="ok" title="Every permission" detail="As the owner you hold every current and future permission." compact />
                <template v-else>
                    <div v-if="!catalog.catalog.value" class="ot-skelrows"><div v-for="n in 4" :key="n" class="ot-skel"></div></div>
                    <OmniTraderStateBlock v-else-if="!servicesHeld.length" title="No permissions yet"
                                          detail="You can sign in, but there's nothing you can open yet. Ask Klives for what you need — it applies the moment it's given." compact />
                    <div v-else class="ac-services">
                        <details v-for="s in servicesHeld" :key="s.key" class="ac-service" :open="servicesHeld.length <= 3">
                            <summary>
                                <span class="ac-service-name">{{ s.name }}</span>
                                <span class="ac-service-tiers"><span v-for="t in s.tiers" :key="t" class="km-tier" :class="tierMeta(t).tone">{{ tierMeta(t).short }}</span></span>
                                <span class="ac-service-n">{{ s.permissions.length }}/{{ s.total }}</span>
                            </summary>
                            <ul>
                                <li v-for="p in s.permissions" :key="p.key" :class="{ blocked: !permissions.has(p.key) }">
                                    <span class="km-tier" :class="tierMeta(p.tier).tone">{{ tierMeta(p.tier).short }} {{ p.tier }}</span>
                                    <div>
                                        <strong>{{ p.title }}</strong>
                                        <small>{{ p.description }}</small>
                                    </div>
                                    <span v-if="!permissions.has(p.key)" class="ac-blocked" :title="suspended ? 'Suspended' : 'Read-only'">{{ suspended ? 'paused' : 'read-only' }}</span>
                                </li>
                            </ul>
                        </details>
                    </div>
                </template>
            </OmniTraderCard>

            <div class="ot-stack">
                <!-- Devices -->
                <OmniTraderCard title="Signed-in devices" subtitle="Sign out anything you don't recognise">
                    <div v-if="sessionsLoading && !sessions.length" class="ot-skelrows"><div v-for="n in 2" :key="n" class="ot-skel"></div></div>
                    <ProfilesSessionsList v-else :sessions="sessions" can-revoke self-view :busy="busy" @revoke="revoke" @revoke-all="revokeOthers" />
                </OmniTraderCard>

                <!-- Password -->
                <OmniTraderCard title="Password" subtitle="Changing it signs out your other devices">
                    <form class="ac-form" @submit.prevent="changePassword">
                        <input type="text" name="username" :value="username" autocomplete="username" class="ac-hidden" tabindex="-1" aria-hidden="true" readonly />
                        <div class="ot-field">
                            <label for="ac-current">Current password</label>
                            <input id="ac-current" v-model="pw.current" class="ot-input" type="password" autocomplete="current-password" />
                        </div>
                        <div class="ot-field" :class="{ invalid: newError }">
                            <label for="ac-new">New password</label>
                            <input id="ac-new" v-model="pw.next" class="ot-input" type="password" autocomplete="new-password" />
                            <span class="help">{{ newError || 'At least 8 characters. Longer is stronger.' }}</span>
                        </div>
                        <div class="ot-field" :class="{ invalid: confirmError }">
                            <label for="ac-confirm">New password again</label>
                            <input id="ac-confirm" v-model="pw.confirm" class="ot-input" type="password" autocomplete="new-password" />
                            <span v-if="confirmError" class="help">{{ confirmError }}</span>
                        </div>
                        <p v-if="pwError" class="ac-error" role="alert">{{ pwError }}</p>
                        <div class="ac-actions"><button type="submit" class="ot-btn primary sm" :disabled="busy || !pwValid">Change password</button></div>
                    </form>
                </OmniTraderCard>
            </div>
        </div>
    </ProfilesShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useAccess, usePermissionCatalog } from '~/composables/useAccess';
import { SignOut } from '~/scripts/APIInterface';
import { pushToast } from '~/scripts/accessState';
import { profilesApi, type SessionRow } from '~/scripts/profilesApi';
import { rankMeta, tierMeta } from '~/scripts/profileFormat';

definePageMeta({ layout: 'navbar' });

const access = useAccess();
const { isOwner, permissions, grantedPermissions, suspended, readOnly } = access;
const catalog = usePermissionCatalog();

const me = computed(() => access.profile.value);
const username = computed(() => String(me.value?.name ?? me.value?.Name ?? ''));
const rankInfo = computed(() => rankMeta(access.rank.value));
const grantedCount = computed(() => grantedPermissions.value.size);

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

async function loadSessions() {
    sessionsLoading.value = true;
    try { sessions.value = await profilesApi.mySessions(); } catch { /* keep the last list */ } finally { sessionsLoading.value = false; }
}

function done(title: string, detail = '') {
    pushToast({ tone: 'info', title, detail, permissions: [], reason: 'info' }, 4_000);
}

async function revoke(sessionId: string) {
    busy.value = true;
    try { await profilesApi.revokeMySessions(sessionId); done('Device signed out'); await loadSessions(); } finally { busy.value = false; }
}

async function revokeOthers() {
    busy.value = true;
    try {
        const { revoked } = await profilesApi.revokeMySessions();
        done('Signed out everywhere else', `${revoked} device${revoked === 1 ? '' : 's'} signed out.`);
        await loadSessions();
    } finally { busy.value = false; }
}

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
        done('Password changed', result.signedOutSessions ? `${result.signedOutSessions} other device${result.signedOutSessions === 1 ? '' : 's'} signed out.` : '');
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

onMounted(() => {
    void catalog.load();
    void loadSessions();
    void access.refresh();
});
</script>

<style scoped>
.ac-hero {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 18px;
    align-items: center;
    padding: 18px 20px;
    margin-bottom: var(--ot-space-4);
    border-radius: var(--ot-radius-lg);
    border: 1px solid var(--ot-line);
    background: radial-gradient(120% 140% at 0% 0%, rgba(109, 220, 79, 0.07), transparent 55%), var(--ot-surface);
}
@media (max-width: 640px) {
    .ac-hero { grid-template-columns: auto minmax(0, 1fr); }
    .ac-hero > .ot-btn { grid-column: 1 / -1; justify-self: start; }
}
.ac-ident { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.ac-ident h1 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 24px; line-height: 30px; font-weight: 650; color: var(--ot-text); }
.ac-sub { color: var(--ot-text-2); font-size: 13.5px; }
.ac-flags { display: flex; gap: 6px; flex-wrap: wrap; }

.ac-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(320px, 1fr); gap: var(--ot-gutter); align-items: start; }
@media (max-width: 1100px) { .ac-grid { grid-template-columns: minmax(0, 1fr); } }

.ac-services { display: flex; flex-direction: column; gap: 6px; }
.ac-service { border: 1px solid var(--ot-line); border-radius: var(--ot-radius); background: rgba(255, 255, 255, 0.015); }
.ac-service summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
    cursor: pointer;
    list-style: none;
}
.ac-service summary::-webkit-details-marker { display: none; }
.ac-service[open] summary { border-bottom: 1px solid var(--ot-line); }
.ac-service-name { color: var(--ot-text); font-weight: 600; font-size: 13.5px; }
.ac-service-tiers { display: inline-flex; gap: 3px; }
.ac-service-n { font-family: var(--ot-mono); font-size: 12px; color: var(--ot-muted); }
.ac-service ul { list-style: none; margin: 0; padding: 6px; display: flex; flex-direction: column; gap: 2px; }
.ac-service li { display: grid; grid-template-columns: 92px minmax(0, 1fr) auto; gap: 10px; align-items: flex-start; padding: 7px 6px; border-radius: 6px; }
.ac-service li:hover { background: rgba(255, 255, 255, 0.025); }
.ac-service li.blocked { opacity: 0.55; }
.ac-service li .km-tier { width: fit-content; }
.ac-service li strong { display: block; color: var(--ot-text); font-size: 13px; font-weight: 600; }
.ac-service li small { display: block; color: var(--ot-muted); font-size: 12px; line-height: 17px; }
.ac-blocked { font-size: 11px; color: var(--ot-warning); }

.ac-form { display: flex; flex-direction: column; gap: 12px; }
.ac-form .ot-field label { font-size: 12px; font-weight: 600; color: var(--ot-text-2); }
.ac-hidden { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.ac-actions { display: flex; justify-content: flex-end; }
.ac-error { color: var(--ot-negative); font-size: 12.5px; }
</style>
