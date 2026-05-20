<template>
    <div class="bot-schedule-page">
        <!-- Header + Toolbar -->
        <div class="page-toolbar">
            <div class="title-block">
                <h1 class="page-title">Bot Schedule</h1>
                <span class="page-subtitle">{{ loading ? '…' : `${totalTasks} tasks · ${uniqueAgents} agents · ${importantTasks} important` }}</span>
            </div>
            <div class="controls">
                <input
                    v-model="search"
                    type="text"
                    placeholder="Search tasks, topics, reasons…"
                    class="search-input"
                />
                <select v-model="agentFilter" class="filter-select">
                    <option value="">All agents</option>
                    <option v-for="agent in uniqueAgentNames" :key="agent" :value="agent">{{ agent }}</option>
                </select>
                <label class="toggle">
                    <input type="checkbox" v-model="importantOnly" /> Important only
                </label>
                <button @click="loadTasks" class="icon-button" :disabled="loading" title="Refresh">⟳</button>
            </div>
        </div>

        <!-- Compact Metric Strip -->
        <div class="metric-strip">
            <div class="metric"><span class="m-icon">📋</span><span class="m-val">{{ loading ? '—' : totalTasks }}</span><span class="m-lbl">Total</span></div>
            <div class="metric warning"><span class="m-icon">⚡</span><span class="m-val">{{ loading ? '—' : importantTasks }}</span><span class="m-lbl">Important</span></div>
            <div class="metric success"><span class="m-icon">🤖</span><span class="m-val">{{ loading ? '—' : uniqueAgents }}</span><span class="m-lbl">Agents</span></div>
            <div class="metric info">
                <span class="m-icon">⏰</span>
                <div class="m-stack">
                    <span class="m-val small">{{ loading ? '—' : nextTaskTime }}</span>
                    <span class="m-lbl">Next · {{ loading ? '' : nextTaskAgent }}</span>
                </div>
            </div>
        </div>

        <!-- Task Table -->
        <div class="panel">
            <div class="panel-head">
                <span class="panel-title">Task Queue</span>
                <span class="panel-meta">{{ filteredTasks.length }} shown</span>
            </div>

            <div v-if="loading" class="state">⏳ Loading scheduled tasks…</div>
            <div v-else-if="error" class="state error">
                ⚠️ {{ error }}
                <button @click="loadTasks" class="retry-button">Retry</button>
            </div>
            <div v-else-if="filteredTasks.length === 0" class="state">📭 No tasks match.</div>

            <div v-else class="task-table">
                <div class="row head">
                    <div class="c-task">Task</div>
                    <div class="c-agent">Agent</div>
                    <div class="c-topic">Topic</div>
                    <div class="c-due">Due</div>
                    <div class="c-until">In</div>
                </div>
                <template v-for="task in filteredTasks" :key="task.randomidentifier">
                    <div
                        class="row"
                        :class="{ important: task.isImportant, 'due-soon': isDueSoon(task.dateTimeDue), expanded: expanded === task.randomidentifier }"
                        @click="toggleExpand(task.randomidentifier)"
                    >
                        <div class="c-task">
                            <span class="t-icon">{{ getTaskIcon(task.agentName) }}</span>
                            <span class="t-name">{{ task.taskName }}</span>
                            <span v-if="task.isImportant" class="badge">⚡</span>
                        </div>
                        <div class="c-agent">{{ task.agentName }}</div>
                        <div class="c-topic" :title="task.topic">{{ task.topic }}</div>
                        <div class="c-due">{{ formatDueTime(task.dateTimeDue) }}</div>
                        <div class="c-until" :class="{ urgent: isDueSoon(task.dateTimeDue) }">{{ getTimeUntil(task.dateTimeDue) }}</div>
                    </div>
                    <div v-if="expanded === task.randomidentifier" class="row-detail" :key="task.randomidentifier + '-d'">
                        <div><span class="dl">Reason:</span> <span class="dv">{{ task.reason }}</span></div>
                        <div><span class="dl">Task ID:</span> <span class="dv mono">{{ task.timeID }}</span></div>
                        <div><span class="dl">Set:</span> <span class="dv">{{ formatSetTime(task.dateTimeSet) }}</span></div>
                    </div>
                </template>
            </div>
        </div>

        <!-- Agent Overview -->
        <div class="panel">
            <div class="panel-head">
                <span class="panel-title">Agents</span>
                <span class="panel-meta">{{ agentGroups.length }} active</span>
            </div>
            <div class="agent-grid">
                <div v-for="agent in agentGroups" :key="agent.name" class="agent-card" @click="setAgentFilter(agent.name)">
                    <div class="a-head">
                        <span class="a-icon">{{ agent.icon }}</span>
                        <span class="a-name">{{ agent.name }}</span>
                        <span class="a-count">{{ agent.taskCount }}</span>
                    </div>
                    <div class="a-meta">
                        <span v-if="agent.importantCount > 0" class="a-imp">⚡ {{ agent.importantCount }}</span>
                        <span v-if="agent.nextTask" class="a-next">→ {{ getTimeUntil(agent.nextTask.dateTimeDue) }}</span>
                    </div>
                    <div v-if="agent.nextTask" class="a-task">{{ agent.nextTask.taskName }}</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
