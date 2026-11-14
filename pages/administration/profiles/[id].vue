<template>
  <div class="pfx" data-testid="pfx-profile">
    <!-- ── bar ── -->
    <header class="pfx-bar">
      <NuxtLink to="/administration/profiles" class="pfx-bar__crumb" data-testid="pfx-back"><PeopleIcon name="arrow-left" />Profiles</NuxtLink>
      <div v-if="profile" class="pfx-bar__id">
        <PeopleAvatar :name="profile.name" :id="profile.userId" :owner="profile.isOwner" :presence="presenceState" :size="26" />
        <span class="pfx-bar__title">{{ profile.name }}</span>
        <span class="pfx-bar__sub">{{ profile.isOwner ? 'Owner' : profile.rank }}</span>
      </div>
      <button class="pfx-search" aria-label="Find a profile or run an action" aria-keyshortcuts="Control+K" @click="openPalette">
        <PeopleIcon name="search" />
        <span class="pfx-search__text">Jump to someone, or act on {{ profile?.name ?? 'this profile' }}…</span>
        <span class="pfx-kbd">Ctrl</span><span class="pfx-kbd">K</span>
      </button>
      <span class="pfx-bar__spacer"></span>
      <div class="pfx-bar__actions">
        <span class="pfx-live" :data-state="live.connected.value ? 'live' : 'idle'" :data-tone="live.connected.value ? 'ok' : 'neutral'" :title="liveTitle" data-testid="pfx-live">
          <span class="pfx-live__dot"></span><span>{{ live.connected.value ? 'Live' : freshLabel }}</span>
        </span>
        <button class="pfx-iconbtn" title="Refresh now" aria-label="Refresh now" @click="reloadAll"><PeopleIcon name="refresh" :class="{ 'pfx-spin': loading }" /></button>
      </div>
    </header>

    <div class="pfx-main">
      <div v-if="notFound" class="pfx-card"><div class="pfx-empty" style="min-height: 200px"><PeopleIcon name="user-x" />This profile doesn't exist (any more).<NuxtLink class="pfx-btn pfx-btn--sm" to="/administration/profiles">Back to the directory</NuxtLink></div></div>
      <div v-else-if="loadError && !profile" class="pfx-banner" data-tone="crit" role="alert"><PeopleIcon name="octagon-x" /><div><strong>Couldn't load this profile</strong>{{ loadError }}</div><div class="pfx-banner__actions"><button class="pfx-btn pfx-btn--sm" @click="reloadAll">Try again</button></div></div>
      <template v-else-if="!profile">
        <div class="pfx-skel" style="height: 104px"></div>
        <div class="pfx-skel" style="height: 36px; width: 420px; max-width: 100%"></div>
        <div class="pfx-skel" style="height: 280px"></div>
      </template>

      <template v-else>
        <!-- ── who, where, and the quick controls ── -->
        <header class="pfx-hero">
          <PeopleAvatar :name="profile.name" :id="profile.userId" :owner="profile.isOwner" :presence="presenceState" :size="58" />
          <div style="min-width: 0">
            <h1 class="pfx-hero__name">
              <span data-testid="pfx-name">{{ profile.name }}</span>
              <span class="pfx-rank" :data-rank="profile.rankValue">{{ profile.isOwner ? 'Owner' : profile.rank }}</span>
              <span v-if="profile.isYou" class="pfx-you">you</span>
            </h1>
            <p class="pfx-hero__line" :data-presence="presenceState" data-testid="pfx-presence">
              <span class="pfx-dot" :data-presence="presenceState"></span>
              <template v-if="presenceState !== 'offline'">{{ presenceText(presence, now) }}<span class="pfx-dim">· {{ presence?.connections ?? 0 }} tab{{ presence?.connections === 1 ? '' : 's' }}</span></template>
              <template v-else>Offline · {{ lastSeenText(profile, insights, now).replace('Last seen', 'last seen') }}</template>
              <span v-if="profile.lastLoginUtc" class="pfx-dim">· signed in {{ relTime(profile.lastLoginUtc, now) }}</span>
            </p>
            <div class="pfx-hero__flags">
              <span v-if="profile.suspended" class="pfx-chip" data-tone="crit"><PeopleIcon name="pause" />Suspended · lifts {{ untilTime(profile.suspendedUntilUtc, now) }}</span>
              <span v-if="!profile.canLogin" class="pfx-chip" data-tone="crit"><PeopleIcon name="power" />Sign-in off</span>
              <span v-if="profile.readOnly" class="pfx-chip" data-tone="info"><PeopleIcon name="eye" />Read-only</span>
              <span v-if="profile.allowPasswordApiAccess" class="pfx-chip" data-tone="warn" title="This profile's password also works as an API key"><PeopleIcon name="key" />Password API access</span>
              <span v-if="temporaryGrants.length" class="pfx-chip" data-tone="violet"><PeopleIcon name="clock" />{{ temporaryGrants.length }} temporary</span>
              <span class="pfx-chip">Created {{ profile.createdUtc ? relTime(profile.createdUtc, now) : '—' }}</span>
            </div>
          </div>
          <div v-if="canControl" class="pfx-hero__acts">
            <button v-if="!profile.suspended" class="pfx-btn pfx-btn--warn" :disabled="!!busy" data-testid="pfx-suspend-open" @click="suspendOpen = true"><PeopleIcon name="pause" />Suspend…</button>
            <button v-else class="pfx-btn" :disabled="!!busy" @click="act(actions.unsuspend(profile))"><PeopleIcon name="play" />Lift suspension</button>
            <label class="pfx-hero__switch">
              <button class="pfx-switch" role="switch" :aria-checked="profile.readOnly" aria-label="Read-only" :disabled="!!busy" @click="act(actions.setReadOnly(profile, !profile.readOnly))"></button>Read-only
            </label>
            <button class="pfx-btn pfx-btn--ghost" :disabled="!!busy || !profile.sessions" @click="confirming = 'signout'"><PeopleIcon name="signout" />Sign out everywhere</button>
          </div>
        </header>

        <div v-if="profile.suspended" class="pfx-banner" data-tone="crit" role="status">
          <PeopleIcon name="pause" />
          <div><strong>Suspended until {{ fmtDateTime(profile.suspendedUntilUtc) }}</strong>{{ profile.suspensionReason ? `“${profile.suspensionReason}”` : 'No reason given.' }} Every open tab of theirs shows this and a countdown.</div>
          <div v-if="canControl" class="pfx-banner__actions"><button class="pfx-btn pfx-btn--sm" :disabled="!!busy" @click="act(actions.unsuspend(profile))">Lift now</button></div>
        </div>
        <div v-if="profile.isOwner && !profile.isYou" class="pfx-banner" data-tone="violet" role="note">
          <PeopleIcon name="star" /><div><strong>The owner</strong>Klives holds every permission, and only Klives can change this profile.</div>
        </div>

        <!-- ── tabs ── -->
        <nav class="pfx-tabs" role="tablist" aria-label="Profile sections">
          <button v-for="(t, i) in tabs" :key="t.key" class="pfx-tab" role="tab" :aria-selected="tab === t.key" :title="`${t.label} (${i + 1})`" :data-testid="`tab-${t.key}`" @click="setTab(t.key)">
            <PeopleIcon :name="t.icon" />{{ t.label }}<span v-if="t.badge" class="pfx-tab__badge" :data-tone="t.tone">{{ t.badge }}</span>
          </button>
        </nav>

        <!-- ═════════ Overview ═════════ -->
        <section v-if="tab === 'overview'" class="pfx-stack">
          <div class="pfx-kpis pfx-kpis--5">
            <PeopleKpi label="Requests" icon="route" unit="24 h" :value="fmtCount(profile.requests24h)" :tone="profile.denied24h ? 'warn' : ''" :state="profile.denied24h ? `${profile.denied24h} refused` : ''">
              <template #sub>{{ summary24 ? `${summary24.distinctRoutes} routes · ${summary24.pageViews} page views` : canActivity ? '' : 'all services' }}</template>
              <PeopleSpark v-if="hourly.length" :values="hourly" :tone="profile.denied24h ? 'warn' : 'violet'" />
            </PeopleKpi>
            <PeopleKpi label="Permissions" icon="layers" :value="profile.isOwner ? 'All' : usageRow ? `${usageRow.used}/${usageRow.held}` : String(profile.grantCount)" :tone="unusedKeys.length >= 5 ? 'warn' : ''" :clickable="canSeeGrants" @open="setTab('access')">
              <template #sub>
                <template v-if="profile.isOwner">every permission, now and later</template>
                <template v-else-if="usageRow">used in 30 days · <b>{{ unusedKeys.length }}</b> unused</template>
                <template v-else>{{ temporaryGrants.length ? `${temporaryGrants.length} temporary` : 'held' }}</template>
              </template>
              <span v-if="usageRow && !profile.isOwner" class="pfx-meter" :data-tone="unusedKeys.length >= 5 ? 'warn' : 'violet'" style="display: block; margin-top: 12px"><span :style="{ width: `${usageRow.held ? (usageRow.used / usageRow.held) * 100 : 0}%` }"></span></span>
            </PeopleKpi>
            <PeopleKpi label="Devices" icon="device" :value="String(profile.sessions)" :tone="idleSessions.length ? 'warn' : ''" :state="idleSessions.length ? `${idleSessions.length} idle` : ''" :clickable="canSeeDevices" @open="setTab('devices')">
              <template #sub>{{ presence?.connections ? `${presence.connections} tab${presence.connections === 1 ? '' : 's'} open now` : 'signed in' }}</template>
            </PeopleKpi>
            <PeopleKpi label="Signs in with" icon="key" :value="auth ? (auth.password7d && !auth.session7d ? 'Password' : auth.password7d ? 'Both' : auth.session7d ? 'Sessions' : '—') : '—'" :tone="auth && auth.password7d && !auth.passwordApiAllowed ? 'warn' : ''">
              <template #sub>
                <template v-if="auth">7 days: {{ fmtCount(auth.session7d) }} session · {{ fmtCount(auth.password7d) }} password</template>
                <template v-else>needs activity access</template>
              </template>
            </PeopleKpi>
            <PeopleKpi label="Active days" icon="clock" :value="summary30 ? String(summary30.activeDays) : canActivity ? null : '—'" unit="of 30">
              <template #sub>{{ summary30 ? `${fmtCount(summary30.requests)} requests in 30 days` : canActivity ? '' : 'needs activity access' }}</template>
            </PeopleKpi>
          </div>

          <div class="pfx-grid-main">
            <div class="pfx-stack">
              <section class="pfx-card" aria-label="Requests by service">
                <header class="pfx-card__head"><h2 class="pfx-card__title"><PeopleIcon name="activity" />Requests by service</h2><span class="pfx-card__meta">last 24 hours, per hour</span></header>
                <div class="pfx-card__body">
                  <PeopleLocked v-if="!canActivity" perm="profiles.activity.read" />
                  <div v-else-if="!summary24" class="pfx-skel" style="height: 150px"></div>
                  <PeopleStackChart v-else-if="chart24" :t0="chart24.t0" :step="chart24.step" :series="chart24.series" />
                  <div v-else class="pfx-empty">No requests in 24 hours.</div>
                </div>
              </section>
              <section class="pfx-card" aria-label="Recent activity">
                <header class="pfx-card__head">
                  <h2 class="pfx-card__title"><PeopleIcon name="history" />Recent activity</h2>
                  <span class="pfx-card__meta">{{ live.connected.value ? 'live' : 'latest first' }}</span>
                  <div class="pfx-card__tools"><button v-if="canActivity" class="pfx-btn pfx-btn--xs pfx-btn--ghost" @click="setTab('activity')">All activity →</button></div>
                </header>
                <div class="pfx-card__body">
                  <PeopleLocked v-if="!canActivity" perm="profiles.activity.read" />
                  <PeopleTimeline v-else :items="recent" :loading="recentLoading" :profile-id="profile.userId" :fresh-keys="live.fresh.value" :title-of="titleOf" :show-ip="false" testid="pfx-recent" />
                </div>
              </section>
            </div>
            <div class="pfx-stack">
              <section class="pfx-card" aria-label="Right now">
                <header class="pfx-card__head"><h2 class="pfx-card__title"><PeopleIcon name="eye" />Right now</h2><span class="pfx-card__meta">{{ liveTitle }}</span></header>
                <div class="pfx-card__body">
                  <ul v-if="openTabs.length" class="pfx-device__tabs" style="gap: 6px">
                    <li v-for="(t, i) in openTabs" :key="i" style="display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px">
                      <span class="pfx-dot" :data-presence="t.visible ? 'online' : 'idle'"></span>
                      <span class="pfx-truncate">{{ t.title || t.path }} <code class="pfx-mono pfx-faint">{{ t.path }}</code></span>
                      <span class="pfx-dim">{{ [t.device, t.ip].filter(Boolean).join(' · ') }}</span>
                    </li>
                  </ul>
                  <p v-else class="pfx-dim">{{ presenceState === 'offline' ? lastSeenText(profile, insights, now) : 'No open tabs reported.' }}</p>
                </div>
              </section>
              <section class="pfx-card" aria-label="Access at a glance">
                <header class="pfx-card__head">
                  <h2 class="pfx-card__title"><PeopleIcon name="layers" />Access</h2>
                  <span class="pfx-card__meta">{{ profile.isOwner ? 'owner' : `${profile.grantCount} permission${profile.grantCount === 1 ? '' : 's'}` }}</span>
                  <div class="pfx-card__tools"><button v-if="canSeeGrants && !profile.isOwner" class="pfx-btn pfx-btn--xs pfx-btn--ghost" @click="setTab('access')">{{ canGrant ? 'Edit' : 'View' }} →</button></div>
                </header>
                <div class="pfx-card__body">
                  <p v-if="profile.isOwner" class="pfx-dim">Holds every permission, current and future.</p>
                  <template v-else-if="profile.grants">
                    <div v-for="s in accessByService" :key="s.name" class="pfx-svc">
                      <span class="pfx-svc__name">{{ s.name }}</span>
                      <span class="pfx-svc__pips" :title="s.tiers.map(t => TIER_NAMES[t]).join(', ')"><i v-for="t in [1, 2, 3, 4, 5]" :key="t" :data-tier="s.tiers.includes(t) ? t : undefined"></i></span>
                      <span class="pfx-svc__n">{{ s.count }}<small v-if="s.unused"> · {{ s.unused }}↓</small></span>
                    </div>
                    <div v-if="!accessByService.length" class="pfx-empty">Can sign in, but holds no permissions.</div>
                    <p v-if="unusedKeys.length" class="pfx-help" style="margin-top: 8px; color: var(--pfx-warn)">↓ {{ unusedKeys.length }} held permission{{ unusedKeys.length === 1 ? '' : 's' }} unused for 30 days.</p>
                  </template>
                  <PeopleLocked v-else perm="profiles.permissions.view" />
                </div>
              </section>
            </div>
          </div>
        </section>

        <!-- ═════════ Access ═════════ -->
        <section v-else-if="tab === 'access'" class="pfx-stack">
          <div v-if="profile.isOwner" class="pfx-card"><div class="pfx-empty" style="min-height: 140px"><PeopleIcon name="star" />Klives holds every permission, current and future. The owner can't be given or refused one.</div></div>
          <template v-else>
            <div v-if="grantsError" class="pfx-banner" data-tone="crit" role="alert"><PeopleIcon name="alert" /><div><strong>Couldn't save</strong>{{ grantsError }}</div><div class="pfx-banner__actions"><button class="pfx-btn pfx-btn--sm" @click="reloadGrants">Reload</button></div></div>
            <div v-else-if="!canGrant" class="pfx-banner" role="note"><PeopleIcon name="info" /><div><strong>View only</strong>{{ can('profiles.permissions.grant') ? 'You can only change the permissions of profiles ranked below you.' : 'Changing permissions needs “Grant and revoke permissions”.' }}</div></div>
            <div v-else-if="!isOwner" class="pfx-banner" role="note"><PeopleIcon name="info" /><div>You can hand out permissions you hold yourself; the rest are locked.</div></div>
            <div v-if="!catalog.catalog.value" class="pfx-skel" style="height: 420px"></div>
            <PeopleAccessEditor
              v-else
              v-model:grants="draft"
              :baseline="baseline"
              :catalog="catalog.catalog.value"
              :editable="canGrant"
              :saving="savingGrants"
              :actor-is-owner="isOwner"
              :actor-holds="actorHolds"
              :usage="usageMap"
              :unused="usageRow ? unusedKeys : null"
              :copy-sources="copySources"
              :focus-service="focusService"
              @save="saveGrants"
              @discard="discardGrants"
            />
          </template>
        </section>

        <!-- ═════════ Activity ═════════ -->
        <section v-else-if="tab === 'activity'" class="pfx-stack">
          <div class="pfx-toolbar">
            <div class="pfx-seg" role="group" aria-label="Range">
              <button v-for="r in RANGES" :key="r" class="pfx-seg__opt" :aria-pressed="range === r" @click="range = r">{{ r }}</button>
            </div>
            <div class="pfx-seg" role="group" aria-label="Show">
              <button v-for="t in TYPES" :key="t.key" class="pfx-seg__opt" :aria-pressed="types.includes(t.key)" @click="toggleType(t.key)">{{ t.label }}</button>
            </div>
            <select v-model="serviceFilter" class="pfx-select pfx-select--sm" aria-label="Service">
              <option value="">All services</option>
              <option v-for="s in summary?.services ?? []" :key="s" :value="s">{{ s }}</option>
            </select>
            <label class="pfx-check"><input v-model="deniedOnly" type="checkbox" />Refused only</label>
            <span class="pfx-toolbar__grow"></span>
            <label v-if="can('profiles.activity.live')" class="pfx-check" title="Add new activity to the top as it happens"><input v-model="liveTail" type="checkbox" />Live</label>
          </div>

          <div class="pfx-kpis pfx-kpis--6">
            <PeopleKpi label="Requests" icon="route" :value="summary ? fmtCount(summary.requests) : null"><template #sub>last {{ range }}</template></PeopleKpi>
            <PeopleKpi label="Refused" icon="ban" :value="summary ? fmtCount(summary.denied) : null" :tone="summary?.denied ? 'warn' : ''"><template #sub>401 / 403</template></PeopleKpi>
            <PeopleKpi label="Errors" icon="alert" :value="summary ? fmtCount(summary.errors) : null" :tone="summary?.errors ? 'crit' : ''"><template #sub>5xx answers</template></PeopleKpi>
            <PeopleKpi label="By password" icon="key" :value="summary ? (summary.passwordRequests != null ? fmtCount(summary.passwordRequests) : '—') : null"><template #sub>no session</template></PeopleKpi>
            <PeopleKpi label="Pages viewed" icon="eye" :value="summary ? fmtCount(summary.pageViews) : null"><template #sub>{{ summary ? `${summary.distinctRoutes} distinct routes` : '' }}</template></PeopleKpi>
            <PeopleKpi label="Active days" icon="clock" :value="summary ? String(summary.activeDays) : null"><template #sub>in the last {{ range }}</template></PeopleKpi>
          </div>

          <section class="pfx-card" aria-label="Requests by service">
            <header class="pfx-card__head"><h2 class="pfx-card__title"><PeopleIcon name="activity" />Requests by service</h2><span class="pfx-card__meta">{{ range === '30d' ? 'per day' : 'per hour' }}{{ summary?.source === 'rows' ? ' · summaries are being prepared, this read was slow' : '' }}</span></header>
            <div class="pfx-card__body">
              <div v-if="!summary" class="pfx-skel" style="height: 180px"></div>
              <PeopleStackChart v-else-if="chartRange" :t0="chartRange.t0" :step="chartRange.step" :series="chartRange.series" :height="180" />
              <div v-else class="pfx-empty">No requests in this range.</div>
            </div>
          </section>

          <div class="pfx-grid3">
            <section class="pfx-card"><header class="pfx-card__head"><h2 class="pfx-card__title"><PeopleIcon name="layers" />Most used permissions</h2></header>
              <div class="pfx-card__body"><PeopleBars :items="topPermissions" empty="None used." /></div></section>
            <section class="pfx-card"><header class="pfx-card__head"><h2 class="pfx-card__title"><PeopleIcon name="route" />Busiest routes</h2></header>
              <div class="pfx-card__body"><PeopleBars :items="topRoutes" tone="info" :empty="summary && !summary.topRoutes ? 'Needs the newer server.' : 'No requests.'" /></div></section>
            <section class="pfx-card"><header class="pfx-card__head"><h2 class="pfx-card__title"><PeopleIcon name="eye" />Pages</h2><span class="pfx-card__meta">by time spent</span></header>
              <div class="pfx-card__body"><PeopleBars :items="topPages" tone="ok" :format="v => durationShort(v)" empty="No page views." /></div></section>
          </div>

          <div class="pfx-grid-main">
            <section class="pfx-card" aria-label="Timeline">
              <header class="pfx-card__head"><h2 class="pfx-card__title"><PeopleIcon name="history" />Timeline</h2><span class="pfx-card__meta">{{ timelineShown.length }} shown{{ liveTail && live.connected.value ? ' · live' : '' }}</span></header>
              <div class="pfx-card__body">
                <PeopleTimeline :items="timelineShown" :loading="timelineLoading" :has-more="timelineNext != null" :filtered="types.length < 3 || !!serviceFilter || deniedOnly"
                                :profile-id="profile.userId" :fresh-keys="live.fresh.value" :title-of="titleOf" testid="pfx-timeline" @more="loadTimeline(true)" />
              </div>
            </section>
            <section class="pfx-card" aria-label="Where from">
              <header class="pfx-card__head"><h2 class="pfx-card__title"><PeopleIcon name="globe" />Where from</h2><span class="pfx-card__meta">addresses, latest first</span></header>
              <div class="pfx-card__body">
                <div v-for="ip in summary?.ips ?? []" :key="ip.ip" class="pfx-svc" style="grid-template-columns: minmax(0, 1fr) auto auto">
                  <code class="pfx-mono pfx-truncate">{{ ip.ip }}</code>
                  <span class="pfx-num">{{ fmtCount(ip.count) }}</span>
                  <span class="pfx-dim">{{ relTime(ip.lastMs, now) }}</span>
                </div>
                <div v-if="summary && !summary.ips.length" class="pfx-empty">No addresses.</div>
              </div>
            </section>
          </div>
        </section>

        <!-- ═════════ Devices ═════════ -->
        <section v-else-if="tab === 'devices'" class="pfx-card" aria-label="Devices">
          <header class="pfx-card__head">
            <h2 class="pfx-card__title"><PeopleIcon name="device" />Signed-in devices</h2>
            <span class="pfx-card__meta">{{ activeSessions.length }} active{{ idleSessions.length ? ` · ${idleSessions.length} unused for ${IDLE_DAYS}+ days` : '' }}</span>
            <div class="pfx-card__tools">
              <label class="pfx-check"><input v-model="showEndedSessions" type="checkbox" @change="loadSessions" />Show ended</label>
              <button v-if="(canControl || profile.isYou) && idleSessions.length" class="pfx-btn pfx-btn--sm pfx-btn--warn" :disabled="!!busy" data-testid="pfx-signout-idle" @click="signOutIdle">
                <PeopleIcon name="clock" />Sign out {{ idleSessions.length }} idle
              </button>
              <button v-if="canControl" class="pfx-btn pfx-btn--sm pfx-btn--danger" :disabled="!!busy || !activeSessions.length" @click="confirming = 'signout'"><PeopleIcon name="signout" />Sign out everywhere</button>
            </div>
          </header>
          <div class="pfx-card__body">
            <p class="pfx-help" style="margin: 0 0 6px">Each signed-in device is a session that lasts 30 days after it was last used. Signing one out ends it at once; its tabs go back to the sign-in page.</p>
            <PeopleDevices :sessions="sessions" :can-revoke="canControl || profile.isYou" :busy="!!busy" show-agent :now="now" testid="pfx-devices" @revoke="revokeSession" />
          </div>
        </section>

        <!-- ═════════ Security ═════════ -->
        <section v-else-if="tab === 'security'" class="pfx-stack">
          <div class="pfx-grid2">
            <section v-if="canEdit" class="pfx-card" aria-label="Identity">
              <header class="pfx-card__head"><h2 class="pfx-card__title"><PeopleIcon name="user" />Identity</h2><span class="pfx-card__meta">name, rank and Discord</span></header>
              <form class="pfx-card__body pfx-form" @submit.prevent="saveIdentity">
                <div><label class="pfx-label" for="pfx-name">Name</label><input id="pfx-name" v-model.trim="identity.name" class="pfx-input" style="width: 100%" maxlength="48" required /></div>
                <div>
                  <label class="pfx-label" for="pfx-rank">Rank</label>
                  <select id="pfx-rank" v-model="identity.rank" class="pfx-select" style="width: 100%" :disabled="profile.isOwner">
                    <option v-if="!rankChoices.includes(profile.rank)" :value="profile.rank">{{ profile.rank }}</option>
                    <option v-for="r in rankChoices" :key="r" :value="r">{{ r }}</option>
                  </select>
                  <p class="pfx-help">Rank only says who is above whom: people manage profiles ranked below them. It grants nothing by itself.</p>
                </div>
                <div><label class="pfx-label" for="pfx-discord">Discord user ID</label><input id="pfx-discord" v-model.trim="identity.discordId" class="pfx-input pfx-input--mono" style="width: 100%" inputmode="numeric" placeholder="Optional" /></div>
                <p v-if="identityError" class="pfx-error" role="alert">{{ identityError }}</p>
                <div class="pfx-form__actions"><button type="submit" class="pfx-btn pfx-btn--primary pfx-btn--sm" :disabled="!!busy || !identityDirty">Save</button></div>
              </form>
            </section>

            <section v-if="canControl" class="pfx-card" aria-label="Sign-in">
              <header class="pfx-card__head"><h2 class="pfx-card__title"><PeopleIcon name="key" />Sign-in</h2><span class="pfx-card__meta">whether and how this profile gets in</span></header>
              <div class="pfx-card__body">
                <div class="pfx-form__row">
                  <div><strong>Can sign in</strong><p>Off signs out every device at once and refuses new sign-ins. Permissions are kept.<template v-if="loginRefused30d"> They tried {{ loginRefused30d }}× while it was off in the last 30 days.</template></p></div>
                  <button class="pfx-switch pfx-switch--danger-off" role="switch" aria-label="Can sign in" :aria-checked="profile.canLogin" :disabled="!!busy" @click="profile.canLogin ? (confirming = 'login-off') : act(actions.setLogin(profile, true))"></button>
                </div>
                <div class="pfx-form__row">
                  <div>
                    <strong>Password works as an API key</strong>
                    <p>For scripts and devices that send the password instead of signing in. Off is safer.<template v-if="auth"> In 7 days {{ fmtCount(auth.password7d) }} request{{ auth.password7d === 1 ? ' was' : 's were' }} signed with it.</template></p>
                    <p v-if="auth && auth.password7d && !profile.allowPasswordApiAccess && insights?.passwordBearer?.accepted" style="color: var(--pfx-warn)">This profile uses its password without this switch: it only works because passwords are still accepted for everyone.</p>
                  </div>
                  <button class="pfx-switch" role="switch" aria-label="Password works as an API key" :aria-checked="profile.allowPasswordApiAccess" :disabled="!!busy" @click="act(actions.setPasswordApi(profile, !profile.allowPasswordApiAccess))"></button>
                </div>
              </div>
            </section>

            <section v-if="canReset" class="pfx-card" aria-label="Password">
              <header class="pfx-card__head"><h2 class="pfx-card__title"><PeopleIcon name="lock" />Password</h2><span class="pfx-card__meta">the old one stops working at once</span></header>
              <div class="pfx-card__body">
                <p class="pfx-dim">A reset signs out every device. The new password is shown once, to you.</p>
                <div class="pfx-form__actions" style="margin-top: 10px"><button class="pfx-btn pfx-btn--sm pfx-btn--warn" @click="openReset"><PeopleIcon name="key" />Reset password…</button></div>
              </div>
            </section>

            <section v-if="canDelete" class="pfx-card" aria-label="Delete profile">
              <header class="pfx-card__head"><h2 class="pfx-card__title" style="color: #ffb3bf"><PeopleIcon name="trash" />Delete profile</h2><span class="pfx-card__meta">permanent</span></header>
              <div class="pfx-card__body">
                <p class="pfx-dim">Deletes the profile and ends its sessions. Its activity history is kept.</p>
                <div class="pfx-form__actions" style="margin-top: 10px"><button class="pfx-btn pfx-btn--sm pfx-btn--danger" @click="openDelete"><PeopleIcon name="trash" />Delete {{ profile.name }}…</button></div>
              </div>
            </section>
          </div>

          <section v-if="canActivity" class="pfx-card" aria-label="Access history">
            <header class="pfx-card__head"><h2 class="pfx-card__title"><PeopleIcon name="shield" />Access history</h2><span class="pfx-card__meta">changes to this profile and its sign-ins</span></header>
            <div class="pfx-card__body"><PeopleTimeline :items="history" :loading="historyLoading" :has-more="historyNext != null" :profile-id="profile.userId" :title-of="titleOf" empty-text="No changes on record." @more="loadHistory(true)" /></div>
          </section>
        </section>
      </template>
    </div>

    <!-- ── dialogs ── -->
    <PeopleSuspendDialog :open="suspendOpen" :name="profile?.name ?? ''" :busy="busy === 'suspend'" @close="suspendOpen = false" @confirm="doSuspend" />

    <PeopleDialog :open="!!confirming" :title="confirmCopy.title" :icon="confirming === 'login-off' ? 'power' : 'signout'" tone="crit" testid="pfx-confirm" @close="confirming = null">
      <p>{{ confirmCopy.text }}</p>
      <template #actions>
        <button class="pfx-btn pfx-btn--ghost" @click="confirming = null">Cancel</button>
        <button class="pfx-btn pfx-btn--solid-danger" :disabled="!!busy" data-testid="pfx-confirm-go" @click="runConfirmed">{{ confirmCopy.button }}</button>
      </template>
    </PeopleDialog>

    <PeopleDialog :open="resetOpen" :title="resetPassword ? 'New password' : `Reset ${profile?.name}'s password`" icon="key" :tone="resetPassword ? 'violet' : 'warn'" @close="closeReset">
      <template v-if="!resetPassword">
        <div class="pfx-seg" role="group" aria-label="New password">
          <button class="pfx-seg__opt" :aria-pressed="resetMode === 'generate'" @click="resetMode = 'generate'">Generate one</button>
          <button class="pfx-seg__opt" :aria-pressed="resetMode === 'custom'" @click="resetMode = 'custom'">Choose one</button>
        </div>
        <div v-if="resetMode === 'custom'" style="margin-top: 12px">
          <label class="pfx-label" for="pfx-newpw">New password</label>
          <input id="pfx-newpw" v-model="resetCustom" class="pfx-input pfx-input--mono" style="width: 100%" type="text" autocomplete="off" minlength="8" />
          <p class="pfx-help">At least 8 characters, and different from every other profile's.</p>
        </div>
        <p class="pfx-help" style="margin-top: 12px">Every device of {{ profile?.name }} is signed out now; they sign in again with the new password.</p>
        <p v-if="dialogError" class="pfx-error" role="alert">{{ dialogError }}</p>
      </template>
      <template v-else>
        <p>Give this to {{ profile?.name }} now — it won't be shown again.</p>
        <div class="pfx-secret" style="margin-top: 10px">
          <code>{{ resetPassword }}</code>
          <button class="pfx-btn pfx-btn--sm" @click="copy(resetPassword)"><PeopleIcon :name="copied ? 'check' : 'copy'" />{{ copied ? 'Copied' : 'Copy' }}</button>
        </div>
      </template>
      <template #actions>
        <template v-if="!resetPassword">
          <button class="pfx-btn pfx-btn--ghost" @click="closeReset">Cancel</button>
          <button class="pfx-btn pfx-btn--warn" :disabled="resetting || (resetMode === 'custom' && resetCustom.length < 8)" @click="doReset">{{ resetting ? 'Resetting…' : 'Reset password' }}</button>
        </template>
        <button v-else class="pfx-btn pfx-btn--primary" @click="closeReset">Done</button>
      </template>
    </PeopleDialog>

    <PeopleDialog :open="deleteOpen" :title="`Delete ${profile?.name}?`" sub="This can't be undone." icon="trash" tone="crit" @close="deleteOpen = false">
      <p>Type <strong>{{ profile?.name }}</strong> to confirm.</p>
      <input v-model="deleteConfirm" class="pfx-input" style="width: 100%; margin-top: 8px" :placeholder="profile?.name" aria-label="Type the profile name to confirm" autocomplete="off" />
      <p v-if="dialogError" class="pfx-error" role="alert">{{ dialogError }}</p>
      <template #actions>
        <button class="pfx-btn pfx-btn--ghost" @click="deleteOpen = false">Cancel</button>
        <button class="pfx-btn pfx-btn--solid-danger" :disabled="deleting || deleteConfirm !== profile?.name" @click="doDelete">{{ deleting ? 'Deleting…' : 'Delete profile' }}</button>
      </template>
    </PeopleDialog>

    <PeoplePalette :open="paletteOpen" :commands="commands" @close="paletteOpen = false" />
    <PeopleToasts :toasts="toasts" @dismiss="dismiss" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { useAccess, usePermissionCatalog } from '~/composables/useAccess';
