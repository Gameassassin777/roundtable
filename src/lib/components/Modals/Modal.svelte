<script lang="ts">
    type Props = {
        title: string;
        onClose: () => void;
        children: import('svelte').Snippet;
        width?: string;
    };

    let { title, onClose, children, width = '640px' }: Props = $props();

    function onKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') onClose();
    }
</script>

<svelte:window onkeydown={onKeydown} />

<div
    class="modal-backdrop"
    role="button"
    tabindex="-1"
    aria-label="Close modal"
    onclick={onClose}
>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="modal panel" role="document" tabindex="-1" onclick={(e) => e.stopPropagation()}>
        <header class="modal-head">
            <span class="head-eyebrow">Chapter</span>
            <h3 class="display">{title}</h3>
            <button class="close-btn" onclick={onClose} aria-label="Close">×</button>
        </header>
        <div class="modal-body">
            {@render children()}
        </div>
    </div>
</div>

<style>
    .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(40, 30, 20, 0.48);
        backdrop-filter: blur(3px);
        -webkit-backdrop-filter: blur(3px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 70;
        padding: 1rem;
        padding-top: max(1rem, var(--safe-top));
        padding-bottom: max(1rem, var(--safe-bottom));
        padding-left: max(1rem, var(--safe-left));
        padding-right: max(1rem, var(--safe-right));
        animation: backdrop-in 0.24s ease-out;
    }
    @keyframes backdrop-in { from { opacity: 0; } to { opacity: 1; } }

    .modal {
        width: min(640px, 94vw);
        max-height: 86vh;
        max-height: 86dvh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: modal-in 0.32s cubic-bezier(0.2, 0.7, 0.2, 1);
    }
    @keyframes modal-in {
        from { transform: translateY(12px) scale(0.98); opacity: 0; }
        to   { transform: translateY(0) scale(1); opacity: 1; }
    }

    .modal-head {
        padding: 0.75rem 1rem 0.65rem;
        border-bottom: 1px solid var(--gold-soft);
        flex-shrink: 0;
        position: relative;
        display: grid;
        grid-template-columns: 1fr auto;
        grid-template-rows: auto auto;
        gap: 0.1rem;
        align-items: center;
    }
    .head-eyebrow {
        grid-column: 1;
        grid-row: 1;
        font-family: var(--font-display);
        font-size: 9.5px;
        font-weight: 600;
        letter-spacing: 0.28em;
        color: var(--gold);
        text-transform: uppercase;
        opacity: 0.85;
    }
    .modal-head h3 {
        grid-column: 1;
        grid-row: 2;
        font-size: var(--t-lg);
        letter-spacing: 0.02em;
        color: var(--ink);
        line-height: 1.2;
    }
    .close-btn {
        grid-column: 2;
        grid-row: 1 / span 2;
        width: 44px;
        height: 44px;
        min-height: 44px;
        padding: 0;
        background: transparent;
        border: none;
        color: var(--muted);
        font-family: var(--font-display);
        font-size: 1.5rem;
        line-height: 1;
        cursor: pointer;
        align-self: center;
        transition: color 0.18s ease, transform 0.18s ease;
    }
    .close-btn:hover, .close-btn:focus-visible {
        color: var(--accent);
        transform: scale(1.08);
        outline: none;
    }

    .modal-body {
        padding: 0.95rem 1rem 1rem;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        flex: 1;
    }

    @media (prefers-reduced-motion: reduce) {
        .modal, .modal-backdrop { animation: none !important; }
    }
</style>
