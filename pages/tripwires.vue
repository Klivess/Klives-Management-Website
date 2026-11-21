<template>
  <div class="twx" data-testid="twx-root">
    <!-- ── bar ── -->
    <header class="twx-bar">
      <div class="twx-bar__id">
        <span class="twx-mark" :data-tone="barTone"><TripwiresIcon name="bolt" /></span>
        <h1 class="twx-bar__title">Tripwires</h1>
        <span class="twx-bar__sub" data-testid="twx-subline">{{ subline }}</span>
      </div>

      <form v-if="allowed.manage" class="twx-quick" data-testid="twx-quick" @submit.prevent="quickCreate">
        <TripwiresIcon name="link" />
        <input ref="quickInput" v-model="quickUrl" class="twx-quick__input" placeholder="Paste a link to make a tripwire for it" aria-label="Paste a link to make a tripwire for it" aria-keyshortcuts="/" data-testid="twx-quick-input" />
        <button v-if="quickUrl" type="button" class="twx-quick__more" title="More options (Shift+Enter)" @click="openComposer(quickUrl)">Options</button>
        <button type="submit" class="twx-quick__go" :disabled="!quickClean || quickBusy" data-testid="twx-quick-go">{{ quickBusy ? 'Making…' : 'Make link' }}</button>
      </form>

      <span class="twx-bar__spacer"></span>

      <div class="twx-bar__actions">
        <button class="twx-iconbtn twx-iconbtn--box" title="Find (Ctrl+K)" aria-label="Find a tripwire or an action" aria-keyshortcuts="Control+K" data-testid="twx-find" @click="paletteOpen = true"><TripwiresIcon name="search" /></button>
        <button class="twx-live" :data-state="con.linkState.value" :title="liveTitle" :aria-label="liveTitle" data-testid="twx-live" @click="con.setLive(!con.prefs.value.live)">
          <span class="twx-live__dot"></span><span>{{ liveWord }}</span>
        </button>
        <button class="twx-iconbtn twx-iconbtn--box" title="Refresh now (R)" aria-label="Refresh now" @click="con.refresh()"><TripwiresIcon name="refresh" :class="{ 'twx-spin': con.busy.value }" /></button>
      </div>
    </header>

    <!-- The layout already provides the page's <main>. -->
    <div class="twx-main">
      <div v-if="profileReady && !allowed.read" class="twx-card twx-empty"><TripwiresIcon name="lock" />Tripwires are not part of your access.</div>

      <template v-else>
        <div v-if="!con.ready.value && con.loadError.value" class="twx-card twx-empty" data-testid="twx-error">
          <TripwiresIcon name="alert" />
          <div><b>Tripwires could not be loaded</b><p class="twx-faint">{{ con.loadError.value }}</p></div>
          <button class="twx-btn" @click="con.refresh()">Try again</button>
        </div>

        <!-- ── what needs attention ── -->
        <ul v-if="issues.length" class="twx-issues" data-testid="twx-issues">
          <li v-for="issue in issues" :key="issue.id" class="twx-issue" :data-tone="issue.tone" :data-testid="`issue-${issue.id}`">
            <TripwiresIcon :name="issue.tone === 'crit' ? 'octagon-x' : issue.tone === 'warn' ? 'alert' : 'info'" />
            <span class="twx-issue__text"><b>{{ issue.title }}</b><span v-if="issue.detail">{{ issue.detail }}</span></span>
            <button v-if="issue.tripwireId" class="twx-btn twx-btn--xs twx-btn--ghost" @click="openIssue(issue)">{{ issue.action === 'settings' ? 'Settings' : 'Open' }}</button>
          </li>
        </ul>

        <div class="twx-layout">
          <!-- ── rail ── -->
          <aside class="twx-rail" aria-label="Tripwires">
            <button class="twx-railitem twx-railitem--all" :aria-current="!selected ? 'page' : undefined" data-testid="rail-all" @click="open('')">
              <span class="twx-railitem__icon"><TripwiresIcon name="activity" /></span>
              <span class="twx-railitem__text"><b>All activity</b><small>{{ allSub }}</small></span>
              <span class="twx-railitem__count twx-num">{{ fmtInt(totals.trips24h) }}</span>
            </button>

            <label v-if="tripwires.length > 5" class="twx-rail__filter">
              <TripwiresIcon name="filter" /><input v-model="railQuery" placeholder="Filter tripwires" aria-label="Filter tripwires" />
            </label>

            <div class="twx-rail__list" role="list">
              <div v-if="!con.ready.value && !con.loadError.value" class="twx-skel-list"><i v-for="n in 4" :key="n"></i></div>
              <button
                v-for="t in railItems" :key="t.id" role="listitem" class="twx-railitem"
                :aria-current="selected?.id === t.id ? 'page' : undefined" :data-testid="`rail-${t.id}`" @click="open(t.id)"
              >
                <span class="twx-dot" :data-tone="statusTone(t.status)" :title="t.status"></span>
                <span class="twx-railitem__text">
                  <b class="twx-truncate">{{ t.name }}</b>
                  <small class="twx-truncate">{{ railSub(t) }}</small>
                </span>
                <TripwiresBars class="twx-railitem__spark" :bins="dayBins(t.summary, 14, con.now.value)" mini :label="`${t.name}, trips a day for 14 days`" />
                <span class="twx-railitem__count twx-num" :title="`${t.totalTrips} trips in all`">{{ fmtCompact(t.totalTrips) }}</span>
              </button>
              <p v-if="con.ready.value && !tripwires.length" class="twx-rail__empty">No tripwires yet. Paste a link above to make the first.</p>
              <p v-else-if="railQuery && !railItems.length" class="twx-rail__empty">Nothing matches.</p>
            </div>

            <button v-if="allowed.manage" class="twx-btn twx-btn--ghost twx-rail__new" data-testid="rail-new" @click="openComposer()"><TripwiresIcon name="plus" />New tripwire<span class="twx-kbd">N</span></button>
          </aside>

          <!-- ── all activity ── -->
          <section v-if="!selected" class="twx-content" aria-label="All activity">
            <div class="twx-figs">
              <div class="twx-fig" data-testid="fig-today">
                <span class="twx-fig__label">Trips today</span>
                <b class="twx-fig__value twx-num">{{ con.ready.value ? fmtInt(totals.trips24h) : '—' }}</b>
                <small>{{ fmtInt(totals.trips7d) }} this week · last {{ ago(totals.lastTrippedUtc, con.now.value) }}</small>
                <TripwiresBars :bins="allBins" mini label="Trips a day across every tripwire" />
              </div>
              <div class="twx-fig" data-testid="fig-live">
                <span class="twx-fig__label">Live</span>
                <b class="twx-fig__value twx-num">{{ con.ready.value ? `${totals.active}/${totals.tripwires}` : '—' }}</b>
                <small>{{ fmtInt(totals.links) }} live link{{ totals.links === 1 ? '' : 's' }}</small>
              </div>
              <div class="twx-fig" data-testid="fig-known" :title="intel ? 'Trips from addresses that have signed in to KM' : 'Needs OmniDefence access'">
                <span class="twx-fig__label">From KM accounts</span>
                <b class="twx-fig__value twx-num">{{ intel && totals.knownTrips != null ? fmtInt(totals.knownTrips) : '—' }}</b>
                <small>{{ intel && totals.knownTrips != null && totals.retained ? `${Math.round((totals.knownTrips / totals.retained) * 100)}% of kept trips · your tests` : intel ? 'none' : 'needs OmniDefence access' }}</small>
              </div>
              <div class="twx-fig" data-testid="fig-closed" :data-tone="(totals.closedVisits ?? 0) > 0 ? 'warn' : undefined">
                <span class="twx-fig__label">Turned away</span>
                <b class="twx-fig__value twx-num">{{ totals.closedVisits != null ? fmtInt(totals.closedVisits) : '—' }}</b>
                <small>visits to closed tripwires</small>
              </div>
              <div class="twx-fig" data-testid="fig-previews">
                <span class="twx-fig__label">Previews</span>
                <b class="twx-fig__value twx-num">{{ totals.previews != null ? fmtInt(totals.previews) : '—' }}</b>
                <small>bots and link unfurls, not counted</small>
              </div>
              <div class="twx-fig" data-testid="fig-speed" :data-tone="speedTone">
                <span class="twx-fig__label">Redirect</span>
                <b class="twx-fig__value twx-num">{{ health?.answerP50Ms != null ? fmtMsShort(health.answerP50Ms) : '—' }}</b>
                <small>{{ health?.answers ? `typical · ${fmtInt(health.answers)} since ${ago(health.startedUtc, con.now.value)}` : 'no visits since the server started' }}</small>
              </div>
            </div>

            <div class="twx-card">
              <header class="twx-card__head">
                <h2><TripwiresIcon name="activity" />Latest trips</h2>
                <span class="twx-faint twx-num">{{ allNote }}</span>
                <div class="twx-card__tools">
                  <label class="twx-searchbox"><TripwiresIcon name="search" /><input v-model="tripQuery" placeholder="Place, network, device…" aria-label="Filter trips" /></label>
                  <button v-if="intel" class="twx-btn twx-btn--sm" :aria-pressed="con.prefs.value.hideKnown" data-testid="toggle-known" @click="toggleKnown"><TripwiresIcon :name="con.prefs.value.hideKnown ? 'eye-off' : 'eye'" />{{ con.prefs.value.hideKnown ? 'KM accounts hidden' : 'KM accounts shown' }}</button>
                </div>
              </header>
              <div v-if="!con.overview.value?.native && con.ready.value" class="twx-empty twx-empty--slim">This server does not send trips across tripwires yet. Open a tripwire to see its trips.</div>
              <div v-else-if="!allTrips.length" class="twx-empty twx-empty--slim" data-testid="all-empty">
                <TripwiresIcon name="history" />{{ con.ready.value ? (recentRaw.length ? 'Every recent trip came from a KM account.' : 'No trips yet. Share a link and they appear here.') : 'Reading…' }}
              </div>
              <div v-else class="twx-trips" data-testid="all-trips">
                <TripwiresTripRow v-for="e in allTrips" :key="e.id" :event="e" :now="con.now.value" show-tripwire :intel="intel"
                  :open="openTrip === e.id" @toggle="toggleTrip(e.id)" @copy="text => con.copy(text, 'Address copied')" @tripwire="open" @visitor="hash => openVisitor(e.tripwireId, hash)" />
              </div>
            </div>
          </section>

          <!-- ── one tripwire ── -->
          <section v-else class="twx-content" :aria-label="selected.name" data-testid="twx-detail">
            <div class="twx-head">
              <div class="twx-head__title">
                <h2 data-testid="detail-name">{{ selected.name }}</h2>
                <span class="twx-status" :data-tone="statusTone(selected.status)" data-testid="detail-status">{{ selected.status }}</span>
              </div>
              <p class="twx-faint">Made by {{ selected.createdBy || 'Klives' }} {{ ago(selected.createdUtc, con.now.value) }} · last trip {{ ago(selected.lastTrippedUtc, con.now.value) }}</p>
              <div class="twx-head__actions">
                <button v-if="selected.targets.length" class="twx-btn twx-btn--primary" data-testid="detail-copy" title="Copy the tracking link (C)" @click="copyLinks(selected)"><TripwiresIcon name="copy" />{{ selected.targets.filter(t => t.enabled).length > 1 ? 'Copy links' : 'Copy link' }}</button>
                <button v-if="allowed.manage" class="twx-btn" data-testid="detail-pause" :title="`${selected.settings.enabled ? 'Pause' : 'Resume'} (P)`" @click="con.setEnabled(selected, !selected.settings.enabled)">
                  <TripwiresIcon :name="selected.settings.enabled ? 'pause' : 'play'" />{{ selected.settings.enabled ? 'Pause' : 'Resume' }}
                </button>
                <button v-if="allowed.manage" class="twx-btn" data-testid="detail-settings" title="Settings (S)" @click="settingsOpen = true"><TripwiresIcon name="settings" />Settings</button>
                <div class="twx-menu" @keydown.esc="menuOpen = false">
                  <button class="twx-iconbtn twx-iconbtn--box" aria-label="More actions" :aria-expanded="menuOpen" data-testid="detail-more" @click="menuOpen = !menuOpen"><TripwiresIcon name="more" /></button>
                  <div v-if="menuOpen" class="twx-menu__pop" role="menu" @click="menuOpen = false">
                    <button v-if="allowed.manage" role="menuitem" @click="con.duplicate(selected)"><TripwiresIcon name="duplicate" />Duplicate with new links</button>
                    <button v-if="allowed.test && selected.settings.discordNotifications" role="menuitem" @click="con.testAlert(selected)"><TripwiresIcon name="bell" />Send a test alert</button>
                    <button role="menuitem" :disabled="!con.events.value.length" @click="exportTrips"><TripwiresIcon name="download" />Export trips (CSV)</button>
                    <button v-if="allowed.manage" role="menuitem" @click="askClear(selected)"><TripwiresIcon name="history" />Clear history</button>
                    <button v-if="allowed.manage" role="menuitem" class="twx-menu__danger" @click="askDelete(selected)"><TripwiresIcon name="trash" />Delete</button>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="selected.status !== 'Active'" class="twx-banner" :data-tone="statusTone(selected.status)" data-testid="detail-closed">
              <TripwiresIcon :name="selected.status === 'Disabled' ? 'pause' : 'door'" />
              <span><b>{{ closedHeadline(selected) }}</b>&nbsp;{{ closedDetail(selected) }}</span>
              <button v-if="allowed.manage && selected.status === 'Limit reached'" class="twx-btn twx-btn--xs" @click="raiseLimit(selected)">Raise the limit</button>
              <button v-if="allowed.manage && selected.status === 'Disabled'" class="twx-btn twx-btn--xs" @click="con.setEnabled(selected, true)">Resume</button>
            </div>

            <!-- links -->
            <div class="twx-links">
              <div v-for="target in selected.targets" :key="target.id" class="twx-linkcard" :class="{ 'twx-linkcard--off': !target.enabled }" :data-testid="`link-${target.id}`">
                <div class="twx-linkcard__top">
                  <b class="twx-truncate">{{ target.label }}</b>
                  <span class="twx-faint twx-num">{{ fmtInt(target.tripCount) }} trip{{ target.tripCount === 1 ? '' : 's' }}</span>
                  <label v-if="allowed.manage" class="twx-pill-toggle" :title="target.enabled ? 'This link is live' : 'This link is off'">
                    <input type="checkbox" :checked="target.enabled" @change="con.setTargetEnabled(selected, target, ($event.target as HTMLInputElement).checked)" /><span>{{ target.enabled ? 'Live' : 'Off' }}</span>
                  </label>
                </div>
                <div class="twx-linkcard__url">
                  <code class="twx-truncate" :title="target.trackingUrl" @click="selectText">{{ target.trackingUrl }}</code>
                  <button class="twx-btn twx-btn--sm" :data-testid="`copy-${target.id}`" @click="con.copy(target.trackingUrl)"><TripwiresIcon name="copy" />Copy</button>
                </div>
                <a class="twx-linkcard__dest twx-truncate" :href="target.destinationUrl" target="_blank" rel="noopener noreferrer" :title="target.destinationUrl"><TripwiresIcon name="arrow" />{{ hostOf(target.destinationUrl) }}<span class="twx-faint">{{ pathOf(target.destinationUrl) }}</span></a>
              </div>
            </div>

            <!-- figures -->
            <div class="twx-figs twx-figs--detail">
              <div class="twx-fig" data-testid="fig-trips">
                <span class="twx-fig__label">Trips</span>
                <b class="twx-fig__value twx-num">{{ fmtInt(selected.totalTrips) }}</b>
                <small>{{ s ? `${fmtInt(s.tripsLast24Hours)} today · ${fmtInt(s.tripsLast7Days)} this week` : '—' }}</small>
              </div>
              <div class="twx-fig" data-testid="fig-visitors">
                <span class="twx-fig__label">People</span>
                <b class="twx-fig__value twx-num">{{ s?.visitors != null ? fmtInt(peopleCount) : s ? fmtInt(s.uniqueTrips) : '—' }}</b>
                <small>{{ peopleSub }}</small>
              </div>
              <div class="twx-fig" data-testid="fig-detail-known" :title="intel ? 'Trips from addresses that have signed in to KM' : 'Needs OmniDefence access'">
                <span class="twx-fig__label">From KM accounts</span>
                <b class="twx-fig__value twx-num">{{ intel && selected.knownTrips != null ? fmtInt(selected.knownTrips) : '—' }}</b>
                <small>{{ intel ? (selected.knownTrips ? 'probably your own tests' : 'none') : 'needs OmniDefence access' }}</small>
              </div>
              <div class="twx-fig" data-testid="fig-vpn" :data-tone="(selected.proxyTrips ?? 0) > 0 ? 'warn' : undefined">
                <span class="twx-fig__label">VPN or proxy</span>
                <b class="twx-fig__value twx-num">{{ intel && selected.proxyTrips != null ? fmtInt(selected.proxyTrips) : '—' }}</b>
                <small>{{ intel ? 'their location is the exit' : 'needs OmniDefence access' }}</small>
              </div>
              <div class="twx-fig" data-testid="fig-turned">
                <span class="twx-fig__label">Turned away</span>
                <b class="twx-fig__value twx-num">{{ selected.closedVisits != null ? fmtInt(selected.closedVisits) : '—' }}</b>
                <small>{{ selected.closedVisits ? `last ${ago(selected.lastClosedUtc, con.now.value)}` : 'while closed' }}</small>
              </div>
              <div class="twx-fig" data-testid="fig-preview">
                <span class="twx-fig__label">Previews</span>
                <b class="twx-fig__value twx-num">{{ selected.previewVisits != null ? fmtInt(selected.previewVisits) : '—' }}</b>
                <small class="twx-truncate">{{ selected.previewVisits ? `${selected.lastPreviewAgent ?? 'bot'} ${ago(selected.lastPreviewUtc, con.now.value)}` : selected.settings.ignoreBots ? 'bots are not counted as trips' : 'bots are counted as trips' }}</small>
              </div>
            </div>

            <!-- activity -->
            <div class="twx-card twx-activity">
              <div class="twx-activity__chart">
                <header class="twx-card__head"><h2><TripwiresIcon name="history" />Last 30 days</h2><span class="twx-faint">{{ busiestHour }}</span></header>
                <TripwiresBars :bins="detailBins" :label="`${selected.name}: trips a day for 30 days`" />
              </div>
              <div class="twx-activity__side">
                <div v-if="s?.countries?.length" class="twx-breakdown">
                  <h3>Where</h3>
                  <div v-for="c in s.countries.slice(0, 4)" :key="c.value" class="twx-breakdown__row"><span class="twx-truncate">{{ c.value }}</span><i><b :style="{ width: `${share(c.count, s.retainedTrips ?? s.totalTrips)}%` }"></b></i><span class="twx-num">{{ c.count }}</span></div>
                </div>
                <div v-if="s?.devices?.length" class="twx-breakdown">
                  <h3>On what</h3>
                  <div v-for="d in s.devices.slice(0, 3)" :key="d.value" class="twx-breakdown__row"><span class="twx-truncate">{{ d.value }}</span><i><b :style="{ width: `${share(d.count, s.retainedTrips ?? s.totalTrips)}%` }"></b></i><span class="twx-num">{{ d.count }}</span></div>
                </div>
                <p v-if="!s?.countries?.length" class="twx-faint">Places and devices appear after the first trip.</p>
              </div>
            </div>

            <!-- trips / visitors -->
            <div class="twx-card">
              <header class="twx-card__head">
                <div class="twx-seg" role="tablist" aria-label="Show">
                  <button role="tab" class="twx-seg__opt" :aria-selected="tab === 'trips'" data-testid="tab-trips" @click="con.setTab('trips')">Trips <span class="twx-num">{{ fmtInt(con.eventsFor.value === selected.id ? con.eventsTotal.value : selected.summary?.retainedTrips ?? 0) }}</span></button>
                  <button role="tab" class="twx-seg__opt" :aria-selected="tab === 'visitors'" data-testid="tab-visitors" :disabled="!con.overview.value?.native" @click="con.setTab('visitors')">People <span v-if="con.visitorsFor.value === selected.id" class="twx-num">{{ fmtInt(con.visitors.value.length) }}</span></button>
                </div>
                <span v-if="con.visitorFilter.value && tab === 'trips'" class="twx-chip twx-chip--filter" data-testid="visitor-filter">
                  <i :style="{ background: `hsl(${visitorHue(con.visitorFilter.value)} 70% 62%)` }"></i>Only visitor {{ visitorShort(con.visitorFilter.value) }}
                  <button aria-label="Show every visitor" @click="clearVisitor"><TripwiresIcon name="x" /></button>
                </span>
                <div class="twx-card__tools">
                  <label class="twx-searchbox"><TripwiresIcon name="search" /><input v-model="tripQuery" placeholder="Place, network, device…" aria-label="Filter trips" /></label>
                  <button v-if="intel" class="twx-btn twx-btn--sm" :aria-pressed="con.prefs.value.hideKnown" data-testid="toggle-known" @click="toggleKnown"><TripwiresIcon :name="con.prefs.value.hideKnown ? 'eye-off' : 'eye'" />{{ con.prefs.value.hideKnown ? 'KM accounts hidden' : 'KM accounts shown' }}</button>
                </div>
              </header>

              <template v-if="tab === 'trips'">
                <div v-if="con.eventsLoading.value && con.eventsFor.value !== selected.id" class="twx-skel-rows"><i v-for="n in 4" :key="n"></i></div>
                <div v-else-if="!detailTrips.length" class="twx-empty twx-empty--slim" data-testid="detail-empty">
                  <TripwiresIcon name="history" />
                  {{ con.events.value.length ? (hiddenKnown ? `All ${hiddenKnown} trips came from KM accounts.` : 'No trip matches.') : 'No trips yet. Copy the link above and share it.' }}
                </div>
                <div v-else class="twx-trips" data-testid="detail-trips">
                  <TripwiresTripRow v-for="e in detailTrips" :key="e.id" :event="e" :now="con.now.value" :intel="intel" :open="openTrip === e.id"
                    @toggle="toggleTrip(e.id)" @copy="text => con.copy(text, 'Address copied')" @visitor="con.filterVisitor" />
                </div>
                <p v-if="hiddenKnown && detailTrips.length" class="twx-foot" data-testid="known-hidden">{{ hiddenKnown }} trip{{ hiddenKnown === 1 ? '' : 's' }} from KM accounts hidden · <button class="twx-linkbtn" @click="toggleKnown">show</button></p>
                <p v-if="con.eventsTotal.value > con.events.value.length" class="twx-foot">Showing the newest {{ fmtInt(con.events.value.length) }} of {{ fmtInt(con.eventsTotal.value) }}. Export has the same {{ fmtInt(con.events.value.length) }}.</p>
              </template>

              <template v-else>
                <div v-if="con.visitorsFor.value !== selected.id" class="twx-skel-rows"><i v-for="n in 3" :key="n"></i></div>
                <div v-else-if="!visibleVisitors.length" class="twx-empty twx-empty--slim">{{ con.visitors.value.length ? 'Every visitor here is a KM account.' : 'No identified visitors yet.' }}</div>
                <div v-else class="twx-people" data-testid="visitors">
                  <button v-for="v in visibleVisitors" :key="v.visitorHash" class="twx-person" :data-testid="`visitor-${v.visitorHash}`" @click="con.filterVisitor(v.visitorHash)">
                    <span class="twx-visitor"><i :style="{ background: `hsl(${visitorHue(v.visitorHash)} 70% 62%)` }"></i>{{ visitorShort(v.visitorHash) }}</span>
                    <span class="twx-person__main">
                      <b class="twx-truncate">{{ place(v.latest) || 'No location' }}<span v-if="networkKind(v.latest.network)" class="twx-tag" :data-tone="NETWORK_TONE[networkKind(v.latest.network)!]">{{ NETWORK_LABEL[networkKind(v.latest.network)!] }}</span><span v-if="knownProfile(v.latest)" class="twx-chip twx-chip--you"><TripwiresIcon name="user" />{{ knownProfile(v.latest) }}</span></b>
                      <small class="twx-truncate">{{ [carrier(v.latest.network), device(v.latest)].filter(Boolean).join(' · ') || '—' }}</small>
                    </span>
                    <span class="twx-person__count"><b class="twx-num">{{ v.trips }}</b><small>trip{{ v.trips === 1 ? '' : 's' }}</small></span>
                    <span class="twx-person__when"><b>{{ ago(v.lastUtc, con.now.value) }}</b><small>{{ v.trips > 1 ? `first ${ago(v.firstUtc, con.now.value)}` : 'once' }}</small></span>
                    <span class="twx-person__also">
                      <template v-if="v.also.length"><small>also tripped</small><b class="twx-truncate">{{ v.also.map(a => `${a.name}${a.match === 'address' ? ' (same address)' : ''}`).join(', ') }}</b></template>
                    </span>
                  </button>
                </div>
              </template>
            </div>
          </section>
        </div>
      </template>
    </div>

    <TripwiresComposer :open="composerOpen" :tripwires="tripwires" :busy="composerBusy" :initial-url="composerUrl" :privacy="privacyAll" @close="composerOpen = false" @create="createFromComposer" />
    <TripwiresSettingsSheet v-if="settingsOpen && selected" ref="sheet" :tripwire="selected" :can-test="allowed.test" :privacy="privacyOf(selected)"
      @close="settingsOpen = false" @save="saveSettings" @test="selected && con.testAlert(selected)" @clear="selected && askClear(selected)" @delete="selected && askDelete(selected)" />
    <TripwiresPalette :open="paletteOpen" :commands="commands" @close="paletteOpen = false" />
    <TripwiresConfirm :request="confirmRequest" @done="confirmRequest = null" />

    <Teleport to="body">
      <div class="twx-layer twx-toasts" aria-live="polite">
        <div v-for="t in con.toasts.value" :key="t.id" class="twx-toast" :data-tone="t.tone" data-testid="twx-toast">
          <TripwiresIcon :name="t.tone === 'ok' ? 'check' : t.tone === 'crit' ? 'octagon-x' : 'info'" />
          <span>{{ t.text }}</span>
          <button v-if="t.action" class="twx-linkbtn" @click="t.action.run(); con.dismissToast(t.id)">{{ t.action.label }}</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useTripwires } from '~/composables/useTripwires';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import { fmtCompact, fmtInt } from '~/scripts/adminConsole';
