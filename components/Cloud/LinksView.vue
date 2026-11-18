<template>
    <section class="kcl-card" aria-label="Share links" data-testid="kcl-links">
        <header class="kcl-head">
            <div class="kcl-head__row">
                <div class="kcl-head__title">
                    <span class="kcl-glyph" data-kind="other" style="--s: 30px; --kind: var(--kcl-accent)"><KliveCloudIcon name="link" :size="16" /></span>
                    <h2>Share links</h2>
                </div>
                <div class="kcl-head__tools">
                    <div class="kcl-seg" role="group" aria-label="Show">
                        <button v-for="f in FILTERS" :key="f.id" class="kcl-seg__opt" :aria-pressed="filter === f.id" :data-testid="`links-filter-${f.id}`" @click="filter = f.id">
                            {{ f.label }}<span v-if="counts[f.id] !== undefined" class="kcl-seg__count">{{ counts[f.id] }}</span>
                        </button>
                    </div>
                </div>
            </div>
            <p class="kcl-hint">Anyone with a link opens what it shares without signing in, and sees only what its owner can see.</p>
        </header>

        <div class="kcl-links__summary">
            <button class="kcl-stat" :aria-pressed="filter === 'all'" @click="filter = 'all'">
                <span class="kcl-stat__label">Links</span>
                <span class="kcl-stat__value">{{ links.length }}</span>
                <span class="kcl-stat__sub">{{ folderLinks }} folder{{ folderLinks === 1 ? '' : 's' }} · {{ links.length - folderLinks }} file{{ links.length - folderLinks === 1 ? '' : 's' }}</span>
            </button>
            <button class="kcl-stat" :data-tone="counts.broken ? 'warn' : undefined" :aria-pressed="filter === 'broken'" data-testid="links-stat-broken" @click="filter = 'broken'">
                <span class="kcl-stat__label">Can't open</span>
                <span class="kcl-stat__value">{{ counts.broken }}</span>
                <span class="kcl-stat__sub">{{ counts.broken ? 'visitors get “no longer works”' : 'every link opens' }}</span>
            </button>
            <div class="kcl-stat">
                <span class="kcl-stat__label">Opened</span>
                <span class="kcl-stat__value">{{ counted ? totals.opens.toLocaleString('en-GB') : '—' }}</span>
                <span class="kcl-stat__sub">{{ counted ? `${totals.downloads} downloads · ${formatBytes(totals.bytes)} sent${since ? ` · since ${since}` : ''}` : 'counted once the server is updated' }}</span>
            </div>
            <button class="kcl-stat" :aria-pressed="filter === 'forever'" @click="filter = 'forever'">
                <span class="kcl-stat__label">Never expire</span>
                <span class="kcl-stat__value">{{ counts.forever }}</span>
                <span class="kcl-stat__sub">{{ counts.expiring ? `${counts.expiring} expire within 3 days` : 'set an expiry from a link' }}</span>
            </button>
        </div>

        <div v-if="counts.broken && filter !== 'ok'" class="kcl-bulk" style="margin: 0 14px 12px; background: linear-gradient(90deg, rgba(245, 185, 66, 0.13), rgba(245, 185, 66, 0.04)); border-color: rgba(245, 185, 66, 0.35)" data-testid="links-broken-banner">
            <KliveCloudIcon name="alert" :size="16" style="color: var(--kcl-warn)" />
            <span class="kcl-bulk__count">{{ counts.broken }} link{{ counts.broken === 1 ? '' : 's' }} can't open</span>
            <span class="kcl-bulk__meta kcl-truncate">{{ brokenWhy }}</span>
            <span style="flex: 1"></span>
            <button v-if="adoptable.length && canAdopt" class="kcl-btn kcl-btn--sm" :disabled="!supportsUpdate" :title="supportsUpdate ? 'Make them serve your access again, at the same addresses' : 'Needs the newer server'" data-testid="links-adopt-all" @click="$emit('adopt', adoptable)">
                <KliveCloudIcon name="user-check" :size="13" />Take over {{ adoptable.length }}
            </button>
            <button class="kcl-btn kcl-btn--sm kcl-btn--danger" data-testid="links-remove-broken" @click="$emit('remove', brokenLinks)"><KliveCloudIcon name="trash" :size="13" />Remove {{ counts.broken }}</button>
        </div>

        <div v-if="picked.size" class="kcl-bulk" style="margin: 0 14px 12px">
            <button class="kcl-iconbtn kcl-iconbtn--sm" aria-label="Clear selection" @click="picked = new Set()"><KliveCloudIcon name="close" :size="13" /></button>
            <span class="kcl-bulk__count">{{ picked.size }} selected</span>
            <span style="flex: 1"></span>
            <button class="kcl-btn kcl-btn--sm kcl-btn--danger" @click="$emit('remove', shown.filter(l => picked.has(l.code))); picked = new Set()"><KliveCloudIcon name="trash" :size="13" />Remove</button>
        </div>

        <table v-if="shown.length" class="kcl-list">
            <thead>
                <tr>
                    <th class="kcl-c-check"><input type="checkbox" class="kcl-box" :checked="shown.length > 0 && shown.every(l => picked.has(l.code))" aria-label="Select all links" @change="toggleAll" /></th>
                    <th>Shares</th>
                    <th class="kcl-c-status">Status</th>
                    <th class="kcl-c-mode">Visitors can</th>
                    <th class="kcl-c-exp">Expires</th>
                    <th class="kcl-c-use">Use</th>
                    <th class="kcl-c-lact"><span class="kcl-sr">Actions</span></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="link in shown" :key="link.code" class="kcl-row kcl-linkrow" :data-state="linkState(link, now)" :data-picked="picked.has(link.code) || undefined" :data-testid="`link-${link.code.slice(0, 6)}`">
                    <td class="kcl-c-check"><input type="checkbox" class="kcl-box" :checked="picked.has(link.code)" :aria-label="`Select link to ${link.name}`" @change="toggle(link.code)" /></td>
                    <td>
                        <div class="kcl-name">
                            <CloudThumb v-if="itemFor(link)" :item="itemFor(link)!" :size="28" />
                            <span v-else class="kcl-glyph" data-kind="other" style="--s: 28px"><KliveCloudIcon name="link-off" :size="15" /></span>
                            <div class="kcl-name__text">
                                <button v-if="itemFor(link)" class="kcl-open" @click="$emit('reveal', link)">{{ link.name }}</button>
                                <span v-else class="kcl-dim" style="font-size: 13px">{{ link.name }}</span>
                                <span class="kcl-name__sub">{{ subline(link) }}</span>
                            </div>
                        </div>
                    </td>
                    <td class="kcl-c-status" style="white-space: normal">
                        <span v-if="link.problem" class="kcl-problem"><KliveCloudIcon name="alert" :size="12" />{{ link.problemText }}</span>
                        <span v-else-if="linkState(link, now) === 'expiring'" class="kcl-chip" data-tone="warn"><KliveCloudIcon name="clock" :size="10" />Expiring</span>
                        <span v-else class="kcl-chip" data-tone="ok"><KliveCloudIcon name="check" :size="10" />Works</span>
                    </td>
                    <td class="kcl-c-mode">{{ link.type === 'Folder' ? MODE_LABEL[link.mode] : 'View' }}</td>
                    <td class="kcl-c-exp" :title="link.expires ? new Date(link.expires).toLocaleString() : ''">{{ link.expires ? describeExpiry(link.expires, now).text.replace(/^Expires /, '') : 'Never' }}</td>
                    <td class="kcl-c-use">
                        <div v-if="link.counted" class="kcl-usage">
                            <b>{{ link.opens ? `${link.opens} open${link.opens === 1 ? '' : 's'}` : 'Not opened' }}<template v-if="link.downloads"> · {{ link.downloads }} ↓</template></b>
                            <span>{{ link.lastOpened ? `last ${formatWhen(link.lastOpened, now)}` : link.bytesServed ? `${formatBytes(link.bytesServed)} sent` : '—' }}</span>
                        </div>
                        <span v-else class="kcl-faint">—</span>
                    </td>
                    <td class="kcl-c-lact">
                        <div class="kcl-acts" style="opacity: 1">
                            <button class="kcl-iconbtn kcl-iconbtn--sm" title="Copy link" :aria-label="`Copy link to ${link.name}`" @click="$emit('copy', link)"><KliveCloudIcon name="copy" :size="13" /></button>
                            <a class="kcl-iconbtn kcl-iconbtn--sm" :href="url(link)" target="_blank" rel="noopener" title="Open the share page" :aria-label="`Open the share page for ${link.name}`"><KliveCloudIcon name="external" :size="13" /></a>
                            <button v-if="!link.problem || link.problem === 'Expired'" class="kcl-iconbtn kcl-iconbtn--sm" title="Change" :aria-label="`Change link to ${link.name}`" @click="$emit('edit', link)"><KliveCloudIcon name="pencil" :size="13" /></button>
                            <button v-if="canAdoptLink(link) && canAdopt" class="kcl-iconbtn kcl-iconbtn--sm" :disabled="!supportsUpdate" title="Take it over: it serves your access again" :aria-label="`Take over link to ${link.name}`" @click="$emit('adopt', [link])"><KliveCloudIcon name="user-check" :size="13" /></button>
                            <button class="kcl-iconbtn kcl-iconbtn--sm" title="Remove" :aria-label="`Remove link to ${link.name}`" @click="$emit('remove', [link])"><KliveCloudIcon name="trash" :size="13" /></button>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
        <div v-else class="kcl-empty">
            <span class="kcl-empty__icon"><KliveCloudIcon name="link" :size="18" /></span>
            <strong>{{ links.length ? 'No links match' : 'No share links yet' }}</strong>
            <span>{{ links.length ? 'Try another filter.' : 'Pick a file or folder and choose Share link.' }}</span>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { MODE_LABEL, canAdopt as canAdoptLink, formatBytes, linkState, shareUrl, type DriveIndex, type DriveLink } from '~/scripts/klivecloud/drive';
