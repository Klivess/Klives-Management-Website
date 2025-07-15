<template>
    <div class="log-filters">
        <div class="filter-row">
            <div class="search-container">
                <KMInputBox 
                    :value="searchTerm" 
                    @update:value="$emit('update:searchTerm', $event)"
                    placeholder="Search logs by message, service, or ID..."
                    type="text"
                />
            </div>
            <div class="filter-group">
                <KMSelectBox 
                    :selected="selectedService" 
                    @update:selected="$emit('update:selectedService', $event)"
                    :options="serviceOptions"
                />
            </div>
            <div class="filter-group">
                <KMSelectBox 
                    :selected="selectedType" 
                    @update:selected="$emit('update:selectedType', $event)"
                    :options="typeOptions"
                />
            </div>
            <div class="filter-group">
                <div class="errors-only-button" @click="$emit('toggle:errorsOnly')">
                    <KMButton 
                        :message="showErrorsOnly ? 'Show All' : 'Errors Only'"
                        :textColor="showErrorsOnly ? '#e74c3c' : '#4d9e39'"
                    />
                </div>
            </div>
        </div>
        <div class="results-info">
            <span>Showing {{ filteredCount }} of {{ totalCount }} logs</span>
            <span v-if="errorCount > 0" class="error-count">{{ errorCount }} errors</span>
        </div>
    </div>
</template>

<script>
export default {
    name: 'KMLogFilters',
    props: {
        searchTerm: {
            type: String,
            default: ''
        },
        selectedService: {
            type: String,
            default: ''
        },
        selectedType: {
            type: String,
            default: ''
        },
        showErrorsOnly: {
            type: Boolean,
            default: false
        },
        serviceOptions: {
            type: Array,
            required: true
        },
        typeOptions: {
            type: Array,
            required: true
        },
        filteredCount: {
            type: Number,
            required: true
        },
        totalCount: {
            type: Number,
            required: true
        },
        errorCount: {
            type: Number,
            required: true
        }
    },
    emits: ['update:searchTerm', 'update:selectedService', 'update:selectedType', 'toggle:errorsOnly']
}
</script>

<style scoped>
.log-filters {
    margin-bottom: 20px;
}

.filter-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    gap: 15px;
    margin-bottom: 15px;
    align-items: center;
}

.search-container {
    width: 100%;
}

.filter-group {
    width: 100%;
    height: 40px;
}

.errors-only-button {
    width: 100%;
    height: 100%;
    cursor: pointer;
}

.results-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #969696;
    font-size: 14px;
    padding: 10px 0;
}

.error-count {
    color: #e74c3c;
    font-weight: bold;
}

@media (max-width: 768px) {
    .filter-row {
        grid-template-columns: 1fr;
        gap: 10px;
    }
    
    .results-info {
        flex-direction: column;
        align-items: flex-start;
        gap: 5px;
    }
}
</style>
