<template>
    <!-- Findings worked out on the server from the same window as everything else on the page. -->
    <div class="ms-insights">
        <div v-if="!insights.length" class="ot-state compact ok">
            <span class="glyph" aria-hidden="true">✓</span>
            <strong>Nothing stands out</strong>
            <p>No source is failing or quiet, and downloads are in line with the previous window.</p>
        </div>
        <ul v-else role="list">
            <li v-for="(item, i) in insights" :key="i" class="ms-insight" :class="item.Level">
                <span class="icon" aria-hidden="true">{{ insightGlyph(item.Level) }}</span>
                <div class="text">
                    <strong>{{ item.Title }}</strong>
                    <p v-if="item.Detail">{{ item.Detail }}</p>
                    <div v-if="item.Sources.length" class="links">
                        <button v-for="s in item.Sources.slice(0, 6)" :key="s" type="button" class="ot-chip" :title="`Open @${s}`" @click="$emit('source', s)">@{{ s }}</button>
                        <span v-if="item.Sources.length > 6" class="muted">+{{ item.Sources.length - 6 }} more</span>
                    </div>
                </div>
            </li>
        </ul>
    </div>
</template>

<script setup lang="ts">
import { insightGlyph, type Insight } from '~/composables/useMemeScraper';

defineProps<{ insights: Insight[] }>();
defineEmits<{ source: [username: string] }>();
</script>

<style scoped>
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ot-space-2); }
.ms-insight {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: var(--ot-space-2);
    padding: var(--ot-space-2) var(--ot-space-3);
    border-radius: var(--ot-radius-sm);
    border: 1px solid var(--ot-line);
    background: rgba(255, 255, 255, 0.015);
}
.icon {
    width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center;
    font-size: 11px; font-weight: 800; background: var(--ot-info-soft); color: var(--ot-info);
}
.ms-insight.bad { border-color: rgba(255, 123, 123, 0.45); background: var(--ot-negative-soft); }
.ms-insight.bad .icon { background: rgba(255, 123, 123, 0.2); color: var(--ot-negative); }
.ms-insight.warn { border-color: rgba(240, 180, 41, 0.4); background: var(--ot-warning-soft); }
.ms-insight.warn .icon { background: rgba(240, 180, 41, 0.2); color: var(--ot-warning); }
.ms-insight.good .icon { background: var(--ot-positive-soft); color: var(--ot-positive); }
.text strong { display: block; font-size: 13px; font-weight: 600; line-height: 18px; }
.text p { margin: 2px 0 0; font-size: 12px; line-height: 17px; color: var(--ot-text-2); }
.links { display: flex; flex-wrap: wrap; gap: var(--ot-space-1); margin-top: var(--ot-space-1); align-items: center; font-size: 11px; }
.links .ot-chip { cursor: pointer; background: transparent; font-family: inherit; }
.links .ot-chip:hover { border-color: var(--ot-accent); color: var(--ot-text); }
.ot-state.ok .glyph { color: var(--ot-positive); }
</style>
