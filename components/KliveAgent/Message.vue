<template>
  <article class="kax-msg" :class="[isUser ? 'kax-msg--user' : 'kax-msg--agent', { 'kax-msg--system': isSystem, 'kax-msg--speaking': speaking }]"
    :data-outcome="isUser ? undefined : outcome" :data-testid="isUser ? 'msg-user' : 'msg-agent'">
    <header class="kax-msg__head">
      <span class="kax-msg__who"><KliveAgentIcon v-if="!isUser" name="agent" />{{ who }}</span>
      <span v-if="isSpoken" class="kax-chip" data-tone="accent" title="Spoken in talk mode" data-testid="msg-spoken"><KliveAgentIcon name="mic" />spoken</span>
      <span v-if="speaking" class="kax-chip" data-tone="info" title="Being read aloud"><KliveAgentIcon name="wave" />speaking</span>
      <span v-if="time" class="kax-msg__time">{{ time }}</span>
      <span v-if="isUser && message.deliveryStatus === 'failed'" class="kax-chip" data-tone="crit">not delivered</span>
    </header>

    <!-- Klives's turn: a bubble. -->
    <template v-if="isUser">
      <div class="kax-msg__bubble" :data-delivery="message.deliveryStatus">{{ message.content }}</div>
      <div v-if="attachments.length" class="kax-files">
        <button v-for="file in attachments" :key="file.id || file.name" type="button" class="kax-file" :disabled="!file.id" @click="download(file)">
          <KliveAgentIcon :name="fileIcon(file)" />{{ file.name }}<small v-if="file.size">{{ fmtSize(file.size) }}</small>
        </button>
      </div>
    </template>

    <!-- The agent's turn: prose on the page, with how it is going above it. -->
    <div v-else class="kax-msg__body">
      <div v-if="showRun" class="kax-run">
        <span class="kax-chip kax-chip--dot" :data-tone="phaseTone" :data-pulse="message.pending || undefined" data-testid="msg-phase">{{ phaseLabel }}</span>
        <span v-if="message.iteration" class="kax-chip" data-tone="neutral">step {{ message.iteration }}</span>
        <span v-if="tokens" class="kax-chip" data-tone="neutral" :title="`${fmtInt(message.promptTokens)} prompt · ${fmtInt(message.completionTokens)} output tokens`">{{ tokens }}</span>
        <span v-if="scripts.length" class="kax-chip" :data-tone="failedScripts ? 'warn' : 'neutral'">{{ scripts.length }} script{{ scripts.length === 1 ? '' : 's' }}<template v-if="failedScripts"> · {{ failedScripts }} failed</template></span>
        <span v-if="message.pending && note" class="kax-run__note" :title="note">{{ note }}</span>
        <button v-if="message.pending" class="kax-btn kax-btn--xs kax-btn--danger" type="button" data-testid="msg-stop" @click="emit('stop')"><KliveAgentIcon name="stop" />Stop</button>
      </div>

      <div v-if="message.content" class="kax-md" v-html="renderMarkdown(message.content)"></div>
      <div v-else-if="message.pending" class="kax-typing" aria-label="Working"><span></span><span></span><span></span></div>

      <div v-if="attachments.length" class="kax-files">
        <button v-for="file in attachments" :key="file.id || file.name" type="button" class="kax-file" :disabled="!file.id" @click="download(file)">
          <KliveAgentIcon :name="fileIcon(file)" />{{ file.name }}<small v-if="file.size">{{ fmtSize(file.size) }}</small>
        </button>
      </div>

      <div v-if="activity.length || scripts.length" class="kax-steps">
        <button class="kax-steps__toggle" type="button" :aria-expanded="stepsOpen" @click="stepsOpen = !stepsOpen">
          <KliveAgentIcon name="chevron-right" />
          <span>{{ stepsSummary }}</span>
        </button>
        <template v-if="stepsOpen">
          <ol v-if="activity.length" class="kax-steps__list">
            <li v-for="(a, i) in activity" :key="i" class="kax-step">
              <span class="kax-step__n">#{{ a.iteration }}</span>
              <span class="kax-step__kind" :data-tone="kindTone(a.kind)">{{ a.kind || 'info' }}</span>
              <span class="kax-step__text">{{ a.text }}</span>
            </li>
          </ol>
          <KliveAgentScriptCard v-for="(s, si) in scripts" :key="si" :script="s" />
        </template>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { renderMarkdown } from '~/scripts/agentMarkdown';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';
