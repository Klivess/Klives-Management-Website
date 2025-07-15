<template>
    <div class="metric-card" :class="[variant, { 'highlight': highlight }]">
        <div class="metric-icon" v-if="icon">
            {{ icon }}
        </div>
        <div class="metric-content">
            <div class="metric-value">{{ formattedValue }}</div>
            <div class="metric-label">{{ label }}</div>
            <div class="metric-subtitle" v-if="subtitle">{{ subtitle }}</div>
        </div>
        <div class="metric-trend" v-if="trend">
            <span :class="trendClass">{{ trend }}</span>
        </div>
    </div>
</template>

<script>
export default {
    name: 'CS2MetricCard',
    props: {
        value: {
            type: [Number, String],
            required: true
        },
        label: {
            type: String,
            required: true
        },
        subtitle: {
            type: String,
            default: ''
        },
        icon: {
            type: String,
            default: ''
        },
        variant: {
            type: String,
            default: 'default',
            validator: value => ['default', 'success', 'warning', 'danger', 'info'].includes(value)
        },
        format: {
            type: String,
            default: 'number',
            validator: value => ['number', 'currency', 'percentage', 'gain-percentage', 'date', 'count'].includes(value)
        },
        highlight: {
            type: Boolean,
            default: false
        },
        trend: {
            type: String,
            default: ''
        },
        trendDirection: {
            type: String,
            default: 'neutral',
            validator: value => ['up', 'down', 'neutral'].includes(value)
        }
    },
    computed: {
        formattedValue() {
            if (this.value === null || this.value === undefined) return '--';
            
            switch (this.format) {
                case 'currency':
                    return `£${Number(this.value).toFixed(2)}`;
                case 'percentage':
                    return `${Number(this.value).toFixed(2)}%`;
                case 'gain-percentage':
                    // Convert multiplier to percentage (1.5 becomes 50%)
                    const gainPercent = (Number(this.value) - 1) * 100;
                    return `${gainPercent.toFixed(2)}%`;
                case 'date':
                    return new Date(this.value).toLocaleDateString();
                case 'count':
                    return Number(this.value).toLocaleString();
                default:
                    return typeof this.value === 'number' ? this.value.toFixed(2) : this.value;
            }
        },
        trendClass() {
            return {
                'trend-up': this.trendDirection === 'up',
                'trend-down': this.trendDirection === 'down',
                'trend-neutral': this.trendDirection === 'neutral'
            };
        }
    }
}
</script>

<style scoped>
.metric-card {
    background: linear-gradient(135deg, #161616 0%, #201f20 100%);
    border-radius: 16px;
    padding: 24px;
    border: 1px solid rgba(77, 158, 57, 0.2);
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
    height: 70%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    backdrop-filter: blur(10px);
    margin: 5px;
}

.metric-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 32px rgba(77, 158, 57, 0.2);
    border-color: #4d9e39;
}

.metric-card.highlight {
    border: 2px solid #4d9e39;
    box-shadow: 0 4px 20px rgba(77, 158, 57, 0.3);
    background: linear-gradient(135deg, rgba(77, 158, 57, 0.1), rgba(98, 206, 71, 0.1));
}

.metric-card.success {
    border-left: 4px solid #4d9e39;
    background: linear-gradient(135deg, rgba(77, 158, 57, 0.05), rgba(98, 206, 71, 0.05));
}

.metric-card.warning {
    border-left: 4px solid #f39c12;
    background: linear-gradient(135deg, rgba(243, 156, 18, 0.05), rgba(230, 126, 34, 0.05));
}

.metric-card.danger {
    border-left: 4px solid #e74c3c;
    background: linear-gradient(135deg, rgba(231, 76, 60, 0.05), rgba(192, 57, 43, 0.05));
}

.metric-card.info {
    border-left: 4px solid #4d9e39;
    background: linear-gradient(135deg, rgba(77, 158, 57, 0.05), rgba(98, 206, 71, 0.05));
}

.metric-icon {
    font-size: 2rem;
    margin-bottom: 12px;
    text-align: center;
}

.metric-content {
    text-align: center;
}

.metric-value {
    font-size: 2.5rem;
    font-weight: bold;
    color: #4d9e39;
    margin-bottom: 8px;
    line-height: 1.2;
    word-break: break-word;
}

.metric-card.warning .metric-value {
    color: #f39c12;
}

.metric-card.danger .metric-value {
    color: #e74c3c;
}

.metric-card.info .metric-value {
    color: #4d9e39;
}

.metric-card.success .metric-value {
    color: #4d9e39;
}

.metric-label {
    font-size: 1rem;
    color: #ffffff;
    font-weight: 600;
    margin-bottom: 4px;
}

.metric-subtitle {
    font-size: 0.85rem;
    color: #969696;
    line-height: 1.3;
}

.metric-trend {
    position: absolute;
    top: 16px;
    right: 16px;
    font-size: 0.8rem;
    font-weight: bold;
}

.trend-up {
    color: #4d9e39;
}

.trend-down {
    color: #e74c3c;
}

.trend-neutral {
    color: #969696;
}

/* Responsive adjustments */
@media (max-width: 768px) {
    .metric-card {
        padding: 16px;
    }
    
    .metric-value {
        font-size: 2rem;
    }
    
    .metric-label {
        font-size: 0.9rem;
    }
}
</style>
