import { omniPercent } from '~/scripts/omniscience/format';
import type { KnowledgeFactDto, PlanItemDto } from '~/scripts/omniscience/contracts';

/**
 * Words and tones for what the knowledge layer says, shared by every page that shows a fact, an
 * answer or a plan, so "accepted" or "leans yes" reads and looks the same everywhere.
 */

/** The chip tone of a fact's status. */
export function factTone(status: string): string {
    switch (status) {
        case 'confirmed': return 'ok';
        case 'accepted': return 'info';
        case 'proposed': case 'contested': return 'warn';
        case 'rejected': return 'bad';
        default: return '';
    }
}

/** What a status means, for the hover text. */
export function factStatusHelp(status: string): string {
    switch (status) {
        case 'confirmed': return 'You confirmed this.';
        case 'accepted': return 'Confident enough to show as a fact.';
        case 'proposed': return 'There is evidence, but not enough yet to call it a fact.';
        case 'contested': return 'The evidence disagrees with itself; it is in the review queue.';
        case 'rejected': return 'You rejected this.';
        default: return status;
    }
}

/** "since Mar 2025", "until about Jan 2026", "Mar 2025 – Jan 2026", or "" when no validity is known. */
export function factValidity(f: KnowledgeFactDto, month: (ms: number) => string): string {
    const from = f.validFromLatestMs ?? f.validFromEarliestMs ?? null;
    const to = f.validToEarliestMs ?? f.validToLatestMs ?? null;
    if (from !== null && to !== null) return `${month(from)} – ${month(to)}`;
    if (from !== null) return `since ${month(from)}`;
    if (to !== null) return `until about ${month(to)}`;
    return '';
}

export function sourceKindLabel(kind: string | null | undefined): string {
    switch (kind) {
        case 'self_disclosure': return 'they said it themselves';
        case 'third_party': return 'someone else said it';
        case 'behaviour': return 'seen in what they do';
        case 'inferred': return 'worked out, not stated';
        case 'klives': return 'you said so';
        default: return kind ? kind.replace(/_/g, ' ') : '';
    }
}

/** Verdicts of an answer, in words. */
export function verdictLabel(verdict: string | null | undefined): string {
    switch (verdict) {
        case 'Yes': return 'Yes';
        case 'LeansYes': return 'Leans yes';
        case 'Uncertain': return 'Uncertain';
        case 'LeansNo': return 'Leans no';
        case 'No': return 'No';
        case 'InsufficientEvidence': return 'Not enough evidence';
        case 'Refused': return 'Withheld by policy';
        case 'NeedsDisambiguation': return 'Which person?';
        case 'Answered': return 'Answered';
        default: return verdict ?? '—';
    }
}

export function verdictTone(verdict: string | null | undefined): string {
    switch (verdict) {
        case 'Yes': case 'Answered': return 'ok';
        case 'LeansYes': case 'LeansNo': return 'info';
        case 'No': return 'bad';
        case 'Uncertain': case 'InsufficientEvidence': case 'NeedsDisambiguation': case 'Refused': return 'warn';
        default: return '';
    }
}

/** A probability with its band when one was measured: "82% (70–90%)". */
export function probabilityText(p: number | null | undefined, low?: number | null, high?: number | null): string {
    if (p === null || p === undefined) return '—';
    const band = low !== null && low !== undefined && high !== null && high !== undefined ? ` (${Math.round(low * 100)}–${Math.round(high * 100)}%)` : '';
    return `${omniPercent(p)}${band}`;
}

export function planTone(status: string): string {
    switch (status) {
        case 'overdue': return 'bad';
        case 'due': return 'warn';
        case 'upcoming': case 'recurring': return 'info';
        case 'kept': return 'ok';
        default: return '';
    }
}

/** What kind of thing a plan row is, in a word or two. */
export function planKindLabel(p: PlanItemDto): string {
    if (p.klivesPromised) return 'your promise';
    switch (p.kind) {
        case 'promise': return 'promise';
        case 'birthday': return 'birthday';
        case 'date': return 'date';
        default: return p.kind.replace(/_/g, ' ');
    }
}

/** The review queue's kinds, in the words the queue uses for them. */
export const REVIEW_KINDS: { value: string; label: string; help: string }[] = [
    { value: 'contradiction', label: 'Contradiction', help: 'Two facts that cannot both be true.' },
    { value: 'possible_change', label: 'Possible change', help: 'Something that may have changed (a move, a new job).' },
    { value: 'age_conflict', label: 'Age conflict', help: 'Statements about someone’s age disagree.' },
    { value: 'age_evidence', label: 'Age evidence', help: 'A statement that could make someone under 18.' },
    { value: 'flapping', label: 'Keeps changing', help: 'A fact that keeps switching between values.' },
    { value: 'rejected_resurfaced', label: 'Rejected, seen again', help: 'Something you rejected has new evidence.' },
    { value: 'unproven', label: 'Unproven', help: 'A claim the checks could not prove.' },
    { value: 'identity_link', label: 'Same person?', help: 'Two accounts that may belong to one person.' },
    { value: 'alias', label: 'Name', help: 'A name people may be using for someone.' },
    { value: 'hypothesis', label: 'Hypothesis', help: 'A guess waiting to be settled.' },
];

export function reviewKindLabel(kind: string): string {
    return REVIEW_KINDS.find(k => k.value === kind)?.label ?? kind.replace(/_/g, ' ');
}
