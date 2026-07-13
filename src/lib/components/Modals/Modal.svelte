<script lang="ts">
    type Props = {
        title: string;
        onClose: () => void;
        children: import('svelte').Snippet;
        width?: string;
    };

    let { title, onClose, children, width = '640px' }: Props = $props();
</script>

<div
    class="modal-backdrop"
    role="button"
    tabindex="-1"
    aria-label="Close modal"
    onclick={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="modal panel" role="document" tabindex="-1" onclick={(e) => e.stopPropagation()}>
        <header class="modal-head spread">
            <h3 class="display">{title}</h3>
            <button class="btn-tiny btn-ghost" onclick={onClose} aria-label="Close">×</button>
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
        background: rgba(40, 30, 20, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 70;
        padding: 1rem;
        padding-top: max(1rem, var(--safe-top));
        padding-bottom: max(1rem, var(--safe-bottom));
        padding-left: max(1rem, var(--safe-left));
        padding-right: max(1rem, var(--safe-right));
    }
    .modal {
        width: min(640px, 94vw);
        max-height: 86vh;
        max-height: 86dvh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    .modal-head {
        padding: 0.7rem 0.9rem;
        border-bottom: 1px solid var(--line);
        flex-shrink: 0;
    }
    .modal-head h3 {
        font-size: var(--t-base);
        letter-spacing: 0.04em;
    }
    .modal-body {
        padding: 0.9rem;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        flex: 1;
    }
</style>
