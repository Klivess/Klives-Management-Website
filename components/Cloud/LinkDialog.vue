<template>
    <CloudDialog :open="!!item || !!link" :title="title" :sub="sub" icon="link" tone="link" testid="kcl-link-dialog" @close="$emit('close')">
        <template v-if="current">
            <div>
                <span class="kcl-label">Link</span>
                <div class="kcl-copybox">
                    <input :value="url" readonly aria-label="Share link" data-testid="link-url" @focus="($event.target as HTMLInputElement).select()" />
                    <button class="kcl-btn kcl-btn--sm kcl-btn--primary" data-autofocus data-testid="link-copy" @click="$emit('copy', current)">
                        <KliveCloudIcon :name="copied ? 'check' : 'copy'" :size="13" />{{ copied ? 'Copied' : 'Copy' }}
                    </button>
                </div>
                <p v-if="current.problem" class="kcl-problem" style="margin-top: 8px"><KliveCloudIcon name="alert" :size="12" />{{ current.problemText }}</p>
                <p v-else-if="current.counted" class="kcl-hint" style="margin-top: 6px">{{ usage }}</p>
            </div>
        </template>

        <div v-if="isFolder">
            <span class="kcl-label">Visitors can</span>
            <div class="kcl-choice" role="group" aria-label="Visitors can">
                <button v-for="m in MODES" :key="m" class="kcl-choice__opt" :aria-pressed="mode === m" :data-testid="`link-mode-${m}`" @click="mode = m">
                    <b>{{ MODE_LABEL[m] }}</b><span>{{ MODE_HINT[m] }}</span>
                </button>
            </div>
        </div>
        <p v-else class="kcl-hint">Visitors can open and download this file. Nothing else on your drive is reachable from it.</p>

        <div>
            <span class="kcl-label">Expires</span>
            <div class="kcl-seg" role="group" aria-label="Expires">
                <button v-for="choice in EXPIRY_CHOICES" :key="choice.hours" class="kcl-seg__opt" :aria-pressed="hours === choice.hours" :data-testid="`link-expiry-${choice.hours}`" @click="hours = choice.hours">{{ choice.label }}</button>
                <button v-if="current?.expires && hours === KEEP" class="kcl-seg__opt" aria-pressed="true">{{ keepLabel }}</button>
            </div>
            <p v-if="!supportsUpdate && current" class="kcl-hint" style="margin-top: 6px">Changing an existing link's expiry needs the newer server.</p>
        </div>

        <template #actions>
            <span v-if="current && !dirty" class="kcl-dialog__note">Same address after any change.</span>
            <button class="kcl-btn kcl-btn--ghost" @click="$emit('close')">{{ current && !dirty ? 'Done' : 'Cancel' }}</button>
            <button v-if="!current" class="kcl-btn kcl-btn--primary" :disabled="busy" data-testid="link-create" @click="$emit('create', { mode, hours: hours === KEEP ? 0 : hours })">
                <KliveCloudIcon :name="busy ? 'refresh' : 'link'" :size="13" :class="{ 'kcl-spin': busy }" />Create link
            </button>
            <button v-else-if="dirty" class="kcl-btn kcl-btn--primary" :disabled="busy" data-testid="link-save" @click="save">Save</button>
        </template>
    </CloudDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { EXPIRY_CHOICES, MODE_HINT, MODE_LABEL, shareUrl, type DriveItem, type DriveLink } from '~/scripts/klivecloud/drive';
import { describeExpiry, formatBytes, type ShareMode } from '~/scripts/klivecloud/shared';

/* Make a link for an item, or change one (what visitors may do, when it expires). The address
   never changes; changing a link keeps everyone who already has it. */
const props = defineProps<{
    /** Making a new link for this. */
    item: DriveItem | null;
    /** Changing this one (or showing the one just made). */
    link: DriveLink | null;
    origin: string;
    now: number;
    busy: boolean;
    copied: boolean;
    supportsUpdate: boolean;
}>();
const emit = defineEmits<{
    close: [];
    create: [choice: { mode: ShareMode; hours: number }];
    update: [link: DriveLink, change: { mode?: ShareMode; hours?: number }];
    copy: [link: DriveLink];
}>();

const MODES: ShareMode[] = ['ReadOnly', 'Write', 'WriteDelete'];
/** "Leave the expiry as it is" while editing a link that has one. */
const KEEP = -1;

const mode = ref<ShareMode>('ReadOnly');
const hours = ref(0);

const current = computed(() => props.link);
const isFolder = computed(() => (props.link ? props.link.type === 'Folder' : props.item?.type === 'Folder'));
const url = computed(() => (current.value ? shareUrl(props.origin, current.value.code) : ''));
const title = computed(() => (current.value ? `Link to “${current.value.name}”` : props.item ? `Share “${props.item.name}” by link` : ''));
const sub = computed(() => (current.value ? 'Anyone with it can open this without signing in.' : 'Anyone with the link can open it without signing in.'));

const keepLabel = computed(() => (current.value?.expires ? describeExpiry(current.value.expires, props.now).text.replace(/^Expires /, '') : ''));
const dirty = computed(() => {
    const link = current.value;
    if (!link) return true;
    const modeChanged = isFolder.value && mode.value !== link.mode;
    const expiryChanged = hours.value !== KEEP && !(hours.value === 0 && !link.expires);
    return modeChanged || expiryChanged;
});

const usage = computed(() => {
    const link = current.value;
    if (!link) return '';
    if (!link.opens && !link.downloads) return 'Not opened yet.';
    const parts = [`Opened ${link.opens} time${link.opens === 1 ? '' : 's'}`];
    if (link.downloads) parts.push(`${link.downloads} download${link.downloads === 1 ? '' : 's'} (${formatBytes(link.bytesServed)})`);
    if (link.lastOpened) parts.push(`last ${new Date(link.lastOpened).toLocaleString()}`);
    return `${parts.join(', ')}.`;
});

function save() {
    const link = current.value;
    if (!link) return;
    const change: { mode?: ShareMode; hours?: number } = {};
    if (isFolder.value && mode.value !== link.mode) change.mode = mode.value;
    if (hours.value !== KEEP && !(hours.value === 0 && !link.expires)) change.hours = hours.value;
    emit('update', link, change);
}

watch(() => [props.item, props.link] as const, (now, before) => {
    const item = now[0];
    const link = now[1];
    const oldItem = before?.[0] ?? null;
    const oldLink = before?.[1] ?? null;
    if (link && link.code === oldLink?.code) return;
    if (link) {
        mode.value = link.mode;
        hours.value = link.expires ? KEEP : 0;
    } else if (item && item !== oldItem) {
        mode.value = 'ReadOnly';
        hours.value = 0;
    }
}, { immediate: true });
</script>