import {
  NETWORK_LABEL, NETWORK_TONE, ago, carrier, cleanUrl, closedOutcome, closedWords, dayBins, device, eventsCsv, hostOf, hourOfDay,
  knownProfile, lastEdited, matchesEvent, nameFromUrl, networkKind, place, statusTone, visitorHue, visitorShort,
  type ConfirmRequest, type DayBin, type TwCommand, type TwEvent, type TwIssue, type TwSettings, type TwTarget, type TwTotals, type TwTripwire,
} from '~/scripts/tripwires';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Tripwires' });

const route = useRoute();
const router = useRouter();
const profileState = useCurrentProfile();
const con = useTripwires();
const allowed = computed(() => con.allowed.value);
const profileReady = computed(() => profileState.ready.value);

const quickUrl = ref('');
const quickBusy = ref(false);
const quickInput = ref<HTMLInputElement | null>(null);
const composerOpen = ref(false);
const composerBusy = ref(false);
const composerUrl = ref('');
const settingsOpen = ref(false);
const paletteOpen = ref(false);
const menuOpen = ref(false);
const confirmRequest = ref<ConfirmRequest | null>(null);
const sheet = ref<{ close: () => void } | null>(null);
const railQuery = ref('');
const tripQuery = ref('');
const openTrip = ref('');