import { useProfileLiveFeed } from '~/composables/useProfileLiveFeed';
import { useProfileActions } from '~/composables/useProfilesConsole';
import {
  profilesApi, ProfilesApiError,
  type ActivitySummary, type GrantDraft, type PermissionUsagePayload, type ProfileListPayload, type ProfileRow, type SessionRow, type TimelineItem,
} from '~/scripts/profilesApi';
import { durationShort, fmtCount, fmtDateTime, presenceText, relTime, untilTime } from '~/scripts/profileFormat';
import { IDLE_DAYS, isIdleSession, lastSeenText, SERIES_COLOURS, TIER_NAMES, type ConsoleCommand, type InsightsPayload } from '~/scripts/profilesConsole';

definePageMeta({ layout: 'navbar' });

type Tab = 'overview' | 'access' | 'activity' | 'devices' | 'security';
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
const titleOf = (key: string) => catalog.describe(key).title;

const id = computed(() => String(route.params.id ?? ''));
const profile = ref<ProfileRow | null>(null);
const notFound = ref(false);
const loadError = ref<string | null>(null);
const loading = ref(false);
const loadedAt = ref(0);
const now = ref(Date.now());
const dialogError = ref<string | null>(null);

// ── what this viewer may do here ──
const manageable = computed(() => profile.value?.manageable === true);
const canControl = computed(() => manageable.value && can('profiles.access.control'));
const canActivity = computed(() => can('profiles.activity.read'));
const canSeeGrants = computed(() => can('profiles.permissions.view'));
const canSeeDevices = computed(() => can('profiles.access.control') || profile.value?.isYou === true);
const canGrant = computed(() => manageable.value && can('profiles.permissions.grant'));
const canEdit = computed(() => can('profiles.lifecycle.edit') && (manageable.value || (isOwner.value && profile.value?.isYou === true)));
const canReset = computed(() => manageable.value && can('profiles.credentials.reset'));
const canDelete = computed(() => manageable.value && can('profiles.lifecycle.delete'));

