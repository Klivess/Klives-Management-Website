<template>
    <div class="os-shell">
        <!-- ─────── Header ─────── -->
        <header class="os-header">
            <div>
                <div class="os-kicker"><span class="live-dot"></span> INTELLIGENCE FEED ACTIVE</div>
                <h1>Omniscience</h1>
                <p>Passive ingestion · behavioural analytics · LLM-generated dossiers across all linked accounts.</p>
            </div>
            <div class="os-header-actions">
                <span class="refresh-stamp">{{ busyLabel || lastUpdatedLabel }}</span>
                <button class="os-btn ghost" :disabled="isBusy" @click="refreshAll">Refresh</button>
                <button class="os-btn violet" :disabled="profilerRunning" @click="runProfilerNow">
                    {{ profilerRunning ? 'Profiler running…' : 'Run Profiler Now' }}
                </button>
            </div>
        </header>

        <!-- ─────── Metric tiles ─────── -->
        <section class="os-metrics">
            <button class="metric-tile cyan" @click="activeTab = 'peo'">
                <span class="metric-copy"><span class="metric-label">People</span><small>{{ fmtNum(overview?.identities) }} identities</small></span>
                <strong>{{ fmtNum(overview?.persons) }}</strong>
            </button>
            <button class="metric-tile" @click="activeTab = 'cnv'">
                <span class="metric-copy"><span class="metric-label">Messages</span><small>{{ fmtNum(overview?.attachments) }} attachments</small></span>
                <strong>{{ fmtNum(overview?.messages) }}</strong>
            </button>
            <button class="metric-tile cyan" @click="activeTab = 'cnv'">
                <span class="metric-copy"><span class="metric-label">Conversations</span><small>across all platforms</small></span>
                <strong>{{ fmtNum(overview?.conversations) }}</strong>
            </button>
            <button class="metric-tile violet" @click="activeTab = 'llm'">
                <span class="metric-copy"><span class="metric-label">LLM Dossiers</span><small>{{ profilerRunning ? 'generating…' : 'on file' }}</small></span>
                <strong>{{ fmtNum(overview?.personality_profiles) }}</strong>
            </button>
            <button class="metric-tile warn" @click="activeTab = 'src'">
                <span class="metric-copy"><span class="metric-label">Active Sources</span><small>{{ sourceErrorCount }} errors</small></span>
                <strong>{{ fmtNum(overview?.sources) }}</strong>
            </button>
        </section>

        <!-- ─────── Main grid ─────── -->
        <section class="os-grid">

            <!-- ── Left rail ── -->
            <aside class="os-rail">
                <nav class="os-tabs">
                    <button v-for="tab in tabs" :key="tab.id" :class="['os-tab', { active: activeTab === tab.id }]" @click="activeTab = tab.id">
                        <span>{{ tab.code }}</span>{{ tab.label }}
                    </button>
                </nav>

                <div class="rail-section">
                    <h3>Active Sources</h3>
                    <div v-if="!sources.length" class="empty-rail">No sources linked.</div>
                    <button v-for="s in sources.slice(0, 6)" :key="s.source_id" class="rail-row" @click="activeTab = 'src'">
                        <span class="rail-dot" :class="`s-${s.status || 'idle'}`"></span>
                        <span class="rail-text">
                            <strong>{{ s.self_username || s.label || s.platform }}</strong>
                            <small>{{ s.platform }} · {{ fmtTime(s.last_event_at) }}</small>
                        </span>
                    </button>
                </div>

                <div class="rail-section">
                    <h3>Scheduler</h3>
                    <div class="rail-meta-row"><span>Status</span><strong :class="profilerRunning ? 'good' : 'mid'">{{ profilerRunning ? 'RUNNING' : 'IDLE' }}</strong></div>
                    <div class="rail-meta-row"><span>Last run</span><strong>{{ fmtTime(scheduleStatus?.last_run_finished_at) }}</strong></div>
                    <div class="rail-meta-row"><span>Outcome</span><strong>{{ scheduleStatus?.last_run_status || '—' }}</strong></div>
                </div>

                <div class="rail-section">
                    <h3>Top by Volume</h3>
                    <div v-if="!topPeople.length" class="empty-rail">Awaiting data.</div>
                    <button v-for="p in topPeople" :key="p.person_id" class="rail-row" @click="openPerson(p)">
                        <span class="rail-rank">{{ fmtNum(p.message_count) }}</span>
                        <span class="rail-text">
                            <strong>{{ p.display_name || '(unnamed)' }}</strong>
                            <small>{{ p.handles || '—' }}</small>
                        </span>
                    </button>
                </div>
            </aside>

            <!-- ── Center panel ── -->
            <section class="os-panel">

                <!-- INT: Overview -->
                <template v-if="activeTab === 'int'">
                    <div class="panel-head">
                        <div><span class="panel-code">INT</span><h2>Intelligence Overview</h2></div>
                        <span class="panel-state mid">v1 schema</span>
                    </div>
                    <div class="panel-body">
                        <div class="kpi-strip">
                            <div class="kpi"><span>People</span><strong>{{ fmtNum(overview?.persons) }}</strong></div>
                            <div class="kpi"><span>Identities</span><strong>{{ fmtNum(overview?.identities) }}</strong></div>
                            <div class="kpi"><span>Messages</span><strong>{{ fmtNum(overview?.messages) }}</strong></div>
                            <div class="kpi"><span>Conversations</span><strong>{{ fmtNum(overview?.conversations) }}</strong></div>
                            <div class="kpi"><span>Attachments</span><strong>{{ fmtNum(overview?.attachments) }}</strong></div>
                            <div class="kpi"><span>Profiles</span><strong>{{ fmtNum(overview?.personality_profiles) }}</strong></div>
                        </div>

                        <h4 class="block-h">Schedule</h4>
                        <div class="info-grid">
                            <div><span>Currently running</span><strong>{{ profilerRunning ? 'YES' : 'NO' }}</strong></div>
                            <div><span>Last started</span><strong>{{ fmtTime(scheduleStatus?.last_run_started_at) }}</strong></div>
                            <div><span>Last finished</span><strong>{{ fmtTime(scheduleStatus?.last_run_finished_at) }}</strong></div>
                            <div><span>Last outcome</span><strong>{{ scheduleStatus?.last_run_status || '—' }}</strong></div>
                        </div>

                        <h4 class="block-h">Top people by message volume</h4>
                        <div class="people-strip">
                            <button v-for="p in topPeople" :key="'tp'+p.person_id" class="person-pill" @click="openPerson(p)">
                                <strong>{{ p.display_name || '(unnamed)' }}</strong>
                                <small>{{ fmtNum(p.message_count) }} msgs</small>
                            </button>
                            <span v-if="!topPeople.length" class="muted">No data yet — link a source.</span>
                        </div>

                        <h4 class="block-h">Hot conversations</h4>
                        <div class="conv-strip">
                            <button v-for="c in conversations.slice(0, 6)" :key="'tc'+c.conversation_id" class="conv-chip" @click="openConversation(c)">
                                <strong>{{ c.title || c.guild_name || '(untitled)' }}</strong>
                                <small>{{ c.platform }} · {{ fmtNum(c.message_count) }} msgs</small>
                            </button>
                            <span v-if="!conversations.length" class="muted">No conversations indexed.</span>
                        </div>
                    </div>
                </template>

                <!-- SRC: Sources -->
                <template v-else-if="activeTab === 'src'">
                    <div class="panel-head">
                        <div><span class="panel-code">SRC</span><h2>Harvest Sources</h2></div>
                        <span class="panel-state" :class="sourceErrorCount ? 'bad' : 'good'">{{ sourceErrorCount ? sourceErrorCount + ' errors' : 'all healthy' }}</span>
                    </div>
                    <div class="panel-body">
                        <h4 class="block-h">Add Discord source</h4>
                        <div class="add-source">
                            <input v-model="newSource.token" placeholder="Discord user token" />
                            <input v-model="newSource.label" placeholder="Optional label" />
                            <button class="os-btn violet" :disabled="adding || !newSource.token.trim()" @click="addSource">{{ adding ? 'Adding…' : 'Add' }}</button>
                        </div>
                        <p class="warn-line">Tokens are encrypted at rest with DPAPI (machine-bound). Do not share machine images containing Omniscience storage.</p>

                        <div class="table-shell">
                            <table>
                                <thead>
                                    <tr><th>Platform</th><th>Identity</th><th>Label</th><th>Status</th><th>Last event</th><th>Last full sync</th><th>Actions</th></tr>
                                </thead>
                                <tbody>
                                    <tr v-for="s in sources" :key="s.source_id" :class="{ 'row-bad': s.status === 'error' }">
                                        <td><span class="origin-pill">{{ s.platform }}</span></td>
                                        <td>{{ s.self_username || s.self_platform_user_id || '—' }}</td>
                                        <td>{{ s.label || '—' }}</td>
                                        <td>
                                            <span class="status" :class="s.status === 'active' ? 'good' : (s.status === 'error' ? 'bad' : 'mid')">{{ (s.status || 'idle').toUpperCase() }}</span>
                                            <small v-if="s.last_status_message" class="muted"> · {{ s.last_status_message }}</small>
                                        </td>
                                        <td class="muted">{{ fmtTime(s.last_event_at) }}</td>
                                        <td class="muted">{{ fmtTime(s.last_full_sync_at) }}</td>
                                        <td>
                                            <button class="micro cyan" @click="backfill(s)">Backfill</button>
                                            <button class="micro danger" @click="removeSource(s)">Remove</button>
                                        </td>
                                    </tr>
                                    <tr v-if="!sources.length"><td colspan="7" class="muted" style="text-align:center;padding:18px">No sources. Paste a Discord token above to begin ingestion.</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </template>

                <!-- PEO: People -->
                <template v-else-if="activeTab === 'peo'">
                    <div class="panel-head">
                        <div><span class="panel-code">PEO</span><h2>People Directory</h2></div>
                        <span class="panel-state mid">{{ people.length }} shown</span>
                    </div>
                    <div class="panel-body">
                        <div class="control-row people-controls">
                            <input v-model="peopleSearch" @input="onSearchChange" placeholder="Search by name or username" />
                            <select v-model="peoplePlatform" @change="loadPeople">
                                <option value="">All platforms</option>
                                <option value="discord">Discord</option>
                            </select>
                            <button class="os-btn ghost" @click="loadPeople">Reload</button>
                        </div>

                        <div class="people-grid">
                            <button v-for="p in people" :key="p.person_id" class="person-card" :class="{ active: selectedPersonId === p.person_id }" @click="openPerson(p)">
                                <div class="pc-name">{{ p.display_name || '(unnamed)' }}</div>
                                <div class="pc-handles">{{ p.handles || '—' }}</div>
                                <div class="pc-foot"><span>{{ fmtNum(p.message_count) }} msgs</span><small>{{ fmtTime(p.updated_at) }}</small></div>
                            </button>
                            <div v-if="!people.length" class="muted" style="grid-column:1/-1;text-align:center;padding:24px">No people captured yet. Add a source.</div>
                        </div>
                    </div>
                </template>

                <!-- DSR: Dossier -->
                <template v-else-if="activeTab === 'dsr'">
                    <div class="panel-head">
                        <div><span class="panel-code">DSR</span><h2>{{ dossier?.display_name || 'Dossier' }}</h2></div>
                        <div class="head-actions">
                            <button class="micro cyan" :disabled="!dossier || recomputing" @click="recomputeSelected">{{ recomputing ? 'Recomputing…' : 'Recompute' }}</button>
                            <button class="micro" :disabled="!dossier" @click="dossier = null">Close</button>
                        </div>
                    </div>
                    <div class="panel-body">
                        <div v-if="!dossier" class="muted" style="text-align:center;padding:32px">Select a person from the PEO tab to load their dossier.</div>
                        <template v-else>
                            <div class="info-grid">
                                <div><span>Person ID</span><strong class="mono">{{ dossier.person_id }}</strong></div>
                                <div><span>Messages</span><strong>{{ fmtNum(dossier.message_count || 0) }}</strong></div>
                                <div><span>Identities</span><strong>{{ dossier.identities?.length || 0 }}</strong></div>
                                <div><span>Profile generated</span><strong>{{ fmtTime(dossier.personality_profile?.generated_at) }}</strong></div>
                            </div>

                            <div class="dossier-grid">
                                <!-- Identities -->
                                <div class="dossier-card">
                                    <div class="dc-head"><span class="panel-code sm">IDS</span><h3>Linked identities</h3></div>
                                    <ul class="ident-list">
                                        <li v-for="i in dossier.identities" :key="i.identity_id">
                                            <span class="origin-pill">{{ i.platform }}</span>
                                            <span class="mono">{{ i.platform_username || i.platform_user_id }}</span>
                                            <small v-if="i.display_name" class="muted">({{ i.display_name }})</small>
                                        </li>
                                    </ul>
                                </div>

                                <!-- Personality narrative -->
                                <div class="dossier-card wide">
                                    <div class="dc-head"><span class="panel-code sm">LLM</span><h3>Personality dossier</h3>
                                        <small v-if="dossier.personality_profile" class="muted">{{ fmtTime(dossier.personality_profile.generated_at) }}</small>
                                    </div>
                                    <div v-if="dossier.personality_profile" class="narrative" v-html="renderMarkdown(dossier.personality_profile.narrative_markdown)"></div>
                                    <div v-else class="muted" style="padding:14px">No profile generated yet. Run profiler.</div>
                                    <details v-if="dossier.personality_profile?.traits" class="details">
                                        <summary>Structured traits JSON</summary>
                                        <pre>{{ JSON.stringify(dossier.personality_profile.traits, null, 2) }}</pre>
                                    </details>
                                </div>

                                <!-- Activity -->
                                <div class="dossier-card">
                                    <div class="dc-head"><span class="panel-code sm">ACT</span><h3>Activity pattern</h3></div>
                                    <div v-if="dossier.analytics?.activity_pattern">
                                        <div class="info-grid sm">
                                            <div><span>First</span><strong>{{ fmtTime(dossier.analytics.activity_pattern.payload.first_message_at) }}</strong></div>
                                            <div><span>Last</span><strong>{{ fmtTime(dossier.analytics.activity_pattern.payload.last_message_at) }}</strong></div>
                                            <div><span>Avg/day</span><strong>{{ (dossier.analytics.activity_pattern.payload.messages_per_day_avg || 0).toFixed(2) }}</strong></div>
                                            <div><span>Peak hour</span><strong>{{ dossier.analytics.activity_pattern.payload.peak_hour }}h</strong></div>
                                        </div>
                                        <div class="bars">
                                            <div v-for="(h, idx) in dossier.analytics.activity_pattern.payload.hour_histogram" :key="idx"
                                                 class="bar"
                                                 :style="{ height: barHeight(h, dossier.analytics.activity_pattern.payload.hour_histogram) }"
                                                 :title="`${idx}:00 — ${h} msgs`"></div>
                                        </div>
                                        <div class="bar-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
                                    </div>
                                    <div v-else class="muted">Not computed.</div>
                                </div>

                                <!-- Sentiment -->
                                <div class="dossier-card">
                                    <div class="dc-head"><span class="panel-code sm">SNT</span><h3>Sentiment</h3></div>
                                    <div v-if="dossier.analytics?.sentiment">
                                        <div class="info-grid sm">
                                            <div><span>Avg</span><strong :class="sentimentClass(dossier.analytics.sentiment.payload.avg_sentiment)">{{ (dossier.analytics.sentiment.payload.avg_sentiment || 0).toFixed(3) }}</strong></div>
                                            <div><span>Positive</span><strong class="good">{{ fmtNum(dossier.analytics.sentiment.payload.positive_count) }}</strong></div>
                                            <div><span>Negative</span><strong class="bad">{{ fmtNum(dossier.analytics.sentiment.payload.negative_count) }}</strong></div>
                                            <div><span>Neutral</span><strong class="mid">{{ fmtNum(dossier.analytics.sentiment.payload.neutral_count) }}</strong></div>
                                        </div>
                                    </div>
                                    <div v-else class="muted">Not computed.</div>
                                </div>

                                <!-- Vocabulary -->
                                <div class="dossier-card">
                                    <div class="dc-head"><span class="panel-code sm">VOC</span><h3>Vocabulary</h3></div>
                                    <div v-if="dossier.analytics?.vocabulary">
                                        <div class="info-grid sm">
                                            <div><span>Avg chars</span><strong>{{ (dossier.analytics.vocabulary.payload.avg_message_chars || 0).toFixed(1) }}</strong></div>
                                            <div><span>TTR</span><strong>{{ (dossier.analytics.vocabulary.payload.type_token_ratio || 0).toFixed(3) }}</strong></div>
                                        </div>
                                        <div class="tag-cloud">
                                            <span v-for="t in (dossier.analytics.vocabulary.payload.top_tokens || []).slice(0, 28)" :key="t.token"
                                                  class="tag" :style="{ fontSize: tokenSize(t, dossier.analytics.vocabulary.payload.top_tokens) }">{{ t.token }}</span>
                                        </div>
                                    </div>
                                    <div v-else class="muted">Not computed.</div>
                                </div>

                                <!-- Emoji -->
                                <div class="dossier-card">
                                    <div class="dc-head"><span class="panel-code sm">EMJ</span><h3>Emoji</h3></div>
                                    <div v-if="dossier.analytics?.emoji_usage">
                                        <div class="info-grid sm">
                                            <div><span>Per msg</span><strong>{{ (dossier.analytics.emoji_usage.payload.emoji_per_message || 0).toFixed(3) }}</strong></div>
                                        </div>
                                        <div class="emoji-list">
                                            <span v-for="e in (dossier.analytics.emoji_usage.payload.top_emoji || []).slice(0, 24)" :key="e.emoji" class="emoji-chip">
                                                <span class="ev">{{ e.emoji }}</span><small>{{ e.count }}</small>
                                            </span>
                                        </div>
                                    </div>
                                    <div v-else class="muted">Not computed.</div>
                                </div>

                                <!-- Interests -->
                                <div class="dossier-card">
                                    <div class="dc-head"><span class="panel-code sm">INT</span><h3>Inferred interests</h3></div>
                                    <div v-if="dossier.analytics?.interests">
                                        <div v-for="c in (dossier.analytics.interests.payload.categories || []).filter(c => c.hits > 0).slice(0, 10)"
                                             :key="c.category" class="bar-row">
                                            <span class="bar-label">{{ c.category }}</span>
                                            <div class="bar-track"><div class="bar-fill" :style="{ width: (c.share * 100) + '%' }"></div></div>
                                            <small class="muted">{{ c.hits }}</small>
                                        </div>
                                    </div>
                                    <div v-else class="muted">Not computed.</div>
                                </div>

                                <!-- Social graph -->
                                <div class="dossier-card">
                                    <div class="dc-head"><span class="panel-code sm">SOC</span><h3>Top relationships</h3></div>
                                    <ol v-if="dossier.analytics?.social_graph" class="rel-list">
                                        <li v-for="r in (dossier.analytics.social_graph.payload.relationships || []).slice(0, 14)" :key="r.person_id">
                                            <button class="link-btn" @click="openPersonById(r.person_id)">{{ r.display_name || r.platform_username || '(unnamed)' }}</button>
                                            <small class="muted">{{ r.interaction_messages }} msgs</small>
                                        </li>
                                    </ol>
                                    <div v-else class="muted">Not computed.</div>
                                </div>

                                <!-- Conflict + humour + language -->
                                <div class="dossier-card">
                                    <div class="dc-head"><span class="panel-code sm">PSY</span><h3>Conflict · humour · language</h3></div>
                                    <div v-if="dossier.analytics?.conflict || dossier.analytics?.humor || dossier.analytics?.language">
                                        <div class="info-grid sm">
                                            <div v-if="dossier.analytics?.conflict"><span>Conflict</span><strong :class="(dossier.analytics.conflict.payload.conflict_score || 0) > 0.05 ? 'bad' : 'good'">{{ (dossier.analytics.conflict.payload.conflict_score || 0).toFixed(3) }}</strong></div>
                                            <div v-if="dossier.analytics?.humor"><span>Humour</span><strong class="violet-text">{{ (dossier.analytics.humor.payload.humor_score || 0).toFixed(3) }}</strong></div>
                                            <div v-if="dossier.analytics?.language"><span>Language</span><strong>{{ dossier.analytics.language.payload.primary_language || 'unknown' }}</strong></div>
                                        </div>
                                    </div>
                                    <div v-else class="muted">Not computed.</div>
                                </div>
                            </div>

                            <h4 class="block-h">Recent messages</h4>
                            <div class="msg-list">
                                <div v-for="m in personMessages" :key="m.message_id" class="msg">
                                    <div class="msg-meta">
                                        <span>{{ fmtTime(m.sent_at) }}</span>
                                        <small class="muted">{{ m.guild_name ? m.guild_name + ' / ' : '' }}{{ m.conversation_title || m.conversation_kind }}</small>
                                    </div>
                                    <div class="msg-body">{{ m.content }}</div>
                                </div>
                                <div v-if="!personMessages.length" class="muted" style="text-align:center;padding:14px">No messages on file.</div>
                            </div>
                        </template>
                    </div>
                </template>

                <!-- CNV: Conversations -->
                <template v-else-if="activeTab === 'cnv'">
                    <div class="panel-head">
                        <div><span class="panel-code">CNV</span><h2>Conversations</h2></div>
                        <span class="panel-state mid">{{ conversations.length }} indexed</span>
                    </div>
                    <div class="panel-body">
                        <div class="table-shell">
                            <table>
                                <thead>
                                    <tr><th>Platform</th><th>Kind</th><th>Guild</th><th>Title</th><th>Messages</th><th>Last seen</th></tr>
                                </thead>
                                <tbody>
                                    <tr v-for="c in conversations" :key="c.conversation_id" :class="{ active: selectedConversation?.conversation_id === c.conversation_id }" style="cursor:pointer" @click="openConversation(c)">
                                        <td><span class="origin-pill">{{ c.platform }}</span></td>
                                        <td>{{ c.kind }}</td>
                                        <td>{{ c.guild_name || '—' }}</td>
                                        <td class="clip">{{ c.title || '(untitled)' }}</td>
                                        <td>{{ fmtNum(c.message_count) }}</td>
                                        <td class="muted">{{ fmtTime(c.last_seen) }}</td>
                                    </tr>
                                    <tr v-if="!conversations.length"><td colspan="6" class="muted" style="text-align:center;padding:18px">No conversations indexed.</td></tr>
                                </tbody>
                            </table>
                        </div>

                        <template v-if="selectedConversation">
                            <h4 class="block-h">{{ selectedConversation.title || selectedConversation.guild_name || selectedConversation.kind }}</h4>
                            <div class="msg-list">
                                <div v-for="m in conversationMessages" :key="m.message_id" class="msg">
                                    <div class="msg-meta">
                                        <strong>{{ m.author_display_name || m.author_username || '?' }}</strong>
                                        <small class="muted">{{ fmtTime(m.sent_at) }}</small>
                                    </div>
                                    <div class="msg-body">{{ m.content }}</div>
                                </div>
                            </div>
                        </template>
                    </div>
                </template>

                <!-- LLM: Profiler -->
                <template v-else-if="activeTab === 'llm'">
                    <div class="panel-head">
                        <div><span class="panel-code">LLM</span><h2>Profiler &amp; Scheduler</h2></div>
                        <span class="panel-state" :class="profilerRunning ? 'mid' : 'good'">{{ profilerRunning ? 'RUNNING' : 'IDLE' }}</span>
                    </div>
                    <div class="panel-body">
                        <div class="info-grid">
                            <div><span>Currently running</span><strong>{{ profilerRunning ? 'YES' : 'NO' }}</strong></div>
                            <div><span>Last started</span><strong>{{ fmtTime(scheduleStatus?.last_run_started_at) }}</strong></div>
                            <div><span>Last finished</span><strong>{{ fmtTime(scheduleStatus?.last_run_finished_at) }}</strong></div>
                            <div><span>Last outcome</span><strong>{{ scheduleStatus?.last_run_status || '—' }}</strong></div>
                        </div>

                        <div class="cta-row">
                            <button class="os-btn violet" :disabled="profilerRunning" @click="runProfilerNow">{{ profilerRunning ? 'Profiler running…' : 'Run for all people now' }}</button>
                            <span class="muted">Runs analytics + LLM dossier generation. Auto-runs nightly at 03:30.</span>
                        </div>

                        <h4 class="block-h">Most recently profiled</h4>
                        <div class="people-strip">
                            <button v-for="p in topPeople" :key="'pp'+p.person_id" class="person-pill" @click="openPerson(p)">
                                <strong>{{ p.display_name || '(unnamed)' }}</strong>
                                <small>{{ fmtNum(p.message_count) }} msgs</small>
                            </button>
                        </div>
                    </div>
                </template>
            </section>

            <!-- ── Right detail rail ── -->
            <aside class="os-detail">
                <div class="panel-head sm">
                    <span class="panel-code">DTL</span>
                    <h3>{{ dossier ? dossier.display_name || 'Selected person' : 'No selection' }}</h3>
                </div>
                <div class="panel-body sm">
                    <template v-if="dossier">
                        <div class="info-grid sm">
                            <div><span>Messages</span><strong>{{ fmtNum(dossier.message_count || 0) }}</strong></div>
                            <div><span>Identities</span><strong>{{ dossier.identities?.length || 0 }}</strong></div>
                        </div>

                        <div class="detail-block">
                            <h4>Identities</h4>
                            <ul class="ident-list compact">
                                <li v-for="i in dossier.identities" :key="'di'+i.identity_id">
                                    <span class="origin-pill">{{ i.platform }}</span>
                                    <span class="mono">{{ i.platform_username || i.platform_user_id }}</span>
                                </li>
                            </ul>
                        </div>

                        <div v-if="dossier.personality_profile?.traits" class="detail-block">
                            <h4>Quick traits</h4>
                            <div class="trait-chip-grid">
                                <div v-if="dossier.personality_profile.traits.communication_style" class="trait-chip"><span>style</span><strong>{{ dossier.personality_profile.traits.communication_style }}</strong></div>
                                <div v-if="dossier.personality_profile.traits.tone" class="trait-chip"><span>tone</span><strong>{{ dossier.personality_profile.traits.tone }}</strong></div>
                                <div v-if="dossier.personality_profile.traits.humour" class="trait-chip"><span>humour</span><strong>{{ dossier.personality_profile.traits.humour }}</strong></div>
                                <div v-if="dossier.personality_profile.traits.conflict_tendency" class="trait-chip"><span>conflict</span><strong>{{ dossier.personality_profile.traits.conflict_tendency }}</strong></div>
                            </div>
                            <template v-if="dossier.personality_profile.traits.big_five_estimate">
                                <h4 style="margin-top:10px">Big-five estimate</h4>
                                <div v-for="(v, k) in dossier.personality_profile.traits.big_five_estimate" :key="'b5'+k" class="bar-row sm">
                                    <span class="bar-label">{{ k }}</span>
                                    <div class="bar-track"><div class="bar-fill" :style="{ width: ((v||0) * 100) + '%' }"></div></div>
                                    <small class="muted">{{ (v||0).toFixed(2) }}</small>
                                </div>
                            </template>
                        </div>

                        <div class="detail-block">
                            <h4>Recent activity</h4>
                            <div v-for="m in personMessages.slice(0, 6)" :key="'dm'+m.message_id" class="micro-msg">
                                <small class="muted">{{ fmtTime(m.sent_at) }}</small>
                                <div>{{ m.content }}</div>
                            </div>
                            <div v-if="!personMessages.length" class="muted">No activity.</div>
                        </div>

                        <div class="cta-row sm">
                            <button class="micro cyan" :disabled="recomputing" @click="recomputeSelected">{{ recomputing ? 'Recomputing…' : 'Recompute' }}</button>
                            <button class="micro" @click="activeTab = 'dsr'">Open dossier</button>
                        </div>
                    </template>
                    <template v-else>
                        <p class="muted">Click any person in the directory to load their intel here.</p>
                        <div class="detail-block">
                            <h4>Latest profiler run</h4>
                            <div class="rail-meta-row"><span>Status</span><strong :class="profilerRunning ? 'mid' : 'good'">{{ profilerRunning ? 'RUNNING' : 'IDLE' }}</strong></div>
                            <div class="rail-meta-row"><span>Started</span><strong>{{ fmtTime(scheduleStatus?.last_run_started_at) }}</strong></div>
                            <div class="rail-meta-row"><span>Finished</span><strong>{{ fmtTime(scheduleStatus?.last_run_finished_at) }}</strong></div>
                            <div class="rail-meta-row"><span>Outcome</span><strong>{{ scheduleStatus?.last_run_status || '—' }}</strong></div>
                        </div>
                        <div class="detail-block">
                            <h4>Sources health</h4>
                            <div class="rail-meta-row"><span>Linked</span><strong>{{ sources.length }}</strong></div>
                            <div class="rail-meta-row"><span>Errors</span><strong :class="sourceErrorCount ? 'bad' : 'good'">{{ sourceErrorCount }}</strong></div>
                        </div>
                    </template>
                </div>
            </aside>

        </section>
    </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

