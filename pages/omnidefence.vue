<template>
    <div class="od-shell">
        <header class="od-header">
            <div>
                <div class="od-kicker"><span class="live-dot"></span> DEFENCE GRID ONLINE</div>
                <h1>OmniDefence</h1>
                <p>API telemetry, profile actions, IP reputation, honeypots, and response tools.</p>
            </div>
            <div class="od-header-actions">
                <span class="refresh-stamp">{{ busyLabel || lastUpdatedLabel }}</span>
                <button class="od-btn ghost" :disabled="isBusy" @click="refreshActive">Refresh</button>
                <button class="od-btn danger" :disabled="loading.requests" @click="showOnlyDenied">Denied Feed</button>
            </div>
        </header>

        <section class="od-map-panel">
            <div class="map-head">
                <div>
                    <span class="panel-code">MAP</span>
                    <h2>World Tactical Map</h2>
                </div>
                <div class="map-actions">
                    <span class="refresh-stamp">{{ loading.map ? 'Mapping IPs' : filteredMapPoints.length + ' visible' }}</span>
                    <div class="map-filters" role="group" aria-label="Map filter">
                        <button :class="{ active: mapFilter === 'all' }" @click="mapFilter = 'all'">All</button>
                        <button :class="{ active: mapFilter === 'attackers' }" @click="mapFilter = 'attackers'">Only Attackers</button>
                        <button :class="{ active: mapFilter === 'profiled' }" @click="mapFilter = 'profiled'">Only Profiled</button>
                        <label class="map-toggle" :class="{ active: hideApproximateMapPoints }" title="Hide country-only or fallback coordinates">
                            <input type="checkbox" v-model="hideApproximateMapPoints" /> Exact Geo
                        </label>
                    </div>
                    <div class="map-filters" role="group" aria-label="Map mode">
                        <button :class="{ active: !boxMode }" @click="boxMode = false" title="Pan and zoom">Pan</button>
                        <button :class="{ active: boxMode }" @click="boxMode = true" title="Drag a box to mass-block IPs in a region">Box Block</button>
                    </div>
                    <div class="map-filters" role="group" aria-label="Zoom">
                        <button @click="zoomMap(1.4)" title="Zoom in">+</button>
                        <button @click="zoomMap(1/1.4)" title="Zoom out">-</button>
                        <button @click="resetMapView" title="Reset view">Reset</button>
                    </div>
                </div>
            </div>
            <div class="map-layout">
                <div class="world-map-stage" :class="{ loading: loading.map, 'box-mode': boxMode }">
                    <div ref="leafletMap" class="leaflet-threat-map" role="application" aria-label="World tactical threat map"></div>
                    <div v-if="!leafletReady" class="map-loading"><span class="spinner"></span>Loading map</div>
                    <div v-if="!filteredMapPoints.length && !loading.map" class="map-empty">No IPs for this filter</div>
                    <div v-if="boxMode" class="map-mode-tag">BOX BLOCK MODE - drag a region</div>
                    <div v-if="pendingBoxBlock" class="map-box-popover" :class="[{ working: boxBlockAnimating }, pendingBoxBlock.placement]" :style="boxPopoverStyle">
                        <span>Region Block</span>
                        <strong>Save live region block</strong>
                        <small>{{ pendingBoxBlock.boundsLabel }} / {{ pendingBoxBlock.blockable.length }} current target{{ pendingBoxBlock.blockable.length === 1 ? '' : 's' }}</small>
                        <input v-model="pendingBoxBlock.reason" :disabled="boxBlockAnimating" class="map-box-reason" />
                        <div v-if="boxBlockAnimating" class="map-box-progress"><span class="spinner"></span>{{ pendingBoxBlock.statusText || 'Saving region rule' }}</div>
                        <div v-else-if="pendingBoxBlock.statusText" class="map-box-progress complete">{{ pendingBoxBlock.statusText }}</div>
                        <div class="map-box-actions">
                            <button class="micro danger" :disabled="boxBlockAnimating" @click="runBoxBlock">Confirm</button>
                            <button class="micro" :disabled="boxBlockAnimating" @click="cancelBoxBlock">Cancel</button>
                        </div>
                    </div>
                    <div class="map-zoom-tag">Z{{ leafletZoom }} / Web Mercator</div>
                </div>
                <aside class="map-intel">
                    <div class="map-stat"><span>Mapped</span><strong>{{ fmtNum(filteredMapPoints.length) }}</strong></div>
                    <div class="map-stat"><span>Attackers</span><strong>{{ fmtNum(mapAttackersCount) }}</strong></div>
                    <div class="map-stat"><span>Profiled</span><strong>{{ fmtNum(mapProfiledCount) }}</strong></div>
                    <div class="map-stat"><span>Recent</span><strong>{{ fmtNum(mapRecentCount) }}</strong></div>
                    <div class="map-legend">
                        <div><span class="legend-dot attacker"></span>Attacker</div>
                        <div><span class="legend-dot attacker recent"></span>Recent attacker</div>
                        <div><span class="legend-dot profile"></span>Profile</div>
                        <div><span class="legend-dot profile recent"></span>Recent profile</div>
                        <div><span class="legend-icon cross"></span>Blocked</div>
                        <div><span class="legend-icon ring"></span>Honeypot trap</div>
                        <div><span class="legend-icon strike"></span>Tarpitted</div>
                    </div>
                    <div v-if="selectedIp" class="map-selected">
                        <span>{{ selectedIp.profileName ? 'Profile' : 'Attacker' }}</span>
                        <strong>{{ selectedIp.ip }}</strong>
                        <small>{{ formatGeo(selectedIp) }} / {{ fmtTime(selectedIp.lastSeen) }}</small>
                    </div>
                </aside>
            </div>
        </section>

        <section class="od-metrics">
            <button class="metric-tile" @click="activeTab = 'activity'">
                <span class="metric-copy"><span class="metric-label">Requests 24h</span><small>{{ fmtNum(overview?.totalRequests) }} total</small></span>
                <strong>{{ fmtNum(overview?.requests24h) }}</strong>
            </button>
            <button class="metric-tile danger" @click="showOnlyDenied">
                <span class="metric-copy"><span class="metric-label">Denied 24h</span><small>{{ fmtNum(overview?.totalDenied) }} total</small></span>
                <strong>{{ fmtNum(overview?.denied24h) }}</strong>
            </button>
            <button class="metric-tile warn" @click="activeTab = 'auth'">
                <span class="metric-copy"><span class="metric-label">Auth failures 24h</span><small>{{ fmtNum(overview?.totalAuthEvents) }} events</small></span>
                <strong>{{ fmtNum(overview?.authFailures24h || overview?.unauth24h) }}</strong>
            </button>
            <button class="metric-tile cyan" @click="activeTab = 'ips'">
                <span class="metric-copy"><span class="metric-label">Tracked IPs</span><small>{{ fmtNum(overview?.blockedIps) }} blocked</small></span>
                <strong>{{ fmtNum(overview?.knownIps || overview?.totalIps) }}</strong>
            </button>
            <button class="metric-tile violet" @click="activeTab = 'honeypot'">
                <span class="metric-copy"><span class="metric-label">Traps</span><small>{{ fmtNum(overview?.tarpitIps) }} tarpits</small></span>
                <strong>{{ fmtNum(overview?.honeypotIps) }}</strong>
            </button>
        </section>

        <section class="od-grid">
            <aside class="od-rail">
                <nav class="od-tabs">
                    <button v-for="tab in tabs" :key="tab.id" :class="['od-tab', { active: activeTab === tab.id }]" @click="activeTab = tab.id">
                        <span>{{ tab.code }}</span>{{ tab.label }}
                    </button>
                </nav>

                <div class="rail-section">
                    <h3>Request Origin</h3>
                    <div v-for="origin in originBreakdown" :key="origin.origin" class="origin-row">
                        <span>{{ origin.origin }}</span><strong>{{ fmtNum(origin.hits) }}</strong>
                    </div>
                    <div v-if="!originBreakdown.length" class="empty-rail">No origin data</div>
                </div>

                <div class="rail-section">
                    <h3>Top Threats</h3>
                    <button v-for="ip in topAttackers" :key="ip.ip" class="threat-row" @click="selectIp(ip.ip)">
                        <span class="threat-ip">{{ ip.ip }}</span>
                        <span class="threat-meta">{{ Math.round(ip.score || 0) }} / {{ ip.status || 'Normal' }}</span>
                    </button>
                    <div v-if="!topAttackers.length" class="empty-rail">No threats</div>
                </div>
            </aside>

            <main class="od-panel">
                <div class="panel-head">
                    <div>
                        <span class="panel-code">{{ activeTabLabel.code }}</span>
                        <h2>{{ activeTabLabel.label }}</h2>
                    </div>
                    <span class="panel-state" :class="loadError ? 'bad' : 'good'"><span v-if="isBusy" class="spinner"></span>{{ loadError ? 'API DEGRADED' : 'LIVE' }}</span>
                </div>

                <section v-if="activeTab === 'activity'" class="panel-body">
                    <div class="control-grid activity-controls">
                        <input v-model="filters.requests.ip" placeholder="IP" />
                        <input v-model="filters.requests.profile" placeholder="Profile" />
                        <input v-model="filters.requests.route" placeholder="Route" />
                        <select v-model="filters.requests.status">
                            <option value="">Any status</option>
                            <option value="2xx">2xx</option><option value="3xx">3xx</option>
                            <option value="4xx">4xx</option><option value="5xx">5xx</option>
                        </select>
                        <select v-model="filters.requests.method">
                            <option value="">Any method</option>
                            <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option>
                        </select>
                        <select v-model="filters.requests.origin">
                            <option value="">Any origin</option>
                            <option>DirectApi</option><option>DirectApiProfile</option>
                            <option>WebsiteProfile</option><option>WebsiteNoProfile</option>
                            <option>WebsiteInvalidProfile</option><option>WebsitePublicNoProfile</option>
                        </select>
                        <label class="checkline"><input type="checkbox" v-model="filters.requests.denyOnly" /> Denied only</label>
                        <button class="od-btn" :disabled="loading.requests" @click="loadRequests">Apply</button>
                        <button class="od-btn ghost" :disabled="loading.action" @click="exportTable('requests')">Export CSV</button>
                    </div>
                    <div class="table-shell" :class="{ refreshing: loading.requests }">
                        <div v-if="loading.requests" class="table-loading-overlay"><span class="spinner"></span>Loading activity</div>
                        <table>
                            <thead><tr><th>Time</th><th>IP</th><th>Origin</th><th>Method</th><th>Route</th><th>Status</th><th>Profile</th><th>Reason</th><th>Ms</th></tr></thead>
                            <TransitionGroup name="table-row-fade" tag="tbody">
                                <tr v-for="row in requests" :key="row.id" :class="['clickable-row', rowClass(row)]" :title="'Click for full request detail'" @click="viewRequestDetail(row.id)">
                                    <td>{{ fmtTime(row.ts) }}</td>
                                    <td><button class="link-btn" @click.stop="selectIp(row.ip)">{{ row.ip || 'unknown' }}</button></td>
                                    <td><span :class="originClass(row.origin)">{{ row.origin || 'Unknown' }}</span></td>
                                    <td>{{ row.method }}</td>
                                    <td class="clip">{{ row.route }}</td>
                                    <td :class="statusClass(row.status)">{{ row.status }}</td>
                                    <td>{{ row.profile || '-' }}</td>
                                    <td class="clip">{{ row.reason || '-' }}</td>
                                    <td>{{ Math.round(row.duration || 0) }}</td>
                                </tr>
                                <tr v-if="!requests.length" key="empty-requests"><td colspan="9" class="empty-cell">No request records</td></tr>
                            </TransitionGroup>
                        </table>
                    </div>
                    <div class="pager">
                        <button class="od-btn ghost" @click="pageRequests(-1)">Prev</button>
                        <span>Offset {{ filters.requests.offset }} / Limit {{ filters.requests.limit }}</span>
                        <button class="od-btn ghost" @click="pageRequests(1)">Next</button>
                    </div>
                </section>

                <section v-if="activeTab === 'ips'" class="panel-body">
                    <div class="control-grid ip-controls">
                        <input v-model="filters.ips.query" placeholder="IP, country, note" />
                        <select v-model="filters.ips.status"><option value="">Any status</option><option>Normal</option><option>Watch</option><option>Blocked</option><option>Tarpit</option><option>Honeypot</option></select>
                        <button class="od-btn" :disabled="loading.ips" @click="loadIps">Apply</button>
                    </div>
                    <div v-if="loading.ips" class="loading-strip"><span class="spinner"></span>Loading IP control</div>
                    <div class="table-shell">
                        <table>
                            <thead><tr><th>IP</th><th>Geo</th><th>KM Profile</th><th>Status</th><th>Score</th><th>Total</th><th>Unauth</th><th>Deny</th><th>Last Seen</th><th>Response</th></tr></thead>
                            <tbody>
                                <tr v-for="ip in ips" :key="ip.ip" :class="ipClass(ip)" @dblclick="openActivityForIp(ip.ip)">
                                    <td><button class="link-btn" @click="selectIp(ip.ip)">{{ ip.ip }}</button></td>
                                    <td>{{ formatGeo(ip) }} <span class="muted">{{ ip.isp || ip.org || ip.asn || '' }}</span></td>
                                    <td><span :class="ip.profileName ? 'profile-pill' : 'attacker-pill'">{{ ip.profileName || 'Attacker' }}</span></td>
                                    <td>{{ ip.status }}</td><td>{{ Math.round(ip.score || 0) }}</td><td>{{ ip.total }}</td><td>{{ ip.unauth }}</td><td>{{ ip.deny }}</td>
                                    <td>{{ fmtTime(ip.lastSeen) }}</td>
                                    <td class="action-row">
                                        <button class="micro release" :disabled="loading.action" @click="untrapIp(ip.ip)" v-if="isHostileStatus(ip.status)">Untrap</button>
                                        <button class="micro danger" :disabled="loading.action" @click="blockIp(ip.ip)" v-if="ip.status !== 'Blocked' && !ip.isKlives">Block</button>
                                        <button class="micro warn" :disabled="loading.action" title="Tarpit slows hostile requests with deliberate response delay." @click="setIpStatus(ip.ip, 'Tarpit')" v-if="ip.status !== 'Tarpit' && !ip.isKlives">Tarpit</button>
                                        <button class="micro cyan" :disabled="loading.action" title="Trap serves junk honeypot responses instead of normal API data." @click="setIpStatus(ip.ip, 'Honeypot')" v-if="ip.status !== 'Honeypot' && !ip.isKlives">Trap</button>
                                        <span v-if="ip.isKlives" class="protected-chip">Klives protected</span>
                                        <button class="micro" :disabled="loading.action" @click="scanIp(ip.ip)">Scan</button>
                                    </td>
                                </tr>
                                <tr v-if="!ips.length"><td colspan="10" class="empty-cell">No IP records</td></tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                <section v-if="activeTab === 'auth'" class="panel-body">
                    <div class="control-grid auth-controls">
                        <input v-model="filters.auth.ip" placeholder="IP" />
                        <input v-model="filters.auth.profile" placeholder="Profile" />
                        <select v-model="filters.auth.type"><option value="">Any type</option><option>WebsiteNoProfile</option><option>WebsiteInvalidProfile</option><option>UnauthRoute</option><option>InvalidPassword</option><option>InsufficientClearance</option><option>Login</option></select>
                        <button class="od-btn" :disabled="loading.auth" @click="loadAuthEvents">Apply</button>
                    </div>
                    <div v-if="loading.auth" class="loading-strip"><span class="spinner"></span>Loading auth events</div>
                    <div class="table-shell">
                        <table>
                            <thead><tr><th>Time</th><th>Type</th><th>IP</th><th>Profile</th><th>Route</th><th>Detail</th></tr></thead>
                            <tbody>
                                <tr v-for="event in authEvents" :key="event.id" :class="['clickable-row', authClass(event.type)]" :title="'Click for full auth event detail'" @click="viewAuthDetail(event)"><td>{{ fmtTime(event.ts) }}</td><td>{{ event.type }}</td><td>{{ event.ip || '-' }}</td><td>{{ event.profile || '-' }}</td><td class="clip">{{ event.route || '-' }}</td><td class="clip">{{ event.detail || '-' }}</td></tr>
                                <tr v-if="!authEvents.length"><td colspan="6" class="empty-cell">No auth events</td></tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                <section v-if="activeTab === 'profiles'" class="panel-body">
                    <div class="control-grid profile-controls">
                        <input v-model="filters.profile.profile" placeholder="Profile" />
                        <input v-model="filters.profile.category" placeholder="Category" />
                        <button class="od-btn" :disabled="loading.profile" @click="loadProfileActions">Apply</button>
                    </div>
                    <div v-if="loading.profile" class="loading-strip"><span class="spinner"></span>Loading profile actions</div>
                    <div class="table-shell">
                        <table>
                            <thead><tr><th>Time</th><th>Profile</th><th>Category</th><th>Action</th><th>IP</th><th>Detail</th></tr></thead>
                            <tbody>
                                <tr v-for="action in profileActions" :key="action.id"><td>{{ fmtTime(action.ts) }}</td><td>{{ action.profile || '-' }}</td><td>{{ action.category }}</td><td>{{ action.action }}</td><td>{{ action.ip || '-' }}</td><td class="clip">{{ action.detail || '-' }}</td></tr>
                                <tr v-if="!profileActions.length"><td colspan="6" class="empty-cell">No profile actions</td></tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                <section v-if="activeTab === 'honeypot'" class="panel-body">
                    <div class="control-grid honey-controls">
                        <input v-model="newHoneypotRoute" placeholder="/wp-admin" />
                        <button class="od-btn cyan" :disabled="loading.action" @click="addHoneypotRoute">Arm Route</button>
                        <button class="od-btn ghost" :disabled="loading.honeypot" @click="loadHoneypotRoutes">Refresh</button>
                    </div>
                    <div v-if="loading.honeypot" class="loading-strip"><span class="spinner"></span>Loading honeypots</div>
                    <div class="table-shell">
                        <table>
                            <thead><tr><th>Route</th><th>Kind</th><th>Hits</th><th>Last Hit</th><th>Note</th><th></th></tr></thead>
                            <tbody>
                                <tr v-for="route in honeypotRoutes" :key="route.route"><td>{{ route.route }}</td><td>{{ route.responseKind || 'JunkJson' }}</td><td>{{ route.hits || 0 }}</td><td>{{ fmtTime(route.lastHit) }}</td><td class="clip">{{ route.note || '-' }}</td><td><button class="micro danger" @click="removeHoneypotRoute(route.route)">Remove</button></td></tr>
                                <tr v-if="!honeypotRoutes.length"><td colspan="6" class="empty-cell">No honeypots armed</td></tr>
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>

            <aside class="od-detail">
                <div class="detail-block primary" v-if="selectedIp">
                    <div class="detail-title">{{ selectedIp.ip }}</div>
                    <div class="detail-sub">{{ formatGeo(selectedIp) }} / {{ selectedIp.isp || selectedIp.org || selectedIp.asn || 'Unknown network' }}</div>
                    <div :class="selectedIp.profileName ? 'identity-chip profile' : 'identity-chip attacker'">{{ selectedIp.profileName ? 'KMProfile: ' + selectedIp.profileName : 'No KMProfile matched' }}</div>
                    <div class="score-ring"><span>{{ Math.round(selectedIp.score || 0) }}</span><small>{{ selectedIp.status }}</small></div>
                    <div class="detail-grid">
                        <div><span>Total</span><strong>{{ selectedIp.total }}</strong></div>
                        <div><span>Denied</span><strong>{{ selectedIp.deny }}</strong></div>
                        <div><span>Unauth</span><strong>{{ selectedIp.unauth }}</strong></div>
                        <div><span>Rank</span><strong>{{ selectedIp.profileRank ?? '-' }}</strong></div>
                        <div><span>Last Seen</span><strong>{{ fmtTime(selectedIp.lastSeen) }}</strong></div>
                    </div>
                    <textarea v-model="selectedIpNote" placeholder="Operator note"></textarea>
                    <div class="detail-actions">
                        <button class="od-btn" :disabled="loading.action" @click="saveSelectedIpNote">Save Note</button>
                        <button class="od-btn release" :disabled="loading.action" @click="untrapIp(selectedIp.ip)" v-if="isHostileStatus(selectedIp.status)">Untrap IP</button>
                        <button class="od-btn danger" :disabled="loading.action" @click="blockIp(selectedIp.ip)" v-if="selectedIp.status !== 'Blocked' && !selectedIp.isKlives">Block</button>
                        <button class="od-btn ghost" :disabled="loading.action" @click="scanIp(selectedIp.ip)">Scan</button>
                    </div>
                </div>
                <div class="detail-block" v-else>
                    <div class="detail-title">No IP selected</div>
                    <div class="detail-sub">Select an IP from Activity, IPs, or Top Threats.</div>
                </div>

                <div class="detail-block" v-if="lastScan">
                    <div class="detail-title">Port Scan</div>
                    <div class="detail-sub">{{ lastScan.ip }} / {{ lastScan.openPorts?.length || 0 }} open</div>
                    <div class="port-list" v-if="lastScan.openPorts?.length">
                        <div v-for="port in lastScan.openPorts" :key="port.port"><strong>{{ port.port }}</strong><span>{{ port.banner || 'open' }}</span></div>
                    </div>
                    <div class="empty-rail" v-else>No open ports detected</div>
                </div>

                <div class="detail-block">
                    <div class="detail-title">Top Routes</div>
                    <div v-for="route in topRoutes" :key="route.route" class="route-row"><span>{{ route.route }}</span><strong>{{ route.hits }}</strong></div>
                    <div v-if="!topRoutes.length" class="empty-rail">No route data</div>
                </div>
            </aside>
        </section>

        <div v-if="loadError" class="od-error">{{ loadError }}</div>

        <div v-if="requestDetail || loading.requestDetail" class="od-modal-backdrop" @click.self="closeRequestDetail">
            <div class="od-modal" role="dialog" aria-modal="true" aria-labelledby="od-modal-title">
                <header class="od-modal-head">
                    <div>
                        <span class="panel-code">REQ</span>
                        <h2 id="od-modal-title">Request Detail</h2>
                        <small v-if="requestDetail">#{{ requestDetail.id }} / {{ fmtTime(requestDetail.utc_ts) }}</small>
                    </div>
                    <button class="od-btn ghost" @click="closeRequestDetail">Close</button>
                </header>
                <div v-if="loading.requestDetail" class="od-modal-loading"><span class="spinner"></span>Loading request</div>
                <div v-else-if="requestDetail" class="od-modal-body">
                    <div class="od-detail-grid">
                        <div><span>Method</span><strong>{{ requestDetail.method || '-' }}</strong></div>
                        <div><span>Status</span><strong :class="statusClass(requestDetail.status_code)">{{ requestDetail.status_code }}</strong></div>
                        <div><span>Duration</span><strong>{{ Math.round(Number(requestDetail.duration_ms) || 0) }} ms</strong></div>
                        <div><span>Origin</span><strong>{{ requestDetail.request_origin || '-' }}</strong></div>
                        <div><span>Matched Route</span><strong>{{ Number(requestDetail.matched_route) ? 'Yes' : 'No' }}</strong></div>
                        <div><span>Perm Required</span><strong>{{ requestDetail.perm_required ?? '-' }}</strong></div>
                        <div><span>IP</span><strong><button v-if="requestDetail.ip" class="link-btn" @click="selectIp(requestDetail.ip); closeRequestDetail();">{{ requestDetail.ip }}</button><template v-else>-</template></strong></div>
                        <div><span>Profile</span><strong>{{ requestDetail.profile_name || requestDetail.profile_id || '-' }}<small v-if="requestDetail.profile_rank != null"> (rank {{ requestDetail.profile_rank }})</small></strong></div>
                        <div><span>Deny Reason</span><strong>{{ requestDetail.deny_reason || '-' }}</strong></div>
                        <div><span>Client Page</span><strong class="clip" :title="requestDetail.client_page || ''">{{ requestDetail.client_page || '-' }}</strong></div>
                        <div><span>User-Agent</span><strong class="clip" :title="requestDetail.user_agent || ''">{{ requestDetail.user_agent || '-' }}</strong></div>
                        <div><span>Body Length</span><strong>{{ fmtNum(requestDetail.body_length) }} bytes<small v-if="Number(requestDetail.body_truncated)"> (stored truncated)</small></strong></div>
                    </div>

                    <div class="od-detail-section">
                        <div class="od-detail-section-head"><h3>Route</h3></div>
                        <pre class="od-detail-code">{{ requestDetail.method }} {{ requestDetail.route }}{{ requestDetail.query || '' }}</pre>
                    </div>

                    <div class="od-detail-section" v-if="requestDetailQueryPairs.length">
                        <div class="od-detail-section-head">
                            <h3>Query Parameters</h3>
                            <button class="micro" @click="copyToClipboard(requestDetail.query || '')">Copy</button>
                        </div>
                        <table class="od-kv-table">
                            <thead><tr><th>Key</th><th>Value</th></tr></thead>
                            <tbody><tr v-for="(pair, idx) in requestDetailQueryPairs" :key="idx"><td>{{ pair.key }}</td><td class="clip" :title="pair.value">{{ pair.value }}</td></tr></tbody>
                        </table>
                    </div>

                    <div class="od-detail-section">
                        <div class="od-detail-section-head">
                            <h3>Headers</h3>
                            <button class="micro" :disabled="!requestDetailHeaderPairs.length" @click="copyToClipboard(JSON.stringify(requestDetail.headers || {}, null, 2))">Copy</button>
                        </div>
                        <table class="od-kv-table" v-if="requestDetailHeaderPairs.length">
                            <thead><tr><th>Header</th><th>Value</th></tr></thead>
                            <tbody><tr v-for="(pair, idx) in requestDetailHeaderPairs" :key="idx"><td>{{ pair.key }}</td><td class="clip" :title="pair.value">{{ pair.value }}</td></tr></tbody>
                        </table>
                        <div v-else class="empty-rail">No headers captured</div>
                    </div>

                    <div class="od-detail-section">
                        <div class="od-detail-section-head">
                            <h3>Body</h3>
                            <span class="muted" v-if="requestDetailBodyInfo">{{ requestDetailBodyInfo }}</span>
                            <button class="micro" :disabled="!requestDetail.body_text" @click="copyToClipboard(requestDetail.body_text || '')">Copy</button>
                        </div>
                        <pre v-if="requestDetail.body_text" class="od-detail-code body">{{ formatBodyForDisplay(requestDetail.body_text) }}</pre>
                        <div v-else class="empty-rail">No body captured{{ Number(requestDetail.body_length) ? ' (request had ' + fmtNum(requestDetail.body_length) + ' bytes but was not stored)' : '' }}</div>
                        <div v-if="requestDetail.body_hash" class="muted od-body-hash">SHA-256: {{ requestDetail.body_hash }}</div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="authDetail" class="od-modal-backdrop" @click.self="closeAuthDetail">
            <div class="od-modal" role="dialog" aria-modal="true" aria-labelledby="od-auth-modal-title">
                <header class="od-modal-head">
                    <div>
                        <span class="panel-code">AUTH</span>
                        <h2 id="od-auth-modal-title">Auth Event Detail</h2>
                        <small>#{{ authDetail.id }} / {{ fmtTime(authDetail.ts) }}</small>
                    </div>
                    <button class="od-btn ghost" @click="closeAuthDetail">Close</button>
                </header>
                <div class="od-modal-body">
                    <div class="od-detail-grid">
                        <div><span>Type</span><strong :class="authTypeClass(authDetail.type)">{{ authDetail.type || '-' }}</strong></div>
                        <div><span>Time</span><strong>{{ fmtTime(authDetail.ts) }}</strong></div>
                        <div><span>IP</span><strong><button v-if="authDetail.ip" class="link-btn" @click="selectIp(authDetail.ip); closeAuthDetail();">{{ authDetail.ip }}</button><template v-else>-</template></strong></div>
                        <div><span>Profile</span><strong>{{ authDetail.profile || '-' }}<small v-if="authDetail.profileId"> ({{ authDetail.profileId }})</small></strong></div>
                        <div><span>Route</span><strong class="clip" :title="authDetail.route || ''">{{ authDetail.route || '-' }}</strong></div>
                        <div><span>User-Agent</span><strong class="clip" :title="authDetail.userAgent || ''">{{ authDetail.userAgent || '-' }}</strong></div>
                    </div>

                    <div class="od-detail-section">
                        <div class="od-detail-section-head">
                            <h3>Detail</h3>
                            <button class="micro" :disabled="!authDetail.detail" @click="copyToClipboard(authDetail.detail || '')">Copy</button>
                        </div>
                        <pre v-if="authDetail.detail" class="od-detail-code">{{ formatBodyForDisplay(authDetail.detail) }}</pre>
                        <div v-else class="empty-rail">No detail recorded</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
