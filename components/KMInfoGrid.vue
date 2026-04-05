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
            type: [String, Number],
            default: "1"
        },
        rows: {
            type: [String, Number],
            default: "1"
        },
        rowHeight: {
            type: [String, Number],
            default: "260"
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
        // Use fr units instead of percentages to avoid overflow issues with gaps
        let gridTemplateColumns = "";
        for(let i = 0; i < Number(this.columns); i++){
            gridTemplateColumns += "1fr ";
        }
        console.log(gridTemplateColumns);
        // Allow numeric row heights (px) and direct CSS values such as auto, minmax(...), etc.
        const rowHeightValue = this.rowHeight.toString().trim();
        const normalizedRowHeight = /^-?\d+(\.\d+)?$/.test(rowHeightValue)
            ? `${rowHeightValue}px`
            : rowHeightValue;

        // Form string to put in grid template rows
        let gridTemplateRows = "";
        for(let i = 0; i < Number(this.rows); i++){
            gridTemplateRows += normalizedRowHeight + " ";
        }
        console.log(gridTemplateRows);

        this.$refs.infoGrid.style.gridTemplateRows = gridTemplateRows;
        this.$refs.infoGrid.style.gridTemplateColumns = gridTemplateColumns;
    },
    beforeDestroy() {

    }
}
</script>