<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { gsap } from 'gsap';

    export let timeLimit: number;
    export let startTime: number; // Synced future timestamp
    export let onresult: (success: boolean) => void;
    
    let circle: SVGCircleElement;
    let active = false;
    let tl: gsap.core.Timeline;

    onMount(() => {
        const delay = startTime - Date.now();
        setTimeout(() => {
            active = true;
            if (navigator.vibrate) navigator.vibrate(100);
            tl = gsap.timeline({ onComplete: () => failQTE() });
            tl.to(circle, { duration: timeLimit / 1000, attr: { r: 20, stroke: "#ff0000" }, ease: "none" });
        }, Math.max(0, delay));
    });

    onDestroy(() => { tl?.kill(); });

    function successQTE() {
        if (!active) return;
        active = false; tl.kill();
        gsap.to('.qte-overlay', { duration: 0.3, opacity: 0, scale: 1.5, onComplete: () => onresult(true) });
    }
    function failQTE() { if (active) { active = false; onresult(false); } }
</script>

<div
    class="qte-overlay"
    role="button"
    tabindex="0"
    onclick={successQTE}
    ontouchstart={successQTE}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && successQTE()}
>
    <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(140,47,47,0.18)" stroke-width="4" />
        <circle bind:this={circle} cx="50" cy="50" r="40" fill="none" stroke="#8c2f2f" stroke-width="6" stroke-linecap="round" transform="rotate(-90 50 50)" />
    </svg>
    <h2>Dodge!</h2>
    <p>Tap to react</p>
</div>

<style>
    .qte-overlay {
        position: fixed; inset: 0;
        background: rgba(233, 224, 207, 0.82);
        backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        z-index: 100;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        cursor: pointer;
    }
    svg { width: 230px; height: 230px; filter: drop-shadow(0 6px 18px rgba(140, 47, 47, 0.28)); }
    h2 {
        color: #2c2621; font-size: 3.4rem; margin-top: 1.2rem;
        font-family: "Cinzel", Georgia, serif; letter-spacing: 1px;
    }
    p { color: #8a7c68; font-size: 0.9rem; letter-spacing: 1px; margin-top: 0.3rem; }
</style>