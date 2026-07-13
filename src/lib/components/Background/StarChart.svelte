<script lang="ts">
    // Star-chart layer — slowly rotating constellation behind the title.
    // For returning heroes, primary points are seeded from character name +
    // locations they've visited (passed in as prop). For new players, the
    // seed alone shapes the chart. Brightest stars get connected by hairlines.
    // Opacity is intentionally low — this is atmosphere, not foreground.

    type Loc = { name: string };

    type Props = {
        locations?: Loc[];
        seed?: string;
    };
    let { locations = [], seed = 'roundtable' }: Props = $props();

    type Star = { x: number; y: number; r: number; opacity: number };

    function hashStr(s: string): number {
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function makeRng(seedNum: number): () => number {
        let s = seedNum;
        return () => {
            s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d);
            s = Math.imul(s ^ (s >>> 12), 0x297a2d39);
            s = (s ^ (s >>> 15)) >>> 0;
            return s / 4294967296;
        };
    }

    let stars = $derived.by(() => {
        const out: Star[] = [];
        const baseSeed = locations.length > 0
            ? hashStr(locations.map((l) => l.name).join(','))
            : hashStr(seed);
        const r = makeRng(baseSeed);

        if (locations.length > 0) {
            // Each location gets a "primary" star — bigger, brighter
            locations.forEach(() => {
                out.push({
                    x: 6 + r() * 88,
                    y: 6 + r() * 88,
                    r: 0.5 + r() * 0.4,
                    opacity: 0.85 + r() * 0.15,
                });
            });
            // Background scatter
            for (let i = 0; i < 70; i++) {
                out.push({
                    x: r() * 100,
                    y: r() * 100,
                    r: 0.15 + r() * 0.25,
                    opacity: 0.3 + r() * 0.4,
                });
            }
        } else {
            for (let i = 0; i < 90; i++) {
                out.push({
                    x: r() * 100,
                    y: r() * 100,
                    r: 0.2 + r() * 0.5,
                    opacity: 0.4 + r() * 0.5,
                });
            }
        }
        return out;
    });

    // Constellation lines: connect nearest-neighbor bright stars
    let lines = $derived.by(() => {
        const bright = stars.filter((s) => s.r > 0.4).slice(0, 8);
        const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
        for (let i = 0; i < bright.length - 1; i++) {
            if (i % 2 === 0) {
                out.push({
                    x1: bright[i].x, y1: bright[i].y,
                    x2: bright[i + 1].x, y2: bright[i + 1].y,
                });
            }
        }
        return out;
    });
</script>

<svg class="star-chart" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <g class="chart-rotate">
        {#each lines as ln}
            <line
                x1={ln.x1} y1={ln.y1}
                x2={ln.x2} y2={ln.y2}
                stroke="var(--gold)"
                stroke-width="0.06"
                opacity="0.35"
            />
        {/each}
        {#each stars as s}
            <circle
                cx={s.x}
                cy={s.y}
                r={s.r}
                fill="var(--gold)"
                opacity={s.opacity}
            />
        {/each}
    </g>
</svg>

<style>
    .star-chart {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 1;
        opacity: 0.16;
        pointer-events: none;
    }
    .chart-rotate {
        transform-origin: 50% 50%;
        animation: chart-rotate 240s linear infinite;
    }
    @keyframes chart-rotate {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    @media (prefers-reduced-motion: reduce) {
        .chart-rotate { animation: none; }
    }
</style>
