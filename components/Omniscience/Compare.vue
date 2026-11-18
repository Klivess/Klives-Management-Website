<template>
    <section class="omx-card" data-testid="omx-compare-card">
        <div class="omx-card-head">
            <h2>Side by side</h2><span class="omx-sub">{{ data ? `${data.shared_conversation_count ?? 0} shared conversations` : '' }}</span>
            <div class="omx-acts"><button class="omx-btn quiet sm icon" type="button" aria-label="Close the comparison" @click="emit('close')"><OmniscienceIcon name="close" /></button></div>
        </div>
        <div v-if="error" class="omx-card-body"><div class="omx-error" role="alert"><span class="omx-grow">{{ error }}</span><button class="omx-btn sm" type="button" @click="load()">Try again</button></div></div>
        <div v-else-if="!data" class="omx-skels"><div class="omx-skel" style="width: 70%"></div><div class="omx-skel" style="width: 50%"></div></div>
        <div v-else class="omx-card-body">
            <div class="omx-compare">
                <div v-for="side in SIDES" :key="side">
                    <div class="omx-person" style="margin-bottom: 10px">
                        <span class="omx-avatar lg" :class="data[side]?.tier">{{ omxInitials(data[side]?.display_name) }}</span>
                        <div>
                            <button class="omx-link" type="button" style="color: inherit; font-size: 15px; font-weight: 650" @click="omx.openPerson(side === 'left' ? left : right)">{{ data[side]?.display_name || '(unnamed)' }}</button>
                            <small>{{ data[side]?.tier }}</small>
                        </div>
                    </div>
                    <dl class="omx-kv">
                        <dt>Messages</dt><dd class="omx-num">{{ omxNum(data[side]?.message_count) }}</dd>
                        <dt>Facts</dt><dd class="omx-num">{{ omxNum(data[side]?.facts) }}</dd>
                        <dt>Relationships</dt><dd class="omx-num">{{ omxNum(data[side]?.relationships) }}</dd>
                        <dt>First seen</dt><dd>{{ omxDate(data[side]?.first_message_at) }}</dd>
                        <dt>Last seen</dt><dd>{{ omxDate(data[side]?.last_message_at) }}</dd>
                    </dl>
                </div>
            </div>
            <div class="omx-two" style="margin-top: 14px">
                <div>
                    <div class="omx-h">How they are linked</div>
                    <ul v-if="(data.relationship_links ?? []).length" class="omx-rows" style="margin: 0 -14px">
                        <li v-for="(link, i) in data.relationship_links" :key="i">
                            <div class="omx-row-main"><strong>{{ link.rel_type }}</strong><small>{{ omxDate(link.valid_from) }} to {{ link.valid_to ? omxDate(link.valid_to) : 'now' }}</small></div>
                            <span class="omx-chip">{{ Math.round((link.confidence ?? 0) * 100) }}%</span>
                        </li>
                    </ul>
                    <p v-else class="omx-dim">No recorded relationship between them.</p>
                </div>
                <div>
                    <div class="omx-h">Where they both talk</div>
                    <div v-if="(data.shared_conversations ?? []).length" class="omx-chips">
                        <span v-for="c in data.shared_conversations" :key="c.conversation_id" class="omx-chip" :title="c.context_kind">{{ c.title || c.conversation_id }}</span>
                    </div>
                    <p v-else class="omx-dim">They share no conversation.</p>
                    <p v-if="data.message_ratio" class="omx-dim" style="margin-top: 8px">Message ratio {{ data.message_ratio }}</p>
                </div>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { omxDate, omxErrorText, omxInitials, omxNum } from '~/scripts/omniscienceConsole';

/** Two people next to each other: how much is held on each, how they are linked, and where they overlap. */
const props = defineProps<{ left: string; right: string }>();
const emit = defineEmits<{ close: [] }>();
const SIDES = ['left', 'right'] as const;
const omx = useOmx();
const data = ref<any>(null);
const error = ref('');

async function load() {
    data.value = null; error.value = '';
    try { data.value = await omx.api.get(`/omniscience/workspace/compare?left=${encodeURIComponent(props.left)}&right=${encodeURIComponent(props.right)}`); }
    catch (cause) { error.value = omxErrorText(cause, 'The comparison could not be made.'); }
}
watch(() => [props.left, props.right], load, { immediate: true });
</script>
