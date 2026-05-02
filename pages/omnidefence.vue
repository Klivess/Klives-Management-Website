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
                    <div v-if="loading.requests" class="loading-strip"><span class="spinner"></span>Loading activity</div>
                    <div class="table-shell">
                        <table>
                            <thead><tr><th>Time</th><th>IP</th><th>Origin</th><th>Method</th><th>Route</th><th>Status</th><th>Profile</th><th>Reason</th><th>Ms</th></tr></thead>
                            <tbody>
                                <tr v-for="row in requests" :key="row.id" :class="rowClass(row)">
                                    <td>{{ fmtTime(row.ts) }}</td>
                                    <td><button class="link-btn" @click="selectIp(row.ip)">{{ row.ip || 'unknown' }}</button></td>
                                    <td><span :class="originClass(row.origin)">{{ row.origin || 'Unknown' }}</span></td>
                                    <td>{{ row.method }}</td>
                                    <td class="clip">{{ row.route }}</td>
                                    <td :class="statusClass(row.status)">{{ row.status }}</td>
                                    <td>{{ row.profile || '-' }}</td>
                                    <td class="clip">{{ row.reason || '-' }}</td>
                                    <td>{{ Math.round(row.duration || 0) }}</td>
                                </tr>
                                <tr v-if="!requests.length"><td colspan="9" class="empty-cell">No request records</td></tr>
                            </tbody>
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
                                <tr v-for="ip in ips" :key="ip.ip" :class="ipClass(ip)">
                                    <td><button class="link-btn" @click="selectIp(ip.ip)">{{ ip.ip }}</button></td>
                                    <td>{{ ip.country || '-' }} <span class="muted">{{ ip.asn || '' }}</span></td>
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
                                <tr v-for="event in authEvents" :key="event.id" :class="authClass(event.type)"><td>{{ fmtTime(event.ts) }}</td><td>{{ event.type }}</td><td>{{ event.ip || '-' }}</td><td>{{ event.profile || '-' }}</td><td class="clip">{{ event.route || '-' }}</td><td class="clip">{{ event.detail || '-' }}</td></tr>
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
                    <div class="detail-sub">{{ selectedIp.country || 'Unknown geo' }} / {{ selectedIp.asn || 'Unknown ASN' }}</div>
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
    </div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
</script>

<script>
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';

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
            requests: [], ips: [], authEvents: [], profileActions: [], honeypotRoutes: [],
            selectedIp: null, selectedIpNote: '', selectedIpRecent: [], selectedIpEvents: [], lastScan: null,
            newHoneypotRoute: '', loadError: null, refreshTimer: null, lastUpdated: null,
            loading: { overview: false, requests: false, ips: false, auth: false, profile: false, honeypot: false, action: false, ipDetail: false },
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
        isBusy() { return Object.values(this.loading).some(Boolean); },
        busyLabel() {
            const map = { overview: 'Refreshing overview', requests: 'Loading activity', ips: 'Loading IPs', auth: 'Loading auth', profile: 'Loading profiles', honeypot: 'Loading traps', action: 'Working', ipDetail: 'Loading IP' };
            const key = Object.keys(this.loading).find(k => this.loading[k]);
            return key ? map[key] : '';
        },
        lastUpdatedLabel() { return this.lastUpdated ? `Updated ${this.lastUpdated.toLocaleTimeString()}` : 'Ready'; }
    },
    async mounted() {
        await this.refreshActive(false);
        this.refreshTimer = setInterval(() => this.refreshActive(false), 5000);
    },
    beforeUnmount() { if (this.refreshTimer) clearInterval(this.refreshTimer); },
    watch: {
        activeTab(tab) {
            if (tab === 'activity') this.loadRequests();
            if (tab === 'ips') this.loadIps();
            if (tab === 'auth') this.loadAuthEvents();
            if (tab === 'profiles') this.loadProfileActions();
            if (tab === 'honeypot') this.loadHoneypotRoutes();
        }
    },
    methods: {
        fmtNum(value) { return Number(value || 0).toLocaleString(); },
        fmtTime(value) {
            if (!value) return '-';
            const date = new Date(Number(value) * 1000);
            return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
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
                notes: row.notes ?? row.Notes,
                profileId: row.associated_profile_id ?? row.AssociatedProfileId,
                profileName: row.associated_profile_name ?? row.AssociatedProfileName,
                profileRank: row.associated_profile_rank ?? row.AssociatedProfileRank,
                isKlives: Number(row.associated_profile_rank ?? row.AssociatedProfileRank ?? 0) >= 5,
            };
        },
        normalizeAuth(row) { return { id: row.id, ts: row.utc_ts, ip: row.ip, type: row.type, profile: row.profile_name, route: row.route, detail: row.detail }; },
        normalizeProfile(row) { return { id: row.id, ts: row.utc_ts, profile: row.profile_name || row.profile_id, category: row.category, action: row.action, ip: row.ip, detail: row.detail_json }; },
        async loadOverview() { const data = await this.fetchJson('/omnidefence/overview', 'overview'); if (data) this.overview = data; },
        async loadRequests() { const data = await this.fetchJson('/omnidefence/requests' + this.buildQuery(this.filters.requests), 'requests'); if (data) this.requests = data.map(this.normalizeRequest); },
        async loadIps() { const data = await this.fetchJson('/omnidefence/ips' + this.buildQuery(this.filters.ips), 'ips'); if (data) this.ips = data.map(this.normalizeIp); },
        async loadAuthEvents() { const data = await this.fetchJson('/omnidefence/auth-events' + this.buildQuery(this.filters.auth), 'auth'); if (data) this.authEvents = data.map(this.normalizeAuth); },
        async loadProfileActions() { const data = await this.fetchJson('/omnidefence/profile-actions' + this.buildQuery(this.filters.profile), 'profile'); if (data) this.profileActions = data.map(this.normalizeProfile); },
        async loadHoneypotRoutes() { const data = await this.fetchJson('/omnidefence/honeypot-routes', 'honeypot'); if (data) this.honeypotRoutes = data; },
        async refreshActive(manual = true) {
            if (this.isBusy && !manual) return;
            const jobs = [this.loadOverview()];
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
        }
    }
};
</script>

