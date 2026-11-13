<template>
    <CloudDialog :open="!!item" :title="item ? `Who can use “${item.name}”` : ''" sub="Profiles that can sign in to KliveCloud. A share link is separate: anyone with it can open what it shares."
                 icon="users" tone="people" wide testid="kcl-access-dialog" @close="$emit('close')">
        <div v-if="loading" style="display: flex; flex-direction: column; gap: 8px">
            <span v-for="n in 3" :key="n" class="kcl-skel" style="height: 40px"></span>
        </div>
        <p v-else-if="loadError" class="kcl-error" role="alert">{{ loadError }}</p>

        <template v-else-if="access">
            <p v-if="!access.CanManage" class="kcl-hint"><KliveCloudIcon name="lock" :size="12" /> Only editors of this item can change who has access.</p>

            <div v-if="access.CanManage" style="position: relative">
                <input v-model="query" class="kcl-input kcl-input--wide" type="search" placeholder="Add people by name" aria-label="Add people"
                       data-autofocus data-testid="access-search" @keydown.enter.prevent="addFirst" />
                <div v-if="query && suggestions.length" class="kcl-suggest" role="listbox">
                    <button v-for="p in suggestions" :key="p.userId" role="option" @click="add(p)">
                        <span class="kcl-face" :style="{ '--hue': avatarHue(p.userId) }">{{ initials(p.name) }}</span>
                        <span style="flex: 1; text-align: left">{{ p.name }}</span>
                        <span class="kcl-chip">{{ p.rank }}</span>
                    </button>
                </div>
                <p v-else-if="query" class="kcl-hint" style="margin-top: 6px">Nobody else matches “{{ query }}”.</p>
            </div>

            <div class="kcl-people" data-testid="access-people">
                <div class="kcl-person">
                    <span class="kcl-face" style="--hue: 200">KL</span>
                    <div><div class="kcl-person__name">Klives</div><div class="kcl-person__sub">Owner · always has access</div></div>
                    <span class="kcl-chip">Editor</span><span></span>
                </div>
                <div v-for="e in entries" :key="e.profileId" class="kcl-person">
                    <span class="kcl-face" :style="{ '--hue': avatarHue(e.profileId) }">{{ initials(e.name) }}</span>
                    <div>
                        <div class="kcl-person__name">{{ e.name }}</div>
                        <div class="kcl-person__sub">{{ e.addedByName ? `Added by ${e.addedByName}` : 'Added now' }}</div>
                    </div>
                    <select v-if="access.CanManage" v-model="e.level" class="kcl-select" :aria-label="`${e.name}'s access`" style="height: 28px">
                        <option value="Viewer">Viewer</option>
                        <option value="Editor">Editor</option>
                    </select>
                    <span v-else class="kcl-chip">{{ e.level }}</span>
                    <button v-if="access.CanManage" class="kcl-iconbtn kcl-iconbtn--sm" :aria-label="`Remove ${e.name}`" @click="remove(e.profileId)"><KliveCloudIcon name="close" :size="13" /></button>
                    <span v-else></span>
                </div>
                <div class="kcl-person">
                    <span class="kcl-face" style="--hue: 205; background: rgba(108, 199, 255, 0.16); color: var(--kcl-accent)"><KliveCloudIcon name="globe" :size="13" /></span>
                    <div><div class="kcl-person__name">Everyone</div><div class="kcl-person__sub">Every profile that can use KliveCloud</div></div>
                    <select v-if="access.CanManage" v-model="everyone" class="kcl-select" aria-label="Everyone's access" style="height: 28px" data-testid="access-everyone">
                        <option :value="null">No access</option>
                        <option value="Viewer">Viewer</option>
                        <option value="Editor">Editor</option>
                    </select>
                    <span v-else class="kcl-chip">{{ everyone ?? 'No access' }}</span>
                    <span></span>
                </div>
            </div>

            <div v-if="access.HasParent" style="display: flex; align-items: center; gap: 14px; padding-top: 4px">
                <div style="flex: 1">
                    <div style="font-weight: 600">Also whoever has the folder above</div>
                    <div class="kcl-hint">{{ inherit ? 'People with access to the folders above can use this too.' : 'Only the people listed here (and Klives) can use this.' }}</div>
                </div>
                <button class="kcl-switch" role="switch" :aria-checked="inherit" :disabled="!access.CanManage" aria-label="Inherit access from the folder above" @click="inherit = !inherit"></button>
            </div>
            <div v-if="inherit && access.Inherited.length" class="kcl-hint" style="display: flex; flex-direction: column; gap: 2px">
                <span v-for="(h, i) in access.Inherited" :key="i">{{ h.Name }} · {{ h.Level }} <span class="kcl-faint">from {{ h.FromName }}</span></span>
            </div>

            <p class="kcl-hint"><b>Viewer</b> can open and download. <b>Editor</b> can also upload, rename, move, delete and share.</p>
            <p v-if="saveError" class="kcl-error" role="alert">{{ saveError }}</p>
        </template>

        <template #actions>
            <button class="kcl-btn kcl-btn--ghost" @click="$emit('close')">{{ access?.CanManage ? 'Cancel' : 'Close' }}</button>
            <button v-if="access?.CanManage" class="kcl-btn kcl-btn--primary" :disabled="saving || !dirty" data-testid="access-save" @click="save">{{ saving ? 'Saving…' : 'Save' }}</button>
        </template>
    </CloudDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { avatarHue, initials } from '~/scripts/profileFormat';
