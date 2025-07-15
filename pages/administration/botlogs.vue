<template>
    <div class="botlogs-container">
        <!-- Header with back button -->
        <div class="page-header">
            <div class="header-left">
                <NuxtLink to="/admin" class="back-button">
                    <div class="back-button-wrapper">
                        <KMButton message="← Back to Admin" style="width: 400px;" textColor="#4d9e39"/>
                    </div>
                </NuxtLink>
            </div>
            <div class="header-center">
                <h1>Bot Logs</h1>
                <p class="subtitle">Monitor bot activities and system events</p>
            </div>
            <div class="header-right">
                <div class="refresh-controls">
                    <div class="manual-refresh-button" @click="loadLogs">
                        <KMButton
                            :message="loading ? '⏳ Loading...' : '🔄 Refresh'"
                            :textColor="loading ? '#969696' : '#4d9e39'"
                        />
                    </div>
                </div>
            </div>
        </div>

        <!-- Main content grid -->
        <KMInfoGrid columns="1" rows="1" rowHeight="300">
            <!-- Filters and stats -->
            <KMInfoBox caption="Log Filters & Statistics">
                <KMLogStats
                    :totalLogs="logs.length"
                    :errorCount="errorLogs.length"
                    :serviceCount="uniqueServices.length - 1"
                    :filteredCount="filteredLogs.length"
                />
                
                <KMLogFilters
                    :searchTerm="searchTerm"
                    @update:searchTerm="searchTerm = $event"
                    :selectedService="selectedService"
                    @update:selectedService="selectedService = $event"
                    :selectedType="selectedType"
                    @update:selectedType="selectedType = $event"
                    :showErrorsOnly="showErrorsOnly"
                    @toggle:errorsOnly="showErrorsOnly = !showErrorsOnly"
                    :serviceOptions="serviceOptions"
                    :typeOptions="typeOptions"
                    :filteredCount="filteredLogs.length"
                    :totalCount="logs.length"
                    :errorCount="errorLogs.length"
                />
            </KMInfoBox>
        </KMInfoGrid>

        <!-- Logs display - Taller section -->
        <KMInfoGrid columns="1" rows="1" rowHeight="700">
            <KMInfoBox caption="Log Entries">
                <div class="logs-container">
                    <div v-if="loading" class="loading-state">
                        <GradientProgress />
                        <p>Loading logs...</p>
                    </div>
                    
                    <div v-else-if="apiError" class="error-state">
                        <div class="error-icon">⚠️</div>
                        <h3>Failed to Load Logs</h3>
                        <p>{{ errorMessage }}</p>
                        <div class="retry-button" @click="loadLogs">
                            <KMButton 
                                message="Retry Loading" 
                                textColor="#4d9e39"
                            />
                        </div>
                    </div>
                    
                    <div v-else-if="filteredLogs.length === 0" class="empty-state">
                        <p>No logs match your current filters.</p>
                        <div class="clear-filters-button" @click="clearFilters">
                            <KMButton 
                                message="Clear Filters" 
                                textColor="#4d9e39"
                            />
                        </div>
                    </div>
                    
                    <div v-else class="logs-list">
                        <KMLogEntry 
                            v-for="log in paginatedLogs" 
                            :key="log.logID" 
                            :log="log"
                        />
                        
                        <!-- Pagination -->
                        <div class="pagination-controls" v-if="totalPages > 1">
                            <div class="pagination-button" @click="previousPage">
                                <KMButton style="width: 200px;"
                                    message="Previous"
                                    :textColor="currentPage > 1 ? '#4d9e39' : '#969696'"
                                />
                            </div>
                            <span class="page-info">
                                Page {{ currentPage }} of {{ totalPages }}
                            </span>
                            <div class="pagination-button" @click="nextPage">
                                <KMButton 
                                    message="Next"
                                    :textColor="currentPage < totalPages ? '#4d9e39' : '#969696'"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </KMInfoBox>
        </KMInfoGrid>
    </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface'