definePageMeta({ layout: 'navbar' });

const tabs = [
    { id: 'int', code: 'INT', label: 'Overview' },
    { id: 'src', code: 'SRC', label: 'Sources' },
    { id: 'peo', code: 'PEO', label: 'People' },
    { id: 'dsr', code: 'DSR', label: 'Dossier' },
    { id: 'cnv', code: 'CNV', label: 'Conversations' },
    { id: 'llm', code: 'LLM', label: 'Profiler' },
];
const activeTab = ref('int');

const overview = ref(null);
const scheduleStatus = ref(null);
const sources = ref([]);
const people = ref([]);
const peopleSearch = ref('');
const peoplePlatform = ref('');
const selectedPersonId = ref(null);
const dossier = ref(null);
const personMessages = ref([]);
const conversations = ref([]);
const selectedConversation = ref(null);
const conversationMessages = ref([]);

const newSource = reactive({ token: '', label: '' });
const adding = ref(false);
const recomputing = ref(false);
const isBusy = ref(false);
const busyLabel = ref('');
const lastUpdatedAt = ref(null);

let searchDebounce = null;

const profilerRunning = computed(() => !!scheduleStatus.value?.running);
const sourceErrorCount = computed(() => sources.value.filter(s => s.status === 'error').length);
const topPeople = computed(() => [...people.value].sort((a, b) => (b.message_count || 0) - (a.message_count || 0)).slice(0, 6));
const lastUpdatedLabel = computed(() => lastUpdatedAt.value ? 'Updated ' + new Date(lastUpdatedAt.value).toLocaleTimeString() : 'Awaiting refresh');

