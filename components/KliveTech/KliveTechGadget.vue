

<template>
    <div class="kliveTechGadgetBox" >
        <p style="text-align: center; font-size: xx-large;">Name Of Gadget</p>
        <div style="display: flex; justify-content: center; margin-top: 1em;">
            <p>Time Connected: </p>
        </div>

        <div style="display: grid; overflow-y: scroll; overflow-x: hidden; width: 100%; height: 20em;">
        <!-- Actions -->
        <div style="display: grid; justify-content: center; height: 200%; margin-top: 1em; grid-template-columns: 1fr; gap: 20px; grid-template-rows: auto;">
            <KliveTechStringActionBox></KliveTechStringActionBox>
            <KliveTechNumberActionBox></KliveTechNumberActionBox>
            <KliveTechBooleanActionBox/>
        </div>
        </div>
    </div>
</template>

<script>
import KliveTechBooleanActionBox from './KliveTechBooleanActionBox.vue';

export default {
    name: 'KliveTechGadget',
    props: {
        gadgetID: {
            type: String,
            default: '-1'
        }
    },
    methods: {
    },
    mounted() {
    }
}
</script>