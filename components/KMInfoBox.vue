<template>
    <div class="infobox">
        <slot/>
    </div>
</template>

<script>
export default{
    name: "KMInfoBox",
    props: {
        horizontalGrids: {
            type: Number,
        }
    }
}
</script>
