<template>
    <section class="ot-card" :class="{ attention }">
        <header v-if="title || $slots.controls">
            <div class="titles">
                <h2>{{ title }}</h2>
                <!-- The question the card answers, in the operator's words. -->
                <p v-if="question" class="question">{{ question }}</p>
            </div>
            <div v-if="$slots.controls" class="controls"><slot name="controls" /></div>
        </header>

        <!-- Partial and stale are separate facts from empty and error, and each says
             what is affected rather than silently degrading the numbers below. -->
        <div v-if="stale" class="notice warn">
            <span aria-hidden="true">⚠</span>
            <span>{{ staleReason || 'This data is older than expected.' }}</span>
        </div>
        <div v-else-if="partial" class="notice info">
            <span aria-hidden="true">ℹ</span>
            <span>{{ partialReason || 'Some of this data could not be loaded.' }}</span>
        </div>

        <div v-if="error" class="body">
            <OmniTraderStateBlock kind="error" :title="errorTitle" :detail="error">
                <button v-if="retryable" class="ot-btn sm" @click="$emit('retry')">Try again</button>
            </OmniTraderStateBlock>
        </div>

        <!-- Skeletons match the final geometry so nothing jumps when data lands. -->
        <div v-else-if="loading && empty" class="ot-skelrows" aria-busy="true" aria-live="polite">
            <div v-for="n in skeletonRows" :key="n" class="ot-skel" :style="{ width: skeletonWidth(n) }"></div>
        </div>

        <div v-else-if="empty" class="body">
            <slot name="empty">
                <OmniTraderStateBlock :kind="emptyKind" :title="emptyTitle" :detail="emptyText" />
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
withDefaults(defineProps<{
    title?: string;
    question?: string;
    footnote?: string;
    flush?: boolean;
    attention?: boolean;
    loading?: boolean;
    empty?: boolean;
    /** `empty` = there is genuinely nothing; `filtered` = filters removed everything. */
    emptyKind?: 'empty' | 'filtered' | 'nopermission';
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
    emptyTitle: 'Nothing to show',
    errorTitle: 'This section could not load',
    retryable: true,
    skeletonRows: 5,
});

defineEmits<{ retry: [] }>();

// Uneven skeleton widths read as content rather than as a loading bar.
function skeletonWidth(n: number): string {
    return `${[100, 82, 91, 74, 96, 68][n % 6]}%`;
}
</script>

<style scoped>
.notice {
    display: flex;
    align-items: center;
    gap: var(--ot-space-2);
    padding: var(--ot-space-2) var(--ot-card-pad);
    font-size: 12px;
    border-bottom: 1px solid var(--ot-line);
}
.notice.warn { color: var(--ot-warning); background: var(--ot-warning-soft); }
.notice.info { color: var(--ot-info); background: var(--ot-info-soft); }
</style>
