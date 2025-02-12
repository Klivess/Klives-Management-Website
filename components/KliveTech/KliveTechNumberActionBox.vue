<template>
            <div style="display: grid; grid-template-rows: 1fr 2fr; background-color: #161516; border-radius: 15px; padding: 5px; box-shadow: 10px 10px 30px rgba(0,0,0,0.5);">
                <p style="text-align: center; font-size: xx-large;">{{actionName}}</p>
                <div style="display: grid; grid-template-rows: 1fr 1fr; gap: 10%; margin-bottom: 5%;">
                    <KMInputBox placeholder="Numeric Value" style="height: 100%;"></KMInputBox>
                    <p style="height: 100%; text-align: center; margin-top: 10px;">{{ parameterDescription }}</p>
                </div>
                <KMButton message="Submit"></KMButton>
            </div>
</template>

<script>
import KMButton from '../KMButton.vue';

export default {
    name: 'KliveTechNumberActionBox',
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
