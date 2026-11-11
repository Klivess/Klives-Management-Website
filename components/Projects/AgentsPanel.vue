<template>
  <div class="pjx-ag">
    <div v-if="loading" class="pjx-empty"><ProjectsIcon name="refresh" class="pjx-spin" /><span>Loading the roster…</span></div>
    <template v-else>
      <div class="pjx-ag__bar">
        <div class="ap-slots pjx-ag__slots">
          <b class="pjx-num">{{ roster.length }} of {{ cap }} slots</b>
          <span v-if="free > 0" class="pjx-ag__free">{{ free }} free</span>
          <span v-else class="pjx-ag__full">roster full</span>
          <span class="pjx-slots" aria-hidden="true"><i v-for="n in Math.min(cap, 16)" :key="n" :data-on="n <= roster.length || undefined"></i></span>
        </div>
        <span class="pjx-dim pjx-ag__hint">Watch an agent with a desktop from its row. Retiring keeps its work.</span>
      </div>

      <!-- Work left behind by retired agents. It sits above the roster because it is the only thing here
           that nobody currently owns. -->
      <section v-if="handovers.length" class="ap-handovers pjx-ag__handovers" aria-label="Unclaimed work">
        <h4 class="pjx-gp__label">Unclaimed work <span class="pjx-num">{{ handovers.length }}</span></h4>
        <p class="pjx-dim pjx-ag__handover-note">Preserved from retired agents. The Commander picks each up, reassigns it, or drops it.</p>
        <ul class="pjx-ag__handover-list">
          <li v-for="h in handovers" :key="h.handoverID">
            <div class="pjx-ag__handover-top">
              <b class="pjx-ag__role">{{ h.role }}</b>
              <span class="pjx-dim">{{ reasonLabel(h.reason) }}</span>
              <span v-if="h.interruptedMidWake" class="pjx-chip" data-tone="need">interrupted mid-wake</span>
              <span class="pjx-faint pjx-ag__when">{{ shortTime(h.retiredAt) }}</span>
            </div>
            <p v-if="h.objective" class="pjx-ag__objective">{{ h.objective }}</p>
            <div class="pjx-ag__meta">
              <span v-if="h.activeMilestoneIDs?.length">{{ h.activeMilestoneIDs.length }} {{ h.activeMilestoneIDs.length === 1 ? 'milestone' : 'milestones' }} unowned</span>
              <span v-if="h.openDirectives">{{ h.openDirectives }} {{ h.openDirectives === 1 ? 'directive' : 'directives' }} reassigned</span>
              <span v-if="h.deliverablePaths?.length">{{ h.deliverablePaths.length }} expected {{ h.deliverablePaths.length === 1 ? 'deliverable' : 'deliverables' }}</span>
            </div>
          </li>
        </ul>
      </section>

      <ul class="ap-list pjx-ag__list">
        <li v-for="a in roster" :key="a.agentID" class="ap-item pjx-ag__item"
          :class="{ 'is-commander': isCommander(a), 'is-retiring': retiringID === a.agentID }" :data-awake="a.awake || undefined">
          <span class="pjx-ag__tier" :data-tone="tierTone(a.tier)" :title="tierTitle(a.tier)">{{ tierShort(a.tier) }}</span>
          <div class="pjx-ag__body">
            <div class="pjx-ag__head">
              <b class="pjx-ag__role">{{ isCommander(a) ? 'Commander' : a.role }}</b>
              <span v-if="a.awake" class="pjx-chip" data-tone="work" data-live><span class="pjx-chip__dot"></span>working</span>
              <span v-else-if="a.reclaimable" class="pjx-chip" data-tone="need">finished</span>
              <span v-if="a.mission === 'Standing'" class="pjx-chip pjx-chip--quiet" title="Owns an ongoing beat, not a bounded deliverable">standing</span>
            </div>
            <p v-if="a.objective" class="pjx-ag__objective pjx-truncate" :title="a.objective">{{ a.objective }}</p>
            <div class="pjx-ag__meta pjx-mono">
              <span>{{ a.agentID }}</span>
              <span v-if="a.parentAgentID">← {{ a.parentAgentID }}</span>
              <span v-if="a.workStatus">{{ a.workStatus.toLowerCase() }}</span>
              <span v-if="a.activeMilestoneIDs?.length">{{ a.activeMilestoneIDs.join(', ') }}</span>
            </div>
          </div>
          <div class="pjx-ag__tools">
            <button v-if="hasDesktop(a)" class="pjx-btn pjx-btn--sm" title="Watch its desktop" @click="pick(a)"><ProjectsIcon name="monitor" />Watch</button>
            <button v-if="!isCommander(a)" class="ap-retire pjx-btn pjx-btn--ghost pjx-btn--sm pjx-ag__retire" :disabled="!!retiringID"
              title="Retire this agent now: its work is preserved and handed to the Commander" @click.stop="askRetire(a)">Retire</button>
          </div>
        </li>
      </ul>
      <div v-if="retireError" class="pjx-banner" data-tone="fault" role="alert"><ProjectsIcon name="alert" /><div class="pjx-banner__body">{{ retireError }}</div></div>
    </template>

    <!-- Removing an agent is instant and destroys its container, so the cost is stated before it happens. -->
    <ProjectsDialog :open="!!confirming" :title="confirming ? `Retire ${confirming.role}?` : ''" @close="confirming = null">
      <div v-if="confirming" class="ap-modal pjx-ag__confirm">
        <p>It stops immediately and its desktop is destroyed. Everything it was working on is preserved and handed to the Commander,
          so the work continues: it just needs a new owner.</p>
        <ul class="pjx-ag__facts">
          <li v-if="confirming.awake" data-tone="need"><ProjectsIcon name="zap" />It is generating right now: its wake is cancelled mid-flight.</li>
          <li v-if="confirming.activeMilestoneIDs?.length"><ProjectsIcon name="target" />
            Owns {{ confirming.activeMilestoneIDs.length }} {{ confirming.activeMilestoneIDs.length === 1 ? 'milestone' : 'milestones' }}
            ({{ confirming.activeMilestoneIDs.join(', ') }}): they become unowned.
          </li>
          <li v-if="confirming.mission === 'Standing'" data-tone="need"><ProjectsIcon name="clock" />It owns a standing beat. Nothing continues that beat until someone else picks it up.</li>
          <li v-if="confirming.helperAgentIDs?.length" data-tone="need"><ProjectsIcon name="users" />
            <template v-if="confirming.helperAgentIDs.length === 1">Its helper {{ confirming.helperAgentIDs[0] }} is retired with it: a helper cannot outlive its parent.</template>
            <template v-else>Its {{ confirming.helperAgentIDs.length }} helpers ({{ confirming.helperAgentIDs.join(', ') }}) are retired with it: a helper cannot outlive its parent.</template>
          </li>
          <li v-if="isCleanRemoval" data-tone="work"><ProjectsIcon name="check" />Nothing in flight: this frees a slot cleanly.</li>
        </ul>
        <label class="ap-modal-note pjx-field">
          <span class="pjx-field__label">Why (optional: the Commander sees this)</span>
          <input v-model="retireNote" class="pjx-input" placeholder="e.g. too expensive for what it was producing" @keyup.enter="doRetire" />
        </label>
      </div>
      <template #foot>
        <button class="pjx-btn" @click="confirming = null">Cancel</button>
        <button class="pjx-btn pjx-btn--danger" :disabled="!!retiringID" @click="doRetire">{{ retiringID ? 'Retiring…' : 'Retire now' }}</button>
      </template>
    </ProjectsDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import ProjectsDialog from '~/components/Projects/Dialog.vue';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import { pjxGet, pjxPost } from '~/composables/useProjectsConsole';