import { OUTCOME_LABELS, PHASE_LABELS, fmtCompact, fmtInt, fmtSize, runOutcome } from '~/scripts/agentConsole';
import KliveAgentIcon from '~/components/KliveAgent/Icon.vue';
import KliveAgentScriptCard from '~/components/KliveAgent/ScriptCard.vue';

const props = defineProps<{ message: any; speaking?: boolean }>();
const emit = defineEmits<{ stop: [] }>();

const stepsOpen = ref(false);
const isUser = computed(() => props.message.role === 'User');
// An automatic continuation after a restart is written by the system, not by Klives.
const isSystem = computed(() => isUser.value && props.message.senderName === 'System');
const who = computed(() => (isSystem.value ? 'System · auto-continue' : isUser.value ? 'You' : 'KliveAgent'));
// Talk mode gives spoken turns an spk_ id, which the server stores too, so the badge survives a reload.
const isSpoken = computed(() => isUser.value && (props.message.spoken
  || String(props.message.messageId || props.message.clientMessageId || '').startsWith('spk_')));

const activity = computed<any[]>(() => (Array.isArray(props.message.activity) ? props.message.activity : []));
const scripts = computed<any[]>(() => (Array.isArray(props.message.scripts) ? props.message.scripts : []));
const failedScripts = computed(() => scripts.value.filter(s => s.success === false).length);
const attachments = computed<any[]>(() => (Array.isArray(props.message.attachments) ? props.message.attachments : []));

const outcome = computed(() => runOutcome(props.message));
const tokens = computed(() => {
  const p = Number(props.message.promptTokens) || 0;
  const c = Number(props.message.completionTokens) || 0;
  return p || c ? `↑${fmtCompact(p)} ↓${fmtCompact(c)}` : '';
});
// The strip shows while live, afterwards when it carried run data, and always when the turn did not finish normally.
const showRun = computed(() => props.message.pending || props.message.phase || tokens.value || scripts.value.length || outcome.value !== 'completed');
const phaseLabel = computed(() => (props.message.pending ? PHASE_LABELS[props.message.phase] || 'Working' : OUTCOME_LABELS[outcome.value]));
const phaseTone = computed(() => {
  if (props.message.pending) {
    const phase = props.message.phase || 'thinking';
    if (phase === 'running' || phase === 'steering') return 'warn';
    if (phase === 'observing') return 'info';
    return 'accent';
  }
  return { completed: 'ok', 'stopped-by-you': 'neutral', stopped: 'warn', interrupted: 'warn', failed: 'crit', running: 'accent' }[outcome.value];
});
const note = computed(() => {
  const text = String(props.message.statusNote || '').replace(/^[_\s…]+|[_\s]+$/g, '').trim();
  return text.length > 180 ? text.slice(0, 180) + '…' : text;
});
const stepsSummary = computed(() => {
  const parts: string[] = [];
  if (activity.value.length) parts.push(`${activity.value.length} step${activity.value.length === 1 ? '' : 's'}`);
  if (scripts.value.length) parts.push(`${scripts.value.length} script${scripts.value.length === 1 ? '' : 's'}${failedScripts.value ? ` (${failedScripts.value} failed)` : ''}`);
  return parts.join(' · ');
});
const time = computed(() => {
  const d = new Date(props.message.timestamp);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
});

function kindTone(kind: string | undefined) {
  return { script: 'info', tool: 'accent', think: 'neutral', error: 'crit' }[kind ?? ''] ?? 'neutral';
}
function fileIcon(file: any) {
  return file.mimeType?.startsWith('image/') ? 'image' : file.mimeType?.startsWith('video/') ? 'video' : 'file';
}
async function download(file: any) {
  const query = new URLSearchParams({ conversationId: file.conversationId, id: file.id });
  const response = await RequestGETFromKliveAPI(`/kliveagent/attachments/download?${query}`, false, false);
  if (!response.ok) return;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
</script>
