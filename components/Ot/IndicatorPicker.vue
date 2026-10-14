<template>
    <div class="ot-modal-backdrop" @click.self="$emit('close')">
        <div class="ot-modal picker" role="dialog" aria-label="Indicators">
            <header>
                <h3>Indicators <span class="muted mono">{{ catalog.length }}</span></h3>
                <input ref="search" v-model="q" class="ot-input sm" placeholder="Search…" @keydown.enter="pickFirst" @keydown.esc="$emit('close')" />
                <button class="ot-btn ghost sm" @click="$emit('close')">✕</button>
            </header>
            <div class="body">
                <nav class="cats">
                    <button v-for="c in categories" :key="c" :aria-pressed="cat === c" class="ot-chip" type="button" @click="cat = cat === c ? '' : c">{{ c }}</button>
                </nav>
                <div v-if="error" class="ot-state compact error"><strong>{{ error }}</strong></div>
                <div class="list">
                    <button v-for="s in filtered" :key="s.Id" class="row" type="button" @click="$emit('add', s)">
                        <span class="id mono">{{ s.Short }}</span>
                        <span class="name">{{ s.Name }}</span>
                        <span class="meta mono">{{ s.Overlay ? 'overlay' : 'pane' }} · {{ s.Outputs.map(o => o.Name).join(' ') }}</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { loadIndicatorCatalog, type IndicatorSpec } from '~/composables/useTerminal';

const emit = defineEmits<{ add: [spec: IndicatorSpec]; close: [] }>();

const catalog = ref<IndicatorSpec[]>([]);
const error = ref('');
const q = ref('');
const cat = ref('');
const search = ref<HTMLInputElement | null>(null);

onMounted(async () => {
    await nextTick();
    search.value?.focus();
    try { catalog.value = await loadIndicatorCatalog(); }
    catch (e: any) { error.value = e?.message ?? 'Catalog unavailable'; }
});

const categories = computed(() => [...new Set(catalog.value.map(s => s.Category))]);
const filtered = computed(() => {
    const t = q.value.trim().toLowerCase();
    return catalog.value.filter(s => (!cat.value || s.Category === cat.value)
        && (!t || s.Id.includes(t) || s.Name.toLowerCase().includes(t) || s.Short.toLowerCase().includes(t)));
});

function pickFirst() {
    const first = filtered.value[0];
    if (first) emit('add', first);
}
</script>

<style scoped>
.picker { width: min(760px, 100%); height: min(640px, 86vh); }
.picker header input { max-width: 260px; margin-left: auto; }
.picker .body { display: flex; flex-direction: column; gap: 8px; min-height: 0; flex: 1 1 auto; overflow: hidden; }
.cats { display: flex; flex-wrap: wrap; gap: 4px; }
.list { overflow-y: auto; display: flex; flex-direction: column; }
.row { display: grid; grid-template-columns: 90px 1fr auto; gap: 10px; align-items: center; padding: 5px 8px; border: 0; background: transparent; text-align: left; cursor: pointer; border-radius: 3px; font-size: 12px; }
.row:hover { background: var(--ot-accent-soft); }
.row .id { color: var(--ot-accent); font-weight: 600; }
.row .meta { color: var(--ot-muted); font-size: 10.5px; }
</style>
