<template>
                <div style="display: grid; grid-template-rows: 1fr 2fr; background-color: #161516; border-radius: 15px; padding: 5px; box-shadow: 10px 10px 30px rgba(0,0,0,0.5);">
                <p style="text-align: center; font-size: xx-large;">{{actionName}}</p>
                <div style="display: grid; grid-template-rows: 1fr 2fr; gap: 10%;">
                    <KMInputBox placeholder="String" style="height: 100%;"></KMInputBox>
                    <p style="height: 100%; text-align: center;">{{ parameterDescription }}</p>
                </div>
            </div>
</template>

<script>
export default {
    name: 'KliveTechStringActionBox',
    props: {
        actionName: {
            type: String,
            default: 'Action Name'
        },
        parameterDescription: {
            type: String,
            default: 'Parameter Description'
        },
        gadgetID: {
            type: String,
            default: '-1'
        }
    },
    methods: {
    },
    mounted() {
    }
};
</script>
