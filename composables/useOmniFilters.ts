import { computed } from 'vue';
import { omniGet } from '~/scripts/omniscience/api';
import type { DirectoryPageDto, LookupLabelsDto, LookupPageDto } from '~/scripts/omniscience/contracts';
import { omniCount } from '~/scripts/omniscience/format';
import {
    omniFilterCount, omniFilterParams, omniFilterSignature, omniFormatPick, omniParsePick,
    type OmniFilterDef, type OmniFilterParams, type OmniOption, type OmniPickKind, type OmniPickScope,
} from '~/scripts/omniscience/filters';
import { useOmniTime } from '~/composables/useOmniscienceV3';

/**
 * The plumbing behind the Omniscience filter bar and its pickers. Exports are prefixed `useOmni…` / `omni…`
 * because Nuxt auto-imports composables site-wide.
 */

// ── what a picker offers ─────────────────────────────────────────────────────

export interface OmniPickPage { items: OmniOption[]; truncated: boolean }

const pageCache = new Map<string, { at: number; page: OmniPickPage }>();
/** A picker reopened within this long shows what it showed before, with no request. */
const PAGE_KEPT_MS = 60_000;

function contains(option: OmniOption, needle: string): boolean {
    return option.label.toLowerCase().includes(needle) || option.id.toLowerCase().includes(needle) || (option.detail ?? '').toLowerCase().includes(needle);
}

/**
 * The options of a picker for what has been typed. With nothing typed it is the most useful few: the people most
 * active lately, the servers and conversations last written in, the sites most shared from.
 */
