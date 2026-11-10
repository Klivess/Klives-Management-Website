<template>
  <section id="adm-network" class="adm-panel" aria-label="Network" :data-flash="flash">
    <header class="adm-panel__head">
      <h2 class="adm-panel__title"><AdminIcon name="globe" />Network</h2>
      <span class="adm-panel__meta adm-mono adm-truncate">
        <template v-if="upRate != null"><AdminIcon name="arrow-up" /> {{ fmtBitRate(upRate) }} &nbsp; <AdminIcon name="arrow-down" /> {{ fmtBitRate(downRate) }}</template>
      </span>
      <div class="adm-panel__tools">
        <template v-if="ports">
          <span class="adm-chip adm-chip--mono" title="This machine's address on your network">LAN {{ ports.localIp || '—' }}</span>
          <button
            v-if="ports.success && ports.externalIp && ports.externalIp !== 'Unknown'"
            class="adm-chip adm-chip--mono"
            :title="copied ? 'Copied' : 'Your public address. Click to copy.'"
            @click="copyWan"
          >WAN {{ ports.externalIp }} <AdminIcon :name="copied ? 'check' : 'link'" /></button>
        </template>
      </div>
    </header>

    <div class="adm-panel__body adm-net" :class="{ 'adm-net--solo': !canReadPorts }">
      <div>
        <div class="adm-subhead">Adapters</div>
        <div v-if="physical.length">
          <div v-for="nic in physical" :key="nic.Name" class="adm-nic">
            <span class="adm-nic__name" :title="nic.Name">{{ nic.Name }}</span>
            <span class="adm-nic__rates">
              <span title="Sending"><AdminIcon name="arrow-up" />{{ fmtBitRate(rates[nic.Name]?.up) }}</span>
              <span title="Receiving"><AdminIcon name="arrow-down" />{{ fmtBitRate(rates[nic.Name]?.down) }}</span>
            </span>
            <span class="adm-nic__sub" :title="nic.Description">
              {{ nic.SpeedMbps > 0 ? `${fmtInt(nic.SpeedMbps)} Mb/s link` : 'Link speed unknown' }} · {{ fmtBytes(nic.BytesSent) }} sent · {{ fmtBytes(nic.BytesReceived) }} received
            </span>
          </div>
        </div>
        <div v-else class="adm-empty">No active adapters reported.</div>
        <p v-if="virtual.length" class="adm-dim" style="padding: 6px 8px 0; font-size: 11.5px" :title="virtual.map(nic => nic.Name).join(', ')">
          and {{ virtual.length }} virtual adapter{{ virtual.length === 1 ? '' : 's' }} (they mirror traffic counted above)
        </p>
      </div>

      <div v-if="canReadPorts">
        <div class="adm-subhead">
          Port forwards
          <span class="adm-subhead__tools">
            <button v-if="canManagePorts && ports?.success" class="adm-btn adm-btn--sm adm-btn--ghost" data-testid="port-add" @click="openEditor(null)"><AdminIcon name="plus" />Add</button>
          </span>
        </div>

        <div v-if="!ports" class="adm-empty">Asking the router…</div>
        <div v-else-if="!ports.success" class="adm-empty">
          {{ ports.error || 'No UPnP gateway answered.' }} Forwards cannot be read or changed until UPnP is enabled on the router.
        </div>
        <div v-else-if="!ports.mappings.length" class="adm-empty">Nothing is forwarded to this network.</div>
        <ul v-else class="adm-rows">
          <li
            v-for="mapping in ports.mappings"
            :key="`${mapping.Protocol}-${mapping.PublicPort}`"
            class="adm-port"
            :data-testid="`port-${mapping.Protocol}-${mapping.PublicPort}`"
          >
            <span class="adm-port__proto">{{ mapping.Protocol }}</span>
            <span class="adm-port__map" :title="`Public port ${mapping.PublicPort} forwards to ${mapping.PrivateIp}:${mapping.PrivatePort}`">
              {{ mapping.PublicPort }}<AdminIcon name="arrow-right" />{{ mapping.PrivateIp === ports.localIp ? '' : mapping.PrivateIp }}:{{ mapping.PrivatePort }}
            </span>
            <span class="adm-port__desc" :title="mapping.Description">{{ mapping.Description || 'No description' }}</span>
            <template v-if="removing === keyOf(mapping)">
              <span class="adm-svc__confirm">
                <span class="adm-svc__confirm-text">Remove?</span>
                <button class="adm-btn adm-btn--sm adm-btn--danger" :disabled="busy" :data-testid="`port-remove-confirm-${mapping.PublicPort}`" @click="remove(mapping)">Yes</button>
                <button class="adm-btn adm-btn--sm adm-btn--ghost" @click="removing = null">No</button>
              </span>
            </template>
            <template v-else>
              <!-- Permanent is the norm: only a forward that will lapse says so. -->
              <span class="adm-port__life">{{ mapping.LifetimeSeconds ? portLifetimeLabel(mapping, now) : '' }}</span>
              <span v-if="canManagePorts" class="adm-port__acts">
                <button class="adm-iconbtn" :aria-label="`Edit forward for port ${mapping.PublicPort}`" title="Edit" @click="openEditor(mapping)"><AdminIcon name="edit" /></button>
                <button class="adm-iconbtn adm-iconbtn--danger" :aria-label="`Remove forward for port ${mapping.PublicPort}`" title="Remove" :data-testid="`port-remove-${mapping.PublicPort}`" @click="removing = keyOf(mapping)"><AdminIcon name="trash" /></button>
              </span>
            </template>
          </li>
        </ul>
      </div>
    </div>

    <AdminDialog
      :open="editorOpen"
      :title="editing ? `Edit forward for port ${editing.PublicPort}` : 'Forward a port'"
      sub="Asks the router, over UPnP, to send traffic arriving on a public port to a machine on your network."
      icon="globe"
      wide
      testid="port-dialog"
      @close="closeEditor"
    >
      <form class="adm-form" @submit.prevent="submit" @keydown.enter.prevent="submit">
        <label class="adm-field adm-field--wide">
          <span class="adm-field__label">Description</span>
          <input v-model="draft.Description" class="adm-input" maxlength="80" placeholder="What it is for" data-autofocus />
        </label>
        <label class="adm-field adm-field--third">
          <span class="adm-field__label">Public port</span>
          <input v-model.trim="draft.PublicPort" class="adm-input adm-mono" inputmode="numeric" placeholder="25565" data-testid="port-public" />
        </label>
        <label class="adm-field adm-field--third">
          <span class="adm-field__label">Private port</span>
          <input v-model.trim="draft.PrivatePort" class="adm-input adm-mono" inputmode="numeric" :placeholder="draft.PublicPort || '25565'" data-testid="port-private" @focus="mirrorPort" />
        </label>
        <label class="adm-field adm-field--third">
          <span class="adm-field__label">Protocol</span>
          <select v-model="draft.Protocol" class="adm-input">
            <option value="TCP">TCP</option>
            <option value="UDP">UDP</option>
          </select>
        </label>
        <label class="adm-field">
          <span class="adm-field__label">Send to (address on your network)</span>
          <input v-model.trim="draft.PrivateIp" class="adm-input adm-mono" placeholder="192.168.1.50" data-testid="port-ip" />
        </label>
        <label class="adm-field">
          <span class="adm-field__label">Keep it</span>
          <select v-model.number="draft.LifetimeSeconds" class="adm-input">
            <option :value="0">Until removed</option>
            <option :value="86400">For a day</option>
            <option :value="3600">For an hour</option>
          </select>
        </label>
        <p v-if="formError" class="adm-form__error" role="alert" data-testid="port-error">{{ formError }}</p>
      </form>
      <template #actions>
        <button class="adm-btn adm-btn--ghost" @click="closeEditor">Cancel</button>
        <button class="adm-btn adm-btn--primary" :disabled="busy" data-testid="port-save" @click="submit">{{ busy ? 'Asking the router…' : editing ? 'Save changes' : 'Forward port' }}</button>
      </template>
    </AdminDialog>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  blankPortDraft, draftFromMapping, fmtBitRate, fmtBytes, fmtInt, portLifetimeLabel, validatePortDraft,
  type AdminNetInterface, type AdminPortMapping, type AdminPorts, type PortDraft,
} from '~/scripts/adminConsole';

