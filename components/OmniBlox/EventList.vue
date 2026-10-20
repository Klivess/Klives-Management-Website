<template>
    <ol class="bx-events">
        <li v-for="(ev, i) in shown" :key="`${ev.Utc}-${i}`" :class="bloxLevelTone(ev.Level)">
            <span class="dot" aria-hidden="true"></span>
            <div class="body">
                <span class="msg">{{ ev.Message }}</span>
                <span class="sub">
                    <time :datetime="ev.Utc" :title="new Date(ev.Utc).toString()">{{ fmtRelative(ev.Utc, now) }}</time>
                    <template v-if="showGame && ev.GameId">
                        ·
                        <NuxtLink :to="`/schemery/omniblox/game/${ev.GameId}`">{{ gameTitle(ev.GameId) }}</NuxtLink>
                    </template>
                    · {{ ev.Kind }}
                </span>
            </div>
        </li>
        <li v-if="!events.length" class="empty">{{ emptyText }}</li>
    </ol>
    <button v-if="events.length > limit && !expanded" class="ot-btn ghost sm more" @click="expanded = true">Show {{ events.length - limit }} more</button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { fmtRelative, useNow } from '~/composables/useOmniTumblr';
import { bloxLevelTone, type BloxEvent, type BloxGameSummary } from '~/composables/useOmniBlox';

const props = withDefaults(defineProps<{
    events: BloxEvent[];
    games?: BloxGameSummary[];
    limit?: number;
    showGame?: boolean;
    emptyText?: string;
}>(), { games: () => [], limit: 15, showGame: true, emptyText: 'Nothing has happened yet.' });

const now = useNow();
const expanded = ref(false);
const shown = computed(() => (expanded.value ? props.events : props.events.slice(0, props.limit)));

function gameTitle(id: string) {
    return props.games.find(g => g.GameId === id)?.Title ?? id;
}
</script>

<style scoped>
.bx-events { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.bx-events li { display: flex; gap: var(--ot-space-2); padding: 6px 0; font-size: 12.5px; line-height: 18px; }
.bx-events li + li { border-top: 1px solid var(--ot-line); }
.dot { width: 7px; height: 7px; border-radius: 50%; margin-top: 6px; flex: 0 0 auto; background: var(--ot-info); }
.ok .dot { background: var(--ot-positive); }
.warn .dot { background: var(--ot-warning); }
.bad .dot { background: var(--ot-negative); }
.body { display: flex; flex-direction: column; min-width: 0; }
.msg { overflow-wrap: anywhere; }
.bad .msg { color: #ffc9c9; }
.sub { font-size: 11px; color: var(--ot-muted); }
.sub a { color: var(--ot-info); text-decoration: none; }
.empty { color: var(--ot-muted); }
.more { margin-top: var(--ot-space-2); }
</style>
