<script lang="ts">
    const SHORTCUTS: Array<[string, string]> = [
        ['Enter', 'Send action (respects whisper toggle)'],
        ['Shift+Enter', 'Send as whisper, regardless of toggle'],
        ['↑ / ↓', 'Cycle session action history (in action field)'],
        ['Esc', 'Close any open overlay / popover'],
        ['?', 'This help (ignored while typing)']
    ];
</script>

<ul class="shortcuts-list">
    {#each SHORTCUTS as [key, label]}
        <li>
            <kbd>{key}</kbd>
            <span>{label}</span>
        </li>
    {/each}
</ul>
<p class="tip muted">
    Click NPC / faction / thread names in the Codex to inspect them. The Codex tab slides the
    sidebar up on mobile.
</p>

<style>
    .shortcuts-list {
        list-style: none;
        padding: 0;
        margin: 0 0 0.8rem 0;
    }
    .shortcuts-list li {
        display: flex;
        align-items: baseline;
        gap: 0.8rem;
        padding: 0.4rem 0;
        border-bottom: 1px solid var(--line-soft);
        font-size: var(--t-sm);
    }
    kbd {
        font-family: var(--font-display);
        font-size: var(--t-xs);
        font-weight: 600;
        background: var(--inset);
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        padding: 0.15rem 0.45rem;
        color: var(--ink);
        min-width: 90px;
        text-align: center;
        flex-shrink: 0;
    }
    .tip {
        font-size: var(--t-xs);
        line-height: 1.5;
        font-style: italic;
    }
</style>
