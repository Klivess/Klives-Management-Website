<template>
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(50px, 625px)); grid-template-rows: repeat(auto-fill, minmax(50px, 225px)); gap: 10px;">
        <slot/>
    </div>
</template>

<script>

export default{
    name: "KMInfoBox",
    props:{
        
    },
    methods: {
        updateGrid(){

        },
        updateComponent() {
            console.log(`Number of children: ${this.$children.length}`);
            // Additional logic to adjust the component based on the number of children
        }
    },
    setup(props, context){
    },
    beforeDestroy() {

    }
}
</script>