<template>
    <div class="gradient-progress">
        <div class="caption" style="z-index: 50;">{{ caption }}</div>
        <slot/>
        <div class="progress-bar" :style="{ height: (100-progress) + '%' }">
        </div>
        <div style="display: flex; justify-content: center; margin-top: 80%;">
            <div class="progress-text" style="font-size: larger; position: absolute;">{{ progress }}%</div>
        </div>
    </div>
</template>

<script>
export default {
    name: 'GradientProgress',
    props: {
        progress: {
            type: Number,
            required: true,
            validator: value => value >= 0 && value <= 100
        },
        caption: {
            type: String,
            required: false,
            default: ''
        }
    }
}
</script>

<style scoped>
.gradient-progress {
    width: 100%;
    height: 100%;
    
    background: linear-gradient(to top, #4d9e39, #62ce47);
    border-radius: 10px;
    overflow: hidden;
    position: relative;
}

.caption {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    color: rgb(235, 235, 235);
    font-weight: bold;
}

.progress-bar {
    position: absolute;
    width: 100%;
    background-color: rgba(32, 31, 32, 0.5);
    transition: height 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.progress-text {
    color: white;
    font-weight: bold;
}
</style>