import { describeExpiry, formatWhen } from '~/scripts/klivecloud/shared';

type Filter = 'all' | 'ok' | 'broken' | 'forever' | 'unused';

const props = defineProps<{
    links: DriveLink[];
    index: DriveIndex | null;
    now: number;
    origin: string;
    canAdopt: boolean;
    supportsUpdate: boolean;
}>();
defineEmits<{ copy: [link: DriveLink]; edit: [link: DriveLink]; adopt: [links: DriveLink[]]; remove: [links: DriveLink[]]; reveal: [link: DriveLink] }>();

const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'ok', label: 'Working' },
    { id: 'broken', label: "Can't open" },
    { id: 'unused', label: 'Never opened' },
];

const filter = ref<Filter>('all');
const picked = ref<Set<string>>(new Set());

const url = (link: DriveLink) => shareUrl(props.origin, link.code);
const itemFor = (link: DriveLink) => props.index?.byKey.get(link.itemKey) ?? null;
const counted = computed(() => props.links.some(link => link.counted));

const brokenLinks = computed(() => props.links.filter(link => linkState(link, props.now) === 'broken'));
const adoptable = computed(() => brokenLinks.value.filter(canAdoptLink));
const folderLinks = computed(() => props.links.filter(link => link.type === 'Folder').length);

