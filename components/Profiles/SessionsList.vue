<template>
    <div class="ss">
        <div v-if="canRevoke && activeCount > (selfView ? 1 : 0)" class="ss-head">
            <span class="ss-count">{{ activeCount }} signed-in device{{ activeCount === 1 ? '' : 's' }}</span>
            <button type="button" class="ot-btn danger sm" :disabled="busy" @click="$emit('revokeAll')">
                <AccessIcon name="signout" :size="14" /> {{ selfView ? 'Sign out everywhere else' : 'Sign out everywhere' }}
            </button>
        </div>

        <ul class="ss-list">
            <li v-for="s in sorted" :key="s.sessionId" class="ss-item" :class="{ ended: !s.active, current: s.current }">
                <span class="ss-icon" :class="{ online: s.online }"><AccessIcon :name="s.kind === 'Internal' ? 'bolt' : 'device'" :size="18" /></span>
                <div class="ss-main">
                    <div class="ss-title">
                        <strong>{{ s.kind === 'Internal' ? 'Internal service' : (s.label || 'Unknown device') }}</strong>
                        <span v-if="s.current" class="ot-chip ok">This device</span>
                        <span v-if="s.online" class="ot-chip ok"><span class="km-dot online"></span> Online</span>
                        <span v-if="!s.active" class="ot-chip">{{ s.revokedUtc ? 'Signed out' : 'Expired' }}</span>
                    </div>
                    <div class="ss-meta">
                        <span v-if="s.ip">{{ s.ip }}</span>
                        <span>Signed in {{ relTime(s.createdUtc) }}</span>
                        <span v-if="s.active">Last active {{ relTime(s.lastSeenUtc) }}</span>
                        <span v-if="s.active">Expires {{ untilTime(s.expiresUtc) }}</span>
                        <span v-if="s.revokedUtc">Ended {{ relTime(s.revokedUtc) }}{{ s.revokeReason ? ` · ${s.revokeReason}` : '' }}</span>
                    </div>
                    <ul v-if="s.tabs.length" class="ss-tabs">
                        <li v-for="(tab, i) in s.tabs" :key="i">
                            <span class="km-dot" :class="tab.visible ? 'online' : 'idle'"></span>
                            {{ tab.title || tab.path }}
                            <code v-if="tab.title && tab.path">{{ tab.path }}</code>
                        </li>
                    </ul>
                    <p v-if="s.userAgent && showAgent" class="ss-agent" :title="s.userAgent">{{ s.userAgent }}</p>
                </div>
                <button v-if="canRevoke && s.active && !s.current && s.kind !== 'Internal'" type="button" class="ot-btn ghost sm"
                        :disabled="busy" @click="$emit('revoke', s.sessionId)">Sign out</button>
            </li>
        </ul>
        <OmniTraderStateBlock v-if="!sessions.length" title="No sessions" detail="Signed-in devices appear here." compact />
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SessionRow } from '~/scripts/profilesApi';
import { relTime, untilTime } from '~/scripts/profileFormat';

const props = withDefaults(defineProps<{
    sessions: SessionRow[];
    canRevoke?: boolean;
    busy?: boolean;
    /** Your own sessions: the current one can't be signed out from here. */
    selfView?: boolean;
    showAgent?: boolean;
}>(), { canRevoke: false, busy: false, selfView: false, showAgent: false });

defineEmits<{ revoke: [sessionId: string]; revokeAll: [] }>();

const activeCount = computed(() => props.sessions.filter(s => s.active && s.kind !== 'Internal').length);
const sorted = computed(() => [...props.sessions].sort((a, b) =>
    Number(b.current) - Number(a.current) || Number(b.active) - Number(a.active) || Number(b.online) - Number(a.online)
    || Date.parse(b.lastSeenUtc) - Date.parse(a.lastSeenUtc)));
</script>

<style scoped>
.ss { display: flex; flex-direction: column; gap: 10px; }
.ss-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.ss-count { font-size: 12.5px; color: var(--ot-muted); }
.ss-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ss-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 12px;
    align-items: flex-start;
    padding: 12px 14px;
    border-radius: var(--ot-radius);
    border: 1px solid var(--ot-line);
    background: var(--ot-surface);
}
.ss-item.current { border-color: rgba(109, 220, 79, 0.35); }
.ss-item.ended { opacity: 0.6; }
.ss-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    color: var(--ot-text-2);
    background: rgba(255, 255, 255, 0.04);
}
.ss-icon.online { color: var(--ot-positive); background: var(--ot-positive-soft); }
.ss-main { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.ss-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ss-title strong { color: var(--ot-text); font-weight: 600; }
.ss-meta { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--ot-muted); }
.ss-tabs { list-style: none; margin: 2px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--ot-text-2); }
.ss-tabs li { display: flex; align-items: center; gap: 6px; min-width: 0; }
.ss-tabs code { font-family: var(--ot-mono); font-size: 11px; color: var(--ot-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ss-agent { font-family: var(--ot-mono); font-size: 10.5px; color: var(--ot-disabled); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