definePageMeta({ layout: 'navbar' });

export default {
    name: 'BotLogs',
    setup() {
        // Reactive data
        const logs = ref([]);
        const loading = ref(true);
        const searchTerm = ref('');
        const selectedService = ref('All Services');
        const selectedType = ref('All Types');
        const showErrorsOnly = ref(false);
        const currentPage = ref(1);
        const logsPerPage = 20;
        const apiError = ref(false);
        const errorMessage = ref('');
        let refreshInterval = null;

        // Computed properties
        const uniqueServices = computed(() => {
            const services = [...new Set(logs.value.map(log => log.serviceName))];
            return ['All Services', ...services];
        });

        const typeOptions = computed(() => {
            return ['All Types', 'INFO', 'ERROR'];
        });

        const errorLogs = computed(() => {
            return logs.value.filter(log => log.type === 1);
        });

        const filteredLogs = computed(() => {
            let filtered = logs.value;

            // Filter by search term
            if (searchTerm.value) {
                const search = searchTerm.value.toLowerCase();
                filtered = filtered.filter(log => 
                    log.message.toLowerCase().includes(search) ||
                    log.serviceName.toLowerCase().includes(search) ||
                    log.logID.includes(search)
                );
            }

            // Filter by service
            if (selectedService.value && selectedService.value !== 'All Services') {
                filtered = filtered.filter(log => log.serviceName === selectedService.value);
            }

            // Filter by type
            if (selectedType.value && selectedType.value !== 'All Types') {
                const typeMap = { 'INFO': 0, 'ERROR': 1 };
                filtered = filtered.filter(log => log.type === typeMap[selectedType.value]);
            }

            // Filter errors only
            if (showErrorsOnly.value) {
                filtered = filtered.filter(log => log.type === 1);
            }

            // Sort by position (newest first)
            return filtered.sort((a, b) => b.position - a.position);
        });

        const totalPages = computed(() => {
            return Math.ceil(filteredLogs.value.length / logsPerPage);
        });

        const paginatedLogs = computed(() => {
            const start = (currentPage.value - 1) * logsPerPage;
            const end = start + logsPerPage;
            return filteredLogs.value.slice(start, end);
        });

        const serviceOptions = computed(() => {
            return uniqueServices.value;
        });

        // Methods
        const loadLogs = async () => {
            // Only run on client side
            if (!process.client) {
                return;
            }
            
            loading.value = true;
            apiError.value = false;
            errorMessage.value = '';
            
            try {
                console.log('Fetching logs from API...');
                const response = await RequestGETFromKliveAPI('/api/logs', false, false);
                
                if (response.ok) {
                    const jsonData = await response.json();
                    
                    // Check if the response is an array (list of logs)
                    if (Array.isArray(jsonData)) {
                        logs.value = jsonData;
                        console.log(`Successfully loaded ${jsonData.length} logs from API`);
                    } else {
                        console.error('API response is not an array:', jsonData);
                        errorMessage.value = 'Invalid data format received from API';
                        apiError.value = true;
                        logs.value = [];
                    }
                } else {
                    console.error('Failed to fetch logs. Status:', response.status);
                    
                    if (response.status === 401) {
                        errorMessage.value = 'Unauthorized access. Please check your permissions.';
                    } else if (response.status === 404) {
                        errorMessage.value = 'Logs endpoint not found. Please contact administrator.';
                    } else {
                        errorMessage.value = `Failed to load logs. Server responded with status ${response.status}`;
                    }
                    
                    apiError.value = true;
                    logs.value = [];
                }
            } catch (error) {
                console.error('Error loading logs:', error);
                errorMessage.value = `Network error: ${error.message || 'Unable to connect to API'}`;
                apiError.value = true;
                logs.value = [];
            } finally {
                loading.value = false;
            }
        };

        const clearFilters = () => {
            searchTerm.value = '';
            selectedService.value = 'All Services';
            selectedType.value = 'All Types';
            showErrorsOnly.value = false;
            currentPage.value = 1;
        };

        const nextPage = () => {
            if (currentPage.value < totalPages.value) {
                currentPage.value++;
            }
        };

        const previousPage = () => {
            if (currentPage.value > 1) {
                currentPage.value--;
            }
        };

        // Lifecycle
        onMounted(() => {
            // Only load logs if we're in the browser
            if (process.client) {
                loadLogs();
            }
        });

        onUnmounted(() => {
            if (refreshInterval) {
                clearInterval(refreshInterval);
            }
        });

        return {
            logs,
            loading,
            searchTerm,
            selectedService,
            selectedType,
            showErrorsOnly,
            currentPage,
            filteredLogs,
            paginatedLogs,
            uniqueServices,
            serviceOptions,
            typeOptions,
            errorLogs,
            totalPages,
            apiError,
            errorMessage,
            loadLogs,
            clearFilters,
            nextPage,
            previousPage
        };
    }
}
</script>