</script>

<script>
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

export default {
    data() {
        return {
            tasks: [],
            loading: true,
            error: null,
            search: '',
            agentFilter: '',
            importantOnly: false,
            expanded: null
        };
    },
    computed: {
        totalTasks() {
            return this.tasks.length;
        },
        importantTasks() {
            return this.tasks.filter(t => t.isImportant).length;
        },
        uniqueAgentNames() {
            return [...new Set(this.tasks.map(t => t.agentName))].sort();
        },
        uniqueAgents() {
            return this.uniqueAgentNames.length;
        },
        sortedTasks() {
            return [...this.tasks].sort((a, b) => new Date(a.dateTimeDue) - new Date(b.dateTimeDue));
        },
        filteredTasks() {
            const q = this.search.trim().toLowerCase();
            return this.sortedTasks.filter(t => {
                if (this.agentFilter && t.agentName !== this.agentFilter) return false;
                if (this.importantOnly && !t.isImportant) return false;
                if (q) {
                    const hay = `${t.taskName} ${t.topic} ${t.reason} ${t.agentName}`.toLowerCase();
                    if (!hay.includes(q)) return false;
                }
                return true;
            });
        },
        nextTaskTime() {
            if (this.sortedTasks.length === 0) return 'None';
            return this.formatDueTime(this.sortedTasks[0].dateTimeDue);
        },
        nextTaskAgent() {
            if (this.sortedTasks.length === 0) return '';
            return this.sortedTasks[0].agentName;
        },
        agentGroups() {
            const groups = {};
            this.tasks.forEach(task => {
                if (!groups[task.agentName]) {
                    groups[task.agentName] = {
                        name: task.agentName,
                        icon: this.getTaskIcon(task.agentName),
                        tasks: [],
                        taskCount: 0,
                        importantCount: 0
                    };
                }
                groups[task.agentName].tasks.push(task);
                groups[task.agentName].taskCount++;
                if (task.isImportant) groups[task.agentName].importantCount++;
            });
            Object.values(groups).forEach(group => {
                group.tasks.sort((a, b) => new Date(a.dateTimeDue) - new Date(b.dateTimeDue));
                group.nextTask = group.tasks[0];
            });
            return Object.values(groups).sort((a, b) => b.taskCount - a.taskCount);
        }
    },
    methods: {
        async loadTasks() {
            this.loading = true;
            this.error = null;
            try {
                const response = await RequestGETFromKliveAPI('/timemanager/getalltasks');
                if (response.status === 200) {
                    this.tasks = (await response.json()) || [];
                } else {
                    throw new Error(`Failed to load tasks: ${response.status}`);
                }
            } catch (err) {
                console.error('Error loading tasks:', err);
                this.error = 'Failed to load tasks. Please try again later.';
                this.tasks = [];
            } finally {
                this.loading = false;
            }
        },
        toggleExpand(id) {
            this.expanded = this.expanded === id ? null : id;
        },
        setAgentFilter(name) {
            this.agentFilter = this.agentFilter === name ? '' : name;
        },
        formatDueTime(dateString) {
            const date = new Date(dateString);
            return date.toLocaleString('en-GB', {
                day: '2-digit', month: '2-digit',
                hour: '2-digit', minute: '2-digit'
            });
        },
        formatSetTime(dateString) {
            const date = new Date(dateString);
            return date.toLocaleString('en-GB', {
                day: '2-digit', month: '2-digit',
                hour: '2-digit', minute: '2-digit'
            });
        },
        getTimeUntil(dateString) {
            const now = new Date();
            const due = new Date(dateString);
            const diff = due - now;
            if (diff < 0) return 'Overdue';
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
            if (days > 0) return `${days}d ${hours % 24}h`;
            if (hours > 0) return `${hours}h ${minutes % 60}m`;
            return `${minutes}m`;
        },
        isDueSoon(dateString) {
            return new Date(dateString) - new Date() < 30 * 60 * 1000;
        },
        getTaskIcon(agentName) {
            const icons = {
                'CS2ArbitrageBot': '🎯',
                'OmniTrader': '📈',
                'OmniTube': '📺',
                'MemeScraper': '😄',
                'DataCollector': '📊'
            };
            return icons[agentName] || '🤖';
        }
    },
    mounted() {
        this.loadTasks();
    }
};
</script>