const tripwires = computed(() => con.tripwires.value);
const selected = computed(() => con.selected.value);
const totals = computed<TwTotals>(() => con.overview.value?.totals ?? { tripwires: 0, active: 0, links: 0, trips24h: 0, trips7d: 0 });
const health = computed(() => con.overview.value?.health ?? null);
const intel = computed(() => Boolean(con.overview.value?.intel));
const issues = computed(() => con.issues.value);
const tab = computed(() => con.prefs.value.tab);
const s = computed(() => selected.value?.summary ?? null);
const quickClean = computed(() => cleanUrl(quickUrl.value));

// ───────────────────────────── bar ─────────────────────────────

const barTone = computed(() => (issues.value.some(i => i.tone === 'crit') ? 'crit' : issues.value.some(i => i.tone === 'warn') ? 'warn' : 'ok'));
const subline = computed(() => {
  if (!con.ready.value) return con.loadError.value ? 'not answering' : 'reading…';
  const t = totals.value;
  return `${t.active} of ${t.tripwires} live · ${fmtInt(t.trips24h)} trip${t.trips24h === 1 ? '' : 's'} today · last ${ago(t.lastTrippedUtc, con.now.value)}`;
});
const liveWord = computed(() => ({ live: 'Live', paused: 'Paused', stale: 'Stale', offline: 'Offline', connecting: 'Connecting' })[con.linkState.value]);
const liveTitle = computed(() => {
  const at = con.lastOkAt.value;
  const read = at ? `read ${ago(at, con.now.value)}` : 'not read yet';
  return con.prefs.value.live ? `Updates every 15 s (${read}). Click to pause.` : `Paused (${read}). Click to resume.`;
});

