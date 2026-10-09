<template>
    <ProfilesShell :scope="scopeText" :scope-dot="onlineCount ? 'online' : ''" :fresh-label="freshLabel" :error="error"
                   :loading="loading" refreshable @refresh="load">
        <div class="ot-pagehead">
            <div>
                <h1>Profiles</h1>
                <p class="subtitle">Everyone who can sign in to Klives Management, what they're doing right now, and what they're allowed to do.</p>
            </div>
            <div class="ot-actions">
                <NuxtLink v-if="can('profiles.lifecycle.create')" class="ot-btn primary" to="/administration/profiles/new">
                    <AccessIcon name="plus" :size="15" /> New profile
                </NuxtLink>
            </div>
        </div>

        <div v-if="isOwner && payload?.acceptPasswordAsBearer" class="ot-banner info" role="note">
            <span class="glyph" aria-hidden="true">ℹ</span>
            <div>
                <strong>Passwords still work as API keys</strong>
                Every profile's password is accepted in place of a session, so older devices and scripts keep working.
                Once they all sign in properly, turn off <code class="km-key">KMProfiles_AcceptPasswordAsBearer</code> in
                <NuxtLink to="/administration/omnisettings" class="pc-link">OmniSettings</NuxtLink> — profiles can still be allowed one by one.
            </div>
        </div>

        <div class="ot-kpis pc-kpis">
            <OmniTraderKpi label="Online now" :value="String(onlineCount)" :loading="!payload" :tone="onlineCount ? 'good' : ''"
                           :foot="idleCount ? `${idleCount} idle` : 'active in the last minute'" />
            <OmniTraderKpi label="Profiles" :value="String(rows.length)" :loading="!payload" :foot="statusFoot" />
            <OmniTraderKpi label="Requests · 24h" :value="fmtCount(requests24h)" :loading="!payload"
                           :foot="denied24h ? `${fmtCount(denied24h)} refused` : 'none refused'" :attention-soft="denied24h > 0" />
            <OmniTraderKpi label="Signed-in devices" :value="String(sessionCount)" :loading="!payload" foot="active sessions" />
        </div>

        <div class="ot-filterbar pc-filters">
            <label class="ot-search">
                <span class="glyph" aria-hidden="true"><AccessIcon name="search" :size="13" /></span>
                <input v-model="search" class="ot-input" type="search" placeholder="Search profiles" aria-label="Search profiles" />
            </label>
            <div class="ot-segment sm" role="group" aria-label="Show">
                <button v-for="f in FILTERS" :key="f.key" type="button" :aria-pressed="filter === f.key" @click="filter = f.key">
                    {{ f.label }}<span v-if="f.key !== 'all' && counts[f.key]" class="pc-count">{{ counts[f.key] }}</span>
                </button>
            </div>
            <span class="grow"></span>
            <label class="summary pc-sort">
                Sort
                <select v-model="sort" class="ot-select auto" aria-label="Sort profiles">
                    <option value="rank">Rank</option>
                    <option value="seen">Last seen</option>
                    <option value="activity">Activity</option>
                    <option value="name">Name</option>
                </select>
            </label>
        </div>

        <section class="pc-list" aria-label="Profiles">
            <template v-if="!payload && loading">
                <div v-for="n in 4" :key="n" class="ot-skel pc-skelrow"></div>
            </template>
            <OmniTraderStateBlock v-else-if="payload && !visible.length" :kind="rows.length ? 'filtered' : 'empty'"
                                  :title="rows.length ? 'No profiles match' : 'No profiles yet'" />

            <article v-for="row in visible" :key="row.userId" class="pc-row" :class="{ suspended: row.suspended, disabled: !row.canLogin }"
                     tabindex="0" @click="open(row)" @keydown.enter="open(row)">
                <ProfilesAvatar :name="row.name" :id="row.userId" :owner="row.isOwner" :presence="row.presence.state" :size="40" />

                <div class="pc-who">
                    <div class="pc-name">
                        <strong>{{ row.name }}</strong>
                        <span v-if="row.isYou" class="pc-you">you</span>
                        <span class="km-rank" :class="`r${row.rankValue}`">{{ row.isOwner ? 'Owner' : row.rank }}</span>
                    </div>
                    <div class="pc-flags">
                        <span v-if="row.suspended" class="ot-chip bad" :title="row.suspensionReason ?? ''">⏸ Suspended {{ row.suspendedUntilUtc ? untilTime(row.suspendedUntilUtc, now) : '' }}</span>
                        <span v-if="row.readOnly" class="ot-chip info">◐ Read-only</span>
                        <span v-if="!row.canLogin" class="ot-chip bad">⏻ Sign-in off</span>
                        <span v-if="row.temporaryGrantCount" class="ot-chip violet">⏱ {{ row.temporaryGrantCount }} temporary</span>
                    </div>
                </div>

                <div class="pc-where" :class="row.presence.state">
                    <template v-if="row.presence.state !== 'offline'">
                        <span class="pc-where-main">{{ presenceText(row.presence, now) }}</span>
                        <span class="pc-sub">{{ row.presence.connections }} tab{{ row.presence.connections === 1 ? '' : 's' }} open</span>
                    </template>
                    <template v-else>
                        <span class="pc-where-main">Offline</span>
                        <span class="pc-sub">{{ row.lastSeenUtc ? `Last seen ${relTime(row.lastSeenUtc, now)}` : 'Never seen' }}</span>
                    </template>
                </div>

                <div class="pc-stat perms" :title="row.isOwner ? 'The owner holds every permission' : `${row.grantCount} permissions`">
                    <span class="pc-stat-v">{{ row.isOwner ? 'All' : row.grantCount }}</span>
                    <span class="pc-sub">permissions</span>
                </div>
                <div class="pc-stat activity">
                    <span class="pc-stat-v">{{ fmtCount(row.requests24h) }}<em v-if="row.denied24h" class="pc-denied" :title="`${row.denied24h} refused`"> · {{ row.denied24h }}✕</em></span>
                    <span class="pc-sub">requests 24h</span>
                </div>
                <div class="pc-stat devices">
                    <span class="pc-stat-v">{{ row.sessions }}</span>
                    <span class="pc-sub">devices</span>
                </div>

                <div class="pc-menu" @click.stop @keydown.enter.stop>
                    <button v-if="quickActions(row)" type="button" class="ot-btn ghost sm" :aria-expanded="menuFor === row.userId"
                            :aria-label="`Actions for ${row.name}`" @click="menuFor = menuFor === row.userId ? null : row.userId">
                        <AccessIcon name="more" :size="16" />
                    </button>
                    <div v-if="menuFor === row.userId" class="pc-popover" role="menu">
                        <button v-if="!row.suspended" type="button" role="menuitem" @click="startSuspend(row)"><AccessIcon name="pause" :size="14" /> Suspend…</button>
                        <button v-else type="button" role="menuitem" @click="act(row, 'unsuspend')"><AccessIcon name="bolt" :size="14" /> Lift suspension</button>
                        <button type="button" role="menuitem" @click="act(row, row.readOnly ? 'read-write' : 'read-only')"><AccessIcon name="eye" :size="14" /> {{ row.readOnly ? 'Lift read-only' : 'Make read-only' }}</button>
                        <button type="button" role="menuitem" :disabled="!row.sessions" @click="confirmAction(row, 'signout')"><AccessIcon name="signout" :size="14" /> Sign out everywhere</button>
                        <button type="button" role="menuitem" class="danger" @click="row.canLogin ? confirmAction(row, 'login-off') : act(row, 'login-on')"><AccessIcon name="power" :size="14" /> {{ row.canLogin ? 'Turn sign-in off' : 'Turn sign-in on' }}</button>
                        <NuxtLink role="menuitem" :to="`/administration/profiles/${row.userId}`"><AccessIcon name="chevron" :size="14" /> Open profile</NuxtLink>
                    </div>
                </div>
            </article>
        </section>

        <ProfilesSuspendDialog :open="!!suspending" :name="suspending?.name ?? ''" :busy="busy" :error="actionError"
                               @close="suspending = null" @confirm="doSuspend" />

        <ProfilesModal :open="!!confirming" :title="confirmTitle" tone="danger" @close="confirming = null">
            <p class="pc-confirm">{{ confirmText }}</p>
            <p v-if="actionError" class="pc-error" role="alert">{{ actionError }}</p>
            <template #footer>
                <button type="button" class="ot-btn ghost" @click="confirming = null">Cancel</button>
                <button type="button" class="ot-btn danger" :disabled="busy" @click="runConfirmed">{{ busy ? 'Working…' : confirmButton }}</button>
            </template>
        </ProfilesModal>
    </ProfilesShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAccess } from '~/composables/useAccess';
