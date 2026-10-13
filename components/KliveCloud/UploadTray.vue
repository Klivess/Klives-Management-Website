<template>
    <section class="kcu" :class="{ collapsed }" aria-label="Uploads">
        <header class="kcu-head">
            <span class="kcu-state" :class="tone">
                <span v-if="tone === 'busy'" class="kcu-spinner" aria-hidden="true"></span>
                <KliveCloudIcon v-else :name="tone === 'bad' ? 'alert' : 'check'" :size="15" />
            </span>
            <div class="kcu-titles">
                <strong>{{ title }}</strong>
                <span v-if="subtitle">{{ subtitle }}</span>
            </div>
            <button v-if="active" type="button" class="kcu-text" @click="emit('cancel-all')">Cancel</button>
            <button type="button" class="kcu-icon" :aria-label="collapsed ? 'Show uploads' : 'Hide uploads'" :aria-expanded="!collapsed" @click="collapsed = !collapsed">
                <KliveCloudIcon :name="collapsed ? 'chevron-up' : 'chevron-down'" :size="17" />
            </button>
            <button v-if="!active && !preparing" type="button" class="kcu-icon" aria-label="Close" @click="emit('clear')">
                <KliveCloudIcon name="close" :size="17" />
            </button>
        </header>
        <div class="kcu-progress" aria-hidden="true"><span :style="{ width: `${percent}%` }"></span></div>
        <ul v-if="!collapsed" class="kcu-list">
            <li v-for="job in jobs" :key="job.id" :class="job.status">
                <KliveCloudFileGlyph :kind="kindForName(job.fileName)" :size="26" />
                <div class="kcu-name">
                    <span>{{ job.label }}</span>
                    <small>{{ detail(job) }}</small>
                </div>
                <button v-if="job.status === 'queued' || job.status === 'uploading'" type="button" class="kcu-icon" :aria-label="`Cancel ${job.fileName}`" @click="emit('cancel', job.id)">
                    <KliveCloudIcon name="close" :size="15" />
                </button>
                <button v-else-if="(job.status === 'failed' || job.status === 'cancelled') && job.canRetry" type="button" class="kcu-icon" :aria-label="`Retry ${job.fileName}`" title="Retry" @click="emit('retry', job.id)">
                    <KliveCloudIcon name="refresh" :size="15" />
                </button>
                <span v-else-if="job.status === 'done'" class="kcu-done"><KliveCloudIcon name="check" :size="15" /></span>
                <span v-else class="kcu-done bad"><KliveCloudIcon name="alert" :size="15" /></span>
                <span v-if="job.status === 'uploading'" class="kcu-bar" :style="{ width: `${job.size ? (job.loaded / job.size) * 100 : 0}%` }"></span>
            </li>
        </ul>
    </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { formatBytes, kindForName, plural } from '~/scripts/klivecloud/shared';
import type { UploadJob } from '~/scripts/klivecloud/uploads';

const props = defineProps<{
    jobs: UploadJob[];
    /** Set while folders for a folder upload are being made. */
    preparing: string;
}>();

const emit = defineEmits<{ cancel: [id: number]; retry: [id: number]; 'cancel-all': []; clear: [] }>();

const collapsed = ref(false);
const counted = computed(() => props.jobs.filter(job => job.status !== 'cancelled'));
const activeJobs = computed(() => props.jobs.filter(job => job.status === 'queued' || job.status === 'uploading'));
const active = computed(() => activeJobs.value.length > 0);
const doneCount = computed(() => props.jobs.filter(job => job.status === 'done').length);
const failedCount = computed(() => props.jobs.filter(job => job.status === 'failed').length);
const totalBytes = computed(() => counted.value.reduce((sum, job) => sum + job.size, 0));
const loadedBytes = computed(() => counted.value.reduce((sum, job) => sum + (job.status === 'done' ? job.size : job.loaded), 0));
const percent = computed(() => (totalBytes.value ? Math.min(100, (loadedBytes.value / totalBytes.value) * 100) : active.value ? 0 : 100));

const tone = computed(() => (props.preparing || active.value ? 'busy' : failedCount.value ? 'bad' : 'ok'));

const title = computed(() => {
    if (props.preparing) return props.preparing;
    if (active.value) return `Uploading ${plural(activeJobs.value.length, 'file')}`;
    if (failedCount.value) return doneCount.value ? `${plural(doneCount.value, 'file')} uploaded, ${failedCount.value} failed` : `${plural(failedCount.value, 'upload')} failed`;
    return doneCount.value ? `${plural(doneCount.value, 'file')} uploaded` : 'Uploads cancelled';
});

