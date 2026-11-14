import { omniPercent } from '~/scripts/omniscience/format';
import type { ReplicaMetricsDto, ReplicaReadinessDto } from '~/scripts/omniscience/contracts';

/** Words and tones shared by the replica pages. */

export function replicaStatusTone(status: string): string {
    switch (status) {
        case 'ready': return 'ok';
        case 'building': return 'info';
        case 'failed': return 'bad';
        case 'blocked': return 'warn';
        default: return '';
    }
}

export function replicaStatusLabel(status: string): string {
    switch (status) {
        case 'none': return 'not built';
        case 'ready': return 'ready';
        case 'building': return 'being built';
        case 'failed': return 'build failed';
        case 'blocked': return 'not allowed';
        default: return status;
    }
}

/** Whether there is enough of their writing to build from, in a sentence. */
export function readinessText(r: ReplicaReadinessDto): string {
    switch (r.tier) {
        case 'Ready': return `Enough to build from: ${r.effective} usable replies (${r.thresholdReady} needed).`;
        case 'Experimental': return `Only just enough: ${r.effective} usable replies (${r.thresholdReady} for a dependable one). It will be rough.`;
        case 'Blocked': return r.reason;
        default: return `Not enough to build from: ${r.effective} usable replies (${r.thresholdExperimental} is the least). ${r.reason}`;
    }
}

export function readinessTone(tier: string): string {
    return tier === 'Ready' ? 'ok' : tier === 'Experimental' ? 'warn' : tier === 'Blocked' ? 'bad' : '';
}

/**
 * How well a version imitates them. A judge is shown a real reply and a written one and has to say
 * which is real: 50% means it cannot tell (as good as it gets), 100% that it always can.
 */
export function fidelityText(m: ReplicaMetricsDto | null | undefined): string {
    if (!m || m.discriminationAccuracy === null || m.discriminationAccuracy === undefined) return 'not measured';
    const band = m.discriminationCiLow != null && m.discriminationCiHigh != null ? ` (${Math.round(m.discriminationCiLow * 100)}–${Math.round(m.discriminationCiHigh * 100)}%)` : '';
    return `told apart ${omniPercent(m.discriminationAccuracy)} of the time${band}`;
}

export function fidelityTone(accuracy: number | null | undefined): string {
    if (accuracy === null || accuracy === undefined) return '';
    return accuracy <= 0.65 ? 'ok' : accuracy <= 0.8 ? 'warn' : 'bad';
}

/** The steps of a build, in the order they run. */
export function buildStageLabel(stage: string): string {
    switch (stage) {
        case 'index': return 'Collecting their replies';
        case 'vectors': return 'Indexing them by meaning';
        case 'reflex': return 'Learning their quick reactions';
        case 'persona': return 'Describing how they write';
        case 'eval': return 'Testing against replies it has not seen';
        case 'finalize': return 'Finishing';
        default: return stage.replace(/_/g, ' ');
    }
}

export const CHAT_CONTEXTS: { value: string; label: string }[] = [
    { value: 'auto', label: 'However they usually talk to you' },
    { value: 'dm', label: 'A direct chat' },
    { value: 'group_dm', label: 'A small group chat' },
    { value: 'guild_channel', label: 'A server channel' },
    { value: 'other', label: 'Somewhere else' },
];
