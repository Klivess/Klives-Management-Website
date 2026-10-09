<template>
    <ProfilesModal :open="!!item" :title="item ? `Share “${item.Name}”` : ''" wide @close="$emit('close')">
        <div v-if="loading" class="sh-loading"><div v-for="n in 3" :key="n" class="ot-skel"></div></div>
        <OmniTraderStateBlock v-else-if="loadError" kind="error" :detail="loadError" compact />

        <template v-else-if="access">
            <p v-if="!access.CanManage" class="sh-note">
                <AccessIcon name="lock" :size="14" />
                {{ canShare ? 'Only editors of this item can change who has access.' : 'Changing who has access needs “Share files”.' }}
            </p>

            <!-- add people -->
            <div v-if="access.CanManage" class="sh-add">
                <label class="ot-search sh-search">
                    <span class="glyph" aria-hidden="true"><AccessIcon name="search" :size="13" /></span>
                    <input v-model="query" class="ot-input" type="search" placeholder="Add people by name" aria-label="Add people"
                           @keydown.enter.prevent="addFirst" />
                </label>
                <ul v-if="query && suggestions.length" class="sh-suggest" role="listbox">
                    <li v-for="p in suggestions" :key="p.userId">
                        <button type="button" role="option" @click="add(p)">
                            <ProfilesAvatar :name="p.name" :id="p.userId" :size="24" />
                            <span>{{ p.name }}</span>
                            <span class="km-rank" :class="`r${rankMeta(p.rank).value}`">{{ p.rank }}</span>
                        </button>
                    </li>
                </ul>
                <p v-else-if="query" class="sh-muted">Nobody else matches “{{ query }}”.</p>
            </div>

            <!-- who has access -->
            <h4 class="sh-title">People with access</h4>
            <ul class="sh-people">
                <li class="sh-person owner">
                    <ProfilesAvatar name="Klives" owner :size="30" />
                    <div><strong>Klives</strong><small>Owner · always has access</small></div>
                    <span class="sh-level-fixed">Editor</span>
                </li>
                <li v-for="e in entries" :key="e.profileId" class="sh-person">
                    <ProfilesAvatar :name="e.name" :id="e.profileId" :size="30" />
                    <div>
                        <strong>{{ e.name }}<span v-if="e.profileId === myId" class="sh-you"> (you)</span></strong>
                        <small>{{ e.addedByName ? `Added by ${e.addedByName}` : 'Added just now' }}</small>
                    </div>
                    <select v-if="access.CanManage" v-model="e.level" class="ot-select auto" :aria-label="`${e.name}'s access`">
                        <option value="Viewer">Viewer</option>
                        <option value="Editor">Editor</option>
                    </select>
                    <span v-else class="sh-level-fixed">{{ e.level }}</span>
                    <button v-if="access.CanManage" type="button" class="ot-btn ghost sm" :aria-label="`Remove ${e.name}`" @click="remove(e.profileId)">
                        <AccessIcon name="close" :size="13" />
                    </button>
                </li>
                <li class="sh-person everyone">
                    <span class="sh-everyone-icon"><AccessIcon name="users" :size="16" /></span>
                    <div><strong>Everyone</strong><small>Every profile that can use KliveCloud</small></div>
                    <select v-if="access.CanManage" v-model="everyone" class="ot-select auto" aria-label="Everyone's access">
                        <option :value="null">No access</option>
                        <option value="Viewer">Viewer</option>
                        <option value="Editor">Editor</option>
                    </select>
                    <span v-else class="sh-level-fixed">{{ everyone ?? 'No access' }}</span>
                </li>
            </ul>

            <!-- inherited -->
            <template v-if="access.HasParent">
                <div class="sh-inherit">
                    <div>
                        <strong>Also share with whoever has the folder above</strong>
                        <p>{{ inherit ? 'People with access to the folders above can use this too.' : 'Only the people listed here (and Klives) can use this.' }}</p>
                    </div>
                    <button type="button" class="km-switch" role="switch" :aria-checked="inherit" :disabled="!access.CanManage" @click="inherit = !inherit"></button>
                </div>
                <ul v-if="inherit && access.Inherited.length" class="sh-inherited">
                    <li v-for="(h, i) in access.Inherited" :key="i">
                        <span class="sh-from">from {{ h.FromName }}</span>
                        <span class="sh-inh-name">{{ h.Name }}</span>
                        <span class="sh-inh-level">{{ h.Level }}</span>
                    </li>
                </ul>
            </template>

            <p class="sh-levels"><strong>Viewer</strong> can open and download. <strong>Editor</strong> can also upload, rename, move, delete and share.</p>
            <p v-if="saveError" class="sh-error" role="alert">{{ saveError }}</p>
        </template>

        <template #footer>
            <button type="button" class="ot-btn ghost" @click="$emit('close')">{{ access?.CanManage ? 'Cancel' : 'Close' }}</button>
            <button v-if="access?.CanManage" type="button" class="ot-btn primary" :disabled="saving || !dirty" @click="save">{{ saving ? 'Saving…' : 'Save' }}</button>
        </template>
    </ProfilesModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useAccess } from '~/composables/useAccess';
