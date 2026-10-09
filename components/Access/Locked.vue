<template>
    <!-- A section of a page the profile may not see: says so, and names what it would take. -->
    <div class="km-ax ax-locked" :class="{ compact }" role="note">
        <span class="ax-locked-icon"><AccessIcon name="lock" :size="compact ? 14 : 16" /></span>
        <div class="ax-locked-text">
            <strong>{{ title || 'Locked for your profile' }}</strong>
            <span v-if="needs.length" class="ax-locked-needs">
                {{ any && needs.length > 1 ? 'Needs one of' : 'Needs' }}
                <template v-for="(item, i) in needs" :key="item.key">
                    <span v-if="i > 0" class="ax-sep">{{ any ? 'or' : 'and' }}</span>
                    <span class="ax-need" :title="item.description || item.key">
                        “{{ item.title }}”
                        <span v-if="item.tier" class="km-tier" :class="tierMeta(item.tier).tone">{{ item.tier }}</span>
                    </span>
                </template>
            </span>
            <span v-if="$slots.default" class="ax-locked-extra"><slot /></span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { usePermissionCatalog } from '~/composables/useAccess';
import { tierMeta } from '~/scripts/profileFormat';

const props = withDefaults(defineProps<{
    perm?: string | string[];
    any?: boolean;
    title?: string;
    compact?: boolean;
}>(), { any: false, compact: false });

const catalog = usePermissionCatalog();
const keys = computed(() => (props.perm == null ? [] : Array.isArray(props.perm) ? props.perm : [props.perm]));
const needs = computed(() => keys.value.map(key => ({ key, ...catalog.describe(key) })));

onMounted(() => { if (keys.value.length) void catalog.load(); });
</script>

<style scoped>
.ax-locked {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 14px 16px;
    border-radius: var(--ot-radius);
    border: 1px dashed rgba(146, 196, 130, 0.28);
    background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.012) 0 10px, transparent 10px 20px), rgba(18, 21, 15, 0.6);
    color: var(--ot-text-2);
}
.ax-locked.compact { padding: 8px 10px; gap: 8px; font-size: 12.5px; }
.ax-locked-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    flex: 0 0 auto;
    color: var(--ot-warning);
    background: var(--ot-warning-soft);
}
.compact .ax-locked-icon { width: 22px; height: 22px; }
.ax-locked-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ax-locked-text strong { color: var(--ot-text); font-weight: 600; }
.ax-locked-needs { font-size: 12.5px; color: var(--ot-muted); display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.ax-need { color: var(--ot-text-2); display: inline-flex; align-items: center; gap: 4px; }
.ax-sep { color: var(--ot-disabled); }
.ax-locked-extra { font-size: 12.5px; color: var(--ot-muted); }
</style>
