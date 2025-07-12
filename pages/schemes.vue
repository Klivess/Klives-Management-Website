<template>
    <div>

    </div>
</template>

<script>
import KMInfoGrid from '~/components/KMInfoGrid.vue';
import KMInfoBox from '~/components/KMInfoBox.vue';
import Swal from 'sweetalert2/dist/sweetalert2.js';
import { NuxtPage } from '#components';
definePageMeta({ layout: 'navbar' });
export default {
    components: {
        KMInfoGrid,
        KMInfoBox
    },
}
</script>