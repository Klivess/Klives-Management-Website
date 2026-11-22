<template>
    <ul class="quotes" data-testid="quotes">
        <li v-for="(m, i) in messages" :key="`${m.messageId}-${i}`" :class="{ gone: m.deleted }">
            <q v-if="m.text || m.quote" class="said"><template v-for="(part, j) in parts(m)" :key="j"><mark v-if="part.hit">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></q>
            <span v-else class="omni-muted">This message can no longer be read.</span>
            <span class="by">
                <NuxtLink v-if="m.authorPersonId" :to="omniPersonLink(m.authorPersonId)">{{ omniPersonLabel(m.authorName) }}</NuxtLink><span v-else>Someone</span>
                <template v-if="m.guildId || m.guildName">
                    · <span v-if="m.conversationTitle">#{{ m.conversationTitle }} in </span><NuxtLink v-if="m.guildId" :to="omniPlaceLink('guild', m.guildId)!">{{ m.guildName ?? 'a server with no name' }}</NuxtLink><span v-else>{{ m.guildName }}</span>
                </template>
                <template v-else-if="m.conversationKind === 'dm'"> · in a direct chat</template>
                <template v-else-if="m.conversationId">
                    · in <NuxtLink :to="omniPlaceLink('conversation', m.conversationId)!">{{ m.conversationTitle ?? 'a group chat' }}</NuxtLink>
                </template>
                · <OmniscienceV3Time :ms="m.sentAtMs" mode="absolute" />
                <span v-if="m.edited" class="omni-chip sm" title="The words above are the message as it reads now">edited since</span>
                <span v-if="m.deleted" class="omni-chip sm warn">deleted at the source</span>
            </span>
        </li>
    </ul>
</template>

<script setup lang="ts">
import type { EvidenceContextDto } from '~/scripts/omniscience/contracts';
import { omniPersonLabel, omniPersonLink, omniPlaceLink } from '~/composables/useOmniscienceV3';

/**
 * Messages as people read them: the words (with the part that matters marked), who said them as a link to that person,
 * where (the server and channel, or the chat, as a link to its community page) and when. Never an id.
 */
const props = withDefaults(defineProps<{
    messages: readonly EvidenceContextDto[];
    /** Words to mark in every message (a name in question), besides each message's own quote. */
    mark?: string | null;
}>(), { mark: null });

function parts(m: EvidenceContextDto): { text: string; hit: boolean }[] {
    const text = m.text ?? m.quote ?? '';
    const needle = (props.mark ?? (m.text && m.quote && m.quote !== m.text ? m.quote : null))?.trim();
    if (!needle) return [{ text, hit: false }];
    const out: { text: string; hit: boolean }[] = [];
    const lower = text.toLowerCase(), want = needle.toLowerCase();
    let at = 0;
    for (let i = lower.indexOf(want); i >= 0; i = lower.indexOf(want, i + want.length)) {
        if (i > at) out.push({ text: text.slice(at, i), hit: false });
        out.push({ text: text.slice(i, i + want.length), hit: true });
        at = i + want.length;
    }
    if (at < text.length) out.push({ text: text.slice(at), hit: false });
    return out.length ? out : [{ text, hit: false }];
}
</script>

<style scoped>
.quotes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.quotes li { display: flex; flex-direction: column; gap: 3px; font-size: 13px; padding-left: 10px; border-left: 2px solid var(--omni-line-strong); min-width: 0; }
.quotes li.gone { opacity: 0.65; }
.said { overflow-wrap: anywhere; }
.said mark { background: var(--omni-accent-soft); color: inherit; border-radius: 3px; padding: 0 2px; }
.by { font-size: 12px; color: var(--omni-muted); }
.by .omni-chip { margin-left: 4px; vertical-align: middle; }
.by a { text-decoration: underline dotted; text-decoration-color: var(--omni-line-strong); text-underline-offset: 3px; }
.by a:hover { color: var(--omni-accent); text-decoration-color: currentColor; }
</style>
