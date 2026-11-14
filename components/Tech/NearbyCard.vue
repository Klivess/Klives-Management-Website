<template>
  <article class="ktx-gadget ktx-gadget--nearby" :data-testid="`nearby-${device.address}`">
    <div class="ktx-gadget__head" style="cursor: default">
      <span class="ktx-led" data-tone="info" data-pulse></span>
      <span class="ktx-gadget__id">
        <span class="ktx-gadget__name ktx-truncate">{{ device.name || 'KliveTech device' }}</span>
        <span class="ktx-gadget__sub">
          <span class="ktx-tx" data-transport="bluetooth"><TechIcon name="radar" />Nearby</span>
          <span class="ktx-mono ktx-faint ktx-truncate">{{ device.address }}</span>
        </span>
      </span>
      <span class="ktx-gadget__state" data-tone="info">Not enrolled</span>
    </div>
    <div class="ktx-gadget__why">
      <p class="ktx-gadget__reason">
        Bluetooth saw it {{ device.sightings === 1 ? 'once' : `${device.sightings} times` }}, last {{ fmtAgo(device.lastSeenUtc, now) }}.
        {{ allowNew ? 'Enrolment is on, so it should connect on the next scan.' : 'Enrolment is off, so the hub left it alone.' }}
      </p>
      <div class="ktx-gadget__fix">
        <button v-if="canManage && !allowNew" class="ktx-btn ktx-btn--sm ktx-btn--signal" :disabled="device.enrolling || pending" :data-testid="`enrol-${device.address}`" @click="emit('enrol')">
          <TechIcon :name="device.enrolling ? 'refresh' : 'plus'" :class="{ 'ktx-spin': device.enrolling || pending }" />{{ device.enrolling ? 'Connecting…' : 'Enrol this one' }}
        </button>
      </div>
    </div>
    <footer class="ktx-gadget__foot">
      <span>first seen <b>{{ fmtClock(device.firstSeenUtc, now) }}</b></span>
      <span v-if="!allowNew">only this device is let in, for 10 minutes</span>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { fmtAgo, fmtClock, type NearbyStatus } from '~/scripts/kliveTech';

/** A KliveTech device Bluetooth discovery saw but did not connect, because enrolment is off. */
defineProps<{ device: NearbyStatus; now: number; canManage: boolean; allowNew: boolean; pending?: boolean }>();
const emit = defineEmits<{ enrol: [] }>();
</script>
