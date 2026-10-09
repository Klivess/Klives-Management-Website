<template>
    <ProfilesShell :scope="profile?.name ?? ''" :scope-dot="presenceState === 'offline' ? '' : presenceState" :fresh-label="freshLabel"
                   :error="loadError" :loading="loading" refreshable @refresh="reloadAll">
        <template #crumb>
            <NuxtLink to="/administration/profiles" class="pd-back"><AccessIcon name="back" :size="14" /> All profiles</NuxtLink>
        </template>

        <OmniTraderStateBlock v-if="notFound" kind="empty" title="Profile not found" detail="It may have been deleted.">
            <NuxtLink class="ot-btn sm" to="/administration/profiles">Back to the directory</NuxtLink>
        </OmniTraderStateBlock>

        <div v-else-if="!profile" class="pd-loading" aria-busy="true">
            <div class="ot-skel" style="height: 96px"></div>
            <div class="ot-skel" style="height: 40px; width: 60%"></div>
            <div class="ot-skel" style="height: 260px"></div>
        </div>

        <template v-else>
            <!-- ── who, where, and the quick controls ── -->
            <header class="pd-hero">
                <ProfilesAvatar :name="profile.name" :id="profile.userId" :owner="profile.isOwner" :presence="presenceState" :size="64" />
                <div class="pd-ident">
                    <h1>
                        {{ profile.name }}
                        <span class="km-rank" :class="`r${profile.rankValue}`">{{ profile.isOwner ? 'Owner' : profile.rank }}</span>
                        <span v-if="profile.isYou" class="pd-you">you</span>
                    </h1>
                    <p class="pd-presence" :class="presenceState">
                        <span class="km-dot" :class="presenceState"></span>
                        <template v-if="presenceState !== 'offline'">{{ presenceText(presence, now) }}</template>
                        <template v-else>Offline · {{ profile.lastSeenUtc ? `last seen ${relTime(profile.lastSeenUtc, now)}` : 'never seen' }}</template>
                        <span v-if="live.connected.value" class="pd-live" title="Following live"><span class="pd-live-dot"></span>Live</span>
                    </p>
                    <div class="pd-flags">
                        <span v-if="profile.suspended" class="ot-chip bad">⏸ Suspended · lifts {{ untilTime(profile.suspendedUntilUtc, now) }}</span>
                        <span v-if="profile.readOnly" class="ot-chip info">◐ Read-only</span>
                        <span v-if="!profile.canLogin" class="ot-chip bad">⏻ Sign-in off</span>
                        <span v-if="profile.allowPasswordApiAccess" class="ot-chip warn" title="This profile's password also works as an API key">⌁ Password API access</span>
                        <span class="ot-chip">Created {{ profile.createdUtc ? relTime(profile.createdUtc, now) : '—' }}</span>
                    </div>
                </div>
                <div v-if="canControl" class="pd-actions">
                    <button v-if="!profile.suspended" type="button" class="ot-btn warn" @click="openSuspend"><AccessIcon name="pause" :size="15" /> Suspend…</button>
                    <button v-else type="button" class="ot-btn" :disabled="busy" @click="unsuspend"><AccessIcon name="bolt" :size="15" /> Lift suspension</button>
                    <label class="pd-switch">
                        <button type="button" class="km-switch" role="switch" :aria-checked="profile.readOnly" :disabled="busy" @click="setReadOnly(!profile.readOnly)"></button>
                        Read-only
                    </label>
                    <button type="button" class="ot-btn ghost" :disabled="busy || !profile.sessions" @click="confirm('signout')"><AccessIcon name="signout" :size="15" /> Sign out everywhere</button>
                </div>
            </header>

            <div v-if="profile.suspended" class="ot-banner" role="status">
                <span class="glyph" aria-hidden="true">⏸</span>
                <div>
                    <strong>Suspended until {{ fmtDateTime(profile.suspendedUntilUtc) }}</strong>
                    {{ profile.suspensionReason ? `“${profile.suspensionReason}”` : 'No reason given.' }} Every open tab shows them this and a countdown.
                </div>
                <div v-if="canControl" class="actions"><button class="ot-btn sm" :disabled="busy" @click="unsuspend">Lift now</button></div>
            </div>
            <div v-if="profile.isOwner && !profile.isYou" class="ot-banner ok" role="note">
                <span class="glyph" aria-hidden="true">★</span>
                <div><strong>The owner</strong> Klives holds every permission, and only Klives can change this profile.</div>
            </div>

            <!-- ── tabs ── -->
            <div class="pd-tabs ot-segment" role="tablist" aria-label="Profile sections">
                <button v-for="t in tabs" :key="t.key" type="button" role="tab" :aria-pressed="tab === t.key" :aria-selected="tab === t.key" @click="setTab(t.key)">
                    {{ t.label }}<span v-if="t.badge" class="pd-tab-badge">{{ t.badge }}</span>
                </button>
            </div>

            <!-- ═════════ Overview ═════════ -->
            <section v-if="tab === 'overview'" class="ot-stack">
                <div class="ot-kpis pd-kpis">
                    <OmniTraderKpi label="Requests · 24h" :value="fmtCount(profile.requests24h)" :spark="requestSpark" foot="all services" />
                    <OmniTraderKpi label="Refused · 24h" :value="fmtCount(profile.denied24h)" :tone="profile.denied24h ? 'warn' : ''"
                                   :foot="profile.denied24h ? 'see Activity for what' : 'nothing refused'" :attention-soft="profile.denied24h > 0" />
                    <OmniTraderKpi label="Pages · 24h" :value="summary24 ? fmtCount(summary24.pageViews) : '—'" :loading="canActivity && !summary24"
                                   :foot="summary24 ? `${summary24.distinctRoutes} distinct routes` : canActivity ? '' : 'needs activity access'" />
                    <OmniTraderKpi label="Devices" :value="String(profile.sessions)" :foot="presence?.connections ? `${presence.connections} tab${presence.connections === 1 ? '' : 's'} open now` : 'signed in'" />
                </div>

                <div class="ot-grid two">
                    <OmniTraderCard title="Right now" :subtitle="liveSubtitle">
                        <div class="pd-now" :class="presenceState">
                            <div class="pd-now-state">
                                <span class="pd-now-dot"></span>
                                <div>
                                    <strong>{{ presenceState === 'online' ? 'Online' : presenceState === 'idle' ? 'Idle' : 'Offline' }}</strong>
                                    <span v-if="presenceState !== 'offline' && presence?.currentTitle">on {{ presence.currentTitle }}</span>
                                    <span v-else-if="presenceState === 'offline'">{{ profile.lastSeenUtc ? `Last seen ${relTime(profile.lastSeenUtc, now)}` : 'Never seen online' }}</span>
                                </div>
                            </div>
                            <ul v-if="openTabs.length" class="pd-tablist">
                                <li v-for="(t, i) in openTabs" :key="i">
                                    <span class="km-dot" :class="t.visible ? 'online' : 'idle'"></span>
                                    <span class="pd-tab-title">{{ t.title || t.path }}</span>
                                    <code v-if="t.path">{{ t.path }}</code>
                                    <span class="pd-tab-meta">{{ [t.device, t.ip].filter(Boolean).join(' · ') }}</span>
                                </li>
                            </ul>
                        </div>
                    </OmniTraderCard>

                    <OmniTraderCard title="Requests by service" subtitle="Last 24 hours, per hour" :loading="canActivity && !summary24" :empty="!canActivity || !chart24"
                                    :empty-kind="canActivity ? 'empty' : 'nopermission'" :empty-title="canActivity ? 'No requests in 24 hours' : 'Needs “View profile activity”'">
                        <ApiTelemetryTelChart v-if="chart24" :t0="chart24.t0" :step="chart24.step" :series="chart24.series" stacked label="Requests by service" :height="150" />
                    </OmniTraderCard>
                </div>

                <div class="ot-grid two">
                    <OmniTraderCard title="Recent activity" :subtitle="live.connected.value ? 'Live' : 'Latest first'" :empty="canActivity && !recent.length && !recentLoading"
                                    empty-title="Nothing yet">
                        <AccessLocked v-if="!canActivity" perm="profiles.activity.read" compact />
                        <ProfilesActivityTimeline v-else :items="recent" :loading="recentLoading && !recent.length" :profile-id="profile.userId"
                                                  :fresh-keys="live.fresh.value" :title-of="titleOf" :show-ip="false" />
                        <template v-if="canActivity" #footer><button class="ot-btn ghost sm" @click="setTab('activity')">Open activity →</button></template>
                    </OmniTraderCard>

                    <OmniTraderCard title="Access" :subtitle="profile.isOwner ? 'Owner' : `${profile.grantCount} permission${profile.grantCount === 1 ? '' : 's'}`">
                        <p v-if="profile.isOwner" class="pd-muted">Holds every permission, current and future.</p>
                        <template v-else>
                            <ul v-if="accessByService.length" class="pd-svclist">
                                <li v-for="s in accessByService" :key="s.name">
                                    <span class="pd-svc">{{ s.name }}</span>
                                    <span class="pd-svc-tiers"><span v-for="t in s.tiers" :key="t" class="km-tier" :class="tierMeta(t).tone">{{ tierMeta(t).short }}</span></span>
                                    <span class="pd-svc-n">{{ s.count }}</span>
                                </li>
                            </ul>
                            <OmniTraderStateBlock v-else-if="profile.grants" title="No permissions" detail="This profile can sign in but can't open anything yet." compact />
                            <AccessLocked v-else perm="profiles.permissions.view" compact />
                            <p v-if="temporaryGrants.length" class="pd-temp">
                                ⏱ {{ temporaryGrants.length }} temporary:
                                <span v-for="g in temporaryGrants" :key="g.key" class="pd-temp-item">{{ g.title }} ({{ untilTime(g.expiresUtc, now) }})</span>
                            </p>
                            <p v-if="usage && usage.unusedFor30Days.length" class="pd-unused">
                                {{ usage.unusedFor30Days.length }} granted permission{{ usage.unusedFor30Days.length === 1 ? ' hasn\'t' : 's haven\'t' }} been used in 30 days.
                            </p>
                        </template>
                        <template v-if="canSeeGrants && !profile.isOwner" #footer><button class="ot-btn ghost sm" @click="setTab('access')">{{ canGrant ? 'Edit permissions →' : 'View permissions →' }}</button></template>
                    </OmniTraderCard>
                </div>
            </section>

            <!-- ═════════ Access ═════════ -->
            <section v-else-if="tab === 'access'" class="ot-stack">
                <OmniTraderStateBlock v-if="profile.isOwner" kind="ok" title="Klives holds every permission"
                                      detail="The owner can't be given or refused permissions — every current and future key is theirs." />
                <template v-else>
                    <div v-if="grantsError" class="ot-banner" role="alert">
                        <span class="glyph" aria-hidden="true">⚠</span>
                        <div><strong>Couldn't save</strong> {{ grantsError }}</div>
                        <div class="actions"><button class="ot-btn sm" @click="reloadGrants">Reload</button></div>
                    </div>
                    <div v-else-if="!canGrant" class="ot-banner info" role="note">
                        <span class="glyph" aria-hidden="true">ℹ</span>
                        <div v-if="!can('profiles.permissions.grant')"><strong>View only</strong> Changing permissions needs “Grant and revoke permissions”.</div>
                        <div v-else><strong>View only</strong> You can only change the permissions of profiles ranked below you.</div>
                    </div>
                    <div v-else-if="!isOwner" class="ot-banner info" role="note">
                        <span class="glyph" aria-hidden="true">ℹ</span>
                        <div>You can hand out permissions you hold yourself; the rest are locked.</div>
                    </div>
                    <div v-if="!catalog.catalog.value" class="ot-skel" style="height: 420px"></div>
                    <ProfilesPermissionEditor v-else v-model:grants="draft" :baseline="baseline" :catalog="catalog.catalog.value"
                                              :editable="canGrant" :saving="savingGrants" :actor-is-owner="isOwner" :actor-holds="actorHolds"
                                              :usage="usageMap" :copy-sources="copySources" @save="saveGrants" @discard="discardGrants" />
                </template>
            </section>

            <!-- ═════════ Activity ═════════ -->
            <section v-else-if="tab === 'activity'" class="ot-stack">
                <div class="ot-filterbar">
                    <div class="ot-segment sm" role="group" aria-label="Range">
                        <button v-for="r in RANGES" :key="r" type="button" :aria-pressed="range === r" @click="range = r">{{ r }}</button>
                    </div>
                    <div class="ot-segment sm" role="group" aria-label="Show">
                        <button v-for="t in TYPES" :key="t.key" type="button" :aria-pressed="types.includes(t.key)" @click="toggleType(t.key)">{{ t.label }}</button>
                    </div>
                    <select v-model="serviceFilter" class="ot-select auto" aria-label="Service">
                        <option value="">All services</option>
                        <option v-for="s in summary?.services ?? []" :key="s" :value="s">{{ s }}</option>
                    </select>
                    <label class="ot-check"><input v-model="deniedOnly" type="checkbox" /> Refused only</label>
                    <span class="grow"></span>
                    <label v-if="can('profiles.activity.live')" class="ot-check" title="Add new activity to the top as it happens">
                        <input v-model="liveTail" type="checkbox" /> Live
                        <span v-if="liveTail && live.connected.value" class="pd-live-dot"></span>
                    </label>
                </div>

                <div class="ot-kpis tight">
                    <OmniTraderKpi label="Requests" :value="summary ? fmtCount(summary.requests) : '—'" :loading="!summary" :foot="`last ${range}`" />
                    <OmniTraderKpi label="Refused" :value="summary ? fmtCount(summary.denied) : '—'" :loading="!summary" :tone="summary?.denied ? 'warn' : ''" foot="401 / 403" />
                    <OmniTraderKpi label="Errors" :value="summary ? fmtCount(summary.errors) : '—'" :loading="!summary" :tone="summary?.errors ? 'bad' : ''" foot="5xx answers" />
                    <OmniTraderKpi label="Pages viewed" :value="summary ? fmtCount(summary.pageViews) : '—'" :loading="!summary" :foot="summary ? `${summary.distinctRoutes} distinct routes` : ''" />
                    <OmniTraderKpi label="Active days" :value="summary ? String(summary.activeDays) : '—'" :loading="!summary" :foot="`in the last ${range}`" />
                </div>

                <OmniTraderCard title="Requests by service" :subtitle="range === '30d' ? 'Per day' : 'Per hour'" :loading="!summary" :empty="!!summary && !chartRange" empty-title="No requests in this range">
                    <ApiTelemetryTelChart v-if="chartRange" :t0="chartRange.t0" :step="chartRange.step" :series="chartRange.series" stacked label="Requests by service" :height="180" />
                </OmniTraderCard>

                <div class="ot-grid three">
                    <OmniTraderCard title="Most used permissions" :empty="!!summary && !topPermissions.length" empty-title="None used">
                        <OmniTraderBarList :items="topPermissions" :signed="false" :limit="8" />
                    </OmniTraderCard>
                    <OmniTraderCard title="Pages" subtitle="By time spent" :empty="!!summary && !topPages.length" empty-title="No page views">
                        <OmniTraderBarList :items="topPages" :signed="false" :limit="8" :format="(v: number) => durationShort(v)" />
                    </OmniTraderCard>
                    <OmniTraderCard title="Where from" subtitle="IP addresses" :empty="!!summary && !summary.ips.length" empty-title="No addresses" flush>
                        <table class="pd-ips">
                            <thead><tr><th>IP</th><th>Requests</th><th>Last</th></tr></thead>
                            <tbody>
                                <tr v-for="ip in summary?.ips ?? []" :key="ip.ip">
                                    <td><code>{{ ip.ip }}</code></td>
                                    <td>{{ fmtCount(ip.count) }}</td>
                                    <td>{{ relTime(ip.lastMs, now) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </OmniTraderCard>
                </div>

                <OmniTraderCard title="Timeline" :subtitle="timelineSubtitle">
                    <ProfilesActivityTimeline :items="timelineShown" :loading="timelineLoading" :has-more="timelineNext != null"
                                              :filtered="types.length < 3 || !!serviceFilter || deniedOnly" :profile-id="profile.userId"
                                              :fresh-keys="live.fresh.value" :title-of="titleOf" @more="loadTimeline(true)" />
                </OmniTraderCard>
            </section>

            <!-- ═════════ Sessions ═════════ -->
            <section v-else-if="tab === 'sessions'" class="ot-stack">
                <div class="pd-row-between">
                    <p class="pd-muted">Each signed-in device is a session. Signing one out ends it at once — its tabs go back to the sign-in page.</p>
                    <label class="ot-check"><input v-model="showEndedSessions" type="checkbox" @change="loadSessions" /> Show ended</label>
                </div>
                <ProfilesSessionsList :sessions="sessions" :can-revoke="canControl" :busy="busy" show-agent
                                      @revoke="revokeSession" @revoke-all="confirm('signout')" />
            </section>

            <!-- ═════════ Security ═════════ -->
            <section v-else-if="tab === 'security'" class="ot-stack">
                <div class="ot-grid two">
                    <OmniTraderCard v-if="canEdit" title="Identity" subtitle="Name, rank and Discord">
                        <form class="pd-form" @submit.prevent="saveIdentity">
                            <div class="ot-field">
                                <label for="pd-name">Name</label>
                                <input id="pd-name" v-model.trim="identity.name" class="ot-input" maxlength="48" required />
                            </div>
                            <div class="ot-field">
                                <label for="pd-rank">Rank</label>
                                <select id="pd-rank" v-model="identity.rank" class="ot-select" :disabled="profile.isOwner">
                                    <option v-if="!rankChoices.includes(profile.rank)" :value="profile.rank">{{ profile.rank }}</option>
                                    <option v-for="r in rankChoices" :key="r" :value="r">{{ r }}</option>
                                </select>
                                <span class="help">Rank only says who is above whom: people manage profiles ranked below them. It grants nothing by itself.</span>
                            </div>
                            <div class="ot-field">
                                <label for="pd-discord">Discord user ID</label>
                                <input id="pd-discord" v-model.trim="identity.discordId" class="ot-input mono" inputmode="numeric" placeholder="Optional" />
                            </div>
                            <p v-if="identityError" class="pd-error" role="alert">{{ identityError }}</p>
                            <div class="pd-form-actions"><button type="submit" class="ot-btn primary sm" :disabled="busy || !identityDirty">Save</button></div>
                        </form>
                    </OmniTraderCard>

                    <OmniTraderCard v-if="canControl" title="Sign-in" subtitle="Whether and how this profile can get in">
                        <div class="pd-toggle-row">
                            <div>
                                <strong>Can sign in</strong>
                                <p>Off signs out every session at once and refuses new sign-ins. Permissions are kept.</p>
                            </div>
                            <button type="button" class="km-switch danger-off" role="switch" :aria-checked="profile.canLogin" :disabled="busy"
                                    @click="profile.canLogin ? confirm('login-off') : setLogin(true)"></button>
                        </div>
                        <div class="pd-toggle-row">
                            <div>
                                <strong>Password works as an API key</strong>
                                <p>For scripts and devices that send the password instead of signing in. Off is safer.</p>
                            </div>
                            <button type="button" class="km-switch" role="switch" :aria-checked="profile.allowPasswordApiAccess" :disabled="busy"
                                    @click="setPasswordApi(!profile.allowPasswordApiAccess)"></button>
                        </div>
                    </OmniTraderCard>

                    <OmniTraderCard v-if="canReset" title="Password" subtitle="Reset it — the old one stops working at once">
                        <p class="pd-muted">A reset signs out every session. The new password is shown once, to you.</p>
                        <div class="pd-form-actions"><button type="button" class="ot-btn warn sm" @click="openReset"><AccessIcon name="key" :size="14" /> Reset password…</button></div>
                    </OmniTraderCard>

                    <OmniTraderCard v-if="canDelete" title="Delete profile" subtitle="Permanent" attention>
                        <p class="pd-muted">Deletes the profile and ends its sessions. Its activity history is kept.</p>
                        <div class="pd-form-actions"><button type="button" class="ot-btn danger sm" @click="openDelete"><AccessIcon name="trash" :size="14" /> Delete {{ profile.name }}…</button></div>
                    </OmniTraderCard>
                </div>

                <OmniTraderCard v-if="canActivity" title="Access history" subtitle="Changes to this profile and its sign-ins">
                    <ProfilesActivityTimeline :items="history" :loading="historyLoading" :has-more="historyNext != null" :profile-id="profile.userId"
                                              :title-of="titleOf" @more="loadHistory(true)" />
                </OmniTraderCard>
            </section>
        </template>

        <!-- ── dialogs ── -->
        <ProfilesSuspendDialog :open="suspendOpen" :name="profile?.name ?? ''" :busy="busy" :error="dialogError" @close="suspendOpen = false" @confirm="suspend" />

        <ProfilesModal :open="!!confirming" :title="confirmCopy.title" tone="danger" @close="confirming = null">
            <p class="pd-muted">{{ confirmCopy.text }}</p>
            <p v-if="dialogError" class="pd-error" role="alert">{{ dialogError }}</p>
            <template #footer>
                <button type="button" class="ot-btn ghost" @click="confirming = null">Cancel</button>
                <button type="button" class="ot-btn danger" :disabled="busy" @click="runConfirmed">{{ busy ? 'Working…' : confirmCopy.button }}</button>
            </template>
        </ProfilesModal>

        <ProfilesModal :open="resetOpen" :title="resetPassword ? 'New password' : `Reset ${profile?.name}'s password`" :tone="resetPassword ? '' : 'warn'" @close="closeReset">
            <template v-if="!resetPassword">
                <div class="ot-segment" role="group" aria-label="New password">
                    <button type="button" :aria-pressed="resetMode === 'generate'" @click="resetMode = 'generate'">Generate one</button>
                    <button type="button" :aria-pressed="resetMode === 'custom'" @click="resetMode = 'custom'">Choose one</button>
                </div>
                <div v-if="resetMode === 'custom'" class="ot-field pd-gap">
                    <label for="pd-newpw">New password</label>
                    <input id="pd-newpw" v-model="resetCustom" class="ot-input mono" type="text" autocomplete="off" minlength="8" />
                    <span class="help">At least 8 characters, and different from every other profile's.</span>
                </div>
                <p class="pd-muted pd-gap">Every session of {{ profile?.name }} ends now; they sign in again with the new password.</p>
                <p v-if="dialogError" class="pd-error" role="alert">{{ dialogError }}</p>
            </template>
            <template v-else>
                <p class="pd-muted">Give this to {{ profile?.name }} now — it won't be shown again.</p>
                <div class="pd-secret">
                    <code>{{ resetPassword }}</code>
                    <button type="button" class="ot-btn sm" @click="copy(resetPassword)"><AccessIcon :name="copied ? 'check' : 'copy'" :size="14" /> {{ copied ? 'Copied' : 'Copy' }}</button>
                </div>
            </template>
            <template #footer>
                <template v-if="!resetPassword">
                    <button type="button" class="ot-btn ghost" @click="closeReset">Cancel</button>
                    <button type="button" class="ot-btn warn" :disabled="busy || (resetMode === 'custom' && resetCustom.length < 8)" @click="doReset">{{ busy ? 'Resetting…' : 'Reset password' }}</button>
                </template>
                <button v-else type="button" class="ot-btn primary" @click="closeReset">Done</button>
            </template>
        </ProfilesModal>

        <ProfilesModal :open="deleteOpen" :title="`Delete ${profile?.name}?`" tone="danger" @close="deleteOpen = false">
            <p class="pd-muted">This can't be undone. Type <strong>{{ profile?.name }}</strong> to confirm.</p>
            <input v-model="deleteConfirm" class="ot-input pd-gap" :placeholder="profile?.name" aria-label="Type the profile name to confirm" autocomplete="off" />
            <p v-if="dialogError" class="pd-error" role="alert">{{ dialogError }}</p>
            <template #footer>
                <button type="button" class="ot-btn ghost" @click="deleteOpen = false">Cancel</button>
                <button type="button" class="ot-btn danger" :disabled="busy || deleteConfirm !== profile?.name" @click="doDelete">{{ busy ? 'Deleting…' : 'Delete profile' }}</button>
            </template>
        </ProfilesModal>
    </ProfilesShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { useAccess, usePermissionCatalog } from '~/composables/useAccess';
import { useProfileLiveFeed } from '~/composables/useProfileLiveFeed';
import { pushToast } from '~/scripts/accessState';
import type { TelSeries } from '~/scripts/apiTelemetryShared';
import {
    profilesApi, ProfilesApiError,
    type ActivitySummary, type GrantDraft, type PermissionUsagePayload, type ProfileListPayload, type ProfileRow,
    type SessionRow, type TimelineItem,
} from '~/scripts/profilesApi';
import { durationShort, fmtCount, fmtDateTime, presenceText, relTime, tierMeta, untilTime } from '~/scripts/profileFormat';

definePageMeta({ layout: 'navbar' });

type Tab = 'overview' | 'access' | 'activity' | 'sessions' | 'security';
const RANGES = ['24h', '7d', '30d'] as const;
const TYPES = [
    { key: 'request', label: 'Requests' },
    { key: 'page', label: 'Pages' },
    { key: 'event', label: 'Events' },
];

const route = useRoute();
const router = useRouter();
const { can, isOwner, grantedPermissions } = useAccess();
const catalog = usePermissionCatalog();

const id = computed(() => String(route.params.id ?? ''));
const profile = ref<ProfileRow | null>(null);
const notFound = ref(false);
const loadError = ref<string | null>(null);
const loading = ref(false);
const loadedAt = ref(0);
const now = ref(Date.now());
const busy = ref(false);
const dialogError = ref<string | null>(null);

// ── permissions for this view ──
const manageable = computed(() => profile.value?.manageable === true);
const canControl = computed(() => manageable.value && can('profiles.access.control'));
const canActivity = computed(() => can('profiles.activity.read'));
const canSeeGrants = computed(() => can('profiles.permissions.view'));
const canGrant = computed(() => manageable.value && can('profiles.permissions.grant'));
const canEdit = computed(() => can('profiles.lifecycle.edit') && (manageable.value || (isOwner.value && profile.value?.isYou === true)));
const canReset = computed(() => manageable.value && can('profiles.credentials.reset'));
const canDelete = computed(() => manageable.value && can('profiles.lifecycle.delete'));

// Permission edits in progress (declared before the tabs, which badge unsaved changes).
const baseline = ref<GrantDraft[]>([]);
const draft = ref<GrantDraft[]>([]);
const savingGrants = ref(false);
const grantsError = ref<string | null>(null);
const diffTotal = computed(() => {
    const before = new Map(baseline.value.map(g => [g.key, g.expiresUtc]));
    const after = new Map(draft.value.map(g => [g.key, g.expiresUtc]));
    let n = 0;
    for (const [k, v] of after) if (!before.has(k) || before.get(k) !== v) n++;
    for (const k of before.keys()) if (!after.has(k)) n++;
    return n;
});

const tabs = computed(() => {
    const list: { key: Tab; label: string; badge?: string | number }[] = [{ key: 'overview', label: 'Overview' }];
    if (canSeeGrants.value || profile.value?.isYou) list.push({ key: 'access', label: 'Access', badge: diffTotal.value ? `${diffTotal.value}*` : undefined });
    if (canActivity.value) list.push({ key: 'activity', label: 'Activity', badge: profile.value?.denied24h ? `${profile.value.denied24h}✕` : undefined });
    if (can('profiles.access.control')) list.push({ key: 'sessions', label: 'Sessions', badge: profile.value?.sessions || undefined });
    if (canEdit.value || canControl.value || canReset.value || canDelete.value || canActivity.value) list.push({ key: 'security', label: 'Security' });
    return list;
});
const tab = computed<Tab>(() => {
    const wanted = String(route.query.tab ?? 'overview') as Tab;
    return tabs.value.some(t => t.key === wanted) ? wanted : 'overview';
});
function setTab(next: Tab) {
    void router.replace({ query: { ...route.query, tab: next === 'overview' ? undefined : next } });
}

// ── live ──
const liveEnabled = computed(() => can('profiles.activity.live') && !!profile.value);
const live = useProfileLiveFeed(id, liveEnabled);
const presence = computed(() => live.presence.value ?? profile.value?.presence ?? null);
const presenceState = computed(() => presence.value?.state ?? 'offline');
const openTabs = computed(() => presence.value?.tabs ?? (sessions.value.flatMap(s => s.tabs.map(t => ({ ...t, device: s.label, ip: s.ip })))));
const liveSubtitle = computed(() => (live.connected.value ? 'Following live' : can('profiles.activity.live') ? 'Connecting…' : 'Refreshes every 20 seconds'));
const freshLabel = computed(() => (live.connected.value ? 'Live' : loadedAt.value ? `Updated ${relTime(loadedAt.value, now.value)}` : 'Loading…'));

// ── loading ──
async function loadProfile() {
    try {
        const row = await profilesApi.get(id.value);
        const accessChanged = profile.value?.accessVersion !== row.accessVersion;
        profile.value = row;
        notFound.value = false;
        loadError.value = null;
        loadedAt.value = Date.now();
        if (accessChanged && !diffTotal.value) resetGrantsFrom(row);
        syncIdentity(row);
    } catch (e) {
        if (e instanceof ProfilesApiError && e.status === 404) notFound.value = true;
        else loadError.value = e instanceof Error ? e.message : 'Could not load this profile.';
    }
}

const sessions = ref<SessionRow[]>([]);
const showEndedSessions = ref(false);
async function loadSessions() {
    if (!can('profiles.access.control')) return;
    try { sessions.value = await profilesApi.sessions(id.value, showEndedSessions.value); } catch { /* shown as empty */ }
}

const summary24 = ref<ActivitySummary | null>(null);
const summary = ref<ActivitySummary | null>(null);
const range = ref<'24h' | '7d' | '30d'>('24h');
async function loadSummaries() {
    if (!canActivity.value) return;
    try {
        summary24.value = await profilesApi.summary(id.value, '24h');
        if (range.value === '24h') summary.value = summary24.value;
    } catch { /* the cards say so */ }
}
async function loadRangeSummary() {
    if (!canActivity.value) return;
    summary.value = null;
    try { summary.value = range.value === '24h' && summary24.value ? summary24.value : await profilesApi.summary(id.value, range.value); } catch { /* empty */ }
}
watch(range, loadRangeSummary);

const usage = ref<PermissionUsagePayload | null>(null);
const usageMap = computed(() => (usage.value ? new Map(usage.value.permissions.map(u => [u.key, u])) : null));
async function loadUsage() {
    if (!canActivity.value) return;
    try { usage.value = await profilesApi.usage(id.value); } catch { /* optional */ }
}

const list = ref<ProfileListPayload | null>(null);
async function loadList() {
    try { list.value = await profilesApi.list(); } catch { /* copy-from just stays empty */ }
}
const copySources = computed(() => (list.value?.profiles ?? []).filter(p => p.userId !== id.value).map(p => ({ userId: p.userId, name: `${p.name} (${p.isOwner ? 'Owner' : p.rank})` })));
const rankChoices = computed(() => list.value?.assignableRanks ?? []);

// recent activity (overview) and the timeline (activity tab)
const recentBase = ref<TimelineItem[]>([]);
const recentLoading = ref(false);
async function loadRecent() {
    if (!canActivity.value) return;
    recentLoading.value = true;
    try { recentBase.value = (await profilesApi.activity(id.value, { limit: 12 })).items; } catch { /* empty */ } finally { recentLoading.value = false; }
}
const recent = computed(() => mergeItems(live.feed.value, recentBase.value).slice(0, 12));

const timeline = ref<TimelineItem[]>([]);
const timelineNext = ref<number | null>(null);
const timelineLoading = ref(false);
const types = ref<string[]>(['request', 'page', 'event']);
const serviceFilter = ref('');
const deniedOnly = ref(false);
const liveTail = ref(true);
async function loadTimeline(more = false) {
    if (!canActivity.value) return;
    timelineLoading.value = true;
    try {
        const page = await profilesApi.activity(id.value, {
            before: more ? timelineNext.value : null, limit: 60, types: types.value.length < 3 ? types.value : undefined,
            service: serviceFilter.value || null, denied: deniedOnly.value,
        });
        timeline.value = more ? [...timeline.value, ...page.items] : page.items;
        timelineNext.value = page.next;
    } catch { /* empty */ } finally { timelineLoading.value = false; }
}
watch([types, serviceFilter, deniedOnly], () => { void loadTimeline(); }, { deep: true });
function toggleType(key: string) {
    types.value = types.value.includes(key) ? (types.value.length > 1 ? types.value.filter(t => t !== key) : types.value) : [...types.value, key];
}
const liveMatches = (item: TimelineItem) => types.value.includes(item.type)
    && (!serviceFilter.value || item.service === serviceFilter.value)
    && (!deniedOnly.value || !!item.denyReason);
const timelineShown = computed(() => (liveTail.value ? mergeItems(live.feed.value.filter(liveMatches), timeline.value) : timeline.value));
const timelineSubtitle = computed(() => `${timelineShown.value.length} shown${liveTail.value && live.connected.value ? ' · live' : ''}`);

const history = ref<TimelineItem[]>([]);
const historyNext = ref<number | null>(null);
const historyLoading = ref(false);
async function loadHistory(more = false) {
    if (!canActivity.value) return;
    historyLoading.value = true;
    try {
        const page = await profilesApi.activity(id.value, { before: more ? historyNext.value : null, limit: 40, types: ['event'] });
        history.value = more ? [...history.value, ...page.items] : page.items;
        historyNext.value = page.next;
    } catch { /* empty */ } finally { historyLoading.value = false; }
}

function mergeItems(live: TimelineItem[], base: TimelineItem[]) {
    const seen = new Set<string>();
    const out: TimelineItem[] = [];
    for (const item of [...live, ...base]) {
        const key = `${item.type}:${item.tsMs}:${item.route ?? item.kind ?? item.page ?? ''}:${item.status ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out.sort((a, b) => b.tsMs - a.tsMs);
}

// An access change shows up live as an event: re-read the profile so the header is current.
let reloadDebounce: number | undefined;
watch(() => live.feed.value[0], item => {
    if (!item || item.type !== 'event') return;
    window.clearTimeout(reloadDebounce);
    reloadDebounce = window.setTimeout(() => { void loadProfile(); void loadSessions(); }, 400);
});

async function reloadAll() {
    loading.value = true;
    try {
        await loadProfile();
        await Promise.all([loadSessions(), loadSummaries(), loadRecent()]);
        if (tab.value === 'activity') await Promise.all([loadRangeSummary(), loadTimeline()]);
        if (tab.value === 'access') await loadUsage();
        if (tab.value === 'security') await loadHistory();
    } finally {
        loading.value = false;
    }
}

watch(tab, t => {
    if (t === 'activity' && !timeline.value.length) { void loadTimeline(); if (!summary.value) void loadRangeSummary(); }
    if (t === 'access') { void catalog.load(); if (!usage.value) void loadUsage(); if (!list.value && canGrant.value) void loadList(); }
    if (t === 'security') { if (!history.value.length) void loadHistory(); if (!list.value) void loadList(); }
    if (t === 'sessions') void loadSessions();
});

// ── charts ──
function chartFrom(s: ActivitySummary | null) {
    if (!s || !s.buckets.length || !s.requests) return null;
    const totals = s.services.map(svc => ({ svc, total: s.buckets.reduce((sum, b) => sum + (b.byService[svc] ?? 0), 0) }))
        .sort((a, b) => b.total - a.total);
    const top = totals.slice(0, 7).map(t => t.svc);
    const rest = totals.slice(7).map(t => t.svc);
    const series: TelSeries[] = top.map((svc, i) => ({
        key: svc, label: svc, kind: 'bar', color: `--tel-s${i + 1}`, values: s.buckets.map(b => b.byService[svc] ?? 0),
    }));
    if (rest.length) series.push({ key: 'other', label: 'Other', kind: 'bar', color: '--tel-s8', values: s.buckets.map(b => rest.reduce((sum, svc) => sum + (b.byService[svc] ?? 0), 0)) });
    return { t0: s.buckets[0].t, step: s.bucketMs, series };
}
const chart24 = computed(() => chartFrom(summary24.value));
const chartRange = computed(() => chartFrom(summary.value));
const requestSpark = computed(() => (summary24.value ? summary24.value.buckets.map(b => Object.values(b.byService).reduce((s, n) => s + n, 0)) : undefined));

const titleOf = (key: string) => catalog.describe(key).title;
const topPermissions = computed(() => (summary.value?.topPermissions ?? []).filter(p => p.key).map(p => ({
    key: p.key, label: titleOf(p.key), value: p.count, secondary: p.denied ? `${p.denied} refused` : undefined,
})));
const topPages = computed(() => (summary.value?.topPages ?? []).filter(p => p.key).map(p => ({
    key: p.key, label: p.key, value: p.denied, secondary: `${p.count} view${p.count === 1 ? '' : 's'}`,
})));

// ── access summary (overview) ──
const accessByService = computed(() => {
    const groups = new Map<string, { name: string; count: number; tiers: Set<number> }>();
    for (const g of profile.value?.grants ?? []) {
        if (!g.active) continue;
        const d = catalog.byKey.value.get(g.key);
        const name = d?.service ?? g.service ?? g.key.split('.')[0];
        const entry = groups.get(name) ?? { name, count: 0, tiers: new Set<number>() };
        entry.count++;
        if (d) entry.tiers.add(d.tierValue);
        groups.set(name, entry);
    }
    return [...groups.values()].sort((a, b) => b.count - a.count).map(g => ({ ...g, tiers: [...g.tiers].sort() }));
});
const temporaryGrants = computed(() => (profile.value?.grants ?? []).filter(g => g.active && g.expiresUtc));

// ── permission editing ──
const actorHolds = (key: string) => grantedPermissions.value.has(key);

function resetGrantsFrom(row: ProfileRow) {
    const active = (row.grants ?? []).filter(g => g.active).map(g => ({ key: g.key, expiresUtc: g.expiresUtc, note: g.note }));
    baseline.value = active;
    draft.value = active.map(g => ({ ...g }));
}
function discardGrants() {
    draft.value = baseline.value.map(g => ({ ...g }));
    grantsError.value = null;
}
async function reloadGrants() {
    grantsError.value = null;
    await loadProfile();
    if (profile.value) resetGrantsFrom(profile.value);
}
async function saveGrants() {
    if (!profile.value) return;
    savingGrants.value = true;
    grantsError.value = null;
    try {
        const result = await profilesApi.setPermissions(profile.value.userId, draft.value, profile.value.accessVersion);
        profile.value = { ...profile.value, ...result.profile };
        resetGrantsFrom(result.profile);
        const added = result.added?.length ?? 0;
        const removed = result.removed?.length ?? 0;
        pushToast({ tone: 'info', title: `${profile.value.name}'s permissions saved`, detail: `+${added} −${removed} — their open tabs updated straight away.`, permissions: [], reason: 'info' }, 4_000);
    } catch (e) {
        grantsError.value = e instanceof ProfilesApiError && e.status === 409
            ? 'Their access changed while you were editing. Reload to see the latest, then make your change again.'
            : e instanceof Error ? e.message : 'Could not save.';
    } finally {
        savingGrants.value = false;
    }
}

onBeforeRouteLeave(() => {
    if (diffTotal.value && !window.confirm('You have unsaved permission changes. Leave without saving?')) return false;
    return true;
});

// ── quick controls ──
function done(title: string, detail = '') {
    pushToast({ tone: 'info', title, detail, permissions: [], reason: 'info' }, 4_000);
}
async function mutate(work: () => Promise<ProfileRow | void>, message?: string, detail?: string) {
    busy.value = true;
    dialogError.value = null;
    try {
        const row = await work();
        if (row && profile.value) profile.value = { ...profile.value, ...row, requests24h: profile.value.requests24h, denied24h: profile.value.denied24h, lastSeenUtc: profile.value.lastSeenUtc, grants: row.grants ?? profile.value.grants };
        if (message) done(message, detail);
        return true;
    } catch (e) {
        dialogError.value = e instanceof Error ? e.message : 'That didn\'t work.';
        if (!(e instanceof ProfilesApiError && e.denied)) pushToast({ tone: 'error', title: 'That didn\'t work', detail: dialogError.value, permissions: [], reason: 'error' });
        return false;
    } finally {
        busy.value = false;
    }
}

const suspendOpen = ref(false);
function openSuspend() { dialogError.value = null; suspendOpen.value = true; }
async function suspend(options: { minutes?: number; untilUtc?: string }, reason: string) {
    if (await mutate(() => profilesApi.suspend(id.value, options, reason), `${profile.value?.name} is suspended`, 'Their open tabs locked straight away.')) suspendOpen.value = false;
}
const unsuspend = () => mutate(() => profilesApi.unsuspend(id.value), `${profile.value?.name} can use the site again`);
const setReadOnly = (enabled: boolean) => mutate(() => profilesApi.setReadOnly(id.value, enabled), enabled ? `${profile.value?.name} is read-only` : 'Read-only lifted');
const setLogin = (enabled: boolean) => mutate(() => profilesApi.setLogin(id.value, enabled), enabled ? `${profile.value?.name} can sign in again` : `Sign-in turned off for ${profile.value?.name}`);
const setPasswordApi = (enabled: boolean) => mutate(() => profilesApi.setPasswordApi(id.value, enabled), enabled ? 'Password API access on' : 'Password API access off');

async function revokeSession(sessionId: string) {
    if (await mutate(async () => { await profilesApi.revokeSessions(id.value, sessionId); }, 'Session signed out')) void loadSessions();
}

const confirming = ref<null | 'signout' | 'login-off'>(null);
function confirm(kind: 'signout' | 'login-off') { dialogError.value = null; confirming.value = kind; }
const confirmCopy = computed(() => confirming.value === 'login-off'
    ? { title: `Turn sign-in off for ${profile.value?.name}?`, text: 'Every session ends now and they can\'t sign in until you turn it back on. Their permissions are kept.', button: 'Turn sign-in off' }
    : { title: `Sign ${profile.value?.name} out everywhere?`, text: `All ${profile.value?.sessions ?? 0} sessions end now and their tabs go back to the sign-in page. They can sign in again with their password.`, button: 'Sign out everywhere' });
async function runConfirmed() {
    const kind = confirming.value;
    const ok = kind === 'login-off'
        ? await mutate(() => profilesApi.setLogin(id.value, false), `Sign-in turned off for ${profile.value?.name}`)
        : await mutate(async () => { const r = await profilesApi.revokeSessions(id.value); done(`${profile.value?.name} was signed out`, `${r.revoked} session${r.revoked === 1 ? '' : 's'} ended.`); });
    if (ok) {
        confirming.value = null;
        void loadSessions();
        void loadProfile();
    }
}

// identity
const identity = reactive({ name: '', rank: '', discordId: '' });
const identityError = ref<string | null>(null);
function syncIdentity(row: ProfileRow) {
    identity.name = row.name;
    identity.rank = row.rank;
    identity.discordId = row.discordId ?? '';
}
const identityDirty = computed(() => !!profile.value && (identity.name !== profile.value.name || identity.rank !== profile.value.rank || identity.discordId !== (profile.value.discordId ?? '')));
async function saveIdentity() {
    if (!profile.value) return;
    identityError.value = null;
    const body: { id: string; name?: string; rank?: string; discordId?: string } = { id: profile.value.userId };
    if (identity.name !== profile.value.name) body.name = identity.name;
    if (identity.rank !== profile.value.rank) body.rank = identity.rank;
    if (identity.discordId !== (profile.value.discordId ?? '')) body.discordId = identity.discordId;
    const ok = await mutate(() => profilesApi.update(body), 'Profile saved');
    if (!ok) identityError.value = dialogError.value;
    else if (profile.value) syncIdentity(profile.value);
}

// password reset
const resetOpen = ref(false);
const resetMode = ref<'generate' | 'custom'>('generate');
const resetCustom = ref('');
const resetPassword = ref('');
const copied = ref(false);
function openReset() { dialogError.value = null; resetMode.value = 'generate'; resetCustom.value = ''; resetPassword.value = ''; copied.value = false; resetOpen.value = true; }
function closeReset() { resetOpen.value = false; resetPassword.value = ''; resetCustom.value = ''; }
async function doReset() {
    busy.value = true;
    dialogError.value = null;
    try {
        const result = await profilesApi.resetPassword(id.value, resetMode.value === 'custom' ? resetCustom.value : undefined);
        if (result.password) resetPassword.value = result.password;
        else { closeReset(); done('Password reset', `${result.signedOutSessions} session${result.signedOutSessions === 1 ? '' : 's'} signed out.`); }
        void loadSessions();
    } catch (e) {
        dialogError.value = e instanceof Error ? e.message : 'Could not reset the password.';
    } finally {
        busy.value = false;
    }
}
async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); copied.value = true; setTimeout(() => { copied.value = false; }, 2_000); } catch { /* select it by hand */ }
}