<style scoped>
.od-shell {
    min-height: calc(100vh - 70px);
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
.checkline { display: flex; align-items: center; gap: 6px; color: #a8c3bb; font-size: 12px; }
.od-btn, .micro { border: 1px solid rgba(82,255,185,.28); border-radius: 4px; background: linear-gradient(180deg, rgba(28,111,85,.38), rgba(10,25,26,.9)); color: #eafff9; cursor: pointer; font-weight: 700; }
.od-btn:disabled, .micro:disabled { opacity: .52; cursor: wait; }
.od-btn { padding: 8px 11px; } .od-btn.ghost { background: rgba(255,255,255,.04); } .od-btn.danger, .micro.danger { border-color: rgba(255,83,104,.45); color: #ffb9c1; } .od-btn.cyan, .micro.cyan { border-color: rgba(95,211,255,.45); color: #bcecff; } .od-btn.release, .micro.release { border-color: rgba(93,255,174,.5); color: #baffdc; background: linear-gradient(180deg, rgba(32,132,89,.44), rgba(8,30,25,.92)); } .micro.warn { color: #ffd98a; border-color: rgba(255,194,71,.4); }
.micro { padding: 4px 7px; font-size: 11px; }
.table-shell { max-height: 590px; overflow: auto; border: 1px solid rgba(255,255,255,.08); border-radius: 5px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { padding: 7px 9px; border-bottom: 1px solid rgba(255,255,255,.055); text-align: left; vertical-align: top; }
th { position: sticky; top: 0; z-index: 1; background: #0a1113; color: #73ffbf; font: 700 11px ui-monospace, Consolas, monospace; text-transform: uppercase; }
tr:hover td { background: rgba(78,255,182,.035); }
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
@media (max-width: 1320px) { .od-grid { grid-template-columns: 210px 1fr; } .od-detail { grid-column: 1 / -1; } .activity-controls { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 820px) { .od-header { align-items: flex-start; flex-direction: column; } .od-header-actions { width: 100%; flex-wrap: wrap; } .refresh-stamp { min-width: 0; text-align: left; } .od-metrics { grid-template-columns: repeat(2, 1fr); } .od-grid { grid-template-columns: 1fr; } .activity-controls, .auth-controls, .profile-controls, .honey-controls, .ip-controls { grid-template-columns: 1fr; } }
</style>
