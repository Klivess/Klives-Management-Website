/**
 * Telling ids from words. Nobody can recognise an id, so the Omniscience pages never show one on its own: a person,
 * server or chat is shown by name (a link to its page), and anything else that is only an id is left out. These say
 * what is an id.
 */

/** A person's id as the engine makes them ("p_" and 24 hex digits). */
export const OMNI_PERSON_ID = /^p_[0-9a-f]{12,}$/;

/** Ids: platform-scoped ("discord:123…"), the engine's own ("al_6ff4…", "rv_…"), raw platform numbers, GUIDs, long hex. */
export const OMNI_ID = /^([a-z][a-z0-9]*:[\w.@#-]+|[a-z]{1,4}[_-][0-9a-f]{6,}|\d{12,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24,})$/i;

/** Text with ids inside it (natural keys, dedupe keys, cursors). */
export const OMNI_HOLDS_ID = /(\bp_[0-9a-f]{12,}\b|\b[a-z]+:\d{12,}\b|[a-z]+=[^|]*\|)/i;

export function omniLooksLikeId(text: string | null | undefined): boolean {
    const t = (text ?? '').trim();
    return !!t && (OMNI_ID.test(t) || OMNI_HOLDS_ID.test(t));
}

/** The kind of set member a job's or record's subject is, when it has a page or a name; null for anything else. */
export function omniSubjectKind(subjectKind: string | null | undefined): 'Person' | 'Guild' | 'Conversation' | 'Message' | 'Attachment' | 'Assertion' | null {
    switch ((subjectKind ?? '').toLowerCase()) {
        case 'person': return 'Person';
        case 'guild': case 'server': return 'Guild';
        case 'conversation': case 'channel': case 'chat': return 'Conversation';
        case 'message': return 'Message';
        case 'attachment': case 'media': return 'Attachment';
        case 'assertion': case 'fact': return 'Assertion';
        default: return null;
    }
}