const counts = computed<Record<Filter, number> & { expiring: number }>(() => ({
    all: props.links.length,
    ok: props.links.filter(link => linkState(link, props.now) !== 'broken').length,
    broken: brokenLinks.value.length,
    forever: props.links.filter(link => !link.expires && !link.problem).length,
    unused: props.links.filter(link => link.counted && !link.opens && !link.downloads).length,
    expiring: props.links.filter(link => linkState(link, props.now) === 'expiring').length,
}));

const totals = computed(() => props.links.reduce((sum, link) => ({
    opens: sum.opens + link.opens, downloads: sum.downloads + link.downloads, bytes: sum.bytes + link.bytesServed,
}), { opens: 0, downloads: 0, bytes: 0 }));

const since = computed(() => {
    const first = props.links.map(link => link.countingSince).find(Boolean);
    return first ? new Date(first).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
});

const brokenWhy = computed(() => {
    const kinds = new Map<string, number>();
    for (const link of brokenLinks.value) kinds.set(link.problemText, (kinds.get(link.problemText) ?? 0) + 1);
    return [...kinds.keys()].map(text => `${kinds.get(text)}: ${text}`).join(' · ');
});

const ORDER: Record<string, number> = { broken: 0, expiring: 1, ok: 2 };
const shown = computed(() => {
    const list = props.links.filter(link => {
        const state = linkState(link, props.now);
        switch (filter.value) {
            case 'ok': return state !== 'broken';
            case 'broken': return state === 'broken';
            case 'forever': return !link.expires && !link.problem;
            case 'unused': return link.counted && !link.opens && !link.downloads;
            default: return true;
        }
    });
    return list.sort((a, b) => ORDER[linkState(a, props.now)] - ORDER[linkState(b, props.now)]
        || (b.lastOpened ?? 0) - (a.lastOpened ?? 0)
        || (b.created || 0) - (a.created || 0));
});

function subline(link: DriveLink) {
    const parts: string[] = [];
    if (link.path) parts.push(link.path.includes('/') ? link.path.slice(0, link.path.lastIndexOf('/')) || 'My drive' : 'My drive');
    if (link.bytes != null && link.type === 'File') parts.push(formatBytes(link.bytes));
    if (Number.isFinite(link.created)) parts.push(`made ${formatWhen(link.created, props.now)}${link.createdBy ? ` by ${link.createdBy}` : ''}`);
    return parts.join(' · ');
}

function toggle(code: string) {
    const next = new Set(picked.value);
    if (next.has(code)) next.delete(code); else next.add(code);
    picked.value = next;
}
function toggleAll() {
    const all = shown.value.every(link => picked.value.has(link.code));
    picked.value = all ? new Set() : new Set(shown.value.map(link => link.code));
}
</script>