// ── actions (shared with the directory) ──
function mergeRow(row?: ProfileRow) {
  if (!row || !profile.value || row.userId !== profile.value.userId) { void loadProfile(); return; }
  const p = profile.value;
  profile.value = { ...p, ...row, requests24h: p.requests24h, denied24h: p.denied24h, lastSeenUtc: p.lastSeenUtc, presence: p.presence, grants: row.grants ?? p.grants, effective: row.effective ?? p.effective };
  void loadInsights();
}
const { toasts, busy, notify, dismiss, actions } = useProfileActions(mergeRow);
/** Runs an action and refreshes what it touches. */
async function act<T>(work: Promise<T | null>) {
  const result = await work;
  if (result) { void loadSessions(); void loadProfile(); }
  return result;
}

// ── permission edits (declared before the tabs, which badge unsaved changes) ──
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

// ── insights (the directory's review, for this one profile) ──
const insights = ref<InsightsPayload | null>(null);
const insightRow = computed(() => insights.value?.profiles.find(p => p.userId === id.value) ?? null);
const auth = computed(() => insightRow.value?.auth ?? null);
const usageRow = computed(() => insightRow.value?.usage ?? null);
const unusedKeys = computed(() => usageRow.value?.unused ?? []);
const hourly = computed(() => insightRow.value?.hourly24 ?? []);
const loginRefused30d = computed(() => insightRow.value?.loginRefused30d ?? 0);
async function loadInsights() {
  try { insights.value = await profilesApi.insights(); } catch { /* an older server: the page works without it */ }
}

