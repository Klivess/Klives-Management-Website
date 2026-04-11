<template>
    <div class="empty-layout">
        <slot />
    </div>
</template>

<script>
export default{
    name: "empty"
};
</script>

<style scoped>
.empty-layout {
    min-height: 100vh;
}
</style>