import { rankMeta } from '~/scripts/profileFormat';

interface ShareTarget { ItemID: string; Name: string; ItemType?: string }
interface Person { userId: string; name: string; rank: string; isOwner: boolean; isYou: boolean }
interface AccessPayload {
    ItemID: string;
    Name: string;
    ItemType: string;
    MyLevel: string;
    CanManage: boolean;
    HasParent: boolean;
    Inherit: boolean;
    Everyone: 'Viewer' | 'Editor' | null;
    Entries: { ProfileId: string; Name: string; Level: 'Viewer' | 'Editor'; AddedById: string | null; AddedByName: string | null; AddedUtc: string }[];
    Inherited: { FromItemID: string | null; FromName: string; ProfileId: string | null; Name: string; Level: string }[];
}

const props = defineProps<{ item: ShareTarget | null }>();
const emit = defineEmits<{ close: []; saved: [item: any] }>();

const { can, profile } = useAccess();
const canShare = computed(() => can('klivecloud.sharing.manage'));
const myId = computed(() => String(profile.value?.userId ?? ''));

const loading = ref(false);
const loadError = ref<string | null>(null);
const access = ref<AccessPayload | null>(null);
const people = ref<Person[]>([]);
const entries = ref<{ profileId: string; name: string; level: 'Viewer' | 'Editor'; addedByName: string | null }[]>([]);
const everyone = ref<'Viewer' | 'Editor' | null>(null);
const inherit = ref(true);
const query = ref('');
const saving = ref(false);
const saveError = ref<string | null>(null);
let snapshot = '';

const suggestions = computed(() => {
    const q = query.value.trim().toLowerCase();
    const taken = new Set(entries.value.map(e => e.profileId));
    return people.value.filter(p => !p.isOwner && !taken.has(p.userId) && (!q || p.name.toLowerCase().includes(q))).slice(0, 6);
});

const state = () => JSON.stringify({ e: entries.value.map(e => [e.profileId, e.level]), everyone: everyone.value, inherit: inherit.value });
const dirty = computed(() => state() !== snapshot);

async function readError(res: Response) {
    try {
        const body = await res.clone().json();
        return body?.message || body?.error || `Request failed (${res.status})`;
    } catch {
        return (await res.text().catch(() => '')) || `Request failed (${res.status})`;
    }
}