// delete
const deleteOpen = ref(false);
const deleteConfirm = ref('');
function openDelete() { dialogError.value = null; deleteConfirm.value = ''; deleteOpen.value = true; }
async function doDelete() {
    if (!profile.value) return;
    busy.value = true;
    dialogError.value = null;
    try {
        await profilesApi.remove(profile.value.userId, deleteConfirm.value);
        done(`${profile.value.name} was deleted`);
        baseline.value = draft.value; // nothing to guard on the way out
        await router.replace('/administration/profiles');
    } catch (e) {
        dialogError.value = e instanceof Error ? e.message : 'Could not delete.';
    } finally {
        busy.value = false;
    }
}

// ── lifecycle ──
let poll: number | undefined;
let clock: number | undefined;
watch(id, () => {
    profile.value = null;
    timeline.value = [];
    history.value = [];
    usage.value = null;
    summary.value = null;
    summary24.value = null;
    void reloadAll();
});

onMounted(() => {
    void catalog.load();
    void reloadAll().then(() => {
        if (tab.value === 'access' && canGrant.value) void loadList();
        if (tab.value === 'security') void loadList();
    });
    poll = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        void loadProfile();
        if (!live.connected.value) void loadSessions();
    }, 20_000);
    clock = window.setInterval(() => { now.value = Date.now(); }, 10_000);
});

