<template>
    <section class="ot-panel" :class="{ collapsed, maximized, attention }">
        <header>
            <div class="titles">
                <h2><span v-if="code" class="code">{{ code }}</span>{{ title }}</h2>
                <span v-if="subtitle" class="subtitle">{{ subtitle }}</span>
                <slot name="title" />
            </div>
            <div class="controls">
                <slot v-if="!collapsed" name="controls" />
                <span v-if="loading" class="ot-spin" aria-label="Loading"></span>
                <span class="chrome">
                    <button v-if="refreshable" type="button" title="Refresh" @click="$emit('refresh')">↻</button>
                    <button v-if="maximizable && !collapsed" type="button" :title="maximized ? 'Restore' : 'Maximise'" @click="maximized = !maximized">
                        {{ maximized ? '❐' : '□' }}
                    </button>
                    <button v-if="collapsible" type="button" :title="collapsed ? 'Expand' : 'Collapse'" :aria-expanded="!collapsed" @click="toggle">
                        {{ collapsed ? '▸' : '▾' }}
                    </button>
                </span>
            </div>
        </header>
        <template v-if="!collapsed">
            <div v-if="$slots.toolbar" class="ot-toolbar flat"><slot name="toolbar" /></div>
            <div v-if="error" class="body">
                <div class="ot-state compact error">
                    <strong>{{ error }}</strong>
                    <button v-if="refreshable" class="ot-btn sm" @click="$emit('refresh')">Retry</button>
                </div>
            </div>
            <div v-else-if="loading && empty" class="ot-skelrows" aria-busy="true">
                <div v-for="n in 4" :key="n" class="ot-skel" :style="{ width: `${[96, 78, 88, 70][n - 1]}%` }"></div>
            </div>
            <div v-else-if="empty" class="body">
                <slot name="empty"><div class="ot-state compact"><span>{{ emptyText }}</span></div></slot>
            </div>
            <div v-else class="body" :class="{ flush }" :style="bodyStyle"><slot /></div>
            <footer v-if="$slots.footer"><slot name="footer" /></footer>
        </template>
    </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { usePersisted } from '~/composables/useTerminal';

const props = withDefaults(defineProps<{
    title?: string;
    code?: string;
    subtitle?: string;
    flush?: boolean;
    loading?: boolean;
    empty?: boolean;
    emptyText?: string;
    error?: string | null;
    attention?: boolean;
    collapsible?: boolean;
    maximizable?: boolean;
    refreshable?: boolean;
    /** Remember collapse state under this key. */
    persist?: string;
    defaultCollapsed?: boolean;
    maxHeight?: string;
}>(), { emptyText: 'No data', collapsible: true, maximizable: true });

defineEmits<{ refresh: [] }>();

const stored = props.persist ? usePersisted<boolean>(`panel.${props.persist}`, props.defaultCollapsed ?? false) : ref(props.defaultCollapsed ?? false);
const collapsed = stored;
const maximized = ref(false);

function toggle() { collapsed.value = !collapsed.value; if (collapsed.value) maximized.value = false; }

const bodyStyle = computed(() => (props.maxHeight && !maximized.value ? { maxHeight: props.maxHeight, overflow: 'auto' } : undefined));

function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && maximized.value) maximized.value = false; }
watch(maximized, on => {
    if (on) window.addEventListener('keydown', onKey);
    else window.removeEventListener('keydown', onKey);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>