// Speed over the last few seconds, for the time left.
const samples = ref<{ at: number; bytes: number }[]>([]);
let sampler: ReturnType<typeof setInterval> | undefined;
watch(active, running => {
    clearInterval(sampler);
    samples.value = [];
    if (!running) return;
    sampler = setInterval(() => {
        const next = [...samples.value, { at: Date.now(), bytes: loadedBytes.value }];
        samples.value = next.slice(-6);
    }, 1000);
}, { immediate: true });

const speed = computed(() => {
    const list = samples.value;
    if (list.length < 2) return 0;
    const first = list[0];
    const last = list[list.length - 1];
    return Math.max(0, (last.bytes - first.bytes) / ((last.at - first.at) / 1000));
});

function timeLeft(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    if (seconds < 50) return 'a few seconds left';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${plural(Math.max(1, minutes), 'minute')} left`;
    return `${plural(Math.round(minutes / 60), 'hour')} left`;
}

const subtitle = computed(() => {
    if (props.preparing || !active.value) return '';
    const parts = [`${formatBytes(loadedBytes.value)} of ${formatBytes(totalBytes.value)}`];
    if (speed.value > 0) {
        parts.push(`${formatBytes(speed.value)}/s`);
        const left = timeLeft((totalBytes.value - loadedBytes.value) / speed.value);
        if (left) parts.push(left);
    }
    return parts.join(' · ');
});

function detail(job: UploadJob) {
    switch (job.status) {
        case 'queued': return `Waiting · ${formatBytes(job.size)}`;
        case 'uploading': return `${formatBytes(job.loaded)} of ${formatBytes(job.size)}`;
        case 'done': return formatBytes(job.size);
        case 'cancelled': return 'Cancelled';
        default: return job.error || 'Failed';
    }
}

onBeforeUnmount(() => clearInterval(sampler));
</script>

<style scoped>
.kcu {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 150;
    width: min(380px, calc(100vw - 32px));
    border: 1px solid var(--ot-line-strong);
    border-radius: var(--ot-radius-lg);
    background: var(--ot-surface-2);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
    overflow: hidden;
    animation: kcu-in var(--ot-normal) ease-out;
}
@keyframes kcu-in { from { opacity: 0; transform: translateY(8px); } }

.kcu-head { display: flex; align-items: center; gap: 10px; padding: 10px 8px 10px 12px; }
.kcu-state {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    border-radius: 50%;
    color: var(--ot-positive);
    background: var(--ot-positive-soft);
}
.kcu-state.busy { background: var(--ot-accent-soft); }
.kcu-state.bad { color: var(--ot-negative); background: var(--ot-negative-soft); }
.kcu-spinner {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid rgba(109, 220, 79, 0.25);
    border-top-color: var(--ot-accent);
    animation: kcu-spin 0.8s linear infinite;
}
@keyframes kcu-spin { to { transform: rotate(360deg); } }
.kcu-titles { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.kcu-titles strong { font-size: 13.5px; font-weight: 620; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kcu-titles span { font-size: 11.5px; color: var(--ot-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }

.kcu-text {
    height: 28px;
    padding: 0 8px;
    border-radius: var(--ot-radius-sm);
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ot-text-2);
    cursor: pointer;
}
.kcu-text:hover { color: var(--ot-text); background: var(--ot-surface-3); }
.kcu-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    border-radius: var(--ot-radius-sm);
    color: var(--ot-text-2);
    cursor: pointer;
}
.kcu-icon:hover { color: var(--ot-text); background: var(--ot-surface-3); }

.kcu-progress { height: 2px; background: rgba(255, 255, 255, 0.06); }
.kcu-progress span { display: block; height: 100%; background: var(--ot-accent); transition: width 0.25s linear; }

.kcu-list { list-style: none; margin: 0; padding: 4px; max-height: min(300px, 45vh); overflow-y: auto; }
.kcu-list li {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 6px 6px 8px;
    border-radius: var(--ot-radius-sm);
    overflow: hidden;
}
.kcu-list li:hover { background: rgba(255, 255, 255, 0.025); }
.kcu-name { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.kcu-name span { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kcu-name small { font-size: 11.5px; color: var(--ot-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.kcu-list li.failed small { color: var(--ot-negative); }
.kcu-list li.cancelled { opacity: 0.6; }
.kcu-done { display: inline-flex; width: 28px; justify-content: center; color: var(--ot-positive); }
.kcu-done.bad { color: var(--ot-negative); }
.kcu-bar { position: absolute; left: 0; bottom: 0; height: 2px; background: var(--ot-accent); transition: width 0.25s linear; }

@media (max-width: 720px) {
    .kcu { right: 8px; left: 8px; bottom: 8px; width: auto; }
}
</style>
