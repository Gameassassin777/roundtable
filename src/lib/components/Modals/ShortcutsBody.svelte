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
        align-items: center;
        gap: 0.8rem;
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--gold-soft);
        font-size: var(--t-sm);
        min-height: 44px;
    }
    kbd {
        font-family: var(--font-display);
        font-size: var(--t-xs);
        font-weight: 600;
        background: var(--inset);
        border: 1px solid var(--gold-soft);
        border-radius: var(--radius-sm);
        padding: 0.2rem 0.5rem;
        color: var(--gold);
        min-width: 90px;
        text-align: center;
        flex-shrink: 0;
        letter-spacing: 0.06em;
    }
    .shortcuts-list span {
        font-family: var(--font-prose);
        color: var(--ink-soft);
        line-height: 1.5;
    }
    .tip {
        font-size: var(--t-xs);
        line-height: 1.5;
        font-family: var(--font-prose);
        font-style: italic;
        color: var(--ink-soft);
    }
</style>
