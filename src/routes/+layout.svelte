<script lang="ts">
    import '../app.css';
    import { onMount } from 'svelte';
    import { updated } from '$app/stores';

    let { children } = $props();

    onMount(() => {
        // When a newer deploy is detected (poll every 60s, see svelte.config), refresh so
        // installed iOS PWAs pick up the update automatically — no manual clearing. Game
        // state persists (server + IndexedDB), so the reload resumes seamlessly.
        const unsub = updated.subscribe((isStale) => {
            if (isStale) setTimeout(() => location.reload(), 800);
        });
        return unsub;
    });
</script>

{@render children()}