// ───────────────────────────── rail ─────────────────────────────

const railItems = computed(() => {
  const q = railQuery.value.trim().toLowerCase();
  const list = q ? tripwires.value.filter(t => t.name.toLowerCase().includes(q) || t.targets.some(x => x.label.toLowerCase().includes(q) || x.destinationUrl.toLowerCase().includes(q))) : tripwires.value;
  // Most recently tripped first, never-tripped last (newest made first among those).
  return [...list].sort((a, b) => (Date.parse(b.lastTrippedUtc ?? '') || 0) - (Date.parse(a.lastTrippedUtc ?? '') || 0)
    || (Date.parse(b.createdUtc) || 0) - (Date.parse(a.createdUtc) || 0));
});

function railSub(t: TwTripwire): string {
  if (t.status === 'Limit reached' && t.closedVisits) return `Limit reached · ${fmtInt(t.closedVisits)} turned away`;
  if (t.status !== 'Active') return t.status;
  const today = t.summary?.tripsLast24Hours ?? 0;
  if (!t.lastTrippedUtc) return `${t.targets.length} link${t.targets.length === 1 ? '' : 's'} · not tripped yet`;
  return `${today ? `${today} today · ` : ''}last ${ago(t.lastTrippedUtc, con.now.value)}`;
}

