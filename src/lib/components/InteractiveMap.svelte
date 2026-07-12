<script lang="ts">
    import Modal from './Modal.svelte';

    let { 
        isOpen = false, 
        onClose, 
        locations = [],
        currentLocationName = ''
    } = $props<{
        isOpen: boolean;
        onClose: () => void;
        locations: any[];
        currentLocationName: string;
    }>();

    // A simple deterministic layout algorithm for the map.
    // We treat the current location as the center, and its exits as a ring around it, etc.
    let nodes = $derived.by(() => {
        const result: Record<string, { x: number, y: number, name: string, active: boolean, biome: string }> = {};
        
        if (!locations || locations.length === 0) return result;
        
        // Find center
        let centerLoc = locations.find((l: any) => l.name === currentLocationName) || locations[0];
        if (!centerLoc) return result;

        result[centerLoc.name] = { x: 250, y: 250, name: centerLoc.name, active: centerLoc.name === currentLocationName, biome: centerLoc.biome };

        let unplaced = locations.filter((l: any) => l.name !== centerLoc.name);
        let radius = 100;
        let ring = 1;

        while (unplaced.length > 0) {
            let placedInRing = 0;
            // take up to 6 for the first ring, 12 for the second, etc.
            let capacity = ring * 6;
            let currentBatch = unplaced.slice(0, capacity);
            unplaced = unplaced.slice(capacity);

            currentBatch.forEach((loc: any, i: number) => {
                const angle = (i / currentBatch.length) * Math.PI * 2;
                result[loc.name] = {
                    x: 250 + Math.cos(angle) * (radius * ring),
                    y: 250 + Math.sin(angle) * (radius * ring),
                    name: loc.name,
                    active: loc.name === currentLocationName,
                    biome: loc.biome
                };
            });
            ring++;
        }
        
        return result;
    });

    let links = $derived.by(() => {
        const lines: { x1: number, y1: number, x2: number, y2: number }[] = [];
        const seen = new Set<string>();

        locations.forEach((loc: any) => {
            const n1 = nodes[loc.name];
            if (!n1) return;

            (loc.exits || []).forEach((exitName: string) => {
                const n2 = nodes[exitName];
                if (!n2) return;
                
                // create a unique ID for the edge so we don't draw it twice
                const edgeId = [loc.name, exitName].sort().join('-');
                if (!seen.has(edgeId)) {
                    seen.add(edgeId);
                    lines.push({ x1: n1.x, y1: n1.y, x2: n2.x, y2: n2.y });
                }
            });
        });
        return lines;
    });

</script>

<Modal {isOpen} {onClose} title="World Map" customClass="map-modal">
    <div class="map-container">
        {#if locations.length === 0}
            <div class="empty-state">The map is blank. Travel to chart the world.</div>
        {:else}
            <svg viewBox="0 0 500 500" class="map-svg">
                <!-- Draw connections -->
                {#each links as link}
                    <line x1={link.x1} y1={link.y1} x2={link.x2} y2={link.y2} class="map-link" />
                {/each}

                <!-- Draw nodes -->
                {#each Object.values(nodes) as node}
                    <g transform="translate({node.x}, {node.y})" class="map-node {node.active ? 'active' : ''}">
                        <circle r="12" class="node-circle" />
                        <text y="24" class="node-label" text-anchor="middle">{node.name}</text>
                    </g>
                {/each}
            </svg>
        {/if}
    </div>
</Modal>

<style>
    .map-container {
        width: 100%;
        height: 400px;
        background: var(--bg-tint);
        border-radius: var(--radius-sm);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }
    .map-svg {
        width: 100%;
        height: 100%;
    }
    .map-link {
        stroke: var(--line-strong);
        stroke-width: 2;
        stroke-dasharray: 4 4;
    }
    .map-node .node-circle {
        fill: var(--surface-3);
        stroke: var(--muted);
        stroke-width: 2;
        transition: all 0.3s;
    }
    .map-node:hover .node-circle {
        fill: var(--accent);
        stroke: var(--accent-deep);
        cursor: pointer;
    }
    .map-node.active .node-circle {
        fill: var(--gold);
        stroke: #fff;
        stroke-width: 3;
    }
    .node-label {
        font-family: var(--font-sans);
        font-size: 11px;
        fill: var(--ink);
        pointer-events: none;
    }
    .empty-state {
        color: var(--muted);
        font-style: italic;
    }
</style>
