<template>
    <div>
        <div class="kt-actions" style="margin-bottom:var(--kt-space-2)">
            <button class="kt-btn sm" :class="{ active: !paused }" @click="$emit('toggle')">
                {{ paused ? 'Resume' : 'Pause' }}
            </button>
            <button class="kt-btn ghost sm" :aria-pressed="actualSize" @click="actualSize = !actualSize">
                {{ actualSize ? 'Fit' : '1:1' }}
            </button>
            <button class="kt-btn ghost sm" @click="$emit('fetch')">Fetch frame</button>
            <span class="grow"></span>
            <span class="kt-chip mono">{{ mimeType || 'binary' }}</span>
        </div>

        <div class="viewport" :class="{ actual: actualSize }">
            <img v-if="frame?.url" :src="frame.url" :alt="`Latest frame from ${streamID}`" />
            <KliveTechStateBlock v-else-if="frame?.expired" kind="empty" compact
                title="That frame has expired"
                detail="The hub keeps only the two most recent frames per stream. The next one will appear here." />
            <KliveTechStateBlock v-else-if="frame?.error" kind="error" compact
                title="Could not fetch the frame" :detail="frame.error" />
            <KliveTechStateBlock v-else kind="empty" compact
                title="No frame yet"
                detail="Frames appear once the gadget publishes one on this stream." />
        </div>

        <dl v-if="frame?.url" class="kt-kv" style="margin-top:var(--kt-space-3)">
            <dt>Sequence</dt><dd>{{ frame.sequence ?? NO_VALUE }}</dd>
            <dt>Size</dt><dd>{{ fmtBytes(frame.bytes) }}</dd>
            <dt>Received</dt><dd>{{ fmtAgo(frame.receivedUtc, now) }}</dd>
            <dt>SHA-256</dt><dd class="mono">{{ frame.sha256 ? frame.sha256.slice(0, 24) + '…' : NO_VALUE }}</dd>
        </dl>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { fmtAgo, fmtBytes, NO_VALUE } from '~/scripts/kliveTech';
import type { FrameState } from '~/scripts/kliveTechLive';

withDefaults(defineProps<{
    frame: FrameState | undefined;
    streamID: string;
    mimeType?: string;
    paused?: boolean;
    now?: number;
}>(), { now: () => Date.now() });

defineEmits<{ toggle: []; fetch: [] }>();

const actualSize = ref(false);
</script>

<style scoped>
.viewport {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    max-height: 60vh;
    overflow: auto;
    background: var(--kt-inset);
    border: 1px solid var(--kt-line);
    border-radius: var(--kt-radius-sm);
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.6);
}
.viewport img { max-width: 100%; max-height: 60vh; display: block; }
.viewport.actual img { max-width: none; max-height: none; }
</style>
