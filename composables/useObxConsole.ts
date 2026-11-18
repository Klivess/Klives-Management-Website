import { useState } from '#imports';
import { bloxGet, bloxPost, type BloxRobloxView } from '~/composables/useOmniBlox';

// The OmniBlox console's shared state: toasts and confirmations drawn by components/Obx/Shell.vue, and the
// owner's Roblox account (read once per page, refreshed by the account panel's actions). Every export is
// prefixed (obx/Obx): Nuxt auto-imports composable exports into every file of the site.

export type ObxToastTone = 'ok' | 'warn' | 'crit' | 'info';

export interface ObxToastItem { id: number; tone: ObxToastTone; title: string; text: string }

export interface ObxConfirmRequest {
    title: string;
    text: string;
    confirm: string;
    danger: boolean;
    resolve: (yes: boolean) => void;
}

let toastSeq = 0;

export function useObxUi() {
    const toasts = useState<ObxToastItem[]>('obx:toasts', () => []);
    const confirmation = useState<ObxConfirmRequest | null>('obx:confirm', () => null);
    return { toasts, confirmation };
}

/** A short note in the corner: what just happened, or why it did not. Errors stay longer. */
export function obxToast(title: string, text = '', tone: ObxToastTone = 'ok') {
    const { toasts } = useObxUi();
    const id = ++toastSeq;
    toasts.value = [...toasts.value.slice(-3), { id, tone, title, text }];
    setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, tone === 'crit' ? 9000 : 5000);
}

export function obxDismissToast(id: number) {
    const { toasts } = useObxUi();
    toasts.value = toasts.value.filter(t => t.id !== id);
}

/** Asks before something that is hard to undo; resolves true when the owner confirms. */
export function obxConfirm(title: string, text: string, confirm = 'Confirm', danger = false): Promise<boolean> {
    const { confirmation } = useObxUi();
    confirmation.value?.resolve(false);
    return new Promise(resolve => {
        confirmation.value = { title, text, confirm, danger, resolve: yes => { confirmation.value = null; resolve(yes); } };
    });
}

/** The owner's Roblox account (studio.manage only: the session acts as them on Roblox). */
export function useObxRoblox() {
    const view = useState<BloxRobloxView | null>('obx:roblox', () => null);
    const error = useState<string | null>('obx:roblox-error', () => null);
    const loadedAt = useState<number>('obx:roblox-at', () => 0);

    async function load(force = false) {
        if (!force && view.value && Date.now() - loadedAt.value < 60_000) return;
        const result = await bloxGet<BloxRobloxView>('/omniblox/roblox');
        if (result.ok && result.data) { view.value = result.data; error.value = null; loadedAt.value = Date.now(); }
        else error.value = result.error;
    }

    /** Every account action answers with the new view. */
    async function act(path: string, body: unknown = {}): Promise<BloxRobloxView | null> {
        const result = await bloxPost<BloxRobloxView>(path, body);
        if (!result.ok || !result.data) {
            obxToast('Roblox account', result.error ?? 'The request failed.', 'crit');
            return null;
        }
        view.value = result.data;
        loadedAt.value = Date.now();
        return result.data;
    }

    return { view, error, load, act };
}

/** A step-by-step caller of a POST route that reports what happened in a toast. */
export async function obxPost<T = { ok: boolean }>(path: string, body: Record<string, unknown>, success?: { title: string; text?: string }, failTitle = 'That did not work'): Promise<T | null> {
    const result = await bloxPost<T>(path, body);
    if (!result.ok) {
        obxToast(failTitle, result.error ?? `Request failed (${result.status})`, 'crit');
        return null;
    }
    if (success) obxToast(success.title, success.text ?? '', 'ok');
    return (result.data ?? ({ ok: true } as T));
}