const allSub = computed(() => `${fmtInt(totals.value.trips7d)} this week`);

const allBins = computed<DayBin[]>(() => {
  const sums = new Map<string, DayBin>();
  for (const t of tripwires.value) {
    for (const bin of dayBins(t.summary, 14, con.now.value)) {
      const at = sums.get(bin.key);
      if (at) at.count += bin.count; else sums.set(bin.key, { ...bin });
    }
  }
  return sums.size ? [...sums.values()] : dayBins(null, 14, con.now.value);
});

// ───────────────────────────── trips ─────────────────────────────

const hideKnown = computed(() => intel.value && con.prefs.value.hideKnown);
const recentRaw = computed(() => con.overview.value?.recent ?? []);
const allTrips = computed(() => recentRaw.value.filter(e => (!hideKnown.value || !knownProfile(e)) && matchesEvent(e, tripQuery.value)));
const allNote = computed(() => {
  const hidden = hideKnown.value ? recentRaw.value.filter(e => knownProfile(e)).length : 0;
  return `newest ${recentRaw.value.length}${hidden ? ` · ${hidden} from KM accounts hidden` : ''}`;
});

const detailEvents = computed<TwEvent[]>(() => (selected.value && con.eventsFor.value === selected.value.id ? con.events.value : []));
const detailTrips = computed(() => detailEvents.value.filter(e => (!hideKnown.value || !knownProfile(e)) && matchesEvent(e, tripQuery.value)));
const hiddenKnown = computed(() => (hideKnown.value ? detailEvents.value.filter(e => knownProfile(e)).length : 0));
const visibleVisitors = computed(() => con.visitors.value.filter(v => !hideKnown.value || !knownProfile(v.latest)));