onBeforeUnmount(() => {
    window.clearInterval(poll);
    window.clearInterval(clock);
    window.clearTimeout(reloadDebounce);
});
</script>

<style scoped>
.pd-back { display: inline-flex; align-items: center; gap: 6px; }
.pd-loading { display: flex; flex-direction: column; gap: 12px; }

.pd-hero {
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
@media (max-width: 860px) {
    .pd-hero { grid-template-columns: auto minmax(0, 1fr); }
    .pd-actions { grid-column: 1 / -1; }
}
.pd-ident { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.pd-ident h1 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 24px; line-height: 30px; font-weight: 650; color: var(--ot-text); }
.pd-you { font-size: 11px; color: var(--ot-accent); border: 1px solid var(--ot-line-strong); border-radius: 999px; padding: 0 7px; font-weight: 500; }
.pd-presence { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--ot-text-2); flex-wrap: wrap; }
.pd-presence.online { color: var(--ot-positive); }
.pd-presence.idle { color: var(--ot-warning); }
.pd-live { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--ot-accent); border: 1px solid rgba(109, 220, 79, 0.35); border-radius: 999px; padding: 0 7px; }
.pd-live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ot-accent); animation: pd-pulse 1.6s ease infinite; display: inline-block; }
@keyframes pd-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
.pd-flags { display: flex; gap: 6px; flex-wrap: wrap; }
.pd-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.pd-switch { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ot-text-2); padding: 0 6px; }