const props = withDefaults(defineProps<{
  physical: AdminNetInterface[];
  virtual: AdminNetInterface[];
  rates: Record<string, { up: number; down: number }>;
  upRate: number | null;
  downRate: number | null;
  ports: AdminPorts | null;
  canReadPorts: boolean;
  canManagePorts: boolean;
  busy: boolean;
  now: number;
  /** Each resolves to an error message, or null when the router accepted the change. */
  savePort: (draft: PortDraft, editing: AdminPortMapping | null) => Promise<string | null>;
  deletePort: (mapping: AdminPortMapping) => Promise<string | null>;
  flash?: boolean;
}>(), { flash: false });

const editorOpen = ref(false);
const editing = ref<AdminPortMapping | null>(null);
const draft = ref<PortDraft>(blankPortDraft(''));
const formError = ref('');
const removing = ref<string | null>(null);
const copied = ref(false);

const keyOf = (mapping: AdminPortMapping) => `${mapping.Protocol}-${mapping.PublicPort}`;

function openEditor(mapping: AdminPortMapping | null) {
  editing.value = mapping;
  draft.value = mapping ? draftFromMapping(mapping) : blankPortDraft(props.ports?.localIp ?? '');
  formError.value = '';
  editorOpen.value = true;
}
function closeEditor() {
  editorOpen.value = false;
}
// Most forwards use the same port on both sides: offer it rather than make it be typed twice.
function mirrorPort() {
  if (!draft.value.PrivatePort && draft.value.PublicPort) draft.value.PrivatePort = draft.value.PublicPort;
}

async function submit() {
  if (props.busy) return;
  mirrorPort();
  const problem = validatePortDraft(draft.value, props.ports?.mappings ?? [], editing.value);
  if (problem) { formError.value = problem; return; }
  formError.value = '';
  const failure = await props.savePort(draft.value, editing.value);
  if (failure) formError.value = failure;
  else closeEditor();
}

async function remove(mapping: AdminPortMapping) {
  const failure = await props.deletePort(mapping);
  removing.value = null;
  if (failure) formError.value = failure;
}

async function copyWan() {
  try {
    await navigator.clipboard.writeText(props.ports?.externalIp ?? '');
    copied.value = true;
    window.setTimeout(() => { copied.value = false; }, 1_600);
  } catch { /* clipboard blocked */ }
}

defineExpose({ openEditor });
</script>
