<template>
    <section class="kt-panel" :class="{ attention, 'kt-screws': screws }">
        <header v-if="title || $slots.controls">
            <div class="titles">
                <h2>{{ title }}</h2>
                <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
            </div>
            <div v-if="$slots.controls" class="controls"><slot name="controls" /></div>
        </header>

        <!-- Stale and partial are separate facts from empty and error. Each says what is
             affected instead of letting the numbers below quietly degrade. -->
        <div v-if="stale" class="kt-notice warn">
            <span aria-hidden="true">⚠</span>
            <span>{{ staleReason || 'This is older than it should be.' }}</span>
        </div>
        <div v-else-if="partial" class="kt-notice info">
            <span aria-hidden="true">ℹ</span>
            <span>{{ partialReason || 'Some of this could not be loaded.' }}</span>
        </div>

        <div v-if="error" class="body">
            <KliveTechStateBlock kind="error" :title="errorTitle" :detail="error" compact>
                <button v-if="retryable" class="kt-btn sm" @click="$emit('retry')">Try again</button>
            </KliveTechStateBlock>
        </div>

        <!-- Skeleton rows match the final geometry so nothing jumps when data lands. -->
        <div v-else-if="loading && empty" class="kt-skelrows" aria-busy="true" aria-live="polite">
            <div v-for="n in skeletonRows" :key="n" class="kt-skel" :style="{ width: skeletonWidth(n) }"></div>
        </div>

        <div v-else-if="empty" class="body">
            <slot name="empty">
                <KliveTechStateBlock :kind="emptyKind" :title="emptyTitle" :detail="emptyText" compact />
            </slot>
        </div>

        <div v-else class="body" :class="{ flush }">
            <slot />
        </div>

        <footer v-if="$slots.footer || footnote">
            <slot name="footer">{{ footnote }}</slot>
        </footer>
    </section>
</template>

<script setup lang="ts">
import type { StateKind } from './StateBlock.vue';

withDefaults(defineProps<{
    title?: string;
    subtitle?: string;
    footnote?: string;
    flush?: boolean;
    screws?: boolean;
    attention?: boolean;
    loading?: boolean;
    empty?: boolean;
    emptyKind?: StateKind;
    emptyTitle?: string;
    emptyText?: string;
    error?: string;
    errorTitle?: string;
    retryable?: boolean;
    stale?: boolean;
    staleReason?: string;
    partial?: boolean;
    partialReason?: string;
    skeletonRows?: number;
}>(), {
    emptyKind: 'empty',
    errorTitle: 'This section could not load',
    retryable: true,
    skeletonRows: 4,
});

defineEmits<{ retry: [] }>();

// Uneven widths read as content rather than as a progress bar.
function skeletonWidth(n: number): string {
    return `${[100, 78, 92, 66, 88, 74][n % 6]}%`;
}
</script>