// ─── API helpers ───
async function fetchJSON(url) {
    const r = await RequestGETFromKliveAPI(url, false, true);
    if (!r.ok) return null;
    try { return await r.json(); } catch { return null; }
}
async function postJSON(url, body) {
    const r = await RequestPOSTFromKliveAPI(url, body ? JSON.stringify(body) : '', false, true);
    if (!r.ok) {
        let msg = 'Request failed';
        try { msg = await r.text(); } catch {}
        return { ok: false, error: msg, status: r.status };
    }
    try { return await r.json(); } catch { return { ok: true }; }
}

async function withBusy(label, fn) {
    isBusy.value = true; busyLabel.value = label;
    try { return await fn(); } finally { isBusy.value = false; busyLabel.value = ''; lastUpdatedAt.value = Date.now(); }
}

async function refreshAll() {
    await withBusy('Refreshing intel', async () => {
        const [ov, sched, srcs] = await Promise.all([
            fetchJSON('/omniscience/stats/overview'),
            fetchJSON('/omniscience/schedule/status'),
            fetchJSON('/omniscience/sources'),
        ]);
        overview.value = ov;
        scheduleStatus.value = sched;
        sources.value = srcs || [];
        await Promise.all([loadPeople(), loadConversations()]);
    });
}

async function loadPeople() {
    const params = new URLSearchParams();
    if (peopleSearch.value) params.set('search', peopleSearch.value);
    if (peoplePlatform.value) params.set('platform', peoplePlatform.value);
    params.set('limit', '200');
    people.value = (await fetchJSON('/omniscience/persons?' + params.toString())) || [];
}
function onSearchChange() {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(loadPeople, 250);
}
async function loadConversations() {
    conversations.value = (await fetchJSON('/omniscience/conversations?limit=200')) || [];
}

