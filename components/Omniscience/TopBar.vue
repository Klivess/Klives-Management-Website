<template>
    <header class="omx-top">
        <button class="omx-brand" type="button" title="Back to the brief" @click="omx.go('brief')">
            <span class="omx-brand-mark"><OmniscienceIcon name="eye" /></span>
            <span class="omx-brand-name">Omniscience</span>
            <span class="omx-brand-sub omx-hide-sm">{{ sub }}</span>
        </button>
        <button class="omx-find" type="button" data-testid="omx-find" @click="omx.paletteOpen.value = true">
            <OmniscienceIcon name="search" /><span class="omx-clip">Find a person, a fact or a command</span><kbd>Ctrl K</kbd>
        </button>
        <div class="omx-top-right">
            <span class="omx-stamp hide-sm" :class="{ warn: !!omx.syncError.value }" :title="omx.syncError.value || 'Read again every minute while this tab is visible'" data-testid="omx-sync">{{ stamp }}</span>
            <span class="omx-dot" :class="omx.pulse.value" :title="pulseTitle"></span>
            <div ref="bellRoot" class="omx-anchor">
                <button class="omx-btn quiet" :class="{ icon: !unread, on: bell }" type="button" aria-label="Notifications" :aria-expanded="bell" data-testid="omx-bell" @click="bell = !bell">
                    <OmniscienceIcon name="bell" /><span v-if="unread" class="omx-count hot">{{ unread }}</span>
                </button>
                <div v-if="bell" class="omx-pop" data-testid="omx-notifications">
                    <div class="omx-card-head"><h3>Notifications</h3><div class="omx-acts"><button v-if="unread" class="omx-btn quiet sm" type="button" @click="dismissAll">Dismiss all</button></div></div>
                    <ul class="omx-rows">
                        <li v-for="item in omx.notifications.value" :key="item.notif_id">
                            <span class="omx-dot" :class="omxNotifBad(item) ? 'crit' : 'ok'"></span>
                            <div class="omx-row-main">
                                <strong>{{ omxNotifTitle(item) }}</strong>
                                <small class="wrap">{{ omxNotifDetail(item) }} · {{ omxAgo(item.created_at, omx.now.value) }}</small>
                            </div>
                            <div class="omx-row-acts">
                                <button v-if="item.person_id" class="omx-btn quiet sm" type="button" @click="open(item.person_id)">Open</button>
                                <button class="omx-btn quiet sm icon" type="button" aria-label="Dismiss" @click="omx.dismissNotification(item)"><OmniscienceIcon name="close" /></button>
                            </div>
                        </li>
                    </ul>
                    <div v-if="!unread" class="omx-empty"><strong>Nothing new</strong>Finished and failed jobs show up here.</div>
                </div>
            </div>
            <button class="omx-btn quiet icon" type="button" title="Read everything again" aria-label="Refresh" :disabled="omx.syncing.value" data-testid="omx-refresh" @click="omx.sync(true)"><OmniscienceIcon name="refresh" /></button>
        </div>
    </header>
    <nav class="omx-views" aria-label="Omniscience views">
        <button v-for="v in OMX_VIEWS" :key="v.id" class="omx-view" type="button" :aria-current="active === v.id ? 'page' : undefined" :title="v.hint"
                :data-testid="`omx-view-${v.id}`" @click="omx.go(v.id)">
            <OmniscienceIcon :name="v.icon" />{{ v.label }}<span v-if="badge(v.id)" class="omx-count" :class="{ hot: v.id !== 'people' }">{{ badge(v.id) }}</span>
        </button>
    </nav>
</template>

<script setup lang="ts">
import { OMX_VIEWS, omxAgo, omxCompact, omxNotifBad, omxNotifDetail, omxNotifTitle, type OmxView } from '~/scripts/omniscienceConsole';

/** The frame every view sits under: where you are, the way to anything (Ctrl K), and whether the engine is well. */
const omx = useOmx();
const bell = ref(false);
const bellRoot = ref<HTMLElement | null>(null);

const active = computed<OmxView>(() => (omx.view.value === 'person' ? 'people' : omx.view.value));
const unread = computed(() => omx.notifications.value.length);
const sub = computed(() => {
    const o = omx.overview.value;
    return o?.messages ? `${omxCompact(o.messages)} messages · ${omxCompact(o.persons)} people` : '';
});
const stamp = computed(() => {
    if (omx.syncError.value) return 'not reached';
    if (!omx.lastSync.value) return omx.syncing.value ? 'reading…' : '';
    return `synced ${omxAgo(omx.lastSync.value, omx.now.value)}`;
});
const pulseTitle = computed(() => {
    switch (omx.pulse.value) {
        case 'crit': return omx.syncError.value || 'Something needs attention now';
        case 'warn': return 'Something needs a look';
        case 'busy': return 'A profiler run is in progress';
        default: return 'The engine is well';
    }
});

function badge(id: OmxView): number {
    if (id === 'review') return omx.reviewCount.value;
    if (id === 'engine') return omx.needs.value.filter(n => n.view === 'engine' && n.tone !== 'info').length;
    return 0;
}
function open(id: string) { bell.value = false; omx.openPerson(id); }
async function dismissAll() { for (const item of [...omx.notifications.value]) await omx.dismissNotification(item); }

function onDocClick(event: MouseEvent) { if (bell.value && bellRoot.value && !bellRoot.value.contains(event.target as Node)) bell.value = false; }
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
</script>
