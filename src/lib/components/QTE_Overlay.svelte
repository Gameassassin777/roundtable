<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { gsap } from 'gsap';

    export let timeLimit: number;
    export let startTime: number; // Synced future timestamp
    export let onresult: (success: boolean) => void;
    
    let circle: SVGCircleElement;
    let overlayEl: HTMLDivElement;
    let active = false;
    let tl: gsap.core.Timeline | undefined;
    let mountTimer: ReturnType<typeof setTimeout>;

    onMount(() => {
        // Take focus so Enter/Space work without a manual tab mid-QTE.
        overlayEl?.focus();
        const delay = startTime - Date.now();
        mountTimer = setTimeout(() => {
            active = true;
            if (navigator.vibrate) navigator.vibrate(100);
            tl = gsap.timeline({ onComplete: () => failQTE() });
            tl.to(circle, { duration: timeLimit / 1000, attr: { r: 20, stroke: "#a04640" }, ease: "none" });
        }, Math.max(0, delay));
    });

    onDestroy(() => { clearTimeout(mountTimer); tl?.kill(); });

    function successQTE() {
        if (!active) return;
        active = false; tl?.kill();
        gsap.to('.qte-overlay', { duration: 0.3, opacity: 0, scale: 1.5, onComplete: () => onresult(true) });
    }
    function failQTE() { if (active) { active = false; onresult(false); } }
</script>

<div
    class="qte-overlay"
    role="button"
    tabindex="0"
    bind:this={overlayEl}
    onclick={successQTE}
    ontouchstart={successQTE}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && successQTE()}
>
    <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(224, 178, 99, 0.20)" stroke-width="4" />
        <circle bind:this={circle} cx="50" cy="50" r="40" fill="none" stroke="#e0b263" stroke-width="6" stroke-linecap="round" transform="rotate(-90 50 50)" />
    </svg>
    <h2>Dodge!</h2>
    <p>Tap to react</p>
</div>

<style>
    .qte-overlay {
        position: fixed; inset: 0;
        /* Deep ink, not parchment — the QTE interrupts a dark cinematic stage;
           a cream flashbang broke the film. Same scrim family as the bottom
           gradient so it reads as one camera. */
        background: radial-gradient(circle at center, rgba(8, 10, 12, 0.55) 0%, rgba(8, 10, 12, 0.82) 100%);
        backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        z-index: 100;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        cursor: pointer;
    }
    svg { width: 230px; height: 230px; filter: drop-shadow(0 0 22px rgba(224, 178, 99, 0.35)); }
    h2 {
        color: #f4efe3; font-size: 3.4rem; margin-top: 1.2rem;
        font-family: "Cinzel", Georgia, serif; letter-spacing: 0.06em;
        text-shadow: 0 2px 18px rgba(0, 0, 0, 0.6);
    }
    p { color: rgba(232, 224, 206, 0.72); font-size: 0.9rem; letter-spacing: 0.14em; margin-top: 0.3rem; text-transform: uppercase; }
</style>