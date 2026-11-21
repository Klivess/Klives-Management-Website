<template>
  <div class="twx-trip" :class="{ 'twx-trip--open': open, 'twx-trip--known': known, 'twx-trip--bare': bare }" :data-testid="`trip-${event.id}`">
    <button class="twx-trip__row" :class="{ 'twx-trip__row--all': showTripwire }" :aria-expanded="open" @click="emit('toggle')">
      <span class="twx-trip__when">
        <b class="twx-num">{{ ago(event.trippedUtc, now) }}</b>
        <small class="twx-num">{{ time }}</small>
      </span>

      <span v-if="showTripwire" class="twx-trip__wire">
        <b class="twx-truncate">{{ event.tripwireName || 'Tripwire' }}</b>
        <small class="twx-truncate">{{ event.targetLabel || 'Removed link' }}</small>
      </span>

      <span class="twx-trip__who">
        <template v-if="known">
          <span class="twx-chip twx-chip--you" :title="knownTitle"><TripwiresIcon name="user" />{{ known }}</span>
          <small>signed-in address</small>
        </template>
        <template v-else-if="bare">
          <span class="twx-chip" title="Do Not Track or Global Privacy Control was set, so only the time and link were kept"><TripwiresIcon name="privacy" />Private</span>
          <small>time and link only</small>
        </template>
        <template v-else-if="event.visitorHash">
          <span class="twx-visitor"><i :style="{ background: `hsl(${visitorHue(event.visitorHash)} 70% 62%)` }"></i>{{ visitorShort(event.visitorHash) }}</span>
          <small>{{ event.isUnique ? 'new visitor' : 'came back' }}</small>
        </template>
        <template v-else>
          <span class="twx-faint">Unknown</span>
        </template>
      </span>

      <span class="twx-trip__where">
        <b class="twx-truncate">{{ where || (bare ? '—' : 'No location') }}</b>
        <small class="twx-truncate">
          <span v-if="kind" class="twx-tag" :data-tone="NETWORK_TONE[kind]">{{ NETWORK_LABEL[kind] }}</span>
          {{ carrierText || (event.ipAddress ?? '') }}
        </small>
      </span>

      <span class="twx-trip__device">
        <b class="twx-truncate"><TripwiresIcon :name="event.deviceType === 'Mobile' || event.deviceType === 'Tablet' ? 'device' : 'desktop'" />{{ deviceText || '—' }}</b>
        <small class="twx-truncate">{{ fromText }}</small>
      </span>

      <span class="twx-trip__flags">
        <span v-if="event.isBot" class="twx-tag" data-tone="info" title="The user agent says this is a bot">Bot</span>
        <span v-if="event.doNotTrack && !bare" class="twx-tag" title="Sent Do Not Track or GPC; recorded because this tripwire does not honour it">DNT</span>
        <span v-if="event.discordNotified" class="twx-tag" data-tone="ok" title="Discord alert sent"><TripwiresIcon name="bell" /></span>
        <span v-else-if="event.notificationError" class="twx-tag" data-tone="crit" :title="`Discord alert failed: ${event.notificationError}`"><TripwiresIcon name="bell-off" /></span>
        <TripwiresIcon class="twx-trip__chev" name="chevron" />
      </span>
    </button>

    <div v-if="open" class="twx-trip__detail">
      <dl class="twx-facts">
        <div><dt>Exact time</dt><dd class="twx-num">{{ exact }}<span class="twx-faint"> · {{ event.trippedUtc.slice(0, 19).replace('T', ' ') }} UTC</span></dd></div>
        <div v-if="event.ipAddress">
          <dt>Address</dt>
          <dd>
            <code>{{ event.ipAddress }}</code>
            <button class="twx-mini" title="Copy the address" @click="emit('copy', event.ipAddress!)"><TripwiresIcon name="copy" /></button>
            <NuxtLink v-if="intel" class="twx-mini" :to="`/omnidefence?ip=${encodeURIComponent(event.ipAddress)}`" title="Open this address in OmniDefence"><TripwiresIcon name="shield" /></NuxtLink>
          </dd>
        </div>
        <div v-if="known"><dt>KM account</dt><dd>{{ knownTitle }}</dd></div>
        <div v-if="event.network"><dt>Network</dt><dd>{{ carrierText || '—' }}<span v-if="event.network.asn" class="twx-faint"> · {{ event.network.asn }}</span><span v-if="kind" class="twx-tag" :data-tone="NETWORK_TONE[kind]">{{ NETWORK_LABEL[kind] }}</span></dd></div>
        <div v-if="event.network?.tags"><dt>OmniDefence</dt><dd>{{ event.network.tags.split(',').filter(Boolean).join(' · ') }}<span v-if="event.network.defenceStatus && event.network.defenceStatus !== 'Normal'" class="twx-tag" data-tone="warn">{{ event.network.defenceStatus }}</span></dd></div>
        <div v-if="fullWhere">
          <dt>Location</dt>
          <dd>
            {{ fullWhere }}<span v-if="kind === 'vpn'" class="twx-faint"> (the VPN's exit, not the person)</span>
            <a v-if="event.latitude != null && event.longitude != null" class="twx-mini" :href="mapLink" target="_blank" rel="noopener noreferrer" title="Open on a map"><TripwiresIcon name="pin" /></a>
          </dd>
        </div>
        <div v-if="event.timezone"><dt>Time zone</dt><dd>{{ event.timezone }}</dd></div>
        <div v-if="event.language"><dt>Language</dt><dd>{{ event.language }}</dd></div>
        <div v-if="event.visitorHash">
          <dt>Visitor</dt>
          <dd><code>{{ event.visitorHash }}</code><button class="twx-mini twx-mini--text" @click="emit('visitor', event.visitorHash!)">Only this visitor</button></dd>
        </div>
        <div><dt>Link</dt><dd>{{ event.targetLabel || 'Removed link' }} <span class="twx-faint">→ {{ event.destinationUrl }}</span></dd></div>
        <div v-if="showTripwire && event.tripwireId"><dt>Tripwire</dt><dd><button class="twx-mini twx-mini--text" @click="emit('tripwire', event.tripwireId!)">Open {{ event.tripwireName || 'tripwire' }}</button></dd></div>
        <div v-if="event.referrer"><dt>Came from</dt><dd class="twx-break">{{ event.referrer }}</dd></div>
        <div v-if="event.userAgent" class="twx-facts__wide"><dt>User agent</dt><dd><code class="twx-break">{{ event.userAgent }}</code></dd></div>
        <div v-if="query" class="twx-facts__wide"><dt>Extra parameters</dt><dd><pre>{{ query }}</pre></dd></div>
        <div v-if="event.notificationError" class="twx-facts__wide"><dt>Discord</dt><dd class="twx-crit">{{ event.notificationError }}</dd></div>
        <div v-if="bare" class="twx-facts__wide"><dt>Privacy</dt><dd>This visitor sent Do Not Track or Global Privacy Control and the tripwire honours it, so nothing but the time and the link was kept.</dd></div>
      </dl>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  NETWORK_LABEL, NETWORK_TONE, ago, carrier, device, fullPlace, isBare, knownProfile, networkKind, place, prettyQuery, referrerHost,
  visitorHue, visitorShort, type TwEvent,
} from '~/scripts/tripwires';

