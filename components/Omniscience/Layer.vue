<template>
    <Teleport to="body">
        <div class="omx-layer">
            <template v-if="omx.peekId.value">
                <div class="omx-scrim light" @click="omx.peekId.value = ''"></div>
                <OmnisciencePeek :key="omx.peekId.value" :person-id="omx.peekId.value" />
            </template>
            <template v-if="omx.paletteOpen.value">
                <div class="omx-scrim" @click="omx.paletteOpen.value = false"></div>
                <OmnisciencePalette />
            </template>
            <template v-if="omx.dialog.value">
                <div class="omx-scrim" @click="omx.dialog.value.resolve(false)"></div>
                <div class="omx-dialog" role="alertdialog" aria-modal="true" :aria-label="omx.dialog.value.title" data-testid="omx-dialog">
                    <h3>{{ omx.dialog.value.title }}</h3>
                    <p>{{ omx.dialog.value.text }}</p>
                    <div class="omx-dialog-acts">
                        <button class="omx-btn quiet" type="button" @click="omx.dialog.value.resolve(false)">Cancel</button>
                        <button ref="yes" class="omx-btn" :class="omx.dialog.value.danger ? 'danger' : 'primary'" type="button" data-testid="omx-dialog-yes" @click="omx.dialog.value.resolve(true)">{{ omx.dialog.value.yes }}</button>
                    </div>
                </div>
            </template>
            <div class="omx-toasts" aria-live="polite">
                <div v-for="t in omx.toasts.value" :key="t.id" class="omx-toast" :class="t.tone" role="status">
                    <span class="omx-dot" :class="t.tone === 'bad' ? 'crit' : t.tone === 'ok' ? 'ok' : 'info'"></span><span>{{ t.text }}</span>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
/**
 * Everything that floats above the console: the peek sheet, the command palette, confirmations and
 * toasts. It also owns the two keys that work everywhere: Ctrl K opens the palette, Escape closes
 * whatever is on top.
 */
const omx = useOmx();
const yes = ref<HTMLButtonElement | null>(null);

watch(() => omx.dialog.value, async open => { if (open) { await nextTick(); yes.value?.focus(); } });

function onKey(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        // Capture phase, and stopped here: the site's own shells listen for the same chord.
        event.preventDefault();
        event.stopPropagation();
        omx.paletteOpen.value = !omx.paletteOpen.value;
        return;
    }
    if (event.key !== 'Escape') return;
    if (omx.dialog.value) omx.dialog.value.resolve(false);
    else if (omx.paletteOpen.value) omx.paletteOpen.value = false;
    else if (omx.peekId.value) omx.peekId.value = '';
}
onMounted(() => window.addEventListener('keydown', onKey, true));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true));
</script>
