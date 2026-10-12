export interface TextPart {
    text: string;
    href?: string;
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;
const TRAILING = /[.,:;!?)\]}'"]+$/;

/** Splits text into plain runs and http(s) links. Rendered as text nodes, never as HTML. */
export function linkify(text: string): TextPart[] {
    const parts: TextPart[] = [];
    let last = 0;
    for (const match of text.matchAll(URL_PATTERN)) {
        let url = match[0];
        const trail = url.match(TRAILING)?.[0] ?? '';
        if (trail) url = url.slice(0, -trail.length);
        const start = match.index ?? 0;
        if (start > last) parts.push({ text: text.slice(last, start) });
        parts.push({ text: url, href: url });
        last = start + url.length;
    }
    if (last < text.length) parts.push({ text: text.slice(last) });
    return parts;
}

export function clockTime(ms: number): string {
    return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** 0:42 · 12:05 · 1:02:33 */
export function callDuration(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function statsLine(stats: { rtt: number | null; loss: number | null; route: string | null; kbpsIn: number | null }): string | null {
    if (stats.rtt === null) return null;
    const parts = [`${stats.rtt} ms`];
    if (stats.loss !== null) parts.push(`${stats.loss.toFixed(stats.loss < 10 ? 1 : 0)}% loss`);
    if (stats.route) parts.push(stats.route === 'relay' ? 'relayed' : stats.route === 'lan' ? 'LAN' : 'direct');
    if (stats.kbpsIn !== null) parts.push(stats.kbpsIn >= 1000 ? `${(stats.kbpsIn / 1000).toFixed(1)} Mb/s` : `${stats.kbpsIn} kb/s`);
    return parts.join(' · ');
}
