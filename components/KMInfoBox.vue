<template>
    <div class="infobox">
        <div v-if="caption" class="caption">{{ caption }}</div>
        <div style="padding: 10px;">
            <slot/>
        </div>
    </div>
</template>

<script>
export default {
    name: "KMInfoBox",
    props: {
        caption: {
            type: String,
            default: ''
        },
    }
}
</script>

<style scoped>

.caption {
    position: absolute;
    top: 0;
    left: 0;
    padding: 5px;
    font-weight: bold;
}
</style>