</script>

<script>
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { markRaw, nextTick } from 'vue';
import Swal from 'sweetalert2';
import 'leaflet/dist/leaflet.css';

const COUNTRY_CENTERS = Object.freeze({
    AF: [33.94, 67.71], AL: [41.15, 20.17], DZ: [28.03, 1.66], AR: [-38.42, -63.62], AM: [40.07, 45.04], AU: [-25.27, 133.78], AT: [47.52, 14.55], AZ: [40.14, 47.58],
    BD: [23.68, 90.36], BY: [53.71, 27.95], BE: [50.5, 4.47], BO: [-16.29, -63.59], BA: [43.92, 17.68], BR: [-14.23, -51.93], BG: [42.73, 25.49], KH: [12.57, 104.99],
    CA: [56.13, -106.35], CL: [-35.68, -71.54], CN: [35.86, 104.2], CO: [4.57, -74.3], CR: [9.75, -83.75], HR: [45.1, 15.2], CY: [35.13, 33.43], CZ: [49.82, 15.47],
    DK: [56.26, 9.5], DO: [18.74, -70.16], EC: [-1.83, -78.18], EG: [26.82, 30.8], EE: [58.6, 25.01], FI: [61.92, 25.75], FR: [46.23, 2.21], GE: [42.32, 43.36],
    DE: [51.17, 10.45], GH: [7.95, -1.02], GR: [39.07, 21.82], GT: [15.78, -90.23], HK: [22.32, 114.17], HU: [47.16, 19.5], IS: [64.96, -19.02], IN: [20.59, 78.96],
    ID: [-0.79, 113.92], IR: [32.43, 53.69], IQ: [33.22, 43.68], IE: [53.41, -8.24], IL: [31.05, 34.85], IT: [41.87, 12.57], JP: [36.2, 138.25], JO: [30.59, 36.24],
    KZ: [48.02, 66.92], KE: [-0.02, 37.91], KR: [35.91, 127.77], KW: [29.31, 47.48], LV: [56.88, 24.6], LB: [33.85, 35.86], LT: [55.17, 23.88], LU: [49.82, 6.13],
    MY: [4.21, 101.98], MX: [23.63, -102.55], MD: [47.41, 28.37], MA: [31.79, -7.09], NL: [52.13, 5.29], NZ: [-40.9, 174.89], NG: [9.08, 8.68], NO: [60.47, 8.47],
    PK: [30.38, 69.35], PA: [8.54, -80.78], PE: [-9.19, -75.02], PH: [12.88, 121.77], PL: [51.92, 19.15], PT: [39.4, -8.22], QA: [25.35, 51.18], RO: [45.94, 24.97],
    RU: [61.52, 105.32], SA: [23.89, 45.08], RS: [44.02, 21.01], SG: [1.35, 103.82], SK: [48.67, 19.7], SI: [46.15, 14.99], ZA: [-30.56, 22.94], ES: [40.46, -3.75],
    LK: [7.87, 80.77], SE: [60.13, 18.64], CH: [46.82, 8.23], TW: [23.7, 120.96], TH: [15.87, 100.99], TN: [33.89, 9.54], TR: [38.96, 35.24], UA: [48.38, 31.17],
    AE: [23.42, 53.85], GB: [55.38, -3.44], US: [39.83, -98.58], UY: [-32.52, -55.77], UZ: [41.38, 64.59], VE: [6.42, -66.59], VN: [14.06, 108.28]
});

