<script lang="ts">
    // Icon — the Round Table mark set. Stroke 1.5 on a 24 grid, currentColor,
    // round caps/joins. Replaces Unicode glyphs used as UI chrome (◈ ◷ × ↵ …)
    // with drawn marks that render identically on every platform.
    //
    // Usage: <Icon name="codex" /> — size in px, inherits color from context.
    type Props = {
        name:
            | 'menu' | 'codex' | 'map' | 'scroll' | 'star' | 'weave'
            | 'keyboard' | 'gear' | 'whisper' | 'send' | 'close' | 'search'
            | 'play' | 'pause' | 'clock' | 'copy';
        size?: number;
    };
    let { name, size = 18 }: Props = $props();
</script>

<svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="icon icon-{name}"
>
    {#if name === 'menu'}
        <!-- the table diamond: rotated square with a center ember -->
        <rect x="6.2" y="6.2" width="11.6" height="11.6" rx="1.2" transform="rotate(45 12 12)" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    {:else if name === 'codex'}
        <!-- open book -->
        <path d="M12 6.5c-1.8-1.6-4.4-2-8-1.5v13c3.6-.5 6.2-.1 8 1.5 1.8-1.6 4.4-2 8-1.5V5c-3.6-.5-6.2-.1-8 1.5Z" />
        <path d="M12 6.5v13" />
    {:else if name === 'map'}
        <!-- folded map with a route -->
        <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" />
        <path d="M9 4v14M15 6v14" />
        <path d="M6.5 12.5c2-1 3 1 5 0s3 1 5.5-.5" stroke-dasharray="1.5 2.2" />
    {:else if name === 'scroll'}
        <!-- curled scroll -->
        <path d="M7 4h10.5A2.5 2.5 0 0 1 20 6.5V7h-4.5" />
        <path d="M7 4a2.5 2.5 0 0 0-2.5 2.5V17a3 3 0 0 0 3 3h9a2.5 2.5 0 0 0 2.5-2.5V7" />
        <path d="M7 4a2.5 2.5 0 0 1 2.5 2.5V15" />
        <path d="M9.5 9.5h6M9.5 13h6" />
    {:else if name === 'star'}
        <!-- north star: four-point flare -->
        <path d="M12 3c.7 4.9 2.4 6.6 7.3 7.3-4.9.7-6.6 2.4-7.3 7.3-.7-4.9-2.4-6.6-7.3-7.3C9.6 9.6 11.3 7.9 12 3Z" />
        <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    {:else if name === 'weave'}
        <!-- two threads braided over-under -->
        <path d="M3 8c3.5 0 3.5 4 7 4s3.5-4 7-4" />
        <path d="M3 16c3.5 0 3.5-4 7-4s3.5 4 7 4" />
    {:else if name === 'keyboard'}
        <rect x="3" y="6.5" width="18" height="11" rx="2" />
        <path d="M7 10h1.2M11.4 10h1.2M15.8 10h1.2" />
        <path d="M8 14h8" />
    {:else if name === 'gear'}
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8" />
    {:else if name === 'whisper'}
        <!-- speech bubble with breath dots -->
        <path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4 19.5l1.5-4.3A7.5 7.5 0 1 1 20 11.5Z" />
        <path d="M8.5 11.5h.9M11.6 11.5h.9M14.7 11.5h.9" />
    {:else if name === 'send'}
        <!-- rising arrow: the action goes up into the world -->
        <path d="M12 20V5" />
        <path d="m5.5 11 6.5-6.5L18.5 11" />
    {:else if name === 'close'}
        <path d="m6 6 12 12M18 6 6 18" />
    {:else if name === 'search'}
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.3 15.3 4.7 4.7" />
    {:else if name === 'play'}
        <path d="M8 5.5v13l10-6.5-10-6.5Z" />
    {:else if name === 'pause'}
        <path d="M8.5 5.5v13M15.5 5.5v13" />
    {:else if name === 'clock'}
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5.2l3.4 2" />
    {:else if name === 'copy'}
        <rect x="9" y="9" width="12" height="12" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    {/if}
</svg>

<style>
    .icon {
        display: inline-block;
        vertical-align: -0.2em;
        flex-shrink: 0;
    }
</style>