async function openPerson(p) {
    selectedPersonId.value = p.person_id;
    activeTab.value = 'dsr';
    dossier.value = await fetchJSON('/omniscience/persons/get?personId=' + encodeURIComponent(p.person_id));
    personMessages.value = (await fetchJSON('/omniscience/persons/messages?personId=' + encodeURIComponent(p.person_id) + '&limit=50')) || [];
}
async function openPersonById(personId) {
    if (!personId) return;
    await openPerson({ person_id: personId });
}
async function recomputeSelected() {
    if (!selectedPersonId.value) return;
    recomputing.value = true;
    try {
        await postJSON('/omniscience/persons/recompute?personId=' + encodeURIComponent(selectedPersonId.value));
        await openPerson({ person_id: selectedPersonId.value });
    } finally { recomputing.value = false; }
}

async function openConversation(c) {
    selectedConversation.value = c;
    activeTab.value = 'cnv';
    conversationMessages.value = (await fetchJSON('/omniscience/conversations/messages?conversationId=' + encodeURIComponent(c.conversation_id) + '&limit=200')) || [];
}

async function addSource() {
    if (!newSource.token.trim()) return;
    adding.value = true;
    try {
        const res = await postJSON('/omniscience/sources/add', { platform: 'discord', token: newSource.token, label: newSource.label });
        if (res?.ok === false) alert('Failed: ' + (res.error || 'unknown'));
        else { newSource.token = ''; newSource.label = ''; }
        await refreshAll();
    } finally { adding.value = false; }
}
async function removeSource(s) {
    if (!confirm('Remove source for ' + (s.self_username || s.label || s.source_id) + '? Stored messages remain.')) return;
    await postJSON('/omniscience/sources/remove?sourceId=' + encodeURIComponent(s.source_id));
    await refreshAll();
}
async function backfill(s) {
    await withBusy('Backfilling ' + (s.self_username || s.platform), async () => {
        await postJSON('/omniscience/sources/backfill?sourceId=' + encodeURIComponent(s.source_id));
    });
}
async function runProfilerNow() {
    await postJSON('/omniscience/schedule/run-now');
    setTimeout(refreshAll, 1500);
}