/** One trip: a compact line that answers who, where, on what and from where; open it for everything kept. */
const props = defineProps<{ event: TwEvent; now: number; open?: boolean; showTripwire?: boolean; intel?: boolean }>();
const emit = defineEmits<{ toggle: []; copy: [text: string]; visitor: [hash: string]; tripwire: [id: string] }>();

const known = computed(() => knownProfile(props.event));
const bare = computed(() => isBare(props.event));
const kind = computed(() => networkKind(props.event.network));
const carrierText = computed(() => carrier(props.event.network));
const where = computed(() => place(props.event));
const fullWhere = computed(() => fullPlace(props.event));
const deviceText = computed(() => device(props.event));
const query = computed(() => prettyQuery(props.event.queryParametersJson));
const fromText = computed(() => {
  const host = referrerHost(props.event.referrer);
  return host ? `from ${host}` : bare.value ? '' : 'direct or app';
});
const time = computed(() => new Date(props.event.trippedUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
const exact = computed(() => new Date(props.event.trippedUtc).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' }));
const knownTitle = computed(() => {
  const n = props.event.network;
  if (!n?.profile) return '';
  const seen = n.profileSeenUtc ? ` (last seen ${ago(n.profileSeenUtc, props.now)})` : '';
  return `This address has signed in to KM as ${n.profile}${seen}`;
});
const mapLink = computed(() => `https://www.openstreetmap.org/?mlat=${props.event.latitude}&mlon=${props.event.longitude}#map=11/${props.event.latitude}/${props.event.longitude}`);
</script>
