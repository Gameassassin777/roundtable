<script lang="ts">
    import '../app.css';
    import { onMount } from 'svelte';
    import { dev } from '$app/environment';
    import { updated } from '$app/stores';

    let { children } = $props();

    onMount(() => {
        // Register service worker in production only to avoid HMR caching issues
        if ('serviceWorker' in navigator && !dev) {
            navigator.serviceWorker.register('/service-worker.js').catch(err => {
                console.error('Service worker registration failed:', err);
            });
        }
        
        // When a newer deploy is detected (poll every 60s, see svelte.config), refresh so
        // installed iOS PWAs pick up the update automatically — no manual clearing. Game
        // state persists (server + IndexedDB), so the reload resumes seamlessly.
        const unsub = updated.subscribe((isStale) => {
            if (isStale) setTimeout(() => location.reload(), 800);
        });

        // Belt-and-suspenders: when a new service worker takes control (e.g. after
        // skipWaiting + clients.claim), reload immediately so the page picks up the
        // new assets. Without this, iOS PWAs can run old JS under a new SW until the
        // next navigation.
        if ('serviceWorker' in navigator) {
            const onControllerChange = () => location.reload();
            navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
            return () => {
                unsub();
                navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
            };
        }
        return unsub;
    });
</script>

{@render children()}