import { pushToast } from '~/scripts/accessState';
import { profilesApi, ProfilesApiError, type ProfileListPayload, type ProfileRow } from '~/scripts/profilesApi';
import { fmtCount, presenceText, relTime, untilTime } from '~/scripts/profileFormat';

definePageMeta({ layout: 'navbar' });

type Filter = 'all' | 'online' | 'suspended' | 'readOnly' | 'disabled';
const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'online', label: 'Online' },
    { key: 'suspended', label: 'Suspended' },
    { key: 'readOnly', label: 'Read-only' },
    { key: 'disabled', label: 'Sign-in off' },
];

const router = useRouter();
const { can, isOwner } = useAccess();

const payload = ref<ProfileListPayload | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const loadedAt = ref(0);
const now = ref(Date.now());
const search = ref('');
const filter = ref<Filter>('all');
const sort = ref<'rank' | 'seen' | 'activity' | 'name'>('rank');
const menuFor = ref<string | null>(null);
const suspending = ref<ProfileRow | null>(null);
const confirming = ref<{ row: ProfileRow; kind: 'signout' | 'login-off' } | null>(null);
const busy = ref(false);
const actionError = ref<string | null>(null);
let poll: number | undefined;
let clock: number | undefined;

const rows = computed(() => payload.value?.profiles ?? []);
const onlineCount = computed(() => rows.value.filter(r => r.presence.state === 'online').length);
const idleCount = computed(() => rows.value.filter(r => r.presence.state === 'idle').length);
const requests24h = computed(() => rows.value.reduce((s, r) => s + r.requests24h, 0));
const denied24h = computed(() => rows.value.reduce((s, r) => s + r.denied24h, 0));
const sessionCount = computed(() => rows.value.reduce((s, r) => s + r.sessions, 0));
const counts = computed<Record<Filter, number>>(() => ({
    all: rows.value.length,
    online: rows.value.filter(r => r.presence.state !== 'offline').length,
    suspended: rows.value.filter(r => r.suspended).length,
    readOnly: rows.value.filter(r => r.readOnly).length,
    disabled: rows.value.filter(r => !r.canLogin).length,
}));
const statusFoot = computed(() => {
    const parts = [];
    if (counts.value.suspended) parts.push(`${counts.value.suspended} suspended`);
    if (counts.value.readOnly) parts.push(`${counts.value.readOnly} read-only`);
    if (counts.value.disabled) parts.push(`${counts.value.disabled} sign-in off`);
    return parts.join(' · ') || 'all active';
});
const scopeText = computed(() => (payload.value ? `${onlineCount.value} online · ${rows.value.length} profiles` : ''));
const freshLabel = computed(() => (loadedAt.value ? `Updated ${relTime(loadedAt.value, now.value)}` : 'Loading…'));

