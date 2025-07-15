<template>
    <div class="quick-action-card" :class="variant" @click="handleClick">
        <div class="card-header">
            <div class="card-icon" v-if="icon">{{ icon }}</div>
            <div class="card-title">{{ title }}</div>
        </div>
        <div class="card-content">
            <div class="card-description">{{ description }}</div>
            <div class="card-value" v-if="value">{{ formattedValue }}</div>
        </div>
        <div class="card-action">
            <span class="action-text">{{ actionText }}</span>
            <span class="arrow">→</span>
        </div>
    </div>
</template>

<script>
export default {
    name: 'QuickActionCard',
    props: {
        title: {
            type: String,
            required: true
        },
        description: {
            type: String,
            required: true
        },
        icon: {
            type: String,
            default: ''
        },
        value: {
            type: [String, Number],
            default: null
        },
        format: {
            type: String,
            default: 'text',
            validator: value => ['text', 'number', 'percentage', 'currency', 'count'].includes(value)
        },
        actionText: {
            type: String,
            default: 'View Details'
        },
        variant: {
            type: String,
            default: 'default',
            validator: value => ['default', 'success', 'warning', 'danger', 'info'].includes(value)
        },
        to: {
            type: String,
            default: null
        },
        onClick: {
            type: Function,
            default: null
        }
    },
    computed: {
        formattedValue() {
            if (this.value === null || this.value === undefined) return '';
            
            switch (this.format) {
                case 'currency':
                    return `£${Number(this.value).toFixed(2)}`;
                case 'percentage':
                    return `${Number(this.value).toFixed(1)}%`;
                case 'count':
                    return Number(this.value).toLocaleString();
                case 'number':
                    return Number(this.value).toFixed(2);
                default:
                    return this.value.toString();
            }
        }
    },
    methods: {
        handleClick() {
            if (this.onClick) {
                this.onClick();
            } else if (this.to) {
                this.$router.push(this.to);
            }
        }
    }
}
</script>

<style scoped>
.quick-action-card {
    background: linear-gradient(135deg, #161616 0%, #201f20 100%);
    border: 1px solid rgba(77, 158, 57, 0.3);
    border-radius: 16px;
    padding: 14px;
    cursor: pointer;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
    height: 100%;
    min-height: 150px;
    max-height: 170px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

.quick-action-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, #4d9e39, #62ce47);
    opacity: 0;
    transition: opacity 0.3s ease;
}

.quick-action-card:hover {
    transform: translateY(-4px);
    border-color: rgba(77, 158, 57, 0.6);
    box-shadow: 0 8px 25px rgba(77, 158, 57, 0.2);
}

.quick-action-card:hover::before {
    opacity: 1;
}

.quick-action-card.success {
    border-color: rgba(34, 197, 94, 0.3);
}

.quick-action-card.success::before {
    background: linear-gradient(90deg, #22c55e, #16a34a);
}

.quick-action-card.warning {
    border-color: rgba(251, 191, 36, 0.3);
}

.quick-action-card.warning::before {
    background: linear-gradient(90deg, #fbbf24, #f59e0b);
}

.quick-action-card.danger {
    border-color: rgba(239, 68, 68, 0.3);
}

.quick-action-card.danger::before {
    background: linear-gradient(90deg, #ef4444, #dc2626);
}

.quick-action-card.info {
    border-color: rgba(59, 130, 246, 0.3);
}

.quick-action-card.info::before {
    background: linear-gradient(90deg, #3b82f6, #2563eb);
}

.card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}

.card-icon {
    font-size: 1.2rem;
    width: 30px;
    height: 30px;
    background: rgba(77, 158, 57, 0.1);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(77, 158, 57, 0.2);
    flex-shrink: 0;
}

.card-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: #ffffff;
    flex: 1;
    line-height: 1.2;
}

.card-content {
    flex: 1;
    margin-bottom: 10px;
    min-height: 0;
}

.card-description {
    color: #969696;
    font-size: 0.8rem;
    line-height: 1.3;
    margin-bottom: 5px;
}

.card-value {
    font-size: 1.4rem;
    font-weight: bold;
    color: #4d9e39;
    margin-top: 3px;
    line-height: 1.1;
}

.card-action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 6px;
    border-top: 1px solid rgba(77, 158, 57, 0.2);
    margin-top: auto;
}

.action-text {
    color: #4d9e39;
    font-size: 0.8rem;
    font-weight: 500;
}

.arrow {
    color: #4d9e39;
    font-size: 1.1rem;
    transition: transform 0.3s ease;
}

.quick-action-card:hover .arrow {
    transform: translateX(4px);
}

/* Variant-specific value colors */
.quick-action-card.success .card-value {
    color: #22c55e;
}

.quick-action-card.warning .card-value {
    color: #fbbf24;
}

.quick-action-card.danger .card-value {
    color: #ef4444;
}

.quick-action-card.info .card-value {
    color: #3b82f6;
}

/* Variant-specific action colors */
.quick-action-card.success .action-text,
.quick-action-card.success .arrow {
    color: #22c55e;
}

.quick-action-card.warning .action-text,
.quick-action-card.warning .arrow {
    color: #fbbf24;
}

.quick-action-card.danger .action-text,
.quick-action-card.danger .arrow {
    color: #ef4444;
}

.quick-action-card.info .action-text,
.quick-action-card.info .arrow {
    color: #3b82f6;
}

/* Active state */
.quick-action-card:active {
    transform: translateY(-2px);
}

/* Accessibility */
.quick-action-card:focus {
    outline: 2px solid #4d9e39;
    outline-offset: 2px;
}

@media (max-width: 768px) {
    .quick-action-card {
        padding: 14px;
        min-height: 120px;
    }
    
    .card-icon {
        width: 28px;
        height: 28px;
        font-size: 1.1rem;
    }
    
    .card-title {
        font-size: 0.9rem;
    }
    
    .card-value {
        font-size: 1.3rem;
    }
    
    .card-description {
        font-size: 0.8rem;
    }
    
    .action-text {
        font-size: 0.8rem;
    }
}
</style>
