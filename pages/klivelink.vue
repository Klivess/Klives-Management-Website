<template>
    <div class="kl-shell">
        <!-- ═══ LEFT SIDEBAR ═══ -->
        <aside class="kl-sidebar" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
            <!-- Sidebar Header -->
            <div class="sb-header">
                <div class="sb-title-row">
                    <h2 class="sb-title">KliveLink</h2>
                    <button class="sb-collapse-btn" @click="sidebarCollapsed = !sidebarCollapsed" title="Toggle sidebar">
                        {{ sidebarCollapsed ? '»' : '«' }}
                    </button>
                </div>
                <div class="sb-count" v-if="!sidebarCollapsed">
                    <span class="sb-count-num">{{ agents.length }}</span> agent{{ agents.length !== 1 ? 's' : '' }}
                    <button class="sb-refresh-btn" @click="loadAgents" title="Refresh agent list">↻</button>
                </div>
            </div>

            <!-- Search -->
            <div class="sb-search" v-if="!sidebarCollapsed">
                <input
                    v-model="agentSearch"
                    type="text"
                    class="kl-input sb-search-input"
                    placeholder="Search agents..."
                />
            </div>

            <!-- Agent List -->
            <div class="sb-agent-list" v-if="!sidebarCollapsed">
                <div v-if="loading" class="sb-loading">
                    <div class="kl-spinner-sm"></div>
                    Loading...
                </div>
                <div v-else-if="filteredAgents.length === 0" class="sb-empty">
                    {{ agents.length === 0 ? 'No agents connected' : 'No matches' }}
                </div>
                <div
                    v-for="agent in filteredAgents"
                    :key="agent.AgentId"
                    class="sb-agent"
                    :class="{ 'sb-agent-active': selectedAgentId === agent.AgentId }"
                    @click="selectAgent(agent.AgentId)"
                >
                    <span class="sb-dot"></span>
                    <div class="sb-agent-info">
                        <div class="sb-agent-name">{{ agent.MachineName || agent.AgentId }}</div>
                        <div class="sb-agent-id">{{ agent.AgentId }}</div>
                    </div>
                    <div class="sb-agent-time">{{ humanizeTime(agent.ConnectedAt) }}</div>
                </div>
            </div>

            <!-- Collapsed: mini list -->
            <div class="sb-mini-list" v-if="sidebarCollapsed">
                <div
                    v-for="agent in filteredAgents"
                    :key="agent.AgentId"
                    class="sb-mini-agent"
                    :class="{ 'sb-mini-active': selectedAgentId === agent.AgentId }"
                    @click="selectAgent(agent.AgentId)"
                    :title="agent.MachineName || agent.AgentId"
                >
                    <span class="sb-dot"></span>
                </div>
            </div>
        </aside>

        <!-- ═══ MAIN CONTENT ═══ -->
        <main class="kl-main">
            <!-- No selection state -->
            <div v-if="!selectedAgentId" class="kl-welcome">
                <div class="kl-welcome-icon">⚡</div>
                <h1 class="kl-welcome-title">KliveLink</h1>
                <p class="kl-welcome-sub">Select an agent from the sidebar to begin</p>
                <div class="kl-welcome-stat">
                    <span class="kl-welcome-count">{{ agents.length }}</span> agents online
                </div>
            </div>

            <!-- Agent Detail View -->
            <div v-else class="kl-detail">
                <!-- Agent Header Bar -->
                <div class="kl-agent-bar">
                    <div class="kl-agent-bar-left">
                        <span class="sb-dot dot-lg"></span>
                        <div>
                            <h2 class="kl-agent-bar-name">{{ selectedAgent?.MachineName || selectedAgentId }}</h2>
                            <span class="kl-agent-bar-id mono">{{ selectedAgentId }}</span>
                        </div>
                    </div>
                    <div class="kl-agent-bar-actions">
                        <button class="kl-action-btn kl-btn-primary" @click="refreshCurrentTab">Refresh</button>
                        <button class="kl-action-btn kl-btn-danger" @click="disconnectAgent">Disconnect</button>
                        <button class="kl-action-btn kl-btn-destruct" @click="selfDestructAgent">Self-Destruct</button>
                    </div>
                </div>

                <!-- Tab Bar -->
                <div class="kl-tabs">
                    <button
                        v-for="tab in tabs"
                        :key="tab.id"
                        class="kl-tab"
                        :class="{ 'kl-tab-active': activeTab === tab.id }"
                        @click="switchTab(tab.id)"
                    >
                        <span class="kl-tab-icon">{{ tab.icon }}</span>
                        <span class="kl-tab-label">{{ tab.label }}</span>
                    </button>
                </div>

                <!-- ──── TAB: Overview ──── -->
                <div v-show="activeTab === 'overview'" class="kl-tab-content">
                    <div class="tab-grid tab-grid-2">
                        <div class="kl-panel">
                            <div class="kl-panel-title">Agent Status</div>
                            <div v-if="statusLoading" class="section-loading">Loading status...</div>
                            <div v-else-if="agentStatus" class="detail-list">
                                <div class="detail-row"><span class="dl">Agent ID</span><span class="dv mono">{{ agentStatus.AgentId }}</span></div>
                                <div class="detail-row"><span class="dl">Machine</span><span class="dv">{{ agentStatus.MachineName }}</span></div>
                                <div class="detail-row"><span class="dl">Connected Since</span><span class="dv">{{ formatDate(agentStatus.ConnectedSince) }}</span></div>
                                <div class="detail-row"><span class="dl">Screen Capture</span><span class="dv" :class="agentStatus.IsScreenCaptureActive ? 'clr-success' : 'clr-muted'">{{ agentStatus.IsScreenCaptureActive ? 'Active' : 'Inactive' }}</span></div>
                            </div>
                            <div v-else class="no-data">Could not load status</div>
                        </div>
                        <div class="kl-panel">
                            <div class="kl-panel-title">System Information</div>
                            <div v-if="sysInfoLoading" class="section-loading">Loading system info...</div>
                            <div v-else-if="systemInfo" class="detail-list">
                                <div class="detail-row"><span class="dl">Machine</span><span class="dv">{{ systemInfo.MachineName }}</span></div>
                                <div class="detail-row"><span class="dl">OS</span><span class="dv">{{ systemInfo.OSVersion }}</span></div>
                                <div class="detail-row"><span class="dl">User</span><span class="dv">{{ systemInfo.UserName }}</span></div>
                                <div class="detail-row"><span class="dl">Processors</span><span class="dv">{{ systemInfo.ProcessorCount }} cores</span></div>
                                <div class="detail-row"><span class="dl">Total RAM</span><span class="dv">{{ (systemInfo.TotalMemoryMB / 1024).toFixed(1) }} GB</span></div>
                                <div class="detail-row"><span class="dl">Agent Started</span><span class="dv">{{ formatDate(systemInfo.AgentStartTime) }}</span></div>
                                <div class="detail-row"><span class="dl">Agent Version</span><span class="dv mono">{{ systemInfo.AgentVersion }}</span></div>
                            </div>
                            <div v-else class="no-data">Could not load system info</div>
                        </div>
                    </div>
                </div>

                <!-- ──── TAB: Processes ──── -->
                <div v-show="activeTab === 'processes'" class="kl-tab-content">
                    <div class="kl-panel">
                        <div class="processes-toolbar">
                            <input v-model="processFilter" type="text" class="kl-input" placeholder="Filter processes..." />
                            <button class="kl-action-btn kl-btn-primary" @click="loadProcesses">Refresh</button>
                            <span class="proc-count" v-if="processes.length">{{ filteredProcesses.length }}/{{ processes.length }}</span>
                        </div>
                        <div v-if="processesLoading" class="section-loading">Loading processes...</div>
                        <div v-else class="processes-scroll">
                            <div class="process-header-row">
                                <span class="ph-pid">PID</span>
                                <span class="ph-name">Name</span>
                                <span class="ph-mem">Memory</span>
                                <span class="ph-act">Action</span>
                            </div>
                            <div v-for="proc in filteredProcesses" :key="proc.ProcessId" class="process-row">
                                <span class="p-pid mono">{{ proc.ProcessId }}</span>
                                <span class="p-name">{{ proc.ProcessName }}</span>
                                <span class="p-mem">{{ proc.MemoryMB.toFixed(1) }} MB</span>
                                <button class="kl-kill-btn" @click="killProcess(proc.ProcessId, proc.ProcessName)">Kill</button>
                            </div>
                            <div v-if="filteredProcesses.length === 0 && !processesLoading" class="no-data">
                                {{ processes.length === 0 ? 'No processes loaded' : 'No matches' }}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ──── TAB: Terminal ──── -->
                <div v-show="activeTab === 'terminal'" class="kl-tab-content">
                    <div class="tab-grid tab-grid-2">
                        <div class="kl-panel kl-panel-tall">
                            <div class="kl-panel-title">Remote Terminal</div>
                            <div class="terminal-area">
                                <div class="terminal-output" ref="terminalOutput">
                                    <div v-for="(entry, i) in terminalHistory" :key="i" class="term-entry">
                                        <div class="term-cmd">&gt; {{ entry.command }}</div>
                                        <pre v-if="entry.output" class="term-out">{{ entry.output }}</pre>
                                        <pre v-if="entry.error" class="term-err">{{ entry.error }}</pre>
                                        <div v-if="entry.loading" class="term-loading">Executing...</div>
                                    </div>
                                    <div v-if="terminalHistory.length === 0" class="no-data" style="padding: 10px;">Type a command below</div>
                                </div>
                                <div class="terminal-input-row">
                                    <input
                                        v-model="terminalCommand"
                                        type="text"
                                        class="kl-input kl-input-terminal"
                                        placeholder="Enter command..."
                                        @keydown.enter="runTerminalCommand"
                                    />
                                    <button class="kl-action-btn kl-btn-primary" @click="runTerminalCommand" :disabled="terminalRunning">Run</button>
                                </div>
                            </div>
                        </div>
                        <div class="kl-panel kl-panel-tall">
                            <div class="kl-panel-title">Run Process</div>
                            <div class="run-process-form">
                                <label class="kl-label">Executable</label>
                                <input v-model="runProcessFileName" type="text" class="kl-input" placeholder="e.g. notepad.exe" />
                                <label class="kl-label">Arguments</label>
                                <input v-model="runProcessArgs" type="text" class="kl-input" placeholder="e.g. C:\file.txt" />
                                <div class="rp-options">
                                    <label class="kl-checkbox-label">
                                        <input type="checkbox" v-model="runProcessWait" /> Wait for exit
                                    </label>
                                    <label class="kl-label-inline">Timeout (s)</label>
                                    <input v-model.number="runProcessTimeout" type="number" class="kl-input kl-input-sm" min="1" max="300" />
                                </div>
                                <button class="kl-action-btn kl-btn-primary" style="width: 100%; margin-top: 10px;" @click="runProcess" :disabled="runProcessLoading">
                                    {{ runProcessLoading ? 'Running...' : 'Execute' }}
                                </button>
                                <div v-if="runProcessResult" class="rp-result">
                                    <div class="detail-row"><span class="dl">Exit Code</span><span class="dv" :class="runProcessResult.ExitCode === 0 ? 'clr-success' : 'clr-danger'">{{ runProcessResult.ExitCode }}</span></div>
                                    <div class="detail-row" v-if="runProcessResult.ProcessId"><span class="dl">PID</span><span class="dv mono">{{ runProcessResult.ProcessId }}</span></div>
                                    <pre v-if="runProcessResult.StandardOutput" class="rp-output">{{ runProcessResult.StandardOutput }}</pre>
                                    <pre v-if="runProcessResult.StandardError" class="rp-output rp-error-output">{{ runProcessResult.StandardError }}</pre>
                                    <div v-if="runProcessResult.TimedOut" class="clr-danger" style="font-size: 0.8rem; margin-top: 5px;">Process timed out</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ──── TAB: Files ──── -->
                <div v-show="activeTab === 'files'" class="kl-tab-content">
                    <div class="kl-panel">
                        <div class="fs-drives" v-if="drives.length > 0">
                            <button
                                v-for="drive in drives"
                                :key="drive"
                                class="fs-drive-btn"
                                :class="{ 'fs-drive-active': currentDrive === drive }"
                                @click="switchDrive(drive)"
                            >{{ drive }}</button>
                        </div>
                        <div class="fs-toolbar">
                            <button class="kl-action-btn kl-btn-small" @click="navigateUp" :disabled="isAtDriveRoot">Up</button>
                            <div class="fs-path mono">{{ currentDirPath || 'C:\\' }}</div>
                            <button class="kl-action-btn kl-btn-primary kl-btn-small" @click="listDirectory(currentDirPath)">Refresh</button>
                        </div>
                        <div v-if="dirLoading" class="section-loading">Loading directory...</div>
                        <div v-else-if="dirError" class="no-data clr-danger">{{ dirError }}</div>
                        <div v-else class="fs-scroll">
                            <div
                                v-for="entry in dirEntries"
                                :key="entry.FullPath"
                                class="fs-entry"
                                :class="{ 'fs-dir': entry.IsDirectory }"
                                @dblclick="entry.IsDirectory ? listDirectory(entry.FullPath) : null"
                            >
                                <span class="fs-icon">{{ entry.IsDirectory ? '📁' : '📄' }}</span>
                                <span class="fs-name" :class="{ 'clr-accent': entry.IsDirectory }">{{ entry.Name }}</span>
                                <span class="fs-size">{{ entry.IsDirectory ? '' : formatBytes(entry.SizeBytes) }}</span>
                                <span class="fs-date">{{ formatDate(entry.LastModified) }}</span>
                                <button v-if="!entry.IsDirectory" class="kl-action-btn kl-btn-small kl-btn-dl" @click="downloadFile(entry.FullPath, entry.Name)">Download</button>
                                <button v-if="entry.IsDirectory" class="kl-action-btn kl-btn-small kl-btn-primary" @click="listDirectory(entry.FullPath)">Open</button>
                            </div>
                            <div v-if="dirEntries.length === 0 && !dirLoading" class="no-data">Directory is empty</div>
                        </div>
                    </div>

                    <!-- Upload inside files tab -->
                    <div class="kl-panel" style="margin-top: 12px;">
                        <div class="kl-panel-title">Upload File</div>
                        <div class="upload-form">
                            <div class="upload-row-inline">
                                <div class="upload-field">
                                    <label class="kl-label">Destination Path</label>
                                    <input v-model="uploadDestPath" type="text" class="kl-input" placeholder="e.g. C:\temp\file.txt" />
                                </div>
                                <div class="upload-field">
                                    <label class="kl-label">File</label>
                                    <input ref="uploadFileInput" type="file" class="kl-file-input" @change="onFileSelected" />
                                </div>
                                <button class="kl-action-btn kl-btn-primary upload-btn" @click="uploadFile" :disabled="uploadLoading || !uploadDestPath || !uploadBase64">
                                    {{ uploadLoading ? 'Uploading...' : 'Upload' }}
                                </button>
                            </div>
                            <div v-if="uploadResult" class="upload-result" :class="uploadResult.Success ? 'clr-success' : 'clr-danger'">
                                {{ uploadResult.Message }}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ──── TAB: Screen ──── -->
                <div v-show="activeTab === 'screen'" class="kl-tab-content">
                    <div class="kl-panel">
                        <div class="sc-toolbar">
                            <label class="kl-label-inline">Monitor</label>
                            <input v-model.number="scMonitor" type="number" class="kl-input kl-input-sm" min="0" max="10" />
                            <label class="kl-label-inline">Quality</label>
                            <input v-model.number="scQuality" type="number" class="kl-input kl-input-sm" min="10" max="100" />
                            <label class="kl-label-inline">Interval (ms)</label>
                            <input v-model.number="scInterval" type="number" class="kl-input kl-input-sm" min="200" max="10000" />
                            <button v-if="!scActive" class="kl-action-btn kl-btn-primary" @click="startScreenCapture">Start</button>
                            <button v-else class="kl-action-btn kl-btn-danger" @click="stopScreenCapture">Stop</button>
                        </div>
                        <div class="sc-viewport">
                            <img v-if="scFrame" :src="'data:image/jpeg;base64,' + scFrame.Base64JpegData" class="sc-image" />
                            <div v-else class="sc-placeholder">
                                <div class="sc-placeholder-text">{{ scActive ? 'Waiting for frames...' : 'Screen capture inactive' }}</div>
                                <div v-if="!scActive" class="sc-placeholder-sub">Configure settings above and click Start</div>
                            </div>
                        </div>
                        <div v-if="scFrame" class="sc-info">
                            {{ scFrame.Width }}x{{ scFrame.Height }} — Monitor {{ scFrame.MonitorIndex }}
                        </div>
                    </div>
                </div>

            </div>
        </main>
    </div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