const visible = computed(() => {
    const q = search.value.trim().toLowerCase();
    const list = rows.value.filter(r => {
        if (q && !r.name.toLowerCase().includes(q) && !r.rank.toLowerCase().includes(q)) return false;
        switch (filter.value) {
            case 'online': return r.presence.state !== 'offline';
            case 'suspended': return r.suspended;
            case 'readOnly': return r.readOnly;
            case 'disabled': return !r.canLogin;
            default: return true;
        }
    });
    const seen = (r: ProfileRow) => (r.presence.state !== 'offline' ? Number.MAX_SAFE_INTEGER : Date.parse(r.lastSeenUtc ?? '') || 0);
    return [...list].sort((a, b) => {
        switch (sort.value) {
            case 'seen': return seen(b) - seen(a);
            case 'activity': return b.requests24h - a.requests24h;
            case 'name': return a.name.localeCompare(b.name);
            default:
                return Number(b.isOwner) - Number(a.isOwner) || b.rankValue - a.rankValue || a.name.localeCompare(b.name);
        }
    });
});

function quickActions(row: ProfileRow) {
    return row.manageable && can('profiles.access.control');
}

async function load() {
    if (loading.value) return;
    loading.value = true;
    try {
        payload.value = await profilesApi.list();
        loadedAt.value = Date.now();
        error.value = null;
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not load profiles.';
    } finally {
        loading.value = false;
    }
}

