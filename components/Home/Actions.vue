<template>
  <section class="hom-actions" aria-label="Quick actions" data-testid="home-actions">
    <form v-if="caps.ask" class="hom-ask" data-testid="home-ask" @submit.prevent="submit">
      <HomeIcon class="hom-ask__mark" name="agent" />
      <input
        ref="askInput"
        v-model="text"
        class="hom-ask__input"
        type="text"
        maxlength="8000"
        placeholder="Ask KliveAgent…"
        aria-label="Ask KliveAgent"
        aria-keyshortcuts="/"
        autocomplete="off"
        data-testid="home-ask-input"
        @keydown.esc="text = ''; askInput?.blur()"
      />
      <span v-if="!text" class="hom-kbd" aria-hidden="true">/</span>
      <button v-else class="hom-ask__send" type="submit" aria-label="Send to KliveAgent" data-testid="home-ask-send"><HomeIcon name="send" /></button>
    </form>

    <div class="hom-quick">
      <button v-if="caps.upload" class="hom-qa" :disabled="upload.active" title="Upload to KliveCloud (U), or drop files anywhere on this page" data-testid="qa-upload" @click="emit('upload')">
        <span class="hom-qa__icon"><HomeIcon name="upload" /></span>
        <span class="hom-qa__text">
          <b>{{ upload.active ? `Uploading ${upload.percent}%` : 'Upload' }}</b>
          <small>{{ upload.active ? `${upload.done + 1} of ${upload.total} · ${upload.name}` : 'to KliveCloud' }}</small>
        </span>
        <span v-if="upload.active" class="hom-qa__progress" :style="{ transform: `scaleX(${upload.percent / 100})` }"></span>
      </button>

      <NuxtLink v-if="caps.newProject" class="hom-qa" to="/projects/new" data-testid="qa-new-project">
        <span class="hom-qa__icon"><HomeIcon name="plus" /></span>
        <span class="hom-qa__text"><b>New project</b><small>brief a task force</small></span>
      </NuxtLink>

      <button v-if="mailCode" class="hom-qa hom-qa--code" :title="`${mailCode.subject} — from ${mailCode.from}`" data-testid="qa-copy-code" @click="emit('copy-code')">
        <span class="hom-qa__icon"><HomeIcon name="key" /></span>
        <span class="hom-qa__text"><b class="hom-mono" data-testid="qa-code">{{ mailCode.code }}</b><small>{{ mailCode.from }} · {{ age(mailCode.at) }}</small></span>
        <HomeIcon class="hom-qa__tail" name="copy" />
      </button>
      <NuxtLink v-else-if="mailOpen" class="hom-qa" to="/klivemail" data-testid="qa-mail">
        <span class="hom-qa__icon"><HomeIcon name="mail" /></span>
        <span class="hom-qa__text"><b>Mail</b><small>{{ mailUnread != null ? `${fmtInt(mailUnread)} unread` : 'every mailbox' }}</small></span>
      </NuxtLink>

      <button class="hom-qa" title="Search pages and actions (Ctrl K)" data-testid="qa-palette" @click="emit('palette')">
        <span class="hom-qa__icon"><HomeIcon name="command" /></span>
        <span class="hom-qa__text"><b>Go to…</b><small><span class="hom-kbd">Ctrl</span><span class="hom-kbd">K</span></small></span>
      </button>
    </div>

    <div v-if="controls.length" class="hom-controls" aria-label="Controls">
      <button
        v-for="control in controls"
        :key="control.id"
        class="hom-ctl"
        :data-tone="control.tone"
        :disabled="control.disabled"
        :title="control.title"
        :data-testid="`ctl-${control.id}`"
        @click="emit('control', control.id)"
      >
        <HomeIcon :name="control.icon" :class="{ 'hom-spin': control.spinning }" />{{ control.label }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { fmtInt, fmtRelative } from '~/scripts/adminConsole';
import type { MailCode } from '~/scripts/home';

/*
 * The things people come to Home to do: ask the agent, put a file in the cloud, start a project, grab the
 * sign-in code that just arrived. The stronger controls sit below, each asking before it acts.
 */
const props = defineProps<{
  caps: { ask: boolean; upload: boolean; newProject: boolean; restart: boolean; fleet: boolean; safeMode: boolean };
  upload: { active: boolean; done: number; total: number; percent: number; name: string };
  mailCode: MailCode | null;
  mailUnread: number | null;
  mailOpen: boolean;
  stopped: string[];
  fleet: { live: number; halted: number };
  safeModeOn: boolean | null;
  pending: { restart: string; fleet: boolean; safeMode: boolean };
  now: number;
}>();
const emit = defineEmits<{ ask: [text: string]; upload: []; 'copy-code': []; palette: []; control: [id: string] }>();

const text = ref('');
const askInput = ref<HTMLInputElement | null>(null);

function submit() {
  const value = text.value.trim();
  if (!value) return;
  emit('ask', value);
  text.value = '';
}

function focusAsk() { askInput.value?.focus(); }
defineExpose({ focusAsk });

const age = (at: number) => fmtRelative(at, props.now);

const controls = computed(() => {
  const list: Array<{ id: string; label: string; icon: string; tone: string; title: string; disabled?: boolean; spinning?: boolean }> = [];
  if (props.caps.restart && props.stopped.length) {
    const name = props.stopped[0];
    list.push({ id: 'restart', label: props.pending.restart ? `Restarting ${props.pending.restart}` : `Restart ${name}`, icon: 'restart', tone: 'warn', title: `Start ${name} again`, disabled: !!props.pending.restart, spinning: !!props.pending.restart });
  }
  if (props.caps.fleet && props.fleet.live) {
    if (props.fleet.halted === props.fleet.live) list.push({ id: 'resume', label: 'Resume fleet', icon: 'play', tone: 'ok', title: `Un-halt all ${props.fleet.halted} projects`, disabled: props.pending.fleet, spinning: props.pending.fleet });
    else list.push({ id: 'halt', label: 'Halt fleet', icon: 'pause', tone: 'warn', title: `Halt the ${props.fleet.live - props.fleet.halted} running projects`, disabled: props.pending.fleet, spinning: props.pending.fleet });
  }
  if (props.caps.safeMode && props.safeModeOn === false) list.push({ id: 'safe-mode', label: 'Firm safe mode', icon: 'shield', tone: 'crit', title: 'Block new Firm orders', disabled: props.pending.safeMode, spinning: props.pending.safeMode });
  return list;
});
</script>