const tabs = computed(() => {
  const list: { key: Tab; label: string; icon: string; badge?: string | number; tone?: string }[] = [{ key: 'overview', label: 'Overview', icon: 'user' }];
  if (canSeeGrants.value || profile.value?.isYou) list.push({ key: 'access', label: 'Access', icon: 'layers', badge: diffTotal.value ? `${diffTotal.value} unsaved` : unusedKeys.value.length ? `${unusedKeys.value.length} unused` : undefined, tone: diffTotal.value ? 'violet' : unusedKeys.value.length ? 'warn' : undefined });
  if (canActivity.value) list.push({ key: 'activity', label: 'Activity', icon: 'activity', badge: profile.value?.denied24h ? `${profile.value.denied24h} refused` : undefined, tone: 'crit' });
  if (canSeeDevices.value) list.push({ key: 'devices', label: 'Devices', icon: 'device', badge: idleSessions.value.length ? `${idleSessions.value.length} idle` : profile.value?.sessions || undefined, tone: idleSessions.value.length ? 'warn' : undefined });
  if (canEdit.value || canControl.value || canReset.value || canDelete.value || canActivity.value) list.push({ key: 'security', label: 'Security', icon: 'shield' });
  return list;
});
const tab = computed<Tab>(() => {
  const wanted = String(route.query.tab ?? 'overview');
  const mapped = wanted === 'sessions' ? 'devices' : wanted;
  return tabs.value.some(t => t.key === mapped) ? (mapped as Tab) : 'overview';
});
function setTab(next: Tab) {
  void router.replace({ query: { ...route.query, tab: next === 'overview' ? undefined : next, service: next === 'access' ? route.query.service : undefined } });
}
const focusService = computed(() => (typeof route.query.service === 'string' ? route.query.service : null));

