<script lang="ts">
    import '../app.css';
    import { onMount } from 'svelte';
    import { dev, version } from '$app/environment';
    import { updated } from '$app/stores';
    import { base } from '$app/paths';

    let { children } = $props();

    let isStale = $state(false);
    let swState = $state('');

    onMount(() => {
        // Register service worker in production only to avoid HMR caching issues
        if ('serviceWorker' in navigator && !dev) {
            navigator.serviceWorker.register(`${base}/service-worker.js`).then((reg) => {
                if (reg.waiting) {
                    swState = 'update-ready';
                }
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    if (newWorker) {
                        swState = 'downloading';
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed') {
                                swState = 'update-ready';
                            }
                        });
                    }
                });
            }).catch(err => {
                console.error('Service worker registration failed:', err);
            });
        }
        
        // When a newer deploy is detected (poll every 60s, see svelte.config), refresh so
        // installed iOS PWAs pick up the update automatically — no manual clearing. Game
        // state persists (server + IndexedDB), so the reload resumes seamlessly.
        const unsub = updated.subscribe((stale) => {
            isStale = stale;
            if (stale) {
                swState = 'update-ready';
            }
        });

        // Belt-and-suspenders: when a new service worker takes control (e.g. after
        // skipWaiting + clients.claim), reload immediately so the page picks up the
        // new assets. Without this, iOS PWAs can run old JS under a new SW until the
        // next navigation.
        //
        // BUT: controllerchange also fires on FIRST install (the SW claims the
        // page ~10s in). The page already runs the assets it just downloaded —
        // reloading then just wipes in-progress onboarding (the new player taps
        // "Enter a New World" and the app restarts under them). Only reload when
        // control changes from an OLD worker (hadController at load) or when we
        // explicitly asked a waiting update to take over (expectSWTakeover).
        if ('serviceWorker' in navigator) {
            const hadController = !!navigator.serviceWorker.controller;
            const onControllerChange = () => {
                if (!hadController && !expectSWTakeover) return;   // first install
                swState = 'activating';
                setTimeout(() => location.reload(), 300);
            };
            navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
            return () => {
                unsub();
                navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
            };
        }
        return unsub;
    });

    let expectSWTakeover = false;

    async function triggerSWUpdate() {
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs) {
                if (r.waiting) {
                    expectSWTakeover = true;   // we asked the update to take over — reload when it does
                    r.waiting.postMessage({ type: 'SKIP_WAITING' });
                } else {
                    // fallback reload if no waiting SW is registered but SvelteKit's updated store flipped
                    location.reload();
                }
            }
            if (regs.length === 0) {
                location.reload();
            }
        } else {
            location.reload();
        }
    }
</script>

{#if isStale || swState}
    <div class="update-indicator-bar" role="status" aria-live="polite">
        <span class="version-badge">Build {version}</span>
        <span class="status-msg">
            {#if swState === 'downloading'}
                Downloading world update…
            {:else if swState === 'update-ready' || isStale}
                New update ready. <button type="button" class="update-trigger-btn" onclick={triggerSWUpdate}>Reload & Apply</button>
            {:else if swState === 'activating'}
                Applying update…
            {:else}
                Checking for updates…
            {/if}
        </span>
    </div>
{/if}

{@render children()}

<style>
    .update-indicator-bar {
        position: fixed;
        top: 0; left: 0; right: 0;
        height: calc(34px + var(--safe-top, 0px));
        padding-top: var(--safe-top, 0px);
        background: var(--accent);
        color: #fdf6ec;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.8rem;
        font-family: var(--font-ui);
        font-size: var(--t-xs);
        font-weight: 500;
        z-index: 9999;
        box-shadow: 0 2px 8px rgba(60, 40, 20, 0.16);
        border-bottom: 1px solid var(--gold);
        animation: bar-slide-down 0.3s cubic-bezier(0.2, 0.7, 0.2, 1);
    }

    @keyframes bar-slide-down {
        from { transform: translateY(-100%); }
        to { transform: translateY(0); }
    }

    .version-badge {
        background: rgba(255, 255, 255, 0.15);
        padding: 0.15rem 0.45rem;
        border-radius: var(--radius-sm);
        border: 1px solid rgba(255, 255, 255, 0.25);
        font-family: var(--font-display);
        font-size: 10px;
        letter-spacing: 0.05em;
    }

    .status-msg {
        display: flex;
        align-items: center;
        gap: 0.45rem;
    }

    .update-trigger-btn {
        background: var(--card);
        color: var(--accent-deep);
        border: 1px solid var(--line);
        padding: 0.15rem 0.6rem;
        font-size: 10px;
        font-weight: 600;
        border-radius: var(--radius-sm);
        min-height: 24px;
        line-height: 1;
        cursor: pointer;
        transition: background 0.15s ease, transform 0.06s;
    }

    .update-trigger-btn:hover {
        background: #fff;
    }

    .update-trigger-btn:active {
        transform: scale(0.96);
    }
</style>
