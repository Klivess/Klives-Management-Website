<template>
    <div ref="infoGrid" style="display: grid; gap: 10px; margin-bottom: 10px;">
        <slot/>
    </div>
</template>

<script>

export default{
    name: "KMInfoBox",
    props:{
        columns: {
            type: Number,
            default: 1
        },
        rows: {
            type: Number,
            default: 1
        },
    },
    methods: {
        updateGrid(){
            alert("thiranya");
        },
        updateComponent() {
            console.log(`Number of children: ${this.$children.length}`);
            // Additional logic to adjust the component based on the number of children
        }
    },
    setup(props, context){
    },
    mounted() {
        let x = (99 / this.columns);
        //Form string to put in grid template columns, there must be x columns.
        let gridTemplateColumns = "";
        for(let i = 0; i < this.columns; i++){
            gridTemplateColumns += `${x}% `;
        }
        console.log(gridTemplateColumns);
        //Form string to put in grid template rows, there must be x rows of 225px
        let gridTemplateRows = "";
        for(let i = 0; i < this.rows; i++){
            gridTemplateRows += "260px ";
        }
        console.log(gridTemplateRows);

        this.$refs.infoGrid.style.gridTemplateRows = gridTemplateRows;
        this.$refs.infoGrid.style.gridTemplateColumns = gridTemplateColumns;
    },
    beforeDestroy() {

    }
}
</script>