.pd-tabs { margin-bottom: var(--ot-space-4); max-width: 100%; overflow-x: auto; scrollbar-width: none; }
.pd-tab-badge { margin-left: 6px; padding: 0 6px; border-radius: 999px; font-size: 10px; background: rgba(255, 255, 255, 0.08); color: var(--ot-text-2); }

.pd-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (min-width: 980px) { .pd-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); } }

.pd-now { display: flex; flex-direction: column; gap: 12px; }
.pd-now-state { display: flex; align-items: center; gap: 12px; }
.pd-now-state > div { display: flex; flex-direction: column; }
.pd-now-state strong { font-size: 18px; color: var(--ot-text); }
.pd-now-state span { color: var(--ot-text-2); font-size: 13px; }
.pd-now-dot { width: 14px; height: 14px; border-radius: 50%; background: #4a5547; flex: 0 0 auto; }
.pd-now.online .pd-now-dot { background: var(--ot-positive); box-shadow: 0 0 0 5px rgba(78, 201, 138, 0.15); animation: pd-pulse 2s ease infinite; }
.pd-now.idle .pd-now-dot { background: var(--ot-warning); }
.pd-tablist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.pd-tablist li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 4px 8px; align-items: center; padding: 8px 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.025); }
.pd-tab-title { color: var(--ot-text); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pd-tablist code { grid-column: 2; font-family: var(--ot-mono); font-size: 11px; color: var(--ot-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pd-tab-meta { grid-column: 3; grid-row: 1; font-size: 11px; color: var(--ot-muted); white-space: nowrap; }

.pd-svclist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.pd-svclist li { display: grid; grid-template-columns: minmax(0, 1fr) auto 32px; gap: 8px; align-items: center; font-size: 13px; padding: 4px 0; border-bottom: 1px solid var(--ot-line); }
.pd-svc { color: var(--ot-text-2); }
.pd-svc-tiers { display: inline-flex; gap: 3px; }
.pd-svc-n { text-align: right; font-family: var(--ot-mono); color: var(--ot-text); }
.pd-temp, .pd-unused { margin-top: 10px; font-size: 12.5px; color: var(--ot-violet); display: flex; flex-wrap: wrap; gap: 6px; }
.pd-unused { color: var(--ot-warning); }
.pd-temp-item { color: var(--ot-text-2); }
.pd-muted { color: var(--ot-text-2); font-size: 13px; }
.pd-row-between { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }

.pd-ips { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.pd-ips th { text-align: left; font-size: 11px; color: var(--ot-muted); font-weight: 600; padding: 8px 12px; border-bottom: 1px solid var(--ot-line); }
.pd-ips td { padding: 7px 12px; border-bottom: 1px solid var(--ot-line); color: var(--ot-text-2); }
.pd-ips code { font-family: var(--ot-mono); color: var(--ot-text); }

.pd-form { display: flex; flex-direction: column; gap: 12px; }
.pd-form .ot-field label { font-size: 12px; font-weight: 600; color: var(--ot-text-2); }
.pd-form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.pd-toggle-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--ot-line); }
.pd-toggle-row:last-child { border-bottom: 0; }
.pd-toggle-row strong { color: var(--ot-text); font-size: 13.5px; font-weight: 600; }
.pd-toggle-row p { color: var(--ot-muted); font-size: 12px; margin-top: 2px; }
.km-switch.danger-off[aria-checked='false'] { background: var(--ot-negative-soft); border-color: rgba(255, 123, 123, 0.5); }
.pd-error { color: var(--ot-negative); font-size: 12.5px; margin-top: 8px; }
.pd-gap { margin-top: 12px; }
.pd-secret { margin-top: 12px; display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: var(--ot-radius); border: 1px solid var(--ot-line-strong); background: rgba(5, 7, 4, 0.5); }
.pd-secret code { flex: 1 1 auto; font-family: var(--ot-mono); font-size: 16px; color: var(--ot-accent); letter-spacing: 0.5px; overflow-wrap: anywhere; user-select: all; }
</style>