export async function omniPickOptions(kind: OmniPickKind, query: string, scope: OmniPickScope, def: Pick<OmniFilterDef, 'options' | 'load'>,
    signal: AbortSignal): Promise<OmniPickPage> {
    const q = query.trim();
    if (kind === 'options') {
        const needle = q.toLowerCase();
        return { items: (def.options ?? []).filter(o => !needle || contains(o, needle)), truncated: false };
    }
    if (kind === 'custom') return { items: def.load ? await def.load(q, signal) : [], truncated: false };

    const key = JSON.stringify([kind, kind === 'platform' ? '' : q.toLowerCase(), scope.guilds ?? [], scope.platforms ?? [], scope.places ?? []]);
    const kept = pageCache.get(key);
    let page = kept && Date.now() - kept.at < PAGE_KEPT_MS ? kept.page : null;
    if (!page) {
        switch (kind) {
            case 'person': {
                const found = await omniGet<DirectoryPageDto>('people', q ? { q, limit: 12 } : { sort: 'Recent', limit: 12 }, signal);
                page = {
                    items: found.items.map(p => ({
                        id: p.personId, label: p.displayName,
                        detail: [p.isSelf ? 'you' : '', p.platforms.join(', '), `${omniCount(p.msgs)} messages`].filter(Boolean).join(' · '),
                    })),
                    truncated: !!found.nextCursor,
                };
                break;
            }
            case 'guild': {
                const found = await omniGet<LookupPageDto>('lookup/guilds', { q, platforms: scope.platforms ?? [], limit: 30 }, signal);
                page = { items: found.items.map(o => ({ id: o.id, label: o.label, detail: [o.detail, o.count ? `${omniCount(o.count)} channel${o.count === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') })), truncated: found.truncated };
                break;
            }
            case 'conversation': {
                const found = await omniGet<LookupPageDto>('lookup/conversations', { q, guilds: scope.guilds ?? [], platforms: scope.platforms ?? [], places: scope.places ?? [], limit: 30 }, signal);
                page = { items: found.items.map(o => ({ id: o.id, label: o.kind === 'server' ? `#${o.label}` : o.label, detail: o.detail ?? null })), truncated: found.truncated };
                break;
            }
            case 'platform': {
                const found = await omniGet<LookupPageDto>('lookup/platforms', {}, signal);
                page = { items: found.items.map(o => ({ id: o.id, label: o.label, count: o.count ?? null })), truncated: false };
                break;
            }
            default: {
                const found = await omniGet<LookupPageDto>('lookup/sites', { q, limit: 30 }, signal);
                page = { items: found.items.map(o => ({ id: o.id, label: o.label, detail: o.count ? `${omniCount(o.count)} link${o.count === 1 ? '' : 's'}` : null })), truncated: found.truncated };
            }
        }
        pageCache.set(key, { at: Date.now(), page });
        if (pageCache.size > 200) pageCache.delete(pageCache.keys().next().value as string);
    }
    if (kind !== 'platform' || !q) return page;
    const needle = q.toLowerCase();
    return { items: page.items.filter(o => contains(o, needle)), truncated: false };
}

// ── the names of what was picked ─────────────────────────────────────────────

type NamedKind = 'person' | 'guild' | 'conversation';
const NAMED: readonly string[] = ['person', 'guild', 'conversation'];
const wantedLabels: Record<NamedKind, Set<string>> = { person: new Set(), guild: new Set(), conversation: new Set() };
let labelsTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Names for the ids a filter holds. A choice made from a list brings its name with it; an id that arrived another
 * way (a link, a typed id) is asked for, in one batch a moment later. Until a name arrives the id itself is shown.
 */
export function useOmniPickLabels() {
    const labels = useState<Record<string, string>>('omni-v3:pick-labels', () => ({}));
    const asked = useState<Record<string, true>>('omni-v3:pick-labels-asked', () => ({}));

    async function flush() {
        labelsTimer = null;
        const batch = { person: [...wantedLabels.person].slice(0, 150), guild: [...wantedLabels.guild].slice(0, 150), conversation: [...wantedLabels.conversation].slice(0, 150) };
        for (const kind of NAMED as NamedKind[]) for (const id of batch[kind]) wantedLabels[kind].delete(id);
        if (!batch.person.length && !batch.guild.length && !batch.conversation.length) return;
        try {
            const found = await omniGet<LookupLabelsDto>('lookup/labels', { persons: batch.person, guilds: batch.guild, conversations: batch.conversation });
            const next = { ...labels.value };
            for (const [id, name] of Object.entries(found.persons ?? {})) next[`person:${id}`] = name;
            for (const [id, name] of Object.entries(found.guilds ?? {})) next[`guild:${id}`] = name;
            for (const [id, name] of Object.entries(found.conversations ?? {})) next[`conversation:${id}`] = name;
            labels.value = next;
        } catch {
            // Without names the ids stay on screen; they are asked for again on the next visit.
            const next = { ...asked.value };
            for (const kind of NAMED as NamedKind[]) for (const id of batch[kind]) delete next[`${kind}:${id}`];
            asked.value = next;
        }
        if (wantedLabels.person.size + wantedLabels.guild.size + wantedLabels.conversation.size > 0) labelsTimer = setTimeout(() => { void flush(); }, 30);
    }

    /** Asks for the names of these ids (those neither known nor asked for yet). Safe to call on every render. */
    function want(kind: OmniPickKind, ids: readonly string[]) {
        if (!NAMED.includes(kind)) return;
        let added = false;
        const next = { ...asked.value };
        for (const id of ids) {
            const key = `${kind}:${id}`;
            if (!id || next[key] || labels.value[key]) continue;
            next[key] = true;
            wantedLabels[kind as NamedKind].add(id);
            added = true;
        }
        if (!added) return;
        asked.value = next;
        if (!labelsTimer && typeof window !== 'undefined') labelsTimer = setTimeout(() => { void flush(); }, 30);
    }

    function remember(kind: OmniPickKind, id: string, label: string) {
        const key = `${kind}:${id}`;
        if (label && labels.value[key] !== label) labels.value = { ...labels.value, [key]: label };
    }

    /** The name of a picked id: what its list called it, else what the server calls it, else the id. */
    function labelOf(kind: OmniPickKind, id: string, options?: readonly OmniOption[]): string {
        const listed = options?.find(o => o.id === id);
        if (listed) return listed.label;
        const known = labels.value[`${kind}:${id}`];
        if (known) return known;
        return kind === 'platform' && id ? id[0]!.toUpperCase() + id.slice(1) : id;
    }

    return { labels, want, remember, labelOf };
}

// ── a page's filters ─────────────────────────────────────────────────────────

/**
 * A page's filters, over the link state that holds them (`useOmniUrlState`, with `omniFilterDefaults(defs)` spread into
 * its keys so the whole view stays one address). Hand the result to `<OmniscienceV3FilterBar :filters>`, spread
 * `params()` into the request, and search again when `signature` changes.
 */
export function useOmniFilters(defs: readonly OmniFilterDef[] | (() => readonly OmniFilterDef[]), values: Record<string, string>) {
    const { zone } = useOmniTime();
    const list = computed(() => (typeof defs === 'function' ? defs() : defs));

    const activeCount = computed(() => omniFilterCount(list.value, values));
    const signature = computed(() => omniFilterSignature(list.value, values));

    function set(key: string, value: string) { values[key] = value; }
    function clear() { for (const def of list.value) if (values[def.key]) values[def.key] = ''; }

    /** The request parameters, measured now (a range like "last 7 days" moves with the clock). */
    function params(): OmniFilterParams { return omniFilterParams(list.value, values, zone.value); }

    /** The ids a pick filter holds, kept or left out. */
    function ids(key: string): string[] { return omniParsePick(values[key]).ids; }

    /** Sets a pick filter to exactly these ids (kept, not left out). */
    function pick(key: string, chosen: readonly string[]) { values[key] = omniFormatPick({ not: false, ids: [...chosen] }); }

    return { defs: list, values, activeCount, signature, set, clear, params, ids, pick };
}

export type OmniFilters = ReturnType<typeof useOmniFilters>;
