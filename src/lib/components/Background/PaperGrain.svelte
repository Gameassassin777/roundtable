<script lang="ts">
    // Fixed-position paper texture overlay. SVG fractal noise at ~3% opacity.
    // pointer-events: none so it never intercepts clicks. One decorative layer
    // for the whole app — cheaper than per-panel textures.
</script>

<div class="paper-grain" aria-hidden="true"></div>

<style>
    .paper-grain {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 1;
        opacity: 0.035;
        background-image: url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
        background-size: 200px 200px;
        mix-blend-mode: multiply;
    }
</style>