import { describeApiError } from '~/scripts/klivecloud/shared';

/* Who can use an item: its own list, "everyone", and whether it inherits from the folder above
   (GetItemAccess / People / SetItemAccess). */
interface Person { userId: string; name: string; rank: string; isOwner: boolean; isYou: boolean }
interface AccessPayload {
    ItemID: string; Name: string; ItemType: string; MyLevel: string; CanManage: boolean; HasParent: boolean; Inherit: boolean;
    Everyone: 'Viewer' | 'Editor' | null;
    Entries: { ProfileId: string; Name: string; Level: 'Viewer' | 'Editor'; AddedById: string | null; AddedByName: string | null; AddedUtc: string }[];
    Inherited: { FromItemID: string | null; FromName: string; ProfileId: string | null; Name: string; Level: string }[];
}

const props = defineProps<{ item: { id: string; name: string } | null }>();
const emit = defineEmits<{ close: []; saved: [item: any] }>();

const loading = ref(false);
const loadError = ref('');
const access = ref<AccessPayload | null>(null);
const people = ref<Person[]>([]);
const entries = ref<{ profileId: string; name: string; level: 'Viewer' | 'Editor'; addedByName: string | null }[]>([]);
const everyone = ref<'Viewer' | 'Editor' | null>(null);
const inherit = ref(true);
const query = ref('');
const saving = ref(false);
const saveError = ref('');
let snapshot = '';

const suggestions = computed(() => {
    const q = query.value.trim().toLowerCase();
    const taken = new Set(entries.value.map(e => e.profileId));
    return people.value.filter(p => !p.isOwner && !taken.has(p.userId) && (!q || p.name.toLowerCase().includes(q))).slice(0, 6);
});

const shape = () => JSON.stringify({ e: entries.value.map(e => [e.profileId, e.level]), everyone: everyone.value, inherit: inherit.value });
const dirty = computed(() => shape() !== snapshot);

async function load(id: string) {
    loading.value = true;
    loadError.value = '';
    saveError.value = '';
    access.value = null;
    query.value = '';
    try {
        const res = await RequestGETFromKliveAPI(`/KliveCloud/GetItemAccess?itemID=${encodeURIComponent(id)}`, false, false);
        if (!res.ok) throw new Error(describeApiError(res.status, await res.text().catch(() => '')));
        const payload = await res.json() as AccessPayload;
        access.value = payload;
        entries.value = payload.Entries.map(e => ({ profileId: e.ProfileId, name: e.Name, level: e.Level, addedByName: e.AddedByName }));
        everyone.value = payload.Everyone;
        inherit.value = payload.Inherit;
        snapshot = shape();
        if (payload.CanManage) {
            const peopleRes = await RequestGETFromKliveAPI('/KliveCloud/People', false, false);
            if (peopleRes.ok) people.value = await peopleRes.json();
        }
    } catch (e) {
        loadError.value = e instanceof Error ? e.message : "Couldn't load who has access.";
    } finally {
        loading.value = false;
    }
}

function add(p: Person) {
    entries.value.push({ profileId: p.userId, name: p.name, level: 'Viewer', addedByName: null });
    query.value = '';
}
function addFirst() {
    if (suggestions.value.length) add(suggestions.value[0]);
}
function remove(profileId: string) {
    entries.value = entries.value.filter(e => e.profileId !== profileId);
}

async function save() {
    if (!props.item || !access.value) return;
    saving.value = true;
    saveError.value = '';
    try {
        const body = { itemID: props.item.id, inherit: inherit.value, everyone: everyone.value, entries: entries.value.map(e => ({ profileId: e.profileId, level: e.level })) };
        const res = await RequestPOSTFromKliveAPI('/KliveCloud/SetItemAccess', JSON.stringify(body), false, true);
        if (!res.ok) throw new Error(describeApiError(res.status, await res.text().catch(() => '')));
        emit('saved', await res.json());
    } catch (e) {
        saveError.value = e instanceof Error ? e.message : "Couldn't save.";
    } finally {
        saving.value = false;
    }
}

watch(() => props.item?.id, id => { if (id) void load(id); }, { immediate: true });
</script>