// ─── Format helpers ───
function fmtNum(n) {
    if (n == null) return '0';
    if (n < 1000) return String(n);
    if (n < 1e6) return (n / 1000).toFixed(1) + 'k';
    return (n / 1e6).toFixed(2) + 'M';
}
function fmtTime(ms) {
    if (!ms) return '—';
    try { return new Date(typeof ms === 'number' ? ms : Date.parse(ms)).toLocaleString(); } catch { return String(ms); }
}
function barHeight(v, arr) {
    const max = Math.max(1, ...(arr || [1]));
    return Math.max(2, (v / max) * 60) + 'px';
}
function tokenSize(t, arr) {
    if (!arr?.length) return '12px';
    const max = arr[0]?.count || 1;
    const min = arr[arr.length - 1]?.count || 1;
    const ratio = max === min ? 0.5 : (t.count - min) / (max - min);
    return (11 + ratio * 9) + 'px';
}
function sentimentClass(v) {
    if (v == null) return 'mid';
    if (v > 0.05) return 'good';
    if (v < -0.05) return 'bad';
    return 'mid';
}

function renderMarkdown(md) {
    if (!md) return '';
    let s = md
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/^### (.*)$/gm, '<h4>$1</h4>')
        .replace(/^## (.*)$/gm, '<h3>$1</h3>')
        .replace(/^# (.*)$/gm, '<h2>$1</h2>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/^(?:[-*] .+(?:\n|$))+/gm, block => {
        const items = block.trim().split(/\n/).map(l => '<li>' + l.replace(/^[-*]\s+/, '') + '</li>').join('');
        return '<ul>' + items + '</ul>';
    });
    return s.split(/\n{2,}/).map(p => p.startsWith('<') ? p : '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
}

onMounted(refreshAll);
</script>

<style scoped>
/* ═════ Shell ═════ */
.os-shell {
    min-height: calc(100vh - 70px);
    padding: 18px;
    color: #d6ecff;
    background:
        linear-gradient(rgba(8, 12, 22, 0.94), rgba(6, 8, 16, 0.97)),
        repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 28px),
        repeating-linear-gradient(90deg, rgba(120, 200, 255, 0.04) 0 1px, transparent 1px 32px);
    border: 1px solid rgba(120, 200, 255, 0.12);
    font-family: 'Inter', system-ui, sans-serif;
}

