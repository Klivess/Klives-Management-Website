/* A thumbnail the server hasn't made yet is an ffmpeg run, so a folder of photos asks for a few
   at a time instead of every one in view at once. */

const MAX_LOADING = 6;
let loading = 0;
const waiting: Array<() => void> = [];

function drain() {
    while (loading < MAX_LOADING && waiting.length) waiting.shift()!();
}

/**
 * Calls `start` once a slot is free, passing the function that frees it again. Returns a cancel
 * that works at any point: still waiting, loading, or already finished.
 */
export function requestThumbSlot(start: (release: () => void) => void): () => void {
    let state: 'waiting' | 'loading' | 'done' = 'waiting';
    const release = () => {
        if (state !== 'loading') return;
        state = 'done';
        loading--;
        drain();
    };
    const grant = () => {
        if (state !== 'waiting') return;
        state = 'loading';
        loading++;
        start(release);
    };
    waiting.push(grant);
    drain();
    return () => {
        if (state === 'waiting') {
            state = 'done';
            const at = waiting.indexOf(grant);
            if (at >= 0) waiting.splice(at, 1);
        } else {
            release();
        }
    };
}
