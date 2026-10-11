<template>
    <!-- What a newly connected account starts with; everything is adjustable later in its strategy. -->
    <div class="ot-formgrid ig-connectstart">
        <div class="ot-field">
            <label :for="fid('preset')">Start with</label>
            <select :id="fid('preset')" class="ot-select" :value="preset" @change="emit('update:preset', ($event.target as HTMLSelectElement).value)">
                <option v-for="p in presets" :key="p.value" :value="p.value">{{ p.label }}</option>
            </select>
            <div class="help">Adjustable later in the account's strategy.</div>
        </div>
        <div class="ot-field">
            <label aria-hidden="true">&nbsp;</label>
            <label class="ot-check">
                <input type="checkbox" :checked="autopilot && preset !== 'manual'" :disabled="preset === 'manual'"
                       @change="emit('update:autopilot', ($event.target as HTMLInputElement).checked)" />
                Switch autopilot on now
            </label>
            <div class="help">Leave off to review the strategy first.</div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useId } from 'vue';

defineProps<{ preset: string; autopilot: boolean; presets: { value: string; label: string }[] }>();
const emit = defineEmits<{ 'update:preset': [value: string]; 'update:autopilot': [value: boolean] }>();
const uid = useId();
const fid = (key: string) => `${uid}-${key}`;
</script>

<style scoped>
.ig-connectstart { grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); }
</style>
