import { omniCount, omniDuration, omniPercent } from '~/scripts/omniscience/format';

/**
 * One sentence for each kind of finding the engine hands to the notices (monitors, relationships,
 * check-ins, plan reminders, standing questions) and for each data-health problem, written from the finding's own data. A kind this
 * build does not know falls back to its name, so a newer server never shows a blank row.
 */

type Bag = Record<string, unknown>;

function bag(value: unknown): Bag {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Bag : {};
}
function str(value: unknown): string | null {
    return typeof value === 'string' && value.length ? value : null;
}
function num(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function round(value: number | null, digits = 1): string {
    return value === null ? '—' : value.toFixed(digits).replace(/\.0+$/, '');
}

export function omniHumanise(kind: string): string {
    const text = kind.replace(/[_.|-]+/g, ' ').trim();
    return text ? text[0]!.toUpperCase() + text.slice(1) : 'Finding';
}

export function findingText(kind: string, data: unknown, who?: string | null, other?: string | null): string {
    const d = bag(data);
    const name = who ?? 'Someone';
    const rule = str(d.ruleName) ? ` (watch “${str(d.ruleName)}”)` : '';
    switch (kind) {
        case 'person_activity':
            return str(d.trigger) === 'returned'
                ? `${name} wrote again after ${omniCount(num(d.gapDays))} days of silence${rule}.`
                : `${name} posted in a watched server${rule}.`;
        case 'new_person':
            switch (str(d.trigger)) {
                case 'first_direct_message': return `${name} wrote to you directly for the first time${d.knownElsewhere ? ' (already known from elsewhere)' : ''}.`;
                case 'joined_circle': return `${name} joined your circle (now ${omniCount(num(d.circleSize))} people).`;
                case 'rising_newcomer': return `${name} is new to a community and rising fast there (${omniCount(num(d.recent))} recent messages).`;
                default: return `${name} is new.`;
            }
        case 'topic_surge':
            return `“${str(d.ruleName) ?? 'A topic'}” is surging: ${omniCount(num(d.count))} messages in 24 hours against a usual day of ${round(num(d.usualDay))}.`;
        case 'klives_tone':
            return `A burst of ${str(d.tone) ?? ''} messages about you: ${omniCount(num(d.count))} from ${omniCount(num(d.authors))} people in ${omniCount(num(d.windowHours))} hours (usually ${round(num(d.expected))}).`;
        case 'data_health':
            return healthText(str(d.issue) ?? 'problem', d.detail, str(d.subject));
        case 'relationship':
            return `${name} and ${other ?? 'someone'}: ${omniHumanise(str(d.change) ?? 'changed').toLowerCase()} (week ${str(d.week) ?? '?'}).`;
        case 'wellbeing':
            return `${name} might welcome a check-in (${omniHumanise(str(d.suggestion) ?? 'wellbeing').toLowerCase()}).`;
        case 'plan_reminder': {
            const when = ({ day_before: 'Tomorrow', same_day: 'Today', before: 'In about two hours', due: 'Due now' } as Record<string, string>)[str(d.kind) ?? ''] ?? 'Coming up';
            const people = who ? ` (${who}${other ? ` with ${other}` : ''})` : '';
            const late = (num(d.latenessMs) ?? 0) > 10 * 60_000 ? `, reminded ${omniDuration(num(d.latenessMs))} late` : '';
            return `${when}: “${str(d.title) ?? 'a plan'}”${people}${late}.`;
        }
        case 'standing_question':
            return `Your standing question “${str(d.question) ?? '?'}” changed: ${str(d.from) ?? '?'} → ${str(d.to) ?? '?'} (${omniPercent(num(d.fromProbability))} → ${omniPercent(num(d.toProbability))}).`;
        default:
            return omniHumanise(kind);
    }
}

export function healthText(kind: string, detail: unknown, subject?: string | null): string {
    const d = bag(detail);
    const source = str(d.label) ?? str(d.sourceId) ?? subject ?? 'A source';
    switch (kind) {
        case 'source_down':
            return `${source} is ${str(d.status) ?? 'down'}${str(d.detail) ? `: ${str(d.detail)}` : ''}.`;
        case 'source_stalled':
            return `${source} has been silent for ${round(num(d.silentHours))} hours; it usually brings ${round(num(d.usualPerDay))} messages a day.`;
        case 'backfill_stalled':
            return `The backfill of ${source} has not moved for a day (${omniCount(num(d.conversations))} conversations waiting).`;
        case 'llm_errors':
            return `${omniCount(num(d.failed))} of ${omniCount(num(d.calls))} model calls failed in the last hour.`;
        case 'llm_circuit':
            return str(d.reason) ?? 'The model circuit breaker is open; background model work is paused.';
        case 'cache_floor':
            return `Background model work reused only ${omniPercent(num(d.efficiency))} of its prompts over ${omniCount(num(d.hours))} hours (floor ${omniPercent(num(d.floor))}).`;
        case 'jobs_dead':
            return `${omniCount(num(d.jobs))} ${str(d.moduleId) ?? subject ?? ''} job${num(d.jobs) === 1 ? '' : 's'} failed for good in the last day${str(d.lastError) ? `: ${str(d.lastError)}` : ''}.`;
        case 'tail_stalled':
            return `New messages have stopped arriving from v2: the copy that runs every two minutes has not finished for ${omniCount(num(d.minutes))} minutes. What you see here is that much out of date.`;
        case 'module_stalled':
            return `${str(d.moduleId) ?? subject ?? 'A module'} has ${omniCount(num(d.queued))} job${num(d.queued) === 1 ? '' : 's'} waiting and has finished none for ${round(num(d.hours))} hours.`;
        default:
            return omniHumanise(kind);
    }
}

/** "3 h" style lengths for waits shown in lists. */
export function waitText(ms: number): string {
    return omniDuration(ms);
}
