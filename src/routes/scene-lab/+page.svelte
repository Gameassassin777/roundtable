<script lang="ts">
    // TEMPORARY scene lab for visual stress-testing. NOT part of the app.
    // Usage: /scene-lab/?tags=<url-encoded JSON SceneTags>
    import CinematicDiorama from '$lib/components/CinematicDiorama.svelte';
    import type { SceneTags } from '$lib/engine/scenePalette';

    const fallback: SceneTags = { biome: 'crossroads', weather: 'clear', mood: 'calm', time_of_day: 'day' };
    // Parse once at init (SSR is off; window exists). No effect loop.
    const q = new URLSearchParams(window.location.search).get('tags');
    let tags: SceneTags = fallback;
    try { if (q) tags = JSON.parse(q); } catch { /* keep fallback */ }
    const label = tags.location || tags.biomeRaw || tags.biome || '';
</script>

<CinematicDiorama sceneTags={tags} />
<div class="lab-label">{label}</div>

<style>
    .lab-label {
        position: fixed;
        top: 12px;
        left: 12px;
        z-index: 50;
        color: #fff;
        background: rgba(0, 0, 0, 0.55);
        font: 600 13px/1.3 system-ui;
        padding: 6px 10px;
        border-radius: 6px;
        pointer-events: none;
    }
</style>