<style scoped>
.botlogs-container {
    padding: 20px;
}

.page-header {
    display: grid;
    grid-template-columns: 1fr 2fr 1fr;
    align-items: center;
    margin-bottom: 30px;
    gap: 20px;
}

.header-left {
    justify-self: start;
}

.header-left {
    width: 150px;
    height: 40px;
}

.header-right {
    justify-self: end;
    width: 200px;
    height: 40px;
}

.refresh-controls {
    display: flex;
    gap: 10px;
    width: 100%;
    height: 100%;
}

.manual-refresh-button {
    flex: 1;
    height: 100%;
    cursor: pointer;
}

.header-center {
    text-align: center;
}

.header-center h1 {
    color: #4d9e39;
    font-size: 2.5rem;
    margin: 0;
    font-weight: bold;
}

.subtitle {
    color: #969696;
    margin: 5px 0 0 0;
    font-size: 1.1rem;
}

.back-button {
    text-decoration: none;
}

.back-button-wrapper {
    width: 100%;
    height: 100%;
}

.refresh-button {
    width: 100%;
    height: 100%;
    cursor: pointer;
}

.clear-filters-button {
    width: 150px;
    height: 40px;
    margin: 0 auto;
    cursor: pointer;
}

.logs-container {
    min-height: 400px;
}

.loading-state {
    text-align: center;
    padding: 50px 20px;
}

.loading-state p {
    margin-top: 20px;
    color: #969696;
}

.empty-state {
    text-align: center;
    padding: 50px 20px;
}

.empty-state p {
    color: #969696;
    margin-bottom: 20px;
    font-size: 1.1rem;
}

.error-state {
    text-align: center;
    padding: 50px 20px;
}

.error-state .error-icon {
    font-size: 3rem;
    margin-bottom: 20px;
}

.error-state h3 {
    color: #e74c3c;
    margin-bottom: 15px;
    font-size: 1.5rem;
}

.error-state p {
    color: #969696;
    margin-bottom: 25px;
    font-size: 1.1rem;
    max-width: 500px;
    margin-left: auto;
    margin-right: auto;
}

.retry-button {
    width: 150px;
    height: 40px;
    margin: 0 auto;
    cursor: pointer;
}

.logs-list {
    max-height: 600px;
    overflow-y: auto;
    padding-right: 10px;
}

.pagination-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 20px;
    padding: 20px 0;
    border-top: 1px solid #333;
}

.pagination-controls > div {
    width: 100px;
    height: 40px;
}

.pagination-button {
    width: 100px;
    height: 40px;
    cursor: pointer;
}

.page-info {
    color: #969696;
    font-weight: bold;
}

@media (max-width: 768px) {
    .page-header {
        grid-template-columns: 1fr;
        text-align: center;
        gap: 15px;
    }
    
    .header-left,
    .header-right {
        justify-self: center;
    }
    
    .pagination-controls {
        flex-direction: column;
        gap: 15px;
    }
}

@media (max-width: 480px) {
    .header-center h1 {
        font-size: 2rem;
    }
}
</style>