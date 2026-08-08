<template>
    <div>
        <!-- These two mismatches are invisible anywhere else on the page: the fleet
             table shows each gadget's own claim, and only a comparison across gadgets
             reveals that the claims disagree. -->
        <div v-if="orphans.length" class="kt-notice warn" style="border-radius:var(--kt-radius-sm);margin-bottom:var(--kt-space-3)">
            <span aria-hidden="true">⚠</span>
            <span>
                {{ orphans.length }} gadget{{ orphans.length === 1 ? '' : 's' }}
                report a hub that is not connected:
                {{ orphans.map(g => g.name).join(', ') }}
            </span>
        </div>
        <div v-if="miscounts.length" class="kt-notice info" style="border-radius:var(--kt-radius-sm);margin-bottom:var(--kt-space-3)">
            <span aria-hidden="true">ℹ</span>
            <span>
                <template v-for="(m, i) in miscounts" :key="m.hub.gadgetID">
                    <template v-if="i"> · </template>
                    {{ m.hub.name }} reports {{ m.hub.connectedGadgetCount }} child{{ m.hub.connectedGadgetCount === 1 ? '' : 'ren' }},
                    {{ m.found }} visible
                </template>
            </span>
        </div>

        <div class="kt-topo">
            <div class="col">
                <span class="colhead">Omnipotent</span>
                <div class="kt-node root">
                    <span class="nname"><KliveTechLamp tone="accent" /> KliveTech Hub</span>
                    <span class="nmeta">
                        <span class="kt-chip accent">{{ gadgets.length }} known</span>
                        <span class="kt-chip">{{ onlineCount }} online</span>
                    </span>
                </div>
            </div>

            <div class="col">
                <span class="colhead">Direct connections</span>
                <button v-for="gadget in direct" :key="gadget.gadgetID" class="kt-node"
                        @click="$emit('select', gadget)">
                    <span class="nname">
                        <KliveTechLamp :tone="gadgetTone(gadget, now)" />
                        {{ gadget.name }}
                    </span>
                    <span class="nmeta">
                        <span class="kt-chip" :class="transportClass(gadget.connectionType)">
                            {{ gadget.connectionType }}
                        </span>
                        <span v-if="gadget.isHub" class="kt-chip accent">
                            hosts {{ gadget.connectedGadgetCount }}
                        </span>
                        <span v-if="gadget.streamableCount" class="kt-chip">
                            {{ gadget.streamableCount }} streams
                        </span>
                    </span>
                </button>
                <KliveTechStateBlock v-if="!direct.length" kind="nohardware" compact
                    title="Nothing connected directly"
                    detail="Direct gadgets arrive over Bluetooth, or as a relay hub's own uplink." />
            </div>

            <div class="col">
                <span class="colhead">Relayed through a hub</span>
                <template v-for="hub in hubs" :key="hub.gadgetID">
                    <span v-if="childrenOf(hub).length" class="colhead" style="opacity:.75">
                        via {{ hub.name }}
                    </span>
                    <button v-for="child in childrenOf(hub)" :key="child.gadgetID" class="kt-node"
                            @click="$emit('select', child)">
                        <span class="nname">
                            <KliveTechLamp :tone="gadgetTone(child, now)" />
                            {{ child.name }}
                        </span>
                        <span class="nmeta">
                            <span class="kt-chip tx-relayed">{{ child.actions.length }} actions</span>
                            <span v-if="child.streamableCount" class="kt-chip">
                                {{ child.streamableCount }} streams
                            </span>
                        </span>
                    </button>
                </template>
                <KliveTechStateBlock v-if="!relayed.length" kind="empty" compact
                    title="No relayed gadgets"
                    detail="An ESP32 hub publishes its children here once it connects." />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { gadgetTone, transportClass, type Gadget } from '~/scripts/kliveTech';

const props = withDefaults(defineProps<{
    gadgets: Gadget[];
    now?: number;
}>(), { now: () => Date.now() });

defineEmits<{ select: [gadget: Gadget] }>();

const onlineCount = computed(() => props.gadgets.filter(g => g.isOnline).length);
const relayed = computed(() => props.gadgets.filter(g => g.connectedViaHubID));
const direct = computed(() => props.gadgets.filter(g => !g.connectedViaHubID));
const hubs = computed(() => props.gadgets.filter(g => g.isHub));

function childrenOf(hub: Gadget): Gadget[] {
    return relayed.value.filter(g => g.connectedViaHubID === hub.hubID);
}

/** A child pointing at a hubID nobody is advertising — the hub dropped, the child did not. */
const orphans = computed(() => {
    const hubIds = new Set(hubs.value.map(h => h.hubID).filter(Boolean));
    return relayed.value.filter(g => !hubIds.has(g.connectedViaHubID));
});

/** A hub's own child count disagreeing with how many children are actually visible. */
const miscounts = computed(() =>
    hubs.value
        .map(hub => ({ hub, found: childrenOf(hub).length }))
        .filter(({ hub, found }) => hub.connectedGadgetCount !== found));
</script>
