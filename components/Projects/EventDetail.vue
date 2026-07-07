<template>
  <transition name="drawer">
    <div v-if="event" class="ed-backdrop" @click.self="$emit('close')">
      <aside class="ed-drawer">
        <div class="ed-head">
          <div class="ed-head-main">
            <span class="ed-type" :style="{ background: typeColor + '22', color: typeColor }">{{ event.type }}</span>
            <span class="ed-seq">#{{ event.sequence }}</span>
          </div>
          <button class="ed-close" @click="$emit('close')">✕</button>
        </div>

        <div class="ed-meta">
          <div><span class="ed-k">Who</span><span>{{ whoLabel }}</span></div>
          <div><span class="ed-k">When</span><span>{{ fullTime }}</span></div>
          <div v-if="event.agentID"><span class="ed-k">Agent</span><span>{{ event.agentID }}</span></div>
          <div v-if="event.toolName"><span class="ed-k">Tool</span><span><code>{{ event.toolName }}</code></span></div>
          <div v-if="event.wakeID"><span class="ed-k">Wake</span><span class="ed-mono">{{ shortId(event.wakeID) }}</span></div>
        </div>

        <div v-if="event.text" class="ed-section">
          <div class="ed-label">Detail</div>
          <div class="ed-text">{{ event.text }}</div>
        </div>

        <div v-if="prettyPayload" class="ed-section">
          <div class="ed-label">Payload</div>
          <pre class="ed-payload">{{ prettyPayload }}</pre>
        </div>

        <div v-if="event.artifactIDs && event.artifactIDs.length" class="ed-section">
          <div class="ed-label">Artifacts</div>
          <ProjectsArtifactImage
            v-for="id in event.artifactIDs"
            :key="id"
            :project-id="projectId"
            :artifact-id="id"
          />
        </div>
      </aside>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ProjectsArtifactImage from '~/components/Projects/ArtifactImage.vue';
import { EVENT_TYPE_COLORS } from '~/components/Projects/eventColors';

const props = defineProps<{ projectId: string; event: any | null }>();
defineEmits<{ (e: 'close'): void }>();

const typeColor = computed(() => EVENT_TYPE_COLORS[props.event?.type] ?? '#888');

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
</script>

<style scoped>
.ed-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 40; display: flex; justify-content: flex-end; }
.ed-drawer { width: min(480px, 92vw); height: 100%; background: #161519; border-left: 1px solid #2a2a2e; padding: 18px; overflow-y: auto; box-shadow: -8px 0 24px rgba(0,0,0,0.4); }
.ed-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.ed-head-main { display: flex; align-items: center; gap: 8px; }
.ed-type { font-size: 12px; padding: 3px 10px; border-radius: 10px; font-weight: 600; }
.ed-seq { font-size: 12px; color: #666; }
.ed-close { background: none; border: none; color: #888; font-size: 16px; cursor: pointer; }
.ed-close:hover { color: #fff; }
.ed-meta { display: grid; gap: 6px; padding: 12px; background: #1c1c20; border-radius: 8px; margin-bottom: 14px; font-size: 13px; color: #ccc; }
.ed-meta > div { display: flex; gap: 10px; }
.ed-k { color: #777; min-width: 52px; }
.ed-mono, code { font-family: ui-monospace, monospace; color: #7fd97f; }
.ed-section { margin-bottom: 16px; }
.ed-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #777; margin-bottom: 6px; }
.ed-text { font-size: 14px; color: #e6e6e6; white-space: pre-wrap; line-height: 1.5; }
.ed-payload { font-size: 12px; color: #b7c4d0; background: #14141a; border: 1px solid #2a2a2e; border-radius: 6px; padding: 10px; overflow-x: auto; max-height: 320px; }
.drawer-enter-active, .drawer-leave-active { transition: opacity 0.15s; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
</style>