// ── live ──
const liveEnabled = computed(() => can('profiles.activity.live') && !!profile.value);
const live = useProfileLiveFeed(id, liveEnabled);
const presence = computed(() => live.presence.value ?? profile.value?.presence ?? null);
const presenceState = computed(() => presence.value?.state ?? 'offline');
const openTabs = computed(() => presence.value?.tabs ?? sessions.value.flatMap(s => s.tabs.map(t => ({ ...t, device: s.label, ip: s.ip }))));
const freshLabel = computed(() => (loadedAt.value ? `Updated ${relTime(loadedAt.value, now.value)}` : 'Loading…'));
const liveTitle = computed(() => (live.connected.value ? 'following live' : can('profiles.activity.live') ? 'connecting…' : 'refreshes every 20 s'));

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
  if (!canSeeDevices.value) return;
  try {
    // Your own list comes from "mine": the only one that marks the device you're on.
    const list = profile.value?.isYou ? await profilesApi.mySessions() : await profilesApi.sessions(id.value, showEndedSessions.value);
    sessions.value = showEndedSessions.value || !profile.value?.isYou ? list : list.filter(s => s.active);
  } catch { /* shown as empty */ }
}
const activeSessions = computed(() => sessions.value.filter(s => s.active));
const idleSessions = computed(() => sessions.value.filter(s => isIdleSession(s, now.value) && !s.current));