function open(row: ProfileRow) {
    void router.push(`/administration/profiles/${row.userId}`);
}

function replaceRow(updated: ProfileRow) {
    if (!payload.value) return;
    const i = payload.value.profiles.findIndex(r => r.userId === updated.userId);
    // Quick-action responses carry no 24h counters or last-seen: keep the ones already shown.
    if (i >= 0) payload.value.profiles[i] = { ...payload.value.profiles[i], ...updated, requests24h: payload.value.profiles[i].requests24h, denied24h: payload.value.profiles[i].denied24h, lastSeenUtc: payload.value.profiles[i].lastSeenUtc };
}

function done(title: string, detail = '') {
    pushToast({ tone: 'info', title, detail, permissions: [], reason: 'info' }, 4_000);
}

async function act(row: ProfileRow, kind: 'unsuspend' | 'read-only' | 'read-write' | 'login-on') {
    menuFor.value = null;
    try {
        if (kind === 'unsuspend') { replaceRow(await profilesApi.unsuspend(row.userId)); done(`${row.name} can use the site again`); }
        if (kind === 'read-only') { replaceRow(await profilesApi.setReadOnly(row.userId, true)); done(`${row.name} is read-only`, 'They can look, but every change is blocked.'); }
        if (kind === 'read-write') { replaceRow(await profilesApi.setReadOnly(row.userId, false)); done(`Read-only lifted for ${row.name}`); }
        if (kind === 'login-on') { replaceRow(await profilesApi.setLogin(row.userId, true)); done(`${row.name} can sign in again`); }
    } catch (e) {
        if (!(e instanceof ProfilesApiError && e.denied)) pushToast({ tone: 'error', title: 'That didn\'t work', detail: e instanceof Error ? e.message : '', permissions: [], reason: 'error' });
    }
}

function startSuspend(row: ProfileRow) {
    menuFor.value = null;
    actionError.value = null;
    suspending.value = row;
}

async function doSuspend(options: { minutes?: number; untilUtc?: string }, reason: string) {
    if (!suspending.value) return;
    busy.value = true;
    actionError.value = null;
    try {
        const row = suspending.value;
        replaceRow(await profilesApi.suspend(row.userId, options, reason));
        done(`${row.name} is suspended`, 'Their open tabs locked straight away.');
        suspending.value = null;
    } catch (e) {
        actionError.value = e instanceof Error ? e.message : 'Could not suspend.';
    } finally {
        busy.value = false;
    }
}

function confirmAction(row: ProfileRow, kind: 'signout' | 'login-off') {
    menuFor.value = null;
    actionError.value = null;
    confirming.value = { row, kind };
}

const confirmTitle = computed(() => (confirming.value?.kind === 'signout' ? `Sign ${confirming.value.row.name} out everywhere?` : `Turn sign-in off for ${confirming.value?.row.name}?`));
const confirmText = computed(() => (confirming.value?.kind === 'signout'
    ? `All ${confirming.value.row.sessions} of their sessions end now; every open tab returns to the sign-in page. They can sign in again with their password.`
    : 'Every session ends now and they can\'t sign in again until you turn it back on. Their permissions are kept.'));
const confirmButton = computed(() => (confirming.value?.kind === 'signout' ? 'Sign out everywhere' : 'Turn sign-in off'));

async function runConfirmed() {
    const c = confirming.value;
    if (!c) return;
    busy.value = true;
    actionError.value = null;
    try {
        if (c.kind === 'signout') {
            const { revoked } = await profilesApi.revokeSessions(c.row.userId);
            done(`${c.row.name} was signed out`, `${revoked} session${revoked === 1 ? '' : 's'} ended.`);
        } else {
            replaceRow(await profilesApi.setLogin(c.row.userId, false));
            done(`Sign-in turned off for ${c.row.name}`);
        }
        confirming.value = null;
        void load();
    } catch (e) {
        actionError.value = e instanceof Error ? e.message : 'That didn\'t work.';
    } finally {
        busy.value = false;
    }
}

function closeMenu(event: MouseEvent) {
    if (!(event.target as HTMLElement | null)?.closest('.pc-menu')) menuFor.value = null;
}

function onVisibility() {
    if (document.visibilityState === 'visible') void load();
}

