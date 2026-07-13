<script lang="ts">
    // Bottom-anchored toast stack. Renders above the action input.
    // Auto-dismisses via toastStore's ttl; manual close via ✕.
    import { toasts, dismissToast } from '$lib/stores/toastStore.svelte';

    // Cap visible toasts to last 3 to avoid stacking the screen on a flurry.
    let visible = $derived(toasts.slice(-3));
</script>

{#if visible.length > 0}
    <div class="toast-stack" role="region" aria-live="polite" aria-label="Notifications">
        {#each visible as t (t.id)}
            <div class="toast" data-kind={t.kind} role="status">
                <span class="toast-marker" aria-hidden="true"></span>
                <div class="toast-body">
                    <div class="toast-msg">{t.message}</div>
                    {#if t.detail}
                        <div class="toast-detail muted">{t.detail}</div>
                    {/if}
                </div>
                <button
                    class="toast-close"
                    onclick={() => dismissToast(t.id)}
                    aria-label="Dismiss notification"
                >×</button>
            </div>
        {/each}
    </div>
{/if}

<style>
    .toast-stack {
        position: fixed;
        left: 50%;
        bottom: max(80px, calc(var(--safe-bottom) + 80px));
        transform: translateX(-50%);
        z-index: 60;
        display: flex;
        flex-direction: column-reverse;
        gap: 0.35rem;
        width: min(440px, 92vw);
        pointer-events: none;
    }

    .toast {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 0.55rem;
        padding: 0.55rem 0.75rem;
        background: var(--card);
        border: 1px solid var(--line);
        border-left: 3px solid var(--muted);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        font-family: var(--font-ui);
        font-size: var(--t-sm);
        color: var(--ink);
        pointer-events: auto;
        animation: toast-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
    }

    .toast-marker {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: var(--muted);
        flex-shrink: 0;
    }
    .toast[data-kind='success'] { border-left-color: var(--good); }
    .toast[data-kind='success'] .toast-marker { background: var(--good); }
    .toast[data-kind='warning'] { border-left-color: var(--resolve); }
    .toast[data-kind='warning'] .toast-marker { background: var(--resolve); }
    .toast[data-kind='error'] {
        border-left-color: var(--hp);
        background: color-mix(in srgb, var(--card) 88%, var(--hp));
    }
    .toast[data-kind='error'] .toast-marker { background: var(--hp); }
    .toast[data-kind='info'] .toast-marker { background: var(--accent); }
    .toast[data-kind='info'] { border-left-color: var(--accent); }

    .toast-body { min-width: 0; }
    .toast-msg { font-weight: 500; line-height: 1.3; }
    .toast-detail {
        font-size: var(--t-xs);
        margin-top: 0.1rem;
        line-height: 1.35;
    }

    .toast-close {
        background: transparent;
        border: none;
        color: var(--muted);
        font-size: var(--t-base);
        line-height: 1;
        padding: 0 0.2rem;
        min-height: 28px;
        min-width: 28px;
        cursor: pointer;
        flex-shrink: 0;
    }
    .toast-close:hover { color: var(--ink); background: transparent; }

    @keyframes toast-in {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