<style scoped>
.bot-schedule-page {
    padding: 14px 18px;
    color: #e0e0e0;
}

/* Toolbar */
.page-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-bottom: 12px;
    flex-wrap: wrap;
}

.title-block {
    display: flex;
    align-items: baseline;
    gap: 12px;
}

.page-title {
    font-size: 1.4rem;
    font-weight: 700;
    color: #4d9e39;
    margin: 0;
}

.page-subtitle {
    color: #888;
    font-size: 0.85rem;
}

.controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.search-input,
.filter-select {
    background: #1a1a1a;
    border: 1px solid #333;
    color: #e0e0e0;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 0.85rem;
    outline: none;
}

.search-input {
    width: 220px;
}

.search-input:focus,
.filter-select:focus {
    border-color: #4d9e39;
}

.toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #aaa;
    font-size: 0.85rem;
    cursor: pointer;
}

.icon-button {
    background: #1a1a1a;
    border: 1px solid #333;
    color: #4d9e39;
    width: 30px;
    height: 30px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.15s;
}

.icon-button:hover:not(:disabled) {
    border-color: #4d9e39;
    background: rgba(77, 158, 57, 0.1);
}

.icon-button:disabled {
    opacity: 0.5;
    cursor: wait;
}

/* Metric strip */
.metric-strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 12px;
}

