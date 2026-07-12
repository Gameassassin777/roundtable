<script lang="ts">
    import { type Snippet } from 'svelte';
    import { fade, fly } from 'svelte/transition';
    
    let { 
        isOpen = false, 
        title = '', 
        onClose, 
        children,
        customClass = ''
    } = $props<{
        isOpen: boolean;
        title?: string;
        onClose: () => void;
        children: Snippet;
        customClass?: string;
    }>();

    // Close on escape key
    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape' && isOpen) {
            onClose();
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-overlay" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }} transition:fade={{ duration: 200 }}>
        <div class="panel {customClass}" transition:fly={{ y: 20, duration: 300, opacity: 0 }}>
            <div class="drawer-head">
                {#if title}<h2>{title}</h2>{/if}
                <button class="btn-ghost" onclick={onClose}>Close</button>
            </div>
            <div class="drawer-body">
                {@render children()}
            </div>
        </div>
    </div>
{/if}

<style>
    .modal-overlay {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.6);
        z-index: 1000;
        display: flex; justify-content: center; align-items: center;
        padding: 1rem;
        backdrop-filter: blur(4px);
    }
    .panel {
        width: 100%; max-width: 500px;
        max-height: 85vh;
        display: flex; flex-direction: column;
        border-radius: var(--radius);
        overflow: hidden;
    }
    .drawer-head {
        display: flex; justify-content: space-between; align-items: center;
        padding: 1rem 1.5rem;
        border-bottom: 1px solid var(--line);
        background: var(--surface-2);
    }
    .drawer-head h2 { font-size: 1.25rem; font-weight: 600; margin: 0; }
    .drawer-body {
        padding: 1.5rem;
        overflow-y: auto;
        color: var(--ink);
    }
    .btn-ghost {
        background: transparent;
        border: 1px solid var(--line-strong);
        color: var(--ink-soft);
        padding: 0.4rem 0.8rem;
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all 0.2s;
    }
    .btn-ghost:hover {
        background: var(--surface-3);
        color: var(--ink);
    }
</style>