onMounted(() => {
    void load();
    poll = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 10_000);
    clock = window.setInterval(() => { now.value = Date.now(); }, 15_000);
    document.addEventListener('click', closeMenu);
    document.addEventListener('visibilitychange', onVisibility);
});

onBeforeUnmount(() => {
    window.clearInterval(poll);
    window.clearInterval(clock);
    document.removeEventListener('click', closeMenu);
    document.removeEventListener('visibilitychange', onVisibility);
});
</script>

<style scoped>
.pc-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (min-width: 980px) { .pc-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); } }

.pc-filters .ot-search { flex: 1 1 220px; max-width: 320px; }
.pc-filters .ot-segment { max-width: 100%; overflow-x: auto; scrollbar-width: none; }
.pc-count {
    margin-left: 5px;
    padding: 0 5px;
    border-radius: 999px;
    font-size: 10px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--ot-text-2);
}
.pc-sort { gap: 6px; }

.pc-list { display: flex; flex-direction: column; gap: 8px; }
.pc-skelrow { height: 68px; border-radius: var(--ot-radius); }

.pc-row {
    display: grid;
    grid-template-columns: auto minmax(180px, 1.4fr) minmax(160px, 1.2fr) repeat(3, minmax(74px, 0.5fr)) auto;
    align-items: center;
    gap: 16px;
    padding: 12px 14px;
    border-radius: var(--ot-radius);
    border: 1px solid var(--ot-line);
    background: var(--ot-surface);
    cursor: pointer;
    transition: border-color var(--ot-fast), background var(--ot-fast);
    position: relative;
}
.pc-row:hover { border-color: var(--ot-line-strong); background: var(--ot-surface-2); }
.pc-row.suspended { border-color: rgba(255, 123, 123, 0.32); }
.pc-row.disabled { opacity: 0.75; }

.pc-who { min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.pc-name { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
.pc-name strong { font-size: 14.5px; font-weight: 620; color: var(--ot-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-you { font-size: 10.5px; color: var(--ot-accent); border: 1px solid var(--ot-line-strong); border-radius: 999px; padding: 0 6px; }
.pc-flags { display: flex; gap: 5px; flex-wrap: wrap; }
.pc-flags:empty { display: none; }

.pc-where { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pc-where-main { font-size: 13px; color: var(--ot-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-where.online .pc-where-main { color: var(--ot-positive); }
.pc-where.idle .pc-where-main { color: var(--ot-warning); }
.pc-sub { font-size: 11.5px; color: var(--ot-muted); }

.pc-stat { display: flex; flex-direction: column; gap: 1px; text-align: right; }
.pc-stat-v { font-family: var(--ot-mono); font-size: 15px; font-weight: 600; color: var(--ot-text); white-space: nowrap; }
.pc-denied { font-style: normal; color: var(--ot-warning); font-size: 12px; }

.pc-menu { position: relative; display: flex; justify-content: flex-end; min-width: 34px; }
.pc-popover {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: var(--ot-z-popover);
    min-width: 220px;
    padding: 4px;
    border-radius: var(--ot-radius);
    border: 1px solid var(--ot-line-strong);
    background: var(--ot-surface-2);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
}
.pc-popover button, .pc-popover a {
    display: flex !important;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px !important;
    border: 0 !important;
    border-radius: 6px;
    background: none !important;
    color: var(--ot-text-2);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
}
.pc-popover button:hover:not(:disabled), .pc-popover a:hover { background: rgba(255, 255, 255, 0.05) !important; color: var(--ot-text); }
.pc-popover button:disabled { opacity: 0.4; cursor: not-allowed; }
.pc-popover .danger { color: #ffb4b4; }

.pc-link { color: var(--ot-accent); }
.pc-confirm { color: var(--ot-text-2); }
.pc-error { margin-top: 10px; color: var(--ot-negative); font-size: 12.5px; }

@media (max-width: 1100px) {
    .pc-row { grid-template-columns: auto minmax(0, 1fr) repeat(2, minmax(64px, auto)) auto; }
    .pc-where { grid-column: 2 / 3; grid-row: 2; }
    .pc-row > .pc-stat.devices { display: none; }
}
@media (max-width: 640px) {
    .pc-row { grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px 12px; }
    .pc-row > .pc-stat { display: none; }
    .pc-where { grid-column: 2 / 4; }
}
</style>
