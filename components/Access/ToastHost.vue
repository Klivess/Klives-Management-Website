<template>
    <!-- The site's one place for access notices: a denial is explained once, here, instead of a
         dialog or a redirect. Several denials landing together fold into one toast. -->
    <div class="km-ax ax-toasts" role="region" aria-label="Access notices">
        <TransitionGroup name="ax-toast" tag="div" class="ax-toast-stack" aria-live="polite">
            <div v-for="toast in toasts" :key="toast.id" class="ax-toast" :class="toast.tone"
                 @mouseenter="holdToast(toast.id)" @mouseleave="releaseToast(toast.id)"
                 @focusin="holdToast(toast.id)" @focusout="releaseToast(toast.id)">
                <span class="ax-toast-icon"><AccessIcon :name="ICONS[toast.tone] ?? 'lock'" :size="16" /></span>
                <div class="ax-toast-body">
                    <strong>{{ toast.title }}</strong>
                    <span v-if="toast.detail" class="ax-toast-detail">{{ toast.detail }}</span>
                    <NuxtLink v-if="toast.reason === 'MissingPermission'" class="ax-toast-link" to="/account">See your permissions</NuxtLink>
                </div>
                <button type="button" class="ax-toast-close" aria-label="Dismiss" @click="dismissToast(toast.id)">
                    <AccessIcon name="close" :size="14" />
                </button>
            </div>
        </TransitionGroup>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { accessState, dismissToast, holdToast, releaseToast } from '~/scripts/accessState';

const toasts = computed(() => accessState.toasts);
const ICONS: Record<string, string> = { denied: 'lock', locked: 'eye', error: 'warning', info: 'check' };
</script>

<style scoped>
.ax-toasts {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 3000;
    pointer-events: none;
}
.ax-toast-stack { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.ax-toast {
    pointer-events: auto;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: flex-start;
    gap: 10px;
    width: min(380px, calc(100vw - 32px));
    padding: 12px 12px 12px 14px;
    border-radius: var(--ot-radius);
    border: 1px solid rgba(240, 180, 41, 0.38);
    background: rgba(25, 29, 22, 0.97);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(6px);
}
.ax-toast.locked { border-color: rgba(99, 200, 234, 0.4); }
.ax-toast.error { border-color: rgba(255, 123, 123, 0.45); }
.ax-toast.info { border-color: rgba(109, 220, 79, 0.4); }
.ax-toast-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    color: var(--ot-warning);
    background: var(--ot-warning-soft);
}
.ax-toast.locked .ax-toast-icon { color: var(--ot-info); background: var(--ot-info-soft); }
.ax-toast.error .ax-toast-icon { color: var(--ot-negative); background: var(--ot-negative-soft); }
.ax-toast.info .ax-toast-icon { color: var(--ot-accent); background: var(--ot-accent-soft); }
.ax-toast-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding-top: 1px; }
.ax-toast-body strong { color: var(--ot-text); font-size: 13px; font-weight: 600; line-height: 18px; overflow-wrap: anywhere; }
.ax-toast-detail { color: var(--ot-text-2); font-size: 12px; line-height: 17px; overflow-wrap: anywhere; }
.ax-toast-link { margin-top: 4px; color: var(--ot-accent); font-size: 12px; font-weight: 600; width: fit-content; }
.ax-toast-link:hover { text-decoration: underline; }
.ax-toast-close {
    width: 24px;
    height: 24px;
    justify-content: center;
    border-radius: 6px;
    color: var(--ot-muted);
}
.ax-toast-close:hover { background: rgba(255, 255, 255, 0.06); color: var(--ot-text); }

.ax-toast-enter-active, .ax-toast-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.ax-toast-enter-from, .ax-toast-leave-to { opacity: 0; transform: translateY(8px) scale(0.98); }
.ax-toast-move { transition: transform 180ms ease; }

@media (max-width: 767px) {
    /* Clear of the collapsed nav rail. */
    .ax-toasts { left: 64px; right: 8px; bottom: 8px; }
    .ax-toast { width: 100%; }
}
</style>
