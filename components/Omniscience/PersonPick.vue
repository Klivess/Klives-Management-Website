<template>
    <div ref="root" class="omx-anchor" style="min-width: 0">
        <div v-if="modelValue" class="omx-rowflex" style="flex-wrap: nowrap; height: 32px">
            <span class="omx-chip accent omx-clip" style="height: 24px; max-width: 220px">{{ label || modelValue }}</span>
            <button class="omx-btn quiet sm icon" type="button" :aria-label="`Remove ${label || 'the person'}`" @click="clear()"><OmniscienceIcon name="close" /></button>
        </div>
        <input v-else v-model="text" class="omx-input" style="width: 100%" type="search" :placeholder="placeholder" :aria-label="placeholder" autocomplete="off"
               @focus="open = true" @keydown.down.prevent="cursor = Math.min(found.length - 1, cursor + 1)" @keydown.up.prevent="cursor = Math.max(0, cursor - 1)"
               @keydown.enter.prevent="choose(found[cursor])" @keydown.esc="open = false" />
        <div v-if="open && !modelValue && text.trim().length >= 2" class="omx-pop" style="left: 0; right: auto; width: min(320px, 90vw)">
            <ul class="omx-rows">
                <li v-for="(p, i) in found" :key="p.person_id" :class="{ cursor: i === cursor }" style="padding: 0">
                    <button class="omx-rowbtn" type="button" style="border-bottom: 0" @mousemove="cursor = i" @click="choose(p)">
                        <span class="omx-avatar" :class="p.tier">{{ omxInitials(p.display_name) }}</span>
                        <span class="omx-row-main"><strong>{{ p.display_name || '(unnamed)' }}</strong><small>{{ omxHandle(p) }}</small></span>
                    </button>
                </li>
            </ul>
            <div v-if="!found.length" class="omx-empty">{{ searching ? 'Looking…' : 'Nobody by that name' }}</div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { omxHandle, omxInitials } from '~/scripts/omniscienceConsole';

/** Picks one person by typing part of a name or handle. The value is the person id; the name is kept for showing. */
const props = withDefaults(defineProps<{ modelValue: string; label?: string; placeholder?: string }>(), { label: '', placeholder: 'Anyone: type a name' });
const emit = defineEmits<{ 'update:modelValue': [id: string]; 'update:label': [name: string] }>();
const omx = useOmx();
const root = ref<HTMLElement | null>(null);
const text = ref('');
const found = ref<any[]>([]);
const cursor = ref(0);
const open = ref(false);
const searching = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;
let asked = 0;

function choose(p: any) {
    if (!p) return;
    emit('update:modelValue', String(p.person_id));
    emit('update:label', String(p.display_name || ''));
    text.value = ''; open.value = false;
}
function clear() { emit('update:modelValue', ''); emit('update:label', ''); }

watch(text, value => {
    cursor.value = 0;
    if (timer) clearTimeout(timer);
    const q = value.trim();
    if (q.length < 2) { found.value = []; return; }
    searching.value = true;
    timer = setTimeout(async () => {
        const mine = ++asked;
        try {
            const data = await omx.api.get('/omniscience/workspace/directory?limit=8&search=' + encodeURIComponent(q), { retries: 1 });
            if (mine === asked) found.value = Array.isArray(data?.items) ? data.items : [];
        } catch { if (mine === asked) found.value = []; }
        finally { if (mine === asked) searching.value = false; }
    }, 200);
});

// A person named only by id (from a link) gets their name looked up once.
watch(() => props.modelValue, async id => {
    if (!id || props.label) return;
    try { const person = await omx.api.get('/omniscience/persons/get?personId=' + encodeURIComponent(id), { retries: 1 }); if (props.modelValue === id) emit('update:label', String(person?.display_name || '')); }
    catch { /* the id is shown instead */ }
}, { immediate: true });

function onDocClick(event: MouseEvent) { if (root.value && !root.value.contains(event.target as Node)) open.value = false; }
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => { document.removeEventListener('click', onDocClick); if (timer) clearTimeout(timer); });
</script>
