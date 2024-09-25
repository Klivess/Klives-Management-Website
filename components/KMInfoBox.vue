<template>
    <div class="infobox">
    </div>
</template>

<script>
export default{
    name: "KMInfoBox",
    props: {
        horizontalGrids: {
            type: Number,
        }
    },
    mounted(){
        console.log(this.horizontalGrids);
    }
}
</script>