/* ═════ Header ═════ */
.os-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; margin-bottom: 14px; }
.os-kicker { font: 700 11px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: 1.2px; color: #5fd3ff; }
.live-dot { display: inline-block; width: 8px; height: 8px; margin-right: 8px; border-radius: 50%; background: #5fd3ff; box-shadow: 0 0 14px #5fd3ff; animation: pulse 1.4s infinite; }
.os-header h1 { margin: 4px 0 2px; font-size: 42px; line-height: 1; color: #eaf6ff; text-shadow: 0 0 22px rgba(95, 211, 255, 0.28); }
.os-header p { margin: 0; color: #94a8c0; font-size: 14px; }
.os-header-actions { display: flex; gap: 8px; align-items: center; }
.refresh-stamp { min-width: 160px; text-align: right; color: #7e9ab5; font: 700 11px ui-monospace, Consolas, monospace; text-transform: uppercase; }

/* ═════ Buttons ═════ */
.os-btn, .micro {
    border: 1px solid rgba(120, 200, 255, .28); border-radius: 4px;
    background: linear-gradient(180deg, rgba(36, 70, 120, .42), rgba(10, 16, 26, .92));
    color: #eaf6ff; cursor: pointer; font-weight: 700;
}
.os-btn { padding: 8px 12px; font-size: 13px; }
.os-btn.ghost { background: rgba(255,255,255,.04); }
.os-btn.violet, .micro.violet { border-color: rgba(199,156,255,.45); color: #e3d2ff; background: linear-gradient(180deg, rgba(80,46,150,.5), rgba(14,10,30,.92)); }
.os-btn.cyan, .micro.cyan { border-color: rgba(95,211,255,.45); color: #bcecff; }
.os-btn.danger, .micro.danger { border-color: rgba(255,90,120,.5); color: #ffb9c8; }
.os-btn:disabled, .micro:disabled { opacity: .5; cursor: wait; }
.micro { padding: 4px 8px; font-size: 11px; margin-right: 4px; }

/* ═════ Metric tiles ═════ */
.os-metrics { display: grid; grid-template-columns: repeat(5, minmax(150px, 1fr)); gap: 10px; margin-bottom: 12px; }
.metric-tile {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px;
    text-align: left; padding: 12px 14px; min-height: 82px;
    border: 1px solid rgba(120, 200, 255, .22); border-radius: 6px;
    background: linear-gradient(180deg, rgba(15, 26, 50, .92), rgba(8, 12, 22, .96));
    color: inherit; cursor: pointer;
    transition: transform .12s ease, border-color .12s ease;
}
.metric-tile:hover { transform: translateY(-1px); border-color: rgba(120, 200, 255, .55); }
.metric-copy { min-width: 0; }
.metric-tile strong { display: block; min-width: 54px; margin: 0; font-size: 30px; line-height: 1; color: #eaf6ff; text-align: right; }
.metric-label, .metric-tile small { display: block; color: #8aa6c2; font-size: 11px; line-height: 1.45; text-transform: uppercase; letter-spacing: .8px; }
.metric-tile.cyan strong { color: #5fd3ff; }
.metric-tile.violet strong { color: #c79cff; }
.metric-tile.warn strong { color: #ffc247; }
.metric-tile.danger strong { color: #ff5a78; }

/* ═════ Grid ═════ */
.os-grid { display: grid; grid-template-columns: 240px minmax(0, 1fr) 290px; gap: 12px; }
.os-rail, .os-panel, .os-detail {
    border: 1px solid rgba(120, 200, 255, .16); border-radius: 6px;
    background: rgba(8, 12, 22, .86); box-shadow: inset 0 0 22px rgba(95, 211, 255, .04);
}
.os-rail, .os-detail { padding: 10px; }

/* ═════ Tabs ═════ */
.os-tabs { display: grid; gap: 6px; margin-bottom: 12px; }
.os-tab {
    display: flex; align-items: center; gap: 8px; padding: 9px 10px;
    border: 1px solid rgba(255,255,255,.08); border-radius: 4px;
    background: rgba(255,255,255,.03); color: #b8d2e8; text-align: left; cursor: pointer;
    font-size: 13px;
}
.os-tab span { width: 42px; color: #5fd3ff; font: 700 11px ui-monospace, Consolas, monospace; letter-spacing: .4px; }
.os-tab:hover { border-color: rgba(120, 200, 255, .35); }
.os-tab.active { border-color: #5fd3ff; color: #fff; background: linear-gradient(90deg, rgba(36, 100, 165, .35), rgba(30, 50, 90, .15)); box-shadow: inset 0 0 16px rgba(95,211,255,.08); }

/* ═════ Rail sections ═════ */
.rail-section { border-top: 1px solid rgba(255,255,255,.08); padding-top: 10px; margin-top: 10px; }
.rail-section h3 { margin: 0 0 8px; font-size: 11px; color: #88c4ff; text-transform: uppercase; letter-spacing: .9px; }
.rail-row {
    display: grid; grid-template-columns: 18px 1fr; align-items: center; gap: 8px;
    width: 100%; padding: 6px 0; border: 0; background: transparent; color: #cfe3f5;
    cursor: pointer; text-align: left; border-bottom: 1px solid rgba(255,255,255,.04);
}
.rail-row:hover { background: rgba(95,211,255,.05); }
.rail-row strong { display: block; font-size: 12px; color: #eaf6ff; font-weight: 700; }
.rail-row small { display: block; font-size: 10px; color: #7e9ab5; }
.rail-rank { min-width: 32px; padding: 1px 5px; font: 700 10px ui-monospace, Consolas, monospace; color: #c79cff; background: rgba(199,156,255,.12); border-radius: 3px; text-align: center; }
.rail-dot { width: 8px; height: 8px; border-radius: 50%; background: #5fd3ff; box-shadow: 0 0 8px currentColor; color: #5fd3ff; }
.rail-dot.s-error { background: #ff5a78; color: #ff5a78; }
.rail-dot.s-idle { background: #7e9ab5; color: #7e9ab5; box-shadow: none; }
.rail-meta-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; color: #b8d2e8; border-bottom: 1px solid rgba(255,255,255,.04); }
.rail-meta-row strong { font: 700 12px ui-monospace, Consolas, monospace; }
.empty-rail { color: #6b819b; font-size: 11px; padding: 4px 0; }

/* ═════ Panel head/body ═════ */
.os-panel { min-width: 0; overflow: hidden; }
.panel-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid rgba(120, 200, 255, .14); background: linear-gradient(90deg, rgba(20, 50, 90, .55), rgba(10, 14, 22, .45)); }
.panel-head h2 { margin: 0; font-size: 20px; color: #eaf6ff; }
.panel-head h3 { margin: 0; font-size: 14px; color: #eaf6ff; }
.panel-head.sm { padding: 10px 12px; }
.panel-code { font: 700 11px ui-monospace, Consolas, monospace; color: #5fd3ff; letter-spacing: 1px; margin-right: 6px; }
.panel-code.sm { font-size: 10px; color: #88c4ff; }
.panel-state { padding: 4px 8px; border-radius: 4px; font: 700 11px ui-monospace, Consolas, monospace; }
.panel-state.good { color: #6bff9f; background: rgba(31,154,80,.18); }
.panel-state.bad { color: #ff8993; background: rgba(192,40,63,.2); }
.panel-state.mid { color: #5fd3ff; background: rgba(36, 100, 165, .25); }
.panel-body { padding: 14px; }
.panel-body.sm { padding: 10px 12px; }
.head-actions { display: flex; gap: 6px; }

/* ═════ KPI strip ═════ */
.kpi-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin-bottom: 16px; }
.kpi { padding: 10px 12px; border: 1px solid rgba(255,255,255,.07); border-radius: 5px; background: rgba(255,255,255,.03); }
.kpi span { display: block; color: #7e9ab5; font-size: 10px; text-transform: uppercase; letter-spacing: .6px; }
.kpi strong { display: block; margin-top: 4px; color: #eaf6ff; font-size: 22px; line-height: 1; }

.block-h { margin: 18px 0 8px; font-size: 11px; color: #88c4ff; text-transform: uppercase; letter-spacing: 1px; }

/* ═════ Info grid ═════ */
.info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; }
.info-grid.sm { grid-template-columns: 1fr 1fr; }
.info-grid > div { padding: 8px 10px; border: 1px solid rgba(255,255,255,.06); border-radius: 4px; background: rgba(255,255,255,.025); }
.info-grid span { display: block; color: #7e9ab5; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; }
.info-grid strong { display: block; margin-top: 3px; color: #eaf6ff; font-size: 14px; word-break: break-word; }
.info-grid .mono { font: 700 11px ui-monospace, Consolas, monospace; }

.cta-row { display: flex; gap: 10px; align-items: center; margin: 14px 0 6px; }
.cta-row.sm { margin: 10px 0 0; }

/* ═════ People grid + chips ═════ */
.people-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
.person-card {
    padding: 10px 12px; border: 1px solid rgba(255,255,255,.07); border-radius: 5px;
    background: rgba(255,255,255,.025); color: inherit; text-align: left; cursor: pointer;
    transition: border-color .12s ease;
}
.person-card:hover, .person-card.active { border-color: #5fd3ff; background: rgba(95,211,255,.07); }
.pc-name { font-weight: 700; color: #eaf6ff; }
.pc-handles { color: #7e9ab5; font-size: 11px; margin: 4px 0; word-break: break-word; }
.pc-foot { display: flex; justify-content: space-between; color: #5fd3ff; font: 700 11px ui-monospace, Consolas, monospace; }
.pc-foot small { color: #6b819b; font-weight: 400; }

.people-strip, .conv-strip { display: flex; flex-wrap: wrap; gap: 6px; }
.person-pill, .conv-chip {
    display: inline-flex; flex-direction: column; gap: 2px;
    padding: 6px 10px; border: 1px solid rgba(120,200,255,.22); border-radius: 4px;
    background: rgba(15, 26, 50, .65); color: inherit; cursor: pointer; text-align: left;
}
.person-pill:hover, .conv-chip:hover { border-color: #5fd3ff; }
.person-pill strong, .conv-chip strong { font-size: 12px; color: #eaf6ff; }
.person-pill small, .conv-chip small { font: 700 10px ui-monospace, Consolas, monospace; color: #7e9ab5; }

/* ═════ Sources panel ═════ */
.add-source { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px; }
.warn-line { color: #ffb866; font-size: 11px; margin: 0 0 14px; padding: 6px 10px; border: 1px solid rgba(255,184,102,.25); border-radius: 4px; background: rgba(80, 50, 10, .25); }

/* ═════ Form controls ═════ */
input, select, textarea {
    min-width: 0; border: 1px solid rgba(120,200,255,.16); border-radius: 4px;
    background: #07101e; color: #eaf6ff; padding: 8px 10px; outline: none; font-family: inherit; font-size: 13px;
}
input:focus, select:focus, textarea:focus { border-color: #5fd3ff; box-shadow: 0 0 0 1px rgba(95,211,255,.18); }
.control-row { display: grid; gap: 8px; margin-bottom: 12px; }
.people-controls { grid-template-columns: minmax(220px, 1fr) 180px 100px; }

/* ═════ Tables ═════ */
.table-shell { position: relative; max-height: 600px; overflow: auto; border: 1px solid rgba(255,255,255,.08); border-radius: 5px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { padding: 7px 9px; border-bottom: 1px solid rgba(255,255,255,.05); text-align: left; vertical-align: top; }
th { position: sticky; top: 0; z-index: 1; background: #0a1322; color: #88c4ff; font: 700 11px ui-monospace, Consolas, monospace; text-transform: uppercase; }
tr:hover td { background: rgba(95,211,255,.04); }
tr.active td { background: rgba(95,211,255,.10); }
.row-bad td { background: rgba(149, 31, 50, .12); }
.clip { max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.origin-pill { display: inline-block; padding: 2px 7px; border-radius: 4px; background: rgba(95,211,255,.12); color: #bcecff; font: 700 10px ui-monospace, Consolas, monospace; text-transform: uppercase; letter-spacing: .4px; }
.status.good { color: #6bff9f; } .status.bad { color: #ff5a78; } .status.mid { color: #5fd3ff; }
.muted { color: #7e9ab5; font-size: 11px; }
.mono { font-family: ui-monospace, Consolas, monospace; font-size: 11px; }
.good { color: #6bff9f; } .bad { color: #ff5a78; } .mid { color: #5fd3ff; }
.violet-text { color: #c79cff; }
.link-btn { padding: 0; border: 0; background: transparent; color: #5fd3ff; cursor: pointer; text-decoration: underline; font: inherit; }

/* ═════ Dossier ═════ */
.dossier-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; margin-top: 14px; }
.dossier-card { padding: 12px; border: 1px solid rgba(255,255,255,.07); border-radius: 5px; background: rgba(255,255,255,.025); }
.dossier-card.wide { grid-column: span 2; }
.dc-head { display: flex; align-items: baseline; gap: 6px; margin-bottom: 10px; }
.dc-head h3 { margin: 0; font-size: 13px; color: #eaf6ff; flex: 1; }
.dc-head small { font-size: 10px; }
.narrative { font-size: 13px; line-height: 1.55; color: #d6ecff; }
.narrative :deep(h2), .narrative :deep(h3), .narrative :deep(h4) { color: #eaf6ff; margin: 12px 0 6px; }
.narrative :deep(p) { margin: 8px 0; }
.narrative :deep(ul) { margin: 6px 0 6px 20px; }
.narrative :deep(code) { background: #07101e; padding: 1px 4px; border-radius: 3px; font-size: 11px; }
.details summary { cursor: pointer; color: #88c4ff; margin-top: 10px; font-size: 11px; font-weight: 700; }
.details pre { background: #07101e; padding: 10px; border-radius: 5px; font-size: 11px; overflow: auto; max-height: 240px; color: #cfe3f5; }

.bars { display: flex; align-items: flex-end; gap: 2px; height: 64px; margin-top: 10px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,.06); }
.bar { flex: 1; background: linear-gradient(180deg, #5fd3ff, #2c7ec0); opacity: 0.85; border-radius: 1px 1px 0 0; }
.bar:hover { opacity: 1; box-shadow: 0 0 8px rgba(95,211,255,.6); }
.bar-axis { display: flex; justify-content: space-between; padding-top: 4px; color: #6b819b; font: 700 9px ui-monospace, Consolas, monospace; }

.tag-cloud { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.tag { background: rgba(95,211,255,.10); color: #cfe3f5; border-radius: 3px; padding: 2px 7px; font: 700 11px ui-monospace, Consolas, monospace; }

.emoji-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.emoji-chip { display: inline-flex; align-items: center; gap: 4px; background: rgba(255,255,255,.04); padding: 3px 7px; border-radius: 4px; }
.emoji-chip .ev { font-size: 16px; }
.emoji-chip small { color: #7e9ab5; font: 700 10px ui-monospace, Consolas, monospace; }

.bar-row { display: grid; grid-template-columns: 110px 1fr 32px; gap: 8px; align-items: center; margin: 5px 0; font-size: 11px; }
.bar-row.sm { grid-template-columns: 80px 1fr 32px; }
.bar-label { color: #b8d2e8; text-transform: capitalize; }
.bar-track { height: 6px; background: rgba(255,255,255,.06); border-radius: 3px; overflow: hidden; }
.bar-fill { height: 100%; background: linear-gradient(90deg, #5fd3ff, #c79cff); }

.rel-list { padding-left: 18px; margin: 0; color: #d6ecff; }
.rel-list li { margin: 4px 0; font-size: 12px; }

.ident-list { list-style: none; padding: 0; margin: 0; }
.ident-list li { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 12px; border-bottom: 1px solid rgba(255,255,255,.04); }
.ident-list.compact li { padding: 3px 0; }

/* ═════ Messages ═════ */
.msg-list { display: flex; flex-direction: column; gap: 6px; max-height: 460px; overflow-y: auto; padding-right: 4px; }
.msg { background: rgba(255,255,255,.025); border: 1px solid rgba(255,255,255,.06); border-left: 2px solid #5fd3ff; border-radius: 0 4px 4px 0; padding: 7px 10px; }
.msg-meta { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 3px; font: 700 11px ui-monospace, Consolas, monospace; color: #88c4ff; }
.msg-body { font-size: 13px; color: #d6ecff; white-space: pre-wrap; word-break: break-word; }

/* ═════ Detail rail ═════ */
.os-detail { padding: 0; }
.detail-block { padding: 10px 12px; border-top: 1px solid rgba(255,255,255,.06); }
.detail-block h4 { margin: 0 0 8px; font-size: 11px; color: #88c4ff; text-transform: uppercase; letter-spacing: .9px; font-weight: 700; }
.trait-chip-grid { display: grid; gap: 5px; }
.trait-chip { display: grid; grid-template-columns: 60px 1fr; gap: 6px; padding: 5px 8px; border: 1px solid rgba(255,255,255,.06); border-radius: 3px; background: rgba(255,255,255,.025); }
.trait-chip span { color: #7e9ab5; font: 700 10px ui-monospace, Consolas, monospace; text-transform: uppercase; }
.trait-chip strong { color: #eaf6ff; font-size: 12px; font-weight: 600; }
.micro-msg { padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,.04); font-size: 11px; }
.micro-msg div { color: #d6ecff; max-height: 36px; overflow: hidden; text-overflow: ellipsis; }

/* ═════ Animations ═════ */
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 1280px) {
    .os-grid { grid-template-columns: 220px minmax(0, 1fr); }
    .os-detail { display: none; }
}
@media (max-width: 900px) {
    .os-grid { grid-template-columns: 1fr; }
    .os-rail { display: none; }
    .os-metrics { grid-template-columns: repeat(2, 1fr); }
}
</style>
