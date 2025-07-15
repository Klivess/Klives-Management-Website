<template>
    <div class="gain-distribution-bar">
        <div class="bar-header">
            <span class="bar-label">{{ label }}</span>
            <span class="bar-count">{{ count.toLocaleString() }} listings</span>
        </div>
        <div class="bar-container">
            <div 
                class="bar-fill" 
                :class="barClass"
                :style="{ width: `${percentage}%` }"
            ></div>
        </div>
        <div class="bar-details">
            <span class="percentage-text">{{ percentage.toFixed(1) }}%</span>
            <span class="mean-price">Avg: £{{ meanPrice.toFixed(2) }}</span>
        </div>
    </div>
</template>

<script>
export default {
    name: 'CS2GainDistributionBar',
    props: {
        label: {
            type: String,
            required: true
        },
        count: {
            type: Number,
            required: true
        },
        meanPrice: {
            type: Number,
            required: true
        },
        total: {
            type: Number,
            required: true
        },
        gainType: {
            type: String,
            default: 'neutral',
            validator: value => ['negative', 'low', 'medium', 'high', 'excellent'].includes(value)
        }
    },
    computed: {
        percentage() {
            return this.total > 0 ? (this.count / this.total) * 100 : 0;
        },
        barClass() {
            return `bar-${this.gainType}`;
        }
    }
}
</script>

<style scoped>
.gain-distribution-bar {
    background-color: #161616;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 12px;
    border: 1px solid rgba(77, 158, 57, 0.2);
    transition: all 0.3s ease;
}

.gain-distribution-bar:hover {
    border-color: #4d9e39;
    transform: translateX(4px);
    box-shadow: 0 4px 15px rgba(77, 158, 57, 0.1);
}

.bar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.bar-label {
    font-weight: bold;
    color: #ffffff;
    font-size: 0.95rem;
}

.bar-count {
    color: #969696;
    font-size: 0.85rem;
}

.bar-container {
    height: 8px;
    background-color: rgba(77, 158, 57, 0.1);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
}

.bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.8s ease;
}

.bar-negative {
    background: linear-gradient(90deg, #e74c3c, #c0392b);
}

.bar-low {
    background: linear-gradient(90deg, #f39c12, #e67e22);
}

.bar-medium {
    background: linear-gradient(90deg, #4d9e39, #62ce47);
}

.bar-high {
    background: linear-gradient(90deg, #4d9e39, #62ce47);
}

.bar-excellent {
    background: linear-gradient(90deg, #62ce47, #4d9e39);
}

.bar-details {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.percentage-text {
    font-weight: bold;
    color: #4d9e39;
}

.mean-price {
    color: #969696;
    font-size: 0.85rem;
}
</style>
