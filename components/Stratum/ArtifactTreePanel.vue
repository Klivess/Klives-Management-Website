<template>
  <div class="artifact-tree" v-if="rootGroups.length">
    <section
      v-for="grp in rootGroups"
      :key="grp.role"
      class="tree-group"
    >
      <button
        class="tree-group-header"
        :class="{ collapsed: !grp.expanded }"
        @click="grp.expanded = !grp.expanded"
        type="button"
      >
        <span class="caret">{{ grp.expanded ? '▾' : '▸' }}</span>
        <span class="group-label">{{ grp.label }}</span>
        <span class="group-count">({{ grp.currentCount }})</span>
      </button>
      <div v-if="grp.expanded" class="tree-group-body">
        <!-- Per-subtask sub-groups, only when this role groups by subtask. -->
        <template v-if="grp.subgroups">
          <section
            v-for="sub in grp.subgroups"
            :key="sub.key"
            class="tree-subgroup"
          >
            <button
              class="tree-subgroup-header"
              :class="{ collapsed: !sub.expanded }"
              @click="sub.expanded = !sub.expanded"
              type="button"
            >
              <span class="caret">{{ sub.expanded ? '▾' : '▸' }}</span>
              <span class="subgroup-label">{{ sub.label }}</span>
            </button>
            <div v-if="sub.expanded" class="tree-subgroup-body">
              <ArtifactRow
                v-for="art in sub.current"
                :key="art.ArtifactID"
                :art="art"
                :active="art.ArtifactID === activeArtifactID"
                @click="$emit('select', art)"
              />
              <details v-if="sub.historical.length" class="history-toggle">
                <summary>Earlier iterations ({{ sub.historical.length }})</summary>
                <ArtifactRow
                  v-for="art in sub.historical"
                  :key="art.ArtifactID"
                  :art="art"
                  :active="art.ArtifactID === activeArtifactID"
                  superseded
                  @click="$emit('select', art)"
                />
              </details>
            </div>
          </section>
        </template>
        <!-- Flat artifact list when the role does not group by subtask. -->
        <template v-else>
          <ArtifactRow
            v-for="art in grp.current"
            :key="art.ArtifactID"
            :art="art"
            :active="art.ArtifactID === activeArtifactID"
            @click="$emit('select', art)"
          />
          <details v-if="grp.historical.length" class="history-toggle">
            <summary>Earlier snapshots ({{ grp.historical.length }})</summary>
            <ArtifactRow
              v-for="art in grp.historical"
              :key="art.ArtifactID"
              :art="art"
              :active="art.ArtifactID === activeArtifactID"
              superseded
              @click="$emit('select', art)"
            />
          </details>
        </template>
      </div>
    </section>
  </div>
  <div v-else class="muted">No artifacts in this revision yet.</div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import ArtifactRow from '~/components/Stratum/ArtifactRow.vue';

interface ArtifactDto {
  ArtifactID: string;
  Kind: string;
  FileName: string;
  ContentType: string;
  SizeBytes: number;
  ContentHash: string;
  CreatedAt: string;
  Metadata: Record<string, string>;
  Role?: string | null;
  SubtaskTitle?: string | null;
  SupersededByArtifactID?: string | null;
}

const props = defineProps<{
  artifacts: ArtifactDto[];
  activeArtifactID?: string | null;
}>();
defineEmits<{ (e: 'select', art: ArtifactDto): void }>();

// Role display order + which roles group by subtask.
const ROLE_ORDER: Array<{ role: string; label: string; groupBySubtask: boolean }> = [
  { role: 'assembly-snapshot', label: 'Assembly',    groupBySubtask: false },
  { role: 'part',              label: 'Parts',       groupBySubtask: true },
  { role: 'script',            label: 'Scripts',     groupBySubtask: true },
  { role: 'electronics-layout',label: 'Electronics layout',  groupBySubtask: false },
  { role: 'electronics-schematic', label: 'Schematics',      groupBySubtask: false },
  { role: 'wiring',            label: 'Wiring',      groupBySubtask: false },
  { role: 'bom',               label: 'BOM',         groupBySubtask: false },
  { role: 'firmware',          label: 'Firmware',    groupBySubtask: false },
  { role: 'simulation-result', label: 'Simulation',  groupBySubtask: false },
  { role: 'plan',              label: 'Plan',        groupBySubtask: false },
  { role: 'blueprint',         label: 'Blueprint',   groupBySubtask: false },
  { role: '__other__',         label: 'Other',       groupBySubtask: false },
];

