<template>
  <div class="agents-panel">
    <p class="ap-note">The fleet: the Commander and the sub-agents it has spawned. Click a desktop-capable agent to watch it work.</p>

    <div v-if="loading" class="ap-info">Loading roster…</div>
    <template v-else>
      <div class="ap-slots">
        <span class="ap-slot-count">{{ roster.length }} of {{ cap }} slots</span>
        <span v-if="free > 0" class="ap-slot-free">{{ free }} free</span>
        <span v-else class="ap-slot-full">roster full</span>
      </div>

      <!-- Work left behind by agents that have been retired. It sits above the roster because it is
           the only thing here that nobody currently owns. -->
      <section v-if="handovers.length" class="ap-handovers">
        <h4 class="ap-handovers-head">
          Unclaimed work
          <span class="ap-handovers-count">{{ handovers.length }}</span>
        </h4>
        <p class="ap-handovers-note">
          Preserved from retired agents. The Commander picks each of these up, reassigns it, or drops it.
        </p>
        <ul class="ap-handover-list">
          <li v-for="h in handovers" :key="h.handoverID" class="ap-handover">
            <div class="ap-handover-top">
              <span class="ap-handover-role">{{ h.role }}</span>
              <span class="ap-handover-reason">{{ reasonLabel(h.reason) }}</span>
              <span v-if="h.interruptedMidWake" class="ap-tag ap-tag-warn">interrupted mid-wake</span>
            </div>
            <p v-if="h.objective" class="ap-handover-objective">{{ h.objective }}</p>
            <div class="ap-handover-meta">
              <span v-if="h.activeMilestoneIDs?.length">
                {{ h.activeMilestoneIDs.length }} milestone{{ h.activeMilestoneIDs.length === 1 ? '' : 's' }} unowned
              </span>
              <span v-if="h.openDirectives">{{ h.openDirectives }} directive{{ h.openDirectives === 1 ? '' : 's' }} reassigned</span>
              <span v-if="h.deliverablePaths?.length">{{ h.deliverablePaths.length }} expected deliverable{{ h.deliverablePaths.length === 1 ? '' : 's' }}</span>
              <span class="ap-handover-when">{{ shortTime(h.retiredAt) }}</span>
            </div>
          </li>
        </ul>
      </section>

      <ul class="ap-list">
        <li
          v-for="a in roster"
          :key="a.agentID"
          class="ap-item"
          :class="{ 'is-commander': a.isCommander || a.role === 'commander', watchable: hasDesktop(a), 'is-retiring': retiringID === a.agentID }"
        >
          <div class="ap-badge" :style="{ background: tierColor(a.tier) }" @click="pick(a)">{{ tierShort(a.tier) }}</div>
          <div class="ap-body" @click="pick(a)">
            <div class="ap-role">
              {{ a.role }}
              <span v-if="hasDesktop(a)" class="ap-desktop" title="Has a desktop — click to watch">🖥️</span>
              <span v-if="a.awake" class="ap-tag ap-tag-live">working</span>
              <span v-else-if="a.reclaimable" class="ap-tag ap-tag-idle">finished</span>
              <span v-if="a.mission === 'Standing'" class="ap-tag" title="Owns an ongoing beat, not a bounded deliverable">standing</span>
            </div>
            <p v-if="a.objective" class="ap-objective">{{ a.objective }}</p>
            <div class="ap-meta">
              <span class="ap-id">{{ a.agentID }}</span>
              <span v-if="a.parentAgentID" class="ap-parent">← {{ a.parentAgentID }}</span>
              <span v-if="a.workStatus">{{ a.workStatus.toLowerCase() }}</span>
              <span v-if="a.activeMilestoneIDs?.length">{{ a.activeMilestoneIDs.join(', ') }}</span>
            </div>
          </div>
          <button
            v-if="!(a.isCommander || a.role === 'commander')"
            class="ap-retire"
            :disabled="!!retiringID"
            title="Retire this agent now — its work is preserved and handed to the Commander"
            @click.stop="askRetire(a)"
          >Retire</button>
        </li>
      </ul>
      <p v-if="retireError" class="ap-error">{{ retireError }}</p>
    </template>

    <!-- Removing an agent is instant and destroys its container, so it states the cost before it
         happens rather than reporting it afterwards. -->
    <div v-if="confirming" class="ap-modal-backdrop" @click.self="confirming = null">
      <div class="ap-modal">
        <h3>Retire {{ confirming.role }}?</h3>
        <p class="ap-modal-lead">
          It stops immediately and its desktop is destroyed. Everything it was working on is preserved
          and handed to the Commander, so the work continues — it just needs a new owner.
        </p>
        <ul class="ap-modal-facts">
          <li v-if="confirming.awake" class="is-warn">It is generating right now — its wake is cancelled mid-flight.</li>
          <li v-if="confirming.activeMilestoneIDs?.length">
            Owns {{ confirming.activeMilestoneIDs.length }} milestone{{ confirming.activeMilestoneIDs.length === 1 ? '' : 's' }}
            ({{ confirming.activeMilestoneIDs.join(', ') }}) — they become unowned.
          </li>
          <li v-if="confirming.mission === 'Standing'" class="is-warn">
            It owns a standing beat. Nothing continues that beat until someone else picks it up.
          </li>
          <li v-if="confirming.helperAgentIDs?.length" class="is-warn">
            <template v-if="confirming.helperAgentIDs.length === 1">
              Its helper {{ confirming.helperAgentIDs[0] }} is retired with it — a helper cannot outlive its parent.
            </template>
            <template v-else>
              Its {{ confirming.helperAgentIDs.length }} helpers ({{ confirming.helperAgentIDs.join(', ') }})
              are retired with it — a helper cannot outlive its parent.
            </template>
          </li>
          <li v-if="isCleanRemoval">Nothing in flight — this frees a slot cleanly.</li>
        </ul>
        <label class="ap-modal-note">
          <span>Why (optional — the Commander sees this)</span>
          <input v-model="retireNote" class="ap-modal-input" placeholder="e.g. too expensive for what it was producing" />
        </label>
        <div class="ap-modal-actions">
          <button class="ap-modal-cancel" @click="confirming = null">Cancel</button>
          <button class="ap-modal-go" :disabled="!!retiringID" @click="doRetire">
            {{ retiringID ? 'Retiring…' : 'Retire now' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

const props = defineProps<{ projectId: string; cap?: number }>();
const emit = defineEmits<{
  (e: 'watch', containerId: string): void;
  (e: 'roster-changed'): void;
}>();

const agents = ref<any[]>([]);
const containers = ref<any[]>([]);
const handovers = ref<any[]>([]);
const loading = ref(true);
const confirming = ref<any>(null);
const retiringID = ref<string | null>(null);
const retireNote = ref('');
const retireError = ref('');
let poll: ReturnType<typeof setInterval> | null = null;

// Commander pinned first, then by creation time.
const roster = computed(() => {
  return [...agents.value].sort((a, b) => {
    if (a.role === 'commander') return -1;
    if (b.role === 'commander') return 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
});
const cap = computed(() => props.cap ?? roster.value.length);
const free = computed(() => Math.max(0, cap.value - roster.value.length));

// "Nothing in flight" must be the absence of every other line in the modal, not just of the three it
// originally checked — an agent with helpers is not a clean removal however idle it is itself.
const isCleanRemoval = computed(() => {
  const a = confirming.value;
  return !!a && !a.awake && !a.activeMilestoneIDs?.length && a.mission !== 'Standing' && !a.helperAgentIDs?.length;
});

function containerFor(a: any) {
  return containers.value.find(c => c.agentID === a.agentID)
      || (a.role === 'commander' ? containers.value.find(c => !c.agentID) : null);
}
function hasDesktop(a: any) { return !!containerFor(a); }
function pick(a: any) { const c = containerFor(a); if (c) emit('watch', c.containerID); }

function tierShort(t: string) {
  return { Text: 'T', TextImage: 'TI', TextImageVideo: 'TIV', TextImageVideoAudio: 'TIVA' }[t] || 'T';
}
function tierColor(t: string) {
  return { Text: '#3a3a44', TextImage: '#17303a', TextImageVideo: '#1d3a1d', TextImageVideoAudio: '#3a2f17' }[t] || '#3a3a44';
}
function reasonLabel(r: string) {
  return ({
    CapLowered: 'slot reclaimed by a lower cap',
    KlivesRemoved: 'removed by you',
    ParentRetired: 'retired with its parent',
    CommanderRetired: 'retired by the Commander',
  } as Record<string, string>)[r] || 'retired';
}
function shortTime(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function askRetire(a: any) {
  retireError.value = '';
  retireNote.value = '';
  confirming.value = a;
}

async function doRetire() {
  const target = confirming.value;
  if (!target) return;
  retiringID.value = target.agentID;
  retireError.value = '';
  try {
    const res = await RequestPOSTFromKliveAPI('/projects/agents/retire', JSON.stringify({
      projectID: props.projectId,
      agentID: target.agentID,
      note: retireNote.value.trim() || undefined,
    }), false, true);
    if (!res.ok) {
      retireError.value = res.status === 409
        ? 'The Commander cannot be retired — pause or archive the project instead.'
        : `Retire failed (HTTP ${res.status}).`;
      return;
    }
    confirming.value = null;
    await load();
    // The cap, slot arithmetic and timeline all move with the roster, so the page reloads too.
    emit('roster-changed');
  } catch (e: any) {
    retireError.value = e?.message ? `Retire failed: ${e.message}` : 'Retire failed.';
  } finally {
    retiringID.value = null;
  }
}

async function load() {
  try {
    const [ar, cr, hr] = await Promise.all([
      RequestGETFromKliveAPI(`/projects/agents?projectID=${props.projectId}`, false, false),
      RequestGETFromKliveAPI(`/projects/containers?projectID=${props.projectId}`, false, false),
      RequestGETFromKliveAPI(`/projects/agents/handovers?projectID=${props.projectId}&open=true`, false, false),
    ]);
    if (ar.ok) agents.value = await ar.json();
    if (cr.ok) containers.value = await cr.json();
    if (hr.ok) handovers.value = await hr.json();
  } catch { /* transient */ }
  finally { loading.value = false; }
}

defineExpose({ reload: load });

onMounted(() => { load(); poll = setInterval(load, 5000); });
onBeforeUnmount(() => { if (poll) clearInterval(poll); });
</script>

<style scoped>
.agents-panel { padding: 4px 2px; }
.ap-note { font-size: 12px; color: #888; margin: 0 0 12px; }
.ap-slots { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #999; margin-bottom: 12px; }
.ap-slot-count { font-weight: 600; color: #ccc; }
.ap-slot-free { color: #4d9e39; }
.ap-slot-full { color: #d9c47f; }

.ap-handovers { background: #1a1820; border: 1px solid #3a2f4a; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
.ap-handovers-head { margin: 0 0 4px; font-size: 13px; color: #c9a8e0; display: flex; align-items: center; gap: 8px; }
.ap-handovers-count { background: #3a2f4a; border-radius: 10px; padding: 1px 7px; font-size: 11px; color: #e0cef0; }
.ap-handovers-note { margin: 0 0 10px; font-size: 11px; color: #8a7f99; }
.ap-handover-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.ap-handover { border-left: 2px solid #5a4a72; padding-left: 10px; }
.ap-handover-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ap-handover-role { font-size: 13px; color: #e6e6e6; font-weight: 600; text-transform: capitalize; }
.ap-handover-reason { font-size: 11px; color: #8a7f99; }
.ap-handover-objective { margin: 3px 0 0; font-size: 12px; color: #b0b0b0; }
.ap-handover-meta { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; color: #777; margin-top: 3px; }
.ap-handover-when { margin-left: auto; }

.ap-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.ap-item { display: flex; gap: 10px; align-items: center; background: #1c1c20; border-radius: 8px; padding: 10px 12px; border: 1px solid transparent; }
.ap-item.is-commander { border-color: #2e5426; }
.ap-item.watchable .ap-badge, .ap-item.watchable .ap-body { cursor: pointer; }
.ap-item.watchable:hover { border-color: #4d9e39; }
.ap-item.is-retiring { opacity: .5; }
.ap-badge { width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #cfe; flex-shrink: 0; }
.ap-body { flex: 1; min-width: 0; }
.ap-role { font-size: 14px; color: #e6e6e6; font-weight: 600; text-transform: capitalize; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ap-desktop { font-size: 12px; }
.ap-tag { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; background: #2a2a32; color: #999; border-radius: 4px; padding: 1px 5px; }
.ap-tag-live { background: #1d3a1d; color: #7fd97f; }
.ap-tag-idle { background: #3a3520; color: #d9c47f; }
.ap-tag-warn { background: #3a2020; color: #d99; }
.ap-objective { margin: 3px 0 0; font-size: 12px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ap-meta { display: flex; gap: 8px; flex-wrap: wrap; font-size: 11px; color: #777; font-family: ui-monospace, monospace; margin-top: 2px; }
.ap-retire { background: none; border: 1px solid #4a2a2a; color: #b07070; border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; flex-shrink: 0; }
.ap-retire:hover:not(:disabled) { background: #3a2020; border-color: #7a3a3a; color: #d99; }
.ap-retire:disabled { opacity: .4; cursor: default; }
.ap-info { color: #777; padding: 16px; text-align: center; font-size: 13px; }
.ap-error { color: #d95b5b; font-size: 12px; margin: 10px 0 0; }

.ap-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.65); display: flex; align-items: center; justify-content: center; z-index: 60; padding: 20px; }
.ap-modal { background: #1c1c20; border: 1px solid #3a3a42; border-radius: 10px; padding: 20px 22px; max-width: 460px; width: 100%; }
.ap-modal h3 { margin: 0 0 8px; font-size: 16px; color: #e6e6e6; text-transform: capitalize; }
.ap-modal-lead { margin: 0 0 12px; font-size: 13px; color: #aaa; line-height: 1.5; }
.ap-modal-facts { margin: 0 0 14px; padding-left: 18px; font-size: 12px; color: #999; display: flex; flex-direction: column; gap: 5px; }
.ap-modal-facts .is-warn { color: #d9c47f; }
.ap-modal-note { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #888; margin-bottom: 16px; }
.ap-modal-input { background: #141418; border: 1px solid #3a3a42; border-radius: 6px; padding: 8px 10px; color: #e6e6e6; font-size: 13px; }
.ap-modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
.ap-modal-cancel { background: none; border: 1px solid #3a3a42; color: #999; border-radius: 6px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
.ap-modal-go { background: #7a3a3a; border: none; color: #fff; border-radius: 6px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
.ap-modal-go:disabled { opacity: .5; cursor: default; }
</style>
