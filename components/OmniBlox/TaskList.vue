<template>
    <ul class="bx-tasks">
        <li v-for="task in tasks" :key="task.TaskId" :class="{ closed: task.Status !== 'Open' }">
            <div class="top">
                <span class="ot-chip" :class="bloxIsGateTask(task.Kind) || task.Kind === 'Escalation' ? 'warn' : 'info'">{{ BLOX_TASK_LABEL[task.Kind] ?? 'Task' }}</span>
                <strong class="title">{{ task.Title }}</strong>
                <span class="when">
                    <NuxtLink v-if="task.GameId && showGame" :to="`/schemery/omniblox/game/${task.GameId}`">{{ gameTitle(task.GameId) }}</NuxtLink>
                    <template v-if="task.GameId && showGame"> · </template>
                    <time :datetime="task.CreatedUtc" :title="new Date(task.CreatedUtc).toString()">{{ fmtRelative(task.CreatedUtc, now) }}</time>
                    <template v-if="task.Status !== 'Open'"> · {{ task.Status.toLowerCase() }}</template>
                </span>
            </div>
            <p class="detail" :class="{ clamped: isLong(task) && !expanded.has(task.TaskId) }">{{ task.Detail }}</p>
            <button v-if="isLong(task)" type="button" class="ot-btn ghost sm more" @click="toggle(task.TaskId)">{{ expanded.has(task.TaskId) ? 'Show less' : 'Show all' }}</button>
            <div v-if="task.Status === 'Open'" class="actions">
                <button v-for="file in task.Files" :key="file" class="ot-btn sm" :disabled="!task.GameId" @click="download(task, file)">⤓ {{ file }}</button>
                <template v-if="task.Kind === 'BuildSignoff'">
                    <NuxtLink v-if="task.GameId" class="ot-btn primary sm" :to="`/schemery/omniblox/game/${task.GameId}?play=1`">▶ Play it</NuxtLink>
                    <button v-if="can('omniblox.studio.manage')" class="ot-btn sm" :disabled="busy === task.TaskId" @click="approve(task)">Approve build</button>
                </template>
                <template v-else-if="task.Kind === 'LaunchApproval'">
                    <button v-if="can('omniblox.studio.manage')" class="ot-btn primary sm" :disabled="busy === task.TaskId" @click="approve(task)">Approve launch</button>
                    <NuxtLink v-if="task.GameId" class="ot-btn ghost sm" :to="`/schemery/omniblox/game/${task.GameId}?tab=store`">Review first</NuxtLink>
                </template>
                <template v-else-if="can('omniblox.studio.act')">
                    <button v-if="BLOX_DELEGATABLE.has(task.Kind)" class="ot-btn sm" :disabled="busy === task.TaskId"
                            title="The studio does it itself (with your connected Roblox account where Roblox needs one), or hands it to the game's agent"
                            @click="delegate(task)">Do it yourself</button>
                    <button class="ot-btn primary sm" :disabled="busy === task.TaskId" @click="resolve(task, 'done')">Done</button>
                    <button class="ot-btn ghost sm" :disabled="busy === task.TaskId" @click="resolve(task, 'dismiss')">Dismiss</button>
                </template>
            </div>
        </li>
    </ul>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAccess } from '~/composables/useAccess';
import { fmtRelative, notify, useNow } from '~/composables/useOmniTumblr';
import { BLOX_DELEGATABLE, BLOX_TASK_LABEL, bloxDownload, bloxIsGateTask, bloxMediaPath, bloxPost, type BloxGameSummary, type BloxTask } from '~/composables/useOmniBlox';

const props = withDefaults(defineProps<{ tasks: BloxTask[]; games?: BloxGameSummary[]; showGame?: boolean }>(), { games: () => [], showGame: true });
const emit = defineEmits<{ changed: [] }>();
const { can } = useAccess();
const now = useNow();
const busy = ref<string | null>(null);
const expanded = ref(new Set<string>());

const isLong = (task: BloxTask) => task.Detail.length > 220 || task.Detail.split('\n').length > 3;
function toggle(id: string) {
    if (expanded.value.has(id)) expanded.value.delete(id);
    else expanded.value.add(id);
}

function gameTitle(id: string) {
    return props.games.find(g => g.GameId === id)?.Title ?? id;
}

async function resolve(task: BloxTask, action: 'done' | 'dismiss') {
    busy.value = task.TaskId;
    try {
        const result = await bloxPost('/omniblox/tasks/resolve', { taskId: task.TaskId, action });
        if (!result.ok) notify('Could not update the task', result.error ?? '', 'error');
        emit('changed');
    } finally {
        busy.value = null;
    }
}

/** "Do it yourself": the studio takes the task over, or says why only the owner can do it. */
async function delegate(task: BloxTask) {
    busy.value = task.TaskId;
    try {
        const result = await bloxPost<{ ok: boolean; message: string }>('/omniblox/tasks/delegate', { taskId: task.TaskId });
        if (!result.ok) notify('OmniBlox cannot take this one', result.error ?? '', 'warning');
        else notify('OmniBlox is on it', result.data?.message ?? '', 'info');
        emit('changed');
    } finally {
        busy.value = null;
    }
}

async function approve(task: BloxTask) {
    if (!task.GameId) return;
    const gate = task.Kind === 'BuildSignoff' ? 'build' : 'launch';
    busy.value = task.TaskId;
    try {
        const result = await bloxPost('/omniblox/games/approve', { gameId: task.GameId, gate });
        if (!result.ok) notify('Could not approve', result.error ?? '', 'error');
        else if (gate === 'build') notify('Build signed off', 'The marketer starts on the store page; the launch waits for your approval.');
        else notify('Launch approved', 'The studio publishes it on its next step.');
        emit('changed');
    } finally {
        busy.value = null;
    }
}

async function download(task: BloxTask, file: string) {
    if (!task.GameId) return;
    const ok = await bloxDownload(bloxMediaPath(task.GameId, file), `${gameTitle(task.GameId).replace(/[^\w.-]+/g, '-')}-${file}`);
    if (!ok) notify('Download failed', `${file} is not available.`, 'error');
}
</script>

<style scoped>
.bx-tasks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.bx-tasks li { padding: var(--ot-space-3) 0; display: flex; flex-direction: column; gap: 6px; }
.bx-tasks li + li { border-top: 1px solid var(--ot-line); }
.bx-tasks li.closed { opacity: 0.6; }
.top { display: flex; align-items: center; gap: var(--ot-space-2); flex-wrap: wrap; }
.title { font-size: 13px; }
.when { margin-left: auto; font-size: 11px; color: var(--ot-muted); }
.when a { color: var(--ot-info); text-decoration: none; }
.detail { margin: 0; font-size: 12.5px; line-height: 18px; color: var(--ot-text-2); white-space: pre-wrap; overflow-wrap: anywhere; }
.detail.clamped { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.more { align-self: flex-start; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
</style>
