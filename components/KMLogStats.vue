<template>
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-number">{{ totalLogs }}</div>
            <div class="stat-label">Total Logs</div>
        </div>
        <div class="stat-card error">
            <div class="stat-number">{{ errorCount }}</div>
            <div class="stat-label">Errors</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">{{ serviceCount }}</div>
            <div class="stat-label">Services</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">{{ filteredCount }}</div>
            <div class="stat-label">Filtered</div>
        </div>
    </div>
</template>

<script>
export default {
    name: 'KMLogStats',
    props: {
        totalLogs: {
            type: Number,
            required: true
        },
        errorCount: {
            type: Number,
            required: true
        },
        serviceCount: {
            type: Number,
            required: true
        },
        filteredCount: {
            type: Number,
            required: true
        }
    }
}
</script>

<style scoped>
.stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 15px;
    margin-bottom: 20px;
}

.stat-card {
    background-color: #201f20;
    border-radius: 12px;
    padding: 20px;
    text-align: center;
    transition: transform 0.3s ease;
    border: 1px solid #333;
}

.stat-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 4px 12px rgba(77, 158, 57, 0.2);
}

.stat-card.error {
    border-left: 4px solid #e74c3c;
}

.stat-number {
    font-size: 2rem;
    font-weight: bold;
    color: #4d9e39;
    margin-bottom: 5px;
}

.stat-card.error .stat-number {
    color: #e74c3c;
}

.stat-label {
    color: #969696;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 1px;
}

@media (max-width: 768px) {
    .stats-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

@media (max-width: 480px) {
    .stats-grid {
        grid-template-columns: 1fr;
    }
}
</style>
