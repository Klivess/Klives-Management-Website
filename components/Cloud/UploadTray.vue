<template>
    <Teleport to="body">
        <div v-if="jobs.length" class="kcl-layer">
            <section class="kcl-tray" aria-label="Uploads" data-testid="kcl-tray">
                <header class="kcl-tray__head">
                    <KliveCloudIcon :name="active ? 'upload' : failedCount ? 'alert' : 'check-circle'" :size="16" :style="{ color: active ? 'var(--kcl-accent)' : failedCount ? 'var(--kcl-warn)' : 'var(--kcl-ok)' }" />
                    <div class="kcl-tray__title">
                        {{ title }}
                        <div class="kcl-tray__sub">{{ sub }}</div>
                    </div>
                    <button v-if="active" class="kcl-btn kcl-btn--xs kcl-btn--ghost" @click="$emit('cancelAll')">Cancel all</button>
                    <button v-else class="kcl-btn kcl-btn--xs kcl-btn--ghost" data-testid="tray-clear" @click="$emit('clear')">Clear</button>
                    <button class="kcl-iconbtn kcl-iconbtn--sm" :aria-label="open ? 'Collapse' : 'Expand'" @click="open = !open"><KliveCloudIcon :name="open ? 'chevron-down' : 'chevron-up'" :size="14" /></button>
                </header>
                <div class="kcl-tray__bar"><span :style="{ width: `${progress * 100}%` }"></span></div>
                <div v-if="open" class="kcl-tray__list">
                    <div v-for="job in jobs" :key="job.id" class="kcl-job" :data-testid="`job-${job.fileName}`">
                        <CloudGlyph :kind="kindForName(job.fileName)" :size="24" />
                        <div style="min-width: 0">
                            <div class="kcl-job__name" :title="job.label">{{ job.label }}</div>
                            <div class="kcl-job__meta" :data-tone="job.status === 'failed' ? 'crit' : job.status === 'done' ? 'ok' : undefined">{{ jobLine(job) }}</div>
                        </div>
                        <button v-if="job.status === 'uploading' || job.status === 'queued'" class="kcl-iconbtn kcl-iconbtn--sm" :aria-label="`Cancel ${job.fileName}`" @click="$emit('cancel', job.id)"><KliveCloudIcon name="close" :size="13" /></button>
                        <button v-else-if="(job.status === 'failed' || job.status === 'cancelled') && job.canRetry" class="kcl-iconbtn kcl-iconbtn--sm" :aria-label="`Retry ${job.fileName}`" @click="$emit('retry', job.id)"><KliveCloudIcon name="refresh" :size="13" /></button>
                        <span v-else></span>
                        <div v-if="job.status === 'uploading'" class="kcl-job__track"><span :style="{ width: `${job.size ? (job.loaded / job.size) * 100 : 0}%` }"></span></div>
                    </div>
                </div>
            </section>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatBytes, kindForName } from '~/scripts/klivecloud/shared';
import type { UploadJob } from '~/scripts/klivecloud/uploads';

const props = defineProps<{ jobs: UploadJob[]; now: number }>();
defineEmits<{ cancel: [id: number]; retry: [id: number]; cancelAll: []; clear: [] }>();

const open = ref(true);
const active = computed(() => props.jobs.filter(job => job.status === 'queued' || job.status === 'uploading').length);
const failedCount = computed(() => props.jobs.filter(job => job.status === 'failed').length);
const doneCount = computed(() => props.jobs.filter(job => job.status === 'done').length);
const totalBytes = computed(() => props.jobs.reduce((sum, job) => sum + (job.status === 'cancelled' ? 0 : job.size), 0));
const sentBytes = computed(() => props.jobs.reduce((sum, job) => sum + (job.status === 'done' ? job.size : job.status === 'uploading' ? job.loaded : 0), 0));
const progress = computed(() => (totalBytes.value ? Math.min(1, sentBytes.value / totalBytes.value) : 0));

const title = computed(() => {
    if (active.value) return `Uploading ${active.value} file${active.value === 1 ? '' : 's'}`;
    if (failedCount.value) return `${failedCount.value} upload${failedCount.value === 1 ? '' : 's'} failed`;
    return `${doneCount.value} uploaded`;
});
const sub = computed(() => `${formatBytes(sentBytes.value)} of ${formatBytes(totalBytes.value)}${speed.value ? ` · ${speed.value}` : ''}`);

/** The running uploads' combined rate, from when each began. */
const speed = computed(() => {
    let rate = 0;
    for (const job of props.jobs) {
        if (job.status !== 'uploading' || !job.startedAt) continue;
        const seconds = (Date.now() - job.startedAt) / 1000;
        if (seconds > 1) rate += job.loaded / seconds;
    }
    return rate > 0 ? `${formatBytes(rate)}/s` : '';
});

function jobLine(job: UploadJob) {
    switch (job.status) {
        case 'queued': return `Waiting · ${formatBytes(job.size)}`;
        case 'uploading': return `${formatBytes(job.loaded)} of ${formatBytes(job.size)}`;
        case 'done': return `Uploaded · ${formatBytes(job.size)}`;
        case 'cancelled': return 'Cancelled';
        default: return job.error || 'Failed';
    }
}
</script>
