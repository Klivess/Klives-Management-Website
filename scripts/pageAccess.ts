/**
 * What each page needs before it is worth showing. One table drives both the page guard
 * (AccessPageGuard renders "you don't have access" in place of the page, keeping the nav) and
 * the navbar (items you can't open aren't offered).
 *
 * A page requires *some* key of its service: what you then see inside depends on the exact
 * keys you hold, and sections you lack are locked individually. The server stays the
 * authority — this only avoids offering pages that would be refused.
 *
 * A page can override its entry with `definePageMeta({ access: { any: ['…'] } })`.
 */

export type AccessRule =
    | { kind: 'public' }
    | { kind: 'signed-in' }
    | { kind: 'keys'; any?: string[]; all?: string[] };

export interface PageAccess {
    rule: AccessRule;
    /** What the page is, for "you don't have access to …". */
    label: string;
}

declare module '#app' {
    interface PageMeta {
        /** Overrides this page's entry in the access table. */
        access?: AccessRule;
    }
}

interface Entry { prefix: string; label: string; rule: AccessRule; exact?: boolean }

const anyOf = (...keys: string[]): AccessRule => ({ kind: 'keys', any: keys });
const allOf = (...keys: string[]): AccessRule => ({ kind: 'keys', all: keys });
const PUBLIC: AccessRule = { kind: 'public' };
const SIGNED_IN: AccessRule = { kind: 'signed-in' };

// Longest matching prefix wins.
const ENTRIES: Entry[] = [
    { prefix: '/', exact: true, label: 'Sign in', rule: PUBLIC },
    { prefix: '/shared', label: 'Shared link', rule: PUBLIC },
    { prefix: '/klivechat', label: 'KliveChat', rule: PUBLIC },

    { prefix: '/dashboard', label: 'Home', rule: SIGNED_IN },
    { prefix: '/account', label: 'Your account', rule: SIGNED_IN },
    { prefix: '/profilepage', label: 'Your account', rule: SIGNED_IN },
    { prefix: '/storage', label: 'Storage', rule: SIGNED_IN },
    { prefix: '/botnets', label: 'Botnets', rule: SIGNED_IN },

    { prefix: '/schemes', label: 'Schemes', rule: anyOf('omnitrader.', 'cs2.', 'memescraper.', 'omnigram.', 'omnitumblr.') },
    { prefix: '/omnitrader', label: 'OmniTrader', rule: anyOf('omnitrader.') },
    { prefix: '/schemery/omnitrader', label: 'OmniTrader', rule: anyOf('omnitrader.') },
    { prefix: '/schemery/cs2arbitragebot', label: 'CS2 Arbitrage', rule: anyOf('cs2.') },
    { prefix: '/schemery/memescraper', label: 'Meme Scraper', rule: anyOf('memescraper.') },
    { prefix: '/schemery/omnigram', label: 'OmniGram', rule: anyOf('omnigram.') },
    { prefix: '/schemery/omnitumblr', label: 'OmniTumblr', rule: anyOf('omnitumblr.') },
    { prefix: '/schemery/omnitube', label: 'OmniTube', rule: SIGNED_IN },

    { prefix: '/omniscience', label: 'Omniscience', rule: anyOf('omniscience.') },
    { prefix: '/omniscience-search', label: 'Omniscience', rule: anyOf('omniscience.') },
    { prefix: '/omniscience-review', label: 'Omniscience review', rule: anyOf('omniscience.') },
    { prefix: '/omniscience-person', label: 'Omniscience', rule: anyOf('omniscience.') },
    { prefix: '/omnidefence', label: 'OmniDefence', rule: anyOf('omnidefence.') },
    { prefix: '/tripwires', label: 'Tripwires', rule: anyOf('tripwires.') },

    { prefix: '/klivecloud', label: 'KliveCloud', rule: anyOf('klivecloud.') },
    { prefix: '/klivetech', label: 'KliveTech', rule: anyOf('klivetech.') },
    { prefix: '/klivemail', label: 'KliveMail', rule: anyOf('klivemail.') },
    { prefix: '/kliveagent', label: 'KliveAgent', rule: anyOf('kliveagent.') },
    { prefix: '/projects', label: 'Projects', rule: anyOf('projects.') },
    { prefix: '/projects/new', label: 'New project', rule: allOf('projects.lifecycle.manage') },
    { prefix: '/projects/accounts', label: 'Agent accounts', rule: anyOf('accounts.') },
    { prefix: '/klivegames', label: 'KliveGames', rule: anyOf('klivegames.') },
    { prefix: '/klivelink', label: 'KliveLink', rule: anyOf('klivelink.') },
    { prefix: '/klivetools', label: 'KliveTools', rule: anyOf('klivetools.') },
    { prefix: '/stratum', label: 'Stratum', rule: anyOf('stratum.') },

    { prefix: '/botSchedule', label: 'Schedule', rule: anyOf('system.scheduler.read') },
    { prefix: '/admin', label: 'Admin', rule: anyOf('system.') },
    { prefix: '/administration/api-telemetry', label: 'API telemetry', rule: anyOf('system.api.telemetry.read') },
    { prefix: '/administration/omnisettings', label: 'OmniSettings', rule: anyOf('system.settings.read') },
    { prefix: '/administration/botlogs', label: 'Service logs', rule: anyOf('system.logs.read') },
    { prefix: '/administration/remotedesktop', label: 'Remote desktop', rule: anyOf('system.hostcontrol.view') },
    { prefix: '/administration/profiles', label: 'Profiles', rule: anyOf('profiles.directory.view') },
    { prefix: '/administration/profiles/new', label: 'New profile', rule: anyOf('profiles.lifecycle.create') },
    { prefix: '/administration/profiles/catalog', label: 'Permission catalog', rule: anyOf('profiles.permissions.view') },
    { prefix: '/createprofile', label: 'New profile', rule: anyOf('profiles.lifecycle.create') },
];

// '/omniscience' does not match '/omniscience-search': siblings like that have their own entry.
function matches(path: string, entry: Entry): boolean {
    if (entry.exact) return path === entry.prefix;
    return path === entry.prefix || path.startsWith(`${entry.prefix}/`);
}

export function resolvePageAccess(path: string, override?: AccessRule | null): PageAccess {
    const clean = (path.split(/[?#]/)[0] || '/').replace(/\/+$/, '') || '/';
    let best: Entry | null = null;
    for (const entry of ENTRIES) {
        if (matches(clean, entry) && (!best || entry.prefix.length > best.prefix.length)) best = entry;
    }
    const label = best?.label ?? 'This page';
    if (override) return { rule: override, label };
    // Anything unlisted needs a sign-in; the server decides the rest.
    return { rule: best?.rule ?? SIGNED_IN, label };
}

/** Does `can` (useAccess().can) satisfy the rule? */
export function satisfiesRule(rule: AccessRule, can: (keys: string | readonly string[], mode?: 'all' | 'any') => boolean, signedIn: boolean): boolean {
    if (rule.kind === 'public') return true;
    if (!signedIn) return false;
    if (rule.kind === 'signed-in') return true;
    if (rule.all?.length && !can(rule.all, 'all')) return false;
    if (rule.any?.length && !can(rule.any, 'any')) return false;
    return true;
}

/** The keys a rule asks for, to name them on the "no access" screen. */
export function ruleKeys(rule: AccessRule): { any: string[]; all: string[] } {
    if (rule.kind !== 'keys') return { any: [], all: [] };
    return { any: rule.any ?? [], all: rule.all ?? [] };
}
