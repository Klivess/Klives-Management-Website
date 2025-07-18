<template>
    <div class="bot-schedule-page">
        <!-- Header Section -->
        <div class="page-header">
            <h1 class="page-title">Bot Schedule Manager</h1>
            <p class="page-subtitle">Monitor and manage all scheduled bot tasks</p>
        </div>

        <!-- Statistics Cards -->
        <KMInfoGrid columns="4" rows="1" rowHeight="160" style="margin-bottom: 30px;">
            <CS2MetricCard
                :value="loading ? 'Loading...' : totalTasks"
                label="Total Tasks"
                format="count"
                variant="info"
                icon="📋"
            />
            <CS2MetricCard
                :value="loading ? 'Loading...' : importantTasks"
                label="Important Tasks"
                format="count"
                variant="warning"
                icon="⚡"
                :highlight="!loading && importantTasks > 0"
            />
            <CS2MetricCard
                :value="loading ? 'Loading...' : uniqueAgents"
                label="Active Agents"
                format="count"
                variant="success"
                icon="🤖"
            />
            <CS2MetricCard
                :value="loading ? 'Loading...' : nextTaskTime"
                label="Next Task"
                :subtitle="loading ? '' : nextTaskAgent"
                format="time"
                variant="info"
                icon="⏰"
            />
        </KMInfoGrid>

        <!-- Task List Section -->
        <div class="section-header">
            <h2 class="section-title">Scheduled Tasks</h2>
            <p class="section-subtitle">All upcoming bot tasks ordered by execution time</p>
        </div>
        
        <KMInfoGrid columns="1" rows="1" rowHeight="600" style="margin-bottom: 30px;">
            <KMInfoBox caption="Task Queue">
                <div class="task-container">
                    <!-- Loading State -->
                    <div v-if="loading" class="loading-state">
                        <div class="loading-icon">⏳</div>
                        <div class="loading-text">Loading scheduled tasks...</div>
                    </div>
                    
                    <!-- Error State -->
                    <div v-else-if="error" class="error-state">
                        <div class="error-icon">⚠️</div>
                        <div class="error-text">{{ error }}</div>
                        <button @click="loadTasks" class="retry-button">Retry</button>
                    </div>
                    
                    <!-- Tasks List -->
                    <div v-else-if="tasks.length > 0">
                        <div 
                            v-for="(task, index) in sortedTasks" 
                            :key="task.randomidentifier + index"
                            class="task-item"
                            :class="{ 'important': task.isImportant, 'due-soon': isDueSoon(task.dateTimeDue) }"
                        >
                            <div class="task-header">
                                <div class="task-title">
                                    <span class="task-icon">{{ getTaskIcon(task.agentName) }}</span>
                                    <span class="task-name">{{ task.taskName }}</span>
                                    <span v-if="task.isImportant" class="important-badge">⚡ IMPORTANT</span>
                                </div>
                                <div class="task-timing">
                                    <span class="due-time">{{ formatDueTime(task.dateTimeDue) }}</span>
                                    <span class="time-until">{{ getTimeUntil(task.dateTimeDue) }}</span>
                                </div>
                            </div>
                            
                            <div class="task-details">
                                <div class="task-info">
                                    <div class="info-row">
                                        <span class="label">Agent:</span>
                                        <span class="value agent-name">{{ task.agentName }}</span>
                                    </div>
                                    <div class="info-row">
                                        <span class="label">Topic:</span>
                                        <span class="value">{{ task.topic }}</span>
                                    </div>
                                    <div class="info-row">
                                        <span class="label">Reason:</span>
                                        <span class="value reason">{{ task.reason }}</span>
                                    </div>
                                </div>
                                
                                <div class="task-metadata">
                                    <div class="metadata-item">
                                        <span class="meta-label">Task ID:</span>
                                        <span class="meta-value">{{ task.timeID }}</span>
                                    </div>
                                    <div class="metadata-item">
                                        <span class="meta-label">Set:</span>
                                        <span class="meta-value">{{ formatSetTime(task.dateTimeSet) }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- No Tasks State -->
                    <div v-else class="no-tasks">
                        <div class="no-tasks-icon">📭</div>
                        <div class="no-tasks-text">No scheduled tasks found</div>
                    </div>
                </div>
            </KMInfoBox>
        </KMInfoGrid>

        <!-- Agent Overview Section -->
        <div class="section-header">
            <h2 class="section-title">🔧 Agent Overview</h2>
            <p class="section-subtitle">Tasks grouped by bot agent</p>
        </div>
        
        <KMInfoGrid columns="3" rows="1" rowHeight="400">
            <KMInfoBox 
                v-for="agent in agentGroups" 
                :key="agent.name"
                :caption="agent.icon + ' ' + agent.name"
            >
                <div class="agent-overview">
                    <div class="agent-stats">
                        <div class="stat-item">
                            <span class="stat-value">{{ agent.taskCount }}</span>
                            <span class="stat-label">Total Tasks</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">{{ agent.importantCount }}</span>
                            <span class="stat-label">Important</span>
                        </div>
                    </div>
                    
                    <div class="agent-next-task" v-if="agent.nextTask">
                        <div class="next-task-label">Next Task:</div>
                        <div class="next-task-name">{{ agent.nextTask.taskName }}</div>
                        <div class="next-task-time">{{ formatDueTime(agent.nextTask.dateTimeDue) }}</div>
                    </div>
                    
                    <div class="agent-task-list">
                        <div 
                            v-for="task in agent.tasks.slice(0, 3)" 
                            :key="task.randomidentifier"
                            class="mini-task-item"
                            :class="{ 'important': task.isImportant }"
                        >
                            <span class="mini-task-name">{{ task.taskName }}</span>
                            <span class="mini-task-time">{{ getTimeUntil(task.dateTimeDue) }}</span>
                        </div>
                        <div v-if="agent.tasks.length > 3" class="more-tasks">
                            +{{ agent.tasks.length - 3 }} more tasks
                        </div>
                    </div>
                </div>
            </KMInfoBox>
        </KMInfoGrid>
    </div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
</script>

<script>
import { ref, computed, onMounted } from 'vue';
import CS2MetricCard from '~/components/CS2MetricCard.vue';
import KMInfoGrid from '~/components/KMInfoGrid.vue';
import KMInfoBox from '~/components/KMInfoBox.vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

export default {
    components: {
        CS2MetricCard,
        KMInfoGrid,
        KMInfoBox
    },
    data() {
        return {
            tasks: [],
            loading: true,
            error: null
        };
    },
    computed: {
        totalTasks() {
            return this.tasks.length;
        },
        importantTasks() {
            return this.tasks.filter(task => task.isImportant).length;
        },
        uniqueAgents() {
            return [...new Set(this.tasks.map(task => task.agentName))].length;
        },
        sortedTasks() {
            return [...this.tasks].sort((a, b) => new Date(a.dateTimeDue) - new Date(b.dateTimeDue));
        },
        nextTaskTime() {
            if (this.sortedTasks.length === 0) return 'No tasks';
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
                if (task.isImportant) {
                    groups[task.agentName].importantCount++;
                }
            });
            
            // Sort tasks within each group and set next task
            Object.values(groups).forEach(group => {
                group.tasks.sort((a, b) => new Date(a.dateTimeDue) - new Date(b.dateTimeDue));
                group.nextTask = group.tasks[0];
            });
            
            return Object.values(groups);
        }
    },
    methods: {
        async loadTasks() {
            this.loading = true;
            this.error = null;
            
            try {
                const response = await RequestGETFromKliveAPI('/timemanager/getalltasks');
                
                if (response.status === 200) {
                    const data = await response.json();
                    this.tasks = data || [];
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
        formatDueTime(dateString) {
            const date = new Date(dateString);
            return date.toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        },
        formatSetTime(dateString) {
            const date = new Date(dateString);
            return date.toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        },
        getTimeUntil(dateString) {
            const now = new Date();
            const due = new Date(dateString);
            const diff = due - now;
            
            if (diff < 0) return 'Overdue';
            
            const minutes = Math.floor(diff / (1000 * 60));
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
            
            if (days > 0) return `${days}d ${hours % 24}h`;
            if (hours > 0) return `${hours}h ${minutes % 60}m`;
            return `${minutes}m`;
        },
        isDueSoon(dateString) {
            const now = new Date();
            const due = new Date(dateString);
            const diff = due - now;
            return diff < 30 * 60 * 1000; // 30 minutes
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
        // Load tasks when component is mounted
        this.loadTasks();
    }
};
</script>

<style scoped>
.bot-schedule-page {
    padding: 20px 0;
}

.page-header {
    margin-bottom: 30px;
    text-align: left;
    padding: 0 20px;
}

.page-title {
    font-size: 2.2rem;
    font-weight: bold;
    color: #4d9e39;
    margin: 0 0 8px 0;
    display: flex;
    align-items: center;
    gap: 15px;
}

.page-subtitle {
    color: #969696;
    font-size: 1.1rem;
    margin: 0;
    line-height: 1.5;
}

.section-header {
    margin: 20px 0 15px 0;
}

.section-title {
    font-size: 1.6rem;
    font-weight: bold;
    color: #4d9e39;
    margin: 0 0 5px 0;
    display: flex;
    align-items: center;
    gap: 12px;
}

.section-subtitle {
    color: #999;
    font-size: 0.95rem;
    margin: 0;
    line-height: 1.4;
}

.task-container {
    max-height: 520px;
    overflow-y: auto;
    padding: 10px;
}

.task-item {
    background: linear-gradient(135deg, #2a2a2a 0%, #1e1e1e 100%);
    border: 2px solid #4d9e39;
    border-radius: 12px;
    margin-bottom: 16px;
    padding: 20px;
    transition: all 0.3s ease;
    position: relative;
}

.task-item:hover {
    border-color: #62ce47;
    box-shadow: 0 4px 15px rgba(77, 158, 57, 0.3);
    transform: translateY(-2px);
}

.task-item.important {
    border-color: #ffa500;
    background: linear-gradient(135deg, #2a2414 0%, #1e1a0e 100%);
}

.task-item.important:hover {
    border-color: #ffb82e;
    box-shadow: 0 4px 15px rgba(255, 165, 0, 0.3);
}

.task-item.due-soon {
    border-color: #ff4444;
    background: linear-gradient(135deg, #2a1414 0%, #1e0e0e 100%);
}

.task-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16px;
}

.task-title {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
}

.task-icon {
    font-size: 1.5rem;
}

.task-name {
    font-size: 1.25rem;
    font-weight: bold;
    color: #4d9e39;
}

.important-badge {
    background: linear-gradient(45deg, #ffa500, #ffb82e);
    color: #000;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.task-timing {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
}

.due-time {
    font-size: 1.1rem;
    font-weight: bold;
    color: #62ce47;
}

.time-until {
    font-size: 0.9rem;
    color: #999;
    background: rgba(77, 158, 57, 0.1);
    padding: 2px 8px;
    border-radius: 8px;
}

.task-details {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 20px;
}

.task-info {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.info-row {
    display: flex;
    gap: 8px;
}

.label {
    font-weight: bold;
    color: #999;
    min-width: 60px;
}

.value {
    color: #fff;
    flex: 1;
}

.agent-name {
    color: #4d9e39;
    font-weight: bold;
}

.reason {
    font-style: italic;
    color: #ccc;
}

.task-metadata {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.metadata-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.meta-label {
    font-size: 0.8rem;
    color: #666;
    text-transform: uppercase;
}

.meta-value {
    font-size: 0.9rem;
    color: #aaa;
    font-family: monospace;
}

.no-tasks {
    text-align: center;
    padding: 60px 20px;
    color: #666;
}

.no-tasks-icon {
    font-size: 4rem;
    margin-bottom: 16px;
}

.no-tasks-text {
    font-size: 1.2rem;
}

.loading-state, .error-state {
    text-align: center;
    padding: 60px 20px;
    color: #666;
}

.loading-icon, .error-icon {
    font-size: 4rem;
    margin-bottom: 16px;
}

.loading-text, .error-text {
    font-size: 1.2rem;
    margin-bottom: 20px;
}

.retry-button {
    background: #4d9e39;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.3s ease;
}

.retry-button:hover {
    background: #62ce47;
}

.agent-overview {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.agent-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 12px;
    background: rgba(77, 158, 57, 0.1);
    border-radius: 8px;
}

.stat-item {
    text-align: center;
}

.stat-value {
    display: block;
    font-size: 1.5rem;
    font-weight: bold;
    color: #4d9e39;
}

.stat-label {
    font-size: 0.9rem;
    color: #999;
}

.agent-next-task {
    padding: 12px;
    background: rgba(98, 206, 71, 0.1);
    border-radius: 8px;
    border-left: 4px solid #62ce47;
}

.next-task-label {
    font-size: 0.9rem;
    color: #999;
    margin-bottom: 4px;
}

.next-task-name {
    font-weight: bold;
    color: #62ce47;
    margin-bottom: 2px;
}

.next-task-time {
    font-size: 0.9rem;
    color: #ccc;
}

.agent-task-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mini-task-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    border-left: 3px solid #4d9e39;
}

.mini-task-item.important {
    border-left-color: #ffa500;
    background: rgba(255, 165, 0, 0.1);
}

.mini-task-name {
    font-size: 0.9rem;
    color: #fff;
}

.mini-task-time {
    font-size: 0.8rem;
    color: #999;
}

.more-tasks {
    text-align: center;
    padding: 8px;
    color: #666;
    font-size: 0.9rem;
    font-style: italic;
}

/* Scrollbar styling */
.task-container::-webkit-scrollbar {
    width: 8px;
}

.task-container::-webkit-scrollbar-track {
    background: #1a1a1a;
    border-radius: 4px;
}

.task-container::-webkit-scrollbar-thumb {
    background: #4d9e39;
    border-radius: 4px;
}

.task-container::-webkit-scrollbar-thumb:hover {
    background: #62ce47;
}
</style>