</script>

<script>
import KMButton from '~/components/KMButton.vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, KliveAPIUrl } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';
import { useCookie } from '#imports';

export default {
    components: { KMButton },
    data() {
        return {
            // Sidebar
            sidebarCollapsed: false,
            agentSearch: '',

            // Agents
            loading: false,
            agents: [],
            selectedAgentId: null,
            refreshInterval: null,

            // Tabs
            activeTab: 'overview',
            tabs: [
                { id: 'overview', label: 'Overview', icon: '📊' },
                { id: 'processes', label: 'Processes', icon: '⚙' },
                { id: 'terminal', label: 'Terminal', icon: '💻' },
                { id: 'files', label: 'Files', icon: '📁' },
                { id: 'screen', label: 'Screen', icon: '🖥' },
            ],

            // Status
            statusLoading: false,
            agentStatus: null,

            // System Info
            sysInfoLoading: false,
            systemInfo: null,

            // Processes
            processesLoading: false,
            processes: [],
            processFilter: '',

            // Terminal
            terminalCommand: '',
            terminalRunning: false,
            terminalHistory: [],

            // Run Process
            runProcessFileName: '',
            runProcessArgs: '',
            runProcessWait: true,
            runProcessTimeout: 30,
            runProcessLoading: false,
            runProcessResult: null,

            // File System
            drives: [],
            currentDrive: 'C:\\',
            currentDirPath: 'C:\\',
            dirLoading: false,
            dirError: null,
            dirEntries: [],

            // Screen Capture
            scMonitor: 0,
            scQuality: 50,
            scInterval: 1000,
            scActive: false,
            scFrame: null,
            scWebSocket: null,
            scReconnectAttempts: 0,

            // Upload
            uploadDestPath: '',
            uploadBase64: null,
            uploadFileName: '',
            uploadLoading: false,
            uploadResult: null,
        };
    },
    computed: {
        filteredAgents() {
            if (!this.agentSearch) return this.agents;
            const q = this.agentSearch.toLowerCase();
            return this.agents.filter(a =>
                (a.MachineName || '').toLowerCase().includes(q) ||
                (a.AgentId || '').toLowerCase().includes(q)
            );
        },
        selectedAgent() {
            return this.agents.find(a => a.AgentId === this.selectedAgentId) || null;
        },
        filteredProcesses() {
            if (!this.processFilter) return this.processes;
            const f = this.processFilter.toLowerCase();
            return this.processes.filter(p =>
                p.ProcessName.toLowerCase().includes(f) ||
                String(p.ProcessId).includes(f)
            );
        },
        isAtDriveRoot() {
            if (!this.currentDirPath) return true;
            // Matches patterns like "C:\" or "D:\"
            return /^[A-Za-z]:\\?$/.test(this.currentDirPath);
        },
        currentDriveLetter() {
            if (!this.currentDirPath) return 'C';
            return this.currentDirPath.charAt(0).toUpperCase();
        }
    },
    methods: {
        // ── Agents ──
        async loadAgents() {
            this.loading = true;
            try {
                const res = await RequestGETFromKliveAPI('/klivelink/agents');
                if (res.ok) {
                    const newAgents = await res.json();
                    // Preserve selection if agent still exists
                    this.agents = newAgents;
                    if (this.selectedAgentId && !newAgents.find(a => a.AgentId === this.selectedAgentId)) {
                        this.selectedAgentId = null;
                    }
                }
            } catch (e) {
                console.error('Failed to load agents:', e);
            } finally {
                this.loading = false;
            }
        },

        async selectAgent(agentId) {
            if (this.selectedAgentId === agentId) return;

            // Stop screen capture from previous agent
            if (this.scActive) await this.stopScreenCapture();

            this.selectedAgentId = agentId;
            this.activeTab = 'overview';

            // Reset state
            this.agentStatus = null;
            this.systemInfo = null;
            this.processes = [];
            this.processFilter = '';
            this.terminalHistory = [];
            this.dirEntries = [];
            this.dirError = null;
            this.scFrame = null;
            this.runProcessResult = null;
            this.uploadResult = null;
            this.drives = [];
            this.currentDrive = 'C:\\';
            this.currentDirPath = 'C:\\';

            // Preload overview + directory + detect drives in parallel
            await Promise.all([
                this.loadStatus(),
                this.loadSystemInfo(),
                this.loadProcesses(),
                this.listDirectory('C:\\'),
                this.detectDrives()
            ]);
        },

        switchTab(tabId) {
            this.activeTab = tabId;
        },

        refreshCurrentTab() {
            switch (this.activeTab) {
                case 'overview': this.loadStatus(); this.loadSystemInfo(); break;
                case 'processes': this.loadProcesses(); break;
                case 'files': this.listDirectory(this.currentDirPath); break;
                default: break;
            }
        },

        // ── Status ──
        async loadStatus() {
            this.statusLoading = true;
            try {
                const res = await RequestGETFromKliveAPI(`/klivelink/agent/status?agentId=${encodeURIComponent(this.selectedAgentId)}`);
                if (res.ok) this.agentStatus = await res.json();
            } catch (e) {
                console.error('Failed to load agent status:', e);
            } finally {
                this.statusLoading = false;
            }
        },

        // ── System Info ──
        async loadSystemInfo() {
            this.sysInfoLoading = true;
            try {
                const res = await RequestGETFromKliveAPI(`/klivelink/agent/systeminfo?agentId=${encodeURIComponent(this.selectedAgentId)}`);
                if (res.ok) this.systemInfo = await res.json();
            } catch (e) {
                console.error('Failed to load system info:', e);
            } finally {
                this.sysInfoLoading = false;
            }
        },

        // ── Processes ──
        async loadProcesses() {
            this.processesLoading = true;
            try {
                const res = await RequestGETFromKliveAPI(`/klivelink/agent/processes?agentId=${encodeURIComponent(this.selectedAgentId)}`);
                if (res.ok) {
                    this.processes = await res.json();
                    this.processes.sort((a, b) => b.MemoryMB - a.MemoryMB);
                }
            } catch (e) {
                console.error('Failed to load processes:', e);
            } finally {
                this.processesLoading = false;
            }
        },

        async killProcess(pid, name) {
            const result = await Swal.fire({
                icon: 'warning',
                title: 'Kill Process?',
                html: `Kill <b>${name}</b> (PID ${pid}) on this agent?`,
                showCancelButton: true,
                confirmButtonText: 'Kill',
                cancelButtonText: 'Cancel',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#4d9e39',
                background: '#161516',
                color: '#ffffff',
                customClass: { popup: 'swal-dark-theme' }
            });
            if (!result.isConfirmed) return;

            try {
                const res = await RequestPOSTFromKliveAPI(`/klivelink/agent/killprocess?agentId=${encodeURIComponent(this.selectedAgentId)}&processId=${pid}`);
                if (res.ok) {
                    const data = await res.json();
                    Swal.fire({ icon: data.Success ? 'success' : 'error', title: data.Success ? 'Killed' : 'Failed', text: data.Message, background: '#161516', color: '#fff', confirmButtonColor: '#4d9e39', customClass: { popup: 'swal-dark-theme' } });
                    this.loadProcesses();
                }
            } catch (e) {
                console.error('Kill process failed:', e);
            }
        },

        // ── Terminal ──
        async runTerminalCommand() {
            if (!this.terminalCommand.trim() || this.terminalRunning) return;
            const cmd = this.terminalCommand.trim();
            this.terminalCommand = '';
            const entry = { command: cmd, output: null, error: null, loading: true };
            this.terminalHistory.push(entry);
            this.terminalRunning = true;

            this.$nextTick(() => {
                if (this.$refs.terminalOutput) this.$refs.terminalOutput.scrollTop = this.$refs.terminalOutput.scrollHeight;
            });

            try {
                const res = await RequestPOSTFromKliveAPI(
                    `/klivelink/agent/terminal?agentId=${encodeURIComponent(this.selectedAgentId)}`,
                    JSON.stringify({ Command: cmd, TimeoutSeconds: 30 })
                );
                if (res.ok) {
                    const data = await res.json();
                    entry.output = data.Output || null;
                    entry.error = data.Error || null;
                    if (data.TimedOut) entry.error = (entry.error || '') + '\n[Command timed out]';
                } else {
                    entry.error = 'HTTP ' + res.status;
                }
            } catch (e) {
                entry.error = 'Request failed: ' + e.message;
            } finally {
                entry.loading = false;
                this.terminalRunning = false;
                this.$nextTick(() => {
                    if (this.$refs.terminalOutput) this.$refs.terminalOutput.scrollTop = this.$refs.terminalOutput.scrollHeight;
                });
            }
        },

        // ── Run Process ──
        async runProcess() {
            if (!this.runProcessFileName.trim() || this.runProcessLoading) return;
            this.runProcessLoading = true;
            this.runProcessResult = null;
            try {
                const res = await RequestPOSTFromKliveAPI(
                    `/klivelink/agent/runprocess?agentId=${encodeURIComponent(this.selectedAgentId)}`,
                    JSON.stringify({
                        FileName: this.runProcessFileName,
                        Arguments: this.runProcessArgs,
                        WaitForExit: this.runProcessWait,
                        TimeoutSeconds: this.runProcessTimeout
                    })
                );
                if (res.ok) this.runProcessResult = await res.json();
            } catch (e) {
                console.error('Run process failed:', e);
            } finally {
                this.runProcessLoading = false;
            }
        },

        // ── File System ──
        async listDirectory(path) {
            this.dirLoading = true;
            this.dirError = null;
            try {
                const res = await RequestGETFromKliveAPI(`/klivelink/agent/listdir?agentId=${encodeURIComponent(this.selectedAgentId)}&path=${encodeURIComponent(path || 'C:\\')}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.Error) {
                        this.dirError = data.Error;
                    } else {
                        this.currentDirPath = data.Path;
                        // Track which drive we're on
                        if (data.Path && data.Path.length >= 2 && data.Path[1] === ':') {
                            this.currentDrive = data.Path.charAt(0).toUpperCase() + ':\\';
                        }
                        this.dirEntries = (data.Entries || []).sort((a, b) => {
                            if (a.IsDirectory !== b.IsDirectory) return a.IsDirectory ? -1 : 1;
                            return a.Name.localeCompare(b.Name);
                        });
                    }
                }
            } catch (e) {
                this.dirError = 'Failed to list directory: ' + e.message;
            } finally {
                this.dirLoading = false;
            }
        },

        navigateUp() {
            if (!this.currentDirPath || this.isAtDriveRoot) return;
            const parts = this.currentDirPath.replace(/\\$/, '').split('\\');
            parts.pop();
            const parent = parts.length === 1 ? parts[0] + '\\' : parts.join('\\');
            this.listDirectory(parent);
        },

        async detectDrives() {
            try {
                const res = await RequestPOSTFromKliveAPI(
                    `/klivelink/agent/terminal?agentId=${encodeURIComponent(this.selectedAgentId)}`,
                    JSON.stringify({ Command: 'wmic logicaldisk get name', TimeoutSeconds: 10 })
                );
                if (res.ok) {
                    const data = await res.json();
                    const output = data.Output || '';
                    const driveLetters = output.match(/[A-Z]:/g) || [];
                    this.drives = driveLetters.map(d => d + '\\');
                    if (this.drives.length > 0 && !this.drives.includes(this.currentDrive)) {
                        this.currentDrive = this.drives[0];
                    }
                }
            } catch (e) {
                console.error('Drive detection failed:', e);
                this.drives = ['C:\\'];
            }
        },

        switchDrive(drive) {
            this.currentDrive = drive;
            this.currentDirPath = drive;
            this.listDirectory(drive);
        },

        async downloadFile(filePath, fileName) {
            try {
                Swal.fire({ title: 'Downloading...', text: fileName, allowOutsideClick: false, background: '#161516', color: '#fff', customClass: { popup: 'swal-dark-theme' }, didOpen: () => Swal.showLoading() });
                const res = await RequestGETFromKliveAPI(`/klivelink/agent/downloadfile?agentId=${encodeURIComponent(this.selectedAgentId)}&filePath=${encodeURIComponent(filePath)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.Error) {
                        Swal.fire({ icon: 'error', title: 'Download Failed', text: data.Error, background: '#161516', color: '#fff', confirmButtonColor: '#4d9e39', customClass: { popup: 'swal-dark-theme' } });
                        return;
                    }
                    const blob = this.base64ToBlob(data.Base64Data);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    a.click();
                    URL.revokeObjectURL(url);
                    Swal.fire({ icon: 'success', title: 'Downloaded', text: `${fileName} (${this.formatBytes(data.SizeBytes)})`, background: '#161516', color: '#fff', confirmButtonColor: '#4d9e39', customClass: { popup: 'swal-dark-theme' }, timer: 2000 });
                }
            } catch (e) {
                Swal.fire({ icon: 'error', title: 'Download Failed', text: e.message, background: '#161516', color: '#fff', confirmButtonColor: '#4d9e39', customClass: { popup: 'swal-dark-theme' } });
            }
        },

        // ── Upload ──
        onFileSelected(event) {
            const file = event.target.files[0];
            if (!file) { this.uploadBase64 = null; return; }
            this.uploadFileName = file.name;
            const reader = new FileReader();
            reader.onload = () => {
                this.uploadBase64 = reader.result.split(',')[1];
            };
            reader.readAsDataURL(file);
        },

        async uploadFile() {
            if (!this.uploadDestPath || !this.uploadBase64 || this.uploadLoading) return;
            this.uploadLoading = true;
            this.uploadResult = null;
            try {
                const res = await RequestPOSTFromKliveAPI(
                    `/klivelink/agent/uploadfile?agentId=${encodeURIComponent(this.selectedAgentId)}`,
                    JSON.stringify({ DestinationPath: this.uploadDestPath, Base64Data: this.uploadBase64 })
                );
                if (res.ok) this.uploadResult = await res.json();
            } catch (e) {
                this.uploadResult = { Success: false, Message: 'Upload failed: ' + e.message };
            } finally {
                this.uploadLoading = false;
            }
        },

        // ── Screen Capture ──
        async startScreenCapture() {
            try {
                const res = await RequestPOSTFromKliveAPI(
                    `/klivelink/agent/screencapture/start?agentId=${encodeURIComponent(this.selectedAgentId)}`,
                    JSON.stringify({ MonitorIndex: this.scMonitor, Quality: this.scQuality, IntervalMs: this.scInterval })
                );
                if (res.ok) {
                    this.scActive = true;
                    this.scReconnectAttempts = 0;
                    this.connectScreenWebSocket();
                }
            } catch (e) {
                console.error('Start screen capture failed:', e);
            }
        },

        connectScreenWebSocket() {
            const pass = useCookie('password').value || '';
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws/screencapture?agentId=${encodeURIComponent(this.selectedAgentId)}&authorization=${encodeURIComponent(pass)}`;

            this.scWebSocket = new WebSocket(wsUrl);
            this.scReconnectAttempts = (this.scReconnectAttempts || 0);

            this.scWebSocket.onopen = () => {
                this.scReconnectAttempts = 0;
            };

            this.scWebSocket.onmessage = (event) => {
                try {
                    this.scFrame = JSON.parse(event.data);
                } catch (e) {
                    console.error('Invalid frame data:', e);
                }
            };

            this.scWebSocket.onerror = (e) => {
                console.error('Screen capture WebSocket error:', e);
            };

            this.scWebSocket.onclose = (e) => {
                if (this.scActive && this.scReconnectAttempts < 5) {
                    this.scReconnectAttempts++;
                    setTimeout(() => { if (this.scActive) this.connectScreenWebSocket(); }, 2000);
                } else if (this.scActive) {
                    console.error('Screen capture WebSocket failed after 5 reconnect attempts');
                    this.scActive = false;
                }
            };
        },

        async stopScreenCapture() {
            this.scActive = false;
            if (this.scWebSocket) {
                this.scWebSocket.close();
                this.scWebSocket = null;
            }
            try {
                await RequestPOSTFromKliveAPI(`/klivelink/agent/screencapture/stop?agentId=${encodeURIComponent(this.selectedAgentId)}`);
            } catch (e) {
                console.error('Stop screen capture failed:', e);
            }
        },

        // ── Agent Control ──
        async disconnectAgent() {
            const result = await Swal.fire({
                icon: 'warning',
                title: 'Disconnect Agent?',
                text: 'This will send a disconnect command to the agent.',
                showCancelButton: true,
                confirmButtonText: 'Disconnect',
                cancelButtonText: 'Cancel',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#4d9e39',
                background: '#161516',
                color: '#ffffff',
                customClass: { popup: 'swal-dark-theme' }
            });
            if (!result.isConfirmed) return;

            try {
                const res = await RequestPOSTFromKliveAPI(`/klivelink/agent/disconnect?agentId=${encodeURIComponent(this.selectedAgentId)}`);
                if (res.ok) {
                    Swal.fire({ icon: 'success', title: 'Disconnected', text: 'Disconnect command sent.', background: '#161516', color: '#fff', confirmButtonColor: '#4d9e39', customClass: { popup: 'swal-dark-theme' } });
                    this.selectedAgentId = null;
                    this.loadAgents();
                }
            } catch (e) {
                console.error('Disconnect failed:', e);
            }
        },

        async selfDestructAgent() {
            const result = await Swal.fire({
                icon: 'error',
                title: 'Self-Destruct Agent?',
                html: 'This will <b>permanently remove all traces</b> of the agent from the target machine. This action is <b>irreversible</b>.',
                showCancelButton: true,
                confirmButtonText: 'Self-Destruct',
                cancelButtonText: 'Cancel',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#4d9e39',
                background: '#161516',
                color: '#ffffff',
                customClass: { popup: 'swal-dark-theme' }
            });
            if (!result.isConfirmed) return;

            try {
                Swal.fire({ title: 'Sending self-destruct...', allowOutsideClick: false, background: '#161516', color: '#fff', customClass: { popup: 'swal-dark-theme' }, didOpen: () => Swal.showLoading() });
                const res = await RequestPOSTFromKliveAPI(`/klivelink/agent/selfdestruct?agentId=${encodeURIComponent(this.selectedAgentId)}`);
                if (res.ok) {
                    const data = await res.json();
                    Swal.fire({ icon: data.Acknowledged ? 'success' : 'warning', title: data.Acknowledged ? 'Self-Destruct Initiated' : 'No Acknowledgment', text: data.Message, background: '#161516', color: '#fff', confirmButtonColor: '#4d9e39', customClass: { popup: 'swal-dark-theme' } });
                    this.selectedAgentId = null;
                    this.loadAgents();
                }
            } catch (e) {
                Swal.fire({ icon: 'error', title: 'Failed', text: e.message, background: '#161516', color: '#fff', confirmButtonColor: '#4d9e39', customClass: { popup: 'swal-dark-theme' } });
            }
        },

        // ── Utilities ──
        humanizeTime(dateStr) {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            const now = new Date();
            const diffMs = now - d;
            const sec = Math.floor(diffMs / 1000);
            if (sec < 60) return sec + 's';
            const min = Math.floor(sec / 60);
            if (min < 60) return min + 'm';
            const hr = Math.floor(min / 60);
            if (hr < 24) return hr + 'h ' + (min % 60) + 'm';
            return Math.floor(hr / 24) + 'd ' + (hr % 24) + 'h';
        },

        formatDate(dateStr) {
            if (!dateStr) return 'N/A';
            const d = new Date(dateStr);
            return d.toLocaleString();
        },

        formatBytes(bytes) {
            if (!bytes || bytes === 0) return '0 B';
            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
        },

        base64ToBlob(base64) {
            const byteChars = atob(base64);
            const byteNums = new Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
            return new Blob([new Uint8Array(byteNums)]);
        }
    },
    mounted() {
        this.loadAgents();
        // Auto-refresh agent list every 15s
        this.refreshInterval = setInterval(() => this.loadAgents(), 15000);
    },
    beforeUnmount() {
        if (this.refreshInterval) clearInterval(this.refreshInterval);
        if (this.scWebSocket) {
            this.scActive = false;
            this.scWebSocket.close();
        }
    }
};
</script>

<style scoped>
/* ═══════════════════════════════════════════
   SHELL: sidebar + main split layout
   ═══════════════════════════════════════════ */
.kl-shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
    background: #201f20;
}

/* ── SIDEBAR ── */
.kl-sidebar {
    width: 300px;
    min-width: 300px;
    background: #161616;
    border-right: 1px solid rgba(77, 158, 57, 0.15);
    display: flex;
    flex-direction: column;
    transition: width 0.2s ease, min-width 0.2s ease;
    overflow: hidden;
}

.sidebar-collapsed {
    width: 48px;
    min-width: 48px;
}

.sb-header {
    padding: 16px 14px 10px;
    border-bottom: 1px solid rgba(77, 158, 57, 0.1);
    flex-shrink: 0;
}

.sb-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.sb-title {
    font-size: 1.1rem;
    font-weight: 700;
    margin: 0;
    background: linear-gradient(135deg, #4d9e39, #62ce47);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    white-space: nowrap;
}

.sidebar-collapsed .sb-title {
    display: none;
}

.sb-collapse-btn {
    background: none;
    border: none;
    color: #969696;
    font-size: 1rem;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    transition: color 0.15s;
}

.sb-collapse-btn:hover {
    color: #4d9e39;
}

.sb-count {
    margin-top: 6px;
    font-size: 0.75rem;
    color: #969696;
    display: flex;
    align-items: center;
    gap: 6px;
}

.sb-count-num {
    color: #4d9e39;
    font-weight: 700;
    font-size: 0.85rem;
}

.sb-refresh-btn {
    background: none;
    border: none;
    color: #969696;
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0 4px;
    margin-left: auto;
    transition: color 0.15s;
}

.sb-refresh-btn:hover {
    color: #4d9e39;
}

/* Search */
.sb-search {
    padding: 8px 14px;
    flex-shrink: 0;
}

.sb-search-input {
    font-size: 0.78rem;
    padding: 6px 10px;
}

/* Agent list */
.sb-agent-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 8px 8px;
}

.sb-loading {
    text-align: center;
    padding: 20px 10px;
    color: #969696;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}

.sb-empty {
    text-align: center;
    padding: 20px 10px;
    color: #5c5c5c;
    font-size: 0.8rem;
    font-style: italic;
}

.sb-agent {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.12s ease;
    margin-bottom: 2px;
}

.sb-agent:hover {
    background: rgba(77, 158, 57, 0.08);
}

.sb-agent-active {
    background: rgba(77, 158, 57, 0.16) !important;
    border-left: 3px solid #4d9e39;
    padding-left: 7px;
}

.sb-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 5px rgba(34, 197, 94, 0.4);
    flex-shrink: 0;
}

.dot-lg {
    width: 10px;
    height: 10px;
}

.sb-agent-info {
    flex: 1;
    min-width: 0;
}

.sb-agent-name {
    color: #ffffff;
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.sb-agent-id {
    color: #5c5c5c;
    font-size: 0.65rem;
    font-family: 'Consolas', monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.sb-agent-time {
    color: #969696;
    font-size: 0.68rem;
    white-space: nowrap;
    flex-shrink: 0;
}

/* Collapsed mini agent dots */
.sb-mini-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
}

.sb-mini-agent {
    padding: 6px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.12s;
}

.sb-mini-agent:hover {
    background: rgba(77, 158, 57, 0.15);
}

.sb-mini-active {
    background: rgba(77, 158, 57, 0.25) !important;
}

/* Sidebar scrollbar */
.sb-agent-list::-webkit-scrollbar,
.sb-mini-list::-webkit-scrollbar {
    width: 3px;
}

.sb-agent-list::-webkit-scrollbar-thumb,
.sb-mini-list::-webkit-scrollbar-thumb {
    background: rgba(77, 158, 57, 0.2);
    border-radius: 2px;
}

/* ── MAIN CONTENT ── */
.kl-main {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
}

/* Welcome state */
.kl-welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #969696;
    gap: 10px;
    padding: 40px;
}

.kl-welcome-icon {
    font-size: 4rem;
    opacity: 0.6;
}

.kl-welcome-title {
    font-size: 2.2rem;
    font-weight: 700;
    margin: 0;
    background: linear-gradient(135deg, #4d9e39, #62ce47);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.kl-welcome-sub {
    color: #5c5c5c;
    font-size: 1rem;
    margin: 0;
}

.kl-welcome-stat {
    margin-top: 10px;
    padding: 8px 20px;
    background: rgba(77, 158, 57, 0.08);
    border: 1px solid rgba(77, 158, 57, 0.2);
    border-radius: 20px;
    font-size: 0.85rem;
    color: #969696;
}

.kl-welcome-count {
    color: #4d9e39;
    font-weight: 700;
}

/* ── Agent Bar ── */
.kl-agent-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    background: #161616;
    border-bottom: 1px solid rgba(77, 158, 57, 0.12);
    flex-wrap: wrap;
    gap: 10px;
}

.kl-agent-bar-left {
    display: flex;
    align-items: center;
    gap: 12px;
}

.kl-agent-bar-name {
    color: #ffffff;
    font-size: 1.1rem;
    font-weight: 700;
    margin: 0;
}

.kl-agent-bar-id {
    color: #5c5c5c;
    font-size: 0.72rem;
}

.kl-agent-bar-actions {
    display: flex;
    gap: 8px;
}

/* ── TABS ── */
.kl-tabs {
    display: flex;
    gap: 0;
    background: #1a1a1a;
    border-bottom: 1px solid rgba(77, 158, 57, 0.1);
    padding: 0 12px;
    overflow-x: auto;
}

.kl-tab {
    padding: 10px 18px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
    white-space: nowrap;
}

.kl-tab-icon {
    font-size: 0.85rem;
}

.kl-tab-label {
    color: #969696;
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-family: 'Roboto', sans-serif;
}

.kl-tab:hover .kl-tab-label {
    color: #ffffff;
}

.kl-tab-active {
    border-bottom-color: #4d9e39;
}

.kl-tab-active .kl-tab-label {
    color: #4d9e39;
}

/* ── TAB CONTENT ── */
.kl-tab-content {
    padding: 16px 20px;
}

.tab-grid {
    display: grid;
    gap: 12px;
}

.tab-grid-2 {
    grid-template-columns: 1fr 1fr;
    align-items: stretch;
}

/* Panels */
.kl-panel {
    background: #161616;
    border-radius: 10px;
    border: 1px solid rgba(77, 158, 57, 0.1);
    padding: 14px 16px;
}

.kl-panel-tall {
    min-height: 380px;
    display: flex;
    flex-direction: column;
}

.kl-panel-tall .kl-panel-title {
    flex-shrink: 0;
}

.kl-panel-tall .terminal-area,
.kl-panel-tall .run-process-form {
    flex: 1;
    display: flex;
    flex-direction: column;
}

.kl-panel-title {
    font-size: 0.78rem;
    font-weight: 700;
    color: #4d9e39;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(77, 158, 57, 0.1);
}

/* Spinner */
.kl-spinner-sm {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(77, 158, 57, 0.2);
    border-top: 2px solid #4d9e39;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    flex-shrink: 0;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

/* ═══════════════════════════════════════════
   SHARED DETAIL STYLES
   ═══════════════════════════════════════════ */
.detail-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.detail-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 4px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.02);
}

.detail-row:hover {
    background: rgba(77, 158, 57, 0.06);
}

.dl {
    color: #969696;
    font-size: 0.8rem;
    flex-shrink: 0;
    margin-right: 12px;
}

.dv {
    color: #ffffff;
    font-size: 0.8rem;
    text-align: right;
    word-break: break-word;
}

.detail-sep {
    height: 1px;
    background: rgba(77, 158, 57, 0.15);
    margin: 3px 0;
}

.mono {
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 0.76rem;
}

.section-loading {
    text-align: center;
    padding: 20px;
    color: #969696;
    font-size: 0.82rem;
}

.no-data {
    color: #5c5c5c;
    font-style: italic;
    text-align: center;
    padding: 20px;
    font-size: 0.82rem;
}

/* Colors */
.clr-success { color: #22c55e !important; }
.clr-warning { color: #fbbf24 !important; }
.clr-danger { color: #ef4444 !important; }
.clr-accent { color: #4d9e39 !important; }
.clr-muted { color: #969696 !important; }

/* ═══════════════════════════════════════════
   BUTTONS
   ═══════════════════════════════════════════ */
.kl-action-btn {
    padding: 6px 14px;
    border-radius: 6px;
    border: 1px solid rgba(77, 158, 57, 0.3);
    background: rgba(77, 158, 57, 0.08);
    color: #4d9e39;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Roboto', sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
}

.kl-action-btn:hover {
    background: rgba(77, 158, 57, 0.18);
    border-color: #4d9e39;
}

.kl-action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.kl-btn-primary {
    background: rgba(77, 158, 57, 0.12);
    border-color: rgba(77, 158, 57, 0.4);
}

.kl-btn-primary:hover {
    background: rgba(77, 158, 57, 0.25);
}

.kl-btn-danger {
    border-color: rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.08);
    color: #ef4444;
}

.kl-btn-danger:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: #ef4444;
}

.kl-btn-destruct {
    border-color: rgba(239, 68, 68, 0.6);
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    font-weight: 700;
}

.kl-btn-destruct:hover {
    background: rgba(239, 68, 68, 0.35);
    border-color: #ef4444;
    box-shadow: 0 0 10px rgba(239, 68, 68, 0.25);
}

.kl-btn-small {
    padding: 4px 10px;
    font-size: 0.7rem;
}

.kl-btn-dl {
    border-color: rgba(59, 130, 246, 0.4);
    background: rgba(59, 130, 246, 0.08);
    color: #3b82f6;
}

.kl-btn-dl:hover {
    background: rgba(59, 130, 246, 0.2);
}

/* ═══════════════════════════════════════════
   INPUTS
   ═══════════════════════════════════════════ */
.kl-input {
    width: 100%;
    padding: 7px 11px;
    border-radius: 6px;
    border: 1px solid rgba(77, 158, 57, 0.2);
    background: rgba(0, 0, 0, 0.3);
    color: #ffffff;
    font-size: 0.8rem;
    font-family: 'Roboto', sans-serif;
    outline: none;
    transition: border-color 0.15s ease;
    box-sizing: border-box;
}

.kl-input:focus {
    border-color: #4d9e39;
}

.kl-input::placeholder {
    color: #5c5c5c;
}

.kl-input-sm {
    width: 70px;
    padding: 4px 8px;
    text-align: center;
}

.kl-input-terminal {
    flex: 1;
    font-family: 'Consolas', 'Courier New', monospace;
}

.kl-label {
    color: #969696;
    font-size: 0.75rem;
    margin-bottom: 4px;
    display: block;
    margin-top: 8px;
}

.kl-label-inline {
    color: #969696;
    font-size: 0.72rem;
    white-space: nowrap;
}

.kl-checkbox-label {
    color: #969696;
    font-size: 0.75rem;
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
}

.kl-checkbox-label input[type="checkbox"] {
    accent-color: #4d9e39;
}

.kl-file-input {
    color: #969696;
    font-size: 0.78rem;
}

/* ═══════════════════════════════════════════
   PROCESSES TAB
   ═══════════════════════════════════════════ */
.processes-toolbar {
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
    align-items: center;
}

.proc-count {
    color: #5c5c5c;
    font-size: 0.72rem;
    white-space: nowrap;
}

.processes-scroll {
    overflow-y: auto;
    max-height: calc(100vh - 260px);
}

.process-header-row {
    display: grid;
    grid-template-columns: 70px 1fr 90px 50px;
    gap: 8px;
    padding: 4px 8px;
    border-bottom: 1px solid rgba(77, 158, 57, 0.15);
    margin-bottom: 2px;
    position: sticky;
    top: 0;
    background: #161616;
    z-index: 1;
}

.process-header-row span {
    color: #969696;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.process-row {
    display: grid;
    grid-template-columns: 70px 1fr 90px 50px;
    gap: 8px;
    padding: 3px 8px;
    border-radius: 4px;
    align-items: center;
}

.process-row:hover {
    background: rgba(77, 158, 57, 0.06);
}

.p-pid {
    color: #969696;
    font-size: 0.76rem;
}

.p-name {
    color: #ffffff;
    font-size: 0.78rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.p-mem {
    color: #969696;
    font-size: 0.76rem;
    text-align: right;
}

.kl-kill-btn {
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid rgba(239, 68, 68, 0.3);
    background: rgba(239, 68, 68, 0.06);
    color: #ef4444;
    font-size: 0.68rem;
    cursor: pointer;
    font-family: 'Roboto', sans-serif;
    text-transform: uppercase;
    transition: all 0.15s ease;
}

.kl-kill-btn:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: #ef4444;
}

/* ═══════════════════════════════════════════
   TERMINAL TAB
   ═══════════════════════════════════════════ */
.terminal-area {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.terminal-output {
    flex: 1;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 8px;
    min-height: 200px;
    font-family: 'Consolas', 'Courier New', monospace;
}

.term-entry {
    margin-bottom: 8px;
}

.term-cmd {
    color: #4d9e39;
    font-size: 0.78rem;
    font-weight: 600;
}

.term-out {
    color: #d4d4d4;
    font-size: 0.73rem;
    margin: 2px 0 0 0;
    white-space: pre-wrap;
    word-break: break-all;
    font-family: 'Consolas', 'Courier New', monospace;
}

.term-err {
    color: #ef4444;
    font-size: 0.73rem;
    margin: 2px 0 0 0;
    white-space: pre-wrap;
    word-break: break-all;
    font-family: 'Consolas', 'Courier New', monospace;
}

.term-loading {
    color: #969696;
    font-size: 0.73rem;
    font-style: italic;
}

.terminal-input-row {
    display: flex;
    gap: 8px;
}

/* Run Process */
.run-process-form {
    padding: 0 2px;
}

.rp-options {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 10px;
}

.rp-result {
    margin-top: 10px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 6px;
}

.rp-output {
    color: #d4d4d4;
    font-size: 0.7rem;
    margin-top: 6px;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 80px;
    overflow-y: auto;
    font-family: 'Consolas', 'Courier New', monospace;
}

.rp-error-output {
    color: #ef4444;
}

/* ═══════════════════════════════════════════
   FILES TAB
   ═══════════════════════════════════════════ */
/* Drive selector */
.fs-drives {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
    flex-wrap: wrap;
}

.fs-drive-btn {
    padding: 4px 12px;
    border-radius: 4px;
    border: 1px solid rgba(77, 158, 57, 0.2);
    background: rgba(0, 0, 0, 0.25);
    color: #969696;
    font-size: 0.75rem;
    font-weight: 600;
    font-family: 'Consolas', 'Courier New', monospace;
    cursor: pointer;
    transition: all 0.15s ease;
}

.fs-drive-btn:hover {
    background: rgba(77, 158, 57, 0.1);
    border-color: rgba(77, 158, 57, 0.4);
    color: #ffffff;
}

.fs-drive-active {
    background: rgba(77, 158, 57, 0.18);
    border-color: #4d9e39;
    color: #4d9e39;
}

.fs-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
}

.fs-path {
    flex: 1;
    color: #4d9e39;
    font-size: 0.8rem;
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.fs-scroll {
    overflow-y: auto;
    max-height: calc(100vh - 320px);
}

.fs-entry {
    display: grid;
    grid-template-columns: 24px 1fr 90px 140px 80px;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 4px;
    align-items: center;
    cursor: default;
}

.fs-entry:hover {
    background: rgba(77, 158, 57, 0.06);
}

.fs-dir {
    cursor: pointer;
}

.fs-icon {
    font-size: 0.85rem;
    text-align: center;
}

.fs-name {
    color: #ffffff;
    font-size: 0.8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.fs-size {
    color: #969696;
    font-size: 0.73rem;
    text-align: right;
}

.fs-date {
    color: #969696;
    font-size: 0.7rem;
    text-align: right;
}

/* Upload */
.upload-form {
    padding: 0 2px;
}

.upload-row-inline {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    flex-wrap: wrap;
}

.upload-field {
    flex: 1;
    min-width: 200px;
}

.upload-btn {
    margin-bottom: 2px;
    align-self: flex-end;
}

.upload-result {
    margin-top: 8px;
    font-size: 0.8rem;
    padding: 6px 10px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.2);
}

/* ═══════════════════════════════════════════
   SCREEN TAB
   ═══════════════════════════════════════════ */
.sc-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    flex-wrap: wrap;
}

.sc-viewport {
    background: rgba(0, 0, 0, 0.5);
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    max-height: calc(100vh - 260px);
}

.sc-image {
    max-width: 100%;
    max-height: calc(100vh - 260px);
    object-fit: contain;
}

.sc-placeholder {
    text-align: center;
    padding: 40px;
}

.sc-placeholder-text {
    color: #969696;
    font-size: 1rem;
}

.sc-placeholder-sub {
    color: #5c5c5c;
    font-size: 0.8rem;
    margin-top: 8px;
}

.sc-info {
    text-align: center;
    color: #969696;
    font-size: 0.73rem;
    margin-top: 6px;
    font-family: 'Consolas', 'Courier New', monospace;
}

/* ═══════════════════════════════════════════
   SCROLLBARS
   ═══════════════════════════════════════════ */
.processes-scroll::-webkit-scrollbar,
.fs-scroll::-webkit-scrollbar,
.terminal-output::-webkit-scrollbar,
.kl-main::-webkit-scrollbar {
    width: 4px;
}

.processes-scroll::-webkit-scrollbar-track,
.fs-scroll::-webkit-scrollbar-track,
.terminal-output::-webkit-scrollbar-track,
.kl-main::-webkit-scrollbar-track {
    background: rgba(77, 158, 57, 0.08);
    border-radius: 2px;
}

.processes-scroll::-webkit-scrollbar-thumb,
.fs-scroll::-webkit-scrollbar-thumb,
.terminal-output::-webkit-scrollbar-thumb,
.kl-main::-webkit-scrollbar-thumb {
    background: rgba(77, 158, 57, 0.25);
    border-radius: 2px;
}

/* ═══════════════════════════════════════════
   RESPONSIVE
   ═══════════════════════════════════════════ */
@media (max-width: 1024px) {
    .tab-grid-2 {
        grid-template-columns: 1fr;
    }

    .kl-sidebar {
        width: 240px;
        min-width: 240px;
    }
}

@media (max-width: 768px) {
    .kl-sidebar {
        width: 48px;
        min-width: 48px;
    }

    .sb-header { padding: 10px 8px; }

    .kl-agent-bar {
        padding: 10px 14px;
    }

    .kl-agent-bar-name {
        font-size: 0.95rem;
    }

    .fs-entry {
        grid-template-columns: 24px 1fr 80px;
    }

    .fs-date,
    .fs-entry button {
        display: none;
    }

    .process-header-row,
    .process-row {
        grid-template-columns: 50px 1fr 70px 45px;
    }

    .kl-tab {
        padding: 8px 12px;
    }
}
</style>