const summary24 = ref<ActivitySummary | null>(null);
const summary30 = ref<ActivitySummary | null>(null);
const summary = ref<ActivitySummary | null>(null);
const range = ref<'24h' | '7d' | '30d'>('24h');
async function loadSummaries() {
  if (!canActivity.value) return;
  try {
    summary24.value = await profilesApi.summary(id.value, '24h');
    if (range.value === '24h') summary.value = summary24.value;
  } catch { /* the cards say so */ }
  // 30 days only when the server answers from rollups: from raw rows it is the read that took up to 48 s.
  if (summary24.value?.source !== 'rollup') return;
  try { summary30.value = await profilesApi.summary(id.value, '30d'); if (range.value === '30d') summary.value = summary30.value; } catch { /* optional */ }
}
async function loadRangeSummary() {
  if (!canActivity.value) return;
  const cached = range.value === '24h' ? summary24.value : range.value === '30d' ? summary30.value : null;
  if (cached) { summary.value = cached; return; }
  summary.value = null;
  try { summary.value = await profilesApi.summary(id.value, range.value); } catch { /* empty */ }
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
  try { list.value = await profilesApi.list(); } catch { /* copy-from and the palette just stay short */ }
}
const copySources = computed(() => (list.value?.profiles ?? []).filter(p => p.userId !== id.value).map(p => ({ userId: p.userId, name: `${p.name} (${p.isOwner ? 'Owner' : p.rank})` })));
const rankChoices = computed(() => list.value?.assignableRanks ?? []);

