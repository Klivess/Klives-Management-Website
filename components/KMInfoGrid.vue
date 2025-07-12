<template>
    <div ref="infoGrid" style="display: grid; gap: 10px; padding-bottom: 10px; margin-bottom: 5px; height: auto; width: 100%; overflow-x: hidden; overflow-y: hidden">
        <slot/>
    </div>
</template>

<script>

export default{
    name: "KMInfoBox",
    props:{
        columns: {
            type: String,
            default: 1
        },
        rows: {
            type: String,
            default: 1
        },
        rowHeight: {
            type: String,
            default: 260
        },
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
            gridTemplateRows += this.rowHeight.toString()+"px ";
        }
        console.log(gridTemplateRows);

        this.$refs.infoGrid.style.gridTemplateRows = gridTemplateRows;
        this.$refs.infoGrid.style.gridTemplateColumns = gridTemplateColumns;
    },
    beforeDestroy() {

    }
}
</script>