.metric {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: linear-gradient(135deg, #161616 0%, #1d1d1d 100%);
    border: 1px solid #2a2a2a;
    border-left: 3px solid #4d9e39;
    border-radius: 8px;
}

.metric.warning { border-left-color: #f39c12; }
.metric.success { border-left-color: #4d9e39; }
.metric.info { border-left-color: #4d9e39; }

.m-icon { font-size: 1.3rem; }
.m-val {
    font-size: 1.4rem;
    font-weight: 700;
    color: #4d9e39;
}
.m-val.small { font-size: 0.95rem; }
.metric.warning .m-val { color: #f39c12; }

.m-lbl {
    font-size: 0.75rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-left: auto;
}

.m-stack {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-left: 0;
}

.m-stack .m-lbl {
    margin-left: 0;
    text-transform: none;
    letter-spacing: 0;
}

/* Panel */
.panel {
    background: #131313;
    border: 1px solid #262626;
    border-radius: 8px;
    margin-bottom: 12px;
    overflow: hidden;
}

.panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 14px;
    background: #1a1a1a;
    border-bottom: 1px solid #262626;
}

.panel-title {
    font-weight: 600;
    color: #4d9e39;
    font-size: 0.95rem;
}

.panel-meta {
    font-size: 0.8rem;
    color: #777;
}

/* Table */
.task-table {
    max-height: 480px;
    overflow-y: auto;
}

.row {
    display: grid;
    grid-template-columns: minmax(220px, 2fr) 140px minmax(180px, 2fr) 110px 80px;
    gap: 10px;
    padding: 8px 14px;
    align-items: center;
    border-bottom: 1px solid #1f1f1f;
    cursor: pointer;
    transition: background 0.12s;
    font-size: 0.875rem;
}

.row:hover:not(.head) {
    background: rgba(77, 158, 57, 0.07);
}

.row.head {
    background: #1a1a1a;
    color: #888;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    cursor: default;
    position: sticky;
    top: 0;
    z-index: 1;
}

.row.head:hover { background: #1a1a1a; }

.row.important { border-left: 3px solid #f39c12; padding-left: 11px; }
.row.due-soon { border-left: 3px solid #e74c3c; padding-left: 11px; background: rgba(231, 76, 60, 0.05); }
.row.expanded { background: rgba(77, 158, 57, 0.1); }

.c-task {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.t-icon { font-size: 1rem; flex-shrink: 0; }
.t-name {
    color: #fff;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.badge {
    background: #f39c12;
    color: #000;
    font-size: 0.7rem;
    padding: 1px 5px;
    border-radius: 4px;
    font-weight: 700;
}

.c-agent { color: #4d9e39; font-weight: 500; }
.c-topic {
    color: #bbb;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.c-due { color: #ccc; font-family: 'Consolas', monospace; font-size: 0.82rem; }
.c-until {
    color: #888;
    font-size: 0.82rem;
    text-align: right;
}
.c-until.urgent { color: #e74c3c; font-weight: 600; }

.row-detail {
    padding: 10px 18px 12px 18px;
    background: #0e0e0e;
    border-bottom: 1px solid #1f1f1f;
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    font-size: 0.82rem;
}

.dl { color: #777; font-weight: 600; margin-right: 4px; }
.dv { color: #ccc; }
.dv.mono { font-family: 'Consolas', monospace; }

/* States */
.state {
    text-align: center;
    padding: 36px 20px;
    color: #777;
    font-size: 0.95rem;
}

.state.error { color: #e74c3c; }

.retry-button {
    margin-left: 10px;
    background: #4d9e39;
    color: white;
    border: none;
    padding: 5px 14px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.85rem;
}

.retry-button:hover { background: #62ce47; }

/* Agent grid */
.agent-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 8px;
    padding: 10px;
}

.agent-card {
    background: #181818;
    border: 1px solid #262626;
    border-radius: 6px;
    padding: 10px 12px;
    cursor: pointer;
    transition: all 0.15s;
}

.agent-card:hover {
    border-color: #4d9e39;
    background: rgba(77, 158, 57, 0.06);
}

.a-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
}

.a-icon { font-size: 1.1rem; }
.a-name { font-weight: 600; color: #fff; flex: 1; font-size: 0.9rem; }
.a-count {
    background: rgba(77, 158, 57, 0.2);
    color: #4d9e39;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 0.78rem;
    font-weight: 700;
}

.a-meta {
    display: flex;
    gap: 10px;
    font-size: 0.75rem;
    margin-bottom: 4px;
}

.a-imp { color: #f39c12; }
.a-next { color: #888; }

.a-task {
    font-size: 0.8rem;
    color: #aaa;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Scrollbar */
.task-table::-webkit-scrollbar { width: 8px; }
.task-table::-webkit-scrollbar-track { background: #131313; }
.task-table::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
.task-table::-webkit-scrollbar-thumb:hover { background: #4d9e39; }

@media (max-width: 900px) {
    .row { grid-template-columns: 1fr 80px 70px; }
    .c-agent, .c-topic { display: none; }
    .row.head .c-agent, .row.head .c-topic { display: none; }
    .metric-strip { grid-template-columns: repeat(2, 1fr); }
}
</style>
