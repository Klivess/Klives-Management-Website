<template>
    <div class="overview-section">
        <div class="overview-header">
            <h2 class="section-title">{{ title }}</h2>
            <p class="section-subtitle" v-if="subtitle">{{ subtitle }}</p>
        </div>
        <div class="overview-content">
            <slot />
        </div>
    </div>
</template>

<script>
export default {
    name: 'CS2OverviewSection',
    props: {
        title: {
            type: String,
            required: true
        },
        subtitle: {
            type: String,
            default: ''
        }
    }
}
</script>

<style scoped>
.overview-section {
    margin-bottom: 32px;
}

.overview-header {
    margin-bottom: 20px;
}

.section-title {
    font-size: 1.75rem;
    font-weight: bold;
    color: #4d9e39;
    margin: 0 0 8px 0;
    display: flex;
    align-items: center;
    gap: 12px;
}

.section-title::before {
    content: '';
    width: 4px;
    height: 24px;
    background: linear-gradient(135deg, #4d9e39, #62ce47);
    border-radius: 2px;
}

.section-subtitle {
    color: #969696;
    font-size: 1rem;
    margin: 0;
    line-height: 1.5;
}

.overview-content {
    width: 100%;
}
</style>