import type { PjTone } from '~/scripts/projectsConsole';

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

const isCommander = (a: any) => !!a.isCommander || a.role === 'commander';
// Commander pinned first, then by creation time.
const roster = computed(() => [...agents.value].sort((a, b) => {
  if (isCommander(a)) return -1;
  if (isCommander(b)) return 1;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}));
const cap = computed(() => props.cap ?? roster.value.length);
const free = computed(() => Math.max(0, cap.value - roster.value.length));

// "Nothing in flight" must be the absence of every other line in the confirm, not just of the first three:
// an agent with helpers is not a clean removal however idle it is itself.
const isCleanRemoval = computed(() => {
  const a = confirming.value;
  return !!a && !a.awake && !a.activeMilestoneIDs?.length && a.mission !== 'Standing' && !a.helperAgentIDs?.length;
});

function containerFor(a: any) {
  return containers.value.find(c => c.agentID === a.agentID)
    || (isCommander(a) ? containers.value.find(c => !c.agentID) : null);
}
function hasDesktop(a: any) { return !!containerFor(a); }
function pick(a: any) { const c = containerFor(a); if (c) emit('watch', c.containerID); }

const TIERS: Record<string, { short: string; title: string; tone: PjTone }> = {
  Text: { short: 'T', title: 'Text model', tone: 'rest' },
  TextImage: { short: 'TI', title: 'Text + image model', tone: 'info' },
  TextImageVideo: { short: 'TIV', title: 'Text, image + video model', tone: 'work' },
  TextImageVideoAudio: { short: 'TIVA', title: 'Text, image, video + audio model', tone: 'need' },
};
const tierShort = (t: string) => TIERS[t]?.short ?? 'T';
const tierTitle = (t: string) => TIERS[t]?.title ?? 'Text model';
const tierTone = (t: string) => TIERS[t]?.tone ?? 'rest';

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
  if (!target || retiringID.value) return;
  retiringID.value = target.agentID;
  retireError.value = '';
  const r = await pjxPost('/projects/agents/retire', { projectID: props.projectId, agentID: target.agentID, note: retireNote.value.trim() || undefined });
  retiringID.value = null;
  if (!r.ok) {
    retireError.value = r.status === 409 ? 'The Commander cannot be retired: pause or shelve the project instead.' : r.error;
    confirming.value = null;
    return;
  }
  confirming.value = null;
  await load();
  // The cap, slot arithmetic and timeline all move with the roster, so the page reloads too.
  emit('roster-changed');
}

async function load() {
  const id = encodeURIComponent(props.projectId);
  const [ar, cr, hr] = await Promise.all([
    pjxGet<any[]>(`/projects/agents?projectID=${id}`),
    pjxGet<any[]>(`/projects/containers?projectID=${id}`),
    pjxGet<any[]>(`/projects/agents/handovers?projectID=${id}&open=true`),
  ]);
  if (ar.ok && Array.isArray(ar.body)) agents.value = ar.body;
  if (cr.ok && Array.isArray(cr.body)) containers.value = cr.body;
  if (hr.ok && Array.isArray(hr.body)) handovers.value = hr.body;
  loading.value = false;
}

defineExpose({ reload: load });

onMounted(() => { load(); poll = setInterval(() => { if (!document.hidden) load(); }, 5000); });
onBeforeUnmount(() => { if (poll) clearInterval(poll); });
</script>