const peopleCount = computed(() => {
  const all = s.value?.visitors ?? 0;
  // People who are not KM accounts, when the visitor list is loaded and says who is who.
  if (intel.value && hideKnown.value && selected.value && con.visitorsFor.value === selected.value.id)
    return con.visitors.value.filter(v => !knownProfile(v.latest)).length;
  return all;
});
const peopleSub = computed(() => {
  if (!s.value) return '—';
  const privateTrips = s.value.privacySignalTrips ?? 0;
  const parts = [`${fmtInt(s.value.uniqueTrips)} unique trips`];
  if (privateTrips && selected.value?.settings.honourDoNotTrack) parts.push(`${fmtInt(privateTrips)} private`);
  return parts.join(' · ');
});

const detailBins = computed(() => dayBins(s.value, 30, con.now.value));
const busiestHour = computed(() => {
  const hours = hourOfDay(s.value);
  const max = Math.max(...hours);
  if (!max) return '';
  const h = hours.indexOf(max);
  return `busiest around ${String(h).padStart(2, '0')}:00`;
});

function share(count: number, total: number) { return total ? Math.max(4, Math.round((count / total) * 100)) : 0; }
function toggleTrip(id: string) { openTrip.value = openTrip.value === id ? '' : id; }
function toggleKnown() { con.prefs.value = { ...con.prefs.value, hideKnown: !con.prefs.value.hideKnown }; }
function clearVisitor() { con.visitorFilter.value = ''; void con.loadEvents(); }
async function openVisitor(tripwireId: string | undefined, hash: string) {
  if (!tripwireId) return;
  await open(tripwireId);
  con.filterVisitor(hash);
}

