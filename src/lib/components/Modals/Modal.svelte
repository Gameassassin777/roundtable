<script lang="ts">
    import { onMount } from 'svelte';
    import { playHover, playClick } from '$lib/audio/ambient';
    import Icon from '$lib/components/Icon.svelte';

    type Props = {
        title: string;
        eyebrow?: string;
        onClose: () => void;
        children: import('svelte').Snippet;
        width?: string;
    };

    let { title, eyebrow = 'Chapter', onClose, children, width = '640px' }: Props = $props();

    let panelEl: HTMLElement;
    onMount(() => {
        // Move focus inside so Tab starts here instead of the obscured page.
        panelEl?.focus();
    });

    function onKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') onClose();
        if (e.key === 'Tab' && panelEl) {
            // Minimal focus trap: wrap at both ends of the panel's focusables.
            const items = panelEl.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement;
            if (e.shiftKey && (active === first || !panelEl.contains(active))) {
                last.focus(); e.preventDefault();
            } else if (!e.shiftKey && (active === last || !panelEl.contains(active))) {
                first.focus(); e.preventDefault();
            }
        }
    }
</script>

<svelte:window onkeydown={onKeydown} />

<div
    class="modal-backdrop"
    role="button"
    tabindex="-1"
    aria-label="Close modal"
    onclick={() => { playClick(); onClose(); }}
>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="modal panel diegetic-frame film-surface" style="width: min({width}, 94vw)" role="document" tabindex="-1" bind:this={panelEl} onclick={(e) => e.stopPropagation()}>
        <header class="modal-head">
            <span class="head-eyebrow">{eyebrow}</span>
            <h3 class="display">{title}</h3>
            <button class="close-btn" onclick={() => { playClick(); onClose(); }} onmouseenter={() => playHover()} aria-label="Close"><Icon name="close" size={17} /></button>
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
        border-radius: var(--radius-modal);
        animation: modal-in 0.32s var(--ease-out-soft);
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
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        color: var(--muted);
        cursor: pointer;
        align-self: center;
        transition: color 0.22s ease, transform 0.25s var(--ease-out-soft);
    }
    .close-btn:hover, .close-btn:focus-visible {
        color: var(--accent);
        transform: rotate(90deg) scale(1.15);
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
