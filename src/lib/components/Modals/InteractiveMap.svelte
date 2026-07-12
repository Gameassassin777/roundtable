<script lang="ts">
    type Location = {
        biome?: string;
        description?: string;
        exits?: string[];
        notes?: string;
    };

    type Props = {
        locations: Record<string, Location>;
        currentLocation: string;
    };

    let { locations, currentLocation }: Props = $props();

    let entries = $derived(Object.entries(locations || {}));
    let selected = $state<string | null>(null);
    let selectedEntry = $derived.by(() => {
        if (!selected) return null;
        return [selected, locations?.[selected] || {}] as [string, Location];
    });
</script>

{#if entries.length === 0}
    <p class="empty muted">No locations discovered yet. Travel the world to map it.</p>
{:else}
    <div class="map-layout">
        <div class="map-canvas">
            {#each entries as [name, loc], i}
                {@const angle = (i / entries.length) * Math.PI * 2}
                {@const radius = 38}
                {@const x = 50 + Math.cos(angle) * radius}
                {@const y = 50 + Math.sin(angle) * radius}
                <button
                    class="map-node"
                    class:current={name === currentLocation}
                    class:selected={name === selected}
                    style="left: {x}%; top: {y}%;"
                    onclick={() => (selected = selected === name ? null : name)}
                    title={name}
                >
                    <span class="node-dot">◍</span>
                    <span class="node-label">{name}</span>
                </button>
            {/each}
            {#if currentLocation}
                <div class="here-marker">You are here: {currentLocation}</div>
            {/if}
        </div>

        {#if selectedEntry}
            <aside class="detail-panel">
                <header>
                    <h4>{selectedEntry[0]}</h4>
                    <button class="btn-tiny btn-ghost" onclick={() => (selected = null)}>×</button>
                </header>
                {#if selectedEntry[1].biome}<div class="kv"><b>Biome</b> {selectedEntry[1].biome}</div>{/if}
                {#if selectedEntry[1].description}<p class="desc prose">{selectedEntry[1].description}</p>{/if}
                {#if Array.isArray(selectedEntry[1].exits) && selectedEntry[1].exits.length}
                    <div class="kv"><b>Exits</b> {selectedEntry[1].exits.join(' · ')}</div>
                {/if}
                {#if selectedEntry[1].notes}<p class="notes prose-italic muted">{selectedEntry[1].notes}</p>{/if}
            </aside>
        {:else}
            <aside class="detail-panel empty">
                <p class="muted">Tap a location to inspect it.</p>
            </aside>
        {/if}
    </div>
{/if}

<style>
    .empty {
        text-align: center;
        padding: 2rem 1rem;
        font-size: var(--t-sm);
    }
    .map-layout {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0.75rem;
    }
    @media (min-width: 600px) {
        .map-layout { grid-template-columns: 1fr 200px; }
    }
    .map-canvas {
        position: relative;
        aspect-ratio: 1.4 / 1;
        background: var(--inset);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        overflow: hidden;
    }
    .map-node {
        position: absolute;
        transform: translate(-50%, -50%);
        background: transparent;
        border: none;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.15rem;
        padding: 0.2rem;
    }
    .node-dot {
        font-size: 1.5rem;
        color: var(--muted);
        line-height: 1;
    }
    .map-node.current .node-dot { color: var(--accent); }
    .map-node.selected .node-dot { color: var(--gold); }
    .node-label {
        font-family: var(--font-display);
        font-size: var(--t-xs);
        font-weight: 600;
        color: var(--ink);
        background: var(--card);
        padding: 0.1rem 0.35rem;
        border-radius: var(--radius-sm);
        max-width: 100px;
        text-align: center;
        line-height: 1.2;
    }
    .here-marker {
        position: absolute;
        bottom: 0.5rem;
        left: 0.5rem;
        font-size: var(--t-xs);
        font-family: var(--font-display);
        color: var(--accent);
        background: var(--card);
        padding: 0.2rem 0.5rem;
        border-radius: var(--radius-sm);
        border: 1px solid var(--accent);
    }
    .detail-panel {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        padding: 0.7rem;
        font-size: var(--t-sm);
    }
    .detail-panel.empty {
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
    }
    .detail-panel header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 0.5rem;
    }
    .detail-panel h4 {
        font-family: var(--font-display);
        font-size: var(--t-sm);
        color: var(--ink);
        margin: 0;
    }
    .kv { font-size: var(--t-xs); margin: 0.25rem 0; color: var(--ink-soft); }
    .kv b { color: var(--muted); font-weight: 500; margin-right: 0.3rem; }
    .desc {
        font-size: var(--t-sm);
        line-height: 1.5;
        margin: 0.4rem 0;
        color: var(--ink);
    }
    .notes { font-size: var(--t-xs); margin-top: 0.4rem; }
</style>
