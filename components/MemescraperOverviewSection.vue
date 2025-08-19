<template>
    <div class="memescraper-overview-section">
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
    name: 'MemescraperOverviewSection',
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
.memescraper-overview-section {
    background-color: #161616;
    border-radius: 20px;
    padding: 2rem;
    margin-bottom: 2rem;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(77, 158, 57, 0.2);
    transition: all 0.3s ease;
}

.memescraper-overview-section:hover {
    border-color: rgba(77, 158, 57, 0.4);
    transform: translateY(-2px);
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
    font-size: 1rem;
    color: #969696;
    margin: 0;
    font-weight: 400;
    line-height: 1.5;
}

.overview-content {
    animation: fadeInUp 0.6s ease-out;
}

@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Responsive design */
@media (max-width: 768px) {
    .memescraper-overview-section {
        padding: 1.5rem;
        margin-bottom: 1.5rem;
    }
    
    .section-title {
        font-size: 1.5rem;
    }
    
    .section-subtitle {
        font-size: 0.9rem;
    }
}

@media (max-width: 480px) {
    .memescraper-overview-section {
        padding: 1rem;
        margin-bottom: 1rem;
    }
    
    .section-title {
        font-size: 1.3rem;
    }
}
</style>
