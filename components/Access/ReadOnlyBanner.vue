<template>
    <div v-if="show" class="km-ax ax-readonly" role="status">
        <span class="ax-readonly-icon"><AccessIcon name="eye" :size="16" /></span>
        <p><strong>Read-only.</strong> You can look around, but anything that changes something is blocked for your profile right now.</p>
        <button type="button" class="ax-readonly-hide" @click="hide">Hide</button>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { IsProtectedRoute } from '~/scripts/APIInterface';
import { useCurrentProfile } from '~/composables/useCurrentProfile';

/* Read-only keeps every view and refuses every action (tier Act and above). Said once at the
   top of the page; hidden for the rest of the visit when dismissed, back if it is re-applied. */

const STORAGE_KEY = 'km:readonly-hidden';
const route = useRoute();
const current = useCurrentProfile();
const mounted = ref(false);
const hiddenFor = ref<number | null>(null);

const show = computed(() => mounted.value
    && current.readOnly.value
    && !current.suspended.value
    && IsProtectedRoute(route.path)
    && hiddenFor.value !== current.accessVersion.value);

function hide() {
    hiddenFor.value = current.accessVersion.value;
    try { sessionStorage.setItem(STORAGE_KEY, String(hiddenFor.value)); } catch { /* storage blocked */ }
}

onMounted(() => {
    mounted.value = true;
    try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored !== null) hiddenFor.value = Number(stored);
    } catch { /* storage blocked */ }
});
</script>

<style scoped>
.ax-readonly {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 10px 16px 0;
    padding: 9px 12px;
    border-radius: var(--ot-radius);
    border: 1px solid rgba(99, 200, 234, 0.4);
    background: rgba(99, 200, 234, 0.09);
    color: var(--ot-text-2);
    font-size: 13px;
    position: relative;
    z-index: 5;
}
.ax-readonly strong { color: var(--ot-info); font-weight: 650; }
.ax-readonly p { flex: 1 1 auto; min-width: 0; }
.ax-readonly-icon { display: inline-flex; color: var(--ot-info); }
.ax-readonly-hide {
    flex: 0 0 auto;
    padding: 4px 10px !important;
    border-radius: 6px;
    color: var(--ot-muted);
    font-size: 12px;
}
.ax-readonly-hide:hover { background: rgba(255, 255, 255, 0.06); color: var(--ot-text); }
</style>
