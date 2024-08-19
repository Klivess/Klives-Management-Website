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

        }
    },
    mounted(){
        this.$children.forEach((child) => {
        console.log(child.$options.name); // Get the name of the child component
        console.log(child.someProp); // Access a specific property of the child
      });
    },
}
</script>