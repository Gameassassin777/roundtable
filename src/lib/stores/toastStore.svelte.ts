// Toast queue — transient bottom-anchored notifications.
// Used for connection state changes, key pool events, save confirmations, etc.
// Replaces the old top-banner connection indicator.

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export type Toast = {
    id: number;
    kind: ToastKind;
    message: string;
    detail?: string;
    created_at: number;
    ttl: number; // ms; 0 = sticky (manual dismiss only)
};

let nextId = 1;

// Svelte 5 rune store — components import `toasts` and call push/dismiss.
export const toasts = $state<Toast[]>([]);

export function pushToast(
    message: string,
    opts: { kind?: ToastKind; detail?: string; ttl?: number } = {}
): number {
    const id = nextId++;
    const toast: Toast = {
        id,
        kind: opts.kind || 'info',
        message,
        detail: opts.detail,
        created_at: Date.now(),
        ttl: opts.ttl ?? 3500
    };
    toasts.push(toast);
    if (toast.ttl > 0) {
        setTimeout(() => dismissToast(id), toast.ttl);
    }
    return id;
}

export function dismissToast(id: number) {
    const idx = toasts.findIndex((t) => t.id === id);
    if (idx !== -1) toasts.splice(idx, 1);
}

export function clearToasts() {
    toasts.length = 0;
}