// recent activity (overview) and the timeline (activity tab)
const recentBase = ref<TimelineItem[]>([]);
const recentLoading = ref(false);
async function loadRecent() {
  if (!canActivity.value) return;
  recentLoading.value = true;
  try { recentBase.value = (await profilesApi.activity(id.value, { limit: 14 })).items; } catch { /* empty */ } finally { recentLoading.value = false; }
}
const recent = computed(() => mergeItems(live.feed.value, recentBase.value).slice(0, 14));

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

function mergeItems(fresh: TimelineItem[], base: TimelineItem[]) {
  const seen = new Set<string>();
  const out: TimelineItem[] = [];
  for (const item of [...fresh, ...base]) {
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
    await Promise.all([loadSessions(), loadRecent(), loadInsights()]);
    void loadSummaries();
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
  if (t === 'devices') void loadSessions();
});

// ── charts and lists ──
function chartFrom(s: ActivitySummary | null) {
  if (!s || !s.buckets.length || !s.requests) return null;
  const totals = s.services.map(svc => ({ svc, total: s.buckets.reduce((n, b) => n + (b.byService[svc] ?? 0), 0) })).sort((a, b) => b.total - a.total);
  const top = totals.slice(0, 7).map(t => t.svc);
  const rest = totals.slice(7).map(t => t.svc);
  const series = top.map((svc, i) => ({ key: svc, label: svc, color: SERIES_COLOURS[i], values: s.buckets.map(b => b.byService[svc] ?? 0) }));
  if (rest.length) series.push({ key: 'other', label: 'Other', color: SERIES_COLOURS[7], values: s.buckets.map(b => rest.reduce((n, svc) => n + (b.byService[svc] ?? 0), 0)) });
  return { t0: s.buckets[0].t, step: s.bucketMs, series };
}
const chart24 = computed(() => chartFrom(summary24.value));
const chartRange = computed(() => chartFrom(summary.value));
const topPermissions = computed(() => (summary.value?.topPermissions ?? []).filter(p => p.key).map(p => ({
  key: p.key, label: titleOf(p.key), title: p.key, value: p.count, secondary: p.denied ? `${p.denied} refused` : undefined, tone: p.denied ? 'warn' : undefined,
})));
const topRoutes = computed(() => (summary.value?.topRoutes ?? []).map(r => ({ key: r.key, label: r.key, value: r.count })));
const topPages = computed(() => (summary.value?.topPages ?? []).filter(p => p.key).map(p => ({
  key: p.key, label: p.key, value: p.denied, secondary: `${p.count} view${p.count === 1 ? '' : 's'}`,
})));

