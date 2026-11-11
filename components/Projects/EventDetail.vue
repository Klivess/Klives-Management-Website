<template>
  <Teleport to="body">
    <template v-if="event">
      <div class="pjx-layer pjx-scrim" @click="$emit('close')"></div>
      <aside ref="root" class="pjx-layer pjx-sheet" role="dialog" aria-modal="true" tabindex="-1"
        :aria-label="`Event ${event.sequence ?? ''} · ${event.type}`" @keydown.esc="$emit('close')">
        <header class="pjx-sheet__head">
          <div class="pjx-sheet__titles">
            <div class="pjx-sheet__title ed-title">
              <span class="ed-type" :style="{ '--tone': typeColor }">{{ event.type }}</span>
              <span v-if="event.sequence != null" class="pjx-faint pjx-mono">#{{ event.sequence }}</span>
            </div>
            <div class="pjx-sheet__sub">{{ whoLabel }} · {{ fullTime }}</div>
          </div>
          <button class="pjx-iconbtn" aria-label="Close" @click="$emit('close')"><ProjectsIcon name="x" /></button>
        </header>

        <div class="pjx-sheet__body ed-body">
          <dl class="pjx-ledger__kv ed-kv">
            <dt>Who</dt><dd>{{ whoLabel }}</dd>
            <dt>When</dt><dd>{{ fullTime }}</dd>
            <template v-if="event.agentID"><dt>Agent</dt><dd class="pjx-mono">{{ event.agentID }}</dd></template>
            <template v-if="event.toolName"><dt>Tool</dt><dd><code class="pjx-mono ed-code">{{ event.toolName }}</code></dd></template>
            <template v-if="event.wakeID"><dt>Wake</dt><dd class="pjx-mono" :title="event.wakeID">{{ shortId(event.wakeID) }}</dd></template>
          </dl>

          <section v-if="event.text" class="ed-section" aria-label="Detail">
            <div class="ed-label">Detail <button class="pjx-btn pjx-btn--ghost pjx-btn--xs" @click="copy(event.text, 'Detail')"><ProjectsIcon name="copy" />Copy</button></div>
            <div class="ed-text">{{ event.text }}</div>
          </section>

          <section v-if="prettyPayload" class="ed-section" aria-label="Payload">
            <div class="ed-label">Payload <button class="pjx-btn pjx-btn--ghost pjx-btn--xs" @click="copy(prettyPayload, 'Payload')"><ProjectsIcon name="copy" />Copy</button></div>
            <pre class="ed-payload pjx-mono">{{ prettyPayload }}</pre>
          </section>

          <section v-if="event.artifactIDs && event.artifactIDs.length" class="ed-section" aria-label="Artifacts">
            <div class="ed-label">Artifacts</div>
            <div class="ot-os pjx-embed ed-artifacts">
              <ProjectsArtifactImage v-for="id in event.artifactIDs" :key="id" :project-id="projectId" :artifact-id="id" />
            </div>
          </section>
        </div>
      </aside>
    </template>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import ProjectsArtifactImage from '~/components/Projects/ArtifactImage.vue';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import { EVENT_TYPE_COLORS } from '~/components/Projects/eventColors';
import { copyToClipboard } from '~/scripts/agentMarkdown';
import { usePjxToasts } from '~/composables/useProjectsConsole';

const props = defineProps<{ projectId: string; event: any | null }>();
defineEmits<{ (e: 'close'): void }>();

const root = ref<HTMLElement | null>(null);
const { toast } = usePjxToasts();
const typeColor = computed(() => EVENT_TYPE_COLORS[props.event?.type] ?? '#8a8fa5');

const whoLabel = computed(() => {
  const a = props.event?.author;
  if (a === 'klives') return 'Klives';
  if (a === 'commander') return 'Commander';
  if (a === 'stimulus') return 'Stimulus';
  if (a === 'agent') return 'Agent ' + (props.event?.agentID || '');
  return 'System';
});

const fullTime = computed(() => {
  const d = new Date(props.event?.timestamp);
  return isNaN(d.getTime()) ? '' : d.toLocaleString();
});

const prettyPayload = computed(() => {
  const p = props.event?.payloadJson;
  if (!p) return '';
  try { return JSON.stringify(JSON.parse(p), null, 2); } catch { return p; }
});

function shortId(id: string) { return id ? id.slice(0, 8) : ''; }

async function copy(text: string, what: string) {
  try { await copyToClipboard(text); toast(`${what} copied.`, 'work', 2500); }
  catch { toast(`Could not copy the ${what.toLowerCase()}.`, 'fault'); }
}

// Focus the sheet when it opens, so Escape closes it without a click first.
watch(() => props.event, async e => { if (!e) return; await nextTick(); root.value?.focus(); });
</script>

<style scoped>
.ed-title { display: flex; align-items: center; gap: 8px; }
.ed-type {
  display: inline-flex; align-items: center; height: 22px; padding: 0 9px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tone) 40%, transparent);
  background: color-mix(in srgb, var(--tone) 14%, transparent);
  color: color-mix(in srgb, var(--tone) 70%, white);
  font-size: 12px; font-weight: 650;
}
.ed-body { display: flex; flex-direction: column; gap: 14px; }
.ed-kv { margin-top: 0; padding: 10px 12px; border: 1px solid var(--pjx-line); border-radius: 10px; background: rgba(168, 176, 214, 0.03); }
.ed-code { color: color-mix(in srgb, var(--pjx-accent) 75%, white); }
.ed-section { display: flex; flex-direction: column; gap: 6px; }
.ed-label { display: flex; align-items: center; justify-content: space-between; color: var(--pjx-ink-4); font-size: 10.5px; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; }
.ed-label .pjx-btn { text-transform: none; letter-spacing: 0; }
.ed-text { color: var(--pjx-ink); font-size: 13px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.ed-payload { max-height: 360px; margin: 0; padding: 10px; overflow: auto; border: 1px solid var(--pjx-line); border-radius: 9px; background: var(--pjx-inset); color: var(--pjx-ink-2); font-size: 11.5px; line-height: 1.5; }
.ed-artifacts { display: flex; flex-direction: column; gap: 8px; }
</style>