function privacyOf(t: TwTripwire) { return { signalled: t.summary?.privacySignalTrips ?? 0, total: t.summary?.retainedTrips ?? 0 }; }
const privacyAll = computed(() => tripwires.value.reduce((acc, t) => ({ signalled: acc.signalled + (t.summary?.privacySignalTrips ?? 0), total: acc.total + (t.summary?.retainedTrips ?? 0) }), { signalled: 0, total: 0 }));

const speedTone = computed(() => {
  const p95 = health.value?.answerP95Ms;
  return p95 != null && p95 > 1000 ? 'warn' : undefined;
});
function fmtMsShort(ms: number) { return ms < 1 ? '<1 ms' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`; }
function pathOf(url: string) { try { const u = new URL(url); const p = `${u.pathname}${u.search}`; return p === '/' ? '' : p; } catch { return ''; } }
function selectText(event: MouseEvent) {
  const range = document.createRange();
  range.selectNodeContents(event.currentTarget as Node);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function closedDetail(t: TwTripwire) {
  const visits = t.closedVisits ?? 0;
  const since = visits > 0 ? ` ${fmtInt(visits)} visit${visits === 1 ? '' : 's'} arrived since, the last ${ago(t.lastClosedUtc, con.now.value)}.` : '';
  return `${closedOutcome(t)}${since}`;
}

function closedHeadline(t: TwTripwire) {
  if (t.status === 'Disabled') return 'Paused.';
  if (t.status === 'Limit reached') return `Reached its limit of ${fmtInt(t.settings.maxTrips)} trips.`;
  if (t.status === 'Expired') return `Expired ${ago(t.settings.expiresUtc, con.now.value)}.`;
  if (t.status === 'No active links') return 'Every link is off.';
  return `It ${closedWords(t.closedReason)}.`;
}

// ───────────────────────────── actions ─────────────────────────────

async function open(id: string) {
  menuOpen.value = false;
  openTrip.value = '';
  await con.select(id);
  const query = { ...route.query } as Record<string, string>;
  if (id) query.id = id; else delete query.id;
  if (query.id !== route.query.id) void router.replace({ query });
}

async function quickCreate() {
  const url = quickClean.value;
  if (!url || quickBusy.value) return;
  quickBusy.value = true;
  try {
    const created = await con.quickCreate(url, nameFromUrl(url), lastEdited(tripwires.value));
    if (created) {
      quickUrl.value = '';
      const link = created.targets[0]?.trackingUrl;
      if (link) {
        const copied = await navigator.clipboard.writeText(link).then(() => true, () => false);
        con.toast('ok', copied ? `Made ${created.name}. Its link is on your clipboard.` : `Made ${created.name}.`, { label: 'Settings', run: () => { settingsOpen.value = true; } });
      }
      await open(created.id);
    }
  } finally { quickBusy.value = false; }
}

function openComposer(url = '') {
  composerUrl.value = cleanUrl(url) ?? url;
  composerOpen.value = true;
}

async function createFromComposer(payload: { name: string; targets: { label: string; destinationUrl: string }[]; settings: TwSettings }) {
  composerBusy.value = true;
  try {
    const created = await con.create(payload);
    if (created) {
      composerOpen.value = false;
      quickUrl.value = '';
      con.toast('ok', `${created.targets.length} link${created.targets.length === 1 ? '' : 's'} made for ${created.name}`);
      await open(created.id);
    }
  } finally { composerBusy.value = false; }
}

async function saveSettings(patch: { name: string; settings: TwSettings; targets: Partial<TwTarget>[] }, done: (ok: boolean) => void) {
  if (!selected.value) return done(false);
  done(await con.update(selected.value.id, patch));
}

async function copyLinks(t: TwTripwire) {
  const live = t.targets.filter(x => x.enabled);
  const list = live.length ? live : t.targets;
  await con.copy(list.length === 1 ? list[0].trackingUrl : list.map(x => `${x.label}: ${x.trackingUrl}`).join('\n'), list.length === 1 ? 'Link copied' : `${list.length} links copied`);
}

function ask(title: string, text: string, confirm: string): Promise<boolean> {
  return new Promise(resolve => { confirmRequest.value = { title, text, confirm, resolve }; });
}

async function askClear(t: TwTripwire) {
  if (await ask(`Clear the history of ${t.name}?`, `Every kept trip (${fmtInt(t.summary?.retainedTrips ?? t.totalTrips)}) and the counters go. The links keep working. This cannot be undone.`, 'Clear history'))
    await con.clearHistory(t);
}

async function askDelete(t: TwTripwire) {
  if (await ask(`Delete ${t.name}?`, `Its ${t.targets.length} link${t.targets.length === 1 ? ' stops' : 's stop'} working at once and every trip it kept is deleted. This cannot be undone.`, 'Delete tripwire')) {
    settingsOpen.value = false;
    await con.remove(t);
  }
}

async function raiseLimit(t: TwTripwire) {
  const next = Math.max((t.settings.maxTrips ?? 0) * 2, t.totalTrips + 10);
  const ok = await con.update(t.id, { settings: { maxTrips: next } }, true);
  if (ok) con.toast('ok', `${t.name} takes trips again, up to ${fmtInt(next)}`, { label: 'Settings', run: () => { settingsOpen.value = true; } });
}

function openIssue(issue: TwIssue) {
  if (!issue.tripwireId) return;
  void open(issue.tripwireId).then(() => { if (issue.action === 'settings' && allowed.value.manage) settingsOpen.value = true; });
}

function exportTrips() {
  const t = selected.value;
  const rows = detailEvents.value.map(e => ({ ...e, tripwireName: e.tripwireName ?? t?.name }));
  const blob = new Blob([`﻿${eventsCsv(rows)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(t?.name ?? 'tripwire').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-trips.csv`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

// ───────────────────────────── palette + keys ─────────────────────────────

const commands = computed<TwCommand[]>(() => {
  const list: TwCommand[] = [];
  if (allowed.value.manage) list.push({ id: 'new', title: 'New tripwire', group: 'Actions', hint: 'N', keywords: 'create make add', run: () => openComposer(quickUrl.value) });
  list.push({ id: 'all', title: 'All activity', group: 'Actions', keywords: 'overview latest trips feed', run: () => open('') });
  list.push({ id: 'known', title: con.prefs.value.hideKnown ? 'Show trips from KM accounts' : 'Hide trips from KM accounts', group: 'Actions', keywords: 'me mine tests own', run: toggleKnown });
  list.push({ id: 'refresh', title: 'Refresh now', group: 'Actions', hint: 'R', keywords: 'reload', run: () => con.refresh() });
  const t = selected.value;
  if (t) {
    list.push({ id: 'copy', title: `Copy ${t.name}'s link`, group: 'Actions', hint: 'C', keywords: 'clipboard share', run: () => copyLinks(t) });
    if (allowed.value.manage) {
      list.push({ id: 'pause', title: `${t.settings.enabled ? 'Pause' : 'Resume'} ${t.name}`, group: 'Actions', hint: 'P', keywords: 'disable enable stop start', run: () => con.setEnabled(t, !t.settings.enabled) });
      list.push({ id: 'settings', title: `Settings of ${t.name}`, group: 'Actions', hint: 'S', keywords: 'edit configure', run: () => { settingsOpen.value = true; } });
      list.push({ id: 'dup', title: `Duplicate ${t.name}`, group: 'Actions', keywords: 'copy clone', run: () => con.duplicate(t) });
    }
    list.push({ id: 'export', title: `Export ${t.name}'s trips`, group: 'Actions', keywords: 'csv download', run: exportTrips });
  }
  for (const w of tripwires.value) {
    list.push({ id: `open-${w.id}`, title: w.name, group: 'Tripwires', keywords: `${w.status} ${w.targets.map(x => `${x.label} ${x.destinationUrl}`).join(' ')}`, run: () => open(w.id) });
    for (const target of w.targets) list.push({ id: `link-${target.id}`, title: `Copy ${w.name}: ${target.label}`, group: 'Links', keywords: target.destinationUrl, run: () => con.copy(target.trackingUrl) });
  }
  return list;
});

