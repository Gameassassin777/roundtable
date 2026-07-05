<script lang="ts">
    import { createEventDispatcher, onMount, onDestroy } from 'svelte';
    import { gsap } from 'gsap';

    export let timeLimit: number;
    export let startTime: number; // Synced future timestamp
    
    const dispatch = createEventDispatcher();
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
        gsap.to('.qte-overlay', { duration: 0.3, opacity: 0, scale: 1.5, onComplete: () => dispatch('result', { success: true }) });
    }
    function failQTE() { if (active) { active = false; dispatch('result', { success: false }); } }
</script>

<div class="qte-overlay" on:click={successQTE} on:touchstart={successQTE}>
    <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="#333" stroke-width="4" />
        <circle bind:this={circle} cx="50" cy="50" r="40" fill="none" stroke="#fff" stroke-width="6" transform="rotate(-90 50 50)" />
    </svg>
    <h2>DODGE!</h2>
</div>

<style>
    .qte-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(15px); z-index: 100; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    svg { width: 240px; height: 240px; filter: drop-shadow(0 0 20px #8b0000); }
    h2 { color: #fff; font-size: 4rem; margin-top: 1rem; text-shadow: 0 0 30px #8b0000; }
</style>