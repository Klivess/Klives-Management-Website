<template>
  <div>
    <div v-if="!people.length || !services.length" class="pfx-empty"><PeopleIcon name="grid" />{{ services.length ? 'No profiles to compare.' : 'Loading the permission catalog…' }}</div>
    <div v-else class="pfx-matrix" role="region" aria-label="Who holds what">
      <table>
        <thead>
          <tr>
            <th scope="col" style="text-align: left; vertical-align: bottom">Service</th>
            <th v-for="p in people" :key="p.userId" scope="col">
              <button type="button" class="pfx-matrix__person" :title="`Open ${p.name}`" @click="emit('person', p.userId)">
                <PeopleAvatar :name="p.name" :id="p.userId" :owner="p.isOwner" :size="24" />
                <span class="pfx-dim">{{ p.name }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in matrix" :key="row.key">
            <th scope="row">{{ row.name }} <span class="pfx-faint pfx-num">{{ row.total }}</span></th>
            <td v-for="(cell, i) in row.cells" :key="people[i].userId">
              <button
                type="button"
                class="pfx-mcell"
                :data-tier="cell.held ? cell.topTier : undefined"
                :data-all="cell.all || undefined"
                :style="{ '--fill': cell.total ? (0.25 + 0.75 * cell.held / cell.total).toFixed(2) : 0 }"
                :title="cell.all ? `${people[i].name}: every ${row.name} permission (owner)` : `${people[i].name}: ${cell.held} of ${cell.total} ${row.name} permissions${cell.held ? `, up to ${TIER_NAMES[cell.topTier]}` : ''}`"
                :data-testid="`cell-${row.key}-${people[i].userId}`"
                @click="emit('cell', people[i].userId, row.key)"
              >{{ cell.all ? 'all' : cell.held ? `${cell.held}/${cell.total}` : '·' }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="pfx-matrix__legend">
      <span>Colour = the highest tier held, depth = how many:</span>
      <span v-for="t in [1, 2, 3, 4, 5]" :key="t" class="pfx-tier" :data-tier="t">{{ TIER_NAMES[t] }}</span>
      <span>· click a cell to edit that service</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CatalogService } from '~/scripts/profilesApi';
import { accessMatrix, TIER_NAMES } from '~/scripts/profilesConsole';

/** Services down, profiles across: who holds what, at which tier, on one screen. */
const props = defineProps<{ services: CatalogService[]; people: { userId: string; name: string; isOwner: boolean; effective: string[] | null | undefined }[] }>();
const emit = defineEmits<{ cell: [userId: string, service: string]; person: [userId: string] }>();
const matrix = computed(() => accessMatrix(props.services, props.people));
</script>