const accessByService = computed(() => {
  const unused = new Set(unusedKeys.value);
  const groups = new Map<string, { name: string; count: number; unused: number; tiers: Set<number> }>();
  for (const g of profile.value?.grants ?? []) {
    if (!g.active) continue;
    const d = catalog.byKey.value.get(g.key);
    const name = d?.service ?? g.service ?? g.key.split('.')[0];
    const entry = groups.get(name) ?? { name, count: 0, unused: 0, tiers: new Set<number>() };
    entry.count++;
    if (unused.has(g.key)) entry.unused++;
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
    notify('ok', `${profile.value.name}'s permissions saved`, `+${result.added?.length ?? 0} −${result.removed?.length ?? 0} — their open tabs updated straight away.`);
    void loadInsights();
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
const suspendOpen = ref(false);
async function doSuspend(options: { minutes?: number; untilUtc?: string }, reason: string) {
  if (!profile.value) return;
  if (await act(actions.suspend(profile.value, options, reason))) suspendOpen.value = false;
}
async function revokeSession(sessionId: string) {
  if (!profile.value) return;
  if (await actions.signOutDevice(profile.value, sessionId)) void loadSessions();
}
async function signOutIdle() {
  if (!profile.value) return;
  // One device at a time, by id: works the same on a server from before idleDays.
  if (await actions.signOutIdle(profile.value, idleSessions.value.map(s => s.sessionId))) { void loadSessions(); void loadProfile(); void loadInsights(); }
}

const confirming = ref<null | 'signout' | 'login-off'>(null);
const confirmCopy = computed(() => (confirming.value === 'login-off'
  ? { title: `Turn sign-in off for ${profile.value?.name}?`, text: 'Every device is signed out now and they can’t sign in until you turn it back on. Their permissions are kept.', button: 'Turn sign-in off' }
  : { title: `Sign ${profile.value?.name} out everywhere?`, text: `All ${profile.value?.sessions ?? 0} devices are signed out now and their tabs go back to the sign-in page. They can sign in again with their password.`, button: 'Sign out everywhere' }));
async function runConfirmed() {
  const kind = confirming.value;
  if (!kind || !profile.value) return;
  const ok = kind === 'login-off' ? await act(actions.setLogin(profile.value, false)) : await act(actions.signOutEverywhere(profile.value));
  if (ok) confirming.value = null;
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
  try {
    const row = await profilesApi.update(body);
    mergeRow(row);
    if (profile.value) syncIdentity(profile.value);
    notify('ok', 'Profile saved');
  } catch (e) {
    identityError.value = e instanceof Error ? e.message : 'Could not save.';
  }
}

// password reset
const resetOpen = ref(false);
const resetMode = ref<'generate' | 'custom'>('generate');
const resetCustom = ref('');
const resetPassword = ref('');
const resetting = ref(false);
const copied = ref(false);
function openReset() { dialogError.value = null; resetMode.value = 'generate'; resetCustom.value = ''; resetPassword.value = ''; copied.value = false; resetOpen.value = true; }
function closeReset() { resetOpen.value = false; resetPassword.value = ''; resetCustom.value = ''; }
async function doReset() {
  resetting.value = true;
  dialogError.value = null;
  try {
    const result = await profilesApi.resetPassword(id.value, resetMode.value === 'custom' ? resetCustom.value : undefined);
    if (result.password) resetPassword.value = result.password;
    else { closeReset(); notify('ok', 'Password reset', `${result.signedOutSessions} device${result.signedOutSessions === 1 ? '' : 's'} signed out.`); }
    void loadSessions();
  } catch (e) {
    dialogError.value = e instanceof Error ? e.message : 'Could not reset the password.';
  } finally {
    resetting.value = false;
  }
}
async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); copied.value = true; setTimeout(() => { copied.value = false; }, 2_000); } catch { /* select it by hand */ }
}

// delete
const deleteOpen = ref(false);
const deleteConfirm = ref('');
const deleting = ref(false);
function openDelete() { dialogError.value = null; deleteConfirm.value = ''; deleteOpen.value = true; }
async function doDelete() {
  if (!profile.value) return;
  deleting.value = true;
  dialogError.value = null;
  try {
    await profilesApi.remove(profile.value.userId, deleteConfirm.value);
    notify('ok', `${profile.value.name} was deleted`);
    baseline.value = draft.value; // nothing to guard on the way out
    await router.replace('/administration/profiles');
  } catch (e) {
    dialogError.value = e instanceof Error ? e.message : 'Could not delete.';
  } finally {
    deleting.value = false;
  }
}

// ── palette ──
const paletteOpen = ref(false);
function openPalette() {
  paletteOpen.value = true;
  if (!list.value) void loadList();
}
const commands = computed<ConsoleCommand[]>(() => {
  const out: ConsoleCommand[] = [];
  const p = profile.value;
  tabs.value.forEach((t, i) => out.push({ id: `tab-${t.key}`, group: 'This profile', title: `${t.label}`, icon: t.icon, hint: String(i + 1), run: () => setTab(t.key) }));
  if (p && canControl.value) {
    if (!p.suspended) out.push({ id: 'suspend', group: 'This profile', title: `Suspend ${p.name}…`, icon: 'pause', run: () => { suspendOpen.value = true; } });
    else out.push({ id: 'unsuspend', group: 'This profile', title: 'Lift the suspension', icon: 'play', run: () => act(actions.unsuspend(p)) });
    out.push({ id: 'ro', group: 'This profile', title: p.readOnly ? 'Lift read-only' : 'Make read-only', icon: 'eye', run: () => act(actions.setReadOnly(p, !p.readOnly)) });
    if (idleSessions.value.length) out.push({ id: 'idle', group: 'This profile', title: `Sign out ${idleSessions.value.length} idle device${idleSessions.value.length === 1 ? '' : 's'}`, icon: 'clock', danger: true, run: () => signOutIdle() });
    out.push({ id: 'signout', group: 'This profile', title: 'Sign out everywhere', icon: 'signout', danger: true, run: () => act(actions.signOutEverywhere(p)) });
  }
  if (p && canReset.value) out.push({ id: 'reset', group: 'This profile', title: 'Reset the password…', icon: 'key', run: () => { setTab('security'); openReset(); } });
  for (const other of list.value?.profiles ?? []) {
    if (other.userId === id.value) continue;
    out.push({ id: `open-${other.userId}`, group: 'Profiles', title: other.name, icon: 'user', hint: other.isOwner ? 'Owner' : other.rank, run: () => router.push(`/administration/profiles/${other.userId}`) });
  }
  out.push({ id: 'dir', group: 'Go to', title: 'All profiles', icon: 'users', run: () => router.push('/administration/profiles') });
  if (canSeeGrants.value) out.push({ id: 'catalog', group: 'Go to', title: 'Permission catalog', icon: 'catalog', run: () => router.push('/administration/profiles/catalog') });
  return out;
});

function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}
function onKey(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openPalette(); return; }
  if (paletteOpen.value || suspendOpen.value || confirming.value || resetOpen.value || deleteOpen.value || typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
  const n = Number(event.key);
  if (n >= 1 && n <= tabs.value.length) { setTab(tabs.value[n - 1].key); return; }
  if (event.key === 'Escape' && !diffTotal.value) void router.push('/administration/profiles');
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
  summary30.value = null;
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
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  window.clearInterval(poll);
  window.clearInterval(clock);
  window.clearTimeout(reloadDebounce);
  window.removeEventListener('keydown', onKey);
});
</script>

<style lang="scss" src="~/assets/scss/profiles-console.scss"></style>
