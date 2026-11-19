<template>
    <section class="omni-card" :class="{ attention, refreshing }" :aria-busy="refreshing || (loading && empty) ? 'true' : undefined">
        <header v-if="title || $slots.controls">
            <div class="titles">
                <h2>{{ title }}<span v-if="refreshing" class="omni-updating" role="status"><span class="omni-spinner" aria-hidden="true"></span>updating</span></h2>
                <!-- What the card shows, stated plainly. Only worth setting when it says something the title does not. -->
                <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
            </div>
            <div v-if="$slots.controls" class="controls"><slot name="controls" /></div>
        </header>

        <!-- Stale and partial are their own facts: each says what is affected instead of quietly degrading what is below. -->
        <div v-if="stale" class="notice warn"><span aria-hidden="true">⚠</span><span>{{ staleReason || 'This data is older than expected.' }}</span></div>
        <div v-else-if="partial" class="notice info"><span aria-hidden="true">ℹ</span><span>{{ partialReason || 'Some of this data could not be loaded.' }}</span></div>

        <div v-if="error" class="body">
            <OmniscienceV3StateBlock kind="error" :title="errorTitle" :detail="error">
                <button v-if="retryable" class="omni-btn sm" type="button" @click="$emit('retry')">Try again</button>
            </OmniscienceV3StateBlock>
        </div>

        <!-- Skeletons have the final geometry, so nothing jumps when the data lands. -->
        <div v-else-if="loading && empty" class="omni-skelrows" aria-live="polite" data-testid="omni-skeleton">
            <div v-for="n in skeletonRows" :key="n" class="omni-skel" :style="{ width: `${[100, 82, 91, 74, 96, 68][n % 6]}%` }"></div>
        </div>

        <div v-else-if="empty" class="body">
            <slot name="empty"><OmniscienceV3StateBlock :kind="emptyKind" :title="emptyTitle" :detail="emptyText" /></slot>
        </div>

        <div v-else class="body" :class="{ flush }"><slot /></div>

        <footer v-if="$slots.footer || footnote"><slot name="footer">{{ footnote }}</slot></footer>
    </section>
</template>

<script setup lang="ts">
/**
 * Omniscience's own card. It always says which of four things is true of its content: loading,
 * nothing to show (and why), failed (and why), or shown, possibly stale or partial.
 */
withDefaults(defineProps<{
    title?: string;
    subtitle?: string;
    footnote?: string;
    flush?: boolean;
    attention?: boolean;
    loading?: boolean;
    empty?: boolean;
    emptyKind?: 'empty' | 'filtered' | 'nopermission' | 'ok';
    emptyTitle?: string;
    emptyText?: string;
    error?: string;
    errorTitle?: string;
    retryable?: boolean;
    stale?: boolean;
    staleReason?: string;
    partial?: boolean;
    partialReason?: string;
    /** What is shown is being replaced by a newer answer. */
    refreshing?: boolean;
    skeletonRows?: number;
}>(), { emptyKind: 'empty', emptyTitle: 'Nothing to show', errorTitle: 'This section could not load', retryable: true, skeletonRows: 5 });

defineEmits<{ retry: [] }>();
</script>