const COUNTRY_ALIASES = Object.freeze({
    'UNITED STATES': 'US', 'UNITED STATES OF AMERICA': 'US', 'UNITED KINGDOM': 'GB', 'GREAT BRITAIN': 'GB', 'ENGLAND': 'GB',
    'RUSSIA': 'RU', 'SOUTH KOREA': 'KR', 'KOREA': 'KR', 'VIETNAM': 'VN', 'IRAN': 'IR', 'UNITED ARAB EMIRATES': 'AE', 'UAE': 'AE',
    'NETHERLANDS': 'NL', 'CZECHIA': 'CZ', 'TAIWAN': 'TW', 'HONG KONG': 'HK'
});

export default {
    name: 'omnidefence',
    layout: 'navbar',
    data() {
        return {
            activeTab: 'activity',
            tabs: [
                { id: 'activity', label: 'Activity', code: 'ACT' },
                { id: 'ips', label: 'IP Control', code: 'IP' },
                { id: 'auth', label: 'Auth Events', code: 'AUTH' },
                { id: 'profiles', label: 'Profiles', code: 'KM' },
                { id: 'honeypot', label: 'Honeypots', code: 'HP' },
            ],
            overview: null,
            requests: [], ips: [], mapIps: [], authEvents: [], profileActions: [], honeypotRoutes: [],
            selectedIp: null, selectedIpNote: '', selectedIpRecent: [], selectedIpEvents: [], lastScan: null,
            mapFilter: 'all',
            hideApproximateMapPoints: false,
            leafletReady: false,
            leafletZoom: 2,
            boxMode: false,
            pendingBoxBlock: null,
            boxBlockAnimating: false,
            blockedRegions: [],
            newHoneypotRoute: '', loadError: null, refreshTimer: null, lastUpdated: null,
            requestDetail: null,
            authDetail: null,
            loading: { overview: false, requests: false, ips: false, map: false, auth: false, profile: false, honeypot: false, action: false, ipDetail: false, requestDetail: false },
            filters: {
                requests: { ip: '', profile: '', route: '', status: '', method: '', origin: '', denyOnly: false, limit: 250, offset: 0 },
                ips: { query: '', status: '', limit: 300, offset: 0 },
                auth: { ip: '', profile: '', type: '', limit: 150, offset: 0 },
                profile: { profile: '', category: '', limit: 150, offset: 0 },
            }
        };
    },
    computed: {
        activeTabLabel() { return this.tabs.find(t => t.id === this.activeTab) || this.tabs[0]; },
        topAttackers() { return this.overview?.topAttackers || []; },
        topRoutes() { return this.overview?.topRoutes || []; },
        originBreakdown() { return this.overview?.originBreakdown || []; },
        mapSourceIps() { return this.mapIps.length ? this.mapIps : this.ips; },
        mapPoints() {
            return this.mapSourceIps.map((ipRecord, index) => {
                const coordinates = this.resolveIpCoordinates(ipRecord, index);
                if (!coordinates) return null;
                const activityScale = Math.log10(Number(ipRecord.total || 0) + 1);
                const baseSize = Math.min(7, Math.max(4, 4 + activityScale * 0.75));
                return {
                    ...ipRecord,
                    latitude: coordinates.latitude,
                    longitude: coordinates.longitude,
                    size: baseSize,
                    hasProfile: this.hasIpProfile(ipRecord),
                    recent: this.isRecentIp(ipRecord),
                    coordinatesApproximate: coordinates.approximate
                };
            }).filter(Boolean);
        },
        filteredMapPoints() {
            let points = this.hideApproximateMapPoints ? this.mapPoints.filter(point => !point.coordinatesApproximate) : this.mapPoints;
            if (this.mapFilter === 'attackers') return points.filter(point => !point.hasProfile);
            if (this.mapFilter === 'profiled') return points.filter(point => point.hasProfile);
            return points;
        },
        mapAttackersCount() { return this.filteredMapPoints.filter(point => !point.hasProfile).length; },
        mapProfiledCount() { return this.filteredMapPoints.filter(point => point.hasProfile).length; },
        mapRecentCount() { return this.filteredMapPoints.filter(point => point.recent).length; },
        boxPopoverStyle() {
            const position = this.pendingBoxBlock?.position;
            if (!position) return {};
            return { left: `${position.left}px`, top: `${position.top}px` };
        },
        isBusy() { return Object.values(this.loading).some(Boolean); },
        busyLabel() {
            const map = { overview: 'Refreshing overview', requests: 'Loading activity', ips: 'Loading IPs', map: 'Mapping IPs', auth: 'Loading auth', profile: 'Loading profiles', honeypot: 'Loading traps', action: 'Working', ipDetail: 'Loading IP', requestDetail: 'Loading request' };
            const key = Object.keys(this.loading).find(k => this.loading[k]);
            return key ? map[key] : '';
        },
        lastUpdatedLabel() { return this.lastUpdated ? `Updated ${this.lastUpdated.toLocaleTimeString()}` : 'Ready'; },
        requestDetailHeaderPairs() {
            const headers = this.requestDetail?.headers;
            if (!headers || typeof headers !== 'object') return [];
            return Object.keys(headers).sort((a, b) => a.localeCompare(b)).map(key => ({ key, value: String(headers[key] ?? '') }));
        },
        requestDetailQueryPairs() {
            const raw = this.requestDetail?.query;
            if (!raw || typeof raw !== 'string') return [];
            const stripped = raw.startsWith('?') ? raw.slice(1) : raw;
            if (!stripped) return [];
            try {
                const params = new URLSearchParams(stripped);
                const pairs = [];
                params.forEach((value, key) => { pairs.push({ key, value }); });
                return pairs;
            } catch { return []; }
        },
        requestDetailBodyInfo() {
            if (!this.requestDetail) return '';
            const total = Number(this.requestDetail.body_length || 0);
            const truncated = Number(this.requestDetail.body_truncated) === 1;
            if (!total) return '';
            const totalLabel = `${total.toLocaleString()} bytes`;
            return truncated ? `${totalLabel} / stored truncated to 64 KB` : totalLabel;
        }
    },
    async mounted() {
        await this.initThreatMap();
        await this.refreshActive(false);
        this.refreshTimer = setInterval(() => this.refreshActive(false), 5000);
    },
    beforeUnmount() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.destroyThreatMap();
    },
    watch: {
        activeTab(tab) {
            if (tab === 'activity') this.loadRequests();
            if (tab === 'ips') this.loadIps();
            if (tab === 'auth') this.loadAuthEvents();
            if (tab === 'profiles') this.loadProfileActions();
            if (tab === 'honeypot') this.loadHoneypotRoutes();
        },
        mapFilter() { this.syncThreatMapPoints(); },
        hideApproximateMapPoints() { this.syncThreatMapPoints(); },
        mapIps() { this.syncThreatMapPoints(); },
        ips() { this.syncThreatMapPoints(); },
        blockedRegions() { this.syncThreatMapRegions(); },
        selectedIp() { this.syncThreatMapPoints(); },
        boxMode(enabled) { this.setThreatMapBoxMode(enabled); this.syncThreatMap(); }
    },
    methods: {
        fmtNum(value) { return Number(value || 0).toLocaleString(); },
        fmtTime(value) {
            if (!value) return '-';
            const date = new Date(Number(value) * 1000);
            return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
        },
        toNumberOrNull(value) {
            if (value === null || value === undefined || value === '') return null;
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
        },
        statusClass(code) {
            code = Number(code || 0);
            if (code >= 500) return 'status bad';
            if (code >= 400) return 'status warn';
            if (code >= 300) return 'status mid';
            return 'status good';
        },
        originClass(origin) {
            if (!origin) return 'origin-pill';
            if (origin.includes('NoProfile') || origin.includes('Invalid')) return 'origin-pill bad';
            if (origin.includes('Website')) return 'origin-pill web';
            return 'origin-pill api';
        },
        rowClass(row) {
            return { 'row-bad': row.reason || Number(row.status) >= 500, 'row-warn': Number(row.status) >= 400 && Number(row.status) < 500 };
        },
        ipClass(ip) {
            return { 'row-bad': ip.status === 'Blocked', 'row-warn': ip.status === 'Watch' || ip.status === 'Tarpit', 'row-trap': ip.status === 'Honeypot' };
        },
        isHostileStatus(status) { return ['Blocked', 'Tarpit', 'Honeypot'].includes(String(status || '')); },
        authClass(type) { return { 'row-bad': String(type).includes('NoProfile') || String(type).includes('Invalid'), 'row-warn': type === 'InsufficientClearance' }; },
        buildQuery(values) {
            const p = new URLSearchParams();
            Object.entries(values).forEach(([key, value]) => {
                if (value === '' || value === null || value === undefined || value === false) return;
                p.append(key, String(value));
            });
            const qs = p.toString();
            return qs ? '?' + qs : '';
        },
        async fetchJson(url, key = null) {
            if (key) this.loading[key] = true;
            try {
                const r = await RequestGETFromKliveAPI(url, false, false);
                if (!r.ok) { this.loadError = `Request failed: ${url} (${r.status})`; return null; }
                this.loadError = null;
                return await r.json();
            } catch (error) { this.loadError = String(error); return null; }
            finally { if (key) this.loading[key] = false; }
        },
        normalizeRequest(row) {
            return {
                id: row.id ?? row.Id ?? `${row.utc_ts}-${row.ip}-${row.route}`,
                ts: row.utc_ts ?? row.UtcTimestamp,
                ip: row.ip ?? row.Ip,
                method: row.method ?? row.Method,
                route: row.route ?? row.Route,
                status: row.status_code ?? row.StatusCode,
                duration: row.duration_ms ?? row.DurationMs,
                profile: row.profile_name ?? row.ProfileName,
                profileRank: row.profile_rank ?? row.ProfileRank,
                reason: row.deny_reason ?? row.DenyReason,
                origin: row.request_origin ?? row.RequestOrigin,
                clientPage: row.client_page ?? row.ClientPage,
            };
        },
        normalizeIp(row) {
            return {
                ip: row.ip ?? row.Ip,
                firstSeen: row.first_seen ?? row.FirstSeen,
                lastSeen: row.last_seen ?? row.LastSeen,
                total: row.total_requests ?? row.TotalRequests ?? 0,
                successful: row.successful_requests ?? row.SuccessfulRequests ?? 0,
                unauth: row.unauth_attempts ?? row.UnauthAttempts ?? 0,
                deny: row.deny_count ?? row.DenyCount ?? 0,
                score: row.threat_score ?? row.ThreatScore ?? 0,
                status: row.status ?? row.Status ?? 'Normal',
                country: row.country ?? row.Country,
                asn: row.asn ?? row.Asn,
                city: row.city ?? row.City,
                region: row.region ?? row.regionName ?? row.region_name ?? row.Region ?? row.RegionName,
                isp: row.isp ?? row.Isp,
                org: row.org ?? row.Org,
                latitude: this.toNumberOrNull(row.latitude ?? row.Latitude),
                longitude: this.toNumberOrNull(row.longitude ?? row.Longitude),
                notes: row.notes ?? row.Notes,
                profileId: row.associated_profile_id ?? row.AssociatedProfileId,
                profileName: row.associated_profile_name ?? row.AssociatedProfileName,
                profileRank: row.associated_profile_rank ?? row.AssociatedProfileRank,
                isKlives: Number(row.associated_profile_rank ?? row.AssociatedProfileRank ?? 0) >= 5,
            };
        },
        normalizeAuth(row) { return { id: row.id, ts: row.utc_ts, ip: row.ip, type: row.type, profile: row.profile_name, profileId: row.profile_id, route: row.route, userAgent: row.user_agent, detail: row.detail }; },
        normalizeProfile(row) { return { id: row.id, ts: row.utc_ts, profile: row.profile_name || row.profile_id, category: row.category, action: row.action, ip: row.ip, detail: row.detail_json }; },
        async loadOverview() { const data = await this.fetchJson('/omnidefence/overview', 'overview'); if (data) this.overview = data; },
        async loadRequests() { const data = await this.fetchJson('/omnidefence/requests' + this.buildQuery(this.filters.requests), 'requests'); if (data) this.requests = data.map(this.normalizeRequest); },
        async loadIps() { const data = await this.fetchJson('/omnidefence/ips' + this.buildQuery(this.filters.ips), 'ips'); if (data) this.ips = data.map(this.normalizeIp); },
        async loadMapIps() { const data = await this.fetchJson('/omnidefence/ip-map', 'map'); if (data) this.mapIps = data.map(this.normalizeIp); },
        async loadAuthEvents() { const data = await this.fetchJson('/omnidefence/auth-events' + this.buildQuery(this.filters.auth), 'auth'); if (data) this.authEvents = data.map(this.normalizeAuth); },
        async loadProfileActions() { const data = await this.fetchJson('/omnidefence/profile-actions' + this.buildQuery(this.filters.profile), 'profile'); if (data) this.profileActions = data.map(this.normalizeProfile); },
        async loadHoneypotRoutes() { const data = await this.fetchJson('/omnidefence/honeypot-routes', 'honeypot'); if (data) this.honeypotRoutes = data; },
        async refreshActive(manual = true) {
            if (this.isBusy && !manual) return;
            const jobs = [this.loadOverview(), this.loadMapIps(), this.loadBlockedRegions()];
            if (this.activeTab === 'activity') jobs.push(this.loadRequests());
            if (this.activeTab === 'ips') jobs.push(this.loadIps());
            if (this.activeTab === 'auth') jobs.push(this.loadAuthEvents());
            if (this.activeTab === 'profiles') jobs.push(this.loadProfileActions());
            if (this.activeTab === 'honeypot') jobs.push(this.loadHoneypotRoutes());
            if (this.activeTab !== 'ips') jobs.push(this.loadIps());
            if (this.selectedIp?.ip) jobs.push(this.selectIp(this.selectedIp.ip, false));
            await Promise.allSettled(jobs);
            this.lastUpdated = new Date();
            if (manual && process.client) console.log('OmniDefence refreshed');
        },
        showOnlyDenied() { this.activeTab = 'activity'; this.filters.requests.denyOnly = true; this.filters.requests.offset = 0; this.loadRequests(); },
        pageRequests(direction) { this.filters.requests.offset = Math.max(0, this.filters.requests.offset + direction * this.filters.requests.limit); this.loadRequests(); },
        openActivityForIp(ip) {
            if (!ip) return;
            this.filters.requests.ip = ip;
            this.filters.requests.offset = 0;
            if (this.activeTab === 'activity') this.loadRequests();
            else this.activeTab = 'activity';
            this.selectIp(ip, false);
            if (process.client) {
                Swal.fire({
                    toast: true,
                    position: 'bottom-end',
                    icon: 'info',
                    title: `Activity filtered to ${ip}`,
                    timer: 2200,
                    timerProgressBar: true,
                    showConfirmButton: false,
                    background: '#0a1518',
                    color: '#bcecff'
                });
            }
        },
        hasIpProfile(ipRecord) { return Boolean(ipRecord?.profileId || ipRecord?.profileName); },
        isRecentIp(ipRecord) {
            const lastSeen = Number(ipRecord?.lastSeen || 0);
            if (!lastSeen) return false;
            return lastSeen >= Math.floor(Date.now() / 1000) - 86400 * 3;
        },
        resolveIpCoordinates(ipRecord, index) {
            const latitude = this.toNumberOrNull(ipRecord?.latitude);
            const longitude = this.toNumberOrNull(ipRecord?.longitude);
            if (latitude !== null && longitude !== null) {
                return { latitude, longitude, approximate: false };
            }

            const countryCode = this.countryKey(ipRecord?.country);
            const countryCenter = countryCode ? COUNTRY_CENTERS[countryCode] : null;
            if (countryCenter) {
                const jitter = this.jitterForIp(ipRecord?.ip, 2.8);
                return {
                    latitude: Math.max(-85, Math.min(85, countryCenter[0] + jitter.latitude)),
                    longitude: Math.max(-180, Math.min(180, countryCenter[1] + jitter.longitude)),
                    approximate: true
                };
            }

            return this.ipFallbackCoordinates(ipRecord?.ip, index);
        },
        mapPointTitle(point) {
            const identity = point.hasProfile ? `Profile: ${point.profileName || point.profileId || 'matched'}` : 'Attacker';
            const location = this.formatGeo(point);
            const network = point.isp || point.org || point.asn || 'Unknown network';
            const recency = point.recent ? 'Recent' : 'Older';
            const accuracy = point.coordinatesApproximate ? 'Approximate' : 'Exact';
            return `${point.ip} / ${identity} / ${location} / ${network} / ${recency} / ${accuracy}`;
        },
        formatGeo(ipRecord) {
            const parts = [ipRecord?.city, ipRecord?.region, ipRecord?.country].filter(Boolean);
            return parts.length ? parts.join(', ') : 'Unresolved';
        },
        clampLatitude(latitude) {
            return Math.max(-85.0511287, Math.min(85.0511287, Number(latitude)));
        },
        clampLongitude(longitude) {
            const value = Number(longitude);
            if (!Number.isFinite(value)) return 0;
            return Math.max(-180, Math.min(180, value));
        },
        threatMapHomeZoom(container = this.$refs.leafletMap) {
            const width = Math.max(1, container?.clientWidth || 1024);
            const zoom = Math.ceil(Math.log2(width / 256) * 4) / 4;
            return Math.min(3.5, Math.max(2, zoom));
        },
        resizeThreatMap() {
            if (!this._threatMap) return;
            this._threatMap.invalidateSize({ animate: false });
            const homeZoom = this.threatMapHomeZoom();
            this._threatMapHomeZoom = homeZoom;
            this._threatMap.setMinZoom(homeZoom);
            if (this._threatMap.getZoom() < homeZoom) this._threatMap.setZoom(homeZoom, { animate: false });
        },
        mapPointVisual(point) {
            if (point.status === 'Blocked') return { fill: '#4a1a22', stroke: '#ff6071', opacity: 0.88 };
            if (point.status === 'Honeypot') return { fill: '#c79cff', stroke: '#f0ddff', opacity: 0.9 };
            if (point.status === 'Tarpit') return { fill: '#f0a23a', stroke: '#ffe066', opacity: 0.9 };
            if (point.hasProfile && point.recent) return { fill: '#6bffc1', stroke: '#ddfff1', opacity: 0.92 };
            if (point.hasProfile) return { fill: '#5fd3ff', stroke: '#dbf7ff', opacity: 0.88 };
            if (point.recent) return { fill: '#ffc247', stroke: '#fff0ba', opacity: 0.9 };
            return { fill: '#ff6071', stroke: '#ffd0d6', opacity: 0.88 };
        },
        pointInLatLonBounds(point, latMin, latMax, lonMin, lonMax) {
            const lat = this.toNumberOrNull(point.latitude);
            const lon = this.toNumberOrNull(point.longitude);
            return lat !== null && lon !== null && lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax;
        },
        async initThreatMap() {
            if (!process.client || this._threatMap) return;
            await nextTick();
            const container = this.$refs.leafletMap;
            if (!container) return;

            const leafletModule = await import('leaflet');
            const L = markRaw(leafletModule.default || leafletModule);
            const bounds = L.latLngBounds([[-85.0511287, -180], [85.0511287, 180]]);
            const map = L.map(container, {
                preferCanvas: true,
                zoomControl: false,
                attributionControl: false,
                doubleClickZoom: false,
                minZoom: 2,
                maxZoom: 13,
                zoomSnap: 0.25,
                zoomDelta: 0.5,
                wheelPxPerZoomLevel: 140,
                maxBounds: bounds,
                maxBoundsViscosity: 0.85
            });

            L.control.zoom({ position: 'bottomright' }).addTo(map);
            L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                subdomains: 'abcd',
                noWrap: true,
                bounds,
                detectRetina: true,
                updateWhenIdle: true,
                updateWhenZooming: false,
                keepBuffer: 2,
                maxNativeZoom: 20,
                attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
            }).addTo(map);

            this._leaflet = L;
            this._threatMap = markRaw(map);
            this._threatRenderer = markRaw(L.canvas({ padding: 0.3 }));
            this._regionLayer = markRaw(L.layerGroup().addTo(map));
            this._pointLayer = markRaw(L.layerGroup().addTo(map));
            this._selectionLayer = markRaw(L.layerGroup().addTo(map));
            this._blockAnimationLayer = markRaw(L.layerGroup().addTo(map));
            this._threatMapHomeZoom = this.threatMapHomeZoom(container);
            map.setMinZoom(this._threatMapHomeZoom);
            this._boxHandlers = {
                mousedown: event => this.onThreatBoxMouseDown(event),
                mousemove: event => this.onThreatBoxMouseMove(event),
                mouseup: event => this.onThreatBoxMouseUp(event)
            };
            map.on(this._boxHandlers);
            map.on('zoomend moveend', () => { this.leafletZoom = Number(map.getZoom().toFixed(2)); });
            map.setView([18, 0], this._threatMapHomeZoom);
            this.leafletZoom = Number(map.getZoom().toFixed(2));
            this.leafletReady = true;
            this.setThreatMapBoxMode(this.boxMode);
            this.syncThreatMap();
            if (typeof ResizeObserver !== 'undefined') {
                this._threatMapResizeObserver = new ResizeObserver(() => this.resizeThreatMap());
                this._threatMapResizeObserver.observe(container);
            }
            setTimeout(() => this.resizeThreatMap(), 80);
        },
        destroyThreatMap() {
            if (this._threatMapResizeObserver) this._threatMapResizeObserver.disconnect();
            if (this._threatMap) this._threatMap.remove();
            this._leaflet = null;
            this._threatMap = null;
            this._threatMapHomeZoom = null;
            this._threatMapResizeObserver = null;
            this._threatRenderer = null;
            this._pointLayer = null;
            this._regionLayer = null;
            this._selectionLayer = null;
            this._blockAnimationLayer = null;
            this._selectionRectangle = null;
            this._boxStartLatLng = null;
            this._boxStartPoint = null;
            this.leafletReady = false;
        },
        syncThreatMap() {
            this.syncThreatMapPoints();
            this.syncThreatMapRegions();
        },
        syncThreatMapPoints() {
            const L = this._leaflet;
            if (!L || !this._pointLayer) return;
            this._pointLayer.clearLayers();
            for (const point of this.filteredMapPoints) {
                const latitude = this.toNumberOrNull(point.latitude);
                const longitude = this.toNumberOrNull(point.longitude);
                if (latitude === null || longitude === null) continue;
                const visual = this.mapPointVisual(point);
                const selected = this.selectedIp?.ip === point.ip;
                const radius = selected ? point.size + 2 : point.size;
                const latLng = [this.clampLatitude(latitude), this.clampLongitude(longitude)];

                if (point.recent || selected) {
                    L.circleMarker(latLng, {
                        renderer: this._threatRenderer,
                        radius: radius + (selected ? 4 : 3),
                        color: selected ? '#eafff9' : visual.fill,
                        weight: selected ? 1.5 : 1,
                        opacity: selected ? 0.75 : 0.32,
                        fill: false,
                        interactive: false
                    }).addTo(this._pointLayer);
                }

                const marker = L.circleMarker(latLng, {
                    renderer: this._threatRenderer,
                    radius,
                    color: visual.stroke,
                    weight: selected ? 2 : 1,
                    opacity: 0.95,
                    fillColor: visual.fill,
                    fillOpacity: point.coordinatesApproximate ? 0.58 : visual.opacity,
                    interactive: !this.boxMode,
                    bubblingMouseEvents: false
                }).addTo(this._pointLayer);
                marker.bindTooltip(this.mapPointTitle(point), { sticky: true, direction: 'top', className: 'od-map-tooltip' });
                marker.on('click', () => this.selectIp(point.ip, false));
                marker.on('dblclick', event => {
                    L.DomEvent.stop(event);
                    this.openActivityForIp(point.ip);
                });
            }
        },
        syncThreatMapRegions() {
            const L = this._leaflet;
            if (!L || !this._regionLayer) return;
            this._regionLayer.clearLayers();
            for (const region of this.blockedRegions || []) {
                const latMin = this.toNumberOrNull(region.latMin);
                const latMax = this.toNumberOrNull(region.latMax);
                const lonMin = this.toNumberOrNull(region.lonMin);
                const lonMax = this.toNumberOrNull(region.lonMax);
                if ([latMin, latMax, lonMin, lonMax].some(value => value === null)) continue;
                const bounds = L.latLngBounds([
                    [this.clampLatitude(Math.min(latMin, latMax)), this.clampLongitude(Math.min(lonMin, lonMax))],
                    [this.clampLatitude(Math.max(latMin, latMax)), this.clampLongitude(Math.max(lonMin, lonMax))]
                ]);
                const rectangle = L.rectangle(bounds, {
                    renderer: this._threatRenderer,
                    color: '#ff8a96',
                    weight: 1,
                    opacity: 0.75,
                    fillColor: '#ff6071',
                    fillOpacity: 0.16,
                    dashArray: '5 4',
                    interactive: !this.boxMode,
                    bubblingMouseEvents: false
                }).addTo(this._regionLayer);
                rectangle.bindTooltip(`Region #${region.id} - ${region.reason || 'Region block'} (click to remove)`, { sticky: true, className: 'od-map-tooltip' });
                rectangle.on('click', () => this.confirmRemoveRegion(region));
            }
        },
        setThreatMapBoxMode(enabled) {
            const map = this._threatMap;
            if (!map) return;
            if (enabled) map.dragging.disable();
            else {
                map.dragging.enable();
                this.cancelBoxBlock();
            }
        },
        clearThreatSelection() {
            this._boxStartLatLng = null;
            this._boxStartPoint = null;
            if (this._selectionLayer) this._selectionLayer.clearLayers();
            this._selectionRectangle = null;
        },
        cancelBoxBlock() {
            if (this.boxBlockAnimating) return;
            this.pendingBoxBlock = null;
            this.clearThreatSelection();
        },
        onThreatBoxMouseDown(event) {
            if (!this.boxMode || this.boxBlockAnimating || !this._leaflet || !this._selectionLayer || event.originalEvent?.button !== 0) return;
            this.pendingBoxBlock = null;
            this.clearThreatSelection();
            this._boxStartLatLng = event.latlng;
            this._boxStartPoint = this._threatMap.latLngToContainerPoint(event.latlng);
            this._selectionRectangle = this._leaflet.rectangle(this._leaflet.latLngBounds(event.latlng, event.latlng), {
                color: '#ff8a96',
                weight: 1,
                opacity: 0.95,
                fillColor: '#ff6071',
                fillOpacity: 0.13,
                dashArray: '4 3',
                interactive: false
            }).addTo(this._selectionLayer);
            this._leaflet.DomEvent.preventDefault(event.originalEvent);
        },
        onThreatBoxMouseMove(event) {
            if (!this.boxMode || !this._boxStartLatLng || !this._selectionRectangle || !this._leaflet) return;
            this._selectionRectangle.setBounds(this._leaflet.latLngBounds(this._boxStartLatLng, event.latlng));
        },
        async onThreatBoxMouseUp(event) {
            if (!this.boxMode || this.boxBlockAnimating || !this._boxStartLatLng || !this._leaflet || !this._threatMap) return;
            const start = this._boxStartLatLng;
            const end = event.latlng;
            const startPoint = this._boxStartPoint;
            const endPoint = this._threatMap.latLngToContainerPoint(end);
            const hasArea = startPoint && Math.abs(endPoint.x - startPoint.x) > 8 && Math.abs(endPoint.y - startPoint.y) > 8;
            const bounds = this._leaflet.latLngBounds(start, end);
            this._boxStartLatLng = null;
            this._boxStartPoint = null;
            if (!hasArea) { this.cancelBoxBlock(); return; }
            this.prepareBoxBlock(bounds, startPoint, endPoint);
        },
        zoomMap(factor) {
            if (!this._threatMap) return;
            const delta = factor > 1 ? 1 : -1;
            this._threatMap.setZoom(Math.max(this._threatMap.getMinZoom(), Math.min(13, this._threatMap.getZoom() + delta)));
        },
        resetMapView() {
            if (!this._threatMap) return;
            this._threatMap.setView([18, 0], this._threatMapHomeZoom || this.threatMapHomeZoom());
            this.cancelBoxBlock();
        },
        prepareBoxBlock(bounds, startPoint, endPoint) {
            const latMin = this.clampLatitude(Math.min(bounds.getSouth(), bounds.getNorth()));
            const latMax = this.clampLatitude(Math.max(bounds.getSouth(), bounds.getNorth()));
            const lonMin = this.clampLongitude(Math.min(bounds.getWest(), bounds.getEast()));
            const lonMax = this.clampLongitude(Math.max(bounds.getWest(), bounds.getEast()));
            const targets = this.filteredMapPoints.filter(point => this.pointInLatLonBounds(point, latMin, latMax, lonMin, lonMax));
            const blockable = targets.filter(point => !point.isKlives && point.status !== 'Blocked');
            const placement = this.boxBlockPopoverPlacement(startPoint, endPoint);
            this.pendingBoxBlock = {
                latMin, latMax, lonMin, lonMax,
                targets,
                blockable,
                position: { left: placement.left, top: placement.top },
                placement: placement.side,
                boundsLabel: `${latMin.toFixed(2)}, ${lonMin.toFixed(2)} -> ${latMax.toFixed(2)}, ${lonMax.toFixed(2)}`,
                reason: 'Region block from map',
                progress: 0,
                statusText: ''
            };
            if (this._selectionRectangle) {
                this._selectionRectangle.setStyle({ color: '#52ffb9', fillColor: '#52ffb9', fillOpacity: 0.11, dashArray: '6 4' });
                this._selectionRectangle.bringToFront();
            }
        },
        boxBlockPopoverPlacement(startPoint, endPoint) {
            const container = this.$refs.leafletMap;
            const width = container?.clientWidth || 1024;
            const height = container?.clientHeight || 520;
            const popoverWidth = 236;
            const popoverHeight = 148;
            const boxLeft = Math.min(startPoint.x, endPoint.x);
            const boxRight = Math.max(startPoint.x, endPoint.x);
            const boxTop = Math.min(startPoint.y, endPoint.y);
            const boxBottom = Math.max(startPoint.y, endPoint.y);
            const side = boxRight + popoverWidth + 22 > width && boxLeft > popoverWidth + 22 ? 'left' : 'right';
            const left = side === 'left'
                ? Math.max(12, boxLeft - popoverWidth - 14)
                : Math.min(width - popoverWidth - 12, boxRight + 14);
            const verticalCenter = boxTop + (boxBottom - boxTop) / 2;
            const top = Math.max(12, Math.min(height - popoverHeight - 12, verticalCenter - popoverHeight / 2));
            return { left, top, side };
        },
        async runBoxBlock() {
            const pending = this.pendingBoxBlock;
            if (!pending || this.boxBlockAnimating) return;
            const reason = (pending.reason || 'Region block from map').trim();
            this.loading.action = true;
            this.boxBlockAnimating = true;
            this.clearBlockingAnimation();
            let blockedCount = 0;
            try {
                pending.blockable.forEach(point => this.addBlockingMarker(point));
                if (this.pendingBoxBlock) this.pendingBoxBlock.statusText = 'Saving region rule';

                const regionResponse = await RequestPOSTFromKliveAPI('/omnidefence/regions/add', JSON.stringify({ latMin: pending.latMin, latMax: pending.latMax, lonMin: pending.lonMin, lonMax: pending.lonMax, reason }), false, true);
                if (!regionResponse.ok) {
                    this.loadError = await regionResponse.text();
                    if (this.pendingBoxBlock) this.pendingBoxBlock.statusText = 'Region save failed';
                    return;
                }

                const saved = await regionResponse.json().catch(() => ({}));
                blockedCount = Number(saved.blockedCount ?? 0);
                await Promise.allSettled([this.loadIps(), this.loadMapIps(), this.loadOverview(), this.loadBlockedRegions()]);
                if (this.pendingBoxBlock) this.pendingBoxBlock.statusText = `Region active / blocked ${blockedCount}`;
                await this.wait(350);
            } catch (error) {
                this.loadError = `Region save failed: ${error}`;
                if (this.pendingBoxBlock) this.pendingBoxBlock.statusText = 'Region save failed';
                await this.wait(350);
            } finally {
                this.loading.action = false;
                this.boxBlockAnimating = false;
                this.pendingBoxBlock = null;
                this.clearThreatSelection();
                setTimeout(() => this.clearBlockingAnimation(), 450);
            }
        },
        addBlockingMarker(point) {
            const L = this._leaflet;
            if (!L || !this._blockAnimationLayer) return;
            const latitude = this.toNumberOrNull(point.latitude);
            const longitude = this.toNumberOrNull(point.longitude);
            if (latitude === null || longitude === null) return;
            L.marker([this.clampLatitude(latitude), this.clampLongitude(longitude)], {
                icon: L.divIcon({ className: 'od-blocking-marker', html: '<span class="od-block-cross"></span>', iconSize: [28, 28], iconAnchor: [14, 14] }),
                interactive: false,
                zIndexOffset: 900
            }).addTo(this._blockAnimationLayer);
        },
        clearBlockingAnimation() {
            if (this._blockAnimationLayer) this._blockAnimationLayer.clearLayers();
        },
        wait(milliseconds) {
            return new Promise(resolve => setTimeout(resolve, milliseconds));
        },
        countryKey(value) {
            const text = String(value || '').trim();
            if (!text) return '';
            const upper = text.toUpperCase();
            if (upper.length === 2 && COUNTRY_CENTERS[upper]) return upper;
            return COUNTRY_ALIASES[upper] || '';
        },
        jitterForIp(ip, spread) {
            const hash = this.hashString(`${ip || 'unknown'}:jitter`);
            const angleRadians = (hash % 360) * Math.PI / 180;
            const radius = (((hash >>> 8) % 100) / 100) * spread;
            return {
                latitude: Math.sin(angleRadians) * radius * 0.7,
                longitude: Math.cos(angleRadians) * radius
            };
        },
        ipFallbackCoordinates(ip, index) {
            const hash = this.hashString(`${ip || index}:fallback`);
            const longitude = ((hash % 36000) / 100) - 180;
            const latitude = (((Math.floor(hash / 36000) % 15000) / 100) - 75);
            return { latitude, longitude, approximate: true };
        },
        hashString(value) {
            let hash = 2166136261;
            for (let index = 0; index < value.length; index++) {
                hash ^= value.charCodeAt(index);
                hash = Math.imul(hash, 16777619);
            }
            return hash >>> 0;
        },
        async loadBlockedRegions() {
            const data = await this.fetchJson('/omnidefence/regions');
            if (Array.isArray(data)) this.blockedRegions = data;
        },
        async confirmRemoveRegion(region) {
            if (!region || !process.client) return;
            const result = await Swal.fire({
                title: `Remove region block #${region.id}?`,
                html: `<div style="text-align:left;font-size:12px;color:#9fb8b1">${region.reason || 'Region block'}<br>Lat ${Number(region.latMin).toFixed(1)} to ${Number(region.latMax).toFixed(1)}, Lon ${Number(region.lonMin).toFixed(1)} to ${Number(region.lonMax).toFixed(1)}</div><label style="display:flex;gap:8px;align-items:center;margin-top:12px;text-align:left;color:#d9fff0;font-size:12px"><input id="od-unblock-region-ips" type="checkbox" style="accent-color:#13b66b" /> Unblock blocked IPs in this box</label>`,
                showCancelButton: true,
                confirmButtonText: 'Remove',
                background: '#080b0d',
                color: '#e8fff7',
                confirmButtonColor: '#c0283f',
                cancelButtonColor: '#2a3338',
                preConfirm: () => document.getElementById('od-unblock-region-ips')?.checked === true
            });
            if (!result.isConfirmed) return;
            this.loading.action = true;
            try {
                const response = await RequestPOSTFromKliveAPI('/omnidefence/regions/remove', JSON.stringify({ id: region.id, unblockIpsInRegion: result.value === true }), false, true);
                if (!response.ok) {
                    this.loadError = await response.text();
                    return;
                }
                const data = await response.json().catch(() => ({}));
                await Promise.allSettled([this.loadBlockedRegions(), this.loadIps(), this.loadMapIps(), this.loadOverview()]);
                if (result.value === true) {
                    await Swal.fire({
                        toast: true,
                        position: 'bottom-end',
                        icon: 'success',
                        title: `Unblocked ${Number(data.unblockedCount ?? 0)} IPs`,
                        showConfirmButton: false,
                        timer: 1800,
                        background: '#080b0d',
                        color: '#e8fff7'
                    });
                }
            } finally { this.loading.action = false; }
        },
        async selectIp(ip, switchTab = true) {
            if (!ip) return;
            if (switchTab) this.activeTab = 'ips';
            const data = await this.fetchJson('/omnidefence/ip?ip=' + encodeURIComponent(ip), 'ipDetail');
            if (!data) return;
            const record = data.record || data.Record || data;
            this.selectedIp = this.normalizeIp(record);
            this.selectedIpNote = this.selectedIp.notes || '';
            this.selectedIpRecent = (data.recentRequests || []).map(this.normalizeRequest);
            this.selectedIpEvents = data.events || [];
        },
        async blockIp(ip) {
            const reason = await this.askText('Block reason', 'manual');
            if (reason === null) return;
            this.loading.action = true;
            try {
                const r = await RequestPOSTFromKliveAPI('/omnidefence/ip/block', JSON.stringify({ ip, reason }), false, true);
                if (!r.ok) { this.loadError = await r.text(); return; }
                await this.loadIps(); await this.selectIp(ip);
            } finally { this.loading.action = false; }
        },
        async unblockIp(ip) { this.loading.action = true; try { const r = await RequestPOSTFromKliveAPI('/omnidefence/ip/unblock', JSON.stringify({ ip }), false, true); if (!r.ok) { this.loadError = await r.text(); return; } await this.loadIps(); await this.selectIp(ip); } finally { this.loading.action = false; } },
        async untrapIp(ip) { this.loading.action = true; try { const r = await RequestPOSTFromKliveAPI('/omnidefence/ip/untrap', JSON.stringify({ ip, reason: 'Dashboard untrap' }), false, true); if (!r.ok) { this.loadError = await r.text(); return; } await this.loadOverview(); await this.loadIps(); await this.selectIp(ip); } finally { this.loading.action = false; } },
        async setIpStatus(ip, status) { this.loading.action = true; try { const r = await RequestPOSTFromKliveAPI('/omnidefence/ip/status', JSON.stringify({ ip, status }), false, true); if (!r.ok) { this.loadError = await r.text(); return; } await this.loadIps(); await this.selectIp(ip); } finally { this.loading.action = false; } },
        async saveSelectedIpNote() {
            if (!this.selectedIp) return;
            this.loading.action = true;
            try {
                const r = await RequestPOSTFromKliveAPI('/omnidefence/ip/note', JSON.stringify({ ip: this.selectedIp.ip, note: this.selectedIpNote }), false, true);
                if (!r.ok) { this.loadError = await r.text(); return; }
                await this.selectIp(this.selectedIp.ip);
            } finally { this.loading.action = false; }
        },
        async scanIp(ip) {
            this.loading.action = true;
            try {
                const r = await RequestPOSTFromKliveAPI('/omnidefence/ip/scan', JSON.stringify({ ip }), false, true);
                if (!r.ok) { this.loadError = await r.text(); return; }
                this.lastScan = await r.json(); await this.selectIp(ip);
            } finally { this.loading.action = false; }
        },
        async addHoneypotRoute() {
            const route = this.newHoneypotRoute.trim();
            if (!route) return;
            this.loading.action = true;
            try {
                const r = await RequestPOSTFromKliveAPI('/omnidefence/honeypot-routes/add', JSON.stringify({ route }), false, true);
                if (!r.ok) { this.loadError = await r.text(); return; }
                this.newHoneypotRoute = ''; await this.loadHoneypotRoutes();
            } finally { this.loading.action = false; }
        },
        async removeHoneypotRoute(route) { this.loading.action = true; try { const r = await RequestPOSTFromKliveAPI('/omnidefence/honeypot-routes/remove', JSON.stringify({ route }), false, true); if (!r.ok) { this.loadError = await r.text(); return; } await this.loadHoneypotRoutes(); } finally { this.loading.action = false; } },
        async exportTable(table) {
            this.loading.action = true;
            try {
            const r = await RequestGETFromKliveAPI(`/omnidefence/export?format=csv&table=${encodeURIComponent(table)}`, false, false);
            if (!r.ok) return;
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `omnidefence-${table}.csv`; a.click();
            URL.revokeObjectURL(url);
            } finally { this.loading.action = false; }
        },
        async askText(title, def) {
            if (!process.client) return def;
            const { value } = await Swal.fire({ title, input: 'text', inputValue: def, showCancelButton: true, background: '#080b0d', color: '#e8fff7', confirmButtonColor: '#13b66b' });
            return value === undefined ? null : value;
        },
        async viewRequestDetail(id) {
            if (id === null || id === undefined) return;
            this.requestDetail = null;
            const data = await this.fetchJson('/omnidefence/request?id=' + encodeURIComponent(id), 'requestDetail');
            if (data) this.requestDetail = data;
        },
        closeRequestDetail() {
            if (this.loading.requestDetail) return;
            this.requestDetail = null;
        },
        viewAuthDetail(event) {
            if (!event) return;
            this.authDetail = { ...event };
        },
        closeAuthDetail() { this.authDetail = null; },
        authTypeClass(type) {
            const t = String(type || '');
            if (t.includes('NoProfile') || t.includes('Invalid')) return 'status bad';
            if (t === 'InsufficientClearance') return 'status warn';
            return 'status good';
        },
        formatBodyForDisplay(body) {
            if (body === null || body === undefined) return '';
            const text = String(body);
            const trimmed = text.trim();
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                try { return JSON.stringify(JSON.parse(trimmed), null, 2); }
                catch { /* fall through */ }
            }
            return text;
        },
        async copyToClipboard(value) {
            if (!process.client || value === null || value === undefined) return;
            try {
                if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(String(value));
                else {
                    const ta = document.createElement('textarea');
                    ta.value = String(value);
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                }
                Swal.fire({ toast: true, position: 'bottom-end', icon: 'success', title: 'Copied', timer: 1200, showConfirmButton: false, background: '#0a1518', color: '#bcecff' });
            } catch (e) {
                this.loadError = 'Copy failed: ' + e;
            }
        }
    }
};
</script>