interface Subgroup {
  key: string;
  label: string;
  current: ArtifactDto[];
  historical: ArtifactDto[];
  expanded: boolean;
}
interface Group {
  role: string;
  label: string;
  current: ArtifactDto[];
  historical: ArtifactDto[];
  subgroups: Subgroup[] | null;
  currentCount: number;
  expanded: boolean;
}

const groupState = reactive(new Map<string, { expanded: boolean }>());
const subgroupState = reactive(new Map<string, { expanded: boolean }>());

function rememberGroup(role: string, defaultExpanded: boolean): boolean {
  const cached = groupState.get(role);
  if (cached) return cached.expanded;
  groupState.set(role, { expanded: defaultExpanded });
  return defaultExpanded;
}
function rememberSubgroup(key: string, defaultExpanded: boolean): boolean {
  const cached = subgroupState.get(key);
  if (cached) return cached.expanded;
  subgroupState.set(key, { expanded: defaultExpanded });
  return defaultExpanded;
}

const rootGroups = computed<Group[]>(() => {
  const byRole = new Map<string, ArtifactDto[]>();
  for (const a of props.artifacts) {
    const role = (a.Role || '').toLowerCase() || '__other__';
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role)!.push(a);
  }

  const groups: Group[] = [];
  for (const meta of ROLE_ORDER) {
    const items = byRole.get(meta.role);
    if (!items || items.length === 0) continue;

    const current = items.filter(a => !a.SupersededByArtifactID);
    const historical = items.filter(a => !!a.SupersededByArtifactID);

    let subgroups: Subgroup[] | null = null;
    if (meta.groupBySubtask) {
      const bySubtask = new Map<string, ArtifactDto[]>();
      for (const a of items) {
        const key = (a.SubtaskTitle || '(unassigned)').trim();
        if (!bySubtask.has(key)) bySubtask.set(key, []);
        bySubtask.get(key)!.push(a);
      }
      subgroups = [];
      for (const [key, arr] of bySubtask) {
        const cur = arr.filter(a => !a.SupersededByArtifactID);
        const hist = arr.filter(a => !!a.SupersededByArtifactID);
        subgroups.push({
          key: `${meta.role}::${key}`,
          label: key,
          current: cur,
          historical: hist,
          expanded: rememberSubgroup(`${meta.role}::${key}`, true),
        });
      }
      subgroups.sort((a, b) => a.label.localeCompare(b.label));
    }

    groups.push({
      role: meta.role,
      label: meta.label,
      current,
      historical,
      subgroups,
      currentCount: current.length,
      expanded: rememberGroup(meta.role, true),
    });
  }
  return groups;
});

// Persist expand/collapse state across re-renders driven by long-poll refreshes.
watch(rootGroups, g => {
  for (const grp of g) groupState.set(grp.role, { expanded: grp.expanded });
}, { deep: true });
</script>

<style scoped>
.artifact-tree {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.tree-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tree-group-header,
.tree-subgroup-header {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: #d8d8d8;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  font-weight: 600;
  text-align: left;
}
.tree-group-header { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #aaa; }
.tree-subgroup-header { font-size: 12px; color: #cfd6db; font-weight: 500; padding-left: 12px; }
.tree-group-header:hover,
.tree-subgroup-header:hover { background: #2a2a2e; }
.caret { width: 12px; display: inline-block; color: #888; }
.group-count { color: #777; font-weight: 400; }
.tree-group-body { display: flex; flex-direction: column; gap: 2px; padding-left: 6px; }
.tree-subgroup { display: flex; flex-direction: column; gap: 2px; }
.tree-subgroup-body { display: flex; flex-direction: column; gap: 2px; padding-left: 16px; }
.history-toggle { padding-left: 16px; color: #888; font-size: 11px; }
.history-toggle summary { cursor: pointer; padding: 4px 0; }
.history-toggle summary:hover { color: #ccc; }
.muted { color: #666; font-size: 12px; }
</style>
