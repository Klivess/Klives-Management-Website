<template>
    <!-- Average followers online in each hour of the day (the account's time zone). -->
    <div class="ig-hours">
        <div v-if="!hasData" class="ot-state compact">
            <span class="glyph" aria-hidden="true">○</span>
            <strong>{{ emptyTitle }}</strong>
            <p>{{ emptyText }}</p>
        </div>
        <template v-else>
            <div class="bars" role="img" :aria-label="summary">
                <div v-for="(v, h) in values" :key="h" class="col" :class="{ peak: h === peak }" :title="`${pad(h)}:00 – ${fmtCount(Math.round(v))} online`">
                    <span class="bar" :style="{ height: `${max ? Math.max(2, (v / max) * 100) : 0}%` }"></span>
                </div>
            </div>
            <div class="axis" aria-hidden="true">
                <span v-for="h in [0, 6, 12, 18]" :key="h" :style="{ left: `${(h / 24) * 100}%` }">{{ pad(h) }}:00</span>
            </div>
            <p v-if="caption" class="caption">{{ caption }}<template v-if="timeZone"> ({{ timeZone }})</template></p>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { fmtCount } from '~/composables/useOmniGram';

const props = withDefaults(defineProps<{ values: number[]; caption?: string | null; timeZone?: string | null; emptyTitle?: string; emptyText?: string }>(), {
    emptyTitle: 'Not available yet',
    emptyText: 'Instagram reports when followers are online once an account has 100+ followers; it is read once a day.',
});

const hasData = computed(() => props.values.length === 24 && props.values.some(v => v > 0));
const max = computed(() => Math.max(0, ...props.values));
const peak = computed(() => props.values.indexOf(max.value));
const pad = (h: number) => String(h).padStart(2, '0');
const summary = computed(() => `Followers online by hour; most around ${pad(peak.value)}:00`);
</script>

<style scoped>
.ig-hours { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.bars { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 2px; height: 150px; align-items: end; }
.col { height: 100%; display: flex; align-items: flex-end; }
.bar { width: 100%; border-radius: 2px 2px 0 0; background: var(--ot-cat-1); opacity: 0.55; }
.col.peak .bar { opacity: 1; }
.col:hover .bar { opacity: 0.9; }
.axis { position: relative; height: 14px; font-size: 10.5px; color: var(--ot-muted); font-family: var(--ot-mono); }
.axis span { position: absolute; top: 0; }
.caption { margin: 0; font-size: 12px; color: var(--ot-text-2); }
</style>