<style scoped>
.od-shell {
    min-height: 100vh;
    padding: 18px;
    color: #d9fff0;
    background:
        linear-gradient(rgba(9, 21, 24, 0.92), rgba(8, 10, 13, 0.96)),
        repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 28px),
        repeating-linear-gradient(90deg, rgba(54, 255, 178, 0.04) 0 1px, transparent 1px 32px);
    border: 1px solid rgba(69, 255, 186, 0.12);
}
.od-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; margin-bottom: 14px; }
.od-kicker { font: 700 11px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: 1.2px; color: #57f0b3; }
.live-dot { display: inline-block; width: 8px; height: 8px; margin-right: 8px; border-radius: 50%; background: #46f08e; box-shadow: 0 0 14px #46f08e; animation: pulse 1.4s infinite; }
.od-header h1 { margin: 4px 0 2px; font-size: 42px; line-height: 1; letter-spacing: 0; color: #eafff9; text-shadow: 0 0 22px rgba(65,255,186,0.24); }
.od-header p { margin: 0; color: #94b6ad; font-size: 14px; }
.od-header-actions { display: flex; gap: 8px; align-items: center; }
.refresh-stamp { min-width: 128px; text-align: right; color: #83aca2; font: 700 11px ui-monospace, Consolas, monospace; text-transform: uppercase; }
.od-map-panel { margin-bottom: 12px; border: 1px solid rgba(82,255,185,.16); border-radius: 6px; background: rgba(4, 8, 10, .86); box-shadow: inset 0 0 22px rgba(71, 255, 183, .04); overflow: hidden; }
.map-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 14px; border-bottom: 1px solid rgba(82,255,185,.14); background: linear-gradient(90deg, rgba(14,50,52,.7), rgba(9,12,15,.45)); }
.map-head h2 { margin: 0; font-size: 20px; color: #eafff9; }
.map-actions { display: flex; align-items: center; gap: 10px; }
.map-filters { display: flex; gap: 4px; padding: 3px; border: 1px solid rgba(116,255,198,.16); border-radius: 5px; background: rgba(255,255,255,.035); }
.map-filters button { min-height: 30px; padding: 6px 9px; border: 0; border-radius: 3px; background: transparent; color: #9fb8b1; font-size: 11px; font-weight: 800; text-transform: uppercase; white-space: nowrap; cursor: pointer; }
.map-filters button.active { color: #ecfffa; background: rgba(82,255,185,.16); box-shadow: inset 0 0 0 1px rgba(82,255,185,.2); }
.map-toggle { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 6px 9px; border-radius: 3px; color: #b9d8cf; font-size: 11px; font-weight: 800; text-transform: uppercase; white-space: nowrap; cursor: pointer; }
.map-toggle.active { color: #ecfffa; background: rgba(95,211,255,.14); box-shadow: inset 0 0 0 1px rgba(95,211,255,.22); }
.map-toggle input { width: 13px; height: 13px; margin: 0; accent-color: #5fd3ff; cursor: pointer; }
.map-layout { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 10px; padding: 12px; }
.world-map-stage { position: relative; height: clamp(500px, 56vh, 760px); min-height: 500px; overflow: hidden; border: 1px solid rgba(82,255,185,.24); border-radius: 5px; background: radial-gradient(circle at 50% 20%, rgba(35,144,118,.2), transparent 45%), linear-gradient(180deg, #031512, #05090b); cursor: grab; }
.world-map-stage.box-mode { cursor: crosshair; }
.world-map-stage.loading { box-shadow: inset 0 0 28px rgba(95,211,255,.08); }
.leaflet-threat-map { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; background: #031512; }
.leaflet-threat-map::after { content: ''; position: absolute; inset: 0; z-index: 450; pointer-events: none; background: linear-gradient(rgba(38,214,166,.08), rgba(4,15,16,.08)), repeating-linear-gradient(0deg, rgba(82,255,185,.038) 0 1px, transparent 1px 48px), repeating-linear-gradient(90deg, rgba(82,255,185,.03) 0 1px, transparent 1px 54px); mix-blend-mode: screen; opacity: .46; }
.world-map-stage :deep(.leaflet-container) { background: #031512; color: #d9fff0; font: 700 11px ui-monospace, Consolas, monospace; }
.world-map-stage :deep(.leaflet-tile-pane) { filter: sepia(.24) hue-rotate(104deg) saturate(1.55) brightness(1.28) contrast(.92); opacity: 1; }
.world-map-stage :deep(.leaflet-control-zoom) { border: 1px solid rgba(95,211,255,.18); border-radius: 4px; overflow: hidden; background: rgba(5,13,16,.82); box-shadow: none; }
.world-map-stage :deep(.leaflet-control-zoom a) { width: 28px; height: 28px; border: 0; border-bottom: 1px solid rgba(95,211,255,.14); background: rgba(8,17,22,.92); color: #bcecff; line-height: 28px; text-shadow: none; }
.world-map-stage :deep(.leaflet-control-zoom a:hover) { background: rgba(31,92,110,.86); color: #fff; }
.world-map-stage :deep(.leaflet-control-attribution) { padding: 2px 5px; border: 1px solid rgba(95,211,255,.12); border-radius: 3px; background: rgba(4,8,10,.66); color: #71918a; font-size: 10px; }
.world-map-stage :deep(.leaflet-control-attribution a) { color: #8fd0e8; }
.world-map-stage :deep(.leaflet-interactive) { outline: none; }
.world-map-stage :deep(.od-map-tooltip) { border: 1px solid rgba(95,211,255,.2); border-radius: 4px; background: rgba(4,9,11,.92); color: #d9fff0; box-shadow: 0 8px 22px rgba(0,0,0,.28); font: 700 11px ui-monospace, Consolas, monospace; }
.world-map-stage :deep(.od-map-tooltip::before) { border-top-color: rgba(4,9,11,.92); }
.world-map-stage :deep(.od-blocking-marker) { width: 28px; height: 28px; margin: 0; border: 0; background: transparent; pointer-events: none; }
.world-map-stage :deep(.od-block-cross) { position: relative; display: block; width: 28px; height: 28px; border: 1px solid rgba(255,96,113,.9); border-radius: 50%; background: rgba(255,96,113,.15); box-shadow: 0 0 18px rgba(255,96,113,.55); animation: blockPulse .42s ease-out both; }
.world-map-stage :deep(.od-block-cross::before), .world-map-stage :deep(.od-block-cross::after) { content: ''; position: absolute; left: 4px; right: 4px; top: 13px; height: 2px; border-radius: 999px; background: #ffd7dc; transform-origin: center; animation: blockStrike .34s ease-out both; }
.world-map-stage :deep(.od-block-cross::before) { transform: rotate(45deg) scaleX(0); }
.world-map-stage :deep(.od-block-cross::after) { transform: rotate(-45deg) scaleX(0); animation-delay: .11s; }
.world-map-stage.box-mode :deep(.leaflet-container) { cursor: crosshair; }
.map-loading, .map-empty { position: absolute; inset: 0; z-index: 500; display: grid; place-items: center; color: #78928b; font: 700 12px ui-monospace, Consolas, monospace; text-transform: uppercase; pointer-events: none; }
.map-loading { background: radial-gradient(circle at center, rgba(10,42,47,.36), rgba(3,7,10,.68)); color: #bcecff; }
.map-mode-tag { position: absolute; z-index: 600; top: 8px; left: 8px; padding: 4px 8px; border: 1px solid rgba(255,138,150,.4); border-radius: 3px; background: rgba(60,12,18,.78); color: #ff8a96; font: 700 10px ui-monospace, Consolas, monospace; letter-spacing: 1px; pointer-events: none; }
.map-zoom-tag { position: absolute; z-index: 600; bottom: 8px; left: 8px; padding: 3px 7px; border: 1px solid rgba(95,211,255,.25); border-radius: 3px; background: rgba(8,17,22,.78); color: #8fd0e8; font: 700 10px ui-monospace, Consolas, monospace; letter-spacing: 1px; pointer-events: none; }
.map-box-popover { position: absolute; z-index: 760; width: 236px; padding: 10px; border: 1px solid rgba(82,255,185,.38); border-radius: 5px; background: linear-gradient(180deg, rgba(5,22,20,.96), rgba(3,9,11,.96)); box-shadow: 0 12px 28px rgba(0,0,0,.38), 0 0 22px rgba(82,255,185,.1); color: #d9fff0; animation: mapPopoverIn .16s ease-out both; }
.map-box-popover::before { content: ''; position: absolute; top: 50%; width: 14px; height: 1px; background: rgba(82,255,185,.72); box-shadow: 0 0 8px rgba(82,255,185,.45); }
.map-box-popover.right::before { left: -14px; }
.map-box-popover.left::before { right: -14px; }
.map-box-popover span { display: block; color: #57f0b3; font: 800 10px ui-monospace, Consolas, monospace; text-transform: uppercase; letter-spacing: 1px; }
.map-box-popover strong { display: block; margin-top: 4px; color: #f3fffb; font-size: 15px; line-height: 1.15; }
.map-box-popover small { display: block; margin-top: 4px; color: #86a39b; font-size: 10px; }
.map-box-reason { width: 100%; margin-top: 8px; padding: 6px 7px; font-size: 11px; }
.map-box-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px; }
.map-box-progress { display: flex; align-items: center; gap: 6px; margin-top: 8px; color: #bcecff; font: 800 10px ui-monospace, Consolas, monospace; text-transform: uppercase; }
.map-box-progress.complete { color: #7dffc5; }
.map-intel { display: grid; grid-template-columns: 1fr 1fr; align-content: start; gap: 8px; }
.map-stat { padding: 9px; border: 1px solid rgba(255,255,255,.07); border-radius: 4px; background: rgba(255,255,255,.035); }
.map-stat span { display: block; color: #7d948e; font-size: 11px; text-transform: uppercase; }
.map-stat strong { display: block; margin-top: 3px; color: #f3fffb; font-size: 20px; line-height: 1; }
.map-legend, .map-selected { grid-column: 1 / -1; padding: 9px; border: 1px solid rgba(255,255,255,.07); border-radius: 4px; background: rgba(255,255,255,.03); }
.map-legend { display: grid; gap: 7px; }
.map-legend div { display: flex; align-items: center; gap: 7px; color: #a9c8bf; font-size: 11px; font-weight: 700; }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; background: #ff6071; box-shadow: 0 0 10px currentColor; color: #ff6071; }
.legend-dot.attacker.recent { background: #ffc247; color: #ffc247; }
.legend-dot.profile { background: #5fd3ff; color: #5fd3ff; }
.legend-dot.profile.recent { background: #6bffc1; color: #6bffc1; }
.legend-icon { display: inline-block; position: relative; width: 12px; height: 12px; border-radius: 50%; background: #2a3338; border: 1px solid rgba(255,255,255,.18); }
.legend-icon.cross::before, .legend-icon.cross::after { content: ''; position: absolute; left: 50%; top: 50%; width: 12px; height: 1.5px; background: #fff; transform: translate(-50%, -50%) rotate(45deg); }
.legend-icon.cross::after { transform: translate(-50%, -50%) rotate(-45deg); }
.legend-icon.ring { border: 1.5px dashed #c79cff; background: rgba(199,156,255,.25); }
.legend-icon.strike { background: #f0a23a; }
.legend-icon.strike::after { content: ''; position: absolute; left: -2px; right: -2px; top: 50%; height: 1.5px; background: #ffe066; transform: translateY(-50%); }
.map-selected span { display: block; color: #7d948e; font-size: 11px; text-transform: uppercase; }
.map-selected strong { display: block; margin-top: 4px; color: #eafff9; font-size: 15px; }
.map-selected small { display: block; margin-top: 3px; color: #86a39b; font-size: 11px; }
.od-metrics { display: grid; grid-template-columns: repeat(5, minmax(145px, 1fr)); gap: 10px; margin-bottom: 12px; }
.metric-tile { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; text-align: left; padding: 12px 14px; min-height: 82px; border: 1px solid rgba(82,255,185,.22); border-radius: 6px; background: linear-gradient(180deg, rgba(12,31,32,.95), rgba(6,11,13,.96)); color: inherit; cursor: pointer; }
.metric-copy { min-width: 0; }
.metric-tile strong { display: block; min-width: 54px; margin: 0; font-size: 30px; line-height: 1; color: #7dffc5; text-align: right; letter-spacing: 0; }
.metric-label, .metric-tile small { display: block; color: #8ea9a1; font-size: 11px; line-height: 1.45; text-transform: uppercase; letter-spacing: .8px; }
.metric-tile.danger strong { color: #ff5a6a; } .metric-tile.warn strong { color: #ffc247; } .metric-tile.cyan strong { color: #5fd3ff; } .metric-tile.violet strong { color: #c79cff; }
.od-grid { display: grid; grid-template-columns: 230px minmax(0, 1fr) 290px; gap: 12px; }
.od-rail, .od-panel, .od-detail { border: 1px solid rgba(82,255,185,.16); border-radius: 6px; background: rgba(4, 8, 10, .86); box-shadow: inset 0 0 22px rgba(71, 255, 183, .04); }
.od-rail, .od-detail { padding: 10px; }
.od-tabs { display: grid; gap: 6px; margin-bottom: 12px; }
.od-tab { display: flex; align-items: center; gap: 8px; padding: 9px 10px; border: 1px solid rgba(255,255,255,.08); border-radius: 4px; background: rgba(255,255,255,.03); color: #c3ded6; text-align: left; cursor: pointer; }
.od-tab span { width: 42px; color: #58ffd0; font: 700 11px ui-monospace, Consolas, monospace; }
.od-tab.active { border-color: #52ffb9; color: #fff; background: linear-gradient(90deg, rgba(32,155,111,.25), rgba(30,62,82,.15)); }
.rail-section, .detail-block { border-top: 1px solid rgba(255,255,255,.08); padding-top: 10px; margin-top: 10px; }
.rail-section h3 { margin: 0 0 8px; font-size: 11px; color: #82f8c1; text-transform: uppercase; letter-spacing: .9px; }
.origin-row, .route-row, .threat-row { display: flex; justify-content: space-between; gap: 8px; width: 100%; padding: 6px 0; color: #cfeee5; font-size: 12px; border: 0; border-bottom: 1px solid rgba(255,255,255,.05); background: transparent; text-align: left; }
.threat-row { cursor: pointer; }
.threat-ip { color: #f6fffe; } .threat-meta, .muted, .empty-rail { color: #78928b; font-size: 11px; }
.od-panel { min-width: 0; overflow: hidden; }
.panel-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid rgba(82,255,185,.14); background: linear-gradient(90deg, rgba(14,50,52,.7), rgba(9,12,15,.45)); }
.panel-head h2 { margin: 0; font-size: 20px; color: #eafff9; }
.panel-code { font: 700 11px ui-monospace, Consolas, monospace; color: #57f0b3; letter-spacing: 1px; }
.panel-state { padding: 4px 8px; border-radius: 4px; font: 700 11px ui-monospace, Consolas, monospace; }
.panel-state.good { color: #6bffc1; background: rgba(31,154,101,.18); } .panel-state.bad { color: #ff8993; background: rgba(192,40,63,.2); }
.panel-body { padding: 12px; }
.loading-strip { display: flex; align-items: center; gap: 8px; margin: -2px 0 10px; padding: 6px 8px; border: 1px solid rgba(95,211,255,.18); border-radius: 4px; background: rgba(48,111,135,.13); color: #bcecff; font: 700 11px ui-monospace, Consolas, monospace; text-transform: uppercase; }
.spinner { display: inline-block; width: 10px; height: 10px; margin-right: 6px; border: 2px solid rgba(125,255,197,.22); border-top-color: #7dffc5; border-radius: 50%; animation: spin .75s linear infinite; vertical-align: -1px; }
.control-grid { display: grid; gap: 8px; margin-bottom: 10px; }
.activity-controls { grid-template-columns: repeat(3, minmax(120px, 1fr)) repeat(3, 135px) 110px 92px 112px; }
.ip-controls { grid-template-columns: minmax(220px, 1fr) 160px 92px; }
.auth-controls { grid-template-columns: 1fr 1fr 180px 92px; } .profile-controls { grid-template-columns: 1fr 1fr 92px; } .honey-controls { grid-template-columns: minmax(240px, 1fr) 120px 92px; }
input, select, textarea { min-width: 0; border: 1px solid rgba(116,255,198,.16); border-radius: 4px; background: #071012; color: #e7fff7; padding: 8px 9px; outline: none; }
textarea { width: 100%; min-height: 70px; resize: vertical; margin: 10px 0 8px; }
input:focus, select:focus, textarea:focus { border-color: #52ffb9; box-shadow: 0 0 0 1px rgba(82,255,185,.15); }
.map-toggle input[type="checkbox"] { min-width: 13px; width: 13px; height: 13px; padding: 0; border: 1px solid rgba(95,211,255,.42); background: #071012; accent-color: #5fd3ff; }
.checkline { display: flex; align-items: center; gap: 6px; color: #a8c3bb; font-size: 12px; }
.od-btn, .micro { border: 1px solid rgba(82,255,185,.28); border-radius: 4px; background: linear-gradient(180deg, rgba(28,111,85,.38), rgba(10,25,26,.9)); color: #eafff9; cursor: pointer; font-weight: 700; }
.od-btn:disabled, .micro:disabled { opacity: .52; cursor: wait; }
.od-btn { padding: 8px 11px; } .od-btn.ghost { background: rgba(255,255,255,.04); } .od-btn.danger, .micro.danger { border-color: rgba(255,83,104,.45); color: #ffb9c1; } .od-btn.cyan, .micro.cyan { border-color: rgba(95,211,255,.45); color: #bcecff; } .od-btn.release, .micro.release { border-color: rgba(93,255,174,.5); color: #baffdc; background: linear-gradient(180deg, rgba(32,132,89,.44), rgba(8,30,25,.92)); } .micro.warn { color: #ffd98a; border-color: rgba(255,194,71,.4); }
.micro { padding: 4px 7px; font-size: 11px; }
.table-shell { position: relative; max-height: 590px; overflow: auto; border: 1px solid rgba(255,255,255,.08); border-radius: 5px; }
.table-shell table { transition: opacity .18s ease; }
.table-shell.refreshing table { opacity: .72; }
.table-loading-overlay { position: absolute; top: 8px; left: 8px; z-index: 5; display: inline-flex; align-items: center; gap: 7px; padding: 6px 9px; border: 1px solid rgba(95,211,255,.24); border-radius: 4px; background: rgba(4,15,18,.84); color: #bcecff; backdrop-filter: blur(6px); box-shadow: 0 8px 18px rgba(0,0,0,.26); font: 800 11px ui-monospace, Consolas, monospace; text-transform: uppercase; animation: softFadeIn .16s ease-out both; }
.table-row-fade-enter-active, .table-row-fade-leave-active { transition: opacity .18s ease, transform .18s ease; }
.table-row-fade-enter-from, .table-row-fade-leave-to { opacity: 0; transform: translateY(4px); }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { padding: 7px 9px; border-bottom: 1px solid rgba(255,255,255,.055); text-align: left; vertical-align: top; }
th { position: sticky; top: 0; z-index: 1; background: #0a1113; color: #73ffbf; font: 700 11px ui-monospace, Consolas, monospace; text-transform: uppercase; }
tr:hover td { background: rgba(78,255,182,.035); }
.clickable-row { cursor: pointer; }
.clickable-row:hover td { background: rgba(78,255,182,.085); }
.row-bad td { background: rgba(149, 31, 50, .12); } .row-warn td { background: rgba(169, 116, 24, .11); } .row-trap td { background: rgba(92, 57, 159, .12); }
.clip { max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.link-btn { padding: 0; border: 0; background: transparent; color: #7dffc5; cursor: pointer; text-decoration: underline; }
.status.good { color: #6bffc1; } .status.warn { color: #ffc247; } .status.bad { color: #ff5a6a; } .status.mid { color: #5fd3ff; }
.origin-pill { display: inline-block; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,.06); color: #cbded8; }
.origin-pill.web { color: #9be7ff; background: rgba(55,169,211,.15); } .origin-pill.api { color: #baf0c7; background: rgba(77,170,87,.13); } .origin-pill.bad { color: #ffb1bb; background: rgba(226,59,83,.16); }
.profile-pill, .attacker-pill, .protected-chip, .identity-chip { display: inline-block; padding: 3px 7px; border-radius: 4px; font-size: 11px; font-weight: 800; }
.profile-pill, .identity-chip.profile { color: #bfffe1; background: rgba(52,162,99,.18); border: 1px solid rgba(89,238,153,.18); }
.attacker-pill, .identity-chip.attacker { color: #ffc4cc; background: rgba(204,54,77,.16); border: 1px solid rgba(255,83,104,.2); }
.protected-chip { color: #c79cff; background: rgba(139,92,246,.16); border: 1px solid rgba(199,156,255,.22); }
.identity-chip { margin-top: 9px; }
.action-row { display: flex; flex-wrap: wrap; gap: 4px; min-width: 220px; }
.detail-actions { display: flex; flex-wrap: wrap; gap: 7px; }
.empty-cell { text-align: center; color: #70837e; padding: 28px; }
.pager { display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 10px; color: #8ba59d; font-size: 12px; }
.detail-block:first-child { border-top: 0; margin-top: 0; padding-top: 0; }
.detail-title { font-weight: 800; color: #eafff9; font-size: 16px; }
.detail-sub { margin-top: 3px; color: #86a39b; font-size: 12px; }
.score-ring { margin: 14px auto; width: 124px; height: 124px; border-radius: 50%; border: 1px solid rgba(82,255,185,.35); display: grid; place-items: center; background: radial-gradient(circle, rgba(82,255,185,.17), rgba(9,13,15,.86) 62%); }
.score-ring span { display: block; font-size: 32px; color: #7dffc5; text-align: center; }.score-ring small { display: block; color: #9fb8b1; text-align: center; margin-top: -18px; }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.detail-grid div { padding: 8px; border: 1px solid rgba(255,255,255,.07); border-radius: 4px; background: rgba(255,255,255,.03); }
.detail-grid span { display: block; color: #7d948e; font-size: 11px; } .detail-grid strong { display: block; margin-top: 3px; color: #f3fffb; font-size: 12px; }
.port-list { display: grid; gap: 6px; margin-top: 8px; } .port-list div { display: flex; gap: 8px; justify-content: space-between; padding: 6px; background: rgba(255,255,255,.04); border-radius: 4px; }
.od-error { margin-top: 12px; padding: 10px 12px; border: 1px solid rgba(255,83,104,.35); border-radius: 5px; background: rgba(120,22,36,.35); color: #ffc7cd; }
@keyframes pulse { 0%,100% { opacity: .45; } 50% { opacity: 1; } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes softFadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
@keyframes mapPopoverIn { from { opacity: 0; transform: translateY(6px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes blockPulse { 0% { opacity: 0; transform: scale(.55); } 65% { opacity: 1; transform: scale(1.14); } 100% { opacity: 1; transform: scale(1); } }
@keyframes blockStrike { from { transform: rotate(45deg) scaleX(0); } to { transform: rotate(45deg) scaleX(1); } }
.world-map-stage :deep(.od-block-cross::after) { animation-name: blockStrikeReverse; }
@keyframes blockStrikeReverse { from { transform: rotate(-45deg) scaleX(0); } to { transform: rotate(-45deg) scaleX(1); } }
@media (max-width: 1320px) { .od-grid { grid-template-columns: 210px 1fr; } .od-detail { grid-column: 1 / -1; } .activity-controls { grid-template-columns: repeat(3, 1fr); } .map-layout { grid-template-columns: 1fr; } .map-intel { grid-template-columns: repeat(4, minmax(0, 1fr)); } .map-legend, .map-selected { grid-column: auto; } }
@media (max-width: 820px) { .od-header { align-items: flex-start; flex-direction: column; } .od-header-actions { width: 100%; flex-wrap: wrap; } .refresh-stamp { min-width: 0; text-align: left; } .map-head { align-items: flex-start; flex-direction: column; } .map-actions { width: 100%; align-items: flex-start; flex-direction: column; } .map-filters { width: 100%; flex-wrap: wrap; } .map-filters button, .map-toggle { flex: 1 1 130px; } .world-map-stage { height: 52vh; min-height: 340px; } .map-intel { grid-template-columns: repeat(2, minmax(0, 1fr)); } .map-legend, .map-selected { grid-column: 1 / -1; } .od-metrics { grid-template-columns: repeat(2, 1fr); } .od-grid { grid-template-columns: 1fr; } .activity-controls, .auth-controls, .profile-controls, .honey-controls, .ip-controls { grid-template-columns: 1fr; } }
.od-modal-backdrop { position: fixed; inset: 0; z-index: 2000; display: flex; align-items: flex-start; justify-content: center; padding: 5vh 16px; background: rgba(2, 6, 8, 0.78); backdrop-filter: blur(4px); animation: softFadeIn .14s ease-out both; }
.od-modal { width: min(960px, 100%); max-height: 90vh; display: flex; flex-direction: column; border: 1px solid rgba(82,255,185,.32); border-radius: 6px; background: linear-gradient(180deg, rgba(7,18,20,.98), rgba(4,8,10,.98)); box-shadow: 0 24px 64px rgba(0,0,0,.55), 0 0 36px rgba(82,255,185,.08); color: #d9fff0; overflow: hidden; }
.od-modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 14px 16px; border-bottom: 1px solid rgba(82,255,185,.18); background: linear-gradient(90deg, rgba(14,50,52,.7), rgba(9,12,15,.45)); }
.od-modal-head h2 { margin: 4px 0 0; font-size: 22px; color: #eafff9; }
.od-modal-head small { display: block; margin-top: 4px; color: #86a39b; font: 700 11px ui-monospace, Consolas, monospace; }
.od-modal-loading { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 60px 16px; color: #bcecff; font: 700 12px ui-monospace, Consolas, monospace; text-transform: uppercase; }
.od-modal-body { padding: 14px 16px 20px; overflow: auto; }
.od-detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; margin-bottom: 14px; }
.od-detail-grid div { padding: 8px 10px; border: 1px solid rgba(255,255,255,.07); border-radius: 4px; background: rgba(255,255,255,.03); min-width: 0; }
.od-detail-grid span { display: block; color: #7d948e; font: 700 10px ui-monospace, Consolas, monospace; text-transform: uppercase; letter-spacing: .8px; }
.od-detail-grid strong { display: block; margin-top: 3px; color: #f3fffb; font-size: 13px; word-break: break-word; }
.od-detail-grid strong small { color: #86a39b; font-weight: 600; font-size: 11px; margin-left: 4px; }
.od-detail-section { margin-top: 14px; border: 1px solid rgba(82,255,185,.16); border-radius: 5px; background: rgba(255,255,255,.025); }
.od-detail-section-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid rgba(82,255,185,.12); background: rgba(255,255,255,.02); }
.od-detail-section-head h3 { margin: 0; font: 700 12px ui-monospace, Consolas, monospace; color: #82f8c1; text-transform: uppercase; letter-spacing: 1px; }
.od-detail-code { margin: 0; padding: 10px 12px; background: #050b0d; color: #c5e9d9; font: 12px/1.5 ui-monospace, Consolas, monospace; white-space: pre-wrap; word-break: break-all; max-height: 360px; overflow: auto; }
.od-detail-code.body { max-height: 460px; }
.od-kv-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.od-kv-table th, .od-kv-table td { padding: 6px 12px; border-bottom: 1px solid rgba(255,255,255,.05); text-align: left; vertical-align: top; }
.od-kv-table th { background: rgba(255,255,255,.025); color: #73ffbf; font: 700 11px ui-monospace, Consolas, monospace; text-transform: uppercase; }
.od-kv-table td:first-child { color: #bcecff; font: 700 12px ui-monospace, Consolas, monospace; white-space: nowrap; }
.od-kv-table td:nth-child(2) { color: #d9fff0; max-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.od-body-hash { padding: 6px 12px; font: 11px ui-monospace, Consolas, monospace; word-break: break-all; border-top: 1px solid rgba(82,255,185,.08); }
</style>