async function load(item: ShareTarget) {
    loading.value = true;
    loadError.value = null;
    saveError.value = null;
    access.value = null;
    query.value = '';
    try {
        const res = await RequestGETFromKliveAPI(`/KliveCloud/GetItemAccess?itemID=${encodeURIComponent(item.ItemID)}`, false, false);
        if (!res.ok) throw new Error(await readError(res));
        const payload = await res.json() as AccessPayload;
        access.value = payload;
        entries.value = payload.Entries.map(e => ({ profileId: e.ProfileId, name: e.Name, level: e.Level, addedByName: e.AddedByName }));
        everyone.value = payload.Everyone;
        inherit.value = payload.Inherit;
        snapshot = state();
        if (payload.CanManage) {
            const peopleRes = await RequestGETFromKliveAPI('/KliveCloud/People', false, false);
            if (peopleRes.ok) people.value = await peopleRes.json();
        }
    } catch (e) {
        loadError.value = e instanceof Error ? e.message : 'Could not load who has access.';
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
    saveError.value = null;
    try {
        const body = {
            itemID: props.item.ItemID,
            inherit: inherit.value,
            everyone: everyone.value,
            entries: entries.value.map(e => ({ profileId: e.profileId, level: e.level })),
        };
        const res = await RequestPOSTFromKliveAPI('/KliveCloud/SetItemAccess', JSON.stringify(body), false, true);
        if (!res.ok) throw new Error(await readError(res));
        emit('saved', await res.json());
    } catch (e) {
        saveError.value = e instanceof Error ? e.message : 'Could not save.';
    } finally {
        saving.value = false;
    }
}

watch(() => props.item, item => { if (item) void load(item); }, { immediate: true });
</script>

<style scoped>
.sh-loading { display: flex; flex-direction: column; gap: 10px; }
.sh-loading .ot-skel { height: 44px; }
.sh-note { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; padding: 8px 12px; border-radius: var(--ot-radius); background: var(--ot-warning-soft); color: var(--ot-warning); font-size: 12.5px; }
.sh-add { position: relative; margin-bottom: 16px; }
.sh-search { width: 100%; }
.sh-search input { width: 100%; }
.sh-suggest {
    list-style: none;
    margin: 4px 0 0;
    padding: 4px;
    border-radius: var(--ot-radius);
    border: 1px solid var(--ot-line-strong);
    background: var(--ot-surface);
    display: flex;
    flex-direction: column;
}
.sh-suggest button {
    width: 100%;
    display: flex !important;
    align-items: center;
    gap: 10px;
    padding: 6px 8px !important;
    border-radius: 6px;
    border: 0 !important;
    background: none !important;
    color: var(--ot-text);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
}
.sh-suggest button:hover { background: var(--ot-accent-soft) !important; }
.sh-suggest .km-rank { margin-left: auto; }
.sh-muted { margin-top: 6px; color: var(--ot-muted); font-size: 12.5px; }
.sh-title { font-size: 11px; letter-spacing: 1.1px; text-transform: uppercase; color: var(--ot-muted); margin: 0 0 8px; }
.sh-people { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.sh-person {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: var(--ot-radius);
    background: rgba(255, 255, 255, 0.025);
}
.sh-person > div { min-width: 0; display: flex; flex-direction: column; }
.sh-person strong { color: var(--ot-text); font-size: 13.5px; font-weight: 600; }
.sh-person small { color: var(--ot-muted); font-size: 11.5px; }
.sh-person.everyone, .sh-person.owner { grid-template-columns: auto minmax(0, 1fr) auto; }
.sh-you { color: var(--ot-muted); font-weight: 400; }
.sh-level-fixed { font-size: 12.5px; color: var(--ot-text-2); padding: 0 6px; }
.sh-everyone-icon { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; background: var(--ot-info-soft); color: var(--ot-info); }
.sh-inherit { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--ot-line); }
.sh-inherit strong { color: var(--ot-text); font-size: 13.5px; font-weight: 600; }
.sh-inherit p { color: var(--ot-muted); font-size: 12px; margin-top: 2px; }
.sh-inherited { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.sh-inherited li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; padding: 5px 10px; border-radius: 6px; font-size: 12.5px; color: var(--ot-muted); }
.sh-from { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sh-inh-name { color: var(--ot-text-2); }
.sh-levels { margin-top: 14px; font-size: 12px; color: var(--ot-muted); }
.sh-levels strong { color: var(--ot-text-2); }
.sh-error { margin-top: 10px; color: var(--ot-negative); font-size: 12.5px; }
</style>