function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

function onKey(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); paletteOpen.value = !paletteOpen.value; return; }
  if (event.target === quickInput.value && event.key === 'Enter' && event.shiftKey) { event.preventDefault(); openComposer(quickUrl.value); return; }
  // Esc closes the open layer wherever the focus is (the layer's own handler covers focus inside it).
  if (event.key === 'Escape' && !paletteOpen.value && !confirmRequest.value) {
    if (settingsOpen.value && !(event.target as HTMLElement | null)?.closest?.('.twx-sheet')) { sheet.value?.close(); return; }
    if (composerOpen.value && !(event.target as HTMLElement | null)?.closest?.('.twx-composer')) { composerOpen.value = false; return; }
  }
  if (event.ctrlKey || event.metaKey || event.altKey || typing(event.target) || paletteOpen.value || composerOpen.value || settingsOpen.value || confirmRequest.value) return;
  const t = selected.value;
  switch (event.key) {
    case '/': event.preventDefault(); quickInput.value?.focus(); break;
    case 'n': case 'N': if (allowed.value.manage) { event.preventDefault(); openComposer(); } break;
    case 'r': case 'R': void con.refresh(); break;
    case 'c': case 'C': if (t) { event.preventDefault(); void copyLinks(t); } break;
    case 's': case 'S': if (t && allowed.value.manage) { event.preventDefault(); settingsOpen.value = true; } break;
    case 'p': case 'P': if (t && allowed.value.manage) { event.preventDefault(); void con.setEnabled(t, !t.settings.enabled); } break;
    case 'j': case 'k': case 'J': case 'K': {
      const ids = ['', ...railItems.value.map(x => x.id)];
      const at = ids.indexOf(t?.id ?? '');
      const next = ids[Math.min(ids.length - 1, Math.max(0, at + (event.key.toLowerCase() === 'j' ? 1 : -1)))];
      if (next !== (t?.id ?? '')) void open(next);
      break;
    }
    case 'Escape': menuOpen.value = false; openTrip.value = ''; break;
  }
}

function onDocClick(event: MouseEvent) {
  if (menuOpen.value && !(event.target as HTMLElement | null)?.closest('.twx-menu')) menuOpen.value = false;
}

// A pasted link anywhere on the page (not into a field) goes into the quick bar.
function onPaste(event: ClipboardEvent) {
  if (typing(event.target) || !allowed.value.manage || composerOpen.value || settingsOpen.value) return;
  const text = event.clipboardData?.getData('text') ?? '';
  if (!cleanUrl(text)) return;
  event.preventDefault();
  quickUrl.value = text.trim();
  void nextTick(() => quickInput.value?.focus());
}

watch(() => route.query.id, id => {
  const want = typeof id === 'string' ? id : '';
  if (want !== con.selectedId.value) void con.select(want);
});

// The selected tripwire was deleted elsewhere: back to everything.
watch(() => con.selectedId.value, id => { if (!id && route.query.id) void router.replace({ query: { ...route.query, id: undefined } }); });

onMounted(() => {
  const id = typeof route.query.id === 'string' ? route.query.id : '';
  if (id) void con.select(id);
  window.addEventListener('keydown', onKey);
  document.addEventListener('click', onDocClick);
  document.addEventListener('paste', onPaste);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('paste', onPaste);
});
</script>

<style lang="scss" src="~/assets/scss/tripwires.scss"></style>
